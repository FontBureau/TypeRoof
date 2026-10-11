# Structure marks for nested combinable chains — Implementation Plan

RPI cycle: research `thoughts/research/2026-10-11-1300-structure-marks-for-nested-combinable-chains.md`
(all file:line references trace there). Date 2026-10-11, HEAD 57e1e3dc, branch
`feature/composition-and-justification`.

## Overview

Replace the Wikipedia ingest chain-demotion (nested `b/strong i/em a` chains collapse into
`generic-inline` **nodes**) with a **mark push**: outer chain elements push non-intent
`tag-*` structure marks (markSpecs carrying tag + attrs — real-world HTML semantics), the
**innermost** element's tag/attrs funnel onto the ONE composite `generic-style` intent per
run (`htmlTag`/`htmlAttrs`). Motivation: `generic-inline` has no `nodeSpecToTypeSpec` link,
so demoted chains attenuate typeSpec resolution toward the nearest registered ancestor —
the same chain under different parents would need per-context typeSpec attachments.
Marks attach to the text run's parent context directly; no attachment bookkeeping.

## Decision Log (operator, 2026-10-11, one by one)

1. **Naming (Q1)**: `tag-*` family, **canonical three only**: `tag-strong`, `tag-em`,
   `tag-a`. Selectors route deprecated tags: `b`→`tag-strong`, `i`→`tag-em`
   (marks fully dynamic in state; small fidelity upgrade accepted).
   **Extension (operator)**: unify — *every* combinable element pushes a structure mark
   and contributes to the intent; standalone elements render exactly as today; the
   existing `strong`/`link` style marks fold away; styling flows exclusively through
   `intentStyleLinks`; `markStyleLinks` stays as unused engine capability.
   **Funnel (operator idea, adopted)**: the innermost element's tag + attrs ride on the
   intent mark itself (`htmlTag`, `htmlAttrs` — the bag attr exists for exactly this),
   NOT on the edge (edges are static per intent name, innermost varies per run —
   combinatorial). Tag chain: `attrs.htmlTag || edge.tag || "span"` — htmlTag is the
   ingested truth, edge.tag the PM/menu fallback ("bold" menu intent → `<strong>`).
2. **Excludes policy (Q2)**: **(a)** reserved `generic-style` → `group: "style"`,
   `excludes: "style"` (code — `default-schema.ts:200`). Intents stay mutually exclusive
   at the PM layer (`Mark.addToSet`); `tag-*` marks get no excludes/group declarations —
   PM defaults (own type only) give free coexistence with each other + exactly one intent.
   Ingest bypasses `addToSet` regardless.
3. **`data-style-name` on wrappers (Q3)**: **(a)** viewer sets `data-style-name` only on
   `generic-style` (intent) wrappers — it IS the intent's identity and round-trip key.
   Structure wrappers render bare tag + bag; parse-back falls through the priority-60
   catch-all to the per-tag rule (`{tag: "em"}` → declared attrs harvested). No bogus
   intent capture.
4. **Missing composite patches (Q4)**: **(a)** add `"italic link"` + `"bold italic link"`
   `CompositeStylePatch` entries + `intentStyleLinks` edges — **extra, minimal, state-only
   commit before the engine switch** (the `<em><a>` chain is the demo path; must style).
5. **Report (Q5)**: **(5a)** keep structure marks in `markSets` keys (honest provenance);
   **(5b)** add `structureMarks: Record<string, number>` counter per mark name.
6. **Same-type dedupe (Q6)**: **(a)** dedupe at push time — PM allows one mark per type
   per run anyway. Semantic note (operator): nested `<em><em>` is degree-of-emphasis
   HTML semantics, but hardly used and not representable in the PM mark model without
   node structures — accepted trade. (Plan note: the pop-last funnel in fact PRESERVES
   redundant same-type nesting: `<em><em>` renders `<em><em data-style-name=…>` — outer
   mark, inner intent. Only >1 same-type *outer* marks dedupe. Degree-of-emphasis via
   patch level (e.g. a future intensity intent) fits this design; out of scope.)
