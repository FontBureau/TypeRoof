import { FreezableMap } from "../../../metamodel.mjs";
import {
    SPECIFIC,
    GENERIC,
    LEADING,
    LANGUAGE,
    OPENTYPE_FEATURES,
    COLOR,
} from "../../registered-properties-definitions.mjs";
import {
    TypeSpecModel,
    deserializeLeadingAlgorithmModel,
    deserializeManualMarginsModel,
} from "../../type-spec-models.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import { getColorFromPropertyValuesMap, culoriToColor } from "../../color.mjs";
import { TYPESPEC_PPS_MAP } from "./pps-maps.mjs";
import { LocalScopeTypeSpecnion } from "./type-specnion.mjs";
import { TYPE_SPEC_PROPERTIES_GENERATORS } from "./properties-generators.mjs";

// This is partially responsible to organize the inherited values as
// is is responsible to organize the default/fallback values.
// In both cases the current layer/modelInstance doesn't define the
// property itself. The difference is that  with inheritance, the
// value is defined in a parent and with defaults there's no user
// made value definition, but we still need to have some value.
//
// The plan is to create a bottom most model instance that is
// prepared with all the default values, so that there's no case
// without inheritance ever. It must be noted, that some values
// do not inherit, it's a configurable behavior and it would fail
// in that case!
//
// I have a hard time to figure out the best approach to inject
// default values. The case of non-inherited properties is a real
// use case, which makes it more complicated. It applies to x/y values
// that if applied to the layer/container must not be applied to the
// children directly, as the container already has moved by the amount.
// The EM would be a good example as well, as for a child it should always
// reset to 1, otherwise the font-size would get bigger/smaller for each
// added child element. Depending on the exact kind of elements,
// background-color is also a value that doesn't inherit well.
//
// This means we need a specific approach to default values in any
// case and can't rely on the inheritance mechanism, in the cases where
// inhertiance is turned off.

export const _NOTDEF = Symbol("_NOTDEF");

// If defaultVal === _NOTDEF and fullKey is not found
// this will raise.
export function _getFallback(fullKey, modelDefaultValue = _NOTDEF) {
    const fallback = getRegisteredPropertySetup(
        fullKey,
        modelDefaultValue === _NOTDEF
            ? getRegisteredPropertySetup.NOTDEF
            : modelDefaultValue,
    );
    return fallback === modelDefaultValue
        ? modelDefaultValue
        : fallback.default;
}

export function typeSpecGetDefaults(
    getLiveProperties,
    ppsRecord,
    fieldName,
    /*BaseModelType.*/ modelDefaultValue = _NOTDEF,
) {
    const { fullKey } = ppsRecord,
        // When this is the root typeSpec we get a KEY ERROR:
        //    via VideoproofController constructor initial resources:
        //    Error: KEY ERROR not found identifier "typeSpecProperties@"
        //    in [ProtocolHandler typeSpecProperties@]:
        //    typeSpecProperties@/activeState/typeSpec.
        // FIXME: We should rather get the own typeSpecProperties@ and then
        // see if it defines itself a parent. Better then hard-coding the
        // parent path in here.

        // null or the liveProperties instance
        liveProperties = getLiveProperties(),
        propertyValues =
            liveProperties !== null
                ? liveProperties.typeSpecnion.getProperties()
                : new Map();
    // console.log(`typeSpecGetDefaults ${ppsRecord} fieldName: ${fieldName} modelDefaultValue`, modelDefaultValue
    //     , '\n   typeSpecPropertiesKey:', typeSpecPropertiesKey
    //     , '\n   propertyValues:', propertyValues
    //     );
    // FIXME: it's interesting that we so not use the liveProperties
    // in comparable functions in stage-and-actors, however,
    // this here seems to behave fine.
    if (ppsRecord.prefix === COLOR) {
        const [color] = getColorFromPropertyValuesMap(fullKey, propertyValues, [
            null,
        ]);
        if (color !== null) return color;
        return _getFallback(fullKey, modelDefaultValue);
    }
    // These requests come via UIManualAxisLocations:
    else if (
        ppsRecord.prefix === "axesLocations/" ||
        ppsRecord.prefix === OPENTYPE_FEATURES ||
        ppsRecord.prefix === LANGUAGE
    ) {
        // 'axesLocations/'. 'YTFI', '738'
        // 'opentype-feature/'. 'kern', false
        const key = `${ppsRecord.prefix}${fieldName}`,
            result = propertyValues.has(key)
                ? propertyValues.get(key)
                : modelDefaultValue;
        if (result === _NOTDEF)
            throw new Error(
                `KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`,
            );
        return result;
    } else if (ppsRecord.prefix === SPECIFIC) {
        // Introducing 'SPECIFIC', which in contrast to
        // GENERIC requires modelDefaultValue and cannot
        // be acquired via getRegisteredPropertySetup
        // FIXME: we don't use this case far anyymore!!! (we use the SPECIFIC prefix though)
        const result = propertyValues.has(fullKey)
            ? propertyValues.get(fullKey)
            : modelDefaultValue;
        if (result === _NOTDEF)
            throw new Error(
                `KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`,
            );
        return result;
    } else {
        if (propertyValues.has(fullKey)) return propertyValues.get(fullKey);
        return _getFallback(fullKey, modelDefaultValue);
    }
}

