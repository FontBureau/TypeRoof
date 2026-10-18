// Behavior tests for the shared line-fragment presentation math
// (line-attrs.ts): classes, treatment style properties, and both
// diagnostics color palettes — the contract BOTH applicators
// (viewer spans, PM decorations) must produce identically.
import { describe, it, expect } from "vitest";

import { createTreatmentStepper } from "./treatment-planner.ts";
import {
    treatmentConfigFromPayload,
    lineSpanClasses,
    lineSpanStyles,
    lineStartSourceIndex,
    lineEndSourceIndex,
    potentialsLineColorCode,
    kpLineColorCode,
    KP_EXHAUSTED_CODE,
} from "./line-attrs.ts";

describe("lineSpanClasses", () => {
    it("emits the base class for a mid-line fragment", () => {
        expect(
            lineSpanClasses({
                isLineStart: false,
                isParagraphFirstLine: false,
                isHyphenBreak: false,
            }),
        ).toEqual(["typeroof-composition-line"]);
    });

    it("adds line-first only for the line's first fragment", () => {
        expect(
            lineSpanClasses({
                isLineStart: true,
                isParagraphFirstLine: false,
                isHyphenBreak: false,
            }),
        ).toEqual([
            "typeroof-composition-line",
            "typeroof-composition-line-first",
        ]);
    });

    it("adds paragraph-first-line on the paragraph's first line", () => {
        expect(
            lineSpanClasses({
                isLineStart: true,
                isParagraphFirstLine: true,
                isHyphenBreak: false,
            }),
        ).toEqual([
            "typeroof-composition-line",
            "typeroof-composition-line-first",
            "typeroof-composition-paragraph-first-line",
        ]);
    });

    it("ignores paragraph-first without line-start", () => {
        expect(
            lineSpanClasses({
                isLineStart: false,
                isParagraphFirstLine: true,
                isHyphenBreak: false,
            }),
        ).toEqual(["typeroof-composition-line"]);
    });

    it("adds the hyphen class for a hyphen-broken line end", () => {
        expect(
            lineSpanClasses({
                isLineStart: false,
                isParagraphFirstLine: false,
                isHyphenBreak: true,
            }),
        ).toEqual([
            "typeroof-composition-line",
            "typeroof-composition-line-hyphen",
        ]);
    });
});

describe("potentialsLineColorCode", () => {
    it("overrides everything with the overfull code", () => {
        expect(potentialsLineColorCode(-1, true)).toBe("hsl(0, 80%, 85%)");
    });

    it("codes narrowing cyan, intensity by |step|", () => {
        expect(potentialsLineColorCode(-1, false)).toBe("hsl(180, 80%, 30%)");
        expect(potentialsLineColorCode(-0.5, false)).toBe("hsl(180, 80%, 65%)");
    });

    it("codes widening red, intensity by step", () => {
        expect(potentialsLineColorCode(1, false)).toBe("hsl(0, 100%, 30%)");
        expect(potentialsLineColorCode(0.5, false)).toBe("hsl(0, 100%, 65%)");
    });

    it("clamps beyond the normalized range and is empty at 0", () => {
        expect(potentialsLineColorCode(-2, false)).toBe("hsl(180, 80%, 30%)");
        expect(potentialsLineColorCode(2, false)).toBe("hsl(0, 100%, 30%)");
        expect(potentialsLineColorCode(0, false)).toBe("");
    });
});

describe("kpLineColorCode", () => {
    const diagnostics = {
        overfullLines: [2],
        badness: [0, 50, 100, 0],
        fitnessClasses: ["tight", "decent", "loose", "veryLoose"],
        exhaustedLines: [3],
    };

    it("overrides overfull and exhausted lines with the alarm code", () => {
        expect(kpLineColorCode(2, diagnostics)).toBe(KP_EXHAUSTED_CODE);
        expect(kpLineColorCode(3, diagnostics)).toBe(KP_EXHAUSTED_CODE);
    });

    it("hues by fitness class, lightness by badness", () => {
        expect(kpLineColorCode(0, diagnostics)).toBe("hsl(265, 70%, 88%)");
        expect(kpLineColorCode(1, diagnostics)).toBe(
            `hsl(145, 70%, ${Math.round(88 - 33 * 0.5)}%)`,
        );
        expect(kpLineColorCode(2, diagnostics)).toBe(KP_EXHAUSTED_CODE);
    });

    it("defaults to decent/0-badness when diagnostics are sparse", () => {
        expect(kpLineColorCode(0, { overfullLines: [], badness: [] })).toBe(
            "hsl(145, 70%, 88%)",
        );
    });
});

