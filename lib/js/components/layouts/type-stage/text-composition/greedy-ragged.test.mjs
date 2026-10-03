// Behavior tests for greedy ragged (milestone 2): fit-driven
// breaking at natural widths, trailing space kept-but-not-fitted,
// explicit breaks, overfull flagging, slack badness.
import { describe, it, expect } from "vitest";

import { greedyRaggedComposition } from "./greedy-ragged.ts";

// words of equal width (10pt) separated by 4pt spaces
function makeInput(
    words,
    {
        wordWidth = 10,
        spaceWidth = 4,
        lineWidth = Infinity,
        explicitAt = [],
    } = {},
) {
    const segments = [],
        breaks = [],
        explicitSet = new Set(explicitAt);
    let index = 0;
    for (const word of words) {
        segments.push({
            start: index,
            end: index + word.length,
            widthPt: wordWidth,
        });
        index += word.length;
        segments.push({ start: index, end: index + 1, widthPt: spaceWidth });
        breaks.push({
            afterSegment: segments.length - 1,
            kind: explicitSet.has(words.indexOf(word)) ? "explicit" : "space",
            penalty: 0,
            collapses: true,
        });
        index += 1;
    }
    // drop the trailing space segment + its break (paragraph end)
    segments.pop();
    breaks.pop();
    return {
        segments,
        breaks,
        lineWidthPt: () => lineWidth,
        lineWidthAtStep: (from, to /*, step */) =>
            segments.slice(from, to).reduce((sum, s) => sum + s.widthPt, 0),
    };
}

const lineWords = (words, segments, line) =>
    segments
        .slice(line.fromSegment, line.toSegment)
        .map((s) => (s.end - s.start > 1 ? "word" : "space"))
        .join(",");

describe("greedyRaggedComposition", () => {
    it("breaks greedily at natural width", () => {
        // 6 words, 10pt each + 4pt spaces; line fits 3 words:
        // 3*10 + 2*4 (interior spaces) = 38 <= 38 (trailing excluded)
        const words = ["aa", "bb", "cc", "dd", "ee", "ff"],
            input = makeInput(words, { lineWidth: 38 }),
            { lines } = greedyRaggedComposition(input);
        expect(lines.map((l) => [l.fromSegment, l.toSegment])).toEqual([
            [0, 6], // aa sp bb sp cc sp
            [6, 11], // dd sp ee sp ff
        ]);
        // every line KEEPS its trailing space segment (semantic value)
        expect(lineWords(words, input.segments, lines[0])).toBe(
            "word,space,word,space,word,space",
        );
        expect(lines[0].adjustmentStep).toBe(0);
        expect(lines.at(-1).breakAt).toBe(null);
    });

    it("the trailing space does NOT count toward the fit test", () => {
        // 3 words exactly fill 38pt INCLUDING the trailing space
        // (10+4+10+4+10+4 = 42 > 38; excluding trailing: 38 = 38):
        // the third word fits because its trailing space collapses
        const words = ["aa", "bb", "cc"],
            input = makeInput(words, { lineWidth: 38 }),
            { lines, diagnostics } = greedyRaggedComposition(input);
        expect(lines).toHaveLength(1);
        expect(diagnostics.overfullLines).toEqual([]);
    });

    it("flags a single word wider than the line as overfull", () => {
        const words = ["supercalifragilistic", "ok"],
            input = makeInput(words, { wordWidth: 100, lineWidth: 50 }),
            { lines, diagnostics } = greedyRaggedComposition(input);
        // line 1: the wide word (plus its trailing space), overfull
        expect(lines).toHaveLength(2);
        expect(lines[0].fromSegment).toBe(0);
        expect(lines[0].toSegment).toBe(2); // word + space
        // BOTH words are wider than the line (wordWidth 100 > 50):
        // both lines flagged (last lines are flagged too)
        expect(diagnostics.overfullLines).toEqual([0, 1]);
        // overfull badness >= 1: 1 + excess/available
        expect(diagnostics.badness[0]).toBeCloseTo(1 + (100 - 50) / 50);
        expect(diagnostics.badness[1]).toBeCloseTo(1 + (100 - 50) / 50);
    });

    it("honors mandatory 'explicit' breaks", () => {
        const words = ["aa", "bb", "cc"],
            input = makeInput(words, {
                lineWidth: Infinity,
                explicitAt: [0],
            }),
            { lines } = greedyRaggedComposition(input);
        expect(lines).toHaveLength(2);
        expect(lines[0].breakAt.kind).toBe("explicit");
    });

    it("slack badness: 0 for a full line, loose for a short one", () => {
        const words = ["aa", "bb", "cc", "dd"],
            input = makeInput(words, { lineWidth: 38 }),
            { diagnostics } = greedyRaggedComposition(input);
        // line 1: 3 words fitting exactly (38) -> badness 0
        expect(diagnostics.badness[0]).toBeCloseTo(0);
        // line 2: 1 word (10) -> (38-10)/38
        expect(diagnostics.badness[1]).toBeCloseTo(28 / 38);
    });

    it("handles an empty paragraph", () => {
        const { lines, diagnostics } = greedyRaggedComposition(
            makeInput([], {}),
        );
        expect(lines).toEqual([]);
        expect(diagnostics.overfullLines).toEqual([]);
    });
});
