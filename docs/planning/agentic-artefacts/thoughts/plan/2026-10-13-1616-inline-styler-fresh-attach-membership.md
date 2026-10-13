---
date: 2026-10-13T16:16:00+02:00
git_commit: 6394787b
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Inline styler fresh-attach fix: _widgets membership for the inline style wrappers"
tags: [plan, viewer, style-links, inline-nodes, phase4-subcycle]
status: approved-for-implementation
upstream:
  handover: docs/planning/inline-node-refinements/2026-10-13-phase4-viewer-channel-HANDOVER.md
  research: thoughts/research/2026-10-13-1503-viewer-fresh-attach-inline-styler.md
  plan: thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md
  roadmap: docs/planning/inline-node-refinements/ROADMAP.md
---

# Inline styler fresh-attach fix — `_widgets` membership: Implementation Plan

## Overview

Phase-4 sub-cycle fix for the single remaining phase-4 failure: a fresh
viewer attach after an editor→viewer mode switch leaves all inline
elements unstyled. The inline styler + trigger wrappers gain
`this._widgets` membership (the block-channel precedent,
`viewer.typeroof.jsx:733`) so the framework's base `_provisionWidgets`
loop creates them and `_update` delivers their full initial changedMap
on fresh attach. All manual wake paths stay untouched.

## Current State Analysis

Phase 4 is committed as `6394787b` (clean working tree). Probe
`qa-inline-node-style-links.mjs`: 5 of 6 steps pass; the failing step is
"back to viewer (stable edge)" — after the mode switch all 153
`[data-node-type="generic-inline"]` elements render `styleAttr: null`.

Root cause (research round, 2026-10-13): the inline wrappers are
constructed via bare `_initWrapper` inside `_provisionInlineStyleStyler`
(`viewer.typeroof.jsx:618-625`, `:666`) and are never inserted into
`this._widgets`:

- Every framework wake channel iterates only `_widgets` members with
  `widget !== null` (`component.mjs:1108-1115`, `_update`
  `component.mjs:1238-1285`; the `requiresFullInitialUpdate` set is
  consulted only for wrappers already dispatched, `:1265-1267`).
- Live edge edits work solely through the two MANUAL wake sites
  (`_syncMetaInfo`'s dispatcher `viewer.typeroof.jsx:411-419`/`:424-428`;
  `_inlineStyleTriggerUpdate` `:679-681`), which hand-roll
  `_createWidget` + changedMap + `widget.update`.
- A fresh attach after a mode switch produces NO wake event: the
  always-active meta tree's scopes settled long before the attachment
  existed (`_scopeSettled` fires only on scope REBUILD,
  `document-nodes-meta/index.mjs:656-662`, `:731`; `attach` never
  replays settled state, `index.mjs:85-124`), and `pathChanged`/
  `scopeSettled` are both false on the constructor path
  (`viewer.typeroof.jsx:272`, `:297`).
- SLM registration is NOT the problem — the `styleLinkProperties@` ids
  resolve non-null at provision time; the payload exists; nothing
  consumes it. `TRIGGERS made=776 fired=0` is the membership gap
  measured ("fired" = cascade dispatch, which structurally cannot reach
  non-members).

## Desired End State

- Probe `qa-inline-node-style-links.mjs`: **6 of 6** steps pass,
  including "back to viewer (stable edge)" — fresh attachments style
  via the framework initial-update delivery.
- Live paths (edge add / tombstone / re-link, editor mode) unchanged —
  they keep their manual wake.
- The trigger wrapper becomes cascade-dispatchable (the made/fired
  asymmetry retires): on a same-pass `typeSpecProperties@<containing>`
  mark it fires via the normal relevance filter
  (`component.mjs:972-978`), in addition to the scope-settled refresh.
- Block styling byte-identical; composition suite (the canary) green;
  `npm run typecheck`, `npm run lint`, vitest 55 files / 541 tests green.

### Key Discoveries

- Block-channel precedent: `_provisionTypeSpecStyler` splices its
  wrapper into `_widgets` (`viewer.typeroof.jsx:733`) — membership is
  what makes the framework deliver the full initial changedMap
  (`component.mjs:1195-1206`, `:1222`; protocol deps delivered
  unconditionally on initial update, `:643-647`).
- The `composition@` triggers are `_initWidgets`-created list members
  (`viewer.typeroof.jsx:336-341`, `:833-841`) — the working
  GenericUpdater precedent.