7. **Blast radius (Q7)**: **(7a)** fixture regenerates wholesale in the engine phase
   (same observable change, no extra commit); **(7b)** test rewrite = rewrite combineAs
   describe to marks assertions, keep demotionRules describe, fix the rest against the
   suite run (assert behavior, not implementation).

## Current State Analysis

- Engine (`lib/js/wikipedia/ingest.ts`): mark/generic case :946-1031 branches into
  combineAs-chain demotion (:953-976, `hasCombinableDescendant` :621-651), textless
  demotion (:977-987, `hasMarkableTextDescendant` :655-682), mark push (:989-1030,
  `schemaMarkAttrs` harvest :997-1014, unresolved fallback :1001-1008). TEXT_NODE
  :812-851 pushes the ONE composite `{kind:"style"}` (:825-837, dedupe/sort/join,
  `compositeMarks` counted when joined name has a space :829-833; `markSetKey` :498-504).
  `emitDemotedInline` :702-719 + `findDemotionRule` :685-699 (demotionRules :291/:526/:1087).
  Tables: `WIKIPEDIA_MARK_RULES` :1357-1381 (b,strong→strong/bold; i,em→generic italic;
  a→link/link), `WIKIPEDIA_DEMOTE_RULES` :1343-1345.
- Reserved mark (`lib/js/components/prosemirror/default-schema.ts`): `generic-style`
  :198-243 — `excludes:"_"` :200, attrs data-style-name+htmlAttrs :201-206, parseDOM
  `*[data-style-name]` priority 60 :207-230, toDOM `["span", …]` :231-241.
- Wrap descriptors (`lib/js/components/layouts/type-stage/document-nodes-meta/derivations.mjs`):
  `getWrapMarks` :418-515 — inside-out `toReversed()` :439; generic-style branch tag from
  the intent edge else "span" :450-470; markSpec branch tag from `mmMarkSpec.get("tag")`
  :478-486; `styleLinkName` defaults to markType :490; native/mark `styleName` from
  `markStyleLinks` edge :487-497.
- Viewer (`lib/js/components/layouts/type-stage/viewer.typeroof.jsx`):
  `_createWrapperDOM` :931-947 (sets `data-style-name` :940-941 on every wrapper with
  non-null styleLinkName), `_createStylerWidgets` :949-974.
- MarkView editor-side (`lib/js/components/prosemirror/integration.typeroof.jsx`):
  `_getTag` :563-574 (markSpec tag, "span" fallback), `_applyDeclaredAttrs` :516-540.
- State (`lib/js/wikipedia/type-stage-wikipedia-initial-state.json`): marks strong/link
  :858-895; intentStyleLinks :156-181; markStyleLinks :183-197; stylePatchesSource
  :200-262 (`"bold italic"` CompositeStylePatch precedent :235-243); editingStylePatch
  "./link" :261; NO generic-inline in nodeSpecToTypeSpec :893-985.
- Composition contract (`…/text-composition/composition-controller.ts`): `_resolveLeafStyleLink`
  :635-684 — skips null styleLinkName/styleName descriptors :657-661, CONTRACT VIOLATION
  guard :668-677 (innermost wins). Textless-only demotion stays; the chain demotion goes.

## Desired End State

```
<b>bold <i>x</i></b>                    <a href="./x">y</a>
run "bold ": [generic-style "bold", htmlTag b]            → <b data-style-name="bold">bold </b>
run "x":    [tag-b, generic-style "bold italic", htmlTag i] → <b data-mark-type="tag-b"><i data-style-name="bold italic">x</i></b>
standalone: [generic-style "link", htmlTag a, htmlAttrs href] → <a data-style-name="link" href="./x">y</a>
```

- One style-resolving intent per run (contract kept by construction, now schema-enforced
  via `group/excludes "style"` at the PM layer).
- Full HTML semantics reproduction (tags, nested order, href) with ZERO typeSpec
  attachment bookkeeping — text runs resolve in their parent's context like plain runs.
