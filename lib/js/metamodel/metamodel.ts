import {
    _BaseModel,
    _BaseSimpleModel,
    _BaseContainerModel,
    FreezableSet,
    FreezableMap,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    _DEFERRED_DEPENDENCIES,
    SERIALIZE_OPTIONS,
    ResourceRequirement,
    SERIALIZE_FORMAT_OBJECT,
    driveResolveGenAsync,
    isDeliberateResourceResolveError,
    SERIALIZE,
    serializeItem,
    keyConstraintError,
    immutableWriteError,
    isDraftKeyError,
    _serializeContainer,
} from './base-model.ts';

// These are the exports from ./base-model.ts that are used beyond this
// file. I would prefer it, if users would import them directly.
// NOTE: don't "pollute" this export statement with exports that are
// not originating in base-model.ts
export {
    FreezableSet,
    FreezableMap,
    ResourceRequirement,
    keyConstraintError,
    SERIALIZE_OPTIONS,
    driveResolveGenAsync,
    isDeliberateResourceResolveError,
    isDraftKeyError,
    _BaseContainerModel,
    _BaseSimpleModel,
    SERIALIZE_FORMAT_OBJECT
}

import {
    CoherenceFunction
} from './coherence-function.ts';

export {
    CoherenceFunction
}

import {
    _NOTDEF,
    iterMap,
    sort_alpha,
    objectEntriesAreEqual,
    collectDependencies,
    unwrapPotentialWriteProxy,
} from './util.ts';

export { objectEntriesAreEqual, collectDependencies };

import {
    ForeignKey
} from './foreign-key.ts';

export {
    ForeignKey
}

import {
    _PRIMARY_SERIALIZED_VALUE,
    deserializeGen,
    serialize,
    deserializeSync,
} from './serialization.ts';

export {
    deserializeGen,
    serialize,
    deserializeSync
}

import {
    _BaseLink,
    ValueLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
} from './links.ts';

export {
    _BaseLink,
    ValueLink,
    FallBackValue,
    InternalizedDependency,
    StaticDependency,
}

import {
    topologicalSortKahn,
} from './topological-sort.ts';

export {
    topologicalSortKahn,
};

import {
    IS_WRAPPER_TYPE,
    _LOCAL_PROXIES,
    _OLD_TO_NEW_SLOT,
    _HAS_DRAFT_FOR_PROXY,
    _HAS_DRAFT_FOR_OLD_STATE_KEY,
    _GET_DRAFT_FOR_PROXY,
    _GET_DRAFT_FOR_OLD_STATE_KEY,
    _PotentialWriteProxy,
} from './potential-write-proxy.ts';
export {
    IS_WRAPPER_TYPE,
    _PotentialWriteProxy,
    unwrapPotentialWriteProxy,
};


import { _AbstractStructModel } from './struct-model.ts';
export { _AbstractStructModel };

import { _AbstractGenericModel } from './generic-model.ts';
export { _AbstractGenericModel };

import { _AbstractEnumModel } from './enum-model.ts';
export { _AbstractEnumModel };

import { _AbstractSimpleOrEmptyModel } from './simple-or-empty-model.ts';
export { _AbstractSimpleOrEmptyModel };

import { _AbstractNumberModel } from './number-model.ts';
export { _AbstractNumberModel };

import {
    AnyModel, IntegerModel, NumberModel, BooleanModel,
    BooleanDefaultTrueModel, StringModel,
} from './simple-models.ts';
export {
    AnyModel, IntegerModel, NumberModel, BooleanModel,
    BooleanDefaultTrueModel, StringModel,
};

// list/array type
// items are accessed by index
// has a size/length
// I'd prefer to have a single type for all items, that way,
// we can't have undefined entries, however, a type could be
// of the form TypeOrEmpty...
// MultipleTargets ...!
export class _AbstractListModel extends _BaseContainerModel {
    static get dependencies() {
        return this.Model.dependencies;
    }

    static Model: _BaseModel;

    static createClass(
        className: string,
        Model: _BaseModel /* a _BaseModel */,
    ) {
        // jshint unused: vars
        // this way name will naturally become class.name.
        const result = {
            // jshint ignore: start
            [className]: class extends this {
                static Model = Model;
            },
            // jshint ignore: end
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState = null,
        dependencies = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        if (oldState === null && dependencies === null)
            throw new Error(
                `TYPE ERROR either oldState or dependencies are required.`,
            );
        if (oldState !== null && dependencies !== null)
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(
                `TYPE ERROR can't constuct with both oldState and dependencies`,
            );

        if (oldState && oldState.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ` +
                    `oldState ${oldState} is draft but must be immutable.`,
            );
        super(oldState);

        // Start with an empty this._value for quick not-changed comparison.
        Object.defineProperty(this, "_value", {
            value: new Array(
                this[OLD_STATE] !== null ? this[OLD_STATE].length : 0,
            ),
            writable: false, // can't replace the array itself
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
        // Keep track of proxies and OLD_STATE original indexes in a
        // shadow of this._value that is kept in sync with value!
        // Entries may get replaced by set or moved/removed by splice.
        this[_OLD_TO_NEW_SLOT] = [...this._value.keys()].map((index) => [
            index,
            null /*proxy*/,
        ]);

        // Create an immutable primal state if OLD_STATE is null:
        if (dependencies !== null) {
            if (serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [
                    serializedValue,
                    serializeOptions,
                ];
            }
            // Must return a new object (when called with `new`).
            // only works when there was no OLD_STATE
            if (dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    *#_metamorphoseGen(dependencies = {}) {
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
        );

        // Required for comparison between OLD_STATE and this.
        // These are the names and values of the dependencies of the class.
        // We need to compare these to see if a change of the object is required.
        //
        // It's interesting, I'm not sure we need to do this comparision
        // in here! We may not even have to keep reccord of these, as the
        // children will do. If there are no children, this will not actually
        // have dependencies, if there are children, the children will report...
        //
        // There's a case: when in draft, to create a child for insertion
        // it's good to have the dependencies for the constructor. They can
        // be taken from [OLD_STATE] basically and be used directly.
        //
        // myOldList // maybe like myDraftList[OLD_STATE] or from the app state
        // newEntry = myOldList.Model.createPrimalState(myOldList.dependencies)
        // or
        // newEntry = new myOldList.Model(null, myOldList.dependencies);

        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(dependenciesData),
            writable: true,
            configurable: true,
        });

        if (this[_PRIMARY_SERIALIZED_VALUE]) {
            const [serializedValues, serializeOptions] =
                    this[_PRIMARY_SERIALIZED_VALUE],
                childItems = [];
            for (const serializedValue of serializedValues) {
                const childItem =
                    yield* this.constructor.Model.createPrimalStateGen(
                        this.dependencies,
                        serializedValue,
                        serializeOptions,
                    );
                childItems.push(childItem);
            }
            this.push(...childItems);
        }
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        const dependenciesAreEqual =
            this[OLD_STATE] !== null &&
            objectEntriesAreEqual(
                this[OLD_STATE].dependencies,
                this.dependencies,
            );

        // shortcut
        if (
            dependenciesAreEqual &&
            this.size === this[OLD_STATE].size &&
            // is only empty slots i.e. no changes
            Object.values(this._value).length === 0
        )
            return this[OLD_STATE];

        for (const index of this._value.keys()) {
            let item = Object.hasOwn(this._value, index) && this._value[index];
            if (!item && this[OLD_STATE] !== null) {
                const [oldIndex /*proxy*/] = this[_OLD_TO_NEW_SLOT][index];
                item = this[OLD_STATE].get(oldIndex);
            }

            if (!(item instanceof this.constructor.Model))
                throw new Error(
                    `TYPE ERROR ${this.constructor.name} ` +
                        `expects ${this.constructor.Model.name} ` +
                        `wrong type in ${index} ("${item}" typeof ${typeof item}).`,
                );
            const immutable = item.isDraft
                ? yield* item.metamorphoseGen(this.dependencies)
                : // Not sure if we should check with objectEntriesAreEqual
                  // or just let entry check itself if it has to move forward.
                  !objectEntriesAreEqual(this.dependencies, item.dependencies)
                  ? yield* item.getDraft().metamorphoseGen(this.dependencies)
                  : item;
            this._value[index] = immutable;
        }
        // last stop to detect a no-change
        if (
            this[OLD_STATE] !== null &&
            dependenciesAreEqual &&
            this.size === this[OLD_STATE].size &&
            this._value.every(
                (entry, index) => entry === this[OLD_STATE].get(index),
            )
        )
            return this[OLD_STATE];
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(this.dependencies),
            writable: true,
            configurable: true,
        });
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
        delete this[_OLD_TO_NEW_SLOT];
        Object.freeze(this);
    }

    #_metamorphoseCleanUp() {
        delete this.dependencies;
    }

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

    get length() {
        return this._value.length;
    }

    get size() {
        return this._value.length;
    }

    hasOwn(key) {
        const [index /*message*/] = this.keyToIndex(key);
        return index !== null;
    }

    ownKeys() {
        return [...this._value.keys()].map((i) => i.toString(10));
    }

    *[Symbol.iterator]() {
        for (const key of this.ownKeys()) yield [key, this.get(key)];
    }

    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if (!this.isDraft) return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownProxy]) => ownProxy === proxy,
        );
        if (index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item || !item.isDraft) return false;

        // Item is a draft created here for proxy. We know because
        // the proxy was used to find the index.
        return true;
    }
    [_HAS_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        if (!this.isDraft) return false;
        // this implies that if this is a draft all items in
        // this._value must be drafts as well! But do we know?
        // It's not important: if the value was created externally
        // or set as an immutable from external, this won't return the
        // value anyways!

        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);
        if (oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([ownOldIndex]) => ownOldIndex === oldIndex,
        );
        if (index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item || !item.isDraft) return false;

        // Item is a draft created here for key. We know because
        // the key was used to find the index.
        return true;
    }

    [_GET_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        // key must be in this[OLD_STATE]!
        // draft will be for this[OLD_STATE].get(key).getDraft()
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${oldKey}) is immutable, not a draft.`,
                ),
            );

        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);

        if (oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([ownOldIndex]) => ownOldIndex === oldIndex,
        );
        if (index === -1)
            // The item associated with oldIndex is no longer part of this
            // object, the proxy is disconnected.
            return false;

