---
date: 2026-09-06T16:13:00+02:00
git_commit: 6a300acc2ca5c48c34ddcba107551c3c3acb3571
branch: demo/wikipedia
repository: TypeRoof
topic: "Phase 5b: per-document-node nodeProperties@ channel (node→node) on DocumentNodesMeta"
tags: [plan, node-properties, document-nodes-meta, type-stage, phase-5b]
status: approved-design
research: docs/planning/agentic-artefacts/thoughts/research/2026-09-06-1536-phase-5b-node-to-node-channel.md
umbrella-plan: thoughts/plans/2026-09-05-1623-node-properties.md
handoff: docs/planning/agentic-artefacts/thoughts/plan/2026-09-06-phase-5b-handoff.md
---

# Phase 5b: Node→Node Channel — Implementation Plan

## Overview

Install **real per-document-node `HierarchicalScopeNodeProperties` scopes**
owned by the `DocumentNodesMeta` layer, replacing the 5a root-map
live-delegation payloads. Children consume their parent's effective map
through the cascade's `"parent"` layer; geometry (available widths) starts
flowing document-node→document-node. The old typeSpecnion geometry stream
(orphaned since Phase 4) is commented out with pointers to the new home.

## Current State Analysis

Verified against code at `6a300acc` (see research doc for full references):

- 5a pre-built the transport: per-node `nodeProperties@<documentNodePath>`
  registrations exist on every `DocumentNodesMetaNode` dispatcher
  (`document-nodes-meta/index.mjs:268-279`); consumers map per-node ids
  (`viewer.typeroof.jsx:306-314`, `derivations.mjs:362-388`); the payload
  accessor contract is `get nodeProperties()` (`index.mjs:226-229`),
  currently live-delegating to the root scope via `rootNodeProperties@`.
- Root scope lives in `TypeSpecLiveProperties.update`
  (`live-properties.typeroof.jsx:134-210`); root registration gated in
  `meta.typeroof.jsx:264-273`; protocol installed in both controllers with
  `notFoundFallbackValue: null` (`type-stage/index.typeroof.jsx:292-300`,
  `ramp/index.typeroof.jsx:251-259`).
- **hostMap gap**: no meta node consumes `typeSpecProperties@` today. Meta
  nodes have `pathOfTypes` context (`index.mjs:527-535`,
  `derivations.mjs:274`) and `widgetBus.originTypeSpecPath`
  (`index.mjs:526`) — the inputs `getTypeSpecPropertiesIdMethod`
  (`integration.typeroof.jsx:170-272`) needs.
- **Framework constraints**:
  - A widget cannot change its own external dependency mappings after
    creation (`component.mjs:488-501` — a changed external id would become
    a nonsense model path). The established answer is provisioned child
    wrappers rebuilt on id change (`viewer.typeroof.jsx:404-472`).
  - Registrations must sit on the dispatcher, not the typeKey child:
    typeKey rebuilds create new-before-old and the duplicate-registration
    throw would fire (`index.mjs:274-277`, `component.mjs:195-198`).
  - Updates are strictly parent-first: provisioning completes before
    children update, containers recurse depth-first
    (`component.mjs:1184-1282`).
- **Gaps**: `nodeProperties@` missing from both controllers'
  `resetUpdatedLog()` cycles (`type-stage/index.typeroof.jsx:700-727`,
  `ramp/index.typeroof.jsx:448-464`); memo-key aliasing in
  `getTypeSpecPropertiesIdMethod` (`integration.typeroof.jsx:181-197` —
  do not pass the 4th arg with the default protocol in the same session).
- **Old channel orphaned but intact**: `environmentGen`
  (`properties-generators.mjs:53-73`), old `availableSizesGen`
  (:81-~170), `horizontalLayoutRunion` geometry re-routes (:648-666) still
  produced, read by nothing; `horizontalWidthSum` (:534) is the known
  pre-existing lint error.

## Desired End State

- Each document-node dispatcher's `nodeProperties@<documentNodePath>`
  payload answers `getProperties()` with a real per-node scope:
  `CascadingMap([["local", locals], ["parent", parentEffectiveMap]])`,
  parent = parent dispatcher's scope (document-path math), top-level
  nodes falling back to the root scope (`rootNodeProperties@`).
- Scope updates propagate: a parent scope rebuild marks its registration
  updated; children rebuild seeing the settled parent map in the same
  cycle (framework parent-first order, pinned by a behavior test).
