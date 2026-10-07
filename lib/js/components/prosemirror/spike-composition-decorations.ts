/**
 * TEMPORARY SPIKE — Phase 0 of plan
 *   thoughts/plans/2026-10-07-1223-prosemirror-composition-decorations.md
 *
 * Purpose: verify manually (real browsers) that ProseMirror editing behaves
 * acceptably when inline decorations force line breaks via the viewer's
 * line-span CSS (`.typeroof-composition-line-first::before{display:block}`).
 *
 * This is NOT composition: it splits textblocks into fixed-width
 * pseudo-lines and applies the same classes/style custom properties the
 * real applicator will use, so caret/IME/selection quirks surface exactly
 * where they would in the real feature.
 *
 * REMOVAL: delete this file and the two marked lines in
 * integration.typeroof.jsx (`// TEMPORARY SPIKE`) once the Phase-0
 * GO/NO-GO decision is recorded. Do not commit without operator approval.
 */

import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

// Fixed pseudo-line width in "characters" (text chars; inline leaves
// count as one). Chosen so a typical textblock gets several breaks.
const PSEUDO_LINE_CHARS = 34;

function _lineDecorationAttrs(
    lineIndex: number,
    isLineStart: boolean,
    // Hyphen marker only on the fragment that ENDS the line (same
    // splitting semantics as line-first: else every mark boundary
    // inside the line shows a trailing hyphen; cf. the real
    // applicator's isLineEnd check, viewer.typeroof.jsx:805-807).
    isLineEnd: boolean,
): {
    class: string;
    style: string;
} {
    const classes = ["typeroof-composition-line"];
    // NOTE: PM splits one inline decoration at every text-node/mark
    // boundary and copies the attrs onto each piece — so line-first may
    // only be set on the FIRST fragment of a line, else every piece
    // forces its own break (the real applicator gets this from the
    // payload's per-leaf fragmentation; cf. viewer.typeroof.jsx:795).
    if (isLineStart) classes.push("typeroof-composition-line-first");
    if (lineIndex === 0 && isLineStart)
        // Unsets the forced break (keeps text-indent), like the viewer.
        classes.push("typeroof-composition-paragraph-first-line");
    // Simulate a hyphen break on every second line end.
    if (isLineEnd && lineIndex % 2 === 1)
        classes.push("typeroof-composition-line-hyphen");
    // Simulate treatments: cycle narrowing/neutral/widening, and make
    // lines individually visible via the diagnostics color hook.
    const step = ((lineIndex % 3) - 1) * 0.5; // -0.5, 0, +0.5
    const style = [
        `--line-letter-spacing: ${(step * 0.4).toFixed(2)}pt`,
        `--line-word-spacing: ${(step * 1.2).toFixed(2)}pt`,
        `--line-color-code: hsl(${(lineIndex * 67) % 360}, 70%, 88%)`,
    ].join("; ");
    return { class: classes.join(" "), style };
}

/**
 * Split each textblock into fixed-width pseudo-lines and decorate them.
 * Positions are computed over PM units (text chars; leaves count as their
 * nodeSize), so ranges are exact — unlike textContent-based offsets.
 */
function buildSpikeDecorations(doc: PMNode): DecorationSet {
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
        if (!node.isTextblock) return;
        const blockTextStart = pos + 1;
        let spanFrom: number | null = null,
            spanIsLineStart = true,
            lineRemain = PSEUDO_LINE_CHARS,
            lineIndex = 0;
        // Close the current fragment; line-start travels with the
        // fragment, and only a completed pseudo-line re-arms it.
        const closeSpan = (to: number, lineComplete: boolean) => {
            if (spanFrom === null || to <= spanFrom) return;
            decorations.push(
                Decoration.inline(
                    spanFrom,
                    to,
                    _lineDecorationAttrs(
                        lineIndex,
                        spanIsLineStart,
                        lineComplete,
                    ),
                ),
            );
            spanFrom = null;
            if (lineComplete) {
                spanIsLineStart = true;
                lineRemain = PSEUDO_LINE_CHARS;
                lineIndex++;
            } else spanIsLineStart = false;
        };
        node.forEach((child, childOffset) => {
            const childPos = blockTextStart + childOffset;
            if (child.isText && child.text) {
                let i = 0;
                while (i < child.text.length) {
                    if (spanFrom === null) spanFrom = childPos + i;
                    const take = Math.min(lineRemain, child.text.length - i);
                    i += take;
                    lineRemain -= take;
                    // Line complete, or text-node boundary mid-line (PM
                    // would split the decoration anyway — do it first,
                    // without re-arming line-first).
                    if (lineRemain === 0) closeSpan(childPos + i, true);
                    else if (i >= child.text.length)
                        closeSpan(childPos + i, false);
                }
            } else {
                // Inline leaf (e.g. hard_break): counts as one unit.
                if (spanFrom === null) spanFrom = childPos;
                lineRemain -= 1;
                if (lineRemain <= 0) closeSpan(childPos + child.nodeSize, true);
            }
        });
        closeSpan(blockTextStart + node.content.size, true);
    });
    return DecorationSet.create(doc, decorations);
}

function _isSpikeEnabled(): boolean {
    return (
        typeof globalThis.location !== "undefined" &&
        new URLSearchParams(globalThis.location.search).has("spikeComposition")
    );
}

/**
 * Returns the spike plugin when `?spikeComposition` is in the URL,
 * else nothing. Called from ProseMirror._initProseMirrorView.
 */
export function spikeCompositionPluginsIfEnabled(): Plugin[] {
    if (!_isSpikeEnabled()) return [];
    // A composed textblock must not soft-wrap on its own — the forced
    // breaks are the only breaks (viewer: .typeroof-composed in
    // line-spans.css:68). Injected here so the spike stays self-contained;
    // the real feature will toggle .typeroof-composed per textblock via
    // node decorations (Phase 3).
    if (typeof globalThis.document !== "undefined") {
        const style = globalThis.document.createElement("style");
        style.dataset.spike = "composition-nowrap";
        style.textContent =
            ".ui_prosemirror_host .ProseMirror { white-space: nowrap; }";
        globalThis.document.head.append(style);
    }
    console.warn(
        "SPIKE composition decorations active (?spikeComposition). " +
            "Fixed pseudo-lines, NOT real composition — Phase-0 quirk probe.",
    );
    return [
        new Plugin({
            props: {
                // Recomputed per state: intentionally stateless so typing
                // during the QA keeps decorations in sync trivially.
                decorations(state) {
                    return buildSpikeDecorations(state.doc);
                },
            },
        }),
    ];
}
