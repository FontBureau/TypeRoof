---
title: 'NULL-TypeSpec / Silent Nodes — Design Analysis'
eleventyNavigation:
  parent: Planning
  key: type-spec-resolution-analysis-fable-5
  title: 'TypeSpec Resolution: NULL-TypeSpec Analysis'
  order: 47
agent-created: true
---

# NULL-TypeSpec / silent nodes — clean-slate analysis

- Date: 2026-08-24
- Agent: Fable-5
- Scope: `_getBestTypeSpecPropertiesId` in `lib/js/components/prosemirror/integration.typeroof.jsx`
  and the question: how to prevent, for certain node types, that TypeSpec
  styling is applied at all.
- Status: round 1 — clean-slate analysis; further rounds to be amended below.

## Current state: why at least the root TypeSpec always applies

`_getBestTypeSpecPropertiesId` (`integration.typeroof.jsx:88`) is built so
it **cannot fail**:

1. `getTypeSpecPropertiesIdMethod` (line 144ff) reads `typeSpecLink` from
   `nodeSpecToTypeSpec`. If the `typeKey` is **not mapped**,
   `typeSpecLink = ""` — the empty path. But the empty path *is* the root
   TypeSpec (`originTypeSpecPath`).
2. The `while` loop walks unregistered paths toward the root
   (`testPath.slice(0, -2)`).
3. The final fallback is unconditional:
   `return asPath ? originTypeSpecPath : format(originTypeSpecPath);` —
   **root, always.**

The central ambiguity is already documented as an open problem in the
code, at `type-spec-fundamentals.mjs:451`:

> "FIXME: can't decide whether it's an explicit NULL or root as root is
> the empty path and NULL as well! … I wonder if it makes sense to have
> an explicit null path, e.g. one that can't be a path within a typeSpec."

The empty string today means both "not mapped → default (root)" and would
be the natural candidate for "NULL" — that can't work without splitting
the semantics.

## Precedents that already exist

**1. NULL-STYLE vs. unlinked** (`type-spec-models.mjs:300ff`,
`stylePatchLinkModelMixin`): style-link edges have a `mode` enum
`link | unlinked` plus `stylePatch: ""` as NULL-STYLE. Three states:

- edge absent → inherit,
- edge tombstoned (`unlinked`) → removes an inherited edge,
- edge with `""` → explicitly nothing.

Exactly this pattern is missing at the NodeSpec→TypeSpec level:
`NodeSpecToTypeSpecEdgeModel` (`models.typeroof.jsx`) is just
`{link: StringModel, label: StringModel}` — no mode.

**2. A "no TypeSpec" render path already exists — it's just not
selectable**: `viewer.typeroof.jsx:214`:

```js
this._hasTypeSpecStyling = nodeSpecMap.has(typeKey);
```

Unknown/default-schema-only node types get **no** TypeSpec styler
(`_provisionTypeSpecStyler` is skipped, line 484) and their marks get no
style links resolved
(`applyStyleLinks = this._context.hasTypeSpecStyling !== false`,
line 692ff — commented as "ProseMirror parity"). On the ProseMirror side
this arises analogously because nodeViews are only registered for
metamodel-schema nodes (`integration.typeroof.jsx:1314ff`) — no nodeView
→ no subscription → no `UIDocumentNodeOutfitter`/`UIDocumentTypeSpecStyler`.

This is the key finding: **the "silent node" behavior is already fully
implemented**, it's just coupled to "typeKey unknown" instead of an
explicit decision.

**3. The UI label `EMPTY_TYPESPEC_LINK_LABEL = '(NULL-TYPESPEC)'`**
already exists (`type-spec-fundamentals.mjs:252`) — but is currently used
for "link points nowhere / not found", not for an explicit NULL.

**4. The "silent" flag idea has a relative in the code**: the long
comment in `models.typeroof.jsx` (~line 395) about "shim" TypeSpecs —
layers that provide structure but aren't meant to be used as block
definitions themselves. Related, but a different axis (see below).

## The three options compared

**A) Default = silent when not mapped.** Advised against. The root
fallback is deliberate (the unconditional return), and "not mapped →
inherits root" is the baseline assumption everywhere — every document
with unmapped types would change its rendering. Also, it doesn't resolve
the `""` ambiguity, it just inverts it.

**B) Explicit NULL-TYPESPEC link per node type.** Recommended. Mirrors
the `stylePatchLinkModelMixin` pattern exactly: a `mode` enum on
`NodeSpecToTypeSpecEdgeModel` (e.g. `link | null-typespec`), analogous to
`StylePatchLinkModeEnumModel`. With this:

- "edge absent" remains the default (root fallback), backward compatible;
- the FIXME in `type-spec-fundamentals.mjs:451` gets resolved (NULL is no
  longer a path but a mode);
- granularity matches the requirement exactly: "certain node-types";
- the UI pattern (`LinksMapKeyChangeSelect` with a special-options group)
  already exists for NULL-STYLE.

