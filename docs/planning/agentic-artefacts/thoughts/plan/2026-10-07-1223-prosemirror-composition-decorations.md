# ProseMirror Consumes Text-Composition (Editor Applicator via Decorations)

**Date**: 2026-10-07
**Branch**: feature/composition-and-justification
**Research basis**: `thoughts/research/2026-10-07-1057-prosemirror-state-replacement-feasibility.md` (Addendum 4/5 discussion), composition architecture docs in `composition-controller.ts:1-160`

## Overview

Add a third text-composition **Applicator**: the ProseMirror editor consumes published
`composition@<textblockPath>` results and renders them as `Decoration.inline` wrapper
spans (classes + CSS custom properties), reusing the exact visual mechanism the viewer
already uses (flat spans, CSS-forced line breaks, treatment custom properties).
The feature is **opt-in via a user-editable flag `composeInEditor` on TypeStageModel**
(default off), type-stage editor only. The composition controller anticipated this:
"Editor (EXPERIMENTAL, later): a ProseMirror plugin translating the same
CompositionResult into decorations" (composition-controller.ts:99-104), and results
are published so "any renderer can consume them: compose once, apply to multiple
targets" (:94-96).

## Current State Analysis

- **Viewer applicator is complete** (milestone 5 closed):
  `UIDocumentTextRun._buildLineSpans` (viewer.typeroof.jsx:782-910) builds flat
  `<span>`s per line-fragment: classes `typeroof-composition-line(-first|
  -paragraph-first-line|-hyphen)`, CSS custom properties `--line-letter-spacing`,
  `--line-word-spacing`, `--line-color-code`, and `font-variation-settings` for
  axes treatments. CSS in `text-composition/line-spans.css` forces breaks via
  `::before{display:block}` and hyphens via `::after`. The class/style computation
  is embedded in the viewer — not yet shared.
- **Controller publishes per textblock**: `composition@<textblockPath>` entries
  (payload fields: `textblockPath`, `leaves[{path, treatment{potentials,
  axesEntries, spaceAdvancePt}|null}]`, `paragraphs[{segments[{start,end,widthPt,
  sourceIndex,...}], result{lines[{fromSegment,toSegment,breakAt,adjustmentStep,
  trackingGapsBySourceIndex}], diagnostics}}]`, `treatmentConfig`, `colorCoding`,
  `sources{textblockNode, leafTexts}`, `lineWidthPt`; built at
  composition-controller.ts:1561-1608). **Component-agnostic consumption API
  exists**: `observe(path, cb)` / `subscribe(path, token)` / `flushSync(path)`
  (controller.ts:446-538) — the viewer already uses it in parallel with dependency
  mappings (viewer.typeroof.jsx:652-664).
- **Segment offsets are UTF-16 code units** (segmenter.ts:92-149 walks JS string
  indices) — identical to PM's position counting.
- **Editor integration point**: `class ProseMirror._initProseMirrorView`
  (integration.typeroof.jsx:985-1104) builds the plugin array; `_menuPlugin()`
  (:964-979) is the precedent for a plugin closing over component context.
  The `TypeStageProseMirrorContext` (prosemirror.typeroof.jsx:97-157) wires
  dependencies; `compositionController` widget id is registered in
  index.typeroof.jsx:697; the `composition@` protocol handler (with null fallback)
  at index.typeroof.jsx:469-474.

## Desired End State

- With `composeInEditor` checked (editor-manager zone checkbox), the type-stage
  editor renders composed lines: forced breaks, hyphen markers, letter/word-spacing
  and axes treatments, diagnostics color-coding — visually matching the viewer for
  the same textblock.
- Typing: decorations map through transactions (PM-native `DecorationSet.map`),
  drifting approximately with edits until the controller republishes; staleness
  (`sources.textblockNode !==` current) suppresses application of outdated payloads.
- Flag off (default): plugin absent, zero cost, today's behavior.
- Viewer behavior unchanged (Phase-1 refactor is behavior-preserving).

### Key Discoveries

- PM inline decorations render as wrapper `<span class style>` (viewdesc.ts:1080-1162);
  `style` is applied via `dom.style.cssText` — **CSS custom properties work**;
  spans sit *inside* mark elements; position mapping/selection/DOM parsing are
  transparent (`pmIsDeco` skip, viewdesc.ts:931-937); attrs-only changes patch
  in place.
