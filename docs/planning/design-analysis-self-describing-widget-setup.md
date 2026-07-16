# Design Analysis: Self-Describing Widget Setup

> **Status: PROPOSAL / not implemented — part 1 of 3.** As of 2026-07-16,
> `static REQUIREMENTS`, `static DEPENDENCY_MAPPINGS`, and
> `resolveWidgetSetup()` do **not** exist in the codebase; the snippets
> below are a *proposed* API. This is the first document in a three-part
> series written 2026-02-25, all filed under `docs/planning/`:
>
> 1. **this file** — proposes `static REQUIREMENTS` on widget classes;
> 2. `design-analysis-widget-setup-evaluation.md` — critiques this
>    proposal, arguing it treats a symptom and counter-proposing
>    model-declared UI hints;
> 3. `design-analysis-composable-widget-system.md` — the revised
>    synthesis ("Beyond REQUIREMENTS"), which **supersedes the central
>    theses of both earlier documents** and introduces `static INTERFACE`.
>
> Read as an evolving discussion; document 3 is the most current view.
> The analysis of *current* limitations remains accurate.

## Problem Statement

In TypeRoof's current architecture, widget construction knowledge is **split between
two locations**:

1. **The widget class** — knows its own constructor signature (`widgetBus, ...args`)
2. **The call site** — knows how to resolve those args from context (settings,
   dependency mappings, model types, injectable services)

This means every place that builds a widget must redundantly encode:
- Which settings keys to set (zone, rootPath, id)
- Which model paths map to which internal names
- Which constructor arguments to provide and in what order
- Which injectable services to resolve

The `require()` / `InjectDependency` pattern in `type-driven-ui-basics.mjs`
partially addresses this for the type-driven UI pipeline, but it exists only in
the centralized `uiElementsMap` — not on the widgets themselves.

### Concrete Example: The Current Split

**Widget definition** (`generic.mjs`):
```javascript
// UIToggleButton knows it needs these args:
constructor(widgetBus, classToken, labelIsOn, labelIsOff, title) { ... }
```

**Type-driven setup** (`type-driven-ui.mjs`, centralized registry):
```javascript
[BooleanModel, [UIToggleButton
    , require('settings:internalPropertyName', 'boolean')
    , require('classToken')
    , require('label', val=>`turn ${val} off`)
    , require('label', val=>`turn ${val} on`)
    , require('label', val=>`Toggle ${val}`)
]]
```

**Manual call site** (`videoproof-array-v2.mjs`, since renamed to
`videoproof.typeroof.jsx`; ad-hoc):
```javascript
[
    { zone: 'main', rootPath: Path.fromParts('.', 'keyMoments', '0', 'textColor') }
  , [] // dependency mappings - caller must know!
  , UIColorChooser
  , zones
  , 'Text Color'
  , this._getDefaults.bind(this, ...)
  , updateDefaultsDependencies
  , requireUpdateDefaults
]
```

The type-driven path (`uiElementsMap` → `_getArgumentConfig` → `_defineGenericWidgets`)
resolves `require()` objects at widget-build time. But the ad-hoc path in layout files
has no such resolution — the caller must manually construct the entire setup array.

---

## Proposed Design: Widget-Declared Requirements

### Core Idea

Move the `require()`-based setup declarations **onto the widget class itself**
as a static property. The widget class declares what it needs; the container
resolves those needs at construction time.

### How It Would Look

#### On the Widget Class

```javascript
export class UIToggleButton extends _BaseComponent {
    // jshint ignore:start
    static REQUIREMENTS = [
        require('settings:internalPropertyName', 'boolean')
      , require('classToken')
      , require('label', val=>`turn ${val} off`)
      , require('label', val=>`turn ${val} on`)
      , require('label', val=>`Toggle ${val}`)
    ];
    // jshint ignore:end

    constructor(widgetBus, classToken, labelIsOn, labelIsOff, title) { ... }
}
```

```javascript
export class UIColorChooser extends _BaseContainerComponent {
    // jshint ignore:start
    static REQUIREMENTS = [
        require('settings:rootPath')
      , require('zones')
      , require('label')
      , require('getDefault')
      , require('updateDefaultsDependencies')
      , require('raw:requireUpdateDefaults')
    ];
    // jshint ignore:end

    constructor(widgetBus, zones, label, getDefault,
                updateDefaultsDependencies, requireUpdateDefaults) { ... }
}
```

#### At the Call Site (Simplified)

Instead of manually building `[settings, dependencyMappings, Constructor, ...args]`:

```javascript
// Option A: Fully automatic from REQUIREMENTS
const widgetDef = resolveWidgetSetup(UIColorChooser, {
    zone: 'main'
  , rootPath: Path.fromParts('.', 'keyMoments', '0', 'textColor')
  , injectable
  , ppsRecord
  , fieldName: 'textColor'
});
// Returns: [settings, dependencyMappings, UIColorChooser, ...resolvedArgs]

// Option B: Use REQUIREMENTS as defaults, override specific args
const widgetDef = resolveWidgetSetup(UIColorChooser, {
    zone: 'main'
  , rootPath: Path.fromParts('.', 'keyMoments', '0', 'textColor')
  , overrides: { label: 'Text Color' }
  , injectable
  , ppsRecord
  , fieldName: 'textColor'
});
```

#### In the Type-Driven Registry (Simplified)

```javascript
// Before: uiElementsMap must duplicate what the widget already knows
[BooleanModel, [UIToggleButton
    , require('settings:internalPropertyName', 'boolean')
    , require('classToken')
    , require('label', val=>`turn ${val} off`)
    , ...
]]

// After: uiElementsMap can reference the widget's own REQUIREMENTS
// or override specific ones
[BooleanModel, UIToggleButton]  // uses static REQUIREMENTS as-is

// Or with overrides for model-specific customizations:
[BooleanModel, [UIToggleButton, { labelIsOn: val=>`turn ${val} off` }]]
```

---

## Detailed Design

### 1. Enhanced `InjectDependency` (require)

The existing `require()` function creates `InjectDependency` objects with
`name` and `payload`. This can be extended:

```javascript
export class InjectDependency {
    constructor(name, payload=null, typeHint=_NOTDEF) {
        this.name = name;
        this.payload = payload;
        // NEW: type constraint for validation
        this.typeHint = typeHint;
    }
}

// Existing — still works
require('label')
require('settings:internalPropertyName', 'value')

// Enhanced — with type hints for validation and documentation
require('label', null, String)
require('settings:internalPropertyName', 'value', 'dependencyMapping')
require('zones', null, Map)
```

### 2. `REQUIREMENTS` Static Property

Each widget class declares its requirements as a static array:

```javascript
class MyWidget extends _BaseComponent {
    static REQUIREMENTS = [
        // Each entry is an InjectDependency or a literal value
        require('settings:internalPropertyName', 'value')
      , require('label')
    ];
    // Constructor params match REQUIREMENTS order (after widgetBus):
    constructor(widgetBus, /* resolved from REQUIREMENTS */) { ... }
}
```

**Convention**: REQUIREMENTS entries correspond positionally to constructor
arguments after `widgetBus`. The resolution system processes each entry
and passes the result as a constructor argument.

### 3. `DEPENDENCY_MAPPINGS` Static Property

For widgets that need model-path-to-internal-name mappings:

```javascript
class MyWidget extends _BaseComponent {
    // Admissible model types this widget can consume
    static ADMISSIBLE_TYPES = new Set([PadModeModel, _AbstractEnumModel]);

    // Default dependency mappings (can be overridden)
    static DEFAULT_DEPENDENCY_MAPPINGS = [
        // [externalPath, internalName]  — or auto-derived from model type
    ];
}
```

### 4. Resolution Function

A new function in `basics.mjs` or `type-driven-ui-basics.mjs`:

```javascript
/**
 * Resolve a widget's REQUIREMENTS against a context to produce
 * a standard widget setup array.
 *
 * @param {typeof _BaseComponent} WidgetClass
 * @param {Object} context - { zone, rootPath, injectable, ppsRecord,
 *                              fieldName, overrides }
 * @returns {Array} [settings, dependencyMappings, WidgetClass, ...args]
 */
export function resolveWidgetSetup(WidgetClass, context) {
    const requirements = WidgetClass.REQUIREMENTS || [];
    const settings = new Map();
    const dependencyMappings = new Map();
    const args = [];

    if(context.zone)
        settings.set('zone', context.zone);
    if(context.rootPath)
        settings.set('rootPath', context.rootPath);

    for(const requirement of requirements) {
        if(!(requirement instanceof InjectDependency)) {
            // Literal value — pass through
            args.push(context.overrides?.[requirement] ?? requirement);
            continue;
        }

        // Delegate to existing _getArgumentConfig logic
        const [argSettings, argDeps, argArgs] =
            _resolveRequirement(requirement, context);

        for(const [k, v] of argSettings) settings.set(k, v);
        for(const [k, v] of argDeps) dependencyMappings.set(k, v);
        args.push(...argArgs);
    }

    return [
        Object.fromEntries(settings)
      , Array.from(dependencyMappings)
      , WidgetClass
      , ...args
    ];
}
```

The key insight is that `_resolveRequirement` reuses the **existing**
`_getArgumentConfig` switch-case logic. No new resolution mechanism
needed — just a new entry point.

---

## Where to Implement

### Phase 1: Add REQUIREMENTS to Widget Classes (Non-Breaking)

**Files**: `lib/js/components/generic.mjs`, `lib/js/components/ui-color-chooser.mjs`,
`lib/js/components/ui-char-groups.mjs`, etc.

