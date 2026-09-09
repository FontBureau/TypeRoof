---
date: 2026-09-05T21:59:00+02:00
git_commit: 05eaf4f96e9761198d8947fc9d40a12bdd5e097e
branch: demo/wikipedia
repository: TypeRoof
topic: "Phase 5a: document-tree walker/renderer separation (DocumentNodesMeta)"
tags: [plan, type-stage, viewer, document-nodes-meta, node-properties, refactor]
status: approved-structure
research: docs/planning/agentic-artefacts/thoughts/research/2026-09-05-2119-document-tree-walker-renderer-separation.md
umbrella-plan: thoughts/plans/2026-09-05-1623-node-properties.md
---

# Phase 5a: Document-Tree Walker/Renderer Separation — Implementation Plan

## Overview

Extract the document-tree infrastructure (node-identity-keyed widget
lifecycle, `pathOfTypes` context, typeSpec-path resolution, rendering-plan
derivation) out of the viewer into a renderer-independent `DocumentNodesMeta`
layer that **always exists** — in every render mode, in both layouts
(type-stage and ramp) — and to which DOM rendering attaches *optionally*.
The design center (operator-confirmed): **we always have meta and the
nodeProperties; optionally we can attach DOM rendering, or future renderers.**

This is a pure refactor (behavior-neutral). It implements Phase 5a of the
umbrella plan `2026-09-05-1623-node-properties.md` and prepares Phase 5b
(per-node `HierarchicalScopeNodeProperties` instances living in the meta
nodes).

## Current State Analysis

Full detail in the research doc; the load-bearing facts:

- **There is no explicit walk to extract.** Traversal is emergent from the
  component framework: `UIDocumentNodes` (dynamic-map provisioning),
  `UIDocumentNode` (typeKey dispatch + node-identity rebuild), and
  `_provisionWidgets` lifecycles (`viewer.typeroof.jsx:927-1186`). The
  boundary is drawn through widget classes, not through a walk function.
- **Already pure tree infrastructure** (research §1.2): all four module
  helpers (`viewer.typeroof.jsx:76-176`), `UIDocumentNode` in its entirety
  (927-1010), `pathOfTypes` construction/propagation (287, 289-296, 1240),
  the mark-descriptor pipeline (`_getWrapMarks` 721-818,
  `_wrapResultsAreEqual` 820-834), `_getRenderingDirectives` (424-447),
  `_provisionTypeSpecStyler` (515-591), `UIDocumentNodes._createWrapper`
  (1153-1185).
- **Six entanglement sites** needing splits (research §1.4):
  1. `UIDocumentElement` constructor (187-362) — seam: pure
     `resolveElementRenderingPlan(...) → {tag, attributes, additionalAttrs,
     innerHtml, childrenInInlineContext, treatAsLeaf}`
  2. `_applyAttrDrivenDOMUpdates` (456-493) — seam: compute diff (meta) vs.
     apply to node (viewer)
  3. `_createTypeSpecStylerWrapper` (372-415) — seam at `args=[this.node,
     this.node]` (407)
  4. `UIDocumentTextRun._provisionWidgets` (882-924) — coupling point: the
     `_MARK_ELEMENT` symbol (836) smuggling DOM refs through descriptors
  5. `_createStylerWidgets` (855-880) — per-mark id resolution fused with
     element extraction
  6. `UIDocumentNodes` slot quartet `_insertIntoSlot`/`_insertNodeIntoSlot`/
     `_reorderChildren`/`_destroyWidget` (1054-1151) — coupling point: the
     `childrenWidgetBus.insertDocumentNode` monkey-patch (1035-1038)
- **The outfitter** (`UIDocumentNodeOutfitter`,
  `prosemirror/type-spec.typeroof.jsx:532-793`) duplicates four algorithms
  over ProseMirror positions (research §2.2). It does not walk — PM does.
  Migration of the outfitter to the meta layer is **5b scope, not 5a**, but
  the meta API must be outfitter-compatible: stable node identity, ancestor
  type chains, next-sibling resolution, lifecycle events (research §2.3).
- **Meta-layer conventions are established** (research §3): two-tier DOM-less
  widget trees (`TypeSpecMeta`, `ActorsMeta`), registration via settings with
  model-path ids, `@parentProperties` dependency mapping, `setUpdated` push
  notification, `notFoundFallbackValue: null` idiom.
- **Viewer is mode-gated** (`index.typeroof.jsx:220-225,
  showViewerActivationTest`); the meta layer must not be.
