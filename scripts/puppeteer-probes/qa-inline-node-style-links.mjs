// Probe for scripts/debug-with-puppeteer.mjs — approach (a) phase 4 QA
// (plan 2026-10-12-2127-inline-node-refinements-approach-a.md): the
// inlineNodesStyleLinks family + the channel routing. Inline nodes
// style like MARKS (UIDocumentStyleStyler via the styleLinkProperties@
// merge channel), never through the per-node block styler. Asserted on
// the live en/Typography load — each state transition rides its OWN
// changeState (realistic operator usage; combined multi-edits in one
// transaction are out of scope):
//   * baseline (no edge, viewer): inline [data-node-type] elements
//     carry NO inline font-size (a1 — the block styler's root-fallback
//     write is gone; clean inherit);
//   * LIVE edge add (root typeSpec, whole-edge inheritance): every
//     generic-inline element styles at 30pt (40px) — generic-inline ->
//     the "bold" patch, relativeFontSize {value: 30, unit: pt};
//   * live tombstone clears the styling;
//   * live re-link restores it (the tombstone's coherence cleared
//     stylePatch — BOTH fields must be restored);
//   * mode switches editor<->viewer with the stable edge keep the
//     styling in BOTH renderers;
//   * final tombstone + restore leaves the document unstyled;
//   * no PAGEERROR anywhere.
// Remains for human QA: visual judgment, caret feel.

/* global shell */

export const url =
    "http://localhost:3100/TypeRoof/app/wikipedia/index.html";

