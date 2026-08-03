# Ingest Engine: Unified Emission Rules Implementation Plan

## Overview

Restructure `lib/js/wikipedia/ingest_next.ts` so that all element-handling
policy lives in one ordered, selector-based emission-rule table passed via
`IngestionOptions`, with `ingestWikipediaDocument` carrying the complete
Wikipedia setup. The engine keeps only the reserved vocabulary (`doc`,
`text`, `hard_break`, `raw_html_block`, `raw_html_inline`,
`generic-style`) and the mechanism. Block-context handling changes from
"prune inline content to raw_html_block" to scoped run-lifting.

Basis: research document
`thoughts/research/2026-08-03-1657-wikipedia-ingest-next-structure.md`
(git db9f09f7, branch demo/wikipedia). All line references below are to
that state.

## Current State Analysis

- `ingestNode` (`ingest_next.ts:608-831`) is a 12-branch precedence chain;
  seven policy pieces are hardcoded module constants (`KNOWN_BLOCK_TAGS:22`,
  `KNOWN_MARK_TAGS:55`, `INLINE_TAGS:67`, `SELECTORS_TO_RAW_HTML:111`,
  `FALLBACK_INLINE_CONTENT_NODES:46`, BR→hard_break `:804`, LI split
  `:568-606`).
- Two mechanisms are already options and share the target shape — ordered
  `{selector, rule}`, first `element.matches()` wins: `markEmission`
  (`:154-157`, resolver `:457-484`) and `nodeEmission` (`:162-165`,
  resolver `:442-448`).
- Known defects: markEmission gated on `KNOWN_MARK_TAGS` (silent rule
  trap, `:750`); `resolveNodeEmission` ignores context (`:667`); dead
  `BODY:"doc"` + `!== "doc"` guard; unused `traverseDom`; misnamed report
  fields; 5x duplicated htmlAttrs-bag pattern; twin mark-draft
  constructors; twin child-iteration helpers; 5x `*FromSchema` +
  guard-ternaries (`:865-882`).
- Behavioral fork: inline content in blocks-only containers is pruned
  under `<section>` but run-lifted inside `li-block`.
- Tests: 951 lines, 49 passing; `loadStateSchema` defined 4x; **no
  `ul`/`li` coverage at all** (`ingestListItem` untested).

## Desired End State

- `ingestDOM(doc, options)` is an empty engine: no built-in tag tables.
  Policy arrives as `options.emissionRules: EmissionRuleEntry[]` (plus
  `proseMirrorSchema`, `attrPolicy`, `liftedRunWrapper`, `logger`).
- `ingestWikipediaDocument` composes exported rule-set constants into the
  complete, readable Wikipedia configuration.
- Block containers lift positively-resolving inline runs into wrapper
  paragraphs (`report.liftedRuns`); unresolved elements stay
  `raw_html_block` + counter + log (discovery preserved).
- All 49 existing behaviors either still pass or are consciously updated
  in the lift phase; new `ul`/`li` coverage pins `ingestListItem` first.

Verification: `npx vitest run lib/js/wikipedia/ingest_next.test.mjs`,
full `npx vitest run`, `npm run typecheck` (no NEW errors; the
pre-existing `main.ts` TS2305 remains until the deferred deletion),
`npm run lint`, demo smoke test (Phases 4-5).

### Key Discoveries (carried from research)

- Reserved vocabulary contract: `default-schema.ts:20-233`; sync stand-ins
  for unknown typeKeys `integration.typeroof.jsx:459-465,1143-1160`; attr
  guard lives outside ingest (`html-attrs.ts:7-8`).
- `paragraph` is the only non-reserved hardcoded typeKey (`:591`, `:647`)
  — becomes the `liftedRunWrapper` option default.
- parseDOM matching is `selector ?? tag` (`integration.typeroof.jsx:668-673`)
  — the same selectors drive ingest and replay.
- State schema (`type-stage-wikipedia-initial-state.json`) declares
  heading-1..3 only; the engine's h4-h6 mappings produce `unknown_block`
  via sync when used. Observed oddity, NOT changed by this plan (rules
  mirror current behavior).

