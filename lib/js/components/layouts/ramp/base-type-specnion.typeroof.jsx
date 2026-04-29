import { SyntheticValue } from "./synthetic-value.mjs";
import { topologicalSortKahn } from "../../../metamodel.mjs";

function mapSetProperties(map, ...propertiesArgs) {
    for (const properties of propertiesArgs)
        for (const [propertyName, propertyValue] of properties)
            map.set(propertyName, propertyValue);
    return map;
}

class _BaseTypeSpecnion {
    static _NOTDEF = Symbol("_NOTDEF"); // jshint ignore:line

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
        ] = this._initPropertyValuesMaps();
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
        const parentPropertyValuesMap =
                this.parentTypeSpecnion === null
                    ? // FIXME: this is not exact enough, we need to differentiate
                      // whether to inherit or whether to take a value from the
                      // defaults.
                      this._typeSpecDefaultsMap // new Map()
                    : this.parentTypeSpecnion.getProperties(),
            // this creates a copy, so we don't change parentPropertyValuesMap.
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
            rawProperties = mapSetProperties(new Map(), propertiesGen);
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
        return [rawProperties, localPropertyValuesMap, propertyValuesMap];
    }
}

/**
 * This got reduced to a collection of static functions.
 */
export class LocalScopeTypeSpecnion {
    static resolveSyntheticProperties(rawPropertyMap, parentPropertyValuesMap) {
        const syntheticProperties = new Set(
            Array.from(rawPropertyMap)
                .filter(
                    ([, /*propertyName*/ propertyValue]) =>
                        propertyValue instanceof SyntheticValue,
                )
                .map(([propertyName /*propertyValue*/]) => propertyName),
        );
        if (!syntheticProperties.size) return rawPropertyMap;

        const dependantsMap = new Map(),
            requirementsMap = new Map(),
            noDepsSet = new Set(parentPropertyValuesMap.keys());
        for (const propertyName of rawPropertyMap.keys()) {
            if (!syntheticProperties.has(propertyName)) {
                noDepsSet.add(propertyName);
                continue;
            }
            // It's a SyntheticProperty
            const synthProp = rawPropertyMap.get(propertyName);
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
            // don't modify rawPropertyMap in here!
            resultMap = new Map(rawPropertyMap),
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
                localDependencies === 0 ||
                arguments.length !== synthProp.dependencies.length
            )
                resultMap.delete(propertyName);
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
