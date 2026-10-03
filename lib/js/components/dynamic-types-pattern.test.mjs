// Regression test: clearing a SELECTED dynamic-struct typeKey
// (ForeignKey.NULL) through the write proxy must metamorphose to an
// EMPTY (inherit) struct — it used to crash with LIFECYCLE ERROR
// "DynamicModel has no value element" (unguarded .wrapped reads on a
// primal OLD_STATE in dynamic-struct-model.ts metamorphoseGen).
import { describe, it, expect } from "vitest";
import {
    _AbstractStructModel,
    StringModel,
    ForeignKey,
} from "../metamodel.mjs";
import { createDynamicModel } from "./dynamic-types-pattern.mjs";

const TypeAModel = _AbstractStructModel.createClass("ProbeTypeAModel", [
        "label",
        StringModel,
    ]),
    TypeBModel = _AbstractStructModel.createClass("ProbeTypeBModel"),
    { ProbeAlgorithmModel, createProbeAlgorithm } = createDynamicModel(
        "ProbeAlgorithm",
        [
            ["ProbeTypeAModel", "Type A", TypeAModel],
            ["ProbeTypeBModel", "Type B", TypeBModel],
        ],
    ),
    HostModel = _AbstractStructModel.createClass("ProbeHostModel", [
        "algorithm",
        ProbeAlgorithmModel,
    ]);

describe("dynamic-types-pattern: clearing a selection", () => {
    it("nulling a selected typeKey metamorphoses to empty (inherit)", () => {
        const draft = HostModel.createPrimalDraft({});
        draft.set("algorithm", createProbeAlgorithm("ProbeTypeAModel", {}));
        draft.get("algorithm").get("instance").wrapped.get("label").value =
            "configured";
        // the clearing: empty = inherit
        draft.get("algorithm").get("probeAlgorithmTypeKey").value =
            ForeignKey.NULL;
        const state = draft.metamorphose();
        expect(state.get("algorithm").get("probeAlgorithmTypeKey").value).toBe(
            ForeignKey.NULL,
        );
        expect(state.get("algorithm").get("instance").hasWrapped).toBe(false);
    });

    it("metamorphosing an untouched empty struct stays empty", () => {
        const state = HostModel.createPrimalDraft({}).metamorphose();
        expect(state.get("algorithm").get("probeAlgorithmTypeKey").value).toBe(
            ForeignKey.NULL,
        );
        expect(state.get("algorithm").get("instance").hasWrapped).toBe(false);
    });
});
