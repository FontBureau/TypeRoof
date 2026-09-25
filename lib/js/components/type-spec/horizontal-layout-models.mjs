import {
    _AbstractStructModel,
    _AbstractListModel,
    _AbstractNumberModel,
    _AbstractSimpleOrEmptyModel,
    _AbstractEnumModel,
    CoherenceFunction,
} from "../../metamodel.mjs";

import { createDynamicModel } from "../dynamic-types-pattern.mjs";

import {
    LengthValueModel,
    LengthValueOrEmptyModel,
    unitValuePairCoherenceFn,
    ABSOLUTE_UNITS,
} from "../length-models.mjs";

import { PercentNumberOrEmptyModel } from "../color.mjs";

export const ColumnCountModel = _AbstractNumberModel.createClass(
        "ColumnCountModel",
        { min: 1, defaultValue: 1, toFixedDigits: 0 },
    ),
    ColumnCountOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(ColumnCountModel),
    InlineLengthUnitModel = _AbstractEnumModel.createClass(
        "InlineLengthUnitModel",
        [...ABSOLUTE_UNITS, "em", "baseEm", "en", "baseEn"],
        "en",
    ),
    InlineLengthUnitOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(
        InlineLengthUnitModel,
    ),
    InlineLengthValueModel = _AbstractStructModel.createClass(
        "InlineLengthValueModel",
        ["value", LengthValueOrEmptyModel],
        ["unit", InlineLengthUnitOrEmptyModel],
        // Both set or both empty: a value without a unit is meaningless.
        unitValuePairCoherenceFn,
    ),
    ManualInlineMarginsModel = _AbstractStructModel.createClass(
        "ManualInlineMarginsModel",
        ["start", InlineLengthValueModel],
        ["end", InlineLengthValueModel],
    ),
    GutterPointModel = _AbstractStructModel.createClass(
        "GutterPointModel",
        ["columnWidth", LengthValueModel],
        ["gutter", LengthValueModel],
    ),
    LinearColumnGutterModel = _AbstractStructModel.createClass(
        "LinearColumnGutterModel",
        ["a", GutterPointModel],
        ["b", GutterPointModel],
        ["minGutter", LengthValueOrEmptyModel],
        ["maxGutter", LengthValueOrEmptyModel],
    ),
    ConstantColumnGutterModel = _AbstractStructModel.createClass(
        "ConstantColumnGutterModel",
        ["value", LengthValueModel],
    ),
    {
        ColumnGutterAlgorithmModel,
        createColumnGutterAlgorithm,
        deserializeColumnGutterAlgorithmModel,
    } = createDynamicModel("ColumnGutterAlgorithm", [
        ["constant", "Constant", ConstantColumnGutterModel],
        ["linear", "Linear", LinearColumnGutterModel],
    ]),
    GrowColumnsModeModel = _AbstractEnumModel.createClass(
        "GrowColumnsModeModel",
        ["false", "number", "infinity"],
        // Default: no growth. Growth is opt-in; a fresh runion is a
        // single padded column (margin control first).
        "false",
    ),
    GrowColumnsModeOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(GrowColumnsModeModel),
    // AxesMathAxisLocationValueModel is very similar
    // Quirk models scoped to this algorithm: 0 is meaningless both as
    // a column count and as a min line length, so these enforce >= 1
    // and default to 1 (the runion treats unset minLineLength as 1).
    GrowColumnsCountModel = _AbstractNumberModel.createClass(
        "GrowColumnsCountModel",
        {
            // Default 1: grow up to one column (matches the "number"
            // mode default — see GrowColumnsModeModel).
            defaultValue: 1,
            min: 1,
            // Not using max here, as the UI tries to display a range slider,
            // NOTE: However, this max rule would be reasonable and it's rather
            // the UI that should be fixed.
            // max: Number.MAX_SAFE_INTEGER,
            toFixedDigits: 0,
        },
    ),
    GrowColumnsCountOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(
        GrowColumnsCountModel,
    ),
    StrictlyPositiveLengthModel = _AbstractNumberModel.createClass(
        "StrictlyPositiveLengthModel",
        {
            defaultValue: 1,
            // EPSILON, not an arbitrary fraction: the contract is
            // "strictly positive", scale is the author's business.
            min: Number.EPSILON,
        },
    ),
    StrictlyPositiveLengthOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(StrictlyPositiveLengthModel),
    GrowColumnsModel = _AbstractStructModel.createClass(
        "GrowColumnsModel",
        ["mode", GrowColumnsModeOrEmptyModel],
        // only if logicalValue is "number" otherwise empty, default 0
        ["numericValue", GrowColumnsCountOrEmptyModel],
        CoherenceFunction.create(
            ["mode", "numericValue"],
            function initGrowColumns({ mode, numericValue }) {
                console.log(
                    "mode.isEmpty",
                    mode.isEmpty,
                    mode.isEmpty || mode.value,
                );
                if (mode.isEmpty || mode.value !== "number")
                    numericValue.clear();
                else {
                    // mode.value === 'number'
                    if (numericValue.isEmpty) {
                        console.log(
                            "numericValue.constructor.Model.defaultValue",
                            numericValue.constructor.Model.defaultValue,
                        );
                        numericValue.value =
                            numericValue.constructor.Model.defaultValue;
                    }
                }
            },
        ),
    ),
    // In varla-varfo, columnGap was coupled with the column width/count configuration.
    // Here, it is kept distinct to support a general linear or fixed-size algorithm.
    // A column-count-based gap config could be added later, but decoupling them now
    // provides much greater flexibility.
    LengthValueListModel = _AbstractListModel.createClass(
        "LengthValueListModel",
        LengthValueModel,
    ),
    HorizontalLayoutRunionModel = _AbstractStructModel.createClass(
        "HorizontalLayoutRunionModel",
        // all OrEmpty: per-instance overrides of the locale config
        // CAUTION: OrEmpty likely not complete
        // CAUTION: there is no locale config, but we can treat the
        // typeSpecnion tree as a locale config and use normal inheritance
        // as override mechanism, i.e. configure further up in the tree
        // and set empty here.

        // for the algorithm this should be in EN; 0 is meaningless,
        // so >= 1 (empty ≡ unset ≡ the runion's default of 1).
        ["minLineLength", StrictlyPositiveLengthOrEmptyModel],
        // Reserved padding floor (EN, default 0): subtracted from the
        // available width before solving, then re-added to the
        // remainder; distributed by paddingRatioStart.
        ["minPadding", LengthValueOrEmptyModel],

        // -> in En as well
        // or empty would have to be on simple values within the struct
        ["columnGutter", ColumnGutterAlgorithmModel],
        // OK, so we take only the percentage of the start and the end
        // is then 100 - paddingRatioStart, which is nice.
        // In the old varla-varfo I also think, this was never in EN
        // we could, howver, maybe also have min/max
        ["paddingRatioStart", PercentNumberOrEmptyModel],
        ["growColumns", GrowColumnsModel],
        // per-count maxes
        // Inheriting into the list is possible, but messy! what does it
        // even mean? we could try to inherit only if the list is empty
        ["columns", LengthValueListModel],
    ),
    ManualHorizontalLayoutModel = _AbstractStructModel.createClass(
        "ManualHorizontalLayoutModel",
        ["inlineMargins", ManualInlineMarginsModel],
        ["columnCount", ColumnCountOrEmptyModel],
        ["columnGutter", InlineLengthValueModel], // translates to CSS column-gap
        // this becomes column-width when columnCount is > 1
        ["lineLength", InlineLengthValueModel],
    ),
    {
        HorizontalLayoutAlgorithmModel,
        createHorizontalLayoutAlgorithm,
        deserializeHorizontalLayoutAlgorithmModel,
    } = createDynamicModel("HorizontalLayoutAlgorithm", [
        ["ManualHorizontalLayoutModel", "Manual", ManualHorizontalLayoutModel],
        [
            "HorizontalLayoutRunionModel",
            "Horizontal Layout Runion",
            HorizontalLayoutRunionModel,
        ],
    ]);
