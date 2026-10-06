// Behavior tests for knuth-plass (milestone 5): paragraph-wide
// least-demerits DP over the break graph — TeX demerits, fitness
// classes with adjacency costs ("balance gray"), hyphen demerits,
// prohibited/forced breaks, the step lattice + polish, the
// guaranteed-path policy, and the cooperative generator protocol.
// Fakes per contract: piecewise-linear lineWidthAtStep (word widths
// respond to step × a per-candidate potential factor, spaces are
// inelastic) and an analytic badnessAtStep (or the module's
// documented fallback 100·|step|³).
import { describe, it, expect } from "vitest";

import { createKnuthPlassComposition } from "./knuth-plass.ts";
import { greedyFitComposition } from "./greedy-fit.ts";
import {
    createCancellationToken,
    drainTaskSync,
    resumeTaskAsync,
} from "./composition-task.ts";

// the contract's canonical badness (same as the module fallback;
// injected explicitly where a test relies on it)
const cubicBadness = (step) =>
    Math.abs(step) > 1 ? Infinity : 100 * Math.abs(step) ** 3;

// words of given widths separated by inelastic spaces; break
// opportunities after words (default: after every word but the
// last). lineWidthAtStep: (sum of word widths) × (1 + step ×
// factor(words in span)) + inelastic spaces; a candidate ending at
// a hyphen break renders the hyphen glyph INSTEAD of the trailing
// space (hyphenWidth, 0 by default) — the space does not collapse
// (collapses: false), so both conventions agree on the fit test.
function makeInput(
    wordWidths,
    {
        spaceWidth = 4,
        lineWidth = Infinity,
        stepFactor = 0.3,
        breaksAfter,
        breakKinds = {},
        breakPenalties = {},
        hyphenWidth = 0,
        badnessAtStep,
    } = {},
) {
    const segments = [],
        breaks = [];
    let index = 0;
    for (let w = 0; w < wordWidths.length; w++) {
        const width = wordWidths[w];
        segments.push({ start: index, end: index + width, widthPt: width });
        index += width;
        if (w === wordWidths.length - 1) break;
        segments.push({ start: index, end: index + 1, widthPt: spaceWidth });
        index += 1;
        if (breaksAfter !== undefined && !breaksAfter.includes(w)) continue;
        const kind = breakKinds[w] ?? "space";
        breaks.push({
            afterSegment: segments.length - 1,
            kind,
            penalty: breakPenalties[w] ?? 0,
            collapses: kind !== "hyphen",
        });
    }
    const breakAfter = new Map(breaks.map((b) => [b.afterSegment, b]));
    return {
        segments,
        breaks,
        lineWidthPt: () => lineWidth,
        lineWidthAtStep: (from, to, step) => {
            let wordSum = 0,
                words = 0,
                spaces = 0;
            for (let i = from; i < to; i++)
                if (i % 2 === 0) {
                    wordSum += segments[i].widthPt;
                    words++;
                } else spaces++;
            const factor =
                    typeof stepFactor === "function"
                        ? stepFactor(words)
                        : stepFactor,
                hyphen =
                    breakAfter.get(to - 1)?.kind === "hyphen"
                        ? hyphenWidth - spaceWidth // replaces the space
                        : 0;
            return wordSum * (1 + step * factor) + spaces * spaceWidth + hyphen;
        },
        ...(badnessAtStep ? { badnessAtStep } : {}),
    };
}

const compose = (input, config) =>
        drainTaskSync(createKnuthPlassComposition(config)(input)),
    spans = (lines) => lines.map((l) => [l.fromSegment, l.toSegment]);

