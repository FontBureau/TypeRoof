---
date: 2026-10-06T22:52:33+02:00
git_commit: 5a47cc6667bb00035b919e0241d809b9e490241b
git_base: 90f02e62eefa0c36204c6460b8f334446fecf96e (fontbureau/main)
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Type-stage main-loop performance regression with inactive text-composition viewer"
tags: [research, codebase, performance, type-stage, text-composition, metamodel]
status: complete
---

# Research: Type-stage main-loop performance regression (viewer inactive)

## Research Question

The branch (base fontbureau/main) introduced a noticeable slowdown of the
type-stage main loop "change → metamorphose the model → update UI", even on
simple stat changes and even when the viewer with the new text-composition
feature is inactive (editor only). Prior work had some effect but did not
tackle the root cause. Find the root cause by analysis (the perf suite in
scripts/perf-composition is out of scope). The meta tree was suspected.

## Summary

The composition *algorithms* (measure, segment, break) are properly
demand-gated and do not run without a viewer subscriber. The regression
comes from **unconditional per-change work** added on this branch in three
layers, all active regardless of viewer state:

1. **`requireHyphenationPatternsCoherenceFn`** — a new generator coherence
   on the TypeStage *root* model. The metamodel runs **all** coherence
   functions of a struct on **every** metamorphose where anything changed
   (no per-coherence dependency gating). So every change that bubbles to
   the root — including a single numeric/stat change — triggers a full
   recursive walk of the TypeSpec tree plus a full iteration over all
   style patches, with per-node object allocations and language-tag
   construction. This runs **twice per change cycle** (async requirement
   window + final sync re-metamorphose). This is the prime suspect for the
   "metamorphose the model" phase.

2. **DocumentNodesMeta composition drive** — the (pre-existing,
   always-active) meta tree gained +149 lines: every
   `DocumentNodesMetaElement.update`/`initialUpdate` **and** every scope
   (re)build (`scopeSettledCallback`) calls `_driveComposition()`, which
   per textblock allocates a fresh `_compositionSource()` object
   (`getEntry(".")` model lookup + `typeSpecProperties@` path resolution)
   and calls `registerSource`/`sourceChanged` on the always-active
   `CompositionController`. Scope rebuilds happen on style/stat changes,
   so this fires per textblock per stat change — the "update UI" phase.
   Matches the "meta tree" suspicion.

3. **Structural model enlargement** — `TypeSpecModel` and
   `StylePatchTypeModel` each gained a `textCompositionAlgorithm` dynamic
   struct and a `hyphenation` struct field. Every TypeSpec node and every
   style patch now instantiates/compares/locks two extra sub-models on
   every metamorphose that reaches it; dynamic structs are among the most
   expensive model kinds. Additionally `textCompositionGen` and
   `hyphenationGen` run on every typeSpecnion scope (re)build of every
   TypeSpec node.

Secondary: the shell primes an `installedHyphenationPatterns` dependency
draft in every async metamorphose, and `_initState` now passes
`likeADraft.getDraft()` so root coherences also execute inside the async
window (in addition to the sync pass).

## Detailed Findings

### 1. Metamodel: coherences are unconditional (pre-existing mechanism, newly expensive)

- `lib/js/metamodel/struct-model.ts:724` `#_metamorphoseGen` — the only
  shortcut is all-or-nothing: return `OLD_STATE` iff no external
  dependency changed AND no local value changed (`struct-model.ts:782-790`).
  Any deep change creates a draft child → full init-order pass.
- `struct-model.ts:799-806` — the init-order loop hits the coherence branch
  (`:875-957`) for **every** registered coherence function every time;
  `changedDependencyNames` is used only for locking, never to skip a
  coherence. The file itself warns: "All the following runs, to change deep
  down a single axis location value" (`:744-748`).

### 2. Root suspect: `requireHyphenationPatternsCoherenceFn`

- `lib/js/components/layouts/type-stage/index.typeroof.jsx:235-275`,
  registered on the TypeStage model in
  `createTypeStageModelVariantWithDefaults` (`index.typeroof.jsx:341`).
  Dependencies: `initTypeSpec`, `typeSpec`, `stylePatchesSource`,
  `installedHyphenationPatterns`.
