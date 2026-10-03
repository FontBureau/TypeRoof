/**
 * UI for the textCompositionAlgorithm dynamic struct (milestone 2):
 * a select over the available algorithm types (inherit / Dummy /
 * Greedy Ragged) plus the selected type's configuration fields
 * (Dummy's segmentsPerLine). Follows the UIHorizontalLayoutAlgorithm
 * precedent (ui-horizontal-layout.typeroof.jsx) — a minimal
 * UIDynamicStructContainer subclass.
 */
import { GENERIC } from "../registered-properties-definitions.mjs";
import { ProcessedPropertiesSystemMap } from "../registered-properties-definitions.mjs";
import { UIDynamicStructContainer } from "./ui-horizontal-layout.typeroof.jsx";
import {
    TextCompositionAlgorithmNoneModel,
    TextCompositionAlgorithmDummyModel,
    TextCompositionAlgorithmGreedyRaggedModel,
} from "./text-composition-models.mjs";

function getGenericPPSMap(parentPPSRecord, FieldType) {
    return Object.freeze(
        ProcessedPropertiesSystemMap.fromPrefix(
            GENERIC,
            FieldType.fields.keys(),
        ),
    );
}

export class UITextCompositionAlgorithm extends UIDynamicStructContainer {
    static CSS_CLASS_NAME = "ui_text-composition-algorithm_container";
    static LABEL = "Text Composition Algorithm";

    _getPPSMapForModel(ppsRecord, FieldType) {
        if (
            FieldType === TextCompositionAlgorithmNoneModel ||
            FieldType === TextCompositionAlgorithmDummyModel ||
            FieldType === TextCompositionAlgorithmGreedyRaggedModel
        )
            return getGenericPPSMap(ppsRecord, FieldType);
        // may just throw the KEY ERROR
        return super._getPPSMapForModel(ppsRecord, FieldType);
    }
}
