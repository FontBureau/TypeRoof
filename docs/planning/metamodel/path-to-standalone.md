---
title: Metamodel — Path to a Standalone Library
eleventyNavigation:
  parent: Planning
  key: path-to-standalone
  title: Metamodel - Path to a Standalone Library
  order: 1
---

** This file was created with an agent. **

# {{title}}

## Could we recommend metamodel to others?

**Not yet, but it has the potential to be recommendable.**

## What makes it genuinely good

The metamodel solves a **hard problem well** — reactive immutable state with
referential integrity, topological dependency resolution, copy-on-write proxies,
and deep structural comparison. This is closer to a relational database engine
than a typical frontend state manager. The design is cohesive, the architecture
is clean, and it now has fully enforced type contracts (443 → 0 TypeScript
errors under `strict: true`).

Most state management libraries (Redux, MobX, Zustand, Jotai) don't offer:

- **Foreign keys** with null constraints and referential integrity
- **Coherence functions** — cascading triggers that enforce invariants
- **Topological initialization ordering** — deterministic dependency resolution
- **Structural diff** with path-based change tracking
- **Copy-on-write proxies** with lazy draft escalation

For applications that **need** these features — and TypeRoof clearly does —
metamodel is a serious piece of engineering.

## Is it overengineered?

### What kind of apps need this?

Apps where **the data model has internal consistency rules that must hold at all
times**, and where **changes cascade** — modifying one thing implies adjusting
other things.

- **Typography/design tools** — Change a font axis value → available glyphs
  change → text reflow recalculates → proof layout updates. These aren't
  independent actions; they're a cascade of dependent state transitions.
- **CAD/vector editors** — Move a wall → connected walls adjust → room area
  recalculates → materials estimate updates. Referential integrity between
  objects is essential.
- **Spreadsheet engines** — Change cell A1 → formulas referencing A1
  recalculate → formulas referencing *those* cells recalculate. Topological
  dependency ordering is literally the core algorithm.
- **Form builders with validation** — Field A's value constrains Field B's
  options → Field B's value constrains Field C's visibility. Coherence
  functions, essentially.
- **Game editors / level designers** — Entity references other entities (a door
  references a key, a trigger references an event). Foreign keys with
  null-safety.

The common thread: **the state is not a bag of independent values — it's a
graph with constraints.**

### Why does TypeRoof need it?

TypeRoof is a typographic proofing and animation tool. Its state model manages:

- **Font data** — loaded fonts, available axes, available glyphs, font metadata
- **Type specifications** — axis locations, font size, line height, letter
  spacing — all interdependent
- **Layout state** — which layout is active, what actors are on stage, how
  they're configured
- **Animation state** — keyframes, playback position, interpolation between
  states
- **UI state** — active panels, selections, editing modes

These aren't flat values. A font change invalidates axis locations. An axis
change invalidates glyph availability. A layout change invalidates actor
configurations. This is exactly the cascading dependency problem that
metamodel's coherence functions and topological ordering solve.

Without metamodel, this logic would be ad-hoc event handlers — "when font
changes, also update axes; when axes change, also update glyphs; when..." —
hoping the order is right and no case is missed. Metamodel makes the dependency
graph **declarative and automatically resolved**.

### For TypeRoof: not overengineered

The complexity of the state management matches the complexity of the domain.
Typography has deep, real interdependencies between its concepts. A simpler
state manager would push that complexity into the application code — into
scattered event handlers, manual dependency tracking, and "remember to also
update X when Y changes" comments.

### Implementation areas that could be simplified

The *design* is not overengineered for the problem, but some *implementation
choices* could be simplified without losing the core value proposition:

1. **The proxy escalation system** — 463 lines of `_PotentialWriteProxy` with
   symbol-keyed trap handlers is a lot of machinery. Copy-on-write is valuable
   for undo/redo and comparison, but a simpler approach (explicit
   `.beginDraft()` / `.commitDraft()` without transparent proxies) would
   sacrifice ergonomics but dramatically reduce complexity.

