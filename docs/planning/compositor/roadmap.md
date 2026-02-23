---
title:  Compositor - Concepts and Roadmap
eleventyNavigation:
  parent: Planning
  key: compositor-roadmap
  title: Compositor - Concepts and Roadmap
  order: 10
---

** This file was created with an agent. **

# {{title}}

## Context

The **compositor** is a planned library that sits between the metamodel (state
management) and the UI consumers (rendering). Its job is:

1. **Inheritance resolution** — Nested actors inherit property values from
   parents unless overridden, like CSS cascading but for arbitrary model
   properties.
2. **Scope computation** — For each consumer, compute the final resolved value
   by walking the inheritance chain.
3. **Live interpolation** — Between two keyMoments, interpolate property values
   based on playback position:
   `fontSize = lerp(keyA.fontSize, keyB.fontSize, t)`.
4. **Incremental updates** — When a model value changes, recompute only the
   affected parts of the inheritance tree.

The data flow:

```
metamodel (state changes)
    → compositor (inheritance + interpolation)
        → consumers (render glyphs, layout text, draw UI)
```

Every metamodel state change feeds into the compositor. During animation, the
compositor runs every frame.

## Four architectures

### A) All in TypeScript/JavaScript

```
JS metamodel → JS compositor → JS render
```

**Advantages:**
- Zero boundary crossings. State flows as native JS objects.
- One language, one toolchain, one debugging story.
- The metamodel's `StateComparison` feeds directly into the compositor — no
  serialization, no schema translation.
- Coherence functions, foreign key constraints, and compositor logic share the
  same runtime. A coherence function could directly trigger a compositor
  invalidation.
- Lowest barrier to contribution — aligned with the FLOSS purpose and the
  largest open source ecosystem.
- The metamodel's new type infrastructure (`strict: true`, 0 errors, explicit
  contracts) provides a strong foundation for building the compositor with the
  same discipline.

**Disadvantages:**
- GC pauses during animation — but modern V8 is very good. **Needs
  measurement, not assumption.**
- No SIMD for batch interpolation — but only matters if hundreds of properties
  are interpolated per frame.
- CPU-bound interpolation blocks the main thread — but `requestAnimationFrame`
  + careful batching may be enough, or Web Workers if not.

### B) Compositor in WASM, metamodel in JS

```
JS metamodel ──[boundary]──→ WASM compositor ──[boundary]──→ JS render
```

**Advantages:**
- Incremental migration. Metamodel stays as-is.
- Rust performance for the hot path (interpolation, inheritance resolution).
- Compositor is algorithmically well-defined — no UI callbacks, no DOM
  interaction. Good fit for Rust.

**Disadvantages:**
- Boundary crossing on every state change. Must serialize/deserialize model
  state or define a shared format.
- Double bookkeeping — both sides need to understand the schema.
- Two languages, two build systems, two debugging stories.
- Contribution barrier — Rust is less accessible than TypeScript.

### C) Both metamodel and compositor in WASM

```
WASM metamodel + compositor ──[boundary]──→ JS render
```

**Advantages:**
- No intermediate boundary. State flows directly from metamodel to compositor
  in Rust memory.
- Only final derived values (resolved font size, interpolated axis position)
  cross to JS for rendering — minimal, flat data transfer.
- Rust's ownership model provides immutability for free — the entire
  `_PotentialWriteProxy` system exists because JavaScript has no ownership
  semantics. Rust doesn't need it.

**Disadvantages:**
- Largest investment. The entire metamodel must work in Rust.
- JS UI code must call into WASM for all state mutations.
- Coherence functions are currently JS closures — they'd need Rust equivalents.
- `createClass` dynamic class creation doesn't exist in Rust — becomes
  compile-time generics or proc macros.

### D) Hybrid — shared memory

```
JS metamodel ──[SharedArrayBuffer]──→ WASM compositor ──[results]──→ JS render
```

**Advantages:**
- No serialization — compositor reads metamodel state directly from shared
  memory.

**Disadvantages:**
- Requires careful binary memory layout agreement — essentially a binary IDL.
- Complex synchronization (atomics, locks).
- Only works for flat/numeric data, not nested structures.
- CORS/security restrictions on `SharedArrayBuffer`.

