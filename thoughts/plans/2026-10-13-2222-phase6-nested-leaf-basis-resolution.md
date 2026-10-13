---
date: 2026-10-13T22:22:00+02:00
git_commit: af5734b4
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Phase 6: nested leaf/mark basis resolution — containing-spec anchor, measured==rendered"
tags: [plan, composition, style-links, inline-nodes, phase6-subcycle]
status: approved-for-implementation
upstream:
  handover: docs/planning/inline-node-refinements/2026-10-13-phase6-composition-basis-HANDOVER.md
  research: thoughts/research/2026-10-13-2135-nested-leaf-mark-style-resolution.md
  plan: thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md
  roadmap: docs/planning/inline-node-refinements/ROADMAP.md
---

# Phase 6 — Nested leaf/mark basis resolution: Implementation Plan

## Overview

Close the measured-vs-rendered basis divergence for content nested inside
inline nodes: run-level MARK channels anchor at the **containing typeSpec**
(nearest resolvable ancestor — decision Q1/A) via a **shared pure helper**
(Q3/option 2) used by all four rendered-channel sites; the composition
controller resolves each leaf through an **innermost-wins chain with a
node-edge fallback layer** (Q2) fed by a **meta-side resolver function**
(Q4/A); the wikipedia state ships a **demo edge on the root typeSpec**
(Q5/A). Rendered payload elements are self-contained (explicit writes;
"explicit-everything" contract) — measured == rendered by construction.

## Current State Analysis

- Five style-link resolution sites anchor three different ways for nested
  content (research §2): V1 viewer run marks + E2 editor marks anchor at
  the ROOT (empty `nodeSpecToTypeSpec` link at the deepest typeKey →
  `_getBestTypeSpecPropertiesId` starts at the typeSpec root,
  `integration.typeroof.jsx:117/:189-191`); V2/E1 (inline node channels)
  slice-then-resolve → containing spec; V3 (composition measurement)
  anchors at the textblock's spec. `li-inline → /paragraphs/t1` (18pt =
  14 × 1.285714286); `generic-inline`/`cite`/`bdi` have NO entries.
- The visible defect (operator readout 2026-10-13): italic patch `{1, em}`
  inside the cite renders 14pt + `opsz 14` (root) instead of the li's 18pt.
- The measured side never sees inline-node edges: `_resolveLeafStyleLink`
  (`composition-controller.ts:624-682`) is mark-list-only (`getWrapMarks`
  reads only `node.marks`, `derivations.mjs:434/:446`); nested leaves fall
  back to the textblock style (`styleOf`, :936-937). The viewer RENDERS the
  node element from its edge payload → measured ≠ rendered whenever the
  edge sets font-size.
- V2/E1's naive `slice(0, -1)` (`viewer.typeroof.jsx:589`,
  `type-spec.typeroof.jsx:830`) itself falls to root for NESTED inline
  chains (cite inside generic-inline: the slice still ends at an
  entry-less key) — the helper fixes this too.
- The single-id shape (`CompositionLeaf` :251-255, `leafStyles` :905,
  `styleOf` :936-937) physically embodies the at-most-one contract on the
  measured side — preserved (Q2: innermost-wins, no merge machinery).
- No state ships an `inlineNodesStyleLinks` edge (verified grep);
  defaults empty; states are NOT fixtures (operator: "the default state is
  however not a reliable fixture and should not be treated as one").

## Desired End State

- A nested mark's payload (edge lookup + `em`/`baseEm` basis) anchors at
  the **nearest resolvable ancestor's typeSpec** — in the live case the
  li's `/paragraphs/t1` (18pt). `{1, em}` italic inside the cite renders
  **18pt**; `opsz` tracks it; the root-fallback 14pt write disappears.
- All four rendered channels (V1, V2, E1, E2) share ONE anchor concept
  ("containing typeSpec" = nearest resolvable ancestor) via one shared
  helper; nested inline chains resolve uniformly.
- Measured == rendered per the **explicit-everything contract**: each
  payload-styled element writes its full resolved set; a leaf measures as
  its **innermost applicable payload** (mark payload → innermost
  inline-edge payload → textblock style). A slnt-only mark under a
  size-setting node edge measures at the mark payload's anchor-context
  size — exactly what its element writes.
- Nested marks track the **anchor spec context**, not the enclosing node
  edge's rendered size (intended; the vocabulary for context scaling is
  `em`/`pt` against the spec — patch-onto-patch chaining is out of scope).
