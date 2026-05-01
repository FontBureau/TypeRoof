#!/usr/bin/env bash
# Fan-out per symbol: how many OTHER symbols in the SAME target file does a
# given symbol reference in its body? Used to order symbols within each target
# file (leaves at top, trunk at bottom).
#
# Note: this is a textual analysis. It will over-count comment-only references
# (e.g. "see HierarchicalScopeTypeSpecnion" inside a comment counts as a ref).
# Known false-positive edges are listed in the planning doc under
# "Known false-positive edges in fan-out data".
#
# Usage (run from repo root):
#   # 1. Materialize the pre-split source file (one-shot):
#   git show e18fbcb:lib/js/components/layouts/type-spec-ramp.typeroof.jsx > /tmp/ramp-old.jsx
#   # 2. Run:
#   bash docs/planning/ramp-refactor/compute-fan-out.sh > /tmp/fan-out.csv
#
# Reads docs/planning/ramp-refactor/symbol-inventory.tsv (header + TAB-separated).

set -e

OLD=${OLD:-/tmp/ramp-old.jsx}
INV=${INV:-docs/planning/ramp-refactor/symbol-inventory.tsv}

if [ ! -f "$OLD" ]; then
  echo "ERROR: $OLD not found. Materialize it first:" >&2
  echo "  git show e18fbcb:lib/js/components/layouts/type-spec-ramp.typeroof.jsx > $OLD" >&2
  exit 2
fi
if [ ! -f "$INV" ]; then
  echo "ERROR: inventory not found at $INV" >&2
  exit 2
fi

# Strip header into a temp file (no subshell state loss).
TMP_INV=$(mktemp)
trap "rm -f $TMP_INV" EXIT
tail -n +2 "$INV" > "$TMP_INV"

echo "target,symbol,start,end,fan_out,refs"
while IFS=$'\t' read -r sym start end target; do
  [ -z "$sym" ] && continue
  refs=""
  fan_out=0
  while IFS=$'\t' read -r sym2 _s2 _e2 target2; do
    [ "$target" != "$target2" ] && continue
    [ "$sym" = "$sym2" ] && continue
    hits=$(sed -n "${start},${end}p" "$OLD" | grep -wc "$sym2" || true)
    hits=${hits:-0}
    if [ "$hits" -gt 0 ]; then
      fan_out=$((fan_out + 1))
      refs="$refs $sym2"
    fi
  done < "$TMP_INV"
  echo "$target,$sym,$start,$end,$fan_out,${refs# }"
done < "$TMP_INV"
