---
date: 2026-10-12T21:27:00+02:00
git_commit: 98b99797
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Approach (a): font-size re-basing & node style links — implementation plan"
tags: [plan, font-size, type-spec, style-links, inline-nodes, composition]
status: approved-for-implementation
upstream:
  roadmap: docs/planning/inline-node-refinements/ROADMAP.md
  research: thoughts/research/2026-10-12-1723-font-size-resolution-and-rebasing.md
---

# Approach (a) — Font-size re-basing & Node Style Links: Implementation Plan

## Overview

Per ROADMAP approach (a) + the 2026-10-12 design conversation: (1)
`relativeFontSize` becomes a unit-carrying `{value, unit}` pair (plain
numbers migrate as `baseEm`, non-breaking); (2) `em` unit semantics
resolve in the MERGE channel (`createPatched`) against the origin
typeSpec's outbound effective font-size — the true relative basis for
style patches and marks; (3) inline nodes become a third style-link
family `inlineNodesStyleLinks`, routed to `UIDocumentStyleStyler`
(the mark styler) in both renderers, on a single-element inline DOM.
Approach (b) composition threading is already implemented (`6dbbf38e`).

## Current State Analysis

- `fontSize` is purely synthetic (`baseFontSize × relativeFontSize`,
  `properties-generators.mjs:209-244`); every consumer receives the
  pre-flattened number; nothing strips units (research §1).
- Patch scopes have no parent (`baseFontSize` falls to the model
  default 12): patches resolve against the ROOT base — the "bold: 2 →
  28pt instead of 36pt" defect (`live-properties.typeroof.jsx:225-344`,
  in-test documentation `index.test.mjs:984-988`; research §2).
- The merge channel already carries the needed basis:
  `PatchedScopeProperties` "parent" layer = origin outbound effective
  map incl. resolved `generic/fontSize` (`scope-resolution.mjs:370-414,
  :462-483`) — what measurement reads (`composition-controller.ts:913-933`).
