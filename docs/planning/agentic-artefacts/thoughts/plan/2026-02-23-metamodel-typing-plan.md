# Metamodel Module — TypeScript Strict Typing Plan

**Date:** 2026-02-23
**Source research:**
- `thoughts/research/2026-02-23-1151-metamodel-typing-order.md` — dependency analysis, tier classification, error counts
- `thoughts/research/2026-02-23-metamodel-consumer-api-research.md` — how shell.mjs and components consume the metamodel API

## Goal

Make all implicit types **explicit** across 22 files in `TypeRoof/lib/js/metamodel/`.
Currently compiles with `strict: true` but 443 errors exist. The aim is to reach **zero errors**
while improving readability, maintainability, and IDE support.

## Current State (2026-02-23)

- **443 type errors** across 8 files
- **14 files** already pass with zero errors (but some have implicit `any` that the compiler infers)
- Error distribution:
  - list-model.ts: 106 errors
  - number-model.ts: 84 errors
  - dynamic-struct-model.ts: 81 errors
  - generic-model.ts: 50 errors
  - compare.ts: 44 errors
  - accessors.ts: 38 errors
  - enum-model.ts: 25 errors
  - links.ts: 15 errors

## Dependency Graph (local imports only)

```
base-model.ts        → (no local deps — ROOT)
topological-sort.ts  → (no local deps — ROOT)
util.ts              → (no local deps — ROOT)
serialization.ts     → base-model
path.ts              → util
coherence-function.ts→ base-model
foreign-key.ts       → base-model, util
links.ts             → base-model, util
potential-write-proxy→ base-model, util
simple-or-empty-model→ base-model, serialization, util
generic-model.ts     → base-model, serialization, util
enum-model.ts        → base-model, serialization
number-model.ts      → base-model, serialization, util
type-utils.ts        → simple-or-empty-model
simple-models.ts     → generic-model, number-model, path, simple-or-empty-model
accessors.ts         → base-model, path, util
list-model.ts        → base-model, foreign-key, potential-write-proxy, serialization, util
ordered-map-model.ts → base-model, potential-write-proxy, serialization, util
struct-model.ts      → base-model, coherence-function, foreign-key, generic-model, links,
                       potential-write-proxy, serialization, topological-sort, util
dynamic-struct-model → base-model, foreign-key, potential-write-proxy, serialization,
                       struct-model, util
compare.ts           → accessors, base-model, dynamic-struct-model, foreign-key, list-model,
                       ordered-map-model, path, struct-model
metamodel.ts         → (barrel — re-exports everything)
```

---

## Key Typing Insights from Consumer API Research

These insights were derived from studying how `shell.mjs` and `components/` consume the
metamodel. They inform the type definitions in each phase.

### Generator Protocol — The Core Abstraction

The metamorphose generator protocol is the most important type to get right:

```typescript
// Yield: ResourceRequirement (requests for external resources, e.g. fonts)
// Return: the concrete model type (frozen immutable or OLD_STATE reuse)
// Next: unknown (resolved resource sent back via .next())
type MetamorphoseGen<T> = Generator<ResourceRequirement, T, unknown>;
```

Three driver functions consume this generator:
- `driveResolverGenSync` — fails if any ResourceRequirement is yielded
- `driveResolverGenSyncFailing` — convenience wrapper used by `instance.metamorphose(deps)`
- `driveResolveGenAsync` — shell uses this when fonts need async loading

Generators propagate via `yield*` through the model tree — a single top-level
driver handles all ResourceRequirements from any depth in the hierarchy.

### Dependencies Map

```typescript
type DependenciesMap = Record<string, _BaseModel>;
// e.g. { availableFonts: AvailableFontsModel, installedFonts: InstalledFontsModel }
```

Constructed three ways in the codebase:
1. **Sync:** `draft.metamorphose({})` collects immutable deps
2. **Async:** Shell primes with fresh drafts, existing drafts, and read-only state
3. **Components:** Pass `existingModel.dependencies` to create siblings

### Duck-Typed Draft

The shell passes a plain object as "like a draft" for initial state creation:
```javascript
const likeADraft = {
    metamorphoseGen: dependencies => ApplicationModel.createPrimalStateGen(dependencies)
};
```
This suggests `_asyncMetamorphoseState`'s draft parameter should accept an interface
with `metamorphoseGen`, not just the concrete draft class.

