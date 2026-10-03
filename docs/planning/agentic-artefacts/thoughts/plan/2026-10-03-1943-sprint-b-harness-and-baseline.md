# Sprint B: Testing Harness + Performance Baseline (text-composition)

## Overview

Two deliverables that build on each other: (1) a composition testing
harness asserting composed line structure FROM DOCUMENT INPUTS;
(2) a performance baseline script with regression detection. Research:
`thoughts/research/2026-10-03-1922-sprint-b-harness-and-baseline.md`
(all questions resolved in its Follow-up sections). Follows Sprint A
(concluded 425babab).

## Current State Analysis

- buildWorld (lib/js/tests/type-stage-toggles/harness.mjs:108-183)
  boots the real TypeStageController in jsdom, ingests an HTML
  fixture, drives updates synchronously; the composition controller
  runs but no-ops (no harfbuzz on the bus — capability fallback).
- measurer.test.mjs proves node-side harfbuzz + real RobotoFlex
  loading.
- Composition is jsdom-safe by design (no DOM measurements in the
  pipeline).
- No benchmark infrastructure exists; puppeteer ^25.8.0 devDep;
  create-clip-frames is the driving pattern; dev server on :3000.
- No TypeStage state files exist (fixtures must be created).

### Key Decisions (research doc Follow-up sections)

- Regression detection: `npm run perf:composition`; key metric =
  overhead RATIO (t_on/t_off, machine-stable); checked-in baseline
  snapshot JSON updated deliberately (PR diffs show performance
  movement); >1.5x deviation = regression exit code; NOT git commits
  as compare points. Console table + gitignored local history; CI
  later, informational first.
- Fixtures: SMALL = the type-stage DEFAULT STATE (NOT the wikipedia
  JSON — too massive); LARGE = a current wikipedia-app export,
  explicitly a snapshot-in-time (operator exports at implementation
  time).
- Harness: extend buildWorld with an options object ({harfbuzz,
  font}; defaults = today's behavior — existing tests untouched).
- Assertions at BOTH levels: payload (precise composition
  regressions; future-proof for a non-DOM backend) + DOM
  (applicator regressions).
- Timing profiles: BOTH typing bursts (incremental recomposition)
  and full-document recompose (style-change burst).

## Desired End State

- `npx vitest run lib/js/tests/text-composition/` asserts composed
  structure from document inputs (payload + DOM), green in the full
  suite.
- `npm run perf:composition` prints the overhead-ratio table and
  exits non-zero on >1.5x regression vs. the checked-in snapshot.

## What We're NOT Doing

- CI gating (informational first).
- Real-algorithm benchmarks (milestone 2+; this baseline is dummy +
  OFF).
- Wikipedia fixture maintenance automation (snapshot-in-time).

## Implementation Approach

Three phases, each a reviewable unit with its own commit; stop after
each with a proposed message and wait for OKOK.

---

## Phase 1: Harness groundwork

### Changes Required

**File**: `lib/js/tests/type-stage-toggles/harness.mjs`
**Changes**: `buildWorld(options = {})` — `{harfbuzz = null,
fontLoader = null}`; when given, put harfbuzz on the widgetBus and
install a real font (the measurer.test.mjs loading pattern:
decompressFontBuffer + createFontObject + axisRanges from
fontObject.tables.fvar) instead of the stub. Defaults preserve
today's behavior exactly.

**File**: `lib/js/tests/fixtures/type-stage-default-state.json` (new)
**Changes**: the type-stage DEFAULT STATE serialized (small fixture;
source: the TypeStageModel defaults, e.g. via the running app or
programmatic serialization — NOT the wikipedia initial-state JSON,
which is massive).

### Success Criteria

#### Automated:
- [ ] Existing harness consumers pass unchanged (type-stage-toggles,
      viewer-behavior, document-replace).
- [ ] typecheck, lint, full suite pass.

#### Manual: none.

---

## Phase 2: Composition structure tests

### Changes Required

**File**: `lib/js/tests/text-composition/index.test.mjs` (new)
**Changes**: `// @vitest-environment jsdom`; boot via buildWorld with
the real font + harfbuzz and the small fixture in VIEWER mode; drive
updates via the synchronous StateComparison pattern. Assertions,
both levels, behavior-level (from document inputs):
- payload: read the composition@ registry via the layout
  controller's getProtocolHandlerImplementation — paragraphs exist
  per textblock, line text slices reconstruct the source text,
  overfull lines reported for a known-narrow case.
- DOM: `.typeroof-composed` on textblocks, line spans per paragraph,
  concatenated line-span textContent equals the source text, the
  carrier span for mark-less runs, overfull color-coding present.
- off mode: toggle root textComposition → spans gone, class removed.
- editing: change text via draft → recomposition reflects it.

### Success Criteria

#### Automated:
- [x] New tests pass; full suite green; typecheck, lint.
      (336/336; 5 composition structure tests)
      ENGINEERING NOTES (hard-won):
      1. NODE env + manual JSDOM globals (window, document, DOMParser,
         Node, NodeFilter, Element, HTMLElement, DocumentFragment,
         CustomEvent, MutationObserver, rAF via pretendToBeVisual,
         ResizeObserver copied from the setup.ts stub) — jsdom env
         breaks harfbuzz's WASM resolution; emscripten treats any
         global document as "browser", so harfbuzz must be a STATIC
         import (initializes under plain node) and the harness chain
         dynamic AFTER globals.
      2. GOTCHA: vitest scans comments for the environment pragma —
         do not write the jsdom-environment pragma even to explain
         its absence (this exact bug cost a debugging round).
      3. Payload ids derived from the DOM (--node-anchor-name) —
         no white-box registry key listing.
      4. Text-node edits: find the path in the immutable tree, get
         the draft via getEntry (draft containers don't yield child
         drafts on .value).

#### Manual: none.

---

## Phase 3: Performance script + baseline snapshot

### Changes Required

**File**: `scripts/perf-composition` (new, node executable)
**Changes**: puppeteer (create-clip-frames pattern) against the dev
server; loads the LARGE fixture (wikipedia export — OPERATOR
DEPENDENCY: exported at implementation time, committed to
docs/states-library/fixtures/ — a NEW "fixtures" category:
NOT a demo (the wikipedia output is not representative yet),
clearly labeled snapshot-in-time for measurement purposes);
via `window.shell`: N typing-burst cycles + N full-recompose bursts,
each with textComposition ON and OFF; report per-profile absolute ms
+ overhead ratio.

**File**: `package.json`
**Changes**: `"perf:composition": "scripts/perf-composition"`.

**File**: baseline snapshot JSON (next to the script or fixture):
`{gitCommit, date, metrics}`; the script compares and exits non-zero
beyond 1.5x; console table output; optional gitignored local history
append.

### Success Criteria

#### Automated:
- [ ] Script runs against the dev server; prints the table; exit
      code reflects the comparison (first run WRITES the snapshot
      with --write-baseline).

#### Manual:
- [ ] Numbers are plausible (composition overhead visible but not
      catastrophic at wikipedia scale with the dummy).

---

## Testing Strategy

- The harness IS the test (behavior-level, from document inputs).
- Perf script: manual/informational; regression exit code for future
  CI.

## Sub-RPI handoff rule

As before: if a phase balloons (suspect: puppeteer state-loading
edge cases), spawn a sub-cycle. Handoff chain: this plan → Sprint B
research doc → text-composition design headers → ROADMAP.
