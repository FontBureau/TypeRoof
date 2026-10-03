# Text Composition Milestone 1: Host executes the dummy end-to-end (viewer)

## Overview

Wire the Composition Controller into the type-stage layout so the dummy
algorithm (`dummy-composition.ts`, exists + tested) runs against real
documents and its result is visible in the viewer: lines wrapped in
spans, styled by a CSS port of the varla-varfo line-span structure.
Model-first kick-off; Controller-first plumbing for live feedback.

## Current State Analysis

- Contract + roles + integration/scheduling plans: committed in
  `lib/js/components/layouts/type-stage/text-composition/` headers.
- Dummy algorithm + behavior tests: `dummy-composition.ts`,
  `dummy-composition.test.mjs` (passing).
- Research: `thoughts/research/2026-10-02-1800-composition-controller-integration.md`
  — all questions resolved (see "Follow-up Decisions").
- Missing: everything Host-side (Controller, Segmenter, Measurer,
  Applicator) and the model seed.

### Key Discoveries (from research)

- DOM-less widgets are first-class; `DocumentNodesMeta` is instantiated
  without zone at `index.typeroof.jsx:540-566` and must update BEFORE
  renderers (`:545-550`).
- Protocol auto-registration via wrapper settings keys
  (`component.mjs:293-300, 768-789`); manual per-path registration +
  `setUpdated` + no-op `changeState` precedent:
  `environment-provider.mjs:93-103`.
- Change detection exists: `update(compareResult)` → `StateComparison`
  with per-path entries (compare.ts:450). No re-walk/identity-diff.
- Textblock identification: PM-parallel rule via existing pure
  derivations (`getMMChildIsBlock`,
  `specChildrenInInlineContext` in document-nodes-meta/derivations.mjs).
  Composition boundary = OUTERMOST block containing inline content.
- `UIDocumentTextRun` currently maintains a ONE-text-node invariant
  (viewer.typeroof.jsx:503-723) which line-span wrapping breaks BY
  DESIGN (we split at line boundaries).
- varla-varfo line-span structure: `_packLine`
  (varla-varfo/lib/js/justification.mjs:948-993) + CSS
  (varla-varfo/lib/css/general.css:781-867).
- Vite CSS import pattern: `import "./tree-editor.css"`
  (tree-editor.typeroof.jsx:12) — CSS local to the component dir.

## Desired End State

Open a type-stage document in viewer mode: text is broken into lines by
the dummy algorithm (4 segments/line — obviously wrong, visibly
working), each line wrapped in spans with the ported CSS applied
(hyphens visible where the dummy takes a hyphen break — n/a for v0
without hyphenation; visible via line span styling). Editing text or
toggling the model boolean recomposes. OFF MODE (boolean false) =
today's browser breaking, zero applicator special-casing.

### How to verify

- `npm run typecheck`, `npm run lint`, `npx vitest run` (new tests
  included) pass.
- Manual: viewer shows dummy-broken lines; edits recompose; boolean
  off → browser default.

## What We're NOT Doing

- Real fitting / Treatment Planner (adjustmentStep stays 0; step→CSS
  mapping is milestone 4 territory).
- Hyphenation (milestone 3).
- Async/worker scheduling (sync in-cycle first; the scheduling plan
  stands but is not implemented now).
- ProseMirror editor applicator (experimental, later).
- Per-paragraph style-dirty precision (ROADMAP optimization).
- Milestone 2+ algorithms.

## Implementation Approach

Six phases, each a small reviewable unit with its own commit (per
COLLABORATION.md: stop after each phase with proposed commit message,
wait for OKOK). Tests assert behavior, not implementation.

---

## Phase 1a: Model seed — kick-off boolean in TypeSpecModel

### Changes Required

