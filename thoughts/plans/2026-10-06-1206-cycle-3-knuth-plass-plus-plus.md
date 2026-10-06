# Cycle 3: Knuth–Plass++ implementation (milestone 5)

## Overview

Implement the paragraph-wide optimum-fit composition algorithm
(Knuth–Plass adapted to TypeRoof's normalized, asymmetric
adjustmentStep) as a new pure algorithm module, wire it model-first
into the existing `textCompositionAlgorithm` dynamic struct, and
upgrade diagnostics to proofing grade. This concludes milestone 5,
the target of the text-composition roadmap.

Research (Cycle 2, all operator design questions resolved):
`thoughts/research/2026-10-06-0906-cycle-2-knuth-plass-plus-plus.md`
— the Resolved Design Decisions section there is authoritative for
formulas, defaults and config knobs; this plan does not repeat the
rationale.

## Current State Analysis

- Contract (`composition-types.ts`): `CompositionInput` has
  `segments`, `breaks` (with `penalty` — populated, unread),
  `lineWidthPt`, `lineWidthAtStep`. `CompositionAlgorithm` is a pure
  sync function returning `CompositionResult`; `diagnostics.badness`
  exists but is slack-based per algorithm and unread by any consumer.
- Algorithms: dummy, greedy-ragged, greedy-fit — all pure, all
  one-pass greedy; none reads `penalty`. Greedy-fit pays ~24-iteration
  binary searches per line; every novel step value costs one HarfBuzz
  shape per segment (no candidate-level memoization).
- Host (`composition-controller.ts:1057-1312`): per logical paragraph
  — hyphenation (flat `HYPHENATION_PENALTY = 10`), once-per-segment
  shaping, planner cache per style, injected `lineWidthAtStep`
  (:1188-1264). Algorithm dispatch at :1171-1177. The sync
  `algorithm(...)` call at :1178 is the single un-interruptible unit
  inside the cooperative task.
- Task runner (`composition-task.ts`): generator checkpoints with
  `reason` + declared-but-unused `work`; `workBudget` honored by
  `resumeTaskAsync`; sync drain and async resume share the generator.
- Config precedent: `createDummyComposition(segmentsPerLine)` and
  GreedyFit's treatments/direction/colorCoding are factory-closure
  config fed from the dynamic struct fields via
  `properties-generators.mjs` (`textCompositionGen`).
- Viewer: `_lineColorCode(adjustmentStep, overfull)`
  (viewer.typeroof.jsx:739-748) + `--line-color-code` per line span;
  `colorCoding` flag published in the payload.

## Desired End State

- `TextCompositionAlgorithmKnuthPlassModel` selectable per typeSpec
  (inheritable), composing paragraphs by paragraph-wide demerits
  minimization with: TeX demerits formula, Host-injected badness
  (`100·|step|³`), break penalties (hyphen default 50), consecutive-
  hyphen and penultimate-hyphen demerits, fitness classes with
  adjacency demerits (`balanceGray` switch), prohibited-break
  handling, and a guaranteed-path policy for unsatisfiable content.
- Candidate evaluation cost bounded by a shared adaptive step lattice
  with per-step memoization; optional continuous polish of chosen
  lines. Long paragraphs yield cooperative checkpoints mid-DP; sync
  drain behavior identical.
- Diagnostics: real per-line badness + fitness classes + paragraph
  demerits consumed by upgraded viewer color coding; rejected-
  candidate records behind a non-UI dev flag.
- Validated on the deterministic 280/220pt Host fixture and the
  Wikipedia perf fixture (quick suite, detached per the failure-log
  rules); full suite/lint/typecheck green; ROADMAP milestone 5 done.

### Key Discoveries

- `BreakOpportunity.penalty` hook: composition-types.ts:113-115.
- Union return extension point: contract :211-230 + the sync call at
  composition-controller.ts:1178; duck-type + `yield*` at
  controller `_compositionTask`/:358-364.
