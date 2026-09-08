import { describe, it, expect } from "vitest";

import {
    HierarchicalScopeNodeProperties,
    getRootNodePropertiesMap,
} from "./node-properties.mjs";
import {
    availableSizesGen,
    horizontalLayoutNodePropertiesGen,
    leadingNodePropertiesGen,
} from "./node-properties-generators.mjs";
import { LEADING } from "../../registered-properties-definitions.mjs";
import { LAYOUT, GENERIC } from "../../registered-properties-definitions.mjs";
import { DEMARCATION_INHERITANCE, TOMBSTONE } from "./type-specnion.mjs";
import { SyntheticValue } from "./synthetic-values.mjs";

const environment = {
    screen: { width: 1024, height: 768 },
    viewport: { width: 500, height: 400 },
    layout: { width: 800, height: 600 },
    dpr: 1,
};

function _lengthModelStub(value, unit) {
    const fields = { value: { value }, unit: { value: unit } };
    return {
        isDraft: false,
        get: (field) => fields[field],
    };
}

describe("getRootNodePropertiesMap", () => {
    it("keys environment facts under layout/environment/...", () => {
        const map = getRootNodePropertiesMap(environment);
        expect(map.get(`${LAYOUT}environment/layout/width`)).toBe(800);
        expect(map.get(`${LAYOUT}environment/layout/height`)).toBe(600);
        expect(map.get(`${LAYOUT}environment/screen/width`)).toBe(1024);
        expect(map.get(`${LAYOUT}environment/dpr`)).toBe(1);
    });
});

describe("HierarchicalScopeNodeProperties root scope", () => {
    const generators = new Map([["availableSizesGen", availableSizesGen]]);

    it("resolves percent-layout width/height against the environment", () => {
        const hostMap = new Map([
                [`${LAYOUT}width`, _lengthModelStub(75, "percent-layout")],
                [`${LAYOUT}height`, _lengthModelStub(50, "percent-layout")],
            ]),
            scope = HierarchicalScopeNodeProperties.createRoot(
                generators,
                hostMap,
                getRootNodePropertiesMap(environment),
            ),
            props = scope.getProperties();
        // resolved to pt: 75% of 800 css-px = 600 px = 450 pt
        expect(props.get(`${LAYOUT}availableWidth`)).toBe(450);
        // 50% of 600 css-px = 300 px = 225 pt
        expect(props.get(`${LAYOUT}availableHeight`)).toBe(225);
        // identity synthetics: width/height equal the available sizes
        expect(props.get(`${LAYOUT}width`)).toBe(450);
        expect(props.get(`${LAYOUT}height`)).toBe(225);
    });

    it("resolves absolute units to pt", () => {
        const hostMap = new Map([
                [`${LAYOUT}width`, _lengthModelStub(600, "pt")],
            ]),
            scope = HierarchicalScopeNodeProperties.createRoot(
                generators,
                hostMap,
                getRootNodePropertiesMap(environment),
            );
        expect(scope.getProperties().get(`${LAYOUT}availableWidth`)).toBe(600);
    });

    it("yields nothing for a scope without root width/height in the host map", () => {
        const scope = HierarchicalScopeNodeProperties.createRoot(
            generators,
            new Map(),
            getRootNodePropertiesMap(environment),
        );
        expect(scope.localPropertyNames).toEqual([]);
        // environment facts are still visible via the parent layer
        expect(
            scope.getProperties().get(`${LAYOUT}environment/layout/width`),
        ).toBe(800);
    });

    it("children see the parent's effective map via the parent layer", () => {
        const rootScope = HierarchicalScopeNodeProperties.createRoot(
                generators,
                new Map([
                    [`${LAYOUT}width`, _lengthModelStub(100, "percent-layout")],
                ]),
                getRootNodePropertiesMap(environment),
            ),
            childScope = HierarchicalScopeNodeProperties.createChild(
                new Map(),
                new Map(),
                rootScope,
            ),
            props = childScope.getProperties();
        // root: 100% of 800 css-px = 800 px = 600 pt, inherited by the child
        expect(props.get(`${LAYOUT}availableWidth`)).toBe(600);
        expect(props.getLayer("parent")).toBe(rootScope.getProperties());
    });
});