**C) `silent` flag on the TypeSpec itself.** Different axis: it makes a
TypeSpec transparent *for all its users*, rather than exempting one node
type from styling. Plus a resolution ambiguity:
`_getBestTypeSpecPropertiesId` walks up to the next registered ancestor —
should the walk skip silent TypeSpecs (then it's the "shim" concept) or
stop on them? Two plausible answers = design trap. If the "shim" concept
is wanted anyway, C is its own feature; for the current problem B is more
direct. B does not preclude C.

## Implications of a NULL-TYPESPEC

Most important point: **silent ≠ unstyled.** The styler sets inline
styles (`font-family`, colors) on DOM elements — those cascade to
children via CSS inheritance. A silent node therefore inherits the
rendered styling of its parent element. That is presumably exactly the
intent ("doesn't actively contribute").

But watch out for the custom properties: the generic rules in
`type-stage.css:75` and `:250`

```css
*[data-node-type] { line-height: var(--line-height); /* … */ }
.typeroof-document *[data-node-type] { padding: var(--space-before) 0 var(--space-after) 0; }
```

match on `data-node-type`, and `--line-height`/`--margin-block-*`
**inherit as custom properties**. A silent node would thus get its
parent's line-height and paddings applied — possibly surprising. This
needs either a deliberate decision ("silent = also inherits the vars")
or a marker (e.g. `data-silent-node`) with a CSS reset.

Further consequences, all with existing null handling:

- **Marks/style links inside a silent node**: no
  `intentStyleLinks`/`markStyleLinks` → unknown-style fallback
  (`UIDocumentUnknownStyleStyler`). Already implemented for the Viewer;
  on the PM side `_getStyleLinkPropertiesId` already copes with a null
  edge (`type-spec.typeroof.jsx:908ff`).
- **`nextProperties@`** (margin resolution `lineHeightAfter`/`emAfter`
  against the next sibling): silent sibling → `null`, which is the same
  state as "last child", already handled (`_checkNextProperties`,
  `_provisionTypeSpecStyler`). Semantically: the predecessor treats the
  silent neighbor like the end of the document — acceptable? Or should
  it "see through" it? To be decided.
- **Children of silent nodes**: unproblematic — resolution runs per node
  via `nodeSpecToTypeSpec` + path, not via the parent's styler.
- **Selection UI** (`getTypeSpecsMethod`, menu code lines 1861/2131):
  what does the TypeSpec display show for a selection inside a silent
  node? "(NULL-TYPESPEC)" would be consistent.
- **Mechanics**: `getTypeSpecPropertiesIdMethod` would need to be able
  to return `null`; all call sites (`viewer.typeroof.jsx:494/845`,
  `type-spec.typeroof.jsx:678/1211/1861/2131`,
  `integration.typeroof.jsx:207`) and the memo cache (which currently
  stores only a `Path`) need a sentinel. On the application side the
  Viewer path can reuse `_hasTypeSpecStyling` almost unchanged — instead
  of `nodeSpecMap.has(typeKey)`, "has an effective TypeSpec".

## Conclusion

Recommendation: option B — a `mode` enum on the
`NodeSpecToTypeSpecEdgeModel` edge, modeled on
`stylePatchLinkModelMixin`, with the application path generalized via
the existing `_hasTypeSpecStyling` mechanics.

Open design questions before implementation:

1. accept or reset custom-property inheritance on silent nodes,
2. `nextProperties` semantics at a silent sibling,
3. UI representation in selection/label.

---

# Round 2 — shim concept: decomposition and decisions

- Date: 2026-08-24 (rounds 2a–2d, concluded 21:06)
- Status: concluded; decisions recorded below.

## Direction change

Operator: the shim concept is what is currently needed; option B
(explicit NULL-TYPESPEC link mode on the edge) improves semantics a lot
and remains a good candidate for later inclusion, but is more work.
The shared groundwork (resolver sentinel, `_hasTypeSpecStyling`
generalization, CSS question) is an investment toward B, not throwaway.

## Two semantics hidden in "shim"

1. **Skip semantics** (structural shim, the original `models.typeroof.jsx`
   comment): not a legitimate resolution target; the fallback walk in
   `_getBestTypeSpecPropertiesId` passes through to the nearest non-shim
   ancestor. The node still gets styled — by the ancestor.
2. **Null semantics** (silent target): resolving here yields *no
   styler* — the node renders inherit-only. This is what the original
   question asked for.

These are not mutually exclusive; bundling them into one flag is the
design trap. They decompose into orthogonal aspects:

- **a) walk-stop / fallback exclusion**: may the fallback walk land here?
- **b) silence**: does resolving here produce no styler?
- **c) path transparency**: does this level count as a path segment in
  relative-path normalization (`../` resolution)? — deferred, belongs to
  the relative-linking round.

## Why "don't skip on walk" must be controllable: the language container

`TypeSpecModel` includes `languageTagModelMixin`
(`type-spec-models.mjs:409`). A top-level `german` container carries the
language tag and language-specific defaults. If node type `h4` is not
defined under `german`, resolution tries `german/h4` and walks up. If
"shim" implied skip-on-walk, the walk would pass through `german` to
root — losing the language defaults. A language container wants the walk
to stop there: it acts as the language's own root.

Reframing: the walk already stops at any registered typeSpec —
"landable" is the *default*, not a flag. The flags are deviations from
default.

## Decision: independent booleans, not an enum

The a×b matrix — all four rows are useful and distinct:

