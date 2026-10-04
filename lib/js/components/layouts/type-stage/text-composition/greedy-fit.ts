/**
 * Milestone 4: greedy-fit — the varla-varfo justification strategy,
 * predictively (the validation milestone: exercises the contract's
 * full step range and the Treatment Planner).
 *
 * Strategy (per logical paragraph):
 *   1. greedy break at NATURAL width (the greedy-ragged pick: the
 *      last break whose natural width fits);
 *   2. NARROW until one more segment fits (minimal narrowing step):
 *      while the candidate extended to the next break fits at some
 *      step in [-1, 0], extend to it at that step — then try to
 *      pull more;
 *   3. if narrowing pulled nothing up and the line is underfull:
 *      WIDEN to fill (the largest step whose width still fits) or
 *      leave at max potential (step +1, underfull);
 *   4. a line overfull after maximal narrowing is unsatisfiable:
 *      adjustmentStep < -1 signals "potential exhausted" (contract);
 *   5. the last line is never widened (contract; TeX \parfillskip)
 *      but may narrow to fit; 'explicit' breaks are mandatory and
 *      composed like non-final lines.
 *
 * Potential detection is contract-clean: the Host clamps exhausted
 * potentials (lineWidthAtStep(-1) === lineWidthAtStep(0) means no
 * narrowing potential — no table, or the direction is gated), so
 * the algorithm never sets a step the Host can't apply.
 *
 * Fit test: like greedy-ragged, a trailing COLLAPSING segment (a
 * space) is excluded — at the candidate's step.
 */
import type {
    BreakOpportunity,
    ComposedLine,
    CompositionAlgorithm,
} from "./composition-types.ts";

// binary-search precision for the minimal filling step (2^-24 of
// the step range — far below any visible effect)
const _SEARCH_ITERATIONS = 24,
    // a step smaller than this is reported as 0 (no treatment)
    _STEP_EPSILON = 1e-4;

