

import {
    _AbstractEnumModel
  , _AbstractNumberModel
  , _AbstractDynamicStructModel
  , StringModel
  , BooleanModel
  , Path
} from '../metamodel.mjs';

import {
    _UIBaseList
  , _UIBaseListContainerItem
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
  , _BaseTypeDrivenContainerComponentMixin
  , _BaseTypeDrivenContainerComponent
  , createTypeToUIElementFunction
} from './type-driven-ui-basics.mjs';

import {
    CharGroupOptionsModel
  , CharGroupModel
} from './actors/videoproof-array.mjs';

import {
    CharGroupsListModel
} from './actors/videoproof-contextual-models.mjs';

import {
    getTransferTypesForModel
} from './data-transfer-types.mjs';

import {
    OpenTypeFeaturesModel
} from './actors/models.mjs';

import {
    UIOTFeaturesChooser
} from './ui-opentype-features.typeroof.jsx';

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
   , LeadingAlgorithmModel
   , LineWidthLeadingModel
   , ManualMarginsModel
} from './type-spec-models.mjs';

import {
    UIStylePatchesLinksMap
  , UILeadingAlgorithm
} from './type-spec-fundamentals.mjs';


import {
    UIMargins
} from './ui-margins.typeroof.jsx';

import {
    AxesMathAxisLocationsModel
  , UIAxesMathLocation
} from './axes-math.mjs';

import {
    LanguageTagModel
  , UILanguageTag
} from './language-tags.typeroof.jsx';

// FIXME: maybe rather change the imports
export {ProcessedPropertiesSystemMap, ProcessedPropertiesSystemRecord};

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
 */

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
}

// UITypeDrivenListItem: a list item that renders type-driven widgets
// for a fixed-type list model (e.g., CharGroupsListModel).
// Combines _UIBaseListContainerItem (list lifecycle, drag-and-drop)
// with _BaseTypeDrivenContainerComponentMixin (auto-widget generation).
class UITypeDrivenListItem extends _BaseTypeDrivenContainerComponentMixin(_UIBaseListContainerItem) {
    static TYPE_CLASS_PART = 'type_driven';

