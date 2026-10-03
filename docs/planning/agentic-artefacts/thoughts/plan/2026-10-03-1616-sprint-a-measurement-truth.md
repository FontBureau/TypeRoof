# Sprint A: Measurement Truth (text-composition)

## Overview

Make the Measurer shape with the true font at the true axes location
(per-run), with the shaping-relevant inputs (features, language,
direction) honored — and make recomposition fire only when the
consumed ingredients actually change (drive-level input equality, the
property-aware filtering reframe). Follows milestone 1
(`docs/planning/agentic-artefacts/thoughts/plan/2026-10-03-0933-composition-controller-milestone1.md`);
research:
`thoughts/research/2026-10-03-1549-sprint-a-measurement-truth.md`
(all questions resolved in its Follow-up sections).

## Current State Analysis

- v0 measures with the app ROOT font at the DEFAULT axes location
  (composition-controller.ts: font via `/font`, Measurer without
  setVariations), buffer language/direction guessed from text.
- The observed symptom: overfull boundary errors (measured wider/
  narrower than rendered).
- Research proves the properties stream already carries everything:
  the node scope's effective map is CascadingMap(local=layout/*,
  typeSpec=typeSpecnion settled, parent) — `specific/font` (the font
  OBJECT), `axesLocations/<tag>`, `opentype-features/<tag>`,
  `language/lang`, `generic/fontSize`, `generic/direction`,
  `layout/availableWidth` all readable from the payload the drive
  already receives (node-properties.mjs:185-196).

### Key Discoveries (research doc)

- `specific/font` = VideoProofFont (.hbFace, .axisRanges
  {min,max,default}, .fullName); fallback typeSpecGetFontMethod
  pattern (root font).
- setVariations shaping precedent: videoproof-array.mjs:1206-1217;
  measurement pattern: videoproof-contextual/layout.mjs:44-69.
- Cache keys (decided): sparse normalized axesKey (tag=value, tag
  order, omit == default); hbFont cache Map fullName → axesKey →
  hbFont (no WeakMap); width cache (fullName, axesKey, featuresKey,
  language, direction, text) → em. Features/language/direction are
  shape-time parameters (hbFont cache unaffected).
- Property-aware filtering reframe (decided): the relevant set IS the
  consumed set; the filter is the drive-level input equality check.
  No key-wise property diff exists in the codebase; the filter is
  new, local to text-composition.

## Desired End State

Measured widths equal rendered widths at any typeSpec configuration
(font, axes, features, language, direction): the overfull boundary
error observed in milestone 1 review disappears (verifiable by hand:
narrow/widen a heading via wdth and see overfull flip at the correct
character count). Editing a non-compositional property (e.g.
backgroundColor) produces NO recomposition (no new composition@
publication).

## What We're NOT Doing

- Treatment Planner / stretch potentials (milestone 4).
- Per-paragraph gate engagement (milestone 4).
- Hyphenation, UAX#14, greedy algorithms (milestones 2/3).
- Async scheduling, workers.
- Scope-level relevance predicates (shared machinery — the filter is
  local to text-composition).

## Implementation Approach

Two phases, each a reviewable unit with its own commit; stop after
each with a proposed message and wait for OKOK.

---

## Phase 1: Measurer v1 — true font, true location

### Overview

Read all measurement inputs from the textblock's nodeProperties
payload (already received by the drive); shape at the resolved
location; cache as decided.

### Changes Required

#### 1. Measurer

**File**: `lib/js/components/layouts/type-stage/text-composition/measurer.ts`
**Changes**:
- `measureEm(font, axesKey, featuresKey, language, direction, text)`
  with the full cache key; shaping sets variations (harfbuzz
  Variation per axesKey entry), features (harfbuzz.Feature list),
  buffer language/direction when given (else guessSegmentProperties).
