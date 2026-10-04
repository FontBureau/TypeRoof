/**
 * The Treatment Planner (milestone 4, phase 2 — pure value math):
 * turns a resolved potentials leaf + a normalized per-line step
 * into concrete treatment VALUES.
 *
 * Per the contract (composition-types.ts): steps are normalized
 * (0 = natural, -1 = max narrowing, +1 = max widening, the two
 * directions NOT symmetric). One step drives ALL enabled treatments
 * in parallel (the varla-varfo semantics), each mapped per side:
 *
 *     value(step) = dflt + step * (dflt - min)   for step < 0
 *                 = dflt + step * (max - dflt)   for step >= 0
 *
 * Units (see justification-potentials.ts): axis treatments are
 * absolute axis values; tracking is ABSOLUTE pt letter-spacing per
 * glyph (keyed by the opsz-declared optical size — no rescaling by
 * the run's actual font size); wordspace is a FACTOR of the natural
 * space advance (0 = natural).
 *
 * The MEASUREMENT at these values is the controller's job (it owns
 * the Measurer): axes treatments are re-shaped at the shifted
 * coords, tracking/wordspace are arithmetic deltas.
 */
import type {
    PotentialsLeaf,
    TreatmentTriple,
} from "./justification-potentials.ts";

export interface TreatmentPlannerConfig {
    /** Enabled treatment names (e.g. "XTRA", "tracking", "wordspace"). */
    treatments: ReadonlySet<string>;
    /** Direction gating: steps on the disallowed side are 0. */
    direction: "both" | "narrowing" | "widening";
}

export const TREATMENT_PLANNER_DEFAULTS: TreatmentPlannerConfig = {
    treatments: new Set(["XTRA", "tracking", "wordspace"]),
    direction: "both",
};

/** Per-side linear map: step -1 -> min, 0 -> dflt, +1 -> max. */
export const treatmentValueAt = (
    [min, dflt, max]: TreatmentTriple,
    step: number,
): number =>
    step < 0 ? dflt + step * (dflt - min) : dflt + step * (max - dflt);

export interface TreatmentStepper {
    /** Absolute axis VALUES for the treated axes at step (empty when
     *  no axis treatments are enabled). */
    axesAt(step: number): Map<string, number>;
    /** Letter-spacing in pt per glyph at step (0 when disabled). */
    letterSpacingPtAt(step: number): number;
    /** Word-space factor at step — multiplies the natural space
     *  advance (0 = natural, also when disabled). */
    wordSpaceFactorAt(step: number): number;
    /** The enabled axis treatments present in the potentials. */
    readonly axisTreatments: readonly string[];
}

const _isAxisTreatment = (treatment: string): boolean => treatment.length === 4;

/** One-shot value computation at a step (the applicator derives
 *  per-line treatment values from a line's adjustmentStep + the
 *  published potentials — deterministic, so every fragment of a
 *  line applies identical values for its own style). */
export function treatmentValuesAtStep(
    potentials: PotentialsLeaf,
    config: TreatmentPlannerConfig,
    step: number,
): {
    axes: Map<string, number>;
    letterSpacingPt: number;
    wordSpaceFactor: number;
} {
    const stepper = createTreatmentStepper(potentials, config);
    return {
        axes: stepper.axesAt(step),
        letterSpacingPt: stepper.letterSpacingPtAt(step),
        wordSpaceFactor: stepper.wordSpaceFactorAt(step),
    };
}

export function createTreatmentStepper(
    potentials: PotentialsLeaf,
    config: TreatmentPlannerConfig = TREATMENT_PLANNER_DEFAULTS,
): TreatmentStepper {
    // direction gating (the disallowed side collapses to 0) and
    // clamping to [-1, 1]: |step| > 1 signals "potential exhausted"
    // (contract) — the applied values clamp at the extremes
    const gated = (step: number): number => {
            if (config.direction === "narrowing" && step > 0) return 0;
            if (config.direction === "widening" && step < 0) return 0;
            return Math.max(-1, Math.min(1, step));
        },
        axisTreatments = Object.keys(potentials).filter(
            (treatment) =>
                _isAxisTreatment(treatment) && config.treatments.has(treatment),
        ),
        trackingEnabled =
            config.treatments.has("tracking") && "tracking" in potentials,
        wordspaceEnabled =
            config.treatments.has("wordspace") && "wordspace" in potentials;
    return {
        axisTreatments,
        axesAt(step: number): Map<string, number> {
            const gatedStep = gated(step),
                result = new Map<string, number>();
            for (const axis of axisTreatments)
                result.set(
                    axis,
                    treatmentValueAt(potentials[axis]!, gatedStep),
                );
            return result;
        },
        letterSpacingPtAt(step: number): number {
            return trackingEnabled
                ? treatmentValueAt(potentials.tracking!, gated(step))
                : 0;
        },
        wordSpaceFactorAt(step: number): number {
            return wordspaceEnabled
                ? treatmentValueAt(potentials.wordspace!, gated(step))
                : 0;
        },
    };
}
