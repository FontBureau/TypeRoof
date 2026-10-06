/**
 * The Hyphenator (pure Host pass, milestone 3 phase 4): splits word
 * segments at Knuth-Liang hyphenation points (hypher), per the
 * contract (composition-types.ts):
 *   - runs PRIOR to measurement/line breaking — it changes the
 *     input, not the algorithm (the Algorithm can't tell a word
 *     boundary from a hyphen point);
 *   - each split produces sub-segments; between them a 'hyphen'
 *     break opportunity (penalty HYPHENATION_PENALTY, collapses
 *     false) — the penalty is a parameter (milestone 5: the
 *     Knuth-Plass struct's hyphenPenalty resolves controller-side,
 *     default 50; other algorithms keep HYPHENATION_PENALTY);
 *   - the segment BEFORE a hyphen break is flagged `hyphenAfter`:
 *     the controller uses the marker/break map to add the hyphen
 *     glyph ONLY when a line candidate actually ENDS at that break
 *     (internal optional hyphens have no glyph/width; CSS ::after
 *     renders the taken end hyphen — selection/copy stay clean);
 *   - gates: word length >= minWordLength, points keep >= minBefore
 *     before and >= minAfter after.
 */
import type HypherType from "hypher";
import type { BreakOpportunity } from "./composition-types.ts";
import type { HostSegment } from "./segmenter.ts";
import {
    HYPHENATION_PATTERN_KEYS,
    HYPHENATION_PATTERN_ALIASES,
} from "./hyphenation-pattern-catalog.mjs";

export const HYPHENATION_PENALTY = 10;

export interface HyphenationConfig {
    minWordLength: number;
    minBefore: number;
    minAfter: number;
}

export const HYPHENATION_DEFAULTS: HyphenationConfig = {
    minWordLength: 6,
    minBefore: 2,
    minAfter: 3,
};

/** BCP47 language -> vendored hyphenation pattern key
 *  (lib/assets/hyphenation/<key>.json), with fallbacks
 *  (de-at -> de; en -> en-us). Unknown languages yield null (no
 *  hyphenation for them). Host policy shared by the layout (derives
 *  the pattern keys to load, index.typeroof.jsx) and the controller
 *  (resolves the installed pattern per textblock). */
const _HYPHENATION_PATTERNS = new Map<string, string>([
    ...HYPHENATION_PATTERN_KEYS.map((key): [string, string] => [key, key]),
    ...Object.entries(HYPHENATION_PATTERN_ALIASES),
]);

export function languageToHyphenationPatternKey(
    language: string,
): string | null {
    const lower = language.toLowerCase();
    if (_HYPHENATION_PATTERNS.has(lower))
        return _HYPHENATION_PATTERNS.get(lower)!;
    // regional variant fallback: de-at -> de etc.
    const primary = lower.split("-")[0]!;
    if (primary === "en") {
        // English DEFAULT is en-us (the de-facto software default;
        // browsers hyphenate lang=en with US patterns).
        // DECISION (noted): Commonwealth regional variants
        // (en-gb/-au/-nz/-ie/-za...) hyphenate British-style —
        // opinionated but defensible; everything else US.
        const COMMONWEALTH = new Set(["gb", "au", "nz", "ie", "za"]);
        return COMMONWEALTH.has(lower.split("-")[1] ?? "") ? "en-gb" : "en-us";
    }
    return _HYPHENATION_PATTERNS.get(primary) ?? null;
}

export function hyphenateSegments(
    segments: HostSegment[],
    breaks: BreakOpportunity[],
    leafTexts: string[],
    hypher: HypherType,
    config: HyphenationConfig,
    // the penalty stamped on the generated 'hyphen' break
    // opportunities (a Host knob — the algorithm reads break.penalty)
    penalty: number = HYPHENATION_PENALTY,
): { segments: HostSegment[]; breaks: BreakOpportunity[] } {
    const outSegments: HostSegment[] = [],
        outBreaks: BreakOpportunity[] = [],
        breakAfterOld = new Map(breaks.map((b) => [b.afterSegment, b]));

    for (let oldIndex = 0; oldIndex < segments.length; oldIndex++) {
        const segment = segments[oldIndex]!,
            text =
                leafTexts[segment.sourceIndex]?.slice(
                    segment.start,
                    segment.end,
                ) ?? "",
            // only plain words: no spaces, no atoms (start === end)
            isWord = segment.end > segment.start && !/[\s]/.test(text),
            points: number[] = [];
        if (isWord && text.length >= config.minWordLength) {
            const parts = hypher.hyphenate(text);
            let offset = 0;
            for (let i = 0; i < parts.length - 1; i++) {
                offset += parts[i]!.length;
                if (
                    offset >= config.minBefore &&
                    text.length - offset >= config.minAfter
                )
                    points.push(offset);
            }
        }
        if (points.length === 0) {
            outSegments.push(segment);
            const oldBreak = breakAfterOld.get(oldIndex);
            if (oldBreak !== undefined)
                outBreaks.push({
                    ...oldBreak,
                    afterSegment: outSegments.length - 1,
                });
            continue;
        }
        // split into sub-segments at the points
        let partStart = segment.start;
        for (const point of points) {
            outSegments.push({
                ...segment,
                start: partStart,
                end: segment.start + point,
                hyphenAfter: true,
            });
            outBreaks.push({
                afterSegment: outSegments.length - 1,
                kind: "hyphen",
                penalty,
                collapses: false,
            });
            partStart = segment.start + point;
        }
        outSegments.push({ ...segment, start: partStart });
        const oldBreak = breakAfterOld.get(oldIndex);
        if (oldBreak !== undefined)
            outBreaks.push({
                ...oldBreak,
                afterSegment: outSegments.length - 1,
            });
    }
    return { segments: outSegments, breaks: outBreaks };
}
