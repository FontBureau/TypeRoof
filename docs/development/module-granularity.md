---
title: Module Granularity
eleventyNavigation:
  parent: Developer Kit
  key: Module Granularity
  title: Module Granularity
  order: 20
agent-created: true
---

# {{title}}

> Guideline for deciding how to split a file — or whether to split it at all.

This is a style note, not a hard rule. Apply judgment. When in doubt, prefer fewer, more cohesive files over many small ones.

## Prefer coupling‑based decomposition over one‑class‑per‑file

When a file grows large, the first instinct is often "one class per file." This is a syntactic decomposition. The TypeRoof preference is a **coupling‑based** decomposition: group files by what *changes together*, not by how many top‑level declarations they contain.

A module boundary should hide a decision that is likely to change. If two classes, one class and its helpers, or a base class and its only subclass always change in lockstep, they belong in the same file regardless of size.

### Heuristics

**Keep together**

- A class and its private helpers that no other file imports.
- A base class and subclasses that live only in this folder *and* share non‑trivial protocol.
- Parallel pairs that share structure (e.g. `typeSpecGetDefaults` / `nodeSpecGetDefaults`, `TYPESPEC_PPS_MAP` / `NODESPEC_PPS_MAP`): seeing them side‑by‑side makes the parallel visible and inconsistencies obvious.
- A small chain of list / item / row components where each layer has exactly one caller.
- Registered constants and the functions that register them (e.g. `TYPE_SPEC_PROPERTIES_GENERATORS` with the `*Gen` functions it contains).

**Split apart**

- Independent subsystems that are imported from different consumers in the layout / controller.
- Files that have grown past the point where a reader can form a mental model in one sitting (subjective; ~1000 lines is a reasonable warning line, not a hard limit).
- A helper that is *genuinely* used by two or more otherwise‑independent subsystems: promote to a `shared` or `utils` file rather than duplicating or picking a random home.
- The engine (semantics, data pipelines, generators, invariants) from the UI (widgets, event handling, rendering). When both live in one folder, give them separate files and make the tier visible.

### The granularity sweet spot

For a layout folder (e.g. `lib/js/components/layouts/<name>/`), a useful shape is:

- **`index.typeroof.jsx`** — `Model`, `Controller`, public exports.
- **A small handful of engine files** — properties, generators, PPS maps, defaults, synthetic values, state machinery.
- **One UI file per controller zone** — matches what `TypeSpecRampController.zones` (or equivalent) already enumerates.
- **Optionally one `shared` file** for UI helpers used by multiple zones.

Typical total: **~10–15 files**, each in the 100–800 line range. A 4000+ line single file is a signal to split. A folder with 30+ files in flat layout is a signal to consolidate.

## Three properties a good decomposition has

1. **Filenames describe subsystems, not single symbols.** A file named `foo.mjs` because it exports `foo` is a symptom: it hides what else lives in the file and, in practice, ends up collecting unrelated symbols over time (see the historical `get-type-spec-defaults-map.mjs` which contained the entire properties‑generator pipeline). Name files after the *responsibility*, not after one member of it.

2. **Import lists are short.** A file that imports 20 siblings is almost always mis‑grouped: either it is a controller (in which case this is expected and limited to `index.typeroof.jsx`) or its contents should be folded together with some of its dependencies. Watch the sibling‑import count as a proxy.

3. **Tier direction is one‑way.** UI files import engine files; engine files do not import UI files. If this ever needs to reverse, it is a design smell, not a naming problem.

## When to split a large file

Before splitting, write a short plan — one paragraph per target file naming its intended responsibility and which existing symbols go into it. Check the plan against the *actual coupling* (who imports whom) rather than the syntactic class list. This is the 20‑minute version of the exercise in `docs/planning/ramp-layout-coupling-based-decomposition.md`; reuse the approach.