describe("lineSpanStyles", () => {
    const treatment = {
            potentials: {
                XTRA: [300, 400, 500],
                tracking: [-0.5, 0, 0.5],
                wordspace: [-0.25, 0, 0.5],
            },
            spaceAdvancePt: 3,
            axesEntries: [
                ["XTRA", 400],
                ["wdth", 100],
            ],
        },
        config = {
            treatments: new Set(["XTRA", "tracking", "wordspace"]),
            direction: "both",
        };

    it("emits only the color code without treatment", () => {
        expect(
            lineSpanStyles({
                treatment: null,
                treatmentConfig: config,
                adjustmentStep: 0.5,
                trackingGaps: 2,
                colorCode: "cc",
            }),
        ).toEqual({
            styles: [["--line-color-code", "cc"]],
            dataTrackingGaps: null,
        });
    });

    it("explicitly writes step 0 (the identity idea is removed): the axes override at the dflt, no spacing", () => {
        // step 0: XTRA -> 400 (dflt), tracking 0 -> nothing,
        // wordspace 0 -> nothing; the axes override carries the
        // run's own location values (run anchoring) — explicit, not
        // skipped. This is also what makes the "off" anchoring
        // mode visible: its authored dflt renders at step 0.
        expect(
            lineSpanStyles({
                treatment,
                treatmentConfig: config,
                adjustmentStep: 0,
                trackingGaps: 2,
                colorCode: "",
            }),
        ).toEqual({
            styles: [
                ["font-variation-settings", '"XTRA" 400,"wdth" 100'],
                ["--line-color-code", ""],
            ],
            dataTrackingGaps: null,
        });
    });

    it("applies all treatments at a widening step", () => {
        // step 0.5: XTRA -> 450, tracking -> 0.25pt, wordspace -> 0.25
        expect(
            lineSpanStyles({
                treatment,
                treatmentConfig: config,
                adjustmentStep: 0.5,
                trackingGaps: 2,
                colorCode: "cc",
            }),
        ).toEqual({
            styles: [
                ["--line-letter-spacing", "0.25pt"],
                ["--line-word-spacing", "0.75pt"],
                ["font-variation-settings", '"XTRA" 450,"wdth" 100'],
                ["--line-color-code", "cc"],
            ],
            dataTrackingGaps: 2,
        });
    });

    it("applies all treatments at a narrowing step", () => {
        // step -1: XTRA -> 300, tracking -> -0.5pt, wordspace -> -0.25
        expect(
            lineSpanStyles({
                treatment,
                treatmentConfig: config,
                adjustmentStep: -1,
                trackingGaps: 1,
                colorCode: "cc",
            }),
        ).toEqual({
            styles: [
                ["--line-letter-spacing", "-0.5pt"],
                ["--line-word-spacing", "-0.75pt"],
                ["font-variation-settings", '"XTRA" 300,"wdth" 100'],
                ["--line-color-code", "cc"],
            ],
            dataTrackingGaps: 1,
        });
    });

    it("skips letter-spacing when the line has no tracking gaps here", () => {
        const { styles, dataTrackingGaps } = lineSpanStyles({
            treatment,
            treatmentConfig: config,
            adjustmentStep: 0.5,
            trackingGaps: 0,
            colorCode: "",
        });
        expect(styles.some(([prop]) => prop === "--line-letter-spacing")).toBe(
            false,
        );
        expect(dataTrackingGaps).toBe(null);
        // the other treatments still apply
        expect(styles.some(([prop]) => prop === "--line-word-spacing")).toBe(
            true,
        );
    });

    it("honors direction gating", () => {
        // Widening step with direction "narrowing": the stepper gates
        // to 0 — tracking/wordspace vanish, but enabled axes still
        // emit font-variation-settings at their DEFAULT values (same
        // as the viewer, which calls treatmentValuesAtStep for any
        // adjustmentStep !== 0 and gets gated values back).
        expect(
            lineSpanStyles({
                treatment,
                treatmentConfig: {
                    treatments: config.treatments,
                    direction: "narrowing",
                },
                adjustmentStep: 0.5,
                trackingGaps: 2,
                colorCode: "cc",
            }),
        ).toEqual({
            styles: [
                ["font-variation-settings", '"XTRA" 400,"wdth" 100'],
                ["--line-color-code", "cc"],
            ],
            dataTrackingGaps: null,
        });
    });

    it("honors treatment toggles", () => {
        const { styles } = lineSpanStyles({
            treatment,
            treatmentConfig: {
                treatments: new Set(["wordspace"]),
                direction: "both",
            },
            adjustmentStep: 0.5,
            trackingGaps: 2,
            colorCode: "",
        });
        expect(styles).toEqual([
            ["--line-word-spacing", "0.75pt"],
            ["--line-color-code", ""],
        ]);
    });
});

