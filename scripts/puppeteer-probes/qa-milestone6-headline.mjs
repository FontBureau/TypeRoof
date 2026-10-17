// Probe for scripts/debug-with-puppeteer.mjs — milestone 6 headline QA:
// lastLineHandling. "Heading One" (h1, 64pt, 278pt column) natural is
// wider than the measure: the ragged default breaks it into two lines
// (minimal break + narrow, the last line ragged); "fill" must absorb
// the remainder onto ONE line (the line becomes the final one,
// narrowed to fit — the headline semantics) with the treatment
// applied (fvs wdth override + color code).

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
            await shell.changeState(() => {
                const instance = shell.getEntry(
                    "/activeState/typeSpec/textCompositionAlgorithm/instance",
                );
                for (const [field, value] of Object.entries(fields))
                    instance.get(field).value = value;
            });
        }, fields);

    const h1 = () =>
        page.evaluate(() => {
            const article = document.querySelector(
                    "article.typeroof-document",
                ),
                blocks = [...article.querySelectorAll(".typeroof-composed")],
                heading = [...blocks].sort(
                    (a, b) =>
                        parseFloat(getComputedStyle(b).fontSize) -
                        parseFloat(getComputedStyle(a).fontSize),
                )[0];
            if (heading === undefined) return null;
            return {
                text: heading.textContent.trim().slice(0, 40),
                spans: [...heading.querySelectorAll(".typeroof-composition-line")].map(
                    (span) => ({
                        text: span.textContent.trim().slice(0, 30),
                        wdth: span.style
                            .getPropertyValue("font-variation-settings")
                            .match(/"wdth" ([\d.]+)/)?.[1],
                        colorCode:
                            span.style.getPropertyValue("--line-color-code") !==
                            "",
                    }),
                ),
            };
        });

    // control: ragged (the default) — two lines, no composed last line
    await setRoot({ potentials: "robotoFlexHeadline" });
    await settle();
    const ragged = await h1();
    log("ragged:", JSON.stringify(ragged, null, 1));
    if (ragged.spans.length !== 2)
        throw new Error(
            `ragged control: expected 2 lines, got ${ragged.spans.length}`,
        );

    // fill: the remainder is absorbed — ONE line, narrowed, colored
    await setRoot({ potentials: "robotoFlexHeadline", lastLineHandling: "fill" });
    await settle();
    const fill = await h1();
    log("fill:", JSON.stringify(fill, null, 1));
    if (fill.spans.length !== 1)
        throw new Error(
            `fill: expected 1 line (remainder absorbed), got ${fill.spans.length}`,
        );
    if (fill.spans[0].wdth === undefined)
        throw new Error("fill: no wdth treatment applied on the line");
    if (fill.spans[0].colorCode !== true)
        throw new Error("fill: no color code on the composed line");

    // potentialsAnchoring "off": the authored dflt (wdth 151) is
    // EXPLICITLY written at step 0 (the identity idea is removed) —
    // the configuration asserts its natural state and it RENDERS.
    // Back to ragged (the last line stays as composed), anchoring off:
    // every step-0 line must carry font-variation-settings with the
    // authored wdth 151.
    await setRoot({
        potentials: "robotoFlexHeadline",
        lastLineHandling: "ragged",
        potentialsAnchoring: "off",
    });
    await settle();
    const readBack = await page.evaluate(() => {
        const instance = shell.getEntry(
            "/activeState/typeSpec/textCompositionAlgorithm/instance",
        );
        return {
            lastLineHandling: instance.get("lastLineHandling").isEmpty
                ? "(empty)"
                : instance.get("lastLineHandling").value,
            anchoring: instance.get("potentialsAnchoring").isEmpty
                ? "(empty)"
                : instance.get("potentialsAnchoring").value,
        };
    });
    log("readBack:", JSON.stringify(readBack));
    const offState = await h1();
    log("anchoring off:", JSON.stringify(offState, null, 1));
    const offSpans = offState?.spans ?? [];
    if (offSpans.length > 0) {
        // every line carries the explicit fvs (the identity idea is
        // removed — nothing renders bare)
        for (const span of offSpans)
            if (span.wdth === undefined)
                throw new Error(
                    "anchoring off: a line renders WITHOUT font-variation-settings",
                );
        const wdths = offSpans.map((span) => parseFloat(span.wdth));
        // line 1 (overfull at the authored natural state) narrows
        // WITHIN the authored span [35..151]; the ragged last line
        // sits at step 0 = the authored dflt 151 exactly.
        if (wdths.some((wdth) => wdth < 34 || wdth > 152))
            throw new Error(
                `anchoring off: wdth ${wdths} outside the authored span [35..151]`,
            );
        const lastWdth = wdths.at(-1);
        if (Math.abs(lastWdth - 151) > 1)
            throw new Error(
                `anchoring off: the ragged last line renders wdth ${lastWdth}, not the authored dflt 151`,
            );
        log(
            `anchoring off: wdth ${wdths} — last line at the authored dflt 151`,
        );
    }

    const errors = consoleLines.filter(
        (line) => line.includes("Uncaught") || line.includes("TypeError"),
    );
    if (errors.length > 0)
        throw new Error(`console errors: ${errors.length}`);
    log("OK — lastLineHandling fill composes the headline onto one line; off-anchoring renders the authored dflt at step 0");
}