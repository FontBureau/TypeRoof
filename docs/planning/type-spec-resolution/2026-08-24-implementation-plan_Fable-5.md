---
title: 'Shim Flags & Relative TypeSpec Linking — Implementation Plan'
eleventyNavigation:
  parent: Planning
  key: type-spec-resolution-implementation-plan
  title: 'TypeSpec Resolution: Implementation Plan'
  order: 49
agent-created: true
---

# Implementation plan — shim flags & relative TypeSpec linking

- Date: 2026-08-24
- Agent: Fable-5
- Design source: `2026-08-24-null-typespec-analysis_Fable-5.md`
  (rounds 1–6; round 6 pins the source state at `2f6ac4b2` +
  comment-only dirt).
- Status: plan — not started.

## Working agreement (binding for the implementing session)

1. **Small, reviewable commits.** Each step below is one commit (or
   less — split further if a step grows). Never batch unrelated
   changes.
2. **Stop before every commit.** Present the proposed commit message
   and the file list for review; **commit only on the operator's
   explicit OK.** No exceptions (see `~/MANNERS.md`, COLLABORATION.md —
   including the commit-message metadata block: model, provider,
   agent version read from their actual sources).
3. **Tests are about behavior, not about functions.** Test names and
   assertions describe observable outcomes ("an unmapped node type
   resolves to the root typeSpec"), never internals ("_getBest…
   returns originTypeSpecPath"). Do not assert on cache state, call
   counts, or private helpers; assert on resolution results, DOM
   state, and rendered properties. If a test can only be written by
   reaching into a private symbol, that is a design smell to report,
   not to test around.
4. After each step: `npm run typecheck && npm run lint`, plus the test
   suite. `npm run format:write` before presenting a diff.
5. Line numbers in this plan are from the round-6 record and will
   drift; symbol names are the stable reference.

## Ordering rationale

Characterization tests come first (round 6: the resolver has zero test
coverage — no refactoring without a net). Then model flags (inert
until read), then resolver changes behind the flags, then provisioning,
then guards/UI. Every step leaves the tree green and shippable;
feature-visible behavior switches on only when the flag/link is
actually used, so no step breaks existing documents.

## Steps

### Step 0 — housekeeping (operator decision)

The tree carries two uncommitted comment-only changes
(`integration.typeroof.jsx` typo, `type-spec-models.mjs` note) and the
untracked `docs/planning/type-spec-resolution/`. Decide whether to
commit these first so the feature series starts clean. Recommended:
one `[docs]`/`[minor]` commit.

### Step 1 — characterization tests for the current resolver

New file `lib/js/components/prosemirror/type-spec-resolution.test.mjs`
(harness patterns from `integration.test.mjs`). Behaviors to pin, as
they are **today**:

- an unmapped node type resolves to the root typeSpec;
- a mapped node type with an empty link resolves to the root typeSpec;
- a link to a registered child resolves to that child;
- a link to an unregistered child falls back toward the root, level by
  level (registered grandparent wins over root);
- a link cannot escape the origin (`..`-injection attempt resolves to
  root — the `isRootOf` guard);
- multi-segment links: current single-`children` interposition
  behavior (pin it, including the arguably-broken
  `origin/children/a/b` shape — it is current behavior);
- `getTypeSpecsMethod`: selection spanning two node types yields both
  resolved typeSpecs.

No production code changes. Commit 1.

### Step 2 — logical↔storage path conversion helper

The round-3 helper: logical link segments (`../hr`, `quote/paragraph`)
↔ storage path (`children`-interleaved), `..` consuming one *logical*
level (= a `children/{key}` pair). Location: alongside the resolver in
`integration.typeroof.jsx` (or a small new module if it stays
UI-consumable — decide at review). Pure functions, no side effects
(CODINGSTYLE). Behavior tests: round-trips, `..` consumption, out-of-
bounds `..` reported (not clamped), rejection/pass-through of
malformed input. Not yet wired into the resolver. Commit 2.

### Step 3 — model flags on TypeSpecModel

`excludeFromFallback` and `noStyler`, BooleanModel, default false
(`type-spec-models.mjs`, `TypeSpecModel` — round-6 model table).
Check for an existing boolean-with-default model pattern before
creating anything new (CODINGSTYLE: search before creating). Inert:
nothing reads them yet. Behavior test: (de)serialization round-trip of
a typeSpec tree with flags set; existing documents load unchanged.
UI checkboxes are **not** in this step. Commit 3.

### Step 4 — resolver: `excludeFromFallback` in the walk

`_getBestTypeSpecPropertiesId`: during the fallback walk (not for
explicit link hits — round-2 row 2 semantics), skip typeSpecs whose
`excludeFromFallback` is true. Requires access to the typeSpec
entries, not only the registry — mind that the memo cache key already
covers `nodeSpecToTypeSpec` but **not** typeSpec flag changes; the
registered-membership re-validation on cache hits is the existing
correctness valve — verify it suffices for flag flips, otherwise the
cache needs the typeSpec instance in its key. Behavior tests:
- fallback walk passes through a flagged intermediate to its parent;
- an explicit link to a flagged typeSpec still resolves to it (row 2);
- root flagged + nothing else registered: resolution still returns
  root (the walk's final fallback is unconditional — flagged root is
  then simply silent via Step 5's `noStyler`, if set).
Commit 4.

### Step 5 — provisioning gate: `noStyler`, PM side

Round-5 principle: resolution is untouched; only styler provisioning
consults the flag on the **resolved spec**.

- `TypeSpecSubscriptions`/`UIDocumentNodeOutfitter`: when the resolved
  typeSpec has `noStyler`, do not provision `UIDocumentTypeSpecStyler`
  (subscription itself remains — marks need their parent; Q1/d1 means
  mark resolution is unchanged).
- **Prerequisite in the same step**: give `UIDocumentTypeSpecStyler` a
  `destroy()` that removes every inline style/CSS property it sets
  (round-4 item 2) — needed for styled→silent transitions.
- Behavior tests: silent node renders without the styler's inline
  styles; its marks still resolve style links from its own spec (d1);
  toggling the flag on/off adds/removes inline styles without stale
  leftovers.
Commit 5.

### Step 6 — provisioning gate: `noStyler`, Viewer side + dynamic flag

- `UIDocumentElement`: `_hasTypeSpecStyling` keeps meaning "a spec is
  resolvable at all" and **stays true for silent nodes** (round-5
  narrowing); `_provisionTypeSpecStyler` additionally checks `noStyler`
  on the resolved spec.
- Make the styler provisioning react to flag/mapping changes
  (round-4 item 4: currently constructor-time). Scope honestly: if
  full dynamism explodes, split — static-correct first, dynamism as
  its own commit.
- `nextProperties@`: Q2(c) — the silent sibling's resolved spec is
  used as margin reference; expected to need **no code change**
  (resolver returns the path regardless); cover with a behavior test:
  a styled node's after-margin against a silent next sibling uses the
  sibling's spec properties.
- Behavior tests mirror Step 5 on the viewer, plus PM↔viewer parity
  for a document containing silent nodes.
Commit 6.

### Step 7 — guards & selection UI

- `_prosemirrorDispatchTransaction` (`integration.typeroof.jsx:1268`):
  defensive guard for an empty `getTypeSpecs` result (Q3(a) makes it
  unreachable via silence; guard against the genuinely-empty case).
- Q3(a): selection/menu shows the resolved spec normally — verify no
  change needed; optional "silent" hint in the label
  (`_typeSpecFullLabel`, fundamentals) as nice-to-have.
- Behavior test: selection inside a silent node shows its spec;
  editing it changes inherited properties of children.
Commit 7.

### Step 8 — resolver: relative links (anchor recursion)

Round 3, in `getTypeSpecPropertiesIdMethod`:

- discriminator: `isExplicitlyRelative || parts[0] === Path.PARENT` →
  parent-anchored; all else origin-anchored (unchanged);
- anchor = parent node's resolved spec, recursing on
  `pathOfTypes.slice(0, -1)`; document root's parent = origin;
- apply the Step-2 helper for `..`-pair consumption **before** any
  `append` (the sanitize trap);
- out-of-bounds `..` → broken link → normal fallback walk;
- memo cache: inputs unchanged (origin + pathOfTypes +
  nodeSpecToTypeSpec) — recursion memoizes naturally.

Behavior tests: `./h3` under a mapped parent; `../hr` sibling;
unmapped parent → anchor degrades to root → `./h3` behaves like `/h3`;
out-of-bounds `..`; deep nesting; flags × relative links (silent
anchor still anchors — round-3 revision). Commit 8.

### Step 9 — mapping UI

- Flag checkboxes in the typeSpec properties panel
  (`type-spec-properties.typeroof.jsx` / TYPESPEC_PPS_MAP route —
  check how existing booleans are wired there).
- Optional: label hint for relative links in
  `UIStyleNodeToTypeSpecValueLabel` (it currently resolves the raw
  path against the root — relative links will display as broken
  without a resolution hook; at minimum show the raw link string
  distinctly).
Commit 9 (possibly split UI-per-surface).

### Step 10 — documentation

The round-5 documentation requirement ("a silent spec doesn't style
its node but still governs its marks" — feature, not leak; the
mark-rendering palette table). Where user docs live is to be decided
with the operator. Update the design document's register. Commit 10.

## Explicitly out of scope (per design document)

- CSS custom-property leakage (postponed, round 5).
- Path normalization / editable typeSpec keys (Level-2/3 in the
  models comment).
- Origin-switching (shelved, round 3).
- Option B edge-mode enum (future; groundwork laid).
- `TypeStagePaneStyler` changes (round 4: separate surface, noted,
  untouched).

## Risk register

| risk | mitigation |
|---|---|
| memo cache vs. typeSpec flag flips (Step 4) | verify re-validation valve; else extend cache key — decide at Step 4 review |
| viewer dynamism explodes (Step 6) | split commit: static-correct first |
| relative-link recursion meets unknown-type siblings (viewer "parity edge case" TODO) | pin current behavior in Step 1; do not fix silently |
| tests bind to internals under pressure | working-agreement §3; reviewer rejects such tests |
