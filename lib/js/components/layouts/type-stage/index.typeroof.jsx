import {
    _BaseContainerComponent,
    SimpleProtocolHandler,
} from "../../basics/component.mjs";
import {
    _BaseLayoutModel,
    CommentsModel,
    InstalledHyphenationPatternsModel,
    HyphenationPatternRequirement,
} from "../../main-model.mjs";
import {
    PathModelOrEmpty,
    Path,
    BooleanModel,
    CoherenceFunction,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    InternalizedDependency,
    unwrapPotentialWriteProxy,
} from "../../../metamodel.mjs";
import {
    TypeSpecModel,
    StylePatchesMapModel,
} from "../../type-spec/models.mjs";
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
import { UINodeSpecToTypeSpecLinksMap } from "../../type-spec/fundamentals.mjs";
import { getTypeSpecDefaultsMap } from "./defaults.mjs";

import { LengthModel } from "../../length-models.mjs";
import { createLanguageTag } from "../../language-tags.typeroof.jsx";

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
import { DocumentNodesMeta } from "./document-nodes-meta/index.mjs";
import { CompositionController } from "./text-composition/composition-controller.ts";
import { languageToHyphenationPatternKey } from "./text-composition/hyphenator.ts";
import { schemaSpec as proseMirrorDefaultSchemaSpec } from "../../prosemirror/default-schema";

import {
    DocumentRendererModeModel,
    DocumentRendererModeDfltEditorModel,
} from "../../document-renderer-mode/model.mjs";

import { UIDocumentRendererModeSelector } from "../../document-renderer-mode/ui-selector.typeroof.jsx";

import { createCommentsWidgets } from "../../ui-comments.mjs";
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
            heightUnit = height.get("unit"),
            widthValue = width.get("value");
        if (widthUnit.isEmpty) {
            widthUnit.value = widthUnit.constructor.Model.defaultValue; // "percent-layout";
            // The migration value is explicit here, not the default of
            // the generic LengthValueModel: "100% layout" is a rule of
            // the width field's legacy migration, not of every length.
            if (widthValue.isEmpty) widthValue.value = 100;
        }
        // otherwise value is filled by LengthModel's own coherence.
    },
);

// --- Hyphenation pattern loading (milestone 3, simplified) -------
// Resource requirements are yielded DIRECTLY from derived language
// usage. There is deliberately no serializable reference map: the
// actual pattern objects live only in the session dependency
// installedHyphenationPatterns and are reproducible vendored assets.

function languageTagParts(languageTag) {
    return Object.fromEntries(
        ["language", "script", "region"].map((key) => {
            const value = languageTag.get(key);
            return [key, value.isEmpty ? null : value.value];
        }),
    );
}

function partsToLanguageTag({ language, script, region }) {
    return createLanguageTag(language, script, region);
}

// Effective TypeSpec languages: local subtags override inherited
// subtags independently (a child may set only region/script).
function* walkEffectiveTypeSpecLanguageParts(typeSpec, inherited = {}) {
    const local = languageTagParts(typeSpec.get("languageTag")),
        effective = {
            language: local.language ?? inherited.language ?? null,
            script: local.script ?? inherited.script ?? null,
            region: local.region ?? inherited.region ?? null,
        };
    if (effective.language !== null) yield effective;
    for (const [, child] of typeSpec.get("children"))
        yield* walkEffectiveTypeSpecLanguageParts(child, effective);
}

// Simple style patches can override language on an inline run.
// Composite patches only reference source patches already in this map,
// so walking every simple source covers them too. A partial patch tag
// (e.g. region-only) is combined with every effective TypeSpec tag it
// could patch; a language override is context-independent.
function* walkStylePatchLanguages(stylePatchesSource, typeSpecLanguageParts) {
    for (const [, stylePatch] of stylePatchesSource) {
        if (stylePatch.get("stylePatchTypeKey").value !== "SimpleStylePatch")
            continue;
        const instance = stylePatch.get("instance");
        if (!instance.hasWrapped) continue;
        const local = languageTagParts(instance.wrapped.get("languageTag"));
        if (local.language !== null) {
            const tag = partsToLanguageTag(local);
            if (tag !== null) yield tag;
            continue;
        }
        if (local.script === null && local.region === null) continue;
        for (const base of typeSpecLanguageParts) {
            const tag = createLanguageTag(
                base.language,
                local.script ?? base.script,
                local.region ?? base.region,
            );
            if (tag !== null) yield tag;
        }
    }
}

