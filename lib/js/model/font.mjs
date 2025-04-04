/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

import { deepFreeze } from '../util.mjs';

// could be a getter in VideproofFont
// as well as  return font.tables?.fvar?.axes || []
function _getFontAxisRanges(font) {
    let axisRanges = {}
      , axes = font.tables?.fvar?.axes
      ;
    if (!axes)
        return axisRanges;
    for (let axis of axes) {
        axisRanges[axis.tag] = Object.freeze({
            'name': 'name' in axis ? axis.name.en : axis.tag,
            'min': axis.minValue,
            'max': axis.maxValue,
            'default': axis.defaultValue
        });
    }
    return axisRanges;
}

/**
 * Handy table, though so far it seems we only need the
 * first column for the src property of the @font-face rule
 *
 *   @font-face src 'format("{TYPE}");' |
 * | typical file name extension
 * | MIME Type
 * | full format name
 * -------- | ------ | ---------- | ----------
 * truetype | .ttf   | font/ttf   | TrueType
 * opentype | .otf   | font/otf   | OpenType
 * woff     | .woff  | font/woff  | Web Open Font Format
 * woff2    | .woff2 | font/woff2 | Web Open Font Format 2
 */
function getSrcFormatFromFileName(filenName) {
    let extension = filenName.split('.').pop()
      , result = ({
            ttf: 'truetype'
          , otf: 'opentype'
          , woff: 'woff'
          , woff2: 'woff2'
        })[extension]
      ;
    if(!result)
        throw new Error(`FORMAT NOT FOUND for "${filenName}" with extension "${extension}"`);
    return result;
}

// used as part of the font family (CSS) name, so we always can differentiate
// the source of the font.
export class FontOrigin {
    valueOf() {
        throw new Error(`NOT IMPLEMENTED: "valueOf" in ${this.constructor.name}`);
    }
    toString() {
        return `[${this.constructor.name} ${this.valueOf()}]`
    }
    get type () {
        throw new Error(`NOT IMPLEMENTED: "get type" in ${this.constructor.name}`);
    }
    get payload () {
        throw new Error(`NOT IMPLEMENTED: "get payload" in ${this.constructor.name}`);
    }
    get fileName() {
        throw new Error(`NOT IMPLEMENTED: "get fileName" in ${this.constructor.name}`);
    }
    get sourceFormat() {
        return getSrcFormatFromFileName(this.fileName);
    }
    toDB() {
        return [this.type, this.payload];
    }
    static fromDB([type, payload]) {
        const Constructor = {
            'from-url': FontOriginUrl
          , 'from-file': FontOriginFile
        }[type];
        return new Constructor(payload, true);
    }
}

// Font origin for fonts loaded by URL, using a GET request. commonly
// the fonts that are built into the app and registerd in window.remoteResources.
export class FontOriginUrl extends FontOrigin {
    constructor(url, fromDB=false) {
        super();
         Object.defineProperties(this, {
            type: {value: 'from-url', writable: false, enumerable: true}
          , url: {value: url, writable: false, enumerable: true}
          , fromDB: {value: fromDB, writable: false, enumerable: true}
        });
    }
    get fileName() {
        // CAUTION: simple split on "/" may not be sufficient!
        return this.url.split('/').pop();
    }
    get payload() {
        return this.url;
    }
    valueOf() {
        return `${this.type}::${this.url}`;
    }
}

export class FontOriginFile extends FontOrigin {
    constructor(fileName, fromDB=false) {
        super();
        Object.defineProperties(this, {
            type: {value: 'from-file', writable: false, enumerable: true}
          , fileName: {value: fileName, writable: false, enumerable: true}
          , fromDB: {value: fromDB, writable: false, enumerable: true}
        });
    }
    get payload() {
        return this.fileName;
    }
    valueOf() {
        return `${this.type}::${this.fileName}`;
    }
}

// To keep all knowledge and resources of a font in one place.
export class VideoProofFont {
    constructor(widgetBus, fontObject, origin, buffer=null, fontFace=null, document=null, fullName=null) {
        this._document = document;
        this._widgetBus = widgetBus;
        Object.defineProperties(this, {
            fontObject: {value: fontObject, writable: false, enumerable: true}
          , fontFace: {value: fontFace, writable: false, enumerable: true}
          , buffer: {value: buffer, writable: false, enumerable: true}
          , origin: {value: origin, writable: false, enumerable: true}
        });
        if(fullName)
            // Override the getter, this property acts as primary key,
            // make sure it stays intact.
            Object.defineProperty(this, 'fullName', {value: fullName, writable: false, enumerable: true});
        this._axisRangesCache = null;
        this._instancesCache = null;
        this._hbCache = null;

        console.info('...created VideoProofFont',
            `\n    {name: "${this.name}", version: "${this.version}", fullName: "${this.fullName}"}\n origin: ${this.origin}`
            /*, '\n    instance:', this*/);
    }

    _getNameEntry(key_, ...fallBacks) {
        for(const key of [key_, ...fallBacks]) {
            // default to "en"
            let name = this.fontObject.getEnglishName(key)
            //  , defaultLang = 'en'
              ;
            if(name)
                return name;
            const entry = (this.fontObject.names.unicode?.[key]
                    || this.fontObject.names.macintosh?.[key]
                    || this.fontObject.names.windows?.[key])
                    ;
            // Otherwise, just return the entry of the first key.

            if(entry && typeof entry === 'object')
                for(let lang of Object.keys(entry))
                    return entry[lang];
        }
        throw new Error(`KEY ERROR name "${key_}" and fall-back keys "${fallBacks.join(', ')}" not found in font.`);
    }