## Operator Decisions (2026-08-03, recorded)

1. Option B: unified ordered emission-rule table; engine/setup separation.
2. Context-fit resolution: non-fitting entries skipped, first fitting
   match wins, no match → context catch-all.
3. Rule kinds as proposed; mw-empty-elt handling stays `raw` in the
   Wikipedia config; `skip` exists as an available kind.
4. Schema-derived rules append after explicit entries (position control
   deferred).
5. cite-link entry gets `context: "inline"`; stray citation in block
   context must not crash (falls to raw_html_block; under lift it joins a
   run instead).
6. Empty engine; default table lives alongside `ingestWikipediaDocument`.
7. **Lift-only**: scoped run-lifting replaces prune entirely (supersedes
   the 2026-07-24 prune decision). No mode option, no per-rule placement.
   Unresolved elements keep the raw_html_block catch-all. li-block run
   classification unifies with the same positive-resolution rule.
8. Logging behind an optional `logger` (silent default); wikipedia variant
   logs to console.
9. Report renames: `skippedMarkAttrs` → `skippedHtmlAttrs`, `mwEmptyElts`
   → `rawAtoms`; add `liftedRuns`, drop `wrappedStrayTexts` (lift phase).
10. ul/li tests land up-front (Phase 1).
11. After each phase: STOP; present diffstat + commit message; operator
    reviews and confirms with OKOK. No commits by the agent
    (~/MANNERS.md, ~/COLLABORATION.md; commit metadata read from actual
    sources at commit time).

## What We're NOT Doing

- No rename `ingest_next.ts` → `ingest.ts`, no deletion of `ingest.ts` /
  `main.ts` (deferred until the demo is completed; the known TS2305 in
  `main.ts:1` stays open until then).
- No prune/lift mode option and no per-rule lift placement (lift-only).
- No position control for schema-derived rules (always appended).
- No sanitization changes (raw/verbatim replay is an operator decision).
- No new element support (ol, table, blockquote, dl...) — future rule
  entries, enabled but not added by this plan.
- No changes to `default-schema.ts`, `html-attrs.ts`,
  `integration.typeroof.jsx`, or the state JSON.

## Implementation Approach

Five phases, each independently green and reviewable. Phases 1-3 are
behavior-preserving (existing tests keep passing unmodified except where a
phase explicitly says otherwise). Phase 4 empties the engine (test setup
churn, same behaviors). Phase 5 changes behavior (lift) with its own test
updates. Rationale: never mix "moved" and "changed" in one diff.

### Target types (final shape, introduced in Phase 3)

```typescript
export type EmissionContext = "block" | "inline";

export type EmissionRule =
    | { kind: "block"; typeKey: string; inlineContent?: boolean }
    | { kind: "mark"; name: string }
    | { kind: "generic"; styleName: string }
    | { kind: "inline-node"; typeKey?: string }   // default: lowercased tag
    | { kind: "atom"; typeKey: string }           // reproducing atom
    | { kind: "raw" }                             // raw_html_* by context
    | { kind: "void"; typeKey: string }           // e.g. BR -> hard_break
    | { kind: "transparent" }
    | { kind: "skip" }
    | {
          kind: "split-item";                     // e.g. LI
          inlineTypeKey: string;
          blockTypeKey: string;
      };

export interface EmissionRuleEntry {
    selector: string;
    rule: EmissionRule;
    // restricts matching to a context; omitted = fits both.
    // Kind-intrinsic fit still applies (mark/generic/inline-node/void
    // are inline-only; block/split-item are block-only;
    // atom/raw/transparent/skip fit both).
    context?: EmissionContext;
}
```

Resolution (one function, replaces resolveNodeEmission +
resolveMarkEmission + the tag-table branches): iterate explicit entries,
then schema-derived entries; skip entries whose context/kind does not fit;
first fitting `el.matches(selector)` wins; none → catch-all of the
context. Schema-derived entries: node specs with non-empty `selector` →
`atom` rules (as `nodeSelectorsFromSchema` today); mark specs with a tag →
`mark` rules (as `semanticMarksFromSchema` today). An explicit `mark` rule
naming an undefined mark falls back to generic + `unresolvedMarkRules`
(unchanged).

