import {
    _BaseModel,
    _BaseContainerModel,
    FreezableSet,
    FreezableMap,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    _DEFERRED_DEPENDENCIES,
    SERIALIZE_OPTIONS,
    immutableWriteError,
    draftKeyError,
    _serializeContainer,
    SERIALIZE,
} from './base-model.ts';

import {
    _NOTDEF,
    populateSet,
    populateArray,
    iterFilter,
    iterMap,
    objectEntriesAreEqual,
    collectDependencies,
    unwrapPotentialWriteProxy,
} from './util.ts';

import {
    _BaseLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
} from './links.ts';

import {
    allEntries,
    getTopologicallySortedInitOrder,
} from './topological-sort.ts';

import {
    _PotentialWriteProxy,
    _LOCAL_PROXIES,
    _HAS_DRAFT_FOR_PROXY,
    _HAS_DRAFT_FOR_OLD_STATE_KEY,
    _GET_DRAFT_FOR_PROXY,
    _GET_DRAFT_FOR_OLD_STATE_KEY,
} from './potential-write-proxy.ts';

import { CoherenceFunction } from './coherence-function.ts';
import { ForeignKey } from './foreign-key.ts';
import { _PRIMARY_SERIALIZED_VALUE } from './serialization.ts';

import { _AbstractGenericModel } from './generic-model.ts';

// value will be a valid key or ForeignKey.NULL depending on the
// key constraints as well.
const KeyValueModel = _AbstractGenericModel.createClass("KeyValueModel", {
    validateFN: function (value) {
        // Could also be a number in some cases, but we handle all *keys* as strings so far.
        if (typeof value !== "string" && value !== ForeignKey.NULL)
            return [
                false,
                `NOT A VALID KEY must be string or ForeignKey.NULL: ${value.toString()}`,
            ];
        return [true, null];
    },
    serializeFN: function (value /*, serializeOptions=SERIALIZE_OPTIONS*/) {
        if (typeof value === "string") return value;
        if (value === ForeignKey.NULL) return null; // could be empty string, doesn't start with "S:"!
        // return `UNKOWN VALUE TYPE ${value.toString()}`;
        throw new Error(`UNKOWN VALUE TYPE (in ${this.name})`);
    },
    deserializeFN: function (
        serializedString /*, options=SERIALIZE_OPTIONS*/,
    ) {
        // NOTE: serializeFN can return NULL but this wont take receive
        // that It will be null in that case.
        return serializedString;
    },
});

const WITH_SELF_REFERENCE = Symbol("WITH_SELF_REFERENCE"),
    DEBUG = false;

export class _AbstractStructModel extends _BaseContainerModel {
    static WITH_SELF_REFERENCE = WITH_SELF_REFERENCE;
    static has(key) {
        // in all of the local name space
        // Own names, which override parent scope for children dependencies.
        for (const map of [
            this.fields,
            this.foreignKeys,
            this.links,
            this.internalizedDependencies,
            this.fallBackValues,
        ]) {
            if (map.has(key)) return true;
        }
        return false;
    }
    // In all of the local name space returns a:
    //      an instance of _BaseModel from this.fields
    //      an instance of ForeignKey from this.keys
    //      an instance of _BaseLink from this.links
    //      an instance of InternalizedDependency from this.internalizedDependencies
    //      an instance of FallBackValue from this.fallBackValues
    // in that order or throws a KEY ERROR
    static get(key) {
        // Own names, which override parent scope for children dependencies.
        for (const map of [
            this.fields,
            this.foreignKeys,
            this.links,
            this.internalizedDependencies,
            this.fallBackValues,
        ]) {
            if (map.has(key)) return map.get(key);
        }
        throw new Error(
            `KEY ERROR "${key}" not found in local namespace of ${this.constructor.name}.`,
        );
    }

    static *entries() {
        // => [name, instance of _BaseModel, Key or _BaseLink]
        yield* allEntries(
            this.fields,
            this.foreignKeys,
            this.links,
            this.internalizedDependencies,
            this.fallBackValues,
        );
    }

