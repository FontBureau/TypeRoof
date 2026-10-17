---
date: 2026-10-03T19:22:37+02:00
git_commit: 425babab
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Sprint B: testing harness + performance baseline (text-composition)"
tags: [research, codebase, text-composition, testing, performance]
status: complete
---

# Research: Sprint B — harness + baseline

## Research Question

How do we build (a) a testing harness asserting composed line
structure from document inputs, and (b) a performance baseline (dummy
vs. OFF)? They build on each other (performance needs a rather
complete harness). Context: ROADMAP Sprint B; Sprint A concluded at
425babab.

## Summary

- **Harness**: the existing integration-test harness
  (lib/js/tests/type-stage-toggles/harness.mjs `buildWorld`) boots the
  REAL TypeStageController in jsdom with a document ingested from an
  HTML fixture and synchronous StateComparison updates. The
  composition controller already runs in it — but composes nothing
  because the harness widgetBus lacks `harfbuzz` (capability fallback
  works as designed). measurer.test.mjs already proves node-side
  harfbuzz + real font loading works. So the composition harness =
  buildWorld + harfbuzz on the bus + a real installed font + DOM
  assertions on the article. Composition is jsdom-safe: NO runtime
  DOM measurements anywhere in the pipeline (by design — line width
  from node-properties).
- **Baseline**: NO benchmark infrastructure exists (only a UI FPS
  readout). Puppeteer is a devDependency (scripts/create-clip-frames
  is the driving pattern: dev server on :3000, hash flags,
  `window.shell` handle, deterministic changeState stepping).
  Blocker found: **no TypeStage state files exist** in
  docs/states-library (all 9 are MotionStage) — fixture TypeStage
  states must be created (via the app, saved into the repo).

## Detailed Findings

### 1. Integration harness (reusable)

- `buildWorld()` (type-stage-toggles/harness.mjs:108-183): real
  TypeStageModel variant seeded from wikipedia initial-state JSON;
  fake InstalledFontModel with stub metrics (:109-124); document
  ingested from `lib/js/tests/fixtures/typography-small.html` via
  ingestWikipediaDocument (:131-149); DOMTool + zones (:154-155);
  environment@ handler pre-registered (:159-171); hand-rolled
  widgetBus (:172-180) — `changeState` THROWS (:176-178); ToggleRoot
  with ClassesAndStylesManager + TypeStageController (:57-88);
  `root.initialUpdate(state)` (:182-183).
- Driving updates: synchronous `root.update(new StateComparison(old,
  new))` after `world.setState(new)` (toggles/index.test.mjs:24-34).
- Assertions: plain DOM queries on `zones.get("layout")` →
  `article.typeroof-document` (viewer-behavior helpers :20-31); tests
  deliberately avoid viewer-internal classes (comment :5-8).
- Constraints: jsdom per-file docblock; no global testTimeout
  (individual 300_000 precedent — full-article provisioning ~1 min,
  harness.mjs:126-130); fixture paths relative to repo root;
  describe.skipIf(!HAVE_FIXTURE) guard pattern.
- **Missing for composition**: `harfbuzz` on the harness widgetBus
  (the controller degrades to OFF, composition-controller.ts:217-223)
  and a font with real hbFace (the stub font has fake metrics).
  measurer.test.mjs proves both work in node (RobotoFlex via
  decompressFontBuffer + createFontObject + harfbuzz.Face).

### 2. Performance infrastructure

- Nothing existing: no benchmark harness, no performance.mark/measure
  in lib/js or scripts; only UIFramesPerSecond (motion-stage.mjs:2666).
- Puppeteer ^25.8.0 devDependency; scripts/create-clip-frames pattern:
  launch chromium (executablePath /usr/bin/chromium-browser), URL with
  `#[no-chrome,autopause]from-url:<state>`, poll `window.shell`, read
  state via `shell.getEntry('activeState')`, deterministic
  `shell.changeState(() => { ... })` stepping (:26-84).
- Dev server: `npm run dev` → vite on :3000 (vite.config.js:108-110);
  app entry /app/player/index.html; shell.html for the full app.
  No programmatic server start anywhere (scripts assume a running
  server).
