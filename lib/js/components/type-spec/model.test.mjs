/**
 * Behavior tests for the shim resolution/provisioning flags on
 * TypeSpecModel (Step 3 of the shim flags & relative linking
 * implementation): (de)serialization round-trip of a typeSpec tree
 * with the flags set, and legacy documents without flag fields loading
 * unchanged (inert until anything reads them).
 */
import { describe, it, expect } from "vitest";
import {
    serialize,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    ForeignKey,
} from "../../metamodel.mjs";
import { InstalledFontsModel, InstalledFontModel } from "./../main-model.mjs";
import { StylePatchesMapModel, TypeSpecModel } from "./models.mjs";
import { createTextCompositionAlgorithm } from "./text-composition-models.mjs";

const OPTIONS = Object.assign({}, SERIALIZE_OPTIONS, {
    format: SERIALIZE_FORMAT_OBJECT,
});

/**
 * TypeSpecModel has InternalizedDependency fields ('installedFonts',
 * 'stylePatchesSource', 'font' via parentFont in the typography
 * mixin). The minimal instances satisfy them and let us exercise the
 * (de)serialization round-trip without pulling in a full layout.
 */
function makeDeps() {
    const empty = (Model) => Model.createPrimalDraft({}).metamorphose(),
        font = empty(InstalledFontModel),
        installedFonts = empty(InstalledFontsModel),
        // stylePatchesSource has internalized children (font/installedFonts),
        // so its draft needs those as well.
        stylePatchesSource = StylePatchesMapModel.createPrimalDraft({
            font,
            installedFonts,
        }).metamorphose();
    return { font, installedFonts, stylePatchesSource };
}

describe("TypeSpecModel resolution/provisioning flags", () => {
    it("flags round-trip through (de)serialization", () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps),
            child = draft
                .get("children")
                .constructor.Model.createPrimalDraft(deps);
        draft.get("noStyler").value = true;
        draft.get("excludeFromFallback").value = true;
        draft.get("children").set("nested", child);

        const [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(errors).toEqual([]);
        // BooleanModel serializes truthy as "1" (and omits the default).
        expect(serialized.noStyler).toBe("1");
        expect(serialized.excludeFromFallback).toBe("1");
        expect(restored.get("noStyler").value).toBe(true);
        expect(restored.get("excludeFromFallback").value).toBe(true);
        expect(restored.get("children").has("nested")).toBe(true);
    });

    it("defaults make them inert and existing documents load unchanged", () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps),
            [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(errors).toEqual([]);
        // Default-false flags are omitted from the serialized payload,
        // matching the pre-flag document shape (indistinguishable load).
        expect("noStyler" in serialized).toBe(false);
        expect("excludeFromFallback" in serialized).toBe(false);
        expect(restored.get("noStyler").value).toBe(false);
        expect(restored.get("excludeFromFallback").value).toBe(false);
    });

    it("a saved document without flag fields still loads", () => {
        const deps = makeDeps(),
            serialized = { label: "legacy document" },
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(restored.get("noStyler").value).toBe(false);
        expect(restored.get("excludeFromFallback").value).toBe(false);
        expect(restored.get("label").value).toBe("legacy document");
    });
});

