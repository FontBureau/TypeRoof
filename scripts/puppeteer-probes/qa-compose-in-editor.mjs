// Phase-4 QA probe (plan 2026-10-07-1223-prosemirror-composition-decorations):
// automatable items of the Phase-0/Phase-3 manual QA matrix for
// composeInEditor. Covers, in a real browser with the default
// type-stage initial state (compare mode, greedy-fit):
//   baseline decoration coverage; typing drift + recomposition
//   refresh; Enter/Backspace (structural change); ArrowUp/Down across
//   forced breaks; undo/redo; runtime flag toggle off→on; block-type
//   change (schema re-creation, Trap-1 repaint); width identity
//   (recorded); no page errors / PM exceptions.
// Remains for human QA: caret feel at forced line starts, IME
// (accepted risk), Safari, visual judgment.

/* global shell */

import {
    snapshotEditor,
    placeCaretAtEnd,
    placeCaretAtOffset,
    installProbeHelpers,
    quiet,
    hasGaps,
} from "./lib/editor-dom.mjs";

const TEXTBLOCKS = [
    { label: "t1", type: "paragraph", snippet: "Intro text" },
    { label: "t2", type: "paragraph-2", snippet: "Gutenberg" },
    { label: "t2greek", type: "p2greek", snippet: "Επειδη" },
    { label: "t2russian", type: "p2russian", snippet: "глубоких" },
];

const interesting = (line) =>
    line.includes("composition@") || line.includes("[PAGEERROR]");

