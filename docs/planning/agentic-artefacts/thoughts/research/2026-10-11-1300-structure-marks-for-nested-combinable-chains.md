---
date: 2026-10-11T12:59:58+02:00
git_commit: 57e1e3dc5ff9bbb976723fe42c03601bd821db51
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Mark machinery as-is: structure marks for nested combinable chains (Variant A groundwork)"
tags: [research, codebase, wikipedia-ingest, prosemirror-marks, type-spec-resolution, text-composition]
status: complete
---

# Research: Mark machinery as-is — structure marks for nested combinable chains

## Research Question

Formal RPI cycle (operator 2026-10-11, /research_codebase). Context: Wikipedia ingest
collapses nested combinable mark elements (b/strong, i/em, a) — bc48fdb9 (composite
intents + generic-inline demotion), 57e1e3dc (selector-matched demotionRules), b3d53d5b
(textless-mark demotion). Problem: generic-inline has no nodeSpecToTypeSpec link, so
demoted chains attenuate typeSpec resolution toward the nearest registered ancestor;
the same chain under different parents (h1 vs paragraph vs figcaption) would need
per-context typeSpec attachments — combinatorial. Operator decision: **Variant A** —
the chain demotion becomes a MARK push: new NON-INTENT "structure marks" (markSpecs
carrying tag + attrs, reproducing real-world HTML semantics) on the text-run marks
stack; the ONE composite generic-style intent stays the sole style-resolving mark per
run; textless demotion (demotionRules) stays; free mark combinations stay forbidden —
the exclusivity contract forces typographic shape through StylePatches. Variant B
(more than one style link per run, merged live properties) is rejected. This document
maps the machinery AS IT IS; it does not design the change.

## Summary

- The structure-mark pipeline exists end-to-end, unused: a markSpec with tag + attrs
  and no markStyleLinks edge renders plain tag + attrs, no styler (findings 3, 7).
- The typeSpec problem is confirmed: generic-inline is absent from nodeSpecToTypeSpec;
  demoted wrappers attenuate resolution to the nearest registered ancestor, and
  measurement (textblock scope) vs viewer (leaf context) converge only because the
  attenuation lands at the textblock's own resolution today (finding 4).
- Exclusivity lives in two places: generic-style excludes "_" (ALL marks), enforced
  only at the ProseMirror layer (Mark.addToSet); ingest writes marks directly and
  bypasses it. State markSpecs strong/link declare neither excludes nor group (finding 7).
- Composite intents are the single style resolver per run: pushed last (innermost
  wrapper), dedupe/sort/join at TEXT_NODE; "italic link"/"bold italic link" have no
  style patch yet (findings 1, 6).
- Change coupling: state JSON + ingest.ts + ingest.test.mjs + regenerated
  replacement-state fixture travel in ONE commit (finding 8).

## Detailed Findings

### 1. Ingest engine (`lib/js/wikipedia/ingest.ts`)

- `EmissionRule` :110-122 — mark rules carry `name`, generic rules carry `styleName`,
  both optional `combineAs` (:112-113). `IngestionOptions.demotionRules` :291;
  `Ctx.demotionRules` :526, wired :1087.
- `ingestNode` mark/generic case :946-1031, three branches:
  1. combineAs chain :953-976 — condition `combineAs !== undefined && (composite.length > 0 || hasCombinableDescendant(ctx, el))` -> `emitDemotedInline(el, marks, out, ctx, [...composite, combineAs])`. Lookahead `hasCombinableDescendant` :621-651, bounded at hard boundaries (block/atom/raw/void/split-item/skip).
  2. textless demotion :977-987 — `!hasMarkableTextDescendant(ctx, el)` (:655-682) -> `count(report.demotedMarks, ...)` + `emitDemotedInline(..., composite)`.
  3. mark push :989-1030 — `MarkDesc` :512-520 (`{kind:"style", styleName, htmlAttrs}` / `{kind:"mark", name, attrs, htmlAttrs}`); declared attrs harvested via `ctx.schemaMarkAttrs[rule.name]` (:997-999; `schemaMarkAttrsFromSchema` :347-356); an unresolved mark name falls back to intent + `count(report.unresolvedMarkRules, ...)` (:1001-1008). Descends with `[...marks, markDesc]` (:1023-1030) — outer marks first.
