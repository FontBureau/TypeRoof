---
eleventyNavigation:
  key: "Performance: Viewer Update Propagation"
  parent: Planning
  title: 'Perf: Viewer Update Propagation'
  order: 46
agent-created: true
---

# Performance Investigation: `UIDocumentViewer` Update Propagation

> **Status:** Done (stages 1+2 landed). Written 2026-08-20, after the
> fixes were implemented and confirmed in the browser by the operator
> ("feels much better, more snappy now"). Remaining follow-up: central
> CSS per typeSpec/stylePatch path (see "Remaining work").

## Problem statement

In the type-stage "viewer" renderer (`UIDocumentViewer`,
`lib/js/components/layouts/type-stage/viewer.typeroof.jsx`), updates
that touch the origin typeSpec — e.g. changing its `backgroundColor` —
were visibly slow with big documents (the Wikipedia "Typography" page).
The ProseMirror renderer was fine. Disabling the creation of
`UIDocumentTypeSpecStyler` and `UIDocumentStyleStyler` did *not* fix it,
so the suspicion fell on the update propagation machinery itself
(`lib/js/components/basics/component.mjs`, `static updateWidget` of
`_CommonContainerComponent`).

## Method: a reproducible headless harness

Since the bottleneck is CPU-side propagation logic (not layout), a
jsdom-based benchmark suffices for attribution. The harness lives in the
(untracked) files:

- `lib/js/wikipedia/viewer-perf-lib.mjs`
- `lib/js/wikipedia/viewer-perf.test.mjs`
- `downloads/typography.html` — the real Wikipedia "Typography" article
  (`curl "https://en.wikipedia.org/w/rest.php/v1/page/Typography/html"`)

It boots a **real `UIDocumentViewer` subtree** over the real article
(ingested via `lib/js/wikipedia/ingest`), with faithful stand-ins for
the app-level plumbing: a minimal wrapper model providing
`/activeState`, `/font`, `/installedFonts`; `typeSpecProperties@` /
`styleLinkProperties@` protocol handlers fed with real
`HierarchicalScopeTypeSpecnion`s (mirroring `TypeSpecLiveProperties` /
`StyleLinkLiveProperties`, including the `setUpdated` marking an origin
typeSpec change produces); instrumentation via prototype monkey-patches;
optional CPU profile (`VIEWER_PERF_PROFILE=1`, writes
`downloads/*.cpuprofile`).

Run:

```shell
npx vitest run lib/js/wikipedia/viewer-perf.test.mjs
VIEWER_PERF_PROFILE=1 npx vitest run lib/js/wikipedia/viewer-perf.test.mjs
```

Document stats of the benchmark scene: **785 elements, 1094 text runs,
455 marks, maxDepth 10**.

Caveats: jsdom has no layout/style-recalc, so the DOM-write share of
stylers is understated; the TypeSpec-properties UI tree is not part of
the harness, so real app updates are somewhat slower than the numbers
below. Relative attribution holds.

## Findings

Per-update wall time (`root.update(compareResult)`, median of 5) for an
origin-typeSpec `backgroundColor` change, at baseline:

