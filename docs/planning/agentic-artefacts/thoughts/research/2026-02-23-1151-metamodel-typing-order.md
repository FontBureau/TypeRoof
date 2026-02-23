# Metamodel Module — TypeScript Conversion Plan

## Overall Status

The module is **partially converted**. It compiles cleanly with `strict: true` and
`noUncheckedIndexedAccess`, but a significant portion of the code is **untyped
JavaScript that happens to live in `.ts` files**. The compiler infers what it can,
but many function signatures, class properties, and generator yields are implicitly
`any` or loosely typed.

## Tier Classification (by typing quality)

### 🟢 Tier 1 — Already well-typed (minimal work)

| File | Lines | Notes |
|------|-------|-------|
| `util.ts` | 202 | Generics, explicit types, JSDoc. Only `isProxy()`, `unwrapPotentialWriteProxy()`, `objectEntriesAreEqual()`, and `collectDependencies()` have untyped params (~4 functions) |
| `path.ts` | 226 | Likely well-typed (Path class with string operations) |
| `base-model.ts` | 778 | Mostly typed — has explicit Generator types, `as unknown as` casts are intentional for constructor patterns. A few `any` for rest params |

### 🟡 Tier 2 — Structurally sound, needs type annotations

| File | Lines | Notes |
|------|-------|-------|
| `coherence-function.ts` | 36 | Small, just needs param/property types |
| `foreign-key.ts` | ~50 | Small, likely similar |
| `links.ts` | ~80 | Small |
| `serialization.ts` | ~130 | Has Generator return types already, may need param types |
| `enum-model.ts` | 171 | `*metamorphoseGen()` untyped return |
| `simple-or-empty-model.ts` | 215 | `*metamorphoseGen()` untyped return |
| `number-model.ts` | 329 | `*metamorphoseGen()` untyped return |
| `generic-model.ts` | 203 | `*metamorphoseGen()` untyped return |
| `simple-models.ts` | 140 | Factory pattern, needs type annotations |

### 🔴 Tier 3 — Heavily untyped (most work needed)

| File | Lines | Notes |
|------|-------|-------|
| **`accessors.ts`** | 118 | **Every single function is untyped** — no param types, no return types, no generator yields. 10+ functions all `(state, path, ...)` with zero annotations |
| **`compare.ts`** | 577 | `CompareStatus` class: property declared via `Object.defineProperties` (invisible to TS). `rawCompare(oldState, newState)` and `compare(oldState, newState)` are fully untyped generators. `StateComparison` class uses `Object.defineProperty` for members, making them invisible to the type system |
| **`topological-sort.ts`** | 133 | `setPop(s)`, `_mapGetOrInit(map, name, init)`, `topologicalSortKahn(...)`, `getTopologicallySortedInitOrder(...)` — **every function is fully untyped** |
| **`potential-write-proxy.ts`** | 447 | `_requiresPotentialWriteProxy(item)` untyped. `_PotentialWriteProxy` class: constructor params untyped, `this.immutable`, `this.parent`, `this.key`, `this.draft`, `this.proxy` — all assigned in constructor without declarations. Proxy handler methods `_handlerGet`/`_handlerSet` fully untyped |
| **`type-utils.ts`** | 58 | All 4 exported functions fully untyped params and returns |
| **`dynamic-struct-model.ts`** | 609 | `*metamorphoseGen(dependencies = {})` untyped, `*entries()`, `*allEntries()` untyped generators |
| **`struct-model.ts`** | 1377 | Largest file. Needs investigation but likely has similar patterns |
| **`list-model.ts`** | 594 | `*metamorphoseGen(dependencies = {})` untyped |
| **`ordered-map-model.ts`** | 876 | `*metamorphoseGen(dependencies = {})` untyped |

## Common Patterns Requiring Attention

1. **Untyped generator functions** — `*metamorphoseGen()`, `*entries()`, `*allEntries()`
   appear in nearly every model file without `Generator<Y, R, N>` annotations
2. **`Object.defineProperty` / `Object.defineProperties`** — used in `compare.ts`
   (`StateComparison`) and `potential-write-proxy.ts` to set class members, making
   them invisible to TypeScript's type system. These need `declare` property declarations
3. **Untyped function parameters** — concentrated in `accessors.ts`,
   `topological-sort.ts`, `compare.ts`, `type-utils.ts`, and `util.ts` (tail end)
4. **Missing interfaces** — no shared interface for "something with
   `.entries()`/`.get()`/`.keys()`" (used across accessors, compare, topological-sort)

## Recommended Step-by-Step Plan

### Phase 1 — Foundation types & small files (low risk, high leverage)

