---
date: 2026-10-02T18:00:41+02:00
git_commit: 90cc13795811400cdfd03bff1090ce909a2e299c
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Composition Controller integration into type-stage"
tags: [research, codebase, text-composition, type-stage, document-nodes-meta, protocols]
status: complete
---

# Research: Composition Controller integration into type-stage

## Research Question

How does the Composition Controller hook into the type-stage layout —
DocumentNodesMeta observation, style distribution protocols, publishing a
new `composition@` protocol, and viewer attachment lifecycle? (Milestone 1
of `docs/planning/text-composition/ROADMAP.md`: full Host executing the
dummy algorithm end to end, Controller first.)

## Summary

The planned architecture is confirmed feasible with existing mechanisms:

- **Instantiation**: `TypeStageController` assembles widgets in array
  order; `DocumentNodesMeta` (DOM-less, id `"documentNodesMeta"`) updates
  BEFORE both renderers to avoid a one-cycle lag. A composition controller
  widget would slot in the same `widgets` array, after the meta.
- **Style observation**: every document node has a `nodeProperties@<path>`
  registration answering a scope-like `.getProperties()` payload; rebuilds
  are marked via `setUpdated`, and identity-guarded (no rebuild on
  unchanged inputs). Text runs are consume-only (parent element's scope).
- **Publishing**: per-path protocol registration is a solved pattern —
  a `"composition@": <id>` key in wrapper settings auto-registers on
  `ComponentWrapper.create()` and unregisters on destroy.
- **Applying**: `UIDocumentTextRun` maintains a strict invariant — ONE
  text node reachable by drilling down the single-child mark-wrapper
  chain. Line-span wrapping must respect exactly two touch points
  (`_updateNode`/`getTextNode` drill-down contract and the mark-rebuild
  branch).

## Detailed Findings

### 1. Widget tree and instantiation (layout controller)

- `TypeStageController` at `index.typeroof.jsx:243`; zones merged at
  `:282-291`; protocol handlers installed at `:303-326`
  (`typeSpecProperties@`, `nodeProperties@` with
  `notFoundFallbackValue: null`, `stylePatchProperties@`,
  `styleLinkProperties@`).
- `DocumentNodesMeta` instantiated at `index.typeroof.jsx:540-566`: id
  `"documentNodesMeta"` (`:297-301`), `relativeRootPath: ./document`, no
  zone (DOM-less, `:547-551`), ordering constraint before both renderers
  (`:545-550`). Deps: `nodeSpec`, `markSpec`, `nodeSpecToTypeSpec`.
- `UIDocumentViewer` at `index.typeroof.jsx:583-604`, mode-gated by
  `showViewerActivationTest` (`:236-242`: viewer|compare). Looks up meta
  via `getWidgetById` and `attachRenderer` (`viewer.typeroof.jsx:780-781`);
  destroy detaches (`:838-846`).
- Editor: `TypeStageProseMirrorContext` (`index.typeroof.jsx:568-581`)
  binds to the same `document`/`proseMirrorSchema`/`nodeSpecToTypeSpec`
  model entries directly (NOT via DocumentNodesMeta),
  `integration.typeroof.jsx:903`.
- Widget update order = array order; layout root resets protocol updated
  logs each cycle (`index.typeroof.jsx:734-743`).

### 2. DocumentNodesMeta internals

- Dispatcher per document node (`DocumentNodesMetaNode`, index.mjs:185)
  owns the `nodeProperties@` registration payload (`:343-345`); children
  container `DocumentNodesMetaNodes` (`:410`) registers per-key
  `"nodeProperties@": rootPath.toString()` in wrapper settings
  (`:439-447`) — on the dispatcher, not the typeKey child, because
  typeKey rebuilds create new before destroying old (`:440-444`).
- Update order in `DocumentNodesMetaElement._provisionWidgets`
  (`:895-968`): rendering plan → scope component FIRST (parent-first,
  "G8 contract", `:902-906`) → child container → super → attach
  cascades. Attachments get initial update from cached
  `widgetBus.rootState` (`:66-68, 108`).
- Scopes: `DocumentNodeProperties` (`:526-690`) builds
  `HierarchicalScopeNodeProperties` = CascadingMap([local, parent])
  (node-properties.mjs:14-34); rebuild guarded by identity checks
  (`index.mjs:628-633`); after build, marks its `nodeProperties@`
  registration updated (`:678-688`).
- Text runs (`DocumentNodesMetaTextRun`, `:974-1009`): consume-only, no
  own scope; payload = parent element's scope (`:247-250`); map `text`
  and `marks` (`:263-278`).
- Observing style change: (a) typeSpec relink → resolved
  `typeSpecProperties@` id change (via injected `nodeSpecToTypeSpec`
  mapping, `:85-101`); (b) parent scope rebuild → `setUpdated` mark →
  child's `"@parentNodeProperties"` trigger mapping (noStyler-dependency
  precedent, `:830-871`). Rebuilds skip when inputs identity-unchanged.

