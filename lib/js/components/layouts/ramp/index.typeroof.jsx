import {
    _BaseContainerComponent,
    SimpleProtocolHandler,
} from "../../basics.mjs";
import { _BaseLayoutModel } from "../../main-model.mjs";
import {
    PathModelOrEmpty,
    Path,
    BooleanModel,
    CoherenceFunction,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../../../metamodel.mjs";
import {
    TypeSpecModel,
    StylePatchesMapModel,
} from "../../type-spec-models.mjs";
import {
    ProseMirrorSchemaModel,
    NodeSpecToTypeSpecMapModel,
    NodeModel,
} from "../../prosemirror/models.typeroof.jsx";
import {
    Collapsible,
    WasteBasketDropTarget,
    UICheckboxInput,
} from "../../generic.mjs";
import { SelectAndDragByOptions } from "../stage-and-actors.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { GENERIC } from "../../registered-properties-definitions.mjs";
import {
    isInheritingPropertyFn,
    getRegisteredPropertySetup,
} from "../../registered-properties.mjs";
import { UINodeSpecToTypeSpecLinksMap } from "../../type-spec-fundamentals.mjs";
import {
    _getTypeSpecDefaultsMap,
    TYPE_SPEC_PROPERTIES_GENERATORS,
} from "./get-type-spec-defaults-map.mjs";
import { StylePatchSourcesMeta } from "./style-patch-sources-meta.typeroof.jsx";
import { TypeSpecMeta } from "./type-spec-meta.typeroof.jsx";
import { TypeSpecTreeEditor } from "./type-spec-tree-editor.typeroof.jsx";
import { TypeSpecPropertiesManager } from "./type-spec-properties-manager.typeroof.jsx";
import { UIStylePatchesMap } from "./ui-style-patches-map.typeroof.jsx";
import { StylePatchPropertiesManager } from "./style-patch-properties-manager.typeroof.jsx";
import { ProseMirrorContext } from "./prose-mirror-context.typeroof.jsx";
import { UINodeSpecMap } from "./ui-node-spec-map.typeroof.jsx";
import { NodeSpecPropertiesManager } from "./node-spec-properties-manager.typeroof.jsx";
import DEFAULT_STATE from "../../../../assets/typespec-ramp-initial-state.json" with { type: "json" };

//  We can't create the self-reference directly
//, TypeSpecModelMap: TypeSpec.get('children') === _AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpec)
const TypeSpecRampModel = _BaseLayoutModel.createClass(
    "TypeSpecRampModel",
    // The root TypeSpec
    ["typeSpec", TypeSpecModel],
    ["editingTypeSpec", PathModelOrEmpty],
    // could potentially be a struct with some coherence logic etc.
    // for the actual data
    ["stylePatchesSource", StylePatchesMapModel],
    ["editingStylePatch", PathModelOrEmpty],
    ["proseMirrorSchema", ProseMirrorSchemaModel],
    ["editingNodeSpecPath", PathModelOrEmpty],
    ["nodeSpecToTypeSpec", NodeSpecToTypeSpecMapModel],
    // the root of all typeSpecs
    ["document", NodeModel],
    ["showParameters", BooleanModel],
    CoherenceFunction.create(
        [
            "document",
            "typeSpec",
            "stylePatchesSource",
            "proseMirrorSchema",
            "nodeSpecToTypeSpec",
        ],
        function initTypeSpec({
            typeSpec,
            document,
            stylePatchesSource,
            proseMirrorSchema,
            nodeSpecToTypeSpec,
        }) {
            // if typeSpec and document are empty
            if (
                document.get("content").size === 0 &&
                typeSpec.get("children").size === 0 &&
                stylePatchesSource.size === 0
            ) {
                for (const [Model, target, data] of [
                    [NodeModel, document, DEFAULT_STATE.document],
                    [TypeSpecModel, typeSpec, DEFAULT_STATE.typeSpec],
                    [
                        StylePatchesMapModel,
                        stylePatchesSource,
                        DEFAULT_STATE.stylePatchesSource,
                    ],
                    [
                        ProseMirrorSchemaModel,
                        proseMirrorSchema,
                        DEFAULT_STATE.proseMirrorSchema,
                    ],
                    [
                        NodeSpecToTypeSpecMapModel,
                        nodeSpecToTypeSpec,
                        DEFAULT_STATE.nodeSpecToTypeSpec,
                    ],
                ]) {
                    const serializeOptions = Object.assign(
                            {},
                            SERIALIZE_OPTIONS,
                            {
                                format: SERIALIZE_FORMAT_OBJECT,
                            },
                        ),
                        newItem = deserializeSync(
                            Model,
                            target.dependencies,
                            data,
                            serializeOptions,
                        );
                    for (const [key, enrty] of newItem.entries())
                        target.set(key, enrty);
                }
            }
        },
    ),
);

class TypeSpecRampController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        // BUT: we may need a mechanism to handle typeSpec inheritance!
        // widgetBus.wrapper.setProtocolHandlerImplementation(
        //    ...SimpleProtocolHandler.create('animationProperties@'));
        const typeSpecManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "type_spec-manager",
                },
            ),
            propertiesManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "properties-manager",
                },
            ),
            stylePatchesManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "style_patches-manager",
                },
            ),
            nodeSpecManagerContainer = widgetBus.domTool.createElement("div", {
                class: "node_spec-manager",
            }),
            // To have this first within editorManagerContainer.
            proseMirrorEditorMenuContainer = widgetBus.domTool.createElement(
                "div",
                { class: "editor-manager-prosemirror" },
            ),
            editorManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "editor-manager",
                },
                proseMirrorEditorMenuContainer,
            ),
            zones = new Map([
                ..._zones,
                ["type_spec-manager", typeSpecManagerContainer],
                ["properties-manager", propertiesManagerContainer],
                ["style_patches-manager", stylePatchesManagerContainer],
                ["node_spec-manager", nodeSpecManagerContainer],
                ["editor-manager", editorManagerContainer],
                ["prose-mirror-editor-menu", proseMirrorEditorMenuContainer],
            ]),
            typeSpecRelativePath = Path.fromParts(".", "typeSpec"),
            originTypeSpecPath = widgetBus.rootPath.append(
                ...typeSpecRelativePath,
            );
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create("typeSpecProperties@"),
        );

        // the source style patches
        widgetBus.wrapper.setProtocolHandlerImplementation(
            // does not raise when not found, instead returns null
            ...SimpleProtocolHandler.create("stylePatchProperties@", {
                notFoundFallbackValue: null,
            }),
        );

        // the linked stylePatchProperties@ plus typeSpecProperties@
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create("styleLinkProperties@"),
        );
        // widgetBus.insertElement(stageManagerContainer);
        super(widgetBus, zones);

        const typeSpecDefaultsMap = _getTypeSpecDefaultsMap(
            widgetBus.getEntry(originTypeSpecPath).dependencies,
        );

        const widgets = [
            [
                {
                    rootPath: widgetBus.rootPath,
                },
                [["stylePatchesSource", "collection"]],
                StylePatchSourcesMeta,
                zones,
            ],
            [
                {
                    rootPath: typeSpecRelativePath,
                },
                [
                    [".", "typeSpec"],
                    [
                        widgetBus.rootPath
                            .append("stylePatchesSource")
                            .toString(),
                        "stylePatchesSource",
                    ],
                    // special, reqired only for the root instance
                    ["/font", "rootFont"],
                ],
                TypeSpecMeta,
                zones,
                TYPE_SPEC_PROPERTIES_GENERATORS,
                isInheritingPropertyFn,
                typeSpecDefaultsMap,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Editor",
                editorManagerContainer,
                true,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Styles",
                stylePatchesManagerContainer,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "TypeSpecs",
                typeSpecManagerContainer,
            ],
            [
                {
                    zone: "type_spec-manager",
                },
                [],
                SelectAndDragByOptions,
                "Create",
                "", //'drag and drop into Rap-Editor.'
                [
                    // options [type, label, value]
                    [
                        DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE,
                        "Type Spec",
                        "TypeSpec",
                    ],
                ],
            ],
            [
                { zone: "type_spec-manager" },
                [
                    ["typeSpec/children", "activeActors"],
                    ["editingTypeSpec", "editingActor"],
                ],
                TypeSpecTreeEditor,
                {
                    // dataTransferTypes
                    PATH: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH,
                    CREATE: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE,
                },
            ],
            [
                {
                    zone: "type_spec-manager",
                },
                [["typeSpec/children", "rootCollection"]],
                WasteBasketDropTarget,
                "Delete",
                "", //'drag and drop into trash-bin.'
                [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH],
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "TypeSpec Properties",
                propertiesManagerContainer,
            ],
            [
                {},
                [
                    ["editingTypeSpec", "typeSpecPath"],
                    ["typeSpec/children", "children"],
                    ["typeSpec", "rootTypeSpec"],
                ],
                TypeSpecPropertiesManager,
                new Map([...zones, ["main", propertiesManagerContainer]]),
            ],
            [
                {
                    zone: "style_patches-manager",
                    relativeRootPath: Path.fromParts(".", "stylePatchesSource"),
                },
                [
                    [".", "childrenOrderedMap"],
                    ["../editingStylePatch", "stylePatchPath"],
                ],
                UIStylePatchesMap, // search for e.g. UIAxesMathLocation in videoproof-array-v2.mjs
                zones,
                [], // eventHandlers
                null, // label 'Style Patches'
                true, // dragAndDrop
            ],
            [
                {
                    zone: "style_patches-manager",
                },
                [["typeSpec/children", "rootCollection"]],
                WasteBasketDropTarget,
                "Delete",
                "", //'drag and drop into trash-bin.'
                [
                    DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH,
                    DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH,
                    // to delete the axesLocations values coming from UIAxesMathLocation
                    DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH,
                ],
            ],
            [
                {
                    zone: "style_patches-manager",
                    relativeRootPath: Path.fromParts(".", "stylePatchesSource"),
                },
                [
                    [".", "childrenOrderedMap"],
                    ["../editingStylePatch", "stylePatchPath"],
                ],
                StylePatchPropertiesManager,
                new Map([...zones, ["main", stylePatchesManagerContainer]]),
            ],
            //  , [
            //        {
            //            zone: 'layout'
            //          , relativeRootPath: Path.fromParts('.','document')
            //        }
            //      , [
            //              ['../proseMirrorSchema/nodes', 'nodeSpec']
            //            , ['../nodeSpecToTypeSpec', 'nodeSpecToTypeSpec']
            //        ]
            //      , UIDocument
            //      , zones
            //      , originTypeSpecPath
            //    ]
            [
                {},
                [],
                ProseMirrorContext,
                zones,
                // proseMirrorSettings
                { zone: "layout" },
                originTypeSpecPath,
                // menuSettings
                { zone: "prose-mirror-editor-menu" },
            ],
            [
                { zone: "editor-manager" },
                [["showParameters", "value"]],
                UICheckboxInput,
                "show-parameters", // classToken
                getRegisteredPropertySetup(`${GENERIC}showParameters`).label, //label
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "NodeSpecs",
                nodeSpecManagerContainer,
            ],
            [
                { zone: "node_spec-manager" },
                [
                    ["./proseMirrorSchema/nodes", "childrenOrderedMap"],
                    ["editingNodeSpecPath", "nodeSpecPath"],
                ],
                UINodeSpecMap,
                new Map([...zones, ["main", nodeSpecManagerContainer]]),
                [], // eventHandlers
                "NodeSpec-Map",
                true, // dragEntries (dragAndDrop)
            ],
            [
                {
                    zone: "node_spec-manager",
                },
                [
                    ["./proseMirrorSchema/nodes", "childrenOrderedMap"],
                    ["editingNodeSpecPath", "nodeSpecPath"],
                ],
                NodeSpecPropertiesManager,
                new Map([...zones, ["main", nodeSpecManagerContainer]]),
            ],
            [
                { zone: "node_spec-manager" },
                [
                    ["./nodeSpecToTypeSpec", "childrenOrderedMap"],
                    // In this configuration we map "NodeSpec to TypeSpec"
                    // The directionality is not necessarily obvious, but
                    // NodeSpec is the key as a nodeSpec can only have one
                    // TypeSpec, TypeSpec is the value as we can have multiple
                    // NodeSpecs use the same TypeSpec.
                    // However, the "TypeSpec" is called the "source", so
                    // source and target may not be the right words.
                    // sourceMap is inherited from UIStylePatchesLinksMap
                    // maybe we need to change that in here.
                    ["./typeSpec", "sourceMap"], // these are the values of the map
                    ["./proseMirrorSchema/nodes", "targetMap"], // these are the keys of the map
                ],
                // based on UIStylePatchesLinksMap
                UINodeSpecToTypeSpecLinksMap,
                new Map([...zones, ["main", nodeSpecManagerContainer]]),
                [], // eventHandlers
                "NodeSpec to TypeSpec",
                true, // dragEntries (dragAndDrop)
            ],
        ];
        this._initWidgets(widgets);
    }
    update(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("typeSpecProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("stylePatchProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("styleLinkProperties@")
            .resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("typeSpecProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("stylePatchProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("styleLinkProperties@")
            .resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export { TypeSpecRampModel as Model, TypeSpecRampController as Controller };
