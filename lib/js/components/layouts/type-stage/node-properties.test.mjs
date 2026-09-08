import { describe, it, expect } from "vitest";

import {
    HierarchicalScopeNodeProperties,
    getRootNodePropertiesMap,
} from "./node-properties.mjs";
import { availableSizesGen } from "./node-properties-generators.mjs";
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
        // The effective map also exposes the typeSpec layer: the
        // LengthModel stub in the host map is visible (the geometry
        // generator — which would resolve it to a number — is not in
        // this block's generator set).
        expect(props.get(`${LAYOUT}width`)).toBe(hostMap.get(`${LAYOUT}width`));
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
                    [`${GENERIC}fontSize`, 14],
                    [`${GENERIC}inlineMargins/start`, 0],
                    [`${GENERIC}inlineMargins/end`, 0],
                    [`${GENERIC}lineLength`, null],
                    [`${GENERIC}columnCount`, 1],
                    [`${GENERIC}columnGutter`, 0],
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
            contextGen = function* (inputCascade, hostContext) {
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
        const probeGen = function* (inputCascade, hostContext) {
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
