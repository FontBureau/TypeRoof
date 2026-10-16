/**
 * Milestone 5: Knuth–Plass++ — paragraph-wide optimum-fit composition
 * (the pure algorithm; Host wiring is the controller's concern).
 *
 * STRATEGY: least-demerits path over the break graph by dynamic
 * programming — TeX's line breaking adapted to the contract's
 * normalized, asymmetric adjustmentStep:
 *   - nodes: segment positions 0..segments.length (a line may START
 *     at any position right after a legal break);
 *   - edges: (from, to] line candidates ending at a legal break
 *     opportunity, plus the final edge to the paragraph end (the
 *     last line, breakAt null);
 *   - edge demerits: TeX's formula (linePenalty + badness)² +
 *     penalty², badness from the Host-injected badnessAtStep
 *     (fallback: the canonical 100·|step|³, Infinity beyond ±1 —
 *     the contract's documented convention);
 *   - DP state per node: best demerits PER FITNESS CLASS of the
 *     incoming line (4 slots). The finite class quantization makes
 *     path-dependent adjacency costs tractable;
 *   - additional TeX demerits: doubleHyphenDemerits when both the
 *     edge's break and the active node's incoming break are hyphens
 *     (a run of n hyphenated lines accumulates (n−1)×);
 *     finalHyphenDemerits when the penultimate line ends with a
 *     hyphen (charged when relaxing the final edge from a state
 *     whose incoming break is a hyphen); and — when balanceGray is
 *     on — adjDemerits for a fitness-class jump ≥ 2 between
 *     adjacent lines (TeX's \adjdemerits — "balance the gray").
 *   - Approximation note (TeX-faithful): each (node, class) slot
 *     collapses to its single best predecessor; the stored incoming
 *     break kind is that best path's. Global effects of a discarded
 *     predecessor's hyphenation are not reconsidered.
 *
 * THE STEP LATTICE: instead of solving the exact fitting step per
 * candidate (greedy-fit's ~24-iteration binary search per line),
 * candidate steps are quantized to a lattice of K steps per side
 * (config.latticeStepsPerSide; scalar or {narrowing, widening} — the
 * Host derives K adaptively per side, this module takes it as data).
 * Every novel step value costs the Host one HarfBuzz shape per
 * segment, so bounding candidates to ≤ 2K+1 distinct steps bounds
 * shaping cost and makes Host-side memoization effective. Chosen
 * step per edge (fitting width = candidate width at the step
 * EXCLUDING a trailing collapsing segment, the greedy-fit pattern;
 * the Host guarantees widths are monotonic in step by clamping
 * exhausted potentials — contract):
 *   - natural width overfull → the SMALLEST-|step| narrowing
 *     lattice step whose fitting width ≤ available (binary search);
 *   - natural fits (non-last line) → the LARGEST widening lattice
 *     step whose fitting width ≤ available: justified lines fill
 *     the measure, so a fitting line is set at the step that fills
 *     it and its badness reflects the widening that takes (TeX's
 *     stretch badness). Widening potential exhausted (width at +1
 *     still underfills) → step +1, badness = badnessAtStep(1);
 *   - the LAST LINE is never widened (contract; TeX \parfillskip):
 *     step 0 when it fits at natural width, else the smallest
 *     sufficient narrowing step;
 *   - no fitting lattice step → the edge is INFEASIBLE.
 *
 * INFEASIBLE EDGES / GUARANTEED PATH: an infeasible edge is not
 * removed but priced at INFEASIBLE_EDGE_DEMERITS (1e18 — beyond any
 * feasible paragraph's total: feasible edge demerits are bounded by
 * (linePenalty + 100)² + penalty² with penalty < prohibitedPenalty),
 * so a complete path ALWAYS exists and infeasible lines appear only
 * when no all-feasible path does. An infeasible line is emitted
 * with adjustmentStep −2 (|step| > 1 = potential exhausted,
 * contract) and reported in overfullLines + exhaustedLines with
 * badness Infinity.
 *
 * PROHIBITED AND FORCED BREAKS (contract penalty semantics): a
 * break with penalty ≥ prohibitedPenalty (default 1_000_000) is
 * skipped as an edge target (even when that forces infeasible lines
 * — the guaranteed path above). 'explicit' breaks force a line end:
 * no edge spans past an explicit break (target scanning stops
 * there, the explicit break itself included); the penalty of an
 * explicit break is ignored.
 *
 * TARGET-SCAN PRUNING (performance): Host width probes are O(span)
 * — evaluating every (source, target) edge would cost O(N^3)
 * segment measurements per paragraph. Within one source's scan the
 * fitting width is non-decreasing in the target position (segment
 * contributions are non-negative at a fixed step — TeX makes the
 * same assumption; a negative contribution would need tracking
 * exceeding the advance, pathological), so once an edge is
 * INFEASIBLE every later target is infeasible too. The scan then
 * emits only the first infeasible edge (the guaranteed-path escape)
 * plus the LAST target — the final edge / the mandatory explicit
 * break: a single exhausted line over the rest (1e18) strictly
 * beats any multi-edge exhausted route (>= 1e18 + one edge's
 * demerits), so no minimum path needs a pruned edge. The guard:
 * pruning engages only while the OBSERVED step-0 fitting widths
 * are monotonic non-decreasing (a dip disables it for the rest of
 * the scan).
 *
 * POLISH (config.polish, default on): after the DP, each chosen
 * line's lattice step is refined by a binary search (greedy-fit's
 * _SEARCH_ITERATIONS pattern) within its lattice cell
 * [step, step + 1/K] — the cell always brackets the exact fit: a
 * narrowing pick is the SMALLEST sufficient step (exact fit toward
 * 0), a widening pick the LARGEST fitting step (exact fit toward
 * +1). Skipped for: infeasible lines, the last line at step 0
 * (never widened), and step +1 (exact fit beyond potential,
 * unmeasurable — widths clamp). Polish improves the emitted fit;
 * per-line badness and fitness class are recomputed from the
 * polished step; totalDemerits stays the DP's lattice value
 * (documented as approximate — polish does not re-run the DP).
 *
 * CHECKPOINTS: the algorithm is a CompositionTask generator: after
 * each source position's relaxation round it yields
 * {reason: "relaxation-round", work: edgesProcessed} (cumulative
 * slot×edge relaxations — monotonic), so the runner's workBudget
 * becomes meaningful on long paragraphs. Sync drain and async
 * resume behave identically (composition-task protocol); the
 * generator never publishes anything itself.
 *
 * TIE-BREAKING (determinism): relaxation writes a slot only on
 * STRICTLY lower demerits; sources are processed in increasing
 * position, targets in increasing position, slots in class order,
 * and the final best slot is selected by strict < in class order —
 * exact ties resolve to the earliest break / lowest class slot.
 *
 * CONFIG (defaults from the Cycle-2 research decisions; all
 * overridable — the model-first struct fields in Phase 3 map
 * here): linePenalty 10, doubleHyphenDemerits 10000,
 * finalHyphenDemerits 5000, adjDemerits 10000, balanceGray true,
 * latticeStepsPerSide 10, polish true, prohibitedPenalty 1_000_000.
 * NOTE: hyphenPenalty is NOT part of this config — it arrives as
 * break.penalty on hyphen opportunities from the Host (Phase 3
 * plumbing); pure tests set it on the breaks directly.
 *
 * ASSUMPTION: lineWidthPt is read once at index 0 (constant
 * measure; per-line widths / shaped containers are documented
 * future work in the contract).
 *
 * PURITY: imports ONLY from composition-types.ts (contract rule for
 * algorithms). Runs in plain node (vitest) with injected fakes.
 *
 * DEV DIAGNOSTICS (Phase 4): set
 * `globalThis.__typeroofKPDevDiagnostics = true` (browser console;
 * NOT a model field, never serialized) to retain rejected-candidate
 * records in the result diagnostics: per chosen line the best
 * REJECTED alternative edge from the same source position with its
 * demerits margin to the chosen edge (diagnostics.rejectedCandidates),
 * plus target-scan counters (diagnostics.scanStats: evaluated /
 * infeasible edges, targets skipped by the scan pruning). Off by
 * default — the retention costs memory per evaluated edge and
 * serves diagnostics development only; the costs are the DP's
 * lattice values (polish does not re-run the DP).
 */