        let item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item) item = this[OLD_STATE].get(oldIndex);

        if (item.isDraft)
            // We already created the connection between
            // index and oldIndex, we found index via oldKey,
            // item belongs to oldIndex.
            return item;
        const draft = item.getDraft();
        this._value[index] = draft;
        return draft;
    }

    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        if (!this.isDraft)
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`,
                ),
            );

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownProxy]) => ownProxy === proxy,
        );
        if (index === -1)
            // proxy is disconnected
            return false;

        let item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item) {
            const [oldIndex] = this[_OLD_TO_NEW_SLOT][index];
            // assert oldIndex is there, otherwise this will raise a Key Error
            // also, if oldIndex got removed from _OLD_TO_NEW_SLOT there
            // must be an item in this._value or the proxy is disconnected.
            item = this[OLD_STATE].get(oldIndex);
        }
        if (item.isDraft)
            // since we found it via proxy, item belongs to it.
            // assert this._value[index] === item
            return item;
        const draft = item.getDraft();
        this._value[index] = draft;
        return draft;
    }

    getDraftFor(key, defaultReturn = _NOTDEF) {
        const proxyOrDraft = this.get(key, defaultReturn);
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft;
    }

    /**
     * Zero-based index of the array element to be returned, converted
     * to an integer. Negative index counts back from the end of the
     * array — if index < 0, index + array.length is accessed.
     */
    keyToIndex(key) {
        if (key === ForeignKey.NULL)
            return [null, `KEY ERROR ForeignKey.NULL is not a key.`];
        if (key === undefined) return [null, `KEY ERROR key is undefined.`];
        const stringKey = key.toString();
        let index = parseInt(stringKey, 10);
        if (isNaN(index))
            return [null, `KEY ERROR can't parse "${stringKey}" as integer.`];
        if (index < 0)
            // like Array.prototype.at
            // HOWEVER, the key is not the canonical path in this case;
            index = index + this._value.length;
        if (index < 0 || index >= this._value.length)
            return [
                null,
                `KEY ERROR NOT FOUND key "${stringKey}" is not an index (parseInt: ${index})` +
                    ` (index < 0 || index >= lenght ${this._value.length}). in ${this}`,
            ];
        return [index, null];
    }

    indexOf(item, fromIndex) {
        return this._value.indexOf(item, fromIndex);
    }

    get(key, defaultReturn = _NOTDEF) {
        const [index, message] = this.keyToIndex(key);
        if (index === null) {
            if (defaultReturn !== _NOTDEF) return defaultReturn;
            throw new Error(message);
        }

        if (!this.isDraft) return this._value[index];

        // Can be a draft or immutable e.g. via set(index, element)
        let item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item) {
            // If there's no item in value[index] yet, oldIndex will exist.
            const [oldIndex, proxy] = this[_OLD_TO_NEW_SLOT][index];
            if (proxy)
                // Important, otherwise we could create the proxy multiple
                // times and override the older versions.
                return proxy;
            // KeyError if the assumption is wrong, this would require
            // fixing in here!
            // Is always immutable.
            item = this[OLD_STATE].get(oldIndex);
        }

        // The function understands if item is already a draft
        // and does not proxify item in that case.
        const proxyOrDraft = _PotentialWriteProxy.create(this, item);
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            // it's a proxy
            this[_OLD_TO_NEW_SLOT][index][1] = proxyOrDraft;
        // else: It is a draft already and the draft is at this._value[index];
        return proxyOrDraft;
    }

    // FIXME: thinking, if this has a child-type with dependencies,
    //        it should be possible to create a new 'blank'/default entry
    //        at that index as a draft and manipulate it, there's not really
    //        a use for a set function then.
    // Also, if a dependency changes, it will be interesting how to handle
    // that change in a list etc. will we try to keep state or basically reset
    // everything? I guess this will be an afterthought, after establishing a
    // general working model for dependency management. And maybe configurable
    // per case.
    // TODO: remove `set`
    //       add interface to createAt(key) => primal->draft
    //       only in draft mode
    set(key, entry) {
        const [index, message] = this.keyToIndex(key);
        if (index === null) throw new Error(message);
        this.splice(index, 1, entry);
    }

    push(...entries) {
        this.splice(Infinity, 0, ...entries);
        return this.length;
    }
    unshift(...entries) {
        this.splice(0, 0, ...entries);
        return this.length;
    }
    pop() {
        return this.splice(-1, 1)[0];
    }
    shift() {
        return this.splice(0, 1)[0];
    }
    delete(key) {
        const [index /* message*/] = this.keyToIndex(key);
        if (index === null) return;
        return this.splice(index, 1)[0];
    }
    // The Swiss Army Knive of array methods.
    splice(start, deleteCount, ...entries) {
        if (!this.isDraft)
            // FIXME: for the potential write proxy, it becomes very
            // interesting trying to write many entries.
            // Also interesting for that when trying to write no entries and just removing stuff.
            throw immutableWriteError(
                new Error(
                    `NOT DRAFT ERROR: ${this} can't call splice when not in draft phase.`,
                ),
            );

        const removed = this._value.splice(
                start,
                deleteCount,
                ...entries.map((entry) => unwrapPotentialWriteProxy(entry)),
            ),
            // Replaces [index, proxy] by empty arrays, disconnecting proxies
            oldToNewRemoved = this[_OLD_TO_NEW_SLOT].splice(
                start,
                deleteCount,
                ...new Array(entries.length).fill(null).map(() => []),
            );
        for (let index = 0; index < removed.length; index++) {
            if (!Object.hasOwn(removed, index)) {
                // If there's no item in value[index] yet, oldIndex will exist.
                const [oldIndex /*, proxy*/] = oldToNewRemoved[index];
                // Could be necessary to handle proxy as well, but it is
                // not written to by now, so we may just return the immutable.
                removed[index] = this[OLD_STATE].get(oldIndex);
            }
        }
        return removed;
    }
    [SERIALIZE](options = SERIALIZE_OPTIONS) {
        return _serializeContainer(
            this,
            /*presenceIsInformation*/ true,
            /*keepKeys*/ false,
            options,
        );
    }
}

/**
 * The only use of this function so far is to demo custom ordering in
 * _AbstractOrderedMapModel. It's not included as a fixed option,
 * like e.g. KEYS_ALPHA, as it doesn't really have an actual use-case IMO.
 *
 * setup = {
 *      ordering: _AbstractOrderedMapModel.ORDER.CUSTOM
 *    , customOrderingFn: toShuffle
 * }
 * const MyModelMap = _AbstractOrderedMapModel.createClass('MyModelMap', MyModel, setup);
 */
export function toShuffle(from) {
    const array = Array.from(from);
    let currentIndex = array.length;
    // While there remain elements to shuffle...
    while (currentIndex != 0) {
        // Pick a remaining element...
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex],
            array[currentIndex],
        ];
    }
    return array;
}

// combines the order and inserting logic of the _AbstractListModel
// with the uniqueness by the keys of the _AbstractMapModel
// FIXME it should be possible to have a way to validate keys
//       that is attached to the concrete class via createClass.
const MAP_ORDER = Object.freeze({
    KEYS_ALPHA: Symbol("ORDER_KEYS_ALPHA"),
    KEYS_ALPHA_REVERSE: Symbol("ORDER_KEYS_ALPHA_REVERSE"),
    CUSTOM: Symbol("ORDER_CUSTOM"),
    CUSTOM_REVERSE: Symbol("ORDER_CUSTOM_REVERSE"),
});

export class _AbstractOrderedMapModel extends _BaseContainerModel {
    static Model: _BaseModel;

    static get dependencies() {
        return this.Model.dependencies;
    }

    static ORDER = MAP_ORDER;

    static [MAP_ORDER.KEYS_ALPHA](values) {
        const entries = new Map(),
            keys = [];
        for (const [key, data] of values) {
            entries.set(key, [key, data]);
            keys.push(key);
        }
        return keys.sort(sort_alpha).map((key) => entries.get(key));
    }

    static [MAP_ORDER.KEYS_ALPHA_REVERSE](values) {
        return this[this.ORDER.KEYS_ALPHA](values).reverse();
    }

    static [MAP_ORDER.CUSTOM](values) {
        return this._customOrderingFn(values);
    }

    static [MAP_ORDER.CUSTOM_REVERSE](values) {
        return this._customOrderingFn(values).reverse();
    }

