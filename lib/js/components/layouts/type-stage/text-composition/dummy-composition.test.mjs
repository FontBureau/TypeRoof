// Behavior test for the dummy composition algorithm (milestone 1):
// fixed segments-per-line chunking at legal breaks, mandatory
// 'explicit' breaks end lines early, no fitting (adjustmentStep 0),
// overfull detection via lineWidthAtStep at step 0.
import { describe, it, expect } from "vitest";

import {
    dummyComposition,
    DUMMY_SEGMENTS_PER_LINE,
} from "./dummy-composition.ts";

function makeSegment(start, widthPt = 10) {
    return { start, end: start + 1, widthPt };
}

function makeInput(
    segmentCount,
    { widthPt = 10, lineWidth = Infinity, explicitAt = [] } = {},
) {
    const segments = Array.from({ length: segmentCount }, (_, i) =>
            makeSegment(i, widthPt),
        ),
        explicitSet = new Set(explicitAt),
        breaks = [];
    for (let i = 0; i < segmentCount - 1; i++)
        breaks.push({
            afterSegment: i,
            kind: explicitSet.has(i) ? "explicit" : "space",
            penalty: 0,
        });
    return {
        segments,
        breaks,
        lineWidthPt: () => lineWidth,
        lineWidthAtStep: (from, to /*, step */) =>
            segments.slice(from, to).reduce((sum, s) => sum + s.widthPt, 0),
    };
}

describe("dummyComposition", () => {
    it("chunks at DUMMY_SEGMENTS_PER_LINE legal breaks", () => {
        const result = dummyComposition(makeInput(10));
        expect(result.lines.map((l) => [l.fromSegment, l.toSegment])).toEqual([
            [0, DUMMY_SEGMENTS_PER_LINE],
            [DUMMY_SEGMENTS_PER_LINE, 2 * DUMMY_SEGMENTS_PER_LINE],
            [2 * DUMMY_SEGMENTS_PER_LINE, 10],
        ]);
        // last line has breakAt null, others point at the taken break
        expect(result.lines.at(-1).breakAt).toBe(null);
        expect(result.lines[0].breakAt.kind).toBe("space");
        // no fitting
        expect(result.lines.every((l) => l.adjustmentStep === 0)).toBe(true);
        expect(result.diagnostics.overfullLines).toEqual([]);
        expect(result.diagnostics.badness).toHaveLength(3);
    });

    it("ends a line early at a mandatory 'explicit' break", () => {
        const result = dummyComposition(
            makeInput(6, { explicitAt: [1] }), // break after segment 1
        );
        expect(result.lines.map((l) => [l.fromSegment, l.toSegment])).toEqual([
            [0, 2],
            [2, 6],
        ]);
        expect(result.lines[0].breakAt.kind).toBe("explicit");
    });

    it("reports overfull lines", () => {
        // each segment 10pt wide, 4 per line => 40pt; line width 35pt
        const result = dummyComposition(makeInput(4, { lineWidth: 35 }));
        expect(result.diagnostics.overfullLines).toEqual([0]);
        expect(result.lines[0].naturalWidthPt).toBe(40);
    });

    it("handles an empty paragraph", () => {
        const result = dummyComposition(makeInput(0));
        expect(result.lines).toEqual([]);
        expect(result.diagnostics.overfullLines).toEqual([]);
    });
});
