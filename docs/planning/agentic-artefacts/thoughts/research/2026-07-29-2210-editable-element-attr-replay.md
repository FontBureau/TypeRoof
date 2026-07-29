---
date: 2026-07-29T22:10:00+02:00
git_commit: 1d46a3d3b36aff37e7b73dc3177aed2ec2e21441
branch: demo/wikipedia
repository: TypeRoof
topic: "Editable-element attr replay (Q1): collect-all/replay-all attributes on editable elements"
tags: [research, codebase, wikipedia, ingest, prosemirror, attributes, htmlAttrs, generic-style]
status: complete
---

# Research: Editable-Element Attr Replay (Q1)

## Research Question

Implement "editable-element attr replay" (Q1 of the ingest-fidelity arc, the
follow-up seeded by the reproducing-atom-nodes plan): collect all attributes at
ingest and replay them to HTML on elements that **stay editable** — generic-style
intent marks, links/semantic marks, paragraphs/blocks, inline nodes. The
operator expects it to work similar to the reproducing-atom sprint. This
document maps what exists today that the implementation touches.

## Summary

- **The bag machinery is fully reusable**: `collectHtmlAttrs` + the conjunctive
  matcher policy (`ingest_next.ts:147–238`), `_applyHtmlAttrsBag` +
  `_HTML_ATTRS_GUARD` (`integration.typeroof.jsx:530–570`) already do
  collect/replay/parse for reproducing atoms; the guard already excludes
  `style`, `on*`, and all TypeRoof markers.
- **Collection is currently stored ONLY for reproducing atoms** (:526). Every
  editable element class drops attributes at a known site: generic-style intent
  marks store only `data-style-name`; semantic marks store only spec-declared
  attrs; blocks and inline nodes read no DOM attributes at all.
- **A declared bag attr round-trips** metamodel↔PM in both directions for marks
  and nodes (PM `computeAttrs` keeps declared attrs; metamodel copies all
  attrs). For schema-defined types the bag is declared via
  `AttributeSpecMapModel` (metamodel-owned); for `generic-style` it must be
  added to the hardcoded reserved spec in `default-schema.ts` (metamodel
  cannot override reserved names).
- **Replay hooks exist and are thin**: `ProsemirrorMarkView` skips
  `generic-style` in `_applyDeclaredAttrs` (:341) — a bag-aware path is
  needed there; `ProsemirrorNodeView`'s non-atom branch writes nothing on the
  outer element except `data-node-type` (:206–208) — the bag hook is obvious
  (constructor + `update()`).
- **Merge semantics are milder than feared**: nothing in TypeRoof writes
  `class` on document elements (replayed classes are collision-free);
  `style` is guard-excluded everywhere already; the styler only writes
  style-properties + `lang`; `UIDocumentStyleStyler.destroy()` resets only
  `element.style` (:725–727), leaving other attributes alone.
- **The round-trip answer is "bag-aware `getAttrs`"** (option B+E from the
  options discussion): if editable types' `parseDOM.getAttrs` collects foreign
  attributes into the declared bag, PM reparses *preserve* them through its own
  machinery — no `ignoreMutation` extension needed. Today paragraph & co.
  have no `getAttrs` at all (added only when attrs are declared, :625–626),
  so foreign attributes are silently dropped on reparse.
- **One sharp edge**: `_swapMarkElement` (intent→tag swap,
  type-spec.typeroof.jsx:1041–1045) creates the swapped element with ONLY
  `data-mark-type` + `data-style-name` and discards everything else —
  replayed attributes on intent marks would be lost on every tag swap unless
  the swap re-applies the bag from the mark's attrs.

## Detailed Findings

### 1. Collection gaps at ingest (`lib/js/wikipedia/ingest_next.ts`)

| Element class | Emission site | Attrs today |
|---|---|---|
| generic-style intent marks | :598–608 (fallback), :302–310 (`newGenericStyleMarkDraft`) | all DOM attrs counted in `report.skippedMarkAttrs` (:600–601), **none stored**; only `data-style-name` written (:307–309) |
| semantic marks | :576–597 | only spec-declared attrs harvested (:579–584); rest counted; bag plays no role |
| KNOWN_BLOCK_TAGS (blocks) | :543–552 | attrs never read, counted, or stored |
| INLINE_TAGS (inline nodes) | :618–624 | attrs never read, counted, or stored |
| reproducing atoms | :518–531 | **the only `collectHtmlAttrs` storage** (:526, `htmlAttrs` + `html`) |

