/**
 * Text-composition algorithm selection + configuration models
 * (milestone 2, phase 2) — the dynamic-struct on TypeSpecModel,
 * per typeSpec and inheriting (empty instance = inherit).
 *
 * Follows the horizontalLayout precedent EXACTLY
 * (type-spec/horizontal-layout-models.mjs: createDynamicModel).
 *
 * The models live here (type-spec submodule); the algorithm
 * IMPLEMENTATIONS live in
 * lib/js/components/layouts/type-stage/text-composition/
 * (dummy-composition.ts, greedy-ragged.ts).
 */
import {
    _AbstractStructModel,
    _AbstractNumberModel,
} from "../../metamodel.mjs";

// NOTE on engagement: there is no separate on/off boolean — the
// algorithm selection IS the engagement. Empty (no typeKey) =
// inherit; TextCompositionAlgorithmNoneModel = explicitly OFF (the
// browser does its own line breaking); any other type = compose
// with that algorithm.

import { createDynamicModel } from "../dynamic-types-pattern.mjs";

export const SegmentsPerLineModel = _AbstractNumberModel.createClass(
        "SegmentsPerLineModel",
        { min: 1, defaultValue: 4, toFixedDigits: 0 },
    ),
    // The milestone-1 dummy: fixed segments per line — infrastructure
    // proof and the perf-baseline comparison algorithm.
    TextCompositionAlgorithmDummyModel = _AbstractStructModel.createClass(
        "TextCompositionAlgorithmDummyModel",
        ["segmentsPerLine", SegmentsPerLineModel],
    ),
    // Milestone 2: greedy ragged line breaking. No configuration yet
    // (an empty struct is a valid choice).
    TextCompositionAlgorithmGreedyRaggedModel =
        _AbstractStructModel.createClass(
            "TextCompositionAlgorithmGreedyRaggedModel",
        ),
    // Explicitly OFF: the browser does its own line breaking. Empty
    // struct on purpose — the intent is to eventually carry
    // configuration for the browser-side rendering (related CSS
    // properties, e.g. text-wrap, hyphens:auto for browser-side
    // hyphenation).
    TextCompositionAlgorithmNoneModel = _AbstractStructModel.createClass(
        "TextCompositionAlgorithmNoneModel",
    ),
    {
        TextCompositionAlgorithmModel,
        createTextCompositionAlgorithm,
        deserializeTextCompositionAlgorithmModel,
    } = createDynamicModel("TextCompositionAlgorithm", [
        [
            "TextCompositionAlgorithmNoneModel",
            "None (Browser)",
            TextCompositionAlgorithmNoneModel,
        ],
        [
            "TextCompositionAlgorithmDummyModel",
            "Dummy",
            TextCompositionAlgorithmDummyModel,
        ],
        [
            "TextCompositionAlgorithmGreedyRaggedModel",
            "Greedy Ragged",
            TextCompositionAlgorithmGreedyRaggedModel,
        ],
    ]);