- Per run (i.e. per root metamorphose):
  - `walkEffectiveTypeSpecLanguageParts` (`index.typeroof.jsx:194-204`):
    recursive walk of the **entire TypeSpec tree**; per node
    `get("languageTag")`, `get("children")`, an `Object.fromEntries`
    allocation, array materialization via spread.
  - `walkStylePatchLanguages` (`:211-232`): iterates **all style patches**;
    per Simple patch `get("stylePatchTypeKey")`, `get("instance")`,
    `instance.wrapped.get("languageTag")`; partial tags are combined with
    every TypeSpec tag; `createLanguageTag`/`partsToLanguageTag`
    (`createLanguageTag` imported from `language-tags.typeroof.jsx`).
  - `Set`/`Set` allocations, `languageToHyphenationPatternKey` per language
    (`text-composition/hyphenator.ts`).
  - Yields `HyphenationPatternRequirement` (`main-model.mjs:29-35`) only
    for missing patterns — steady state yields nothing, but the walk runs
    regardless.
- **Runs twice per change cycle**: `shell.mjs:1556-1563`
  (`_asyncMetamorphoseState` primes an `installedHyphenationPatterns` draft
  every cycle) and `shell.mjs:942-952` (`_initState` now passes
  `likeADraft.getDraft()` explicitly so coherences fire inside the async
  window) + the final `_syncMetamorphoseState` pass (`shell.mjs:1582`).
- Note: on a *draft*, `get(...)` returns potential write proxies — extra
  allocation churn in the walk (cf. the proxy-cache change in
  `struct-model.ts:1447-1463`).
- Completely independent of viewer state and of whether text composition is
  engaged anywhere; on main this coherence did not exist.

### 3. Meta tree: per-update composition drive (viewer-independent)

`DocumentNodesMeta` itself is pre-existing and always-active (registered
with no zone/activationTest, must update before renderers,
`index.typeroof.jsx:698-709`). Branch additions
(`document-nodes-meta/index.mjs`, +149):

- `DocumentNodesMetaElement.update` (:858-871) and `initialUpdate`
  (:874-880): call `_driveComposition()` on every cascade.
- `_scopeSettled()` (:809-815): invoked via the new `scopeSettledCallback`
  after every `DocumentNodeProperties` scope (re)build (:633-714, callback
  fired at :707-713) — i.e. on style/stat changes that rebuild scopes —
  calls `_driveComposition()` again ("composes twice — acceptable",
  :788-797).
- `_driveComposition` (:830-844) → `_compositionSource()` (:817-828):
  allocates a fresh object per call: `this.getEntry(".")` (model entry
  lookup), scope payload, `_styleResolutionContext()` (:848-861) which runs
  `_getTypeSpecPropertiesId(plan.pathOfTypes, true)` path building. Then
  `getWidgetById("compositionController")` +
  `service.registerSource(...)` once / `service.sourceChanged(rootPath)`
  per update. Called twice per drive (guard + register driver re-invokes).
- `CompositionController` (`text-composition/composition-controller.ts`,
  always-active, `UPDATE_STRATEGY_NO_UPDATE`, wired
  `index.typeroof.jsx:681-696`): actual composition is demand-gated —
  `_composeCurrent` (:412) returns on `!_hasDemand(path)`; subscribers only
  exist with a viewer (`viewer.typeroof.jsx:322-337, 652-662`). But
  `registerSource` (:442-468) keeps per-source bookkeeping and invokes the
  driver once; `sourceChanged` (:472-474) is map traffic. No
  measure/segment/break runs without demand — confirmed.
- Structural update path: `_renderingPlan` re-derivation
  (`resolveElementRenderingPlan`) per element structural update existed on
  main; the branch adds `_context` recompute + attachment refresh loop
  (no-op without attachments).

### 4. Structural model enlargement (per-metamorphose constant factor)

- `type-spec/models.mjs:497-501`: `TypeSpecModel` gains
  `["textCompositionAlgorithm", TextCompositionAlgorithmModel]` (dynamic
  struct) and `["hyphenation", HyphenationModel]`. `StylePatchTypeModel`
  gains the same two fields (same diff area, :481-501 context around
  `excludeFromFallback`/`noStyler`... the style-patch struct fields at
  :488-500). Every node/patch metamorphose now touches two extra
  sub-models; the empty dynamic struct is why the `hasWrapped` guards in
  `dynamic-struct-model.ts:241-255, 329-336` were needed.
- `type-spec/text-composition-models.mjs` (new, 249 lines): the KP variant
  alone has ~11 OrEmpty fields.
- `registered-properties.mjs:416-431`: two new registered generic
  properties (`hyphenation`, `textCompositionAlgorithm`) extend the PPS
  processing map.
- `properties-generators.mjs:48-120`: `textCompositionGen` +
  `hyphenationGen` added to `TYPE_SPEC_PROPERTIES_GENERATORS` (:661-662) —
  run on every typeSpecnion scope (re)build of every TypeSpec node.