`inlineContent` on `block` rules: schema-derived inline-ness
(`inlineContentNodesFromSchema`) wins when a schema is present; the rule
field is the no-schema fallback. `FALLBACK_INLINE_CONTENT_NODES` is
deleted; the information moves into the block rules of the default table.

---

## Phase 1: Pin & tidy tests (no engine change)

### Overview
Close the `ul`/`li` coverage gap so Phases 3/5 refactor against pinned
behavior; consolidate organically-grown test helpers.

### Changes Required

**File**: `lib/js/wikipedia/ingest_next.test.mjs` (only file touched)

1. Consolidate helpers at module top: single `loadStateSchema` (replaces
   the 4 verbatim copies at `:562,690,760,856`); move `allMarksOf`
   (`:229-238`) next to `marksOf`; rename the destructured shadows of
   `typeKey` at `:622,667,738` (e.g. `markTypeKey`); fix describe #2 name
   ("ingestDOM with schema: semantic marks" — it calls `ingestDOM`, not
   `ingestWikipediaDocument`).
2. New `describe("ul/li list ingestion")` pinning CURRENT
   `ingestListItem` behavior (no schema, plain `ingestDOM`):
   - `<ul><li>a <b>b</b></li></ul>` → `ul > li-inline` with text+mark;
   - `<ul><li>intro<ul><li>x</li></ul>tail</li></ul>` → outer `li-block`:
     `paragraph["intro"]`, nested `ul > li-inline`, `paragraph["tail"]`
     (run lifting, `flushRun` `:589-605`);
   - li htmlAttrs bag + skipped-attr counting (`li.style` key format,
     `:575-579`);
   - stray `<li>` NOT under `<ul>` (e.g. direct child of `<section>`)
     falls to the block catch-all (`:703` parent check);
   - `<li>` in inline context falls to inline catch-all;
   - EDGE, pinned as-is with a `// Phase 5 changes this` comment:
     `<ul><li>text<table>...</table></li></ul>` — table is NOT in
     KNOWN_BLOCK_TAGS, so it joins the run → li-inline containing
     raw_html_inline (current `isBlockChild` semantics `:570-572`).
   - end-to-end variant with `loadStateSchema` (li-inline/li-block are
     state-schema types; sync sanity).

### Success Criteria

#### Automated Verification:
- [x] `npx vitest run lib/js/wikipedia/ingest_next.test.mjs` — all pass
      (49 existing + 7 new = 56)
- [x] `npm run lint` clean for the test file
- [x] `git diff --stat` touches only `ingest_next.test.mjs`

#### Manual Verification:
- [x] Operator agrees the pinned li edge-case semantics are correctly
      labeled as "current, changes in Phase 5" (OKOK 2026-08-03, commit
      4e2e8614)

STOP: present diffstat + commit message; wait for OKOK.

---

## Phase 2: Dead code & internal DRY (options surface unchanged)

### Overview
Remove approved dead code, deduplicate internals, rename report fields.
`IngestionOptions` shape untouched; all tests pass with only the report
field renames applied to assertions.

### Changes Required

**File**: `lib/js/wikipedia/ingest_next.ts`
1. Delete `traverseDom` (`:964-975`), `BODY: "doc"` entry (`:23`), the
   `!== "doc"` guard (`:712`).
2. Merge `newGenericStyleMarkDraft`/`newSemanticMarkDraft` (`:345-376`)
   into one `newMarkDraft(marksList, typeKey, attrs, htmlAttrs)`;
   generic-style becomes `newMarkDraft(list, "generic-style",
   {"data-style-name": styleName}, bag)`. (Both currently take `nodeDraft`
   only to reach `marks` — pass the list.)
3. Merge `fillContent`/`ingestChildrenInto` (`:532-557`): keep
   `ingestChildrenInto(el, marks, out, ctx, inInline)`; `fillContent`
   becomes a 3-liner over it (temp array → content pushes) or inlines
   away.
