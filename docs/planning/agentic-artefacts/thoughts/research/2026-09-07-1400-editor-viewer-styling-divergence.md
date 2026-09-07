---
date: 2026-09-07T13:54:29+02:00
git_commit: 02ff40d11b7ad2eea901b300f844ccbfc82c63f1
branch: demo/wikipedia
repository: TypeRoof
topic: "Editor/viewer styling divergence: nodeProperties@ channel wiring"
tags: [research, codebase, node-properties, type-specnion, styler, prosemirror, viewer]
status: complete
plan: thoughts/plans/2026-09-05-1623-node-properties.md
analysis: 2026-09-07-editor-not-on-nodeProperties-channel.md
---

# Research: Editor/Viewer Styling Divergence (nodeProperties@ wiring)

## Research Question

The styling of the editor and the viewer have diverged: the viewer's
styler consumes the per-document-node `nodeProperties@` channel, the
editor's styler does not. Context: umbrella plan
`thoughts/plans/2026-09-05-1623-node-properties.md` (Phase 5b done,
follow-ups parked) and the working analysis note
`2026-09-07-editor-not-on-nodeProperties-channel.md`. Document the
current wiring of both renderers, the shared styler, and the
node-properties channel as they exist today.

## Summary

Both renderers instantiate the same `UIDocumentTypeSpecStyler`, which
internally builds `CascadingMap([["node", nodePropertiesMap], ["style",
typeSpecnionMap]])` (node layer wins). The **viewer** maps
`nodeProperties@<documentNodePath>` per node into the styler, so its
node layer carries real per-node maps. The **editor** never maps
`nodeProperties@`; the styler reads it unregistered, the protocol's
`notFoundFallbackValue: null` kicks in, and the node layer degrades to
an empty Map — the editor styles from the typeSpecnion alone.

Consequence for width: the root node-properties scope carries the pane's
`layout/width|height` (identity synthetics over `layout/availableWidth|
Height`), and **no demarcation exists** in
`HierarchicalScopeNodeProperties` — root `layout/width` cascades through
the nested parent layers into every document node's effective map. The
viewer (node layer populated) applies it as CSS `width` on block
elements; the editor (node layer empty) does not — the "`layout/*`
absent → unset" contract holds only where the channel is unwired.

## Detailed Findings

### 1. The shared styler: UIDocumentTypeSpecStyler

`lib/js/components/prosemirror/type-spec.typeroof.jsx`

- Constructor `:232-242`: `(widgetBus, innerElement, outerElement,
  pmNode = null)` — receives **no property maps**; all data arrives via
  `update(changedMap)`.
- `update` reads three channels: `nodeProperties@` (`:253-261`,
  null-tolerant: unregistered entry → empty `new Map()` at `:260`),
  `properties@` (`:300-303`, `.typeSpecnion.getProperties()`),
  `nextProperties@` (`:306-316`, only when wired).
- Cascade construction `:296-305`: `new CascadingMap([["node",
  nodePropertiesMap], ["style", typeSpecnion.getProperties()]])` —
  first-hit-wins, node layer precedes style layer. Introduced in
  `f51e36bb` ("Phase 5b consumer polish"), replacing the `05eaf4f9`
  spread-merge; behavior-identical per the comment `:290-295`.
- `innerPropertiesData` `:262-272` (applied to inner): `text-align`,
  `direction`, **`${LAYOUT}width` → `width`, unit `pt` (`:265`)**,
  `padding-inline-start/end`.
- `outerPropertiesData` `:273-289` (applied to outer): `--line-height`,
  `--margin-block-start/end` (all custom properties).