- The wikipedia initial state ships a demo `inlineNodesStyleLinks` edge
  on the **root typeSpec** (generic-inline → patch); the live checkpoint:
  references list renders composed, cites styled, no overflow.
- Full battery green; new basis unit tests pin the anchor math.

### Key Discoveries

- The resolver walk (`getTypeSpecPropertiesIdMethod`,
  `integration.typeroof.jsx:190-235`): parent-anchored links recurse
  (`slice(0,-1)` :236-253); ONLY the empty-link case jumps to root
  (:117, :189-191) — the helper reuses the walk's own parent-anchoring
  semantics, it never enters `_getBestTypeSpecPropertiesId`.
- E2's editor path: mark finalization walks DOM subscriptions
  (`_getParentSubscription` :1394-1406); inline nodes subscribe
  themselves (`integration.typeroof.jsx:424`), so the mark's parent
  subscription holds the inline node's `pathOfTypes` (:1682-1710) —
  the helper applies at the subscription's derived resolution.
- Meta-side inline-edge resolution for the controller (Q4): the meta
  element already computes per-node `pathOfTypes` and V2 already resolves
  edges via `getEffectiveStyleLinks` +
  `getStyleLinkPropertiesId` (`derivations.mjs:405-424`) — the resolver
  function is a closure over that, keyed by document-node path.
- `CONTAINING_FONT_SIZE` (`registered-properties-definitions.mjs:76-84`)
  publishes the anchor spec's outbound effective size into the merged
  payload — anchoring at t1 fixes the `em` basis with NO new machinery.
- Probe baselines: `qa-inline-node-style-links` step 1 and
  `qa-structure-marks` assert a CLEAN baseline — with the shipped demo
  edge the initial state is not clean; the probes create their own
  baseline (tombstone first) or the demo edge is excluded there (plan
  phase 3; states ≠ fixtures).

## What We're NOT Doing

- NO patch-onto-patch (CSS-like chaining) composition: nested marks
  compose against the anchor SPEC context, never the enclosing node
  edge's rendered result (Q2 decision; option-2 machinery rejected as
  scope explosion).
- NO change to `getTypeSpecPropertiesIdMethod`'s own semantics (Q3
  option 1 rejected: ambient shift for nodeProperties scopes and every
  consumer); the shared walk stays untouched — the helper wraps it.
- NO change to the at-most-one MARK chain contract
  (`derivations.mjs:536-546`, `composition-controller.ts:670-680`):
  the inline-edge fallback is a separate resolution layer beneath the
  mark payload, not a second mark link.
- NO nodeProperties scope changes (`document-nodes-meta/index.mjs`
  scope resolution untouched).
- NO baseEm/absolute-unit semantic changes; NO `UIDocumentTypeSpecStyler`
  work; NO perf-composition runs (operator rule 2026-10-06).
- Phase-5 UI work is complete; the demo edge is a STATE change, not UI.

## Implementation Approach

Three phases, rendered channels first (visible, probe-gated), then the
measured side (math pinned by unit tests), then state + live QA. Each
phase ends with the full battery + proposed commit; pause for operator
confirmation (RPI protocol).

## Phase 6.1 — `getResolvablePathOfTypes` helper + the four rendered channels

### Overview

One shared pure helper computes the containing-spec path: drop trailing
typeKeys whose `nodeSpecToTypeSpec` link is empty/absent, until the last
key has a non-empty link (a single-element path stays → root, today's
behavior). All four rendered sites route their resolution through it.

### Changes Required

1. **Helper** — `document-nodes-meta/derivations.mjs` (pure, beside
   `getStyleLinkPropertiesId` :405):
   `getResolvablePathOfTypes(nodeSpecToTypeSpec, pathOfTypes)` → array.
   Semantics: while the LAST typeKey has no non-empty `link`, pop; stop
   at the first resolvable key; never resolve (no walk, no registry —
   pure path arithmetic; the caller then runs
   `getTypeSpecPropertiesIdMethod` on the result). The popped-keys case
   must keep `excludeFromFallback` interplay EXCLUDED — the helper never
   enters the walk; document that in the doc comment.
2. **V2 viewer node channel** — `viewer.typeroof.jsx:589`:
   `containingPathOfTypes = getResolvablePathOfTypes(nodeSpecToTypeSpec,
   this._pathOfTypes)` (replaces the naive `slice(0, -1)`; fixes the
   nested-chain root fall). `nodeSpecToTypeSpec` entry via the same
   `this.getEntry("nodeSpecToTypeSpec")` pattern the `_getTypeSpecPropertiesId`
   methods use.
