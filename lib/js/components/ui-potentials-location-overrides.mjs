/**
 * UI for the potentialsLocationOverrides ordered map (milestone 6):
 * axis tag -> number, the manual fill-in values for potentials
 * navigation dimensions the run's font does not carry (see
 * type-spec/text-composition-models.mjs PotentialsLocationOverridesModel).
 *
 * Minimal by design (the operator's option B): a _UIBaseMap with
 * tag-validated keys (the _UIBaseAxesMap pattern, but with PLAIN
 * number values — no logicalValue struct, no data-transfer types:
 * overrides are per-document configuration, not drag source) and a
 * tiny per-entry number input.
 */
import {
    _BaseComponent,
} from "./basics/component.mjs";

import {
    _UIBaseMap,
} from "./basics/ui-map.mjs";

import {
    validateOpenTypeTagString,
} from "../util.mjs";

import {
    Path,
} from "../metamodel.mjs";

// A per-entry number input wired to the './value' entry (a plain
// NumberModel — no min/max: the override's validity is decided by
// the potentials resolution, not by a range we'd have to invent).
export class UIPotentialsOverrideValue extends _BaseComponent {
    static ROOT_CLASS = "ui_potentials-override_value";
    static TEMPLATE = `<div
        tabindex="0"
        ><input
                type="number"
                step="any"
                size="6"
        /></div>`;

    constructor(widgetBus) {
        super(widgetBus);
        this._initTemplate();
    }

    _initTemplate() {
        const element = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ).firstElementChild,
            input = element.querySelector("input[type=number]");
        element.classList.add(this.constructor.ROOT_CLASS);
        input.addEventListener(
            "input",
            this._changeStateHandler(() => {
                const value = this.getEntry("value"),
                    numeric = parseFloat(input.value.trim());
                if (!isNaN(numeric)) value.set(numeric);
            }),
        );
        input.addEventListener("blur", () => {
            // reveal the actual state (a rejected input stays
            // otherwise, e.g. mid-edit)
            const value = this.getEntry("value");
            input.value = value.value;
        });
        this._input = input;
        this._insertElement(element);
        return { element, input };
    }

    update(changedMap) {
        if (changedMap.has("value")) {
            // Don't disturb the author mid-edit.
            if (this._input !== this._domTool.document.activeElement)
                this._input.value = changedMap.get("value").value;
        }
    }
}

// The tag -> number map. The field name in the algorithm struct is
// the rootPath anchor for the value entries (the UIAxesMathLocation
// pattern, see _createWrapperValue).
const FIELD_NAME = "potentialsLocationOverrides";

export class UIPotentialsLocationOverrides extends _UIBaseMap {
    static ROOT_CLASS = "ui_potentials-location_overrides";
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static KEY_ADD_BUTTON_LABEL = "add tag";
    // overrides are configuration, not a drag source/target
    static ITEM_DATA_TRANSFER_TYPE = null;
    static KEY_DATA_TRANSFER_TYPE = null;
    // the model has an inherent ordering
    static VISUAL_ORDER_STRATEGY =
        _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;

    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if (!valid) return [valid, message];
        return validateOpenTypeTagString(key);
    }

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                rootPath: this.widgetBus.rootPath.append(FIELD_NAME),
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId,
            },
            dependencyMappings = [["./", "value"]],
            Constructor = UIPotentialsOverrideValue;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
        );
    }
}