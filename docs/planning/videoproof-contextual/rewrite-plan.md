---
eleventyNavigation:
  key: Videoproof Contextual Rewrite Plan
  parent: Planning
agent-created: true
---

# Videoproof Contextual Actor — Rewrite Plan

> This document was created through a design discussion session and serves
> as context memory for continuing the implementation in future sessions.

---

## Implementation Status

| Phase | Description | Status | Commit |
|-------|-------------|--------|--------|
| 1 | Pattern compiler and fill engine | ✅ Done | `6019cf5` |
| 2 | Selector compilation and template engine | ✅ Done | `f8fc7e5` |
| 3 | Selector and template model definitions | ✅ Done | `a2fb631` |
| 4 | Unified word generation engine | ✅ Done | `5c71209` |
| 5 | Wire template engine into actor | ✅ Done | `802c194` |
| 5b | Remove ad-hoc format, replace with TODOs | ✅ Done | `1a40f0d` |
| 5c | DRY: deduplicate CharGroupModel, getSelectedChars | ✅ Done | `84ff17e` |
| 6 | Actor model migration | ✅ Done | `867cd9a` |
| 7 | Template compilation from flat property paths | ✅ Done | `12c3c64` |
| 8 | Model cleanup and refactoring | ✅ Done | `52e25fd` |
| 9a | Type-driven UI infrastructure | ✅ Done | `044715e`, `3e43f37`, `90c57aa` |
| 9b | SimpleCharsSelectorModel → CharGroupsListModel | ✅ Done | `dec835f` |
| 9c | Template editor UI components | ✅ Done | `d26b1f6` |
| 10 | Built-in templates as serialized TemplateModel data | 🔲 Open | — |

### Files Created/Modified

- **`videoproof-contextual-template.mjs`** (431 lines) — Pattern compiler
  (`compilePattern`, `fill`), char resolution (`resolveKeyToCharSet`,
  `resolveChars`), template compilation from flat property paths
  (`compileTemplateFromPropertyValuesMap`, `compileSelectorFromPath`),
  unified word generation (`generateWords`, `pairProductGen`).
- **`videoproof-contextual-models.mjs`** (200 lines) — Selector model hierarchy
  (`SimpleCharsSelectorModel`/`CombinatorCharsSelectorModel` with dynamic type
  dispatch via `createDynamicModel`), `TemplateRuleModel`, `TemplateModel`,
  `CharGroupsListModel`, actor/key moment models. Uses AxesMath-style
  self-referential pattern for recursive selector tree.
- **`videoproof-contextual.mjs`** (232 lines) — Actor. Re-exports from models.
  `_getCellContents` reads charGroups + template from flat `propertyValuesMap`
  paths, calls `compileTemplateFromPropertyValuesMap` → `generateWords`.
  `VideoproofContextualActorRenderer` handles CSS, typography, word spans.
- **`type-driven-ui.mjs`** (660 lines) — `UITypeDrivenListItem` (mixin of
  list item + type-driven widgets), `UITypeDrivenList` (generic list for
  fixed-type models with per-instance DnD transfer types).
- **`type-driven-ui-basics.mjs`** (384 lines) — Extracted
  `_BaseTypeDrivenContainerComponentMixin` as subclass factory for reuse
  with `_UIBaseListContainerItem`.
- **`basics.mjs`** — Instance fallback getters for `ITEM_DATA_TRANSFER_TYPE_PATH`
  and `ITEM_DATA_TRANSFER_TYPE_CREATE` on `_UIBaseList`, enabling per-instance
  override by `UITypeDrivenList`.
- **`data-transfer-types.mjs`** — Added `getTransferTypesForModel(Model)`.
- **`available-actors.mjs`** — Updated charGroupsData navigation.
- **`stage-and-actors.mjs`** — `REGISTERED_GENERIC_KEYMOMENT_FIELDS`: added
  `charGroups`, `template`; removed `padMode`, `customPad`.
- **`ui-char-groups.mjs`** (660 lines) — Added `getSelectedChars`,
  exported `getCharsFromCharGroups`.

---

## What Remains (Phase 10)

### Completed: Phase 9b — SimpleCharsSelectorModel → CharGroupsListModel (`dec835f`)

Replaced `keys` (list of bare strings) + `extended` (single boolean) with
`charGroups` (CharGroupsListModel). Each selector leaf now carries full
`CharGroupModel` items. Updated `compileSelectorFromPath` accordingly.
Deleted `CharsSelectorKeyModel`, `CharsSelectorKeysModel`, removed
`BooleanDefaultTrueModel` import.

### Completed: Phase 9c — Template Editor UI Components (`d26b1f6`)

