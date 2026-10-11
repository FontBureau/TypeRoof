// Probe for scripts/debug-with-puppeteer.mjs — the structure-marks
// Phase-4 verification (cycle 2026-10-11, plan
// thoughts/plan/2026-10-11-1355-structure-marks-nested-combinables.md):
// a remote Typography load through the wikipedia shell must run with
// ZERO composition-contract violations, and the combinable push +
// funnel must reproduce real HTML semantics:
//   - chain runs carry the ONE composite intent (data-style-name
//     "italic link"/"bold italic"/…) whose own wrapper is the
//     innermost element's ACTUAL source tag (the funnel), carrying
//     the attrs bag (the link's href)
//   - outer chain elements render as their tag-* structure wrappers
//     (data-mark-type tag-em/tag-strong/tag-a — tag-a keeps its href
//     as the mark's declared attr)
//   - standalone combinables render exactly as before: the intent
//     wrapper IS the source tag (<i data-style-name="italic">,
//     <a data-style-name="link" href>)
// Typography (en) carries the vehicles: 5x <i><a>, 5x <a><i>,
// 1x <i><b> plus plenty of standalone <i>/<a> (verified against the
// REST html at probe-writing time).

/* global shell */

export const url = "http://localhost:3100/TypeRoof/app/wikipedia/index.html";

const COMPOSED_QUIET_ROUNDS = 3,
    COMPOSED_TIMEOUT_MS = 90_000;