- The "`layout/*` absent → unset" contract: `getDefault` `:351-362`;
  for keys starting with `LAYOUT` it returns `[false, ""]` (comment
  `:356-360`: "nodeProperties@ keys are unregistered by design; when
  absent (non-root scopes) the CSS property stays unset"). This makes
  the empty-Map degradation safe.
- Column layout `:390-405`: `generic/columnCount > 1` pushes
  column-count/gap/width + `display:block` onto innerPropertiesData.
- `destroy()` `:247-251` removes `style` from both elements, `lang`
  from outer (styled→silent transitions).
- Historical: the width entry was `${GENERIC}width` before `05eaf4f9`
  switched it to `${LAYOUT}width`; no `generic/width` read remains.

### 2. Viewer wiring (channel mapped)

`lib/js/components/layouts/type-stage/viewer.typeroof.jsx` +
`document-nodes-meta/derivations.mjs`

- `_createTypeSpecStylerWrapper` `:300-320`: builds mappings via
  `typeSpecStylerDependencyMappings(typeSpecProperties,
  `+`nodeProperties@${this._documentNodePath.toString()}`+`, …)` (`:308`).
- `_documentNodePath` = `metaInfo.rootPath` (the absolute document-node
  path from the meta tree), set in `_UIDocumentAttachment` `:231`.
- `typeSpecStylerDependencyMappings` (`derivations.mjs:362-386`):
  `[typeSpecProperties, "properties@"]`, `[nodePropertiesId,
  "nodeProperties@"]` (`:370`), `["/font", "rootFont"]`, conditional
  `noStyler` (`:378-381`, provisioning trigger only) and conditional
  `nextProperties@` (`:382-385`).
- Element targets: `args = [this.node, this.node]` (`:313`) —
  **inner === outer**, the node's local container; no `pmNode`.
- Rebuild check `_provisionTypeSpecStyler` `:456-477`: compares **only**
  `dependencyReverseMapping.get("properties@")` against the freshly
  resolved id (`:464-466`). `nodeProperties@` is deliberately excluded
  (comment `:458-463`): its id is document-path-keyed and stable for
  the wrapper's lifetime; a moved/rebuilt node gets a new wrapper from
  the meta tree anyway.

### 3. Editor wiring (channel NOT mapped)

`lib/js/components/prosemirror/type-spec.typeroof.jsx` +
`integration.typeroof.jsx`

- Call chain: `ProsemirrorNodeView` (`integration.typeroof.jsx:294`) →
  `TypeSpecSubscriptions.subscribe` (`type-spec.typeroof.jsx:1307`) →
  `_createTypeSpecStylerWrapper` (`:1227`) → `UIDocumentNodeOutfitter`
  (`:543`) → `_createWidgetDefinition` (`:669`).
- Element split (`integration.typeroof.jsx:334-380`, passed as
  `structuralElements` at `:374-380`): **outer** = block element
  (`data-node-type`, `this.dom`), **inner** = content div
  (`data-node-content`, PM `contentDOM`) — for reproducing atoms inner
  === outer. Recorded as intentional and correct (operator, 2026-09-07).
- Outfitter-level mappings (`:1229-1252`): `properties@` (node-specific
  `typeSpecProperties@<path>`), `rootFont`, `showParameters`,
  `showNodeTypeSpecLabels`, `parentContent`, `nodeSpecToTypeSpec`,
  `noStyler`.
- Styler dependencies `_createWidgetDefinition` `:676-695`:
  `properties@` (`:678`), `rootFont` (`:679`), `parentContent`
  (`:682-685`), conditional `nextProperties@` (`:688-695`).
  **`nodeProperties@` is absent** — neither here nor in the
  outfitter-level mappings.
- The styler nonetheless calls `this.getEntry("nodeProperties@")`
  (`:255-257`, comment: "unregistered, may be null until the root
  registers"); with the protocol's `notFoundFallbackValue: null` this
  yields `null` → empty Map (`:258-261`). The editor's cascade node
  layer is therefore always empty: it styles from the typeSpecnion
  only. (Note: it does NOT fall back to the root registration either.)
- Node identity lives on the **outfitter**, not the styler:
  `this._pmNode`, `this._getPos`, `this._typeSpecPath`,
  `this._originTypeSpecPath` (`:565-568`); the styler is constructed
  with `pmNode = null` even in the editor (`:698-700` pass only
  inner/outer). `pathOfTypes` is derived per update via
  `view.state.doc.resolve(getPos())` + `getPathOfTypes`
  (`:1283-1286`; `integration.typeroof.jsx:34-53`).
- Widget keying: subscriptions keyed by `domElement`
  (`_subscribers` Map, `:1324`); `_updateWidget` (`:1455-1518`)
  re-derives `pathOfTypes`/`typeSpecProperties`/`typeSpecPath`/
  `parentContentsPath` and rebuilds the wrapper on change; the styler
  inside the outfitter is a single positional dynamic widget rebuilt by
  `_provisionWidgets` (`:754-800`) on nextProperties/silent/initial.

### 4. The node-properties channel (Phase 5b state)

`document-nodes-meta/index.mjs`, `node-properties.mjs`,
`node-properties-generators.mjs`, `live-properties.typeroof.jsx`

- Protocol handler: `SimpleProtocolHandler.create("nodeProperties@",
  { notFoundFallbackValue: null })` in both controllers
  (type-stage `index.typeroof.jsx:296-300`, ramp `index.typeroof.jsx
  :252-259`); `resetUpdatedLog()` in update/initialUpdate of both.
- Two identifier families in one registry:
  - **Root**: `nodeProperties@<typeSpecPath>` — registered only by the
    root `TypeSpecLiveProperties` (`meta.typeroof.jsx:266-275`, guarded
    by `typeSpecDefaultsMap !== null`); payload accessor
    `.nodeProperties` (`live-properties.typeroof.jsx:86-92`).
  - **Per node**: `nodeProperties@<absoluteDocumentNodePath>` (e.g.
    `nodeProperties@0/2`) — registered by the meta dispatcher
    (`document-nodes-meta/index.mjs:409-453`, id at `:419`, comment
    "locked decision 2" `:415-418`). Payload is scope-like
    (`.getProperties()`), `:216-227, 343-345`. Text runs are
    consume-only, delegating to the parent element's scope (`:902-937`).
- Scope construction (`node-properties.mjs:35-74`): generators run as
  `gen(outerAPI, hostMap)`; demarcation third elements are **ignored**
  (`:55-57`); effective map = `CascadingMap([["local", local],
  ["parent", parentMap]])` (`:63-66`) — inheritance is cascade nesting.
  `inheritancePolicyGenerators` is accepted (`:39`) and stored (`:73`)
  but **never read anywhere** — no demarcation/tombstone mechanism
  exists in the node channel.
- Root scope (`live-properties.typeroof.jsx:162-190`): defaults map =
  `getRootNodePropertiesMap(environmentValues)` — **environment facts
  only** (`layout/environment/...`, `node-properties.mjs:102-111`); the
  pane's width/height LengthModels enter the **host map** as
  `layout/width` / `layout/height` (`:171-176`, guarded per-layout via
  `dependencyReverseMapping.has(dimension)`).
- Generators (`node-properties-generators.mjs:210-213`):
  - `availableSizesGen` (`:134-160`): active only where the host map
    has `layout/width|height` (i.e. root only); yields
    `layout/availableWidth|Height` (pt) **and `layout/width|height` as
    identity synthetics** (`:153-158`).
  - `horizontalLayoutNodePropertiesGen` (`:184-204`): **stub**; yields
    `layout/availableWidth` from `lineLengthEN * 0.5 * fontSizePT`;
    **deliberately no `layout/width`** (comment `:199-203`: "Until then
    nodes inherit the parent's width (today: the root pane width — 5a
    behavior).")
- Per-node scopes (`index.mjs:568-638`): host map = the node's resolved
  typeSpecnion map; parent arg = parent node's **settled effective
  map** ("the G8 contract", `:613-622`); rebuild guarded on typeSpecnion
  + parent-map identity (`:584-591`); defers while parent is unsettled
  (`:606-612`); `setUpdated` via has-guard idiom (`:627-637`).
- Chain threading: no parent-widget chain in the framework; dispatchers
  read `parentSettledProperties` (`index.mjs:236-252`); meta root seeds
  top-level dispatchers from the root registration (`:992-998`); the
  trigger-only mapping `["@parentNodeProperties"]` (`:802`) exists so a
  parent rebuild's `setUpdated` re-triggers the child.

### 5. The width divergence mechanism (as built today)

1. Root host map gets `layout/width` = pane width LengthModel
   (`live-properties.typeroof.jsx:171-176`).
2. Root `availableSizesGen` resolves it to pt and re-yields
   `layout/width` as an identity synthetic
   (`node-properties-generators.mjs:153-158`) — the root effective map
   now carries `layout/width: 1200pt`.
3. Every per-node scope nests the parent's effective map as its
   `"parent"` cascade layer with no demarcation or tombstone
   (`node-properties.mjs:55-57, 63-66`) — `layout/width` inherits into
   every document node's effective map. Confirmed by test expectations:
   `lib/js/tests/type-stage-viewer-behavior/index.test.mjs:392-393,
   525` (node `layout/width` equals root `layout/width`).
4. Viewer: styler's node layer is the per-node map →
   `innerPropertiesData` `[layout/width → width, pt]`
   (`type-spec.typeroof.jsx:265`) applies `width: 1200pt` to the block
   element (inner === outer, `viewer.typeroof.jsx:313`).
5. Editor: styler's node layer is empty (channel unmapped) →
   `getDefault` returns `[false, ""]` for `layout/*`
   (`type-spec.typeroof.jsx:356-360`) → CSS width stays unset;
   geometry-ish properties (`padding-inline-*`) land on the inner
   `data-node-content` div from the style layer.

Pre-5b the same contract held in the viewer because per-node payloads
delegated to the root scope where `layout/width` was absent for
document nodes (empirically verified at `6a300acc`; see the analysis
note). 5b's real per-node scopes made the root pane width visible to
every node.

### 6. TypeSpecnion side (context)

- Old `environmentGen`/`availableSizesGen`/geometry re-routes are
  commented out, not deleted, in `properties-generators.mjs:45-72,
  630-679` ("Phase 5b teardown … plan decision 6").
- `specific/root/width|height` seeding remains in `seedTypeSpecDefaults`
  (`live-properties.typeroof.jsx:45-50`) but is dead — comment `:28-34`
  says no caller passes them.
- `LAYOUT = 'layout/'` is a naming convention only, deliberately not in
  `SYMBOLIC_TO_PREFIXES` and not registered
  (`registered-properties-definitions.mjs:23-28`).

### 7. Pane styler (the channel's intended width consumer)

`pane-styler.typeroof.jsx:64-70` maps `layout/availableWidth|Height` →
CSS `width`/`height` (pt) with the same `[false, ""]` no-default
treatment; wired to the **root** registration in all three places
(type-stage `index.typeroof.jsx:521-524`, ramp `index.typeroof.jsx
:403-406`, `viewer.typeroof.jsx:737-740`).

## Code References

- `lib/js/components/prosemirror/type-spec.typeroof.jsx:231-242` — styler constructor (no property maps)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:253-261` — null-tolerant unregistered `nodeProperties@` read
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:262-272` — innerPropertiesData incl. `layout/width → width` (:265)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:296-305` — CascadingMap([node, style]) construction
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:351-362` — getDefault; `layout/*` absent→unset contract (:356-360)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:565-568` — outfitter holds `_pmNode`/`_getPos`/paths
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:669-703` — editor styler deps (no nodeProperties@)
- `lib/js/components/prosemirror/integration.typeroof.jsx:334-380` — editor inner/outer element split
- `lib/js/components/prosemirror/integration.typeroof.jsx:170-269` — getTypeSpecPropertiesIdMethod (typeSpec path resolution, memoized)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:300-320` — viewer styler wrapper; nodeProperties@ id at :308; inner===outer at :313
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:456-477` — rebuild check compares only properties@
- `lib/js/components/layouts/type-stage/document-nodes-meta/derivations.mjs:362-386` — typeSpecStylerDependencyMappings
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:409-453` — per-node `nodeProperties@<rootPath>` registration (:419)
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:568-638` — per-node scope construction (G8 contract)
- `lib/js/components/layouts/type-stage/node-properties.mjs:35-74` — HierarchicalScopeNodeProperties; no demarcation; unused inheritancePolicyGenerators (:39, :73)
- `lib/js/components/layouts/type-stage/node-properties.mjs:102-111` — getRootNodePropertiesMap (environment facts only)
- `lib/js/components/layouts/type-stage/node-properties-generators.mjs:134-160` — availableSizesGen + layout/width identity synthetics
- `lib/js/components/layouts/type-stage/node-properties-generators.mjs:184-204` — horizontalLayoutNodePropertiesGen stub (no layout/width)
- `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:162-214` — root scope build; layout/width|height host seeding (:171-176)
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:296-300` / `lib/js/components/layouts/ramp/index.typeroof.jsx:252-259` — protocol registration (both controllers)
- `lib/js/components/registered-properties-definitions.mjs:23-28` — LAYOUT prefix, convention only
- `lib/js/tests/type-stage-viewer-behavior/index.test.mjs:380-393, 519-525` — tests asserting inherited layout/width

## Open Questions

(carried over from the analysis note, annotated with what this research
established)

- **Where does the editor learn the documentNodePath for the mapping?**
  The outfitter holds `pmNode`/`getPos()` and derives `pathOfTypes`
  (typeSpec-keyed), but the canonical *document-node* paths live in the
  meta tree (`metaInfo.rootPath` → `nodeProperties@<rootPath>`).
  Bridging PM positions to meta-tree paths is undesigned. Also: the
  editor currently does not instantiate from the meta tree at all
  (the Phase 5a/“renderers on MetaDocumentTree” follow-up).
- **Editor rebuild semantics**: the viewer excludes `nodeProperties@`
  from its rebuild check because document paths are wrapper-lifetime
  stable; whether that argument transfers to PM NodeViews (which
  persist across document edits/moves) is unverified.
- **Width on inner vs outer in the editor** once the channel is
  mapped: the `layout/width → width` entry is in innerPropertiesData
  (the `data-node-content` div); whether that is the right target is
  undecided.
- **Root `layout/width|height` demarcation**: the channel has no
  mechanism (demarcation ignored, `inheritancePolicyGenerators`
  unread). Design needed for how the pane width stops cascading into
  document nodes — restores "absent → unset" for both renderers.
- **Ramp layout**: registers the protocol and wires the pane styler,
  but declares no width/height widget deps; whether ramp document
  nodes exhibit the same divergence is unverified.
