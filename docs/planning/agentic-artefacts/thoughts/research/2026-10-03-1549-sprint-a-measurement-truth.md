---
date: 2026-10-03T15:49:54+02:00
git_commit: 4fd576d1
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Sprint A: measurement truth (per-run fonts, current axes location, property-aware filtering)"
tags: [research, codebase, text-composition, type-stage, fonts, axes, properties]
status: complete
---

# Research: Sprint A — measurement truth

## Research Question

How do per-run fonts and current axes locations resolve through
type-stage, so the Measurer can shape with the true font at the true
axes location? Plus: the inventory for property-aware recomposition
filtering (ride-along). Context: text-composition ROADMAP Sprint A
(docs/planning/text-composition/ROADMAP.md), milestone 1 concluded
at 8873b80e; v0 simplifications: root font object (/font), default
axes location.

## Summary

Both resolutions are already carried by the properties stream — no new
infrastructure:

- **Font**: the font OBJECT (VideoProofFont with .hbFace, .axisRanges,
  .fontObject.unitsPerEm, .fullName) travels the properties stream as
  `specific/font` (fontGen, properties-generators.mjs:32-39); the
  fallback when a typeSpec has no own font is the root font
  (typeSpecGetFontMethod, type-spec.typeroof.jsx:75-84). Inheritance of
  an unset font happens in the typeSpecnion cascade.
- **Axes**: resolved per-node values are in the getProperties() maps as
  `axesLocations/<tag>` numbers (axisLocationsGen,
  properties-generators.mjs:169-186), incl. autoOPSZ → opsz =
  resolved generic/fontSize. videoproof-array already shapes at such
  resolved locations (setVariations pattern,
  videoproof-array.mjs:1206-1217).
- **Where to read them**: the composition drive already receives the
  textblock's nodeProperties payload; the typeSpec-level values come
  from the typeSpecnion properties (the same map the stylers merge via
  CascadingMap — node over typeSpec).
- **Property-aware filtering**: NO key-wise property diff exists
  anywhere today; scope rebuilds are identity-coarse (any typeSpec
  field change rebuilds). A diff hook is new code (scope level or
  drive level).

## Detailed Findings

### 1. Font resolution chain

- typographyFontMixin (type-spec/models.mjs:188-222): installedFonts
  (InternalizedDependency), activeFontKey (ForeignKey, ALLOW_NULL,
  CUSTOM constraint — unset → ForeignKey.NULL), font (ValueLink of
  activeFontKey → InstalledFontModel entry).
- fontGen (properties-generators.mjs:32-39) yields
  `specific/font` → **the font OBJECT** (ValueLink's dereferenced
  VideoProofFont), only when the typeSpec has an own font; inheritance
  via the typeSpecnion cascade (models.mjs:219-221 note).
- Consumer precedent: typeSpecGetFontMethod
  (type-spec.typeroof.jsx:75-84) — `specific/font` from the
  propertyValuesMap, else `this.getEntry("rootFont").value` (the
  `/font` app root font, main-model.mjs:158,171).
- VideoProofFont shape (model/font.mjs:223-419): `.hbFace` (lazy
  hb.Blob→hb.Face, cached, :399-407), `.axisRanges` (lazy, frozen,
  {min,max,default,name} per tag, :361-368), `.fullName`,
  `.fontObject.unitsPerEm/.ascender/.descender` (font-info.mjs:278-310).
- Measurer implication: per-run font = `specific/font` from the
  resolved properties (fallback root font); cache key must include the
  font identity (fullName or the object itself — the existing
  Measurer keys by fullName + text; with per-run fonts the key gains
  the axes location too, see below).

### 2. Axes location flow

- Model: AxesMathAxisLocationsModel (axes-math-models.mjs:180-203),
  autoOPSZ coherence deletes stored opsz when auto
  (models.mjs:320-324).
- Stream: axisLocationsGen (properties-generators.mjs:169-186) yields
  `axesLocations/<tag>` numbers; autoOPSZ aliases
  `axesLocations/opsz` = resolved generic/fontSize (SyntheticValue,
  :175-180); fontSizeGen BEFORE axisLocationsGen (:588-589).
  AxesMath logical values (default|min|max) resolve against
  font.axisRanges via SyntheticValue (properties-generators.mjs:
  283-322). `axesLocations/<tag>/logicalValue` sub-keys exist but are
  SyntheticValue inputs only (skipped by the DOM setter,
  properties-util.mjs:59-61).
- Resolved per-node values: in the getProperties() maps
  (scope-resolution.mjs:69-71) — same maps the viewer stylers merge
  (type-spec.typeroof.jsx:367-374) and feed to
  setTypographicPropertiesToSample (properties-util.mjs:33-86).
- Shaping at a location: `new harfbuzz.Variation(tag, value)` +
  `hbFont.setVariations(...)` (videoproof-array.mjs:1206-1217,
  _toHBVariations helper; videoproof-contextual/layout.mjs:49-54).
- Measurer implication: cache key gains the axes tuple
  (text, font, axesKey); hbFont instances per (font, axesKey) —
  setVariations per cached hbFont.

### 3. Where the drive reads them