Pipeline notes: `MarkDesc` (:415–417) is `{style}` (no attrs) or
`{mark, name, attrs}`; marks accumulate while descending and materialize on
text drafts (:483–493). Blocks reset marks (`:550`, "marks do not cross block
boundaries"). The conjunctive matcher policy (`HtmlAttrMatcher`/
`HtmlAttrPolicy`/cloning, :147–209) and `collectHtmlAttrs` (:220–238) are
ready-made; only 2 call sites exist (:526, :736–744 configured variant).

Metamodel→PM for marks (integration.typeroof.jsx:934–946): **all** metamodel
mark attrs are passed wholesale to `schema.mark(type, attrs)` — nothing is
filtered metamodel-side; only spec-declared attrs reach the DOM
(`_applyDeclaredAttrs`), the rest stays in-memory/PM-attrs (a legitimate
carrier for the bag).

### 2. generic-style spec + MarkView replay surface

- Reserved spec (`default-schema.ts:191–214`): `excludes: "_"`,
  `attrs: { "data-style-name" }`, `parseDOM` priority 60 with
  `tag: "*[data-style-name]"` + `getAttrs` reading only
  `data-style-name`, `toDOM` span. It is merged LAST into the built schema
  (integration:679); metamodel `MarkSpecModel` named `generic-style` is
  skipped with a warning (integration:645–650) — **the bag attr for
  generic-style must be edited into `default-schema.ts` directly** (attrs +
  `getAttrs` collection + `toDOM`).
- Round-trip of a declared attr on `generic-style`: PM→metamodel copies all
  mark attrs (integration:898–908); metamodel→PM passes all to
  `schema.mark("generic-style", attrs)` (:935–946); `computeAttrs` keeps
  declared keys — a declared bag survives.
- `ProsemirrorMarkView` (integration:304–407): constructor sets
  `data-mark-type` always + `data-style-name` for generic-style (:316–323);
  `_applyDeclaredAttrs` **returns immediately for generic-style** (:341) and
  reconciles declared attrs 1:1 (set/remove) for schema marks (:343–361);
  `update()` reuses generic-style views only when `data-style-name` is
  unchanged (:369–375), re-applies declared attrs for schema marks (:378–380);
  `ignoreMutation` ignores ALL attribute mutations on its own element
  (:399–401) — replay writes on mark elements are invisible to PM's
  domObserver already.
- **`_swapMarkElement`** (type-spec.typeroof.jsx:1037–1064): builds the
  replacement element with exactly `data-mark-type` + `data-style-name`
  (:1041–1045), moves children, patches desc/markView, migrates the style
  subscription. **Any other attributes are discarded** — replayed attrs die on
  every intent→tag swap unless the swap re-applies the bag from the PM mark's
  attrs (available: `mark.attrs`).

### 3. Merge semantics (TypeRoof's DOM mutation surface)

- `UIDocumentStyleStyler` (mark elements, type-spec.typeroof.jsx:728–795):
  `style.setProperty` for font-family, --units-per-em, --ascender,
  --descender, background-color, color, direction, font-size,
  font-feature-settings, font-variation-settings; `lang` attribute
  (language-tags.typeroof.jsx:507–511). `destroy()`: `element.style = ""`
  (:725–727) — resets the entire inline style, touches no other attribute.
- `UIDocumentTypeSpecStyler` (node elements, type-spec.typeroof.jsx:217–407):
  innerElement: width, text-align, direction, font-family, font metrics, color,
  font-feature/variation-settings; outerElement: --line-height,
  --margin-block-start/end, background-color, `lang`, font-size. No
  `destroy` override.
- `class` writers on document elements: **none** — the only class written is
  `unknown-style` by `UIDocumentUnkownStyleStyler` (:708–717, add/remove).
  Replayed foreign classes are collision-free.
- `setProperty` merges per-property into the inline style (never replaces the
  attribute); `style` itself is guard-excluded from bags both at collection
  (`_HTML_ATTRS_GUARD`, integration:530–531) and at parse.
- `ignoreMutation` today: MarkView ignores all attribute mutations on its own
  element (:399–401); NodeView only for reproducing atoms (:289–295). A
  replayed class write on an editable NODE element would surface as an
  attributes mutation → `readDOMChange` → reparse; **bag-aware `getAttrs`
  makes such reparses lossless** (re-collected into the declared bag), so no
  `ignoreMutation` extension is required if parse-side collection exists.

### 4. Editable-node replay surface + parse behavior

- `ProsemirrorNodeView` non-atom path (integration:178–261): outer element
  gets only `data-node-type` (:206–208); inner `contentElement` is
  `contentDOM`/:stylerDOM (:226–235); `structuralElements {outer, inner}`
  (:243–250). Bag hook points: after `this.dom = element` (:210) and in
  `update()`'s non-atom branch (:263–270, currently touches nothing).
