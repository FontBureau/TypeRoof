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
    GenericSelect,
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

import { initTypeSpecCoherenceFn } from "../type-stage/index.typeroof.jsx";
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
    initTypeSpecCoherenceFn(DEFAULT_STATE),
);

class TypeSpecSelect extends GenericSelect {
    static BASE_CLASS = "ui_type_spec_select";
    _metaData = new Map();
    _typeSpecLabels = new Map();
    constructor(widgetBus, labelContent) {
        const allowNull = []; // use for root? otherwise, root could be included in the values...
        // the typeSpecPath value, however, can be empty!
        super(
            widgetBus,
            new.target.BASE_CLASS,
            labelContent,
            null /*optionGetLabel=null*/,
            allowNull /* =[] */,
            new.target.onChangeFn,
            /* =null , optionGetGroup=null , optionsGen=null */
        );
    }

    static onChangeFn(value) {
        this.getEntry("value").value = value;
    }

    _optionGetLabel(key /*, value*/) {
        const labels = [];
        if (this._metaData.has(key))
            labels.push(...this._metaData.get(key).labels);

        if (this._typeSpecLabels.has(key))
            labels.unshift(this._typeSpecLabels.get(key));

        if (key === ".")
            //root
            labels.unshift("Origin TypeSpec");
        return labels.length === 0 ? key : labels.join(" ");
    }

    *_optionsGen(rootTypeSpec) {
        const layers = [[Path.fromParts("."), rootTypeSpec]];
        while (layers.length) {
            const layer = layers.pop(),
                [currentPath, currentTypeSpec] = layer,
                currentPathStr = currentPath.toString(Path.RELATIVE);
            if (!this._metaData.has(currentPathStr))
                // we can cut short here, as this._metaData contains
                // the leaves and all their parents, so if a parent is
                // missing, we don't need to visit and attempt to yield
                // the children.
                continue;
            const typeSpecLabel = currentTypeSpec.get("label").value;
            if (typeSpecLabel !== "")
                this._typeSpecLabels.set(
                    currentPathStr,
                    currentTypeSpec.get("label").value,
                );
            yield [currentPathStr, currentPath];
            const children = currentTypeSpec.get("children"),
                childrenLayers = [];
            for (const [key, childTypeSpec] of children)
                childrenLayers.push([
                    currentPath.append("children", key),
                    childTypeSpec,
                ]);
            // reverse children first...
            childrenLayers.reverse();
            layers.unshift(...childrenLayers);
        }
    }

    _updateMetaData(nodeSpecToTypeSpec) {
        /* pass */
        // This is a stub! in the final options we want to have all
        // items that are targets in nodeSpecToTypeSpec, e.g.
        //  for(const edge of nodeSpecToTypeSpec.values())
        //          const linkStr = edge.get('link').value;
        // AND all of the parents of that link up to the "rootTypeSpec"
        // which would be just '.'
        // The paths are folded with the `children` part, we don't need
        // the paths to the "children" items, as they are just structure
        // and can't be active TypeSpec
        const upsertEdge = (linkStr, nodeKey = null, edgeLabel = "") => {
            if (!this._metaData.has(linkStr)) {
                this._metaData.set(linkStr, { labels: [] });
            }
            const data = this._metaData.get(linkStr);
            if (nodeKey !== null && edgeLabel !== "")
                data.labels.push(`${edgeLabel} :: ${nodeKey}`);
            else if (nodeKey !== null) data.labels.push(nodeKey);
            else if (edgeLabel !== "") data.labels.push(edgeLabel);
        };

        this._metaData.clear();
        for (const [nodeKey, edge] of nodeSpecToTypeSpec) {
            const linkStr = edge.get("link").value;
            upsertEdge(linkStr, nodeKey, edge.get("label").value);
            if (linkStr === ".") continue;
            let linkPath = Path.fromParts(linkStr);
            while (linkPath.parts.length) {
                // removes ['children', key]
                linkPath = linkPath.parent.parent;
                upsertEdge(linkPath.toString(Path.RELATIVE));
            }
        }
    }

    _updateValue(activePath) {
        this._select.value = activePath.isEmpty
            ? "." // root? must it be a Path?
            : activePath.value.toString(Path.RELATIVE);
    }

    update(changedMap) {
        let _changedMap = changedMap;
        if (changedMap.has("nodeSpecToTypeSpec")) {
            this._updateMetaData(changedMap.get("nodeSpecToTypeSpec"));
            // Now ensure options are updated.
            if (!changedMap.has("options")) {
                _changedMap = new Map(changedMap);
                _changedMap.set("options", this._getEntry("options"));
            }
        }
        super.update(_changedMap);
    }
}

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
                { zone: "properties-manager" },
                [
                    ["editingTypeSpec", "value"],
                    ["typeSpec", "options"],
                    ["nodeSpecToTypeSpec"],
                ],
                TypeSpecSelect,
                "Choose a TypeSpec",
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