describe("horizontalLayoutNodePropertiesGen (5b stub)", () => {
    const generators = new Map([
            ["availableSizesGen", availableSizesGen],
            [
                "horizontalLayoutNodePropertiesGen",
                horizontalLayoutNodePropertiesGen,
            ],
        ]),
        rootScope = () =>
            HierarchicalScopeNodeProperties.createRoot(
                generators,
                new Map([
                    [`${LAYOUT}width`, _lengthModelStub(100, "percent-layout")],
                ]),
                getRootNodePropertiesMap(environment),
            );

    it("computes the node's content width from the host style facts", () => {
        const scope = HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map([
                    [`${GENERIC}lineLength`, 53],
                    [`${GENERIC}fontSize`, 14],
                ]),
                rootScope(),
            ),
            props = scope.getProperties();
        // Explicit lineLength: 53en × 0.5 × 14pt = 371pt — the node's
        // own CSS width shrinks to the measure (fill is only the
        // no-lineLength default) and children inherit the measure.
        expect(props.get(`${LAYOUT}width`)).toBe(371);
        expect(props.get(`${LAYOUT}availableWidth`)).toBe(371);
    });

    it("the computed width flows to children through the cascade", () => {
        const parentScope = HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map([
                    [`${GENERIC}lineLength`, 53],
                    [`${GENERIC}fontSize`, 14],
                ]),
                rootScope(),
            ),
            childScope = HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map(),
                parentScope,
            ),
            props = childScope.getProperties();
        // The child has no style facts of its own: it inherits the
        // parent's computed width — the node→node channel.
        expect(props.get(`${LAYOUT}availableWidth`)).toBe(371);
        expect(props.getLayer("parent")).toBe(parentScope.getProperties());
    });

    it("yields nothing without the style facts; the inherited width stands", () => {
        const scope = HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map(),
                rootScope(),
            ),
            props = scope.getProperties();
        // The root scope's width (600pt) inherited unchanged.
        expect(props.get(`${LAYOUT}availableWidth`)).toBe(600);
        expect(props.get(`${LAYOUT}width`)).toBe(600);
    });
});

