# `ramp-refactor/` — Supporting Artifacts

Persisted artifacts supporting the plan in
`docs/planning/ramp-layout-coupling-based-decomposition.md`.

## Contents

| File                        | Purpose                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `symbol-inventory.tsv`      | 68 top-level symbols from the pre-split source, with line ranges and proposed target file. **Source of truth** for what goes where.                                  |
| `import-graph.sh`           | Produces per-file import counts (sibling + external) and totals. Re-run after each migration step to track progress toward the target (83 total imports).            |
| `compute-fan-out.sh`        | For each symbol, counts how many _other_ symbols in the same target file it references. Used to derive within-file symbol ordering (leaves at top, trunk at bottom). |
| `project-target-imports.sh` | Projects what the totals should be after the refactor, based on hypothetical target-file composition.                                                                |

## Regenerating derived data

All scripts are idempotent and expect to be run from the repository root.

```bash
# One-time setup: materialize the pre-split source
git show e18fbcb:lib/js/components/layouts/type-spec-ramp.typeroof.jsx > /tmp/ramp-old.jsx

# Current (post-split) import graph
bash docs/planning/ramp-refactor/import-graph.sh > /tmp/ramp-graph.txt

# Fan-out per symbol (within-target reference counts)
bash docs/planning/ramp-refactor/compute-fan-out.sh > /tmp/fan-out.csv

# Projected totals under the proposed 14-file layout
bash docs/planning/ramp-refactor/project-target-imports.sh
```

## Why these are in the repo (not `/tmp/`)

They encode decisions (symbol-to-target mapping) and enable verification
(import-count deltas) that another session needs to execute the plan
reliably. `/tmp/` is not portable across sessions or machines.

Anything the scripts _compute_ (CSV/TXT outputs) stays in `/tmp/` — it
can always be regenerated and is not itself a decision.
