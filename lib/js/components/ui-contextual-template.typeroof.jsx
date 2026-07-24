import { ForeignKey, FreezableMap, Path } from "../metamodel.mjs";

import {
    _BaseComponent,
    _BaseContainerComponent,
    _BaseDynamicCollectionContainerComponent,
} from "./basics/component.mjs";

import { _UIAbstractPlainInputWrapper } from "./basics/input-wrappers.mjs";

import { _UIBaseListContainerItem } from "./basics/ui-list.mjs";

import {
    StaticNode,
    GenericSelect,
    PlainNumberAndRangeInput,
    UILineOfTextInput,
    Collapsible,
    PlainToggleButton,
} from "./generic.mjs";

import { createIcon } from "./icons.mjs";

import {
    _BaseTypeDrivenContainerComponentMixin,
    UITypeDrivenListWithAddButton,
    simpleArgument,
} from "./type-driven-ui-basics.mjs";

import {
    ProcessedPropertiesSystemMap,
    ProcessedPropertiesSystemRecord,
} from "./registered-properties-definitions.mjs";

import { createCharsSelector } from "./actors/videoproof-contextual/models.mjs";

import { getCharGroupSummaryFromModel } from "./ui-char-groups.mjs";

import "./ui-contextual-template.css";

/**
 * In the templates for the videoproof-contextual patterns we use '\1' and
 * '\2' as placeholders, these map to argument 0 and argument '\1'. To make
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

function _getSelectorSummary(selectorModel, depth = 0) {
    const typeKey = selectorModel.get("selectorTypeKey").value;
    const indent = " ".repeat(depth * 2);
    if (typeKey === ForeignKey.NULL) return `${indent}(-NULL-)`;

    const instanceWrapper = selectorModel.get("instance");

    // initial value.
    if (!instanceWrapper.hasWrapped) return typeKey || "-";

    const availableCharsSelectorTypes = selectorModel.get(
        "availableCharsSelectorTypes",
    );
    const label = availableCharsSelectorTypes.get(typeKey).get("label").value;
    const instance = instanceWrapper.wrapped;
    if (typeKey === "Simple") {
        const argIndex = instance.get("argIndex").value,
            charGroup = instance.get("charGroup");
        // '\xa0' === nbsp
        return `${indent}\\${argIndex + 1}:\xa0${getCharGroupSummaryFromModel(charGroup)}`;
    }

    if (typeKey === "CombinatorAnd" || typeKey === "CombinatorOr") {
        const children = instance
            .get("children")
            .value.map((selectorModel) =>
                _getSelectorSummary(selectorModel, depth + 1),
            );
        return `${indent}${label}(${children.length ? "\n" : ""}${children.join(",\n")}${children.length ? "\n" + indent : ""})`;
    }

    return `${indent}${label}`;
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
            contentsZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_contextual_template-contents",
            }),
            zones = new Map([
                ..._zones,
                ["local", localZoneElement],
                ["contents", contentsZoneElement],
            ]);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        this._injectable = {
            ...injectable,
            getDefaults: (ppsRecord, modelFieldName, defaultVal) => {
                // The problem is, that we cut out the taking part of the
                // TemplateModel in the PPS and thus, the usual getDefaults
                // implementation doesn't work anymore.
                // This is a very simple replacement, but let's see if it breaks.
                //
                // arguments, an example:
                //      ppsRecord: Object { prefix: "generic/template/rules/0/selector/instance/charGroup/",
                //             fullKey: "generic/template/rules/0/selector/instance/charGroup/options",
                //             modelFieldName: "options"
                //      modelFieldName: "options"
                //      ...args: ["all-gid"] // the fallback
                //
                // Works because we have based the ppsReccords on the actual
                // model structure. Maybe a good learing for the next system:
                // include a full path to the source model?
                // Will only work for simple values.
                const propertyRootPath = Path.fromString(propertyRoot),
                    ppsFullPath = Path.fromString(ppsRecord.fullKey),
                    relPath = ppsFullPath.toRelative(propertyRootPath),
                    absPath = this.widgetBus.rootPath.append(...relPath.parts),
                    field = this.getEntry(absPath);
                // duck-typing OrEmpty: implicitly `isEmpty` won't be true if
                //  it is not an OrEmpty model.
                return field.isEmpty ? defaultVal : field.value;
            },
        };
        const TypeClass = this.widgetBus.getEntry(
            this.widgetBus.rootPath,
        ).constructor;
        const widgets = this._defineWidgets(
            TypeClass,
            this._injectable,
            propertyRoot,
            label,
        );
        this._initWidgets(widgets);
    }

    // NOTE: contentsZoneElement is acquired by: this._zones.get('contents')
    _defineWidgets(TypeClass, injectable, propertyRoot, label) {
        const generalSettings = { zone: "contents" },
            ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot,
                TypeClass.fields.keys(),
            );
        return [
            [
                { zone: "local" },
                [],
                Collapsible,
                label,
                this._zones.get("contents"),
            ],
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
            contentsZoneElement = widgetBus.domTool.createElement("div", {
                class: "ui_chars_selector_container-contents",
            }),
            zones = new Map([
                ..._zones,
                ["local", localZoneElement],
                ["contents", contentsZoneElement],
            ]);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);
        this._propertyRoot = propertyRoot;
        if (propertyRoot === undefined)
            throw new Error(
                `${this} propertyRoot is undefined _zones:${_zones} injectable:${injectable} widgetBus:${widgetBus}`,
            );

        this._injectable = injectable;
        this._ActiveInstanceType = null;
        {
            const widgets = this._initialWidgets;
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets);
        }
    }

    get _initialWidgets() {
        return [
            [{ zone: "local" }, [], StaticNode, this._zones.get("contents")],
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
                // maybe disallow to set null?
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
}

class UICharsSelectorSummary extends _BaseComponent {
    constructor(widgetBus, eventListeners = []) {
        super(widgetBus);
        [this.element] = this._initTemplate(eventListeners);
    }
    _initTemplate(eventListeners = []) {
        const h = this._domTool.h,
            element = <div class="ui-chars-selector-summary"></div>;

        for (const listenerArgs of eventListeners)
            element.addEventListener(...listenerArgs);

        this._insertElement(element);
        return [element];
    }
    update(changedMap) {
        const selector = changedMap.get("selector");
        this.element.textContent = _getSelectorSummary(selector);
    }
}

export class UIContextualTemplateRule extends _BaseTypeDrivenContainerComponentMixin(
    _BaseContainerComponent,
) {
    constructor(widgetBus, _zones, injectable, propertyRoot, label) {
        const baseClass = "ui_contextual_template_rule",
            localZoneElement = widgetBus.domTool.createElement("div", {
                class: baseClass,
                tabindex: 0,
            }),
            contentsZoneElement = widgetBus.domTool.createElement("div", {
                class: `${baseClass}-contents`,
            }),
            zones = new Map([
                ..._zones,
                ["local", localZoneElement],
                ["contents", contentsZoneElement],
            ]);
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);
        {
            this._editButton = new PlainToggleButton(
                this._domTool,
                this._toggleEdit.bind(this, null),
                "edit",
                createIcon("edit_off"),
                createIcon("edit"),
                "Edit",
            );
        }
        this._edit = null;
        this._toggleEdit(false);
        this._injectable = injectable;
        const TypeClass = this.widgetBus.getEntry(
            this.widgetBus.rootPath,
        ).constructor;
        const widgets = this._defineWidgets(
            TypeClass,
            injectable,
            propertyRoot,
            label,
        );
        this._initWidgets(widgets);
    }

    /**
     * use a boolean for value to set an explicit state, otherwise, use
     * null to toggle the current value
     */
    _toggleEdit(value = null) {
        this._edit = value === null ? !this._edit : !!value;
        this._editButton.update(this._edit);
        this._zones
            .get("local")
            .classList[this._edit ? "add" : "remove"]("edit");
    }

    _defineWidgets(
        TypeClass,
        injectable,
        propertyRoot,
        //label,
    ) {
        const generalSettings = { zone: "contents" },
            ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot,
                TypeClass.fields.keys(),
            ),
            omit = new Set(["pattern"]);
        return [
            // custom
            [{ zone: "local" }, [["pattern", "value"]], UILineOfTextInput],
            [{ zone: "tools" }, [], StaticNode, this._editButton.element],
            [
                { zone: "local" },
                ["selector"],
                UICharsSelectorSummary,
                [["click", this._toggleEdit.bind(this, null)]],
            ],
            // type driven zone
            [{ zone: "local" }, [], StaticNode, this._zones.get("contents")],
            // type driven
            ...this._defineGenericWidgets(
                TypeClass,
                (fieldName) => {
                    return (
                        !omit.has(fieldName) && TypeClass.fields.has(fieldName)
                    );
                },
                generalSettings,
                ppsMap,
                injectable,
            ),
        ];
    }
}

export class UICharsSelectorContainerItem extends _UIBaseListContainerItem {
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

        if (!(ppsRecord instanceof ProcessedPropertiesSystemRecord))
            throw new Error(
                `${this.constructor.name} ppsRecord is not a ProcessedPropertiesSystemRecord!`,
            );
        const propertyRoot = ppsRecord.propertyRoot;

        this._injectable = injectable;
        this._ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;

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

export class UICharGroupArgumentsListItem extends UITypeDrivenListWithAddButton.UIItem {
    static _resolvers = Object.freeze(
        new FreezableMap([
            ...UITypeDrivenListWithAddButton.UIItem._resolvers, // inherit
            [
                "label",
                simpleArgument(({ fieldName }) => {
                    return `char group argument \\${parseInt(fieldName) + 1}`;
                }),
            ],
        ]),
    );
}
