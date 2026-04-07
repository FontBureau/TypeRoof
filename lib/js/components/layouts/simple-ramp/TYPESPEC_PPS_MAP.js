import {
    GENERIC,
    COLOR,
    LEADING,
    LANGUAGE,
    OPENTYPE_FEATURES,
    ProcessedPropertiesSystemMap,
} from "../../registered-properties-definitions.mjs";
import { ColorModel } from "../../color.mjs";
import {
    LeadingAlgorithmModel,
    TypeSpecModel,
} from "../../type-spec-models.mjs";
import { LanguageTagModel } from "../../language-tags.typeroof.jsx";

// FIXME: put this rather into the UITypeDrivenContainer
// so we can make a complete mapping if all values that require it and
// then filter where the filter is required!
const _excludesTypeSpecPPSMap = new Set([
    "children", // => Controlled globally by TreeEditor
    "label", // => This has a control for label.
    "autoOPSZ", // => UIManualAxesLocations has a control for autoOPSZ.
]);

function getTypeSpecPPSMap(parentPPSRecord, Model) {
    const entries = [];
    for (const [modelFieldName, modelFieldType] of Model.fields.entries()) {
        let prefix = GENERIC,
            fullKey = null,
            registryKey = null;
        // This case is not used, it's a stub, left over from another
        // similar function and put into the parentPPSRecord condition
        // which is currently called nowhere. But the goal is to find
        // a general form for this kind of function.
        if (parentPPSRecord)
            fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        if (_excludesTypeSpecPPSMap.has(modelFieldName)) prefix = null;
        else if (modelFieldType === ColorModel) prefix = COLOR;
        else if (modelFieldType === LeadingAlgorithmModel) prefix = LEADING;
        else if (modelFieldType === LanguageTagModel) prefix = LANGUAGE;
        else if (modelFieldName === "axesLocations")
            // we should use a symbol here!
            prefix = "axesLocations/";
        else if (modelFieldName === "stylePatches") prefix = "stylePatches/";
        else if (modelFieldName === "openTypeFeatures")
            prefix = OPENTYPE_FEATURES;

        if (prefix === null)
            // don't make a UI for this
            continue;

        const entry = [
            modelFieldName,
            ProcessedPropertiesSystemMap.createSimpleRecord(
                prefix,
                modelFieldName,
                fullKey,
                registryKey,
            ),
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}

export const TYPESPEC_PPS_MAP = getTypeSpecPPSMap(null, TypeSpecModel);
