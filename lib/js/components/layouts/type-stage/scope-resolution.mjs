import {
    SyntheticValue,
    UnresolvableDependenciesError,
} from "./synthetic-values.mjs";
import { topologicalSortKahn } from "../../../metamodel.mjs";
import {
    DEMARCATION_PROPERTY,
    DEMARCATION_INHERITANCE,
    TOMBSTONE,
} from "./type-specnion.mjs";
import { CascadingMap } from "../../cascading-map.mjs";

export function mapSetProperties(map, ...propertiesArgs) {
    for (const properties of propertiesArgs)
        for (const [propertyName, propertyValue] of properties)
            map.set(propertyName, propertyValue);
    return map;
}

/**
 * Collect the output of the properties generators into the local
 * property values and the inheritance controls, routed by the optional
 * demarcation (third element) of each yielded entry. Only generators
 * with the same allowed demarcations are supported, e.g., inheritance
 * policy generators only yield DEMARCATION_INHERITANCE triples — the
 * two-element yield form is genuine there.
 */
function* flattenGenerators(...generatorsList) {
    for (const gen of generatorsList) yield* gen;
}
export function collectPropertyGeneratorEntries(
    propertiesGen,
    defaultDemarcation,
) {
    const propertyValuesMap = new Map(),
        inheritanceControls = new Map();
    for (const [
        propertyName,
        propertyValue,
        demarcation = defaultDemarcation,
    ] of propertiesGen) {
        if (demarcation === DEMARCATION_PROPERTY) {
            if (propertyValue === TOMBSTONE)
                throw new Error(
                    `VALUE ERROR propertyName "${propertyName}"` +
                        `is set to ${String(TOMBSTONE)} during stage-1 ` +
                        `(demarcation ${String(DEMARCATION_PROPERTY)}), but` +
                        ` only ${String(DEMARCATION_INHERITANCE)} accepts ` +
                        `that value.`,
                );
            propertyValuesMap.set(propertyName, propertyValue);
        } else if (demarcation === DEMARCATION_INHERITANCE)
            inheritanceControls.set(propertyName, propertyValue);
        else
            throw new Error(
                `VALUE ERROR unknown demarcation ${String(demarcation)} ` +
                    `for property "${propertyName}".`,
            );
    }
    return [propertyValuesMap, inheritanceControls];
}

export class _BaseScopeProperties {
    static _NOTDEF = Symbol("_NOTDEF");

    constructor() {
        Object.defineProperties(this, {
            _localPropertyValuesMap: {
                get: () => {
                    throw new Error(
                        `NOT IMPLEMENTED {this}._localPropertyValuesMap.`,
                    );
                },
                set: (value) => {
                    Object.defineProperty(this, "_localPropertyValuesMap", {
                        value,
                    });
                },
                configurable: true,
                writtable: true,
            },
            _propertyValuesMap: {
                get: () => {
                    throw new Error(
                        `NOT IMPLEMENTED {this}._propertyValuesMap.`,
                    );
                },
                set: (value) => {
                    Object.defineProperty(this, "_propertyValuesMap", {
                        value,
                    });
                },
                configurable: true,
                writtable: true,
            },
        });
    }

    toString() {
        return `[${this.constructor.name}]`;
    }
    getProperties() {
        return this._propertyValuesMap;
    }
    /**
     * The properties this scope passes on to its children. Defaults to
     * getProperties; scopes that route or withhold properties (via
     * DEMARCATION_INHERITANCE controls) override this.
     */
    getInheritableProperties() {
        return this.getProperties();
    }
    getOwnProperty(propertyName, defaultVal = super._NOTDEF) {
        if (!this._localPropertyValuesMap.has(propertyName)) {
            if (defaultVal !== this.constructor._NOTDEF) return defaultVal;
            throw new Error(
                `KEY ERROR ${propertyName} not in {$this.constructor.name}.`,
            );
        }
        return this._localPropertyValuesMap.get(propertyName);
    }
    // typeSpecnion.localPropertyNames => Array, all names that are defined by this scope
    get localPropertyNames() {
        return Array.from(this._localPropertyValuesMap.keys());
    }
    // compatibility to localTypeSpecnion API:
    getPropertyValuesMap() {
        return this._localPropertyValuesMap;
    }
}

