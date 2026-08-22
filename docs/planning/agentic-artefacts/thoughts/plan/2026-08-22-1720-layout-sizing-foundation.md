---
date: 2026-08-22T17:20:00+02:00
git_commit: b87f753c05f34700eb5a0d880b86f4e0763c027b
branch: demo/wikipedia
repository: TypeRoof
topic: "Layout sizing foundation: ClassesAndStylesManager, environment@ protocol, length models in type-stage"
tags: [plan, layouts, sizing, environment, protocol-handler, type-stage]
status: draft
research: thoughts/research/2026-08-22-1454-layout-sizing-strategy.md
---

# Layout Sizing Foundation — Implementation Plan

## Overview

Establish the foundation for reactive, environment-aware layout sizing: (0) a per-shell `ClassesAndStylesManager` owning `.typeroof-layout` styling, (1) an `environment@` protocol handler publishing screen/viewport/layout/dpr facts, (2) length-model `{value, unit}` model fields on type-stage–derived layouts, (3) type-stage pane consumers resolving specs against `environment@layout`, and (4) absorbing `StageDOMNode`'s inline host writes into the manager. Each phase is a small, reviewable change ending in a commit-stop (proposed message + file list; proceed only after user confirms with OKOK).

## Current State Analysis

- `.typeroof-layout` is static shell DOM (`lib/js/zones.typeroof.jsx:10`); styling today = global shell CSS + one inline writer (`stage.mjs:82`, overflow in letterbox zoom) + one global hack rule (`type-stage.css:201-209` display:flex for compare mode, with a TODO asking for exactly this manager).
- No environment size distribution exists; videoproof actors read `widgetBus.wrapper.host.offsetWidth/offsetHeight` directly (`videoproof-contextual/index.typeroof.jsx:281-289` — with `FIXME: got to do this via the properties system!`, `videoproof-array.mjs:1356`); `StageDOMNode` owns a private ResizeObserver (`stage.mjs:51-56`).
- Type-stage has no sizing model: editor/viewer panes size by CSS (`fit-content`, `min-height:100%`, `type-stage.css:5-11, 211-248`); compare mode = two widgets in zone `layout` split by global flex.
- Protocol handler machinery exists and fits: `SimpleProtocolHandler` (`basics/component.mjs:169-239`), installed per controller root (precedent `animationProperties@`, `motion-stage.mjs:2603-2605`), consumers declare `` `name@identifier` `` deps, updates merged into `changedMap` by `getChangedMapFromCompareResult` (`component.mjs:609-660`).
- WidgetBus-id discovery precedent: `IDRegistry` registered `{id: 'dom-global-id-registry'}` in all three shells (`main-ui.mjs:93`, `main-player.mjs:245`, `wikipedia/main.mjs:195`), looked up via `widgetBus.getWidgetById(...)` (`dom-helpers.mjs:23`).
- Tests: vitest (`npm run test`), jsdom via `// @vitest-environment jsdom` (see `lib/js/tests/type-stage-toggles/index.test.mjs` booting the real TypeStageController via `harness.mjs`), unit tests co-located (`*.test.mjs` next to sources).

### Key Discoveries (decisions from research conversation — authoritative)

