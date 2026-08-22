---
date: 2026-08-22T14:54:24+02:00
git_commit: b87f753c05f34700eb5a0d880b86f4e0763c027b
branch: demo/wikipedia
repository: TypeRoof
topic: "Unified layout sizing strategy — current state of stage sizing, backgrounds, and container styling across layouts"
tags: [research, codebase, layouts, sizing, stage, background, resize, dependency-injection]
status: complete
---

# Research: Unified layout sizing strategy — current state

## Research Question

Unify the behavior of all layouts regarding their sizing strategy (foundation for a future central resize listener injecting viewport/host sizes as document dependencies). Establish what "fill available space appropriately" means per layout, and document the current hurdles:

- type-stage–derived layouts can have two elements in `.typeroof-layout` (side-by-side/compare); both must color AND cover their own content; the viewer doesn't apply the background color.
- videoproof actors measure available space to size contents; contextual degrades to a single row.
- player/motion-stage must not show content outside the stage; stage has explicit size, so needn't cover the container.
- The container (`.typeroof-layout`) style is already being mutated by code (`overflow: hidden`).

This document describes what exists today, not what should be built.

## Summary

- `.typeroof-layout` is static shell DOM (`lib/js/zones.typeroof.jsx:10`), mounted as zone `"layout"`. **No central widget owns its styling**; today its appearance is a mix of global shell CSS and ad-hoc inline-style writes.
- The **only inline-style writes on the host** come from `StageDOMNode` in the motion-stage layout: `overflow: hidden` in automatic-zoom fit mode (`lib/js/components/actors/stage.mjs:82`), removed at `stage.mjs:64`.
- **Five distinct sizing regimes** coexist: motion-stage (explicit px stage + zoom/fit-to-host), type-stage/ramp (pure CSS, `fit-content`, flex side-by-side via a global rule), videoproof actors (read `host.offsetWidth/offsetHeight` each update, px→pt × 0.75), viewer/player shells (CSS `100vw/100vh` absolute). There is no shared abstraction.
- Background color is applied in **different places per layout**: motion-stage colors `.motion_stage-layer-top`; videoproof colors the actor container + layout container; type-stage colors the ProseMirror host; **the type-stage viewer (`article.typeroof-document`) has no document-level background styler at all** (confirmed gap).
- The contextual videoproof "single row" bug is a math clamp: `linesPerPage = Math.max(1, floor(availableHeightPt / (fontSizePt*lineHeightEm)))` (`videoproof-contextual/layout.mjs:187-192`) — a zero/shrunken host measurement clamps to 1 line.
- The dependency machinery for a future size-injection widget already exists in the exact shape needed: `AnimationTGenerator` writes `t` into the model per rAF (`animation-t-generator.mjs:125`); a resize observer writing `width`/`height`-style entries would follow the same pattern. Registered properties `width`/`height` already exist (`registered-properties.mjs:64-65`). `MainUIController` owns zones + layout lifecycle (`main-ui.mjs:76-186`) and is the natural host for a central layout-style widget.
- A TODO matching the user's "central widget manages classes/styles, reset on destroy" idea **already exists as a code comment**: `lib/css/shell/type-stage.css:202-207`.

## Detailed Findings

### 1. Shell structure, zones, and container CSS

