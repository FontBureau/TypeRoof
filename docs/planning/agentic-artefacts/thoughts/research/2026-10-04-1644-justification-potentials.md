---
date: 2026-10-04T16:44:42+02:00
git_commit: fde732fc
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Justification potentials / Treatment Planner (milestone 4 prep)"
tags: [research, codebase, text-composition, treatment-planner, justification-potentials, varla-varfo, milestone-4]
status: complete
---

# Research: Justification potentials / Treatment Planner (milestone 4 prep)

## Research Question

Port varla-varfo's justification to TypeRoof's text-composition:
stub the data first (hardcoded, Roboto Flex + Amstelvar flavors
only), review `_calculateFontSpec`, evaluate the "step on the line +
potentials on the container" mechanism, design the metamodel
(ordered levels that needn't bottom out), and find where to STORE
potentials (ad-hoc, document-usable; multi-font simultaneously;
future: font-author-defined, maybe distributed with the font).
Terminology: "justification spec" -> "justification potentials",
short "potentials".

Operator directions (all accounted for below): stub-first;
non-axes treatments were never measured/applied anywhere;
`calculateFontSpec` seemed elegant but wants review; levels ordered
by us ([wght, wdth, opsz]), each level may be a leaf; storage is
the great unsolved question, possibly out of scope for the roadmap.

## Summary

The demo's intellectual core is small and clean; the rest is
render-loop scaffolding that HarfBuzz makes obsolete:

- **PORT (hardened)**: `_calculateFontSpec` — recursive separable
  multilinear interpolation over the nested wght -> wdth -> opsz
  grid with edge clamping; bottoms out at any level (`'XTRA' in
  spec`). ~30 lines, already supports the "levels needn't bottom
  out" requirement.
- **PORT the data model**: leaf `{XTRA: [min,dflt,max], tracking:
  [min,0,max], wordspace: [min,0,max]}` — XTRA an axis treatment,
  tracking = ABSOLUTE pt letter-spacing (per OPSZ-DECLARED optical
  size — the mapping is design-space location -> potentials; see
  Corrections), wordspace = FACTOR of the natural space advance
  (`n/144 - 1` style; 0 = natural).
- **ADAPT the step mechanism**: single shared normalized step drives
  all enabled treatments in parallel, each `clamp(min, dflt +
  step*stepSize, max)` with staggered saturation; direction gating
  (both/narrowing/widening). In the port: the Treatment Planner
  computes concrete values (no CSS calc as compute engine),
  per-SIDE step scales instead of one max-step-size, per-treatment
  impact weights later (the demo's own TODO).
- **PORT the strategy**: narrow-first, widen-fallback; terminal
  line never widened; inter-line harmonization optional (headlines).
- **DROP wholesale**: line finding by Range probing, bisection
  against rendered layout, span packing, browser-quirk workarounds,
  generators-as-control-flow, `--font-spec-key` caching that ignores
  font-size/column-width.

TypeRoof readiness: the plumbing slot exists and is marked
(`lineWidthAtStep` placeholder, composition-controller.ts ~793);
per-leaf styles (per-run style spans) give the planner per-run
font/axes; the applicator sets per-line custom properties already
(`--line-color-code` precedent); additive non-axes width math has
the hyphen-baking precedent.

## Detailed findings

### The potentials data (varla-varfo/lib/js/typeSpec.mjs)

- `JUSTIFICATION_SPEC_{AMSTEL_VAR,ROBOTO_FLEX}` (255-353): nested
  numeric-keyed maps wght -> wdth -> opsz -> leaf. Levels always
  bottom out in current data, but the resolver tolerates early
  leaves — matching the requirement that authors refine freely.
- `WDTH_JUSTIFICATION_SPECS` (360-371): flat per-family [min,max]
  wdth stub for HEADLINE narrowing only (h1), default read live
  (step-0-identity hazard). ADAPT: fold wdth into the unified
  nested potentials with a real dflt slot.
- Ships in TypeRoof assets: Roboto Flex (13 axes incl. XTRA/wdth/
  opsz), AmstelvarA2 (avar2!), Roboto Delta, plain Roboto
  (wdth,wght only). Roboto Flex and Roboto Delta are SUFFICIENTLY
  COMPATIBLE for potentials purposes (operator, see Corrections) —
  discovery is BEST-FIT, not exact match.

### `_calculateFontSpec` review (justification.mjs:995-1063)

Semantics: per level, parse-float keys, sort, find surrounding
stops; exact hit or out-of-range -> descend single stop (CLAMP, no
extrapolation); between stops -> recurse both, then elementwise
interpolate the child results (trilinear over the grid). Leaf
detection: `'XTRA' in spec`.

Elegant: one tiny recursive function, arbitrary depth/treatments,
separable interpolation is the right model, exact-hit fast path,
clamping a safe default for curated data.

Fix in the port (hardening):
1. Asymmetric shape assumption: iterates upper stop's keys only and
   truncates to min length — malformed grids throw or silently drop.
   Add shape validation.
2. Out-of-range clamps SILENTLY (indistinguishable from config
   error) — make the policy explicit (clamp + dev note?).
3. dflt-slot interpolation: step 0 == identity only because all
   dflts are equal per treatment in current data. Enforce
   "interpolated dflt == natural value at the location" as an
   invariant (the demo hits this hazard in the wdth stub).
4. Leaf detection hardcodes 'XTRA' — make it name-agnostic
   (keys-exhausted or marker).

### Step -> treatment application (justification.mjs:1773-1958, css)

- Step budget heuristic: `stops = nTreatments * (fontSizePt/12) *
  (columnEn/65) * 10`; per-treatment step size = max(narrowRange,
  widenRange)/stops; CSS `clamp(min, dflt + step*stepSize, max)`
  per treatment; shared scalar step per line; staggered saturation
  on short-range sides; unused treatments disabled via guaranteed-
  invalid CSS values; direction gating zeros one side's stops.
- Units verified: tracking = absolute PT letter-spacing per glyph
  (`letter-spacing: calc(1pt * var(...))`); wordspace = factor of
  measured natural space width (`word-spacing: calc(spaceSize *
  factor)`); XTRA in 1/1000 em of advance (first-order), but it
  also changes outlines/kerning -> candidate estimate only, verify
  by re-shaping.
- Predictive replacement: per candidate step, set variation coords
  on the hb font, re-shape, sum advances, add tracking/wordspace
  deltas arithmetically (`trackingPt * nGlyphs`, `factor *
  spaceAdvance * nSpaces`); pick the step minimizing |slack| — no
  bisection/control loops needed. Cross-treatment coupling: XTRA/
  wdth change the SPACE advance too — measure the space at the
  candidate coords.

### TypeRoof plumbing (all verified with file:line refs)

- Injection point: `lineWidthAtStep` closure in composeTextblock
  (currently `(from,to) => widthOf(from,to)`). Planner precomputes
  per LeafStyle a step->deltaPt function (from the leaf's font
  table at the leaf's axesEntries location); the closure sums
  per-segment deltas via `styleOf(segment.sourceIndex)` — mixed-
  font lines compose linearly in pt. Contract already specifies
  normalized per-candidate steps, asymmetric directions, clamping
  beyond ±1 (composition-types.ts:122-168).
- Ingredients: the potentials (identity) must join the filter.
- Axes treatments = re-measurement: measureEm with shifted
  axesEntries; caches handle new locations. Tracking/wordspace =
  arithmetic deltas per segment (need per-segment glyph/space
  counts — precompute in the measurement loop or count on demand;
  hyphen baking is the additive-width precedent).
- Applicator (viewer.typeroof.jsx `_buildLineSpans` ~660-722):
  per-line custom properties on the line-fragment spans (the
  `--line-color-code` precedent): `--line-letter-spacing`,
  `--line-word-spacing` consumed in line-spans.css. AXIS treatments
  must MERGE into the fragment's font-variation-settings (the run
  styler owns that property — the applicator adjusts its own spans
  after/alongside). Caveat: fragments are per-leaf; per-line values
  must be computed identically per fragment (deterministic from
  line.adjustmentStep + leaf style, or carried in the payload).

### Font identity / potentials discovery (BEST-FIT)

- Font object = VideoProofFont (model/font.mjs:223-419): `name`
  (family prefix), `fullName` (origin-type + name + massaged
  version — BRITTLE as a key), `axisRanges` (frozen map by tag,
  from fvar). installedFonts/availableFonts keyed by fullName
  (session-scoped InternalizedDependency, NOT document data).
- Discovery (operator decision): BEST-FIT — a font may be claimed
  by multiple potentials tables; the MOST SPECIFIC matching
  description wins. Roboto Flex and Roboto Delta are sufficiently
  compatible, so a Delta font legitimately resolves to the Flex
  table when nothing more specific exists. A table's "description"
  is its declared constraints (family-name match + structural axes
  it navigates); specificity = how precisely it matches (more
  constrained/more specific key beats generic). Candidate
  description: family name prefix + the ordered set of navigation
  axes the table needs (all must exist in the font's axisRanges).

### Storage (the open question — recommendation)

- Font entries CANNOT carry potentials: deferred-font document
  serialization keeps only [name, version] + origin; extra fields
  silently drop (shell.mjs:360-395).
- v0 (stubs): NO model — a frozen plain-JS literal module
  (e.g. text-composition/treatment-tables.ts) + matcher. Config,
  not user data.
- Later (document-editable, multi-font): a root ordered-map field
  next to stylePatchesSource in createTypeStageModelVariantWithDefaults
  (index.typeroof.jsx:308) — serializes with the document for free.
  Keyed by font key — the best key is still open (name-prefix +
  structural-axes set is the leading candidate; fullName is
  brittle: origin prefix + massaged version).
- Metamodel shape (when built): insertion-ordered levels (list or
  insertion-ordered map — NOT alpha-key-ordered: "144" < "24" < "8"
  alphabetically would corrupt it), numeric entries VALIDATED
  MONOTONIC (coherence function; ascending or descending both
  legal, see Corrections), leaf = struct of three 3-number lists;
  early-bottom-out via a generic-value or type-switch level; the
  table declares its ordered dimension tags. Buildable from
  existing primitives (ordered-map/list models; generic-model
  custom serializeFN as escape hatch).

## Corrections / operator decisions (2026-10-04, post-review)

1. **The navigation levels are DESIGN-SPACE LOCATIONS — the third
   level is the run's OPSZ VALUE, not its actual font size.**
   Rationale (operator): when an author sets an explicit opsz
   deviating from the real size, they say "treat this run as e.g.
   a headline size" — and the justification potentials must follow
   that declared optical intent. The whole mapping is
   design-space location -> potentials; tracking etc. inherit
   whatever the opsz-declared size implies.
2. **No special fontSize dimension; level dimensions are ordered
   axis tags, and ENTRIES WITHIN A LEVEL MUST BE NUMERICALLY
   ORDERED (monotonic)** — the author can't write [8, 144, 14];
   "144, 24, 8" (descending) is fine, what matters is sortedness,
   because interpolation relies on it. Consequences:
   - a potentials table declares its ordered dimension list (axis
     tags only, e.g. [wght, wdth, opsz]) + the nested tree; each
     level may bottom out as a leaf; authors may navigate by other
     axes or deeper/shallower nesting (flexible);
   - the metamodel keeps declaration order (insertion-ordered map
     or list — NOT alpha-key-ordered: "144" < "24" < "8"
     alphabetically would corrupt it) AND validates monotonicity
     (a coherence function is the natural place);
   - the resolver may rely on monotonic entries (direction-agnostic
     handling or a defensive sort — decided in the plan).
3. **Font discovery is BEST-FIT, most-specific-wins.** Roboto Flex
   and Roboto Delta are sufficiently compatible; no exclusion
   lists. (Supersedes the initial "never match Delta" caution in
   the first draft of this document.)

## Post-implementation findings / resolutions (2026-10-05)

- **Step scale**: contract-native normalized [-1,1], separate linear
  maps on each side. |step| > 1 signals exhausted/unsatisfiable;
  concrete treatment values clamp to extrema.
- **Coupling**: all enabled treatments move in parallel (validation
  milestone). Impact-weighted ordering remains deferred.
- **Best-fit**: family-name prefixes + required navigation/treatment
  axes; longer prefix, then more axes = more specific. Roboto Delta
  legitimately uses the Flex table.
- **avar1/avar2 table anchors**: absolute authored defaults are not
  portable (Amstelvar table XTRA dflt 562 vs A2 location 400; Flex
  468 vs Delta 463). The typographic knowledge is the DELTA around
  the authored natural state. Resolved axis triples are re-anchored
  to each run's actual location (range-clamped), restoring step-0
  identity. See `docs/planning/text-composition/avar2-potentials-anchoring.md`.
- **Conditional hyphen width**: optional internal hyphens have no
  glyph/width. The Host adds one glyph only when the candidate ends
  at a taken `kind: hyphen` break. Baking all opportunities into
  segment widths over-narrowed lines in whole-hyphen increments.
- **Predictive/render parity**: after the hyphen correction, the
  operator's 280pt test has narrowed lines within 0.00–0.81px and a
  taken-hyphen line within 1.58px; only max-widened lines remain
  short (legitimate exhausted potential).
- **Performance**: corrected harness (Greedy Fit + verified 1087-
  text-node fixture) yields stable typing 1.01–1.03 and full
  recompose 1.23–1.27 ratios; baseline 1.017/1.266.
- **Storage/metamodel** remains deliberately deferred; hardcoded
  stubs are sufficient for the validation milestone. Constraints
  below/ROADMAP remain authoritative.
- **Tracking fidelity caveat**: implementation currently counts
  source code units for analytical letter-spacing width. CSS spacing
  parity across Unicode/ligature runs needs a focused probe before
  KP++ quality scoring.

## Deferred after the validation milestone

1. Per-treatment impact weights / ordering (all-in-parallel shipped).
2. Inter-line harmonization factor (headlines).
3. Fold the separate wdth headline treatment into the unified
   potentials structure.
4. Editable/document-scoped potentials storage + flexible metamodel
   (constraints captured above and in ROADMAP); eventual font-table
   distribution.
5. Dedicated Amstelvar-family tables if re-anchored shared deltas
   prove insufficient for a real font/version.
6. Tracking analytical-width parity with CSS across Unicode,
   combining sequences and ligatures.
