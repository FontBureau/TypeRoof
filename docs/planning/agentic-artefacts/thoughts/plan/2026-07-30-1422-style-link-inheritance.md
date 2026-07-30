# Style-Link Inheritance via the TypeSpecnion — Implementation Plan

date: 2026-07-30T14:22:00+02:00
git_commit: cd05af513ab0dc34e1f065a47c178bc160c7352a
branch: demo/wikipedia
research: thoughts/research/2026-07-30-0957-style-link-inheritance-typespecnion.md

## Overview

Style-links (edges in `TypeSpecModel.stylePatches`, a `StylePatchLinksMapModel`)
apply today only at the TypeSpec node where they are defined. This plan makes
them inherit down the TypeSpec children tree **through the typeSpecnion
properties stream**: one property per edge (`styleLinks/<key>` → the live
`StylePatchLinkModel` struct), whole-edge override via map-set semantics,
tombstone via `null` shadowing. The edge model gains a `mode` enum
(`link` | `null-style` | `unlinked`) that replaces `stylePatch: ''` as
the NULL-STYLE encoding and encodes the tombstone (`unlinked`).

## Current State Analysis

- **Edges are local-only**: `StyleLinksMeta` iterates the node's local model
  collection (`meta.typeroof.jsx:55-105`, wired at `:191-202`); the
  ProseMirror resolvers read the local map (`type-spec-models.mjs:410-437`,
  call sites `prosemirror/type-spec.typeroof.jsx:855-869`).
- **NULL-STYLE is `stylePatch: ''`** (`type-spec-models.mjs:291`);
  availability = a `styleLinkProperties@` handler is registered regardless
  of `''` (`meta.typeroof.jsx:71-74`); consumers branch on
  `hasRegistered(id)` (`viewer.typeroof.jsx:296-313`,
  `type-spec.typeroof.jsx:871-890`).
- **typeSpecnion merge** (`type-specnion.mjs`): parent map filtered by
  `isInheritingPropertyFn` (default `inherit: true` for unregistered
  paths, `registered-properties.mjs:382-387`), merged UNDER local, local
  wins (`:329-334`). A literal local `null` shadows the parent (no
  null-check in the merge); a synthetic RESOLVING to null is deleted
  (`:164-168`). Generators are `function*` yielding `[name, value]`
  (`:174-189`).

### Key Discoveries:
- **The ramp layout reuses `TypeSpecMeta`** (`ramp/index.typeroof.jsx:37,320`)
  — changes in the shared meta/live-properties layer cover both layouts.
- **Only one iterate-all consumer of `getProperties()`**:
  `processed-properties.mjs:129-145` (own/inherited properties display UI)
  — needs a prefix filter; all other consumers read known keys only.
- **No shipped legacy data**: both `lib/assets/type-stage-initial-state.json`
  and `lib/js/wikipedia/type-stage-wikipedia-initial-state.json` serialize
  edges as `[key, {stylePatch}]` with NON-empty values only → `mode`
  defaulting to `'link'` is backward compatible, no data migration needed.
- **Handler id convention** `styleLinkProperties@<typeSpecPath>/stylePatches/<key>`
  is constructed by consumers from the applicable TypeSpec's path — keeping
  this convention keeps viewer/ProseMirror lookup code unchanged.

## Desired End State

- An edge defined on a TypeSpec applies to all descendants unless overridden
  or tombstoned; document-wide defaults + local overrides work.
- A child redefining key `K` replaces the WHOLE edge struct (no field merge).
- A child setting `mode: 'unlinked'` on `K` removes `K` from the
  effective set: no handler, consumers take the unknown-style fallback
  (`UIDocumentUnkownStyleStyler` / plain text node), for itself and all
  descendants — until a descendant re-links `K` by defining the edge again.
- `mode: 'null-style'` keeps `K` available but unstyled (base
  typeSpecnion published, tag binding still applies).
- UI: a mode select per edge; a read-only list of inherited ACTIVE edges
  (effective set minus locally-defined keys, tombstoned excluded).

