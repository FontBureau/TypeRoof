import {
    _AbstractDynamicStructModel
  , _AbstractEnumModel
  , _AbstractStructModel
  , StaticDependency
  , getFieldsByType
  , Path
  , ForeignKey
  , FreezableMap
  , FreezableSet
  , InternalizedDependency
  , StringModel
//  , deserializeSync
//  , SERIALIZE_OPTIONS
//  , SERIALIZE_FORMAT_OBJECT
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseComponent
  , _BaseDynamicCollectionContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_NO_UPDATE
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    DATA_TRANSFER_TYPES
} from '../data-transfer-types.mjs';

import {
    Collapsible
  , StaticTag
  , GenericSelect
  , UILineOfTextInput
  , UINumberInput
  , WasteBasketDropTarget
  , UINumberAndRangeOrEmptyInput
  , UISelectInput
} from '../generic.mjs';

import {
    AvailableTypesModel
} from '../dynamic-types-pattern.mjs';

import {
    DIMENSION_X
  , DIMENSION_Y
//  , DIMENSION_Z
  , DIMENSIONS
  , dimension2Label
  , DimensionSequenceModel
  , availableDimensionSequenceTypes
  , RangeDimensionModel
  , GridAxisSelectionModel
  , FontAxisTagModel
  , ExoAxisTagModel
  , SteppingModel
  , AmountNumberModel
  , StepSizeNumberModel
} from '../type-dimension-fundamentals.mjs';

import {
    AxesMathAxisLocationValueModel
  , AxesMathAxisLocationValuesModel
  , UIAxesMathLocationValue
  , UIAxesMathLocationValues
} from '../axes-math.mjs';

import {
    _BaseTypeDrivenContainerComponent
  , createTypeToUIElementFunction
  , require
} from '../type-driven-ui-basics.mjs';

import {
    genericTypeToUIElement
  , UITypeDrivenContainer
} from '../type-driven-ui.mjs';

import {
    UIshowProcessedProperties
} from '../processed-properties.mjs'

import {
    UIColorChooser
} from '../ui-color-chooser.mjs';

import {
    GENERIC
  , DIMENSION
  , COLOR
  , SPECIFIC
  , LEADING
  , ProcessedPropertiesSystemMap
  , getPropertiesBroomWagonGen
} from '../registered-properties-definitions.mjs';

import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';

import {
    _BaseLayoutModel
  , InstalledFontModel
} from '../main-model.mjs';

import {
    manualAxesLocationsModelMixin
  , UIManualAxesLocations
} from '../ui-manual-axis-locations.mjs';

import {
    typographyKeyMomentPureModelMixin
  , openTypeFeaturesModelMixin
} from '../actors/models.mjs';

import {
    getColorFromPropertyValuesMap
  , colorsGen
  , ColorModel
  , culoriToColor
} from '../color.mjs';

import {
    LocalScopeTypeSpecnion
  , axisLocationsGen
  , TypeSpecLiveProperties
  , SyntheticValue
} from './type-spec-ramp.typeroof.jsx';

import {
//    getPropertyValue
    actorApplyCSSColors
//  , actorApplyCssProperties
  //, DYNAMIC_MARKER
  //, cssPositioningHorizontalPropertyExpander
  , setTypographicPropertiesToSample
} from '../actors/properties-util.mjs';



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