| `excludeFromFallback` (a) | `noStyler` (b) | meaning |
|---|---|---|
| – | – | regular typeSpec (default; also the language container — needs no flag at all) |
| ✓ | – | structural glue: fallback passes through, but an **explicit** link still styles normally — exactly what the original shim comment wanted ("would not prevent those shims to be actually used with an absolute path") |
| – | ✓ | silence-subtree: explicit links are silent **and** a fallback walk landing here yields silence — option A of round 1 as per-subtree opt-in (flag the root → all unmapped types silent) |
| ✓ | ✓ | pure NULL-anchor: silent when explicitly chosen, invisible to fallback — "deliberate silence only" |

An enum would forbid rows 3 or 4.

**Decided semantics** (operator-confirmed):

1. `noStyler` applies on **both** resolution routes — explicit link and
   fallback landing. Otherwise a walk landing on a silent spec would
   style "normally": surprising and hard to explain.
2. Both flags are `BooleanModel` on `TypeSpecModel`, default false —
   existing documents behave identically.
3. **Naming** (operator-confirmed): `excludeFromFallback` and `noStyler`
   — they provide the most context. The words "block"/"inline" are
   reserved vocabulary for the ProseMirror NodeSpec layer ("not a block"
   was rejected for the flag name because of this clash). The PM
   NodeSpec (`inline` field, content expressions) stays the
   authoritative source for display semantics; PM's schema machinery
   (content matching, splitting, keymaps) depends on it and a
   typeSpec-level override would fight the editor.
4. **Shim properties still contribute to the typeSpecnion**
   (operator-confirmed): unset properties already inherit through, and
   `TypeSpecLiveProperties`/`HierarchicalScopeTypeSpecnion` registration
   stays untouched. The flags affect only node resolution
   (`_getBestTypeSpecPropertiesId`) and styler provisioning
   (`_hasTypeSpecStyling`) — the feature is confined to the resolution
   layer.

Note: `noStyler` on the root typeSpec subsumes round-1 option A as a
per-document opt-in instead of a global semantic change.

## CSS custom-property leakage — deferred, options recorded

A `noStyler` node under the generic `*[data-node-type]` rules
(`type-stage.css:75`, `:250`) still receives inherited `--line-height`
and `--margin-block-*`. Deferred as an implementation detail; two
candidate solutions (operator):

1. **`@property` at-rule with `inherits: false`** — caveat: this is a
   *global* switch per custom property. `.editor-simple`
   (`type-stage.css:106`) deliberately relies on inheritance today (sets
   `--line-height` on the container, child rules consume it). The
   at-rule route requires an audit of all `--line-height` /
   `--margin-block-*` consumers first.
2. **Marker class / selectable attribute** (e.g. the styler-less path
   also emitting `data-no-styler`, plus a small reset rule) — locally
   scoped, risk-free.

## Relative linking / i18n — out of scope this round, design notes

The i18n use case (top-level `german`, `english` containers, each with
an `h3` child) is literally sketched in the `models.typeroof.jsx`
comment (~line 360ff: `/en_US/quote/paragraph`, `/de_DE/quote/paragraph`)
as "Level-2", with editable typeSpec keys as prerequisite.

Notes for that future round:

1. **`../h3` mixes two trees.** "The h3 child of the typespec of the
   parent node": `..` traverses the *document* tree (parent node's
   resolved typeSpec), `/h3` the *typeSpec* tree. Filesystem-style `..`
   within the typeSpec tree alone means "sibling of the base spec" —
   different. The base-of-relative-paths question must be fixed first;
   "relative to the parent node's resolved typeSpec" is the sane
   candidate (making it `./h3` rather than `../h3`). Aspect (c) bites
   here: silent/structural levels change what `..` lands on.
2. **The cheap i18n path may already exist.**
   `_getBestTypeSpecPropertiesId` resolves everything relative to
   `originTypeSpecPath` — links are appended to it, the walk is bounded
   by `isRootOf(originTypeSpecPath)`. If the origin could be pointed at
   `/german` instead of the root, the entire document switches language
   with existing per-type links unchanged, provided language containers
   mirror the same child structure. (Where `originTypeSpecPath` is wired
   up and whether it is selectable has not been verified yet.) Relative
   linking is then only *required* for mixed-language documents
   (per-subtree switching within one document).

## Round 2 conclusion

Implement the shim concept as two independent `BooleanModel` flags on
`TypeSpecModel`: `excludeFromFallback` and `noStyler`, defaults false.
`noStyler` silences both resolution routes. Property contribution to the
typeSpecnion is unaffected. Shared groundwork (resolver null sentinel,
memo-cache sentinel, call-site handling, `_hasTypeSpecStyling`
generalization) doubles as preparation for a later option B. CSS
leakage handling and relative linking are deferred with options
recorded above.

---

# Round 3 — relative linking in nodeSpecToTypeSpec; originTypeSpecPath wiring

- Date: 2026-08-24 (21:12–21:27)
- Status: analysis concluded; revises one round-2 design point (sentinel).

## The anchor model

Operator: "for a relative `../hr` resolution I need a starting point in
the typeSpec tree and anchor would be resolved by using the parent node
type-spec."

This construction dissolves the round-2 "mixes two trees" objection: the
*document* tree is consulted exactly once, to compute the **anchor** =
the parent node's resolved typeSpec (a path in the typeSpec tree). From
there, all `.`/`..` navigation is purely typeSpec-tree-local:

