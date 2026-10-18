/**
 * Line-fragment presentation math for text-composition applicators.
 *
 * Pure and DOM-free: computes, for one (line × leaf) fragment of a
 * CompositionResult, the CSS classes and style properties that render
 * it — the single source for BOTH applicators:
 *
 *   - the viewer (viewer.typeroof.jsx, builds real spans), from which
 *     this module was extracted (milestone 4/5 logic, behavior-
 *     preserving), and
 *   - the ProseMirror editor applicator (Decoration.inline attrs;
 *     plan thoughts/plans/2026-10-07-1223-prosemirror-composition-
 *     decorations.md).
 *
 * The CSS these values drive lives in line-spans.css: forced line
 * breaks via ::before{display:block} on line-first spans, the hyphen
 * ::after, the treatment custom properties, and the diagnostics
 * color-code hook.
 *
 * FRAGMENT RULE (both applicators): every fragment of a line applies
 * IDENTICAL treatment values (derived from the line's adjustmentStep
 * and the leaf's own potentials), but the structural classes are
 * positional — `line-first` only on the line's FIRST fragment,
 * `line-hyphen` only on its LAST. The PM applicator additionally must
 * honor this because PM splits inline decorations at text-node/mark
 * boundaries and copies the attrs onto each piece.
 */
import {
    treatmentValuesAtStep,
    type TreatmentPlannerConfig,
} from "./treatment-planner.ts";
import type { PotentialsLeaf } from "./justification-potentials.ts";
import type { FitnessClass } from "./composition-types.ts";

/** The per-leaf treatment data as published in the composition
 *  payload (composition-controller.ts:1577-1586): the run's resolved
 *  potentials, its natural space advance, and its own axes location
 *  (entries the treated axes override per line). */
export interface CompositionLeafTreatment {
    potentials: PotentialsLeaf;
    spaceAdvancePt: number;
    axesEntries: [string, number][];
}

/** CSS classes for one line-fragment span. `isParagraphFirstLine` is
 *  only honored when `isLineStart` (viewer semantics: paragraph-first
 *  unsets the forced break to keep text-indent). */
/**
 * The sourceIndex of the line's first RENDERED leaf. A line can START
 * at zero-width segments — inline atoms push one segment each
 * (`segmenter.ts`, start === end === 0) — whose leaves render no
 * fragment. The line-start marker (`line-first`, the forced break)
 * must land on the first leaf that actually renders, or the visual
 * line start is lost entirely (the fragment glues onto the previous
 * rendered line). Caller bounds: `line.fromSegment <= i <
 * line.toSegment` (the composition contract).
 */
export function lineStartSourceIndex(
    segments: readonly {
        sourceIndex: number;
        start: number;
        end: number;
    }[],
    line: { fromSegment: number; toSegment: number },
): number {
    let i = line.fromSegment;
    while (
        i < line.toSegment - 1 &&
        segments[i]!.end - segments[i]!.start === 0
    )
        i++;
    return segments[i]!.sourceIndex;
}

/**
 * The sourceIndex of the line's last RENDERED leaf — symmetric to
 * lineStartSourceIndex: trailing zero-width atom segments would steal
 * the `line-hyphen` marker (the hyphen ::after) for a leaf that
 * renders no fragment, losing the rendered hyphen glyph.
 */
export function lineEndSourceIndex(
    segments: readonly {
        sourceIndex: number;
        start: number;
        end: number;
    }[],
    line: { fromSegment: number; toSegment: number },
): number {
    let i = line.toSegment - 1;
    while (i > line.fromSegment && segments[i]!.end - segments[i]!.start === 0)
        i--;
    return segments[i]!.sourceIndex;
}

export function lineSpanClasses(opts: {
    isLineStart: boolean;
    isParagraphFirstLine: boolean;
    isHyphenBreak: boolean;
}): string[] {
    const classes = ["typeroof-composition-line"];
    if (opts.isLineStart) {
        classes.push("typeroof-composition-line-first");
        if (opts.isParagraphFirstLine)
            classes.push("typeroof-composition-paragraph-first-line");
    }
    if (opts.isHyphenBreak) classes.push("typeroof-composition-line-hyphen");
    return classes;
}

/** Potentials diagnostics palette (varla-varfo _setLineColorCode,
 *  adapted to normalized steps): "what did the line do physically" —
 *  negative (narrowing) cyan, positive (widening) red, 0 none;
 *  overfull overrides. Intensity relative to the normalized range
 *  [-1, 1]. */
export function potentialsLineColorCode(
    adjustmentStep: number,
    overfull: boolean,
): string {
    if (overfull) return "hsl(0, 80%, 85%)";
    if (adjustmentStep < 0) {
        const intensity = Math.min(1, Math.abs(adjustmentStep));
        return `hsl(180, 80%, ${30 + 70 * (1 - intensity)}%)`;
    }
    if (adjustmentStep > 0) {
        const intensity = Math.min(1, adjustmentStep);
        return `hsl(0, 100%, ${30 + 70 * (1 - intensity)}%)`;
    }
    return "";
}

/** KP diagnostics palette: "why did the DP choose this line", where
 *  the potentials palette answers "what did the line do physically".
 *  Deliberately a DIFFERENT visual vocabulary than the potentials
 *  cyan/red so the two are never confused: hue marks the fitness
 *  class, lightness encodes the per-line badness (0 -> 88%,
 *  >=100 -> 55%); overfull/exhausted lines get the alarming
 *  deep-magenta treatment. */
