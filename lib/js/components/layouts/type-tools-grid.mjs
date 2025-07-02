/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...


import {
    _AbstractStructModel
  // , _AbstractListModel
  , _AbstractNumberModel
  , _AbstractEnumModel
  , _AbstractGenericModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractDynamicStructModel
  , CoherenceFunction
  , StringModel
  , StaticDependency
  , getFieldsByType
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
} from '../basics.mjs';

import {
    collapsibleMixin
  , StaticNode
  , StaticTag
} from '../generic.mjs';

import {
    createDynamicModel
  , AvailableTypesModel
  , createGenericAvailableTypes
} from '../dynamic-types-pattern.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    AxesMathAxisLocationValueModel
  , AxesMathAxisLocationValuesModel
  , validateOpenTypeTagString
} from '../axes-math.mjs';

import {
    Model as ManualAxesLocationsModel
} from '../ui-manual-axis-locations.mjs';

import {
    FontSizeModel
} from '../actors/models.mjs';

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
const {
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
  , AxisTypeModel = _AbstractEnumModel.createClass('AxesMathAxisLogicalSymbolicLocationModel', [
        'font', 'exo'], 'exo')
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
      , defaultValue: 'unknown'
      , serializeFN: StringModel.serializeFN
      , deserializeFN: StringModel.deserializeFN
    })
  , FontAxisTagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(FontAxisTagModel)
  , ExoAxisTagOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(ExoAxisTagModel)
  , AxisSelectionModel = _AbstractStructModel.createClass(
        'AxisSelectionModel'
      , ['type', AxisTypeModel]
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
                    throw new Error(`NOT IMPLEMENTED AxisSelectionModel type: ${type.value}.`);
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
            defaultValue: 1
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
      , ['axis', AxisSelectionModel]
      , ['start', AxesMathAxisLocationValueModel]
      , ['end', AxesMathAxisLocationValueModel]
        // Or an ['stepping', SteppingModel] that included the following two?
      , ['stepping', SteppingModel]
      // , [reverse, BooleanFalse]
    )

  , ExplicitDimensionModel = _AbstractStructModel.createClass(
        'ExplicitDimensionModel'
      , ['axis', AxisSelectionModel]
      , ['values', AxesMathAxisLocationValuesModel]
      // , [reverse, BooleanFalse]
    )
    // , AxesSelectionModel = _AbstractListModel.createClass('AxesSelectionModel', AxisSelectionModel)
    // , CompoundDimensionModel = _AbstractStructModel.createClass(
    //     'CompoundDimensionModel'
    //   , ['axes', AxesSelectionModel]
    // )

    // Not specifying a "DisabledDimension" as: typeKeyName, ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL
    // should be sufficient to disable the dimension by just setting it to null/no type.
  , [availableDimensionSequenceTypes/*, DIMENSION_SEQUENCE_TYPE_TO_DIMENSION_SEQUENCE_TYPE_KEY */] = createGenericAvailableTypes([
        // Group: Special
        ['NULL', 'NULL-axis', NullDimensionModel] // no axis required, but steps from 1 to n (0 doesn't make sense)
        // Group Font and Exo Axes
      , ['Range', 'Element', RangeDimensionModel] // requires an axis, e.g.: from, to, amount of steps
      // , ['Curve', 'Stops on a Curve', CurveDimensionModel] // where range is linear this can be a curve, could also become a part of range!
      , ['Explicit', 'Explicit Stops', ExplicitDimensionModel] // requires an axis, like comma separated values, how to validate?
      // , ['Compound', 'Compound Dimension', CompoundDimensionModel]// combines and orchestrates other dimensions e,g, could make font-size and opsz move together
    ])
  , DIMENSION_X = 'dimensionX'
  , DIMENSION_Y = 'dimensionY'
  , DIMENSION_Z = 'dimensionZ'
  , TypeToolsGridModel = _BaseLayoutModel.createClass(
        'TypeToolsGridModel'
        // Could make this a dict of DimensionRangeModel e.g. x would be an
        // x-dimension. But since it's so specific what e.g. "X"-dimension
        // is supossed to mean (a horizontal expansion) and it'll be so
        // fundamental for the tool rendering the data, I think I can skip
        // the step of mapping a generic dimension name to x-dimension behavior.
        // Maybe, that'll come at some point, however.
      , [DIMENSION_X, DimensionSequenceModel]
      , [DIMENSION_Y, DimensionSequenceModel]
      , [DIMENSION_Z, DimensionSequenceModel]
        // alignment
        // line-height/leading
        // text-color
        // background-color
      , ['fontSize', FontSizeModel]
      , ['manualAxesLocations', ManualAxesLocationsModel]
        // This enables a DimensionSequence to contain other DimensionSequences
        // without circular dependency issues, as the list of availableDimensionSequenceTypes
        // is created and injected after the all types are defined.
        // This pattern evolved originally for type-spec-ramp "availableDocumentNodeTypes"
        // /"DocumentNodeModel".
      , ... StaticDependency.createWithInternalizedDependency(
            'availableDimensionSequenceTypes'
          , AvailableTypesModel
          , availableDimensionSequenceTypes
        )
    )
  ;

