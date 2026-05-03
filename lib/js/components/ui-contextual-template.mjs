import { ForeignKey, FreezableMap } from "../metamodel.mjs";

import {
    _BaseContainerComponent,
    _BaseDynamicCollectionContainerComponent,
    _UIBaseListContainerItem,
    _UIAbstractPlainInputWrapper,
} from "./basics.mjs";

import {
    StaticTag,
    StaticNode,
    GenericSelect,
    PlainNumberAndRangeInput,
} from "./generic.mjs";

import {
    _BaseTypeDrivenContainerComponentMixin,
    UITypeDrivenListWithAddButton,
    simpleArgument,
} from "./type-driven-ui-basics.mjs";

import {
        ProcessedPropertiesSystemMap,
        ProcessedPropertiesSystemRecord
} from "./registered-properties-definitions.mjs";

import { createCharsSelector } from "./actors/videoproof-contextual-models.mjs";

import { getCharGroupSummaryFromModel } from "./ui-char-groups.mjs";

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
        const shifted = { ...minMaxValueStep };
        if ("min" in shifted) shifted.min += 1;
        if ("max" in shifted) shifted.max += 1;
        if ("default" in shifted) shifted.default += 1;
        if ("value" in shifted) shifted.value += 1;
        const offsetHandler = (value) => changeHandler(value - 1);
        super(domTool, offsetHandler, label, unit, shifted);
    }

    update(value) {
        super.update(value + 1);
    }
}

export const UIArgIndexInput = _UIAbstractPlainInputWrapper.createClass(
    "UIArgIndexInput",
    PlainArgIndexInput,
);

function _truncateSummary(value, maxLength = 36) {
    const text = `${value ?? ""}`;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function _getSelectorSummary(selectorModel) {
    const typeKey = selectorModel.get("selectorTypeKey").value;
    if (typeKey === ForeignKey.NULL) return "(none)";

    const instanceWrapper = selectorModel.get("instance");

    if (!instanceWrapper.hasWrapped) return typeKey || "(none)";

    const availableCharsSelectorTypes = selectorModel.get(
        "availableCharsSelectorTypes",
    );
    const label = availableCharsSelectorTypes.get(typeKey).get("label").value;
    const instance = instanceWrapper.wrapped;
    if (typeKey === "Simple") {
        const argIndex = instance.get("argIndex").value,
            charGroup = instance.get("charGroup");
        return `${label}(arg${argIndex}): ${getCharGroupSummaryFromModel(charGroup)}`;
    }

    if (typeKey === "CombinatorAnd" || typeKey === "CombinatorOr") {
        const children = instance.get("children").size;
        return `${label}(${children} child${children === 1 ? "" : "ren"})`;
    }

    return `${label}`;
}

function _getTemplateRuleSummary(ruleModel) {
    const pattern = _truncateSummary(ruleModel.get("pattern").value || "", 24),
        selector = _getSelectorSummary(ruleModel.get("selector"));
    return `pattern: "${pattern}" · ${selector}`;
}

// UIContextualTemplateContainer: hardcoded container for TemplateModel.
// Contains a label and as data fields: defaultPattern string input, and the rules list
export class UIContextualTemplateContainer extends _BaseTypeDrivenContainerComponentMixin(
    _BaseContainerComponent,
) {
    constructor(widgetBus, _zones, injectable, propertyRoot, label) {
        const localZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_contextual_template_container",
            }),
            contentsZoneElement = widgetBus.domTool.createElement("div"),
            zones = new Map([
                ..._zones,
                ["local", localZoneElement],
                ["contents", contentsZoneElement],
            ]);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        this._injectable = injectable;
        const TypeClass = this.widgetBus.getEntry(
            this.widgetBus.rootPath,
        ).constructor;
        const widgets = this._defineWidgets(
            TypeClass,
            contentsZoneElement,
            injectable,
            propertyRoot,
            label,
        );
        this._initWidgets(widgets);
    }
    _defineWidgets(
        TypeClass,
        contentsZoneElement,
        injectable,
        propertyRoot,
        label,
    ) {
        const generalSettings = { zone: "contents" },
            ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot,
                TypeClass.fields.keys(),
            );
        return [
            [{ zone: "local" }, [], StaticTag, "h4", {}, [label]],
            [{ zone: "local" }, [], StaticNode, contentsZoneElement],
            ...this._defineGenericWidgets(
                TypeClass,
                (fieldName) => TypeClass.fields.has(fieldName),
                generalSettings,
                ppsMap,
                injectable,
            ),
        ];
    }
}

