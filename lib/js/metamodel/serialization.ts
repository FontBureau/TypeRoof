import {
    _BaseModel,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    SERIALIZE_FORMAT_JSON,
    driveResolveGenAsync,
    driveResolverGenSyncFailing,
    serializeItem,
} from "./base-model.ts";

import type {
    DependenciesMap,
    TSerializedInput,
    SerializationOptions,
    ResourceRequirement,
} from "./base-model.ts";

export function deserializeGen<T extends _BaseModel>(
    Model: DeserializableModelConstructor<T>,
    dependencies: DependenciesMap,
    serializedData: TSerializedInput,
    options: SerializationOptions = SERIALIZE_OPTIONS,
): Generator<ResourceRequirement, T, unknown> {
    let serializedValue;
    if (options.format === SERIALIZE_FORMAT_JSON) {
        if (typeof serializedData !== "string") {
            throw new TypeError(
                "JSON format requires serializedData to be a string.",
            );
        }
        serializedValue = JSON.parse(serializedData);
    } else if (options.format === SERIALIZE_FORMAT_OBJECT) {
        serializedValue = serializedData;
    } else
        throw new Error(
            `UNKNOWN FORMAT OPTION deserialize ${options.format.toString()}`,
        );
    // => gen
    return Model.createPrimalStateGen(dependencies, serializedValue, options);
}

type AsyncResolver = (requirement: ResourceRequirement) => Promise<unknown>;

export async function deserialize<T extends _BaseModel>(
    asyncResolve: AsyncResolver,
    Model: DeserializableModelConstructor<T>,
    dependencies: DependenciesMap,
    serializedData: TSerializedInput,
    options: SerializationOptions = SERIALIZE_OPTIONS,
) {
    const gen = deserializeGen(Model, dependencies, serializedData, options);
    return await driveResolveGenAsync(asyncResolve, gen);
}

export function deserializeSync<T extends _BaseModel>(
    Model: DeserializableModelConstructor<T>,
    dependencies: DependenciesMap,
    serializedString: TSerializedInput,
    options: SerializationOptions = SERIALIZE_OPTIONS,
) {
    const gen = deserializeGen(Model, dependencies, serializedString, options);
    return driveResolverGenSyncFailing(gen);
}

// I'm undecided with the interface!
// [SERIALIZE] could be a common entry point and the
// sub-classes could implement their own serialization which is called
// by this.
// OR the other way around:
// serialize would be the common entry point an subclasses would
// implement [SERIALIZE]
// FIXME: We should handle errors graceful, therefore report
// a failure and collect all failures, if not a fail early response
// is expected.
// It would be cool, if, despite of the size strategy, the return
// value of serialize would be a String or an Array. For Map/Dict
// types an Array of [key, value] entries.
// A simple Object could also be OK, but [key, value] pairs
// in an array are more explicit in preserving order (however,
// objects do so as well usually, it's just not as strictly required).
// For numbers, a string is preferred, as i.e. toFixed returns
// a string and that is used. We ¡know! the type of the values
// and can determine how to interpret them.
// EMPTY values should be empty slots in their arrays.
// We need a way to detect empty string vs EMPTY
export function serialize(
    modelInstance: _BaseModel,
    options: SerializationOptions = SERIALIZE_OPTIONS,
) {
    const [resultErrors, intermediateValue] = serializeItem(
        modelInstance,
        options,
    );
    if (options.format === SERIALIZE_FORMAT_JSON)
        return [
            resultErrors,
            // NOTE: even with indentation (pretty printing), this doesn't
            // look particular pretty.
            JSON.stringify(intermediateValue, null, 2),
        ];
    else if (options.format === SERIALIZE_FORMAT_OBJECT)
        return [resultErrors, intermediateValue];
    throw new Error(
        `UNKNOWN FORMAT OPTION serialize ${options.format.toString()}`,
    );
}

export const _PRIMARY_SERIALIZED_VALUE = Symbol("_PRIMARY_SERIALIZED_VALUE");

// Define the interface that any _BaseModel Constructor MUST implement
interface DeserializableModelConstructor<T extends _BaseModel> {
    // Constructor Signature (Must be able to create an instance of T)
    // new (...args: any[]): T;

    // Enforce the Static Generator Method Signature (NO 'static' keyword here)
    // The generator yields some dependency type (PrimalStateGenYield)
    // and must return the final concrete model instance (T).
    createPrimalStateGen(
        dependencies: DependenciesMap,
        serializedValue: TSerializedInput,
        options: SerializationOptions,
    ): Generator<ResourceRequirement, T, unknown>;

    createPrimalState(
        dependencies: DependenciesMap,
        // Allow null default value
        serializedValue: TSerializedInput | null,
        options: SerializationOptions,
    ): T;
}
