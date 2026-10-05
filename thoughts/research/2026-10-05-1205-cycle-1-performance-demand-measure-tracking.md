---
date: 2026-10-05T12:04:51+02:00
git_commit: df9162e80abcae462df4f40598e7d8b202d4ebdc
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Cycle 1: text-composition performance, demand lifecycle, controllable measure, and tracking parity"
tags: [research, codebase, text-composition, performance, profiling, demand, geometry, tracking, kp-prerequisites]
status: complete
---

# Research: Cycle 1 — performance, demand, measure, tracking

## Research Question

Map the codebase for the first prerequisite cycle before
Knuth–Plass++:

1. establish real composition performance values and profiling /
   bottleneck surfaces;
2. establish why composition runs with no consumer (editor-only)
   and what OFF/None currently costs;
3. map the existing geometry path and a controllable Host test
   measure;
4. map tracking prediction versus browser CSS letter-spacing.

The committed scope is in
`docs/planning/text-composition/ROADMAP.md`, “Cycle 1 — KP++
prerequisites”.

## Summary

### Performance

The current `perf:composition` script is a valid whole-cycle
regression smoke test for one scenario only: verified wikipedia
state (1,087 text nodes), viewer mode, Greedy Fit ON versus None,
30 sequential typing or root-relative-font-size edits. It measures
one `performance.now()` interval around each burst. It does not
measure initial load, cold versus warm behavior, editor/compare
modes, per-textblock work, cache behavior, HarfBuzz shape calls,
applicator work, or call stacks. No current source uses CDP CPU
profiling/tracing, `performance.mark/measure`, `console.time`, or
composition-specific counters. Historical documentation describes
an untracked Node inspector profiler harness, but its executable
files no longer exist.

Both active algorithms matter for no-consumer performance. The
unchanged-input filter occurs only after inline traversal, paragraph
segmentation, language/hyphenation resolution, per-leaf style
resolution, treatment setup and ingredient construction. The operator
observes the default Greedy Ragged noticeably slowing editor-only mode:
it still pays all Host preparation, natural segment shaping and greedy
line breaking even though it probes only step 0. Greedy Fit is visibly
slower again and adds repeated `lineWidthAtStep` evaluations; each
nonzero probe scans and may reshape candidate segments through a
24-iteration binary search. `Measurer` has two bounded LRU caches but
exposes no hit/miss/font-creation/shape counters.

### Demand

`CompositionController` and `DocumentNodesMeta` are always active in
all document renderer modes. Editor-only mode has no `composition@`
consumer, yet the meta tree drives every affected textblock through
the complete composition pipeline and retains publications/caches.
`SimpleProtocolHandler` knows publishers and update marks, not
subscriber counts. That does not require changing the protocol:
demand can be owned by an explicit widget/service lifecycle (for
example an activation-gated publisher or an ad-hoc service reached by
`getWidgetById(...).subscribe()` plus a cleanup token), while
publication remains a SimpleProtocolHandler concern. Viewer
attach/detach currently removes only renderer attachments; it does not
influence composition publications or controller activity.

Explicit None is materially different inside CompositionController:
it reads the settled property map, detects
`TextCompositionAlgorithmNoneModel`, unpublishes once when necessary,
and returns before traversal, segmentation, shaping, treatment planning
or algorithm execution. Subsequent affected updates still traverse
the always-active document meta tree, update/rebuild scopes as relevant,
classify textblocks, resolve the service, and perform the gate/path/
registration checks. The operator nevertheless observes editor-only
None as slower than expected; the early gate proves only that deep
composition roles are absent, not that the whole TypeStage/meta/scope
update is cheap. Cycle-1 profiles must attribute that remaining cost.
Local inherited None has the same per-textblock controller behavior.

The closest existing lifecycle patterns are: renderer callback tokens
(`DocumentNodesMeta.attachRenderer/detachRenderer`), cleanup closures
from protocol/listener registration, first/last pending-mark observer
activation in `TypeSpecSubscriptions`, and shell state-dependency
reference counters.

### Measure

The composition controller reads the textblock’s incoming
`layout/availableWidth`, while the viewer styler writes the SAME
node’s `layout/width` to CSS and horizontal layout computes a local
`layout/columnWidth` as the per-column line measure. Column width is
projected as `availableWidth` only to descendants. These can differ on
the textblock itself; this is not hypothetical in the operator’s
latest Wikipedia debug state (details below).

The shared jsdom harness publishes environment dimensions as
`{width:0,height:0}`. The state’s default `100 percent-layout` width
therefore resolves to exactly `0pt`; zero is numeric, so the
controller’s non-number 480pt fallback does not activate. The
composition e2e suite consequently produces minimal/overfull lines
and cannot assert realistic break movement. The harness already
returns its mutable `environmentHandler`; an existing full-stack test
re-publishes layout as 400×300px and verifies the scope resolves
300pt. The operator’s real fully-expanded screen is 1920px wide with
a measured layout area of 1600px; these are the target realistic
browser/profile environment facts (the small Host fixture can still
use a deliberately selected deterministic pt measure). Pure geometry/
unit/runion tests cover the individual pieces, but no current test
ties an explicit nonzero measure to exact CompositionController line
results.

