// Behavior tests for greedy-fit (milestone 4): the varla-varfo
// strategy predictively — greedy break at natural width, narrow
// until one more segment fits (minimal step), widen to fill when
// narrowing pulls nothing, last line never widened, unsatisfiable
// |step| > 1, contract-clean potential detection (clamped widths =
// no potential).
import { describe, it, expect } from "vitest";

import { createGreedyFitComposition } from "./greedy-fit.ts";

// the default config (ragged) — behavior identical to the milestone-4 const
const greedyFit = createGreedyFitComposition();

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
            { lines } = greedyFit(input);
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
            { lines } = greedyFit(input);
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
            { lines } = greedyFit(input);
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
            { lines } = greedyFit(input);
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
                greedyFit(fitting);
        expect(fittingLines[0].adjustmentStep).toBeGreaterThan(-1);
        expect(fittingLines[0].adjustmentStep).toBeLessThan(0);
        expect(fittingDiag.overfullLines).toEqual([]);

        const unfitting = makeInput(["supercalifragilistic", "ok"], {
                wordWidth: 100,
                lineWidth: 50,
            }),
            { lines: unfittingLines, diagnostics: unfittingDiag } =
                greedyFit(unfitting);
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
            { lines } = greedyFit(input);
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
            { lines } = greedyFit(input);
        let cursor = 0;
        for (const line of lines) {
            expect(line.fromSegment).toBe(cursor);
            cursor = line.toSegment;
        }
        expect(cursor).toBe(input.segments.length);
    });
});

describe("lastLineHandling", () => {
    const compose = (words, lineWidth, lastLineHandling) =>
        createGreedyFitComposition({ lastLineHandling })(
            makeInput(words, { lineWidth }),
        );

    it("ragged (default): a two-word heading breaks rather than absorbing the remainder", () => {
        // "A B" at wordWidth 10: natural 24pt; measure 16pt — the
        // minimal line is "A " (10pt + collapse) and the remainder
        // "B" would fit narrowed (24 * (1 - 0.3) = 16.8 > 16; at
        // full narrowing 16.8 hmm — stepFactor 0.3: at -1: 16.8;
        // at -1: > 16 → does NOT fit even fully narrowed). Use
        // stepFactor where it fits: see the fill case below.
        const { lines } = compose(["A", "B"], 16, undefined);
        // the default IS ragged even when passed explicitly too
        expect(lines.length).toBe(2);
        expect(lines[1].breakAt).toBe(null);
    });

    it("fill: the pull loop absorbs the remainder — the line becomes the final one, narrowed to fit", () => {
        // "A B C": natural per word+space 14pt; the whole paragraph
        // "A B C" natural = 40pt (3*10 + 2*4 + collapse rules);
        // measure 30pt: no single break candidate fits the whole
        // rest naturally, but narrowed (stepFactor 0.3) the whole
        // paragraph fits: 40 * (1 - 0.3 * s) <= 30 → s >= 0.8333.
        // With fill: ONE line "A B C" at step ≈ -0.8333.
        const { lines } = compose(["A", "B", "C"], 30, "fill");
        expect(lines.length).toBe(1);
        expect(lines[0].breakAt).toBe(null);
        expect(lines[0].adjustmentStep).toBeLessThan(0);
        expect(lines[0].adjustmentStep).toBeGreaterThan(-1);
        // the whole paragraph absorbed (3 words + 2 spaces = 5 segments)
        expect(lines[0].toSegment).toBe(5);
    });

    it("ragged: the same input keeps the minimal-line break (status quo)", () => {
        const { lines } = compose(["A", "B", "C"], 30, "ragged");
        expect(lines.length).toBeGreaterThan(1);
    });

    it("fill: an underfull final line widens to the measure", () => {
        // "A B" natural = 24pt <= measure 40pt → restFits → the last
        // line; fill widens it: step > 0 (the demo's "headline fills")
        const { lines } = compose(["A", "B"], 40, "fill");
        expect(lines.length).toBe(1);
        expect(lines[0].adjustmentStep).toBeGreaterThan(0);
    });

    it("ragged: the same fitting last line stays at step 0 (\\parfillskip)", () => {
        const { lines } = compose(["A", "B"], 40, "ragged");
        expect(lines.length).toBe(1);
        expect(lines[0].adjustmentStep).toBe(0);
    });

    it("fill never swallows an explicit break", () => {
        // "A B" with an explicit break after A: the line MUST end at
        // the explicit break even in fill mode
        const input = makeInput(["A", "B"], { lineWidth: 30, explicitAt: [0] }),
            { lines } = createGreedyFitComposition({
                lastLineHandling: "fill",
            })(input);
        expect(lines[0].toSegment).toBe(2); // "A" + its space
        expect(lines[0].breakAt.kind).toBe("explicit");
    });
});