const GRID_CONTENT_OPTIONS = new Map([
        ['A-Z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
      , ['a-z', 'abcdefghijklmnopqrstuvwxyz']
      , ['0-9', '0123456789']
      , ['custom', null]
      // I'd like to load a custom value for this from the registered-properties
      // type: 'custom' with a customText: 'H'
    ])
  , _grid_content_options_keys = Array.from(GRID_CONTENT_OPTIONS.keys())
  , GridContentTypeModel = _AbstractEnumModel.createClass('GridContentTypeModel',
        _grid_content_options_keys, _grid_content_options_keys.at(0))
  , GridContentModel = _AbstractStructModel.createClass(
        'GridContentModel'
       , ['type', GridContentTypeModel]
       , ['customText', StringModel]
    )
  , GridPropertiesModel = _AbstractStructModel.createClass(
        'GridPropertiesModel'
        // Could make this a dict of DimensionRangeModel e.g. x would be an
        // x-dimension. But since it's so specific what e.g. "X"-dimension
        // is supossed to mean (a horizontal expansion) and it'll be so
        // fundamental for the tool rendering the data, I think I can skip
        // the step of mapping a generic dimension name to x-dimension behavior.
        // Maybe, that'll come at some point, however.
      , [DIMENSION_X, DimensionSequenceModel]
      , [DIMENSION_Y, DimensionSequenceModel]
//      , [DIMENSION_Z, DimensionSequenceModel]
        // alignment
        // line-height/leading
        // text-color
        // background-color
      , ...typographyKeyMomentPureModelMixin
      , ...openTypeFeaturesModelMixin
      , ...manualAxesLocationsModelMixin
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
        // so far, only inherit the global font
      , ['font', new InternalizedDependency('font', InstalledFontModel)]
    )
  , TypeToolsGridModel = _BaseLayoutModel.createClass(
        'TypeToolsGridModel'
      , ['properties', GridPropertiesModel]
        // could be more complex, with a few presets and `custom` would
        // make user input possible
      , ['content', GridContentModel]
    )
  ;

/*
function deserializeGridContentModel(dependencies, data) {
     const serializeOptions = Object.assign({}, SERIALIZE_OPTIONS, {format: SERIALIZE_FORMAT_OBJECT});
    return deserializeSync(GridContentModel, dependencies, data, serializeOptions);
}
*/

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


// FIXME: This is a very dirty function, without a lot of reasoning,
// especially because of a lack of purpose for the ppsMap. However,
// so far, we use it to inject labels into the type-driven generated UI.
//
// GridAxisSelectionModel, SteppingModel
// This is a stub, we'll likeley need to make these more specific
// e.g. is the prefix usable???
// these are internal to the DimensionSequenceModel.instance
// GridAxisSelectionModel is in ExplicitDimensionModel and RangeDimensionModel
// SteppingModel is in RangeDimensionModel
// ExplicitDimensionModel, NullDimensionModel
export function getPPSMapForModel(parentPPSRecord, FieldType) {
    const entries = [];
    console.log(`------->getPPSMapForModel=====>${FieldType.name} in ${parentPPSRecord}`);
    // > getGridAxisSelectionPPSMap GridAxisSelectionModel, parentPPSRecord:<ProcessedPropertiesSystemRecord dimension/dimensionX/axis generic/,axis> type-tools-grid.mjs:465:13
    for(const [modelFieldName, modelFieldType ] of FieldType.fields.entries()) {
        let prefix = GENERIC// not sure about thos
          , fullKey = null
          , registryKey = null
          ;
        if (FieldType === SteppingModel)
            // this is so far without real reasoing
            prefix = DIMENSION;

        if(modelFieldName === 'amountValue') // AmountNumberModel or AmountNumberOrEmptyModel
            // NullDimensionModel has amountValue as AmountNumberModel
            // SteppingModel has amountValue as AmountNumberOrEmptyModel
            prefix = DIMENSION;

        if(FieldType === GridAxisSelectionModel && modelFieldName === 'type') {
            // modelFieldName === 'type' modelFieldType === GridAxisTypeModel
            prefix = DIMENSION;
            // works to pull the label from
            // [DIMENSION]['gridAxisType'] "Axis Type"
            registryKey = 'gridAxisType';
        }
        else if(modelFieldType === GridAxisSelectionModel) {
            // modelFieldName === 'type' modelFieldType === GridAxisTypeModel
            prefix = DIMENSION;
            // works to pull the label from
            // [DIMENSION]['gridAxisType'] "Axis Type"
            registryKey = 'gridAxisSelection';
        }
        else if(FieldType === RangeDimensionModel && (modelFieldName === 'start' || modelFieldName === 'end')){
            prefix = DIMENSION;
            registryKey = modelFieldName;
        }
        // propertyKey
        fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        const entry = [
            modelFieldName
          , ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName, fullKey, registryKey)
        ];
        entries.push(entry);
        console.log(`::: ${modelFieldName}: ${entry[1]} (${FieldType.name})`);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}


// This is basically copied from type-spec-ramp `getTypeSpecPPSMap` (TypeSpecModel)
// and adopted for TypeToolsGridModel, however, maybe not a very good match,
// as TypeToolsGridModel is a _BaseLayoutModel while TypeSpecModel is not!
// But maybe, this model/kind of model will eventually rather be contained
// like an actor or as an actor. It feels correct to treat it this way.
//
// ALSO: that model is rendered using a UITypeDrivenContainer while
// this is not. BUT, the ppsMap has so far a double usage here. And
// since that is not fully resolved we do this for the defaults/live-properties
// stuff.
const _excludesTypeToolsGridPPSMap = new Set([
    // I did not sanity check this, it's just copy pasta
    'autoOPSZ' // => UIManualAxesLocations has a control for autoOPSZ.
]);
function getGridPropertiesPPSMap(parentPPSRecord, Type) {
    const entries = [];
    for(const [modelFieldName, modelFieldType] of Type.fields.entries()) {
        let prefix = GENERIC
          , fullKey = null
          , registryKey = null
          ;
        // This case is not used, it's a stub, left over from another
        // similar function and put into the parentPPSRecord condition
        // which is currently called nowhere. But the goal is to find
        // a general form for this kind of function.
        if(parentPPSRecord)
            // propertyKey
            fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        // else: `${propertyRoot}${fieldName}`
        if(_excludesTypeToolsGridPPSMap.has(modelFieldName))
            prefix = null;
        else if(modelFieldName === 'axesLocations')
            // we should use a symbol here!
            prefix = 'axesLocations/';
        else if(modelFieldType === DimensionSequenceModel)
            prefix = DIMENSION;
        else if(modelFieldType === ColorModel)
            prefix = COLOR;
        //else if (modelFieldName === 'content') {
        //    registryKey = `gridContent`
        //}

        if(prefix === null)
            // don't make a UI for this
            continue;

        const entry = [
            modelFieldName
          , ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName,  fullKey, registryKey)
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}
const GRID_PROPERTIES_PPS_MAP = getGridPropertiesPPSMap(null, GridPropertiesModel);
console.log('GRID_PROPERTIES_PPS_MAP ...')
for(const [key, value] of GRID_PROPERTIES_PPS_MAP)
    console.log(`... ${key}: ${value}`);

/**
 * There is a desire to add a LiveProperties system:
 * - like in the type-spec, there's a way to define the defaults as a parent layer of the grid
 * - the grid could be included as e.g. an actor (i.e. replacing the parent
 *   default values partially with values from an layer-actor-container)
 * - there's a common way to write a rendering UI, using the LiveProperies values.
 */




/**
 * There's an example for this kind of Container:
 *      UILeadingAlgorithm extends _BaseDynamicCollectionContainerComponent
 * There should probably be a common _BaseClass as it seems a useful concept
 * doing, the duplication for a while longer though, to capture the nuances
 * and to find a better common sweet spot.
 *
 * CAUTION: also observe the Mixin of _BaseTypeDrivenContainerComponent
 * after the class definition.
 */
class UIDimensionSequence extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, _zones, injectable, ppsRecord, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui-dimension_sequence'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);
        // this.element = localZoneElement;
        this._injectable = injectable;
        this._ppsRecord = ppsRecord;
        this._label = label;
        // This is the same as in UILeadingAlgorithm
        {
            const widgets = this._initialWidgets;
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets); // put widgetWrappers into this._widgets
        }
    }

    // As an interface, this is also similarly in UILeadingAlgorithm
    get _initialWidgets() {
        const widgets = [
            // Maybe this label should be optional.
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'legend' //
              , {}
              , [this._label]
            ]
          , [
                {
                    zone: 'local'
                }
              , [
                    ['availableDimensionSequenceTypes', 'options']
                  , ['dimensionSequenceTypeKey', 'value']
                ]
              , GenericSelect
              , 'ui-dimension_sequence-select'// baseClass
              , 'Type'// labelContent
              , (key, availableType)=>{ return availableType.get('label').value; } // optionGetLabel
              , [true, '(disabled)', ForeignKey.NULL] // [allowNull, allowNullLabel, nullModelValue]
                // This could try to convert the previous algorithm type
                // to this, but that seems at the moment complex for
                // some combinations.
                // Called within _changeState.
              , this._changeTypeHandler.bind(this/*, this._injectable.getDefaults, this._ppsRecord*/) // onChangeFn(newValue)
            ]
        ]
        ;
        return widgets;
    }

    // This is based on a copy from UILeadingAlgorithm
    _provisionWidgets() {
        const removedDynamicWidgets = this._widgets.splice(this._initialWidgetsAmount, Infinity);
        // Run _BaseContainerComponent._provisionWidgets this for the
        // initial/reguluar widgets. NOTE: _BaseDynamicCollectionContainerComponent
        // does not inherit from _BaseContainerComponent, thus we can't call
        // super. But the implementation is OK.
        const requiresFullInitialUpdate = _BaseContainerComponent.prototype._provisionWidgets.call(this);
        const host = this.getEntry('.')
          , dynInstance = host.get('instance')
          , FieldType = dynInstance.hasWrapped
                            ? dynInstance.WrappedType
                            : null
           ;

        if(FieldType === null) {
            // pass
            // Will remove all dynamic widgets.
        }
        else if(this._ActiveInstanceType === FieldType) {
            // don't change
            this._widgets.push(...removedDynamicWidgets);
            removedDynamicWidgets.splice(0, Infinity);
        }
        else { // this._ActiveInstanceType !== FieldType
            const ppsMap = getPPSMapForModel(this._ppsRecord, FieldType)
              , widgetDefinitions = this._defineGenericWidgets(
                    FieldType
                  , fieldName=>FieldType.fields.has(fieldName) // basically all allowed
                  , {zone: 'local', rootPath: this.widgetBus.rootPath.append('instance')}
                  , ppsMap
                  , this._injectable
                )
              ;
            // FIXME: I don't think these are yet very helpful!
            // the ppsMap has the UIs built because they are mentioned,
            // but the record contents wouldn't help much to identify these.

            this._initWidgets(widgetDefinitions); // pushes into this._widgets
        }
        this._ActiveInstanceType = FieldType;
        for(const widgetWrapper of removedDynamicWidgets)
            this._destroyWidget(widgetWrapper);
        for(const widgetWrapper of this._widgets.slice(this._initialWidgetsAmount)) {
            const isActive = widgetWrapper.widget !== null;
            if(!isActive) {
                // if new, initialize ..
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }

    _changeTypeHandler(...args) {
        console.log(`${this}._changeTypeHandler (${this.widgetBus.rootPath}) ...args:`, ...args);
    }
}
// Like a Mixin
for(const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(
                            _BaseTypeDrivenContainerComponent.prototype))) {
    if(!Object.hasOwn(UIDimensionSequence.prototype, name))
        Object.defineProperty(UIDimensionSequence.prototype, name, desc);
}