## Existing predecessors in the codebase

The compositor is not speculative — its core patterns already exist in
production, duplicated across two subsystems.

### TypeSpecnion (layout/rendering scope)

In `type-spec-ramp.typeroof.jsx`:

- **`SyntheticValue`** — A computed property: wraps a function + declared
  dependency names. `call(...resolvedDeps)` produces the value.
- **`LocalScopeTypeSpecnion`** — Resolves properties for one level: takes
  property generators + a typeSpec model, resolves `SyntheticValue`
  dependencies using **the same `topologicalSortKahn`** from the metamodel,
  merges with parent properties.
- **`HierarchicalScopeTypeSpecnion`** — Walks the parent chain (like CSS
  inheritance), filters inheriting properties via `_isInheritingPropertyFn`,
  merges local + parent scopes.

### Animanion (animation scope)

In `animation-animanion.mjs`:

- **`DependentValue`** — Same concept as `SyntheticValue` but for
  time-dependent values: wraps a property name + `momentT` + dependency depth.
  This is the precursor of `SyntheticValue`.
- **`LocalScopeAnimanion`** — Resolves properties at a given `momentT` by
  interpolating between keyMoments. Has its own dependency resolution via
  `_resolvePropertyDependencies`.
- **`HierarchicalScopeAnimanion`** — Walks the parent chain, transforms
  `globalT` through each level's local `t` mapping, inherits properties.

### The shared pattern

Both follow exactly the same architecture:

```
Local scope:    raw properties → resolve dependencies → resolved properties
                (generators)     (topological sort)     (Map<name, value>)

Hierarchical:   walk parent chain → filter inheriting → merge local + parent
                (linked list)      (predicate fn)       (Map<name, value>)
```

The difference is the value domain:
- TypeSpecnion: values are static (from the model state)
- Animanion: values are time-dependent (interpolated between keyMoments)

### ProcessedPropertiesSystemRecord — the mapping layer

In `registered-properties-definitions.mjs`:

`ProcessedPropertiesSystemRecord` maps between three worlds:

1. **Model world** — `modelFieldName` (e.g., `"wght"`)
2. **Property world** — `fullKey` (e.g., `"axisLocations/wght"`)
3. **Registry world** — `registryKey` + `prefix` (for UI components)

The code comments acknowledge this is fragile:

> *"This is mostly to identify the registry BUT double use is to read e.g.
> complex values from a propertiesMap. There's a good chance that the double
> use will collide at some point and has to be refined."*

> *"Create a ppsRecord on the fly. Hopefully temporary until everything is
> figured out!!!"*

The `childrenPropertiesBroomWagonGen` flattens nested model structures into
flat `prefix + path` strings — essentially manually reconstructing what the
metamodel's `getAllPathsAndValues` already does.

## Compositor design

### Core insight: one primitive

`DependentValue` (Animanion) and `SyntheticValue` (TypeSpecnion) are the same
concept at different levels of maturity: **a function with declared
dependencies, resolved via topological sort**.

In the compositor, there is just one primitive: a computed property with
declared dependencies. Whether those dependencies are:

- Another property in the same scope
- A time value `t`
- KeyMoment data for interpolation
- A parent scope value being transformed during inheritance

...doesn't matter to the resolution engine. It's all one dependency graph:

```
t ──────────────────────┐
keyMoments ─────────────┤
                        ▼
            interpolate(fontSize, t, keyMoments) → fontSize: 38.4
                                                        │
                                                        ▼
                                        computeLineHeight(fontSize) → lineHeight: 46.1
                                                                          │
parentColor ──→ darken(parentColor) → color                               ▼
                                                          computeLeading(fontSize, lineHeight) → leading: 7.7
```

One graph. One topological sort. One resolution pass. The distinction between
"animated property" and "synthetic property" and "inherited-and-transformed
property" disappears — they're all nodes in the dependency graph with different
input sources.

### Eigen properties vs slots

An actor on stage has two kinds of properties:

