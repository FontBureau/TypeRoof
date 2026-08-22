# Research: ProseMirror schema-defined marks — usage and integration state

- Date: 2026-07-26T21:20:39+02:00
- Repo: TypeRoof
- Branch: demo/wikipedia
- Commit: 369fb540ed8b53981296612304b9dfae068c7391

## Research question

`ProseMirrorSchemaModel` (`lib/js/components/prosemirror/models.typeroof.jsx`)
has `["marks", MarkSpecMapModel]`. Initial states define a `strong` mark, but no
document uses it. Is the marks machinery actually used, forgotten, or
superseded — and what exists today vs. what does not?

## Summary

The marks **loading** half exists and runs; the **application** half was never
built. The `generic-style` mark (one reserved mark + `data-style-name` attr +
TypeSpec subscription styling) superseded per-name schema marks as the styling
mechanism — a deliberate ship-faster pivot; semantic HTML remains a goal.
Recently landed (commit `369fb540`, branch `demo/wikipedia`): generalized
`ProsemirrorMarkView` + dynamic `markViews` registration, closing the render gap.

## What exists today (with evidence)

### Schema loading
- `createProseMirrorSchemaFromMetaModel` (`lib/js/components/prosemirror/integration.typeroof.jsx:339-433`)
  iterates `proseMirrorSchema.get("marks")` (394-431), generates `parseDOM`/`toDOM`
  from `tag`, adds each to the `SchemaSpec`. Marks named like reserved marks
  (`generic-style`) are skipped with a warning. In-code comment: "CAUTION: this
  is a stub marks will be handled very differently, likely!"
- Single caller: `ProseMirror.update` (line 938), triggered by the
  `proseMirrorSchema` dependency, wired in both layouts
  (`type-stage/prosemirror.typeroof.jsx`, `ramp/index.typeroof.jsx`).
- Origin: commit `1d625176` "[ProseMirror] WIP: initial loading of NodeSpec/MarkSpec
  from Metamodel to Prosemirror" (2025-09-02).

### Document round-trip
- `_rawCreateProseMirrorNode` (integration ~687) calls `schema.mark(typeKey, attrs)`
  per metamodel mark; `_rawCreateMetamodelNode` (~640-690) writes marks back.
- `NodeSpecModel.marks` (allowed-marks constraint string) and MarkSpec
  `excludes`/`inclusive`/`spanning` pass through 1:1.
- Unknown mark names in a document fail inside `schema.mark()` → node degrades
  to `INVALID` (console.error only).

### Rendering (landed 369fb540)
- `ProsemirrorMarkView._getTag(mark)` resolves tag from the metamodel mark spec
  via `widgetBus.getLinked(mark.type.schema)`; fallback `span` for reserved
  marks. Emits `data-mark-type`; `data-style-name` only for `generic-style`.
- `update()` registers `markViews` for new schema marks, mirroring the
  `nodeViews` block; removal filter checks the built PM `schema.marks` so
  reserved marks survive.

## What does not exist today

1. **Attrs conversion** — `attrs` skipped with a warning in schema creation
   (integration 396-409) for marks and nodes; generated `parseDOM`/`toDOM`
   have no `getAttrs`/attr serialization. Blocks `link`/`href`.
   `AttributeSpecMapModel`/`AttrValidateModel` exist, unwired.
2. **Schema UI for marks** — node-spec editors `UINodeSpecMap` +
   `NodeSpecPropertiesManager` bind `./proseMirrorSchema/nodes`
   (`lib/js/components/layouts/type-stage/index.typeroof.jsx:426-452`); no
   equivalent for `proseMirrorSchema/marks`. Entry today: initial-state JSON only.
3. **Apply/toggle UI** — menus hard-code `schema.marks["generic-style"]`
   (`lib/js/components/prosemirror/type-spec.typeroof.jsx`, `UIProseMirrorMenuStyles` :1531); `Mod-b/i` keymap lines commented
   out (integration ~596-597). `toggleMark`/`removeMark` in `commands.ts` are generic.
4. **Ingest emission** — both ingests flatten `<strong>`/`<b>`/`<em>` to
   `generic-style` + `data-style-name` (`lib/js/wikipedia/ingest.ts:128-149`,
   `ingest_next.ts:128`). No document in any initial state uses schema marks.
5. **StylePatch link for semantic marks** — marks are styled by StylePatches
   (children of the parent node's TypeSpec), linked by name:
   `_finalizeMarkSubscription` (`lib/js/components/prosemirror/type-spec.typeroof.jsx:911`)
   maps `data-style-name` -> `stylePatches/<name>` of the node's TypeSpec;
   semantic marks have no `data-style-name`, so no StylePatch resolves
   (`UIDocumentUnkownStyleStyler`). Bridge: plain CSS on `[data-mark-type]`.
6. **Validation** — `excludes` strings unchecked against existing mark names;
   INVALID-node failures not surfaced to the user.
7. **`ProsemirrorMarkView.update(mark)`** — absent; PM destroys/recreates the
   view (re-running `subscribeMark`) on attr change.

## Methodology notes

- Ground truth via grep/python JSON scans (all three initial states: every
  document mark is `generic-style`; `strong`/`bold` appear only in schema sections).
- Gortex cross-check: `callers`/`references` on functions matched grep 1:1;
  `references`/`usages` on variable-kind symbols (const-chain declarators)
  returned false `total_references: 0` with a "likely_unused … safe to remove"
  caveat — documented in `~/TOOLING.md` (2026-07-26 entry), not yet filed upstream.

## Related state

- Pre-existing, unrelated: `lib/js/wikipedia/main.ts(1,10)` TS2305 (kept
  deliberately; `ingest.ts` will be removed, `ingest_next.ts` renamed to `ingest.ts`).
- Initial states carrying the vestigial schema-mark entries:
  `lib/assets/type-stage-initial-state.json` (`strong`),
  `lib/js/wikipedia/type-stage-wikipedia-initial-state.json` (`strong`),
  `lib/assets/wikipedia-demo.json` (`bold`).