**File**: `lib/js/components/type-spec/models.mjs`
**Changes**: add a minimal boolean field to TypeSpecModel (name
proposal: `textComposition`, `BooleanModel` — default TRUE during
implementation per roadmap decision; opt-out mechanism). Locate the
TypeSpecModel fields and add alongside other top-level typeSpec
properties. Serialization/migration: legacy documents without the
field must default to TRUE — verify metamodel default behavior for
missing fields (behavior test).

### Success Criteria

#### Automated:
- [x] Behavior test: typeSpec without the field metamorphoses to
      default TRUE; explicit false round-trips through serialize.
      (Pattern: `index.test.mjs` width/height migration tests.)
      → added to `type-spec/model.test.mjs` (3 tests).
      DEVIATION (resolved): the defaults pipeline (defaults.mjs
      typeSpecGetDefaults via pps-maps.mjs TYPESPEC_PPS_MAP)
      requires every TypeSpecModel field to be a REGISTERED
      processed property (or explicitly excluded). textComposition
      IS a processed style property (inherits through the
      typeSpecnion like any other), so it was registered in the
      GENERIC registry (registered-properties.mjs:
      generic/textComposition, inherit: true, default: true).
      Phase 4 reads it via the nodeProperties@/typeSpecProperties@
      stream as originally envisioned.
- [x] `npm run typecheck`, existing tests pass. (318/318 vitest)

#### Manual: none (model-only).

---

## Phase 1b: `composition@` protocol handler

### Changes Required

**File**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`
**Changes**: install `SimpleProtocolHandler.create('composition@', {
treatAdressAsRootPath: true, notFoundFallbackValue: null })` next to
the existing handlers (`:303-326`). The null fallback IS the off-mode
consumption mechanism.

### Success Criteria

#### Automated:
- [x] `npm run typecheck`, lint pass. (318/318 vitest as well)

#### Manual:
- [ ] App boots unchanged (protocol unused yet).

---

## Phase 2: Segmenter v0 (pure) + tests

### Changes Required

**File**: `lib/js/components/layouts/type-stage/text-composition/segmenter.ts` (new)
**Changes**: pure function: paragraph text (+ uniform placeholder
style for v0) → `{ segments, breaks }`. v0 rules:
- split at space characters (UAX#14 refinement later);
- `\n` (hard break) splits into MULTIPLE logical paragraphs
  (Controller invokes the algorithm per logical paragraph — the
  segmenter returns a list of logical-paragraph inputs);
- each space produces a `'space'` break opportunity (the space is its
  own segment, matching how measurement will treat it);
- no hyphenation.

**File**: `…/segmenter.test.mjs` (new)
**Changes**: behavior tests: words/spaces segmentation, break
opportunities at the right segment boundaries, hard-break splitting,
empty text edge case.

DEVIATION (review-driven): hard breaks are NOT '\n' in text —
ProseMirror has a `hard_break` INLINE NODE (default-schema.ts:32),
sibling to text runs. Logical-paragraph splitting is node-level:
consecutive text runs form a logical paragraph, split at hard_break
(and any inline atom boundary). Inline nodes participate in
composition, three cases: inlineContainer (recursion — e.g. a link
as inline block; its text joins the same paragraph), inlineAtom
(unbreakable box → one segment), hardBreak (boundary). API:
`segmentTextRun` (per-run, local offsets) +
`assembleLogicalParagraphs` (pure assembly over classified
InlineItems; HostSegment carries sourceIndex for Applicator
mapping). Extension point documented: classification of inline
items should become schema-driven/smart when actual cases come up
(freely configurable schemas).

### Success Criteria

#### Automated:
- [x] New tests pass; `npm run typecheck`, lint pass.
      (6 segmenter behavior tests, 10 total in the module)

#### Manual: none.

---

## Phase 3: Controller skeleton (dirty detection + textblock index) — PARTLY SUPERSEDED (see Phase 6 amendment)

### Changes Required

**File**: `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts`
**Changes**: implement `CompositionController extends
_BaseContainerComponent` (or `_BaseComponent`): DOM-less, no zone.
- Dependency mappings: `document`, `typeSpec`, `stylePatches`,
  `nodeSpecToTypeSpec`, `nodeSpec`, `markSpec` (coarse — update fires
  on any relevant change).
- Textblock index: scan the document model using the SHARED pure
  derivations (`getMMChildIsBlock`, `specChildrenInInlineContext` from
  `document-nodes-meta/derivations.mjs`); boundary = outermost block
  with children in inline context; index maps textblock path → child
  text-run paths.
- Dirty detection from `compareResult` (StateComparison entries):
  paths under `./document` → enclosing textblock dirty; structural
  changes → re-scan affected subtree; paths under style inputs → ALL
  paragraphs dirty (v1, ROADMAP-documented).
- v0 output: `console.log` what would be composed (dirty paragraphs).
  NO composition@ publication yet.

**File**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`
**Changes**: instantiate the controller in the `widgets` array AFTER
DocumentNodesMeta (`:540-566`), before renderers (same ordering
constraint, `:545-550`); settings `{ id: "compositionController",
relativeRootPath: layout root }`.

