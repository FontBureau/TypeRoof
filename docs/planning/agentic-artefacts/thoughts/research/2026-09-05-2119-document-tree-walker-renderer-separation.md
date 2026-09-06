---
date: 2026-09-05T21:19:17+02:00
git_commit: 05eaf4f96e9761198d8947fc9d40a12bdd5e097e
branch: demo/wikipedia
repository: TypeRoof
topic: "Document-tree walker/renderer separation (Phase 5a): responsibility map and extraction boundary"
tags: [research, codebase, type-stage, viewer, document-nodes-meta, node-properties]
status: complete
plan: thoughts/plans/2026-09-05-1623-node-properties.md
---

# Research: Document-tree walker/renderer separation (Phase 5a)

## Research Question

Responsibility map and extraction boundary for separating the document-tree
walker from the viewer DOM renderer (`UIDocumentElement`/`UIDocumentNodes`/
`UIDocumentTextRun`), including what `UIDocumentNodeOutfitter` duplicates —
groundwork for Phase 5a of `thoughts/plans/2026-09-05-1623-node-properties.md`
(Phases 1–4 committed at `05eaf4f9`).

## Summary

- **There is no explicit recursive "walk" to extract.** Tree traversal in the
  viewer is *emergent* from the component framework: `_BaseDynamicMapContainerComponent`
  provisioning (`UIDocumentNodes`), per-node typeKey dispatch (`UIDocumentNode`),
  and `_provisionWidgets` lifecycles. The "walker" is a shape of the widget
  tree, not a function — the extraction boundary must therefore be drawn
  through widget classes, not through a walk algorithm.
- **Large parts are already pure tree infrastructure.** All four module-level
  helpers in `viewer.typeroof.jsx`, `UIDocumentNode` in its entirety, the
  `pathOfTypes` construction/propagation, the mark-descriptor pipeline
  (`_getWrapMarks`/`_wrapResultsAreEqual`), and `_provisionTypeSpecStyler`
  touch no DOM.
- **Entanglement concentrates in six places** (detailed §1.4): the
  `UIDocumentElement` constructor, `_applyAttrDrivenDOMUpdates`,
  `_createTypeSpecStylerWrapper`, `UIDocumentTextRun._provisionWidgets`
  (coupled via the `_MARK_ELEMENT` symbol), and the `UIDocumentNodes` slot
  insertion/reorder/destroy quartet (coupled via the `insertDocumentNode`
  monkey-patch).
- **The outfitter duplicates four algorithms** the viewer also implements
  (`pathOfTypes` construction, next-sibling resolution, `noStyler`/styler
  lifecycle, resolved-spec change detection) but expresses them over
  ProseMirror positions instead of the metamodel. `getTypeSpecPropertiesIdMethod`
  is already the single shared source of truth. A renderer-independent layer
  must supply the outfitter exactly four things: stable per-node identity,
  ancestor type chains, next-sibling resolution, lifecycle events.
- **The meta-layer conventions are well established** (`TypeSpecMeta`,
  `ActorsMeta`): DOM-less two-tier widget trees, protocol registration via
  settings with model-path ids, `@parentProperties` dependency mapping,
  `setUpdated` push notification. Per-node `nodeProperties@` ids must
  incorporate the document-node model path — `SimpleProtocolHandler.register`
  throws on duplicates (`component.mjs:195-198`).
- **The test safety net has real gaps.** Compare/side-by-side mode is
  completely untested; node add/remove/reorder, typeKey-change rebuild,
  text-run/mark updates, and per-node styling are all unasserted. 12 concrete
  gaps with test sketches in §4.3 — G1–G7 are the minimum for 5a's
  "pure move, behavior-neutral" claim to be falsifiable.

## Detailed Findings

### 1. Viewer core responsibility inventory (`lib/js/components/layouts/type-stage/viewer.typeroof.jsx`, 1246 lines)

Category legend: **(A)** tree infrastructure, **(B)** viewer DOM, **(C)** mixed.

#### 1.1 Widget tree and entry API

