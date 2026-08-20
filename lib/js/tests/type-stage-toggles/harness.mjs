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
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    deserializeSync,
} from "../../metamodel.mjs";
import {
    InstalledFontsModel,
    InstalledFontModel,
} from "../../components/main-model.mjs";
import { createTypeStageModelVariantWithDefaults } from "../../components/layouts/type-stage/index.typeroof.jsx";
import { DocumentRendererModeModel } from "../../components/document-renderer-mode/model.mjs";
import { ingestWikipediaDocument } from "../../wikipedia/ingest";
import { _BaseContainerComponent } from "../../components/basics/component.mjs";
import { createAndGetDefaultZones } from "../../zones.typeroof.jsx";
import DOMTool from "../../domTool.mjs";
import DEFAULT_STATE from "../../wikipedia/type-stage-wikipedia-initial-state.json";
import { Controller as TypeStageController } from "../../components/layouts/type-stage/index.typeroof.jsx";

const Model = createTypeStageModelVariantWithDefaults(
    "TypeStageToggleDebugModel",
    DEFAULT_STATE,
    { documentRendererMode: DocumentRendererModeModel },
);

const WrapperModel = _AbstractStructModel.createClass(
    "ToggleDebugWrapperModel",
    [
        "installedFonts",
        new InternalizedDependency("installedFonts", InstalledFontsModel),
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
            [
                {
                    rootPath: rootPath,
                    zone: "main",
                    // The real app tests activeState.WrappedType ===
                    // Layout.Model (activeState is a DynamicStruct
                    // there). Here activeState has a fixed type, so the
                    // test is constant.
                    activationTest: () => true,
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

export async function buildWorld() {
    const deps = {
            installedFonts: InstalledFontsModel.createPrimalState({}),
            font: (() => {
                const draft =
                    InstalledFontModel.createPrimalState(null).getDraft();
                draft.value = {
                    fullName: "ToggleDebug FakeFont",
                    fontObject: {
                        unitsPerEm: 2048,
                        ascender: 1638,
                        descender: -410,
                    },
                    axisRanges: {},
                };
                return draft.metamorphose();
            })(),
        },
        // NOTE: the path is relative to the current working directory,
        // vitest is expected to run from the project root.
        // The small fixture is enough: the toggles regression is
        // structural, not content-dependent, and provisioning the
        // parameters displays of a full Wikipedia article takes ~1 min.
        html = readFileSync("lib/js/tests/fixtures/typography-small.html", "utf8");

    let state = deserializeSync(
        WrapperModel,
        deps,
        { activeState: DEFAULT_STATE },
        OPTS,
    );
    const parsed = new DOMParser().parseFromString(html, "text/html"),
        { document: docModel } = ingestWikipediaDocument(
            parsed,
            state.get("activeState").get("proseMirrorSchema"),
        ),
        draft = state.getDraft();
    draft.get("activeState").set("document", docModel);
    state = draft.metamorphose();

    // NOTE: getEntry must always resolve against the CURRENT state,
    // activation tests etc. depend on it; hence the mutable ref.
    const current = { state },
        domTool = new DOMTool(document),
        zones = createAndGetDefaultZones(domTool.h, document.body),
        widgetBus = {
            domTool,
            rootPath: Path.fromParts("/"),
            protocolHandlers: new Map(),
            changeState: () => {
                throw new Error("changeState not supported");
            },
            getEntry: (path) => getEntry(current.state, path.toString()),
        };

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
    };
}
