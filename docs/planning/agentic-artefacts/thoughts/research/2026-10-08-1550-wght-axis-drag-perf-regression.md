---
date: 2026-10-08T15:52:56+02:00
git_commit: 67f3ce9f6e48feca879cb2ff137d11ac3e168d5a
git_base: 90f02e62eefa0c36204c6460b8f334446fecf96e (fontbureau/main)
branch: feature/composition-and-justification
repository: TypeRoof
topic: "wght axis-drag lag in type-stage: composition demand outlives 'Compose Text in Editor' OFF"
tags: [research, codebase, performance, type-stage, text-composition, prosemirror, variable-fonts]
status: complete
---

# Research: wght axis-drag performance regression (branch vs fontbureau/main)

## Research Question

Operator repro: load the app, default "type-stage" layout with default
state; turn OFF "Compose Text in Editor"; in the origin typeSpec open
"Typeface and Size" → "Variable Font Axes", enable "wght" and drag the
slider. Noticeable lag; on fontbureau/main it is buttery smooth. With the
editor composition disabled there should be no degradation; with an
algorithm of "None (Browser)" there should be no impact either; ideally
active composition should also get cheaper.

## Summary

**CORRECTED 2026-10-08 (operator challenge, verified — see
"Verification addendum" at the end): in the operator's exact repro the
composition pipeline is COLD, not hot.** The default state has no
`documentRendererMode`, which defaults to `"editor"`
(`document-renderer-mode/model.mjs:11-13`, wired at
`index.typeroof.jsx:334-337`); the viewer widget tree is never
constructed (activationTest `showViewerActivationTest`,
`index.typeroof.jsx:373-379`, destroy/create semantics at
`component.mjs:1287-1330`), so nothing subscribes, `_hasDemand` is
false for every textblock, and `_composeCurrent` bails before any
segmentation, shaping or algorithm work
(`composition-controller.ts:385-387, :416-419`). This is enforced by a
behavior test (`lib/js/tests/text-composition/index.test.mjs:215-248`:
switching to "editor" mode drops publications to 0 and an edit keeps
them at 0). With "Compose Text in Editor" OFF, the editor plugin is
absent too — **zero composition demand anywhere in the repro.**

The lag in the repro therefore comes from the **unconditional per-tick
overheads** the branch adds to every state-change cycle, not from the
composition pipeline. Ranked for the repro scenario (default document):

1. **Hyphenation language walk once per tick** — operator-verified as
   a big improvement when returning early unconditionally.
   `requireHyphenationPatternsCoherenceFn` runs the full recursive
   TypeSpec-tree + style-patch walk whenever `typeSpec` is a draft
   (every axis edit is; `index.typeroof.jsx:235-275`). CORRECTED
   (2026-10-08, second operator challenge): steady-state changes go
   **sync-first** (`_updateState` → `_syncMetamorphoseState`,
   `shell.mjs:1628-1647`) and the async double-pass only happens on
   initial load (`_initState`, `shell.mjs:942-952`), on font
   install/review (`_requireReviewResourcesFlag`, `shell.mjs:615,
   :1057, :1170`), or when the sync pass raises a deliberate
   ResourceResolve error (`shell.mjs:1642-1666`). A wght tick hits none
   of these → the walk runs **once** per tick, and there is no ×2
   coherence multiplier in steady state. Languages don't change on an
   axis move — the walk's result is identical every tick.
2. **`_driveComposition` ×2 per textblock per UI update cycle, even
   with zero demand** — fires on element update AND scope settle
   (`document-nodes-meta/index.mjs:809-880`), each building a
   `_compositionSource()` (~3 root-depth `getEntry` walks + string join
   + allocations) that is discarded at the gate. The whole-document
   scope cascade (all 11 TypeSpec scopes + 10 document-node scopes +
   ~44 patched style-link scopes rebuild per origin-typeSpec tick —
   mechanism pre-existing on main) makes this fire per textblock per
   tick.
3. **+2 property generators per TypeSpec scope build**
   (`properties-generators.mjs:48-120, :664-665`; ~77 model gets/tick),
   **+2 struct fields on TypeSpecModel** (`type-spec/models.mjs:497-501`,
   one a dynamic struct), **+2 registered generic properties**
   (`registered-properties.mjs:419-433`) — axis-independent constants.