/**
 * Naming: TypeTensorController
 *   0D tensor: A single number, also called a scalar. ("Sample")
 *   1D tensor: A list of numbers—aka a vector. ("Waterfall", "Column", "Row")
 *   2D tensor: A matrix (rows and columns). ("Grid", "Column-Stack", "Row-Stack")
 *   3D tensor: A stack of matrices ("Cube").
 *   4D+ tensors: Layers upon layers—used in deep learning, physics, and complex simulations.
 *
 * This is supposed to be a controller for the
 *   - Waterfall: one dimension, default: size; Sample repeats in y direction,
 *     axes(size) increases.
 *   - Grid: two dimensions, default: opsz, wght; Sample repeats in x and
 *     y direction, while axes change
 *   - Cube: three dimensions, we are not yet certain how to make the UI
 *     for visualizing that cube.
 *   - Potentially, we could specify any amount of axes/dimensions but as
 *     for the cube, we don't have a concrete UI-vision for that
 *
 * The idea is that for as many dimensions as we control we have an
 * interface just like in the legacy "vartools-grid", but eventually
 * with more features, that is used to get a sequence of locations on
 * that axis/exo-parameter.
 *
 * The rest of the font axes and exo-parameters is to be controlled by
 * the "Manual Axis Locations" Interface or a successor.
 * The "Exo-parameters" that are not font axes include "font-size" that
 * is physical size, not opsz, but it could later be something else as
 * well. e.g. leading, blur(for e.g. readability examination?) or some other value.
 * This means, if any of these axes/exo-parameters are used as a dimension
 * their default control in "Manual Axis Locations" or the respective
 * controls for the exo-parameter are marked as inactive. The manual
 * axis locations dictionary can still contain an old unused value,
 * it's probably better to not clean it up, for the user experience,
 * but the control should be disabled, it might still show the other stored
 * value or be invisible.
 *
 * For the sake of sinplicity "Axis/Axes" is used to describe font-axes
 * and exo-parameters (exo-axes?) in this interface.
 *
 * So, we are dealing with two dictionaries:
 *  - Dimensions
 *  - Axis Locations
 *  and another loose collection of exo-parameters, like font-size etc.
 *  and this interface mainly must orchestrate the interface to change
 *  those values.
 *
 * Each dimension interface has:
 *   * an axis chooser
 *      - this only allow to select axes that are not selected by other
 *        dimensions.
 *      - the original grid interface has the choice of "disabled"
 *        which reduces the grid to a waterfall (or the equivalent in
 *        x/row expansion direction) and from that to an empty view
 *        CAUTION: the now empty view, without any dimension, should be
 *        a single field of the sample reducing the interface to a simple
 *        variable font sample tool. Much like the "Example" layout, but
 *        here with the ability to alter the sample as well, making it a
 *        more complete tool.
 *      - the "disabled" control could also be outside the selection,
 *        as a "delete this dimension" button, plus an "Add Dimension"
 *        button, which just adds another dimension interface. Thinking of
 *        this, maybe a NULL-axis could exist, that just doesn't change
 *        anything in it's dimension, just makes sure the dimension exists
 *        (so it should have a distinct number of steps).
 *      - the decision weather "disable" or "add/delete" are present seems
 *        to be highly depending of how we want to present this interface,
 *        we can either have four layouts: sample, waterfall, grid, cube
 *        or we can have a single layout (the prism?) which supports all
 *        of these modes (and potentially more that we don't know how to
 *        represent). A pure "grid" layout would have two axes of which
 *        one or two could be disabled.
 *      - It's also important to specify the direction of each dimension:
 *        (x, y, z) as e.g. with one axis, the difference between x and
 *        and y is a horizontal versus a vertical expansion.
 *      - thus, ideally the keys of the dimensions-dictionary are the names
 *        of the dimensions, hence, they are unique.
 *      - it would be nice to just define a set of allowed dimensions, that
 *        way it would be easy to upgrade or downgrade the prism.
 *      - Maybe this could be done in a hard way, using different structs
 *        with predefined axes, or it could be done in some purely date driven
 *        way (CAUTION THIS IS IMPORTANT TO DECIDE)
 *   * a way to chose discrete steps => this must be dynamic
 *      - [from] and [to] field with either `step-size` or `amount` as
 *        stepping parameter and respectiveley a field for `size` or `steps`
 *      - [from] and [to] should be switchable by a click of a button
 *        which is currently not the case, but it makes a lot of sense
 *        optically. Step size could be absolute (Math.abs) and the
 *        sign (positive or negative) is determined by the [from][to]
 *        direction. Note that with a `size` stepping, the inversion
 *        of [from]-[to] will result in different steps if there's a
 *        rest in the last step, when the step size is not fully
 *        resolving to the from value, hence, we should maybe also
 *        ask how to handle the "rest" (put it first, put it last)
 *        and we should display how big the rest is. Maybe the rendering
 *        UI should also be aware of this and mark the "rest" row/column
 *        to make it obvious.
 *      - a way to enter discrete values (comma separated) (could be
 *        repeated in a circle for an amount of steps)
 *      - a way/ways to define a curve (0 to 1) and an amount of samples
 *      - [from] and [to] can be preset from axis definitions, but it should
 *        be possible to also go outside of the axis range defined by a font
 *        for interoperability. Similarly, we should be able to use logical
 *        axis locations as well, as these are very interoperable by default.
 *      - The idea that we may not know the font we are setting up for should
 *        be present, but the default, initially, will be a well known font.
 *        So this interface should cope with both modes.
 *      - the exo-axis font-size (physical size) is defined as from 8 to 144
 *        in the legacy grid, but it should be possible to go beyond these
 *        values, although, so far, we would know how to handle negative
 *        values in this case. NOTE: principally, by the example of the
 *        `slnt`-axis, negative values are possible.
 *   * a way to switch dimensions: in the grid we can switch x <-> y
 *      in the cube we should be able to switch x <-> y, x <-> z,
 *      and y <-> z. More dimension, more complexity!
 *      The waterfall can't switch dimensions, the sample has no dimensions.
 *
 * A kind of cool tool would be to have different axis changing along in
 * on dimension. E.g. a color (or color component) and a font-axis. Allowing
 * to define alternating colors between odd and even axis, or background
 * changing along with a grade etc. But this would also seriously make the
 * interface harder to use. It could be seen as another dynamic item in
 * the stepping algorithm, especially, as we would require one stepping
 * to be used across these multiple axes in the same direction.
 */


 // => How to model the available dimensions?
 // Either: we say we have a "waterfall" and that only has a Y axis
 // And a Grid has "X" and "Y" (whereas both can be disabled so far, allowing
 // the Grid to become a waterfall and a sample!)
 //
 // If all axes are optional, we could still define an extra model for a
 // unique "waterfall" interface, that only allows for a single Y-axis,
 // and maybe the axis could be fixed. e.g. not allowed to be disabled.
 // but the complete prism interface would maybe have the most immersive
 // qualities.
 //
 // The "Grid/Tensor" should have presets:
 //   * No Dimension: "Sample"
 //   * Y: "Waterfall" ("Column")
 //   * X/Y : "Grid"
 //   * X/Y/Z: "Cube"
 // So far not named:
 //   * X: "Row"
 //   * Z: "Stack"
 //   * X/Z: "Row-Stack"
 //   * Y/Z: "Column-Stack"
 //
 // The waterfall preset would include to use font-size for the Y-dimension
 // The Grid would use x: opsz y: wght
 // A Cube would use the same as the Grid plus z: wdth
 // There should be "handlings" when those dimensions are not available,
 // e.g. fallbacks could include disabled or Null-axis, but first using
 // whatever axes are available, in order.
 // Switching presets could reset the Layout or try to keep some presets.
 // In the legacy app, switching between waterfall and grid would keep the
 // sample content. If we keep residue, we need a way to completeley reset
 // the thing. But also, as a user, it makes sense to be able to wander
 // through the options without loosing settings. So: presets are resets
 // just to different, tightly specified states.
 //
 // It should, at least in the full featured prism, be possible to change
 // from one dimension to another, e.g. from X-row configuration to Y-column
 // configuration. The legacy "grid" allows for that by using "disabled"
 // dimensions!
 //
 // => how to model the dynamic nature of the dimension values
 //     => this should be easier! As we already have examples for dynamic
 //        values!
 // the rendering UI has likely tighter requirements on the available
 // axes than the data editing UI.
 //
 // X axis: horizontal
 // Y axis: vertical
 // Z axis: depth, not implemented
 // any other axis: not implemented
