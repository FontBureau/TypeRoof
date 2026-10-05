/**
 * Segmenter v0 (pure Host pass): the inline content of a textblock ->
 * segments + break opportunities, per LOGICAL paragraph.
 *
 * v0 rules (deliberately simple, refinement later):
 *   - text runs split at space characters: each word and each single
 *     space is its own segment; a 'space' break opportunity follows
 *     each space segment (breaking AFTER the space keeps the space at
 *     line end, where it collapses);
 *   - inline nodes participate in composition (three cases):
 *       + 'inlineContainer' (inline node WITH inline content, e.g. a
 *         link as inline block): its text content joins the SAME
 *         logical paragraph (recursion; lines may break inside it,
 *         like with marks);
 *       + 'inlineAtom' (inline node without text content, e.g. an
 *         image): an unbreakable box — exactly one segment;
 *       + 'hardBreak': separates LOGICAL paragraphs (line-breaking-
 *         wise independent units; the Algorithm only ever sees ONE —
 *         see composition-types.ts); the hard break itself is dropped;
 *   - no hyphenation (a later Hyphenator pass adds segments/breaks);
 *   - no UAX#14 refinement (https://www.unicode.org/reports/tr14/)
 *     yet — script-specific and finer break rules come with it.
 *
 * EXTENSION POINT (not v0): the classification of inline items
 * (text / hardBreak / inlineContainer / inlineAtom) is currently
 * decided by the caller with simple rules. With freely configurable
 * schemas this classification should become schema-driven/smart
 * reasoning (e.g. a link could be an inline container OR a mark;
 * custom inline types may need their own treatment). Design the
 * classifier feeding assembleLogicalParagraphs when actual cases
 * come up.
 *
 * widthPt is 0 here: measuring is the Measurer's job (phase 4); the
 * segmenter only defines the chunking.
 *
 * Mapping back to the source: HostSegment.sourceIndex identifies the
 * leaf inline item (text run or atom, counted depth-first over the
 * textblock's inline content); start/end are offsets into that item's
 * text (0/0 for atoms). The Applicator uses this to map segments back
 * to DOM text nodes.
 */
import type { BreakOpportunity, Segment } from "./composition-types.ts";
import LineBreak from "linebreak";

/** A segment as the Host passes it around: the contract Segment plus
 *  its source mapping. */
export interface HostSegment extends Segment {
    /** Number of visible HarfBuzz output glyphs in this source segment.
     * Filled by the Measurer; tracking uses complete-line N−1 gaps. */
    glyphCount?: number;
    /** Index of the source leaf inline item (text run or atom,
     *  depth-first over the textblock's inline content). */
    sourceIndex: number;
    /** Set by the Hyphenator (milestone 3): this segment is the part
     *  of a split word directly BEFORE a hyphen break opportunity.
     *  It is only a marker — the segment's width remains source-text
     *  only. The Host adds the hyphen glyph width candidate-wise when
     *  a line actually ENDS at this break (CSS ::after renders it).
     *  Absent on segmenter output; only the Hyphenator sets it. */
    hyphenAfter?: boolean;
}

export interface LogicalParagraphSegments {
    segments: HostSegment[];
    breaks: BreakOpportunity[];
}

/** The textblock's inline content, classified (see the extension
 *  point note above). */
export type InlineItem =
    | { kind: "text"; text: string }
    | { kind: "hardBreak" }
    | { kind: "inlineContainer"; items: InlineItem[] }
    | { kind: "inlineAtom" };

/** Segment ONE text run; offsets are local to its text. Appends to
 *  the given arrays (used by assembleLogicalParagraphs; exported for
 *  testing).
 *
 * UAX#14 (milestone 3): the linebreak package provides the break
 * opportunities — state of the art (punctuation rules, CJK breaks
 * between ideographs, combining marks). Mapping:
 *   - each single space is its own segment + a 'space' break
 *     (collapses: true — zero width at line end);
 *   - non-space runs split further at UAX#14 break positions:
 *     required (BK) -> 'explicit'; allowed -> 'space'-KIND (a
 *     zero-width break) but collapses: FALSE — an ideograph
 *     boundary has no glyph to collapse, the last character stays
 *     visible and counts toward the fit;
 *   - a newline is its own segment + an 'explicit' break
 *     (mandatory; defensive — ProseMirror text can't contain \n,
 *     the hard_break NODE is the real mechanism).
 */
export function segmentTextRun(
    text: string,
    sourceIndex: number,
    segments: HostSegment[],
    breaks: BreakOpportunity[],
): void {
    const breakMap = new Map<number, boolean>(); // position -> required
    for (
        let breaker = new LineBreak(text), bk;
        (bk = breaker.nextBreak()) !== null;

    )
        breakMap.set(bk.position, bk.required);

    const pushSegment = (start: number, end: number) => {
        segments.push({ start, end, widthPt: 0, sourceIndex });
    };

    let i = 0,
        runStart = 0;
    // flush a non-space run [start, end): split further at in-run
    // UAX#14 break positions
    const flushRun = (start: number, end: number) => {
        let partStart = start;
        for (let j = start; j < end; j++) {
            const after = j + 1;
            if (breakMap.has(after) && after < end) {
                pushSegment(partStart, after);
                breaks.push({
                    afterSegment: segments.length - 1,
                    kind: breakMap.get(after) ? "explicit" : "space",
                    penalty: 0,
                    collapses: false,
                });
                partStart = after;
            }
        }
        if (partStart < end) pushSegment(partStart, end);
    };

    while (i < text.length) {
        const char = text[i]!;
        if (char === " " || char === "\n") {
            flushRun(runStart, i);
            pushSegment(i, i + 1);
            breaks.push({
                afterSegment: segments.length - 1,
                kind: char === "\n" ? "explicit" : "space",
                penalty: 0,
                collapses: true,
            });
            i++;
            runStart = i;
        } else i++;
    }
    flushRun(runStart, text.length);
}

/** Assemble logical paragraphs from a textblock's classified inline
 *  content. Leaf items (text runs, atoms) are counted depth-first to
 *  produce sourceIndex. */
export function assembleLogicalParagraphs(
    items: readonly InlineItem[],
): LogicalParagraphSegments[] {
    const paragraphs: LogicalParagraphSegments[] = [];
    let segments: HostSegment[] = [],
        breaks: BreakOpportunity[] = [],
        leafIndex = 0;
    const flush = () => {
            if (segments.length > 0) paragraphs.push({ segments, breaks });
            segments = [];
            breaks = [];
        },
        // returns false if the item is not a leaf (containers recurse)
        walk = (itemList: readonly InlineItem[]): void => {
            for (const item of itemList) {
                if (item.kind === "hardBreak") {
                    flush();
                    continue;
                }
                if (item.kind === "inlineContainer") {
                    walk(item.items);
                    continue;
                }
                if (item.kind === "text") {
                    segmentTextRun(item.text, leafIndex, segments, breaks);
                } else {
                    // inlineAtom: one unbreakable segment
                    segments.push({
                        start: 0,
                        end: 0,
                        widthPt: 0,
                        sourceIndex: leafIndex,
                    });
                }
                leafIndex++;
            }
        };
    walk(items);
    flush();
    return paragraphs;
}
