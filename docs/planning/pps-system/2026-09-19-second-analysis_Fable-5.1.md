---
eleventyNavigation:
  key: "PPS System Second Analysis (2026-09-19, Fable-5.1)"
  parent: Planning
  title: 'PPS: Second Analysis (Fable-5.1)'
  order: 50
agent-created: true
agent-model: anthropic/claude-fable-5.1
date: 2026-09-19
---

# Processed Properties System (PPS) — Second Analysis

- Date: 2026-09-19
- Agent/model: `anthropic/claude-fable-5.1` (goose)
- Builds on: [`2026-09-19-initial-analysis.md`](./2026-09-19-initial-analysis.md),
  authored by `moonshotai/kimi-k3` (referred to below as **Kimi**).

## 0. Scope and method

The operator asked for an independent repeat of the research behind the
initial analysis: same three questions (purpose / why annoying / how to
refactor), same working tree (`dbe55886` plus the uncommitted
`horizontalLayout` work in `type-spec/models.mjs`, `properties-generators.mjs`,
`defaults.mjs`, `registered-properties.mjs`), and a comparison against
Kimi's conclusions.

Method: single-agent, read-only survey — no subagents. I read the core
definitions (`registered-properties-definitions.mjs`,
`registered-properties.mjs`), every `get*PPSMap` factory, all `getDefaults`
implementations (`defaults.mjs`, `type-tools-grid.mjs`, `videoproof`,
`motion-stage`, `node-specs`, `style-patches`, `ui-contextual-template`),
the resolver table in `type-driven-ui-basics.mjs`, the scope machinery
(`scope-resolution.mjs`, `type-specnion.mjs`, `live-properties.typeroof.jsx`,
`meta.typeroof.jsx`), the generators (`properties-generators.mjs`), and
`git log` for the files/commits Kimi cited. Every file:line reference in the
initial document was re-checked; the results are in section 1.

Structure of this document:

- **Section 1** — verification of Kimi's claims (agree / corrected).
- **Section 2** — **diverging conclusions**, marked ⚠. These are the places
  where I disagree with the initial analysis on substance, not detail.
- **Section 3** — findings Kimi did not cover.
- **Section 4** — refactoring directions, re-evaluated.

Where I quote or paraphrase the initial analysis, it is attributed as
**[Kimi]**. Everything not so marked is mine.

## 1. Verification of the initial analysis

### 1.1 Confirmed (no material difference)

| [Kimi] claim | Status | Note |
|---|---|---|
| Three namespaces (model field / registry `[prefix, registryKey]` / runtime `fullKey`) joined by `ProcessedPropertiesSystemRecord` | ✔ | Accurate reading of `registered-properties-definitions.mjs:102-138`. |
| `ProcessedPropertiesSystemMap` is the iteration source for `_defineGenericWidgets` | ✔ | `type-driven-ui-basics.mjs:341-370`. Note it also accepts a bare string and calls `fromPrefix` itself (line 346-348). |
| Registry entries carry `default/inherit/label/min/max/step/unit`; no validation | ✔ | |
| Effective map is `CascadingMap([local, inherited, defaults])` | ✔ | `scope-resolution.mjs:546-550`. |
| Root `defaults` layer is built by running the same generators over a synthetic primal draft | ✔ | `defaults.mjs:166-268`. |
| `inheritancePolicyGen` tombstones `inherit: false` properties | ✔ | `properties-generators.mjs:731-735`. |
| Self-documented "double use" of `prefix`, `fullKey` FIXME, `createSimpleRecord` "hopefully temporary", `_PPS_ENTRY_MARKER` "until fully integrated" | ✔ | def.mjs:114, 173-187. `_PPS_ENTRY_MARKER` is written but **never read** anywhere in `lib/` — it is dead, not merely temporary. |
| ~8 near-identical factory loops | ✔ | Actual count: `pps-maps.mjs` ×2, `fundamentals.mjs` ×2, `type-tools-grid.mjs` ×2, `models.mjs` ×1, `ui-horizontal-layout.typeroof.jsx` ×2 (both one-liners around `fromPrefix`) = 9. |
| Two dispatchers `getPPSMapForModel(parentPPSRecord, FieldType)` (grid) vs `_getPPSMapForModel(FieldType, ppsRecord)` (fundamentals, ui-horizontal-layout) with swapped argument order | ✔ | Real footgun; confirmed. The `ppsMap` resolver in `type-driven-ui-basics.mjs:220-221` calls the *injectable* variant with grid order. |
| `_excludesTypeSpecPPSMap`, `_skipPrefix`, `_skipFullKey` as hidden policy | ✔ | Also `_excludesNodeSpecPPSMap`, `_excludesTypeToolsGridPPSMap` ("I did not sanity check this, it's just copy pasta"). |
| Dead `parentPPSRecord` stub in `getTypeSpecPPSMap` propagated by copy | ✔ | Present in `pps-maps.mjs` ×2 and `type-tools-grid.mjs:getGridPropertiesPPSMap`. |
| Raw string prefixes `'axesLocations/'`, `'intentStyleLinks/'`, `'markStyleLinks/'` with "we should use a symbol here!" | ✔ | Interesting detail: `INTENT_STYLE_LINKS`/`MARK_STYLE_LINKS` constants **do exist** (def.mjs:38-39) but `pps-maps.mjs:53-56` still uses literals. |
| Growth path type-spec-ramp → grid (`28c47aa2`) → …; `25a8fe79` consolidation | ✔ | Commit messages verified. |

