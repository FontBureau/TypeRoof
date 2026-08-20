/* jshint esversion:6, browser: true */
/**
 * Font container decompression and font metadata extraction based on
 * harfbuzzjs (v1.x), replacing opentype.js.
 *
 * Only the opentype.js fork's woffToOTF is still used: HarfBuzz cannot
 * read woff (and woff2 is handled by wawoff2).
 *
 * createFontObject() intentionally returns an object that mimics the
 * opentype.js Font shape — but only the surface TypeRoof consumes
 * (names, fvar axes/instances, GSUB/GPOS script/feature lists, cmap
 * glyphIndexMap, unitsPerEm/ascender/descender). Consumers keep reading
 * e.g. `font.fontObject.tables.fvar.axes` unchanged.
 *
 * Divergence from opentype.js: the `names` table is not split into
 * platform buckets (unicode/macintosh/windows) — HarfBuzz abstracts
 * platforms/encodings away. The facade fills the `windows` bucket only;
 * all current consumers use `?.` fallback chains, which stay functional.
 *
 * Dependencies: only lib/js/vendor/** — must NOT import from
 * lib/js/components, so the legacy app can reuse this module.
 */

// This is the ONLY remaining use of the opentype.js (graphicore fork)
// submodule: HarfBuzz can not decompress woff.
import {woffToOTF} from './vendor/opentype.js/dist/opentype.mjs';
import {getDecompressSync} from './vendor/wawoff2/decompress.mjs';

// Module-level, as woff2decompress was in shell.mjs before.
const woff2decompress = await getDecompressSync();

// nameID (OpenType name table) to opentype.js names-key, for the keys
// TypeRoof uses.
const NAME_ID_TO_KEY = new Map([
    [0, 'copyright']
  , [1, 'fontFamily']
  , [2, 'fontSubfamily']
  , [3, 'uniqueID']
  , [4, 'fullName']
  , [5, 'version']
  , [6, 'postScriptName']
  , [7, 'trademark']
  , [8, 'manufacturer']
  , [9, 'designer']
  , [11, 'manufacturerURL']
  , [12, 'designerURL']
  , [13, 'license']
  , [14, 'licenseURL']
  , [16, 'preferredFamily']
  , [17, 'preferredSubfamily']
  , [18, 'compatibleFullName']
  , [19, 'sampleText']
]);

// For getLanguageFeatureTags: query the default LangSys of a script.
// HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX (hb_language_index_t is uint16,
// 0xFFFFu == Index::NOT_FOUND_INDEX).
const DEFAULT_LANGSYS_INDEX = 0xFFFF;

// Replaces opentype._parse.getTag (4-byte ASCII signature sniffing).
function _getSignatureTag(fontBuffer) {
    return new TextDecoder().decode(new Uint8Array(fontBuffer, 0, 4));
}

/**
 * woff/woff2 → SFNT (TTF/OTF); SFNT passes through unchanged.
 * Returns the (possibly newly allocated) SFNT ArrayBuffer.
 */
export function decompressFontBuffer(fontBuffer) {
    const signature = _getSignatureTag(fontBuffer);
    if(signature === 'wOFF')
        // Uncompressing woff directly here, as harfbuzz does not support
        // woff. Kept from the opentype.js fork.
        return woffToOTF(fontBuffer);
    if(signature === 'wOF2') {
        const ttfFontBufferView = woff2decompress(fontBuffer);
        return ttfFontBufferView.buffer.slice(
            ttfFontBufferView.byteOffset,
            ttfFontBufferView.byteLength + ttfFontBufferView.byteOffset
        );
    }
    return fontBuffer;
}

function _getFirstNameValue(entry) {
    for(const lang of Object.keys(entry))
        return entry[lang];
}

/**
 * Build the facade's `names` object: {key: {language: value}}.
 * Exposed as the `windows` bucket (see module docstring).
 */
