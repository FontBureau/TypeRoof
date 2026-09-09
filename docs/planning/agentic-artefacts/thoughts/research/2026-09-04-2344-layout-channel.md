---
date: 2026-09-04T23:44:39+02:00
git_commit: e012337f8a0a895cf4334268e833f1b05698da3a
branch: demo/wikipedia
repository: TypeRoof
topic: "Layout channel: DEMARCATION_LAYOUT + parent-node layout facts propagation"
tags: [research, codebase, type-specnion, layout-channel, inheritance]
status: complete
---

# Research: Layout channel (DEMARCATION_LAYOUT + parent-node layout facts)

## Research Question

How to implement the "layout channel": style inheritance (typeSpec→typeSpec) is
separate from layout propagation (document node→document node, e.g. a column
container's computed `column-width` becomes the child text node's available
width). Planned design (from session discussion):

- `LAYOUT = 'layout/'` string prefix (naming convention only, no registry
  entries), parallel to `GENERIC`/`SPECIFIC` in
  registered-properties-definitions.mjs
- `DEMARCATION_LAYOUT` symbol as a third routing bucket in
  `collectPropertyGeneratorEntries`
- `getLayoutFacts()` accessor on the typeSpecnion
- Child scopes receive parent layout facts as an extra input, merged:
  defaults < inherited < layoutFacts < local
- Update propagation rides the existing `typeSpecProperties@` cascade (parent
  typeSpecnion rebuild ⇒ layout facts recompute ⇒ children rebuild), so no new
  protocol channel is needed
- Root environment values become the degenerate depth-0 case of the same
  channel; `specific/root/*` naming may be retired in favor of `layout/*`

## Summary

The typeSpecnion is a per-typeSpec scope machine with a 2-bucket routing
(`DEMARCATION_PROPERTY` local / `DEMARCATION_INHERITANCE` controls) collected by
`collectPropertyGeneratorEntries` and resolved by
`LocalScopeTypeSpecnion.resolveSyntheticProperties`. A third bucket and a facts
map slot are mechanically feasible: the touch points are few and known (3
collect call sites, the 4-tuple return of `_initPropertyValuesMaps`,
`PatchedTypeSpecnion`, `_getParentMaps`). The parent→child transport problem is
already solved: children pull the parent's `TypeSpecLiveProperties` object via
the `@parentProperties` dependency mapping (structural path
`rootPath.append("..","..")`), and document-node widgets can compute the
parent's *effective* typeSpec path at runtime via the relative-link mechanism
(`_getTypeSpecPropertiesId(pathOfTypes.slice(0,-1))`). No test asserts on the
literal `specific/root` keys; the pane-sizing test observes the
environment→availableWidth pipeline behaviorally.

## Detailed Findings

### 1. TypeSpecnion core (`lib/js/components/layouts/type-stage/type-specnion.mjs`, 520 LOC)

- Demarcation symbols: `DEMARCATION_PROPERTY`, `DEMARCATION_INHERITANCE`,
  `TOMBSTONE` (:13-17). No other demarcations exist; unknown ones throw in
  `collectPropertyGeneratorEntries` (:60-64).
- `collectPropertyGeneratorEntries(propertiesGen, defaultDemarcation)` (:36-66)
  returns the 2-tuple `[propertyValuesMap, inheritanceControls]`. Call sites:
  `type-specnion.mjs:409` (policy gens, default INHERITANCE), `:497`
  (`_initPropertyValuesMaps`, default PROPERTY), `defaults.mjs:244` (defaults,
  PROPERTY, slot 1 discarded deliberately).
- `HierarchicalScopeTypeSpecnion` (:366-520): constructor args
  `(propertiesGenerators, typeSpec, parentTypeSpecnionOrTypeSpecDefaultsMap,
  inheritancePolicyGenerators)`; 3rd arg polymorphic (:378-381). Computes
  4-tuple `[_rawProperties, _localPropertyValuesMap, _propertyValuesMap,
  _inheritanceControls]` in `_initPropertyValuesMaps` (:487-519).
- `_getParentMaps()` (:468-485): root uses raw `typeSpecDefaultsMap` for both
  parent slots (FIXME :474-476); otherwise
  `parentTypeSpecnion.getInheritableProperties()`.
- `getInheritableProperties()` (:402-449): applies policy + explicit controls,
  tombstones withheld, control synthetics resolved against own settled
  properties with `allowParentOnlyResolution=true`.
- `PatchedTypeSpecnion` (:316-356): terminal derived view (no
  `parentTypeSpecnion`, children never descend through it); merges
  `filteredParent ++ (raw ++ patch)`. Sole caller:
  `live-properties.typeroof.jsx:341` (StyleLinkLiveProperties).