- `emitDemotedInline` :702-719 + `findDemotionRule` :685-699: first matching inline-node rule of the demotion table; neutral default = tag-derived typeKey (-> reserved unknown_inline via sync). `setHtmlAttrsBag` + `setHtmlTag` preserve source tag/attrs (incl. href).
- TEXT_NODE :812-851: `emittedMarks = [...marks]`; if `composite.length > 0` push ONE `{kind:"style", styleName: [...new Set(composite)].sort().join(" ")}` (:825-837); `count(report.markSets, markSetKey(emittedMarks))` (:838); `count(report.compositeMarks, styleName)` only when the joined name contains a space (:829-833). Styles serialize via `newMarkDraft(marksList, "generic-style", {"data-style-name": styleName}, htmlAttrs)` (:844-851).
- Tables: `WIKIPEDIA_MARK_RULES` :1357-1381 (b,strong -> mark strong, combineAs "bold"; i,em -> generic italic, combineAs "italic"; a -> mark link, combineAs "link"); `WIKIPEDIA_DEMOTE_RULES` :1343-1345 (* -> generic-inline); `WIKIPEDIA_BLOCK_RULES` :1239-1335 incl. three generic-inline inline-node rules (cite, bdi, .mw-reference-text); `HTML_PHRASING_RULES` :1384-1416. `ingestWikipediaDocument` :1444-1484 wires the emissionRules order (transparent, skip, raw, atoms, blocks, marks, phrasing), demotionRules, liftedRunWrapper "paragraph".

### 2. Mark schema pipeline (`models.typeroof.jsx`, `default-schema.ts`, `integration.typeroof.jsx`)

- `MarkSpecModel` (models.typeroof.jsx :256-305): attrs, inclusive (default true), `excludes` (:282, "_" = excludes all marks), `group` (:286), the non-PM `tag` (:292), spanning, code. Instances are entries of `ProseMirrorSchemaModel.marks` (`MarkSpecMapModel` :311-315).
- Reserved `generic-style` (default-schema.ts :198-243): `excludes: "_"` (:200), attrs data-style-name + htmlAttrs, parseDOM `{priority: 60, tag: "*[data-style-name]"}` (:207-230), toDOM replays the bag (:231-241). The ONLY reserved mark today (reserved names skip state overrides with a console.warn, integration :877-883).
- `createProseMirrorSchemaFromMetaModel` mark loop (integration :875-914): 1:1 copy of every non-attrs/non-tag key when non-empty (:884-892 — this is where excludes/group pass through); `parseDOM=[{tag}]` + getAttrs/toDOM closures selected by htmlAttrs presence (:895-910; `_createEditableGetAttrs` :720-739 collects foreign attrs into the bag minus declared names and styler-owned attrs; `_createEditableToDOM` :742-756 replays the bag). Reserved marks merged LAST (:914-916) — cannot be overridden.
- Bag guards (`lib/js/components/prosemirror/html-attrs.ts`): `HTML_ATTRS_GUARD` :7-8 (data-node-type|data-mark-type|data-style-name|on|^style$), `isStylerOwnedAttr` :21 ("lang"), `collectHtmlAttrsToBag` :24-36, `htmlAttrsBagToSpec` :38-64 (javascript: URL hardening). Ingest policy mirror ingest.ts :1427-1436.

### 3. Wrap descriptors and rendering (`derivations.mjs`, `viewer.typeroof.jsx`)

