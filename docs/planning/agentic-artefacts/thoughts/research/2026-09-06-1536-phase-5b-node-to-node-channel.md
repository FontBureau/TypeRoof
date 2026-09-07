---
date: 2026-09-06T15:35:57+02:00
git_commit: 6a300acc2ca5c48c34ddcba107551c3c3acb3571
branch: demo/wikipedia
repository: TypeRoof
topic: "Phase 5b: per-document-node nodeProperties@ channel (node→node) on DocumentNodesMeta"
tags: [research, codebase, node-properties, document-nodes-meta, type-stage, phase-5b]
status: complete
handoff: docs/planning/agentic-artefacts/thoughts/plan/2026-09-06-phase-5b-handoff.md
umbrella-plan: thoughts/plans/2026-09-05-1623-node-properties.md
---

# Research: Phase 5b — node→node nodeProperties@ channel

## Research Question

How is the committed code (Phases 1–5a) actually shaped, so Phase 5b of the
node-properties umbrella plan can install **real per-document-node
`HierarchicalScopeNodeProperties` scopes** owned by `DocumentNodesMeta`,
transported via `nodeProperties@<id>`, consumed by children (parent effective
map) and by the viewer's `UIDocumentTypeSpecStyler`? The umbrella plan's 5b
section predates 5a — its `document-nodes-meta.typeroof.jsx` references are
approximations; this research verifies everything against the code at
`6a300acc`. Focus: the handoff's five open questions (hostMap source,
registration id scheme, update ordering, root-channel relation, hostContext).

## Summary

5a built exactly the scaffolding 5b needs — and made several 5b spec items
**moot or already-done**:

- **Registration ids are already per-node**: `nodeProperties@<absolute
  documentNodePath>` registered declaratively (wrapper settings) on every
  `DocumentNodesMetaNode` dispatcher (`document-nodes-meta/index.mjs:268-279`).
  The umbrella plan's collision worry (`nodeProperties@<typeSpecPath>` shared
  by nodes) was designed away in 5a: the id is the **model path**, so it is
  unique by construction and stable across reorders (list keys) and typeSpec
  edits. The plan's "imperative lifecycle-hooked registration" requirement
  was motivated by typeSpec-path-keyed ids that could change under a live
  widget — with document-path ids the declarative settings registration
  (register on create / unregister on destroy, `component.mjs:765-768,
  777-782`) is sufficient for the id; what changes per update is the
  **payload's scope**, not the id.
- **Payloads currently live-delegate to the root map** (`get nodeProperties()`
  at `index.mjs:226-229` → `rootNodeProperties@` → root
  `TypeSpecLiveProperties.nodeProperties`). 5b = replace that delegation with
  a real per-node scope, keeping the accessor contract.
- **Consumers already subscribe per-node**: `UIDocumentTypeSpecStyler`
  dependency mappings carry `nodeProperties@<documentNodePath>`
  (`derivations.mjs:362-388`, `viewer.typeroof.jsx:306-314`) — the 5b
  consumer position is already wired.
- **Update ordering is strictly parent-first** by framework mechanism
  (provisioning completes before child updates, containers recurse
  depth-first) — verified by code reading; the umbrella plan still asks for
  a behavior test pinning this.
- **The hostMap (resolved typeSpecnion properties) does NOT exist in the
  meta layer today.** No meta node consumes `typeSpecProperties@`. The
  resolution machinery (`getTypeSpecPropertiesIdMethod` + `pathOfTypes`) is
  used only by renderer attachments. 5b's central wiring task: meta nodes
  resolve their effective typeSpec path and map `typeSpecProperties@<path>`
  as a dependency to obtain the hostMap.
- **Root channel stays in `TypeSpecLiveProperties`** (Phase 4,
  `live-properties.typeroof.jsx:134-210`); the meta tree's document root
  delegates to it. A handoff/move is optional, not required.
- **Two gaps found**: (1) `nodeProperties@` is **not** covered by
  `resetUpdatedLog()` in either layout controller — the updated-log grows
  monotonically, consumers re-fire every cycle; (2) the memo cache in
  `getTypeSpecPropertiesIdMethod` keys omit the protocol name — cross-protocol
  use (4th arg `"nodeProperties@"`) is correct only because of per-hit
  `hasRegistered` re-validation, and would thrash the shared cache level.

