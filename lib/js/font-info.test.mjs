import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as harfbuzz from './vendor/harfbuzzjs/harfbuzz.mjs';
import { decompressFontBuffer, createFontObject } from './font-info.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url))
  , ROBOTO_FLEX_WOFF2 = join(__dirname, '../assets/fonts'
      , 'RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].woff2');

function loadFontObject(path) {
    const buffer = readFileSync(path);
    return createFontObject(harfbuzz, decompressFontBuffer(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
}

describe('decompressFontBuffer', () => {
    it('decompresses woff2 to SFNT', () => {
        const buffer = readFileSync(ROBOTO_FLEX_WOFF2)
          , result = decompressFontBuffer(
                buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
          , signature = new TextDecoder().decode(new Uint8Array(result, 0, 4))
          ;
        // RobotoFlex is a TrueType-flavored variable font: 0x00010000
        expect(signature).toBe('\x00\x01\x00\x00');
    });

    it('passes SFNT through unchanged', () => {
        const fakeSFNT = new Uint8Array([0x00, 0x01, 0x00, 0x00, 1, 2, 3]).buffer
          , result = decompressFontBuffer(fakeSFNT)
          ;
        expect(result).toBe(fakeSFNT);
    });
});

describe('createFontObject (RobotoFlex)', () => {
    const fontObject = loadFontObject(ROBOTO_FLEX_WOFF2);

    it('resolves name entries (opentype.js facade)', () => {
        expect(fontObject.getEnglishName('fullName')).toBe('Roboto Flex Regular');
        expect(fontObject.getEnglishName('version')).toBeTruthy();
        // names bucket: {key: {language: value}} (windows bucket only)
        expect(fontObject.names.windows.fullName.en).toBe('Roboto Flex Regular');
        expect(fontObject.names.unicode).toBeUndefined();
    });

    it('reports head/hhea metrics in font units', () => {
        expect(fontObject.unitsPerEm).toBe(2048);
        expect(fontObject.ascender).toBeGreaterThan(0);
        expect(fontObject.descender).toBeLessThan(0);
    });

    it('exposes fvar axes in opentype.js shape', () => {
        const axes = fontObject.tables.fvar.axes;
        expect(axes.length).toBe(13);
        const byTag = Object.fromEntries(axes.map(axis => [axis.tag, axis]));
        for(const tag of ['wght', 'wdth', 'opsz']) {
            expect(byTag[tag]).toBeDefined();
            expect(byTag[tag].minValue).toBeLessThan(byTag[tag].defaultValue);
            expect(byTag[tag].defaultValue).toBeLessThan(byTag[tag].maxValue);
            expect(byTag[tag].name.en).toBeTruthy();
        }
        expect(byTag.wght.minValue).toBe(100);
        expect(byTag.wght.maxValue).toBe(1000);
    });

    it('exposes fvar named instances (parsed via referenceTable)', () => {
        const instances = fontObject.tables.fvar.instances;
        expect(instances.length).toBe(20); // RobotoFlex
        // first instance: "Thin" opsz=14 wght=100
        expect(instances[0].name.en).toBe('Thin');
        expect(instances[0].coordinates.opsz).toBe(14);
        expect(instances[0].coordinates.wght).toBe(100);
        for(const {name, coordinates} of instances) {
            expect(name.en).toBeTruthy();
            for(const [tag, value] of Object.entries(coordinates)) {
                expect(typeof value).toBe('number');
                const axis = fontObject.tables.fvar.axes.find(a => a.tag === tag);
                expect(axis, `axis ${tag} exists`).toBeDefined();
                expect(value).toBeGreaterThanOrEqual(axis.minValue);
                expect(value).toBeLessThanOrEqual(axis.maxValue);
            }
        }
    });

    it('exposes cmap glyphIndexMap', () => {
        const {glyphIndexMap} = fontObject.tables.cmap;
        expect(Object.keys(glyphIndexMap).length).toBeGreaterThan(0);
        expect(glyphIndexMap[65]).toBeGreaterThan(0); // 'A'
    });

    it('exposes GSUB scripts/features in opentype.js shape', () => {
        const {scripts, features} = fontObject.tables.gsub;
        expect(features.some(({tag}) => tag === 'liga')).toBe(true);
        const scriptTags = scripts.map(({tag}) => tag);
        expect(scriptTags).toContain('DFLT');
        expect(scriptTags).toContain('latn');
        // default LangSys featureIndexes point into the features array
        // (note: Roboto Flex has empty default LangSys, but DFLT and
        // other fonts' defaults must stay consistent when present)
        const withDefault = scripts.filter(({script}) => script.defaultLangSys);
        for(const {script} of withDefault)
            for(const index of script.defaultLangSys.featureIndexes)
                expect(features[index]).toBeDefined();
        // langSysRecords: Roboto Flex has an empty default LangSys for
        // latn (features live in language records), so don't require
        // langSysRecords to be non-empty; just check consistency.
        const latn = scripts.find(({tag}) => tag === 'latn');
        expect(latn).toBeDefined();
        for(const {langSys} of latn.script.langSysRecords)
            for(const index of langSys.featureIndexes)
                expect(features[index]).toBeDefined();
        // language record tags are 4 chars (incl. trailing space)
        for(const {tag} of latn.script.langSysRecords)
            expect(tag).toHaveLength(4);
    });
});

describe('createFontObject (LiberationMono-Regular.ttf: non-variable)', () => {
    // A truly static font fixture (no fvar), vendored for CI:
    // lib/assets/fonts/testing/. MaterialSymbolsOutlinedSubset can NOT
    // be used here: it has fvar+gvar (FILL/GRAD/wght/opsz axes).
    const LIBERATION_MONO_TTF = join(__dirname, '../assets/fonts/testing'
          , 'LiberationMono-Regular.ttf')
      , buffer = readFileSync(LIBERATION_MONO_TTF)
      , fontObject = createFontObject(harfbuzz,
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
      ;

    it('has no fvar table', () => {
        expect(fontObject.tables.fvar).toBeUndefined();
    });

    it('still resolves names, cmap and metrics', () => {
        expect(fontObject.getEnglishName('fullName')).toBeTruthy();
        expect(Object.keys(fontObject.tables.cmap.glyphIndexMap).length).toBeGreaterThan(0);
        expect(fontObject.unitsPerEm).toBeGreaterThan(0);
    });
});
