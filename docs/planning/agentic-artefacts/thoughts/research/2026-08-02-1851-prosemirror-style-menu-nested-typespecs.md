---
date: 2026-08-02T18:44:44+02:00
git_commit: 96aa379d135ced48e93f23e9fda2e90a89f0836b
branch: demo/wikipedia
repository: TypeRoof
topic: "UIProseMirrorMenuStyles shows no style-link buttons with nested type-specs"
tags: [research, codebase, prosemirror, style-links, typespecnion, inheritance]
status: complete
---

# Research: UIProseMirrorMenuStyles shows no style-link buttons with nested type-specs

## Research Question

The style chooser `UIProseMirrorMenuStyles` in `lib/js/components/prosemirror/type-spec.typeroof.jsx`
(loaded via `UIProseMirrorMenu`) no longer shows style-link buttons when type-specs are nested.
Style links became inheritable in the 2026-07-30/31 sprints and are now read from the typeSpecnion
(`typeSpecProperties@...`); the menu was not updated in that sprint. Research and plans for the
breaking updates live in `docs/planning/agentic-artefacts/thoughts/`.

## Summary

`UIProseMirrorMenuStyles.updateView` is the **only remaining consumer that reads the raw local
model field** `typeSpec.get("intentStyleLinks")` (`type-spec.typeroof.jsx:1869`). Every other
consumer was migrated in the inheritance/two-map sprints to read the **effective (inherited) set**
via `getStyleLinks(typeSpecLiveProperties.typeSpecnion.getProperties(), prefix)`
(`registered-properties-definitions.mjs:42-48`), reached through the `typeSpecProperties@<path>`
protocol handler.

