import { _UIBaseMap } from "../../basics.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { MapSelectButton } from "./map-select-button.typeroof.jsx";
import { identity } from "../../../util.mjs";
import { WasteBasketDropTarget } from "../../generic.mjs";
import { Path } from "../../../metamodel.mjs";

// based on a copy of UIStylePatchesMap
export class UINodeSpecMap extends _UIBaseMap {
    static ROOT_CLASS = `ui_node_spec_map`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_ADD_BUTTON_LABEL = "create";
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.PROSEMIROOR_NODE_SPEC_PATH;

    get _initialWidgets() {
        const wasteBasket = [
            { zone: "local" },
            [[".", "rootCollection"]],
            WasteBasketDropTarget,
            "Delete NodeSpec",
            "",
            [this.constructor.KEY_DATA_TRANSFER_TYPE],
        ];
        const widgets = super._initialWidgets;
        widgets.splice(Infinity, 0, wasteBasket);
        return widgets;
    }

    // Uses this.MapModel.validateKey i.e. validateNodeSpecName

    // Same pattern as in UIStylePatchesMap, it has the button to select
    // the item to edit. we need that!
    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId, // required to check if widgetWrapper.host === host
            },
            dependencyMappings = [
                // ['../stylePatchTypeKey', 'data']
                [this.widgetBus.getExternalName("nodeSpecPath"), "activePath"],
            ],
            Constructor = MapSelectButton,
            args = [
                // Want this to be a Button.
                "button",
                { class: "ui_node_spec_map-item-value" },
                [["click", (/*event*/) => this._onClickHandler(key)]],
                identity,
                "Edit", // initialContent
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
                selected = this.getEntry("nodeSpecPath");
            // this is a toggle
            if (!selected.isEmpty && selected.value.equals(path))
                selected.clear();
            else selected.value = path;
        });
    }
    // _createKeyValue(childrenOrderedMap): not required as super does:
    // childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
    // and that is sufficient so far.
}
