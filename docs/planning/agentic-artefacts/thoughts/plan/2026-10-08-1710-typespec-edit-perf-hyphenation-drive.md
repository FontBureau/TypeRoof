---
date: 2026-10-08T17:10:00+02:00
git_commit: 67f3ce9f6e48feca879cb2ff137d11ac3e168d5a
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Type-spec edit performance: memoized hyphenation language walk + composition-drive dedupe/gate"
tags: [plan, performance, type-stage, text-composition, hyphenation]
status: complete
research: docs/planning/agentic-artefacts/thoughts/research/2026-10-08-1550-wght-axis-drag-perf-regression.md
---

# Type-spec edit performance: memoized hyphenation walk + composition-drive dedupe/gate

## Overview

Neutralize the per-tick cost that typeSpec edits (repro: enable + drag
`wght` on the origin typeSpec, editor mode, "Compose Text in Editor"
OFF) pay on this branch vs `fontbureau/main`. Verified in the research
doc: the composition pipeline is COLD in the repro (zero demand), so
the lag comes from unconditional per-tick overheads. This plan removes
the two biggest ones with small, independent diffs:

1. the full recursive hyphenation language walk running on every
   typeSpec draft (`requireHyphenationPatternsCoherenceFn`), and
2. the DocumentNodesMeta `_driveComposition` double-fire +
   discarded-source-build overhead.

## Current State Analysis

- `requireHyphenationPatternsCoherenceFn`
  (`lib/js/components/layouts/type-stage/index.typeroof.jsx:243-284`,
  shared with ramp via import at
  `lib/js/components/layouts/ramp/index.typeroof.jsx:57,111`) runs on
  every root metamorphose where `typeSpec` or `stylePatchesSource` is
  a draft (the 55bf4954 early-return only skips document-only edits).
  Every wght tick is a typeSpec draft → full recursive walk
  (`walkEffectiveTypeSpecLanguageParts` :196-206,
  `walkStylePatchLanguages` :215-241) with per-node allocations,
  `Set`/`Set` builds, and `languageToHyphenationPatternKey` mapping —
  result identical every tick because languages don't change.
  Operator-verified: early-returning unconditionally is a big
  improvement.
