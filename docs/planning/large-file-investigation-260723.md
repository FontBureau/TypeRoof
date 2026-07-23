---
title: 'Large File Investigation — Split Candidates'
eleventyNavigation:
  parent: Planning
  key: investigate-large-files
  title: 'Large File Investigation'
  order: 34
agent-created: true
---

# {{title}}

> **Status:** Analysis, 2026-07-23. A survey of the codebase against
> `docs/development/module-granularity.md`, ranking large files by how good a
> split candidate they are. No code was changed.

## Method

Every `.mjs` / `.js` / `.jsx` / `.ts` / `.tsx` file was measured, then the large
ones were checked against the two things the guideline actually cares about:

- **Internal seams** — does a region of the file reference the rest of it? Measured
  by counting cross-region symbol references, not by eyeballing the class list.
- **Consumer independence** — do different callers import different halves? Measured
  by resolving every relative import in the repo and tallying imported symbol names.

## Tier 1 — clear wins

### 1. `lib/js/components/basics.mjs` — 3595 lines, 55 importers

Two subsystems in one file: a component framework and a widget library. The tier
direction is *already clean* — lines 1–1659 (the framework) contain **zero**
references to any UI symbol below them.

| Region | Lines | Coupling found |
|---|---|---|
| Framework core — `UPDATE_STRATEGY*`, `_BaseComponent`, `SimpleProtocolHandler`, `ComponentWrapper`, `_CommonContainerComponent`, `_BaseContainerComponent`, dynamic collection/map containers | 1–1659 | self-contained; `_NOTDEF` / `DEFAULT` / `ComponentWrapper` never escape |
| Map widgets — `UIBaseMapKey`, `UIButton`, `_UIBaseMap` | 1660–2700 | uses `_DialogBase` + `_setClassesHelperMethod` |
| `_DialogBase`, `connectLabelWithInput`, input wrappers | 2701–2803, 3518–3595 | leaf |
| Drag/drop + list — `DRAGHANDLE_TEMPLATE`, the five `_*Method` helpers, `_UIBaseListItem`, `_UIBaseList` | 2804–3517 | **fully self-contained**, 715 lines |

Import counts confirm the seam matters. Distinct symbols imported across the repo:

```
 36 _BaseComponent
 31 _BaseContainerComponent
 10 _BaseDynamicCollectionContainerComponent
  9 SimpleProtocolHandler
  7 UPDATE_STRATEGY
  5 _DialogBase
  4 _UIBaseMap / _CommonContainerComponent / UPDATE_STRATEGY_NO_UPDATE
  3 _UIBaseList / _UIBaseListContainerItem / _BaseDynamicMapContainerComponent
    / _UIAbstractPlainInputWrapper / UIButton / HANDLE_CHANGED_AS_NEW
    / UPDATE_STRATEGY_COMPARE
  2 _UIAbstractPlainOrEmptyInputWrapper / setupTooltip
  1 connectLabelWithInput / UIBaseMapKey
```

Most of the 55 importers pull in 3.6k lines to get the framework.

Two things to get right:

- `_setClassesHelperMethod` is used by *both* the map and list regions. Promote it
  to a shared leaf module — do not pick a home for it (guideline rule 4).
- Keep `_BaseDynamicCollectionContainerComponent` and
  `_BaseDynamicMapContainerComponent` **with** the core. Base class plus subclass
  sharing non-trivial provisioning protocol is exactly the guideline's
  "keep together" case.

### 2. `lib/js/components/layouts/motion-stage.mjs` — 2768 lines, 26 sibling imports

Convert to a folder, mirroring `lib/js/components/layouts/type-stage/`, which is
already decomposed into 15 files.

- **Engine**, lines 1–495: `StageSizeNumberModel`, the `REGISTERED_*` maps,
  `openTypeFeaturesGen` (L377), `initAnimanion` (L484).
- **UI zones**, which map almost 1:1 onto controllers: `StageManager`,
  key moments (1077–1988), `PropertiesManager`, time controls (2470–2584),
  `MotionStageController`.

### 3. `lib/js/components/layouts/type-tools-grid.mjs` — 2218 lines, 30 sibling imports

The highest sibling-import count in the codebase — the guideline's own proxy
metric, flagged.

- **Engine:** models + deserializer (1–500), PPS maps (502–627), axis-location
  generators (1356–1594), grid defaults / `_applyDimensions` (1595–1714).
- **UI:** dimension sequence, tensor controller, grid scaffold / cells / grid,
  controller.

### 4. `lib/js/components/layouts/videoproof.typeroof.jsx` — 2396 lines

Three independent clusters:

- Layer drag & drop subsystem (130–806).
- `VideoproofModel` + actor-structure helpers (807–1305) — pure engine, so `.mjs`.
- Hue / color helpers (1640–1827) — another engine cluster.

## Tier 2 — good, lower urgency

- **`lib/js/components/axes-math.mjs`** (1263) — textbook engine/UI seam at line 502.
  A clean two-file split, the lowest-risk item in this document.
- **`lib/js/components/type-spec-fundamentals.mjs`** (1407) — two parallel link-map
  subsystems, seam at line 699.
- **`lib/js/components/animation-animanion.mjs`** (1210) — an engine file that ends
  with two `_BaseComponent` subclasses (883–1210). That is a tier violation;
  splitting there fixes it.
- **`lib/js/shell.mjs`** (1662) — `FontManager` (80–601) vs `ShellController`.
  Borderline: `FontManager` is private to the file, which the guideline says
  argues for keeping it.
- **`lib/js/components/generic.mjs`** (1257, 32 importers) — a flat catalogue of
  small independent widgets. The only real seam is the drop-target pair
  (1106–1257). A weak candidate despite the size.

## Explicitly not worth splitting

- **`lib/js/legacy/videoproof-controller.mjs`** — 7637 lines, the largest file in the
  repo, but legacy with a single importer (`lib/js/legacy/main.mjs:1`). Effort spent
  on code on its way out.
- **`lib/js/ot-feature-info.mjs`** (1047) — one annotated data table. Size without
  complexity; a reader forms the mental model immediately.
- **`lib/js/metamodel/`** — already a folder of ~10 files. `struct-model.ts` (1577)
  is one cohesive class.

## Two issues found in the guideline document

- The reference at `docs/development/module-granularity.md:118` points to
  `docs/planning/ramp-layout-coupling-based-decomposition.md`, which does not exist.
- Line 92 lists only `**/type-stage/*.*` as a directory allow-list. `.prettierignore`
  also has `**/ramp/*.*`, `lib/js/components/**/videoproof-contextual/*` and
  `lib/js/components/presets.mjs`.

  This matters for the Tier 1 items: if `basics.mjs` becomes a `basics/` folder of
  `.mjs` engine files, it needs a matching allow-list entry or those files silently
  drop out of prettier coverage.