- Add `static REQUIREMENTS = [...]` to each widget class
- This is purely additive — existing code continues to work
- The REQUIREMENTS array mirrors what `uiElementsMap` currently declares

### Phase 2: Add `resolveWidgetSetup` Function

**File**: `lib/js/components/type-driven-ui-basics.mjs`

- Extract the resolution logic from `_getArgumentConfig` into a standalone function
- The existing `_getArgumentConfig` method can delegate to this function
- `_BaseTypeDrivenContainerComponent._defineGenericWidget` can optionally
  use `WidgetClass.REQUIREMENTS` as a fallback when no `uiElementsMap` entry exists

### Phase 3: Simplify `uiElementsMap`

**File**: `lib/js/components/type-driven-ui.mjs`

- For widgets where `REQUIREMENTS` matches the `uiElementsMap` entry exactly,
  the map entry can be simplified to just `[ModelType, WidgetClass]`
- For widgets with model-specific overrides, keep the explicit entries

### Phase 4: Simplify Layout Call Sites

**Files**: `lib/js/components/layouts/videoproof.typeroof.jsx` (formerly
`videoproof-array-v2.mjs`), `lib/js/components/layouts/motion-stage.mjs`
(formerly `stage-and-actors.mjs`), etc.

- Replace manual `[settings, deps, Constructor, ...args]` arrays
  with `resolveWidgetSetup(Constructor, context)` calls
- This is the biggest ergonomic win — layout files become dramatically simpler

### Phase 5: ComponentWrapper Integration

**File**: `lib/js/components/basics.mjs`

`ComponentWrapper` is the natural place to integrate widget-declared requirements
because it already handles:
- Dependency mapping resolution (`absPathDependencies`)
- `rootPath` management
- Widget creation (`create()`)
- Widget lifecycle (create/destroy/reinsert)

The `_CommonContainerComponent._initWrapper` method (line 805) could be enhanced:

```javascript
_initWrapper(childrenWidgetBus, settings, dependencyMappings, Constructor, ...args) {
    // NEW: If Constructor has REQUIREMENTS and args are empty,
    //      auto-resolve from REQUIREMENTS
    if(Constructor.REQUIREMENTS && args.length === 0) {
        const resolved = resolveWidgetSetup(Constructor, {
            ...settings
          , injectable: this._injectable  // or however injectable is accessed
        });
        // Use resolved settings/deps/args
        [settings, dependencyMappings, , ...args] = resolved;
    }

    const hostElement = settings.zone
        ? this._zones.get(settings.zone)
        : null;
    // ... rest unchanged
}
```

---

## Strengths

### 1. Self-Documenting Widgets
Each widget class tells you exactly what it needs. No need to search
`uiElementsMap`, layout files, or `getActorWidgetSetup` to understand
a widget's requirements.

### 2. Single Source of Truth
Requirements live on the class — `uiElementsMap` and call sites become
consumers of that truth rather than independent sources that can diverge.

### 3. DRY: Eliminates Redundant Setup Arrays
The most common pattern in layout files is manually constructing the
`[settings, deps, Constructor, ...args]` tuple. With REQUIREMENTS on
the class, this becomes a single function call.

### 4. Backward Compatible
- Widgets without `REQUIREMENTS` work exactly as before
- `uiElementsMap` entries override `REQUIREMENTS` when present
- Layout files can mix old and new patterns during migration
- `ComponentWrapper` doesn't change its external API

### 5. Enables Tooling and Validation
With requirements declared on classes:
- A validator could check that all REQUIREMENTS are satisfiable in a given context
- Documentation can be auto-generated from REQUIREMENTS
- Agents can inspect `WidgetClass.REQUIREMENTS` to understand what to provide

### 6. Natural Extension of Existing Patterns
The `require()` / `InjectDependency` system already exists. This proposal
just moves where the `require()` calls live — from the registry to the class.

---

## Weaknesses

### 1. Context Sensitivity
Some widgets need different setups depending on context. For example,
`UIColorChooser` in a key moment editor needs `updateDefaultsDependencies`
resolved from the parent's injectable, but the same class used in a
standalone color picker might have different defaults.

**Mitigation**: REQUIREMENTS define the *shape* of what's needed (via
`require()` names), not the *values*. The resolution context provides
values. Overrides handle special cases.

### 2. Constructor Argument Ordering
REQUIREMENTS must match constructor parameter order exactly. If a
constructor is refactored, REQUIREMENTS must change too.

**Mitigation**: This is already true for `uiElementsMap` — it's just
relocating the coupling. TypeScript types could enforce the contract.
Alternatively, a named-parameter pattern (Map or object) could replace
positional arguments in the future.

