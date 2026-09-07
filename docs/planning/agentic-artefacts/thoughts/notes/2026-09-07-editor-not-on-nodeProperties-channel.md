# Editor not wired to `nodeProperties@` — analysis (uncommitted working note)

**Date**: 2026-09-07 · **Context**: Phase 5b (node→node channel,
`thoughts/plans/2026-09-06-1613-phase-5b-node-to-node-channel.md`),
surfaced during Phase 4 review. **Status**: open design issue, parked
for the width-semantics takeover.

## Symptom

Same document, same node (`heading-1`), compare mode:

- **Editor** h1: no `width` style; geometry-ish properties (`padding-inline`)
  land on the inner `<div data-node-content>`.
- **Viewer** h1: `width: 1200pt` on the `<h1>` element itself.

## Mechanism

Both renderers instantiate the same styler class
(`UIDocumentTypeSpecStyler`), but with different wiring:

| | Editor (ProseMirror) | Viewer |
|---|---|---|
| Styler host | `UIDocumentNodeOutfitter._createWidgetDefinition` (`lib/js/components/prosemirror/type-spec.typeroof.jsx:658-689`) | `UIDocumentElement._createTypeSpecStylerWrapper` (`lib/js/components/layouts/type-stage/viewer.typeroof.jsx:305-320`) |
| inner/outer | `inner` = content div, `outer` = block element (`integration.typeroof.jsx:374-380`) — **intentional and correct** | `inner === outer` = the block element |
| `properties@` (typeSpecnion) | mapped | mapped |
| `nodeProperties@` | **not mapped** | mapped per document node (`nodeProperties@<documentNodePath>` via `typeSpecStylerDependencyMappings`) |

Consequence: the editor computes style from the **typeSpecnion only**;
the viewer computes from **typeSpecnion + the node-properties channel**.
Two different property universes for the same node.

## The immediate width leak (minor, downstream)

The styler's `innerPropertiesData` maps `layout/width → width`
(`type-spec.typeroof.jsx:263`) with the contract *"`layout/*` keys are
unregistered; when absent (non-root scopes) the CSS property stays
unset"* (`:345-348`). Pre-5b that held: per-node payloads delegated to
the root scope's effective map, where `layout/width` is absent for
document nodes (verified empirically: at `6a300acc` every viewer block
has no width set).

5b Phase 2 replaced delegation with real per-node scopes
(`CascadingMap([local, parent → … → rootScope])`), and the root scope's
pane `layout/width` (the 1200pt) now **inherits through the cascade into
every node**. The viewer (the only consumer mapping `nodeProperties@`)
applies it to block elements. Editor unaffected because it never reads
the channel.

## Decision recorded

The inner/outer element split in the editor is **intentional and
correct** (operator, 2026-09-07). The issue to fix is the **property
source divergence**: the editor must be wired onto
`nodeProperties@<documentNodePath>` so editor and viewer consume the
identical per-node property maps, and width semantics (which nodes see
`layout/width`, inheritance demarcation of the root pane width) get
decided once, in the channel, for both renderers.

Open points for the takeover:

- Where the editor's outfitter learns the documentNodePath for the
  mapping (it has the PM node/`getPos()`; the meta tree owns the
  canonical paths).
- Whether the editor's `innerPropertiesData` width entry should apply
  to the inner div once the channel is mapped, or move.
- Root-scope `layout/width|height` inheritance demarcation (the pane
  width must not cascade into document nodes) — restores the
  "absent → unset" contract for both renderers at once.
