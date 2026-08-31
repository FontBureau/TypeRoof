import { SyntheticValue } from "./synthetic-values.mjs";
import { topologicalSortKahn } from "../../../metamodel.mjs";

// Generators yield [propertyName, propertyValue] pairs or triples
// [propertyName, propertyValue, demarcation]. The demarcation routes the
// entry: DEMARCATION_PROPERTY (the default) adds it to the local scope,
// DEMARCATION_INHERITANCE adds it to the inheritance controls, which
// determine what this scope passes on to its children (see
// HierarchicalScopeTypeSpecnion.getInheritableProperties).
export const DEMARCATION_PROPERTY = Symbol("DEMARCATION_PROPERTY"),
    DEMARCATION_INHERITANCE = Symbol("DEMARCATION_INHERITANCE"),
    // As the value of an inheritance control: withhold the property from
    // the inheritable properties, even if it exists in this scope.
    TOMBSTONE = Symbol("TOMBSTONE");

function mapSetProperties(map, ...propertiesArgs) {
    for (const properties of propertiesArgs)
        for (const [propertyName, propertyValue] of properties)
            map.set(propertyName, propertyValue);
    return map;
}

/**
 * Collect the output of the properties generators into the local
 * property values and the inheritance controls, routed by the optional
 * demarcation (third element) of each yielded entry.
 */
function collectPropertyGeneratorEntries(propertiesGen) {
    const propertyValuesMap = new Map(),
        inheritanceControls = new Map();
    for (const [
        propertyName,
        propertyValue,
        demarcation = DEMARCATION_PROPERTY,
    ] of propertiesGen) {
        if (demarcation === DEMARCATION_PROPERTY)
            propertyValuesMap.set(propertyName, propertyValue);
        else if (demarcation === DEMARCATION_INHERITANCE)
            inheritanceControls.set(propertyName, propertyValue);
        else
            throw new Error(
                `VALUE ERROR unknown demarcation ${String(demarcation)} ` +
                    `for property "${propertyName}".`,
            );
    }
    return [propertyValuesMap, inheritanceControls];
}

