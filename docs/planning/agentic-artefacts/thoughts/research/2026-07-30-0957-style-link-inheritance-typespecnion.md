---
date: 2026-07-30T09:57:00+02:00
git_commit: cd05af513ab0dc34e1f065a47c178bc160c7352a
branch: demo/wikipedia
repository: TypeRoof
topic: "Inheritance of style-links in TypeSpecs via the typeSpecnion (incl. NULL-STYLE tombstone)"
tags: [research, codebase, typespec, typespecnion, style-links, style-patches, inheritance, tombstone]
status: complete
---

# Research: Style-Link Inheritance in TypeSpecs via the TypeSpecnion

## Research Question

The feature to implement: **inheritance of style-links in TypeSpecs via the
typeSpecnion**. Requirements stated by the operator:

- Style-links must propagate down the TypeSpec parent/child tree.
- Propagation must be stoppable: a **tombstone/null value** explicitly stops
  inheritance. An explicit NULL-STYLE already exists, so it is "rather a
  matter of not propagating the link when that value is set".
- A child entry can **override** an existing (inherited) value.
- Reference points: the just-archived rpi plans (commit `cd05af51`) and
  `lib/js/components/layouts/type-stage/properties-generators.mjs`.

## Summary

- **Style-links are edges** stored per TypeSpec in `TypeSpecModel.stylePatches`
  (a `StylePatchLinksMapModel`, `type-spec-models.mjs:402`). The **edge key**
  is the link name (matched against a mark's `data-style-name`); the **edge
  value** is a `StylePatchLinkModel` struct `{stylePatch, type, tag, mark}`
  where `stylePatch` is a nullable key into the global `StylePatchesMapModel`
  and **`''` is the explicit NULL-STYLE** (`type-spec-models.mjs:291`,
  `type-spec-fundamentals.mjs:192`).
- **Resolution is local-only today**: `getStylePatchLinkForMark` /
  `getStylePatchTagForIntent` (`type-spec-models.mjs:410-437`) look only at
  the node's own `stylePatches` map; the parent's edges are never consulted.
- **The typeSpecnion already implements exactly the required inheritance
  mechanics** for scalar properties: `HierarchicalScopeTypeSpecnion`
  (`type-specnion.mjs:245`) merges *filtered parent properties* under *local
  properties* — local wins (`type-specnion.mjs:329-334`) — gated by an
  `isInheritingPropertyFn` (`registered-properties.mjs:382`).
- **Null semantics already exist in two flavors** (`type-specnion.mjs`):
  a literal local `null` *shadows* the parent value (tombstone-like), while
  a `SyntheticValue` that *resolves to* `null` is deleted and lets
  inheritance through (`:154-168`). Generators use `yield [path, null]` as
  a local placeholder only when the parent lacks the path
  (`properties-generators.mjs:139,182`).
- **This feature was explicitly postponed** in the archived semantic-marks
  plan: *"Resolution (edge visibility at a node) walks up the TypeSpec parent
  chain; children override by redefining the same edge key — follows the
  existing typeSpecnion inheritance pattern."* (operator decision 2026-07-28,
  `docs/planning/agentic-artefacts/thoughts/plan/2026-07-26-2130-prosemirror-semantic-marks.md:335-341`).
- **Runtime application of a style-link** happens in
  `StyleLinkLiveProperties` (`live-properties.typeroof.jsx:257-318`): the
  linked StylePatch's `propertyValuesMap` is merged over the TypeSpec's
  typeSpecnion via `createPatched()` and published as a
  `styleLinkProperties@` protocol handler, consumed by the type-stage viewer
  and the ProseMirror stylers.

## Detailed Findings

### 1. The style-link data layer (what would be inherited)

