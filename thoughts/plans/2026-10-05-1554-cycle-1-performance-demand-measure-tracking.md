# Cycle 1: Performance truth, demand lifecycle, controllable measure + tracking truth

## Overview

Before Knuth–Plass++, establish trustworthy costs, stop composition
work nobody consumes, introduce a low-cost future-facing cooperative
task lifecycle, fix the authoritative line measure, and replace
UTF-16 tracking arithmetic with a deterministic HarfBuzz shaped-glyph
model.

Research:
`thoughts/research/2026-10-05-1205-cycle-1-performance-demand-measure-tracking.md`
(all operator-level design questions resolved).

## Current State Analysis

- `CompositionController` + `DocumentNodesMeta` are always active;
  editor-only has no composition applicator but active algorithms
  still fully traverse/shape/break/publish each affected textblock.
- Default unresolved algorithm = Greedy Ragged (already noticeable in
  editor); Greedy Fit adds repeated treated-axis reshaping through
  24-iteration step searches.
- Explicit None returns before expensive composition roles, but the
  entire TypeStage meta/scope/editor update still runs and is
  perceived slower than expected — profile attribution is needed.
- Input equality is late: traversal, segmentation, style resolution,
  hyphen/potential setup happen before the skip; Greedy Ragged payload
  construction currently calls `plannerOf` per leaf despite step 0.
- `SimpleProtocolHandler` has publications/update marks but no
  subscribers. `CompositionController` is already an ID-addressed
  publisher service; DocumentNodesMeta has explicit renderer callback
  lifecycle precedents; TypeSpecSubscriptions has first/last demand.
- Viewer results currently interpret offsets against independently
  updated attachment text; async requires a self-contained atomic
  source+composition snapshot.
- Perf harness measures one viewer Greedy-Fit-vs-None burst; no initial
  load, mode matrix, per-operation distributions, role/cache counters
  or current CDP profile harness.
- jsdom harness publishes `layout={width:0,height:0}`: composition gets
  exactly 0pt and cannot assert realistic breaks.
- Composition reads incoming `layout/availableWidth`; authoritative
  per-block line box is local `layout/columnWidth` — already consumed
  by AutoLinearLeading. Viewer CSS writes local `layout/width` /
  column-width. Latest Wikipedia debug save proves the mismatch.
- Tracking prediction uses source UTF-16 units; Measurer shapes glyphs
  but returns/caches width only. HarfBuzz exposes glyph count/clusters.

## Desired End State

- Before/after performance report with repeatable scenario matrix,
  distributions and representative browser CPU profiles; optional
  generic instrumentation only where external profiling is
  insufficient.
- Composition runs only for demanded textblocks. Editor-only without a
  future applicator invokes zero composition roles/publications.
  Explicit None pays only transition unapply + cheap demand/gate work.
- Per-textblock source+consumer lifecycle supports multiple
  applicators, immediate last-consumer cancellation/unpublish/drop,
  and first-demand work.
- One documented task abstraction supports direct synchronous drain
  and cooperative async resumption. Lazy viewer reveal is default;
  sync reveal is widget configuration. Results are atomic snapshots;
  stale async work cannot publish.
- Composition consumes local `layout/columnWidth`, with deterministic
  nonzero ManualHorizontalLayout Host tests.
- Tracking width = gaps between adjacent visible shaped glyphs over a
  complete candidate line (N−1), continuous across segments/runs,
  with taken hyphen final. Browser screenshots are diagnostic only.
- Demand-aware profile/baseline replaces the milestone-4 aggregate
  snapshot; ROADMAP records Cycle 1 done.

## Decisions / Invariants

### Demand

- Granularity: `composition@<textblockPath>`.
- Meta textblock registers/unregisters one source/drive by path.
- Each applicator textblock subscribes independently; its text runs
  share the payload.
- First subscriber schedules current composition.
- Last subscriber cancels pending work, unregisters publication and
  drops ingredients/source/result/task state synchronously.
- No dormant cache/publication in this cycle.
- TypeSpec algorithm/None remains authoritative after demand exists.

### Scheduling / snapshots

- Persistent demand is scheduling-neutral.
- Cooperative async is normal for first lazy result + steady updates;
  textblocks may publish out of document order.
- `flushSync(path)` is explicit for sync reveal/controlled use.
- Same generator/task protocol can be direct-drained synchronously or
  resumed with a work/time budget asynchronously.
- Initial checkpoints: Host phases + logical paragraphs only; no
  Greedy-Fit inner rewrite. KP++ adds candidate-batch checkpoints.
