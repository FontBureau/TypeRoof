import { CascadingMap } from "../../cascading-map.mjs";
import { LAYOUT } from "../../registered-properties-definitions.mjs";
import { PATH_SPEC_ENVIRONMENT_PROVIDER } from "../../environment-provider.mjs";
import { pathSpecValuesFromObjectGen } from "./synthetic-values.mjs";
import { LocalScopeProperties } from "./scope-resolution.mjs";

/**
 * The node-properties channel: per document-node computed facts
 * (geometry/constraints, e.g. availableWidth), parallel to the
 * typeSpecnion's per-typeSpec style properties. Whereas a typeSpecnion
 * is shared by all nodes linking the same typeSpec, node properties are
 * per node instance — facts flow document node -> document node.
 *
 * Generators are called as gen(outerNodePropertiesAPI, hostMap):
 *   - outerNodePropertiesAPI: {hasParentProperty, getParentProperty}
 *     over the parent node's outbound/effective map (the same
 *     convention as the typeSpecnion's outerTypespecnionAPI)
 *   - hostMap: the node's resolved typeSpecnion properties map
 *
 * The scope's effective map IS a cascade (not a copied merge):
 *   CascadingMap([["local", localMap], ["parent", parentEffectiveMap]])
 * where parentEffectiveMap is itself the parent's cascade — inheritance
 * in the node channel is cascade nesting;
 * getLayer("parent").getLayer("parent") walks ancestors.
 */
export class HierarchicalScopeNodeProperties {
    /**
     * propertiesGenerators: Map of generator functions
     *     gen(outerNodePropertiesAPI, hostMap)
     * hostMap: the node's settled typeSpecnion properties map
     * parentNodePropertiesOrDefaultsMap: a
     *     HierarchicalScopeNodeProperties (children) or the root
     *     defaults Map (environment facts, root only)
     */
    constructor(
        propertiesGenerators,
        hostMap,
        parentNodePropertiesOrDefaultsMap,
        inheritancePolicyGenerators = [],
    ) {
        const [parentNodeProperties, nodePropertiesDefaultsMap] =
                parentNodePropertiesOrDefaultsMap instanceof
                HierarchicalScopeNodeProperties
                    ? [parentNodePropertiesOrDefaultsMap, null]
                    : [null, parentNodePropertiesOrDefaultsMap],
            parentMap =
                parentNodeProperties === null
                    ? nodePropertiesDefaultsMap
                    : parentNodeProperties.getProperties(),
            outerAPI = {
                hasParentProperty: parentMap.has.bind(parentMap),
                getParentProperty: parentMap.get.bind(parentMap),
            },
            rawProperties = new Map();
        for (const gen of propertiesGenerators.values())
            for (const [propertyName, propertyValue] of gen(outerAPI, hostMap))
                rawProperties.set(propertyName, propertyValue);
        const localPropertyValuesMap =
                LocalScopeProperties.initPropertyValuesMap(
                    rawProperties,
                    parentMap,
                ),
            propertyValuesMap = new CascadingMap([
                ["local", localPropertyValuesMap],
                ["parent", parentMap],
            ]);
        Object.defineProperty(this, "parentNodeProperties", {
            value: parentNodeProperties,
        });
        this._rawProperties = rawProperties;
        this._localPropertyValuesMap = localPropertyValuesMap;
        this._propertyValuesMap = propertyValuesMap;
        this._inheritancePolicyGenerators = inheritancePolicyGenerators;
    }

    getProperties() {
        return this._propertyValuesMap;
    }

    getOwnProperty(propertyName, defaultVal) {
        if (!this._localPropertyValuesMap.has(propertyName)) {
            if (defaultVal !== undefined) return defaultVal;
            throw new Error(
                `KEY ERROR ${propertyName} not in HierarchicalScopeNodeProperties.`,
            );
        }
        return this._localPropertyValuesMap.get(propertyName);
    }

    get localPropertyNames() {
        return Array.from(this._localPropertyValuesMap.keys());
    }
}

/**
 * Root defaults for the node-properties channel: the environment facts
 * (from the environment@ protocol) are the depth-0 node properties,
 * keyed layout/environment/...
 * environmentValues: {key: value} as published by the environment@
 * protocol handler (ENVIRONMENT_PROVIDER_ENTRIES keys).
 */
export function getRootNodePropertiesMap(environmentValues) {
    const map = new Map();
    for (const [key, value] of pathSpecValuesFromObjectGen(
        PATH_SPEC_ENVIRONMENT_PROVIDER,
        `${LAYOUT}environment`, // prefix
        environmentValues,
    ))
        map.set(key, value);
    return map;
}
