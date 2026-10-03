/**
 * Measurer v0 (stateful but deterministic Host role): HarfBuzz
 * shaping and advance caching.
 *
 * Units: advances are measured in font units, normalized to em
 * (divided by units-per-em) — font-size independent, so the cache
 * keyed by (text, fontKey) stays valid across sizes; the caller
 * multiplies by fontSizePt (see composition-types.ts "Units").
 *
 * Follows the videoproof-contextual measureWordWidths pattern
 * (lib/js/components/actors/videoproof-contextual/layout.mjs:43-66):
 * one harfbuzz.Font per font face, setScale(upem, upem), Buffer ->
 * shape -> sum xAdvance.
 *
 * v0 simplifications (documented, refined later):
 *   - no setVariations: measured at the font's default variation
 *     location. The current axes location and the stretch potentials
 *     (wdth min/max shaping) come with the Treatment Planner.
 *   - atoms (inline nodes) measure 0 — box measurement is a later
 *     concern.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export class Measurer {
    private _hb: any; // harfbuzzjs module namespace
    private _hbFonts = new Map<any, any>(); // font object -> harfbuzz.Font
    private _widthCache = new Map<string, number>(); // fontKey|text -> em

    constructor(harfbuzz: any) {
        this._hb = harfbuzz;
    }

    private _hbFont(font: any): any {
        let hbFont = this._hbFonts.get(font);
        if (hbFont === undefined) {
            hbFont = new this._hb.Font(font.hbFace);
            hbFont.setScale(font.hbFace.upem, font.hbFace.upem);
            this._hbFonts.set(font, hbFont);
        }
        return hbFont;
    }

    /** Width of text in em, cached by (font, text). */
    measureEm(font: any, text: string): number {
        const cacheKey = `${font.fullName}|${text}`;
        let width = this._widthCache.get(cacheKey);
        if (width === undefined) {
            const hbFont = this._hbFont(font),
                buffer = new this._hb.Buffer();
            buffer.addText(text);
            buffer.guessSegmentProperties();
            this._hb.shape(hbFont, buffer);
            let advanceX = 0;
            for (const item of buffer.getGlyphInfosAndPositions())
                advanceX += item.xAdvance;
            width = advanceX / font.hbFace.upem;
            this._widthCache.set(cacheKey, width);
        }
        return width;
    }
}