- Styling flows exclusively through `intentStyleLinks` + patches; `markStyleLinks`
  capability retained but unused by the Wikipedia state.

## What We're NOT Doing

- Variant B: multi style-links per run / live property merging (rejected — free
  combinations must stay impossible; constraints force typographic shape into StylePatches).
- Per-parent/per-context typeSpec attachments for chain elements (obsoleted by design).
- `tag-b`/`tag-i` marks (Q1-B: deprecated tags upgrade to canonical via selectors).
- Degree-of-emphasis semantics for nested same-type emphasis (documented future idea).
- `npm run perf:composition` / `scripts/perf-composition` — OFF LIMITS (operator rule
  2026-10-06). Live checks use the puppeteer DEBUG harness only.
- Style-menu/UI changes beyond what markSpec enumeration surfaces implicitly.

## Implementation Approach

Four phases, one commit proposal each (RPI: pause after every phase for operator
confirmation; commit messages carry model/provider/agent metadata per COLLABORATION.md).
Phase order keeps every commit coherent: reserved-mark groundwork is behavior-neutral,
the state addition is consumable-but-unused until the engine switches, the engine switch
+ state deletions + test/fixture rewrites are one observable change, live verification
closes the cycle.

### The engine rule (the whole mechanism, for reference in Phase 3)

On descent, EVERY combinable element (mark/generic rule) does the same three things —
no outer/innermost branching:

1. push its structure `MarkDesc` (name = the rule's mark name, e.g. `tag-strong`) onto
   the marks stack — declared attrs harvested per its markSpec (`tag-a`: href + bag),
   same-name dedupe (Q6);
2. push its `combineAs` name onto the composite stack;
3. record itself as the current funnel (`el.tagName.toLowerCase()` + its attrs bag).

At TEXT_NODE: pop the LAST structure mark (it is the innermost element *for this run*),
funnel its tag/attrs onto the ONE intent mark:

```ts
const emittedMarks = [...marks]; // outer→inner
const intentName = [...new Set(composite)].sort().join(" "); // as today
const funnel = /* current innermost source element */;
if (emittedMarks.at(-1)?.kind === "mark") emittedMarks.pop(); // innermost → intent
emittedMarks.push({
    kind: "style", styleName: intentName,
    htmlTag: funnel.tag, htmlAttrs: funnel.attrs, // NEW: funneled onto the intent
});
count(report.markSets, markSetKey(emittedMarks)); // Q5a: structure names stay
```

`hasCombinableDescendant` (:621-651) and the `composite.length > 0 || …` chain condition
(:965-970) delete entirely. Per-run funnel correctness falls out: each descent into a
sibling text sets the funnel to ITS innermost element (`<b>bold <i>x</i></b>`: run "bold "
carries `htmlTag "b"`, run "x" carries `tag-b` + intent `htmlTag "i"`). Standalone
elements: push+pop → NO structure wrapper, intent carries their tag/attrs → renders
exactly as today. Same-type nesting (`<em><em>`): the popped innermost renders via the
intent's `htmlTag`, outer `tag-em` stays → redundant nesting preserved.

---

## Phase 1 — Reserved-mark groundwork (behavior-neutral code)

**Files**: `default-schema.ts`, `derivations.mjs`, `viewer.typeroof.jsx`, `integration.typeroof.jsx` (MarkView).

### Changes Required

#### 1. `generic-style` gains `htmlTag` + style group
**File**: `lib/js/components/prosemirror/default-schema.ts:198-243`
- attrs: add `"htmlTag": { default: "", validate: "string" }` (:201-206).
- `excludes: "_"` → `group: "style", excludes: "style"` (:200) — Q2a.
- parseDOM getAttrs (:209-230): harvest `"htmlTag": dom.tagName.toLowerCase()` alongside
  `data-style-name` + `collectHtmlAttrsToBag(dom, isStylerOwnedAttr)`; the bag must skip
  declared names (`htmlTag` never enters the bag).
- toDOM (:231-241): tag = `node.attrs.htmlTag || "span"`; `data-style-name` as today;
  bag replayed as today.

#### 2. Tag chain + `data-style-name` gating
**File**: `…/document-nodes-meta/derivations.mjs:450-470` (generic-style branch)
- `tag = attrs.htmlTag (non-empty) || edge tag (non-empty) || "span"` — htmlTag is the
  ingested truth, edge.tag the PM/menu fallback.

**File**: `…/type-stage/viewer.typeroof.jsx:931-947` (`_createWrapperDOM`)
- set `data-style-name` ONLY for `markType === "generic-style"` (Q3a) — the intent
  identity; structure wrappers stay bare (parse-back falls through to per-tag rules).

#### 3. MarkView editor parity
**File**: `…/prosemirror/integration.typeroof.jsx:563-574` (`_getTag`)
- for `generic-style`, read `node.attrs.htmlTag` before the markSpec/"span" fallbacks.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`, `npm run lint` pass
- [x] vitest suites green (behavior-neutral: `htmlTag` defaults `""` → edge.tag → "span",
      same DOM as today; `group/excludes "style"` only bites PM mark-set mutations,
      no test relies on ` "_"` eviction semantics)
      — two test expectations updated to the new truth (see Phase 1 note):
      integration.test.mjs reserved-mark guard asserts group/excludes "style";
      G7 (viewer behavior) queries [data-mark-type] instead of [data-style-name]
      (schema marks carry data-mark-type as their wrapper identity; data-style-name
      is the intent identity only — its presence on schema-mark wrappers was
      pre-existing parse-back corruption, now fixed by design Q3a)

#### Manual Verification
- [ ] Viewer/editor render unchanged on the current state (htmlTag empty everywhere)

**Implementation Note**: pause for operator confirmation + commit proposal.

---

## Phase 2 — State addition (extra minimal commit, Q4)

**File**: `lib/js/wikipedia/type-stage-wikipedia-initial-state.json`

### Changes Required
- `proseMirrorSchema.marks` (:858-895) ADD: `tag-strong {tag:"strong"}`,
  `tag-em {tag:"em"}`, `tag-a {attrs:[[href…],[htmlAttrs…]], tag:"a"}` (mirror the `link`
  markSpec shape — round-trip closures are generated from this alone).
- `intentStyleLinks` (:156-181) ADD: `"link" {stylePatch:"link", mode:"link", tag:"a"}`,
  `"italic link" {stylePatch:"italic link", tag:""}`, `"bold italic link" {…, tag:""}`
  (composites get the neutral ""→span fallback; simples keep semantic tags).
- `stylePatchesSource` (:200-262) ADD: `"italic link"` `{instance:{styles:["italic","link"]}, stylePatchTypeKey:"CompositeStylePatch"}`,
  `"bold italic link"` `{instance:{styles:["bold","italic","link"]}, …}`.
- KEEP (until Phase 3): `strong`/`link` markSpecs, `markStyleLinks` edges — additive only.

### Success Criteria
#### Automated Verification
- [x] typecheck/lint, full suite green (nothing consumes the additions yet)
#### Manual Verification
- [ ] style menu may surface the new intents (acceptable, note in commit msg)

**Implementation Note**: pause + commit proposal (state-only, `bdba82a1` pattern).

---

## Phase 3 — Engine switch + cleanup (the observable change)

**Files**: `ingest.ts`, `ingest.test.mjs`, initial-state JSON (deletions), fixture regen.

### Changes Required

#### 1. Engine rule (see Implementation Approach) 
**File**: `lib/js/wikipedia/ingest.ts`
- mark/generic case :946-1031: unconditional push of structure MarkDesc (harvest via
  `schemaMarkAttrs` per the rule's mark name — existing :997-1014; unresolved fallback
  :1001-1008 stays), combineAs onto composite, funnel recording; DELETE the chain branch
  (:953-976) + `hasCombinableDescendant` (:621-651). Textless guard (:977-987) stays.
- TEXT_NODE :812-851: pop-last + funnel (`htmlTag`, `htmlAttrs` on the intent MarkDesc);
  `compositeMarks` counting stays; ADD `structureMarks: Record<string, number>` counter
  (count at push, Q5b) + report field (:26-62) + `logReport` line (:1049-1063).
- `MarkDesc.style` gains `htmlTag` (:512-520); `newMarkDraft` (:327-344) serializes it.
- `WIKIPEDIA_MARK_RULES` :1357-1381: selectors `b, strong` → mark `tag-strong` combineAs
  "bold"; `i, em` → mark `tag-em` combineAs "italic"; `a` → mark `tag-a` combineAs "link".
- `combineAs` rule doc (:100-110) rewrites to the unified push+funnel semantics.

#### 2. State deletions (same commit)
- initial-state JSON: REMOVE `strong`/`link` markSpecs (:858-895), `markStyleLinks`
  edges (:183-197) — table-empty capability stays in code.
- `editingStylePatch: "./link"` (:261) — verify what it references post-unification
  (the `"link"` patch stays in stylePatchesSource; the *edge* type moves to intents).

#### 3. Tests + fixture
**File**: `lib/js/wikipedia/ingest.test.mjs`
- REWRITE `"nested-mark collapse (combineAs)"` (:1402-1547) → marks-stack assertions
  (`allMarksOf`/`marksOf`; e.g. `[[tag-b, {}], [generic-style, {data-style-name:"bold italic", htmlTag:"i", …}]]`,
  href on the intent bag, standalone cases unchanged-render).
- KEEP `"demotionRules option"` (:1652-1714) + textless describe (:1576-1649).
- Run the suite; fix remaining expectations to actual behavior (7b) — engine-level mark
  tests use local rules/schemas and stay engine-valid.
**File**: `lib/js/tests/fixtures/type-stage-wikipedia-replacement-state.json`
- regenerate wholesale from a fresh boot (7a) — document the regen procedure in the commit.

### Success Criteria
#### Automated Verification
- [x] typecheck/lint; FULL vitest suite green (525 tests, 55 files)
- [x] no `generic-inline` demotion emitted for chains (fixture document: the
      `<a href="./X">link</a>` run is now `generic-style("link", htmlTag: "a",
      htmlAttrs: href)` — no demoted nodes, no structure marks; report keys assert it)
#### Manual Verification
- [ ] operator review of the marks/fixture diff

**Implementation notes / deviations from the plan text (all behavior-preserving
or test-vehicle changes, documented for the review):**
- `structureMarks` is counted at TEXT emission per run (not at push): a
  push-counter would count funneled-away innermost marks that never land on
  any run; per-run counting matches `compositeMarks`/`markSets` provenance.
- Combinable push: the structure MarkDesc pushes only for RESOLVED `mark`
  rules; generic/unresolved combinables contribute style + funnel only (no
  structure mark exists for them — outer wrappers for such rules are not
  reproduced; the Wikipedia config uses mark rules exclusively).
- Test cascades diagnosed and fixed at the root: G7's `strong` mark vehicle
  became schema-unknown (its leaked mark crashed editor-only/compare tests —
  the test's assertion aborts run before its cleanup splice); vehicle is now
  `tag-strong`. Per-run style tests moved from markStyleLinks/strong to
  intentStyleLinks/bold; the exclusivity-guard test now stacks two
  generic-style intents (bold outer, italic inner); the unused-patch test
  tombstones the `link` intent edge first (CompositeStylePatch has no
  relativeFontSize field, so composites can't be the unused-patch vehicle).
- Fixture regen: temporary buildWorld-based script (deleted after use); the
  diff is small and semantic (+61/-24 — the frozen replacement document is
  tiny; the predicted wholesale churn applied to the full-state
  re-serialization in 57e1e3dc, not to this small fixture).
- Operator addition (this session): the state declares tag-* marks in
  markStyleLinks with EMPTY stylePatch (mode "link") — management-surface
  declarations (the marks are visible/connectable in the style-link UI).
  Mechanical consequence verified: empty-patch edges still provision
  StyleLinkLiveProperties (getStyleLinks includes any non-null edge), so
  the styleLinkProperties@ ids REGISTER — getWrapMarks now leaves
  styleName null for an empty patch (a declaration is not a style),
  keeping chain runs at exactly ONE resolved style link. The guard test
  gained the permanent regression: tag-em + intent on one run fires NO
  violation and keeps the intent's id; a non-empty patch on such an
  edge WOULD fire it (two style-resolving marks — the contract holds).
  The fixture regenerated with the edges.

**Implementation Note**: pause + commit proposal.

---

## Phase 4 — Live verification + archive

### Changes Required
- Puppeteer DEBUG probe (`scripts/puppeteer-probes/qa-structure-marks.mjs`, runner
  `scripts/debug-with-puppeteer.mjs` — NOT the perf suite): live remote Typography load;
  assert zero CONTRACT VIOLATION console errors; chains render real tags + href;
  standalone renders unchanged; marks resolve in parent contexts.
- Operator manual check in the browser.
- Archive: move research + plan docs to
  `docs/planning/agentic-artefacts/thoughts/{research,plan}/` (RPI archive rules) —
  concludes the cycle.

### Success Criteria
#### Automated Verification
- [x] probe exits 0 — PASSED on the live en/Typography load: zero
      CONTRACT VIOLATION; structure wrappers tag-em 16 / tag-a 14 /
      tag-strong 1, all 14 tag-a carrying href (declared attr); 320
      standalone links render `<a href>` (funnel tag + bag); composite
      intents wrap `<a href>`; parent-context observation consistent
      (figcaption-styled 18.7px vs paragraph-styled 24px).

#### Manual Verification
- [ ] operator confirms live behavior + archive

### Live-verification findings (two real defects caught, both fixed in
`derivations.mjs`, documented for the record):

1. **Stale descriptor state in getWrapMarks** (caught as 25 CONTRACT
   VIOLATIONs on the `<i><a>` chains): `kind`/`styleLinkName`/
   `styleLinkType`/`styleName` were declared once OUTSIDE the per-mark
   loop and never reset — the empty-patch guard (operator's
   markStyleLinks declarations) left `styleName` at the previous mark's
   value, so tag-em descriptors leaked the innermost intent's
   "italic link" and resolved their registered id. Root fix: reset the
   four fields per mark — each mark derives ONLY from itself — plus
   full inertness for empty-patch declarations (no styleLinkName
   either: structure wrappers get no styler at all).
2. **Intent htmlAttrs bag never replayed** (caught as href-less link
   wrappers): the intent branch probed
   `"htmlAttrs" in defaultSchemaSpec.marks["generic-style"]` — the SPEC
   TOP LEVEL, not `.attrs` — always false, a pre-existing bug made
   visible by unification (previously only `lang` rode intent bags,
   and lang is styler-owned — the styler re-wrote it; links carried
   href as the mark's declared attr via the working mark branch).
   Fix: probe `.attrs` (also correct for a compiled MarkType).

---

## Testing Strategy

- **Unit** (`ingest.test.mjs`): unified push+funnel (standalone / nested / partial
  nesting `<b>bold <i>x</i></b>` per-run funnels / same-type `<em><em>` / href-on-intent /
  structureMarks counter / markSets keys incl. structure names / textless demotion
  unchanged / unresolved-mark fallback with new mark names).
- **Integration**: fixture regen; state-replace stale-width regression green on the new
  fixture; suite-wide.
- **Manual/live**: puppeteer debug probe + operator review.

## Risk Notes

- `markSets` keys get longer (accepted Q5a). `editingStylePatch`/menu surfaces must be
  re-checked after Phase 3 deletions (grep consumers of `markStyleLinks`).
- `data-style-name` gating (Phase 1) must not regress generic-style round-trip: the
  intent wrapper keeps the attr; structure wrappers never carried intent meaning.
- The fixture regen is large (~1900 lines) — reviewed by report/summary, not line-by-line.