- `StylePatchKeyModel` / `StylePatchKeysModel` / `StylePatchLinkModel` /
  `StylePatchLinksMapModel` — `lib/js/components/type-spec-models.mjs:264-313`.
  `StylePatchLinkModel` (:296) has field `['stylePatch', StylePatchKeyModel]`
  plus sanitized link-target attrs via `sanitizeStylePatchLink({type, tag, mark})`
  (:304). The edge struct gained `type` (`generic-tag`|`mark`) + `tag`/`mark`
  in the semantic-marks plan (edge-located typed target, decided 2026-07-28).
- Comment block documenting the concept at `type-spec-models.mjs:266-294`:
  *"This links the StylePatches from the StylePatchesMapModel into the
  TypeSpecs"*; `:291`: `stylePatch: key into the StylePatchesMapModel
  ("" = NULL-STYLE)`.
- `TypeSpecModel` struct — `type-spec-models.mjs:377-402`:
  - `:389` — `['children', ... TypeSpecModelMap]` recursive self-reference:
    **this is the parent/child tree the inheritance must walk**.
  - `:391` — `['stylePatchesSource', InternalizedDependency]`.
  - `:402` — `['stylePatches', StylePatchLinksMapModel]`: the style-links field.
  - `:396-399` — comment: "if the key does not exist it's a null style, no
    need to set null" (current local-only semantics; inheritance changes the
    meaning of an *explicit* `''` from "no link" to "stop propagation").
- Local-only resolvers:
  - `getStylePatchLinkForMark(stylePatches, mark)` — `type-spec-models.mjs:410-424`.
  - `getStylePatchTagForIntent(stylePatches, styleName)` — `type-spec-models.mjs:426-437`.
- NULL-STYLE in the UI: `EMPTY_STYLE_LINK_LABEL = '(NULL-STYLE)'`
  (`type-spec-fundamentals.mjs:192`), wired as allowNull option
  `[true, EMPTY_STYLE_LINK_LABEL, '']` at `:282` and `:607` — confirming the
  **model value of NULL-STYLE is the empty string `''`**.

### 2. The typeSpecnion inheritance machinery (the vehicle)

Name: portmanteau "TypeSpec + Onion" — stacked layers, inner layers read
outer layers (`type-specnion.mjs:237-243`). All in
`lib/js/components/layouts/type-stage/type-specnion.mjs`:

- `_BaseTypeSpecnion` (:11) — lazy throwing getters for
  `_localPropertyValuesMap`/`_propertyValuesMap`; `getProperties()` (:50),
  `getOwnProperty(name, default)` (:53, local-only), `localPropertyNames` (:63).
- `LocalScopeTypeSpecnion` (:75) — statics only: `propertiesGenerator` (:174)
  runs all generators chained, exposing `outerTypespecnionAPI` with
  `hasParentProtperty`/`getParentProperty` bound to the parent map (:179-186);
  `initPropertyValuesMap` (:194) resolves synthetics;
  `resolveSyntheticProperties` (:76-172).
- `HierarchicalScopeTypeSpecnion` (:245) — constructor
  `(propertiesGenerators, typeSpec, parentTypeSpecnionOrTypeSpecDefaultsMap,
  isInheritingPropertyFn = null)` (:246-251). Root gets a defaults map
  instead of a parent (:257-260).
- `PatchedTypeSpecnion` (:203) — created by `createPatched(
  stylePatchPropertyValuesMap)` (:281-287); merges patch **on top of raw
  properties before synthetic resolution** (:215-225), so synthetics
  depending on patched keys recompute.

Inheritance merge (eager, at construction):

```js
// type-specnion.mjs:329-334 — "All properties in local override properties in parent"
propertyValuesMap = mapSetProperties(
    new Map(),
    filteredParentPropertyValuesMap,   // parent, inheriting keys only
    localPropertyValuesMap,            // local wins on key collision
);
```

- Parent filter: `_getParentMaps` (:297-313) filters the parent's merged map
  through `_isInheritingProperty` (:289-295; default: everything inherits).
- The injected `isInheritingPropertyFn` lives at
  `lib/js/components/registered-properties.mjs:382`.
- Merge primitive: `mapSetProperties` (:4-9) — later sources overwrite
  earlier keys in one `Map`.

SyntheticValue arg resolution precedence (:140-153): 1) already-resolved
local, 2) parent map, 3) unresolvable → drop. If **zero** local dependencies
or not all args resolve, the synthetic is dropped (`:154-162`), confirmed by
`type-specnion.test.mjs:6-38`.

Instantiation sites:

- `live-properties.typeroof.jsx:75` — child layer per TypeSpec node
  (`parentProperties.typeSpecnion` as parent).
- `live-properties.typeroof.jsx:102` — root layer with `typeSpecDefaultsMap`.
- `live-properties.typeroof.jsx:308` — style-link patch application via
  `createPatched(...)` (only when the patch map is non-empty, :306-311).

### 3. Null/tombstone semantics that already exist

Two distinct behaviors in `type-specnion.mjs`:

1. **Literal local `null` shadows the parent.** There is no null-check in
   `_getParentMaps`/`_initPropertyValuesMaps`; a local `null` entry is set
   into the merged map like any value and therefore **overrides** the
   inherited value. Generators exploit this as "optional, not set" placeholders:
   - `languageTagGen` — `properties-generators.mjs:124-141`: yields
     `[path, null]` for empty subtags **only if** `!outerTypespecnionAPI.hasParentProtperty(path)`;
     comment: "null will also not be inherited."
   - `marginsGen` — `properties-generators.mjs:175-184`: "same rationale as
     in languageTagGen".
   These are the only two `yield [..., null]` sites in `lib/js`.
2. **Synthetic resolving to `null` is deleted** (`type-specnion.mjs:164-168`),
   so it does *not* shadow the parent — inheritance passes through.

Related metamodel primitives:

- `ForeignKey.NULL` — `lib/js/metamodel/foreign-key.ts:44-85`
  (`FOREIGN_KEY_NULL = Symbol("NULL")`); `metamodel.mjs` is now a one-line
  re-export of `metamodel/metamodel.ts`.
- Link resolution returns `ForeignKey.NULL` for unset keys —
  `lib/js/metamodel/struct-model.ts:1466-1483` (`_getLink`), init-time at
  `:1013-1030`; consumer check pattern: `font !== ForeignKey.NULL`
  (`properties-generators.mjs:30-37`).
- `FallBackValue`: primary wins, fallback only when primary is
  `ForeignKey.NULL` — `struct-model.ts:1047-1059`.

**Implication for the feature:** the "explicit NULL-STYLE stops propagation"
requirement maps onto behavior (1): a child edge whose `stylePatch` value is
`''` (NULL-STYLE) must be treated as a *set* entry that shadows the parent's
edge of the same key — not as an absent entry. Today's local-only comment
"if the key does not exist it's a null style, no need to set null"
(`type-spec-models.mjs:396-399`) describes exactly the semantic that
inheritance will change: an *explicit* `''` gains override power (it stops
the inherited patch link). NOTE, clarified 2026-07-30 (see Addendum): `''`
is NOT the tombstone -- the tombstone removes the edge entirely (state 3),
while `''` keeps it available-but-unstyled (state 2).

### 4. Runtime application of style-links (consumers of resolution)

- `StyleLinkLiveProperties` — `live-properties.typeroof.jsx:257-318`:
  `update()` merges the style patch's `propertyValuesMap` via
  `typeSpecProperties.typeSpecnion.createPatched(...)` (:288-318) and
  publishes the `styleLinkProperties@` protocol handler.
- `StyleLinksMeta` — `layouts/type-stage/meta.typeroof.jsx:55-200`: dynamic
  map container registering per-edge `styleLinkProperties@` handlers (:78,:90);
  comment at :72: "key is an empty string in case of (NULL-STYLE)".
- Protocol-handler creation/registration: `layouts/type-stage/index.typeroof.jsx:219,519,531`;
  also `layouts/ramp/index.typeroof.jsx:287,440,452`.
- Consumers:
  - type-stage viewer: `viewer.typeroof.jsx:262-366` (`_createStylerWrapper`,
    `_getStyleLinkPropertiesId`; null → plain wrapper).
  - ProseMirror: `prosemirror/type-spec.typeroof.jsx:865-905, 922-968,
    1425-1471` (`_getStyleLinkPropertiesId`, `_createStyleStylerWrapper`,
    subscription swap when the id changes); `_finalizeMarkSubscription`
    (:911) resolves `data-style-name` → edge key → StylePatch properties.
- Chain walker example: `type-spec.typeroof.jsx:143-155` walks
  `parentTypeSpecnion` chains calling `getProperties()`.

### 5. Prior decision record (archived plans)

- `docs/planning/agentic-artefacts/thoughts/plan/2026-07-26-2130-prosemirror-semantic-marks.md`
  - :184-204 — "TypeSpecs style nodes; StylePatches style marks. The link is
    the edge." Edge key matched against `data-style-name`; edge value =
    key into global `stylePatches` map (nullable, "FOREIGN_KEY_NO_ACTION").
  - :309-333 — DECIDED (2026-07-28): edge-located typed target; edge struct
    gains `type` (`generic-tag`|`mark`) + `tag`/`mark`.
  - :335-341 — **Postponed: Style-link inheritance through the TypeSpec
    parent tree.** Operator decision (2026-07-28): resolution walks up the
    TypeSpec parent chain; children override by redefining the same edge key;
    follows the existing typeSpecnion inheritance pattern. Motivation:
    document-wide defaults + local overrides for style→tag binding.
- `docs/planning/agentic-artefacts/thoughts/plan/2026-07-29-2234-editable-element-attr-replay.md:96`
  — confirms style-link inheritance still postponed as of 2026-07-29.

### 6. properties-generators.mjs — patterns relevant to the implementation

`lib/js/components/layouts/type-stage/properties-generators.mjs` (400 lines)
defines the generator pipeline (`TYPE_SPEC_PROPERTIES_GENERATORS` :330-343,
`STYLE_PATCH_PROPERTIES_GENERATORS` :350-398). Patterns a style-link
generator would follow:

- Generators are `function*` yielding `[propertyName, value]`; chained by
  `LocalScopeTypeSpecnion.propertiesGenerator`.
- They read the host model (`hostInstance.get(...)`) and may consult the
  parent via `outerTypespecnionAPI.hasParentProtperty(path)` /
  `getParentProperty(path)` (used in `languageTagGen` :124, `marginsGen`
  :153, `leadingGen` :234-258 — the latter re-emits a computed value when an
  *inherited* algorithm requires recalculation with local inputs).
- `getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPESPEC_FIELDS)`
  (:327-329) is the generic catch-all pattern for simple registered fields.
- Registry of inheriting properties: `registered-properties-definitions.mjs`
  (`SPECIFIC`, `GENERIC`, ... prefixes) + `registered-properties.mjs:382`
  (`isInheritingPropertyFn`) — style-link property paths would need to enter
  this system if inheritance flows through the properties stream.

## Code References

- `lib/js/components/type-spec-models.mjs:264-313` — style-link edge models (`StylePatchLinkModel`, `StylePatchLinksMapModel`); `:291` `"" = NULL-STYLE`
- `lib/js/components/type-spec-models.mjs:377-402` — `TypeSpecModel` (`children` :389, `stylePatches` :402); `:396-399` local-only null-style comment
- `lib/js/components/type-spec-models.mjs:410-437` — local-only resolvers `getStylePatchLinkForMark`, `getStylePatchTagForIntent`
- `lib/js/components/type-spec-fundamentals.mjs:192,282,607` — `EMPTY_STYLE_LINK_LABEL`, allowNull wiring; :195-721 style-link UI widgets
- `lib/js/components/layouts/type-stage/type-specnion.mjs:4-9` — `mapSetProperties` merge primitive
- `lib/js/components/layouts/type-stage/type-specnion.mjs:76-200` — synthetic resolution (local-over-parent args :140-153; null-result deletion :164-168)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:203-244` — `PatchedTypeSpecnion` (patch over raw props, pre-resolution)
- `lib/js/components/layouts/type-stage/type-specnion.mjs:245-336` — `HierarchicalScopeTypeSpecnion` (parent filter :297-313; local-over-parent merge :329-334)
- `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:75,102,257-318` — typespecnion instantiation; `StyleLinkLiveProperties`
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx:55-200` — `StyleLinksMeta` protocol-handler registration
- `lib/js/components/layouts/type-stage/properties-generators.mjs:124-141,175-184` — `yield [path, null]` placeholder pattern
- `lib/js/components/registered-properties.mjs:382` — `isInheritingPropertyFn`
- `lib/js/metamodel/foreign-key.ts:44-85` — `ForeignKey.NULL`; `lib/js/metamodel/struct-model.ts:1466-1483` — `_getLink`
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:911,143-155` — mark subscription resolution; parent-chain walker
- `docs/planning/agentic-artefacts/thoughts/plan/2026-07-26-2130-prosemirror-semantic-marks.md:335-341` — postponed feature decision