`UICharsSelectorContainer`: dynamic-type container for `CharsSelectorModel`,
follows `UILeadingAlgorithm` pattern (`_BaseDynamicCollectionContainerComponent`
+ `_BaseTypeDrivenContainerComponentMixin`). GenericSelect dropdown for
`selectorTypeKey`, dynamic widget provisioning for `instance` field.

`uiElementsMap` entries added for: `TemplateModel` → `UITypeDrivenContainer`,
`TemplateRulesModel` → `UITypeDrivenList`, `CharsSelectorModel` →
`UICharsSelectorContainer`, `CharsSelectorItemsModel` → `UITypeDrivenList`.

UI component tree:
```
TemplateModel → UITypeDrivenContainer
├── defaultPattern: StringModel → UILineOfTextInput
└── rules: TemplateRulesModel → UITypeDrivenList
    └── TemplateRuleModel → UITypeDrivenListItem
        ├── pattern: StringModel → UILineOfTextInput
        └── selector: CharsSelectorModel → UICharsSelectorContainer
            ├── selectorTypeKey: GenericSelect dropdown (Simple | Combinator | null)
            └── instance (dynamic):
                Simple → UITypeDrivenContainer
                │  ├── argIndex: NumberModel → UINumberAndRangeInput
                │  └── charGroups: CharGroupsListModel → UITypeDrivenList
                │      └── CharGroupModel → UICharGroupContainer
                Combinator → UITypeDrivenContainer
                   ├── combineMode: EnumModel → UISelectInput
                   └── children: CharsSelectorItemsModel → UITypeDrivenList
                       └── CharsSelectorModel → UICharsSelectorContainer (recursive)
```

### Phase 10 — Built-in Templates

Create template presets via the UI, serialize as TemplateModel data, store
in `BUILTIN_TEMPLATES` (replacing the commented-out TODO). These become
the default templates available in a preset selector.

---

## Research: Current State

### Architecture of `videoproof-contextual.mjs` (before rewrite)

The file had three layers:

1. **Model definitions** (lines 1–142) — `PadModeModel` enum,
   `VideoproofContextualKeyMomentModel` struct with `charGroup`,
   `padMode`, `customPad`, `outerCharGroup` fields.

2. **Business logic** (lines 144–406) — Word generation from charGroups + padMode.
   This was the core problem: ~260 lines of branching, hardcoded Latin behavior,
   with the following functions:
   - `_testCharType` — regex-based char classification (Latin-only)
   - `_autoFormatters` / `_formatterTests` — pattern selection by char type
   - `_kernFormatters` — hardcoded kerning patterns per mode
   - `_kernModesCharsConfig` — hardcoded char sources per kern mode
   - `padModeIsKerning`, `padModeIsAutoContextual` — mode branching
   - `_getKerningWords`, `_getAutoContextualWords`, `_getCustomContextualWords`
   - `_getWords` — top-level dispatcher
   - `_getCellContents` — stateKey-based caching wrapper

3. **Renderer** (lines 410–491) — `VideoproofContextualActorRenderer`,
   a `_BaseComponent` subclass. Creates `<span>` per word, calls
   `fixContextualLineBreaks`. The `update()` method handles font,
   animation properties, colors, CSS, and language tags.

### Known Problems (from FIXMEs in original code)

- `PadModeModel` enum mixes formatting modes (auto-short/long, custom)
  with kerning modes (kern-upper/mixed/lower) — different semantics
- Kern modes hardcoded to Latin — comments explicitly flag this
- `outerCharGroup` was an awkward bolt-on for kerning pair support
- Extended kern pairs can produce ~47K pairs (performance issue)
- `_autoFormatters` described as "maximally strange" in the code itself
- stateKey dirty-checking is fragile string concatenation

### Reference Patterns in Codebase

**AxesMath (`axes-math.mjs`)** — Self-referential dynamic type hierarchy:
- `AxesMathLocationModel` / `AxesMathLocationsProductModel` / `AxesMathLocationsSumModel`
- `AxesMathItemModel` (dynamic wrapper with `InternalizedDependency`)
- Sum contains list of ItemModel → recursion through wrapper
- `UIAxesMathLocationsSumItem`: reads typeKey in `_provisionWidgets`, switches
  widget tree via `_createWrapperForType`

**StylePatch (`type-spec-models.mjs`)** — Heterogeneous type dispatch:
- `SimpleStylePatchModel` (leaf) / `CompositeStylePatchModel` (combinator)
- `StylePatchModel` (dynamic wrapper)

**`createDynamicModel` (`dynamic-types-pattern.mjs`)** — Factory for dynamic type
wrappers. With `staticTypes=null` uses `InternalizedDependency` (for self-reference).
With `staticTypes` provided uses `StaticDependency`.

---

## Design Decisions

### 1. padMode → Data-Driven Templates

