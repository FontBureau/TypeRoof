/**
 * The task of text composition is divided into two sides of a contract
 * (composition-types.ts; algorithms import only from that module):
 *
 *   - the Host: everything environment-facing (text, fonts, locale,
 *     DOM, time). Host roles are pure where possible; only the
 *     Applicator and the Controller are truly impure.
 *   - the Algorithm: pure composition (CompositionInput -> CompositionResult)
 *
 * Roles within the Host (coordinated by this controller):
 *
 *   - Segmenter (pure pass): paragraph {text, styleSpans} -> segments
 *     + break opportunities; splits at style boundaries and UAX#14
 *     break points.
 *   - Hyphenator (pure pass, pluggable per language): adds segments
 *     and break points inside words; a hyphenated segment includes the
 *     hyphen glyph in its measured width, so algorithms stay ignorant
 *     of hyphenation. Enabled/disabled as a Host control PRIOR to line
 *     breaking/fitting — it changes the input, not the algorithm.
 *   - Measurer (stateful but deterministic): HarfBuzz shaping and
 *     advance caching in font units (em — size independent, so caches
 *     keyed by (text, font, axes location) stay valid across sizes;
 *     pt conversion at the contract boundary is a pure scaling by
 *     fontSizePt / unitsPerEm); backs all width numbers including the
 *     injected lineWidthAtStep.
 *   - Treatment Planner (pure logic over configuration): derives
 *     per-candidate stepRange and the step->width mapping from the
 *     per-font-location treatment tables, relative to the font's
 *     current axis location. The Measurer turns its output into the
 *     injected width functions.
 *   - Applicator (impure): applies CompositionResult to the DOM —
 *     span-based CSS (the varla-varfo --line-adjust-step pattern):
 *     lines are wrapped in spans and adjustment is set via CSS custom
 *     properties. This leaves the semantics of the document intact
 *     and makes undo a matter of removing the spans. Also resets the
 *     output rendering.
 *   - Controller (this file): lifecycle (start, stop, pause, resume),
 *     dirty-range tracking (on edit, recompose from the first changed
 *     paragraph until breaks re-synchronize, not the whole document),
 *     orchestration of the passes above, algorithm selection.
 *
 * Roles within an Algorithm (compositional, both pure):
 *
 *   - Breaker: chooses break points (strategy varies per algorithm).
 *   - Fitter: given a line candidate, chooses adjustmentStep within
 *     stepRange using lineWidthAtStep. Shared between algorithms.
 *
 * Algorithm milestones (dynamic choice of algorithm is a goal):
 *
 *   1. dummy — proves the infrastructure calling the algorithm works.
 *   2. simple greedy alignment — ragged, greedy line breaking.
 *   3. greedy ragged + hyphenation — same algorithm as 2, richer
 *      input (hyphenation is a Host control, not an algorithm).
 *   4. greedy-fit — the varla-varfo strategy, predictively: greedy
 *      break at natural width; narrow until one more segment fits
 *      (minimal narrowing step); if narrowing pulls nothing up, widen
 *      to fill or leave at max potential. Must remain possible — it
 *      exercises every injected function — but it is a validation
 *      milestone, not the goal.
 *   5. Knuth-Plass++ — the actual target: paragraph-wide optimization
 *      with penalties (already in BreakOpportunity) and badness over
 *      adjustmentStep relative to stepRange as the glue model (one
 *      continuous dimension sequencing axes first, then spacing).
 */