export const KP_FITNESS_HUES: Readonly<Record<FitnessClass, number>> =
    Object.freeze({
        tight: 265,
        decent: 145,
        loose: 40,
        veryLoose: 320,
    });
export const KP_EXHAUSTED_CODE = "hsl(300, 100%, 35%)";

export interface LineColorDiagnostics {
    overfullLines: readonly number[];
    badness: readonly number[];
    fitnessClasses?: readonly FitnessClass[];
    exhaustedLines?: readonly number[];
}

export function kpLineColorCode(
    lineIndex: number,
    diagnostics: LineColorDiagnostics,
): string {
    if (
        diagnostics.exhaustedLines?.includes(lineIndex) ||
        diagnostics.overfullLines.includes(lineIndex)
    )
        return KP_EXHAUSTED_CODE;
    const hue =
            KP_FITNESS_HUES[
                diagnostics.fitnessClasses?.[lineIndex] ?? "decent"
            ],
        badness = Math.min(1, (diagnostics.badness[lineIndex] ?? 0) / 100);
    return `hsl(${hue}, 70%, ${Math.round(88 - 33 * badness)}%)`;
}

export interface LineSpanStyles {
    /** [property, value] pairs, in application order
     *  (--line-color-code always present, possibly empty). */
    styles: [string, string][];
    /** The span's data-tracking-gaps attribute value (viewer) /
     *  attr (PM decoration), or null when letter-spacing does not
     *  apply (tracking treatment off/zero or no gaps in this leaf). */
    dataTrackingGaps: number | null;
}

/** The payload's serialized treatment config: treatments is "all" or
 *  the enabled tag array (the controller sorts). Re-hydrate to the
 *  planner config shape — shared by the viewer and editor
 *  applicators (the editor bug: `new Set("all")` is the CHARACTER
 *  set {"a","l"}, silently disabling every treatment). */
export function treatmentConfigFromPayload(payloadConfig: {
    treatments: "all" | string[];
    direction: TreatmentPlannerConfig["direction"];
}): TreatmentPlannerConfig {
    return {
        treatments:
            payloadConfig.treatments === "all"
                ? "all"
                : new Set(payloadConfig.treatments),
        direction: payloadConfig.direction,
    };
}

/** Style properties for one line-fragment span. Encapsulates the
 *  skip rules: nothing but the color code when `treatment` is null;
 *  step 0 is EXPLICITLY written (the axes override at the anchored
 *  dflt — the identity idea is removed); letter-spacing only when it
 *  is nonzero AND the line actually has tracking gaps in this leaf;
 *  word-spacing is the factor times the leaf's natural space advance;
 *  the axes override merges treated tags at their step values into
 *  the run's own axes location. */
export function lineSpanStyles(opts: {
    treatment: CompositionLeafTreatment | null;
    treatmentConfig: TreatmentPlannerConfig;
    adjustmentStep: number;
    trackingGaps: number;
    colorCode: string;
    /** underfullTreatment revert (milestone 6): the concrete axes
     *  entries the line renders at (the Host resolved underfullRevert
     *  to the run's location or the font's fvar defaults). When set,
     *  the fvs override carries these verbatim — no stepper merge —
     *  and the spacing treatments are skipped (the line sits at the
     *  revert location, unadjusted). */
    revertAxesEntries?: [string, number][] | null;
}): LineSpanStyles {
    const styles: [string, string][] = [];
    let dataTrackingGaps: number | null = null;
    const { treatment } = opts;
    // underfull revert: the line renders at the resolved location
    // verbatim (status quo for "off" — no revert, never set)
    if (treatment !== null && opts.revertAxesEntries != null) {
        styles.push([
            "font-variation-settings",
            opts.revertAxesEntries
                .map(([tag, value]) => `"${tag}" ${value}`)
                .join(","),
        ]);
        styles.push(["--line-color-code", opts.colorCode]);
        return { styles, dataTrackingGaps };
    }
    // step 0 is EXPLICITLY written (milestone 6: the identity idea
    // is removed): the axes override always carries the anchored
    // dflt values (the potentialsAnchoring mode's choice). The
    // underfullTreatment revert (revertAxesEntries) short-circuits
    // above. Tracking/wordspace emit nothing at step 0 anyway
    // (their dflts are 0).
    if (treatment !== null) {
        const { axes, letterSpacingPt, wordSpaceFactor } =
            treatmentValuesAtStep(
                treatment.potentials,
                opts.treatmentConfig,
                opts.adjustmentStep,
            );
        if (letterSpacingPt !== 0 && opts.trackingGaps > 0) {
            styles.push(["--line-letter-spacing", `${letterSpacingPt}pt`]);
            dataTrackingGaps = opts.trackingGaps;
        }
        if (wordSpaceFactor !== 0)
            styles.push([
                "--line-word-spacing",
                `${wordSpaceFactor * treatment.spaceAdvancePt}pt`,
            ]);
        if (axes.size > 0)
            // The run's own axes location with the treated axes at
            // their step values (overrides the inherited
            // font-variation-settings on this span only).
            styles.push([
                "font-variation-settings",
                treatment.axesEntries
                    .map(
                        ([tag, value]) =>
                            `"${tag}" ${axes.has(tag) ? axes.get(tag) : value}`,
                    )
                    .join(","),
            ]);
    }
    styles.push(["--line-color-code", opts.colorCode]);
    return { styles, dataTrackingGaps };
}