- Use a rendering-friendly task boundary (not unbounded microtasks).
- Async verifies immutable source/ingredient identity at resume/publish.
- Viewer renders the last COMPLETE payload snapshot including exact
  leaf source text. It need not mirror current editor state while a
  newer snapshot is pending.
- No previous snapshot + lazy reveal: ordinary browser-wrapped current
  text until result. Sync reveal flushes before expose.
- Future ProseMirror policy (possibly browser composition for focused
  block) remains out of scope.

### Reveal policy

Renderer/widget constructor configuration, not document state:

```js
UIDocumentViewer(..., { compositionReveal: "lazy" }) // default
UIDocumentViewer(..., { compositionReveal: "sync" })
```

No metamodel/PPS/UI/serialization this cycle.

### Profiling

- External CDP CPU/trace first.
- If hooks are necessary: one generic opt-in cross-subsystem
  instrumentation facility (`count`, `timerStart`, `timerStop`), cheap
  no-op/guard without collector; reset/snapshot/scenario tagging with
  collector. Document every metric purpose/unit/scope/lifecycle/type
  and observer effect. No wall-clock test assertions.
- Cold/transitions: 5 fresh-page samples (median + range; first/all
  result times).
- Steady state: independent identical state per arm; 5 warmups + 30
  individually timed edits; median, p95/max, total, aggregate ratio;
  alternate arm order.
- One representative cold and warm CDP profile.

### Measure fixture

- Browser/profile environment: 1920px viewport; observed layout area
  1600px.
- Deterministic Host fixture: parent 1200pt, paragraph explicit
  `ManualHorizontalLayoutModel`, lineLength 280pt (then 220pt).
- Composition measure = same local `layout/columnWidth` consumed by
  AutoLinearLeading.

### Tracking

- TypeRoof/HarfBuzz contract, not cross-browser screenshot oracle.
- N visible shaped glyphs → N−1 tracking gaps over a line.
- Continuous across segment/run boundaries; preceding run owns gap.
- Ligatures follow HarfBuzz features; tracking does not disable them.
- Taken hyphen is final glyph: gap before it, none after it.
- One-glyph line = zero tracking.

## What We’re NOT Doing

- KP++ graph/search/checkpoints (Cycle 2/3; task protocol reserves them).
- ProseMirror composition applicator/focus policy.
- Paragraph viewport/lazy demand filtering beyond explicit consumers.
- Dormant result cache / eviction.
- Runtime/user reveal-mode model/UI.
- Fluid/runion layout correctness in the controlled composition fixture.
- Browser/OS screenshot matrix or browser-defined tracking semantics.
- Font fallback/coverage work.
- Editable justification potentials.

## Implementation Approach

Six phases, each separately reviewable/committable. Stop after every
phase for operator review/OKOK. If profiling uncovers unexpected
complexity, use the sub-RPI handoff rule rather than expanding a phase.

---

## Phase 1 — Performance investigation harness + before profile

### Overview

Build trustworthy scenarios and profile CURRENT behavior before
optimizing. Prefer external observation; add generic hooks only if
required after the first profile.

### Changes Required

**File**: `scripts/perf-composition` (likely split reusable driver into
`scripts/perf-composition-lib.mjs`)

- Preserve verified fixture staging (1087 text nodes/layout identity).
- Add scenarios:
  - modes: editor, viewer, compare;
  - algorithms: None, Greedy Ragged, Greedy Fit;
  - cold initial/first-demand-like activation (current publication
    behavior measured as-is), typing, relevant style edit, irrelevant
    style edit, full recompose, mode/algorithm transitions.
- Fresh independent page/state per arm; alternate arm order.
- Sampling convention above; machine-readable JSON result (scenario,
  commit, browser/version, viewport/layout, sample distribution).
- Record first/all composition publication completion where observable.
- Add explicit lightweight/full profile CLI modes; regular regression
  path stays practical.
- Use CDP `Profiler` (and `Tracing` only where useful) for one
  representative cold + warm operation; persist `.cpuprofile`/
  trace as ignored/generated artifacts, summarize dominant stacks in
  research output, not repository history by default.

**Production instrumentation (conditional)**

- First run CDP/external monkey-patch observation.
- Only if gaps remain, create a generic instrumentation module (location
  decided after file-pattern review), disabled by default; add minimal
  calls at composition/Measurer/applicator surfaces.
- Document metric catalog beside the module or under docs/planning;
  include role meaning/unit/lifecycle and observer effect.

**Research artefact update**

