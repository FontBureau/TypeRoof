// Probe for scripts/debug-with-puppeteer.mjs — CSS white-space
// semantics check (operator 2026-10-16 14:15: "I believe we do render
// multiple spaces"). Empirical: in the operator's state, measure the
// same text with 1 vs 2 spaces in a nowrap scratch span inside the
// composed h1, and check the computed white-space on the actual text
// nodes + PM's break-spaces interaction.

const STATE_PATH =
    "/TypeRoof/downloads/typeroof-20261016-140124.TypeStage.json";
export const url = `http://localhost:3100/TypeRoof/shell.html#from-url:${STATE_PATH}`;

export async function run({ page, setTimeout, log }) {
    const settle = () => setTimeout(1600);
    await settle();

    const result = await page.evaluate(() => {
        const root =
            document.querySelector("article.typeroof-document") ?? document;
        const h1 = [...root.querySelectorAll(".typeroof-composed")].find((b) =>
            /^H1$/.test(b.tagName),
        );
        if (h1 === undefined) return { error: "no h1" };
        // the actual text node inside the composed h1: what
        // white-space applies, and what does the double space do?
        const textNode = (() => {
            const walker = document.createTreeWalker(
                h1,
                NodeFilter.SHOW_TEXT,
            );
            let n;
            while ((n = walker.nextNode()) !== null)
                if (n.textContent.includes("  ")) return n;
            return null;
        })();
        const probe = (ws, text) => {
            const span = document.createElement("span");
            span.textContent = text;
            span.style.whiteSpace = ws;
            span.style.font = "16px serif";
            h1.append(span);
            const width = span.getBoundingClientRect().width;
            span.remove();
            return width;
        };
        return {
            computedWhiteSpace: textNode === null
                ? "no double-space text node found"
                : getComputedStyle(textNode.parentElement).whiteSpace,
            h1WhiteSpace: getComputedStyle(h1).whiteSpace,
            rawText: textNode?.textContent?.slice(0, 30) ?? null,
            nowrapOne: probe("nowrap", "A B"),
            nowrapTwo: probe("nowrap", "A  B"),
            preOne: probe("pre", "A B"),
            preTwo: probe("pre", "A  B"),
        };
    });
    log("css check:", JSON.stringify(result, null, 1));
    log("DONE");
}