- Inline nodes style exclusively via `UIDocumentTypeSpecStyler` (full
  block write set) with the root-fallback font basis
  (`integration.typeroof.jsx:226-231`); no inline branch exists
  anywhere in the stylers (research §2, task 2026-10-12 #11).
- The style-link pipeline is family-parametric except at enumeration
  points (TypeSpecModel fields, `styleLinksGen` list, StyleLinksMeta
  instantiations, pps-maps/defaults lists, editor ternaries, UI
  classes) — task 2026-10-12 #10 §4.
## Desired End State

- State authors write `relativeFontSize` as `{value, unit}` — units:
  `baseEm` (default; today's semantics), `em` (relative to the
  containing context's effective size), absolute (`pt`…). Existing
  plain-number states parse unchanged as `baseEm`.
- A style patch with `em` composes against the containing typeSpec's
  effective size (li 18pt × 2 = 36pt) in the SAME merged scope
  measurement reads — rendered and measured bases agree.
- An inline node styles like a mark: via an `inlineNodesStyleLinks`
  edge to a style patch, applied by `UIDocumentStyleStyler` on its
  single element; without an edge it INHERITS the containing context
  (no explicit font-size write — today's root-fallback 14pt write
  disappears; roadmap observation 3 fixed).
- Block nodes: zero behavior change (a1 realized by routing, not by
  branching; `UIDocumentTypeSpecStyler` serves blocks only;
  `baseFontSize` semantics untouched).
- Per-phase verification: `npm run typecheck`, `npm run lint`, vitest,
  puppeteer DEBUG harness (`scripts/debug-with-puppeteer.mjs` +
  `scripts/puppeteer-probes/`). `npm run perf:composition` OFF-LIMITS.

### Key Discoveries (load-bearing facts)

- Pair precedent (re-use per operator): `InlineLengthValueModel`
  struct + `unitValuePairCoherenceFn` + `UnitModel.enumItems` unit
  select — `type-spec/horizontal-layout-models.mjs:16-36`,
  `length-models.mjs:56-71`; pair defaults deserialization
  `defaults.mjs:199-215`; pair generator transport `_inlineLengthGen`
  `properties-generators.mjs:482-497` (task #8).
- PM natively supports `contentDOM === dom` (top doc desc + ALL marks
  — prosemirror-view dist :1519, :1234) and wholesale-removes non-desc
  children of `contentDOM` on sync (:1646-1662): single-element views
  must keep host children EMPTY — outfitter widgets already gate on
  `outer !== inner` and stay inactive (task #12).
- `UIDocumentStyleStyler` write surface = the a1 target surface exactly
  (font-family, font-size, features/variations, colors, direction,
  lang — `type-spec.typeroof.jsx:1008-1100`; NO width/text-align/
  margins/columns) (task #11).
- Dep-resolution shadowing trap: a synthetic dep on `generic/fontSize`
  resolves LOCALLY first (`scope-resolution.mjs:295-303`) — the em
  basis must NOT be threaded as a dep on that name into a scope that
  yields its own fontSize synthetic; the merge boundary (origin
  outbound) is the clean basis source (task #9).
- `getWrapMarks` is mark-list-only (`derivations.mjs:412+536`);
  composition `_resolveLeafStyleLink` (`composition-controller.ts:636-678`)
  resolves leaves against mark descriptors only — nested leaves under
  inline nodes need an explicit resolution extension (phase 6).
- Editor DOM split consumers: only 2 CSS selectors + the probe helper
  (`querySelector ?? el`, already tolerant) — `type-stage.css:157-160`
  (box-sizing; viewer parity :220-223 puts it on `*[data-node-type]`
  directly), `line-spans.css:81` (textblocks only — unaffected),
  `editor-dom.mjs:65/:90` (task #13).
## What We're NOT Doing

- NO α: no typeSpec-channel parent-basis synthetics; block font-size
  semantics unchanged (operator 2026-10-12: `generic/fontSize` is
  already the true em value — a parallel parent synthetic would fork
  the basis).
- NO `baseFontSize` change (kept as feature: mid-tree sub-document
  re-anchoring); NO key rename (`relativeFontSize` stays).
- NO inline-block / width path for inline atoms (a1 unconditional).
- NO `UIDocumentTypeSpecStyler.update` restructure or inline branch —
  superseded by routing (inline elements stop reaching it).
- NO composition geometry changes (the controller measures
  correctly; only leaf basis threading, phase 6).
- NO perf-composition runs; NO resolution machinery keyed on node
  kinds (units carry intent — convention over machinery).

## Implementation Approach

Six phases, marks/patches FIRST (operator: inline handling last, so
marks/patches are verified working before node routing):

1. Pair form (non-breaking) → 2. merge-channel `em` (patches/marks
fixed; live checkpoint) → 3. one-element inline DOM (PM-contract
change, probe-gated) → 4. `inlineNodesStyleLinks` + routing to the
mark styler → 5. "Node Style Links" UI wiring → 6. composition basis
threading + QA + state re-tuning.

Each phase ends with the verification battery + proposed commit;
pauses for operator confirmation (RPI protocol). Tests assert
behavior (inputs → observable outcomes), not implementations.
## Phase 1 — Pair-form `relativeFontSize`

### Overview
`relativeFontSize` becomes `{value, unit}`; plain numbers parse as
`baseEm` (today's semantics); states/fixtures unchanged.

### Changes Required

1. **Unit + value models** — `lib/js/components/type-spec/models.mjs`
   (near :153-176): `RelativeFontSizeUnitModel` enum
   `[...ABSOLUTE_UNITS, 'em', 'baseEm']`, default `'baseEm'`
   (`BlockMarginUnitModel`/`InlineLengthUnitModel` pattern:
   `models.mjs:153-159`, `horizontal-layout-models.mjs:16-21`);
   `RelativeFontSizeValueModel` struct: `['value', …OrEmpty],
   ['unit', …OrEmpty], unitValuePairCoherenceFn`
   (`length-models.mjs:56-71` re-used — `InlineLengthValueModel`
   precedent `horizontal-layout-models.mjs:25-30`); TypeSpecModel
   field swap at `models.mjs:184-188`; deserializer helper beside
   `:614-620`. Bare strings keep parsing (`FontSizeModel`) and read
   as `baseEm`.
2. **Generators** — `properties-generators.mjs baseFontSizeGen`
   (:195-207): yield the pair (value+unit) under
   `generic/relativeFontSize` (pair transport per `blockMarginsGen`
   :306-326 / `_inlineLengthGen` :482-497); `fontSizeGen.calculate`
   (:233-242): per-unit branch — `baseEm`/absent → `base × value`;
   absolute (`pt`) → `value`; `em` → parsed but NOT resolved in the
   typeSpec channel (α rejected) — semantics arrive with the merge
   channel in phase 2; document that in the code comment.
   STYLE_PATCH list (:676-700) re-uses the same generators.
3. **registered-properties** — `registered-properties.mjs:323-331`:
   pair default (precedents `columnGutter` :340-344, `blockMargins`
   :380-391); label unchanged.
4. **UI** — pair widget for the typeface sections:
   `type-spec-properties.typeroof.jsx:295-299` +
   `style-patches.typeroof.jsx:166-171` via `UIValueUnitPairInput`
   (`ui-margins.typeroof.jsx:12-89`, unit select from
   `UnitModel.enumItems` :68) — register in `type-driven-ui.mjs`
   pair entry (:497-504 pattern) for this key.
5. **Defaults** — `defaults.mjs` generic branch (:253-259): pair
   deserialization (precedent :199-215); field name unchanged, so
   `pps-maps.mjs` untouched.

### Phase 1 amendment (operator, 2026-10-12 — channel split)

`em` is NOT a typeSpec unit: `RelativeFontSizeUnitModel` (typeSpec
channel) = absolute + `baseEm` ONLY; the style-patch variant
(`RelativeFontSizePatchValueModel` / `RelativeFontSizePatchUnitModel`,
parameterized `typographyInlineMixinFor` — `TypeSpecModel` keeps the
typeSpec variant, `SimpleStylePatchModel` carries the patch variant)
adds `em`, resolved in the merge channel (phase 2). `calculate()`'s
`em` case (patch-channel input) remains the phase-2 placeholder.
Tests: the typeSpec variant REJECTS `em`; the patch variant
round-trips it (55 files / 537 tests). ROADMAP a2 table + decision
note updated.

### Success Criteria
- [x] `npm run typecheck` + `npm run lint` pass (2026-10-12)
- [x] vitest: models round-trip (pair / bare string / empty — 4 new
  RelativeFontSizeValueModel tests in models.test.mjs); text-
  composition suite green (doubling :929-941, clear-restore :984-1001 —
  setPatchRelativeFontSize/clear helpers adapted to the pair paths
  /instance/relativeFontSize/{value,unit}); `fundamentals.test.mjs` green
  (55 files / 534 tests)
- [x] All state files parse with zero value diff (pair default =
  baseEm → identical `generic/fontSize`); `qa-structure-marks.mjs`
  unchanged-green (PROBE PASSED, exit 0 — 152/153 nested composed,
  18.6667px/24px, identical to the pre-migration baseline)
- [x] Manual smoke: unit selector renders beside the value (operator
  confirmed 2026-10-12: `em` offered ONLY in the patch variant's unit
  dropdown, not in the typeSpec one)
## Phase 2 — `em` semantics in the merge channel

### Overview
A patch/mark edge with `{value, unit: 'em'}` resolves against the
origin typeSpec's outbound effective font-size — the same merged
scope measurement reads. Rendered and measured bases agree.

### Changes Required

1. **Basis plumbing at the merge boundary** —
   `scope-resolution.mjs createPatched` (:462-483): thread the origin's
   effective size (from the origin outbound projection, `:465-466`)
   into the patch synthetics. Decision point (in-phase, unit-test
   pinned): extend the calculate signature with a basis arg supplied
   per channel (typeSpec channel → null) vs a parent-only dep name
   never yielded locally (task #9 design-space B). Constraint: NO dep
   on `generic/fontSize` (local-first shadowing, :295-303).
   `PatchedScopeProperties` (:370-414) wires the resolution.
2. **Patch generators** — `STYLE_PATCH_PROPERTIES_GENERATORS`
   (`properties-generators.mjs:676-700`): `fontSizeGen.calculate`
   gains the em branch with the merge-channel basis; the FIXME
   (:687-692) is thereby addressed for the BASIS only — patch
   application semantics unchanged.
3. **Measurement consistency** — `composition-controller.ts:913-933`
   reads the merged payload `getProperties()`: verify no change needed
   (the basis arrives resolved inside the synthetic); if the merged
   leaf fontSize needs the em-aware path, extend there.

### Success Criteria
- [x] `npm run typecheck` + `npm run lint` + vitest green (2026-10-12,
  55 files / 538 tests)
- [x] NEW unit test: patch `{value: 2, unit: 'em'}` on an 18pt context
  → 36pt (origin outbound basis — the t1 chain: base 14 × 1.285714286);
  `baseEm` still × base (28pt); bare-string states unchanged
  (text-composition/index.test.mjs "per-run styles: patch unit 'em'
  composes against the containing context (merge channel)")
- [x] text-composition suite green (doubling/clear-restore semantics
  unchanged — the baseEm default keeps them byte-identical)
- [x] Automated probes: `qa-editor-mark-styling.mjs` (PROBE PASSED,
  exit 0) and `qa-structure-marks.mjs` (PROBE PASSED, exit 0 —
  baseline-identical)
- [ ] **LIVE CHECKPOINT (operator)**: marks/patches render + measure
  consistently

Implementation note: the basis-plumbing decision point resolved to the
alias mechanism — `PatchedScopeProperties` publishes the origin's
outbound effective `generic/fontSize` under `CONTAINING_FONT_SIZE`
(`registered-properties-definitions.mjs`) as the synthetic-dep source
for `fontSizePatchGen` (`properties-generators.mjs`, patch channel
only); the local channel never yields that name, so it cannot shadow
the patch's own `generic/fontSize` synthetic (the rejected dep-name
would cycle). The typeSpec channel's `fontSizeGen` lost the dead em
case (channel split); shared resolution in `resolveFontSizePairOnBase`.
## Phase 2b — Slot-in (operator, 2026-10-12): NO baseFontSize on style patches

### Overview
Patches are leafs — they neither inherit an anchored base nor re-anchor
one (the mid-tree sub-document feature is typeSpec territory); absolute
sizes are stated directly via the pair's absolute units; em/baseEm
compose against the containing context. The `baseFontSize` FIELD leaves
`SimpleStylePatchModel` (operator: "it doesn't make much sense").

### Changes Required (implemented 2026-10-12)
1. `models.mjs`: `typographyStylePatchPureModelMixin` (no
   baseFontSize) + shared `_typographyColorModelMixin`;
   `typographyInlineMixinFor(pureModelMixin)` takes the spread fields.
2. `properties-generators.mjs`: `baseFontSizeGen` split — the pair
   transport is now `relativeFontSizePairGen` (shared; the patch list
   uses it WITHOUT baseFontSizeGen); `fontSizePatchGen` reads no base
   field; the merged scope sources `generic/baseFontSize` from the
   ORIGIN typeSpec (as it already did for patches that never set one —
   no state carries a patch-level baseFontSize: fixtures verified).
3. UI: style-patches typeface section drops "baseFontSize";
   `removeItems` gains it (out of sections.rest); live-properties
   comment updated.
4. Legacy: operator downloads with a patch-level baseFontSize drop the
   field silently (lenient struct deserialization, non-strict).

### Success Criteria
- [x] typecheck/lint/vitest green (55 files / 538 tests; the em gate
  test holds: baseEm 2 → 28pt with the ORIGIN-sourced base, em 2 →
  36pt)
- [x] Probes: qa-structure-marks + qa-editor-mark-styling PASSED
  (exit 0)
- [ ] **LIVE CHECKPOINT (operator)**: style-patch UI shows no
  baseFontSize; absolute/em/baseEm patch sizes behave as before

---

## Phase 3 — One-element inline-node DOM

### Overview
Editor inline nodes render as a single element (`contentDOM === dom`),
matching marks and the viewer; the inner `div[data-node-content]`
disappears for inline. Blocks KEEP the two-element split (features,
parameters display, labels).

### Changes Required

1. **ProsemirrorNodeView** — `integration.typeroof.jsx:371-386`:
   branch on `node.type.isInline && !this._isReproducing` → no inner
   div; `_stylerDOM = this.dom`; `contentDOM = this.dom` (reproducing
   atoms unchanged — already single-element :362). FIXME :370-371
   (span) resolves: the spec tag IS the content container
   (`generic-inline` → `span`). PM contract (task #12): equality
   supported natively; children of `contentDOM` are PM-managed — the
   host must append NOTHING (renderDescs clobber, dist :1646-1662).
2. **structuralElements** — `integration.typeroof.jsx:394-400`:
   `{outer: this.dom, inner: this._stylerDOM}` — same element;
   widget activationTests already suppress parameters display
   (`type-spec.typeroof.jsx:708-712`) and labels (:812-817) when
   `outer === inner` — operator: inline nodes need neither.
3. **ignoreMutation** — `integration.typeroof.jsx:454-473`: align the
   equality case with `ProsemirrorMarkView` behavior; childList churn
   inside `dom` belongs to PM (no widgets live there).
4. **CSS** — `lib/css/shell/type-stage.css:157-160`: the `& >
   [data-node-content]` box-sizing selector — give inline
   single-elements the viewer-parity treatment (:220-223 puts
   box-sizing on `*[data-node-type]` directly); consolidate.
   `line-spans.css:81` untouched (textblocks keep their split).
5. **Tag-swap parity** — `_swapMarkElement`
   (`type-spec.typeroof.jsx:1443-1476`) assumes `contentDOM === dom`:
   inline nodes become eligible for `htmlTag` swaps (probe it).

### Success Criteria
- [x] `npm run typecheck` + `npm run lint` + vitest green (2026-10-13:
  55 files / 539 tests)
- [x] `integration.test.mjs`: NEW "renders editable inline nodes as
  a single element (contentDOM === dom)" — spec-tag element, no
  `[data-node-content]`, direct text, childElementCount 0, typing
  inserts inside (re-query after dispatch — PM rebuilds when
  update() rejects); the cite-link reproducing case + block split
  unchanged
- [x] Probe: NEW `scripts/puppeteer-probes/qa-inline-node-dom.mjs`
  (PROBE PASSED, exit 0): 153 generic-inline single-element, 253
  block content children kept, box-sizing: border-box via the new
  `:has()` rule, caret typing inside inline content lands + element
  stays single-element, typing/undo/copy-paste dispatch without
  PAGEERROR (text-revert coverage delegated to qa-compose-in-editor
  — its undo/redo PASS on this DOM)
- [x] **LIVE CHECKPOINT (operator)**: editor DOM parity (confirmed
  2026-10-13: "live looking good")
## Phase 4 — `inlineNodesStyleLinks` family + routing

### Overview
Third style-link family keyed on node type keys; inline nodes route
to `UIDocumentStyleStyler` (mark styler) in both renderers; the block
styler stops serving inline elements entirely.

### Changes Required

1. **Models** — `type-spec/models.mjs`:
   `InlineNodeStylePatchLinkModel` (mixin :371-386, NO tag — tags come
   from node specs), `InlineNodesStyleLinksMapModel` (ordered map,
   :399-407 pattern); TypeSpecModel fields beside :525-526.
2. **Prefix + inheritance** — `registered-properties-definitions.mjs:38-39`:
   `INLINE_NODES_STYLE_LINKS = 'inlineNodesStyleLinks/'`;
   `styleLinksGen` (`properties-generators.mjs:435-446`) third entry —
   the single inheritance chokepoint.
3. **Payload registration** — `meta.typeroof.jsx:281-324`: third
   StyleLinksMeta instantiation `("inlineNodesStyleLinks",
   INLINE_NODES_STYLE_LINKS)` — `getStyleLinkPropertiesId`
   (`derivations.mjs:389-405`) is already parametric.
4. **Bookkeeping** — `pps-maps.mjs:53-56, :109-112`;
   `defaults.mjs:165-166` (`_skipPrefix`).
5. **Viewer routing** — `viewer.typeroof.jsx`:
   `UIDocumentElement._provisionWidgets` (:496-507) branches on
   inline-ness (context `inInlineContext` / rendering plan): inline
   elements get a style-styler wrapper (the
   `UIDocumentTextRun._createStylerWrapper` pattern :877-905) with
   `_getStyleLinkPropertiesId(typeSpecPropertiesPath,
   'inlineNodesStyleLinks', typeKey)` (:963-968 pattern); NO
   `_provisionTypeSpecStyler` for inline.
6. **Editor routing** — `type-spec.typeroof.jsx`: inline node
   subscriptions provision `UIDocumentStyleStyler` (deps:
   `properties@` ← styleLink id, rootFont, verboseFontVariationSettings
   — the `_createStyleStylerWrapper` pattern :1226-1244) instead of the
   outfitter's dynamic block styler; resolution replaces the `isIntent`
   ternary (:1190-1191) with a three-way lookup incl. node type keys;
   declaration (`_hasStyleLinkDeclaration` :1302-1314) → no styler
   (inherit).
7. **a1 realized** — inline elements no longer reach
   `UIDocumentTypeSpecStyler`: block write set (width, text-align,
   block margins, columns, display:block) never applies to inline;
   font-size comes from the style-link payload
   (`properties-util.mjs:36-41`) or not at all (inherit).
8. **Editor style menu** — unchanged: intent-only (:2401-2427).

### Success Criteria
- [x] `npm run typecheck` + `npm run lint` + vitest green; parametric
  style-link tests extended to the third prefix (type-specnion.test.mjs,
  text-composition/index.test.mjs :729/:825/:880 patterns) — committed
  `6394787b` (2026-10-13)
- [x] Probe: inline node WITH edge styles via `UIDocumentStyleStyler`
  (font-size/colors/features on the single element); WITHOUT edge →
  no explicit font-size → inherits containing context (observation 3);
  block styling byte-identical — `qa-inline-node-style-links.mjs`
  (2026-10-13: 6 of 6 after the sub-cycle fix `4532ae22`: inline
  styler/trigger wrappers gain `_widgets` membership — fresh attach
  after mode switch styles; see the sub-cycle research/plan docs)
- [x] **LIVE CHECKPOINT (operator)** — 2026-10-13 via DOM readout (the
  designed UI checkpoint became possible with phase 5); readout
  recorded as a phase-6 input (nested marks resolve at the root
  fallback)
## Phase 5 — "Node Style Links" UI wiring

### Overview
Editing surface for the third family, next to "Soft Style Links" and
"Hard Style Links".

### Changes Required

1. **fundamentals.mjs** — `UIInlineNodesStyleLinksMap/Value` (copy
   the `UIMarkStyleLinksMap*` :853-860 pattern — no tag), inherited
   list (`UIInheritedMarkStyleLinksList` :952 pattern), container
   `UIInlineNodesStyleLinksContainer` ("Node Style Links" — copy
   `UIMarkStyleLinksContainer` :993-1030).
2. **Mount** — `type-spec-properties.typeroof.jsx:502/:517`: third
   container mount in TypeSpecPropertiesManager.
3. **Wiring exclusion** — `type-driven-ui.mjs`: keep the third
   container class family out of the generic type-driven map (same
   exclusion as the two existing containers).

### Success Criteria
- [x] `npm run typecheck` + `npm run lint` + vitest green (2026-10-13:
  55 files / 541 tests)
- [x] Probe smoke: NEW `scripts/puppeteer-probes/qa-node-style-links-ui.mjs`
  (PROBE PASSED, exit 0) — tree item click opens a typeSpec in the
  properties manager; "Node Style Links" renders next to Soft/Hard
  Style Links; the create select offers the style patches; a REAL UI
  create flow (select patch → key input → create button) yields mode
  `link` + `stylePatch: "bold"` on the created edge; the map lists the
  node type key with the key-change select offering the unlink mode;
  the inherited list hides while all edges are local and shows the
  inherited whole edge on a child typeSpec
- [x] Manual smoke (operator): interactive feel — drag/drop ordering,
  per-item delete, create/unlink via clicks, live styling via the UI
  on en/Typography (now possible: the editing surface exists) —
  confirmed 2026-10-13
## Phase 6 — Composition basis threading + QA + re-tuning

### Overview
Nested leaves inside inline nodes measure against the same basis they
render with; full QA; optional state re-tuning.

### Changes Required

1. **Leaf style resolution** — `composition-controller.ts
   _resolveLeafStyleLink` (:636-678): extend beyond mark descriptors
   (`getWrapMarks` is mark-list-only): a leaf inside an inline node
   resolves the innermost applicable `inlineNodesStyleLinks` edge
   (walk the leaf's node ancestors); basis = that edge's merged
   payload (`createPatched` vs the containing typeSpec — same as
   rendered). Decision point (in-phase, test + probe pinned):
   compose (inline edge ∘ mark edge) vs innermost-wins (the mark
   contract today: at-most-one per leaf, :636-678).
2. **Measurement reads** — `:913-933`: `leafFontSize` from the
   resolved payload (mechanics unchanged; the payload now exists for
   inline edges). Verify measured == rendered basis on the references
   list (the original overflow symptom — ROADMAP problem 1).
3. **QA probes** — extend `qa-structure-marks.mjs` with inline-edge
   styling assertions; new probe `qa-inline-node-styling.mjs` if the
   surface needs its own (runner `scripts/debug-with-puppeteer.mjs`,
  port 3100; NEVER `npm run perf:composition` — OFF-LIMITS).
4. **States/fixtures** — defaults empty (no required migration);
   OPTIONAL: a demo `inlineNodesStyleLinks` edge in the en wikipedia
   initial state (e.g. cite) to exercise the feature live —
   operator's call in-phase.

### Success Criteria
- [ ] `npm run typecheck` + `npm run lint` + vitest green (incl. new
  basis tests)
- [ ] Probes: `qa-structure-marks`, `qa-editor-mark-styling`, new
  inline probe — all green on the en/Typography load; references list
  renders without overflow with styled cites
- [ ] **LIVE CHECKPOINT (operator)**: the cycle's visible goal —
  18pt li context, styled cite content, no root-fallback 14pt write
## Testing Strategy

### Unit (vitest)
- Models: pair parse/round-trip, bare string → baseEm, value↔unit
  coherence, link modes, cross-family non-resolution (models.test.mjs
  patterns :51/:62/:100/:113/:130).
- Fundamentals: `inlineLengthToPT` unchanged (em/en vs baseEm/baseEn
  contracts, `fundamentals.test.mjs:10-36`).
- Merge channel: em basis = origin outbound effective (NEW, phase 2);
  `baseEm`/absolute unchanged; bare-string states unchanged.
- Composition suite: `text-composition/index.test.mjs` vehicles —
  doubling (bold/italic → width > ×1.3), clear-vs-explicit-1
  (:905-1001) — green through EVERY phase.

### Integration
- Single-element inline DOM, tag-swap, declaration cases
  (`integration.test.mjs:441` pattern).
- Parametric third-prefix style-link resolution (type-specnion.test.mjs).

### Live probes (puppeteer DEBUG harness — never perf-composition)
- Phase-gated: 1 → `qa-structure-marks` unchanged-green; 2 →
  `qa-editor-mark-styling` (marks/patches checkpoint); 3 → DOM parity
  probe; 4 → inline styling probe; 6 → full pass + overflow check.

### Manual (operator)
- Per-phase checkpoints (phases 2, 3, 4, 6) on the live en/Typography
  load; UI sections smoke (phases 1, 5).

## Verification Protocol (every phase)

1. `npm run typecheck` 2. `npm run lint` 3. `npm run format:write`
   (if touched files drift) 4. vitest suites 5. phase probe(s)
6. STOP — propose commit message with model/provider/agent metadata;
   wait for operator confirmation (MANNERS / COLLABORATION).

## References

- ROADMAP (decisions + status): `docs/planning/inline-node-refinements/ROADMAP.md`
- Research round: `thoughts/research/2026-10-12-1723-font-size-resolution-and-rebasing.md`
- Design conversation 2026-10-12 (this session): pivot to
  `inlineNodesStyleLinks`, α rejected / β confirmed, one-element DOM
  feasibility (research tasks 20261012_10–13), phase ordering.