- Add actual before numbers and profile findings to this cycle’s
  research document.

### Scenarios / Metrics

- Editor-only default Ragged and Greedy Fit are required—not just Fit.
- Editor-only None attributes residual meta/scope/editor cost.
- Viewer/compare distinguish applicator cost.
- Capture lineWidth probes and shape/cache work if external stacks cannot
  quantify them.

### Success Criteria

#### Automated

- [x] Fixture identity failure is loud.
- [x] Result JSON validates all required scenario/sample counts.
- [x] Profile command produces readable CPU profile.
- [x] Existing suite/lint/typecheck green.

#### Manual

- [x] Review before-values + dominant stacks with operator before Phase 2.

---

## Phase 2 — Per-textblock demand/source lifecycle (sync core)

### Overview

Make lifecycle correct and prove zero work without introducing async
scheduling yet.

### Changes Required

**File**: `…/text-composition/composition-controller.ts`

Add domain service APIs keyed by textblock path (names finalized in
implementation):

```ts
registerSource(path, sourceDriver): unregisterSource
subscribe(path, consumerToken?): unsubscribe
flushSync(path): void
```

State per path:

- source driver/current immutable source access;
- subscriber identities/count;
- publication unregister closure;
- ingredients;
- task slot (reserved for Phase 3).

Lifecycle:

- source and demand can arrive in either order;
- first subscriber + source performs current sync composition in Phase 2;
- source changes re-drive iff demanded;
- last subscriber cancels/resets/unpublishes/drops state immediately;
- source unregister does same + removes source;
- duplicate source/subscription and invalid cleanup fail/tolerate per
  documented ownership semantics.

**File**: `…/document-nodes-meta/index.mjs`

- Textblock meta element registers its driver/source once its scope/path
  exists; unregister on textblock destruction/retype.
- Current update/scope-settled hooks notify/change the registered source
  rather than directly composing.
- Expose/reuse a current-drive method sufficient for first demand.

**File**: `…/viewer.typeroof.jsx`

- Textblock `UIDocumentElement` subscribes one token for its path when
  attached; unsubscribe in destruction.
- Text-run attachments remain payload consumers; no per-leaf demand.
- Viewer root/mode teardown balances every token.

**None fast path**

- Demand may exist, but source resolution of None produces no active
  composition; transition unregisters once.
- Continued None source changes do not enter expensive roles.

**Tests**

- Editor-only Ragged/Fit: no publications; zero expensive-role metrics
  (generic metrics if installed, otherwise behavior spies at service
  seam); no Measurer shapes.
- Viewer/compare: per-textblock subscribe; first result; multiple
  consumers reference-count; one unsubscribe retains; last removes.
- Viewer→editor drops all publications/controller per-result state.
- Editor→viewer composes current sources.
- None transition un-applies; steady None performs no role work.
- Node delete/retype and renderer mode/document replace lifecycle.

### Success Criteria

#### Automated

- [x] No-consumer/steady-None tests prove zero expensive composition roles.
- [x] Demand/source lifecycle balanced across existing mode suites.
- [x] Full suite/lint/typecheck green.

#### Manual

- [x] Editor-only interaction no longer emits composition publications/logs.

---

## Phase 3 — Cooperative task runner + atomic viewer snapshots

### Overview

Introduce low-upfront-cost async capability behind the stable demand
API; lazy reveal default, sync constructor option.

### Changes Required

**New pure utility**: `…/text-composition/composition-task.ts`
(or appropriate shared task module if research finds broader owner)

Define/document task protocol:

- generator/checkpoint value (reason/work estimate optional);
- sync drain;
- async resume under time/work budget;
- cancellation token;
- scheduler injection (default rendering-friendly macrotask /
  requestIdleCallback-with-fallback as environment allows);
- completion/error/stale outcome;
- no publication of partial payloads.

Keep generator overhead out of the hot inner loops. Current
`composeTextblock` is decomposed only enough for checkpoints between:

1. collect/resolve input;
2. per logical paragraph work;
3. payload finalize/publish.

Greedy Fit remains synchronous within one paragraph. Sync drain should
be direct and measured for overhead.

**CompositionController**

- First demand schedules async by default.
- Source updates cancel/supersede prior tasks; immutable ingredient /
  source identity checked at resume and before publish.
- `flushSync(path)` drains current task or rebuilds current source
  synchronously.
- Last unsubscribe/source unregister cancels immediately.
- Publish one atomic payload containing exact leaf source text used by
  result (not only paths/offsets).