4. One `setHtmlAttrsBag(attrsDraft, el, ctx, tagLabel)` helper for the 5
   duplicated bag+skip-count sites (`:575-579,713-722,761-765/774,
   785-786/794,812-816`). The repro-atom site (`:673-676`) keeps its
   unconditional-set + no-skip-count semantics — factor the bag
   collection, not the divergent policy (documented in a comment).
5. One `deriveSchemaFacts(proseMirrorSchema | undefined)` returning
   `{semanticMarks, markAttrs, nodeAttrs, inlineContentNodes,
   nodeSelectors}` with built-in defaults; replaces the five ternaries in
   `ingestDOM` (`:865-882`). The five `*FromSchema` functions become
   internal to it (exported `semanticMarksFromSchema`/
   `nodeSelectorsFromSchema` stay exported — the test imports the former).
6. Rename report fields: `skippedMarkAttrs` → `skippedHtmlAttrs`,
   `mwEmptyElts` → `rawAtoms` (interface `:113-135`, init `:850-861`,
   count sites, `logReport`). Add `unresolvedMarkRules` to `logReport`
   (currently missing, research §1).

**File**: `lib/js/wikipedia/ingest_next.test.mjs`
7. Mechanical rename of the two report fields in assertions
   (`:92,201,265,682-685` + new Phase-1 sites).

### Success Criteria

#### Automated Verification:
- [x] `npx vitest run lib/js/wikipedia/ingest_next.test.mjs` all pass (56)
- [x] `npx vitest run` (full suite) — no regressions (105/105, 6 files)
- [x] `npm run typecheck` — no new errors (only pre-existing main.ts TS2305)
- [x] `npm run lint` clean (eslint, prettier, stylelint)
- [x] `grep -n traverseDom lib/js/wikipedia/ingest_next.ts` → empty

#### Manual Verification:
- [x] Operator reviews that factored helpers didn't smuggle in behavior
      changes (OKOK 2026-08-03, commit 06480a88; note: function
      skippedHtmlAttrs renamed policyExcludedAttrNames to avoid
      colliding with the renamed report field)

STOP: present diffstat + commit message; wait for OKOK.

---

## Phase 3: Engine speaks rules (behavior-identical bridge)

### Overview
Introduce `EmissionRule`/`EmissionRuleEntry` and the unified resolver;
rewrite `ingestNode` as a thin kind-dispatcher. The hardcoded tables are
TRANSLATED into an internal default rule table consumed through the same
path — a temporary bridge so every existing test proves the mechanism
reproduces today's behavior. Old option fields keep working by
translation.

### Changes Required

**File**: `lib/js/wikipedia/ingest_next.ts`

1. Add the target types (see "Target types" above) and
   `resolveEmission(ctx, el, context): ResolvedEmission | null`:
   - iterates `ctx.rules` (explicit) then `ctx.schemaRules` (derived);
   - kind-intrinsic context fit: mark/generic/inline-node/void →
     inline-only; block/split-item → block-only; atom/raw/transparent/skip
     → both; entry `context` field narrows further;
   - non-fitting entries are skipped (operator decision Q1);
   - `mark` rules resolve attrs via schema facts; undefined mark name →
     generic fallback + `unresolvedMarkRules` (moved from
     `resolveMarkEmission`).
2. Build the internal bridge table `DEFAULT_RULES` translating, in
   precedence order mirroring today's chain (research §1 branches 4-11):
   - `{selector: ".mw-empty-elt, meta", rule: {kind: "raw"}}`
   - transparentContainers option → `transparent` entries (translation)
   - `{selector: "ul > li", rule: {kind: "split-item", inlineTypeKey:
     "li-inline", blockTypeKey: "li-block"}, context: "block"}`
     (replaces the hand-coded parent check `:703-706`)
   - KNOWN_BLOCK_TAGS (minus BODY) → `block` entries; the six
     FALLBACK_INLINE_CONTENT_NODES textblocks get `inlineContent: true`
     (paragraph, heading-1..3, figcaption; plus heading-4..6 per current
     KNOWN_BLOCK_TAGS with schema-fallback semantics preserved)
   - KNOWN_MARK_TAGS → `generic` entries (`b, strong` → bold; `i, em` →
     italic; `a` → link) — the resolver's schema-mark derivation preserves
     the "schema wins over KNOWN_MARK_TAGS style" behavior (`:476-483`)
   - `{selector: "br", rule: {kind: "void", typeKey: "hard_break"}}`
   - INLINE_TAGS → one `{selector: "abbr, b, bdi, ...", rule:
     {kind: "inline-node"}}` entry
   Ordering note: today mark-tags precede INLINE_TAGS for the same tag
   (B, A...); the table must preserve that precedence.
