---
eleventyNavigation:
  key: Refactoring ramp/ — coupling-based decomposition
  parent: Planning
agent-created: true
---

# Refactoring `lib/js/components/layouts/ramp/` — Coupling‑Based Decomposition

## Status and Scope

**Status:** proposal / research document. No code changes yet.

**Executing this plan without the original authoring context?** Start at **"Hand-Off Section (for cold executor)"** near the bottom — it has the source-material pointers, verification commands, rename table, external-consumer audit, open-question defaults, and rollback policy you need.

**Source of truth:** the pre‑split file `lib/js/components/layouts/type-spec-ramp.typeroof.jsx` at commit `e18fbcb` (4700 lines). Retrievable via `git show e18fbcb:lib/js/components/layouts/type-spec-ramp.typeroof.jsx`.

**Input considered as suggestion only:** the current 39‑file decomposition under `lib/js/components/layouts/ramp/` introduced by commit `b1bce69` ("Refactor ramp layout into multiple files"). File names and groupings are *not* treated as authoritative — they are reviewed against the actual coupling in the source of truth.

**Guiding spine:** `TypeSpecRampController` (lines 4362–4700 of the old file, now `index.typeroof.jsx`). Its `zones` map and its `widgets` array enumerate the top‑level functional surfaces of the ramp layout and are the most reliable subdivision signal in the codebase.

## Motivation

The 4700‑line file was hard to read on first contact. The mechanical remedy — one class per file, 39 files — solved the first‑contact problem by creating two new ones:

1. **Lost cohesion.** Symbols that always change together are now scattered. Example: `PATH_SPEC_AUTO_LINEAR_LEADING`, `AutoLinearLeadingSyntheticValue`, `fillTreeFromPaths`, and `SyntheticValue` form one conceptual unit (the synthetic‑value / path‑spec engine) and are now spread across three files.
2. **Misleading file names.** Several files are named for a symbol they contain but not for the subsystem they actually implement. The clearest case is `get-type-spec-defaults-map.mjs` (588 lines), whose primary content is the *typeSpec properties generator pipeline* (fontGen, fontSizeGen, marginsGen, leadingGen, axisLocationsGen, …) plus `REGISTERED_GENERIC_TYPESPEC_FIELDS`; `_getTypeSpecDefaultsMap` itself is a ~60‑line tail.

This document proposes a **coupling‑based decomposition** sized between the two extremes: one *file* per cohesive sub‑responsibility, not one *class*.

## Method

1. Read the old file end‑to‑end, noting every top‑level declaration and its line range (done — see inventory below).
2. Cross‑reference each declaration against `TypeSpecRampController`'s composition (what the controller actually imports/instantiates).
3. Identify internal references between declarations (`grep -n`) to expose local coupling (helper ↔ client).
4. Compare against the current 39‑file split: for each new file, ask whether its name describes its contents and whether its neighbors are truly independent or artificially separated.
5. Propose groupings where the seams follow *decisions likely to change together* rather than syntactic class boundaries.

## Inventory of the Old File

Line ranges below are from `/tmp/ramp-old.jsx` (i.e. `e18fbcb:lib/js/components/layouts/type-spec-ramp.typeroof.jsx`).

| Lines | Symbol | Kind | Notes |
|---|---|---|---|
| 1–147 | (imports + module header) | — | Imports from metamodel, basics, generic, color, prosemirror integration, type‑spec models, language tags, etc. |
| 149–222 | `TypeSpecRampModel` | model | Top‑level layout model with coherence function seeding defaults from `typespec-ramp-initial-state.json`. |
| 225–254 | `_uniqueKey` | util | Local helper for generating unique numeric keys. Used by tree editors / maps. |
| 256–772 | `_BaseTreeEditor` | base component | 516 lines. Generic tree editor, intended to be reusable beyond ramp. |
| 773–802 | `TypeSpecTreeEditor` | component | Thin subclass of `_BaseTreeEditor`. |
| 803–834 | `UIFontLabel` | tiny component | Used only inside `TypeSpecPropertiesManager` (line 1197). |
| 835–929 | `_excludesTypeSpecPPSMap`, `getTypeSpecPPSMap`, `_excludesNodeSpecPPSMap`, `getNodeSpecPPSMap` | PPS-map builders | Two near‑identical functions for typeSpec / nodeSpec PPS maps. |
| 931–958 | `TYPESPEC_PPS_MAP`, `NODESPEC_PPS_MAP` | constants | Built from the functions above. |
| 960–1046 | `_NOTDEF`, `_getFallback`, `typeSpecGetDefaults` | defaults | Shared fallback + per‑typeSpec default resolution. |
| 1048–1066 | `getRequireUpdateDefaultsFn`, `nodeSpecGetDefaults` | defaults | NodeSpec counterpart. |
| 1068–1338 | `TypeSpecPropertiesManager` | large component | 270 lines. Uses `UIFontLabel`. |
| 1340–1368 | `UICompositeStylePatchItem` | list item | Used only by `UICompositeStylePatch`. |
| 1370–1409 | `UICompositeStylePatch` | list | Used inside `UIStylePatch`. |
| 1411–1575 | `UIStylePatch` | large component | 164 lines. |
| 1577–1691 | `_BaseByPathContainerComponent` | base component | Shared parent for `StylePatchPropertiesManager` and `NodeSpecPropertiesManager`. |
| 1693–1753 | `StylePatchPropertiesManager` | component | Extends `_BaseByPathContainerComponent`. |
| 1755–1825 | `NodeSpecPropertiesManager` | component | Extends `_BaseByPathContainerComponent`. |
| 1827–1841 | `SimpleSelect` | tiny component | Used only inside `_UIBaseMap` subclasses below. |
| 1843–1873 | `MapSelectButton` | tiny component | Used only inside `_UIBaseMap` subclasses below. |
| 1875–1974 | `UIStylePatchesMap` | map component | Uses `SimpleSelect`, `MapSelectButton`. |
| 1976–2053 | `UINodeSpecMap` | map component | Uses `MapSelectButton`. Structurally parallel to `UIStylePatchesMap`. |
| 2055–2073 | `SyntheticValue` | data class | Used across the typespecnion engine. |
| 2074–2082 | `mapSetProperties` | util | Used by typespecnion classes. |
| 2084–2207 | `LocalScopeTypeSpecnion` | typespecnion | Local (non‑inheriting) scope. |
| 2208–2268 | `_BaseTypeSpecnion` | typespecnion base | Shared base. |
| 2269–2308 | `PatchedTypeSpecnion` | typespecnion | Created by `HierarchicalScopeTypeSpecnion.getPatched()`. |
| 2310–2486 | `HierarchicalScopeTypeSpecnion` | typespecnion | The full hierarchical variant. |
| 2487–2497 | `PATH_SPEC_AUTO_LINEAR_LEADING` | constant | Path‑spec for auto‑linear leading. |
| 2498–2532 | `_fillTreeGetNodeFromRegistry`, `fillTreeFromPaths` | utils | Path‑spec helpers. |
| 2533–2680 | `AutoLinearLeadingSyntheticValue`, `pathSpecPathsGen`, `pathSpecValuesGen`, `leadingGen` | synthetic‑value + generators | Leading algorithm specifics. |
| 2681–2786 | `fontGen`, `baseFontSizeGen`, `fontSizeGen` | generators | Properties generators for font/fontSize. |
| 2787–2823 | `createMargin`, `marginsGen` | generator | Block margins. |
| 2825–2907 | `calculateFontAxisValueSynthetic`, `axesMathAxisLocationValueGen`, `axisMathLocationsGen`, `axisLocationsGen` | generators | Axis locations (incl. axes‑math). |
| 2909–2958 | `REGISTERED_GENERIC_TYPESPEC_FIELDS`, `TYPE_SPEC_PROPERTIES_GENERATORS` | registration | Public surface of the generator pipeline. |
| 2960–3085 | `TypeSpecLiveProperties` | live‑properties component | Consumes the generator pipeline at runtime. |
| 3087–3209 | `StylePatchSourceLiveProperties` | live‑properties component | StylePatch counterpart. |
| 3211–3281 | `StyleLinkLiveProperties` | live‑properties component | StyleLink counterpart. |
| 3283–3324 | `StylePatchSourcesMeta` | meta component | Dynamic‑map container over style patches. |
| 3326–3379 | `TypeSpecChildrenMeta` | meta component | Dynamic‑map container over typeSpec children. |
| 3381–3439 | `StyleLinksMeta` | meta component | Dynamic‑map container over style links. |
| 3441–3494 | `TypeSpecMeta` | meta composition | Composes the three live‑properties + three meta components above. |
| 3496–3511 | `GenericUpdater` | tiny helper | Used only by `UIDocumentTextRun`. |
| 3513–3712 | `UIDocumentTextRun` | prosemirror component | 199 lines. |
| 3714–3743 | `UIDocumentElementTypeSpecDropTarget` | drop target | Used by document element. |
| 3745–3787 | `ProseMirrorGeneralDocumentStyler` | prosemirror component | |
| 3789–3929 | `UIDocumentElement` | prosemirror component | 140 lines. |
| 3931–4001 | `UIDocumentNode` | prosemirror component | |
| 4003–4175 | `UIDocumentNodes` | prosemirror component | 172 lines. |
| 4177–4215 | `UIDocument` | prosemirror composition | Top‑level document UI. |
| 4217–4280 | `ProseMirrorContext` | prosemirror container | Top‑level ProseMirror mount. |
| 4282–4300 | `_skipPrefix`, `_skipFullKey` | constants | Defaults‑map filters. |
| 4301–4360 | `_getTypeSpecDefaultsMap` | function | The actual defaults‑map builder. |
| 4362–4699 | `TypeSpecRampController` | controller | Composition root. |
| 4700 | `export { Model, Controller }` | exports | Public API of the layout. |


