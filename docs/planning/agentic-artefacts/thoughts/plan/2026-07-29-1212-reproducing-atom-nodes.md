# Reproducing Atom Nodes (selector-configured) — Implementation Plan

date: 2026-07-29T12:12:00+02:00
git_commit: 897109aad5d6563835621f4f1b854d589d922831
branch: demo/wikipedia
research: thoughts/research/2026-07-28-1905-ingest-fidelity-attrs-reproducing-nodes.md

## Overview

Schema-configured **reproducing atom nodes** for ingest fidelity: named,
metamodel-owned node types (per-tag) carrying a `selector`, matched by ingest
via an ordered selector list, stored with verbatim innerHTML plus collected
outer attributes, rendered **wrapper-free** as atoms (collected tag + replayed
attrs + innerHTML), and styleable per name via `nodeSpecToTypeSpec`.

Canonical case: `sup[typeof="mw:Extension/ref"]` (Wikipedia citations) →
`"cite-link"` node → `<sup typeof="mw:Extension/ref">…</sup>` verbatim in
the document, styleable, round-tripping.

## Current State Analysis

- `SELECTORS_TO_RAW_HTML` is a hardcoded 2-selector list
  (`ingest_next.ts:84–89`, incl. the citation selector), checked **first** in
  dispatch (:366–372); emits `raw_html_inline`/`raw_html_block` atoms with
  verbatim `outerHTML` in a declared `html` attr (:284–291).
- `raw_html_*` are reserved (`default-schema.ts:78–123`): `atom: true`,
  but `toDOM` **wraps** the stored HTML in an extra `div`/`span` with a
  lime debug outline; they get no NodeView (reserved types are skipped in
  `update()`, integration:1101–1127) and cannot be styled via
  `nodeSpecToTypeSpec`.
- `NodeSpecModel` (models.typeroof.jsx:131–249) has `atom`, `inline`,
  `tag`, `selectable`, `draggable` … but **no `selector`**.
- Ingest consults the schema **only for marks**
  (`semanticMarksFromSchema`:164–177); node recognition is fully hardcoded
  (`KNOWN_BLOCK_TAGS`/`INLINE_TAGS`).
- `ProsemirrorNodeView` (integration:178–276) always builds outer `<tag>` +
  inner content `div` (`contentDOM` always set, no atom special-casing);
  nodeViews register for **all metamodel-defined node names** automatically.
- PM `computeAttrs` drops undeclared attrs (prosemirror-model:2043) → the
  outer-attr bag must be a **declared** attr.
- Selector-config precedent: `markEmission` ordered first-match-wins list
  (`resolveMarkEmission`:228–255).
- PM `parseDOM` `tag` accepts full CSS selectors; ingest matches with
  `el.matches` — both sides already speak selector syntax.

## Desired End State

- A schema can declare reproducing atom node types:
  `"cite-link": { tag: "sup", selector: 'sup[typeof="mw:Extension/ref"]', atom: true, inline: true, group: "inline", attrs: { html, htmlAttrs } }`.
- Ingest routes matching elements to them (configurable ordered list +
  schema-derived fallback); non-matching same-tag elements fall through to the
  existing chain (`unknown_inline` — its raison d'être).
- Rendered output is the collected tag with replayed outer attrs and verbatim
  innerHTML — **no wrapper**, no TypeRoof marker elements; styling comes from a
  TypeSpec linked by type name.
- Round-trip stable: rendered output satisfies the spec's `selector` (the
  `:is()` trick covers source and output shapes), so paste/reparse re-matches.

### Key Discoveries:
- `NodeSpecModel` fields map 1:1 to PM (incl. `atom`) except `tag`/`attrs`
  (integration:518–546).
- The raw_html `parseDOM`/`toDOM` pair (`default-schema.ts:86–99`) is the
  template for reproducing parse/serialize (`getAttrs → { html: dom.innerHTML }`).
- `ProsemirrorMarkView.ignoreMutation` (integration:365–373) is the template
  for suppressing styler-triggered `readDOMChange` on view-owned elements.