import type {
    BreakOpportunity,
    ComposedLine,
    CompositionAlgorithm,
    CompositionInput,
    CompositionResult,
    CompositionTask,
    FitnessClass,
    RejectedCandidate,
} from "./composition-types.ts";

export interface KnuthPlassConfig {
    /** TeX \linepenalty: added to every line's badness before
     *  squaring — biases toward fewer lines. Default 10. */
    linePenalty: number;
    /** TeX \doublehyphendemerits: two consecutive hyphenated lines.
     *  Default 10000. */
    doubleHyphenDemerits: number;
    /** TeX \finalhyphendemerits: penultimate line ends with a
     *  hyphen. Default 5000. */
    finalHyphenDemerits: number;
    /** TeX \adjdemerits: fitness-class jump ≥ 2 between adjacent
     *  lines (only when balanceGray). Default 10000. */
    adjDemerits: number;
    /** "Balance gray": charge adjDemerits for visually mismatched
     *  adjacent lines. Default true. */
    balanceGray: boolean;
    /** Lattice steps per side K (scalar or per-side). The Host
     *  computes K adaptively (K_side = clamp(ceil(ΔPt_side/q), 4,
     *  16)); the pure module takes it as data. Default 10. */
    latticeStepsPerSide: number | { narrowing: number; widening: number };
    /** Refine chosen lattice steps to the exact fitting step.
     *  Default true. */
    polish: boolean;
    /** penalty ≥ this = prohibited break (contract). Default
     *  1_000_000. */
    prohibitedPenalty: number;
    /** Gap-proportional extra demerits for a feasible line set at
     *  the WIDENING limit (step +1, potential exhausted): badness
     *  saturates at 100 there (TeX's cap), so without this the DP
     *  is blind to the SIZE of the remaining gap and may park all
     *  of a paragraph's looseness in one grossly underfull line.
     *  The gap is measured in EN of the paragraph's font size
     *  (enPt) — typographically meaningful, independent of the
     *  measure — and grows cubically, mirroring the badness curve
     *  100·|step|³: 1 EN bearable but not free, 2 EN costs 2³,
     *  3 EN is pure luxury, ~5 EN approaches prohibited territory
     *  (but never hard-bans — a fluid layout always needs a
     *  feasible path). extra = exhaustedGapDemerits · (gapPt/enPt)³.
     *  Default 1000. */
    exhaustedGapDemerits: number;
    /** EN width in pt — the gap unit for exhaustedGapDemerits.
     *  The Host resolves it from the paragraph's COMPUTED font
     *  size (base × relative) as fontSizePt/2, scaled by its
     *  exhaustedGapEnPercent UI knob (% of EN per gap unit,
     *  default 100, > 100 allowed — a larger unit prices gaps
     *  more tolerantly); the pure module takes it as data (like
     *  latticeStepsPerSide). Default 6 (a 12pt font, the Host's
     *  own fallback size). */
    enPt: number;
}