### Tracking

Potentials define tracking as absolute pt letter-spacing; the Host
currently predicts its width as:

```text
trackingPt(step) × (segment.end − segment.start)
```

Segment offsets are JavaScript string offsets, so the count is source
UTF-16 code units. The viewer applies the value as CSS
`letter-spacing` on one span per leaf/line fragment. No browser-versus-
HarfBuzz tracking geometry test exists.

HarfBuzz’s vendored API already exposes post-shape glyph count and
clusters (`Buffer.getLength`, `getGlyphInfos`, `cluster`, cluster
levels). Its own tests demonstrate that `fi` changes from two input
items to one ligature glyph and that combining sequences share
clusters. The current `Measurer` discards that information and caches
only total em width. Open parity questions also include spacing at
separate leaf/span boundaries and whether the generated end hyphen
receives CSS letter-spacing not represented by Host math.

## Detailed Findings

### 1. Current performance harness

#### Entry, fixture and modes

- `package.json:10-30` registers `npm run perf:composition`.
- `scripts/perf-composition:1-68` defines the browser benchmark,
  checked-in baseline, 30-cycle default, 1.5 regression factor,
  source wikipedia fixture and temporary Vite-served copy.
- `scripts/perf-composition:136-188` stages the fixture, launches
  headless Chromium at 1920×1080, opens the generic player via
  `from-url`, waits for `window.shell`, counts text nodes and fails
  below 100. The current fixture reports 1,087 and TypeStage layout.
- `scripts/perf-composition:78-94` selects Greedy Fit for ON and None
  for OFF before timing.
- The fixture itself starts in viewer mode
  (`docs/states-library/fixtures/wikipedia-snapshot.json:28612`).
  The script does not vary document renderer mode.

#### Timed operations

- `scripts/perf-composition:96-110` finds the first text leaf by
  recursive immutable-model walk.
- `scripts/perf-composition:112-130` wraps all cycles in one
  `performance.now()` interval:
  - typing replaces the first text value;
  - recompose alternates root `relativeFontSize` by `0.0001`;
  - every state transaction is awaited.
- `scripts/perf-composition:190-201` runs OFF then ON for typing and
  recompose, recording cumulative milliseconds and ON/OFF ratio.
- `scripts/perf-composition:207-267` writes/compares baseline values
  (`onMs` and ratio), exits 1 beyond 1.5× and exits 2 on setup errors.
- `scripts/perf-composition.baseline.json` currently records Greedy
  Fit: typing 4162.2/4232.7ms (1.017), recompose
  7278.6/9216ms (1.266), 30 cycles at commit `521db920`.

#### Existing profiling surfaces

- No executable source calls `page.createCDPSession`,
  `Profiler.*`, `Tracing.*`, `page.tracing`, `performance.mark`,
  `performance.measure`, `console.time` or composition counters.
- `scripts/create-clip-frames:17-84` is another Puppeteer/player
  precedent (state access, deterministic `shell.changeState`, frame
  capture), but does not profile.
- `docs/planning/performance-investigation-viewer-update-propagation-260820.md:29-98,232-243`
  documents a former monkey-patched jsdom benchmark and optional
  `node:inspector` CPU profile. The named `viewer-perf*.mjs` files are
  not in the current tree.

### 2. Composition work and caches

#### Always-active service and drive

- `lib/js/components/layouts/type-stage/index.typeroof.jsx:681-719`
  installs the CompositionController and DocumentNodesMeta without
  activation tests, before mode-gated editor/viewer widgets.
- `composition-controller.ts:262-297` gives the service
  `UPDATE_STRATEGY_NO_UPDATE`; it is called directly by meta nodes.
  Construction creates a Measurer (when HarfBuzz exists), maps for
  registrations/ingredients/Hyphers, and lazy protocol references.
- `document-nodes-meta/index.mjs:769-815` identifies textblocks and
  calls `composeTextblock` after state/scope/service gates.
- `document-nodes-meta/index.mjs:834-846` drives before ordinary/
  initial child cascade; `:948-1003` wires a second drive after fresh
  scope settlement. A cycle may invoke both paths.

#### Early-return boundaries

- `composition-controller.ts:464-486`: explicit None does path
  conversion, scope map read, algorithm lookup, and unpublication,
  then returns. No inline traversal or expensive role has run.
- `composition-controller.ts:487-497`: missing HarfBuzz returns at the
  same early boundary (one warning first time).
- `composition-controller.ts:499-760`: active composition has already
  traversed inline nodes, assembled logical paragraphs, resolved
  fonts/geometry/features/language/configuration/hyphenation,
  resolved per-leaf style links and prepared per-style treatment
  planners before ingredient equality is known.
