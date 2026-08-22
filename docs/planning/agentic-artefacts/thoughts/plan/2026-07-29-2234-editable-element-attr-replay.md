# Editable-Element Attr Replay (Q1) — Implementation Plan

date: 2026-07-29T22:34:00+02:00
git_commit: 1d46a3d3b36aff37e7b73dc3177aed2ec2e21441
branch: demo/wikipedia
research: thoughts/research/2026-07-29-2210-editable-element-attr-replay.md
predecessor plan: thoughts/plans/2026-07-29-1212-reproducing-atom-nodes.md

## Overview

Extend the reproducing-atom sprint's `htmlAttrs` bag machinery to elements
that **stay editable**: generic-style intent marks, semantic marks, blocks,
and inline nodes. Attributes are collected at ingest into the declared
`htmlAttrs` bag (JSON string), replayed to the DOM by the views, and kept
round-trip stable by bag-aware `getAttrs`/`toDOM` (option B+E from the
options discussion). Canonical wins: Wikipedia paragraphs keep
`class`/`id`/`about`/`typeof`; links keep `rel`/`title`/`class`
alongside the typed `href`; intent-mark spans carry their collected attrs.

## Current State Analysis

- Bag machinery exists and is reused as-is: `collectHtmlAttrs` + conjunctive
  matcher policy (`ingest_next.ts:147–238`), `_applyHtmlAttrsBag` +
  `_HTML_ATTRS_GUARD` (`integration.typeroof.jsx:530–570`).
- Collection is stored ONLY for reproducing atoms (`ingest_next.ts:526`).
  Per editable class, attrs are dropped at known sites:
  generic-style intent marks store only `data-style-name`
  (`newGenericStyleMarkDraft`:302–310); semantic marks store only declared
  attrs (:576–597); blocks (:543–552) and inline nodes (:618–624) read no
  DOM attributes at all.
- A declared bag attr round-trips metamodel↔PM for marks (:898–946) and
  nodes (:1006–1014, :912–923); PM `computeAttrs` keeps declared attrs only.
- `generic-style` is a hardcoded reserved spec (`default-schema.ts:191–214`);
  the metamodel cannot override reserved names (skip + warn, integration:645–650)
  → its bag declaration must be edited into `default-schema.ts`.
- Replay surfaces: `ProsemirrorMarkView` skips `generic-style` in
  `_applyDeclaredAttrs` (:341); `ProsemirrorNodeView` non-atom branch writes
  only `data-node-type` on the outer element (:206–208).
- Reparse behavior: generated `getAttrs` exists only when a spec declares
  attrs (:625–626); foreign attributes are silently dropped on reparse today.
- Merge surface: nothing in TypeRoof writes `class` on document elements;
  `style` is guard-excluded; the styler writes only style-properties + `lang`;
  `UIDocumentStyleStyler.destroy()` resets only `element.style`.
- Sharp edge: `_swapMarkElement` (intent→tag swap, type-spec.typeroof.jsx:1041–1045)
  keeps only `data-mark-type`/`data-style-name` on the swapped element and
  discards everything else.

## Desired End State

- Ingested editable elements carry their collected attributes in `htmlAttrs`:
  intent-mark spans, links (typed declared attrs + bag for the tail),
  paragraphs/headings/sections, inline nodes.
- Rendered DOM shows those attributes (replayed minus the guard); editing
  keeps them (update-in-place); reparses/paste/reload preserve them via
  bag-aware `getAttrs`; intent→tag swaps preserve them.
- `report.skippedMarkAttrs` counts only what the policy actually excluded.

### Key Discoveries:
- Everything in `MarkModel.attrs`/`NodeModel.attrs` reaches PM wholesale
  (no metamodel filtering) — the bag needs no conversion-layer changes, only
  declaration (so `computeAttrs` keeps it).
- `ignoreMutation` on `ProsemirrorMarkView` already ignores all attribute
  mutations on its own element — replay writes on mark elements are invisible
  to PM's domObserver.
- Bag-aware `getAttrs` makes reparses lossless **without** extending
  `ignoreMutation` to editable nodes (reparse re-collects into the declared
  bag — option B+E).

