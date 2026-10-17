// Probe: reproduce the operator regression (2026-10-16 14:56) — default
// type-stage initial state, t1 line breaks are bad ("Type-", "face"
// isolated, tight leading). Dump t1's composed lines + computed layout
// widths (span block-ness, paragraph width, measure).
export async function run({ page, setTimeout, log }) {
    const settle = () => setTimeout(2500);
    await settle();

    const dump = await page.evaluate(() => {
        const root =
            document.querySelector("article.typeroof-document") ??
            document;
        const blocks = [...root.querySelectorAll(".typeroof-composed")];
        const out = [];
        for (const block of blocks.slice(0, 2)) {
            const spans = [...block.querySelectorAll(".typeroof-composition-line")];
            out.push({
                tag: block.tagName,
                text: block.textContent.trim().slice(0, 18),
                blockPx: Number(block.getBoundingClientRect().width.toFixed(1)),
                blockDisplay: getComputedStyle(block).display,
                lineCount: spans.length,
                allSpanTexts: spans.map((span) =>
                    JSON.stringify(span.textContent.trim().slice(0, 30)),
                ),
            });
        }
        // the layout measure: the paragraph's inline width style
        const t1 = blocks.find(
            (b) => b.textContent.includes("Intro text"),
        );
        // the decisive regression check: per-span BASELINES — the
        // line-first \A break must produce one baseline per composed
        // LINE (no isolation): line 4 "face has changed…" fragments
        // share one baseline even across the <strong>/<em> marks.
        const spanBaselines = t1
            ? [...t1.querySelectorAll(".typeroof-composition-line")].map(
                  (span) => {
                      const text = [...span.childNodes].find(
                          (n) =>
                              n.nodeType === 3 && n.textContent.trim() !== "",
                      );
                      const range = document.createRange();
                      if (text === undefined) return {
                          text: span.textContent.trim().slice(0, 12),
                          y: null,
                      };
                      range.setStart(text, 0);
                      range.setEnd(text, 0);
                      const rect = range.getClientRects()[0];
                      return {
                          text: span.textContent.trim().slice(0, 12),
                          y: rect === undefined ? null : Number(rect.y.toFixed(1)),
                      };
                  },
              )
            : null;
        return {
            blocks: out,
            lineCount: spanBaselines?.length ?? null,
            distinctBaselines: spanBaselines === null
                ? null
                : new Set(
                      spanBaselines.map((s) => s.y).filter((y) => y !== null),
                  ).size,
            spanBaselines,
            t1InlineWidth: t1?.style.width ?? null,
        };
    });
    log(JSON.stringify(dump, null, 1));
    // assertion: the 11 t1 fragments must land on exactly 6 composed
    // baselines (the \A inline break; the display:block variant
    // isolated mark-started lines — operator QA 2026-10-16 14:56)
    if (dump.distinctBaselines !== 6)
        throw new Error(
            `expected 6 composed baselines, got ${dump.distinctBaselines}`,
        );
    log("OK — t1 renders 6 composed lines, marks inline, no isolation");
}