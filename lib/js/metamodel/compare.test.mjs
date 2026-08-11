import { describe, it, expect, vi } from "vitest";
import {
    _AbstractStructModel,
    _AbstractListModel,
    StringModel,
    StateComparison,
} from "./metamodel.ts";

const KeyMomentLikeModel = _AbstractStructModel.createClass(
        "KeyMomentLikeModel",
        ["label", StringModel],
    ),
    KeyMomentsLikeModel = _AbstractListModel.createClass(
        "KeyMomentsLikeModel",
        KeyMomentLikeModel,
    ),
    RootModel = _AbstractStructModel.createClass("RootModel", [
        "keyMoments",
        KeyMomentsLikeModel,
    ]);

function createStateWithKeyMoment(label) {
    const draft = RootModel.createPrimalDraft({}),
        keyMomentsDraft = draft.getDraftFor("keyMoments"),
        keyMomentDraft = keyMomentsDraft.constructor.Model.createPrimalDraft(
            keyMomentsDraft.dependencies,
        );
    keyMomentDraft.getDraftFor("label").value = label;
    keyMomentsDraft.push(keyMomentDraft);
    return draft.metamorphose({});
}

describe("StateComparison.createInitial with a dependencyMapping", () => {
    it("skips dependency paths that can't be resolved in newState", () => {
        // E.g. a widget depends on a list item that is not present in
        // the new state (keyMoments is empty here). This must not break
        // getChangedMap.
        const state = RootModel.createPrimalState({}),
            dependencies = new Map([["/keyMoments/0/label", "label"]]),
            warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        let comparison = null,
            changedMap = null,
            warnCallCount = 0;
        try {
            comparison = StateComparison.createInitial(state, dependencies);
            changedMap = comparison.getChangedMap();
        } finally {
            // mockRestore wipes the recorded calls, so capture the count.
            warnCallCount = warn.mock.calls.length;
            warn.mockRestore();
        }
        expect(warnCallCount).toBe(1);
        expect(changedMap.size).toBe(0);
    });

    it("keeps dependency paths that can be resolved in newState", () => {
        const state = createStateWithKeyMoment("hello"),
            dependencies = new Map([["/keyMoments/0/label", "label"]]),
            comparison = StateComparison.createInitial(state, dependencies),
            changedMap = comparison.getChangedMap();
        expect(changedMap.size).toBe(1);
        expect(changedMap.get("/keyMoments/0/label").value).toBe("hello");
    });
});
