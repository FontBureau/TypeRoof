import { _BaseByPathContainerComponent } from "./base-by-path-container-component.typeroof.jsx";
import { _NOTDEF, _getFallback } from "./type-spec-get-defaults.mjs";
import { StaticTag } from "../../generic.mjs";
import {
    UITypeDrivenContainer,
    genericTypeToUIElement,
} from "../../type-driven-ui.mjs";
import { NODESPEC_PPS_MAP } from "./nodespec-pps-map.mjs";

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
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
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
            updateDefaultsDependencies: [], //updateDefaultsDependencies
            genericTypeToUIElement, // ??
            requireUpdateDefaults: () => true, //
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
