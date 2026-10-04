// Behavior tests for the Treatment Planner (milestone 4, phase 2):
// the per-side step->value maps, direction gating, treatment
// toggles — and, with the real Roboto Flex + HarfBuzz (the
// measurer.test.mjs pattern, plain node), that the step values
// produce real width deltas when the Measurer re-shapes at the
// shifted coords.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as harfbuzz from "../../../../vendor/harfbuzzjs/harfbuzz.mjs";
import {
    decompressFontBuffer,
    createFontObject,
} from "../../../../font-info.mjs";

import { Measurer, axesKeyOfEntries } from "./measurer.ts";
import {
    createTreatmentStepper,
    treatmentValueAt,
    treatmentValuesAtStep,
    TREATMENT_PLANNER_DEFAULTS,
} from "./treatment-planner.ts";
import {
    JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
    JUSTIFICATION_POTENTIALS_AMSTELVAR,
    calculatePotentials,
    anchorPotentialsToLocation,
} from "./justification-potentials.ts";

describe("treatmentValueAt (per-side linear map)", () => {
    const triple = [10, 20, 25]; // [min, dflt, max]
    it("maps -1/0/+1 to min/dflt/max", () => {
        expect(treatmentValueAt(triple, -1)).toBe(10);
        expect(treatmentValueAt(triple, 0)).toBe(20);
        expect(treatmentValueAt(triple, 1)).toBe(25);
    });
    it("is linear per side (asymmetric ranges)", () => {
        expect(treatmentValueAt(triple, -0.5)).toBe(15);
        expect(treatmentValueAt(triple, 0.5)).toBe(22.5);
    });
});

describe("createTreatmentStepper", () => {
    const potentials = {
        XTRA: [460, 468, 471],
        tracking: [-0.1, 0, 0.13],
        wordspace: [-0.15, 0, 0.35],
    };

    it("drives all treatments in parallel at a step", () => {
        const values = treatmentValuesAtStep(
            potentials,
            TREATMENT_PLANNER_DEFAULTS,
            -1,
        );
        expect(values.axes.get("XTRA")).toBe(460);
        expect(values.letterSpacingPt).toBeCloseTo(-0.1);
        expect(values.wordSpaceFactor).toBeCloseTo(-0.15);
    });

    it("step 0 is the natural state", () => {
        const values = treatmentValuesAtStep(
            potentials,
            TREATMENT_PLANNER_DEFAULTS,
            0,
        );
        expect(values.axes.get("XTRA")).toBe(468);
        expect(values.letterSpacingPt).toBe(0);
        expect(values.wordSpaceFactor).toBe(0);
    });

    it("direction gating collapses the disallowed side", () => {
        const narrowing = {
                ...TREATMENT_PLANNER_DEFAULTS,
                direction: "narrowing",
            },
            values = treatmentValuesAtStep(potentials, narrowing, 1);
        expect(values.axes.get("XTRA")).toBe(468);
        expect(values.letterSpacingPt).toBe(0);
        expect(values.wordSpaceFactor).toBe(0);
    });

    it("treatment toggles exclude treatments", () => {
        const noTracking = {
                ...TREATMENT_PLANNER_DEFAULTS,
                treatments: new Set(["XTRA", "wordspace"]),
            },
            stepper = createTreatmentStepper(potentials, noTracking);
        expect(stepper.letterSpacingPtAt(-1)).toBe(0);
        expect(stepper.wordSpaceFactorAt(-1)).toBeCloseTo(-0.15);
        expect(stepper.axesAt(-1).get("XTRA")).toBe(460);
    });
});

// --- with the real font: the step values produce real width deltas ---

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
        fullName: "Roboto Flex (treatment-planner test)",
        hbFace: new harfbuzz.Face(new harfbuzz.Blob(sfnt), 0),
        axisRanges,
        fontObject: {
            unitsPerEm: fontObject.unitsPerEm,
            ascender: fontObject.ascender,
            descender: fontObject.descender,
        },
    };
}