## Decisions (operator, 2026-07-30)

1. Inheritance goes **through the typeSpecnion properties stream**: one
   property per edge (`styleLinks/<key>`); the yielded value is the LIVE
   `StylePatchLinkModel` struct instance (no copying; identity changes on
   edit drive rebuilds; resolvers already speak the model API).
2. **Whole-edge override**; field-wise override (e.g. inherit `tag`,
   override `stylePatch`) is postponed — the `OrEmpty` fields keep that
   door open.
3. Tombstone + null-style encoding: `mode` enum on `StylePatchLinkModel`
   (`link` | `null-style` | `unlinked`), plain enum, always serialized
   (`type` precedent, `type-spec-models.mjs:283-284`). `OrEmpty` was
   rejected: its third state ("unset → inherit") is meaningless for a
   locally defined edge — deferral is already expressed by local absence.
4. The tombstone does NOT propagate as a live marker: implemented as a
   `null` shadow in the merged map; every consumer treats `null` as
   absent ("the absence is the inheritance").
5. Simple read-only UI for inherited active edges in v1; better interface
   once the mechanics are in place.
6. Stop before EVERY commit: propose the commit message, wait for operator
   review. Commits carry model/provider/agent metadata per COLLABORATION.md
   (read from actual config at commit time, never hardcoded).

7. REVISED (2026-07-30, operator): the mode enum is `link | unlinked`
   only — NULL-STYLE stays `stylePatch: ''` (identical runtime behavior,
   redundant as a mode). No separate mode UI: `(UNLINK)` is a special
   option in the existing create/change selects; the unified select sets
   `mode` as a side effect (selecting anything else sets `link`).

## What We're NOT Doing

- Field-wise edge override (inherit `tag`, override `stylePatch`).
- Multiple inheritance / `parents` list (`type-spec-models.mjs:386-387`
  musing stays a musing).
- Rich inherited-edges EDITING UI.
- Migration tooling for user-saved legacy states with `stylePatch: ''`:
  none exist in shipped states; legacy `''` degrades gracefully to
  mode `link` + empty key = the existing "miracle" semantics (available,
  no patch applies), behaviorally equal to null-style. Documented, not
  migrated.

## Implementation Approach

Phase order keeps the app working after each commit: the model addition is
backward compatible (default `'link'`); the generator makes `styleLinks/`
entries appear in the stream (only the one display UI needs a filter);
runtime delivery switches handler registration and resolution to the
effective set; UI lands last. Tests are written with the mechanics
(Phase 2), testing BEHAVIOR (observable merge outcomes), not methods.

## Phase 1: StylePatchLinkModel mode enum

### Overview
Add the `mode` field and coherence; update the documenting comments.
Runtime is untouched — `StyleLinksMeta` keeps reading `stylePatch`.

### Changes Required:

#### 1. `lib/js/components/type-spec-models.mjs`
**Changes**:
- Add `StylePatchLinkModeEnumModel = _AbstractEnumModel.createClass(
  'StylePatchLinkModeEnumModel', ['link', 'null-style', 'unlinked'], 'link')`.
- `StylePatchLinkModel` gains `['mode', StylePatchLinkModeEnumModel]` and a
  CoherenceFunction on `['mode', 'stylePatch']`: when `mode !== 'link'`
  clear `stylePatch` to `''` (follows the `sanitizeStylePatchLink`
  precedent, `type-spec-models.mjs:302-310`).
- Update the comment blocks (`:266-295`, esp. `:291` `"" = NULL-STYLE`
  and `:396-399` "no need to set null") to mode semantics.

### Success Criteria:
#### Automated:
- [x] `npm test` green (83/83); `npm run lint` clean; typecheck: no new errors.
#### Manual:
- [ ] Both initial states load; style links behave exactly as before.

**Commit**: `[type-spec-models] add mode (link|null-style|unlinked) to StylePatchLinkModel`
**Implementation Note**: pause for manual confirmation before next phase.

## Phase 2: styleLinksGen + merge semantics + behavior tests

