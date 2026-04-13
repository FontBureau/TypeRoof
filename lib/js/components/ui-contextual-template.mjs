import {
    ForeignKey
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _UIBaseListContainerItem
  , _UIAbstractPlainInputWrapper
} from './basics.mjs';

import {
    StaticTag
  , GenericSelect
  , PlainNumberAndRangeInput
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
    TemplateRulesModel
  , createCharsSelector
} from './actors/videoproof-contextual-models.mjs';

import {
    getCharGroupSummaryFromModel
} from './ui-char-groups.mjs';

/**
 * In the templates for the videoproof-contextual patterns we use $1 and
 * $2 as placeholders, these map to argument 0 and argument 1. To make
 * it more obvious for the user to which pattern placeholder the selector
 * belongs, this adds 1 to the actual argument index value.
 */
class PlainArgIndexInput extends PlainNumberAndRangeInput {
    static TEMPLATE = `<div class="number-and-range-input">
    <label><!-- insert: label --></label>
    <!-- insert: unit --><input type='number' size="3" />
    <input type='range' />
</div>`;

    constructor(domTool, changeHandler, label, unit, minMaxValueStep) {
        const shifted = {...minMaxValueStep};
        if ('min' in shifted) shifted.min += 1;
        if ('max' in shifted) shifted.max += 1;
        if ('default' in shifted) shifted.default += 1;
        if ('value' in shifted) shifted.value += 1;
        const offsetHandler = (value) => changeHandler(value - 1);
        super(domTool, offsetHandler, label, unit, shifted);
    }

    update(value) {
        super.update(value + 1);
    }
}

export const UIArgIndexInput = _UIAbstractPlainInputWrapper.createClass(
    'UIArgIndexInput'
  , PlainArgIndexInput
);

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

    const availableCharsSelectorTypes = selectorModel.get('availableCharsSelectorTypes');
    const label = availableCharsSelectorTypes.get(typeKey).get('label').value;
    const instance = instanceWrapper.wrapped;
    if(typeKey === 'Simple') {
        const argIndex = instance.get('argIndex').value
          , charGroup = instance.get('charGroup')
          ;
        return `${label}(arg${argIndex}): ${getCharGroupSummaryFromModel(charGroup)}`;
    }

    if(typeKey === 'CombinatorAnd' || typeKey === 'CombinatorOr') {
        const children = instance.get('children').size;
        return `${label}(${children} child${children === 1 ? '' : 'ren'})`;
    }

    return `${label}`;
}

function _getTemplateRuleSummary(ruleModel) {
    const pattern = _truncateSummary(ruleModel.get('pattern').value || '', 24)
      , selector = _getSelectorSummary(ruleModel.get('selector'))
      ;
    return `pattern: "${pattern}" · ${selector}`;
}

// UIContextualTemplateContainer: hardcoded container for TemplateModel.
// Contains a defaultPattern string input, the rules list, and an "add rule" button.
export class UIContextualTemplateContainer
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
export class UICharsSelectorContainer
        extends _BaseTypeDrivenContainerComponentMixin(_BaseDynamicCollectionContainerComponent) {
    constructor(widgetBus, _zones, injectable, propertyRoot) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_chars_selector_container', 'tabindex': '0'})
          , summaryElement = widgetBus.domTool.createElement('div', {'class': 'ui_chars_selector_container-summary'})
          , contentsZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_chars_selector_container-contents'})
          , zones = new Map([..._zones, ['local', localZoneElement], ['contents', contentsZoneElement]])
          ;
        localZoneElement.append(summaryElement, contentsZoneElement);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);
        this._propertyRoot = propertyRoot;

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
              , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(`${this._propertyRoot}instance/`, FieldType.fields.keys())
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

    constructor(widgetBus, _zones, ppsRecord, eventHandlers=[], draggable=false, injectable=null, transferTypePath=null) {
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
          , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                ppsRecord.propertyRoot, TypeClass.fields.keys())
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
export class UIContextualTemplateRulesList extends UITypeDrivenList {
    static UIItem = UIContextualTemplateRuleListItem;
}

// Based on UITypeDrivenListItem: a list item that renders type-driven widgets
// for a fixed-type list model (e.g., CharGroupsListModel).
class UICharsSelectorContainerItem extends _UIBaseListContainerItem {
    static TYPE_CLASS_PART = 'selector_container_item'
    constructor(widgetBus, _zones, propertyRoot, eventHandlers=[], draggable=false, injectable=null, transferTypePath=null) {
        super(widgetBus, _zones, eventHandlers, draggable);

        this._injectable = injectable;
        this.ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;
        const widgets = [
            [
                {zone: 'local'}
              , []
              , UICharsSelectorContainer
              , this._zones
              , this._injectable
              , propertyRoot
            ]
        ];
        this._initWidgets(widgets);
    }
}

export class UICharsSelectorItemsList extends UITypeDrivenListWithAddButton {
    static ADD_BUTTON_TEXT = '+ add selector';
    static UIItem = UICharsSelectorContainerItem;
}
