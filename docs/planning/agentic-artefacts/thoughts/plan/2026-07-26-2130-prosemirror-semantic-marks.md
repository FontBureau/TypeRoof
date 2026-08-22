# Semantic Marks for ProseMirror — Implementation Plan

## Overview

Make schema-defined marks (`ProseMirrorSchemaModel.marks`) first-class: definable
in UI, applicable to text, emitted by ingest, and stylable via StylePatches — so
TypeRoof produces proper semantic HTML (`<strong>`, `<em>`, `<a href>`).
Research: `thoughts/research/2026-07-26-2119-prosemirror-semantic-marks.md`.

## Current State Analysis

Schema-mark **loading** and **rendering** exist; everything that puts marks into
documents, parameterizes, or styles them is missing (7 gaps, research doc §"What
does not exist today"). `generic-style` remains the styling workhorse and must
behave identically throughout.

### Key Discoveries:
- Attrs are dropped with a warning — `integration.typeroof.jsx:396-409`; blocks `link`/`href`
- Node-side UI pattern to mirror: `UINodeSpecMap` + `NodeSpecPropertiesManager`, bound to `./proseMirrorSchema/nodes` at `lib/js/components/layouts/type-stage/index.typeroof.jsx:426-452`
- `toggleMark`/`removeMark` in `commands.ts` are already generic; menus (`UIProseMirrorMenuStyles`) hard-code `generic-style` — `lib/js/components/prosemirror/type-spec.typeroof.jsx:1531`
- Tests run with **vitest** (`npm test`), colocated `*.test.mjs` (pattern: `default-schema.test.mjs`, `ingest_next.test.mjs`)
- Reserved-mark guard must stay; removal filter for views must use built PM `schema.marks` (done, 369fb540)

## What We're NOT Doing

- Removing or restyling `generic-style`; changing the reserved-name guard
- Fixing `wikipedia/main.ts` TS2305 (kept deliberately until ingest consolidation)
- Removing `ingest.ts` / renaming `ingest_next.ts` (owner's separate task)
- Explicit mark-to-style maps (`markSpecToTypeSpec`) and pps-maps UI changes — marks link to StylePatches **by name**, mirroring `data-style-name` today

## Implementation Approach

Bottom-up: data model → schema creation → application → ingest → styling →
hardening. **One commit per phase** (phases 1, 3, 5 split into 2: logic, then UI).
Commit style: `[ProseMirror] ...` prefix per repo convention. Each phase adds
vitest unit tests alongside the code it touches.

---

## Phase 1: Attrs conversion in schema creation

### Overview
Convert `AttributeSpecMapModel` to PM attr specs for marks **and** nodes; generate
`getAttrs`/`toDOM` attr serialization so HTML paste round-trips. Unblocks `link`/`href`.

### Changes Required:

#### 1. Schema creation
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: Replace the `attrs`-skip warning in `createProseMirrorSchemaFromMetaModel`
with conversion: for each `AttributeSpecModel` → `{default: <from AttrValidateModel>, validate?}`;
extend generated `parseDOM`/`toDOM` to read/write attrs (`getAttrs` from DOM, attrs into `toDOM`).

#### 2. Tests
**File**: `lib/js/components/prosemirror/integration.test.mjs` (new)
**Changes**: vitest cases — mark with attrs lands in built `Schema`; defaults applied;
a metamodel doc node carrying `{"typeKey":"link","attrs":[href]}` round-trips
through `_rawCreateProseMirrorNode`/`_rawCreateMetamodelNode` unchanged.

### Success Criteria:
#### Automated Verification:
- [x] `npm test` passes (new + existing)
- [x] `npm run typecheck` — only pre-existing `main.ts` TS2305
- [x] `npm run lint`
#### Manual Verification:
- [x] type-stage loads; `generic-style` styling unchanged (operator review, commit d94a95d9)

**Commits**: 1 (logic+tests) — split if diff exceeds easy review.
**Implementation Note**: pause for manual confirmation before next phase.

---

## Phase 2: Schema UI for marks

### Overview
Mirror the node-spec editor pair for `proseMirrorSchema/marks`: list editor +
fields (tag, excludes, inclusive, spanning; attrs via Phase-1 attribute editor).

### Changes Required:

#### 1. UI components
**File**: `lib/js/components/layouts/type-stage/index.typeroof.jsx` (registration;
editor classes alongside the node-spec ones, likely in `type-stage/node-specs.typeroof.jsx`
— pin exact module at implementation time)
**Changes**: `UIMarkSpecMap` + `MarkSpecPropertiesManager` mirroring
`UINodeSpecMap`/`NodeSpecPropertiesManager`; register parallel to the
"NodeSpecs" `Collapsible` section (bindings pattern: `index.typeroof.jsx:426-452`),
with `./proseMirrorSchema/marks` as `childrenOrderedMap` plus an `editingMarkSpecPath`.

### Success Criteria:
#### Automated Verification:
- [x] `npm run lint`, `npm run typecheck` (as above) + `vite build`
#### Manual Verification:
- [x] Add/edit/delete a `strong` mark in UI; schema rebuilds; JSON export shows it (operator-confirmed)

**Commits**: 1.

---

## Phase 3: Apply/toggle UI + keymap — SUPERSEDED (2026-07-27)

> **Dismissed by owner after implementation** (commits e53e4069 + 99c9ace3,
> reset away via `git reset --hard 17e6cda1`): toggling "Styles" and toggling
> marks must be the **same** UI — some styles are expressed via a configured
> mark, some via the generic-style mark. Salvaged: the vendored `toggleMark`
> fix (`hasMarkWithAttrs` attrs=null → presence-only) + regression tests,
> commit a8e765c4. Keymap: deferred (not needed yet).
>
> **Phase 3 is absorbed into Phase 5** (unified style application, see there).
> Original text kept for reference below.
>
> **Final resolution (2026-07-28, operator):** documents store **intent/roles
> only** (no "semantic marks" as a document concept). Toggling styles therefore
> never writes concrete mark types — Phase 5 item 4 (unified application) is
> dropped. Output semantics are bound at render time via the edge's mark link
> (Phase 5 item 6, absorbing Phase 7).

### Overview (original, superseded)
Generate menu entries from `schema.marks` (excluding `generic-style`, which keeps
its style-name UI); restore keymap dynamically.

### Changes Required:

#### 1. Menu generation (logic)
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes**: Around `UIProseMirrorMenuStyles` (:1531), derive mark toggle items from
`state.schema.marks`; reuse generic `toggleMark`/`removeMark` (`commands.ts`).
Toggling a mark does not create styles; StylePatches (Phase 5) are created in
the TypeSpec editor, as today.

#### 2. Keymap
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: Replace commented `Mod-b`/`Mod-i` lines (~596) with per-schema
bindings for marks that declare a key (or fixed bold/italic mapping when
`strong`/`em` exist).

#### 3. Tests
**File**: `lib/js/components/prosemirror/integration.test.mjs`
**Changes**: unit-test the pure derivation (schema → menu/keymap entries) if
extractable as a function.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck
#### Manual: toggle `strong` via menu and `Mod-b`; mark persists through JSON round-trip

**Commits**: 2 (menu logic, keymap).

---

## Phase 4: Ingest emits semantic marks

> **Note (2026-07-28):** implemented as specified (3db52c65), but the
> intent-only decision (see Phase 3 note) reframes it: ingest should
> eventually map tags -> intent (`data-style-name`) instead of emitting
> concrete semantic marks. The `semanticMarksFromSchema` gate serves both
> policies. Follow-up, not urgent — schema without marks already yields
> intent-only documents.

### Overview
`ingest_next.ts` emits schema marks (`strong`, `em`, `a`+href) instead of / in
addition to `generic-style`, gated by what the schema defines.

### Changes Required:

#### 1. Ingest
**File**: `lib/js/wikipedia/ingest_next.ts`
**Changes**: In the `strong`/`b`/`em`/`i`/`a` mapping (~128), check the active
schema's marks; emit semantic mark when present, else current `generic-style` fallback.
Harvest applicable insights from `ingest.ts` before its planned removal.

#### 2. Tests
**File**: `lib/js/wikipedia/ingest_next.test.mjs`
**Changes**: fixture HTML with `<strong>`/`<a href>` → asserts semantic marks in
output metamodel when schema provides them; fallback case unchanged.

### Success Criteria:
#### Automated: `npm test`, lint, typecheck
#### Manual: ingest a Wikipedia page in wikipedia-demo; semantic tags in output HTML

**Commits**: 1.

---

## Phase 5: StylePatch styling for semantic marks

### Overview
Architecture (verified): **TypeSpecs style nodes; StylePatches style marks.**
The link is the **edge**: `TypeSpecModel.stylePatches` is a
`StylePatchLinksMapModel` (`type-spec-models.mjs:366`) — **edge keys** are link
identifiers matched against the mark's style link (`data-style-name`), **edge
values** are keys into the global `stylePatches` map (nullable,
"FOREIGN_KEY_NO_ACTION"). `_finalizeMarkSubscription`
(`lib/js/components/prosemirror/type-spec.typeroof.jsx:911`) resolves
`data-style-name` -> edge key -> StylePatch properties.

Design decision (owner): the edge key stays the **default** link, but the edge
value gains an **explicit MarkLink**: change the value model from
`StylePatchKeyModel` to a struct
`{stylePatch: StylePatchKeyModel, mark: MarkLinkOrEmpty}`. When `mark` is set,
that edge styles the named mark type regardless of the edge key; when empty,
key-based matching applies (today's behavior, incl. the Phase-5 fallback
`data-style-name ?? mark.type.name`). Semantics fully tunable per use-case:
edge `strong` -> any patch; several edges -> same patch; marks sharing a tag
-> separate edges.

### Changes Required:

#### 1. Model: MarkLink struct (logic)
**File**: `lib/js/components/type-spec-models.mjs`
**Changes**: `StylePatchLinksMapModel` value: `StylePatchKeyModel` ->
struct `{stylePatch: StylePatchKeyModel, mark: MarkLinkOrEmpty}`. Open point:
serialized legacy values are bare keys — decide legacy-upgrade on load vs.
dual-read at implementation time.

#### 2. Resolution (logic)
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes**: match priority in `_finalizeMarkSubscription` (:911) and
touchpoints (~1287, 1303, 1381): (a) edge whose `value.mark` ==
`mark.type.name`; else (b) edge key == `data-style-name ?? mark.type.name`.

#### 3. Edge editor (UI)
**File**: StylePatches-links editor (`UIStylePatchesLinksMap`-based, `type-stage/`)
**Changes**: edit the struct value (StylePatch key + optional mark link);
suggest schema mark names for the `mark` field.

#### 4. Unified style application (absorbed Phase 3) — DROPPED (2026-07-28)
**Operator decision**: documents store intent/roles only; toggling always
writes `generic-style` + `data-style-name` (today's behavior, no change
needed). No toggle-time backing resolution. Original text: see git history
of this file / session notes.

#### 5. Tests
**Changes**: explicit `mark` link wins over key match; empty `mark` ->
key fallback; `data-style-name` regression; multi-edge -> same patch.

#### 6. Intent→tag resolution at render time (absorbs Phase 7) — commit 4/4
**Files**: `lib/js/components/prosemirror/integration.typeroof.jsx`
(`ProsemirrorMarkView`), possibly `default-schema.ts` / `type-spec.typeroof.jsx`
(subscription machinery)
**Changes**: a `generic-style` mark renders as the tag bound to its
`data-style-name` by the applicable TypeSpec's edge (e.g. `<strong
data-style-name="bold">`), else as today's styled `<span>`. The MarkView
re-resolves on edge/schema changes and `update()` reuses the view when the
resolution is stable (no destroy/recreate, subscriptions stay intact).
Styling itself is unchanged (edge → StylePatch, items 1–3).

### Success Criteria:
#### Automated: `npm test`, lint, typecheck
#### Manual: wire edge `strong` (explicit mark link) to any StylePatch in a
TypeSpec; `strong` marks styled; legacy key-only edges and `generic-style`
behave as before

**Commits**: 1 (model+resolution+tests, ecc46778) + 1 (edge editor UI +
StringModel simplification, e11e16d2) + 1 (intent→tag MarkView resolution,
absorbing Phase 7). Item 4 dropped (2026-07-28).

---

## Phase 6: Validation

> **Note (2026-07-28):** semantic-mark-specific items (attrs editor for
> document marks, document-mark/schema validation) are mostly obsolete under
> the intent-only decision; schema-side validation (excludes, mark names)
> stays relevant — schema marks remain the output vocabulary.

### Overview
Fail loudly and early on misconfiguration.

### Changes Required:

#### 1. Models
**File**: `lib/js/components/prosemirror/models.typeroof.jsx`
**Changes**: `MarkSpecModel.validate`: `excludes` names must exist in the marks map
(parent-context check like `AttrValidateModel`); warn path for document marks
absent from schema before `schema.mark()` degrades nodes to `INVALID`
(`integration.typeroof.jsx` ~687); mark names must be valid metamodel map
keys/path components (PM imposes no name rules — verified empirically:
spaces/emoji accepted).

#### 2. Tests
**Changes**: vitest for both validations (bad `excludes`, unknown document mark).

### Success Criteria:
#### Automated: `npm test`, lint, typecheck
#### Manual: broken config produces visible validation feedback in type-stage

**Commits**: 1.

---

## Phase 7: `ProsemirrorMarkView.update()` — ABSORBED into Phase 5 item 6 (2026-07-28)

### Overview (original)
Avoid view destroy/recreate (and `subscribeMark` re-runs) on attr changes.

### Changes Required:
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**: `update(mark)` returning true when `data-mark-type` unchanged and
spec resolution is stable; test with attr-changing `link` edits.

### Success Criteria:
#### Automated: `npm test` (view-reuse unit test if feasible), lint, typecheck
#### Manual: edit link href; no flicker, subscription stays intact

**Commits**: 1.

---

## Postponed: two kinds of schema marks (note for the future, 2026-07-28)

Schema marks could be divided into two kinds: **tag-only** (output vocabulary —
applies a tag to intent at render time, instances never enter documents; the PM
behavioral flags `inclusive`/`spanning`/`code`/`group`/`excludes` are
inert for these) and **full-featured PM marks** (instances live in documents,
carry load-bearing attrs, behavioral flags apply). The distinction could live
on the MarkSpec (a flag) — or in the **style-links edges**, which may be the
cleaner design (operator instinct).

Insight from discussion: the distinction arguably needs no flag at all — it
emerges from two orthogonal usage switches: (1) do instances enter the
document (ingest gate / authoring UI) -> full mark; (2) does an edge bind
intent -> mark -> tag (render-time) -> phantom/tag application. The same mark
name could serve both roles. A MarkSpec flag would only add *restriction*
(validation: "may never enter documents" / "never as output tag"), not new
capability.

DECIDED (2026-07-28): edge-located typed target. The edge struct gains
`type` (plain enum `generic-tag`|`mark`, always serialized) + `tag`/`mark`
(StringOrEmpty, omitted when empty); a CoherenceFunction clears the inactive
field at init/metamorphose (verified: coherence does NOT run on every set).
`generic-tag` applies an HTML tag to intent at render time (no PM mark);
`mark` links a full-featured schema mark. Schema marks: one use case.
Supersedes the StringModel-`mark` simplification from commit e11e16d2.

## Postponed: Style-link inheritance through the TypeSpec parent tree

**Operator decision (2026-07-28):** treat completely separate from this plan;
requires sharp focus. Resolution (edge visibility at a node) walks up the
TypeSpec parent chain; children override by redefining the same edge key —
follows the existing typeSpecnion inheritance pattern. Enables document-wide
defaults + local overrides for style→tag binding.

---

## Testing Strategy

### Unit Tests (vitest, colocated `*.test.mjs`)
- Schema creation: attrs conversion, defaults, reserved-name guard (Phase 1)
- Metamodel↔PM round-trip incl. mark attrs (Phase 1)
- Menu/keymap derivation from schema (Phase 3)
- Ingest emission + fallback (Phase 4)
- StylePatch style-link fallback resolution + `generic-style` regression (Phase 5)
- Validation rules (Phase 6)
### Integration / Manual
- type-stage + wikipedia-demo smoke tests per phase (initial-state JSON with a
  hand-added `strong` mark remains the baseline smoke fixture)

## Baseline for all phases
- `npm test` / `npm run lint` must stay green; `npm run typecheck` may show **only**
  the known pre-existing `main.ts` TS2305.
