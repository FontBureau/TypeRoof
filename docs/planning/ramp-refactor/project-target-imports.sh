#!/usr/bin/env bash
# Estimate external (../) and sibling imports under the proposed 14-file layout.
# Method: for each target file, take its constituent source files in the current split,
# collect the union of their external imports (deduped by "symbol, path") and the
# resulting sibling edges to OTHER target files.
cd ~/TypeRoof/lib/js/components/layouts/ramp || exit 1

# target_file : space-separated list of current files that merge into it
declare -A TARGETS=(
  ["index"]="index.typeroof.jsx"
  ["pps-maps"]="typespec-pps-map.mjs nodespec-pps-map.mjs"
  ["defaults"]="type-spec-get-defaults.mjs"
  ["synthetic-values"]="synthetic-value.mjs fill-tree-from-paths.mjs path-spec-gen.mjs"
  ["properties-generators"]="get-type-spec-defaults-map.mjs"
  ["type-specnion"]="base-type-specnion.typeroof.jsx"
  ["live-properties"]="type-spec-live-properties.typeroof.jsx style-patch-source-live-properties.typeroof.jsx style-link-live-properties.typeroof.jsx"
  ["meta"]="type-spec-meta.typeroof.jsx style-patch-sources-meta.typeroof.jsx type-spec-children-meta.typeroof.jsx style-links-meta.typeroof.jsx"
  ["shared"]="base-by-path-container-component.typeroof.jsx"
  ["tree-editor"]="base-tree-editor.typeroof.jsx type-spec-tree-editor.typeroof.jsx"
  ["type-spec-properties"]="type-spec-properties-manager.typeroof.jsx ui-font-label.typeroof.jsx"
  ["style-patches"]="ui-style-patches-map.typeroof.jsx ui-style-patch.typeroof.jsx ui-composite-style-patch.typeroof.jsx ui-composite-style-patch-item.typeroof.jsx style-patch-properties-manager.typeroof.jsx simple-select.typeroof.jsx map-select-button.typeroof.jsx"
  ["node-specs"]="ui-node-spec-map.typeroof.jsx node-spec-properties-manager.typeroof.jsx"
  ["prosemirror"]="prose-mirror-context.typeroof.jsx ui-document.typeroof.jsx ui-document-nodes.typeroof.jsx ui-document-node.typeroof.jsx ui-document-element.typeroof.jsx ui-document-element-type-spec-drop-target.typeroof.jsx ui-document-text-run.typeroof.jsx generic-updater.mjs prose-mirror-general-document-styler.typeroof.jsx"
)

# Build reverse lookup: current file -> target name
declare -A FILE_TO_TARGET
for t in "${!TARGETS[@]}"; do
  for f in ${TARGETS[$t]}; do
    FILE_TO_TARGET["$f"]="$t"
  done
done

total_ext=0
total_sib=0

echo "=== PROJECTED PER-FILE IMPORTS (14-file layout) ==="
for t in index pps-maps defaults synthetic-values properties-generators type-specnion live-properties meta shared tree-editor type-spec-properties style-patches node-specs prosemirror; do
  members="${TARGETS[$t]}"
  # dedupe external imports across members: extract "FROM path" key
  ext=$(for f in $members; do
          grep -hE "^import.*from [\"']\.\./" "$f" 2>/dev/null | sed -E "s|.*from [\"'](\.\./[^\"']+)[\"'].*|\1|"
        done | sort -u | wc -l)
  # sibling edges: resolve each sibling import to its NEW target, exclude self
  sib=$(for f in $members; do
          grep -hE "from [\"']\./" "$f" 2>/dev/null | sed -E "s|.*from [\"']\./([^\"']+)[\"'].*|\1|"
        done | while read ref; do
          # match "name" or "name.ext" to a current file
          for cand in "${ref}" "${ref}.mjs" "${ref}.typeroof.jsx"; do
            if [ -n "${FILE_TO_TARGET[$cand]:-}" ]; then
              echo "${FILE_TO_TARGET[$cand]}"
              break
            fi
          done
        done | sort -u | grep -v "^${t}$" | wc -l)
  printf "%-25s members=%-2d external=%-2d sibling=%d\n" "$t" "$(echo $members | wc -w)" "$ext" "$sib"
  total_ext=$((total_ext + ext))
  total_sib=$((total_sib + sib))
done

echo ""
echo "=== PROJECTED TOTALS ==="
echo "files=14"
echo "  external (../) =$total_ext"
echo "  sibling (./)   =$total_sib"
echo "  grand total    =$((total_ext + total_sib))"