- `lineWidthAtStep` measure/compute split: controller :1188-1264
  (step 0 = cached sums; step ≠ 0 = reshape per novel location).
- Measurer caps: 32 hbFont locations/font, 50000 shapes
  (measurer.ts:92-93) — lattice K bounded by styles × K ≤ LRU.
- DP state for adjacency costs: (breakpoint, fitness class) — the
  finite class quantization makes path-dependent costs tractable.
- Fitness classes from signed step: tight ≤ −0.5; decent (−0.5, 0.5];
  loose (0.5, 1]; very loose |step| > 1.
- Adaptive lattice: `K_side = clamp(ceil(ΔPt_side / q), 4, 16)`,
  ΔPt = measured potential swing of a representative full-measure
  span, q ≈ 1pt (struct knob).

## What We're NOT Doing

- Workers / worker-pool execution backend (kept possible by design;
  only when measured cost requires it).
- ProseMirror composition applicator / focus policy.
- Cross-paragraph consistency (documented legitimate future refactor).
- `maxConsecutiveHyphens` hard cap (documented future config only).
- Escalating (quadratic) consecutive-hyphen cost curves (commented
  future option only).
- Optical alignment / margin protrusion (contract-anticipated Host
  extension, not this cycle).
- Per-line `lineWidthPt` shaped containers (constant measure stays).
- Diagnostics inspection UI; the dev flag is not serialized/exposed.
- Per-point hyphenation weights from Knuth-Liang pattern internals
  (flat configurable penalty stays).
- The editor-typing performance regression / cursor-jump defect
  (independent; separate follow-up).
- Retuning GreedyFit or removing it (it remains the validation
  baseline and fallback).

## Implementation Approach

