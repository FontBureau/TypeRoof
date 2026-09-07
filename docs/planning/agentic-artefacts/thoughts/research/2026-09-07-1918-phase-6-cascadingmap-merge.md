---
date: 2026-09-07T19:18:00+02:00
git_commit: 5167c4b2b32a6b2eac4483b5f6b9503276098da6
branch: demo/wikipedia
repository: TypeRoof
topic: "Phase 6 pre-state: typeSpecnion effective-map construction vs CascadingMap"
tags: [research, codebase, cascading-map, scope-resolution, node-properties, phase-6]
status: complete
---

# Research: Phase 6 pre-state — effective-map construction across the scope classes

## Research Question

Map the codebase as it exists before Phase 6 (umbrella
`thoughts/plans/2026-09-05-1623-node-properties.md`): where the
typeSpecnion's copy-merge effective map lives, how the node-properties
channel's CascadingMap construction differs, who consumes the effective
maps and how (keyed vs iterating), and what test patterns exist.
Companion to handoff `2026-09-07-cascadingmap-reuse-phase6.md` and plan
`thoughts/plans/2026-09-07-1915-phase-6-cascadingmap-merge.md`.

## Summary

The divergence is concentrated in `scope-resolution.mjs` (528 LOC):
`HierarchicalScopeProperties` and `PatchedScopeProperties` copy-merge
parent+local into fresh Maps (4 copy/merge constructions inventoried
below), while `HierarchicalScopeNodeProperties` (node-properties.mjs,
207 LOC) constructs `CascadingMap([["local", local], ["parent",
parent]])` with no copy. All other machinery (generator invocation,
demarcation routing, inheritance policy, parent-projection consumption)
is already shared via module-level functions in `scope-resolution.mjs`.
Only two production modules import these raw modules directly; all other
consumers reach scopes via protocol payloads. Consumption splits into
keyed lookups (UI/default resolution) and whole-map iteration
(style-links, processed properties, spreads into new maps/cascades).
Tests assert behavior on resolved maps through the public surface.

## Detailed Findings

### `scope-resolution.mjs` — the copy-merge side

- `_BaseScopeProperties` (`:62-129`): abstract base; constructor
  installs throw-on-get/redefine-on-set accessors for
  `_localPropertyValuesMap`/`_propertyValuesMap` (`:65-96`). Provides
  `getProperties()` (`:101`), `getInheritableProperties()` defaulting to
  `getProperties()` (`:104-111`), `getOwnProperty` (`:112-120`),
  `localPropertyNames` (`:121`), `getPropertyValuesMap()` (`:125-128`).