export async function run({ page, consoleLines, setTimeout, log }) {
    const failures = [],
        check = (label, condition, detail = "") => {
            log(
                `${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`,
            );
            if (!condition) failures.push(label);
        },
        settle = async (ms = 1500) => {
            await setTimeout(ms);
        },
        pageErrors = () =>
            consoleLines.filter((line) => line.includes("[PAGEERROR]"));

    if (
        !(await page.evaluate(() => {
            const form = document.querySelector("form");
            if (form === null) return false;
            form.dispatchEvent(new Event("submit", { cancelable: true }));
            return true;
        }))
    )
        throw new Error("PROBE FAIL: no wikipedia load form found");
    await page.waitForFunction(
        () => {
            const host =
                document.querySelector(".ProseMirror") ?? document.body;
            return host.textContent.includes("typeface");
        },
        { timeout: 60_000, polling: 500 },
    );

    // the "bold" style patch must exist in stylePatchesSource (the
    // state ships it; its relativeFontSize pair is the probe's knob)
    const patchKeys = await page.evaluate(() => [
        ...shell.getEntry("/activeState/stylePatchesSource").keys(),
    ]);
    check(
        `the "bold" style patch exists (${[...patchKeys].join(", ")})`,
        patchKeys.includes("bold"),
    );

    // the app boots in viewer mode
    await page.waitForFunction(
        () =>
            document.querySelectorAll('[data-node-type="generic-inline"]')
                .length > 0,
        { timeout: 20_000, polling: 500 },
    );
    await settle();

    const sampleFontSize = () =>
        page.evaluate(() => {
            const els = [
                ...document.querySelectorAll(
                    '[data-node-type="generic-inline"]',
                ),
            ];
            const el = els[0] ?? null,
                styled = els.filter(
                    (el) => el.style.fontSize !== "",
                ).length;
            return el === null
                ? null
                : {
                      inline: el.style.fontSize,
                      computed: getComputedStyle(el).fontSize,
                      styled,
                      total: els.length,
                      firstTag: el.tagName,
                      styleAttr: el.getAttribute("style"),
                  };
        });
    const setMode = (mode) =>
        page.evaluate(
            (mode) =>
                shell.changeState(() => {
                    shell.getEntry(
                        "/activeState/documentRendererMode",
                    ).value = mode;
                }),
            mode,
        );
    const setEdgeLinked = (linked) =>
        page.evaluate(
            (linked) =>
                shell.changeState(() => {
                    const edge = shell.getEntry(
                        "/activeState/typeSpec/inlineNodesStyleLinks/generic-inline",
                    );
                    edge.get("mode").value = linked ? "link" : "unlinked";
                    if (linked)
                        // the tombstone's coherence cleared stylePatch
                        // (mode !== 'link'): restore the patch key too
                        edge.get("stylePatch").value = "bold";
                }),
            linked,
        );

    // 1. baseline: a1 realized — no block-styler font-size write
    let sample = await sampleFontSize();
    check(
        "baseline (viewer): inline elements carry no inline font-size (a1)",
        sample !== null && sample.inline === "",
        JSON.stringify(sample),
    );

    // 2. LIVE edge add in the viewer: the patch knob + the root edge
    await page.evaluate(() =>
        shell.changeState(() => {
            const pair = shell.getEntry(
                "/activeState/stylePatchesSource/bold/instance/relativeFontSize",
            );
            pair.get("value").value = 30;
            pair.get("unit").value = "pt";
            const links = shell.getEntry(
                "/activeState/typeSpec/inlineNodesStyleLinks",
            );
            const edgeDraft = links.constructor.Model.createPrimalDraft(
                links.dependencies,
            );
            edgeDraft.get("stylePatch").value = "bold";
            edgeDraft.get("mode").value = "link";
            links.set("generic-inline", edgeDraft);
        }),
    );
    await settle(2500);
    sample = await sampleFontSize();
    check(
        "live edge add (viewer): generic-inline styles at 30pt",
        sample !== null && sample.inline === "30pt",
        JSON.stringify(sample),
    );

    // 3. live tombstone clears the styling
    await setEdgeLinked(false);
    await settle(2500);
    sample = await sampleFontSize();
    check(
        "live tombstone (viewer): the inline font-size clears",
        sample !== null && sample.inline === "",
        JSON.stringify(sample),
    );

    // 4. live re-link restores it (both fields — see setEdgeLinked)
    await setEdgeLinked(true);
    await settle(2500);
    const marked = await page.evaluate(
        () =>
            document.querySelectorAll(
                '[data-node-type="generic-inline"][data-uss-written]',
            ).length,
    );
    log(`marked-written elements in doc: ${marked}`);
    sample = await sampleFontSize();
    check(
        "live re-link (viewer): generic-inline styles at 30pt again",
        sample !== null && sample.inline === "30pt",
        JSON.stringify(sample),
    );

    // 5. editor mode with the stable edge — same channel there
    await setMode("editor");
    await page.waitForSelector(".ProseMirror [data-mark-type]", {
        timeout: 20_000,
    });
    await settle();
    sample = await sampleFontSize();
    check(
        "editor mode (stable edge): generic-inline styles at 30pt",
        sample !== null && sample.inline === "30pt",
        JSON.stringify(sample),
    );

    // 6. back to viewer — the styling survives the mode switches
    await setMode("viewer");
    await page.waitForFunction(
        () =>
            document.querySelectorAll('[data-node-type="generic-inline"]')
                .length > 0,
        { timeout: 20_000, polling: 500 },
    );
    await settle(5000);
    sample = await sampleFontSize();
    check(
        "back to viewer (stable edge): still styled at 30pt",
        sample !== null && sample.inline === "30pt",
        JSON.stringify(sample),
    );

    // 7. final tombstone: leave the document unstyled
    await setEdgeLinked(false);
    await settle(2000);
    sample = await sampleFontSize();
    check(
        "final tombstone: unstyled again",
        sample !== null && sample.inline === "",
        JSON.stringify(sample),
    );
    check(
        "no PAGEERROR (whole probe)",
        pageErrors().length === 0,
        pageErrors()[0] ?? "",
    );

    const events = consoleLines
        .map((l, i) => ({ i, l }))
        .filter(
            ({ l }) =>
                l.includes("VWRES-CREATE") ||
                l.includes("USS-DESTROY") ||
                l.includes("USS-FS"),
        );
    log(`EVENTS total=${events.length}`);
    for (const { i, l } of [
        ...events.slice(0, 6),
        ...events.slice(-10),
    ]) log(`EV[${i}] ${l.slice(0, 150)}`);
    const ussfs = consoleLines.filter((l) => l.includes("USS-FS"));
    log(`USS-FS count=${ussfs.length}`);
    for (const line of ussfs.slice(-6)) log(`USS-FS: ${line.slice(0, 160)}`);
    const creates = consoleLines.filter((l) => l.includes("VWRES-CREATE"));
    log(`VWRES-CREATE count=${creates.length}`);
    for (const line of creates.slice(-6)) log(`VWRES-CREATE: ${line.slice(0, 200)}`);
    const destroys = consoleLines.filter((l) => l.includes("USS-DESTROY"));
    log(`USS-DESTROY count=${destroys.length}`);
    for (const line of destroys.slice(-4)) log(`USS-DESTROY: ${line.slice(0, 120)}`);
    if (failures.length > 0)
        throw new Error(
            `PROBE FAIL (${failures.length}): ${failures.join(" | ")}`,
        );
    log("inline-node style-links QA: PROBE PASSED");
}