describe("createKnuthPlassComposition", () => {
    it("finds the paragraph optimum where greedy-fit narrows too eagerly (and pins the badness fallback)", () => {
        // 7 words at 40pt: three 3-word lines each need a slight
        // +0.2 widening (badness 0.8 → demerits (10.8)² ≈ 116.64,
        // total ≈ 333.28). Greedy-fit instead pulls the 4th word up
        // at step −1 (badness 100 → ≈ 12100 + …). No badnessAtStep
        // injected: pins the documented fallback 100·|step|³.
        const input = makeInput([10, 10, 10, 10, 10, 10, 10], {
                lineWidth: 40,
            }),
            { lines, diagnostics } = compose(input, { polish: false });
        expect(spans(lines)).toEqual([
            [0, 6],
            [6, 12],
            [12, 13],
        ]);
        expect(lines.map((l) => l.adjustmentStep)).toEqual([0.2, 0.2, 0]);
        expect(diagnostics.fitnessClasses).toEqual([
            "decent",
            "decent",
            "decent",
        ]);
        expect(diagnostics.totalDemerits).toBeCloseTo(
            2 * (10 + 0.8) ** 2 + 100,
            5,
        );
        // the incumbent strategy on the same input (for comparison)
        const greedy = greedyFitComposition(input);
        expect(spans(greedy.lines)).toEqual([
            [0, 8],
            [8, 13],
        ]);
    });

    it("honors mandatory explicit breaks (no edge spans past them)", () => {
        // without the rule, [3|1] (demerits 200) would beat [2|2]
        // (12200): the explicit break after word 2 forbids spanning
        const input = makeInput([10, 10, 10, 10], {
                lineWidth: 38,
                stepFactor: 0.2,
                breakKinds: { 1: "explicit" },
                badnessAtStep: cubicBadness,
            }),
            { lines } = compose(input);
        expect(spans(lines)).toEqual([
            [0, 4],
            [4, 7],
        ]);
        expect(lines[0].breakAt.kind).toBe("explicit");
        // composed like any non-final line: widened toward the
        // measure (max potential still underfills → step +1)
        expect(lines[0].adjustmentStep).toBe(1);
        expect(lines[1].breakAt).toBeNull();
    });

    it("never widens the last line, but narrows it when overfull", () => {
        // underfull single-line paragraph: step 0 despite potential
        const underfull = compose(makeInput([10], { lineWidth: 100 }));
        expect(underfull.lines).toHaveLength(1);
        expect(underfull.lines[0].adjustmentStep).toBe(0);
        expect(underfull.lines[0].breakAt).toBeNull();
        // 2 words (44pt) at 40pt: one narrowed last line (demerits
        // ≈ 269) beats two lines with a fully widened first (12200)
        const overfull = compose(makeInput([20, 20], { lineWidth: 40 }), {
            polish: false,
        });
        expect(overfull.lines).toHaveLength(1);
        expect(overfull.lines[0].adjustmentStep).toBe(-0.4);
        expect(overfull.diagnostics.overfullLines).toEqual([]);
    });

    it("never chooses a prohibited break while any other path exists — and still completes when nothing else exists", () => {
        const prohibited = 1_000_000;
        // alternative exists: the prohibited break after word 1 is
        // skipped, [2|2] chosen
        const input = makeInput([10, 10, 10, 10], {
                lineWidth: 24,
                breakPenalties: { 0: prohibited },
            }),
            { lines } = compose(input, { polish: false });
        expect(spans(lines)).toEqual([
            [0, 4],
            [4, 7],
        ]);
        expect(lines[0].breakAt.penalty).toBe(0);
        // no feasible alternative: STILL skipped; the guaranteed
        // path is a single exhausted line (demerits 1e18 beats
        // 1e18+100 and 2e18)
        const desperate = compose(
            makeInput([10, 10, 10, 10], {
                lineWidth: 13,
                breakPenalties: { 0: prohibited },
            }),
            { polish: false },
        );
        expect(desperate.lines).toHaveLength(1);
        expect(desperate.lines[0].breakAt).toBeNull();
        expect(desperate.diagnostics.exhaustedLines).toEqual([0]);
    });

    it("charges break.penalty² (hyphen breaks are taken only when demerits-optimal)", () => {
        // an equal-quality space break exists → hyphen (penalty 50)
        // avoided
        const avoided = compose(
            makeInput([10, 10, 10, 10], {
                lineWidth: 24,
                breakKinds: { 0: "hyphen" },
                breakPenalties: { 0: 50 },
            }),
            { polish: false },
        );
        expect(spans(avoided.lines)).toEqual([
            [0, 4],
            [4, 7],
        ]);
        expect(avoided.lines[0].breakAt.kind).toBe("space");
        expect(avoided.diagnostics.totalDemerits).toBe(200);
        // only hyphen breaks at the good positions → hyphen taken;
        // penalty² shows in the total: 100 + 50² + 100 — plus the
        // default finalHyphenDemerits (5000): line 1 ends with a
        // hyphen and IS the penultimate line here
        const taken = compose(
            makeInput([10, 10, 10, 10], {
                lineWidth: 24,
                breakKinds: { 0: "hyphen", 1: "hyphen" },
                breakPenalties: { 0: 50, 1: 50 },
            }),
            { polish: false },
        );
        expect(spans(taken.lines)).toEqual([
            [0, 4],
            [4, 7],
        ]);
        expect(taken.lines[0].breakAt.kind).toBe("hyphen");
        expect(taken.diagnostics.totalDemerits).toBe(7700);
    });

    it("accumulates doubleHyphenDemerits (n−1)× over a run of n hyphenated lines", () => {
        // 20pt words at 24pt: only single-word lines are feasible,
        // so all three breaks (penalty 0 — isolates the demerits)
        // are hyphenated; the run is 3 hyphen-ENDED lines
        const base = {
                lineWidth: 24,
                breakKinds: { 0: "hyphen", 1: "hyphen", 2: "hyphen" },
            },
            run = (doubleHyphenDemerits) =>
                compose(makeInput([20, 20, 20, 20], base), {
                    polish: false,
                    finalHyphenDemerits: 0,
                    doubleHyphenDemerits,
                }),
            withDh = run(10_000),
            withoutDh = run(0);
        for (const r of [withDh, withoutDh]) {
            expect(r.lines).toHaveLength(4);
            expect(
                r.lines.slice(0, 3).every((l) => l.breakAt.kind === "hyphen"),
            ).toBe(true);
        }
        // base total: 3 × (10 + 21.6)² + 100 ≈ 3095.68
        expect(withoutDh.diagnostics.totalDemerits).toBeCloseTo(3095.68, 2);
        // (3−1) × 10000 on top
        expect(
            withDh.diagnostics.totalDemerits -
                withoutDh.diagnostics.totalDemerits,
        ).toBeCloseTo(20_000, 5);
    });

    it("charges finalHyphenDemerits when the penultimate line ends with a hyphen", () => {
        const base = {
                lineWidth: 24,
                breakKinds: { 0: "hyphen", 1: "hyphen" },
            },
            run = (finalHyphenDemerits) =>
                compose(makeInput([20, 20, 20], base), {
                    polish: false,
                    doubleHyphenDemerits: 0,
                    finalHyphenDemerits,
                }),
            withFh = run(5000),
            withoutFh = run(0);
        // base total: 2 × (10 + 21.6)² + 100 ≈ 2097.12
        expect(withoutFh.diagnostics.totalDemerits).toBeCloseTo(2097.12, 2);
        expect(
            withFh.diagnostics.totalDemerits -
                withoutFh.diagnostics.totalDemerits,
        ).toBe(5000);
    });

    it("balances the gray: class jumps ≥ 2 are charged only when balanceGray is on (and can flip the chosen breaks)", () => {
        // Hand-tuned paragraph (linePenalty 50): the jumpy path
        // tight→loose→tight ([1|23|456], line demerits
        // 7106.49 + 5126.56 + 7106.49 ≈ 19339.54) beats the smooth
        // path tight→tight ([123|456], 15104.41 + 7106.49 ≈
        // 22210.90) ONLY when the two class jumps are free.
        // Competing decompositions are priced out via "hardly
        // break" penalties (900 — finite, below the prohibited
        // threshold).
        const input = makeInput([150, 32, 40, 56, 58, 60], {
                lineWidth: 100,
                stepFactor: (wordCount) => (wordCount <= 2 ? 0.5 : 0.7),
                breakPenalties: { 1: 900, 3: 900, 4: 900 },
                badnessAtStep: cubicBadness,
            }),
            run = (balanceGray) =>
                compose(input, { polish: false, linePenalty: 50, balanceGray }),
            balanced = run(true),
            unbalanced = run(false);
        expect(spans(unbalanced.lines)).toEqual([
            [0, 2],
            [2, 6],
            [6, 11],
        ]);
        expect(unbalanced.diagnostics.fitnessClasses).toEqual([
            "tight",
            "loose",
            "tight",
        ]);
        expect(spans(balanced.lines)).toEqual([
            [0, 6],
            [6, 11],
        ]);
        expect(balanced.diagnostics.fitnessClasses).toEqual(["tight", "tight"]);
        // the flip in numbers: smooth ≈ 22210.90 vs jumpy ≈
        // 19339.54 (jumpy + 2 × 10000 adjDemerits when on)
        expect(
            balanced.diagnostics.totalDemerits -
                unbalanced.diagnostics.totalDemerits,
        ).toBeCloseTo(22210.9 - 19339.54, 1);
    });

    it("breaks exact ties deterministically: earliest break wins (and runs are repeatable)", () => {
        // badness ≡ 0: every feasible line costs exactly
        // linePenalty² = 100, so all two-line breakings tie at 200 —
        // [1|234], [2|2] and [3|1]. (The 4-word line is infeasible
        // at factor 0.2.) Strict-< relaxation keeps the earliest.
        const input = makeInput([10, 10, 10, 10], {
                lineWidth: 38,
                stepFactor: 0.2,
                badnessAtStep: () => 0,
            }),
            run = () => compose(input),
            r1 = run(),
            r2 = run();
        expect(r1).toEqual(r2);
        expect(r1.diagnostics.totalDemerits).toBe(200);
        expect(spans(r1.lines)).toEqual([
            [0, 2],
            [2, 7],
        ]);
    });

    it("always completes: unsatisfiable paragraphs get a guaranteed path of |step| > 1 lines", () => {
        // 100pt words never fit 60pt (max narrowing: 70pt); a
        // single exhausted line (1e18) beats two (2e18)
        const { lines, diagnostics } = compose(
            makeInput([100, 100], { lineWidth: 60 }),
        );
        expect(lines).toHaveLength(1);
        expect(lines[0].adjustmentStep).toBe(-2);
        expect(lines[0].breakAt).toBeNull();
        expect(diagnostics.overfullLines).toEqual([0]);
        expect(diagnostics.exhaustedLines).toEqual([0]);
        expect(diagnostics.badness).toEqual([Infinity]);
        expect(diagnostics.fitnessClasses).toEqual(["veryLoose"]);
        expect(diagnostics.totalDemerits).toBe(1e18);
    });

    it("quantizes chosen steps to the lattice; polish refines within the lattice cell", () => {
        // 4 words at 38pt (factor 0.4) need narrowing to exactly
        // −0.875; the K=10 lattice gives −0.9. The alternative
        // breaking [2|3] costs 12100+100 vs ≈6972+100, so [4|1] is
        // the optimum with or without polish.
        const input = makeInput([10, 10, 10, 10, 10], {
                lineWidth: 38,
                stepFactor: 0.4,
                breaksAfter: [1, 3],
            }),
            rough = compose(input, { polish: false }),
            polished = compose(input, { polish: true });
        expect(spans(rough.lines)).toEqual([
            [0, 8],
            [8, 9],
        ]);
        expect(rough.lines[0].adjustmentStep).toBe(-0.9); // lattice multiple
        expect(rough.lines[0].adjustmentStep * 10).toBe(-9);
        expect(spans(polished.lines)).toEqual(spans(rough.lines));
        expect(polished.lines[0].adjustmentStep).toBeGreaterThan(-0.9);
        expect(polished.lines[0].adjustmentStep).toBeLessThan(-0.8);
        expect(polished.lines[0].adjustmentStep).toBeCloseTo(-0.875, 3);
        // polish improves the reported fit quality (badness), not
        // the breaks; totalDemerits stays the DP's lattice value
        expect(polished.diagnostics.badness[0]).toBeLessThan(
            rough.diagnostics.badness[0],
        );
        expect(polished.diagnostics.totalDemerits).toBe(
            rough.diagnostics.totalDemerits,
        );
    });

    it("is a cooperative task: relaxation-round checkpoints, monotonic work, sync drain === async resume", async () => {
        const input = makeInput([10, 10, 10, 10], {
                lineWidth: 38,
                stepFactor: 0.2,
            }),
            collect = (task) => {
                const checkpoints = [];
                let r;
                do {
                    r = task.next();
                    if (!r.done) checkpoints.push(r.value);
                } while (!r.done);
                return { checkpoints, result: r.value };
            },
            { checkpoints, result } = collect(
                createKnuthPlassComposition()(input),
            );
        // sources: position 0 + the 3 break positions
        expect(checkpoints).toHaveLength(4);
        expect(checkpoints.every((c) => c.reason === "relaxation-round")).toBe(
            true,
        );
        const works = checkpoints.map((c) => c.work);
        expect([...works].sort((a, b) => a - b)).toEqual(works);
        expect(works[works.length - 1]).toBeGreaterThan(0);
        // sanity on the actual composition: [3|1], demerits 200
        expect(spans(result.lines)).toEqual([
            [0, 6],
            [6, 7],
        ]);
        expect(result.diagnostics.totalDemerits).toBe(200);
        // sync drain === manual drain === async resume
        expect(drainTaskSync(createKnuthPlassComposition()(input))).toEqual(
            result,
        );
        const asyncResult = await new Promise((resolve, reject) =>
            resumeTaskAsync(createKnuthPlassComposition()(input), {
                token: createCancellationToken(),
                onComplete: resolve,
                onError: reject,
            }),
        );
        expect(asyncResult).toEqual(result);
    });

    it("composes an empty paragraph to zero lines", () => {
        const { lines, diagnostics } = compose(makeInput([]));
        expect(lines).toEqual([]);
        expect(diagnostics.totalDemerits).toBe(0);
        expect(diagnostics.fitnessClasses).toEqual([]);
    });
});
