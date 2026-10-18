// Probe for scripts/debug-with-puppeteer.mjs — the wikipedia demo
// (app/wikipedia/index.html, lib/js/wikipedia/main.mjs): links in
// the typeroof layout must never navigate the document away —
//   1. other anchors (mw:ExtLink et al.) open in a new tab/window
//      (window.open, stubbed here),
//   2. rel="mw:WikiLink" anchors load + ingest + replace the
//      document in place (REST API, see fetchFromWikipedia),
//   3. the app stays on app/wikipedia/index.html and no page errors
//      occur.
// Needs network access to en.wikipedia.org (the demo's data source).
// The load form lives in the settings sidebar (hidden by default,
// floating above the layout) — open it via the real settings button
// and close it again before clicking layout links.

export const url = "http://localhost:3100/TypeRoof/app/wikipedia/index.html";

export async function run({ page, consoleLines, setTimeout, log }) {
    const appPathname = "/TypeRoof/app/wikipedia/index.html";

    const assertLocation = async (label) => {
        const { pathname } = await page.evaluate(() => window.location);
        if (pathname !== appPathname)
            throw new Error(`NAVIGATED AWAY (${label}): ${pathname}`);
    };

    const layoutText = () =>
        page.evaluate(
            () => document.querySelector(".typeroof-layout")?.textContent ?? "",
        );

    const messageHidden = () =>
        page.evaluate(() => {
            const box = document.querySelector(".message-box");
            return box === null || box.style.display === "none";
        });

    // Wait until the layout text passes the predicate and then stays
    // unchanged over a few polls (composition drains per block).
    const waitForLayout = async (label, predicate, timeoutMs = 120000) => {
        const start = Date.now();
        let last = "",
            stable = 0;
        for (;;) {
            await setTimeout(400);
            const text = await layoutText();
            if (predicate(text) && text === last) {
                if (++stable >= 3) return text;
            } else stable = 0;
            last = text;
            if (Date.now() - start > timeoutMs)
                throw new Error(
                    `TIMEOUT (${label}) — layout text (first 300 chars): ` +
                        last.slice(0, 300),
                );
        }
    };

    // window.open recorder: "other links open in a new tab/window"
    await page.evaluate(() => {
        window.__openCalls = [];
        window.open = (...args) => {
            window.__openCalls.push(args.map(String));
            return null;
        };
    });

    // the real-user settings path: the form is in the hidden sidebar
    const openSettings = async () => {
        const button = await page.$('.wrapper button[title="show settings"]');
        if (button === null)
            throw new Error("NO settings button in .wrapper");
        await button.click();
    };
    const closeSettings = async () => {
        const button = await page.$(
            'aside.typeroof-ui_main button[title="close settings"]',
        );
        if (button === null)
            throw new Error("NO close-settings button in the sidebar");
        await button.click();
    };

    // 1) load the Typography article via the form (default values)
    const submit = async () => {
        const button = await page.$(
            ".layout-and-font form button[type=submit]",
        );
        if (button === null)
            throw new Error("NO submit button in .layout-and-font form");
        await button.click();
    };
    await openSettings();
    await setTimeout(500); // let the settings sidebar transition in
    await submit();
    const typographyText = await waitForLayout("Typography via form", (text) =>
        text.length > 5000,
    );
    await assertLocation("after form load");
    log(`Typography article loaded (${typographyText.length} chars)`);

    // 2) click an external link: opens in a new tab/window (stub)
    const extHandle = await page.evaluateHandle(() => {
        const anchor = document.querySelector(
            '.typeroof-layout a[rel~="mw:ExtLink"]',
        );
        if (anchor === null)
            throw new Error("NO mw:ExtLink anchor in the layout");
        return anchor;
    });
    const extHref = await page.evaluate(
        (anchor) => anchor.getAttribute("href"),
        extHandle,
    );
    await extHandle.click();
    let openCalls = [];
    for (let i = 0; i < 20; i++) {
        await setTimeout(250);
        openCalls = await page.evaluate(() => window.__openCalls);
        if (openCalls.length > 0) break;
    }
    await assertLocation("after extlink click");
    if (openCalls.length === 0)
        throw new Error("external link click did NOT open a new tab/window");
    if (openCalls[0][0] !== extHref)
        throw new Error(
            `window.open called with ${openCalls[0][0]} instead of ${extHref}`,
        );
    log(`external link ${extHref} → new tab/window`);

    // 3) click a plain mw:WikiLink anchor: loads + ingests in place
    const anchorHandle = await page.evaluateHandle(() => {
        const anchors = Array.from(
            document.querySelectorAll('.typeroof-layout a[rel~="mw:WikiLink"]'),
        );
        // a plain article slug: one ./ prefix, no colon (Special:,
        // ISBN:), no fragment
        const anchor = anchors.find((a) =>
            /^\.\/[^:#]+$/.test(a.getAttribute("href") ?? ""),
        );
        if (anchor === undefined)
            throw new Error(
                "NO plain mw:WikiLink anchor in the layout: " +
                    anchors
                        .slice(0, 5)
                        .map((a) => a.getAttribute("href"))
                        .join(", "),
            );
        return anchor;
    });
    const clickedHref = await page.evaluate(
        (anchor) => anchor.getAttribute("href"),
        anchorHandle,
    );
    await closeSettings();
    await setTimeout(500); // let the settings sidebar transition out
    await anchorHandle.click();
    log(`clicked mw:WikiLink ${clickedHref}`);

    // any real article differs from the loaded one; the target may
    // be a short one, so no big minimum length here
    await waitForLayout(
        "wikilink load",
        (text) => text !== typographyText && text.length > 1000,
    );
    await assertLocation("after wikilink click");
    if (!(await messageHidden()))
        throw new Error("message box visible after the wikilink load");
    log(`wiki target loaded in place (${clickedHref})`);

    // 4) the form inputs mirror the loaded document (hidden sidebar
    // or not): language and slug show the wikilink target
    const inputs = await page.evaluate(() =>
        Array.from(
            document.querySelectorAll(
                ".layout-and-font form input[type=text]",
            ),
        ).map((input) => input.value),
    );
    const expectedSlug = decodeURIComponent(clickedHref.slice(2));
    if (inputs[0] !== "en")
        throw new Error(`language input changed to ${inputs[0]}`);
    if (inputs[1] !== expectedSlug)
        throw new Error(
            `slug input ${JSON.stringify(inputs[1])} != loaded ` +
                `${JSON.stringify(expectedSlug)}`,
        );
    log(`form inputs updated: language=${inputs[0]} slug=${inputs[1]}`);

    const pageErrors = consoleLines.filter((line) =>
        line.includes("[PAGEERROR]"),
    );
    if (pageErrors.length > 0)
        throw new Error(`PAGEERRORS: ${pageErrors.join(" | ")}`);
    log("OK — layout links navigate in-place / open new tabs only");
}