3. **E1 editor node channel** — `type-spec.typeroof.jsx:826-837`:
   same replacement on `ownPathOfTypes`.
4. **V1 viewer run marks** — `viewer.typeroof.jsx:1180-1183`: resolve
   `pathOfTypes` through the helper BEFORE `_getTypeSpecPropertiesId`
   (the run's context path ends at the inline node; the helper drops
   entry-less trailing keys to the nearest resolvable ancestor).
5. **E2 editor marks** — `type-spec.typeroof.jsx:1682`
   (`_subscriptionGetDerrived`): the subscription's `pathOfTypes` passes
   through the helper before `typeSpecProperties` resolution — verify the
   OTHER derived uses in the subscription record (`typeSpecPath`,
   `parentSubscription` chains :1394-1406) take the same helper so a
   mark's parent lookup and the subscription's spec agree.
6. **Tests** — `document-nodes-meta/style-link-id-equivalence.test.mjs`/
   derivations tests: helper unit tests (clean chain unchanged; trailing
   entry-less keys popped incl. the cite-inside-generic-inline case;
   single-element path → root fallback preserved).

### Success Criteria

- [x] `npm run typecheck` + `npm run lint` + vitest green (incl. new
      helper tests) — 2026-10-13: 55 files / 547 tests
- [x] Extended probe `qa-inline-node-style-links.mjs`: NEW nested-mark
      basis step — with a root edge generic-inline → patch AND the italic
      patch at `{1, em}` (state-API in-probe, as today): the cite's `em`
      renders at the LI context (18pt → 24px computed), not 14pt; editor
      mode parity (E2) — same size in the editor DOM — PASS (62/62 marks
      in both renderers; the viewer renders the mark as `i`, the editor
      as `em` — the probe selects by `data-style-name`, tag-independent)
- [x] `qa-structure-marks.mjs`, `qa-editor-mark-styling.mjs`,
      `qa-inline-node-dom.mjs`, `qa-node-style-links-ui.mjs` unchanged-green
- [x] **LIVE CHECKPOINT (operator)**: the nested italic renders 18pt —
      confirmed 2026-10-13

## Phase 6.2 — Measured side: innermost-wins + node-edge fallback

### Overview

The controller resolves each leaf through mark payload → innermost
inline-edge payload → textblock style, fed by a meta-side resolver
function (Q4). Measured == rendered per the explicit-everything contract.

### Changes Required

1. **`CompositionSource` field** — `composition-controller.ts:267-273`
   (+ `document-nodes-meta/index.mjs:846-860` `_compositionSource`): a
   lazy resolver `(documentNodePath: Path) => string | null` returning
   the resolved `styleLinkProperties@` id of the innermost applicable
   inline-edge payload at that path (or null). Built by the meta element
   as a closure reusing the Q3 helper + `getEffectiveStyleLinks` +
   `getStyleLinkPropertiesId` — the SAME resolution the rendered V2
   channel performs (one implementation, no controller-side state
   knowledge). Name suggestion: `resolveInlineStyleLink`.
2. **`_buildInlineItems` threading** — `composition-controller.ts:598-610`:
   at each `inlineContainer` recursion, consult the resolver for
   `childPath`; thread the innermost applicable id DOWN the recursion
   (nested chains: innermost wins — a deeper level's own edge replaces
   the outer one; a level with no edge inherits the outer id).
3. **`_resolveLeafStyleLink` fallback layer** — `composition-controller.ts:624-682`:
   new optional arg (the threaded inline-edge id). Resolution order:
   mark-resolved id (unchanged, incl. the exclusivity guard) → if null:
   the threaded inline-edge id → else null (textblock fallback stays at
   `styleOf`, :936-937 — unchanged). NO change to `CompositionLeaf`'s
   single-id shape or the mark contract.
