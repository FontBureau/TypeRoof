---
date: 2026-09-05T16:23:14+02:00
git_commit: e012337f8a0a895cf4334268e833f1b05698da3a
branch: demo/wikipedia
repository: TypeRoof
topic: "Node properties: per-document-node property channel parallel to the typeSpecnion"
tags: [plan, node-properties, cascading-map, type-specnion, layout]
status: approved-design
research: thoughts/research/2026-09-04-2344-layout-channel.md
---

# Node Properties Implementation Plan

## Overview

Style inheritance (typeSpec→typeSpec) and layout/geometry propagation
(document node→document node) are currently conflated in the typeSpecnion
(`specific/root/*` keys, re-route gymnastics in `horizontalLayoutRunion`).
We build a **second, parallel property channel**: per-document-node
properties ("node properties"), computed by generators from (a) the node's
resolved typeSpecnion map and (b) the parent node's outbound facts,
transported via a new `nodeProperties@<path>` protocol, consumed by stylers
and by child nodes. The typeSpecnion stays style-pure and shared per
typeSpec; node properties are per node instance.

## Current State Analysis

- `HierarchicalScopeTypeSpecnion`
  (`lib/js/components/layouts/type-stage/type-specnion.mjs:366-520`) is the
  per-typeSpec scope machine: 2-bucket demarcation routing
  (`collectPropertyGeneratorEntries` :36-66), synthetic resolution
  (`LocalScopeTypeSpecnion` statics :148-308), inheritance controls +
  tombstones (`getInheritableProperties` :402-449).
- Environment facts are injected into the root typeSpecnion defaults as
  `specific/root/environment/...` and `specific/root/width|height`
  (`live-properties.typeroof.jsx:109-133`), consumed by
  `environmentGen`/`availableSizesGen` (`properties-generators.mjs:53-115`)
  which yield `generic/availableWidth|Height` (pt) → pane-styler
  (`pane-styler.typeroof.jsx:46-52`) and `generic/width`
  (prosemirror/type-spec.typeroof.jsx:253).
- `horizontalLayoutRunion` (`properties-generators.mjs:553-668`) fakes
  geometry via inheritance re-routes/tombstones — works only because
  typeSpec tree == node tree today.
- Parent→child typeSpecnion transport exists: `@parentProperties`
  dependency mapping (`meta.typeroof.jsx:215-222`), child reads
  `parentProperties.typeSpecnion` (`live-properties.typeroof.jsx:73-88`).
