---
title: Text Composition - Roadmap
eleventyNavigation:
  parent: Planning
  key: text-composition-roadmap
  title: 'Text Composition: Roadmap'
  order: 50
agent-created: true
---

# {{title}}

> High-level tracking document for the text-composition sub-module
> (`lib/js/components/layouts/type-stage/text-composition/`). The
> authoritative design details live in the headers of
> `composition-types.ts` (the contract) and `composition-controller.ts`
> (roles, milestones, integration, scheduling). This roadmap tracks
> status and direction, not design detail.

## Vision

Production-grade justification and text composition for TypeRoof's
type-stage, going beyond Knuth-Plass: variable font axes are used to
narrow/widen lines, predicted analytically (pre-measured HarfBuzz
advances) instead of the render-measure-render feedback loop of the
varla-varfo demo. Prior art: `videoproof-contextual/layout.mjs`
(pure/impure split), `varla-varfo/lib/js/justification.mjs` (the demo).

## Architecture in one paragraph

The task splits into two sides of a typed contract
(`composition-types.ts`): the **Host** (environment-facing: Segmenter,
Hyphenator, Measurer, Treatment Planner, Applicator, Controller) and
the **Algorithm** (pure: `CompositionInput → CompositionResult`,
DOM-free, vitest-testable). The Algorithm sees ONE logical paragraph,
never the DOM, fonts, or axes; line adjustment is one normalized
per-line number (`adjustmentStep`: 0 natural, −1 max narrowing,
+1 max widening, asymmetric), its physical meaning being Host policy.
Integration hook: the DocumentNodesMeta tree (mirrors the metamodel
NodeModel source of truth); results published via a
`composition@<documentNodePath>` protocol — compose once, apply to
multiple renderers. Viewer is the centerpiece applicator (span-based
CSS); the ProseMirror editor is experimental/later. OFF MODE (no
composition@ entries) keeps browser line breaking as comparison
baseline and capability fallback.

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| — | Contract + roles + integration plan | ✅ done (design) |
| — | Dummy algorithm + tests (ingredient for 1) | ✅ done |
| 1 | **Full Host executing the dummy end to end** (viewer, live feedback) | ✅ done (2026-10-03, …0794df35) |
| 2 | Simple greedy alignment (ragged) | ✅ done (2026-10-03, …5cf69417) |
| 3 | Greedy ragged + hyphenation (Host control, not an algorithm) | ✅ done (2026-10-04, ec5593e0..9cde3814) |
| 4 | Greedy-fit (varla-varfo strategy, predictively; validation milestone) | ✅ done (2026-10-05, 8e50f2da..521db920) |
| 5 | Knuth-Plass++ (the target) | planned |

## Model integration (model-first)

The opt-out mechanism is wired model-first into the TypeSpecModel,
starting with a minimal kick-off property: a boolean (when true,
composition is active for the typeSpec; when false/unset → OFF
MODE). Default: TRUE during implementation — composition is
exercised on every document without having to enable it first,
i.e. less manual testing; it is quick to flip later. Because it lives in the TypeSpecModel it flows through the
existing typeSpecProperties@/nodeProperties@ distribution to the
Controller like any other typographic property — and, per the
scheduling plan, changing it on rendered nodes triggers
recomposition (or un-application) through the normal cascade.

Later the boolean evolves into a dynamic struct selecting the
composition algorithm (dummy, greedy, greedy-fit, KP++). That
struct will also carry the non-algorithm configuration (Treatment
Planner potentials, hyphenation controls, …); its shape needs
thorough design and is deliberately deferred — the boolean is the
minimal viable seed that already exercises the full
model → controller → applicator wiring.

## Milestone 1 — sprint sketch

Smallest vertical slice, Controller first (live feedback early):

1. **Controller plumbing against DocumentNodesMeta** — observe one
   textblock node, publish `composition@<path>`. Highest risk, least
   charted; do first. (RPI sprints via `/research_codebase`.)
2. **Segmenter v0** (pure): split at spaces only (UAX#14 refinement
   later), no hyphenation. Unit-tested.
3. **Measurer v0**: HarfBuzz shape per segment, cache in font units;
   the dummy barely needs widths (overfull diagnostics only) — may be
   stubbed initially.
4. **Viewer Applicator**: wrap lines in spans + CSS custom properties
   per the published result.

## IMPORTANT — beyond this roadmap: font coverage & fallback

