---
date: 2026-07-28T19:05:00+02:00
git_commit: 897109aad5d6563835621f4f1b854d589d922831
branch: demo/wikipedia
repository: TypeRoof
topic: "Ingest fidelity: collect-all/replay-all attributes and selector-configured reproducing atom nodes"
tags: [research, codebase, wikipedia, ingest, prosemirror, attributes, raw-html, atom-nodes]
status: complete
---

# Research: Ingest Fidelity — Attr Replay + Reproducing Atom Nodes

## Research Question

Two related questions from the operator (2026-07-28):

1. **Collect-all → replay-all attributes via ingest** — feasible? Goal: recreate
   the original ingested Wikipedia HTML more faithfully; Wikipedia-specific
   attributes (`rel="mw:ExtLink"`, `typeof`, `about`, `data-mw`, class, id,
   title…) reproduced correctly.
2. **Reproducing atom nodes** — a mechanism like `raw_html_block` but explicitly
   using the *collected tag* (plus maybe collected attrs) as the outer tag, **no
   additional wrapper**, treated as atoms; matched by CSS selector
   (e.g. `MW_INLINE_CITATION = 'sup[typeof="mw:Extension/ref"]'`), and
   **configurable per schema** as general default TypeRoof behavior.

This document describes what exists today that both questions touch.

## Summary

- **The selector infrastructure exists and is already Wikipedia-flavored**:
  `SELECTORS_TO_RAW_HTML` in ingest is a hardcoded list that *already contains
  the operator's citation example* (`sup[typeof="mw:Extension/ref"]`), checked
  **first** in the dispatch order. The newer `markEmission` option is an
  ordered first-match-wins selector list (same `el.matches` pattern).
- **Reproducing atoms almost exist**: `raw_html_block`/`raw_html_inline` are
  `atom: true` reserved node types storing verbatim `outerHTML` in a declared
  `html` PM attr that round-trips metamodel↔PM cleanly. But their `toDOM`
  **wraps** the stored HTML in an extra `div`/`span` (with a lime debug
  outline) — "no additional wrapper" does not exist today.
- **Schema-configurable node matching does not exist**: ingest consults the
  schema **only for marks** (`semanticMarksFromSchema`); block/inline node
  recognition is the hardcoded `KNOWN_BLOCK_TAGS`/`INLINE_TAGS` tables.
  `NodeSpecModel` has `atom`, `inline`, `tag` (and more) but **no
  `selector` field**.
- **Attr storage is solved; attr *declaration* is the constraint**: the
  metamodel document stores free-form JSON attrs per node/mark, but PM's
  `computeAttrs` **silently drops** any attr not declared in the schema on
  `NodeType.create` — "collect-all" must therefore ride either declared attrs
  or a single declared bag attr.
- **Replay exists for marks, not for nodes**: `ProsemirrorMarkView` applies
  declared attrs to the DOM (construction + in-place `update()`);
  `ProsemirrorNodeView` writes only `data-node-type` — there is no node-side
  attr replay. Marks are never put in the metamodel↔PM cache, so mark-level
  replay can only come from PM attrs (declared), not from the metamodel.

## Detailed Findings

### 1. Raw HTML atoms today (the Q2 baseline)

