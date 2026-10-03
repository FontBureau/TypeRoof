# Milestone 3: Hyphenation + UAX#14 segmentation

## Overview

State-of-the-art segmentation (UAX#14 via the `linebreak` package,
replacing the v0 space tokenizer) and hyphenation (hypher/Knuth-Liang
with VENDORED pattern assets loaded async on demand via the
generalized ResourceRequirement machinery — the font machinery's
second instance). Research:
`docs/planning/agentic-artefacts/thoughts/research/2026-10-03-2227-milestone-3-hyphenation-uax14.md`
(all questions resolved).

## Current State Analysis

- Greedy ragged treats hyphen breaks like any break (contract ready:
  kind 'hyphen' + penalty; width baked into measurement).
- Hyphen RENDERING wired: CSS ::after + applicator class; mid-word
  offsets work with existing slicing.
- Intl.Segmenter line granularity DOES NOT EXIST (V8 never shipped
  it) — linebreak package is the route.
- The ResourceRequirement/_asyncResolve machinery resolves fonts
  (shell.mjs:1358; else-throw branches = plug-in points).
- Licenses checked: hypher BSD-3, patterns MIT, linebreak MIT.

### Key Decisions (research doc)

- Full linebreak-driven segmentation (not glue); CJK test paragraphs
  are the built-in behavior test.
- Patterns: VENDORED in-tree assets (lib/assets/hyphenation/,
  license headers kept), async on demand, session-only (no
  persistence); hypher as npm dependency.
- Config: own inheritable struct on TypeSpecModel ({enabled,
  minWordLength, minBefore, minAfter}, OrEmpty semantics).
- Hyphen width: ASCII "-" at the run's font/axes via the Measurer.
- Language: BCP47 language/lang → pattern key, fallback de-AT → de.

## What We're NOT Doing

- Dictionary scripts (Thai/Lao/Khmer/Myanmar — linebreak has hooks;
  later).
- Penalty-aware breaking (KP uses penalties; greedy ignores them).
- U+2010 hyphen glyph, hyphenation ZONE (pre-hyphenate lookahead).
- Pattern persistence/caching beyond the session.

## Implementation Approach

Five phases, each a reviewable unit with its own commit; stop after
each with a proposed message and wait for OKOK.

---

## Phase 1: UAX#14 segmentation

### Changes Required

**File**: `package.json` — add `linebreak` dependency.

**File**: `…/text-composition/segmenter.ts`
**Changes**: replace the `_TOKENIZE` space tokenizer in
`segmentTextRun` with linebreak-driven segmentation: iterate UAX#14
break opportunities; each maximal non-break span is a segment; a
trailing space stays its own segment (kept-in-line semantics
preserved: break AFTER the space); required breaks (BK class) map
to kind 'explicit', spaces to 'space'. The InlineItem taxonomy and
assembleLogicalParagraphs are UNCHANGED.