- `horizontalLayoutNodePropertiesGen` stub in
  `node-properties-generators.mjs` with proven mechanics: unit-tested
  synthetic resolution through the node cascade; column-container
  behavior test (child CSS width = computed column width).
- Old typeSpecnion geometry generators commented out (not deleted), each
  with a hint pointing at `node-properties-generators.mjs`.
- `nodeProperties@` covered by `resetUpdatedLog()` in both controllers.
- Full battery green: `npx vitest run`, `npx eslint`,
  `npm run typecheck`, `npm run build:app`.

### Key Discoveries:
- Dependency-mapping change ⇒ provisioned child wrapper, not own update
  (`component.mjs:488-501`; pattern at `viewer.typeroof.jsx:404-472`).
- The umbrella plan's "imperative lifecycle-hooked registration" is moot:
  ids are document-path-keyed (5a), stable for the dispatcher's lifetime;
  declarative settings registration suffices (`component.mjs:765-782`).
- The plan's `_getTypeSpecPropertiesId(pathOfTypes.slice(0,-1), true)`
  parent mechanism belongs to the typeSpec channel; the node channel's
  parent lookup is document-path math (5a design center).
- `_provisionTypeSpecStyler`'s rebuild-check extension is **unnecessary**:
  per-node `nodeProperties@` ids never change for a live wrapper (unlike
  `properties@`). Documented finding; no code change.
- Text-node delegation must route to the **parent element's** scope, not
  the root: a text run inside a column container must see the container's
  `layout/availableWidth`.

## What We're NOT Doing

- No `hostContext`/NodeModel generator argument (umbrella plan defers).
- No moving of the root scope out of `TypeSpecLiveProperties` (decision 5).
- No deletion of old generators — comment out with hints (decision 6).
- No changes to the `typeSpecProperties@` channel itself.
- No multi-renderer attachments; no outfitter migration.
- No removal of the existing `horizontalWidthSum` lint error unless the
  Phase 3 stub consumes it (allowed, resolves it).

## Operator Decisions (2026-09-06, locked)

1. Dispatcher owns the registration + accessor; scope lives in a
   provisioned per-element scope component (framework constraint, see
   Current State). Approved.
2. hostMap via `typeSpecProperties@<effectivePath>` dependency mapping on
   the scope component. No objections.
3. Keep text-node registrations; text payloads delegate to the **parent
   element's** scope. Approved (parent-scope amendment here).
4. Geometry generator: stub + proof of working mechanics; operator takes
   over the exact width semantics from there. Approved.
5. Root scope stays in `TypeSpecLiveProperties`. Approved.
6. Old generators commented out with hint comments, not deleted.
   `horizontalWidthSum` stays unless the stub consumes it. Approved.
7. Ordering proof as a G-suite behavior test (widget level), not a unit
   test. Approved.
8. `resetUpdatedLog()` for `nodeProperties@` in both controllers.
   Approved ("the only correct thing to do").

## Working Agreements (operator instruction, absolute)

1. **Small, verifiable commits** — each phase lands as one or a few
   small commits; no commit bundles unrelated changes.
2. **Commit gate**: before EVERY commit, stop, present the commit message
   and file list, wait for the operator's review or "OKOK" before
   committing and proceeding.
3. **Behavior tests, not implementation details** — added tests assert
   inputs → observable outcomes (resolved maps, CSS values, registration
   liveness), never private methods/internal structure.
4. New `.mjs` files need explicit `!lib/js/...` entries in
   `.prettierignore` (deny-by-default repo convention).
5. Verification battery per landing: `npx vitest run`, `npx eslint`,
   `npm run typecheck`, `npm run build:app`.
6. Commit messages carry the metadata trailer read from actual sources
   (provider/model from `~/.config/goose/config.yaml`,
   `agent: goose v<version>`).
7. Docs archive as the **final commit** (Phase 6): research, plan and
   handoff into `docs/planning/agentic-artefacts/thoughts/`, each into
   the subdirectory where it belongs. Nothing else ships in that commit.

## Implementation Approach

Bottom-up within the channel: hygiene first (updated-log semantics must
be correct before per-node pushes exist), then the scope machinery with
the ordering proof test-first, then the geometry stub proving generator
mechanics, then old-channel teardown, then consumer polish; the archive
commit (Phase 6) closes the cycle.

---

