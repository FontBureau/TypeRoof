import { _UIBaseMap } from "../../basics.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { MapSelectButton, _BaseByPathContainerComponent } from "./shared.typeroof.jsx";
import { identity } from "../../../util.mjs";
import { WasteBasketDropTarget, StaticTag } from "../../generic.mjs";
import { Path } from "../../../metamodel.mjs";
import { _NOTDEF, _getFallback } from "./defaults.mjs";
import {
    UITypeDrivenContainer,
    genericTypeToUIElement,
} from "../../type-driven-ui.mjs";
import { NODESPEC_PPS_MAP } from "./pps-maps.mjs";

/**
 * Here's a good lesson, compared to typeSpecGetDefaults this is trivial,
 * because we don't have liveProperties
 */
function nodeSpecGetDefaults(
    ppsRecord,
    fieldName,
    /*BaseModelType.*/ modelDefaultValue = _NOTDEF,
) {
    const { fullKey } = ppsRecord;
    return _getFallback(fullKey, modelDefaultValue);
}

export class NodeSpecPropertiesManager extends _BaseByPathContainerComponent {
    constructor(widgetBus, _zones) {
        super(
            widgetBus,
            _zones,
            "ui_node_spec-properties_manager", // className
            "nodeSpecPath", // pathEntryName
            "childrenOrderedMap", // childrenMapEntryName
            null, // typeKeyName=null
        );
    }

    _createEmptyWrappers() {
        const widgets = [
            [
                { zone: "local" },
                [],
                StaticTag,
                "span",
                {},
                "(Select a NodeSpec)",
            ],
        ];
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(path) {
        const key = path.parts.at(-1),
            widgets = [
                [
                    {
                        zone: "local",
                    },
                    [],
                    StaticTag,
                    "h3",
                    {},
                    `NodeSpec: ${key}`,
                ],
            ];

        const injectable = {
            getDefaults: nodeSpecGetDefaults,
            // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
            //          via VideoproofController constructor initial resources: Error:
            //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
            //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
            // Maybe this key is flawed in this context?
            updateDefaultsDependencies: [],
            genericTypeToUIElement,
            requireUpdateDefaults: () => true,
        };
        widgets.push([
            {
                rootPath: path,
                zone: "local",
            },
            [],
            UITypeDrivenContainer,
            this._zones,
            injectable,
            NODESPEC_PPS_MAP,
        ]);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}

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

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId,
            },
            dependencyMappings = [
                [this.widgetBus.getExternalName("nodeSpecPath"), "activePath"],
            ],
            Constructor = MapSelectButton,
            args = [
                "button",
                { class: "ui_node_spec_map-item-value" },
                [["click", (/*event*/) => this._onClickHandler(key)]],
                identity,
                "Edit",
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
}