/**
 * This got reduced to a collection of static functions.
 */
export class LocalScopeProperties {
    /**
     * If allowParentOnlyResolution is true, synthetic properties whose
     * dependencies all live in parentPropertyValuesMap are resolved as
     * well. By default they are dropped, because re-resolving them in
     * every layer would recompute inherited values (and could even
     * delete inherited properties when the result is null). Inheritance
     * controls, however, resolve against the settled own properties
     * passed as the parent map, exactly to re-route a parent-scope value
     * to a different name, so there the opt-in is required.
     */
    static resolveSyntheticProperties(
        rawPropertyMap,
        parentPropertyValuesMap,
        allowParentOnlyResolution = false,
    ) {
        // Synthetics whose dependencies can't be resolved at all,
        // transitively: optional synthetics are dropped (the silence is
        // earned, see SyntheticValue.optional), required synthetics throw
        // UnresolvableDependenciesError — a missing required dependency is
        // a bug (typo, or an attempt to resurrect a property the parent
        // withheld via inheritance controls) and must not pass silently.
        // A dependency must be available from the rawPropertyMap or the
        // parentPropertyValuesMap, otherwise topologicalSortKahn would
        // misreport these nodes as a cyclic dependency.
        const resolvableRawPropertyMap = new Map(rawPropertyMap);
        let pruned = true;
        while (pruned) {
            pruned = false;
            for (const [
                propertyName,
                propertyValue,
            ] of resolvableRawPropertyMap) {
                if (!(propertyValue instanceof SyntheticValue)) continue;
                const missingDependencies = propertyValue.dependencies.filter(
                    (dependencyName) =>
                        !resolvableRawPropertyMap.has(dependencyName) &&
                        !parentPropertyValuesMap.has(dependencyName),
                );
                if (!missingDependencies.length) continue;
                if (!propertyValue.optional)
                    throw new UnresolvableDependenciesError(
                        propertyName,
                        missingDependencies,
                    );
                resolvableRawPropertyMap.delete(propertyName);
                pruned = true;
            }
        }
        const syntheticProperties = new Set(
            Array.from(resolvableRawPropertyMap)
                .filter(
                    ([, /*propertyName*/ propertyValue]) =>
                        propertyValue instanceof SyntheticValue,
                )
                .map(([propertyName /*propertyValue*/]) => propertyName),
        );
        if (!syntheticProperties.size) return resolvableRawPropertyMap;

        const dependantsMap = new Map(),
            requirementsMap = new Map(),
            noDepsSet = new Set(parentPropertyValuesMap.keys());
        for (const propertyName of resolvableRawPropertyMap.keys()) {
            if (!syntheticProperties.has(propertyName)) {
                noDepsSet.add(propertyName);
                continue;
            }
            // It's a SyntheticProperty
            const synthProp = resolvableRawPropertyMap.get(propertyName);
            if (synthProp.dependencies.length === 0) {
                // NOTE We currently don't allow this configuration for
                // SyntheticProperties, but it's rather a semantic reason:
                // if there's no dependency, a value could be produced immediately.
                // Also, if the SyntheticProperty doesn't have local dependencies,
                // it resolves to NULL/not defined; this could change as well
                // but that would require a case and extra configuration.
                noDepsSet.add(propertyName);
                continue;
            }
            dependantsMap.set(propertyName, new Set(synthProp.dependencies));
            for (const dependency of synthProp.dependencies) {
                // _mapGetOrInit(requirementsMap, dependeny, ()=>[]).push(propertyName);
                if (!requirementsMap.has(dependency))
                    requirementsMap.set(dependency, []);
                requirementsMap.get(dependency).push(propertyName);
            }
        }
        const resolveOrder = topologicalSortKahn(
                noDepsSet,
                requirementsMap,
                dependantsMap,
            ),
            // don't modify resolvableRawPropertyMap in here!
            resultMap = new Map(resolvableRawPropertyMap),
            seen = new Set();
        for (const propertyName of resolveOrder) {
            if (
                !syntheticProperties.has(propertyName) ||
                seen.has(propertyName)
            )
                // all properties will end up in resolveOrder
                continue;
            // NOTE: topologicalSortKahn sometimes has duplicates, after
            // they got resolved once, it should be fine, resolving them
            // twice leads to an error. My case was setting 'axislocations/slnt'
            // on the root TypeSpec. I'm not sure now why it appears multiple
            // times in resolveOrder, it would be good to see the original
            // reason for that and eliminate it.
            seen.add(propertyName);
            const synthProp = resultMap.get(propertyName),
                args = [];
            let localDependencies = 0;
            for (const dependencyName of synthProp.dependencies) {
                if (resultMap.has(dependencyName)) {
                    localDependencies += 1;
                    // assert: !(resultMap.get(dependencyName) instanceof SyntheticProperty)
                    args.push(resultMap.get(dependencyName));
                } else if (parentPropertyValuesMap.has(dependencyName)) {
                    args.push(parentPropertyValuesMap.get(dependencyName));
                } else {
                    // else: this is going to be dropped because propertyName
                    // (no longer) can be resolved. I won't log a message
                    // as this is expected behavior.
                    break;
                }
            }
            if (
                (localDependencies === 0 && !allowParentOnlyResolution) ||
                args.length !== synthProp.dependencies.length
            ) {
                // Not all dependencies can be resolved: drop the property,
                // do not call with partial args.
                resultMap.delete(propertyName);
                continue;
            }
            const value = synthProp.call(...args);
            if (value === null)
                // FIXME: not sure if this feature makes sense like this
                // but, if there's e.g. an axisLocation tag that is not
                // in the font, this can remove the tag from the results.
                resultMap.delete(propertyName);
            else resultMap.set(propertyName, value);
        }
        return resultMap;
    }