export async function run({ page, consoleLines, setTimeout, log }) {
    // 1. submit the shell's load form (defaults: language "en", slug
    //    "Typography") — the article fetches, ingests and replaces
    //    the initial document.
    if (
        !(await page.evaluate(() => {
            const form = document.querySelector("form");
            if (form === null) return false;
            form.dispatchEvent(new Event("submit", { cancelable: true }));
            return true;
        }))
    )
        throw new Error("PROBE FAIL: no wikipedia load form found");

    // 2. wait for the ingested article to render (the tiny initial
    //    document is just an h1; the article text is the signal)
    await page.waitForFunction(
        () => {
            const host =
                document.querySelector(".ProseMirror") ?? document.body;
            return host.textContent.includes("typeface");
        },
        { timeout: 60_000, polling: 500 },
    );
    log("article rendered");

    // 3. composition quiescence: the composed-block count must be
    //    stable for COMPOSED_QUIET_ROUNDS consecutive seconds
    let stableCount = -1,
        stableRounds = 0;
    for (let elapsed = 0; elapsed < COMPOSED_TIMEOUT_MS; elapsed += 1000) {
        await setTimeout(1000);
        const count = await page.evaluate(
            () => document.querySelectorAll(".typeroof-composed").length,
        );
        if (count > 0 && count === stableCount) {
            if (++stableRounds >= COMPOSED_QUIET_ROUNDS) break;
        } else {
            stableCount = count;
            stableRounds = 0;
        }
    }
    if (stableRounds < COMPOSED_QUIET_ROUNDS)
        log(
            `WARNING composition did not quiesce in ${COMPOSED_TIMEOUT_MS / 1000}s ` +
                `(last composed count: ${stableCount}) — continuing`,
        );
    else log(`composition quiesced (${stableCount} composed blocks)`);

    // 4. THE CONTRACT: zero CONTRACT VIOLATION console output for the
    //    whole session (fetch, ingest, boot, compose)
    const violations = consoleLines.filter((line) =>
        line.includes("CONTRACT VIOLATION"),
    );
    if (violations.length !== 0) {
        for (const line of violations.slice(0, 5)) log("VIOLATION:", line);
        throw new Error(
            `PROBE FAIL: ${violations.length} CONTRACT VIOLATION(s)`,
        );
    }
    log("zero CONTRACT VIOLATION");

    // 5. viewer mode for the DOM assertions
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry(
                "/activeState/documentRendererMode",
            ).value = "viewer";
        }),
    );
    await page.waitForSelector("article.typeroof-document", {
        timeout: 20_000,
    });

    const report = await page.evaluate(() => {
        const article = document.querySelector("article.typeroof-document"),
            q = (sel) => [...article.querySelectorAll(sel)],
            fontSizeOf = (el) => parseFloat(getComputedStyle(el).fontSize);
        return {
            // the funnel: composite intents whose own wrapper is the
            // innermost <a> — href rides the intent's attrs bag
            linkIntents: q('[data-style-name*=" link"]').map((el) => ({
                tag: el.tagName,
                styleName: el.getAttribute("data-style-name"),
                href: el.getAttribute("href"),
            })),
            // the <i><b><a> chain: the "bold italic link" composite
            // on the actual innermost <a>
            boldItalicLink: q('[data-style-name="bold italic link"]').map(
                (el) => ({ tag: el.tagName, href: el.getAttribute("href") }),
            ),
            // outer chain elements: structure wrappers (tag-a keeps
            // its href as the mark's declared attr)
            structure: q("[data-mark-type]").reduce((acc, el) => {
                const key = el.getAttribute("data-mark-type");
                acc[key] = (acc[key] ?? 0) + 1;
                return acc;
            }, {}),
            tagAHref: q('[data-mark-type="tag-a"]').filter((el) =>
                el.hasAttribute("href"),
            ).length,
            // standalone combinables: the intent wrapper IS the
            // source tag (funnel htmlTag)
            standaloneItalicTags: [
                ...new Set(
                    q('[data-style-name="italic"]').map((el) => el.tagName),
                ),
            ],
            standaloneLinkTags: [
                ...new Set(
                    q('[data-style-name="link"]').map((el) => el.tagName),
                ),
            ],
            standaloneLinkHrefs: q('[data-style-name="link"]').filter((el) =>
                el.hasAttribute("href"),
            ).length,
            // parent-context observation (no styled runs in this
            // article's headings — figcaption (t2) vs paragraph (t1)
            // as the best-effort context contrast)
            captionStyled: q(
                '[data-node-type="figcaption"] [data-style-name]',
            ).length,
            paragraphStyled: q(
                '[data-node-type="paragraph"] [data-style-name]',
            ).length,
            captionFontSize: (() => {
                const el = article.querySelector(
                    '[data-node-type="figcaption"] [data-style-name]',
                );
                return el === null ? null : fontSizeOf(el);
            })(),
            paragraphFontSize: (() => {
                const el = article.querySelector(
                    '[data-node-type="paragraph"] [data-style-name]',
                );
                return el === null ? null : fontSizeOf(el);
            })(),
        };
    });
    log("dom report:", JSON.stringify(report, null, 1));

    // 6. assertions
    const problems = [];
    if (report.linkIntents.length === 0)
        problems.push("no composite link intents found (expected <i><a>)");
    if (
        !report.linkIntents.some(
            (intent) => intent.tag === "A" && intent.href !== null && intent.href !== "",
        )
    )
        problems.push(
            "no composite link intent is a wrapping <a href> (the funnel: innermost <i><a> carries the href on the intent)",
        );
    if (report.boldItalicLink.length === 0)
        problems.push(
            'no "bold italic link" composite found (expected the <i><b><a> chain)',
        );
    for (const { tag } of report.boldItalicLink)
        if (tag !== "A")
            problems.push(
                `"bold italic link" intent tag is ${tag}, not A (the innermost <a>)`,
            );
    const structureTotal = Object.values(report.structure).reduce(
        (a, b) => a + b,
        0,
    );
    if (structureTotal === 0)
        problems.push("no structure wrappers (data-mark-type) found");
    if ((report.structure["tag-em"] ?? 0) === 0)
        problems.push('no tag-em structure wrappers (expected outer <i>/<em>)');
    if ((report.structure["tag-a"] ?? 0) === 0)
        problems.push("no tag-a structure wrappers (expected outer <a>)");
    if (report.tagAHref === 0)
        problems.push("no tag-a wrapper carries an href (declared attr lost)");
    if (!report.standaloneItalicTags.includes("I"))
        problems.push(
            `standalone italic intent tags: ${JSON.stringify(report.standaloneItalicTags)} — expected I`,
        );
    if (!report.standaloneLinkTags.includes("A") || report.standaloneLinkHrefs === 0)
        problems.push(
            `standalone link intents: tags=${JSON.stringify(report.standaloneLinkTags)} with-href=${report.standaloneLinkHrefs} — expected A with href`,
        );
    if (problems.length !== 0) {
        for (const problem of problems) log("PROBLEM:", problem);
        throw new Error(`PROBE FAIL: ${problems.length} problem(s)`);
    }

    // best-effort context observation (logged, not asserted: this
    // article's headings carry no styled runs)
    if (report.captionStyled > 0 && report.paragraphStyled > 0)
        log(
            `parent-context observation: figcaption-styled font-size ${report.captionFontSize}px vs paragraph-styled ${report.paragraphFontSize}px`,
        );
    log("PROBE PASSED");
}