- `_BaseTypeSpecnion.getInheritableProperties()` defaults to `getProperties()`
  (:116-118) — a `getLayoutFacts()` accessor can follow the same pattern.
- `resolveSyntheticProperties` (:148-308): prune-loop for unresolvable
  synthetics (optional → drop, required → `UnresolvableDependenciesError`),
  then topological-sort resolution (Kahn in metamodel/topological-sort.ts;
  stale-edge guard added in e765ac75).

### 2. Construction & update lifecycle (`live-properties.typeroof.jsx`)

- `new HierarchicalScopeTypeSpecnion` production call sites (both here):
  child :82-87 (parent = `parentProperties.typeSpecnion`), root :134-140
  (parent = typeSpecDefaultsMap). Test call sites: type-specnion.test.mjs:92,94,203.
- `TypeSpecLiveProperties.update` rebuild triggers (:56-63): `typeSpec`,
  `@parentProperties`, `rootFont`, all `ENVIRONMENT_PROVIDER_ENTRIES`,
  `width`, `height`.
- Root defaults seeding (:90-142): environment values under
  `specific/root/environment/...` (:109-119), `specific/root/width|height`
  (:121-132). ⚠️ Mutation hazard: when no `rootFont` is wired, the seeding
  mutates `this._typeSpecDefaultsMap` in place (:119/:128) — `Object.freeze`
  on the Map does not prevent `.set()`; the copy at :105 (rootFont branch)
  shows the intent. Relevant if a layout-facts slot follows this pattern.
- `hasParentProperties` XOR (:44-48): defaults map iff no `@parentProperties`.
- On rebuild: `setUpdated` on `typeSpecProperties@` (:144-151) — this is the
  existing cascade that layout-facts propagation can ride.
- `defaults.mjs:164-253` `getTypeSpecDefaultsMap`: runs
  TYPE_SPEC_PROPERTIES_GENERATORS over the primal model, demarcation-routed
  (PROPERTY default), inheritance controls discarded (comment :239-243);
  would need to handle/discard a LAYOUT bucket the same way.

### 3. Parent→child transport (already solved)

Chain: parent `TypeSpecLiveProperties` (registrant of
`typeSpecProperties@<parentPath>`) → `@parentProperties` dependency mapping
(`meta.typeroof.jsx:215-222`, structural path `rootPath.append("..","..")`) →
child `update()` (`live-properties.typeroof.jsx:73-88`) → child's
`HierarchicalScopeTypeSpecnion`. Root omits `@parentProperties` deliberately
(`index.typeroof.jsx:324-327`).

Document-node widgets (viewer.typeroof.jsx):
- `nodeSpecToTypeSpec`: external model dep mapping node typeKey → link;
  relative links anchor at the parent node's resolved spec
  (integration.typeroof.jsx:218-232, recursive with `pathOfTypes.slice(0,-1)`).
- Parent's effective typeSpec path computable at child:
  `this._getTypeSpecPropertiesId(this._pathOfTypes.slice(0,-1), true)`;
  sibling-path precedent at viewer.typeroof.jsx:537-542.
- Caveat: viewer world resolves *effective* paths (fallback walk may land on
  an ancestor); meta world uses *structural* parent path. A layout channel
  keyed by path must pick one semantics.

### 4. Generator inventory (`properties-generators.mjs`, 748 LOC)

18 generators; full table in session notes. Layout-relevant:

- `environmentGen` (:53): forwards `specific/root/environment/<path>` as
  `specific/environment/<path>`; tombstones root key (:71, INHERITANCE).
- `availableSizesGen` (:81): reads `specific/root/{width,height}` + root env;
  yields `generic/availableWidth|Height` (plain, pt) + `generic/width|height`
  identity synthetics (explicit PROPERTY, :108-112); tombstones
  `specific/root/*` (:92-94).
- `horizontalLayoutRunion` (:553): yields inlineMargins/lineLength/columnGutter/
  columnCount locals + `/pt` synthetic variants (:577-589); inheritance
  re-routes `generic/width` ← `generic/availableWidth` (:648-652) and
  `generic/availableWidth` ← lineLength·0.5·fontSize (:658-666); lineLength
  tombstone commented out (:668).
- `inheritancePolicyGen` (:744-748): yields `[name, TOMBSTONE]` for every
  non-inheriting property per `isInheritingPropertyFn`
  (registered-properties.mjs:425); `specific/*` keys are unregistered →
  default inheriting → hence the explicit tombstones.