- `./h3` → child `h3` of the anchor
- `../hr` → sibling of the anchor (up one typeSpec level, then `hr`)
- `..` beyond `originTypeSpecPath` → out of bounds → broken link
  (the "not found is planned into it" case) → normal fallback walk

The recursion is well-founded: resolving a node needs the parent node's
resolution, which recurses on `pathOfTypes.slice(0, -1)` — strictly
shorter each step, terminating at the document root, no cycles. The
existing memo cache is compatible: it is keyed by `nodeSpecToTypeSpec`
instance + origin + joined `pathOfTypes` — exactly the inputs of the
recursive resolution.

## Anchoring rules

`Path` (`metamodel/path.ts`) provides `RELATIVE = "."`,
`PARENT = ".."`, `ROOT = "/"` and `explicitAnchoring` /
`isExplicitlyRelative`. Subtlety: a `".."`-leading path has
`explicitAnchoring === null` (only `.` and `/` are explicit anchors), so
the discriminator must be:

> parent-anchored iff `isExplicitlyRelative || parts[0] === Path.PARENT`;
> everything else (empty, `/...`, bare `h3`) stays origin-anchored —
> today's behavior, fully backward compatible.

Note: the current resolver actively *defends against* `..` — the
`isRootOf(originTypeSpecPath)` guard ("prevents that a
currentTypeSpecPath could potentially inject '..'"), and
`Path.sanitize` consumes `..` against preceding parts during `append`.
Relative links must branch *before* the append, not be bolted onto it.

## Trap: one typeSpec level = two path parts

In the typeSpec tree a logical level is the **pair** `children/{key}`.
Consequences:

1. `..` must consume a *pair* (`slice(0, -2)`, like the fallback walk
   already does), but `Path.sanitize` consumes one part per `..`. Naive
   `anchor.append('children', ...link.parts)` with a leading `..` would
   eat only the `children` segment — silently wrong. Leading `..`s must
   be counted and applied as `-2` slices explicitly.
2. The current code interposes only **one** `children` at the front. A
   multi-segment link `quote/paragraph` today becomes
   `origin/children/quote/paragraph` — not a valid typeSpec path unless
   the user spells out `children` themselves. This is exactly
   normalization item #2 in the `models.typeroof.jsx` comment
   ("/2/children/3 should become /2/3").

Recommendation: a proper bidirectional conversion — *logical* link
segments (`../hr`, `quote/paragraph`) ↔ *storage* path
(`children`-interleaved) — as a helper used by resolver, UI label, and
normalization alike. Solves the two-parts problem in one place instead
of three ad-hoc fixes.

## Interplay with round 2 — sentinel design revision

Degradation cases compose cleanly:

- Parent unmapped → parent resolves via fallback (typically origin
  root) → anchor = root → `./h3` degrades to origin-absolute `/h3`.
- Relative target not registered → fallback walk from the candidate
  toward origin, honoring `excludeFromFallback`, as usual.

But: if the parent resolved to a `noStyler` spec and the round-2
resolver returned a bare `null` sentinel, the anchor would vanish and
children's relative links would break — silence must not destroy
structure. **Revision of round 2**: the resolver **always returns the
resolved path**; `noStyler` is read as a flag *on the resolved spec* at
styler-provisioning time, not encoded as `null` in the resolution
result. This also keeps the memo cache trivially correct (still stores
only a `Path`) and shrinks the round-2 call-site changes considerably.
`null` remains only for a genuinely-nothing case, if one survives at all.

## originTypeSpecPath wiring — verified

- Constructed at layout level: `type-stage/index.typeroof.jsx:276` and
  `ramp/index.typeroof.jsx:283`, both as
  `widgetBus.rootPath.append('typeSpec')` — the layout model's
  `typeSpec` field. **Hardcoded, not selectable.**
- Passed as a **constructor argument** into five widget subtrees:
  `ProseMirror`, `TypeSpecSubscriptions`, `UIDocumentViewer`,
  `UIProseMirrorMenu`, and as the literal dependency string
  `typeSpecProperties@${originTypeSpecPath}` for `TypeStagePaneStyler`.
- `getTypeSpecPropertiesIdMethod` caches it per component
  (`_tsIdOriginKey`) — assumes origin constancy over the component's
  lifetime.

Origin-switching (`/german` as origin) is therefore *possible* but not
cheap: a model field for the origin selection plus re-provisioning of
all five subtrees on change (constructor args, plus a dependency-string
rebuild for the pane styler). The registry side is fine — `TypeSpecMeta`
registers `typeSpecProperties@` recursively for the whole tree,
language containers included.

**This flips the round-2 assessment**: with parent-anchored relative
links, the document root node's link is absolute (`/german`) and every
descendant uses relative links — switching language = **editing one
link in `nodeSpecToTypeSpec`**, zero wiring changes, works with today's
registration as-is, and even allows mixed-language documents. Relative
linking is not the "later, harder" option; it is plausibly *cheaper*
than selectable origin and strictly more capable. Origin-switching
stays on the shelf.

Practical note: the link input UI (`UINodeToTypeSpecLinksValue`,
custom free-text input on a `StringModel`) already accepts arbitrary
strings — relative paths are *enterable* today, they are just not
resolved. The feature is almost entirely resolver-side.

## Round 3 conclusion

1. Relative links in `nodeSpecToTypeSpec` are anchored at the **parent
   node's resolved typeSpec**; discriminator: leading `.` or `..`
   (via `isExplicitlyRelative || parts[0] === Path.PARENT`); bare and
   `/`-anchored links stay origin-anchored (backward compatible).
2. Implement a logical↔storage path conversion helper
   (`children`-interleaving) shared by resolver, UI, and normalization;
   `..` consumes a logical level (= a `children/{key}` pair).
3. Round-2 revision: resolver always returns the resolved path;
   `noStyler` is evaluated at styler-provisioning time from the
   resolved spec, never as a `null` resolution result.
4. Origin stays hardcoded; i18n via absolute root-node link + relative
   descendant links supersedes the origin-switching idea.

---

# Round 4 — cross-review of the Kimi-K3 analysis

- Date: 2026-08-24 (21:32–21:39)
- Source: `2026-08-24-null-typespec-analysis_Kimi-K3.md` (independent
  round-1 analysis by another model, same brief).
- Status: concluded. Largely convergent with rounds 1–3 (root-fallback
  mechanics, edge-mode idea, `_hasTypeSpecStyling` generalization) —
  good mutual validation. Adopted items and conflict resolutions below.

## Adopted from Kimi-K3

1. **`TypeStagePaneStyler` is a separate styling surface.** Pane-level
   background/language always derives from the root TypeSpec
   (`pane-styler.typeroof.jsx:29`), independent of node-level
   resolution. Suppressing node stylers does not touch it. Missing from
   rounds 1–3; belongs in the consumer list for implementation.
2. **No cleanup on styled→unstyled transition** (code-verified):
   `UIDocumentTypeSpecStyler` (`type-spec.typeroof.jsx:225`) has **no
   `destroy()`** — the `destroy` methods at lines 737/747 belong to
   `UIDocumentUnknownStyleStyler`/`UIDocumentStyleStyler`. It writes
   inline styles (`font-family`, `--units-per-em`, colors, …) that
   persist when a node transitions to silent. Implementation
   prerequisite: explicit style cleanup on styler removal.
3. **`_prosemirrorDispatchTransaction` assumes a non-empty result**
   (code-verified, `integration.typeroof.jsx:1268`):
   `[, selectedTypeSpecPath] = typeSpecs.entries().next().value`
   destructures `undefined` and throws if `getTypeSpecsMethod` ever
   returns an empty map (e.g. selection entirely inside silent nodes).
   Needs an empty-result path.
4. **Viewer `_hasTypeSpecStyling` is constructor-time state** — to
   support flag changes at runtime it must become dynamic: remove/add
   the styler, update the children context (`hasTypeSpecStyling`),
   clean stale inline styles. Rounds 1–3 said "generalize", not
   "make dynamic".
5. **Sharper NULL-STYLE reading**: `stylePatch: ""` means "no patch
   override" — the mark still receives TypeSpec-derived treatment
   (font/color/direction) via the unpatched typeSpecnion. Round 1 used
   NULL-STYLE as precedent somewhat too loosely; the precedent is the
   *mode-enum pattern*, not the runtime semantics.
6. **"Node has no TypeSpec" ≠ "TypeSpec has no edge for this mark".**
   Kimi argues silent nodes should *not* get the `unknown-style` class
   fallback — that class signals "edge missing", a different condition.
   Round 1 assumed the fallback applies. Recorded as an **open
   question** for the marks design: distinct rendering for
   "silent-node mark" vs. "unknown-style mark", or shared?

## Conflicts with decided rounds — resolutions

1. **Enum vs. independent booleans.** Kimi proposes a target-side
   `stylingMode: "styled" | "silent"` enum. It lacked the
   language-container argument (round 2) and hence never saw the
   four-row matrix; an enum forbids rows 3/4. Notably Kimi's own remark
   "a silent TypeSpec should stop resolution instead of falling
   through" is exactly row-3 semantics — convergent conclusion, weaker
   vocabulary. **Round-2 decision stands**: `excludeFromFallback` +
   `noStyler` booleans.
2. **Rich resolution record.** Kimi proposes
   `{typeSpecPath: Path|null, appliesTypeSpecStyling, reason}` as
   resolver return. Superseded by the round-3 revision (resolver always
   returns the resolved path; flags read from the resolved spec at
   provisioning time). Supporting evidence from Kimi itself: it flags
   that null-in-cache needs sentinels *and* that a target-side flag
   requires cache revalidation when the TypeSpec model changes — both
   problems evaporate under the round-3 design (cached `Path` stays
   valid; flags are read fresh per provisioning). Kimi found the bugs
   in the design it proposed.
3. **Staged migration toward "absent mapping → no styling".** Kimi
   sketches a multi-step migration to eventually flip the default.
   **Rejected** (consistent with round-1 option A): `noStyler` on the
   root typeSpec yields the same end state per document, opt-in,
   without a breaking semantic change or migration machinery.
4. **Property-stream warning — agreement.** Kimi's caution "do not put
   the flag into the inheriting processed-properties stream" is
   precisely round-2 decision #4 (flags affect resolution/provisioning
   only; typeSpecnion untouched). Independent confirmation.