**Eigen-properties** — fixed, intrinsic to the actor definition. These are what
make *this actor* what it is: the specific font, the specific axis range, the
specific text content. These must **not** inherit from the parent stage. They
travel with the actor.

**Slots** — open channels that accept values from the context: current time
`t`, position on stage, color theme. These **must** inherit — the actor needs
them from its environment but doesn't define them itself.

### Purpose and slot routing

A parent scope **tags** values with a purpose. A child scope **declares slots**
that pull from the best-matching purpose via a deterministic chain:

```
parent scope:
  fontSize: 24  → purpose: "body"
  fontSize: 18  → purpose: "caption"
  fontSize: 36  → purpose: "heading"

child scope (slot "main-text"):
  purposeChain: ["body", "default"]
  → binds to purpose "body" → fontSize: 24
```

Routing is deterministic and data-driven: walk the `purposeChain`, first match
wins. No scoring functions needed — the metamodel's struct polymorphism +
SyntheticValue computation already covers flexible cases.

### Slot propagation through actor structure

A library actor has internal structure — nested levels that need some slot
values routed deeper, possibly transformed:

```
Stage (provides: time, position, color)
  └─ Actor instance
       eigen: { font: "Roboto", axisRange: [100, 900] }
       slots: { t: ← purpose "playback-time" }
       └─ Glyph renderer
            slots: { t: ← propagated from parent }
       └─ Axis visualizer
            slots: { wght: ← transform(t → t * axisRange) }
                     propagated from parent as purpose "axis-wght"
```

The same property can change identity as it flows down:

```
Stage:          purpose "playback-time" → t = 0.75
Actor slot:     "t" ← "playback-time" → 0.75
                transform: (t) => t * axisRange → 675
                propagate as purpose "axis-wght"
  Glyph slot:   "wght" ← "axis-wght" → 675
```

### Configurable inheritance per property

Beyond the current boolean `_isInheritingPropertyFn`, each property definition
controls its own inheritance behavior:

```typescript
interface PropertyDefinition<T = unknown> {
    name: string;
    kind: "eigen" | "slot";
    purposeChain?: string[];            // for slots: what to bind from parent
    transform?: SyntheticValue<T>;      // computation at inheritance boundary
    propagate?: boolean | string;       // re-export to children, possibly renamed
    defaultValue?: T;                   // single source of truth for defaults
}
```

### Typed scope properties

The current `Map<string, unknown>` provides no type safety. A typo in a
property name silently produces `undefined`. A wrong-typed value silently
propagates.

The compositor should have typed property definitions:

```typescript
defineProperty<number>("fontSize", { kind: "slot", purposeChain: ["body-size"] });
defineProperty<ColorValue>("color", { kind: "slot", purposeChain: ["foreground-color"] });
defineProperty<AxisLocationsValue>("axisLocations", { kind: "eigen" });
```

### Complex properties as sub-scopes

Properties like axis locations (variable number of axes) and colors (multiple
channels + type) should not be flattened into long path-like keys. Instead,
they become **lightweight typed containers**:

```typescript
scope.get<ColorValue>("color")           // → { r: 255, g: 128, b: 0, a: 1.0, type: "rgb" }
scope.get<AxisLocationsValue>("axisLocations")  // → { wght: 400, wdth: 100 }
```

**Option C — Lightweight typed containers:**

```typescript
interface SubScope<T> {
    readonly value: Readonly<T>;
    override(partial: Partial<T>): SubScope<T>;  // partial override for inheritance
    equals(other: SubScope<T>): boolean;          // cheap comparison
}
```

Sub-scopes are immutable typed wrappers with partial override support (for
inheritance) and equality checks (for change detection). They don't carry the
full metamodel machinery — the metamodel manages *source* data, the compositor
manages *derived/resolved* data.

Sub-scopes inherit **as a unit** by default. If a child overrides one channel,
the intent is usually "I'm defining my own color" — not "I want parent's green
and blue but my own red." Explicit partial override is opt-in:

```
parent: color = { r: 255, g: 128, b: 0, a: 1.0, type: "rgb" }

child (no override):      color = inherited whole
child (full override):    color = { r: 0, g: 0, b: 0, a: 1.0, type: "rgb" }
child (partial override): color = { ...inherited, r: 0 }  ← explicit
```

