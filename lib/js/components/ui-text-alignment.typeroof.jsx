import { Path } from "../metamodel.mjs";

import { _BaseContainerComponent, UIButton } from "./basics.mjs";

import { StaticNode } from "./generic.mjs";

import { createIconAndLabel } from "./icons.mjs";

import "./ui-text-alignment.css";

// this is about a special interface for the TextAlignmentOrEmptyModel
// it is at it's core an _AbstractEnum and the default UISelectOrEmptyInput
// is handling it OK. However: We want to have the usual alignment icons
// and the Start and End alignment icons require custom drawings as they
// are not in the Material Symbols font and also will react to the writing
// direction choice.
// So, at it's core a UIOptionsAsButtons then enhanced to UITextAlignment
// and then wrapped into

class UITextAlignmentButton extends UIButton {
    constructor(widgetBus, value, getDefaults, label, eventHandlers, _options) {
        const options = { ..._options, typeClassPart: "text_alignment" };
        super(widgetBus, label, eventHandlers, options);
        this._value = value;
        this._getDefaults = getDefaults;
    }
    update(changedMap) {
        const value = changedMap.has("value")
                ? changedMap.get("value")
                : this.getEntry("value"),
            currentValue = value.isEmpty ? this._getDefaults() : value.value;
        this.element.classList[value.isEmpty ? "add" : "remove"]("inherited");
        this.element.classList[currentValue === this._value ? "add" : "remove"](
            "active",
        );
    }
}

class UITextAlignmentWithDirectionButton extends UITextAlignmentButton {
    constructor(
        widgetBus,
        value,
        ppsRecordTextAlign,
        ppsRecordDirection,
        getDefaults,
        labelMap,
        eventHandlers,
        options,
    ) {
        super(
            widgetBus,
            value,
            getDefaults.bind(null, ppsRecordTextAlign),
            labelMap.get("ltr"),
            eventHandlers,
            options,
        );
        this._getDefaultsDirection = getDefaults.bind(null, ppsRecordDirection);
        this._labelMap = labelMap;
    }
    update(changedMap) {
        super.update(changedMap);
        const direction = changedMap.has("direction")
                ? changedMap.get("direction")
                : this.getEntry("direction"),
            currentDirection = direction.isEmpty
                ? this._getDefaultsDirection()
                : direction.value,
            key = this._labelMap.has(currentDirection)
                ? currentDirection
                : [...this._labelMap.keys()][0],
            icon = this._labelMap.get(key);

        this._domTool.clear(this.element);
        this._domTool.appendChildren(this.element, [icon]);
    }
}

export class UITextAlignment extends _BaseContainerComponent {
    constructor(
        widgetBus,
        _zones,
        ppsRecordTextAlign,
        ppsRecordDirection,
        getDefaults,
        updateDefaultsDependencies,
        label = "Text Alignment",
    ) {
        const h = widgetBus.domTool.h,
            localMain = <div class="ui_text-alignment"></div>,
            zones = new Map([..._zones, ["main", localMain]]);

        widgetBus.insertElement(localMain);
        const injectLabel = [];
        if (label !== null) {
            let labelElement;
            if (typeof label === "string")
                labelElement = <h3 class="ui_text-alignment-label">{label}</h3>;
            else if (typeof label === "function")
                labelElement = label(widgetBus.domTool);
            else labelElement = label;
            injectLabel.push([{ zone: "main" }, [], StaticNode, labelElement]);
        }

        super(widgetBus, zones);
        const widgets = [
            ...injectLabel,
            ...this._getOptionButtons(
                ppsRecordTextAlign,
                ppsRecordDirection,
                getDefaults,
                updateDefaultsDependencies,
            ),
        ];
        this._initWidgets(widgets);
    }
    _getOptionButtons(
        ppsRecordTextAlign,
        ppsRecordDirection,
        getDefaults,
        updateDefaultsDependencies,
    ) {
        const currentInstance = this.getEntry("."),
            Model = currentInstance.constructor.Model,
            buttons = [];
        for (const value of Model.enumItems) {
            let button;
            if (value === "start" || value === "end") {
                button = [
                    { zone: "main" },
                    [
                        [".", "value"],
                        ...updateDefaultsDependencies,
                        ["../direction", "direction"],
                    ],
                    UITextAlignmentWithDirectionButton,
                    value,
                    ppsRecordTextAlign,
                    ppsRecordDirection,
                    getDefaults,
                    new Map([
                        [
                            "ltr",
                            createIconAndLabel(
                                `arrow_right_altformat_align_${value === "start" ? "left" : "right"}`,
                                value,
                            ),
                        ],
                        [
                            "rtl",
                            createIconAndLabel(
                                `format_align_${value === "start" ? "right" : "left"}arrow_left_alt`,
                                value,
                            ),
                        ],
                    ]),
                    [["click", this._toggleHandler.bind(this, value)]],
                ];
            } else {
                button = [
                    { zone: "main" },
                    [[".", "value"], ...updateDefaultsDependencies],
                    UITextAlignmentButton,
                    value,
                    getDefaults.bind(null, ppsRecordTextAlign),
                    createIconAndLabel(`format_align_${value}`, value),
                    [["click", this._toggleHandler.bind(this, value)]],
                ];
            }
            buttons.push(button);
        }

        return buttons;
    }
    _toggleHandler(newValue, evt) {
        evt.preventDefault();
        this._changeState(() => {
            const currentValue = this.getEntry(".");
            if (!currentValue.isEmpty && currentValue.value === newValue)
                currentValue.clear();
            else currentValue.value = newValue;
        });
    }
}