    static createClass(className: string, ...definitions) {
        if (DEBUG) {
            console.log("\n" + new Array(30).fill("*+").join(""));
            console.log("START createClass", className, "raw fields:");
            console.log(new Array(30).fill("*+").join("") + "\n");
        }
        if (typeof className !== "string")
            throw new Error(
                `className must be string but is ${typeof className}`,
            );

        const fields = new FreezableMap(),
            foreignKeys = new FreezableMap(),
            links = new FreezableMap(),
            coherenceFunctions = new FreezableMap(),
            internalizedDependencies = new FreezableMap(),
            fallBackValues = new FreezableMap(),
            // Used to rename/map external dependency names to internal
            // names and still be able to use both. I.e. get "font" from
            // the parent and call it "externalFont" and define "font" in
            // here locally e.g. as a Link or as a Field.
            // Used for internalizedDependencies.
            _ownAllDependencies = new FreezableSet(),
            _childrenAllDependencies = new FreezableSet(),
            staticDependencies = new FreezableMap(),
            ownExternalDependencies = new FreezableSet(),
            childrenExternalDependencies = new FreezableSet(),
            dependencies = new FreezableSet(),
            initOrder = [],
            seen = new Set(),
            // this way name will naturally become class.name.
            result = {
                [className]: class extends this {
                    // All of the static dependencies will get frozen (Object.freeze)
                    // jshint ignore: start
                    static fields = fields;
                    static foreignKeys = foreignKeys;
                    static links = links;
                    static coherenceFunctions = coherenceFunctions;
                    static internalizedDependencies = internalizedDependencies;
                    static fallBackValues = fallBackValues;

                    static staticDependencies = staticDependencies;
                    static ownDependencies = ownExternalDependencies;
                    static childrenExternalDependencies =
                        childrenExternalDependencies;
                    // These are the names of the dependencies of the class.
                    static dependencies = dependencies;
                    static initOrder = initOrder;
                    // jshint ignore: end
                },
            },
            NewClass = result[className];
        for (const definition of definitions) {
            if (definition instanceof StaticDependency) {
                if (staticDependencies.has(definition.dependencyName))
                    throw new Error(
                        `VALUE ERROR ${className} multiple definitions for static dependency name "${definition.dependencyName}".`,
                    );
                staticDependencies.set(definition.dependencyName, definition);
                continue;
            }
            const [name] = definition;
            let [, value] = definition;
            if (seen.has(name))
                throw new Error(
                    `VALUE ERROR ${className} multiple definitions for name "${name}" in "${className}".`,
                );
            seen.add(name);
            // from here on names must be string
            if (typeof name !== "string")
                throw new Error(
                    `VALUE ERROR ${className} definition name must be string but is ${typeof name}.`,
                );

            if (value === this.WITH_SELF_REFERENCE) {
                const [, , fn] = definition;
                value = fn(NewClass);
            }

            if (value instanceof CoherenceFunction) {
                coherenceFunctions.set(name, value);
                for (const dependency of value.dependencies)
                    _childrenAllDependencies.add(dependency);
            } else if (value instanceof InternalizedDependency) {
                internalizedDependencies.set(name, value);
                for (const dependency of value.dependencies)
                    _ownAllDependencies.add(dependency);
            } else if (value instanceof ForeignKey) {
                foreignKeys.set(name, value);
            } else if (value instanceof _BaseLink) {
                links.set(name, value);
            } else if (value instanceof FallBackValue) {
                fallBackValues.set(name, value);
            } else if (value.prototype instanceof _BaseModel) {
                // value can't be equal to _BaseModel, but that's not
                // intended for direct use anyways.
                // FIXME: We should even check if value is abstract
                // or meant to be used directly, by somehow marking
                // Abstract classes (with a static symbol?);
                fields.set(name, value);
                // All models must communicate this.
                for (const dependency of value.dependencies)
                    _childrenAllDependencies.add(dependency);
            } else
                throw new Error(
                    `VALUE ERROR: don't know how to handle defintion for ${className} ${name}:${value}`,
                );
        }

        for (const [keyName, key] of foreignKeys) {
            if (
                !fields.has(key.targetName) &&
                !internalizedDependencies.has(key.targetName)
            )
                throw new Error(
                    `KEY ERROR: ${className} foreignKey "${keyName}" doesn't reference an existing field: ${key}.`,
                );
        }
        for (const [linkName, link] of links) {
            for (const keyName of link.dependencies)
                if (!foreignKeys.has(keyName))
                    throw new Error(
                        `LINK ERROR: ${className} link "${linkName}" ${link} foreign key "${keyName}" does not exist.`,
                    );
        }
        for (const [fallBackValueName, fallBackValue] of fallBackValues) {
            for (const name of fallBackValue.dependencies)
                if (!links.has(name) && !internalizedDependencies.has(name))
                    throw new Error(
                        `KEY ERROR: ${className} fallBackValue "${fallBackValueName}" ${fallBackValue} name "${name}" does not exist.`,
                    );
        }
        // bind an object as the thisval to the static has function.
        // This way, the definite dependencies property can be pre-calculated
        // with the same method that would be used in an on demand calculation.
        // but we can bind the soon-to-be namespace into it.
        // Could also be done like:
        //      this.has.call({fields, foreignKeys, links, internalizedDependencies}, dependency)
        //  like:
        //       iterFilter(childrenDependencies, dependency=>!this.has.call({fields, keys, links}, dependency))
        //  also:
        //      filterFn = dependency=>!this.has.call({fields, keys, links}, dependency)
        //      iterFilter(childrenDependencies, filterFn)
        const staticHas = this.has.bind({
            fields,
            foreignKeys,
            links,
            internalizedDependencies,
            fallBackValues,
        });
        // remove locally defined names
        populateSet(
            ownExternalDependencies,
            iterFilter(
                _ownAllDependencies,
                (dependency) => !staticDependencies.has(dependency),
            ),
        );
        populateSet(
            childrenExternalDependencies,
            iterFilter(
                _childrenAllDependencies,
                (dependency) => !staticHas(dependency),
            ),
        );
        populateSet(dependencies, [
            //jshint ignore: line
            // Via internalizedDependencies, these are allways
            // external even if this class itself defines one
            // of these names. This is so that this element
            // can e.g. redefine what "font" is for children.
            ...ownExternalDependencies,
            // This is communicated upwards local overrides
            // of all children dependencies are not contained.
            ...childrenExternalDependencies,
        ]);
        // The topological order, to determine child initialization order
        // can be determined in here already:
        populateArray(
            initOrder,
            getTopologicallySortedInitOrder(
                coherenceFunctions,
                fields,
                foreignKeys,
                links,
                internalizedDependencies,
                fallBackValues,
                childrenExternalDependencies,
            ),
        );

        for (const staticClassProperty of Object.values(NewClass))
            Object.freeze(staticClassProperty);

        // Can't override class.fields anymore, would be possible w/o the freeze.
        Object.freeze(NewClass);

        if (DEBUG) {
            console.log("\n" + new Array(30).fill("*+").join(""));
            console.log("DONE building", className);
            for (const prop of [
                "fields",
                "foreignKeys",
                "links",
                "internalizedDependencies",
                "coherenceFunctions",
                "dependencies",
                "childrenExternalDependencies",
                "initOrder",
            ])
                console.log(`    ${className}.${prop}:`, NewClass[prop]);

            console.log(new Array(30).fill("*-").join(""));
            console.log(new Array(30).fill("*-").join("") + "\n");
        }
        return NewClass;
    }