The flat key model inherits channels independently because it has no concept of
grouping. Sub-scopes fix that — the group IS the inheritance unit.

### Unified defaults

Three layers, tried in order:

1. **Local override** — the scope defines the value explicitly
2. **Inherited** — flows from parent scope via purpose/slot routing
3. **Schema default** — from `PropertyDefinition.defaultValue`

This replaces the scattered default sources (`_typeSpecDefaultsMap`, model
`defaultValue`, `parentPropertyValuesMap` fallback) with a single, predictable
resolution order.

### Declarative model-to-property mapping

Replaces `ProcessedPropertiesSystemMap.fromPrefix()` and the broom wagon
generators:

```typescript
const typeSpecMapping = {
    "fontSize": { property: "fontSize", type: "number" },
    "lineHeight": { property: "lineHeight", type: "number" },
    "axisLocations/*": { property: "axisLocations/${key}", type: "number" },
    "color": { property: "color", type: ColorValue },
};
```

Each property has **one canonical name** and explicit metadata. The triple
mapping problem (model key / full key / registry key) is eliminated.

### Compositor configuration lives in the metamodel

The compositor configuration (property definitions, slot/eigen classification,
purpose chains, transforms) is **schema** — it belongs in the metamodel.

The key insight: `CompositorConfig` is just another `_AbstractStructModel`.
The metamodel already has the machinery to define structured, typed, validated,
serializable configuration — why invent a new container?

```javascript
const CompositorPropertyConfig = _AbstractStructModel.createClass(
    "CompositorPropertyConfig", {
        kind: EnumModel.createClass("PropertyKind", ["eigen", "slot"]),
        purposeChain: _AbstractListModel.createClass("PurposeChain", { Model: StringModel }),
        inheritAsUnit: BooleanModel,
        propagate: BooleanModel,
    }
);

const CompositorConfig = _AbstractStructModel.createClass(
    "CompositorConfig", {
        fontSize: CompositorPropertyConfig,
        color: CompositorPropertyConfig,
        axisLocations: CompositorPropertyConfig,
    }
);
```

This follows the same pattern as `CoherenceFunction`, `ForeignKey`,
`InternalizedDependency`, and `FallBackValue` — all passed as definitions to
`createClass` and discriminated by `instanceof`. The compositor config becomes
a frozen static property on the class, like `fields` and `foreignKeys`.

**Why this is right:**

- **The metamodel eats its own dog food** — the compositor's schema is defined
  in the same system it will consume.
- **Full lifecycle** — serialization, comparison, validation all come for free.
  The compositor config persists when models are saved/loaded.
- **Foreign keys** — a `purposeChain` entry could be a foreign key to a
  purpose registry, enforcing referential integrity.
- **Coherence functions** — constraints between compositor properties are
  expressible (e.g., "if kind is eigen, purposeChain must be empty").
- **No drift** — config lives with the model definition, not in a separate
  file. One source of truth.
- **Optional** — models without compositor config use defaults.

### Animation as dependency graph nodes

The Animanion's keyMoment interpolation becomes regular nodes in the dependency
graph. An animated property is a computed property whose dependencies include
`t` and keyMoment data:

```
// "fontSize at t" is a computed property
dependencies: ["t", "keyMoments"]
compute: (t, keyMoments) => interpolate(keyMoments, t, "fontSize")
```

A property that depends on another animated property's value at the same `t`
(the `DependentValue` pattern) is just a dependency edge in the same graph. The
topological sort ensures correct resolution order within a time slice.

This unification means the compositor doesn't need separate "static resolution"
and "animation resolution" stages — one graph, one sort, one pass.

## Recommendation: start with TypeScript, measure, then decide

### Why TypeScript first

The case for Rust/WASM is strongest when:

1. You've **measured** that JS compositor performance is insufficient.
2. The bottleneck is **computation**, not DOM/layout/paint.
3. The computation is **parallelizable** or **SIMD-friendly**.

If the compositor's hot loop is "for each of 50 properties, lerp between two
floats" — that's 50 multiplications. JavaScript does that in microseconds. WASM
won't meaningfully improve it.

