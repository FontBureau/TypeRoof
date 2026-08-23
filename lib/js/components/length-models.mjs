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

export const LENGTH_UNITS = [
        "px",
        "pt",
        "cm",
        "mm",
        "in",
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
    LengthModel = _AbstractStructModel.createClass(
        "LengthModel",
        // This also raises the question in how far a value inherited without
        // a unit would ever make sense, but per coherence function, the value
        // can't be empty when the unit is not, we would always also inherit
        // the unit.
        ["value", LengthValueOrEmptyModel],
        ["unit", LengthUnitOrEmptyModel],
        // Both set or both empty: a value without a unit is meaningless.
        CoherenceFunction.create(
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
    );

/** A spec is set iff its unit is set (value without unit is meaningless). */
export function lengthIsSet(spec) {
    return !spec.get("unit").isEmpty;
}

// css absolute units anchored at 96 px/in (the css-px of the browser).
const _ABSOLUTE_UNIT_TO_CSS_PX = {
    px: 1,
    pt: 96 / 72,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
};

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
    if (!lengthIsSet(length)) return null;
    if (length.isDraft)
        // we get rid of a lot of defensive programming by ensuring the
        // coherence functions have executed.
        throw new Error(`LIFECYCLE ERROR length must not ne a draft!`);
    const value = length.get("value").value,
        unit = length.get("unit").value;
    if (unit in _ABSOLUTE_UNIT_TO_CSS_PX)
        return value * _ABSOLUTE_UNIT_TO_CSS_PX[unit];
    const environmentKey = _PERCENT_UNIT_TO_ENVIRONMENT_KEY.get(unit),
        box = environmentValues[environmentKey];
    return (value / 100) * box[dimension];
}
