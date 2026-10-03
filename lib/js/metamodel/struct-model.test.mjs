import { describe, it, expect } from "vitest";
import {
    _AbstractStructModel,
    CoherenceFunction,
    InternalizedDependency,
    ResourceRequirement,
    StringModel,
    driveResolveGenAsync,
    isDeliberateResourceResolveError,
} from "./metamodel.ts";

// Minimal protocol fixture: consuming the child locks it before a later
// resource request suspends the parent. No UI or asset loader is involved.
const ChildModel = _AbstractStructModel.createClass(
        "ResourceReadChildModel",
        ["language", StringModel],
        ["note", StringModel],
    ),
    ConsumerModel = _AbstractStructModel.createClass(
        "ResourceReadConsumerModel",
        ["child", new InternalizedDependency("child", ChildModel)],
        CoherenceFunction.create(
            ["child"],
            function* requireLanguage({ child }) {
                if (child.get("language").value === "de")
                    yield new ResourceRequirement("language", "de");
            },
        ),
    ),
    RootModel = _AbstractStructModel.createClass(
        "ResourceReadRootModel",
        ["child", ChildModel],
        ["consumer", ConsumerModel],
    );

function createLanguageState() {
    const draft = RootModel.createPrimalDraft({});
    draft.getDraftFor("child").getDraftFor("language").value = "en";
    return draft.metamorphose();
}

function createPendingLanguageChange(state) {
    const draft = state.getDraft(),
        child = draft.getDraftFor("child");
    child.getDraftFor("language").value = "de";
    child.getDraftFor("note").value = "keep this edit";
    let failure;
    try {
        draft.metamorphose();
    } catch (error) {
        failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(isDeliberateResourceResolveError(failure)).toBe(true);
    return draft;
}

describe("struct reads after a partial metamorphosis", () => {
    it("reads the updated child while a later resource is unresolved", () => {
        const state = createLanguageState(),
            draft = createPendingLanguageChange(state);
        expect(draft.get("child").get("language").value).toBe("de");
        expect(draft.get("child").get("note").value).toBe("keep this edit");
        expect(state.get("child").get("language").value).toBe("en");
        expect(state.get("child").get("note").value).toBe("");
    });

    it("subsequent writes preserve the already finalized edits", async () => {
        const state = createLanguageState(),
            draft = createPendingLanguageChange(state);
        draft.get("child").get("note").value = "another edit";
        const requests = [],
            result = await driveResolveGenAsync(async (requirement) => {
                requests.push(requirement.description);
            }, draft.metamorphoseGen());
        expect(requests).toEqual([["language", "de"]]);
        expect(result.get("child").get("language").value).toBe("de");
        expect(result.get("child").get("note").value).toBe("another edit");
        expect(state.get("child").get("language").value).toBe("en");
    });

    it("can edit a child finalized after writing through a proxy", async () => {
        const state = createLanguageState(),
            draft = state.getDraft();
        draft.get("child").get("language").value = "de";
        expect(() => draft.metamorphose()).toThrow("FAILING DELIBERATELY");
        expect(draft.get("child").get("language").value).toBe("de");
        draft.get("child").get("note").value = "another edit";
        const result = await driveResolveGenAsync(
            async () => {},
            draft.metamorphoseGen(),
        );
        expect(result.get("child").get("language").value).toBe("de");
        expect(result.get("child").get("note").value).toBe("another edit");
    });

    it("keeps repeated reads connected to subsequent writes", () => {
        const state = createLanguageState(),
            draft = state.getDraft(),
            firstRead = draft.get("child"),
            secondRead = draft.get("child");
        firstRead.get("note").value = "shared edit";
        expect(secondRead.get("note").value).toBe("shared edit");
        expect(draft.metamorphose().get("child").get("note").value).toBe(
            "shared edit",
        );
    });
});