- DOM skeleton: `.wrapper > .typeroof-main > (.typeroof-layout-before, .typeroof-layout, .typeroof-layout-after)` — `lib/js/zones.typeroof.jsx:1-16`; zone map at `:18-33`.
- Every CSS rule touching the container:
  - `lib/css/shell/layout.css:21-27` — `.typeroof-main { grid-area: main; display:flex; flex-direction:column; overflow-y:auto }`.
  - `lib/css/shell/layout.css:36-44` — `.typeroof-main > .typeroof-layout { overflow:auto; flex-grow:1; overscroll-behavior-x:contain }` (editor default: scrollable flex child).
  - `lib/css/shell/type-stage.css:201-209` — `.typeroof-main > .typeroof-layout { display:flex }` (global, unscoped; enables side-by-side; comment at :202-207 literally proposes the class/styles-manager-with-reset idea as a TODO).
  - `lib/css/shell/player.css:35-42` — `.typeroof-layout { position:absolute; z-index:1; top:0; left:0; width:100vw; height:100vh }`; `player.css:8-25` `:root { overflow:hidden; --gap-size:0 }`.
  - `lib/css/shell/wikipedia.css:20-27` — same absolute full-viewport treatment as player.
  - `lib/css/shell/docs.css:89-92` — `.typeroof-main { overflow:auto; container-type: inline-size }`.
  - `lib/css/shell/main.css:1973` — `.typeroof-layout` included in the Meyer-reset selector.
  - `lib/css/shell/main.css:1174-1183` — `.typeroof-layout > .actor_renderer-videoproof_array_v2 { padding-top: var(--gap-size); min-height: calc(100% - var(--gap-size)) }`.

### 2. Motion-stage (player & editor)

- `StageDOMNode` (`lib/js/components/actors/stage.mjs:18`):
  - Zoom types enum `['app-default','custom','25%','50%','75%','100%','150%','200%','automatic']` (`motion-stage.mjs:173-175`); `'app-default'` coerced to `'automatic'` only when the layout passes `automaticZoomDefault=true` (`stage.mjs:30-33`).
  - `'automatic'` → `ResizeObserver` on `widgetBus.wrapper.host` (`stage.mjs:51-56`); `_resizeFitToHost` (`stage.mjs:70-86`) letterbox-fits and sets **`host.style overflow:hidden` (:82)** + transform on the stage node. `_stopResizeFitToHost` (`:59-68`) removes the styles; `destroy()` (:129) calls it.
  - Non-automatic zoom → `transform: scale()` on the stage node (`:36-47`).
  - Stage explicit size: `MotionStageModel` fields `width`/`height` (`motion-stage.mjs:263-264`, `StageSizeNumberModel` default 720 at :160-170, coherence default at :215-228), applied as px inline styles (`stage.mjs:140-146`).
- `StageHTML` (`motion-stage.mjs:496-563`): builds `containerElement` (classes `motion_stage`, `motion_stage-wrapper`) + `topLayerElement` (`motion_stage-layer-top`); remaps zones so `'parent-layer'` = `widgetBus.wrapper.host` = `.typeroof-layout` (:508).
- Two controllers: editor `MotionStageController` mounts StageHTML with `automaticZoomDefault=false` (:2652-2656); player `MotionStagePlayerController` with `true` (:2753-2757). Player registered via `main-player.mjs:32`; editor via `main-ui.mjs:29`.
- Stage background: `stageBackgroundColor` (actor model field `actors/models.mjs:165`; registered default opaque white `registered-properties.mjs:107-112`) applied via `actorApplyCSSColors` to **`.motion_stage-layer-top`** (`stage.mjs:160-165`) — not the host, not the `.motion_stage` container (which keeps the transparency checkerboard `::before`, `main.css:228-239`).
- Requirement "player must not show content outside the stage" is currently served by `overflow:hidden` on host (inline, :82) + `.motion_stage-wrapper { position:relative; overflow:hidden }` (`main.css:223-226`).

### 3. Type-stage–derived layouts (TypeStage, Ramp, Viewer)