4. **Invalidation** — `:1150-1167`: the ingredients tuple already hashes
   the consumed id; with the fallback the consumed id can now be the
   inline-edge id — verify the invalidation covers edge edits (an edge
   edit re-derives the meta resolver → the composition source refresh →
   re-compose; add a probe-observable case to phase-6.3's QA).
5. **Tests** — text-composition suite: NEW measured-basis tests. A
   nested leaf (run inside an inline node with a size-setting edge)
   without marks measures at the edge payload's `generic/fontSize`
   (previously textblock fallback); a leaf with a slnt-only mark under
   the same edge measures at the MARK payload's anchor-context size
   (explicit-everything: the mark element writes it); a leaf with a
   size-setting mark keeps today's behavior. Assert via the suite's
   vehicles (compose → measured line geometry), not implementation
   details.

### Success Criteria

- [x] `npm run typecheck` + `npm run lint` + vitest green (incl. the new
      measured-basis tests; the doubling/clear-restore vehicles unchanged)
      — 2026-10-13: 55 files / 548 tests
- [x] Probe: the overflow regression gate — extended
      `qa-inline-node-style-links.mjs` (INSTEAD of qa-structure-marks, the
      in-phase adaptation: the nested-basis checks + the edge-add step live
      there): NEW "nested runs stay composed at the li-context basis" —
      125/125 generic-inline with runs carry composition-line spans at the
      18pt-context anchor (the overflow signal), on top of the nested-basis
      (18pt/24px, both renderers) and edge-add (30pt) steps
- [x] NEW measured-basis unit test (text-composition suite, own
      htmlOverride world — a nested-chain fixture): the edge payload is the
      fallback basis (nested unmarked run scales 30/18 with the root
      generic-inline → italic-patch edge; the direct run unaffected), and
      the MARK link wins over the edge fallback (explicit-everything:
      unchanged id + unchanged measured width); tombstone clears. NOTE the
      fixture discovery: `<span>`/`<i>`/`<b>` ingest as SCHEMA MARKS
      (tag-span/tag-em/tag-strong) — `<cite>`/`<bdi>` are the phrasing
      content that becomes generic-inline NODES
- [x] All other probes unchanged-green (qa-structure-marks,
      qa-editor-mark-styling, qa-inline-node-dom, qa-node-style-links-ui)
- [ ] **LIVE CHECKPOINT (operator)**: references list renders composed
      with styled cites; no overflow

## Phase 6.3 — Demo edge in the wikipedia state + final QA

### Overview

The visible goal on every load: the root typeSpec of the wikipedia
initial state carries a `generic-inline` demo edge. States are NOT
fixtures — the probes own their baselines.

### Changes Required

1. **State** — `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`:
   root typeSpec gains `inlineNodesStyleLinks` with a `generic-inline`
   edge (mode `link`, target: a sensible patch — operator's call in-phase
   between the existing "bold" patch or a dedicated neutral demo patch;
   start with "bold" for visibility). The root is the anchor the
   generic-inline nodes actually resolve at today (their walk falls to
   root) — consistent with the phase-4 probe's knob.
2. **Probe baseline adjustment** — `qa-inline-node-style-links.mjs`:
   the baseline step (currently asserts NO styling at boot) must first
   tombstone the shipped edge (its own state-API transaction) to
   establish the clean baseline, then proceed as today; `qa-structure-marks.mjs`
   baseline unaffected (asserts composition-line spans + parent-context
   font-sizes, not edge styling — verify once).
3. **QA sweep** — all probes (structure-marks, editor-mark-styling,
   inline-node-dom, inline-node-style-links, node-style-links-ui) green
   on the shipped state; full battery.

### Success Criteria

- [ ] Full battery green on the shipped state
- [ ] All five probes green
- [ ] **LIVE CHECKPOINT (operator)** — the cycle's visible goal: en
      Typography load shows styled cites at the li context (18pt basis),
      references list composed without overflow, nested italic `{1, em}`
      at 18pt (24px), editor/viewer parity

## Testing Strategy

- **Unit (vitest)**: helper path arithmetic (6.1); measured-basis
  behavior via the composition vehicles — inputs → observable geometry
  (6.2). No implementation-detail assertions.
- **Probes**: nested-mark basis step (6.1), measured==rendered geometry
  gate (6.2), shipped-state sweep + baseline tombstone (6.3).
- **Manual (operator)**: per-phase live checkpoints (6.1 italic 18pt;
  6.2 references list; 6.3 the full visible goal).
- **Canaries**: text-composition suite (any leafStyles wiring damage);
  `qa-structure-marks` (composition + parent context); DOM parity
  (`qa-inline-node-dom`).

## Verification Protocol (every phase)

1. `npm run typecheck` 2. `npm run lint` 3. `npm run format:write` (if
   drift) 4. vitest 5. probes 6. STOP — propose commit message with
   model/provider/agent metadata; wait for operator confirmation
   (MANNERS / COLLABORATION).

## References

- Research (this cycle): `thoughts/research/2026-10-13-2135-nested-leaf-mark-style-resolution.md`
- Handover: `docs/planning/inline-node-refinements/2026-10-13-phase6-composition-basis-HANDOVER.md`
- Upstream plan: `thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md`
- Decisions Q1–Q5 (session 2026-10-13): A / innermost-wins+fallback /
  helper / meta-resolver-fn / root-demo-edge
