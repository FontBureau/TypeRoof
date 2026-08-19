import {
    _BaseContainerComponent,
    SimpleProtocolHandler,
} from "../../basics/component.mjs";
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
    StaticNode,
    StaticTag,
} from "../../generic.mjs";
import { SelectAndDragByOptions } from "../motion-stage.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { GENERIC } from "../../registered-properties-definitions.mjs";
import {
    isInheritingPropertyFn,
    getRegisteredPropertySetup,
} from "../../registered-properties.mjs";
import { UINodeSpecToTypeSpecLinksMap } from "../../type-spec-fundamentals.mjs";
import { getTypeSpecDefaultsMap } from "./defaults.mjs";
import { TYPE_SPEC_PROPERTIES_GENERATORS } from "./properties-generators.mjs";
import { StylePatchSourcesMeta, TypeSpecMeta } from "./meta.typeroof.jsx";
import { TypeSpecTreeEditor } from "./tree-editor.typeroof.jsx";
import { TypeSpecPropertiesManager } from "./type-spec-properties.typeroof.jsx";
import {
    UIStylePatchesMap,
    StylePatchPropertiesManager,
} from "./style-patches.typeroof.jsx";
import { TypeStageProseMirrorContext } from "./prosemirror.typeroof.jsx";
import {
    UINodeSpecMap,
    NodeSpecPropertiesManager,
    UIMarkSpecMap,
    MarkSpecPropertiesManager,
} from "./node-specs.typeroof.jsx";
import DEFAULT_STATE from "../../../../assets/type-stage-initial-state.json" with { type: "json" };
import { UIDocumentViewer } from "./viewer.typeroof.jsx";

import {
    DocumentRendererModeModel,
    DocumentRendererModeDfltEditorModel,
} from "../../document-renderer-mode/model.mjs";

import { UIDocumentRendererModeSelector } from "../../document-renderer-mode/ui-selector.typeroof.jsx";

//  We can't create the self-reference directly
//, TypeSpecModelMap: TypeSpec.get('children') === _AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpec)
export function initTypeSpecCoherenceFn(DEFAULT_STATE) {
    return CoherenceFunction.create(
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
    );
}

export function createTypeStageModelVariantWithDefaults(
    name,
    DEFAULT_STATE,
    typeOverrides = {},
) {
    // CAUTION: This is mighty and can completely change the meaning of the
    // model. It was introduced to inject different versions of
    // DocumentRendererModeModel (DocumentRendererModeDfltEditorModel, DocumentRendererModeDfltCompareModel)
    // which is only a mild deviation.
    const _getType = (name, RootType, DefaultType) => {
        const Type =
            typeOverrides && name in typeOverrides
                ? typeOverrides[name]
                : DefaultType;
        if (Type !== RootType && !(Type.prototype instanceof RootType))
            throw new Error(
                `TYPE ERROR createTypeStageModelVariantWithDefaults: ` +
                    `Type (${Type.name}) must be ${RootType.name} or a sub-class of it.`,
            );
        return [name, Type];
    };
    return _BaseLayoutModel.createClass(
        name,
        // The root TypeSpec
        ["typeSpec", TypeSpecModel],
        ["editingTypeSpec", PathModelOrEmpty],
        // could potentially be a struct with some coherence logic etc.
        // for the actual data
        ["stylePatchesSource", StylePatchesMapModel],
        ["editingStylePatch", PathModelOrEmpty],
        ["proseMirrorSchema", ProseMirrorSchemaModel],
        ["editingNodeSpecPath", PathModelOrEmpty],
        ["editingMarkSpecPath", PathModelOrEmpty],
        ["nodeSpecToTypeSpec", NodeSpecToTypeSpecMapModel],
        // the root of all typeSpecs
        ["document", NodeModel],
        ["showParameters", BooleanModel],
        ["showNodeTypeSpecLabels", BooleanModel],
        _getType(
            "documentRendererMode",
            DocumentRendererModeModel,
            DocumentRendererModeDfltEditorModel,
        ),
        initTypeSpecCoherenceFn(DEFAULT_STATE),
        // fixme: add a coherence function to ensure the link paths in nodeSpecToTypeSpec
        // are explicitly relative, i.e. start with a "./" not "/". could eventually also
        // start with "../"
    );
}

const TypeStageModel = createTypeStageModelVariantWithDefaults(
    "TypeStageModel",
    DEFAULT_STATE,
);