**Definitions** — `lib/js/components/prosemirror/default-schema.ts`:
- `raw_html_block` (:78–99): `atom: true`, `group: "block"`,
  `attrs: { html: { default: "", validate: "string" } }` (declared PM attr),
  `parseDOM: [{ tag: "div[data-raw-html-block]", getAttrs → { html: dom.innerHTML } }]`,
  `toDOM`: real `div[data-raw-html-block]` with `outline: 2px solid lime`
  and `innerHTML = node.attrs.html` ("actual HTML injection, no sanitization
  (operator decision)").
- `raw_html_inline` (:103–123): same shape with `inline: true`,
  `group: "inline"`, `span[data-raw-html-inline]`.
- So: the stored element is **not** the outer DOM; the wrapper carries the
  `data-raw-html-*` marker and the debug outline. HTML enters via
  `innerHTML` assignment on the wrapper (no fragment parsing).

**No NodeView for raw_html types** — nodeViews are registered **only for
metamodel-defined node names** in `update()`
(`lib/js/components/prosemirror/integration.typeroof.jsx:1101–1127`, loop over
`proseMirrorSchema.get("nodes")` keys → `this._createGenericNodeView`).
Reserved default-schema types (raw_html, unknown*, doc, text, hard_break) never
enter that map; PM renders them via the spec `toDOM`. Atom behavior comes
from the PM spec (`atom: true`), not from any view code.

**Ingest emission** — `lib/js/wikipedia/ingest_next.ts`:
- `MW_EMPTY_ELT = ".mw-empty-elt"` (:84), `MW_INLINE_CITATION = 'sup[typeof="mw:Extension/ref"]'` (:87),
  `SELECTORS_TO_RAW_HTML = [MW_EMPTY_ELT, MW_INLINE_CITATION].join(", ")` (:89).
- `emitRawHtmlAtom(el, inInline, out)` (:284–291): typeKey
  `raw_html_inline`/`raw_html_block` by context, attr
  `html = el.outerHTML` (verbatim, via `toMetaModelJSON`).
- Dispatch order in `ingestNode` (:320–471): text (:329) → non-elements
  dropped (:359) → **`el.matches(SELECTORS_TO_RAW_HTML)` first (:366–372)**,
  counted in `report.mwEmptyElts` → `transparentContainers` (:374) →
  `KNOWN_BLOCK_TAGS` (:379) → block-context catch-all → `raw_html_block`
  (:391–405) → `KNOWN_MARK_TAGS` (:408) → `BR` (:449) → `INLINE_TAGS`
  (:454) → inline catch-all → `raw_html_inline` (:462–470).

**Round-trip of `html`**: declared PM attr with default `""`, so it always
round-trips: PM→metamodel via `_rawCreateMetamodelNode` (integration:782–833,
attrs copied through `toMetaModelJSON`); metamodel→PM via
`_rawCreateProseMirrorNode` (:835–954, `schema.node(pmTypeName, attrs, …)`).
Metamodel document attrs are `AttrsMapModel` = ordered map of `JSONModel`
(models.typeroof.jsx:506–511) — **free-form JSON per attr value**, typed per
value by `JSONTypeModel` enum (:454), not by any spec.

### 2. NodeSpec model + NodeView layer (Q2's schema side)

**`NodeSpecModel`** (`lib/js/components/prosemirror/models.typeroof.jsx:131–249`)
fields in order: `content` (OrEmpty), `marks` (OrEmpty), `group` (OrEmpty),
`tag` (OrEmpty, explicitly *not* a PM NodeSpec field, comment :153),
`inline` (bool), **`atom` (bool, exists, :166)**, `attrs`
(AttributeSpecMapModel), `selectable` (default-true bool), `draggable`,
`code`, `definingAsContext`, `definingForContent`, `isolating`,
`linebreakReplacement` (all bool). **No `selector` field.** `whitespace`,
`defining`, `toDOM`, `parseDOM`, `toDebugString`, `leafText` are
commented out as "implement dynamically".

**`MarkSpecModel`** (:250–300): `attrs`, `inclusive` (default-true),
`excludes` (OrEmpty), `group` (OrEmpty), `tag` (OrEmpty), `spanning`
(default-true), `code`. No `selector`.

**Mapping to PM** (`createProseMirrorSchemaFromMetaModel`,
integration:497–585): reserved-name collisions skipped with warn (:511–517,
:559–565); every non-empty struct field except `attrs`/`tag` copied 1:1
(includes `atom`, `inline`, `selectable`, `draggable`, `isolating`…);
`tag` generates `parseDOM = [{ tag, getAttrs? }]` and
`toDOM = _createToDOM(tag, attributeSpecMap)` (:530–546/:576–592). PM's
`parseDOM` `tag` accepts CSS selectors (the generated rule just passes the
string through), and ingest matches via `el.matches` — both sides already
speak selector syntax.

**`ProsemirrorNodeView`** (integration:178–276) — only for metamodel-defined
node types: resolves the metamodel spec's `tag` via
`widgetBus.getLinked(node.type.schema)` (:205), creates outer
`<tag data-node-type>` element plus an **inner content `div`** as
`contentDOM` and `_stylerDOM` (two-element wrapper, :215–227), subscribes to
the styling machinery with `structuralElements {outer, inner}` (:228–246).
`update()` always returns `true` (:252–267). **No atom/leaf special-casing;
`contentDOM` is always set.**

**PM atom semantics** (node_modules/prosemirror-model/dist/index.js):
`NodeType.isAtom` (:2130) = leaf (empty content match) or `spec.atom`;
prosemirror-view: `domAtom` (:1513), full redraw for atoms (:1952),
`NodeSelection` as a unit on click/arrow keys (:3263–3264, :2465–2468),
uneditable content. `NodeSpecModel.selectable`/`draggable` map onto PM's
selection/drag behavior.

### 3. The attributes pipeline (Q1's baseline)

**Storage (solved)**: metamodel `NodeModel`/`MarkModel` attrs are free-form
JSON (`AttrsMapModel`, models.typeroof.jsx:506–511; `toMetaModelJSON`/:614,
`fromMetaModelJSON`/:592). Wikipedia attrs could live there today.

**The PM constraint**: `computeAttrs`
(node_modules/prosemirror-model/dist/index.js:2043) iterates **only declared
attr names** on `NodeType.create`/`createChecked` — undeclared attrs are
**silently dropped**; missing declared attrs without default throw. So
collect-all cannot ride as loose PM attrs; it needs either per-attr
declaration or one declared bag attr per type.

**Schema attr declaration (exists, Phase 1)**: `AttributeSpecModel`
(models.typeroof.jsx:107–127: `default` StringModel, `validate`
AttrValidateModel) → `_createPMAttrs` (integration:444, coerced defaults +
validate strings), `_createGetAttrs` (:465, parseDOM reads declared attrs 1:1,
absent ones left out for PM defaults), `_createToDOM` (:481, serializes
declared attrs into DOMOutputSpec).

**Harvest at ingest (marks only)**:
- Semantic marks: declared attrs harvested via `el.getAttribute`
  (ingest_next.ts:413–431); every *other* element attr counted in
  `report.skippedMarkAttrs` as `"tag.attr"` and dropped.
- `INLINE_TAGS` elements (:454–460): emitted as inline nodes
  (`typeKey = tag.toLowerCase()`) — **attrs neither read, stored, nor
  counted**.
- `KNOWN_BLOCK_TAGS` elements (:379–389): **attrs neither collected nor
  counted**.
- Raw atoms: attrs survive only inside the verbatim `outerHTML` string.

**Replay**:
- Marks: `ProsemirrorMarkView._applyDeclaredAttrs` (integration:312–335) —
  metamodel declared attr names (fallback: PM spec attrs), setAttribute/
  removeAttribute, at construction (:299) and in-place on `update()` (:343).
  `ignoreMutation` (:371) suppresses PM reparse for attribute mutations on
  the view's own element (the styling machinery legitimately mutates
  `style`/`lang`).
