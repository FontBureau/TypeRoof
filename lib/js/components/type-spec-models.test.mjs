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
    getStylePatchTagForIntent,
} from "./type-spec-models.mjs";

const pmMark = (name, attrs = {}) => ({ type: { name }, attrs });

function createLinksDraft() {
    return StylePatchLinksMapModel.createPrimalDraft({});
}

function addEdge(linksDraft, key, stylePatch, link = null) {
    const edgeDraft = linksDraft.constructor.Model.createPrimalDraft({});
    edgeDraft.get("stylePatch").value = stylePatch;
    if (link !== null) {
        edgeDraft.get("type").value = link.type;
        if (link.type === "mark") edgeDraft.get("mark").value = link.name;
        else edgeDraft.get("tag").value = link.name;
    }
    linksDraft.set(key, edgeDraft);
}

describe("getStylePatchLinkForMark", () => {
    it("explicit mark link wins over key matching", () => {
        const draft = createLinksDraft();
        addEdge(draft, "whatever", "some-patch", { type: "mark", name: "strong" });
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
        addEdge(draft, "a", "shared-patch", { type: "mark", name: "strong" });
        addEdge(draft, "b", "shared-patch", { type: "mark", name: "em" });
        const links = draft.metamorphose();
        expect(getStylePatchLinkForMark(links, pmMark("em"))).toBe("b");
        expect(getStylePatchLinkForMark(links, pmMark("strong"))).toBe("a");
    });
});

describe("getStylePatchTagForIntent", () => {
    it("returns the tag of a generic-tag edge keyed by the style name", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold", { type: "generic-tag", name: "strong" });
        expect(getStylePatchTagForIntent(draft.metamorphose(), "bold")).toBe(
            "strong",
        );
    });

    it("returns null for a type=mark edge (not a render tag)", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold", { type: "mark", name: "strong" });
        expect(
            getStylePatchTagForIntent(draft.metamorphose(), "bold"),
        ).toBe(null);
    });

    it("returns null when no edge is keyed by the style name", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold", { type: "generic-tag", name: "strong" });
        expect(
            getStylePatchTagForIntent(draft.metamorphose(), "italic"),
        ).toBe(null);
    });

    it("returns null when the tag field is empty", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold");
        expect(getStylePatchTagForIntent(draft.metamorphose(), "bold")).toBe(
            null,
        );
    });

    it("returns null for an explicit empty-string tag (toggled on, no value)", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold", { type: "generic-tag", name: "" });
        expect(getStylePatchTagForIntent(draft.metamorphose(), "bold")).toBe(
            null,
        );
    });
});

describe("StylePatchLinkModel typed target", () => {
    it("a generic-tag link does not style schema mark instances", () => {
        const draft = createLinksDraft();
        addEdge(draft, "whatever", "some-patch", {
            type: "generic-tag",
            name: "strong",
        });
        // no type=mark link and no edge keyed "strong": falls back to
        // the mark type name as candidate edge key
        expect(
            getStylePatchLinkForMark(draft.metamorphose(), pmMark("strong")),
        ).toBe("strong");
    });

    it("coherence: switching type clears the inactive target field", () => {
        // NOTE: coherence functions run at (draft) init and metamorphose,
        // not on every set, so assert on the metamorphosed state.
        const linksDraft = createLinksDraft(),
            edgeDraft = linksDraft.constructor.Model.createPrimalDraft({});
        edgeDraft.get("stylePatch").value = "some-patch";
        edgeDraft.get("type").value = "mark";
        edgeDraft.get("mark").value = "strong";
        edgeDraft.get("type").value = "generic-tag";
        expect(edgeDraft.metamorphose().get("mark").isEmpty).toBe(true);

        const otherDraft = linksDraft.constructor.Model.createPrimalDraft({});
        otherDraft.get("stylePatch").value = "some-patch";
        otherDraft.get("tag").value = "strong";
        otherDraft.get("type").value = "mark";
        expect(otherDraft.metamorphose().get("tag").isEmpty).toBe(true);
    });
});

describe("StylePatchLinkModel serialization", () => {
    it("serializes struct edges and round-trips", () => {
        const draft = createLinksDraft();
        addEdge(draft, "bold", "bold");
        addEdge(draft, "emphasis", "italic", { type: "mark", name: "em" });
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
        expect(restored.get("bold").get("type").value).toBe("generic-tag");
        expect(restored.get("bold").get("mark").isEmpty).toBe(true);
        expect(restored.get("emphasis").get("mark").value).toBe("em");
    });

    it("deserializes struct edges (upgraded states shape)", () => {
        const options = Object.assign({}, SERIALIZE_OPTIONS, {
                format: SERIALIZE_FORMAT_OBJECT,
            }),
            // shape written by the in-place state upgrade: type is always
            // serialized, OrEmpty tag/mark only when set
            data = [
                ["bold", { stylePatch: "bold" }],
                ["emphasis", { stylePatch: "italic", type: "mark", mark: "em" }],
            ],
            restored = deserializeSync(
                StylePatchLinksMapModel,
                {},
                data,
                options,
            );
        expect(restored.get("bold").get("type").value).toBe("generic-tag");
        expect(restored.get("bold").get("mark").isEmpty).toBe(true);
        expect(restored.get("emphasis").get("mark").value).toBe("em");
    });
});
