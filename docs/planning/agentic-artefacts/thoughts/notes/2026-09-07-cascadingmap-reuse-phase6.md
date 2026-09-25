# CascadingMap reuse / Phase 6 feasibility — analysis (uncommitted working note)

**Date**: 2026-09-07 (updated end-of-day as a session handoff) ·
**Context**: umbrella plan
`thoughts/plans/2026-09-05-1623-node-properties.md` Phase 6 (optional:
typeSpecnion merge → CascadingMap), surfaced while planning the editor
`nodeProperties@` wiring. **Status**: the machinery unification predicted
below has LANDED (see "State after the 2026-09-07 session"); the
effective-map unification + shared base class remain Phase 6 work.

## Question

Is there more potential for re-use and unification between
`HierarchicalScopeTypeSpecnion` and `HierarchicalScopeNodeProperties`?
`HierarchicalScopeProperties` looks like a candidate base, but it builds
its effective map with `new Map` copies, and the CascadingMap transition
was planned for later (umbrella Phase 6). This note maps exactly where
CascadingMap makes re-use feasible, and what stays separate.

## The two effective-map strategies

| | `HierarchicalScopeProperties` (typeSpecnion) | `HierarchicalScopeNodeProperties` |
|---|---|---|
| effective map | `mapSetProperties(new Map(), filteredParent, local)` — **copies** parent+local into a fresh `Map` (`scope-resolution.mjs:_initPropertyValuesMaps`) | `CascadingMap([["local", local], ["parent", parentMap]])` — **no copy**, layered read (`node-properties.mjs` constructor) |
| parent consumption | parent's `getInheritableProperties()` | parent's `getInheritableProperties()` (since `f2c5aee9`; via the factory/call-site — see below) |
| demarcation routing | `collectPropertyGeneratorEntries` → `[raw, inheritanceControls]` | **shared** `collectPropertyGeneratorEntries` (since `6e54e2e7`) |
| inheritance policy | full `getInheritableProperties()` → shared `resolveInheritableProperties(scope)` | **shared** `resolveInheritableProperties(scope)`, memoized per instance (since `6e54e2e7` + `f2c5aee9`) |
| synthetic resolution | `resolveSyntheticProperties` static | same static (already shared) |
| generator invocation | `LocalScopeProperties.propertiesGenerator` | **shared** `LocalScopeProperties.propertiesGenerator` (since `6e54e2e7`) |
| construction | one class, single constructor | **factories**: `createRoot` / `createChild` / `createFromParentMap` (since `d0b46d08`) |

Only the first row still diverges — the effective-map strategy
(copy-Map vs CascadingMap). Everything else unified during the
2026-09-07 session, exactly as the "What unifies WITHOUT CascadingMap"
section below predicted.

## Why subclassing `HierarchicalScopeProperties` now is premature

Making node-properties extend `HierarchicalScopeProperties` today would
either (a) force node-properties off its no-copy cascade — a regression
on the design 5b installed to validate cascade-as-effective-map — or
(b) require overriding most of `_initPropertyValuesMaps` (the
`mapSetProperties` copy at `:503-507`), which is inheritance in name
only. The copy is the obstacle, and it is exactly what Phase 6 removes.

## What unified WITHOUT CascadingMap (LANDED 2026-09-07)

These were pure unification refactors, independent of the effective-map
strategy — all landed in the editor-wiring cycle:

1. **Generator invocation** — node-properties calls
   `LocalScopeProperties.propertiesGenerator(...)` instead of its inline
   loop. Picks up demarcation triples for free.
2. **Demarcation routing** — `collectPropertyGeneratorEntries(...)` →
   `[rawProperties, inheritanceControls]`.
3. **Inheritance policy** — extract the body of
   `HierarchicalScopeProperties.getInheritableProperties` into a shared
   module-level `resolveInheritableProperties(scope)` in
   `scope-resolution.mjs`; both classes call it. The body is already
   generic (operates on `getProperties()`, `localPropertyNames`,
   `_inheritancePolicyGenerators`, `_inheritanceControls` — nothing
   typeSpec-specific).