### 1.2 Corrected details

- **[Kimi]** "`type-specnion.mjs` is now only re-export aliases of
  `scope-resolution.mjs`". Not quite: it also *owns* the
  `DEMARCATION_PROPERTY` / `DEMARCATION_INHERITANCE` / `TOMBSTONE` symbols
  (`type-specnion.mjs:7-11`), which `scope-resolution.mjs` imports back. The
  dependency is circular-ish by design (symbols module ↔ machinery module), not
  a leftover shim.
- **[Kimi]** "`fullKey` … `registryFullKey` (`${prefix}${registryKey}`)".
  Correct, but the more important observation is *which one each consumer
  uses* — see ⚠ 2.3: `defaults.mjs` looks the registry up by `fullKey`,
  `type-tools-grid.mjs` by `registryFullKey`. Only the latter is correct for
  re-rooted records.
- **[Kimi]** puts `LANGUAGE` among the registry prefixes in passing; it is in
  fact **not** in `SYMBOLIC_TO_PREFIXES` (def.mjs:40), so
  `getFromRegistry` refuses it even though `REGISTERED_PROPERTIES[LANGUAGE]`
  exists (`registered-properties.mjs:133`). The `[LANGUAGE]` registry block is
  therefore unreachable through the public API. Small, but it shows the
  registry's "which prefixes count" gate is a second, separate policy list.

## 2. ⚠ Diverging conclusions

These are the points where I come to a **different conclusion** than the
initial analysis. They are called out prominently because they change what
a refactoring should target.

### ⚠ 2.1 There is no second ("pull") inheritance implementation

