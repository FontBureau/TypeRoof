# Two-Map Style-Links (intentStyleLinks / markStyleLinks) — Implementation Plan

date: 2026-07-31T21:56:00+02:00
git_commit: 37798e99d35fbad80649977435a19ea3112b43a1
branch: demo/wikipedia
research: thoughts/research/2026-07-31-2036-two-map-style-links.md
predecessor plan: docs/planning/agentic-artefacts/thoughts/plan/2026-07-30-1422-style-link-inheritance.md

## Overview

Split the single style-link edge map (`TypeSpecModel.stylePatches`, edge
`{stylePatch, mode, type, tag, mark}`) into two purpose-built maps:
`intentStyleLinks` (rename; key = intent name / `data-style-name`; edge
`{stylePatch, mode, tag}`) and `markStyleLinks` (new; key = schema mark
type name; edge `{stylePatch, mode}`). The `type` enum, the explicit
`mark` link and the type-gating semantics are deleted. This makes the
edge's target kind structural, dissolves the ancestor-wins precedence bug
(pure key matching is depth-correct by map-merge override), and removes
the latent implicit schema-mark styling that made behavior unpredictable.

## Current State Analysis

- Full machinery inventory + serialized-state analysis:
  `thoughts/research/2026-07-31-2036-two-map-style-links.md`.
- Inheritance via the typeSpecnion (`styleLinks/<key>` → edge struct,
  `null` tombstone) is shipped and tested (commits up to 26f047cc).
- No shipped state relies on implicit schema-mark styling: documents
  style via generic-style intents; the name fallback is latent.

### Key Discoveries:
- `/proseMirrorSchema` is a root state key in all 3 states; absolute
  dependency mappings (`['/font', 'rootFont']`) are established — a
  schema-marks select needs no new plumbing.
- Codebase mixin convention (`typographyInlineMixin` etc.) fits the
  shared edge-fields factoring better than class inheritance.
- type-driven-ui registers UI per model CLASS; the mark map either gets
  its own registration or is hosted inside the intent collapsible (user
  decision: ONE collapsible hosting both).
- Ramp: handler registration only; runtime comes free via TypeSpecMeta.

## Desired End State

- `TypeSpecModel` has `intentStyleLinks` + `markStyleLinks`; the
  legacy `stylePatches` field, `type`/`mark` edge fields and
  `MarkLinkApplyTypeEnumModel` are gone.
- Resolution: intents ← `intentStyleLinks.get(data-style-name)`;
  schema marks ← `markStyleLinks.get(mark.type.name)`. No
  cross-matching. Resolvers return `null` when nothing applies.
- Both maps inherit via the typeSpecnion (prefixes
  `intentStyleLinks/`, `markStyleLinks/`), with whole-edge override,
  NULL-STYLE (`stylePatch: ''`) and tombstone (`mode: 'unlinked'`)
  in both. Precedence: name match, closest scope wins.
- Handler ids: `styleLinkProperties@<typeSpecPath>/intentStyleLinks/<key>`
  resp. `.../markStyleLinks/<key>`.
- One "Style Links" collapsible hosting: inherited list (both maps),
  intent-links map, mark-links map (keys via schema-marks select +
  custom).

## Decisions (operator, 2026-07-31)

1. Two maps; names `intentStyleLinks` / `markStyleLinks` (serialized
   states get renamed — no legacy concerns).
2. Edge factoring: shared mixin `{stylePatch, mode}` + coherence
   (codebase mixin convention); intent edge adds `tag`.
3. Tombstone (`mode: 'unlinked'`) KEPT in both maps (2026-07-31,
   after brief confusion with the dropped `type` field).
4. Map-2 keys: select from schema mark names + custom option; permissive
   validation (FOREIGN_KEY_NO_ACTION philosophy — unknown keys inert).
5. Both map UIs live inside the single "Style Links" collapsible.
6. Behavior tests (not method tests) ride with each phase; stop before
   EVERY commit with the proposed message for review.

## What We're NOT Doing

- Explicit mark-link indirection (edge key ≠ mark name) — dropped.
- `type` enum / "Apply as" semantics — dropped.
- Migration tooling for user-saved states containing `type`/`mark`
  edge data (only from local testing; states are edited by hand).
- `nodeStyleLinks` (noted as possible future third map).
- Conflict indicators for shadowed edges in the UI.

## Phase 1: Model split