4. On main, an axis tick costs the (pre-existing, unchanged) scope
   cascade + PM styler + viewer render — items 1–3 are the branch's
   net-new delta.

**What only applies to `viewer`/`compare` modes** (not the repro):
composition is engaged by default there (unset algorithm ⇒ controller
fallback `?? "TextCompositionAlgorithmGreedyRaggedModel"`,
`composition-controller.ts:812-813`; the registered default is the
EMPTY/inherit struct, `registered-properties.mjs:426-433`), and every
wght tick is a full recompose of every textblock: the new axis location
changes the `axesKey` ingredient (`composition-controller.ts:803, :890,
:915, :1096-1169`), so the input-equality filter cannot skip;
measurement caches keyed by location all miss and the 32-entry hbFont
LRU (`measurer.ts:93, :157`) thrashes continuously during a drag; then
publish + viewer span-DOM re-application. Tasks cancel-and-reschedule
per `sourceChanged` (`composition-controller.ts:389-476`), but
cancellation only acts at yield points.

Verified mode verdicts (details below):

- **"Compose Text in Editor" OFF: the editor does zero composition
  work** (plugin absent — no subscriptions, decorations, StateField,
  plugin view, or per-transaction hooks). With the viewer also off
  (mode "editor"), no composition work runs anywhere.
- **"None (Browser)" selected (with demand, i.e. viewer/compare mode or
  compose-in-editor ON): no segmentation, measurement, or algorithm
  runs** — the None gate bails right after
  `nodePropertiesPayload.getProperties()`
  (`composition-controller.ts:731-746`) and steady-state produces no
  publications. But it is **not** zero recurring work: per
  `sourceChanged` an async controller task still resolves the full
  nodeProperties scope per textblock before bailing; and with
  compose-in-editor ON, the editor plugin still pays an O(document)
  textblock walk in `_syncSubscriptions` plus StateField map-through on
  every transaction (`composition-plugin.ts:272-298, :107-132,
  :366-384, :413-441`).

## Detailed Findings

### 1. Per-tick causal chain (wght drag, editor flag OFF, default doc)

1. Axis UI writes `axesLocations` → one shell state transaction per
   change (pre-existing mechanism, unchanged by the branch).
2. Root metamorphose: **sync-first** (`_updateState` tries
   `_syncMetamorphoseState` and only falls back to the async pass on a
   deliberate ResourceResolve error or the review-resources flag,
   `shell.mjs:1628-1666`) — one metamorphose per steady-state tick.
   `typeSpec` is a draft → `requireHyphenationPatternsCoherenceFn` does
   NOT early-return (the 55bf4954 fix only skips document-only edits)
   → full recursive TypeSpec-tree + style-patch language walk, **once
   per tick** (`index.typeroof.jsx:235-275`). Language tags are
   unchanged by an axis move — the walk's result is identical every
   tick. (The async double-pass is real but only on the initial-load
   path — `_initState` always goes through `_asyncMetamorphoseState`,
   `shell.mjs:942-952` — and on font install/review or a genuinely
   missing dependency.)
3. Scope cascade (mechanism 100% pre-existing, verified via
   `git diff fontbureau/main...HEAD`): root `TypeSpecLiveProperties`
   rebuild → `@parentProperties` identity cascade → **all 11 TypeSpec
   scopes rebuild** (default doc: 11 TypeSpec nodes, 10 block-level
   document nodes, ~12 style-mark instances), each running now **14**
   property generators (12 on main; `textCompositionGen` +
   `hyphenationGen`, `properties-generators.mjs:48-120`, registered
   :664-665, add ~7 model gets/scope, axis-independent constant), plus
   ~44 patched-scope builds for inherited style links.
4. `DocumentNodeProperties` scope rebuilds →
   `_scopeSettled`/`update` → `_driveComposition()` per textblock,
   **twice per cycle** (acknowledged "acceptable",
   `document-nodes-meta/index.mjs:809-880`), each building a
   `_compositionSource()` (~3 root-depth `getEntry` walks + string
   join) that is used only for a null-check when undemanded — the
   parked suspect #2 from
   `2026-10-06-2252-type-stage-perf-regression-viewer-inactive.md`.
   With viewer demand, `sourceChanged` → `_composeCurrent` → cancel +
   reschedule per textblock.
