---
title: 'Inline Node Refinements — ROADMAP (composition threading & font-size basis)'
eleventyNavigation:
  parent: Planning
  key: inline-node-refinements-roadmap
  title: 'Inline Node Refinements: ROADMAP'
  order: 50
agent-created: true
---

# Inline Node Refinements — ROADMAP: composition threading & font-size basis

> **Status:** Open — design conversation concluded 2026-10-12, captured here
> as the base for a formal RPI cycle. Approach (b) is IMPLEMENTED
> (`6dbbf38e`); approach (a) is the cycle's remaining scope — research round COMPLETE 2026-10-12 (see RPI kick-off step 2). File
> references are as of `499be3bd` (pre-implementation) unless noted.
> Preceded by the structure-marks cycle
> (`docs/planning/agentic-artefacts/thoughts/{research,plan}/2026-10-11-*`,
> implemented in `77d81198`–`788853d8`) and the sup-marks round
> (`84861807` + editor fixes `499be3bd`).

- Written: 2026-10-12, session with the operator (z-ai/glm-5.3).
- Verification tooling: `scripts/puppeteer-probes/qa-structure-marks.mjs`
  (viewer) and `qa-editor-mark-styling.mjs` (editor), both pass on the
  live en/Typography load.

## The original problem

Observation from the live Wikipedia article rendering (references list,
`li-inline` textblocks containing `generic-inline` / `reproduce-as-inline`
chains — e.g. `li > span[mw-cite-backlink] > … > cite > a > span`):

1. **Nested runs don't take part in composition** — the cite's content
   renders as raw, uncomposed text next to the composed line spans of
   the direct runs; the textblock's measured line geometry diverges
   from the rendered DOM → composed lines are too wide, content
   overflows the column ("does not fit into the column").
2. **Inline node elements carry block-scope properties** — every
   `[data-node-type]` inline element gets full block `nodeProperties`
   writes: `width: 455pt`, `text-align`, block margins. Currently
   layout-inert (`display: inline` survives; the `display: table` hack
   in `lib/css/shell/type-stage.css:219-243` is commented out), but
   wrong.
3. **The visible bite of the same defect: font-size** — inline nodes
   (`cite`, `bdi`, `reproduce-as-inline`) have no `nodeSpecToTypeSpec`
   entries, so their scopes resolve via the *root fallback*: an
   18pt `li` (effective font-size via its typeSpec chain) contains
   `cite` content explicitly written at **14pt** (root `baseFontSize`)
   — the inline node's explicit write cascades *over* the textblock's
   typographic context. This is the same per-parent-context problem
   that motivated the structure-marks cycle, now for inline *nodes*.

## Root causes (verified, with references)

### (b) Composition: the applicator assumes direct runs

- `viewer.typeroof.jsx:1142` (attach mapping) and `:649` (constructor)
  build the run's composition subscription as
  `composition@${metaInfo.rootPath.parent.parent}` with the explicit
  assumption *"The run's path is `<textblock>/content/<index>`"*.
- That only holds for DIRECT runs. A run inside an inline node
  (`<textblock>/content/0/content/1`) resolves `parent.parent` to the
  **inline node** — which never publishes a composition: only
  `_isTextblock` elements compose (`document-nodes-meta/index.mjs:830`:
  `innerHtml === null && !inInlineContext && !!childrenInInlineContext`;
  inline nodes are themselves *in* inline context).
- The **controller measures the nested text correctly** —
  `_buildInlineItems` (`composition-controller.ts:568-619`) recurses
  `inlineContainer` items; the nested leaves are in the payload with
  their paths. Only the applicator never receives it: nested runs
  observe a dead id and render OFF-MODE forever.
- Consequence per textblock: composed line spans for the direct runs +
  raw flowing text for everything nested → the payload's line boxes and
  the rendered flow disagree → overflow. A textblock without direct
  text runs (e.g. `li > backlink-atom + reference-text-node`) composes
  visually not at all.

### (a) Font-size basis: inheritance is shadowing, not product

- `baseFontSize` and `relativeFontSize` are single **inherited** scalar
  properties (`registered-properties.mjs:314-331`, `inherit: true`,
  defaults 12pt / 1). Inheritance is *value shadowing*: a child scope
  that sets its own `relativeFontSize` **replaces** the parent's
  factor — it does not multiply onto the parent's effective size.
