// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    serialize,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../metamodel.mjs";
import {
    StylePatchLinksMapModel,
    getStylePatchLinkForMark,
} from "./type-spec-models.mjs";

const pmMark = (name, attrs = {}) => ({ type: { name }, attrs });

function createLinksDraft() {
    return StylePatchLinksMapModel.createPrimalDraft({});
}

function addEdge(linksDraft, key, stylePatch, mark = null) {
    const edgeDraft = linksDraft.constructor.Model.createPrimalDraft({});
    edgeDraft.get("stylePatch").value = stylePatch;
    if (mark !== null) edgeDraft.get("mark").value = mark;
    linksDraft.set(key, edgeDraft);
}

describe("getStylePatchLinkForMark", () => {
    it("explicit mark link wins over key matching", () => {
        const draft = createLinksDraft();
        addEdge(draft, "whatever", "some-patch", "strong");
        addEdge(draft, "strong", "other-patch");
        expect(getStylePatchLinkForMark(draft.metamorphose(), pmMark("strong"))).toBe(
            "whatever",
        );
    });

    it("falls back to the mark type name as edge key", () => {
        const draft = createLinksDraft();
        addEdge(draft, "strong", "some-patch");
        expect(getStylePatchLinkForMark(draft.metamorphose(), pmMark("strong"))).toBe(
            "strong",
        );
    });

    it("data-style-name regression: generic-style resolves by style name", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold");
        const mark = pmMark("generic-style", { "data-style-name": "bold" });
        expect(getStylePatchLinkForMark(draft.metamorphose(), mark)).toBe("bold");
    });

    it("multiple edges can link the same patch to different marks", () => {
        const draft = createLinksDraft();
        addEdge(draft, "a", "shared-patch", "strong");
        addEdge(draft, "b", "shared-patch", "em");
        const links = draft.metamorphose();
        expect(getStylePatchLinkForMark(links, pmMark("em"))).toBe("b");
        expect(getStylePatchLinkForMark(links, pmMark("strong"))).toBe("a");
    });
});

describe("StylePatchLinkModel serialization", () => {
    it("serializes struct edges and round-trips", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold");
        addEdge(draft, "emphasis", "italic", "em");
        const links = draft.metamorphose();
        const options = Object.assign({}, SERIALIZE_OPTIONS, {
            format: SERIALIZE_FORMAT_OBJECT,
        });
        const [errors, serialized] = serialize(links, options);
        expect(errors).toEqual([]);
        console.log("SERIALIZED EDGES:", JSON.stringify(serialized));
        const restored = deserializeSync(
            StylePatchLinksMapModel,
            {},
            serialized,
            options,
        );
        expect(restored.get("bold").get("stylePatch").value).toBe("bold");
        expect(restored.get("bold").get("mark").value).toBe("");
        expect(restored.get("emphasis").get("mark").value).toBe("em");
    });

    it("deserializes struct edges without a mark field (upgraded states)", () => {
        const options = Object.assign({}, SERIALIZE_OPTIONS, {
                format: SERIALIZE_FORMAT_OBJECT,
            }),
            // shape written by the in-place state upgrade
            data = [
                ["bold", { stylePatch: "bold" }],
                ["emphasis", { stylePatch: "italic", mark: "em" }],
            ],
            restored = deserializeSync(
                StylePatchLinksMapModel,
                {},
                data,
                options,
            );
        expect(restored.get("bold").get("mark").value).toBe("");
        expect(restored.get("emphasis").get("mark").value).toBe("em");
    });
});
