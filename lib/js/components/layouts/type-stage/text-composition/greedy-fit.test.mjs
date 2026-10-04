// Behavior tests for greedy-fit (milestone 4): the varla-varfo
// strategy predictively — greedy break at natural width, narrow
// until one more segment fits (minimal step), widen to fill when
// narrowing pulls nothing, last line never widened, unsatisfiable
// |step| > 1, contract-clean potential detection (clamped widths =
// no potential).
import { describe, it, expect } from "vitest";

import { greedyFitComposition } from "./greedy-fit.ts";

// words of equal width separated by spaces; lineWidthAtStep applies
// a uniform per-step width factor: width(step) = natural * (1 +
// step * stepFactor) — narrowing shrinks, widening grows.
function makeInput(
    words,
    {
        wordWidth = 10,
        spaceWidth = 4,
        lineWidth = Infinity,
        explicitAt = [],
        stepFactor = 0.3,
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
    segments.pop();
    breaks.pop();
    const natural = (from, to) =>
        segments.slice(from, to).reduce((sum, s) => sum + s.widthPt, 0);
    return {
        segments,
        breaks,
        lineWidthPt: () => lineWidth,
        lineWidthAtStep: (from, to, step) =>
            natural(from, to) * (1 + step * stepFactor),
    };
}

describe("greedyFitComposition", () => {
    it("narrows until one more segment fits (minimal narrowing step)", () => {
        // 3 words fit naturally (38 = 3*10 + 2*4, trailing space
        // collapses); the 4th at natural is 52 — narrowed at ~30%
        // potential it fits: step = (38/52 - 1)/0.3 ≈ -0.897
        const input = makeInput(["aa", "bb", "cc", "dd", "ee"], {
                lineWidth: 38,
            }),
            { lines } = greedyFitComposition(input);
        expect(lines.map((l) => [l.fromSegment, l.toSegment])).toEqual([
            [0, 8], // aa sp bb sp cc sp dd sp — the 4th word pulled up
            [8, 9], // ee (last line)
        ]);
        expect(lines[0].adjustmentStep).toBeLessThan(-0.8);
        expect(lines[0].adjustmentStep).toBeGreaterThan(-1);
        // the last line is never treated
        expect(lines[1].adjustmentStep).toBe(0);
    });

    it("widens to fill when narrowing pulls nothing up", () => {
        // line 1: aa sp bb (24 at natural, nothing to pull — cc is
        // the last line); widen to fill 30: step = (30/24-1)/0.3 ≈ 0.83
        const input = makeInput(["aa", "bb", "cc"], { lineWidth: 30 }),
            { lines } = greedyFitComposition(input);
        expect(lines.map((l) => [l.fromSegment, l.toSegment])).toEqual([
            [0, 4],
            [4, 5],
        ]);
        expect(lines[0].adjustmentStep).toBeGreaterThan(0.8);
        expect(lines[0].adjustmentStep).toBeLessThan(0.9);
        // the last line is never widened (contract)
        expect(lines[1].adjustmentStep).toBe(0);
    });

    it("leaves max potential when even +1 underfills", () => {
        // line 1: aa sp bb (24); nothing to pull (cc is the last
        // line); width at +1 = 31.2 <= 32 -> leave at max potential
        const input = makeInput(["aa", "bb", "cc"], { lineWidth: 32 }),
            { lines } = greedyFitComposition(input);
        expect(lines[0].toSegment).toBe(4);
        expect(lines[0].adjustmentStep).toBe(1);
        expect(lines[1].adjustmentStep).toBe(0); // last line
    });

    it("detects exhausted potentials via clamped widths (no step the Host can't apply)", () => {
        // stepFactor 0: the widths clamp — no potential either way
        const input = makeInput(["aa", "bb", "cc"], {
                lineWidth: 30,
                stepFactor: 0,
            }),
            { lines } = greedyFitComposition(input);
        expect(lines[0].adjustmentStep).toBe(0);
        expect(lines[0].toSegment).toBe(4); // the natural break
    });

    it("narrows an overfull line to fit; unsatisfiable lines signal |step| > 1", () => {
        // one wide word: 100 at natural; narrows to 70 at -1 — fits
        // 80; doesn't fit 50 -> step -2 (potential exhausted)
        const fitting = makeInput(["supercalifragilistic", "ok"], {
                wordWidth: 100,
                lineWidth: 80,
            }),
            { lines: fittingLines, diagnostics: fittingDiag } =
                greedyFitComposition(fitting);
        expect(fittingLines[0].adjustmentStep).toBeGreaterThan(-1);
        expect(fittingLines[0].adjustmentStep).toBeLessThan(0);
        expect(fittingDiag.overfullLines).toEqual([]);

        const unfitting = makeInput(["supercalifragilistic", "ok"], {
                wordWidth: 100,
                lineWidth: 50,
            }),
            { lines: unfittingLines, diagnostics: unfittingDiag } =
                greedyFitComposition(unfitting);
        expect(unfittingLines[0].adjustmentStep).toBeLessThan(-1);
        expect(unfittingDiag.overfullLines).toContain(0);
        // the second word (own line) is also unsatisfiable (100 > 50)
        expect(unfittingLines[1].adjustmentStep).toBeLessThan(-1);
    });

    it("honors mandatory explicit breaks (no pulling past; still widened)", () => {
        const input = makeInput(["aa", "bb", "cc"], {
                lineWidth: 30,
                explicitAt: [0],
            }),
            { lines } = greedyFitComposition(input);
        expect(lines).toHaveLength(2);
        expect(lines[0].breakAt.kind).toBe("explicit");
        expect(lines[0].toSegment).toBe(2); // aa sp — nothing pulled
        // explicit lines are composed like non-final lines: widened
        expect(lines[0].adjustmentStep).toBeGreaterThan(0);
    });

    it("keeps lines contiguous and complete (the structural invariant)", () => {
        const input = makeInput(["aa", "bb", "cc", "dd", "ee", "ff", "gg"], {
                lineWidth: 38,
            }),
            { lines } = greedyFitComposition(input);
        let cursor = 0;
        for (const line of lines) {
            expect(line.fromSegment).toBe(cursor);
            cursor = line.toSegment;
        }
        expect(cursor).toBe(input.segments.length);
    });
});
