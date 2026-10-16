// Probe for scripts/debug-with-puppeteer.mjs — caret walking over the
// composed line boundary (operator 2026-10-16 14:25): caret after the
// "t" of "Next" (end of line 2), ArrowRight → expected before "D" of
// "Door", observed between "D" and "o". Places the caret via the DOM
// Selection API at the raw-text offset, presses ArrowRight, reads the
// resulting caret position (node + offset + surrounding text).

export const STATE_PATH =
    "/TypeRoof/downloads/typeroof-20261016-140124.TypeStage.json";
export const url = `http://localhost:3100/TypeRoof/shell.html#from-url:${STATE_PATH}`;

export async function run({ page, setTimeout, log }) {
    const settle = () => setTimeout(1200);
    await settle();

    const describeSelection = () =>
        page.evaluate(() => {
            const sel = document.getSelection();
            if (sel === null || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0),
                node = range.startContainer,
                text = node.textContent ?? "";
            return {
                nodeType: node.nodeType,
                isText: node.nodeType === 3,
                offset: range.startOffset,
                before: JSON.stringify(text.slice(Math.max(0, range.startOffset - 6), range.startOffset)),
                after: JSON.stringify(
                    text.slice(range.startOffset, range.startOffset + 6),
                ),
            };
        });

    // place the caret right after "Next" (before the space) inside the
    // h1's text node — via the DOM Selection on the contenteditable
    const placed = await page.evaluate(() => {
        const root =
            document.querySelector("article.typeroof-document") ?? document;
        const h1 = [...root.querySelectorAll(".typeroof-composed")].find((b) =>
            /^H1$/.test(b.tagName),
        );
        if (h1 === undefined) return "no h1";
        const editable = h1.closest("[contenteditable=true]") ?? h1;
        editable.focus();
        const walker = document.createTreeWalker(
            editable,
            NodeFilter.SHOW_TEXT,
        );
        let node;
        while ((node = walker.nextNode()) !== null) {
            const at = node.textContent.indexOf("Next ");
            if (at !== -1) {
                const sel = document.getSelection(),
                    range = document.createRange();
                // caret AFTER the "t" (before the space)
                range.setStart(node, at + 4);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return {
                  placed: true,
                  before: JSON.stringify(
                      node.textContent.slice(at, at + 12),
                  ),
                };
            }
        }
        return "text not found";
    });
    log("placed:", JSON.stringify(placed));
    await settle();

    // caret-rect diagnostics: can Chrome place/render a caret at
    // each candidate position (the collapsed space, the node-B
    // start, after-D)?
    const rects = await page.evaluate(() => {
        const root =
            document.querySelector("article.typeroof-document") ??
            document;
        const h1 = [...root.querySelectorAll(".typeroof-composed")].find(
            (b) => /^H1$/.test(b.tagName),
        );
        if (h1 === undefined) return { error: "no h1" };
        const editable = h1.closest("[contenteditable=true]");
        const nodes = [...editable.querySelectorAll("span")].flatMap((span) =>
            [...span.childNodes].filter((n) => n.nodeType === 3),
        );
        // locate the two relevant text nodes: the one ending with
        // "Next " and the one starting with "Door"
        const nodeA = nodes.find((n) => n.textContent.includes("Next")),
            nodeB = nodes.find((n) => n.textContent.startsWith("Door"));
        if (nodeA === undefined || nodeB === undefined)
            return {
                error: "nodes not found",
                texts: nodes.map((n) => JSON.stringify(n.textContent.slice(0, 12))),
            };
        const at = nodeA.textContent.indexOf("Next");
        const rectOf = (node, offset) => {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset);
            const rects = [...range.getClientRects()].map((r) => ({
                x: Number(r.x.toFixed(1)),
                y: Number(r.y.toFixed(1)),
                w: Number(r.width.toFixed(1)),
                h: Number(r.height.toFixed(1)),
            }));
            return rects;
        };
        return {
            nodeA: JSON.stringify(nodeA.textContent.slice(at)),
            nodeB: JSON.stringify(nodeB.textContent.slice(0, 6)),
            spans: [...editable.querySelectorAll("span")]
                .filter((s) => s.textContent.includes("Door"))
                .map((s) => s.className),
            caretAfterT: rectOf(nodeA, at + 4),
            caretAtSpace: rectOf(nodeA, at + 5),
            caretNodeAEnd: rectOf(nodeA, nodeA.textContent.length),
            caretBeforeD: rectOf(nodeB, 0),
            caretAfterD: rectOf(nodeB, 1),
        };
    });
    log("rects:", JSON.stringify(rects, null, 1));

    // HYPOTHESIS TEST: the line-first ::before display:block INSIDE
    // the inline span makes Chrome's forward walk skip the span's
    // first text position. Alternative mechanism: no block pseudo in
    // the line-3 span; a block ::after on the PREVIOUS line's last
    // span forces the break instead.
    const altTest = await page.evaluate(() => {
        // the SHIPPED CSS now makes line-first spans display:block —
        // no in-page override needed
        const root =
            document.querySelector("article.typeroof-document") ??
            document;
        const h1 = [...root.querySelectorAll(".typeroof-composed")].find(
            (b) => /^H1$/.test(b.tagName),
        );
        // place the caret after "t" again
        const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
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
                break;
            }
        }
        return { shipped: true };
    });
    log("shipped css:", JSON.stringify(altTest));
    await settle();
    await page.keyboard.press("ArrowRight");
    await settle();
    log("alt ArrowRight:", JSON.stringify(await describeSelection()));
    log("DONE");
}