- `ProsemirrorMarkView._applyDeclaredAttrs` (:312–335) is the replay template.
- Ingest dispatch order is fixed and known (:329–470); node matching slots in
  before :366.

## Decisions (operator)

1. **Reading A**: `tag` and `selector` live in the `NodeSpecModel`; the
   ingest list routes input → `typeKey` only (`{ selector, typeKey }`, no
   tag in ingest). Reading B (per-instance tags) and the hybrid: rejected.
2. **Per-tag named types** for v1.
3. `selector` drives **both** ingest matching (schema-derived fallback) and
   generated `parseDOM`; it may differ from the ingest-side selector —
   `:is(span,sup)[typeof="mw:Extension/ref"]` covers source + output shapes.
4. Ingest matching list: ordered, **first match wins**, redundancy OK
   (declared fallbacks).
5. `htmlAttrs`: collected outer attrs, minus an **exclusion list**, plus an
   optional **inclusion list** (when set, only those) — full author control.
   `id` is allowed (Wikipedia ids are `mw`-prefixed), decided in ingest
   config. PM attr stored as **JSON string** (PM attr equality is shallow —
   `compareObjs` — nested objects like `data-mw` would compare by reference
   and force constant redraws).
6. **Reproducing behavior is inferred** from the presence of an `html` attr
   in the spec (pivot to an explicit flag later if impractical).
7. Fall-through on selector mismatch to the existing chain is intended.
8. Ship a `cite-link` node in `type-stage-wikipedia-initial-state.json`.
9. **Small incremental commits** per phase (as marked).

## What We're NOT Doing

- Per-instance tags / generic reproducing type (Reading B), tag overrides in
  the ingest list (hybrid).
- Editable-element attr replay (Q1 proper) → **Follow-up** section below.
- Automatic schema declaration by ingest (ingest declares nodes/attrs).
- Removing `raw_html_*` types or `SELECTORS_TO_RAW_HTML` (kept as fallback).
- A `selector` field on `MarkSpecModel` (nodes only, for now).
- Byte-level output fidelity (attribute order, whitespace).

## Implementation Approach

Bottom-up: model field → ingest routing + collection → rendering → example
state. Each phase is independently verifiable and lands as 1–2 small commits.

## Phase 1: `selector` field on NodeSpecModel

### Overview
The schema can carry a CSS selector per node type; the generated `parseDOM`
uses `selector ?? tag`.

### Changes Required:

#### 1. Model
**File**: `lib/js/components/prosemirror/models.typeroof.jsx`
**Changes**: `NodeSpecModel` += `['selector', StringOrEmptyModel]` (after
`tag`). Comment: drives ingest matching and generated `parseDOM`; may cover
multiple output/source shapes via `:is()`.

#### 2. Schema creation
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: in `createProseMirrorSchemaFromMetaModel` node loop: treat
`selector` like the other non-1:1 fields — the generated `parseDOM` rule
uses `selector ?? tag` as its `tag`; `toDOM` unchanged (`tag`-driven).

#### 3. UI exposure check
**File**: `lib/js/components/layouts/type-stage/pps-maps.mjs`
**Changes**: verify `NODESPEC_PPS_MAP` maps `selector` (it maps all fields
except `attrs` — expected free); adjust only if excluded.

#### 4. Tests
**Changes**: serialization round-trip of a spec with `selector`; built schema
`parseDOM[0].tag` equals the selector when set, the tag otherwise.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck (only pre-existing TS2305), build
#### Manual: NodeSpecs UI shows a "Selector" field; state saves/loads with it

**Commits**: 1.
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 2: Ingest node routing (big list + schema-derived fallback)

### Overview
Elements can be claimed by named node types via an ordered, configurable
selector list, with a schema-derived fallback for `selector`-carrying specs.

### Changes Required:

#### 1. Options, types, resolution
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**:
- `NodeEmissionEntry = { selector: string; typeKey: string }`;
  `IngestionOptions.nodeEmission?: NodeEmissionEntry[]` (ordered, first match
  wins; redundancy = declared fallbacks).