- The existing splice-out cleanups in `_provisionInlineStyleStyler`
  (`:612-617` trigger rebuild, `:634-635` styler rebuild) and in
  `_syncMetaInfo`'s destroy block (`:391-404`) are currently dead code
  for a membership that never exists — they become live and correct
  as-is once membership is established (they remove by
  `indexOf` before re-adding).
- The id-equality early return (`:627-636`) stays correct with
  membership: an unchanged id returns no new wrappers; the base loop
  sees existing members (`widget !== null`) and does not re-create.
- Double-wakes are harmless and expected: with the trigger a member,
  a live edge edit can reach it via cascade AND via the scope-settled
  refresh; the handler is idempotent (guarded by the id-equality
  rebuild comparison). NO de-duplication machinery.

## What We're NOT Doing

- **No refactor of the manual wake paths** (the hand-rolled
  create+changedMap+update blocks in `_syncMetaInfo` `:411-419` and
  `_inlineStyleTriggerUpdate` `:679-681` stay). Follow-up note
  recorded in this plan and in the ROADMAP — see "Follow-up Note".
- No meta-side settled-state replay on `attach` (rejected by operator:
  blast radius — attach machinery serves all attachments).
- No phase-5 ("Node Style Links" UI) or phase-6 (composition basis
  threading) upstream work.
- No de-dup machinery for double-wakes (idempotent by design).
- No VWPROV re-instrumentation (research open question 2 — the probe
  is the gate; the anomaly does not change the root cause).
- NO perf-composition runs (operator rule 2026-10-06).

## Implementation Approach

Single phase: insert the two inline wrappers into `this._widgets` at
their creation sites inside `_provisionInlineStyleStyler`, mirroring the
block channel's `splice(0, 0, wrapper)` (`:733`). The base
`_provisionWidgets` loop (`component.mjs:1319-1323`) then instantiates
them on fresh attach, and `_update` delivers the full initial changedMap
to the `requiresFullInitialUpdate` entries (`component.mjs:1265-1283`)
— the exact mechanism that already styles blocks correctly on fresh
attach. Ordering within `_widgets` is not load-bearing (updates are
idempotent; creation is per-member; the relevance filter gates
per-wrapper) — both wrappers are front-spliced at their creation sites,
whichever is built later sitting closer to the head.

## Phase 1 — `_widgets` membership for the inline styler wrappers

### Overview

`_provisionInlineStyleStyler`'s two wrapper products (GenericUpdater
trigger + `UIDocumentStyleStyler`) become `this._widgets` members so the
framework provisions them on fresh attach. Nothing else changes.

### Changes Required

#### 1. Trigger wrapper membership
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**: in `_provisionInlineStyleStyler`, at the trigger creation
site (`:618-625`), after `this._initWrapper(...)` assigns
`this._inlineStyleTriggerWrapper`:

```js
this._widgets.splice(0, 0, this._inlineStyleTriggerWrapper);
```

The pre-existing rebuild cleanup above it (`:612-617`, indexOf +
splice-out + `_destroyWidget`) already removes an old member before
this runs — no change needed there; it goes from dead to live code.

#### 2. Styler wrapper membership
**File**: same
**Changes**: at the styler creation site (`:663-667`), after the
`_initWrapper` call assigns `wrapper` (before/with
`this._inlineStyleStylerWrapper = wrapper`):

```js
this._widgets.splice(0, 0, wrapper);
```

Again the rebuild cleanup (`:634-635`) already removes the old member
first. `newWrappers` keeps flowing unchanged to all three consumers:
the `_syncMetaInfo` dispatcher's manual wake (`:411-419`), the trigger
handler (`:679-681`), and `_provisionWidgets`'s
`requiresFullInitialUpdate` set (`:550-552`) — which NOW actually
takes effect for these wrappers because they are members.

#### 3. Comment update
**File**: same
**Changes**: extend the `_provisionInlineStyleStyler` doc comment
(the block explaining the trigger) with one sentence recording the
membership requirement: fresh attachments have no scope-settle/
path-change event (scopes settle before attach; `attach` does not
replay settled state), so the wrappers must be `_widgets` members for
the framework's initial-update delivery to reach them — the block
channel's `splice(0, 0, …)` convention.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck` + `npm run lint` pass
- [x] vitest 55 files / 541 tests green — especially the
      text-composition suite (the canary; it caught the earlier
      `viewer.typeroof.jsx` damage) and the third-family
      type-specnion tests
