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

/** A segment as the Host passes it around: the contract Segment plus
 *  its source mapping. */
export interface HostSegment extends Segment {
    /** Index of the source leaf inline item (text run or atom,
     *  depth-first over the textblock's inline content). */
    sourceIndex: number;
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

// words (runs of non-space) and single spaces
const _TOKENIZE = /([^ ]+)|( )/g;

/** Segment ONE text run; offsets are local to its text. Appends to
 *  the given arrays (used by assembleLogicalParagraphs; exported for
 *  testing). */
export function segmentTextRun(
    text: string,
    sourceIndex: number,
    segments: HostSegment[],
    breaks: BreakOpportunity[],
): void {
    for (const match of text.matchAll(_TOKENIZE)) {
        const token = match[0];
        segments.push({
            start: match.index,
            end: match.index + token.length,
            widthPt: 0,
            sourceIndex,
        });
        if (token === " ")
            breaks.push({
                afterSegment: segments.length - 1,
                kind: "space",
                penalty: 0,
            });
    }
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