// depending on the value if axis->type
// dimension/dimensionX/axis/type
// we want to change
// GridAxisSelectionModel => UITypeDrivenContainer
//
// Either we can instruct that  UITypeDrivenContainer to inject these
// activationTests into the interfaces for the sub-types or we use an
// extended version of UITypeDrivenContainer
// injectable.genericTypeToUIElement(FieldType);
// could be used to inject special behavior
// when FontAxisTagOrEmptyModel or ExoAxisTagOrEmptyModel are to be configures
// though! since both are empty when unused and not empty when used
// ...

// Currently UIAxesMathLocationValues is used to represent
// ExplicitDimensionModel.value(AxesMathAxisLocationValuesModel)
// but, there needs to be a [+] button (maybe with drag) and a waste-basket
// ui. To create and delete the items (AxesMathAxisLocationValueModel)
// This is probably not an ideal interface, but it is the quickest to achieve
// here.


export class AddOrAndDragButton extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE;
        // jshint ignore:start
    static TEMPLATE = `<button class="add_or_drag drag_handle add_or_drag-drag_handle">(unconfigured)</button>`;

    // jshint ignore:end
    constructor(widgetBus, dataTransferType, dataTransferValue, label) {
        super(widgetBus);
        this._dataTransferType = dataTransferType;
        this._dataTransferValue = dataTransferValue;
        [this.element] = this.initTemplate(label);
    }
    initTemplate(label) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        element.textContent = label;
        this._insertElement(element);

        element.setAttribute('draggable', 'true');
        element.addEventListener('dragstart', this._dragstartHandler.bind(this));
        element.addEventListener('dragend', this._dragendHandler.bind(this));

        element.addEventListener('click', this._clickHandler.bind(this));

        return [element];
    }

    _setDragDataFN(dataTransfer, type, value) {
        dataTransfer.setData(type, `${value}`);
        dataTransfer.setData('text/plain', `[TypeRoof ${type}: ${value}]`);
    }

    _dragstartHandler(event) {
        this._setDragDataFN(event.dataTransfer, this._dataTransferType, this._dataTransferValue);
        event.currentTarget.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!

        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setDragImage(this.element , 0 , 0);
    }

    _dragendHandler(event) {
        event.currentTarget.classList.remove('dragging');
    }

    _clickHandler(event) {
        console.log(`${event}`, event);
        return this._changeState(()=>{
            const items = this.getEntry('collection')
              , newItem = UIAxesMathLocationValues.prototype._createNewItem
                    .call(this, '.', 'insert', items, this._dataTransferValue)
              ;
            return items.push(newItem);
        })
    }
}

class UIExplicitStopsLocations extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const zones = new Map(_zones);
        zones.set('main', widgetBus.wrapper.host);
        super(widgetBus, zones);

        const widgets = [
            [
                {
                    zone: 'main'
                }
              , [
                    ['.', 'collection']
                ]
              , AddOrAndDragButton
              , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE
              , 'default'
              , 'add'
            ]
          , [
                {
                    zone: 'main'
                }
              , []
              , WasteBasketDropTarget
              , 'Drop here to delete'
              , ''//'drag and drop into trash-bin.'
              , [
                    DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                ]
            ]
          , [
                {
                    zone: 'main'
                }
              , [
                    ['.', 'collection']
                ]
              , UIAxesMathLocationValues
              , zones
            ]
        ];
        this._initWidgets(widgets);
    }
}

/**
 * This is specific behavior to not show the UI's for FontAxisTagOrEmptyModel
 * and ExoAxisTagOrEmptyModel when they are empty.
 *
 * It is achieved by using the setting "activationTest".
 *
 * The Coherence function in GridAxisSelectionModel takes care of setting
 * either one to empty if the other is selected. This is very specificly
 * tied to that container behavior.
 *
 * TODO: the UILineOfTextInput interfaces should be replaced by interfaces
 * that better support the user in selecting an existing/known axis. Custom
 * axis tags must remain possible as well.
 */
const uiElementMap = new Map([
        [GridAxisSelectionModel, [UITypeDrivenContainer
          , require('settings:rootPath')
          , require('zones')
          , require('injectable')
          , require('ppsMap')
          , require('label')
        ]]
      , [AxesMathAxisLocationValueModel, [UIAxesMathLocationValue
          , require('settings:rootPath')
          , require('settings:dependencyMapping', ['.', 'value'])
          , [] // eventHandlers=[]
          , false // draggable=false
          , require('label') // label=null
        //  rootPath: this.widgetBus.rootPath.append('axesLocationValuesMap')
        // , relativeRootPath: Path.fromParts('.', key)
        ]]
        // SteppingModel is very similar to GridAxisSelectionModel, except
        // it is contained within the GridAxisSelectionModel at e.g.:
        // dimension/dimensionX/stepping, hence this is a deeper nesting of the
        // UITypeDrivenContainer, which is kind of nice to see it work..
        // exact same setup as GridAxisSelectionModel, [UITypeDrivenContainer !
      , [SteppingModel, [UITypeDrivenContainer
          , require('settings:rootPath')
          , require('zones')
          , require('injectable')
          , require('ppsMap')
          , require('label')
        ]]
        // settings = {
        //         rootPath: this.widgetBus.rootPath.append('axesLocationValuesMap')
        //       , relativeRootPath: Path.fromParts('.', key)
        //       , zone: keyId // required to check if widgetWrapper.host === host
        //     }
        //   , dependencyMappings = [['.', 'collection']]
        //   , Constructor = UIAxesMathLocationValues
        //   , zones = new Map([['main', this._zones.get(keyId)]])
        //   , args = [zones]
        //   ;
      , [AxesMathAxisLocationValuesModel, [UIExplicitStopsLocations
          , require('settings:rootPath')
          , require('zones')
        ]]
    ])
  , orEmptyUIElementMap = new Map([
        [FontAxisTagModel, [UILineOfTextInput
          , require('settings:internalPropertyName', 'value')
          , require('label')
            // Don't show when isEmpty.
          , require('settings:@set', ['activationTest', function(){
                    // `this` is the ComponentWrapper
                const value = this.widgetBus.getEntry('value');
                return !value.isEmpty;
            }])
        ]]
      , [ExoAxisTagModel, [UILineOfTextInput
          , require('settings:internalPropertyName', 'value')
          , require('label')
            // Don't show when isEmpty.
          , require('settings:@set', ['activationTest', function(){
                    // `this` is the ComponentWrapper
                const value = this.widgetBus.getEntry('value');
                return !value.isEmpty;
            }])
        ]]
      // amountValue and stepSizeValue come from SteppingModel
      // but can be treated simmilarly to ExoAxisTagModel/FontAxisTagModel
      // also here, the UI will need to specialize eventually
      , [AmountNumberModel, [UINumberInput
          , require('settings:internalPropertyName', 'value')
          , require('label')
          , require('unit') // e.g. 'pt'
            // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
          , {} //require('getRegisteredPropertySetup', registeredSetup=>{
            //      const result = {}
            //      // FIXME: default seems not to be used by
            //      // UINumberAndRangeOrEmptyInput but I've seen
            //      // it used with fontSize ;-(
            //      for(const key in ['min', 'max', 'default', 'step']) {
            //          if(key in registeredSetup && registeredSetup[key] !== null)
            //              result[key] = registeredSetup[key];
            //      }
            //      return result;
            //  }
            //)
            // Don't show when isEmpty.
          , require('settings:@set', ['activationTest', function(){
                    // `this` is the ComponentWrapper
                const value = this.widgetBus.getEntry('value');
                return !value.isEmpty;
            }])
        ]]
      , [StepSizeNumberModel, [UINumberInput
          , require('settings:internalPropertyName', 'value')
          , require('label')
          , require('unit') // e.g. 'pt'
            // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
          , {} //require('getRegisteredPropertySetup', registeredSetup=>{
            //      const result = {}
            //      // FIXME: default seems not to be used by
            //      // UINumberAndRangeOrEmptyInput but I've seen
            //      // it used with fontSize ;-(
            //      for(const key in ['min', 'max', 'default', 'step']) {
            //          if(key in registeredSetup && registeredSetup[key] !== null)
            //              result[key] = registeredSetup[key];
            //      }
            //      return result;
            //  }
            //)
            // Don't show when isEmpty.
          , require('settings:@set', ['activationTest', function(){
                    // `this` is the ComponentWrapper
                const value = this.widgetBus.getEntry('value');
                return !value.isEmpty;
            }])
        ]]
    ])
  , typeToUIElement = createTypeToUIElementFunction(uiElementMap, orEmptyUIElementMap, genericTypeToUIElement)
  ;

