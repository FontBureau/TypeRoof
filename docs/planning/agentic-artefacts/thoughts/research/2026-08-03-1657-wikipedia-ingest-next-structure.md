---
date: 2026-08-03T16:57:00+02:00
git_commit: db9f09f72342592790dd0258da412b8c0cef1542
branch: demo/wikipedia
repository: TypeRoof
topic: "Structure of lib/js/wikipedia/ingest_next.ts: engine vs. configuration, duplication, test-file growth"
tags: [research, codebase, wikipedia, ingest, prosemirror, metamodel]
status: complete
---

# Research: Structure of the Wikipedia ingest engine (`ingest_next.ts`)

## Research Question

`lib/js/wikipedia/ingest_next.ts` has grown organically and become hard to
read. Suspicions: (a) configuration (how to handle certain elements) is
hardcoded in module constants (`KNOWN_BLOCK_TAGS`,
`FALLBACK_INLINE_CONTENT_NODES`, `SELECTORS_TO_RAW_HTML`, ...) instead of
living in `ingestWikipediaDocument`, entangling engine and setup;
(b) the same outcome is coded on different paths; (c) the test file grew
similarly. Map the current state as ground for a refactoring plan.

## Summary

- The file (975 lines) is one engine (`ingestDOM` + recursive `ingestNode`,
  a 12-branch precedence chain) plus one configured entry point
  (`ingestWikipediaDocument`). Seven pieces of policy are hardcoded at
  module level; two policy mechanisms (`markEmission`, `nodeEmission`) are
  already options and share the same shape: ordered `{selector, rule}`
  lists, first `element.matches()` wins. That shape is the natural
  generalization target.
- Duplication is real and localized: the htmlAttrs-bag + skipped-attr
  pattern appears 5x, the two mark branches differ only in the constructed
  `MarkDesc`, two mark-draft constructors share all scaffolding, two
  child-iteration helpers overlap, and five `*FromSchema` walks each get
  their own `options.proseMirrorSchema ? ... : default` guard in `ingestDOM`.
- The engine's true reserved vocabulary (contract with
  `default-schema.ts` / the sync layer) is: `doc`, `text`, `hard_break`,
  `raw_html_block`, `raw_html_inline`, `generic-style`. `paragraph` is the
  one hardcoded typeKey that is NOT reserved — it comes from the state
  schema and is used for stray-text wrapping and li-block run lifting.
- Dead code confirmed: `BODY: "doc"` mapping, the `!== "doc"` guard, the
  `traverseDom` shim (zero callers).
- Two behaviors for the same problem: inline content in a blocks-only
  container is pruned to `raw_html_block` (+ per-text-node paragraph
  wrapping) under `<section>`, but run-lifted into single paragraphs inside
  `li-block`.
- The test file (951 lines, 49 tests, all passing) defines
  `loadStateSchema` four times verbatim and depends heavily on the
  hardcoded engine defaults; the `ul`/`li` split is implemented but has no
  test.

## Detailed Findings

### 1. Module anatomy and the `ingestNode` dispatch chain

`ingestDOM` (`ingest_next.ts:845`) builds ctx from options, creates the
`"doc"` draft (`:884`), fills it from `doc.body`'s children and
unconditionally logs the report (`:887`). `ingestWikipediaDocument`
(`:899`) is the one-shot configured variant: only `proseMirrorSchema` comes
from live state; `markEmission` (`:915-926`), `nodeEmission` (`:931-943`),
`attrPolicy` (`:951-960`) and `transparentContainers: []` are decided
inline.

`ingestNode` (`:608-831`) dispatches in source order (= precedence):

