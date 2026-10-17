---
title: 'Handover: Phase 4 — inlineNodesStyleLinks viewer channel (sub-RPI seed)'
eleventyNavigation:
  parent: Planning
  key: inline-node-refinements-phase4-handover
  title: 'Phase 4 Handover: viewer channel'
  order: 55
agent-created: true
---

# Handover — Phase 4 of the inline-node refinements plan: the viewer channel

> **Status:** Sub-RPI handover. Written 2026-10-13 for seeding a fresh
> `/research_codebase` → `/create_plan` sub-cycle on the remaining
> viewer-attach failure. Everything below is verified state as of
> HEAD `0d012dd4` (branch `feature/composition-and-justification`).

## The task in one paragraph

Approach (a) of the inline-node refinements: inline nodes (`cite`, `bdi`,
`generic-inline`, reproducing atoms) must style like **marks** — through a
third style-link family `inlineNodesStyleLinks` resolved via the
`styleLinkProperties@` merge channel and applied by
`UIDocumentStyleStyler` — instead of the per-node block styler
(`UIDocumentTypeSpecStyler`), whose block-layout writes
(`width`/`text-align`/block margins/root-fallback `font-size`) are wrong
for them. Phases 1, 2, 2b, 3 are COMMITTED and green; phase 4 is
implemented in the working tree and ~90% verified: **the only remaining
failure is a fresh viewer attach after a mode switch** (live edge edits
in the viewer all pass; editor passes).

## State as of this handover

### Committed (green; do not redo)