    static createClass(className: string, Model: _BaseModel, setup = {}) {
        // jshint unused: vars
        setup = {
            ordering: _NOTDEF,
            customOrderingFn: _NOTDEF,
            validateKeyFn: _NOTDEF,
            ...setup,
        };
        if (setup.ordering !== _NOTDEF) {
            const availableOrderingSymbols = new Set(Object.values(this.ORDER));
            if (!availableOrderingSymbols.has(setup.ordering))
                throw new Error(
                    `KEY ERROR setup.ordering unknown "${setup.ordering.toString()}" ` +
                        `allowed values are ${this.name}.ORDER.(${Object.keys(this.ORDER).join("|")}).`,
                );
            if (
                setup.ordering === this.ORDER.CUSTOM ||
                setup.ordering === this.ORDER.CUSTOM_REVERSE
            ) {
                if (setup.customOrderingFn === _NOTDEF)
                    throw new Error(
                        `VALUE ERROR setup.ordering is "${setup.ordering.toString()}" but setup.customOrderingFn is not specified`,
                    );
                if (typeof setup.customOrderingFn !== "function")
                    throw new Error(
                        `VALUE ERROR setup.customOrderingFn must be a function but is "${typeof setup.customOrderingFn}".`,
                    );
                // NOTE: Not checking here if that function behaves correctly!
            }
        }
        if (setup.validateKeyFn !== _NOTDEF) {
            if (typeof setup.validateKeyFn !== "function")
                throw new Error(
                    `VALUE ERROR setup.validateKeyFn must be a function but is "${typeof setup.validateKeyFn}".`,
                );
        }

        // this way name will naturally become class.name.
        const result = {
            // jshint ignore: start
            [className]: class extends this {
                static Model: _BaseModel = Model;
                static ORDERING =
                    setup.ordering === _NOTDEF ? null : setup.ordering;
                static _customOrderingFn =
                    setup.customOrderingFn === _NOTDEF
                        ? function (/*values*/) {
                              throw new Error(
                                  `NOT IMPLEMENTED _customOrderingFn is not defined in ${this.name}`,
                              );
                          }
                        : setup.customOrderingFn;
                static validateKeyFn =
                    setup.validateKeyFn === _NOTDEF
                        ? null
                        : setup.validateKeyFn;
            },
            // jshint ignore: end
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState = null,
        dependencies = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        if (oldState === null && dependencies === null)
            throw new Error(
                `TYPE ERROR either oldState or dependencies are required.`,
            );
        if (oldState !== null && dependencies !== null)
            // The problem is that metamorphose may return OLD_STATE but
            // as a constructor that is invoked with the `new` keyword,
            // a new object must be returned.
            throw new Error(
                `TYPE ERROR can't constuct with both oldState and dependencies`,
            );

        if (oldState && oldState.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ` +
                    `oldState ${oldState} is draft but must be immutable.`,
            );
        super(oldState);

        // Start with an empty this._value for quick not-changed comparison.
        Object.defineProperty(this, "_value", {
            value: new Array(
                this[OLD_STATE] !== null ? this[OLD_STATE].length : 0,
            ),
            writable: false, // can't replace the array itself
            configurable: true,
        });
        Object.defineProperty(this, "_keys", {
            value: new FreezableMap(),
            writable: false, // can't replace the FreezableMap itself
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
        // Keep track of proxies and OLD_STATE original indexes in a
        // shadow of this._value that is kept in sync with value!
        // Entries may get replaced by set or moved/removed by splice.

        this[_OLD_TO_NEW_SLOT] =
            this[OLD_STATE] !== null
                ? [...this[OLD_STATE]].map(([key /*value*/], index) => [
                      index,
                      key,
                      null /*proxy*/,
                  ])
                : [];
        this._updateKeys();

        // Create an immutable primal state if OLD_STATE is null:
        if (dependencies !== null) {
            if (serializedValue !== null) {
                // I don't want to have this as an direct argument
                // of metamorphose so far, as this way it's made sure
                // that only the Primal State can load the serialized
                // state. If it's not a primary state, change is handled
                // differently.
                this[_PRIMARY_SERIALIZED_VALUE] = [
                    serializedValue,
                    serializeOptions,
                ];
            }
            // Must return a new object (when called with `new`).
            // only works when there was no OLD_STATE
            if (dependencies !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies);
        }
    }

    *#_metamorphoseGen(dependencies = {}) {
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
        );

        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(dependenciesData),
            writable: true,
            configurable: true,
        });

        if (this[_PRIMARY_SERIALIZED_VALUE]) {
            const [serializedValues, serializeOptions] =
                    this[_PRIMARY_SERIALIZED_VALUE],
                childItems = [];
            for (const [key, serializedValue] of serializedValues) {
                const childItem =
                    yield* this.constructor.Model.createPrimalStateGen(
                        this.dependencies,
                        serializedValue,
                        serializeOptions,
                    );
                childItems.push([key, childItem]);
            }
            this.push(...childItems);
        }
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];

        const dependenciesAreEqual =
            this[OLD_STATE] !== null &&
            objectEntriesAreEqual(
                this[OLD_STATE].dependencies,
                this.dependencies,
            );

        // shortcut
        if (
            dependenciesAreEqual &&
            this.size === this[OLD_STATE].size &&
            // is only empty slots i.e. no changes
            Object.values(this._value).length === 0
        )
            return this[OLD_STATE];

        for (const index of this._value.keys()) {
            const kvItem = Object.hasOwn(this._value, index)
                ? this._value[index]
                : this[OLD_STATE].value[this[_OLD_TO_NEW_SLOT][index][0]];
            const [key, item] = kvItem || [];

            if (!(item instanceof this.constructor.Model))
                throw new Error(
                    `TYPE ERROR ${this.constructor.name} ` +
                        `expects ${this.constructor.Model.name} ` +
                        `wrong type at ${key} in ${index} ("${item}" typeof ${typeof item}).`,
                );
            const immutable = item.isDraft
                ? yield* item.metamorphoseGen(this.dependencies)
                : // Not sure if we should check with objectEntriesAreEqual
                  // or just let entry check itself if it has to move forward.
                  !objectEntriesAreEqual(this.dependencies, item.dependencies)
                  ? yield* item.getDraft().metamorphoseGen(this.dependencies)
                  : item;
            this._value[index] = Object.freeze([key, immutable]);
        }

        // NOTE: this only ensures that the immutable map is ordered
        // the mutable map can be in undefined order.
        if (this.constructor.ORDERING !== null) {
            // this._keys will get updated in #_lockAndFreeze via _updateKeys();
            const newlyOrderedEntries = this.constructor[
                this.constructor.ORDERING
            ](this._value);
            this._value.splice(0, Infinity);
            for (const entry of newlyOrderedEntries) this._value.push(entry);
        }

        // last stop to detect a no-change
        if (
            this[OLD_STATE] !== null &&
            dependenciesAreEqual &&
            this.size === this[OLD_STATE].size &&
            this._value.every((entry, index) => {
                const [key, value] = entry,
                    [oldKey, oldValue] = this[OLD_STATE].value[index];
                return key === oldKey && value === oldValue;
            })
        )
            return this[OLD_STATE];
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(this.dependencies),
            writable: true,
            configurable: true,
        });
        delete this[OLD_STATE];
        Object.defineProperty(this, "_value", {
            value: Object.freeze(this._value),
            writable: false,
            configurable: false,
        });
        this._updateKeys();
        Object.defineProperty(this, "_keys", {
            value: Object.freeze(this._keys),
            writable: false,
            configurable: false,
        });

        Object.defineProperty(this, _IS_DRAFT_MARKER, {
            value: false,
            configurable: false,
        });
        delete this[_OLD_TO_NEW_SLOT];
        Object.freeze(this);
    }

    #_metamorphoseCleanUp() {
        delete this.dependencies;
    }

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

    _updateKeys() {
        this._keys.clear();
        for (const index of this._value.keys()) {
            const key = Object.hasOwn(this._value, index)
                ? this._value[index][0]
                : this[_OLD_TO_NEW_SLOT][index][1];
            this._keys.set(key, index);
        }
    }

    get value() {
        if (this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`,
            );
        return this._value;
    }

    *[Symbol.iterator]() {
        for (const key of this.ownKeys()) yield [key, this.get(key)];
    }

    *indexedEntries() {
        for (const [key, value] of this) {
            const [index /* error message*/] = this.keyToIndex(key);
            yield [index, [key, value]];
        }
    }

    get length() {
        return this._value.length;
    }

    get size() {
        return this._value.length;
    }

    hasOwn(key) {
        return this._keys.has(key);
    }
    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy) {
        if (!this.isDraft) return false;

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, , ownProxy]) => ownProxy === proxy,
        );
        if (index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const [, /*key*/ item] = (Object.hasOwn(this._value, index) &&
            this._value[index]) || [null, null];
        if (!item || !item.isDraft) return false;

        // Item is a draft created here for proxy. We know because
        // the proxy was used to find the index.
        return true;
    }
    [_HAS_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        if (!this.isDraft) return false;
        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);
        if (oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownOldKey]) => ownOldKey === oldKey,
        );
        if (index === -1)
            // proxy is disconnected
            return false;

        // May not be a draft at this moment!
        // In that case it may also not yet be in this._value.
        const [, /*key*/ item] = (Object.hasOwn(this._value, index) &&
            this._value[index]) || [null, null];
        if (!item || !item.isDraft) return false;

        // Item is a draft created here for key. We know because
        // the key was used to find the index.
        return true;
    }

    [_GET_DRAFT_FOR_OLD_STATE_KEY](oldKey) {
        // key must be in this[OLD_STATE]!
        // draft will be for this[OLD_STATE].get(key).getDraft()
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${oldKey}) is immutable, not a draft.`,
                ),
            );

        const [oldIndex, message] = this[OLD_STATE].keyToIndex(oldKey);
        if (oldIndex === null)
            // was not in OLD_STATE
            throw new Error(message);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownOldKey]) => ownOldKey === oldKey,
        );
        if (index === -1)
            // The item associated with oldIndex is no longer part of this
            // object, the proxy is disconnected.
            return false;

        let kvItem = Object.hasOwn(this._value, index) && this._value[index];
        if (!kvItem) {
            const item = this[OLD_STATE].get(oldKey);
            kvItem = [oldKey, item];
        }
        const [key, item] = kvItem;
        if (item.isDraft)
            // We already created the connection between
            // index and oldIndex, we found index via oldKey,
            // item belongs to oldIndex.
            return item;
        const draft = item.getDraft();
        this._value[index] = Object.freeze([key, draft]);
        return draft;
    }

    /**
     * Raises KeyError if key is not available.
     * Raises ImmutableWriteError if this is not a draft.
     * Returns False, if draft is not natively created by this function
     * i.e. set from the outside.
     * Returns a draft for key otherwise.
     * this is likely only for _BaseContainerModel
     */
    [_GET_DRAFT_FOR_PROXY](proxy) {
        if (!this.isDraft)
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`,
                ),
            );

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, , ownProxy]) => ownProxy === proxy,
        );
        if (index === -1)
            // proxy is disconnected
            return false;

        let kvItem = Object.hasOwn(this._value, index) && this._value[index];
        if (!kvItem) {
            const [, /*oldIndex*/ key] = this[_OLD_TO_NEW_SLOT][index],
                // assert key is there, otherwise this will raise a Key Error
                // also, if oldIndex got removed from _OLD_TO_NEW_SLOT there
                // must be an item in this._value or the proxy is disconnected.
                item = this[OLD_STATE].get(key);
            kvItem = [key, item];
        }
        const [key, item] = kvItem;
        if (item.isDraft)
            // since we found it via proxy, item belongs to it.
            // assert this._value[index] === item
            return item;
        const draft = item.getDraft();
        this._value[index] = Object.freeze([key, draft]);
        return draft;
    }

    getDraftFor(key, defaultReturn = _NOTDEF) {
        const proxyOrDraft = this.get(key, defaultReturn);
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft;
    }

    get(key, defaultReturn = _NOTDEF) {
        const [index, message] = this.keyToIndex(key);
        if (index === null) {
            if (defaultReturn !== _NOTDEF) return defaultReturn;
            throw new Error(message);
        }

        if (!this.isDraft) return this._value[index][1];

        // Can be a draft or immutable e.g. via set(index, element)
        let item = Object.hasOwn(this._value, index) && this._value[index][1];
        if (!item) {
            // If there's no item in value[index] yet, oldIndex will exist.
            // FIXME: I guess I could rather just use: this[OLD_STATE].get(key)
            //        instead of taking this discourse. Of course:
            //              assert oldKey === key
            //              assert oldKey === this[OLD_STATE].keyToIndex(key)[0]
            //        In that case this[_OLD_TO_NEW_SLOT] could be simplified
            //        as there would be no need to carry oldIndex around!
            const [oldIndex /*oldKey*/, , proxy] =
                this[_OLD_TO_NEW_SLOT][index];
            if (proxy)
                // Important, otherwise we could create the proxy multiple
                // times and override the older versions.
                return proxy;
            // KeyError if the assumption is wrong, this would require
            // fixing in here!
            // Is always immutable.
            item = this[OLD_STATE].getIndex(oldIndex);
        }

        // The function understands if item is already a draft
        // and does not proxify item in that case.
        const proxyOrDraft = _PotentialWriteProxy.create(this, item);
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            // it's a proxy
            this[_OLD_TO_NEW_SLOT][index][2] = proxyOrDraft;
        // else: It is a draft already and the draft is at this._value[index];
        return proxyOrDraft;
    }

    keyToIndex(key) {
        if (!this._keys.has(key))
            return [null, `KEY ERROR "${key}" not found.`];
        return [this._keys.get(key), null];
    }

    // This method can be handy for the arraySplice method.
    indexOfKey(key) {
        return this._keys.has(key) ? this._keys.get(key) : -1;
    }

    indexToKey(searchIndex) {
        let index = parseInt(searchIndex, 10);
        if (isNaN(index))
            return [null, `KEY ERROR can't parse "${searchIndex}" as integer.`];
        if (index < 0)
            // like Array.prototype.at
            index = index + this._value.length;
        if (index < 0 || index >= this._value.length)
            return [
                null,
                `KEY ERROR NOT FOUND index "${searchIndex}" is not an index (= ${index})` +
                    ` (index > 0 && index < ${this._value.length}.`,
            ];

        const key = Object.hasOwn(this._value, index)
            ? this._value[index][0]
            : this[_OLD_TO_NEW_SLOT][index][1];
        return [key, null];
    }

    keyOfIndex(index, defaultReturn = _NOTDEF) {
        const [key, message] = this.indexToKey(index);
        if (key === null) {
            if (defaultReturn !== _NOTDEF) return defaultReturn;
            throw new Error(message);
        }
        return key;
    }

    getIndex(index, defaultReturn = _NOTDEF) {
        const key = this.keyOfIndex(index, defaultReturn);
        // via get as the single point of reading
        // also important so far to have a single point for the proxy
        // _GET_DRAFT_FOR_OLD_STATE_KEY mechanics, i.e. the result of `get`
        // will be wrapped into the proxy using the `key` argument.
        return this.get(key, defaultReturn);
    }

    ownKeys() {
        return this._keys.keys();
    }

    indexOf(item, fromIndex) {
        // If fromIndex >= array.length, the array is not searched and -1 is returned.
        if (fromIndex >= this._value.length) return -1;

        // Negative index counts back from the end of the array —
        // if fromIndex < 0, fromIndex + array.length is used.
        // Note, the array is still searched from front to back in this case.
        if (fromIndex < 0) fromIndex = fromIndex + this._value.length;

        // If fromIndex < -array.length or fromIndex is omitted, 0
        // is used, causing the entire array to be searched.
        if (fromIndex === undefined || fromIndex < 0) fromIndex = 0;

        const searchArray =
            fromIndex === 0 ? this._value : this._value.slice(fromIndex);
        let result = searchArray.findIndex(([, myItem]) => myItem === item);
        if (result !== -1 && fromIndex) result = result + fromIndex;
        return result;
    }

    static validateKey(key) {
        // FIXME: In theory a lot more types of keys should be allowed
        // but there's yet no such use case and other types wouldn't
        // survive serialization
        const keyType = typeof key,
            allowedTypes = new Set([typeof "", typeof 0, typeof true]);
        // Technically true, false, null can be acceptable!
        // e.g. all of the JSON/JS basic types that serialize
        // in a unique way. NOTE: null is also a result of
        // JSON.stringify(NaN) (Infinity) but we only allow null
        if (
            (allowedTypes.has(keyType) || key === null) &&
            (keyType !== "number" || isFinite(key))
        ) {
            // FIXME: processing of these keys should be aware that they
            // are path-parts as a whole and maybe escape them appropriately.
            // however, this is not implemented yet and "a/key/containing/slashes"
            // causes touble: "trouble/key" as a key in "/activeState/typeSpec/children/0/stylePatchesSource" triggers:
            //      Error: KEY ERROR "trouble" not found. (path: /activeState/typeSpec/children/0/stylePatchesSource/trouble/key);
            //  via StateComparison.getChangedMap
            if (key.indexOf(Path.SEPARATOR) != -1)
                return [
                    false,
                    `key can't contain the path separator "${Path.SEPARATOR}" ` +
                        `as path parts are not reliably escaped so far. Key is "${key}". (FIXME)`,
                ];
            if (this.validateKeyFn !== null) return this.validateKeyFn(key);
            return [true, null];
        }
        return [
            false,
            `the type of a key must be ` +
                `string, a finite number, boolean or null but key "${key}" is ${keyType}`,
        ];
    }

    _validateKey(key) {
        return this.constructor.validateKey(key);
    }
    /**
     * As a one stop solution, this cleans this._value and rebuilds
     * all of this._keys. Duplicate keys will be removed.
     * As entries can override existing keys but also existing keys
     * can override entries that are inserted before the existing entries
     * with the same keys, this can be a bit complex.
     * In general, this will keep the keys that end up later in the
     * array after insertion and remove the others.
     * Similar like Object.fromEntries([['a',1], ['a', 2], ['a', 3]])
     * will create: {'a': 3}.
     */
    arraySplice(index, deleteCount, ...entries) {
        if (!this.isDraft)
            // FIXME: for the potential write proxy, it becomes very
            // interesting trying to write many entries.
            // Also interesting for that when trying to write no entries and just removing stuff.
            throw immutableWriteError(
                new Error(
                    `NOT DRAFT ERROR: ${this} can't call arraySplice when not in draft phase.`,
                ),
            );

        const _entries = entries.map((kv, i) => {
                // Also creates a defensive copy of the k,v pair
                if (!Array.isArray(kv))
                    throw new Error(
                        `VALUE ERROR key-value pair must be an array, entry ${i}: ${kv}`,
                    );
                const _kv = Array.from(kv);
                if (!_kv.length >= 2)
                    throw new Error(
                        `TYPE ERROR Key-Value pair must a length ` +
                            `of at least 2 [key, value] but entry ${i} ${_kv} length is ${_kv.length}`,
                    );
                const [valid, message] = this._validateKey(_kv[0]);
                if (!valid)
                    throw new Error(`TYPE ERROR in entry ${i}: ${message}`);
                return Object.freeze(_kv);
            }),
            deleted = this._value.splice(
                index,
                deleteCount,
                ..._entries.map((kvItem) => {
                    const unwrapped = unwrapPotentialWriteProxy(kvItem[1]);
                    if (kvItem[1] !== unwrapped) return [kvItem[0], unwrapped];
                    return kvItem;
                }),
            );
        // Replaces [index, key, proxy] by empty arrays, disconnecting proxies
        this[_OLD_TO_NEW_SLOT].splice(
            index,
            deleteCount,
            ...new Array(entries.length).fill(null).map(() => []),
        );
        // We can have duplicate keys in entries and we can have
        // duplicate keys in this._value already.
        const seen = new Set(),
            deletedOnInsert = [];
        for (let i = this._value.length - 1; i >= 0; i--) {
            const kv = Object.hasOwn(this._value, i)
                ? this._value[i]
                : // Can use this[OLD_STATE].value because this[OLD_STATE]
                  // is immutable.
                  this[OLD_STATE].value[this[_OLD_TO_NEW_SLOT][i][0]];
            const [key /*value*/] = kv;
            if (seen.has(key)) {
                // remove duplicate
                deletedOnInsert.push(...this._value.splice(i, 1));
                // also disconnect these proxies
                this[_OLD_TO_NEW_SLOT].splice(i, 1);
                continue;
            }
            seen.add(key);
            if (!Object.isFrozen(kv))
                // defensive copy
                this._value[i] = Object.freeze(kv.slice());
        }
        // We iterated backwards, this is a better order.
        deletedOnInsert.reverse();
        deleted.push(...deletedOnInsert);
        this._updateKeys();
        return deleted;
    }

    splice(startKey, deleteCount, ...entries) {
        const [index, message] = this.keyToIndex(startKey);
        if (index === null) throw new Error(message);
        return this.arraySplice(index, deleteCount, ...entries);
    }

    // This method will push undefined keys to the end.
    set(key, newEntry) {
        const [index /*message*/] = this.keyToIndex(key);
        // replace or append
        this.arraySplice(index === null ? Infinity : index, 1, [key, newEntry]);
    }

    delete(key) {
        const [index /*message*/] = this.keyToIndex(key);
        if (index === null) return;
        return this.arraySplice(index, 1)[0];
    }

    // append, add to end
    push(...entries) {
        this.arraySplice(Infinity, 0, ...entries);
        return this.size;
    }
    // add to front
    unshift(...entries) {
        this.arraySplice(0, 0, ...entries);
        return this.size;
    }
    // remove from end
    pop() {
        return this.arraySplice(-1, 1)[0];
    }
    // remove from front
    shift() {
        return this.arraySplice(0, 1)[0];
    }

    /**
     * It's like an "upsert"
     * mapLike.constructor.Model must be a "simple model"
     *       with a set(rawValue) method and without dependenies
     *       required for Model.createPrimalDraft
     * usage:
     *   axisLocations.setSimpleValue(, axisTag, value)
     */
    setSimpleValue(key, value) {
        if (!this.has(key))
            this.set(key, this.constructor.Model.createPrimalDraft());
        this.get(key).set(value);
    }

    [SERIALIZE](options = SERIALIZE_OPTIONS) {
        return _serializeContainer(
            this,
            /*presenceIsInformation*/ true,
            /*keepKeys*/ true,
            options,
        );
    }
}