describe("HierarchicalScopeNodeProperties inheritance policy (socket)", () => {
    // Behavior asserted on resolved maps (public surface), not internals.
    // A scope with a local property `secret` (and a re-routable `width`).
    const baseGenerators = new Map([
            [
                "facts",
                function* () {
                    yield ["secret", "pane-only"];
                    yield ["width", 600];
                },
            ],
        ]),
        childGenerators = new Map(),
        makeParent = (policy) =>
            HierarchicalScopeNodeProperties.createRoot(
                baseGenerators,
                new Map(),
                new Map(), // root defaults: no parent facts needed
                policy,
            ),
        makeChild = (parent) =>
            HierarchicalScopeNodeProperties.createChild(
                childGenerators,
                new Map(),
                parent,
            );

    it("empty policy: children inherit all parent properties (baseline)", () => {
        const parent = makeParent([]),
            child = makeChild(parent);
        expect(parent.getProperties().get("secret")).toBe("pane-only");
        expect(child.getProperties().get("secret")).toBe("pane-only");
        expect(child.getProperties().get("width")).toBe(600);
    });

    it("a policy tombstone withholds a property from children, not from the parent", () => {
        // Policy generators receive the own property names and yield
        // DEMARCATION_INHERITANCE controls.
        const policy = [
                function* () {
                    yield ["secret", TOMBSTONE, DEMARCATION_INHERITANCE];
                },
            ],
            parent = makeParent(policy),
            child = makeChild(parent);
        // Present in the parent's own resolved map…
        expect(parent.getProperties().get("secret")).toBe("pane-only");
        // …withheld from the inheritable projection…
        expect(parent.getInheritableProperties().has("secret")).toBe(false);
        // …and therefore absent in the child.
        expect(child.getProperties().has("secret")).toBe(false);
        // Non-tombstoned properties still flow.
        expect(child.getProperties().get("width")).toBe(600);
    });

    it("a policy synthetic re-route resolves against the parent's settled own properties", () => {
        const policy = [
                function* () {
                    // re-route own `width` to a new name for children
                    yield [
                        "inheritedWidth",
                        new SyntheticValue((w) => w, ["width"]),
                        DEMARCATION_INHERITANCE,
                    ];
                },
            ],
            parent = makeParent(policy),
            child = makeChild(parent);
        // The control resolves against the parent's settled own `width`.
        expect(parent.getInheritableProperties().get("inheritedWidth")).toBe(
            600,
        );
        expect(child.getProperties().get("inheritedWidth")).toBe(600);
        // The original `width` is untouched.
        expect(child.getProperties().get("width")).toBe(600);
    });

    it("an explicit DEMARCATION_INHERITANCE control from a generator overrides policy (resurrection)", () => {
        // A generator yields a tombstone control for `secret` AND the
        // policy also tombstones it; an explicit generator control wins
        // over policy. Here: generator tombstones, policy does not →
        // withheld; demonstrates controls route via DEMARCATION_INHERITANCE.
        const generators = new Map([
                [
                    "facts",
                    function* () {
                        yield ["secret", "pane-only"];
                        yield ["secret", TOMBSTONE, DEMARCATION_INHERITANCE];
                    },
                ],
            ]),
            parent = HierarchicalScopeNodeProperties.createRoot(
                generators,
                new Map(),
                new Map(),
                [],
            ),
            child = makeChild(parent);
        expect(parent.getProperties().get("secret")).toBe("pane-only");
        expect(child.getProperties().has("secret")).toBe(false);
    });
});

describe("hostContext", () => {
    it("a generator receives the hostContext passed at construction", () => {
        const context = {
                node: { isInline: true },
                nodeSpec: { inline: true },
                metaInfo: { typeKey: "text" },
                index: 2,
                isLast: false,
            },
            contextGen = function* (outerAPI, hostMap, hostContext) {
                if (hostContext === null) return;
                yield [
                    "layout/isInline",
                    Boolean(
                        hostContext.node.isInline ??
                            hostContext.nodeSpec.inline,
                    ),
                ];
                yield ["layout/index", hostContext.index];
                yield ["layout/isLast", hostContext.isLast];
            },
            scope = HierarchicalScopeNodeProperties.createRoot(
                new Map([["contextGen", contextGen]]),
                new Map(),
                getRootNodePropertiesMap(environment),
                [],
                context,
            ),
            props = scope.getProperties();
        expect(props.get("layout/isInline")).toBe(true);
        expect(props.get("layout/index")).toBe(2);
        expect(props.get("layout/isLast")).toBe(false);
    });

    it("hostContext defaults to null (no context)", () => {
        let seen = "unset";
        const probeGen = function* (outerAPI, hostMap, hostContext) {
            seen = hostContext;
        };
        HierarchicalScopeNodeProperties.createRoot(
            new Map([["probeGen", probeGen]]),
            new Map(),
            getRootNodePropertiesMap(environment),
        );
        expect(seen).toBe(null);
    });
});