- `getWrapMarks` (derivations.mjs :418-515) iterates `marksList.value.toReversed()` (:439) — inside-out, innermost wrapper first. Three branches: `generic-style` -> kind "intent", `styleLinkName = attrs["data-style-name"]`, tag from the effective intentStyleLinks edge else "span" (:450-470); reserved (`defaultSchemaSpec.marks`) -> kind "native" (:471-477); markSpec -> kind "mark", tag from `mmMarkSpec.get("tag")` (:478-486). For native/mark: `styleLinkType = "markStyleLinks"`, `styleLinkName = markType`, `styleName = edge.stylePatch` ONLY IF an edge exists (:487-497). Gated by `applyStyleLinks = context.hasTypeSpecStyling !== false` (:432-438).
- Viewer: `_provisionWidgets` (viewer :976-1024) resolves the typeSpec path from the leaf context; `_createWrapperDOM` (:931-947) creates each wrapper, replays the bag, sets `data-style-name`/`data-mark-type` when non-null, nests via `markElement.append(current)`, mounts `wrapResults.at(-1)`. `_createStylerWidgets` (:949-974): early-out on `hasTypeSpecStyling === false`; `if (!styleLinkName) continue;` (:962); a non-null styleLinkName with no registered styleLinkProperties@ id -> `getStyleLinkPropertiesId` returns null -> empty dependency mapping (:868-873).
- KEY confirmation: a markSpec mark with NO markStyleLinks edge renders its declared tag + bag, `data-mark-type` AND `data-style-name` (= markType), NO styler, descriptor `styleName === null`. The unstyled path exists end-to-end; a permanently-edge-less mark has never been instantiated (both state marks have edges).

### 4. Type-spec resolution and the generic-inline attenuation (the problem)

- `pathOfTypes` = root->node typeKeys (derivations.mjs :274, threaded via `childrenContext` :277-289); the text-run context excludes the own "text" (document-nodes-meta/index.mjs :1210-1212).
- `getTypeSpecPropertiesIdMethod` (integration :190-286): last typeKey -> `nodeSpecToTypeSpec.get(typeKey).link`; absolute "/" = origin-anchored, "./" / bare = parent-anchored (recursive on the parent chain; explicit hits skip `excludeFromFallback`); empty/absent link -> `_getBestTypeSpecPropertiesId` (:113-170) walks `testPath.slice(0, -2)` toward root until a registered typeSpecProperties@ id is found.
- Case 1 — text with marks directly in paragraph/h1: the parent typeKey IS linked (heading-1 -> /headings/h1) -> marks resolve at the heading typeSpec.
- Case 2 — text inside demoted generic-inline wrappers: generic-inline ABSENT from nodeSpecToTypeSpec (state JSON :893-985, verified) -> `typeSpecLink = ""` -> the fallback walk skips every generic-inline level to the nearest registered ancestor. The wrappers attenuate; per-context typeSpec attachments (a child typeSpec per parent) would be needed to give them specs — the combinatorial problem.
- Divergence surface: composition measures with the TEXTBLOCK scope (`_styleResolutionContext`, index.mjs :901-911, on the parent element) while the viewer renders with the LEAF context (incl. the wrappers, viewer :981-990) — both converge today only because the attenuation lands at the textblock's own resolution.

### 5. Composition controller and the exclusivity contract (`text-composition/composition-controller.ts`)

- `_buildInlineItems` :568-620 walks the textblock inline content: text -> leaf with `styleLinkPropertiesId = _resolveLeafStyleLink(...)`; generic-inline children recurse as `inlineContainer`; contentless children are `inlineAtom` with a null leaf.
- `_resolveLeafStyleLink` :635-684: skips descriptors with `styleLinkName == null || styleName == null` (:657-661), collects `getStyleLinkPropertiesId(...)` ids for the rest; `ids.length > 1` -> `console.error("CONTRACT VIOLATION ... style links are EXCLUSIVE (styleLinkProperties@ is the full story) ... using the innermost.")` (:674-681). This guard is why bc48fdb9 collapses chains into ONE composite intent instead of stacking strong + link marks.
- Resolved ids feed per-run measurement (font, axes, features, language, direction, fontSize) from the registered styleLinkProperties@ entry, textblock style as fallback (:887-930, :1150-1172).