- `nodeSelectorsFromSchema(proseMirrorSchema)`: derive
  `[{ selector, typeKey }]` from node specs **that have a non-empty
  `selector`** (deliberately NOT from `tag`-only specs — otherwise
  `paragraph`'s `tag: "p"` would hijack `KNOWN_BLOCK_TAGS`).
- `resolveNodeEmission(ctx, el)`: first matching `nodeEmission` entry →
  `typeKey`; else first matching schema-derived entry → `typeKey`; else
  `null`.
- New report bucket `reproNodes: Record<string, number>` (typeKey → count).

#### 2. Dispatch + emission
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**: in `ingestNode`, **before** the `SELECTORS_TO_RAW_HTML` check
(:366): `const typeKey = resolveNodeEmission(ctx, el);` — when non-null, emit
a reproducing atom draft (`typeKey`; `html = el.innerHTML`; `htmlAttrs`
per Phase 3 policy), `count(report.reproNodes, typeKey)`, return. Everything
else unchanged; `SELECTORS_TO_RAW_HTML` stays as fallback.

#### 3. Configured variant
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**: `ingestWikipediaDocument` gains
`nodeEmission: [{ selector: 'sup[typeof="mw:Extension/ref"]', typeKey: "cite-link" }]`
(also serves as the working example).

#### 4. Tests
**Changes**: list precedence + first-match-wins; schema-derived claim of the
citation (schema with `cite-link` selector spec, no list entry); fall-through
(`<sup>` without typeof → `unknown_inline` via existing chain);
`tag`-only specs do NOT hijack `<p>` etc.; `reproNodes` bucket counts.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: — (verified end-to-end in Phase 5)

**Commits**: 2 (2a: routing + schema derivation + emission w/o bag;
2b: tests/hardening) — 2a may temporarily emit without `htmlAttrs`.
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 3: `htmlAttrs` collection policy

### Overview
Outer attributes are collected into the declared `htmlAttrs` attr under an
exclusion/inclusion/id policy.

### Changes Required:

#### 1. Policy + collection
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**:
- `IngestionOptions.attrPolicy?: { include?: string[]; exclude?: string[]; includeId?: boolean }`.
  Defaults (baked into `ingestWikipediaDocument`, overridable):
  `exclude: ["style"]` (collides with TypeRoof styling), all `on*` handler
  attributes, TypeRoof's own markers (`data-node-type`, `data-mark-type`,
  `data-style-name`); `includeId: true` (Wikipedia ids are `mw`-prefixed;
  operator decision) — the `include` list, when set, wins over `exclude`.
- `collectHtmlAttrs(el, policy)` → **JSON string** (PM-attr equality is
  shallow; nested objects would redraw-oscillate — operator-approved trade-off).
  Wire into the Phase-2 reproducing emission.

#### 2. Tests
**Changes**: exclusion of `style`/`on*`/markers; inclusion list wins;
`includeId` true/false; output is a JSON string of the expected pairs.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: —

**Commits**: 1.
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 4: Rendering reproducing atoms (wrapper-free)

### Overview
Named atom nodes render as the collected tag with replayed attrs and verbatim
innerHTML — no wrapper — and re-parse through generated rules.

### Changes Required:

#### 1. Generated parse/serialize
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: in `createProseMirrorSchemaFromMetaModel`, when the spec has an
`html` attr (inferred reproducing — decision 6): `parseDOM = [{ tag: selector ?? tag, getAttrs(dom) { return { html: dom.innerHTML, htmlAttrs: <JSON.stringify of dom attributes, minus the Phase-3 marker exclusions> }; } }]`;
`toDOM` = function returning a real element (template: raw_html
`default-schema.ts:92–99`): create `tag`, replay `htmlAttrs`
(`setAttribute` each, skipping markers), `innerHTML = node.attrs.html`.