3. `ingestDOM` wiring: `options.markEmission`/`options.nodeEmission`/
   `options.transparentContainers` are translated into rule entries
   PREPENDED to `DEFAULT_RULES` (markEmission loses its KNOWN_MARK_TAGS
   gate — see behavior note below). New optional `options.emissionRules`
   accepted and placed before the translated legacy entries.
4. `ingestNode` becomes: text branch (unchanged incl. stray-text wrap —
   lift comes in Phase 5) → non-element → `resolveEmission` → kind
   dispatch to small emitter functions (`emitBlock`, `emitAtom`,
   `emitRaw`, `emitInlineNode`, `emitVoid`, `emitSplitItem`,
   mark-descent, transparent-descent, skip) → context catch-all.
   `ingestListItem` becomes `emitSplitItem` (same body; `isBlockChild`
   temporarily resolves via rule table: "does the child resolve to a
   block-only kind?" — pinned by Phase-1 tests as current behavior since
   table children resolve to nothing → run, matching today).
5. `logger` option lands here (Q8): `interface IngestLogger { log(...) }`;
   `ctx.logger` default no-op; catch-all logs and `logReport` route
   through it. `ingestWikipediaDocument` passes `console`.
6. Report: `count(report.rawAtoms, tag)` now fires for every `raw` rule
   emission (was mw-empty-elt only — same sites as today via the bridge
   table, so counts unchanged).

Behavior note (intended, minor): a `markEmission` rule whose selector
matches a non-KNOWN_MARK_TAGS element now fires (gate removed). No
existing test depends on the gate; the trap's removal is a Phase-3
deliverable. Everything else must be bit-identical.

**File**: `lib/js/wikipedia/ingest_next.test.mjs`
7. NO changes to existing tests (that is the proof). Add a small
   `describe("emissionRules option")`: explicit rule beats default table;
   context-misfit entry is skipped (e.g. a block rule matched in inline
   context falls through to inline catch-all — pins Q1); `skip` kind
   emits nothing; cite-link entry with `context: "inline"` in block
   context does not crash (Q4/Q5 pin: falls to raw_html_block).

### Success Criteria

#### Automated Verification:
- [x] All Phase-1/2 tests pass UNMODIFIED (56/56)
- [x] New emissionRules tests pass (5, total 61)
- [x] `npx vitest run` full suite green (110/110); `npm run typecheck`
      no new errors; `npm run lint` clean

#### Manual Verification:
- [x] Operator reviews resolver + dispatcher readability (OKOK
      2026-08-03, commit c7938cc4)

STOP: present diffstat + commit message; wait for OKOK.

---

## Phase 4: Setup moves out (empty engine)

### Overview
Delete the internal bridge table and legacy option fields; export the
Wikipedia rule sets next to `ingestWikipediaDocument`; `ingestDOM`
without rules handles only text/reserved emissions and catch-alls.

### Changes Required

**File**: `lib/js/wikipedia/ingest_next.ts`

1. Delete `DEFAULT_RULES`, `KNOWN_BLOCK_TAGS`, `KNOWN_MARK_TAGS`,
   `INLINE_TAGS`, `FALLBACK_INLINE_CONTENT_NODES`, `MW_EMPTY_ELT`,
   `MW_META`, `SELECTORS_TO_RAW_HTML`, and the legacy option fields
   `markEmission`, `nodeEmission`, `transparentContainers` (single
   consumer `main.mjs` uses `ingestWikipediaDocument`; the test file is
   updated in step 3).