describe("lineStartSourceIndex / lineEndSourceIndex", () => {
    // zero-width segments = inline atoms (segmenter.ts pushes
    // {start: 0, end: 0}); their leaves render NO fragment
    const seg = (sourceIndex, start, end) => ({
        sourceIndex,
        start,
        end,
        widthPt: 0,
    });

    it("a line starting at an atom: the marker moves to the first rendered leaf", () => {
        // line = [atom(0-width, leaf 0), text(leaf 1)]
        const segments = [seg(0, 0, 0), seg(1, 0, 6)];
        expect(
            lineStartSourceIndex(segments, { fromSegment: 0, toSegment: 2 }),
        ).toBe(1);
    });

    it("a line ending with atoms: the hyphen marker stays on the last rendered leaf", () => {
        // line = [text(leaf 1), atom(0-width, leaf 2)]
        const segments = [seg(1, 0, 6), seg(2, 0, 0)];
        expect(
            lineEndSourceIndex(segments, { fromSegment: 0, toSegment: 2 }),
        ).toBe(1);
    });

    it("multiple leading atoms are all skipped", () => {
        const segments = [seg(0, 0, 0), seg(0, 0, 0), seg(1, 0, 3)];
        expect(
            lineStartSourceIndex(segments, { fromSegment: 0, toSegment: 3 }),
        ).toBe(1);
    });

    it("normal lines are unchanged (markers on the text leaves)", () => {
        const segments = [seg(0, 0, 4), seg(1, 0, 6), seg(2, 0, 2)];
        const line = { fromSegment: 0, toSegment: 3 };
        expect(lineStartSourceIndex(segments, line)).toBe(0);
        expect(lineEndSourceIndex(segments, line)).toBe(2);
    });

    it("an all-atom line degrades to its last/first segment (renders nothing either way)", () => {
        const segments = [seg(0, 0, 0), seg(1, 0, 0)];
        const line = { fromSegment: 0, toSegment: 2 };
        // no rendered fragment exists — the markers point at atom
        // leaves, which render nothing (the line was atom-only)
        expect(lineStartSourceIndex(segments, line)).toBe(1);
        expect(lineEndSourceIndex(segments, line)).toBe(0);
    });
});

describe("treatmentConfigFromPayload (the editor-applicator regression)", () => {
    it('keeps the "all" sentinel intact (new Set("all") would be {"a","l"})', () => {
        const config = treatmentConfigFromPayload({
            treatments: "all",
            direction: "both",
        });
        expect(config.treatments).toBe("all");
        // the regression: re-hydrating the sentinel as a Set disabled
        // every treatment (editor mode composed narrow, rendered wide)
        const stepper = createTreatmentStepper(
            { wdth: [35, 151, 151] },
            config,
        );
        expect(stepper.axesAt(-0.5).get("wdth")).toBeCloseTo(93);
    });

    it("re-hydrates the enabled-tag array to a set", () => {
        const config = treatmentConfigFromPayload({
            treatments: ["wdth", "tracking"],
            direction: "narrowing",
        });
        expect(config.treatments.has("wdth")).toBe(true);
        expect(config.treatments.has("wordspace")).toBe(false);
        expect(config.direction).toBe("narrowing");
    });
});
