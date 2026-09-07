---
date: 2026-09-07T19:15:00+02:00
git_commit: c8c39e75 (implemented); planned at 5167c4b2b32a6b2eac4483b5f6b9503276098da6
branch: demo/wikipedia
repository: TypeRoof
topic: "Phase 6: typeSpecnion effective map merge -> CascadingMap, shared base class"
tags: [plan, cascading-map, scope-resolution, node-properties, type-stage, phase-6]
status: implemented
research: thoughts/research/2026-09-07-1918-phase-6-cascadingmap-merge.md
umbrella-plan: thoughts/plans/2026-09-05-1623-node-properties.md
handoff: 2026-09-07-cascadingmap-reuse-phase6.md
---

# Phase 6: typeSpecnion merge → CascadingMap — Implementation Plan

## Overview

Umbrella Phase 6 (optional follow-up, now activated): replace the
typeSpecnion's `mapSetProperties(new Map(), parent, local)` copy-merge
with `CascadingMap` composition, converging both scope classes on the
identical construction
`CascadingMap([["local", local], ["parent", parentProjection]])`.
Motivation (umbrella): allocation churn on rebuilds, ancestor access via
`getLayer`. Once both classes build the same cascade, extract the shared
construction into a base class — the **final effort** of this plan.

Everything else the handoff predicted as unifiable has already landed
(2026-09-07 session: generator invocation, demarcation routing,
inheritance policy, parent-projection consumption). Only the
effective-map strategy still diverges.

## Current State Analysis

Verified against code at `5167c4b2`:

- `scope-resolution.mjs` has NO CascadingMap import. The divergence is
  exactly two copy sites:
  - `_getParentMaps` (`scope-resolution.mjs:474-495`): copies the parent
    projection `new Map(parentPropertyValuesMap)` (:493).
  - `_initPropertyValuesMaps` (`:497-525`): copies again via
    `mapSetProperties(new Map(), filteredParentPropertyValuesMap,
    localPropertyValuesMap)` (:516-520).
- `PatchedScopeProperties` (`:309-346`) repeats the same pattern:
  style-patch merged into local via `mapSetProperties`, then copy-merged
  over `filteredParentPropertyValuesMap`. Its callers already pass an
  ARRAY of parent maps (`createPatched`, `:464-471`) — a two-layer
  cascade in waiting.
- `HierarchicalScopeNodeProperties` (`node-properties.mjs:139-142`)
  already constructs `new CascadingMap([["local", ...], ["parent",
  ...]])`; its `getInheritableProperties()` is memoized per instance
  (`:166-173`).
- `HierarchicalScopeProperties.getInheritableProperties()`
  (`scope-resolution.mjs:460-462`) is NOT memoized; identity stability
  currently holds only because the empty policy hits the early return
  `if (!allControls.size) return ownProperties` (`:385`). A non-empty
  policy would return a fresh map per call.