    static *propertiesGenerator(
        propertiesGenerators,
        typeSpec,
        parentPropertyValuesMap,
    ) {
        const outerTypespecnionAPI = {
            hasParentProperty: parentPropertyValuesMap.has.bind(
                parentPropertyValuesMap,
            ),
            getParentProperty: parentPropertyValuesMap.get.bind(
                parentPropertyValuesMap,
            ),
        };
        for (const gen of propertiesGenerators.values())
            yield* gen(outerTypespecnionAPI, typeSpec);
    }
    /* NOTE: before accessing getPropertyValuesMap init is required.
     * This will create a cache, that will be around until initPropertyValuesMap
     * is called again or until the instance ceases to exist.
     */
    static initPropertyValuesMap(properties, parentPropertyValuesMap) {
        const rawPropertyMap = new Map(properties);
        return this.resolveSyntheticProperties(
            rawPropertyMap,
            parentPropertyValuesMap,
        );
    }
}

export class PatchedScopeProperties extends _BaseScopeProperties {
    constructor(parentMaps, rawProperties, stylePatchPropertyValuesMap) {
        super();

        // This does basically the same as HierarchicalScopeTypeSpecnion._initPropertyValuesMaps.
        // However, before LocalScopeProperties.initPropertyValuesMap
        // stylePatchPropertyValuesMap is applied to unpatchedRawProperties
        // this is the actual application of the style patch!
        //
        //
        // NOTE: this consumes the origin HierarchicalScopeTypeSpecnion's
        // parent maps, like the origin's own _getParentMaps produces them,
        // so inheritance controls of the grand-parent are honored. The
        // origin scope's own inheritance controls (DEMARCATION_INHERITANCE)
        // are deliberately bypassed: a patched node is a derived view of
        // its origin scope, not a link in the hierarchy that children
        // descend through. If that ever changes, the origin's
        // getInheritableProperties must be honored here as well.
        const [parentPropertyValuesMap, filteredParentPropertyValuesMap] =
            parentMaps;
        const _localRawProperties = mapSetProperties(
                new Map(),
                rawProperties,
                stylePatchPropertyValuesMap,
            ),
            // apply LocalScopeProperties.resolveSyntheticProperties
            localPropertyValuesMap = LocalScopeProperties.initPropertyValuesMap(
                _localRawProperties,
                parentPropertyValuesMap,
            ),
            // All properties in local override properties in parent
            propertyValuesMap = mapSetProperties(
                new Map(),
                filteredParentPropertyValuesMap,
                localPropertyValuesMap,
            );
        this._localPropertyValuesMap = localPropertyValuesMap;
        this._propertyValuesMap = propertyValuesMap;
    }
}

