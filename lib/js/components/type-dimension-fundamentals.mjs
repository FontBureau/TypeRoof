import {
    _AbstractStructModel
  // , _AbstractListModel
  , _AbstractNumberModel
  , _AbstractEnumModel
  , _AbstractGenericModel
  , _AbstractSimpleOrEmptyModel
  , CoherenceFunction
  , StringModel
} from '../metamodel.mjs';


import {
    createDynamicModel
  , createGenericAvailableTypes
} from './dynamic-types-pattern.mjs';


import {
    AxesMathAxisLocationValueModel
  , AxesMathAxisLocationValuesModel
  , validateOpenTypeTagString
} from './axes-math.mjs';

// FIXME: Consider explicitly including the term "discrete" in the name
// and/or documentation of this module. The term "dimension" alone may
// imply a continuous range, but this module  intentionally transforms continuous
// axes or dimensions into discrete steps.


    /**
     * This is a dynamic type!
     *
     * Special Axes are:
     *   - disabled
     *   - NULL-axis (defines an amount of steps, doesn't change anything)
     * Exo-Axis are so far:
     *   - fontSize
     * font axes are:
     *   a correctly tagged key
     *   values that are either logical (min, default, max) or absolute numbers
     *   it would be good, if we knew the font, to allow using the actual axes
     *   to inform the ui/sliders
     *
     * This is called a sequence to make it clear that all we expect is
     * values appropriate (in type, maybe in size) for the axis they belong
     * to. Technically, an empty sequence should probably behave the same
     * as a "disabled" axis, but it's not totally clear what a disabled
     * axes actually means. e.g. To go down from a cube to a sample the
     * semantic dimension size is actual 1 not 0. 0 is not a thing!
     * Technically, if we have a 0-size axis or a "disabled" axis, we
     * probably rather fall back to other (default) means of creating
     * the missing dimension, e.g. "disabled" or "empty sequence" could
     * be equal to the 1-item NULL-axis. And that would e.g. for a
     * font-axis mean we fall-back to the value in the local manualAxesLocations
     * and if that is empty to the font default value of the axis.
     * And, since we are going to feed this into the PPS that's maybe the
     * right place to ask for the fallback values.
     * The parameters for the alogrithms to create these sequence are
     * going to be created here, but the creation of the sequences will
     * happen in PPS. That way, the PPS logic can decide how to treat an
     * empty sequence. Assuming eventually the default value of the axis
     * is going to be suffcient.
     * To re-implement the existing grid, we are going to need a rather
     * straight forward range algorithm.
     */
