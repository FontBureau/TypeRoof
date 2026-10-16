---
date: 2026-10-14T18:10:43+02:00
git_commit: e26f6676c6dee72c871507c187d48c761acda0cc
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Named justification-potentials configurations (selection, graceful application, generalized treatment config)"
tags: [research, codebase, text-composition, justification-potentials, treatment-planner, metamodel]
status: complete
---

# Research: Named justification-potentials configurations

## Research Question

Enable selecting a justification-potentials variant beyond auto-discovery,
for BOTH greedy-fit and knuth-plass: a `potentials` choice of "auto"
(current best-fit discovery) or a named configuration — first entries:
the headline wdth-narrowing treatment from the varla-varfo
`WDTH_JUSTIFICATION_SPECS` stub, folded into the unified potentials
structure with a real dflt slot. Named selection must be "maximally
graceful": no family/axis gating, missing navigation dimensions filled
from table-declared defaults or manual overrides, treated axes the font
doesn't support applied anyway (no-ops). Generalize the treatment
config: any number of axis tags plus optional tracking/wordspace,
replacing the hard-coded trio.

## Operator briefing (decisions of this session — the feature contract)

- The wdth stub semantics: h1/"main" headlines sit at the WIDE end
  (RobotoFlex wdth 151, AmstelVar 125) and ONLY narrow; the dflt slot
  IS the wide end, so widening potential is zero by construction:
  `{ wdth: [35, 151, 151] }` (RobotoFlex) / `{ wdth: [50, 125, 125] }`
  (Amstelvar); provenance comments carried over, incl. the
  "widening not confirmed" FIXME.
- `PotentialsTable` gains `defaultLocations: number[]` parallel to
  `dimensions` — the modeling font's defaults, used when the run's
  font lacks a dimension's axis. The existing RF/Amstelvar full
  tables get theirs declared (verify against the shipped fvar).
- Named configurations = a flat map selected BY NAME. NO family
  matching, NO axis-existence gate. Graceful piecewise: missing nav
  dims -> defaultLocations or manual override; treated axes the font
  lacks -> applied anyway (render/measurement no-ops; the line
  justifies via the remaining treatments); no effective overlap ->
  step 0 everywhere, "we just render the font", never an error.
- Config names: enum (`auto`, `robotoFlexText`, `robotoFlexHeadline`,
  `amstelvarText`, `amstelvarHeadline`). `auto` = today's best-fit
  discovery, explicitly restricted to the Text pair (behavior
  identical to the current registry, which is exactly those two
  tables). `*Text` = the existing full tables (their wdth-100 branch
  is commented "default reading text spec"); `*Headline` = the flat
  wdth tables. Future: more advanced selection (family + useCase
  like "text"/"headline" per font) is explicitly OUT of scope now.
- `potentialsLocationOverrides`: ordered map axis tag -> NUMBER (no
  logical values); FILL-ONLY — applies only to dimensions the run's
  font does not carry; entries for axes the font has are ignored.
  Precedence: override > defaultLocations. Fill-only protects the
  step-0-identity invariant (overriding an axis the run uses would
  re-anchor the treatment away from the run's actual value and
  change rendering AT step 0).