- stylers enabled: **865–872 ms**
- stylers disabled (operator's test): **470–487 ms**
- `metamorphose` and `StateComparison` construction: **< 1 ms** —
  the model layer was never the problem.

Attribution (instrumentation + `node:inspector` CPU profile):

1. **The `Path` machinery was the single biggest cost** (~470 ms of the
   ~870 ms stylers-on update): `Path` constructor, `sanitize`,
   `fromString`, `slice`, `toString`. Paths are re-parsed from strings
   constantly — `getExternalName`, `getEntry`,
   `_getBestTypeSpecPropertiesId`, dependency resolution.
2. **Per-node provisioning recomputes near-constant data.** Notably
   `UIDocumentElement._getPathOfTypes` walked the whole ancestor chain
   with one `getEntry` (a root-to-node walk) per level — O(depth²) path
   operations per node per update — once per text run and twice per
   element (self + next sibling). Its only consumer,
   `getTypeSpecPropertiesIdMethod`, uses just `pathOfTypes.at(-1)`.
   This also explains why disabling the stylers did not help: the
   expensive path resolution in `_provisionTypeSpecStyler` runs
   regardless of styler creation.
3. **The traversal is unconditional.** `UPDATE_STRATEGY_COMPARE`
   containers recurse into every widget on every change, whether or not
   anything in the subtree could be affected.
4. Dead end (kept for the record): per-update memoization of
   `_getPathOfTypes` / `_getEffectiveStyleLinks` gained ~2 % — each
   node's full path is unique, so full-path memos never hit, and
   style-link resolution was already cheap.

## Fixes landed

All on branch `demo/wikipedia`:

| commit | change | effect (median update) |
|---|---|---|
| `959ca92e` | `[metamodel/path]` intern `Path.fromString` results (immutable + pure ⇒ safe; bounded at 10k entries, clear-and-restart eviction) | stylers-on 865→~570 ms, stylers-off 487→~240 ms; initial render −28…−42 % |
| `343df6e1` | `[type-stage/viewer]` thread `pathOfTypes` down via the `context` object, drop `_getPathOfTypes`. `UIDocumentViewer` seeds it with the doc root typeKey; each `UIDocumentElement` appends its own typeKey for children. Correct because `UIDocumentNode` rebuilds its subtree on any typeKey change. | stylers-on →~350 ms, stylers-off →~122 ms |
| `c267d88f` | `[prosemirror/integration]` memoize `getTypeSpecPropertiesIdMethod`, keyed by the immutable `nodeSpecToTypeSpec` model + joined typeKeys + lazy per-component origin path; cached Path re-validated with `hasRegistered` per hit | below measurement noise in this doc; kept (regression-free, wins on deep typeSpec trees) |
| `92d9e3db` | `[basics/components]` **pruning stage 1**: skip provably-unaffected widgets in `_update` (see below) | stylers-on →~325 ms, stylers-off →~30 ms |
| `cbd5990e` | `[basics/components]` **pruning stage 2**: skip `_provisionWidgets` of unaffected subtrees (see below) | stylers-on →**~223 ms**, stylers-off →**~30 ms** |

Cumulative: **−74 % stylers-on, −94 % stylers-off**; initial render
2378 ms → ~1100 ms (stylers-on). Confirmed snappy in the browser.

## The pruning design (stages 1+2)

Both stages live in `lib/js/components/basics/component.mjs` and are
generic (not viewer-specific).

**Relevance report** per `ComponentWrapper`, memoized per
`compareResult` (WeakMap, so once per update, not per container):

- `updateRelevant` — a model dep intersects the changed paths, or a
  *registered* protocol dep is marked updated, or (containers) any
  descendant is relevant.
- `modelRelevant` — model deps only.
- `membershipOk` — all mapped protocol ids are still registered.

**Changed-path indexing** (`_getUpdateRelevanceContext`): exclude
`EQUALS` entries and proper ancestors of other changed paths.
`rawCompare` yields `CHANGED` for *every ancestor* of a change (down to
the root) — indexing those would match every dependency. Intersection
matches in both directions: dep under a changed root (descendant
changed), or a changed root under the dep (e.g. a `collection` dep whose
parent path contains the change — the container must provision). Both
reduce to Set lookups over a prefix set.

**Stage 1** (`_update`): irrelevant widgets are skipped entirely — they
provably can not be affected. Because the descendant scan is aggregated
and memoized, a fully-unaffected subtree is pruned in a single check at
its root wrapper.

**Stage 2** (`update`): `_provisionWidgets` is skipped when no
descendant is model-relevant **and** all mapped protocol ids are still
registered. The two events provisioning must react to are both covered:
structural changes are visible via model deps; registry changes (e.g. a
typeSpec rename) surface as unregistered mapped ids → membership
violation → provisioning runs → stale mappings self-heal by
re-resolution before any consumer's `getUpdated` could throw. In
`_update`, containers with a membership violation are updated (to
provision); simple widgets with stale ids are skipped (they are
re-created by the parent's provisioning).

Why protocol deps must be first-class: the viewer's stylers depend on
`typeSpecProperties@` / `styleLinkProperties@` via
`SimpleProtocolHandler` updated-logs, *outside* the compareResult — that
is also why the original design updated unconditionally.

Escape hatch: `_CommonContainerComponent.UPDATE_RELEVANCE_FILTER = false`.

**Semantic caveat:** widgets that call `getEntry` in `update()` for
names they did not *declare* as dependencies were previously kept fresh
by unconditional updates; pruning can not protect that pattern. The
viewer's declarations were verified complete (harness correctness test
asserts the rendered structure and that the background-color change
actually propagates). If a regression surfaces in a less-disciplined
layout, flip the escape hatch.

## Postscript: the caveat bit, twice

The caveat above was not hypothetical. After cleanup of the performance
harness, manual testing in the type-stage editor showed that
**Show Parameters** (`showParameters`) and **Show Element Labels**
(`showNodeTypeSpecLabels`) no longer appeared when toggled — only a
viewer↔editor round trip (unrelated full provisioning) brought them up.
A new regression harness at `lib/js/tests/type-stage-toggles/` boots
the real `TypeStageController` (viewer default, as in the wikipedia
app), switches to the editor and flips the toggles; it reproduced the
bug exactly, including the workaround behavior. Root causes, one per
stage:

- **Labels — stage 1.** The `NodeTypeSpecLabel` widgets'
  `activationTest` reads `showNodeTypeSpecLabels` (via the
  `typeSpecLabels` option) but no dependency mapping declared it, so
  the relevance scan pruned the outfitter subtree and provisioning
  never re-ran. The `has-node-labels` class *was* set
  (`UpdateLabelListener` declares the dep) — just with no label
  elements to unhide. Fixed by declaring the dependency
  (`50ba406a`).
- **Parameters — stage 2.** The outfitter widgets *do* declare
  `showParameters`, so stage 1 keeps them relevant — but the outfitters
  are created **dynamically per document node** by
  `TypeSpecSubscriptions`, so their dependencies never enter the
  statically computed aggregate stage 2 caches. Toggling
  `showParameters` proved the subtree unaffected, and provisioning was
  skipped. Stage 2 stays reverted (`7ad6f363`); re-applying it still
  fails the regression harness, this time already at the labels
  assertion.

The structural fix for this class of bug: `ComponentWrapper` now
injects a **dependency-enforcing `getEntry`** into every
`activationTest` (`f2acb725`). It behaves like the widget's
`widgetBus.getEntry` but throws — pointing at the missing
`dependencyMappings` entry — when the test reads state the widget did
not declare. All activationTests were converted to use it and to
declare what they read, so this regression class now fails loudly
instead of silently skipping provisioning.

**If stage 2 is re-attempted**, the cache must account for containers
whose children are provisioned dynamically in `update()` (not only in
the constructor): either update/invalidate the aggregate when
provisioning creates new wrappers, or — simpler and probably right —
mark such containers as non-cacheable. `lib/js/tests/type-stage-toggles/`
is the gate; it catches any wrong version immediately.

## Remaining work

- **Central CSS per typeSpec-path / stylePatch-path** (operator's
  item 1): the remaining stylers-on time (~223 ms) is almost entirely
  real styler DOM work — per-element/per-mark CSS writes in
  `UIDocumentTypeSpecStyler.update` / `UIDocumentStyleStyler.update`
  (in the browser additionally style-recalc/layout). With centralized
  styles those styler widgets largely disappear, and the pruning
  machinery then reduces a typeSpec change to near-zero propagation
  work. This is the natural next step.
- The `getEntry` / `getExternalName` name-resolution per wrapper call
  (~37 ms in the final profile) could be cached per wrapper, as
  dependency mappings are stable between provisionings.
- Verify numbers in a real browser when touching the DOM-write side
  (jsdom understates it).

## Reproduction / regression check

The harness doubles as a regression benchmark (skips gracefully when
`downloads/typography.html` is missing). It contains three tests:

1. `benchmarks origin typeSpec background-color updates` — five
   scenarios (stylers on/off, with/without caches/interning), medians
   over 5 updates plus per-method instrumentation.
2. `renders and propagates updates correctly` — guards the context
   `pathOfTypes` change: structure complete, update propagates.
3. `CPU-profiles a single stylers-enabled update` — opt-in via
   `VIEWER_PERF_PROFILE=1`.
