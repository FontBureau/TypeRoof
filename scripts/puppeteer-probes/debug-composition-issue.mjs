// Probe for scripts/debug-with-puppeteer.mjs — the downloads/issue.txt
// scenario: "composition fails on update in prosemirror". Reproduces the
// operator's steps with the default type-stage initial state:
//   compare mode → composeInEditor ON → greedy-fit on the root type-spec
//   → type into t1 → inspect t2/t2greek/t2russian editor DOM for
//   composition-decoration gaps → type into t2 → inspect again.
// Historical: pinned the readDOMChange replace-churn (issue C) and the
// decoration self-heal fix; useful as a regression probe for editor
// composition robustness.

/* global shell */

// section content/0 children (type-stage-initial-state.json), located
// in the editor DOM by type + distinctive text snippet:
// t1 = paragraph "Intro text…", t2 = paragraph-2 Gutenberg, …
const TEXTBLOCKS = [
    { label: "t1", type: "paragraph", snippet: "Intro text" },
    { label: "t2", type: "paragraph-2", snippet: "Gutenberg" },
    { label: "t2greek", type: "p2greek", snippet: "Επειδη" },
    { label: "t2russian", type: "p2russian", snippet: "глубоких" },
];

/** In-page: find a textblock's editor element by type + snippet. */
function findTextblock({ type, snippet }) {
    const candidates = [
        ...document.querySelectorAll(`.ProseMirror [data-node-type="${type}"]`),
    ];
    return (
        candidates.find((el) => el.textContent.includes(snippet)) ?? null
    );
}

/** In-page: for each watched textblock, find its editor paragraph and
 *  report decoration coverage (uncovered text-node chunks). */
function snapshotEditor() {
    const result = {};
    for (const probe of window.__probeTextblocks) {
        const el = window.__findTextblock(probe);
        if (!el) {
            result[probe.label] = { error: "textblock not found" };
            continue;
        }
        const uncovered = [],
            walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node,
            total = "";
        while ((node = walker.nextNode())) {
            total += node.nodeValue;
            let p = node.parentElement,
                covered = false;
            while (p && p !== el) {
                if (p.classList.contains("typeroof-composition-line")) {
                    covered = true;
                    break;
                }
                p = p.parentElement;
            }
            if (!covered && node.nodeValue.trim().length)
                uncovered.push(node.nodeValue);
        }
        result[probe.label] = {
            type: el.getAttribute("data-node-type"),
            composedClass: el.classList.contains("typeroof-composed"),
            lineSpans: el.querySelectorAll(".typeroof-composition-line")
                .length,
            totalLen: total.length,
            uncovered,
        };
    }
    return result;
}

/** In-page: place the caret at the end of the watched textblock. */
function placeCaretAtEnd(probe) {
    const el = window.__findTextblock(probe),
        content = el.querySelector("[data-node-content]") ?? el,
        walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let last = null,
        node;
    while ((node = walker.nextNode())) last = node;
    const range = document.createRange();
    range.setStart(last, last.nodeValue.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return last.nodeValue.slice(-20);
}

/** In-page: record childList mutations inside the editor for ~5s. */
function installMutationObserver() {
    const root = document.querySelector(".ProseMirror");
    window.__mutations = [];
    const describe = (node) =>
        node.nodeType === 3
            ? `#text "${node.nodeValue.slice(0, 30)}"`
            : node.nodeType === 8
              ? `<!--${node.nodeValue.slice(0, 60)}-->`
              : `<${node.tagName?.toLowerCase()} class="${node.getAttribute?.("class") ?? ""}" data-node-type="${node.getAttribute?.("data-node-type") ?? ""}">`;
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type !== "childList") continue;
            window.__mutations.push(
                `${record.target.tagName}.${record.target.getAttribute("data-node-type") ?? record.target.getAttribute("class") ?? ""} ` +
                    `+[${[...record.addedNodes].map(describe).join(", ")}] ` +
                    `-[${[...record.removedNodes].map(describe).join(", ")}]`,
            );
        }
    });
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
}

