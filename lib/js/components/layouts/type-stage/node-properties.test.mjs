import { describe, it, expect } from "vitest";

import {
    HierarchicalScopeNodeProperties,
    getRootNodePropertiesMap,
} from "./node-properties.mjs";
import { availableSizesGen } from "./node-properties-generators.mjs";
import { LAYOUT } from "../../registered-properties-definitions.mjs";

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
            scope = new HierarchicalScopeNodeProperties(
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
            scope = new HierarchicalScopeNodeProperties(
                generators,
                hostMap,
                getRootNodePropertiesMap(environment),
            );
        expect(scope.getProperties().get(`${LAYOUT}availableWidth`)).toBe(600);
    });

    it("yields nothing for a scope without root width/height in the host map", () => {
        const scope = new HierarchicalScopeNodeProperties(
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
        const rootScope = new HierarchicalScopeNodeProperties(
                generators,
                new Map([
                    [`${LAYOUT}width`, _lengthModelStub(100, "percent-layout")],
                ]),
                getRootNodePropertiesMap(environment),
            ),
            childScope = new HierarchicalScopeNodeProperties(
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