- Modules: `layouts/type-stage/index.typeroof.jsx` (base, exports at :628) and `layouts/ramp/index.typeroof.jsx` (imports type-stage pieces, no class inheritance, :27-41). Registered: editor `main-ui.mjs:67-68`; player registers **TypeStage only** (`main-player.mjs:56`).
- **No explicit sizing model**: pure CSS. Editor half `<div class="ui_prosemirror_host external_source">` (`index.typeroof.jsx:219-221`); viewer half `<article class="typeroof-document">` (`viewer.typeroof.jsx:1144-1157`) — both mounted into zone `"layout"` (`index.typeroof.jsx:425-496`).
- `.typeroof-document { height:fit-content; width:fit-content; ... }` (`type-stage.css:211-233`); `.ui_prosemirror_host, .typeroof-document { min-height:100% }` (`type-stage.css:5-11`); optional `generic/columnWidth` → pt width (`prosemirror/type-spec.typeroof.jsx:242-259`).
- **Side-by-side ("compare") mode**: `DocumentRendererModeModel` enum `["editor","viewer","compare"]` (`components/document-renderer-mode/model.mjs:5-9`); activationTests in `index.typeroof.jsx:425-496`. Split is done **only** by the global flex rule `type-stage.css:201-209`; children size by content (no width percentages, no inline split). Ramp has no viewer → no side-by-side.
- Background color:
  - Editor: `ProseMirrorGeneralDocumentStyler` applies `${COLOR}backgroundColor` → `background-color` on the PM host (`type-stage/prosemirror.typeroof.jsx:20-53`, used at :129 and :192).
  - Viewer per-node: `UIDocumentTypeSpecStyler` maps `backgroundColor` → each node's outerElement (`prosemirror/type-spec.typeroof.jsx:323-339`).
  - **Viewer gap confirmed**: `UIDocumentViewer` constructor (`viewer.typeroof.jsx:1144-1184`) has no document-level styler on the `<article>`; zero `backgroundColor` references in `viewer.typeroof.jsx`. Root background is painted in the editor pane but never on the viewer container.

### 4. Videoproof layout & actors

- Layout `layouts/videoproof.typeroof.jsx` restricts actors to `VideoproofArrayV2ActorModel` + `VideoproofContextualActorModel` (:116-129); actors registered in `components/actors/available-actors.mjs:33-59`.
- **Space measurement — all read the host directly, no ResizeObserver anywhere in videoproof:**
  - Contextual: `_getAvailableDimensions()` reads `widgetBus.wrapper.host.offsetWidth/offsetHeight × 0.75` (px→pt) (`videoproof-contextual/index.typeroof.jsx:281-289`, with `// FIXME: got to do this via the properties system!` at :280). [Migration goal (decided): all `host.offsetWidth/offsetHeight` reads disappear; sizes flow through the `environment@` protocol handler as the clear in-app/in-graph source of truth — see Decisions.] Model width/height entries explicitly disabled (:557-563). Relayout keyed on `[widthPt, heightPt, gapEm, lineHeightEm, cellsStateKey]` (:291-353) — only re-runs on animation frames when the key changes.
  - Array V2: same host read at `videoproof-array.mjs:1356` (comment: "should/must update on resize. It currently updates when the animation runs"). Grid math in `_getGridFontSize` (:1184-1287) iterates candidate row counts, fits by limiting dimension, emits `--font-size-pt` etc. consumed by `main.css:1185-1188`.
- **"Single row" mechanism**: `computeFontSizeAndLayout` (`videoproof-contextual/layout.mjs:142-199`) ends with `linesPerPage = Math.max(1, Math.floor(availableHeightPt / (fontSizePt*lineHeightEm)))` (:187-192). If the host measures ~0 (resize/hidden phase) or shrinks, the floor yields 0 → clamped to 1 line/page; similarly `availableWidthPt ≈ 0` makes every word its own line.
- Background color: V2 actor applies `stageBackgroundColor` → `--background-color` on its element (`videoproof-array.mjs:1403-1406`); contextual maps `--background-color`/`--cell-background-color`/`color` (`index.typeroof.jsx:576-579`, consumed `main.css:1019,1030-1033`); layout-level `VideoproofContainerStyler` (`videoproof.typeroof.jsx:1905-1941`) sets `background-color` on the layout container + a `--layout-specific-override-...` hack (see also :1571-1634 label contrast logic and `main.css:1015-1018`).
- Videoproof writes **no inline styles** on `.typeroof-layout`/`host` (host used read-only).

### 5. Dependency-injection & lifecycle machinery (foundation for the future resize-injection)

