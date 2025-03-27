

import {
    _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractNumberModel
  , _AbstractDynamicStructModel
  , StringModel
  , BooleanModel
  , BooleanDefaultTrueModel
} from '../metamodel.mjs';

import {
    _BaseComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_NO_UPDATE
} from './basics.mjs';

import {
    StaticTag
  //, StaticNode
  , UILineOfTextInput
  , UISelectInput
  , UIToggleButton
  , UILineOfTextOrEmptyInput
  , UISelectOrEmptyInput
  , UICheckboxOrEmptyInput
  , UINumberAndRangeInput
  , UINumberAndRangeOrEmptyInput
} from './generic.mjs';

import {
    require
  , _NOTDEF
  , _BaseTypeDrivenContainerComponent
} from './type-driven-ui-basics.mjs';

import {
    CharGroupOptionsModel
  , CharGroupModel
} from './actors/videoproof-array.mjs';

import {
    UICharGroupContainer
} from './ui-char-groups.mjs';

import {
    UISelectCharGroupInput
  , UISelectCharGroupOrEmptyInput
} from './ui-char-groups.mjs'

import {
    ColorModel
} from './color.mjs';

import {
    UIColorChooser
} from './ui-color-chooser.mjs'

import {
    AxesLocationsModel
  , UIManualAxesLocations
} from './ui-manual-axis-locations.mjs'

import {
    ProcessedPropertiesSystemMap
  , ProcessedPropertiesSystemRecord
} from './registered-properties-definitions.mjs';

import {
     StylePatchLinksMapModel
   , UIStylePatchesLinksMap
   , LeadingAlgorithmModel
   , LineWidthLeadingModel
   , UILeadingAlgorithm
} from './type-spec-fundamentals.mjs';

import {
    AxesMathAxisLocationsModel
  , UIAxesMathLocation
} from './axes-math.mjs';

// FIXME: maybe rather change the imports
export {ProcessedPropertiesSystemMap, ProcessedPropertiesSystemRecord};

export class UIMissingUIElement extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_missing-ui_element">
    <h4>Missing UI-Element</h4>
    <span class="ui_missing-ui_element-label"><!-- insert: label --></span>
    <span class="ui_missing-ui_element-full_key"><!-- insert: fullKey --></span>
    <span class="ui_missing-ui_element-type_name"><!-- insert: typeName --><span>
    <span class="ui_missing-ui_element-message"><!-- insert: message --><span>
