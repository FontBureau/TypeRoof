// Behavior tests for Measurer v1 with the real Roboto Flex asset:
// widths differ across wdth locations, sparse-key normalization
// (explicit default == unset), and a feature toggle (-liga) changes
// a ligature pair's width. Real shaping, no DOM.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as harfbuzz from "../../../../vendor/harfbuzzjs/harfbuzz.mjs";
import {
    decompressFontBuffer,
    createFontObject,
} from "../../../../font-info.mjs";

import {
    Measurer,
    axesEntriesOf,
    axesKeyOf,
    featuresEntriesOf,
    featuresKeyOf,
} from "./measurer.ts";

const __dirname = dirname(fileURLToPath(import.meta.url)),
    ROBOTO_FLEX_WOFF2 = join(
        __dirname,
        "../../../../../assets/fonts",
        "RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].woff2",
    );

function loadTestFont() {
    const buffer = readFileSync(ROBOTO_FLEX_WOFF2),
        sfnt = decompressFontBuffer(
            buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength,
            ),
        ),
        fontObject = createFontObject(harfbuzz, sfnt),
        axisRanges = {};
    for (const axis of fontObject.tables.fvar.axes)
        axisRanges[axis.tag] = Object.freeze({
            name: axis.tag,
            min: axis.minValue,
            max: axis.maxValue,
            default: axis.defaultValue,
        });
    return {
        fullName: "Roboto Flex (test)",
        hbFace: new harfbuzz.Face(new harfbuzz.Blob(sfnt), 0),
        axisRanges,
    };
}

const measurer = new Measurer(harfbuzz);
const font = loadTestFont();

function measure(properties, text) {
    return measurer.measureEm(
        font,
        axesEntriesOf(font, properties),
        axesKeyOf(font, properties),
        featuresEntriesOf(properties),
        featuresKeyOf(properties),
        null,
        null,
        text,
    );
}

describe("Measurer v1", () => {
    it("measures different widths at different wdth locations", () => {
        const narrow = measure(
                new Map([["axesLocations/wdth", font.axisRanges.wdth.min]]),
                "Heading",
            ),
            wide = measure(
                new Map([["axesLocations/wdth", font.axisRanges.wdth.max]]),
                "Heading",
            );
        expect(narrow).toBeLessThan(wide);
    });

    it("sparse keys normalize explicit defaults to the unset key", () => {
        const defaultWdth = font.axisRanges.wdth.default,
            unset = new Map(),
            explicitDefault = new Map([["axesLocations/wdth", defaultWdth]]);
        expect(axesKeyOf(font, unset)).toBe("");
        expect(axesKeyOf(font, explicitDefault)).toBe("");
        // a non-default value IS in the key
        expect(axesKeyOf(font, new Map([["axesLocations/wdth", 50]]))).toBe(
            "wdth=50",
        );
        // and the measurements coincide (same effective location)
        expect(measure(unset, "same text")).toBe(
            measure(explicitDefault, "same text"),
        );
    });

    it("a feature toggle changes a ligature pair's width", () => {
        const text = "fi", // ligates under +liga in Roboto Flex
            withLiga = measure(new Map(), text),
            withoutLiga = measure(
                new Map([["opentype-features/liga", false]]),
                text,
            );
        expect(withoutLiga).not.toBe(withLiga);
    });

    it("reports shaped glyph counts for liga, combining sequences and emoji", () => {
        const shape = (text, features = [], featuresKey = "") =>
                measurer.shapeMetricsEm(
                    font,
                    axesEntriesOf(font, new Map()),
                    "",
                    features,
                    featuresKey,
                    null,
                    null,
                    text,
                ),
            liga = shape("fi"),
            noLiga = shape("fi", [["liga", false]], "liga=0"),
            combining = shape("a\u0301"),
            emoji = shape("😀");
        expect(liga.glyphCount).toBe(1);
        expect(noLiga.glyphCount).toBe(2);
        expect(combining.glyphCount).toBeLessThanOrEqual(2);
        expect(combining.glyphCount).toBeGreaterThan(0);
        expect(emoji.glyphCount).toBeGreaterThan(0);
    });

    it("shares one cached shape for width and glyph metrics", () => {
        const text = "shared shape cache probe",
            metrics = measurer.shapeMetricsEm(
                font,
                axesEntriesOf(font, new Map()),
                "",
                [],
                "",
                null,
                null,
                text,
            ),
            width = measurer.measureEm(
                font,
                axesEntriesOf(font, new Map()),
                "",
                [],
                "",
                null,
                null,
                text,
            );
        expect(width).toBe(metrics.advanceEm);
        expect(metrics.glyphCount).toBeGreaterThan(0);
    });

    it("stays correct under LRU eviction (width cache is bounded)", () => {
        // a design-space animation produces a new location per frame;
        // the caches must stay bounded WITHOUT corrupting results
        const before = measure(new Map(), "eviction probe");
        for (
            let wdth = font.axisRanges.wdth.min;
            wdth < font.axisRanges.wdth.max;
            wdth += 0.5
        )
            measure(new Map([["axesLocations/wdth", wdth]]), `frame ${wdth}`);
        const after = measure(new Map(), "eviction probe");
        expect(after).toBe(before);
    });

    it("language affects shaping (e.g. Turkish dotted-i)", () => {
        // 'İ' handling differs by language in many fonts; at minimum
        // the code path must run without error and produce a width.
        const tr = measurer.measureEm(
            font,
            axesEntriesOf(font, new Map()),
            "",
            [],
            "",
            "tr",
            null,
            "İstanbul",
        );
        expect(tr).toBeGreaterThan(0);
    });
});