| # | Branch | Lines | Emits |
|---|--------|-------|-------|
| 1 | Text node | 617–654 | `"text"` draft + accumulated marks; empty → skipped (counter); in block context wrapped in `"paragraph"` (`:643-651`) |
| 2 | Non-element | 656–658 | nothing (comments, PIs) |
| 3 | `resolveNodeEmission` claimed atom | 667–686 | named typeKey, `html` = innerHTML, `htmlAttrs` bag, optional `htmlTag` |
| 4 | `SELECTORS_TO_RAW_HTML` | 688–692 | raw_html_block/inline atom, outerHTML verbatim |
| 5 | Transparent container | 694–697 | children pass through |
| 6 | LI under UL, block context | 703–706 | delegates to `ingestListItem` (`:568-606`): `li-inline` or `li-block` + paragraph run-lifting |
| 7 | `KNOWN_BLOCK_TAGS` | 708–730 | block draft; child inline-ness from `ctx.inlineContentNodes` |
| 8 | Block-context catch-all | 732–746 | `raw_html_block` + console.log |
| 9 | `KNOWN_MARK_TAGS` | 750–802 | no node; MarkDesc pushed, descend (two sub-bodies: schema mark / generic-style) |
| 10 | BR | 804–807 | `"hard_break"` |
| 11 | `INLINE_TAGS` | 809–820 | inline node, typeKey = lowercased tag |
| 12 | Inline catch-all | 822–830 | `raw_html_inline` + console.log |

Side effects in the engine path: catch-all `console.log`s (`:739-743`,
`:825-829`) and `logReport` (`:834-842`, called unconditionally at `:887`;
prints 9 of 10 report fields — `unresolvedMarkRules` is not logged).

### 2. Hardcoded configuration inventory

| Constant | Lines | Consumers | Nature |
|----------|-------|-----------|--------|
| `KNOWN_BLOCK_TAGS` | 22–41 | branch 7 (`:708`); `isBlockChild` in `ingestListItem` (`:570-572`) | tag → block typeKey; section/figcaption entries are operator decisions for the Wikipedia demo |
| `FALLBACK_INLINE_CONTENT_NODES` | 46–53 | `inlineContentNodesFromSchema` fallback (`:420`), `ingestDOM` no-schema default (`:880-882`) | mirrors the wikipedia state schema |
| `KNOWN_MARK_TAGS` | 55–61 | branch 9 (`:750`) — doubles as the GATE "is this tag mark-ish at all" | policy |
| `INLINE_TAGS` | 67–95 | branch 11 (`:809`) | HTML phrasing-content list |
| `MW_EMPTY_ELT`, `MW_META`, `SELECTORS_TO_RAW_HTML` | 107–111 | branch 4 (`:688`) | Parsoid/Wikipedia-specific |
| `BR` → `hard_break` | 804–807 | branch 10 | special case in the chain |
| `LI` → li-inline/li-block + `"paragraph"` wrapper | 568–606, 703–706 | branch 6 | typeKeys from the wikipedia state schema |

Hardcoded typeKey/attr literals inside functions: `"doc"` (`:712`, `:884`),
`"text"` (`:625`), `"paragraph"` (`:591`, `:647`), `"hard_break"` (`:805`),
`"raw_html_block"|"raw_html_inline"` (`:524`), `"generic-style"` (`:352`),
`"li-inline"|"li-block"` (`:574`), attr names `"htmlAttrs"` (`:357`, `:374`,
`:577`, `:674`, `:717`, `:814`), `"html"` (`:526`, `:672`), `"htmlTag"`
(`:682-683`), `"data-style-name"` (`:355`).

### 3. The existing rule-list pattern (already-config mechanisms)

Both option-driven mechanisms share one shape — ordered entries, first
`element.matches(selector)` wins:

- `MarkEmissionRuleEntry` (`:154-157`): `{selector, rule}` where rule is
  `{kind: "mark", name}` or `{kind: "generic", styleName}`.
  `resolveMarkEmission` (`:457-484`): explicit rules → schema-derived mark
  for the tag (`ctx.semanticMarks`) → generic-style with the
  `KNOWN_MARK_TAGS` style name. A `"mark"` rule naming an undefined mark
  falls back to intent + `report.unresolvedMarkRules` (`:473`).
- `NodeEmissionEntry` (`:162-165`): `{selector, typeKey}`.
  `resolveNodeEmission` (`:442-448`): explicit entries → schema-derived
  selectors (`nodeSelectorsFromSchema`, `:426-436`) → null (fall through).

Constraints of the current wiring:

- `markEmission` rules are only consulted for tags already in
  `KNOWN_MARK_TAGS` (branch 9 gate at `:750`) — a rule whose selector
  targets any other tag silently never fires.
- `resolveNodeEmission` ignores `inInline`: an inline atom claimed in
  block context would be emitted where PM `block*` content rejects it.
  (Branch 3 sits above every context check.)

### 4. Duplication catalog