// see typeSpecGetDefaults

/* in actors/layer we have an example:
 *
 * getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, 'inherit'];
                    return [true, getRegisteredPropertySetup(property).default];
                }
 */

// function dimensionGetDefaults(ppsRecord, fieldName, /*BaseModelType.*/modelDefaultValue=getRegisteredPropertySetup.NOTDEF) {
//     const {fullKey} = ppsRecord
//         // If defaultVal === _NOTDEF and fullKey is not found
//         // this will raise.
//       , getFallback = ()=>{
//             const fallback = getRegisteredPropertySetup(fullKey, modelDefaultValue === getRegisteredPropertySetup.NOTDEF
//                                 ? getRegisteredPropertySetup.NOTDEF
//                                 : modelDefaultValue);
//             return fallback === modelDefaultValue
//                 ? modelDefaultValue
//                 : fallback.default
//             ;
//         }
//       ;
//     return getFallback();
// }


const _NOTDEF = Symbol('_NOTDEF');


// If defaultVal === _NOTDEF and fullKey is not found
// this will raise.
function _getFallback(fullKey, modelDefaultValue=_NOTDEF) {
    const fallback = getRegisteredPropertySetup(fullKey, modelDefaultValue === _NOTDEF
                        ? getRegisteredPropertySetup.NOTDEF
                        : modelDefaultValue);
    return fallback === modelDefaultValue
        ? modelDefaultValue
        : fallback.default
    ;
}

function typeToolsGridGetDefaults(getLiveProperties, ppsRecord, fieldName, /*BaseModelType.*/modelDefaultValue=_NOTDEF) {
    const {fullKey, registryFullKey} = ppsRecord
        // When this is the root typeSpec we get a KEY ERROR:
        //    via VideoproofController constructor initial resources:
        //    Error: KEY ERROR not found identifier "typeSpecProperties@"
        //    in [ProtocolHandler typeSpecProperties@]:
        //    typeSpecProperties@/activeState/typeSpec.
        // FIXME: We should rather get the own typeSpecProperties@ and then
        // see if it defines itself a parent. Better then hard-coding the
        // parent path in here.

          // null or the liveProperties instance
        , liveProperties = getLiveProperties()
        , propertyValues = liveProperties !== null
                ? liveProperties.typeSpecnion.getProperties()
                : new Map()
        ;
    // console.log(`typeToolsGridGetDefaults \n    ppsRecord:${ppsRecord}\n    fieldName: ${fieldName}\n    modelDefaultValue`, modelDefaultValue
    //     , '\n    liveProperties-propertyValues:', propertyValues
    //     , '\n    rest ...args:', ...args
    //     );
    // FIXME: it's interesting that we so not use the liveProperties
    // in comparable functions in stage-and-actors, however,
    // this here seems to behave fine.
    // we don't have color so far, however, this looks like it could
    // work universially for colors, it's copied from type-spec-ramp.
    if(ppsRecord.prefix === COLOR) {
        const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
        if(color !== null)
            return color;
        return _getFallback(registryFullKey, modelDefaultValue);
    }
    // These requests come via UIManualAxisLocations:
    else if(ppsRecord.prefix === 'axesLocations/') {
        // 'axesLocations/'. 'YTFI', '738'
        const key = `${ppsRecord.prefix}${fieldName}`
        , result = propertyValues.has(key)
                ? propertyValues.get(key)
                : modelDefaultValue
                ;
        if(result === _NOTDEF)
            throw new Error(`KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`);
        return result;
    }
    else if(ppsRecord.prefix === SPECIFIC) {
        // Introducing 'SPECIFIC', which in contrast to
        // GENERIC requires modelDefaultValue and cannot
        // be acquired via getRegisteredPropertySetup
        // FIXME: we don't use this case far anyymore!!! (we use the SPECIFIC prefix though)
        const result = propertyValues.has(fullKey)
            ? propertyValues.get(fullKey)
            : modelDefaultValue
            ;
        if(result === _NOTDEF)
            throw new Error(`KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`);
        return result;
    }
    else if(ppsRecord.prefix === DIMENSION) {
        // FIXME: This is a stub copied from SPECIFIC and is not correct like this!
        // maybe, the default behavior from the genereic else clause is
        // correct though, but I want to mainly have the console.log for
        // this case to see what's going on.
        console.log(`DIMENSION typeToolsGridGetDefaults ${ppsRecord}`);
         const result = propertyValues.has(fullKey)
            ? propertyValues.get(fullKey)
            : modelDefaultValue
            ;
        if(result === _NOTDEF)
            throw new Error(`KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`);
        return result;
    }
    else {
        if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        return _getFallback(registryFullKey, modelDefaultValue);
    }
}

     // via VideoproofController constructor initial resources:
              // Error: NOT IMPLEMENTED TypeTensorController manualAxesLocations
              // injectable.getDefaults args:
              // <ProcessedPropertiesSystemRecord generic/fontSize generic/, fontSize>,
              //        fontSize, 14
    // via VideoproofController constructor initial resources:
              // Error: NOT IMPLEMENTED TypeTensorController manualAxesLocations
              // injectable.getDefaults args
              //     <ProcessedPropertiesSystemRecord axesLocations/axesLocations axesLocations/,axesLocations>,
              //        wght, 400

export function* getDimensionModelFields(FromType) {
    yield* getFieldsByType(FromType, DimensionSequenceModel);
}

