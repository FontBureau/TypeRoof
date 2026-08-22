// @vitest-environment jsdom
// Regression probe for the type-tools grid: X-dimension -> Type: Range
// -> axis type "font" -> axis tag "wght" produces two columns, but the
// second column misses its content (the default A-Z sample text).
// Suspected: the update-relevance pruning mis-skips a widget in the
// cellContent@/typeSpecProperties@ protocol chain.
import { describe, it, expect } from "vitest";

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
import { StateComparison } from "../../metamodel.mjs";
import { _BaseContainerComponent } from "../../components/basics/component.mjs";
import { createAndGetDefaultZones } from "../../zones.typeroof.jsx";
import DOMTool from "../../domTool.mjs";
import {
    Model as TypeToolsGridModel,
    Controller as TypeToolsGridController,
} from "../../components/layouts/type-tools-grid.mjs";

const WrapperModel = _AbstractStructModel.createClass(
    "GridDebugWrapperModel",
    [
        "installedFonts",
        new InternalizedDependency("installedFonts", InstalledFontsModel),
    ],
    ["font", new InternalizedDependency("font", InstalledFontModel)],
    ["activeState", TypeToolsGridModel],
);

const OPTS = Object.assign({}, SERIALIZE_OPTIONS, {
    format: SERIALIZE_FORMAT_OBJECT,
});

class GridRoot extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        const rootPath = Path.fromParts(".", "activeState");
        super(widgetBus, zones, [
            [
                {
                    rootPath: rootPath,
                    zone: "main",
                    activationTest: () => true,
                },
                [],
                TypeToolsGridController,
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

function buildGridWorld() {
    const fontDraft = InstalledFontModel.createPrimalState(null).getDraft();
    fontDraft.value = {
        fullName: "GridDebug FakeFont",
        fontObject: {
            unitsPerEm: 2048,
            ascender: 1638,
            descender: -410,
        },
        axisRanges: {
            wght: { min: 100, default: 400, max: 900 },
        },
    };
    const deps = {
        installedFonts: InstalledFontsModel.createPrimalState({}),
        font: fontDraft.metamorphose(),
    };
    let state = deserializeSync(
        WrapperModel,
        deps,
        { activeState: {} },
        OPTS,
    );
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
    const root = new GridRoot(widgetBus, zones);
    root.initialUpdate(state);
    return {
        root,
        zones,
        getState: () => current.state,
        setState: (newState) => {
            current.state = newState;
        },
    };
}

describe("grid Range font-axis", () => {
    it("fills the second column content", { timeout: 120_000 }, async () => {
        const world = buildGridWorld();
        let oldState = world.getState();
        const applyChange = (fn, label) => {
            const draft = oldState.getDraft();
            fn(draft.get("activeState"));
            const newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));
            oldState = newState;
            console.log(`[grid] applied: ${label}`);
        };
        const cellContents = () =>
            Array.from(
                world.zones
                    .get("layout")
                    .querySelectorAll(".ui_type_tools_grid-cell-content"),
                (el) => el.textContent,
            );
        const cellCount = () =>
            world.zones
                .get("layout")
                .querySelectorAll(".ui_type_tools_grid-cell").length;

        console.log("[grid] initial cells:", cellCount(), cellContents());

        // X-dimension -> Type: Range
        applyChange((activeState) => {
            activeState
                .get("properties")
                .get("dimensionX")
                .get("dimensionSequenceTypeKey").value = "Range";
        }, "dimensionX type=Range");

        // axis type "font" is the default; set axis tag "wght"
        applyChange((activeState) => {
            activeState
                .get("properties")
                .get("dimensionX")
                .get("instance")
                .get("axis")
                .get("fontAxisTagValue").value = "wght";
        }, "dimensionX axis tag=wght");

        console.log("[grid] after wght cells:", cellCount(), cellContents());
        const contents = cellContents();
        // Expect 2 columns (start/end of range) and every cell filled.
        expect(contents.length).toBeGreaterThanOrEqual(2);
        for (const [i, text] of contents.entries())
            expect(text, `cell #${i} content`).toMatch(/[A-Z]/);
    });
});