//
// has all of the dependencies OR one model that can change completely
// dynamically, maybe we can fix dependecies before, in the model, for
// the time being it will be easier, required for layouts anyways.
// but, it will have to dispatch and upate etc. whatever the type requires.
// Because of the fixed initOrder, in _AbstractStruct, it would be hard
// to change dependencies dynamically, but it's also not that bad either
// it's just a passed list of dependencies. We can have the Dynamic wrapper
// (of structs) proxy the API of the value struct...
//
// As a type this is based on _BaseContainerModel as the idea is to
// to wrap _AbstractStructModel, and the _BaseContainerModel type
// is currently used to detect if the element can be traversed.
//
// Maybe better: _AbstractDynamicStructWrappingModel
export class _AbstractDynamicStructModel extends _BaseContainerModel {
    // Protocol: marks this as a wrapper type for _PotentialWriteProxy
    get [IS_WRAPPER_TYPE]() { return true; }

    // FIXME: making this dynamic won't be that easy at all!
    //        as the concrete model will only be added later
    //        but maybe this is just the starting point to implement the
    //        required functionality...
    static get dependencies() {
        return this.dependenciesNames;
    }

    static createClass(
        className: string,
        BaseTypeOrAvailableTypesMapDependencyName:
            | _AbstractStructModel
            | string /* a Base Model/Type */,
        // To get the actual ModelClass/Constructor from the dependencies.
        modelDependencyName,
        dependenciesNames,
    ) {
        // this way name will naturally become class.name.
        let BaseType: _AbstractStructModel | null = null,
            availableTypesDependencyName: string | null = null;
        const availableTypesDependencyNameInject = [];
        if (typeof BaseTypeOrAvailableTypesMapDependencyName === "string") {
            availableTypesDependencyNameInject.push(
                BaseTypeOrAvailableTypesMapDependencyName,
            );
            availableTypesDependencyName =
                BaseTypeOrAvailableTypesMapDependencyName;
        } else BaseType = BaseTypeOrAvailableTypesMapDependencyName;

        const result = {
            [className]: class extends this {
                // jshint ignore: start
                static BaseType: _AbstractStructModel | null = BaseType;
                static availableTypesDependencyName: string | null =
                    availableTypesDependencyName;
                static modelDependencyName = modelDependencyName;
                static dependenciesNames = Object.freeze(
                    new FreezableSet([
                        modelDependencyName,
                        ...availableTypesDependencyNameInject,
                        ...dependenciesNames,
                    ]),
                );
                // jshint ignore: end
            },
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState = null,
        dependencies = null,
        serializedValue = null,
        serializeOptions = SERIALIZE_OPTIONS,
    ) {
        // Must call first to be able to use with this.constructor.name.
        super(oldState);
        if (oldState === null && dependencies === null)
            throw new Error(
                `TYPE ERROR either oldState or dependencies are required in ${this.constructor.name}.`,
            );
        if (oldState !== null && dependencies !== null)
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

        Object.defineProperty(this, "_value", {
            // _value is only null in primal state pre-metamorphose
            value:
                this[OLD_STATE] !== null && this[OLD_STATE].hasWrapped
                    ? // As a draft for two reasons:
                      // 1) It's quicker and simple, otherwise, this
                      //    would have to implement all of the protential
                      //    write proxy protocol.
                      // 2) It makes sense, this is implemented to be
                      //    be very transparent as a wrapper to its
                      //    contained state. When this is turned into
                      //    a draft, the contained state will be written.
                      //    The one case, where the contained state will
                      //    not be written is when it is replaced
                      //    and in that case, the draft created here
                      //    doesn't go through metamorphosis/checking
                      //    and hence it is not really costly.
                      this[OLD_STATE].wrapped.getDraft()
                    : null,
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
                    serializedValue,
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

    *#_metamorphoseGen(dependencies = {}) {
        const dependenciesData = collectDependencies(
            this.constructor.dependencies,
            dependencies,
            this[OLD_STATE]?.dependencies,
        );
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(dependenciesData),
            writable: true,
            configurable: true,
        });

        const dependenciesAreEqual =
            this[OLD_STATE] !== null &&
            objectEntriesAreEqual(
                this[OLD_STATE].dependencies,
                this.dependencies,
            );

        // shortcut
        if (
            dependenciesAreEqual && // includes that there's an old state
            this[OLD_STATE].wrapped === this._value
        )
            // Has NOT changed!
            return this[OLD_STATE];
        const childDependencies = this.WrappedType
            ? Object.fromEntries(
                  iterMap(this.WrappedType.dependencies, (key) => {
                      if (this.dependencies[key] === undefined)
                          throw new Error(
                              `VALUE ERROR in ${this} WrappedType "${this.WrappedType.name}" dependency "${key}" is undefined.`,
                          );
                      return [key, this.dependencies[key]];
                  }),
              )
            : {};
        if (
            this._value === null || // only in primal state creation
            // IMPORTANT: this will throw away all changes made to
            // the child in this ending draft phase, however, the
            // child is invalid and this is the right thing to do.
            //
            // We could raise an error if there are changes on
            // this._value as that would indicate we're throwing away
            // valuable changes.
            //
            // If it is desired to keep information from the child
            // around, it must be done somewhere up in the model
            // hierarchy or somewhere else in the application logic.
            // If we don't replace this here we got to check here and
            // fail and also allow in `set wrapped` to set a yet
            // unapproved type.
            //
            // NOT FULLY TRUE: the changing function can as well first
            // change/metamorphose this into using the new type and
            // then apply changes to the draft of that ...
            // That's why the parent should check if this has the
            // correct wrapped type!
            this._value.constructor !== this.WrappedType
        ) {
            if (this._value)
                console.warn(
                    `${this} overriding wrapped value from ${this._value} ` +
                        `to WrappedType ${(this.WrappedType && this.WrappedType.name) || this.WrappedType}. ` +
                        `Is a draft: ${this._value.isDraft} `,
                );
            Object.defineProperty(this, "_value", {
                value: this.WrappedType
                    ? yield* this.WrappedType.createPrimalStateGen(
                          childDependencies,
                          ...(this[_PRIMARY_SERIALIZED_VALUE] || []),
                      )
                    : null,
                configureable: true,
            });
        } else {
            Object.defineProperty(this, "_value", {
                value: this._value.isDraft
                    ? yield* this._value.metamorphoseGen(childDependencies)
                    : !objectEntriesAreEqual(
                            childDependencies,
                            this._value.dependencies,
                        )
                      ? yield* this._value
                            .getDraft()
                            .metamorphoseGen(childDependencies)
                      : this._value,
                configureable: true,
            });
        }
        // Don't keep this
        delete this[_PRIMARY_SERIALIZED_VALUE];
        if (dependenciesAreEqual && this[OLD_STATE].wrapped === this._value)
            return this[OLD_STATE];
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(this.dependencies),
            writable: false,
            configurable: false,
        });
        delete this[OLD_STATE];
        Object.defineProperty(this, "_value", {
            value: this._value,
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
        // Let's see if this is sufficient! this._value may be metamorphosed
        // after all and also this.WrappedType could change this._value.
        // I'm not sure if this will work out all the time.
        delete this.dependencies;
    }
    // FIXME: feels like this must funnel dependencies into
    // the this._value draft
    // and in a way, this will become a lot like a struct
    // but with **DYNAMIC** dependencies
    // we can make sure maybe, that there's a fixed set of external
    // dependencies, and we always consume these in here, so they will
    // be available ... Especially on primalState creation
    // I mean, so far that is availableFonts and availableLayouts, the
    // latter one is not so interesting for the use case...
    // OR, we have the app inject the actual layout state as a dependency
    // kind of moving the problem out of scope (not too happy with that
    // would be cool one level deeper in the ApplicationModel struct.)
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

    // Only when this is a primal state
    get hasWrapped() {
        return this._value !== null;
    }

    get wrapped() {
        if (this._value === null)
            throw new Error(
                `LIFECYCLE ERROR ${this} has no value element, it's probably primal state.`,
            );
        return this._value;
    }

    get WrappedType() {
        if (
            this.dependencies[this.constructor.modelDependencyName] ===
            ForeignKey.NULL
        )
            return null;
        // FIXME: 'typeClass' is an implementation detail of the linked
        // struct. There should be either a way to configure this or a
        // way to ensure the linked model implements that interface,
        // like e.g. a trait/mixin that can be checked.
        return this.dependencies[this.constructor.modelDependencyName].get(
            "typeClass",
        ).value;
    }

    get availableTypes() {
        return this.dependencies[this.constructor.availableTypesDependencyName];
    }

    set wrapped(state) {
        if (!this.isDraft)
            // required: so this can be turned into a draft on demand
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft, can't set value.`,
                ),
            );

