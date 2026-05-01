#!/usr/bin/env bash
# Build full import graph for ramp/ folder. Counts per-file sibling (./*) and
# external (../*) imports, reverse-deps, and totals. Used to measure before/
# after of the ramp coupling-based refactor.
#
# Usage (run from repo root):
#   bash docs/planning/ramp-refactor/import-graph.sh > /tmp/ramp-graph.txt
#
# Expected totals at each milestone:
#   Pre-split   (baseline, commit e18fbcb):   files=1   (N/A; single-file)
#   Post-split  (commit b1bce69):             files=39  sibling=49  external=85  total=160
#   Post-coupling-based-refactor (target):    files=14  sibling=23  external=60  total=83

cd "$(git rev-parse --show-toplevel)/lib/js/components/layouts/ramp" || {
  echo "ERROR: ramp/ folder not found" >&2; exit 2;
}

FILES=$(ls *.mjs *.jsx 2>/dev/null | sort)

{
echo "=== PER-FILE FORWARD IMPORTS (sibling ./) ==="
for f in $FILES; do
    sibs=$(grep -hE "from [\"']\./" "$f" 2>/dev/null | sed -E "s|.*from [\"']\./([^\"']+)[\"'].*|\1|" | sort -u)
    if [ -z "$sibs" ]; then
        printf "%-60s siblings=0\n" "$f"
    else
        sib_count=$(printf '%s\n' "$sibs" | wc -l)
        printf "%-60s siblings=%d\n" "$f" "$sib_count"
        printf '%s\n' "$sibs" | sed 's/^/    -> /'
    fi
done

echo ""
echo "=== PER-FILE EXTERNAL & NPM IMPORTS ==="
for f in $FILES; do
    total=$(grep -cE "^import " "$f" 2>/dev/null)
    ext=$(grep -cE "^import.*from [\"']\.\./" "$f" 2>/dev/null)
    npm=$(grep -cE "^import.*from [\"'][^.]" "$f" 2>/dev/null)
    sib=$(grep -cE "from [\"']\./" "$f" 2>/dev/null)
    : "${total:=0}"; : "${ext:=0}"; : "${npm:=0}"; : "${sib:=0}"
    printf "%-60s total=%-3d sibling=%-3d external=%-3d npm=%d\n" "$f" "$total" "$sib" "$ext" "$npm"
done

echo ""
echo "=== REVERSE DEPENDENCIES (who imports each file) ==="
for f in $FILES; do
    base="${f%.*}"
    if [[ "$f" == *.typeroof.jsx ]]; then
        base="${f%.typeroof.jsx}"
    fi
    importers=$(grep -lE "from [\"']\./${base}[\"']|from [\"']\./${f}[\"']" *.mjs *.jsx 2>/dev/null | grep -v "^${f}$" | sort -u)
    if [ -z "$importers" ]; then
        printf "%-60s imported_by=0\n" "$f"
    else
        count=$(printf '%s\n' "$importers" | wc -l)
        printf "%-60s imported_by=%d\n" "$f" "$count"
        printf '%s\n' "$importers" | sed 's/^/    <- /'
    fi
done

echo ""
echo "=== TOTALS (current 39-file layout) ==="
total_imports=$(grep -hE "^import " *.mjs *.jsx 2>/dev/null | wc -l)
total_sibling=$(grep -hE "from [\"']\./" *.mjs *.jsx 2>/dev/null | wc -l)
total_external=$(grep -hE "^import.*from [\"']\.\./" *.mjs *.jsx 2>/dev/null | wc -l)
total_npm=$(grep -hE "^import.*from [\"'][^.]" *.mjs *.jsx 2>/dev/null | wc -l)
file_count=$(ls *.mjs *.jsx 2>/dev/null | wc -l)
echo "files=$file_count"
echo "total_import_statements=$total_imports"
echo "  sibling (./)    =$total_sibling"
echo "  external (../)  =$total_external"
echo "  npm (non-dot)   =$total_npm"
} > /tmp/ramp-graph.txt 2>&1

wc -l /tmp/ramp-graph.txt
