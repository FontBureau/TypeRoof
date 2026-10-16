# Named Justification-Potentials Configurations — Implementation Plan

status: concluded (2026-10-16 15:43, operator "wrap it up now")

date: 2026-10-14T21:31:00+02:00
research: thoughts/research/2026-10-14-1810-potentials-configurations.md
branch: feature/composition-and-justification

## Overview

Selectable justification potentials for BOTH greedy-fit and
knuth-plass: `potentials` = "auto" (today's best-fit discovery) or a
named configuration (first: the headline wdth-narrowing tables,
folded from the varla-varfo `WDTH_JUSTIFICATION_SPECS` stub into the
unified potentials structure with a real dflt slot). Named selection
is maximally graceful: no family/axis gating, missing navigation
dimensions filled from table-declared `defaultLocations` or manual
overrides, treated axes the font lacks applied anyway (no-ops). The
treatment config generalizes: ONE toggle surface for axis tags and the
pseudo-axes `tracking`/`wordspace`. Anchoring becomes a triple option
(run / font / off).

## Current State Analysis

- `justification-potentials.ts`: `PotentialsTable` :42 (dimensions +
  tree), `validatePotentialsTable` :66 (leaf key-set uniformity,
  triple ordering, monotonic levels; validated at module load),
  `calculatePotentials` :164 (throws when the location misses a
  dimension — discovery guarantees presence for auto),
  `anchorPotentialsToLocation` :247 (dflt := run value, min/max
  shifted, clamped to font.axisRanges; absent axis keeps the authored
  triple), `_POTENTIALS_REGISTRY` :549 + `discoverPotentials` :586
  (best-fit: longest family prefix, then most required axes; ALL
  navigated/treated axes must exist in font.axisRanges).
- `treatment-planner.ts`: `TreatmentPlannerConfig` :29
  {treatments: ReadonlySet<string>, direction}, defaults :36 =
  {XTRA, tracking, wordspace} + "both"; `createTreatmentStepper` :84
  is already generic over any tag names (4-char convention separates
  re-anchorable axes from the named pseudo-axes).
- `composition-controller.ts`: `greedyFitConfig` :989-1022 (toggles
  -> treatments set), `plannerConfig = greedyFitConfig ??
  TREATMENT_PLANNER_DEFAULTS` :1091, `plannerOf(style)` :1101-1120
  (discover -> calculate -> anchor -> stepper; table identity joins
  the ingredients filter), `axesAtStep` :1316-1331 (replaces values
  ONLY for tags already in style.axesEntries — treated axes the font
  lacks are dropped from measurement), payload :1626-1650.
- Properties/metamodel path: struct models
  `type-spec/text-composition-models.mjs` (GreedyFit :66-75, KP
  :108-172, dynamic registration with labels :185ff); field lists in
  `properties-generators.mjs` `textCompositionGen` :52-108 (yields
  `textCompositionAlgorithm/<field>`); widget map
  `type-driven-ui.mjs` `uiElementsMap` :243ff (enum -> UISelectInput,
  StringModel -> UILineOfTextInput, list precedent
  CharGroupArgumentsListModel -> UITypeDrivenListWithAddButton,
  ordered-map precedent AxesMathAxisLocationsModel -> UIAxesMathLocation).
- Graceful application is already in place: measurement drops
  unknown axes (axesAtStep), rendering writes font-variation-settings
  (font ignores unsupported axes), HB/CSS both clamp out-of-range
  values to fvar — measurement/render parity holds by construction.

## Desired End State

1. `potentials` selectable per typeSpec on both greedy-fit and
   knuth-plass: "auto" (default, behavior byte-identical to today) or
   one of `robotoFlexText` / `robotoFlexHeadline` / `amstelvarText` /
   `amstelvarHeadline`.
2. Headline tables carry the stub semantics: natural state = the WIDE
   end (wdth 151 / 125), narrowing-only by construction:
   `{ wdth: [35, 151, 151] }` / `{ wdth: [50, 125, 125] }`, flat
   leaves, provenance comments incl. the widening FIXME.
3. `PotentialsTable.defaultLocations` (parallel to dimensions):
   missing navigation dimensions resolve from it; manual overrides
   (ordered map tag -> number, fill-only) take precedence.
4. `potentialsAnchoring`: "run" (default, status quo: dflt := the
   run's resolved value, step 0 = no change) | "font" (the WHOLE
   resolution — leaf navigation AND anchoring — at the font's default
   location: one stable anchor per font, shared by all runs) |
   "off" (navigate at the run's location, apply the authored triple
   verbatim — the configuration asserts its natural state).
5. `treatments`: list of DISABLED treatment tags (axis tags + the
   pseudo-axes `tracking`/`wordspace`); set semantics, coherence
   dedupes and prunes entries not offered by the selected NAMED
   configuration (auto is font-dependent: no pruning there; unknown
   tags ignored gracefully at resolution). Empty list = all on.
6. The generated selection doc string ("the potential is selected
   by: opsz(14), wght(400), wdth(100)") travels with the payload.
7. No changes to the pure algorithms; no migration for dropped
   struct fields (in-repo documents are updated directly; a
   deserialization check documents that unknown fields drop
   silently).

## What We're NOT Doing

- Editable/document-scoped potentials storage + metamodel (stays
  code-level; the ROADMAP's open deferred item).
- Advanced selection schemes (family + useCase auto-selection).
- KP treatment/anchoring UI beyond the three shared fields (KP
  keeps planner defaults for treatments; exposing the list later is
  trivial).
- Per-treatment impact weights / ordering; inter-line harmonization.
- Any migration code for `treatmentXTRA`/`treatmentTracking`/
  `treatmentWordspace`.
- Perf harness (OFF LIMITS per operator rule 2026-10-06).

## Implementation Approach

Bottom-up in dependency order: data + resolution, planner config,
metamodel/UI, controller wiring — each phase independently verifiable
(the algorithm contract stays pure throughout). The five design picks
settled with the operator: clean ordered map for overrides; validated
StringModel items for the treatments list; doc string in the payload;
anchoring governs auto AND named (default "run" = status quo); "font"
mode resolves leaf AND anchor at the font defaults.

## Phase 1: Data & resolution (justification-potentials.ts)

### Changes

1. `PotentialsTable` gains `defaultLocations: number[]` (parallel to
   `dimensions`; the modeling font's defaults).
2. `validatePotentialsTable`: require
   `defaultLocations.length === dimensions.length` and finite values.
3. `calculatePotentials`: for each dimension, `location.get(dim)` —
   when absent use `table.defaultLocations[depth]`; absent from BOTH
   throws (config error). Auto is unaffected (its discovery gate
   guarantees presence; the fill never triggers there).
4. New headline tables (flat leaves, verbatim provenance comments):
   `JUSTIFICATION_POTENTIALS_ROBOTO_FLEX_HEADLINE =
     { dimensions: [], defaultLocations: [], tree: { wdth: [35,151,151] } }`
   `JUSTIFICATION_POTENTIALS_AMSTELVAR_HEADLINE =
     { dimensions: [], defaultLocations: [], tree: { wdth: [50,125,125] } }`
5. Text tables declare their defaultLocations (Roboto Flex: wght 400,
   wdth 100, opsz 14 per [wght,wdth,opsz]; Amstelvar equivalents) —
   VERIFY against the shipped fonts' fvar during implementation.
6. Named-configuration map + selection resolution:
   `POTENTIALS_CONFIGURATIONS: { [key: string]: PotentialsTable }`
   (robotoFlexText/Headline, amstelvarText/Headline);
   `resolvePotentialsSelection(selection, font): PotentialsTable | null`
   — "auto" -> today's `discoverPotentials` (registry = the Text
   pair, identical to current behavior); named -> the mapped table
   (no family matching, no axis gate; unknown key -> warn + auto).
7. Anchoring modes — `anchorPotentialsToLocation` unchanged; the
   mode selects WHERE it anchors (controller-side, see Phase 4).
   Location builders exported for reuse:
   - run: today's `new Map(style.axesEntries)`
   - font: font-default location (all axes at axisRanges[tag].default)
   - off: run location for navigation, anchoring skipped
8. `potentialsSelectionString(table, location)`: the generated doc
   string in the table's dimension order.

### Success Criteria

- [x] `npm run test` passes: justification-potentials.test.mjs
      extended — defaultLocations validation; flat-leaf tables pass
      validation; fill-in from defaults for font-lacking dimensions;
      named resolution returns the table regardless of font;
      headline triples anchor/run/font/off behave as specified
      (run: step-0 identity; off: authored verbatim; font: stable
      per font). NOTE: "off" and "font" anchoring MODES are applied
      controller-side (Phase 4); Phase 1 delivers the location
      builder + the unchanged anchor function, both tested.
- [x] `npm run typecheck`, `npm run lint` pass.

**Pause point:** proposed commit, operator confirmation.

## Phase 2: Treatment Planner generalization (treatment-planner.ts)

### Changes

1. `TreatmentPlannerConfig` -> `{ treatments: "all" |
   ReadonlySet<string>; direction: "both" | "narrowing" | "widening" }`
   — the set may contain axis tags AND the pseudo-axes
   "tracking"/"wordspace"; `TREATMENT_PLANNER_DEFAULTS` =
   `{ treatments: "all", direction: "both" }`.
2. `createTreatmentStepper`: enabled per leaf key =
   `config.treatments === "all" || config.treatments.has(key)`;
   axis vs pseudo-axis distinction stays via the 4-char convention
   (only real axes re-anchor; tracking/wordspace remain dflt-0
   treatments).
3. `treatmentValuesAtStep` follows the new config shape.

Behavioral no-op for existing callers (defaults equivalent to the
old trio for the current tables).

### Success Criteria

- [x] treatment-planner.test.mjs updated: "all" default, explicit
      sets incl. pseudo-axes, direction gating unchanged, wdth axis
      treatment maps correctly. (14 tests; full composition suite
      154 + integration 19 green — behavioral no-op confirmed.)
- [x] typecheck/lint pass.

**Pause point:** proposed commit, operator confirmation.

## Phase 3: Metamodel, properties & UI

### Changes

1. `type-spec/text-composition-models.mjs`:
   - `PotentialsSelectionModel` = enum
     ["auto", "robotoFlexText", "robotoFlexHeadline",
      "amstelvarText", "amstelvarHeadline"], default "auto" + OrEmpty.
   - `PotentialsAnchoringModel` = enum ["run", "font", "off"],
     default "run" + OrEmpty.
   - `PotentialsLocationOverridesModel` = _AbstractOrderedMapModel
     with number items and `validateKeyFn: validateOpenTypeTagString`
     (clean model — no logicalValue cruft; see pick 1).
   - `TreatmentTagModel` = StringModel subclass validating 4-char
     OpenType tags or "tracking"/"wordspace";
     `TreatmentsOffListModel` = list of TreatmentTagModel.
   - GreedyFit struct: DROP treatmentXTRA/treatmentTracking/
     treatmentWordspace; ADD ["potentials", ...OrEmpty],
     ["potentialsLocationOverrides", PotentialsLocationOverridesModel],
     ["potentialsAnchoring", ...OrEmpty], ["treatments",
     TreatmentsOffListModel]; keep direction, colorCoding.
   - KnuthPlass struct: ADD potentials, potentialsLocationOverrides,
     potentialsAnchoring (same models).
   - CoherenceFunction on both structs
     (["treatments", "potentials"]): dedupe the list; when
     `potentials` is a NAMED selection, remove entries not offered
     by that configuration's table; when "auto" (font-dependent),
     leave the list (resolution ignores unknown tags gracefully).
     Mutation precedent: SimpleStylePatchModel's autoOPSZ
     coherence (type-spec/models.mjs :439-444); list item removal
     API to verify during implementation.
2. `properties-generators.mjs` `textCompositionGen` :52-108: add
   the new fields to the greedy-fit and knuth-plass field lists.
   Check registered-properties.mjs :429 for required registrations.
3. Widget mapping (`type-driven-ui.mjs` uiElementsMap):
   - enums + StringModel render via existing mappings;
   - TreatmentsOffListModel -> UITypeDrivenListWithAddButton
     (CharGroupArgumentsListModel pattern);
   - PotentialsLocationOverridesModel: follow the
     AxesMathAxisLocationsModel -> UIAxesMathLocation pattern if the
     item UI can degrade to a plain number input, else a minimal
     tag->number map widget (same _UIBaseMap family).
4. `ui-text-composition.typeroof.jsx`: verify the dynamic struct
   container picks up the new field types (FieldType map may need
   the new models listed).

### Success Criteria

- [x] type-spec/model.test.mjs extended: fields resolve; OrEmpty
      inherit; coherence dedupes + prunes (named) / leaves (auto);
      a document serialized with treatmentXTRA loads cleanly
      (field dropped silently). (4 new tests; full suite 569 green.)
- [x] typecheck/lint/test pass. NOTE (implementation): the
      treatments item model needed identity serializeFN/deserializeFN
      (createClass config REPLACES the base config, does not merge) —
      caught by the round-trip test. UI: option B widget
      ui-potentials-location-overrides.mjs (UIPotentialsLocationOverrides
      + UIPotentialsOverrideValue, the _UIBaseAxesMap pattern with
      plain number values) + uiElementsMap entries for the list
      (UITypeDrivenListWithAddButton) and the map; dropped legacy
      toggles from the struct (interim: the controller's ?? true
      fallback yields the equivalent all-on defaults).
      OPERATOR QA (2026-10-14 22:24) surfaced two UI defects, both
      fixed: (1) the treatments item had no registered UI element —
      StringModel's uiElementsMap entry does not cover subclasses and
      UITypeDrivenListItem only falls back to struct-field walking, so
      the "+ disable treatment" click crashed; fix: a dedicated
      [PotentialsTreatmentTagModel -> UILineOfTextInput] entry (the
      model needed exporting). (2) The overrides map's add-tag button
      was rendered but hidden: .ui_base_map-tools > * { display: none }
      requires a family-specific reveal rule; fix:
      .ui_potentials-location_overrides-tools > * { display: initial }.
      Regression coverage: scripts/puppeteer-probes/qa-milestone6-panels.mjs
      (panel widgets, off-list typing commit, coherence pruning via the
      potentials select, overrides tag->number commit, zero console
      errors) — passing; KP named-fields round-trip added to
      type-spec/model.test.mjs. Full suite 569 green, typecheck/lint/
      stylelint clean.

**Pause point:** proposed commit, operator confirmation.

## Phase 4: Controller wiring (composition-controller.ts)

### Changes

1. Resolve the shared potentials config for BOTH algorithm keys
   (extend the greedyFitConfig/knuthPlassConfig blocks):
   `potentials` (OrEmpty -> "auto"), `potentialsAnchoring`
   (-> "run"), `potentialsLocationOverrides` (ordered map ->
   [tag, number][]).
2. `plannerOf(style)` rework:
   - table = `resolvePotentialsSelection(selection, style.font)`
     (auto = today's discoverPotentials);
   - location per anchoring mode: "run" -> new Map(axesEntries);
     "font" -> font-default location; "off" -> axesEntries for
     navigation only;
   - override fill: for each table dimension ABSENT from the working
     location (font lacks the axis), use override[tag] if present,
     else table.defaultLocations (fill-only — entries for axes the
     font carries are ignored, protecting step-0 identity);
   - anchor per mode: "run"/"font" -> anchorPotentialsToLocation
     against the mode's location (status quo for "run");
     "off" -> skip (authored triple verbatim);
   - stepper with the generalized config; spaceAdvancePt unchanged.
3. Treatment config: greedy-fit -> treatments set = leaf keys minus
   the off-list ("all" when empty), direction from the struct;
   KP -> TREATMENT_PLANNER_DEFAULTS. The set (incl. pseudo-axes)
   feeds the stepper; payload treatmentConfig carries the resolved
   set + direction.
4. Ingredients: add resolved selection, anchoring mode, sorted
   off-list, overrides entries.
5. Payload: publish `potentialsSelectionString(table, location)`
   (diagnostics field) for the UI.

### Success Criteria

- [x] composition-controller tests green: auto path identical (the
      default-config composition results are byte-equal — the
      full-suite greedy-fit/knuth-plass viewer tests pass
      unchanged); named selection applies the table without gates;
      overrides fill missing dims; anchoring modes resolve as
      specified (run = status quo; font = fvar location for leaf AND
      anchor; off = authored verbatim); off-list disables treatments
      via the generalized planner config. BUG FIXED on the way:
      properties-generators yielded `treatments: []` for the EMPTY
      off-list (list models have no isEmpty — `!isEmpty` is always
      truthy) which the controller read as "disable everything";
      now empty lists/maps yield nothing (= the default, all-on).
      KP keeps TREATMENT_PLANNER_DEFAULTS via plannerConfig; the
      payload carries treatments as "all" | sorted array and
      potentialsSelections (the generated doc string per leaf).
- [x] typecheck/lint/test pass (569 tests / 55 files; puppeteer
      QA probe green end-to-end).

**Pause point:** proposed commit, operator confirmation.

## Phase 5: Verification sweep

- [ ] Full `npm run test`, `npm run typecheck`, `npm run lint`,
      `npm run format:check` (format:write if needed).
- [ ] Update in-repo documents that used the dropped greedy-fit
      treatment fields (direct edit, no migration code).

### Manual Verification (operator)

- [ ] h1 textblock (Roboto Flex at wdth 151) + greedy-fit +
      `potentials: robotoFlexHeadline` + `direction: narrowing`:
      lines narrow from 151 (no widening).
- [ ] Same with knuth-plass.
- [ ] A run on a font lacking wdth: values applied, no error,
      rendering unchanged (graceful no-op).
- [ ] `potentialsAnchoring: off` on a run away from the authored
      dflt: step 0 applies the configuration's dflt.
- [ ] `potentialsAnchoring: font` on differently-styled runs of
      one font: identical potentials (stable anchor).
- [ ] treatments off-list: disabling wdth/tracking/wordspace
      changes only the remaining treatments' contribution.
- [ ] Default config (everything unset): output identical to
      current build.

## Testing Strategy

Behavior-first (COLLABORATION.md): resolution outputs (which table,
which leaf, which triple) and observable composition effects —
never internal call graphs. Table validation errors are part of
the contract (module-load throws). Parity between measured and
rendered treatment values is guaranteed structurally (same stepper
math, same locations) — spot-check one anchored + one authored
case in line-attrs.test.mjs if the payload shape changed.

## Post-plan addendum: lastLineHandling (operator QA 2026-10-15 00:56)

The operator's headline QA rounds (the editor-applicator treatments fix
landed in Phase 4's commit) surfaced the actual headline gap: greedy-fit
never absorbs the paragraph REMAINDER onto a line (the pull loop needs a
next break; a short heading has none) and the final line is never composed
(the \parfillskip rule) — "Heading One" broke into two lines instead of
narrowing onto one.

Landed:
- greedy-fit.ts: converted to the factory pattern (the dummy/KP
  precedent), createGreedyFitComposition({lastLineHandling}):
  "ragged" (default, status quo) | "fill" — fill composes the final line
  like a regular line: the pull loop may absorb the whole remainder (the
  line BECOMES the final one, narrowed to fit; explicit breaks are never
  swallowed) and an underfull final line widens to the measure.
- Metamodel: GreedyFitLastLineHandlingModel on the greedy-fit struct;
  generator + controller resolve it per textblock; ingredient.
- Tests: greedy-fit.test.mjs lastLineHandling suite (6 tests: remainder
  absorption, status-quo ragged, underfull-final widen vs \parfillskip,
  explicit-break safety); struct round-trip extended. Full suite 577.
- QA: qa-milestone6-headline.mjs — ragged control (2 lines) vs fill
  ("Heading One" on ONE line, wdth treatment + color code applied).

Deferred: KP last-line handling (its DP prices the final line via
linePenalty — a fill mode there is a separate design question).

## Post-plan addendum 2: the identity idea is removed (operator 2026-10-16 10:44)

The operator decided against the step-0-identity model entirely: step 0 is
ALWAYS explicitly written out. Consequences, all landed:

- lineSpanStyles: the `adjustmentStep !== 0` skip is gone; step 0 emits the
  axes override at the anchored dflt (tracking/wordspace emit nothing there
  anyway — their dflts are 0). For "run" anchoring the written values equal
  the run's own location (explicit, not skipped — pure CSS redundancy);
  for "font" the fvar defaults; for "off" the authored dflt — THE point: the
  off mode's "the configuration asserts its natural state" now RENDERS.
- composition-controller: the step-0 measurement shortcuts are gone
  (hostWidthAtStep flows through the stepper like every step;
  candidateHyphenWidth measures at the step axes; hyphenWidthOf removed) —
  measurement and rendering agree in every anchoring mode, no per-mode
  special case. For "run" the Measurer cache reduces step 0 to the natural
  widths (the stepper dflts ARE the run's own values).
- justification-potentials: the step-0-identity dev warning is removed
  (its premise is gone; in "off" mode the "divergence" is the feature).
  Its test with it.
- Tests: line-attrs "explicitly writes step 0" (axes override at dflt,
  no spacing); measurement/headline/panels probes all green — the
  headline probe now pins off-anchoring end to end: line 1 narrows within
  the authored span (132.8 of [35..151]), the ragged last line renders the
  authored dflt 151 at step 0. Full suite 576.

## Post-plan addendum 3: underfullTreatment (operator 2026-10-16 11:50-12:18)

The demo's actual answer (varla-varfo justification.mjs: feedback control +
direction gating) framed it: our "leave at max potential (step +1)" is a
predictive shortcut the demo never takes. Decision (b): fix the mechanic, no
revert-mode-vs-config split; then the operator generalized it to a tri-state:

`underfullTreatment: enum("run", "font", "off")`, default "off" (status quo,
byte-identical), on BOTH greedy-fit and knuth-plass. An underfull NON-FINAL
line that maximum widening cannot fill reverts to the run's location
("run") or the font's fvar defaults ("font") instead of staying stretched.
"natural is always the run"; orthogonal to potentialsAnchoring (same value
shape, separate control — the operator's explicit call).

- Contract: ComposedLine.underfullRevert ("run" | "font") marks reverted
  lines; the Host resolves (controller recomputes naturalWidthPt at the
  revert entries per leaf style; payload carries
  revertAxesEntriesBySourceIndex; both applicators render the entries
  verbatim via lineSpanStyles' revertAxesEntries — no stepper merge).
- GF: the widen branch cannot-fill check; step 0 + marker.
- KP: evaluateEdge marks the widening branch; the DP KEEPS the
  gap-proportional extraDemerits for reverted lines (the gap is priced at
  the natural width — a reverted line must stay expensive or the DP would
  park looseness there); polish skips reverted edges (would re-widen);
  badness at step 0.
- Metamodel: GreedyFitUnderfullTreatmentModel shared by both structs;
  generator + controller + ingredients wired.
- Tests: GF 4 (off status quo incl. default, run, font, fillable-keeps-
  widening), KP 3 (off, run, marker + line shape), struct round-trip.
  Full suite 583; all three QA probes green (incl. the operator's state:
  0/99 overflows).
- "font" REMOVED from underfullTreatment (operator QA 2026-10-16 13:38):
  the "font" revert wrote the FULL fvar-default location — stomping
  styled axes the potentials don't treat (h1 wght 700 -> 400, really bad).
  "run" is the only revert target now (enum ["run", "off"]; the marker,
  the controller's revert resolution and both algorithm configs
  narrowed; GF/KP "font" tests dropped, probe modes narrowed).
  potentialsAnchoring KEEPS its "font" — different control, correct
  treated-axes-only scope. Verified in the operator's headline state:
  wght 700/600/550 intact in every mode, wdth 100 with run, 151 with off.
- UNIFORM FIX (operator QA, downloads/typeroof-20261016-125603.TypeStage,
  2026-10-16 12:58-13:11): underfullTreatment has NO final/non-final
  distinction — my first cut gated the revert to non-final lines AND to
  the hasWideningPotential branch, so a fitting FINAL line with a ZERO
  widening range (the h2/h3 headline case, GF fill mode) rendered
  stretched at the anchored dflt (wdth 151) in every mode. The check is
  now UNIFORM (GF: after the strategy, any step-0 line that is underfull
  and that widening cannot fill incl. zero range reverts; the widen
  branch never stretches a revert-mode line toward a fill it can't
  reach. KP: evaluateEdge marks the fitting-last-line branch too — no
  gap price there, the DP's last-line pricing is unchanged, the revert
  is a rendering decision). Verified in the operator's state: h1 48.35
  (fills narrowed), h2/h3 wdth 100 with run, 151 with off (the anchored
  dflt), 100 with font. GF+KP suites extended (zero-range + final-line
  cases); full suite 589; all four QA probes green.

## Post-plan addendum 4: QA round 2026-10-16 14:05-14:35

Operator smell: KP h1 "The Universe  Next Door" — the middle line
("verse Next", wdth 76.77) did not fill the 10cm measure though polish
is on. KP/polish were CORRECT (the DP picked lattice −0.6875, polish
converged to the exact fit −0.6399) — the line MEASURED full but
RENDERED one space short. Root cause: CSS white-space parity. The
composed spans render white-space: nowrap (line-spans.css, overriding
PM's vendor break-spaces — verified empirically in-page), and nowrap
COLLAPSES runs of collapsible whitespace to one space, while HarfBuzz
shaped every character. The operator's text had a double space; the
ingest (ingest.ts:818) leaves HTML indentation after replacing
newlines — every pretty-printed source ingests ~13-space runs. ALL
ingested documents with formatted HTML were affected.

Fix (measured == rendered):
- segmenter.ts: a whitespace RUN is ONE segment (raw offsets preserved
  — the editor applicator maps segment.start/end directly to PM
  positions); a run containing \n is an explicit break.
- composition-controller: segment texts shaped NORMALIZED (runs → one
  space; explicit [ \t\n\r\f\v] class — JS \s includes U+00A0 which
  must NOT collapse).
- 3 hardcoded fixture break tables updated (they encoded the
  space-inflated measurements; e.g. t1 now 7 lines instead of 9).

Follow-up caret bug (operator 14:25): ArrowRight from a line end jumped
one glyph into the next line (between "D" and "o"). Diagnosis (caret
rects): the three positions around the collapsed trailing space share
one rect and before-D is a VALID rect — Blink's forward walk skipped
the line-first span's first text position because its
::before{display:block} pseudo sits INSIDE the inline span. Fix:
line-first spans are display:block THEMSELVES (width: fit-content
keeps the color-coding background hugging the text) — the ::before
mechanism is gone; caret positions are ordinary block-start positions.
Pinned by qa-m6-caret.mjs (ArrowRight lands exactly before "D").

KP underfullTreatment removed (operator 13:55/14:05 decision: KP is
not appropriate for headline treatment): the config field, the
evaluateEdge marking (last-line + widening branches), the marker
propagation, the polish skip, the struct field, generator list,
controller resolution + ingredient, and the two test suites.
underfullTreatment is greedy-fit-only now. Full suite 582; all five
QA probes green (measurement 0/99, headline, panels, caret,
whitespace-css).