- `composition-controller.ts:763-831`: ingredient equality then skips
  hyphenation, normal segment shaping, algorithm execution and
  publication. Building the ingredients may itself call `plannerOf`,
  discover/interpolate/anchor potentials and shape a natural space.
- `composition-controller.ts:833-1077`: cache miss proceeds through
  hyphenation, source segment shaping, conditional-hyphen handling,
  algorithm evaluation, payload creation and protocol replacement.

#### Expensive candidate path

- Greedy Ragged is the unresolved/default algorithm and still runs the
  complete Host preparation + natural shaping + publication path. In
  addition, current payload construction calls `plannerOf(styleOf(index))`
  for every leaf even for Greedy Ragged, so potential discovery,
  interpolation/anchoring, stepper construction and natural-space
  shaping are not currently Greedy-Fit-only
  (`composition-controller.ts:723-760,1030-1052`).
- `composition-controller.ts:874-893` shapes each natural segment at
  its run style.
- `composition-controller.ts:906-950` derives treated axes and can
  shape candidate-end hyphens.
- `composition-controller.ts:968-1025` nonzero
  `lineWidthAtStep` loops every candidate segment, reshapes it at
  treated axes, adds tracking/wordspace, then conditional hyphen.
- `greedy-fit.ts:36-78` uses 24 binary-search iterations per fitting
  step; `:82-260` invokes candidate width repeatedly for natural
  selection, potential tests, pull-up, widening and overfull fitting.
- `composition-controller.ts:1078-1086` currently logs every
  publication with line/overfull counts.

#### Measurer cache behavior

- `measurer.ts:89-101`: 50,000 width entries; 32 HarfBuzz locations
  per font; no exposed metrics.
- `measurer.ts:103-151`: map-based LRU refresh/eviction and
  HarfBuzz-font construction on location miss.
- `measurer.ts:154-199`: width key = font fullName, axes, features,
  language, direction, text. Miss creates features/buffer, shapes,
  sums `xAdvance`, normalizes and caches. Empty text returns zero.

### 3. Current demand/consumer lifecycle

#### Renderer modes

- `document-renderer-mode/model.mjs:1-17` defines editor/viewer/compare
  and alternate defaults.
- `type-stage/index.typeroof.jsx:353-365` activates editor for
  editor/compare and viewer for viewer/compare.
- `type-stage/index.typeroof.jsx:650-757` shows mode-gated editor and
  viewer around the always-active composition/meta services.
- The production TypeStage variant uses editor-default mode
  (`type-stage/index.typeroof.jsx:320-324`). Empty/inherited algorithm
  ultimately defaults to Greedy Ragged in the controller
  (`composition-controller.ts:548-550`). Thus the ordinary default is
  editor-only while active composition still runs.

#### Publisher widget and publications are not subscriptions

- `type-stage/index.typeroof.jsx:681-696` installs the actual publisher,
  `CompositionController`, as always-active widget ID
  `compositionController`; it has no activationTest. Document meta
  looks it up directly and calls it.
- This existing ID-addressed service boundary can host a domain-specific
  explicit subscribe/unsubscribe API without giving
  SimpleProtocolHandler subscriber semantics; TypeSpecSubscriptions is
  a current analogous service (`prosemirror/type-spec.typeroof.jsx:
  1104-1157,1561-1709`). Widget-ID presence itself is not a declared
  activation dependency, so lifecycle notifications must be explicit.
- `basics/component.mjs:171-245` SimpleProtocolHandler stores producer
  values and updated IDs only. `register` returns an unregister
  closure; `hasRegistered` means a value exists. It has no consumer
  registration/count.
- Consumer dependency mappings are interpreted by ComponentWrapper
  during update-map/relevance processing (`component.mjs:648-659,
  961-977`) and are not reported to the handler.
- `composition-controller.ts:1067-1099` retains one producer cleanup
  closure and ingredient vector per textblock. Unpublication removes
  both and marks the missing/fallback-null ID updated.

#### Viewer lifecycle

- `viewer.typeroof.jsx:960-1026` creates the article/registry and
  attaches its callback to DocumentNodesMeta during initialUpdate
  (after meta update ordering).
- `document-nodes-meta/index.mjs:1191-1217` stores renderer callback
  identities and cascades attach/detach across the existing tree.
- `viewer.typeroof.jsx:1029-1088` creates element/text-run attachments
  mapped to composition IDs.
- `viewer.typeroof.jsx:1104-1113` detaches on destruction.
- Detachment destroys DOM/attachments only; CompositionController
  publications, ingredients, Measurer/Hypher caches and continued meta
  drives remain.

#### No-consumer and None behavior

- In editor-only mode no viewer attachment or ProseMirror
  composition consumer exists, but affected textblocks still execute
  all active composition roles and publish retained payloads.
- First active→None drive unregisters prior results and notifies active
  consumers through the null fallback.
- Later affected drives while None still update the meta/scope,
  classify/resolve the service, read the path/properties/algorithm and
  test registration, but return before inline/shape/algorithm work.