## Coupling Observations

Reading the inventory against the controller and against internal `grep` references exposes the following coupling facts. These are the load‑bearing constraints any decomposition must respect.

### Controller‑level composition surface

`TypeSpecRampController` directly instantiates (in order of widget list):

- `StylePatchSourcesMeta` — from the meta subsystem
- `TypeSpecMeta` — from the meta subsystem (consumes `TYPE_SPEC_PROPERTIES_GENERATORS`, `isInheritingPropertyFn`, `typeSpecDefaultsMap`)
- `TypeSpecTreeEditor` — tree editor subsystem
- `TypeSpecPropertiesManager` — typeSpec properties editor
- `UIStylePatchesMap` — style‑patches subsystem
- `StylePatchPropertiesManager` — style‑patches subsystem
- `ProseMirrorContext` — prosemirror subsystem (brings in `UIDocument*`, `UIProseMirrorMenu`, etc.)
- `UINodeSpecMap` — node‑spec subsystem
- `NodeSpecPropertiesManager` — node‑spec subsystem
- `UINodeSpecToTypeSpecLinksMap` — imported from `type-spec-fundamentals.mjs`, not local
- Plus generic widgets: `Collapsible`, `SelectAndDragByOptions`, `WasteBasketDropTarget`, `UICheckboxInput`.

It also uses `_getTypeSpecDefaultsMap` and `TYPE_SPEC_PROPERTIES_GENERATORS` as non‑widget values.

**The controller's composition surface is the public API of the ramp package.** Anything it names is an entry point. Anything else is internal.

### Internal couplings (helper ↔ client)

Verified by `grep` on the source of truth:

- `UIFontLabel` → used only by `TypeSpecPropertiesManager`.
- `SimpleSelect` → used only inside `UIStylePatchesMap` (the reverse‑dependency section below corrects an earlier assumption that `UINodeSpecMap` also used it — it does not).
- `MapSelectButton` → used inside both `UIStylePatchesMap` and `UINodeSpecMap` bodies.
- `UICompositeStylePatchItem` → used only inside `UICompositeStylePatch`.
- `UICompositeStylePatch` → used only inside `UIStylePatch`.
- `_BaseByPathContainerComponent` → shared parent for `StylePatchPropertiesManager` **and** `NodeSpecPropertiesManager`. This is cross‑subsystem coupling via inheritance — the only such case in the file.
- `GenericUpdater` → used only inside `UIDocumentTextRun`.
- `PatchedTypeSpecnion` → created by `HierarchicalScopeTypeSpecnion.getPatched()` only.
- `SyntheticValue` → used pervasively across the typespecnion + generator code (classes *and* generator functions).
- `fillTreeFromPaths` + `_fillTreeGetNodeFromRegistry` + `PATH_SPEC_AUTO_LINEAR_LEADING` + `AutoLinearLeadingSyntheticValue` → form one path‑spec micro‑module. `fillTreeFromPaths` is imported from leading generation; the constant feeds the synthetic value; they are one conceptual unit.
- `TYPESPEC_PPS_MAP` / `NODESPEC_PPS_MAP` → built from `getTypeSpecPPSMap` / `getNodeSpecPPSMap`. The two builder functions share structure via `_excludesTypeSpecPPSMap` / `_excludesNodeSpecPPSMap`.
- `typeSpecGetDefaults` / `nodeSpecGetDefaults` → parallel defaults resolvers, share `_NOTDEF` sentinel and `_getFallback` helper.

### Functional zones from the controller

The controller's `zones` map is itself a subsystem list:

| Zone | Declarations rooted here |
|---|---|
| `type_spec-manager` | `TypeSpecTreeEditor` (+ `_BaseTreeEditor` base), `SelectAndDragByOptions`, `WasteBasketDropTarget`. |
| `properties-manager` | `TypeSpecPropertiesManager`, `UIFontLabel`. |
| `style_patches-manager` | `UIStylePatchesMap`, `StylePatchPropertiesManager`, `UIStylePatch`, `UICompositeStylePatch`, `UICompositeStylePatchItem`, `SimpleSelect`, `MapSelectButton` (partly shared). |
| `node_spec-manager` | `UINodeSpecMap`, `NodeSpecPropertiesManager`, `MapSelectButton` (partly shared), `UINodeSpecToTypeSpecLinksMap` (external). |
| `editor-manager` / `prose-mirror-editor-menu` | `ProseMirrorContext`, `UIDocument`, `UIDocumentNodes`, `UIDocumentNode`, `UIDocumentElement`, `UIDocumentElementTypeSpecDropTarget`, `UIDocumentTextRun`, `ProseMirrorGeneralDocumentStyler`, `GenericUpdater`. |
| (no zone — invisible engine) | Typespecnions (`_BaseTypeSpecnion`, `LocalScopeTypeSpecnion`, `HierarchicalScopeTypeSpecnion`, `PatchedTypeSpecnion`), `SyntheticValue`, properties generators, path‑spec helpers, PPS maps, defaults resolvers, `*LiveProperties`, `*Meta`, `TypeSpecMeta`. |

The last row is *not* a zone — it is the **engine** that powers every zone. It should be a separate top‑level division in the folder structure, not scattered alongside UI files.


## Review of the Current 39‑File Split

### Name hints that hold ground

These files are named after their contents *and* their contents form a cohesive unit:

- `base-tree-editor.typeroof.jsx` (551 lines) — correctly groups `_BaseTreeEditor` with `TypeSpecTreeEditor`. The base and its only subclass in the file belong together; this is the kind of pairing a coupling‑based split *should* preserve. One of the better outcomes of the current split.
- `base-type-specnion.typeroof.jsx` (333 lines) — groups `_BaseTypeSpecnion`, `LocalScopeTypeSpecnion`, `HierarchicalScopeTypeSpecnion`, `PatchedTypeSpecnion` together. Also correct: these four classes are the typespecnion subsystem and always change together.
- `fill-tree-from-paths.mjs` — the name describes the content, although the content is too thin to warrant its own file (see below).
- `path-spec-gen.mjs` — same comment: correct name, too thin.
- `synthetic-value.mjs` — correct name, too thin.
- `ui-document-text-run.typeroof.jsx` — correct name; the file however omits `GenericUpdater`, which is used exclusively here.
- `type-spec-meta.typeroof.jsx` — correct name (composition of live‑properties + meta children).