- Nodes: **no equivalent** — `ProsemirrorNodeView` writes only
  `data-node-type`.
- Export: `_createToDOM` is attached to generated specs; the repo has **no
  `DOMSerializer` usage**, and views are registered for all schema nodes and
  marks, so live rendering is entirely view-side.

**Cache/links**: `_nodesCache` (WeakMap, integration:616) links PM Schema →
metamodel `ProseMirrorSchemaModel` (used by both views for spec lookup),
PM Node ↔ metamodel NodeModel (:972, :1001, :1046–1050, :1157, :1188).
**Marks are never put into the cache** — a mark instance cannot currently be
resolved to its metamodel counterpart.

### 4. Selector-based configuration precedents

- `SELECTORS_TO_RAW_HTML` (ingest_next.ts:84–89): hardcoded list,
  `el.matches`, first check in dispatch.
- `markEmission` (IngestionOptions, ingest_next.ts:129–133, 135–161): ordered
  `[{ selector, rule }]` list, **first match wins** in
  `resolveMarkEmission` (:228–255); fallback chain: explicit rule →
  schema-derived mark (`semanticMarks`) → `KNOWN_MARK_TAGS` intent name.
- `semanticMarksFromSchema` (:164–177): schema marks with non-empty `tag`
  → `lowercaseTag → { name, attrs }`; "mirroring the generated parseDOM
  rules. Marks without a tag are not reachable by ingest." This is the
  template a node-side equivalent (`nodeSelectorsFromSchema`) would follow.
