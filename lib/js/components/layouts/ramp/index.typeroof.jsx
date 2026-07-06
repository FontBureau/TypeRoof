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
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { GENERIC } from "../../registered-properties-definitions.mjs";
import {
    isInheritingPropertyFn,
    getRegisteredPropertySetup,
} from "../../registered-properties.mjs";
import { getTypeSpecDefaultsMap } from "../type-stage/defaults.mjs";
import { TYPE_SPEC_PROPERTIES_GENERATORS } from "../type-stage/properties-generators.mjs";
import {
    StylePatchSourcesMeta,
    TypeSpecMeta,
} from "../type-stage/meta.typeroof.jsx";
import { TypeSpecPropertiesManager } from "../type-stage/type-spec-properties.typeroof.jsx";
import {
    StylePatchPropertiesManager,
    UIStylePatchesMap,
} from "../type-stage/style-patches.typeroof.jsx";
import { RampProseMirrorContext } from "../type-stage/prosemirror.typeroof.jsx";
import DEFAULT_STATE from "../../../../assets/type-stage-initial-state.json" with { type: "json" };

//  We can't create the self-reference directly
//, TypeSpecModelMap: TypeSpec.get('children') === _AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpec)
const RampModel = _BaseLayoutModel.createClass(
    "RampModel",
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

class RampController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        // BUT: we may need a mechanism to handle typeSpec inheritance!
        // widgetBus.wrapper.setProtocolHandlerImplementation(
        //    ...SimpleProtocolHandler.create('animationProperties@'));
        const propertiesManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "properties-manager",
                },
            ),
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
            stylePatchesManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "style_patches-manager",
                },
            ),
            zones = new Map([
                ..._zones,
                ["properties-manager", propertiesManagerContainer],
                ["editor-manager", editorManagerContainer],
                ["style_patches-manager", stylePatchesManagerContainer],
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
                "TypeSpecs",
                propertiesManagerContainer,
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
                {},
                [],
                RampProseMirrorContext,
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
        ];
        this._initWidgets(widgets);
    }
    update(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("typeSpecProperties@")
            .resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("typeSpecProperties@")
            .resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export { RampModel as Model, RampController as Controller };