describe("treatment steps measured with the real font", () => {
    const font = loadTestFont(),
        measurer = new Measurer(harfbuzz),
        // the run's location: wght 400, wdth 100, opsz 14, XTRA 468
        // (the table's XTRA dflt — the step-0-identity invariant)
        axesEntries = Object.keys(font.axisRanges)
            .map((tag) => [
                tag,
                { wght: 400, wdth: 100, opsz: 14, XTRA: 468 }[tag] ??
                    font.axisRanges[tag].default,
            ])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        measureAt = (axes, text) => {
            const entries = axesEntries.map(([tag, value]) =>
                    axes.has(tag) ? [tag, axes.get(tag)] : [tag, value],
                ),
                key = axesKeyOfEntries(font, entries);
            return measurer.measureEm(
                font,
                entries,
                key,
                [],
                "",
                null,
                null,
                text,
            );
        },
        // potentials at the run's location
        potentialsLeaf = calculatePotentials(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
            new Map(axesEntries),
        ),
        stepper = createTreatmentStepper(
            potentialsLeaf,
            TREATMENT_PLANNER_DEFAULTS,
        ),
        TEXT = "justification";

    it("the XTRA treatment narrows at -1 and widens at +1", () => {
        const natural = measureAt(new Map(), TEXT),
            narrowed = measureAt(stepper.axesAt(-1), TEXT),
            widened = measureAt(stepper.axesAt(1), TEXT);
        expect(narrowed).toBeLessThan(natural);
        expect(widened).toBeGreaterThan(natural);
    });

    it("the space advance is constant across the design space (verified for Roboto Flex)", () => {
        // The demo measured the natural space width once and the
        // wordspace factor multiplies it; the planner re-measures at
        // the candidate coords by construction — which for Roboto
        // Flex (verified here: neither XTRA nor wdth move the space
        // advance) equals the natural width exactly.
        const natural = measureAt(new Map(), " ");
        expect(measureAt(stepper.axesAt(-1), " ")).toBeCloseTo(natural, 10);
        expect(measureAt(new Map([["wdth", 25]]), " ")).toBeCloseTo(
            natural,
            10,
        );
        expect(measureAt(new Map([["wdth", 151]]), " ")).toBeCloseTo(
            natural,
            10,
        );
    });

    it("step 0 measures the natural width (identity)", () => {
        const natural = measureAt(new Map(), TEXT),
            atZero = measureAt(stepper.axesAt(0), TEXT);
        expect(atZero).toBeCloseTo(natural, 10);
    });
});

// The avar1/avar2 dflt mismatch (observed 2026-10-04: AmstelvarA2
// "doesn't get fitted" — no treatments at all): the tables are
// avar1-authored (Amstelvar XTRA dflt 562), but avar2 fonts sit
// elsewhere (AmstelvarA2 XTRA default 400). Un-anchored, the
// "narrowing" step to 515 actually WIDENS (narrowing reads as
// exhausted) and any widening probe jumps the +20% discontinuity
// between the natural 400 and the table's 562 — converging to
// step ~0. anchorPotentialsToLocation re-anchors the leaf to the
// run's location and restores the step semantics.
describe("avar2 anchoring (the AmstelvarA2 non-treatment bug)", () => {
    const loadFont = (file, name) => {
            const buffer = readFileSync(
                    join(__dirname, "../../../../../assets/fonts", file),
                ),
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
                fullName: `${name} (anchoring test)`,
                name,
                hbFace: new harfbuzz.Face(new harfbuzz.Blob(sfnt), 0),
                axisRanges,
                fontObject: {
                    unitsPerEm: fontObject.unitsPerEm,
                    ascender: fontObject.ascender,
                    descender: fontObject.descender,
                },
            };
        },
        amstelvar = loadFont(
            "AmstelvarA2-Roman_avar2.woff2",
            "Amstelvar Regular",
        ),
        amstelvarMeasurer = new Measurer(harfbuzz),
        // the run's location: the font's defaults (XTRA 400!)
        amstelvarEntries = Object.keys(amstelvar.axisRanges)
            .map((tag) => [tag, amstelvar.axisRanges[tag].default])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        amstelvarLocation = new Map(amstelvarEntries),
        measureAmstelvarAt = (axes, text) => {
            const entries = amstelvarEntries.map(([tag, value]) =>
                    axes.has(tag) ? [tag, axes.get(tag)] : [tag, value],
                ),
                key = axesKeyOfEntries(amstelvar, entries);
            return amstelvarMeasurer.measureEm(
                amstelvar,
                entries,
                key,
                [],
                "",
                null,
                null,
                text,
            );
        },
        resolvedLeaf = calculatePotentials(
            JUSTIFICATION_POTENTIALS_AMSTELVAR,
            amstelvarLocation,
        ),
        TEXT = "justification";

    it("UN-anchored: the 'narrowing' step WIDENS (the bug)", () => {
        const stepper = createTreatmentStepper(
                resolvedLeaf,
                TREATMENT_PLANNER_DEFAULTS,
            ),
            natural = measureAmstelvarAt(new Map(), TEXT),
            atNarrowing = measureAmstelvarAt(stepper.axesAt(-1), TEXT);
        // the table's XTRA 515 vs the run's natural 400: wider!
        expect(atNarrowing).toBeGreaterThan(natural);
    });

    it("anchored: narrowing narrows, widening widens, step 0 is identity", () => {
        const anchored = anchorPotentialsToLocation(
                resolvedLeaf,
                amstelvarLocation,
                amstelvar.axisRanges,
            ),
            // the leaf re-anchored to the run's XTRA 400 (dflt),
            // the authored deltas preserved ([515,562,575] -> [-47,+13])
            stepper = createTreatmentStepper(
                anchored,
                TREATMENT_PLANNER_DEFAULTS,
            ),
            natural = measureAmstelvarAt(new Map(), TEXT);
        expect(anchored.XTRA).toEqual([353, 400, 413]);
        expect(measureAmstelvarAt(stepper.axesAt(-1), TEXT)).toBeLessThan(
            natural,
        );
        expect(measureAmstelvarAt(stepper.axesAt(1), TEXT)).toBeGreaterThan(
            natural,
        );
        expect(measureAmstelvarAt(stepper.axesAt(0), TEXT)).toBeCloseTo(
            natural,
            10,
        );
    });
});
