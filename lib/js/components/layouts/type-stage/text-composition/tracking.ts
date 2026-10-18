/**
 * Tracking arithmetic over visible HarfBuzz output glyphs.
 *
 * A complete line containing N visible shaped glyphs has N−1 gaps. Gaps
 * continue across segment and style-run boundaries; the run containing the
 * preceding glyph owns the boundary gap. A taken hyphen is one final glyph:
 * the preceding source run owns the gap before it and no gap follows it.
 */

export interface TrackingRun {
    sourceIndex: number;
    glyphCount: number;
    trackingPt: number;
}

export interface TrackingAllocation {
    widthPt: number;
    gapsBySourceIndex: Map<number, number>;
}

export function allocateTracking(
    runs: readonly TrackingRun[],
    takenHyphen = false,
): TrackingAllocation {
    const visibleRuns = runs.filter(({ glyphCount }) => glyphCount > 0),
        sourceGlyphCount = visibleRuns.reduce(
            (sum, { glyphCount }) => sum + glyphCount,
            0,
        ),
        totalGlyphCount = sourceGlyphCount + (takenHyphen ? 1 : 0),
        totalGaps = Math.max(0, totalGlyphCount - 1),
        gapsBySourceIndex = new Map<number, number>();
    let remainingGaps = totalGaps,
        widthPt = 0;
    for (const run of visibleRuns) {
        // Every glyph in this run owns the following gap, except once
        // the complete line's final gap has already been allocated.
        const gaps = Math.min(run.glyphCount, remainingGaps);
        if (gaps > 0) {
            gapsBySourceIndex.set(
                run.sourceIndex,
                (gapsBySourceIndex.get(run.sourceIndex) ?? 0) + gaps,
            );
            widthPt += gaps * run.trackingPt;
            remainingGaps -= gaps;
        }
    }
    return { widthPt, gapsBySourceIndex };
}
