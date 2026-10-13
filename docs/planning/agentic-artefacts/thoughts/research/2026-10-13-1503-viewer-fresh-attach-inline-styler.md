---
date: 2026-10-13T15:03:39+02:00
git_commit: 6394787b
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Viewer fresh-attach lifecycle: why inline style stylers never apply after a mode switch"
tags: [research, codebase, viewer, style-links, inline-nodes, phase4-subcycle]
status: complete
upstream:
  handover: docs/planning/inline-node-refinements/2026-10-13-phase4-viewer-channel-HANDOVER.md
  plan: thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md
---

# Research: Viewer fresh-attach lifecycle — inline style stylers after a mode switch

## Research Question

Handover scope (phase-4 sub-RPI seed): why does a **fresh viewer attach after
an editor→viewer mode switch** leave all 153 `[data-node-type="generic-inline"]`
elements unstyled (`styleAttr: null`) while every live edge-edit path (add /
tombstone / re-link, editor mode) styles correctly? Sub-questions from the
handover: where fresh `UIDocumentElement` attachments provision, when
`_syncMetaInfo`/`_scopeSettled` fire relative to `StyleLinksMeta` registration,
whether the trigger wrapper is cascade-pruned (its protocol-only dependency),
and the `TRIGGERS made=776 fired=0` observation.

Note: the handover described the phase-4 work as uncommitted; it has since
been committed as `6394787b` (working tree clean). All line references are to
that commit. `V = lib/js/components/layouts/type-stage/viewer.typeroof.jsx`,
`M = .../document-nodes-meta/index.mjs`, `C = .../basics/component.mjs`,
`L = .../type-stage/index.typeroof.jsx`, `TS = .../prosemirror/type-spec.typeroof.jsx`.

## Summary

