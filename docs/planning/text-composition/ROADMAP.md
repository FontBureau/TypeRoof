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
| 1 | **Full Host executing the dummy end to end** (viewer, live feedback) | 🔜 next |
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

## Before real algorithms (after milestone 1)

- **Performance baseline**: measure composition cost with the dummy
  and OFF as baselines (dummy = infrastructure overhead of
  segment/measure/publish/apply; OFF = browser line breaking).
  Needed BEFORE implementing real algorithms (greedy, KP++), so
  their cost is judged against numbers, not feelings. Off mode is
  also the comparison mechanism (see OFF MODE in the controller
  header).

## Technical debt

- **`typeroof-composition-run` carrier span**: a mark-less composed
  text run wraps its line spans in a neutral carrier span because
  the AttachmentRegistry tracks ONE outermost node per attachment
  and a bare text node can't host spans. Removal path: marker-based
  attachment boundaries in the registry (comment-node pairs, the
  React/Vue fragment pattern) — a contained refactor of
  AttachmentRegistry/insertRendererNode, deferred past milestone 1.
  (The PM editor world never has this edge case: nodeViews always
  wrap in elements.)

## Optimization opportunities (deferred)

- **Style-input dirty precision**: v1 marks ALL paragraphs dirty when
  style inputs (typeSpec/stylePatches/nodeSpecToTypeSpec) change.
  Refinements:
  1. **Property-aware filtering**: non-compositional properties (e.g.
     backgroundColor) should not trigger recomposition at all — the
     dirty set depends on WHICH property changed, not just that a
     style input did.
  2. **Per-node affectedness**: a typeSpec change should recompose
     only the document nodes whose resolved typeSpec is affected —
     compare per-paragraph resolved typeSpecProperties ids (the
     meta's own identity guard) and mark only those.
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
