/**
 * The dummy algorithm — the algorithm ingredient FOR milestone 1.
 * Milestone 1 itself is the full Host side executing this algorithm
 * end to end, proving the infrastructure that calls it works.
 *
 * Strategy: a hardcoded number of segments per line. The line ends at
 * the first legal break opportunity at or after that count (or earlier
 * at a mandatory 'explicit' break, or at the end of the input).
 * No fitting: every line gets adjustmentStep 0. Diagnostics are still
 * produced (overfull lines are detected via lineWidthAtStep at step 0),
 * so the plumbing for CompositionResult.diagnostics is exercised too.
 */
import type {
    BreakOpportunity,
    ComposedLine,
    CompositionAlgorithm,
} from "./composition-types.ts";

export const DUMMY_SEGMENTS_PER_LINE = 4;

export const dummyComposition: CompositionAlgorithm = (input) => {
    const { segments, breaks, lineWidthPt, lineWidthAtStep } = input,
        breakAfter = new Map<number, BreakOpportunity>(
            breaks.map((b) => [b.afterSegment, b]),
        ),
        lines: ComposedLine[] = [],
        overfullLines: number[] = [];

    let fromSegment = 0;
    while (fromSegment < segments.length) {
        // End at the first legal break at or after the hardcoded
        // count; a mandatory 'explicit' break ends the line earlier.
        let toSegment = segments.length,
            breakAt: BreakOpportunity | null = null;
        for (
            let i = fromSegment;
            i <
            Math.min(
                fromSegment + DUMMY_SEGMENTS_PER_LINE,
                segments.length - 1,
            );
            i++
        ) {
            const candidate = breakAfter.get(i);
            if (candidate?.kind === "explicit") {
                toSegment = i + 1;
                breakAt = candidate;
                break;
            }
        }
        if (breakAt === null) {
            for (
                let i = fromSegment + DUMMY_SEGMENTS_PER_LINE - 1;
                i < segments.length - 1;
                i++
            ) {
                const candidate = breakAfter.get(i);
                if (candidate !== undefined) {
                    toSegment = i + 1;
                    breakAt = candidate;
                    break;
                }
            }
        }

        const naturalWidthPt = lineWidthAtStep(fromSegment, toSegment, 0),
            lineIndex = lines.length;
        if (naturalWidthPt > lineWidthPt(lineIndex))
            overfullLines.push(lineIndex);
        lines.push({
            fromSegment,
            toSegment,
            breakAt,
            naturalWidthPt,
            adjustmentStep: 0,
        });
        fromSegment = toSegment;
    }

    return {
        lines,
        diagnostics: {
            overfullLines,
            badness: lines.map(() => 0),
        },
    };
};