- `_createGetAttrs` (:493–505): reads only declared attrs, coerces; foreign
  attributes invisible. Generated `getAttrs` is added **only when the spec
  declares attrs** (:625–626) — paragraph & co. have none, so reparses drop
  foreign attributes silently; `data-node-type` is re-added by the view, not
  by parse/toDOM.
- Declared bag attr on schema nodes: round-trips metamodel↔PM (forward
  :1006–1014, backward :912–923) as long as it is declared (`_createPMAttrs`,
  :472–488).
- Styling subscription for editable nodes (type-spec.typeroof.jsx:473–614):
  outer zone + styler write style-properties/`lang` on outer only; outer-zone
  widgets append children only when outer ≠ inner. No collision with replayed
  classes; reuse the existing guard for the bag hook.

## Mapping Needs → Existing vs. Missing

| Need | Exists | Missing |
|---|---|---|
| Bag collection + policy | `collectHtmlAttrs`, conjunctive matchers, cloning (:147–238) | call sites for intent marks (:302–310), blocks (:543–552), inline nodes (:618–624) |
| Bag storage | free-form metamodel attrs; declared-attr round-trip both ways | declaration on `generic-style` reserved spec (default-schema.ts edit) |
| Bag replay (marks) | `_applyHtmlAttrsBag` + guard; `_applyDeclaredAttrs` for schema marks | bag path for `generic-style` in `ProsemirrorMarkView` (skipped today, :341) |
| Bag replay (nodes) | hook points identified (:210, :263–270) | outer bag application in non-atom `ProsemirrorNodeView` |
| Reparse stability | `ignoreMutation` covers mark elements fully | bag-aware `getAttrs` on editable types (else foreign attrs drop on reparse, :625–626); `_swapMarkElement` re-applying the bag (:1041–1045) |
| Merge policy | guard excludes style/on*/markers; class is collision-free | naming decision for the bag attr per type |

## Code References

- `lib/js/wikipedia/ingest_next.ts:147–238` — matcher policy + collectHtmlAttrs
- `lib/js/wikipedia/ingest_next.ts:302–310` — newGenericStyleMarkDraft (only data-style-name)
- `lib/js/wikipedia/ingest_next.ts:518–531, 543–552, 576–608, 618–624` — emission sites per element class
- `lib/js/components/prosemirror/default-schema.ts:191–214` — generic-style reserved spec
- `lib/js/components/prosemirror/integration.typeroof.jsx:304–407` — ProsemirrorMarkView (replay surface, ignoreMutation)
- `lib/js/components/prosemirror/integration.typeroof.jsx:493–570` — _createGetAttrs/_createToDOM/_applyHtmlAttrsBag/reproducing get+toDOM
- `lib/js/components/prosemirror/integration.typeroof.jsx:625–626` — getAttrs only when attrs declared
- `lib/js/components/prosemirror/integration.typeroof.jsx:178–295` — ProsemirrorNodeView (non-atom path, replay hooks)
- `lib/js/components/prosemirror/integration.typeroof.jsx:898–946, 1006–1014` — metamodel↔PM attr round-trip
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:217–407` — UIDocumentTypeSpecStyler mutation surface
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:708–795` — UIDocumentUnkownStyleStyler / UIDocumentStyleStyler
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1037–1064` — _swapMarkElement (discards foreign attributes)

## Open Questions

1. **Bag attr naming**: `htmlAttrs` everywhere (consistent with reproducing
   atoms) vs. `data-style-attrs` for `generic-style` (signaling reserved
   intent-marks)? Consistency favors `htmlAttrs`.
2. **Scope of intent-mark bags**: should generic-style intent marks carry the
   bag at all, or only editable nodes (blocks/inline) + semantic marks? The
   operator's framing includes intent marks; the swap-machinery edge (below)
   only matters if they do.
3. **Semantic marks**: keep declared-only harvest, or add the bag alongside
   (declared attrs typed + bag for the tail)?
4. **`_swapMarkElement`**: re-apply the bag from `mark.attrs` after the swap
   (the swapped element currently keeps only the two data-* markers).
5. **parse-side collection scope**: bag-aware `getAttrs` for every schema node
   type with a declared `htmlAttrs` attr (inference, like reproducing atoms'
   `html` attr) vs. an explicit flag; and for `generic-style` in
   `default-schema.ts` (edit its `getAttrs`).
6. **`id` on editable elements**: the mw-prefixed-ids decision from the atom
   sprint carries over, but editable content can be duplicated in-editor —
   duplicate-id risk needs a conscious call.
7. **Merge of replayed `class` with future TypeRoof classes** (e.g. editing
   states): nothing writes class today; if that changes, class needs a merge
   strategy instead of verbatim replay.