export const KNUTH_PLASS_DEFAULTS: KnuthPlassConfig = {
    linePenalty: 10,
    doubleHyphenDemerits: 10000,
    finalHyphenDemerits: 5000,
    adjDemerits: 10000,
    balanceGray: true,
    latticeStepsPerSide: 10,
    polish: true,
    prohibitedPenalty: 1_000_000,
    exhaustedGapDemerits: 1000,
    enPt: 6,
};

/** Beyond any feasible paragraph's total demerits (see header). */
const INFEASIBLE_EDGE_DEMERITS = 1e18;
/** |step| > 1 signals an unsatisfiable line (contract); narrowing
 *  potential exhausted is always the infeasible case here (an
 *  underfull line always fits at some step ≤ +1). */
const _UNSATISFIABLE_STEP = -2;
// binary-search precision for the polish pass (greedy-fit pattern:
// 2^-24 of the step cell — far below any visible effect)
const _SEARCH_ITERATIONS = 24,
    // a polished step smaller than this is reported as 0
    _STEP_EPSILON = 1e-4;

const FITNESS_CLASSES: readonly FitnessClass[] = [
    "tight",
    "decent",
    "loose",
    "veryLoose",
];

/** Fitness class index from the SIGNED step (contract vocabulary):
 *  tight ≤ −0.5; decent (−0.5, 0.5]; loose (0.5, 1]; veryLoose
 *  |step| > 1. */
const classIndexOf = (step: number): number =>
    step < -1 || step > 1 ? 3 : step <= -0.5 ? 0 : step <= 0.5 ? 1 : 2;

