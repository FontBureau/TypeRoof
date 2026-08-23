// Behavior test for the length model and its use in the
// type-stage model: legacy documents (without width/height) metamorphose
// to width=100% layout + height unset; the boundness rule holds
// (width always bound, height optional, both unset never valid);
// lengthToCSSPX maps units to css-px.
import { describe, it, expect } from "vitest";

import { lengthIsSet } from "../../length-models.mjs";
import {
    _AbstractStructModel,
    InternalizedDependency,
    SERIALIZE_FORMAT_OBJECT,
    SERIALIZE_OPTIONS,
    deserializeSync,
} from "../../../metamodel.mjs";
import { InstalledFontsModel, InstalledFontModel } from "../../main-model.mjs";
import { createTypeStageModelVariantWithDefaults } from "./index.typeroof.jsx";

describe("type-stage width/height fields", () => {
    const TypeStageModel = createTypeStageModelVariantWithDefaults(
        "TypeStageLengthTestModel",
        {},
    );
    // Type-stage creation requires dependencies (fonts etc.); like the
    // test harnesses, wrap it so the dependencies are internalized.
    const WrapperModel = _AbstractStructModel.createClass(
        "LengthTestWrapperModel",
        [
            "installedFonts",
            new InternalizedDependency("installedFonts", InstalledFontsModel),
        ],
        ["font", new InternalizedDependency("font", InstalledFontModel)],
        ["activeState", TypeStageModel],
    );

    const deserialize = (activeStateData) =>
        deserializeSync(
            WrapperModel,
            {
                installedFonts: InstalledFontsModel.createPrimalState({}),
                font: (() => {
                    const draft =
                        InstalledFontModel.createPrimalState(null).getDraft();
                    draft.value = {
                        fullName: "LengthTest FakeFont",
                        fontObject: {
                            unitsPerEm: 2048,
                            ascender: 1638,
                            descender: -410,
                        },
                        axisRanges: {},
                    };
                    return draft.metamorphose();
                })(),
            },
            { activeState: activeStateData },
            Object.assign({}, SERIALIZE_OPTIONS, {
                format: SERIALIZE_FORMAT_OBJECT,
            }),
        ).get("activeState");

    it("legacy documents get width=100% layout, height unset", () => {
        const state = deserialize({
            width: null,
            height: null,
        });
        const width = state.get("width");
        expect(lengthIsSet(width)).toBe(true);
        expect(width.get("value").value).toBe(100);
        expect(width.get("unit").value).toBe("percent-layout");
        expect(lengthIsSet(state.get("height"))).toBe(false);
    });

    it("width unset is normalized to the default (width must always be bound); both unset is normalized", () => {
        // Per decision: width MUST be bound, height MAY be unset. So a
        // document with width unset is normalized by coherence to the
        // default, regardless of height. (The future relaxation —
        // width unbound iff height set — is recorded but not active.)
        const state = deserialize({
            width: null,
            height: { value: 50, unit: "percent-layout" },
        });
        expect(lengthIsSet(state.get("width"))).toBe(true);
        expect(state.get("width").get("unit").value).toBe("percent-layout");
        expect(lengthIsSet(state.get("height"))).toBe(true);
        expect(state.get("height").get("value").value).toBe(50);

        // both unset: coherence binds width to the default.
        const state2 = deserialize({
            width: null,
            height: null,
        });
        expect(lengthIsSet(state2.get("width"))).toBe(true);
        expect(state2.get("width").get("unit").value).toBe("percent-layout");
    });
});