    get name() {
        return this._getNameEntry('fullName', 'fontFamily', 'postScriptName');
    }

    get version() {
        return this._getNameEntry('version');
    }

    static nameVersion(name, version){
        return [
                 name // e.g. "RobotoFlex Regular"
                 // "Version 2.136" is not accepted here while
                 // "Version_2-136" is OK, seems like the "." (dot)
                 // is forbidden and the space before numbers as well.
                 // It's likely this needs more fixing in the future!
               , version
               ].join(' – ');
    }

    get nameVersion() {
        return this.constructor.nameVersion(this.name, this.version);
    }

    // For display purposes so we dont get [object Object].
    toString() {
        return `[Font ${this.nameVersion}]`;
    }

    static massageVersion(rawVersion) {
        // getting sometimes
        //      DOMException: FontFace.family setter: Invalid font descriptor
        //
        // A well working example is: "from-url RobotoFlex Regular Version_2-136"

        // "Version 2.136" is not accepted here while
        // "Version_2-136" is OK, seems like the "." (dot)
        // is forbidden and the space before numbers as well.
        //
        // "27.0d21e1" becomes "27-0d21e1" but it's not accepted as the
        // word starts with a number, so we prepend Version_ in that case
        // and make it eventually "Version_27-0d21e1"
        //
        // Issue: https://github.com/FontBureau/videoproof/issues/35
        // Fonts don't display when there are '[', ']', characters in the version string
        //
        // It's less likely now that this needs more fixing in the future
        // as theres a catch all replaceAll rule replacing characters
        // we don't know if they work with "X".
        let version = (rawVersion)
                            .replaceAll('.', '-')
                            .replaceAll(' ', '_')
                            // semicolon breaks CSS selecting the family.
                            .replaceAll(';', ' ')
                            // E.g.
                            // FROM: Comissioner Thin Version_1-001 gftools[0-9-23]
                            // TO: Comissioner Thin Version_1-001 gftools_0-9-23_
                            .replaceAll('[', '_')
                            .replaceAll(']', '_')
                            // \w: Matches any alphanumeric character
                            //     from the basic Latin alphabet,
                            //     including the underscore.
                            //     Equivalent to [A-Za-z0-9_]
                            // plus space
                            // plus hyphen
                            .replaceAll(/[^\w -]/g, 'X')
                            ;
        // Must match on beginning (^) A-Z case insensitive (i)
        if(!version.match(/^[A-Z]/i))
            version = `Version_${version}`;
        return version;
    }

    static fullName(name, rawVersion, originType) {
        const version = this.massageVersion(rawVersion);
        return [
                 originType
               , name // e.g. "RobotoFlex Regular"
               , version
               ].join(' ');
    }
    // This is used as a unique id of the font within the app and
    // as the CSS-name.
    // BUT NOTE: there is the option to override this in the constructor.
    get fullName() {
        return this.constructor.fullName(this.name, this.version, this.origin.type);
    }

    // FIXME: this seems not used in serialization so far!
    get serializationNameParticles() {
        // Ordered by significance, the origin info is not serialized.
        return [this.name, this.version];
    }

    get axisRanges() {
        if(!this._axisRangesCache ) {
            Object.defineProperty(this, '_axisRangesCache', {
                value: Object.freeze(_getFontAxisRanges(this.fontObject))
            });
        }
        return this._axisRangesCache;
    }

    get instances() {
        if(!this._instancesCache ) {
            let instances = this.fontObject.tables?.fvar?.instances || []
              , instancesList = []
              ;
            for(const {name, coordinates} of instances) {
                const usedName = 'en' in name
                        ? name.en
                        : Object.entries(name)[1] // language is at [0]
                        ;
                instancesList.push([usedName, Object.assign({}, coordinates)]);
            }
            Object.defineProperty(this, '_instancesCache', {
                value: deepFreeze(instancesList)
            });
        }
        return this._instancesCache;
    }

    get hbFace() {
        if(this._hbCache === null) {
            const blob = this._widgetBus.harfbuzz.hbjs.createBlob(this.buffer)
              , face = this._widgetBus.harfbuzz.hbjs.createFace(blob, 0)
              ;
            this._hbCache = {blob, face};
        }
        return this._hbCache.face;
    }

    // release resources
    destroy() {
        this._document.fonts.delete(this.fontFace);
        if(this._hbCache !== null) {
            this._hbCache.face.destroy();
            this._hbCache.blob.destroy();
            this._hbCache = null;
        }
        // FIXME: Maybe should delete these too: buffer, fontFace, fontObject
        // E.g. when this is logged with console.log these will cause
        // memory leakage while the this._hbCache is just empty then.
    }
}

export class VideoProofDeferredFont {
    static fromFontObject(fontObject, origin, buffer=null) {
        const font = new VideoProofFont({}, fontObject, origin);
        return new this(origin, font.fullName, font.nameVersion, font.serializationNameParticles, buffer);
    }
    constructor(origin, fullName, nameVersion, serializationNameParticles, buffer=null) {
        Object.defineProperties(this, {
            fullName: {value: fullName, writable: false, enumerable: true}
          , nameVersion: {value: nameVersion, writable: false, enumerable: true}
          , serializationNameParticles: {value: serializationNameParticles, writable: false, enumerable: true}
          , origin: {value: origin, writable: false, enumerable: true}
          , buffer: {value: buffer, writable: false, enumerable: true}
        });
    }
}