### Container API Surface (OrderedMap vs List)

| Method | OrderedMap | List |
|--------|-----------|------|
| `get(key)` | Returns entry model for key | N/A |
| `set(key, entry)` | Sets entry at key | N/A |
| `has(key)` | Boolean existence check | N/A |
| `keys()` | Iterator of keys | N/A |
| `delete(key)` | Remove by key | N/A |
| `push(...entries)` | Takes `[key, entry]` tuples | Takes bare entries |
| `.constructor.Model` | Child model class (static) | Child model class (static) |

### `createClass` Signatures by Model Type

| Model | `createClass` Arguments |
|-------|-------------------------|
| `_AbstractStructModel` | `(name, ...fieldDescriptors)` where each is `[fieldName, ModelClass\|ForeignKey\|ValueLink\|InternalizedDependency]` or `CoherenceFunction` |
| `_AbstractGenericModel` | `(name)` — wraps arbitrary `.value` |
| `_AbstractOrderedMapModel` | `(name, ChildModel, options?)` where options has `ordering`, `validateKeyFn` |
| `_AbstractListModel` | `(name, ChildModel)` |
| `_AbstractDynamicStructModel` | `(name, BaseType, typeSelectorField, dependencyForwardList)` |
| `_AbstractEnumModel` | `(name, allowedValues[], defaultValue)` |
| `_AbstractSimpleOrEmptyModel` | `(WrappedModelClass)` — no name |

### StateComparison Shape (for compare.ts)

Array-like with `.map()`. Each entry: `[status, oldPath?, newPath?]`

Properties: `.newState`, `.isInitial`, `.getChangedMap(dependencyMapping, toLocal)`

Static: `StateComparison.createInitial(state, deps)`, `StateComparison.COMPARE_STATUSES`

Status values: `EQUALS`, `CHANGED`, `NEW`, `MOVED`, `LIST_NEW_ORDER`

### ResourceRequirement.description Convention

```typescript
// Convention (not enforced in types):
// [ForeignKey, targetContainer, currentKey, defaultConstraint]
description: unknown[]
```

Currently deliberately loosely typed. The shell destructures by convention.
Tightening this type is possible but may be premature given the flexibility.

---

## Phased Execution Plan

### Phase 1 — Roots & Foundation (0 errors, but harden types)

_Zero-dep files. Get these right first; everything else depends on them._

| # | File | Errors | Effort | Key Work |
|---|------|--------|--------|----------|
| 1 | `base-model.ts` | 0 | Medium | Define shared `MetamorphoseGen<T>` type alias. Audit `any` in rest params. Define `DependenciesMap` type. Consider interface for duck-typed draft (`{ metamorphoseGen: fn }` pattern seen in shell.mjs). Ensure `ResourceRequirement`, `driveResolverGenSync`, `driveResolveGenAsync` signatures are correct |
| 2 | `topological-sort.ts` | 0 | Small | All 4 functions fully untyped params/returns. Self-contained, generic `Set`/`Map` types |
| 3 | `util.ts` | 0 | Small | Type `unwrapPotentialWriteProxy` (returns underlying model, stripping Proxy — used in main-model.mjs and shell.mjs). Type `objectEntriesAreEqual`, `collectDependencies` (takes dependency set, passed deps, old deps, static deps → returns `DependenciesMap`) |

**Gate: `npm run typecheck` — must remain at ≤443 errors (no regressions)**

### Phase 2 — Small Dependencies (15 errors fixed)

_Small files that depend only on Phase 1 roots._

