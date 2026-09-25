---
date: 2026-09-06T10:47:00+02:00
git_commit: 8dbd2055
branch: demo/wikipedia
repository: TypeRoof
topic: "Phase 3 implementation: DocumentNodesMeta attachment interface (DOM-free meta, viewer attaches)"
tags: [plan, type-stage, document-nodes-meta, viewer, attachment-interface, phase-3]
status: approved-design
research: docs/planning/agentic-artefacts/thoughts/research/2026-09-05-2119-document-tree-walker-renderer-separation.md
cycle-plan: docs/planning/agentic-artefacts/thoughts/plan/2026-09-05-2159-document-tree-walker-renderer-separation.md
umbrella-plan: thoughts/plans/2026-09-05-1623-node-properties.md
---

# Phase 3: DocumentNodesMeta Attachment Interface — Implementation Plan

## Overview

Implement Phase 3 of the cycle plan (the ownership flip): `DocumentNodesMeta`
becomes an always-active, **DOM-free** widget tree over `./document` in both
layouts; the mode-gated viewer attaches to it via a callback that returns
widget descriptions, and owns all DOM. Per-node
`nodeProperties@<documentNodePath>` registrations are wired (payload: live
delegation to the root map — behavior-neutral; 5b installs real per-node
scopes).

This plan is the Step-0 design the cycle plan requires before code. It was
converged with the operator in session 2026-09-06 (three review rounds).

## Design (locked with operator, 2026-09-06)

