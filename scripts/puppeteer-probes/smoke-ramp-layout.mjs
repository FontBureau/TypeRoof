// Smoke probe: ramp layout boots and composes. Originally (Phase-4,
// plan 2026-10-07-1223) this asserted NO composition decorations in
// ramp (the flag was deliberately not wired there); 67f3ce9f then
// turned compose-in-editor on by default — in ramp always-on, not
// optional — so the expectation flipped to a positive smoke. The
// flag-off case is covered by qa-compose-in-editor.mjs (type-stage
// runtime toggle).
// Loads the default state, switches to the Ramp layout, settles,
// then asserts: no page errors, composition decorations present,
// and the layout actually rendered an editor.

/* global shell */

export async function run({ page, consoleLines, setTimeout, log }) {
    const check = (label, condition, detail = "") => {
        log(`${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
        if (!condition) failures.push(label);
    };
    const failures = [];

    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeLayoutKey").value = "Ramp";
        }),
    );
    // layout switch is a full rebuild; give it a moment
    await setTimeout(5000);

    const state = await page.evaluate(() => ({
        layoutKey: shell.getEntry("/activeLayoutKey").value,
        prosemirror: document.querySelectorAll(".ProseMirror").length,
        compositionLines: document.querySelectorAll(
            ".typeroof-composition-line",
        ).length,
        composedBlocks: document.querySelectorAll(".typeroof-composed")
            .length,
    }));
    check("ramp layout active", state.layoutKey === "Ramp", state.layoutKey);
    check(
        "ramp editor rendered",
        state.prosemirror > 0,
        `ProseMirror roots: ${state.prosemirror}`,
    );
    check(
        "ramp composes in editor (always on, no flag)",
        state.compositionLines > 0 && state.composedBlocks > 0,
        `lines=${state.compositionLines} composed=${state.composedBlocks}`,
    );
    const pageErrors = consoleLines.filter((line) =>
        line.startsWith("[PAGEERROR]"),
    );
    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));

    if (failures.length > 0)
        throw new Error(`SMOKE FAILURES: ${failures.join(", ")}`);
    log("ramp smoke probe passed");
}