### 3. Protocol mechanics (precedent for `composition@`)

- `SimpleProtocolHandler` (`component.mjs:171-247`): Map registry,
  `register` returns unregister closure, `setUpdated`/`getUpdated` log,
  optional `notFoundFallbackValue`. Protocol names end with `@`.
- Auto-registration: any wrapper settings key matching a known protocol
  registers on `create()` and unregisters on `destroy()`
  (`component.mjs:293-300, 768-789`).
- Consumers: dependency mappings with `@`-names routed per protocol
  (`component.mjs:427-503`); delivered in changedMap via
  `getChangedMapFromCompareResult` (`:620-663`); synchronous read via
  `widgetBus.getEntry("protocol@id")` (`:327-340`).
- Update request on out-of-cycle change: EnvironmentProvider precedent —
  `setUpdated(key)` + `widgetBus.changeState(() => {})`
  (`environment-provider.mjs:93-103, 147-152`).
- `typeSpecProperties@` payload: `TypeSpecLiveProperties` instance with
  `.typeSpecnion`, `.nodeProperties`, `.getPropertyValuesMap()`
  (`live-properties.typeroof.jsx:46-86`); id resolution for consumers via
  `getTypeSpecPropertiesIdMethod` (`integration.typeroof.jsx:188-260`).

### 4. Viewer attachments (Applicator target)

- `UIDocumentTextRun` (viewer.typeroof.jsx:503-723): ONE text node
  created in constructor (`:517`), never recreated, only moved.
  `_updateNode` sets `node.data` or drills down the single-child chain
  (`:531-546`); `getTextNode` drill-down contract (`:548-561`);
  `_swapNode` replaces outermost node + registry (`:564-572`); mark
  rebuild only on descriptor inequality (`:692`), builds nested
  single-child wrappers inside-out, text node appended innermost
  (`:697-708`).
- Wrapping invariants: `this.node` = outermost (registry-tracked);
  exactly one text node; chain is single-child nesting. Span wrapping
  must hook at the two touch points: the `_updateNode`/`getTextNode`
  drill-down contract, or the mark-rebuild branch.
- Styler layering: `UIDocumentTypeSpecStyler` (type-spec.typeroof.jsx:
  248-588) applies inline styles on update, snapshots/restores pre-styler
  attrs on destroy (`:259-267, 286-303`) — precedent for undoable
  application. font-size set on OUTER element in pt (`:578-586`).
- `AttachmentRegistry` (viewer.typeroof.jsx:154-223): path → renderer
  node map, insert/reinsert/replace/delete; siblings resolved without
  meta-tree DOM access.

## Code References

