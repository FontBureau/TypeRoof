/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    ForeignKey
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _UIBaseListContainerItem
} from './basics.mjs';

import {
    StaticTag
  , GenericSelect
} from './generic.mjs';

import {
    _BaseTypeDrivenContainerComponentMixin
  , UITypeDrivenList
  , UITypeDrivenListWithAddButton
} from './type-driven-ui-basics.mjs';

import {
    ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

import {
    CharsSelectorModel
  , TemplateRulesModel
  , createCharsSelector
} from './actors/videoproof-contextual-models.mjs';

import {
    getCharGroupSummaryFromModel
} from './ui-char-groups.mjs';

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
              , UICharsSelectorContainer
              , this._zones
              , this._injectable
        );
    }
}

export {
    UIContextualTemplateContainer,
    UIContextualTemplateRulesList,
    UICharsSelectorContainer,
    UICharsSelectorItemsList,
};