```
TypeStageController
└─ UIDocumentViewer                (article.typeroof-document; viewer root, 1188-1246)
   ├─ TypeStagePaneStyler          (pane styling of the container)
   └─ UIDocumentNodes              (dynamic-map over "content" collection, 1017-1186)
      └─ per collection key: UIDocumentNode        (typeKey dispatch, 927-1011)
         └─ per typeKey ("contentWidget" id):
            ├─ UIDocumentTextRun   (typeKey === "text", 601-925)
            │   ├─ GenericUpdater  (forwards "text" → _updateNode)
            │   └─ dynamic: UIDocumentStyleStyler / UIDocumentUnknownStyleStyler per mark
            └─ UIDocumentElement   (all other typeKeys, 186-592)
                ├─ dynamic [0]: UIDocumentTypeSpecStyler (if _hasTypeSpecStyling && !noStyler)
                └─ UIDocumentNodes (recursive, over "./content")   ← unless _treatAsLeaf
```

The walk is driven by the standard framework `update(changedMap)` →
`_provisionWidgets` machinery. Instantiation: `index.typeroof.jsx:541-558`,
gated by `showViewerActivationTest` (mode ∈ {viewer, compare}), deps
`nodeSpec`/`markSpec`/`nodeSpecToTypeSpec`/`documentRendererMode`.

#### 1.2 Pure (A) — could move to `DocumentNodesMeta` unchanged

- Module helpers: `_getMMChildIsBlock` (76-92), `_specChildrenInInlineContext`
  (101-106), `_getRenderingAttrDirectives` (114-124), `_determineUnknownType`
  (134-176). Zero DOM references.
- `UIDocumentNode` **in its entirety** (927-1010): `_createWrapperForType`
  (944-997, typeKey dispatch + dependency wiring), `_provisionWidgets`
  (999-1010, node-identity rebuild rule). Its only DOM coupling is indirect
  (sibling `.node` lookups performed by `UIDocumentNodes`).
- `pathOfTypes` construction/propagation: viewer seed (1240), element
  extension (287), childrenContext (289-296), text-run read (887).
- `UIDocumentElement._getRenderingDirectives` (424-447) and
  `_provisionTypeSpecStyler` (515-591, incl. next-sibling `pathOfTypes`
  computation 537-550) — DOM touch is only the `args = [this.node, this.node]`
  delegation at 407.
- `UIDocumentTextRun._getWrapMarks` (721-818), `_wrapResultsAreEqual`
  (820-834), `_getStyleLinkPropertiesId` (693-711), `_getEffectiveStyleLinks`
  (713-719) — the mark-descriptor pipeline is DOM-free until `_createWrapperDOM`.
- `UIDocumentNodes._createWrapper` (1153-1185) — per-key factory.
- `_getTypeSpecPropertiesId` fields (370, 661) — imported pure resolution.

#### 1.3 Pure (B) — stays with the viewer

- `UIDocumentElement.destroy` (364-368); the DOM creation block inside the
  constructor (306-324) once plan derivation is factored out.
- `UIDocumentTextRun._updateNode` (632-645), `getTextNode` (647-659),
  `_swapNode` (663-667), `_createWrapperDOM` (837-853), `destroy` (626-630).
- `UIDocumentViewer`'s `article` creation + `insertElement` (1195-1198).
- `UIDocumentElementTypeSpecDropTarget` (40-69) — DOM-event widget, unrelated
  to tree walking.

#### 1.4 (C) — the six entanglement sites needing splits

1. **`UIDocumentElement` constructor (187-362)** — spec-branch
   tag/inline-context/unknown-type resolution interleaved line-by-line with
   element creation and zone registration, plus recursive child wiring.
   Natural seam: a pure `resolveElementRenderingPlan(mmNode, specs, context)`
   → `{tag, attributes, additionalAttrs, innerHtml, childrenInInlineContext,
   treatAsLeaf}`; the constructor then only applies the plan and wires children.
