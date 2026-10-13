---
title: 'Handover: Phase 6 — composition basis threading for nested leaves (sub-RPI seed)'
eleventyNavigation:
  parent: Planning
  key: inline-node-refinements-phase6-handover
  title: 'Phase 6 Handover: composition basis'
  order: 56
agent-created: true
---

# Handover — Phase 6 of the inline-node refinements plan: composition basis threading

> **Status:** Sub-RPI handover. Written 2026-10-13 for seeding a fresh
> `/research_codebase` → `/create_plan` sub-cycle on the remaining
> phase-6 scope. Everything below is verified state as of HEAD `31107d2a`
> (branch `feature/composition-and-justification`), working tree clean.

## The task in one paragraph

Phase 6 of approach (a) (`thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md`,
phases 1–5 complete and committed): **nested leaves inside inline nodes
must measure against the same basis they render with** — the merged
`inlineNodesStyleLinks` payload the inline node itself styles through —
and the whole inline-node architecture gets its live QA (references list
overflow) plus optional state re-tuning. The original symptom
(ROADMAP problem 1): a textblock's measured line geometry diverges from
the rendered DOM for nested runs → composed lines too wide → overflow;
plus the "bite" of the same defect, font-size basis: nested marks compose
against the ROOT fallback (14pt) instead of the containing textblock's
effective context (18pt).

## State as of this handover

### Committed (green; do not redo)

| Commit | Phase | Content |
|---|---|---|
| `abcf36f0` | 1 | `relativeFontSize` pair `{value, unit}` (`baseEm` migration default) |
| `0524e3d6` | 2 | merge-channel `em` (`CONTAINING_FONT_SIZE` alias, origin outbound basis) |
| `c2b42282` | 2b | no `baseFontSize` on style patches (leafs) |
| `0d012dd4` | 3 | one-element inline-node DOM (editor; PM `contentDOM === dom`) |
| `6394787b` | 4 | `inlineNodesStyleLinks` family + routing to `UIDocumentStyleStyler` (both renderers) |
| `4532ae22` | 4-fix | inline styler/trigger wrappers gain `_widgets` membership — fresh attach after mode switch styles (sub-cycle: `docs/planning/agentic-artefacts/thoughts/{research,plan}/2026-10-13-*`) |
| `31107d2a` | 5 | "Node Style Links" UI (`UIInlineNodesStyleLinks*`, third container mount, probe `qa-node-style-links-ui.mjs`) |

Battery as of HEAD: `npm run typecheck` + `npm run lint` clean, vitest
**55 files / 541 tests** green. Probes green:
`qa-structure-marks` (152/153 composed), `qa-editor-mark-styling`,
`qa-inline-node-dom`, `qa-inline-node-style-links` (6/6),
`qa-node-style-links-ui` (real UI create flow).

### The live surface TODAY (operator-verified 2026-10-13)

- The `inlineNodesStyleLinks` channel works end-to-end in both renderers:
  a UI-created `generic-inline` → "bold" edge styles all 153 inline
  elements at the patch's size; live add/tombstone/re-link/mode-switch
  all styled; blocks byte-identical.
- **The known remaining defect (the phase-6 input):** nested MARKS
  inside an inline node resolve their style links at the ROOT fallback.
  Operator readout (li context 18pt, italic patch `{1, em}`): the `em`
  renders `font-size: 14pt` + `opsz: 14` — the ROOT base — not the li's
  18pt context. Payload applied fine (slnt: -10); the BASIS is wrong.

## Mechanics (verified — read before researching further)

1. **Why nested marks fall back to root:** a text RUN's mark styler
   resolves `typeSpecPropertiesPath` from the run's `context.pathOfTypes`
   (`viewer.typeroof.jsx:1179-1183`, `_createStylerWidgets`), which for a
   run inside `generic-inline` **ends at `generic-inline`**. The run's own
   typeSpec resolution then walks `getTypeSpecPropertiesIdMethod`
   (`prosemirror/integration.typeroof.jsx:190+`): an empty
   `nodeSpecToTypeSpec` link "resolves to nothing → **fallback to root**
   (root-of-self)" — the root typeSpec (base 14pt), not the li-inline
   typeSpec (18pt). The inline NODE's own channel does NOT fall back
   (`_provisionInlineStyleStyler` resolves the CONTAINING typeSpec via
   `pathOfTypes.slice(0, -1)`, `viewer.typeroof.jsx:581-585`) — only the
   nested MARKS/leaves do.