## Detailed Findings

### 1. DocumentNodesMeta layer (Q1: hosting per-node scopes)

`lib/js/components/layouts/type-stage/document-nodes-meta/` = `index.mjs`
(615 LOC, widget classes) + `derivations.mjs` (539 LOC, pure functions).
There is **no** `document-nodes-meta.mjs` or `.typeroof.jsx` — those names
in older docs are stale.

Class inventory (`index.mjs`):

| Class | Lines | Base | Role |
|---|---|---|---|
| `RendererAttachments` | 45-99 | — | per-node handler→wrapper bookkeeping; attach/detach/reposition |
| `DocumentNodesMetaDocument` | 105-138 | `_BaseContainerComponent` | the document root node itself |
| `DocumentNodesMetaNode` | 145-250 | `_BaseContainerComponent` | **dispatcher**: typeKey dispatch + node-identity rebuild; owns the per-node `nodeProperties@` registration + `get nodeProperties()` |
| `DocumentNodesMetaNodes` | 256-342 | `_BaseDynamicMapContainerComponent` | dynamic-map container over a node's `content`; creates per-node dispatchers |
| `_DocumentNodesMetaDispatchedNode` | 346-368 | `_BaseContainerComponent` | shared base of element/text-run |
| `DocumentNodesMetaElement` | 375-491 | dispatched base | rendering-plan derivation, `pathOfTypes`/context extension, child-container provisioning |
| `DocumentNodesMetaTextRun` | 496-513 | dispatched base | thin; context pass-through |
| `DocumentNodesMeta` (root) | 521-614 | `_BaseContainerComponent` | seeds `pathOfTypes`, sets `widgetBus.originTypeSpecPath` (:526), attach/detachRenderer, rootState cache |

Key mechanics:

- **Provisioning/identity** (`index.mjs:204-220`): dispatcher reads its node
  via `getEntry(rootPath.parent).get(key)`; same typeKey → widget reuse
  (empty provision set); typeKey change → new wrapper built **before** old
  destroyed (:211-213, required because the duplicate-registration throw at
  `component.mjs:195-198` would fire otherwise). Registration sits on the
  dispatcher, not the typeKey child (`index.mjs:274-277` comment).
- **Dynamic-map provisioning**: `_BaseDynamicMapContainerComponent`
  (`basics/component.mjs:1690-1867`); NEW → `_createWrapper(rootPath)`
  (`index.mjs:268-310`); CHANGED keeps the wrapper (no HANDLE_CHANGED_AS_NEW).
- **`pathOfTypes`**: seeded `[docTypeKey]` in root ctor (:527-535); extended
  per element in `resolveElementRenderingPlan` (`derivations.mjs:274`);
  `childrenContext` copy (:276-283); text runs contribute nothing
  (`index.mjs:508`).
- **`originTypeSpecPath` on the widgetBus** (:526): available to every meta
  node — the anchor needed for effective typeSpec path resolution inside
  the meta layer.
- **No per-node `setUpdated` push today**: only the root registration is
  marked updated, by `TypeSpecLiveProperties.update`
  (`live-properties.typeroof.jsx:187-208`).

**hostMap source (Q1 answer)**: nowhere yet. Meta-node dependency mappings
(`index.mjs:163-190, 280-294, 456-473, 546-555`) contain only `content`,
`attrs`, `text`, `marks`, `nodeSpec`, `markSpec`, `nodeSpecToTypeSpec`, and
the `rootNodeProperties@` delegation. The resolved typeSpecnion lives on
`TypeSpecLiveProperties` (`live-properties.typeroof.jsx:48-87`); only
renderer attachments resolve `typeSpecProperties@<effectivePath>` today
(`viewer.typeroof.jsx:406-412, 428` via `_getTypeSpecPropertiesId`).
For 5b, a meta node must (a) hold `_originTypeSpecPath` (readable from
`widgetBus.originTypeSpecPath`), (b) bind
`_getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod` — **as a bound
closure or class field in-module** (class-field bindings don't survive being
passed across module boundaries — 5a landmine), (c) map
`typeSpecProperties@<effectivePath>` as a dependency to receive the
`TypeSpecLiveProperties` whose `.typeSpecnion.getProperties()` is the
hostMap.