If the compositor's hot loop is "for each of 500 glyphs, resolve 20 inherited
properties through a 5-level scope chain, interpolate between 3 keyframes with
easing curves, and compute bezier path offsets" — now Rust's performance
advantage is real.

**Build the compositor in TypeScript first.** It integrates naturally with the
metamodel, you can iterate on the API quickly, and the typing infrastructure
provides safety. Then **profile under real workloads**.

### Escalation path if JS is too slow

1. **Web Workers** — Move the compositor off the main thread, communicate via
   `postMessage` with transferable objects. This alone may solve frame budget
   issues.

2. **Rust/WASM inner loop** — If still too slow, port the hot interpolation
   kernel to Rust/WASM. Not the whole compositor — just the batch computation
   that runs per frame. The TypeScript compositor becomes a thin orchestrator
   that delegates number-crunching to WASM.

3. **Full Rust/WASM compositor (Architecture B)** — Only if profiling shows
   the JS→WASM boundary itself is the bottleneck. At this point you have a
   working TypeScript compositor as a reference implementation, performance data,
   and a clear understanding of the API surface.

4. **Full WASM stack (Architecture C)** — Only if the boundary crossing between
   metamodel and compositor dominates. This is a major investment and should be
   justified by measurement, not speculation.

This is the difference between **architecture driven by measurement** and
**architecture driven by anticipation**.

## If Rust/WASM becomes the path: feasibility notes

### The metamorphose protocol in Rust

The generator-based `metamorphoseGen` protocol (yield `ResourceRequirement`,
receive resource, continue) translates to Rust in different ways depending on
context:

| Context | Approach | Feasibility |
|---------|----------|-------------|
| WASM in browser | JS host drives the generator via imports/exports | ✅ Seamless |
| Rust with all resources in memory | Plain function, no coroutine needed | ✅ Trivial |
| Rust async (disk/network I/O) | `async/await` — Rust's async is a state machine (generator under the hood) | ✅ Native |
| Rust embedded in foreign host | Manual state machine or nightly `#[coroutine]` | ✅ Verbose but works |

Note: runtime schema changes are not a feature that is used or desired —
schemas are always static, defined once at startup. This means Rust's
compile-time model (generics, proc macros) is a natural fit, not a limitation.
The `createClass` calls are essentially a **build step** that happens to run at
runtime because JavaScript doesn't have a better mechanism.

### Schema sharing via IDL

If both JS and Rust need to understand the same model schemas, an **Interface
Definition Language** eliminates drift:

```
// metamodel.idl (hypothetical)
struct TypeSpec {
    font: String @foreign_key(target: "fonts", constraint: SET_NULL)
    size: Number @range(min: 6, max: 144, default: 12)
    axes: OrderedMap<String, Number> @ordering(ALPHA)
}
```

From this, generate:
- JavaScript `createClass` calls (or metamodel consumes the IDL directly)
- Rust structs with serde derives
- TypeScript type definitions for consumers
- Documentation and validation schemas

Standard IDLs (protobuf, JSON Schema) lack metamodel-specific concepts (foreign
keys, coherence functions, topological ordering). A custom IDL would be small
(~500 lines for the parser) with generators for each target language.

**This only matters if Architecture B or C is pursued.** For Architecture A
(all TypeScript), the existing typed metamodel IS the schema definition.

### What Rust would NOT need

- **`_PotentialWriteProxy`** — Rust's ownership model gives you immutability
  for free. The entire 463-line proxy system exists because JavaScript has no
  ownership semantics.
- **`Object.freeze` / `Object.defineProperty`** — Rust's `&T` vs `&mut T`
  enforces this at compile time.
- **`FreezableMap` / `FreezableSet`** — Rust's `im` crate provides persistent
  data structures, or `Arc<HashMap>` with clone-on-write.

A Rust metamodel would be **simpler** than the JavaScript version because Rust's
type system handles concerns that JavaScript must enforce at runtime.

## Staged roadmap (if Rust is pursued)

### Stage A — Read/write metamodel state from Rust

