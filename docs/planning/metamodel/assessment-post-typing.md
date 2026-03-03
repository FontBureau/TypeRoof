---
title:  Assessment of the Metamodel Module — Post Strict Typing
eleventyNavigation:
  parent: Planning
  key: assessment-post-typing
  title: Metamodel - Assessment Post Strict Typing
  order: 2
---

** This file was created with an agent. **

# {{title}}

## Context

This assessment follows the completion of a full strict TypeScript typing pass
across all 22 files in the metamodel module. The prior assessment (see
`ASSESSMENT.md`) evaluated the module after its structural refactoring from a
single monolith into a clean multi-file architecture. This assessment evaluates
the impact of making every function signature, class property, generator yield,
and return type explicit under `strict: true` with `noUncheckedIndexedAccess`.

## Typing by the numbers

| Metric | Before | After |
|--------|--------|-------|
| TypeScript errors | 443 | **0** |
| Files with errors | 16 | **0** |
| `declare` property declarations added | 0 | **48** |
| Typed interfaces/type aliases added | ~18 | **48** |
| Explicit `Generator<Y, R, N>` annotations | ~13 | **48** |
| Explicit function parameter types | ~60% | **100%** |
| Remaining `any` annotations | unknown | **2** (both intentional) |
| `as unknown as` escape hatches | 0 | **72** |
| Lines of code | ~7400 | **~8200** |
| Files modified | — | **22/22** |
| Bugs found during typing | — | **3** |
| Commits | — | **19** |

## Did typing improve quality?

**Yes, concretely and measurably.** The typing pass was not merely cosmetic
annotation — it surfaced real issues and enforced contracts that were previously
only held by convention.

### Bugs found and fixed

1. **`toDraft()` → `getDraft()`** (`dynamic-struct-model.ts` line 455).
   The method `toDraft()` does not exist on `_BaseModel` or any subclass. This
   was likely a remnant from a rename that was never caught because JavaScript
   doesn't check method existence until the code path is hit. TypeScript caught
   it immediately. Fix: renamed to `getDraft()`.

2. **`!_kv.length >= 2`** (`ordered-map-model.ts`).
   The logical NOT binds tighter than `>=`, so this expression evaluates as
   `(!_kv.length) >= 2`, which is `(false) >= 2` or `(true) >= 2` — always
   `false`. The intended check was `_kv.length < 2`. This is a logic bug that
   TypeScript's type narrowing exposed indirectly.

3. **Lost `this` binding in `_getEntry`** (`accessors.ts`).
   When a method was extracted from a container via bracket notation
   (`const fn = accum[fnName]`) and called as `fn(part)`, the `this` context
   was lost. In strict mode this causes `this` to be `undefined` inside the
   method. Fix: `fn.call(accum, part)`. This was a latent bug — it worked in
   sloppy mode where `this` falls back to the global object, but would have
   broken under `"use strict"` at the call site.

### Contracts now enforced by the type system

- **`metamorphoseGen` return types** — Every model's generator now declares
  `Generator<ResourceRequirement, this, unknown>`, enforcing that the
  metamorphose protocol always yields resource requirements and returns a
  same-typed instance.

- **Container `get()` contracts** — All containers now declare
  `get(key: string): _BaseModel` matching the base class, with overloads for
  optional defaults. Previously, return types were implicit `any`, allowing
  silent type violations at call sites.

- **`ForeignKey.NULL` vs string discrimination** — `KeyValue = string | typeof
  ForeignKey.NULL` is now a proper union type. Code that compares or passes key
  values must handle the null-key case explicitly.

- **Dependency maps** — `DependenciesMap`, `FreezableMap<string, ...>`, and
  `FreezableSet<string>` are now consistently typed, preventing accidental
  insertion of non-string keys or non-model values.

- **Serialization protocol** — `[SERIALIZE]` and `[DESERIALIZE]` have explicit
  signatures on every model class, enforced by the abstract declarations on
  `_BaseModel`.

## Does typing improve the prior assessment?

The prior assessment identified five architectural concerns. Here is how typing
interacts with each:

### 1. "`instanceof` cascades in `rawCompare`"
**Unchanged.** Typing does not solve the extensibility problem — adding a new
model type still requires modifying `compare.ts`. However, the typed generator
return type (`CompareResultEntry`) now makes it explicit what each branch must
yield, reducing the risk of an incomplete implementation going unnoticed.

