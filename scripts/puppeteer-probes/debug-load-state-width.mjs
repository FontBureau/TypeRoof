// Diagnostic probe: loading a state file (File > Load State path)
// while the TypeStage layout PERSISTS resolves percent-layout widths
// against a wrong (stale?) environment layout width; loading after a
// layout switch (controller rebuilt) resolves correctly.
//
// Scenario A: boot shell (TypeStage active) -> uploadFile state.
// Scenario B: boot shell -> switch to MotionStage -> uploadFile state.
// Measures .typeroof-layout clientWidth, /activeState/width and the
// resolved inline width of a top paragraph (#mwHQ) at each step, and
// whether a window resize corrects scenario A.
//
// Run:
//   ./scripts/debug-with-puppeteer.mjs ./scripts/puppeteer-probes/debug-load-state-width.mjs

/* global shell */

import { quiet } from "./lib/editor-dom.mjs";

const STATE_FILE = "downloads/typeroof-20261009-210314.TypeStageWikipedia.json";
const interesting = (line) => line.includes("[PAGEERROR]");

async function measure(page) {
    return page.evaluate(() => {
        const layoutEl = document.querySelector(".typeroof-layout"),
            p = document.querySelector(
                "article.typeroof-document p#mwHQ, article.typeroof-document p",
            ),
            article = document.querySelector("article.typeroof-document");
        const tryGet = (fn) => {
            try {
                return fn();
            } catch {
                return null;
            }
        };
        let envLayout = null;
        try {
            envLayout = shell.protocolHandlers
                .get("environment@")
                .getRegistered("environment@layout");
        } catch (e) {
            envLayout = `ERR ${e.message}`;
        }
        return {
            layoutClientWidth: layoutEl?.clientWidth ?? null,
            envLayoutRegistered: envLayout,
            innerWidth: window.innerWidth,
            mode: tryGet(
                () => shell.getEntry("/activeState/documentRendererMode").value,
            ),
            widthModel: tryGet(() => {
                const w = shell.getEntry("/activeState/width");
                return `${w.get("value").value} ${w.get("unit").value}`;
            }),
            pWidthInline: p?.style?.width ?? null,
            pWidthComputed: p
                ? window.getComputedStyle(p).width
                : null,
            articleWidthInline: article?.style?.width ?? null,
            articleWidthComputed: article
                ? window.getComputedStyle(article).width
                : null,
        };
    });
}

async function loadStateFile(page) {
    // reset, so a repeated upload of the same file fires change again
    await page.evaluate(() => {
        document.querySelector(".typeroof-app-menu-state_file_input").value =
            "";
    });
    const input = await page.$(".typeroof-app-menu-state_file_input");
    if (!input) throw new Error("state file input not found");
    await input.uploadFile(STATE_FILE);
}


async function waitForViewer(page, setTimeout) {
    for (let i = 0; i < 120; i++) {
        const found = await page.evaluate(
            () =>
                document.querySelector(
                    "article.typeroof-document p#mwHQ",
                ) !== null,
        );
        if (found) return true;
        await setTimeout(500);
    }
    return false;
}

export async function run({ page, consoleLines, setTimeout, log }) {
    const settle = () => quiet(consoleLines, setTimeout, log, interesting, 30000);

    // --- Scenario A: direct load, TypeStage persists ---
    log("=== scenario A: boot (TypeStage persists) -> load state file ===");
    await settle();
    log("A boot:", JSON.stringify(await measure(page)));
    // Which inline pt widths does the DEFAULT document resolve?
    // (Suspect: 277.99pt leaks from here into the loaded document.)
    log(
        "A boot default-doc widths:",
        JSON.stringify(
            await page.evaluate(() =>
                [...document.querySelectorAll("[style*='width']")]
                    .filter((el) => /width:\s*[\d.]+pt/.test(el.style.cssText))
                    .map((el) => ({
                        tag: el.tagName,
                        nodeType: el.dataset.nodeType ?? null,
                        width: el.style.width,
                    }))
                    .slice(0, 30)
            ),
        ),
    );
    await loadStateFile(page);
    const viewerA = await waitForViewer(page, setTimeout);
    log("A viewer rendered:", viewerA);
    await settle();
    const aAfter = await measure(page);
    log("A after load:", JSON.stringify(aAfter));

    // does a window resize correct it? (environment flush path)
    await page.setViewport({ width: 1900, height: 1080 });
    await settle();
    await page.setViewport({ width: 1920, height: 1080 });
    await settle();
    const aResized = await measure(page);
    log("A after resize:", JSON.stringify(aResized));

    // Decisive branch: does an editor<->viewer roundtrip heal it?
    // (fresh viewer attachments; if the scope itself is stale, it
    // stays wrong; if only attachment/styler state is stale, it heals)
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "editor";
        }),
    );
    await settle();
    log(
        "A editor mode:",
        JSON.stringify(
            await page.evaluate(() => {
                const p = document.querySelector(
                    ".ui_prosemirror_host p",
                );
                return {
                    pWidthInline: p?.style?.width ?? null,
                    pWidthComputed: p ? getComputedStyle(p).width : null,
                };
            }),
        ),
    );
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "viewer";
        }),
    );
    await settle();
    log("A viewer again:", JSON.stringify(await measure(page)));

    // --- Scenario B: switch to MotionStage first, then load ---
    log("=== scenario B: switch to MotionStage -> load state file ===");
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeLayoutKey").value = "MotionStage";
        }),
    );
    await settle();
    log("B motion-stage:", JSON.stringify(await measure(page)));
    await loadStateFile(page);
    const viewerB = await waitForViewer(page, setTimeout);
    log("B viewer rendered:", viewerB);
    await settle();
    const bAfter = await measure(page);
    log("B after load:", JSON.stringify(bAfter));

    const pageErrors = consoleLines.filter((line) =>
        line.includes("[PAGEERROR]"),
    );
    log("page errors:", pageErrors.length, pageErrors[0] ?? "");
}