## Decisions (operator, 2026-07-29)

1. Generic-style intent marks **carry the bag** (requires the
   `_swapMarkElement` re-application fix).
2. Semantic marks: **declared attrs typed + bag for the tail** (duplicated
   values between declared attrs and bag accepted for v1 — same value set
   twice, harmless).
3. Bag name: **`htmlAttrs` everywhere** (one guard, one machinery).
4. Parse-side handling is **inferred** from a declared `htmlAttrs` attr in
   the spec (mirrors the atom sprint's decision; pivot to a flag later if
   impractical).
5. `id` **allowed** (Wikipedia ids are `mw`-prefixed); accepted v1 caveat:
   in-editor duplication of a block duplicates its `id` (PM copies attrs on
   split).
6. Types declared in the wikipedia initial state: `generic-style` (in
   `default-schema.ts`), `paragraph`, `heading-1..3`, `section`,
   `paragraph-2`, `link`.

## What We're NOT Doing

- Class merge strategy (nothing writes class today → verbatim replay).
- `style` replay (guard-excluded, by design).
- Byte-level output fidelity (attribute order, whitespace).
- Changing the reserved-name override behavior (`generic-style` stays
  hardcoded in `default-schema.ts`).
- Bag on `raw_html_*` atoms (already verbatim) or on `doc`.
- The report UI (still console.log), input-gesture routing, validation,
  style-link inheritance (all previously postponed).

## Implementation Approach

Bottom-up, mirroring the atom sprint: collection → declaration/round-trip →
replay → example. Each phase lands as 1–2 small commits with verification.

## Phase 1: Collection at ingest for editable element classes

### Overview
The `htmlAttrs` bag is collected and stored for generic-style intent marks,
semantic marks (declared + bag), blocks, and inline nodes.

### Changes Required:

#### 1. Intent marks
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**: `MarkDesc` `{kind: "style"}` gains `htmlAttrs` (string);
the generic-style fallback emission (:598–608) collects
`collectHtmlAttrs(el, ctx.attrPolicy)` into it (replacing the current
count-all-in-`skippedMarkAttrs` behavior: count only policy-excluded attrs);
`newGenericStyleMarkDraft` (:302–310) writes `data-style-name` **and**
`htmlAttrs` into `MarkModel.attrs`.

#### 2. Semantic marks (declared + bag)
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**: the semantic-mark emission (:576–597) additionally stores
`htmlAttrs` (full bag minus guard; declared attrs stay harvested as today —
duplication accepted, decision 2); `newSemanticMarkDraft` writes it.

#### 3. Blocks + inline nodes
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**: `KNOWN_BLOCK_TAGS` (:543–552) and `INLINE_TAGS` (:618–624)
emissions set `htmlAttrs` on the node draft via `collectHtmlAttrs`.

#### 4. Tests
**Changes**: intent mark carries `data-style-name` + bag; block carries bag
(e.g. `p` with `class`/`id`); inline node carries bag; semantic mark
carries declared `href` + bag with `rel`/`title`;
`skippedMarkAttrs` counts only policy-excluded attrs.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck (only pre-existing TS2305), build
#### Manual: — (end-to-end in Phase 4)

**Commits**: 1.
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 2: Declaration + round-trip stability

### Overview
`htmlAttrs` is declared on `generic-style` (hardcoded) and handled by
inference for schema-defined nodes/marks: bag-aware `getAttrs`/`toDOM`
make parse, serialize, and reparse preserve collected attributes.

### Changes Required:

#### 1. generic-style reserved spec (commit 2a)
**File**: `lib/js/components/prosemirror/default-schema.ts`
**Changes**: `attrs` += `htmlAttrs: { default: "", validate: "string" }`;
`parseDOM.getAttrs` additionally collects foreign attributes into the bag
(guarded; excluding `data-style-name` itself); `toDOM` replays the bag
pairs into the span output spec (skipping guard).

