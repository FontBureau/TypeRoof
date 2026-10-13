---
date: 2026-10-13T21:35:55+02:00
git_commit: af5734b4
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Nested leaf/mark style resolution — measured vs rendered basis for phase 6"
tags: [research, codebase, composition, style-links, inline-nodes, phase6-subcycle]
status: complete
upstream:
  handover: docs/planning/inline-node-refinements/2026-10-13-phase6-composition-basis-HANDOVER.md
  plan: thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md
---

# Research: Nested leaf/mark style resolution — measured vs rendered basis (phase 6)

## Research Question

Handover scope: nested leaves/marks inside inline nodes must measure
against the same basis they render with. (i) Where does every style-link
resolution site anchor for content nested inside inline nodes, and what
basis results today (root fallback vs containing typeSpec vs textblock
typeSpec)? (ii) What design space exists for a containing-typeSpec
ancestor walk? (iii) What is the compose-vs-innermost decision's blast
radius? (iv) Re-tuning inventory (states).

## Summary

**Three anchoring variants exist in the codebase today, and they
disagree for nested runs.** The inline NODE channels (viewer V2,
editor E1) slice off the node's own type key and anchor at the
CONTAINING typeSpec (correct). The run-level MARK channels (viewer V1,
editor E2) hand the path in UNSLICED — it ends at the inline node
(`generic-inline`), whose empty `nodeSpecToTypeSpec` link collapses
`getTypeSpecPropertiesIdMethod`'s walk to the **ROOT** (base 14pt —
the operator's `1em → 14pt` symptom). The composition channel (V3)
anchors marks at the **TEXTBLOCK's** own typeSpec. For the operator's
live case all three *correct* candidates coincide — `li-inline` →
`/paragraphs/t1` and the li-inline **is** the textblock, so the
containing spec, the textblock spec, and the node channel's spec are
all `t1` (18pt) — only V1/E2 (root, 14pt) are wrong. The measured side
(`_resolveLeafStyleLink`) is mark-list-only by construction
(`getWrapMarks` reads only `node.marks`); inline-node edges never reach
it, and nested leaves fall back to the textblock style. The single-id
shape of `CompositionLeaf`/`leafStyles` physically embodies the
"at-most-one link per leaf" contract on the measured side — while the
viewer already RENDERS nested marks composed (one styler per wrapper
element). No state ships an `inlineNodesStyleLinks` edge today.

## Detailed Findings

### 1. The shared resolver and the root fallback

- `getTypeSpecPropertiesIdMethod` (`prosemirror/integration.typeroof.jsx:190`,
  exported; aliased as `_getTypeSpecPropertiesId` at
  `viewer.typeroof.jsx:1058`, `type-spec.typeroof.jsx:958/:1671+`,
  `document-nodes-meta/index.mjs:807`): takes `pathOfTypes` (type keys,
  last = the node in question), reads
  `nodeSpecToTypeSpec.get(typeKey).get("link")` (:216-218). Missing OR
  empty entry ⇒ `typeSpecLink = ""`. Link discriminator (:224-230):
  absolute links are origin-anchored; bare/`./`/`..` links are
  parent-anchored (recursive on `slice(0, -1)`, :236-253). An **empty
  link has no parts ⇒ neither** — `resolvedPath` stays null and the
  walk falls to `_getBestTypeSpecPropertiesId` (:117): `initialParts =
  []` ⇒ `testPath = originTypeSpecPath` — the walk **starts at the
  typeSpec root** and only climbs up (:156). This is the root-of-self
  fallback (:189-191).
- **State of the entries** (verified in
  `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`):
  `li-inline → {"link": "/paragraphs/t1"}` (the same spec as
  `paragraph`; its 18pt = root base 14 × t1's 1.285714286 — the phase-2
  unit-test chain); **`generic-inline`, `cite`, `bdi` have NO entries**
  → empty link → root. Ancestor levels with entries: heading-1/2/3
  (`/headings/h1/2/3`), paragraph/paragraph-2 (`/paragraphs/t1`/`t2`),
  figcaption (t2), li-block (t1), generic-block (`/generic`), section,
  sub-section.
