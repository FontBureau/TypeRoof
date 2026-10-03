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
 *     the per-line adjustment step applied uniformly, treatment
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
    /** Offsets into the paragraph text. The Algorithm only needs
     *  widthPt to compose; start/end exist for the Host/Applicator
     *  and so diagnostics and error messages can name the offending
     *  text (e.g. "overfull line starting at 'Once upon…'"). */
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
     *  when taken; 'explicit': mandatory break — the Algorithm MUST
     *  end a line here, but the line is composed like any non-final
     *  line (it may be narrowed or widened to fit). Distinct from a
     *  hard break (<br>, newline), which the Host splits into logical
     *  paragraphs beforehand (creating a never-widened last line) and
     *  which the Algorithm never sees.
     *  The enum is expected to grow: script-specific break kinds and
     *  in-between cases like a "hardly-breaking-space" (an nobr that
     *  may break at high cost) are anticipated. */
    kind: "space" | "hyphen" | "explicit";
    /** Cost of breaking here; 0 for neutral. Allows UAX#14 /
     *  language-specific tuning and later Knuth-Plass penalties.
     *  Irrelevant for kind 'explicit': that break is not negotiable. */
    penalty: number;
    /** Whether the line's LAST segment collapses at the break
     *  (a space: zero width at line end) — the fit test excludes it.
     *  False for zero-width breaks that keep their glyph (an
     *  ideograph boundary is zero-width but the last character stays
     *  visible and counts). Absent on the last line (breakAt null). */
    collapses?: boolean;
}

/** One LOGICAL paragraph. Hard breaks (e.g. <br>, newline) separate
 *  a paragraph into logical paragraphs as far as line-breaking is
 *  concerned; the Host splits them beforehand and invokes the
 *  Algorithm once per logical paragraph.
 *  NOTE: cross-paragraph consistency (e.g. avoiding a very loose
 *  paragraph next to a very tight one on the same page) is out of
 *  scope here by design. If we want it, it is a legitimate refactor:
 *  an in-between layer that runs line-breaking multiple times and
 *  shuffles state between runs — not something to bolt onto this
 *  contract. */
export interface CompositionInput {
    segments: readonly Segment[];
    breaks: readonly BreakOpportunity[];
    /** Available width per line index in pt. Initially constant;
     *  per-line enables shaped containers later. */
    lineWidthPt: (lineIndex: number) => number;

    /** Width of a line candidate at a given adjustment step, in pt.
     *  Injected by the Host; encodes how the configured potentials are
     *  applied — the contract deliberately does not specify what a
     *  step IS (which mechanisms, in what order or proportion), that
     *  is Host/Treatment Planner policy and may change between
     *  iterations. The Algorithm treats it as a pure function; tests
     *  can inject a fake. This is what lets algorithms narrow or
     *  widen lines without knowing about axes, spacing or shaping.
     *
     *  Usage notes:
     *   - step 0 yields the natural (unadjusted) width of the
     *     candidate — this replaces a separate naturalLineWidthPt.
     *   - If the break after the candidate's last segment is a
     *     hyphenation point, the width includes the visible hyphen
     *     glyph (the Hyphenator bakes it into the segment
     *     measurement).
     *   - Steps are normalized: 0 = natural, -1 = maximum narrowing,
     *     +1 = maximum widening, per candidate, derived by the
     *     Treatment Planner from the per-font-location treatment
     *     configuration. The two directions are NOT symmetric:
     *     -1 and +1 may adjust very different physical widths.
     *     Steps beyond [-1, 1] are probes meaning "potential
     *     exhausted": the returned width clamps to the extreme, so
     *     the Algorithm can detect an impossible fit. A ComposedLine
     *     with |adjustmentStep| > 1 signals an unsatisfiable line.
     *   - Planned extension (Host-side, transparent to the
     *     Algorithm): optical alignment / margin protrusion. The
     *     effective width of a candidate may account for glyphs
     *     hanging into the margin (e.g. a period or hyphen at line
     *     end, an opening quote at line start); the Applicator
     *     applies the actual optical offset when rendering. */
    lineWidthAtStep: (
        fromSegment: number,
        toSegment: number,
        step: number,
    ) => number;
}

export interface ComposedLine {
    fromSegment: number;
    /** Exclusive. */
    toSegment: number;
    /** Where the break after this line happened (null on last line). */
    breakAt: BreakOpportunity | null;
    naturalWidthPt: number;
    /** One normalized number: 0 = no adjustment, -1 = maximum
     *  narrowing, +1 = maximum widening for this candidate; the two
     *  directions are not symmetric in physical width. |step| > 1
     *  signals an unsatisfiable line (potential exhausted). What a
     *  step applies physically (which mechanisms, in what order or
     *  proportion) is Host policy, not contract; the Host translates
     *  it back into concrete axis and spacing values when applying
     *  the result. */
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
 *  and lineWidthAtStep at step 0; justifying algorithms use the full
 *  step range. Async/streaming variants can be added when
 *  pause/resume across paragraphs becomes real.
 *
 *  MANDATORY breaks: the Algorithm MUST end a line at every break
 *  opportunity of kind 'explicit'; such lines are composed like any
 *  non-final line (full fitting, widening allowed).
 *
 *  LAST LINE rule: the final line of the (logical) paragraph — the
 *  one ending at the last segment, with breakAt === null — is never
 *  widened (step <= 0): the ragged ending is correct, widening would
 *  space it out to full measure for no fitting purpose (this is
 *  TeX's \parfillskip behavior). Narrowing IS allowed when it
 *  "makes the line" — i.e. when the last line is overfull at
 *  natural width and narrowing brings it within measure. */
export type CompositionAlgorithm = (
    input: CompositionInput,
) => CompositionResult;