- Extract schemas from JavaScript `createClass` metadata into a static format
- Generate Rust structs with serde derives
- Rust reads/writes the JSON that `serialize()` / `deserializeGen()` produce
- **Use case**: Batch processing, font analysis, server-side rendering
- **Effort**: Medium (2-4 weeks)
- **Risk**: Low — no changes to the JavaScript side

### Stage B — Compositor in Rust/WASM

- Build the compositor in Rust
- Define a flat input format (changed properties, keyframe data, playback time)
- JS metamodel extracts delta from `StateComparison`, sends to WASM compositor
- WASM returns resolved values for rendering
- **Use case**: Animation performance optimization
- **Effort**: Large (2-3 months)
- **Risk**: Medium — boundary crossing cost, two-language maintenance

### Stage C — Full WASM stack

- Port metamodel to Rust (proc macro for schema definition)
- Compositor and metamodel share Rust memory directly
- JS only receives final rendered values
- **Use case**: Maximum performance, minimal JS overhead
- **Effort**: Very large (6+ months)
- **Risk**: High — complete rewrite of the state layer

Each stage is independently valuable and informs whether the next stage is
justified.

## Overall assessment

### What exists in the landscape

| System | Hierarchical | Per-property control | Routing | Typed | Dependency graph | Interpolation | Sub-scopes | Immutable snapshots |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **CSS Cascade** | ✅ | ✅ | ❌ | partial | ❌ | ✅ | ❌ | ❌ |
| **Design Tokens / Style Dictionary** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **React Context / Vue Provide** | ✅ | ✅ | partial | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Houdini `@property`** | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Game engine property systems** | ✅ | partial | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Compositor (proposed)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

CSS comes closest conceptually — hierarchical inheritance, per-property control
(`inherit`, `initial`, `unset`), typed properties (`@property`), and
animation interpolation. But CSS lacks dependency-ordered computation
(`calc()` is expression-level, not graph-level), has no concept of named
routing (purpose → slot), and is locked to the DOM with CSS-specific value
types.

Design token systems (Figma, Style Dictionary) share the "properties cascading
through a hierarchy" concept but are much simpler — flat reference
substitution, no topological resolution, no animation, no computed properties.

Game engines (Unity DOTS, Unreal) have sophisticated property systems with
interpolation and dependency tracking, but they're entity/component
architectures, not scope-based inheritance trees.

**Nobody combines all eight capabilities.** The compositor is genuinely novel
in unifying hierarchical scope inheritance, per-property routing, typed
definitions, dependency-resolved computation, and time-based interpolation into
a single coherent system.

### Why this combination matters for typography

Typography is inherently **parametric and hierarchical**:

- A document has a type specification
- Sections inherit and override (heading vs body vs caption)
- Actors on a stage inherit context (time, position) but carry their own
  essence (font, axis range)
- Variable font axes are interdependent (weight affects optical size
  recommendations)
- Animation interpolates across all these simultaneously
- The same property can mean different things at different levels (font size
  in points at the document level becomes a scaling factor at the glyph level)

No existing system was designed for this domain. CSS approximates it but fights
against it — CSS inheritance is all-or-nothing per property, has no concept of
"this actor carries its own font but inherits time from the stage," and can't
express "interpolate between these two complete type specifications at t=0.6."

The compositor is a **domain-specific scope engine for parametric typography**
that happens to be built on general-purpose primitives (dependency graphs,
topological sort, immutable state).

### Novelty and risk

**What's genuinely new:**
- Purpose/slot routing for property inheritance (not in any system we found)
- Animation interpolation as regular dependency graph nodes (not separated into
  a different subsystem)
- Eigen/slot classification per property (stronger than CSS's
  `inherit`/`initial`)
- CompositorConfig as metamodel data (the scope engine's configuration is
  defined in the same typed system it consumes)

**What's proven (from the existing codebase):**
- Hierarchical scope resolution (TypeSpecnion, working in production)
- Topological dependency resolution (SyntheticValue + topologicalSortKahn,
  working in production)
- Time-based interpolation (Animanion, working in production)
- Immutable state + change detection (metamodel, working in production)