2. **Runtime immutability enforcement** — `Object.defineProperty` with
   `configurable: false` plus `Object.freeze` was **essential in pure
   JavaScript** — it was the only way to enforce immutability. With TypeScript's
   `readonly` and `strict` mode, the compiler now catches mutations at
   write-time, making the runtime layer a second safety net rather than the
   primary one. **However**, as long as consumers are untyped `.mjs` files, the
   runtime enforcement still has value. Once consumers migrate to TypeScript,
   the runtime layer becomes truly redundant and could be stripped or made
   opt-in (e.g., a development-only `FREEZE=true` flag).

3. **Baked-in serialization** — Full serialization/deserialization with async
   resource resolution is a complete persistence layer inside the state model.
   Not every app needs its state manager to also be its serialization framework.
   For TypeRoof (saving/loading type proofs) it makes sense, but a standalone
   library might offer this as an optional layer.

The path to standalone should include asking **"what's essential vs. what's
accidental complexity?"** for each subsystem.

## What's missing for recommendation

### 1. No documentation

There's no README, no API guide, no usage examples. A developer encountering
`createClass`, `metamorphoseGen`, or `_PotentialWriteProxy.create` has to read
the source to understand the contract. The types help enormously now, but
they're not a substitute for "here's how to define a model, here's how state
flows."

### 2. No tests

You can't recommend a library you can't verify. Without tests, every consumer
is doing faith-based engineering. The typing pass found 3 dormant bugs in ~8200
lines — there could be more in code paths not yet exercised.

### 3. No standalone packaging

It lives inside TypeRoof. To recommend it, it would need to be extractable —
its own package, its own repo or workspace, its own entry point. The barrel
(`metamodel.ts`) is a good start.

### 4. The `Object.defineProperty` / `as unknown as` ceremony

72 escape hatches and 48 `declare` properties signal that the runtime patterns
fight against TypeScript's model. A library for external use should feel natural
to type, not require workarounds. Some of this could be simplified — e.g.,
`readonly` class fields instead of `Object.defineProperty` for immutable
properties.

### 5. No migration path from simpler tools

Someone using Zustand or Redux has no on-ramp. A "metamodel in 5 minutes" guide
showing the equivalent of `createStore` → `createClass`, `dispatch` →
`metamorphose`, `selector` → `getEntry` would make it approachable.

## Naming: from metamodel to Typecaster

"Metamodel" is an accurate internal name but a poor standalone identity:

- **Overloaded** — "metamodel" already means something specific (UML, EMF).
  Developers expect ORM/schema tools, not reactive state.
- **Abstract** — Doesn't communicate what it does. "A model of models" is
  academic; "reactive immutable state with relational integrity" is practical.
- **Not searchable** — Too generic, competes with existing terminology.

The working name direction: **Typecaster**.

Following the typography production metaphor:

| Print shop role | Library | What it does |
|-----------------|---------|-------------|
| **Typecaster** | State management | Casts complete, immutable, typed state from class definitions |
| **Compositor** | Scope resolution | Assembles properties into resolved, hierarchical scopes |

Why Typecaster works:

- **Typography**: A typecaster casts metal type from matrices — exactly what
  `createClass` (the matrix) + `metamorphose` (the casting) does. The result
  is a solid, immutable slug of type.
- **Programming**: A typecaster casts typed state — and this is literally a
  type system for state.
- **Strong Type Systems**: The company makes strong types. The Typecaster casts
  them.
- **Linotype parallel**: The Linotype machine was a "line caster" — it cast
  an entire line at once as a single immutable slug. The metamodel does the
  same for state: compose the draft, cast the whole thing, can't modify the
  slug, want a change? Recast. The old slug (`OLD_STATE`) still exists for
  comparison.
- **Distinctive**: "Typecaster JS" returns nothing relevant today. Googleable,
  memorable, no collisions.
- **Paired with Compositor**: Both are roles — people in the print shop with
  agency and craft. The Typecaster's output feeds the Compositor's input.

Package: `@strongtypesystems/typecaster`

### API rename: `metamorphose` → `cast`

The core operation — transforming a mutable draft into a frozen immutable
snapshot — is called `metamorphose` internally. For the standalone library,
`cast` is the better API name:

```typescript
// Internal (current)
const newState = draft.metamorphose(dependencies);

// Standalone (proposed)
const newState = draft.cast(dependencies);
```