- `defaults.mjs:213-239`: two new deserialize branches in
  `getTypeSpecDefaultsMap` — one-time per controller construction
  (`index.typeroof.jsx:470`), not per update.

### 5. Prior mitigation work (had some effect, not root)

- `struct-model.ts:1447-1463`: proxy-cache validity fix ("Preserve live
  proxies, but not a cached read of the old child") — correctness fix for
  partial metamorphosis around ResourceRequirement suspension.
- `dynamic-struct-model.ts` `hasWrapped` guards — crash fix for empty
  (inherit) dynamic structs.
- `21a57d0b`/`d9e9fdb2` cooperative composition tasks + atomic viewer
  snapshots — target *active* composition scheduling, not the
  viewer-inactive path.

## What "should behave like main" implies

With the viewer inactive and text composition not engaged anywhere, the
branch still pays: (2) full language walk ×2 per root change, (3)
per-textblock source-building on every element update/scope settle, (4)
enlarged per-node/patch metamorphose constant factor. None of these is
gated on composition engagement or viewer presence.

## Code References

- `lib/js/components/layouts/type-stage/index.typeroof.jsx:235-275` — requireHyphenationPatternsCoherenceFn (root coherence, suspect #1)
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:194-232` — language walks
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:341` — coherence registration
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:809-874` — composition drive (suspect #2)
- `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts:412-474` — demand gate (verified OK)
- `lib/js/metamodel/struct-model.ts:782-806,875-957` — unconditional coherence execution
- `lib/js/components/type-spec/models.mjs:481-501` — new TypeSpec/StylePatch fields
- `lib/js/shell.mjs:942-952,1556-1563,1387-1431` — async-window coherence run + pattern resolver
- `lib/js/components/layouts/type-stage/properties-generators.mjs:48-120,661-662` — new per-scope generators

## Open Questions

- Relative weight of suspects #1 vs #2 vs #3 is not measured (no profiling
  done, per instruction). A cheap discriminator: gate/comment out
  `requireHyphenationPatternsCoherenceFn` vs early-return
  `_driveComposition` when `service === null || no subscribers`, and
  compare. Which document/stat change the user used for "noticeable"
  matters: document edits stress #2+#3, root stat changes (width/axes)
  stress #1.
- Should the hyphenation requirement walk be memoized (languages change
  only when typeSpec/stylePatch languageTag fields change) or moved out of
  the root coherence? Design question for the planning phase.
- Should `_driveComposition` short-circuit when the controller has zero
  subscribers (pull the demand gate up into the meta)? Design question.

---

# Follow-up (same session, operator triage: #1 operator inspects, #2 deep-dived, #3 deprioritized)

## #1 — proxy-unpacking detail for the operator's inspection

`requireHyphenationPatternsCoherenceFn` (`index.typeroof.jsx:235-275`)
reads its dependencies (`typeSpec`, `stylePatchesSource`,
`installedHyphenationPatterns`) **directly through the potential write
proxies** — it never calls `unwrapPotentialWriteProxy`. This is exactly
the pattern the videoproof layout documents as slow
(`lib/js/components/layouts/videoproof.typeroof.jsx:825-838`: "in the
CoherenceFunctions operating with the proxies is slow. Reading, is slow
and consequently also writing... this Model is metamorphosed each frame
and subsequently all CoherenceFunctions are executed").
Videoproof's coherences unwrap first (`:864`, `:1006`, ...) and use
`getDraftEntry`/`getDraftFor` accessors.

Cost mechanics of not unwrapping in the walk: every
`proxy.get(key)` dispatches through the `_PotentialWriteProxy` get trap
(`lib/js/metamodel/potential-write-proxy.ts:98+`); immutable child
results are re-proxified per access (`_PotentialWriteProxy.create`) —
the `_LOCAL_PROXIES` cache lives on drafts, so a read-only walk of
proxified immutables allocates fresh proxy objects for every visited
node/child, every run. `walkEffectiveTypeSpecLanguageParts` +
`walkStylePatchLanguages` therefore allocate O(TypeSpec nodes + style
patches) proxy objects per coherence execution, and the coherence
executes on **every** root metamorphose (no gating,
`struct-model.ts:782-806`), twice per change cycle (async window +
sync pass, `shell.mjs:942-952,1556-1563`). Iteration
(`for (const [, child] of typeSpec.get("children"))`) also goes through
traps.

## #2 — hot-path cost analysis (document-nodes-meta composition drive)

Source: dedicated sub-agent cost analysis, verified line refs.

**Call frequency (typeSpec stat change):** NOT all textblocks — only the
affected subtree. `DocumentNodeProperties.update` (`index.mjs:650-656`)
rebuilds only when its resolved `typeSpecProperties@` id was marked
updated or the parent scope identity changed; a parent rebuild cascades
down the document subtree via the `@parentNodeProperties` re-trigger
dependency (`:1001-1008`). Caveat: a stat on the root/commonly-resolved
typeSpec makes "the subtree" effectively the whole document. A textblock
whose scope rebuilt runs `_driveComposition()` **twice** per cycle
(`_scopeSettled` + its own `update`, acknowledged "acceptable" at
`:786-798`).

**Cost per call, zero subscribers:**
- `this.getEntry(".")` in `_compositionSource()` = a walk from the model
  ROOT: `_BaseComponent.getEntry` (`component.mjs:45-52`) → root bus
  (`shell.mjs:1125-1144`) → metamodel `_getEntry` (`accessors.ts:21-44`):
  `Path.fromString` + one container `.get()` per path part = O(node
  depth) model lookups + string parsing — although the immutable node
  was already in hand during `update(compareResult)`.
- `_styleResolutionContext()` → `getTypeSpecPropertiesIdMethod`
  (`prosemirror/integration.typeroof.jsx:188`, memo :176): TWO more
  root-depth `getEntry("nodeSpecToTypeSpec")` walks + `pathOfTypes.join("\n")`
  string build per call (memo-hit path; misses recurse + slice-copy).
- Controller side with no demand: `sourceChanged` = 1 Map get
  (`_hasDemand` gate, `composition-controller.ts:385-387,472-475`);
  `registerSource` = has/set + gate (`:447-470`). Driver invoked **0
  times** behind the gate — the ONLY `_compositionSource()` evaluation
  is the discarded null-check at `index.mjs:832`.
- Plus `_isTextblock` ×2 (O(1)) and `getWidgetById` ancestor-chain probe.

**Net per textblock per update (viewer inactive):** ~3 root-depth model
walks + 1 string join + ~6 map lookups + object allocation, all to build
a source object that is immediately thrown away; ×2 on scope-rebuild
cycles.

**Baseline (fontbureau/main):** `DocumentNodesMetaElement` had **no**
`update`/`initialUpdate` override and no scope-settled callback — the
entire §2 cost is net-new per-update overhead on this branch. The
hierarchical-scope machinery itself (incl. the `@parentNodeProperties`
cascade) is pre-existing.

**Boot:** per textblock store-only (map set + closure); no compose, no
scheduling behind the demand gate.

**Cheap discriminator (for later planning):** early-return
`_driveComposition` when the controller has no subscribers (pull the
demand gate up into the meta), or skip the gate-evaluating
`_compositionSource()` construction — restores main-like per-update
cost while keeping the feature intact for active viewers.

---

# Resolution

**Fixed in commit `55bf4954`** ("[type-stage] fix performance issue
introduced with the coherence function requireHyphenationPatterns"):
suspect #1 resolved by (a) unwrapping the potential write proxies at the
two walk entry points (the known-problematic pattern, cf. videoproof) and
(b) an early return `if (!isNew && !typeSpecRaw.isDraft &&
!stylePatchesSourceRaw.isDraft) return;` — the metamodel's own
draft-tracking as the change signal, with `isNew` covering the boot path
(deserialized documents carry immutable fields). Operator reports the main
loop is "immediately WAY better".

**Remaining (deferred):** suspect #2 — the DocumentNodesMeta per-update
composition drive (net-new ~3 root-depth `getEntry` walks + discarded
source object per textblock per update, double-fired on scope-rebuild
cycles). Candidate: hoist the demand gate into `_driveComposition`. To be
revisited if it shows up in feel on textblock-heavy documents or when
optimizing the active-viewer path.

**Parked (operator decision, 2026-10-07 00:03):** #2 accepted as-is. The
subtree cascade is the update mechanism (main's architecture), not a
target. The only bounded waste is the eager `_compositionSource()` build
at `index.mjs:832` (discarded at the null-check; built twice per drive
when demanded). Candidate micro-fix if it ever shows up: a `_canCompose()`
check using only the cheap null-deciding conditions (`_isTextblock`,
`_lastNewState !== null`, `scope?.hasScope`) so the source object is built
exclusively behind the controller's demand gate; registration-order
semantics ("source and demand may arrive in either order") stay intact.
Expected impact: sub-millisecond on typical documents; relevant only for
deeply-nested + many-textblock documents during continuous drags, and for
the future active-viewer optimization pass (double-build/double-fire then
compounds with real composition work). Verify with `console.count` at
`index.mjs:831` and after `composition-controller.ts:417` before acting.
