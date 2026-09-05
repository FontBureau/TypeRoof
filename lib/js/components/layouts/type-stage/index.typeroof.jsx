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
    CollapsibleContainer,
    UICheckboxInput,
    StaticNode,
    StaticTag,
} from "../../generic.mjs";
import { GENERIC } from "../../registered-properties-definitions.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import { UINodeSpecToTypeSpecLinksMap } from "../../type-spec-fundamentals.mjs";
import { getTypeSpecDefaultsMap } from "./defaults.mjs";

import { LengthModel } from "../../length-models.mjs";

import { TypeStagePaneStyler } from "./pane-styler.typeroof.jsx";
import {
    TYPE_SPEC_PROPERTIES_GENERATORS,
    inheritancePolicyGen,
} from "./properties-generators.mjs";
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

import { ENVIRONMENT_PROVIDER_ENTRIES } from "../../environment-provider.mjs";

import { UIValueUnitPairInput } from "../../ui-margins.typeroof.jsx";
import { require } from "../../dependency-injection.mjs";
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

// Boundness rule: width must always be bound (length fields set);
// height may be unset (then it grows to fit content); both
// unset is invalid. Written against the general invariant
// "at least one dimension bound", so the future relaxation
// (width unbound iff height is set) is admissible without model
// migration. Migration default for legacy documents:
// width 100% layout, height unset.
export const ensureDimensionBoundnessCoherenceFn = CoherenceFunction.create(
    ["width", "height"],
    function ensureDimensionBoundness({ width, height }) {
        // width/height are instances of lengthModel:
        //      struct fields ({value, unit}).
        const widthUnit = width.get("unit"),
            heightUnit = height.get("unit");
        if (widthUnit.isEmpty)
            widthUnit.value = widthUnit.constructor.Model.defaultValue; // "percent-layout";
        // value is filled by LengthModel's own coherence.
    },
);

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
        ["width", LengthModel],
        ["height", LengthModel],
        ensureDimensionBoundnessCoherenceFn,
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

function showEditorActivationTest(getEntry) {
    const documentRendererMode = getEntry("documentRendererMode");
    return (
        documentRendererMode.value === "editor" ||
        documentRendererMode.value === "compare"
    );
}
function showViewerActivationTest(getEntry) {
    const documentRendererMode = getEntry("documentRendererMode");
    return (
        documentRendererMode.value === "viewer" ||
        documentRendererMode.value === "compare"
    );
}
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
            proseMirrorHostElement = widgetBus.domTool.createElement("div", {
                class: "ui_prosemirror_host external_source",
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

        // per document-node properties (geometry/constraints), the
        // parallel channel to typeSpecProperties@
        widgetBus.wrapper.setProtocolHandlerImplementation(
            // does not raise when not found, instead returns null: the
            // root registration lands after the first TypeSpecMeta
            // update, but consumers (pane-styler) can update earlier.
            ...SimpleProtocolHandler.create("nodeProperties@", {
                notFoundFallbackValue: null,
            }),
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
                    // special, required only for the root instance
                    // CAUTION: also important, to identify as "root":
                    //           The absence of "@parentProperties"!!!
                    ["/font", "rootFont"],
                    ...ENVIRONMENT_PROVIDER_ENTRIES, // "environment@viewport" etc.
                    [widgetBus.rootPath.append("width").toString(), "width"],
                    [widgetBus.rootPath.append("height").toString(), "height"],
                    // end special root dependencies
                ],
                TypeSpecMeta,
                zones,
                TYPE_SPEC_PROPERTIES_GENERATORS,
                [inheritancePolicyGen],
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
                    relativeRootPath: typeSpecRelativePath,
                },
                [["./children", "childrenOrderedMap"]],
                TypeSpecTreeEditor,
                zones,
                [], // eventHandlers
                "TypeSpec-Tree ", // label
                true, // dragEntries
                true, // deletableEntries (drag to wastebasket instead)
                {
                    // treeConfig
                    editingTypeSpecPath:
                        widgetBus.rootPath.append("editingTypeSpec"),
                    typeSpecRootPath: originTypeSpecPath,
                },
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
            [
                {
                    zone: "editor-manager",
                },
                [],
                CollapsibleContainer,
                zones,
                "Stage Size",
                "minimal",
                "stage_size", //classNameParticle
                // widgets
                [
                    ...[
                        ["width", "Width"],
                        ["height", "Height"],
                    ].map(([name, label]) => {
                        return [
                            {
                                zone: "main",
                                relativeRootPath: Path.fromParts(".", name),
                            },
                            [],
                            UIValueUnitPairInput,
                            require("raw:zones"),
                            true,
                            label,
                            `ui-stage_size-${name}`,
                        ];
                    }),
                ],
                false, // open
                false, // scroll
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
                    zone: "layout",
                    // getEntry is injected by ComponentWrapper and only
                    // serves declared dependencies.
                    activationTest: showEditorActivationTest,
                },
                ["documentRendererMode"],
                StaticNode,
                proseMirrorHostElement,
            ],
            [
                {
                    // Same activation as the editor pane above: the pane
                    // styler only exists while the editor pane exists.
                    activationTest: showEditorActivationTest,
                },
                [
                    "documentRendererMode",
                    [
                        `typeSpecProperties@${originTypeSpecPath.toString()}`,
                        "properties@",
                    ],
                    [
                        `nodeProperties@${originTypeSpecPath.toString()}`,
                        "nodeProperties@",
                    ],
                ],
                TypeStagePaneStyler,
                proseMirrorHostElement,
            ],
            [
                {
                    // getEntry is injected by ComponentWrapper and only
                    // serves declared dependencies.
                    activationTest: showEditorActivationTest,
                },
                // documentRendererMode: read in the activationTest.
                ["documentRendererMode"],
                TypeStageProseMirrorContext,
                zones,
                // proseMirrorSettings
                { zone: "layout" },
                originTypeSpecPath,
                // menuSettings
                { zone: "prose-mirror-editor-menu" },
                proseMirrorHostElement,
            ],
            [
                {
                    zone: "layout",
                    relativeRootPath: Path.fromParts(".", "document"),
                    // getEntry is injected by ComponentWrapper and only
                    // serves declared dependencies.
                    activationTest: showViewerActivationTest,
                },
                [
                    ["../proseMirrorSchema/nodes", "nodeSpec"],
                    ["../proseMirrorSchema/marks", "markSpec"],
                    ["../nodeSpecToTypeSpec", "nodeSpecToTypeSpec"],
                    // Read in the activationTest.
                    ["../documentRendererMode", "documentRendererMode"],
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
        // The manager may not be present in test harnesses; then the
        // layout works without the layout-scoping class (CSS falls back
        // to the generic selectors).
        this._classesAndStylesManager = this.widgetBus.getWidgetById(
            "classes-and-styles-manager",
        );
        this._classesAndStylesManager.setClass("typeroof-layout--type-stage");

        this._initWidgets(widgets);
    }
    destroy() {
        // Whoever uses the manager must reset it.
        this._classesAndStylesManager.reset();
        this._classesAndStylesManager = null;
        return super.destroy();
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
