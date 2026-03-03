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
    type ResourceRequirement,
    type SerializationOptions,
    type SerializationResult,
    type TSerializedInput,
} from "./base-model.ts";
import {
    _NOTDEF,
    objectEntriesAreEqual,
    collectDependencies,
    unwrapPotentialWriteProxy,
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
import { ForeignKey } from "./foreign-key.ts";

// list/array type
// items are accessed by index
// has a size/length
// I'd prefer to have a single type for all items, that way,
// we can't have undefined entries, however, a type could be
// of the form TypeOrEmpty...
// MultipleTargets ...!
type OldToNewSlot = [number, unknown][]; // [oldIndex, proxy | null]

export class _AbstractListModel extends _BaseContainerModel {
    static Model: typeof _BaseModel;

    declare _value: _BaseModel[];
    // dependencies is set via Object.defineProperty in constructor
    declare [_OLD_TO_NEW_SLOT]: OldToNewSlot;
    declare [_PRIMARY_SERIALIZED_VALUE]?: [
        TSerializedInput,
        SerializationOptions,
    ];

    static get dependencies() {
        return this.Model.dependencies;
    }

    static createClass(className: string, Model: typeof _BaseModel) {
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
        oldState: _AbstractListModel | null = null,
        dependencies:
            | DependenciesMap
            | typeof _DEFERRED_DEPENDENCIES
            | null = null,
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

        if (oldState && (oldState as _AbstractListModel).isDraft)
            throw new Error(
                `LIFECYCLE ERROR ` +
                    `oldState ${oldState} is draft but must be immutable.`,
            );
        super(oldState as _BaseModel | null);

        // Start with an empty this._value for quick not-changed comparison.
        Object.defineProperty(this, "_value", {
            value: new Array(
                this[OLD_STATE] !== null
                    ? (this[OLD_STATE] as unknown as _AbstractListModel).length
                    : 0,
            ),
            writable: false, // can't replace the array itself
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
        this[_OLD_TO_NEW_SLOT] = [...this._value.keys()].map(
            (index): [number, unknown] => [index, null /*proxy*/],
        );

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
                return this.metamorphose(
                    dependencies as DependenciesMap,
                ) as this;
        }
    }

    *#_metamorphoseGen(
        dependencies: DependenciesMap = {},
    ): Generator<ResourceRequirement, this, unknown> {
        const ctor = this.constructor as typeof _AbstractListModel;
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
            ctor.dependencies,
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
                childItems: _BaseModel[] = [];
            for (const serializedValue of serializedValues as unknown[]) {
                const childItem = yield* ctor.Model.createPrimalStateGen(
                    this.dependencies,
                    serializedValue,
                    serializeOptions,
                );
                childItems.push(childItem);
            }
            this.push(...childItems);
        }
        // Don't keep this
        delete (this as Record<symbol, unknown>)[
            _PRIMARY_SERIALIZED_VALUE as unknown as symbol
        ];

        const oldState = this[OLD_STATE] as _AbstractListModel | null;
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
            let item: _BaseModel | false =
                Object.hasOwn(this._value, index) && this._value[index]!;
            if (!item && oldState !== null) {
                const [oldIndex /*proxy*/] = this[_OLD_TO_NEW_SLOT][index]!;
                item = oldState.get(String(oldIndex)) as _BaseModel;
            }

            if (!(item instanceof ctor.Model))
                throw new Error(
                    `TYPE ERROR ${ctor.name} ` +
                        `expects ${ctor.Model.name} ` +
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
            oldState !== null &&
            dependenciesAreEqual &&
            this.size === oldState.size &&
            this._value.every(
                (entry: _BaseModel, index: number) =>
                    entry === oldState!.get(String(index)),
            )
        )
            return oldState as unknown as this;
        return this;
    }

    #_lockAndFreeze() {
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
        Object.defineProperty(this, _IS_DRAFT_MARKER, {
            value: false,
            configurable: false,
        });
        delete (this as Record<symbol, unknown>)[
            _OLD_TO_NEW_SLOT as unknown as symbol
        ];
        Object.freeze(this);
    }

    #_metamorphoseCleanUp() {
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

    get value(): _BaseModel[] {
        if (this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} will only return this.value when immutable/not a draft..`,
            );
        return this._value;
    }

    get length(): number {
        return this._value.length;
    }

    get size(): number {
        return this._value.length;
    }

    hasOwn(key: string): boolean {
        const [index /*message*/] = this.keyToIndex(key);
        return index !== null;
    }

    ownKeys(): string[] {
        return [...this._value.keys()].map((i) => i.toString(10));
    }

    *[Symbol.iterator](): Generator<[string, _BaseModel], void, unknown> {
        for (const key of this.ownKeys()) yield [key, this.get(key)];
    }

    /**
     * hasDraftFor and getDraftFor are likely only a required interfaces
     * for _BaseContainerModel.
     */
    [_HAS_DRAFT_FOR_PROXY](proxy: unknown): boolean {
        if (!this.isDraft) return false;
        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownProxy]: [number, unknown]) => ownProxy === proxy,
        );
        if (index === -1) return false;
        const item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item || !item.isDraft) return false;
        return true;
    }
    [_HAS_DRAFT_FOR_OLD_STATE_KEY](oldKey: string): boolean {
        if (!this.isDraft) return false;
        const oldState = this[OLD_STATE] as _AbstractListModel;
        const [oldIndex, message] = oldState.keyToIndex(oldKey);
        if (oldIndex === null) throw new Error(message as string);
        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([ownOldIndex]: [number, unknown]) => ownOldIndex === oldIndex,
        );
        if (index === -1) return false;
        const item = Object.hasOwn(this._value, index) && this._value[index];
        if (!item || !item.isDraft) return false;
        return true;
    }

    [_GET_DRAFT_FOR_OLD_STATE_KEY](oldKey: string): _BaseModel | false {
        if (!this.isDraft)
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this}[_GET_DRAFT_FOR_OLD_STATE_KEY](${oldKey}) is immutable, not a draft.`,
                ),
            );
        const oldState = this[OLD_STATE] as _AbstractListModel;
        const [oldIndex, message] = oldState.keyToIndex(oldKey);
        if (oldIndex === null) throw new Error(message as string);
        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([ownOldIndex]: [number, unknown]) => ownOldIndex === oldIndex,
        );
        if (index === -1) return false;
        const item: _BaseModel =
            (Object.hasOwn(this._value, index) && this._value[index]!) ||
            (oldState.get(String(oldIndex)) as _BaseModel);
        if (item.isDraft) return item;
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
    [_GET_DRAFT_FOR_PROXY](proxy: unknown): _BaseModel | false {
        if (!this.isDraft)
            throw immutableWriteError(
                new Error(
                    `IMMUTABLE WRITE ATTEMPT ` +
                        `${this} is immutable, not a draft in [_GET_DRAFT_FOR_PROXY].`,
                ),
            );
        const index = this[_OLD_TO_NEW_SLOT].findIndex(
            ([, ownProxy]: [number, unknown]) => ownProxy === proxy,
        );
        if (index === -1) return false;
        const item: _BaseModel =
            (Object.hasOwn(this._value, index) && this._value[index]!) ||
            ((this[OLD_STATE] as unknown as _AbstractListModel).get(
                String(this[_OLD_TO_NEW_SLOT][index]![0]),
            ) as _BaseModel);
        if (item.isDraft) return item;
        const draft = item.getDraft();
        this._value[index] = draft;
        return draft;
    }

    getDraftFor(
        key: string,
        defaultReturn: unknown = _NOTDEF,
    ): _BaseModel | false | unknown {
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
    keyToIndex(
        key: string | number | symbol | undefined,
    ): [number, null] | [null, string] {
        if (key === ForeignKey.NULL)
            return [null, `KEY ERROR ForeignKey.NULL is not a key.`];
        if (key === undefined) return [null, `KEY ERROR key is undefined.`];
        const stringKey = key.toString();
        let index = parseInt(stringKey, 10);
        if (isNaN(index))
            return [null, `KEY ERROR can't parse "${stringKey}" as integer.`];
        if (index < 0) index = index + this._value.length;
        if (index < 0 || index >= this._value.length)
            return [
                null,
                `KEY ERROR NOT FOUND key "${stringKey}" is not an index (parseInt: ${index})` +
                    ` (index < 0 || index >= lenght ${this._value.length}). in ${this}`,
            ];
        return [index, null];
    }

    indexOf(item: _BaseModel, fromIndex?: number): number {
        return this._value.indexOf(item, fromIndex);
    }

    get(key: string): _BaseModel;
    get<D>(key: string, defaultReturn: D): _BaseModel | D;
    get(key: string, defaultReturn: unknown = _NOTDEF) {
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
            const [oldIndex, proxy] = this[_OLD_TO_NEW_SLOT][index]!;
            if (proxy) return proxy as _BaseModel;
            item = (this[OLD_STATE] as unknown as _AbstractListModel).get(
                String(oldIndex),
            );
        }

        const proxyOrDraft = _PotentialWriteProxy.create(
            this as unknown as _BaseModel,
            item,
        ) as _BaseModel;
        if (_PotentialWriteProxy.isProxy(proxyOrDraft))
            this[_OLD_TO_NEW_SLOT][index]![1] = proxyOrDraft;
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
    set(key: string, entry: _BaseModel): void {
        const [index, message] = this.keyToIndex(key);
        if (index === null) throw new Error(message);
        this.splice(index, 1, entry);
    }

    push(...entries: _BaseModel[]): number {
        this.splice(Infinity, 0, ...entries);
        return this.length;
    }
    unshift(...entries: _BaseModel[]): number {
        this.splice(0, 0, ...entries);
        return this.length;
    }
    pop(): _BaseModel {
        return this.splice(-1, 1)[0]!;
    }
    shift(): _BaseModel {
        return this.splice(0, 1)[0]!;
    }
    delete(key: string): _BaseModel | undefined {
        const [index /* message*/] = this.keyToIndex(key);
        if (index === null) return;
        return this.splice(index, 1)[0];
    }
    // The Swiss Army Knive of array methods.
    splice(
        start: number,
        deleteCount: number,
        ...entries: _BaseModel[]
    ): _BaseModel[] {
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
                ...new Array(entries.length)
                    .fill(null)
                    .map((): [number, unknown] => [-1, null]),
            );
        for (let index = 0; index < removed.length; index++) {
            if (!Object.hasOwn(removed, index)) {
                const [oldIndex /*, proxy*/] = oldToNewRemoved[index] as [
                    number,
                    unknown,
                ];
                removed[index] = (
                    this[OLD_STATE] as unknown as _AbstractListModel
                ).get(String(oldIndex)) as _BaseModel;
            }
        }
        return removed;
    }
    [SERIALIZE](
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): SerializationResult {
        return _serializeContainer(
            this as unknown as _BaseContainerModel,
            /*presenceIsInformation*/ true,
            /*keepKeys*/ false,
            options,
        );
    }

    [DESERIALIZE](
        _serializedValue: TSerializedInput,
        _options: SerializationOptions,
    ): void {
        throw new Error(
            "NOT IMPLEMENTED: list models use constructor deserialization.",
        );
    }
}