/**
 * The self-portrait of a scope as an ancestor: the scope's own resolved
 * properties with its inheritance controls applied. A control either
 * overrides a value (possibly a SyntheticValue re-routing an own
 * property to a different name, resolved against the settled own
 * properties) or, as TOMBSTONE, withholds the property from children.
 *
 * Scope-generic: operates on the scope's public-ish surface
 * (getProperties(), _inheritancePolicyGenerators, _inheritanceControls)
 * and is shared by HierarchicalScopeProperties (typeSpecnion) and
 * HierarchicalScopeNodeProperties (node-properties channel).
 */
export function resolveInheritableProperties(scope) {
    const ownProperties = scope.getProperties(),
        ownPropertyKeys = Array.from(ownProperties.keys()),
        [rawProperties, policyControls] = collectPropertyGeneratorEntries(
            flattenGenerators(
                ...scope._inheritancePolicyGenerators.map((gen) =>
                    gen(ownPropertyKeys),
                ),
            ),
            DEMARCATION_INHERITANCE,
        ),
        // explicit controls win over policy on same name (resurrection)
        allControls = mapSetProperties(
            new Map(),
            policyControls,
            scope._inheritanceControls,
        );
    if (rawProperties.size)
        console.error(
            `VALUE ERROR inheritance policy generators must ` +
                `not yield ${String(DEMARCATION_PROPERTY)} yet it did` +
                ` for: ${[...rawProperties.keys()]}. IGNORING`,
        );
    if (!allControls.size) return ownProperties;

    // Tombstones are not values: they withhold a property from the
    // children and must not participate in the dependency resolution
    // of value controls (a dependency on a tombstoned name falls back
    // to the own properties, the value still exists locally).
    const tombstones = new Set(),
        resolvableControls = new Map();
    for (const [propertyName, controlValue] of allControls) {
        if (controlValue === TOMBSTONE) tombstones.add(propertyName);
        else resolvableControls.set(propertyName, controlValue);
    }
    // resolveSyntheticProperties drops the unresolvable synthetics.
    const resolvedControls = LocalScopeProperties.resolveSyntheticProperties(
            resolvableControls,
            ownProperties,
            true, // allowParentOnlyResolution
        ),
        inheritableProperties = new Map(ownProperties);
    for (const propertyName of tombstones)
        inheritableProperties.delete(propertyName);
    for (const [propertyName, propertyValue] of resolvedControls)
        inheritableProperties.set(propertyName, propertyValue);
    return inheritableProperties;
}

/**
 * Name is a portmanteau from TypeSpec + Onion
 * Like the peels of an onion these typeSpec property generators can
 * be stacked together. The inner layers can access the values of
 * the outer layers.
 *
 * NOTE: using this in type-tools-grid as well!
 */
export class HierarchicalScopeProperties extends _BaseScopeProperties {
    constructor(
        propertiesGenerators,
        typeSpec,
        parentTypeSpecnionOrTypeSpecDefaultsMap,
        inheritancePolicyGenerators = [],
    ) {
        super();
        // `typeSpecDefaultsMap` is only used/required if parentTypeSpecnion
        // is null. This is now reflected in the code, because that way it
        // is obvious that the typeSpecDefaultsMap is only needed at the
        // root, not at children in the hierarchy.
        const [parentTypeSpecnion, typeSpecDefaultsMap] =
            parentTypeSpecnionOrTypeSpecDefaultsMap instanceof
            _BaseScopeProperties
                ? [parentTypeSpecnionOrTypeSpecDefaultsMap, null]
                : [null, parentTypeSpecnionOrTypeSpecDefaultsMap];
        // must be a HierarchicalScopeProperties as well/same interface
        // typeSpecnion.parentTypeSpecnion => typeSpecnion || null
        Object.defineProperty(this, "parentTypeSpecnion", {
            value: parentTypeSpecnion,
        });
        this._propertiesGenerators = propertiesGenerators;
        this._inheritancePolicyGenerators = inheritancePolicyGenerators;
        this._typeSpec = typeSpec;
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
        [
            this._rawProperties,
            this._localPropertyValuesMap,
            this._propertyValuesMap,
            this._inheritanceControls,
        ] = this._initPropertyValuesMaps();
    }

