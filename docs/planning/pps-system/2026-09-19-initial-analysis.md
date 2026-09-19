---
eleventyNavigation:
  key: "PPS System Initial Analysis (2026-09-19)"
  parent: Planning
  title: 'PPS: Initial Analysis'
  order: 43
agent-created: true
agent-model: moonshotai/kimi-k3
date: 2026-09-19
---

# Processed Properties System (PPS) — Initial Analysis

- Agent/model: `moonshotai/kimi-k3` (goose). Attribution added
  2026-09-19; see the follow-up
  [second analysis (Fable-5.1)](./2026-09-19-second-analysis_Fable-5.1.md).

## The task this document answers

While implementing `getManualHorizontalLayoutPPSMap` in
`lib/js/components/type-spec/ui-horizontal-layout.typeroof.jsx` (a file that
started as a copy of `fundamentals.mjs`), the question came up whether a
helper exists for creating a straightforward ppsMap of GENERIC records
(answer: yes, `ProcessedPropertiesSystemMap.fromPrefix`).

That surfaced a broader suspicion: **the ppsMap / processed-properties
system is not clearly formulated and seems to mix too many concepts.** The
operator commissioned a research task with three questions:

1. What is the system's purpose?
2. Why is it complicated/annoying to work with?
3. How could it be refactored into a more pleasant system?

The research was done as three parallel read-only code surveys (core
definitions, consumption/UI side, runtime data side) over the TypeRoof
codebase, plus a look at git history. This document is the synthesis. It is
an *analysis*, not a plan — section 4 lists candidate refactoring
**directions** only; no refactor planning has been done.

## 1. Mental model: three namespaces, one join key

The PPS exists because three namespaces all have to agree about "property X",
and they evolved to name things differently:

| Namespace | Expressed as | Lives in |
|---|---|---|
| **Model fields** | `modelFieldName` (e.g. `fontSize` in `TypeSpecModel.fields`) | metamodel models |
| **Registry entries** | `[prefix, registryKey]` → `{default, inherit, label, min, max, step, unit}` | `REGISTERED_PROPERTIES` (`registered-properties.mjs:61`) |
| **Runtime properties** | `fullKey` string (e.g. `generic/fontSize`) in a per-scope `propertiesMap` | scope machinery (`layouts/type-stage/scope-resolution.mjs`) |

The registry is grouped by **prefix constants** (`GENERIC = 'generic/'`,
`COLOR = 'colors/'`, `NUMERIC = 'numericProperties/'`, `LEADING`,
`DIMENSION`, `SPECIFIC`, …, defined in
`registered-properties-definitions.mjs:14-41`). Each entry carries static
semantics: default value, inheritance flag, UI label, and slider hints
(`min`/`max`/`step`/`unit` — consumed by UI widgets, no validation logic).

`ProcessedPropertiesSystemRecord` is the **join key** between the three
namespaces: one object carrying `prefix`, `modelFieldName`, `fullKey`,
`registryKey`, with derived getters `propertyRoot` (`` `${fullKey}/` ``),
`registryCredentials` (`[prefix, registryKey]`) and `registryFullKey`
(`` `${prefix}${registryKey}` ``). Given a record you can answer: *which
model field is this*, *which registry setup applies*, and *under which key
does the value travel in the runtime properties stream*.

A `ProcessedPropertiesSystemMap` is an ordered, type-checked
`fieldName → record` map (`registered-properties-definitions.mjs:141`). Its
primary use is as the **iteration source for widget generation**:
`_defineGenericWidgets` (`type-driven-ui-basics.mjs:341`) walks it and
builds one UI widget per field, resolving constructor arguments (label,
unit, default-getter, …) from the record through the `baseResolvers` table
(`type-driven-ui-basics.mjs:96-237`).

### The runtime side in one paragraph