### 2. "`_AbstractDynamicStructModel` is doing a lot"
**Partially improved.** The typed interface makes the three responsibilities
(wrapper, dispatcher, factory) visible in the type signatures. A developer can
now see in the IDE that `set wrapped(state: _AbstractStructModel)` accepts only
struct models, `get WrappedType` returns `typeof _AbstractStructModel | null`,
and `availableTypes` returns a dependency-driven container. Decomposition would
be easier now because the contracts are explicit.

### 3. "Proxy symbols repeated in every container model"
**More visible, still repeated.** The typing pass required adding identical
`declare [_LOCAL_PROXIES]: LocalProxies` and symbol-keyed method signatures
(`_HAS_DRAFT_FOR_PROXY`, `_GET_DRAFT_FOR_PROXY`, etc.) to four different files.
This repetition is now **glaringly obvious** in the type declarations, which
strengthens the case for extracting a mixin or base class method.

### 4. "`collectDependencies` called identically by all containers"
**Now type-safe but still duplicated.** The function has a clean signature:
`(Set<string>, Record<string, unknown> | null, Record<string, unknown> | null,
Map<string, StaticDependencyLike> | null) → Readonly<Record<string, unknown>>`.
Lifting it to `_BaseContainerModel` is straightforward now that the types are
pinned.

### 5. "Splitting `base-model.ts`"
**Better informed.** The typing pass revealed that `_BaseModel`,
`_BaseSimpleModel`, and `_BaseContainerModel` have distinct type surfaces
(`get value()` on simple models, `get(key)`/`set(key, value)` on containers)
but share the `metamorphoseGen` protocol and serialization symbols. A split
would need to preserve these shared abstractions.

## Quality of the type annotations

### What went well

- **`declare` for `Object.defineProperty` patterns** — A consistent solution
  that preserves runtime behavior while giving TypeScript visibility into
  dynamically-set properties. Used 48 times.

- **`const ctor = this.constructor as typeof XxxModel`** — A clean workaround
  for TypeScript's `this.constructor` typing limitation (returns `Function`).
  Each method that accesses static properties creates a local typed alias. Used
  ~58 times across model files.

- **Generic `unwrapPotentialWriteProxy<T>`** — The signature
  `<T>(maybeProxy: Record<symbol, T> | T) → T` accurately models the proxy
  unwrapping contract without lying about the type transformation.

- **`unique symbol` for `_EMPTY`** — Removing the explicit `: symbol`
  annotation lets TypeScript infer a unique symbol type, enabling proper
  narrowing with `=== ctor._EMPTY`.

- **Overloaded `get()` signatures** — Containers expose
  `get(key: string): _BaseModel` for the common case and
  `get(key: string, defaultReturn: D): _BaseModel | D` for the fallback case.
  This preserves the base class contract while supporting the richer API.

### What is not ideal

- **72 `as unknown as` casts** — These are escape hatches where TypeScript
  cannot verify the type relationship. Many arise from the proxy system (a
  `Proxy<_BaseModel>` is not the same type as `_BaseModel` in TypeScript's
  view) and from `this` being used before construction is complete (constructor
  returns `this.metamorphose()`). Each cast is a potential unsoundness.

- **`this.constructor` ceremony** — The `const ctor = this.constructor as
  typeof XxxModel` pattern is verbose and repeated. A potential improvement:
  define a protected `get ctor()` accessor on each abstract class.

- **`Record<string, unknown>` as catch-all** — Dependencies, serialized
  values, and configuration objects are often typed as
  `Record<string, unknown>`. This is honest but provides minimal IDE
  assistance. Narrower types would help consumers but require understanding
  each model's specific dependency shape.

## The `Object.defineProperty` pattern

This pattern deserves special attention because it's the single largest source
of typing friction in the module:

```typescript
// Runtime: works, but TypeScript can't see 'myProp'
Object.defineProperty(this, 'myProp', { value: 42 });

// Fix: declare the property shape, let defineProperty fill it
declare myProp: number;
Object.defineProperty(this, 'myProp', { value: 42 });
```

The module uses this pattern for:
- **Immutable properties** — set once in the constructor, never reassigned
- **Frozen collections** — `FreezableMap`/`FreezableSet` assigned via
  `defineProperty` with `configurable: false`
- **Symbol-keyed internal state** — `[OLD_STATE]`, `[_LOCAL_PROXIES]`,
  `[_PRIMARY_SERIALIZED_VALUE]`