    /**
     * The self-portrait of this scope as an ancestor: the own resolved
     * properties with the inheritance controls applied. A control either
     * overrides a value (possibly a SyntheticValue re-routing an own
     * property to a different name, resolved against the settled own
     * properties) or, as TOMBSTONE, withholds the property from children.
     */
    getInheritableProperties() {
        return resolveInheritableProperties(this);
    }

    createPatched(stylePatchPropertyValuesMap) {
        // Pass this scope's own outbound map, not _getParentMaps(), so a
        // style patch that re-applies a parent property re-resolves against
        // the filtered inbound values; the scope's own DEMARCATION_INHERITANCE
        // controls aren't consulted.
        const [inheritedPropertyValuesMap, typeSpecDefaultsMap] =
            this._getParentMaps();
        return new PatchedScopeProperties(
            [
                this.getInheritableProperties(),
                // The origin's parent context: the union of the inherited
                // and defaults layers, equivalent to the former filtered
                // parent map.
                new CascadingMap([
                    ["inherited", inheritedPropertyValuesMap],
                    ["defaults", typeSpecDefaultsMap],
                ]),
            ],
            this._rawProperties,
            stylePatchPropertyValuesMap,
        );
    }

    _getParentMaps() {
        // The parent decides what it passes on (re-routed and/or withheld
        // via its inheritance controls); generators and local synthetics
        // only ever see that projected scope, tombstoned or non-inheriting
        // properties can't be resurrected. Without a parentTypeSpecnion
        // (at the root) the inherited map is empty and the defaults map
        // takes its place as the fallback.
        //
        // Layer-scheme rationale (Phase 6): the returned maps become the
        // "inherited" and "defaults" layers of the effective-map cascade
        // (see _initPropertyValuesMaps). The distinction exists because
        // inherited values and default values are semantically different
        // sources — a property may need to differentiate whether to
        // inherit or whether to take a value from the defaults (formerly
        // a FIXME at this location). No consumer differentiates per-layer
        // today: all reads go through the effective view (local >
        // inherited > defaults). The layers make the distinction
        // addressable per read via getLayer("inherited") /
        // getLayer("defaults") once a consumer needs it.
        const inheritedPropertyValuesMap =
                this.parentTypeSpecnion === null
                    ? new Map()
                    : this.parentTypeSpecnion.getInheritableProperties(),
            typeSpecDefaultsMap =
                this.parentTypeSpecnion === null
                    ? this._typeSpecDefaultsMap
                    : new Map();
        return [inheritedPropertyValuesMap, typeSpecDefaultsMap];
    }

    _initPropertyValuesMaps() {
        const [inheritedPropertyValuesMap, typeSpecDefaultsMap] =
                this._getParentMaps(),
            // Generators and synthetics resolve against the union of
            // inherited and defaults (at the root one of them is empty).
            parentPropertyValuesMap = new CascadingMap([
                ["inherited", inheritedPropertyValuesMap],
                ["defaults", typeSpecDefaultsMap],
            ]),
            propertiesGen = LocalScopeProperties.propertiesGenerator(
                this._propertiesGenerators,
                this._typeSpec,
                parentPropertyValuesMap,
            ),
            // Entries demarcated DEMARCATION_INHERITANCE are routed into
            // the inheritance controls and don't become local properties.
            [rawProperties, inheritanceControls] =
                collectPropertyGeneratorEntries(
                    propertiesGen,
                    DEMARCATION_PROPERTY,
                );
        const localPropertyValuesMap =
                LocalScopeProperties.initPropertyValuesMap(
                    rawProperties,
                    parentPropertyValuesMap,
                ),
            // The effective map is a cascade, not a copied merge:
            // all properties in local override inherited, inherited
            // overrides defaults (see _getParentMaps for the layer
            // rationale). Iteration is local-first — confirmed
            // order-agnostic for all consumers.
            propertyValuesMap = new CascadingMap([
                ["local", localPropertyValuesMap],
                ["inherited", inheritedPropertyValuesMap],
                ["defaults", typeSpecDefaultsMap],
            ]);
        return [
            rawProperties,
            localPropertyValuesMap,
            propertyValuesMap,
            inheritanceControls,
        ];
    }
}