function _collectNames(hbFace) {
    const names = {};
    for(const {nameId, language} of hbFace.listNames()) {
        const key = NAME_ID_TO_KEY.get(nameId);
        if(key === undefined)
            continue;
        // hb_ot_name_get_utf16 returns null-ish on missing entries;
        // empty values are not useful for the consumers.
        const value = hbFace.getName(nameId, language);
        if(!value)
            continue;
        if(!(key in names))
            names[key] = {};
        if(!(language in names[key]))
            names[key][language] = value;
    }
    return names;
}

/**
 * NOTE: harfbuzzjs does not (yet) bind hb_ot_var_named_instance_*;
 * if that API lands upstream (a binding PR would be welcome), prefer
 * it over this parser.
 *
 * fvar table layout (OpenType spec):
 *   uint16 majorVersion, minorVersion
 *   uint16 axesArrayOffset, uint16 reserved (countSizePairs!)
 *   uint16 axisCount, axisSize, instanceCount, instanceSize
 * Instance records start after the axes array:
 *   axesArrayOffset + axisCount * axisSize
 *   (NOTE: the spec's "reserved"/countSizePairs header field is
 *    unreliable in real fonts — RobotoFlex has 2 while the actual
 *    instances follow the axes directly. Computing the offset from the
 *    axes array matches what fontTools/opentype.js do.)
 * Instance record (as parsed in the wild, e.g. by opentype.js):
 *   uint16 subfamilyNameID, uint16 flags   (spec says uint32+uint16,
 *    real fonts write uint16 nameID + uint16 flags)
 *   Fixed coordinates[axisCount] (Fixed = int32 / 65536)
 */
function _parseFvarInstances(fvarBytes, axesArrayEnd) {
    const view = new DataView(fvarBytes.buffer, fvarBytes.byteOffset, fvarBytes.byteLength)
      , axisCount = view.getUint16(8)
      , instanceCount = view.getUint16(12)
      , instances = []
      ;
    for(let i=0; i<instanceCount; i++) {
        const offset = axesArrayEnd + i * (4 + 4 * axisCount);
        if(offset + 4 + 4 * axisCount > fvarBytes.byteLength)
            break; // defensive: malformed table
        const subfamilyNameID = view.getUint16(offset)
          , coordinates = new Float64Array(axisCount)
          ;
        for(let a=0; a<axisCount; a++)
            coordinates[a] = view.getInt32(offset + 4 + 4 * a) / 65536;
        instances.push([subfamilyNameID, coordinates]);
    }
    return instances;
}

function _getFvar(hbFace) {
    const axisInfos = hbFace.getAxisInfos();
    if(!Object.keys(axisInfos).length)
        return undefined; // not a variable font
    const axisTags = Object.keys(axisInfos)
      , axes = []
      , instances = []
      ;
    for(const [tag, info] of Object.entries(axisInfos)) {
        axes.push({
            tag
          , name: {en: hbFace.getName(info.nameId, 'en') || tag}
            // harfbuzzjs v1.x AxisInfo: {min, default, max}
          , minValue: info.min
          , maxValue: info.max
          , defaultValue: info.default
        });
    }
    // A static font can (rarely) report axis infos with undefined
    // metrics; only variable fonts have an fvar table.
    const fvarBytes = hbFace.referenceTable('fvar');
    if(!fvarBytes)
        return undefined; // not a variable font
    const fvarView = new DataView(fvarBytes.buffer, fvarBytes.byteOffset, fvarBytes.byteLength)
      , axesArrayEnd = fvarView.getUint16(4) + fvarView.getUint16(8) * fvarView.getUint16(10)
      ;
    for(const [subfamilyNameID, coordinates] of _parseFvarInstances(fvarBytes, axesArrayEnd)) {
        const coordinatesByTag = {};
        for(const [a, tag] of axisTags.entries())
            coordinatesByTag[tag] = coordinates[a];
        instances.push({
            name: {en: hbFace.getName(subfamilyNameID, 'en') || `Instance ${subfamilyNameID}`}
          , coordinates: coordinatesByTag
        });
    }
    return {axes, instances};
}

// For ssXX/cvXX features: the UI label, equivalent to opentype.js
// feature.uiName (parsed from feature params by opentype.js).
function _getFeatureUIName(hbFace, tableTag, featureIndex) {
    const nameIds = hbFace.getFeatureNameIds(tableTag, featureIndex);
    if(!nameIds || nameIds.uiLabelNameId === undefined)
        return undefined;
    const label = hbFace.getName(nameIds.uiLabelNameId, 'en');
    return label ? {en: label} : undefined;
}