- **Test gaps**: compare mode, node add/remove/reorder, typeKey rebuild,
  text-run/mark updates are all unasserted (research §4.3).

### Key Discoveries:

- `SimpleProtocolHandler.register` throws on duplicate ids
  (`component.mjs:195-198`) ⇒ per-node ids must be unique ⇒ id = document-node
  model path.
- `UIDocumentNode` is already pure (A) — adoption is natural, not forced.
- DOM-less widgets are first-class: `zone` omitted ⇒ `hostElement: null`
  (`component.mjs:1044-1047`); placemarkers only created `if(host)` (1309).
- Ramp layout (`layouts/ramp/index.typeroof.jsx`) is editor-only: no viewer,
  no mode switching; `nodeProperties@` handler already installed (:250).
  There, `DocumentNodesMeta` is the only tree layer — the purest case of the
  design center.

## Decisions (locked with operator, 2026-09-05)

1. **Placement**: `DocumentNodesMeta` always active at the top controller of
   both layouts (type-stage `index.typeroof.jsx`, ramp `index.typeroof.jsx`),
   rootPath `./document`, no activationTest. (Q1-A)
2. **Registration id shape**: `nodeProperties@<absolute documentNodePath>`
   (id = model path, framework convention). No typeSpec-id mixing. Parent
   lookup = path math on the consumer/meta side. (Q2-A)
