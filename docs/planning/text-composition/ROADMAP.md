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
| 2 | Simple greedy alignment (ragged) | planned |
| 3 | Greedy ragged + hyphenation (Host control, not an algorithm) | planned |
| 4 | Greedy-fit (varla-varfo strategy, predictively; validation milestone) | planned |
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

## Follow-ups deferred during milestone 1 — execution order

Dependency-ordered (agreed 2026-10-03). Details in the linked code
comments.

**Sprint A — "measurement truth"** (gates milestone 2: without true
widths no breaking algorithm's output is judgeable):
1. Per-typeSpec fonts (v0 measures with the app ROOT font object;
   per-run font resolution typeSpec → installedFonts).
2. Measurement at the current axes location (v0 shapes at the
   font's DEFAULT location, no setVariations; comes with the
   Treatment Planner later, but the current location belongs here).
Ride-along: property-aware filtering (see optimizations) — cheap
while touching the drive.

**Sprint B — performance baseline + testing harness** (they build
on each other: performance needs a rather complete harness anyway;
the baseline must measure the REAL pipeline, i.e. after Sprint A):
- Testing harness: integration tests for the composition pipeline,
  asserting composed line structure FROM DOCUMENT INPUTS (behavior,
  not implementation).
- Baselines: dummy (infrastructure overhead of
  segment/measure/publish/apply) and OFF (browser line breaking);
  needed BEFORE real algorithms so their cost is judged against
  numbers, not feelings.

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

## Optimization opportunities (deferred)

- **Style-triggered recomposition precision**. Post-pivot state: the
  meta drives recomposition per node when its scope rebuilds, so
  PER-NODE affectedness is largely structural (a typeSpec change
  recomposes only nodes whose scope actually rebuilds via the
  identity-guarded cascade — NOT the full document). Still open:
  1. **Property-aware filtering**: non-compositional properties (e.g.
     backgroundColor) currently still trigger recomposition of the
     affected nodes (any typeSpec edit produces a new typeSpecnion
     identity → scope rebuild → drive fires). The dirty decision
     should depend on WHICH property changed — skip recomposition
     when no composition-relevant property (widths, font, size,
     axes, line height…) differs. The scope's generators or a
     property-diff at the drive are the natural hook.
  Great optimization once documents grow.

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
