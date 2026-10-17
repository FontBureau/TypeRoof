import { describe, expect, it } from "vitest";
import { allocateTracking } from "./tracking.ts";

describe("shaped-glyph tracking allocation", () => {
    it("uses N-1 gaps and gives one glyph zero tracking", () => {
        expect(
            allocateTracking([
                { sourceIndex: 0, glyphCount: 4, trackingPt: 2 },
            ]),
        ).toEqual({ widthPt: 6, gapsBySourceIndex: new Map([[0, 3]]) });
        expect(
            allocateTracking([
                { sourceIndex: 0, glyphCount: 1, trackingPt: 2 },
            ]),
        ).toEqual({ widthPt: 0, gapsBySourceIndex: new Map() });
    });

    it("continues across segments and gives the preceding run the boundary", () => {
        expect(
            allocateTracking([
                { sourceIndex: 0, glyphCount: 2, trackingPt: 1 },
                { sourceIndex: 0, glyphCount: 1, trackingPt: 1 },
                { sourceIndex: 1, glyphCount: 2, trackingPt: 3 },
            ]),
        ).toEqual({
            widthPt: 6,
            gapsBySourceIndex: new Map([
                [0, 3],
                [1, 1],
            ]),
        });
    });

    it("counts a taken hyphen as the final glyph", () => {
        expect(
            allocateTracking(
                [{ sourceIndex: 0, glyphCount: 1, trackingPt: 2 }],
                true,
            ),
        ).toEqual({ widthPt: 2, gapsBySourceIndex: new Map([[0, 1]]) });
    });
});