## Additional clarification worth keeping

The fallback walks the **TypeSpec tree, not document ancestors** — only
`pathOfTypes.at(-1)` is consulted for the mapping lookup (Kimi states
this explicitly; rounds 1–3 knew it but never wrote it down). Round 3's
parent-anchored relative links change exactly this: they introduce the
document-ancestor dimension *deliberately and only* for computing the
anchor of relative links; origin-anchored links keep the pure
TypeSpec-tree behavior.

## Round 4 conclusion

Adopted into the implementation checklist: pane-styler as separate
surface, styler cleanup on transition, empty-result path in
`_prosemirrorDispatchTransaction`, dynamic `_hasTypeSpecStyling`,
NULL-STYLE precedent narrowed to the pattern (not the semantics).
New open question: silent-node marks vs. unknown-style rendering.
Rounds 2–3 decisions unchanged by the cross-review; two of them
(booleans, path-returning resolver) came out strengthened.

---

# Round 5 — open questions moderated and decided

- Date: 2026-08-24 (21:45–22:17)
- Status: concluded. Q1–Q3 decided; CSS leakage postponed by operator
  ("we don't need resolution now").

## The unifying principle

All three decisions below are instances of one sentence:

> **Resolution always succeeds; `noStyler` suppresses exactly one
> thing: the node's own styler provisioning.**