(a) **htmlAttrs bag + skipped-attr counting** — 5 occurrences:
`ingestListItem` (`:575-579`), known-block branch (`:713-722`), mark branch
"mark" body (`:761-765`, `:774`), mark branch generic body (`:785-786`,
`:794`), INLINE_TAGS branch (`:812-816`). The repro-atom branch (`:673-676`)
collects the bag WITHOUT skipped counting and sets `htmlAttrs`
unconditionally (even when `""`), unlike the guarded sites.
`report.skippedMarkAttrs` is fed by blocks, list items and inline nodes
too — the name no longer matches.

(b) **`newGenericStyleMarkDraft` (`:345-359`) vs `newSemanticMarkDraft`
(`:361-376`)**: identical scaffolding (create mark draft from
`marksList.constructor.Model`, set typeKey, set attrs via
`toMetaModelJSON`, conditional `htmlAttrs`). Difference: fixed
`"generic-style"` + `"data-style-name"` vs variable typeKey + attrs loop.
Both called only from the text branch (`:629-642`).

(c) **`fillContent` (`:544-557`) vs `ingestChildrenInto` (`:532-541`)**:
both iterate childNodes calling `ingestNode`; `fillContent` additionally
retargets a temp array into `draft.get("content")`.

(d) **Two mark-branch bodies** (`:753-782` vs `:783-801`): both run the
skip-count loop, collect the bag, and call
`ingestChildrenInto(el, [...marks, desc], ...)`. Only the constructed
`MarkDesc` variant (+ declared-attr harvest in the mark body, `:756-760`)
differs.

(e) **Five `*FromSchema` walks** — `semanticMarksFromSchema` (`:324`),
`schemaMarkAttrsFromSchema` (`:381`), `schemaNodeAttrsFromSchema` (`:394`),
`inlineContentNodesFromSchema` (`:411`), `nodeSelectorsFromSchema`
(`:426`) — each iterating the same schema maps, each wired in `ingestDOM`
with its own `options.proseMirrorSchema ? fn(...) : default` ternary
(`:865-882`).

### 5. Engine ↔ ProseMirror contract (what is genuinely reserved)

`default-schema.ts` defines the reserved vocabulary the sync layer
guarantees (header `:14-15`): nodes `doc` (`:22`), `text` (`:26`),
`hard_break` (`:30`), `unknown` (`:41`), `raw_html_block` (`:78`, atom,
verbatim innerHTML replay, no sanitization), `raw_html_inline` (`:103`),
`unknown_block` (`:127`), `unknown_inline` (`:159`); mark `generic-style`
(`:193`, `excludes: "_"`, parseDOM priority 60 on `*[data-style-name]`).

- Sync stand-ins: unknown typeKeys map to `unknown`/`unknown_block`/
  `unknown_inline` by content shape, original typeKey kept in the
  `unknown-type` attr (`integration.typeroof.jsx:459-465`, `:1143-1160`;
  reverse direction `:948-998`). This is why the INLINE_TAGS branch can
  emit arbitrary lowercased tag names as typeKeys.
- Reproducing atoms: a node spec that declares an `html` attr gets
  `_createReproducingGetAttrs`/`_createReproducingToDOM`
  (`integration.typeroof.jsx:601-630`); `htmlTag` (if declared) overrides
  the spec tag at replay. `htmlAttrs` presence alone selects the
  "editable attr replay" pair (`:683-692`).
- The attr guard lives OUTSIDE ingest by operator decision:
  `HTML_ATTRS_GUARD = /^(?:data-node-type|data-mark-type|data-style-name|on)|^style$/`
  (`html-attrs.ts:7-8`), enforced at both collection (`:12-23`) and replay
  (`:27-42`). The ingest-side `attrPolicy` exclude list in
  `ingestWikipediaDocument` (`:951-960`) intentionally mirrors it.
- `parseDOM` matching: `selector ?? tag` (`integration.typeroof.jsx:668-673`)
  — the metamodel `selector` field drives both ingest matching and the
  generated parseDOM rule (`models.typeroof.jsx:158-162`).

Reserved typeKeys the engine emits, each with a counterpart in
`default-schema.ts`: `doc`, `text`, `hard_break`, `raw_html_block`,
`raw_html_inline`, `generic-style`. **`paragraph` is the exception**: it is
defined only in the state schema
(`type-stage-wikipedia-initial-state.json`) yet hardcoded in the engine at
`:591` (li-block run lifting) and `:647` (stray-text wrapping).