### 3. Composite Requirements Are Complex
Some requirements have compound effects — `require('requireUpdateDefaults')`
both adds dependency mappings AND injects an argument. This compound
behavior is currently handled by the switch-case in `_getArgumentConfig`.
Moving requirements to the class doesn't simplify this complexity.

**Mitigation**: The resolution function delegates to the same `_getArgumentConfig`
logic. The complexity is contained, not duplicated.

### 4. Inheritance Complications
If `class SpecialSelect extends UISelectInput`, should `REQUIREMENTS`
be inherited? Overridden? Merged?

**Mitigation**: Use standard JavaScript static property semantics:
subclass defines its own `REQUIREMENTS` or inherits from parent.
The `createClass` pattern (used for `UISelectInput`) would need to
propagate REQUIREMENTS from the wrapped class.

### 5. Two Resolution Paths During Migration
Until all widgets have REQUIREMENTS, the system must support both
`uiElementsMap`-driven and `REQUIREMENTS`-driven resolution.

**Mitigation**: `uiElementsMap` takes precedence. `REQUIREMENTS` is
the fallback. This is a transitional cost, not a permanent one.

### 6. The `createClass` Wrapper Pattern
Many UI widgets are created via `_UIAbstractPlainInputWrapper.createClass()`:

```javascript
UISelectInput = _UIAbstractPlainInputWrapper.createClass(
    'UISelectInput', _AbstractPlainSelectInput);
```

These wrapper classes would need a way to derive REQUIREMENTS from their
wrapped inner class, or declare their own. This adds complexity to the
`createClass` factory.

**Mitigation**: The `createClass` factory can copy/adapt REQUIREMENTS from
the inner class, similar to how it already wraps the constructor.

---

## Comparison: Current vs Proposed

| Aspect | Current | Proposed |
|--------|---------|----------|
| Widget setup knowledge | Split: class + registry + call site | Primarily on class |
| Adding new widget type | Edit class + registry + all call sites | Edit class (REQUIREMENTS), registry optional |
| Adding new field to model | Edit model + REGISTERED_FIELDS + maybe registry | Edit model + (auto-discovered if REQUIREMENTS exist) |
| Call site complexity | Full tuple: `[settings, deps, Class, ...args]` | `resolveWidgetSetup(Class, context)` |
| Discoverability | Search multiple files | Read `WidgetClass.REQUIREMENTS` |
| Validation | Runtime errors when args mismatch | Could be checked statically |
| Migration cost | N/A | Gradual: add REQUIREMENTS to classes over time |

---

## Interaction with `REGISTERED_GENERIC_KEYMOMENT_FIELDS`

The gatekeeper set `REGISTERED_GENERIC_KEYMOMENT_FIELDS` in `motion-stage.mjs`
(formerly `stage-and-actors.mjs`)
could eventually become unnecessary if the type-driven UI system can automatically
determine which fields have valid UI mappings.

With REQUIREMENTS on widget classes and types mapped in `uiElementsMap`, the
`_defineGenericWidgets` method could check:

```javascript
// Instead of:
fieldName => REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName)

// Could become:
fieldName => {
    const FieldType = TypeClass.fields.get(fieldName);
    return genericTypeToUIElement(FieldType, false) !== false;
}
```

This would eliminate the "invisible gate" problem entirely — if a type has a
UI mapping, its fields automatically get editors.

---

## Recommendation

### Start with Phase 1 + Phase 2

1. **Add `static REQUIREMENTS`** to the most commonly used widgets
   (`UIToggleButton`, `UIColorChooser`, `UICharGroupContainer`)
2. **Add `resolveWidgetSetup()`** to `type-driven-ui-basics.mjs`
3. **Test** by converting one layout file's widget setup to use the new function

This validates the design with minimal risk. The existing system continues to
work unchanged. New code can opt into the simpler pattern.

### Later: Phase 3-5

Once the pattern proves itself:
- Simplify `uiElementsMap` entries
- Convert layout call sites
- Integrate into `ComponentWrapper._initWrapper`
- Consider auto-deriving `REGISTERED_GENERIC_KEYMOMENT_FIELDS`

---

*Generated: 2026-02-25, based on analysis of TypeRoof widget architecture*
*Key files studied: basics.mjs (ComponentWrapper, _CommonContainerComponent),*
*type-driven-ui-basics.mjs (require, InjectDependency, _getArgumentConfig,*
*_defineGenericWidgets, createTypeToUIElementFunction), type-driven-ui.mjs*
*(uiElementsMap), generic.mjs (UI widget classes), videoproof-array-v2.mjs,*
*stage-and-actors.mjs (layout widget setup patterns)*
*Note: videoproof-array-v2.mjs → videoproof.typeroof.jsx and*
*stage-and-actors.mjs → motion-stage.mjs since this was written.*
*Filed under docs/planning/ 2026-07-16 as part 1 of the widget-setup series.*