Marks, margins, selection UI, and the round-3 anchor recursion do not
consult the flag at all. The flag mutes one output channel of the
resolved spec; it does not change who speaks.

## Q1 — marks inside a silent node: **d1** (own resolved spec)

Style links inherit through the typeSpecnion, so marks in a silent node
resolve against the silent node's **own resolved spec** — the same rule
as for styled nodes, zero special-casing in mark handling.

Options considered: (a) `unknown-style` fallback for everything;
(b) fully bare, no styler; (c) bare + distinct marker class;
(d1) own resolved spec; (d2) nearest non-silent document ancestor's
spec ("effective styling context").

Decision rationale (operator + challenge):

- **Usage premise**: silent specs target in-between structural nodes;
  paragraphs with inline content will most likely not be silent. Marked
  content in silent nodes is an edge case — which defeats (b)'s
  original counter-argument ("kills marks for real content") and
  removes (d2)'s visual-coherence advantage.
- **Control**: edge configuration on the silent spec governs mark
  rendering — null-links and tombstones give explicit levers.
- **Least resistance**: d1 is zero-code for mark resolution; d2 would
  need ancestor-walk machinery in a second subsystem plus a
  silent-root special case, re-introducing `noStyler`-awareness where
  the principle above removes it.
- (b) conceded earlier in the exchange; (d2) conceded after the usage
  premise. The Q1/Q2 "which spec speaks for a silent node" tension
  from the moderation round evaporates under d1: the own spec speaks
  for everything.

### The mark-rendering palette under d1 (must be documented for users)

NULL-STYLE (`stylePatch: ""`) means *no patch override* (round-4
clarification) — the mark still gets a `styleLinkProperties@`
registration and `UIDocumentStyleStyler` applies the **unpatched
typeSpecnion**: font, colors, direction from the silent spec's chain.

| edge state | mark renders as |
|---|---|
| linked to patch | spec chain + patch |
| null-link (`""`) | spec chain, no patch — **not bare** |
| tombstone (`unlinked`) | bare + `unknown-style` class |
| no edge (nothing inherited) | bare + `unknown-style` class |

Consequence: there is **no edge configuration yielding fully-bare marks
without the `unknown-style` class**. The palette is "chain-styled" or
"bare-with-marker". Accepted (edge case of the edge case), recorded so
it is not discovered as a surprise later.

### Documentation requirement

Under d1, "a silent spec doesn't style its node but still governs its
marks" is a **feature with a name**, not a leak — a silent spec with
local property overrides and marked inline content shows those
properties on every marked span. Documented, defensible; undocumented,
a bug report. A property-empty silent spec (the typical shim) produces
a chain identical to its typeSpec-tree parent's, so the effect is
invisible in the common case.

### `hasTypeSpecStyling` narrowing (implementation consequence)

The Viewer's `hasTypeSpecStyling === false` must mean strictly "no spec
resolvable at all" (unknown/default-schema types). A **silent node
keeps `hasTypeSpecStyling: true`** in its children context; marks
resolve normally; only `_provisionTypeSpecStyler` checks the flag on
the resolved spec. This keeps Kimi's round-4 distinction ("node has no
TypeSpec" ≠ "TypeSpec has no edge for this mark") intact, and the
existing bare-rendering path remains exclusively for genuinely
spec-less nodes.

## Q2 — `nextProperties@` at a silent next sibling: **(c)**, fallback (a)

Use the silent sibling's **resolved spec** for
`lineHeightAfter`/`emAfter` margin resolution — under the round-3
revision the resolver returns a path regardless, so
`_checkNextProperties`/`_provisionTypeSpecStyler` need no special
casing. Fallback to (a) (treat like "last child", `null`) if (c)
surprises in practice.

(b) "see-through to the next styled sibling" rejected (operator): the
silent node has a visual appearance in the document; skipping to the
next spec-carrying node does nothing for document coherence — the
outcome is basically random.

## Q3 — selection/menu display inside a silent node: **(a)**

Show the resolved spec normally: style buttons work, editing edits the
spec (its properties still inherit to children, so editing a silent
spec is meaningful). A "silent" hint in the label is nice-to-have.
Consequence: `getTypeSpecsMethod` never returns an empty map from
silence alone; the round-4 checklist item at
`integration.typeroof.jsx:1268` shrinks to a defensive guard.