- Tests cover compare/editor/viewer transitions and no article in
  editor mode (`type-stage-viewer-behavior/index.test.mjs:72-110,
  331-401`), document shrink + viewer activation
  (`type-stage-document-replace/shrink-activation-repro.test.mjs:29-79`),
  global None (`text-composition/index.test.mjs:253-288`) and inherited
  per-TypeSpec None (`:290-336`). They do not count composition-role
  invocations.

### 4. Existing explicit lifecycle patterns

- **Renderer callback token:** `DocumentNodesMeta.attachRenderer /
  detachRenderer` stores handler identity; per-node
  `RendererAttachments` owns exact handler→widget mappings and rejects
  duplicates (`document-nodes-meta/index.mjs:60-120,1191-1217`).
- **Cleanup closures:** SimpleProtocolHandler registration
  (`component.mjs:192-207`), EnvironmentProvider publications
  (`environment-provider.mjs:92-152,175-220`), StageDOMNode
  (`actors/stage.mjs:34-65,150-153`) and ReactRoot listeners
  (`react-integration.jsx:67-95,214-255`) bind cleanup to owner life.
- **First/last observer demand:** TypeSpecSubscriptions starts its
  MutationObserver when the first pending mark arrives and disconnects
  after the last is processed/unsubscribed; node/mark view destruction
  explicitly unsubscribes (`prosemirror/type-spec.typeroof.jsx:
  1434-1472,1561-1635,1659-1709`; integration node/mark destroy at
  `prosemirror/integration.typeroof.jsx:460-464,572-576`).
- **Reference counter:** shell dependency drafts use use/unuse counts
  and a try/finally context wrapper (`shell.mjs:754-846,1264-1288`).
- **Activation lifecycle:** ComponentWrapper activation tests create /
  destroy mode-gated widgets and execute complete cleanup
  (`basics/component.mjs:724-803,1287-1334`).

### 5. Geometry and composition measure

#### Data flow

- TypeStage persistent dimensions are `width`/`height`
  (`type-stage/index.typeroof.jsx:325-326`); TypeSpec owns the
  horizontal-layout dynamic model (`type-spec/models.mjs:243-295`).
- `availableSizesGen` resolves root LengthModels against environment
  facts to `layout/availableWidth` in pt
  (`node-properties-generators.mjs:43-85`; conversion in
  `length-models.mjs:114-172`).
- Manual geometry reads incoming available width + font sizes,
  converts units and computes local `columnWidth`, `width`, padding,
  gap (`node-properties-generators.mjs:109-228`). Runion performs the
  equivalent EN-domain solve (`:352-460`).
- `layout/availableWidth ← layout/columnWidth` is demarcated for
  descendant inheritance rather than inserted as the current node’s
  local property (`node-properties-generators.mjs:572-584`;
  `node-properties.mjs:157-196`; `scope-resolution.mjs:86-142`).
- Document-node scopes use resolved TypeSpec + parent projected map
  (`document-nodes-meta/index.mjs:608-680`).
- `composition-controller.ts:525-535` reads current node’s incoming
  `layout/availableWidth`, not local `layout/columnWidth`; the constant
  measure enters algorithm input at `:951-968` and ingredients.

#### CSS width versus composition measure (verified follow-up)

- `UIDocumentElement` provisions `UIDocumentTypeSpecStyler` with the
  same element as inner + outer target (`viewer.typeroof.jsx:248-360`).
- `UIDocumentTypeSpecStyler.update()` layers node properties over
  TypeSpec facts, then maps **`layout/width` → CSS `width:<pt>`** on
  the outer element (`prosemirror/type-spec.typeroof.jsx:330-367,
  375-450`). Multi-column inner CSS additionally maps
  `layout/columnWidth` to `column-width` and `layout/columnGap` to
  `column-gap` (`:485-505`). It does not style from
  `layout/availableWidth`.
- Manual geometry explicitly defines:
  `columnWidthPT = lineLengthPT ?? fill`,
  `widthPT = margins + n×columnWidth + gaps`; it yields local
  `layout/columnWidth` and local `layout/width`, and only projects
  `columnWidth` as descendant `availableWidth`
  (`node-properties-generators.mjs:520-584`).
- Composition reads current textblock `layout/availableWidth`
  (`composition-controller.ts:525-535`), not its local columnWidth.
  This is a correctness bug, not an open semantic choice: the existing
  AutoLinearLeading generator explicitly consumes local
  `layout/columnWidth` and documents it as “the node’s own computed
  line box”; `availableWidth` is the inherited parent input budget
  (`node-properties-generators.mjs:658-684`). Composition must consume
  that same already-computed authoritative line measure.
