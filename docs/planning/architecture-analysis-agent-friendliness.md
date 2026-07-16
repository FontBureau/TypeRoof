---
eleventyNavigation:
  key: "Architecture Analysis: Agent-Friendliness"
  parent: Planning
agent-created: true
---

# Architecture Analysis: What Makes TypeRoof Agent-Friendly

## Context

> **Status:** Historical retrospective. Written 2026-02-25 during the
> (now merged) implementation of the `VideoproofContextualActor`, and
> lightly updated afterwards to keep file/line references current.
> The friction points and recommendations below are still open at the
> time of filing under `docs/planning/`.

This analysis was written during the implementation of the `VideoproofContextualActor`
for the TypeRoof shell. An AI agent (goose) successfully created the actor model,
renderer, and registration — with iterative fixes — touching only 3 files and adding
~370 lines of new code. This document examines *why* the architecture made that feasible
and where friction remains.

## Executive Summary

TypeRoof's architecture is built on a small number of powerful, composable patterns.
These patterns are **highly regular** — once an agent understands one actor, it can
create another by following the same structural template. The metamodel system provides
**type-driven automation** that eliminates boilerplate UI code. Together, these properties
make the codebase unusually navigable for an AI agent.

The main friction points are: implicit registration contracts spread across multiple
files, CSS class conventions that are undocumented, and business logic that must be
manually ported from legacy functional code into the actor pattern.

---

## Part 1: What Worked Well

### 1.1 The Actor Pattern is Highly Regular

Every actor in TypeRoof follows the same structural template:

```
Model  = _BaseActorModel.createClass(name, ...mixins, ['field', FieldType], ...)
Renderer extends _BaseComponent { constructor, initTemplate, update }
```

This regularity means:
- **One example is sufficient.** Reading `videoproof-array.mjs` gave the agent
  a complete blueprint for creating `videoproof-contextual.mjs`.
- **The pattern is copy-and-adapt**, not invent-from-scratch. The agent could
  focus on the *differences* (pad modes, word formatting) rather than the *framework*.
- **Errors are structural, not semantic.** When something was wrong (e.g., missing
  UI for padMode), the fix was adding a field name to a set — not redesigning logic.

**Strength score: ★★★★★**
This is the single strongest architectural feature for agent-friendliness.

### 1.2 The Metamodel's `createClass` Pattern

The metamodel uses a declarative, data-driven approach to model definition:

```javascript
const MyModel = _AbstractStructModel.createClass(
    'MyModel'
  , ['fieldName', FieldTypeModel]
  , ['otherField', OtherTypeModel]
);
```

Why this helps agents:
- **No class boilerplate.** No constructor, no getter/setter methods, no manual
  serialization. The metamodel generates all of that.
- **Self-documenting.** The field list IS the schema. An agent reading a `createClass`
  call immediately knows every field, its type, and its name.
- **Composable via mixins.** `...genericActorMixin`, `...typographyActorMixin` etc.
  are spread into the field list. The agent can reuse them without understanding
  their internals.
- **Type-safe by construction.** Field types are model classes, not strings or
  primitives. `PadModeOrEmptyModel` is unambiguous — it's an enum-or-empty.

**Strength score: ★★★★★**

### 1.3 Type-Driven UI Generation

The `genericTypeToUIElement` function in `type-driven-ui.mjs` maps model types
to UI widgets automatically:

| Model Type | UI Widget |
|------------|-----------|
| `_AbstractEnumModel` | `UISelectInput` (dropdown) |
| `_AbstractNumberModel` | `UINumberInput` |
| `StringModel` | `UILineOfTextInput` |
| `BooleanModel` | `UICheckboxInput` |
| `ColorModel` | Color chooser |
| `*OrEmptyModel` | Above + empty/toggle variant |

This is enormously powerful for agent work because:
- **Adding a new field to the model automatically gets UI** — no manual widget
  creation needed.
- **The mapping is centralized** — one place to understand, not per-component.
- **New enum types (like `PadModeModel`) work without any UI code** — the
  abstract parent type match handles it.

The only requirement is that the field name appears in
`REGISTERED_GENERIC_KEYMOMENT_FIELDS` — which was the one fix needed.

**Strength score: ★★★★☆** (one star lost for the registration requirement — see friction)

### 1.4 Centralized Actor Registration

All actor types are registered in one file (`available-actors.mjs`) with a
predictable structure:

1. Import the model and renderer
2. Add to `initAvailableActorTypes` array
3. Add to `getActorWidgetSetup` switch
4. Add to `getActorTreeNodeType` (leaf or container)
5. Add to `isTypographicActorTypeKey` set
6. Add to `getActorTypeKeySpecificWidgets` list

