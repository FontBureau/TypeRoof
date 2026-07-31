// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    serialize,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../metamodel.mjs";
import {
    IntentStyleLinksMapModel,
    MarkStyleLinksMapModel,
    getStylePatchLinkForIntent,
    getStylePatchLinkForMark,
    getStylePatchTagForIntent,
} from "./type-spec-models.mjs";

const pmMark = (name, attrs = {}) => ({ type: { name }, attrs });

function addIntentEdge(linksDraft, key, stylePatch, tag = "") {
    const edgeDraft = linksDraft.constructor.Model.createPrimalDraft({});
    edgeDraft.get("stylePatch").value = stylePatch;
    if (tag !== "") edgeDraft.get("tag").value = tag;
    linksDraft.set(key, edgeDraft);
}

function addMarkEdge(linksDraft, key, stylePatch) {
    const edgeDraft = linksDraft.constructor.Model.createPrimalDraft({});
    edgeDraft.get("stylePatch").value = stylePatch;
    linksDraft.set(key, edgeDraft);
}

describe("style-link resolution is structurally separated by map", () => {
    it("an intent resolves its style from intentStyleLinks by style name", () => {
        const draft = IntentStyleLinksMapModel.createPrimalDraft({});
        addIntentEdge(draft, "bold", "bold");
        const links = draft.metamorphose();
        expect(getStylePatchLinkForIntent(links, "bold")).toBe("bold");
        expect(getStylePatchLinkForIntent(links, "italic")).toBe(null);
    });

    it("a schema mark resolves its style from markStyleLinks by type name", () => {
        const draft = MarkStyleLinksMapModel.createPrimalDraft({});
        addMarkEdge(draft, "strong", "bold");
        const links = draft.metamorphose();
        expect(getStylePatchLinkForMark(links, pmMark("strong"))).toBe(
            "strong",
        );
        expect(getStylePatchLinkForMark(links, pmMark("em"))).toBe(null);
    });

    it("an intentStyleLinks edge does NOT style a schema mark of the same name", () => {
        const intentDraft = IntentStyleLinksMapModel.createPrimalDraft({});
        addIntentEdge(intentDraft, "strong", "bold");
        const markLinks = MarkStyleLinksMapModel.createPrimalDraft(
            {},
        ).metamorphose();
        expect(getStylePatchLinkForMark(markLinks, pmMark("strong"))).toBe(
            null,
        );
    });

    it("a markStyleLinks edge does NOT style an intent of the same name", () => {
        const markDraft = MarkStyleLinksMapModel.createPrimalDraft({});
        addMarkEdge(markDraft, "strong", "bold");
        const intentLinks = IntentStyleLinksMapModel.createPrimalDraft(
            {},
        ).metamorphose();
        expect(getStylePatchLinkForIntent(intentLinks, "strong")).toBe(null);
    });
});

describe("getStylePatchTagForIntent", () => {
    it("returns the tag of the edge keyed by the style name", () => {
        const draft = IntentStyleLinksMapModel.createPrimalDraft({});
        addIntentEdge(draft, "bold", "bold", "strong");
        expect(getStylePatchTagForIntent(draft.metamorphose(), "bold")).toBe(
            "strong",
        );
    });

    it("returns null when no edge is keyed by the style name", () => {
        const draft = IntentStyleLinksMapModel.createPrimalDraft({});
        addIntentEdge(draft, "bold", "bold", "strong");
        expect(
            getStylePatchTagForIntent(draft.metamorphose(), "italic"),
        ).toBe(null);
    });

    it("returns null when the tag field is empty", () => {
        const draft = IntentStyleLinksMapModel.createPrimalDraft({});
        addIntentEdge(draft, "bold", "bold");
        expect(getStylePatchTagForIntent(draft.metamorphose(), "bold")).toBe(
            null,
        );
    });
});

describe("style-link edge coherence (mode)", () => {
    it("mode 'unlinked' (tombstone) clears stylePatch", () => {
        const draft = MarkStyleLinksMapModel.createPrimalDraft({}),
            edgeDraft = draft.constructor.Model.createPrimalDraft({});
        edgeDraft.get("stylePatch").value = "some-patch";
        edgeDraft.get("mode").value = "unlinked";
        // coherence runs at (draft) init and metamorphose
        expect(edgeDraft.metamorphose().get("stylePatch").value).toBe("");
    });
});

describe("style-links serialization", () => {
    const options = Object.assign({}, SERIALIZE_OPTIONS, {
        format: SERIALIZE_FORMAT_OBJECT,
    });
    it("intentStyleLinks round-trips with tag and mode", () => {
        const draft = IntentStyleLinksMapModel.createPrimalDraft({});
        addIntentEdge(draft, "bold", "bold", "strong");
        const links = draft.metamorphose(),
            [errors, serialized] = serialize(links, options);
        expect(errors).toEqual([]);
        const restored = deserializeSync(
            IntentStyleLinksMapModel,
            {},
            serialized,
            options,
        );
        expect(restored.get("bold").get("stylePatch").value).toBe("bold");
        expect(restored.get("bold").get("tag").value).toBe("strong");
        expect(restored.get("bold").get("mode").value).toBe("link");
    });

    it("markStyleLinks round-trips", () => {
        const draft = MarkStyleLinksMapModel.createPrimalDraft({});
        addMarkEdge(draft, "strong", "bold");
        const links = draft.metamorphose(),
            [errors, serialized] = serialize(links, options);
        expect(errors).toEqual([]);
        const restored = deserializeSync(
            MarkStyleLinksMapModel,
            {},
            serialized,
            options,
        );
        expect(restored.get("strong").get("stylePatch").value).toBe("bold");
        expect(restored.get("strong").get("mode").value).toBe("link");
    });

    it("deserializes the legacy edge shape (stylePatch only)", () => {
        const data = [["bold", { stylePatch: "bold" }]],
            restored = deserializeSync(
                IntentStyleLinksMapModel,
                {},
                data,
                options,
            );
        expect(restored.get("bold").get("stylePatch").value).toBe("bold");
        expect(restored.get("bold").get("mode").value).toBe("link");
        expect(restored.get("bold").get("tag").isEmpty).toBe(true);
    });
});
