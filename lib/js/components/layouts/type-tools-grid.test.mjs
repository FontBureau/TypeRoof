// @vitest-environment jsdom
// Unit tests for the grid-local opsz treatment: typeToolsGrid-
// AxisLocationsGen pins axesLocations/opsz at the font's default
// location when no other rule is active, so that the verbose
// font-variation-settings switch can't change the rendering (see the
// generator's doc comment in type-tools-grid.mjs), and
// manualAxesLocationsModelMixin parameterizes the autoOPSZ default
// (type-tools-grid passes BooleanDefaultTrueModel).
import { describe, it, expect } from "vitest";

import {
    BooleanDefaultTrueModel,
    BooleanModel,
    _AbstractStructModel,
} from "../../metamodel.mjs";
import { GENERIC, SPECIFIC } from "../registered-properties-definitions.mjs";
import { manualAxesLocationsModelMixin } from "../ui-manual-axis-locations.mjs";
import { LocalScopeTypeSpecnion } from "./type-stage/type-specnion.mjs";
import { typeToolsGridAxisLocationsGen } from "./type-tools-grid.mjs";

const fakeFont = {
    fullName: "UnitTest Variable",
    axisRanges: {
        wght: { name: "Weight", min: 100, max: 1000, default: 400 },
        opsz: { name: "Optical Size", min: 8, max: 144, default: 14 },
    },
};

const fakeHost = ({ autoOPSZ, axesLocations = {} }) => ({
    get(fieldName) {
        if (fieldName === "autoOPSZ") return { value: autoOPSZ };
        if (fieldName === "axesLocations")
            return new Map(
                Object.entries(axesLocations).map(([tag, value]) => [
                    tag,
                    { value },
                ]),
            );
        throw new Error(`unexpected field "${fieldName}"`);
    },
});

// Resolve the generator's raw entries like the grid's typeSpecnion
// does: font and fontSize enter the local raw map first (fontGen and
// fontSizeGen precede the locations generator), the outer scope is
// empty (the grid has no inherited layer).
const resolveAxes = (host, { font = fakeFont, fontSize = null } = {}) => {
    const rawEntries = [
        ...(font !== null ? [[`${SPECIFIC}font`, font]] : []),
        ...(fontSize !== null ? [[`${GENERIC}fontSize`, fontSize]] : []),
        ...typeToolsGridAxisLocationsGen(null, host),
    ];
    return LocalScopeTypeSpecnion.initPropertyValuesMap(
        new Map(rawEntries),
        new Map(),
    );
};

describe("typeToolsGridAxisLocationsGen", () => {
    it("falls back to the font's default opsz when no other rule is active", () => {
        const resolved = resolveAxes(
            fakeHost({ autoOPSZ: false, axesLocations: { wght: 700 } }),
        );
        // The explicit pin suppresses the browser's implicit
        // font-optical-sizing (opsz = font-size) for absent opsz.
        expect(resolved.get("axesLocations/opsz")).toBe(14);
        expect(resolved.get("axesLocations/wght")).toBe(700);
        expect(resolved.get(`${GENERIC}autoOPSZ`)).toBe(false);
    });

    it("keeps an explicit opsz over the fallback", () => {
        const resolved = resolveAxes(
            fakeHost({ autoOPSZ: false, axesLocations: { opsz: 42 } }),
        );
        expect(resolved.get("axesLocations/opsz")).toBe(42);
    });

    it("tracks the font size while autoOPSZ is on (explicit opsz is skipped, like in type-stage)", () => {
        const resolved = resolveAxes(
            fakeHost({ autoOPSZ: true, axesLocations: { opsz: 42 } }),
            { fontSize: 36 },
        );
        expect(resolved.get("axesLocations/opsz")).toBe(36);
        expect(resolved.get(`${GENERIC}autoOPSZ`)).toBe(true);
    });

    it("drops the fallback for fonts without an opsz axis", () => {
        const resolved = resolveAxes(
            fakeHost({ autoOPSZ: false, axesLocations: {} }),
            {
                font: {
                    fullName: "No Optical Size",
                    axisRanges: {
                        wght: {
                            name: "Weight",
                            min: 100,
                            max: 1000,
                            default: 400,
                        },
                    },
                },
            },
        );
        expect(resolved.has("axesLocations/opsz")).toBe(false);
    });

    it("drops the fallback silently when no font is resolvable (optional synthetic, e.g. the defaults map)", () => {
        const resolved = resolveAxes(
            fakeHost({ autoOPSZ: false, axesLocations: {} }),
            {
                font: null,
            },
        );
        expect(resolved.has("axesLocations/opsz")).toBe(false);
    });
});

describe("manualAxesLocationsModelMixin", () => {
    const createAutoOPSZValue = (mixin) =>
        _AbstractStructModel
            .createClass("ManualAxesLocationsMixinTestModel", ...mixin)
            .createPrimalDraft({})
            .metamorphose()
            .get("autoOPSZ").value;

    it("defaults autoOPSZ to false for the plain BooleanModel (legacy/animation consumers)", () => {
        expect(createAutoOPSZValue(manualAxesLocationsModelMixin())).toBe(
            false,
        );
        expect(
            createAutoOPSZValue(manualAxesLocationsModelMixin(BooleanModel)),
        ).toBe(false);
    });

    it("defaults autoOPSZ to true when BooleanDefaultTrueModel is passed (the grid)", () => {
        expect(
            createAutoOPSZValue(
                manualAxesLocationsModelMixin(BooleanDefaultTrueModel),
            ),
        ).toBe(true);
    });
});