        // This is a paradigm shift! The type must be however be in the
        // availableTypes
        if (this.constructor.availableTypesDependencyName !== null) {
            let found = false;
            const typeNames = [];
            for (const [, /*key*/ item] of this.availableTypes) {
                const typeClass = item.get("typeClass").value;
                typeNames.push(typeClass.name);
                if (typeClass === state.constructor) {
                    found = true;
                    break;
                }
            }
            if (!found)
                throw new Error(
                    `TYPE ERROR ${this} expects an instance of ` +
                        `"${typeNames.join(", ")}" but state item is "${state}".`,
                );
        }
        if (
            this.constructor.BaseType !== null &&
            !(state instanceof this.constructor.BaseType)
        )
            throw new Error(
                `TYPE ERROR ${this} expects an instance of ` +
                    `"${this.constructor.BaseType.name}" but state item is "${state}".`,
            );

        // Actually, we know the concrete type that is injected with
        // the dependencies so it is required to always use that type!
        if (state.constructor !== this.WrappedType && this.WrappedType !== null)
            throw new Error(
                `TYPE ERROR ${this} expects a direct instance of ` +
                    `"${(this.WrappedType && this.WrappedType.name) || this.WrappedType}" but state item is "${state}".`,
            );

        // Could set immutable state as well, but it may also collide
        // with user expectations. There are two alternatives:
        // - implement potential write proxy protocol, also see
        //   the constructor comment.
        // - have the user put state into draft mode explicitly before,
        //   calling this, otherwise fail on write.
        const draft = state.isDraft ? state : state.toDraft();
        Object.defineProperty(this, "_value", {
            value: draft,
            configureable: true,
        });
    }

    // This proxies the complete public _AbstractStructModel API
    // As such, when this becomes a draft, wrapped should become a draft
    // as well ... !
    // However, the wrapped item, ideally never becomes proxified, as
    // this acts in place of it!

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
            item = this.get(key);
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

        if (!this.has(key)) return false;

        if (this[_LOCAL_PROXIES].changedBySetter.has(key))
            // disconnected from original OLD_STATE key releation
            return false;

        // MAY NOT BE A DRAFT AT THIS MOMENT!
        const item = this.get(key);
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

        const item = this.has(key)
            ? this.get(key) // => assert item.isDraft
            : // expect OLD_STATE to exist!
              this[OLD_STATE].get(key); // item is not a draft
        if (item.isDraft)
            // Since it was not changedBySetter this must be the original
            // draft for the item at OLD_STATE
            return item;
        const draft = unwrapPotentialWriteProxy(item).getDraft();
        this.set(key, draft);
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
            item = this.has(key) ? this.get(key) : this[OLD_STATE].get(key);
        // MAY NOT BE A DRAFT AT THIS MOMENT! => via set(key, immutable)...
        // in that case were going to replace the item in this._value with
        // its draft.
        if (item.isDraft)
            // We own the proxy, so the draft is from here.
            return item;
        const draft = unwrapPotentialWriteProxy(item).getDraft();
        this.set(key, draft);
        return draft;
    }

    *[Symbol.iterator]() {
        if (!this.hasWrapped) return;
        yield* this.wrapped.entries();
    }
    getDraftFor(key, defaultReturn = _NOTDEF) {
        return this.wrapped.getDraftFor(key, defaultReturn);
    }
    get(key, defaultReturn = _NOTDEF) {
        return this.wrapped.get(key, defaultReturn);
    }
    set(key, entry) {
        return this.wrapped.set(key, entry);
    }

    hasOwn(key) {
        return this.wrapped.hasOwn(key);
    }
    ownKeys() {
        return this.wrapped.ownKeys();
    }
    // override if ownership and available keys differ
    has(key) {
        return this.wrapped.has(key);
    }
    // override if ownership and available keys differ
    keys() {
        return this.wrapped.keys();
    }

    *entries() {
        if (!this.hasWrapped) return;
        yield* this.wrapped.entries();
    }

    *allEntries() {
        if (!this.hasWrapped) return;
        yield* this.wrapped.allEntries();
    }

    get size() {
        return this.wrapped.size;
    }

    [SERIALIZE](options = SERIALIZE_OPTIONS) {
        if (this.hasWrapped) return serializeItem(this.wrapped, options);
        else
            // FIXME: how to differentiate between no type an an empty/all default type?
            // I guess the parent has to know!
            return [[], null];
    }
}

export const PathModel = _AbstractGenericModel.createClass("PathModel", {
        sanitizeFN: function (rawValue) {
            if (typeof rawValue === "string")
                return [Path.fromString(rawValue), null];
            // let validateFN catch this
            return [rawValue, null];
        },
        validateFN: function (value) {
            // must be a Path
            if (value instanceof Path) return [true, null];
            return [
                false,
                `Value must be an instance of Path but is not: ` +
                    `"${value?.toString() || value}" (typeof: ${typeof value}; ` +
                    `constructor name: ${value?.constructor.name}).`,
            ];
        },
        serializeFN: function (value /*, options=SERIALIZE_OPTIONS*/) {
            return value.toString();
        },
        deserializeFN: function (
            serializedString /*, options=SERIALIZE_OPTIONS*/,
        ) {
            return Path.fromString(serializedString);
        },
    });
export const PathModelOrEmpty = _AbstractSimpleOrEmptyModel.createClass(PathModel);

// FIXME: also AvailableTypesModel/TypeModel should be centrally defined
//        so that we got one place where the pattern is implemented
// this is uses for color, axesMath, stylePatch and similarly forked in actors
export function createAvailableTypes(AvailableTypesModel, types) {
    const availableTypesDraft = AvailableTypesModel.createPrimalDraft({}),
        TYPE_TO_KEY = new Map(),
        TypeModel = AvailableTypesModel.Model;
    for (const [key, label, Model] of types) {
        const availableType = TypeModel.createPrimalDraft({});
        availableType.get("typeClass").value = Model;
        availableType.get("label").value = label;
        availableTypesDraft.push([key, availableType]);
        TYPE_TO_KEY.set(Model, key);
    }
    const availableTypes = availableTypesDraft.metamorphose();
    return [availableTypes, TYPE_TO_KEY];
}

/**
 * Look at ColorModel of color.mjs or ActorModel of actors/actors-base.mjs
 * how the "DynamicModel" is set up.
 */
