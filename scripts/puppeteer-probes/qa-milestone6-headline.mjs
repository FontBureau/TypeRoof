// Probe for scripts/debug-with-puppeteer.mjs — milestone 6 headline QA
// (operator 2026-10-15 00:06): "headline potentials everywhere + all
// type at wdth 151: lines don't break correctly anymore, always too
// long". ROOT-level repro (the panels probe proved root writes
// materialize): root greedy-fit + root potentials robotoFlexHeadline +
// root axesLocations wdth 151 + a narrow measure. Dumps payload lines
// (steps, natural widths) AND the rendered line widths vs the measure
// to localize: fitting bug vs measured/rendered disagreement.

/* global shell */

const SETTLE_MS = 900;

export async function run({ page, consoleLines, setTimeout, log }) {
    const settle = () => setTimeout(SETTLE_MS);

    const setRoot = async (fields) =>
        page.evaluate(async (fields) => {
            await shell.changeState(() => {
                shell.getEntry("/activeState/documentRendererMode").value =
                    "compare";
                shell.getEntry(
                    "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
                ).value = "TextCompositionAlgorithmGreedyFitModel";
            });
            // the dynamic struct materializes its instance on
            // metamorphose — write the config fields in a SECOND
            // transaction (awaited: changeState is queued async)
            await shell.changeState(() => {
                const instance = shell.getEntry(
                    "/activeState/typeSpec/textCompositionAlgorithm/instance",
                );
                for (const [field, value] of Object.entries(fields))
                    instance.get(field).value = value;
            });
        }, fields);

    const setWdth = async (wdth) =>
        page.evaluate(async (wdth) => {
            await shell.changeState(() => {
                // the typeSpec axesLocations values are plain NUMBERS
                // (AxesLocationsModel), not the axes-math struct
                const axes = shell.getEntry(
                    "/activeState/typeSpec/axesLocations",
                ),
                    draft =
                        axes.constructor.Model.createPrimalDraft(
                            axes.dependencies,
                        );
                draft.value = wdth;
                axes.set("wdth", draft);
            });
        }, wdth);

    const dump = async (label) => {
        const state = await page.evaluate(() => {
            const article = document.querySelector(
                    "article.typeroof-document",
                ),
                blocks = [...article.querySelectorAll(".typeroof-composed")],
                out = [];
            for (const block of blocks) {
                const anchor = block.style
                        .getPropertyValue("--node-anchor-name")
                        .split("@")
                        .at(-1)
                        .replaceAll("\\", ""),
                    spans = [
                        ...block.querySelectorAll(
                            ".typeroof-composition-line",
                        ),
                    ].map((span) => {
                        const rect = span.getBoundingClientRect(),
                            pt = (rect.width * 72) / 96;
                        return {
                            text: span.textContent.slice(0, 26),
                            renderedPt: Number(pt.toFixed(1)),
                            step: span.dataset.step ?? null,
                            fvs: span.style.getPropertyValue(
                                "font-variation-settings",
                            ),
                            colorCode: span.style.getPropertyValue(
                                "--line-color-code",
                            ),
                        };
                    });
                out.push({
                    anchor: anchor.split("/").slice(-3).join("/"),
                    text: block.textContent.trim().slice(0, 30),
                    blockPt: Number(
                        (
                            (block.getBoundingClientRect().width * 72) /
                            96
                        ).toFixed(1),
                    ),
                    spans,
                });
            }
            return out;
        });
        log(`${label}:`, JSON.stringify(state, null, 1));
        return state;
    };

    // the read-back of the resolved struct config
    const readBack = () =>
        page.evaluate(() => {
            const algorithm = shell.getEntry(
                    "/activeState/typeSpec/textCompositionAlgorithm",
                ),
                instance =
                    algorithm.get("instance").isEmpty
                        ? null
                        : algorithm.get("instance").wrapped;
            return {
                typeKey: algorithm
                    .get("textCompositionAlgorithmTypeKey")
                    .valueOf(),
                potentials:
                    instance === null
                        ? "(instance empty)"
                        : instance.get("potentials").isEmpty
                          ? "(empty)"
                          : instance.get("potentials").value,
                anchoring:
                    instance === null
                        ? "(instance empty)"
                        : instance.get("potentialsAnchoring").isEmpty
                          ? "(empty)"
                          : instance.get("potentialsAnchoring").value,
                wdthRoot: (() => {
                    const axes = shell.getEntry(
                        "/activeState/typeSpec/axesLocations",
                    );
                    return axes.has("wdth")
                        ? axes.get("wdth").get("numericValue").value
                        : "(unset)";
                })(),
            };
        });

    await setRoot({
        potentials: "robotoFlexHeadline",
        potentialsAnchoring: "off",
    });
    await setWdth(151);
    await settle();
    log("readBack:", JSON.stringify(await readBack(), null, 1));
    const state = await dump("wdth 151 + headline potentials (anchoring off)");

    const errors = consoleLines.filter(
        (line) =>
            line.includes("Uncaught") ||
            line.includes("TypeError") ||
            line.includes("POTENTIALS"),
    );
    log("console errors/warnings:", errors.length, errors.slice(0, 8));
    log("DONE");
}