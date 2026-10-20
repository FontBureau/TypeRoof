// Repro probe: adding a "Hard Style Link" (StylePatch -> MarkSpec) does
// not re-style marks in the VIEWER, while the editor reacts. Boots the
// wikipedia app with the operator's captured state (viewer mode,
// link marks render as unknown-style), adds the hard link
// StylePatch "link" -> MarkSpec "link" via shell.changeState, then
// asserts the viewer drops the unknown-style rendering. Control:
// switching to editor mode applies the styles.
//
// Run:
//   ./scripts/debug-with-puppeteer.mjs ./scripts/puppeteer-probes/debug-viewer-hard-style-link.mjs

/* global shell */

import { quiet } from "./lib/editor-dom.mjs";

export const url =
    "http://localhost:3100/app/wikipedia/index.html#from-url:/downloads/typeroof-20261009-210314.TypeStageWikipedia.json";

const interesting = (line) => line.includes("[PAGEERROR]");

export async function run({ page, consoleLines, setTimeout, log }) {
    const failures = [],
        check = (label, condition, detail = "") => {
            log(
                `${condition ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`,
            );
            if (!condition) failures.push(label);
        },
        settle = () => quiet(consoleLines, setTimeout, log, interesting, 30000),
        viewerLinkMarkState = () =>
            page.evaluate(() => {
                const article = document.querySelector(
                    "article.typeroof-document",
                );
                if (article === null) return { article: false };
                const marks = [
                    ...article.querySelectorAll('[data-mark-type="link"]'),
                ];
                return {
                    article: true,
                    count: marks.length,
                    unknown: marks.filter((m) =>
                        m.classList.contains("unknown-style"),
                    ).length,
                    sample: marks[0]?.outerHTML.slice(0, 160) ?? null,
                };
            });

    // 1. wait for the viewer to render link marks
    let initial = null;
    for (let i = 0; i < 120; i++) {
        initial = await viewerLinkMarkState();
        if (initial.article && initial.count > 0) break;
        await setTimeout(500);
    }
    check(
        "boot: viewer article with link marks",
        initial.article && initial.count > 0,
        JSON.stringify(initial),
    );
    if (!initial.article || initial.count === 0)
        throw new Error("no viewer / no link marks — aborting");
    // Not all marks are unknown-style: marks in contexts without
    // typeSpec styling get no styler at all (no unknown-style class).
    check(
        "baseline: link marks render as unknown-style",
        initial.unknown > 0,
        `${initial.unknown}/${initial.count} unknown`,
    );

    // 2. add the hard style link: StylePatch "link" -> MarkSpec "link"
    await page.evaluate(() =>
        shell.changeState(() => {
            const links = shell.getEntry(
                    "/activeState/typeSpec/markStyleLinks",
                ),
                keyItem = links.constructor.Model.createPrimalDraft(
                    links.dependencies,
                );
            keyItem.get("stylePatch").value = "link";
            links.set("link", keyItem);
        }),
    );
    await settle();

    const linked = await page.evaluate(
        () =>
            shell.getEntry("/activeState/typeSpec/markStyleLinks/link/stylePatch")
                .value,
    );
    check("model: hard style link stored", linked === "link", `=${linked}`);

    // 3. THE BUG: the viewer must re-style the link marks
    const after = await viewerLinkMarkState();
    check(
        "viewer: link marks re-styled after hard link add",
        after.unknown === 0,
        `${after.unknown}/${after.count} still unknown — sample: ${after.sample}`,
    );

    // 4. control: switching to editor applies the styles
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "editor";
        }),
    );
    await settle();
    const editor = await page.evaluate(() => {
        const host = document.querySelector(".ui_prosemirror_host");
        if (!host) return { host: false };
        const marks = [...host.querySelectorAll('[data-mark-type="link"]')];
        return {
            host: true,
            count: marks.length,
            unknown: marks.filter((m) => m.classList.contains("unknown-style"))
                .length,
        };
    });
    check(
        "editor: link marks styled (control)",
        editor.host && editor.count > 0 && editor.unknown === 0,
        JSON.stringify(editor),
    );

    // 5. compare mode: editor + viewer side by side, both styled
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "compare";
        }),
    );
    await settle();
    const compareViewer = await viewerLinkMarkState();
    check(
        "compare: viewer link marks styled",
        compareViewer.unknown === 0,
        JSON.stringify(compareViewer),
    );

    // 6. remove the link again in compare mode: both panes must fall
    // back to unknown-style (only marks with typeSpec styling get a
    // styler; the baseline delta is the no-styler contexts)
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/typeSpec/markStyleLinks").delete(
                "link",
            );
        }),
    );
    await settle();
    const removedViewer = await viewerLinkMarkState();
    check(
        "compare: viewer falls back to unknown-style on unlink",
        removedViewer.unknown === initial.unknown,
        `${removedViewer.unknown}/${removedViewer.count} unknown (baseline ${initial.unknown})`,
    );
    const removedEditor = await page.evaluate(() => {
        const host = document.querySelector(".ui_prosemirror_host");
        if (!host) return { host: false };
        const marks = [...host.querySelectorAll('[data-mark-type="link"]')];
        return {
            host: true,
            count: marks.length,
            unknown: marks.filter((m) => m.classList.contains("unknown-style"))
                .length,
        };
    });
    check(
        "compare: editor falls back to unknown-style on unlink",
        removedEditor.host && removedEditor.unknown > 0,
        JSON.stringify(removedEditor),
    );

    const pageErrors = consoleLines.filter((line) =>
        line.includes("[PAGEERROR]"),
    );
    check("no page errors", pageErrors.length === 0, pageErrors[0] ?? "");

    if (failures.length) throw new Error(`FAILURES: ${failures.join("; ")}`);
}