#### 2. Schema-defined nodes/marks (commit 2b)
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: in `createProseMirrorSchemaFromMetaModel`, when a node or mark
spec declares `htmlAttrs` (inferred, decision 4): `getAttrs` = declared
1:1 coercion (existing) + collect foreign attributes into the bag (minus
guard and minus declared names); `toDOM` = declared 1:1 serialization
(existing) + replay bag pairs into the output spec. New small helpers next to
`_createGetAttrs`/`_createToDOM`; reproducing-atom path (has `html`
attr) unchanged and takes precedence.

#### 3. Tests
**Changes**: generic-style parseDOM collects `data-style-name` + guarded
bag and `toDOM` replays it; schema node with `htmlAttrs` declared:
`getAttrs` collects declared + foreign into bag, `toDOM` replays;
full round-trip parse→serialize for a bag-carrying paragraph and link.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: —

**Commits**: 2 (2a: `generic-style`; 2b: schema nodes/marks).
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 3: Replay in the views

### Overview
The views replay the bag to the DOM: marks (incl. generic-style), editable
nodes (outer), and across intent→tag swaps.

### Changes Required:

#### 1. `ProsemirrorMarkView`
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: constructor and `update()` apply
`_applyHtmlAttrsBag(this.dom, mark.attrs.htmlAttrs)` for marks that carry a
bag (incl. generic-style, ending its `_applyDeclaredAttrs` exemption for
the bag only); `update()` keeps returning true when `data-style-name` is
unchanged (re-applying the bag in place when it changed).

#### 2. `ProsemirrorNodeView` (non-atom branch)
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: constructor (after `this.dom = element`, :210) and `update()`
non-atom branch (:263–270) apply the bag to the **outer** element when the
node carries `htmlAttrs` (guarded; contentElement/contentDOM untouched).

#### 3. `_swapMarkElement`
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes**: after creating the swapped element with the two data-* markers
(:1041–1045), apply `_applyHtmlAttrsBag` from `mark.attrs.htmlAttrs` so
intent→tag swaps preserve collected attributes.

#### 4. Tests
**Changes**: generic-style MarkView replays bag at construction and re-applies
on `update()` (extend the existing MarkView update test); editable NodeView
replays bag on outer; swap keeps bag attributes (jsdom test around
`_swapMarkElement`-equivalent flow or via the flush path if feasible).

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: — (end-to-end in Phase 4)

**Commits**: 1.
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 4: Example state + end-to-end verification

### Overview
The wikipedia demo declares the bag on the decision-6 types and shows the
fidelity end-to-end.

### Changes Required:

#### 1. State
**File**: `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`
**Changes**: declare `htmlAttrs` (`{ "default": "", "validate": { "type": "string" } }`)
on `paragraph`, `heading-1..3`, `section`, `paragraph-2` (nodes) and
`link` (mark). (`generic-style` is declared in `default-schema.ts` in
Phase 2a.)

#### 2. Tests
**Changes**: state deserializes with the declarations; e2e: ingest a fragment
with `<p class="x" id="mw1" about="#a">…<a href="…" rel="mw:ExtLink" title="T">…</a></p>`
via `ingestWikipediaDocument` → paragraph node has bag with
`class`/`id`/`about`; link mark has `href` typed + bag with
`rel`/`title`.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck, build
#### Manual: ingest "Typography" → paragraph `class`/`id`/`about`/`typeof`
visible in DOM; links show `rel`/`title` next to `href`; intent-mark
spans carry collected attrs; editing (typing, splitting a block) keeps attrs;
paste/reload/reparse preserves them.

**Commits**: 1.

---

## Testing Strategy

### Unit Tests (vitest, colocated `*.test.mjs`)
- Collection per element class + policy-excluded counting (Phase 1)
- generic-style and schema-type `getAttrs`/`toDOM` bag round-trips (Phase 2)
- MarkView/NodeView/swap bag replay (Phase 3)
- State deserialization + e2e ingestion (Phase 4)

### Integration / Manual
- Phase 4: full "Typography" article verification (see criteria)

## Baseline for all phases
- `npm test` / `npm run lint` must stay green; `npm run typecheck` may
  show **only** the known pre-existing `main.ts` TS2305.