Five phases, each separately reviewable/committable. Stop after every
phase for operator review/OKOK. Behavior-over-implementation tests;
pure algorithm tests inject fake `lineWidthAtStep`/`badnessAtStep`
(the contract's own pattern). If a phase hits unexpected complexity,
apply the sub-RPI handoff rule.

---

## Phase 1 — Contract extensions (behavior-neutral)

### Overview

Extend the contract without changing any existing behavior: injected
badness, generator-returning algorithms, optional diagnostic slots.

### Changes Required

**File**: `…/text-composition/composition-types.ts`

- `CompositionInput` gains **optional** `badnessAtStep?(step:
  number): number` — TeX badness of a line at a normalized step
  (`100·|step|³` shape, infinite beyond ±1); Host policy, like
  `lineWidthAtStep`. Optional so all existing algorithms/tests are
  untouched.
- `CompositionAlgorithm` return type becomes
  `CompositionResult | CompositionTask<CompositionResult>` (import
  the task type from composition-task.ts; mind the import direction —
  composition-task must not import the contract, or move
  `CompositionCheckpoint`/`CompositionTask` types into the contract
  module if a cycle appears; prefer keeping composition-task
  standalone and re-declaring the structural type in the contract if
  needed).
- `CompositionResult.diagnostics` gains optional additive fields:
  `fitnessClasses?: readonly string[]` (or a small enum union:
  "tight" | "decent" | "loose" | "veryLoose"),
  `totalDemerits?: number`,
  `exhaustedLines?: readonly number[]` (lines at |step| > 1).
- Document penalty semantics: non-negative finite domain;
  `penalty ≥ 1_000_000` = prohibited break (DP treats as infeasible);
  forced = `kind: "explicit"`; absence = never break. Document the
  badness convention and the fitness-class vocabulary.

**File**: `…/text-composition/composition-controller.ts`

- At the algorithm invocation (:1178): duck-type the return —
  `typeof result.next === "function"` → `yield*` delegate so
  checkpoints flow into the task; plain results pass through. Both
  `composeTextblock()` (sync drain) and the async path share this —
  no behavior change for existing algorithms.

**Tests**

- Extend `composition-controller-task.test.mjs`: a toy
  generator-returning algorithm yields checkpoints that surface in
  the task stream; sync drain and async resume produce identical
  payloads; cancellation mid-algorithm never publishes.
- Type-level: existing algorithm modules compile unchanged against
  the union return.

### Success Criteria

#### Automated
- [x] Full suite/lint/typecheck green with zero algorithm changes.
      (2026-10-06: typecheck + lint green; suite 431 passed/1 skipped;
      the one failing suite, type-stage-viewer-behavior/
      split-paragraph.test.mjs, fails identically on clean HEAD
      61910fca — pre-existing, caused by the new language-marked
      Greek paragraph requiring the el-monoton hyphenation resource
      in the harness; unrelated to this phase, reported to operator.)
- [x] Generator-delegation tests green (sync/async equivalence,
      checkpoint order, cancellation).

#### Manual
- [ ] Review contract doc language (penalty/badness/class vocabulary).

---

## Phase 2 — Pure KP++ algorithm (`knuth-plass.ts`)

### Overview

The heart of the milestone: a pure, generator-based DP over the break
graph, fully tested with injected fakes.

### Changes Required

**New file**: `…/text-composition/knuth-plass.ts`

Authoritative design header: strategy, demerits math, lattice,
polish, checkpoint policy, config reference.

Factory: `createKnuthPlassComposition(config)` returning a
`CompositionAlgorithm` (generator). Config (all with defaults):

```ts
interface KnuthPlassConfig {
    linePenalty: number;          // default 10
    doubleHyphenDemerits: number; // default 10000
    finalHyphenDemerits: number;  // default 5000
    adjDemerits: number;          // default 10000
    balanceGray: boolean;         // default true
    latticeStepsPerSide: number;  // K, default 10 (Host computes
                                  // adaptively; pure module takes it
                                  // as data)
    polish: boolean;              // default true
    prohibitedPenalty: number;    // default 1_000_000
}
```

Algorithm structure:

1. **Lattice**: steps `k/K` for k in −K…K per side. For each edge
   (from, to] under consideration evaluate `lineWidthAtStep` at
   lattice steps only; pick the smallest-|step| lattice step whose
   fitting width ≤ available (collapse handling per contract:
   exclude trailing collapsing segment — measure at same step, the
   greedy-fit `fittingWidth` pattern); badness via injected
   `badnessAtStep` (fallback `100·|step|³` when absent — pure tests
   may omit it).
2. **Feasibility**: an edge with no fitting lattice step is
   infeasible → demerits = prohibitive magnitude (documented
   constant; guarantees a path always exists) and the resulting line
   carries step ±2 (unsatisfiable, contract representation).
3. **DP**: active breakpoints with best demerits **per fitness
   class** (4 slots); edge demerits =
   `(linePenalty + badness)² + penalty²`
   (+ `doubleHyphenDemerits` when both the edge's break and the
   active node's incoming break are hyphens; + `finalHyphenDemerits`
   for a hyphen edge creating the penultimate line; + `adjDemerits`
   when class jump ≥ 2 and `balanceGray`). Prohibited breaks
   (penalty ≥ threshold) skipped as edge targets. `explicit` breaks
   force line end (all non-explicit edges spanning past an explicit
   break are invalid). Last line: never widened (step ≤ 0), may
   narrow; `breakAt: null`.
4. **Checkpoints**: `yield { reason: "relaxation-round", work:
   edgesProcessed }` per source-breakpoint round (or per N edges,
   documented in the header).
5. **Polish** (flag on): for each chosen line, binary-search the
   exact fitting step between the chosen lattice step and its
   neighbor toward 0 (greedy-fit `_SEARCH_ITERATIONS` pattern);
   recompute that line's badness; unchanged demerits totals are
   documented as approximate (polish improves fit, does not re-run
   the DP).
6. **Result**: lines + diagnostics (`overfullLines`, real per-line
   `badness`, `fitnessClasses`, `totalDemerits`, `exhaustedLines`).

**New file**: `…/text-composition/knuth-plass.test.mjs`

Fake injections (piecewise-linear `lineWidthAtStep`, analytic
`badnessAtStep`). Pin behavior, not internals:

- single-word-per-line vs full-paragraph optimum (DP beats greedy on
  a constructed case where greedy-fit pulls too eagerly);
- mandatory explicit breaks; explicit-ahead edges invalid;
- last line never widened, narrows when overfull;
- prohibited penalty never chosen when any alternative exists;
- hyphen penalty discourages hyphen breaks (chosen only when
  demerits-optimal); consecutive-hyphen run costs (n−1)×;
- penultimate-hyphen demerits;
- fitness-class jump penalized when `balanceGray`, free when off
  (same input, two configs, different breaks);
- tie-breaking deterministic (document the rule: earliest break /
  lowest class slot);
- unsatisfiable paragraph still returns a complete path with
  |step| > 1 lines and `exhaustedLines`;
- lattice quantization: chosen steps are lattice multiples with
  polish off; polish refines within the lattice cell;
- generator: checkpoints in order, sync-drain result === async
  result; `work` counts increase monotonically.

### Success Criteria

#### Automated
- [x] All new pure tests green; full suite/lint/typecheck green.
      (2026-10-06: 13 new behavior tests green; text-composition
      suite 104/104; full suite 445/445; typecheck/eslint/prettier/
      stylelint clean.)
- [x] No imports outside `composition-types.ts` (purity check by
      inspection/lint). (knuth-plass.ts imports only the contract;
      the test file additionally imports greedy-fit + the task
      runner for comparison/protocol tests.)

#### Manual
- [ ] Operator reviews the design header + demerits math against the
      research decisions.

---

## Phase 3 — Model-first wiring

### Overview

Make KP++ selectable per typeSpec, with the resolved configuration
knobs; implement the Host badness and the adaptive lattice.

### Changes Required

**File**: `lib/js/components/type-spec/text-composition-models.mjs`

- `TextCompositionAlgorithmKnuthPlassModel` struct, all fields
  OrEmpty/inheritable (GreedyFit precedent): `linePenalty`,
  `hyphenPenalty`, `doubleHyphenDemerits`, `finalHyphenDemerits`,
  `adjDemerits` (number models), `balanceGray`, `polish`
  (BooleanDefaultTrueOrEmptyModel), `latticeQuantum` (number, pt,
  default 1), and `colorCoding` as an **enum** (`potentials` |
  `kp` | `off`) OrEmpty — default `kp` (see Phase 4: the two
  palettes serve different audiences; the GreedyFit boolean stays
  untouched). Register in `createDynamicModel` with label
  "Knuth-Plass".

**File**: `…/type-stage/properties-generators.mjs`

- `textCompositionGen`: yield the KP fields when set (GreedyFit
  field-yield precedent :63-78).

**File**: `…/text-composition/composition-controller.ts`

- Dispatch: `TextCompositionAlgorithmKnuthPlassModel` →
  `createKnuthPlassComposition(resolvedConfig)`.
- Config resolution (defaults from the research decisions; unresolved
  OrEmpty fields fall back).
- Host `badnessAtStep`: `(step) => Math.abs(step) > 1 ? Infinity :
  100 * Math.abs(step) ** 3` — injected for all algorithms (cheap,
  behavior-neutral for non-readers).
- **Adaptive lattice**: probe `lineWidthAtStep(0, segments.length,
  ±1)` (or a documented representative span) → ΔPt per side →
  `K_side = clamp(ceil(ΔPt / q), 4, 16)`. Pass `latticeStepsPerSide`
  per side (config takes `{narrowing: K, widening: K}` — extend the
  Phase-2 config shape accordingly if it was scalar).
- **Memo wrapper**: per-paragraph `Map<(from,to,quantizedStep) →
  width>` around the injected `lineWidthAtStep` (quantize the key to
  the lattice; step 0 and ±1 probes included). Validate hit-rate
  expectations in a test (counts, not wall-clock).
- **Hyphen penalty plumbing**: `hyphenateSegments` gains an optional
  penalty parameter (default keeps 10 for other algorithms); the
  controller passes the resolved KP `hyphenPenalty` (default 50).
- Ingredients filter: add the resolved KP config values so config
  edits recompose.

**File**: `lib/js/components/type-spec/model.test.mjs` (or the
dynamic-types pattern tests)

- Struct serialization round-trip; OrEmpty inheritance.

**Tests** (`lib/js/tests/text-composition/index.test.mjs`)

- Selecting KP on the deterministic 280pt fixture composes all
  blocks; exact assertions on a small controlled paragraph (known
  breaks/classes at known measure); 280→220pt recomposes with moved
  breaks; hyphenation on/off changes break kinds; config changes
  (e.g. `balanceGray` off) change results observably.

### Success Criteria

#### Automated
- [x] KP selectable model-first; round-trip serialization green.
      (2026-10-06: model.test.mjs — set fields round-trip,
      untouched fields stay empty/inherit.)
- [x] Host integration tests green at the deterministic fixture.
      (2026-10-06: KP composes all blocks; first real paragraph
      pinned at 8 widened lines @280pt (greedy-ragged sets 9);
      280→220 moves breaks; hyphen breaks carry the resolved
      hyphenPenalty 50 and vanish with the Host control; polish
      off keeps the breaks, changes the steps — the observable
      config switch, see the deviation note below.)
- [x] Memo hit-rate structural test green (no wall-clock assertions).
- [x] Full suite/lint/typecheck green. (2026-10-06: 451/451;
      typecheck/eslint/prettier/stylelint clean.)

#### Manual
- [ ] Operator toggles KP in the UI on a real document; lines
      compose; color coding unchanged in behavior (GreedyFit).

### Phase 3 implementation notes (2026-10-06)

- **Performance fixes were required** beyond the letter of the
  plan: the first wiring ran the fixture test in ~370s. (1)
  Target-scan pruning in knuth-plass.ts: once an edge is infeasible
  and the observed fitting widths are monotonic non-decreasing, all
  later targets are infeasible — the scan emits the first
  infeasible edge (guaranteed path) plus the LAST target (the final
  / explicit edge: one exhausted line over the rest strictly beats
  any multi-edge exhausted route) and stops. O(N^3) -> ~O(N·C)
  Host probes. (2) Per-(segment, step) contribution memo in the
  controller (shaped advance + wordspace delta, glyph count,
  tracking rate) — repeat span probes become Map lookups;
  allocateTracking treats the shared run objects as readonly.
  Fixture test now runs in seconds.
- **Memo key deviation**: the plan said "quantize the key to the
  lattice" — a coarse lattice-cell key would corrupt the polish
  binary search (every probe in a cell would return one width). The
  memo key quantizes to a fine 1e-6 grid instead: exact for the
  deterministic lattice probes, never aliasing realistic polish
  probes (documented in memoizeWidthAtStep).
- **balanceGray-off is not observable on the fixture** (the DP's
  optimum is class-balanced there either way); the "config changes
  results observably" criterion is pinned with the polish switch
  instead — guaranteed: polish never moves breaks but refines every
  widened non-last line's step.
- The UI registration (ui-text-composition.typeroof.jsx
  _getPPSMapForModel list) was required beyond the plan's file
  list — selecting the model in a live typeSpec UI throws
  otherwise.
- Until Phase 4 the resolved colorCoding "kp" renders with the
  potentials palette (payload switch ON for "potentials" and "kp",
  OFF for "off") — pinned in the integration test.

---

## Phase 4 — Diagnostics + viewer

### Overview

Give the published diagnostics their first consumer **without
replacing the existing potentials color codes** — the current
cyan=narrowing / red=widening intensity encoding answers "what did
the line do physically" and serves the type designer / potentials
configurator; the KP diagnostics answer "why did the DP choose this
line" and serve proofing. Two palettes, one enum switch.

### Changes Required

**Color-coding becomes an enum, not a boolean.** The KP struct's
`colorCoding` field (Phase 3) is `potentials | kp | off` + OrEmpty
for inheritance, default `kp`:

- `potentials` — the existing encoding, unchanged:
  `_lineColorCode(adjustmentStep, overfull)` cyan/red intensity;
  available for every algorithm including KP (the payload carries
  `adjustmentStep` regardless).
- `kp` — new palette over the KP diagnostics: intensity = per-line
  badness (0…100+ → lightness), hue marks fitness class/direction
  (tight vs decent vs loose vs veryLoose; overfull/exhausted lines
  get a distinct alarming treatment). Palette constants documented
  in the viewer; deliberately a *different* visual vocabulary than
  potentials-codes so the two are never confused.
- `off` — no line backgrounds.

(Until this phase lands, a resolved mode of `kp` falls back to the
potentials rendering — Phase 3 ships the enum before the palette
exists. GreedyFit keeps its existing boolean `colorCoding`;
unifying the two structs' field types is out of scope.)

**File**: `…/text-composition/knuth-plass.ts`

- Retain per-chosen-line runner-up edges (best rejected alternative
  + demerits margin) and per-source-break pruned/infeasible counts —
  only when the dev flag is on (see below).

**File**: `…/text-composition/composition-controller.ts`

- Publish the extended diagnostics in the payload (fitness classes,
  totalDemerits, exhaustedLines per paragraph) plus the resolved
  color-coding mode.
- Non-UI dev flag (module-level/globalThis switch, documented in the
  knuth-plass.ts header, NOT in the struct/UI): gates retention +
  publication of rejected-candidate records.

**File**: `…/type-stage/viewer.typeroof.jsx` + `line-spans.css`

- Add the kp-codes palette next to (not replacing)
  `_lineColorCode`; select by the published mode.

**Tests**

- Payload assertions: KP publish contains classes/demerits/mode;
  greedy payloads unchanged; dev flag off → no rejected-candidate
  data; mode `potentials` on KP payloads renders the legacy codes.

### Success Criteria

#### Automated
- [x] Payload/flag tests green; full suite/lint/typecheck green.
      (2026-10-06: suite 453/453 — 2 new pure dev-flag tests plus
      the extended Host integration test; typecheck/eslint/prettier/
      stylelint all clean)

#### Manual
- [ ] Operator reviews color-coded KP rendering on the Wikipedia
      state; greedy-fit rendering unchanged.

### Phase 4 implementation notes (2026-10-06)

- **Payload switch representation**: the plan asked that "greedy
  payloads [stay] unchanged" and that KP publish "the resolved
  color-coding mode". Implemented as ONE payload field
  `colorCoding: "potentials" | "kp" | "off"` for all algorithms
  (greedy-fit's boolean maps true→"potentials", false→"off";
  dummy/ragged publish "off"). Greedy RENDERING is unchanged —
  "potentials" is exactly the legacy palette — but the on-the-wire
  representation changed from boolean to the resolved mode enum
  (the alternative, a second field, would have duplicated state).
- **KP palette** (viewer.typeroof.jsx `_kpLineColorCode`, beside —
  not replacing — `_lineColorCode`): hue per fitness class
  (tight violet 265, decent green 145, loose amber 40, veryLoose
  magenta 320), lightness by per-line badness (0 → 88%, ≥100 →
  55%), overfull/exhausted deep magenta hsl(300,100%,35%).
  Deliberately disjoint from the potentials cyan/red; documented
  in the viewer and in line-spans.css.
- **Dev flag**: `globalThis.__typeroofKPDevDiagnostics = true`
  (exported reader `kpDevDiagnosticsEnabled()` in knuth-plass.ts,
  documented in the module header; NOT serialized, NOT a model
  field). Retains per-chosen-line runner-up records
  (diagnostics.rejectedCandidates: best rejected alternative edge +
  demerits margin) and target-scan counters
  (diagnostics.scanStats: evaluated/infeasible/pruned).
- **Margin semantics** (deviation from a naive "runner-up" reading):
  `margin` can be NEGATIVE — the costs are the DP's per-edge prefix
  demerits (continuations excluded), so a locally cheaper candidate
  legitimately loses on its continuation. Documented on
  RejectedCandidate in composition-types.ts; tests assert
  consistency, not non-negativity.
- **Empty paragraphs** return present-but-empty dev keys while the
  switch is on, so consumers can rely on key presence.
- **Test-trigger detail**: the Host dev-flag test triggers the
  recompose with a KP struct ingredient (the polish toggle), NOT a
  lineLength change — blocks whose measure resolves from an
  untouched path (the fixture heading) do not recompose on a
  lineLength mutation and would keep stale, flag-off payloads.
- The extended KP integration test needed an explicit 60s timeout
  (the mode/dev-flag switching adds several full recomposition
  rounds to the ~3s test).

---

## Phase 5 — Validation + milestone close

### Overview

Prove KP++ at real scale within the failure-log rules; close the
milestone.

### Changes Required

- **Perf sanity** (detached, quick suite only, progress logged —
  never the full matrix in-session): KP vs GreedyFit on the Wikipedia
  fixture (typing + recompose arms); record medians in the research
  doc; investigate only if KP is pathologically slower (>3× Fit is
  the tripwire for discussion, not a gate).
- **Adaptive-K validation**: instrument (console/dev flag) the
  distinct treated locations per paragraph on the Wikipedia state;
  confirm styles × K stays within the hbFont LRU cap; adjust Kmax
  if not.
- **Sync/async e2e**: viewer lazy + sync reveal with KP on the
  Wikipedia state; no stale publications under typing.
- **ROADMAP**: milestone 5 → ✅ done (commit range); record the
  worker-backend note and follow-ups (maxConsecutiveHyphens,
  escalation curve, diagnostics UI) in the after-KP++ section.
- **Archive**: move this plan + the Cycle-2 research to
  `docs/planning/agentic-artefacts/thoughts/`; conclusion commit.

### Success Criteria

#### Automated
- [ ] Quick-suite result JSON validates; no structural regressions.
- [ ] Full suite/lint/typecheck green.

#### Manual
- [ ] Operator reviews perf medians + Wikipedia rendering and accepts
      the milestone.

---

## Testing Strategy

- **Behavior over implementation**: pure KP tests assert inputs →
  observable lines/diagnostics, never private DP structures.
- **Fakes at the contract boundary**: piecewise-linear
  `lineWidthAtStep`, analytic `badnessAtStep` — deterministic,
  font-free, fast (the contract's "tests can inject a fake" pattern).
- **Real-font Host tests** at the deterministic 280/220pt fixture
  (Cycle-1 harness); no dependence on `downloads/`.
- **No wall-clock assertions** in vitest; performance evidence comes
  from the detached quick suite + structural counters (memo hit
  rates, lattice sizes, checkpoint counts).
- **Sync/async equivalence** pinned at both the task-runner level
  (Phase 1) and the algorithm level (Phase 2).

## Documentation

- `knuth-plass.ts` header: authoritative design doc (strategy,
  demerits math, lattice/adaptive-K, polish, checkpoints, config,
  dev-flag diagnostics).
- `composition-types.ts`: penalty/badness/fitness vocabulary (Phase 1).
- ROADMAP milestone 5 + follow-ups (Phase 5).
- Research doc gains the Phase-5 perf medians.

## Sub-RPI Handoff Rule

If a phase hits unexpected complexity (e.g. the lattice/memo design
proves insufficient and measurement cost demands architectural
change, or the DP state space blows up on real content), stop and
create a sub-RPI handoff: this plan, the Cycle-2 research doc, the
knuth-plass.ts design header, and exact observed costs. The operator
drives the sub-cycle separately; this plan resumes afterwards.