describe("TypeSpecModel textCompositionAlgorithm dynamic struct", () => {
    // Algorithm selection + configuration (milestone 2 phase 2):
    // dynamic struct per typeSpec, empty instance = inherit.
    it("defaults to no algorithm selected (inherit)", () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps),
            state = draft.metamorphose();
        expect(
            state
                .get("textCompositionAlgorithm")
                .get("textCompositionAlgorithmTypeKey").value,
        ).toBe(ForeignKey.NULL);
    });

    it("a selected algorithm with config round-trips through (de)serialization", () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps);
        // the create helper materializes the instance (the typeKey
        // alone doesn't — the dynamic struct instantiates via
        // createDynamicType)
        draft.set(
            "textCompositionAlgorithm",
            createTextCompositionAlgorithm(
                "TextCompositionAlgorithmDummyModel",
                deps,
            ),
        );
        draft
            .get("textCompositionAlgorithm")
            .get("instance")
            .wrapped.get("segmentsPerLine").value = 7;
        const [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(errors).toEqual([]);
        expect(
            restored
                .get("textCompositionAlgorithm")
                .get("textCompositionAlgorithmTypeKey").value,
        ).toBe("TextCompositionAlgorithmDummyModel");
        expect(
            restored
                .get("textCompositionAlgorithm")
                .get("instance")
                .wrapped.get("segmentsPerLine").value,
        ).toBe(7);
    });

    it("the Knuth-Plass struct round-trips through (de)serialization; untouched fields stay empty (inherit)", () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps);
        draft.set(
            "textCompositionAlgorithm",
            createTextCompositionAlgorithm(
                "TextCompositionAlgorithmKnuthPlassModel",
                deps,
            ),
        );
        const instance = draft
            .get("textCompositionAlgorithm")
            .get("instance").wrapped;
        instance.get("linePenalty").value = 20;
        instance.get("hyphenPenalty").value = 30;
        instance.get("balanceGray").value = false;
        instance.get("latticeQuantum").value = 0.5;
        instance.get("colorCoding").value = "off";
        // milestone-6 named-potentials fields (KP shares them with
        // greedy-fit; no treatments off-list for KP)
        instance.get("potentials").value = "amstelvarHeadline";
        instance.get("potentialsAnchoring").value = "font";
        const [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(errors).toEqual([]);
        expect(
            restored
                .get("textCompositionAlgorithm")
                .get("textCompositionAlgorithmTypeKey").value,
        ).toBe("TextCompositionAlgorithmKnuthPlassModel");
        const restoredInstance = restored
            .get("textCompositionAlgorithm")
            .get("instance").wrapped;
        expect(restoredInstance.get("linePenalty").value).toBe(20);
        expect(restoredInstance.get("hyphenPenalty").value).toBe(30);
        expect(restoredInstance.get("balanceGray").value).toBe(false);
        expect(restoredInstance.get("latticeQuantum").value).toBe(0.5);
        expect(restoredInstance.get("colorCoding").value).toBe("off");
        expect(restoredInstance.get("potentials").value).toBe(
            "amstelvarHeadline",
        );
        expect(restoredInstance.get("potentialsAnchoring").value).toBe("font");
        expect(restoredInstance.get("potentialsLocationOverrides").size).toBe(
            0,
        );
        // untouched fields stay empty (inherit)
        expect(restoredInstance.get("doubleHyphenDemerits").isEmpty).toBe(true);
        expect(restoredInstance.get("finalHyphenDemerits").isEmpty).toBe(true);
        expect(restoredInstance.get("adjDemerits").isEmpty).toBe(true);
        expect(restoredInstance.get("polish").isEmpty).toBe(true);
    });
});

describe("TypeSpecModel hyphenation configuration", () => {
    // Inheritable Host control (milestone 3, phase 2): all fields
    // OrEmpty — empty = inherit.
    it("defaults to all-empty (inherit)", () => {
        const deps = makeDeps(),
            state = TypeSpecModel.createPrimalDraft(deps).metamorphose(),
            hyphenation = state.get("hyphenation");
        for (const field of [
            "enabled",
            "minWordLength",
            "minBefore",
            "minAfter",
        ])
            expect(hyphenation.get(field).isEmpty).toBe(true);
    });

    it("configuration round-trips through (de)serialization", () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps);
        draft.get("hyphenation").get("enabled").value = false;
        draft.get("hyphenation").get("minBefore").value = 4;
        const [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(errors).toEqual([]);
        expect(restored.get("hyphenation").get("enabled").value).toBe(false);
        expect(restored.get("hyphenation").get("minBefore").value).toBe(4);
        // untouched fields stay empty (inherit)
        expect(restored.get("hyphenation").get("minAfter").isEmpty).toBe(true);
    });
});

