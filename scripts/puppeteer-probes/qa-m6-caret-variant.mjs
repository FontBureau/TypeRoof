// Probe for scripts/debug-with-puppeteer.mjs — verify the \A line-break
// variant fixes BOTH regressions: (a) the bad rendering (block spans
// inside inline marks isolate multi-leaf line fragments) and (b) the
// caret walk (Blink skipped the ::before-display:block span's first
// text position). Overrides the shipped CSS in-page (agent cannot
// write the commander-owned stylesheet; the operator applies
// /tmp/line-spans.css via agent-chmod afterwards).

export const STATE_PATH =
    "/TypeRoof/downloads/typeroof-20261016-140124.TypeStage.json";
export const url = `http://localhost:3100/TypeRoof/shell.html#from-url:${STATE_PATH}`;

export async function run({ page, consoleLines, setTimeout, log }) {
    const settle = () => setTimeout(1400);
    await settle();

    // in-page override: the \A variant
    await page.evaluate(() => {
        const style = document.createElement("style");
        style.textContent = `
            .typeroof-composition-line-first {
                display: inline;
                width: auto;
            }
            .typeroof-composition-line-first::before {
                content: "\\A";
                white-space: pre;
                display: inline;
            }
        `;
        document.head.append(style);
    });
    await settle();

    // (a) rendering: the t1-style paragraph lines — line 4 "face has
    // changed…" fragments must render on ONE visual line (no
    // isolation). Measure the rendered line count via caret rects at
    // fragment starts? Simplest: the h1 three-line case renders as 3
    // distinct baselines with "verse Next" NOT isolated.
    const lines = await page.evaluate(() => {
        const root =
            document.querySelector("article.typeroof-document") ??
            document;
        const h1 = [...root.querySelectorAll(".typeroof-composed")].find(
            (b) => /^H1$/.test(b.tagName),
        );
        if (h1 === undefined) return { error: "no h1" };
        const spans = [...h1.querySelectorAll(".typeroof-composition-line")];
        return spans.map((span) => {
            const range = document.createRange(),
                text = [...span.childNodes].find(
                    (n) => n.nodeType === 3 && n.textContent.trim() !== "",
                );
            let y = null;
            if (text !== undefined) {
                range.setStart(text, 0);
                range.setEnd(text, 0);
                y = range.getClientRects()[0]?.y ?? null;
            }
            return {
                text: span.textContent.trim().slice(0, 14),
                y: y === null ? null : Number(y.toFixed(1)),
            };
        });
    });
    log("h1 span baselines:", JSON.stringify(lines, null, 1));
    // 3 lines => 3 distinct y values among the spans
    const ys = new Set(
        (lines ?? []).map((s) => s.y).filter((y) => y !== null),
    );
    log(`distinct baselines: ${ys.size} (expect 3)`);

    // (b) caret: place after "Next" line-2 end, ArrowRight → before "D"
    const placed = await page.evaluate(() => {
        const root =
            document.querySelector("article.typeroof-document") ??
            document;
        const h1 = [...root.querySelectorAll(".typeroof-composed")].find(
            (b) => /^H1$/.test(b.tagName),
        );
        const editable = h1.closest("[contenteditable=true]") ?? h1;
        editable.focus();
        const walker = document.createTreeWalker(
            editable,
            NodeFilter.SHOW_TEXT,
        );
        let node;
        while ((node = walker.nextNode()) !== null) {
            const at = node.textContent.indexOf("Next");
            if (at !== -1) {
                const sel = document.getSelection(),
                    range = document.createRange();
                range.setStart(node, at + 4);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return true;
            }
        }
        return false;
    });
    log("placed:", placed);
    await settle();
    await page.keyboard.press("ArrowRight");
    await settle();
    const sel = await page.evaluate(() => {
        const range = document.getSelection().getRangeAt(0);
        return {
            offset: range.startOffset,
            after: JSON.stringify(
                (range.startContainer.textContent ?? "").slice(
                    range.startOffset,
                    range.startOffset + 6,
                ),
            ),
        };
    });
    log("ArrowRight:", JSON.stringify(sel));
    const errors = consoleLines.filter(
        (line) => line.includes("Uncaught") || line.includes("TypeError"),
    );
    log("errors:", errors.length);
    const caretOk =
        sel.offset === 0 && sel.after.includes("Door");
    const renderOk = ys.size === 3;
    if (!caretOk || !renderOk)
        throw new Error(
            `variant failed: baselines=${ys.size} caret=${JSON.stringify(sel)}`,
        );
    log("OK — \\A variant renders 3 baselines AND walks the caret to line start");
}