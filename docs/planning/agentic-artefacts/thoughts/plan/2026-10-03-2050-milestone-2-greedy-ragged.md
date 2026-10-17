# Milestone 2: Greedy Ragged + per-typeSpec algorithm selection

## Overview

The first real composition algorithm (greedy ragged) plus the
model-first infrastructure it forces: inheritable textComposition
engagement (fixing the root-only bug) and the dynamic-struct
algorithm selection with per-typeSpec configuration. Research:
`thoughts/research/2026-10-03-2018-milestone-2-greedy-ragged.md`
(all questions resolved incl. corrections).

## Current State Analysis

- Dummy algorithm + Host pipeline working (milestone 1); measurement
  truth (Sprint A); harness + perf baseline (Sprint B).
- `textComposition` boolean: BooleanDefaultTrueModel, read from the
  ROOT typeSpec only — NOT inheritable, per-node off does nothing
  (bug confirmed in review).
- Algorithm selection: none (controller calls the dummy statically).
- Precedents: horizontalLayout/HorizontalLayoutAlgorithmModel
  (type-spec/horizontal-layout-models.mjs:177, createDynamicModel;
  generator yields horizontalLayout/algorithm + instance,
  properties-generators.mjs:544ff); BooleanDefaultTrueOrEmptyModel
  exists (autoOPSZ precedent); CombinatorOrCharsSelectorModel for
  OrEmpty-around-dynamic.

### Key Decisions (research doc)

- Ragged semantics: break-walk at step 0 only, adjustmentStep 0
  everywhere; slack badness (lineWidth−natural)/lineWidth, overfull
  ≥ 1; trailing space KEPT in the line (copy/paste/search) but
  excluded from the fit test; explicit breaks end lines early;
  overfull single segments get their own flagged line.
- Dynamic struct NOW (config is certain: dummy's
  DUMMY_SEGMENTS_PER_LINE), per typeSpec, inheriting; types:
  Dummy {segmentsPerLine default 4}, GreedyRagged {} (no config
  yet); inherit = empty instance.
- Config MODELS in the type-spec submodule; IMPLEMENTATION in
  greedy-ragged.ts. Boolean stays (explicit off = we do nothing);
  coherence clears the algorithm struct when composition is off.

## What We're NOT Doing

- Hyphenation (milestone 3, data question answered in research).
- UAX#14 segmentation refinement.
- Algorithm-specific UI (model + stream only; UI controls later).
- KP anything.

## Implementation Approach

Four phases, each a reviewable unit with its own commit; stop after
each with a proposed message and wait for OKOK.

---

## Phase 1: Inheritable engagement (bug fix, FIRST)

### Changes Required

**File**: `lib/js/components/type-spec/models.mjs`
**Changes**: `textComposition` field → BooleanDefaultTrueOrEmptyModel
(empty = inherit; default at the root via the registered property's
default true). Migration check: existing serialized "0"/"1" values
must round-trip; omitted stays omitted.

**File**: `lib/js/components/layouts/type-stage/properties-generators.mjs`
**Changes**: new `textCompositionGen` yielding
`generic/textComposition` when the field is non-empty (the fontGen
pattern: yield only when set; inheritance does the rest); add to
TYPE_SPEC_PROPERTIES_GENERATORS.

**File**: `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts`
**Changes**: the drive reads the RESOLVED `generic/textComposition`
from the textblock's nodeProperties scope (replacing the root
typeSpec model read); false → unpublish+notify (existing path).
Ingredients snapshot gains the resolved flag.

**File**: `lib/js/tests/text-composition/index.test.mjs`
**Changes**: extend the off-mode test — set textComposition false on
a NON-root typeSpec (e.g. paragraphs) and assert only the affected
textblocks decompose (inheritance through the cascade).

### Success Criteria

#### Automated:
- [ ] Model round-trip tests (extend model.test.mjs: OrEmpty empty
      default, explicit false, legacy docs).