While this is 6 touch points (see friction), each one is **trivially predictable**
from the existing entries. The agent copied the VideoproofArrayV2 pattern and
changed the names.

**Strength score: ★★★★☆**

### 1.5 Separation of Concerns: Model / Renderer / Layout

The clean separation means:
- **Model changes don't require renderer changes** (and vice versa)
- **Business logic is testable in isolation** (the `_getWords` function is pure)
- **Layout/UI is a separate layer** that consumes actors generically

This allowed the agent to work in phases: model first, then renderer, then
registration — each phase independently verifiable.

**Strength score: ★★★★★**

### 1.6 Dedicated Line-Break Functions per Layout Type

`affixed-line-breaks.mjs` exports both `fixGridLineBreaks` and
`fixContextualLineBreaks` — clearly named, clearly separated. Switching
from grid to contextual rendering was a single import change.

**Strength score: ★★★★☆**

---

## Part 2: Where Friction Occurred

### 2.1 The `REGISTERED_GENERIC_KEYMOMENT_FIELDS` Gate

**Problem:** Adding `padMode` and `customPad` fields to the model was not
enough to get UI. The field names also had to be added to a hardcoded
`FreezableSet` in `motion-stage.mjs` (line 421; formerly
`stage-and-actors.mjs`, renamed since this analysis was written).

**Why this caused friction:**
- The set is in a *different file* from both the model definition and the
  type-driven UI mapping.
- There's no error or warning when a field is missing from the set — the
  UI simply doesn't appear.
- The agent had to trace the `_defineGenericWidgets` → `isAllowedFieldName`
  → `REGISTERED_GENERIC_KEYMOMENT_FIELDS` chain to find the gate.

**Impact:** This was the primary debugging issue in the implementation.
The model was correct, the type-driven UI mapping was correct, but the
field names weren't in the allowlist.

**Recommendation:**
- **Option A (ideal):** Make the registration automatic. If a field's type
  has a UI mapping in `genericTypeToUIElement`, it should appear in the
  key moment editor without explicit registration.
- **Option B (pragmatic):** Move the field set closer to the model definitions,
  or derive it from the model's field list. Each actor model could export its
  own set of generic keymoment fields.
- **Option C (minimal):** Add a comment in the `createClass` pattern documentation
  stating: "New fields also need registration in
  `REGISTERED_GENERIC_KEYMOMENT_FIELDS`."

### 2.2 Six Registration Points in available-actors.mjs

**Problem:** Adding a new actor type requires changes in 6 separate locations
within `available-actors.mjs`. Missing any one causes silent failures or
incomplete behavior.

**Why this caused friction:**
- Each registration point follows a slightly different pattern (array entry,
  switch case, set membership, array membership).
- There's no validation that all 6 are consistent.
- The agent had to manually identify all 6 by reading the entire file.

**Recommendation:**
- **Option A (ideal):** Single registration object per actor type:
  ```javascript
  registerActorType({
      key: 'VideoproofContextual',
      label: 'Videoproof Contextual',
      Model: VideoproofContextualActorModel,
      Renderer: VideoproofContextualActorRenderer,
      treeNodeType: 'leaf',
      isTypographic: true,
      specificWidgets: ['FontSelect'],
      charGroupsData: charGroupsData,
  });
  ```
- **Option B (pragmatic):** A checklist comment at the top of the file listing
  all required registration points.

### 2.3 CSS Class Conventions Are Implicit

**Problem:** The contextual renderer needed `fixed-lines` in addition to
`fixed-line-breaks` for proper inline text flow. This was discovered only
by reading CSS comments ("used in contextual/kerning mode").

**Why this caused friction:**
- CSS class names are strings — no type checking, no import, no documentation.
- The relationship between `.fixed-line-breaks` and `.fixed-lines` is not
  obvious from the names alone.
- The agent initially used only `fixed-line-breaks` (copying from the array
  actor), which produced incorrect rendering.

**Recommendation:**
- **Option A:** Document CSS class contracts in the renderer's JSDoc or in
  a CSS architecture document.
- **Option B:** Use CSS custom properties or data attributes that are more
  self-documenting: `data-layout="contextual"` or `data-line-break-mode="contextual"`.
- **Option C:** Have the `fixContextualLineBreaks` function add/remove the
  required CSS classes itself, rather than requiring them in the template.

### 2.4 Legacy Business Logic Requires Manual Porting

**Problem:** The legacy `videoproof-contextual.mjs` uses a functional style
with closures and passed-in callbacks (`getCharsForKey`, `fixLineBreaks`,
`showExtended`, `extendedCharGroups`). The shell version uses a different
API (`getCharsForSelectUI`, `getExtendedChars`, model-driven properties).

**Why this caused friction:**
- Function signatures changed between legacy and shell (`getCharsForKey` →
  `getCharsForSelectUI`).