- Latest debug save
  `downloads/typeroof-20261005-115730.TypeStage.json` has stage width
  `100 percent-layout`, viewer mode, and a manual horizontal layout on
  `/typeSpec/children/paragraphs` with `lineLength: 60en`. Paragraph
  node types link beneath that TypeSpec. At each paragraph, local CSS
  width/columnWidth is the 60en manual result, while composition uses
  incoming parent availableWidth; only the paragraph’s children inherit
  the 60en value. This is the concrete Wikipedia misbehavior case the
  operator set aside for Cycle 1.

#### Why jsdom is zero

- `type-stage-toggles/harness.mjs:195-217` installs its own
  environment protocol and publishes all dimensions as
  `{width:0,height:0}` (dpr=1). It exposes no geometry option but does
  return the mutable handler (`:232-243`).
- The harness state omits TypeStage width, so coherence gives
  `100 percent-layout`; 100% of zero resolves to 0pt.
- Zero is numeric, so the controller’s fallback only for non-number
  (`composition-controller.ts:531-535`) does not run.
- The legacy state’s top-level lineLength is not a current
  TypeSpec/horizontalLayout field. Current fallback geometry is fill,
  still zero.
- `type-stage-viewer-behavior/index.test.mjs:515-548` explicitly
  asserts zero is resolved, then republishes 400×300 CSS px and verifies
  300pt scope width.

#### Existing controllable pieces and tests

- Harness `environmentHandler` is already mutable and update-markable.
- Root generator tests assert absolute/percent available widths
  (`node-properties.test.mjs:27-111`).
- Inline length conversion covers pt/px/cm/mm/in/em/en/base units
  (`type-spec/fundamentals.mjs:89-118`; tests `:9-61`).
- Pure runion tests cover fixed/variable/zero budgets
  (`horizontal-layout-runion.test.mjs:23-290`).
- Full-stack tests cover parent scope projection/fill and editor/viewer
  CSS width parity (`type-stage-viewer-behavior/index.test.mjs:
  404-639`).
- No current test connects a deterministic nonzero scope measure to
  exact CompositionController breaks. The e2e composition test itself
  documents that break movement is not assertable under the tiny
  measure (`text-composition/index.test.mjs:732-737`).

### 6. Tracking/CSS parity surfaces

#### Current predictive formula

- Potentials define tracking as absolute pt per glyph and wordspace as
  a factor of natural space (`justification-potentials.ts:7-19`;
  `treatment-planner.ts:1-18`).
- `treatment-planner.ts:41-46,88-123` maps normalized asymmetric step
  to treatment value, gates direction and toggles.
- `composition-controller.ts:968-1025` reshapes each candidate segment
  at treated axes, then adds:

```text
letterSpacingPtAt(step) × (segment.end − segment.start)
```

  plus wordspace for whitespace-only segments and conditional taken
  hyphen.
- Segment offsets come from JavaScript string indexing/`text.length`
  (`segmenter.ts:91-146`), so this is UTF-16 code-unit count.
- The controller applies tracking to every segment, including spaces;
  conditional hyphen width has no explicit tracking term.

#### Rendered formula

- Viewer produces one span per leaf participating in a line, joining
  all that leaf’s line segments into one text node
  (`viewer.typeroof.jsx:661-682,755-764`).
- It recomputes treatment values and sets
  `--line-letter-spacing:<pt>` and word spacing
  (`viewer.typeroof.jsx:692-721`).
- `line-spans.css:35-51` applies CSS `letter-spacing` and
  `word-spacing`; a taken hyphen is generated in `::after` under the
  same span.

#### HarfBuzz data available today

- `measurer.ts:154-199` currently returns/caches only width after
  shaping and discards glyph/cluster information.
- Vendored API exposes `Buffer.getLength`, `getGlyphInfos`,
  `getGlyphPositions`, `getGlyphInfosAndPositions`, `cluster`, and
  selectable cluster level (`vendor/harfbuzzjs/index.d.mts:16-23,
  602-623`; implementation `index.mjs:1920-1997`).
- `addText` uses UTF-16 input; default cluster level is monotone
  graphemes (`vendor/harfbuzzjs/.build/harfbuzzjs/src/buffer.ts:
  56-63,108-123,204-212`).
- Vendored tests show `fi` becomes one glyph after shaping and
  `x\u0300fi` produces clusters `0,0,2`
  (`vendor/harfbuzzjs/.build/harfbuzzjs/test/index.test.js:
  1507-1518,1533-1589`).

#### Existing coverage and unresolved observables

- Treatment tests assert step values and axis width changes, not
  browser letter-spacing geometry
  (`treatment-planner.test.mjs:32-205`).
- Measurer tests cover axes, feature/ligature width, cache eviction and
  language without DOM (`measurer.test.mjs:71-138`).
- Integrated composition tests assert spacing properties exist, not
  rendered tracking width (`text-composition/index.test.mjs:803-865`).
- No current browser-vs-HarfBuzz tracking probe exists. Current code
  does not establish whether CSS spacing opportunities correspond to
  UTF-16 units, code points, grapheme clusters, HarfBuzz clusters,
  shaped glyphs, or boundary-sensitive span behavior.