</div>`;
    //jshint ignore:end
    constructor(widgetBus, typeName, message, fullKey, label) {
        super(widgetBus);
        [this.element] = this.initTemplate(typeName, message, fullKey, label);
    }
    initTemplate(typeName, message, fullKey, label) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        for(const [key, value] of Object.entries({typeName, message, fullKey, label}))
            this._domTool.insertAtMarkerComment(element, `insert: ${key}`, value);
        this._insertElement(element);
        return [element];
    }
}

/**
 *See REGISTERED_GENERIC_KEYMOMENT_FIELDS, which currently acts as
 * an inventory list for this. The fields associated with the registered
 * names must be configurable with this method and it's caller.
 *
 * FIXME: this requires refactoring to make it generally useful/usable.
 * It can be very specific what a UIElement requires, so this is
 * also exploratory. Maybe we'll need another abstraction to define all
 * of this.
 * Also, based on the position of the UI in the app and also on the context
 * of the Model, a ModelType could be expected to be connected with a
 * different UIElement. This so far is to be used within KeyMomentController
 * for the properties of a single KeyMoment. However, even for different
 * KeyMoment Types, different UIElements could be expected/required.
 *
 * TODO: This is a powerful start for data driven automatic ui genration,
 * it will take a while to make this into a general principle.
 *
 * One issue with this is that it does two things:
 *      1: map the Model to a widget configuration
 *      2: define the widget configuration
 * Both can be very generic on the one hand, like a general default behavior.
 * But at the same time, both can be very specific, e.g. the UI Element to
 * represent a boolean switch can be different based on the context. Not
 * to speak of labels, placeholders, titles etc.
 * This means basically both sides need to be customizable, but also,
 * there could be a generic default. The generic default could be attached
 * directly to the UIElement definition. e.g. Maybe using a Symbol.
 * It's very interesting that we could adress the parameters by name
 * that way, e.g. as a Map both argument order and name can be stored e.g.:
 *
 *     UIToggleButton[CONFIGURATION] = new Map(
 *          ['internalPropertyName', require('settings:internalPropertyName', 'boolean')]
 *        , ['classToken', require('classToken')]
 *        , ['labelIsOn', require('label', val=>`turn ${val} off`)]
 *        , ['labelIsOff', require('label', val=>`turn ${val} on`)]
 *        , ['title', require('label', val=>`Toggle ${val}`)]
 *     )
 *
 * CAUTION: In the example 'internalPropertyName' doesn't result in an actual
 * argument, it's rather influencing the `dependecyMappings`. Hence, the
 * order of that item is not particularly important.
 * The `require('{name}')` property is more complex than just injecting
 * a specific argument, It's rather a behavior that can have other
 * side effects on the widget definition as well. However, if it is injecting
 * arguments, the order is important.
 * It will requrie some effort to explain and document this properly.
 *
 * For `UIElement.prototype instanceof _BaseContainerComponent`
 * it would be interesting to always have
 *          require('settings:rootPath'), require('zones')
 *
 * There could be some configuration that is automatically inherited if
 * not specified otherwise. Fundamentally each _BaseComponent requires
 * `widgetBus`. Then each  _CommonContainerComponent requires additionally
 * `zones` and `widgets=[]`; It would be cool to be able to define the
 * requirements of all the widgets this way, while still having a
 * way to define more specific behavior when it maters.
 *
 */
export function genericTypeToUIElement(ModelType, defaultVal=_NOTDEF) {
    const valueUIElements = new Map([
            [StringModel, [UILineOfTextInput
                    , require('settings:internalPropertyName', 'value')
                    , require('label')]]
          , [_AbstractEnumModel, [UISelectInput
                    , require('settings:internalPropertyName', 'value')
                    , require('label'), require('items')]]
          , [CharGroupOptionsModel, [UISelectCharGroupInput
                    , require('settings:internalPropertyName', 'value')
                    , CharGroupOptionsModel.charGroupsData, require('label')]]
          // TODO: UIGenericKeyMomentStructContainer should be the
          // default for any Struct that has not a more specific
          // UI mapped to it. Though, it should also be possible to
          // map no UI at all and overwrite the default, or set the default
          // within a countainer to map to no UI. Also, it would be good
          // to be able to map multiple UIs to one Type, like e.g. different
          // views.
          //, [CharGroupModel, [UIGenericKeyMomentStructContainer
          //          , require('settings:rootPath'), require('zones')
          //          , require('parentInjectable')
          //          , require('propertyRoot'), require('label')]]
          , [CharGroupModel, [UICharGroupContainer
                    , require('settings:rootPath'), require('zones')
                    , require('parentInjectable')
                    , require('propertyRoot'), require('label')]]
          , [BooleanModel, [UIToggleButton
                    , require('settings:internalPropertyName', 'boolean')
                    , require('classToken')
                    , require('label', val=>`turn ${val} off`)
                    , require('label', val=>`turn ${val} on`)
                    , require('label', val=>`Toggle ${val}`)
                    ]]
          , [ColorModel, [UIColorChooser
                    , require('settings:rootPath'), require('zones')
                    , require('label')
                      // ColorModel is not OrEmpty, however it behaves
                      // similarly.
                    , require('getDefault')
                    , require('updateDefaultsDependencies')
                    , require('raw:requireUpdateDefaults')]]
          , [_AbstractNumberModel, [UINumberAndRangeInput
                    , require('settings:internalPropertyName', 'value')
                    //, require('getDefault'), require('requireUpdateDefaults')
                    , require('label') // e.g. 'Font-Size'
                    , require('unit') // e.g. 'pt'
                    // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
                    , require('getRegisteredPropertySetup', registeredSetup=>{
                            const result = {}
                            // FIXME: default seems not to be used by
                            // UINumberAndRangeOrEmptyInput but I've seen
                            // it used with fontSize ;-(
                            for(const key in ['min', 'max', 'default', 'step']) {
                                if(key in registeredSetup && registeredSetup[key] !== null)
                                    result[key] = registeredSetup[key];
                            }
                            return result;
                        }
                      )
                    ]]
          , [AxesLocationsModel, [UIManualAxesLocations
                    , require('settings:internalPropertyName', 'axesLocations')
                    , require('settings:dependencyMapping', ['baseFontSize', 'fontSize'])
                    // NOTE setting dependencyMapping 'font' without
                    // 'properties@' and 'rootFont' also works, but that is
                    // used in manual configurations.
                    // Where this configurarion is used in type-spec-ramp
                    // the NEW WAY is required..
                    // TODO: rootFont should not be required.
                    , require('settings:dependencyMapping', ['/font', 'rootFont'])
                    , require('settings:dependencyMapping', ['typeSpecProperties@', 'properties@'])
                    , require('settings:dependencyMapping', 'autoOPSZ')
                    , require('raw:getDefaults') // used to be: this._getDefaults.bind(this)
                    , require('ppsRecord')
                    // within dependencyMappings: ...updateDefaultsDependencies
                    // but also injects raw:requireUpdateDefaults
                    , require('requireUpdateDefaults')
                    ]]
          , [StylePatchLinksMapModel, [UIStylePatchesLinksMap
                    , require('settings:internalPropertyName', 'childrenOrderedMap')
                    , require('settings:dependencyMapping', ['./stylePatchesSource', 'sourceMap'])
                    , require('zones')
                    , [] // eventHandlers
                    , 'Style-Links'
                    , true // dragEntries (dragAndDrop)
                    ]]
            // Very similar to UIStylePatchesLinksMap as UIAxesMathLocation
            // and that both are eventually based on _UIBaseMap
            // CAUTION: This case is intended to be used in the context
            // of SimpleStylePatch to be applied e.g. to AxesMathAxisLocationsModel
            // in the AxesMath/Rap-Editor the configuration would need tp
            // be different.
            // UIAxesMathLocation has another problem here:
            // It defines ITEM_DATA_TRANSFER_TYPE which defines itself
            // as dragable and hence creates a drag-handle
            // That's one issue of defining configuration via the constructor:
            // It's harder to change via direct configuration.
            // More fundamentally: if the UIAxesMathLocationsSum
            // would be set up to load its items via a container that
            // loads the actual value UIs AND controls draging, this would
            // be a non-issue!
          , [AxesMathAxisLocationsModel, [UIAxesMathLocation
                , require('settings:internalPropertyName', 'childrenOrderedMap')
                    , require('zones')
                    , [] // eventHandlers
                    , 'Axes-Locations'
                      // this eliminates dragging the key-value entries
                      // to eliminate dragging of the values alone,
                      // we need to pass a flag to the child constructor,
                      // which is not yet intended.
                      // We keep one of the drag-handles to enable deletion
                      // of the element by dropping onto the waste basket.
                      //
                      // This drag handle can be moved to initial position
                      // using CSS display: flex and on the drag-handle order: -1
                      // but we don't use it at all, instead the value handle
                      // can be used to delete the entry
                    , false // dragEntries (dragAndDrop)
                    ]]
          , [LeadingAlgorithmModel, [UILeadingAlgorithm
                , require('settings:rootPath')
                // settings:zone = 'main' ???
                , require('zones')
                , require('injectable')
                , require('ppsRecord')]]
          , [LineWidthLeadingModel, [UITypeDrivenContainer
                , require('settings:rootPath')
                , require('zones')
                , require('injectable')
                , require('ppsMap')
                , require('label')
            ]]
        ])
      , valueOrEmptyUIElements = new Map([
            [StringModel, [UILineOfTextOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label')]]
          , [_AbstractEnumModel, [UISelectOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label'), require('items')]]
          , [CharGroupOptionsModel, [UISelectCharGroupOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , CharGroupOptionsModel.charGroupsData, require('label')]]
          , [BooleanModel, [UICheckboxOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('classToken')
                    , require('label')
                    ]]
            // NumberOrEmptyModel
          , [_AbstractNumberModel, [UINumberAndRangeOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label') // e.g. 'Font-Size'
                    , require('unit') // e.g. 'pt'
                    // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
                    // hmm, maybe for the case of the
                    , require('getRegisteredPropertySetup', registeredSetup=>{
                            const result = {}
                            // FIXME: default seems not to be used by
                            // UINumberAndRangeOrEmptyInput but I've seen
                            // it used with fontSize ;-(
                            for(const key in ['min', 'max', 'default', 'step']) {
                                if(key in registeredSetup && registeredSetup[key] !== null)
                                    result[key] = registeredSetup[key];
                            }
                            return result;
                        }
                      )
            ]]
        ])
      ;
    // create some aliases ...
    for(const [alias, source] of [[BooleanDefaultTrueModel, BooleanModel]]){
        for(const elementsMap of [valueUIElements, valueOrEmptyUIElements])
            if(!elementsMap.has(alias) && elementsMap.has(source))
                elementsMap.set(alias, elementsMap.get(source));
    }
    const isOrEmpty = ModelType.prototype instanceof _AbstractSimpleOrEmptyModel
      , [setupMap, BaseModelType] = isOrEmpty
           ? [valueOrEmptyUIElements, ModelType.Model]
           : [valueUIElements, ModelType]
      , getSetupKey = BaseModelType=>{
            if(setupMap.has(BaseModelType))
                return BaseModelType
            for( const abstractType of [_AbstractNumberModel, _AbstractEnumModel, _AbstractDynamicStructModel])
                if(BaseModelType.prototype instanceof abstractType)
                    return abstractType
            return BaseModelType;
        }
      , SetupKey = getSetupKey(BaseModelType)
      ;
    // NOTE: fails also if !setupMap.has(_AbstractEnumModel) which
    // is expected, as the setupMaps may become arguments/configuration
    // in the future.
    if(!setupMap.has(SetupKey)) {
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        const message = `Can't find generic UI-Element for ModelType ${ModelType.name} `
                    + `(isOrEmpty: ${isOrEmpty}, BaseModelType: ${BaseModelType.name}).`;
        console.warn(message);
        const args = [ModelType.name, message, require('fullKey'), require('label')];
        return [UIMissingUIElement, BaseModelType, args];
    }
    const [UIElement, ...args] = setupMap.get(SetupKey);
    return [UIElement, BaseModelType, args];
}

