// Probe for scripts/debug-with-puppeteer.mjs — caret walk diagnostics
// under the SHIPPED \A line-break CSS. Place the caret at several
// positions around a line boundary (after "t" of "Next", at the
// collapsed space, at the node end) and press ArrowRight once each
// (fresh re-place), dumping where Blink lands: before "D" (the line
// start) or one glyph in.

export const STATE_PATH =
    "/TypeRoof/downloads/typeroof-20261016-140124.TypeStage.json";
export const url = `http://localhost:3100/TypeRoof/shell.html#from-url:${STATE_PATH}`;

export async function run({ page, setTimeout, log }) {
    const settle = () => setTimeout(1200);
    // (re-settle helper reused below)
    await settle();

    const placeAndStep = (match, offset) =>
        page.evaluate(
            (match, offset) => {
                const root =
                    document.querySelector("article.typeroof-document") ??
                    document;
                const h1 = [...root.querySelectorAll(".typeroof-composed")].find(
                    (b) => /^H1$/.test(b.tagName),
                );
                if (h1 === undefined) return { error: "no h1" };
                const editable = h1.closest("[contenteditable=true]") ?? h1;
                editable.focus();
                const walker = document.createTreeWalker(
                    editable,
                    NodeFilter.SHOW_TEXT,
                );
                let node;
                while ((node = walker.nextNode()) !== null) {
                    const at = node.textContent.indexOf(match);
                    if (at !== -1) {
                        const sel = document.getSelection(),
                            range = document.createRange();
                        range.setStart(node, at + offset);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        return { placed: true, nodeText: JSON.stringify(node.textContent.slice(at, at + 8)) };
                    }
                }
                return { error: "match not found" };
            },
            match,
            offset,
        )
        .then(async (placed) => {
            await settle();
            await page.keyboard.press("ArrowRight");
            await settle();
            const sel = await page.evaluate(() => {
                const range = document.getSelection().getRangeAt(0),
                    node = range.startContainer;
                return {
                    placedText: JSON.stringify(
                        (node.textContent ?? "").slice(
                            Math.max(0, range.startOffset - 4),
                            range.startOffset,
                        ),
                    ),
                    placedAfter: JSON.stringify(
                        (node.textContent ?? "").slice(
                            range.startOffset,
                            range.startOffset + 4,
                        ),
                    ),
                    offset: range.startOffset,
                };
            });
            return { placed, sel };
        });

    // after the "t" of "Next" — the operator's position (end of line 2)
    log(
        "after t of Next:",
        JSON.stringify(await placeAndStep("Next ", 4)),
    );
    // at the collapsed space after Next
    log(
        "at space after Next:",
        JSON.stringify(await placeAndStep("Next ", 5)),
    );
    // directly before "Door" (line 3 start)
    log(
        "before Door:",
        JSON.stringify(await placeAndStep("Door", 0)),
    );
    log("DONE");
}