- Iteration-order audit (handoff review addition 1, RESOLVED): no
  order-sensitive consumers. Iteration order unites on LOCAL-FIRST (the
  cascade's native order, live in the node channel since Phase 4). No
  compatibility shim. The research doc refines this: whole-map iteration
  sites DO exist (`getStyleLinks`, `processed-properties.mjs:131`,
  pane-styler/type-spec spreads, axes display) but are order-agnostic
  transforms — visible only in serialized/debug output, if at all.
- Mutation audit (handoff review addition 2, VERIFIED): no consumer
  mutates the returned map; the read-only CascadingMap facade breaks
  nobody.
- `_BaseScopeProperties` (`:62-133`) already provides the common read
  surface (`getProperties`, `getInheritableProperties`, `getOwnProperty`,
  `localPropertyNames`, `getPropertyValuesMap`); both target classes
  extend it (node-properties does NOT — it is standalone, see Open
  Questions).

## Changes Required

### Step 1 — Root layer scheme: three layers (DECIDED: option B) ✅ LANDED

The `_getParentMaps` root FIXME (`scope-resolution.mjs:482-484`: "at the
root … differentiate whether to inherit or take from the defaults")
maps naturally onto cascade layering (handoff review addition 3).
DECISION: three layers —
`[["local", local], ["inherited", parentProjection],
["defaults", defaultsMap]]` with per-read precedence via `getLayer`. At
the root the "inherited" layer is empty/absent and "defaults" carries
the typeSpec defaults map; below the root both layers are present.

**Required inline documentation** (operator instruction): because no
consumer differentiates "inherited" vs "defaults" yet, the layer scheme
must carry a comment at the construction site explaining WHY the
distinction exists (the FIXME's inherit-vs-default semantics, the
per-read `getLayer` potential, and that current consumers read the
effective view only). The missing consumer means missing documentation
— the code must supply it.

### Step 2 — `HierarchicalScopeProperties` effective map → CascadingMap ✅ LANDED

**File**: `lib/js/components/layouts/type-stage/scope-resolution.mjs`

- `_initPropertyValuesMaps`: replace the `mapSetProperties(new Map(),
  filteredParent, local)` copy with the three-layer cascade per the
  Step 1 decision: `[["local", localPropertyValuesMap], ["inherited",
  parentProjection], ["defaults", defaultsMap]]` (layers absent when
  empty, e.g. "inherited" at the root).
- `_getParentMaps`: drop the intermediate `new Map(...)` copy; the
  cascade layers reference the parent's projection directly (immutable
  after construction — memoization constraint, see Step 4). The
  function's two-map return contract simplifies accordingly; check
  `createPatched`'s use of `_getParentMaps()[1]`.
- No changes to generator invocation, demarcation routing, or synthetic
  resolution — all already shared.

**Tests** (behavior, not implementation — umbrella Testing Strategy):
assert on resolved maps via the public surface: parent key readable
through child; local key overrides parent on same name; tombstoned key
absent from child's projection but present in own `getProperties()`;
defaults readable at root. No assertions on `_index()`, layer internals,
or map identity between layers.

### Step 3 — `PatchedScopeProperties` → CascadingMap ✅ LANDED

**File**: `scope-resolution.mjs` (same file, separate commit)

- Local layer = style patch applied over raw properties (the existing
  `mapSetProperties(new Map(), rawProperties, stylePatch)` merge is a
  LOCAL construction, not a parent copy — it may stay a plain Map).
- Effective map = FLAT cascade (DECIDED): `[["local", patchedLocal],
  ["parent", ownProjection], ["inherited", grandParentMap]]` —
  preserving the current precedence patched-local > own outbound
  projection > grand-parent filtered map. The grand-parent slot uses the
  label "inherited", matching the Step 1 vocabulary. No wrapping of
  plain Maps in single-layer cascades.

**Tests**: style patch overrides origin property; non-patched properties
still resolve from the origin's outbound map; grand-parent tombstones
remain honored (per the existing NOTE at `:322-327`).

### Step 4 — Shared base class (FINAL effort) ✅ LANDED

Both classes now construct identical cascades. Extract:

- The cascade construction `CascadingMap([["local", local], ["parent",
  parentMap]])` into the shared base.
- **Memoized `getInheritableProperties()`** into the base — owning the
  per-instance memoization for BOTH classes (the typeSpecnion currently
  relies on the empty-policy early return; once a policy yields controls
  the identity-stability constraint from the handoff applies to it too).
- Respect the session-learned constraints (handoff): map-only parents in
  the live document-node tree (`createFromParentMap` / G8 contract);
  memoized projection identity (document-node rebuild guard compares by
  identity); self-vs-ancestor distinction in scope-build wiring
  (`_parentScopeChain`, never `_widgets[0]`).
- Base class (DECIDED: option c): the new shared base EXTENDS
  `_BaseScopeProperties`, `HierarchicalScopeNodeProperties` joins the
  hierarchy, AND `_BaseScopeProperties`'s constructor trickery
  (throw-on-get/redefine-on-set accessors, `:65-96`) is modernized to
  plain field assignment in the same step — the outdated pattern is
  removed, not replicated (CODINGSTYLE).

**Tests**: existing suites (`type-specnion.test.mjs`,
`node-properties.test.mjs`) must pass UNCHANGED — the base extraction is
behavior-neutral by construction; that is the test.

### Docs commit (last) — IN PROGRESS

Commit exactly THREE documents into the existing structure under
`docs/planning/agentic-artefacts/thoughts/`:

1. The handoff note `2026-09-07-cascadingmap-reuse-phase6.md`
   (repo root) → `notes/2026-09-07-cascadingmap-reuse-phase6.md`
   (decided: `notes/`, precedent
   `notes/2026-09-07-editor-not-on-nodeProperties-channel.md`).
2. This plan → `plan/2026-09-07-1915-phase-6-cascadingmap-merge.md`.
3. The research document →
   `research/2026-09-07-1918-phase-6-cascadingmap-merge.md`.

The pre-existing `thoughts/` tree (umbrella plan, editor-wiring plan,
earlier research) is NOT part of this commit — those belong to their
own cycles.

## Decisions (operator, 2026-09-07)

1. **Root layer scheme → option B (three layers)**: nice-to-have but
   cheap now; MUST add inline documentation at the construction site
   explaining why the "inherited" vs "defaults" distinction exists, as
   the missing consumer means missing documentation.
2. **Base class → option c**: extend `_BaseScopeProperties`, node
   channel joins the hierarchy, constructor trickery modernized to plain
   field assignment in the same step.
3. **Patched scope → flat, "inherited" label** for the grand-parent
   map; no nesting.

## Success Criteria

- Automated: full verification battery green PER LANDING:
  `npx vitest run`, `npx eslint`, `npm run typecheck`, `npm run build:app`.
- Behavior: wikipedia demo type-setting unchanged (typeSpecnion-driven
  styling is behavior-neutral); live check that inheritance controls
  (a `layout/width` tombstone) still withhold/re-route identically
  through the typeSpecnion path.
- Structural: no `mapSetProperties(new Map(), ...)` parent-copy remains
  in the scope classes; both construct CascadingMap cascades (three-layer
  per Step 1, flat "inherited" per Step 3); shared base owns construction
  + memoized projection; `_BaseScopeProperties` constructor trickery
  removed; the layer-scheme rationale is documented inline at the
  construction site.

## Working Agreements

1. **Small, reviewable steps**: each step lands as one or a few small
   commits; no step bundles unrelated changes.
2. **Commit gate**: before EVERY commit, stop with the proposed commit
   message (and file list) and wait for explicit operator
   acknowledgement. No commits and no file writes without explicit
   permission (OKOK).
3. **Docs commit last**: exactly the three documents listed above.
4. **`.prettierignore` on new `.mjs` files**: this phase modifies
   existing files only; any new `.mjs` file (e.g. a shared-base module,
   if extracted to its own file) needs an explicit `!lib/js/...` entry.
5. **Behavior tests**: tests assert inputs → observable outcomes on the
   resolved maps, never function/method implementations. Implementation
   refactors must not require test rewrites.
6. **Verification battery per landing**: `npx vitest run`, `npx eslint`,
   `npm run typecheck`, `npm run build:app`.

## Watch-items (not in scope)

- CascadingMap layer nesting depth: if deep chains profile hot, flatten
  at construction (internal change, read interface identical — noted in
  `cascading-map.mjs`).
- Width-semantics policy content (what actually gets tombstoned /
  re-routed): parked until "the engine is in a good shape" — independent
  of this structural unification.
- `mapSetProperties` itself remains used internally by
  `resolveInheritableProperties` (`:374-378`, control merging) and
  `PatchedScopeProperties`' local merge — only the parent-copy uses are
  retired.