- Widget dependency lists (`['width','height','zoomLevel',['t','globalT'],'animationProperties@']`) are resolved by `ComponentWrapper.absPathDependencies` (`lib/js/components/basics/component.mjs:416-493`); change propagation via `StateComparison`/`changedMap` (`component.mjs:609-660, 1179-1273`).
- **Canonical environment-injection precedent**: `AnimationTGenerator` (`lib/js/components/animation-t-generator.mjs:81`) is a widget that rAF-writes `t` **into the model** via `changeState` (:125) and declares model deps `['t','duration','playing','perpetual']`. A `ResizeObserver`→`changeState(hostWidth/hostHeight)` widget is structurally identical.
- Registered properties `width`/`height` already exist under `[NUMERIC]` (`registered-properties.mjs:63-65`) — but today they are document-owned (motion-stage stage size), not environment-owned.
- Protocol handlers (`animationProperties@`): `SimpleProtocolHandler` (`component.mjs:169-239`), installed per controller root (`motion-stage.mjs:2603-2605`, :2713-2716).
- Lifecycle: `ShellController._initUI` (`lib/js/shell.mjs:1073-1074`) creates the root widgetBus; `MainUIController` (`components/main-ui.mjs:76-186`) owns the zones and registers one widget per layout with `activationTest` on `activeState.WrappedType` (:143-167); layout switching destroys/creates controllers via `_BaseContainerComponent._provisionWidgets` (`component.mjs:1287-1324`). `MainUIController` is the only existing component that outlives layout switches and owns the zones — the natural place for a central layout-style/size widget.

## Code References

- `lib/js/zones.typeroof.jsx:10` — `.typeroof-layout` element; zone map :18-33
- `lib/js/components/actors/stage.mjs:82` — the only inline `overflow:hidden` write on the host; removal :64; ResizeObserver :51-56
- `lib/js/components/layouts/motion-stage.mjs:496-563` — StageHTML zone remap; controllers :2599/:2726; model width/height :263-265
- `lib/css/shell/layout.css:36-44` — editor default container rule (overflow:auto)
- `lib/css/shell/type-stage.css:201-209` — global flex for side-by-side + central-widget TODO comment
- `lib/css/shell/player.css:35-42` / `wikipedia.css:20-27` — full-viewport container
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:1144-1184` — UIDocumentViewer, missing document-level background styler
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:323-339` — per-node viewer background
- `lib/js/components/layouts/type-stage/prosemirror.typeroof.jsx:20-53` — editor background styler
- `lib/js/components/actors/videoproof-contextual/index.typeroof.jsx:281-289` — host measurement + FIXME; layout clamp at `layout.mjs:187-192`
- `lib/js/components/actors/videoproof-array.mjs:1356-1360` — host measurement; grid fit :1184-1287
- `lib/js/components/layouts/videoproof.typeroof.jsx:1905-1941` — VideoproofContainerStyler
- `lib/js/components/animation-t-generator.mjs:81-125` — precedent for env→model injection
- `lib/js/components/basics/component.mjs:416-493` — dependency resolution; :1287-1324 layout lifecycle; :169-239 protocol handlers
- `lib/js/components/main-ui.mjs:76-186` — MainUIController owns zones/layout switching
- `lib/js/components/registered-properties.mjs:63-65` — existing `width`/`height`/`t` registered properties

## Decisions (from follow-up conversation)

