# Justification potentials + greedy-fit (milestone 4)

## Overview

Port varla-varfo's justification to TypeRoof's text-composition:
(1) the justification POTENTIALS (renamed from "justification
specs") as hardcoded stubs for Roboto Flex + Amstelvar flavors with
best-fit discovery; (2) the Treatment Planner (Host role) turning
the contract's normalized per-line adjustmentStep into concrete
axis/tracking/wordspace treatments, measured predictively; (3) the
greedy-fit algorithm exercising it (the validation milestone), with
color-coded lines and a switch in the algorithm struct.
Research: `docs/planning/agentic-artefacts/thoughts/research/2026-10-04-1644-justification-potentials.md`
(all key questions resolved; corrections folded in).

## Outcome (concluded 2026-10-05)

All four phases are complete. Key implementation commits:

- `8e50f2da` — hardcoded potentials, interpolation/validation,
  best-fit discovery.
- `75dc6b3f` — Treatment Planner + predictive measurement and DOM
  application.
- `6183abd7` — greedy-fit, model-first engagement, treatment config,
  color-coded lines; avar2 location anchoring.
- `a21865d2` — corrected optional hyphen measurement: source-only
  segments; one conditional glyph at the taken candidate break.
- `3da72196`, `521db920` — complete pinned upstream pattern catalog;
  direct session-only requirements from effective TypeSpec +
  style-patch languages, no serialized bookkeeping.
- `3a3fd8b5` — ride-along state-load lifecycle fix (viewer attaches
  only after the meta tree updates/prunes).

Manual verification used minimal saved TypeStage states under the
operator's `downloads/` directory. The reported 280pt Roboto Flex
case now shows narrowed lines flush to the measure (0.00–0.81px;
taken-hyphen line 1.58px); only max-widened lines may remain short,
which correctly signals exhausted potential. Amstelvar avar1/avar2
and Roboto Flex/Delta treatments engage; the color-coding switch
works; English/Greek/Russian hyphenate with direct asset loading.

Phase-4 performance: the harness was corrected to select Greedy Fit
and to stage + verify the real wikipedia fixture (1087 text nodes)
instead of silently accepting a docs-server HTML fallback. Stable
30-cycle ratios: typing 1.011/1.026; recompose 1.262/1.234. New
validated baseline: typing 1.017, recompose 1.266; immediate rerun
passed all absolute + ratio gates.

Known follow-up (recorded in ROADMAP): tracking predictive width
currently counts source code units; verify parity with CSS
letter-spacing for Unicode/ligature runs before KP++ quality work.

## Current State Analysis

- Contract ready: `lineWidthAtStep(from,to,step)` injected per
  candidate (composition-types.ts:122-168); placeholder
  `(from,to) => widthOf(from,to)` at composition-controller.ts:793.
- Per-leaf styles (per-run style spans) give the planner per-run
  font/axesEntries/fontSizePt (composition-controller.ts:612-655).
- Applicator sets per-line CSS custom properties already
  (`--line-color-code`, viewer.typeroof.jsx:698-704) and the
  color-coding helper EXISTS with full step->color mapping
  (viewer.typeroof.jsx:647-658) — dormant (steps are always 0).
- Measurer re-shapes at any axes location; caches keyed by
  (fullName, axesKey, ...) (measurer.ts).
- Additive per-segment width math precedent: hyphen baking
  (composition-controller.ts:727-775).
- Algorithm selection: dynamic struct textCompositionAlgorithm
  (Dummy + GreedyRagged types exist; config fields render generic
  UI for free — the segmentsPerLine precedent).

### Key Decisions (research + operator)

- **Stubs in code, no metamodel yet** (potentials storage is the
  deliberately-deferred open question; font entries can't carry
  data — deferred-font serialization drops fields).
- **Potentials map design-space location -> treatments**; levels
  navigate by AXIS VALUES ONLY (third level = the run's OPSZ VALUE,
  not font size — explicit opsz is the author's optical intent).
- Tables declare their ORDERED dimension tags ([wght, wdth, opsz]
  for the stubs; authors may use other axes/depths later); entries
  within a level must be numerically MONOTONIC (validated;
  ascending or descending both legal; alpha key ordering would
  corrupt — insertion order kept).
- **Best-fit discovery, most-specific-wins** (Flex/Delta
  sufficiently compatible; no exclusion lists).
- Step scale: contract-native [-1,1], per-side linear maps; the
  demo's stop-budget heuristic is an internal sampling detail.
- All treatments in parallel per step (demo semantics; impact-
  weighted ordering later).
- Tracking = absolute pt per glyph (keyed by opsz-declared size);
  wordspace = factor of the natural space advance; axes treatments
  = re-shaping at shifted coords; space advance measured AT the
  candidate coords (cross-treatment coupling).

## What We're NOT Doing

- Potentials storage metamodel + editing UI (open question,
  deferred; stubs live in code).
- Inter-line harmonization factor (headlines); the wdth headline
  stub folding into the unified structure.
- Per-treatment impact weights (the demo's own TODO).
- Knuth-Plass++ (milestone 5).
- Amstelvar avar1/avar2 table variants (best-fit handles; data
  lands when a real case shows up).

## Implementation Approach

Four phases, each a reviewable unit with its own commit; stop after
each with a proposed message and wait for OKOK.

---

## Phase 1: The potentials module (pure, no model) ✅

### Changes Required

**File**: `…/text-composition/justification-potentials.ts` (new)
**Changes**:
- `JUSTIFICATION_POTENTIALS_ROBOTO_FLEX` /
  `JUSTIFICATION_POTENTIALS_AMSTELVAR`: the tables ported verbatim
  from varla-varfo/lib/js/typeSpec.mjs (comments/FIXMEs included —
  they carry provenance), renamed, frozen.
- `calculatePotentials(table, location, dimensions)`: the hardened
  `_calculateFontSpec` port — declared dimension order, monotonic
  entries relied upon (validation on table load: levels are
  monotonic, leaf shapes match), name-agnostic leaf detection
  (a level is a leaf iff its values are [min,dflt,max] triples,
  i.e. depth exhausted by shape, not by the 'XTRA' name), explicit
  clamp policy at out-of-range edges, invariant check: interpolated
  dflt equals the natural value at the location (dev warning when
  violated).
- `discoverPotentials(font)`: best-fit matcher — candidate
  descriptions (family-name prefix + required navigation axes all
  present in font.axisRanges), most specific match wins (scoring:
  exact family match > prefix match; more navigation axes > fewer);
  Roboto Delta resolves to the Flex table. Returns null for fonts
  without potentials (plain Roboto).

**File**: `…/text-composition/justification-potentials.test.mjs` (new)
**Changes**: behavior tests — interpolation between stops (known
values from the Roboto Flex table), exact hits, edge clamping,
early bottom-out, malformed-grid/monotonicity validation,
discovery specificity (mock fonts: Flex, Delta, AmstelvarA2, plain
Roboto → null).

### Success Criteria

#### Automated: [x] new tests pass; full suite green.

---

## Phase 2: Treatment Planner wiring (Host) ✅

### Changes Required

**File**: `…/text-composition/treatment-planner.ts` (new, pure)
**Changes**: per-LeafStyle planner — `createTreatmentStepper(
leafStyle, potentials, config)` returning `{narrowPt(from,to,step),
widenPt(...)}`-style step->width-delta functions per segment set:
axes treatments = Measurer re-shape at shifted coords (measureEm
with adjusted axesEntries/axesKey); tracking = trackingPt(step) *
nGlyphs per segment; wordspace = factor(step) * spaceAdvance(at
candidate coords) * nSpaces. Per-side linear maps (narrowRange at
step -1, widenRange at +1).

**File**: `…/text-composition/composition-controller.ts`
**Changes**:
- Resolve potentials per leaf (discoverPotentials per leafStyle
  font; cache per font identity) when the algorithm uses steps
  (greedy-fit; greedy-ragged keeps probing step 0 only — the
  planner is inactive by construction).
- `lineWidthAtStep(from,to,step)`: step 0 = widthOf (unchanged);
  step != 0 = widthOf + Σ per-segment planner deltas (mixed-font
  candidates compose linearly in pt).
- Per-segment glyph/space counts precomputed in the measurement
  loop (needed by tracking/wordspace deltas).
- Ingredients: the potentials table identity per leaf.
- Payload: per-line `treatments` record (concrete values at the
  line's adjustmentStep: letterSpacingPt, wordSpacingPt,
  axesEntries-delta) — computed ONCE by the controller so every
  line fragment applies identical values.

**File**: `…/type-stage/viewer.typeroof.jsx` + `line-spans.css`
**Changes**: the applicator applies per-line treatments from the
payload: `--line-letter-spacing`/`--line-word-spacing` custom
properties on line-fragment spans (consumed in line-spans.css) and
merged font-variation-settings for the axes delta (the run styler
owns the base property; the applicator composes its spans' values).

**Tests** (`lib/js/tests/text-composition/`): lineWidthAtStep
narrows/widens measurably at ±1 (payload-level probe via a test
algorithm? — better: unit tests for treatment-planner.ts with the
real font + measurer pattern from measurer.test.mjs); tracking/
wordspace deltas exact; mixed-font candidate composition; axes
re-measurement at shifted coords.

### Success Criteria

#### Automated: [x] new tests pass; full suite green.
#### Manual: [x] no visible behavior expected until Phase 3.

---

## Phase 3: Greedy-fit algorithm + engagement + color-coded lines ✅

### Changes Required

**File**: `…/text-composition/greedy-fit.ts` (new, pure Algorithm)
**Changes**: the varla-varfo strategy, predictively: greedy break
at natural width; NARROW until one more segment fits (minimal
narrowing step; potential exhausted at -1 -> clamp, |step| > 1
signals unsatisfiable per contract); if narrowing pulls nothing
up, WIDEN to fill or leave at max potential; last line never
widened (contract rule). Uses lineWidthAtStep over the full step
range — exercises every injected function (validation milestone).

**Files**: `lib/js/components/type-spec/text-composition-models.mjs`
(+ registered-properties/defaults as required)
**Changes**: `TextCompositionAlgorithmGreedyFitModel` in the
dynamic struct with config: enabled treatments (wdth/tracking/
wordspace — OrEmpty booleans, default all on), direction
(both/narrowing/widening, OrEmpty enum default both), and
**colorCoding (OrEmpty boolean, default ON)** — the switch for the
color-coded lines.

**File**: `…/text-composition/composition-controller.ts`
**Changes**: algorithm selection gains the greedy-fit type; the
resolved config flows to the planner (treatments/direction) and
into the payload (`colorCoding`).

**File**: `…/type-stage/viewer.typeroof.jsx`
**Changes**: the color-coding switch: the applicator applies
`--line-color-code` (the existing _lineColorCode mapping, now live
with real steps) only when the payload's colorCoding is on;
otherwise transparent.

**Tests**: greedy-fit unit tests (injected width fn: narrowing
pulls a segment up, widening fills, last line never widened,
unsatisfiable |step|>1); harness e2e with Roboto Flex (potentials
discovered, lines carry adjustmentStep != 0, treatments applied in
the DOM, color coding on/off per the switch, OFF MODE unaffected).

### Success Criteria

#### Automated: [x] new tests pass; full suite green.
#### Manual: [x] the viewer justifies with greedy-fit; lines color-code
by adjustment; the switch toggles it; quality is judgeable.

---

## Phase 4: Perf + ROADMAP ✅

- `npm run perf:composition` (greedy-fit engages the planner:
  re-shaping at shifted coords is the new cost — the Measurer
  caches absorb repeated locations), review together.
- ROADMAP: milestone 4 status; the storage open question recorded
  as the next design item.

### Success Criteria

#### Automated: [x] suite green; validated greedy-fit ratios within
the 1.5x gate (typing 1.017; recompose 1.266 baseline).

---

## Testing Strategy

Behavior from inputs: interpolation outputs, width deltas, line
structures, DOM custom properties, switch effects. Unit tests for
the pure modules (potentials, planner, algorithm); harness e2e for
the wiring. Real Roboto Flex + HarfBuzz (measurer.test.mjs
pattern).

## Sub-RPI handoff rule

As before. Suspects: the applicator's font-variation-settings merge
(the run styler owns the base property — coordination needed); the
best-fit specificity scoring if real fonts expose ambiguities.
