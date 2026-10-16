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
    _AbstractEnumModel,
    StringModel,
    NumberModel,
    CoherenceFunction,
    _AbstractListModel,
    _AbstractOrderedMapModel,
} from "../../metamodel.mjs";

import { BooleanDefaultTrueOrEmptyModel, BooleanOrEmptyModel } from "../actors/models.mjs";
import { validateOpenTypeTagString } from "../../util.mjs";

// --- Named potentials configurations (milestone 6) ------------------
//
// Selectable by name on BOTH greedy-fit and knuth-plass:
//   potentials = "auto" (best-fit discovery, the status quo) or a
//     named configuration key (see POTENTIALS_CONFIGURATIONS in
//     layouts/type-stage/text-composition/justification-potentials.ts);
//   potentialsAnchoring = "run" (the run's resolved axis values —
//     status quo, step 0 = no change), "font" (the font's fvar
//     defaults — one stable anchor per font, shared by all runs),
//     "off" (the authored triple verbatim — the configuration
//     asserts its natural state);
//   potentialsLocationOverrides = tag -> number, FILL-ONLY: applies
//     to table dimensions the run's font does not carry; entries for
//     axes the font has are ignored (protecting step-0 identity for
//     "run"/"font" anchoring).
// Greedy-fit additionally replaces the hardcoded treatment toggles
// (treatmentXTRA/treatmentTracking/treatmentWordspace) with ONE
// off-list: treatments = the DISABLED treatment tags (axis tags +
//     the pseudo-axes "tracking"/"wordspace"); NOT in the list =
//     enabled. The coherence function dedupes and — for a NAMED
//     potentials selection — prunes entries the configuration does
//     not offer (for "auto" the offered set is font-dependent:
//     no pruning, unknown tags are ignored at resolution).
export const PotentialsSelectionModel = _AbstractEnumModel.createClass(
        "PotentialsSelectionModel",
        [
            "auto",
            "robotoFlexText",
            "robotoFlexHeadline",
            "amstelvarText",
            "amstelvarHeadline",
        ],
        "auto",
    ),
    PotentialsAnchoringModel = _AbstractEnumModel.createClass(
        "PotentialsAnchoringModel",
        ["run", "font", "off"],
        "run",
    ),
    PotentialsSelectionOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(
        PotentialsSelectionModel,
    ),
    PotentialsAnchoringOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(
        PotentialsAnchoringModel,
    );

// Manual override for a navigation dimension the run's font does not
// carry: axis tag -> number (plain numbers only — no logical values:
// the axis has no range to read, see the research doc). Keys are
// validated OpenType tags, entries carry no other meaning.
export const PotentialsLocationOverridesModel =
    _AbstractOrderedMapModel.createClass(
        "PotentialsLocationOverridesModel",
        NumberModel,
        { validateKeyFn: validateOpenTypeTagString },
    );

// One disabled treatment tag (axis tags + the pseudo-axes
// "tracking"/"wordspace").
const _isPseudoAxisTag = (tag) => tag === "tracking" || tag === "wordspace";
export const PotentialsTreatmentTagModel = StringModel.createClass(
        "PotentialsTreatmentTagModel",
        {
            sanitizeFN: (rawValue) => [String(rawValue), null],
            validateFN: (value) =>
                value === ""
                    ? [true, null] // empty = the fresh entry (the UI's add
                    : // button) — filled in by the author; a nonempty
                      // value must be a real treatment tag
                      typeof value === "string" &&
                      !isFinite(Number(value)) &&
                      (_isPseudoAxisTag(value) ||
                          validateOpenTypeTagString(value)[0])
                      ? [true, null]
                      : [
                            false,
                            `"${value}" is not a treatment tag (a 4-char ` +
                                `OpenType axis tag or "tracking"/"wordspace").`,
                        ],
            // identity (de)serialization, like StringModel
            serializeFN: (value) => value,
            deserializeFN: (serializedString) => serializedString,
            defaultValue: "",
        },
    );

// The off-list semantics: in list = the treatment is DISABLED, not
// in list = enabled (the default: all treatments the resolved
// configuration offers). A list (not a set) in the metamodel; the
// coherence function on the parent struct dedupes.
export const PotentialsTreatmentsOffListModel =
    _AbstractListModel.createClass(
        "PotentialsTreatmentsOffListModel",
        PotentialsTreatmentTagModel,
    );

// Offered treatment keys per NAMED configuration (for coherence
// pruning): collected from the tables themselves — the axis tags
// AND pseudo-axes their leaves carry.
import {
    POTENTIALS_CONFIGURATIONS,
} from "../layouts/type-stage/text-composition/justification-potentials.ts";
const _collectTreatmentKeys = (table) => {
        const keys = new Set(),
            collect = (level) => {
                if (Array.isArray(Object.values(level)[0]))
                    // a leaf: its keys ARE the treatments
                    for (const key of Object.keys(level)) keys.add(key);
                else
                    for (const child of Object.values(level))
                        collect(child);
            };
        collect(table.tree);
        return keys;
    };
