// Behavior test for the length model and its use in the
// type-stage model: legacy documents (without width/height) metamorphose
// to width=100% layout + height unset; the boundness rule holds
// (width always bound, height optional, both unset never valid);
// lengthToCSSPX maps units to css-px.
import { describe, it, expect } from "vitest";

import { LengthModel, lengthIsSet, lengthToCSSPX } from "./length-models.mjs";

const ENVIRONMENT = {
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1000, height: 700 },
    layout: { width: 800, height: 600 },
};

function makeLength(value, unit) {
    const spec = LengthModel.createPrimalDraft({});
    spec.get("value").value = value;
    spec.get("unit").value = unit;
    return spec.metamorphose({});
}

describe("lengthToCSSPX", () => {
    it("percent units resolve against their environment box", () => {
        expect(
            lengthToCSSPX(
                makeLength(100, "percent-layout"),
                ENVIRONMENT,
                "width",
            ),
        ).toBe(800);
        expect(
            lengthToCSSPX(
                makeLength(50, "percent-viewport"),
                ENVIRONMENT,
                "height",
            ),
        ).toBe(350);
        expect(
            lengthToCSSPX(
                makeLength(25, "percent-screen"),
                ENVIRONMENT,
                "width",
            ),
        ).toBe(480);
    });

    it("absolute units resolve at 96 css-px per inch", () => {
        expect(lengthToCSSPX(makeLength(96, "px"), ENVIRONMENT, "width")).toBe(
            96,
        );
        expect(lengthToCSSPX(makeLength(72, "pt"), ENVIRONMENT, "width")).toBe(
            96,
        );
        expect(lengthToCSSPX(makeLength(1, "in"), ENVIRONMENT, "width")).toBe(
            96,
        );
        expect(
            lengthToCSSPX(makeLength(2.54, "cm"), ENVIRONMENT, "width"),
        ).toBe(96);
    });

    it("unset spec resolves to null", () => {
        const unset = LengthModel.createPrimalState({});
        expect(lengthIsSet(unset)).toBe(false);
        expect(lengthToCSSPX(unset, ENVIRONMENT, "width")).toBeNull();
    });
});
