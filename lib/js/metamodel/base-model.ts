export const OLD_STATE = Symbol("OLD_STATE"),
    _IS_DRAFT_MARKER = Symbol("_IS_DRAFT_MARKER"),
    _DEFERRED_DEPENDENCIES = Symbol("_DEFERRED_DEPENDENCIES");

export type DependenciesMap = Record<string, unknown>;

// FOR a URL serialization we pack using encodeURIComponent and unpack
// using decodeURIComponent.
export type TSerializedData = unknown;
export type TSerializedInput = unknown;

// The serialize implementation is expected to live here
export const SERIALIZE: unique symbol = Symbol("SERIALIZE"),
    DESERIALIZE: unique symbol = Symbol("DESERIALIZE"),
    SERIALIZE_FORMAT_JSON: unique symbol = Symbol("SERIALIZE_FORMAT_JSON"),
    SERIALIZE_FORMAT_OBJECT: unique symbol = Symbol("SERIALIZE_FORMAT_OBJECT"),
    SERIALIZE_FORMAT_URL: unique symbol = Symbol("SERIALIZE_FORMAT_URL"),
    GENERATED_DATA: unique symbol = Symbol.for("GENERATED_DATA");

export interface SerializationOptions {
    /**
     * Controls how property keys are stored for structs (true: store keys).
     */
    structStoreKeys: boolean;

    /**
     * If structStoreKeys is true, controls whether the output is a dictionary (true) or a list of [key, value] pairs (false).
     */
    structAsDict: boolean;

    /**
     * Specifies the target output format.
     */
    format:
        | typeof SERIALIZE_FORMAT_JSON
        | typeof SERIALIZE_FORMAT_OBJECT
        | typeof SERIALIZE_FORMAT_URL;

    /**
     * If true, stops processing immediately upon encountering any error.
     */
    earlyExitOnError: boolean;

    /**
     * If true, performs checks on the results after serialization/deserialization.
     */
    checkResults: boolean;

    /**
     * A Set containing data marker symbols. If any symbol in this set exists as a key
     * on an object, that object's serialization is skipped.
     */
    skipDataMarkers: Set<symbol>;
}

export const SERIALIZE_OPTIONS: Readonly<SerializationOptions> = Object.freeze({
    // NOTE: there are three styles:
    //   - A list with possibly empty slots: structStoreKeys=false
    //   - A list with [key, value] pairs: structStoreKeys=true, structAsDict=false
    //   - A dictionary: structStoreKeys=true, structAsDict=true
    // The list version can be made the most compact, especially if
    // empty slots are cumulated or when (zip) compression is used
    // When used as JSON, dictionary is by far the most readable and
    // probably the nicest for human editing, however, ordered map types
    // can't use dictionaries as order may be screwed up depending on
    // the keys.
    structStoreKeys: true,
    structAsDict: true, // only if structStoreKeys is true
    format: SERIALIZE_FORMAT_JSON,
    earlyExitOnError: false,
    checkResults: false,
    // The Set holds symbols that should trigger skipping.
    // set to falsy or an empty set to included GENERATED_DATA
    // e.g. for debugging
    skipDataMarkers: new Set([GENERATED_DATA]),
    // TODO: if JSON is the target, numeric values could be stored as
    // numbers instead of strings, making human editing nicer.
});

// Will prevent accidental alteration, however, this is not vandalism proof.
// I tried using Javascript Proxy for this, however, it is not vandalism
// proof either (e.g. via prototype pollution), if that is a concern, an
// object with an internal map as storage and the same interface as Map
// is better.
export class FreezableMap<K, V> extends Map<K, V> {
    public set(key: K, value: V): this {
        if (Object.isFrozen(this)) return this;
        return super.set(key, value);
    }
    public delete(key: K): boolean {
        if (Object.isFrozen(this)) return false;
        return super.delete(key);
    }
    public clear(): void {
        if (Object.isFrozen(this)) return;
        return super.clear();
    }
}

export class FreezableSet<T> extends Set<T> {
    public add(value: T): this {
        if (Object.isFrozen(this)) {
            return this;
        }
        return super.add(value);
    }
    public delete(value: T): boolean {
        if (Object.isFrozen(this)) {
            return false;
        }
        return super.delete(value);
    }
    public clear(): void {
        if (Object.isFrozen(this)) {
            return;
        }
        return super.clear();
    }
}