class TypeTensorController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const zones = new Map(_zones);
        zones.set('main', widgetBus.wrapper.host);
        super(widgetBus, zones);
        const dimensionsHostPath = Path.fromString(this.widgetBus.getExternalName('dimensionsHost'))
          , typeSpecPropertiesKey = this.widgetBus.getExternalName('@properties')
          ;
        this._availableDimensions = this._determineAvailableDimensions(dimensionsHostPath);


            // FIXME: requireUpdateDefaults needs proper reconsideration
            // it's an artifact of stage-and-actors, but maybe it's also
            // not ideal from a design perspective. REEVALUATE!
         const requireUpdateDefaults = (/*changedMap*/)=>{
                // FIXME: in this context, this method seems broken!
                // for once, it contains e.g. `value` as key in changedMap
                // but without calling context, it's not possible to turn
                // that into a more meaningful key.
                // Also, in UIManualAxesLocations opsz/autopsz is not properly
                // initialized when this returns false.
                // Since we are not in an animation context, we may
                // get away with always returning true, without a big
                // performance hit.

                // const result = Array.from(changedMap.keys())
                //                         .some(name=>_updateDefaultsNames.has(name));
                // console.warn(`>>>${this} requireUpdateDefaults ${result} changedMap:`, changedMap);
                // return result;
                return true;
            }
          , getLiveProperties = ()=>this.getEntry(typeSpecPropertiesKey)
          , getDefaults = typeToolsGridGetDefaults.bind(null, getLiveProperties)
          ;


        const widgets = [
            [
                { zone: 'main'
                , rootPath: widgetBus.rootPath.parent
                , relativeRootPath: Path.fromParts('.', 'content', 'type')
                }
              , [
                    ['.', 'value']
                ]
              , UISelectInput
              , 'Content'
              , new Map(GridContentTypeModel.enumItems.map(value=>[value, value]))// items
            ]
            // if type is custom, display a text field!
          , [
                { zone: 'main'
                , rootPath: widgetBus.rootPath.parent
                , relativeRootPath: Path.fromParts('.', 'content')
                , activationTest: function() {
                        const type = this.widgetBus.getEntry('type');
                        return type.value === 'custom';
                  }
                }
              , [
                    ['./type', 'type']
                  , ['./customText', 'value']
                ]
              , UILineOfTextInput
              , 'Custom'
            ]
            // one UIDimensionSequenceController per this._availableDimensions
          , ...this._availableDimensions.map(dimensionKey=>{
                return [
                    { zone: 'main'
                    , rootPath: dimensionsHostPath
                    , relativeRootPath: Path.fromParts('.', dimensionKey)
                    }
                  , []
                  , UIDimensionSequence
                  , zones
                  , { // injectable
                        genericTypeToUIElement: typeToUIElement
                      , getPPSMapForModel
                      , requireUpdateDefaults // , requireUpdateDefaults: ()=>true //
                        // getDefaults: dimensionGetDefaults
                      , getDefaults
                        // FIXME: the name in injectable should be changed everywhere
                        // at least to just "typeToUIElement".
                      , updateDefaultsDependencies: []//updateDefaultsDependencies
                      // see in type-spec-ramp.mjs is a similar implementation of this
                      // not sure if the description/documentation is sufficient
                      // , requireUpdateDefaults:()=>true
                    }
                  , ProcessedPropertiesSystemMap.createSimpleRecord(DIMENSION, dimensionKey)
                  , dimension2Label(dimensionKey)
                ];
            })
          , [
                {zone: 'main'}
              , [
                    ['fontSize', 'value']
                  //, ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.

              // via VideoproofController constructor initial resources:
                    // Error: NOT IMPLEMENTED TypeTensorController <ProcessedPropertiesSystemRecord generic/fontSize generic/,fontSize>
                    //  injectable.getDefaults args: fontSize, 66
              , typeToolsGridGetDefaults.bind(null, getLiveProperties,  ProcessedPropertiesSystemMap.createSimpleRecord(GENERIC, 'fontSize'), 'fontSize')
              , ()=>false//requireUpdateDefaults
              , 'Font Size' // label
              , 'pt'// unit
                // relevant for the UI but actually the registered properties
                // or the model defaults should be used here. Probably the
                // mentioned sources above should have a single source.
              , {min:0, max:244, step:1, 'default': 36} // minMaxValueStep => set attribute
            ]

            // FIXME: also for the current two color fields textColor, backgroundColor,
            // it would be nice to simply inject them e.g. using a function like
            // genericTypeToUIElement directly. Since the ClolorChooser is
            // configured there, it should be made possible with little effort.
           , ... ['textColor', 'backgroundColor'].map(fieldName=>{
                    const ppsRecord = GRID_PROPERTIES_PPS_MAP.get(fieldName)
                    return [
                        {
                            relativeRootPath: Path.fromParts('.', fieldName)
                          , zone: 'main'
                        }
                      , []
                      , UIColorChooser
                      , zones
                      , (getRegisteredPropertySetup(ppsRecord, {label:fieldName}).label || fieldName)// as in require('label')
                      , typeToolsGridGetDefaults.bind(null, getLiveProperties, ppsRecord, fieldName)
                      , [] // updateDefaultsDependencies
                      , ()=>false // updateDefaultsDependencies
                    ];
                })

            // FIXME: it would be nice to get this somehow configured using
            // the type-driven approach. However, the configuration in
            // type-driven-ui.mjs looks rather specific for type-spec-ramp
            // and maybe there's an issue with that.
          , [
                {
                    zone: 'main'
                }
              , [
                    ['fontSize', 'fontSize']
                  , ['./font', 'font']
                  , ['axesLocations', 'axesLocations']
                  , ['autoOPSZ', 'autoOPSZ']
                    // , ...updateDefaultsDependencies
                ]
              , UIManualAxesLocations // (widgetBus, getDefaults=null, ppsRecord=null, requireUpdateDefaults=()=>false
              , getDefaults
              , GRID_PROPERTIES_PPS_MAP.get('axesLocations')
              , requireUpdateDefaults
            ]
          , [
                {
                    // rootPath: dimensionsHostPath // is the identity!
                    zone: 'main'
                }
              , [
                    ['.', 'referenceItem']
                  , [typeSpecPropertiesKey, 'properties@']
                    // This is probably not required for the CommonActorProperties at all.
                ]
              , UIshowProcessedProperties
              , 'Grid-Properties'
            ]
        ];
        this._initWidgets(widgets);
    }

    _determineAvailableDimensions(path) {
        const dimensionsHostEntry =  this.widgetBus.getEntry(path) // may be same as rootPath
          , TypeClass = dimensionsHostEntry instanceof _AbstractDynamicStructModel
                ? dimensionsHostEntry.WrappedType
                : dimensionsHostEntry.constructor
          ;
        // This interface can serve as many dimension interfaces as there
        // are dimension type fields it doesn't care about the semantic of
        // the key (x, y, z). The actual grid UI etc. has to be aware of
        // the key semantics.
        const availableDimemsions = [];// An ordered set would be ideal.
        for(const fieldname of getDimensionModelFields(TypeClass))
            availableDimemsions.push(fieldname);
        return availableDimemsions;
    }
}

// copied from type-spec-ramp, eager to see if it will work like that.
function* fontGen(outerTypespecnionAPI, hostInstance/* here a TypeSpecModel */) {
    const font = hostInstance.get('font');
    if(font !== ForeignKey.NULL) {
        yield [`${SPECIFIC}font`, font.value];
    }
}

// copied from type-spec-ramp, eager to see if it will work like that.
/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* fontSizeGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const fontSize = keyMoment.get('fontSize');
    if(!fontSize.isEmpty)
        yield [`${GENERIC}fontSize`, fontSize.value];
}

export function calculateAxisRangeLogicValueSynthetic(logiVal, axisRange) {
    if(!axisRange || !(logiVal in axisRange))
        return null
    return axisRange[logiVal];
}