- The composition drive (DocumentNodesMetaElement._driveComposition,
  document-nodes-meta/index.mjs) passes the scope component; its
  getProperties() is the node cascade (CascadingMap local/typeSpec/
  parent, node-properties.mjs:157,192). Whether `specific/font` and
  `axesLocations/*` are visible through the NODE scope (vs. the
  typeSpecnion payload directly) must be verified at implementation
  — the stylers merge both channels explicitly (CascadingMap of
  nodeProperties over typeSpecnion.getProperties(),
  type-spec.typeroof.jsx:367-374); the drive can do the same (it has
  the scope component, and typeSpecProperties@ ids resolve via
  getTypeSpecPropertiesIdMethod if needed).

### 4. Property-aware filtering inventory

- Relevant to line breaking: generic/fontSize (+baseFontSize,
  relativeFontSize), specific/font, axesLocations/* (+generic/autoOPSZ),
  opentype-features/*, language/*, layout/availableWidth(+Height),
  layout/width, layout/columnWidth, layout/columnGap,
  layout/paddingInline*, leading/*/line-height-em,
  layout/leading/line-height-em, generic/textAlign, generic/direction,
  horizontalLayout/* (+generic/columnCount, lineLength, inlineMargins,
  columnGutter, blockMargins).
- Irrelevant (styler-only): colors/*, intentStyleLinks/*,
  markStyleLinks/*.
- NO key-wise diff exists anywhere; rebuilds are identity-coarse
  (document-nodes-meta/index.mjs:619-644,
  live-properties.typeroof.jsx:113-124). Scopes are immutable after
  construction, so any rebuild propagates as "changed" to all
  identity-comparing consumers.
- Hook options (for the plan): (a) the drive compares the relevant
  keys of old vs new scope maps before composing; (b) a
  composition-relevance predicate in the scope layer. (a) is local
  to text-composition; (b) is shared machinery.

## Code References

- `lib/js/components/type-spec/models.mjs:188-222` — typographyFontMixin
- `lib/js/components/layouts/type-stage/properties-generators.mjs:32-39` — fontGen (specific/font = font object)
- `lib/js/components/layouts/type-stage/properties-generators.mjs:169-186` — axisLocationsGen (autoOPSZ→opsz alias)
- `lib/js/components/layouts/type-stage/properties-generators.mjs:283-322` — axesMath logical value resolution
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:75-84` — typeSpecGetFontMethod (specific/font, root fallback)
- `lib/js/model/font.mjs:223-419` — VideoProofFont (.hbFace, .axisRanges, .fontObject)
- `lib/js/components/actors/videoproof-array.mjs:1206-1217` — setVariations shaping at resolved location
- `lib/js/components/actors/videoproof-contextual/layout.mjs:44-69` — measureWordWidths pattern
- `lib/js/components/layouts/type-stage/scope-resolution.mjs:69-92` — getProperties / memoized identity projections
- `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:619-644` — identity-coarse rebuild guard

## Follow-up Notes (2026-10-03, review)

- **Property-aware filtering reframed**: the composition-relevant
  property set IS the set the measurement consumes (font, axes,
  features, language, fontSize, width) — "if we consume it to
  calculate the composition, it's relevant". The filter is therefore
  not a hand-maintained list but the input equality check: assemble
  the paragraph's measurement ingredients, compare old vs new, skip
  recomposition when unchanged. Hook: drive-level comparison of
  consumed values (option a), emerging from input assembly. The
  relevant/irrelevant inventory above stays as documentation, but
  the implementation doesn't enumerate it.

## Follow-up Decisions (2026-10-03, review session)

1. **Q1 RESOLVED — no channel merging.** The node scope's effective
   propertyValuesMap includes the typeSpec layer between local and
   parent (CascadingMap local/typeSpec/parent,
   node-properties.mjs:185-196): `specific/font`, `axesLocations/*`,
   `generic/fontSize` are all readable from the payload the drive
   already receives (the next-sibling margin computation reads
   generic/fontSize the same way).

2. **Q2 RESOLVED — cache keys.** All axes matter (any axis can
   affect advances). hbFont cache: plain Map (NOT WeakMap — font
   object lifecycle is not guaranteed) keyed by font.fullName, then
   axesKey. axesKey = SPARSE normalized form: "tag=value" pairs in
   tag order, OMITTING axes whose resolved value equals
   font.axisRanges[tag].default — semantically identical to the full
   form (unset == default), compact for many-axis parametric fonts
   (Amstelvar AVAR2 already has a lot; per David Berlow axes are
   basically free and will become more), still correct for fully-set
   keys. If key parsing/comparison ever gets hot at scale, a TRIE
   structure over the tags is the noted scale-out option. Width
   cache: (fullName, axesKey, text) -> em, flat Map, font units
   (size-independent).
3. **Q3 RESOLVED by reframe (see Follow-up Notes)**: drive-level
   input equality over consumed values; no separate filter hook.

## Open Questions

1. Are `specific/font` and `axesLocations/*` visible through the node
   scope's getProperties() directly, or must the drive merge the
   typeSpecnion channel like the stylers do (CascadingMap node over
   typeSpec)? (Verify at implementation start.)
2. Axes-cache key shape: full axes tuple per (font, paragraph) vs.
   per-document cache of locations (axes usually constant per
   typeSpec — a location→hbFont memo per font may suffice).
3. Filtering hook placement: drive-level key compare (local) vs.
   scope-level relevance predicate (shared) — plan decision.