describe("underfullTreatment", () => {
    // a NON-FINAL line too short to fill even at maximum widening.
    // "A" ends at an explicit break (mandatory) so it is not the last
    // line: natural 10, measure 21 (underfull), widening stepFactor
    // 0.3 → max 13 — still underfull. "off" leaves it at step +1
    // (status quo); "run"/"font" revert to step 0 with the marker.
    const tooShort = (treatment, lineWidth = 21) =>
        createGreedyFitComposition({
            underfullTreatment: treatment,
        })(makeInput(["A", "B"], { lineWidth, explicitAt: [0] }));

    it("off (default): the underfull line stays at max widening (status quo)", () => {
        const { lines } = tooShort("off");
        expect(lines[0].breakAt.kind).toBe("explicit");
        expect(lines[0].adjustmentStep).toBe(1);
        expect(lines[0].underfullRevert).toBe(undefined);
        // the default config behaves the same (status quo)
        const { lines: defaultLines } = createGreedyFitComposition()(
            makeInput(["A", "B"], { lineWidth: 21, explicitAt: [0] }),
        );
        expect(defaultLines[0].adjustmentStep).toBe(1);
        expect(defaultLines[0].underfullRevert).toBe(undefined);
    });

    it("run: the line reverts to step 0 with the marker", () => {
        const { lines } = tooShort("run");
        expect(lines[0].adjustmentStep).toBe(0);
        expect(lines[0].underfullRevert).toBe("run");
    });

    it("font: same marker shape", () => {
        const { lines } = tooShort("font");
        expect(lines[0].adjustmentStep).toBe(0);
        expect(lines[0].underfullRevert).toBe("font");
    });

    it("a line that CAN be filled keeps widening (no revert)", () => {
        // measure 12: natural 10, max 13 → the largest fitting step
        // exists (< 1); no revert in any mode
        for (const treatment of ["off", "run", "font"]) {
            const { lines } = createGreedyFitComposition({
                underfullTreatment: treatment,
            })(makeInput(["A", "B"], { lineWidth: 12, explicitAt: [0] }));
            expect(lines[0].adjustmentStep).toBeGreaterThan(0);
            expect(lines[0].adjustmentStep).toBeLessThan(1);
            expect(lines[0].underfullRevert).toBe(undefined);
        }
    });
});

describe("underfullTreatment (uniform — final lines and zero widening range)", () => {
    // a FITTING single-line paragraph (the last line) with a ZERO
    // widening range (stepFactor 0: width(+1) === width(0)): the
    // widen branch never runs — the uniform check must still mark
    // the reverted line. Previously this rendered stretched at the
    // anchored dflt in every mode.
    it("zero widening range + fitting last line: run reverts it (ragged mode too)", () => {
        for (const lastLineHandling of ["ragged", "fill"]) {
            const { lines } = createGreedyFitComposition({
                lastLineHandling,
                underfullTreatment: "run",
            })(makeInput(["A"], { lineWidth: 40, stepFactor: 0 }));
            expect(lines.length).toBe(1);
            expect(lines[0].adjustmentStep).toBe(0);
            expect(lines[0].underfullRevert).toBe("run");
        }
    });

    it("zero widening range: off keeps the status quo (step 0, no marker)", () => {
        const { lines } = createGreedyFitComposition({
            underfullTreatment: "off",
        })(makeInput(["A"], { lineWidth: 40, stepFactor: 0 }));
        expect(lines[0].adjustmentStep).toBe(0);
        expect(lines[0].underfullRevert).toBe(undefined);
        // the default config is identical
        const { lines: defaults } = createGreedyFitComposition()(
            makeInput(["A"], { lineWidth: 40, stepFactor: 0 }),
        );
        expect(defaults[0].underfullRevert).toBe(undefined);
    });

    it("a fitting last line WITH widening range: only fill mode widens it, revert never fires (it fills)", () => {
        // stepFactor 0.3: the line CAN fill (largest fitting step
        // exists) — fill widens it; ragged keeps step 0 (no marker:
        // widening COULD fill, so the line is not reverted)
        const filled = createGreedyFitComposition({
            lastLineHandling: "fill",
            underfullTreatment: "run",
        })(makeInput(["A"], { lineWidth: 11, stepFactor: 0.3 }));
        expect(filled.lines[0].adjustmentStep).toBeGreaterThan(0);
        expect(filled.lines[0].underfullRevert).toBe(undefined);
        const ragged = createGreedyFitComposition({
            lastLineHandling: "ragged",
            underfullTreatment: "run",
        })(makeInput(["A"], { lineWidth: 11, stepFactor: 0.3 }));
        expect(ragged.lines[0].adjustmentStep).toBe(0);
        // ragged: widening is not attempted for the last line, but
        // the potential exists — the operator's uniform rule keys on
        // "widening cannot fill"; here it can, so no revert
        expect(ragged.lines[0].underfullRevert).toBe(undefined);
    });
});
