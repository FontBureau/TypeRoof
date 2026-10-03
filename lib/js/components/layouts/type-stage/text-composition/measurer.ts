/**
 * Measurer v1 (stateful but deterministic Host role): HarfBuzz
 * shaping at the TRUE font and axes location, with the shaping-
 * relevant inputs honored (features, language, direction).
 *
 * Units: advances are measured in font units, normalized to em
 * (divided by units-per-em) — font-size independent; the caller
 * multiplies by fontSizePt (see composition-types.ts "Units").
 *
 * Caches (decided in the Sprint A research, see
 * thoughts/research/2026-10-03-1549-sprint-a-measurement-truth.md):
 *   - hbFont: Map fullName -> Map axesKey -> harfbuzz.Font
 *     (variations are font-instance state; features/language/
 *     direction are shape-time parameters and NOT in this key).
 *     Plain Maps, no WeakMap (font object lifecycle is not
 *     guaranteed).
 *   - widths: flat Map (fullName, axesKey, featuresKey, language,
 *     direction, text) -> em. All axes matter (any axis can affect
 *     advances; parametric fonts have many — hence SPARSE keys).
 *   - Sparse normalized keys: "tag=value" pairs in tag order,
 *     omitting entries whose value equals the default (unset ==
 *     default): same effective location => same key, regardless of
 *     explicitness. If key handling ever gets hot at scale, a trie
 *     over the tags is the noted scale-out option.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** [tag, value] pairs for every axis of the font, sorted by tag:
 *  the resolved value from the properties map
 *  (axesLocations/<tag>) or the axis default when unset. */
export function axesEntriesOf(
    font: any,
    properties: Map<string, any>,
): [string, number][] {
    const entries: [string, number][] = [];
    for (const [tag, range] of Object.entries(font.axisRanges)) {
        const key = `axesLocations/${tag}`,
            value = properties.has(key)
                ? properties.get(key)
                : (range as any).default;
        if (typeof value === "number") entries.push([tag, value]);
    }
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
}

/** Sparse normalized axes key: only axes differing from default. */
export function axesKeyOf(font: any, properties: Map<string, any>): string {
    return axesEntriesOf(font, properties)
        .filter(
            ([tag, value]) => value !== (font.axisRanges as any)[tag].default,
        )
        .map(([tag, value]) => `${tag}=${value}`)
        .join(",");
}

/** [tag, enabled] pairs of the OpenType feature settings present in
 *  the properties map, sorted by tag. BOTH true and false are
 *  significant: false explicitly DISABLES a feature (shaped as
 *  "-tag"), which changes advances (e.g. -liga splits ligatures);
 *  only absent keys are omitted. */
export function featuresEntriesOf(
    properties: Map<string, any>,
): [string, boolean][] {
    const entries: [string, boolean][] = [];
    for (const [key, value] of properties)
        if (key.startsWith("opentype-features/") && typeof value === "boolean")
            entries.push([key.slice("opentype-features/".length), value]);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
}

export function featuresKeyOf(properties: Map<string, any>): string {
    return featuresEntriesOf(properties)
        .map(([tag, value]) => `${tag}=${value ? 1 : 0}`)
        .join(",");
}

// LRU bounds: width entries per session (typing creates many);
// locations per font (a design-space animation creates one per frame)
const WIDTH_CACHE_CAP = 50000,
    HBFONT_LOCATIONS_CAP = 32;

export class Measurer {
    private _hb: any; // harfbuzzjs module namespace
    private _hbFonts = new Map<string, Map<string, any>>(); // fullName -> axesKey -> harfbuzz.Font
    private _widthCache = new Map<string, number>(); // full key -> em

    constructor(harfbuzz: any) {
        this._hb = harfbuzz;
    }

    // LRU: refresh position on hit; evict oldest past the cap.
    private _cacheGet(cache: Map<string, any>, key: string): any {
        const value = cache.get(key);
        if (value !== undefined) {
            cache.delete(key);
            cache.set(key, value);
        }
        return value;
    }

    private _cacheSet(
        cache: Map<string, any>,
        key: string,
        value: any,
        cap: number,
    ): void {
        cache.set(key, value);
        if (cache.size > cap) cache.delete(cache.keys().next().value as string);
    }

    private _hbFontFor(
        font: any,
        axesKey: string,
        axesEntries: [string, number][],
    ): any {
        let perFont = this._hbFonts.get(font.fullName);
        if (perFont === undefined) {
            perFont = new Map();
            this._hbFonts.set(font.fullName, perFont);
        }
        let hbFont = perFont.get(axesKey);
        if (hbFont !== undefined) {
            // LRU refresh
            perFont.delete(axesKey);
            perFont.set(axesKey, hbFont);
        } else {
            hbFont = new this._hb.Font(font.hbFace);
            hbFont.setScale(font.hbFace.upem, font.hbFace.upem);
            if (axesEntries.length > 0)
                hbFont.setVariations(
                    axesEntries.map(
                        ([tag, value]) => new this._hb.Variation(tag, value),
                    ),
                );
            perFont.set(axesKey, hbFont);
            if (perFont.size > HBFONT_LOCATIONS_CAP)
                perFont.delete(perFont.keys().next().value as string);
        }
        return hbFont;
    }

    /** Width of text in em at the given location/settings. */
    measureEm(
        font: any,
        axesEntries: [string, number][],
        axesKey: string,
        featuresEntries: [string, boolean][],
        featuresKey: string,
        language: string | null,
        direction: string | null,
        text: string,
    ): number {
        if (text === "") return 0;
        const cacheKey = [
            font.fullName,
            axesKey,
            featuresKey,
            language ?? "",
            direction ?? "",
            text,
        ].join("|");
        let width = this._cacheGet(this._widthCache, cacheKey);
        if (width === undefined) {
            const hbFont = this._hbFontFor(font, axesKey, axesEntries),
                features = featuresEntries.map(([tag, enabled]) =>
                    this._hb.Feature.fromString(`${enabled ? "+" : "-"}${tag}`),
                ),
                buffer = new this._hb.Buffer();
            buffer.addText(text);
            // set BEFORE guessSegmentProperties: it only fills unset
            // segment properties (script gets guessed from the text)
            // language/lang is the COMPLETE resolved BCP47 tag
            // (script included unless suppressed, region included):
            // HarfBuzz derives the script from the language when the
            // text gives no strong signal — no separate setScript
            // needed (it would be redundant in every reachable case)
            if (language !== null) buffer.setLanguage(language);
            if (direction !== null) buffer.setDirection(direction);
            buffer.guessSegmentProperties();
            this._hb.shape(hbFont, buffer, features);
            let advanceX = 0;
            for (const item of buffer.getGlyphInfosAndPositions())
                advanceX += item.xAdvance;
            width = advanceX / font.hbFace.upem;
            this._cacheSet(this._widthCache, cacheKey, width, WIDTH_CACHE_CAP);
        }
        return width;
    }
}
