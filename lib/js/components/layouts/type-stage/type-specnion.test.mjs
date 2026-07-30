// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    LocalScopeTypeSpecnion,
    HierarchicalScopeTypeSpecnion,
} from "./type-specnion.mjs";
import { SyntheticValue } from "./synthetic-values.mjs";
import { styleLinksGen, getStyleLinks } from "./properties-generators.mjs";
import { STYLE_LINKS } from "../../registered-properties-definitions.mjs";

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
describe("style-link inheritance (styleLinksGen + HierarchicalScopeTypeSpecnion)", () => {
    // Minimal stand-ins: the typeSpecnion treats stream values as opaque,
    // so edge structs and the host TypeSpec can be simple stubs exposing
    // the same access API (edge.get("mode").value, host.get("stylePatches")).
    const edgeStub = (mode, tag = null) => ({
            get: (field) => ({
                value: field === "mode" ? mode : field === "tag" ? tag : null,
            }),
        }),
        typeSpecnionWith = (edges, parentOrDefaults, isInheritingPropertyFn) =>
            new HierarchicalScopeTypeSpecnion(
                [styleLinksGen],
                {
                    get: (name) => {
                        if (name === "stylePatches") return new Map(edges);
                        throw new Error(`KEY ERROR unexpected "${name}".`);
                    },
                },
                parentOrDefaults,
                isInheritingPropertyFn,
            );

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
        expect(child.getProperties().get(`${STYLE_LINKS}quote`)).toBe(null);
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

    it("keeps a null-style edge available (registered, not tombstoned)", () => {
        const edge = edgeStub("null-style"),
            root = typeSpecnionWith([["quote", edge]], new Map()),
            links = getStyleLinks(root.getProperties());
        expect(links.get("quote")).toBe(edge);
        expect(links.get("quote").get("mode").value).toBe("null-style");
    });
});
