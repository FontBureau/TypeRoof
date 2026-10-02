/**
 * The contract between the two roles of text composition:
 *
 *   - The Host (role a, coordinated by the composition controller):
 *     everything environment-facing (text, fonts, locale, DOM, time).
 *     It prepares paragraphs (segmentation, hyphenation,
 *     shaping/measuring via HarfBuzz), derives the adjustment
 *     potentials from the algorithm configuration, invokes the
 *     Algorithm, receives the result and applies it to the DOM. It
 *     also controls start/stop/pause/resume and resets the output
 *     rendering. Individual Host roles are pure where possible —
 *     Segmenter, Hyphenator and Treatment Planner are pure passes;
 *     the Measurer is stateful but deterministic (HarfBuzz + cache);
 *     only the Applicator and the Controller are truly impure.
 *     Impurity is concentrated at the two edges where the environment
 *     actually enters: measurement in, rendering out.
 *
 * Units: the Measurer works internally in font units (em) — HarfBuzz
 * advances are font-size independent, so caches keyed by
 * (text, font, axes location) stay valid across sizes. The contract
 * boundary uses pt, because a line mixes segments of different fonts
 * and sizes and needs an absolute common unit; the conversion is a
 * pure scaling by fontSizePt / unitsPerEm. The Applicator converts
 * back to whatever CSS needs (likely em again).
 *
 *   - The Algorithm (role b): a pure function. Takes CompositionInput,
 *     returns CompositionResult. It knows nothing about the DOM, fonts,
 *     HarfBuzz, locales or how adjustment potentials are derived and
 *     applied. Algorithms import ONLY from this module.
 *
 * Because the Algorithm is pure and DOM-free it runs in plain node
 * (vitest), which makes the initial dummy algorithm and later algorithm
 * swaps cheap to verify.
 *
 * Prior art:
 *   - lib/js/components/actors/videoproof-contextual/layout.mjs
 *     (pure computeFontSizeAndLayout + impure measurement side)
 *   - varla-varfo/lib/js/justification.mjs (demo): justification by
 *     render-measure-render feedback loop, per-line adjustment steps,
 *     per-font-location treatment tables (_calculateFontSpec), line
 *     color-coding by adjustment intensity. Production differs
 *     fundamentally: we justify by prediction (pre-measured advances,
 *     analytic fitting), not by feedback loop. Kept from the demo:
 *     the per-line adjustment step applied uniformly, potentials
 *     applied in parallel (axes first, then spacing), treatment
 *     depending on the font's current location in its design space,
 *     and diagnostics worthy of a proofing tool.
 */

/** Where the font already sits in its design space influences how much
 *  it may be narrowed or widened; the Host derives adjustment
 *  potentials relative to the current axis location, not as absolute
 *  axis min/max. That derivation is algorithm configuration — the
 *  Algorithm never sees it (see the injected width functions in
 *  CompositionInput). */
export interface TextStyle {
    /** Identifies font + axes location, e.g. for Host-side caches. */
    fontKey: string;
    fontSizePt: number;
}

/** Flat style representation over one immutable paragraph string:
 *  sorted spans of {start, attributes}. Segmentation walks text and
 *  spans linearly in parallel (no binary search on the hot path);
 *  random access ("style at caret") is the Host's/editor's concern. */
export interface StyleSpan {
    /** Offset into the paragraph text. */
    start: number;
    attributes: TextStyle;
}

export interface Paragraph {
    /** One immutable string; segments reference it by offset. */
    text: string;
    /** Sorted by start. */
    styles: readonly StyleSpan[];
}

/** A maximal chunk of paragraph text with uniform style, bounded by
 *  break points. Produced by the Host (segmentation at style
 *  boundaries + UAX#14 break rules, hyphenation adds more segments),
 *  shaped and measured (HarfBuzz) before the Algorithm is invoked. */
export interface Segment {
    /** Offsets into the paragraph text. */
    start: number;
    end: number;
    /** Measured advance of the whole segment in pt, at the segment's
     *  current (unadjusted) axis location. */
    widthPt: number;
}

/** A legal line break opportunity at a segment boundary. Hyphenation
 *  is a pure Host pre-pass that adds segments and break points, so the
 *  Algorithm can't tell a word boundary from a hyphen point — exactly
 *  the intended abstraction. */
export interface BreakOpportunity {
    /** Index of the segment AFTER which a break is legal. */
    afterSegment: number;
    /** 'space': zero-width break; 'hyphen': inserts a visible hyphen
     *  when taken; 'explicit': mandatory break (e.g. newline). */
    kind: "space" | "hyphen" | "explicit";
    /** Cost of breaking here; 0 for neutral. Allows UAX#14 /
     *  language-specific tuning and later Knuth-Plass penalties. */
    penalty: number;
}

export interface CompositionInput {
    segments: readonly Segment[];
    breaks: readonly BreakOpportunity[];
    /** Available width per line index in pt. Initially constant;
     *  per-line enables shaped containers later. */
    lineWidthPt: (lineIndex: number) => number;
    /** Line height multiplier (e.g. 1.2). */
    lineHeightEm: number;

    /** Natural (unadjusted) width of a line candidate in pt. */
    naturalLineWidthPt: (fromSegment: number, toSegment: number) => number;

    /** Width of a line candidate at a given adjustment step, in pt.
     *  Injected by the Host; encodes how the configured potentials are
     *  applied, in what order and proportion (axes first, then
     *  spacing). The Algorithm treats it as a pure function; tests can
     *  inject a fake. This is what lets algorithms narrow or widen
     *  lines with variable font axes without knowing about shaping. */
    lineWidthAtStep: (
        fromSegment: number,
        toSegment: number,
        step: number,
    ) => number;

    /** Allowed adjustment step range for a line candidate
     *  [min, max]; negative narrows, positive widens. Derived by the
     *  Host from the per-font-location treatment configuration. */
    stepRange: (
        fromSegment: number,
        toSegment: number,
    ) => [min: number, max: number];
}

export interface ComposedLine {
    fromSegment: number;
    /** Exclusive. */
    toSegment: number;
    /** Where the break after this line happened (null on last line). */
    breakAt: BreakOpportunity | null;
    naturalWidthPt: number;
    /** One number applying all potentials in parallel (axes first,
     *  then spacing); 0 = no adjustment, negative narrows, positive
     *  widens. Its meaning is defined by the Host's injected width
     *  functions; the Host translates it back into concrete axis and
     *  spacing values when applying the result. */
    adjustmentStep: number;
}

export interface CompositionResult {
    lines: readonly ComposedLine[];
    /** Diagnostics — a proofing tool lives off these (cf. the demo's
     *  line color-coding). Present even in the dummy algorithm. */
    diagnostics: {
        /** Indexes of lines that exceed their available width. */
        overfullLines: readonly number[];
        /** Algorithm-specific badness per line, for comparison,
         *  tuning and visualization. */
        badness: readonly number[];
    };
}

/** The algorithm contract: pure, synchronous, no side effects.
 *  Simple algorithms (dummy, greedy ragged) only use segments, breaks
 *  and naturalLineWidthPt; justifying algorithms additionally use
 *  lineWidthAtStep/stepRange. Async/streaming variants can be added
 *  when pause/resume across paragraphs becomes real. */
export type CompositionAlgorithm = (
    input: CompositionInput,
) => CompositionResult;
