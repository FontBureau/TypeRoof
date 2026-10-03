---
date: 2026-10-03T22:27:47+02:00
git_commit: 29e50792
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Milestone 3: hyphenation + UAX#14 segmentation"
tags: [research, codebase, text-composition, hyphenation, uax14]
status: complete
---

# Research: Milestone 3 — hyphenation + UAX#14

## Research Question

Implementation sources and plug-in points for hyphenation (Knuth-
Liang data) and UAX#14 line-break refinement, paired per the roadmap.

## Summary

- **CRITICAL FINDING — Intl.Segmenter is OUT**: the `line`
  granularity was never shipped by V8 (confirmed on node 24.18.1:
  `RangeError: Value line out of range` — only grapheme/word exist;
  browsers ship the same V8). The earlier "obvious choice" note was
  wrong. The pure-JS **`linebreak` package (1.1.0)** is the
  established UAX#14 implementation (pdfkit's; ~219KB unpacked,
  includes the Unicode data tables + dictionary hooks for Thai etc.).
- **Hyphenation engine: `hypher` (0.2.5)** — pure JS Knuth-Liang;
  pattern data via ~20 individual `hyphenation.<lang>` packages
  (small each → selective bundling keyed by language/lang). The
  alternative `hyphenopoly` (6.1.0) is WASM with all patterns
  embedded (~3.2MB unpacked) — heavier and less selective; hypher
  fits our purity + per-language + node-testing needs.
- **Plug-in points all clear** (verified in code): the Hyphenator
  runs between segmentation and measurement in composeTextblock;
  hyphen rendering is ALREADY wired via CSS ::after (the applicator
  only adds the class); mid-word segment offsets work with the
  existing applicator slicing — no algorithm or applicator changes
  needed.

## Detailed Findings

### UAX#14 segmentation