Properties are flat `fullKey → value` string maps, one per scope
(typically per document node / per typeSpec). A scope's effective map is a
`CascadingMap` of three layers: `local > inherited > defaults`
(`scope-resolution.mjs:544-553`). Local entries come from generator
functions yielding `[fullKey, value]` pairs (`properties-generators.mjs`,
collected by `collectPropertyGeneratorEntries`). Inheritance means: the
child layers in the parent's **outbound projection**
(`getInheritableProperties()`), where the parent's inheritance controls are
applied — `TOMBSTONE` withholds a property, a value control re-routes it —
and the default policy tombstones everything the registry marks
`inherit: false` (`inheritancePolicyGen`, `properties-generators.mjs:729`;
`isInheritingPropertyFn`, `registered-properties.mjs:442`). The root scope's
`defaults` layer is built by running the *same* generators over a synthetic
primal draft whose fields were filled by `typeSpecGetDefaults` with no live
properties — i.e. reduced to registry defaults (`defaults.mjs:168-235`).

Separately, **widgets need to display inherited defaults** ("empty means:
inherits value V"). For that, every widget gets a pre-bound
`getDefault` (resolver at `type-driven-ui-basics.mjs:129-135`) that
*pull-reads the parent's effective propertiesMap* by `fullKey` and falls
back to the registry entry (`defaults.mjs:69-141`). So inheritance exists
**twice by design**: push (the scope cascade computes effective values) and
pull (widgets query the parent's effective map for display). The root scope
defaults layer is actually built *via* the pull mechanism, so the two are
the same logic expressed through two delivery routes.

## 2. Purpose

Distilled from the class docs, comments, and usage:

1. **Name mapping between model and property systems.** The class doc
   (`registered-properties-definitions.mjs:87-99`) states it replaces "the
   older praxis of putting the modelFieldName into the defaults … which
   scales not well". The mapping decouples model field names from
   registry/property names, so different model instances can share registry
   setup (`registryKey ≠ modelFieldName`) and properties can be renamed
   without touching models.
2. **Declarative driver for generic UI generation.** The ppsMap is the spec
   from which type-driven container UIs are built: which fields appear, in
   which order, with which label/unit/default semantics — without
   hand-writing a widget class per field.
3. **Defaults resolution contract.** `getDefaults(getLiveProperties,
   ppsRecord, fieldName, modelDefault)` gives every widget a uniform answer
   to "what do I show when my model field is empty (i.e. inherits)?" —
   live parent value first, registry default second, model default last.

## 3. Why it is complicated / annoying

**a) The record genuinely mixes too many concepts — the code says so
itself.**

- `prefix` has an admitted **"double use"**: it identifies the registry
  *and* serves as a path base for reading complex values from a
  propertiesMap — *"There's a good chance that the double use will collide
  at some point and has to be refined"* (def.mjs:176-180).
- `fullKey` is documented as the propertiesMap key for reading inherited
  defaults *and* for yielding values back — *"CAUTION: the yield part is
  not implemented!"* and *"FIXME: should maybe called propertyKey???"*
  (def.mjs:185-187).
- `createSimpleRecord` is *"Create a ppsRecord on the fly. Hopefully
  temporary until everything is figured out!!! :-D"* (def.mjs:173-174).
- `_PPS_ENTRY_MARKER` exists *"only until it is fully integrated"*
  (def.mjs:114-115).

A concrete symptom: in the `get*PPSMap` factories, `prefix = GENERIC` while
`fullKey = ${parentPPSRecord.propertyRoot}${fieldName}` — two different
bases for two roles of what looks like one concept. `fromPrefix` cannot
express that combination (its single argument feeds both), which is exactly
the confusion that triggered this research.

**b) Massive duplication at the edges.** Around 8 near-identical
`get*PPSMap` factory loops (`pps-maps.mjs` ×2, `fundamentals.mjs` ×2,
`type-tools-grid.mjs` ×2, `type-spec/models.mjs` ×1, …) that differ only in
their per-field special cases, plus near-verbatim `getDefaults`
implementations (`defaults.mjs:typeSpecGetDefaults` vs
`type-tools-grid.mjs:1066` vs videoproof `_getDefaults` — the latter
commented *"it should not be required to always have to rewrite these"*).
One factory is self-described as *"a very dirty function … because of a
lack of purpose for the ppsMap"* (`type-tools-grid.mjs:497`). Two
dispatchers share the name `(get|_get)PPSMapForModel` with **swapped
argument order** — a real footgun.