export function* axisLocationValueGen(path, axisRangeKey ,axisValue) {
    // axisValue is a AxesMathAxisLocationValueModel
    const logiVal = axisValue.get('logicalValue').value

    if(logiVal === 'number') {
        const rawNumber = axisValue.get('numericValue').value
        // DO we need this? would only work if axisRange was available
        // , clampedNumber = Math.min(axisRange.max, Math.max(axisRange.min, rawNumber))
        yield [path, rawNumber];
    }
    else {
        const args = [axisRangeKey];
        yield [path, new SyntheticValue(calculateAxisRangeLogicValueSynthetic.bind(null, logiVal), args)];
    }
}

function calculateFontAxisRangeSynthetic(axisTag, font) {
    const axisRanges = font.axisRanges;
    if(!(axisTag in axisRanges))
        // In this case, the result value becomes null
        // i.e. 'axesLocations/wxht': null
        // FIXME: it would be nice to remove null values from the
        // results set.
        return null;
    return axisRanges[axisTag];
}

function calculateRangeSequence(steppingData, start=null, end=null) {
    console.log('calculateRangeSequence start:', start, 'end:', end);
    const steppingType = steppingData.get('type').value;

    if(steppingType === 'amount') {
        // integer >= 1
        const amountValue = steppingData.get('amountValue').value;

        if(start === null || end === null)
            return new Array(amountValue).fill(null);

        const l = amountValue - 1
          , magnitude = end - start
          // if amountValue === 1 step can be 0 as we only take start
          // if amountValue === 2 step should be magnitude so we have start and end
          // if amount value === 3 step should be magnitude/2 ...
          // We can't divide by zero, but we later multiply with i and
          // that is zero in the amountValue === 1 case, we can argue
          // that Infinity * 0 should be in this case zero and not NaN.
          , step = l === 0 ? 0 : (magnitude/l)
          , values = [start]
          ;
        // since amount is >= 0 this will at least contain one value, start
        for(let i=0;i<l;i++)
            values.push(values.at(-1) + step);

        return values;
    }
    if(steppingType === 'stepSize') {
        if(start === null || end === null)
            return [null];
              // float, Math.abs >= Number.MIN_VALUE
              // The Number.MIN_VALUE static data property represents
              // the smallest positive numeric value representable in JavaScript.
        const stepSizeValue = steppingData.get('stepSizeValue').value
          , direction = start > end ? -1 : 1
          , step = stepSizeValue * direction
          , values = []
          ;
        let current = start;
        // The end value is included if it's a direct match,
        // I would expect a user would expect this behavior.
        do {
            // we'll always have at least one value(start)
            values.push(current);
            current += step;
        }
        while((direction >=0 && current <= end) || (direction < 0 && current >= end));
        return values;
    }
    throw new Error(`UNKNOWN VALUE for steppingType ${steppingType}`)
}

function calculateExplicitSequence(...values) {
    return values;
}

const EXO_AXES = new Map([
    // FIXME: not sure if this is the best place for targetKey!
    ['fontSize', {min: 1, max: 1500, 'default': 36, targetKey: `${GENERIC}fontSize`}] // in pt; 1500 pt (2000px) used to be max of FireFox
]);

function * _dimensionAxisRangeGen(fontKey, axisTypeKey, axisTagKey, axisRangeKey, axisData) {
    const axisType = axisData.get('type').value;
    // We only need the axisRange for min/max/range actually.
    // Could be interesting to yield this or only execute this when
    // it's also required.
    yield [axisTypeKey, axisType];
    if(axisType === 'font') {
        const axisTag = axisData.get('fontAxisTagValue').value
        , args = [axisTagKey, fontKey]
        ;
        yield [axisTagKey, axisTag];
        yield [axisRangeKey, new SyntheticValue(calculateFontAxisRangeSynthetic, args)];
    }
    else if(axisType === 'exo') {
        // a stub.
        const axisTag = axisData.get('exoAxisTagValue').value
          , axisRange = EXO_AXES.has(axisTag)
                    ? EXO_AXES.get(axisTag)
                    : null
          ;
        yield [axisTagKey, axisTag];
        yield [axisRangeKey, axisRange];
    }
    else
        throw new Error(`UNKNOWN VALUE for axisType ${axisType}`);
}

function* dimensionsGen(_outerAPI, hostInstance) {
    for(const fieldName of getDimensionModelFields(hostInstance.constructor)) {
       const PREFIX = `${DIMENSION}${fieldName}`
          , ALGORITHM_TYPE = `${PREFIX}/algorithm`
          , SEQUENCE = `${PREFIX}/sequence`
          , fontKey = `${SPECIFIC}font`
          , axisRangeKey = `${PREFIX}/axis/range`
          , axisTagKey =  `${PREFIX}/axis/tag`
          , axisTypeKey =  `${PREFIX}/axis/type`
          , dimensionSequence = hostInstance.get(fieldName)
          , algorithm = dimensionSequence.get('dimensionSequenceTypeKey').value
          ;
        if(algorithm === ForeignKey.NULL) {
            // The value should be the same as a NullDimensionModel with amount 1
            // Not sure if that requires treatment here though! As, in any
            // case a dimension without a sequence or with an empty sequence
            // should be treated like a sequence with 1 empty item in the
            // render.
            //
            // If e.g. Explicit or Range are inherited (we don't do this
            // so far the SyntheticValue shoulld be emitted here, so that
            // e.g. the logical axis values are calculated for the
            // correct/current font.
            continue;
        }
        // NULL Range Explicit
        const data = dimensionSequence.get('instance').wrapped; // instance is: DynamicDimensionSequenceModel
        yield [ALGORITHM_TYPE, algorithm]; //e.g. [dimension/dimensionX/algorithm, 'NULL']
        if(algorithm === 'Range') {
            const axisData = data.get('axis');
            yield * _dimensionAxisRangeGen(fontKey, axisTypeKey, axisTagKey, axisRangeKey, axisData);
            const startEndPaths = [];
            for(const name of ['start', 'end']) {
                const axisValue = data.get(name)
                  , path = `${PREFIX}/${name}`
                  ;
                startEndPaths.push(path);
                yield* axisLocationValueGen(path, axisRangeKey, axisValue);
            }
            const steppingData = data.get('stepping');
            const args = [...startEndPaths];
            yield [SEQUENCE, new SyntheticValue(calculateRangeSequence.bind(null, steppingData), args)];
        }
        else if(algorithm === 'Explicit') {
            const axisData = data.get('axis')
              , values =  data.get('values')
              , valuesPaths = []
              ;
            yield * _dimensionAxisRangeGen(fontKey, axisTypeKey, axisTagKey, axisRangeKey, axisData);
            for(const [key, axisValue] of values) {
                // This is potentially a lot of entries and maybe not
                // necessarily required, as the actual values could also
                // be calculated directly in calculateExplicitSequence
                const path = `${PREFIX}/values/${key}`;
                valuesPaths.push(path);
                yield* axisLocationValueGen(path, axisRangeKey, axisValue);
            }
            const args = [...valuesPaths];
            yield [SEQUENCE, new SyntheticValue(calculateExplicitSequence, args)];
        }
        else if(algorithm === 'NULL') {
            const amountValue = data.get('amountValue').value;
            yield [`${PREFIX}/amountValue`,amountValue];
            yield [SEQUENCE, Array(amountValue).fill(null)];
        }
        else
            //throw new Error(`NOT IMPLEMENTED dimensionsGen don't know how to handle algorithm type "${algorithm}".`);
            console.error(`NOT IMPLEMENTED dimensionsGen don't know how to handle algorithm type "${algorithm}".`);
    }
}

