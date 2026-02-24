import { _AbstractSimpleOrEmptyModel } from "./simple-or-empty-model.ts";
import type {
    _BaseModel,
    _BaseContainerModel,
    FreezableMap,
} from "./base-model.ts";
import type { StaticDependency } from "./links.ts";
import type { ForeignKey } from "./foreign-key.ts";
import type { DependenciesMap } from "./base-model.ts";

// FIXME: also AvailableTypesModel/TypeModel should be centrally defined
//        so that we got one place where the pattern is implemented
// this is uses for color, axesMath, stylePatch and similarly forked in actors
export function createAvailableTypes(
    AvailableTypesModel: typeof _BaseContainerModel & {
        Model: typeof _BaseContainerModel;
    },
    types: Iterable<[string, string, typeof _BaseModel]>,
): [_BaseModel, Map<typeof _BaseModel, string>] {
    const availableTypesDraft = AvailableTypesModel.createPrimalDraft(
            {},
        ) as _BaseContainerModel,
        TYPE_TO_KEY = new Map<typeof _BaseModel, string>(),
        TypeModel = AvailableTypesModel.Model;
    for (const [key, label, Model] of types) {
        const availableType = TypeModel.createPrimalDraft(
            {},
        ) as _BaseContainerModel;
        (availableType.get("typeClass") as { value: unknown }).value = Model;
        (availableType.get("label") as { value: unknown }).value = label;
        (
            availableTypesDraft as unknown as {
                push(entry: [string, _BaseModel]): void;
            }
        ).push([key, availableType as unknown as _BaseModel]);
        TYPE_TO_KEY.set(Model, key);
    }
    const availableTypes = availableTypesDraft.metamorphose() as _BaseModel;
    return [availableTypes, TYPE_TO_KEY];
}

/**
 * Look at ColorModel of color.mjs or ActorModel of actors/actors-base.mjs
 * how the "DynamicModel" is set up.
 */
export function createDynamicType(
    DynamicModel: typeof _BaseContainerModel & {
        foreignKeys: FreezableMap<string, ForeignKey>;
        staticDependencies: FreezableMap<string, StaticDependency>;
    },
    typeKeyName: string,
    typeKeyValue: string,
    dependencies: DependenciesMap,
) {
    const availableTypesKey =
            DynamicModel.foreignKeys.get(typeKeyName)!.targetName, // e.g. 'availableActorTypes'
        availableTypes = DynamicModel.staticDependencies.has(availableTypesKey)
            ? (DynamicModel.staticDependencies.get(availableTypesKey)!
                  .state as _BaseContainerModel)
            : (dependencies[availableTypesKey] as _BaseContainerModel),
        getTypeFor = (key: string) =>
            (
                (availableTypes.get(key) as _BaseContainerModel)
                    .value as _BaseContainerModel
            ).get("typeClass").value as typeof _BaseContainerModel,
        getDraftFor = (name: string, deps: DependenciesMap) =>
            getTypeFor(name).createPrimalDraft(deps) as _BaseContainerModel,
        draft = getDraftFor(typeKeyValue, dependencies),
        resultDraft = DynamicModel.createPrimalDraft(
            dependencies,
        ) as _BaseContainerModel;
    (resultDraft.get(typeKeyName) as { value: unknown }).value = typeKeyValue;
    (resultDraft.get("instance") as unknown as { wrapped: unknown }).wrapped =
        draft;
    return resultDraft;
}

export function getMinMaxRangeFromType(
    Type: typeof _BaseModel & {
        Model?: typeof _BaseModel;
        minVal?: number;
        maxVal?: number;
    },
): [number | undefined, number | undefined] {
    const UnwrappedType = (
        Type.prototype instanceof _AbstractSimpleOrEmptyModel
            ? Type.Model
            : Type
    ) as { minVal?: number; maxVal?: number } | undefined;
    return [UnwrappedType?.minVal, UnwrappedType?.maxVal];
}

export function* getFieldsByType(
    FromType: typeof _BaseModel & {
        fields: FreezableMap<string, typeof _BaseModel>;
    },
    SearchType: typeof _BaseModel,
): Generator<string> {
    for (const [fieldName, Type] of FromType.fields) {
        if (Type === SearchType) yield fieldName;
    }
}