## Register after round 5

| item | status |
|---|---|
| Q1 silent-node marks | **decided: d1** |
| Q2 nextProperties at silent sibling | **decided: (c), fallback (a)** |
| Q3 selection/menu display | **decided: (a)** |
| CSS custom-property leakage | postponed (operator, round 5) |
| relative linking / logical↔storage helper | decided round 3 |
| origin-switching | shelved round 3 |

All design questions for the shim/noStyler feature are now decided or
explicitly deferred. Next step: distill rounds 2–5 into an
implementation plan.

---

# Round 6 — source status record (implementation handoff)

- Date: 2026-08-24 22:23
- Purpose: pin the source state the rounds 1–5 design refers to, for an
  implementation that will likely happen in another context/model.

## Baseline

- Branch: `demo/wikipedia`, HEAD `2f6ac4b2` ("[minor] fix a typo",
  2026-08-24).
- Working tree is **dirty** (uncommitted, comment-only changes):
  - `integration.typeroof.jsx`: typo fix in the `isRootOf` guard comment.
  - `type-spec-models.mjs`: +6 comment lines at ~line 220
    (inlineMargins/columnGap note). **All `type-spec-models.mjs` line
    numbers in this document refer to the dirty tree; against `2f6ac4b2`
    they shift by −6 after line 220.**
- `docs/planning/type-spec-resolution/` is untracked so far.
- Tooling: `npm run typecheck`, `npm run lint`, `npm run format:write`;
  tests via vitest.

## Test coverage status (gap warning)

**No test exercises the resolver.** `_getBestTypeSpecPropertiesId`,
`getTypeSpecPropertiesIdMethod`, `getTypeSpecsMethod` are referenced by
no test file. Existing tests nearby:

- `prosemirror/integration.test.mjs` (702 lines): intent-mark DOM
  round-trip, mark views, reproducing atoms, attr replay, schema
  conversion — good harness patterns to copy for resolver tests.
- `prosemirror/commands.test.mjs`, `default-schema.test.mjs`.

Implementation should start by adding characterization tests for the
current resolver behavior (root fallback, walk, `""`-link) before
touching it.

## Inventory: symbols the design touches

### Resolver core — `lib/js/components/prosemirror/integration.typeroof.jsx`

| line | symbol | role in design |
|---|---|---|
| 29 | `getPathOfTypes` | builds pathOfTypes from PM resolved path |
| 56 | `getPathsOfTypes` | selection → set of pathOfTypes |
| 88 | `_getBestTypeSpecPropertiesId` | THE resolver: candidate build, walk, unconditional root fallback (line ~122). Gets: relative-link branch (round 3), `excludeFromFallback` in the walk (round 2) |
| 135 | `_typeSpecPropertiesIdCache` | WeakMap memo, keyed nodeSpecToTypeSpec instance; memoKey = origin + asPath + pathOfTypes. Stores `Path` only — stays valid under round-3 design |
| 144 | `getTypeSpecPropertiesIdMethod` | mapping lookup (`""` when unmapped, line 176), memo, calls resolver. Gets: anchor recursion for relative links |
| 200 | `getTypeSpecsMethod` | selection → Map(typeSpec → path); Q3(a): unchanged behavior, silent specs shown |
| 1216 | `ProseMirror._getTypeSpecPropertiesId` | method assignment |
| 1268 | `_prosemirrorDispatchTransaction` | `[, x] = typeSpecs.entries().next().value` — needs defensive guard (round 4/5) |
| 1305–1345 | schema/nodeViews update | per-node-type nodeView provisioning; source of "no nodeView → no styling" for unknown types |

### Model layer

| file:line | symbol | role |
|---|---|---|
| `prosemirror/models.typeroof.jsx:417` | `NodeSpecToTypeSpecEdgeModel` = `{link: StringModel, label: StringModel}` | relative links live in `link` (free-form string, no validation); design comment block ~330–420 (shim, relative paths, normalization, i18n) precedes it |
| `models.typeroof.jsx:422` | `NodeSpecToTypeSpecMapModel` | keyed by typeKey |
| `type-spec-models.mjs:407` (dirty tree: 413) | `TypeSpecModel` | **gets the two new flags** `excludeFromFallback`, `noStyler` (BooleanModel, default false); `children` self-reference at the following line |
| `type-spec-models.mjs:300ff` | `stylePatchLinkModelMixin`, `StylePatchLinkModeEnumModel` | the mode-enum *pattern* precedent (round 4: pattern only, not semantics) |
| `metamodel/path.ts` | `Path`: `RELATIVE`/`PARENT`/`ROOT`, `explicitAnchoring`, `isExplicitlyRelative`; `sanitize` consumes `..` one part per part (the pair trap, round 3); `isRootOf`, `toRelative`, `append`, `slice` | relative-link discriminator + the logical↔storage helper builds on this |

### Styler provisioning — PM side (`prosemirror/type-spec.typeroof.jsx`)