- v0 tokenizer: `/([^ ]+)|( )/g` (segmenter.ts:66) — words and
  single spaces; UAX#14 refines `segmentTextRun` within
  `assembleLogicalParagraphs` (the header comments mark the spot,
  segmenter.ts:20-22; controller header: "splits at style boundaries
  and UAX#14 break points").
- `linebreak` package API: `new LineBreak(text)` → iterate break
  opportunities with positions + required/optional flag (UAX#14
  classes; handles punctuation rules, CJK, combining marks — the
  "far too many for sliders" cases' siblings).
- Language relevance: UAX#14 is mostly locale-independent except
  dictionary scripts (Thai/Lao/Khmer/Myanmar — `linebreak` has the
  hooks); our language/lang is available per textblock
  (controller:371).

### Hyphenator pass

- Runs between segmentation and measurement (controller compose
  pipeline: segmentation → [HYPHENATOR] → measurement → algorithm);
  it splits word segments at hyphenation points: each split produces
  segments where the FIRST part includes the hyphen glyph in its
  measured width (contract, composition-types.ts:147-150) and a
  `kind:'hyphen'` break opportunity with a penalty.
- hypher API: `new Hypher(patterns).hyphenate(word)` → array of
  word parts; the hyphenation POINTS are the part boundaries.
  Constraints (min left/right chars) are pattern-built-in; our own
  min-word-length gate is policy.
- Language mapping: BCP47 `language/lang` → pattern package name
  (en-us, en-gb, de, fr, …; ~20 available). Fallback chain
  (de-AT → de) is our code. Patterns loaded lazily/statically —
  bundling decision in the plan.
- Off-switch: model-first config (hyphenation on/off + min lengths),
  inheritable like everything else — where it lives (own struct vs.
  algorithm config) is a plan question.

### Rendering (already wired — verified)

- Applicator: `-line-hyphen` class on the line's last run
  (viewer.typeroof.jsx:689-690); CSS `::after { content: "-" }`
  (line-spans.css:35-38). The hyphen glyph is NOT in the DOM text —
  selection/copy stay clean; the WIDTH is baked into the segment
  measurement Host-side.
- Mid-word offsets: hyphen splits a word into segments within the
  same source run; the next line's span starts at the mid-word
  offset into the same text — works with the existing slicing
  (viewer.typeroof.jsx:705-712), and `-line-first::before` forces
  the break. No applicator change needed.

### Contract readiness (no changes needed)

- BreakOpportunity kind 'hyphen' + penalty (composition-types.ts:
  98-115); "the Algorithm can't tell a word boundary from a hyphen
  point"; hyphen width baked into measurement (:147-150).
- The greedy algorithm treats hyphen breaks like any break — the
  penalty field is currently ignored by greedy (KP will use it);
  greedy MAY prefer a slightly-looser space break over a hyphen
  break only via order — acceptable for the milestone (documented).

## Finding: font coverage (beyond this milestone)

Probe (2026-10-03): CJK in Roboto Flex shapes to glyph 0 (.notdef,
0.44em each) — measured ~56pt vs browser-rendered ~126pt
(per-character fallback). Overfull never flags for uncovered text.
Out of scope for milestone 3 (UAX#14 breaks CJK correctly without
accurate widths); recorded as IMPORTANT in the ROADMAP (missing-
glyph diagnostic first, then fallback-font measurement via the
dynamic asset machinery).

## Code References

- `segmenter.ts:66,71-92` — tokenizer + segmentTextRun
- `composition-controller.ts:349-460` — the compose pipeline
- `composition-types.ts:79-150` — hyphen contract
- `viewer.typeroof.jsx:689-690,705-712` — rendering + slicing
- `line-spans.css:25-38` — break forcing + hyphen ::after

## Follow-up Decisions (2026-10-03, review)

1. **Q1 RESOLVED — own inheritable struct.** Hyphenation config is
   a Host control, not algorithm config: its own struct on
   TypeSpecModel ({enabled, minWordLength, minBefore, minAfter},
   OrEmpty/inherit semantics).

2. **Q2 RESOLVED — generalize the ResourceRequirement machinery.**
   No static bundling, no persistence: patterns are DYNAMIC ASSETS
   via the existing font machinery (models yield ResourceRequirement
   during metamorphoseGen; ShellController._asyncResolve resolves —
   shell.mjs:1358, the else-throw branches are the plug-in points for
   new resource kinds). An InstalledHyphenationPatternsModel state
   dependency (the InstalledFontsModel analogue) + a ForeignKey with
   CUSTOM constraint yielding the requirement (the activeFontKey
   pattern); a new _asyncResolve branch dynamic-imports the pattern
   and installs it — composition stays SYNC (assets resolve
   pre-metamorphose). Session-only, no localFontStorage. This is
   the generalization's second instance; future kinds: plugins,
   actor-library sub-states.
   LICENSING (checked): hypher BSD-3-Clause, hyphenation.en-us/.de
   MIT, hyphenopoly MIT, linebreak MIT — all Apache-2.0-compatible.
   Due diligence: pattern DATA derives from hyph-utf8 (per-pattern
   headers vary; npm packagers distribute as MIT) — keep
   provenance/license headers, NOTICE entry if kept.

   REFINEMENT: patterns are VENDORED ASSETS in-tree (e.g.
   lib/assets/hyphenation/<lang>.json, license headers kept) —
   chosen for extensibility (pattern fixes/extensions land without
   an upstream roundtrip); loaded ASYNC ON DEMAND via the
   machinery; fetch-by-URL vs await-import is an implementation
   detail (fetch fits the font precedent). The hypher ALGORITHM
   (BSD) is an npm dependency (code, not data).

3. **Q3 RESOLVED — A: full linebreak-driven segmentation.** State
   of the art, not botch: the v0 space tokenizer is REPLACED by
   UAX#14 (the linebreak package). The test document's CJK
   paragraphs (unbreakable today — no spaces) are a built-in
   behavior test.
4. **Q4 RESOLVED — ASCII hyphen-minus** measured at the run's
   font/axes via the Measurer (consistent with the CSS ::after
   rendering); U+2010 is a later refinement.

## Open Questions

1. Hyphenation config placement (model-first): own inheritable
   struct on TypeSpecModel (e.g. `hyphenation: {enabled, minBefore,
   minAfter}` — OrEmpty semantics) vs. a field on the algorithm
   structs? (The contract calls it a HOST control — argues for its
   own struct.)
2. hypher pattern loading: static imports of the needed languages
   (bundled) vs. dynamic import by language (vite code-splitting) —
   which languages to bundle initially?
3. UAX#14 scope for this milestone: full `linebreak`-driven
   segmentation (replacing the v0 tokenizer) or only punctuation
   refinement on top of v0 (CJK etc. later)?
4. The hyphen GLYPH for width measurement: measure "-" at the
   run's font/axes via the Measurer (consistent) — confirm; some
   fonts have U+2010 — use ASCII hyphen-minus (CSS renders "-" too).
