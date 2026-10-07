// Behavior tests for the shared line-fragment presentation math
// (line-attrs.ts): classes, treatment style properties, and both
// diagnostics color palettes — the contract BOTH applicators
// (viewer spans, PM decorations) must produce identically.
import { describe, it, expect } from "vitest";

import {
    lineSpanClasses,
    lineSpanStyles,
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

    it("emits only the color code at adjustmentStep 0", () => {
        expect(
            lineSpanStyles({
                treatment,
                treatmentConfig: config,
                adjustmentStep: 0,
                trackingGaps: 2,
                colorCode: "",
            }),
        ).toEqual({
            styles: [["--line-color-code", ""]],
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