**Decision**: Replace `PadModeModel` enum with a `TemplateModel` struct containing
rules (selector + pattern pairs) and a default pattern. What was hardcoded behavior
becomes data.

**Rationale**: The current padMode options like "auto-short" are actually
"Latin auto short." Defining these as data presets makes it possible to add
script-specific templates without code changes.

### 2. Unified Contextual + Kerning Engine

**Decision**: One engine handles both contextual (arity-1: `nn$1nn`) and kerning
(arity-2: `HO$1$2$1OLA`) through the same rule-matching + fill pipeline.

**Rationale**: The difference between contextual and kerning is just arity —
how many chars are substituted into the pattern. The rule matching, pattern
filling, and iteration logic are identical.

### 3. Compiled Patterns (Parts Array)

**Decision**: Parse patterns once into arrays of interleaved string literals and
argument indices. Fill by walking the array.

**Example**: `"HO$1$2$1OLA"` → `["HO", 0, 1, 0, "OLA"]`

**Fill**: Linear walk, `typeof p === 'number' ? args[p] : p`, string concatenation.

**Rationale**: Faster than `String.replace` for repeated fills. Pattern is parsed
once, applied hundreds/thousands of times. V8 JIT-friendly tight loop.

**Escaping**: `$$` → literal `$`. Resolved at compile time, zero runtime cost.

### 4. Compiled Selectors (Set-Based)

**Decision**: Selector keys resolve to `Set` objects at compile time. Extended
chars are flattened into the sets. The selector spec controls whether extended
chars are included.

**Rationale**: `Set.has()` is O(1). No runtime database lookups, no regex matching.
Separates char *classification* (which pattern applies) from char *selection*
(what the user iterates over).

### 5. Selector Tree (AxesMath-Style Dynamic Type)

**Decision**: Selectors use the recursive dynamic type pattern via
`createDynamicModel`:
- `SimpleCharsSelectorModel`: `{ argIndex, charGroups }`
- `CombinatorCharsSelectorModel`: `{ combineMode: AND|OR, children: [CharsSelectorModel...] }`
- `CharsSelectorModel`: dynamic wrapper with `InternalizedDependency`
  (enables self-reference for recursive combinator trees)

**Rationale**: Enables composable predicates like
`AND(simple(0, uppercase), simple(1, lowercase))`
for kerning rules. Follows established codebase patterns.

### 6. CharGroups as List (1-2 Items)

**Decision**: Replace `charGroup` + `outerCharGroup` with a
`CharGroupsListModel` (list of `CharGroupModel`, 1-2 items, coherence-enforced).

**Semantics**:
- Length 1: single char source. For arity-2, outer = base chars (no extended).
- Length 2: explicit outer (index 1) / inner (index 0), each with own extended flag.

**Rationale**: No boolean flag, no nullable struct gymnastics. Length *is* the
signal. Clean serialization. Coherence function enforces the invariant.

### 7. Template Terminology

**Decision**: What was "padMode" becomes "template." A template is a set of
rules (selector + pattern pairs) plus a default pattern. A "preset" is a saved
instance of the full model state (charGroups + template).

### 8. No Inheritance for Now

**Decision**: Every key moment carries a concrete template and charGroups.
No inheritance/OrEmpty for these fields.