- The documenting string ("the potential is selected by: opsz(14),
  wght(400), wdth(100)") is GENERATED from the effective location,
  not stored (cannot drift out of sync).
- Treatment config generalization ("not hard-coded to 3 treatments"):
  `axisTreatments: "all" | ReadonlySet<string>` + `tracking` /
  `wordspace` booleans. Greedy-fit struct: `treatmentAxes` = list of
  validated axis tags (empty = all axis treatments of the resolved
  table), `treatmentTracking`/`treatmentWordspace` booleans stay
  (they already exist); `treatmentXTRA` is DROPPED, no migration.
  KP keeps planner defaults (all treatments on, direction "both"),
  gaining only `potentials` + `potentialsLocationOverrides`.
- No changes to the pure algorithms (greedy-fit.ts, knuth-plass.ts);
  the anchoring/measurement/applicator paths are already graceful
  (evidence below).
- CORRECTION (operator, 2026-10-14 19:42): the potential's authored
  span IS its identity — the headline config MEANS "start at 151,
  narrow toward 35". It is not a font-derived range: recasting the
  config on another font as a "[75,100] narrowing potential"
  misrepresents the authored semantics.
- Anchoring becomes a TRIPLE-valued OPTION (operator 2026-10-14
  20:04; presumably a struct knob next to `potentials`, default
  "run", to confirm in planning) — `potentialsAnchoring:
  "run" | "font" | "off"`:
  - "run" (default, STATUS QUO): today's `anchorPotentialsToLocation`,
    unchanged (dflt := the run's RESOLVED axis value — the style's
    explicit setting or the font's axis default when unset, never
    the table's authored dflt; min/max shifted by the same delta,
    clamped to font.axisRanges — step 0 is "no change" by
    construction). The auto path and existing tables are untouched.
  - "font": dflt := the FONT's axis defaults (fvar), regardless of
    where the style pushes the run — one stable anchor per font,
    shared by all runs; min/max shifted + clamped as above. Step 0
    = the font's default position: no change only for runs not
    styled away from the defaults. (Operator 20:07: this
    run-independence is exactly the point — stable, consistent
    potentials across runs of the same font, unaffected by where
    styles push individual runs.)
  - "off": no anchoring — authored triple verbatim. Regardless of
    the run's current value / the font's axis default, the
    treatment starts at the CONFIGURATION's own dflt (the mid slot
    of the triple, e.g. 151) and traverses the authored span;
    values the font cannot reach clamp at the application boundary
    (HarfBuzz and CSS both clamp to fvar — measurement/render
    parity holds), i.e. the existing no-op machinery for
    unsupported axes. NOTE: with "off", step 0 applies the
    authored dflt — for a run not sitting there, step 0 is no
    longer the run's unadjusted state (the configuration asserts
    its natural state; a conscious authoring statement, differs
    from the step-0-identity invariant elsewhere).

## Summary

The pipeline is ready for this feature: the Treatment Planner is
already generic over arbitrary axis tags (only struct fields,
properties-generator lists and the controller's toggle mapping
hardcode the trio); measurement and rendering already no-op treated
axes the font lacks; anchoring already clamps to the font's axis
ranges (a wdth table cross-applied to another font yields sane,
cross-applied to another font degrades gracefully). The work is:
data (wdth tables +
defaultLocations), a named-configuration map + graceful resolver in
justification-potentials.ts, config-shape change in
treatment-planner.ts, struct fields + properties-generator entries
+ widget mappings on the metamodel/UI side, controller wiring for
both algorithms, and the generated selection doc string.

## Detailed findings

### Potentials data model & resolution
- `lib/js/components/layouts/type-stage/text-composition/justification-potentials.ts`
  - `PotentialsTable` :42 (dimensions + tree; to gain defaultLocations),
    `PotentialsLevel`/leaf types :26-40. Leaf = treatment triples
    [min, dflt, max]; axis treatments are 4-char tags, `tracking` is
    ABSOLUTE pt, `wordspace` a FACTOR of the natural space advance.
  - `validatePotentialsTable` :66 — leaf key-set uniformity across ALL
    leaves, triple min<=dflt<=max, numeric monotonic levels; both stub
    tables validated at module load.
  - `calculatePotentials` :164 — separable multilinear interpolation,
    levels bottom out early, out-of-range clamps to edge stops;
    THROWS when the location misses a dimension (the guarantee that
    named selection must relax); step-0-identity dev warning for axis
    treatments.
  - `anchorPotentialsToLocation` :247 — re-anchors axis triples to
    the run's location (dflt := run value, min/max shifted, clamped
    to font.axisRanges); a treated axis ABSENT from the location keeps
    the authored triple unclamped (graceful for unsupported axes).
    UNCHANGED when the anchoring option is ON (status quo); OFF
    skips it entirely (authored triple verbatim).
  - `_POTENTIALS_REGISTRY` :549, `discoverPotentials` :586 — best-fit:
    longest family-name prefix, then most required axes; requires ALL
    navigated/treated axes present in font.axisRanges (the gate that
    named selection must NOT apply).
  - Data: `JUSTIFICATION_POTENTIALS_AMSTELVAR` / `_ROBOTO_FLEX`
    (verbatim varla-varfo port; the wdth-100 branch is commented
    "default reading text spec" — the natural `*Text` configs).

### Treatment Planner
- `.../treatment-planner.ts`: `TreatmentPlannerConfig` :29
  { treatments: ReadonlySet<string>, direction }, defaults :36 =
  {XTRA, tracking, wordspace} + "both". `treatmentValueAt` — per-side
  linear step maps; `createTreatmentStepper` :84 — direction gating,
  |step|>1 clamp, axis treatments filtered by the 4-char-tag
  convention AND config set. The stepper math is ALREADY generic
  over any tag names — only the wiring hardcodes the trio. The 4-char
  convention stays (it marks re-anchorable axis treatments).