### Name hints that do NOT hold ground

The most important findings:

- **`get-type-spec-defaults-map.mjs` (588 lines) is misnamed.** Its primary contents are the **properties generator pipeline** (`pathSpecPathsGen`, `pathSpecValuesGen`, `fontGen`, `baseFontSizeGen`, `fontSizeGen`, `createMargin`, `marginsGen`, `AutoLinearLeadingSyntheticValue`, `leadingGen`, `axisLocationsGen`, `axesMathAxisLocationValueGen`, `axisMathLocationsGen`, `calculateFontAxisValueSynthetic`, `openTypeFeaturesGen`, `languageTagGen`) plus `REGISTERED_GENERIC_TYPESPEC_FIELDS` and the local `_skipPrefix` / `_skipFullKey` filters. `_getTypeSpecDefaultsMap` itself is the ~60‑line tail. The file should be split **by concern**, and most of its content belongs in a `typespec-properties-generators.mjs` (or similar) module that is *also* imported by `TypeSpecMeta`/`TypeSpecLiveProperties` rather than bound to a defaults‑map name.
- **`typespec-pps-map.mjs` vs `nodespec-pps-map.mjs`** — two separate files for two near‑parallel PPS‑map builders. They share the same structural shape (`_excludes*` set → builder function → exported constant). Having them as siblings in the same small module would make the parallel visible; as two files it is invisible. Also, the hyphenation is inconsistent: `typespec-pps-map.mjs` vs `node-spec-properties-manager.typeroof.jsx` (with hyphen). The repo should pick one.
- **`type-spec-get-defaults.mjs`** (123 lines) and **the `nodeSpecGetDefaults` half of `node-spec-properties-manager.typeroof.jsx`** — the two parallel defaults resolvers (`typeSpecGetDefaults`, `nodeSpecGetDefaults`) share the `_NOTDEF` sentinel and `_getFallback` helper. Splitting them loses the parallel.
- **`simple-select.typeroof.jsx` (18 lines)** — used only by `UIStylePatchesMap` and `UINodeSpecMap`. Its own file hides that it is a *private helper* of those two map components. Same for **`map-select-button.typeroof.jsx` (33 lines)**.
- **`ui-composite-style-patch-item.typeroof.jsx` (30 lines)** and **`ui-composite-style-patch.typeroof.jsx` (30 lines)** — `UICompositeStylePatchItem` is used only by `UICompositeStylePatch`, which is used only by `UIStylePatch`. Three files for one chain that always changes together.
- **`ui-document-element-type-spec-drop-target.typeroof.jsx` (32 lines)** — legible filename for a tiny drop target that belongs with `UIDocumentElement`.
- **`ui-font-label.typeroof.jsx` (32 lines)** — used only by `TypeSpecPropertiesManager`. Its own file hides that coupling.
- **`generic-updater.mjs` (11 lines)** — used only by `UIDocumentTextRun`. Should live in the text‑run file or in a prosemirror‑utils module.
- **`prose-mirror-general-document-styler.typeroof.jsx`** and **`prose-mirror-context.typeroof.jsx`** — live in the ramp folder but are thin wrappers over imports from `../prosemirror/`. They are prosemirror‑composition concerns of ramp and can reasonably live together in one file.

### Naming consistency issues

- Two spellings of the same prefix: `nodespec-` (compact) vs `node-spec-` (hyphenated). Pick `type-spec-` / `node-spec-` consistently — matches the codebase's existing `type-spec-models.mjs`, `type-spec-fundamentals.mjs`, `type-spec-ramp.typeroof.jsx`.
- `.typeroof.jsx` is used for files containing JSX or using the project's custom JSX pragma; `.mjs` for plain modules. This seems consistent in the current split, but is not documented as a convention anywhere. Worth adding a line to `CODINGSTYLE.md`.


## Proposed Decomposition

A middle ground: one file per cohesive sub‑responsibility, not one per class. The proposed target is **~12–14 files**, organised in two tiers:

1. **Engine tier** — non‑UI, type‑spec semantics and properties pipeline. No widgets, no zones.
2. **UI tier** — per‑zone user‑facing components.

Plus the composition root (`index.typeroof.jsx`, keeping the current filename).

### Target layout

```
lib/js/components/layouts/ramp/
├── index.typeroof.jsx                      Controller + Model, public exports
│
│  Engine tier
├── model.mjs                                (optional split of TypeSpecRampModel from index if index grows)
├── pps-maps.mjs                             typespec + nodespec PPS-map builders (parallel pair)
├── defaults.mjs                             _NOTDEF, _getFallback, typeSpecGetDefaults, nodeSpecGetDefaults,
│                                            getRequireUpdateDefaultsFn, _skipPrefix, _skipFullKey,
│                                            _getTypeSpecDefaultsMap
├── synthetic-values.mjs                     SyntheticValue, fillTreeFromPaths, _fillTreeGetNodeFromRegistry,
│                                            PATH_SPEC_AUTO_LINEAR_LEADING, AutoLinearLeadingSyntheticValue,
│                                            pathSpecPathsGen, pathSpecValuesGen
├── properties-generators.mjs                fontGen, baseFontSizeGen, fontSizeGen, createMargin, marginsGen,
│                                            leadingGen, axisLocationsGen (+ axes-math helpers),
│                                            calculateFontAxisValueSynthetic, openTypeFeaturesGen,
│                                            languageTagGen, REGISTERED_GENERIC_TYPESPEC_FIELDS,
│                                            TYPE_SPEC_PROPERTIES_GENERATORS
├── type-specnion.mjs                        _BaseTypeSpecnion, LocalScopeTypeSpecnion,
│                                            HierarchicalScopeTypeSpecnion, PatchedTypeSpecnion,
│                                            mapSetProperties
├── live-properties.typeroof.jsx             TypeSpecLiveProperties, StylePatchSourceLiveProperties,
│                                            StyleLinkLiveProperties
├── meta.typeroof.jsx                        StylePatchSourcesMeta, TypeSpecChildrenMeta, StyleLinksMeta,
│                                            TypeSpecMeta
│
│  UI tier
├── shared.typeroof.jsx                      _uniqueKey, _BaseByPathContainerComponent
│                                            (the only genuinely cross-zone UI helpers)
├── tree-editor.typeroof.jsx                 _BaseTreeEditor, TypeSpecTreeEditor
├── type-spec-properties.typeroof.jsx        TypeSpecPropertiesManager + UIFontLabel
├── style-patches.typeroof.jsx               UIStylePatchesMap, UIStylePatch, UICompositeStylePatch,
│                                            UICompositeStylePatchItem, StylePatchPropertiesManager,
│                                            SimpleSelect, MapSelectButton
│                                            (everything in the style_patches-manager zone + the two
│                                            _UIBaseMap helpers that are shared with node-specs — the
│                                            shared helpers could alternatively move to shared.typeroof.jsx;
│                                            see "Open questions")
├── node-specs.typeroof.jsx                  UINodeSpecMap, NodeSpecPropertiesManager
└── prosemirror.typeroof.jsx                 ProseMirrorContext, UIDocument, UIDocumentNodes,
                                             UIDocumentNode, UIDocumentElement,
                                             UIDocumentElementTypeSpecDropTarget,
                                             UIDocumentTextRun, GenericUpdater,
                                             ProseMirrorGeneralDocumentStyler
```

Total: ~14 files, each aligned with a **subsystem** rather than a class.

### Why this shape

