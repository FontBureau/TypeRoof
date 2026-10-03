---
date: 2026-10-03T20:18:18+02:00
git_commit: fbe1a64f
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Milestone 2: greedy ragged algorithm (+ hyphenation data question)"
tags: [research, codebase, text-composition, algorithms, hyphenation]
status: complete
---

# Research: Milestone 2 — greedy ragged

## Research Question

Scope and contract surface for the greedy ragged algorithm; does it
include hyphenation, and where would hyphenation DATA come from?
(Note: delegate infra was down; research done directly — the
questions were narrow and the codebase well-mapped from previous
cycles.)

## Summary

- **Milestone 2 does NOT include hyphenation** per the roadmap and
  the milestone list (composition-controller.ts:65-66: "2. simple
  greedy alignment — ragged; 3. greedy ragged + hyphenation — same
  algorithm as 2, richer input"). Hyphenation is a HOST pre-pass
  (Hyphenator role) that only enriches the input — the greedy
  algorithm is literally unchanged between milestones 2 and 3.
- **Hyphenation data: nothing exists in the repo today** — no
  hypher/hyphen/hyphenopoly in dependencies, node_modules, or vendor;
  no CSS `hyphens:` usage. varla-varfo's hyphen handling was a
  DISPLAY heuristic (`_needsHyphen`, justification.mjs:660-674): the
  BROWSER hyphenated (CSS), the demo only detected mid-word breaks —
  no patterns, no data. A commented-out `hyphens` property exists in
  type-spec/models.mjs:289-290 with the note "CSS hyphens=auto
  without a lang tag won't work as expected!".
- **Data source decision for milestone 3**: TeX/Knuth-Liang
  hyphenation patterns per language — the established route is a JS
  implementation (hypher-style: pattern data as JSON + Liang's
  algorithm, small and pure; hyphenopoly is the WASM alternative).
  Selected per textblock via `language/lang` (already read by the
  controller for the Measurer). Browser CSS hyphenation as an oracle
  is OFF the table: it needs DOM layout — violates the
  no-DOM-measurement design and jsdom testing.

## Detailed Findings

### Contract surface for greedy ragged (composition-types.ts)

- `CompositionInput`: segments (widthPt at current axes), breaks
  (space/hyphen/explicit + penalty), `lineWidthPt(lineIndex)`,
  `lineWidthAtStep(from, to, step)`.
- Ragged uses ONLY step 0 (natural widths): no fitting — every line
  gets `adjustmentStep: 0` like the dummy. The Breaker fills lines
  greedily; the Fitter is a no-op.
- **Greedy ragged semantics**: walk breaks in order; a line ends at
  the last break whose natural width still fits `lineWidthPt`;
  overfull (a single segment wider than the line) → the line is that
  segment alone, flagged in diagnostics.overfullLines.
- **Last-line rule**: never widened — with adjustmentStep 0
  everywhere this is automatic; the last line just ends.
- Mandatory breaks (kind 'explicit') end lines early (the dummy
  already implements this — reuse).
- **Trailing space**: the break is AFTER the space segment, so a
  line's last segment is the space — its width must NOT count toward
  the fitting width (it collapses at line end). The dummy's widthOf
  counts it (visible as slightly-early breaks); greedy ragged should
  exclude the trailing space from the fit test but still include the
  segment in the line (the applicator renders it; CSS collapses it).
  This is the one real semantic refinement over the dummy.
- Diagnostics: overfullLines + badness per line (ragged badness:
  e.g. (lineWidth - naturalWidth) normalized — the "raggedness" the
  proofing UI will color).

### Reuse

- dummy-composition.ts: structure + explicit-break handling + test
  patterns (dummy-composition.test.mjs style).
- The dummy stays (milestone 1 infra proof; also the off/baseline
  comparison algorithm). Algorithm SELECTION is a static choice in
  the controller for now (the dynamic-struct algorithm selection is
  the model evolution, later).

### Hyphenation (milestone 3, recorded now)

- Contract ready: Hyphenator adds segments + breaks (kind 'hyphen');
  a hyphenated segment includes the hyphen glyph in its measured
  width (segmenter/controller headers); the applicator's
  `-line-hyphen` class + `::after{content:'-'}` CSS are already
  wired (viewer.typeroof.jsx:689, line-spans.css).
- Open for the milestone-3 cycle: pattern format/dependency choice
  (hypher vs vendored TeX patterns vs hyphenopoly), pattern
  loading/bundling per language, language fallbacks (de-AT → de).

## Code References

- `composition-controller.ts:65-66` — milestone 2/3 wording
- `composition-types.ts` — CompositionInput/Result, last-line rule,
  BreakOpportunity
- `dummy-composition.ts` — structure to reuse
- `segmenter.ts` — break-after-space semantics
- `viewer.typeroof.jsx:689` + `line-spans.css` — hyphen rendering
  already wired
- `type-spec/models.mjs:289-290` — commented-out CSS hyphens note
- `~/varla-varfo/lib/js/justification.mjs:660-674` — display-only
  hyphen heuristic (no data)

## Follow-up Decisions (2026-10-03, review)

1. **Q1 RESOLVED — slack-based badness**: `badness = (lineWidth −
   naturalWidth) / lineWidth` per line (0 = full, →1 = loose;
   overfull ≥ 1). Baseline algorithm; KP may eventually produce
   ragged text too — no investment here now.

2. **Q2 RESOLVED — trailing space**: kept IN the line (semantic
   value: copy/paste, text search, selection), excluded only from
   the fit test (it collapses at line end). 'explicit' breaks have
   no trailing-space question (the line ends before the break
   opportunity).

3. **Q3 RESOLVED — dynamic struct NOW, per typeSpec.** Algorithm
   selection + configuration as a dynamic type (precedents:
   createAvailableTypes/createDynamicType as in CharsSelectorModel;
   CharGroupOptionsModel), types: Dummy { segmentsPerLine default 4 },
   GreedyRagged {} (no config yet); INHERIT = OrEmpty around the
   dynamic type (CombinatorOrCharsSelectorModel precedent). Travel:
   WHOLE STRUCTS through the properties stream under a namespaced
   key, inheriting by default — the style-links precedent
   (intentStyleLinks/* carry struct instances,
   registered-properties-definitions.mjs). A new textCompositionGen
   yields boolean + struct; the drive reads the resolved struct per
   textblock, switches on type, passes config to the implementation;
   ingredients snapshot gains the struct identity (an algorithm
   change invalidates). Per-typeSpec selection also brings
   per-textblock ENGAGEMENT of the boolean into scope (same
   mechanism).

4. **CORRECTIONS (2026-10-03)**: (a) The precedent to follow is
   `horizontalLayout` / HorizontalLayoutAlgorithmModel
   (type-spec/horizontal-layout-models.mjs:177, createDynamicModel;
   the generator yields horizontalLayout/algorithm + instance,
   properties-generators.mjs:544ff) — NOT intentStyleLinks.
   (b) Configuration MODELS live in the type-spec submodule;
   algorithm IMPLEMENTATION in greedy-ragged.ts.
   (c) Keep the boolean (explicit off = we do nothing ourselves —
   correct as is); a coherence function clears the algorithm struct
   to empty/inherit when composition is off.
   (d) BUG + PHASE 1 OF THE CYCLE: the textComposition boolean is
   NOT inheritable today (BooleanDefaultTrueModel, read from the
   ROOT typeSpec only — turning it off on t1 does nothing in the
   viewer). Fix: BooleanDefaultTrueOrEmptyModel (empty = inherit),
   yielded into the properties stream, resolved PER TEXTBLOCK by
   the drive — turning it off on `paragraphs` must turn it off on
   `paragraphs/t1` and `paragraphs/t2`.

## Open Questions

1. Ragged badness formula for diagnostics (raggedness per line:
   slack/lineWidth? KP-style badness^3? — proofing will visualize
   it; pick something simple and documented).
2. Trailing-space handling confirmed as above (exclude from fit
   test, keep in line)? Any interplay with 'explicit' breaks?
3. Where the algorithm module lives: `greedy-ragged.ts` next to
   `dummy-composition.ts`, exporting a CompositionAlgorithm;
   controller picks it (static switch or replaces the dummy call?).