**Risks:**
- **Complexity budget** — Eight combined capabilities means eight things to
  understand, debug, and maintain. The API surface must be carefully designed
  to hide internal complexity. A user defining a property should not need to
  understand topological sort.
- **Performance at scale** — Topological sort per scope per frame during
  animation could be expensive with many properties and deep hierarchies.
  Caching resolved scopes and invalidating incrementally is essential.
- **Over-generalization** — The system is designed for parametric typography.
  If it tries to be a general-purpose scope engine for all domains, it risks
  becoming too abstract. The domain-specific focus (typography, design tools)
  should remain primary.
- **Learning curve** — Eigen, slot, purpose, sub-scope, SyntheticValue,
  CompositorConfig — this is a lot of vocabulary. Good defaults (everything
  inherits, no slots, no purposes) and progressive disclosure (simple cases
  stay simple) are critical.

### What success looks like

The compositor succeeds when:

1. **TypeSpecnion and Animanion are deleted** — replaced by a single unified
   system that handles both static and animated property resolution.
2. **ProcessedPropertiesSystemRecord is deleted** — replaced by declarative,
   typed property definitions in CompositorConfig.
3. **The broom wagon generators are deleted** — replaced by declarative
   model-to-property mappings.
4. **New layouts are easier to build** — a developer defines a
   CompositorConfig, declares which properties are eigen/slot, and the
   compositor handles inheritance, routing, and animation automatically.
5. **Property types catch bugs at compile time** — a typo in a property name
   or a wrong-typed value is a TypeScript error, not a silent runtime failure.
6. **Animation and static properties use the same API** — no separate code
   paths for "this property is animated" vs "this property is inherited."

## Future exploration: breaking the discrete/continuous boundary

### The observation

The codebase has two systems that view the same concept differently:

- **`type-tools-grid`** — A table (or cube, or higher-dimensional structure)
  of discrete value combinations. E.g., weight [400, 500, 600, 700] × width
  [75, 100, 125] = 12 cells, each showing the font at an exact design space
  point.
- **Animanion** — A timeline where properties interpolate continuously between
  keyMoments. At `t=0.6`, you see the interpolated state.

These are treated as separate systems. But they're the same thing at different
resolutions:

```
Discrete:     [400]───[500]───[600]───[700]
               cell    cell    cell    cell

Continuous:   [400]═══════════════════[700]
               t=0.0                  t=1.0

Hybrid:       [400]──▶──[500]──▶──[600]──▶──[700]
               cell  anim  cell  anim  cell  anim  cell
```

### The unifying concept: parameterized paths through value spaces

A grid axis is a **discrete sampling** of a continuous range. An animation is a
**continuous traversal** of a value range. Both are parameterized paths — the
difference is resolution.

Multi-dimensional grids are already multi-dimensional paths:

```
wght: [400, 500, 600, 700]     ← 4 steps
wdth: [75, 100, 125]           ← 3 steps
opsz: [12, 24, 48]             ← 3 steps

= 36 cells in a 3D grid (cube)
```

As a continuous path, this becomes a trajectory through 3D space — a diagonal,
a spiral, an L-shape, or any arbitrary curve.

### The abstraction: ValueSpace

```typescript
interface Dimension {
    name: string;                           // "wght"
    range: [number, number];                // [400, 700]
    samples?: number[] | SamplingStrategy;  // discrete points or auto
    easing?: EasingFunction;                // interpolation between samples
}

interface ValueSpace {
    dimensions: Dimension[];

    // Discrete: enumerate all sample combinations
    cells(): Iterator<Record<string, number>>;

    // Continuous: resolve at a point in normalized space
    at(coordinates: Record<string, number>): Record<string, number>;

    // Hybrid: resolve at t along a path through the space
    atPath(path: SpacePath, t: number): Record<string, number>;
}
```

A grid is `cells()`. An animation is `atPath(path, t)`. A cell-to-cell
animation is `atPath(cellSequencePath, t)` where the path visits each cell.

### Breaking the boundary in both directions

**Discrete → Continuous**: The mouse position within the grid becomes a
continuous coordinate in the value space. The grid cells are discrete
landmarks, but the mouse reveals everything in between:

```
Grid cell [wght=500, wdth=100] at pixel (200, 150)
Mouse hovers at (230, 160)
→ 60% toward [wght=600] and 20% toward [wdth=125]
→ Interpolated: wght=560, wdth=105
```

The cell under the cursor shows the interpolated state at the exact mouse
position. The grid becomes a **live design space explorer** — not a table of
static snapshots, but a window into a continuous space where discrete cells are
reference points.

**Continuous → Discrete**: An animation is sampled at specific points:

- **Video export** at 30fps — each frame is a discrete sample of continuous
  state. The `ValueSpace` produces frame-accurate snapshots.
- **Slide deck** — an animation becomes a set of slides. Each slide is a
  discrete sample. The transition between slides IS the original animation.
- **Print proof sheets** — sample the design space at typographically
  meaningful points.

### Connection to the compositor

The `ValueSpace` feeds into the compositor as a **property source**:

- **Grid layout**: each cell is a scope with eigen-properties from `cells()`
- **Animation**: `t`-resolved values from `atPath()` become scope properties
- **Hybrid**: cells are scopes, transitions produce intermediate scopes via
  interpolation

The compositor doesn't need to know whether a value came from a discrete cell
or continuous interpolation — it's just a value in the scope. `ValueSpace`
handles the distinction upstream.

### Use cases

1. **Design space proofing** — Grid overview + animated transitions between
   cells. Explore the full design space visually.
2. **Video/frame export** — Animation sampled at exact frame boundaries.
   Frame-accurate output from continuous state.
3. **Presentation mode** — Animation as slides with animated transitions.
   Same content, two viewing modes.
4. **Design space analysis** — Color-code cells by metrics (readability,
   contrast). Continuous version shows smooth gradients. Same data, different
   resolution.
5. **Higher-dimensional exploration** — 4D+ design spaces (weight × width ×
   optical size × slant) navigated via 2D grid slices with animated
   transitions along the other dimensions.

### Synchronizing continuous and frame-based media

A complex animation may include actors with fixed frame rates — most notably
video. The typography animation interpolates continuously, but the video must
snap to discrete frame boundaries. The `ValueSpace` handles this as a
synchronization problem:

```
Video actor:
  dimension: "frame"
  range: [0, 300]                    ← 300 frames (10s at 30fps)
  samples: fixed(30)                 ← one sample per frame

Typography animation:
  dimension: "t"
  range: [0.0, 1.0]
  samples: continuous

Synchronization:
  keyMoment at t=0.0  ←→  frame 0
  keyMoment at t=0.5  ←→  frame 150
  keyMoment at t=1.0  ←→  frame 300
```

KeyMoments bind to keyFrame positions, creating a **synchronization contract**
between the continuous typography world and the frame-based video world. The
compositor resolves the video actor's `t` to the nearest frame boundary —
snapping to discrete frames — while typographic properties interpolate
continuously around it.

This works in both directions:

- **Playback**: the animation drives `t`, the video actor snaps to the
  corresponding frame, typography interpolates smoothly.
- **Export**: the video's frame rate becomes the master clock. Each frame is a
  discrete sample of the full compositor state — typography snapped to exact
  frame boundaries, producing frame-accurate output.
- **Editing**: a keyMoment can be placed at a specific video frame, ensuring
  that a typographic transition aligns with a visual event in the video.

The binding between keyMoments and keyFrames is itself data — expressible as a
`CompositorConfig` property on the video actor, defining the frame rate and the
synchronization points. The metamodel manages it; the compositor resolves it.

---

This is post-compositor work — the compositor's scope system must exist first,
then `ValueSpace` layers on top as a property source that unifies discrete and
continuous value resolution.

## The key principle

**The metamodel's job is to be correct. The compositor's job is to be fast.**

TypeScript excels at correct — the typing pass we just completed proves this.
Rust excels at fast — when there's measurable computation to optimize.

Build for correctness first. Optimize for speed when measurement demands it.

**The compositor's job is also to be simple** — to make the complex reality of
parametric typographic scope resolution feel natural and inevitable to the
developer using it. The eight capabilities should feel like one coherent idea,
not eight bolted-together features.
