---
date: 2026-10-04T12:00:56+02:00
git_commit: 77c7182f523f36dc9a259d229e1908198ef4fed1
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Per-run style spans (inline styles/marks) for text composition"
tags: [research, codebase, text-composition, marks, style-spans, milestone-4-prep]
status: complete
---

# Research: Per-run style spans (inline styles/marks) for text composition

## Research Question

Inline styles (marks) are not measured: a mark that changes advance
widths (observed: "bold" style with wdth=max) renders wider than
measured — line breaks don't move and lines overflow (ROADMAP,
"When cases arise"). How do marks flow from the document model to
per-run rendering, what resolved per-run style DATA exists, and how
ready are the Measurer / segmenter / applicator / controller for
per-run measurement?

## Summary

The news is mostly good — most pieces are already per-run:

- **Runs are already style-uniform for free**: the document model is
  ProseMirror-shaped; text nodes carry `marks`, and PM semantics keep
  adjacent text with different mark sets as separate text nodes. Mark
  boundaries coincide with the segmenter's leaf boundaries — no
  segmenter change needed for the common case.
- **Measurer: READY.** Fully parameterized per call
  (font/axes/features/language/direction); caches keyed accordingly;
  mixed-style paragraphs cost only cache-key diversity within existing
  LRU bounds.
- **Applicator: READY.** Composed line spans are already per-run
  slices nested inside the run's mark wrappers; per-run CSS keeps
  coming from the existing stylers.
- **Resolved per-style-link values exist AS DATA**:
  `styleLinkProperties@<typeSpecPath>/<linkType>/<linkName>` →
  `StyleLinkLiveProperties.typeSpecnion` (a PatchedScopeProperties
  over the typeSpec cascade) with `getProperties()` /
  `getPropertyValuesMap()` — resolved `specific/font`,
  `axesLocations/<tag>` (font-dependent synthetics resolved),
  features, language, fontSize. This is what UIDocumentStyleStyler
  turns into CSS.

The two real gaps:

1. **No per-run aggregate**: resolution granularity is per STYLE LINK
   (per mark type/intent), not per run. A run with several marks gets
   several independent styleLink stylers; the cross-mark merge (and
   the merge with the run's base element style) happens ONLY in the
   DOM via CSS cascade. Text runs build no nodeProperties scope of
   their own (explicitly scope-less; the dispatcher answers with the
   parent element's scope).
2. **Controller ignorance + ingredients gap**: `composeTextblock`
   derives measurement inputs ONCE per textblock (comment: "v1 keeps
   them uniform per textblock — per-RUN values come with per-run
   style spans", composition-controller.ts:376-384); `_buildInlineItems`
   never reads `marks` (274-280); the input-equality ingredients
   (457-493) contain no per-run style values, so a mark style change
   would not invalidate composition.

## Detailed Findings

### Document model: marks split text nodes

- Text nodes carry a `marks` collection (metamodel:
  `textDraft.get("marks")`, prosemirror/integration.test.mjs:88-92;
  consumed in document-nodes-meta/derivations.mjs:426).
- The meta layer re-provisions the text-run attachment when marks
  change ("Mark additions/removals must re-provision the text run",
  document-nodes-meta/index.mjs:266-269; viewer mapping "marks",
  viewer.typeroof.jsx:990).
- `_buildInlineItems` (composition-controller.ts:265-297) reads only
  `text` for typeKey "text" — marks are never inspected.

### Mark → style link → style patch → resolved values (data)

1. `getWrapMarks` (document-nodes-meta/derivations.mjs:418-504 —
   pure, no DOM): mark descriptors `{kind, tag, markType,
   styleLinkName, styleLinkType, ...}`. Schema marks ("bold") →
   `styleLinkType: "markStyleLinks"`, `styleLinkName: markType`;
   intents ("generic-style") resolve via `intentStyleLinks` keyed by
   `data-style-name`. Effective (inherited) links:
   `getEffectiveStyleLinks` (prosemirror/type-spec.typeroof.jsx:1919).
2. Edge models: type-spec/models.mjs — `SimpleStylePatchModel`
   (309-328, incl. `axesLocations`), `IntentStylePatchLinkModel`
   (~382-389, adds `tag`), `MarkStylePatchLinkModel` (~393-396);
   attached to TypeSpecModel at 525-526. (`MarkSpecMapModel`/
   `MarkSpecPropertiesManager` are schema model + editor UI, not
   style resolution.)
3. Edges enter the typeSpecnion stream: `styleLinksGen`
   (properties-generators.mjs:392+) yields per-typeSpec-scope edges;
   whole-edge override; `mode: 'unlinked'` yields a null tombstone.
4. Per-edge live properties: meta.typeroof.jsx (~92-165) provisions
   one `StyleLinkLiveProperties` per effective edge, registering
   `styleLinkProperties@<typeSpecPath>/<field>/<key>` with deps
   `stylePatchProperties@<sourcePath>/<key>` + `typeSpecProperties@…`.
5. Patch → property map: `StylePatchSourceLiveProperties`
   (live-properties.typeroof.jsx:227-348) runs
   STYLE_PATCH_PROPERTIES_GENERATORS (properties-generators.mjs:645-670)
   incl. `axisMathLocationsGen` — yields `axesLocations/<tag>` with
   symbolic min|max|default resolved against the font's axisRanges
   via SyntheticValue (322-361).
6. Merge: `StyleLinkLiveProperties.update`
   (live-properties.typeroof.jsx:351-418):
   `typeSpecnion.createPatched(patchMap)` → PatchedScopeProperties
   (scope-resolution.mjs:365+, 462-481) layered over the typeSpec's
   inheritable + parent-context maps. Consumed as
   `.typeSpecnion.getProperties()` / `.getPropertyValuesMap()`.

### CSS generation (the existing consumer)

- `UIDocumentStyleStyler.update` (prosemirror/type-spec.typeroof.jsx:
  1008-1094): reads the resolved map (1018-1022), writes font-family,
  --units-per-em/--ascender/--descender, colors, and typographic CSS
  via `setTypographicPropertiesToSample`
  (actors/properties-util.mjs:33-81: font-size,
  font-variation-settings from `axesLocations/<tag>`,
  font-feature-settings, language tag).
- A data-level axis extractor already exists: `getAxesLocations`
  (actors/properties-util.mjs:101-113).
- The run's base (unmarked) style: the enclosing element's styler
  (`UIDocumentElement`, viewer.typeroof.jsx:247+) from its
  `nodeProperties@<documentNodePath>` scope (325-332); mark wrappers
  nest inside, CSS-cascade merging base + marks.

### Meta tree: text runs are scope-less

- Meta nodes exist for inline text (`DocumentNodesMetaTextRun`,
  document-nodes-meta/index.mjs:261-310) but explicitly build NO
  scope (1066-1085: "a text run builds no scope of its own; the
  dispatcher answers consumers with the parent element's scope").
- Element scopes: `DocumentNodeProperties` wraps
  `HierarchicalScopeNodeProperties.createFromParentMap` (index.mjs:664),
  registered as `nodeProperties@<rootPath>` (935-1055).
- `UIDocumentTextRun` maps no nodeProperties@ at all
  (viewer.typeroof.jsx:556-575) — only `text` and `composition@`.

### Measurer (text-composition/measurer.ts)

- `measureEm(font, axesEntries, axesKey, featuresEntries, featuresKey,
  language, direction, text)` (146-155): all style dimensions per-call.
- Caches: hbFonts `fullName -> axesKey -> hb.Font` (cap 32 locations
  per font); widths keyed `[fullName, axesKey, featuresKey, language,
  direction, text]` (cap 50k, LRU). Sparse normalized axes keys
  (explicit default == unset).
- Key derivation from a properties map: `axesEntriesOf` /
  `axesKeyOf` (keys `axesLocations/<tag>`), `featuresEntriesOf` /
  `featuresKeyOf` (keys `opentype-features/<tag>`) — NOTE the
  openTypeFeatures vs opentype-features key prefix question for the
  plan (controller reads nodeProperties; styleLink maps may differ).
- Mixed fonts/axes in one paragraph: works by construction; a miss
  costs one HarfBuzz shape; hb.Font churn bounded per font.

### Contract vs pipeline (composition-types.ts)

- `TextStyle {fontKey, fontSizePt}`, `StyleSpan {start, attributes}`,
  `Paragraph {text, styles}` (55-76) anticipate style spans;
  "segmentation at style boundaries" (80); mixed fonts/sizes in the
  Units note (18-24). BUT Paragraph/StyleSpan are not imported
  anywhere — the pipeline uses HostSegment.sourceIndex + per-leaf
  offsets. `TextStyle.fontKey` is opaque; the structured measurement
  tuple lives Host-side.

### Applicator (viewer.typeroof.jsx)

- Run finds its payload leaf by path: `leaves.findIndex(l => l.path
  === myPath)` (659-661). Per line, keeps only own segments
  (`segments[i].sourceIndex === leafIndex`, 670-674); a line spanning
  runs renders as one slice per run; a run spanning lines yields
  multiple spans in its carrier. Text slice:
  `this._text.slice(segment.start, segment.end)` (702-708).
- Carrier: innermost mark wrapper when marks exist (633-635), else a
  carrier span (605-613); application is wholesale
  `carrier.replaceChildren(...)` (640) — throwaway spans.

### Ingredients / invalidation (composition-controller.ts:457-493)

Today: `[font, algorithmKey, algorithmConfig, axesKey, featuresKey,
language, direction, fontSizePt, lineWidthPt, hyphenationEnabled,
minWordLength, minBefore, minAfter, hyphenationPattern,
leafTexts.join("")]` — all textblock-level. Per-run style tuples
must enter here ("what we CONSUME is what invalidates"), else mark
style changes recompose nothing.

## Code References

- `lib/js/components/layouts/type-stage/text-composition/composition-controller.ts:265-297` — `_buildInlineItems` (marks not read)
- `…/composition-controller.ts:367-384` — per-textblock measurement inputs ("v1 uniform" comment)
- `…/composition-controller.ts:457-493` — ingredients filter
- `…/text-composition/measurer.ts:146-188` — measureEm + caches
- `…/text-composition/segmenter.ts:66-70` — InlineItem taxonomy (no style field)
- `…/document-nodes-meta/derivations.mjs:390-412` — getStyleLinkPropertiesId
- `…/document-nodes-meta/derivations.mjs:418-504` — getWrapMarks (pure mark→descriptor pipeline)
- `…/live-properties.typeroof.jsx:351-421` — StyleLinkLiveProperties (createPatched merge, getPropertyValuesMap)
- `…/live-properties.typeroof.jsx:227-348` — StylePatchSourceLiveProperties (patch → resolved map incl. font-dependent axes)
- `…/document-nodes-meta/index.mjs:1066-1085` — text runs are scope-less
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:1008-1094` — UIDocumentStyleStyler (data → CSS)
- `lib/js/components/actors/properties-util.mjs:33-113` — setTypographicPropertiesToSample, getAxesLocations
- `lib/js/components/type-spec/models.mjs:309-404` — style patch + link models

## Open Questions

1. **Multi-mark merge order/semantics at data level**: the DOM merges
   base + marks via CSS cascade in wrapper-nesting order. The
   data-level equivalent (layering PatchedScopeProperties per mark
   over the base scope) needs a defined order — getWrapMarks' wrapper
   order is the candidate; is it always the CSS-effective order?
2. **Key-prefix alignment**: the measurer helpers read
   `axesLocations/<tag>` and `opentype-features/<tag>` from the
   nodeProperties map; confirm the styleLink propertyValuesMap uses
   the same keys (UIDocumentStyleStyler reads `axesLocations/<tag>`;
   features via the same generator?) — small but load-bearing.
3. **Where the controller resolves per-run links**: getWrapMarks
   needs `markSpec`, `context.pathOfTypes`, `typeSpecPropertiesPath`
   — available in the meta element context (viewer has
   `this._context`); what does the meta expose to composeTextblock?
4. **fontSize per run**: patches can carry relativeFontSize — the pt
   conversion (× fontSizePt) becomes per-segment; diagnostics/line
   height implications for the applicator?
5. **inlineContainer + marks**: children of inline containers are
   separate leaves — do containers carry their own style (link as
   inline block with a style)? v0 may treat container text as
   unstyled; document the limitation or cover it.