### 6. State schema and UI wiring

`type-stage-wikipedia-initial-state.json` `proseMirrorSchema` declares 13
nodes (`section`, `paragraph-2`, `heading-1..3`, `paragraph`, `cite-link`,
`ul`, `li-inline`, `li-block`, `figure`, `figcontent`, `figcaption`) and 2
marks (`strong`, `link`). `htmlAttrs` on every node; `html` only on the two
reproducing atoms (`cite-link`, `figcontent`); `htmlTag` only on
`figcontent`; `selector` only on `cite-link`
(`sup[typeof="mw:Extension/ref"]`) and `figcontent`
(`figure > :not(figcaption)`). `li-inline`/`li-block` share group `"li"`
(ul content: `li+`). No reserved type is re-declared.

Wiring: `main.mjs:46` imports `ingestWikipediaDocument`;
`UIQueryGetWikipedia._submitHandler` (`main.mjs:119-143`) fetches the
Parsoid HTML, calls
`ingestWikipediaDocument(dom, this.getEntry("proseMirrorSchema"))`
(`:131-134`) and swaps the already-metamorphosed document into state
(`:135-141`). Schema dependency mapping: `main.mjs:248`
(`/activeState/proseMirrorSchema`). The JSON state materializes lazily via
`initTypeSpecCoherenceFn`
(`lib/js/components/layouts/type-stage/index.typeroof.jsx:59-119`).

Legacy: `ingest.ts` (JSON-intermediate approach, single export
`convertDocument`) is no longer called (`main.mjs:43-44` comment).
`main.ts:1` imports `loadWikipediaPage` from `./ingest` — **the export does
not exist**; this is the current sole `npm run typecheck` error (TS2305).
Operator direction (2026-08-03): after the demo is completed, `main.ts` and
`ingest.ts` get deleted and `ingest_next.ts` becomes the new `ingest.ts`.

### 7. Dead / unreachable code

- `BODY: "doc"` (`:23`): unreachable — `ingestDOM` never ingests `<body>`
  itself, only its children (`:884-885`); a nested `<body>` cannot occur in
  a parsed HTML Document.
- `knownBlockTypeKey !== "doc"` guard (`:712`): consequently always true.
- `traverseDom` (`:964-975`): deprecated shim, zero callers repo-wide; body
  discards its arguments and the result.
- Operator approved removal of all three (2026-08-03), plus renaming the
  misnamed report fields (`skippedMarkAttrs`, `mwEmptyElts`).

### 8. Behavioral fork: inline content in blocks-only containers

Same problem, two outcomes:

- Under `<section>` (branch 8 + text branch): each stray TEXT node is
  wrapped in its own paragraph (`:643-651`); inline ELEMENTS (`<b>`,
  `<span>`, `<br>`) are pruned to `raw_html_block` (`:732-746`; operator
  decision 2026-07-24 after log-and-crash).
- Inside `li-block` (`ingestListItem`, `:586-605`): whole inline RUNS
  (text + elements, marks intact) are lifted into a single `"paragraph"`
  per run via `flushRun`.

Operator direction (2026-08-03): keep both; run-lifting must become simply
configurable, but the current default (no block-lifting of inline runs,
i.e. prune) stays the default.

### 9. Test file (`ingest_next.test.mjs`, 951 lines, 49 tests, all pass)

12 describe blocks; entry points mix `ingestDOM` (with/without options) and
`ingestWikipediaDocument`; schema sources: none / `createSchemaModel`
(`:208-227`) / `createCitationSchemaModel` (`:388-399`, nested) /
`loadStateSchema`.

- `loadStateSchema` is defined 4x (`:562`, `:690`, `:760`, `:856`);
  copies 1+2 and 3+4 are byte-identical pairs.
- `allMarksOf` (`:229-238`) is defined ~140 lines after its first textual
  use (`:89`; no TDZ issue, but reads backwards). Overlaps with `marksOf`
  (`:28-32`). The module-scope `typeKey` helper is shadowed by destructured
  locals at `:622`, `:667`, `:738`.
- Describe #2 is named "ingestWikipediaDocument semantic marks" but both
  its tests call `ingestDOM`.