Verified by measurement probe (2026-10-03): CJK text in Roboto Flex
shapes entirely to glyph 0 (.notdef, 0.44em) — we MEASURE ~56pt
where the browser RENDERS ~126pt via per-character font fallback.
Consequences: overfull never flags for uncovered text; fitting is
wrong for it. Now that we inspect the text this closely (HarfBuzz
shaping per run), we have real handles:

1. **Missing-glyph diagnostic** (first): detect glyph-id 0 in
   shaping, flag segments/lines — "your font does not cover this
   text" is exactly what a proofing tool should say.
2. **Font fallback measurement** (the feature): browsers fall back
   per character; our pipeline measures everything in the run's
   font. The dynamic asset machinery (milestone 3: patterns) is the
   same machinery that could load fallback fonts on demand.

Deliberately NOT in the milestone-3 stretch: UAX#14 makes CJK BREAK
correctly (break opportunities don't need accurate widths); widths
stay approximated by .notdef advances until fallback lands.

## Follow-ups deferred during milestone 1 — execution order

Dependency-ordered (agreed 2026-10-03). Details in the linked code
comments.

**Sprint A — "measurement truth"** ✅ DONE (2026-10-03,
0e663a9d..22d4f347): per-textblock fonts (specific/font from the
properties stream), measurement at the true axes location +
features/language/direction, LRU-bounded caches, nowrap on composed
textblocks, and the ride-along input-equality filter (what we
consume is what invalidates — no hand-maintained relevance list).

**Sprint B — performance baseline + testing harness** ✅ DONE
(2026-10-03, a53a139a..5a957cd8): buildWorld options (real font +
harfbuzz); five structure tests asserting composed line structure
FROM DOCUMENT INPUTS (payload + DOM, off mode, edits);
`npm run perf:composition` (typing bursts + full recompose, ON vs
OFF, machine-stable overhead ratio) with a checked-in snapshot and
1.5x regression exit; first baseline: typing ~1.10, recompose ~1.0
at wikipedia scale — the dummy infrastructure is cheap, ready to
judge real algorithms. Fixtures: type-stage default state (small,
lib/js/tests/fixtures/) + wikipedia snapshot (large,
docs/states-library/fixtures/ — explicitly not a demo).

**Milestone 2 — greedy ragged** (now judgeable, with baseline).

**Milestone 3 — hyphenation, paired with UAX#14 segmentation**
(both are Segmenter/Hyphenator work; Intl.Segmenter is the obvious
implementation source — doing them together avoids segmenting
twice).

**Milestone 4 — greedy-fit**, requires the Treatment Planner (the
potentials design — the biggest remaining design piece) and
benefits from per-typeSpec/nodeProperties engagement (composition
engages per textblock on the local/inherited textComposition
value; parts of a document opt out individually while tuning).

**After the hot phases** (the plan makes these feasible as
afterthoughts):
- Optical alignment / margin protrusion (hanging punctuation) —
  Host-side, transparent to the Algorithm (composition-types.ts).
- Scheduling items: compose-before-reveal on initial load, async
  per-dirty-paragraph steady state, workers when algorithms get
  expensive (the scheduling section in composition-controller.ts).
- ProseMirror editor applicator (decorations spike, only after the
  viewer is sealed; PM may fight us — viewer alone is good enough).

**When cases arise (not scheduled):**
- Schema-driven inline classification (segmenter extension point;
  freely configurable schemas bring cases like links as inline
  blocks).
- Atom box measurement (inline atoms measure 0 in v0).
- ALL-CAPS hyphenation: hypher hyphenates all-caps words
  (observed 2026-10-04: "EDITEDCOMPOSITIONPROBE" -> EDIT-ED-…) —
  typographically debatable (TeX \uchyph=0 territory); a candidate
  gate for the hyphenator when a real case complains.
- Test-infrastructure limitation (observed 2026-10-04): the
  text-composition harness's fixed tiny measure packs ~one word
  per line regardless of font size (lineLength is en-relative, the
  zone width is jsdom-fixed) — line-break MOVEMENT and overfull
  correctness are not assertable there. Milestone 5 (KP++) will
  need a controllable harness measure (a layout-geometry fixture
  or a working manual horizontal layout in jsdom).

- ~~Runtime asset loading (language switch)~~ RESOLVED
  (3731d2de, metamodel: invalidate stale child proxies after
  partial metamorphosis, with a metamodel test suite). Verified by
  puppeteer probe: boot loads en-us; a runtime switch to de derives,
  fetches and installs de — zero errors. The separate
  dependency-consumption hazard remains documented in 3731d2de's
  commit message for a future refactor.

## Optimization opportunities (deferred)

- ~~perf:composition false absolute-ms regressions~~ RESOLVED in
  milestone 4: the old fixture URL required Eleventy and silently
  loaded fallback HTML; the harness now stages the checked-in state
  under Vite, verifies 1087 text nodes + expected layout, and
  selects the algorithm it claims to benchmark. The greedy-fit
  baseline's absolute and ratio gates reproduce.

(The property-aware filtering was resolved in Sprint A by the
input-equality filter: the drive compares consumed ingredients, so
non-compositional edits recompose nothing; per-node affectedness is
structural via the identity-guarded scope cascade.)

## Per-run style spans ✅ DONE (2026-10-04, 332ae5b5 + 54e63c88)

Runs (leaves) are measured at their resolved style: each text leaf
resolves its EXCLUSIVE style link (marks are style-exclusive by
contract — `styleLinkProperties@` is the full story; a >1 violation
fires a console.error guard, innermost wins) and the controller
reads the registered StyleLinkLiveProperties (the same resolved
typeSpec cascade + patch merge the viewer's styler consumes).
Segments and hyphen widths are measured per leaf; per-leaf style
keys are input-equality ingredients, so patch-content edits
recompose consumers through the normal (unpruned) meta cascade —
no subscription machinery needed (phase-2 erratum in the plan).
Regression tests: measurement tracks link/unlink and patch edits
(native + intent links); e2e: wdth-max bold re-measures and the
wrapper's font-variation-settings carries the same value
(measured == rendered). Perf: ratios 1.00/1.03 (noise level).

## Milestone 4 outcome ✅ DONE (2026-10-05)

Greedy-fit now executes the varla-varfo strategy predictively:
natural greedy break → narrow just enough to pull the next segment
(or break) up → otherwise widen toward the measure; last lines stay
ragged; exhausted potentials are visible in the diagnostics/color
coding. The model-first `TextCompositionAlgorithmGreedyFitModel`
selects treatment toggles, direction and the color-coding switch.
The Host's Treatment Planner resolves per-run, per-font potentials;
axis treatments are reshaped through HarfBuzz, tracking/wordspace
are added analytically, and the viewer applies the same concrete
values to line fragments (measured == rendered).

Implementation exposed and resolved several load-bearing issues:

- **avar1/avar2 anchoring** (`6183abd7`, design article next to this
  ROADMAP): tables express deltas around an authored default; axis
  triples are re-anchored to the run's actual location so step 0 is
  identity (AmstelvarA2 treatment was otherwise absent).
- **Taken-hyphen width only** (`a21865d2`): optional internal
  hyphens contribute no width; exactly one glyph is measured when
  the candidate actually ends at a hyphen break. This restored the
  invariant that narrowed lines justify (reported 280pt document:
  narrowed lines within 0.00–0.81px; taken-hyphen line 1.58px).
- **Viewer activation/state-load ordering** (`3a3fd8b5`): attach the
  viewer after the always-active meta tree has updated/pruned,
  fixing shape-shrinking state-file loads.
- **Complete hyphenation assets + direct loading** (`3da72196`,
  `521db920`): all 39 pinned upstream bramstein patterns are
  reachable; effective TypeSpec AND simple style-patch languages
  yield direct session-only requirements. No pattern bookkeeping
  is serialized.

Performance harness correction + baseline: the old command selected
greedy-ragged and its docs URL could silently load fallback HTML.
It now selects greedy-fit, stages/verifies the real wikipedia-scale
fixture (1087 text nodes) under Vite, and fails loud on a small
fallback. Stable 30-cycle ratios: typing 1.01–1.03; full recompose
1.23–1.27 (candidate reshaping), below the 1.5 regression gate.
Baseline re-written at `521db920`; a post-write run passed all
absolute + ratio gates.

Known fidelity item for future treatment-planner work: tracking
width arithmetic currently counts source code units while CSS
letter-spacing follows its own text/glyph spacing semantics; add a
focused Unicode/ligature parity probe before relying on tracking
for KP++ quality scoring.

## Next execution cycles (post-milestone 4)

Dependency-ordered (agreed 2026-10-05). Each numbered item is its
own RPI cycle (`/research_codebase` → `/create_plan` →
`/implement_plan`), kept small/reviewable rather than folded into
one oversized milestone-5 plan.

### Cycle 1 — KP++ prerequisites: performance truth, demand, controllable measure + tracking truth

**Status: ✅ done (2026-10-06, a25ca18f..21a57d0b).** Items 2–4 are
delivered and locked by behavior tests: the per-textblock demand
lifecycle (`composition@<textblockPath>`; editor-only performs zero
segmentation/shaping/algorithm work — enforced structurally by tests,
not by benchmark), a cooperative task runner with atomic viewer
snapshots (lazy reveal default, `flushSync` for sync reveal),
composition consuming local `layout/columnWidth` (the same resolved
fact AutoLinearLeading uses; deterministic 280/220pt Host fixture),
and tracking from HarfBuzz shaped-glyph gaps (N−1 per line, continuous
across runs, taken hyphen final). Item 1 was delivered as tooling
only: the perf harness (`scripts/perf-composition`, quick/full suites)
plus the Phase-1 numbers below. The planned demand-aware full-matrix
reprofile and new baseline were descoped: the zero-work guarantees are
already enforced by tests, no optimization decision is pending, and
the exhaustive matrix proved too slow and fragile for routine use (see
`agentic-artefacts/thoughts/notes/2026-10-06-phase-6-session-failure-log.md`).
The harness remains an on-demand diagnostic; establish a fresh
baseline when KP++ creates an actual comparison. The "Open performance
regression" section below remains unresolved and carries into Cycle 2.

Do this FIRST. We need to know the real costs, stop work nobody
consumes, and make measurement/Host tests trustworthy before adding
a paragraph-wide search algorithm. Sub-phases are dependency-ordered:
profile before optimizing; establish demand semantics before the
final perf baseline; then complete the quality harness.

1. **Performance ground truth + bottleneck profiling.** The existing
   ON/OFF whole-cycle ratio is only a regression smoke test, not an
   explanation. Investigate initial load, warm/cold typing,
   composition-relevant style edits and full recomposition on both
   the small deterministic fixture and verified wikipedia state.
   Cover editor-only, viewer-only/compare, algorithm None and
   Greedy Fit. Instrument composition-specific work (textblocks
   driven/skipped/published; segmentation/hyphenation; algorithm
   and `lineWidthAtStep` probes; Measurer calls, cache hits/misses,
   HarfBuzz font creation/shape calls; applicator span work) and
   capture browser CPU/trace profiles through Puppeteer/DevTools.
   Report absolute costs, ratios and dominant call stacks; optimize
   measured bottlenecks, not assumptions. Keep perf fixture identity
   validation so HTML/tiny fallbacks fail loud.
2. **Demand-driven composition lifecycle.** Composition must run
   only while at least one renderer/applicator consumes
   `composition@` results. Editor-only mode currently has no
   consumer and must do zero segmentation, shaping or algorithm
   work; the future editor applicator opts in explicitly. Use an
   explicit consumer registration/ref-count/token lifecycle (not a
   guess from protocol internals): first consumer activates and
   triggers current textblocks; last consumer stops work and removes
   stale publications as required. Likewise, an active viewer with
   algorithm `None (Browser)` must pay no recurring composition
   work after the one transition that unapplies an existing result;
   locally-off textblocks get the same fast path. Lazy-initialize
   expensive Host state where useful. Add structural counters/tests
   proving no-consumer/None modes invoke zero expensive roles and
   that activation/deactivation still composes/unapplies correctly.
   Re-profile all modes after this phase and make the validated
   demand-aware results the Cycle-1 performance baseline.
3. **Controllable composition test measure.** The current jsdom
   harness has degenerate geometry and often packs roughly one word
   per line. Build a deterministic layout-geometry fixture (or make
   manual horizontal layout work in the harness) so Host integration
   tests can assert break movement, overfull behavior and
   paragraph-quality comparisons at a known measure. Pure algorithm
   tests still inject widths, but are not enough to prove wiring.
4. **Tracking/CSS measurement parity.** Current predictive tracking
   math counts source UTF-16 code units; CSS `letter-spacing` may
   differ for ligatures, combining sequences, surrogate pairs and
   complex shaping/clusters. Probe HarfBuzz vs browser, define the
   correct gap/cluster-count model, implement it, and lock it with
   real-font behavior tests. Do not base KP++ badness on tracking
   until this is measurement-truthful.

#### Open performance regression: editor typing remains slow

Cycle 1 demand gating removes all composition publications and deep
composition work in editor-only mode, but the current branch's editor
typing regression remains visibly slow. The Phase-1 wikipedia numbers
show why demand gating alone is not expected to fix the interaction:
editor typing medians were 247.1ms for None, 256.6ms for Ragged and
266.5ms for Fit, so eliminating composition accounts for only roughly
10–20ms of that scenario. After the demand change, editor-only manual
verification confirmed zero composition publication logs while the
slow interaction remained.

Treat this as an explicit unresolved regression. The likely remaining
cost surfaces are the always-active DocumentNodesMeta traversal, scope
resolution/cascade, ProseMirror updates and the general shell state
transaction. Attribute it with a focused editor-only CPU profile before
optimizing; do not infer that composition still runs merely from the
remaining latency. Publications in viewer and compare are expected
because their viewer applicator holds demand.

Manual reproduction also found an existing ProseMirror cursor-jump defect
when typing rapidly inside an intent-style mark: the cursor can move to the
mark end or before the mark. It occurs in editor-only mode and on main as
well, but becomes much easier to trigger when editor updates are slow. Treat
this as a latency-amplified pre-existing editor correctness regression, not
as evidence that viewer composition mutates the editor DOM. The likely race
is between queued shell/metamodel synchronization and ProseMirror's own
selection/mark-view lifecycle (including asynchronous intent-mark tag
correction). Preserve selection and the active intent mark across rapid
transactions, and include this exact typing case in the focused editor-only
profile/follow-up.

### Cycle 2 — Milestone 5 research/design: Knuth–Plass++

Research and specify before implementation:

- candidate graph / dynamic programming (break opportunities as
  nodes; candidate lines as edges; mandatory explicit breaks;
  infeasible/exhausted candidates);
- badness/demerits over normalized, ASYMMETRIC adjustmentStep;
- break penalties (hyphenation included), consecutive-hyphen policy,
  fitness classes / adjacent-line step discontinuities, last-line
  behavior and unsatisfiable-line costs;
- candidate step solving via `lineWidthAtStep`;
- diagnostics (chosen demerits/badness, rejected candidates,
  exhausted potential, useful color coding);
- performance: candidate-width/step memoization and graph pruning;
  workers remain later unless measured cost requires them.

### Cycle 3 — Milestone 5 implementation: Knuth–Plass++

Implement the pure algorithm in reviewable phases, then wire it
model-first into the existing textCompositionAlgorithm dynamic
struct. The Host/contract should need no redesign: UAX#14 breaks,
hyphenation penalties, per-run measurement, conditional taken-
hyphen width, Treatment Planner and predictive `lineWidthAtStep`
are all ready. Validate with pure algorithm tests, the Cycle-1 Host
harness and the wikipedia perf fixture.

### After KP++ — choose the next productization track

Two independent tracks; choose priority from real use:

1. **Editable justification potentials.** Document-scoped flexible
   metamodel/storage + UI, multi-font best-fit matching, arbitrary
   ordered design-space dimensions/depth, monotonic stops,
   font-author tooling; eventual font-table distribution. Includes
   later potential-policy work: per-treatment impact/order,
   inter-line harmonization, unified headline wdth treatment and
   dedicated tables when shared/re-anchored deltas are insufficient.
2. **Font coverage/fallback.** Missing-glyph/coverage diagnostics
   first, then browser-equivalent per-run font-fallback measurement
   and dynamic fallback-font loading. Chinese may wait for an
   intended font; Greek/Russian can be investigated sooner when
   they expose general measurement issues, without blocking Latin
   KP++ by default.

## Milestone 4 design notes (potentials / Treatment Planner)

Terminology: "justification spec" (varla-varfo) is renamed to
**justification potentials**, short "potentials" ("we ran out of
narrowing potential, hence we try widening now"). Research:
`docs/planning/agentic-artefacts/thoughts/research/2026-10-04-1644-justification-potentials.md`.

Core model: potentials map a **design-space location** to
treatments. Levels navigate by AXIS VALUES ONLY — the third level
of the stubs is the run's **opsz value**, not its font size (an
explicit opsz is the author declaring optical intent; potentials
follow it). A leaf holds the treatments:
`{XTRA: [min,dflt,max], tracking: [min,0,max], wordspace: [min,0,max]}`
— axis treatments as [min,dflt,max] axis values; tracking =
ABSOLUTE pt letter-spacing per glyph (keyed by the opsz-declared
optical size); wordspace = FACTOR of the natural space advance
(0 = natural). Step semantics: one normalized per-line step drives
all enabled treatments in parallel, per-side linear maps, clamp at
±1 (|step| > 1 = unsatisfiable, per the contract).

Deferred: **potentials storage + metamodel** (the open question).
The design constraints discovered (for when it lands):

- Tables declare their own ORDERED dimension tags ([wght, wdth,
  opsz] for the stubs; authors may use other axes or deeper/
  shallower nesting — the structure must be flexible). Each level
  may bottom out as a leaf.
- Entries within a level must be numerically MONOTONIC (validated
  — a coherence function is the natural place; ascending or
  descending both legal; [8, 144, 14] is invalid). Keep
  declaration order: insertion-ordered structures only — an
  alpha-key-ordered map would corrupt a descending declaration
  ("144" < "24" < "8").
- Font entries CANNOT carry potentials: deferred-font
  serialization keeps only name+version+origin; extra fields
  silently drop (shell.mjs). The document-scoped landing spot is a
  root ordered-map field next to stylePatchesSource in
  createTypeStageModelVariantWithDefaults (serializes free).
- Discovery is BEST-FIT, most-specific-wins: a table's description
  is family-name match + the navigation axes it needs (all present
  in the font's axisRanges); Roboto Flex and Roboto Delta are
  sufficiently compatible (Delta resolves to the Flex table).
  fullName is a brittle key (origin prefix + massaged version).
- Future: font authors define potentials for their fonts using our
  software; distribution may eventually travel with the font
  (e.g. a new font table). Until then: demo territory — stubs in
  code, ad-hoc document-scoped definitions when editing lands.

Also deferred from milestone 4 scope: inter-line harmonization
factor (headlines), folding the demo's wdth headline stub into the
unified structure, per-treatment impact weights (the demo's own
TODO), Amstelvar avar1/avar2 table variants.

## Milestone 2 extras (beyond the algorithm)

- **Metamodel fix** (52defebd): hasWrapped guards in
  dynamic-struct-model.ts — clearing a selected dynamic-struct
  typeKey (empty = inherit) no longer crashes; regression tests at
  components/dynamic-types-pattern.test.mjs.
- **Per-typeSpec algorithm selection + configuration**: the
  textCompositionAlgorithm dynamic struct (horizontalLayout
  precedent), with its UI select control (Dummy config renders).
- **Engagement IS the algorithm selection**: no boolean — "None
  (Browser)" is the explicitly-off, inheritable type (config room
  for browser-side CSS). The perf script toggles ON=greedy,
  OFF=none.
- **Perf re-baselined**: typing ~1.02 / recompose ~0.96 with
  greedy-ragged — overhead is noise-level at wikipedia scale.

## Key design decisions (log)

- Working principle: ALWAYS approach model-first — especially once
  we leave "dummy" implementation ground behind. New capabilities
  enter through the metamodel (minimal kick-off properties, later
  thoroughly designed structs), not through ad-hoc wiring.

- Host/Algorithm contract; Algorithm entirely pure, Host roles pure
  where possible (impurity at the edges: measurement in, rendering out).
- Normalized adjustment steps; asymmetric directions; `|step| > 1` =
  unsatisfiable line. The contract does not specify what a step
  applies physically (mechanism mix is Treatment Planner policy).
- Measurer caches in font units (em, size-independent); pt at the
  contract boundary (mixed-font lines need an absolute unit).
- Hyphenation is a pre-breaking Host control, not an algorithm variant.
- Logical paragraphs: hard breaks split Host-side; the Algorithm never
  sees them. Units are independent → parallel/lazy/dirty-paragraph
  composition. Cross-paragraph consistency = legitimate future
  refactor (in-between layer), not a contract add-on.
- Last line never widened (TeX `\parfillskip`); narrowing allowed when
  it "makes the line". `'explicit'` breaks: mandatory but fully fitted.
- Hybrid scheduling: compose-before-reveal on load; async per dirty
  paragraph in steady state. Staleness via immutable identity (`===`),
  no generation counters.

## References

- Contract: `lib/js/components/layouts/type-stage/text-composition/composition-types.ts`
- Plan: `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts`
- Dummy: `…/dummy-composition.ts` + test
- Integration target: `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`,
  `…/viewer.typeroof.jsx`
- Prior art: `lib/js/components/actors/videoproof-contextual/layout.mjs`,
  `varla-varfo/lib/js/justification.mjs`
- Design history: commits on `feature/composition-and-justification`
  (f612d7b6 … 537f86bb)
