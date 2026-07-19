---
title: 'Assessment of the Metamodel Module — 2026-07'
eleventyNavigation:
  parent: Planning
  key: assessment-2026-07
  title: 'Metamodel: 2026-07'
  order: 43
agent-created: true
---

# {{title}}

## Context

Third assessment in the series (see *Related documents*). Where the post-typing
assessment evaluated the strict-TypeScript conversion, this one is a verified
current-state snapshot: every metric was measured from the tree on 2026-07-19,
not carried over. It adds a definition of the *descriptor state machine*
pattern, a re-verification of earlier claims, a delta analysis, and a ranked
risk list.

## Term: descriptor state machine

A **descriptor state machine** is a state machine whose states are encoded not
in a field's *value* but in a property's *descriptor* — its kind (accessor vs.
data) and its flags (`writable`, `configurable`) — with transitions performed
by `Object.defineProperty` redefinition.

In `_AbstractStructModel`, `dependencies` (and `_value`) progress through three
descriptor states:

| Phase | Descriptor | Meaning |
|---|---|---|
| Primal | own **accessor** whose getter throws `LIFECYCLE ERROR` when read before draft mode; in draft mode it delegates to `this[OLD_STATE].dependencies`; `configurable: true` | reading is illegal in primal state |
| Draft / metamorphose | redefined as **data property**: `value: Object.freeze(dependenciesData), writable: true, configurable: true` | dependencies materialized for comparison against `OLD_STATE` |
| Locked (`#_lockAndFreeze`) | redefined: `writable: false, configurable: false` | irreversibly immutable; `OLD_STATE` is deleted for GC |

Properties of the pattern:

- **State is the descriptor, not a value** — the object's own shape *is* its
  phase. Illegal reads fail at the property level, without explicit state
  checks at call sites.
- **Guards are throwing accessors** — fail-fast is built into the state, not
  bolted on.
- **`configurable` is the ratchet** — `true → true → false` makes the final
  freeze irreversible; earlier phases must stay redefinable.
- **Not expressible in class syntax** — no class construct installs
  per-instance, phase-varying property kinds. Typing therefore requires
  `declare` plus a scoped `@ts-expect-error` (TS2610: instance property
  overrides base accessor). The suppression monitors the one formal symptom;
  if the base contract is ever refactored, tsc reports the unused directive
  and forces a human to re-read this machine.

The pattern is deliberate machinery, not accidental complexity — but it is one
of three exotic idioms (with symbol-keyed protocols and generator-based
resource resolution) a newcomer must learn before their first `get()`.

## Vitals (verified 2026-07-19)

| Metric | Value |
|---|---|
| Files / LOC / functions / classes | 22 / 8,907 / 268 / 37 |
| Language | 100% TypeScript, `strict` + `noUncheckedIndexedAccess`, typecheck clean |
| External runtime dependencies | 0 — every import is `./`-relative; pure leaf module |
| Consumption | one-line facade `lib/js/metamodel.mjs` + one direct importer |
| Type-escape hatches | 1 `@ts-expect-error`, 0 `@ts-ignore`, 0 `as any`, 2 intentional `: any`, 28 non-null assertions; 72 `as unknown as` (documented post-typing) |
| Tests covering the metamodel | 0 — the repo's first vitest tests (added 2026-07) cover `type-specnion` only |
| Error culture | 152 `throw new` across 15 distinct error classes |
| Comment density | ~23% |
| Internal protocols | 20+ `Symbol(...)` keys (dunder-style inter-object protocols) |

## What it is

Closer to a small relational state engine than a frontend state manager:
immutable persistent states, copy-on-write drafts, a primal→draft→frozen
lifecycle, topological dependency resolution, foreign keys with constraints,
coherence functions (cascading invariant triggers), structural diffing, and
generator-based async resource resolution. See `path-to-standalone.md` for the
comparison against Redux/MobX/Zustand — most of these features have no
counterpart there.

## Architecture

```
util / type-utils / topological-sort    foundations
base-model.ts (780L)                    _BaseModel, _BaseSimpleModel/_BaseContainerModel,
                                        FreezableMap/Set, serialization drivers
scalar models                           number, enum, simple, simple-or-empty, generic
container models                        struct (1580L) · ordered-map (954L) · list (596L) · dynamic-struct (686L)
machinery                               potential-write-proxy · compare · coherence-function ·
                                        foreign-key · links · accessors · path · serialization
metamodel.ts (211L)                     curated export hub with an explicit don't-pollute policy
```