describe("TypeSpecModel textCompositionAlgorithm milestone-6 fields (named potentials)", () => {
    const makeGreedyFitDraft = () => {
        const deps = makeDeps(),
            draft = TypeSpecModel.createPrimalDraft(deps);
        draft.set(
            "textCompositionAlgorithm",
            createTextCompositionAlgorithm(
                "TextCompositionAlgorithmGreedyFitModel",
                deps,
            ),
        );
        return [
            draft,
            draft.get("textCompositionAlgorithm").get("instance").wrapped,
            deps,
        ];
    };

    it("the greedy-fit fields round-trip through (de)serialization", () => {
        const [draft, instance, deps] = makeGreedyFitDraft();
        instance.get("potentials").value = "robotoFlexHeadline";
        instance.get("potentialsAnchoring").value = "off";
        // the treatments off-list: one disabled tag
        const treatments = instance.get("treatments"),
            item = treatments.constructor.Model.createPrimalDraft(
                treatments.dependencies,
            );
        item.value = "wdth";
        treatments.push(item);
        // the overrides map: one tag -> number
        const overrides = instance.get("potentialsLocationOverrides"),
            value = overrides.constructor.Model.createPrimalDraft(
                overrides.dependencies,
            );
        value.value = 24;
        overrides.push(["opsz", value]);
        const [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            restored = deserializeSync(
                TypeSpecModel,
                deps,
                serialized,
                OPTIONS,
            );
        expect(errors).toEqual([]);
        const restoredInstance = restored
            .get("textCompositionAlgorithm")
            .get("instance").wrapped;
        expect(restoredInstance.get("potentials").value).toBe(
            "robotoFlexHeadline",
        );
        expect(restoredInstance.get("potentialsAnchoring").value).toBe("off");
        const restoredTreatments = [...restoredInstance.get("treatments")].map(
            ([, tag]) => tag.value,
        );
        expect(restoredTreatments).toEqual(["wdth"]);
        const restoredOverrides = restoredInstance.get(
            "potentialsLocationOverrides",
        );
        expect(restoredOverrides.get("opsz").value).toBe(24);
    });

    it("coherence dedupes and prunes the treatments off-list against a NAMED configuration", () => {
        const [, instance] = makeGreedyFitDraft();
        instance.get("potentials").value = "robotoFlexHeadline";
        // robotoFlexHeadline offers ONLY wdth: XTRA and the duplicate
        // must not survive metamorphose
        const treatments = instance.get("treatments");
        for (const tag of ["wdth", "XTRA", "wdth"]) {
            const item = treatments.constructor.Model.createPrimalDraft(
                treatments.dependencies,
            );
            item.value = tag;
            treatments.push(item);
        }
        const state = instance.metamorphose(),
            // re-read via the state (coherence ran at metamorphose)
            stateTreatments = [...state.get("treatments")].map(
                ([, tag]) => tag.value,
            );
        expect(stateTreatments).toEqual(["wdth"]);
    });

    it("coherence leaves the treatments off-list alone for auto (font-dependent)", () => {
        const [, instance] = makeGreedyFitDraft();
        instance.get("potentials").value = "auto";
        const treatments = instance.get("treatments");
        for (const tag of ["XTRA", "wdth"]) {
            const item = treatments.constructor.Model.createPrimalDraft(
                treatments.dependencies,
            );
            item.value = tag;
            treatments.push(item);
        }
        const state = instance.metamorphose(),
            stateTreatments = [...state.get("treatments")].map(
                ([, tag]) => tag.value,
            );
        expect(stateTreatments).toEqual(["XTRA", "wdth"]);
    });

    it("a legacy document with the dropped treatment toggles loads cleanly (unknown fields drop)", () => {
        const [draft, , deps] = makeGreedyFitDraft(),
            // the dynamic struct serializes the instance only when a
            // field is set: build the legacy payload explicitly (the
            // pre-milestone-6 shape: ONLY the three toggles)
            [errors, serialized] = serialize(draft.metamorphose(), OPTIONS),
            legacySerialized = {
                ...serialized,
                textCompositionAlgorithm: {
                    textCompositionAlgorithmTypeKey:
                        "TextCompositionAlgorithmGreedyFitModel",
                    instance: {
                        treatmentXTRA: false,
                        treatmentTracking: true,
                        treatmentWordspace: false,
                    },
                },
            };
        const restored = deserializeSync(
            TypeSpecModel,
            deps,
            legacySerialized,
            OPTIONS,
        );
        expect(errors).toEqual([]);
        const restoredInstance = restored
            .get("textCompositionAlgorithm")
            .get("instance").wrapped;
        // the toggles are gone; the new defaults apply (inherit)
        expect(restoredInstance.get("potentials").isEmpty).toBe(true);
        expect(restoredInstance.get("potentialsAnchoring").isEmpty).toBe(true);
        expect([...restoredInstance.get("treatments")]).toEqual([]);
    });
});
