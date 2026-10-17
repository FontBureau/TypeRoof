---
date: 2026-10-06T09:06:50+02:00
git_commit: 3391e6530b5715e96ad6fd9c6c00cbaa769b330c
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Cycle 2: Knuth–Plass++ research/design prerequisites"
tags: [research, codebase, text-composition, knuth-plass, milestone-5]
status: complete
---

# Research: Cycle 2 — Knuth–Plass++ codebase map

## Research Question

Map the codebase as it exists today for ROADMAP Cycle 2 (milestone 5
research/design: Knuth–Plass++): candidate graph/DP, badness/demerits
over the asymmetric adjustmentStep, break penalties, candidate step
solving via `lineWidthAtStep`, diagnostics, and performance
(memoization/pruning, cooperative checkpoints).

## Summary

The Cycle-1 work left the codebase unusually ready for KP++:

- The contract (`composition-types.ts`) already carries
  `BreakOpportunity.penalty` (populated by the hyphenator, unread by
  all algorithms), a fully general `lineWidthAtStep(from, to, step)`
  probe, an extensible break `kind` enum, and a free-form
  `diagnostics.badness` slot. No contract change is strictly required
  for a first DP implementation.
- All Host machinery (UAX#14 segmentation, Knuth–Liang hyphenation,
  HarfBuzz measurement with shaped-glyph metrics, Treatment Planner,
  tracking-gap arithmetic) is algorithm-agnostic and reusable as-is.
- The cooperative task runner already supports weighted checkpoints
  (`CompositionCheckpoint.work`, `workBudget`) — declared but unused;
  the single un-interruptible unit is the synchronous algorithm call
  at `composition-controller.ts:1178`.
- Prior art contains NO Knuth-Plass code: varla-varfo is greedy-fit
  with a render-measure-render loop; videoproof-contextual is plain
  greedy first-fit. Badness/demerits/fitness classes must be designed
  from the TeX model, not ported.
- The main performance fact: `lineWidthAtStep` at step ≠ 0 costs one
  HarfBuzz shape per segment per *novel* treated axis location, and
  there is **no candidate-width memoization above the Measurer shape
  cache** — the DP's candidate-count × step-search multiplication
  makes memoization a first-order design concern.

## Detailed Findings

### Module map (`lib/js/components/layouts/type-stage/text-composition/`, 26 files, 5677 LOC)

| File | LOC | Role |
|---|---|---|
| `composition-types.ts` | 230 | Host/Algorithm contract: `CompositionInput → CompositionResult` |
| `composition-controller.ts` | 1412 | Host orchestrator (service widget); the impure edges |
| `composition-task.ts` | 98 | Cooperative task protocol (generator checkpoints) |
| `segmenter.ts` | 195 | UAX#14 segmentation (npm `linebreak`) |
| `hyphenator.ts` | 141 | Knuth–Liang hyphenation (npm `hypher`) |
| `hyphenation-pattern-catalog.mjs` | 66 | Vendored bramstein pattern catalog |
| `measurer.ts` | 236 | HarfBuzz shaping, em-normalized caches |
| `justification-potentials.ts` | 601 | Per-font potentials tables (Roboto Flex/Delta, Amstelvar) |
| `treatment-planner.ts` | 127 | Pure step → treatment value math |
| `tracking.ts` | 49 | Shaped-glyph tracking-gap arithmetic (Cycle 1) |
| `dummy-composition.ts` | 102 | Algorithm M1 (pure) |
| `greedy-ragged.ts` | 169 | Algorithm M2 (pure) |
| `greedy-fit.ts` | 293 | Algorithm M4 (pure) |
| tests (11 files) | 1823 | colocated pure/Host tests |

Pure algorithms import only from `composition-types.ts`; KP++ slots
in as a new pure module beside `greedy-fit.ts`.

### Contract anatomy (`composition-types.ts`)

- `Paragraph` (:71) = `{text, styles: StyleSpan[]}` — Host staging
  only; the Algorithm never sees it.