const REGISTERED_GENERIC_TYPE_TOOLS_GRID_FIELDS = Object.freeze(new FreezableSet([
        // script+language!
        'textAlign', 'direction', 'columnWidth'
    ]))
  , TYPE_TOOLS_GRID_PROPERTIES_GENERATORS = Object.freeze([
      // numericPropertiesGen
        colorsGen // i think we don't have colors currently.
      , fontGen
      , fontSizeGen // must come before axisLocationsGen
      , axisLocationsGen
      , dimensionsGen
      , getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPE_TOOLS_GRID_FIELDS)
    ])
  , TYPE_TOOLS_GRID_DEFAULT_PROPERTIES_GENERATORS = Object.freeze([
      // numericPropertiesGen
        colorsGen
      // , fontGen don't fixate the current global font in these defaults!
      // the local name "font" directly links the global font, but, since
      // this is at module loading time, it doesn't make much sense to
      // store that value.
      , fontSizeGen // must come before axisLocationsGen
      , axisLocationsGen
      , dimensionsGen
      , getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPE_TOOLS_GRID_FIELDS)
    ])
  , _skipPrefix = new Set([
    // This is very complicated as axesLocations have different default
    // values depending on the actual font. So if there's no font, there
    // can't be a value. This is why modelDefaultValue is injected, because
    // the caller may know a default value, but it may also not know, there's
    // no guarantee!
    'axesLocations/'
    // "font" is really the only case of this so far, there could
    // be the document font as a default maybe, as it cannot be not
    // set at all, hence it also must be loaded and available.
    // , SPECIFIC // NOTE the way fon't is specified it can't be skipped
    // using the _skipPrefix set! This is maybe a hint that we need to
    // do this differently, however, so far TYPE_TOOLS_GRID_DEFAULT_PROPERTIES_GENERATORS
    // just doesn't include the fontGen but I would prefer a more hollistic
    // solution and rather use the complete TYPE_TOOLS_GRID_PROPERTIES_GENERATORS
]);
function _getGridPropertiesDefaultsMap(dependencies) {
    console.log('GRID_PROPERTIES_PPS_MAP', GRID_PROPERTIES_PPS_MAP);
    const defaultTypeToolsGrid = (()=>{
            const draft = GridPropertiesModel.createPrimalDraft(dependencies);
            for(const [fieldName, ppsRecord] of GRID_PROPERTIES_PPS_MAP) {
                if(_skipPrefix.has(ppsRecord.prefix)) {
                    console.log(`_getGridPropertiesDefaultsMap SKIP ${fieldName} :::: ${ppsRecord}`);
                    continue;
                }
                console.log(`_getGridPropertiesDefaultsMap TAKE ${fieldName} :::: ${ppsRecord}`);
                if(ppsRecord.prefix == COLOR) {
                    const defaultValue = typeToolsGridGetDefaults(()=>null, ppsRecord, fieldName)
                      , color = culoriToColor(defaultValue, draft.dependencies)
                      ;
                    draft.set(fieldName, color);
                }
                else if(ppsRecord.prefix == LEADING) {
                    console.error(`_getGridPropertiesDefaultsMap GOT LEADING ${fieldName} ${ppsRecord}`);
                    continue;
                    // BUT this is similar to the stepping algorithms we use in here>>>
                    // const defaultValue = typeSpecGetDefaults(()=>null, ppsRecord, fieldName)
                    //   , leading = deserializeLeadingAlgorithmModel(draft.dependencies, defaultValue)
                    //   ;
                    // draft.set(fieldName, leading);
                }
                // HERE! we rather don't want to put stuff into the DIMENSION
                // prefix that is not a DIMENSION type. That way it's simple
                // to check here! However, if the pps
                else if(ppsRecord.prefix == DIMENSION && DIMENSIONS.has(ppsRecord.registryKey)) {
                    continue;
                }
                // else if(fieldName === `content`) {
                //     // FIXME, this end in the defaultTypeToolsGrid, however
                //     // it's not the inital value of the grid. I wonder how
                //     // I should achieve that!
                //     const defaultValue = typeToolsGridGetDefaults(()=>null, ppsRecord, fieldName)
                //        , content = deserializeGridContentModel(draft.dependencies, defaultValue)
                //        ;
                //     draft.set(fieldName, content);
                // }
                else {
                    // >> _getGridPropertiesDefaultsMap FALLBACK dimensionX <ProcessedPropertiesSystemRecord dimension/dimensionX dimension/,dimensionX>
                    // >> via VideoproofController constructor initial resources: Error: KEY ERROR don't know how to get registered property setup "dimension/dimensionX".
                    const defaultValue = typeToolsGridGetDefaults(()=>null, ppsRecord, fieldName);
                    console.error(`_getGridPropertiesDefaultsMap FALLBACK ${fieldName} ${ppsRecord} defaultValue:`, defaultValue);
                    draft.get(fieldName).value = defaultValue;
                }
            }
            return draft.metamorphose();
        })()
      // TODO
      , properties = LocalScopeTypeSpecnion.propertiesGenerator(TYPE_TOOLS_GRID_DEFAULT_PROPERTIES_GENERATORS, defaultTypeToolsGrid, new Map())
      , localPropertyValuesMap = LocalScopeTypeSpecnion.initPropertyValuesMap(properties, new Map())
      , typeSpecDefaultsMap = new FreezableMap(localPropertyValuesMap)
      ;
    Object.freeze(typeSpecDefaultsMap);
    return typeSpecDefaultsMap
}

function getDimensionFromPropertyValuesMap(propertyValuesMap, PREFIX) {
    // dimension/dimensionX/axis/type, dimension/dimensionX/axis/tag, dimension/dimensionX/sequence
    const algorithmKey = `${PREFIX}/algorithm`
      , sequenceKey = `${PREFIX}/sequence`
      , axisTypeKey = `${PREFIX}/axis/type`
      , axisTagKey = `${PREFIX}/axis/tag`
      , axisRangeKey = `${PREFIX}/axis/range`
      , defaultNull = {
            algorithm: 'NULL'
          , sequence: [null] // always at least one item!
          , range: propertyValuesMap.has(axisRangeKey)
                    ? propertyValuesMap.get(axisRangeKey)
                    : null
        }
      ;
    if(!propertyValuesMap.has(algorithmKey))
        return defaultNull
    const algorithm = propertyValuesMap.get(algorithmKey)
      , result = Object.assign({}, defaultNull, {algorithm})
      , sequence = propertyValuesMap.get(sequenceKey)
      ;
    result.sequence = Array.isArray(sequence) && sequence.length > 0
        ? sequence
        : defaultNull.sequence
        ;
    if(algorithm === 'NULL')
        return result;
    result.axisType = propertyValuesMap.get(axisTypeKey);
    result.axisTag = propertyValuesMap.get(axisTagKey);
    return result;
}

