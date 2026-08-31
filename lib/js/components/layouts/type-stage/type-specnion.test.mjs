// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    LocalScopeTypeSpecnion,
    HierarchicalScopeTypeSpecnion,
    DEMARCATION_INHERITANCE,
    TOMBSTONE,
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
describe("inheritance controls (DEMARCATION_INHERITANCE)", () => {
    const identity = (x) => x,
        // A stand-in for the column-layout case: the parent computes
        // "columnWidth" from its own "width" and re-routes it to become
        // the children's "width", withholding "columnWidth" itself.
        columnLayoutGen = function* () {
            yield ["width", 134];
            yield [
                "columnWidth",
                new SyntheticValue((width) => width / 2, ["width"]),
            ];
            yield [
                "width",
                new SyntheticValue(identity, ["columnWidth"]),
                DEMARCATION_INHERITANCE,
            ];
            yield ["columnWidth", TOMBSTONE, DEMARCATION_INHERITANCE];
        },
        emptyGen = function* () {},
        rootWith = (gen) =>
            new HierarchicalScopeTypeSpecnion([gen], {}, new Map()),
        childOf = (parent, gen = emptyGen) =>
            new HierarchicalScopeTypeSpecnion([gen], {}, parent, () => true);

    it("re-routes an own value to a different name for children", () => {
        const root = rootWith(columnLayoutGen),
            child = childOf(root);
        // the parent's own scope keeps the original values
        expect(root.getProperties().get("width")).toBe(134);
        expect(root.getProperties().get("columnWidth")).toBe(67);
        // the child receives width = parent's columnWidth
        expect(child.getProperties().get("width")).toBe(67);
    });

    it("withholds a tombstoned property from children", () => {
        const root = rootWith(columnLayoutGen),
            child = childOf(root);
        expect(child.getProperties().has("columnWidth")).toBe(false);
        // the tombstone does not propagate further than the property:
        // a grandchild doesn't inherit columnWidth either (it's simply
        // absent from the child's scope)
        const grandChild = childOf(child);
        expect(grandChild.getProperties().has("columnWidth")).toBe(false);
        expect(grandChild.getProperties().get("width")).toBe(67);
    });

    it("an explicit local value opts out of the re-routed inheritance", () => {
        const root = rootWith(columnLayoutGen),
            child = childOf(root, function* () {
                yield ["width", 200];
            });
        expect(child.getProperties().get("width")).toBe(200);
    });

    it("a plain value control adds a property only for children", () => {
        const root = rootWith(function* () {
                yield ["width", 42, DEMARCATION_INHERITANCE];
            }),
            child = childOf(root);
        expect(root.getProperties().has("width")).toBe(false);
        expect(child.getProperties().get("width")).toBe(42);
    });

    it("drops a control whose synthetic dependencies can't be resolved", () => {
        const root = rootWith(function* () {
                yield ["width", 134];
                yield [
                    "width",
                    new SyntheticValue(identity, ["columnWidth"]),
                    DEMARCATION_INHERITANCE,
                ];
            }),
            child = childOf(root);
        // no columnWidth in the parent's scope: the control is dropped
        // and the original width is inherited unchanged
        expect(child.getProperties().get("width")).toBe(134);
    });

    it("a tombstoned parent property can't be resurrected by a synthetic", () => {
        const root = rootWith(function* () {
            yield ["secret", "hidden"];
            yield ["secret", TOMBSTONE, DEMARCATION_INHERITANCE];
        });
        expect(root.getProperties().get("secret")).toBe("hidden");
        let child;
        expect(
            () =>
                (child = childOf(root, function* () {
                    // the dependency can't be resolved against the
                    // projected parent scope, the synthetic is dropped
                    yield [
                        "parentValue",
                        new SyntheticValue(identity, ["secret"]),
                    ];
                })),
        ).not.toThrow();
        expect(child.getProperties().has("parentValue")).toBe(false);
        expect(child.getProperties().has("secret")).toBe(false);
    });

    it("controls don't leak into the local scope of their own layer", () => {
        const root = rootWith(columnLayoutGen);
        // the re-routed width is not a local property of the parent
        expect(root.localPropertyNames).toEqual(["width", "columnWidth"]);
        expect(root.getPropertyValuesMap().has("columnWidth")).toBe(true);
    });
});
// Minimal stand-ins: the typeSpecnion treats stream values as opaque,
// so edge structs and the host TypeSpec can be simple stubs exposing
// the same access API (edge.get("mode").value, host.get("intentStyleLinks")).
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
