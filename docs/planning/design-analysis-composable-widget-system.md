---
eleventyNavigation:
  key: "Design Analysis: Composable Widget System (RFC 3/3)"
  parent: Planning
  title: 'Widgets RFC 3: Composable'
  order: 32
agent-created: true
---

# Design Analysis: Composable Widget System
## Revised Evaluation — Beyond REQUIREMENTS

> **Status: PROPOSAL / not implemented.** As of 2026-07-16, `static
> INTERFACE` and `static REQUIREMENTS` on widgets do **not** exist in the
> codebase, and neither does the `widget()` / `field()` / `group()` recipe
> DSL described below. The code snippets in this document illustrate a
> *proposed* API — they are not descriptions of current behaviour. The
> analysis of the *current* limitations (stringly-typed dependency
> mappings, the flat 1:1 `_defineGenericWidgets`, `uiElementsMap` as the
> reuse baseline) is accurate at the time of writing. Treat this as an RFC.
>
> *Originally generated 2026-02-25; filed under `docs/planning/` 2026-07-16.*
>
> **Part 3 of 3 — the most current view in the widget-setup series.** The
> "Corrections Applied" section below overrules the central theses of the
> two prior iterations: `design-analysis-self-describing-widget-setup.md`
> (part 1, proposes `static REQUIREMENTS`) and
> `design-analysis-widget-setup-evaluation.md` (part 2, critiques part 1
> and proposes model-declared UI hints).

### Corrections Applied

1. The `REGISTERED_GENERIC_KEYMOMENT_FIELDS` friction is a minor annoyance,
   not the central problem. The real design challenge is composability.
2. The 1:1 field→widget assumption is wrong. Real cardinalities are 1:1,
   1:N, N:1, and 0:1. The recipe primitive must be widget-centric.
3. Widget-declared typed interfaces enable smart tooling, user-facing
   composition, and alternative widget implementations for the same data.

---

## The Gap: No Middle Ground

TypeRoof currently has two widget construction modes:

### Mode 1: Full Auto (`_defineGenericWidgets`)

```javascript
this._defineGenericWidgets(
    TypeClass
  , fieldName => allowList.has(fieldName)
  , {zone: 'local'}
  , GENERIC
  , injectable
)
```

**Strength**: Zero boilerplate per field.
**Weakness**: Flat list. No grouping, no ordering, no interstitials.
Iterates fields one-by-one — assumes 1:1 field→widget.

### Mode 2: Full Manual

```javascript
[
    {zone: 'main', rootPath: Path.fromParts(...)}
  , [['fontSize', 'value'], ['/font', 'font']]
  , UIColorChooser
  , zones, 'Text Color', getDefaults, updateDefaultsDependencies, requireUpdateDefaults
]
```

**Strength**: Total control.
**Weakness**: Verbose, error-prone, requires deep internal knowledge.

### The Missing Middle