/** The dev-diagnostics switch (see header, DEV DIAGNOSTICS): a
 *  non-UI global, NOT serialized — set
 *  `globalThis.__typeroofKPDevDiagnostics = true` in the console. */
export const kpDevDiagnosticsEnabled = (): boolean =>
    (globalThis as unknown as Record<string, unknown>)[
        "__typeroofKPDevDiagnostics"
    ] === true;

/** The contract's canonical badness when the Host injects none. */
const defaultBadnessAtStep = (step: number): number =>
    Math.abs(step) > 1 ? Infinity : 100 * Math.abs(step) ** 3;

/** Factory: the algorithm's configuration (Phase 3 resolves the
 *  dynamic struct's OrEmpty fields over these defaults). */
export function createKnuthPlassComposition(
    config?: Partial<KnuthPlassConfig>,
): CompositionAlgorithm {
    const cfg: KnuthPlassConfig = { ...KNUTH_PLASS_DEFAULTS, ...config },
        latticeStepsPerSide = cfg.latticeStepsPerSide,
        narrowingK =
            typeof latticeStepsPerSide === "number"
                ? latticeStepsPerSide
                : latticeStepsPerSide.narrowing,
        wideningK =
            typeof latticeStepsPerSide === "number"
                ? latticeStepsPerSide
                : latticeStepsPerSide.widening;
    return (input) => knuthPlassImpl(input, cfg, narrowingK, wideningK);
}

interface EdgeEvaluation {
    step: number;
    badness: number;
    feasible: boolean;
    naturalWidthPt: number;
    // step-0 fitting width — the pruning monotonicity guard
    fittingWidthPt: number;
    // gap-proportional extra demerits (widening-exhausted lines
    // only, see KnuthPlassConfig.exhaustedGapDemerits)
    extraDemerits?: number;
}

interface ChosenEdge {
    breakAt: BreakOpportunity | null;
    step: number;
    badness: number;
    feasible: boolean;
    naturalWidthPt: number;
}

interface Slot {
    demerits: number;
    /** Break kind that ENDED the incoming line: only hyphen-ness is
     *  tracked (double/final hyphen demerits); null = paragraph
     *  start (no incoming line: no adjacency/hyphen costs). */
    incomingKind: "hyphen" | "other" | null;
    predFrom: number;
    predSlot: number;
    edge: ChosenEdge | null;
}

interface NodeState {
    slots: (Slot | undefined)[];
}

