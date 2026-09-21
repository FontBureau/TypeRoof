---
eleventyNavigation:
  key: "DEMARCATION_FALLBACK"
  parent: Planning
  title: 'DEMARCATION_FALLBACK'
  order: 47
agent-created: true
model: moonshotai/kimi-k3
---

# DEMARCATION_FALLBACK: Scope-Local, Non-Inheritable Fallback Values

> **Status:** Proposal, not yet implemented. Written 2026-09-21 during
> the horizontal-layout WIP (column layout propagation in the
> type-stage layout). The immediate motivation is a consumer-side
> default hack in the document styler; the mechanism is general.

## Problem

Derived terminal keys — e.g. `generic/inlineMargins/start/pt`, the
unit-compiled CSS-string forms produced by `inlineLengthUnitsGen` —
exist only when a style is fully described (value + unit set). Some
consumers request such keys unconditionally: the document styler
(`lib/js/components/prosemirror/type-spec.typeroof.jsx`) maps them to
`padding-inline-*` on every update. When the key is absent, the
consumer must rescue the situation — currently via `getDefault`
hacks:

```js
if (property.startsWith(`${GENERIC}blockMargins/`))
    // FIXME: this is a hack!
    return [true, `0pt`];
if (property.startsWith(`${GENERIC}inlineMargins/`))
    // FIXME: this is a hack! see docs/planning/DEMARCATION_FALLBACK.md
    return [true, `0pt`];
```

This is the wrong place for a default: it is repeated per consumer,
invisible to the producer, and (worse) it falls through to
`getRegisteredPropertySetup(property)` for keys the registry doesn't
know — derived keys are unregistered by construction, so the rescue
itself can fail with `KEY ERROR` (observed live).

Defaults belong producer-side.

## Requirements

1. **Overridable by real styles.** A fallback yields only when neither
   the local scope nor any ancestor produced the property.
2. **Survives the optional-synthetic drop.** A local optional
   `SyntheticValue` that fails to resolve must reveal the fallback,
   not erase it.
3. **Never a style fact.** A fallback must not inherit to children,
   must not be editable model state, and must not fake a "described"
   style toward generator input-checks (the node channel reads
   *absence* as "not configured" — e.g. the fill logic in
   `manualHorizontalLayoutGen`).

## Rejected Designs

### Raw-map ordering ("yield first, later yields override")

A defaults generator placed first in the generator list yields plain
values; later yields overwrite them in the raw map
(`mapSetProperties`: later wins). Two sharp edges:

- **The optional-drop erases the shadowed entry.** Overrides happen in
  the *raw* map, before resolution. If the overriding entry is an
  optional synthetic whose dependencies don't resolve, the resolver
  prunes it — and the fallback is already gone (this is the known
  collision caveat documented at `availableSizesGen`). Fixing this
  requires restore-on-prune surgery in `resolveSyntheticProperties`.
- **"Non-inheritable" is per-name, not per-value.** Inheritance
  controls (`TOMBSTONE`) withhold a property *name* from children.
  Tombstoning a fallback key would also withhold a real value the
  scope produced for that name — breaking style inheritance. The
  machinery cannot distinguish "this value is just the fallback" from
  "this value is real."

### Conditional yielding ("only yield if not inherited")

A generator-body check like
`if (!outerTypespecnionAPI.hasParentProperty(key)) yield …` is an
imperative duplicate of cascade precedence, with added failure modes:
it reads the parent state at build time, and `hasParentProperty`
consults the *union* of inherited + defaults — a default could
wrongly suppress a fallback. The layered design makes the check
unnecessary; precedence is the mechanism.

## Proposed Mechanism

A third demarcation, next to `DEMARCATION_PROPERTY` and
`DEMARCATION_INHERITANCE` (`type-specnion.mjs`):

```js
export const DEMARCATION_FALLBACK = Symbol("DEMARCATION_FALLBACK");
```

Generators yield `[key, value, DEMARCATION_FALLBACK]`. Fallbacks do
**not** enter the raw property map; they form a new, scope-local layer
of the effective cascade:

```
local (resolved)  >  inherited  >  fallback  >  typeSpecDefaultsMap
```

### Semantics

- **Override by layer precedence, not mutation.** A real local yield
  wins (local > fallback). An *inherited real value* also wins
  (inherited > fallback) — a property raw-map ordering could never
  express, since a local fallback would shadow a parent's real value.
- **The optional-drop problem evaporates.** A pruned local synthetic
  simply reveals the layer below. No resolver changes for
  restore-on-prune.
- **Non-inheritable for free.** `getInheritableProperties` projects
  the resolved *own* map (plus controls); the fallback layer is not
  part of it. Children of an unset scope don't inherit the fallback —
  each scope re-yields its own, which is exactly what "default" should
  mean: scope-local, never a style fact.

### Fallback vs. defaults (`typeSpecDefaultsMap`)

The layers are adjacent but distinct in origin and destiny:

- **Defaults** are the root scope's *parent substitute* ("what would a
  parent say, if the root had one"), derived from
  `REGISTERED_PROPERTIES`. Crucially, they are also **seeded into the
  typeSpec model draft**, where they become real, editable, inheriting
  local style. Defaults are *pre-filled answers*.
- **Fallbacks** are every scope's own safety net: computed at
  resolution time, never model state, never inherited, never editable.
  Fallbacks are *the absence of an answer, made readable*.

Defaults apply to settable registered style properties (user knobs);
fallbacks apply to derived terminal keys that have no registry entry
and no UI. The defaults layer's cascade role stays untouched.

## Implementation Sketch

1. **`type-specnion.mjs`**: export the symbol; document the contract
   (see Constraints).
2. **`scope-resolution.mjs`**:
   - `collectPropertyGeneratorEntries`: third bucket keyed by
     `DEMARCATION_FALLBACK`.
   - Inheritance policy generators yielding `DEMARCATION_FALLBACK`:
     reject with the existing `console.error` + ignore idiom (same as
     the `DEMARCATION_PROPERTY` guard there).
   - `HierarchicalScopeProperties._initPropertyValuesMaps` (and
     `LocalScopeProperties`, for uniformity): build the fallback layer,
     add it to the effective `CascadingMap` between inherited and
     defaults.
   - Local resolution: synthetics may legitimately depend on
     fallback-valued keys (a synthetic computing from a margin only
     the fallback provided). Construct the resolution parent map as
     `CascadingMap([inherited, fallback, defaults])`.
   - `PatchedScopeProperties`: same layer treatment as the origin
     scope.
3. **Guard at collection time** (scope-resolution side, not in the
   demarcation-agnostic `collectPropertyGeneratorEntries`): reject
   fallback yields for keys that are *registered properties* —
   warn-and-ignore (`console.error`, `VALUE ERROR` prefix), following
   the codebase idiom. Rationale: registered properties are
   model-seeded with defaults, so a fallback there is permanently
   shadowed dead weight and signals "the author wanted a default." Add
   a non-throwing `hasRegisteredProperty(key)` lookup rather than
   wrapping `getFromRegistry` in try/catch.
4. **Consumer cleanup**: a new `inlineMarginsDefaultsGen` (first in
   the generator list for clarity, though order no longer matters)
   yields:

   ```js
   yield [`${GENERIC}inlineMargins/start/pt`, "0pt", DEMARCATION_FALLBACK];
   yield [`${GENERIC}inlineMargins/end/pt`, "0pt", DEMARCATION_FALLBACK];
   ```

   Then delete both `getDefault` hack branches in
   `type-spec.typeroof.jsx`.

## Constraints (review rules, not machine-checked)

- **Fallbacks only for terminal derived values** (`*/pt` CSS strings;
   conceivably unitless facts like `0`). Never for semantic
   intermediates (`inlineMargins/start`, `…/value`, `columnCount`,
   `blockMargins/*`): the node channel's generator-body input checks
   read *absence* as "not described"; a fallback there fakes a
   description and breaks fill semantics.
  - The registry guard (Implementation, point 3) covers the
    "default-covered property" half of this rule. It deliberately does
    **not** pattern-match key names (e.g. "must end in `/pt`") — that
    would hard-code today's naming convention into the mechanism and
    false-positive on legitimate future fallbacks.
- Fallbacks are plain values, not synthetics (first version; a
  synthetic fallback can come later if a real need appears).
- Initially a style-channel (typeSpecnion) feature. The node
  channel has its own defaulting idioms (fill semantics); don't grow
  fallback yields there without a demonstrated need.

## Risks / Notes

- Adding a cascade layer touches `_initPropertyValuesMaps`, on the hot
  path of every scope build. It is additive (one more `CascadingMap`
  entry) and does not change existing layers' behavior.
- The raw-map collision caveat at `availableSizesGen` (two generators
  yielding the same property; a later optional drop erasing an earlier
  resolvable entry) remains a raw-map-versus-raw-map issue.
  `DEMARCATION_FALLBACK` does not fix it — but fallbacks are no longer
  party to it, which removes the need for the resolver's
  restore-on-prune variant of this proposal.
- With the mechanism in place, the `typeSpecDefaultsMap`'s *cascade*
  role (parent substitute for root generator input-checks) could in
  theory be re-expressed as root-scope fallback yields. Out of scope:
  its model-seeding role is separate and stays.

## Context / History

Emerged from the horizontal-layout WIP: introducing a `ForeignKey.NULL`
default for the `horizontalLayout` registered property removed the
concrete Manual default that had been *masking* the absence of derived
`inlineMargins/*/pt` keys (the seeded `0 en` margins made the `/pt`
synthetics resolve everywhere). Each masked-absence removal along this
path (leading → fill geometry → inline margins) surfaced the same
pattern: consumer-side rescue where producer-side fallback is wanted.