- Environment values are **not** in the document model; distributed via `environment@` protocol handler. Keys: `screen`, `viewport`, `layout` (each `{width, height}`), `dpr` (number). All sizes css-px (= the browser's CSS px, device-pixels ÷ dpr; no physical anchoring). `dpr` is a stub for later use.
- `%` bases resolve against the **full host** / viewport / screen — never per-pane; compare mode sums to 200% → host scrolls.
- Type-stage boundness rule: width always bound; height may be unset (grow); both unset forbidden; coherence fn written for the general invariant (future: width unbound iff height bound).
- Migration default: width = 100% layout, height = empty.
- Motion-stage stays px-fixed; zoom is a separate display axis; videoproof = host-fill semantics (later: 100% specs).
- Document-internal properties (columnWidth etc.) don't touch environment sizes now; `environment@` must never encode the comparison layout (no per-pane keys).

## What We're NOT Doing

- No responsive motion-stage (px-fixed stays; zoom unchanged except host-style ownership in Phase 4).
- No migration of videoproof actors / StageDOMNode ResizeObserver to `environment@` (later plan; contextual single-row fix falls out of it).
- No safe-area keys, no media-query facts beyond dpr, no per-pane environment identifiers.
- No `MultipleLayoutsController` (chained layouts); `ClassesAndStylesManager` is designed for it (takes element as arg) but not built.
- No columnWidth or other document-internal relative units.

## Implementation Approach

Small phases, each independently committable and behavior-safe until its consumers land. Phases 0–1 are pure infrastructure (no behavior change), Phase 2 model-only, Phase 3 first visible change (type-stage panes sized by spec — visually near-identical due to migration default), Phase 4 ownership cleanup, Phase 5 small gap fix.

## Phase 0: `ClassesAndStylesManager`

### Overview
A `_BaseComponent` loaded as a regular shell widget, owning classes/inline-styles of a given DOM element, discoverable by widgetBus-id. Absorbs the global flex hack.

### Changes Required:

#### 1. New component
**File**: `lib/js/components/classes-and-styles-manager.mjs` (new)
**Changes**:
- `class ClassesAndStylesManager extends _BaseComponent`, constructor `(widgetBus, targetElement)`.
- API: `setClass/removeClass` (token set), `setStyleProperty/removeStyleProperty` (inline styles), `reset()` (removes everything it set — track own mutations internally; reset restores pristine state).
- No model dependencies; `UPDATE_STRATEGY_NO_UPDATE`-style (mutations via API only).
- Destroy: auto-reset (defensive; the contract is user-resets-on-destroy, but a destroyed manager must not leave residue).

#### 2. Register in all three shells
**Files**: `lib/js/components/main-ui.mjs`, `lib/js/main-player.mjs`, `lib/js/wikipedia/main.mjs`
**Changes**: widget entry `[{id: 'classes-and-styles-manager'}, [], ClassesAndStylesManager, zones.get('layout')]` next to the `IDRegistry` registration.

#### 3. Type-stage adopts it; scope the CSS
**Files**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`, `lib/css/shell/type-stage.css`
**Changes**:
- TypeStageController constructor: look up manager via `widgetBus.getWidgetById('classes-and-styles-manager', ...)`, `setClass('typeroof-layout--type-stage')`; destroy path calls `manager.reset()` (only its own use exists; reset is full).
- `type-stage.css:201-209` → `.typeroof-main > .typeroof-layout.typeroof-layout--type-stage { display:flex; }`; delete the TODO comment (now done).

### Success Criteria:

#### Automated Verification:
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass
- [ ] Unit test (new, `classes-and-styles-manager.test.mjs`, jsdom): behavior — set classes/styles, reset restores pristine element (no `class`/`style` residue); double-reset idempotent

#### Manual Verification:
- [ ] Editor shell: type-stage compare mode still shows editor|viewer side by side; motion-stage/videoproof/ramp unchanged

**Commit stop**: propose message (e.g. `Add ClassesAndStylesManager; scope type-stage layout flex rule`) + file list; wait for OKOK.

---

## Phase 1: `environment@` protocol handler + provider

### Overview
Per-shell protocol handler + provider widget publishing `screen`/`viewport`/`layout`/`dpr` with rAF-burst-batched updates. No consumers yet.

### Changes Required:

#### 1. Provider component
**File**: `lib/js/components/environment-provider.mjs` (new)
**Changes**:
- `class EnvironmentProvider extends _BaseComponent`, constructor `(widgetBus, layoutElement)`.
- On create: `SimpleProtocolHandler` registration of current values for `screen` (`window.screen.width/height`), `viewport` (`innerWidth/innerHeight`), `layout` (from ResizeObserver content-box), `dpr` (`devicePixelRatio`).
- Observers: ResizeObserver on layoutElement; `resize`+`orientationchange` listeners; dpr via `matchMedia('(resolution: Xdppx)')` re-subscription loop (query from current dpr; on fire: read new, mark dirty, re-subscribe).
- Event handlers only set dirty flags + schedule **one rAF flush**; flush reads all four fresh, diffs, calls handler `register/update` + `setUpdated` for changed keys.
- Flush triggers the app update cycle via the lightest root hook (pin during implementation: `widgetBus.rootWidgetBus`/shell `updateState` area, `shell.mjs:1078-1084`).
- Destroy: disconnect observer, remove listeners, cancel rAF, unregister.

#### 2. Install in shells
**Files**: `lib/js/components/main-ui.mjs`, `lib/js/main-player.mjs`, `lib/js/wikipedia/main.mjs`
**Changes**: `setProtocolHandlerImplementation(...SimpleProtocolHandler.create('environment@'))` at controller root; widget entry `[{id: 'environment-provider'}, [], EnvironmentProvider, zones.get('layout')]`; reset the handler's updated-log at the start of each update cycle (precedent `motion-stage.mjs:2703-2710`).

### Success Criteria:

#### Automated Verification:
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass
- [ ] Unit test (jsdom): initial values published on registration; simulated layout element resize → flush → updated-set contains `layout` with new values; dpr event path; destroy leaves no listeners

#### Manual Verification:
- [ ] Editor + player + wikipedia shells boot without errors (no consumers yet — purely additive)

**Commit stop**: propose message (e.g. `Add environment@ protocol handler and EnvironmentProvider`) + file list; wait for OKOK.

---

## Phase 2: Length model + type-stage fields

### Overview
`{value, unit}` length models (CSS `<length-percentage>`); `width`/`height` fields on `createTypeStageModelVariantWithDefaults` (+ Ramp mirror); coherence enforcing boundness; migration default width=100% layout, height=empty.

### Changes Required:

#### 1. Length models
**File**: `lib/js/components/length-model.mjs` (new) — or into `type-spec-models.mjs` if it fits there better (decide at implementation; check for existing types first per coding style)
**Changes**:
- `LengthUnitModel = _AbstractEnumModel.createClass('LengthUnitModel', ['px','pt','cm','mm','in','percent-screen','percent-viewport','percent-layout'], 'percent-layout')` (naming pinned at implementation; flat enum per decision).
- `LengthModel = _AbstractStructModel.createClass(...)` with `['value', _AbstractNumberModel...]`, `['unit', LengthUnitModel]` (both mandatory).
- Unset semantics: unit empty = unset (both fields OrEmpty; inner coherence keeps value in sync), because _AbstractSimpleOrEmptyModel only wraps scalars, not structs.

#### 2. Fields + coherence + defaults
**Files**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`, `lib/js/components/layouts/ramp/index.typeroof.jsx`, `lib/js/components/layouts/type-stage/defaults.mjs`
**Changes**:
- `['width', LengthModel]`, `['height', LengthModel]` in the factory (before the coherence fn arg).
- Coherence fn: enforce "width bound; height optional; both-unset forbidden" — written against the general invariant "≥1 length bound" (future rule admissible); apply migration default width `{value:100, unit:'percent-layout'}`, height empty when legacy docs lack the fields.
- Ramp mirrors the two fields.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass
- [ ] Unit test (behavior of the model): legacy doc (no fields) metamorphoses to width=100%layout/height=empty; width-empty+height-set valid; both-empty corrected by coherence

#### Manual Verification:
- [ ] Editor boots, type-stage documents load unchanged visually (no consumers yet — defaults only)

**Commit stop**: propose message (e.g. `Add length model and type-stage width/height fields`) + file list; wait for OKOK.

---

## Phase 3: Type-stage panes consume spec + `environment@layout`

### Overview
Shared `TypeStagePaneStyler` resolves width spec against `environment@layout` per pane (editor + viewer); height-empty via CSS `min-height:100%` (JS fallback if insufficient); visible overflow when height set.

### Changes Required:

#### 1. Resolution util
**File**: `lib/js/components/length-model.mjs` (same module as Phase 2)
**Changes**: `resolveLength(spec, environmentValues) → css-px number | null`; absolute units via CSS fixed ratios (96 px/in); `%`-bases read the named box; empty → null.

#### 2. Pane styler
**File**: `lib/js/components/layouts/type-stage/` (new `pane-styler` module or extend existing styler file — pin at implementation)
**Changes**:
- `TypeStagePaneStyler` (`_BaseComponent`), deps `['width','height','environment@layout']`, constructor arg = pane element.
- update: width → `pane.style.width = ${resolved}px`; height set → `style.height`; height empty → clear inline height (CSS `min-height:100%` on panes governs).
- Instantiated for editor host (`.ui_prosemirror_host`) and viewer root (`article.typeroof-document`) in `index.typeroof.jsx` widgets (replacing/augmenting current styling path; `ProseMirrorGeneralDocumentStyler` keeps background duties until Phase 5 merges).

#### 3. CSS adjustments
**File**: `lib/css/shell/type-stage.css`
**Changes**: remove `width: fit-content` from `.typeroof-document` (superseded by inline width); keep `min-height:100%` rules; keep the `display:table` hack. Verify editor pane behavior with bounded width.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass
- [ ] Unit test: `resolveLength` unit matrix (each unit, % against each box, empty)
- [ ] Harness behavior test (extend `lib/js/tests/` style): boot TypeStage with environment provider stubbed at `{layout:{width:800,height:600}}` → editor host style width 800px; set height `{50,%layout}` → height 400px; change stub to 400px → re-resolved

#### Manual Verification:
- [ ] Editor: type-stage editor/viewer/compare look correct; compare = both panes full-host wide → horizontal scroll; window resize re-flows panes
- [ ] Player + wikipedia: type-stage documents render bounded as expected

**Commit stop**: propose message (e.g. `Type-stage panes resolve width/height specs against environment@layout`) + file list; wait for OKOK.

---

## Phase 4: Absorb `StageDOMNode` host-style writes into the manager

### Overview
`stage.mjs:82` inline `overflow:hidden` on the host goes through `ClassesAndStylesManager` (widgetBus-id lookup); cleanup via reset on destroy/zoom-switch. Resolve D4 (player clip via static class vs dynamic) during implementation by visual check.

### Changes Required:

**Files**: `lib/js/components/actors/stage.mjs`, possibly `lib/css/shell/main.css`/`player.css`
**Changes**:
- `StageDOMNode` looks up `'classes-and-styles-manager'`; `_resizeFitToHost` → `manager.setStyleProperty('overflow','hidden')`; `_stopResizeFitToHost` → manager reset of its contribution (its only use → full reset acceptable).
- If D4 resolves to static: `.typeroof-layout--motion-stage { overflow:hidden }` in player.css instead, dynamic write removed (decision recorded at implementation).
- The private ResizeObserver stays (motion-stage px-fixed per decision; environment@ migration is a later plan).

### Success Criteria:

#### Automated Verification:
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass
- [ ] Unit/harness test: automatic zoom → host overflow hidden via manager; zoom switch away → pristine; layout destroy → no residue

#### Manual Verification:
- [ ] Player: `jump-cloud-tree.json` demo still letterbox-fits, no content outside stage, no scrollbars
- [ ] Editor motion-stage: automatic zoom behaves as before

**Commit stop**: propose message (e.g. `Route stage host overflow through ClassesAndStylesManager`) + file list; wait for OKOK.

---

## Phase 5: Viewer background via pane styler

### Overview
`TypeStagePaneStyler` also applies `${COLOR}backgroundColor` → `background-color` on the pane root (mirroring `ProseMirrorGeneralDocumentStyler`), closing the viewer gap.

### Changes Required:

**Files**: `lib/js/components/layouts/type-stage/` pane-styler module from Phase 3, `viewer.typeroof.jsx`
**Changes**: add backgroundColor mapping (pattern from `prosemirror.typeroof.jsx:20-53`); wire into viewer pane. Editor pane may adopt the shared styler for background too (DRY), retiring `ProseMirrorGeneralDocumentStyler` usage if cleanly replaceable.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` pass
- [ ] Harness behavior test: viewer pane root gets background-color from document backgroundColor; empty → none

#### Manual Verification:
- [ ] Viewer + compare mode: document background covers the pane incl. grown height; editor unchanged

**Commit stop**: propose message + file list; wait for OKOK.

---

## Testing Strategy

- **Unit tests** (co-located `*.test.mjs`, jsdom where DOM needed): ClassesAndStylesManager roundtrip; EnvironmentProvider publication/batching; resolveLength matrix; coherence/boundness.
- **Harness behavior tests** (`lib/js/tests/`, real controller boots per `type-stage-toggles` precedent): Phase 3 pane resolution end-to-end; Phase 5 background.
- Tests assert **behavior/observable DOM state**, not internal functions.

## Follow-up Plans (recorded, not this plan)

- Migrate videoproof actors + StageDOMNode ResizeObserver to `environment@` (fixes contextual single-row via degenerate-measurement guard).
- `MultipleLayoutsController` (chained layouts; per-layout containers each with own ClassesAndStylesManager).
- Safe-area/viewport-variant keys when needed; dpr consumers; document-internal relative units (columnWidth).

---

## Outcome (implemented 2026-08-22/23)

All phases landed on branch `demo/wikipedia`:

| Commit | Phase | Notes |
|---|---|---|
| `169eebc4` | 0: ClassesAndStylesManager | widgetBus-id lookup, reset-on-destroy contract; type-stage flex rule scoped |
| `01a9478b` | 1: environment@ + EnvironmentProvider | keys `screen`/`viewport`/`layout`/`dpr`, css-px, rAF-batched flush, dpr matchMedia loop; all three shells |
| `28f814a8` | 2: LengthModel + fields | renamed from DimensionSpec (decision in research doc); coherence via `ensureDimensionBoundnessCoherenceFn` shared type-stage/ramp |
| `b8c3bded` | 3: TypeStagePaneStyler | environment@ created with `treatAdressAsRootPath:false`; registered on the shell-owned root `protocolHandlers` map (root controller has no ComponentWrapper) |
| `bf5c403d` | 4: StageDOMNode overflow via manager | player clip is static CSS (`.wrapper.player .typeroof-layout--motion-stage`), editor dynamic via manager |
| `db054d65` | 5: viewer background + ramp unified | ProseMirrorGeneralDocumentStyler removed, both registrations superseded |
| `311cb9a5` | follow-up: flex fixes | `flex-shrink: 0` (compare widths) + `align-items: flex-start` (scroll-edge background; stretched flex items clamp to container height) |
| `7cabe635` | videoproof + dispatch machinery | array/contextual measure via `environment@layout` (kills the feedback loop: taller host → more rows → smaller cells); `.videoproof_layout` min-height + `:has(contextual)` height:100%; shell `_replaceState` falls through to dispatch on protocol-only updates (`hasUpdated()`); updated-log resets *after* the update pass (it is the relevance signal); contextual re-layouts on `environment@layout` (was gated behind animation deps) |

Notable deviations/discoveries vs the plan:

- **environment@ is path-less**: `treatAdressAsRootPath:false` — keys are literal identifiers, not model paths.
- **Root protocol installation**: on the shell-owned `widgetBus.protocolHandlers` map (`shell.mjs` passes `new Map()`); `Object.create(widgetBus)` inheritance carries it to all ComponentWrappers.
- **Protocol-only dispatch required two shell changes**: the identical-state early return in `_replaceState` *and* the EQUALS-only gate; plus reset-order (after the pass, not before).
- **Struct-typed coherence fns**: receive the struct instances; mutate via `field.get("unit").value = ...` (works; the AxesMath/StageZoom precedents mutate scalar fields the same way).
- First real `environment@` consumers: type-stage pane styler, videoproof array + contextual actors.

Still open (deferred): StageDOMNode's own ResizeObserver → `environment@` migration; MultipleLayoutsController; safe-area keys; columnWidth relatives; the wikipedia shell's `.typeroof-layout` pinning (100vw/100vh) review.
