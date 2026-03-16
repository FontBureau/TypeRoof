

import {
    _AbstractEnumModel
  , _AbstractNumberModel
  , _AbstractDynamicStructModel
  , ForeignKey
  , StringModel
  , BooleanModel
  , Path
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _UIBaseListContainerItem
} from './basics.mjs';

import {
    StaticTag
  //, StaticNode
  , GenericSelect
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
  , UITypeDrivenList
  , createTypeToUIElementFunction
} from './type-driven-ui-basics.mjs';

import {
    CharGroupOptionsModel
  , CharGroupModel
} from './actors/videoproof-array.mjs';

import {
    CharGroupsListModel
  , CharsSelectorModel
  , CharsSelectorItemsModel
  , TemplateModel
  , TemplateRulesModel
  , createCharsSelector
} from './actors/videoproof-contextual-models.mjs';


import {
    OpenTypeFeaturesModel
} from './actors/models.mjs';

import {
    UIOTFeaturesChooser
} from './ui-opentype-features.typeroof.jsx';

import {
    UICharGroupContainer
  , getCharGroupSummaryFromModel
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

function _truncateSummary(value, maxLength = 36) {
    const text = `${value ?? ''}`;
    if(text.length <= maxLength)
        return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function _getSelectorSummary(selectorModel) {
    const typeKey = selectorModel.get('selectorTypeKey').value;
    if(typeKey === ForeignKey.NULL)
        return '(none)';

    const instanceWrapper = selectorModel.get('instance');
    if(!instanceWrapper.hasWrapped)
        return typeKey || '(none)';

    const instance = instanceWrapper.wrapped;

    if(typeKey === 'Simple') {
        const argIndex = instance.get('argIndex').value
          , charGroups = instance.get('charGroups')
          , groups = []
          ;
        for(const [, charGroup] of charGroups)
            groups.push(getCharGroupSummaryFromModel(charGroup));
        return `Simple(arg${argIndex}): ${groups.length ? groups.join(', ') : '(no groups)'}`;
    }

    if(typeKey === 'Combinator') {
        const combineMode = instance.get('combineMode').value
          , children = instance.get('children').size
          ;
        return `Combinator(${combineMode}, ${children} child${children === 1 ? '' : 'ren'})`;
    }

    return `${typeKey}`;
}

function _getTemplateRuleSummary(ruleModel) {
    const pattern = _truncateSummary(ruleModel.get('pattern').value || '', 24)
      , selector = _getSelectorSummary(ruleModel.get('selector'))
      ;
    return `pattern: "${pattern}" · ${selector}`;
}

// UIContextualTemplateContainer: hardcoded container for TemplateModel.
// Contains a defaultPattern string input, the rules list, and an "add rule" button.
class UIContextualTemplateContainer
        extends _BaseTypeDrivenContainerComponentMixin(_BaseContainerComponent) {
    constructor(widgetBus, _zones, injectable, propertyRoot, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_contextual_template_container'})
          , contentsZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['local', localZoneElement], ['contents', contentsZoneElement]])
          ;
        localZoneElement.append(contentsZoneElement);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        this._injectable = injectable;
        const TypeClass = this.widgetBus.getEntry(this.widgetBus.rootPath).constructor;
        const widgets = this._defineWidgets(TypeClass, contentsZoneElement
                                          , injectable, propertyRoot, label);
        this._initWidgets(widgets);

        // "Add rule" button
        const addButton = widgetBus.domTool.createElement('button'
                , {'class': 'ui_contextual_template_container-add_rule'}
                , '+ add rule');
        addButton.addEventListener('click', ()=>{
            this._changeState(()=>{
                const rules = this.getEntry(this.widgetBus.rootPath.append('rules'));
                rules.push(TemplateRulesModel.Model.createPrimalDraft(rules.dependencies));
            });
        });
        contentsZoneElement.append(addButton);
    }
    _defineWidgets(TypeClass, contentsZoneElement, injectable, propertyRoot, label) {
        const generalSettings = {zone: 'contents'}
          , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(propertyRoot, TypeClass.fields.keys())
          ;
        return [
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'h4'
              , {}
              , [label]
            ]
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.has(fieldName)
                  , generalSettings
                  , ppsMap
                  , injectable
            )
        ];
    }
}