**Viewer**

- Constructor option `{ compositionReveal: "lazy" | "sync" }`, default
  lazy, passed from TypeStage widget declaration (no model).
- Lazy: subscribe; current browser-wrapped source visible until first
  complete snapshot; results may arrive out of document order.
- After a previous snapshot exists, render that snapshot’s source +
  composition until newer snapshot atomically arrives—do not combine
  old offsets with live updated text.
- Sync: subscribe + `flushSync(path)` during initial attachment/reveal;
  later updates still async.
- Structural deletion/retype removes attachment normally.

**Tests**

- Pure task sync/async equivalence and checkpoint order.
- Yield actually crosses a task/render boundary (not microtask starvation).
- cancellation/staleness: old task never publishes.
- out-of-order textblock completion.
- atomic source/result snapshots during typing.
- lazy first browser rendering → composition; sync first composition.
- task errors isolated/reported without stale partial state.
- runner sync overhead benchmark.

### Success Criteria

#### Automated

- [x] Sync/async produce behavior-identical payloads.
- [x] Lifecycle/cancellation/staleness tests green.
- [x] Full suite/lint/typecheck green.

#### Manual

- [x] Lazy viewer remains responsive; textblocks compose independently.
- [x] Sync configured viewer has no first-result reflow (automated flushSync coverage; policy is not UI-exposed).

---

## Phase 4 — Authoritative line measure + controlled Host fixture

### Overview

Fix composition to consume the already-defined line box and create a
nondegenerate integration fixture.

### Changes Required

**File**: `…/text-composition/composition-controller.ts`

- Replace `layout/availableWidth` composition input with local
  `layout/columnWidth` (the same resolved fact AutoLinearLeading uses).
- No semantic fallback to parent budget where local line box exists;
  handle truly missing/non-number property consistently with Host
  capability/error policy.
- Ingredients track the consumed column width.

**Harness**: `lib/js/tests/type-stage-toggles/harness.mjs`

- Add explicit environment geometry option; retain historical zero
  default for unrelated callers or migrate deliberately with test review.
- Browser/perf scenarios: viewport 1920px, layout 1600px.
- Composition fixture sets parent surface to 1200pt-equivalent and
  paragraph TypeSpec to `ManualHorizontalLayoutModel`, absolute 280pt
  lineLength. No fluid/runion behavior under test.

**New/extended composition Host tests**

- scope local `columnWidth=280`, local CSS `width=280pt`, incoming
  `availableWidth=1200` remains distinct;
- payload exposes/diagnostically permits asserting consumed 280pt
  measure (or assert exact lines sufficient without expanding payload);
- exact Greedy Ragged boundaries at 280pt;
- 280→220pt causes expected break movement/recomposition;
- Greedy Fit ordinary adjusted lines reach target tolerance; max-potential
  lines/last line keep documented behavior;
- nested textblock without override inherits projected 280pt.
- Regression using structure/config from
  `downloads/typeroof-20261005-115730.TypeStage.json` (promote minimal
  version to tracked fixture; do not depend on operator downloads).

### Success Criteria

#### Automated

- [x] Composition and AutoLinearLeading consume identical line box fact.
- [x] Deterministic break assertions pass at nonzero measure.
- [x] Full suite/lint/typecheck green.

#### Manual

- [x] Wikipedia debug case no longer composes against parent width.

---

## Phase 5 — HarfBuzz shaped-glyph tracking model

### Overview

Replace UTF-16 source length with the agreed deterministic TypeRoof
tracking contract.

### Changes Required

**File**: `…/text-composition/measurer.ts`

- Extend shaping result/cache from numeric width only to reusable shape
  metrics sufficient for both width + visible glyph count (API names
  decided in implementation). Preserve `measureEm` compatibility or
  refactor callers coherently (DRY—one shape/cache miss).
- Cache key remains font/axes/features/language/direction/text.
- Metrics expose shaped glyph count (and cluster data only if needed for
  diagnostics/future work); counters/profiler hooks integrate if Phase 1
  added them.

**File**: `…/text-composition/composition-controller.ts`

- Candidate tracking width is computed across the WHOLE candidate line,
  not independently as source units per segment:
  - sum shaped glyph counts for visible source segments;
  - include conditional taken hyphen as one final glyph;
  - apply N−1 gaps globally;
  - distribute per-run tracking values with preceding-run ownership at
    boundaries (implementation must retain each run’s gap value);
  - no trailing gap after ordinary final glyph or final hyphen.
