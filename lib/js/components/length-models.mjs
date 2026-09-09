import {
    _AbstractEnumModel,
    _AbstractNumberModel,
    _AbstractSimpleOrEmptyModel,
    _AbstractStructModel,
    CoherenceFunction,
} from "../metamodel.mjs";

/**
 * Length: { value, unit } describing the size of a document
 * surface relative to the environment ('percent-screen'/'percent-
 * viewport'/'percent-layout') or absolute (css units). Environment
 * values are distributed via the 'environment@' protocol handler, all
 * sizes are css-px.
 *
 * A spec is considered UNSET when its unit is empty (the value is
 * meaningless then); both fields are OrEmpty because
 * _AbstractSimpleOrEmptyModel can only wrap _BaseSimpleModel (scalars),
 * not structs.
 */

const _PERCENT_UNIT_TO_ENVIRONMENT_KEY = new Map([
    ["percent-screen", "screen"],
    ["percent-viewport", "viewport"],
    ["percent-layout", "layout"],
]);

// css absolute units anchored at 96 px/in (the css-px of the browser).
export const ABSOLUTE_UNIT_TO_CSS_PX = {
        px: 1,
        pt: 96 / 72,
        cm: 96 / 2.54,
        mm: 96 / 25.4,
        in: 96,
    },
    ABSOLUTE_UNITS = Object.keys(ABSOLUTE_UNIT_TO_CSS_PX);

export const LENGTH_UNITS = [
        ...ABSOLUTE_UNITS,
        ..._PERCENT_UNIT_TO_ENVIRONMENT_KEY.keys(),
    ],
    LengthUnitModel = _AbstractEnumModel.createClass(
        "LengthUnitModel",
        LENGTH_UNITS,
        "percent-layout",
    ),
    LengthUnitOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(LengthUnitModel),
    LengthValueModel = _AbstractNumberModel.createClass("LengthValueModel", {
        defaultValue: 100,
        min: 0,
    }),
    LengthValueOrEmptyModel =
        _AbstractSimpleOrEmptyModel.createClass(LengthValueModel),
    // Both set or both empty: a value without a unit is meaningless.
    unitValuePairCoherenceFn = CoherenceFunction.create(
        ["value", "unit"],
        function checkLength({ value, unit }) {
            // matches lengthIsSet in so far as value follows
            // unit. This also means for the UX: when we unset the value
            // it resets to defaultValue, so that should rather be handled
            // with a specific UI, where we only offer one central toggle
            // for both units.
            if (!unit.isEmpty && value.isEmpty)
                value.value = value.constructor.Model.defaultValue;
            else if (unit.isEmpty && !value.isEmpty) value.clear();
        },
    ),
    LengthModel = _AbstractStructModel.createClass(
        "LengthModel",
        // This also raises the question in how far a value inherited without
        // a unit would ever make sense, but per coherence function, the value
        // can't be empty when the unit is not, we would always also inherit
        // the unit.
        ["value", LengthValueOrEmptyModel],
        ["unit", LengthUnitOrEmptyModel],
        // Both set or both empty: a value without a unit is meaningless.
        unitValuePairCoherenceFn,
    );

/** A spec is set iff its unit is set (value without unit is meaningless). */
export function lengthIsSet(spec) {
    return !spec.get("unit").isEmpty;
}

/**
 * Resolve a length to a css unit.
 *
 * length: a LengthModel struct (or null/undefined/unset -> null).
 * environmentValues: Map-ish {screen|viewport|layout: {width, height}}
 *       as published by the 'environment@' protocol handler. Only
 *       required for percent units.
 * dimension: 'width' | 'height' — which box dimension to resolve
 *       percent units against.
 *
 * Returns a number (css-px) or null for an unset length.
 */