- `_driveComposition`
  (`lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:830-845`)
  fires twice per textblock per style-change cycle (scope-settled
  callback :809-815 + element `update` :862-871 — "composes twice,
  acceptable" :796-797), and each firing builds a
  `_compositionSource()` (:817-828: `getEntry(".")` root-depth walk +
  `_styleResolutionContext()` path building) that is **discarded** when
  the controller has no demand (the repro case: zero demand).
- Steady state is sync-first (`shell.mjs:1628-1666`); the async
  double-pass is boot/font-review only (corrected in research doc).

## Desired End State

- wght enable + drag feels like main (operator feel-check).
- Hyphenation requirements are still derived correctly: full language
  set every pass (async-window priming semantics preserved, see Key
  Discoveries), runtime language switch still loads patterns
  (3731d2de behavior), all existing hyphenation/composition tests
  pass unmodified.
- Composition drive fires at most once per textblock per cycle, and
  costs ~nothing when the controller has no demand.

### Key Discoveries

- The async resolution window primes `installedHyphenationPatterns`
  EMPTY (`shell.mjs:1487-1490`) so the coherence re-yields the
  **complete** requirement set every async pass; the resolver copies
  into that target container (`shell.mjs:1394-1419`). Any cheap-walk
  design must return the **full set**, never a delta. (The operator's
  discarded working-tree experiment also had a parameter-position bug:
  `isNew` was passed into the walk's `inherited` parameter.)
- The walk's effective parts depend on the **inherited context** (local
  subtags override inherited independently, :193-195): a per-node
  cache must be keyed by (node identity, inherited-context triple,
  children-map identity, local languageTag triple) or an ancestor
  language change would serve stale results.
- Cache-key safety: the metamodel preserves identity of unchanged
  subtrees (deep change ⇒ drafts only along the changed path), so
  unchanged children are WeakMap hits; drafts (transient per
  transaction) simply miss.
- `update`-drive is the ONLY composition channel for content edits
  (text edits don't rebuild scopes — `DocumentNodeProperties.update`
  identity early-return, `index.mjs:644-652`); `_scopeSettled` is the
  channel for style changes. Both must stay; only the same-cycle
  double-fire is waste.
- Ordering guarantee for dedupe: the scope component is `_widgets[0]`,
  so `_scopeSettled` fires inside `super.update()`, before the
  element's own drive at the end of `update`
  (`index.mjs:792-797`, :856-871).
- Late subscriber semantics: `registerSource` must stay unconditional
  ("source and demand may arrive in either order",
  `composition-controller.ts:447-470`); skipping `sourceChanged` when
  undemanded is behavior-identical because the controller gates on
  `_hasDemand` anyway (:385-387, :472-476) and a later `subscribe()`
  re-drives from the live source driver (:478-501).

## What We're NOT Doing

- Moving hyphenation loading UI-side / demand-driven ("Option B" from
  planning) — deferred; Option A (memoized walk) chosen.
- The async-window double metamorphose (boot/font-review only).
- Viewer/compare-mode composition pipeline costs (axesKey invalidation,
  hbFont LRU thrash) — separate cycle when it shows up in feel.
- The engagement-default question (unset algorithm ⇒ GreedyRagged
  fallback, `composition-controller.ts:812-813`).
- The None-gate's per-change `getProperties()` and the editor plugin's
  O(doc) `_syncSubscriptions` walk (ON+None residual costs).
- Committing the operator's working-tree experiment — DISCARD first:
  `git checkout -- lib/js/components/layouts/type-stage/index.typeroof.jsx`.

## Implementation Approach

Small independent phases, each its own commit, each pausing for review
with a proposed commit message (per COLLABORATION.md). Phase order by
expected impact; phases 2–4 are independent of phase 1.

## Phase 0: Clean tree ✅ (done by operator, 2026-10-08)

Discard the operator's experiment:

```bash
git checkout -- lib/js/components/layouts/type-stage/index.typeroof.jsx
```

## Phase 1: Memoized hyphenation language walk ✅ (implemented 2026-10-08; strengthened per operator: complete derivation shortcut)

### Overview (as implemented, final)

Two-level memoization in the new module
`lib/js/components/layouts/type-stage/hyphenation-pattern-languages.mjs`
(the operator's directive: "shortcutting the function completely is
much better" than a merely cheaper walk):

1. **`createTypeSpecLanguageWalker`** — a subtree's effective language
   parts are a pure function of (languageTag content, children
   content, inherited context). A node is **cacheable iff its
   languageTag struct AND its children map are both immutable**
   (`isDraft === false` guarantees unchanged — operator's metamodel
   semantics; unchanged fields keep identity across metamorphoses; a
   changed draft's identity lives on as the new immutable; drafts
   never enter the memo). Crucially, the coherence runs
   mid-metamorphose on a DRAFT root whose child reads return
   **potential write proxies** (per-draft objects — the reason the
   first iteration never hit in production, caught by the operator's
   HIT/NO-hit instrumentation): every access goes through
   `unwrapPotentialWriteProxy`, yielding the carried immutables. Net
   effect: a non-language edit at the root (axis drag) is a **single
   O(1) hit for the whole tree**; deep language/structure edits miss
   exactly along the changed path (the owning tag/map is a draft
   there) — sound invalidation, no stale reads. Verified by the
   operator: "feels a lot better, even with compose in editor on".
2. **`createHyphenationPatternDeriver`** — the complete derivation
   (tag creation, style-patch walk, Set algebra, pattern-key mapping)
   memoized on (parts identity, stylePatchesSource identity): when
   nothing language-relevant changed, the coherence's work collapses
   to the walk hit plus two identity compares. Always returns the
   FULL required-key set (async-window priming semantics); the
   installation state is not part of the memo key — the coherence
   still diffs against `installedHyphenationPatterns` every pass.

`index.typeroof.jsx` keeps the coherence (unchanged signature; ramp
unaffected) and delegates to `deriveRequiredPatternKeys`.

**Metamodel facts established by scratch tests (since removed):** a
draft's untouched fields read as the carried immutables
(`unwrap(draft.get("children")) === prevState.get("children")`, same
for `languageTag`); `s1.children === s0.children` after a
non-children edit; proxies are cached per-draft, never across
transactions.

### Changes (as implemented)

- NEW `hyphenation-pattern-languages.mjs`: `languageTagParts`,
  `partsToLanguageTag`, `walkStylePatchLanguages` (moved unchanged),
  `createTypeSpecLanguageWalker`, `createHyphenationPatternDeriver`.
- MODIFIED `index.typeroof.jsx`: helpers extracted (−76/+14); the
  `languageToHyphenationPatternKey` import moved into the new module.
- NEW `hyphenation-pattern-languages.test.mjs`: equivalence battery
  vs the pre-change recursive walk as oracle (axis-like edits, deep/
  mid-tree language changes, partial subtags, child add/remove,
  language clearing); metamodel identity-preservation property test;
  patch-walk semantics tests; deriver shortcut contract test
  (identity-stable Set across axis-like edits, fresh + cold-equal on
  language edits); **production-conditions test** (deriver called with
  DRAFT roots + proxies across ticks — the case that never hit
  before proxy-unwrapping). 8/8 pass.

### Success Criteria

#### Automated Verification
- [x] New tests pass (8/8, incl. identity-preservation property, deriver shortcut contract, production-like draft/proxy conditions)
- [x] `npx vitest run lib/js/tests/type-stage-toggles lib/js/components/type-spec` + new module — 51/51 pass
- [x] `lib/js/tests/text-composition` — RESOLVED (2026-10-08), 17/17 green. Bisect (operator's challenge — the suite ran green a lot): green through `137945fe`, broken at **`67f3ce9f`** (composeInEditor default-on). The flip activated the editor plugin in the test worlds: demand-lifecycle + payload/DOM assertions (written for flag-off) failed 16/17, and plugin DOM churn woke PM's `checkCSS` (bare `getComputedStyle`, never shimmed in this NODE-env suite) → worker exit 7. Fix: pin `composeInEditor: "0"` (serialized false — `BooleanModel.deserializeFN` maps JS `false` to true; the falseSet is strings) in both `beforeAll` state preparations + add `getComputedStyle` to both JSDOM shim lists.
- [x] `npm run typecheck` clean; eslint/prettier clean on touched files

**Environment note (2026-10-08):** /tmp (16GB tmpfs) was 100% full from **729 leaked vitest temp dirs (~15GB)** — caused ENOENT suite failures; ~14GB freed by agent; 29 dirs (~1GB) have commander-owned files. Vitest leaks its transform-cache temp dirs when workers die — candidate TOOLING.md entry.

#### Manual Verification
- [x] wght enable + drag: noticeably better (operator: "feels a lot better, even with compose in editor on", 2026-10-08)

**Pause for review + proposed commit message after this phase.**

## Phase 2: `_driveComposition` same-cycle dedupe ✅ (implemented 2026-10-08)

### Overview

Eliminate the double drive on style-change cycles (scope settle +
element update). Content-edit channel (`update`) untouched.

### Changes Required

**File**: `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`

- Add instance flag `_scopeDroveComposition = false` (constructor).
- `_scopeSettled()` (:809-815): after `this._driveComposition()`, set
  `this._scopeDroveComposition = true`.
- `update(compareResult)` (:862-871): `super.update()` runs children
  first (scope component is `_widgets[0]`, so a settle this cycle sets
  the flag); then drive only when the flag is false; finally reset the
  flag:

```js
update(compareResult) {
    this._lastNewState = compareResult.newState;
    const result = super.update(compareResult);
    if (!this._scopeDroveComposition) this._driveComposition();
    this._scopeDroveComposition = false;
    return result;
}
```

- `initialUpdate(rootState)` (:874-880): same guard+reset — boot is
  preserved: when the settle callback drives during initial provision
  the explicit post-provision drive is skipped; "already-settled
  sources" (no settle this cycle) still get the drive, per the comment
  at :876-878.

### Success Criteria

#### Automated Verification
- [x] `npx vitest run lib/js/tests/type-stage-toggles lib/js/components/type-spec` + hyphenation module — 51/51 pass
- [ ] ⚠️ `lib/js/tests/text-composition` — still blocked (pre-existing, see Phase 1)
- [x] `npm run typecheck`, `npm run lint`

#### Manual Verification
- [ ] Typing recomposes (content channel intact); style changes
  recompose (viewer mode)

**Pause for review + proposed commit message.**

## Phase 3: Zero-demand cheap gate in `_driveComposition` ✅ (implemented 2026-10-08)

### Overview

With zero demand (editor mode, compose-in-editor OFF — the repro), each
drive currently builds a discarded `_compositionSource()`. Skip the
build when it can't matter.

### Changes Required

**File**: `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`

Reorder `_driveComposition` (:830-845):

```js
_driveComposition() {
    if (!this._isTextblock) return;
    if (this._lastNewState === null) return;
    const scope = this.nodePropertiesComponent;
    if (scope === null || !scope.hasScope) return;
    const service = this.widgetBus.getWidgetById(
        "compositionController",
        null,
    );
    if (service === null) return;
    if (this._compositionSourceUnregister === null) {
        // registration is unconditional: source and demand may
        // arrive in either order
        this._compositionSourceUnregister = service.registerSource(
            this.widgetBus.rootPath,
            this._compositionSourceDriver,
        );
        return;
    }
    // registered: a source change only matters when demanded; the
    // controller re-drives from the live source driver on subscribe
    if (!service.hasDemand(this.widgetBus.rootPath)) return;
    if (this._compositionSource() === null) return; // defensive
    service.sourceChanged(this.widgetBus.rootPath);
}
```

**File**: `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts`

Add a thin public query next to `_hasDemand` (:385-387):

```ts
hasDemand(path: Path | string): boolean {
    return this._hasDemand(this._pathString(path));
}
```

(Verify `_pathString` handles both input kinds the way
`registerSource` does; mirror its conversion.)

Verified: `_compositionSourceDriver` is fully lazy
(`() => this._compositionSource()`, `index.mjs:779`) — the controller
re-fetches the current source when it drives (on `subscribe` after
demand arrives), so skipping undemanded `sourceChanged` notifications
loses nothing.

### Success Criteria

#### Automated Verification
- [x] `npx vitest run lib/js/tests/type-stage-toggles lib/js/components/type-spec` + hyphenation module — 51/51 pass
- [ ] ⚠️ Composition suite (`text-composition`, incl. "editor-only drops every composition result and viewer demand restores it") — still blocked (pre-existing, see Phase 1); manual verification covers the demand lifecycle instead
- [x] `npm run typecheck`, `npm run lint`

As implemented, one improvement beyond the plan sketch: the demanded
path drops the discarded null-check build too — the controller invokes
the lazy driver itself when composing (the source was previously built
twice per demanded drive).

#### Manual Verification
- [ ] Viewer/compare composition still engages on mode switch; typing
  recomposes

**Pause for review + proposed commit message.**

## Phase 4: Verification probe (puppeteer harness) ✅ (2026-10-08)

### Overview

Make the improvement visible with the allowed debugging harness
(NOT the perf suite).

### As implemented

New probe `scripts/puppeteer-probes/perf-axis-drag.mjs` (runner:
`scripts/debug-with-puppeteer.mjs`): boots the default type-stage,
pins the repro configuration (editor mode; `composeInEditor` false,
guarded for pre-flag revisions), then performs 24 `wght` ticks via
`shell.changeState` (`axesLocations.setSimpleValue`), each measured
as wall time from the change call through two rAFs (changeState's
promise resolves before `_updateState`; the root update is
rAF-driven). Prints a machine-readable `RESULT` line.

### Results (2026-10-08, same machine, chrome headless)

| Revision | enable wght | median/tick | p95 | max |
|---|---|---|---|---|
| `fontbureau/main` (target) | 265.1ms | 70.1ms | 156.3ms | 227.8ms |
| `67f3ce9f` (branch, pre-fix) | 767.5ms | 935.9ms | 1156.5ms | 1213.9ms |
| HEAD (Phases 1–3) | 81.2ms | 42.0ms | 58.3ms | 67.0ms |

**~22× faster than pre-fix; ~1.7× better than main on the median
(~2.7× on p95).** Regression neutralized with margin.

### Success Criteria

#### Automated Verification
- [x] Probe exits 0 and prints a latency table (RESULT line)

#### Manual Verification
- [x] Operator feel-check: wght enable + drag ≈ main ("feels a lot
  better, even with compose in editor on", after Phase 1; Phases 2–3
  verified working)
- [x] Numbers recorded into this plan (before/after, above)

## Testing Strategy

- **Behavior-level** where behavior exists: hyphenation requirement
  derivation (existing suites), runtime language switch (3731d2de),
  composition publications/demand lifecycle (Cycle-1 tests).
- **Structural counters** only where the win is behavior-invisible
  (drive-call counts) — Cycle-1 zero-work test precedent.
- Equivalence battery for the memoized walker (phase 1) asserts
  output equality with the reference walk, never cache internals.
