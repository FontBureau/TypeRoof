import { _UIBaseMap } from "../../basics/ui-map.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import {
    MapSelectButton,
    _BaseByPathContainerComponent,
} from "./shared.typeroof.jsx";
import { StaticTag, StaticNode } from "../../generic.mjs";
import { Path } from "../../../metamodel.mjs";
import { _NOTDEF, getFallback } from "./defaults.mjs";
import { UITypeDrivenContainer } from "../../type-driven-ui-basics.mjs";
import { genericTypeToUIElement } from "../../type-driven-ui.mjs";
import { NODESPEC_PPS_MAP, MARKSPEC_PPS_MAP } from "./pps-maps.mjs";

/**
 * Here's a good lesson, compared to typeSpecGetDefaults this is trivial,
 * because we don't have liveProperties
 */
function specGetDefaults(
    ppsRecord,
    fieldName,
    /*BaseModelType.*/ modelDefaultValue = _NOTDEF,
) {
    const { fullKey } = ppsRecord;
    return getFallback(fullKey, modelDefaultValue);
}

/**
 * Shared implementation for the NodeSpec and MarkSpec properties
 * managers, configured via the constructor arguments of the subclasses.
 */
class _BaseSpecPropertiesManager extends _BaseByPathContainerComponent {
    constructor(
        widgetBus,
        _zones,
        className,
        pathEntryName,
        specLabel,
        specDocURL,
        ppsMap,
    ) {
        super(
            widgetBus,
            _zones,
            className,
            pathEntryName,
            "childrenOrderedMap", // childrenMapEntryName
            null, // typeKeyName=null
        );
        this._specLabel = specLabel;
        this._specDocURL = specDocURL;
        this._ppsMap = ppsMap;
    }

    _createEmptyWrappers() {
        const widgets = [
            [
                { zone: "local" },
                [],
                StaticTag,
                "span",
                {},
                `(Select a ${this._specLabel})`,
            ],
        ];
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(path) {
        const key = path.parts.at(-1),
            h = this._domTool.h,
            widgets = [
                [
                    {
                        zone: "local",
                    },
                    [],
                    StaticTag,
                    "h3",
                    {},
                    `${this._specLabel}: ${key}`,
                ],
                [
                    {
                        zone: "local",
                    },
                    [],
                    StaticNode,
                    <p>
                        <strong>CAUTION</strong> this interface is experimental
                        and only partially useful yet. Find documentation at{" "}
                        <a
                            target="_blank"
                            rel="noreferrer"
                            href={this._specDocURL}
                        >
                            ProseMirror interface {this._specLabel}
                        </a>
                        .
                    </p>,
                ],
            ];

        const injectable = {
            getDefaults: specGetDefaults,
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
            this._ppsMap,
        ]);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}

export class NodeSpecPropertiesManager extends _BaseSpecPropertiesManager {
    constructor(widgetBus, _zones) {
        super(
            widgetBus,
            _zones,
            "ui_node_spec-properties_manager", // className
            "nodeSpecPath", // pathEntryName
            "NodeSpec", // specLabel
            "https://prosemirror.net/docs/ref/#model.NodeSpec", // specDocURL
            NODESPEC_PPS_MAP,
        );
    }
}

export class MarkSpecPropertiesManager extends _BaseSpecPropertiesManager {
    constructor(widgetBus, _zones) {
        super(
            widgetBus,
            _zones,
            "ui_mark_spec-properties_manager", // className
            "markSpecPath", // pathEntryName
            "MarkSpec", // specLabel
            "https://prosemirror.net/docs/ref/#model.MarkSpec", // specDocURL
            MARKSPEC_PPS_MAP,
        );
    }
}

// based on a copy of UIStylePatchesMap
// Also the base of UIMarkSpecMap, hence the SPEC_LABEL/PATH_ENTRY_NAME
// configuration statics.
export class UINodeSpecMap extends _UIBaseMap {
    static ROOT_CLASS = `ui_node_spec_map`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_ADD_BUTTON_LABEL = "create";
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.PROSEMIRROR_NODE_SPEC_PATH;
    static SPEC_LABEL = "NodeSpec";
    static PATH_ENTRY_NAME = "nodeSpecPath";

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId,
            },
            dependencyMappings = [
                [
                    this.widgetBus.getExternalName(
                        this.constructor.PATH_ENTRY_NAME,
                    ),
                    "activePath",
                ],
            ],
            Constructor = MapSelectButton,
            args = [
                [["click", (/*event*/) => this._onClickHandler(key)]],
                ["ui_node_spec_map-item-value"],
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
                selected = this.getEntry(this.constructor.PATH_ENTRY_NAME);
            // this is a toggle
            if (!selected.isEmpty && selected.value.equals(path))
                selected.clear();
            else selected.value = path;
        });
    }
}

export class UIMarkSpecMap extends UINodeSpecMap {
    static ROOT_CLASS = `ui_mark_spec_map`;
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.PROSEMIRROR_MARK_SPEC_PATH;
    static SPEC_LABEL = "MarkSpec";
    static PATH_ENTRY_NAME = "markSpecPath";
}