- Heavy reliance on hardcoded engine defaults without passing options:
  p→paragraph/h2→heading-2 (`:43`), section (`:141`), figcaption no-schema
  (`:936`), b→bold (`:43`, `:615`, `:677`), a→link style (`:78`), sup/abbr
  inline nodes (`:78`, `:647`), BR→hard_break (`:96`), mw-empty-elt atoms
  (`:174`), stray-text wrap (`:141`), catch-alls (`:66`, `:121`, `:136`).
- **Coverage gap: no test exercises `<ul>`/`<li>` or the
  li-inline/li-block split** (only a passing comment at `:872`);
  `ingestListItem` is untested.
- Report-field assertions are spread over all blocks (map in the task
  research; e.g. `skippedMarkAttrs` at `:92`, `:265`, `:682-685`).

## Code References

- `lib/js/wikipedia/ingest_next.ts:608-831` — `ingestNode` dispatch chain
- `lib/js/wikipedia/ingest_next.ts:22-111` — hardcoded policy constants
- `lib/js/wikipedia/ingest_next.ts:154-165` — the rule-entry shapes (generalization target)
- `lib/js/wikipedia/ingest_next.ts:442-484` — `resolveNodeEmission` / `resolveMarkEmission`
- `lib/js/wikipedia/ingest_next.ts:568-606` — `ingestListItem` (split + run-lifting)
- `lib/js/wikipedia/ingest_next.ts:845-897` — `ingestDOM` ctx wiring (5 guarded ternaries)
- `lib/js/wikipedia/ingest_next.ts:899-962` — `ingestWikipediaDocument` (configured variant)
- `lib/js/components/prosemirror/default-schema.ts:20-233` — reserved vocabulary
- `lib/js/components/prosemirror/html-attrs.ts:7-8` — replay-time attr guard
- `lib/js/components/prosemirror/integration.typeroof.jsx:601-630` — reproducing atom replay
- `lib/js/components/prosemirror/integration.typeroof.jsx:1143-1160` — unknown-type sync stand-ins
- `lib/js/wikipedia/main.mjs:119-143` — UI handler calling the ingest
- `lib/js/wikipedia/ingest_next.test.mjs:562,690,760,856` — 4x `loadStateSchema`

## Operator Decisions Recorded (2026-08-03)

1. Refactoring direction: **Option B** — generalize the ordered
   `{selector, rule}` emission-table pattern so all element handling
   (block, mark, inline node, raw, atom, void, transparent, split-item)
   is configuration passed to the engine; `ingestWikipediaDocument`
   becomes the complete, readable Wikipedia setup.
2. Preserve original document structure as much as possible. Run-lifting
   (the li-block strategy) must be a simple configuration switch and could
   be a default later, but the CURRENT default (no block-lifting; prune to
   raw_html_block) stays.
3. Approved cleanup: delete `traverseDom`, drop dead `BODY`/`"doc"` guard,
   rename report fields `skippedMarkAttrs`/`mwEmptyElts`.
4. `main.ts` + `ingest.ts` deletion (and renaming `ingest_next.ts` →
   `ingest.ts`) is deferred until the demo is completed; the TS2305
   typecheck error stays known-open until then.

## Open Questions

- Rule-kind vocabulary for the unified emission table: exact set and
  naming (`block`, `mark`, `generic`, `inlineNode`, `raw`, `atom`, `void`,
  `transparent`, `splitItem`?) — to be settled in the plan.
- How schema-derived rules (selector-carrying node specs, mark tags,
  inline-content detection) interleave with explicit rules in ONE ordered
  resolution — always after explicit entries (current behavior), or
  position-controllable?
- Context handling (`inInline`) for rules: does a context-misfit rule fall
  through to the catch-all (fixing the branch-3 hole), and is that
  observable in the report?
- What are the no-options defaults of `ingestDOM` after the move — empty
  (tests pass explicit tables) or a minimal built-in default set? Affects
  every test in describe #1.
- Where does the `"paragraph"` wrapper typeKey for stray text /
  run-lifting come from once configurable — option field with `"paragraph"`
  default?
- Should `logReport`/catch-all console.logs become opt-in (an options
  field) as part of the same move?
- Missing `ul`/`li` test coverage: add before or during the refactor
  (before would pin `ingestListItem` behavior).

## Task References

Research delegated to four parallel read-only sub-agents (2026-08-03):
dispatch-chain/duplication map, PM-layer contract, module surroundings,
test-file map. Findings merged above.
