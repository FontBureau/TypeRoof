// Harness for the showParameters / showNodeTypeSpecLabels regression
// in the type-stage layout:
// boots the real TypeStageController (as wired in lib/js/wikipedia/main.mjs
// MainUIController) over the ingested wikipedia document and flips the
// toggles. Uses direct imports with jsdom environment; run with
// the project vitest.config.mjs (JSX pragma h plugin).
import { readFileSync } from "node:fs";

import {
    Path,
    getEntry,
    _AbstractStructModel,
    InternalizedDependency,
    ForeignKey,
    driveResolveGenAsync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    deserializeGen,
} from "../../metamodel.mjs";
import { SimpleProtocolHandler } from "../../components/basics/component.mjs";
import {
    InstalledFontsModel,
    InstalledFontModel,
    InstalledHyphenationPatternsModel,
    InstalledHyphenationPatternModel as InstalledHyphenationPatternModelShim,
    HyphenationPatternRequirement,
} from "../../components/main-model.mjs";
import { createTypeStageModelVariantWithDefaults } from "../../components/layouts/type-stage/index.typeroof.jsx";
import { DocumentRendererModeModel } from "../../components/document-renderer-mode/model.mjs";
import { ingestWikipediaDocument } from "../../wikipedia/ingest";
import { _BaseContainerComponent } from "../../components/basics/component.mjs";
import { createAndGetDefaultZones } from "../../zones.typeroof.jsx";
import { ClassesAndStylesManager } from "../../components/classes-and-styles-manager.mjs";
import DOMTool from "../../domTool.mjs";
import DEFAULT_STATE from "../../wikipedia/type-stage-wikipedia-initial-state.json";
import TYPE_STAGE_DEFAULT_STATE from "../../../assets/type-stage-initial-state.json" with { type: "json" };
import { Controller as TypeStageController } from "../../components/layouts/type-stage/index.typeroof.jsx";
import { ENVIRONMENT_PROVIDER_KEYS } from "../../components/environment-provider.mjs";

const modelOf = (defaults) =>
    createTypeStageModelVariantWithDefaults(
        "TypeStageToggleDebugModel",
        defaults,
        { documentRendererMode: DocumentRendererModeModel },
    );

const wrapperModelOf = (Model) =>
    _AbstractStructModel.createClass(
        "ToggleDebugWrapperModel",
        [
            "installedFonts",
            new InternalizedDependency("installedFonts", InstalledFontsModel),
        ],
        [
            "installedHyphenationPatterns",
            new InternalizedDependency(
                "installedHyphenationPatterns",
                InstalledHyphenationPatternsModel,
            ),
        ],
        ["font", new InternalizedDependency("font", InstalledFontModel)],
        ["activeState", Model],
    );

const OPTS = Object.assign({}, SERIALIZE_OPTIONS, {
    format: SERIALIZE_FORMAT_OBJECT,
});

// Mirrors the relevant structure of MainUIController in
// lib/js/wikipedia/main.mjs: the layout controller sits behind an
// activationTest at ./activeState and receives the default zones.
class ToggleRoot extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        const rootPath = Path.fromParts(".", "activeState");
        super(widgetBus, zones, [
            // Mirrors lib/js/wikipedia/main.mjs: the shell provides the
            // manager; the layout controller looks it up via
            // widgetBus.getWidgetById in its constructor. Listed first
            // so it is initialized before TypeStageController is
            // created.
            [
                { id: "classes-and-styles-manager" },
                [],
                ClassesAndStylesManager,
                zones.get("layout"),
            ],
            [
                {
                    rootPath: rootPath,
                    zone: "main",
                    // The real app tests activeState.WrappedType ===
                    // Layout.Model (activeState is a DynamicStruct
                    // there). Here activeState has a fixed type, so the
                    // test is constant.
                    activationTest: () => true,
                    // An anchor for tests that need to observe the
                    // layout controller's protocol handlers.
                    id: "typeStageController",
                },
                [],
                TypeStageController,
                zones,
            ],
        ]);
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add("/activeState");
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add("/activeState");
        return dependencies;
    }
}