2. **`UIDocumentElement._applyAttrDrivenDOMUpdates` (456-493)** — derivation
   already delegated; split into "compute plan diff" (A) + "apply to node" (B).
   Fields `_appliedAttributes`/`_appliedInnerHtml` (302-303) belong to the
   apply half.
3. **`UIDocumentElement._createTypeSpecStylerWrapper` (372-415)** —
   registration-id/dependency-mapping construction fused with `this.node` as
   styler target. Split at the `args = [this.node, this.node]` line (407).
4. **`UIDocumentTextRun._provisionWidgets` (882-924)** — descriptor
   computation/comparison + wrapper-DOM surgery + widget splice. The
   `_MARK_ELEMENT` symbol (836, 851, 863, 906, 908) is the precise coupling
   point: descriptors carry their DOM elements.
5. **`UIDocumentTextRun._createStylerWidgets` (855-880)** — per-mark id
   resolution fused with element extraction and styler binding.
6. **`UIDocumentNodes._insertIntoSlot` / `_insertNodeIntoSlot` /
   `_reorderChildren` / `_destroyWidget` (1054-1151)** — model-order
   resolution (`keyToIndex`/`indexOfKey`, sibling lookup through
   `_keyToWidget` → `contentWidget` → `.node`) fused with
   `insertBefore`/`append`/`removeChild`. The seam is exactly the documented
   bypass of ComponentWrapper element management (comment 1113-1123); the
   `childrenWidgetBus.insertDocumentNode` monkey-patch (1035-1038) would need
   a defined interface in any extraction.

#### 1.5 Incidental findings (IS-state)

- `UIDocumentTextRun._stylerWrapper` (617) is dead: assigned `null`, never read.
- `UIDocumentNodes._nodeSlots` (1030) is dead: created, never used.
- FIXMEs pinning unfinished behavior: tag change on reused widget not
  re-resolved (217, 459-464); leaf-ness change on `html` attr not rebuildable
  (482-490); next-sibling unknown-type resolution parked (531-535).

### 2. The outfitter's parallel walk and the duplication map

**Location correction:** `UIDocumentNodeOutfitter` lives in
`lib/js/components/prosemirror/type-spec.typeroof.jsx:532-793`, not in
`integration.typeroof.jsx` (which holds only a comment at :378). The
resolver machinery (`getTypeSpecPropertiesIdMethod`) is
`integration.typeroof.jsx:170-269`; the PM-side attachment
(`ProsemirrorNodeView`) is `integration.typeroof.jsx:294-446`.

#### 2.1 How the outfitter "walks": it doesn't — ProseMirror does

Per PM document node, PM instantiates `ProsemirrorNodeView`
(`integration.typeroof.jsx:294`), which builds DOM and calls
`subscriptionsWidget.subscribe(domElement, structuralElements, node, getPos, …)`
(382-390). The registry `TypeSpecSubscriptions` (`type-spec.typeroof.jsx:892`)
coordinates per-node updates:

- Subscriptions keyed **by DOM element** (`_subscribers` Map, 899, 1303-1316);
  node position via stored `getPos()` closure, re-evaluated on demand.
- `pathOfTypes` derived per update from PM's resolved path:
  `view.state.doc.resolve(getPos())` → `getPathOfTypes(resolved.path,
  node.type.name)` (`integration.typeroof.jsx:34-54`, used at
  `type-spec.typeroof.jsx:1270`) — the PM-position analogue of the viewer's
  metamodel parent-chain recursion.
- Next-sibling resolution inside the outfitter: `_checkNextProperties`
  (`type-spec.typeroof.jsx:699-736`) — `getPos() + node.nodeSize`,
  `doc.resolve`, `nodeAfter`, `getPathOfTypes`.
- Change detection `_updateWidget` (1461-1512): compares `pathOfTypes`
  element-wise, `typeSpecProperties` string, `Path.equals` on
  `typeSpecPath`/`parentContentsPath`.
- The outfitter does **not** wire `nodeProperties@` (unlike the viewer);
  `UIDocumentTypeSpecStyler.update` tolerates null (`type-spec.typeroof.jsx:250-256`).

