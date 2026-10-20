// Probe for scripts/debug-with-puppeteer.mjs — the draining
// round-robin composition task scheduler (the shell-level policy via
// widgetBus.compositionTaskScheduler, see shell.mjs:_initUI):
//   1. the booted shell bus carries the DRAINING scheduler: source
//      comparison against a fresh in-page instance (imported from the
//      vite-served module) — and a protocol simulation on that fresh
//      instance: a task's re-entrant continuations are absorbed into
//      one synchronous drain (one textblock per tick) while a second
//      queued task composes only in the NEXT macrotask — the paint
//      opportunity between block nodes,
//   2. switching the composition algorithm re-composes the document
//      per block node for EVERY algorithm (knuth-plass, greedy-fit,
//      greedy-ragged, dummy): all watched textblocks settle fully
//      decorated (no decoration gaps) and without page errors.

import {
    snapshotEditor,
    installProbeHelpers,
    hasGaps,
} from "./lib/editor-dom.mjs";

// section content/0 children (type-stage-initial-state.json), located
// in the editor DOM by type + distinctive text snippet:
// t1 = paragraph "Intro text…", t2 = paragraph-2 Gutenberg, …
const TEXTBLOCKS = [
    { label: "t1", type: "paragraph", snippet: "Intro text" },
    { label: "t2", type: "paragraph-2", snippet: "Gutenberg" },
    { label: "t2greek", type: "p2greek", snippet: "Επειδη" },
    { label: "t2russian", type: "p2russian", snippet: "глубоких" },
],
    ALGORITHM_TYPE_KEYS = [
        "TextCompositionAlgorithmKnuthPlassModel",
        "TextCompositionAlgorithmGreedyFitModel",
        "TextCompositionAlgorithmGreedyRaggedModel",
        "TextCompositionAlgorithmDummyModel",
    ];

export async function run({ page, consoleLines, setTimeout, log }) {
    // 1) wiring + protocol simulation on a FRESH scheduler instance
    // (the bus scheduler's queue is shared with the app's boot
    // composition — the simulation must not depend on its state)
    const { busSchedulerMatches, simulation } = await page.evaluate(
        async () => {
            const { createDrainingRoundRobinTaskScheduler } = await import(
                "/lib/js/components/layouts/type-stage/text-composition/composition-task.ts"
            );
            const busScheduler = window.shell.compositionTaskScheduler;
            const scheduler = createDrainingRoundRobinTaskScheduler();
            const events = [];
            const makeTask = (label, reenters) => {
                const resume = () => {
                    events.push(label);
                    if (reenters-- > 0) scheduler(resume);
                };
                return resume;
            };
            // a boundary macrotask that marks the round in the log
            const boundary = () =>
                new Promise((resolve) =>
                    globalThis.setTimeout(() => {
                        events.push("|");
                        resolve();
                    }, 0),
                );
            const tick = () =>
                new Promise((resolve) => globalThis.setTimeout(resolve, 0));
            scheduler(makeTask("A", 2));
            scheduler(makeTask("B", 0));
            await boundary();
            const afterFirstTick = events.join(",");
            await tick();
            await tick();
            return {
                busSchedulerMatches:
                    String(busScheduler) === String(scheduler),
                simulation: `${afterFirstTick} => ${events.join(",")}`,
            };
        },
    );
    if (!busSchedulerMatches)
        throw new Error("WIRED? window.shell.compositionTaskScheduler is not the draining round-robin scheduler");
    // one drain per tick (A,A,A absorbed), B in the NEXT tick
    if (simulation !== "A,A,A,| => A,A,A,|,B")
        throw new Error(
            `drain protocol broken on the served module: ${simulation}`,
        );
    log("drain protocol OK:", simulation);

    await installProbeHelpers(page, TEXTBLOCKS);

    // 2) compare mode + editor composition, then the algorithm cascade
    await page.evaluate(() =>
        window.shell.changeState(() => {
            window.shell.getEntry("/activeState/documentRendererMode").value =
                "compare";
            window.shell.getEntry("/activeState/composeInEditor").value = true;
        }),
    );
    log("compare + composeInEditor set");

    const settleComposed = async (label) => {
        let lastGaps = ["<unset>"];
        for (let attempt = 0; attempt < 120; attempt++) {
            await setTimeout(500);
            const snapshot = await page.evaluate(snapshotEditor);
            lastGaps = hasGaps(snapshot);
            if (lastGaps.length === 0) return;
        }
        throw new Error(
            `composition did not settle (${label}): gaps ${lastGaps.join(", ")}`,
        );
    };
    await settleComposed("composeInEditor on");
    for (const typeKey of ALGORITHM_TYPE_KEYS) {
        await page.evaluate(
            (key) =>
                window.shell.changeState(() => {
                    window.shell.getEntry(
                        "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
                    ).value = key;
                }),
            typeKey,
        );
        await settleComposed(typeKey);
        log(`algorithm ${typeKey}: all textblocks composed`);
    }

    const pageErrors = consoleLines.filter((line) =>
        line.includes("[PAGEERROR]"),
    );
    if (pageErrors.length > 0)
        throw new Error(`PAGEERRORS: ${pageErrors.join(" | ")}`);
    log("OK — draining scheduler wired, cascades compose clean");
}