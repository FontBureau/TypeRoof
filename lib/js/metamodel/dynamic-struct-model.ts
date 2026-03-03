import {
    _BaseContainerModel,
    _BaseModel,
    FreezableSet,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    _DEFERRED_DEPENDENCIES,
    SERIALIZE_OPTIONS,
    SERIALIZE,
    DESERIALIZE,
    immutableWriteError,
    serializeItem,
    type DependenciesMap,
    type ResourceRequirement,
    type SerializationOptions,
    type SerializationResult,
    type TSerializedInput,
} from "./base-model.ts";

import {
    _NOTDEF,
    objectEntriesAreEqual,
    collectDependencies,
    iterMap,
    unwrapPotentialWriteProxy,
    IS_WRAPPER_TYPE,
} from "./util.ts";

import {
    _LOCAL_PROXIES,
    _HAS_DRAFT_FOR_PROXY,
    _HAS_DRAFT_FOR_OLD_STATE_KEY,
    _GET_DRAFT_FOR_PROXY,
    _GET_DRAFT_FOR_OLD_STATE_KEY,
} from "./potential-write-proxy.ts";

import { _PRIMARY_SERIALIZED_VALUE } from "./serialization.ts";
import { ForeignKey } from "./foreign-key.ts";
import { _AbstractStructModel } from "./struct-model.ts";

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
// Reuse LocalProxies shape from struct-model
interface LocalProxies {
    byProxy: Map<unknown, string>;
    byKey: Map<string, unknown>;
    changedBySetter: Set<string>;
}

export class _AbstractDynamicStructModel extends _BaseContainerModel {
    // Static properties set by createClass
    static BaseType: typeof _AbstractStructModel | null;
    static availableTypesDependencyName: string | null;
    static modelDependencyName: string;
    static dependenciesNames: FreezableSet<string>;

    // Instance properties set via Object.defineProperty
    declare _value: _AbstractStructModel | null;
    // dependencies is set via Object.defineProperty in constructor, overriding base accessor
    declare [_LOCAL_PROXIES]: LocalProxies;
    declare [_PRIMARY_SERIALIZED_VALUE]?: [
        TSerializedInput,
        SerializationOptions,
    ];

