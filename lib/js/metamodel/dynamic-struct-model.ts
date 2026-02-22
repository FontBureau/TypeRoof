import {
    _BaseContainerModel,
    FreezableSet,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    _DEFERRED_DEPENDENCIES,
    SERIALIZE_OPTIONS,
    SERIALIZE,
    immutableWriteError,
    serializeItem,
} from './base-model.ts';

import {
    _NOTDEF,
    objectEntriesAreEqual,
    collectDependencies,
    iterMap,
    unwrapPotentialWriteProxy,
    IS_WRAPPER_TYPE,
} from './util.ts';

import {
    _LOCAL_PROXIES,
    _HAS_DRAFT_FOR_PROXY,
    _HAS_DRAFT_FOR_OLD_STATE_KEY,
    _GET_DRAFT_FOR_PROXY,
    _GET_DRAFT_FOR_OLD_STATE_KEY,
} from './potential-write-proxy.ts';

import { _PRIMARY_SERIALIZED_VALUE } from './serialization.ts';
import { ForeignKey } from './foreign-key.ts';
import { _AbstractStructModel } from './struct-model.ts';

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

