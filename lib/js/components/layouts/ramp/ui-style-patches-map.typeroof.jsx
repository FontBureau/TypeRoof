import { _UIBaseMap } from "../../basics.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import {
    availableStylePatchTypes,
    getStylePatchFullLabel,
    validateStyleName,
    createStylePatch,
} from "../../type-spec-models.mjs";
import { SimpleSelect } from "./simple-select.typeroof.jsx";
import { MapSelectButton } from "./map-select-button.typeroof.jsx";
import { Path } from "../../../metamodel.mjs";

export class UIStylePatchesMap extends _UIBaseMap {
    // jshint ignore: start
    static ROOT_CLASS = `ui_style_patches_map`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_ADD_BUTTON_LABEL = "add style";
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH;

    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if (!valid) return [valid, message];
        return validateStyleName(key);
    }

    get _initialWidgets() {
        const items = Array.from(availableStylePatchTypes.keys()).map(
                (typeKey) => {
                    return [typeKey, getStylePatchFullLabel(typeKey)];
                },
            ),
            select = [
                { zone: "tools", id: "key-create-type-select" },
                [],
                SimpleSelect,
                null,
                items,
            ];
        const widgets = super._initialWidgets;
        widgets.splice(1, 0, select);
        return widgets;
    }
    // jshint ignore: end
    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId, // required to check if widgetWrapper.host === host
            },
            dependencyMappings = [
                ["./stylePatchTypeKey", "data"],
                [
                    this.widgetBus.getExternalName("stylePatchPath"),
                    "activePath",
                ],
            ],
            // Should be a really simple item maybe displaying the label
            // Maybe we could edit the label.
            // But rather it is just to select, on click and to display
            // as selected, e.g. bold label
            Constructor = MapSelectButton,
            args = [
                // Want this to be a Button.
                "button",
                { class: "ui_style_patches_map-item-value" },
                [["click", (/*event*/) => this._onClickHandler(key)]],
                () => "Edit",
            ];
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _onClickHandler(key) {
        this._changeState(() => {
            const path = Path.fromParts(".", key),
                selected = this.getEntry("stylePatchPath");
            // this is a toggle
            if (!selected.isEmpty && selected.value.equals(path))
                selected.clear();
            else selected.value = path;
        });
    }

    _createKeyValue(childrenOrderedMap) {
        const typeSelect = this.getWidgetById("key-create-type-select"),
            typeKey = typeSelect.value,
            value = createStylePatch(typeKey, childrenOrderedMap.dependencies);
        return value;
    }

    // If implemented called within a _changeState transaction,
    // with the new key as argument:
    // this._onItemCreated(key)
    _onItemCreated(key) {
        const path = Path.fromParts(".", key),
            selected = this.getEntry("stylePatchPath");
        // Only set if nothing is selected. a StylePatch is being
        // selected, it could be distracting to switch to the new
        // one, but if none is selected, it's probably the next step
        // to edit the newly created StylePatc;
        if (selected.isEmpty) selected.value = path;
    }
}