1. **The meta tree is DOM-free.** No `DocumentNodesMeta*` class touches
   `domTool`, holds an element, or calls `insertBefore`. DOM knowledge lives
   in the handler (bound to the viewer) and the viewer-side attachment
   classes. (Operator: "The Viewer owns the DOM, the Meta doesn't know
   anything about the dom.")
2. **Discovery via `getWidgetById`** (the prosemirror switchboard pattern,
   `prosemirror.typeroof.jsx:33-37`). The **id is configured in the layout
   controller, not in the meta module**: the controller defines
   `const documentNodesMetaId = "documentNodesMeta"`, puts it in the meta
   tuple's settings, and passes it to the viewer tuple as an arg.
3. **Attach/detach API** (single-argument; the host element does NOT travel —
   the viewer's handler closes over its own article):

   ```js
   // UIDocumentViewer constructor:
   this.__attachHandler = this._attachHandler.bind(this);
   const meta = this.widgetBus.getWidgetById(documentNodesMetaId, null);
   meta?.attachRenderer(this.__attachHandler);
   // UIDocumentViewer destroy:
   meta?.detachRenderer(this.__attachHandler);
   this.__attachHandler = null;
   ```

   Handler identity (the stored binding) is the key into the meta tree's
   per-level `Set<handlerFn>` / `Map<handlerFn, wrapper>` structures. The
   `null` fallback + `?.` covers full-teardown ordering (meta is destroyed
   before the viewer; `_destroyWidget` deletes the id from `_idToWidget`).
4. **Handler contract.** Per meta node, the meta tree calls
   `handlerFn(metaInfo, domParent)` and gets back a widget description
   `[settings, dependencyMappings, Constructor, ...args]` which the **meta
   node initializes itself** (`_initWrapper` in the meta node's context —
   `require("raw:zones")` works there, the CollapsibleContainer pattern).
   `null` return = this renderer doesn't render this node.

   ```js
   metaInfo = {
       typeKey,            // "text" vs. element dispatch result
       rootPath,           // absolute document-node path
       documentRootPath,
       pathOfTypes,        // ancestor type chain
       context,            // inInlineContext, hasTypeSpecStyling, …
       renderingPlan,      // element nodes: resolveElementRenderingPlan result
       reposition,         // false on attach; true on reorder notification
   }
   ```

   `domParent` is an **opaque token** the meta forwards but never interprets:
   the article at the root container (supplied by the handler itself via
   closure — see 5), an attachment's `wrapper.widget.node` at nested levels.
   If a handler returns `null` for a node, its children attach with the
   nearest rendered ancestor's `domParent` (edge case; the 5a viewer never
   returns `null`).
5. **DOM insertion is viewer-side.** The description's `Constructor` is the
   attachment widget (`UIDocumentElement`/`UIDocumentTextRun`, existing
   names — `type-spec-styler.test.mjs:81` uses
   `Object.create(UIDocumentElement.prototype)`, untouched). Its constructor
   receives `domParent` + a viewer-owned **attachment registry** (`Map`,
   keyed by `metaInfo.rootPath`, created by `UIDocumentViewer` and passed
   through the handler's returned args), resolves siblings against earlier
   siblings' registry entries (today's `_insertIntoSlot` algorithm, moved
   into a viewer-side helper), inserts, and registers itself. `destroy()`
   unregisters and removes the node (existing `node.parentElement` guard).
   Provisioning order guarantees parents and earlier siblings attach first.
6. **Reorder** (G5): the meta container's `_reorderChildren` re-calls the
   handler for each affected key with `metaInfo.reposition = true`. The
   handler re-inserts the existing attachment's node via the registry and
   returns `null`; the meta creates no new wrapper. The old monkey-patch,
   `_insertIntoSlot`, `_insertNodeIntoSlot`, and the container's
   `_destroyWidget` override all disappear from the meta side.
7. **Cascade.** Every meta-tree level implements the same `attach(fn)` /
   `detach(fn)` pair: containers store the handler set and cascade to
   existing children; newly provisioned children attach stored handlers at
   creation. `DocumentNodesMetaNode` (dispatcher) attaches its typeKey-child
   after creating it; on typeKey rebuild the old child's attachments die with
   it. Meta element/text-run invoke the handler, initialize the description,
   keep `Map<handlerFn, wrapper>`, and (element) cascade into their child
   `DocumentNodesMetaNodes` with the attachment's node as `domParent`.
   Structurally N renderers; 5a attaches exactly one, no multi-renderer tests.
8. **Update timing, two scenarios:**
   - **Boot (viewer mode, the default):** controller provisioning constructs
     all widgets in tuple order (meta before viewer) → viewer constructor
     attaches (handler stored at the root) → updates run in tuple order →
     meta's `initialUpdate` provisions the tree, each node attaches stored
     handlers during `_provisionWidgets` and adds the attachment wrappers to
     its `requiresFullInitialUpdate` return (the `UIDocumentTextRun` dynamic
     styler-widget pattern). Same-cycle article population.
   - **Mode switch (editor→viewer, tree built, no meta dependency changed):**
     the attach cascade walks existing nodes synchronously and calls
     `attachmentWrapper.widget.initialUpdate(rootState)` with `rootState`
     **cached by the meta root on every `update`** (`compareResult.newState`).
     The cache is current: any document change wakes the meta tree. Detach is
     a synchronous `_destroyWidget` cascade. (Riskiest mechanism — the spike
     validates it first.)
9. **Per-node registrations on the dispatcher.**
   `DocumentNodesMetaNode` settings carry
   `{"nodeProperties@": widgetBus.rootPath.toString()}` — NOT the
   typeKey-child: `UIDocumentNode._provisionWidgets` creates the new wrapper
   before destroying the old, and `SimpleProtocolHandler.register` throws on
   duplicates (`component.mjs:195-198`). The dispatcher survives typeKey
   rebuilds; list keys are stable across moves (G5-safe). Payload: the
   registered component exposes `get nodeProperties()` live-delegating to the
   root registration's `nodeProperties`; each meta node maps the root id as
   `"rootNodeProperties@"` and pushes `setUpdated(ownId)` on change, guarded
   by `hasProtocolHandlerRegistration` (live-properties idiom).
10. **Consumer migration (cycle-plan decision 4).**
    `typeSpecStylerDependencyMappings` (`document-nodes-meta.mjs:367`)
    switches its hard-coded root `nodeProperties@` id to
    `nodeProperties@<documentNodePath>` (from `metaInfo.rootPath`). Pane
    stylers (context-free) keep the root id. Mark style-link stylers have no
    `nodeProperties@` dep — untouched.

## Class inventory

**New module** `lib/js/components/layouts/type-stage/document-nodes-meta.typeroof.jsx`
(widget classes → `.typeroof.jsx`; no `.prettierignore` entry needed; the
existing `.mjs` stays the pure-function library):

- `DocumentNodesMeta` (root, `_BaseContainerComponent`): handler set,
  `attachRenderer`/`detachRenderer`, `pathOfTypes` seed, `rootState` cache.
- `DocumentNodesMetaNodes` (`_BaseDynamicMapContainerComponent`): dynamic-map
  provisioning over `content`, key→meta-node bookkeeping, handler cascade,
  `_reorderChildren` via reposition notifications.
- `DocumentNodesMetaNode` (`_BaseContainerComponent`): typeKey dispatch +
  node-identity rebuild (adopted from `UIDocumentNode`), per-node
  `nodeProperties@` registration, handler→child attach.
- `DocumentNodesMetaElement`: plan derivation, `pathOfTypes`/`childrenContext`
  extension, child-container provisioning always (the recursion), handler
  invocation, `domParent` forwarding.
- `DocumentNodesMetaTextRun`: thin — context pass-through + handler
  invocation.

**Viewer** (`viewer.typeroof.jsx`): `UIDocumentViewer` (article, pane styler,
attach/detach, attachment registry, `_attachHandler`); `UIDocumentElement`/
`UIDocumentTextRun` as attachment widgets (DOM creation from
`metaInfo.renderingPlan`, attr-diff application, typeSpec-styler
provisioning, mark wrappers + mark stylers, text updates, self-insertion via
registry + `domParent`).

**Registrations**: meta tuple (id from controller, `relativeRootPath:
./document`, deps nodeSpec/markSpec/nodeSpecToTypeSpec, no zone, no
activationTest) **before** the viewer tuple in type-stage; same tuple in ramp
(no viewer there — the design center's purest case).

## Implementation steps

1. **Spike (validates design point 8):** minimal `DocumentNodesMeta` root +
   registration in type-stage; boot in viewer mode and editor→viewer
   round-trip; G1/G2 green. Stop and report if mid-cycle
   `initialUpdate(cachedRootState)` misbehaves.
2. Meta node/container/element/text-run classes + handler cascade + per-node
   registrations.
3. Viewer becomes the attachment (handler, registry, self-insertion,
   reposition handling).
4. Ramp registration.
5. Consumer migration (design point 10).
6. Verification (below); pause with commit message + file list; commit on
   OKOK.

## Success criteria

- Automated: `npm run typecheck`, `npm run lint`, `npm test` green; the G1–G7
  behavior suite passes **unmodified**.
- New assertion (in the G1/G2 suite): in editor-only mode no
  `article.typeroof-document` exists while per-node `nodeProperties@`
  registrations are live (`hasRegistered("nodeProperties@<documentNodePath>")`
  via the world's protocol handler).
- Manual (required, not optional): wikipedia demo — editor, viewer, compare
  modes render and switch identically; ramp layout renders, labels/parameters
  work.

## What we're NOT doing

- No real per-node `HierarchicalScopeNodeProperties` (5b).
- No outfitter migration (5b or later).
- No multi-renderer tests (the maps support N; one is exercised).
- No behavior changes: parked FIXMEs stay parked (tag-change re-resolution,
  leaf-ness transitions, next-sibling unknown-type). The pinned mark-wrap
  quirk (G7) fix is the first post-5a commit.

## Commit discipline (operator instruction, absolute)

Before EVERY commit: stop, present commit message + file list, proceed only
on operator's "OKOK". Commit messages carry the metadata trailer read from
its actual sources at commit time (provider/model from
`~/.config/goose/config.yaml`, `agent: goose v<version>`).
