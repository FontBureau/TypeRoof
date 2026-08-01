---
date: 2026-07-31T20:36:00+02:00
git_commit: 37798e99d35fbad80649977435a19ea3112b43a1
branch: demo/wikipedia
repository: TypeRoof
topic: "Two-map style-links redesign: intentStyleLinks + markStyleLinks"
tags: [research, codebase, typespec, typespecnion, style-links, style-patches, inheritance, schema-marks, redesign]
status: complete
---

# Research: Two-Map Style-Links Redesign (intentStyleLinks / markStyleLinks)

## Research Question

The single style-link edge map (`TypeSpecModel.stylePatches`, edge struct
`{stylePatch, mode, type, tag, mark}`) proved semantically muddled in
practice (operator testing 2026-07-30/31):

- Key-based fallback (`getStylePatchLinkForMark`, type-spec-models.mjs:455)
  styles schema marks via ANY edge whose key matches the mark name,
  regardless of the edge's `type` ("Apply As") — a half-semantic field.
- Explicit mark-link resolution is first-in-order over a parent-first
  merged map → ancestors always win mark-link races; a child cannot
  override an inherited mark link ("the parent wins, no way for the
  closer child to take precedence").
- An intent linked "as mark" gets styling but not the mark's tag
  (by design, but surprising).

Redesign (operator direction 2026-07-31): split into TWO maps.
`intentStyleLinks` (rename of `stylePatches`; key = intent name /
`data-style-name`; edge keeps the tag binding) and `markStyleLinks`
(NEW; key = schema mark type name; edge `{stylePatch, mode}`; direct
key match, no explicit mark link). The `type` enum and the explicit
`mark` link are dropped entirely.

This research maps the full blast radius and the serialized-state surface.

## Summary

- The current machinery is compact and well-inventoried (Detailed Findings 1):
  one edge struct + one ordered map, one properties-stream family
  (`styleLinks/`), one runtime meta container, two resolvers, one UI
  family — all within `lib/js/components/` plus three JSON states.
- **No shipped state relies on implicit schema-mark styling** (Detailed
  Findings 2): in `wikipedia-demo.json` the document styles itself via
  generic-style INTENTS (data-style-name: link ×289, sup ×77, cite ×70,
  italic ×40, bold ×1); schema marks exist in the schema but their
  name-matched edges serve the intents. The implicit name fallback is
  latent, unused behavior in shipped data → the split breaks nothing.
- The split DISSOLVES the precedence bug: with pure key matching per map,
  resolution is `map.get(name)` and key override in the merged
  typeSpecnion map is already depth-correct (tested whole-edge override).
  The order-sensitive explicit-link loop disappears; no scope-walk
  resolver needed. Variant B (type gating) becomes structural.
- Inheritance machinery (generator, `getStyleLinks`, `StyleLinksMeta`,
  tombstone via `mode: 'unlinked'`) carries over unchanged, just with a
  second properties-stream prefix and handler-id path segment.
- The "multiple link-marks match one mark" question disappears — map keys
  are unique. Precedence contract collapses to: **name match, closest
  scope wins**.

## Detailed Findings

### 1. Current machinery inventory (complete reference map)

**Models** (`type-spec-models.mjs`): `MarkLinkApplyTypeEnumModel` (:285-289,
`generic-tag|mark`), `StylePatchLinkModeEnumModel` (:303-307, `link|unlinked`),
`StylePatchLinkModel` (:317-339, `{stylePatch, mode, type, tag, mark}` +
coherence fns :326-338), `StylePatchLinksMapModel` (:341-344),
`TypeSpecModel.stylePatches` field (:436). Resolvers:
`getStylePatchLinkForMark` (:448-458, explicit mark-link loop :449-454 +
key fallback :455), `getStylePatchTagForIntent` (:463-470, `generic-tag`-only).
Tests: `type-spec-models.test.mjs` (both resolvers covered).

**Properties stream**: `STYLE_LINKS = 'styleLinks/'` +
`getStyleLinks` (registered-properties-definitions.mjs:31,41-46);
`styleLinksGen` (properties-generators.mjs:356-363, registered :387;
yields edge struct or `null` tombstone); display filter
(processed-properties.mjs:135). `pps-maps.mjs:48,101` maps
`stylePatches → "stylePatches/"`; `defaults.mjs:150` skip set.

**Runtime delivery**: `StyleLinksMeta` (meta.typeroof.jsx:56-146,
provisions handlers from effective edges, id
`styleLinkProperties@<typeSpecPath>/stylePatches/<key>`);
`StyleLinkLiveProperties` (live-properties.typeroof.jsx:257-327);
consumers: viewer.typeroof.jsx:298-306,362 and
prosemirror/type-spec.typeroof.jsx:852-906 (`_getEffectiveStyleLinks`,
`_getStylePatchLinkForMark`, `_resolveIntentTag`, id construction);
protocol handler created in type-stage index.typeroof.jsx:219,519,531
and ramp index.typeroof.jsx:287,440,452.

**UI** (type-spec-fundamentals.mjs): unified selects with (NULL-STYLE)/
(UNLINK) specials (`StyleLinksMapKeyCreateSelect` :210,
`StyleLinksMapKeyChangeSelect` :218-250), edge editor
`UIStylePatchLinksValue` (:310) incl. type/tag/mark editors (:405-438),
`UIStylePatchesLinksMap` (:641) + `Collapsible` (:840),
`UIInheritedStyleLinksList` (:792, reads `stylePatch`/`type`/`tag`/`mark`
at :819-823). Registration: type-driven-ui.mjs:339
`[StylePatchLinksMapModel, [UIStylePatchesLinksMapCollapsible, ...]]`.
Cousin widget (forked, for node→typespec links):
`UINodeSpecToTypeSpecLinksMap` (:1215+).

### 2. Serialized-state analysis (3 JSON states)

- `lib/assets/type-stage-initial-state.json` + `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`:
  identical edges (italic, bold, bold italic → patch of same name) on two
  TypeSpecs each; schema marks: strong, link; NO key/mark collisions.
  Legacy shape: edges carry only `stylePatch` (defaults fill the rest).
- `lib/assets/wikipedia-demo.json` (the wikipedia demo state): 10 edges
  per TypeSpec (italic, bold, bold italic, link, abbr, bdi, cite, code,
  small, sup); schema marks: abbr, bdi, bold, cite, code, italic, link,
  small, sup — 9 key/mark-name COLLISIONS. BUT the document body uses
  generic-style intents with those names (data-style-name counts:
  link 289, sup 77, cite 70, italic 40, bold 1; 962 attr occurrences
  total) and NO schema-mark instances are styled by the edges.
  ⇒ The implicit name fallback is latent in shipped data; the split
  breaks nothing. Edges stay intent links; `markStyleLinks` starts empty.

### 3. Schema marks at runtime

- Metamodel schema: `ProseMirrorSchemaModel.marks` (MarkSpecModel:
  `tag`, `attrs`, ...), in the state tree at `proseMirrorSchema`;
  PM schema ↔ metamodel schema mapped bidirectionally via `_nodesCache`
  (integration.typeroof.jsx:1288), accessed by `getLinked` (:776).
- Schema-mark rendering: `ProsemirrorMarkView._getTag` (:398-410) reads
  the MarkSpec tag (markViews registered dynamically per metamodel mark,
  :1259-1284). Intent tag correction only processes generic-style
  (type-spec.typeroof.jsx:1027).
- Schema marks selectable in UI: no existing select lists schema mark
  names for style-links; the marks UI (semantic-marks sprint) offers
  them for toggling (type-driven-ui/schema UI).

### 4. Precedents for a second map field + UI

- type-driven-ui registers per model CLASS, not per field: a new
  `MarkStyleLinksMapModel` class gets its own
  `[MarkStyleLinksMapModel, [UI…Collapsible, …]]` entry next to :339 —
  no registration conflict with the existing one.
- `UINodeSpecToTypeSpecLinksMap` (type-spec-fundamentals.mjs:1215+) is a
  fork of the links-map UI for a different link kind — evidence the
  widget family tolerates a sibling.
- Ramp layout: style-link related wiring is handler registration only
  (index.typeroof.jsx:287,440,452); the `style_patches-manager` zone
  (:256-266) manages the patch SOURCE, not links. No link-editing UI in
  ramp → the split is type-stage-only for UI; runtime comes free via
  shared `TypeSpecMeta`.
- No field-rename migration machinery exists (none needed: states are
  shipped JSON we control; the metamodel fills defaults for missing
  fields, and unknown serialized fields would need checking — the legacy
  `stylePatches` key in shipped JSON must be RENAMED in the files).

### 5. Design decisions so far (operator, 2026-07-31)

1. Two maps: `intentStyleLinks` (rename of `stylePatches`; serialized
   states get edited to the new field name) and `markStyleLinks` (new).
   Symmetric naming scales (`nodeStyleLinks` possible later).
2. `markStyleLinks` edge: `{stylePatch, mode}`, key == schema mark type
   name. No explicit mark link, no type enum — dropped entirely from the
   intent edge too; intent edge = `{stylePatch, mode, tag}` (tag binding
   stays, it is the intent-only feature).
3. Resolution: intents → `intentStyleLinks.get(data-style-name)`;
   schema marks → `markStyleLinks.get(mark.type.name)`. No
   cross-matching. Precedence contract: name match, closest scope wins
   (map-merge override is already depth-correct).
4. Tombstone (`mode: 'unlinked'`) in both maps; NULL-STYLE stays
   `stylePatch: ''` in both.
5. Properties stream: two prefixes, `intentStyleLinks/<key>` and
   `markStyleLinks/<key>` (replaces `styleLinks/`); handler ids
   `styleLinkProperties@<typeSpecPath>/intentStyleLinks/<key>` resp.
   `.../markStyleLinks/<key>` — an intent and a mark may share a key
   with different edges.

## Code References
- `lib/js/components/type-spec-models.mjs:285-344,436,448-470` — edge models, field, resolvers
- `lib/js/components/registered-properties-definitions.mjs:31,41-46` — STYLE_LINKS + getStyleLinks
- `lib/js/components/layouts/type-stage/properties-generators.mjs:356-363,387` — styleLinksGen
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx:56-146,288` — StyleLinksMeta
- `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:257-327` — StyleLinkLiveProperties
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:852-906,973,1027-1037,1441,1460` — PM resolution
- `lib/js/components/prosemirror/integration.typeroof.jsx:398-410,776,1259-1288` — MarkView tag, getLinked
- `lib/js/components/type-spec-fundamentals.mjs:210-250,310-438,641-872` — selects, edge editor, maps, inherited list
- `lib/js/components/type-driven-ui.mjs:339-347` — UI registration
- `lib/js/components/pps-maps.mjs:48,101`, `lib/js/components/layouts/type-stage/defaults.mjs:150` — PPS plumbing
- `lib/assets/wikipedia-demo.json`, `lib/assets/type-stage-initial-state.json`, `lib/js/wikipedia/type-stage-wikipedia-initial-state.json` — serialized states
- `docs/planning/agentic-artefacts/thoughts/plan/2026-07-30-1422-style-link-inheritance.md` — predecessor plan (inheritance)
- `docs/planning/agentic-artefacts/thoughts/research/2026-07-30-0957-style-link-inheritance-typespecnion.md` — predecessor research

## Open Questions
1. Map-2 UI in v1: free-text keys (validateStyleName) or options from
   the schema's mark names? (The schema's marks map is reachable via
   getLinked; a select would need a dependency to the metamodel schema
   in the links-map UI.)
2. Edge struct factoring: shared base (`stylePatch`, `mode`) with
   intent struct adding `tag`, vs. two independent small structs.
3. Do we keep `getStylePatchLinkForMark`'s return-null contract change
   (nothing applicable) — call sites must short-circuit to unknown-style.
4. `pps-maps.mjs` / `defaults.mjs` prefix plumbing: does the renamed
   field need a new PPS entry, and does `markStyleLinks`?
5. Viewer (type-stage/viewer.typeroof.jsx:298-306) constructs handler
   ids with `stylePatches` as path segment — rename to
   `intentStyleLinks` there too (it only handles intents).
6. Rename fallout in comments/docs (archived plans keep the old
   vocabulary — leave as historical record).
