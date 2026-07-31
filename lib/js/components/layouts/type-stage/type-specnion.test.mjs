// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    LocalScopeTypeSpecnion,
    HierarchicalScopeTypeSpecnion,
} from "./type-specnion.mjs";
import { SyntheticValue } from "./synthetic-values.mjs";
import { styleLinksGen } from "./properties-generators.mjs";
import {
    INTENT_STYLE_LINKS,
    MARK_STYLE_LINKS,
    getStyleLinks,
} from "../../registered-properties-definitions.mjs";
import {
    getStylePatchLinkForIntent,
    getStylePatchLinkForMark,
} from "../../type-spec-models.mjs";

describe("LocalScopeTypeSpecnion.resolveSyntheticProperties", () => {
    it("drops a synthetic whose dependency resolved to null, no partial-args call", () => {
        // topologicalSortKahn throws on never-declared dependencies, so the
        // realistic trigger is a dependency that was dropped after resolving
        // to null. Pre-fix, 'broken' was called with zero args and re-set.
        const raw = new Map([
            ["a", 2],
            ["nullMid", new SyntheticValue(() => null, ["a"])],
            [
                "broken",
                new SyntheticValue(
                    (m) => m ?? "PARTIAL-ARGS-CALLED",
                    ["nullMid"],
                ),
            ],
        ]);
        const res = LocalScopeTypeSpecnion.resolveSyntheticProperties(
            raw,
            new Map(),
        );
        expect(res.has("nullMid")).toBe(false);
        expect(res.has("broken")).toBe(false);
        expect(res.get("a")).toBe(2);
    });
    it("drops a synthetic whose dependencies are all parent-only", () => {
        const raw = new Map([
            ["alias", new SyntheticValue((x) => x * 10, ["x"])],
        ]);
        const res = LocalScopeTypeSpecnion.resolveSyntheticProperties(
            raw,
            new Map([["x", 3]]),
        );
        expect(res.has("alias")).toBe(false);
    });
    it("resolves intact dependency chains", () => {
        const raw = new Map([
            ["a", 2],
            ["double", new SyntheticValue((a) => a * 2, ["a"])],
            ["quad", new SyntheticValue((d) => d * 2, ["double"])],
        ]);
        const res = LocalScopeTypeSpecnion.resolveSyntheticProperties(
            raw,
            new Map(),
        );
        expect(res.get("double")).toBe(4);
        expect(res.get("quad")).toBe(8);
    });
});
// Minimal stand-ins: the typeSpecnion treats stream values as opaque,
// so edge structs and the host TypeSpec can be simple stubs exposing
// the same access API (edge.get("mode").value, host.get("stylePatches")).
const edgeStub = (mode, tag = null, stylePatch = "some-patch") => {
        const fields = { mode, tag, stylePatch };
        return { get: (field) => ({ value: fields[field] ?? null }) };
    },
    typeSpecnionWith = (
        edges,
        parentOrDefaults,
        isInheritingPropertyFn,
        markEdges = [],
    ) =>
        new HierarchicalScopeTypeSpecnion(
            [styleLinksGen],
            {
                get: (name) => {
                    if (name === "intentStyleLinks") return new Map(edges);
                    if (name === "markStyleLinks") return new Map(markEdges);
                    throw new Error(`KEY ERROR unexpected "${name}".`);
                },
            },
            parentOrDefaults,
            isInheritingPropertyFn,
        );

