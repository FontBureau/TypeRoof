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
import { culoriToColor } from "../../color.mjs";
import { TYPESPEC_PPS_MAP } from "./pps-maps.mjs";
import { typeSpecGetDefaults } from "./type-spec-get-defaults.mjs";
import { LocalScopeTypeSpecnion } from "./type-specnion.mjs";
import { TYPE_SPEC_PROPERTIES_GENERATORS } from "./properties-generators.mjs";

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