| # | File | Errors | Effort | Key Work |
|---|------|--------|--------|----------|
| 4 | `serialization.ts` | 0 | Small | Has Generator return types already, add param types |
| 5 | `path.ts` | 0 | Small | Path class, string operations — used by `getEntry`/`getDraftEntry` for slash-separated path resolution |
| 6 | `coherence-function.ts` | 0 | Small | Tiny file. `CoherenceFunction.create(fieldNames[], fn)` — `fn` receives object keyed by field names. Used as first arg in struct `createClass` |
| 7 | `foreign-key.ts` | 0 | Small | Type static symbols (`NOT_NULL`, `ALLOW_NULL`, `SET_DEFAULT_FIRST`, `SET_DEFAULT_LAST`, `SET_NULL`, `NO_ACTION`, `CUSTOM`, `NULL`). Type constraint generator: `function*(targetContainer, currentKeyValue)` yields `ResourceRequirement`, returns key. Consumer research shows two variants: NOT_NULL+SET_DEFAULT_FIRST (main-model) and ALLOW_NULL+SET_NULL/NO_ACTION (actors/models) |
| 8 | `links.ts` | **15** | Small | `InternalizedDependency(dependencyName, ModelClass)` and `ValueLink(foreignKeyFieldName)` — both used as struct field descriptors. **Fixes 15 errors** |
| 9 | `potential-write-proxy.ts` | 0 | **Hard** | Constructor assigns without declarations, Proxy handler typing. `declare` property declarations needed. `_PotentialWriteProxy.isProxy()` should be typed as a type guard (used in shell.mjs assertion checks) |

**Gate: `npm run typecheck` — target ≤428 errors (links fixed)**

### Phase 3 — Leaf Model Types (159 errors fixed)

_Model files that only depend on base-model, serialization, util. Each has a `createClass`
static method and a `*metamorphoseGen()` instance method._

| # | File | Errors | Effort | Key Work |
|---|------|--------|--------|----------|
| 10 | `enum-model.ts` | **25** | Small | `createClass(name, allowedValues[], defaultValue)`. `*metamorphoseGen()` return type. `.value` is one of the allowed enum strings (e.g. `'left'\|'center'\|'right'`) |
| 11 | `generic-model.ts` | **50** | Medium | `createClass(name)` — wraps arbitrary `.value` (any). `*metamorphoseGen()` return type. Consumer code: `InstalledFontModel.createPrimalDraft({}); fontState.value = font;` |
| 12 | `simple-or-empty-model.ts` | 0 | Small | `createClass(WrappedModelClass)` — no name param. `*metamorphoseGen()` return type |
| 13 | `number-model.ts` | **84** | Medium | `*metamorphoseGen()`, static properties (`toFixedDigits`, `validateFN`), `_value` vs `value`, `_PRIMARY_SERIALIZED_VALUE` symbol indexing. `.value` is `number` |
| 14 | `type-utils.ts` | 0 | Small | 4 exported functions, fully untyped — depends on simple-or-empty-model |
| 15 | `simple-models.ts` | 0 | Small | Factory pattern, depends on generic-model, number-model, path, simple-or-empty-model. Exports `StringModel`, `BooleanModel`, etc. |

**Gate: `npm run typecheck` — target ≤284 errors (enum+generic+number fixed)**

### Phase 4 — Container Models (187 errors fixed)

_Depend on base-model, foreign-key, potential-write-proxy, serialization, util.
These implement the Map-like and List-like container APIs._

| # | File | Errors | Effort | Key Work |
|---|------|--------|--------|----------|
| 16 | `list-model.ts` | **106** | Medium | `createClass(name, ChildModel)`. Container API: `push(...entries)` takes bare entries. `*metamorphoseGen()` iterates children via `yield*`. `.constructor.Model` is the child model class |
| 17 | `ordered-map-model.ts` | 0 | Medium | `createClass(name, ChildModel, options?)`. Map-like API: `get(key)`, `set(key, entry)`, `has(key)`, `keys()`, `delete(key)`, `push(...[key, entry])`. Options: `{ ordering, validateKeyFn }`. `.constructor.Model` is the child model class. Verify implicit types are sound |
| 18 | `struct-model.ts` | 0 | **Hard** | Largest file (58KB). `createClass(name, ...fieldDescriptors)` where descriptors are `[name, ModelClass\|ForeignKey\|ValueLink\|InternalizedDependency]` or `CoherenceFunction`. `.get(fieldName)` returns child model. `collectChildDependencies` filters deps for children. `collectDependencies` freezes deps onto instance. Thorough audit needed |
| 19 | `dynamic-struct-model.ts` | **81** | Medium | `createClass(name, BaseType, typeSelectorField, depForwardList)`. `*metamorphoseGen()`, `*entries()`, `*allEntries()`. `.WrappedType` is the concrete struct type (accessed via `unwrapPotentialWriteProxy` in components). Depends on struct-model |