Generator lists: `TYPE_SPEC_PROPERTIES_GENERATORS` (:681-697, used by
type-stage + ramp + defaults.mjs), `STYLE_PATCH_PROPERTIES_GENERATORS`
(:704-721, stylePatch scopes — stubbed parent API, no typeSpecnion),
`TYPE_TOOLS_GRID_*` (type-tools-grid.mjs:1562-1590, no
environmentGen/availableSizesGen/horizontalLayoutRunion).

### 5. Consumers of the output maps

`getProperties()` consumers (all hold the live `TypeSpecLiveProperties`
object via protocol handler, no serialization): typeSpecGetDefaults
(defaults.mjs:90), StyleLinksMeta (meta.typeroof.jsx:152), TypeStagePaneStyler
(pane-styler.typeroof.jsx:41 — applies `generic/availableWidth|Height` as CSS
pt, :46-52), UIFontLabel, UIProcessedProperties (processed-properties.mjs:118,131),
typeToolsGridGetDefaults (type-tools-grid.mjs:1080), UIGrid, ProseMirror
stylers (type-spec.typeroof.jsx:122,157,282,292,799 — :150-160 walks the
`parentTypeSpecnion` chain blending backgrounds; :253 consumes
`generic/width`), language-tags UI, UIManualAxesLocations,
UIInheritedStyleLinksList. `getInheritableProperties()` and `createPatched`
are internal-only (+ tests). `generic/height` is yielded but consumed nowhere.

### 6. Test surface

- `type-specnion.test.mjs`: direct machinery unit tests (synthetic resolution,
  inheritance controls, tombstones, unresolvable drops/throws) with fake keys —
  primary observer of a new DEMARCATION_LAYOUT bucket.
- `type-stage-pane-sizing/index.test.mjs`: behavioral end-to-end of
  environment→`specific/root/environment`→availableSizesGen→`availableWidth`→CSS
  (asserts `"600pt"` etc.) — would break on renamed keys.
- `type-stage-toggles/harness.mjs:151-163`: registers `environment@` keys from
  `ENVIRONMENT_PROVIDER_KEYS`; `grid-range-axis/index.test.mjs:98-102` same
  pattern (but grid generator list lacks the env generators).
- No test asserts literal `specific/root` / `availableWidth` strings.
- `LAYOUT`/`layout/` prefix: does not exist anywhere; name is free.

## Code References (key touch points for implementation)

- `lib/js/components/layouts/type-stage/type-specnion.mjs:13-17` — demarcation symbols (add DEMARCATION_LAYOUT)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:36-66` — collectPropertyGeneratorEntries (3rd bucket)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:487-519` — _initPropertyValuesMaps 4-tuple (→ 5-tuple)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:468-485` — _getParentMaps (layout facts input slot)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:402-449` — getInheritableProperties (sibling: getLayoutFacts)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:316-356,461-465` — PatchedTypeSpecnion/createPatched (parallel merge or deliberate bypass)
- `lib/js/components/registered-properties-definitions.mjs:14-34` — prefix constants (add LAYOUT)
- `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:73-88,109-142` — child/root construction + defaults seeding (mutation hazard :119/:128)
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx:215-222` — @parentProperties structural path
- `lib/js/components/prosemirror/integration.typeroof.jsx:174-269` — parent effective path resolution
- `lib/js/components/layouts/type-stage/defaults.mjs:234-251` — defaults construction (discard LAYOUT bucket)
- `lib/js/components/layouts/type-stage/properties-generators.mjs:53-115,553-668` — environmentGen/availableSizesGen/horizontalLayoutRunion (rename specific/root→layout, re-demarcate layout facts)

## Open Questions

1. Path semantics for a node-addressed layout channel in the viewer world:
   structural (`rootPath.append("..","..")`) vs. effective/fallback-resolved
   (integration.typeroof.jsx walk) — must match whichever map the facts live on.
2. Merge precedence of layoutFacts vs. inherited vs. local in the child's
   `_propertyValuesMap` (session lean: defaults < inherited < layoutFacts < local).
3. Whether `specific/environment/*` (descendant-visible env keys) also renames
   to `layout/*`, or only the `specific/root/*` segment.
4. `PatchedTypeSpecnion`: does a style patch ever need to override a layout
   fact (e.g. patched width)? Currently it bypasses origin inheritance
   controls; layout facts likely bypass too, but decide explicitly.
5. Does `inheritancePolicyGen` need to learn about the layout bucket
   (tombstoning layout facts for non-inheriting names), or do layout facts
   have their own pass-down discipline?