/**
 * Since this is never used, I guess it may be a good starting point for an
 * doucumentation/example implementation or it could become a true generic
 * implementation.
 *
 *
 * injectable is e.g. a dict like this:
 * , {
 *      updateDefaultsDependencies
 *    , requireUpdateDefaults
 *    , getDefaults: this._getDefaults.bind(this)
 *  }
 *
 * propertyRoot seems to be a path to be used in getDefaults
 * e.g. like:
 *      this._getDefaults = injectable.getDefaults.bind(null, propertyRoot);
 *      then
 *      default = this._getDefaults(fieldName);
 * or like:
 *      fullKey = `${propertyRoot}${fieldName}`
 *      getRegisteredPropertySetup(fullKey, {label:fieldName}).label || fieldName;
 */
export class UITypeDrivenContainer extends _BaseTypeDrivenContainerComponent {
    constructor(widgetBus, _zones, injectable, ppsMap, label) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_generic_struct_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        // When using StaticNode via widgets, it's not inserted right away.
        // and the position is lost relative to the sibling widgets to the
        // end of the container.
        // zones.get('main').append(localZoneElement);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        const entry =  this.widgetBus.getEntry(this.widgetBus.rootPath)
        const TypeClass = entry instanceof _AbstractDynamicStructModel
            ? entry.WrappedType
            : entry.constructor
            ;
        const widgets = this._defineWidgets(TypeClass, injectable, ppsMap, label);
        this._initWidgets(widgets);
    }
    _defineWidgets(TypeClass, injectable, ppsMap, label) {
        const labelDefinition = [
                {zone: 'local'}
              , []
              , StaticTag
              , 'h4'
              , {}
              , [label]
            ];
        return [
            // optional label
            ...(label ? [labelDefinition] : [])
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.has(fieldName) // basically all allowed
                  , {zone: 'local'}
                  , ppsMap
                  , injectable
            )
        ];
    }
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }
}