### Controller wiring (Host policy)
- `.../composition-controller.ts` (composeTextblock):
  - `greedyFitConfig` :989-1022 — treatments set built from the three
    boolean toggles (`textCompositionAlgorithm/treatmentXTRA|...`),
    direction enum, colorCoding; `knuthPlassConfig` :1023-1077;
    `plannerConfig = greedyFitConfig ?? TREATMENT_PLANNER_DEFAULTS` :1091.
  - `plannerOf(style)` :1101-1120 — discoverPotentials -> location
    (Map of axesEntries) -> calculatePotentials ->
    anchorPotentialsToLocation (axisRanges) -> stepper +
    spaceAdvancePt; cached per LeafStyle; the table OBJECT joins the
    input-equality ingredients filter (:1163ff,
    `plannerOf(styleOf(index))?.table ?? null`).
  - `axesAtStep` :1316-1331 — replaces values ONLY for tags already
    present in `style.axesEntries` (the font's own axes): a treated
    axis the font lacks is silently dropped from measurement.
  - Payload :1626-1650 — leaves[].treatment {axesEntries, potentials,
    spaceAdvancePt} + treatmentConfig {treatments, direction}; the
    applicator derives per-line values deterministically per fragment.

### Properties / metamodel / UI path (where new fields register)
- Struct models: `lib/js/components/type-spec/text-composition-models.mjs`
  — GreedyFitModel :66-75 (three treatment booleans as
  BooleanDefaultTrueOrEmpty, JustificationDirectionModel enum :60,
  colorCoding), KnuthPlassModel :108ff (all fields OrEmpty).
- Properties generator: `.../type-stage/properties-generators.mjs`
  `textCompositionGen` :52-108 — resolves the dynamic struct per
  typeKey and yields `textCompositionAlgorithm/<field>` for non-empty
  fields. NEW FIELDS MUST BE ADDED TO THE PER-TYPE FIELD LISTS here.
- Registration: `lib/js/components/registered-properties.mjs` :429;
  TypeSpecModel field `type-spec/models.mjs` :623.
- UI: `ui-text-composition.typeroof.jsx` (UIDynamicStructContainer
  subclass; fields render via ProcessedPropertiesSystemMap). Widget
  map `type-driven-ui.mjs` `uiElementsMap` :243ff —
  _AbstractEnumModel -> UISelectInput :247 / UISelectOrEmptyInput :525,
  StringModel -> UILineOfTextInput :244, list precedent
  CharGroupArgumentsListModel -> UITypeDrivenListWithAddButton :268
  (validated string items), LengthValueListModel :279, ordered-map
  precedent AxesMathAxisLocationsModel -> UIAxesMathLocation :399
  (inline notes document its drag-handle caveats).

### Graceful application paths (evidence "apply anyway" is safe)
- Measurement: `.../measurer.ts` `axesEntriesOf` :33-52 — location is
  built from font.axisRanges only (an axis the font lacks is absent
  from the location); axesAtStep drops unknown tags; HarfBuzz shapes
  at the font's real axes. Measured == rendered for no-op axes.
- Rendering: `.../line-attrs.ts` `lineSpanStyles` :199-224 —
  per-line-span font-variation-settings (unsupported axes ignored by
  the font), wordspace = factor * natural space advance, tracking via
  shaped glyph counts; viewer.typeroof.jsx applies it per fragment.
- Anchoring (mode examples, the triple from 20:04): the Flex
  headline table `{wdth:[35,151,151]}`: a run AT wdth 151 (the h1
  case) is the identity case — narrowing-only by construction. A
  plain-Roboto run at wdth 100 with "run" (status quo) re-anchors
  per today's code to [75,100,100] (dflt := 100, shifted +
  clamped). With "font" the anchor is the font's fvar default
  (plain Roboto wdth 100 → same [75,100,100]; a run STYLED to 90
  would still anchor at 100, step 0 moving it back). With "off"
  the authored triple applies verbatim: the treatment starts at
  151 and the font clamps applied values at its boundary (plain
  Roboto renders the start at its max 100 and narrows along the
  authored span until its floor 75). A font without wdth keeps
  the authored triple, applies it, ignores it.

### Reuse precedents for the new fields
- Ordered map with validated OpenType-tag keys:
  `axes-math-models.mjs` `AxesMathAxisLocationsModel` :198
  (_AbstractOrderedMapModel.createClass,
  validateKeyFn: validateOpenTypeTagString — util.mjs :81); item
  `AxesMathAxisLocationValueModel` :180 ({logicalValue:
  default|min|max|number, numericValue}). Operator decision:
  overrides need NUMBERS ONLY — either a clean ordered map
  (tag -> number; one new widget mapping, modeled on the existing
  patterns) or reuse with logicalValue fixed to 'number' by a
  coherence function (free UI, but serializes a meaningless enum per
  entry). `AxesMathLocationModel` :219 wraps the map for axes-math.