- The effective font-size is synthesized per scope as
  `baseFontSize × relativeFontSize`
  (`type-spec/fundamentals.mjs:91`), and consumers read the resolved
  `GENERIC fontSize` (e.g. per-run measurement:
  `composition-controller.ts:917`, `properties.get(GENERIC fontSize)`).
- Consequences (all observed live):
  - `baseFontSize: 14` set at the root *rides* the whole tree; every
    level's `relativeFontSize` replaces rather than composes.
  - A patch's `relativeFontSize` (e.g. `bold: 2`) computes from the
    **root base** (28pt), not from the containing textblock's
    effective size (18pt × 2 = 36pt) — "marks are in a good spot [the
    scope resolves at the textblock] … however, to be truly useful,
    their `baseFontSize === 1` should probably be the full font-size
    of their parent typeSpec, which isn't the case" (operator).
  - Inline nodes resolve the **root fallback** (no nodeSpecToTypeSpec
    entry), so their explicit `fontSize` write lands at the root's
    14pt regardless of the containing textblock's 18pt context — see
    observation 3.

### Design refinements (operator, this session)

1. Nodes with **inline content** (textblocks) should inherit another
   base font-size than blocks with block children.
2. **Preferred:** like the vertical margins, use a **unit-selector for
   base font size** instead of new machinery.
3. The **basis threading** goes through the **nodeProperties channel**:
   nodeProperties inherit from their parent node; the `emAfter` margin
   machinery proves cross-scope resolution is already wired (below).

## Approach (b) — composition threading (IMPLEMENTED: `6dbbf38e`)

Thread the enclosing **textblock path** through the renderer walk
instead of deriving it by path arithmetic:

- The dispatcher (`document-nodes-meta/index.mjs`) knows when it
  descends from a `_isTextblock` element; its `childrenContext` (the
  `{...context}` spread — see `derivations.mjs:277-289`,
  `resolveElementRenderingPlan`) gains a `textblockRootPath` field,
  set at the textblock boundary and **passed through unchanged** for
  deeper inline levels.