## Open Questions

1. **Merge level**: should inherited style-links merge (a) at the *model*
   level — an "effective StylePatchLinksMap" computed by walking
   `TypeSpecModel.children` parents — or (b) through the *typeSpecnion
   properties stream* — a new generator yielding one property path per edge
   (e.g. `styleLinks/<key>/...`) so the existing filter/merge/tombstone
   machinery applies verbatim? Option (b) matches the operator's "via the
   typespecnions" phrasing and reuses `isInheritingPropertyFn`, but requires
   registering the new property paths and deciding how `StyleLinkLiveProperties`
   / `StyleLinksMeta` consume merged edges instead of the local map.
2. **Tombstone representation**: is the child's `''` (NULL-STYLE) edge value
   sufficient as the stop-propagation marker for all edge attrs (`type`,
   `tag`, `mark`), or must each sub-value be independently tombstoned?
3. **Override granularity**: does a child redefining edge key `K` replace the
   whole inherited struct, or merge field-wise (e.g. inherit `stylePatch`
   but override `tag`)?
4. **Protocol-handler churn**: `styleLinkProperties@` handlers are registered
   per local edge (`meta.typeroof.jsx:78,90`); with inherited edges the set
   of visible edges at a node grows — how do registration/unregistration and
   subscriber notification (e.g. ProseMirror's `_getStyleLinkPropertiesId`
   swap, `type-spec.typeroof.jsx:1425-1471`) react to a *parent's* edge
   changing?
