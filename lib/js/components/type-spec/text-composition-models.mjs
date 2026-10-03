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
    _AbstractSimpleOrEmptyModel,
} from "../../metamodel.mjs";

import { BooleanDefaultTrueOrEmptyModel } from "../actors/models.mjs";

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

// Hyphenation configuration (milestone 3, phase 2) — an INHERITABLE
// Host control (the contract: "enabled/disabled as a Host control
// PRIOR to line breaking/fitting — it changes the input, not the
// algorithm"). All fields OrEmpty: empty = inherit; the defaults
// apply at the root (controller-side defaults when unresolved:
// enabled true, minWordLength 6, minBefore 2, minAfter 3).
const HyphenationMinWordLengthModel = _AbstractNumberModel.createClass(
        "HyphenationMinWordLengthModel",
        { min: 2, defaultValue: 6, toFixedDigits: 0 },
    ),
    HyphenationMinBeforeModel = _AbstractNumberModel.createClass(
        "HyphenationMinBeforeModel",
        { min: 1, defaultValue: 2, toFixedDigits: 0 },
    ),
    HyphenationMinAfterModel = _AbstractNumberModel.createClass(
        "HyphenationMinAfterModel",
        { min: 1, defaultValue: 3, toFixedDigits: 0 },
    );

export const HyphenationModel = _AbstractStructModel.createClass(
    "HyphenationModel",
    ["enabled", BooleanDefaultTrueOrEmptyModel],
    [
        "minWordLength",
        _AbstractSimpleOrEmptyModel.createClass(HyphenationMinWordLengthModel),
    ],
    [
        "minBefore",
        _AbstractSimpleOrEmptyModel.createClass(HyphenationMinBeforeModel),
    ],
    [
        "minAfter",
        _AbstractSimpleOrEmptyModel.createClass(HyphenationMinAfterModel),
    ],
);
