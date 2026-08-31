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
    UICheckboxInput,
    GenericSelect,
    StaticNode,
} from "../../generic.mjs";
import { TypeStagePaneStyler } from "../type-stage/pane-styler.typeroof.jsx";
import { GENERIC } from "../../registered-properties-definitions.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import { getTypeSpecDefaultsMap } from "../type-stage/defaults.mjs";
import {
    TYPE_SPEC_PROPERTIES_GENERATORS,
    inheritancePolicyGen,
} from "../type-stage/properties-generators.mjs";
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

import {
    initTypeSpecCoherenceFn,
    ensureDimensionBoundnessCoherenceFn,
} from "../type-stage/index.typeroof.jsx";

import { LengthModel } from "../../length-models.mjs";

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
    ["width", LengthModel],
    ["height", LengthModel],
    ensureDimensionBoundnessCoherenceFn,
    initTypeSpecCoherenceFn(DEFAULT_STATE),
);

class TypeSpecSelect extends GenericSelect {
    static BASE_CLASS = "ui_type_spec_select";
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
        let treePrefix = "";
        if (this._typeSpecLabels.has(key)) {
            const { treePrefix: prefix, label } = this._typeSpecLabels.get(key);
            treePrefix = prefix;
            // We omit TypeSpec labels in the ramp, instead we focus on
            // the "Edge" labels.
            if (label !== "") labels.push(label);
        }

        if (key === ".")
            //root
            labels.unshift("Origin TypeSpec");

        const text = labels.length === 0 ? key : labels.join("/");
        return `${treePrefix}${text}`;
    }

    *_optionsGen(rootTypeSpec) {
        // idempotent: options are fully rebuilt on every update
        this._typeSpecLabels.clear();

        const layers = [
            // [path, typeSpec, ancestorPrefix, isLast, isRoot]
            [Path.fromParts("."), rootTypeSpec, "", true, true],
        ];
        while (layers.length) {
            const [
                    currentPath,
                    currentTypeSpec,
                    ancestorPrefix,
                    isLast,
                    isRoot,
                ] = layers.shift(),
                currentPathStr = currentPath.toString(Path.RELATIVE),
                // The root is marked with a bullet trunk, its descendants
                // use bold box-drawing connectors.
                treePrefix = isRoot
                    ? "●\xa0"
                    : `${ancestorPrefix}${isLast ? "┗━" : "┣━"}\xa0`;
            this._typeSpecLabels.set(currentPathStr, {
                treePrefix,
                label: currentTypeSpec.get("label").value,
            });
            yield [currentPathStr, currentPath];

            const visibleChildren = [];
            for (const [key, childTypeSpec] of currentTypeSpec.get(
                "children",
            )) {
                const childPath = currentPath.append("children", key);
                visibleChildren.push([childPath, childTypeSpec]);
            }

            // For the child level: a guide pipe if this node has a following
            // sibling, blank space if it was the last child. The root's
            // children hang directly under the "●" trunk (empty prefix).
            const childAncestorPrefix = isRoot
                    ? ""
                    : `${ancestorPrefix}${isLast ? "\xa0\xa0\xa0" : "┃\xa0\xa0"}`,
                childrenLayers = visibleChildren.map(
                    ([childPath, childTypeSpec], index) => [
                        childPath,
                        childTypeSpec,
                        childAncestorPrefix,
                        index === visibleChildren.length - 1, // isLast
                        false, // isRoot
                    ],
                );
            // shift() takes from the front, unshift() prepends -> DFS pre-order.
            layers.unshift(...childrenLayers);
        }
    }

    _updateValue(activePath) {
        this._select.value = activePath.isEmpty
            ? "." // root? must it be a Path?
            : activePath.value.toString(Path.RELATIVE);
    }

    update(changedMap) {
        let _changedMap = changedMap;
        if (
            changedMap.has("nodeSpecToTypeSpec") &&
            !changedMap.has("options")
        ) {
            _changedMap = new Map(changedMap);
            _changedMap.set("options", this.getEntry("options"));
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
            // The editor pane: sized + document-styled by
            // TypeStagePaneStyler (like in type-stage).
            proseMirrorHostElement = widgetBus.domTool.createElement("div", {
                class: "ui_prosemirror_host external_source",
            }),
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
                "Editing TypeSpec",
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
                proseMirrorHostElement,
            ],
            [
                // ProseMirror uses the passed host element but does not
                // insert it into the zone (see type-stage).
                { zone: "layout" },
                [],
                StaticNode,
                proseMirrorHostElement,
            ],
            [
                {},
                [
                    "width",
                    "height",
                    "environment@layout",
                    [
                        `typeSpecProperties@${originTypeSpecPath.toString()}`,
                        "properties@",
                    ],
                ],
                TypeStagePaneStyler,
                proseMirrorHostElement,
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

export { RampModel as Model, RampController as Controller };