describe("style-link inheritance (styleLinksGen + HierarchicalScopeTypeSpecnion)", () => {
    it("inherits a parent edge when the child defines nothing", () => {
        const edge = edgeStub("link", "q"),
            root = typeSpecnionWith([["quote", edge]], new Map()),
            child = typeSpecnionWith([], root, () => true);
        expect(getStyleLinks(child.getProperties()).get("quote")).toBe(edge);
    });

    it("overrides an inherited edge wholesale (whole-edge override)", () => {
        const parentEdge = edgeStub("link", "q"),
            childEdge = edgeStub("link", "cite"),
            root = typeSpecnionWith([["quote", parentEdge]], new Map()),
            child = typeSpecnionWith([["quote", childEdge]], root, () => true);
        expect(getStyleLinks(child.getProperties()).get("quote")).toBe(
            childEdge,
        );
    });

    it("tombstone (unlinked) removes the edge for child and descendants", () => {
        const root = typeSpecnionWith(
                [["quote", edgeStub("link", "q")]],
                new Map(),
            ),
            child = typeSpecnionWith(
                [["quote", edgeStub("unlinked")]],
                root,
                () => true,
            ),
            grandChild = typeSpecnionWith([], child, () => true);
        // the null shadow is the internal record of the consumed tombstone
        expect(child.getProperties().get(`${INTENT_STYLE_LINKS}quote`)).toBe(
            null,
        );
        // behaviorally the edge is gone, and the absence is inherited
        expect(getStyleLinks(child.getProperties()).has("quote")).toBe(false);
        expect(getStyleLinks(grandChild.getProperties()).has("quote")).toBe(
            false,
        );
    });

    it("re-links a tombstoned edge in a descendant", () => {
        const root = typeSpecnionWith(
                [["quote", edgeStub("link", "q")]],
                new Map(),
            ),
            child = typeSpecnionWith(
                [["quote", edgeStub("unlinked")]],
                root,
                () => true,
            ),
            newEdge = edgeStub("link", "blockquote"),
            grandChild = typeSpecnionWith(
                [["quote", newEdge]],
                child,
                () => true,
            );
        expect(getStyleLinks(grandChild.getProperties()).get("quote")).toBe(
            newEdge,
        );
    });

    it("keeps a NULL-STYLE edge ('' stylePatch) available (not tombstoned)", () => {
        const edge = edgeStub("link", null, ""),
            root = typeSpecnionWith([["quote", edge]], new Map()),
            links = getStyleLinks(root.getProperties());
        expect(links.get("quote")).toBe(edge);
        expect(links.get("quote").get("stylePatch").value).toBe("");
    });
});
describe("markStyleLinks: the second style-link family", () => {
    it("inherits, overrides and tombstones like the intent family", () => {
        const edge = edgeStub("link"),
            root = typeSpecnionWith([], new Map(), undefined, [
                ["strong", edge],
            ]);
        // inherit
        const child = typeSpecnionWith([], root, () => true);
        expect(
            getStyleLinks(child.getProperties(), MARK_STYLE_LINKS).get(
                "strong",
            ),
        ).toBe(edge);
        // override (closer scope wins)
        const childEdge = edgeStub("link"),
            overridingChild = typeSpecnionWith([], root, () => true, [
                ["strong", childEdge],
            ]);
        expect(
            getStyleLinks(
                overridingChild.getProperties(),
                MARK_STYLE_LINKS,
            ).get("strong"),
        ).toBe(childEdge);
        // tombstone: removed for child and descendants
        const tombChild = typeSpecnionWith([], root, () => true, [
                ["strong", edgeStub("unlinked")],
            ]),
            tombGrandChild = typeSpecnionWith([], tombChild, () => true);
        expect(
            getStyleLinks(tombChild.getProperties(), MARK_STYLE_LINKS).has(
                "strong",
            ),
        ).toBe(false);
        expect(
            getStyleLinks(tombGrandChild.getProperties(), MARK_STYLE_LINKS).has(
                "strong",
            ),
        ).toBe(false);
    });

    it("the two maps are independent, even for the same key", () => {
        const intentEdge = edgeStub("link", "q", "intent-patch"),
            markEdge = edgeStub("link", null, "mark-patch"),
            root = typeSpecnionWith(
                [["strong", intentEdge]],
                new Map(),
                undefined,
                [["strong", markEdge]],
            ),
            props = root.getProperties();
        expect(getStyleLinks(props, INTENT_STYLE_LINKS).get("strong")).toBe(
            intentEdge,
        );
        expect(getStyleLinks(props, MARK_STYLE_LINKS).get("strong")).toBe(
            markEdge,
        );
        // tombstoning one map's key does not affect the other
        const child = typeSpecnionWith(
            [["strong", edgeStub("unlinked")]],
            root,
            () => true,
        );
        expect(
            getStyleLinks(child.getProperties(), INTENT_STYLE_LINKS).has(
                "strong",
            ),
        ).toBe(false);
        expect(
            getStyleLinks(child.getProperties(), MARK_STYLE_LINKS).get(
                "strong",
            ),
        ).toBe(markEdge);
    });

    it("resolution is structurally separated: no cross-matching", () => {
        const intentOnly = typeSpecnionWith(
                [["strong", edgeStub("link")]],
                new Map(),
            ),
            props = intentOnly.getProperties();
        // an intentStyleLinks edge styles the intent ...
        expect(
            getStylePatchLinkForIntent(
                getStyleLinks(props, INTENT_STYLE_LINKS),
                "strong",
            ),
        ).toBe("strong");
        // ... but never a schema mark of the same name
        expect(
            getStylePatchLinkForMark(getStyleLinks(props, MARK_STYLE_LINKS), {
                type: { name: "strong" },
            }),
        ).toBe(null);
        // and the reverse
        const markOnly = typeSpecnionWith([], new Map(), undefined, [
                ["strong", edgeStub("link")],
            ]),
            props2 = markOnly.getProperties();
        expect(
            getStylePatchLinkForIntent(
                getStyleLinks(props2, INTENT_STYLE_LINKS),
                "strong",
            ),
        ).toBe(null);
        expect(
            getStylePatchLinkForMark(getStyleLinks(props2, MARK_STYLE_LINKS), {
                type: { name: "strong" },
            }),
        ).toBe("strong");
    });
});
