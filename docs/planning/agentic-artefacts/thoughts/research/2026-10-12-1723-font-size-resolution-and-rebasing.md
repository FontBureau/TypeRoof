---
date: 2026-10-12T17:23:03+02:00
git_commit: 0df81838198c5d5977cccf4e6115189a4d27f461
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Font-size resolution & re-basing (relativeFontSize units & nodeProperties basis threading)"
tags: [research, codebase, font-size, type-spec, node-properties, composition, inline-nodes]
status: complete
---

# Research: Font-size resolution & re-basing

Research cycle for the inline-node refinements roadmap
(`docs/planning/inline-node-refinements/ROADMAP.md`, approach (a), RPI
kick-off step 2, scopes (i)-(v)). Four parallel read-only sub-agents:
fontSize family + inline/patch basis; nodeProperties channel;
em/baseEm/en resolution sites; migration blast radius. This documents
what IS, not what should be.

## Research Question

Where and how fontSize / baseFontSize / relativeFontSize are synthesized
and consumed (i); how the nodeProperties scope is composed and threaded
(ii); every em/baseEm/en resolution site and its assumed basis (iii);
the inline-node and patch scope basis today (iv); and the migration
surface for a unit-carrying relativeFontSize (v).

## Summary

1. fontSize is purely synthetic: baseFontSize x relativeFontSize
   (fontSizeGen, properties-generators.mjs:233-238). Every downstream
   consumer (layout math, margins, runion boundaries, per-run
   measurement, the styler's outer-element write) receives the
   pre-flattened plain number. Nothing strips units: a unit-carrying
   relativeFontSize would flow into the bare multiplication unchanged
   and corrupt every fontSize consumer.
2. The only plain-factor arithmetic on relativeFontSize is the
   fontSizeGen multiply itself (live) plus legacy paths
   (models.mjs:269-272 design comment; videoproof-controller.mjs). The
   live LeadingRunion removed the /relativeFontSize division entirely
   (node-properties-generators.mjs:666-674).
3. The nodeProperties channel is confirmed as the basis vehicle:
   per-node scopes cascade local > typeSpec > parent, the parent layer
   IS the parent's control-projected settled map (cascade nesting =
   inheritance), and generic/fontSize is readable from any node scope
   (the emAfter sibling lookup proves it). A node-em against the
   containing node's scope is addressable today.
4. Inline nodes have no dedicated font machinery: no nodeSpecToTypeSpec
   entries for cite/bdi/generic-inline; the empty link is
   origin-anchored and the resolver walks up to the root
   (integration.typeroof.jsx:226-231).
5. Patch scopes have no parent: baseFontSize inside a patch resolves
   from the patch's own fields, else the origin typeSpecnion's defaults
   layer (createPatched / PatchedScopeProperties); the merged
   style-link scope that measurement reads layers the patch over the
   containing typeSpec.
6. Migration is non-breaking at document scope: all stored values are
   plain-number strings (no em-intent values exist); a baseEm migration
   reproduces today's arithmetic exactly. The blast edges are
   patch-scope basis asymmetry, explicit 1 vs unset, and JSON string
   parsing (14 source files + operator downloads).
## Detailed Findings

### 1. The fontSize family: declaration, registration, synthesis, consumption