export const {
        DimensionSequenceModel
      //, createDimensionSequenceModel
      // , deserializeDimensionSequenceModel
    } = createDynamicModel('DimensionSequence')
    // We're not going down the generic dimension route, as the consuming,
    // rendering ui will likely not be able to do much with dimensions that
    // are not x,y,z
    // However, potentially, a DimensionSequencesModel could be useful!
    // , DimensionSequencesModel = _AbstractOrderedMapModel.createClass('DimensionSequencesModel', DimensionSequenceModel)
    // actual data modelling:
  , GridAxisTypeModel = _AbstractEnumModel.createClass('GridAxisTypeModel', [
        'font', 'exo'], 'font')
    // Both Font|Exo-AxisTagModel are very similar to StringModel
  , FontAxisTagModel = _AbstractGenericModel.createClass('FontAxisTagModel', {
        sanitizeFN: StringModel.sanitizeFN
      , validateFN: function(value) {
            if(typeof value !== 'string')
                return [false, `value is not typeof string: ${typeof value} (${value})`];
            return validateOpenTypeTagString(value);
        }
        // Likely never an actual axis tag, as it's all lowercase it would
        // have to be registered in the open type spec.
      , defaultValue: 'ukwn'
      , serializeFN: StringModel.serializeFN
      , deserializeFN: StringModel.deserializeFN
    })
  , ExoAxisTagModel = _AbstractGenericModel.createClass('ExoAxisTagModel', {
        sanitizeFN: StringModel.sanitizeFN
      , validateFN: StringModel.validateFN
      , defaultValue: 'fontSize'
      , serializeFN: StringModel.serializeFN
      , deserializeFN: StringModel.deserializeFN
    })
  , FontAxisTagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(FontAxisTagModel)
  , ExoAxisTagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(ExoAxisTagModel)
  , GridAxisSelectionModel = _AbstractStructModel.createClass(
        'GridAxisSelectionModel'
      , ['type', GridAxisTypeModel]
        // maybe two types of values
        // depending on the type: ??
        // fontAxisTagValueOrEmpty
        // exoAxisTagValueOrEmpty
      , ['fontAxisTagValue', FontAxisTagOrEmptyModel]
      , ['exoAxisTagValue', ExoAxisTagOrEmptyModel]
        // could have a coherence function that checks if axisTag is
        // valid for the font-type (opentype tag rules) or valid for
        // the exo-type (not empty string after trim??)
        // We should not, at this point, need to check if the axis exists or
        // what the constraints are, as we rather don't know the font or
        // the existing exo-axes. Exo-axes could be known, but we can also
        // treat them like we don't know, keeping this simpler and the treatment
        // for font and exo similar.
        , CoherenceFunction.create(
            ['type', 'fontAxisTagValue', 'exoAxisTagValue']
          , function checkValues({type, fontAxisTagValue, exoAxisTagValue}) {
                const setValues=(usedValue, ...unusedValues)=>{
                    if(usedValue.isEmpty)
                        usedValue.value = usedValue.constructor.Model.defaultValue;
                    for(const unusedValue of unusedValues)
                        unusedValue.clear();
                }
                if(type.value === 'font')
                    setValues(fontAxisTagValue, exoAxisTagValue);
                else if(type.value === 'exo')
                    setValues(exoAxisTagValue, fontAxisTagValue);
                else
                    throw new Error(`NOT IMPLEMENTED GridAxisSelectionModel type: ${type.value}.`);
            }
        )
    )
    // We don't interpret this as amount of "steps" but as amount of range items
    // i.e. amount 1 on x will create one column and ammount 2 on x will create two columns
    // otherwise, if we go "amount of steps" it 0 would mean 1 column (a step is connecting two
    // two items), and 1 would mean two items. However, this is rather confusing
    // as a user.
    // step size also can't be 0, as that would create infinity it must have a size to move
  , AmountNumberModel = _AbstractNumberModel.createClass(
        'AmountNumberModel'
      , {
            // INTERESTING: for the Range Model a default of 2 is good
            // but for the NULL Model it would be a default of 1
            // maybe we can better regulate this with the default-map?
            defaultValue: 2 // includes start and end
          , min: 1
          , max: Number.MAX_SAFE_INTEGER
          , toFixedDigits: 0
        }
    )
  , AmountNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(AmountNumberModel)
    // A zero size is problematic, as it would make the range infinitely
    // large, as there's no change moving the current value.
    // So this could be all real numbers except zero.
    // On the other hand, we could also just treat it as an absolute Number(Math.abs)
    // and the sign could be determined by comparing start and end, i.e.
    // the sign is the direction to go, the size is the same in any case!
  , StepSizeNumberModel = _AbstractNumberModel.createClass(
        'StepSizeNumberModel'
      , {
            defaultValue: 1 // Probably not a good step-size for all the cases.
            // The Number.MIN_VALUE static data property represents the smallest positive numeric value representable in JavaScript.
          , min: Number.MIN_VALUE
          , max: Number.MAX_VALUE
            // This runs before the min/max builtin sanitation.
          , sanitizeFN: value=>[Math.abs(value), null]
        }
    )
  , StepSizeNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(StepSizeNumberModel)
  , NullDimensionModel = _AbstractStructModel.createClass(
        'NullDimensionModel'
      , ['amountValue', AmountNumberModel] // Integer, 1 to MAX_STEPS (Infinity?)
    )
  , SteppingTypeModel = _AbstractEnumModel.createClass('SteppingTypeModel', ['amount', 'stepSize'], 'amount')
  , SteppingModel = _AbstractStructModel.createClass(
        'SteppingModel',
        ['type', SteppingTypeModel]
      , ['amountValue', AmountNumberOrEmptyModel] // Integer, >= 1
      , ['stepSizeValue', StepSizeNumberOrEmptyModel] // float, Math.abs and > 0
      , CoherenceFunction.create(
            ['type', 'amountValue', 'stepSizeValue']
          , function checkValues({type, amountValue, stepSizeValue}) {
                const setValues=(usedValue, ...unusedValues)=>{
                    if(usedValue.isEmpty)
                        usedValue.value = usedValue.constructor.Model.defaultValue;
                    for(const unusedValue of unusedValues)
                        unusedValue.clear();
                }
                if(type.value === 'amount')
                    setValues(amountValue, stepSizeValue);
                else if(type.value === 'stepSize')
                    setValues(stepSizeValue, amountValue);
                else
                    throw new Error(`NOT IMPLEMENTED SteppingModel type: ${type.value}.`);
            }
        )
    )
  , RangeDimensionModel = _AbstractStructModel.createClass(
        'RangeDimensionModel'
      , ['axis', GridAxisSelectionModel]
      , ['start', AxesMathAxisLocationValueModel]
      , ['end', AxesMathAxisLocationValueModel]
      , ['stepping', SteppingModel]
      // , [reverse, BooleanFalse]
    )
  , ExplicitDimensionModel = _AbstractStructModel.createClass(
        'ExplicitDimensionModel'
      , ['axis', GridAxisSelectionModel]
      , ['values', AxesMathAxisLocationValuesModel]
      // , [reverse, BooleanFalse]
    )
    // , GridAxesSelectionModel = _AbstractListModel.createClass('GridAxesSelectionModel', GridAxisSelectionModel)
    // , CompoundDimensionModel = _AbstractStructModel.createClass(
    //     'CompoundDimensionModel'
    //   , ['axes', GridAxesSelectionModel]
    // )

    // Not specifying a "DisabledDimension" as: typeKeyName, ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL
    // should be sufficient to disable the dimension by just setting it to null/no type.
  , [availableDimensionSequenceTypes/*, DIMENSION_SEQUENCE_TYPE_TO_DIMENSION_SEQUENCE_TYPE_KEY */] = createGenericAvailableTypes([
        // Group: Special
        ['NULL', 'NULL-axis', NullDimensionModel] // no axis required, but steps from 1 to n (0 doesn't make sense)
        // Group Font and Exo Axes
      , ['Range', 'Range', RangeDimensionModel] // requires an axis, e.g.: from, to, amount of steps
      // , ['Curve', 'Stops on a Curve', CurveDimensionModel] // where range is linear this can be a curve, could also become a part of range!
      , ['Explicit', 'Explicit Stops', ExplicitDimensionModel] // requires an axis, like comma separated values, how to validate?
      // , ['Compound', 'Compound Dimension', CompoundDimensionModel]// combines and orchestrates other dimensions e,g, could make font-size and opsz move together
    ])
  , DIMENSION_X = 'dimensionX'
  , DIMENSION_Y = 'dimensionY'
  , DIMENSION_Z = 'dimensionZ'
  , DIMENSION_TO_LABEL = new Map([
        [DIMENSION_X, 'X-Dimension']
      , [DIMENSION_Y,  'Y-Dimension']
      , [DIMENSION_Z, 'Z-Dimension']
    ])
  , DIMENSIONS=new Set(DIMENSION_TO_LABEL.keys())
  ;

export function dimension2Label(key) {
    return DIMENSION_TO_LABEL.has(key)
            ? DIMENSION_TO_LABEL.get(key)
            : key
            ;
}

