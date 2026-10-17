// Phase-4 verification probe (plan
// 2026-10-08-1710-typespec-edit-perf-hyphenation-drive): per-tick wall
// time of a variable-font axis drag on the origin typeSpec, in the
// operator's repro configuration (type-stage default state, editor
// mode, composeInEditor OFF).
//
// A "tick" = one shell.changeState setting the wght axis value +
// settling until the UI update has run (changeState's promise resolves
// before _updateState; the root update is rAF-driven, so we wait two
// animation frames). This approximates the interactive slider feel.
//
// Prints a machine-readable RESULT line; exit code 0 always — this is
// a measurement probe, comparisons happen by running it on different
// revisions and diffing the RESULT lines.

/* global shell */

const TICKS = 24,
    AXES_PATH = "/activeState/typeSpec/axesLocations",
    WGHT_MIN = 300,
    WGHT_MAX = 700;

export async function run({ page, setTimeout, log }) {
    // Repro configuration: editor mode, compose-in-editor OFF (the
    // flag doesn't exist on fontbureau/main — guard for baseline runs).
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "editor";
            try {
                shell.getEntry("/activeState/composeInEditor").value = false;
            } catch {
                // pre-composeInEditor revision (e.g. fontbureau/main)
            }
        }),
    );
    await setTimeout(800);

    // Tick helper: change + wait for the rAF-driven UI update.
    const tick = (value) =>
        page.evaluate(
            ([path, v]) =>
                (async () => {
                    const t0 = performance.now();
                    await shell.changeState(() => {
                        shell.getEntry(path).setSimpleValue("wght", v);
                    });
                    // changeState resolves before _updateState; the
                    // root update is rAF-driven — wait two frames.
                    await new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve),
                        ),
                    );
                    return performance.now() - t0;
                })(),
            [AXES_PATH, value],
        );

    // Enable wght (first touch, includes one-off work).
    const enableMs = await tick((WGHT_MIN + WGHT_MAX) / 2);
    await setTimeout(300);

    const samples = [];
    for (let i = 0; i < TICKS; i++) {
        const value =
            WGHT_MIN + Math.round(((WGHT_MAX - WGHT_MIN) * i) / (TICKS - 1));
        samples.push(await tick(value));
        await setTimeout(30);
    }

    const sorted = [...samples].sort((a, b) => a - b),
        pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q))],
        median = pick(sorted.length / 2),
        p95 = pick(sorted.length * 0.95),
        max = sorted[sorted.length - 1];

    log(`enable wght: ${enableMs.toFixed(1)}ms`);
    log(
        `drag ticks (${TICKS}): median ${median.toFixed(1)}ms ` +
            `p95 ${p95.toFixed(1)}ms max ${max.toFixed(1)}ms`,
    );
    log(`samples: ${samples.map((s) => s.toFixed(0)).join(", ")}`);
    // Machine-readable line for before/after comparisons.
    console.log(
        `RESULT enable=${enableMs.toFixed(1)} median=${median.toFixed(1)} ` +
            `p95=${p95.toFixed(1)} max=${max.toFixed(1)}`,
    );
}
