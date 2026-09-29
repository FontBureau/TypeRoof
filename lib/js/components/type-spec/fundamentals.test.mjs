import { describe, it, expect } from "vitest";
import {
    inlineLengthToPT,
    enToPt,
    enToPtNumeric,
    truncateDecimals,
} from "./fundamentals.mjs";

describe("inlineLengthToPT — unit-faithful conversion", () => {
    // References: fontSize 18 (= baseFontSize 14 × relativeFontSize,
    // e.g. a t1/paragraph node), baseFontSize 14.
    const fontSize = 18,
        baseFontSize = 14;

    it("absolute units convert font-size-independently (faithful transport)", () => {
        // The original regression: 400px must be 300pt regardless of
        // the font sizes in play.
        expect(inlineLengthToPT(400, "px", baseFontSize, fontSize)).toBe(300);
        expect(inlineLengthToPT(300, "pt", baseFontSize, fontSize)).toBe(300);
        expect(inlineLengthToPT(400, "px", fontSize, fontSize)).toBe(300);
    });

    it("em/en resolve against fontSize", () => {
        expect(inlineLengthToPT(2, "em", baseFontSize, fontSize)).toBe(36);
        expect(inlineLengthToPT(4, "en", baseFontSize, fontSize)).toBe(36);
    });

    it("baseEm/baseEn resolve against baseFontSize", () => {
        expect(inlineLengthToPT(2, "baseEm", baseFontSize, fontSize)).toBe(28);
        expect(inlineLengthToPT(4, "baseEn", baseFontSize, fontSize)).toBe(28);
    });

    it("null/undefined value or unit resolves to null (unset input)", () => {
        expect(inlineLengthToPT(null, "en", baseFontSize, fontSize)).toBe(null);
        expect(inlineLengthToPT(2, null, baseFontSize, fontSize)).toBe(null);
        expect(inlineLengthToPT(undefined, "en", baseFontSize, fontSize)).toBe(
            null,
        );
    });

    it("unknown units throw", () => {
        expect(() => inlineLengthToPT(1, "ft", baseFontSize, fontSize)).toThrow(
            "unit",
        );
    });
});

describe("enToPt / enToPtNumeric", () => {
    it("convert en to pt at the given fontSize", () => {
        expect(enToPt(2, 18)).toBe("18pt");
        expect(enToPtNumeric(2, 18)).toBe(18);
    });

    it("exponent-notation values produce valid CSS", () => {
        // String(1e-7) is "1e-7" — must not pass through ("1e-7pt"
        // is invalid CSS); it truncates to "0.00".
        expect(enToPt(1e-7 / 9, 18)).toBe("0.00pt");
        expect(truncateDecimals(1e-7)).toBe("0.00");
        expect(truncateDecimals(1.23456)).toBe("1.23");
        expect(truncateDecimals(7)).toBe("7");
    });
});