- `getStyleLinkPropertiesId` (`document-nodes-meta/derivations.mjs:405-424`):
  pure id-constructor + registry check —
  `styleLinkProperties@<typeSpecPropertiesPath>/<styleLinkType>/<styleLinkName>`;
  the anchoring decision is made entirely by whoever produced
  `typeSpecPropertiesPath`.
- `getEffectiveStyleLinks` (`prosemirror/type-spec.typeroof.jsx:2062-2080`):
  resolves inherited+local edges for a registered `typeSpecProperties@`
  id; needs NO ancestor walk itself (inheritance is folded into the
  typeSpecnion) — but choosing an edge's ANCHOR requires knowing the
  containing typeSpec path.

### 2. The five resolution sites (rendered + measured)

| Site | Walks the method? | Path handed in | `[typography, li-inline, generic-inline]` lands at |
|---|---|---|---|
| V1 viewer run marks (`viewer.typeroof.jsx:1180-1183`) | yes | run's `context.pathOfTypes`, UNSLICED (ends at generic-inline) | **ROOT** |
| E2 editor marks (`type-spec.typeroof.jsx:1682` via the inline node's own subscription; `_getParentSubscription` :1394-1406 — inline nodes DO subscribe, `integration.typeroof.jsx:424`) | yes (by the inline node's subscription) | same chain, ends at generic-inline | **ROOT** |
| V2 viewer inline channel (`_provisionInlineStyleStyler`, `viewer.typeroof.jsx:589`: `slice(0, -1)` BEFORE resolving) | yes | `[typography, li-inline]` | **containing spec (t1)** — correct |
| E1 editor inline channel (`_inlineStyleLinkPropertiesIdFor`, `type-spec.typeroof.jsx:826-837`: `getPathOfTypes(...).slice(0, -1)`) | yes | `[typography, li-inline]` | **containing spec (t1)** — correct |
| V3 composition leaves (`composition-controller.ts:649` against `StyleResolutionContext.typeSpecPropertiesPath`, built once per TEXTBLOCK at `document-nodes-meta/index.mjs:901-913` from the textblock's own `plan.pathOfTypes`) | no (pre-resolved) | the textblock's own path | **textblock spec** |

- **Why V1/E2 fall to root:** the run's `context.pathOfTypes` is the
  inline node's `plan.pathOfTypes` copied by reference into
  `childrenContext` (`derivations.mjs:288/:291-301`; run metaInfo at
  `index.mjs:1221-1236`) — complete from the document root, but
  **ending at the inline node** (the run's immediate parent). The
  "parent element decides mark styling" rule
  (`derivations.mjs:296-298`) treats `generic-inline` as the styling
  context; its empty link then collapses the resolution to root. The
  inline channels slice BEFORE resolving; the mark channels never slice.
- **The three-way disagreement** (V1/E2 root vs V2/E1 containing vs V3
  textblock) exists only for runs nested inside inline nodes; for
  DIRECT runs in a textblock, parent = textblock and all agree.
- In the operator's live case the li-inline IS the textblock and its
  spec IS `/paragraphs/t1` — the containing-spec and textblock-spec
  anchorings COINCIDE (t1); only the root anchoring is wrong.

### 3. The measured side (composition controller)

- `_resolveLeafStyleLink` (`composition-controller.ts:624-682`): the
  leaf's identity is its node's `marks` (via `getWrapMarks`) + its
  document path (error message only). Descriptors ordered INSIDE-OUT
  (`derivations.mjs:446`); each mapped via `getStyleLinkPropertiesId`
  against the textblock's `typeSpecPropertiesPath`; **contract guard**
  (:670-680): `>1` ids ⇒ console.error, `ids[0]` (innermost) wins.
  Returns a single id or null. Sole call site: `_buildInlineItems`
  (:590-596).
- `_buildInlineItems` (:562-620): recurses `inlineContainer` items
  (:598-610) with the SAME `leaves` array and the SAME
  `styleResolution`/`markSpec` — the recursion READS each inline
  node's `typeKey` (:577) and **discards it** (`InlineItem` is
  `{kind, items}` only, `segmenter.ts:70-75`). Nested leaves land
  depth-first with paths `<textblock>/content/<i>/content/<j>`.
- Measured basis (:889-937): `leafStyles` from the registered
  `styleLinkProperties@` payload (`payload.typeSpecnion.getProperties()`,
  the same read as `UIDocumentStyleStyler`), `leafFontSize =
  properties.get("generic/fontSize")` (:914-915);
  `styleOf(i) = leafStyles[i] ?? textblockStyle` (:936-937). So nested
  leaves measure against (a) their own mark payload (root-anchored —
  the defect) or (b) the TEXTBLOCK's style — the inline node's edge
  contributes NOTHING to measurement today, while the viewer DOES
  render the node's element from it. Measured ≠ rendered.
- Consumption: shaping `style.fontSizePt` (:1248-1262, :1300, :1349,
  :1540), planners (:1168, :1594, :1601), invalidation ingredients
  (:1150-1167). The `em` basis inside a payload resolves via
  `CONTAINING_FONT_SIZE` against the ORIGIN typeSpec's outbound
  effective size (phase 2) — so anchoring the payload at t1 fixes the
  em basis to 18pt with NO new machinery.
- **What the controller would need** for inline-edge resolution: (i) a
  typeSpec path per ancestor level — either reconstructed from the
  mmNode type keys (read at :577, currently discarded) or handed down
  from the meta layer; (ii) a place to put the result —
  `CompositionLeaf` has ONE id slot (:251-255), `leafStyles` is
  one-per-sourceIndex (:905), `styleOf` returns one `LeafStyle`
  (:936-937): the "at-most-one" contract is physically embodied here.
- `getWrapMarks` (`derivations.mjs:425-560`): reads ONLY
  `node.get("marks")` (:434) — inline-node ancestry is structurally
  invisible to it. Empty stylePatch = declaration (no identity);
  "chain runs keep exactly ONE resolved style link (the contract)"
  (:536-546). Consumers: the controller (:649), the viewer's run
  channel (VIEWER:1110-1119 → wrapper DOM :1126-1146, stylers
  :1148-1170), `wrapResultsAreEqual` (:549+).

### 4. The compose-vs-innermost decision space

- **The viewer already RENDERS composed**: `_createStylerWidgets` loops
  ALL wrapper descriptors and attaches one styler per nested wrapper
  element (VIEWER:1148-1170) — nested marks stack visually. Only the
  MEASURED side collapses to one (the contract + the single-id shape).
- With an inline edge AND a mark edge both applicable to a nested
  leaf: **innermost-wins** would pick one payload (which one — the
  mark, as the "innermost" of the leaf, or the inline edge as the
  closest scope?); **compose** would need a two-payload merge the
  properties system does not offer per-leaf (`createPatched` merges a
  patch against an ORIGIN typeSpec, not patch-onto-patch within the
  controller's leafStyles array) — the `em` basis of the inner patch
  would resolve against the containing context, not the outer patch.
- Invalidation ingredients hash only the consumed tuple (:1150-1167):
  a discarded second link would not invalidate.
- Blast radius of changing the contract: `CompositionLeaf` shape,
  `leafStyles`, `styleOf`, the guard, plus the applicators (find
  segments by leaf path — unaffected by id-count changes). The mark
  contract itself ("at-most-one per leaf" for MARK chains) is not
  violated by adding the inline edge as a SEPARATE resolution step
  (node edges are keyed by node type keys, marks by mark names — they
  cannot collide).

### 5. Re-tuning inventory

- **No state ships an `inlineNodesStyleLinks` edge today** (verified:
  `grep inlineNodesStyleLinks` over `lib/assets/*.json`,
  `lib/js/wikipedia/*.json`, `lib/js/tests/fixtures/*.json` — zero
  hits). Defaults empty ⇒ no migration.
- The en wikipedia state (`lib/js/wikipedia/type-stage-wikipedia-initial-state.json`)
  ships the nested chains (li-inline textblocks: backlink +
  reference-text > cite > em/a marks — the operator readout's DOM) and
  the nodeSpecToTypeSpec map incl. `li-inline → /paragraphs/t1`.
  Optional demo edge (plan §6.4): the typeSpec tree there (root
  baseFontSize 14; children headings/paragraphs/…) can carry e.g. a
  `generic-inline` → patch edge; the "bold" patch in
  `stylePatchesSource` is the established probe knob.
- Visible defect inventory (before/after): nested `em`/`a` marks
  inside inline nodes currently render at the ROOT base (14pt + opsz 14
  per the readout) instead of the li context (18pt) — every styled
  nested mark in the references list changes size once V1/E2 anchor at
  the containing spec. Direct-run marks (not nested) are unaffected.

### 6. Ancestor-walk design space (mapped, not decided)

- (a) **Slice-last-retry on empty link**: when the walk hits an empty
  link at the deepest typeKey, drop trailing typeKeys until a level
  with an entry resolves ([.., li-inline] → t1). Coincides with the
  inline channels' containing-spec for the one-deep case; generalizes
  to nested inline chains (cite inside generic-inline inside li).
- (b) **textblockRootPath-derived**: the run's context carries
  `textblockRootPath` (approach (b) threading; set at the textblock
  boundary, `index.mjs:1156-1163`, passed through unchanged at inline
  levels) — but it is a DOCUMENT-NODE path, not a typeSpec path; the
  textblock's typeSpec path is available to the meta layer (V3 already
  builds it) and could be threaded into the run's context the same way.
- (c) **Reuse the node channel's anchor**: the mark channels resolve
  against the same containing typeSpec as the enclosing inline node's
  own channel (V2/E1) — "marks style through their inline node".
- Editor side (E2): no `textblockRootPath` equivalent — the
  subscription chain (`_getParentSubscription`) walks the DOM; inline
  nodes' own subscriptions hold the full `pathOfTypes`
  (`type-spec.typeroof.jsx:1682-1710`), so a slice/walk is possible
  there without new plumbing.

## Code References

(see the site tables above; key files:
`viewer.typeroof.jsx:588-681, 1097-1215`, `prosemirror/type-spec.typeroof.jsx:795-886, 1394-1406, 1423-1352, 1671-1697`,
`prosemirror/integration.typeroof.jsx:117-235, 424, 518-552`,
`text-composition/composition-controller.ts:251-264, 562-620, 624-695, 766-772, 804-820, 889-937, 1150-1167, 1248-1262`,
`document-nodes-meta/derivations.mjs:288-301, 405-424, 425-560`,
`document-nodes-meta/index.mjs:807, 901-913, 1156-1163, 1221-1236`,
`registered-properties-definitions.mjs:44-84`,
`lib/js/wikipedia/type-stage-wikipedia-initial-state.json`)

## Open Questions

1. Which anchor for the run-level mark channels — containing-spec
   walk (a/c) vs textblock-spec (b)? In the common case they coincide
   (li-inline IS the textblock); they diverge when a nested inline
   chain's containing typeSpec differs from the textblock's (e.g.
   inline content directly under a textblock whose spec differs from
   an intermediate inline node's spec — possible with entries like
   figcaption). Operator decision for the plan.
2. Compose vs innermost-wins for the measured side when BOTH an inline
   edge and a mark edge apply (§4). Innermost-wins with the MARK as
   innermost preserves today's mark contract and needs no merge
   machinery; compose needs patch-onto-patch semantics that do not
   exist in the leaf pipeline.
3. Should the MEASURED side resolve inline-node edges at all when the
   leaf has its own mark link (today: mark payload or textblock
   fallback)? The viewer renders BOTH (node element styled by the
   edge + wrapper elements by marks) — a measured basis that ignores
   the inline edge diverges from the rendered DOM whenever the edge's
   patch changes font-size. Same decision point as 2.
4. Editor-side (E2) mechanism: slice-last-retry inside
  `getTypeSpecPropertiesIdMethod` (shared, fixes V1+E2 in one place)
   vs per-site slices (viewer V1 + editor E2 separately) — the shared
   walk change affects ALL getTypeSpecPropertiesIdMethod consumers
   (scope it: only the empty-link-at-deepest-level case).