- Helpers: `axesKeyOf(font, properties)` — sparse normalized
  (tag=value, tag order, omit == font.axisRanges[tag].default);
  `featuresKeyOf(properties)` — sparse over opentype-features/*;
  both pure and exported for the controller + tests.

#### 2. Controller input assembly

**File**: `…/text-composition/composition-controller.ts`
**Changes**: in `composeTextblock`, read from the payload:
font = `specific/font` ?? root `/font`; axesKey/featuresKey/
language/direction/fontSize/availableWidth; per-segment measure with
the full key set. (v0 keeps uniform per-textblock values — per-RUN
values come with per-run style spans; noted in code.)

### Success Criteria

#### Automated:
- [x] New behavior test `measurer.test.mjs` (4 tests, real shaping
      with the repo's RobotoFlex in node): wdth min≠max, sparse-key
      normalization (explicit default == unset, same measurement),
      -liga changes "fi" width, language code path runs.
      DEVIATION: featuresEntriesOf includes explicit FALSE (=
      disable, "-tag") — only absent keys are omitted; the plan's
      "non-default entries" phrasing would have dropped exactly the
      disable signal.
- [x] typecheck, lint, full suite pass. (330/330)

#### Manual:
- [ ] Overfull diagnostics flip at the correct character count when
      changing wdth/wght of a heading (compare against rendered).

---

## Phase 1b: nowrap on composed textblocks

### Overview

So the viewer shows exactly OUR line breaks: the browser must not
soft-wrap inside composed textblocks. `white-space: nowrap` on
composed blocks (inheritance reaches the line spans); our spans'
::before{display:block} remain the only breaks. This is the
go-forward model — when justification sets explicit line widths,
browser wrapping would double-break. (The "does the browser agree
with our measurements" comparison remains available via OFF MODE.)
Ideally via a class, not inline style (the styler owns
element.style; classList is the attachment's business).

### Changes Required

**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**: `UIDocumentElement` consumes `composition@<ownPath>`
(its rootPath IS the textblock path) and toggles a class
(`typeroof-composed`) on its node: payload → add, null → remove.

**File**: `…/text-composition/line-spans.css`
**Changes**: `.typeroof-composed { white-space: nowrap; }` with a
comment (browser soft-wrap off; our spans are the only breaks; the
OFF-MODE comparison remains available).

### Success Criteria

#### Automated:
- [ ] stylelint, typecheck, full suite pass.

#### Manual:
- [ ] Composed textblocks show exactly the dummy's breaks (the
      browser never wraps on its own); overfull lines visibly
      overflow instead of wrapping. OFF MODE reverts to browser
      wrapping.

---

## Phase 2: Drive-level input equality filter

### Overview

Skip recompose+republish when the consumed ingredients are unchanged.

### Changes Required

**File**: `…/text-composition/composition-controller.ts`
**Changes**:
- In `composeTextblock`: assemble the ingredients (font, axesKey,
  featuresKey, language, direction, fontSize, availableWidth, plus
  the textblock's inline-content identity — the text/structure),
  store them per textblock; if identical to the stored previous
  ingredients, return WITHOUT republishing (no setUpdated — consumers
  keep their applied state; purity guarantees same input → same
  output).
- Content changes: the ingredients include the item texts, so typing
  always invalidates. (Text identity via the assembled leaf texts —
  cheap string compare; fine at this scale.)
- The gate-off and destroy paths are unchanged (unpublish+notify).

### Success Criteria

#### Automated:
- [x] typecheck, lint, full suite pass. (331/331)
- [x] Behavior coverage where extractable pure (ingredients compare
      helper) — else manual. (kept inline in composeTextblock; the
      observable outcome is the absence of publication — verified
      manually)

#### Manual:
- [ ] Changing backgroundColor of a typeSpec produces NO new
      `published composition@…` log; changing fontSize/wdth DOES.
- [ ] No regression in composition behavior (typing reflows, off
      mode cleans up).

---

## Testing Strategy

- Measurer behavior tests with the real font (node + harfbuzzjs).
- Input-equality: manual verification via the publication log (the
  observable outcome), per the behavior-not-implementation rule.
- Full suite + typecheck + lint per phase.

## Sub-RPI handoff rule

As in the milestone-1 plan: if a phase balloons (suspect: per-run
style spans), spawn a sub-cycle. Handoff chain: this plan → Sprint A
research doc → design headers in text-composition/ → ROADMAP.
