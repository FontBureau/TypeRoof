import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";
import { setTimeout } from "node:timers/promises";

/* global shell */

const directory = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE_FIXTURE_PATH = path.join(directory, "../docs/states-library/fixtures/wikipedia-snapshot.json"),
    STAGING_DIRECTORY = path.join(directory, "../downloads/perf-composition"),
    DEFAULT_PLAYER_URL = "http://localhost:3000/TypeRoof/app/player",
    VIEWPORT = Object.freeze({ width: 1920, height: 1080 }),
    EXPECTED_LAYOUT_WIDTH = 1600,
    EXPECTED_TEXT_NODES = 1087,
    EXPECTED_COMPOSITION_BLOCKS = 209,
    EXPECTED_LAYOUT = "TypeStage",
    ALGORITHM_KEYS = Object.freeze({
        none: "TextCompositionAlgorithmNoneModel",
        ragged: "TextCompositionAlgorithmGreedyRaggedModel",
        fit: "TextCompositionAlgorithmGreedyFitModel",
    }),
    RENDERER_MODES = Object.freeze(["editor", "viewer", "compare"]),
    ALGORITHMS = Object.freeze(Object.keys(ALGORITHM_KEYS)),
    WORKLOADS = Object.freeze([
        "typing",
        "relevant-style",
        "irrelevant-style",
        "inherited-style-partial-recompose",
    ]),
    TRANSITION_WORKLOADS = Object.freeze([
        "mode-transition",
        "algorithm-transition",
    ]);

const fixtureName = (rendererMode, algorithm) =>
    `wikipedia-${rendererMode}-${algorithm}.json`;

export function stageFixtures() {
    mkdirSync(STAGING_DIRECTORY, { recursive: true });
    copyFileSync(SOURCE_FIXTURE_PATH, path.join(STAGING_DIRECTORY, "source.json"));
    const source = JSON.parse(readFileSync(SOURCE_FIXTURE_PATH, "utf8"));
    for (const rendererMode of RENDERER_MODES)
        for (const algorithm of ALGORITHMS) {
            const fixture = structuredClone(source);
            fixture.activeState.documentRendererMode = rendererMode;
            fixture.activeState.typeSpec.textCompositionAlgorithm = {
                textCompositionAlgorithmTypeKey: ALGORITHM_KEYS[algorithm],
            };
            writeFileSync(
                path.join(STAGING_DIRECTORY, fixtureName(rendererMode, algorithm)),
                JSON.stringify(fixture),
            );
        }
}

export function removeStagedFixtures() {
    rmSync(STAGING_DIRECTORY, { recursive: true, force: true });
}

export function fixtureURL(playerURL, rendererMode, algorithm) {
    const fixturePath = `/TypeRoof/downloads/perf-composition/${fixtureName(rendererMode, algorithm)}`;
    return new URL(`#[no-chrome]from-url:${fixturePath}`, playerURL);
}

const activeBrowsers = new Set();

export async function launchBrowser() {
    const browser = await puppeteer.launch({
        headless: true,
        timeout: 100000,
        protocolTimeout: 300000,
        executablePath: "/usr/bin/chromium-browser",
    });
    activeBrowsers.add(browser);
    browser.once("disconnected", () => activeBrowsers.delete(browser));
    return browser;
}

export async function closeAllBrowsers() {
    await Promise.allSettled([...activeBrowsers].map((browser) => browser.close()));
    activeBrowsers.clear();
}

export async function waitForShell(page) {
    for (let count = 0; count * 250 <= 90000; count++) {
        if (await page.evaluate(() => "shell" in window)) return;
        await setTimeout(250);
    }
    throw new Error("TIMEOUT waiting for shell");
}

export async function installPublicationObserver(page) {
    await page.evaluateOnNewDocument((layoutWidth) => {
        document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.dataset.perfCompositionGeometry = "";
            style.textContent = `.typeroof-layout { width: ${layoutWidth}px !important; }`;
            document.head.append(style);
        });
        const original = console.log.bind(console);
        window.__compositionPerf = { epoch: 0, publicationTimes: [] };
        console.log = (...args) => {
            if (
                typeof args[0] === "string" &&
                args[0].includes(" published composition@")
            )
                window.__compositionPerf.publicationTimes.push(
                    performance.now() - window.__compositionPerf.epoch,
                );
            original(...args);
        };
    }, EXPECTED_LAYOUT_WIDTH);
}

export async function resetPublicationObserver(page) {
    await page.evaluate(() => {
        window.__compositionPerf.epoch = performance.now();
        window.__compositionPerf.publicationTimes = [];
    });
}

export async function publicationSnapshot(page) {
    return await page.evaluate(() => {
        const times = window.__compositionPerf?.publicationTimes ?? [];
        return {
            count: times.length,
            firstMs: times.length === 0 ? null : times[0],
            allMs: times.length === 0 ? null : times.at(-1),
        };
    });
}

