import {
    _BaseModel,
    _BaseContainerModel,
    OLD_STATE,
    _IS_DRAFT_MARKER,
    _DEFERRED_DEPENDENCIES,
    SERIALIZE_OPTIONS,
    SERIALIZE,
    DESERIALIZE,
    immutableWriteError,
    _serializeContainer,
    type DependenciesMap,
    type SerializationOptions,
    type SerializationResult,
    type TSerializedInput,
} from "./base-model.ts";

import { ResourceRequirement } from "./base-model.ts";

import {
    _NOTDEF,
    sort_alpha,
    objectEntriesAreEqual,
    collectDependencies,
    unwrapPotentialWriteProxy,
    PATH_SEPARATOR,
} from "./util.ts";

import {
    _PotentialWriteProxy,
    _HAS_DRAFT_FOR_PROXY,
    _HAS_DRAFT_FOR_OLD_STATE_KEY,
    _GET_DRAFT_FOR_PROXY,
    _GET_DRAFT_FOR_OLD_STATE_KEY,
    _OLD_TO_NEW_SLOT,
} from "./potential-write-proxy.ts";

import { _PRIMARY_SERIALIZED_VALUE } from "./serialization.ts";

import { FreezableMap } from "./base-model.ts";

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
export function toShuffle<T>(from: Iterable<T>): T[] {
    const array = Array.from(from);
    let currentIndex = array.length;
    // While there remain elements to shuffle...
    while (currentIndex != 0) {
        // Pick a remaining element...
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex]!,
            array[currentIndex]!,
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

type OldToNewSlot = [number, string, unknown];
type KVEntry = readonly [string, _BaseModel];

interface OrderedMapModelSetup {
    ordering?: symbol | typeof _NOTDEF;
    customOrderingFn?: ((values: unknown[]) => unknown[]) | typeof _NOTDEF;
    validateKeyFn?:
        | ((key: unknown) => [boolean, string | null])
        | typeof _NOTDEF;
}

export class _AbstractOrderedMapModel extends _BaseContainerModel {
    static Model: typeof _BaseModel;
    static ORDERING: symbol | null;
    static _customOrderingFn: (values: unknown[]) => unknown[];
    static validateKeyFn: ((key: unknown) => [boolean, string | null]) | null;

    declare _value: KVEntry[];
    declare _keys: FreezableMap<string, number>;
    // dependencies is set via Object.defineProperty in constructor
    declare [_OLD_TO_NEW_SLOT]: OldToNewSlot[];
    declare [_PRIMARY_SERIALIZED_VALUE]:
        | [TSerializedInput, SerializationOptions]
        | undefined;

    static get dependencies(): Set<string> {
        return this.Model.dependencies;
    }

    static ORDER = MAP_ORDER;

    static [MAP_ORDER.KEYS_ALPHA](values: KVEntry[]): KVEntry[] {
        const entries = new Map<string, KVEntry>();
        const keys: string[] = [];
        for (const [key, data] of values) {
            entries.set(key, [key, data]);
            keys.push(key);
        }
        return keys.sort(sort_alpha).map((key) => entries.get(key)!);
    }

    static [MAP_ORDER.KEYS_ALPHA_REVERSE](values: KVEntry[]): KVEntry[] {
        return (this as unknown as Record<symbol, (v: KVEntry[]) => KVEntry[]>)[
            this.ORDER.KEYS_ALPHA
        ]!(values).reverse();
    }

    static [MAP_ORDER.CUSTOM](values: KVEntry[]): KVEntry[] {
        return this._customOrderingFn(values as unknown[]) as KVEntry[];
    }

    static [MAP_ORDER.CUSTOM_REVERSE](values: KVEntry[]): KVEntry[] {
        return (
            this._customOrderingFn(values as unknown[]) as KVEntry[]
        ).reverse();
    }

    static createClass(
        className: string,
        Model: typeof _BaseModel,
        setup: OrderedMapModelSetup = {},
    ) {
        const config = {
            ordering: _NOTDEF as symbol | typeof _NOTDEF,
            customOrderingFn: _NOTDEF as
                | ((values: unknown[]) => unknown[])
                | typeof _NOTDEF,
            validateKeyFn: _NOTDEF as
                | ((key: unknown) => [boolean, string | null])
                | typeof _NOTDEF,
            ...setup,
        };
        if (config.ordering !== _NOTDEF) {
            const availableOrderingSymbols = new Set(Object.values(this.ORDER));
            if (!availableOrderingSymbols.has(config.ordering))
                throw new Error(
                    `KEY ERROR config.ordering unknown "${config.ordering.toString()}" ` +
                        `allowed values are ${this.name}.ORDER.(${Object.keys(this.ORDER).join("|")}).`,
                );
            if (
                config.ordering === this.ORDER.CUSTOM ||
                config.ordering === this.ORDER.CUSTOM_REVERSE
            ) {
                if (config.customOrderingFn === _NOTDEF)
                    throw new Error(
                        `VALUE ERROR config.ordering is "${config.ordering.toString()}" but config.customOrderingFn is not specified`,
                    );
                if (typeof config.customOrderingFn !== "function")
                    throw new Error(
                        `VALUE ERROR config.customOrderingFn must be a function but is "${typeof config.customOrderingFn}".`,
                    );
            }
        }
        if (config.validateKeyFn !== _NOTDEF) {
            if (typeof config.validateKeyFn !== "function")
                throw new Error(
                    `VALUE ERROR config.validateKeyFn must be a function but is "${typeof config.validateKeyFn}".`,
                );
        }

        // this way name will naturally become class.name.
        const result = {
            // jshint ignore: start
            [className]: class extends this {
                static override Model: typeof _BaseModel = Model;
                static override ORDERING =
                    config.ordering === _NOTDEF ? null : config.ordering;
                static override _customOrderingFn =
                    config.customOrderingFn === _NOTDEF
                        ? (/*values*/): never => {
                              throw new Error(
                                  `NOT IMPLEMENTED _customOrderingFn is not defined in ${className}`,
                              );
                          }
                        : config.customOrderingFn;
                static override validateKeyFn =
                    config.validateKeyFn === _NOTDEF
                        ? null
                        : config.validateKeyFn;
            },
            // jshint ignore: end
        };
        // Can't override class.Model anymore, would be possible w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(
        oldState: _AbstractOrderedMapModel | null = null,
        dependencies: DependenciesMap | null = null,
        serializedValue: TSerializedInput | null = null,
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
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
        super(oldState as _BaseModel | null);

        // Start with an empty this._value for quick not-changed comparison.
        Object.defineProperty(this, "_value", {
            value: new Array(
                this[OLD_STATE] !== null
                    ? (this[OLD_STATE] as unknown as _AbstractOrderedMapModel)
                          .length
                    : 0,
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
                return this[OLD_STATE]!.dependencies;
            },
            configurable: true,
        });
        // Keep track of proxies and OLD_STATE original indexes in a
        // shadow of this._value that is kept in sync with value!
        // Entries may get replaced by set or moved/removed by splice.

        this[_OLD_TO_NEW_SLOT] =
            this[OLD_STATE] !== null
                ? [
                      ...(this[
                          OLD_STATE
                      ] as unknown as _AbstractOrderedMapModel),
                  ].map(
                      (
                          [key /*value*/]: [string, _BaseModel],
                          index: number,
                      ): OldToNewSlot => [index, key, null /*proxy*/],
                  )
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
            if ((dependencies as unknown) !== _DEFERRED_DEPENDENCIES)
                return this.metamorphose(dependencies) as this;
        }
    }

    *#_metamorphoseGen(
        dependencies: DependenciesMap = {},
    ): Generator<ResourceRequirement, this, unknown> {
        //CAUTION: `this` is the object not the class.
        //
        // All the following runs, to change deep down a single axis location value.
        //        It is very important to make this as lightweight as possible.
        //        At the same time, it is important that the change bubbles
        //        through the whole structure.

        // Allow case without or with incomplete dependencies argument,
        // will re-use this[OLD_STATE].dependencies.
        // Fails in the if dependencies are missing.
        const ctor = this.constructor as typeof _AbstractOrderedMapModel;
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

        if (this[_PRIMARY_SERIALIZED_VALUE]) {
            const [serializedValues, serializeOptions] =
                this[_PRIMARY_SERIALIZED_VALUE]!;
            const childItems: [string, _BaseModel][] = [];
            for (const [key, serializedValue] of serializedValues as [
                string,
                unknown,
            ][]) {
                const childItem = yield* ctor.Model.createPrimalStateGen(
                    this.dependencies,
                    serializedValue,
                    serializeOptions,
                );
                childItems.push([key, childItem]);
            }
            this.push(...childItems);
        }
        // Don't keep this
        delete (this as Record<symbol, unknown>)[
            _PRIMARY_SERIALIZED_VALUE as unknown as symbol
        ];

        const oldState = this[
            OLD_STATE
        ] as unknown as _AbstractOrderedMapModel | null;
        const dependenciesAreEqual =
            oldState !== null &&
            objectEntriesAreEqual(oldState.dependencies, this.dependencies);

        // shortcut
        if (
            dependenciesAreEqual &&
            this.size === oldState!.size &&
            // is only empty slots i.e. no changes
            Object.values(this._value).length === 0
        )
            return oldState as unknown as this;

        for (const index of this._value.keys()) {
            const kvItem: KVEntry = Object.hasOwn(this._value, index)
                ? this._value[index]!
                : (oldState!.value[
                      this[_OLD_TO_NEW_SLOT][index]![0]
                  ] as KVEntry);
            const [key, item] = kvItem || [];

            if (!(item instanceof ctor.Model))
                throw new Error(
                    `TYPE ERROR ${ctor.name} ` +
                        `expects ${ctor.Model.name} ` +
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
        if (ctor.ORDERING !== null) {
            // this._keys will get updated in #_lockAndFreeze via _updateKeys();
            const newlyOrderedEntries = (
                ctor as unknown as Record<symbol, (v: KVEntry[]) => KVEntry[]>
            )[ctor.ORDERING!]!(this._value);
            this._value.splice(0, Infinity);
            for (const entry of newlyOrderedEntries) this._value.push(entry);
        }

        // last stop to detect a no-change
        if (
            oldState !== null &&
            dependenciesAreEqual &&
            this.size === oldState.size &&
            this._value.every((entry: KVEntry, index: number) => {
                const [key, value] = entry;
                const [oldKey, oldValue] = oldState!.value[index] as KVEntry;
                return key === oldKey && value === oldValue;
            })
        )
            return oldState as unknown as this;
        return this;
    }

    #_lockAndFreeze(): void {
        Object.defineProperty(this, "dependencies", {
            value: Object.freeze(this.dependencies),
            writable: true,
            configurable: true,
        });
        delete (this as Record<symbol, unknown>)[
            OLD_STATE as unknown as symbol
        ];
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
        delete (this as Record<symbol, unknown>)[
            _OLD_TO_NEW_SLOT as unknown as symbol
        ];
        Object.freeze(this);
    }

    #_metamorphoseCleanUp(): void {
        delete (this as Record<string, unknown>).dependencies;
    }

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

    _updateKeys(): void {
        this._keys.clear();
        for (const index of this._value.keys()) {
            const key = Object.hasOwn(this._value, index)
                ? this._value[index]![0]
                : this[_OLD_TO_NEW_SLOT][index]![1];
            this._keys.set(key as string, index);
        }
    }

    get value(): KVEntry[] {
        if (this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`,
            );
        return this._value;
    }

    *[Symbol.iterator](): Generator<[string, _BaseModel], void, unknown> {
        for (const key of this.ownKeys()) yield [key, this.get(key)];
    }

    *allEntries(): Generator<[string, _BaseModel], void, unknown> {
        yield* this[Symbol.iterator]();
    }

    *indexedEntries(): Generator<
        [number, [string, _BaseModel]],
        void,
        unknown
    > {
        for (const [key, value] of this) {
            const [index /* error message*/] = this.keyToIndex(key as string);
            yield [index!, [key as string, value as _BaseModel]];
        }
    }

    get length(): number {
        return this._value.length;
    }

    get size(): number {
        return this._value.length;
    }

    hasOwn(key: string): boolean {
        return this._keys.has(key);
    }
    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy: unknown): boolean {
        if (!this.isDraft) return false;

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, , ownProxy]: OldToNewSlot) => ownProxy === proxy,
        );
        if (index === -1) return false;

        const [, /*key*/ item] =
            (Object.hasOwn(this._value, index) && this._value[index]!) ||
            ([null, null] as [null, null]);
        if (!item || !(item as _BaseModel).isDraft) return false;

        return true;
    }
    [_HAS_DRAFT_FOR_OLD_STATE_KEY](oldKey: string): boolean {
        if (!this.isDraft) return false;
        const oldState = this[OLD_STATE] as unknown as _AbstractOrderedMapModel;
        const [oldIndex, message] = oldState.keyToIndex(oldKey);
        if (oldIndex === null) throw new Error(message as string);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownOldKey]: OldToNewSlot) => ownOldKey === oldKey,
        );
        if (index === -1) return false;

        const [, /*key*/ item] =
            (Object.hasOwn(this._value, index) && this._value[index]!) ||
            ([null, null] as [null, null]);
        if (!item || !(item as _BaseModel).isDraft) return false;

        return true;
    }

    [_GET_DRAFT_FOR_OLD_STATE_KEY](oldKey: string): _BaseModel | false {
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

        const oldState = this[OLD_STATE] as unknown as _AbstractOrderedMapModel;
        const [oldIndex, message] = oldState.keyToIndex(oldKey);
        if (oldIndex === null) throw new Error(message as string);

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownOldKey]: OldToNewSlot) => ownOldKey === oldKey,
        );
        if (index === -1)
            // The item associated with oldIndex is no longer part of this
            // object, the proxy is disconnected.
            return false;

        let kvItem: KVEntry | false =
            Object.hasOwn(this._value, index) && this._value[index]!;
        if (!kvItem) {
            const item = oldState.get(oldKey);
            kvItem = [oldKey, item] as KVEntry;
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
    [_GET_DRAFT_FOR_PROXY](proxy: unknown): _BaseModel | false {
        if (!this.isDraft)
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`,
                ),
            );

        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, , ownProxy]: OldToNewSlot) => ownProxy === proxy,
        );
        if (index === -1) return false;

        let kvItem: KVEntry | false =
            Object.hasOwn(this._value, index) && this._value[index]!;
        if (!kvItem) {
            const [, /*oldIndex*/ key] = this[_OLD_TO_NEW_SLOT][index]!;
            const oldState = this[
                OLD_STATE
            ] as unknown as _AbstractOrderedMapModel;
            const item = oldState.get(key);
            kvItem = [key, item] as KVEntry;
        }
        const [key, item] = kvItem;
        if (item.isDraft) return item;
        const draft = item.getDraft();
        this._value[index] = Object.freeze([key, draft]) as KVEntry;
        return draft;
    }

    getDraftFor(
        key: string,
        defaultReturn: unknown = _NOTDEF,
    ): _BaseModel | false {
        const proxyOrDraft = this.get(key, defaultReturn);
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            return this[_GET_DRAFT_FOR_PROXY](proxyOrDraft);
        return proxyOrDraft as _BaseModel;
    }

    get(key: string): _BaseModel;
    get<D>(key: string, defaultReturn: D): _BaseModel | D;
    get(key: string, defaultReturn: unknown = _NOTDEF): _BaseModel | unknown {
        const [index, message] = this.keyToIndex(key);
        if (index === null) {
            if (defaultReturn !== _NOTDEF) return defaultReturn;
            throw new Error(message as string);
        }

        if (!this.isDraft) return this._value[index]![1];

        // Can be a draft or immutable e.g. via set(index, element)
        let item: _BaseModel | false =
            Object.hasOwn(this._value, index) && this._value[index]![1];
        if (!item) {
            const [oldIndex /*oldKey*/, , proxy] =
                this[_OLD_TO_NEW_SLOT][index]!;
            if (proxy) return proxy as _BaseModel;
            item = (
                this[OLD_STATE] as unknown as _AbstractOrderedMapModel
            ).getIndex(oldIndex) as _BaseModel;
        }

        const proxyOrDraft = _PotentialWriteProxy.create(
            this as unknown as _BaseModel,
            item,
        ) as _BaseModel;
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            this[_OLD_TO_NEW_SLOT][index]![2] = proxyOrDraft;
        return proxyOrDraft;
    }

    keyToIndex(key: string): [number, null] | [null, string] {
        if (!this._keys.has(key))
            return [null, `KEY ERROR "${key}" not found.`];
        return [this._keys.get(key)!, null];
    }

    indexOfKey(key: string): number {
        return this._keys.has(key) ? this._keys.get(key)! : -1;
    }

    indexToKey(searchIndex: string | number): [string, null] | [null, string] {
        let index = parseInt(String(searchIndex), 10);
        if (isNaN(index))
            return [null, `KEY ERROR can't parse "${searchIndex}" as integer.`];
        if (index < 0) index = index + this._value.length;
        if (index < 0 || index >= this._value.length)
            return [
                null,
                `KEY ERROR NOT FOUND index "${searchIndex}" is not an index (= ${index})` +
                    ` (index > 0 && index < ${this._value.length}.`,
            ];

        const key = Object.hasOwn(this._value, index)
            ? this._value[index]![0]
            : this[_OLD_TO_NEW_SLOT][index]![1];
        return [key, null];
    }

    keyOfIndex(
        index: string | number,
        defaultReturn: unknown = _NOTDEF,
    ): string {
        const [key, message] = this.indexToKey(index);
        if (key === null) {
            if (defaultReturn !== _NOTDEF) return defaultReturn as string;
            throw new Error(message);
        }
        return key;
    }

    getIndex(
        index: string | number,
        defaultReturn: unknown = _NOTDEF,
    ): _BaseModel {
        const key = this.keyOfIndex(index, defaultReturn);
        return this.get(key, defaultReturn) as _BaseModel;
    }

    ownKeys(): string[] {
        return [...this._keys.keys()];
    }

    indexOf(item: _BaseModel, fromIndex?: number): number {
        // If fromIndex >= array.length, the array is not searched and -1 is returned.
        if (fromIndex !== undefined && fromIndex >= this._value.length)
            return -1;

        if (fromIndex !== undefined && fromIndex < 0)
            fromIndex = fromIndex + this._value.length;

        // If fromIndex < -array.length or fromIndex is omitted, 0
        // is used, causing the entire array to be searched.
        if (fromIndex === undefined || fromIndex < 0) fromIndex = 0;

        const searchArray =
            fromIndex === 0 ? this._value : this._value.slice(fromIndex);
        let result = searchArray.findIndex(([, myItem]) => myItem === item);
        if (result !== -1 && fromIndex) result = result + fromIndex;
        return result;
    }

    static validateKey(key: unknown): [boolean, string | null] {
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
            (keyType !== "number" || isFinite(key as number))
        ) {
            // FIXME: processing of these keys should be aware that they
            // are path-parts as a whole and maybe escape them appropriately.
            // however, this is not implemented yet and "a/key/containing/slashes"
            // causes touble: "trouble/key" as a key in "/activeState/typeSpec/children/0/stylePatchesSource" triggers:
            //      Error: KEY ERROR "trouble" not found. (path: /activeState/typeSpec/children/0/stylePatchesSource/trouble/key);
            //  via StateComparison.getChangedMap
            if (String(key).indexOf(PATH_SEPARATOR) != -1)
                return [
                    false,
                    `key can't contain the path separator "${PATH_SEPARATOR}" ` +
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

    _validateKey(key: unknown): [boolean, string | null] {
        return (
            this.constructor as typeof _AbstractOrderedMapModel
        ).validateKey(key);
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
    arraySplice(
        index: number,
        deleteCount: number,
        ...entries: unknown[]
    ): KVEntry[] {
        if (!this.isDraft)
            // FIXME: for the potential write proxy, it becomes very
            // interesting trying to write many entries.
            // Also interesting for that when trying to write no entries and just removing stuff.
            throw immutableWriteError(
                new Error(
                    `NOT DRAFT ERROR: ${this} can't call arraySplice when not in draft phase.`,
                ),
            );

        const _entries = entries.map((kv: unknown, i: number) => {
                // Also creates a defensive copy of the k,v pair
                if (!Array.isArray(kv))
                    throw new Error(
                        `VALUE ERROR key-value pair must be an array, entry ${i}: ${kv}`,
                    );
                const _kv = Array.from(kv);
                if (_kv.length < 2)
                    throw new Error(
                        `TYPE ERROR Key-Value pair must a length ` +
                            `of at least 2 [key, value] but entry ${i} ${_kv} length is ${_kv.length}`,
                    );
                const [valid, message] = this._validateKey(_kv[0]);
                if (!valid)
                    throw new Error(`TYPE ERROR in entry ${i}: ${message}`);
                return Object.freeze(_kv) as unknown as KVEntry;
            }),
            deleted = this._value.splice(
                index,
                deleteCount,
                ..._entries.map((kvItem: KVEntry) => {
                    const unwrapped = unwrapPotentialWriteProxy(kvItem[1]);
                    if (kvItem[1] !== unwrapped)
                        return Object.freeze([kvItem[0], unwrapped]) as KVEntry;
                    return kvItem;
                }),
            );
        // Replaces [index, key, proxy] by empty arrays, disconnecting proxies
        this[_OLD_TO_NEW_SLOT].splice(
            index,
            deleteCount,
            ...new Array(entries.length)
                .fill(null)
                .map((): OldToNewSlot => [-1, "", null]),
        );
        // We can have duplicate keys in entries and we can have
        // duplicate keys in this._value already.
        const seen = new Set<string>();
        const deletedOnInsert: KVEntry[] = [];
        for (let i = this._value.length - 1; i >= 0; i--) {
            const kv: KVEntry = Object.hasOwn(this._value, i)
                ? this._value[i]!
                : ((this[OLD_STATE] as unknown as _AbstractOrderedMapModel)
                      .value[this[_OLD_TO_NEW_SLOT][i]![0]] as KVEntry);
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
                this._value[i] = Object.freeze(kv.slice()) as KVEntry;
        }
        // We iterated backwards, this is a better order.
        deletedOnInsert.reverse();
        deleted.push(...deletedOnInsert);
        this._updateKeys();
        return deleted;
    }

    splice(
        startKey: string,
        deleteCount: number,
        ...entries: unknown[]
    ): KVEntry[] {
        const [index, message] = this.keyToIndex(startKey);
        if (index === null) throw new Error(message as string);
        return this.arraySplice(index, deleteCount, ...entries);
    }

    // This method will push undefined keys to the end.
    set(key: string, newEntry: _BaseModel): void {
        const [index /*message*/] = this.keyToIndex(key);
        this.arraySplice(index === null ? Infinity : index, 1, [key, newEntry]);
    }

    delete(key: string): KVEntry | undefined {
        const [index /*message*/] = this.keyToIndex(key);
        if (index === null) return;
        return this.arraySplice(index, 1)[0];
    }

    // append, add to end
    push(...entries: unknown[]): number {
        this.arraySplice(Infinity, 0, ...entries);
        return this.size;
    }
    unshift(...entries: unknown[]): number {
        this.arraySplice(0, 0, ...entries);
        return this.size;
    }
    pop(): KVEntry {
        return this.arraySplice(-1, 1)[0]!;
    }
    shift(): KVEntry {
        return this.arraySplice(0, 1)[0]!;
    }

    /**
     * It's like an "upsert"
     * mapLike.constructor.Model must be a "simple model"
     *       with a set(rawValue) method and without dependenies
     *       required for Model.createPrimalDraft
     * usage:
     *   axisLocations.setSimpleValue(, axisTag, value)
     */
    setSimpleValue(key: string, value: unknown): void {
        const ctor = this.constructor as typeof _AbstractOrderedMapModel;
        if (!this.has(key))
            this.set(key, ctor.Model.createPrimalDraft({}) as _BaseModel);
        (this.get(key) as unknown as { set(v: unknown): void }).set(value);
    }

    [SERIALIZE](
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): SerializationResult {
        return _serializeContainer(
            this as unknown as _BaseContainerModel,
            /*presenceIsInformation*/ true,
            /*keepKeys*/ true,
            options,
        );
    }

    [DESERIALIZE](
        _serializedValue: TSerializedInput,
        _options?: SerializationOptions,
    ): void {
        throw new Error(
            `NOT IMPLEMENTED: ${this.constructor.name}[DESERIALIZE]. ` +
                `Ordered map models use constructor deserialization.`,
        );
    }
}
