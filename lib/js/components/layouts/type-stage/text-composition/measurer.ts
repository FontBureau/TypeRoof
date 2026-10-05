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
 *   - shapes: flat Map (fullName, axesKey, featuresKey, language,
 *     direction, text) -> {advanceEm, glyphCount}. Width and tracking
 *     opportunities share one HarfBuzz shape/cache miss. All axes matter
 *     (any axis can affect advances; parametric fonts have many).
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

/** Sparse normalized axes key from entries: only axes differing
 *  from default. */
export function axesKeyOfEntries(
    font: any,
    entries: [string, number][],
): string {
    return entries
        .filter(
            ([tag, value]) => value !== (font.axisRanges as any)[tag].default,
        )
        .map(([tag, value]) => `${tag}=${value}`)
        .join(",");
}

/** Sparse normalized axes key: only axes differing from default. */
export function axesKeyOf(font: any, properties: Map<string, any>): string {
    return axesKeyOfEntries(font, axesEntriesOf(font, properties));
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
const SHAPE_CACHE_CAP = 50000,
    HBFONT_LOCATIONS_CAP = 32;

/** Reusable HarfBuzz output needed by composition: advance in em and
 * the number of output glyphs. Tracking opportunities are between these
 * shaped glyphs, never source UTF-16 units. */
export interface ShapeMetrics {
    advanceEm: number;
    glyphCount: number;
}

export class Measurer {
    private _hb: any; // harfbuzzjs module namespace
    private _hbFonts = new Map<string, Map<string, any>>(); // fullName -> axesKey -> harfbuzz.Font
    private _shapeCache = new Map<string, ShapeMetrics>();

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

    /** Shape metrics in em at the given location/settings. */
    shapeMetricsEm(
        font: any,
        axesEntries: [string, number][],
        axesKey: string,
        featuresEntries: [string, boolean][],
        featuresKey: string,
        language: string | null,
        direction: string | null,
        text: string,
    ): ShapeMetrics {
        if (text === "") return { advanceEm: 0, glyphCount: 0 };
        const cacheKey = [
            font.fullName,
            axesKey,
            featuresKey,
            language ?? "",
            direction ?? "",
            text,
        ].join("|");
        let metrics = this._cacheGet(this._shapeCache, cacheKey);
        if (metrics === undefined) {
            const hbFont = this._hbFontFor(font, axesKey, axesEntries),
                features = featuresEntries.map(([tag, enabled]) =>
                    this._hb.Feature.fromString(`${enabled ? "+" : "-"}${tag}`),
                ),
                buffer = new this._hb.Buffer();
            buffer.addText(text);
            // set BEFORE guessSegmentProperties: it only fills unset
            // segment properties (script gets guessed from the text)
            if (language !== null) buffer.setLanguage(language);
            if (direction !== null) buffer.setDirection(direction);
            buffer.guessSegmentProperties();
            this._hb.shape(hbFont, buffer, features);
            const glyphs = buffer.getGlyphInfosAndPositions();
            let advanceX = 0;
            for (const glyph of glyphs) advanceX += glyph.xAdvance;
            metrics = {
                advanceEm: advanceX / font.hbFace.upem,
                glyphCount: glyphs.length,
            };
            this._cacheSet(
                this._shapeCache,
                cacheKey,
                metrics,
                SHAPE_CACHE_CAP,
            );
        }
        return metrics;
    }

    /** Compatibility width API; shares the shape-metrics cache. */
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
        return this.shapeMetricsEm(
            font,
            axesEntries,
            axesKey,
            featuresEntries,
            featuresKey,
            language,
            direction,
            text,
        ).advanceEm;
    }
}