export async function verifyFixture(page, expectedMode, expectedAlgorithm) {
    const info = await page.evaluate(() => {
        const countText = (node) => {
                let count = node.get("typeKey").value === "text" ? 1 : 0;
                const content = node.get("content", null);
                if (content !== null)
                    for (const child of content.value) count += countText(child);
                return count;
            },
            layout = document.querySelector(".typeroof-layout");
        return {
            textNodes: countText(shell.getEntry("/activeState/document")),
            activeLayoutKey: shell.getEntry("/activeLayoutKey").value,
            rendererMode: shell.getEntry("/activeState/documentRendererMode").value,
            algorithmKey: shell.getEntry(
                "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
            ).value,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            layout: layout
                ? {
                      width: layout.getBoundingClientRect().width,
                      height: layout.getBoundingClientRect().height,
                  }
                : null,
        };
    });
    const expectedKey = ALGORITHM_KEYS[expectedAlgorithm];
    if (
        info.textNodes !== EXPECTED_TEXT_NODES ||
        info.activeLayoutKey !== EXPECTED_LAYOUT ||
        info.rendererMode !== expectedMode ||
        info.algorithmKey !== expectedKey ||
        info.layout?.width !== EXPECTED_LAYOUT_WIDTH
    )
        throw new Error(
            "FIXTURE ERROR expected " +
                `${EXPECTED_TEXT_NODES}/${EXPECTED_LAYOUT}/${expectedMode}/${expectedKey}, got ` +
                JSON.stringify(info),
        );
    return info;
}

export async function openFixturePage(browser, playerURL, rendererMode, algorithm) {
    const page = await browser.newPage();
    try {
        await page.setViewport(VIEWPORT);
        await installPublicationObserver(page);
        const navigationStart = performance.now();
        await page.goto(fixtureURL(playerURL, rendererMode, algorithm).toString(), {
            waitUntil: ["load", "domcontentloaded"],
            timeout: 180000,
        });
        await waitForShell(page);
        return {
            page,
            fixture: await verifyFixture(page, rendererMode, algorithm),
            shellReadyMs: performance.now() - navigationStart,
            publications: await publicationSnapshot(page),
        };
    } catch (error) {
        await page.close().catch(() => {});
        throw error;
    }
}

export async function prepareInteractionPaths(page) {
    return await page.evaluate(() => {
        const findFirstTextPath = (node, nodePath) => {
            for (const [index, child] of node.get("content").value.entries()) {
                const childPath = `${nodePath}/content/${index}`;
                if (child.get("typeKey").value === "text") return childPath;
                const found = findFirstTextPath(child, childPath);
                if (found !== null) return found;
            }
            return null;
        };
        return {
            text: findFirstTextPath(
                shell.getEntry("/activeState/document"),
                "/activeState/document",
            ),
            relevant:
                "/activeState/typeSpec/children/paragraphs/children/t1/relativeFontSize",
            partialRecompose: "/activeState/typeSpec/relativeFontSize",
            irrelevant: "/activeState/typeSpec/backgroundColor/instance/L",
        };
    });
}

const previousMode = (mode) => (mode === "editor" ? "viewer" : "editor"),
    previousAlgorithm = (algorithm) => (algorithm === "none" ? "ragged" : "none");

export async function runOperation(page, scenario, index, paths) {
    const { rendererMode, algorithm, workload } = scenario;
    if (workload === "mode-transition")
        await setRendererMode(page, previousMode(rendererMode));
    if (workload === "algorithm-transition")
        await setAlgorithm(page, previousAlgorithm(algorithm));
    await resetPublicationObserver(page);
    const durationMs = await page.evaluate(
        async ({ rendererMode, algorithmKey, workload, index, paths }) => {
            const t0 = performance.now();
            await shell.changeState(() => {
                if (workload === "typing")
                    shell.getEntry(paths.text + "/text").value =
                        `perf probe ${index} ${"x".repeat(index % 40)}`;
                else if (workload === "relevant-style")
                    shell.getEntry(paths.relevant).value = 1 + (index % 2) * 0.0001;
                else if (workload === "irrelevant-style")
                    shell.getEntry(paths.irrelevant).value = 99.99 + (index % 2) * 0.001;
                else if (workload === "inherited-style-partial-recompose")
                    shell.getEntry(paths.partialRecompose).value =
                        1.0001 + (index % 2) * 0.0001;
                else if (workload === "mode-transition")
                    shell.getEntry("/activeState/documentRendererMode").value = rendererMode;
                else if (workload === "algorithm-transition")
                    shell.getEntry(
                        "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
                    ).value = algorithmKey;
                else throw new Error(`unknown workload ${workload}`);
            });
            return performance.now() - t0;
        },
        { rendererMode, algorithmKey: ALGORITHM_KEYS[algorithm], workload, index, paths },
    );
    return { durationMs, publications: await publicationSnapshot(page) };
}

export async function setRendererMode(page, rendererMode) {
    await page.evaluate(
        async (value) => shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value = value;
        }),
        rendererMode,
    );
}

export async function setAlgorithm(page, algorithm) {
    await page.evaluate(
        async (algorithmKey) => shell.changeState(() => {
            shell.getEntry(
                "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
            ).value = algorithmKey;
        }),
        ALGORITHM_KEYS[algorithm],
    );
}