/**
 * Build {scripts, features} for one layout table, mimicking the
 * opentype.js tables.gsub/tables.gpos structure as consumed by
 * _getFontFeaturesInfo (model/font.mjs) and the legacy
 * OTFeaturesChooser.
 */
function _getLayoutTable(hb, hbFace, tableTag /* 'GSUB'|'GPOS' */) {
    // NOTE: getTableFeatureTags may contain duplicate tags (fonts may
    // have several FeatureRecords with the same tag); consumers dedup
    // by tag, mapping to the first index (indexOf) is sufficient.
    const featureTags = hbFace.getTableFeatureTags(tableTag)
      , features = featureTags.map((tag, featureIndex) => {
            const entry = {tag, feature: {}};
            if(tag.startsWith('ss') || tag.startsWith('cv')) {
                const uiName = _getFeatureUIName(hbFace, tableTag, featureIndex);
                if(uiName)
                    entry.feature.uiName = uiName;
            }
            return entry;
        })
      , scripts = []
      , toIndexes = tags => tags.map(tag => featureTags.indexOf(tag))
      ;
    for(const [scriptIndex, scriptTag] of hbFace.getTableScriptTags(tableTag).entries()) {
        const script = {defaultLangSys: null, langSysRecords: []}
          , defaultFeatureTags = hbFace.getLanguageFeatureTags(tableTag, scriptIndex, DEFAULT_LANGSYS_INDEX)
          ;
        if(defaultFeatureTags.length)
            script.defaultLangSys = {featureIndexes: toIndexes(defaultFeatureTags)};
        for(const [langIndex, langTag] of hbFace.getScriptLanguageTags(tableTag, scriptIndex).entries()) {
            script.langSysRecords.push({
                tag: langTag
              , langSys: {featureIndexes: toIndexes(
                    hbFace.getLanguageFeatureTags(tableTag, scriptIndex, langIndex))}
            });
        }
        scripts.push({tag: scriptTag, script});
    }
    return {scripts, features};
}

function _getCmapGlyphIndexMap(hbFont, hbFace) {
    const glyphIndexMap = {};
    for(const codePoint of hbFace.collectUnicodes())
        glyphIndexMap[codePoint] = hbFont.nominalGlyph(codePoint) ?? 0;
    return glyphIndexMap;
}

/**
 * Build an opentype.js-shaped font facade from a HarfBuzz face.
 *
 * @param {Object} hb - harfbuzzjs v1.x module namespace
 * @param {ArrayBuffer} sfntBuffer - decompressed TTF/OTF data
 *   (use decompressFontBuffer first for woff/woff2)
 */
export function createFontObject(hb, sfntBuffer) {
    const hbBlob = new hb.Blob(sfntBuffer)
      , hbFace = new hb.Face(hbBlob, 0)
      , hbFont = new hb.Font(hbFace)
      // scale defaults to upem => font units, same semantics as
      // opentype.js fontObject.ascender/descender (hhea values)
      , {ascender, descender} = hbFont.hExtents()
      , names = _collectNames(hbFace)
      , tables = {}
      ;
    const fvar = _getFvar(hbFace);
    if(fvar)
        tables.fvar = fvar;
    tables.gsub = _getLayoutTable(hb, hbFace, 'GSUB');
    tables.gpos = _getLayoutTable(hb, hbFace, 'GPOS');
    tables.cmap = {glyphIndexMap: _getCmapGlyphIndexMap(hbFont, hbFace)};

    return {
        // opentype.js getEnglishName: windows bucket, 'en' language,
        // else the first available language entry.
        getEnglishName(key) {
            const entry = names[key];
            if(!entry)
                return undefined;
            return entry.en ?? _getFirstNameValue(entry);
        }
        // See module docstring: only the windows bucket is populated.
      , names: {windows: names}
      , tables
      , unitsPerEm: hbFace.upem
      , ascender
      , descender
    };
}