```
┌─────────────────────────────────┐
│ Section: "Typography"           │  ← label/container
│ ┌─────────────────────────────┐ │
│ │ [auto: font selector]       │ │  ← type-driven
│ │ [auto: font size]           │ │  ← type-driven
│ └─────────────────────────────┘ │
│ ── separator ──                 │  ← interstitial
│ Section: "Contextual Settings"  │  ← label/container
│ ┌─────────────────────────────┐ │
│ │ [auto: padMode]             │ │  ← type-driven
│ │ [auto: customPad]           │ │  ← conditional visibility
│ │ [auto: charGroup]           │ │  ← complex: 1:N
│ └─────────────────────────────┘ │
│ ── separator ──                 │  ← interstitial
│ Section: "Appearance"           │  ← label/container
│ ┌─────────────────────────────┐ │
│ │ [custom: color picker]      │ │  ← manual override
│ │ [auto: showCellBoxes]       │ │  ← type-driven
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## Field ≠ Widget: Cardinality Matters

### Real Cardinality Patterns

**1:1 — Field → Widget** (common, simple)
`padMode` → one select dropdown. The happy path.

**1:N — Field → Multiple Widgets** (complex fields)
`charGroup` → `UICharGroupContainer` builds multiple sub-widgets internally.
The field is complex enough to warrant an entire sub-UI.

**N:1 — Multiple Fields → One Widget** (composite controls)
`FontSelect` reads `activeFontKey` (to select) + `options` (to populate
the dropdown). It consumes two model paths through one widget.

`UIColorChooser` reads/writes through its rootPath but also consumes
`animationProperties@` via `requireUpdateDefaults` for defaults.

**0:1 — No Field → Widget** (derived/action UI)
Preview displays, action buttons, computed status indicators.

### The Typing Gap

Currently, dependency mappings are untyped string pairs:

```javascript
// ComponentWrapper receives:
rawDependencyMapping = [
    ['fontSize', 'value']     // external 'fontSize' → internal 'value'
  , ['/font', 'font']        // external '/font' → internal 'font'
]
```

The widget knows it calls `this.getEntry('value')` and
`this.getEntry('font')` — but nothing declares **what types** those
entries should be. The binding is stringly-typed.

---

## Proposed Addition: Typed Widget Interfaces

### Core Idea

Each widget declares its **typed interface** — what bindings it accepts,
what types it expects on each, and what role each binding serves.

### What Exists Today (Implicit)

```javascript
// FontSelect implicitly expects:
//   'activeFontKey' — a ForeignKey-ish string value (read/write)
//   'options'       — a list/map of available fonts (read-only)
// But this is only discoverable by reading the source:
update(changed) {
    if(changed.has('options'))          // ← implicit: needs 'options'
        this._updateOptions(changed.get('options'));
    if(changed.has('activeFontKey'))    // ← implicit: needs 'activeFontKey'
        this._updateValue(changed.get('activeFontKey'));
}
```

```javascript
// UIToggleButton implicitly expects:
//   'boolean' — a BooleanModel value (read/write)
update(changedMap) {
    if(changedMap.has('boolean'))       // ← implicit: needs 'boolean'
        this._ui.update(changedMap.get('boolean').value);
}
```

### What Could Exist (Explicit)

```javascript
export class FontSelect extends _BaseComponent {
    // Typed interface declaration
    static INTERFACE = {
        activeFontKey: {
            type: StringModel       // or ForeignKeyModel
          , role: 'value'           // semantic: this is the primary editable value
          , access: 'read-write'
          , required: true
        }
      , options: {
            type: InstalledFontsModel  // or a compatible type
          , role: 'options'         // semantic: populates choices
          , access: 'read-only'
          , required: true
        }
    };
    // ...
}
```

```javascript
export class UIToggleButton extends _BaseComponent {
    static INTERFACE = {
        boolean: {
            type: BooleanModel
          , role: 'value'
          , access: 'read-write'
          , required: true
        }
    };
    // ...
}
```

```javascript
export class UIResetButton extends _BaseComponent {
    static INTERFACE = {
        target: {
            type: _AbstractStructModel  // accepts any struct
          , role: 'action-target'
          , access: 'write-only'        // never reads, only resets
          , required: true
        }
    };
}
```

```javascript
export class UIColorChooser extends _BaseContainerComponent {
    static INTERFACE = {
        color: {
            type: ColorModel
          , role: 'value'
          , access: 'read-write'
          , required: true
          , isRootPath: true  // this binding sets the rootPath
        }
    };
    // Constructor args are separate from bindings
    static REQUIREMENTS = [
        require('settings:rootPath')
      , require('zones')
      , require('label')
      , require('getDefault')
      , require('updateDefaultsDependencies')
      , require('raw:requireUpdateDefaults')
    ];
}
```

### Access Modes

Widget bindings have three access modes:

| Access | Reads model? | Writes model? | Example |
|--------|:--:|:--:|---------|
| `read-only` | ✅ | ❌ | Preview display, status indicator, font metrics viewer |
| `write-only` | ❌ | ✅ | Action button, file picker that sets a path, reset trigger |
| `read-write` | ✅ | ✅ | Most form inputs (select, text, toggle, color chooser) |

This distinction matters for user-facing composition:
- **read-only** widgets are *displays* — they show data
- **write-only** widgets are *actions* — they produce values without reflecting state
- **read-write** widgets are *editors* — the standard interactive control

A user composing an interface could filter: "Show me widgets that can
*display* this font metric" vs "Show me widgets that can *edit* this color."

### INTERFACE vs REQUIREMENTS: Different Concerns

These serve **different purposes** and are not redundant:

| Aspect | INTERFACE | REQUIREMENTS |
|--------|-----------|-------------|
| **What it describes** | Data bindings (model paths → widget) | Constructor parameters |
| **When it's used** | Runtime: wiring model state to widget updates | Build time: creating the widget instance |
| **Cardinality** | Maps internal names to expected types | Positional constructor args |
| **Purpose** | Compatibility checking, smart suggestions | Dependency resolution |
| **User-facing** | Yes: "which widgets work with this data?" | No: internal plumbing |

A widget's INTERFACE says: "I consume a `BooleanModel` on my `boolean` binding."
A widget's REQUIREMENTS says: "My constructor needs a `label` string and a `classToken`."

**INTERFACE is about data flow. REQUIREMENTS is about instantiation.**

---

## What Typed Interfaces Enable

### 1. Smart Widget Suggestions

Given a model field of type `ColorModel`, a recipe builder can query:

```javascript
function findCompatibleWidgets(modelType) {
    return ALL_WIDGETS.filter(W =>
        Object.values(W.INTERFACE || {}).some(binding =>
            binding.role === 'value'
            && (modelType === binding.type
                || modelType.prototype instanceof binding.type)
        )
    );
}