    // Protocol: marks this as a wrapper type for _PotentialWriteProxy
    get [IS_WRAPPER_TYPE]() {
        return true;
    }

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
            | typeof _AbstractStructModel
            | string /* a Base Model/Type */,
        // To get the actual ModelClass/Constructor from the dependencies.
        modelDependencyName: string,
        dependenciesNames: Iterable<string>,
    ) {
        // this way name will naturally become class.name.
        let BaseType: typeof _AbstractStructModel | null = null,
            availableTypesDependencyName: string | null = null;
        const availableTypesDependencyNameInject: string[] = [];
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
                static BaseType: typeof _AbstractStructModel | null = BaseType;
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
        oldState: _AbstractDynamicStructModel | null = null,
        dependencies: DependenciesMap | null = null,
        serializedValue: TSerializedInput | null = null,
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
    ) {
        // Must call first to be able to use with this.constructor.name.
        super(oldState as _BaseModel | null);
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
                this[OLD_STATE] !== null &&
                (this[OLD_STATE] as unknown as _AbstractDynamicStructModel)
                    .hasWrapped
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
                      (
                          this[
                              OLD_STATE
                          ] as unknown as _AbstractDynamicStructModel
                      ).wrapped.getDraft()
                    : null,
            configurable: true,
        });
        Object.defineProperty(this, "dependencies", {
            get: () => {
                if (this[OLD_STATE] == null)
                    throw new Error("Primal State has no dependencies yet!");
                // In draft-mode, this[OLD_STATE] has the dependencies.
                return this[OLD_STATE]!.dependencies;
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
            if ((dependencies as unknown) !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies) as this;
        }
    }

    *#_metamorphoseGen(
        dependencies: DependenciesMap = {},
    ): Generator<ResourceRequirement, this, unknown> {
        const ctor = this.constructor as typeof _AbstractDynamicStructModel;
        const dependenciesData = collectDependencies(
            ctor.dependencies,
            dependencies,
            this[OLD_STATE]?.dependencies,
        );
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(dependenciesData),
            writable: true,
            configurable: true,
        });

        const dependenciesAreEqual =
            this[OLD_STATE] != null &&
            objectEntriesAreEqual(
                this[OLD_STATE]!.dependencies,
                this.dependencies,
            );

        // shortcut
        if (
            dependenciesAreEqual && // includes that there's an old state
            (this[OLD_STATE] as unknown as _AbstractDynamicStructModel)
                .wrapped === this._value
        )
            // Has NOT changed!
            return this[OLD_STATE] as unknown as this;
        const childDependencies: DependenciesMap = this.WrappedType
            ? Object.fromEntries(
                  iterMap(this.WrappedType!.dependencies, (key: string) => {
                      if (
                          this.dependencies[
                              key as keyof typeof this.dependencies
                          ] === undefined
                      )
                          throw new Error(
                              `VALUE ERROR in ${this} WrappedType "${this.WrappedType!.name}" dependency "${key}" is undefined.`,
                          );
                      return [
                          key,
                          (this.dependencies as Record<string, unknown>)[key],
                      ];
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
                        `to WrappedType ${(this.WrappedType && this.WrappedType!.name) || this.WrappedType}. ` +
                        `Is a draft: ${this._value.isDraft} `,
                );
            Object.defineProperty(this, "_value", {
                value: this.WrappedType
                    ? yield* this.WrappedType.createPrimalStateGen(
                          childDependencies,
                          ...(this[_PRIMARY_SERIALIZED_VALUE] || []),
                      )
                    : null,
                configurable: true,
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
                configurable: true,
            });
        }
        // Don't keep this
        delete (this as Record<symbol, unknown>)[_PRIMARY_SERIALIZED_VALUE];
        if (
            dependenciesAreEqual &&
            (this[OLD_STATE] as unknown as _AbstractDynamicStructModel)
                .wrapped === this._value
        )
            return this[OLD_STATE] as unknown as this;
        return this;
    }

    #_lockAndFreeze() {
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(this.dependencies),
            writable: false,
            configurable: false,
        });
        delete (this as Record<symbol, unknown>)[OLD_STATE];
        Object.defineProperty(this, "_value", {
            value: this._value,
            writable: false,
            configurable: false,
        });
        Object.defineProperty(this, _IS_DRAFT_MARKER, {
            value: false,
            configurable: false,
        });
        delete (this as Record<symbol, unknown>)[_LOCAL_PROXIES];
        Object.freeze(this);
    }
    #_metamorphoseCleanUp() {
        // Let's see if this is sufficient! this._value may be metamorphosed
        // after all and also this.WrappedType could change this._value.
        // I'm not sure if this will work out all the time.
        delete (this as Record<string, unknown>).dependencies;
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
    *metamorphoseGen(
        dependencies: DependenciesMap = {},
    ): Generator<ResourceRequirement, this, unknown> {
        if (!this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be in draft mode to metamorphose.`,
            );
        let result: this = undefined!;
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

    get WrappedType(): typeof _AbstractStructModel | null {
        const ctor = this.constructor as typeof _AbstractDynamicStructModel;
        const dep = (this.dependencies as Record<string, unknown>)[
            ctor.modelDependencyName
        ];
        if (dep === ForeignKey.NULL) return null;
        // FIXME: 'typeClass' is an implementation detail of the linked
        // struct. There should be either a way to configure this or a
        // way to ensure the linked model implements that interface,
        // like e.g. a trait/mixin that can be checked.
        return (dep as _BaseContainerModel).get("typeClass")
            .value as typeof _AbstractStructModel;
    }

    get availableTypes(): _BaseContainerModel {
        const ctor = this.constructor as typeof _AbstractDynamicStructModel;
        return (this.dependencies as Record<string, unknown>)[
            ctor.availableTypesDependencyName!
        ] as _BaseContainerModel;
    }

    set wrapped(state: _AbstractStructModel) {
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
        const ctor = this.constructor as typeof _AbstractDynamicStructModel;
        if (ctor.availableTypesDependencyName !== null) {
            let found = false;
            const typeNames: string[] = [];
            for (const [, /*key*/ item] of this.availableTypes) {
                const typeClass = (item as _BaseContainerModel).get("typeClass")
                    .value as typeof _AbstractStructModel;
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
        if (ctor.BaseType !== null && !(state instanceof ctor.BaseType))
            throw new Error(
                `TYPE ERROR ${this} expects an instance of ` +
                    `"${ctor.BaseType.name}" but state item is "${state}".`,
            );

        // Actually, we know the concrete type that is injected with
        // the dependencies so it is required to always use that type!
        if (state.constructor !== this.WrappedType && this.WrappedType !== null)
            throw new Error(
                `TYPE ERROR ${this} expects a direct instance of ` +
                    `"${(this.WrappedType && this.WrappedType!.name) || this.WrappedType}" but state item is "${state}".`,
            );

        // Could set immutable state as well, but it may also collide
        // with user expectations. There are two alternatives:
        // - implement potential write proxy protocol, also see
        //   the constructor comment.
        // - have the user put state into draft mode explicitly before,
        //   calling this, otherwise fail on write.
        const draft = state.isDraft ? state : state.getDraft();
        Object.defineProperty(this, "_value", {
            value: draft,
            configurable: true,
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
    [_HAS_DRAFT_FOR_PROXY](proxy: unknown): boolean {
        if (!this.isDraft) return false;

        if (!this[_LOCAL_PROXIES].byProxy.has(proxy))
            // the proxy is disconnected
            return false;

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy)!,
            // MAY NOT BE A DRAFT AT THIS MOMENT!
            item = this.get(key);
        if (!item || !item.isDraft) return false;

        // Identified via this[_LOCAL_PROXIES].
        return true;
    }

    [_HAS_DRAFT_FOR_OLD_STATE_KEY](key: string): boolean {
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
    [_GET_DRAFT_FOR_OLD_STATE_KEY](key: string): _BaseModel | false {
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

        const item = (
            this.has(key)
                ? this.get(key) // => assert item.isDraft
                : // expect OLD_STATE to exist!
                  this[OLD_STATE]!.get(key)
        ) as _BaseModel; // item is not a draft
        if (item.isDraft)
            // Since it was not changedBySetter this must be the original
            // draft for the item at OLD_STATE
            return item;
        const draft = (
            unwrapPotentialWriteProxy(item) as _BaseModel
        ).getDraft();
        this.set(key, draft as _BaseModel);
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
    [_GET_DRAFT_FOR_PROXY](proxy: unknown): _BaseModel | false {
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

        const key = this[_LOCAL_PROXIES].byProxy.get(proxy)!,
            item = (
                this.has(key) ? this.get(key) : this[OLD_STATE]!.get(key)
            ) as _BaseModel;
        // MAY NOT BE A DRAFT AT THIS MOMENT! => via set(key, immutable)...
        // in that case were going to replace the item in this._value with
        // its draft.
        if (item.isDraft)
            // We own the proxy, so the draft is from here.
            return item;
        const draft = (
            unwrapPotentialWriteProxy(item) as _BaseModel
        ).getDraft();
        this.set(key, draft as _BaseModel);
        return draft;
    }

    *[Symbol.iterator](): Generator<[string, _BaseModel], void, unknown> {
        if (!this.hasWrapped) return;
        yield* this.wrapped.entries();
    }
    getDraftFor(key: string, defaultReturn: unknown = _NOTDEF): _BaseModel {
        return this.wrapped.getDraftFor(key, defaultReturn) as _BaseModel;
    }
    get(key: string, defaultReturn: unknown = _NOTDEF): _BaseModel {
        return this.wrapped.get(key, defaultReturn) as _BaseModel;
    }
    set(key: string, entry: _BaseModel): void {
        return this.wrapped.set(key, entry);
    }

    hasOwn(key: string): boolean {
        return this.wrapped.hasOwn(key);
    }
    ownKeys(): string[] {
        return this.wrapped.ownKeys();
    }
    // override if ownership and available keys differ
    has(key: string): boolean {
        return this.wrapped.has(key);
    }
    // override if ownership and available keys differ
    keys(): string[] {
        return this.wrapped.keys();
    }

    *entries(): Generator<[string, _BaseModel], void, unknown> {
        if (!this.hasWrapped) return;
        yield* this.wrapped.entries();
    }

    *allEntries(): Generator<[string, _BaseModel], void, unknown> {
        if (!this.hasWrapped) return;
        yield* this.wrapped.allEntries();
    }

    get size(): number {
        return this.wrapped.size;
    }

    [SERIALIZE](
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): SerializationResult {
        if (this.hasWrapped)
            return serializeItem(
                this.wrapped as unknown as _BaseModel,
                options,
            );
        else
            // FIXME: how to differentiate between no type an an empty/all default type?
            // I guess the parent has to know!
            return [[], null] as SerializationResult;
    }

    [DESERIALIZE](
        _serializedValue: TSerializedInput,
        _options: SerializationOptions,
    ): void {
        throw new Error(
            `NOT IMPLEMENTED [DESERIALIZE] for ${this.constructor.name}: struct models use constructor deserialization.`,
        );
    }
}