### Overview
New edge structs + maps, field rename, deleted type/mark machinery,
simplified resolvers, JSON states renamed, model behavior tests.

### Changes Required:

#### 1. `lib/js/components/type-spec-models.mjs`
**Changes**:
- Add `stylePatchLinkModelMixin` = `[['stylePatch', StylePatchKeyModel],
  ['mode', StylePatchLinkModeEnumModel], CoherenceFunction.create(
  ['mode','stylePatch'], sanitizeStylePatchLinkMode)]` (mixin convention).
- `MarkStylePatchLinkModel` = struct(mixin);
  `IntentStylePatchLinkModel` = struct(mixin + `['tag', StringOrEmptyModel]`).
- `IntentStyleLinksMapModel` / `MarkStyleLinksMapModel` ordered maps
  (`validateKeyFn: validateStyleName`).
- `TypeSpecModel`: `['stylePatches', StylePatchLinksMapModel]` →
  `['intentStyleLinks', IntentStyleLinksMapModel]` + new
  `['markStyleLinks', MarkStyleLinksMapModel]`. Update comments.
- DELETE: `MarkLinkApplyTypeEnumModel`, `StylePatchLinkModel`,
  `StylePatchLinksMapModel`, `sanitizeStylePatchLink`, the
  `type`/`mark` fields.
- Resolvers: `getStylePatchLinkForMark(markStyleLinks, mark)` →
  `markStyleLinks.has(mark.type.name) ? mark.type.name : null`;
  `getStylePatchTagForIntent(intentStyleLinks, styleName)` → edge's
  `tag` if non-empty else `null` (no type check anymore);
  both return `null` when nothing applies (contract change; call sites
  are adapted in Phase 2 commit 4).

#### 2. Serialized states (3 files)
`lib/assets/type-stage-initial-state.json`,
`lib/js/wikipedia/type-stage-wikipedia-initial-state.json`,
`lib/assets/wikipedia-demo.json`: rename `"stylePatches"` →
`"intentStyleLinks"` (TypeSpec fields only, NOT `stylePatchesSource`).

#### 3. `lib/js/components/type-spec-models.test.mjs`
**Changes**: rewrite resolver describes as BEHAVIOR tests using real
map-model drafts: mark resolves only via `markStyleLinks` (an
`intentStyleLinks` edge with the same key does NOT style the mark);
intent tag resolves only via `intentStyleLinks`; `null` when absent;
tombstone semantics are stream-level (covered in Phase 2 tests).

### Success Criteria:
#### Automated:
- [x] `npm test` green (86/86); `npm run lint` clean; typecheck: no new errors.
#### Manual:
- [ ] All 3 states load; style links behave as before (intent styling).

**Commit**: `[type-spec-models] split style-links into intentStyleLinks + markStyleLinks`
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 2: Properties stream + runtime delivery

### Overview
Two stream families, delivery of both via StyleLinksMeta, PM + viewer
resolution per map. Two commits (2a stream+meta+viewer, 2b PM resolvers).

### Changes Required:

#### 1. `registered-properties-definitions.mjs`
`STYLE_LINKS = 'styleLinks/'` → `INTENT_STYLE_LINKS = 'intentStyleLinks/'`
+ `MARK_STYLE_LINKS = 'markStyleLinks/'`; `getStyleLinks(propertyValuesMap,
prefix)` parameterized (callers pass the prefix).

#### 2. `properties-generators.mjs`
`styleLinksGen` yields from both fields: `intentStyleLinks/<key>` →
intent edge or `null` (unlinked); `markStyleLinks/<key>` → mark edge
or `null`. `processed-properties.mjs`: skip both prefixes.

#### 3. `meta.typeroof.jsx` (`StyleLinksMeta`)
Parameterize with `(fieldName, prefix)`; instantiate TWICE in
`TypeSpecMeta` (intent + mark). Handler rootPath =
`rootPath.append(fieldName, key)` → ids
`styleLinkProperties@<typeSpecPath>/<fieldName>/<key>`.
`viewer.typeroof.jsx:298-306`: id segment `stylePatches` →
`intentStyleLinks` (viewer handles intents only).

#### 4. `prosemirror/type-spec.typeroof.jsx`
`_getEffectiveStyleLinks(typeSpecProperties, prefix)`;
`_getStylePatchLinkForMark` uses the `markStyleLinks` map (schema
marks) — short-circuit `null` → unknown-style fallback;
`_resolveIntentTag` uses the `intentStyleLinks` map;
`_getStyleLinkPropertiesId` gains the field-name path segment;
`_finalizeMarkSubscription` picks the map by mark kind
(`data-style-name` present → intent, else schema mark).