class TypeStageController extends _BaseContainerComponent {
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
            markSpecManagerContainer = widgetBus.domTool.createElement("div", {
                class: "mark_spec-manager",
            }),
            // To have this first within editorManagerContainer.
            proseMirrorEditorMenuContainer = widgetBus.domTool.createElement(
                "div",
                { class: "editor-manager-prosemirror" },
            ),
            editorManagerContainer = widgetBus.domTool.createElement("div", {
                class: "editor-manager",
            }),
            zones = new Map([
                ..._zones,
                ["type_spec-manager", typeSpecManagerContainer],
                ["properties-manager", propertiesManagerContainer],
                ["style_patches-manager", stylePatchesManagerContainer],
                ["node_spec-manager", nodeSpecManagerContainer],
                ["mark_spec-manager", markSpecManagerContainer],
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

        const typeSpecDefaultsMap = getTypeSpecDefaultsMap(
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
                "Typographic Specifications",
                typeSpecManagerContainer,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "TypeSpec Properties",
                propertiesManagerContainer,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Styles",
                stylePatchesManagerContainer,
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
                {
                    zone: "type_spec-manager",
                    relativeRootPath: typeSpecRelativePath,
                },
                [
                    ["children", "activeActors"],
                    [
                        widgetBus.rootPath.append("editingTypeSpec").toString(),
                        "editingActor",
                    ],
                ],
                TypeSpecTreeEditor,
                {
                    // dataTransferTypes
                    PATH: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH,
                    CREATE: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE,
                },
                Path.fromParts(".", "children"),
            ],
            [
                {
                    zone: "type_spec-manager",
                },
                [["typeSpec", "rootCollection"]],
                WasteBasketDropTarget,
                "Drop here to delete",
                "", //'drag and drop into trash-bin.'
                [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH],
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
                true, // deletableEntries
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
            [
                {
                    zone: "editor-manager",
                    relativeRootPath: Path.fromParts(
                        ".",
                        "documentRendererMode",
                    ),
                },
                [],
                UIDocumentRendererModeSelector,
                zones,
                getRegisteredPropertySetup(`${GENERIC}documentRendererMode`)
                    .label, //label
            ],
            [{ zone: "editor-manager" }, [], StaticTag, "hr"],
            [
                { zone: "editor-manager" },
                [],
                StaticNode,
                proseMirrorEditorMenuContainer,
            ],
            [
                {
                    activationTest: () => {
                        const documentRendererMode = this.getEntry(
                            "./documentRendererMode",
                        );
                        return (
                            documentRendererMode.value === "editor" ||
                            documentRendererMode.value === "compare"
                        );
                    },
                },
                [],
                TypeStageProseMirrorContext,
                zones,
                // proseMirrorSettings
                { zone: "layout" },
                originTypeSpecPath,
                // menuSettings
                { zone: "prose-mirror-editor-menu" },
            ],
            [
                {
                    zone: "layout",
                    relativeRootPath: Path.fromParts(".", "document"),
                    activationTest: () => {
                        const documentRendererMode = this.getEntry(
                            "./documentRendererMode",
                        );
                        return (
                            documentRendererMode.value === "viewer" ||
                            documentRendererMode.value === "compare"
                        );
                    },
                },
                [
                    ["../proseMirrorSchema/nodes", "nodeSpec"],
                    ["../proseMirrorSchema/marks", "markSpec"],
                    ["../nodeSpecToTypeSpec", "nodeSpecToTypeSpec"],
                ],
                UIDocumentViewer,
                zones,
                originTypeSpecPath,
                // baseClass = "typeroof-document",
            ],
            [
                { zone: "editor-manager" },
                [["showParameters", "value"]],
                UICheckboxInput,
                "show-parameters", // classToken
                getRegisteredPropertySetup(`${GENERIC}showParameters`).label, //label
            ],
            [
                { zone: "editor-manager" },
                [["showNodeTypeSpecLabels", "value"]],
                UICheckboxInput,
                "show-node-type-spec-labels", // classToken
                "Show Element Labels", //label
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
                true, // deletableEntries
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
                true, // deletableEntries
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "MarkSpecs",
                markSpecManagerContainer,
            ],
            [
                { zone: "mark_spec-manager" },
                [
                    ["./proseMirrorSchema/marks", "childrenOrderedMap"],
                    ["editingMarkSpecPath", "markSpecPath"],
                ],
                UIMarkSpecMap,
                new Map([...zones, ["main", markSpecManagerContainer]]),
                [], // eventHandlers
                "MarkSpec-Map",
                true, // dragEntries (dragAndDrop)
                true, // deletableEntries
            ],
            [
                {
                    zone: "mark_spec-manager",
                },
                [
                    ["./proseMirrorSchema/marks", "childrenOrderedMap"],
                    ["editingMarkSpecPath", "markSpecPath"],
                ],
                MarkSpecPropertiesManager,
                new Map([...zones, ["main", markSpecManagerContainer]]),
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

export { TypeStageModel as Model, TypeStageController as Controller };
export default { Model: TypeStageModel, Controller: TypeStageController };
