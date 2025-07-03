import {
    _AbstractDynamicStructModel
  , StaticDependency
  , getFieldsByType
  , Path
  , ForeignKey
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
} from '../basics.mjs';

import {
    collapsibleMixin
  , StaticNode
  , StaticTag
  , GenericSelect
} from '../generic.mjs';

import {
    AvailableTypesModel
} from '../dynamic-types-pattern.mjs';

import {
    DIMENSION_X
  , DIMENSION_Y
  , DIMENSION_Z
  , dimension2Label
  , DimensionSequenceModel
  , availableDimensionSequenceTypes
  , ExplicitDimensionModel
  , RangeDimensionModel
  , NullDimensionModel
} from '../type-dimension-fundamentals.mjs';

import {
    _BaseTypeDrivenContainerComponent
} from '../type-driven-ui-basics.mjs';

import {
    genericTypeToUIElement
} from '../type-driven-ui.mjs';

import {
    GENERIC
  , DIMENSION
  , ProcessedPropertiesSystemMap
} from '../registered-properties-definitions.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

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
const TypeToolsGridModel = _BaseLayoutModel.createClass(
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


function getGenericFieldPPSMap(parentPPSRecord, FieldType) {
    const entries = [];
    for(const [modelFieldName/*, modelFieldType */] of FieldType.fields.entries()) {
        let prefix = GENERIC // ?
          , fullKey = null
          , registryKey = null
          ;
        fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        const entry = [
            modelFieldName
          , ProcessedPropertiesSystemMap.createSimpleRecord(prefix, modelFieldName, fullKey, registryKey)
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}

function _getPPSMapForModel(FieldType, ppsRecord) {
    let fn;
    if(FieldType === ExplicitDimensionModel)
        fn = getGenericFieldPPSMap
    else if(FieldType === RangeDimensionModel)
        fn = getGenericFieldPPSMap
    else if(FieldType === NullDimensionModel)
        fn = getGenericFieldPPSMap
    else
        throw new Error(`KEY ERROR unknown FieldType "${FieldType.name}".`);
    return fn(ppsRecord, FieldType);
}

/**There's an example for this kind of Container:
 *      UILeadingAlgorithm extends _BaseDynamicCollectionContainerComponent
 * There should probably be a common _BaseClass as it seems a useful concept
 * doing, the duplication for a while longer though, to capture the nuances
 * and to find a better common sweet spot.
 *
 * CAUTION: also observe the Nixin of _BaseTypeDrivenContainerComponent
 * after the class definition.
 */
class UIDimensionSequence extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, _zones, injectable, ppsRecord, label) {
        const localZoneElement = widgetBus.domTool.createElement('fieldset', {'class': 'ui-dimension_sequence'})
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
            const ppsMap = _getPPSMapForModel(FieldType, this._ppsRecord)
              , widgetDefinitions = this._defineGenericWidgets(
                    FieldType
                  , fieldName=>FieldType.fields.has(fieldName) // basically all allowed
                  , {zone: 'local', rootPath: this.widgetBus.rootPath.append('instance')}
                  , ppsMap
                  , this._injectable
                )
              ;
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

class TypeTensorController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const zones = new Map(_zones);
        zones.set('main', widgetBus.wrapper.host);
        super(widgetBus, zones);
        const dimensionsHostPath = Path.fromString(this.widgetBus.getExternalName('dimensionsHost'))
        this._availableDimemsions = this._determineAvailableDimensions(dimensionsHostPath);
        const widgets = [
            // one UIDimensionSequenceController per this._availableDimemsions
            ...this._availableDimemsions.map(dimensionKey=>{
                return [
                    { zone: 'main'
                    , rootPath: dimensionsHostPath
                    , relativeRootPath: Path.fromParts('.', dimensionKey)
                    }
                  , []
                  , UIDimensionSequence
                  , zones
                  , {// injectable
                        getDefaults:(...args)=>{
                            throw new Error(`NOT IMPLEMENTED TypeTensorController `
                                +`${dimensionKey} injectable.getDefaults args: ${args.join(', ')}`)
                        }
                      , genericTypeToUIElement
                    }
                  , ProcessedPropertiesSystemMap.createSimpleRecord(DIMENSION, dimensionKey)
                  , dimension2Label(dimensionKey)
                ];
            })
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
                {zone: 'grid-manager'}
              , [
                    ['.', 'dimensionsHost']
                ]
              , TypeTensorController
              , zones
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