- `schemaMarkAttrsFromSchema` (:212–221): mark name → declared attr names.
- **No schema-derived node/block matching exists** — ingest never reads
  `proseMirrorSchema.get("nodes")`.

### 5. Unknown-type sync (how non-schema typeKeys travel)

- `UNKNOWN_NODE_TYPES = {"unknown","unknown_block","unknown_inline"}`
  (integration:401–408). Metamodel→PM: node typeKeys not in the schema are
  remapped by content shape/context to `unknown_block`/`unknown_inline`/
  `unknown` with `attrs["unknown-type"] = typeKey` (:936–946); mixed
  content logs-and-crashes (operator decision). PM→metamodel recovers the
  typeKey from the `unknown-type` attr and skips duplicating it (:786–791,
  :819–830).
- Marks have **no** unknown fallback: `schema.mark(typeKey, attrs)` is called
  directly (:~856) and would throw for marks absent from the schema.
- Reserved-name protection in `createProseMirrorSchemaFromMetaModel`
  (:511–515, :556–560): metamodel specs colliding with reserved names are
  skipped with a warning — raw_html types therefore always come verbatim from
  the default schema and cannot be customized via the metamodel today.

### 6. Reserved type inventory (`default-schema.ts`)

`doc` (:20–22, `block+`), `text` (:24–26), `hard_break` (:28–36,
inline, `selectable: false`, `br`), `unknown` (:41–73, block,
`content: "inline*"`, unknown-type attr, message toDOM), `raw_html_block`
(:78–99), `raw_html_inline` (:103–123), `unknown_block` (:126–157,
`content: "block*"`), `unknown_inline` (:158–187, inline,
`content: "inline*"`, unobtrusive span toDOM). Reserved mark
`generic-style` (:189–214): `excludes: "_"`,
`attrs: { "data-style-name" }`, `parseDOM` priority **60** with
`tag: "*[data-style-name]"` (wins ties against schema marks,
order-independent), `toDOM` span.
`paragraph`/`section`/`heading-N` are **not** reserved — they are
metamodel-schema nodes defined in the initial states
(e.g. `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`).

## Mapping the Questions to What Exists

| Need | Exists today | Missing |
|---|---|---|
| Selector matching in ingest | `el.matches` + 2 precedents (`SELECTORS_TO_RAW_HTML`, `markEmission`) | schema-driven node selectors (blocks/marks are tag-only) |
| Schema place for selectors | PM `parseDOM.tag` accepts CSS selectors; `NodeSpecModel.tag` exists | a `selector` field on `NodeSpecModel` (none today) |
| Atom node types via schema | `NodeSpecModel.atom` **exists** and maps 1:1 to PM | reproducing behavior (wrapper-free rendering) |
| Wrapper-free reproduction | verbatim `outerHTML` storage + round-trip (`raw_html_*`) | a view/toDOM that makes the stored element the outer DOM (today: wrapper `div`/`span` + lime outline) |
| NodeView for atoms | `ProsemirrorNodeView` for metamodel node types | atom/leaf special-casing (contentDOM always set today); nodeViews only registered for metamodel-defined names |
| Attr storage | free-form JSON attrs in metamodel documents | — |
| Attr replay (marks) | `_applyDeclaredAttrs` + `update()` (declared attrs only) | collect-all beyond declared attrs (PM `computeAttrs` drops undeclared) |
| Attr replay (nodes) | — | no node-side equivalent of `_applyDeclaredAttrs` |
| Metamodel identity for marks | PM Node ↔ metamodel Node cache | marks are never cached (identity problem) |
| Attr harvest coverage | semantic marks only | INLINE_TAGS and KNOWN_BLOCK_TAGS elements: attrs neither stored nor counted |