5. **UI**: how should inherited vs. local vs. tombstoned edges be displayed
   in `UIStylePatchesLinksMap` (`type-spec-fundamentals.mjs:570`); the
   `settings:dependencyMapping` + `stylePatchesSource` plumbing (:712-721)
   may need an inherited-edges source.
6. **Ramp layout**: `layouts/ramp/index.typeroof.jsx:287,440,452` also
   registers style-link handlers — does the ramp participate in the same
   inheritance, or is this type-stage-only?
## Addendum 2026-07-30: Is NULL-Style a good tombstone? (investigation + decisions)

### What `key -> NULL-Style` (`stylePatch: ''`) does at runtime today

- **The style stays available**: `StyleLinksMeta._getWidgetSetup`
  (`meta.typeroof.jsx:62-90`) creates a `StyleLinkLiveProperties` wrapper
  for EVERY edge, including `''` (comment :71-74: "key is an empty string in
  case of (NULL-STYLE) ... 'bold' is available"). The dependency resolves to
  null -> empty map -> `size === 0` -> no `createPatched()`; the BASE
  typeSpecnion is published (`live-properties.typeroof.jsx:299-311`).
  So `styleLinkProperties@<.../stylePatches/key>` IS registered.
- **Consumers distinguish available-unstyled from not-available** via
  `hasRegistered(id)` (`viewer.typeroof.jsx:296-313`,
  `prosemirror/type-spec.typeroof.jsx:871-890`): edge exists ->
  `UIDocumentStyleStyler` + element with `data-style-name`; no edge ->
  `UIDocumentUnkownStyleStyler` resp. degradation to a plain text node
  (`viewer.typeroof.jsx:264-269`).
- **`''` can carry semantics while unstyled**: the edge's `type`/`tag`/`mark`
  fields are independent of `stylePatch`; `getStylePatchTagForIntent`
  (`type-spec-models.mjs:426-437`) binds the HTML tag from the edge alone.
  `quote -> {stylePatch: '', type: generic-tag, tag: 'q'}` = "available,
  renders as <q>, not visually styled".

### Three states per edge key (not two)

| state | handler registered? | styling | encoding today |
|---|---|---|---|
| linked | yes | patched typeSpecnion | `stylePatch: '<key>'` |
| available, unstyled | yes | base typeSpecnion | `stylePatch: ''` (NULL-STYLE) |
| not available (unknown-style fallback / text node) | no | -- | only as edge ABSENCE |

With inherited (merged) parent edges, absence is no longer locally
expressible. The tombstone's real job is therefore to encode state 3
("edge removed at this subtree") -- genuinely different from state 2.
Verdict: using NULL-Style (`''`) as the tombstone would be an overload;
two distinct behaviors need two distinct encodings.
### Operator decisions (2026-07-30)

1. **Whole-edge override (DECIDED for v1)**: a child redefining edge key `K`
   replaces the parent's struct ENTIRELY (`stylePatch`, `type`, `tag`,
   `mark` and all future fields). With this, `stylePatch: ''` in the child
   already stops the inherited PATCH LINK as a natural side effect of
   overriding -- no special tombstone needed for state 2.
