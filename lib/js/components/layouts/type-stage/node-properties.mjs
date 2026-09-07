import { CascadingMap } from "../../cascading-map.mjs";
import { LAYOUT } from "../../registered-properties-definitions.mjs";
import { PATH_SPEC_ENVIRONMENT_PROVIDER } from "../../environment-provider.mjs";
import { pathSpecValuesFromObjectGen } from "./synthetic-values.mjs";
import {
    _BaseScopeProperties,
    LocalScopeProperties,
    collectPropertyGeneratorEntries,
} from "./scope-resolution.mjs";
import { DEMARCATION_PROPERTY } from "./type-specnion.mjs";

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
/**
 * The node channel's inheritance policy: intentionally EMPTY (socket
 * only). The width-semantics takeover supplies the content (e.g.
 * tombstoning root layout/width|height so the pane width stops
 * cascading into document nodes). Frozen to signal "not a draft".
 */
export const NODE_PROPERTIES_INHERITANCE_POLICY = Object.freeze([]);

export class HierarchicalScopeNodeProperties extends _BaseScopeProperties {
    /**
     * The ROOT scope: no parent scope; the cascade's parent layer is the
     * raw root defaults map (environment facts). createRoot /
     * createChild are the two construction cases, split out of the
     * constructor so the union "parent scope OR defaults map" argument
     * (and its instanceof discrimination) goes away.
     */
    static createRoot(
        propertiesGenerators,
        hostMap,
        nodePropertiesDefaultsMap,
        inheritancePolicyGenerators = [],
    ) {
        return new this(
            propertiesGenerators,
            hostMap,
            nodePropertiesDefaultsMap, // parentMap: the raw defaults
            null, // parentNodeProperties: no parent scope
            inheritancePolicyGenerators,
        );
    }

    /**
     * A CHILD scope: the parent is another HierarchicalScopeNodeProperties
     * instance. The parent decides what it passes on (re-routed and/or
     * withheld via its inheritance controls): generators and local
     * synthetics only ever see that projected scope, tombstoned/
     * non-inheriting properties can't be resurrected.
     */
    static createChild(
        propertiesGenerators,
        hostMap,
        parentNodeProperties,
        inheritancePolicyGenerators = [],
    ) {
        return new this(
            propertiesGenerators,
            hostMap,
            parentNodeProperties.getInheritableProperties(), // parentMap
            parentNodeProperties,
            inheritancePolicyGenerators,
        );
    }

    /**
     * A scope whose parent arrives as an ALREADY-RESOLVED map (the G8
     * contract of the document-node meta tree: the parent's settled
     * effective/inheritable map, not the scope instance). The caller owns
     * the projection decision (e.g. ancestorSettledProperties) — the
     * constructor takes the map verbatim as the parent layer.
     */
    static createFromParentMap(
        propertiesGenerators,
        hostMap,
        parentMap,
        inheritancePolicyGenerators = [],
    ) {
        return new this(
            propertiesGenerators,
            hostMap,
            parentMap,
            null,
            inheritancePolicyGenerators,
        );
    }

    /**
     * propertiesGenerators: Map of generator functions
     *     gen(outerNodePropertiesAPI, hostMap)
     * hostMap: the node's settled typeSpecnion properties map
     * parentMap: the already-resolved parent layer of the cascade
     *     (defaults map at the root, the parent's projected map for
     *     children)
     * parentNodeProperties: the parent scope instance, or null (root /
     *     parent-as-map)
     */
    constructor(
        propertiesGenerators,
        hostMap,
        parentMap,
        parentNodeProperties = null,
        inheritancePolicyGenerators = [],
    ) {
        super();
        const // Scope-generic invocation (shared with the typeSpecnion):
            // builds the outer API and yields gen(outerAPI, hostMap).
            propertiesGen = LocalScopeProperties.propertiesGenerator(
                propertiesGenerators,
                hostMap,
                parentMap,
            ),
            // Entries demarcated DEMARCATION_INHERITANCE are routed into
            // the inheritance controls and don't become local properties.
            [rawProperties, inheritanceControls] =
                collectPropertyGeneratorEntries(
                    propertiesGen,
                    DEMARCATION_PROPERTY,
                ),
            localPropertyValuesMap = LocalScopeProperties.initPropertyValuesMap(
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
        this._inheritanceControls = inheritanceControls;
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
