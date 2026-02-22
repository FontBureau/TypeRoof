import {
    _BaseModel, _BaseContainerModel, OLD_STATE, _IS_DRAFT_MARKER,
    _DEFERRED_DEPENDENCIES, SERIALIZE_OPTIONS, SERIALIZE,
    immutableWriteError, _serializeContainer,
} from './base-model.ts';
import {
    _NOTDEF, objectEntriesAreEqual, collectDependencies,
    unwrapPotentialWriteProxy,
} from './util.ts';
import {
    _PotentialWriteProxy,
    _HAS_DRAFT_FOR_PROXY, _HAS_DRAFT_FOR_OLD_STATE_KEY,
    _GET_DRAFT_FOR_PROXY, _GET_DRAFT_FOR_OLD_STATE_KEY,
    _OLD_TO_NEW_SLOT,
} from './potential-write-proxy.ts';
import { _PRIMARY_SERIALIZED_VALUE } from './serialization.ts';
import { ForeignKey } from './foreign-key.ts';

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