- Hash flags: shell.mjs:841-889 (from-url/from-hash, uiFlags).
- **Fixture gap**: no TypeStage states in docs/states-library (9x
  MotionStage). TypeStage IS registered in main-player
  (main-player.mjs:60-65) and is the wikipedia app's layout. Fixture
  TypeStage states must be created and committed (source of truth for
  the baseline).

### 3. Observable surface (for assertions)

- DOM: `.typeroof-composed` on textblocks; line spans
  `.typeroof-composition-line` (+ `-line-first`,
  `-paragraph-first-line`, `-hyphen`), `--line-color-code` per line;
  carrier `.typeroof-composition-run` for mark-less runs; line spans
  live in the innermost mark wrapper or the carrier
  (viewer.typeroof.jsx:585-720).
- Payload: `{textblockPath, leaves: [{path}], paragraphs: [{segments,
  result}], sources}` (composition-controller.ts:438-447).
- Registry read: reachable via the layout controller's
  getProtocolHandlerImplementation("composition@")
  (index.typeroof.jsx:334-343) — a harness CAN read published payloads
  (stronger than DOM scraping for structure assertions; DOM assertions
  still cover the applicator).
- jsdom: no DOM measurements in the pipeline (grep offsetWidth/
  getBoundingClientRect in text-composition/ + viewer: no matches) —
  composition results in jsdom equal those in a real browser (given
  the same font), modulo CSS-only visuals.

## Code References

- `lib/js/tests/type-stage-toggles/harness.mjs:108-183` — buildWorld
- `lib/js/tests/fixtures/typography-small.html` — HTML document fixture
- `lib/js/components/layouts/type-stage/text-composition/measurer.test.mjs` — node-side harfbuzz + real font precedent
- `scripts/create-clip-frames:18-84` — puppeteer driving pattern
- `vite.config.js:108-110` — dev server :3000
- `lib/js/shell.mjs:841-889` — hash flags / state loading
- `lib/js/components/layouts/type-stage/viewer.typeroof.jsx:585-720` — applicator DOM surface
- `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts:438-482` — payload + publication

## Follow-up Decisions (2026-10-03, review session)

1. **Log spam fixed**: the no-harfbuzz capability-fallback warning
   now fires ONCE per controller instance (it spammed test output,
   where the fallback is the norm).
2. **Regression detection (agreed approach)**: own
   `npm run perf:composition` script (puppeteer vs. dev server,
   create-clip-frames pattern); measure N update cycles with
   textComposition ON vs OFF; key metric is the overhead RATIO
   (t_on/t_off — machine-stable, unlike absolute ms). Checked-in
   baseline SNAPSHOT (JSON next to the fixture: gitCommit, date,
   metrics), updated deliberately so the commit documents legitimate
   cost changes and PR diffs show performance movement; deviations
   beyond a factor (~1.5x) flag a regression (exit code). NOT git
   commits as compare points (slow/flaky checkout+rebuild per
   comparison). Console table + optional gitignored local history;
   CI gating later, start informational.
3. **Fixtures**: the type-stage default state (wikipedia
   initial-state JSON, already used by the harness) becomes the
   SMALL fixture (copied into lib/js/tests/fixtures/); a current
   wikipedia-app export becomes the LARGE fixture — explicitly a
   snapshot-in-time (wikipedia output is in flux; it can export
   right away).

4. **Q3 RESOLVED — extend buildWorld with an options object**
   ({harfbuzz, font}, defaults = today's stub + no harfbuzz, so
   existing tests keep exact behavior). One harness to maintain; the
   boot wiring is the valuable shared part.

All questions resolved; research phase complete.

## Open Questions

1. Fixture TypeStage state(s): create via the running app and commit
   — how many/sizes (one small for the harness, one larger for the
   baseline)? Where do they live (lib/js/tests/fixtures/ +
   docs/states-library/)?
2. Baseline timing target: measure the composition path only
   (changeState cycles with/without textComposition) or full frame
   cost? And where do baseline NUMBERS live (a checked-in results
   file? CI gate vs. informational)?
3. Harness real font: install the RobotoFlex-based font into the
   harness's installedFonts (real hbFace via createFontObject) — the
   fake-stub pattern is per-test-file; extend buildWorld or a
   composition-specific variant?
