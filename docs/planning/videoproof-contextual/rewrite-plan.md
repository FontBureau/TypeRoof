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
| 6 | Actor model migration | 🔲 Open | — |
| 7 | Preset definitions | ✅ Done (in Phase 4) | `5c71209` |
| 8 | Renderer update | ✅ Done (in Phase 5) | `802c194` |
| 9 | UI integration | 🔲 Open | — |

### Files Created/Modified

- **`videoproof-contextual-template.mjs`** (466 lines) — New. Pattern compiler,
  selector compiler, template compiler, char resolution, unified word generation
  engine, and BUILTIN_TEMPLATES data.
- **`videoproof-contextual-models.mjs`** (207 lines) — New. Selector model hierarchy
  (leaf/combinator with dynamic type dispatch), TemplateModel, RuleModel,
  CharGroupsListModel, and new actor/key moment models.
- **`videoproof-contextual.mjs`** (385 lines, was 495) — Modified. Old business logic
  (~260 lines) replaced with translation layer (~80 lines) that maps legacy
  padMode values to the new template engine. Model definitions and renderer
  preserved for backward compatibility.

### What Remains (Phases 6 + 9)

**Phase 6 — Actor Model Migration** requires owner decision:
- Swap `PadModeModel` + `customPad` → `TemplateModel`
- Swap `charGroup` + `outerCharGroup` → `CharGroupsListModel` (1-2 items)
- This is a **breaking change** for saved documents (serialization format changes)
- The new models are defined in `videoproof-contextual-models.mjs` and ready to use
- `available-actors.mjs` must be updated to import from new models
- `stage-and-actors.mjs` REGISTERED_GENERIC_KEYMOMENT_FIELDS must be updated

**Phase 9 — UI Integration** requires design decisions:
- Template selector UI (dropdown for built-in templates + custom)
- Custom pattern input field (visible when custom template selected)
- CharGroups list UI: 1 or 2 charGroup selectors
- Toggle to add/remove second charGroup
- Preset save/load UI

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
- `_BaseAxesMathItemModel` (abstract base)
- `AxesMathLocationModel` / `AxesMathLocationsProductModel` / `AxesMathLocationsSumModel`
- `AxesMathItemModel` (dynamic wrapper with `InternalizedDependency`)
- Sum contains list of ItemModel → recursion through wrapper
- Available types created after all type classes exist

**StylePatch (`type-spec-models.mjs`)** — Heterogeneous type dispatch:
- `_BaseStylePatchModel` (abstract base)
- `SimpleStylePatchModel` (leaf with typography props)
- `CompositeStylePatchModel` (combinator with list of keys)
- `StylePatchModel` (dynamic wrapper)

**`createDynamicModel` (`dynamic-types-pattern.mjs`)** — Factory for dynamic type
wrappers. With `staticTypes=null` uses `InternalizedDependency` (for self-reference).
With `staticTypes` provided uses `StaticDependency`.

**ColorModel (`color.mjs`)** — `ForeignKey.ALLOW_NULL` + `SET_NULL` for nullable
dynamic struct instances.

**`WITH_SELF_REFERENCE` (`struct-model.ts`)** — Symbol for recursive types within
a single struct (used by `TypeSpecModel`, ProseMirror `JSONModel`). Not needed
here — the AxesMath pattern (recursion through dynamic wrapper) is cleaner.

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

### 5. Selector Tree (AxesMath/StylePatch Pattern)

**Decision**: Selectors use the recursive dynamic type pattern:
- `_BaseSelectorModel` (abstract base)
- `LeafSelectorModel`: `{ argIndex, keys, extended }`
- `CombinatorSelectorModel`: `{ op: AND|OR, children: [SelectorModel...] }`
- `SelectorModel`: dynamic wrapper with `InternalizedDependency`

**Rationale**: Enables composable predicates like
`AND({argIndex: 0, charSet: uppercaseSet}, {argIndex: 1, charSet: lowercaseSet})`
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

---

## Architecture

### Pattern Language

- Placeholders: `$1`, `$2`, ... `$9` (positional, 1-indexed in syntax, 0-indexed
  in compiled form)
- Escape: `$$` → literal `$`
- Compiled form: parts array — `["HO", 0, 1, 0, "OLA"]`
- Arity: max argument index + 1

### Selector System

Uncompiled (data/preset definition):
```
AND(
    leaf(0, ['Latin.Uppercase'], false),
    leaf(1, ['Latin.Lowercase'], true)
)
```

Compiled:
```
{ test: (args) => uppercaseSet.has(args[0]) && lowercaseSet.has(args[1]) }
```

### Template Structure

