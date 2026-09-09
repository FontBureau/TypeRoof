---
date: 2026-09-07T14:40:00+02:00
git_commit: 02ff40d11b7ad2eea901b300f844ccbfc82c63f1
branch: demo/wikipedia
repository: TypeRoof
topic: "Wire nodeProperties@ to the editor styler (+ inheritance-policy socket in the node channel)"
tags: [plan, node-properties, prosemirror, editor, styler, demarcation, cascading-map]
status: complete
research: docs/planning/agentic-artefacts/thoughts/research/2026-09-07-1400-editor-viewer-styling-divergence.md
analysis: docs/planning/agentic-artefacts/thoughts/notes/2026-09-07-editor-not-on-nodeProperties-channel.md
umbrella: thoughts/plans/2026-09-05-1623-node-properties.md
# The Phase 6 CascadingMap-reuse analysis (2026-09-07-cascadingmap-reuse-phase6.md)
# deliberately stays uncommitted (working note).
---

# Plan: Wire nodeProperties@ to the Editor Styler

## Overview

The viewer's `UIDocumentTypeSpecStyler` consumes the per-document-node
`nodeProperties@<documentNodePath>` channel; the editor's does not — it
styles from the typeSpecnion alone, so editor and viewer diverge (the
immediate symptom: viewer blocks get `width` from the channel, editor
blocks don't). This plan wires the editor onto the channel and, as a
behavior-neutral prerequisite, installs the demarcation / inheritance-
policy socket in the node-properties scope (reusing the existing
scope-generic machinery) so a future width-semantics takeover can drop
in a policy without touching the scope class.

**Deliberately out of scope (per operator, 2026-09-07):** width
semantics (what any node yields as `layout/width`; root `layout/width`
demarcation content), column layout, any inheritance *policy content*.
We wire the channel; we do not decide the geometry semantics. The
policy socket ships **empty** (zero behavior change). The Phase 6
CascadingMap reuse analysis
(`2026-09-07-cascadingmap-reuse-phase6.md`, an uncommitted working note)
informs Phase 2's design but is **not** part of this plan's phases.

## Current State Analysis

- Shared styler `UIDocumentTypeSpecStyler`
  (`lib/js/components/prosemirror/type-spec.typeroof.jsx:231`) reads
  `nodeProperties@` null-tolerantly (`:253-261`: unregistered → empty
  `new Map()` at `:260`) and builds
  `CascadingMap([["node", nodePropertiesMap], ["style",
  typeSpecnion.getProperties()]])` (`:296-305`). `layout/width → width`
  is in `innerPropertiesData` (`:265`); `getDefault` returns
  `[false, ""]` for `layout/*` keys ("absent → unset", `:356-360`).
- Viewer maps the channel per node
  (`viewer.typeroof.jsx:308`, `` `nodeProperties@${this._documentNodePath.toString()}` ``,
  `_documentNodePath = metaInfo.rootPath` `:231`), via
  `typeSpecStylerDependencyMappings` (`document-nodes-meta/derivations.mjs:362-386`,
  `[nodePropertiesId, "nodeProperties@"]` at `:370`). Viewer rebuild
  check compares **only** `properties@` (`viewer.typeroof.jsx:464-466`)
  because the document path is wrapper-lifetime-stable there.
- Editor (`UIDocumentNodeOutfitter._createWidgetDefinition`,
  `type-spec.typeroof.jsx:669-703`) maps `properties@` (`:678`),
  `rootFont`, `parentContent`, conditional `nextProperties@` —
  **no `nodeProperties@`**. Node identity (`_pmNode`, `_getPos`,
  `_typeSpecPath`, `_originTypeSpecPath`) lives on the outfitter
  (`:565-568`); the styler is constructed with `pmNode = null`.
- Per-node registrations are keyed by absolute document-node path:
  `nodeProperties@/activeState/document/content/<i>/content/<j>…`
  (dispatcher `_createWrapper`, `document-nodes-meta/index.mjs:419`;
  asserted in `lib/js/tests/type-stage-viewer-behavior/index.test.mjs:357,452-455,506`).
- The editor can derive the same indexes: `getPathOfTypes`
  (`integration.typeroof.jsx:34-53`) walks `resolved.path` in steps of
  3 collecting `path[i].type.name` and **discards** the sibling index at
  `path[i+1]` (the commented-out `contentIndexes` lines). Both the meta
  tree and the PM path index into the same content collection, so the
  discarded indexes ARE the document-node-path segments.
- `HierarchicalScopeNodeProperties` (`node-properties.mjs:26`) is
  standalone (not a `HierarchicalScopeProperties` subclass). Its
  constructor re-implements the generator loop inline (`:50-57`),
  **dropping demarcation triples**, and children read the parent's raw
  `getProperties()` (`:46-49`). `inheritancePolicyGenerators` is
  accepted/stored (`:39, :73`) but never read. The scope-generic
  machinery it duplicates lives in `scope-resolution.mjs`:
  `LocalScopeProperties.propertiesGenerator` (`:269-285`),
  `collectPropertyGeneratorEntries` (2-bucket demarcation routing),
  `resolveSyntheticProperties` (`:140+`, already reused at
  `node-properties.mjs:58-62`), and the reference
  `getInheritableProperties` (`:397-449`).

### Key Discoveries:
- The editor and meta tree index into the **same** document content
  collection, so PM sibling indexes === meta child keys === document-
  node-path segments. No new mapping table is needed, only collecting
  the already-present indexes.
- `LocalScopeProperties.propertiesGenerator` + `collectPropertyGeneratorEntries`
  are the existing, scope-generic demarcation socket — the node channel
  just isn't calling them. No new routing machinery needs inventing.
- Editor PM NodeViews persist across edits/moves, so unlike the viewer
  the `nodeProperties@` id is **not** wrapper-lifetime-stable → the
  outfitter needs a rebuild check for it (the viewer's exclusion
  argument does not transfer).
- The editor's inner/outer element split is intentional and correct
  (operator, 2026-09-07); `layout/width` applies to the **inner**
  element via the existing `innerPropertiesData` entry — no styler
  change required.

## Desired End State

- `getPathOfContentIndexes(resolvedPath)` helper in
  `integration.typeroof.jsx`, returning the sibling-index segments of a
  PM resolved path, tested.
- `HierarchicalScopeNodeProperties` routes generator output through
  `LocalScopeProperties.propertiesGenerator` +
  `collectPropertyGeneratorEntries`, gaining `[rawProperties,
  inheritanceControls]`; implements `getInheritableProperties()` via a
  shared helper extracted from the typeSpecnion; children consume the
  parent's **inheritable projection**. Both call sites pass an
  **empty** `inheritancePolicyGenerators` — behavior-neutral.
- The editor's `UIDocumentTypeSpecStyler` receives
  `nodeProperties@<documentNodePath>`; its cascade node layer carries
  the node's effective map (no longer always empty). Editor and viewer
  consume the identical per-node property maps.
- The outfitter rebuilds its styler when the computed `nodeProperties@`
  id changes (node moved / re-resolved).

### Verification of end state:
- `npm run typecheck`, `npm run lint` clean; full vitest suite green.
- New unit tests: `getPathOfContentIndexes`; node-properties
  demarcation/inheritance behavior (asserted on resolved maps).
- New behavior test: editor styler's `nodeProperties@` entry is the
  per-node registration (not null) and its cascade node layer carries
  the node's effective map. The test implements its own observable
  semantics (per operator) rather than asserting the undecided width
  outcome.
- Manual: wikipedia demo, editor + compare mode render as before
  (channel now feeds the editor; width still governed by the existing
  `layout/*` absent→unset contract until the semantics takeover).

## What We're NOT Doing

- No width semantics: no decision about which nodes yield
  `layout/width`, no root `layout/width|height` demarcation *content*,
  no column division. (The immediate viewer-side `width: 1200pt` leak
  stays as-is until the semantics takeover.)
- No inheritance *policy content* — `inheritancePolicyGenerators` ships
  empty; the socket only.
- No change to `UIDocumentTypeSpecStyler`'s inner/outer handling or its
  `layout/width` target (stays inner).
- No `HierarchicalScopeProperties` subclassing of node-properties, and
  no typeSpecnion→CascadingMap migration (Phase 6, deferred — see the
  analysis doc).
- No UI; no changes to the ramp layout beyond what the shared code
  paths already give it.

## Naming (locked)

- Helper: `getPathOfContentIndexes(resolvedPath)` (sibling to
  `getPathOfTypes`, `integration.typeroof.jsx`).
- Shared inheritance helper: `resolveInheritableProperties(scope)` in
  `scope-resolution.mjs` (extracted from
  `HierarchicalScopeProperties.getInheritableProperties`).
- Outfitter rebuild probe: `_checkNodeProperties()` (mirrors
  `_checkNextProperties`, `type-spec.typeroof.jsx:707-751`).
- Editor dependency internal name: `"nodeProperties@"` (same as viewer).

## Implementation Approach

Three phases. Phase 1 is a pure additive helper. Phase 2 is a
behavior-neutral unification refactor + socket (reuse, not invention).
Phase 3 is the wiring. Each phase lands as small commits with the
suite green; per the umbrella Working Agreements, stop for commit
confirmation at each gate.

---

## Phase 1: Document-node path resolution helper ✅

### Overview
Pure, additive helper that extracts the sibling-index segments from a
PM resolved path — the data `getPathOfTypes` already walks past. No
behavior change; nothing consumes it until Phase 3.

### Changes Required:

#### 1. `getPathOfContentIndexes`
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx` (next to `getPathOfTypes`, `:34-53`)
**Changes**:

```js
// Mirror of getPathOfTypes for the content-collection indexes: the
// document-node-path segments. resolved.path carries triples
// [node, index, startOffset]; the sibling index at i+1 is the node's
// key in its parent's content collection — the same key the meta tree
// (document-nodes-meta) uses for its per-node rootPaths and hence for
// nodeProperties@<path> registration ids. Top-level node => [].
export function getPathOfContentIndexes(path /* resolved.path */) {
    const contentIndexes = [];
    for (let i = 0, l = path.length; i < l; i += 3)
        contentIndexes.push(path[i + 1]);
    return contentIndexes;
}
```

#### 2. Unit tests
**File**: `lib/js/components/prosemirror/integration.test.mjs` (or the existing nearest test module for integration helpers — confirm location at implementation)
**Changes**: behavior tests over a small PM doc: a top-level node
yields `[]`; a nested node yields its `[i, j, …]` segments; the indexes
align positionally with `getPathOfTypes` on the same `resolved.path`
(same walk, different element of each triple).

### Success Criteria:
- Automated: new tests green; full suite unchanged; typecheck; eslint.
- Manual: n/a (no consumer yet).

**Implementation Note**: pause for commit confirmation before Phase 2.

---

## Phase 2: Inheritance-policy socket (reuse, behavior-neutral) ✅

### Overview
Replace the node-properties scope's inline generator loop with the
existing scope-generic machinery (`LocalScopeProperties.propertiesGenerator`
+ `collectPropertyGeneratorEntries`), gaining demarcation routing and
`[rawProperties, inheritanceControls]`; extract the typeSpecnion's
`getInheritableProperties` body into a shared helper and call it from
both classes; children consume the parent's inheritable projection.
`inheritancePolicyGenerators` ships **empty** at both call sites — zero
behavior change. This installs the socket a future width-semantics
takeover will populate, without inventing new routing machinery.

### Changes Required:

#### 1. Extract shared inheritance helper
**File**: `lib/js/components/layouts/type-stage/scope-resolution.mjs`
**Changes**: extract the body of
`HierarchicalScopeProperties.getInheritableProperties` (`:397-449`) into
a module-level `export function resolveInheritableProperties(scope)`.
The body is already generic — it reads `scope.getProperties()`,
`scope.localPropertyNames`, `scope._inheritancePolicyGenerators`,
`scope._inheritanceControls`; parameterize on the scope. The typeSpecnion's
`getInheritableProperties()` becomes `return resolveInheritableProperties(this);`
Keep behavior identical (tombstones withhold, synthetic controls resolve
against settled own properties with `allowParentOnlyResolution=true`,
explicit controls override policy controls).

#### 2. Rewire the node-properties scope onto the shared machinery
**File**: `lib/js/components/layouts/type-stage/node-properties.mjs`
**Changes**:
- Constructor (`:35-66`): replace the inline loop (`:50-57`) with
  `LocalScopeProperties.propertiesGenerator(this._propertiesGenerators, hostMap, parentMap)`
  routed through `collectPropertyGeneratorEntries(gen, DEMARCATION_PROPERTY)`
  → `[rawProperties, inheritanceControls]`. Store `_inheritanceControls`.
  (propertiesGenerator builds the outer API internally; remove the
  hand-rolled `outerAPI`.)
- Parent consumption (`:41-49`): when the parent arg is a scope
  instance, read its `getInheritableProperties()` (the projection), not
  raw `getProperties()`. At the root (defaults map) keep using the map
  directly. Note: `propertiesGenerator`'s third arg and
  `initPropertyValuesMap`'s parent arg both become the projection —
  tombstoned/withheld properties are then invisible to generators and
  synthetics, matching the typeSpecnion's "can't be resurrected"
  contract.
- Add `getInheritableProperties() { return resolveInheritableProperties(this); }`.
- Keep the `CascadingMap([["local", local], ["parent", parentMap]])`
  effective map (`:63-66`) unchanged — the cascade is the design 5b
  validates; Phase 6 migrates the typeSpecnion to it, not the reverse
  (see the uncommitted working note
  `2026-09-07-cascadingmap-reuse-phase6.md`).

#### 3. Empty policy at call sites
**Files**: `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:186-190`,
`lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:613-622`
**Changes**: pass an explicit empty `inheritancePolicyGenerators`
([] or a shared frozen `NODE_PROPERTIES_INHERITANCE_POLICY = []`) as
the 4th constructor arg. No policy content.

#### 4. `.prettierignore` entries
**File**: `.prettierignore`
**Changes**: none expected (no new `.mjs` files; `node-properties.mjs`
and `scope-resolution.mjs` are already covered). Verify at commit.

#### 5. Unit tests
**File**: `lib/js/components/layouts/type-stage/node-properties.test.mjs`
**Changes**: behavior tests asserted on resolved maps (mirroring
`type-specnion.test.mjs` patterns): with an empty policy the child's
effective map equals the parent's effective map through the cascade
(baseline, no change); with a policy yielding a `DEMARCATION_INHERITANCE`
tombstone, the property is withheld from the child but present in the
parent's own `getProperties()`; a synthetic re-route control resolves
against the parent's settled own properties. Assert on
`getProperties()` / `getInheritableProperties()` / `getLayer("parent")`,
not internals.

### Success Criteria:
- Automated: full suite green (existing tests assert inherited
  `layout/width`, `type-stage-viewer-behavior/index.test.mjs:392-393,525`
  — these MUST still pass with the empty policy, confirming behavior-
  neutrality); new node-properties tests green; typecheck; eslint.
- Manual: `git diff` shows reuse (deleted inline loop, calls to shared
  statics) not new machinery; no logic change beyond the projection
  read.

**Implementation Note**: pause for commit confirmation before Phase 3.

---

## Phase 3: Editor `nodeProperties@` wiring ✅

### Overview
Compute the per-node document path in the outfitter (Phase 1 helper +
the outfitter's rootPath), map `nodeProperties@<documentNodePath>` into
the styler's dependencies, and rebuild the styler when the id changes.
No `UIDocumentTypeSpecStyler` change — its null-tolerant read and
cascade already handle a mapped channel.

### Changes Required:

#### 1. Document-node path id in the outfitter
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx` (`UIDocumentNodeOutfitter`)
**Changes**:
- Add a memoized `_documentNodePathId()`:
  - `resolved = view.state.doc.resolve(this._getPos())` (same access as
    `_checkNextProperties`, `:718-719`).
  - `indexes = getPathOfContentIndexes(resolved.path)` (Phase 1).
  - Compose: `` `nodeProperties@${this.widgetBus.rootPath.toString()}` ``
    + per index `/content/${index}`. (`widgetBus.rootPath` is expected
    to be `/activeState/document` — VERIFY at implementation against
    the meta tree's actual registration prefix; adapt if the
    subscriptions layer's rootPath differs.)
  - Memoize on `this._getPos()` result + `this._pmNode` identity.
- Constructor: nothing new to store (uses existing `_getPos`,
  `_pmNode`, `widgetBus`).

#### 2. Map the channel in the styler definition
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx` (`_createWidgetDefinition`, `:669-703`)
**Changes**: add `[this._documentNodePathId(), "nodeProperties@"]` to
`stylerDependencies` (alongside `properties@` `:678`). The styler's
existing `update` then receives the mapped entry; `getEntry("nodeProperties@")`
resolves to the per-node registration instead of the unregistered-null
fallback. **Guard**: if the computed id has no live registration
(transient edit state / ordering mismatch), the protocol's
`notFoundFallbackValue: null` yields null → the styler degrades to the
empty node layer exactly as today (silent, robust during edits). No new
error surface.

#### 3. Rebuild on id change
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx` (`UIDocumentNodeOutfitter`)
**Changes**: add `_checkNodeProperties()` (mirrors `_checkNextProperties`,
`:707-751`): recompute `_documentNodePathId()`, compare to the value
cached at last provision, update the cache, return whether it changed.
OR its result into `requireUpdateDynamicWidget` in `_provisionWidgets`
(`:766-770`). Rationale: PM NodeViews persist across edits/moves, so the
document path is NOT wrapper-lifetime-stable for the editor (unlike the
viewer, which excludes `nodeProperties@` from its rebuild check,
`viewer.typeroof.jsx:458-466`).

#### 4. Behavior test
**File**: `lib/js/tests/type-stage-viewer-behavior/index.test.mjs` (or the editor-side behavior harness)
**Changes**: in editor (or compare) mode, assert the editor styler's
`nodeProperties@` entry is the per-node registration (not null) and
that its cascade node layer carries the node's effective map — e.g. a
node inside the document exposes `layout/availableWidth` from its
`nodeProperties@` map where previously the editor's node layer was
empty. Implement the test's own observable semantics (per operator);
do NOT assert the undecided `layout/width` outcome.

### Success Criteria:
- Automated: full suite green incl. the new behavior test; typecheck;
  eslint.
- Manual: wikipedia demo — editor and compare mode render; the editor's
  styled nodes now consume the same per-node maps as the viewer. Width
  still governed by `layout/*` absent→unset until the semantics
  takeover (the editor will now *see* inherited `layout/width` through
  the channel — flag the rendered result to the operator before
  declaring done, since that is the semantics takeover's content, not
  this plan's).

**Implementation Note**: pause for manual confirmation — this is the
behavior-carrying phase.

---

## Testing Strategy

**Tests assert behavior (inputs → observable outcomes), not
function/method implementations.** E.g. for the demarcation socket:
"a property tombstoned by the parent's policy is withheld from the
child's resolved map but present in the parent's own resolved map",
not "_inheritanceControls contains a TOMBSTONE". Implementation
refactors must not require test rewrites. Where a test can only observe
through a public surface, assert on that surface (resolved maps via
`getProperties()` / `getInheritableProperties()` / `getLayer()`, the
styler's applied CSS), never on private fields or call counts.

### Unit Tests:
- `getPathOfContentIndexes`: top-level → `[]`; nested → `[i, j, …]`;
  positional alignment with `getPathOfTypes` (asserted on the returned
  segments, not the walk).
- `node-properties.test.mjs`: demarcation routing (empty policy =
  baseline; tombstone withholds; synthetic re-route resolves), asserted
  on resolved maps.

### Integration Tests:
- Editor-on-channel behavior test (Phase 3): editor styler consumes the
  per-node `nodeProperties@` map.
- Existing `type-stage-viewer-behavior` suite (incl. `:392-393, :525`
  inherited-width assertions) must stay green through Phase 2 — the
  canary for behavior-neutrality of the socket.

## Working Agreements

1. **Small, reviewable steps**: each phase lands as one or a few small
   commits; no phase bundles unrelated changes.
2. **Commit gate**: before *every* commit, stop with the proposed commit
   message (and file list) and wait for explicit operator acknowledgement.
3. **Docs commit last**: as the final step, commit the research and plan
   documents into `docs/planning/agentic-artefacts/thoughts/`
   (preserving the `research/` and `plans/` subdirectories). The Phase 6
   analysis (`2026-09-07-cascadingmap-reuse-phase6.md`) is a root
   working note — per the operator it stays uncommitted; the resolved
   analysis note
   `2026-09-07-editor-not-on-nodeProperties-channel.md` is archived under
   `notes/`.
4. **`.prettierignore` on new `.mjs` files**: the repo ignores everything
   by default (`*`) and un-ignores per pattern; `*.ts`/`*.jsx` are covered
   but each new `.mjs` file must get an explicit `!lib/js/...` entry in
   `.prettierignore`. No new `.mjs` files are expected in this plan
   (existing: `cascading-map.mjs`, `scope-resolution.mjs`,
   `node-properties.mjs`, `node-properties-generators.mjs`, and their
   tests are already covered); if one is added, give it an explicit
   `!lib/js/...` entry.
5. **Behavior tests, not implementation tests**: tests assert observable
   behavior (inputs → outcomes) on public surfaces, never private fields
   or call counts; implementation refactors must not require test
   rewrites (see Testing Strategy).