- TypeStage simple style patches do not currently expose baseline
  letter/word spacing, although global registered properties and actor
  renderers do (`registered-properties.mjs:405-418`;
  `actors/models.mjs:117-125`; `actors/line-of-text.mjs:95-99`).

## Code References

### Performance

- `scripts/perf-composition:1-271` — current aggregate browser
  benchmark and baseline workflow.
- `scripts/perf-composition.baseline.json` — current Greedy Fit
  baseline.
- `composition-controller.ts:763-831` — late ingredient filter.
- `composition-controller.ts:968-1025` — candidate reshaping callback.
- `greedy-fit.ts:36-260` — binary searches and repeated probes.
- `measurer.ts:89-199` — caches and HarfBuzz miss path.
- `viewer.typeroof.jsx:593-767` — applicator/span work.
- `docs/planning/performance-investigation-viewer-update-propagation-260820.md`
  — historical profiling record (no current executable harness).

### Demand

- `type-stage/index.typeroof.jsx:650-757` — widget ordering and mode
  activation.
- `document-nodes-meta/index.mjs:769-859` — composition drives and
  destruction unpublication.
- `composition-controller.ts:464-497,1067-1105` — None/no-HB gates,
  publication and unpublication.
- `basics/component.mjs:171-245` — protocol values/updates, no
  subscriber accounting.
- `document-nodes-meta/index.mjs:60-120,1191-1217` — explicit renderer
  attach/detach token lifecycle.
- `prosemirror/type-spec.typeroof.jsx:1434-1472,1561-1709` — existing
  first/last demand-driven observer pattern.

### Geometry

- `type-stage-toggles/harness.mjs:195-243` — zero environment and
  exposed handler.
- `node-properties-generators.mjs:43-85,109-228,352-460,572-584` —
  available sizes, manual/runion geometry and inheritance projection.
- `node-properties.mjs:157-196` — effective/local/inherited maps.
- `composition-controller.ts:525-535,951-968` — selected line measure.
- `type-stage-viewer-behavior/index.test.mjs:404-548` — projection and
  mutable nonzero environment precedent.

### Tracking

- `justification-potentials.ts:7-19` — units/meaning.
- `treatment-planner.ts:41-123` — step mapping.
- `composition-controller.ts:968-1025` — predictive formula.
- `viewer.typeroof.jsx:692-764`; `line-spans.css:35-51` — rendered
  formula and span boundaries.
- `measurer.ts:154-199`; `vendor/harfbuzzjs/index.d.mts:16-23,602-623`
  — discarded versus available shape information.

## Operator decisions / design requirements

- **Demand granularity: per textblock result** (`composition@<path>`),
  not one global applicator subscription and not one subscription per
  text leaf. One viewer textblock attachment owns one token while its
  text runs share the payload; future editor/other applicators can
  subscribe independently. Resolved per-node TypeSpec remains the
  authority for algorithm/None after demand exists.
- **Explicit source + consumer lifecycle** is required for a durable
  implementation: meta textblocks register/unregister their current
  drive/source; consumers subscribe/unsubscribe by textblock path;
  first demand requests the current result; demanded source changes
  re-drive; last demand stops work; source destruction invalidates.
  This can live as an ID-addressed domain service without adding
  subscriber semantics to SimpleProtocolHandler.
- **Sync + genuinely cooperative async execution** should be designed
  into the lifecycle. Promise-wrapping synchronous work does not
  unblock UI. Textblock/logical-paragraph boundaries already provide
  scheduling points; a generator/task runner analogous to resource
  loading could be drained synchronously or resumed asynchronously.
  Initial compose-before-reveal may request sync; steady-state dirty
  nodes may request async. Async requires immutable-input/staleness
  checks. The synchronous path remains a first-class performance
  target.
- **Last consumer drops state immediately.** On 1→0 demand, cancel
  pending work, unregister `composition@<path>`, discard ingredients /
  source/result state and notify disappearance where relevant. No
  dormant published result or private cache in this cycle; profile
  reactivation later before adding cache/eviction complexity.
- **Async demand + explicit sync reveal/flush.** Persistent demand is
  scheduling-neutral. Cooperative async is acceptable for first
  composition and is the normal steady-state update mode; textblocks
  may publish out of document order. A lazy viewer may stay visible
  with browser wrapping until each first result arrives. Sync remains
  an explicit `flushSync`/sync-reveal policy for callers that require
  compose-before-reveal, and remains a first-class optimized/
  benchmarked path. Async tasks must reject stale immutable inputs;
  last-unsubscribe/source destruction cancels immediately.
- **Viewer publishes/renders an atomic completed snapshot.** The viewer
  need not mirror the editor’s newest model state while async work is
  pending: it may keep the last complete source+composition snapshot
  and atomically switch when the result for a newer immutable source
  is ready. The payload therefore must carry the exact leaf text/source
  it composed, rather than offsets interpreted against independently
  updated attachment text. With no prior snapshot, lazy reveal may use
  browser-wrapped current content; sync reveal flushes first. Structural
  deletion/retyping still removes attachments normally.