4. **Parent-projection consumption** — node-properties reads the
   parent's `getInheritableProperties()` (the contract), not its raw
   `getProperties()`.

After these four, the **only** genuinely class-specific code left is the
effective-map construction: copy-Map vs CascadingMap. That is the right
amount of separation to carry into Phase 6.

## State after the 2026-09-07 session (handoff)

Commits, in order:

- `7ee17784` — **bug fix**: document-node scopes consumed the dispatcher's
  OWN settled map as their parent (`parentSettledProperties` resolved
  `_widgets[0]` — the node itself), a self-loop that left every document
  node showing the root width's initial value forever. Replaced with
  `ancestorSettledProperties`, resolved strictly from the
  `_parentScopeChain`; the dead `parentSettledProperties` was removed.
  Setting the Stage Size width now trickles the document width through
  the whole `nodeProperties@` tree.
- `d0b46d08` — **constructor split** into factories: `createRoot`
  (defaults map as parent layer), `createChild` (parent scope instance →
  `getInheritableProperties()` projection), `createFromParentMap`
  (G8 contract: the parent's pre-projected map taken verbatim). The
  union "parent scope OR defaults map" constructor argument and its
  `instanceof` discrimination are gone.
- `f2c5aee9` — **the cascade consumes the control projection**:
  `ancestorSettledProperties` and the meta-root lazy getter return
  `getInheritableProperties()` (tombstones/re-routes applied) instead of
  the raw effective map; `DocumentNodeProperties.inheritableSettledProperties`
  added. `getInheritableProperties()` is **memoized per scope instance**
  (the document-node change guard compares the parent map by identity).
  Behavior-neutral with the empty policy (projection === effective map);
  verified live: a `layout/width` tombstone now withholds width from
  children and grandchildren while the node keeps its own.
- `5167c4b2` — unrelated whack-a-mole: deterministic mark-styling drain
  (Firefox re-mount bug), not part of this analysis.

**Phase-6-relevant facts learned this session:**

1. **The live document-node tree passes MAPS, not scope instances.**
   `DocumentNodeProperties` builds its scope via `createFromParentMap`
   with the ancestor's pre-projected map (the G8 contract). The
   `createChild` instance path is exercised only by unit tests, not the
   live tree. A shared Phase 6 base class must therefore work with
   **map-only parents** — the instance-based `getInheritableProperties()`
   call in `createChild` is a convenience, not the tree's mechanism.
2. **Projection memoization matters for correctness.** The document-node
   scope build's rebuild guard compares the parent map by identity; an
   unmemoized `getInheritableProperties()` (fresh Map per call once a
   policy yields controls) would read as perpetual change. Phase 6's
   shared base must preserve per-instance memoization (or identity
   stability) of the projection.
3. **The empty policy is the only thing keeping behavior stable.** The
   `DEMARCATION_INHERITANCE` machinery is fully live end-to-end; the
   width semantics (what actually gets tombstoned/re-routed) is parked
   until "the engine is in a good shape". That's the next content
   decision, independent of Phase 6's structural unification.
4. **The self-loop class of bug is now documented in-code.** The
   `ancestorSettledProperties` / `parentPayload` pair both self-skip via
   `_parentScopeChain`; reading `_widgets[0]` (this node's own scope) as
   "the parent" is the trap. Any Phase 6 refactor of the meta tree's
   scope-build wiring must preserve that distinction.

## What Phase 6 (CascadingMap) then unlocks

Once the typeSpecnion's effective map is a `CascadingMap` instead of a
`mapSetProperties` copy:

- Both classes construct `CascadingMap([["local", local], ["parent",
  parentProjection]])` identically → the effective-map construction
  unifies, and a **shared base class becomes natural** (it no longer
  forces a copy on either).
- **Allocation churn drops**: today every typeSpecnion rebuild copies the
  full parent+local map; the cascade is O(layers) construction + lazy
  key index, no copy. This is the stated Phase 6 motivation.
- **Ancestor access**: `getLayer("parent").getLayer("parent")` walks
  ancestors without re-deriving intermediate maps — the node channel
  already relies on this (umbrella G8 contract); Phase 6 gives the
  typeSpecnion the same.

### Watch-items for Phase 6 (not in scope now)
- `CascadingMap` layers may nest; if deep chains ever profile hot,
  flatten at construction (splice inner layers in place) — internal
  change, read interface identical (noted in `cascading-map.mjs`).
- The typeSpecnion's `_getParentMaps` root FIXME (`scope-resolution.mjs:466-472`:
  "at the root … differentiate whether to inherit or take from
  defaults") must be resolved against cascade layering semantics.
- Read-interface parity: consumers of the typeSpecnion effective map
  currently get a `Map`; `CascadingMap` is a read-only Map-like facade
  (no mutation methods). Any consumer that *mutates* the result (none
  should) would break loud — verify at Phase 6.

## Bottom line

The generator/routing/policy/parent-projection machinery is **already
unified** (2026-09-07 session) — pure reuse, behavior-neutral, validated
live. What remains for Phase 6 is the effective-map unification and the
shared base class: move the typeSpecnion from copy-Map
(`mapSetProperties`) to `CascadingMap`, at which point both classes
construct `CascadingMap([["local", local], ["parent", parentProjection]])`
identically and a shared base becomes natural. Subclassing before that
would couple node-properties to the copy semantics the umbrella plan
intends to retire. When doing it, respect the session-learned
constraints above: map-only parents in the live tree, memoized
projection identity, and the self-vs-ancestor distinction in the
scope-build wiring.

---

## Additions from review (2026-09-07, pre-Phase-6)

Verified against the codebase before starting Phase 6:

1. **Iteration order changes — the one behavior-visible semantic
   difference.** `mapSetProperties(new Map(), filteredParent, local)`
   iterates parent keys first (local overrides keep the parent's
   insertion position; local-only keys append). `CascadingMap` iterates
   local keys first, then parent-only keys. CSS actors are **safe**:
   `actorApplyCssProperties`/`actorApplyCSSColors` never iterate the
   property map — they iterate their own ordered `propertyDescriptions`
   and do keyed lookups (`properties-util.mjs:140-171`). But any
   consumer that iterates the effective map for display or
   serialization (UI parameters display, `getStyleLinks`, debug
   helpers, tests asserting entry order) may see reordered output.
   → Add to Phase 6 scope: audit map-iterating consumers for order
   sensitivity; add a behavior test if any is user-visible.

   **RESOLVED (same day, confirmed with user):** the audit found NO
   order-sensitive consumers — all 27 `getProperties()` call sites use
   keyed lookups (`has`/`get`); the only map iterations are `...map`
   spreads into fresh Maps (order-agnostic); the display widget
   (`type-spec-properties.typeroof.jsx`) iterates the *registry*
   (`TYPESPEC_PPS_MAP.keys()`), not the effective map. **Iteration
   order unites on LOCAL-FIRST** (the cascade's native order, already
   live in the node-properties channel since Phase 4) — no
   compatibility shim needed.

2. **Watch-item #3 (mutation audit) is now VERIFIED, close it.** All 27
   non-test `.getProperties()` call sites treat the result as read-only;
   no consumer mutates the returned map (the only `.set()` hits are
   unrelated local Maps in animation code). The read-only facade breaks
   nobody.

3. **The root FIXME becomes *addressable*, not just a risk.**
   `_getParentMaps`'s "at the root … differentiate whether to inherit
   or take from defaults" (scope-resolution.mjs:466-472) is awkward in
   copy-merge semantics but maps naturally onto cascade layering:
   `[["local", ...], ["inherited", ...], ["defaults", ...]]` with
   per-read precedence via `getLayer`. Phase 6 should treat the FIXME
   as a design input to the layer scheme, not merely a hazard to
   preserve.

4. **`PatchedScopeProperties`/`createPatched` is in scope.**
   `createPatched` already passes an ARRAY of parent maps
   (`[this.getInheritableProperties(), this._getParentMaps()[1]]`) —
   the patched scope is a two-layer cascade in waiting; Phase 6 should
   convert it alongside, not leave it on copy-merge semantics.