- The two viewer sites (`viewer.typeroof.jsx:1142`, `:649`) use
  `metaInfo.context.textblockRootPath ?? parent.parent` (fallback =
  today's behavior) to build the `composition@` id.
- Nested runs then observe the real textblock's composition payload,
  find their leaves by path (the payload already contains them), and
  render per-line spans like direct runs.

Effect: nested inline content composes; the textblock's rendered lines
match the measured geometry; the references list stops overflowing.
No controller change (it measures correctly today); no CSS change.

**Status: implemented 2026-10-12 in `6dbbf38e`** — textblock element
provisioning threads `textblockRootPath` into the children context
(`document-nodes-meta/index.mjs`), both viewer sites use it with the
`parent.parent` fallback (`viewer.typeroof.jsx`), and
`qa-structure-marks` gained the nested-composition regression
(live: 152 of 153 nested inline nodes in the references list carry
composition-line spans; the delta is an atom-only node). The (a)
layers below remain open for the RPI cycle.

## Approach (a) — inline node properties, in three layers

### Layer a1 — targeted: skip block-layout writes for inline specs

The nodeProperties generator skips the block-layout writes (`width`,
`text-align`, block margins) when the node spec is inline
(`nodeSpec.get("inline")` / `inlineContent` context). Font-size stays
(an inline node may deliberately set one) — this only removes the
inert-but-wrong block baggage.

Operator comment: This, to me, suggests to branch within `update` in
`UIDocumentTypeSpecStyler`. If feasible: this could be a chance to restructure
that implementation for readability.

**Decided 2026-10-12 (operator): the skip is UNCONDITIONAL for pure
inline nodes** — TypeRoof has no "inline-block" concept; an atom's
width comes from the measurement/composition channel, not a CSS `width`
write (inert on `display: inline` anyway). A future intrinsically-sized
atom would be a new spec flag (a new concept), not a reason to keep
dead writes. Font-size stays as scoped above.

### Layer a2 — design: unit-selector font sizes + node-scope basis

**Precedent (existing, verified):** the leading dimension's values
already carry their basis as a **unit** —
`type-spec/models.mjs:157`: `'lineHeight', 'em', 'baseEm',
'lineHeightAfter', 'emAfter'` — where `em` resolves against the scope's
*effective* font-size (`baseFontSize × relativeFontSize`,
`fundamentals.mjs:91`) and `baseEm` against the root base. The proposal
widens this existing vocabulary to the font-size dimension itself
instead of inventing new machinery.

**`relativeFontSize` as a unit-carrying value:**

| unit | semantics | migration/impact |
|---|---|---|
| `baseEm` | × root `baseFontSize` — **today's behavior** | migration default for plain numbers: every tuned state keeps its exact meaning (non-breaking) |
| `em` | × the **containing context's effective font-size** | **style patches ONLY** — channel split, operator 2026-10-12: NOT a typeSpec unit (see the note under the table) |
| `pt` | absolute effective size | captions/anchors pinned regardless of context |

~~Convention over machinery: **the node-kind distinction becomes a
state-level convention** — textblock typeSpecs (nodes with inline
content) write their fonts in `em` (their inline content inherits the
parent's effective size as basis); block containers write theirs in
`baseEm`/`pt` (the subtree scales from the base as today).~~ No
"inline vs block children" special-casing in the resolution engine;
the units express the intent per value, exactly as the margins do.

**Channel split — Decided 2026-10-12 (operator):** `em` is NOT a
typeSpec unit — the typeSpec vocabulary is `baseEm` (anchored basis)
+ absolute only; `em` exists ONLY in the style-patch variant
(`RelativeFontSizePatchUnitModel`), where it resolves against the
containing context in the MERGE channel (phase 2). In the typeSpec
channel `baseEm` was already the only basis — so `em` there would
have been an alias, not a capability. The mid-tree "compose onto the
parent's effective size" that the struck-through sentence wanted for
textblock scopes is covered by the KEPT mid-tree `baseFontSize`
re-anchoring (sub-document descriptions) instead.

Operator question: do we need to rename "relativeFontSize" to a better fitting name?

**Decided 2026-10-12 (operator):** pair form `{value, unit}` per the
`InlineLengthValueModel` precedent (`ManualHorizontalLayoutModel` /
`inlineMargins`, `type-spec/horizontal-layout-models.mjs`) — re-use
or copy that model; plain numbers/strings parse as `baseEm`
(non-breaking migration default). Sub-question from the same exchange —
**Decided (operator): KEEP `baseFontSize`** as a first-class feature:
mid-tree values + `baseEm` `relativeFontSize` enable entire
sub-document descriptions (re-anchoring a subtree) within the same
typeSpec. No dissolution, no root-only restriction.

**Rename — Decided 2026-10-12 (operator): KEEP the key
`relativeFontSize`** (pair form under the same key; zero migration
cost, all states + downloads keep parsing via the `baseEm` default).
`fontSizeSpec` rejected as annoying; `fontSize` would be the best
name but is taken by the processed/synthetic property (research §1:
purely synthetic, no model field). UI label polish may follow post-cycle.

**Pivot — Decided 2026-10-12 (operator, design conversation):** treat
inline nodes like MARKS via a third style-link family
`inlineNodesStyleLinks` (next to intent/markStyleLinks): a third
StyleLinksMeta provisioning + map/prefix, and inline nodes route to
`UIDocumentStyleStyler` (the mark styler) in both renderers — its
write surface (font-family, font-size, features/variations, colors,
direction, lang) IS the a1 property surface, so the "branch within
update" shrinks to routing. α (typeSpec-channel parent-basis
synthetics) is REJECTED: `generic/fontSize` per-scope effective is
already the true em value; a parallel parent synthetic would fork the
basis (paradigm shift in the wrong direction). β (merge-channel basis)
is right for style patches — and thus for inline nodes:
`createPatched` resolves against the origin typeSpec's outbound
effective size (`scope-resolution.mjs` :462-483). Inline-node
handling moves LAST in the phase plan (marks/patches verified first).
One-element inline-node DOM assessed FEASIBLE: PM natively supports
`contentDOM === dom` (doc desc + all marks are that case;
prosemirror-view dist :1519/:1234), the viewer already runs
single-element, outfitter widgets already gate on `outer !== inner`
(parameters display / labels stay inactive for inline — operator:
inline nodes need neither), two CSS selectors to consolidate.

**Basis threading — the nodeProperties channel (the `emAfter`
precedent):**

- `resolveNextNodePropertiesId`
  (`document-nodes-meta/derivations.mjs:330-345`) computes the next
  **sibling's** `nodeProperties@<documentNodePath>` registration id,
  with the design comment: *"The sibling's style facts (fontSize via
  its typeSpec layer, leading via the layout keys) live in its
  per-document-node node-properties scope; the typeSpec-based lookup
  this replaces could not resolve the layout keys."*