2. Define exported rule-set constants adjacent to
   `ingestWikipediaDocument` (Q5: default table lives with the setup),
   composed in its options — suggested grouping, final naming at
   implementation time (naming is hard; operator review at the STOP):
   - `WIKIPEDIA_RAW_RULES` (mw-empty-elt, meta)
   - `WIKIPEDIA_ATOM_RULES` (cite-link w/ `context: "inline"`,
     figcontent)
   - `WIKIPEDIA_BLOCK_RULES` (section, p, h1-h6, ul, ul>li split-item,
     figure, figcaption; `inlineContent` flags)
   - `WIKIPEDIA_MARK_RULES` (b,strong → mark strong; i,em → generic
     italic; a → generic link fallback under schema derivation)
   - `HTML_PHRASING_RULES` (br void + the inline-node tag list — generic
     HTML, not Wikipedia-specific, hence the distinct name)
   `ingestWikipediaDocument` = `ingestDOM(dom, {proseMirrorSchema,
   emissionRules: [...raw, ...atoms, ...blocks, ...marks, ...phrasing],
   attrPolicy, logger: console, liftedRunWrapper: "paragraph"})` — the
   complete setup readable in one place.
3. `liftedRunWrapper` option (Q6) replaces the hardcoded `"paragraph"`
   at `:591`/`:647` (still wrap-per-text-node semantics until Phase 5;
   default `"paragraph"`).

**File**: `lib/js/wikipedia/ingest_next.test.mjs`
4. Update describe #1 and other default-dependent tests (research §9
   list) to pass explicit rule tables — import the exported rule-set
   constants where the Wikipedia set is meant, or minimal inline tables
   where a test pins one mechanism. Tests asserting "no rules" behavior
   (everything → catch-alls) added: empty-engine contract.
5. Legacy-option tests (`transparentContainers`, `markEmission`,
   `nodeEmission` describes) rewritten as `emissionRules` equivalents —
   same behaviors, new spelling.

### Success Criteria

#### Automated Verification:
- [x] `npx vitest run` full suite green (113/113, wikipedia file 64);
      typecheck no new errors; lint clean
- [x] `grep -n "KNOWN_BLOCK_TAGS\|KNOWN_MARK_TAGS\|INLINE_TAGS\|SELECTORS_TO_RAW_HTML\|FALLBACK_INLINE" lib/js/wikipedia/ingest_next.ts` → empty
      (also: markEmission/nodeEmission/transparentContainers gone)

#### Manual Verification:
- [x] Demo smoke test / operator review (OKOK 2026-08-03, commit
      3af723ef)
- [x] Operator signs off rule-set constant names (OKOK 2026-08-03)

STOP: present diffstat + commit message; wait for OKOK.

---

## Phase 5: Scoped run-lifting replaces prune (behavior change)

### Overview
Block containers lift inline runs into wrapper paragraphs; unresolved
elements keep the loud raw_html_block catch-all. Supersedes the
2026-07-24 prune decision (operator, 2026-08-03: lift-only, no mode
option). `emitSplitItem`'s run classification unifies with the same rule.

### Changes Required

**File**: `lib/js/wikipedia/ingest_next.ts`

1. Run membership (positive test): a child joins an inline run iff it is
   a text node OR `resolveEmission(ctx, el, "inline")` returns a fitting
   rule (mark/generic/inline-node/void/atom/raw/transparent/skip).
   Unresolved elements break the run and fall to the block catch-all
   (raw_html_block + `catchAllBlocks` + logger) — discovery guarantee.
2. Generalize `flushRun` (today `:589-605` inside ingestListItem) into
   the block-content filler: wherever block-only content is ingested
   (doc root, non-textblock `block` rules, split-item block arm),
   consecutive run members are ingested in INLINE context and lifted into
   one `liftedRunWrapper` draft per run; whitespace-only runs vanish
   (existing flushRun length guard + skipped-empty-text handling).
3. Delete the stray-text-wrap special case in the text branch
   (`:643-651`) — subsumed by run membership (text nodes join runs).