function _applyDimensions(originalPropertyValuesMap, ...dimensionData) {
    let localPropertyValuesMap = null;

    for(const [dimension, i] of dimensionData){
        const value = dimension.sequence[i];
        if(value !== null) {
            if(localPropertyValuesMap === null)
                // only make the copy when there's a change
                localPropertyValuesMap = new Map(originalPropertyValuesMap);
            if(dimension.axisType === 'font')
                localPropertyValuesMap.set(`axesLocations/${dimension.axisTag}`, value);
            else if(dimension.range && dimension.range.targetKey) {
                localPropertyValuesMap.set(dimension.range.targetKey, value);
                const autoOPSZKey = `${GENERIC}autoOPSZ`;
                // FIXME: this should be solved on a different level, i.e.
                // if the SyntheticValue for opsz is calculated later than
                // this generator, GENERIC/fontSize would then have the
                // correct value already. HOWEVER, since this here is
                // specifically made per cell on the spot, it wouldn't work.
                // The cells would need their own liveProperties.
                if(dimension.axisTag === 'fontSize'
                        && localPropertyValuesMap.has(autoOPSZKey)
                        && localPropertyValuesMap.get(autoOPSZKey))
                    localPropertyValuesMap.set(`axesLocations/opsz`, value);
            }
            else
                console.warn(`Don't know how to apply dimension ${dimension.axisType} ${dimension.axisTag} value "${value}"`);
        }
    }
    return localPropertyValuesMap || originalPropertyValuesMap;
}

class UIGrid extends _BaseComponent {
    // jshint ignore: start
    static TEMPLATE = `<div class="ui_type_tools_grid">
</div>`;
    static TEMPLATE_ROW = `<div class="ui_type_tools_grid-row"></div>`;
    static TEMPLATE_CELL = `<div class="ui_type_tools_grid-cell"></div>`;
    // jshint ignore: end
    constructor(widgetBus) {
        super(widgetBus);
        this._cellContent = '(uninitialized)';
        this._cellElements = [];
        [this.element] = this._initTemplate();
    }
    _initTemplate() {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        this._insertElement(element);
        return [element];
    }

    update (changedMap) {
        console.log(`${this}.update:`, ...changedMap.keys(), changedMap);
        if(changedMap.has('content')) {
            const content = changedMap.get('content')
              , contentType = content.get('type').value
              , cellContent = contentType === 'custom'
                    ? content.get('customText').value
                    : GRID_CONTENT_OPTIONS.get(contentType)
            this._cellContent = cellContent;
        }

        if(changedMap.has('@properties')) {
            const properties = changedMap.get('@properties')
              , propertyValuesMap = properties.typeSpecnion.getProperties()
              ;
            console.log('propertyValuesMap:', propertyValuesMap);
            // colors/textColor/l, colors/textColor/c, colors/textColor/mode,
            // colors/backgroundColor/l, colors/backgroundColor/c, colors/backgroundColor/alpha, colors/backgroundColor/mode,
            // generic/fontSize, specific/font,
            // dimension/dimensionX/algorithm,
            // dimension/dimensionX/axis/type, dimension/dimensionX/axis/tag, dimension/dimensionX/sequence
            const [dimensionX, dimensionY] = [DIMENSION_X, DIMENSION_Y].map(
                    dimensionKey=>getDimensionFromPropertyValuesMap(
                        propertyValuesMap, `${DIMENSION}${dimensionKey}`));
            console.log('dimensionX', dimensionX);
            console.log('dimensionY', dimensionY);
            const rows = []
            this._cellElements.splice(0, Infinity);
            for(let y=0, l=dimensionY.sequence.length; y<l; y++) {
                const row = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE_ROW).firstElementChild;
                rows.push(row);
                for(let x=0, l=dimensionX.sequence.length; x<l; x++) {
                    const cell = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE_CELL).firstElementChild;
                    this._cellElements.push(cell);
                    cell.textContent = this._cellContent;
                    row.append(cell);
                    const localPropertyValuesMap = _applyDimensions(propertyValuesMap, [dimensionX, x], [dimensionY, y]);
                    this._styleCell(cell, localPropertyValuesMap);
                }
            }
            this._domTool.clear(this.element);
            this.element.append(...rows);
        }
        else if(changedMap.has('content')) {
            for(const cell of this._cellElements)
                cell.textContent = this._cellContent;
        }
    }

    _styleCell(element, propertyValuesMap) {
        const fontPPSRecord = ProcessedPropertiesSystemMap.createSimpleRecord(SPECIFIC, 'font')
          , font = propertyValuesMap.get(fontPPSRecord.fullKey)
          ;
        element.style.setProperty('font-family', `"${font.fullName}"`);
        element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
        element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
        element.style.setProperty('--descender', `${font.fontObject.descender}`);

        const colorPropertiesMap = [
                ['colors/backgroundColor', 'background-color']
              , ['colors/textColor', 'color']
            ]
          , getDefault = property => {
                return [true, getRegisteredPropertySetup(property).default];
            }
          ;
        actorApplyCSSColors(element, propertyValuesMap, getDefault, colorPropertiesMap);
        setTypographicPropertiesToSample(element, propertyValuesMap);
    }
}

class TypeToolsGridController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const gridManagerContainer = widgetBus.domTool.createElement('div', {'class': 'grid-manager'})
          , zones = new Map([..._zones
                , ['grid-manager', gridManagerContainer]
                ])
          , relativeGridPropertiesPath = Path.fromParts('.', 'properties')
          , rootGridPropertiesPath = widgetBus.rootPath.append(...relativeGridPropertiesPath);
          ;
        // Initially I thought I'd use gridProperties@ here, but since this
        // uses the entire classes around typeSpecProperties and since
        // the TypeSpecLiveProperties widget expects "typeSpecProperties@"
        // I'm going to stick with that.
        widgetBus.wrapper.setProtocolHandlerImplementation(
                    ...SimpleProtocolHandler.create('typeSpecProperties@'));

        super(widgetBus, zones);

        const gridPropertiesDefaultsMap = _getGridPropertiesDefaultsMap(widgetBus.getEntry(rootGridPropertiesPath).dependencies);
        const widgets = [
            // No need to build a hierarchy e.g. via TypeSpecMeta, this
            // thing so far has no other hierarchy/deep nesting going on.
            // TypeTensorController, the initial update must be after
            // this, but it seems it is before. Why?
            [
                {
                    'typeSpecProperties@': widgetBus.rootPath.toString()
                  , relativeRootPath: Path.fromParts('.', 'properties')
                }
              , [
                       // This way, it's hard to only update when the
                       // 'content' changed!
                       ['.', 'typeSpec']
                      // parent is always two levels above from here
                      // as this is children/{index}
                    //  , [`typeSpecProperties@${rootPath.append('..', '..')}`, '@parentProperties']
                    //, [this.widgetBus.getExternalName('stylePatchesSource'),'stylePatchesSource']
                ]
              , TypeSpecLiveProperties
              , TYPE_TOOLS_GRID_PROPERTIES_GENERATORS
              , null
              , gridPropertiesDefaultsMap
            ]
          , [
                {zone: 'main'}
              , []
              , Collapsible
              , 'Grid'
              , gridManagerContainer
              , true
            ]
          , [
                {
                    zone: 'grid-manager'
                  , relativeRootPath: Path.fromParts('.', 'properties')
                }
              , [
                    ['.', 'dimensionsHost']
                  , [`typeSpecProperties@${widgetBus.rootPath.toString()}`, '@properties']
                ]
              , TypeTensorController
              , zones
            ]
          , [
                {zone: 'layout'}
              , [
                    [`typeSpecProperties@${widgetBus.rootPath.toString()}`, '@properties']
                  , ['./content', 'content']
                ]
              , UIGrid
            ]
        ];
        this._initWidgets(widgets);
    }
    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('typeSpecProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('typeSpecProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export {
    TypeToolsGridModel as Model
  , TypeToolsGridController as Controller
};