**c) Stringly-typed keys everywhere.** `${prefix}${name}` concatenation is
scattered across generators, consumers, and getDefaults implementations;
raw string prefixes like `'axesLocations/'` appear with
`// we should use a symbol here!` comments in multiple files; consumers
hand-build synthetic records (`createSimpleRecord(prefix,
\`@AutoLinearLeading\`)`, `createSimpleRecord(root, 'irrelevant')` with
`// FIXME: this looks completely useless!`).

**d) Hidden policy in skip-lists.** `_excludesTypeSpecPPSMap`
(`pps-maps.mjs:23`), `_skipPrefix`/`_skipFullKey` (`defaults.mjs:144-166`)
silently exclude fields from UI/defaults — policy split between registry
and code.

**e) Dead stubs add noise.** The `parentPPSRecord` branch in
`getTypeSpecPPSMap` is an admitted unused stub (pps-maps.mjs:40-43,
*"called nowhere"*). It got copy-pasted into `fundamentals.mjs` and from
there into `ui-horizontal-layout.typeroof.jsx`, propagating confusion.

**f) Organic growth, migration in progress.** Git history shows the spread:
type-spec-ramp → grid (`28c47aa2` "re-using some code/concepts from
type-spec-ramp") → videoproof → contextual. Consolidation has begun
(`25a8fe79 refactor(ramp): A2 consolidate pps-maps.mjs`), and
`type-specnion.mjs` is now only re-export aliases of
`scope-resolution.mjs` — a half-finished migration. Known fragilities are
flagged in code: hard-coded parent path with null fallback
(`defaults.mjs:75-82` FIXME), the FIXME that property generators feeding
`AnimationLiveProperties` don't support the PPS mapping yet
(def.mjs:96-99), and an exploratory typed/structured properties map that is
*"not in production"* (def.mjs:253-282).

## 4. Candidate refactoring directions (not a plan)

Ordered by invasiveness. A and B are low-risk de-duplication; C–E change
semantics of the abstraction; F is strategic.

**A. Kill the factory boilerplate (mechanical).** Make `fromPrefix` the
single primitive; express special cases as a **declarative override table**
per model (`{overrides: {leading: {fullKey: …}, color: {prefix: COLOR}},
exclude: Set}`). All 8 loops collapse to table literals; one
`getPPSMapForModel(parentRecord, Model)` with tables registered per model
class replaces the swapped-argument-order dispatchers.

**B. Unify `getDefaults` (mechanical).** One parameterized implementation
`makeGetDefaults(getLiveProperties, {prefixHandlers})`; the three copies
differ only in per-prefix branches (COLOR multi-channel, axesLocations,
SPECIFIC, DIMENSION) — make each a named handler keyed by prefix.

**C. Split the record's two roles (moderate).** Resolve the "double use"
FIXME by separating `registryRef = [prefix, registryKey]` (static UI/
registry semantics) from `propertyKey = fullKey` (runtime addressing).
`prefix` should only ever index the registry; `fullKey` should always
derive from the *parent record's* `propertyRoot`. Rename
`fullKey → propertyKey` per the FIXME; decide the "yield" direction:
implement it or delete the promise.

**D. Centralize key construction (moderate).** All `${prefix}${name}` /
`${root}${name}` concatenation goes through two functions (or a small
`PropertyPath` value object); the "should be a symbol" prefixes become real
constants in one place.

**E. Move exclusion policy into the registry (moderate).** Replace
`_excludesTypeSpecPPSMap`/`_skipPrefix`/`_skipFullKey` with explicit flags
on registry entries (`ui: false`; `inherit: false` already exists). One
introspectable policy location.

**F. Strategic.** Unify push/pull defaults (after B they can literally
share an implementation); evaluate the exploratory
`PropertiesMap`/`structuredPropertiesGen` (def.mjs:253-282) as the endgame
for D; the static/animated scope duplication
(`HierarchicalScopeProperties` vs `HierarchicalScopeAnimanion`) and the
generator FIXME (def.mjs:96-99) belong to the scope system but any key
refactoring must cover both.

## 5. Method note

Research executed by three parallel read-only subagent surveys (core
definitions; consumption/UI side; runtime data side) plus `git log`
archaeology on `registered-properties-definitions.mjs` and
pps-related commit messages. All file:line references were taken from the
survey outputs and spot-checked against the working tree at analysis time.