Uncompiled:
```
{
    rules: [
        { selector: leaf(0, ['Latin.Lowercase'], true), pattern: 'nn$1nn' },
        { selector: leaf(0, ['World.Figures'], false), pattern: '00$100' },
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
        { test: (args) => figuresSet.has(args[0]), parts: ["00", 0, "00"] },
    ],
    defaultParts: ["HH", 0, "HH"]
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

### Built-in Templates (BUILTIN_TEMPLATES)

Defined in `videoproof-contextual-template.mjs`:

- **latinAutoShort** — arity 1, rules for lowercase (`nn$1nn`), figures (`00$100`),
  default `HH$1HH`
- **latinAutoLong** — arity 1, rules for lowercase (`nnoonnoo$1oonnoonn`),
  figures (`00110011$111001100`), default `HHOOHH$1HHOOHHOO`
- **latinKernUpper** — arity 2, `HO$1$2$1OLA`, charConfig: inner=Latin.Uppercase
- **latinKernMixed** — arity 2, `$1$2nnoy`, charConfig: inner=Latin.Lowercase,
  outer=Latin.Uppercase
- **latinKernLower** — arity 2, `no$1$2$1ony`, charConfig: inner=Latin.Lowercase

### Translation Layer (Backward Compatibility)

`_PAD_MODE_TO_TEMPLATE_KEY` maps old `PadModeModel` enum values to
`BUILTIN_TEMPLATES` keys:
```
'auto-short'  → 'latinAutoShort'
'auto-long'   → 'latinAutoLong'
'kern-upper'  → 'latinKernUpper'
'kern-mixed'  → 'latinKernMixed'
'kern-lower'  → 'latinKernLower'
```

Custom pad mode builds a template spec on the fly:
```
{ defaultPattern: `${customPad}$1${customPad}`, rules: [] }
```

---

## Implementation Plan (Updated)

### Phase 1: Pattern Compiler ✅
- `compilePattern(pattern)` → parts array
- `fill(parts, args)` → string
- `$$` escaping, arity detection

### Phase 2: Selector Compilation ✅
- `resolveKeyToCharSet` — selector keys → char Set
- `compileSelectorLeaf`, `compileSelector` — recursive compilation
- `compileTemplate` — full template compilation
- Convenience constructors: `AND()`, `OR()`, `leaf()`

### Phase 3: Selector/Template Model Definitions ✅
- `_BaseSelectorModel`, `LeafSelectorModel`, `CombinatorSelectorModel`
- `SelectorModel` dynamic wrapper with `InternalizedDependency`
- `TemplateRuleModel`, `TemplateModel`
- `CharGroupsListModel` with min/max coherence
- New `VideoproofContextualKeyMomentModel` (with template + charGroupsList)

### Phase 4: Unified Word Generation Engine ✅
- `getSelectedChars`, `resolveChars`, `resolveOuterChars`
- `generateWords(compiledTemplate, innerChars, outerChars)`
- `BUILTIN_TEMPLATES` — all five Latin template specs

### Phase 5: Wire Engine into Actor ✅
- `_PAD_MODE_TO_TEMPLATE_KEY` translation layer
- `_getCompiledTemplate` with caching
- New `_getCellContents` calling through template engine
- Removed ~260 lines of old business logic

### Phase 6: Actor Model Migration 🔲
- Swap old model imports in `videoproof-contextual.mjs`
- Update `available-actors.mjs` to use new models
- Update `stage-and-actors.mjs` REGISTERED_GENERIC_KEYMOMENT_FIELDS
- **Breaking change**: saved documents with old model format won't load
- Consider migration path / version detection

### Phase 9: UI Integration 🔲
- Template selector dropdown (built-in templates + custom)
- Custom pattern text input
- CharGroups list UI (add/remove second charGroup)
- Preset save/load

---

## Key Codebase References

- `lib/js/components/actors/videoproof-contextual-template.mjs` — New template engine
- `lib/js/components/actors/videoproof-contextual-models.mjs` — New model definitions
- `lib/js/components/actors/videoproof-contextual.mjs` — Actor (old models + new engine)
- `lib/js/components/actors/videoproof-array.mjs` — Sibling actor, shares CharGroupModel
- `lib/js/components/actors/available-actors.mjs` — Actor type registration
- `lib/js/components/layouts/stage-and-actors.mjs` — Layout wiring
- `lib/js/components/axes-math.mjs` — Reference: self-referential dynamic types
- `lib/js/components/type-spec-models.mjs` — Reference: StylePatch pattern
- `lib/js/components/dynamic-types-pattern.mjs` — `createDynamicModel` helper
- `lib/js/components/ui-char-groups.mjs` — Char group utilities
- `lib/assets/glyph-groups.json` — Char database (Latin, Greek, Cyrillic, World)
- `docs/planning/compositor/roadmap.md` — Future inheritance system