Since commit `96aa379d` ("[type-stage-initial-state] inherit style-links from origin type-spec,
put h1 to h3 and p1 to p2 into a hierarchy"), the shipped initial state keeps the style links on
the **root** type-spec and nests h1–h3/p1–p2 as children **without local `intentStyleLinks`**.
When the cursor is inside such a nested node, `getTypeSpecsMethod` correctly resolves the nested
typeSpec (`typeSpecProperties@/activeState/typeSpec/children/{key}`), but that typeSpec's local
`intentStyleLinks` map is empty → `allStylesSuperSet` is empty → no buttons are rendered.

None of the four planning/research documents of the inheritance and two-map sprints lists
`UIProseMirrorMenuStyles` (or any ProseMirror *menu*) as a call-site to update — the inventory
covered only the styler/subscription path. The menu is a gap in those breaking-update lists.

## Detailed Findings

### 1. The style menu and its data flow

- `UIProseMirrorMenuStyles` — `lib/js/components/prosemirror/type-spec.typeroof.jsx:1728`.
  `updateView(view)` (:1852-1943) builds:
  - `typeSpecs` = `this._getTypeSpecs(state)` → a `Map<TypeSpecModel, Path>`,
  - per typeSpec: `intentStyleLinks = typeSpec.get("intentStyleLinks")` (:1869) — **raw local field**,
  - `allStylesSuperSet` = union of keys (these become buttons, :1917-1933),
  - `commonSubSet` = intersection across typeSpecs (buttons disabled unless in every set, :1928).
- Method bindings: `_getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod`,
  `_getTypeSpecs = getTypeSpecsMethod` (:1829-1830), imported from
  `lib/js/components/prosemirror/integration.typeroof.jsx:51-52`.
- Instantiation: `UIProseMirrorMenu` (:1988-2020) declares the widget with dependencies
  `["typeSpec", "nodeSpecToTypeSpec"]` and constructor args `originTypeSpecPath, "Styles:"`
  (:2002-2009). It extends `_IDPublisherMixin` (:1959-1986), which forwards `updateView`/
  `destroyView` to the child widgets by ID and caches the initial forward until the first
  `_update` (lifecycle fix, comment :1965-1967).
- Trigger paths:
  - ProseMirror plugin: `ProseMirror._menuPlugin()` (`integration.typeroof.jsx:780-794`) →
    `ProseMirrorMenuView` (:424-436) calls `updateView(view, prevState)` on every PM state update.
  - Model changes: `UIProseMirrorMenuStyles.update(changedMap)` (:1946-1953) re-runs
    `updateView` when `changedMap.has("typeSpec")` (comment notes typeSpecs are re-read from
    `editorView.state`, not from the changed entry).
- Menu widget creation: `lib/js/components/layouts/type-stage/prosemirror.typeroof.jsx:90-97`
  ("IMPORTANT: must be before ProseMirror").

### 2. How typeSpecs are resolved (`typeSpecProperties@`)

- `getTypeSpecsMethod(state)` — `integration.typeroof.jsx:155-177`: for an empty non-cursor
  selection returns an empty Map; otherwise `getPathsOfTypes` (:56-84, on `getPathOfTypes`
  :27-47) walks `doc.nodesBetween` over the selection ranges (skipping `"text"`, not entering
  inline atoms) and resolves each path-of-types via
  `this._getTypeSpecPropertiesId(pathOfTypes, /*asPath*/ true)`, then `this.getEntry(typeSpecPath)`.
- `getTypeSpecPropertiesIdMethod` — `integration.typeroof.jsx:130-153`: takes the innermost PM
  type name, looks up its relative `link` in the `nodeSpecToTypeSpec` map (`""` if unmapped),
  fetches the `typeSpecProperties@` protocol-handler implementation, delegates to
  `_getBestTypeSpecPropertiesId` (:86-128) with `this._originTypeSpecPath`.
- `_getBestTypeSpecPropertiesId` (:86-128): builds `testPath` from the origin path + link parts
  (inserting `children` when the link doesn't start with it), then **walks upward** stripping
  `children/{key}` pairs (`testPath.slice(0, -2)`) until
  `protocolHandlerImplementation.hasRegistered("typeSpecProperties@${testPath}")` hits; fallback
  is the origin path. So nested links resolve to the deepest *registered* typeSpec on the path.
- Handler registration: `SimpleProtocolHandler.create("typeSpecProperties@")` at
  `layouts/type-stage/index.typeroof.jsx:205-207` (ramp: `layouts/ramp/index.typeroof.jsx:273-275`);
  `originTypeSpecPath = widgetBus.rootPath.append(".", "typeSpec")` (:201-204).
  `TypeSpecMeta` (`layouts/type-stage/meta.typeroof.jsx:261`, settings at :272) registers
  `typeSpecProperties@<rootPath>` per typeSpec; `TypeSpecChildrenMeta` (:191-247) recurses into
  `children/{key}`. Registration mechanics: `component.mjs:288-291, 728-746`.
- Resulting identifiers: root → `typeSpecProperties@/activeState/typeSpec`; nested →
  `typeSpecProperties@/activeState/typeSpec/children/{key}` (deeper pairs for grandchildren).

**Consequence for the menu:** with nested type-specs the resolved typeSpec is the *child*, whose
local `intentStyleLinks` is empty by design (inheritance). The upward walk in
`_getBestTypeSpecPropertiesId` only compensates for *unregistered* paths, not for registered
children with empty local maps — so the menu sees the child and finds no styles.

### 3. The inheritance model (what the menu missed)

- Model: `TypeSpecModel` fields `intentStyleLinks` (`IntentStyleLinksMapModel`) and
  `markStyleLinks` (`MarkStyleLinksMapModel`) — `lib/js/components/type-spec-models.mjs:431-432`.
  Intent edge struct: `{stylePatch ('' = NULL-STYLE), mode ('link'|'unlinked'), tag}` (:315-325);
  mark edge: `{stylePatch, mode}` (:326-331). Coherence fn clears `stylePatch` when
  `mode !== 'link'` (:307-313). Inheritance semantics documented on the field (:420-427).
- Inheritance flows through the **typeSpecnion properties stream**, not by merging model maps:
  - `styleLinksGen` — `layouts/type-stage/properties-generators.mjs:357-367` (registered in
    `TYPE_SPEC_PROPERTIES_GENERATORS` :392) yields `intentStyleLinks/<key>` /
    `markStyleLinks/<key>` per edge; `mode === "unlinked"` yields literal `null` (tombstone).
  - Prefixes `INTENT_STYLE_LINKS` / `MARK_STYLE_LINKS` —
    `registered-properties-definitions.mjs:31-32`, deliberately unregistered so they inherit by
    default (comment :26-30).
  - Merge: `HierarchicalScopeTypeSpecnion` (`layouts/type-stage/type-specnion.mjs:245`) puts
    filtered parent properties under local ones (`mapSetProperties`, :315-332): whole-edge
    override, local `null` shadows (tombstone; "the absence is the inheritance").
- The effective-set accessor: **`getStyleLinks(propertyValuesMap, prefix)`** —
  `registered-properties-definitions.mjs:42-48`; doc comment (:37-41) names the intended
  consumers: "StyleLinksMeta, the ProseMirror resolvers and the UI inherited-links list".
- Existing effective-set consumers (all via `typeSpecnion.getProperties()`):
  - ProseMirror rendering: `_getEffectiveStyleLinks(typeSpecProperties, prefix)` —
    `type-spec.typeroof.jsx:858-876`, used by `_getStylePatchLinkForMark` (:882-899) and
    `_resolveIntentTag` (:903); `_finalizeMarkSubscription` picks the map by mark kind.
  - `StyleLinksMeta` — `layouts/type-stage/meta.typeroof.jsx:122-131,151`, instantiated per
    family at :296-310.
  - Inherited-links UI: `_UIInheritedStyleLinksListBase.update` —
    `type-spec-fundamentals.mjs:817-846` (`getStyleLinks` at :828, skips keys in
    `localStyleLinks` at :832).
- Serialized form: ordered-map pairs, e.g. `lib/assets/type-stage-initial-state.json:97-113`.
  Field excluded from type-driven UI sections (`type-spec-properties.typeroof.jsx:291`) and from
  the defaults map (`defaults.mjs:150-151`).

### 4. The planning documents and their breaking-update lists

All four docs form one thread (research → plan, both sprints implemented, checkboxes ticked):

- `thoughts/research/2026-07-30-0957-style-link-inheritance-typespecnion.md` — establishes
  inheritance through the typeSpecnion, three states per edge (linked / NULL-STYLE `''` /
  absent), whole-edge override, tombstone required.
- `thoughts/plan/2026-07-30-1422-style-link-inheritance.md` — **implemented** (tests 83→88,
  manual criteria confirmed 2026-07-30). Phase 3 explicitly migrated the ProseMirror *resolvers*
  (`type-spec.typeroof.jsx:855-869`) to the effective map.
- `thoughts/research/2026-07-31-2036-two-map-style-links.md` — two-map split rationale;
  full consumer inventory (models, properties stream, runtime, UI).
- `thoughts/plan/2026-07-31-2156-two-map-style-links.md` — **implemented** (tests 86→89,
  confirmed 2026-08-01). Breaking updates: model split, resolver contract change (return `null`),
  3 serialized JSON states renamed `"stylePatches"` → `"intentStyleLinks"`.

**Gap:** none of the four documents mentions `UIProseMirrorMenuStyles`, `UIProseMirrorMenuBlocks`,
`UIBoldItalicMenu`, or any ProseMirror *menu*. The PM call-sites they list are exclusively the
styling/subscription layer (`_getEffectiveStyleLinks`, `_getStylePatchLinkForMark`,
`_resolveIntentTag`, `_getStyleLinkPropertiesId`, `_finalizeMarkSubscription`) and the MarkView
in `integration.typeroof.jsx`.

### 5. Relevant commits

- `f7fa559b` 2026-07-30 [ProseMirror] resolve style-link edges from the effective (inherited) set
- `26f047cc` 2026-07-30 [UI] style-link tombstone via unified select + inherited links list
- `4574e240` 2026-07-31 [type-spec-models] split style-links into intentStyleLinks + markStyleLinks
- `6d9394b6` 2026-07-31 [typeSpecnion] two style-link families in the properties stream + delivery
- `b48b0f48` 2026-07-31 [ProseMirror] resolve intents and schema marks from their own maps
- `d173784b`, `c3e91be5`, `5c068feb`, `165cefb3` — two-map UI + refactors
- `96aa379d` 2026-08-02 [type-stage-initial-state] inherit style-links from origin type-spec —
  **the commit that made the menu gap visible** (h1–h3, p1–p2 nested, links only on the root)

## Code References

- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1728` — `UIProseMirrorMenuStyles`
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1869` — stale raw-field read `typeSpec.get("intentStyleLinks")`
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1852-1943` — `updateView` (superset/subset button logic)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1946-1953` — `update(changedMap)` re-render trigger
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:858-876` — `_getEffectiveStyleLinks` (the migrated pattern)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1988-2020` — `UIProseMirrorMenu` + widget config
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1959-1986` — `_IDPublisherMixin` forwarding
- `lib/js/components/prosemirror/integration.typeroof.jsx:130-153` — `getTypeSpecPropertiesIdMethod`
- `lib/js/components/prosemirror/integration.typeroof.jsx:86-128` — `_getBestTypeSpecPropertiesId` (upward walk)
- `lib/js/components/prosemirror/integration.typeroof.jsx:155-177` — `getTypeSpecsMethod`
- `lib/js/components/prosemirror/integration.typeroof.jsx:424-436, 780-794` — `ProseMirrorMenuView`, `_menuPlugin`
- `lib/js/components/registered-properties-definitions.mjs:31-48` — prefixes + `getStyleLinks` accessor
- `lib/js/components/layouts/type-stage/properties-generators.mjs:357-367,392` — `styleLinksGen`
- `lib/js/components/layouts/type-stage/type-specnion.mjs:245,297-332` — hierarchical merge semantics
- `lib/js/components/type-spec-models.mjs:315-335,420-432` — edge models + `TypeSpecModel` fields
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx:191-310` — `TypeSpecMeta`/`TypeSpecChildrenMeta`/`StyleLinksMeta`
- `lib/js/components/type-spec-fundamentals.mjs:817-904` — inherited-links list UI (effective-set consumer)
- `lib/js/components/layouts/type-stage/prosemirror.typeroof.jsx:90-97` — menu instantiation

## Open Questions

- Should the menu show the **effective** set per resolved typeSpec (union/intersection over
  `getStyleLinks(...)`), i.e. mirror `_getEffectiveStyleLinks`, or should selection resolution
  itself change (e.g. also include ancestor typeSpecs)? The `commonSubSet` disabling logic
  (:1882-1890) interacts with whichever choice is made.
- How should the menu present the three edge states (linked / NULL-STYLE / tombstoned-absent)?
  `getStyleLinks` already excludes tombstoned keys; NULL-STYLE edges are included (available but
  unstyled) — the menu currently has no notion of "unstyled".
- `UIProseMirrorMenuBlocks` (:1600s) and `UIBoldItalicMenu` (:2022-2138) consume the same
  resolution helpers; `UIBoldItalicMenu.updateView` (:2095-2131) never populates `setsOfStyles`
  (its `commonSubSet` stays empty — possibly a second, pre-existing gap worth verifying).
- Ordering: the FIXME at :1905-1908 (stable button order) is still open; the effective map from
  the typeSpecnion has parent-first merge order, which may or may not match the old
  `intentStyleLinks` order.