- **The engine tier makes the invisible visible.** The old file had no clear boundary between "UI components" and "the properties/typeSpecnion engine that powers them". The new split scatters both into one flat folder. Giving the engine its own set of sibling files — even in the same folder — lets a reader skim filenames and see what is UI vs. what is semantics.
- **The UI tier maps 1:1 to the controller's zones.** Someone reading `index.typeroof.jsx` can follow each widget entry back to exactly one UI file.
- **Shared UI helpers get one file, not six.** `_BaseByPathContainerComponent`, `_uniqueKey`, and arguably `SimpleSelect`/`MapSelectButton` are the only genuinely cross‑zone UI helpers. One shared file keeps them visible without the 6‑file overhead.
- **Engine sequence follows dependency direction.** Read top‑to‑bottom: `pps-maps` → `defaults` → `synthetic-values` → `properties-generators` → `type-specnion` → `live-properties` → `meta`. Each step consumes only earlier ones.
- **File sizes land in the sweet spot.** Rough estimates from the inventory:
    - `tree-editor`: ~540 lines
    - `style-patches`: ~720 lines (largest UI file; still scannable; could be split further if needed)
    - `prosemirror`: ~700 lines
    - `properties-generators`: ~450 lines
    - `type-specnion`: ~400 lines
    - `type-spec-properties`: ~300 lines
    - `meta` + `live-properties`: ~300 lines each
    - Engine helpers: 50–150 lines each
    - The remaining UI files: 150–300 lines each
  All within "readable in one sitting" range. None approaches 4700.

### Symbols and the controller's contract