// Can be used/shared by default instead of creating new empty sets
// as dependencies.
export const EMPTY_SET = Object.freeze(new FreezableSet<string>());

export interface ConstructableBaseDraft<T extends _BaseModel> {
    new (oldState: T): T; // Constructor signature expecting an instance of the class
}

/*
public static *createPrimalStateGen<T extends _BaseModel>(
        dependencies: DependenciesMap,
        // Add type and default value
        serializedValue: TSerializedInput | null = null,
        // Add type and default value
        serializeOptions: SerializationOptions = SERIALIZE_OPTIONS,
    ): Generator<PrimalStateGenYield, T, unknown> {

        // Inside a static method, 'this' refers to the class constructor (MyModel)
        const instance = new this(
                null,
                _DEFERRED_DEPENDENCIES,
                serializedValue,
                serializeOptions,
            ),
            // The generator returned by metamorphoseGen
            gen = instance.metamorphoseGen(dependencies);

        // 'yield*' delegates control to the inner generator (gen).
        // The return value of 'gen' (which is the T instance) becomes the
        // final return value of this static generator.
        return yield* gen;
    }
*/

// Define the static method type signature
export type CreatePrimalState<T extends _BaseModel> = (
    dependencies: DependenciesMap,
    serializedValue: TSerializedInput | null, // Allow null default
    options: SerializationOptions,
) => T;

export class ResourceRequirement {
    public description: unknown[];
    constructor(...description: unknown[]) {
        this.description = description;
    }
    toString() {
        return `[${this.constructor.name} with description: ${this.description.map((item: unknown) => item && (item as { toString(): string }).toString()).join(", ")}]`;
    }
}

export function driveResolverGenSync(
    syncResolve: (requirement: ResourceRequirement) => unknown,
    gen: Generator<ResourceRequirement, unknown, unknown>,
) {
    let result,
        sendInto = undefined;
    do {
        result = gen.next(sendInto);
        sendInto = undefined; // don't send same value again
        if (result.value instanceof ResourceRequirement)
            sendInto = syncResolve(result.value);
        else if (!result.done)
            throw new Error(
                `VALUE ERROR Don't know how to handle genereator result with value ${result.value}`,
            );
    } while (!result.done);
    return result.value;
}

export async function driveResolveGenAsync<R>(
    asyncResolve: (requirement: ResourceRequirement) => Promise<unknown>,
    gen: Generator<ResourceRequirement, R, unknown>,
) {
    // OK so this is the driving protocol of the metamorphoseGen.
    // It can't be directly in createPrimalStateAsync, as that req

    // gen = Model.createPrimalStateGen(...) or draft.metamorphoseGen(...)
    // can't send a value on first iteration
    let result: IteratorResult<ResourceRequirement, R>,
        sendInto: unknown = undefined; // initial sendInto is ignored anyways
    do {
        result = gen.next(sendInto);
        sendInto = undefined; // don't send same value again

        if (result.done) {
            // If done, exit the loop and the function
            break;
        }

        if (result.value instanceof ResourceRequirement)
            sendInto = await asyncResolve(result.value);
        else
            throw new Error(
                `VALUE ERROR Don't know how to handle genereator result with value {result.value}`,
            );
    } while (true); // eslint-disable-line no-constant-condition
    return result.value;
}

/**
 * usage: throw immutableWriteError(new Error(`My Message`));
 *
 * Reasoning: it's complicated to inherit from Error in JavaScript, as
 * a lot of tooling (browser developer console etc.) doesn't handle these
 * cases well. Hence it's better to use just the original Error class.
 *
 * To decide which kind of error is handled, `instanceof` is hence not
 * an option anymore. Looking after a string in the message can be an option
 * though, but this is a multi-use of the message an thus has the potential
 * of false positives.
 * Setting markers to the error instance is a good way, as it is very
 * explicit and does not re- or double-use existing mechanisms.
 *
 * Using a function to create the Error is not ideal, because it adds a
 * line to the traceback that is missleading and annoying.
 *
 * Adding the marker directly after creation of the error is good, but
 * potentially a lot of code duplication. It also requires to go from one
 *     line to trow an error to three lines:
 *     const error = new Error('My Message');
 *     error.marker = MyMarker
 *     throw error;
 *
 * Hence, these functions seem to be the best compromise:
 */