- [ ] New per-typeSpec engagement test passes; full suite green.

#### Manual:
- [ ] Turning textComposition off on `paragraphs` turns it off on
      `paragraphs/t1` and `paragraphs/t2` in the viewer.

---

## Phase 2: Dynamic struct (algorithm selection + config)

### Changes Required

**File**: `lib/js/components/type-spec/text-composition-models.mjs` (new)
**Changes**: TextCompositionAlgorithmDummyModel
{segmentsPerLine: NumberModel default 4},
TextCompositionAlgorithmGreedyRaggedModel {} (no config yet);
`createDynamicModel("TextCompositionAlgorithm", [...])` following
horizontal-layout-models.mjs EXACTLY (incl. deserialize helper if
the pattern requires it).

**File**: `lib/js/components/type-spec/models.mjs`
**Changes**: field `['textCompositionAlgorithm',
TextCompositionAlgorithmModel]` on TypeSpecModel + coherence: when
textComposition is explicitly false, clear the instance to empty
(inherit). Import/export wiring.

**File**: `…/properties-generators.mjs`
**Changes**: extend textCompositionGen: yield
`textCompositionAlgorithm/algorithm` (typeKey) + the instance's
config values under `textCompositionAlgorithm/<field>` keys
(horizontalLayoutGen pattern) — empty instance yields nothing
(inherit).

**Files**: defaults/pps-maps plumbing as required by the precedent
(getTypeSpecDefaultsMap special-cases horizontalLayout similarly;
pps-maps excludes non-generic fields).

**File**: model tests: dynamic type round-trip, coherence clearing,
inheritance (empty inherits parent).

### Success Criteria

#### Automated:
- [ ] Model + generator tests pass; full suite green.

#### Manual:
- [ ] none (no behavioral consumer until phase 3; verified via
      tests).

---

## Phase 3: greedy-ragged algorithm + wiring

### Changes Required

**File**: `…/text-composition/greedy-ragged.ts` (new)
**Changes**: the greedy ragged CompositionAlgorithm per the decided
semantics (slack badness; trailing space kept-not-fitted; explicit
breaks; overfull single-segment lines flagged). Pure, contract-only
imports.

**File**: `…/text-composition/greedy-ragged.test.mjs` (new)
**Changes**: behavior tests (dummy-composition.test.mjs patterns):
fit-driven breaking, trailing-space exclusion from the fit test
(space still in the line), explicit breaks, overfull flagging,
slack badness values, empty input.

**File**: `…/text-composition/composition-controller.ts`
**Changes**: per-textblock algorithm resolution from the properties
stream (typeKey → implementation map; dummy config segmentsPerLine
passed to the dummy); the dummy gets a segmentsPerLine parameter
(default 4, config overrides). Ingredients snapshot gains the
algorithm key + config identity.

### Success Criteria

#### Automated:
- [ ] New tests pass; full suite green; typecheck, lint.

#### Manual:
- [ ] Viewer breaks greedily at real widths (dramatically better
      than the dummy); overfull tinting plausible; selecting the
      dummy per typeSpec shows the dummy behavior again.

---

## Phase 4: Perf re-run + snapshot

### Changes Required

- Run `npm run perf:composition` (dummy still selectable; make the
  default state use greedy-ragged); review numbers together;
  `--write-baseline` with the legitimate-change commit.

### Success Criteria

#### Manual:
- [ ] Greedy-ragged overhead reviewed and accepted (or flagged).

---

## Testing Strategy

- Model/generator tests (behavior: round-trip, inheritance,
  coherence).
- Algorithm behavior tests (contract inputs → line structure).
- Harness integration test extension (per-typeSpec off).
- Perf: informational + snapshot.

## Sub-RPI handoff rule

As before. Suspects: the defaults/pps plumbing for the dynamic
struct (the horizontalLayout precedent has several touch points).