**[Kimi]** wrote: *"every widget gets a pre-bound `getDefault` … that
pull-reads the parent's effective propertiesMap by `fullKey` … So inheritance
exists twice by design: push (the scope cascade computes effective values) and
pull (widgets query the parent's effective map for display)."*

**I disagree.** `typeSpecGetDefaults` reads `getLiveProperties()`, and in
`type-spec-properties.typeroof.jsx:248-258` that is
`this.getEntry(\`typeSpecProperties@${typeSpecPath}\`)` — the
`TypeSpecLiveProperties` registered **for the typeSpec being edited itself**
(`meta.typeroof.jsx:263`, key `widgetBus.rootPath`), not for its parent.
Its `typeSpecnion.getProperties()` is the own scope's `CascadingMap([local,
inherited, defaults])`. When the model field is empty, the generator does not
yield a local value, so the read falls through to `inherited` / `defaults`
— which is exactly the *push* result.

So the widget path is a plain **read of the already-computed cascade**. There
is one inheritance mechanism, and `getDefaults` is a view on it. The
`FIXME: … Better then hard-coding the parent path in here` comment in
`defaults.mjs:84-86` (and its copy in `type-tools-grid.mjs`) describes a
state of affairs that no longer exists; the "root gives KEY ERROR" case is
handled by `typeSpecPropertiesKey === "typeSpecProperties@"` → `null`.

Consequence for refactoring: Kimi's strategic item *"Unify push/pull
defaults"* (section 4 F) has no target. What *can* be unified is the
per-prefix branching inside the `getDefaults` copies (Kimi's B), which is a
different, smaller problem.

### ⚠ 2.2 The `fromPrefix` confusion is a symptom; the cause is an unstated generator ↔ ppsMap contract

**[Kimi]** identified the concrete symptom correctly: *"`prefix = GENERIC`
while `fullKey = ${parentPPSRecord.propertyRoot}${fieldName}` — two different
bases for two roles … `fromPrefix` cannot express that combination, which is
exactly the confusion that triggered this research."*

**I read the cause differently.** For `ui-horizontal-layout.typeroof.jsx`,
`fromPrefix(GENERIC, …)` is **correct**, not a limitation:
`manualHorizontalLayoutRunion` (`properties-generators.mjs:488-560`) yields
**flat** keys — `generic/columnCount`, `generic/lineLength`,
`generic/columnGutter`, `generic/inlineMargins/start` — *not*
`generic/horizontalLayout/columnCount`. So the `fullKey` a widget must read
is `${GENERIC}${fieldName}`, and that is what `fromPrefix` produces.

The leading case is different because `leadingGen`
(`properties-generators.mjs:250-291`) yields **nested** keys:
`leading/leading/algorithm`, `leading/leading/line-height-em`,
`leading/leading/minLeading`, …. Hence `getManualLeadingPPSMap` must
re-root `fullKey` under `parentPPSRecord.propertyRoot` and additionally remap
`leading → line-height-em`.

In other words: **a ppsMap has to mirror the key layout that the matching
generator yields, and nothing in the code states, enforces, or even
co-locates that pairing.** `getManualLeadingPPSMap` lives in
`type-spec/fundamentals.mjs`; `leadingGen` lives in
`layouts/type-stage/properties-generators.mjs`; the registry entry
`[GENERIC].leading` / `[LEADING].leading` lives in a third file. Copying
the leading factory as a template for horizontal layout therefore *looks*
plausible and is wrong — precisely what happened. The `fromPrefix` API is
not the problem; the missing contract is.

This also explains why `defaults.mjs:getTypeSpecDefaultsMap` needs
special-case branches per `fullKey` (`blockMargins`, `inlineMargins`,
`columnGutter`, `lineLength`, `horizontalLayout`): each is a struct whose
generator flattens it in its own way, and the defaults builder has to
un-flatten by hand.

### ⚠ 2.3 Registry lookup by `fullKey` is broken for re-rooted records (bug, not just smell)

Not covered by **[Kimi]**.

`getFromRegistry` splits the identifier at the **first** `/`
(`def.mjs:59-72`): `generic/horizontalLayout/columnCount` →
`['generic/', 'horizontalLayout/columnCount']` → registry miss →
falls back to `modelDefaultValue` or throws KEY ERROR.

- `defaults.mjs:getFallback(fullKey, …)` and `typeSpecGetDefaults` pass
  `fullKey`. For every record whose `fullKey` is re-rooted under a parent
  (`getManualLeadingPPSMap`, `getAutoLinearLeadingPPSMap`,
  `getLineWidthLeadingPPSMap`, anything built from `parentPPSRecord`), the
  registry `default` / `label` / `unit` is **unreachable** through this path.
  It works today only because those UIs get `label`/`unit` via the resolver
  table, which calls `getRegisteredPropertySetup(ppsRecord)` → uses
  `registryCredentials` (correct), and because the live map usually has the
  value.
- `type-tools-grid.mjs:typeToolsGridGetDefaults` **already does it right**:
  `_getFallback(registryFullKey, …)` (lines 1096, 1142). The two "copies"
  Kimi called near-verbatim differ in exactly this semantic detail.
- `isInheritingPropertyFn(property)` (`registered-properties.mjs:442-447`)
  has the same flaw: for any nested key the lookup misses and the fallback
  `{inherit: true}` applies. Every nested key **silently inherits**,
  regardless of registry intent. The special case for `COLOR` (`split('/',
  2)`) is a one-off patch for the same class of problem.

This is a prerequisite fix for any refactoring that wants to lean on the
registry as the single policy location (Kimi's E).

### ⚠ 2.4 `prefix` carries three semantics, not two

**[Kimi]** described the "double use" of `prefix` (registry group +
path base). There is a **third**: behavioral flag. `SPECIFIC` means "no
registry default, caller must supply one"; `'axesLocations/'`,
`OPENTYPE_FEATURES`, `LANGUAGE` mean "value is font-dependent, key is
`${prefix}${fieldName}` not `fullKey`"; `DIMENSION` in grid is "log this
case". These branches are what the `getDefaults` copies and `_skipPrefix`
actually switch on. Splitting the record into `registryRef` + `propertyKey`
(Kimi's C) does not address this axis; it needs its own explicit field or
strategy object.

## 3. Additional findings

- **`registryKey` is almost unused.** The remap facility that motivates the
  record ("different values/instances can use the same setup") is exercised
  in exactly one place: `type-tools-grid.mjs:getPPSMapForModel`
  (`gridAxisType`, `gridAxisSelection`, `start`/`end`). Everywhere else
  `registryKey === null → modelFieldName`. The abstraction is paid for
  everywhere and used once.
- **`modelFieldName` on the record is redundant** with the ppsMap key it is
  stored under; def.mjs:189-191 already says "this may not be required at
  all". Consumers pass `fieldName` separately to `getDefaults` anyway.
- **`fieldName` is a mis-named parameter in `getDefaults`.** In the
  `axesLocations/`/`OPENTYPE_FEATURES`/`LANGUAGE` branch it is an axis tag
  or feature tag (`'YTFI'`, `'kern'`), not a model field; elsewhere callers
  pass `null` ("fieldName not required here"). It is a per-prefix sub-key.
- **Synthetic records as ad-hoc queries.** `createSimpleRecord(prefix,
  \`@${newValue}\`)` (type-bound default via `[LEADING]['@AutoLinearLeading']`),
  `createSimpleRecord(SPECIFIC, 'font')`, `createSimpleRecord(GENERIC,
  'fontSize')`, `createSimpleRecord(root, 'irrelevant')` — the record is
  being used as a *lookup handle* for `getDefaults`, which then only reads
  `.prefix` and `.fullKey`. A two-string tuple would do; the class adds
  ceremony without adding checks (the constructor only validates that
  `prefix` is not `undefined`).
- **`ui-contextual-template` opts out entirely.** Its injected `getDefaults`
  ignores the property stream and reads the model directly via
  `Path.fromString(ppsRecord.fullKey).toRelative(propertyRoot)`. The comment
  (*"Maybe a good learning for the next system: include a full path to the
  source model?"*) is a design signal: for pure-UI containers the PPS is
  being used only as a path encoder.
- **The `ppsMap` resolver hard-codes a model.** `type-driven-ui-basics.mjs:
  217-218` special-cases `LineWidthLeadingModel` before consulting
  `injectable.getPPSMapForModel`. The 20-line comment above it is the most
  honest description of the open design question in the codebase.
- **Debug noise in the uncommitted work.** `horizontalLayoutRunion` and the
  `horizontalLayout` branch in `getTypeSpecDefaultsMap` contain
  `console.log` calls; `[GENERIC].horizontalLayout.default` is a nested
  struct default, i.e. another case for the un-flattening branch list. Not a
  PPS problem, noted for cleanup.

## 4. Refactoring directions, re-evaluated

Kimi's items A–F are kept as reference points; my assessment follows each.

- **[Kimi] A — declarative override table replacing the factory loops.**
  Agree on the mechanics, but see ⚠ 2.2: the table must be defined **next to
  the generator** that yields the keys (or derived from a shared key-layout
  spec such as `PATH_SPEC_AUTO_LINEAR_LEADING` in `synthetic-values.mjs`,
  which already is that spec for leading). A table that lives in a UI module
  reproduces the current problem with less code.
- **[Kimi] B — one parameterized `getDefaults`.** Agree. Precondition:
  settle ⚠ 2.3 first (`registryFullKey` vs `fullKey`), otherwise the unified
  function inherits the wrong behavior from `defaults.mjs`. The
  `node-specs.typeroof.jsx:specGetDefaults` (no live properties) is the
  minimal core; the others add the live read plus per-prefix handlers.
- **[Kimi] C — split `registryRef` from `propertyKey`.** Agree, and add the
  third axis from ⚠ 2.4 (read strategy). A record then has: where to find UI
  metadata, where to read/yield the value, how to read it. Rename
  `fullKey → propertyKey` as the FIXME asks. Drop `modelFieldName` from the
  record (section 3).
- **[Kimi] D — centralize key construction.** Agree; the `getStyleLinks`
  helper and `pathSpec*Gen` functions show this is already half-happening.
  Use the existing `INTENT_STYLE_LINKS`/`MARK_STYLE_LINKS` constants in
  `pps-maps.mjs`; add `AXES_LOCATIONS`.
- **[Kimi] E — exclusion policy into the registry.** Agree in principle;
  blocked by ⚠ 2.3 (registry misses for nested keys) and by the
  `SYMBOLIC_TO_PREFIXES` gate (1.2), which is itself a policy list that would
  need to move.
- **[Kimi] F — unify push/pull.** ⚠ **Drop.** There is no pull
  implementation to unify (⚠ 2.1). Replace with: delete the stale
  "hard-coded parent path" FIXMEs after confirming behavior.

New, mine:

- **G — Make the generator ↔ ppsMap pairing explicit (the actual fix for the
  triggering question).** Each struct-valued field type that has a custom
  generator (`LeadingAlgorithmModel`, `HorizontalLayoutAlgorithmModel`,
  `ManualBlockMarginsModel`, `InlineLengthValueModel`, …) gets one
  co-located definition: *key layout* (flat vs re-rooted; renames such as
  `leading → line-height-em`), from which **both** the generator's yield
  keys **and** the ppsMap `fullKey`s are derived. `getTypeSpecDefaultsMap`'s
  branch list then becomes a lookup over the same definitions. This is the
  only direction that prevents the copy-the-wrong-template failure mode.
- **H — Fix `getFromRegistry`/`isInheritingPropertyFn` key resolution.**
  Either look up by `registryCredentials` everywhere (records are available
  at all `getDefaults` call sites) or make `_getPrefixAndName` aware of
  nested keys. Small, independent, and it corrects a silent inheritance bug.
- **I — Remove dead weight now**: `_PPS_ENTRY_MARKER`, the `parentPPSRecord`
  stubs in `pps-maps.mjs`/`type-tools-grid.mjs`, the `'irrelevant'` record in
  `ui-char-groups.mjs`, and the `console.log`s in the uncommitted
  `horizontalLayout` code. None of this needs design work.

Suggested order: H, I (independent, small) → G for one field type as a pilot
(leading, since the pathSpec already exists) → B → A/C/D together → E.

## 5. Method note

Single-agent survey, all `file:line` references taken directly from the
working tree on 2026-09-19 (HEAD `dbe55886` + uncommitted changes). The
initial analysis was re-read after my own survey, not before, to reduce
anchoring; agreement in section 1 is therefore independent confirmation
rather than acceptance.