5. The compose task (demand exists via the viewer): `getProperties()` →
   None gate → ingredients compare → `axesKey` differs → full pipeline:
   `_buildInlineItems` (:772), logical paragraphs (:780), leaf style
   resolution (:898-930), hyphenation (:1193-1204), **HarfBuzz shaping
   per segment at the new axis location** (:1233-1253) — measurement
   caches keyed by `axesKey`, so a drag = miss storm + hbFont LRU
   eviction churn — algorithm (default GreedyRagged), publish
   (:1637-1658), viewer DOM re-application.
6. Editor (flag OFF): normal pre-existing cost only — ~10 block +
   ~12 mark stylers rewrite styles (incl. rebuilt
   `font-variation-settings` strings) per tick
   (`type-spec.typeroof.jsx:305-586`, unchanged by branch), PM
   mutation-observation/readDOMChange parse of styler-mutated blocks.
   The branch's editor-integration deltas here are net *churn
   reductions* (`isStylerOwnedAttr` `html-attrs.ts:10-20`, childList
   `ignoreMutation` `integration.typeroof.jsx:452-472`, `selectionSet`
   guard :1429-1436) — no spurious transactions on style-only changes.

### 2. Net-new per-tick costs vs main, ranked (default document)

| # | Cost | Where | Notes |
|---|------|-------|-------|
| 1 | **Hyphenation language walk once per tick** (typeSpec is a draft on axis edits, so the 55bf4954 early-return does not fire) | `index.typeroof.jsx:235-275` | Result identical every tick (languages don't change); full TypeSpec-tree + style-patch walk with per-node allocations. **Operator-verified: early-returning unconditionally is a big improvement**. Steady state is sync-first — NO ×2 (see correction in Summary #1) |
| 2 | **Async double-pass (boot/fonts only)** | `shell.mjs:942-952,1487-1490,1556-1563,1628-1666` | `_initState` + font install/review run metamorphose twice (async resolve window + sync pass) with all root coherences firing in both — affects initial load and font changes, NOT the wght tick |
| 3 | **`_driveComposition` discarded-source overhead** (×2 per textblock per cycle: scope settle + update; fires even with ZERO demand) | `document-nodes-meta/index.mjs:809-880` | ~3 root-depth `getEntry` walks + string join per firing; parked 2026-10-07, accepted then as sub-ms — fires on the axis-drag path too |
| 4 | **[viewer/compare modes only] Full viewer composition re-run per textblock per tick** (segment → hyphenate → HarfBuzz re-measure at new location → algorithm → publish → viewer span DOM) | `composition-controller.ts:722-1253`, demand via `viewer.typeroof.jsx:340` | NOT active in the repro (editor mode, zero demand — see addendum). Axis change invalidates the `axesKey` ingredient for every textblock; measurement caches all miss; hbFont LRU (32 locations/font) thrashes during drags |
| 5 | **+2 property generators per TypeSpec scope build** | `properties-generators.mjs:48-120,:664-665` | ~77 model gets/tick (11 scopes); constant, axis-independent; also hits ramp layout |
| 6 | **+2 struct fields on TypeSpecModel** (dynamic struct + hyphenation struct) | `type-spec/models.mjs:497-501` | Small per-tick constant (unchanged fields carry by identity); bigger one-off costs. Correction to prior research: added to TypeSpecModel only, NOT StylePatchTypeModel |
| 7 | Editor integration deltas | `integration.typeroof.jsx`, `html-attrs.ts` | Net **negative** (churn fixes) |

### 3. Mode verdicts (per-change work, editor-side unless noted)

| Work item | Flag OFF | ON + None | ON + algorithm |
|---|---|---|---|
| Composition plugin in PM plugins | no (`integration:1110-1123`) | yes | yes |
| Editor demand (observe/subscribe) | no | yes | yes |
| Editor StateField map-through / plugin view update / O(doc) `_syncSubscriptions` walk | n/a | yes, per transaction | yes |
| Controller task per `sourceChanged` | yes (viewer demand) | yes: `getProperties()` → None gate bail | yes, full pipeline |
| Segmentation / measurement / algorithm | yes (viewer) | **no** | yes |
| Publications | yes (viewer) | only on engage→None transition (null) | yes |
| Editor DOM decoration work | no | transition only | per publication |

- **Flag OFF: editor truly composition-free.** The regression comes
  from the layout still composing for the viewer.
- **ON + None: NOT zero recurring work** (editor plugin walks the
  document per transaction; controller resolves the full properties
  scope per textblock per change before the None gate).
- **Viewer + None (regardless of flag): no deep composition**, but the
  per-textblock scope-resolution task still runs per change.

### 4. Facts about the default document

- 11 TypeSpec nodes (root, section, h1-h3, paragraphs t1/t2/t2greek/
  t2russian), 3 style patches, 10 block-level document nodes
  (1 section + 3 headings + 6 paragraphs), ~12 generic-style marks.
- No `textCompositionAlgorithm` anywhere in
  `lib/assets/type-stage-initial-state.json` → resolves to the
  controller fallback `TextCompositionAlgorithmGreedyRaggedModel`
  (engaged), NOT to None.
- Default `composeInEditor` is TRUE since HEAD 67f3ce9f (type-stage,
  optional; ramp: always on, no UI; grid: no feature).

### 5. Prior related findings (carried forward)

- `2026-10-06-2252-type-stage-perf-regression-viewer-inactive.md`:
  suspects #1 (hyphenation coherence — fixed for document-only edits in
  55bf4954, still runs on typeSpec drafts) and #2 (`_driveComposition`
  discarded-source overhead — parked, now on the hot path again).
