import {
    GENERIC,
    COLOR,
    LEADING,
    LANGUAGE,
    OPENTYPE_FEATURES,
    ProcessedPropertiesSystemMap,
} from "../../registered-properties-definitions.mjs";
import { ColorModel } from "../../color.mjs";
import { LeadingAlgorithmModel } from "../../type-spec-models.mjs";
import { LanguageTagModel } from "../../language-tags.typeroof.jsx";
import { NodeSpecModel } from "../../prosemirror/models.typeroof.jsx";

/**
 * Not how most of the Type -> prefix mappings don't apply to
 * NodeSpec. This method could be much simpler, however, for a general
 * solution, it doesn't hurt to have these cases covered.
 */
const _excludesNodeSpecPPSMap = new Set([
    //  an AttributeSpecMapModel: there's yet no UI and no concept to hand edit this
    "attrs",
]);

function getNodeSpecPPSMap(parentPPSRecord, Model) {
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
        if (_excludesNodeSpecPPSMap.has(modelFieldName)) prefix = null;
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

export const NODESPEC_PPS_MAP = getNodeSpecPPSMap(null, NodeSpecModel);