2. **Field-wise override POSTPONED** (future possibility, e.g. inherit `tag`
   but override `stylePatch`): not needed yet. The per-field tombstone
   question it would raise (e.g. `tag: ''` already means "no binding",
   `type-spec-models.mjs:436`) is deferred together with it.
3. **Tombstone = state 3 is REQUIRED in v1** (clarified 2026-07-30):
   the tombstone REMOVES key `K` entirely from the style-links visible at
   the child TypeSpec -- `K` is not an entry in the child's (inherited)
   style-links at all, it is simply not set. Consequences: no
   `styleLinkProperties@` handler registration for `K` (suppress it in
   `StyleLinksMeta`), consumers take the unknown-style fallback
   (`UIDocumentUnkownStyleStyler` / plain text node), and `K` must not
   propagate further down the subtree. **NULL-Style (`''`) is NOT the
   tombstone and NOT a replacement for it** -- `''` keeps `K` available
   but unstyled (state 2), the tombstone makes `K` unavailable (state 3).
   The tombstone therefore needs its own distinct encoding on the edge
   struct (e.g. a `mode`/`unlinked` field, design deferred to the plan
   phase). The tombstone does NOT propagate itself (clarified 2026-07-30):
   it is consumed at the level where it is defined -- `K` is absent from
   that child's EFFECTIVE style-links, and that absence is what descendants
   inherit. A descendant can re-link `K` by defining the edge again.

### Impact on Open Questions (updates)

- Q2 (tombstone representation): ANSWERED semantically -- the tombstone
   is state 3: `K` removed entirely from the child's visible style-links,
   distinct from NULL-Style `''` (state 2, available-unstyled). OPEN: the
   concrete encoding of the tombstone marker on the edge struct (plan phase).
- Q3 (override granularity): ANSWERED -- whole-edge override for v1;
   field-wise merge deferred as a future extension.
