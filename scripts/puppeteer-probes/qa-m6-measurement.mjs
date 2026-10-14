// Probe for scripts/debug-with-puppeteer.mjs — milestone 6 measurement QA
// (operator 2026-10-15 00:23/00:29): the downloaded TypeStage state
// downloads/typeroof-20261015-002025.TypeStage.json (deliberately WITHOUT the
// CJK text — that's a known issue): "in all t1 and t2 almost all lines
// overflow the given width defined in the section" (section Manual 10cm =
// 283.46pt). Boots the app FROM THE STATE FILE via the #from-url: hash
// (shell.mjs _stateFromLocationHash) and dumps per-textblock measures and
// per-line rendered widths vs the 10cm measure.

/* global shell */

const STATE_PATH = "/TypeRoof/downloads/typeroof-20261015-002025.TypeStage.json";
export const url = `http://localhost:3100/TypeRoof/shell.html#from-url:${STATE_PATH}`;

export async function run({ page, consoleLines, setTimeout, log }) {
    const settle = () => setTimeout(1600);
    await settle();

    // what did we boot into?
    const boot = await page.evaluate(() => ({
        mode: shell
            .getEntry("/activeState/documentRendererMode")
            ?.valueOf(),
        potentials: (() => {
            try {
                const p = shell.getEntry(
                    "/activeState/typeSpec/textCompositionAlgorithm/instance/potentials",
                );
                return p?.isEmpty ? "(empty)" : p?.value;
            } catch {
                return "(none)";
            }
        })(),
    }));
    log("boot:", JSON.stringify(boot));

    // font availability: is the from-url family actually loaded?
    const fontsInfo = await page.evaluate(() => {
        const families = [...document.fonts].map((f) => ({
            family: f.family,
            status: f.status,
        }));
        const probe = "from-url Roboto Flex Regular Version_3-200 gftools_0-9-32_";
        return {
            loaded: families,
            fromUrlAvailable: document.fonts.check(`18pt "${probe}"`),
        };
    });
    log("document.fonts:", JSON.stringify(fontsInfo, null, 1));

    // all composed blocks (editor or viewer pane — both get the class)
    const blocks = await page.evaluate(() => {
        const composed = [
            ...document.querySelectorAll(".typeroof-composed"),
        ];
        return composed.map((block) => {
            const rect = block.getBoundingClientRect();
            return {
                where: block.closest(".typeroof-viewer") ? "viewer" : "editor",
                tag: block.tagName,
                text: block.textContent.trim().slice(0, 26),
                blockPt: Number(((rect.width * 72) / 96).toFixed(1)),
            };
        });
    });
    log("composed blocks:", JSON.stringify(blocks, null, 1));

    // per-line rendered widths: the line spans (viewer) / editor spans
    const lines = await page.evaluate(() => {
        const composed = [
            ...document.querySelectorAll(".typeroof-composed"),
        ];
        return composed.map((block) => {
            const spans = [
                ...block.querySelectorAll(".typeroof-composition-line"),
            ].map((span) => {
                const rect = span.getBoundingClientRect(),
                    // the width of the TEXT itself (inline range rects)
                    rangeWidthPt = Number(
                        (
                            ([...rangeRects(span)].reduce(
                                (sum, r) => sum + r.width,
                                0,
                            ) *
                                72) /
                            96
                        ).toFixed(1),
                    );
                const runStyle = getComputedStyle(span),
                    runFvs = runStyle.fontVariationSettings,
                    opszMatch = runFvs.match(/"opsz" ([\d.]+)/);
                return {
                    text: span.textContent.slice(0, 20),
                    spanPt: Number(((rect.width * 72) / 96).toFixed(1)),
                    textPt: rangeWidthPt,
                    fontSizePt: Number(
                        ((parseFloat(runStyle.fontSize) * 72) / 96).toFixed(2),
                    ),
                    opsz: opszMatch?.[1],
                    runFvs: runStyle.fontVariationSettings,
                    opticalSizing: runStyle.fontOpticalSizing,
                    letterSpacing: runStyle.letterSpacing,
                    wordSpacing: runStyle.wordSpacing,
                    fontFamily: runStyle.fontFamily.slice(0, 40),
                    wdth: span.style
                        .getPropertyValue("font-variation-settings")
                        .match(/"wdth" ([\d.]+)/)?.[1],
                };
            });
            return {
                text: block.textContent.trim().slice(0, 22),
                blockPt: Number(
                    ((block.getBoundingClientRect().width * 72) / 96).toFixed(
                        1,
                    ),
                ),
                spans,
            };
        });
        function rangeRects(span) {
            const range = document.createRange();
            range.selectNodeContents(span);
            return range.getClientRects();
        }
    });
    const MEASURE = 283.46; // 10cm
    let overflowCount = 0,
        lineCount = 0;
    for (const block of lines) {
        log(`block ${JSON.stringify(block.text)} width=${block.blockPt}pt`);
        for (const span of block.spans) {
            lineCount++;
            const over = span.textPt > MEASURE + 1;
            if (over) overflowCount++;
            log(
                `   "${span.text}" span=${span.spanPt}pt text=${span.textPt}pt` +
                    ` fs=${span.fontSizePt} opsz=${span.opsz}` +
                    ` ls=${span.letterSpacing} ws=${span.wordSpacing}` +
                    ` font=${span.fontFamily}` +
                    `${over ? "  <== OVERFLOWS" : ""}`,
            );
        }
    }
    log(
        `overflow: ${overflowCount}/${lineCount} lines wider than the 10cm measure`,
    );

    // decisive: scratch-measure the exact composed-line text at the
    // same font/size/axes with white-space: nowrap (no wrap artifacts)
    const scratch = await page.evaluate(() => {
        const firstSpan = [
            ...document.querySelectorAll(".typeroof-composition-line"),
        ].find(
            (span) =>
                parseFloat(getComputedStyle(span).fontSize) < 30 &&
                (span.getBoundingClientRect().width * 72) / 96 > 284,
        ),
            firstBlock = firstSpan?.closest(".typeroof-composed");
        const text = firstSpan.textContent,
            runStyle = getComputedStyle(firstSpan),
            scratchSpan = document.createElement("span");
        scratchSpan.textContent = text;
        scratchSpan.style.whiteSpace = "nowrap";
        scratchSpan.style.fontFamily = runStyle.fontFamily;
        scratchSpan.style.fontSize = runStyle.fontSize;
        scratchSpan.style.fontVariationSettings =
            runStyle.fontVariationSettings;
        scratchSpan.style.letterSpacing = runStyle.letterSpacing;
        scratchSpan.style.wordSpacing = runStyle.wordSpacing;
        firstBlock.append(scratchSpan);
        const widthPt = Number(
            ((scratchSpan.getBoundingClientRect().width * 72) / 96).toFixed(1),
        );
        // same text with the BUNDLED family for comparison
        const bundled = scratchSpan.cloneNode(true);
        bundled.style.fontFamily = "RobotoFlex";
        firstBlock.append(bundled);
        const bundledWidthPt = Number(
            ((bundled.getBoundingClientRect().width * 72) / 96).toFixed(1),
        );
        bundled.remove();
        scratchSpan.remove();
        return {
            text: text.slice(0, 40),
            textLength: text.length,
            nowrapWidthPt: widthPt,
            bundledWidthPt,
            fvs: runStyle.fontVariationSettings,
            fontSize: runStyle.fontSize,
            family: runStyle.fontFamily.slice(0, 30),
        };
    });
    log("scratch nowrap measurement:", JSON.stringify(scratch, null, 1));
    const errors = consoleLines.filter(
        (line) =>
            line.includes("Uncaught") ||
            line.includes("TypeError") ||
            line.includes("STATE LOAD"),
    );
    log("console errors:", errors.length, errors.slice(0, 4));
    log("DONE");
}