| line | symbol | role |
|---|---|---|
| 225 | `UIDocumentTypeSpecStyler` | **no `destroy()`** — inline styles persist on removal (round 4 item 2); flag check for `noStyler` gates its provisioning |
| 486 | `UIDocumentNodeOutfitter` | per-node container; `_getTypeSpecPropertiesId` at 640; `_checkNextProperties` at 642ff (Q2 site); dynamic-widget rebuild pattern at `_provisionWidgets` 690ff |
| 730/742 | `UIDocumentUnknownStyleStyler` / `UIDocumentStyleStyler` | mark stylers; the palette of round 5 |
| 831 | `TypeSpecSubscriptions` | subscription registry; `subscribe` 1233, `_subscriptionGetDerrived` 1200 (resolves per node), mark finalization 994ff; `_createTypeSpecStylerWrapper` 1156 |
| 908 | `_getStyleLinkPropertiesId` | copes with null edge already (Q1/d1 needs no change here) |
| 1861/2131 | menu widgets using `_getTypeSpecPropertiesId` | Q3(a): unchanged |

### Styler provisioning — Viewer side (`layouts/type-stage/viewer.typeroof.jsx`)

| line | symbol | role |
|---|---|---|
| 186 | `UIDocumentElement` | `_hasTypeSpecStyling = nodeSpecMap.has(typeKey)` at 214 — **constructor-time** (round 4: must become dynamic); children context `hasTypeSpecStyling` at ~294 (round 5: silent keeps `true`); `_pathOfTypes` snapshot ~289 |
| 370/618 | `_getTypeSpecPropertiesId` assignments | resolver consumers |
| 484/494 | `_provisionTypeSpecStyler` | flag-check site; next-sibling resolution 500–520 (Q2 site, "parity edge case" TODO for unknown sibling types) |
| 558 | `UIDocumentTextRun` | mark rendering; `applyStyleLinks = this._context.hasTypeSpecStyling !== false` at ~692 — under round 5 this condition keeps meaning "no spec at all", NOT silence |
| 1145 | `UIDocumentViewer` | wiring root of viewer side |

### Live properties / registration (unchanged by design, listed for orientation)

- `layouts/type-stage/live-properties.typeroof.jsx`: `TypeSpecLiveProperties` (6),
  `StyleLinkLiveProperties` (257, `createPatched` at 308 — round-5 palette source).
- `layouts/type-stage/type-specnion.mjs:245`: `HierarchicalScopeTypeSpecnion` —
  round-2 decision #4: untouched.
- `layouts/type-stage/meta.typeroof.jsx`: `TypeSpecMeta` registers
  `typeSpecProperties@` recursively (240ff) — registry side of the walk.
- `layouts/type-stage/pane-styler.typeroof.jsx:29`: `TypeStagePaneStyler` —
  separate surface, root-bound (round 4 item 1); dependency string built
  at `type-stage/index.typeroof.jsx:490`.

### Origin wiring (round 3, verified)

- `type-stage/index.typeroof.jsx:276`, `ramp/index.typeroof.jsx:283`:
  `originTypeSpecPath = widgetBus.rootPath.append('typeSpec')` — hardcoded.
- Constructor-arg consumers: `ProseMirror`, `TypeSpecSubscriptions`,
  `UIDocumentViewer`, `UIProseMirrorMenu` (via
  `type-stage/prosemirror.typeroof.jsx` contexts), `TypeStagePaneStyler`
  (dependency string).
- Per-component origin cache: `_tsIdOriginKey` in
  `getTypeSpecPropertiesIdMethod`.

### UI for the mapping (relative links enterable today)

- `type-spec-fundamentals.mjs:467` `UINodeToTypeSpecLinksValue`
  (free-text input, no validation), `:426`
  `UIStyleNodeToTypeSpecValueLabel` (label resolution via `getEntry`,
  carries the round-1 NULL/root FIXME at ~451), `:1306`
  `UINodeSpecToTypeSpecLinksMap`.
- Labels: `typeSpecGetRawLabel`/`_typeSpecFullLabel` at 942/946 —
  Q3(a) "silent" hint would hook here.

## Design ↔ source cross-reference (compact)

| design item (round) | primary sites |
|---|---|
| flags on TypeSpecModel (2) | `type-spec-models.mjs:407` + UI in `type-spec-properties.typeroof.jsx` |
| `excludeFromFallback` in walk (2) | `integration.typeroof.jsx:110–121` |
| `noStyler` gate, PM (2,5) | `type-spec.typeroof.jsx:1156ff` wrapper creation / outfitter widgets |
| `noStyler` gate, Viewer (2,5) | `viewer.typeroof.jsx:484ff` |
| styler cleanup (4) | `UIDocumentTypeSpecStyler` needs `destroy()`, `type-spec.typeroof.jsx:225` |
| relative-link branch + anchor recursion (3) | `integration.typeroof.jsx:88–195` |
| logical↔storage helper (3) | new; consumed by resolver, labels (fundamentals 426ff), future normalization |
| dynamic `_hasTypeSpecStyling` (4) | `viewer.typeroof.jsx:214`, `_provisionWidgets` |
| line-1268 guard (4,5) | `integration.typeroof.jsx:1268` |
| characterization tests first (6) | new `*.test.mjs` beside `integration.test.mjs` |

## Round 6 conclusion

Source state pinned against `2f6ac4b2` + comment-only dirt. Biggest
handoff risks recorded: zero resolver test coverage, the dirty-tree
line-number offset in `type-spec-models.mjs`, and the two verified
traps (missing `destroy()`, line-1268 destructuring). Line numbers are
otherwise as of this record and will drift — symbol names are the
stable reference.