// UICharsSelectorContainer: a dynamic-type container for CharsSelectorModel.
// Follows the UILeadingAlgorithm pattern: a GenericSelect for the type key,
// plus dynamically provisioned widgets for the selected type's instance.
class UICharsSelectorContainer
        extends _BaseTypeDrivenContainerComponentMixin(_BaseDynamicCollectionContainerComponent) {
    constructor(widgetBus, _zones, injectable) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_chars_selector_container', 'tabindex': '0'})
          , summaryElement = widgetBus.domTool.createElement('div', {'class': 'ui_chars_selector_container-summary'})
          , contentsZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_chars_selector_container-contents'})
          , zones = new Map([..._zones, ['local', localZoneElement], ['contents', contentsZoneElement]])
          ;
        localZoneElement.append(summaryElement, contentsZoneElement);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        this._injectable = injectable;
        this._ActiveInstanceType = null;
        this._summaryElement = summaryElement;
        {
            const widgets = this._initialWidgets;
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets);
            this._updateSummary();
        }
    }

    get _initialWidgets() {
        return [
            [
                {zone: 'contents'}
              , [
                    ['availableCharsSelectorTypes', 'options']
                  , ['selectorTypeKey', 'value']
                ]
              , GenericSelect
              , 'ui_chars_selector_select'// baseClass
              , 'Selector Type'// labelContent
              , (key, availableType)=>availableType.get('label').value // optionGetLabel
              , [true, '(none)', ForeignKey.NULL] // [allowNull, allowNullLabel, nullModelValue]
              , this._changeTypeHandler.bind(this) // onChangeFn
            ]
        ];
    }

    _changeTypeHandler(newValue) {
        if(newValue === ForeignKey.NULL)
            return;
        const hostDraft = this.getEntry(this.widgetBus.rootPath.parent)
          , fieldName = this.widgetBus.rootPath.parts.at(-1)
          , wrapper = hostDraft.get(fieldName).get('instance')
          , newInstance = createCharsSelector(newValue, wrapper.dependencies)
          ;
        hostDraft.set(fieldName, newInstance);
    }

    _provisionWidgets() {
        const removedDynamicWidgets = this._widgets.splice(this._initialWidgetsAmount, Infinity);
        const requiresFullInitialUpdate = _BaseContainerComponent.prototype._provisionWidgets.call(this);
        const host = this.getEntry('.')
          , dynInstance = host.get('instance')
          , FieldType = dynInstance.hasWrapped
                            ? dynInstance.WrappedType
                            : null
          ;

        if(FieldType === null) {
            // No type selected — remove all dynamic widgets.
        }
        else if(this._ActiveInstanceType === FieldType) {
            // Same type — keep existing widgets.
            this._widgets.push(...removedDynamicWidgets);
            removedDynamicWidgets.splice(0, Infinity);
        }
        else {
            // Type changed — rebuild widgets for the new instance type.
            const instancePath = this.widgetBus.rootPath.append('instance')
              , instancePropertyRoot = `${instancePath}/`
              , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(instancePropertyRoot, FieldType.fields.keys())
              , widgetDefinitions = this._defineGenericWidgets(
                    FieldType
                  , fieldName=>FieldType.fields.has(fieldName)
                  , {zone: 'contents', rootPath: instancePath}
                  , ppsMap
                  , this._injectable
                )
              ;
            this._initWidgets(widgetDefinitions);
        }
        this._ActiveInstanceType = FieldType;
        for(const widgetWrapper of removedDynamicWidgets)
            this._destroyWidget(widgetWrapper);
        for(const widgetWrapper of this._widgets.slice(this._initialWidgetsAmount)) {
            const isActive = widgetWrapper.widget !== null;
            if(!isActive) {
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }

    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        const result = super._update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate);
        this._updateSummary();
        return result;
    }

    _updateSummary() {
        this._summaryElement.textContent = `Selector: ${_getSelectorSummary(this.getEntry('.'))}`;
    }
}