findCompatibleWidgets(ColorModel)
// → [UIColorChooser, UISimpleColorPicker, UIColorSliders, ...]
```

A user building a custom interface gets presented: "For this color field,
you can use: Color Chooser (full), Simple Color Picker, or Color Sliders."

### 2. Alternative Implementations

Different widgets for the same data type — user preference:

```javascript
// All three accept BooleanModel on 'boolean' binding:
class UIToggleButton { static INTERFACE = { boolean: { type: BooleanModel, role: 'value' } } }
class UICheckbox     { static INTERFACE = { boolean: { type: BooleanModel, role: 'value' } } }
class UISwitch       { static INTERFACE = { boolean: { type: BooleanModel, role: 'value' } } }
```

In a recipe:
```javascript
field('showCellBoxes')                          // default: system picks
field('showCellBoxes', { prefer: UISwitch })    // user override: switch style
```

### 3. Composite Binding Validation

For N:1 widgets, INTERFACE declares all required bindings:

```javascript
class UIPositionPicker extends _BaseComponent {
    static INTERFACE = {
        x: { type: NumberModel, role: 'coordinate', access: 'read-write', required: true }
      , y: { type: NumberModel, role: 'coordinate', access: 'read-write', required: true }
    };
}
```

A recipe builder can validate that both bindings are satisfied:
```javascript
widget(UIPositionPicker, {
    bindings: { x: 'positionX', y: 'positionY' }
})
// Validator checks: positionX is NumberModel ✓, positionY is NumberModel ✓
```

### 4. Auto-Generated Dependency Mappings

If INTERFACE declares what internal names the widget uses, and the recipe
declares which model paths to bind, the dependency mappings can be
auto-generated:

```javascript
// Instead of manually writing:
[['fontSize', 'value'], ['/font', 'font']]

// The recipe processor generates it from:
widget(UINumberInput, {
    bindings: { value: 'fontSize' }
    // font not needed for UINumberInput
})
// → dependencyMappings = [['fontSize', 'value']]
```

### 5. Discoverability for Agents and Tools

An agent (like me) implementing a new layout can ask:
"What widgets accept `PadModeModel`?" instead of searching source code.

A documentation generator can produce widget catalogs:
"FontSelect: requires `activeFontKey` (StringModel, read-write) and
`options` (InstalledFontsModel, read-only)."

---

## Revised Recipe Syntax with Typed Bindings

### The Primitive: `widget()`

```javascript
// Fully explicit — N:1 binding, validated by INTERFACE
widget(UIPositionPicker, {
    bindings: { x: 'positionX', y: 'positionY' }
})
```

### The Sugar: `field()`

```javascript
// 1:1 — auto-resolves widget from model type
field('padMode')

// 1:1 with preference — user chose a specific widget style
field('padMode', { prefer: UIRadioGroup })

// 1:1 with conditional visibility
field('customPad', { visibleWhen: { field: 'padMode', notEquals: 'empty' } })
```

When `field()` is processed:
1. Look up field type from model (`PadModeOrEmptyModel`)
2. Find all widgets with compatible INTERFACE (via `role: 'value'`)
3. Use `prefer` if specified, otherwise use `uiElementsMap` default
4. Auto-generate dependency mapping from INTERFACE

### Structural Elements

```javascript
group('Contextual Settings', [
    field('charGroup')
  , field('padMode')
  , field('customPad')
])
separator()
autoFields({ exclude: ['keyMoments'] })
```

### The Catch-All: `autoFields()`

```javascript
// Iterate remaining model fields, find compatible widgets, auto-bind
autoFields({
    exclude: ['keyMoments', 'activeActors']
  , preferenceMap: {
        'showCellBoxes': UISwitch  // user preference for this field
    }
})
```

---

## Architecture: How It All Connects

```
┌──────────────────────┐
│ Model (metamodel)    │  Fields with types (PadModeModel, ColorModel, ...)
└──────────┬───────────┘
           │ "What data exists?"
           ▼
┌──────────────────────┐
│ Widget INTERFACE     │  Typed bindings (what data each widget accepts)
└──────────┬───────────┘
           │ "Which widgets are compatible?"
           ▼
┌──────────────────────┐
│ Recipe               │  Composition (field, widget, group, separator)
│                      │  with optional user preferences
└──────────┬───────────┘
           │ "How should widgets be arranged?"
           ▼