export function createDynamicType(
    DynamicModel,
    typeKeyName,
    typeKeyValue,
    dependencies,
) {
    const availableTypesKey =
            DynamicModel.foreignKeys.get(typeKeyName).targetName, // e.g. 'availableActorTypes'
        availableTypes = DynamicModel.staticDependencies.has(availableTypesKey)
            ? DynamicModel.staticDependencies.get(availableTypesKey).state
            : dependencies[availableTypesKey],
        getTypeFor = (key) =>
            availableTypes.get(key).value.get("typeClass").value,
        getDraftFor = (name, deps) => getTypeFor(name).createPrimalDraft(deps),
        draft = getDraftFor(typeKeyValue, dependencies),
        resultDraft = DynamicModel.createPrimalDraft(dependencies);
    resultDraft.get(typeKeyName).value = typeKeyValue;
    resultDraft.get("instance").wrapped = draft;
    return resultDraft;
}

export function getMinMaxRangeFromType(Type) {
    const UnwrappedType =
        Type.prototype instanceof _AbstractSimpleOrEmptyModel
            ? Type.Model
            : Type;
    return [UnwrappedType.minVal, UnwrappedType.maxVal];
}

export function* getFieldsByType(FromType, SearchType) {
    for (const [fieldName, Type] of FromType.fields) {
        if (Type === SearchType) yield fieldName;
    }
}

export class Path {
    // jshint ignore: start
    static SEPARATOR = "/";
    static RELATIVE = ".";
    static ROOT = "/";
    static PARENT = "..";
    // jshint ignore: end

    /* Without actually knowing the model structure, the save
     * way to do this is to remove single dot path parts and
     * reduce consecutive slashes into single slashes.
     * Double dots could be handled as well, e.g.:
     *     '/hello/beautiful/../world' => '/hello/world'
     * But, when we decide to follow links, which are implemented
     * in the model, the links would have to be resolved first,
     * in place, before removing path parts.
     *
     * In the terminal a path is relative, until it begins with
     * '/' but in a way I'd prefer it to be absulute until it begins
     * with '.' or '..'
     * Maybe we can use a switch for this, but thinking about this:
     * if(pathParts[0] !== '')
     *     pathParts.unshift(this.RELATIVE);
     * In the end, this is the wrong place to decide! We know
     * if the first element is this.RELATIVE that the path is explicitly
     * relative, and if it is '' the part is explicitly absolute
     * otherwise we don't know in here.
     */
    static sanitize(...rawPathParts) {
        const pathParts = rawPathParts
                .map((part) =>
                    typeof part !== "number"
                        ? // will remove contained separators
                          part.split(this.SEPARATOR)
                        : part.toString(10),
                )
                .flat(), // Array.prototype.flat is golden here.
            cleanParts = [];
        for (const [i, part] of pathParts.entries()) {
            if (part === this.RELATIVE) {
                // Only keep as first part, at the other positions it
                // is meaningless!
                // also void in a strings like:
                //         /./path/to => path/to NOT: ./path/to
                //         .././path/to => ../path/to
                //         path/.././to => to NOT ./to
                if (i === 0 && cleanParts.length === 0)
                    // => ['.']
                    cleanParts.push(part);
                continue;
            }
            if (part === "") {
                // filter the remains of consecutive separators/slashes
                if (i === 0 && cleanParts.length === 0)
                    // explicitly absolute
                    cleanParts.push(this.ROOT);
                continue;
            }
            if (part !== this.PARENT) {
                // regular path part
                cleanParts.push(part);
                continue;
            }

            // else: part === this.PARENT
            if (cleanParts.length === 0) {
                // this path is relative beyond its origin
                // => cleanParts = ['..']
                cleanParts.push(part);
                continue;
            }
            // cleanParts.length > 0
            const last = cleanParts.at(-1);
            if (last == this.RELATIVE) {
                // Only happens when cleanParts.length === 1, see above
                // this.RELATIVE is kept only as first item.
                // cleanParts = ['.']
                // => cleanParts = ['..']
                cleanParts.splice(-1, 1, part);
                continue;
            }
            if (last === this.PARENT) {
                // this path is relative beyond its origin and more
                //  => ['..', '..']
                cleanParts.push(part);
                continue;
            }
            // last is a regular pathPart
            // consumes that one
            //  e.g. cleanParts = ['hello', 'world'];
            //       => cleanParts = ['world']
            cleanParts.pop();
        }
        return cleanParts;
    }
    static stringSanitize(str) {
        return this.fromString(str).toString();
    }
    constructor(...pathParts) {
        const [firstPart, ...parts] = this.constructor.sanitize(...pathParts),
            // this.constructor.PARENT is not interesting in here as it
            // won't change serialisation
            explicitAnchoring =
                firstPart === this.constructor.ROOT ||
                firstPart === this.constructor.RELATIVE
                    ? firstPart
                    : null;
        if (pathParts.length && explicitAnchoring === null)
            // that's a regular part
            parts.unshift(firstPart);
        Object.defineProperty(this, "explicitAnchoring", {
            value: explicitAnchoring,
            enumerable: true,
        });
        Object.defineProperty(this, "isExplicitlyRelative", {
            value: explicitAnchoring === this.constructor.RELATIVE,
            enumerable: true,
        });
        Object.defineProperty(this, "isExplicitlyAbsolute", {
            value: explicitAnchoring === this.constructor.ROOT,
            enumerable: true,
        });

        Object.defineProperty(this, "parts", {
            value: Object.freeze(parts),
            enumerable: true,
        });
    }
    static fromParts(...pathParts) {
        return new this(...pathParts);
    }
    static fromString(pathString) {
        const splitted =
            pathString === "" ? [] : pathString.split(this.SEPARATOR);
        return this.fromParts(...splitted);
    }
    fromString(pathString) {
        return this.constructor.fromString(pathString);
    }
    fromParts(...pathParts) {
        return this.constructor.fromParts(...pathParts);
    }
    toString(defaultAnchoring = null /*ROOT || RELATIVE || null */) {
        if (
            defaultAnchoring !== null &&
            defaultAnchoring !== this.constructor.RELATIVE &&
            defaultAnchoring !== this.constructor.ROOT
        )
            throw new Error(
                `TYPE ERROR defaultAnchoring must be either null, ` +
                    `${this.constructor.name}.RELATIVE or ` +
                    `${this.constructor.name}.ROOT but it is: "${defaultAnchoring}".`,
            );
        const anchoring =
            this.explicitAnchoring === null
                ? defaultAnchoring
                : this.explicitAnchoring;
        if (anchoring === null)
            return this.parts.join(this.constructor.SEPARATOR);
        if (this.parts.length === null) return anchoring;
        return [
            anchoring === this.constructor.SEPARATOR ? "" : anchoring,
            ...this.parts,
        ].join(this.constructor.SEPARATOR);
    }
    *[Symbol.iterator]() {
        if (this.explicitAnchoring !== null) yield this.explicitAnchoring;
        yield* this.parts;
    }
    appendString(pathString) {
        return this.append(...this.fromString(pathString).parts);
    }
    append(...pathParts) {
        return this.fromParts(...this, ...pathParts);
    }
    get isBase() {
        return this.parts.length === 0;
    }
    slice(from, to) {
        return this.fromParts(
            this.explicitAnchoring || "",
            ...this.parts.slice(from, to),
        );
    }
    get parent() {
        if (this.isBase)
            throw new Error("Can't get parent path is a base path.");
        return this.slice(0, -1);
    }
    startsWith(rootPath) {
        const parts = [...this];
        for (const part of rootPath) {
            if (parts.shift() !== part) return false;
        }
        // Each part of rootPath is at the beginning of this;
        return true;
    }
    isRootOf(pathOrString) {
        const path =
            typeof pathOrString === "string"
                ? Path.fromString(pathOrString)
                : pathOrString;
        return path.startsWith(this);
    }
    equals(pathOrString) {
        if (pathOrString === this) return true;
        const path =
            typeof pathOrString === "string"
                ? Path.fromString(pathOrString)
                : pathOrString;
        return path.startsWith(this) && this.startsWith(path);
    }
    toRelative(rootPath) {
        if (!this.startsWith(rootPath))
            throw new Error(
                `VALUE ERROR ${this.constructor.name}.toRelative ` +
                    `this ${this} does not start with rootPath ${rootPath}`,
            );
        const parts = [...this],
            rootPathParts = [...rootPath],
            relativeParts = parts.slice(rootPathParts.length);
        return Path.fromParts(".", ...relativeParts);
    }
}

export const IS_CONTAINER = Symbol("IS_CONTAINER");
export function* getAllPathsAndValues(state) {
    // This check should rather be "is a container type"
    // and that would mean it has entries and it has a
    // get function that returns values for keys...
    if (state instanceof _BaseContainerModel) {
        // yield [IS_CONTAINER];
        if (!state.allEntries)
            console.warn(`!state.allEntries ${state}`, state);
        for (const [key, entry] of state.allEntries())
            for (const [value, ...path] of getAllPathsAndValues(entry))
                yield [value, key, ...path];
    } else yield [state];
}

export function _getEntry(fnName, state, path, defaultVal = _NOTDEF) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    try {
        const result = [...pathInstance.parts].reduce((accum, part) => {
            if (!(accum instanceof _BaseContainerModel))
                throw new Error(
                    `CONTAINER ENTRY ERROR no container at ${part} in ${accum} path: ${pathInstance.toString()}.`,
                );
            return accum[fnName](part);
        }, state);
        return result;
    } catch (error) {
        // Could check if error is not a KEY ERROR type, but e don't!
        if (defaultVal !== _NOTDEF) return defaultVal;
        error.message += ` (path: ${path});`;
        throw error;
    }
}

export function getDraftEntry(state, path, defaultVal = _NOTDEF) {
    return _getEntry("getDraftFor", state, path, defaultVal);
}

export function getEntry(state, path, defaultVal = _NOTDEF) {
    return _getEntry("get", state, path, defaultVal);
}

export function getValue(state, path, defaultVal = _NOTDEF) {
    const result = getEntry(state, path, defaultVal);
    return result === defaultVal ? result : result.value;
}

// How does changing the font trickle down to an updated axisLocations state!
// it seems that some knowledge about the font (READ ONLY) must be in some
// lower model.
// AND:

export function* _getAllEntries(state, path) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    let current = state;
    yield current; // for the empty path
    for (const pathPart of pathInstance) {
        current = getEntry(current, pathPart);
        yield current;
    }
}

// FIXME: would be cool to be able to get the Model of
// Links.
export function getModel(RootModel, path) {
    const pathInstance =
        typeof path === "string" ? Path.fromString(path) : path;
    return pathInstance.parts.reduce((accum, key) => {
        console.log("getModel:", key, "from:", accum);
        if ("Model" in accum)
            // We don't use key here, because this is a Map/List
            // and the key is just a placeholder, the Model is equal
            // for each element.
            return accum.Model;
        if ("fields" in accum) return accum.fields.get(key);
        throw new Error(
            `KEY ERROR don't know how to get model from ${accum.name}`,
        );
    }, RootModel);
}