**File**: `…/text-composition/segmenter.test.mjs`
**Changes**: update/extend — punctuation (don't break before
closing punctuation), CJK breaks between ideographs (the test
document's Chinese paragraphs), existing space semantics unchanged.

### Success Criteria

#### Automated:
- [ ] Tests pass; full suite green (the harness composition tests
      run on UAX#14 segments — structural assertions must hold).

#### Manual:
- [ ] The viewer's CJK paragraphs break (visibly different,
      correct).

---

## Phase 2: Hyphenation config struct (model-first)

### Changes Required

**File**: `lib/js/components/type-spec/text-composition-models.mjs`
**Changes**: HyphenationModel struct {enabled
(BooleanDefaultTrueOrEmptyModel — on by default at the root via
registration, empty = inherit), minWordLength, minBefore, minAfter
(OrEmpty numbers with registered defaults)}.

**File**: `lib/js/components/type-spec/models.mjs`
**Changes**: field ['hyphenation', HyphenationModel] on
TypeSpecModel.

**Files**: registered-properties.mjs (generic entries with
defaults), properties-generators.mjs (hyphenationGen yields the
resolved values), pps-maps/defaults as the struct requires (generic
PPS for the struct fields → UI for free).

**File**: model tests: defaults/inheritance/round-trip.

### Success Criteria

#### Automated: tests pass; full suite green.
#### Manual: the hyphenation section renders in the typeSpec UI.

---

## Phase 3: Dynamic pattern asset machinery

### Changes Required

**File**: `lib/assets/hyphenation/en-us.json`, `de.json` (new)
**Changes**: vendored TeX patterns converted from the
hyphenation.en-us / hyphenation.de packages (JSON: {patterns,
exceptions?}, license/provenance headers preserved as a comment
field or sibling LICENSE note).

**Files**: main-model.mjs / shell state dependencies
**Changes**: InstalledHyphenationPatternsModel (ordered map of
generic values = parsed pattern objects) + a state dependency
('installedHyphenationPatterns') registered like installedFonts.

**File**: the hyphenation config/reference
**Changes**: pattern key resolution via a ForeignKey with CUSTOM
constraint yielding a ResourceRequirement (the activeFontKey
pattern, models.mjs:197-221) when the key is not installed.

**File**: `lib/js/shell.mjs`
**Changes**: _asyncResolve branch for the patterns container: map
language → asset URL, fetch + parse + install into the state
dependency draft (session-only). Language fallback chain
(de-AT → de → null).

**File**: `lib/js/wikipedia/main.mjs` (and other shells if needed)
**Changes**: register the state dependency.

### Success Criteria

#### Automated: full suite green.
#### Manual: loading a document with hyphenation enabled fetches
the pattern (network tab); no reload loops.

---

## Phase 4: Hyphenator pass + wiring

### Changes Required

**File**: `package.json` — add `hypher` dependency.

**File**: `…/text-composition/hyphenator.ts` (new)
**Changes**: the pure pass: (segments, leafTexts, patterns,
{minWordLength, minBefore, minAfter}, measureHyphenWidth) →
{segments, breaks} with word segments split at hyphenation points,
kind 'hyphen' breaks with a penalty (e.g. 10), first-part segments
marked to include the hyphen width. Per-language Hypher instance
cache.

**File**: `…/text-composition/composition-controller.ts`
**Changes**: run the Hyphenator between segmentation and
measurement when enabled + pattern installed + language mapped;
measure the hyphen glyph width via the Measurer (ASCII "-") and add
it to first-part segment widths; ingredients snapshot gains the
hyphenation config + pattern identity.

### Success Criteria

#### Automated:
- [x] hyphenator.test.mjs behavior tests (split points, min-length
      gates, hyphen width baked in, penalty present); full suite
      green. (Hyphen width: asserted end-to-end in the wiring test —
      the controller bakes it into hyphenAfter segment widths, not
      the hyphenator itself.)
- [x] Wiring test (lib/js/tests/text-composition): hyphen segments +
      lines broken at hyphen points in the payload, the
      -line-hyphen class in the DOM, source text reconstructed
      exactly (no hyphen character), Host control off = no hyphens.

#### Manual:
- [ ] The viewer hyphenates (de/en text, narrow column); the
      -line-hyphen ::after renders; selection/copy of hyphenated
      words contains NO hyphen character.

---

## Phase 5: Perf re-run + snapshot

- `npm run perf:composition`, review numbers together (hyphenation
  on = more segments + pattern fetch), --write-baseline deliberately.

### Outcome (2026-10-04)

- [x] Ratios fine and stable across 4 runs: typing 0.98–1.04,
      recompose 0.92–0.99 (baseline 1.022 / 0.962) — hyphenation
      costs nothing measurable at wikipedia scale.
- [x] The onMs absolute "regressions" (50–70x typing) are
      ENVIRONMENTAL: reproduced on the pre-phase-4 parent commit
      (801205f8) with composition OFF — the whole cycle is slower in
      this environment, not composition. Decision (operator):
      NO --write-baseline; the checked-in baseline's ratios hold.
- Note: the script's onMs absolute gate can't survive cross-load/
      cross-environment runs; ratio is the documented machine-stable
      metric. (Perf-script improvement candidate, not done here.)

## Sub-RPI handoff rule

As before. Suspect: the state-dependency registration (installedFonts
has several touch points: shell, main-ui, wikipedia main).