- Spaces remain glyphs for tracking and also receive wordspace delta.
- Ligature count follows shaping/features naturally.

**Viewer/applicator contract**

- Continue applying CSS letter-spacing per run fragment.
- Add focused local browser probe only as diagnostic documentation; do
  not make browser pixel matching/cross-platform screenshots acceptance.
- Document known potential browser divergence and future direct-render /
  applicator options.

**Tests** (real font/HarfBuzz + pure candidate arithmetic)

- plain Latin N−1;
- one glyph = 0;
- `fi` liga on (1 glyph) vs `-liga` (2);
- base+combining mark;
- surrogate-pair/emoji covered by chosen font or controlled fake shape
  result;
- multiple source segments same run;
- mixed run styles/tracking values, preceding run owns boundary;
- taken hyphen adds one glyph/gap before it only;
- wordspace + tracking composition.

### Success Criteria

#### Automated

- [ ] Tracking tests pin every agreed rule.
- [ ] No duplicate shaping for width + glyph metrics on cache hits.
- [ ] Full suite/lint/typecheck green.

#### Manual

- [ ] Diagnostic browser probe documented; visible discrepancies are
      understood as renderer variation, not test failure.

---

## Phase 6 — Demand-aware reprofile, optimize, baseline + ROADMAP

### Overview

Repeat Phase 1 after all correctness/lifecycle work; optimize only
measured dominant bottlenecks, then establish Cycle-1 baseline.

### Changes Required

**Perf/profile harness**

Run full matrix with agreed sampling:

- editor-only no consumer: None/Ragged/Fit;
- viewer lazy and sync: None/Ragged/Fit;
- compare where useful;
- initial subscribe: first/all results;
- typing, relevant/irrelevant style, full recompose;
- first/last consumer and None/active transitions;
- sync task drain vs async runner overhead.

Compare before/after:

- wall distributions;
- CPU dominant stacks;
- shape/cache/probe/span counters where available;
- no-demand and steady-None structural zero-work.

Apply only bounded, reviewable optimizations justified by profiles
(possible known surfaces: planner work on Ragged payloads, late
ingredient filter, repeated candidate sums/reshapes, console logging—
none pre-approved without data). Reprofile each accepted optimization.

**Baseline**

- Review results with operator.
- Write baseline only deliberately after scenarios/fixture/mode are
  validated.
- Keep regular quick regression command and explicit heavy profile mode.

**ROADMAP**

- Mark Cycle 1 done; record numbers, lifecycle/task/measure/tracking
  contracts, remaining bottlenecks and handoff to Cycle 2.

### Success Criteria

#### Automated

- [ ] Complete matrix/result schema passes.
- [ ] Baseline rerun passes absolute/ratio gates.
- [ ] 1920/1600 fixture identity validated.
- [ ] Full suite/lint/typecheck green.

#### Manual

- [ ] Operator reviews profile evidence + accepted optimizations/baseline.

---

## Testing Strategy

### Behavior over implementation

Tests assert observable lifecycle/work outcomes, not private helper
names:

- no demand → no publication/no shaping/no algorithm;
- demand transitions → current result/unpublication;
- sync/async same snapshot; stale task cannot publish;
- viewer source and composition are from same immutable snapshot;
- known measure → known breaks/treatments;
- shaped glyph input → known tracking gaps.

Structural profiler metrics may be asserted only through the generic
public snapshot interface (if Phase 1 proves hooks necessary), not by
mocking private methods.

### Fixtures

- Small controlled TypeStage state/HTML promoted into tracked test
  fixtures; no dependency on `downloads/`.
- Real Roboto Flex + HarfBuzz where shaping matters.
- Verified wikipedia state for large performance only.

### Performance tests

No brittle wall-clock assertions in Vitest. Browser benchmark owns
performance thresholds; behavior tests own zero-work/count invariants.

## Documentation

- Research doc gains Phase-1 before/after numbers and profile findings.
- Generic metric catalog documents every hook if instrumentation lands.
- Cooperative task protocol gets an authoritative design header in its
  module; scheduling/reveal/staleness contracts also reflected in
  `composition-controller.ts`/ROADMAP.
- Tracking semantics documented in contract/Measurer/controller.

## Sub-RPI Handoff Rule

If Phase 1 profiling identifies a large bottleneck whose fix would
balloon Phase 2–6 (e.g. scope-resolution/update-relevance redesign),
stop and create a sub-RPI handoff: current plan, this research doc,
relevant design headers, profile artefacts/summary and exact observed
cost. The operator drives that cycle separately, then this plan resumes.