export async function run({ page, consoleLines, setTimeout, log }) {
    const failures = [],
        check = (label, condition, detail = "") => {
            log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
            if (!condition) failures.push(label);
        },
        settle = () => quiet(consoleLines, setTimeout, log, interesting, 60000),
        snapshot = () => page.evaluate(snapshotEditor),
        checkCoverage = async (label, blocks = null) => {
            const state = await snapshot(),
                gaps = hasGaps(
                    blocks === null
                        ? state
                        : Object.fromEntries(
                              Object.entries(state).filter(([k]) =>
                                  blocks.includes(k),
                              ),
                          ),
                );
            check(`${label}: decoration coverage`, gaps.length === 0, gaps.join(",") || JSON.stringify(Object.fromEntries(Object.entries(state).map(([k, v]) => [k, { composedClass: v.composedClass, lineSpans: v.lineSpans, totalLen: v.totalLen }]))));
            return state;
        };

    await installProbeHelpers(page, TEXTBLOCKS);
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "compare";
            shell.getEntry("/activeState/composeInEditor").value = true;
            shell.getEntry(
                "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
            ).value = "TextCompositionAlgorithmGreedyFitModel";
        }),
    );
    await settle();
    log("setup: compare + composeInEditor + greedy-fit");
    // enable temporary in-app debug logging, when present
    await page.evaluate(() => (window.__debugComposition = true));

    // 1. baseline
    const baseline = await checkCoverage("baseline");

    // 2. typing drift + refresh (mid-textblock)
    await page.evaluate(placeCaretAtOffset, TEXTBLOCKS[1], 40);
    await page.keyboard.type("z", { delay: 60 });
    const drift = await snapshot();
    check(
        "typing: decorations drift (mapped) before recomposition",
        drift.t2.composedClass === true && drift.t2.lineSpans > 0,
        `lineSpans=${drift.t2.lineSpans}`,
    );
    await settle();
    await checkCoverage("typing: recomposition refresh");

    // 3. undo/redo
    const undoKey = async () => {
            await page.keyboard.down("Control");
            await page.keyboard.press("z");
            await page.keyboard.up("Control");
        },
        redoKey = async () => {
            await page.keyboard.down("Control");
            await page.keyboard.press("y");
            await page.keyboard.up("Control");
        };
    await undoKey();
    await settle();
    const afterUndo = await snapshot();
    check(
        "undo: text reverted",
        afterUndo.t2.totalLen === baseline.t2.totalLen,
        `totalLen=${afterUndo.t2.totalLen} vs baseline ${baseline.t2.totalLen}`,
    );
    check(
        "undo: decorations intact",
        afterUndo.t2.composedClass === true &&
            afterUndo.t2.uncovered.length === 0,
    );
    await redoKey();
    await settle();
    await checkCoverage("redo");

    // 4. ArrowUp/Down across forced breaks
    await page.evaluate(placeCaretAtOffset, TEXTBLOCKS[1], 40);
    await page.keyboard.press("ArrowDown");
    const downState = await page.evaluate((probe) => {
            const sel = window.getSelection(),
                el = window.__findTextblock(probe);
            return {
                inside: el.contains(sel.anchorNode),
                text: sel.anchorNode?.nodeValue?.slice(0, 20) ?? "",
            };
        }, TEXTBLOCKS[1]),
        downOK = downState.inside;
    await page.keyboard.press("ArrowUp");
    const upState = await page.evaluate((probe) => {
        const sel = window.getSelection(),
            el = window.__findTextblock(probe);
        return { inside: el.contains(sel.anchorNode) };
    }, TEXTBLOCKS[1]);
    check(
        "arrows: up/down across forced breaks stays in textblock",
        downOK && upState.inside,
        JSON.stringify(downState),
    );

    // 5. Enter/Backspace (structural change)
    await page.evaluate(placeCaretAtEnd, TEXTBLOCKS[0]);
    await page.keyboard.press("Enter");
    await settle();
    await checkCoverage("Enter (split textblock)", ["t2", "t2greek", "t2russian"]);
    await page.keyboard.press("Backspace");
    await settle();
    const merged = await checkCoverage("Backspace (merge back)");
    check(
        "Backspace: t1 text restored",
        merged.t1.totalLen === baseline.t1.totalLen,
        `totalLen=${merged.t1.totalLen} vs baseline ${baseline.t1.totalLen}`,
    );

    // 6. runtime flag toggle
    await page.evaluate(() =>
        shell.changeState(
            () => (shell.getEntry("/activeState/composeInEditor").value = false),
        ),
    );
    await settle();
    const off = await snapshot();
    check(
        "flag OFF: no composition decorations",
        Object.values(off).every(
            (s) => s.composedClass === false && s.lineSpans === 0,
        ),
        JSON.stringify(Object.fromEntries(Object.entries(off).map(([k, v]) => [k, v.lineSpans]))),
    );
    await page.evaluate(() =>
        shell.changeState(
            () => (shell.getEntry("/activeState/composeInEditor").value = true),
        ),
    );
    // The heal is asynchronous: stale registrations (paths whose
    // textblock node changed since their last publication) are
    // re-driven and republished by the cascade, which can settle a
    // moment after the console goes quiet. Poll coverage for a while.
    {
        let lastState = null,
            gaps = null,
            healed = false;
        for (let i = 0; i < 20; i++) {
            await setTimeout(500);
            lastState = await snapshot();
            gaps = hasGaps(lastState);
            if (gaps.length === 0) {
                healed = true;
                break;
            }
        }
        check(
            "flag ON again: decoration coverage (async heal)",
            healed,
            (gaps ?? []).join(","),
        );
    }

    // 7. block-type change (schema re-creation, Trap-1 repaint)
    const typeChange = await page.evaluate(() => {
        try {
            shell.changeState(() => {
                shell.getEntry(
                    "/activeState/document/content/0/content/3/typeKey",
                ).value = "paragraph-2";
            });
            return { ok: true };
        } catch (error) {
            return { ok: false, error: String(error).slice(0, 200) };
        }
    });
    if (typeChange.ok) {
        await settle();
        await checkCoverage("block-type change", ["t2", "t2greek", "t2russian"]);
        const t1New = await page.evaluate(() => {
            const el = [
                ...document.querySelectorAll(
                    '.ProseMirror [data-node-type="paragraph-2"]',
                ),
            ].find((e) => e.textContent.includes("Intro text"));
            return el
                ? {
                      found: true,
                      composedClass: el.classList.contains("typeroof-composed"),
                  }
                : { found: false };
        });
        check(
            "block-type change: t1 re-rendered composed under new type",
            t1New.found && t1New.composedClass,
            JSON.stringify(t1New),
        );
    } else log("SKIP block-type change — model rejected:", typeChange.error);

    // 8. width identity (record only — plan Trap 2)
    const widths = await page.evaluate(() => {
        const editor = [
                ...document.querySelectorAll(
                    '.ProseMirror [data-node-type="paragraph-2"]',
                ),
            ].find((e) => e.textContent.includes("Gutenberg")),
            viewer = [
                ...document.querySelectorAll(
                    ':not(.ProseMirror) [data-node-type="paragraph-2"]',
                ),
            ].find((e) => e.textContent.includes("Gutenberg"));
        return {
            editorStyleWidth: editor?.style.width ?? null,
            editorRectPt: editor
                ? editor.getBoundingClientRect().width * 0.75
                : null,
            viewerRectPt: viewer
                ? viewer.getBoundingClientRect().width * 0.75
                : null,
        };
    });
    log("width identity (record):", JSON.stringify(widths));

    // 9. no page errors / PM exceptions
    const pageErrors = consoleLines.filter((line) =>
            line.startsWith("[PAGEERROR]"),
        ),
        pmWarnings = consoleLines.filter(
            (line) =>
                /error/i.test(line) &&
                !line.includes("[PAGEERROR]") &&
                !line.includes("KEY ERROR not found"),
        );
    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
    check(
        "no console errors",
        pmWarnings.length === 0,
        pmWarnings.slice(0, 3).join(" | "),
    );

    if (failures.length > 0)
        throw new Error(`QA FAILURES (${failures.length}): ${failures.join(", ")}`);
    log("QA probe passed all checks");
}