- PM protects IME composition sessions (`CompositionViewDesc`, viewdesc.ts:593-617):
  decoration churn around a composing text node is safe.
- **Trap 1 — State re-creation wipes StateFields**: `ProseMirror.update()` rebuilds
  via `EditorState.create` (integration.typeroof.jsx:1541), NOT `reconfigure` —
  a DecorationSet field resets to empty on external doc/schema change. The plugin
  view (which survives: plugins array unchanged → views not re-created,
  prosemirror-view index.ts:256-258) must detect the reset and rebuild.
- **Trap 2 — width identity**: composition composes to `nodeProperties`
  `columnWidth` (controller.ts:793-797), never DOM-measured. The PM textblock's CSS
  width comes from the same nodeProperties scope via the same styler code
  (type-spec.typeroof.jsx:359, :495). Verify manually that the editor column is
  pixel-identical to the composed width.
- `treatmentValuesAtStep(potentials, config, step)` → `{axes, letterSpacingPt,
  wordSpaceFactor}` (treatment-planner.ts:69-85) is the shared math; viewer applies
  it at :828-867.
- Vertical caret motion follows the CSS-broken lines (PM uses DOM coordinates) —
  acceptable, matches visual reality; to be checked in the Phase-0 spike.

## What We're NOT Doing

- Dual-mode / dynamic editing scopes (separate future plan; this plan neither
  requires nor precludes it).
- type-tools-grid simple editor, ramp layout editor (flag wiring omitted there).
- Changes to the composition controller/algorithms/measurer (consumption only).
- Changes to viewer behavior (Phase 1 is a pure refactor).
- Metamodel/PM state-sync redesign, own-editor, Wordgard topics.
- The perf harness (off-limits per operator rule).

## Implementation Approach

Phases are sequenced so the two risky unknowns are front-loaded: Phase 0 kills the
project cheaply if browser editing quirks at CSS-forced breaks are unacceptable;
Phases 1-2 build and test the pure parts before any PM integration.

---

## Phase 0: Quirk spike — CSS-forced breaks inside contenteditable (gate)

### Overview
Verify manually that PM editing behaves acceptably when inline decorations force
line breaks via `::before{display:block}` — before building anything real.

### Changes Required

#### 1. Throwaway spike plugin (not committed, or committed behind no flag — operator's call)
**File**: `lib/js/components/prosemirror/integration.typeroof.jsx` (temporary, local)
**Changes**: add a minimal plugin returning a static `DecorationSet` that applies
`typeroof-composition-line typeroof-composition-line-first` + a `--line-letter-spacing`
style to hand-picked ranges of a test document (2-3 paragraphs). Ensure
`line-spans.css` is loaded in the dev app.

**Status (2026-10-07)**: spike implemented, awaiting manual QA.
`lib/js/components/prosemirror/spike-composition-decorations.ts` (fixed-width
pseudo-lines, classes + style custom properties identical to the viewer's
line-span mechanism) + two `// TEMPORARY SPIKE` lines in
`integration.typeroof.jsx`. **Gate: `?spikeComposition` URL param.**
Automated: typecheck ✓, eslint ✓, prettier ✓, vitest 455/455 ✓.
`line-spans.css` loads via index.typeroof.jsx → composition-controller.ts:242.
GO/NO-GO decision: **pending operator QA below.**

### Success Criteria

#### Manual Verification (the only meaningful one — needs real browsers)
- [x] Caret places correctly at forced line starts (click + arrow keys), Chrome/Firefox/Safari — operator 2026-10-07
- [x] Arrow-up/down across forced breaks behaves sanely — operator 2026-10-07
- [x] Enter/Backspace at a forced break behaves sanely — operator 2026-10-07
- [x] IME session — NOT VERIFIED, risk explicitly accepted by operator 2026-10-07 (see GO note below)
- [x] No PM warnings/exceptions; `view.domObserver` not provoked (no readDOMChange loops) — operator 2026-10-07

---

## Phase 1: Extract shared line-attrs module (pure refactor)

### Overview
Factor the span class/style computation out of the viewer into a shared module both
applicators consume (DRY — the plugin must not fork this logic).

### Changes Required

#### 1. New shared module
**File**: `lib/js/components/layouts/type-stage/text-composition/line-attrs.ts`
**Changes**: export pure functions capturing the viewer's current logic exactly:

```ts
// class list for one line-fragment span
export function lineSpanClasses(opts: {
    isLineStart: boolean;
    isParagraphFirstLine: boolean;
    isHyphenBreak: boolean; // isLineEnd && line.breakAt?.kind === "hyphen"
}): string[]

// style properties for one line-fragment span:
// [prop, value][] covering --line-letter-spacing (+ data-tracking-gaps rule),
// --line-word-spacing, font-variation-settings override, --line-color-code.
// Encapsulates: treatmentValuesAtStep call, adjustmentStep === 0 / treatment == null
// skip, axes override merging with treatment.axesEntries, both color palettes.
export function lineSpanStyleProps(args: {
    treatment: CompositionLeafTreatment | null;
    treatmentConfig: { treatments: Set<string>; direction: string };
    line: ComposedLine & { trackingGapsBySourceIndex?: Record<number, number> };
    leafIndex: number;
    colorCoding: "potentials" | "kp" | "off";
    diagnostics: CompositionDiagnostics; // overfullLines, badness, fitnessClasses, exhaustedLines
    lineIndex: number;
}): [string, string][]
```

Also move `_lineColorCode` / `_kpLineColorCode` (viewer.typeroof.jsx:737-780) here.

#### 2. Refactor viewer to consume it
**File**: `lib/js/components/layouts/type-stage/viewer.typeroof.jsx`
**Changes**: `_buildLineSpans` (:782-910) calls the shared functions; delete the
moved color-code methods. Behavior-preserving: same DOM output.

#### 3. Unit tests
**File**: `lib/js/components/layouts/type-stage/text-composition/line-attrs.test.mjs`
**Changes**: behavior tests — class composition for the four (isLineStart ×
isParagraphFirst × hyphen) combinations; treatment skip when `adjustmentStep === 0`
or `treatment == null`; letter-spacing emitted only when `trackingGaps > 0`;
word-spacing = `wordSpaceFactor * spaceAdvancePt`; axes override keeps non-treated
entries; both color palettes incl. overfull/exhausted overrides.

### Success Criteria:
#### Automated Verification:
- [x] `npm run typecheck` passes ✓ (2026-10-07)
- [x] `npm run lint` passes ✓ (eslint + prettier, 2026-10-07)
- [x] `npm run test` passes (new + existing) ✓ (474/474, 19 new, 2026-10-07)
#### Manual Verification:
- [ ] Viewer renders a composed document identically before/after (visual diff)

**Implementation Note**: pause for manual confirmation + proposed commit message
before Phase 2.

**Status (2026-10-07)**: implemented. `line-attrs.ts` (classes, treatment style
props, both palettes) + `line-attrs.test.mjs` (19 behavior tests); viewer
`_buildLineSpans` consumes the shared module, color-code methods moved.
One documented nuance: at a direction-gated step, `font-variation-settings`
is still emitted at DEFAULT axis values (treatment-planner gates the step to
0 but emits enabled axes at dflt) — identical to the pre-refactor viewer code
path, now pinned by a test.

---

## Phase 2: Path ↔ PM-position mapping module

### Overview
Pure, unit-testable module converting composition payloads into PM decoration ranges:
leaf document-node paths → PM node positions; segment char offsets → PM ranges.

### Changes Required

#### 1. New module
**File**: `lib/js/components/prosemirror/composition-positions.ts`
**Changes**:

```ts
// Walk a PM doc building document-node-path → node start position.
// doc.descendants((node, pos, parent, index)) supplies pos+index;
// path = parentPath + `/content/${index}`; root = documentExternalName
// (e.g. "document"). Returns Map<pathString, {pos, node}>.
export function buildPathToPosMap(doc: PMNode, documentPath: string): Map<string, {pos: number, node: PMNode}>

// For one payload: for each paragraph × line × leaf-fragment (segments grouped by
// sourceIndex, contiguous), compute {from, to} in PM positions:
//   text nodes: pos+1 is first char (pos is position before the node)
//   from = runTextStart + firstSegment.start, to = runTextStart + lastSegment.end
// Skip: unknown leaves (path not in map), atoms (start===end===0),
// empty fragments. Yields {leaf, line, lineIndex, result, from, to} tuples.
export function* payloadFragmentRanges(payload, pathToPos): Generator<FragmentRange>
```

