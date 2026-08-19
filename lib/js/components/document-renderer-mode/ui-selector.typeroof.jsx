import { Path } from "../../metamodel.mjs";

import { _BaseContainerComponent } from "../basics/component.mjs";

import { UIButton } from "../basics/ui-button.mjs";

import { StaticNode } from "../generic.mjs";

import { createIconAndLabel } from "../icons.mjs";

import "./ui-selector.css";

class UIDocumentRendererModeButton extends UIButton {
    constructor(widgetBus, value, label, eventHandlers, _options) {
        const options = {
            ..._options,
            typeClassPart: "document_renderer_mode_selector",
        };
        super(widgetBus, label, eventHandlers, options);
        this._value = value;
    }
    update(changedMap) {
        const value = changedMap.has("value")
                ? changedMap.get("value")
                : this.getEntry("value"),
            currentValue = value.value;
        this.element.classList[currentValue === this._value ? "add" : "remove"](
            "active",
        );
    }
}

export class UIDocumentRendererModeSelector extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label = "Document Renderer") {
        const h = widgetBus.domTool.h,
            localMain = <div class="ui_document_renderer_mode_selector"></div>,
            zones = new Map([..._zones, ["main", localMain]]);

        widgetBus.insertElement(localMain);
        const injectLabel = [];
        if (label !== null) {
            let labelElement;
            if (typeof label === "string")
                labelElement = <span class="typeroof-ui-label">{label}: </span>;
            else if (typeof label === "function")
                labelElement = label(widgetBus.domTool);
            else labelElement = label;
            injectLabel.push([{ zone: "main" }, [], StaticNode, labelElement]);
        }

        super(widgetBus, zones);
        const widgets = [...injectLabel, ...this._getOptionButtons()];
        this._initWidgets(widgets);
    }

    _labelMap = new Map([
        ["editor", [`edit_document`, "Editor"]],
        ["viewer", [`article`, "Viewer"]],
        ["compare", [`text_compare`, "Compare"]],
    ]);

    _getLabel(value) {
        if (this._labelMap.has(value))
            return createIconAndLabel(...this._labelMap.get(value));
        return value;
    }

    _getOptionButtons() {
        const currentInstance = this.getEntry("."),
            Model = currentInstance.constructor,
            buttons = [];
        for (const value of Model.enumItems) {
            const button = [
                { zone: "main" },
                [[".", "value"]],
                UIDocumentRendererModeButton,
                value,
                this._getLabel(value),
                [["click", this._toggleHandler.bind(this, value)]],
            ];
            buttons.push(button);
        }
        return buttons;
    }
    _toggleHandler(newValue, evt) {
        evt.preventDefault();
        this._changeState(() => {
            const currentValue = this.getEntry(".");
            currentValue.value = newValue;
        });
    }
}
