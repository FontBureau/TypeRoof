/**
 * Milestone 2: greedy ragged line breaking — the first real
 * CompositionAlgorithm.
 *
 * Semantics (decided in the milestone-2 research, see
 * docs/planning/agentic-artefacts/thoughts/research/2026-10-03-2018-milestone-2-greedy-ragged.md):
 *   - walk break opportunities in order; a line ends at the LAST
 *     break whose natural width still fits lineWidthPt (step 0 only
 *     — ragged uses no fitting: adjustmentStep 0 everywhere);
 *   - TRAILING SPACE: the break is AFTER a space segment, so the
 *     line's last segment is that space. Its width is EXCLUDED from
 *     the fit test (it collapses at line end) but the segment is
 *     KEPT in the line — it has semantic value (copy/paste, text
 *     search, selection);
 *   - mandatory breaks (kind 'explicit') end the line early;
 *   - a single segment wider than the line (no legal break fits)
 *     gets its own line, flagged in diagnostics.overfullLines;
 *   - the last line just ends (the never-widened rule is automatic
 *     at step 0);
 *   - badness is slack-based: (lineWidth - naturalWidth) / lineWidth
 *     per line (0 = full, -> 1 = loose; overfull >= 1 by the
 *     naturalWidth>lineWidth excess) — a baseline; KP may
 *     eventually produce ragged text with real badness.
 *
 * The fitting width of a line candidate [from, to) is the sum of
 * segment widths from..to-1 EXCLUDING a trailing segment whose break
 * COLLAPSES (a space; lineWidthAtStep at step 0 gives the natural
 * width including it). Non-collapsing breaks (hyphen, zero-width
 * ideograph boundaries) keep their last, visible segment in the fit.
 */
import type {
    BreakOpportunity,
    ComposedLine,
    CompositionAlgorithm,
} from "./composition-types.ts";

export const greedyRaggedComposition: CompositionAlgorithm = (input) => {
    const { segments, breaks, lineWidthPt, lineWidthAtStep } = input,
        breakAfter = new Map<number, BreakOpportunity>(
            breaks.map((b) => [b.afterSegment, b]),
        ),
        lines: ComposedLine[] = [],
        overfullLines: number[] = [],
        badness: number[] = [];

    let fromSegment = 0,
        lineIndex = 0;
    while (fromSegment < segments.length) {
        const available = lineWidthPt(lineIndex),
            // greedy: the last break that still fits; an 'explicit'
            // break ends the line early
            pick = (() => {
                // the remainder fits: the line is the rest of the
                // paragraph (end of paragraph is not a break
                // opportunity, so it must be checked first) — unless
                // a mandatory 'explicit' break is still ahead
                let explicitAhead = false;
                for (
                    let candidate = fromSegment;
                    candidate < segments.length - 1;
                    candidate++
                )
                    if (breakAfter.get(candidate)?.kind === "explicit") {
                        explicitAhead = true;
                        break;
                    }
                if (
                    !explicitAhead &&
                    lineWidthAtStep(fromSegment, segments.length, 0) <=
                        available
                )
                    return { fitted: -1, explicit: -1, restFits: true };
                let fitted = -1, // break index (toSegment-1) that fits
                    explicit = -1;
                for (
                    let candidate = fromSegment;
                    candidate < segments.length - 1;
                    candidate++
                ) {
                    const breakOpportunity = breakAfter.get(candidate);
                    if (breakOpportunity === undefined) continue;
                    if (breakOpportunity.kind === "explicit") {
                        explicit = candidate;
                        break;
                    }
                    // fit test EXCLUDING the trailing segment only
                    // when it COLLAPSES at the break (a space); a
                    // hyphen or zero-width (e.g. ideograph) break
                    // keeps its last, visible segment — for a hyphen
                    // candidate lineWidthAtStep includes exactly the
                    // TAKEN end hyphen (internal opportunities don't)
                    const width =
                        lineWidthAtStep(fromSegment, candidate + 1, 0) -
                        (breakOpportunity.collapses === true
                            ? segments[candidate]!.widthPt
                            : 0);
                    if (width <= available) fitted = candidate;
                    else break; // widths only grow: no later break fits
                }
                return { fitted, explicit, restFits: false };
            })();

        let toSegment: number, breakAt: BreakOpportunity | null;
        if (pick.restFits) {
            toSegment = segments.length;
            breakAt = null;
        } else if (pick.explicit !== -1 && pick.fitted === -1) {
            // explicit before any fitted break
            toSegment = pick.explicit + 1;
            breakAt = breakAfter.get(pick.explicit)!;
        } else if (pick.fitted !== -1) {
            toSegment = pick.fitted + 1;
            breakAt = breakAfter.get(pick.fitted)!;
        } else {
            // no break fits: the minimal line — everything up to and
            // including the first break (a single word plus its
            // trailing space) — flagged overfull; or the rest of the
            // paragraph if there are no breaks left at all
            const nextBreak = (() => {
                for (
                    let candidate = fromSegment;
                    candidate < segments.length - 1;
                    candidate++
                )
                    if (breakAfter.has(candidate)) return candidate;
                return -1;
            })();
            if (nextBreak !== -1) {
                toSegment = nextBreak + 1;
                breakAt = breakAfter.get(nextBreak)!;
            } else {
                toSegment = segments.length;
                breakAt = null;
            }
        }

        const naturalWidthPt = lineWidthAtStep(fromSegment, toSegment, 0),
            // the fitting width excludes a trailing space segment
            // the fit test excludes the trailing segment only when
            // it COLLAPSES at the break (a space); a zero-width
            // ideograph break keeps its last, visible character
            fittingWidthPt =
                breakAt?.collapses === true
                    ? naturalWidthPt - segments[toSegment - 1]!.widthPt
                    : naturalWidthPt,
            overfull = fittingWidthPt > available,
            slack = available - fittingWidthPt;
        if (overfull) overfullLines.push(lineIndex);
        lines.push({
            fromSegment,
            toSegment,
            breakAt,
            naturalWidthPt,
            adjustmentStep: 0,
        });
        badness.push(
            overfull
                ? 1 + (fittingWidthPt - available) / available
                : Math.max(0, slack / available),
        );
        fromSegment = toSegment;
        lineIndex++;
    }

    return {
        lines,
        diagnostics: { overfullLines, badness },
    };
};