describe("horizontalLayoutNodePropertiesGen width semantics (handoff 2026-09-08)", () => {
    // Worked examples from the width-semantics discussion: environment
    // layout width 800px = 600pt; baseFontSize 14pt.
    const generators = new Map([
            ["availableSizesGen", availableSizesGen],
            [
                "horizontalLayoutNodePropertiesGen",
                horizontalLayoutNodePropertiesGen,
            ],
        ]),
        rootDefaults = getRootNodePropertiesMap(environment),
        rootScope = (fontSize = 14) =>
            HierarchicalScopeNodeProperties.createRoot(
                generators,
                new Map([
                    [`${LAYOUT}width`, _lengthModelStub(100, "percent-layout")],
                    [`${GENERIC}fontSize`, fontSize],
                ]),
                rootDefaults,
            ),
        childScope = (hostFacts, parent) =>
            HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map(hostFacts),
                parent,
            ),
        enFactor = 0.5 * 14; // 7 pt per en

    it("A: fill — no lineLength/margins: width = availableWidth (round-trip)", () => {
        const props = rootScope().getProperties();
        expect(props.get(`${LAYOUT}availableWidth`)).toBe(600);
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(600, 6);
    });

    it("B: explicit lineLength — shrink-to-fit, children inherit the measure", () => {
        const child = childScope(
                new Map([
                    [`${GENERIC}fontSize`, 12],
                    [`${GENERIC}lineLength`, 40], // en
                ]),
                rootScope(),
            ),
            props = child.getProperties();
        // 40en × 0.5 × 12pt = 240pt
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(240, 6);
        expect(props.get(`${LAYOUT}availableWidth`)).toBeCloseTo(240, 6);
    });

    it("C: columns fill exactly when lineLength is unset", () => {
        const node = childScope(
                new Map([
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}inlineMargins/start`, 4],
                    [`${GENERIC}inlineMargins/end`, 4],
                    [`${GENERIC}columnCount`, 3],
                    [`${GENERIC}columnGutter`, 2],
                ]),
                rootScope(),
            ),
            props = node.getProperties();
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(600, 6);
        // columnWidthEn = (85.714 − 8 − 4)/3 = 24.571en
        expect(props.get(`${LAYOUT}availableWidth`)).toBeCloseTo(
            ((600 / enFactor - 8 - 4) / 3) * enFactor,
            6,
        );
    });

    it("D: everything set — sum and product, narrower than available", () => {
        const node = childScope(
                new Map([
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}inlineMargins/start`, 4],
                    [`${GENERIC}inlineMargins/end`, 4],
                    [`${GENERIC}columnCount`, 3],
                    [`${GENERIC}columnGutter`, 2],
                    [`${GENERIC}lineLength`, 30],
                ]),
                rootScope(),
            ),
            props = node.getProperties();
        // columnWidthEn = (30−4)/3 = 8.667en; width = 4+26+4+4 = 38en
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(38 * enFactor, 6);
        expect(props.get(`${LAYOUT}availableWidth`)).toBeCloseTo(
            ((30 - 4) / 3) * enFactor,
            6,
        );
    });

    it("E: overflow — lineLength bigger than the budget, width overflows deliberately", () => {
        const node = childScope(
                new Map([
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}lineLength`, 100], // 100en > 85.71en budget
                ]),
                rootScope(),
            ),
            props = node.getProperties();
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(700, 6);
        // children adapt to the overflowing width
        expect(props.get(`${LAYOUT}availableWidth`)).toBeCloseTo(700, 6);
    });

    it("F: child of an overflowing parent fills the overflowed budget", () => {
        const overflowing = childScope(
                new Map([
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}lineLength`, 100],
                ]),
                rootScope(),
            ),
            child = childScope(
                new Map([[`${GENERIC}fontSize`, 10]]),
                overflowing,
            ),
            props = child.getProperties();
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(700, 6);
    });

    it("yields nothing without fontSize; inherited facts stand unchanged", () => {
        const child = childScope(new Map(), rootScope()),
            props = child.getProperties();
        expect(props.get(`${LAYOUT}width`)).toBeCloseTo(600, 6);
        expect(props.get(`${LAYOUT}availableWidth`)).toBeCloseTo(600, 6);
        expect(child.localPropertyNames).toEqual([]);
    });
});