- **ProseMirror policy stays open.** A future applicator may use browser
  composition for the focused/actively edited block and asynchronously
  compose inactive blocks, but Cycle 1 must not bake in this unproven
  editor policy.
- **Profiling starts external; hooks, if required, are generic and
  opt-in.** First use CDP CPU/trace profiles + scenario control without
  production changes. If attribution or structural zero-work tests need
  hooks, build a sustainable cross-subsystem instrumentation facility,
  not composition-specific counters: guarded/no-op `count(id)` and
  `timerStart(id)`/`timerStop(id)` calls when no collector is installed;
  a central reset/snapshot/scenario-aware collector when enabled. Metric
  IDs and purposes must be documented (meaning, unit/scope, lifecycle,
  kind and observer effect). Prefer structural metric assertions over
  wall-clock tests.
- **Benchmark sampling convention.** Cold activation/transitions: five
  independent fresh-page samples (median + range, first-result and
  all-demanded completion where applicable). Steady state: independent
  identical state per arm, five warmup edits then 30 individually timed
  edits; report median, p95/max, total and aggregate regression ratio.
  Alternate arm order across repetitions to reduce drift. Capture one
  representative CDP CPU profile for cold and one for warm work, not
  every sample; include structural metrics when available.
- **Tracking prediction has a TypeRoof/HarfBuzz contract, not a browser
  screenshot oracle.** Use a simple deterministic shaping-derived
  spacing model and apply CSS letter-spacing correctly. Browser/OS
  engines may differ (including whether nonzero spacing decomposes an
  `fi` ligature); such disagreement may remain visibly diagnostic.
  Cross-product screenshot capture over macOS/Windows/Linux and
  Safari/Firefox/Chrome is explicitly not an acceptance/ACID test. A
  local browser probe may explain a case but does not define the
  contract. If tighter parity becomes necessary later, direct rendering
  or a redesigned applicator are legitimate responses.
- **Tracking opportunities are shaped-glyph gaps.** A line with N
  visible shaped glyphs has N−1 tracking increments: one between each
  adjacent pair, none after the final glyph. Segment/run boundaries
  remain continuous; the preceding run owns the cross-run gap. A
  ligated `fi` remains one glyph unless shaping features disable the
  ligature—tracking does not implicitly disable ligatures this cycle.
  A taken end hyphen is the final visible glyph: the preceding source
  glyph receives the tracking gap before it; the hyphen receives no
  trailing gap. A one-glyph line has zero tracking width.
- **Controlled Host fixture uses manual absolute geometry.** Its purpose
  is text-composition correctness, not fluid-column/runion testing:
  publish realistic 1920px screen / 1600px layout facts, then put an
  explicit `ManualHorizontalLayoutModel` with 280pt lineLength on a
  paragraph inside the much wider 1200pt parent. Assert CSS/local
  `layout/columnWidth` and composition all use 280pt; parent incoming
  `availableWidth` remains distinguishable. Include 280→220pt break
  changes, exact Greedy Ragged boundaries, Greedy Fit target tolerance,
  and a nested no-override child inheriting projected column width.
- **Small cooperative task abstraction now; finer checkpoints later.**
  Define/document one task protocol that can be drained synchronously
  or resumed asynchronously with work-budget, cancellation and immutable
  staleness checks. Keep upfront cost low: checkpoint only between Host
  phases/logical paragraphs; do not rewrite Greedy Fit internals.
  Schedule continuation through a rendering-friendly task boundary, not
  an unbounded microtask chain, and publish only complete atomic
  snapshots. Preserve a low-overhead direct sync path and benchmark the
  runner overhead. KP++ later adds candidate-batch/search checkpoints
  behind the same protocol.
- **Reveal mode is renderer/widget configuration, not document state.**
  Configure `UIDocumentViewer` at its TypeStage widget declaration
  (`lazy` default, `sync` option) via constructor/settings arguments.
  This is deployment/rendering policy, so Cycle 1 adds no TypeStage
  model field, PPS/UI or serialization. Promote it to runtime/authored
  state only if later use demonstrates that need.

## Open Questions

No operator-level design questions remain for plan creation. Resolved
in review:

- per-textblock demand with explicit meta source + applicator consumer
  lifecycle;
- immediate cancellation/unpublication/state drop on last consumer;
- cooperative async by default, explicit sync reveal/flush, atomic
  viewer source+composition snapshots, ProseMirror policy deferred;
- external profiling first, generic opt-in instrumentation only when
  needed, with documented metric purposes;
- five-sample cold/transition and 5-warmup+30-sample steady-state
  benchmark convention;
- authoritative textblock measure is the existing local
  `layout/columnWidth` (same fact consumed by AutoLinearLeading);
- deterministic manual 280pt Host fixture inside realistic 1600px
  layout environment;
- TypeRoof/HarfBuzz tracking contract: N−1 gaps between visible shaped
  glyphs, continuous across segments/runs, taken hyphen final, no
  implicit ligature decomposition;