export function applyTo(state, path, methodNameOrFn, ...args) {
    const pathInstance =
            typeof path === "string" ? Path.fromString(path) : path,
        entry = getEntry(state, pathInstance);
    // should probably store ForeignKeys still as BaseModel!
    console.log(
        `... at path ${path} applyEntry ${entry} method ${methodNameOrFn}:`,
        ...args,
    );
    // how to change a non-container entry? => There's a set(value) method.
    // it basically has no methods to change!
    if (typeof methodNameOrFn === "function")
        return methodNameOrFn(entry, ...args);
    else return entry[methodNameOrFn](...args);
}

export function pushEntry(state, path, ...entries) {
    return applyTo(state, path, "push", ...entries);
}

export function popEntry(state, path) {
    return applyTo(state, path, "pop");
}

export function spliceEntry(state, path, start, deleteCount, ...items) {
    return applyTo(state, path, "splice", start, deleteCount, items);
}

export function deleteEntry(state, path, key) {
    return applyTo(state, path, "delete", key);
}

// States need comparison, state.eq(otherState).
// Also, it would be very nice if state were immutable, thus:
//          state.setSomeValue() => aNewState;
// we would be recreating state a lot though as this would have to change application state.
// but we would move parallell/sibling states that did not change to the new object.
// and checkiing is always done on initialization.
//
//    No: this.value = ...
//    But: that = this.set(value);
// that === this === true === no change???
// It's interesting. but is it overkill?
// is it a big effort to teach the Model how to update itself?
// can a visitor do so?

//Allright: TODO:
//
// change multiple values
//      transaction like behavior is actually super easy when we do the
//      immutable/copy on write thing:
//          * get the state
//          * transform as much as you like
//          * set the state to the application.
//
// Inherent coherenceFunctions!!!
//
// produce changed paths in a comparison(oldState, newState)
//          NOTE: in arrays/maps add/delete operation could be tracked
//                not sure we need this though, maybe just acknowledge that
//                the thing has changed???
//                especially for deletions, as for additons we can just
//                output the new path.
//                BTW: size/length could be treated as a change indicator
//                      so the ui knows wherther to rebuild a list rather
//                      than to update it?
//
// hmm for simple types and structs everything is always changed
// maps can also have added/deleted
// arrays can have added/deleted but also moves, when the element is still
// in the array but has another index.

class CompareStatus {
    constructor(name) {
        this.name = name;
        Object.freeze(this);
    }
    toString() {
        return `[compare ${this.name}]`;
    }
}
export const COMPARE_STATUSES = Object.freeze(
    Object.fromEntries(
        ["EQUALS", "CHANGED", "NEW", "DELETED", "MOVED", "LIST_NEW_ORDER"].map(
            (name) => [name, new CompareStatus(name)],
        ),
    ),
);

export function* rawCompare(oldState, newState) {
    if (!(oldState instanceof _BaseModel) || !(newState instanceof _BaseModel))
        throw new Error(
            `TYPE ERROR oldState ${oldState} and ` +
                `newState ${newState} must be instances of _BaseModel.`,
        );

    if (oldState.isDraft || newState.isDraft)
        throw new Error(
            `TYPE ERROR oldState ${oldState} and ` +
                `newState ${newState} must not be drafts.`,
        );

    const { EQUALS, CHANGED, NEW, DELETED, MOVED, LIST_NEW_ORDER } =
        COMPARE_STATUSES;
    if (oldState === newState) {
        // return also equal paths for completeness at the beginning,
        // can be filtered later.
        // HOWEVER this return will prevent the alogrithm from descending
        // in the structure and thus we won't get all available paths anyways!
        yield [EQUALS, null];
        return;
    }

    // Not the same constructor, but instanceof is not relevant here
    // because a sub-class can change everything about the model.
    if (oldState.constructor !== newState.constructor) {
        yield [CHANGED, null];
        return;
    }

    if (
        oldState instanceof _AbstractDynamicStructModel &&
        oldState.WrappedType !== newState.WrappedType
    ) {
        // This could maybe be a stronger indicator about the change of Type
        // as it requires a changed interface. Using NEW.
        // It is also marked as CHANGED when the the type is the same
        // but the value changed.
        yield [NEW, null];
        return;
    }

    // self yield? yes e.g. an array may not be equal (===) but contain
    // just equal items at the same position, still for strict equality
    // that doesn't matter because it's a diferent array?
    yield [CHANGED, null];

    if (oldState instanceof _BaseSimpleModel)
        // here not the same instance counts as change.
        return;

    // Now instanceof counts, because it tells us how to use/read the instances.
    if (
        oldState instanceof _AbstractStructModel ||
        oldState instanceof _AbstractDynamicStructModel
    ) {
        // both states are expected to have the same key

        for (const [key, oldEntry] of oldState.allEntries()) {
            const newEntry = newState.get(key);

            // FIXME: require more generic handling of possibly null entries
            //        however, currently it only applies to ForeignKey related
            //        entries (ValueLink) anyways

            // see _getLink
            const oldIsNull = oldEntry === ForeignKey.NULL,
                newIsNull = newEntry === ForeignKey.NULL;
            if (oldIsNull && !newIsNull) {
                yield [NEW, null, key];
                continue;
            }
            if (!oldIsNull && newIsNull) {
                yield [DELETED, null, key];
                continue;
            }
            if (oldIsNull && newIsNull) {
                yield [EQUALS, null, key];
                continue;
            }

            for (const [result, data, ...pathParts] of rawCompare(
                oldEntry,
                newEntry,
            ))
                yield [result, data, key, ...pathParts];
        }
        return;
    }

    if (oldState instanceof _AbstractListModel) {
        // I think this is a very interesting problem. On the Array layer
        // we can deal with change, addition, deletion and also movement
        // change (replace) is like deletion plus addition, we can't decide
        // how it happened exactly, it indicates that the new value and the
        // old value are not identical, nor somewhere in the array as that
        // would jst be moved.
        // Should we find moves first (from index, to index) so we can
        // keep them of other comparisions.
        //
        // so, when the new array is shorter than the old one we got
        // netto more deletion
        // when it's longer, we got netto addition.
        //
        // When everything new in newState got changed or replaced, we don't
        // care? One question would be how to map this to deeper down
        // change operations, we don't want to rebuild all of the UIs within
        // the array, just because one value deep down changed. Need to be
        // more precise.
        //
        // but also, when just one value in a multi-axis slider changed,
        // the mapping/updating would likely be swift.
        //
        // another example would be a simple reordering operation, e.g.
        // move the keyframe at index 4 to index 1 ...
        //
        // One question is probably how to decide whether the UI should be
        // replaced or updated! There may be a sweet spot at which replacing
        // is better than updating!
        // Consequently, we need to find out why we don't rebuild all of
        // the UI all the time, e.g. one entry in the root struct changed,
        // that should not require to rebuild the wholde app.
        // Similarly the array case, but it's much harder to decide here
        // what to do!
        //
        // hmm, to keep identities, a map could be used. Order could be
        // stored as part of the value, or next to the map, And the key
        // would be an increasing number (easy to handle!) for new inserts.
        // (Or we use an OrEmpty Type in an array to delete stuff, but at
        // this point, the map which allows for deletions natively is nice.
        // The array could be used to keep an ordered list of the keys.
        // It could be serialized without revealing the complex structure.
        // That way, new order of the array, or any additions deletions
        // etc. could be handled nicely by the UI.

        // Ok, such an id-array, if implemented as it's own type, what
        // can it do?
        // IDs are internal, not global.
        // Since set requires the element to exist already, it would not
        // change the id. But we can have a "replace" method.
        // set access is still via indexes,
        // it's interesting, we should rather make the implementation a
        // pattern. Because that way we can access the list independently
        // from the values, and get info if the list changed or not, in
        // contrast to the map...
        // Maybe a struct{
        //      order => list of ids
        //    . entries => map id: entry
        // }
        // IT should be impossible to come up with external ids though!
        //
        // So what is the aim of this?

        // A) to distinguish between change and replace:
        //     change: same key-id different entry => deep compare
        //             => how does the ui know?
        //                 if deeply anything changed, it will create a path
        //                 otherwise, there will be no deep path.
        //                 Consequently, even if the id of the entry changed
        //                 it may still be equivalent and no action is required!
        //                 but, we rather don't want to do equivalence comparison!
        //                 Hence, we, should not apply the changed if it's equivalent!
        //     replace: old key-id deleted new key-id inserted, order changed as well
        //             as before, we should probably not apply a replace if it's equivalent
        //             but this will otherwise create a new id, so it must recreate the UI(?)
        //             and it won't go into deep comparison?
        //
        // At the moment, I feel like I should create a simple solution that
        // could be enhanced later, either by adding new types to the model,
        // coherenceFunctions or by updating the compare method.

        // Deletions won't be mentioned, the new order length is the new lenght.
        // Entries are either old indexes, the new indexes are the
        // indexes of the order array.
        // new Order[3, 2, NEW, NEW, 4]: note how the last item did not change!
        // new Order[3, 2, NEW, NEW, EQUALS]
        // What if there are duplicates, i.e. entries that are equal?
        // Let's say they are consumend one by one! If oldState had two
        // entries of a kind and newState has three: []

        const newOrder = [],
            //  , seen = new Map()
            oldFoundIndexes = new Set();
        // for(const [oldIndex, oldEntry] of oldState) {
        //     const startIndex = seen.get(newEntry)
        //       , newIndex = newState.value.indexOf(oldEntry, startIndex)
        //       ;
        //     if(newIndex !== -1) {
        //         // found
        //         newOrder[newIndex] = oldIndex === newIndex ? [EQUALS] : [MOVED, oldIndex];
        //         seen.set(newEntry, oldIndex + 1);
        //     }
        //     else
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        // }
        // for(const [newIndex, newEntry] of newState) {
        //     if(newOrder[newIndex])
        //         continue;
        //     newOrder[newIndex] = newIndex < oldState.value.length ? [CHANGED] : [NEW];
        // }

        // NOTE: MOVED doesn't help UI and it also can make change detection
        // bad, e.g.:
        // * bad change detection: if two identical (===) siblings in old
        //   and the first sibling get changed, the first is marked as NEW
        //   and the second as MOVED, where the first marked as CHANGED and
        //   the second as EQUALS makes a lot more sense.
        // * doesn't help UI: In actual UI MOVED is treated as NEW where it
        //   could matter, because reqiring rootPath/dependecies in a hierarchy
        //   of sub-widgets is not (yet) implemented.
        //
        //
        // for(const [newKey, newEntry] of newState) {
        //     const startIndex = seen.get(newEntry)
        //       , [newIndex, /*message*/] = newState.keyToIndex(newKey)
        //       , oldIndex = oldState.value.indexOf(newEntry, startIndex)
        //       ;
        //     if(oldIndex === -1) {
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        //         continue;
        //     }
        //     // found
        //     newOrder[newIndex] = oldIndex === newIndex
        //                         ? [EQUALS]
        //                         : [MOVED, oldIndex]
        //                         ;
        //     seen.set(newEntry, oldIndex + 1);
        //     // there's a entry of newState in oldState at oldIndex
        //     oldFoundIndexes.add(oldIndex);
        // }
        for (const [newKey, newEntry] of newState) {
            const [newIndex /*message*/] = newState.keyToIndex(newKey);
            if (newOrder[newIndex] !== undefined) continue;
            if (oldState.has(newIndex) && oldState.get(newIndex) === newEntry)
                newOrder[newIndex] = [EQUALS];
            else
                // Not found in oldState, filling empty slots in newOrder
                // I'm not sure we even need to distinguish betwenn NEW and CHANGED
                // as both mean the content is different.
                newOrder[newIndex] =
                    newIndex >= oldState.length ||
                    // marked as MOVED, otherwise it would be in newOrder already
                    // i.e. newState.splice(2, 0, newEntry)
                    // now the index at 2 is NEW
                    // and the index at 3 is [MOVED, 2]
                    oldFoundIndexes.has(newIndex)
                        ? [NEW]
                        : // i.e. newState.splice(2, 1, newEntry)
                          // now the index at 2 is NEW
                          // and the oldEntry is gone
                          // => CHANGED is like DELETED + NEW
                          [CHANGED];
        }
        // FIXME: Could fill the differnce in length of newOrder with DELETED
        // not sure this is required, as newOrder.length is good and
        // similar information, but it gets destroyed by this:
        // newOrder.push(...new Array(Math.max(0, oldState.length - newOrder.length)).fill(DELETED));
        // could do: newOrder.newStateLength = newState.length
        Object.freeze(newOrder);
        yield [LIST_NEW_ORDER, newOrder];
        for (const [index, [status /*oldIndex*/]] of newOrder.entries()) {
            const key = index.toString(10);
            if (status === EQUALS || status === MOVED || status === NEW) {
                // EQUALS: nothing to do.
                // MOVED: not compared, listener must reorder according to newOrder.
                // could also be treated like NEW by the UI
                // NEW: Item at index requires a new UI or such, there's nothing to compare.
                yield [status, null, key];
                continue;
            }
            if (status === CHANGED) {
                // There's already an item at that index, so we compare:
                const oldEntry = oldState.get(index),
                    newEntry = newState.get(index);
                for (const [result, data, ...pathParts] of rawCompare(
                    oldEntry,
                    newEntry,
                ))
                    yield [result, data, key, ...pathParts];
                continue;
            }
            throw new Error(`Don't know how to handle status ${status}`);
        }
        return;
    }
    // NOTE: _AbstractOrderedMapModel could also be compared similar
    //       to _AbstractListModel above, however, it's not clear if
    //       we should rather compare by key/value pairs as value or
    //       as the payload value as value. Maybe a use cse will come up
    //       we will see then. In general it would be possible to produce
    //       both comparison styles, as a list and as a map.
    if (
        oldState instanceof _AbstractOrderedMapModel
        /* || oldState instanceof _AbstractMapModel*/
    ) {
        for (const [key /*oldEntry*/] of oldState) {
            if (!newState.has(key)) yield [DELETED, null, key];
        }
        for (const [key, newEntry] of newState) {
            if (!oldState.has(key)) {
                yield [NEW, null, key];
                continue;
            }
            const oldEntry = oldState.get(key);
            if (oldEntry === newEntry) {
                yield [EQUALS, null, key];
                continue;
            }
            // CHANGED: deep compare, both keys exist
            for (const [result, data, ...pathParts] of rawCompare(
                oldEntry,
                newEntry,
            ))
                yield [result, data, key, ...pathParts];
            continue;
        }
        return;
    }
    // * states should know how to compare
    // each level would produce changed keys, and we can recursively descend?
    // a verbose mode would provide all changed paths, where a compact mode
    // only keeps the longest unique paths, where the leaves changed, this
    // will be interesting!
    throw new Error(`VALUE ERROR Don't know how to compare ${oldState}`);
}