describe("leadingNodePropertiesGen (actual line width)", () => {
    // AutoLinearLeading config: a/b points in base-en, from
    // PATH_SPEC_AUTO_LINEAR_LEADING ([a,b][leading,lineWidth] + min/max).
    const LEADING_PREFIX = `${LEADING}leading`,
        algorithmConfig = new Map([
            [`${LEADING_PREFIX}/algorithm`, "AutoLinearLeading"],
            [`${LEADING_PREFIX}/a/leading`, 1.1],
            [`${LEADING_PREFIX}/a/lineWidth`, 33],
            [`${LEADING_PREFIX}/b/leading`, 1.3],
            [`${LEADING_PREFIX}/b/lineWidth`, 65],
            [`${LEADING_PREFIX}/minLeading`, 1.0],
            [`${LEADING_PREFIX}/maxLeading`, 1.6],
        ]),
        generators = new Map([
            ["availableSizesGen", availableSizesGen],
            [
                "horizontalLayoutNodePropertiesGen",
                horizontalLayoutNodePropertiesGen,
            ],
            ["leadingNodePropertiesGen", leadingNodePropertiesGen],
        ]),
        rootScope = () =>
            HierarchicalScopeNodeProperties.createRoot(
                generators,
                new Map([
                    [`${LAYOUT}width`, _lengthModelStub(100, "percent-layout")],
                    [`${GENERIC}fontSize`, 14],
                ]),
                getRootNodePropertiesMap(environment),
            );

    it("computes line-height from the actual column width, not the declared lineLength", () => {
        // Child: relativeFontSize 1, fontSize 14, lineLength unset →
        // fills the root's 600pt column; actual width = 600pt.
        const child = HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map([
                    ...algorithmConfig,
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}relativeFontSize`, 1],
                ]),
                rootScope(),
            ),
            lineHeight = child
                .getProperties()
                .get(`${LAYOUT}leading/line-height-em`);
        // actualLineWidthEn = 600 / 7 / 1 = 85.71en (beyond b.lineWidth=65
        // → clamped to maxLeading 1.6? no: slope (1.3−1.1)/(65−33)=0.00625,
        // intercept 1.1 − 0.00625×33 = 0.89375; raw = 0.00625×85.71 +
        // 0.89375 = 1.4295; clamped to [1.0, 1.6] → 1.4295.
        expect(lineHeight).toBeCloseTo(0.00625 * (600 / 7) + 0.89375, 4);
    });

    it("reacts to the node's actual width: a narrow column yields a different ratio", () => {
        // Child with explicit lineLength 40en → layout width 280pt
        // (40 × 7); leading computed against 280pt, not the declared 40.
        const child = HierarchicalScopeNodeProperties.createChild(
                generators,
                new Map([
                    ...algorithmConfig,
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}relativeFontSize`, 1],
                    [`${GENERIC}lineLength`, 40],
                ]),
                rootScope(),
            ),
            lineHeight = child
                .getProperties()
                .get(`${LAYOUT}leading/line-height-em`);
        // actualLineWidthEn = 280 / 7 / 1 = 40en; raw = 0.00625×40 + 0.89375 = 1.14375
        expect(lineHeight).toBeCloseTo(1.14375, 5);
    });

    it("yields nothing without the AutoLinearLeading algorithm", () => {
        const child = HierarchicalScopeNodeProperties.createChild(
            generators,
            new Map([
                [`${GENERIC}fontSize`, 14],
                [`${GENERIC}relativeFontSize`, 1],
            ]),
            rootScope(),
        );
        expect(
            child.getProperties().get(`${LAYOUT}leading/line-height-em`),
        ).toBe(undefined);
        // the width generator still yields (fontSize is present); only
        // the leading keys are absent.
        expect(
            child.localPropertyNames.filter((name) => name.includes("leading")),
        ).toEqual([]);
    });

    it("clamps to the configured min/max", () => {
        // Very narrow width → below minLeading 1.0
        const narrow = HierarchicalScopeNodeProperties.createChild(
            generators,
            new Map([
                ...algorithmConfig,
                [`${GENERIC}fontSize`, 14],
                [`${GENERIC}relativeFontSize`, 1],
                [`${GENERIC}lineLength`, 5],
            ]),
            rootScope(),
        );
        // actualWidth = 5×7=35pt → 5en; raw = 0.00625×5+0.89375 = 0.925 → clamped 1.0
        expect(
            narrow.getProperties().get(`${LAYOUT}leading/line-height-em`),
        ).toBe(1.0);
    });
});