**Root cause found — a provisioning-membership gap, not a registration or
timing problem.** The inline styler wrapper and its trigger wrapper are
constructed with bare `_initWrapper` inside `_provisionInlineStyleStyler`
(V:618-625, V:666) and are **never inserted into `this._widgets`** — unlike
the block channel (`_provisionTypeSpecStyler` splices into `_widgets`,
V:733) and unlike the `composition@` trigger (created via `_initWidgets`,
V:336-341). Every framework wake channel (`_update` → `activeWidgets()` →
`updateWidget`) iterates only `_widgets` members with `widget !== null`
(C:1108-1115, C:1259), so the inline wrappers are structurally invisible to
all cascades. They are only ever woken by the two **manual** paths
(`_syncMetaInfo`'s scope-settled channel, V:413-429; `_inlineStyleTriggerUpdate`,
V:679-681), which hand-roll `_createWidget` + changedMap + `widget.update`.
Live edge edits trigger a scope **rebuild** → `_scopeSettled()` → refresh →
manual wake (works). A fresh attach after a mode switch produces **no scope
event at all** — the always-active meta tree's scopes settled long before the
attachment existed, `attach` does not replay settled state (M:85-124), and
`pathChanged`/`scopeSettled` are both false on the constructor path (V:277,
V:297) — so the manual wake never runs. The fresh-attach path's only hope is
the framework convention (`_provisionWidgets` → `requiresFullInitialUpdate`
set → `_update`'s consumption), but that consumption only reaches wrappers
already dispatched (C:1265-1267) — i.e. `_widgets` members. Net effect:
wrapper shells built, ids resolve non-null (VWRES-CALL 765×), `widget` stays
`null` forever, `UIDocumentStyleStyler.update` never runs, `styleAttr: null`.
An id-equality early return (V:627-636) then pins the dead state against all
later `_provisionWidgets` passes.

## Detailed Findings

### 1. Mode-switch flow: fresh attachments, reused scopes

- The viewer is **mode-gated by activation test** (L:310-322, L:702); the meta
  tree (`DocumentNodesMeta`) is **always-active** (`UPDATE_STRATEGY_NO_UPDATE`,
  M:1230-1238) and survives mode switches with its scopes/registrations intact.
- viewer→editor: `UIDocumentViewer.destroy` (V:1378-1388) → `detachRenderer`
  (M:1323-1332) → per-node `RendererAttachments.detach` (M:126-135) destroys
  every `UIDocumentElement`. Editor→viewer: the layout re-creates a fresh
  `UIDocumentViewer` (C:1298-1333 → V:1222), whose `initialUpdate`
  (V:1274-1294) calls `meta.attachRenderer` (M:1310-1321, "Mid-life (a mode
  switch) the cascade runs here") → `_attachCascade` → per node
  `RendererAttachments.attach` (M:75-124): `_initWrapper` → `_createWidget`
  (instantiates the `UIDocumentElement`) → `widgetWrapper.widget.initialUpdate(rootState)`
  (M:123; rootState cached at the meta root, M:1335-1347).
- Ordering: TypeSpecMeta (origin registry) → DocumentNodesMeta tree (scopes
  settle during early boot cycles) → mode flip → attach cascade → element
  constructors → `initialUpdate` → `_provisionWidgets`. So on fresh attach the
  typeSpec tree IS settled — the failure is not a settle-race.

### 2. The two provisioning conventions — and the missing membership

- **Framework convention**: `_BaseContainerComponent.initialUpdate` →
  `_provisionWidgets` (C:1296-1333, C:1365) → wrappers returned via
  `requiresFullInitialUpdate` are consumed in `_update` (C:1244-1285), which
  loops `activeWidgets()` = `this._widgets` members with `widget !== null`
  (C:1108-1115) and consults the requiresFullInitialUpdate set **only for
  wrappers it already dispatches to** (C:1265-1267). `_provisionWidgets`'s
  base loop `_createWidget`s only `this._widgets` members (C:1319-1323).
- **Block channel** uses the convention: `_provisionTypeSpecStyler` splices
  its wrapper into `_widgets` (V:733) → created + full initial changedMap from
  current state (C:1195-1206, C:1222). This is why blocks style correctly on
  fresh attach.
- **Inline channel** (phase 4) returns wrappers built via bare `_initWrapper`
  (never `_initWidgets` — grep confirms zero `_widgets.push` in
  viewer.typeroof.jsx): trigger wrapper V:618-625, styler wrapper V:637-671
  (`_initWrapper` at V:666). **No `_widgets` insertion exists** — the splice
  calls that ARE present run in the *cleanup* direction (V:612-615, V:634-635:
  splice-out of old wrappers), cleanup for a membership that is never created.
  The base loop and `_update` therefore never see them; `widget` stays `null`;
  `UIDocumentStyleStyler` never instantiates; its `update` (TS:1119+) is the
  only code that writes `element.style` (constructor TS:1113-1117 writes
  nothing) → `styleAttr: null`.
- **Manual convention (the live paths)**: `_syncMetaInfo`'s channel dispatcher
  (V:383-420) and `_inlineStyleTriggerUpdate` (V:672-683) both explicitly
  `this._createWidget(wrapper)` + hand-build a full changedMap
  (V:412-418: `changedMap.set(local, wrapper.widget.getEntry(local))` per
  `dependencyReverseMapping.keys()`) + `wrapper.widget.update(changedMap)`
  (V:424-428, V:679-681). Live edits work **entirely because of this
  hand-rolling** — the wrappers are just as invisible to cascades there.

### 3. `_syncMetaInfo` / `_scopeSettled`: no wake on fresh attach

- `DocumentNodesMetaElement._scopeSettled()` (M:839-846) refreshes **all** the
  node's attached handlers (`refresh(handlerFn, metaInfo, true)` →
  `widget._syncMetaInfo(metaInfo, undefined, scopeSettled)`, M:137-144). It
  is wired as the `scopeSettledCallback` of the node's `DocumentNodeProperties`
  component (M:1079) and fires **only when that scope (re)builds**
  (`DocumentNodeProperties.update`, M:651: defer gate M:685-690 while the
  parent's settled map is null; input-identity early return M:656-662 —
  settlement is a rebuild event, not a wake event; on rebuild it creates the
  scope M:692-707, marks the registration updated M:709-716, invokes the
  callback M:731).