// UICharsSelectorContainer: a dynamic-type container for CharsSelectorModel.
// Follows the UILeadingAlgorithm pattern: a GenericSelect for the type key,
// plus dynamically provisioned widgets for the selected type's instance.
export class UICharsSelectorContainer extends _BaseTypeDrivenContainerComponentMixin(
    _BaseDynamicCollectionContainerComponent,
) {
    constructor(widgetBus, _zones, injectable, propertyRoot) {
        const localZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_chars_selector_container",
                tabindex: "0",
            }),
            summaryElement = widgetBus.domTool.createElement("div", {
                class: "ui_chars_selector_container-summary",
            }),
            contentsZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_chars_selector_container-contents",
            }),
            zones = new Map([
                ..._zones,
                ["local", localZoneElement],
                ["contents", contentsZoneElement],
            ]);
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
                { zone: "contents" },
                [
                    ["availableCharsSelectorTypes", "options"],
                    ["selectorTypeKey", "value"],
                ],
                GenericSelect,
                "ui_chars_selector_select", // baseClass
                "Selector Type", // labelContent
                (key, availableType) => availableType.get("label").value, // optionGetLabel
                [true, "(none)", ForeignKey.NULL], // [allowNull, allowNullLabel, nullModelValue]
                this._changeTypeHandler.bind(this), // onChangeFn
            ],
        ];
    }

    _changeTypeHandler(newValue) {
        if (newValue === ForeignKey.NULL) return;
        const hostDraft = this.getEntry(this.widgetBus.rootPath.parent),
            fieldName = this.widgetBus.rootPath.parts.at(-1),
            wrapper = hostDraft.get(fieldName).get("instance"),
            newInstance = createCharsSelector(newValue, wrapper.dependencies);
        hostDraft.set(fieldName, newInstance);
    }

    _provisionWidgets() {
        const removedDynamicWidgets = this._widgets.splice(
            this._initialWidgetsAmount,
            Infinity,
        );
        const requiresFullInitialUpdate =
            _BaseContainerComponent.prototype._provisionWidgets.call(this);
        const host = this.getEntry("."),
            dynInstance = host.get("instance"),
            FieldType = dynInstance.hasWrapped ? dynInstance.WrappedType : null;
        if (FieldType === null) {
            // No type selected — remove all dynamic widgets.
        } else if (this._ActiveInstanceType === FieldType) {
            // Same type — keep existing widgets.
            this._widgets.push(...removedDynamicWidgets);
            removedDynamicWidgets.splice(0, Infinity);
        } else {
            // Type changed — rebuild widgets for the new instance type.
            const instancePath = this.widgetBus.rootPath.append("instance"),
                ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                    `${this._propertyRoot}instance/`,
                    FieldType.fields.keys(),
                ),
                widgetDefinitions = this._defineGenericWidgets(
                    FieldType,
                    (fieldName) => FieldType.fields.has(fieldName),
                    { zone: "contents", rootPath: instancePath },
                    ppsMap,
                    this._injectable,
                );
            this._initWidgets(widgetDefinitions);
        }
        this._ActiveInstanceType = FieldType;
        for (const widgetWrapper of removedDynamicWidgets)
            this._destroyWidget(widgetWrapper);
        for (const widgetWrapper of this._widgets.slice(
            this._initialWidgetsAmount,
        )) {
            const isActive = widgetWrapper.widget !== null;
            if (!isActive) {
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }

    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        const result = super._update(
            compareResult,
            requiresFullInitialUpdateSet,
            isInitialUpdate,
        );
        this._updateSummary();
        return result;
    }

    _updateSummary() {
        this._summaryElement.textContent = `Selector: ${_getSelectorSummary(this.getEntry("."))}`;
    }
}

class UIContextualTemplateRuleListItem extends _BaseTypeDrivenContainerComponentMixin(
    _UIBaseListContainerItem,
) {
    static TYPE_CLASS_PART = "type_driven";

    constructor(
        widgetBus,
        _zones,
        ppsRecord,
        eventHandlers = [],
        draggable = false,
        deletable = false,
        injectable = null,
        transferTypePath = null,
    ) {
        const summaryElement = widgetBus.domTool.createElement("div", {
                class: "ui_contextual_template_rule_item-summary",
            }),
            contentsZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_contextual_template_rule_item-contents",
            }),
            zones = new Map([..._zones, ["contents", contentsZoneElement]]);
        super(widgetBus, zones, eventHandlers, draggable, deletable);

        this.element.classList.add("ui_contextual_template_rule_item");
        this.element.setAttribute("tabindex", "0");
        this.element.append(summaryElement, contentsZoneElement);
        this._injectable = injectable;
        this.ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;
        this._summaryElement = summaryElement;

        const entry = this.widgetBus.getEntry(this.widgetBus.rootPath),
            TypeClass = entry.constructor,
            ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                ppsRecord.propertyRoot,
                TypeClass.fields.keys(),
            ),
            widgets = [
                ...this._defineGenericWidgets(
                    TypeClass,
                    (fieldName) => TypeClass.fields.has(fieldName),
                    { zone: "contents" },
                    ppsMap,
                    this._injectable,
                ),
            ];
        this._initWidgets(widgets);
        this._updateSummary();
    }

    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        const result = super._update(
            compareResult,
            requiresFullInitialUpdateSet,
            isInitialUpdate,
        );
        // call always???
        this._updateSummary();
        return result;
    }

    _updateSummary() {
        this._summaryElement.textContent = _getTemplateRuleSummary(
            this.getEntry(this.widgetBus.rootPath),
        );
    }
}