const requireHyphenationPatternsCoherenceFn = CoherenceFunction.create(
    [
        "initTypeSpec",
        "typeSpec",
        "stylePatchesSource",
        "installedHyphenationPatterns",
    ],
    function* requireHyphenationPatterns(
        { typeSpec, stylePatchesSource, installedHyphenationPatterns },
        { isNew },
    ) {
        const typeSpecRaw = unwrapPotentialWriteProxy(typeSpec),
            stylePatchesSourceRaw =
                unwrapPotentialWriteProxy(stylePatchesSource);
        if (!isNew && !typeSpecRaw.isDraft && !stylePatchesSourceRaw.isDraft)
            return; // languages unchanged — requirements can't have changed

        const typeSpecLanguageParts = [
                ...walkEffectiveTypeSpecLanguageParts(typeSpecRaw),
            ],
            typeSpecLanguages = typeSpecLanguageParts
                .map(partsToLanguageTag)
                .filter((tag) => tag !== null),
            languages = new Set([
                ...typeSpecLanguages,
                ...walkStylePatchLanguages(
                    stylePatchesSourceRaw,
                    typeSpecLanguageParts,
                ),
            ]),
            requiredKeys = new Set();
        for (const language of languages) {
            const key = languageToHyphenationPatternKey(language);
            if (key !== null) requiredKeys.add(key);
        }
        for (const key of requiredKeys) {
            if (installedHyphenationPatterns.has(key)) continue;
            yield new HyphenationPatternRequirement(
                installedHyphenationPatterns,
                key,
            );
        }
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
        ["comments", CommentsModel],
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
        // When true, the `font-variation-settings` applied to the samples
        // (and the parameters display) list all axes of the font explicitly,
        // including those that are at their default location. Otherwise,
        // only the axes that differ from their default location are listed.
        // The equivalent of the legacy tools "applyDefaultsExplicitly" flag.
        ["verboseFontVariationSettings", BooleanModel],
        ["showNodeTypeSpecLabels", BooleanModel],
        // Opt-in (plan 2026-10-07-1223, Phase 3): render text-composition
        // in the ProseMirror editor as decorations. Default off.
        ["composeInEditor", BooleanModel],
        _getType(
            "documentRendererMode",
            DocumentRendererModeModel,
            DocumentRendererModeDfltEditorModel,
        ),
        ["width", LengthModel],
        ["height", LengthModel],
        // Session-only pattern objects. The coherence below derives
        // requirements directly from TypeSpec + style-patch languages;
        // no reference/cache field is serialized with the document.
        [
            "installedHyphenationPatterns",
            new InternalizedDependency(
                "installedHyphenationPatterns",
                InstalledHyphenationPatternsModel,
            ),
        ],
        ensureDimensionBoundnessCoherenceFn,
        initTypeSpecCoherenceFn(DEFAULT_STATE),
        // order is enforced by the "initTypeSpec" name DEPENDENCY
        // (see the coherence), not by this position
        requireHyphenationPatternsCoherenceFn,
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
            ),
            // The id under which the always-active DocumentNodesMeta
            // root registers; the mode-gated viewer looks it up to
            // attach its renderer handler (configured here, not in
            // the modules).
            documentNodesMetaId = "documentNodesMeta";
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

        // per textblock composition results (text-composition
        // sub-module, milestone 1): published by the composition
        // controller, consumed by renderer attachments (viewer).
        widgetBus.wrapper.setProtocolHandlerImplementation(
            // does not raise when not found, instead returns null:
            // REQUIRED — OFF MODE is the absence of entries, so
            // consumers must get null instead of a KEY ERROR (the
            // fallback is the off-mode mechanism at the consumption
            // site).
            ...SimpleProtocolHandler.create("composition@", {
                notFoundFallbackValue: null,
            }),
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
                // Always-active, DOM-free text-composition SERVICE:
                // owns the Measurer, segmenter/algorithm invocation
                // and the composition@ publication. NO update-cycle
                // role (UPDATE_STRATEGY_NO_UPDATE): DocumentNodesMeta
                // drives composition inside its own cascade and looks
                // this service up by id (getWidgetById, null fallback
                // — composition is optional). relativeRootPath only
                // for path derivation (layout root = parent).
                {
                    id: "compositionController",
                    relativeRootPath: Path.fromParts(".", "document"),
                },
                [],
                CompositionController,
            ],
            [
                // Always-active, DOM-free document-tree meta layer: the
                // viewer/editor attach to it via its id; without a
                // renderer it walks the document with zero attachments.
                // ORDERING: must update BEFORE both renderers — its
                // node-properties scopes are their input; a renderer
                // updating first reads the previous edit's scope
                // (the one-cycle-lag bug).
                // No zone: DOM-less widgets are first-class.
                {
                    id: documentNodesMetaId,
                    relativeRootPath: Path.fromParts(".", "document"),
                },
                [
                    ["../proseMirrorSchema/nodes", "nodeSpec"],
                    ["../proseMirrorSchema/marks", "markSpec"],
                    ["../nodeSpecToTypeSpec", "nodeSpecToTypeSpec"],
                ],
                DocumentNodesMeta,
                zones,
                proseMirrorDefaultSchemaSpec,
                originTypeSpecPath,
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
                documentNodesMetaId,
                // baseClass = "typeroof-document",
                undefined,
                { compositionReveal: "lazy" },
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
                [["verboseFontVariationSettings", "value"]],
                UICheckboxInput,
                "verbose-font-variation-settings", // classToken
                getRegisteredPropertySetup(
                    `${GENERIC}verboseFontVariationSettings`,
                ).label, //label
            ],
            [
                { zone: "editor-manager" },
                [["showNodeTypeSpecLabels", "value"]],
                UICheckboxInput,
                "show-node-type-spec-labels", // classToken
                "Show Element Labels", //label
            ],
            [
                { zone: "editor-manager" },
                [["composeInEditor", "value"]],
                UICheckboxInput,
                "compose-in-editor", // classToken
                "Compose Text in Editor", //label
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
            ...createCommentsWidgets(zones),
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
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("nodeProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("composition@")
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
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("nodeProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("composition@")
            .resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export { TypeStageModel as Model, TypeStageController as Controller };
export default { Model: TypeStageModel, Controller: TypeStageController };