For files over ~1000 lines that will be split on a feature branch, **propose the target decomposition in a short planning document before executing it** — not a heavyweight RFC, just "here are the N pieces I see and why." This is cheaper than discovering the grouping is wrong after 39 files land.

## Bundler note

TypeRoof uses a bundler with tree‑shaking. Consolidating files does *not* pull unused code into the bundle: unused exports are still dropped. Optimize the source layout for **reading**, not for per‑file bundle boundaries.

## File extension convention

Two distinct concerns get conflated here. Treat them separately.

### Concern A — Does the file need JSX?

- **UI files** (components that produce DOM / virtual nodes, or use the project's JSX pragma) → **`.typeroof.jsx`**. In this project the extension is the opt-in: the bundler's JSX transform is wired to `.typeroof.jsx` specifically, and `.mjs` is treated as plain ES modules.
- **Engine files** (data, reducers, generators, pure logic, PPS plumbing) should not produce DOM and therefore don't need JSX. They stay **`.mjs`**.
- It is technically harmless for an engine file to carry the `.typeroof.jsx` extension (the JSX transform is a no-op when no JSX appears), but it muddles the UI/engine distinction at a glance. Prefer `.mjs` for engine files.

Rule: a split that moves JSX out of a file should rename to `.mjs`; a consolidation that brings JSX into a file should rename to `.typeroof.jsx`.

### Concern B — Is the file formatted by prettier?

Project-wide, `.prettierignore` uses a deny-by-default pattern (`*`) and allow-lists specific globs. Current reality:

- `**/*.jsx` is globally allow-listed → **every `.typeroof.jsx` file is prettier-formatted**, wherever it lives.
- `**/*.mjs` is **not** globally allow-listed → `.mjs` files are skipped by prettier unless a directory-specific allow-list covers them.
- `**/ramp/*.*` is a blanket allow-list → inside `lib/js/components/layouts/ramp/`, prettier formats *all* extensions, including `.mjs`.

Consequences worth knowing:

- **For new UI files anywhere:** `.typeroof.jsx` is the right extension on both grounds — JSX is available, and prettier covers the file.
- **For new engine files:** `.mjs` is technically correct (no JSX needed). If prettier coverage matters for a given file, either (a) place it under a directory that's allow-listed (e.g. `ramp/`), or (b) extend `.prettierignore` to cover it explicitly — do not rename `.mjs` → `.typeroof.jsx` purely to obtain prettier coverage, that conflates the two concerns.

### Tiny decision table

| Scenario | Extension | Rationale |
|---|---|---|
| New UI component | `.typeroof.jsx` | Needs JSX; prettier-covered. |
| New engine module, anywhere | `.mjs` | No JSX; extend `.prettierignore` separately if formatting is desired. |
| A previously JSX-free file starts producing DOM | rename `.mjs` → `.typeroof.jsx` | Extension is the JSX opt-in. |
| Extracting pure logic out of a `.typeroof.jsx` into its own file | new file is `.mjs` | No JSX in the extracted module. |
| Mixed UI+engine `.mjs` file (historical) getting split | UI part → `.typeroof.jsx`, engine part → `.mjs` | Both concerns resolved. |

## Naming

- Prefer the hyphenated `type-spec-*`, `node-spec-*`, `style-patch-*` form consistently. Do not mix `typespec-` / `type-spec-` in the same folder.
- Prefer lowercase‑kebab for files, `PascalCase` for classes, `camelCase` for functions and values — this is already the de‑facto rule; noted here so the coupling note is self‑contained.

## References

- D. L. Parnas, *On the Criteria To Be Used in Decomposing Systems into Modules* (1972) — the original argument that module boundaries should hide decisions, not syntactic units.
- John Ousterhout, *A Philosophy of Software Design* — specifically the "deep vs. shallow modules" chapter.
- `docs/planning/ramp-layout-coupling-based-decomposition.md` — worked example of applying this guideline to a 4700‑line file that had been mechanically split into 39.