#### 2. Unit tests
**File**: `lib/js/components/prosemirror/composition-positions.test.mjs`
**Changes**: build PM docs via `new Schema(...)` + `EditorState.create` (pattern of
commands.test.mjs / type-spec-resolution.test.mjs); synthetic payloads; assert
`from/to` against hand-counted PM positions (incl. nested structure, multiple runs
per textblock, marks splitting runs, a hard_break atom, unknown leaf path skipped).

### Success Criteria:
#### Automated Verification:
- [x] `npm run typecheck`, `npm run lint`, `npm run test` pass ✓ (2026-10-07, 484/484)
#### Manual Verification:
- [ ] Position arithmetic cross-checked against `getPathOfContentIndexes`
  (integration.typeroof.jsx:103-108) on one real document in devtools

**Status (2026-10-07, amended after operator review)**: implemented.
`composition-positions.ts` exports `buildPathToPosMap` (O(document), bulk
repaints), `resolvePathToPos` (ONE path, O(depth × siblings) — operator's
cheaper-resolution review; plain child(i)/nodeSize loop, no closure), and
`payloadFragmentRanges(payload, resolve)` taking a `PathResolver` so the
plugin chooses bulk (map-backed) or incremental (per-textblock) resolution.
FragmentRange carries isLineStart/isLineEnd + leaf/line/result references.
NOTE: the `_nodesCache` (mmNode↔pmNode) can NOT provide positions (PM nodes
are position-free by design) — it stays for identity/staleness checks.
14 hand-counted tests incl. resolver↔map agreement on every node and a
dedicated nesting schema (the testing schema's blockquote is spec'd
inline:true and can't nest at doc level).

---

## Phase 3: The composition plugin + `composeInEditor` flag

### Overview
The core deliverable: a PM plugin consuming `composition@` entries and rendering
decorations, plus the user-facing flag wired through TypeStageModel →
TypeStageProseMirrorContext → `class ProseMirror`.

### Changes Required

#### 1. New plugin module
**File**: `lib/js/components/prosemirror/composition-plugin.ts`
**Changes**:

```ts
export const editorCompositionPluginKey = new PluginKey("editorComposition");

// Constructed with component context via closure (precedent: _menuPlugin,
// integration.typeroof.jsx:964-979):
export function createEditorCompositionPlugin(ctx: {
    childrenWidgetBus;         // for getWidgetById("compositionController", null)
                               // and getProtocolHandlerImplementation("composition@")
    getEntry: (path) => any;   // staleness re-reads (declared deps only)
    documentExternalName: string; // widgetBus.getExternalName("document")
}): Plugin
```

- **StateField<DecorationSet>**: `init` → `DecorationSet.empty`; `apply(tr, set)`:
  `tr.getMeta(editorCompositionPluginKey)` → replacement set; else `tr.docChanged`
  → `set.map(tr.mapping, tr.doc)` (map-through, per operator decision #3); else `set`.
- **`props.decorations(state)`** → the field (same instance returned = free, PM
  equality-checks sets).
- **Plugin view `CompositionPluginView`**:
  - constructor: resolve controller (`getWidgetById("compositionController", null)` —
    null ⇒ inert, e.g. wrong layout); initial `buildPathToPosMap`; per-textblock
    `observe(textblockPath, cb)` + `subscribe(textblockPath, token)` (demand);
    payload cache `Map<textblockPath, payload|null>`.
  - `_publish(view)`: for each cached payload: staleness filter
    (`payload.sources.textblockNode === getEntry(textblockPath)`); build decorations
    via Phase-2 ranges + Phase-1 `lineSpanClasses/lineSpanStyleProps`; one
    `DecorationSet.create(doc, decorations)`; dispatch
    `view.state.tr.setMeta(editorCompositionPluginKey, set)` (guarded against
    dispatch-during-dispatch via microtask if needed).
  - `update(view, prevState)`: textblock-set diff on `docChanged` → resubscribe
    (unobserve removed, observe added); **Trap-1 reset detection**: field empty
    while cache holds non-null payloads and prevState.plugins unchanged ⇒
    state was re-created by `ProseMirror.update()` ⇒ `_publish(view)`.
  - `destroy()`: unobserve all, release demand tokens.
- OFF MODE: null payload ⇒ no decorations for that textblock (cache entry null).
- **`.typeroof-composed` toggling** (from Phase-0 spike QA): a composed textblock
  must carry `white-space: nowrap` (line-spans.css:68-71) or the browser
  double-wraps. In PM this maps to `Decoration.node(from, to,
  {class: "typeroof-composed"})` per textblock with a non-null payload —
  added to the same DecorationSet; removed in OFF MODE.
- **Editor pane overflow** (from Phase-0 spike QA): with nowrap the lines
  overflow the editor pane without scroll. In PM the natural place is
  `overflow-x: auto` on the textblock (same node decoration class:
  `.typeroof-composed { white-space: nowrap; overflow-x: auto; }` — verify
  padding interaction during QA). Viewer pane scrolling is out of scope.
- **PM splits inline decorations at text-node/mark boundaries**, copying
  the full attrs onto each piece (viewdesc.ts:1482-1546, confirmed twice
  in spike QA: a per-line decoration duplicating `line-first` broke every
  piece onto its own visual line; a per-line hyphen class showed trailing
  hyphens at every mark boundary). The plugin MUST emit one
  `Decoration.inline` per (line × leaf) fragment — which the payload's
  per-leaf fragmentation provides naturally — with `line-first` only on
  the line's first fragment and `line-hyphen` only on its last (same
  rule as viewer.typeroof.jsx:795-807).

## Phase-0 GO/NO-GO decision

**GO** (operator, 2026-10-07). QA results: caret behaves at forced line
starts; arrow navigation, Enter/Backspace, overall feel OK; console clean.
IME **not verified** — risk explicitly accepted by the operator ("willing
to risk it"; PM protects composing text nodes via CompositionViewDesc,
so exposure is considered low). Spike artifacts found and fixed during QA
(nowrap, per-fragment line-first/hyphen) are recorded as Phase-3 gotchas
above; they are not real-feature defects.

#### 2. Wire the flag — model + UI
**File**: `lib/js/components/layouts/type-stage/index.typeroof.jsx`
**Changes**:
- TypeStageModel: add `["composeInEditor", BooleanModel]` next to
  `showNodeTypeSpecLabels` (:325).
- Widgets: add `UICheckboxInput` in zone `"editor-manager"` (pattern :784-789):
  `[{ zone: "editor-manager" }, [["composeInEditor", "value"]], UICheckboxInput,
   "compose-in-editor", "Compose Text in Editor"]`.

#### 3. Wire the flag — context + component
**File**: `lib/js/components/layouts/type-stage/prosemirror.typeroof.jsx`
**Changes**: `TypeStageProseMirrorContext` only (NOT ramp, NOT grid): add
`"composeInEditor"` to the ProseMirror widget's dependency list (:122-127) and pass
a new constructor arg (see below).

**File**: `lib/js/components/prosemirror/integration.typeroof.jsx`
**Changes**:
- Constructor: new optional arg `composeInEditorSettingName = null` (null ⇒ feature
  unavailable, e.g. ramp/grid contexts).
- `_initProseMirrorView`: plugin array gains
  `...(this._isComposeInEditorOn() ? [createEditorCompositionPlugin({...})] : [])`
  next to the menu-plugin conditional (:1076-1079).
- `update(changedMap)`: if the setting is declared and
  `changedMap.has("composeInEditor")` ⇒ rebuild the plugins array (with/without the
  composition plugin) and include it in the `EditorState.create` config (:1530-1541)
  instead of carrying `this.view.state.plugins` over verbatim. PM destroys/re-creates
  plugin views on plugin-set change (prosemirror-view index.ts:256-275) — the
  subscription lifecycle lives in the plugin view's constructor/destroy, so toggling
  is clean.
- Runtime toggle forces state re-creation → Trap-1 reset path covers decoration
  re-application after the toggle.

#### 4. Line-span CSS availability
Verify `line-spans.css` is loaded in the type-stage editor context (imported by
composition-controller.ts:242 — the controller is always active in type-stage, so
likely yes; assert in manual QA).

### Success Criteria:
#### Automated Verification:
- [x] `npm run typecheck`, `npm run lint`, `npm run test` pass ✓ (2026-10-07, 497/497)
- [x] New tests (jsdom, real EditorView — pattern of integration.test.mjs:250-301):
  StateField map-through on doc change; meta replacement; staleness filter drops
  outdated payload; decoration spans carry expected classes/style props in the DOM;
  OFF MODE (null payload) renders no composition classes ✓ (9 tests incl.
  replacement-no-duplication, reset resilience, destroy cleanup, inert-without-controller)
#### Manual Verification:
- [x] Flag on: editor shows composed lines matching the viewer — operator 2026-10-07 ("It's looking good!"); `.typeroof-composed` + nowrap verified on all composed textblocks after the inclusive-find fix
- [x] Flag off: identical to today's editor; toggle at runtime works both ways ✓ (2026-10-07, QA probe, Chrome+Firefox)
- [x] Typing keeps decorations drifting (mapped) until recomposition refreshes them ✓ (2026-10-07, QA probe)
- [x] Undo/redo, block-type change (schema re-creation), unknown nodes: no breakage ✓ (2026-10-07, QA probe; default doc incl. cite-link/figure atoms, no errors)
- [x] **Width identity**: recorded editor rect == viewer rect (569.89pt) ✓ (2026-10-07); visual confirmation by operator
- [x] Phase-0 QA items re-run in the real feature (caret, arrows via probe; caret feel + overall by operator 2026-10-07; IME remains unverified — accepted risk per Phase-0 GO)

**Status (2026-10-07, updated after live debugging)**: implemented and
operator-verified in the app ("It's looking good!"). Live debugging (temporary
`?debugComposition` instrumentation, since removed) pinned a real bug the
unit tests couldn't see (single-textblock fixtures): **DecorationSet.find
matches INCLUSIVE boundaries** (`span.from <= end && span.to >= start`), and
adjacent textblocks touch — each incremental flush removed the previous
textblock's node decoration + last fragment. Fixed: narrowed find range
(pos+1, pos+nodeSize-1) + `{editorComposition: true}` spec tagging so
replacement removes only our own decorations. Regression test with two
adjacent textblocks added. Also folded in the Phase-0 findings: per-fragment
line-first/line-hyphen and `.editor-advanced .typeroof-composed >
[data-node-content]{white-space:nowrap}` in line-spans.css.

**Status (2026-10-07)**: implemented — composition-plugin.ts (StateField
map-through + meta replacement; per-fragment inline decorations via the shared
line-attrs; `.typeroof-composed` node decoration; observe/subscribe lifecycle
per textblock; staleness via `===` on captured sources; incremental
per-textblock replacement via `set.find(range)/remove/add`; Trap-1 reset
republish; microtask-coalesced dispatch), flag `composeInEditor` on
TypeStageModel + editor-manager checkbox, wired through
TypeStageProseMirrorContext only (ramp/grid untouched); `class ProseMirror`
gained optional `composeInEditorSettingName` ctor arg + `_buildPlugins()`
extraction (flag toggle rebuilds the plugin array).

**Bug found & fixed during testing**: leaf-node char positions — text chars
sit AT a text node's pos (leaves have no open token), not pos+1. The DOM
rendering caught it ("ello w" vs "hello ") where the mirrored unit tests
couldn't; fixed in composition-positions.ts (`entry.node.isLeaf ? pos : pos+1`)
and all hand-counted expectations corrected.

**Implementation Note**: pause for manual confirmation + proposed commit message
before Phase 4.

---

## Open Issue (reported 2026-10-07, after Phase-3 commit 87453c36) — RESOLVED 2026-10-07

Operator: "there seem to be some issues where updates don't propagate
correctly" (details in `downloads/issue.txt`): typing in textblock N
breaks the composed rendering of textblock N+1; typing into N+1 heals
it and breaks N+2.

**Root cause (pinned with a puppeteer probe, `scripts/debug-composition-issue.mjs`,
real browser + real cascade — unit tests could not see this):**
PM's domObserver observes PM's own re-render writes after a keystroke
and triggers `readDOMChange`; the re-parsed fragment differs from the
doc slice (generic-style `parseDOM.getAttrs` collects the styler-written
`lang` attribute into the mark's `htmlAttrs` bag, while the metamodel
marks carry empty bags) → PM dispatches a **replace-tr with textually
identical content** over the divergent range (observed: `[146, 417)`,
t1's tail + t2's head). `DecorationSet.map` drops every decoration
intersecting the replaced range. Only the typed textblock republishes,
so the plugin's flush restores only it — the neighbor keeps its holes.

**Fixes (operator OKOK 2026-10-07):**
- **A** `ProsemirrorNodeView.ignoreMutation` (integration.typeroof.jsx):
  ignore childList mutations outside `contentDOM` (UIDocumentNodeOutfitter
  widget-placeholder churn). Hygiene; NOT the actual trigger.
- **B** composition-plugin.ts: map-through with `onRemove` drop
  detection — decorations carry their textblockPath in spec; dropped
  textblocks are repainted from the payload cache (self-healing against
  ANY content-replacing transaction). Regression test: "repaints
  decorations dropped by a content-replacing transaction".
- Verified via the probe: t2/t2greek/t2russian stay fully decorated
  across the typing sequence; the replace-churn itself still occurs.

**Follow-up issue (C) — RESOLVED 2026-10-07:** the `htmlAttrs` ↔ styler
round-trip — parse collected styler-owned attributes into the mark/node
bags, so re-parse never converged and every PM DOM write in a styled
region produced a spurious replace-tr (document/metamodel churn +
re-render cost, invisible before Phase 3). Styler-owned-attribute audit:
`lang` (via `setLanguageTag`) is the ONLY unguarded one — `style` and
`--node-anchor-name` are covered by the `style` guard, `data-*` by the
rest. Fix: `isStylerOwnedAttr` (html-attrs.ts) passed as the `skip`
predicate at both EDITABLE collection sites (generic-style mark,
default-schema.ts; editable nodes, `_createEditableGetAttrs` in
integration.typeroof.jsx). Reproducing atoms deliberately keep
collecting `lang` verbatim (their attributes are reproduced source
content). Verified with the probe: typing now produces exactly ONE
transaction (a minimal point insertion — even the keystroke readback
no longer rewrites the marked run), no paragraph swaps, no span churn,
all textblocks fully decorated throughout. Tests pin: lang excluded at
both editable sites, kept at reproducing atoms, plus a styled-element
re-parse producing attrs equal to the document mark (bag "").

---

## Phase 4: Hardening + verification sweep

### Overview
Consolidate; run the full verification matrix; document behavior.

### Changes Required
- Fixes from Phase-3 manual QA. ✓ (the Open Issue above: commits
  32ca8b72 (A+B), baa7ffae (C), plus the stale-replay drive below)
- Short usage note — see "Usage note" below (plan file, per operator's
  choice default).

### Success Criteria:
#### Automated Verification:
- [x] `npm run typecheck`, `npm run lint`, `npm run test` all green ✓ (2026-10-07, 500/500)
#### Manual Verification (automated via `scripts/puppeteer-probes/qa-compose-in-editor.mjs`, Chromium):
- [x] baseline coverage; typing drift + recomposition refresh; undo/redo;
      ArrowUp/Down across forced breaks; Enter/Backspace (split/merge);
      flag OFF (zero decorations); block-type change (schema re-creation,
      Trap-1 repaint); no page errors/console errors ✓ (2026-10-07)
- [x] **flag OFF→ON toggle — RESOLVED 2026-10-07** (see below; QA probe 17/17 green)
- [x] Width identity: recorded — editor rect == viewer rect (569.89pt both);
      the `<p>` carries `width: 277.99pt` — rect is the full column incl.
      margins/padding; visual check deferred to operator QA
- [x] Firefox: QA probe 17/17 green ✓ (2026-10-07, PUPPETEER_BROWSER=firefox,
      puppeteer-pinned firefox 153.0.4; t2greek spans 34 vs Chrome's 35 —
      legitimate cross-browser shaping difference)
- [x] Ramp-layout regression ✓ (2026-10-07, `smoke-ramp-layout.mjs`: ramp
      renders its editor, zero composition decorations, no page errors)
- [x] Remaining human QA: caret feel at forced line starts ✓ (operator
      2026-10-07); IME unverified — risk explicitly accepted (Phase-0 GO);
      Safari unavailable on this machine (accepted)

**PLAN CONCLUDED 2026-10-07** — all success criteria met or explicitly
accepted. Archived per RPI rules to
`docs/planning/agentic-artefacts/thoughts/plan/`.

### Open Phase-4 finding: the ingredients dedup makes registrations
### permanently stale when a textblock's node is replaced without its
### composition inputs changing

QA probe scenario: greedy-fit on; caret into t1; Enter + Backspace
(split+merge restores t1's text). Afterwards t1's registration is
stale and **t1 never republishes** — the flag OFF→ON toggle then
leaves t1 undecorated in the editor.

Root cause (pinned by instrumenting every suspect in turn — the
finalize `_sourceIsCurrent` gate, demand, cancellation, OFF MODE:
ALL eliminated, zero occurrences in the traces): the controller's
**ingredients dedup** (`_composeTextblockTask`, after measurement
setup, before the paragraph loop): when the freshly computed
ingredients equal the last published snapshot's, the task returns
early — no publish. The merge replaced t1's metamodel NODE but not
its composition inputs, so every recompose dedups and the
registration keeps `sources.textblockNode` = the REPLACED node
forever. The conflict: the consumer's staleness protocol (editor
plugin: `payload.sources.textblockNode !== getEntry(path)` → drop)
vs. the publish dedup. The viewer applicator has no identity check,
so it shows the identical-content payload happily — the bug only
bites the editor.

Plugin-side mitigation already implemented: a stale replay
(observe() of a pre-existing registration — the only case a payload
can be stale at notify time) drives `controller.sourceChanged(path)`
(async; flushSync provably fails the finalize gate mid-drain via
scope provisioning). Correct hygiene, but it cannot fix this bug —
the re-driven compose dedups again.

**Controller fix (operator OKOK 2026-10-07, implemented):** on a
dedup hit, `_refreshRegistrationSources` re-registers the payload
with `sources.textblockNode` refreshed to the current source's node
(the composition result is provably identical, so the identity
refresh is sound) — silent by design: no setUpdated, no observer
notification; only future observe() replays need the fresh identity.
Guarded by `_sourceIsCurrent` (refresh only with a current source)
and `hasRegistered` (getRegistered throws on missing ids). Tests:
refresh re-registers with the current node without mutating the old
snapshot and without setUpdated; no-ops when already current or
missing. Verified: QA probe 17/17 green (t1 heals at flag ON), the
issue probe stays green, suite 502/502.

### Usage note

- `composeInEditor` (type-stage, editor-manager zone, default OFF):
  renders the published text-composition in the ProseMirror editor via
  decorations. OFF costs nothing (plugin absent).
- Known limitations: decorations drift approximately while typing until
  recomposition refreshes them (map-through semantics); vertical caret
  motion follows the CSS-forced lines; width identity assumes the
  editor column matches the composed `columnWidth` (recorded OK once);
  IME during composition unverified (accepted risk, Phase 0); the
  caret-textblock publication starvation above is the open issue.

---

## Testing Strategy

Per COLLABORATION.md: tests assert **behavior** (inputs → observable outcomes), not
implementations.

### Unit Tests:
- `line-attrs.test.mjs`: class/style computation matrix (Phase 1)
- `composition-positions.test.mjs`: path/offset → PM position arithmetic (Phase 2)

### Integration Tests (jsdom + real EditorView):
- Plugin StateField: map-through, meta replace, reset-resilience
- DOM assertions: decoration wrapper spans carry `typeroof-composition-line*` classes
  and the expected style custom properties; spans nested inside mark elements
- OFF MODE absence of decorations; staleness suppression

### Manual (browser) QA:
- Phase-0 spike checklist; Phase-3/4 matrix (caret, arrows, Enter/Backspace, IME,
  undo, runtime flag toggle, schema change, unknown nodes, width identity)

## Open Questions (resolved during planning)

1. Flag placement ⇒ **user-editable on TypeStageModel next to `showNodeTypeSpecLabels`
   + editor-manager checkbox** (operator 2026-10-07).
2. Scope ⇒ **type-stage only** (ramp/grid untouched).
3. Stale-during-typing ⇒ **map decorations through transactions** (PM-native drift
   until recomposition).
4. Editor+viewer simultaneously ⇒ **approved** ("compose once, apply to multiple
   targets"); editor adds its own demand tokens.

## Risks

- **Phase-0 NO-GO** (caret/IME quirks) — the gate exists precisely for this.
- Width identity assumption (Trap 2) — if the editor column differs from
  `columnWidth`, composed lines mis-fit visibly; out of scope to fix here, but must
  be recorded (feeds the dual-mode/layout discussion).
- Decoration churn cost while typing on large textblocks — bounded by per-textblock
  recomposition; observe in QA; no perf harness.
