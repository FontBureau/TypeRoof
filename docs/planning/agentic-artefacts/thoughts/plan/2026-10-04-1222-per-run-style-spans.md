# Per-run style spans (inline styles/marks) for text composition

## Overview

Measure every run at its true resolved style (font/axes/features/
language/fontSize), so composition matches rendering. Observed case:
a "bold" style setting wdth to max renders wider than measured —
line breaks don't move and the lines overflow (ROADMAP "When cases
arise"). Research: `docs/planning/agentic-artefacts/thoughts/research/2026-10-04-1155-per-run-style-spans.md`
(all key questions resolved there + in session).

## Current State Analysis

- The controller derives measurement inputs ONCE per textblock
  (composition-controller.ts:367-384, "v1 keeps them uniform per
  textblock — per-RUN values come with per-run style spans") and
  `_buildInlineItems` never reads `marks` (265-297).
- The ingredients filter (457-493) has no per-run style values:
  a mark style change would not invalidate composition.
- Runs are already style-uniform: PM-shaped document model — text
  nodes carry `marks`; different mark sets are separate text nodes.
  Mark boundaries == the segmenter's leaf boundaries.
- Measurer (measurer.ts) is fully per-call parameterized; caches
  keyed by (fullName, axesKey, featuresKey, language, direction,
  text). READY.
- Applicator (viewer.typeroof.jsx:658-712) renders line spans as
  per-run slices inside the run's mark wrappers; per-run CSS keeps
  flowing from the existing stylers. READY, no change.
- Resolved per-style-link values exist AS DATA:
  `styleLinkProperties@<typeSpecPath>/<linkType>/<key>` → the
  registered `StyleLinkLiveProperties` component (meta.typeroof.jsx:
  92-96) with `.typeSpecnion.getProperties()` — typeSpec cascade +
  patch merged, font-dependent axis synthetics pre-resolved. Exactly
  what UIDocumentStyleStyler consumes (type-spec.typeroof.jsx:1018).
- Key prefixes align: patch generators yield `axesLocations/<tag>`
  and `opentype-features/<tag>` — what the measurer helpers read.

### Key Decisions (with operator)

- **Marks are style-EXCLUSIVE**: `styleLinkProperties@` is the full
  story per run — no CSS-cascade/inheritance merge is replicated at
  data level. (Links attach to the id by design.) If the contract
  breaks, that's out of scope — BUT:
- **Guard**: resolving a leaf to MORE THAN ONE style-linked mark
  fires `console.error` (a big contract issue) and picks the
  innermost deterministically. Simple and dumb on purpose; refine or
  rework the contract when it ever fires (e.g. a future style adding
  only color/text-decoration/href could become allowable — not now).
- Resolution seam: the META ELEMENT owns the typeSpec resolution
  context (pathOfTypes, nodeSpecToTypeSpec, _originTypeSpecPath);
  the controller consumes registered styleLink payloads and owns
  measurement. No new model properties — this is pure Host wiring.

## What We're NOT Doing

- Multi-mark/multi-link style merging at data level (out of scope
  by the exclusivity contract; the guard watches violations).
- Contract changes (composition-types.ts StyleSpan stays unused;
  the pipeline's HostSegment.sourceIndex model already fits).
- Applicator/viewer changes (line spans already slice per run).
- Segmenter taxonomy changes (no style field on InlineItem; leaves
  ARE the style runs).
- inlineContainer styles (links as inline blocks): children are
  separate leaves measured by their own marks; a container's own
  style stays unhandled (document as limitation if hit).
- Missing-glyph diagnostic / font-fallback measurement (ROADMAP
  "beyond this roadmap" items, untouched).

## Implementation Approach

Three phases, each a reviewable unit with its own commit; stop after
each with a proposed message and wait for OKOK.

---

## Phase 1: Per-leaf style resolution + measurement

### Overview

The meta element resolves, per textblock, the typeSpecPropertiesPath
(already its context); the controller resolves per text leaf the
exclusive style link (with the guard), consumes the registered
StyleLinkLiveProperties payload, and measures each segment at its
leaf's tuple. Ingredients gain per-leaf style keys.

### Changes Required

**File**: `…/type-stage/document-nodes-meta/index.mjs`
**Changes**: `_driveComposition` passes a style-resolution context to
`composeTextblock`: `{ typeSpecPropertiesPath, markSpec, context }`
where typeSpecPropertiesPath = `getTypeSpecPropertiesIdMethod.call(
this, plan.pathOfTypes, true)` (memoized, integration.typeroof.jsx:
188), markSpec = the schema marks model (external mapping
`../proseMirrorSchema/marks`, as the text-run wrappers map it),
context = `{ hasTypeSpecStyling, pathOfTypes }` from the
_renderingPlan (index.mjs:266-293, 881). No meta structural change —
the info is all in context today.

**File**: `…/text-composition/composition-controller.ts`
**Changes**:
- `_buildInlineItems`: for each text leaf, resolve style links via
  the pure `getWrapMarks` (derivations.mjs:418-504) with the passed
  context; collect descriptors with `styleLinkName`.
  GUARD: `>1` style-linked descriptor → `console.error` (contract
  violation, include leaf path + link names) and use the innermost
  (last wrapper). Id via `getStyleLinkPropertiesId`
  (derivations.mjs:390-412; null = unregistered → treat unstyled).
  `leaves` entries gain `styleLinkPropertiesId` (string | null).
- Per-leaf measurement tuple: for leaves WITH an id, read the
  registered payload (`getProtocolHandlerImplementation(
  "styleLinkProperties@").getRegistered(id)`) →
  `.typeSpecnion.getProperties()` (the styler's accessor); derive
  font (`specific/font` ?? textblock font ?? rootFont),
  axesEntries/axesKey, featuresEntries/featuresKey, language,
  direction, fontSizePt — each falling back to the textblock scope
  values. Cache the resolved tuple per (id, payload identity) within
  one compose (multiple leaves share a link).
- Measurement loop: use the segment's leaf tuple (widths and hyphen
  width); pt conversion per leaf fontSizePt.
- Ingredients: append per-leaf `[styleLinkPropertiesId, font
  identity, axesKey, featuresKey, language, direction, fontSizePt,
  payload identity]` (flat-joined) — "what we CONSUME is what
  invalidates".

**Tests** (`lib/js/tests/text-composition/index.test.mjs`):
- fixture mark ("bold" via the existing mark style-link machinery)
  with a patch setting wdth to max: the marked word's segment
  widths EXCEED the same text unstyled (payload level);
  line breaking changes vs. unstyled (line count/structure differ).
- unstyled documents: composition unchanged (existing tests are the
  regression net — byte-identical payloads where no marks resolve).
- guard: a leaf with two style-linked marks logs console.error and
  composes with the innermost link.

### Success Criteria

#### Automated:
- [x] New tests pass; full suite green (existing composition tests
      unchanged = unstyled path untouched); typecheck/lint green.

#### Manual:
- [x] Viewer: wdth-max bold text re-breaks lines; previously
      overflowing styled lines fit (operator, 2026-10-04).

---

## Phase 2: Invalidation triggers (patch-content edits)

### ERRATUM (2026-10-04): resolved by Phase 1 — no mechanism needed

The premise ("nothing re-drives on patch edits") was wrong: the meta
cascade drives composition on EVERY state change (hook (a) — the
element's update is not pruned by changedMaps), and Phase 1's
per-leaf style values in the input-equality ingredients detect patch
edits. Verified by red-check: the behavioral test passes with no
subscription machinery (built, then reverted as dead weight).
Operator confirmation: line breaking DID update on patch edits in
the viewer already.

**Tests** (kept, comments amended to the real mechanism): editing a
consumed patch's value (native-mark link "bold"/strong AND intent
link "italic" — <i> ingests as generic-style intent) recomposes the
affected textblocks (payload identity + widths); editing the
edgeless "link" patch recomposes nothing (payload identity stable).
Found: an EXPLICIT relativeFontSize=1 on a patch resolves
baseFontSize to the model default, not the document cascade
(existing patch semantics — composition and rendering agree, both
read the same resolved map; noted for the type-spec side).

### Success Criteria

#### Automated: [x] tests pass; full suite green.
#### Manual: [x] editing the "bold" patch value live re-breaks the
styled text (operator, 2026-10-04).

---

## Phase 3: E2E regression + perf + ROADMAP

### Changes Required

**Tests** (`lib/js/tests/text-composition/index.test.mjs`): the
operator case end-to-end — wdth-max bold mark in a narrow measure:
lines break differently than unstyled; no styled line is flagged
overfull that wouldn't be when rendered (spot-check: measured
widths at the patch location match the DOM-rendered widths within
tolerance); OFF MODE still costs zero.

**Perf**: `npm run perf:composition`, review together (per-leaf
measuring multiplies measureEm calls — shared LRU absorbs; watch
typing ratio), --write-baseline only deliberately.

**File**: `docs/planning/text-composition/ROADMAP.md`
**Changes**: move the per-run style spans item from "When cases
arise" to the milestone-3 follow-ups done list (it's pre-milestone-4
foundation: the Treatment Planner needs per-run resolution too).

### Success Criteria (2026-10-04)

#### Automated: [x] full suite green; [x] perf ratios 1.00/1.03 —
noise level (the onMs "regressions" remain the known environmental
false positive). E2E note: the harness's fixed tiny measure packs
~one word per line regardless of font size, so break MOVEMENT and
overfull correctness are not assertable there — covered visually.
#### Manual: [x] the operator's original case is visibly fixed
(2026-10-04).

---

## Testing Strategy

Behavior assertions from document/patch inputs: segment widths in
payloads, line structure, invalidation on patch edits, guard firing.
Not implementation details (no tuple-cache internals). Existing
harness: real Roboto Flex + harfbuzz; wdth axis is the natural probe
(Roboto Flex wdth 25–151, big advance deltas).

## Sub-RPI handoff rule

As before. Suspect: the phase-2 subscription mechanics (dynamic
dependency wiring in the meta) — the least charted area.