#### 2. NodeView atom branch
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: `ProsemirrorNodeView`: when the node type has an `html` attr
(inferred): outer = `tag` (+ `data-node-type`), apply `htmlAttrs` bag,
`innerHTML = node.attrs.html`; **no inner div, no `contentDOM` (leaf)**;
styling subscription with `structuralElements: { outer }` only. `update()`:
re-apply bag + innerHTML when changed, return `true`. Add
`ignoreMutation(mutation)` returning true for attribute mutations on
`this.dom` (template: `ProsemirrorMarkView.ignoreMutation`:365–373 — the
styler legitimately mutates `style`/`lang`).

#### 3. Tests
**Changes**: generated `parseDOM` uses `selector ?? tag` and round-trips
`html`/`htmlAttrs`; EditorView test (template: the MarkView update test):
render a `cite-link` node → outer IS `<sup typeof="…">` with innerHTML
intact and **no wrapper**; `update()` re-applies on `htmlAttrs` change.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: — (end-to-end in Phase 5)

**Commits**: 2 (4a: generated parse/serialize; 4b: NodeView atom branch).
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 5: Example state + end-to-end verification

### Overview
The wikipedia demo declares and uses `cite-link` out of the box.

### Changes Required:

#### 1. State
**File**: `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`
**Changes**: add to `proseMirrorSchema/nodes`:
`["cite-link", { "tag": "sup", "selector": "sup[typeof=\"mw:Extension/ref\"]", "inline": true, "group": "inline", "atom": true, "attrs": [["html", { "default": "", "validate": { "type": "string" } }], ["htmlAttrs", { "default": "", "validate": { "type": "string" } }]] }]`
(serialized shape verified via a model probe, like the link snippet).

#### 2. Styling link (manual/example)
`nodeSpecToTypeSpec` edge `cite-link` → a TypeSpec (operator adds in UI
during verification; optionally pre-seeded).

#### 3. Tests
**Changes**: state JSON deserializes (probe), ingest of a citation fragment
through `ingestWikipediaDocument` produces a `cite-link` node with
`html`/`htmlAttrs`.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: ingest a Wikipedia article with references → citations render as
verbatim `<sup typeof="mw:Extension/ref">` (no wrapper, no lime outline);
styling via the linked TypeSpec applies; text editing around citations treats
them as atoms (NodeSelection); HTML output reproduces the citation; re-parse
(paste/reload) keeps the node type.

**Commits**: 1.

---

## Follow-up (next RPI cycle): editable-element attr replay (Q1)

Scope for a new plan, seeded by this one (~60–70% reuse: bag collection,
policy, replay primitive, selector infrastructure, `:is()` round-trip
pattern):

- Bag replay on **editable** elements: `generic-style` intent marks, links,
  paragraphs/blocks, inline nodes that stay editable.
- Hard parts this plan deliberately avoids: **merge semantics on live editable
  elements** (replayed `class` vs. TypeRoof classes/styling on elements users
  edit); mark-side replay for `generic-style` (reserved spec, hardcoded in
  `default-schema.ts` — bag as declared PM attr there, touched carefully);
  bag-aware `getAttrs` on all types for reparse stability.
- Reference: `thoughts/research/2026-07-28-1905-ingest-fidelity-attrs-reproducing-nodes.md`
  (options A–E; decision: B+E general, A curated, D atoms — D lands here).

## Testing Strategy

### Unit Tests (vitest, colocated `*.test.mjs`)
- Model serialization incl. `selector`; schema build uses `selector` in
  `parseDOM` (Phase 1)
- Node routing: precedence, first-match-wins, schema-derived, fall-through,
  no-hijack (Phase 2)
- `htmlAttrs` policy: exclusion/inclusion/id, JSON string shape (Phase 3)
- Reproducing parse/serialize round-trip; NodeView wrapper-free render +
  update (Phase 4)
- State deserialization; citation end-to-end via `ingestWikipediaDocument`
  (Phase 5)

### Integration / Manual
- Phase 1: NodeSpecs UI shows Selector; state round-trips
- Phase 5: full Wikipedia article verification (see criteria)

## Baseline for all phases
- `npm test` / `npm run lint` must stay green; `npm run typecheck` may
  show **only** the known pre-existing `main.ts` TS2305.