**Gate: `npm run typecheck` — target ≤97 errors (list+dynamic fixed)**

### Phase 5 — Consumer Modules (82 errors fixed)

_Depend on everything above._

| # | File | Errors | Effort | Key Work |
|---|------|--------|--------|----------|
| 20 | `accessors.ts` | **38** | Medium | Exports `getEntry(state, path, options?)` and `getDraftEntry(state, path)`. Consumer research: `getEntry` third param is `{value: defaultValue}`. Also exports `isDraftKeyError`. Once models are typed, annotations flow naturally |
| 21 | `compare.ts` | **44** | **Hard** | `StateComparison` class: array-like (extends Array or has `.map()`), entries are `[status, oldPath?, newPath?]`. Properties: `.newState`, `.isInitial`. Methods: `.getChangedMap(depMapping, toLocal)`. Static: `createInitial(state, deps)`, `COMPARE_STATUSES`. Also exports `COMPARE_STATUSES` with `EQUALS`, `CHANGED`, `NEW`, `MOVED`, `LIST_NEW_ORDER`. Uses `Object.defineProperty` for class members — need `declare` declarations |

**Gate: `npm run typecheck` — target **0 errors****

### Phase 6 — Barrel & Final Validation

| # | File | Errors | Effort | Key Work |
|---|------|--------|--------|----------|
| 22 | `metamodel.ts` | 0 | Small | Verify re-exports carry correct types. Consumers import from `'../metamodel.mjs'` — ensure all public types are accessible |
| — | Full validation | — | — | `npm run typecheck` must pass with **0 errors** in metamodel module |

---

## Cross-Cutting Concerns

1. **Shared `MetamorphoseGen<T>` type** — Define in `base-model.ts` early (Phase 1).
   `Generator<ResourceRequirement, T, unknown>` — the single most repeated untyped
   signature. Pays dividends in every model file.

2. **`DependenciesMap` type** — Define in `base-model.ts` as `Record<string, _BaseModel>`.
   Used by `metamorphose()`, `metamorphoseGen()`, `createPrimalDraft()`,
   `createPrimalState()`, `collectDependencies()`, and stored as `.dependencies`
   on all model instances.

3. **`Object.defineProperty` → `declare` property declarations** — In `compare.ts`
   and `potential-write-proxy.ts`, class members set via `Object.defineProperty/ies`
   are invisible to TypeScript. Add `declare` property declarations to make them visible.

4. **Duck-typed draft interface** — Shell passes `{ metamorphoseGen: fn }` as initial
   state. Consider a `Metamorphosable` interface in `base-model.ts`:
   ```typescript
   interface Metamorphosable<T> {
       metamorphoseGen(dependencies?: DependenciesMap): MetamorphoseGen<T>;
   }
   ```

5. **Container interfaces** — `get()`/`set()`/`has()`/`keys()`/`entries()` are used
   across accessors, compare, topological-sort. Consider shared interfaces in
   `base-model.ts` or a new `types.ts`.

6. **`createClass` return types** — Each `createClass` returns a class constructor
   with static methods (`createPrimalDraft`, `createPrimalState`, `createPrimalStateGen`)
   and (for containers) a static `Model` property pointing to the child model class.
   These need proper typing for the generated classes.

7. **`.value` property typing** — Type varies by model: `any` on GenericModel,
   `number` on NumberModel, `string` on StringModel, enum literal union on EnumModel.
   Each model's `.value` getter/setter should be typed accordingly.

8. **`unwrapPotentialWriteProxy` / `_PotentialWriteProxy.isProxy()`** — The former
   should preserve the model type (generic identity function). The latter should be
   a TypeScript type guard.

9. **Each step must be followed by `npm run typecheck`** — no regressions allowed.

10. **Don't change runtime behavior** — goal is annotation-only changes wherever possible.

---

## Status Tracking

- [ ] Phase 1: Roots & Foundation (steps 1-3)
- [ ] Phase 2: Small Dependencies (steps 4-9)
- [ ] Phase 3: Leaf Model Types (steps 10-15)
- [ ] Phase 4: Container Models (steps 16-19)
- [ ] Phase 5: Consumer Modules (steps 20-21)
- [ ] Phase 6: Barrel & Validation (step 22)
