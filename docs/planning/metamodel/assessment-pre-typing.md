---
title:  Assessment of the Metamodel Module — Pre Strict Typing
eleventyNavigation:
  parent: Planning
  key: assessment-pre-typing
  title: Metamodel - Assessment Pre Strict Typing
  order: 1
---

** This file was created with an agent. **

# {{title}}

## What it is

A **reactive immutable state management framework** — essentially an ORM for in-memory tree-structured state, with:

- **Immutable snapshots** with copy-on-write via lazy proxy escalation
- **Typed schema** (struct, list, ordered-map, dynamic/polymorphic struct, enum, number, string, boolean, path)
- **Foreign keys** with referential integrity
- **Coherence functions** (like database triggers — cascading validation/normalization)
- **Dependency tracking** with topological ordering
- **Serialization/deserialization** with async resource resolution
- **Deep state comparison** with path-based diffing

## Architecture quality

### Strengths

- **Deeply thought-out design.** The comments reveal careful reasoning about immutability trade-offs, comparison semantics, draft escalation. This is not "AI slop" — it's the work of someone who understands data modeling deeply.
- **The proxy escalation pattern is clever.** Lazy draft creation only when a write actually occurs avoids unnecessary copying. The `_PotentialWriteProxy` is essentially a transparent CoW mechanism.
- **Topological dependency sorting** ensures initialization order is deterministic and correct. This is the kind of thing most state managers get wrong.
- **The `ForeignKey` system** with null constraints and referential integrity is rare in frontend state management — more akin to a relational database.

### Concerns

- **`instanceof` cascades in `rawCompare`** — Protocol symbols (`IS_LIST_MODEL`, `IS_ORDERED_MAP_MODEL`, etc.) would make this extensible without modifying `compare.ts` every time a new model type is added.
- **`_AbstractDynamicStructModel`** is doing a lot — it's a wrapper, a polymorphic dispatcher, and a struct factory. The `IS_WRAPPER_TYPE` extraction was a good first step, but the class itself might benefit from decomposition.
- **The 6 proxy symbols** (`_LOCAL_PROXIES`, `_OLD_TO_NEW_SLOT`, `_HAS_DRAFT_FOR_*`, `_GET_DRAFT_FOR_*`) are threaded through every container model identically. This cross-cutting concern could potentially be handled via a mixin or base class method rather than repeated in each model.
- **`collectDependencies`** is called by all 4 container models with nearly identical patterns — another candidate for lifting into `_BaseContainerModel`.

## Post-refactoring module structure

The 17-file decomposition is clean:

```
                    util.ts (pure, zero deps)
                      ↑
    ┌─────────────────┼─────────────────┐
    │                 │                 │
links.ts    topological-sort.ts    serialization.ts
    │                 │
    └────────┬────────┘
             │
      base-model.ts ← coherence-function.ts, foreign-key.ts
             ↑
    ┌────────┼────────┬────────────────┐
    │        │        │                │
generic  enum  simple-or-empty  number-model.ts
    │                 │                │
    └────────┬────────┘                │
             │                         │
      simple-models.ts ← path.ts      │
             │                         │
    potential-write-proxy.ts           │
             ↑                         │
    ┌────────┼────────┬────────┐       │
    │        │        │        │       │
 struct   list    ordered-map  dynamic-struct
    │        │        │        │
    └────────┼────────┼────────┘
             │
      ┌──────┼──────┐
      │             │
  accessors.ts  compare.ts
             │
       metamodel.ts (barrel)
```

**No circular dependencies.** Each module has a clear, single responsibility. The barrel preserves backward compatibility.

## Recommendations for next steps

1. **Protocol symbols for model type checks** — replace `instanceof` in `compare.ts` with `IS_STRUCT_MODEL`, `IS_LIST_MODEL`, etc. Same pattern as `IS_WRAPPER_TYPE`.
2. **Lift proxy boilerplate** — the `hasDraft`/`getDraft`/`getPotentialWriteProxy` pattern repeated in every container model could be a mixin or method on `_BaseContainerModel`.
3. **`collectDependencies` → `_BaseContainerModel`** — it's called identically by all 4 container types.
4. **Consider splitting `base-model.ts`** (778 lines) — `_BaseModel`, `_BaseSimpleModel`, `_BaseContainerModel` could each get their own file, but the tight coupling between them makes this less clear-cut.
5. **The trailing design comments** in `metamodel.ts` (lines 159–197) are valuable documentation but should probably move to a `DESIGN.md` or similar.

## Overall

This is a **well-designed, thoughtful system** that suffered from being in a single file. The refactoring preserves all behavior while making each concern independently navigable. The biggest wins are cognitive — a developer can now look at `list-model.ts` and understand list behavior without scrolling past 2000 lines of unrelated code.