Why `cast`:
- **Typography**: Cast type from a matrix — pour in draft, out comes solid slug
- **Programming**: Type casting — and this IS a type-casting operation
- **Film/theater**: Typecasting — the actor becomes strongly identified with
  the role, just as `createClass` typecasts a generic model into a specific
  character (`FontSize`, `AxisLocation`, `TypeSpec`)
- **Brand-aligned**: Reinforces the Typecaster name
- **Short**: 4 characters vs 12. `draft.cast()` reads naturally

The full rename scope: `metamorphose`, `metamorphoseGen`,
`#_metamorphoseGen` → `cast`, `castGen`, `#_castGen`.

**Timing**: Do this when extracting the standalone package, not during the
current typing pass. It's a branding decision, not a technical one.

Other potential API renames for the standalone:

| Internal | Standalone | Rationale |
|----------|-----------|-----------|
| `createClass` | `define` | You *define* a type, the typecaster *casts* it |
| `metamorphose` | `cast` | The casting operation |
| `metamorphoseGen` | `castGen` | Generator version |
| `OLD_STATE` | `previous` | Clearer for external users |
| `_PotentialWriteProxy` | `DraftProxy` | Says what it is |

## The steps to get there

### Step 1 — Tests (proves it works)

Start with pure, side-effect-free functions:

| Target | Why |
|--------|-----|
| `topologicalSortKahn` | Deterministic algorithm, clear inputs/outputs |
| `collectDependencies` | Pure data transformation |
| `rawCompare` / `compare` | Core diffing logic, many edge cases |
| `serialize` / `deserializeGen` | Round-trip property: `deserialize(serialize(x)) ≡ x` |

Then graduate to lifecycle integration tests:
`createClass → construct → metamorphose → mutate draft → metamorphose → compare`

### Step 2 — Documentation (explains how to use it)

- **README.md** — What it is, when to use it, quickstart
- **API reference** — Generated from the now-typed signatures
- **Concepts guide** — Immutability model, draft lifecycle, dependency protocol,
  foreign keys, coherence functions
- **Cookbook** — Common patterns: "define a struct", "add a foreign key",
  "react to changes via StateComparison"

### Step 3 — Extract to its own package (makes it usable)

- Separate `package.json` with its own `name`, `version`, `exports`
- Zero external dependencies (it already has none)
- `metamodel.ts` barrel as the public entry point
- Strip TypeRoof-specific test fixtures or examples into a separate package

### Step 4 — Simplify the `Object.defineProperty` patterns (makes it idiomatic)

Audit all 48 `declare` + `Object.defineProperty` sites. For each, determine:

- **Is freezing required?** → Keep `Object.defineProperty` with
  `configurable: false`
- **Is it just "set once, never reassign"?** → Replace with `readonly` class
  field. TypeScript enforces this at the type level, and the runtime behavior is
  nearly identical.
- **Is it a symbol-keyed internal slot?** → Consider a `WeakMap`-based
  approach, which is more TypeScript-friendly and avoids polluting the instance
  shape.

This would reduce the `as unknown as` count significantly and make the code
feel like idiomatic TypeScript rather than typed JavaScript.

### Step 5 — A small example app (proves it's learnable)

A minimal standalone app — perhaps a todo list with categories (struct →
list → enum) and referential integrity (foreign keys between categories and
items). Small enough to read in 10 minutes, complete enough to demonstrate the
lifecycle.

## Target audience

Metamodel is **not** a general-purpose state manager. It's for applications
that need:

- **Structured, relational state** — not a flat key-value store
- **Referential integrity** — foreign keys, not just string IDs
- **Cascading validation** — coherence functions, not ad-hoc middleware
- **Structural diffing** — "what changed and where", not "something changed"
- **Immutability with ergonomic mutation** — CoW proxies, not spread operators

This is a real niche that no mainstream library fills well. Typography tools,
design systems, CAD applications, form builders with complex validation —
these are the kinds of apps that would benefit.

## Alignment with purpose

From the Strong Type Systems purpose statement:

> *We create Free Libré Open Source Software (FLOSS) type tools for production,
> proofing, type-setting and animation.*

A standalone metamodel library would be a reusable foundation for any future
type tool — not just TypeRoof. Investing in its independence is investing in the
ecosystem.
