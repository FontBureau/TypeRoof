// Shared helpers for puppeteer probes driving the type-stage editor.
// Two kinds of exports:
//   in-page functions (findTextblock, snapshotEditor, placeCaretAtEnd,
//     installMutationObserver) — passed to page.evaluate; they must stay
//     self-contained (no closures, no imports).
//   runner-side functions (installProbeHelpers, makeQuiet) — called in
//     the node context of the probe.

/** In-page: find a textblock's editor element by type + snippet. */
export function findTextblock({ type, snippet }) {
    const candidates = [
        ...document.querySelectorAll(`.ProseMirror [data-node-type="${type}"]`),
    ];
    return (
        candidates.find((el) => el.textContent.includes(snippet)) ?? null
    );
}

/** In-page: for each watched textblock (window.__probeTextblocks:
 *  {label, type, snippet}[]), find its editor paragraph and report
 *  composition-decoration coverage (uncovered text-node chunks). */
export function snapshotEditor() {
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

/** In-page: place the caret at the end of the watched textblock's
 *  text; returns the tail of the last text node. For a START position
 *  pass {atStart: true} in the probe object. */
export function placeCaretAtEnd(probe) {
    const el = window.__findTextblock(probe),
        content = el.querySelector("[data-node-content]") ?? el,
        walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let first = null,
        last = null,
        node;
    while ((node = walker.nextNode())) {
        if (first === null) first = node;
        last = node;
    }
    const target = probe.atStart ? first : last,
        offset = probe.atStart ? 0 : target.nodeValue.length,
        range = document.createRange();
    range.setStart(target, offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return target.nodeValue.slice(0, 20);
}

/** In-page: place the caret at character offset `charOffset` within
 *  the watched textblock's text. */
export function placeCaretAtOffset(probe, charOffset) {
    const el = window.__findTextblock(probe),
        content = el.querySelector("[data-node-content]") ?? el,
        walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node,
        remaining = charOffset;
    while ((node = walker.nextNode())) {
        if (remaining <= node.nodeValue.length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.dispatchEvent(new Event("selectionchange"));
            return node.nodeValue.slice(0, 20);
        }
        remaining -= node.nodeValue.length;
    }
    throw new Error(`offset ${charOffset} beyond textblock text`);
}

/** In-page: record childList mutations inside the editor for ~5s
 *  into window.__mutations. */
export function installMutationObserver() {
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

/** Runner-side: install the in-page probe helpers (window.__probeTextblocks,
 *  window.__findTextblock). */
export async function installProbeHelpers(page, textblocks) {
    await page.evaluate(
        (tb, findFn) => {
            window.__probeTextblocks = tb;
            window.__findTextblock = eval(`(${findFn})`);
        },
        textblocks,
        findTextblock.toString(),
    );
}

/** Runner-side: quiescence — resolves when no new console lines
 *  matching `filter` arrive for ~1s (two 500ms stable polls), or
 *  after timeoutMs (logs a warning and continues). */
export async function quiet(consoleLines, setTimeout, log, filter, timeoutMs) {
    let lastCount = -1,
        stable = 0;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await setTimeout(500);
        const count = consoleLines.filter(filter).length;
        if (count === lastCount) {
            if (++stable >= 2) return;
        } else stable = 0;
        lastCount = count;
    }
    log("WARNING quiet() timed out — continuing anyway");
}

/** Runner-side: labels of textblocks with decoration gaps. */
export function hasGaps(snapshot) {
    return Object.entries(snapshot)
        .filter(
            ([, state]) =>
                state.error ||
                state.composedClass === false ||
                state.uncovered.length > 0,
        )
        .map(([label]) => label);
}