**Rationale**: Template and charGroups don't interpolate between keyframes
(they're discrete, like `textRun`). The proper inheritance solution is the
compositor system (see `docs/planning/compositor/roadmap.md`). Building a
one-off mechanism now would be throwaway work.

### 9. Custom Mode = User-Editable Template

**Decision**: "Custom" is not a special mode. It's a template with no rules
and a user-editable `defaultPattern`. Same engine, same compilation.

**Rationale**: The user gets direct access to the pattern language (`$1`, `$2`
syntax). Power users can write kerning patterns directly.

### 10. SimpleCharsSelectorModel Uses CharGroupsListModel

**Decision**: Replace `keys` (list of bare key strings) + `extended` (single
boolean) on `SimpleCharsSelectorModel` with `charGroups` (`CharGroupsListModel`).

**Rationale**: `CharGroupModel` is already the right shape for "pick some chars
from char groups" — which is exactly what a selector leaf does. Each charGroup
carries its own `options`, `extended`, `customText`, `customSeparator`. This
reuses the full `UICharGroupContainer` + `UITypeDrivenList` UI machinery.
Selectors don't need font info — chars are already font-filtered upstream
before reaching the selector.

### 11. Template Compilation from Flat Property Paths

**Decision**: Reconstruct template from the broom wagon's flat `propertyValuesMap`,
following the `getColorFromPropertyValuesMap` / `getDimensionFromPropertyValuesMap`
patterns.

**Rationale**: The broom wagon walks the model tree and produces flat paths like
`generic/template/defaultPattern`, `generic/template/rules/0/pattern`,
`generic/template/rules/0/selector/instance/charGroups/0/options`, etc.
`compileTemplateFromPropertyValuesMap` probes these paths to reconstruct
the compiled template with rules, selector tests, and pattern parts arrays.

---

## Architecture

### Pattern Language

- Placeholders: `$1`, `$2`, ... `$9` (positional, 1-indexed in syntax, 0-indexed
  in compiled form)
- Escape: `$$` → literal `$`
- Compiled form: parts array — `["HO", 0, 1, 0, "OLA"]`
- Arity: max argument index + 1

### Selector System

Uncompiled (model data):
```
CombinatorCharsSelectorModel {
    combineMode: 'AND',
    children: [
        SimpleCharsSelectorModel { argIndex: 0, charGroups: [uppercase] },
        SimpleCharsSelectorModel { argIndex: 1, charGroups: [lowercase] }
    ]
}
```

Compiled:
```
{ test: (args) => uppercaseSet.has(args[0]) && lowercaseSet.has(args[1]) }
```

### Template Structure

Uncompiled (model data):
```
TemplateModel {
    rules: [
        { selector: simple(0, [lowercase]), pattern: 'nn$1nn' },
        { selector: simple(0, [figures]),   pattern: '00$100' },
    ],
    defaultPattern: 'HH$1HH'
}
```

Compiled:
```
{
    arity: 1,
    rules: [
        { test: (args) => lowercaseSet.has(args[0]), parts: ["nn", 0, "nn"] },
        { test: (args) => figuresSet.has(args[0]),   parts: ["00", 0, "00"] },
    ],
    defaultParts: ["HH", 0, "HH"],
    stateTokens: [...]
}
```

### Unified Engine

One code path replacing ~150 lines of branching logic:

```
1. Read charGroups from key moment
2. Build iteration set:
   - charGroups.length === 1, arity 1:
       chars = getChars(charGroups[0])
       iterate: [c] for each c in chars
   - charGroups.length === 1, arity 2:
       inner = getChars(charGroups[0])  (with extended per its flag)
       outer = getCharsBase(charGroups[0])  (no extended)
       iterate: [outer, inner] for cartesian product
   - charGroups.length === 2, arity 2:
       inner = getChars(charGroups[0])
       outer = getChars(charGroups[1])
       iterate: [outer, inner] for cartesian product
3. For each item in iteration set:
   - Walk compiled rules, first test(args) hit → fill(parts, args)
   - Fallback → fill(defaultParts, args)
4. Return words array
```

### UI Component Tree (Phase 9c)

```
UIContextualTemplateContainer (_BaseContainerComponent)
├── defaultPattern: string input
└── rules: UITemplateRulesList (UITypeDrivenList)
    └── UITemplateRuleItem (UITypeDrivenListItem, per rule)
        ├── pattern: string input
        └── selector: UICharsSelectorContainer (AxesMath-style dynamic type switch)
            ├── type select dropdown (Simple | Combinator | null)
            └── instance:
                Simple → argIndex: number input
                         charGroups: UITypeDrivenList
                           └── UITypeDrivenListItem (per charGroup)
                               └── UICharGroupContainer (options, extended, custom text)
                Combinator → combineMode: AND/OR select
                             children: UICharsSelectorList (recursive)
                               └── UICharsSelectorContainer (same, recursive)
```

New components: `UIContextualTemplateContainer`, `UICharsSelectorContainer`.
Everything else reuses existing machinery.

---

## Key Codebase References

- `lib/js/components/actors/videoproof-contextual-template.mjs` — Template engine
- `lib/js/components/actors/videoproof-contextual-models.mjs` — Model definitions
- `lib/js/components/actors/videoproof-contextual.mjs` — Actor (re-exports, _getCellContents, renderer)
- `lib/js/components/actors/videoproof-array.mjs` — Sibling actor, shares CharGroupModel
- `lib/js/components/actors/available-actors.mjs` — Actor type registration
- `lib/js/components/layouts/stage-and-actors.mjs` — Layout wiring, KeyMomentController
- `lib/js/components/type-driven-ui.mjs` — UITypeDrivenList/Item, uiElementsMap
- `lib/js/components/type-driven-ui-basics.mjs` — _BaseTypeDrivenContainerComponentMixin
- `lib/js/components/axes-math.mjs` — Reference: UIAxesMathLocationsSumItem pattern
- `lib/js/components/dynamic-types-pattern.mjs` — createDynamicModel helper
- `lib/js/components/data-transfer-types.mjs` — getTransferTypesForModel
- `lib/js/components/ui-char-groups.mjs` — UICharGroupContainer, char group utilities
- `lib/js/components/basics.mjs` — _UIBaseList, DnD transfer type infrastructure
- `lib/assets/glyph-groups.json` — Char database (Latin, Greek, Cyrillic, World)