3. **Structure**: adopt — `UIDocumentNodes`/`UIDocumentNode` and the pure
   halves of the element/text-run classes move into
   `document-nodes-meta.typeroof.jsx`; DOM rendering becomes an optional
   attachment created by the meta nodes. Meta always exists; renderers
   attach. (Q3-A, operator's refined reading)
4. **Pre-refactor test net**: G1–G7 only (research §4.3). G8–G12 deferred,
   written during the refactor if a (C)-site split needs a guard. (Q4)
5. **Hygiene first**: dead code + skip-guard consistency as a separate
   commit before the refactor; the next-sibling unknown-type FIXME
   (viewer:531-535) stays parked. (Q5)

## Desired End State

- `lib/js/components/layouts/type-stage/document-nodes-meta.typeroof.jsx`
  exists and owns: the document-tree widget structure (per-node lifecycle
  keyed by node-at-position identity), `pathOfTypes` context propagation,
  effective typeSpec-path resolution, next-sibling resolution, rendering-plan
  and mark-descriptor derivation, and per-node
  `nodeProperties@<documentNodePath>` protocol registrations (payload:
  the root map until 5b installs real per-node scopes).
- The viewer (`viewer.typeroof.jsx`) contains only DOM concerns: element
  creation, attr/text application, wrapper DOM, slot insertion — as
  attachment classes instantiated by the meta layer. Its rendered output is
  byte-identical to today.
- `DocumentNodesMeta` is registered always-active in both layouts; the
  viewer registration keeps its activationTest.
- The `insertDocumentNode` monkey-patch is replaced by a defined
  renderer-attachment interface.
- Full suite green throughout; new behavior tests (G1–G7) pass before and
  after the refactor, unchanged.

### Verification of end state:

- `npm run typecheck`, `npm run lint`, `npm test` all green.
- Behavior tests G1–G7 (written in Phase 1 against the unrefactored viewer)
  pass unmodified after Phase 3.
- Manual: viewer renders identically in viewer mode; editor, viewer, and
  compare modes all work in type-stage; ramp layout works.

## What We're NOT Doing

- No per-node `HierarchicalScopeNodeProperties` instances (5b). The per-node
  registrations in Phase 3 transport the root map as payload; consumers keep
  working unchanged.
- No outfitter migration to the meta layer (5b or later). The outfitter keeps
  its PM-position walk for now.
- No behavior changes: the parked FIXMEs (tag-change re-resolution,
  leaf-ness transitions, next-sibling unknown-type) stay parked.
- No changes to `getTypeSpecPropertiesIdMethod` — already shared, already
  the single source of truth.
- No `UIDocumentElementTypeSpecDropTarget` restructuring (unrelated to the
  walk; stays exported from the viewer module).
- No flattening/migration of the test harness infrastructure itself beyond
  the skip-guard consistency fix.

## Implementation Approach

Test-net-first, then two landings: **delegation** (code moves, call graph
preserved) then **ownership flip** (meta drives, viewer attaches). Each
landing is separately green and separately reviewed. Tests assert *behavior*
(observable DOM/state), never concrete function implementations — the whole
point is that implementations may move freely.

**Commit discipline (operator instruction)**: before *every* commit, stop
and present the commit message + file list; proceed only on operator's
"OKOK". Commit messages carry the standard metadata trailer (model/provider/
agent, read from their actual sources at commit time).

## Phase 0: Hygiene

### Overview
Behavior-neutral cleanup so the refactor diffs stay readable.

### Changes Required:

#### 1. Dead code removal
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**: remove `UIDocumentTextRun._stylerWrapper` (assigned `null` at
:617, never read) and `UIDocumentNodes._nodeSlots` (created at :1030, never
used).

#### 2. Consistent fixture skip-guards
**Files**: `lib/js/tests/type-stage-document-replace/index.test.mjs`,
`lib/js/tests/type-stage-toggles/index.test.mjs`,
`lib/js/tests/type-stage-pane-sizing/index.test.mjs`
**Changes**: all three DOM suites use the same `skipIf(fixture-missing)`
guard (today two skip silently, document-replace would hard-fail).

### Success Criteria:
- Automated: `npm run typecheck`, `npm run lint`, `npm test` green.
- Manual: none (no behavior change).

**Implementation Note**: pause with commit message; commit on OKOK.

---

## Phase 1: Behavior-test safety net (G1–G7)

### Overview
Pin current viewer behavior with tests that observe DOM and model state —
not implementation details — so the "pure move, behavior-neutral" claim of
Phases 2–3 is falsifiable. All tests are written against the **unrefactored**
viewer and must pass before any extraction starts.

### Changes Required:

**File**: `lib/js/tests/type-stage-viewer-behavior/index.test.mjs` (new;
reuse the `type-stage-toggles` harness via a shared import — extract
`buildWorld` into `lib/js/tests/type-stage-toggles/harness.mjs` export if
not already importable, or a small shared `lib/js/tests/harness/` module)

Behavior specs (each asserts observable outcomes only):

1. **G1 — compare mode mounts both panes**: set
   `documentRendererMode.value = "compare"`; assert the layout zone contains
   both `.ui_prosemirror_host` and `article.typeroof-document`; assert both
   have resolved `style.width` after an `environment@layout` publish.
2. **G2 — viewer DOM correct after editor→viewer round-trip**:
   viewer→editor→viewer; re-query the (fresh) article; assert the
   `[data-node-type]` sequence and text content match
   `activeState.document`'s structure.
3. **G3 — node insertion**: splice a node into `document.content` at index 0
   and in the middle; assert article child order and `data-node-type`
   sequence follow the collection.
4. **G4 — node removal**: delete a content key; assert child count and the
   surviving children's identity/order.
5. **G5 — node reorder**: move a key; assert DOM order follows collection
   order.
6. **G6 — typeKey change at same position**: change a node's `typeKey`;
   assert a *new* element with `[data-node-type="<new>"]` replaces the old
   one (element identity differs).
7. **G7 — text-run update + mark wrap/unwrap**: change a text node's `text`,
   assert textContent; add then remove a `strong` mark, assert a wrapper
   element with `[data-style-name]` appears then disappears while the text
   content is preserved.

### Success Criteria:
- Automated: `npm test` green (new suite included); typecheck/lint green.
- Manual: review that every assertion is behavior-level (DOM/state), with no
  references to viewer-internal method names.

**Implementation Note**: pause with commit message; commit on OKOK. If a
pinned behavior surprises (e.g. reveals a quirk), stop and report before
"fixing" anything — quirks get pinned, not fixed, in this phase.

---

## Phase 2: Extraction — delegation landing

### Overview
Move tree infrastructure into `document-nodes-meta.typeroof.jsx` and split
the six entanglement sites at their named seams. The viewer keeps its
overall shape: same class names, same registration, same call graph
direction (viewer code calls into the meta module). No always-on meta
widget yet — this landing is a *code move*, not yet an architectural flip.

### Changes Required:

#### 1. New module with the pure infrastructure
**File**: `lib/js/components/layouts/type-stage/document-nodes-meta.typeroof.jsx` (new)
**Changes**: receive from `viewer.typeroof.jsx`:
- the four module helpers (`_getMMChildIsBlock`,
  `_specChildrenInInlineContext`, `_getRenderingAttrDirectives`,
  `_determineUnknownType`) — unchanged, plus the new pure
  `resolveElementRenderingPlan(mmNode, specs, context)` extracted from the
  `UIDocumentElement` constructor's spec branches (seam 1);
- `pathOfTypes` context construction/propagation helpers (currently inline
  at viewer:287, 289-296, 1240);
- the mark-descriptor pipeline (`_getWrapMarks`, `_wrapResultsAreEqual`,
  `_getStyleLinkPropertiesId`, `_getEffectiveStyleLinks`) made DOM-free:
  descriptors no longer carry elements via `_MARK_ELEMENT` (seam 4 — the
  symbol coupling is removed; descriptor→element association becomes an
  explicit parallel structure owned by the viewer attachment);
- typeSpec-path resolution aliases (`_getTypeSpecPropertiesId`) and
  next-sibling `pathOfTypes` computation (from `_provisionTypeSpecStyler`,
  537-550).

#### 2. Split the remaining (C)-sites in the viewer
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**:
- `UIDocumentElement` constructor: apply `resolveElementRenderingPlan` then
  create DOM (seam 1); `_applyAttrDrivenDOMUpdates` becomes compute-diff
  (meta util) + apply (viewer) (seam 2); `_createTypeSpecStylerWrapper`
  receives its target element as an argument instead of reading `this.node`
  mid-method (seam 3).
- `UIDocumentTextRun._provisionWidgets`/`_createStylerWidgets`: consume pure
  descriptors from the meta module; wrapper-DOM creation and styler binding
  stay (seams 4–5).
- `UIDocumentNodes` slot quartet: order/sibling resolution expressed as pure
  functions over the collection + `_keyToWidget`; DOM mutation stays in thin
  apply methods (seam 6). The monkey-patch remains for this landing
  (interface replacement is Phase 3).

### Success Criteria:
- Automated: full suite green incl. G1–G7; typecheck/lint green.
- Manual: viewer renders identically (spot-check wikipedia demo doc).

**Implementation Note**: pause with commit message; commit on OKOK.

---

## Phase 3: Ownership flip — meta drives, viewer attaches

**Detailed implementation plan (Step 0 design, converged 2026-09-06):**
`docs/planning/agentic-artefacts/thoughts/plan/2026-09-06-1047-phase3-document-nodes-meta-attachment-interface.md`
— DOM-free meta tree, `getWidgetById` discovery with controller-configured
id, single-argument `attachRenderer`/`detachRenderer`, handler returns widget
descriptions, viewer-side DOM insertion via attachment registry.

### Overview
Realize the design center: `DocumentNodesMeta` becomes an always-active
widget tree over `./document`; the viewer's per-node classes become
attachments created and driven by the meta nodes. Per-node
`nodeProperties@<documentNodePath>` registrations are wired (payload: root
map — behavior-neutral, nothing consumes the new ids yet; 5b replaces the
payload with real per-node scopes).

### Changes Required:

#### 1. Always-active meta layer in both layouts
**Files**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`,
`lib/js/components/layouts/ramp/index.typeroof.jsx`,
`lib/js/components/layouts/type-stage/document-nodes-meta.typeroof.jsx`
**Changes**:
- `DocumentNodesMeta` (dynamic-map container over `./document/content`,
  DOM-less: no `zone` in settings) registered at the top controller with
  rootPath `./document`, deps `nodeSpec`/`markSpec`/`nodeSpecToTypeSpec` —
  no activationTest. Same registration in the ramp controller.
- Meta node classes (adopted from Phase 2's extracted code): per-node
  lifecycle keyed by node-at-position, `pathOfTypes` propagation, typeSpec
  resolution, rendering-plan/mark-descriptor derivation, next-sibling
  resolution.
- Each meta node declares in its settings
  `{"nodeProperties@": widgetBus.rootPath.toString()}` (id = absolute
  document-node path); its `update` pushes `setUpdated` on change, guarded
  per the `hasProtocolHandlerRegistration` idiom. Payload for now: the root
  node-properties map (obtained via the existing root registration).

#### 2. Viewer becomes an attachment
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**:
- `UIDocumentViewer` keeps its activationTest and root `<article>`; instead
  of owning a `UIDocumentNodes` walk, it *attaches* to `DocumentNodesMeta`:
  attachment classes (per meta node) create/apply DOM, driven by meta-node
  lifecycle.
- The `insertDocumentNode` monkey-patch (viewer:1035-1038) is replaced by a
  defined interface: the meta container resolves order/siblings and calls
  the attached renderer's insertion callback (e.g.
  `attachment.insertNode(domNode, beforeDomNode|null)`), or a no-op when no
  renderer is attached.
- Attachment presence is optional by construction: editor-only mode (and the
  ramp layout) run the full meta tree with zero attachments.

#### 3. Consumer migration (mechanical)
**Files**: viewer styler/pane-styler registrations where they hard-code the
root `nodeProperties@<originTypeSpecPath>` id
**Changes** (operator decision, 2026-09-05): consumers that know their
document-node path subscribe to **their own** `nodeProperties@<documentNodePath>`
id. Payloads are identical to the root map today, so this is
behavior-neutral — but it exercises the per-node registration scheme end to
end (resolution, notification propagation) and puts consumers in their 5b
position. Consumers without a node context (e.g. the pane styler on the
document container) keep the root id.

### Success Criteria:
- Automated: full suite green incl. G1–G7 **unmodified**; typecheck/lint
  green; a new assertion (in the G1/G2 suite) that in editor-only mode no
  `article.typeroof-document` exists while `nodeProperties@` per-node
  registrations are live (observable via the protocol handler).
- Manual: wikipedia demo — editor, viewer, compare modes render and switch
  identically to before; ramp layout renders and labels/parameters work.

**Implementation Note**: pause with commit message; commit on OKOK. This is
the riskiest landing — manual verification before commit is required, not
optional.

#### 4. Tooling housekeeping (applies to all phases with new files)
**File**: `.prettierignore`
**Changes**: any newly added `.mjs` file must be explicitly un-ignored
(operator note, e.g. `!lib/js/components/layouts/type-stage/…​.mjs`);
likewise new test suites under `lib/js/tests/` if not already covered by
`!**/*.test.mjs`. Add the un-ignore lines in the same commit that adds the
file. New `.typeroof.jsx` files need no entry (already covered).

#### 5. ~~Open decision~~ (resolved by operator, 2026-09-05)
Phase 3 item 3 — decided: consumers with a document-node path subscribe to
their own `nodeProperties@<documentNodePath>` id (behavior-neutral today,
exercises the scheme, is the 5b position). See item 3.

---

## Phase 4: Archive

### Overview
Move this RPI cycle's artefacts into the documentation tree.

### Changes Required:
**Files**: `docs/planning/agentic-artefacts/thoughts/research/2026-09-05-2119-document-tree-walker-renderer-separation.md`
→ `docs/planning/agentic-artefacts/thoughts/research/`;
`docs/planning/agentic-artefacts/thoughts/plan/2026-09-05-2159-document-tree-walker-renderer-separation.md`
→ `docs/planning/agentic-artefacts/thoughts/plan/` (via `git mv`)
**Changes**: update the front-matter `research:`/`plan:` cross-references
(including the umbrella plan's pointer if it references this cycle) to the
new paths.

### Success Criteria:
- Automated: `git status` clean after the archiving commit.
- Manual: links resolve.

**Implementation Note**: pause with commit message; commit on OKOK. This is
the final commit of the cycle.

---

## Follow-up Items (post-5a, explicitly out of scope here)

1. **Fix: dynamically added marks don't wrap text runs in the viewer.**
   Pinned in G7 (`lib/js/tests/type-stage-viewer-behavior/index.test.mjs`)
   during Phase 1. Mechanism: `UIDocumentTextRun`'s dependency mappings
   (`viewer.typeroof.jsx:953-961`) include `"text"` but not `"marks"` (and
   not mark `"attrs"`), so a marks-only change never triggers the text
   run's `_provisionWidgets` — the wrap/unwrap logic there works (proven
   at provisioning time, e.g. compare-mode editor edits appear in the
   viewer after re-provisioning) but is never invoked for marks-only
   updates. Estimated fix: add `"marks"` (+ maybe mark attrs) to the
   dependency mappings (~1–3 lines), verify no over-provisioning
   (`_wrapResultsAreEqual` guards DOM surgery), flip the G7
   pinned-quirk assertions to assert wrapping. Best landed as a small
   commit right after 5a — it also verifies the new `DocumentNodesMeta`
   dependency wiring end-to-end.

## Testing Strategy

### Behavior tests (Phase 1, guard all later phases):
- G1 compare mode both-panes; G2 round-trip DOM correctness; G3–G5 node
  add/remove/reorder; G6 typeKey rebuild; G7 text-run + mark wrap/unwrap.
- Assertions observe DOM and model state only — no viewer-internal names.

### Deferred guards (write during Phases 2–3 if a split needs one):
- G8 per-node styling/`noStyler`; G9 unknown-type rendering; G10 zone
  placement; G11 live edit in compare; G12 leaf/htmlTag warn paths (pin,
  don't fix).

### Regression suite:
- Existing: type-stage-toggles, type-stage-document-replace,
  type-stage-pane-sizing, environment-dispatch — all must pass unmodified.

### Manual:
- Wikipedia demo document in all three modes, both layouts (type-stage,
  ramp), after Phase 3.
