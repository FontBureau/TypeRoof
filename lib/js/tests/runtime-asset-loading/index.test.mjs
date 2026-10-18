// Keep Node's environment until harfbuzz has initialized its WASM.
import "../../vendor/harfbuzzjs/harfbuzz.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { serialize } from "../../metamodel.mjs";
import {
    ApplicationModel,
    AvailableFontsModel,
    AvailableLayoutModel,
    AvailableLayoutsModel,
    DeferredFontModel,
    InstalledFontModel,
    InstalledFontsModel,
    InstalledHyphenationPatternsModel,
} from "../../components/main-model.mjs";

let ShellController, createTypeStageModelVariantWithDefaults, dom;

beforeAll(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "http://localhost/",
    });
    for (const key of [
        "window",
        "document",
        "DOMParser",
        "Node",
        "Element",
        "HTMLElement",
        "DocumentFragment",
    ])
        vi.stubGlobal(key, key === "window" ? dom.window : dom.window[key]);
    ({ ShellController } = await import("../../shell.mjs"));
    ({ createTypeStageModelVariantWithDefaults } = await import(
        "../../components/layouts/type-stage/index.typeroof.jsx"
    ));
});

afterAll(() => {
    vi.unstubAllGlobals();
    dom?.window.close();
});

async function bootShell(
    fetch,
    defaultState = {
        typeSpec: {
            languageTag: { language: "en" },
            children: [["body", {}]],
        },
    },
) {
    const TypeStageModel = createTypeStageModelVariantWithDefaults(
            "RuntimeAssetLoadingTypeStageModel",
            defaultState,
        ),
        shell = Object.create(ShellController.prototype);
    Object.assign(shell, {
        state: null,
        draftState: null,
        _lockChangeState: null,
        _requireReviewResourcesFlag: false,
        _contentWindow: { fetch },
        _ui: { widgetBus: {}, update() {} },
        _hyphenationPatternsCache: new Map(),
        _stateDependenciesDrafts: new Map(),
        _stateDependencyModels: {
            availableFonts: AvailableFontsModel,
            installedFonts: InstalledFontsModel,
            installedHyphenationPatterns: InstalledHyphenationPatternsModel,
            availableLayouts: AvailableLayoutsModel,
        },
    });
    for (const key of Object.keys(shell._stateDependencyModels))
        shell._useStateDependencyDraft(key);

    const font = InstalledFontModel.createPrimalDraft({});
    font.value = {
        fullName: "Runtime asset fixture font",
        fontObject: { unitsPerEm: 2048, ascender: 1638, descender: -410 },
        axisRanges: {},
    };
    shell
        ._requireStateDependencyDraft("installedFonts")
        .set(font.value.fullName, font);
    const deferredFont = DeferredFontModel.createPrimalDraft({});
    deferredFont.value = { fullName: font.value.fullName };
    shell
        ._requireStateDependencyDraft("availableFonts")
        .set(font.value.fullName, deferredFont);
    const layout = AvailableLayoutModel.createPrimalDraft({});
    layout.get("label").value = "Type stage";
    layout.get("typeClass").value = TypeStageModel;
    shell
        ._requireStateDependencyDraft("availableLayouts")
        .set("type-stage", layout);
    for (const key of Object.keys(shell._stateDependencyModels))
        shell._unuseStateDependencyDraft(key);

    // Same primal-state shim as shell bootstrap, without UI/storage.
    shell.state = await shell._asyncMetamorphoseState({
        metamorphoseGen: (dependencies) =>
            ApplicationModel.createPrimalStateGen(dependencies),
    });
    return shell;
}