**Registration & defaults** (`lib/js/components/registered-properties.mjs`,
GENERIC map starts :229):
- fontSize :305-313 — inherit: true, unit 'px' (comment "// ??? why not
  PT??"), default 36, min 0.
- baseFontSize :314-322 — inherit: true, unit 'pt', default 12.
- relativeFontSize :323-330 — inherit: true, NO unit, default 1,
  step 0.01.

**Model** (`lib/js/components/type-spec/models.mjs:184-188`):
['baseFontSize', FontSizeModel] "// in PT" and ['relativeFontSize',
FontSizeModel] ("in em i.e. relative to baseFontSize, no unit, will be
multiplied with baseFontSize"). fontSize has NO model field anywhere in
TypeSpecModel — it exists only as a synthetic.

**Synthesis** (`lib/js/components/layouts/type-stage/properties-generators.mjs`):
- baseFontSizeGen :195-202 — yields generic/baseFontSize and
  generic/relativeFontSize from the host instance when non-empty.
- fontSizeGen :209-244 — returns when BOTH args are empty
  (inherited/default is "just as good"); else yields
  ['generic/fontSize', SyntheticValue(calculate, ['generic/baseFontSize',
  'generic/relativeFontSize'])] (:240) with calculate (:233-238):
  baseFontSize * (relativeFontSize ?? 1); null if base is null.
- Generator lists: TYPE_SPEC_PROPERTIES_GENERATORS :657-674 (fontSizeGen
  must precede axisLocationsGen :666-667); STYLE_PATCH_PROPERTIES_GENERATORS
  :676-700 reuses both, with a FIXME about patch semantics (:687-692).
- Same-file consumer: axisLocationsGen :255 — autoOPSZ writes
  axesLocations/opsz <- generic/fontSize (also axisMathLocationsGen :410).

**Root defaults map** (`lib/js/components/layouts/type-stage/defaults.mjs`):
getTypeSpecDefaultsMap() :173 runs the generators against a default
TypeSpecModel draft and freezes (:261-271) — the defaults map therefore
contains a synthesized generic/fontSize = 12 (base 12 x 1);
seedTypeSpecDefaults :26-43 adds specific/font and layout dims.

**Per-run measurement**
(`lib/js/components/layouts/type-stage/text-composition/composition-controller.ts`):
- :803-805 — textblock fontSize = nodeProperties.get(generic/fontSize)
  with hard fallback 12 when not a number (warned at :880-884).
- :902-917 — leaf styles read each leaf's styleLinkProperties@ payload
  (payload.typeSpecnion.getProperties(), :913-915):
  leafFontSize = properties.get(generic/fontSize) (:917), falling back
  to the textblock value (:930-933). This is the roadmap's anchor —
  measurement reads the MERGED style-link scope, not the raw patch.
- :1088-:1380 — style.fontSizePt scales advanceEm/hangingEn widths;
  :1453-1463 documents "COMPUTED font size (fontSizePt is the
  fontSizeGen synthetic base x relative)". Measurer caching keys by
  fontSizePt / unitsPerEm (measurer.ts:7-8).

**DOM writes** (`lib/js/components/prosemirror/type-spec.typeroof.jsx`,
UIDocumentTypeSpecStyler):
- :576-584 — outer element font-size in pt from
  propertyValuesMap.get(generic/fontSize) ("that way, we can use EM
  also on the outer element").
- :552-571 — nextNodeProperties@ margin-end branch:
  nsProps.get(generic/fontSize) + leading/line-height-em ->
  lineHeightAfter / emAfter in pt.
- Outfitter FIXME :340-351 — "currently using baseFontSize would break
  the least existing code ... em is calculated in the parent and the
  descendant inherits the absolute value".
### 2. Inline nodes & patch scope basis today

**nodeSpecToTypeSpec** (`lib/js/components/layouts/type-stage/index.typeroof.jsx:263`):
seeded from lib/assets/type-stage-initial-state.json — entries exist for
section, heading-1..3, paragraph, paragraph-2, p2russian, p2greek; NONE
for cite/bdi/generic-inline. Ingest rules map them as inline nodes
(lib/js/wikipedia/ingest.ts:1363, :1371).

**Resolution & root fallback**
(`lib/js/components/prosemirror/integration.typeroof.jsx`):
- getTypeSpecPropertiesIdMethod :181-296 — a missing entry yields
  typeSpecLink = "" (:226-227); "An empty link '' is origin-anchored by
  construction ... fallback to root (root-of-self)" (:229-231).
- _getBestTypeSpecPropertiesId :112-165 walks UPWARDS to
  originTypeSpecPath (testPath.slice(0, -2) per step, :164), returning
  the first registered typeSpecProperties@... level.
- Meta-layer equivalent: root delegation
  nodeProperties@${originTypeSpecPath} with the root's control-projected
  map (document-nodes-meta/index.mjs:1286-1296).
- Inline classification is shape-based, not spec-based:
  specChildrenInInlineContext (document-nodes-meta/derivations.mjs:45-55,
  /\binline\b/ content-expression test), determineUnknownType :57-118
  (unknown_block vs unknown_inline). There is NO special inline
  font-size path — inline nodes ride the same fallback walk as blocks.

**Patch scope has no parent**
(`lib/js/components/layouts/type-stage/live-properties.typeroof.jsx`):
- StylePatchSourceLiveProperties :225-344 — its generator-facing API has
  hasParentProperty: () => false and a getParentProperty that THROWS
  (:243-251). baseFontSize in the patch's own map comes only from the
  patch's own fields.
- The MERGED style-link scope (StyleLinkLiveProperties :347-420) reads
  stylePatchProperties@ + typeSpecProperties@ and builds
  typeSpecnion.createPatched(patchMap) (:401-404) — createPatched
  (scope-resolution.mjs:462-483) -> PatchedScopeProperties (:370-414):
  cascade local (patch) > originOutboundProjection > parentContext
  (inherited + typeSpecDefaultsMap) — "a derived view of its origin
  scope, not a link in the hierarchy" (:371-389). The defaults layer is
  the documented model-default fallback.
- In-test documentation of the asymmetry: explicit relativeFontSize 1
  in patch scope != unset because the patch scope's baseFontSize
  resolves to the MODEL default, not the document cascade
  (lib/js/tests/text-composition/index.test.mjs:984-988).
- style-patches.typeroof.jsx:298-299 — the removeItems set for
  baseFontSize in the patch UI is EMPTY today.

**styleLinkProperties@** (document-nodes-meta/derivations.mjs:389-405):
the id points at the node's resolved typeSpec path extended by the
style-link edge — i.e. the typeSpec + merged patch scope that
measurement reads. Callers: viewer.typeroof.jsx:911-923,
composition-controller.ts:215, :664, :913-915, type-spec.typeroof.jsx:1210-1218.

### 3. The nodeProperties channel (basis-threading vehicle)

**Registration ids** (document-nodes-meta/index.mjs unless noted):
- nodeProperties@<documentNodePath> — registered on the dispatcher in
  _createWrapper settings :479 (payload = nodeProperties getter :371 ->
  _scopeLikePayload :266).
- rootNodeProperties@ — every dispatcher maps
  [nodeProperties@${originTypeSpecPath}, "rootNodeProperties@"]
  :490-493; guaranteed chain endpoint.
- @parentNodeProperties (trigger-only) :1058 — declared so a parent
  scope rebuild re-triggers this component's update (:1051-1057
  comment); the id is threaded through containers :501-502.
- nextNodeProperties@ — resolveNextNodePropertiesId
  (derivations.mjs:336-347): the next SIBLING's nodeProperties@ id or
  null (last child); wired via typeSpecStylerDependencyMappings
  (:353-384).

**Scope composition** (node-properties.mjs:59-197,
HierarchicalScopeNodeProperties):
- Effective map = CascadingMap([local, typeSpec, parent]) (:190-197) —
  own generated layout facts > own typeSpec/style facts > inherited
  layer. The typeSpecMap host is fed by DocumentNodeProperties.update
  from the resolved typeSpecProperties@<path> (index.mjs:696-699).
- Synthetics (incl. fontSize) are resolved against this same cascade
  (initPropertyValuesMap :186-192, allowParentOnlyResolution = true) —
  which is why the sibling fontSize lookup works
  (derivations.mjs:330-335 design comment).

**Inheritance = cascade nesting** (:32-35): a child is built via
createFromParentMap (:135-153) with the parent layer = the parent's
CONTROL-PROJECTED settled map (ancestorSettledProperties,
index.mjs:401-416; inheritableSettledProperties :644-648;
scope-resolution.mjs:86-138 — inheritance controls applied, TOMBSTONE
withheld). Controls come from DEMARCATION_INHERITANCE generator entries
(NODE_PROPERTIES_INHERITANCE_POLICY :45-48 =
horizontalLayoutConsumptionPolicyGen :482-503 +
blockMarginsConsumptionPolicyGen :745) — they withhold layout/* style
inputs; generic/fontSize is NOT withheld, so the containing node's
effective font-size is present in the layer a child reads.

**Boot races**: child scope build defers until the parent's exists
(:685-694); until built, getProperties() falls back up the dispatcher
chain to the root (empty Map() when transiently null, :609-626). Text
runs are consume-only (no scope of their own, :1226-1254) — the
dispatcher answers the parent element's scope for them (:266-280).

**Consumers**: viewer _createTypeSpecStylerWrapper :398-419 and
_provisionTypeSpecStyler :527-588 (rebuild triggers: properties@,
nextNodeProperties@; own id excluded :565-580); editor
type-spec.typeroof.jsx :768-786 / :861-945 / update :322-395 (own
node > style cascade, node wins :362-374).

**Read order for a value**: own effective map (local > typeSpec >
parent) -> while unbuilt, parent payload chain -> root; descendants
see the control-projected projection, never the raw effective map.
### 4. em / baseEm / en resolution sites and their assumed bases

**Unit vocabularies**:
- BlockMarginUnitModel (type-spec/models.mjs:155-159):
  [...ABSOLUTE_UNITS, 'lineHeight', 'em', 'baseEm', 'lineHeightAfter',
  'emAfter'], default 'lineHeight'. Values are plain numbers/percent in
  a SEPARATE unit field (BlockMarginValueModel :161-171) — the
  pair-shape precedent for a unit-carrying value.
- InlineLengthUnitModel (type-spec/horizontal-layout-models.mjs:28-30):
  [...ABSOLUTE_UNITS, 'em', 'baseEm', 'en', 'baseEn'], default 'en' —
  used for inlineMargins, columnGutter, minPadding, minLineLength (same
  value/unit pair shape :34-40).

**Canonical converter** inlineLengthToPT
(type-spec/fundamentals.mjs:95-118): em -> value x fontSize;
en -> value x 0.5 x fontSize; baseEm -> value x baseFontSize;
baseEn -> value x 0.5 x baseFontSize; absolutes direct; UNKNOWN UNIT
THROWS (:114-117). enToPt/enToPtNumeric :81-87 — en against the
consuming scope's fontSize. Contract test: fundamentals.test.mjs:10-36.

**fontSizeGen's assumption** (properties-generators.mjs:234-238):
relativeFontSize is a plain unitless factor (FontSizeModel, "no unit");
a unit-carrying value would flow into the bare multiplication
UNCHANGED — there is no unit stripping anywhere in the pipeline.
**LeadingRunion en-compensation**:
- Design comment (models.mjs:268-272):
  actuallineLength = lineLengthEn / relativeFontSize — plain-factor
  arithmetic, still the documented TypeSpec-side contract.
- LIVE implementation (node-properties-generators.mjs:560-688):
  calculate(columnWidthPT, fontSizePT) :670-674 —
  actualLineWidthEn = columnWidthPT / (0.5 x fontSizePT), with the
  comment :666-669 "already local en — no relativeFontSize
  normalization". The division is GONE from the live path.
- Legacy: lib/js/legacy/videoproof-controller.mjs :2515-2540,
  :5959-5966, :2599-2602 — pt round-trip instead of the direct
  division, plain numbers throughout.

**Margins**:
- Style channel passthrough (blockMarginsGen,
  properties-generators.mjs:307-329): raw {value, unit} pairs.
- Node channel (createBlockMargin,
  node-properties-generators.mjs:689-700): lineHeight -> value x
  lineHeightEm x fontSize; em -> value x fontSize (own scope);
  baseEm -> value x baseFontSize; lineHeightAfter / emAfter -> NULL
  (deferred to the renderer); absolutes passthrough.
- Renderer (prosemirror/type-spec.typeroof.jsx:535-572): for the *After
  units reads the NEXT SIBLING's scope (nextNodeProperties@):
  lineHeightAfter -> value x nsLineHeightEm x nsFontSize;
  emAfter -> value x nsFontSize; falls back to the own map when the
  sibling dedups to the same TypeSpec (:539-542); last child handled
  by CSS :not(:last-child) (:534-535). Default end margin
  {value: 1, unit: 'lineHeightAfter'} (registered-properties.mjs:388-390).
**Horizontal layout**:
- Manual (manualHorizontalLayoutGen,
  node-properties-generators.mjs:87-207): lengthToPT :128-138 ->
  inlineLengthToPT(fontSize, baseFontSize) — em/en against the
  CONSUMING node's fontSize (:98-106 comment); the old "en transport"
  (convert at the defining scope, re-expand at the consumer) is
  explicitly rejected (:107-110).
- Runion (horizontalLayoutRunionGen :~310-470 +
  horizontal-layout-runion.mjs): boundary in —
  availableWidthPT / (0.5 x fontSizePT) :356-361; solver pure
  plain-number en arithmetic (:196-282); boundary out — enToPtNumeric
  synthetics for lineLength -> columnWidth (:441-449), margins, gutter,
  fullWidth -> width (:425-459), all against the consuming scope's
  fontSize.

**Line-height-em (em ratio) consumers**: actors/line-of-text.mjs:88
(CSS line-height in em), videoproof-contextual/layout.mjs:127-191,
videoproof-array.mjs:1231-1299, :1451-1469;
registered-properties.mjs:71 (default 1.3, inherit: true; unit
'EM'/'EN' labels at :349-373 are metadata only, values plain numbers).

**Flow shape**: every consumer receives already-flattened plain
numbers (fontSize from fontSizeGen, baseFontSize); a unit-carrying
relativeFontSize would be seen by none of them as a unit — it would
corrupt the synthetic upstream.
### 5. Migration blast radius (unit-carrying relativeFontSize)

**Contract to preserve**: fontSize = baseFontSize x relativeFontSize,
with the unset-vs-explicit distinction intact (fontSizeGen returns
early when both args are empty — the inheritance path).

**Stored values — all plain-number JSON strings, no units anywhere**.
The headings chain (h1 4.571428571 -> 64pt at base 14; h2 1.785714286;
h3/t1 1.285714286; t2 explicit "1") is replicated across
lib/js/tests/fixtures/type-stage-default-state.json (base "14"),
type-stage-wikipedia-replacement-state.json (patches carry no
relativeFontSize), lib/js/wikipedia/type-stage-wikipedia-initial-state.json
(sup patch 0.7), lib/assets/type-stage-initial-state.json,
lib/assets/wikipedia-demo.json (small/sup 0.8),
docs/states-library/fixtures/wikipedia-snapshot.json, and four operator
downloads under downloads/ (plus generated mirrors in dist/ and
_site/, not source).

**Tests**:
- lib/js/tests/text-composition/index.test.mjs — the main vehicle:
  setPatchRelativeFontSize helper :905-917; bold/italic -> 2 doubling
  assertions :929-941 (width > before x 1.3, conservative because
  autoOPSZ tracks the doubled size); link -> 2 recomposes nothing once
  consumers are tombstoned :956-963; clear-vs-explicit-1 semantics
  :984-1001 (toBeCloseTo restore); baseFontSize 40 <-> 14 restorations
  :637/:708 and :1433/:1466.
- type-spec/fundamentals.test.mjs:10-36 — em/en vs baseEm/baseEn
  reference values (fontSize 18 = 14 x 1.285714286).
- hyphenation-pattern-languages.test.mjs — baseFontSize 20 at :117,
  :170, :199, :239; 21 at :248.
- live-properties.test.mjs:8-10 — frozen seed generic/fontSize 12,
  generic/baseFontSize 12.
**Probes**: no numeric font-size expectations anywhere.
qa-editor-mark-styling.mjs (sup-shrink regression) logs computedFontSize
(:87) / paragraphFontSize (:94) and asserts only via CONTRACT VIOLATION
console lines; qa-structure-marks.mjs :105/:186/:273 are best-effort
logged observations. For completeness only:
scripts/perf-composition-page.mjs:286-287 mutates relativeFontSize
paths (the OFF-LIMITS perf suite).

**Classification**:
- -> baseEm, non-breaking: every stored value today (N baseEm = N x
  baseFontSize reproduces the current arithmetic at document scope).
- -> em opt-in: none exist today — no fixture, state, or test stores
  an em-intent value.
- Blast edges: (1) patch scope — baseFontSize resolves to the model
  default (12), not the document base (14), already true today
  (index.test.mjs:984-988); a unit value in patch scope multiplies
  against a different reference than in typeSpec scope. (2) explicit
  "1" vs unset (t2) must survive the migration. (3) JSON string
  parsing — a unit suffix changes the parse path in every state file
  (14 source files + 4 downloads + generated mirrors). (4) em-length
  interplay — inlineLengthToPT and the legacy
  lineLengthEn / relativeFontSize paths already resolve against
  base x relative; their basis order is fixed.
## Code References

(Paths relative to repo root; verified 2026-10-12 at 0df81838.)

- lib/js/components/registered-properties.mjs:305-330 — fontSize/baseFontSize/relativeFontSize registration & defaults
- lib/js/components/type-spec/models.mjs:155-188, 268-272 — unit vocabulary, font-size model fields, LeadingRunion design comment
- lib/js/components/type-spec/horizontal-layout-models.mjs:28-62 — InlineLengthUnitModel, value/unit pairs
- lib/js/components/type-spec/fundamentals.mjs:81-118 — enToPt, inlineLengthToPT (canonical unit converter)
- lib/js/components/layouts/type-stage/properties-generators.mjs:195-244, 255, 657-700 — baseFontSizeGen, fontSizeGen, generator lists, opsz synthetic
- lib/js/components/layouts/type-stage/defaults.mjs:26-43, 173 — root defaults map (contains synthesized fontSize 12)
- lib/js/components/layouts/type-stage/node-properties.mjs:32-48, 59-197 — scope composition (local > typeSpec > parent), inheritance policy
- lib/js/components/layouts/type-stage/node-properties-generators.mjs:87-207, 310-470, 560-741 — unit contracts, runion boundaries, LeadingRunion, margins
- lib/js/components/layouts/type-stage/scope-resolution.mjs:86-138, 370-483, 509-546 — settled projection, PatchedScopeProperties/createPatched, defaults fallback
- lib/js/components/layouts/type-stage/live-properties.typeroof.jsx:44-70, 160-215, 225-420 — root scope seeding, patch scope (no parent), style-link merge
- lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs:476-494, 609-727, 1028-1296 — nodeProperties@ registration, rootNodeProperties@, parent delegation, root fallback
- lib/js/components/layouts/type-stage/document-nodes-meta/derivations.mjs:45-55, 57-118, 327-344, 389-405 — inline classification, resolveNextNodePropertiesId, getStyleLinkPropertiesId
- lib/js/components/layouts/type-stage/text-composition/composition-controller.ts:803-933, 1453-1463 — measurement basis, leaf styles, en scaling
- lib/js/components/prosemirror/integration.typeroof.jsx:112-296 — nodeSpecToTypeSpec resolution, origin-anchored root fallback walk
- lib/js/components/prosemirror/type-spec.typeroof.jsx:305-584, 768-945 — UIDocumentTypeSpecStyler.update, outer font-size, nextNodeProperties margins
- lib/js/wikipedia/ingest.ts:1363-1371 — ingest rules mapping cite/bdi to inline-node typeKey
- lib/js/tests/text-composition/index.test.mjs:905-1001 — patch font-size behavior contracts
- lib/js/components/type-spec/fundamentals.test.mjs:10-36 — em/baseEm/en reference-value contract
## Open Questions (feeding /create_plan)

1. **Unit representation**: the length vocabularies carry units as a
   separate field in {value, unit} pairs (BlockMarginValueModel,
   InlineLengthValueModel); relativeFontSize today is a bare number
   (FontSizeModel). A unit-carrying relativeFontSize needs a
   representation decision — and every state file stores values as
   JSON strings, so the parse path changes in all of them.
2. **Patch scope basis** (roadmap OQ4): the patch's own map has no
   parent (baseFontSize falls to the model default), while measurement
   reads the merged style-link scope (patch layered over the
   containing typeSpec, composition-controller.ts:913-917). A
   patch-scope em must be pinned to the basis measurement already
   reads.
3. **Node-em lookup design** (roadmap OQ3): the child's own typeSpec
   layer sits above the parent layer in the cascade and its own
   fontSizeGen recomputes base x relative — a node-em must not
   double-apply the containing node's relative factor. The parent
   layer demonstrably carries generic/fontSize (the emAfter sibling
   lookup reads it), so the channel exists; the design question is
   which read avoids the own-typeSpec re-multiply.
4. **baseFontSize as root-only anchor** (roadmap: "withers to
   root-only?"): no stored mid-tree baseFontSize value breaks under a
   root-only rule, but the property is registered inherit: true and
   the patch-scope default fallback depends on it.
5. **Registered-metadata inconsistencies** (documented, not judged):
   registered fontSize default 36 with unit 'px' (comment "??? why
   not PT??") vs the live seed 12; unit 'EM'/'EN' labels are metadata
   only.
6. **Inline nodes and a1** (roadmap OQ1): confirmed there is no inline
   font-size machinery at all — inline nodes ride the same typeSpec
   fallback walk as blocks; whether the a1 generator skip is
   unconditional stays a design call for the plan.
7. **Test surface to keep green**: the text-composition
   doubling/clear-restore contracts (index.test.mjs:905-1001) and the
   four hyphenation-suite baseFontSize overrides
   (hyphenation-pattern-languages.test.mjs:117, 170, 199, 239).
   Probes carry no numeric font-size expectations.