export function* compare(oldState, newState) {
    for (const [status, data, ...pathParts] of rawCompare(oldState, newState))
        yield [status, data, Path.fromParts("/", ...pathParts)];
}

export class StateComparison {
    static COMPARE_STATUSES = COMPARE_STATUSES; // jshint ignore:line
    constructor(oldState, newState) {
        Object.defineProperties(this, {
            oldState: {
                value: oldState,
                enumerable: true,
            },
            newState: {
                value: newState,
                enumerable: true,
            },
        });

        if (oldState !== null)
            Object.defineProperty(this, "compareResult", {
                value: Object.freeze([...compare(oldState, newState)]),
                enumerable: true,
            });

        this._compareDetailsMap = null;
        this._rootChangedMap = null;
    }
    static createInitial(
        newState,
        dependencies = null,
        anchoring = Path.ROOT /* null || Path.ROOT || Path.RELATIVE */,
    ) {
        return new InitialStateComparison(newState, dependencies, anchoring);
    }

    map(fn) {
        return this.compareResult.map(fn);
    }
    *[Symbol.iterator]() {
        yield* this.compareResult;
    }
    toLog() {
        console.log(`>>> ${this.constructor.name}.toLog ...`);
        for (const [status, data, path] of this) {
            if (status === COMPARE_STATUSES.LIST_NEW_ORDER) {
                console.log(`    ${status}: ${path} ;;`);
                for (const [i, [st, ...val]] of data.entries())
                    console.log(`        #${i} ${st} data:`, ...val, ";;");
            } else
                console.log(
                    `    ${status}: ${path}${data !== null ? " (data: " + data + ")" : ""} ;;`,
                );
        }
        console.log(`<<< ${this.constructor.name}.toLog DONE!`);
    }
    getDetaislMap() {
        // could be cached!
        if (this._compareDetailsMap !== null) return this._compareDetailsMap;

        const compareDetailsMap = new FreezableMap();
        for (const [status, data, pathInstance] of this) {
            const path = pathInstance.toString();
            if (!compareDetailsMap.has(path))
                compareDetailsMap.set(path, new Map());
            compareDetailsMap.get(path).set(status, data);
        }
        Object.defineProperty(this, "_compareDetailsMap", {
            value: Object.freeze(compareDetailsMap),
        });
        return this._compareDetailsMap;
    }
    _getRootChangedMap() {
        // TODO: Document!
        // COMPARE_STATUSES:
        // EQUALS CHANGED NEW DELETED MOVED LIST_NEW_ORDER
        const { CHANGED, NEW, EQUALS, DELETED, MOVED, LIST_NEW_ORDER } =
                COMPARE_STATUSES,
            expected = new Set([CHANGED, NEW, MOVED, EQUALS, DELETED]),
            skipNotImplemented = new Set([LIST_NEW_ORDER]),
            changedMap = new FreezableMap();
        // FIXME: I think I'm not fully satisfied with this dumbing down
        // of the compareResult, as it loses so much information, which
        // we may want to use selectively in the UI in one way or the other.
        for (const [status /* data */, , pathInstance] of this) {
            const path = pathInstance.toString();
            if (skipNotImplemented.has(status)) {
                // console.warn(`NOT IMPLEMENTED skipping update status ${status} @${path}`);
                // It's not implemented in here.
                continue;
                // TODO: for LIST_NEW_ORDER:
                // console.log(`    ${status}: ${path} ;;`);
                // for(let [i, [st, ...val]] of data.entries())
                //     console.log(`        #${i} ${st} data:`, ...val, ';;');
            } else if (!expected.has(status))
                throw new Error(
                    `NOT IMPLEMENTED don't know how to handle ${status} #${path}`,
                );
            else if (status === EQUALS || status === DELETED) continue;
            // console.log('status: ' + status, path);
            if (changedMap.has(path))
                // seen
                continue;
            const entry = getEntry(this.newState, path);
            changedMap.set(path, entry);
        }
        return changedMap;
    }
    getChangedMap(dependenciesMap = null, toLocal = true) {
        if (this._rootChangedMap === null)
            Object.defineProperty(this, "_rootChangedMap", {
                value: Object.freeze(this._getRootChangedMap()),
            });
        if (dependenciesMap === null) return this._rootChangedMap;
        const filteredChangedMap = new FreezableMap();
        for (const [rootPath, localPath] of dependenciesMap.entries()) {
            if (!this._rootChangedMap.has(rootPath)) continue;
            filteredChangedMap.set(
                toLocal ? localPath : rootPath,
                this._rootChangedMap.get(rootPath),
            );
        }
        return Object.freeze(filteredChangedMap);
    }

    get isInitial() {
        return false;
    }
}

// Not exported, accessed via StateComparison.createInitial(...)
class InitialStateComparison extends StateComparison {
    constructor(
        newState,
        dependencies = null,
        anchoring = Path.ROOT /* null || Path.ROOT || Path.RELATIVE */,
    ) {
        super(null, newState);
        const compareResultEntries = [],
            paths =
                dependencies === null
                    ? this._getPathsFromState(newState, anchoring)
                    : // This way it's not guaranteed that the paths do exist
                      // in newState, but it is very quick and only creates
                      // entries for the required dependencies.
                      Array.from(dependencies.keys()).map(
                          Path.fromString,
                          Path,
                      );
        for (const pathInstance of paths)
            compareResultEntries.push([
                COMPARE_STATUSES.NEW,
                undefined,
                pathInstance,
            ]);

        Object.defineProperty(this, "compareResult", {
            value: Object.freeze(compareResultEntries),
            enumerable: true,
        });
    }

    _getPathsFromState(state, anchoring = null) {
        const paths = [];
        for (const [, /*value*/ ...parts] of getAllPathsAndValues(state)) {
            const path =
                anchoring === null
                    ? Path.fromParts(...parts)
                    : Path.fromParts(anchoring, ...parts);
            paths.push(path);
        }
        return paths;
    }

    get isInitial() {
        return true;
    }
}

// Coherence guards:
//
// The UI of the type tools grid will serve here as a target, as it has
// a lot of inherent data logic, that should be separated. It also
// is layered several levlels deep, which makes it more interesting.
// At the outher most level e.g. an axis used in the dimension controls
// should not be used (be disabled) in manual axis locations.
// Then, between the (two) dimensions, the axis also must be mutual exclusive.
// On the level of the dimension itself, there's logic involved "massaging"
// stepping values with differnt constraints, min/max, being non-zero etc.
// also, about stepping, the model should be able to produce the "other value"
// either by exosing method or by exporting a static function or both.
//
//
// SQL Constraints come into mind, especially at this point e.g. UNIQUE:
//    NOT NULL - Ensures that a column cannot have a NULL value
//    UNIQUE - Ensures that all values in a column are different
//    PRIMARY KEY - A combination of a NOT NULL and UNIQUE. Uniquely identifies each row in a table
//    FOREIGN KEY - Prevents actions that would destroy links between tables
//    CHECK - Ensures that the values in a column satisfies a specific condition
//    DEFAULT - Sets a default value for a column if no value is specified
//    CREATE INDEX - Used to create and retrieve data from the database very quickly
//
// Maybe we can have layers of checks here, things like UNIQUE could easily
// be built in, while more complex stuff needs to be custom.
//
// Good thing we are immutable: We can build up the new model completeley
// and then validate it (also, ask/decide to skip validation while in progress)
// It's just important that eventually there's a coherent model.
// If the new model is invalid, we just don't apply it, and that's it.
//
// I'll have tp look into some nosql/object stores a bit!
// there's e.g. a common model to reference another value by unique ID
// which is very handy when normalizing stuff!. E.g. the activeTarget
// state is an index into the list of targets. And the dimension axis
// is an index into the list of available axes.
// Within a datastructure, uniqueness can also be achieved i.e. using a
// dictionary, where the keys are unique by default. Bue, e.g. references
// to those entries from further away.