### 6. The demo state (`lib/js/wikipedia/type-stage-wikipedia-initial-state.json`)

- `proseMirrorSchema.marks` :858-895: `strong {tag:"strong"}` (no attrs/excludes/group), `link {attrs:[href, htmlAttrs], tag:"a"}`.
- `intentStyleLinks` :156-181: italic, bold, composite "bold italic" (tags em/strong/strong). `markStyleLinks` :183-197: strong -> bold, link -> link.
- `stylePatchesSource`: italic (Simple, slnt), bold (Simple, wght 700), "bold italic" (`stylePatchTypeKey: "CompositeStylePatch"`, `styles: ["bold","italic"]`, :235-243), link (Simple, OKLCH textColor). `editingStylePatch: "./link"`. GAP: no "italic link" / "bold italic link" patches, though ingest already emits those intents (unstyled until declared).
- `nodeSpecToTypeSpec` :893-985: heading-1/2/3, paragraph, paragraph-2, figcaption, li-inline, li-block, generic-block, section, sub-section — NO generic-inline. typeSpec children: headings (relativeFontSize 4.57/1.79/1.29, wght 700/600/550), paragraphs t1/t2, generic, section, sub-section.

### 7. ProseMirror mark-set semantics — where exclusivity is enforced

- `Mark.addToSet` (prosemirror-model/src/mark.ts :24-47): same-type mark replaced (`this.eq(other)`); a mark whose type the EXISTING set excludes is NOT added. `MarkType.compile` (prosemirror-model/src/schema.ts :621-624): `excludes "_"` -> excluded = ALL mark types.
- Consequence: generic-style cannot coexist with ANY mark at the PM layer — in PM editor-mode mutations, adding generic-style evicts every other mark, and adding another mark onto a run carrying generic-style is rejected. The INGEST path bypasses this: ingest writes the document marks list directly; only PM-schema edits normalize through addToSet.
- State markSpecs strong/link declare neither excludes nor group today — default: each excludes only itself, so they coexist freely with each other (and with new structure marks) at the PM layer.

### 8. Patterns to mirror

- State markSpec shape (finding 6): a new tag+attrs mark is `["name", {attrs: [[href...], ["htmlAttrs", ...]], tag: "a"}]` — integration builds the round-trip closures from this alone.
- Test harness (`lib/js/wikipedia/ingest.test.mjs`): `ingestTest` :186-197 (empty engine + composed standard table), `loadStateSchema` :198-205 (real state schema), `kids` :27, `typeKey` :28, `marksOf` :30-34, `allMarksOf` :35-43, local `attrOf` :1404-1408. The "nested-mark collapse (combineAs)" describe :1402-1547 asserts node demotion today (`typeKey(emNode) === "generic-inline"`, `attrOf(emNode, "htmlTag") === "em"`, `marksOf(text) === [["generic-style","italic link"]]`, `report.compositeMarks`) — the describe a mark push rewrites into marks-stack assertions. "demotionRules option" :1652-1714 (textless case — stays).
- Fixture `lib/js/tests/fixtures/type-stage-wikipedia-replacement-state.json`: frozen full state, sole importer the state-replace stale-width regression (`lib/js/tests/type-stage-document-replace/stale-width-on-state-replace.test.mjs` :34). Emitted-structure changes regenerate it WHOLESALE (57e1e3dc precedent: 1898 fixture lines).
- Naming/surfacing: kebab-case typeKeys; reserved mark names cannot be overridden (integration :877-883); every state markSpec surfaces automatically in the mark_spec-manager enumeration (type-stage/index.typeroof.jsx :805-824, childrenOrderedMap) — names read raw there.
- Round-trip: viewer writes `data-style-name` on EVERY mark wrapper with a non-null styleLinkName — for markSpec marks that is the markType (derivations :490) — plus `data-mark-type`; generic-style's parseDOM catch-all `*[data-style-name]` at priority 60 (default-schema :207-230) outranks any schema-mark rule (default 50) — a structure-mark wrapper carrying data-style-name would re-parse as generic-style intent in PM DOM-parsing contexts (paste/initial parse).
- Git bundling: bdba82a1 (state only) / 2ec5f248 (state + ingest rule) / bc48fdb9 (ingest + tests) / 57e1e3dc (ingest + tests + fixture). A mark push expects state JSON + ingest.ts + ingest.test.mjs + regenerated fixture in ONE commit.