## Phase 1: Channel hygiene — resetUpdatedLog + delegation lock test

### Overview

`nodeProperties@` joins the per-cycle `resetUpdatedLog()` in both layout
controllers. Without this, Phase 2's per-node `setUpdated` pushes would
keep every consumer firing on every update (the updated-log is never
cleared). A G-suite assertion pins the current delegation behavior as the
regression baseline for Phase 2.

### Changes Required:

#### 1. Reset the nodeProperties@ updated-log each cycle
**Files**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`
(:700-727), `lib/js/components/layouts/ramp/index.typeroof.jsx` (:448-464)
**Changes**: add `"nodeProperties@"` to the set of protocol handlers whose
`resetUpdatedLog()` is invoked in the update/initialUpdate paths, mirroring
the existing `typeSpecProperties@`/`stylePatchProperties@`/
`styleLinkProperties@` resets. No other logic change.

#### 2. G-suite: pin current delegation behavior
**File**: `lib/js/tests/type-stage-viewer-behavior/index.test.mjs`
**Changes**: extend the existing per-node registration assertion
(:331-357) — behaviorally, per node: the registration exists AND its
payload's `getProperties()` resolves the same `layout/availableWidth` as
the root registration's payload (the delegation contract Phase 2 will
replace). Assert resolved values, not the delegation mechanism.

### Success Criteria:

#### Automated Verification:
- [x] `npx vitest run` green (all suites, incl. extended G-suite) — 256/256
- [x] `npx eslint` clean (except the known `horizontalWidthSum`)
- [x] `npm run typecheck` clean
- [x] `npm run build:app` passes

#### Manual Verification:
- [ ] Wikipedia demo: editor/viewer/compare modes unchanged; ramp renders.

**Implementation Note**: pause with commit message + file list; commit on
OKOK before Phase 2.

---

## Phase 2: Per-node scopes (ordering test first)

### Overview

The core phase. Each element meta node provisions a scope component
holding a real `HierarchicalScopeNodeProperties`; the dispatcher's
`.nodeProperties` accessor switches from root-delegation to the scope;
text runs delegate to the parent element's scope. The parent-first
ordering proof lands as a **failing behavior test first**, then the
implementation makes it pass.

### Changes Required:

#### 1. Ordering-proof behavior test (first commit, fails red)
**File**: `lib/js/tests/type-stage-viewer-behavior/index.test.mjs`
**Changes**: new test with a multi-level document (container with a
layout-relevant typeSpec containing a paragraph). Assert behaviorally:
the child node's `nodeProperties@` payload scope's `"parent"` layer
**is** the parent dispatcher's effective map (object identity via the
public `getLayer("parent")` API), and after a typeSpec edit that changes
the parent's scope, the child's next `getProperties()` observes the
parent's settled map (no stale intermediate). Fails before Phase 2
implementation (payloads are root delegations), passes after.

#### 2. Scope component per element node
**File**: `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`
**Changes**:
- New internal component class (e.g. `DocumentNodeProperties`, base
  `_BaseComponent`), provisioned by `DocumentNodesMetaElement` in
  `_provisionWidgets` following the viewer's `_provisionTypeSpecStyler`
  rebuild-or-keep pattern (`viewer.typeroof.jsx:404-472`): rebuilt when
  its resolved `typeSpecProperties@` id or parent `nodeProperties@` id
  changes.
- Dependency mappings: `[resolvedTypeSpecPropertiesId, "hostProperties@"]`,
  `[parentNodePropertiesId, "@parentNodeProperties"]` (or direct
  construction args where the framework allows — the scope component's
  parent-scope input can be read off the registered component at build
  time, like `live-properties.typeroof.jsx:73-88` does for
  `@parentProperties`).
- On update: rebuild the scope when `hostProperties@` was marked updated
  or the parent scope identity changed; then
  `setUpdated(ownNodePropertiesId)` on the protocol handler — the push
  happens in the scope component, guarded by
  `hasProtocolHandlerRegistration` (idiom at
  `live-properties.typeroof.jsx:196-208`), so the registration owner
  (dispatcher) need not be the pusher.
- Expose `get nodeProperties()` returning the scope (accessor contract
  unchanged for consumers).
- Effective typeSpec path resolved via `getTypeSpecPropertiesIdMethod`
  with the default protocol — **bound as a class field/closure inside
  `index.mjs`** (class-field bindings don't survive being passed across
  module boundaries — 5a landmine); `_originTypeSpecPath` from
  `widgetBus.originTypeSpecPath` (`index.mjs:526`).
- Silent/unknown nodes: the typeSpec fallback walk lands on the root
  typeSpecnion (`integration.typeroof.jsx:148`) — the hostMap is then the
  root typeSpecnion's properties; the scope still builds (the channel
  must not break for descendants, per umbrella plan).

#### 3. Dispatcher accessor + provisioning wiring
**File**: `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`
**Changes**:
- `DocumentNodesMetaNode`'s `get nodeProperties()` (:226-229) delegates
  to the dispatched child's scope component when present (element nodes),
  else to the **parent element scope** (text runs) — replacing the
  `rootNodeProperties@` mapping where applicable. The `rootNodeProperties@`
  mapping stays for the top-level fallback (children of
  `DocumentNodesMetaDocument`).
- `DocumentNodesMetaTextRun` (`:496-513`) provisions no scope component;
  its dispatcher answers with the parent element's scope.
- Parent scope discovery = document-path math on `widgetBus.rootPath`
  (strip trailing `content/<key>` pairs to address ancestor dispatchers),
  with `hasRegistered` guard and `rootNodeProperties@` fallback for
  top-level nodes.

#### 4. Unit tests: per-node scope behavior
**File**: `lib/js/components/layouts/type-stage/node-properties.test.mjs`
**Changes**: behavior tests on the resolved maps — child scope reads
parent's locals through the cascade; local-over-parent precedence; a
rebuilt parent scope is observed by a subsequently built child (settled-
map semantics at the scope level, complementing the widget-level G-test).

### Success Criteria:

#### Automated Verification:
- [x] New ordering test fails before implementation, passes after
      (red: `97987ac1`; green with the scope machinery)
- [x] G1–G7 pass **unmodified**; pane-sizing passes unmodified
- [x] `npx vitest run`, `npx eslint`, `npm run typecheck`,
      `npm run build:app` all green — 257/257

#### Manual Verification:
- [ ] Wikipedia demo: all modes render identically; ramp works.

**Implementation Note**: commit(s) gated on OKOK. Suggested split:
(a) failing ordering test, (b) scope machinery making it green.

**Implementation deviations recorded** (2026-09-06, operator-informed):
the scope component is provisioned in the element **constructor** (not
the first `_provisionWidgets`): renderer attachments are initialized
before the element's first update, and their stylers read the payload
immediately — the `_renderingPlan` ctor-derivation precedent. The
parent scope arrives via the ctor-arg chain; a `"@parentNodeProperties"`
dependency mapping serves as the rebuild *trigger* (the noStyler
precedent), with the parent registration id threaded through the
containers. The payload contract is scope-like (`.getProperties()`);
unbuilt scope components delegate to the parent payload.

---

## Phase 3: Geometry generator stub + proof

### Overview

`horizontalLayoutNodePropertiesGen` in `node-properties-generators.mjs`:
the node-channel home for column geometry. Stub depth per operator
decision 4 — mechanics proven, exact width semantics left to the
operator.

### Changes Required:

#### 1. Generator stub
**File**: `lib/js/components/layouts/type-stage/node-properties-generators.mjs`
**Changes**:
- `horizontalLayoutNodePropertiesGen(outerNodePropertiesAPI, hostMap)`:
  reads style facts from the **hostMap** (`generic/lineLength`,
  `generic/columnCount`, `generic/fontSize` — the style-side yields of
  `horizontalLayoutRunion` that stay in the typeSpecnion); reads the
  parent's `layout/availableWidth` via
  `outerNodePropertiesAPI.getParentProperty(...)`; yields a per-column
  `layout/availableWidth` local (plain value or `SyntheticValue` with
  explicit dependency list, mirroring `properties-generators.mjs:659-666`).
- Registered in `NODE_PROPERTIES_GENERATORS` after `availableSizesGen`.
- Width-semantics yields (re-route `layout/width ← layout/availableWidth`,
  tombstones) **left as marked stub sites** for the operator — decide
  which nodes see `layout/width` (research doc §6: today all nodes inherit
  root's `layout/width` through delegation; the styler's
  `innerPropertiesData` reads it at `type-spec.typeroof.jsx:263`).
- `horizontalWidthSum` may be consumed here if wanted (resolves the
  pre-existing lint error) — operator's call at takeover.

#### 2. Proof tests (behavior)
**Files**: `lib/js/components/layouts/type-stage/node-properties.test.mjs`,
`lib/js/tests/type-stage-viewer-behavior/index.test.mjs` (or pane-sizing
suite if it fits the harness)
**Changes**:
- Unit level: a container scope whose hostMap carries lineLength/fontSize
  yields the expected per-column `layout/availableWidth`; a child scope
  inherits that value through the `"parent"` layer (assert resolved
  values, not internals).
- Widget level (the umbrella plan's 5b success criterion): a document
  with a column container → child text node's resolved CSS width equals
  the computed column width.

### Success Criteria:

#### Automated Verification:
- [x] New proof tests green; full battery green — 261/261 (3 unit
      tests in `node-properties.test.mjs`; G9 in the behavior suite:
      per-node scope answers the host typeSpecnion's computed content
      width)
- [x] `npm run build:app` passes (export checks)

#### Manual Verification:
- [ ] Multi-column demo renders correct column widths.

**Implementation Note**: commit(s) gated on OKOK. **Handoff point**: the
exact width semantics are the operator's from here.

**Handoff state** (2026-09-06): the stub yields `layout/availableWidth`
(the horizontalLayoutRunion formula) computed from the hostMap; **no
`layout/width` yield** — the CSS-width consumer reads `layout/width`
(`type-spec.typeroof.jsx:263`), and per-node width application is the
operator's width-semantics decision. The delegation-baseline assertion
was updated accordingly (per-node `availableWidth` defined everywhere;
`layout/width` inherited from the root scope everywhere).

---

## Phase 4: Old-channel teardown (comment-out)

### Overview

The orphaned typeSpecnion geometry stream is commented out (not deleted,
decision 6), each site with a hint pointing at the new home. Style-side
yields of `horizontalLayoutRunion` stay untouched.

### Changes Required:

#### 1. Comment out orphaned producers
**File**: `lib/js/components/layouts/type-stage/properties-generators.mjs`
**Changes**:
- `environmentGen` (:53-73) and old `availableSizesGen` (:81-~170):
  comment out, remove from `TYPE_SPEC_PROPERTIES_GENERATORS` (:681-698),
  hint comment: superseded by `node-properties-generators.mjs`
  (`getRootNodePropertiesMap` + `availableSizesGen`).
- `horizontalLayoutRunion` geometry re-routes (:648-666): comment out
  with hint pointing at `horizontalLayoutNodePropertiesGen`; style locals
  and `/pt` synthetics stay.
- `horizontalWidthSum` (:534-545): stays unless Phase 3 consumed it.
- Verify no remaining `specific/root/*` consumer exists before commenting
  (research: none; re-grep at implementation time).

#### 2. Dead seeding hint
**File**: `lib/js/components/layouts/type-stage/live-properties.typeroof.jsx`
**Changes**: `seedTypeSpecDefaults` (:26-46) keeps its signature; add a
hint comment that the `environment`/`width`/`height` options are dead at
the call site (:148-155) since environment moved to the nodeProperties
channel. No signature change (avoid churn; the function is tested).

### Success Criteria:

#### Automated Verification:
- [x] Full battery green — pane-sizing unchanged in assertions (261/261)
- [x] No new lint errors — `horizontalWidthSum` **resolved** (commented
      out alongside the two generators; the orphaned `_ucFirst`,
      `DEMARCATION_*` and `lengthToCSSUnit`/`PATH_SPEC_ENVIRONMENT_PROVIDER`
      imports went with them)

#### Manual Verification:
- [ ] Wikipedia demo unchanged; ramp unchanged.

**Implementation notes** (2026-09-07): the "verify no remaining
`specific/root/*` consumer" re-grep confirmed none. The dead
`seedTypeSpecDefaults` options got the hint comment (signature kept;
no caller passes them).

**Implementation Note**: commit gated on OKOK.

---

## Phase 5: Consumer polish

### Overview

Behavior-neutral `CascadingMap` swap in the styler (the precedence is
already node-over-style via spread-merge; the facade makes it explicit);
document the rebuild-check finding.

### Changes Required:

#### 1. Styler merge → CascadingMap
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes**: replace the spread-merge at :288-294 with
`new CascadingMap([["node", nodePropertiesMap], ["style",
typeSpecPropertiesMap]])` — read interface unchanged for
`innerPropertiesData` lookups. Behavior-neutral: precedence already
node-over-style. (Pane-styler keeps its merge — it composes different
inputs; swap only if it reads naturally.)

#### 2. Document the rebuild-check finding
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**: comment at the `_provisionTypeSpecStyler` rebuild-check
(:458-461) noting why `nodeProperties@` needs no comparison: per-node ids
are document-path-keyed and stable for the wrapper's lifetime (unlike
`properties@` which follows typeSpec resolution).

### Success Criteria:

#### Automated Verification:
- [x] Full battery green — 261/261

#### Manual Verification:
- [ ] Wikipedia demo unchanged.

**Implementation Note**: commit gated on OKOK.

**Implementation notes** (2026-09-07): the `CascadingMap` swap landed
in `type-spec.typeroof.jsx` (layers `"node"` / `"style"`, node wins —
behavior-identical to the spread-merge). The rebuild-check finding is
documented at the `_provisionTypeSpecStyler` site
(`viewer.typeroof.jsx`): `nodeProperties@` needs no comparison — its id
is document-path-keyed and stable for the wrapper's lifetime, unlike
`properties@` which follows typeSpec resolution.

---

## Phase 6: Archive (final commit of the plan)

### Overview

The **final commit** of this plan puts the session's `thoughts/` files
into the archive under `docs/planning/agentic-artefacts/thoughts/`, each
into the subdirectory where it belongs (5a precedent: `6a300acc`, which
also archived its handoff document). Nothing else ships in this commit.

### Changes Required:

#### 1. Move the artefacts
**Changes**:
- (done) `thoughts/research/2026-09-06-1536-phase-5b-node-to-node-channel.md` →
  `docs/planning/agentic-artefacts/thoughts/research/`
- (done) `thoughts/plans/2026-09-06-1613-phase-5b-node-to-node-channel.md` →
  `docs/planning/agentic-artefacts/thoughts/plan/`
- (done) `thoughts/handoffs/2026-09-06-phase-5b-handoff.md` →
  `docs/planning/agentic-artefacts/thoughts/plan/` (alongside its plan,
  as `handoff-phase3-document-nodes-meta.md` did)
- Update cross-references in the moved documents (frontmatter `research:`/
  `handoff:`/`umbrella-plan:` paths) to their new locations.
- Mark the umbrella plan's Phase 5b section ✅ with the commit hashes of
  this cycle (the umbrella plan itself stays at `thoughts/plans/` until
  its own completion archives it).

### Success Criteria:

#### Automated Verification:
- [ ] `git status` clean after the commit; moved files render their
      cross-references correctly

**Implementation Note**: commit gated on OKOK — this is the closing act
of the cycle; nothing follows it.

---

## Testing Strategy

**Tests assert behavior (inputs → observable outcomes), not
implementation details** (operator rule). Resolved maps, CSS values,
registration liveness, layer identity via the public `getLayer` API —
never private methods or internal structure.

### Unit Tests:
- `node-properties.test.mjs`: per-node cascade behavior (parent locals
  visible through `"parent"` layer, local precedence, settled-parent
  observation); geometry generator proof (column width math through
  synthetics).

### Integration/Behavior Tests:
- `type-stage-viewer-behavior/index.test.mjs` (G-suite): delegation
  baseline (Phase 1); parent-first ordering proof (Phase 2, red→green);
  column-layout CSS width (Phase 3, umbrella 5b criterion).
- `type-stage-pane-sizing/index.test.mjs`: unchanged assertions through
  all phases — the guard that the channel swap is behavior-preserving.

## Risk Register

- **Ordering assumption**: if parent-first provisioning does not hold as
  read (component.mjs:1184-1282), the Phase 2 red test surfaces it
  before any implementation rides on it.
- **Scope rebuild churn**: a scope rebuilt per update allocates a new
  CascadingMap per node — acceptable at document scales; note in code if
  profiling shows otherwise (flattening comment in
  `cascading-map.mjs:8-14` applies).
- **Ramp layout**: no width/height widget deps — the guard pattern
  (`live-properties.typeroof.jsx:160-170`) already handles it; per-node
  scopes must not assume `layout/width` locals exist.
- **Memo aliasing**: never call `getTypeSpecPropertiesIdMethod` with the
  4th arg `"nodeProperties@"` in the same process that also uses the
  default — cache thrash (correctness holds via `hasRegistered`
  re-validation, `integration.typeroof.jsx:190-197`, but performance
  suffers).