/**
 * Options (all default to the historical behavior, so existing
 * consumers are untouched):
 * - `fontAxisRanges`: the axisRanges of the fake font, as used by
 *   e.g. `setTypographicPropertiesToSample` for
 *   `verboseFontVariationSettings`. Empty (no variation axes) by
 *   default. Ignored when `fontValue` is given.
 * - `fontValue`: a REAL font object (with .hbFace/.axisRanges/
 *   .fontObject — the measurer.test.mjs loading pattern) replacing
 *   the stub font; needed by the text-composition harness.
 * - `harfbuzz`: the harfbuzzjs module namespace, put onto the
 *   widgetBus (the shells do this; without it the composition
 *   controller degrades to OFF).
 */
export async function buildWorld({
    fontAxisRanges = {},
    fontValue = null,
    harfbuzz = null,
    compositionTaskScheduler = undefined,
    useDefaultDocument = false,
    htmlOverride = null,
    defaultState = DEFAULT_STATE,
    environment = { width: 0, height: 0 },
} = {}) {
    const Model = modelOf(defaultState),
        WrapperModel = wrapperModelOf(Model),
        deps = {
            // a DRAFT like the shell's primed dependencies
            // (__asyncMetamorphoseState): the async resolver installs
            // fonts into it on demand (the state may reference fonts,
            // e.g. a style patch's activeFontKey)
            installedFonts: InstalledFontsModel.createPrimalDraft({}),
            // pre-install the vendored hyphenation patterns (the
            // shell would load them async via the ResourceRequirement
            // machinery; the harness's resolver is sync)
            // a DRAFT, like the shell's primed dependencies: the
            // resolver installs on-demand-loaded patterns into it
            // (they persist for the session — later sync metamorphoses
            // see them installed)
            installedHyphenationPatterns: (() => {
                const draft =
                    InstalledHyphenationPatternsModel.createPrimalDraft({});
                for (const key of ["en-us", "de", "el-monoton", "ru"]) {
                    const itemDraft =
                        InstalledHyphenationPatternModelShim.createPrimalState(
                            null,
                        ).getDraft();
                    itemDraft.value = JSON.parse(
                        readFileSync(
                            `lib/assets/hyphenation/${key}.json`,
                            "utf8",
                        ),
                    );
                    draft.set(key, itemDraft.metamorphose());
                }
                return draft;
            })(),
            font: (() => {
                const draft =
                    InstalledFontModel.createPrimalState(null).getDraft();
                draft.value =
                    fontValue !== null
                        ? fontValue
                        : {
                              fullName: "ToggleDebug FakeFont",
                              fontObject: {
                                  unitsPerEm: 2048,
                                  ascender: 1638,
                                  descender: -410,
                              },
                              axisRanges: fontAxisRanges,
                          };
                return draft.metamorphose();
            })(),
        },
        // NOTE: the path is relative to the current working directory,
        // vitest is expected to run from the project root.
        // The small fixture is enough: the toggles regression is
        // structural, not content-dependent, and provisioning the
        // parameters displays of a full Wikipedia article takes ~1 min.
        html =
            htmlOverride ??
            readFileSync("lib/js/tests/fixtures/typography-small.html", "utf8");

    // Boot like the shell does (async resource resolution): the
    // default state may reference resources — e.g. a style patch's
    // activeFontKey -> installedFonts — whose requirements forward
    // through the initTypeSpec coherence generator (see
    // index.typeroof.jsx). The resolver mirrors the shell's
    // _asyncResolve dispatch: font requirements install a fake
    // InstalledFontModel under the required key (the harness measures
    // everything with its fake font); hyphenation requirements serve
    // the pre-installed entries.
    const fakeFont = () => {
        const draft = InstalledFontModel.createPrimalState(null).getDraft();
        draft.value = {
            fullName: "ToggleDebug FakeFont",
            fontObject: {
                unitsPerEm: 2048,
                ascender: 1638,
                descender: -410,
            },
            axisRanges: fontAxisRanges,
        };
        return draft.metamorphose();
    };
    let state = await driveResolveGenAsync(
        async (resourceRequirement) => {
            const [indicator, ...args] = resourceRequirement.description;
            if (indicator === HyphenationPatternRequirement) {
                const [targetContainer, requiredKey] = args;
                // load on demand, like the shell's async resolver
                // (from the vendored assets); targetContainer is the
                // session dependency draft the requirement carries
                const itemDraft =
                    InstalledHyphenationPatternModelShim.createPrimalState(
                        null,
                    ).getDraft();
                itemDraft.value = JSON.parse(
                    readFileSync(
                        `lib/assets/hyphenation/${requiredKey}.json`,
                        "utf8",
                    ),
                );
                targetContainer.set(requiredKey, itemDraft.metamorphose());
                return requiredKey;
            }
            if (indicator instanceof ForeignKey) {
                const [targetContainer] = args;
                if (targetContainer.constructor === InstalledFontsModel) {
                    const [, requiredKey] = args;
                    targetContainer.set(requiredKey, fakeFont());
                    return requiredKey;
                }
                throw new Error(
                    `RESOURCE ERROR harness resolver: don't know how to resolve ${resourceRequirement}`,
                );
            }
            throw new Error(
                `RESOURCE ERROR harness resolver: don't know how to handle ${resourceRequirement}`,
            );
        },
        deserializeGen(WrapperModel, deps, { activeState: defaultState }, OPTS),
    );
    // The primal creation keeps the draft dependencies as-is; re-bind
    // through the draft path (like the shell's metamorphoseGen(
    // primedDependencies) drive): the drafts — now holding everything
    // the resolver installed — metamorphose into the immutable
    // dependencies of the final state.
    state = state.getDraft().metamorphose({
        ...deps,
        installedFonts: deps.installedFonts.metamorphose(),
        installedHyphenationPatterns:
            deps.installedHyphenationPatterns.metamorphose(),
    });
    if (!useDefaultDocument) {
        const parsed = new DOMParser().parseFromString(html, "text/html"),
            { document: docModel } = ingestWikipediaDocument(
                parsed,
                state.get("activeState").get("proseMirrorSchema"),
            ),
            draft = state.getDraft();
        draft.get("activeState").set("document", docModel);
        state = draft.metamorphose();
    }

    // NOTE: getEntry must always resolve against the CURRENT state,
    // activation tests etc. depend on it; hence the mutable ref.
    const current = { state },
        domTool = new DOMTool(document),
        zones = createAndGetDefaultZones(domTool.h, document.body),
        // The shells install environment@; the harness mirrors that so
        // widgets depending on it provision correctly. Initial values
        // are published upfront (like EnvironmentProvider's constructor).
        [environmentProtocolName, environmentHandler] =
            SimpleProtocolHandler.create("environment@", {
                treatAdressAsRootPath: false,
            }),
        protocolHandlers = new Map([
            [environmentProtocolName, environmentHandler],
        ]);
    for (const key of ENVIRONMENT_PROVIDER_KEYS) {
        environmentHandler.register(
            key,
            key === "dpr" ? 1 : { ...environment },
        );
    }
    const widgetBus = {
        domTool,
        rootPath: Path.fromParts("/"),
        protocolHandlers,
        changeState: () => {
            throw new Error("changeState not supported");
        },
        getEntry: (path) => getEntry(current.state, path.toString()),
    };
    if (compositionTaskScheduler !== undefined)
        widgetBus.compositionTaskScheduler = compositionTaskScheduler;
    // the shells expose harfbuzz on the widgetBus (shell.mjs:80-82);
    // only when provided — the composition controller's capability
    // fallback otherwise degrades to OFF by design
    if (harfbuzz !== null) widgetBus.harfbuzz = harfbuzz;

    const root = new ToggleRoot(widgetBus, zones);
    root.initialUpdate(state);
    return {
        root,
        getState: () => current.state,
        setState: (newState) => {
            current.state = newState;
        },
        widgetBus,
        zones,
        environmentHandler,
    };
}

export { DEFAULT_STATE as WIKIPEDIA_DEFAULT_STATE, TYPE_STAGE_DEFAULT_STATE };