- `lib/js/components/layouts/type-stage/index.typeroof.jsx:540-566` — DocumentNodesMeta instantiation (id, deps, ordering)
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:583-604` — UIDocumentViewer instantiation (mode gating)
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:303-326` — protocol handler installation
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:1017-1129` — meta root, attachRenderer contract
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:439-447` — per-node nodeProperties@ registration in settings
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:526-690` — DocumentNodeProperties scope component
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:974-1009` — text run meta node (consume-only)
- `lib/js/components/basics/component.mjs:171-247` — SimpleProtocolHandler
- `lib/js/components/basics/component.mjs:293-300, 768-789` — settings-key auto-registration lifecycle
- `lib/js/components/environment-provider.mjs:93-103` — setUpdated + changeState no-op precedent
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:503-723` — UIDocumentTextRun invariants and touch points
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:248-588` — UIDocumentTypeSpecStyler (apply/restore precedent)
- `lib/js/components/prosemirror/integration.typeroof.jsx:188-260` — getTypeSpecPropertiesIdMethod

## Follow-up Decisions (2026-10-02, review session)

1. **Textblock identification (Q1): RESOLVED.** PM-parallel rule
   (`NodeType.isTextblock` analogue): not inline AND children in inline
   context, derived via the existing `getMMChildIsBlock` +
   `specChildrenInInlineContext`. Not an explicit type-name list —
   covers headings and user-defined specs. Composition target = the
   OUTERMOST block container of an inline run (nested inline islands
   belong to their containing block). The meta tree surfaces the flag
   (it already computes `childrenInInlineContext`) — DRY: the
   Controller does not re-derive.

2. **Content + change notification (Q2): RESOLVED.** Option C:
   DOM-less Controller widget after DocumentNodesMeta; coarse model
   deps (document, typeSpec, stylePatches, nodeSpecToTypeSpec) fire
   its update; dirty detection reads fine paths from the EXISTING
   compareResult (StateComparison) — no re-walk/identity-diff
   duplication. Style payloads read synchronously via
   getEntry("nodeProperties@<path>") (scopes settle first, widget
   ordering). Publication via manual registration into a
   composition@ SimpleProtocolHandler (EnvironmentProvider
   precedent: register → unregister closure, setUpdated, no-op
   changeState) — no per-paragraph widgets. Immutable identity only
   for apply-time staleness (async). Sub-decisions: style-input
   changes mark ALL paragraphs dirty in v1 (refinement = compare
   resolved typeSpecProperties ids, noted in ROADMAP as
   optimization); textblock index lives in the Controller
   (queryable later if required; move to meta only if then
   required).

3. **Font access for HarfBuzz (Q3): RESOLVED.** No new
   infrastructure: harfbuzzjs module via widgetBus.harfbuzz
   (shell.mjs:49-81); font facade objects (.hbFace, .axisRanges)
   arrive via ordinary model dependencies; the measurement pattern
   exists in videoproof-contextual/layout.mjs:43-66 (shape at axis
   location, sum xAdvance, em units). OPEN DETAIL for the plan:
   trace the exact typeSpec font-reference → installedFonts
   resolution (per-run font objects).

4. **composition@ installation point (Q4): RESOLVED.** In
   TypeStageController's constructor next to the existing handlers
   (index.typeroof.jsx:303-326). Options:
   treatAdressAsRootPath: true (default; ids are document-node
   paths) and notFoundFallbackValue: null (REQUIRED: OFF MODE is
   the absence of entries, so consumers must get null instead of
   KEY ERROR — the fallback is the off-mode mechanism at the
   consumption site).
5. **Meta API needed? (Q5): RESOLVED — no, not for milestone 1.**
   The Controller is self-sufficient: model deps + compareResult +
   synchronous getEntry for protocols + the shared PURE derivation
   functions from document-nodes-meta/derivations.mjs
   (getMMChildIsBlock, specChildrenInInlineContext — the same ones
   the meta uses; DRY = one derivation module, two consumers). A
   meta API remains a later move if the Controller's needs grow.

All open questions resolved; research phase complete (follow-up
review session 2026-10-02).

## Open Questions

None remaining — all resolved in the follow-up review session, see
"Follow-up Decisions" above. Remaining plan-level detail (not a
research blocker): trace the exact typeSpec font-reference →
installedFonts resolution for per-run font objects (Q3 note).