function readPatterns(patternKey) {
    return JSON.parse(
        readFileSync(
            new URL(
                "../../../assets/hyphenation/" + patternKey + ".json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
}

function assertLanguageState(state, language, patternKey) {
    const layout = state.get("activeState"),
        installed = state.get("installedHyphenationPatterns");
    expect(state.isDraft).toBe(false);
    expect(
        layout.get("typeSpec").get("languageTag").get("language").value,
    ).toBe(language);
    expect(installed.has(patternKey)).toBe(true);
    expect(installed.get(patternKey).value).toEqual(readPatterns(patternKey));
}

describe("runtime asset loading", () => {
    it("loads patterns directly into the session dependency and serializes no pattern bookkeeping", async () => {
        const fetch = async (url) => {
                const key = new URL(url).pathname
                    .split("/")
                    .at(-1)
                    .replace(".json", "");
                return { ok: true, json: async () => readPatterns(key) };
            },
            shell = await bootShell(fetch),
            [errors, serialized] = serialize(shell.state),
            payload = JSON.parse(serialized);
        expect(errors).toEqual([]);
        // TypeStage coherence yields a direct requirement from the
        // effective language; only the session dependency stores the
        // installed pattern. There is no intermediate reference map.
        expect(
            shell.state.get("installedHyphenationPatterns").has("en-us"),
        ).toBe(true);
        expect(payload.activeState).not.toHaveProperty("hyphenationPatterns");
        expect(payload).not.toHaveProperty("installedHyphenationPatterns");
    });

    it("includes simple style-patch language overrides in direct requirements", async () => {
        const fetchedAssets = [],
            fetch = async (url) => {
                const key = new URL(url).pathname
                    .split("/")
                    .at(-1)
                    .replace(".json", "");
                fetchedAssets.push(key);
                return { ok: true, json: async () => readPatterns(key) };
            },
            shell = await bootShell(fetch, {
                typeSpec: {
                    languageTag: { language: "en" },
                    children: [["body", {}]],
                },
                stylePatchesSource: [
                    [
                        "russian-run",
                        {
                            stylePatchTypeKey: "SimpleStylePatch",
                            instance: {
                                languageTag: { language: "ru" },
                            },
                        },
                    ],
                ],
            });
        expect(fetchedAssets.sort()).toEqual(["en-us", "ru"]);
        expect(
            [...shell.state.get("installedHyphenationPatterns").keys()].sort(),
        ).toEqual(["en-us", "ru"]);
        const [errors, serialized] = serialize(shell.state);
        expect(errors).toEqual([]);
        // The authored patch language remains; only runtime assets /
        // bookkeeping are absent.
        const payload = JSON.parse(serialized);
        expect(payload.activeState.stylePatchesSource).toEqual(
            expect.arrayContaining([expect.arrayContaining(["russian-run"])]),
        );
        expect(payload.activeState).not.toHaveProperty("hyphenationPatterns");
        expect(payload).not.toHaveProperty("installedHyphenationPatterns");
    });

    it("keeps direct language requirements coherent across en → de → en → de without refetching or mutating old states", async () => {
        const fetchedAssets = [],
            fetch = async (url) => {
                const key = new URL(url).pathname
                    .split("/")
                    .at(-1)
                    .replace(".json", "");
                expect(["en-us", "de"]).toContain(key);
                fetchedAssets.push(key);
                return { ok: true, json: async () => readPatterns(key) };
            },
            shell = await bootShell(fetch),
            bootState = shell.state,
            snapshots = [];
        assertLanguageState(bootState, "en", "en-us");
        expect(fetchedAssets).toEqual(["en-us"]);
        expect([
            ...bootState.get("installedHyphenationPatterns").keys(),
        ]).toEqual(["en-us"]);
        const englishPatterns = bootState
            .get("installedHyphenationPatterns")
            .get("en-us").value;
        let germanPatterns;
        snapshots.push([bootState, "en", "en-us"]);

        for (const [language, patternKey] of [
            ["de", "de"],
            ["en", "en-us"],
            ["de", "de"],
        ]) {
            const draft = shell.state.getDraft();
            draft
                .get("activeState")
                .get("typeSpec")
                .get("languageTag")
                .get("language").value = language;
            // Await the actual commit, not changeState's earlier callback resolution.
            // No review flag: the missing German asset must survive the
            // synchronous metamorphosis probe followed by its async retry.
            await shell._updateState(draft);
            assertLanguageState(shell.state, language, patternKey);
            expect(fetchedAssets).toEqual(["en-us", "de"]);
            const installed = shell.state.get("installedHyphenationPatterns");
            expect(installed.get("en-us").value).toBe(englishPatterns);
            if (germanPatterns === undefined)
                germanPatterns = installed.get("de").value;
            expect(installed.get("de").value).toBe(germanPatterns);
            for (const snapshot of snapshots) assertLanguageState(...snapshot);
            expect([
                ...bootState.get("installedHyphenationPatterns").keys(),
            ]).toEqual(["en-us"]);
            snapshots.push([shell.state, language, patternKey]);
        }

        const beforeNoOp = shell.state;
        await shell._updateState(shell.state.getDraft());
        expect(shell.state).toBe(beforeNoOp);
        expect(fetchedAssets).toEqual(["en-us", "de"]);
    });
});