### 2. Registration id scheme (Q2 — largely settled by 5a)

- Id = `nodeProperties@<absolute documentNodePath>` (e.g.
  `…/document/content/3/content/1`), declared in wrapper settings
  (`index.mjs:268-279`: `settings = { rootPath, nodeKey: key,
  "nodeProperties@": rootPath.toString() }`).
- Settings keys ending in `@` become protocol registrations
  (`component.mjs:292-297`); `ComponentWrapper.create` registers the widget
  itself (`component.mjs:765-768`); `destroy()` unregisters
  (`component.mjs:777-782`). Duplicate ids throw (`component.mjs:195-198`).
- Node identity across edits = the **list key** in the parent's `content`
  OrderedMap: stable across content updates at the key and across reorders
  (G5-safe per 5a); a replaced document's node at the same key reuses the
  dispatcher (only typeKey change rebuilds).
- **Text nodes also register today** (the dispatcher is type-agnostic);
  the plan says text nodes are consume-only — keeping their registration is
  harmless (nothing consumes it) but is a divergence to decide on.
- Parent lookup = **document-path math** (5a design center: "Parent lookup =
  path math"), i.e. strip trailing `content/<key>` pairs from the node's
  rootPath to address ancestor dispatchers. The umbrella plan's
  `_getTypeSpecPropertiesId(pathOfTypes.slice(0,-1), true)` parent-EFFECTIVE-
  PATH mechanism belongs to the *typeSpec* channel; for the node channel's
  parent-map input it is the wrong tool (it resolves typeSpec paths and
  validates against the `typeSpecProperties@` registry semantics). It
  remains the right tool for the **hostMap** lookup (§1).

### 3. Update ordering (Q3 — parent-first, by mechanism)

`_BaseContainerComponent.update` (`component.mjs:1184-1187`) runs
`_provisionWidgets` fully, then updates children in order
(`component.mjs:1264-1282`); container children recurse — so a parent's
scope rebuild inside its `update`/`_provisionWidgets` **settles before any
child's update runs**. New wrappers get `initialUpdate`
(`component.mjs:1221-1222`); mid-cycle attachments get the cached
`widgetBus.rootState` (`index.mjs:68, 600-613`). The viewer already relies
on this ("Parents attach before their children",
`viewer.typeroof.jsx:790-794`). Umbrella plan requirement stands: pin with
a behavior test before building on it (a child's scope build must observe
the parent's settled map in the same cycle).

### 4. Phase-4 root channel vs. meta root (Q4)

- Root scope built in `TypeSpecLiveProperties.update`, non-parent branch
  (`live-properties.typeroof.jsx:134-210`):
  `getRootNodePropertiesMap(environmentValues)` (`node-properties.mjs:102-111`
  → `layout/environment/...` keys) + guarded `layout/width|height`
  LengthModels (`:164-170`, guard = `reverseMapping.has(dimension)` because
  ramp wires no width/height deps) →
  `new HierarchicalScopeNodeProperties(NODE_PROPERTIES_GENERATORS,
  hostMap, rootNodePropertiesMap)` (`:180-184`).
- Registration of `nodeProperties@<rootPath>` via `TypeSpecMeta` settings,
  **gated** on `typeSpecDefaultsMap !== null` (`meta.typeroof.jsx:264-273`).
- `HierarchicalScopeNodeProperties` (`node-properties.mjs:26-92`):
  constructor `(propertiesGenerators, hostMap,
  parentNodePropertiesOrDefaultsMap, inheritancePolicyGenerators=[])`;
  3rd arg polymorphic via `instanceof` (:41-45); effective map =
  `CascadingMap([["local", local], ["parent", parentMap]])` (:63-66);
  outerAPI `{hasParentProperty, getParentProperty}` over the parent map
  (:50-53); accessors `getProperties()`, `getOwnProperty(name, default?)`,
  `localPropertyNames`. Generators: `gen(outerAPI, hostMap)` — same order
  as typeSpec generators.
- `availableSizesGen` (`node-properties-generators.mjs:23-48`): reads
  `layout/width|height` from **hostMap**, `layout/environment/<key>/<dim>`
  via `getParentProperty`; guards on missing width/height (:30) and null
  environment values (:37); yields `layout/available{Width,Height}` (pt)
  + `layout/{width,height}` identity synthetics.
- Protocol installed in **both** controllers with
  `{notFoundFallbackValue: null}` (`type-stage/index.typeroof.jsx:292-300`,
  `ramp/index.typeroof.jsx:251-259`).
- Consumers: `TypeStagePaneStyler` (`pane-styler.typeroof.jsx:36-93`, merges
  `new Map([...typeSpecnion, ...nodePropertiesMap])`, node wins) and
  `UIDocumentTypeSpecStyler` (`type-spec.typeroof.jsx:253-266`, same
  spread-merge at :288-294, reads `${LAYOUT}width` at :263).
- **Relation decision for 5b**: the meta document root
  (`DocumentNodesMetaDocument`) currently has no nodeProperties role; the
  root scope can stay in `TypeSpecLiveProperties` — meta nodes already
  delegate to it via `rootNodeProperties@`. Moving it is optional.

### 5. Protocol/lifecycle patterns

- `SimpleProtocolHandler` (`component.mjs:171-248`): `register` throws on
  duplicates (:195-198) and returns a bound `_unregister`; `getUpdated(id)`
  → `[wasUpdated, value]`; `setUpdated` adds to a `Set` log;
  `resetUpdatedLog` clears it; `getRegistered` returns
  `notFoundFallbackValue` (here `null`) instead of throwing (:217-218).
- **Gap: `nodeProperties@` is never reset.** Controllers reset only
  `typeSpecProperties@`, `stylePatchProperties@`, `styleLinkProperties@`
  (type-stage `index.typeroof.jsx:700-727`; ramp `:448-464`). Today the one
  root registration stays "updated" forever → consumers re-apply every
  cycle (harmless: idempotent CSS). With per-node `setUpdated` pushes in
  5b the log must be reset per cycle or every consumer re-fires every
  update.
- Imperative register/unregister precedent exists:
  `environment-provider.mjs:105` (`this._unregisterFns.set(key,
  this._handler.register(key, value))`); also `ui-map.mjs:1019`.
- Consumer accessor contract: consumers receive the **registered component**
  and read an accessor — `.typeSpecnion` / `.nodeProperties`
  (`pane-styler.typeroof.jsx:49-59`, `type-spec.typeroof.jsx:251-259`;
  null-tolerant because of `notFoundFallbackValue: null`).
- Consume-only-if-registered idiom: `getStyleLinkPropertiesId`
  (`derivations.mjs:393-412`) — build id, `hasRegistered` check, return
  `null` when absent.
- `getTypeSpecPropertiesIdMethod` (`integration.typeroof.jsx:170-272`):
  WeakMap memo per `nodeSpecToTypeSpec` model instance; **memoKey =
  `${origin}|${asPath}|${pathOfTypes.join("\n")}` — the protocol name is
  NOT in the key** (:181-186); every hit is re-validated with
  `hasRegistered(`${protocolHandlerName}${cached}`)` (:190-197), so
  cross-protocol aliasing stays correct but a miss recomputes and
  overwrites the shared cache slot (thrash if both protocols alternate on
  the same pathOfTypes). Passing the 4th arg `"nodeProperties@"` works but,
  per §2, the node channel's parent lookup should be document-path math —
  the method's real 5b use is the hostMap's typeSpec path with the default
  4th arg, where no aliasing arises.
- Rebuild-check gap (confirmed): `_provisionTypeSpecStyler`'s
  replace-or-keep test compares **only** `properties@`
  (`viewer.typeroof.jsx:458-461`: `oldWrapper.dependencyReverseMapping
  .get("properties@") !== typeSpecProperties`). Per the plan it must also
  compare `nodeProperties@` once per-node payloads diverge — today all
  per-node ids delegate to the same root map, so a stale wrapper is
  invisible; with real scopes a re-resolved parent path would strand a
  stale `nodeProperties@<oldPath>` mapping.
- Styler composition today is a **spread-merge copy**
  (`type-spec.typeroof.jsx:288-294`), not a `CascadingMap` — precedence is
  already node-over-style, matching the plan's
  `CascadingMap([["node",…],["style",…]])` semantics; switching to the
  facade is a deliberate (non-behavioral) choice.

### 6. Geometry-migration surface

`properties-generators.mjs` was last touched by `e012337f` (pre-Phase-4);
Phase 4 did **not** modify it. State today:

- Old typeSpecnion geometry stream **fully intact but orphaned**:
  `environmentGen` (:53-73) and the old `availableSizesGen` (:81-~170,
  yields `generic/available{Width,Height}` + `generic/width|height`
  synthetics, tombstones `specific/root/*` at :91-95) are still in
  `TYPE_SPEC_PROPERTIES_GENERATORS` (:681-698). **No consumer anywhere in
  `lib/js` reads the `generic/available*|generic/width|height` keys** —
  all CSS application reads `layout/*` from the nodeProperties channel.
- `horizontalLayoutRunion` (:553-668): style locals (`inlineMargins/*`,
  `lineLength`, `columnGutter` values; `columnCount` at :596-598); `/pt`
  synthetics (:577-594, `enToPt` = value/2·fontSize); **both inheritance
  re-routes still verbatim** — `generic/width ← generic/availableWidth`
  (:648-652) and `generic/availableWidth ← lineLength·0.5·fontSize`
  (:659-666); only a commented-out lineLength tombstone (:668).
- `horizontalWidthSum` (:534-545): confirmed unused (the known lint error);
  intended for absolute column-layout width (commented-out yield :628-637).
- `innerPropertiesData` width read: `${LAYOUT}width` at
  `type-spec.typeroof.jsx:263`; `getDefault` returns `[false, ""]` for all
  `LAYOUT` keys (:345-349) — "when absent (non-root scopes) the CSS
  property stays unset".
- **Observation for 5b semantics**: today every per-node id delegates to
  the root map, so **every node's styler sees the root's `layout/width`
  and applies it as CSS width**. With real per-node scopes, the cascade
  ([local, parent]) inherits `layout/width` from the root through the
  parent layer unless generators tombstone/re-route it — the plan's
  "availableWidth re-route moves to node-properties generators" must
  decide which nodes see `layout/width` (identity synthetic exists only
  at root today) vs. only `layout/availableWidth`.
- Old seeding remnant: `seedTypeSpecDefaults` (`live-properties.typeroof.jsx:26-46`)
  still accepts `environment`/`width`/`height` options but the root call
  site (:148-155) passes only `rootFont` — the `specific/root/*` seeding
  path is dead code at the call site.

### 7. Test surface

- `lib/js/tests/type-stage-viewer-behavior/index.test.mjs` — the G1–G7
  behavior safety net (5a); must pass unmodified; already asserts per-node
  `nodeProperties@` registrations live in editor-only mode.
- `lib/js/tests/type-stage-pane-sizing/index.test.mjs` — env→nodeProperties→CSS
  end-to-end (asserts `"600pt"`, `"300pt"`, `"112.5pt"`); fed by the new
  channel, assertions unchanged since Phase 4.
- `lib/js/components/layouts/type-stage/node-properties.test.mjs` — unit
  tests: root map env keys, percent/absolute resolution (75% of 800px →
  450pt), identity synthetics, empty-host scope, **child scope inherits
  `layout/availableWidth` through the `"parent"` cascade layer** — the
  closest existing model for 5b's node→node cascade.
- `live-properties.test.mjs`, `type-specnion.test.mjs` — scope machinery
  behavior patterns to mirror.
- No test exercises `columnCount`/column widths — the plan's new
  column-layout behavior test is genuinely new coverage.
- `.prettierignore`: entries for `document-nodes-meta/`,
  `node-properties{,-generators,.test}.mjs`, `scope-resolution.mjs`,
  `cascading-map{,.test}.mjs` all present; any **new** `.mjs` still needs
  its own `!` line.

### 8. hostContext/NodeModel (Q5)

No generator receives a NodeModel/host context today; generator signature
is uniformly `gen(outerAPI, hostMap)`. The umbrella plan defers
`hostContext` out of v1 — confirmed nothing in the committed code forces
it. Note the meta node itself has the pmNode-derived model entry
(`getEntry(rootPath.parent).get(key)`), so a future hostContext is
available at scope-construction sites.

## Code References (5b touch points)

- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:268-310` — per-node registration + `rootNodeProperties@` delegation (the 5b replacement site)
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:226-229` — `get nodeProperties()` live delegation (payload accessor contract)
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:204-220` — dispatcher provisioning, typeKey rebuild, registration-on-dispatcher rationale
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:521-614` — meta root: `widgetBus.originTypeSpecPath` (:526), pathOfTypes seed, rootState cache
- `lib/js/components/layouts/type-stage/node-properties.mjs:26-111` — scope class + `getRootNodePropertiesMap`
- `lib/js/components/layouts/type-stage/node-properties-generators.mjs:23-57` — `availableSizesGen`, `NODE_PROPERTIES_GENERATORS`
- `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:134-210` — root scope build + root `setUpdated` push
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx:264-273` — root registration settings gate
- `lib/js/components/prosemirror/integration.typeroof.jsx:170-272` — `getTypeSpecPropertiesIdMethod` (+ memo aliasing :181-197)
- `lib/js/components/layouts/type-stage/document-nodes-meta/derivations.mjs:362-388` — `typeSpecStylerDependencyMappings` (consumer wiring)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:296-320` — `_createTypeSpecStylerWrapper` (per-node id construction)
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:404-472` — `_provisionTypeSpecStyler` rebuild-check (`properties@`-only at :458-461)
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:253-294` — styler channel merge + `${LAYOUT}width` read
- `lib/js/components/layouts/type-stage/properties-generators.mjs:553-668` — `horizontalLayoutRunion` re-routes (:648-666) to migrate; `horizontalWidthSum` :534
- `lib/js/components/basics/component.mjs:171-248` — SimpleProtocolHandler; :292-297, :765-782 settings registration lifecycle
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:292-300, 700-727` — protocol install; resetUpdatedLog gap
- `lib/js/components/layouts/ramp/index.typeroof.jsx:251-259, 448-464` — same for ramp

## Open Questions (for the plan phase)

1. **Scope ownership locus**: does `DocumentNodesMetaNode` (dispatcher)
   build/own the scope itself, or a dedicated child component
   ("NodePropertiesLiveProperties-style")? The dispatcher already owns the
   registration and the accessor; a child component would re-map all
   dependencies. Lean: dispatcher owns, mirroring TypeSpecLiveProperties'
   role without a Meta analogue (plan: "the meta layer *is* the structure").
2. **hostMap dependency**: mapping `typeSpecProperties@<effectivePath>` on
   each meta element node makes every meta node depend on the typeSpec
   registry's update cycle — check interaction with the dispatcher's
   typeKey-rebuild (mapping change → wrapper re-provision?) and with
   silent/unknown nodes (fallback walk lands on root typeSpecnion —
   matches the existing resolution fallback).
3. **`nodeProperties@` resetUpdatedLog**: add to both controllers' update
   cycles (list of handler names to reset), or per-node pushes will keep
   consumers firing every cycle.
4. **Which nodes yield `layout/width`**: identity synthetic is root-only
   today; with cascade inheritance every descendant sees it through the
   parent layer. The geometry migration must define per-node width
   semantics (re-route from parent's `layout/availableWidth`? tombstone?)
   before `horizontalLayoutRunion`'s re-routes leave the typeSpecnion.
5. **Text-node registration**: keep (harmless, uniform) or drop per the
   plan's consume-only note?
6. **Styler merge → CascadingMap**: behavior-neutral swap; do it with the
   rebuild-check fix or separately?
7. **Old channel teardown order**: `environmentGen`/old `availableSizesGen`
   and the re-routes are orphaned producers — remove in 5b (with
   `horizontalWidthSum` lint resolution) or a cleanup commit after?
8. **Parent-first ordering test**: umbrella plan demands verifying the
   ordering with a behavior test *before* building on it — candidate
   location: `node-properties.test.mjs` (cascade level) vs. a viewer-
   behavior test at widget level.