- Milestone-5 findings (ROADMAP): hbFont LRU thrash
  (`HBFONT_LOCATIONS_CAP = 32` vs hundreds of distinct locations) —
  on an axis drag every tick is a new location, so steady-state
  dragging reproduces the thrash continuously.
- Plan `2026-10-07-1223-prosemirror-composition-decorations`
  (concluded): issue C (readDOMChange replace-churn from styler-owned
  `lang`) fixed; editor integration deltas are churn reductions, not
  costs.

## Code References

- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:326-344` — unconditional per-textblock viewer demand (subscribe)
- `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts:734-746` — None gate (after `getProperties()`)
- `composition-controller.ts:812-813` — default algorithm fallback = GreedyRagged when unset
- `composition-controller.ts:803,890,915,1096-1169` — `axesKey` ingredient (axis change = full invalidation)
- `composition-controller.ts:1233-1253` — HarfBuzz shaping per segment; `measurer.ts:93,157` — 32-entry hbFont LRU
- `composition-controller.ts:389-476` — cancel/reschedule scheduling per `sourceChanged`
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:331,:795-801` — `composeInEditor` model field + checkbox
- `lib/js/components/prosemirror/integration.typeroof.jsx:1012-1023,:1110-1123` — flag gates ONLY the editor plugin
- `lib/js/components/prosemirror/composition-plugin.ts:272-298,:107-132,:366-384,:413-441` — ON+None residual editor costs
- `lib/js/components/layouts/type-stage/index.typeroof.jsx:235-275` — hyphenation language walk (runs on typeSpec drafts)
- `lib/js/shell.mjs:1628-1666` — steady-state change path: sync-first, async double-pass only on missing-dependency/review flag
- `lib/js/shell.mjs:942-952,:1487-1490,:1556-1563` — async double-pass (initial load / font review); primed patterns draft
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:809-880` — `_driveComposition` per update + scope settle
- `lib/js/components/layouts/type-stage/properties-generators.mjs:48-120,:664-665` — new per-scope generators
- `lib/js/components/registered-properties.mjs:426-433` — registered default = EMPTY (inherit) struct
- `lib/js/components/ui-manual-axis-locations.mjs:373,416` — axis UI change events (pre-existing)

## Verification addendum (2026-10-08, operator challenge: "if viewer is off that must not be")

**Verified: with the viewer off, the pipeline does NOT run.** Evidence:

1. **Default mode is "editor".** The default state JSON has no
   `documentRendererMode`; the model field uses
   `DocumentRendererModeDfltEditorModel` (`defaultValue = "editor"`,
   `lib/js/components/document-renderer-mode/model.mjs:11-13`), wired
   into `TypeStageModel` at `index.typeroof.jsx:334-337`. (A
   `DocumentRendererModeDfltCompareModel` variant exists at :15-16 but
   is not the type-stage default.)
2. **An inactive viewer is destroyed, not just hidden.** The viewer
   widget's `activationTest: showViewerActivationTest`
   (`index.typeroof.jsx:373-379`, wiring :735-745) is evaluated in
   `_provisionWidgets` (`basics/component.mjs:1298-1330`):
   `!shouldBeActive && isActive` → `_destroyWidget`
   (`component.mjs:1170`, :1325). Destruction cascades to the
   attachments; each attachment's `destroy()` calls
   `_compositionUnsubscribe()` + `_compositionUnobserve()`
   (`viewer.typeroof.jsx:507-510`), releasing demand.
3. **Demand gate.** With no subscribers, `_hasDemand` is false and
   `_composeCurrent` returns before any work
   (`composition-controller.ts:385-387, :416-419`); `sourceChanged`
   (`:472-476`) hits the same gate.
4. **Behavior tests enforce it.**
   `lib/js/tests/text-composition/index.test.mjs:215-248` ("editor-only
   drops every composition result and viewer demand restores it"):
   mode → "editor" ⇒ `composition@` registrations drop to 0; a document
   edit in editor mode keeps 0; mode → "viewer" restores them. Also
   :1552 ("editor mode: zero composition demand") in the lazy-reveal
   test.

**Consequence for the repro:** in the reported scenario (default state
⇒ mode "editor", plus "Compose Text in Editor" turned OFF) there is
zero composition demand anywhere; no segmentation, shaping, measuring
or algorithm work runs. The felt lag must be attributed to the
unconditional per-tick overheads (ranked table #1–#3, #5–#7), of which
the hyphenation language walk is operator-confirmed as a major term.
The earlier headline of this document ("viewer demand keeps the
pipeline hot") applies only to `viewer`/`compare` modes and has been
corrected above.

### Second correction (2026-10-08): steady state is sync-first, not async+sync

The operator's model is correct: `_updateState`
(`shell.mjs:1628-1666`) tries `_syncMetamorphoseState(draft)` FIRST
and only falls back to `_asyncMetamorphoseState` when (a)
`_requireReviewResourcesFlag` is set (initially true, font
install/activation, `requireReviewResources` API — `shell.mjs:615,
:1057, :1170`) or (b) the sync pass raises a deliberate
ResourceResolve error. A wght axis tick does none of these → **one
metamorphose, coherences (incl. the hyphenation walk) run ONCE per
tick**. The double-pass (async resolve window + final sync pass, with
coherences firing in both since the `_initState` draft-passing change,
`shell.mjs:942-952`) is real but confined to the initial-load path and
font/review cycles. The earlier "twice per cycle"/"×2 multiplier"
claims in this document (inherited from
`2026-10-06-2252-type-stage-perf-regression-viewer-inactive.md`, which
conflated the `_initState` boot path with the steady-state change
path) have been corrected; that older document carries the same error.
Note: `_driveComposition` firing ×2 per textblock per cycle (scope
settle + update) is a different, still-valid doubling inside the UI
update cascade, not the metamorphose.

## Open Questions

- **Weights are unmeasured** (perf suite off-limits). #1 is the
  structural suspect, but a puppeteer probe (debug-with-puppeteer
  harness, allowed) timing state transactions / counting HarfBuzz shape
  calls during a scripted axis drag would confirm the split between
  pipeline re-run, hyphenation walk, and cascade overhead.
- **Event cadence**: `ui-manual-axis-locations.mjs` listens to
  `'change'` — for range inputs that is release-only in Chrome but
  continuous in some browsers; the number input may fire continuously.
  The repro's lag profile (per stop vs continuous) is worth pinning in
  the probe.
- **Engagement semantics**: empty algorithm struct currently means
  "default algorithm" (GreedyRagged) at the controller fallback, i.e.
  the default document composes without any opt-in. Whether unset
  should ship as None is a design decision, but it directly controls
  whether this regression exists out of the box.
- **None-gate placement**: the gate needs the resolved
  `textCompositionAlgorithm/algorithm` value, which today requires the
  full `getProperties()` scope resolution per textblock per change.
  Whether the algorithm key can be known cheaper (e.g. as part of the
  source/ingredients identity) is a design question for the planning
  phase.
- **Viewer demand granularity**: the viewer subscribes per constructed
  attachment whether or not its pane is visible/primary in the current
  type-stage mode; whether demand should follow visibility is open.