- Document-node widgets resolve their (and their parent's) *effective*
  typeSpec path via `nodeSpecToTypeSpec` relative links
  (`prosemirror/integration.typeroof.jsx:174-269`; parent path via
  `pathOfTypes.slice(0,-1)`).
- Mutation hazard: root seeding mutates the shared defaults map in place
  when no rootFont is wired (`live-properties.typeroof.jsx:119,128`;
  `Object.freeze(new Map())` doesn't prevent `.set()`).

### Key Discoveries:
- Generator/demarcation/SyntheticValue machinery is scope-generic; only the
  class names say "typeSpec" (research doc §1).
- Unknown demarcations throw (`type-specnion.mjs:60-64`) — misuse fails loud.
- No test asserts literal `specific/root` keys; pane-sizing test observes the
  env→availableWidth→CSS pipeline behaviorally.
- `LAYOUT`/`layout/`/`nodeProperties` names are all free (research §6).
- typeSpecnions are shared per typeSpec across elements with different node
  parents — hence node properties CANNOT live inside the typeSpecnion.

## Desired End State

- `CascadingMap` util: Map-backed labeled layers, read-only Map-like
  surface (`get/has/size/keys/values/entries/[Symbol.iterator]`), lazy
  key→layer index, duplicate-label throw at construction, `getLayer(label)`,
  `toMap()`, nested-cascade reads (flattening deferred, documented).
- Scope machinery generalized: `LocalScopeTypeSpecnion` statics and the
  hierarchical scope class reusable for any property scope, typeSpecnion a
  thin subclass/alias (zero behavior change).
- `HierarchicalScopeNodeProperties`: same machinery, own generator list,
  inputs = node typeSpecnion map + parent node properties (+ reserved
  `hostContext` = NodeModel, not in v1).
- `nodeProperties@<path>` protocol transporting per-node outbound maps;
  children consume via effective parent path (relative-link mechanism).
- Root degenerate case: environment = depth-0 node properties;
  `specific/root/*` and `availableSizesGen` leave the typeSpecnion;
  pane-styler/type-spec styler consume `layout/availableWidth` etc. from
  node properties.
- Defaults-map seeding is derive-not-mutate with a genuinely frozen map.

### Verification of end state:
- `npm run typecheck`, `npx eslint` clean; full vitest suite green.
- pane-sizing test passes reading from node properties (assertions updated
  only if the CSS unit story changes — it shouldn't).
- New unit tests: CascadingMap, node-properties scope resolution.

## What We're NOT Doing

- No `DEMARCATION_LAYOUT` in the typeSpecnion (parallel structure instead).
- No layout-dependent synthetics *inside* typeSpecnion generators.
- No typeSpecnion `mapSetProperties` → CascadingMap migration (explicit
  follow-up phase, optional).
- No UI for column layout beyond what exists; no `pageGutter`.
- No `hostContext`/NodeModel generator argument in v1.
- No flattening of nested CascadingMaps (comment only).

## Naming (locked)

- Protocol: `nodeProperties@<path>`
- Class: `HierarchicalScopeNodeProperties`
- Key prefix: `LAYOUT = 'layout/'` in registered-properties-definitions.mjs
  (naming convention only, no registry entries) — used for geometry keys
  like `layout/availableWidth`. NOT `node/` (collides conceptually with the
  channel name).
- CascadingMap layer labels: `"local"`, `"parent"`, `"environment"`
  (convention enforced by constructors, not by generators).

## Implementation Approach

Extract-then-build: generalize the scope machinery in a pure refactor
(no behavior change, full suite green), then build node properties as a
second instance of that machinery with new generators, protocol, and
wiring, migrating environment handling and geometry out of the typeSpecnion
incrementally (root scope before node→node channel).

### Review findings incorporated (2026-09-05, two delegated code reviews)

- Phase 2 verified substantially pure (5 importers, no typeSpec coupling);
  generator argument order stays `gen(outerAPI, host)` — node-properties
  generators use the SAME order (a plan draft had it reversed).
- Phase 3 premise corrected: FreezableMap.set() on frozen instance silently
  no-ops (doesn't throw); the hazard is silent *loss* of seeding, not
  corruption; the fix changes behavior in the no-rootFont case (bug fix).
- Phase 4: `nodeProperties@` protocol registration (both controllers)
  moved UP from Phase 5 — the shared pane-styler would otherwise request
  an unregistered protocol (BLOCKER). Environment accessor reads the
  parent/defaults map, not the host map. Width/height reads guarded for
  ramp (no such deps).
- Phase 5: registration asymmetry (UIDocumentElement registers, TextRun
  consume-only — duplicate registration would throw); imperative
  lifecycle-hooked register/unregister (resolved paths can change while
  the node widget persists); consumers read an accessor off the
  registering widget (like `.typeSpecnion`), not a bare map; styler
  rebuild-check must also compare `nodeProperties@`; scope construction
  independent of the styler branch (unknown/silent nodes must not break
  the channel); memo-key aliasing note for the 4th arg of
  getTypeSpecPropertiesIdMethod.
- Dead/broken code noted travelling with the Phase 2 move
  (`getOwnProperty`'s unreachable throw, `{$this.constructor.name}`
  template, `writtable` typo) — preserved deliberately in the pure move;
  may be fixed separately.

---

## Phase 1: CascadingMap ✅ (3e86f6dc)

### Overview
New dependency-free util; the read interface everything else will speak.

### Changes Required:

#### 1. CascadingMap
**File**: `lib/js/components/cascading-map.mjs` (new)
**Changes**:

```js
/**
 * Read-only Map-like facade over labeled layers in precedence order
 * (first hit wins). Layers are immutable Maps (or nested CascadingMaps);
 * on change, construct a new CascadingMap.
 *
 * NOTE: layers may be CascadingMaps themselves; lookups then recurse.
 * If deep chains ever show up in profiles, flattening nested cascades
 * at construction (splicing inner layers in place) preserves precedence
 * and restores O(1) — an internal change, the read interface stays
 * identical.
 */
export class CascadingMap {
    // layers: iterable of [label, map]; insertion order = precedence.
    // Duplicate labels throw (a duplicated precedence slot is a wiring bug).
    constructor(layers) { /* Map-backed _layers; _indexCache = null */ }

    // Lazily built key -> winning-layer index; serves size/has/keys/get.
    _index() { /* first-hit-wins pass over _layers */ }

    get size() {}
    has(key) {}
    get(key) {}
    *keys() {}
    *values() {}
    *entries() {}
    [Symbol.iterator]() {}
    forEach(fn, thisArg) {} // Map parity for consumers that expect it

    // Layer access: ancestry reads ("parent", "parent.parent", ...)
    // and precedence-bypass for generators.
    getLayer(label) {} // -> the layer (Map|CascadingMap) | undefined

    toMap() {} // debug/boundary snapshot
}
```

Not extending `Map` (honest interface); mutation methods absent (calling
them is a loud TypeError).

#### 2. Unit tests
**File**: `lib/js/components/cascading-map.test.mjs` (new)
**Changes**: behavior tests — a key in two layers reads from the
higher-precedence one; iterating yields each key once; `size` matches
the deduped key count; duplicate labels throw; a nested cascade reads
through; `getLayer` returns the addressed layer; `toMap()` equals
repeated reads. No assertions on internal caching.

### Success Criteria:
- Automated: `npx vitest run lib/js/components/cascading-map.test.mjs` green;
  full suite unchanged; eslint clean.
- Manual: API reads naturally at two call-site sketches (styler, generator).

**Implementation Note**: pause for confirmation before Phase 2.

---

## Phase 2: Scope machinery extraction (pure refactor) ✅ (f54eb52b)

### Overview
Move the scope-generic machinery out of type-specnion naming without any
behavior change. All existing tests must pass unchanged.

### Changes Required:

#### 1. Neutral home for scope statics
**File**: `lib/js/components/layouts/type-stage/scope-resolution.mjs` (new)
**Changes**: move `resolveSyntheticProperties`,
`propertiesGenerator`, `initPropertyValuesMap` (currently
`LocalScopeTypeSpecnion` statics, type-specnion.mjs:148-308) here as plain
exports. `propertiesGenerator`'s outer-API wrapper
(`hasParentProperty`/`getParentProperty`) moves unchanged.

#### 2. Generalize the hierarchical scope class
**File**: `lib/js/components/layouts/type-stage/scope-resolution.mjs`
**Changes**: `HierarchicalScopeTypeSpecnion`'s generic core (constructor,
`_initPropertyValuesMaps`, `_getParentMaps`, `getInheritableProperties`,
tombstone/controls, `createPatched`, `PatchedTypeSpecnion`) becomes
`HierarchicalScopeProperties` (+ `_BaseScopeProperties`). The polymorphic
3rd-arg check keys off the new base class.

#### 3. Compatibility subclasses
**File**: `lib/js/components/layouts/type-stage/type-specnion.mjs`
**Changes**: `LocalScopeTypeSpecnion` re-exports the statics (or deprecated
alias); `HierarchicalScopeTypeSpecnion extends
HierarchicalScopeProperties` (possibly zero-body). Keep demarcation symbol
exports and `collectPropertyGeneratorEntries` here or move+re-export —
whichever keeps import diffs smallest across the ~10 consumer files
(type-tools-grid, defaults.mjs, properties-generators.mjs, tests).

### Success Criteria:
- Automated: full vitest suite green, typecheck, eslint — all unchanged.
- Manual: `git diff` shows moves/renames only; no logic edits.

**Implementation Note**: pause for confirmation before Phase 3.

---

## Phase 3: Defaults hygiene (mutation-hazard fix) ✅ (f9836e43 + build fix 6c206093)

### Overview
Root seeding derives a fresh frozen map instead of mutating the shared
defaults map (`live-properties.typeroof.jsx:119,128` hazard).

### Changes Required:

#### 1. Freeze the base defaults map for real
**File**: `lib/js/components/layouts/type-stage/defaults.mjs:250-251`
**Changes**: `getTypeSpecDefaultsMap` result built into a `FreezableMap`
and `.freeze()`d (FreezableMap enforces: `.set()` throws after freeze).

#### 2. Pure seeding
**File**: `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:90-142`
**Changes**: extract a pure `seedTypeSpecDefaults(baseMap, {rootFont,
environment, width, height})` returning a fresh map; the update path
always assigns the fresh map (identity change becomes the change signal).
Both rootFont and non-rootFont branches go through it.

**Corrected premise** (from review): `getTypeSpecDefaultsMap` already
returns a frozen `FreezableMap` (defaults.mjs:250-251), and
`FreezableMap.set()` on a frozen instance **silently no-ops**
(metamodel/base-model.ts:86-89) — it does NOT throw. So the current
no-rootFont branch doesn't corrupt the shared map; it **silently drops**
environment/width injection (latent bug: both current layouts wire
rootFont, so it never fires). Derive-not-mutate therefore *changes*
behavior in the no-rootFont case (silent-loss → working injection) —
this is a bug fix, not "no behavior change". Do not change
`FreezableMap` semantics globally.

### Success Criteria:
- Automated: suite green; new behavior test asserting the base defaults
  map is unchanged after seeding (identity + content), and that the
  seeded result contains the injected keys.
- Manual: n/a.

**Implementation Note**: small phase; can merge into Phase 2 review.

---

## Phase 4: NodeProperties core + root scope (environment migration) ✅ (05eaf4f9)

### Overview
`HierarchicalScopeNodeProperties` + first generators; environment becomes
depth-0 node properties; `specific/root/*` leaves the typeSpecnion;
pane-styler consumes from the new channel. No viewer/node wiring yet —
root scope only, served from the existing root TypeSpecLiveProperties
lifecycle position.

### Changes Required:

#### 1. Node properties module
**File**: `lib/js/components/layouts/type-stage/node-properties.mjs` (new)
**Changes**:
```js
export class HierarchicalScopeNodeProperties extends HierarchicalScopeProperties {
    // constructor(nodePropertiesGenerators, hostMap, parentNodePropertiesOrDefaultsMap, policyGens?)
    // hostMap: the node's resolved typeSpecnion properties map
    // Generator signature: keep the shared static's calling convention
    // gen(outerAPI, host) (scope-resolution.mjs:propertiesGenerator) —
    // i.e. node-properties generators are (outerNodePropertiesAPI, hostMap),
    // SAME order as typeSpec generators; do NOT reverse.
    //
    // The scope's effective map IS a cascade (not a copied merge):
    //   CascadingMap([["local", localMap], ["parent", parentEffectiveMap]])
    // where parentEffectiveMap is itself the parent's cascade — inheritance
    // in the node channel is cascade nesting; getLayer("parent").getLayer("parent")
    // walks ancestors. This validates cascade-as-effective-map in production
    // ahead of the optional Phase 6 typeSpecnion migration.
}

// Root defaults: environment as depth-0 facts, keyed layout/environment/...
export function getRootNodePropertiesMap(environmentValues /* from environment@ */) { ... }
```

#### 2. First node-properties generators
**File**: `lib/js/components/layouts/type-stage/node-properties-generators.mjs` (new)
**Changes**: `availableSizesGen` migrated here: reads
`layout/environment/...` + root `width/height` (from host map or root
widget deps), yields `layout/availableWidth|Height` (pt, plain values),
`layout/width|height` identity synthetics. Uses
`lengthToCSSUnit` with an environment accessor **over the scope's
parent/defaults map** (where the environment facts live after seeding),
NOT over the host map — the host typeSpecnion carries no environment keys
once seeding is removed.

#### 3. `LAYOUT` prefix
**File**: `lib/js/components/registered-properties-definitions.mjs:14-34`
**Changes**: add `LAYOUT = 'layout/'` to the const group (convention only;
NOT added to `SYMBOLIC_TO_PREFIXES`).

#### 4. Root wiring (protocol registration included — moved up from Phase 5)
**Files**: `live-properties.typeroof.jsx`, `pane-styler.typeroof.jsx`,
`prosemirror/type-spec.typeroof.jsx:253`,
**`type-stage/index.typeroof.jsx` AND `ramp/index.typeroof.jsx`** (both!)
**Changes**:
- **Both** layout controllers: `setProtocolHandlerImplementation(
  ...SimpleProtocolHandler.create("nodeProperties@"))` + add
  `resetUpdatedLog()` for the new handler in the update/initialUpdate
  paths (mirroring `typeSpecProperties@` at type-stage/index.typeroof.jsx:281-296,
  :662-685; ramp/index.typeroof.jsx:241…, :411-430). Registration must land
  in this phase — the shared TypeStagePaneStyler is wired in both layouts,
  and without the protocol its dependency resolution produces a nonsense
  model path (component.mjs:479-487).
- Root TypeSpecLiveProperties (or its host) also builds the root
  HierarchicalScopeNodeProperties after the typeSpecnion settles; root
  width/height reads must be guarded per-layout
  (`wrapper.dependencyReverseMapping.has(dimension)` pattern,
  live-properties.typeroof.jsx:122-127) because ramp declares no
  width/height widget deps (ramp/index.typeroof.jsx:283-288).
- Pane-styler reads `layout/availableWidth|Height` from the node-properties
  map instead of `generic/availableWidth|Height` from typeSpecnion; same for
  `generic/width` consumer at type-spec.typeroof.jsx:253 → `layout/width`.
  Pane-styler keeps receiving `properties@` for colors/lang alongside.

#### 5. Remove from typeSpecnion
**File**: `properties-generators.mjs`
**Changes**: delete `environmentGen` + `availableSizesGen` from
`TYPE_SPEC_PROPERTIES_GENERATORS`; remove `specific/root/*` seeding from
live-properties (replaced by root node-properties defaults); keep
`horizontalLayoutRunion`'s style-side yields, remove/neutralize its
geometry re-routes that reference `generic/availableWidth` (they now
belong to the node channel; until Phase 5, children keep receiving
`generic/availableWidth` via the existing typeSpecnion inheritance so
nothing regresses).

### Success Criteria:
- Automated: suite green incl. pane-sizing (now fed via nodeProperties);
  eslint; typecheck.
- Manual: wikipedia demo pane sizing behaves as before (px values in pt).

**Implementation Note**: pause for manual confirmation — this is the first
behavior-carrying phase.

---

## Phase 5a: Document-tree walker/renderer separation (pure refactor)

### Overview
`UIDocumentElement` today conflates (1) document-tree infrastructure
(walking the pmNode tree, maintaining node widgets keyed by node
identity, typeSpec-path resolution, `pathOfTypes` context) with
(2) viewer DOM creation/styling. The walker must exist regardless of
which renderers are active (editor, viewer, side-by-side) — node
properties are computed per document node, not per renderer, and must
not be duplicated (or diverge) between editor and viewer.

### Changes Required:

#### 1. Extract the walker
**File**: `lib/js/components/layouts/type-stage/document-nodes-meta.typeroof.jsx` (new)
**Changes**: extract the tree-walking/node-identity/context machinery
from `UIDocumentElement`/`UIDocumentNodes` into a renderer-independent
`DocumentNodesMeta` layer (a widget-tree component over the shared
document model). It owns node lifecycle (create/update/destroy per
pmNode identity), `pathOfTypes` context propagation, and effective
typeSpec-path resolution (consuming `nodeSpecToTypeSpec` as today).

#### 2. Viewer attaches to the tree
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**: `UIDocumentElement` & co. become renderer attachments to
`DocumentNodesMeta` nodes: DOM creation/styling consume the tree layer's
node identity + context instead of owning the walk.

### Success Criteria:
- Automated: full suite green — pure move, behavior-neutral.
- Manual: viewer renders identically; side-by-side mode works as before.

**Implementation Note**: pause for manual confirmation — this is a
structural refactor of the viewer's core.

---

## Phase 5b: Node→node channel ✅

Implemented 2026-09-06/07 via the sub-plan
`docs/planning/agentic-artefacts/thoughts/plan/2026-09-06-1613-phase-5b-node-to-node-channel.md`
(commits `39d49e69`, `97987ac1`, `5bcbca3d`, `2ca096df`, `7e3c81b8`,
`55511293`, `f51e36bb`). The editor-side `nodeProperties@` wiring
follow-up is DONE (2026-09-07): the sub-plan
`docs/planning/agentic-artefacts/thoughts/plan/2026-09-07-1440-editor-nodeproperties-wiring.md`
(commits `8a73a4c5`, `6e54e2e7`, `671a37d9`) wired the editor styler onto
the channel and installed the inheritance-policy socket (empty); its
resolved analysis note is archived at
`docs/planning/agentic-artefacts/thoughts/notes/2026-09-07-editor-not-on-nodeProperties-channel.md`.
Still parked with the operator: width semantics (the stub generator
yields `layout/availableWidth`; no `layout/width` application yet —
root `layout/width` demarcation, now unblocked by the policy socket)
and column division.

### Overview
Per-document-node `HierarchicalScopeNodeProperties` instances owned by
the (renderer-independent) `DocumentNodesMeta` layer; transport via
`nodeProperties@<nodeId>`; children consume parent's outbound map;
renderer widgets (viewer + prosemirror outfitter) consume as needed.

### Changes Required:

#### 1. Protocol handler
Already registered in Phase 4 (both controllers). Nothing to do here.

#### 2. Per-node instances in DocumentNodesMeta
**Files**: `document-nodes-meta.typeroof.jsx`,
`prosemirror/integration.typeroof.jsx`
**Changes**:
- `DocumentNodesMeta` owns one `NodePropertiesLiveProperties`-style
  component per document node (encapsulates scope rebuild +
  `setUpdated`, the TypeSpecLiveProperties role — but NO Meta analogue:
  the meta layer itself provides the tree structure).
- **Registration ids must incorporate node identity**, not just the
  typeSpec path: multiple nodes sharing one typeSpec (the common case!)
  would collide at `nodeProperties@<typeSpecPath>`
  (`SimpleProtocolHandler.register` throws on duplicates,
  component.mjs:195-198). Id shape e.g. `nodeProperties@<typeSpecPath>#<nodeId>`
  or keyed by node path with typeSpec resolution on the consumer side.
- Scope construction is renderer-independent: unknown / silent nodes
  must not break the channel for descendants; their host map is the
  root (origin) typeSpecnion, matching the existing resolution fallback
  (integration.typeroof.jsx:246-262).
- Registration is lifecycle-hooked and imperative
  (`impl.register`/`unregister` in `update`/`destroy`), not one-shot via
  wrapper restOptions: resolved paths can change while the node widget
  persists (viewer.typeroof.jsx:995-998 short-circuit), and wrapper
  restOptions registration only unregisters in `destroy()`
  (component.mjs:760-781). Consumers receive the registering component
  and read an accessor (e.g. `.nodeProperties`) off it — same contract
  as `typeSpecProperties@` consumers reading `.typeSpecnion`.
- Parent effective typeSpec path computed via
  `_getTypeSpecPropertiesId(pathOfTypes.slice(0,-1), true)`; consume only
  if registered (`_getStyleLinkPropertiesId` null-check pattern,
  viewer.typeroof.jsx:661-685). Note the memo cache in
  getTypeSpecPropertiesIdMethod omits the protocol name from its key
  (integration.typeroof.jsx:187-189) — safe due to `hasRegistered`
  re-validation (:194-201), but pass the 4th arg deliberately.
- After rebuilding its scope, the producer calls
  `setUpdated(identifier)` on the protocol handler in `update`, before
  children compute (parent-first iteration order — verify this ordering
  with a test first), mirroring live-properties.typeroof.jsx:145-153.
- Text nodes: consume-only, no registration (nothing consumes a text
  node's outbound map).

#### 3. Styler composition point
**File**: `prosemirror/type-spec.typeroof.jsx` (UIDocumentTypeSpecStyler)
**Changes**: the styler receives both channels (`properties@` =
typeSpecProperties map, `nodeProperties@<path>` map — same input shape as
the existing optional `nextProperties@`, type-spec.typeroof.jsx:296-303;
constructor args unchanged) and itself constructs
`new CascadingMap([["node", nodePropertiesMap], ["style", typeSpecPropertiesMap]])`
— first-hit-wins: node properties (geometry, more specific to the box)
precede style properties on key conflicts. The cascade is rebuilt on
update when either input's identity changed; existing `propertiesData`
lookups read through the facade unchanged.
**Rebuild-check extension (required)**: `_provisionTypeSpecStyler`'s
replace-or-keep test compares only `properties@`
(viewer.typeroof.jsx:579-583); it must also compare
`dependencyReverseMapping.get("nodeProperties@")`, or a re-resolved
parent path keeps a stale wrapper.

#### 4. Migration of remaining geometry
**File**: `properties-generators.mjs` (`horizontalLayoutRunion`)
**Changes**: geometry yields (`/pt` synthetics, availableWidth re-route)
move to node-properties generators reading `layout/availableWidth` from the
parent; the typeSpecnion keeps style-only yields (columnCount, lineLength,
inlineMargins values). **Consumer update required**: when the
`generic/availableWidth` re-routes leave the typeSpecnion, the
`innerPropertiesData` read of `` `${GENERIC}width` ``
(type-spec.typeroof.jsx:245) must switch to the `layout/` key.

### Success Criteria:
- Automated: suite green; new behavioral test: a node inside a column
  container receives the container's per-column width as
  `layout/availableWidth` (assert via resolved CSS width).
- Manual: multi-column demo renders correct column widths; nested nodes
  resolve correct inherited geometry.

**Implementation Note**: pause for manual confirmation.

---

## Phase 6: (Optional follow-up) typeSpecnion merge → CascadingMap

### Overview
Replace `mapSetProperties(new Map(), parent, local)` merges in the
typeSpecnion with CascadingMap composition; `outerTypespecnionAPI` becomes
cascade reads. Motivation: allocation churn on rebuilds, ancestor access
via getLayer. Deferred until Phases 1–5 prove the interface.

---

## Follow-up (out of scope, recorded): renderers on MetaDocumentTree

Once `DocumentNodesMeta` (Phase 5a) exists as the renderer-independent
document-tree layer, refactor **both** the viewer (`UIDocumentElement`
& co.) and the prosemirror editor (`UIDocumentNodeOutfitter`) to attach
as much as possible to it — the outfitter currently duplicates
tree-walking knowledge. Synergy noted during planning; explicitly not
part of this plan's phases.

---

## Testing Strategy

**Tests assert behavior (inputs → observable outcomes), not
function/method implementations.** E.g. for CascadingMap: "a key present
in two layers reads from the higher-precedence layer", not "_index()
builds a Map". Implementation refactors must not require test rewrites.

### Unit Tests:
- `cascading-map.test.mjs` (Phase 1) — behavior of the Map-like surface:
  precedence, dedupe on iteration, label access, nesting, snapshot
  equivalence.
- `node-properties.test.mjs` (Phase 4/5) — scope behavior through a fake
  generator set (mirrors type-specnion.test.mjs patterns: re-route,
  tombstone, unresolvable synthetic drop/throw) — asserted on the resolved
  maps, not internals.
- Defaults-seeding purity (Phase 3): seeding twice yields equal maps;
  the base map is unchanged.

### Integration Tests:
- pane-sizing (updated) — environment→root nodeProperties→CSS.
- toggles harness — keeps passing unchanged (harness registers
  `environment@`; root node properties read from it).
- New: column-layout behavioral test (Phase 5) — container with
  columnCount → child text node CSS width equals computed column width.

## Working Agreements

1. **Small, reviewable steps**: each phase lands as one or a few small
   commits; no phase bundles unrelated changes.
2. **Commit gate**: before *every* commit, stop with the proposed commit
   message (and file list) and wait for explicit operator acknowledgement.
3. **Docs commit last**: as the final step, commit the research and plan
   documents into `docs/planning/agentic-artefacts/thoughts/`
   (preserving the `research/` and `plans/` subdirectories).
4. **`.prettierignore` on new `.mjs` files**: the repo ignores everything
   by default (`*`) and un-ignores per pattern; `*.ts`/`*.jsx` are covered
   but each new `.mjs` file must get an explicit `!lib/js/...` entry in
   `.prettierignore`. Applies to: `cascading-map.mjs`,
   `cascading-map.test.mjs`, `scope-resolution.mjs`, `node-properties.mjs`,
   `node-properties-generators.mjs`, `node-properties.test.mjs`.