export const TREATMENT_KEYS_BY_CONFIGURATION = Object.fromEntries(
    Object.entries(POTENTIALS_CONFIGURATIONS).map(([key, table]) => [
        key,
        _collectTreatmentKeys(table),
    ]),
);
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
    // Milestone 4: greedy-fit (the varla-varfo strategy,
    // predictively) — exercises the justification potentials via the
    // Treatment Planner. All fields OrEmpty: empty = inherit; the
    // defaults below apply when unresolved. The treatment toggles
    // enable/disable individual treatments (axis XTRA, tracking,
    // wordspace); direction gates the step side; colorCoding is the
    // switch for the color-coded lines (adjustment intensity).
    JustificationDirectionModel = _AbstractEnumModel.createClass(
        "JustificationDirectionModel",
        ["both", "narrowing", "widening"],
        "both",
    ),
    JustificationDirectionOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(JustificationDirectionModel),
    // Milestone 6: how the FINAL line of a paragraph is composed.
    // "ragged" (default) = the \parfillskip rule: never widened, the
    // pull loop never absorbs the remainder (status quo). "fill" =
    // composed like a regular line: the pull loop may absorb the
    // whole remainder (the line becomes the final one, narrowed to
    // fit — the headline semantics) and an underfull final line
    // widens to the measure.
    GreedyFitLastLineHandlingModel = _AbstractEnumModel.createClass(
        "GreedyFitLastLineHandlingModel",
        ["ragged", "fill"],
        "ragged",
    ),
    GreedyFitLastLineHandlingOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(
        GreedyFitLastLineHandlingModel,
    ),
    // Milestone 6: what an underfull line that widening cannot fill
    // does. "off" (default) applies the maximum widening potential
    // (status quo); "run" reverts the line to the run's own axes
    // location. Orthogonal to potentialsAnchoring (same value
    // shape, separate control). ("font" was removed — the revert
    // wrote the FULL fvar location, stomping styled axes the
    // potentials don't treat, e.g. wght 700 -> 400.)
    GreedyFitUnderfullTreatmentModel = _AbstractEnumModel.createClass(
        "GreedyFitUnderfullTreatmentModel",
        ["run", "off"],
        "off",
    ),
    GreedyFitUnderfullTreatmentOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(
            GreedyFitUnderfullTreatmentModel,
        ),
    // Milestone 6: greedy-fit with named potentials configurations +
    //    the treatments off-list (replacing the hardcoded toggles).
    // All new fields OrEmpty: empty = inherit (= the defaults in the
    // controller). potentialsAnchoring defaults "run" (status quo);
    // treatments default empty = every treatment the resolved
    // configuration offers is enabled. The coherence function keeps
    // the off-list honest: no duplicates, and — for a NAMED
    // potentials selection — no entries the configuration does not
    // offer (for "auto" the offered set is font-dependent: no
    // pruning there).
    TextCompositionAlgorithmGreedyFitModel = _AbstractStructModel.createClass(
        "TextCompositionAlgorithmGreedyFitModel",
        ["potentials", PotentialsSelectionOrEmptyModel],
        ["potentialsLocationOverrides", PotentialsLocationOverridesModel],
        ["potentialsAnchoring", PotentialsAnchoringOrEmptyModel],
        ["treatments", PotentialsTreatmentsOffListModel],
        ["direction", JustificationDirectionOrEmptyModel],
        ["lastLineHandling", GreedyFitLastLineHandlingOrEmptyModel],
        ["underfullTreatment", GreedyFitUnderfullTreatmentOrEmptyModel],
        ["colorCoding", BooleanOrEmptyModel],
        CoherenceFunction.create(
            ["potentials", "treatments"],
            function sanitizeTreatments({ potentials, treatments }) {
                if (treatments.size === 0) return;
                // dedupe (set semantics: in list = disabled)
                const seen = new Set();
                for (const [key, tag] of treatments)
                    if (seen.has(tag.value)) treatments.delete(key);
                    else seen.add(tag.value);
                // prune entries a NAMED configuration does not
                // offer ("auto"'s offered set is font-dependent —
                // no pruning; unknown tags are ignored at resolution)
                const offered =
                    potentials.isEmpty || potentials.value === "auto"
                        ? null
                        : TREATMENT_KEYS_BY_CONFIGURATION[
                              potentials.value
                          ] ?? null;
                if (offered === null) return;
                for (const [key, tag] of treatments)
                    if (!offered.has(tag.value)) treatments.delete(key);
            },
        ),
    ),
    // Milestone 5: Knuth-Plass++ (paragraph-wide least-demerits DP).
    // All fields OrEmpty: empty = inherit; the defaults below apply
    // when unresolved (controller-side). hyphenPenalty is a HOST
    // knob (hyphen break opportunities carry it as break.penalty);
    // latticeQuantum (pt) is the quantum of the adaptive step
    // lattice (K per side = clamp(ceil(deltaPt / quantum), 4, 16));
    // colorCoding is an enum — the "kp" palette (demerits/fitness
    // classes) lands in Phase 4, until then a resolved "kp" renders
    // with the potentials palette (the GreedyFit boolean stays
    // untouched).
    // Milestone 6: KP gains the SAME named-potentials fields as
    // greedy-fit (potentials, overrides, anchoring); the DP
    // consumes potentials through TREATMENT_PLANNER_DEFAULTS
    // (all treatments on, direction both) — no treatments
    // off-list for KP (yet).
    KnuthPlassLinePenaltyModel = _AbstractNumberModel.createClass(
        "KnuthPlassLinePenaltyModel",
        { min: 0, defaultValue: 10 },
    ),
    KnuthPlassHyphenPenaltyModel = _AbstractNumberModel.createClass(
        "KnuthPlassHyphenPenaltyModel",
        { min: 0, defaultValue: 50 },
    ),
    KnuthPlassDoubleHyphenDemeritsModel = _AbstractNumberModel.createClass(
        "KnuthPlassDoubleHyphenDemeritsModel",
        { min: 0, defaultValue: 10000 },
    ),
    KnuthPlassFinalHyphenDemeritsModel = _AbstractNumberModel.createClass(
        "KnuthPlassFinalHyphenDemeritsModel",
        { min: 0, defaultValue: 5000 },
    ),
    KnuthPlassAdjDemeritsModel = _AbstractNumberModel.createClass(
        "KnuthPlassAdjDemeritsModel",
        { min: 0, defaultValue: 10000 },
    ),
    KnuthPlassExhaustedGapDemeritsModel = _AbstractNumberModel.createClass(
        "KnuthPlassExhaustedGapDemeritsModel",
        // demerits per 1-EN gap (cubic growth in EN) — see
        // KnuthPlassConfig.exhaustedGapDemerits
        { min: 0, defaultValue: 1000 },
    ),
    KnuthPlassExhaustedGapEnPercentModel = _AbstractNumberModel.createClass(
        "KnuthPlassExhaustedGapEnPercentModel",
        // the EN gap unit as % of EN (default 100); no max — > 100
        // is allowed (a larger unit prices gaps more tolerantly);
        // min 1 keeps the unit positive
        { min: 1, defaultValue: 100 },
    ),
    KnuthPlassLatticeQuantumModel = _AbstractNumberModel.createClass(
        "KnuthPlassLatticeQuantumModel",
        { min: 0.1, defaultValue: 1 },
    ),
    KnuthPlassColorCodingModel = _AbstractEnumModel.createClass(
        "KnuthPlassColorCodingModel",
        ["potentials", "kp", "off"],
        "off",
    ),
    KnuthPlassColorCodingOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(KnuthPlassColorCodingModel),
    TextCompositionAlgorithmKnuthPlassModel = _AbstractStructModel.createClass(
        "TextCompositionAlgorithmKnuthPlassModel",
        [
            "potentials",
            PotentialsSelectionOrEmptyModel,
        ],
        ["potentialsLocationOverrides", PotentialsLocationOverridesModel],
        ["potentialsAnchoring", PotentialsAnchoringOrEmptyModel],
        [
            "linePenalty",
            _AbstractSimpleOrEmptyModel.createClass(KnuthPlassLinePenaltyModel),
        ],
        [
            "hyphenPenalty",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassHyphenPenaltyModel,
            ),
        ],
        [
            "doubleHyphenDemerits",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassDoubleHyphenDemeritsModel,
            ),
        ],
        [
            "finalHyphenDemerits",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassFinalHyphenDemeritsModel,
            ),
        ],
        [
            "adjDemerits",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassAdjDemeritsModel,
            ),
        ],
        [
            "exhaustedGapDemerits",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassExhaustedGapDemeritsModel,
            ),
        ],
        [
            "exhaustedGapEnPercent",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassExhaustedGapEnPercentModel,
            ),
        ],
        ["balanceGray", BooleanDefaultTrueOrEmptyModel],
        ["polish", BooleanDefaultTrueOrEmptyModel],
        [
            "latticeQuantum",
            _AbstractSimpleOrEmptyModel.createClass(
                KnuthPlassLatticeQuantumModel,
            ),
        ],
        ["colorCoding", KnuthPlassColorCodingOrEmptyModel],
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
        [
            "TextCompositionAlgorithmGreedyFitModel",
            "Greedy Fit",
            TextCompositionAlgorithmGreedyFitModel,
        ],
        [
            "TextCompositionAlgorithmKnuthPlassModel",
            "Knuth-Plass",
            TextCompositionAlgorithmKnuthPlassModel,
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