function _markError(symbol: symbol, error: Error, data: unknown = null) {
    (error as unknown as Record<symbol, unknown>)[symbol] = data || true;
    return error;
}
function _isMarkedError(symbol: symbol, error: Error) {
    return Object.hasOwn(error, symbol);
}

const IMMUTABLE_WRITE_ERROR = Symbol("IMMUTABLE_WRITE_ERROR"),
    KEY_CONSTRAINT_ERROR = Symbol("KEY_CONSTRAINT_ERROR"),
    DRAFT_KEY_ERROR = Symbol("DRAFT_KEY_ERROR"),
    DELIBERATE_RESOURCE_RESOLVE_ERROR = Symbol(
        "DELIBERATE_RESOURCE_RESOLVE_ERROR",
    );

// exported so "CUSTOM" constraints can use these
export const immutableWriteError = _markError.bind(null, IMMUTABLE_WRITE_ERROR),
    keyConstraintError = _markError.bind(null, KEY_CONSTRAINT_ERROR),
    draftKeyError = _markError.bind(null, DRAFT_KEY_ERROR),
    deliberateResourceResolveError = _markError.bind(
        null,
        DELIBERATE_RESOURCE_RESOLVE_ERROR,
    );

export const isImmutableWriteError = _isMarkedError.bind(
        null,
        IMMUTABLE_WRITE_ERROR,
    ),
    isKeyConstraintError = _isMarkedError.bind(null, KEY_CONSTRAINT_ERROR),
    isDraftKeyError = _isMarkedError.bind(null, DRAFT_KEY_ERROR),
    isDeliberateResourceResolveError = _isMarkedError.bind(
        null,
        DELIBERATE_RESOURCE_RESOLVE_ERROR,
    );

export function failingResourceResolve(
    resourceRequirement: ResourceRequirement,
) {
    // detect with isDeliberateResourceResolveError
    throw deliberateResourceResolveError(
        new Error(
            `FAILING DELIBERATELY ` +
                `failingResourceResolve with resource requirement: ` +
                `${resourceRequirement}`,
        ),
    );
}

export function driveResolverGenSyncFailing(
    gen: Generator<ResourceRequirement, unknown, unknown>,
) {
    return driveResolverGenSync(failingResourceResolve, gen);
}

export type ErrorPathPart = string | number;

// Define the type for a serialized error array
export type SerializedError = [
    path: ErrorPathPart[],
    message: Error | string | unknown,
    ...more: any[], // eslint-disable-line @typescript-eslint/no-explicit-any
];

export type SerializationSuccessResult = [errors: [], data: TSerializedData];
export type SerializationFailureResult = [
    errors: SerializedError[],
    data: null,
];
export type SerializationResult =
    | SerializationSuccessResult
    | SerializationFailureResult;

export abstract class _BaseModel {
    /**
     * Lifecycle Protocol API:
     *
     * constructor(oldState=null, ...) => new Model(currentInstance)=> a draft
     * dependencies => a set of names or an empty set
     * static createPrimalState(/*dependencies* /) => an immutable with "primal value" implementation specific
     * isDraft => bool
     * getDraf => a draft
     * metamorphose(...) => an immutable
     *
     */

    /**
     * The previous, immutable state of the object.
     * It is optional as it will be deleted when this object is metamorphosed
     * into an immutable.
     */
    public readonly [OLD_STATE]?: _BaseModel | null; // | undefined Made optional with '?'
    public readonly [_IS_DRAFT_MARKER]!: boolean;

    constructor(oldState: _BaseModel | null = null) {
        if (oldState && oldState.constructor !== this.constructor)
            throw new Error(
                `TYPE ERROR: oldState must have the same constructor as this ${this}.`,
            );
        this[OLD_STATE] = oldState || null;
        Object.defineProperty(this, _IS_DRAFT_MARKER, {
            value: true,
            configurable: true,
        });
    }

    static dependencies = EMPTY_SET; // jshint ignore:line

    get dependencies() {
        return EMPTY_SET;
    }