- The consumers read the neighbor scope's resolved values:
  `nsProps.get(GENERIC fontSize)`
  (`prosemirror/type-spec.typeroof.jsx:535+`; viewer counterpart at
  `viewer.typeroof.jsx:534`), wired as `nextNodeProperties@` in both
  renderers.
- A "node-em" is the **same lookup one hop in the other direction** —
  against the **containing node's** scope instead of the sibling's.
  The parent-scope channel is already threaded: text runs delegate to
  "the parent element's scope component"
  (`document-nodes-meta/index.mjs`, `parentNodeProperties`), and
  `rootNodeProperties@` seeds the chain.
- nodeProperties scopes **inherit down the document-node tree** (the
  operator's verification), so the basis a nested node needs (the
  textblock's effective 18pt) is addressable **today** — the margins
  prove the pattern with the sibling instead of the parent.

**Architectural consequence:** this dissolves the original a2 problem
— inline nodes stop needing `nodeSpecToTypeSpec` links (combinatorial
per-parent bookkeeping, as rejected at the start of the
structure-marks cycle) and become **readers of the node-scope chain**:
their font basis resolves in the containing node's scope, not the root
fallback. The typeSpec channel stays what it is — the tree of
per-block typographic contexts whose synthesized `fontSize` feeds the
node scopes ("fontSize via its typeSpec layer").

**Three layers, one architecture:**

1. **Units as basis-selectors** (the margins precedent): plain numbers
   migrate to `baseEm` (non-breaking); ~~textblocks and patches opt into
   `em`~~ **CORRECTED (channel split, operator 2026-10-12): only
   style patches offer `em`** — implemented 2026-10-12 (approach (a)
   phase 1+2: pair form + merge-channel em basis via the
   `CONTAINING_FONT_SIZE` alias in `PatchedScopeProperties`; plan
   `thoughts/plans/2026-10-12-2127-…`, commits `abcf36f0` + phase-2
   commit).
2. **The nodeProperties channel as the threading vehicle** (the
   `emAfter` precedent): inline-node and mark/patch scopes resolve
   their font basis against the containing node's scope.
3. **The typeSpec channel unchanged**: per-block typographic contexts;
   its `fontSize` synthesis feeds the node scopes.

### Known downstream (mapped in the research cycle 2026-10-12 — research doc §4)

- The `LeadingRunion`'s en-compensation
  (`type-spec/models.mjs:269-272`:
  `actuallineLength = lineLengthEn / relativeFontSize`) — arithmetic
  assumes a plain factor; needs re-derivation per unit.
- All `em`/`baseEm`/`en` consumers (line-length, gutters, paddings,
  margins) must be inventoried for which basis they assumed.
- ~~Whether `baseFontSize` withers to a root-only anchor (pt) once
  mid-tree scopes are `em`-based.~~ **Decided 2026-10-12: NO — kept
  as a feature (sub-document re-anchoring); see the operator decision
  under layer a2 above.**
- The patch/style-link scope basis today (mark style links resolve at
  the textblock's typeSpec — `derivations.mjs`
  `getStyleLinkPropertiesId`; whether their `em` values resolve
  against the containing node's scope needs mapping).

## RPI kick-off plan

Recommended sequence (operator's call):

1. ~~**Implement (b) first** — composition threading~~ — **DONE**
   (`6dbbf38e`): dispatcher context threading + the two viewer sites +
   `qa-structure-marks` probe extension for nested-run composition,
   live-verified on Typography.
2. **`/research_codebase` cycle on font-size resolution & re-basing**:
   (i) where `fontSize`/`baseFontSize`/`relativeFontSize` are
   synthesized and consumed (registered-properties, fundamentals,
   node-properties-generators, composition measurement);
   (ii) the nodeProperties scope composition (how the typeSpec layer
   lands in each node scope; parent/root threading);
   (iii) every `em`/`baseEm`/`en` resolution site (margins,
   `LeadingRunion`, leading, line-length);
   (iv) the inline-node + patch scope basis today (root fallbacks,
   mark style-link resolution contexts);
   (v) the unit vocabulary decision: plain number → `baseEm`
   migration, `em` semantics, node-em lookup design against the
   containing node's scope.
   **DONE 2026-10-12** — research doc:
   `thoughts/research/2026-10-12-1723-font-size-resolution-and-rebasing.md`
   (RPI convention: cycle docs live in `thoughts/` at project root during
   the cycle and archive to
   `docs/planning/agentic-artefacts/thoughts/` when the plan concludes —
   the earlier sketch of an output location inside this directory was an
   oversight, per operator 2026-10-12).
   Key resolutions for the plan: (a) `fontSize` is a pure synthetic
   (base × relative) and every consumer receives pre-flattened plain
   numbers — no unit stripping exists anywhere; (b) the nodeProperties
   parent layer demonstrably carries the containing node's
   `generic/fontSize` (the `emAfter` sibling lookup reads it), so
   node-em is addressable today; (c) patch scopes have no parent
   (`baseFontSize` falls to the model default) — the patch `em` basis
   must be pinned to the merged style-link scope that measurement
   reads; (d) no em-intent values exist in states/fixtures — the
   plain-number → `baseEm` migration is non-breaking at document
   scope; (e) inline nodes have no dedicated font-size machinery —
   the empty nodeSpecToTypeSpec link is origin-anchored and walks up
   to the root. Next: `/create_plan` for the implementation phases
   (likely: generator skip a1; units + migration; node-em threading;
   inline-node scope re-resolution away from root fallback; states
   re-tuning).
3. Live-verify per the established pattern (puppeteer DEBUG probes —
   NOT `npm run perf:composition`, which stays OFF LIMITS per the
   operator rule 2026-10-06).
4. **`/create_plan` cycle** — **DONE 2026-10-12** — plan doc:
   `thoughts/plans/2026-10-12-2127-inline-node-refinements-approach-a.md`
   (six phases: pair form → merge-channel `em` → one-element inline
   DOM → `inlineNodesStyleLinks` + routing → "Node Style Links" UI
   wiring → composition basis threading + QA/re-tuning). Next:
   `/implement_plan`.

## Related

- Archived cycle docs:
  `docs/planning/agentic-artefacts/thoughts/research/2026-10-11-1300-structure-marks-for-nested-combinable-chains.md`,
  `docs/planning/agentic-artefacts/thoughts/plan/2026-10-11-1355-structure-marks-nested-combinables.md`.
- Sup-marks round: `84861807` (sup citations as marks),
  `bd129521` (tests), `499be3bd` (editor mark subscriptions: nested
  marks, declarations, bag leak).
- Sibling planning: `docs/planning/type-spec-resolution/` (order 49) —
  relative typeSpec linking & silent typeSpecs.
- Probes: `scripts/puppeteer-probes/qa-structure-marks.mjs`,
  `qa-editor-mark-styling.mjs`; runner
  `scripts/debug-with-puppeteer.mjs`.

## Open questions (for the cycle)

1. ~~Does `width` ever legitimately apply to inline nodes (e.g.
   `reproduce-as-inline` atoms), or is the a1 skip unconditional for
   inline specs?~~ **Answered 2026-10-12: unconditional — no
   inline-block concept exists; see layer a1 decision note.**
2. Which existing `relativeFontSize` values re-interpret under `em`
   (the states' headings chain: h1 4.5714 → multiplicative)?
   Breaking-change review, level by level.
   — **Answered (research 2026-10-12, §5)**: none; all stored values
   are plain-number baseEm-equivalents.
3. Node-em basis for runs *directly* under the textblock: the
   textblock's own scope (same as today) — confirm no
   double-application of the textblock's own relative factor.
   — **Answered 2026-10-12**: no double-application risk — α rejected;
   `em` resolves in the merge channel against the origin outbound
   effective size (see the pivot note under layer a2).
4. Patch scopes: `em` against the containing node's scope (the li's
   18pt) or the typeSpec layer's effective size — pin the resolved
   basis the composition already measures against
   (`composition-controller.ts:917`).
   — **Answered 2026-10-12**: merge channel (`createPatched`, origin
   outbound effective size) — the same merged scope measurement reads;
   see the pivot note under layer a2.
5. Fixture/test blast radius: states, fixtures, the
   `text-composition` suite vehicles (`setPatchRelativeFontSize`
   asserts doubling), probe expectations.
   — **Mapped (research 2026-10-12, §5)**: all fixtures plain-number
   strings; probes carry no numeric font-size expectations; concrete
   test surface: the text-composition doubling/clear-restore contracts
   and four hyphenation-suite `baseFontSize` overrides.