The controller currently imports the following named symbols (from the old file's top level, now spread across the new folder):

`StylePatchSourcesMeta`, `TypeSpecMeta`, `TypeSpecTreeEditor`, `TypeSpecPropertiesManager`, `UIStylePatchesMap`, `StylePatchPropertiesManager`, `ProseMirrorContext`, `UINodeSpecMap`, `NodeSpecPropertiesManager`, `_getTypeSpecDefaultsMap`, `TYPE_SPEC_PROPERTIES_GENERATORS`.

In the proposed layout these come from, respectively:

`meta.typeroof.jsx` (×2), `tree-editor.typeroof.jsx`, `type-spec-properties.typeroof.jsx`, `style-patches.typeroof.jsx` (×2), `prosemirror.typeroof.jsx`, `node-specs.typeroof.jsx` (×2), `defaults.mjs`, `properties-generators.mjs`.

Eight import sources instead of the current nine‑plus. No symbol renaming required.


## Empirical Validation: Import Graph

The proposed decomposition was checked against the actual import graph of the current 39‑file folder. Raw data captured in `/tmp/ramp-graph.txt` (generated by `/tmp/ramp-import-graph.sh`).

### Reverse‑dependency findings that confirm the proposal

Each of these is a "used by exactly N siblings" fact, verified by `grep`:

- `ui-font-label` → used by 1 (`type-spec-properties-manager`). Merge confirmed.
- `generic-updater` → used by 1 (`ui-document-text-run`). Merge confirmed.
- `prose-mirror-general-document-styler` → used by 1 (`prose-mirror-context`). Merge confirmed.
- `ui-composite-style-patch-item` → used by 1 (`ui-composite-style-patch`). Chain confirmed.
- `ui-composite-style-patch` → used by 1 (`ui-style-patch`). Chain confirmed.
- `simple-select` → used by 1 (`ui-style-patches-map`). Private helper confirmed. (Note: the inventory above stated "style + node-spec"; the graph shows node-spec does **not** import `simple-select`, only `map-select-button`. Inventory corrected.)
- `map-select-button` → used by 2 (`ui-node-spec-map`, `ui-style-patches-map`). Genuine cross‑zone helper.
- `base-by-path-container-component` → used by 2 (`node-spec-properties-manager`, `style-patch-properties-manager`). Genuine cross‑zone base.
- `fill-tree-from-paths`, `path-spec-gen`, `synthetic-value` → all bundle into one consumer chain inside `get-type-spec-defaults-map.mjs`. Consolidation into `synthetic-values.mjs` is pure win.
- `ui-document-element-type-spec-drop-target` → imported by 0 siblings but referenced from the prosemirror chain via indirect use. Belongs in `prosemirror.typeroof.jsx`.

### Reverse‑dependency findings that refine the proposal

1. **`get-type-spec-defaults-map.mjs` exports *two* generator registries, not one.** In addition to `TYPE_SPEC_PROPERTIES_GENERATORS`, it also exports `STYLE_PATCH_PROPERTIES_GENERATORS` (consumed by `style-patch-source-live-properties.typeroof.jsx`). Both registries reuse the same individual generators (`colorsGen`, `fontGen`, `baseFontSizeGen`, `fontSizeGen`, `openTypeFeaturesGen`, `languageTagGen`, `getPropertiesBroomWagonGen`). Also, `axisLocationsGen` is exclusive to typeSpec while `axisMathLocationsGen` is exclusive to stylePatch. **Both registries belong together in `properties-generators.mjs`.** The file's current name is therefore even more misleading than the initial read suggested — it contains *two* public registries plus their shared generator library, plus the defaults‑map tail.

2. **`type-spec-get-defaults.mjs` is imported by 4 files across three proposed zones** (`get-type-spec-defaults-map`, `type-spec-properties-manager`, `ui-style-patch`, `node-spec-properties-manager`). This is fine — `defaults.mjs` in the engine tier is imported by UI files. The tier rule is UI→engine only, which this respects.

3. **`typespec-pps-map.mjs` is imported by 3 files** (engine: `get-type-spec-defaults-map`; UI: `type-spec-properties-manager`, `ui-style-patch`). Same pattern. Confirms `pps-maps.mjs` belongs in the engine tier.

4. **`base-type-specnion` is imported by 2 files** (`get-type-spec-defaults-map`, `type-spec-live-properties`). Its `PatchedTypeSpecnion` is a returned value, not a constructor argument — consumers use it by receiving instances, not by constructing them. Consolidation in `type-specnion.mjs` remains correct.

### Import‑count measurement

Current 39‑file layout:

| Metric | Count |
|---|---|
| Files | 39 |
| Total `import` statements | 160 |
| — sibling (`./`) | 49 |
| — external (`../`) | 85 |
| — npm packages | 0 |

Projected 14‑file layout (helpers in `shared`, see Open Questions 1 & 2):

| Metric | Count | Δ vs. current |
|---|---|---|
| Files | 14 | −25 (−64 %) |
| Total `import` statements | 83 | **−77 (−48 %)** |
| — sibling (`./`) | 23 | −26 |
| — external (`../`) | 60 | −25 |

Per‑target projection (from `/tmp/projection.txt`, helpers‑in‑shared variant):

```
index                     members=1  external=6  sibling=7
pps-maps                  members=2  external=4  sibling=0
defaults                  members=1  external=2  sibling=0
synthetic-values          members=3  external=1  sibling=0
properties-generators     members=1  external=3  sibling=4
type-specnion             members=1  external=1  sibling=1
live-properties           members=3  external=2  sibling=2
meta                      members=4  external=2  sibling=1
shared                    members=3  external=3  sibling=0
tree-editor               members=2  external=4  sibling=0
type-spec-properties      members=2  external=8  sibling=2
style-patches             members=5  external=8  sibling=3
node-specs                members=2  external=7  sibling=3
prosemirror               members=9  external=9  sibling=0
```

### Interpretation

- **Sibling imports roughly halve.** This is the expected direct win from collapsing intra‑subsystem file chains (e.g. the 6‑file prosemirror chain collapses to zero sibling imports — all references are now intra‑file).
- **External imports drop by ~30 %** because each consolidated file deduplicates repeated imports of the same `../../basics.mjs`, `../../../metamodel.mjs`, etc., that each small file had to re‑declare. This is the bigger and less obvious win.
- **The grand total drops from 160 to 83.** Even assuming tree‑shaking makes import *count* a weak proxy for bundle size, this is a legible‑signal improvement for *reading* the code: a newcomer scanning import lists sees half as many edges.
- **No projected file exceeds 9 external imports** (prosemirror, type‑spec‑properties, style‑patches). These three are the densest edges with the rest of the codebase, which matches their position as the most user‑visible surfaces of the ramp layout.
- **The two variants for `simple-select` / `map-select-button` / `base-by-path` placement** (in `shared` vs. in `style-patches`) yield the same grand total (83) with external±1 / sibling∓1. The `shared` variant is cleaner architecturally; pick it.

## Open Questions

These are judgment calls that need a decision before execution. None blocks the overall shape; each affects one or two files.

1. **`SimpleSelect` / `MapSelectButton` placement.** The import graph shows:
   - `SimpleSelect` → only `UIStylePatchesMap` uses it. Lives inside `style-patches.typeroof.jsx`, no question.
   - `MapSelectButton` → both `UIStylePatchesMap` and `UINodeSpecMap` use it. Goes in `shared.typeroof.jsx`.
   This is the variant measured in "Empirical Validation". Grand total unaffected vs. the alternative.

2. **`_BaseByPathContainerComponent` placement.** Shared by `StylePatchPropertiesManager` and `NodeSpecPropertiesManager`. Goes in `shared.typeroof.jsx` per the same reasoning.

3. **Splitting `style-patches.typeroof.jsx` further.** At ~720 lines it is the largest UI file. If that feels too big in practice, a natural further split is `style-patches-map.typeroof.jsx` (map + map helpers) vs `style-patches-editor.typeroof.jsx` (`UIStylePatch` + composite items + `StylePatchPropertiesManager`). Defer until the first pass is done and we can judge based on actual reading experience.

4. **Should `TypeSpecRampModel` move out of `index.typeroof.jsx`?** The controller + model pairing is a TypeRoof convention (see `export { Model, Controller }`). Keeping them together in `index.typeroof.jsx` preserves the contract. If `index` gets too long, split the model out; otherwise leave it.

5. **Hyphenation convention.** `node-spec-*` vs `nodespec-*` must be unified. Recommend `node-spec-*` to match existing repo files (`type-spec-models.mjs`, etc.).

6. **`.typeroof.jsx` vs `.mjs`.** Confirm the convention (JSX pragma vs plain module) and document it in `CODINGSTYLE.md`. Independent of this refactor but worth settling while touching many files.

## Execution Plan (if approved)

This is a **pure structural refactor** — no logic changes. Same rule as the original split commit.

1. **Consolidation pass on a new branch.** Merge the current 39 files into the ~14 target files per the proposed layout. Keep all symbol names and export shapes identical. Update `index.typeroof.jsx`'s imports only.
2. **Run `npm run typecheck` and `npm run lint`.** Must pass without new errors.
3. **Diff review discipline.** Because imports move, the diff will look large. The useful review signal is: does the symbol count per file match the inventory above, and does each file's `import` list stay within the tier rules (UI files may import engine files, not vice versa).
4. **Single commit per consolidation step**, not all in one, to keep each step reviewable:
   a. Engine tier consolidation (`pps-maps`, `defaults`, `synthetic-values`, `properties-generators`, `type-specnion`, `live-properties`, `meta`).
   b. UI tier consolidation (`shared`, `tree-editor`, `type-spec-properties`, `style-patches`, `node-specs`, `prosemirror`).
   c. Naming and hyphenation fixup.
5. **Deferred work to track separately (not part of this refactor):**
   - Splitting `style-patches.typeroof.jsx` further if it reads as too large.
   - The observation that `TYPESPEC_PPS_MAP` / `NODESPEC_PPS_MAP` builders share structure — candidate for a future DRY pass.
   - Moving `_BaseTreeEditor` out of `ramp/` if it genuinely becomes reused elsewhere (see the comment at its declaration in the old file: "intended to become more generally useful/shareable"). Out of scope here; ramp remains its only current consumer.

## Non‑Goals

- Changing any behaviour.
- Renaming public symbols (`Model`, `Controller`, and everything the controller imports).
- Touching files outside `lib/js/components/layouts/ramp/` except `index.typeroof.jsx`'s import section.
- Addressing the agent‑authored naming issue in `get-type-spec-defaults-map.mjs` by renaming the exported function (it stays `_getTypeSpecDefaultsMap`). Only the *file* name/scope changes.

## Acceptance

A consolidation that reduces the file count to ~14, preserves all exports consumed by `index.typeroof.jsx`, passes typecheck and lint, and results in file names that describe the *subsystem* each file contains rather than a single class. Review should confirm that reading `index.typeroof.jsx` + the file list lets a newcomer form a mental model of the layout in under ten minutes — the bar the original split aimed at but overshot.

## Migration Plan — Symbol Order Within Each Target File

Convention followed below: **top of file = leaves (no intra-file deps); bottom of file = trunk (depends on things above it)**. Order is derived from fan-out analysis of the old file (see `/tmp/fan-out.csv`); each line lists `symbol — intra-file deps (above-this-line)`.

Each target file begins with its imports block, followed by symbols in the order given. Exports are attached where the symbol is declared (no separate export block needed, matching the old file's style).

### Tier 1 — Engine (no UI dependencies)

#### `pps-maps.mjs`

```
_excludesTypeSpecPPSMap         — (leaf)
getTypeSpecPPSMap               — _excludesTypeSpecPPSMap
_excludesNodeSpecPPSMap         — (leaf, parallel pair)
getNodeSpecPPSMap               — _excludesNodeSpecPPSMap
TYPESPEC_PPS_MAP                — getTypeSpecPPSMap
NODESPEC_PPS_MAP                — getNodeSpecPPSMap
```

Exports: `getTypeSpecPPSMap`, `getNodeSpecPPSMap`, `TYPESPEC_PPS_MAP`, `NODESPEC_PPS_MAP`.
Rationale: the parallel pair structure stays side-by-side. Typespec block first (it is the primary, nodespec mirrors it), trunk constants at the bottom.

#### `synthetic-values.mjs`

```
SyntheticValue                     — (leaf)
pathSpecValuesGen                  — (leaf)
PATH_SPEC_AUTO_LINEAR_LEADING      — (leaf)
pathSpecPathsGen                   — PATH_SPEC_AUTO_LINEAR_LEADING
_fillTreeGetNodeFromRegistry       — (leaf)
fillTreeFromPaths                  — _fillTreeGetNodeFromRegistry
```

Exports: `SyntheticValue`, `PATH_SPEC_AUTO_LINEAR_LEADING`, `pathSpecPathsGen`, `pathSpecValuesGen`, `fillTreeFromPaths`.
Rationale: three small primitives that were separate files under the 39-file split (`synthetic-value.mjs`, `path-spec-gen.mjs`, `fill-tree-from-paths.mjs`) plus the constant `PATH_SPEC_AUTO_LINEAR_LEADING`. All are consumed as a set by `properties-generators.mjs`.

#### `properties-generators.mjs`

Order groups by sub-pipeline (leading → font → axes → margin → axesMath → registry). Within each group, leaves first, consumer last.

```
# Independent leaves (no intra-file deps)
fontGen                              — (leaf)
baseFontSizeGen                      — (leaf)
fontSizeGen                          — (leaf)
axisLocationsGen                     — (leaf)
openTypeFeaturesGen                  — (leaf)
languageTagGen                       — (leaf)

# Margin pipeline
createMargin                         — (leaf helper)
marginsGen                           — createMargin, languageTagGen

# Leading pipeline  (AutoLinear is a helper used by leadingGen)
AutoLinearLeadingSyntheticValue      — (leaf)
leadingGen                           — AutoLinearLeadingSyntheticValue

# Axis-math pipeline
calculateFontAxisValueSynthetic      — (leaf helper)
axesMathAxisLocationValueGen         — calculateFontAxisValueSynthetic
axisMathLocationsGen                 — axesMathAxisLocationValueGen, fontSizeGen

# Registry (trunk)
REGISTERED_GENERIC_TYPESPEC_FIELDS   — leadingGen, fontGen, baseFontSizeGen,
                                       fontSizeGen, axisLocationsGen,
                                       openTypeFeaturesGen, languageTagGen,
                                       marginsGen, axisMathLocationsGen
TYPE_SPEC_PROPERTIES_GENERATORS      — REGISTERED_GENERIC_TYPESPEC_FIELDS
STYLE_PATCH_PROPERTIES_GENERATORS    — axisMathLocationsGen + shared generators
```

*(Verified by `compute-fan-out.sh` — see `docs/planning/ramp-refactor/`.)*

Exports: every `*Gen` that is currently exported + `AutoLinearLeadingSyntheticValue` + `REGISTERED_GENERIC_TYPESPEC_FIELDS`, `TYPE_SPEC_PROPERTIES_GENERATORS`, `STYLE_PATCH_PROPERTIES_GENERATORS`.
Rationale: this is the file that most justifies the coupling-based approach — 12 symbols that form 4 mini-pipelines feeding one registry pair. Keeping them in one file makes the pipeline structure visible; the current split across `get-type-spec-defaults-map.mjs` obscures it behind a misleading filename.

#### `defaults.mjs`

```
_NOTDEF                       — (leaf)
_getFallback                  — _NOTDEF
typeSpecGetDefaults           — _getFallback
nodeSpecGetDefaults           — _getFallback
getRequireUpdateDefaultsFn    — (leaf, also used by outside)
_skipPrefix                   — (leaf)
_skipFullKey                  — (leaf)
_getTypeSpecDefaultsMap       — typeSpecGetDefaults (indirectly), _skipPrefix, _skipFullKey
```

Exports: `typeSpecGetDefaults`, `nodeSpecGetDefaults`, `getRequireUpdateDefaultsFn`, `_getTypeSpecDefaultsMap`.
Rationale: `_getTypeSpecDefaultsMap` was separated from the `*GetDefaults` family in the old file (it sat near the bottom, line 4301) but is semantically the same subsystem — it reads defaults out of a typeSpec. Co-locating makes the defaults subsystem one file.

#### `type-specnion.mjs`

```
mapSetProperties              — (leaf utility)
LocalScopeTypeSpecnion        — (leaf)
_BaseTypeSpecnion             — (leaf)
PatchedTypeSpecnion           — _BaseTypeSpecnion, LocalScopeTypeSpecnion, mapSetProperties
HierarchicalScopeTypeSpecnion — _BaseTypeSpecnion, LocalScopeTypeSpecnion, mapSetProperties, PatchedTypeSpecnion
```

Exports: `SyntheticValue`-unrelated names; `LocalScopeTypeSpecnion`, `_BaseTypeSpecnion`, `HierarchicalScopeTypeSpecnion`, `PatchedTypeSpecnion`.
Rationale: `PatchedTypeSpecnion` and `HierarchicalScopeTypeSpecnion` have mutual comment references but only a one-way runtime reference (`Hierarchical` constructs `Patched`), so topological order is clean: base + scope primitives above, patched in the middle, hierarchical at the bottom as the trunk.

#### `live-properties.typeroof.jsx`

```
TypeSpecLiveProperties          — (leaf)
StylePatchSourceLiveProperties  — (leaf)
StyleLinkLiveProperties         — TypeSpecLiveProperties, StylePatchSourceLiveProperties
```

Exports: all three.
Rationale: the two "source" properties classes are independent siblings; the "link" class composes them. Straightforward top-to-bottom layering.

#### `meta.typeroof.jsx`

```
StylePatchSourcesMeta   — (leaf)
StyleLinksMeta          — (leaf)
TypeSpecChildrenMeta    — forward-declared ref to TypeSpecMeta (recursive tree)
TypeSpecMeta            — TypeSpecChildrenMeta, StyleLinksMeta
```

Exports: all four.
Rationale: `TypeSpecChildrenMeta` and `TypeSpecMeta` form a mutual recursion (typespec → children → typespec). Put the leaves first, then the recursive pair with `TypeSpecChildrenMeta` above `TypeSpecMeta` (the "child" conceptually feeds into the "parent" class definition).

### Tier 2 — UI (may import Tier 1)

#### `shared.typeroof.jsx`

```
_uniqueKey                        — (leaf utility)
MapSelectButton                   — (leaf, uses DynamicTag from ../../basics)
_BaseByPathContainerComponent     — (leaf, extends _CommonContainerComponent)
```

Exports: `_uniqueKey`, `MapSelectButton`, `_BaseByPathContainerComponent`.
Rationale: three unrelated helpers that are used by ≥2 UI zones. Small utilities at the top, small component in the middle, heavier base class at the bottom.

#### `tree-editor.typeroof.jsx`

```
_BaseTreeEditor         — (leaf, 516 lines)
TypeSpecTreeEditor      — _BaseTreeEditor
```

Exports: `TypeSpecTreeEditor` (and `_BaseTreeEditor` if subclasses grow outside this file; currently internal).
Rationale: trivial — base above, single subclass below.

#### `type-spec-properties.typeroof.jsx`

```
UIFontLabel                   — (leaf)
TypeSpecPropertiesManager     — UIFontLabel
```

Exports: `TypeSpecPropertiesManager`.
Rationale: `UIFontLabel` was a separate file under the 39-file split despite having one consumer. Co-located as a private helper above its only user.

#### `style-patches.typeroof.jsx`

```
UICompositeStylePatchItem      — (leaf)
UICompositeStylePatch          — UICompositeStylePatchItem
UIStylePatch                   — UICompositeStylePatch
StylePatchPropertiesManager    — UIStylePatch
SimpleSelect                   — (leaf)
UIStylePatchesMap              — SimpleSelect
```

Exports: `UIStylePatch`, `StylePatchPropertiesManager`, `UIStylePatchesMap`.
Rationale: two independent chains inside one zone.
1. Composite item → composite → patch → patch-properties-manager (top of file).
2. `SimpleSelect` → `UIStylePatchesMap` (lower in file).
Between them is a natural page-break; a short `// --- stylePatchesMap widget ---` banner comment is enough.

#### `node-specs.typeroof.jsx`

```
NodeSpecPropertiesManager   — (leaf within this file)
UINodeSpecMap               — (leaf within this file)
```

Exports: both.
Rationale: two siblings that both extend `_BaseByPathContainerComponent` / `_UIBaseMap` from outside. No intra-file ordering pressure; alphabetical or source-order is fine. The old file had them interleaved with style-patches equivalents for side-by-side review — we lose that, which is the one real cost of the split and is noted in "Open Questions".

#### `prosemirror.typeroof.jsx`

```
GenericUpdater                        — (leaf)
ProseMirrorGeneralDocumentStyler      — (leaf)
UIDocumentElementTypeSpecDropTarget   — (leaf)
UIDocumentElement                     — UIDocumentElementTypeSpecDropTarget, UIDocumentNodes*
UIDocumentTextRun                     — GenericUpdater, UIDocumentElement
UIDocumentNode                        — UIDocumentTextRun, UIDocumentElement
UIDocumentNodes                       — UIDocumentTextRun, UIDocumentNode
UIDocument                            — UIDocumentNodes
ProseMirrorContext                    — ProseMirrorGeneralDocumentStyler (+ UIDocument indirectly)
```

(* `UIDocumentElement` references `UIDocumentNodes` by name only for type identification; this is a forward reference resolved at class-body-execution time, not at class-declaration time, so top-down order holds.)

Exports: `UIDocument`, `ProseMirrorContext`, `UIDocumentElementTypeSpecDropTarget` (if used externally; otherwise internal).
Rationale: the document-tree classes form a genuine mutual recursion (element ↔ nodes ↔ node ↔ textRun ↔ element). This is precisely why keeping them in one file matters — in the 39-file split these cycles had to be resolved via imports that "look forward." Top-of-file: small independent helpers. Middle: the mutually-recursive core, ordered so each class's deepest *structural* user appears below it. Bottom: `UIDocument` (the trunk that composes the node tree) and `ProseMirrorContext` (the top-level integration surface).

#### `index.typeroof.jsx`

```
TypeSpecRampModel         — (leaf)
TypeSpecRampController    — (trunk; composes everything)
export { Model, Controller }
```

Exports: `TypeSpecRampModel as Model`, `TypeSpecRampController as Controller`.
Rationale: unchanged — this is already how the current `index.typeroof.jsx` is structured.

### Global Move Order

A recommended sequence that keeps `npm run lint` / typecheck green after each step (each step is one commit):

1. **Prep.** Create the 14 target files empty (except `index` which exists). Add imports from the controller to cover the existing split. No symbol movement yet — confirms the target shape compiles.
2. **Engine tier, bottom-up.**
   1. `synthetic-values.mjs` — no Tier-1 deps. Move from `synthetic-value.mjs`, `path-spec-gen.mjs`, `fill-tree-from-paths.mjs`.
   2. `pps-maps.mjs` — rename `typespec-pps-map.mjs`/`nodespec-pps-map.mjs` → one file with both registries.
   3. `type-specnion.mjs` — move from `base-type-specnion.mjs` + patched/hierarchical companions.
   4. `properties-generators.mjs` — the big one. Move all `*Gen` and both `*_PROPERTIES_GENERATORS` out of `get-type-spec-defaults-map.mjs`. At the end of this step, `get-type-spec-defaults-map.mjs` contains only the `_getTypeSpecDefaultsMap` family.
   5. `defaults.mjs` — absorb what remains in `get-type-spec-defaults-map.mjs`, plus `type-spec-get-defaults.mjs`, `node-spec-get-defaults.mjs`, `_getTypeSpecDefaultsMap` and its `_skipPrefix`/`_skipFullKey` from the tail of the controller file. Delete `get-type-spec-defaults-map.mjs`.
   6. `live-properties.typeroof.jsx` — consolidate three existing files.
   7. `meta.typeroof.jsx` — consolidate four existing files.
3. **UI tier.**
   1. `shared.typeroof.jsx` — move `_uniqueKey`, `MapSelectButton`, `_BaseByPathContainerComponent`.
   2. `tree-editor.typeroof.jsx` — consolidate.
   3. `type-spec-properties.typeroof.jsx` — absorb `ui-font-label.typeroof.jsx`.
   4. `style-patches.typeroof.jsx` — consolidate 6 files including `simple-select`.
   5. `node-specs.typeroof.jsx` — consolidate 2 files.
   6. `prosemirror.typeroof.jsx` — consolidate 9 files (largest merge). Do this last because the internal recursion is the most error-prone to untangle; having every other target already consolidated means only imports internal to this file need reworking.
4. **Finalize.** Update `index.typeroof.jsx` imports to the new 13 siblings. Delete any now-empty files. Re-run import-graph script and confirm numbers match the projection (`external=60, sibling=23`).

Each step is an independent commit with a verifiable green typecheck, so the series can be bisected if anything breaks.

### Measurement Checkpoint

After the refactor, rerun:

```
bash /tmp/ramp-import-graph.sh > /tmp/ramp-graph-after.txt
grep -E "^(TOTALS|files=|  external|  sibling|  total)" /tmp/ramp-graph-after.txt
```

Expected: `files=14, sibling=23, external=60, total=83`. Any significant deviation means the coupling-based grouping diverged from the projection (most likely: a helper ended up in the wrong target file or a zone file grew an unintended cross-zone import). Worth investigating rather than rubber-stamping.

---

## Hand-Off Section (for cold executor)

> *This section is written for a future session/model that does not share the planning context above. Read before executing.*

### Slop-Prevention Preamble

This codebase has had prior issues with AI-generated defensive fallbacks,
proxy cache keys, silent scope creep, and over-granular file splits (this
refactor **is** the cleanup of one such over-split). When executing this plan:

- **Assert rather than fall back.** If you can't name a real input that
  reaches a branch, write `throw new Error(...)` instead of a default. See
  `docs/development/module-granularity.md` and prior session log.
- **Do not expand scope.** Edits are restricted to
  `lib/js/components/layouts/ramp/` and its `index.typeroof.jsx`. Any other
  file change requires a separate planning doc.
- **Do not "improve" what you touch.** No added tests, no TypeScript
  migration, no syntax modernization, no comment rewrites, no reformatting
  of `.typeroof.jsx` files (the top-of-file JSX pragma is load-bearing).
- **Do not drop exports without evidence they're unused.** The "External
  Consumers" table below is the audit to check against.
- **When in doubt, stop and write a question to the planning doc** rather
  than guessing.

### Source Material

| Artifact | Location |
|---|---|
| Pre-split source of truth (4700-line file) | `git show e18fbcb:lib/js/components/layouts/type-spec-ramp.typeroof.jsx` |
| Split commit (what created the 39 files) | `b1bce69` |
| Post-split state (what you see today) | `lib/js/components/layouts/ramp/` |
| Symbol inventory | `docs/planning/ramp-refactor/symbol-inventory.tsv` |
| Import graph script | `docs/planning/ramp-refactor/import-graph.sh` |
| Within-file ordering derivation | `docs/planning/ramp-refactor/compute-fan-out.sh` |

### Per-Commit Verification

After each migration step (each commit), run:

```bash
npm run eslint          # must be clean
npm run typecheck       # must be clean (uses tscw on JS via tsconfig)
npm run build:app       # must succeed (vite build)
bash docs/planning/ramp-refactor/import-graph.sh | tail -10  # track totals
```

Runtime smoke (manual, at milestones — not every commit):
```bash
npm run dev:app
# open http://localhost:5173 (or whatever Vite reports), navigate to
# "TypeSpec - Ramp" layout, confirm it loads and is interactive.
```

If any of the above fails and cannot be fixed within-session, see **Rollback**.

### Rollback Policy

- Each migration step **must** be an independent commit.
- If a step's verification fails and cannot be fixed within the same session:
  1. `git revert <that-commit-hash>` (revert only that commit, not the series).
  2. Append a note to this planning doc describing the failure mode.
  3. Stop — do not attempt partial recovery, do not proceed to later steps.
- Do not force-push or rebase-squash the migration series. Each step's green
  state is the evidence the refactor is safe.

### External Consumers (what must keep working)

Only one file outside `ramp/` imports from `ramp/`:

| Consumer | Imports | Via |
|---|---|---|
| `lib/js/main-player.mjs` | `* as TypeSpecRamp` | `./components/layouts/ramp/index.typeroof.jsx` |

The external API surface is therefore exactly what `index.typeroof.jsx`
exports: **`Model`** (alias for `TypeSpecRampModel`) and **`Controller`**
(alias for `TypeSpecRampController`). Anything else currently exported
from the ramp folder is internal to the refactor's scope and may be
un-exported if no longer needed after consolidation.

**Audit command** (re-run at the end of the refactor to confirm):
```bash
grep -rn --include='*.mjs' --include='*.jsx' \
  "from ['\"].*components/layouts/ramp" lib/ \
  | grep -v "^lib/js/components/layouts/ramp/"
```

Expected output: exactly one line, the `main-player.mjs` import above.

### Rename Table (39 → 14 files)

Current files on the left, target file(s) on the right. `→ DELETE` means
the file is dissolved into its target and removed. `→ split(A,B)` means
the file's contents are divided between two targets (one such split).

| # | Current file (in `ramp/`) | Target file | Notes |
|---|---|---|---|
|  1 | `index.typeroof.jsx` | `index.typeroof.jsx` | Update imports only; `Model` and `Controller` exports unchanged. |
|  2 | `base-tree-editor.typeroof.jsx` | `tree-editor.typeroof.jsx` | Keep `_BaseTreeEditor`. |
|  3 | `type-spec-tree-editor.typeroof.jsx` | `tree-editor.typeroof.jsx` | Second class in same file. |
|  4 | `ui-font-label.typeroof.jsx` | `type-spec-properties.typeroof.jsx` | Private helper; un-export if only used locally. |
|  5 | `type-spec-properties-manager.typeroof.jsx` | `type-spec-properties.typeroof.jsx` | Renamed; the "manager" suffix is dropped for consistency. |
|  6 | `typespec-pps-map.mjs` | `pps-maps.mjs` | Merged with nodespec variant. |
|  7 | `nodespec-pps-map.mjs` | `pps-maps.mjs` | Merged; `nodespec`→`node-spec` style is unified. |
|  8 | `type-spec-get-defaults.mjs` | `defaults.mjs` | `typeSpecGetDefaults`, `_NOTDEF`, `_getFallback`, `getRequireUpdateDefaultsFn`. |
|  9 | `get-type-spec-defaults-map.mjs` | **split(`properties-generators.mjs`, `defaults.mjs`)** | **The biggest move.** Generators + `REGISTERED_GENERIC_TYPESPEC_FIELDS` + both `*_PROPERTIES_GENERATORS` → `properties-generators.mjs`. `_getTypeSpecDefaultsMap` + `_skipPrefix` + `_skipFullKey` + `PATH_SPEC_AUTO_LINEAR_LEADING` related defaults → `defaults.mjs`. |
| 10 | `synthetic-value.mjs` | `synthetic-values.mjs` | Note plural. |
| 11 | `path-spec-gen.mjs` | `synthetic-values.mjs` | `pathSpecPathsGen`, `pathSpecValuesGen`. |
| 12 | `fill-tree-from-paths.mjs` | `synthetic-values.mjs` | `fillTreeFromPaths`, `_fillTreeGetNodeFromRegistry`. |
| 13 | `base-type-specnion.typeroof.jsx` | `type-specnion.mjs` | `_BaseTypeSpecnion`, `LocalScopeTypeSpecnion`, `HierarchicalScopeTypeSpecnion`, `PatchedTypeSpecnion`, `mapSetProperties`. Note `.mjs` — no JSX needed. |
| 14 | `type-spec-live-properties.typeroof.jsx` | `live-properties.typeroof.jsx` | |
| 15 | `style-patch-source-live-properties.typeroof.jsx` | `live-properties.typeroof.jsx` | |
| 16 | `style-link-live-properties.typeroof.jsx` | `live-properties.typeroof.jsx` | |
| 17 | `type-spec-meta.typeroof.jsx` | `meta.typeroof.jsx` | |
| 18 | `type-spec-children-meta.typeroof.jsx` | `meta.typeroof.jsx` | |
| 19 | `style-links-meta.typeroof.jsx` | `meta.typeroof.jsx` | |
| 20 | `style-patch-sources-meta.typeroof.jsx` | `meta.typeroof.jsx` | |
| 21 | `base-by-path-container-component.typeroof.jsx` | `shared.typeroof.jsx` | `_BaseByPathContainerComponent`. |
| 22 | `map-select-button.typeroof.jsx` | `shared.typeroof.jsx` | Used by both `UIStylePatchesMap` and `UINodeSpecMap`. |
| 23 | (new) `_uniqueKey` from `index.typeroof.jsx`† | `shared.typeroof.jsx` | † Currently `_uniqueKey` may already live in one of the existing files; verify and move if so. |
| 24 | `ui-composite-style-patch-item.typeroof.jsx` | `style-patches.typeroof.jsx` | |
| 25 | `ui-composite-style-patch.typeroof.jsx` | `style-patches.typeroof.jsx` | |
| 26 | `ui-style-patch.typeroof.jsx` | `style-patches.typeroof.jsx` | |
| 27 | `style-patch-properties-manager.typeroof.jsx` | `style-patches.typeroof.jsx` | |
| 28 | `simple-select.typeroof.jsx` | `style-patches.typeroof.jsx` | Single consumer confirmed by import-graph. |
| 29 | `ui-style-patches-map.typeroof.jsx` | `style-patches.typeroof.jsx` | |
| 30 | `node-spec-properties-manager.typeroof.jsx` | `node-specs.typeroof.jsx` | Contains `nodeSpecGetDefaults` as private helper — move helper to `defaults.mjs` instead, and import it here. |
| 31 | `ui-node-spec-map.typeroof.jsx` | `node-specs.typeroof.jsx` | |
| 32 | `generic-updater.mjs` | `prosemirror.typeroof.jsx` | |
| 33 | `prose-mirror-general-document-styler.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 34 | `ui-document-element-type-spec-drop-target.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 35 | `ui-document-element.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 36 | `ui-document-text-run.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 37 | `ui-document-node.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 38 | `ui-document-nodes.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 39 | `ui-document.typeroof.jsx` | `prosemirror.typeroof.jsx` | |
| 40 | `prose-mirror-context.typeroof.jsx` | `prosemirror.typeroof.jsx` | |

Final target file list (14):
1. `index.typeroof.jsx`
2. `shared.typeroof.jsx`
3. `tree-editor.typeroof.jsx`
4. `pps-maps.mjs`
5. `synthetic-values.mjs`
6. `type-specnion.mjs`
7. `properties-generators.mjs`
8. `defaults.mjs`
9. `type-spec-properties.typeroof.jsx`
10. `style-patches.typeroof.jsx`
11. `node-specs.typeroof.jsx`
12. `live-properties.typeroof.jsx`
13. `meta.typeroof.jsx`
14. `prosemirror.typeroof.jsx`

### Known False-Positive Edges in Fan-Out Data

`compute-fan-out.sh` uses textual matching and cannot distinguish code
references from comment references. The following edges appear in the
CSV but are **comment-only** and should be ignored when deriving
within-file ordering:

| From | To | Reality |
|---|---|---|
| `UICompositeStylePatch` | `UIStylePatchesMap` | Comment: "creates a link when dragged from UIStylePatchesMap". No runtime ref. |
| `PatchedTypeSpecnion` | `HierarchicalScopeTypeSpecnion` | Comment: "This does basically the same as HierarchicalScopeTypeSpecnion._initPropertyValuesMaps". The runtime ref is the other direction. |
| `TYPESPEC_PPS_MAP` row (line range 931–959) | — | Inventory imprecision: that line range spans the multi-`const` block that also declares `NODESPEC_PPS_MAP`. Both constants are trunk-at-bottom regardless. When splitting the row in a future inventory update, give each constant its own range. |

If new false-positive edges are discovered during execution, append them
here and update the within-file ordering if it was affected.

### Open-Question Defaults (for cold executor)

If no human input is available, the executor should use these defaults
rather than stall. Any deviation should be called out in the commit
message.

| # | Question | Default if no human available |
|---|---|---|
| 1 | `SimpleSelect` / `MapSelectButton` placement | Resolved empirically: `SimpleSelect` → `style-patches`, `MapSelectButton` → `shared`. **Use this.** |
| 2 | `.typeroof.jsx` vs `.mjs` for files without JSX | **STOP: requires human decision.** Do not proceed with files where the extension is ambiguous without confirmation. Current plan's choices (e.g. `type-specnion.mjs`, `pps-maps.mjs`, `defaults.mjs`) follow the rule "`.mjs` iff the file contains no JSX template literals or JSX pragma"; verify each target on consolidation and rename if the rule was violated. |
| 3 | Naming: `node-spec` vs `nodespec` | Default: `node-spec-` (hyphenated) — matches `type-spec-` used elsewhere. |
| 4 | Should `defaults.mjs` absorb `_getTypeSpecDefaultsMap` (currently in controller tail)? | Default: **yes**, per the plan. The skipPrefix/skipFullKey family is defaults-subsystem machinery, not controller-local. |
| 5 | Should engine-tier files ever import UI-tier files? | Default: **no**. If an edit would require this, stop and question the layering. |
| 6 | What to do with `baseFontSizeGen`? | Default: keep in `properties-generators.mjs` as a leaf generator alongside `fontSizeGen`. |

### If Deviation From Projected Import Totals

Target: `files=14, sibling=23, external=60, total=83`.

If after completing the refactor the numbers differ by more than ±2 per
category, investigate in this order:

1. **A helper ended up in the wrong target file.** Check `shared.typeroof.jsx`
   for entries that actually have only one consumer.
2. **A cross-zone import was introduced.** Look for `./style-patches` imports
   in `node-specs.typeroof.jsx` or similar. Such imports usually indicate a
   helper that should be in `shared`.
3. **An `npm` import was miscounted as external** (shouldn't happen with the
   grep pattern `from "../"`, but double-check).
4. **An export that was expected to be dropped is still being imported by
   `index.typeroof.jsx`.** Verify `TypeSpecRampController`'s imports.

Do **not** rubber-stamp the deviation. Either resolve it or document why it's
acceptable in the commit message.

### Scope Boundary (restatement)

- **In scope:** `lib/js/components/layouts/ramp/**`, `index.typeroof.jsx` within that folder.
- **Out of scope:** everything else, including `main-player.mjs`, the feature branch's pending `videoproof-contextual` work, the untracked design-analysis docs, and `_BaseTreeEditor` internals (structural moves only; no logic changes).

Any required change outside scope becomes a new planning doc, not a
silent expansion of this one.
