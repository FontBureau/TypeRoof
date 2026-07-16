---
eleventyNavigation:
  key: "Design Analysis: Widget Setup Evaluation (RFC 2/3)"
  parent: Planning
agent-created: true
---

# Critical Evaluation: Self-Describing Widget Setup

> **Status: PROPOSAL / not implemented — part 2 of 3.** As of 2026-07-16,
> neither the `static REQUIREMENTS` proposal reviewed here nor the
> model-declared UI-hints counter-proposal below exists in the codebase.
> This is the second document in a three-part series written 2026-02-25,
> all filed under `docs/planning/`:
>
> 1. `design-analysis-self-describing-widget-setup.md` — proposes
>    `static REQUIREMENTS` on widget classes;
> 2. **this file** — critiques that proposal (symptom vs. root cause) and
>    counter-proposes model-declared UI hints;
> 3. `design-analysis-composable-widget-system.md` — the revised
>    synthesis ("Beyond REQUIREMENTS"), which **supersedes the central
>    theses of both earlier documents**.
>
> Read as an evolving discussion; document 3 is the most current view.
> The analysis of *current* limitations remains accurate.

## Is the `static REQUIREMENTS` Proposal a Good Idea?

**Short answer: It's a reasonable idea but it addresses a symptom, not the root cause.**

The proposal correctly identifies that widget setup knowledge is scattered. But the
deeper question is: *why* is it scattered? And does moving `require()` arrays onto
classes actually solve the real problems?

---

## What the Proposal Gets Right

### 1. The Problem Is Real
Widget construction in TypeRoof requires coordination between three concerns:
- **What data the widget needs** (model paths, injectable services)
- **How that data maps to constructor parameters** (resolution logic)
- **Where in the UI the widget lives** (zone, rootPath, host element)

Currently, concern #1 lives in `uiElementsMap` (for type-driven) or at ad-hoc
call sites (for manual layout). Moving it to the class consolidates concern #1.

### 2. `require()` Is Already the Right Abstraction
The `InjectDependency` / `require()` pattern is a good intermediate
representation. It names what's needed without specifying how to get it.
This is fundamentally correct.

---

## What the Proposal Gets Wrong (or Incomplete)

### 1. It Doesn't Address the Real Friction

Looking at the actual pain during our implementation, the friction points were:

| Problem | Would REQUIREMENTS fix it? |
|---------|--------------------------|
| `padMode` not in `REGISTERED_GENERIC_KEYMOMENT_FIELDS` | **No** — this is a filtering problem, not a resolution problem |
| 6 scattered registration points in `available-actors.mjs` | **No** — unrelated to widget setup |
| `fixGridLineBreaks` vs `fixContextualLineBreaks` | **No** — this is renderer logic |
| `fixed-lines` CSS class convention | **No** — this is implicit knowledge |

The proposal optimizes the **type-driven UI path** which *already works well*.
The real problems are elsewhere.

### 2. Two Resolution Contexts Are Fundamentally Different

The type-driven path (`_defineGenericWidgets`) and the manual path (layout call
sites) serve different purposes:

**Type-driven path**: "Given a model field of type X, automatically build a
matching editor widget." This is *generic* — the same resolution logic applies
to any field of that type.

**Manual path**: "Build this specific widget with these specific bindings for
this specific layout purpose." This is *contextual* — the widget setup depends
on the layout's specific needs.

`static REQUIREMENTS` works well for the type-driven path (it already does via
`uiElementsMap`). But for the manual path, the widget often needs different
dependency mappings, different rootPaths, and different injectable bindings
depending on *where* it's used. REQUIREMENTS can't capture that variance.

### 3. The `_getArgumentConfig` Switch-Case Is a Service Locator

The resolution engine (`_getArgumentConfig`) is essentially a service locator
pattern — it resolves named dependencies from an ambient context (`injectable`,
`ppsRecord`, `zone`, `fieldName`). Moving `require()` declarations to classes
doesn't change the fact that resolution depends on this context.

The switch-case has 20+ cases and growing. Making it the universal resolution
mechanism means every new requirement type needs a new case. This doesn't scale
well regardless of where the `require()` calls live.

---

## A Better Approach: Lean Into What Already Works

### Observation: The Metamodel Already Knows Everything

TypeRoof's metamodel is the real source of truth. When you write:

```javascript
VideoproofContextualActorModel = _BaseActorModel.createClass(
    'VideoproofContextualActorModel'
  , ...genericActorMixin
  , ['keyMoments', VideoproofContextualKeyMomentsModel]
  , ...typographyActorMixin
);
```

The `fields` map on the resulting class contains all field names and their types.
The `_defineGenericWidgets` function already iterates these fields. The only
thing preventing automatic UI generation is the **filter function**:

```javascript
fieldName => REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName)
```

### The Root Problem: Filtering, Not Resolution

The type-driven system can ALREADY resolve `PadModeModel` → `UISelectInput`.
It can ALREADY resolve `StringOrEmptyModel` → `UILineOfTextOrEmptyInput`.
The resolution works. **The gate blocks it.**

### Proposal: Model-Declared UI Hints

Instead of putting requirements on widget classes, put **UI hints on the model**:

```javascript
// On the model field definition:
VideoproofContextualKeyMomentModel = TypeClass.createClass(
    'VideoproofContextualKeyMomentModel'
  , ...typographyKeyMomentModelMixin
  , ['charGroup', CharGroupModel]
  , ['padMode', PadModeOrEmptyModel]        // type already determines UI
  , ['customPad', StringOrEmptyModel]        // type already determines UI
  , ['showCellBoxes', BooleanDefaultTrueOrEmptyModel]
  , ['stageBackgroundColor', ColorModel]
);

// The model TYPE is all that's needed for generic UI.
// No registration in REGISTERED_GENERIC_KEYMOMENT_FIELDS required.
```

**If the type-driven UI system has a mapping for a field's type, that field
should get a UI widget automatically.** The opt-in gate should become an
opt-out mechanism:

```javascript
// Instead of allow-list:
fieldName => REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName)

// Use deny-list (for fields that explicitly should NOT get generic UI):
fieldName => !EXCLUDED_FROM_GENERIC_UI.has(fieldName)

// Or even better — derive from type mappability:
fieldName => {
    const FieldType = TypeClass.fields.get(fieldName);
    return genericTypeToUIElement(FieldType, false) !== false;
}
```

### Why This Is Better

1. **Zero registration**: Adding `padMode` to the model → UI appears automatically
2. **Single source of truth**: The metamodel field type IS the UI specification
3. **Already mostly works**: The resolution pipeline handles all standard types
4. **Addresses the actual friction**: The invisible gate was our real problem
5. **No new abstraction**: Uses existing type-driven resolution, just removes the gate

### What About Non-Standard UI?

For cases where a field needs a custom widget (not the generic type-mapped one),
the model field type can carry that information:

```javascript
// Option A: Override in uiElementsMap (already works)
// CharGroupModel → UICharGroupContainer (not the generic struct handler)
[CharGroupModel, [UICharGroupContainer, ...]]

// Option B: Static override on the model class (new)
// This allows the MODEL to say "I need a specific editor"
CharGroupModel.UI_ELEMENT = UICharGroupContainer;

// Option C: Type-level annotation (future)
// The type itself declares its preferred editor
PadModeModel.EDITOR_HINT = 'select'; // generic types don't need this
CustomComplexModel.EDITOR_HINT = UICustomEditor; // specific override
```

---

## Combined Recommendation

### Tier 1: Quick Wins (Highest Impact, Lowest Effort)

**1. Remove the `REGISTERED_GENERIC_KEYMOMENT_FIELDS` gate**

Replace the allow-list with type-mappability check:

```javascript
// In motion-stage.mjs (formerly stage-and-actors.mjs)
const isGenericUIAvailable = (fieldName, TypeClass) => {
    const FieldType = TypeClass.fields.get(fieldName);
    // Returns false for unmapped types, truthy for mapped ones
    return genericTypeToUIElement(FieldType, false) !== false;
};
```

**Impact**: New model fields with standard types automatically get UI editors.
Our `padMode` + `customPad` problem disappears permanently — for all future
actors too.

**Risk**: Low. Fields with unmapped types simply won't appear. Fields that
previously had no UI (like internal model fields) would only appear if they
have a type mapping, which standard internal fields (like sub-models,
ordered maps) typically don't have in `uiElementsMap`.

**Caveat**: Some fields that have type mappings might not be appropriate for
generic UI in all contexts. A deny-list for specific exclusions handles this:

```javascript
// Fields that HAVE type mappings but should NOT get generic UI
const EXCLUDE_FROM_GENERIC_UI = new Set(['keyMoments', 'activeActors']);

const isGenericUIAvailable = (fieldName, TypeClass) => {
    if(EXCLUDE_FROM_GENERIC_UI.has(fieldName)) return false;
    const FieldType = TypeClass.fields.get(fieldName);
    return genericTypeToUIElement(FieldType, false) !== false;
};
```

**2. Unify actor registration into a single declaration**

Instead of 6 scattered integration points in `available-actors.mjs`:

```javascript
// Single declaration per actor type
const ACTOR_DEFINITIONS = [
    {
        typeKey: 'VideoproofContextualActorModel'
      , label: 'Videoproof Contextual'
      , Model: VideoproofContextualActorModel
      , Renderer: VideoproofContextualActorRenderer
      , isLeaf: true
      , isTypographic: true
      , hasFontSelect: true
      , zones: ['main', 'layer']
      , dependencyMappings: [
            ['/activeState/font', 'font']
          , ['animationProperties@', 'animationProperties@']
        ]
      , charGroupsData  // optional, for actors that use char groups
    }
  , // ... other actors
];

// Then derive everything from ACTOR_DEFINITIONS:
// initAvailableActorTypes, getActorWidgetSetup, getActorTreeNodeType,
// isTypographicActorTypeKey, getActorTypeKeySpecificWidgets
```

**Impact**: Adding a new actor = adding one object to one array.

### Tier 2: Medium-Term (Good Idea, More Effort)

**3. The `static REQUIREMENTS` proposal (from the design analysis)**

This IS a good idea for the type-driven path specifically. But implement it
AFTER Tier 1, because Tier 1 solves the immediate friction with less effort.

The best use case for REQUIREMENTS is **custom widgets that are reused in
multiple contexts** (like `UIColorChooser`, `UICharGroupContainer`). For
simple type-mapped widgets (`UISelectInput`, `UILineOfTextInput`), the
type-driven resolution already handles them.

**4. Extract the `_getArgumentConfig` switch-case into a protocol**

Instead of one giant switch-case, make requirement resolution pluggable:

```javascript
// Each requirement type registers a resolver
const RESOLVERS = new Map([
    ['settings:rootPath', (context) => {
        context.settings.set('rootPath', Path.fromParts(Path.RELATIVE, context.fieldName));
    }]
  , ['label', (context) => {
        return getRegisteredPropertySetup(context.ppsRecord, {label: context.fieldName}).label
            || context.fieldName;
    }]
  , ['items', (context) => {
        return new Map(context.BaseModelType.enumItems.map(value => [value, value]));
    }]
  , // ...
]);
```

This makes the resolution extensible without modifying `_getArgumentConfig`.

### Tier 3: Long-Term (Aspirational)

**5. Model-driven UI generation from metamodel introspection**

The ultimate direction: the metamodel's type system carries enough information
to generate appropriate editors for *any* model structure. The `uiElementsMap`
becomes a curated set of overrides, not the primary mapping.

This aligns with TypeRoof's metamodel philosophy — the model is the source of
truth, UI is derived from it.

---

## Summary: Strength/Weakness Comparison

| Approach | Solves gate problem | Solves scattered setup | Effort | Risk |
|----------|:------------------:|:---------------------:|:------:|:----:|
| `REGISTERED_GENERIC_KEYMOMENT_FIELDS` → deny-list | ★★★★★ | — | Low | Low |
| Unified actor registration | — | ★★★★★ | Medium | Low |
| `static REQUIREMENTS` on widgets | ★★ | ★★★ | Medium | Medium |
| Pluggable resolver protocol | — | ★★★★ | High | Medium |
| Full model-driven UI | ★★★★★ | ★★★★★ | Very High | High |

**Start with Tier 1. It solves the problems we actually hit.**

---

## Final Thought

The `static REQUIREMENTS` proposal is architecturally sound but it's solving
a problem that's secondary to the real friction. The real insight from our
implementation experience is:

> **The type system already knows enough. The infrastructure just needs to
> trust it and get out of the way.**

Removing the allow-list gate and unifying actor registration would have
prevented every friction point we encountered — without any new abstraction.

---

*Generated: 2026-02-25, based on implementing VideoproofContextualActor*
*and analyzing the full widget creation pipeline*
*Filed under docs/planning/ 2026-07-16 as part 2 of the widget-setup series;*
*`stage-and-actors.mjs` → `motion-stage.mjs` reference updated.*