#### 2.2 Duplication map (viewer ↔ outfitter)

| Concern | Viewer side | Outfitter/PM side | Verdict |
|---|---|---|---|
| TypeSpec id resolution | viewer:14, aliases 370, 661 | type-spec:697, 1255; impl integration:170-269 | **Shared** — single source of truth |
| `pathOfTypes` construction | viewer:287, 289-296, seed 1237-1241 | integration:34-54 via `doc.resolve(getPos())` | **Duplicated algorithm**, different position source |
| Next-sibling `nextProperties@` | viewer:529-549 (metamodel `indexOfKey`) | type-spec:699-736 (`getPos()+nodeSize`, `nodeAfter`) | **Duplicated algorithm** |
| `noStyler` gating + styler lifecycle | viewer:507-598 | type-spec:655-657, 739-792 | **Duplicated lifecycle** |
| Styler wrapper creation | viewer:371-412 (deps incl. `nodeProperties@`) | type-spec:659-695 + 1216-1254 (legacy `parentContent`) | **Near-duplicate** |
| Resolved-spec change detection | viewer:578-592 | type-spec:1461-1512 | **Duplicated logic**, different substrates |
| Tag/attr/innerHTML DOM construction | viewer:202-276, 414-448, 457-504 | integration:324-344, 393-427 | **Duplicated DOM-building** (PM NodeView semantics) |
| Mark style-link stylers | viewer:855-881, 883-925 | type-spec:1050-1074, 1402-1436 | **Parallel machinery** (PM side MutationObserver-deferred) |
| Child insertion/reorder/removal | viewer:1051-1147 (manual slots) | PM's own view tree (`contentDOM`) | **Genuinely different** |
| Unknown-type handling | viewer:236-264, `_determineUnknownType` | n/a (unknown nodes not in PM schema) | **Viewer only** |

#### 2.3 What a renderer-independent layer must supply the outfitter