1. **Environment sizes are NOT stored in the document model.** Distribution via an `environment@`-style protocol handler (same channel as `animationProperties@`; `SimpleProtocolHandler`, `component.mjs:169-239`). Canonical internal unit = css-px. Naming decision: **`environment@`, not `hostSize@`** — general enough to also internalize viewport size, DPR, prefers-reduced-motion, color scheme, etc. into the metamodel DAG as declared dependencies. Rationale: the state is described by a metamodel that is a DAG driving the application; `environment@` internalizes dependencies on the external environment into that graph (this is the "graph" sense — not the gortex code graph).
2. **One struct shape for length specs:** `{value, unit}` (after `MarginUnitModel` precedent, `type-spec-models.mjs:112-144`), both mandatory, no inheritance gymnastics. Absolute units resolve without environment; relative units consume `environment@`. **Naming (decided 2026-08-23):** "Length" after CSS `<length-percentage>` — NOT "Dimension" (overloaded by grid/axes usage in the codebase), NOT "Size" (reads as a width+height box, cf. `StageSizeNumberModel`), and no "Spec" suffix (every model is a spec; precedents: `TypeSpecModel`, `MarginValueModel`, `StageZoomLevelModel`). Final: `LengthModel` / `LengthUnitModel` / `LengthValueModel` + `lengthIsSet`/`resolveLength`, module `lib/js/components/length-model.mjs`.
3. **Pilot: `width`/`height` spec fields added in `createTypeStageModelVariantWithDefaults`** (`type-stage/index.typeroof.jsx:129-181`) — covers TypeStage, the test harness, and the Wikipedia variant; Ramp mirrors.
4. **Unit bases resolve against the FULL host element (`.typeroof-layout`) or the browser viewport — never per-pane.** In compare mode, editor + viewer each resolve against the full host; 2×100% means sum = 200% and the host scrolls horizontally (existing `overflow:auto` behavior, `layout.css:36-44`). No split ratio in the model, no per-pane percentage bases. Meanings must not shift when switching modes.
5. **Migration over legacy behavior:** no legacy `fit-content` fallback — all type-stage documents move to the explicit spec.
6. **Explicit vs. implicit sizing semantics:**
   - Unset size (e.g. no `height` set) → dimension implicitly **grows to fit content**, so the document surface always covers its content (ties to the background-color task: color must cover the grown surface).
   - Set size → definite box; overflow is visible (`overflow: visible` effect), clearly distinguishing "document box" from "host box".
   - **Boundness rule per dimension (type-stage, current): width MUST be set to a bound value; height MAY be unset (then it grows).** Both unset is **not an option** — enforced by a **coherence function** (precedent: the width/height defaulting coherence in `motion-stage.mjs:215-228`; the spec struct's coherence must guarantee: width set ∧ (height set ∨ unset)).
   - **Future relaxation (recorded, not implemented):** width may be unbound *only if* height is set; both-unset remains never valid. The coherence function must already be written to enforce the general invariant "at least one dimension bound" so the future rule is admissible without model migration.
7. **Zoom and size are distinct, and motion-stage stays fixed pixel-size for now.** Zoom is display-scaling; the dimension-spec system is document-sizing. Responsive motion-stage "videos" are a future possibility, but that would require all downstream units inside the stage coordinate system to catch up (everything inside measures in stage px, e.g. `VideoproofArrayV2` fits fonts in pt derived from a px stage) — explicitly out of scope. **So motion-stage keeps its fixed pixel width/height model** (`MotionStageModel` fields, `motion-stage.mjs:263-265`) and does not adopt the spec units now.
8. **Videoproof is derived from motion-stage but has different semantics.** It imports its animation machinery from motion-stage (`initAnimanion`, `UITimeControl`, `videoproof.typeroof.jsx:95`) and similarly renders animanion-based actors into the layout zone — **but** its model has no explicit stage size: "a default motion-stage configuration can do what I need" (comment, `videoproof.typeroof.jsx:957`). Its actors are **host-fill by design** (array/contextual measure the full host and fit content into it, unlike a fixed-size motion stage), and its stage background colors the *host-filling container*, not a letterboxed stage layer. Implication: when the dimension-spec system exists, videoproof's correct expression is `width: 100%host, height: 100%host` (or unset/grow for height) — i.e. it becomes the natural second consumer of the spec system after type-stage; motion-stage itself may stay px-fixed.
8a. **Document-internal readers MAY consume `environment@`; the boundary that must not leak is the comparison layout itself:** `environment@`'s keys always describe the *whole* shell box (`layout` = full `.typeroof-layout`) — side-by-side panes (2× width in compare mode) are a *document-driven use of* the host space, not a property *of* the environment. Therefore: (1) environment units stay comparison-agnostic; (2) any document-internal reader of `environment@` (e.g. a future relative `columnWidth`) gets the same comparison-agnostic values; (3) per-pane identifiers remain rejected — not because readers can't see the environment, but because the environment has no panes. The pane split (and its 200% overflow) is expressed by the surface spec fields + CSS, never by environment values.

8b. **App coverage for `environment@`:** the protocol must be installed in **both shells that host layouts** — the editor shell (`main-ui.mjs`, `MainUIController`) **and `app/player`** (`main-player.mjs` / `MotionStagePlayerController` chain) — so player-mode layouts receive the same keys. Central mount point: each shell's root UI controller (the component that owns `createAndGetDefaultZones`); do NOT rely on per-layout controllers installing it, else player-only shells (player, wikipedia) would lack the provider.

8b. **Ramp + Wikipedia variant (confirmed):** Ramp inherits the width/height spec fields (single pane, full host). The Wikipedia variant (`wikipedia/main.mjs:38`, using the same factory) follows type-stage rules; its shell just additionally pins `.typeroof-layout` to 100vw/100vh (`wikipedia.css:20-27`). `screen`, `viewport`, `layout`, plus `dpr` from day one. `screen` = the physical screen (`window.screen.width/height`, e.g. for fullscreen/kiosk scenarios); `viewport` = browser viewport (`window.innerWidth/innerHeight`); `layout` = the `.typeroof-layout` host element box. All three publish **css-pixels** (`devicePixelRatio` does not apply; css-px is canonical). `dpr` publishes the *device* pixel ratio (`window.devicePixelRatio`) — carefully kept separate from the size keys because impera combining "sizes are css-px" with "dpr exists" otherwise invites confusion: css-px × dpr = physical device px. Since percentages resolve against the full host (decision 4), a single `layout` key covers compare mode; per-pane identifiers remain unnecessary.
   - Value shape per key: `{width, height}` for `screen`/`viewport`/`layout`; a number for `dpr`. (Shape detail, open for implementation.)
   - Publication rhythm (confirmed): provider publishes on resize / orientationchange / dpr-change. **dpr must notify on every change** (browser zoom, monitor-move between densities, orientation) — implemented via the `matchMedia('(resolution: Xdppx)')` re-subscription loop (query built from current dpr; on fire: read new value, publish, re-subscribe) plus `resize`/`orientationchange` as secondary triggers.
   - **Burst batching (decided):** environment events arrive in bursts (monitor move fires resize + orientation + dpr together). Provider handlers only mark keys dirty and schedule **one rAF flush** (not a timed debounce — no added latency, no risk of missing settled state). Flush reads all values fresh, diffs against cache, marks changed keys once. Flush must trigger the app update cycle via the lightest available root hook (`shell.mjs:1078-1084` updateState/withChangeState area) — mechanism pinned during implementation. Continuous resize publishes per frame; consumers rely on `changedMap` relevance filtering as usual.
   - Shell coverage (confirmed): provider + protocol installed in editor (`main-ui.mjs`), player (`main-player.mjs`), and wikipedia (`wikipedia/main.mjs`) shells — same for Phase 0's ClassesAndStylesManager.
   - **Migration default for existing type-stage documents (decided):** width = 100% layout, height = empty (grows). Matches the viewer's effective current behavior (full-width pane, content height); makes the editor pane bounded — the intended semantic change.
   - **css-px semantics (corrected):** css-px = the browser's own CSS pixel (device-pixels ÷ dpr, whatever the browser computes) — NOT anchored to any physical size by us. Setting `style.width = ${layout.width}px` yields exactly the measured box. Absolute units (`pt`, `cm`, `mm`, `in`) convert to css-px via CSS's fixed ratios (96 px/in) for JS-side math; where possible pass CSS strings through and let the browser resolve. `dpr` is a propagation **stub for later use**, not part of sizing math now.
     - *Fit document to device* → `%` of `viewport`; **`layout ≈ viewport`** in player/full-viewport shells (`player.css` sets the host to 100vw/100vh), so for the player the two are interchangeable and `layout` (always available, even in embedded/iframed shells) is the more semantic base.
     - *Physical sizes* → absolute units (`mm`, `cm`, `in`) resolve at CSS's fixed 96 px/in — sufficient for portably similar rendering; on high-dpr phones the result is slightly physically wrong (css-px is angular, phones are held closer) — acceptable, allows following the CSS convention rather than inventing our own.
     - *Readable-type rules* ("never render below N device-px") → `dpr` covers it.
     - *Safe-area* (notches, dynamic toolbars: dvh/svh/lvh in CSS) → **alternative measure** of the same viewport box plus inset edges; **not an additional unit** — add as future keys (e.g. `viewportSafe` + inset edges) only when a consumer needs it.
     - *Orientation* → derivable from `viewport` width vs height; no key needed.
     Conclusion: no new units needed for mobile; `screen`/`viewport`/`layout`/`dpr` suffice. Remaining caveat is the absolute-unit pixel-definition (92% of… nothing, it's CSS's 96dpi), confirmed acceptable.

### Threads (as named in conversation)

| # | Thread | Status |
|---|--------|--------|
| 3 | Per-layout "appropriate" matrix (design decisions for all layouts) | **nearly complete** — decisions 4, 5, 6, 7 define it for type-stage (edit/view/compare incl. 200% overflow rule), motion-stage (px-fixed + separate zoom), videoproof (host-fill → `100%` specs). Remaining: formal matrix confirmation; the per-pane measurement nuance in compare mode. |
| 5 | Size injection via `environment@` protocol handler (end goal) | **SOUNDLY SPECIFIED — concluded. Initial keys `screen`/`viewport`/`layout`/`dpr`, css-px everywhere, no new units needed for mobile. Future: safe-area keys. Implementation not planned yet.** |
| 2 | Length `{value, unit}` shape (named `LengthModel`, decision 2) + pilot in `createTypeStageModelVariantWithDefaults` | specified (decisions 2, 3) |
| 1 | Unified container styling (central widget vs scoped CSS; absorb `stage.mjs:82` inline write) | open |
| - | Viewer background gap (`UIDocumentViewer` document-level styler) | open, small |
| 4 | Videoproof contextual single-row | deferred — expected to fall out of environment@ + guard (host ~0×0) |

**Execution direction so far:** matrix → container-style widget → environment@ provider → consumers migrate (contextual falls out) → viewer background fix anywhere along the way.

### Thread 4 decisions — container styling (from conversation)

- **D1 (mechanism) — hybrid, minimal core:** a central **LayoutContainerController** (one per shell root `MainUIController`; editor + player + wikipedia) that owns `.typeroof-layout` and:
  1. **centrally sets exactly one class for the currently active layout** (class derived from the layout registry key; set on activation, removed on destroy — absorbing the global `type-stage.css:201-209` hack into `.typeroof-layout--<key> { ... }` rules);
  2. exposes a **small dynamic API** (`setStyle`/`setClass`-like + reset) for runtime-conditional cases (e.g. the zoom-driven `overflow:hidden` from `stage.mjs:82`). The custom-class part of the API also allows behavior changes without new CSS plumbing — API is "nice to have" but part of the design.
- **Per-layout container refinement (replaces stack-scoping):** the LayoutContainerController **creates a container element per layout** and attaches the class/styles to *that* container, not directly to `.typeroof-layout`. Chained layouts then nest naturally — each wrapped layout gets its own styled container; destroy of one layout only ever tears down its own container. `.typeroof-layout` itself becomes a pure shell-owned box (shell CSS only; no layout-specific state on it at all). Zone wiring: the controller is the widget holding the `"layout"` zone; its per-layout containers become the zone targets handed to layout controllers (zone map remap: `new Map([...zones, ['layout', perLayoutContainer]])` — same remap pattern as `StageHTML` in `motion-stage.mjs:508`). Applies uniformly in editor/player/wikipedia shells.
- **Consequence for `environment@`:** `layout` key = the `.typeroof-layout` box (full host, per decision 4). Per-layout-container sizes are *not* published initially — they equal `layout` except where CSS constrains them (e.g. compare flex). Add per-container keys only when a concrete consumer needs them.
- **D2 (placement):** sibling of the future `environment@` ResizeObserver provider, both mounted at the **top-level shell MainUIController** (editor shell and player shell independently; `wikipedia/main.mjs` too). The container-style controller itself does **not** contain the ResizeObserver — strict separation of concerns (style manager vs. environment publisher).
- **Access & ownership model (corrected):** the manager is a `_BaseComponent` loaded as a regular widget in `MainUIController`, constructed with the layout-zone element as arg. It is **NOT passed to layout controllers** via constructor/registry wiring. Instead it is discoverable **by widgetBus-id** — registered with `{id: ...}` in the shell's widget array and looked up via `widgetBus.getWidgetById(...)` (existing precedent: `IDRegistry` as `'dom-global-id-registry'`, `main-ui.mjs:93`, `main-player.mjs:245`, `wikipedia/main.mjs:195`; lookup pattern at `dom-helpers.mjs:23`). Contract: any layout controller that uses it **must reset it** on its own destroy (user-owned reset; the manager does not track contributors).
- **D3 (overflow precedence, explicit three tiers):** shell CSS base (e.g. editor `overflow:auto`, `layout.css:36-44`) → layout class overrides (e.g. `.typeroof-layout--motion-stage { overflow:hidden }` if we go that way) → dynamic API writes last (zoom-driven). This ordering must be documented in the component and in the CSS comments.
- **D4 (player clipping) — deferred:** whether the player's clip guarantee moves from the inline `overflow:hidden` write into a static layout class (and whether `.motion_stage-wrapper { overflow:hidden }`, `main.css:223-226`, is visually sufficient) is left open until implementation; classes are expected to "help a lot", dynamic API remains available if needed.

## Open Questions (to settle before planning)

1. **Definition of "appropriate" per layout** — proposed reading of the current code:
   - motion-stage editor: host scrolls (`overflow:auto`), stage keeps explicit size → container *adapts to* stage, not vice versa.
   - motion-stage player: host = viewport, stage letterbox-fits, host must clip (`overflow:hidden`).
   - type-stage editor/viewer/compare: host is a measured flex box; each pane covers ≥ full height (`min-height:100%`) and colors itself; background should cover the *pane*, not the container.
   - videoproof: host = measurement source; actors expect host size = usable space; container background should fill the whole host even when content is smaller.
   Confirm/correct this matrix per layout.
2. **Where should the container's own background live** when the stage doesn't cover it (motion-stage letterbox bars, videoproof short content)? Today: nowhere (host is transparent; `.typeroof-main` background shows through).
3. **Viewer background fix**: add a document-level styler to `UIDocumentViewer` mirroring `ProseMirrorGeneralDocumentStyler`, or generalize the styler to serve both panes?
4. **Interim step vs. end goal**: is a small `LayoutStyleManager`-style widget (mounted by `MainUIController`, API: set/reset classes+inline styles on `.typeroof-layout`) wanted now — matching the existing TODO comment — or are scoped CSS classes per layout (e.g. `.typeroof-layout--motion-stage`) enough for the first unification pass?
5. **Contextual single-row**: should the fix be part of this work (guard against degenerate measurements / subscribe to real resize events) or deferred to the central-size-injection milestone?
6. `StageDOMNode`'s inline `overflow:hidden` on the host conflicts with the editor's `overflow:auto` default — is automatic-zoom ever active in the editor shell (it sets `automaticZoomDefault=false`, but a user can still pick 'automatic' in the zoom enum)?