### Success Criteria

#### Automated:
- [ ] Pure helper(s) (path → enclosing textblock mapping) get
      behavior tests if extractable. (not extracted; the skeleton's
      observable behavior is console logging — verified manually)
- [x] `npm run typecheck`, lint, existing tests pass. (326/326)
      DEVIATION: first .ts file importing .mjs modules — tsconfig
      gained allowJs:true (checkJs stays off) and lost
      declaration/declarationMap (noEmit typecheck only; vite
      builds). Model instances deliberately `any`-typed (file-level
      eslint-disable, precedent wikipedia/ingest.ts).

#### Manual:
- [ ] Console shows correct dirty paragraphs when typing in the
      editor / on load (initial: all).

---

## Phase 4: Measurer v0 + input assembly + publication — PARTLY SUPERSEDED (see Phase 6 amendment)

### Changes Required

**File**: `…/text-composition/measurer.ts` (new)
**Changes**: shape-and-sum per segment following
`videoproof-contextual/layout.mjs:43-66` (`measureWordWidths`
pattern: `new harfbuzz.Font(font.hbFace)`, `setScale(upem,upem)`,
`setVariations(currentAxes)`, Buffer → shape → sum xAdvance → em;
pt = em × fontSizePt). Cache keyed by (text, fontKey, axesKey) —
font units, size-independent. `widgetBus.harfbuzz` for the module.
Line width from node-properties (`availableWidth` — the
TypeStagePaneStyler precedent, pane-styler.typeroof.jsx:67-79), NOT
from DOM measurement. Font resolution per text run: trace the
typeSpec font reference → installedFonts entry (RESEARCH DETAIL to
execute at implementation start: how stylers' `/font → rootFont`
relates to per-typeSpec fonts; the resolved font object must carry
`.hbFace`).

**File**: `…/text-composition/composition-controller.ts`
**Changes**: build `CompositionInput` per dirty logical paragraph
(segments from segmenter v0 with uniform v0 style, widths from
measurer, `lineWidthPt` constant from node-properties,
`lineWidthAtStep` = step-ignoring sum for the dummy), run
`dummyComposition`, publish `composition@<documentNodePath>` via
manual registration into the handler (EnvironmentProvider precedent:
register → keep unregister closure; `setUpdated`; entries replaced on
recompose, unregistered when a paragraph disappears or the boolean
turns off). Gate everything on the Phase-1a boolean flowing through
typeSpecProperties@/nodeProperties@ (resolve like any property).

### Success Criteria

#### Automated:
- [ ] Measurer behavior test with a test font if available in repo
      (skipped: no fixture wired; Measurer is a thin wrapper over the
      proven videoproof-contextual pattern — verified manually).