const _skipPrefix = new Set([
    // This is very complicated as axesLocations have different default
    // values depending on the actual font. So if there's no font, there
    // can't be a value. This is why modelDefaultValue is injected, because
    // the caller may know a default value, but it may also not know, there's
    // no guarantee!
    "axesLocations/",
    OPENTYPE_FEATURES,
    LANGUAGE,
    // "font" is really the only case of this so far, there could
    // be the document font as a default maybe, as it cannot be not
    // set at all, hence it also must be loaded and available.
    SPECIFIC,
    // not yet thought through
    "stylePatches/",
]);

const _skipFullKey = new Set([
    // `${GENERIC}blockMargins`
]);

export function _getTypeSpecDefaultsMap(typeSpecDependencies) {
    const defaultTypeSpec = (() => {
            const draft = TypeSpecModel.createPrimalDraft(typeSpecDependencies);
            for (const [fieldName, ppsRecord] of TYPESPEC_PPS_MAP) {
                if (_skipPrefix.has(ppsRecord.prefix)) continue;
                if (_skipFullKey.has(ppsRecord.fullKey)) continue;
                if (ppsRecord.prefix == COLOR) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        color = culoriToColor(defaultValue, draft.dependencies);
                    draft.set(fieldName, color);
                } else if (ppsRecord.prefix == LEADING) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        leading = deserializeLeadingAlgorithmModel(
                            draft.dependencies,
                            defaultValue,
                        );
                    draft.set(fieldName, leading);
                } else if (ppsRecord.fullKey === `${GENERIC}blockMargins`) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        margins = deserializeManualMarginsModel(
                            draft.dependencies,
                            defaultValue,
                        );
                    draft.set(fieldName, margins);
                } else {
                    const defaultValue = typeSpecGetDefaults(
                        () => null,
                        ppsRecord,
                        fieldName,
                    );
                    draft.get(fieldName).value = defaultValue;
                }
            }
            return draft.metamorphose();
        })(),
        properties = LocalScopeTypeSpecnion.propertiesGenerator(
            TYPE_SPEC_PROPERTIES_GENERATORS,
            defaultTypeSpec,
            new Map(),
        ),
        localPropertyValuesMap = LocalScopeTypeSpecnion.initPropertyValuesMap(
            properties,
            new Map(),
        ),
        typeSpecDefaultsMap = new FreezableMap(localPropertyValuesMap);
    Object.freeze(typeSpecDefaultsMap);
    return typeSpecDefaultsMap;
}