- On a fresh post-mode-switch attach: `_nodeProperties` is already non-null
  with unchanged inputs → every meta update cycle early-returns (M:656-662)
  → **no rebuild, no `_scopeSettled()`, no refresh**. The settlement fired at
  boot / at the last live edit, when this handler was not attached (the
  previous viewer's attachments were detached, V:1383-1386). `attach`
  (M:85-124) does not check settled-ness and never synthesizes a
  `scopeSettled=true` refresh — **no replay of settled state**.
- Constructor path: `_pathOfTypes` is preset from the same plan (V:272) before
  `_syncMetaInfo(metaInfo, compositionReveal)` (V:297) → `pathChanged` false
  (V:376-379), `scopeSettled` defaults false → the dispatcher block
  (`pathChanged || scopeSettled`, V:385) — including the unconditional inline
  re-provision (V:406, V:417-418, the wake-gap fix) — is **structurally
  unreachable** on fresh attach. The wake-gap fix covers "element attached,
  edge settles later"; the failing direction is "edge already settled,
  element attaches later".
- Mode switch reuses scopes, not new ones (meta tree always-active, M:1238);
  for the fresh attachment `scopeSettled` can only become true via a FUTURE
  rebuild (typeSpec relink, typeSpecnion change, parent-scope identity change).

### 4. Trigger machinery: `made=776 / fired=0` and the protocol piggyback

- `GenericUpdater` (V:54-61): `_BaseComponent` with `UPDATE_STRATEGY_SIMPLE`
  (C:35). **Made** = `ComponentWrapper` construction (`_initWrapper`,
  C:1057-1073 — which, unlike `_initWidgets` (C:1076-1081), does NOT push into
  `this._widgets`). **Fired** = dispatch through the container cascade:
  `update` → `_provisionWidgets` → `_update` (C:1238-1272) → `activeWidgets()`
  → relevance gate (C:1268-1270) → `updateWidget` fires only
  `if (changeLocaldMap.size)` (C:1211-1212).
- The inline trigger is made via `_initWrapper` (V:618-625) → not a `_widgets`
  member → `_provisionWidgets` never `_createWidget`s it → **no state cascade
  can ever dispatch it** (structural exclusion, before the relevance filter
  even evaluates). Its only fire channels are the manual loops (§2). The 776
  constructions = cumulative remakes across inline elements × provision passes
  (the id-comparison `_inlineStyleTriggerTypeId !== typeSpecProperties`
  remakes the wrapper whenever the resolved containing id shifts, V:609);
  0 fires = it is un-dispatchable. The `composition@` trigger fires reliably
  because it IS a list member (created via `_initWidgets`, V:336-341 /
  V:833-841 → pushed C:1079 → created C:1319-1323 → relevance-checked per pass
  → fired when `composition@<path>` was marked in the same pass,
  composition-controller.ts:1653/:1695).
- **Protocol `setUpdated` piggyback confirmed** (handover hypothesis):
  `SimpleProtocolHandler.setUpdated` (C:234) only adds the id to `_updatedLog`;
  the log is consumed in exactly one place — `getChangedMapFromCompareResult`
  (C:604-653, C:631-651) — i.e. marks are only visible to a wrapper **if a
  cascade dispatches to it in the same top-level pass**. Logs are reset at the
  start of each top-level pass (L:856-886; type-tools-grid.mjs:2267/:2271).
  `isInitialUpdate` delivers protocol deps unconditionally (C:643-647) — which
  would have covered a fresh attach, had the wrapper been dispatchable.
- Relevance filter (C:828-996): model deps = prefix intersection with
  changedRoots; protocol deps → `getUpdated(external)`, missing/unregistered
  → conservative `true` (C:972-978). So protocol-id-only wrappers are not
  pruned *because of* the protocol dep — a non-member wrapper is excluded
  before the filter runs (membership is the dominant exclusion layer).
- `TRIGGERS made=776 fired=0` is thus fully explained by the membership gap —
  no separate cascade-pruning bug needs to be assumed.

### 5. The id-equality early return pins the dead state

`_provisionInlineStyleStyler` (V:580-672) stores the resolved id
(`_inlineStyleLinkPropertiesId`) and the wrapper shells. Once set, a
subsequent call with an unchanged id early-returns (V:627-636) without
rebuilding — so every later `_provisionWidgets` pass is a **no-op forever**,
even though nothing was ever created or styled. The first pass pins the
resolution; the un-created shells make it permanent.

### 6. SLM registration timing — ruled out as the cause

`StyleLinksMeta`'s registrations (`styleLinkProperties@…`) live in the
always-active meta tree and persist across the mode switch; the ids resolve
non-null at fresh-attach provision time (VWRES-CALL 765×, and
`_provisionInlineStyleStyler` builds the styler wrapper precisely because the
id is non-null, V:637-671). `StyleLinksMeta`, unlike the viewer, DOES manage
its dynamic wrappers as `_widgets` members (meta.typeroof.jsx:184:
`this._widgets.splice(0, Infinity, ...newWidgets)`). The `hasRegistered`-lag
and payload-lag hypotheses from the handover are **not** what fails — the
payload exists; nothing consumes it on the fresh-attach path.

### 7. Working precedents to mirror (for the plan, not prescriptions)

- Block channel: `_provisionTypeSpecStyler` → `this._widgets.splice(0, 0, …)`
  (V:733) — membership makes the framework deliver the full initial update.
- `composition@` trigger: `_initWidgets`-created list member (V:336-341) —
  created once by `_provisionWidgets`, woken by every same-pass mark.
- The live inline paths already hand-roll create+update (V:424-428, V:679-681)
  — the same hand-rolling on the constructor path would also close the gap.

## Code References

- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
  - :272, :297 — constructor presets `_pathOfTypes`, then `_syncMetaInfo`
    (pathChanged/scopeSettled both false on construction)
  - :336-341, :833-841 — `composition@` triggers via `_initWidgets` (members)
  - :383-420 — `_syncMetaInfo` channel dispatcher; :385 gate
    `pathChanged || scopeSettled`; :406/:417-418 unconditional inline
    re-provision; :411-419/:424-428 manual `_createWidget` + changedMap
    + `widget.update` (the live-path wake)
  - :539-561 — `_provisionWidgets` (fresh-attach entry via C:1365); :549-553
    inline branch; wrappers only ADDED to `requiresFullInitialUpdate`, never
    `_widgets`
  - :580-672 — `_provisionInlineStyleStyler`; :581-585 containing typeSpec;
    :589-598 styleLink id; :601-626 trigger wrapper (bare `_initWrapper`,
    :618-625); :609 trigger-type-id remakes (the "made" churn); :612-617
    dead `_widgets` splice-out; :627-636 id-equality early return; :637-671
    styler wrapper; :666 `_initWrapper`; :672-683 `_inlineStyleTriggerUpdate`
    (manual create+update :679-681)
  - :733 — block-channel `_widgets` splice (the missing counterpart)
  - :1222, :1274-1294, :1378-1388 — viewer create/initialUpdate/destroy
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`
  - :75-124 — `RendererAttachments.attach`; :122-123 `_createWidget` +
    `initialUpdate(rootState)` (no settled-state replay); :126-135 detach;
    :137-144 `refresh` → `_syncMetaInfo(metaInfo, undefined, scopeSettled)`
  - :651, :656-662, :685-690, :692-731 — `DocumentNodeProperties.update`:
    defer + identity gates, rebuild, `scopeSettledCallback` (fires only on
    rebuild)
  - :839-846 — `_scopeSettled()` refresh-all; :1079 callback wiring
  - :1230-1238 — meta tree always-active (`UPDATE_STRATEGY_NO_UPDATE`)
  - :1305-1332 — `attachRenderer`/`_attachCascade`/`detachRenderer` ("Mid-life
    (a mode switch) the cascade runs here"); :1335-1347 rootState cache
- `lib/js/components/basics/component.mjs`
  - :1057-1073 `_initWrapper` (no `_widgets` push) vs :1076-1081 `_initWidgets`
  - :1108-1115 `activeWidgets()` (`_widgets` members, `widget !== null`)
  - :604-653, :631-651 `getChangedMapFromCompareResult` (sole consumer of
    protocol `_updatedLog`); :643-647 initialUpdate delivers protocol deps
  - :1189-1216 `updateWidget` (fires only `if (changedMap.size)`),
    :1238-1285 `_update` (requiresFullInitialUpdate consulted only for
    dispatched wrappers, :1265-1267), :1296-1333 base `_provisionWidgets`
  - :171-247 `SimpleProtocolHandler` — `setUpdated` (:234) adds to log only;
    :225 `resetUpdatedLog`
- `lib/js/components/layouts/type-stage/index.typeroof.jsx`
  - :310-322, :695-720 mode-gated viewer wrapper; :856-886 per-pass
    `resetUpdatedLog` of the protocol logs
- `lib/js/components/layouts/type-stage/meta.typeroof.jsx`
  - :184 StyleLinksMeta manages wrappers as `_widgets` members;
    :255-266 TypeSpecMeta registrations
- `lib/js/components/prosemirror/type-spec.typeroof.jsx`
  - :1112-1117 `UIDocumentStyleStyler` constructor (writes nothing);
    :1119+ `update()` — the only DOM-style writer
- `lib/js/components/prosemirror/composition-controller.ts`
  - :1653, :1695 — `composition@` `setUpdated` marks (same-pass wake source
    for the working trigger precedent)
- `scripts/puppeteer-probes/qa-inline-node-style-links.mjs` — the gate probe;
  failing step: "back to viewer (stable edge)"

## Open Questions

1. **Design decision for `/create_plan`** (not prescribed here): where the
   fresh-attach wake should come from — (a) establish `_widgets` membership
   for the inline wrappers (the block-channel precedent, V:733) and let the
   framework deliver the initial update; (b) hand-roll `_createWidget` +
   initial update on the `_provisionWidgets`/constructor path (the live-path
   precedent, V:424-428); (c) replay settled scope state on `attach`
   (meta-side change, M:85-124 — would also generalize the wake gap). Note the
   id-equality early return (V:627-636) interacts with whichever choice: a
   rebuild no-op must not re-pin un-created wrappers.
2. **VWPROV=0 anomaly**: statically every fresh attachment must run
   `_provisionWidgets` at least once (M:123 → C:1365). The instrumented count
   of 0 is inconsistent with the flow — the counter was likely placed in a
   branch not executed for inline nodes (e.g. the block `else if`
   `_hasTypeSpecStyling`, V:554) or in the meta element's own
   `_provisionWidgets` (M:1086). Worth one re-instrumentation pass if the
   plan wants a before/after counter; does not change the root cause.
3. **Trigger-wrapper strategy**: even once the fresh-attach gap is closed,
   the trigger wrapper remains cascade-invisible (fires only via manual
   paths). Whether that is acceptable (its wake sources are scope rebuilds,
   which DO reach `_syncMetaInfo`) or should also become a `_widgets` member
   (the `composition@` precedent) is a plan-level call.
4. Probe detail for verification: the fix must make the probe's "back to
   viewer (stable edge)" step pass while keeping the other 5 steps, the
   composition suite (the canary), typecheck/lint, and the 541 vitest green.