- [x] typecheck, lint, full test suite pass. (326/326)
      DEVIATIONS (v0 simplifications, documented in code):
      1. Font = app ROOT font object (/font), not per-typeSpec fonts.
      2. Gate = ROOT typeSpec textComposition (global), not
         per-paragraph.
      3. Capability fallback: no harfbuzz module → controller
         degrades to OFF (no crash), e.g. test harnesses.
      4. nodeProperties@ registered value is the meta dispatcher
         widget; payload via its .nodeProperties getter.
      5. Atoms measure 0; no setVariations (default location).

#### Manual:
- [ ] Console/inspection shows composition@ entries per paragraph
      with plausible widths; toggling the boolean
      registers/unregisters.

---

## Phase 5: Line-span CSS + structure port

### Changes Required

**File**: `…/text-composition/line-spans.css` (new)
**Changes**: port the varla-varfo line-span CSS
(varla-varfo/lib/css/general.css:781-867), renamed to our prefix
(e.g. `.typeroof-composition-line`, `-first`, `-last`, `-hyphen`):
- `.line-first::before { content:''; display:block }` line-breaking
  normalization (unset for paragraph-first lines to keep
  text-indent);
- hyphen `::after { content:'-' }`;
- line color-coding custom property hook (`--line-color-code`) for
  diagnostics;
- SKIP the in-progress/browser-workaround classes
  (`line-in-progress*`, `new-style-current-last-line-elem`,
  `@-moz-document` block) — those served the feedback-loop demo's
  live narrowing; our composition is predictive. Document the
  omission in the file header.

**File**: `…/text-composition/composition-controller.ts` or the
applicator module
**Changes**: `import "./line-spans.css";` (vite pattern,
tree-editor.typeroof.jsx:12).

### Success Criteria

#### Automated:
- [x] stylelint (`npm run stylelint:check`) passes. (full lint +
      typecheck + 326/326 vitest; added ambient-css.d.ts —
      TS needs a module declaration for vite CSS imports)

#### Manual:
- [ ] none yet (no DOM consumer until Phase 6).

---

## Phase 6: Viewer Applicator — AMENDED (meta-driven composition)

### Amendment (post-implementation pivot)

The original phase 6 (commit dee5b9f9, kept in history) implemented
the viewer applicator AND a publication-timing approach via widget
ordering. The applicator is KEPT; the timing approach FAILED manual
verification (no markup change) and was diagnosed as structurally
fragile:

- The composition@ updated-log resets at the start of every cycle
  (TypeStageController update/initialUpdate), so setUpdated marks
  only reach widgets updated LATER in the same cascade.