    // FIXME: you don't call this directly for now use:
    // static createPrimalState or instance.getDraft
    // However, without oldState this should return the same as
    // createPrimalState!
    // OR could it still be valid? We need to have this._value propagated
    // with itemsdState) => a draft
    // new Ctor(null, dependencies) => an immutable primal state
    // new Ctor() =, metamorphose can do so, but does not yet without OLD
    // state.
    //
    // new CTor(ol> TypeError
    // new CTor(oldState, dependencies) => TypeError
    //      Do this instead:
    //      immutable = new CTor(oldState).metamorphose(dependencies);
    // if not oldState this will be a primal state (immutable).
    constructor(
        oldState = null,
        dependencies = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        // Must call first to be able to use with this.constructor.name
        // it's super counter intuitive, given the nature of the checks
        // below, but it shouldn't create bad side effects either.
        super(oldState);
        if (oldState === null && dependencies === null)
            throw new Error(
                `TYPE ERROR either oldState or dependencies are required in ${this.constructor.name}.`,
            );
        if (oldState !== null && dependencies !== null)
            // could also be dependencies === _DEFERRED_DEPENDENCIES
            // but at this point dependencies !== null has the same semantics.
            //
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(
                `TYPE ERROR can't constuct with both oldState and dependencies`,
            );

        if (oldState && oldState.isDraft)
            throw new Error(
                `LIFECYCLE ERROR [${this.constructor.name}] ` +
                    `oldState ${oldState} is draft but must be immutable.`,
            );
        // Used to call  super(oldState); here.

        // this._value will only contain changed entries
        // if this._value.get(name) === this.[OLD_STATE].value.get(name)
        // it should not be set, to detect change, but that can only finally
        // be done in metamorphose, there a draft value can go back to its
        // OLD_STATE if it has not changed.
        Object.defineProperty(this, "_value", {
            value: new FreezableMap(),
            configurable: true,
        });
        Object.defineProperty(this, "dependencies", {
            get: () => {
                if (this[OLD_STATE] === null)
                    throw new Error("Primal State has no dependencies yet!");
                // In draft-mode, this[OLD_STATE] has the dependencies.
                return this[OLD_STATE].dependencies;
            },
            configurable: true,
        });

        // byProxy.get(proxy)=>key byKey.get(key)=>proxy
        this[_LOCAL_PROXIES] = {
            byProxy: new Map(),
            byKey: new Map(),
            changedBySetter: new Set(),
        };
        // Create an immutable primal state if OLD_STATE is null:
        if (dependencies !== null) {
            if (serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [
                    this._deserializeToMap(serializedValue, serializeOptions),
                    serializeOptions,
                ];
            }
            // So, here's a problem,: this won't return a new object
            // if there was an OLD_STATE and there was no change
            // but since this is a constructor it MUST return a new
            // object (when called with `new`).
            if (dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    _getChangedDependencies() {
        if (this[OLD_STATE] === null)
            // If this.[OLD_STATE] === null we need to create a new primal
            // value, changedDependencyNames will be fully populated to do so.
            return new Set(this.constructor.dependencies);
        const changedDependencyNames = new Set();
        for (const key of this.constructor.dependencies.keys()) {
            if (this[OLD_STATE].dependencies[key] !== this.dependencies[key])
                changedDependencyNames.add(key);
        }
        return changedDependencyNames;
    }

    /**
     * localScope a Map
     * childDescriptor = this.constructor.get(childName)
     */
    collectChildDependencies(localScope, childDescriptor) {
        return Object.fromEntries(
            iterMap(childDescriptor.dependencies, (key) => {
                const value = localScope.get(key);
                if (value === undefined)
                    throw new Error(
                        `VALUE ERROR in ${this} dependency "${key}" for child "${childDescriptor}" is undefined.`,
                    );
                return [key, value];
            }),
        );
    }

    *_lockItem(localScope, locked, changedDependencyNames, name) {
        if (locked.has(name))
            // Been here done that.
            return;
        locked.add(name);
        if (!this.hasOwn(name))
            // Locking not requrired from this, this is not the owner.
            return;

        // if this is primal state construction and there's no
        // OLD_STATE the init order loop should have populated
        // this._value.get(name) by now!
        const item = this._value.has(name)
            ? this._value.get(name)
            : this[OLD_STATE].get(name);
        // `item` is a draft.
        // `descriptor` is a Model or an instance of ForeignKey.
        // ValueLink, Constraint and InternalizedDependency are
        // skipped with `this.hasOwn(name)` and require no
        // locking themselves.
        const descriptor = this.constructor.get(name);
        // Recursion! Thanks to initOrder this will resolve without
        // any infinite loops or missing dependencies.

        // For ForeignKey locking is already done in initOrder
        yield* this._lockDependencies(
            localScope,
            locked,
            changedDependencyNames,
            descriptor.dependencies,
        );
        let immutable;
        if (descriptor instanceof ForeignKey) {
            // We must execute the key constraint here,
            // coherence functions may have invalidated
            // the constraint and in that case we will fail.
            const key = descriptor,
                target = localScope.get(key.targetName),
                // May fail with an error!
                targetKeyMaybeGen = key.constraint(target, item.value),
                targetKey =
                    targetKeyMaybeGen?.next instanceof Function
                        ? yield* targetKeyMaybeGen
                        : targetKeyMaybeGen;
            let draft = null;
            if (targetKey !== item.value) {
                // May have to turn into a draft
                draft = item.isDraft ? item : item.getDraft();
                draft.value = targetKey;
            }
            immutable =
                draft !== null
                    ? draft.metamorphose()
                    : item.isDraft
                      ? item.metamorphose()
                      : item;
        } else {
            // is field/value
            const childDependencies = this.collectChildDependencies(
                localScope,
                descriptor,
            );
            immutable = item.isDraft
                ? yield* item.metamorphoseGen(childDependencies)
                : // It's immutable. If we would have locked item already
                  // we wouldn't be here. Drafts are always from this._value
                  // but immutables can potentially come from both sources.
                  // An immutable can be set via the set method but is also
                  // set when creating a primal state, in the initOrder loop.
                  // We got to make sure the dependencies are the same
                  // or metamorphose the item to the next version.
                  !objectEntriesAreEqual(childDependencies, item.dependencies)
                  ? yield* item.getDraft().metamorphoseGen(childDependencies)
                  : item;
        }
        if (!this[OLD_STATE] || this[OLD_STATE].get(name) !== immutable)
            changedDependencyNames.add(name);
        localScope.set(name, immutable);
    }

    *_lockDependencies(
        localScope,
        locked,
        changedDependencyNames,
        dependencies,
    ) {
        for (const name of dependencies) {
            yield* this._lockItem(
                localScope,
                locked,
                changedDependencyNames,
                name,
            );
        }
    }

    /**
     * This needs to stay compatible with _serializeContainer.
     */
    _deserializeToMap(serializedValues, options) {
        const keepKeys = options?.structStoreKeys,
            structAsDict = options?.structAsDict,
            valuesMap = new Map();
        // Populate valuesMap and make sure it only contains keys that are
        // owned (hasOwn) by Model.
        if (keepKeys) {
            const serializedValues_ = structAsDict
                ? Object.entries(serializedValues)
                : serializedValues;
            for (const [key, serializedValue] of serializedValues_) {
                if (!this.hasOwn(key)) {
                    // NOTE: this could be a hint of something going wrong,
                    // e.g. a version miss-match. Could be logged or otherwise
                    // reported. In a strict sense, this should be an error.
                    if (options.strict)
                        throw new Error(
                            `VALUE ERROR serializedValue has key "${key}" ` +
                                `but that is not owned by this struct. Own keys: ${this.ownKeys().join(", ")}.`,
                        );
                    continue;
                }
                if (serializedValue !== null && serializedValue !== undefined)
                    valuesMap.set(key, serializedValue);
            }
        } else {
            // Derive the keys from the positions of the values.
            for (const [i, key] of this.ownKeys().entries()) {
                const serializedValue = serializedValues[i];
                if (serializedValue !== null && serializedValue !== undefined)
                    valuesMap.set(key, serializedValue);
            }
        }
        // NOTE: assumption at this point valuesMap has only keys that are
        // owned (hasOwn) by Model.
        return valuesMap;
    }

    *#_metamorphoseGen(dependencies = {}) {
        const [serializedValuesMap, serializeOptions] = this[
                _PRIMARY_SERIALIZED_VALUE
            ] || [new Map()],
            getSerialized = (name) => {
                if (!serializedValuesMap || !serializedValuesMap.has(name))
                    return [];
                const value = serializedValuesMap.get(name);
                serializedValuesMap.delete(name);
                return [value, serializeOptions];
            };
        // Don't keep this.
        delete this[_PRIMARY_SERIALIZED_VALUE];

        //CAUTION: `this` is the object not the class.
        //
        // All the following runs, to change deep down a single axis location value.
        //        It is very important to make this as lightweight as possible.
        //        At the same time, it is important that the change bubbles
        //        through the whole structure.

        // Allow case without or with incomplete dependencies argument,
        // will re-use this[OLD_STATE].dependencies.
        // Fails in the if dependencies are missing.
        const dependenciesData = collectDependencies(
            this.constructor.dependencies,
            dependencies,
            this[OLD_STATE]?.dependencies,
            this.constructor.staticDependencies,
        );

        for (const [k, v] of Object.entries(dependenciesData)) {
            if (_PotentialWriteProxy.isProxy(v) && this[OLD_STATE] !== null)
                throw new Error(
                    `VALUE ERROR ${this} dependency "${k}" is a _PotentialWriteProxy ` +
                        `but this is not a primal draft this[OLD_STATE]:${this[OLD_STATE]}.`,
                );
            if (v === undefined)
                throw new Error(
                    `VALUE ERROR dependency "${k}" cannot be undefined.`,
                );
        }

        // Required for comparison between OLD_STATE and this.
        // These are the names and values of the dependencies of the class.
        // We need to compare these to see if a change of the object is required.
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(dependenciesData),
            writable: true,
            configurable: true,
        });

        const changedDependencyNames = this._getChangedDependencies();

        // Here's a shortcut:
        if (
            this[OLD_STATE] !== null &&
            changedDependencyNames.size === 0 &&
            // no new drafts since going into draft mode, i.e.
            // no potential changes that need to be checked.
            this._value.size === 0
        )
            return this[OLD_STATE];

        const localScope = new Map(),
            // localScope should already own *children*-external dependencies!!!
            locked = new Set();
        // This is the mantra:
        // NOTE: using this.get in this loop as it also returns
        // potentialWriteProxies as an optimization, the items
        // are made immutable eventually in the _lockItem method.
        for (const name of this.constructor.initOrder) {
            // By the time each element in initOrder is at the turn,
            // its dependencies are already available in localScope
            // and they can be used.
            if (this.constructor.childrenExternalDependencies.has(name)) {
                if (
                    !(name in this.dependencies) ||
                    this.dependencies[name] === undefined
                )
                    // should be covered above when checking dependenciesData
                    throw new Error(
                        `DEPENDENCY ERROR ${this.constructor.name} requires "${name}" in dependenciesData.`,
                    );
                localScope.set(name, this.dependencies[name]);
            } else if (this.constructor.internalizedDependencies.has(name)) {
                const internalizedDependency =
                    this.constructor.internalizedDependencies.get(name);
                if (
                    !(
                        internalizedDependency.dependencyName in
                        this.dependencies
                    ) ||
                    this.dependencies[internalizedDependency.dependencyName] ===
                        undefined
                )
                    // should be covered above when checking dependenciesData
                    throw new Error(
                        `DEPENDENCY ERROR ${this.constructor.name} requires ` +
                            `"${internalizedDependency.dependencyName}" in dependenciesData.` +
                            ` for "${name}": ${internalizedDependency}.`,
                    );
                localScope.set(
                    name,
                    this.dependencies[internalizedDependency.dependencyName],
                );
            } else if (this.constructor.fields.has(name)) {
                // get return value can be a draft or a proxified immutable.
                if (this[OLD_STATE] === null && !this._value.has(name)) {
                    // this is a primal state
                    const Model = this.constructor.fields.get(name);
                    // We want dependencies to be locked later in the
                    // process, so the coherence functions can do their
                    // thing and don't fail when writing because they get
                    // unexpected immutable dependencies.
                    //
                    // These dependencies may not be "locked" yet!
                    // But locked dependencies are (by convention) required
                    // for a new instance.
                    const childDependencies = this.collectChildDependencies(
                        localScope,
                        Model,
                    );
                    for (const [k, v] of Object.entries(childDependencies)) {
                        if (!this.hasOwn(k)) continue;
                        const item = (childDependencies[k] =
                            unwrapPotentialWriteProxy(v));
                        if (item.isDraft) {
                            childDependencies[k] = item.metamorphose({});
                            // put the immutable into this._value
                            this.set(k, item);
                            // put the proxy of the latest item into localScope
                            // so a later coherence function can work on the
                            // to be created draft.
                            localScope.set(k, this.get(k));
                        }
                    }
                    const immutable = yield* Model.createPrimalStateGen(
                        childDependencies,
                        ...getSerialized(name),
                    );
                    // This way the get method can still give out a potential
                    // write proxy to the coherenceFunction, but we have an
                    // inherent coherent value to start with.
                    this._value.set(name, immutable);
                }
                localScope.set(name, this.get(name));
            } else if (this.constructor.coherenceFunctions.has(name)) {
                const coherenceFunction =
                        this.constructor.coherenceFunctions.get(name),
                    // This can change the values of fields, if fields are used
                    // as dependencies, this must execute before.
                    // We also accept frozen childDependencies, but when attempting
                    // to write they raise an error/
                    // This way, it is ensured that we didn't give away
                    // dependencies that become outdated.
                    childDependencies = this.collectChildDependencies(
                        localScope,
                        coherenceFunction,
                    );
                // Return value is optional I would say, but it could
                // be useful, to propagate calculations. The idea of
                // the coherenceFunction is however that it can change
                // the values of dependencies directly...
                // FIXME: external dependencies must not be changeable!
                //     that's important, though, not sure how to ensure that!
                //     It's important because that would inverse data flow
                //     direction (from child to parent) and we don't
                //     want this, to keep it simple and in hierarchical order!
                //     If it is possible and desireable we may overthink this
                //     but too many side-effects seem to occur.
                //     Maybe, besides freezing, we could also "lock"
                //     elements (temporarily).
                // Similar to this, instanciation of a field could be
                // augmented by a method attached directly, but, essentially
                // this can do the same job.
                //
                // FIXME not a fan of using result like this! It makes stuff
                // complicated! (does iit though?)
                // However, the coherenceFunction is part of the init order, and
                // as such can technically set a name, there's no clash.
                // This is also not yet implemented in the factory method,
                // so there may be no way to get these dependencies accepted!
                // localScope.set(name, coherenceFunction.fn(childDependencies));
                const maybeGen = coherenceFunction.fn(childDependencies);
                if (maybeGen?.next instanceof Function) yield* maybeGen;
            } else if (this.constructor.foreignKeys.has(name)) {
                // Must lock the target!
                // Key must not change anymore after being used as an dependency!
                // This means, it would still be possible to change this
                // in a coherence function, but when it is a direct dependency
                // e.g. in a field OR in a link (below), this must be locked
                // and loaded.
                const key = this.constructor.foreignKeys.get(name);
                yield* this._lockDependencies(
                    localScope,
                    locked,
                    changedDependencyNames,
                    key.dependencies,
                ); // is { key.targetName }
                if (this[OLD_STATE] === null && !this._value.has(name)) {
                    // this is a primal state
                    // FIXME: without running the constraint, there
                    // won't be a value for this initial key! (immutable.value === undefined)
                    // A coherence function specialized for the primal
                    // state case may have to bootstrap this.
                    const immutable = yield* KeyValueModel.createPrimalStateGen(
                        null,
                        ...getSerialized(name),
                    );
                    // This way the get method can give out potential write
                    // proxies and the coherence functions can change
                    // this, even in primal state creation.
                    this._value.set(name, immutable);
                }

                const keyValue = this.get(name); // draft or proxified immutable
                localScope.set(name, keyValue);
            } else if (this.constructor.links.has(name)) {
                // similar as foreignKey, but since this doesn't go to
                // Think about making sure to have this frozen (i.e. target
                // be frozen) before sending it as a dependency.

                const link = this.constructor.links.get(name);
                try {
                    yield* this._lockDependencies(
                        localScope,
                        locked,
                        changedDependencyNames,
                        link.dependencies,
                    ); // is { link.keyName }
                } catch (error) {
                    error.message = `${error.message} (in ${this})`;
                    throw error;
                }
                // resolving the link:
                //
                const key = this.constructor.foreignKeys.get(link.keyName),
                    targetKey = localScope.get(link.keyName).value,
                    target = localScope.get(key.targetName);
                let value;

                if (targetKey === key.NULL) {
                    if (key.allowNull)
                        // just reuse ForeignKey.NULL
                        value = key.NULL;
                    else
                        // We already executed the key constraints, which
                        // should have caught this, but maybe a coherence
                        // function changed it.
                        // TODO: the key constraint function should execute right
                        //       before the key is locked again, to ensure this
                        //       doesn't happen.
                        throw new Error(
                            `INTERNAL LOGIC ERROR ${this.constructor.name} ` +
                                `can't resolve link "${name}" ${link}: ` +
                                `key-value for key ${link.keyName} is null ` +
                                `but null is not allowed.`,
                        );
                } else if (target.has(targetKey)) value = target.get(targetKey);
                else if (this[OLD_STATE] === null) {
                    // This is a primary state, we need to accept that there
                    // can be a not well defined key, i.e. when NOT_NULL
                    // and target is empty and the constraint is NO_ACTION.
                    // The caller will have to set a valid key as next step.
                    value = key.INVALID;
                } else
                    // This should never happen, as we ran key.constraint before.
                    throw new Error(
                        `KEY ERROR ${this.constructor.name} not found key "${link.keyName}"` +
                            ` (is ${targetKey.toString()}) in ${key.targetName}.`,
                    );
                localScope.set(name, value);
            } else if (this.constructor.fallBackValues.has(name)) {
                const fallBackValue = this.constructor.fallBackValues.get(name),
                    primaryValue = localScope.get(fallBackValue.primaryName),
                    value =
                        primaryValue !== ForeignKey.NULL
                            ? primaryValue
                            : localScope.get(fallBackValue.fallBackName);
                if (value === ForeignKey.NULL)
                    throw new Error(
                        `VALUE ERROR fall back value "${fallBackValue.fallBackName}" is NULL`,
                    );
                if (
                    unwrapPotentialWriteProxy(value).constructor !==
                    fallBackValue.Model
                )
                    throw new Error(
                        `TYPE ERROR fall back value is not a ${fallBackValue.Model.name} but a ${value.constructor.name}.`,
                    );
                localScope.set(name, value);
            } else
                // A programming error, was new stuff added recently ?
                throw new Error(
                    `UNKOWN NAME ${this.constructor.name} Don't know how to treat "${name}".`,
                );
        }

        if (serializedValuesMap.size)
            // This is just a sanity check. If here keys are left, it
            // probably means a condition above must be updated. These
            // keys generally correlate with ownKeys, so if that is changed
            // it's possible that the conditions above are not updated/forgotten
            // and this is a reminder.
            throw new Error(
                `VALUE ERROR a serialized value was given, but not all ` +
                    `keys were used, unused keys: ${Array.from(serializedValuesMap.keys()).join(",")}`,
            );

        // Are there any not locked fields/keys now?
        for (const name of this.ownKeys())
            yield* this._lockItem(
                localScope,
                locked,
                changedDependencyNames,
                name,
            );

        // compare
        if (this[OLD_STATE] && changedDependencyNames.size === 0)
            // Has NOT changed!
            return this[OLD_STATE];

        // make sure all items are in this._value
        for (const name of this.ownKeys())
            this._value.set(name, localScope.get(name));

        // Has changed!
        {
            // validate types in this._value
            const types = [];
            for (const [name, Type] of this.constructor.fields.entries()) {
                // no inheritance allowed so far.
                const value = this._value.get(name);
                if (value.constructor !== Type)
                    types.push(
                        `"${name}" ${value} is not a ${Type.name} (but a ${value.constructor.name}).`,
                    );
            }
            if (types.length)
                throw new Error(
                    `TYPE ERROR can't metamorphose ${this}` +
                        `wrong types: ${types.join(", ")}.`,
                );
        }
        {
            // validate keys
            for (const name of this.constructor.foreignKeys.keys()) {
                const value = this._value.get(name);
                if (value.constructor !== KeyValueModel)
                    throw new Error(
                        `TYPE ERROR can't metamorphose ${this} key ` +
                            `"${name}" ${value} is not a KeyValueModel (but a ${value.constructor.name}).`,
                    );
                // The actual target key is validated by the key constraints in locking.
            }
        }
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(this.dependencies),
            writable: false,
            configurable: false,
        });
        //
        // Would be nice to have this[OLD_STATE] like a history, but it also
        // prevents this[OLD_STATE] from being garbage collected!
        // Keeping it only in the top most element could be an option,
        // but collecting states in an external list may be even better.
        delete this[OLD_STATE];
        Object.defineProperty(this, "_value", {
            value: Object.freeze(this._value),
            writable: false,
            configurable: false,
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {
            value: false,
            configurable: false,
        });
        delete this[_LOCAL_PROXIES];
        Object.freeze(this);
    }
    #_metamorphoseCleanUp() {
        delete this.dependencies;
    }
    // This can be called without depenedencies or only with changed
    // dependencies, initially, a lack of dependencies is detected.
    // The case without dependencies is given when commiting a change within
    // a workflow, to trigger the side effects.
    *metamorphoseGen(dependencies = {}) {
        if (!this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`,
            );
        let result;
        try {
            result = yield* this.#_metamorphoseGen(dependencies);
        } finally {
            if (result === this) {
                // This metamorphosed into a new state!
                this.#_lockAndFreeze();
            } else {
                // on error or if(result === this[OLD_STATE]) {
                // reset metamorphose residues so that this draft could
                // be metamorphosed again (it happens, see the commit).
                this.#_metamorphoseCleanUp();
            }
        }
        return result;
    }

    get value() {
        if (this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`,
            );
        return this._value;
    }

    *[Symbol.iterator]() {
        // maybe use flags to decide what not to yield
        // users (data readers) may require
        // yield keys, links?
        for (const key of this.ownKeys()) yield [key, this.get(key)];
    }

    *allEntries() {
        for (const key of this.keys()) yield [key, this.get(key)];
    }

    // TODO: something like this will probably be required.
    //toObject() {
    //    const result = {};
    //    for(let k of allKeys(this.fields, this.foreignKeys))
    //        result[k] = this._value.get(k).toObject();
    //    return result;
    //}

    get size() {
        //  FIXME: Keys and original values are contained. What about Links?
        // I have a hunch that even links, should be contained, if we want
        // to be able to further reference them.

        return this.constructor.fields.size + this.constructor.foreignKeys.size;
    }

    /**
     * True for values that are owned by this struct, that are:
     * fields and foreignKeys. These are stored originally in this._value.
     * Links (linked values) and Internalized Dependencies (also kind of
     * linked values) are not owned by this struct, they are just referenced,
     * links from "below" in the hierarchy, Internalized Dependencies from
     * above. These are still included in the this.has and this.keys interfaces.
     */
    hasOwn(key) {
        return (
            this.constructor.fields.has(key) ||
            this.constructor.foreignKeys.has(key)
        );
    }

    /**
     * Returns an array of keys for values that are owned by this struct,
     * that are: fields and foreignKeys. These are stored originally in this._value.
     * See hasOwn for more details.
     */
    has(key) {
        return (
            this.hasOwn(key) ||
            this.constructor.links.has(key) ||
            this.constructor.internalizedDependencies.has(key) ||
            this.constructor.fallBackValues.has(key)
        );
    }

    static ownKeys() {
        //  These and `hasOwn` follow the same rules!
        return [...this.fields.keys(), ...this.foreignKeys.keys()];
    }

    ownKeys() {
        return this.constructor.ownKeys();
    }

    keys() {
        return [
            ...this.ownKeys(),
            ...this.constructor.links.keys(),
            ...this.constructor.internalizedDependencies.keys(),
            ...this.constructor.fallBackValues.keys(),
        ];
    }

    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if (!this.isDraft) return false;

        if (!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // the proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy),
            // MAY NOT BE A DRAFT AT THIS MOMENT!
            item = this._value.get(key);
        if (!item || !item.isDraft) return false;

        // Identified via this[_LOCAL_PROXIES].
        return true;
    }

    [_HAS_DRAFT_FOR_OLD_STATE_KEY](key) {
        if (!this.isDraft) return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        if (!this._value.has(key)) return false;

        if (this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected from original OLD_STATE key releation
            return false;

        // MAY NOT BE A DRAFT AT THIS MOMENT!
        const item = this._value.get(key);
        if (!item || !item.isDraft) return false;
        return true;
    }

    // called from the perspective of a proxy that was created when this
    // was still an immutable.
    [_GET_DRAFT_FOR_OLD_STATE_KEY](key) {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${key}) is immutable, not a draft.`,
                ),
            );

        if (!this.hasOwn(key))
            throw new Error(`KEY ERROR "${key}" not found in ${this}.`);

        if (this[OLD_STATE] === null)
            // I suppose this should never happen, this[OLD_STATE] must
            // not be null in this method.
            // When creating a primary state, we should not create proxies
            // for delayed drafts at all, so that can circumvent this.
            throw new Error(
                `ASSERTION FAILED this[OLD_STATE] should exist in this method.`,
            );

        if (this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected _GET_DRAFT_FOR_OLD_STATE_KEY relates only to drafts
            // created directly for [OLD_STATE] entries.
            return false;

        const item = this._value.has(key)
            ? this._value.get(key) // => assert item.isDraft
            : // expect OLD_STATE to exist!
              this[OLD_STATE].get(key); // item is not a draft
        if (item.isDraft)
            // Since it was not changedBySetter this must be the original
            // draft for the item at OLD_STATE
            return item;

        const draft = item.getDraft();
        this._value.set(key, draft);
        return draft;
    }
    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     *      => but the proxy is only available if this is a draft
     *         so if(!this.isDraft) should fail differently!
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        // TODO: check if key exists! Else KEY ERROR ${key}
        if (!this.isDraft)
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`,
                ),
            );

        if (!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy),
            item = this._value.has(key)
                ? this._value.get(key)
                : this[OLD_STATE].get(key);
        // MAY NOT BE A DRAFT AT THIS MOMENT! => via set(key, immutable)...
        // in that case were going to replace the item in this._value with
        // its draft.
        if (item.isDraft)
            // We own the proxy, so the draft is from here.
            return item;
        const draft = item.getDraft();
        this._value.set(key, draft);
        return draft;
    }

    getDraftFor(key, defaultReturn = _NOTDEF) {
        let proxyOrDraft;
        try {
            proxyOrDraft = this._getOwn(key, defaultReturn);
        } catch (error) {
            if (error.message.startsWith("KEY ERROR"))
                // mark it
                throw draftKeyError(error);
            throw error;
        }

        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft;
    }

    _getOwn(key) {
        if (!this.hasOwn(key))
            throw new Error(`KEY ERROR "${key}" not found in ${this}.`);

        let item = this._value.has(key) && this._value.get(key);
        if (!item && this[OLD_STATE] !== null) {
            // item could be not in value but proxy could exist
            item = this[OLD_STATE].get(key);
        }
        if (!item)
            // This would just be weird!
            // In primal state, this._value is fully populated with primal
            // state elements and after this[OLD_STATE] is present.
            //
            // FIXME: However, it is still possible to run the constructor
            // directly, without an OLD_STATE and without metamorphose
            // after. That should be rooted out.
            throw new Error(
                `INTERNAL LOGIC ERROR "${key}" should exist, but it doesn't`,
            );

        if (!this.isDraft) return item;

        // Don't create proxy twice and thereby detach the old one.
        if (!item.isDraft && this[_LOCAL_PROXIES].byKey.has(key))
            return this[_LOCAL_PROXIES].byKey.get(key); // => proxy;

        // The function understands if item is already a draft
        // and does not proxify item in that case.
        const proxyOrDraft = _PotentialWriteProxy.create(this, item);
        if (_PotentialWriteProxy.isProxy(proxyOrDraft)) {
            this[_LOCAL_PROXIES].byKey.set(key, proxyOrDraft);
            this[_LOCAL_PROXIES].byProxy.set(proxyOrDraft, key);
        }
        return proxyOrDraft;
    }

    _getLink(key) {
        if (!this.constructor.links.has(key))
            throw new Error(
                `KEY ERROR "${key}" is not a link found in ${this}.`,
            );
        // resolve the link
        const link = this.constructor.links.get(key),
            foreignKey = this.constructor.foreignKeys.get(link.keyName),
            targetKey = this.get(link.keyName),
            target = this.get(foreignKey.targetName);
        // FIXME: IMPROVE handling of this case everywhere!
        if (targetKey.value === ForeignKey.NULL) return ForeignKey.NULL;
        return target.get(targetKey.value);
    }

    _getFallBackValue(key) {
        if (!this.constructor.fallBackValues.has(key))
            throw new Error(
                `KEY ERROR "${key}" is not a fallBackValues found in ${this}.`,
            );
        const fallBackValue = this.constructor.fallBackValues.get(key),
            primaryValue = this.get(fallBackValue.primaryName);
        return primaryValue !== ForeignKey.NULL
            ? primaryValue
            : this.get(fallBackValue.fallBackName);
    }

    get(key, defaultReturn = _NOTDEF) {
        if (this.hasOwn(key)) return this._getOwn(key);
        if (this.constructor.internalizedDependencies.has(key))
            return this.dependencies[
                this.constructor.internalizedDependencies.get(key)
                    .dependencyName
            ];
        if (this.constructor.links.has(key)) return this._getLink(key);
        if (this.constructor.fallBackValues.has(key))
            return this._getFallBackValue(key);
        if (defaultReturn !== _NOTDEF) return defaultReturn;
        throw new Error(`KEY ERROR "${key}" not found in ${this}.`);
    }

    // TODO: how does this work? Can't initialize at least complex stuff,
    // that has dependencies from outside!
    set(key, entry) {
        if (!this.isDraft)
            // Writing in all model classes:
            // raise an error when not in draft mode!
            // so the caller can change this into a draft
            // this can be achieved using js proxies!
            throw immutableWriteError(
                new Error(
                    `NOT DRAFT ERROR: ${this} can't call set when not in draft phase.`,
                ),
            );

        // Entry can be draft or an immutable, get and the potentialWriteProxy
        // will handle both cases.

        // The constructor will check types etc. but this still raises a
        // KEY ERROR if key can't be set, to alert early when this is attempted.
        if (!this.hasOwn(key))
            throw new Error(
                `KEY ERROR trying to set not owned (or unknown) "${key}" in ${this}.`,
            );

        this._value.set(key, unwrapPotentialWriteProxy(entry));

        // This disconnects by-key potential write proxies
        this[_LOCAL_PROXIES].changedBySetter.add(key);
        if (this[_LOCAL_PROXIES].byKey.has(key)) {
            // break the connection
            const proxy = this[_LOCAL_PROXIES].byKey.get(key);
            this[_LOCAL_PROXIES].byKey.delete(key);
            this[_LOCAL_PROXIES].byProxy.delete(proxy);
        }
    }

    [SERIALIZE](options = SERIALIZE_OPTIONS) {
        const [resultErrors, entries] = _serializeContainer(
            this,
            /*presenceIsInformation*/ false,
            /*keepKeys*/ SERIALIZE_OPTIONS.structStoreKeys,
            options,
        );
        return [
            resultErrors,
            entries !== null &&
            options?.structAsDict &&
            SERIALIZE_OPTIONS.structStoreKeys
                ? Object.fromEntries(entries)
                : entries,
        ];
    }
}