export function cssUnitConvert(value, sourceUnit, targetUnit = "px") {
    if (!(sourceUnit in ABSOLUTE_UNIT_TO_CSS_PX))
        throw new Error(
            `VALUE ERROR sourceUnit is "${sourceUnit}" but ` +
                `must be one of ${Object.keys(ABSOLUTE_UNIT_TO_CSS_PX).join(", ")}`,
        );
    if (!(targetUnit in ABSOLUTE_UNIT_TO_CSS_PX))
        throw new Error(
            `VALUE ERROR targetUnit is "${targetUnit}" but ` +
                `must be one of ${Object.keys(ABSOLUTE_UNIT_TO_CSS_PX).join(", ")}`,
        );
    const targetFactor = ABSOLUTE_UNIT_TO_CSS_PX[targetUnit],
        sourceFactor = ABSOLUTE_UNIT_TO_CSS_PX[sourceUnit];
    return (value * sourceFactor) / targetFactor;
}

export function environmentToCSSUnit(
    getEnvironmentFn,
    value,
    sourceUnit,
    dimension,
    targetUnit = "px",
) {
    if (!_PERCENT_UNIT_TO_ENVIRONMENT_KEY.has(sourceUnit))
        throw new Error(
            `VALUE ERROR sourceUnit is "${sourceUnit}" but ` +
                `must be one of ${[..._PERCENT_UNIT_TO_ENVIRONMENT_KEY.keys()].join(", ")}`,
        );
    if (!(targetUnit in ABSOLUTE_UNIT_TO_CSS_PX))
        throw new Error(
            `VALUE ERROR targetUnit is "${targetUnit}" but ` +
                `must be one of ${Object.keys(ABSOLUTE_UNIT_TO_CSS_PX).join(", ")}`,
        );
    const targetFactor = ABSOLUTE_UNIT_TO_CSS_PX[targetUnit],
        environmentKey = _PERCENT_UNIT_TO_ENVIRONMENT_KEY.get(sourceUnit),
        environmentValue = getEnvironmentFn(environmentKey, dimension);
    return ((value / 100) * environmentValue) / targetFactor;
}

export function toCSSUnit(
    getEnvironmentFn,
    value,
    sourceUnit,
    dimension,
    targetUnit = "px",
) {
    if (sourceUnit in ABSOLUTE_UNIT_TO_CSS_PX)
        return cssUnitConvert(value, sourceUnit, targetUnit);
    if (_PERCENT_UNIT_TO_ENVIRONMENT_KEY.has(sourceUnit))
        return environmentToCSSUnit(
            getEnvironmentFn,
            value,
            sourceUnit,
            dimension,
            targetUnit,
        );
    throw new Error(
        `VALUE ERROR don't know how to handle sourceUnit "${sourceUnit}".`,
    );
}

export function lengthToCSSUnit(
    getEnvironmentFn,
    length,
    dimension,
    targetUnit = "px",
) {
    if (!lengthIsSet(length)) return null;
    if (length.isDraft)
        // we get rid of a lot of defensive programming by ensuring the
        // coherence functions have executed.
        throw new Error(`LIFECYCLE ERROR length must not be a draft!`);
    const value = length.get("value").value,
        unit = length.get("unit").value;
    return toCSSUnit(getEnvironmentFn, value, unit, dimension, targetUnit);
}

/**
 * Resolve a length to css-px.
 *
 * length: a LengthModel struct (or null/undefined/unset -> null).
 * environmentValues: Map-ish {screen|viewport|layout: {width, height}}
 *       as published by the 'environment@' protocol handler. Only
 *       required for percent units.
 * dimension: 'width' | 'height' — which box dimension to resolve
 *       percent units against.
 *
 * Returns a number (css-px) or null for an unset length.
 */
export function lengthToCSSPX(length, environmentValues, dimension) {
    const getEnvironmentFn = (environmentKey, dim) =>
        environmentValues[environmentKey][dim];
    return lengthToCSSUnit(getEnvironmentFn, length, dimension, "px");
}