- The viewer attachments update WITH THE META (they live in meta
  nodes' _widgets) — before a controller placed after the meta;
  placing the controller before the meta incurs the inverse
  one-cycle-lag on the nodeProperties@ scopes it reads (width/
  fontSize stale by one cycle) — not viable post v0.

RESOLUTION — DocumentNodesMeta DRIVES composition inside its own
cascade (execution order becomes structural, not coincidental):

- The meta's per-element update order is already: scope component
  FIRST ("G8 contract"), then children, then attachments.
- DocumentNodesMetaElement (or its dispatcher) invokes composition
  for textblocks right after its scope (re)builds: scopes are
  FRESH, composition@ marks are set BEFORE attachments update in
  the same cycle — delivery guaranteed, no lag, no compareResult
  mining (the meta element's own update IS the dirty signal).
- The controller widget degrades to a DOM-less SERVICE: owns the
  Measurer, segmenter invocation, the algorithm, composition@
  publication. The meta looks it up by id
  (getWidgetById("compositionController") — same pattern as the
  viewer looking up the meta). No update-cycle role: the
  compareResult mining, textblock index, coarse deps and ordering
  constraints from phases 3/4 are DELETED (the code was the
  exploration; history keeps it).

### Changes Required (amended)

**File**: `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts`
**Changes**: strip to a service class: constructor keeps Measurer +
registrations; `composeTextblock(textblockPath, textblockNode,
nodePropertiesPayload)` does item classification, segmentation,
measurement, dummy composition, publication (unchanged phase-4
logic); gate check (root typeSpec textComposition + harfbuzz
capability). No _BaseComponent, no update/initialUpdate, no
compareResult, no textblock index. Instantiate as a DOM-less widget
(id "compositionController") purely for widgetBus/harfbuzz access
and id-lookup; UPDATE_STRATEGY_NO_UPDATE.

**File**: `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`
**Changes**: in the element meta node's update flow, after the
scope component settles: if the node is a textblock (shared
derivations: getMMChildIsBlock + specChildrenInInlineContext) and
its scope or content changed, invoke
`compositionService.composeTextblock(rootPath, mmNode, scopePayload)`.
Service lookup via getWidgetById with null fallback (composition is
optional — OFF when the widget is absent).

**File**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`
**Changes**: controller widget: UPDATE_STRATEGY_NO_UPDATE, deps [];
ordering constraint comment removed (position no longer matters for
delivery); placed next to the meta for readability.

**Unchanged** (from dee5b9f9): the viewer applicator
(UIDocumentTextRun line spans), the payload shape, line-spans.css.

### Success Criteria (amended)

#### Automated:
- [x] applicator side: typecheck, lint, full suite pass (326/326,
      at dee5b9f9).
- [x] after the pivot: typecheck, lint, full suite pass (326/326).
      Pivot review fixes: child updater maps the FULL external
      composition@ id (bare "composition@" shorthand = empty
      address); carrier addresses content precisely (NO
      firstElementChild drill-down — would descend into line
      spans); gate-off unpublishes + notifies; carrier span gets
      the typeroof-composition-run class (ROADMAP technical debt).

#### Manual:
- [x] Viewer shows dummy line breaking (4 segments/line — obviously
      wrong, visibly working); span structure + classes in DOM
      inspector; line spans visibly styled (CSS port proven).
      CONFIRMED by operator ("OK, profit!!").
- [x] Typing recomposes; boolean off → browser default rendering,
      no spans. CONFIRMED (incl. overfull red on/off).
- [ ] Compare mode side-by-side doesn't break (viewer attachment is
      per-renderer; meta untouched).
- [x] Style changes (fontSize/width-relevant) recompose with FRESH
      scopes in the same cycle (no lag). (scope-settled hook)

---

## Sub-RPI Cycles (handoff rule)

If a phase hits unexpected complexity during implementation (the
prime suspects: Phase 4 font-reference resolution, Phase 6
text-run invariant change), spawn a sub-RPI cycle for it rather
than letting the phase balloon: /research_codebase → /create_plan
for the sub-topic, then resume this plan.

Handoff documents for the other agent/session (in order):
1. THIS plan (phases, exclusions, verification).
2. The research doc
   `thoughts/research/2026-10-02-1800-composition-controller-integration.md`
   (codebase map + resolved questions).
3. The design headers in
   `lib/js/components/layouts/type-stage/text-composition/`
   (`composition-controller.ts`, `composition-types.ts`) — the
   authoritative contract and roles.
4. `docs/planning/text-composition/ROADMAP.md` — big picture and
   deferred items.

The sub-cycle's documents live in `thoughts/` alongside these and
are archived the same way when it concludes.

## Testing Strategy

### Unit/behavior tests (vitest):
- Phase 1a: model default/migration/round-trip.
- Phase 2: segmenter behavior (segmentation, breaks, hard-break
  split, empty).
- Phase 3: path→textblock mapping helper if extractable pure.
- Phase 4: measurer shape-sum with a test font if a fixture exists.

### Integration (manual):
- Phase 6 checklist above.

### NOT tested (per behavior-not-implementation rule):
- Internal controller bookkeeping; registry mechanics.