- Extended character groups are accessed differently (object parameter → 
  `getExtendedChars` function).
- The agent had to understand both APIs and translate between them.

**Recommendation:**
- **Option A (long-term):** When creating a V2 of a layout, leave a migration
  guide comment in the legacy file explaining the API mapping.
- **Option B:** Create adapter functions that bridge legacy and shell APIs,
  making porting mechanical rather than interpretive.

---

## Part 3: Architectural Properties That Enable AI Agents

### 3.1 Pattern Regularity (Most Important)

The single most important property is **pattern regularity** — when every
actor follows the same structural template, an agent needs to understand
the pattern once and can then apply it N times. TypeRoof excels here.

**How to strengthen:**
- Keep the actor pattern consistent as new actor types are added.
- Document the pattern explicitly (a "how to create a new actor" guide).
- Consider code generation or templates for the boilerplate parts.

### 3.2 Declarative Over Imperative

`createClass` declarations, type-to-UI mappings, and mixin composition are
all declarative. Declarative code is easier for agents because:
- The intent is visible in the structure, not hidden in control flow.
- There are fewer ways to get it wrong.
- Changes are additive (add a field) rather than surgical (modify a method).

**How to strengthen:**
- Continue favoring declarative patterns for new features.
- Move remaining imperative registration (the 6 points in available-actors)
  toward declarative registration.

### 3.3 Discoverability via Naming Conventions

Consistent naming helps agents navigate:
- `*Model` = data model class
- `*Renderer` / `*ActorRenderer` = rendering component
- `*Mixin` = composable field set
- `*OrEmptyModel` = optional/nullable variant
- `fix*LineBreaks` = line-break algorithm

**How to strengthen:**
- Maintain these conventions strictly.
- Add similar conventions for CSS classes (e.g., `actor_renderer-{type}`
  is already good).

### 3.4 Idempotent Pure Functions

The business logic functions (`_getWords`, `_formatAuto`, `_kernPaddingGen`)
are pure — no side effects, no global state. This matches the project's
coding style guidelines and makes them:
- Easy to understand in isolation
- Safe to copy and modify
- Independently testable

**How to strengthen:**
- Keep business logic as pure functions, separate from renderer classes.
- Consider moving shared business logic to utility modules.

### 3.5 Single Source of Truth for Types

The metamodel ensures each type is defined once:
- `PadModeModel` is defined once with its enum values.
- `CharGroupModel` is defined once and imported by both array and contextual actors.
- Type-to-UI mapping is defined once in `type-driven-ui.mjs`.

This prevents inconsistencies that would confuse an agent.

---

## Part 4: Summary Scorecard

| Architectural Property | Agent-Friendliness | Notes |
|----------------------|-------------------|-------|
| Actor pattern regularity | ★★★★★ | One example = complete blueprint |
| Declarative `createClass` | ★★★★★ | Self-documenting schema |
| Type-driven UI generation | ★★★★☆ | Powerful but gated by field registration |
| Model/Renderer separation | ★★★★★ | Clean phases of work |
| Centralized registration | ★★★★☆ | Predictable but 6 touch points |
| Pure business logic | ★★★★★ | Easy to port and adapt |
| CSS conventions | ★★★☆☆ | Implicit, discovered by reading CSS |
| Legacy → Shell migration | ★★★☆☆ | API differences require interpretation |
| Error feedback | ★★☆☆☆ | Silent failures when registration incomplete |
| Documentation | ★★★☆☆ | Code is readable but guides are sparse |

## Part 5: Top 3 Recommendations

### 1. Unify Actor Registration (High Impact, Medium Effort)
Replace the 6 scattered registration points with a single declarative
registration call per actor type. This eliminates the most common class
of agent (and human) errors.

### 2. Auto-derive Generic Keymoment Fields (High Impact, Low Effort)
Instead of maintaining `REGISTERED_GENERIC_KEYMOMENT_FIELDS` manually,
derive it from the keymoment model's field list, filtering by fields that
have a `genericTypeToUIElement` mapping. This eliminates the "invisible gate"
problem entirely.

### 3. Document CSS Class Contracts (Medium Impact, Low Effort)
Add a brief comment block in each renderer's TEMPLATE explaining which CSS
classes are required and what they do. Alternatively, create a CSS architecture
document mapping class combinations to visual behaviors.

---

*Generated: 2026-02-25, during implementation of VideoproofContextualActor*
*Original branch: feature/videoproof-contextual (since merged)*
*Files touched: 3 (1 new, 2 modified)*
*Lines added: ~370 new + ~36 modified*
*Filed under docs/planning/ 2026-07-16; `stage-and-actors.mjs` → `motion-stage.mjs` references updated.*