| Commit | Phase | Content |
|---|---|---|
| `abcf36f0` | 1 | `relativeFontSize` as `{value, unit}` pair (`baseEm` migration default); channel split — `em` is style-patch-only |
| `0524e3d6` | 2 | `em` resolves in the merge channel (`CONTAINING_FONT_SIZE` alias in `PatchedScopeProperties`) |
| `c2b42282` | 2b | No `baseFontSize` on style patches (leafs; absolute sizes via the pair's absolute units) |
| `0d012dd4` | 3 | One-element inline-node DOM (`contentDOM === dom` in the editor; blocks keep the two-element split) |

### Uncommitted working tree (reconstructed CLEAN, all green)

| File(s) | Change |
|---|---|
| `registered-properties-definitions.mjs` | `INLINE_NODES_STYLE_LINKS = 'inlineNodesStyleLinks/'` prefix (+ `CONTAINING_FONT_SIZE` from phase 2, committed) |
| `type-spec/models.mjs` | `InlineNodeStylePatchLinkModel` + `InlineNodesStyleLinksMapModel` + TypeSpecModel field `inlineNodesStyleLinks` (third family) |
| `layouts/type-stage/properties-generators.mjs` | `styleLinksGen` third entry (single inheritance chokepoint) |
| `layouts/type-stage/meta.typeroof.jsx` | third `StyleLinksMeta` instantiation (registers `styleLinkProperties@<typeSpec>/inlineNodesStyleLinks/<typeKey>`) |
| `layouts/type-stage/pps-maps.mjs` | prefix mapping for the new field (both maps) |
| `layouts/type-stage/defaults.mjs` | `_skipPrefix` += `inlineNodesStyleLinks/` |
| `layouts/type-stage/type-specnion.test.mjs` | third-family inheritance + independence tests |
| `layouts/type-stage/type-spec-properties.typeroof.jsx` | `inlineNodesStyleLinks` added to `sections.styleLinks` (keeps it OUT of the type-driven fallback — otherwise the boot crashes on "Can't find generic UI-Element"; the real "Node Style Links" UI is phase 5) |
| `layouts/type-stage/document-nodes-meta/derivations.mjs` | plan field `isInlineNode` — **truthy** (`!!nodeSpec.get("inline").value`): the BooleanModel field carries `"1"` strings from states — a strict `=== true` check misses them (PM semantics: `isBlock = !(spec.inline || …)`) |
| `layouts/type-stage/viewer.typeroof.jsx` | **reconstructed from HEAD + deliberate changes only**: `_isInlineNode` flag; channel branch in `_provisionWidgets`; `_provisionInlineStyleStyler` (edge resolution via the CONTAINING typeSpec = `pathOfTypes.slice(0, -1)`; declaration/empty `stylePatch` → no styler = clean inherit); `GenericUpdater` trigger on `containingTypeSpecProperties@` for id-identity changes; `_syncMetaInfo` channel dispatcher with **unconditional inline re-provision** (the wake-gap fix — see below) |
| `prosemirror/type-spec.typeroof.jsx` | editor outfitter inline branch: `_isInlineNode` (`pmNode.isInline`), `_inlineStyleLinkPropertiesIdFor`/`_checkInlineStyleLink`, `_createInlineStyleStylerWidgetDefinition` (style-styler on `structuralElements.inner`, `[]` when no edge), `_createWidgetDefinitions` branch (inline → style-styler only, no labels/params), `_checkInlineStyleLink` in the rebuild OR-chain; import `INLINE_NODES_STYLE_LINKS` |
| `scripts/puppeteer-probes/qa-inline-node-style-links.mjs` | the phase-4 gate probe (scenario: baseline a1 → live edge add → tombstone → re-link → editor mode → back to viewer → final tombstone) |

### Verified green

- `npm run typecheck` 0 errors; `npm run lint` clean; **vitest 55 files / 541 tests** (incl. 2 new third-family tests, 7 pair tests, the merge-channel `em` gate test).
- Probe `qa-inline-node-style-links.mjs`: **5 of 6 steps pass** — baseline a1 (no block-writes on inline), live edge add (all 153 inline elements style at the patch's 30pt), live tombstone (clears), live re-link (restores), editor mode with the stable edge (30pt), no PAGEERROR.

### The one remaining failure

**`back to viewer (stable edge)`**: after switching editor→viewer with a
stable `inlineNodesStyleLinks` edge, all 153 `[data-node-type="generic-inline"]`
elements render unstyled (`styleAttr: null`, `styled: 0`). The styling
machinery is fine everywhere else — this is a **fresh-attach provisioning
gap**: the fresh `UIDocumentElement` attachments' `_provisionInlineStyleStyler`
must resolve the edge (its SLM registration exists — `VWRES-CALL`
resolutions log non-null ids, 765× during one instrumented run), yet the
styler never applies.

## Mechanics discovered (the hard part — read before researching further)

1. **The channel itself works**: SLM registration (`StyleLinksMeta`, third
   instantiation) + merged payloads (`StyleLinkLiveProperties` →
   `createPatched` against the containing typeSpec) + `UIDocumentStyleStyler`
   write path are all proven by the passing steps.
2. **The wake gap + its fix**: viewer elements created at boot never
   re-provisioned on a live edge add. Root cause: `_syncMetaInfo`'s
   re-provision was gated on an existing wrapper (`oldWrapper !== null`).
   Fix applied (and REQUIRED — steps 2–4 fail without it): **unconditional
   inline re-provision** on `pathChanged || scopeSettled`. The meta tree's
   `_scopeSettled()` (document-nodes-meta/index.mjs:839) refreshes all
   attachments (`refresh(handlerFn, metaInfo, true)`) when the node's own
   node-properties scope settles — that refresh drives the re-provision.
3. **The rebuild-compare identity**: the styler wrapper's identity is the
   resolved `styleLinkProperties@` id; rebuild on id change; the
   containing-typeSpec `GenericUpdater` trigger mirrors the `composition@`
   pattern.
4. **Caveat discovered (console-log archaeology is dangerous)**: an
   intermediate debugging phase left a composition regression (14 failing
   tests) that bisected to a damaged `viewer.typeroof.jsx`; the current
   file is a CLEAN reconstruction from HEAD + the deliberate changes above
   and the battery is green. The composition suite (text-composition) is
   the canary — it must stay green.
5. **Residual open questions for the sub-cycle**:
   - Why does the *fresh attach* (mode switch) not provision the inline
     styler while live-edit scopeSettled re-provisions work? Is
     `_provisionWidgets` on fresh attachments not reached for inline
     elements (instrumented `VWPROV` call-count was 0 once), or does the
     fresh attach provision BEFORE the typeSpec tree settles (the widget
     order: TypeSpecMeta → DocumentNodesMeta → renderer — so it should be
     settled), or is the wrapper built but its initial update lacks
     `properties@` (gate in `UIDocumentStyleStyler.update` needs
     `properties@` or `verboseFontVariationSettings` in the changedMap)?
   - At fresh attach: is `hasRegistered(styleLinkProperties@…)` false at
     provision time while true later (SLM re-provision lag on mode switch)?
   - The `TRIGGERS made=776 fired=0` observation: protocol `setUpdated`
     does NOT independently wake wrappers — it piggybacks on state
     cascades; check whether the trigger wrapper is pruned from cascades
     (its only dependency is a protocol id).

## The plan (upstream)

- `thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md`
  — six phases; phases 1, 2, 2b, 3 done and committed; phase 4 here;
  phases 5 ("Node Style Links" UI wiring) and 6 (composition basis
  threading for nested leaves + QA + state re-tuning) remain.
- `docs/planning/inline-node-refinements/ROADMAP.md` — the design
  conversation + all operator decisions (pair form, channel split, keep
  `baseFontSize`, no rename, unconditional a1 skip, the
  `inlineNodesStyleLinks` pivot, one-element inline DOM).
- `thoughts/research/2026-10-12-1723-font-size-resolution-and-rebasing.md`
  — the research round (font-size synthesis, nodeProperties channel,
  em/baseEm/en resolution sites, inline/patch basis, migration inventory).

## Suggested sub-cycle seed

`/research_codebase` scoped to: **viewer attachment lifecycle around mode
switches** — where fresh `UIDocumentElement` attachments provision, when
`_syncMetaInfo`/`_scopeSettled` fire relative to `StyleLinksMeta`
registration, and whether the trigger wrapper is cascade-pruned (its
protocol-only dependency). The canary probe is
`scripts/puppeteer-probes/qa-inline-node-style-links.mjs` — make the
"back to viewer (stable edge)" step pass; keep everything else green
(typecheck/lint/541 vitest + the 5 passing probe steps).