┌──────────────────────┐
│ Recipe Processor     │  Resolves bindings, validates types, generates
│                      │  widget setup arrays using _getWidgetConfig
└──────────┬───────────┘
           │ "Build the actual widgets"
           ▼
┌──────────────────────┐
│ ComponentWrapper     │  Manages lifecycle, rootPath, dependency mapping
│ + _initWidgets       │  (existing infrastructure — unchanged)
└──────────────────────┘
```

### Data Flow for Smart Suggestions (User-Generated UI)

```
User selects model field "stageBackgroundColor"
    │
    ▼
System reads: TypeClass.fields.get('stageBackgroundColor') → ColorModel
    │
    ▼
System queries: findCompatibleWidgets(ColorModel)
    │ Checks each widget's static INTERFACE for role:'value'
    │ with type === ColorModel or type instanceof compatible
    ▼
Presents options:
    ┌─────────────────────────────────┐
    │ ○ Color Chooser (full editor)   │  UIColorChooser
    │ ○ Simple Swatch                 │  UIColorSwatch
    │ ○ Color Sliders (RGB/HSL)       │  UIColorSliders
    │ ○ Hex Input                     │  UIColorHexInput
    └─────────────────────────────────┘
User picks → recipe stores preference → renders chosen widget
```

---

## Implementation Strategy

### What Exists and Reuse

| Concept | Already exists as | Proposed evolution |
|---------|------------------|-------------------|
| Type → Widget mapping | `uiElementsMap` | INTERFACE enables discovery + alternatives |
| Dependency resolution | `_getArgumentConfig` switch | Unchanged — recipes produce same output |
| Widget lifecycle | `ComponentWrapper` | Unchanged — consumes same setup arrays |
| Model type info | `TypeClass.fields` | Unchanged — recipes read from it |
| Named dependencies | `require()` / `InjectDependency` | REQUIREMENTS = same pattern, on class |

### New Additions

| Addition | Purpose | Effort |
|----------|---------|--------|
| `static INTERFACE` on widgets | Typed binding declarations | Low per widget, gradual |
| `processRecipe()` function | Recipe → widget setup arrays | Medium (new file) |
| `findCompatibleWidgets()` | INTERFACE-based widget discovery | Low |
| Recipe elements (`field`, `widget`, `group`, etc.) | Composition DSL | Low |
| Binding validator | Type-check recipe bindings vs INTERFACE | Low |

### Phased Rollout

**Phase 1: INTERFACE declarations** (non-breaking, additive)
Add `static INTERFACE` to key widgets: UIToggleButton, FontSelect,
UIColorChooser, UISelectInput, UILineOfTextInput, UINumberInput.
This is pure documentation initially — nothing consumes it yet.

**Phase 2: Recipe infrastructure** (new file, non-breaking)
Create `widget-recipes.mjs` with recipe elements and processor.
Convert one layout to recipes as proof of concept.

**Phase 3: `findCompatibleWidgets`** (enables smart suggestions)
Build the widget discovery function that queries INTERFACE.
This is the foundation for user-generated interfaces.

**Phase 4: REQUIREMENTS** (optional, enhances recipes)
Add `static REQUIREMENTS` to complex widgets where it saves
significant boilerplate in `custom()` recipe elements.

**Phase 5: User-facing recipe builder** (the endgame)
Visual tool that reads model fields, presents compatible widgets,
and produces serializable recipes.

---

## Summary

Three complementary concepts, each independently useful:

| Concept | What it solves | User-facing? |
|---------|---------------|:------------:|
| **INTERFACE** | "What data does this widget accept?" — typed bindings | ★★★★★ |
| **Recipes** | "How should widgets be composed?" — structure + ordering | ★★★★ |
| **REQUIREMENTS** | "How is this widget instantiated?" — constructor args | ★★ |

**INTERFACE is the most impactful for user-generated interfaces** because it
answers the question users actually ask: "What can I use to edit this field?"

**Recipes are the most impactful for developer ergonomics** because they
eliminate the manual widget setup boilerplate while supporting composition.

**REQUIREMENTS is the most impactful for DRY** because it eliminates
duplicate `require()` declarations between `uiElementsMap` and call sites.

Together they form a complete composable widget system:
- **INTERFACE** = what each widget can do (capability)
- **Recipes** = how widgets are arranged (composition)
- **REQUIREMENTS** = how widgets are built (instantiation)

---

*Generated: 2026-02-25*
*Key insights:*
*- Field ≠ Widget: cardinalities are 1:1, 1:N, N:1, 0:1*
*- Widget typed interfaces enable smart suggestions for user-generated UI*
*- INTERFACE (capability) ≠ REQUIREMENTS (instantiation) — different concerns*
*- `uiElementsMap` becomes one consumer of INTERFACE, not the only source*