### Overview
A new generator yields one property per edge into the typeSpecnion stream;
inheritance, whole-edge override and the tombstone fall out of the existing
merge. Behavior tests pin the semantics.

### Changes Required:

#### 1. `lib/js/components/layouts/type-stage/properties-generators.mjs`
**Changes**: add and register (LAST in `TYPE_SPEC_PROPERTIES_GENERATORS`;
NOT in `STYLE_PATCH_PROPERTIES_GENERATORS` — StylePatch models have no
`stylePatches` field):

```js
export const STYLE_LINKS_PREFIX = "styleLinks/";

export function* styleLinksGen(outerTypespecnionAPI, hostInstance) {
    for (const [key, edge] of hostInstance.get("stylePatches"))
        yield [
            `${STYLE_LINKS_PREFIX}${key}`,
            edge.get("mode").value === "unlinked" ? null : edge,
        ];
}

// Effective, available style-links of a typeSpecnion (tombstones excluded).
// Used by StyleLinksMeta, the ProseMirror resolvers and the UI list.
export function getStyleLinks(propertyValuesMap) {
    const result = new Map();
    for (const [name, value] of propertyValuesMap)
        if (name.startsWith(STYLE_LINKS_PREFIX) && value !== null)
            result.set(name.slice(STYLE_LINKS_PREFIX.length), value);
    return result;
}
```

#### 2. `lib/js/components/processed-properties.mjs` (:129 display loop)
**Changes**: skip `STYLE_LINKS_PREFIX` entries in the iterate-all display.

#### 3. `lib/js/components/layouts/type-stage/type-specnion.test.mjs`
**Changes**: behavior tests driving REAL `HierarchicalScopeTypeSpecnion`
chains (`propertiesGenerators=[styleLinksGen]`, real
`StylePatchLinksMapModel` instances, minimal stub host `{ get(name) }`):
- inherit: child without local edges sees the parent's struct (identity).
- override: child's struct for `K` replaces the parent's wholesale (e.g.
  different `tag`; no field merge).
- tombstone: `unlinked` `K` → merged value `null`;
  `getStyleLinks` excludes `K` at the child AND grandchild.
- re-link: grandchild redefines `K` after a tombstone → visible again.
- null-style: entry present in `getStyleLinks` with `mode: 'null-style'`.

### Success Criteria:
#### Automated:
- [x] New tests green (5 behavior tests); `npm test` 88/88, `npm run lint` clean.
#### Manual:
- [ ] App behaves as before (no consumer of `styleLinks/` entries yet).

**Commit(s)**: `[typeSpecnion] inherit style-links via styleLinks/ properties`
(+ behavior tests, separate commit if review prefers smaller units)
**Implementation Note**: pause for manual confirmation before next phase.

## Phase 3: runtime delivery from the effective edge set

### Overview
Handlers are registered for the EFFECTIVE (incl. inherited) edges; the
ProseMirror resolvers read the effective map. Handler id convention stays
`styleLinkProperties@<typeSpecPath>/stylePatches/<key>` → viewer and ramp
lookup code remain unchanged. Biggest phase, two commits.

### Changes Required:

#### 1. `StyleLinksMeta` rework (`meta.typeroof.jsx:55-105`) [DONE]
**Changes**: from model-collection-driven to effective-set-driven. Subscribe
`typeSpecProperties@` of the own node; on update compute
`getStyleLinks(typeSpecProperties.typeSpecnion.getProperties())` and
provision one `StyleLinkLiveProperties` per key, with settings
`{rootPath: <typeSpecPath>/stylePatches/<key>, "styleLinkProperties@": id}`
(ids unchanged). Rebuild wrappers when the effective set or an edge value
changes (`HANDLE_CHANGED_AS_NEW` pattern; likely a custom
`_BaseContainerComponent` rather than `_BaseDynamicMapContainerComponent`,
which is model-collection-bound — the main implementation task of this
phase). NOTE: `getStyleLinks` already excludes tombstoned keys, so no
handler is registered for them → consumers fall back to unknown-style.