4. Report: add `liftedRuns` (count per flushed run; Q7 decision: "tells
   us a lot about the shape of the source"); DELETE `wrappedStrayTexts`
   (subsumed). `logReport` updated.
5. `emitSplitItem` drops its own run machinery and block-child test in
   favor of the generalized mechanism: li becomes li-block iff any child
   resolves block-only or fails to resolve; run lifting inside li-block
   is the same code path.

Consequences (intended behavior changes, each with a test):
- `<section>Hello <b>W</b>!<br>x<p>p</p></section>` → ONE
  `paragraph["Hello ", "W"+strongOrBold, "!", hard_break, "x"]` +
  `paragraph["p"]` (was: 3 wrap-paragraphs + 2 raw_html_block).
- `catchAllBlocks` no longer counts inline-resolving tags (B, BR, SPAN
  entries disappear); still counts DIV, TABLE, unknowns.
- Inline atom in block context (stray cite-link) joins a run → valid
  inline position (Q4 healed).
- li edge case from Phase 1: `<li>text<table>` now → li-block with
  `paragraph["text"]` + `raw_html_block(table)` (was li-inline with
  raw_html_inline) — flip the Phase-1 pinned test as planned.

**File**: `lib/js/wikipedia/ingest_next.test.mjs`

6. Update the affected pinned tests, each flagged in Phase 1 or listed
   above: section blocks-only test (`:141-172` reshaped), stray-text
   wrap assertions (`wrappedStrayTexts` gone), the li table edge, plus
   new lift tests: run boundaries around blocks; marks preserved across
   a lifted run; whitespace-only run produces no wrapper; `liftedRuns`
   counts; unresolved element inside a run breaks it into
   before/raw/after.

### Success Criteria

#### Automated Verification:
- [x] `npx vitest run` full suite green (119/119, wikipedia file 70);
      typecheck no new errors; lint clean; wrappedStrayTexts gone

#### Manual Verification:
- [x] Phase reviewed, OKOK 2026-08-03 (commit d1c8f502). Demo smoke
      test confirmed by operator later the same day ("demo looks
      OK").

STOP: present diffstat + commit message; wait for OKOK.

---

## COMPLETED 2026-08-03

All five phases implemented and committed on demo/wikipedia:
4e2e8614 (P1 tests), 06480a88 (P2 DRY), c7938cc4 (P3 rules bridge),
3af723ef (P4 empty engine), d1c8f502 (P5 run-lifting).
119/119 tests green; only pre-existing main.ts TS2305 remains (its
fix is deferred with the ingest.ts/main.ts deletion, see "What We're
NOT Doing").

---

## Testing Strategy

### Unit tests (per phase, in `ingest_next.test.mjs`)
- Phase 1: ul/li pinning (the refactor's safety net) + helper cleanup.
- Phase 3: mechanism tests (rule precedence, context fit, skip kind,
  inline-atom-in-block no-crash) with existing tests unmodified as the
  behavior-identity proof.
- Phase 4: empty-engine contract; rewritten option-spelling tests;
  Wikipedia rule-set constants exercised via ingestWikipediaDocument
  end-to-end tests (unchanged assertions).
- Phase 5: lift semantics (run boundaries, mark preservation, counters,
  discovery guarantee).

### Integration
- Existing end-to-end describes (cite-link, figcontent, figcaption,
  editable attr replay against the state JSON) run unmodified through
  Phases 1-4; Phase-5 impact reviewed per test.
- Manual demo smoke test at Phases 4 and 5 (real Parsoid article).

### Regression guards
- Full `npx vitest run` (not just the wikipedia file) each phase —
  prosemirror integration tests share the metamodel.
- `npm run typecheck` may only show the pre-existing `main.ts` TS2305.

## Rollback

Each phase is one commit; revert restores the previous green state.
Phases 1-3 are pure refactors (safe to revert independently); Phase 5
reverts to prune semantics if the demo surfaces problems (re-flip the
Phase-5 test changes).

## References

- Research: `thoughts/research/2026-08-03-1657-wikipedia-ingest-next-structure.md`
- Engine: `lib/js/wikipedia/ingest_next.ts` (git db9f09f7)
- Tests: `lib/js/wikipedia/ingest_next.test.mjs`
- Contract: `lib/js/components/prosemirror/default-schema.ts`,
  `html-attrs.ts`, `integration.typeroof.jsx`
- State: `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`
- UI: `lib/js/wikipedia/main.mjs:119-143`