#### 5. `type-specnion.test.mjs`
BEHAVIOR tests (real `HierarchicalScopeTypeSpecnion` chains, stub
hosts exposing both maps): per map — inherit, override (closer wins),
tombstone (+ re-link in grandchild), NULL-STYLE available; cross-map:
same key in both maps stays independent; an intent is NOT styled when
only `markStyleLinks` has its name and vice versa (structural
separation = the dissolved Variant B).

### Success Criteria:
#### Automated:
- [x] New behavior tests green (89/89); `npm run lint` clean. (2a: 6d9394b6, 2b pending)
#### Manual:
- [ ] Wikipedia demo: intent styling, schema-mark styling via
  `markStyleLinks`, override in child, tombstone, ramp smoke test.

**Commit (2a)**: `[typeSpecnion] two style-link families in the properties stream + delivery`
**Commit (2b)**: `[ProseMirror] resolve intents and schema marks from their own maps`
**Implementation Note**: pause for manual confirmation before next phase.

## Phase 3: UI

### Overview
One "Style Links" collapsible hosting: inherited list (both maps),
intent-links map (no more "Apply as"), mark-links map (schema-marks
select + custom).

### Changes Required:

#### 1. `type-spec-fundamentals.mjs`
- Intent edge editor (`UIStylePatchLinksValue`): DELETE the "Apply as"
  select, the mark input and the `linkType` wiring/activationTests;
  the tag input becomes direct (always visible for intent edges).
- Parameterize the links-map widget family for the mark map (no tag
  input; create-flow key select fed by schema mark names via a
  `/proseMirrorSchema` dependency + custom option; permissive).
- `UIStylePatchesLinksMapCollapsible`: host both maps + the inherited
  list; the mark map's `childrenOrderedMap` maps to the sibling
  `markStyleLinks` field. NOTE: check what default UI
  `MarkStyleLinksMapModel` gets without its own type-driven-ui
  registration — if it renders, suppress it (minimal hidden
  registration); fallback if awkward: discuss before deviating from the
  one-collapsible decision.
- `UIInheritedStyleLinksList`: cover both maps (kind-labeled entries
  or two lists); reads edges from both prefixes.

#### 2. `type-driven-ui.mjs`
Adjust the `StylePatchLinksMapModel` registration to the renamed
`IntentStyleLinksMapModel`; mark map per 1. NOTE.

### Success Criteria:
#### Automated:
- [x] `npm test` 89/89, `npm run lint` green. (d173784b)
#### Manual:
- [x] Create/edit intent links (with tag) and mark links in one
  collapsible; (UNLINK) works in both; inherited list covers both.
  (confirmed 2026-08-01; labels + per-item x delete + collapsed
  default added on operator request)

**Commit**: `[UI] style-links sections for intent and mark links in one collapsible`
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 4: Plumbing & polish

### Changes Required:
- `pps-maps.mjs:48,101`: `stylePatches` → `intentStyleLinks`
  prefix mapping; add `markStyleLinks` as needed.
- `defaults.mjs:150`: skip/known-default set updated for both fields.
- Comment cleanup touching renamed symbols (archived docs stay as
  historical record).

### Success Criteria:
#### Automated:
- [x] `npm test` 89/89, `npm run lint` green; typecheck: no new errors.
#### Manual:
- [x] Full demo pass (type-stage + wikipedia + ramp). (confirmed 2026-08-01)

**Commit**: `[housekeeping] PPS plumbing + comments for the two-map split`

---

## Testing Strategy

### Behavior tests (vitest):
- Phase 1: resolution semantics per map via real model drafts (incl.
  no-cross-matching).
- Phase 2: inheritance semantics per map via real
  `HierarchicalScopeTypeSpecnion` chains (inherit / override /
  tombstone / re-link / NULL-STYLE / cross-map independence).
### Integration/manual:
- Wikipedia demo + type-stage demo + ramp smoke per phase; UI flows
  per Phase 3 manual criteria.

## Baseline for all phases

- `npm test` (vitest) green; `npm run lint` clean; typecheck shows
  no new errors (pre-existing main.ts TS2305 tolerated).
- Stop before EVERY commit: proposed message (+ model/provider/agent
  metadata read from actual config) presented for operator review.