- `HierarchicalScopeProperties` (`:419-528`): constructor
  disambiguates the third argument by `instanceof _BaseScopeProperties`
  (`:431-435`) — parent scope instance OR defaults map.
  - `_getParentMaps` (`:476-493`): root case passes
    `this._typeSpecDefaultsMap` itself, no copy (`:485-488`); the root
    FIXME at `:482-484`: "at the root, this is not exact enough, we need
    to differentiate whether to inherit or whether to take a value from
    the defaults." Then `filteredParentPropertyValuesMap = new
    Map(parentPropertyValuesMap)` (`:491`) — copy #1.
  - `_initPropertyValuesMaps` (`:495-527`): shared generator invocation
    + demarcation routing, then `mapSetProperties(new Map(),
    filteredParentPropertyValuesMap, localPropertyValuesMap)`
    (`:516-520`) — copy #2, the effective map.
  - `getInheritableProperties()` (`:460-462`): plain `return
    resolveInheritableProperties(this)` — NOT memoized; identity
    stability currently holds only via the empty-policy early return at
    `:385`.
  - `createPatched` (`:464-474`): passes `[this.getInheritableProperties(),
    this._getParentMaps()[1]]` — a two-element parentMaps array matching
    `_getParentMaps()`'s return shape.
- `PatchedScopeProperties extends _BaseScopeProperties` (`:309-348`):
  `mapSetProperties(new Map(), rawProperties, stylePatch)` into local
  raw (`:329-333` — local-only merge), then `mapSetProperties(new Map(),
  filteredParentPropertyValuesMap, localPropertyValuesMap)` (`:340-344`)
  — copy #3. NOTE (`:319-326`): the origin scope's own
  DEMARCATION_INHERITANCE controls are deliberately bypassed; the
  grand-parent's controls are honored via the consumed parent maps.
- Module-level functions: `mapSetProperties` (`:12-17`, sequential
  Map.set merge), `collectPropertyGeneratorEntries` (`:30-60`, routes
  DEMARCATION_PROPERTY vs DEMARCATION_INHERITANCE), and the
  scope-generic `resolveInheritableProperties(scope)` (`:362-409`):
  controls merge (`:374-378`), empty-policy early return (`:385`), else
  `new Map(ownProperties)` copy #4 (`:403`) with tombstone deletions and
  resolved control sets.

### `cascading-map.mjs` — the cascade side (97 LOC)

- Read-only Map-like facade over labeled layers, insertion order =
  precedence, first hit wins; duplicate labels throw (`:18-31`).
- Lazy key→winning-layer index, never invalidates (layers immutable,
  `:34-47`).
- Read surface only: `size`, `has`, `get`, `keys`, `entries`, `values`,
  `Symbol.iterator`, `forEach` (`:49-81`); NO `set`/`delete`/`clear`.
  Iteration is effective-view order: each deduped key at its winning
  layer's position — local-first for `[["local"], ["parent"]]`.
- `getLayer(label)` (`:89-91`) returns the raw layer (Map or nested
  CascadingMap) or undefined; documented uses: ancestor chains
  (`getLayer("parent").getLayer("parent")`) and precedence bypass.
- `toMap()` (`:93-96`): debug/boundary materialization into a plain Map.
- Header NOTE (`:6-10`): nested cascades recurse on lookup; if deep
  chains profile hot, flatten at construction — internal change, read
  interface identical.

### `node-properties.mjs` — the already-migrated channel (207 LOC)

- Constructor (`:116-153`) builds `new CascadingMap([["local",
  localPropertyValuesMap], ["parent", parentMap]])` (`:141-144`) using
  the same shared functions (`LocalScopeProperties.propertiesGenerator`,
  `collectPropertyGeneratorEntries`, `initPropertyValuesMap`).
- Factories (`:47-104`): `createRoot` (raw defaults map as parent
  layer), `createChild` (parent scope instance →
  `getInheritableProperties()` projection), `createFromParentMap` (G8
  contract: pre-projected map taken verbatim).
- Memoized `getInheritableProperties()` (`:165-174`): "consumers compare
  the projection by identity across update cycles (the document-node
  scope build's change guard) — a fresh map per call would read as
  perpetual change once a policy yields controls."
- `NODE_PROPERTIES_INHERITANCE_POLICY = Object.freeze([])` (`:37`) —
  intentionally empty socket.
- Does NOT extend `_BaseScopeProperties`; replicates its read surface
  standalone.

### Consumers of the effective maps

Direct importers of the raw modules (excl. tests, `_site/` build
output): `type-specnion.mjs:23` (alias re-export), `node-properties.mjs`
(:9 scope-resolution, :1 cascading-map), `prosemirror/
type-spec.typeroof.jsx:68` (CascadingMap — already builds
`new CascadingMap([["node", nodePropertiesMap], ...])` at `:297`).

Keyed-lookup consumers (`has`/`get`): `defaults.mjs:90`,
`type-tools-grid.mjs` (:1080, :1775, :1894, :1926),
`type-spec-properties.typeroof.jsx:85`, `language-tags.typeroof.jsx:407`,
`ui-manual-axis-locations.mjs:650,680`, `type-spec.typeroof.jsx:161,874`.

Whole-map-iterating consumers: `getStyleLinks` (via
`meta.typeroof.jsx:152`, `type-spec-fundamentals.mjs:853`,
`type-spec.typeroof.jsx:1758`), `processed-properties.mjs:131`
(direct for..of over the property map), pane-styler spreads into a fresh
Map (`pane-styler.typeroof.jsx:55,57`), `type-spec.typeroof.jsx:262,304,
316` spreads into cascade layers, `axes-parameters.mjs:5` iterates for
unregistered axes. NOTE: the handoff's review addition 1 concluded "no
order-sensitive consumers"; this inventory confirms all iterations are
order-agnostic transforms (link collection, keyed CSS application,
spreads into fresh maps) — but they ARE iteration sites, so the
local-first order change is visible in any serialized/debug output.

### Test patterns (behavior, not implementation)

- `cascading-map.test.mjs` (151 LOC): public-surface behavior only —
  precedence, deduped iteration, `getLayer` ancestor chains, duplicate
  labels throw, no mutation methods.
- `node-properties.test.mjs` (278 LOC): asserts on resolved maps via
  public API; explicit comment `:178` "Behavior asserted on resolved
  maps (public surface), not internals." Includes policy socket tests
  (tombstone, re-route, resurrection) and `getLayer("parent")` identity.
- `type-specnion.test.mjs` (377 LOC): same assertion style for the
  copy-merge channel (resolveSyntheticProperties, DEMARCATION_INHERITANCE
  controls, style-link inheritance).
- `lib/js/tests/type-stage-viewer-behavior/index.test.mjs` (622 LOC):
  integration; asserts `childScope.getProperties().getLayer("parent")`
  identity (`:460`) end-to-end.

## Code References

- `lib/js/components/layouts/type-stage/scope-resolution.mjs:516-520` — the typeSpecnion copy-merge (Phase 6 target)
- `lib/js/components/layouts/type-stage/scope-resolution.mjs:491` — the intermediate parent copy
- `lib/js/components/layouts/type-stage/scope-resolution.mjs:482-484` — root FIXME (design input)
- `lib/js/components/layouts/type-stage/scope-resolution.mjs:460-462` — unmemoized typeSpecnion projection
- `lib/js/components/layouts/type-stage/scope-resolution.mjs:309-348` — PatchedScopeProperties
- `lib/js/components/layouts/type-stage/node-properties.mjs:141-144` — the cascade construction to converge on
- `lib/js/components/layouts/type-stage/node-properties.mjs:165-174` — memoized projection + rationale
- `lib/js/components/cascading-map.mjs:89-91` — getLayer
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:632-640` — live-tree G8 contract call site

## Open Questions

- The whole-map-iterating consumers (getStyleLinks, processed-properties,
  pane-styler/type-spec spreads, axes display) are assessed as
  order-agnostic; if any serialized output proves user-visible after the
  swap, a behavior test belongs in Phase 6 scope.
- Whether `HierarchicalScopeNodeProperties` joins the
  `_BaseScopeProperties` hierarchy in Step 4 (it currently replicates
  the read surface standalone).