## Code References

Primary map (details inline above):

- `lib/js/wikipedia/ingest.ts` — engine: rules :110-137, MarkDesc :512-520, lookaheads :621-682, demotion :685-719, mark case :946-1031, composite push :812-851, tables :1239-1416, wiring :1444-1484.
- `lib/js/components/prosemirror/models.typeroof.jsx` — MarkSpecModel :256-315.
- `lib/js/components/prosemirror/default-schema.ts` — reserved marks :198-243, unknown_inline :161-189.
- `lib/js/components/prosemirror/html-attrs.ts` — guards :7-70.
- `lib/js/components/prosemirror/integration.typeroof.jsx` — schema conversion :793-918, typeSpec resolution :113-286, MarkView :480-586.
- `lib/js/components/layouts/type-stage/document-nodes-meta/derivations.mjs` — rendering plan :177-300, style links :390-413, getWrapMarks :418-515.
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs` — styleResolution context :892-911.
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx` — wrapper DOM :931-947, stylers :949-974, provisioning :976-1024.
- `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts` — items :568-620, exclusivity guard :635-684, measurement :887-930.
- `lib/js/wikipedia/type-stage-wikipedia-initial-state.json` — marks :858-895, links :156-197, patches :200-262, nodeSpecToTypeSpec :893-985.
- `lib/js/wikipedia/ingest.test.mjs` — harness :8-205, combineAs describe :1402-1547, demotionRules describe :1652-1714.
- `node_modules/prosemirror-model/src/mark.ts` :24-47, `node_modules/prosemirror-model/src/schema.ts` :621-624 — PM mark-set semantics.

## Open Questions

(To resolve in /create_plan; operator calls marked.)

1. Structure-mark naming — strong/link are taken as style marks; kebab-case; names surface
   raw in mark_spec-manager. Candidates: tag-strong/tag-em/tag-a, html-*, struct-*.
   OPERATOR.
2. Excludes policy encoding — generic-style excludes "_" (reserved, default-schema.ts
   :200) evicts ALL marks at the PM layer; structure marks must coexist with the
   composite generic-style per run. Narrowing to group "style" / excludes "style" touches
   the RESERVED schema (code); state markSpecs carry excludes/group through the 1:1 copy
   (integration :884-892). Where is "structure marks never style-resolve" encoded —
   schema-level excludes/group, ingest-only construction, or both?
3. data-style-name on structure wrappers — styleLinkName defaults to markType for
   markSpec marks (derivations :490), so structure wrappers would carry data-style-name:
   cosmetic noise AND a parse-back hazard vs the priority-60 generic-style catch-all
   (default-schema :207-230). Decide: emit data-style-name only on style-resolving
   (intent) wrappers, or structure markSpecs opt out.
4. Missing composite patches — "italic link" / "bold italic link" intents are emitted
   but have no stylePatchesSource entry. Add CompositeStylePatches in the state now or
   declare the gap?
5. markSets report semantics — markSetKey (ingest :498-504) will include structure-mark
   names in run keys; existing assertions shift. Also: own report counter for structure
   marks (per-tag inlineNodes is the model) or none?
6. Same-type structure marks — PM allows one mark per type per run (same-type replaced,
   mark.ts :24-47); nested same-tag chains (<em><em>) dedupe to one structure mark —
   ingest-side dedupe policy.
7. Fixture + test blast radius — regenerate the replacement-state fixture + rewrite the
   combineAs describe; confirm no other test asserts generic-inline demotion.