The outfitter's only PM-coupled inputs are: (1) `getPos`/`pmNode`,
(2) `getWidgetById("proseMirror").view` for `doc.resolve`,
(3) subscribe/update/unsubscribe calls from `ProsemirrorNodeView`,
(4) the `structuralElements {outer, inner}` DOM pair. Everything else is
already renderer-independent. A `DocumentNodesMeta` layer would need to
supply exactly: **stable per-node identity** (replacing the domElement key),
**ancestor type chains** (`pathOfTypes`), **next-sibling resolution**
(replacing `getPos()+nodeSize`/`nodeAfter`), and **lifecycle events**
(add/change/remove). The viewer already derives (1)-(3) from the metamodel;
the comment at viewer:381-383 ("per-node `nodeProperties@` resolution arrives
with the document-tree channel (Phase 5)") confirms the consolidation is
anticipated.

### 3. Meta-layer conventions a `DocumentNodesMeta` must follow

Established by `TypeSpecMeta` (`meta.typeroof.jsx:256`), `ActorsMeta`
(`actors/actors-meta.mjs:19`), and the `*LiveProperties` leaves
(`live-properties.typeroof.jsx`):

1. **Two-tier structure**: container (`_BaseContainerComponent` /
   `_BaseDynamicMapContainerComponent`) that only wires children + leaf
   `_BaseComponent` holding computed state. `[HANDLE_CHANGED_AS_NEW] = true`
   when items can't update in place (meta:188; actors-meta:20).
2. **No DOM**: never set `zone` in child settings (hostElement stays `null`,
   `component.mjs:1044-1047`); never call `insertElement`. Placemarker
   comments are only created `if(widgetWrapper.host)` (component.mjs:1309) —
   host-less widgets are first-class.
3. **Child wiring tuple idiom**: `_getWidgetSetup(rootPath)` → `[settings,
   dependencyMappings, Constructor, ...args]`; `_createWrapper` →
   `this._initWrapper(this._childrenWidgetBus, …)` (meta:209-241).
4. **Registration via settings, id = model path**: `{"nodeProperties@":
   widgetBus.rootPath.toString()}` in child settings; registration happens
   automatically on wrapper create/destroy (component.mjs:291-296).
   `SimpleProtocolHandler.register` throws on duplicates
   (component.mjs:195-198) ⇒ per-node ids must incorporate the document-node
   model path. Today only one id exists — `nodeProperties@<rootTypeSpecPath>`
   (meta:271-274, produced by root `TypeSpecLiveProperties`,
   live-properties:180-185) — consumers hard-code the root path
   (viewer:381-386, 1209-1212).
5. **Parent channel via dependency mapping**: map parent's protocol id to
   `"@parentProperties"` with relative path math (`rootPath.append("..","..")`
   for `children/{index}`, meta:216-221); root-vs-child detection via
   `widgetBus.wrapper.dependencyReverseMapping.has("@parentProperties")`
   (live-properties:88-92) with constructor invariant enforcement (61-69).
6. **Update lifecycle**: `update(changedMap)` reading `changedMap.has(k) ?
   changedMap.get(k) : this.getEntry(k)`; rebuild
   `new HierarchicalScopeNodeProperties(generators, hostMap,
   parentScope|defaultsMap)` (node-properties.mjs:36-76) only on input change;
   then `getProtocolHandlerRegistration("nodeProperties@")` →
   `impl.setUpdated(identifier)`, guarded by `hasProtocolHandlerRegistration`
   when conditional (live-properties:189-207). Null-guard getters throw
   LIFECYCLE ERROR before first update (76-92).
7. **Container housekeeping**: override `dependencies`/`modelDependencies`
   when children can be empty (meta:63-74); manual provisioning follows
   `StyleLinksMeta._provisionWidgets` (meta:125-172): diff keyed maps,
   `_destroyWidget` removed, `this._widgets.splice(0, Infinity, …)`,
   `_createWidget` + return `requiresFullInitialUpdate`; clear maps in
   `destroy()`.
8. **Top-controller installation**: handler installed once via
   `setProtocolHandlerImplementation(...SimpleProtocolHandler.create(
   "nodeProperties@", {notFoundFallbackValue: null}))`
   (index.typeroof.jsx:291-294); the `null` fallback is the established idiom
   for consumers updating before first registration.
9. **Consumer attachment**: renderer widgets declare
   `[`nodeProperties@${resolvedNodePath}`, "nodeProperties@"]` and read the
   component via `getEntry`; registry-membership checks
   (`hasRegistered(id)`) when ids are computed dynamically
   (viewer:693-708; integration:180-215).

Phase 1–4 artifacts relevant here: `HierarchicalScopeNodeProperties`
(node-properties.mjs:26; cascade of `[["local", local], ["parent", parentMap]]`,
64-67), `getRootNodePropertiesMap` (102-110), `NODE_PROPERTIES_GENERATORS`
with `availableSizesGen` (node-properties-generators.mjs:25-56).

### 4. Render-mode mechanics and the test safety net

#### 4.1 Mode mechanics

- `DocumentRendererModeModel` (`document-renderer-mode/model.mjs:4-8`):
  enum `["editor", "viewer", "compare"]`, default `"viewer"`; model key at
  `index.typeroof.jsx:192-196`.
- Mode switching is **activationTest-driven provisioning**, not imperative
  mount/unmount: `showEditorActivationTest` (index:213-218, mode ∈
  {editor, compare}), `showViewerActivationTest` (index:220-225, mode ∈
  {viewer, compare}). `UIDocumentViewer` registered at index:539-560, zone
  `layout`, rootPath `./document`.
- **Compare mode**: both tests true ⇒ `.ui_prosemirror_host` + ProseMirror
  context AND `article.typeroof-document` coexist as flex children of
  `.typeroof-layout` (CSS `lib/css/shell/type-stage.css:6-13`).
- **Leaving a mode destroys the whole subtree**; returning rebuilds from the
  model (documented by type-stage-toggles test: "the old host element is
  destroyed by the switch, must re-query").

#### 4.2 Existing harness tests

Shared harness `lib/js/tests/type-stage-toggles/harness.mjs` (`buildWorld`):
boots the real `TypeStageController` headlessly in jsdom (real wikipedia
initial state, fixture `lib/js/tests/fixtures/typography-small.html` ingested
via `ingestWikipediaDocument`, real zones, `environment@` handler
pre-registered). Updates driven manually via draft → metamorphose →
`setState` → `root.update(new StateComparison(old, new))`.

| Suite | Asserts | Transitively covers |
|---|---|---|
| `type-stage-toggles` | viewer-default boot; →editor mounts `.ProseMirror`; labels/parameters provisioning; viewer→editor round-trip | activation-based mode switching with loaded document |
| `type-stage-document-replace` | same-structure doc replace: element **reused**, attr-driven DOM follows (href/title/img/figcaption) | `UIDocumentNode` same-typeKey reuse + `_applyAttrDrivenDOMUpdates` |
| `type-stage-pane-sizing` | `environment@layout` → pt widths on editor host and viewer article; height, bg-color, lang | `TypeStagePaneStyler` both panes; editor→viewer switch |
| `environment-dispatch` | `SimpleProtocolHandler` updated-log mechanics (pure unit) | env-only update dispatch |

Run via `npm test` (vitest); single suite e.g.
`npx vitest run lib/js/tests/type-stage-toggles`. Note: two of three DOM
suites are silently **skipped** when the fixture is absent (`skipIf`), while
`type-stage-document-replace` would hard-fail — inconsistent guard.

#### 4.3 Coverage gaps (behaviors 5a must preserve, currently unasserted)

| # | Behavior | Gap test sketch |
|---|---|---|
| G1 | **Compare mode mounts both panes** | set `"compare"`; assert layout zone contains both `.ui_prosemirror_host` and `article.typeroof-document`, both with resolved `style.width` |
| G2 | **Viewer DOM correct after editor→viewer round-trip** | viewer→editor→viewer; re-query article; assert `[data-node-type]` sequence + textContent match document |
| G3 | **Node add lifecycle** (`_createWrapper`/`_insertNodeIntoSlot`) | splice node into `document.content` at index 0/middle; assert child order + `data-node-type` sequence |
| G4 | **Node remove lifecycle** (`_destroyWidget`) | delete a content key; assert count/order of remaining children |
| G5 | **Node reorder** (`_reorderChildren`) | move a key; assert DOM order follows collection order |
| G6 | **typeKey change at same position** rebuilds wrapper | change a node's `typeKey`; assert new element identity + `[data-node-type="<new>"]` |
| G7 | **Text-run updates + mark wrap/unwrap** | change `text`; assert textContent. Add/remove `strong` mark; assert `[data-style-name]` wrapper appears/disappears |
| G8 | Per-node typeSpec styling incl. `noStyler` silent path | change typeSpec fontSize; assert inline style on node element; toggle `noStyler`, assert styles cleared |
| G9 | Unknown-type rendering (`data-unknown-*`) | produce unknown node; assert `[data-unknown-type]` attr + resolved tag |
| G10 | Viewer zone placement / local zones | assert article's parent is `.typeroof-layout`; drop targets land in node-local container |
| G11 | Live edit propagation in compare mode | change document text via draft in compare mode; assert viewer article updates while editor stays mounted |
| G12 | Leaf/verbatim-html + htmlTag transition warn paths | change `html` attr to/from null; pin current `console.warn` + stale-content behavior |

G1–G7 are the minimum set making 5a's "pure move, behavior-neutral" claim
falsifiable; G8–G12 guard the (C)-site splits.

## Code References

- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:186-592` — `UIDocumentElement` (per non-text node; main entanglement site)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:601-925` — `UIDocumentTextRun` (text nodes + mark wrappers; `_MARK_ELEMENT` coupling at 836)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:927-1011` — `UIDocumentNode` (node-identity/typeKey dispatch; already pure tree infra)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:1017-1186` — `UIDocumentNodes` (dynamic-map container; slot insertion 1054-1151; monkey-patch 1035-1038)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:1188-1246` — `UIDocumentViewer` (root; `pathOfTypes` seed at 1240)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:532-793` — `UIDocumentNodeOutfitter` (actual location)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:892-1512` — `TypeSpecSubscriptions` (PM-side per-node registry/walk coordinator)
- `lib/js/components/prosemirror/integration.typeroof.jsx:170-269` — `getTypeSpecPropertiesIdMethod` (shared typeSpec-path resolution, memoized)
- `lib/js/components/prosemirror/integration.typeroof.jsx:34-54` — `getPathOfTypes` (PM-position analogue of viewer's context recursion)
- `lib/js/components/prosemirror/integration.typeroof.jsx:294-446` — `ProsemirrorNodeView` (PM-delegated per-node DOM + subscription lifecycle)
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx:186-330` — `TypeSpecChildrenMeta`/`TypeSpecMeta` (the meta-layer template; `@parentProperties` idiom 215-222)
- `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:48-209` — `TypeSpecLiveProperties` (leaf lifecycle template; root nodeProperties production 180-207)
- `lib/js/components/layouts/type-stage/node-properties.mjs:26-110` — `HierarchicalScopeNodeProperties`, `getRootNodePropertiesMap` (Phases 1–4)
- `lib/js/components/actors/actors-meta.mjs:19-45` — `ActorsMeta` (secondary renderer-independent layer example)
- `lib/js/components/basics/component.mjs:195-198` — duplicate-registration throw (drives per-node id requirement)
- `lib/js/components/basics/component.mjs:1043-1061` — `_initWrapper` (`zone` omitted ⇒ DOM-less child)
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:213-227, 539-560` — mode activation tests + viewer registration
- `lib/js/components/document-renderer-mode/model.mjs:4-8` — mode enum
- `lib/js/tests/type-stage-toggles/harness.mjs` — headless jsdom bootstrap (`buildWorld`)

## Open Questions

1. **Where does `DocumentNodesMeta` sit in the widget tree?** The viewer is
   gated by `showViewerActivationTest`; the meta layer must exist regardless
   of mode (node properties are per document node, not per renderer). Always
   active at `TypeStageController` level? RootPath `./document` like the
   viewer?
2. **Id shape for per-node registrations**: `nodeProperties@<absolute
   documentNodePath>` (framework-idiomatic, id = model path) vs.
   `nodeProperties@<typeSpecPath>#<nodeId>` (plan's example). The framework
   convention (§3.4) favors the document-node path; typeSpec resolution then
   happens on the consumer side or inside the node's own scope construction.
3. **Does the meta layer replace `UIDocumentNode`'s dispatch or wrap it?**
   `UIDocumentNode` is already pure (A) — the two-landing strategy
   (delegation first, ownership flip second) needs a decision on whether
   `DocumentNodesMeta` adopts the `UIDocumentNodes`/`UIDocumentNode` classes
   wholesale (viewer becomes a DOM attachment *inside* them) or parallels
   them (viewer subscribes to meta-node lifecycle events).
4. **The `insertDocumentNode` monkey-patch** (viewer:1035-1038) is the
   viewer's DOM-insertion hook into the widget tree — what defined interface
   replaces it (callback arg? overridable method? zone-like insertion API)?
5. **Outfitter consolidation scope**: 5a extracts from the viewer only;
   switching the outfitter to consume the meta layer is implied by 5b but
   not scheduled. Confirm the boundary: does 5a's `DocumentNodesMeta` API
   need to be outfitter-compatible from day one (the four supplies in §2.3),
   or is outfitter migration explicitly later?
6. **Dead code** (`_stylerWrapper` viewer:617, `_nodeSlots` viewer:1030) and
   the inconsistent fixture skip-guards: remove/fix during 5a or as separate
   hygiene commits beforehand?
7. **Next-sibling unknown-type resolution** is parked (viewer:531-535 FIXME)
   — does the meta layer inherit the limitation or is 5a the moment to pin
   the current behavior with a test (G12-adjacent)?