class _BaseTypeSpecnion {
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
export class LocalScopeTypeSpecnion {
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
        // Drop synthetics whose dependencies can't be resolved at all,
        // transitively. A dependency must be available from the
        // rawPropertyMap or the parentPropertyValuesMap, otherwise
        // topologicalSortKahn would throw a cyclic dependencies error for
        // these unresolvable nodes. Notably: with a projected parent map,
        // tombstoned properties can't be resurrected by a synthetic
        // dependency either, the synthetic is dropped here.
        const resolvableRawPropertyMap = new Map(rawPropertyMap);
        let pruned = true;
        while (pruned) {
            pruned = false;
            for (const [
                propertyName,
                propertyValue,
            ] of resolvableRawPropertyMap) {
                if (
                    propertyValue instanceof SyntheticValue &&
                    !propertyValue.dependencies.every(
                        (dependencyName) =>
                            resolvableRawPropertyMap.has(dependencyName) ||
                            parentPropertyValuesMap.has(dependencyName),
                    )
                ) {
                    resolvableRawPropertyMap.delete(propertyName);
                    pruned = true;
                }
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
            hasParentProtperty: parentPropertyValuesMap.has.bind(
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

export class PatchedTypeSpecnion extends _BaseTypeSpecnion {
    constructor(parentMaps, rawProperties, stylePatchPropertyValuesMap) {
        super();

        // This does basically the same as HierarchicalScopeTypeSpecnion._initPropertyValuesMaps.
        // However, before LocalScopeTypeSpecnion.initPropertyValuesMap
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
            // apply LocalScopeTypeSpecnion.resolveSyntheticProperties
            localPropertyValuesMap =
                LocalScopeTypeSpecnion.initPropertyValuesMap(
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
 * Name is a portmanteau from TypeSpec + Onion
 * Like the peels of an onion these typeSpec property generators can
 * be stacked together. The inner layers can access the values of
 * the outer layers.
 *
 * NOTE: using this in type-tools-grid as well!
 */
export class HierarchicalScopeTypeSpecnion extends _BaseTypeSpecnion {
    constructor(
        propertiesGenerators,
        typeSpec,
        parentTypeSpecnionOrTypeSpecDefaultsMap,
        isInheritingPropertyFn = null,
    ) {
        super();
        // `typeSpecDefaultsMap` is only used/required if parentTypeSpecnion
        // is null. This is now reflected in the code, because that way it
        // is obvious that the typeSpecDefaultsMap is only needed at the
        // root, not at children in the hierarchy.
        const [parentTypeSpecnion, typeSpecDefaultsMap] =
            parentTypeSpecnionOrTypeSpecDefaultsMap instanceof _BaseTypeSpecnion
                ? [parentTypeSpecnionOrTypeSpecDefaultsMap, null]
                : [null, parentTypeSpecnionOrTypeSpecDefaultsMap];
        // must be a HierarchicalScopeTypeSpecnion as well/same interface
        // typeSpecnion.parentTypeSpecnion => typeSpecnion || null
        Object.defineProperty(this, "parentTypeSpecnion", {
            value: parentTypeSpecnion,
        });
        this._propertiesGenerators = propertiesGenerators;
        this._typeSpec = typeSpec;
        if (parentTypeSpecnion !== null && !isInheritingPropertyFn)
            throw new Error(
                "ASSERTION FAILED parentTypeSpecnion is not null but isInheritingPropertyFn is not set.",
            );
        this._isInheritingPropertyFn = isInheritingPropertyFn;
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
        const ownProperties = this.getProperties();
        if (!this._inheritanceControls.size) return ownProperties;
        // Tombstones are not values: they withhold a property from the
        // children and must not participate in the dependency resolution
        // of value controls (a dependency on a tombstoned name falls back
        // to the own properties, the value still exists locally).
        const tombstones = new Set(),
            resolvableControls = new Map();
        for (const [propertyName, controlValue] of this._inheritanceControls) {
            if (controlValue === TOMBSTONE) tombstones.add(propertyName);
            else resolvableControls.set(propertyName, controlValue);
        }
        // resolveSyntheticProperties drops the unresolvable synthetics.
        const resolvedControls =
                LocalScopeTypeSpecnion.resolveSyntheticProperties(
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

    createPatched(stylePatchPropertyValuesMap) {
        return new PatchedTypeSpecnion(
            this._getParentMaps(),
            this._rawProperties,
            stylePatchPropertyValuesMap,
        );
    }

    _isInheritingProperty(property) {
        // By default all properties are inheriting, due to backward
        // compatibility, but we can inject different behavior.
        if (this._isInheritingPropertyFn)
            return this._isInheritingPropertyFn(property);
        return true;
    }

    _getParentMaps() {
        // The parent decides what it passes on (re-routed and/or withheld
        // via its inheritance controls); generators and local synthetics
        // only ever see that projected scope, tombstoned or non-inheriting
        // properties can't be resurrected. Without a parentTypeSpecnion
        // (at the root) the raw defaults map is used either way.
        // FIXME: at the root, this is not exact enough, we need to
        // differentiate whether to inherit or whether to take a value from
        // the defaults.
        const parentPropertyValuesMap =
                this.parentTypeSpecnion === null
                    ? this._typeSpecDefaultsMap // new Map()
                    : this.parentTypeSpecnion.getInheritableProperties(),
            // this creates a copy, so we don't change the source map.
            filteredParentPropertyValuesMap = new Map(
                Array.from(parentPropertyValuesMap).filter(
                    ([propertyName /*, value*/]) =>
                        this._isInheritingProperty(propertyName),
                ),
            );
        return [parentPropertyValuesMap, filteredParentPropertyValuesMap];
    }

    _initPropertyValuesMaps() {
        const [parentPropertyValuesMap, filteredParentPropertyValuesMap] =
                this._getParentMaps(),
            propertiesGen = LocalScopeTypeSpecnion.propertiesGenerator(
                this._propertiesGenerators,
                this._typeSpec,
                parentPropertyValuesMap,
            ),
            // Entries demarcated DEMARCATION_INHERITANCE are routed into
            // the inheritance controls and don't become local properties.
            [rawProperties, inheritanceControls] =
                collectPropertyGeneratorEntries(propertiesGen);
        const localPropertyValuesMap =
                LocalScopeTypeSpecnion.initPropertyValuesMap(
                    rawProperties,
                    parentPropertyValuesMap,
                ),
            // All properties in local override properties in parent
            propertyValuesMap = mapSetProperties(
                new Map(),
                filteredParentPropertyValuesMap,
                localPropertyValuesMap,
            );
        return [
            rawProperties,
            localPropertyValuesMap,
            propertyValuesMap,
            inheritanceControls,
        ];
    }
}