class TypeTensorController extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        // run super first, so we can use `this` in the widgets definition.
        super(widgetBus, zones);
        this._availableDimemsions = this._determineAvailableDimensions();
        const widgets = [
            // one UIDimensionSequenceController per this._availableDimemsions
        ];
        this._initWidgets(widgets);
    }

    _determineAvailableDimensions() {
        const dimensionsHostEntry =  this.widgetBus.getEntry('dimensionsHost') // may be same as rootPath
          , TypeClass = dimensionsHostEntry instanceof _AbstractDynamicStructModel
                ? dimensionsHostEntry.WrappedType
                : dimensionsHostEntry.constructor
          ;
        // This interface can serve as many dimension interfaces as there
        // are dimension type fields it doesn't care about the semantic of
        // the key (x, y, z). The actual grid UI etc. has to be aware of
        // the key semantics.
        const availableDimemsions = [];// An ordered set would be ideal.
        for(const fieldname of getFieldsByType(TypeClass, DimensionSequenceModel))
            availableDimemsions.push(fieldname);
        return availableDimemsions;
    }
}

class TypeToolsGridController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const gridManagerContainer = widgetBus.domTool.createElement('fieldset', {'class': 'grid-manager'})
          , zones = new Map([..._zones
                , ['grid-manager', gridManagerContainer]
                ])
          ;
        // the linked stylePatchProperties@ plus typeSpecProperties@
        // widgetBus.wrapper.setProtocolHandlerImplementation(
        //     ...SimpleProtocolHandler.create('styleLinkProperties@'));
        super(widgetBus, zones);
        collapsibleMixin(gridManagerContainer, 'legend', true);
        const widgets = [
            //[
            //    {
            //        rootPath: widgetBus.rootPath
            //    }
            //    , [['stylePatchesSource', 'collection']]
            //    , StylePatchSourcesMeta
            //    , zones
            //]
            [
                {zone: 'main'}
              , []
              , StaticNode
              , gridManagerContainer
            ]
          , [
                {zone: 'grid-manager'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Grid'
            ]
          , [
                {}
              , [
                    ['.', 'dimensionsHost']
                ]
              , TypeTensorController
            ]
        ];
        this._initWidgets(widgets);
    }
    update(...args) {
        //this.widgetBus.wrapper.getProtocolHandlerImplementation('styleLinkProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        // this.widgetBus.wrapper.getProtocolHandlerImplementation('styleLinkProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export {
    TypeToolsGridModel as Model
  , TypeToolsGridController as Controller
};
