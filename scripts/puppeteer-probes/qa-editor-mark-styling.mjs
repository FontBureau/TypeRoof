// Probe for scripts/debug-with-puppeteer.mjs — the editor mark-styling
// regression (2026-10-11): sup citations must compose as marks in the
// EDITOR too. Two defects, both fixed:
//   (1) nested marks (chain elements stack: sup > a > span > intent)
//       never finalized their style subscriptions — their parent is
//       another MARK element, not a subscribed node element; the
//       walk-up (_getParentSubscription) resolves the nearest node
//       subscription now.
//   (2) empty-patch markStyleLinks edges (tag-sup etc.) resolved their
//       UNPATCHED styleLinkProperties@ id — a styler wrote textblock
//       font-size over the <sup>, killing the UA default shrink
//       (composed lines measured smaller than rendered = too wide).
//       Empty patches are declarations now (symmetric with
//       getWrapMarks): the unknown-style fallback, no inline writes.
// Asserted on the live en/Typography load: the citation intent carries
// the composed styler (reduced font-size), the <sup> wrapper stays
// style-free (UA default), no CONTRACT VIOLATION.

/* global shell */

export const url = "http://localhost:3100/TypeRoof/app/wikipedia/index.html";

export async function run({ page, consoleLines, setTimeout, log }) {
    if (
        !(await page.evaluate(() => {
            const form = document.querySelector("form");
            if (form === null) return false;
            form.dispatchEvent(new Event("submit", { cancelable: true }));
            return true;
        }))
    )
        throw new Error("PROBE FAIL: no wikipedia load form found");

    await page.waitForFunction(
        () => {
            const host =
                document.querySelector(".ProseMirror") ?? document.body;
            return host.textContent.includes("typeface");
        },
        { timeout: 60_000, polling: 500 },
    );
    // editor mode
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry(
                "/activeState/documentRendererMode",
            ).value = "editor";
        }),
    );
    await page.waitForSelector(".ProseMirror [data-mark-type]", {
        timeout: 20_000,
    });
    // settle: the subscriptions finalize on attach sweeps
    await setTimeout(1500);

    const report = await page.evaluate(() => {
        const editor = document.querySelector(".ProseMirror"),
            q = (sel) => [...editor.querySelectorAll(sel)];
        const sups = q('[data-mark-type="tag-sup"]'),
            sample = sups[0];
        return {
            supCount: sups.length,
            sampleSup: sample ? sample.outerHTML.slice(0, 300) : null,
            supInlineStyle: sample ? sample.getAttribute("style") : null,
            // structure wrappers: no unknown-style class (declarations
            // are skipped entirely, like the viewer) and no leaked
            // htmlattrs attribute (the bag replays as individual attrs)
            structureWrapperProblems: [
                ...q("[data-mark-type]").filter(
                    (el) =>
                        el.getAttribute("data-mark-type") !==
                            "generic-style" &&
                        (el.classList.contains("unknown-style") ||
                            el.hasAttribute("htmlattrs")),
                ),
            ].length,
            intentUnknownStyle: q(
                '[data-mark-type="generic-style"].unknown-style',
            ).length,
            // the nested intent marks inside the first sup
            nestedIntents: sample
                ? [
                      ...sample.querySelectorAll("[data-style-name]"),
                  ].map((el) => ({
                      styleName: el.getAttribute("data-style-name"),
                      inlineStyle: el.getAttribute("style"),
                      computedFontSize: getComputedStyle(el).fontSize,
                  }))
                : [],
            paragraphFontSize: (() => {
                const p = editor.querySelector(
                    '[data-node-type="paragraph"]',
                );
                return p === null ? null : getComputedStyle(p).fontSize;
            })(),
        };
    });
    log("editor report:", JSON.stringify(report, null, 1));

    const violations = consoleLines.filter((line) =>
        line.includes("CONTRACT VIOLATION"),
    );
    if (violations.length !== 0) {
        for (const line of violations.slice(0, 3)) log("VIOLATION:", line);
        throw new Error(
            `PROBE FAIL: ${violations.length} CONTRACT VIOLATION(s)`,
        );
    }

    const problems = [];
    if (report.supCount === 0)
        problems.push("no tag-sup structure wrappers in the editor");
    if (report.structureWrapperProblems !== 0)
        problems.push(
            `${report.structureWrapperProblems} structure wrappers carry the unknown-style class or a leaked htmlattrs attribute`,
        );
    if (report.intentUnknownStyle !== 0)
        problems.push(
            `${report.intentUnknownStyle} intent wrappers carry the unknown-style class (a wired edge must style them)`,
        );
    if (report.supInlineStyle !== null)
        problems.push(
            `the <sup> wrapper carries an inline style (${report.supInlineStyle}) — ` +
                "an empty-patch declaration must not style it (the UA default shrink must survive)",
        );
    const styledIntent = report.nestedIntents.find(
        (intent) =>
            intent.styleName === "link span sup" &&
            intent.inlineStyle !== null &&
            intent.inlineStyle !== "",
    );
    if (styledIntent === undefined)
        problems.push(
            "no nested 'link span sup' intent with an applied styler — " +
                "nested marks must finalize their style subscriptions",
        );
    else if (
        report.paragraphFontSize !== null &&
        parseFloat(styledIntent.computedFontSize) >=
            parseFloat(report.paragraphFontSize)
    )
        problems.push(
            `the styled intent renders at ${styledIntent.computedFontSize} — ` +
                `not reduced below the paragraph's ${report.paragraphFontSize}`,
        );
    if (problems.length !== 0) {
        for (const problem of problems) log("PROBLEM:", problem);
        throw new Error(`PROBE FAIL: ${problems.length} problem(s)`);
    }
    log("PROBE PASSED");
}