| Step | File | Effort | Why first |
|------|------|--------|-----------|
| 1 | `util.ts` | Small | Type the 4 remaining untyped functions. Everything else depends on these symbols |
| 2 | `coherence-function.ts` | Small | Tiny file, used by struct models |
| 3 | `foreign-key.ts` | Small | Tiny file, used by struct/dynamic models |
| 4 | `links.ts` | Small | Tiny file |
| 5 | `topological-sort.ts` | Medium | All functions untyped, but self-contained. Generic `Set`/`Map` types make this straightforward |

### Phase 2 — Leaf model types (independent, no downstream risk)

| Step | File | Effort | Why now |
|------|------|--------|--------|
| 6 | `type-utils.ts` | Small | 4 functions, self-contained |
| 7 | `enum-model.ts` | Small | Type `metamorphoseGen` return |
| 8 | `generic-model.ts` | Small | Type `metamorphoseGen` return |
| 9 | `simple-or-empty-model.ts` | Small | Type `metamorphoseGen` return |
| 10 | `number-model.ts` | Medium | Type `metamorphoseGen` return |
| 11 | `simple-models.ts` | Small | Factory, depends on the above |

### Phase 3 — Core proxy & container models (higher complexity)

| Step | File | Effort | Why here |
|------|------|--------|---------|
| 12 | `potential-write-proxy.ts` | **Hard** | Class properties via constructor assignment, Proxy handler typing, the `createMethodProxy` handler object. Architecturally sensitive |
| 13 | `struct-model.ts` | **Hard** | Largest file (1377 lines), central to everything |
| 14 | `list-model.ts` | Medium | Container model pattern |
| 15 | `ordered-map-model.ts` | Medium-Hard | Container model, largest after struct |
| 16 | `dynamic-struct-model.ts` | Medium | Wrapper/polymorphic dispatch |

### Phase 4 — Consumer modules (depend on everything above)

| Step | File | Effort | Why last |
|------|------|--------|---------|
| 17 | `accessors.ts` | Medium | Every function untyped, but once models are typed, annotations flow naturally |
| 18 | `compare.ts` | **Hard** | `Object.defineProperty` pattern for class members, complex generator yields with tuple types `[CompareStatus, data, ...pathParts]` |

### Phase 5 — Barrel & validation

| Step | File | Effort | Why last |
|------|------|--------|---------|
| 19 | `metamodel.ts` | Small | Verify re-exports carry correct types |
| 20 | Full `tsc --noEmit` pass | — | Validate everything still compiles |

## Notes

- The module compiles with **zero errors** today under `strict: true`. The goal is
  not to fix breakage but to make the implicit types **explicit**, improving
  readability, maintainability, and IDE support.
- Each step should be followed by a `tsc --noEmit` check to ensure no regressions.
- The `*metamorphoseGen()` pattern is the single most repeated untyped signature
  across the codebase — defining a shared return type early (perhaps in
  `base-model.ts`) would pay off across all model files.


# Codebase Research Results: `TypeRoof/lib/js/metamodel` Typing Order

Based on a comprehensive analysis of import dependencies within the `TypeRoof/lib/js/metamodel` submodule, the following topologically sorted order is recommended for converting files to strictly typed TypeScript. This order ensures that dependencies are addressed from the least dependent to the most dependent.

## Recommended Typing Order:

* `TypeRoof/lib/js/metamodel/base-model.ts`
* `TypeRoof/lib/js/metamodel/util.ts`
* `TypeRoof/lib/js/metamodel/topological-sort.ts`
* `TypeRoof/lib/js/metamodel/path.ts`
* `TypeRoof/lib/js/metamodel/serialization.ts`
* `TypeRoof/lib/js/metamodel/potential-write-proxy.ts`
* `TypeRoof/lib/js/metamodel/foreign-key.ts`
* `TypeRoof/lib/js/metamodel/coherence-function.ts`
* `TypeRoof/lib/js/metamodel/links.ts`
* `TypeRoof/lib/js/metamodel/simple-or-empty-model.ts`
* `TypeRoof/lib/js/metamodel/generic-model.ts`
* `TypeRoof/lib/js/metamodel/enum-model.ts`
* `TypeRoof/lib/js/metamodel/number-model.ts`
* `TypeRoof/lib/js/metamodel/simple-models.ts`
* `TypeRoof/lib/js/metamodel/type-utils.ts`
* `TypeRoof/lib/js/metamodel/accessors.ts`
* `TypeRoof/lib/js/metamodel/list-model.ts`
* `TypeRoof/lib/js/metamodel/ordered-map-model.ts`
* `TypeRoof/lib/js/metamodel/struct-model.ts`
* `TypeRoof/lib/js/metamodel/dynamic-struct-model.ts`
* `TypeRoof/lib/js/metamodel/compare.ts`
* `TypeRoof/lib/js/metamodel/metamodel.ts`