The `declare` keyword is the correct TypeScript solution — it creates a type
declaration without emitting any JavaScript, letting `Object.defineProperty`
handle the actual assignment.

**Recommendation**: Consider using `readonly` class fields instead of
`Object.defineProperty` where the goal is simply "set once, never reassign."
TypeScript enforces `readonly` at the type level, and the runtime behavior is
nearly identical for non-frozen properties.

## What could be the next big leap in quality engineering?

### 1. Automated testing (highest impact)

The metamodel has **zero automated tests**. The typing pass found 3 bugs in
~8200 lines of code. A test suite would catch a different class of bugs —
behavioral regressions, edge cases in serialization, order-dependent
initialization — that types cannot express.

**Recommended approach**: Start with the pure, side-effect-free functions that
are easiest to test:
- `topologicalSortKahn` — deterministic algorithm, clear inputs/outputs
- `collectDependencies` — pure data transformation
- `rawCompare` / `compare` — core diffing logic
- `serialize` / `deserializeGen` — round-trip property

Then graduate to integration tests for the full lifecycle:
`createClass → construct → metamorphose → mutate draft → metamorphose → compare`.

### 2. Protocol-based model dispatch (addresses concern #1)

Replace `instanceof` checks in `compare.ts` and `accessors.ts` with
protocol symbols:

```typescript
static readonly [IS_LIST_MODEL] = true;
static readonly [IS_STRUCT_MODEL] = true;
```

This makes model type checks extensible — new model types can participate in
comparison and traversal without modifying `compare.ts`.

### 3. Extract the draft/proxy mixin (addresses concern #3)

The four container models (`struct`, `list`, `ordered-map`,
`dynamic-struct`) each implement identical proxy management code:
- `_HAS_DRAFT_FOR_PROXY` / `_HAS_DRAFT_FOR_OLD_STATE_KEY`
- `_GET_DRAFT_FOR_PROXY` / `_GET_DRAFT_FOR_OLD_STATE_KEY`
- `getDraftFor`
- `_LOCAL_PROXIES` bookkeeping

This could become a mixin or a set of methods on `_BaseContainerModel`. The
type signatures are now explicit and identical, making extraction mechanical.

### 4. Narrow `DependenciesMap` per model (long-term)

Currently `DependenciesMap = Record<string, unknown>`. Each struct class knows
*exactly* which dependency keys it expects (they're in the frozen
`dependencies` set). A generic `DependenciesMap<T extends string>` would let
each model declare its expected keys, enabling compile-time detection of
missing or misspelled dependencies.

### 5. Consumer migration to TypeScript

The metamodel's consumers (`shell.mjs`, `basics.mjs`, component files) are
all untyped JavaScript. They use the metamodel API extensively — `getEntry`,
`getDraftEntry`, `StateComparison`, `ForeignKey`, model constructors. Now
that the metamodel has a fully typed public API, converting consumers to `.ts`
would propagate type safety to the application layer, where most runtime errors
actually occur.

## Comparison with prior assessment

| Aspect | Prior assessment | Post-typing |
|--------|-----------------|-------------|
| **Architecture** | Clean 22-file DAG, no cycles | Unchanged ✅ |
| **Type safety** | Implicit, convention-based | Explicit, compiler-enforced ✅ |
| **IDE support** | Minimal (hover shows `any`) | Full (hover shows precise types) ✅ |
| **Bug detection** | Runtime only | 3 bugs caught at compile time ✅ |
| **Refactorability** | Risky (no type guards) | Safer (types break on mismatch) ✅ |
| **Documentation** | Comments only | Types serve as living documentation ✅ |
| **Test coverage** | None | None ⚠️ (biggest remaining gap) |
| **Proxy boilerplate** | Repeated in 4 files | Still repeated, now visible ⚠️ |
| **`instanceof` dispatch** | Not extensible | Still not extensible ⚠️ |

## Overall

The metamodel module has gone from "well-designed but dynamically typed" to
"well-designed with fully enforced type contracts." The 443→0 error journey
revealed that the original code was remarkably sound — only 3 genuine bugs in
~8200 lines — which validates the quality of the original design. The types now
make that quality *visible and maintainable*.

The biggest remaining quality gap is **the absence of automated tests**. Types
prove that shapes are consistent; tests prove that behavior is correct. Together
they form a comprehensive safety net. That should be the next investment.