Shallow hierarchy; concrete classes are produced by `createClass` factories.
Hub-and-spoke: `_AbstractStructModel` is the gravitational center — its `get`
is called from 50 sites, `has` from 44, `set` from 30.

## Strengths

1. **Boundary discipline.** Zero external dependencies, one-line facade,
   curated hub exports. A library that happens to live in this repo; the
   standalone-extraction path is real.
2. **Type-conversion quality.** 443 → 0 errors with a single suppression in
   8.9k lines, and that one is a TypeScript grammar gap (no syntax for a
   type-only instance accessor), not evasion. The typing pass itself found
   three real bugs — evidence it enforced contracts rather than annotating.
3. **Fail-fast error culture.** 152 throws with a 15-class taxonomy
   (TYPE/VALUE/KEY/LIFECYCLE/CONSTRAINT/…); lifecycle guards make misuse loud.
4. **Deliberate machinery.** The descriptor state machine, the `_IS_DRAFT_MARKER`
   / `_GET_DRAFT_FOR_PROXY` symbol protocols, and copy-on-write escalation are
   designed, documented in comments, and internally consistent.
5. **Alive and improving.** Recent history: coherence functions learned to
   depend on each other (topological execution order), `ENSURE_DRAFT` for
   explicit draft creation, compare/descendant enumeration fixes, better
   accessor error messages.

## Risks (ranked)

1. **Zero test coverage — the elephant.** 8.9k LOC of state-machine code with
   nothing executing it in CI. Fresh proof of the cost: the
   `resolveSyntheticProperties` drop-check bug (fixed 2026-07) survived
   because no test ran the code. The three bugs the typing pass found were
   static-analysis luck, not coverage.
2. **Complexity concentration.** struct + ordered-map + base = 3,314 LOC (37%)
   in three files; struct-model alone carries 12 TODO/FIXME, several
   substantive (external-dependency mutability, key-constraint timing). The
   core is still moving while untested.
3. **Indirection cost.** Symbol protocols + descriptor programming +
   generator-based resolution raise the bus factor; three exotic idioms before
   a newcomer's first `get()`.
4. **Latent semantic overloads.** `dependencies` means a set of names on the
   base class but a name→value record on struct instances — a Liskov-flavored
   overload, currently latent (no polymorphic consumer mixes the two). Likely
   not unique in a module this size; worth one audit pass for siblings.
5. **72 `as unknown as` double-casts** (documented post-typing). Each tells
   the compiler rather than asks it; concentrated risk if invariants shift.

## Delta vs. the post-typing assessment

- **+~700 LOC** (~8,200 → 8,907): coherence functions matured,
  `potential-write-proxy` (540L) added and hardened, compare fixed.
- **Claims re-verified:** 0 type errors holds; the 2 intentional `any` hold;
  the single `@ts-expect-error` is now *legal* TypeScript (the illegal
  `declare override` combo, TS1243, was removed 2026-07 after it broke node's
  type-stripping parser and vitest's transform path).
- **Unchanged:** metamodel tests = 0; top-3 file concentration persists. The
  module became better-typed and more capable, not more verifiable.

## Recommendations

1. **Cash in the vitest setup (highest leverage).** The runner is wired and
   proven. Write characterization tests around the lifecycle core:
   primal→draft→frozen transitions, the `dependencies` descriptor states,
   `#_lockAndFreeze`, topological init order. ~20 tests would cover the paths
   every feature depends on.
2. **Document the descriptor state machine with a diagram** — it is the
   module's central idea and currently lives only in code (and in this
   document's definition).
3. **Do not split struct-model yet** — it is a hub, not a junk drawer.
   Revisit once tests make the surgery safe.
4. **Audit `dependencies`-style overloads once** — cheap, now that the
   pattern's signature is known.
5. **Standalone extraction:** the boundary is already clean; the missing
   pieces are tests and a README, not refactoring.

## Related documents

- `assessment-pre-typing.md` — after the monolith→multi-file refactor
- `assessment-post-typing.md` — after the strict-TypeScript pass
- `path-to-standalone.md` — could this be a library?
- `../agentic-artefacts/thoughts/plan/2026-02-23-metamodel-typing-plan.md` — the typing program

## Signature

    model: moonshotai/kimi-k3
    provider: openrouter
    agent: goose v1.41.0