- [x] Probe: `./scripts/debug-with-puppeteer.mjs
      ./scripts/puppeteer-probes/qa-inline-node-style-links.mjs` —
      **6 of 6** steps pass, exit 0; specifically "back to viewer
      (stable edge)": all 153 generic-inline elements styled at the
      patch's values, no PAGEERROR
- [x] Regression probes stay green: `qa-structure-marks.mjs`,
      `qa-editor-mark-styling.mjs`, `qa-inline-node-dom.mjs` (block
      styling byte-identical, DOM parity untouched)

#### Manual Verification
- [x] **LIVE CHECKPOINT (operator)** — resolved via live DOM readout
      2026-10-13 (the designed UI checkpoint is impossible before the
      phase-5 "Node Style Links" UI; the probe exercises the channel
      via the state API instead): en/Typography references list renders
      composed and styled through the mode-switch cycle. Observation
      recorded for **phase 6** (upstream plan): marks nested inside
      inline nodes resolve their style links at the ROOT fallback
      (`generic-inline`'s empty nodeSpecToTypeSpec link → root, per
      `getTypeSpecPropertiesIdMethod`), so an italic patch set to
      `1em` composes against the root's 14pt origin instead of the
      li's 18pt context (the `em`/`cite` readout: `font-size: 14pt`,
      `opsz: 14`, `slnt: -10` — payload applied, basis wrong). The
      inline node itself resolves at the li's context
      (`pathOfTypes.slice(0, -1)`); only the nested MARKS fall back.
      Pre-existing, exactly the phase-6 nested-leaf basis scope.

**Implementation Note**: after the automated battery passes, pause and
propose the commit message (with model/provider/agent metadata) per
the RPI protocol; wait for operator confirmation.

## Follow-up Note (explicitly out of scope)

The manual wake sites hand-roll `_createWidget` + changedMap +
`widget.update` in three places (`_syncMetaInfo` `:411-419` — which
serves the block channel too — and `_inlineStyleTriggerUpdate`
`:679-681`). Once membership is in, a follow-up cycle could evaluate:

1. **Full framework reliance**: drop the manual blocks and rely on
   cascades creating/dispatching the re-provisioned members. Load-
   bearing open question (research doc, open questions §1): whether a
   framework cascade is GUARANTEED to follow a `_syncMetaInfo`
   re-provision (the scope-settled refresh runs inside the META
   element's cascade, not the element's own container update — the
   `nodeProperties@` settle mark should make the element relevant in a
   following pass, but the ordering is unverified).
2. **Fallback**: a shared `createWidgetAndUpdate(wrapper)` helper
   (DRY) if the ordering does not hold.

Recorded in ROADMAP "Follow-ups"; not part of this plan.

## Testing Strategy

The change is viewer wiring — the behavior gates are the probes. No
new vitest suites are required; the existing battery must stay green:

- **Behavior asserted**: fresh attach styles inline elements (probe
  step 6), live paths unchanged (probe steps 2–5), blocks byte-
  identical (`qa-structure-marks` baseline compare), editor mode
  unchanged (`qa-editor-mark-styling`), DOM parity (`qa-inline-node-dom`).
- **Canary**: text-composition suite — any wiring damage in
  `viewer.typeroof.jsx` historically shows here first (handover
  caveat 4).
- Unit-level mechanics (membership, initial-update delivery) are
  framework behavior already covered by the block channel; duplicating
  them as vitest would assert implementation, not behavior.

## Verification Protocol

1. `npm run typecheck` 2. `npm run lint` 3. `npm run format:write` (if
   touched files drift) 4. vitest 5. probes (gate + regression trio)
6. STOP — propose commit message with model/provider/agent metadata;
   wait for operator confirmation (MANNERS / COLLABORATION).

## References

- Research round (root cause + mechanics):
  `thoughts/research/2026-10-13-1503-viewer-fresh-attach-inline-styler.md`
- Handover: `docs/planning/inline-node-refinements/2026-10-13-phase4-viewer-channel-HANDOVER.md`
- Upstream plan (phase 4 context): `thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md`
- ROADMAP (decisions): `docs/planning/inline-node-refinements/ROADMAP.md`