- minimal cooperative task abstraction now (Host-phase/logical-
  paragraph checkpoints), KP++ search checkpoints later.

Implementation-level API naming, scheduler primitive and profiler hook
shape remain plan details, to be chosen against current framework
patterns and verified by the performance investigation.

## Phase 1 performance investigation (2026-10-05)

Phase 1 replaced the single aggregate Fit-versus-None burst with a
machine-readable Puppeteer/CDP harness. The harness stages immutable
fixtures for every editor/viewer/compare and None/Ragged/Fit arm, fails
unless the state is exactly 1,087 text leaves with the TypeStage layout
and requested mode/algorithm, and records the 1920×1080 viewport plus
measured layout geometry. It covers cold load, typing, relevant and
irrelevant style edits, full recomposition, renderer-mode transitions,
and algorithm transitions. Full mode uses five fresh cold samples and
5 warmups + 30 individually timed edits; quick mode reduces those
counts without changing the matrix. Generated JSON and CPU profiles are
under ignored artifacts/perf-composition/.

The first external CDP profile required no production instrumentation.
A representative editor-only Greedy Fit cold load was dominated by
Measurer cache maintenance and HarfBuzz extraction:

- Measurer._cacheSet: 2,010 ms + 646 ms + 638 ms self time;
- HarfBuzz getGlyphInfosAndPositions remained among the dominant named stacks;
- Measurer cache lookup and measureEm remained visible;
- garbage collection remained material.

This confirms that editor-only composition performs substantial shaping
and cache work although it has no applicator. The warm viewer Greedy Fit
full-recompose profile was much flatter (largest named samples included
scope resolution and DOM style writes at about 5 ms self each); its
501 ms program bucket means CPU sampling alone
cannot cleanly split the synchronous transaction. Publication
completion is therefore also captured externally by intercepting the
controller's existing publication log until Phase 2 introduces a stable
demand seam. No generic production hooks were added in Phase 1.

The checked-in milestone-4 baseline remains historical context rather
than the new baseline: at commit 521db920, 30-edit viewer Greedy Fit
bursts measured typing 4,232.7 ms versus None 4,162.2 ms (1.017x), and
full recomposition 9,216 ms versus None 7,278.6 ms (1.266x). Cycle 1
writes a replacement demand-aware baseline only in Phase 6 after the
lifecycle, scheduling, measure, and tracking contracts are complete.

The original exhaustive before run completed on Chrome 152 with a
1920x1080 viewport and verified 1600px layout. It contains 45 cold
samples (five per mode/algorithm arm) and 54 scenarios that originally
applied the steady 5+30 convention to transitions as well. Review found
that made the run unacceptably long; the corrected harness treats
transitions as five independent samples and reserves 5+30 for steady
operations only. Median cold shell-ready time was 5.36-6.78s
for None/Ragged and 12.07-13.05s for Fit. Active algorithms first
published at about 2.4-2.6s; Ragged completed all publications at
3.39-3.65s, while Fit required 9.15-9.58s. None emitted no publications.

Representative steady medians in milliseconds (None / Ragged / Fit):

| operation | editor | viewer | compare |
| --- | ---: | ---: | ---: |
| typing | 247.1 / 256.6 / 266.5 | 239.4 / 240.7 / 261.5 | 274.9 / 273.6 / 280.5 |
| shadowed style (originally mislabeled relevant) | 372.0 / 470.3 / 486.5 | 408.4 / 514.5 / 527.0 | 588.8 / 718.9 / 717.3 |
| irrelevant style | 419.9 / 533.2 / 525.8 | 453.9 / 569.5 / 574.4 | 646.1 / 762.7 / 775.6 |
| inherited-style partial recompose (10/209 blocks) | 437.9 / 546.5 / 575.2 | 440.6 / 566.8 / 580.4 | 701.6 / 842.7 / 837.3 |

Review found that the original relevant-style target was shadowed by the
linked t1/t2 TypeSpecs and published nothing, while the root font-size
edit reached only 10 of 209 textblocks. Those values are retained as
historical evidence of update/equality cost, not authoritative relevant
style or whole-document measurements. The harness now targets the
consumed paragraphs/t1 value, names the ten-block case explicitly, and
validates publication counts for every workload. Transitions now follow
the five-independent-sample convention rather than the steady 5+30
loop, and the default quick command uses representative arms only.

Editor-only active composition is therefore measurable despite having
no applicator: aggregate Ragged/Fit ratios versus None were 1.046/1.079
for typing, 1.253/1.313 for relevant style, 1.405/1.267 for irrelevant
style, and 1.250/1.348 for full recomposition. Transitioning to Fit was
the conspicuous worst case: 7.21s editor, 7.40s viewer and 7.58s compare
median, versus 0.67-1.03s for Ragged. The validated machine-readable
result remains generated evidence at /tmp/perf-composition-full.json;
it is not a repository baseline.