## Code References

- `lib/js/wikipedia/ingest_next.ts:84–89` — MW selectors, SELECTORS_TO_RAW_HTML
- `lib/js/wikipedia/ingest_next.ts:284–291` — emitRawHtmlAtom (verbatim outerHTML)
- `lib/js/wikipedia/ingest_next.ts:320–471` — ingestNode dispatch order
- `lib/js/wikipedia/ingest_next.ts:164–177, 212–221, 228–255` — schema derivation + selector-rule resolution
- `lib/js/wikipedia/ingest_next.ts:379–389, 454–460` — block/inline emission without attr collection
- `lib/js/components/prosemirror/default-schema.ts:78–123` — raw_html_block/inline (atom, html attr, wrapper toDOM)
- `lib/js/components/prosemirror/default-schema.ts:189–214` — generic-style reserved mark (priority 60 parseDOM)
- `lib/js/components/prosemirror/models.typeroof.jsx:131–249` — NodeSpecModel fields (atom exists, no selector)
- `lib/js/components/prosemirror/models.typeroof.jsx:454–511, 529–588, 590–653` — JSONModel/AttrsMapModel/NodeModel/MarkModel, to/fromMetaModelJSON
- `lib/js/components/prosemirror/integration.typeroof.jsx:178–276` — ProsemirrorNodeView (two-element wrapper, no atom casing)
- `lib/js/components/prosemirror/integration.typeroof.jsx:276–375` — ProsemirrorMarkView (_getTag, _applyDeclaredAttrs, update, ignoreMutation)
- `lib/js/components/prosemirror/integration.typeroof.jsx:401–408, 782–954` — unknown-type remap, metamodel↔PM conversion
- `lib/js/components/prosemirror/integration.typeroof.jsx:497–585` — createProseMirrorSchemaFromMetaModel (1:1 fields, tag → parseDOM/toDOM)
- `lib/js/components/prosemirror/integration.typeroof.jsx:1101–1127` — nodeViews registration (metamodel-defined names only)
- `node_modules/prosemirror-model/dist/index.js:2043` — computeAttrs drops undeclared attrs
- `node_modules/prosemirror-model/dist/index.js:2130` — NodeType.isAtom

## Open Questions

1. **Where should the selector config live**: on `NodeSpecModel` (new
   `selector` field, appears in the NodeSpecs UI automatically) vs. a
   schema-level selector→typeKey map? The `tag` field already feeds both
   parseDOM and ingest-mark matching for marks; nodes have no equivalent.
2. **Reproducing rendering**: extend the reserved `raw_html_*` types (new
   toDOM/NodeView without wrapper) vs. a new reserved type vs. schema-defined
   atom node types rendered by `ProsemirrorNodeView` with atom special-casing?
   Note reserved types currently cannot be customized via the metamodel
   (reserved-name skip).
3. **Precedence in dispatch**: schema-selector atoms should slot between
   `SELECTORS_TO_RAW_HTML` (:366) and `transparentContainers` (:374), or
   replace/merge the hardcoded list?
4. **Storage variant for reproducing nodes**: verbatim `outerHTML` (today's
   `html` attr) vs. decomposed tag+attrs+innerHTML (would connect to the
   attr-bag idea)?
5. **Attr-bag for collect-all (Q1)**: one declared bag attr (e.g. `htmlAttrs`
   JSON string) per type vs. declaring Wikipedia attrs individually on specs
   (works today for marks with zero code)? Exclusion list for replay
   (`style` collides with the styling machinery, `class` needs merging,
   `data-style-name`/`data-mark-type` are TypeRoof's own).
6. **Mark identity**: Q1 replay for intent/generic-style marks from the
   metamodel would need a mark↔metamodel link that does not exist (marks are
   not cached); PM-attrs-based replay (declared) avoids this entirely.
7. **`inline` flag vs. group semantics**: `raw_html_inline` sets both
   `inline: true` and `group: "inline"`; which combination new reproducing
   node types need for paragraph compatibility.
