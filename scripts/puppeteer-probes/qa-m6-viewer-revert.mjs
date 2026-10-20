// Probe: underfullTreatment in the VIEWER (operator 2026-10-16 16:40,
// state 2026-10-16-163733): the editor h2 reverts to run wdth 100 but
// the viewer renders 151. Fix: the viewer's revertAxesEntries lookup
// used leaves[leafIndex].sourceIndex — the payload leaves carry no
// sourceIndex; leafIndex IS the sourceIndex. Compare mode: both panes
// must show wdth 100 on the reverted lines.
/* global shell */

export const STATE_PATH =
    "/downloads/typeroof-20261016-163733.TypeStage.json";
export const url = `http://localhost:3100/shell.html#from-url:${STATE_PATH}`;

export async function run({ page, setTimeout, log }) {
    const settle = () => setTimeout(1600);
    await settle();

    await page.evaluate(async () => {
        await shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "compare";
        });
    });
    await settle();

    const dump = await page.evaluate(() => {
        const article = document.querySelector("article.typeroof-document");
        if (article === null) return { error: "no article" };
        const headings = [...article.querySelectorAll(".typeroof-composed")].filter(
            (b) => /^H[123]$/.test(b.tagName),
        );
        return headings.map((h) => ({
            tag: h.tagName,
            text: h.textContent.trim().slice(0, 14),
            spans: [...h.querySelectorAll(".typeroof-composition-line")].map(
                (span) => ({
                    wdth: span.style
                        .getPropertyValue("font-variation-settings")
                        .match(/"wdth" ([\d.]+)/)?.[1],
                    wght: span.style
                        .getPropertyValue("font-variation-settings")
                        .match(/"wght" ([\d.]+)/)?.[1],
                }),
            ),
        }));
    });
    log("viewer headings:", JSON.stringify(dump, null, 1));

    const bad = (dump ?? []).some((h) =>
        h.spans.some((s) => s.wdth !== undefined && Math.abs(Number(s.wdth) - 151) < 0.01 && Number(s.wdth) > 150),
    );
    // the headline config's authored dflt IS 151 — a REVERTED line must
    // render the run location (100). If any span renders 151 where the
    // editor reverts, the viewer lookup is still wrong.
    if (bad) throw new Error("viewer still renders the authored 151");
    log("OK — viewer renders the revert (run wdth 100) like the editor");
}