function hasGaps(snapshot) {
    return Object.entries(snapshot)
        .filter(
            ([, state]) =>
                state.error ||
                state.composedClass === false ||
                state.uncovered.length > 0,
        )
        .map(([label]) => label);
}

export async function run({ page, consoleLines, setTimeout, log }) {
    // cursor into consoleLines for "what happened since" reporting
    let cursor = 0;
    const interesting = (line) =>
            line.includes("composition@") || line.includes("composition-debug"),
        newInterestingLines = () => {
            const lines = consoleLines.slice(cursor).filter(interesting);
            cursor = consoleLines.length;
            return lines;
        },
        // quiescence: no new interesting console lines for ~1s
        quiet = async (timeoutMs) => {
            let lastCount = -1,
                stable = 0,
                start = Date.now();
            while (Date.now() - start < timeoutMs) {
                await setTimeout(500);
                const count = consoleLines.filter(interesting).length;
                if (count === lastCount) {
                    if (++stable >= 2) return;
                } else stable = 0;
                lastCount = count;
            }
            log("WARNING quiet() timed out — continuing anyway");
        },
        snapshot = () => page.evaluate(snapshotEditor),
        reportSnapshot = async (label) => {
            const state = await snapshot();
            log(`${label}:`, JSON.stringify(state, null, 1));
            return state;
        };

    await page.evaluate(
        (textblocks, findFn) => {
            window.__probeTextblocks = textblocks;
            window.__findTextblock = eval(`(${findFn})`);
        },
        TEXTBLOCKS,
        findTextblock.toString(),
    );

    // operator steps: compare mode, composeInEditor on, greedy-fit
    await page.evaluate(() =>
        shell.changeState(() => {
            shell.getEntry("/activeState/documentRendererMode").value =
                "compare";
            shell.getEntry("/activeState/composeInEditor").value = true;
            shell.getEntry(
                "/activeState/typeSpec/textCompositionAlgorithm/textCompositionAlgorithmTypeKey",
            ).value = "TextCompositionAlgorithmGreedyFitModel";
        }),
    );
    log("compare + composeInEditor + greedy-fit set");
    // enable temporary in-app debug logging, when present
    await page.evaluate(() => (window.__debugComposition = true));

    await quiet(90000);
    newInterestingLines();
    const failures = [],
        before = await reportSnapshot("BEFORE typing");
    failures.push(...hasGaps(before));

    for (const [typeInto, char] of [
        [TEXTBLOCKS[0], "x"],
        [TEXTBLOCKS[1], "y"],
    ]) {
        await page.evaluate(installMutationObserver);
        const tail = await page.evaluate(placeCaretAtEnd, typeInto);
        log(`caret at end of ${typeInto.label} (…${JSON.stringify(tail)})`);
        await page.keyboard.type(char, { delay: 60 });
        await quiet(30000);
        const lines = newInterestingLines();
        log(`console after typing in ${typeInto.label} (${lines.length}):`);
        for (const line of lines) log("   ", line.slice(0, 400));
        const mutations = await page.evaluate(() => window.__mutations),
            // damage signature of the readback-replace churn (issue C):
            // a paragraph element re-added WITHOUT its typeroof-composed
            // class (re-parsed bare). Benign PM re-renders re-add the
            // composed element.
            swaps = mutations.filter(
                (line) =>
                    line.includes("+[<p ") &&
                    !line.includes('+[<p class="typeroof-composed"'),
            );
        log(
            `childList mutations: ${mutations.length}, bare paragraph re-adds: ${swaps.length}`,
        );
        for (const line of mutations.slice(0, 40))
            log("   ", line.slice(0, 200));
        const state = await reportSnapshot(`AFTER typing in ${typeInto.label}`);
        failures.push(...hasGaps(state));
        if (swaps.length > 0) failures.push(`${typeInto.label}:paragraph-swap`);
    }

    if (failures.length > 0)
        throw new Error(`DECORATION GAPS detected: ${failures.join(", ")}`);
    log("OK — all watched textblocks fully decorated throughout");
}