function* knuthPlassImpl(
    input: CompositionInput,
    cfg: KnuthPlassConfig,
    narrowingK: number,
    wideningK: number,
): CompositionTask<CompositionResult> {
    const { segments, breaks, lineWidthPt, lineWidthAtStep } = input,
        badnessAtStep = input.badnessAtStep ?? defaultBadnessAtStep;
    if (segments.length === 0)
        return {
            lines: [],
            diagnostics: {
                overfullLines: [],
                badness: [],
                fitnessClasses: [],
                totalDemerits: 0,
                exhaustedLines: [],
                // dev diagnostics (header): present-but-empty, so
                // consumers can rely on the keys while the switch is
                // on
                ...(kpDevDiagnosticsEnabled()
                    ? {
                          rejectedCandidates: [],
                          scanStats: {
                              evaluatedEdges: 0,
                              infeasibleEdges: 0,
                              prunedTargets: 0,
                          },
                      }
                    : {}),
            },
        };
    // constant-measure assumption (see header)
    const available = lineWidthPt(0),
        // legal targets: sorted, without a break after the last
        // segment (the paragraph end is the final edge, breakAt null)
        sortedBreaks = breaks
            .filter(
                (b) =>
                    b.afterSegment >= 0 &&
                    b.afterSegment <= segments.length - 2,
            )
            .sort((a, b) => a.afterSegment - b.afterSegment),
        breakAfter = new Map<number, BreakOpportunity>(
            breaks.map((b) => [b.afterSegment, b]),
        ),
        collapsesOf = (end: number): boolean =>
            breakAfter.get(end - 1)?.collapses === true,
        // the fit test at a step: the candidate's width EXCLUDING a
        // trailing collapsing segment (measured at the same step)
        fittingWidth = (
            from: number,
            to: number,
            step: number,
            collapses: boolean,
        ): number =>
            lineWidthAtStep(from, to, step) -
            (collapses ? lineWidthAtStep(to - 1, to, step) : 0);

    // lattice edge evaluation (see header: smallest sufficient
    // narrowing / largest fitting widening / last line never widened)
    const evaluateEdge = (
        from: number,
        to: number,
        isLastLine: boolean,
    ): EdgeEvaluation => {
        const collapses = collapsesOf(to),
            naturalWidthPt = lineWidthAtStep(from, to, 0),
            w0 = fittingWidth(from, to, 0, collapses);
        if (w0 <= available && isLastLine)
            return {
                step: 0,
                badness: badnessAtStep(0),
                feasible: true,
                naturalWidthPt,
                fittingWidthPt: w0,
            };
        if (w0 > available) {
            // smallest-|step| narrowing lattice step that fits
            // (binary search; monotonicity per contract)
            if (fittingWidth(from, to, -1, collapses) > available)
                return {
                    step: _UNSATISFIABLE_STEP,
                    badness: Infinity,
                    feasible: false,
                    naturalWidthPt,
                    fittingWidthPt: w0,
                };
            let lo = 1,
                hi = narrowingK;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (
                    fittingWidth(from, to, -mid / narrowingK, collapses) <=
                    available
                )
                    hi = mid;
                else lo = mid + 1;
            }
            const step = -lo / narrowingK;
            return {
                step,
                badness: badnessAtStep(step),
                feasible: true,
                naturalWidthPt,
                fittingWidthPt: w0,
            };
        }
        // fits at natural: largest widening lattice step that still
        // fits (justified lines fill the measure)
        let lo = 0,
            hi = wideningK;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (fittingWidth(from, to, mid / wideningK, collapses) <= available)
                lo = mid;
            else hi = mid - 1;
        }
        const step = lo / wideningK;
        // Widening exhausted (step +1 and STILL underfull): badness
        // saturates at badnessAtStep(1) — charge gap-proportional
        // extra demerits so the DP prefers alternatives over a
        // grossly underfull line (see the config doc). The gap is
        // priced in EN of the paragraph's font size, cubic growth.
        return {
            step,
            badness: badnessAtStep(step),
            feasible: true,
            naturalWidthPt,
            fittingWidthPt: w0,
            ...(step === 1 && cfg.enPt > 0
                ? {
                      extraDemerits:
                          cfg.exhaustedGapDemerits *
                          ((available - fittingWidth(from, to, 1, collapses)) /
                              cfg.enPt) **
                              3,
                  }
                : {}),
        };
    };

    // --- DP: least-demerits path over (position, fitness class) ---
    const states: (NodeState | undefined)[] = new Array(segments.length + 1);
    states[0] = {
        slots: [
            {
                demerits: 0,
                incomingKind: null,
                predFrom: -1,
                predSlot: -1,
                edge: null,
            },
        ],
    };
    let edgesProcessed = 0,
        firstBreakIndex = 0;
    // Dev diagnostics (header): candidate retention + scan counters,
    // only while the dev switch is on.
    const devOn = kpDevDiagnosticsEnabled(),
        devCandidates = new Map<
            number,
            {
                to: number;
                breakAt: BreakOpportunity | null;
                cost: number;
            }[]
        >(),
        devScanStats = {
            evaluatedEdges: 0,
            infeasibleEdges: 0,
            prunedTargets: 0,
        };
    for (let from = 0; from < segments.length; from++) {
        const state = states[from];
        if (state === undefined) continue;
        while (
            firstBreakIndex < sortedBreaks.length &&
            sortedBreaks[firstBreakIndex]!.afterSegment < from
        )
            firstBreakIndex++;
        // targets in increasing position; scanning stops AFTER an
        // explicit break (no edge spans past it); the final edge is
        // only valid when no explicit break is ahead
        const targets: (BreakOpportunity | null)[] = [];
        let explicitSeen = false;
        for (let i = firstBreakIndex; i < sortedBreaks.length; i++) {
            const breakOpportunity = sortedBreaks[i]!;
            if (
                breakOpportunity.kind !== "explicit" &&
                breakOpportunity.penalty >= cfg.prohibitedPenalty
            )
                continue; // prohibited: skipped as an edge target
            targets.push(breakOpportunity);
            if (breakOpportunity.kind === "explicit") {
                explicitSeen = true;
                break;
            }
        }
        if (!explicitSeen) targets.push(null); // the final edge
        // Edge evaluations on demand, with target-scan pruning (see
        // header): once an edge is infeasible and the observed
        // fitting widths are monotonic non-decreasing, every later
        // target is infeasible too — yield the first infeasible edge
        // plus the LAST target (the final edge, or the mandatory
        // explicit break) and stop: Host width probes are O(span),
        // so scanning the full quadratic target range would cost
        // O(N^3) segment measurements per paragraph.
        const evaluateTargets = function* (): Generator<{
            breakAt: BreakOpportunity | null;
            evaluation: EdgeEvaluation;
        }> {
            let previousFittingWidth = -Infinity,
                monotonic = true;
            for (const breakAt of targets) {
                const to =
                        breakAt === null
                            ? segments.length
                            : breakAt.afterSegment + 1,
                    evaluation = evaluateEdge(from, to, breakAt === null);
                yield { breakAt, evaluation };
                if (evaluation.fittingWidthPt < previousFittingWidth)
                    monotonic = false;
                previousFittingWidth = evaluation.fittingWidthPt;
                if (!evaluation.feasible && monotonic) {
                    const last = targets[targets.length - 1]!;
                    if (last !== breakAt) {
                        const lastTo =
                            last === null
                                ? segments.length
                                : last.afterSegment + 1;
                        yield {
                            breakAt: last,
                            evaluation: evaluateEdge(
                                from,
                                lastTo,
                                last === null,
                            ),
                        };
                    }
                    return;
                }
            }
        };
        let devEmitted = 0;
        for (const { breakAt, evaluation } of evaluateTargets()) {
            const to =
                    breakAt === null
                        ? segments.length
                        : breakAt.afterSegment + 1,
                edgeClass = classIndexOf(evaluation.step);
            let devMinCost = Infinity;
            for (let si = 0; si < state.slots.length; si++) {
                const slot = state.slots[si];
                if (slot === undefined) continue;
                edgesProcessed++;
                let cost: number;
                if (!evaluation.feasible)
                    cost = slot.demerits + INFEASIBLE_EDGE_DEMERITS;
                else {
                    const penalty =
                        breakAt === null || breakAt.kind === "explicit"
                            ? 0
                            : breakAt.penalty;
                    cost =
                        slot.demerits +
                        (cfg.linePenalty + evaluation.badness) ** 2 +
                        penalty ** 2 +
                        (evaluation.extraDemerits ?? 0);
                    if (
                        cfg.balanceGray &&
                        slot.incomingKind !== null &&
                        Math.abs(si - edgeClass) >= 2
                    )
                        cost += cfg.adjDemerits;
                    if (
                        breakAt?.kind === "hyphen" &&
                        slot.incomingKind === "hyphen"
                    )
                        cost += cfg.doubleHyphenDemerits;
                    if (breakAt === null && slot.incomingKind === "hyphen")
                        cost += cfg.finalHyphenDemerits;
                }
                const toState = (states[to] ??= {
                        slots: [undefined, undefined, undefined, undefined],
                    }),
                    existing = toState.slots[edgeClass];
                // strict <: ties keep the earliest break / lowest
                // slot (see header)
                if (existing === undefined || cost < existing.demerits)
                    toState.slots[edgeClass] = {
                        demerits: cost,
                        incomingKind:
                            breakAt?.kind === "hyphen" ? "hyphen" : "other",
                        predFrom: from,
                        predSlot: si,
                        edge: {
                            breakAt,
                            step: evaluation.step,
                            badness: evaluation.badness,
                            feasible: evaluation.feasible,
                            naturalWidthPt: evaluation.naturalWidthPt,
                        },
                    };
                if (devOn && cost < devMinCost) devMinCost = cost;
            }
            if (devOn) {
                devEmitted++;
                devScanStats.evaluatedEdges++;
                if (!evaluation.feasible) devScanStats.infeasibleEdges++;
                // a reachable state always has a slot; guard anyway
                if (devMinCost < Infinity) {
                    let list = devCandidates.get(from);
                    if (list === undefined)
                        devCandidates.set(from, (list = []));
                    list.push({ to, breakAt, cost: devMinCost });
                }
            }
        }
        // targets the monotonicity-guarded scan never evaluated
        if (devOn) devScanStats.prunedTargets += targets.length - devEmitted;
        yield { reason: "relaxation-round", work: edgesProcessed };
    }

    // --- best final slot (strict <: lowest class slot wins ties) ---
    const finalState = states[segments.length];
    let bestSlot = -1,
        totalDemerits = Infinity;
    for (let si = 0; si < 4; si++) {
        const slot = finalState?.slots[si];
        if (slot !== undefined && slot.demerits < totalDemerits) {
            totalDemerits = slot.demerits;
            bestSlot = si;
        }
    }

    // --- walk the predecessors back (a complete path always
    // exists: the final edge is a target from every position that
    // has no explicit break ahead) ---
    const chosen: { from: number; to: number; edge: ChosenEdge }[] = [];
    let position = segments.length,
        slotIndex = bestSlot;
    while (position > 0) {
        const slot = states[position]!.slots[slotIndex]!;
        chosen.push({ from: slot.predFrom, to: position, edge: slot.edge! });
        position = slot.predFrom;
        slotIndex = slot.predSlot;
    }
    chosen.reverse();

    // --- polish + emit (see header) ---
    const lines: ComposedLine[] = [],
        overfullLines: number[] = [],
        exhaustedLines: number[] = [],
        badness: number[] = [],
        fitnessClasses: FitnessClass[] = [];
    for (let lineIndex = 0; lineIndex < chosen.length; lineIndex++) {
        const { from, to, edge } = chosen[lineIndex]!,
            isLastLine = edge.breakAt === null,
            collapses = collapsesOf(to);
        let step = edge.step;
        if (
            cfg.polish &&
            edge.feasible &&
            step !== 1 &&
            !(isLastLine && step === 0)
        ) {
            // the lattice cell [step, step + 1/K] brackets the exact
            // fitting step (see header)
            const k = step < 0 ? narrowingK : wideningK;
            let lo = step,
                hi = step + 1 / k;
            for (let i = 0; i < _SEARCH_ITERATIONS; i++) {
                const mid = (lo + hi) / 2;
                if (fittingWidth(from, to, mid, collapses) <= available)
                    lo = mid;
                else hi = mid;
            }
            step = Math.abs(lo) < _STEP_EPSILON ? 0 : lo;
        }
        const lineBadness = edge.feasible ? badnessAtStep(step) : Infinity,
            overfull =
                !edge.feasible ||
                fittingWidth(
                    from,
                    to,
                    Math.max(-1, Math.min(1, step)),
                    collapses,
                ) > available;
        if (overfull) overfullLines.push(lineIndex);
        if (!edge.feasible) exhaustedLines.push(lineIndex);
        lines.push({
            fromSegment: from,
            toSegment: to,
            breakAt: edge.breakAt,
            naturalWidthPt: edge.naturalWidthPt,
            adjustmentStep: step,
        });
        badness.push(lineBadness);
        fitnessClasses.push(FITNESS_CLASSES[classIndexOf(step)]!);
    }

    // Dev diagnostics (header): per chosen line the best REJECTED
    // candidate edge from the same source position + its demerits
    // margin to the chosen edge (the DP's lattice costs; polish does
    // not re-run the DP).
    let rejectedCandidates: RejectedCandidate[] | undefined;
    if (devOn) {
        rejectedCandidates = [];
        for (let lineIndex = 0; lineIndex < chosen.length; lineIndex++) {
            const { from, to } = chosen[lineIndex]!,
                candidates = devCandidates.get(from) ?? [],
                chosenCost = candidates.find(
                    (candidate) => candidate.to === to,
                )?.cost;
            let runnerUp: (typeof candidates)[number] | null = null;
            for (const candidate of candidates) {
                if (candidate.to === to) continue;
                if (runnerUp === null || candidate.cost < runnerUp.cost)
                    runnerUp = candidate;
            }
            if (runnerUp === null || chosenCost === undefined) continue;
            rejectedCandidates.push({
                lineIndex,
                to: runnerUp.to,
                breakAt: runnerUp.breakAt,
                cost: runnerUp.cost,
                margin: runnerUp.cost - chosenCost,
            });
        }
    }

    return {
        lines,
        diagnostics: {
            overfullLines,
            badness,
            fitnessClasses,
            totalDemerits,
            exhaustedLines,
            // keys absent unless the dev switch is on (see header)
            ...(devOn && rejectedCandidates !== undefined
                ? { rejectedCandidates, scanStats: devScanStats }
                : {}),
        },
    };
}