- StylePatch uses the same map as `axesLocations`
  (type-spec/models.mjs :435) with a CoherenceFunction example
  :439-444 (autoOPSZ deletes the opsz entry) — the coherence pattern
  for cleaning no-longer-meaningful entries.
- treatmentAxes list precedent: CharGroupArgumentsListModel items are
  validated strings rendered via UITypeDrivenListWithAddButton with
  StringModel items -> UILineOfTextInput — the shape for a list of
  axis tags (validation: the item model or a list coherence function).
- Dynamic-struct machinery: createDynamicModel
  (dynamic-types-pattern.mjs; text-composition-models.mjs :31),
  primitives: StringModel (metamodel/simple-models.ts :109),
  struct-model.ts, ordered-map-model.ts :92, list-model.ts.

### Test layout & verification
- Co-located vitest files in `.../text-composition/`:
  justification-potentials.test.mjs, treatment-planner.test.mjs,
  composition-controller-task.test.mjs, line-attrs.test.mjs,
  measurer.test.mjs, greedy-fit.test.mjs, knuth-plass.test.mjs, plus
  type-spec/model.test.mjs and lib/js/tests/text-composition/index.test.mjs
  (struct/integration level).
- Commands: `npm run typecheck`, `npm run lint`, `npm run test`
  (vitest run), `npm run format:write`.
- Testing strategy: assert behavior (inputs -> observable outcomes),
  not implementation internals (COLLABORATION.md).
- `scripts/perf-composition` is OFF LIMITS (operator rule 2026-10-06).

## Code References

- justification-potentials.ts :26-66 (types/validation), :164
  (calculatePotentials), :247 (anchor), :549/:586 (registry/discovery)
- treatment-planner.ts :29-36 (config/defaults), :84 (stepper)
- composition-controller.ts :989-1120 (config resolution, plannerOf),
  :1316 (axesAtStep), :1626-1650 (treatment payload)
- properties-generators.mjs :52-108 (textCompositionGen)
- text-composition-models.mjs :60-75, :108+ (structs)
- type-driven-ui.mjs :243-296, :399, :525 (widget map)
- axes-math-models.mjs :180-224 (Location models)
- type-spec/models.mjs :423-444 (SimpleStylePatchModel axesLocations)
- measurer.ts :33-52 (axesEntriesOf); line-attrs.ts :199-224
- util.mjs :81 (validateOpenTypeTagString)
- Prior art / context:
  thoughts/research/2026-10-04-1644-justification-potentials.md
  (archived: docs/planning/agentic-artefacts/thoughts/research/);
  docs/planning/text-composition/ROADMAP.md "Milestone 4 design notes"
  (deferred item: "unified headline wdth treatment").

## Open Questions

1. Overrides map model: clean ordered map tag->number (new model +
   one widget mapping) vs. reuse AxesMathAxisLocationsModel with the
   logicalValue enum fixed to 'number' by coherence (free UI,
   serialized cruft). Operator leans numbers-only; plan decides.
2. treatmentAxes item validation: validated StringModel subclass vs.
   list-level coherence function — follow the CharGroupArgumentsModel
   pattern found during planning.
3. Deserialization of the DROPPED treatmentXTRA field: confirm
   removed/unknown struct fields drop silently on document load
   (dynamic-struct-model.ts / serialization.ts) — expected, verify
   with a plan-phase test.
4. Where the generated selection doc string surfaces (composition
   payload diagnostics vs. a UI label) — small, decide in plan.
5. KP treatment toggles: deliberately not exposed now (planner
   defaults); note as a future knob.
6. Anchoring option scope: struct knob next to `potentials`
   (assumed) — does it govern `auto`-discovered potentials too
   (default ON), or only named configurations?

## Tooling note (for ~/TOOLING.md, not yet filed)

- This session the delegate sub-agents were unusable: the
  `instructions` parameter was silently dropped ~35 times (only short
  scalar params like `source`/`async` arrived at the tool); one
  source-based delegate (gortex-search) ran WITHOUT its task
  parameters and produced a confident, unrelated report (answered a
  different feature's question). Research was executed directly as
  fallback. Suspected payload-size-dependent parameter truncation in
  the tool-call layer (same family as the 2026-05-07 entries).