- `Segment` (:82) = `{start, end, widthPt}` — width at the natural
  axis location; `start/end` retained so diagnostics can name text
  (:85–86).
- `BreakOpportunity` (:98) = `{afterSegment, kind, penalty,
  collapses?}`; `kind: "space"|"hyphen"|"explicit"` (:108, enum
  documented extensible); `penalty` (:113–115) explicitly documented
  as the hook for "later Knuth-Plass penalties"; `collapses` marks
  trailing zero-width segments excluded from fit tests.
- `CompositionInput` (:134) = `{segments, breaks,
  lineWidthPt(lineIndex), lineWidthAtStep(from, to, step)}`.
  `lineWidthPt` is per-line-index (constant today; shaped containers
  anticipated). Monotonicity of `lineWidthAtStep` in step is assumed
  (greedy-fit's binary search relies on it).
- `ComposedLine` (:180) = `{fromSegment, toSegment, breakAt,
  naturalWidthPt, adjustmentStep}`.
- `CompositionResult` (:198) = `{lines, diagnostics:
  {overfullLines, badness}}` — badness is explicitly
  "algorithm-specific" (:205–207).
- `CompositionAlgorithm` (:228) = pure synchronous function.
  Mandatory-break rule and last-line rule (never widened, may narrow;
  TeX `\parfillskip`) are contractual (:211–227), not data-driven.

### adjustmentStep semantics

- Normalized: 0 natural, −1 max narrowing, +1 max widening
  (composition-types.ts:150–178).
- **Asymmetric**: each direction maps linearly against its own triple
  half (`treatment-planner.ts:44–49`); physical distances per side
  differ.
- `|step| > 1` = probe/exhausted: Host clamps widths at the extreme so
  the Algorithm detects impossible fits; a result line with
  `|step| > 1` signals unsatisfiable (greedy-fit emits −2,
  `greedy-fit.ts:260`).

### Break enumeration & penalties today

- UAX#14 (`segmenter.ts:97`): BK → `explicit`; allowed breaks →
  `space` (with `collapses:false` at ideograph boundaries, :84–89);
  real spaces → `space` + `collapses:true` (:136–144). All segmenter
  penalties are **0**.
- Hyphenation (`hyphenator.ts:73`): splits word segments (gates
  minWordLength 6 / minBefore 2 / minAfter 3, :33–37); every hyphen
  break gets the flat constant `HYPHENATION_PENALTY = 10` (:27,127).
  The hypher/Knuth–Liang digit weights are consumed internally by the
  library and **not exposed per point** — per-point weighting would
  need new plumbing.
- Conditional taken hyphen: not in segment width; added
  candidate-wise by the Host inside `lineWidthAtStep`
  (composition-controller.ts:1073–1077, 1144–1168) and rendered via
  CSS `::after`.
- Hard breaks split Host-side into separate logical paragraphs
  (`assembleLogicalParagraphs`, segmenter.ts:151); the algorithm runs
  once per logical paragraph (controller:1057ff).

### How greedy-fit solves steps (the incumbent strategy)

`greedy-fit.ts`: natural greedy pick (:81–124) → NARROW loop pulling
the next break's segments up at minimal narrowing step (:172–210) →
WIDEN only if narrowing pulled nothing (:211–237) → overfull rescue
(:238–260, emits −2). Last lines skipped (:170–171).

`findFittingStep` (:63–78): binary search, 24 iterations
(`_SEARCH_ITERATIONS`, :38), largest step whose `fittingWidth` fits;
`fittingWidth` (:53–61) may cost 2 `lineWidthAtStep` calls (collapse
subtraction) → up to ~48 calls per search, plus ±1/0 potential
probes (:144–148). `_STEP_EPSILON = 1e-4` (:40).

Diagnostics produced: `overfullLines` (:264–273), slack-based
`badness` (:280–283: `1 + excess/available` overfull, else
`max(0, slack/available)`; same formula in greedy-ragged :156–160).

### Measurement machinery & cost structure

- `lineWidthAtStep` Host implementation: composition-controller.ts
  :1188–1264. Step 0 = pure sum of pre-measured `segment.widthPt` +
  conditional hyphen width (:1189–1193). Step ≠ 0 = per segment:
  treated axis values via `stepper.axesAt(step)` (computed, but
  rebuilds entries array + `axesKeyOfEntries` string per call,
  :1132–1148) → `Measurer.shapeMetricsEm` re-shape at shifted
  coordinates (:1218–1226) → wordspace arithmetic (:1236–1246) →
  tracking collection + line-level `allocateTracking` (:1247–1254,
  tracking.ts:27–53).
- Measurer caches (measurer.ts): hbFont LRU
  `Map<fullName, Map<axesKey, Font>>` capped at 32 locations/font
  (:93,105,157); shape cache `Map<string, ShapeMetrics>` key =
  `fullName|axesKey|featuresKey|language|direction|text` (:175–182),
  LRU cap 50000 (:92). `ShapeMetrics = {advanceEm, glyphCount}` (Cycle
  1, :96–100) — one shape serves width + tracking; no cluster data.
- **No memoization of `lineWidthAtStep` results exists** — no
  `(from, to, step) → width` cache anywhere. Reuse happens only at
  the shape-cache level: repeated probes at identical treated
  locations hit; novel step values each pay one HarfBuzz shape per
  segment (plus hb.Font variation instance creation, bounded by the
  32-location LRU).
- Existing caches to build on: per-style planner cache
  (`plannerCache`, controller:947–986), hyphen width cache
  (:1078–1101), whole-composition ingredients identity filter
  (:990–1057).
- Acknowledged hotspot: greedy-fit's 24-iteration searches mostly
  miss the shape cache (distinct midpoints → distinct locations);
  header of measurer.ts (:8–30) notes string-key cost at scale.

### Cooperative task protocol & checkpoint slots

- `composition-task.ts`: `CompositionCheckpoint {reason, work?}`
  (:11–14, `work` declared-but-unused); `CompositionTask` =
  Generator (:20–24); cancellation token checked before/between
  resumes (:75–90); `drainTaskSync` (:53–63); `resumeTaskAsync` with
  `workBudget` (default 1 checkpoint/macrotask, :65–98); scheduler
  injectable, default `setTimeout(0)` — `requestIdleCallback`
  rejected for starvation (:44–51).
- Controller: staleness via immutable identity `===`
  (`_sourceIsCurrent`, :366–376, rationale :147–156); one task slot
  per textblock path (:306); sync drain and async resume share the
  same generator (:660–662).
- Existing checkpoints in `_composeTextblockTask`: `collect/resolve`
  (:693), per-logical-paragraph (:1311), `finalize/publish` (:1359).
- **The synchronous `algorithm({...})` call at controller:1178 is the
  single un-interruptible unit** — candidate-batch yields for KP++
  slot inside/around that invocation without touching runner,
  scheduler, or cancellation machinery. Contract anticipates
  async/streaming variants (composition-types.ts:211–215).

### Algorithm registration & diagnostics wiring

- Models: `type-spec/text-composition-models.mjs` —
  `TextCompositionAlgorithm{None,Dummy,GreedyRagged,GreedyFit}Model`
  via `createDynamicModel("TextCompositionAlgorithm", …)` (:77–102);
  mounted on TypeSpecModel (models.mjs:497); registered-property
  default inheritable (registered-properties.mjs:426–433); root
  default in layouts/type-stage/defaults.mjs:229–240; UI in
  type-driven-ui.mjs:444–447; property generator `textCompositionGen`
  (properties-generators.mjs:48–82).
- Runtime dispatch: controller:1171–1177 (`algorithmKey` read :773–
  775, default GreedyRagged; None → OFF gate :700–703). GreedyFit
  config: treatments set, direction gate, `colorCoding` (:905–942).
- Diagnostics pipeline: per-paragraph `result.diagnostics` ships in
  the payload (:1338); per-line enrichments `trackingWidthPt`,
  `trackingGapsBySourceIndex` (:1303–1308); per-leaf potentials for
  deterministic applicator re-derivation (:1324–1337);
  `colorCoding` flag (:1345–1347); publish-time console.log
  (:1375–1382).
- Viewer: `_lineColorCode(adjustmentStep, overfull)` (viewer.
  typeroof.jsx:739–748, varla-varfo port: cyan narrowing / red
  widening / overfull override), per-line `--line-color-code`
  (:845–856), CSS hook line-spans.css:40–48. **`badness` is published
  but currently unconsumed** — only `overfullLines` and
  `adjustmentStep` feed rendering.

### Prior art (no KP code exists)

- `varla-varfo/lib/js/justification.mjs` (sibling repo, 2189 LOC):
  greedy-fit only; zero matches for knuth/badness/demerit/fitness/
  graph. Render-measure-render feedback loop
  (`JustificationController` L1993–2189). Notable ideas: per-font
  spec tables with interpolation (L1033–1063), step-budget heuristic
  `narrowingStops = nAxes × (fontSizePT/12) × (columnWidthEN/65) × 10`
  (L1818–1831), widening via control loop driving unused whitespace
  to <1px (L782–794), inter-line harmonization seeding a line's
  initial step from previous lines (L1497–1508), line color coding
  (L1371–1385).
- `lib/js/components/actors/videoproof-contextual/layout.mjs` (322
  LOC): pure greedy first-fit (`computeLineStarts` L83–101), no
  adjustment; binary search over font size (L139–199); pure/impure
  split at HarfBuzz measurement (L43–67).
- Repo-wide grep: no `demerit`, `fitness class`, or `optimum fit`
  code anywhere (vendor license noise excluded). Design references
  exist only in docs/plans and the milestone-5 comment at
  composition-controller.ts:74–76.

### Contract gaps for a DP algorithm (design surface for Cycle 2)

Missing today (each a design decision, none blocking a first pass):

- No contract-level badness/demerits function — each algorithm
  invents its own slack-based badness for diagnostics only.
- No fitness classes (tight/decent/loose/very-loose); adjustmentStep
  is a continuous scalar.
- No consecutive-hyphen policy — hyphen breaks carry flat penalty 10;
  a DP must count `breakAt.kind === "hyphen"` runs itself.
- Penalty semantics unspecified: no infinite/negative penalty
  convention, no "never break here" representation (absence serves
  that role); penalty documented irrelevant for `explicit`.
- No tolerance/emergency configuration in `CompositionInput`;
  unsatisfiable lines signalled only post-hoc via `|step| > 1`.
- Last-line rule is contractual, not data — DP must special-case the
  final line (greedy-fit's `isLastLine` precedent).
- No output channel for per-line mechanism mix (step is one scalar;
  concrete values re-derived Host-side via `treatmentValuesAtStep`).

## Code References

- `lib/js/components/layouts/type-stage/text-composition/composition-types.ts:98-121` — BreakOpportunity (penalty hook)
- `…/composition-types.ts:134-178` — CompositionInput / lineWidthAtStep contract
- `…/composition-types.ts:198-230` — CompositionResult diagnostics, algorithm contract, last-line rule
- `…/composition-controller.ts:1171-1178` — algorithm dispatch + the un-interruptible sync call
- `…/composition-controller.ts:1188-1264` — Host lineWidthAtStep (measure vs compute split)
- `…/composition-controller.ts:905-986` — greedy-fit config + per-style planner cache
- `…/greedy-fit.ts:38-78` — 24-iteration binary step search
- `…/measurer.ts:92-182` — cache keys/caps, ShapeMetrics
- `…/treatment-planner.ts:44-99` — per-side linear step map, gating/clamping
- `…/composition-task.ts:11-98` — checkpoint/workBudget/cancellation protocol
- `…/hyphenator.ts:27,122-129` — flat HYPHENATION_PENALTY = 10
- `lib/js/components/type-spec/text-composition-models.mjs:77-102` — dynamic struct registration
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:739-748,845-856` — line color coding
- `/var/lib/agent/varla-varfo/lib/js/justification.mjs:1818-1831` — step-budget heuristic (prior art)

## Resolved Design Decisions (operator, 2026-10-06)

1. **Badness — Host-injected, TeX-shaped initially.** The contract
   gains `badnessAtStep(step)` next to `lineWidthAtStep`. The Host's
   first implementation is `100·|step|³` for `|step| ≤ 1`, infinite
   beyond (unsatisfiable). The asymmetry is absorbed by the per-side
   step normalization. Injection (not algorithm-internal) because it
   is the natural counterpart to future potentials-policy changes —
   e.g. stretching a line to completeness with wordspace after
   potential exhaustion must be reflectable in badness.
2. **Penalties — TeX demerits formula, non-negative domain with a
   prohibited threshold.** `demerits = (linePenalty + badness)² + p²`
   (p ≥ 0); `linePenalty` default 10, `hyphenPenalty` default 50
   (retuned from the arbitrary milestone-3 value 10). No negative
   sentinels: forced breaks = `kind: "explicit"`; prohibited breaks =
   enumeration-level suppression (segmenter, for `&nbsp;`/U+2060/
   non-breaking hyphen) OR a documented penalty threshold (≥ 1e6) the
   DP treats as infeasible; "hardly break here" = large finite
   penalty. **Algorithm configuration enters model-first** via the
   `textCompositionAlgorithm` dynamic struct → factory closure in the
   controller (GreedyFit precedent); the pure
   `CompositionInput → CompositionResult` shape is untouched.
3. **Consecutive hyphens — TeX-faithful costs.** `doubleHyphenDemerits`
   per hyphen-after-hyphen edge (default 10000; runs of n accumulate
   (n−1)× for free — no extra DP state, the active node knows its own
   break kind); `finalHyphenDemerits` for a hyphenated penultimate
   line (default 5000). Both struct-configurable. Documented but NOT
   implemented: a `maxConsecutiveHyphens` hard cap (future config) and
   a possible escalation toward a steeper (e.g. quadratic) cost curve
   if proofing shows linear accumulation is too lenient.
4. **Fitness classes — TeX classes from the signed step, with an
   off-switch.** tight: step ≤ −0.5; decent: −0.5 < step ≤ 0.5;
   loose: 0.5 < step ≤ 1; very loose: |step| > 1 (emergency only).
   `adjDemerits` (default 10000) when adjacent lines jump ≥ 2 classes;
   DP state = (breakpoint, class) — the finite quantization is what
   makes path-dependent adjacency costs tractable. Struct boolean
   **`balanceGray`** disables adjacency costs (default ON). Class
   boundaries are documented constants first, promoted to config only
   if proofing demands.
5. **Candidate evaluation — quantized step lattice with adaptive K +
   per-step memoization.** All edges evaluate steps on one shared
   lattice per paragraph; treated widths depend only on
   (style, lattice step) → memoized scalars / prefix sums, edge
   evaluation ~O(1). K is adaptive:
   `K_side = clamp(ceil(ΔPt_side / q), Kmin=4, Kmax=16)` where ΔPt is
   the measured potential swing of a representative full-measure span
   and `q` a target physical quantum (struct knob, default ~1 pt) —
   long measures get finer lattices automatically; Kmax also protects
   the 32-slot hbFont location LRU. Optional continuous polish of the
   ~n chosen lines after the DP (flag, default on). Fitness-class
   boundaries snap to lattice/nearest.
6. **Checkpoints — algorithm may return a generator.** Contract
   becomes `(input) => CompositionResult | CompositionTask
   <CompositionResult>`; the controller duck-types
   (`typeof x.next === "function"`) and `yield*`-delegates. KP++
   yields per relaxation round (per source breakpoint / per N edges)
   with `work` = edges processed — activating the existing
   `workBudget` machinery. Sync drain (`flushSync`, sync reveal)
   unchanged: same generator, drained. Other algorithms return plain
   results; zero churn. **Worker-pool compatibility confirmed** as a
   later execution backend: the lattice separates measurement
   (main-thread, serializable tables) from the DP (pure arithmetic,
   worker-shaped); the generator itself can't cross a worker
   boundary — a worker runs its own drain loop and reports via
   messages. Timing per ROADMAP: only when measured cost requires it.
7. **Diagnostics — two tiers.** Always on (cheap): per-line `badness`
   (now meaningful — gives the published-but-unread field its first
   consumer), fitness class, paragraph total demerits, unsatisfiable
   count, exhausted-potential flags; viewer color coding upgraded to
   consume badness/classes (intensity = badness, hue = class/
   direction) under the existing `colorCoding` switch. Opt-in heavy
   tier: rejected-candidate records (runner-up edges with demerits
   and rejection margins, pruned/infeasible counts per source break)
   — gated by a **non-UI dev flag** (not serialized into the struct,
   no inspection UI this round); the DP computes runner-up demerits
   during relaxation anyway, the flag only controls retention.

## Open Questions

- Emergency/unsatisfiable-path policy detail: infeasible edges get
  very high demerits rather than exclusion so a path always exists
  (matching the contract's `|step| > 1` representation) — exact
  magnitude and interaction with the polish pass to be fixed in the
  plan/implementation.
- The editor-typing performance regression and latency-amplified
  ProseMirror cursor-jump defect (ROADMAP "Open performance
  regression") remain unresolved and independent of KP++; a focused
  editor-only CPU profile is still owed.

## Phase-5 validation results (Cycle 3, 2026-10-06)

Quick-suite perf (Wikipedia fixture, 209 blocks, viewer mode, per-arm
initial compose drained to the full 209 publications before sampling;
medians of 3 steady samples after 1 warmup):

| arm | none | ragged | fit | kp | kp/fit |
|---|---|---|---|---|---|
| typing | 256.4 | 248.4 | 260.3 | 266.9 | **1.03×** |
| inherited-style partial recompose | — | 634.0 | 633.3 | 664.5 | **1.05×** |
| relevant-style | — | 608.7 | — | — | — |
| initial full compose (last publication) | — | 6.6s | 11.8s | 37.3s | **3.2×** |

Typing and recompose are at parity — far below the 3× tripwire. The
initial full compose is the discussion item (3.2× fit): per-block
cooperative tasks stream, adaptive-K probes add measurement, and the
hbFont LRU thrash compounds (below). Levers: `HBFONT_LOCATIONS_CAP`
and the worker backend.

Adaptive-K vs hbFont LRU (temporary probe, Wikipedia fixture, KP,
sync drain): **218 distinct treated locations** (style × lattice
step × polish-refinement axesKeys) against the per-font cap of 32 —
6 684 hbFont creations on ONE full compose, LRU permanently at cap.
Reducing Kmax cannot fix it (polish probes are off-lattice reals);
options: raise the cap (hbFont creation is a light WASM object) or
quantize polish-probe axesKeys.

Sync/async e2e (new permanent test, `index.test.mjs` "async
scheduling e2e (production scheduler)"): boots with the DEFAULT
macrotask scheduler (no injected sync drain), editor → KP select →
viewer reveal (lazy publications, stable count), two rapid
consecutive text edits with no settle in between — after settle the
DOM carries the FINAL edit and the intermediate value never remains
applied (no stale publications).

Perf-harness repairs needed to get there (stale since the demand
lifecycle f7c3c374 and the cooperative scheduler): editor-only arms
expect/measure zero composition; typing arms moved editor → viewer;
publication snapshots wait for quiescence; the initial compose is
drained to the full 209 count before sampling (KP's 37s stream with
multi-hundred-ms gaps defeated quiet-window detection: 181/209 then
stragglers polluting samples); dev-server reload races retried
(vite dependency re-optimization destroys the execution context
mid-open); recompose expectation 10 → 9 (uniform across
ragged/fit/kp since the demand lifecycle).
