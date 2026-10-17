// Probe for scripts/debug-with-puppeteer.mjs — underfullTreatment QA
// (operator 2026-10-16 12:50: "doesn't seem to have an effect on the
// headlines"). Diagnoses first (what the algorithm sees), then the
// three modes end to end on the h1.

/* global shell */

const STATE_PATH =
    "/TypeRoof/downloads/typeroof-20261016-140124.TypeStage.json";
export const url = `http://localhost:3100/TypeRoof/shell.html#from-url:${STATE_PATH}`;
const SETTLE_MS = 900;

export async function run({ page, consoleLines, setTimeout, log }) {
    const settle = () => setTimeout(SETTLE_MS);

    // the supplied state configures the headings typeSpec itself
    // (GF + robotoFlexHeadline + anchoring off + fill + run); the
    // root stays KP+off for the paragraphs. No reconfiguration.
    await settle();
    const headingsConfig = await page.evaluate(() => {
        const instance = shell.getEntry(
            "/activeState/typeSpec/children/headings/textCompositionAlgorithm/instance",
        );
        const read = (field) => {
            const value = instance.get(field);
            return value.isEmpty ? "(empty)" : value.value;
        };
        return {
            potentials: read("potentials"),
            underfullTreatment: read("underfullTreatment"),
            lastLineHandling: read("lastLineHandling"),
            anchoring: read("potentialsAnchoring"),
        };
    });
    log("headings config:", JSON.stringify(headingsConfig));

    // all three headings per underfullTreatment mode (set on the
    // HEADINGS typeSpec, where the state's config lives)
    for (const treatment of ["run", "off"]) {
        await page.evaluate(async (treatment) => {
            await shell.changeState(() => {
                const instance = shell.getEntry(
                    "/activeState/typeSpec/children/headings/textCompositionAlgorithm/instance",
                );
                instance.get("underfullTreatment").value = treatment;
            });
        }, treatment);
        await settle();
        const state = await page.evaluate(() => {
            const root =
                document.querySelector("article.typeroof-document") ??
                document;
            const out = [];
            // the three heading blocks: first three composed blocks
            // (heading-1, heading-2, heading-3 in document order)
            const blocks = [
                ...root.querySelectorAll(".typeroof-composed"),
            ]
                // only the three heading blocks (document order: the
                // first three textblocks are heading-1/2/3)
                .filter((block) => /^H[123]$/.test(block.tagName))
                .slice(0, 3);
            for (const block of blocks)
                out.push({
                    text: block.textContent.trim().slice(0, 24),
                    spans: [
                        ...block.querySelectorAll(".typeroof-composition-line"),
                    ].map((span) => ({
                        text: span.textContent.trim().slice(0, 20),
                        wdth: span.style
                            .getPropertyValue("font-variation-settings")
                            .match(/"wdth" ([\d.]+)/)?.[1],
                        wght: span.style
                            .getPropertyValue("font-variation-settings")
                            .match(/"wght" ([\d.]+)/)?.[1],
                    })),
                });
            return out;
        });
        log(
            `state headings + underfullTreatment=${treatment}:`,
            JSON.stringify(state, null, 1),
        );
    }

    const errors = consoleLines.filter(
        (line) => line.includes("Uncaught") || line.includes("TypeError"),
    );
    if (errors.length > 0) throw new Error(`console errors: ${errors.length}`);
    log("DONE");
}