2. **The upstream plan's phase-6 scope** (Changes Required §1-2): extend
   `_resolveLeafStyleLink` (`composition-controller.ts:636-678`, mark
   descriptors only — `getWrapMarks` is mark-list-only,
   `derivations.mjs:412+536`) so a leaf inside an inline node resolves the
   innermost applicable `inlineNodesStyleLinks` edge (walk ancestors) —
   measurement basis = that edge's merged payload (`createPatched` vs the
   containing typeSpec, same as rendered). Decision point (in-phase):
   **compose (inline edge ∘ mark edge) vs innermost-wins** (today's mark
   contract: at-most-one per leaf). The `:913-933` measurement reads
   `leafFontSize` from the resolved payload.
   **CAVEAT from the operator readout:** the RENDERED side needs the same
   treatment — the viewer's mark styler resolves at the run's path, which
   falls back to root; the editor's `_inlineStyleLinkPropertiesIdFor` (the
   three-way lookup incl. node type keys) too. The plan's phase 6 §1-2
   covers the measured side; the rendered side is the new scope the
   readout discovered — both must land together or measured ≠ rendered.
3. **The merge-channel basis machinery is shared and proven:**
   `PatchedScopeProperties` publishes the origin outbound effective size
   (`CONTAINING_FONT_SIZE`, `scope-resolution.mjs:370-483`), so an edge
   payload merged against the CORRECT containing typeSpec (the li's
   context) composes `em` correctly (18pt × 1). The fix is a resolution-
   path fix (which typeSpec a nested leaf/mark merges against), not new
   basis machinery.
4. **Wake mechanics (from the phase-4 sub-cycle research, verified):**
   viewer attachments wake via cascades only as `this._widgets` members;
   `_scopeSettled` fires only on scope REBUILD (`document-nodes-meta/index.mjs:656-662`); manual wake paths hand-roll create+update
   (`viewer.typeroof.jsx:411-419`, `:679-681`) — a follow-up refactor is
   noted in the ROADMAP (out of scope).
5. **Composition threading (approach (b), `6dbbf38e`) is DONE:** nested
   runs observe the real textblock's `composition@` payload
   (`textblockRootPath` context); 152/153 nested inline nodes compose.
   Phase 6's basis threading rides on this — the payload paths exist.

## Suggested sub-cycle seed

`/research_codebase` scoped to: **nested-leaf/mark style resolution —
measured vs rendered** — (i) map every resolution site that walks
`getTypeSpecPropertiesIdMethod` for a node/mark/leaf INSIDE an inline
node (viewer `_createStylerWidgets`, editor outfitter
`_checkInlineStyleLink`/`_inlineStyleLinkPropertiesIdFor`,
`_resolveLeafStyleLink` in `composition-controller.ts`) and what basis
each resolves against today (root fallback vs containing textblock vs
inline-node edge payload); (ii) the ancestor-walk design for the
inlineNodesStyleLinks edge resolution (which "containing typeSpec" — the
li-inline's context per the node channel precedent? the run's OWN
textblock context? both?), incl. the typeSpec-channel resolution of the
li-inline itself (its 18pt comes from `nodeProperties@` scope inheritance
today, NOT a `nodeSpecToTypeSpec` entry — `isInlineNode` nodes have none);
(iii) the compose-vs-innermost decision's blast radius (mark contract
"at-most-one per leaf", `:636-678`; measurement `:913-933`);
(iv) re-tuning inventory (states/fixtures, the en wikipedia cite demo
edge — plan §6.4, operator's call).

**The canary probes:** `qa-structure-marks.mjs` (nested composition +
parent-context observation), `qa-inline-node-style-links.mjs` (channel,
6/6), `qa-node-style-links-ui.mjs` (UI). The text-composition suite is
the vitest canary. **NEVER `npm run perf:composition`** (operator rule
2026-10-06).

## Open questions (seeded, unresolved)

1. Which basis should a nested MARK's `em` compose against — the
   containing textblock's effective (li 18pt), or the inline NODE's own
   edge-resolved effective (its merged `inlineNodesStyleLinks` payload,
   i.e. 18pt × inline-edge factor)? The node channel precedent suggests
   the latter (marks style "through" their inline node), but that couples
   mark resolution to the node edge — a design decision, not a bug fix.
2. Rendered-side resolution: does the run-level mark styler need the
   ancestor-walk too, or is there a context field (`textblockRootPath`)
   to reuse? (The run's `context.pathOfTypes` ends at generic-inline —
   the walk must skip inline-node levels, not just drop the last type.)
3. Editor side: same questions for the outfitter's inline branch.
4. State re-tuning scope: plan §6.4 (optional demo edge in the en
   wikipedia initial state) — the UI now makes live tuning possible;
   fixture churn should stay minimal per testing strategy.

## Related

- Plan: `thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md`
  (phase 6 = the open section; phases 1-5 criteria checked)
- ROADMAP: `docs/planning/inline-node-refinements/ROADMAP.md` (+ the
  Follow-ups section: manual-wake refactor)
- Sub-cycle docs (archived): `docs/planning/agentic-artefacts/thoughts/
  research/2026-10-13-1503-viewer-fresh-attach-inline-styler.md`,
  `…/plan/2026-10-13-1616-inline-styler-fresh-attach-membership.md`
- Research round: `thoughts/research/2026-10-12-1723-font-size-resolution-and-rebasing.md`
- Precedent probes: `qa-structure-marks.mjs`, `qa-editor-mark-styling.mjs`