    // Transfer type is set per-instance by the parent list,
    // since it depends on the list's item model type.
    static ITEM_DATA_TRANSFER_TYPE_PATH = null;

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false, injectable=null, transferTypePath=null) {
        super(widgetBus, _zones, eventHandlers, draggable);
        this._injectable = injectable;
        this._transferTypePath = transferTypePath;

        const entry = this.widgetBus.getEntry(this.widgetBus.rootPath)
          , TypeClass = entry.constructor
          , propertyRoot = this.widgetBus.rootPath.toString()
          , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot, TypeClass.fields.keys())
          , widgets = [
                ...this._defineGenericWidgets(
                      TypeClass
                    , fieldName=>TypeClass.fields.has(fieldName)
                    , {zone: 'local'}
                    , ppsMap
                    , this._injectable
                )
            ]
          ;
        this._initWidgets(widgets);
    }

    // FIXME: _dragstartHandlerMethod -> yo this is the original implementation
    // when we fix the this._transferTypePath issue we can remove this again
    _dragstartHandler(event) {
        const path = this.widgetBus.rootPath;
        event.dataTransfer.setData(this._transferTypePath, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${this._transferTypePath}: ${path}]`);
        this.element.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(this.element, 0, 0);
    }

    // The model added this, but looking at the early return, it's obvious
    // that we can initialize the widget in the constructor!
    /*
    _provisionWidgets(compareResult) {
        // Only provision once — fixed type, no dynamic switching.
        if(this._widgets.length > 0)
            return super._provisionWidgets(compareResult);

        if(!this._injectable)
            throw new Error(`${this.constructor.name} requires injectable to provision widgets.`);

        const entry = this.widgetBus.getEntry(this.widgetBus.rootPath)
          , TypeClass = entry.constructor
          , propertyRoot = this.widgetBus.rootPath.toString()
          , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot, TypeClass.fields.keys())
          ;
        const widgetDefinitions = this._defineGenericWidgets(
                TypeClass
              , fieldName=>TypeClass.fields.has(fieldName)
              , {zone: 'local'}
              , ppsMap
              , this._injectable
        );
        for(const [settings, dependencyMappings, Constructor, ...args] of widgetDefinitions) {
            const widgetWrapper = this._initWrapper(
                    this._childrenWidgetBus, settings
                  , dependencyMappings, Constructor, ...args);
            this._widgets.push(widgetWrapper);
        }
        return super._provisionWidgets(compareResult);
    }
    */
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }
}

// UITypeDrivenList: a generic list container for fixed-type list models.
// DnD types are derived from the item model via getTransferTypesForModel.
class UITypeDrivenList extends _UIBaseList {
    static ROOT_CLASS = `ui_type_driven-list`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UITypeDrivenListItem;

    constructor(widgetBus, _zones, injectable, label=null) {
        const items = widgetBus.getEntry('collection')
          , ItemModel = items.constructor.Model
          , transferTypes = getTransferTypesForModel(ItemModel)
          ;

        const labelElement = label
                ? widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label)
                : null
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {})
          , localZoneElement = widgetBus.domTool.createElement('div', {}, [])
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        localZoneElement.append(childrensMainZoneElement);
        super(widgetBus, zones, 'main');

        if(label)
            this.element.append(labelElement);
        this.element.append(childrensMainZoneElement);

        this._setClassesHelper([
                ...(label ? [[labelElement, 'label']] : [])
              , [childrensMainZoneElement, 'items']
        ]);

        this._injectable = injectable;
        this._transferTypes = transferTypes;
        // extra args: pass injectable and transferTypePath to the item
        // used in super-class _createWrapper
        this.itemExtraArguments = [
                this._injectable
              , this._transferTypes.PATH
        ];
    }

    // this also needs fixing, though this will be the future shape!
    get ITEM_DATA_TRANSFER_TYPE_PATH() {
        return this._transferTypes.PATH;
    }

    // this also needs fixing, though this will be the future shape!
    get ITEM_DATA_TRANSFER_TYPE_CREATE() {
        return this._transferTypes.CREATE;
    }

    _createNewItem(targetPath, insertPosition, items/*, value*/) {
        return items.constructor.Model.createPrimalDraft(items.dependencies);
    }
}

export const uiElementsMap = new Map([
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
          , [CharGroupsListModel, [UITypeDrivenList
                , require('settings:internalPropertyName', 'collection')
                , require('zones')
                , require('injectable')
                , require('label')
            ]]
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
                    , require('label') // e.g. 'Font Size'
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
                    , 'Style Links'
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
          , [OpenTypeFeaturesModel, [UIOTFeaturesChooser
              //, require('settings:rootPath')
              , require('settings:internalPropertyName', 'openTypeFeatures')
              , require('settings:dependencyMapping', ['/font', 'rootFont'])
              // badly portable!
              // , require('settings:dependencyMapping', ['typeSpecProperties@', 'properties@'])
              // in injectable do: 'properties@': ['typeSpecProperties@', 'properties@']
              , require('zones')
              , require('raw:getDefaults')
              , require('requireUpdateDefaults')
              , require('updateDefaultsDependencies')
            ]]
          , [LanguageTagModel, [UILanguageTag
              , require('settings:rootPath')
              , require('zones')
              // the requireUpdateDefaults and getDefault dependencies
              // if the UISelectOrEmptyInput are filled with dummy functions
              // internally.
            ]]
          , [ManualMarginsModel, [UIMargins
              , require('settings:rootPath')
              , require('zones')
              , require('label')
            ]]
        ])
  , orEmptyUIElementsMap = new Map([
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
                    , require('label') // e.g. 'Font Size'
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
  , genericTypeToUIElement = createTypeToUIElementFunction(uiElementsMap, orEmptyUIElementsMap)
  ;
