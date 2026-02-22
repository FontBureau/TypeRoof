import { _AbstractSimpleOrEmptyModel } from './simple-or-empty-model.ts';

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