class UIContextualTemplateRuleListItem extends _BaseTypeDrivenContainerComponentMixin(_UIBaseListContainerItem) {
    static TYPE_CLASS_PART = 'type_driven';

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false, injectable=null, transferTypePath=null) {
        const summaryElement = widgetBus.domTool.createElement('div', {'class': 'ui_contextual_template_rule_item-summary'})
          , contentsZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_contextual_template_rule_item-contents'})
          , zones = new Map([..._zones, ['contents', contentsZoneElement]])
          ;
        super(widgetBus, zones, eventHandlers, draggable);
        this.element.classList.add('ui_contextual_template_rule_item');
        this.element.setAttribute('tabindex', '0');
        this.element.append(summaryElement, contentsZoneElement);
        this._injectable = injectable;
        this.ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;
        this._summaryElement = summaryElement;

        const entry = this.widgetBus.getEntry(this.widgetBus.rootPath)
          , TypeClass = entry.constructor
          , propertyRoot = this.widgetBus.rootPath.toString()
          , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot, TypeClass.fields.keys())
          , widgets = [
                ...this._defineGenericWidgets(
                      TypeClass
                    , fieldName=>TypeClass.fields.has(fieldName)
                    , {zone: 'contents'}
                    , ppsMap
                    , this._injectable
                )
            ]
          ;
        this._initWidgets(widgets);
        this._updateSummary();
    }

    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        const result = super._update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate);
        this._updateSummary();
        return result;
    }

    _updateSummary() {
        this._summaryElement.textContent = _getTemplateRuleSummary(this.getEntry(this.widgetBus.rootPath));
    }
}

// UITypeDrivenListWithAddButton: wraps UITypeDrivenList with an "add" button.
// Subclass per use-case to set ADD_BUTTON_TEXT.
class UIContextualTemplateRulesList extends UITypeDrivenList {
    static UIItem = UIContextualTemplateRuleListItem;
}

class UITypeDrivenListWithAddButton extends UITypeDrivenList {
    static ADD_BUTTON_TEXT = '+ add';
    constructor(widgetBus, _zones, injectable, label=null) {
        super(widgetBus, _zones, injectable, label);
        const addButton = widgetBus.domTool.createElement('button'
                , {'class': 'ui_type_driven_list-add_button'}
                , this.constructor.ADD_BUTTON_TEXT);
        addButton.addEventListener('click', ()=>{
            const rootPath = Path.fromString(this.widgetBus.getExternalName('collection'));
            this._create(rootPath, 'insert', null);
        });
        this.element.append(addButton);
    }
}

class UICharGroupsList extends UITypeDrivenListWithAddButton {
    static ADD_BUTTON_TEXT = '+ add char group';
}

class UICharsSelectorItemsList extends UITypeDrivenListWithAddButton {
    static ADD_BUTTON_TEXT = '+ add selector';

    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath
              , zone: this._childrenMainZone
            }
          , dependencyMappings = [
                ['./', 'value']
            ]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings
              , UICharsSelectorContainer  // Constructor
              , this._zones               // _zones
              , this._injectable          // injectable
        );
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
          , [CharGroupsListModel, [UICharGroupsList
                , require('settings:internalPropertyName', 'collection')
                , require('zones')
                , require('injectable')
                , require('label')
            ]]
          , [TemplateModel, [UIContextualTemplateContainer
                , require('settings:rootPath')
                , require('zones')
                , require('injectable')
                , require('propertyRoot')
                , require('label')
            ]]
          , [TemplateRulesModel, [UIContextualTemplateRulesList
                , require('settings:internalPropertyName', 'collection')
                , require('zones')
                , require('injectable')
                , require('label')
            ]]
          , [CharsSelectorModel, [UICharsSelectorContainer
                , require('settings:rootPath')
                , require('zones')
                , require('injectable')
            ]]
          , [CharsSelectorItemsModel, [UICharsSelectorItemsList
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