export class UIContextualTemplateRulesList extends UITypeDrivenListWithAddButton {
    static ADD_BUTTON_TEXT = "+ add rule";
    static UIItem = UIContextualTemplateRuleListItem;
    _itemsDeletable = true;
}

class UICharsSelectorContainerItem extends _UIBaseListContainerItem {
    static TYPE_CLASS_PART = "selector_container_item";
    constructor(
        widgetBus,
        _zones,
        ppsRecord,
        eventHandlers = [],
        draggable = false,
        deletable = false,
        injectable = null,
        transferTypePath = null,
    ) {
        super(widgetBus, _zones, eventHandlers, draggable, deletable);

        if(!(ppsRecord  instanceof ProcessedPropertiesSystemRecord))
            throw new Error(`${this.constructor.name} ppsRecord is not a ProcessedPropertiesSystemRecord!`);
        const propertyRoot = ppsRecord.propertyRoot;

        this._injectable = injectable;
        this.ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;

        // OK so here we can initialize the UICharsSelectorContainer then ...
        const widgets = [
            [
                { zone: "local" },
                [],
                UICharsSelectorContainer,
                this._zones,
                this._injectable,
                propertyRoot,
            ],
        ];
        this._initWidgets(widgets);
    }
}

// The child is no longer a dynamic list, not sure if this type makes sense
// as such.
export class UICharsSelectorItemsList extends UITypeDrivenListWithAddButton {
    static ADD_BUTTON_TEXT = "+ add selector";
    static UIItem = UICharsSelectorContainerItem;
    _itemsDeletable = true;

    // instance generic/template/rules/0/selector/children/0/instance
    // DynamicCharsSelectorModel Can't find generic UI-Element for ModelType
    // DynamicCharsSelectorModel (isOrEmpty: false, BaseModelType: DynamicCharsSelectorModel).
    // This is interesting, as UICharsSelectorContainer already handles the
    // dynamic type, but it's not a proper list item!
    // We should hence rather have that wrapped as a list item than this
}

// TODO: CHECK: UITypeDrivenListWithAddButton
// UHH, hmm, OK, does this eventually use UICharGroupContainer ???
// Don't think so, I guess the resolution is like this:
//      the child/item represents the actual child item and it
//      resolves each of those children type driven, while, actually
//      it would be better to check if we can represent the child item
//      directly with another UI and use that.
//      so, maybe this whole class, the item class should not itself
//      resolve type-driven, but rather use the default type driven
//      container and wrap it, but only if there's no direct match.
//
// Similar to UICharsSelectorItemsList but UICharsSelectorContainerItem would
// type driven either match CharsSelectorModel -> UICharsSelectorContainer
// directly OR use anyModel -> UITypeDrivenContainer
//
// I'd like to have a way, to specify the label of the children->children
// here, they are currently an index (i) but should be i=>`$${i+1}` but
// that's very specific for the use case in videoproof-contextual where
// the placeholder for the chars in the patterns are $1 and $2
// so, maybe, going down from the VideoproofContextualKeyMomentModel
// we can say very specifically thet the generic/chargGroups/{fieldName}
// label should be handled like  fieldName=>`$${i+1}` basically, an override
// of the default _BaseTypeDrivenContainerComponentMixin._getArgumentConfig
// behavior...!
//
// soo, it's rather hard to change _getArgumentConfig, or to be more precise,
// it's rather unprecedented. We could though, maybe change the
// uiElementsMap definition, to include a paramerter payload function:
//          if(typeof parameter.payload === 'function')
//                argument = parameter.payload(argument);
// or change it completeley to not evem include an require('label'). in the
// case above the `argument` is actually the result of resolving 'label',
// so whatever we use to apply to that, it might at some point in the future
// be transformed and it would not make sense to i=>`$${i}`
//
// TBH overriding the definition of the "label" getter is likeley the
// best way forward, as it is semantically the right thing to do. Overriding
// the require definitions to get something else instead defeats the purpose
// of the named requirements and will be hard to keep when eventually the
// configuration is attached to the UI-Elements directly.

class UICharGroupArgumentsListItem extends UITypeDrivenListWithAddButton.UIItem {
    static _resolvers = Object.freeze(
        new FreezableMap([
            ...UITypeDrivenListWithAddButton.UIItem._resolvers, // inherit
            [
                "label",
                simpleArgument(({ fieldName }) => {
                    return `char group for argument $${parseInt(fieldName) + 1}`;
                }),
            ],
        ]),
    );
}

export class UICharGroupArgumentsList extends UITypeDrivenListWithAddButton {
    static ADD_BUTTON_TEXT = "+ add char group";
    static UIItem = UICharGroupArgumentsListItem;
    _itemsDeletable = true;
}