export const greedyFitComposition: CompositionAlgorithm = (input) => {
    const { segments, breaks, lineWidthPt, lineWidthAtStep } = input,
        breakAfter = new Map<number, BreakOpportunity>(
            breaks.map((b) => [b.afterSegment, b]),
        ),
        lines: ComposedLine[] = [],
        overfullLines: number[] = [],
        badness: number[] = [];

    // the fit test at a step: the candidate's width EXCLUDING a
    // trailing collapsing segment (measured at the same step)
    const fittingWidth = (
            from: number,
            to: number,
            step: number,
            collapses: boolean,
        ): number =>
            lineWidthAtStep(from, to, step) -
            (collapses ? lineWidthAtStep(to - 1, to, step) : 0),
        // the largest step in [lo, hi] whose width still fits the
        // target; null when even lo overflows
        findFittingStep = (
            from: number,
            to: number,
            collapses: boolean,
            target: number,
            lo: number,
            hi: number,
        ): number | null => {
            if (fittingWidth(from, to, lo, collapses) > target) return null;
            for (let i = 0; i < _SEARCH_ITERATIONS; i++) {
                const mid = (lo + hi) / 2;
                if (fittingWidth(from, to, mid, collapses) <= target) lo = mid;
                else hi = mid;
            }
            return lo;
        };

    let fromSegment = 0,
        lineIndex = 0;
    while (fromSegment < segments.length) {
        const available = lineWidthPt(lineIndex),
            // --- the natural greedy pick (the greedy-ragged logic) --
            pick = (() => {
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
                let fitted = -1,
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
                    const width =
                        lineWidthAtStep(fromSegment, candidate + 1, 0) -
                        (breakOpportunity.collapses === true
                            ? lineWidthAtStep(candidate, candidate + 1, 0)
                            : 0);
                    if (width <= available) fitted = candidate;
                    else break; // widths only grow: no later break fits
                }
                return { fitted, explicit, restFits: false };
            })();

        let toSegment: number,
            breakAt: BreakOpportunity | null,
            isLastLine = false;
        if (pick.restFits) {
            toSegment = segments.length;
            breakAt = null;
            isLastLine = true;
        } else if (pick.explicit !== -1 && pick.fitted === -1) {
            toSegment = pick.explicit + 1;
            breakAt = breakAfter.get(pick.explicit)!;
        } else if (pick.fitted !== -1) {
            toSegment = pick.fitted + 1;
            breakAt = breakAfter.get(pick.fitted)!;
        } else {
            // no break fits: the minimal line (up to and including
            // the first break; or the rest when no break is left)
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
                isLastLine = true;
            }
        }

        // --- greedy-fit: adjust the picked line --------------------
        const collapsesOf = (end: number): boolean =>
                breakAfter.get(end - 1)?.collapses === true,
            hasNarrowingPotential = (end: number): boolean =>
                lineWidthAtStep(fromSegment, end, -1) <
                lineWidthAtStep(fromSegment, end, 0),
            hasWideningPotential = (end: number): boolean =>
                lineWidthAtStep(fromSegment, end, 1) >
                lineWidthAtStep(fromSegment, end, 0);
        let adjustmentStep = 0;
        if (!isLastLine) {
            // NARROW: pull more segments onto the line (minimal
            // narrowing step per pull). Explicit-ended lines don't
            // pull (their break is mandatory) but still widen below.
            while (
                breakAt?.kind !== "explicit" &&
                hasNarrowingPotential(toSegment) &&
                toSegment < segments.length
            ) {
                // the next break opportunity at/after the current end
                let nextBreakAfter = -1;
                for (
                    let candidate = toSegment;
                    candidate < segments.length - 1;
                    candidate++
                )
                    if (breakAfter.has(candidate)) {
                        nextBreakAfter = candidate;
                        break;
                    }
                if (nextBreakAfter === -1) break; // the rest is the last line
                const nextEnd = nextBreakAfter + 1,
                    nextCollapses = collapsesOf(nextEnd),
                    step = findFittingStep(
                        fromSegment,
                        nextEnd,
                        nextCollapses,
                        available,
                        -1,
                        0,
                    );
                if (step === null) break; // doesn't fit even narrowed
                toSegment = nextEnd;
                breakAt = breakAfter.get(nextBreakAfter)!;
                adjustmentStep = step;
                // pulling TO a mandatory break is legitimate (the
                // line ends there) — pulling PAST it is not
                if (breakAt.kind === "explicit") break;
                if (step > -_STEP_EPSILON) break; // fits naturally now
            }
            // WIDEN: only when narrowing pulled nothing up
            if (
                adjustmentStep === 0 &&
                hasWideningPotential(toSegment) &&
                fittingWidth(
                    fromSegment,
                    toSegment,
                    0,
                    collapsesOf(toSegment),
                ) < available
            ) {
                const collapses = collapsesOf(toSegment),
                    step =
                        fittingWidth(fromSegment, toSegment, 1, collapses) <=
                        available
                            ? 1 // max potential, still fits (underfull)
                            : findFittingStep(
                                  fromSegment,
                                  toSegment,
                                  collapses,
                                  available,
                                  0,
                                  1,
                              );
                if (step !== null && step > _STEP_EPSILON)
                    adjustmentStep = step;
            }
        }
        // overfull at the current step: try narrowing to fit (also
        // the last line and explicit lines); unsatisfiable when even
        // max narrowing doesn't fit -> |step| > 1 (contract)
        const finalCollapses = collapsesOf(toSegment),
            finalWidth = fittingWidth(
                fromSegment,
                toSegment,
                adjustmentStep,
                finalCollapses,
            );
        if (finalWidth > available) {
            const step = hasNarrowingPotential(toSegment)
                ? findFittingStep(
                      fromSegment,
                      toSegment,
                      finalCollapses,
                      available,
                      -1,
                      0,
                  )
                : null;
            adjustmentStep = step === null ? -2 : step; // -2: exhausted
        }

        const naturalWidthPt = lineWidthAtStep(fromSegment, toSegment, 0),
            fittingWidthPt = fittingWidth(
                fromSegment,
                toSegment,
                Math.max(-1, Math.min(1, adjustmentStep)),
                finalCollapses,
            ),
            overfull = fittingWidthPt > available,
            slack = available - fittingWidthPt;
        if (overfull) overfullLines.push(lineIndex);
        lines.push({
            fromSegment,
            toSegment,
            breakAt,
            naturalWidthPt,
            adjustmentStep,
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