#### 2. `StyleLinkLiveProperties` (`live-properties.typeroof.jsx:257-327`)
**Changes**: the edge struct is passed as a constructor arg (replaces
`this.getEntry(rootPath).get('stylePatch')` — inherited edges have no
local model entry). Dependency key = `edge.get('stylePatch').value`;
`null-style` mode → `''` → dependency resolves null → base typeSpecnion
published (existing behavior preserved, `:299-311`).

**Commit (a)**: `[type-stage] register styleLinkProperties@ from effective (inherited) style-links`

#### 3. ProseMirror resolvers (`type-spec.typeroof.jsx:855-869`)
**Changes**: `getStylePatchLinkForMark` / `getStylePatchTagForIntent`
(`type-spec-models.mjs:410-437`) keep their signatures but receive the
EFFECTIVE map (`getStyleLinks` result — same struct API) instead of the
model map; call sites obtain it from the `typeSpecProperties@` component's
typeSpecnion rather than `_getTypeSpecForPropertiesId(...).get('stylePatches')`.

**Commit (b)**: `[ProseMirror] resolve style-link edges from the effective (inherited) set`

### Success Criteria:
#### Automated:
- [x] `npm test` 88/88, `npm run lint` green.
#### Manual:
- [ ] Wikipedia demo: an edge on a PARENT TypeSpec styles marks in child
  paragraphs; tombstone removes styling AND tag binding; override wins;
  null-style keeps availability without styling; ramp layout smoke test.

**Implementation Note**: pause for manual confirmation before next phase.

## Phase 4: UI

### Overview
Mode editing per edge + the simple read-only inherited list. Kept minimal;
a better interface can follow once the mechanics prove out.

### Changes Required:

#### 1. Mode select (`type-spec-fundamentals.mjs:242-330`, `:607`)
**Changes**: `UIStylePatchLinksValue` gains mode selection:
`link` (patch-key select enabled, existing widget) / `null-style` /
`unlinked`; labels `(NULL-STYLE)` / `(UNLINK)` alongside the existing
`EMPTY_STYLE_LINK_LABEL`. Replaces the current allowNull-`''` handling.

**Commit**: `[UI] mode select for style-link edges (link, null-style, unlinked)`

#### 2. Read-only inherited list (style-links section,
`type-driven-ui.mjs:343`, `UIStylePatchesLinksMapCollapsible`
`type-spec-fundamentals.mjs:712-721`)
**Changes**: a small component subscribing `typeSpecProperties@`, listing
`getStyleLinks(...)` entries whose key is NOT in the local model map
(i.e. inherited only, tombstones already excluded), showing key + mode /
patch key / tag. Locally defined values are NOT in this list (operator
requirement).

**Commit**: `[UI] read-only inherited style-links list`

### Success Criteria:
#### Automated:
- [x] `npm test` 88/88, `npm run lint` green.
#### Manual:
- [x] Create override and tombstone purely via UI ((UNLINK) special
  option in the unified selects); inherited list shows exactly the
  inherited active edges and updates live. (confirmed 2026-07-30)

**Implementation Note**: pause for manual confirmation before next phase.

---

## Testing Strategy

### Unit/behavior Tests (vitest, `npm test`):
- Phase 2 merge-semantics tests (inherit / override / tombstone /
  re-link / null-style) — observable behavior of real
  `HierarchicalScopeTypeSpecnion` chains, not internals.
### Integration/manual:
- Wikipedia demo scenario matrix across the type-stage viewer AND the
  ProseMirror stylers: inherit, override, tombstone (unknown-style
  fallback + text-node degradation), re-link in grandchild, null-style
  (available, unstyled, tag binding intact).
- Ramp layout smoke test (shares `TypeSpecMeta`).

## Baseline for all phases

- `npm test` (vitest) green; `npm run lint` clean; typecheck shows no
  new errors.
- Stop before EVERY commit: proposed message (+ model/provider/agent
  metadata read from actual config) presented for operator review.
