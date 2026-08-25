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
} from "../metamodel.mjs";
import { InstalledFontsModel, InstalledFontModel } from "./main-model.mjs";
import { StylePatchesMapModel, TypeSpecModel } from "./type-spec-models.mjs";

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