    getDraft() {
        if (this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be in immutable mode to get a draft for it.`,
            );
        const CTOR = this.constructor;
        // Assert the constructor type: Tell TypeScript that CTOR is constructable
        // and that it takes an argument of 'this' (the current instance).
        const DraftConstructor =
            CTOR as unknown as ConstructableBaseDraft<this>;
        return new DraftConstructor(this);
    }

    get oldState() {
        if (!this.isDraft)
            throw new Error(
                `LIFECYCLE ERROR ${this} must be a draft to have an oldState.`,
            );
        return this[OLD_STATE];
    }

    // Implementation for createPrimalDraft
    public static createPrimalDraft(
        dependencies: DependenciesMap,
        serializedValue: TSerializedInput | null = null,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): _BaseModel {
        // Return type is the instance type (this)
        // 'this' inside a static method refers to the class constructor.
        // We assert 'this' has the createPrimalState method.
        const Constructor = this as unknown as {
            createPrimalState: CreatePrimalState<_BaseModel>;
        };

        // This call is now valid based on the assertion above.
        const primalState = Constructor.createPrimalState(
            dependencies,
            serializedValue,
            options,
        );
        // Ensure the returned object has the getDraft method
        // The result must still be asserted to have getDraft() for type safety
        // since getDraft() is an instance method.
        const draftableState = primalState as _BaseModel & {
            getDraft(): _BaseModel;
        };
        return draftableState.getDraft();
    }

    static *createPrimalStateGen(
        _dependencies: DependenciesMap,
        _serializedValue: TSerializedInput | null = null,
        _options: SerializationOptions = SERIALIZE_OPTIONS,
    ): Generator<ResourceRequirement, _BaseModel, unknown> {
        throw new Error("NOT IMPLEMENTED: createPrimalStateGen");
    }

    get isDraft(): boolean {
        return this[_IS_DRAFT_MARKER];
    }

    public abstract metamorphoseGen(
        dependencies?: DependenciesMap,
    ): Generator<ResourceRequirement, this, unknown>;

    /**
     * old style interface
     *
     * This will fail if the resolver is required at all, that's
     * how things used to be, but to deserialize a state and be able to
     * load missing resources (e.g. fonts), a more sophisticated approach
     * is required.
     */
    metamorphose(dependencies?: DependenciesMap) {
        const gen = this.metamorphoseGen(dependencies);
        return driveResolverGenSyncFailing(gen);
    }

    // qualifiedKey => can distinguish between alias/shortcut and
    // absolut entry. e.g. "@firstChild" vs ".0"
    public abstract get(key?: string | number): unknown;

    // Each model will have to define this.
    get value(): unknown {
        throw new Error(`NOT IMPLEMENTED get value in ${this}.`);
    }

    // use only for console.log/Error/debugging purposes
    toString() {
        return `[model ${this.constructor.name}:${this.isDraft ? "draft" : "immutable"}]`;
    }

    toObject() {
        // => JSON compatible ... make this toJSON?
        throw new Error(`NOT IMPLEMENTED toObject in ${this}.`);
    }

    public abstract [SERIALIZE](
        options: SerializationOptions,
    ): SerializationResult;

    public abstract [DESERIALIZE](
        serializedValue: TSerializedInput,
        options: SerializationOptions,
    ): void;
}

/**
 * Contract for a constructor (class) used by _BaseSimpleModel
 * to create a Primal State Draft. It requires the serialization arguments.
 */
export interface ConstructableBaseSimpleDraft<T extends _BaseSimpleModel> {
    new (
        oldState: T | null | undefined,
        serializedValue: TSerializedInput | null,
        options: SerializationOptions,
    ): T;
}

export interface ConstructableBaseContainerDraft<T extends _BaseSimpleModel> {
    new (
        oldState: T | null | undefined,
        dependencies: DependenciesMap | typeof _DEFERRED_DEPENDENCIES,
        serializedValue: TSerializedInput | null,
        options: SerializationOptions,
    ): T;
}

// This is to mark simple values in contrast to Container values
// as _BaseContainerModel is also a _BaseModel, _BaseModel
// is not ideal to make that distiction.
export abstract class _BaseSimpleModel extends _BaseModel {
    // PASS
    // TODO: "SimpleModel" general API requirements should move here

    /**
     * @static
     * old style interface: Creates an immutable "primal state" instance directly.
     */
    static createPrimalState(
        // ignore dependencies for a SimpleModel, but must accept them for the contract
        _dependencies: DependenciesMap | null,
        serializedValue: TSerializedInput | null = null,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): InstanceType<typeof this> {
        // Assert the constructor (this) implements the required signature for primal state creation
        const Constructor = this as unknown as ConstructableBaseSimpleDraft<
            InstanceType<typeof this>
        >;
        return new Constructor(null, serializedValue, options);
    }

    /**
     * @static
     * So far, there are no dependencies in the _BaseSimpleModel types, hence this
     * returns an instance immediately via the generator protocol.
     * This method satisfies the abstract static contract from SerializableModelConstructor.
     *
     * With this, within a metamorphoseGen, we can call:
     * instance = yield *Model.createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS)
     */
    static *createPrimalStateGen(
        // ignore dependencies for a SimpleModel, but must accept them for the contract
        _dependencies: DependenciesMap | null,
        serializedValue: TSerializedInput | null = null,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): Generator<ResourceRequirement, InstanceType<typeof this>, unknown> {
        //
        return this.createPrimalState(null, serializedValue, options);
    }
}

export type KeyedSerializedValue = [string | number, TSerializedData | null];
export type SingleSerializedValue = TSerializedData | null;

/**
 * Determines if a given item should be skipped during serialization based on
 * the presence of specific 'skip data markers' (Symbols) in the options.
 *
 * @param item The object to check for skip markers.
 * @param options The serialization options.
 * @returns true if serialization should be skipped, false otherwise.
 */
function _skipSerialize(
    item: _BaseModel,
    options: SerializationOptions,
): boolean {
    const { skipDataMarkers } = options;

    // Check for falsy or empty set
    if (!skipDataMarkers || skipDataMarkers.size === 0) {
        return false;
    }

    // Iterate over the symbols in the Set
    for (const marker of skipDataMarkers) {
        // Use Object.hasOwn, which correctly checks for symbol properties as well.
        if (Object.hasOwn(item, marker)) {
            return true;
        }
    }

    return false;
}

function _serializeErrorsPrependKey(
    key: string,
    errors: SerializedError[],
): SerializedError[] {
    const newErrors: SerializedError[] = [];
    for (const [path, message, ...more] of errors) {
        const newPath: ErrorPathPart[] = [key];
        for (const pathPart of path) newPath.push(pathPart);
        newErrors.push([newPath, message, ...more]);
    }
    return newErrors;
}

// Define the interface for a model that can be serialized.
// It requires the method keyed by the SERIALIZE symbol.
interface SerializableModel {
    [SERIALIZE](options: SerializationOptions): SerializationResult;
}

// --- TypeScript Function ---

function _safeSerialize(
    modelInstance: SerializableModel, // Type using the interface
    options: SerializationOptions, // Type using the provided interface
): SerializationResult {
    try {
        // We trust the implementation returns a value conforming to SerializationResult.
        return modelInstance[SERIALIZE](options);
    } catch (error) {
        // If an *unexpected error* occurs during serialization (e.g., an exception thrown),
        // we catch it and package it into the failure tuple format.
        const errors: SerializedError[] = [];

        // Structure the error: [[], error]
        errors.push([
            [], // Empty path array (since the error is at the root level of the instance)
            error, // The error object caught
        ]);

        // Return the failure tuple: [errors array, null data]
        return [errors, null];
    }
}

export function serializeItem(
    modelInstance: _BaseModel,
    options: SerializationOptions = SERIALIZE_OPTIONS,
): SerializationResult {
    const isContainer = modelInstance instanceof _BaseContainerModel,
        result: SerializationResult = _safeSerialize(modelInstance, options),
        [errors, value] = result;

    if (errors.length && options.earlyExitOnError) return result;
    const resultErrors = [...errors];
    if (options.checkResults) {
        if (isContainer) {
            if (!Array.isArray(value))
                resultErrors.push([
                    [],
                    new Error(
                        `VALUE ERROR NOT ARRAY ${modelInstance} ` +
                            `is a container but does not produce an array`,
                    ),
                    typeof value,
                    value,
                ]);
        } else if (value !== null && typeof value !== "string") {
            resultErrors.push([
                [],
                new Error(
                    `VALUE ERROR NOT SIMPLE ${modelInstance} ` +
                        `is simple but does not produce null or a string`,
                ),
                typeof value,
                value,
            ]);
        }
    }
    return [resultErrors, value] as SerializationResult;
}

export function _serializeContainer(
    containerItem: _BaseContainerModel,
    presenceIsInformation: boolean,
    keepKeys: boolean,
    options: SerializationOptions = SERIALIZE_OPTIONS,
): SerializationResult {
    // Initialize with specific types
    const resultErrors: SerializedError[] = [];

    // resultValues holds either raw serialized data, null, or a [key, value] tuple.
    const resultValues: (SingleSerializedValue | KeyedSerializedValue)[] = [];

    for (const [key, childItem] of containerItem) {
        // _skipSerialize skips generated data
        const skipSerialize = _skipSerialize(childItem, options);
        let errors: SerializedError[];
        let serializedValue: TSerializedData | null;

        if (skipSerialize) {
            errors = [];
            serializedValue = null;
        } else {
            // Assume serializeItem returns a SerializationResult [errors, serializedValue]
            [errors, serializedValue] = serializeItem(childItem, options);
        }

        resultErrors.push(..._serializeErrorsPrependKey(key, errors));
        if (errors.length && options.earlyExitOnError) break;

        // keep out empty values from the result, caution, empty lists
        // will require some extra action in deserialize;
        if (
            serializedValue === null ||
            (Array.isArray(serializedValue) && serializedValue.length === 0)
        ) {
            if (!keepKeys) {
                // Register <empty item> at position.
                // Actually: put a null value there, as:
                //       JSON.stringifiy([,,]) => '[null, null]'
                // so, at least with JSON serialization, it won't be
                // distinguishable.
                resultValues.push(null);
            } else if (presenceIsInformation) {
                // for openTypeFeatures (a map) this is required,
                // as even if the value is the same as the default,
                // the explicit presence of the key in the map
                // is important.
                // Other cases like that are also possible, this,
                // hopefully, works generally.
                resultValues.push(keepKeys ? [key, null] : null);
            }
            // else skip: no key === empty
        } else
            resultValues.push(
                keepKeys ? [key, serializedValue] : serializedValue,
            );
    }
    return [
        resultErrors,
        resultValues.length ? resultValues : null,
    ] as SerializationResult;
}

export abstract class _BaseContainerModel extends _BaseModel {
    /**
     * old style interface
     */
    static createPrimalState(
        dependencies: DependenciesMap,
        serializedValue: TSerializedInput | null = null,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): InstanceType<typeof this> {
        // Assert the constructor (this) implements the required signature for primal state creation
        const Constructor = this as unknown as ConstructableBaseContainerDraft<
            InstanceType<typeof this>
        >;
        return new Constructor(null, dependencies, serializedValue, options);
    }

    /**
     * So, with this, within a metamorphoseGen, we can call:
     * instance = yield *Model.createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS)
     *
     *
     * gen = Model.createPrimalStateGen(dependencies, serializedValue=null, serializeOptions=SERIALIZE_OPTIONS)
     * await driveResolveGenAsync(asyncResolve, gen)
     */
    static *createPrimalStateGen(
        // ignore dependencies for a SimpleModel, but must accept them for the contract
        dependencies: DependenciesMap,
        serializedValue: TSerializedInput | null = null,
        options: SerializationOptions = SERIALIZE_OPTIONS,
    ): Generator<ResourceRequirement, InstanceType<typeof this>, unknown> {
        const Constructor = this as unknown as ConstructableBaseContainerDraft<
            InstanceType<typeof this>
        >;
        const instance = new Constructor(
                null,
                _DEFERRED_DEPENDENCIES,
                serializedValue,
                options,
            ),
            gen = instance.metamorphoseGen(dependencies);
        return yield* gen;
    }

    /**
     * @abstract
     * Forces subclasses to implement the standard key-value iterable protocol.
     */
    public abstract [Symbol.iterator](): Generator<
        [string, _BaseModel],
        void,
        unknown
    >;

    public abstract get(key: string): _BaseModel;
    public abstract set(key: string, entry: _BaseModel): void;
    public abstract hasOwn(key: string | unknown): boolean;
    public abstract ownKeys(): string[];
    // override if ownership and available keys differ
    has(key: string | unknown): boolean {
        return this.hasOwn(key);
    }
    // override if ownership and available keys differ
    keys(): string[] {
        return this.ownKeys();
    }
    *entries(): Generator<[string, _BaseModel], void, unknown> {
        yield* this;
    }
    // override if ownership and available keys differ
    *allEntries(): Generator<[string, _BaseModel], void, unknown> {
        yield* this.entries();
    }
}
