---
title: 'Architectural Overview — Vision to Software'
eleventyNavigation:
  parent: Planning
  key: architectural-overview
  title: 'Architectural Overview'
  order: 45
agent-created: true
---

# {{title}}

This is the broad map: the idea the project is derived from, how the software
architecture follows from that idea, and how the major pieces — metamodel,
runions, mantra, compositor, shell — slot together on the technical side.
A separate, more hands-on article will follow, describing how the app is
engineered and how data flows through it in practice.

## The Mantra

Some decisions have to be made before other decisions. Typesetting is a
chain of interdependent choices where each step constrains the solution
space of the next:

```
Language → Script → Typeface → Portal-Size → Columns → Leading → Justification → …
```

- **Language and Script** select the typographic culture: conventions,
  defaults, and which runion set applies.
- **Typeface** selects which capabilities exist — e.g. parametric axes such
  as XTRA only enter the chain if the font provides them.
- **Portal-Size** (screen, window, page) defines the available space.
- **Columns** decide how that space is divided; this fixes the line length.
- **Leading** follows from line length and typeface.
- **Justification** operates on what columns and leading have produced —
  balancing word spacing, hyphenation, and parametric width (XTRA) instead
  of merely stretching spaces.

Two properties define the mantra:

1. **It is a recitation order, not a menu.** Saying it out of order produces
   garbage — justification cannot precede the line length it justifies.
2. **Change propagates forward, never backward.** Switch the typeface and
   everything downstream re-resolves; upstream stays untouched.

The mantra is the founding sentence of TypeRoof. Everything else is derived.

## The Metamodel is a Result of the Mantra

The metamodel (see `metamodel/assessment-2026-07.md`) is not a generic state
library that happened to fit typography. It is the mantra's requirements
written as infrastructure:

| Mantra requirement | Metamodel mechanism |
|---|---|
| Decisions depend on earlier decisions | Static dependency declarations + `topologicalSortKahn`: values resolve in dependency order, cycles are errors (`CYCLIC DEPENDENCIES ERROR`) |
| Change propagates forward | Draft/metamorphose lifecycle: touch one node, dependents re-run in topological order; upstream is untouched |
| Decisions must be configurable, per culture | Dynamic models (`createDynamicModel`): the *choice of algorithm is in the data* |
| Invalid intermediate states must be impossible | Descriptor state machines, `LIFECYCLE ERROR` guards, immutable frozen states |
| State must persist and travel | Serialization, foreign keys with referential integrity, coherence functions enforcing invariants |

That is why the module reads as *designed, not accidental*: it was derived
from a single prior idea.

## Runions: the Nodes of the Mantra

A **runion** is a unit of derived decision-making: it takes resolved inputs
plus configuration and produces a set of coherent typographic values.
Example — the column runion (staged in `columns/column-layout.mjs`): from
available width and a per-language config it derives column count, column
gap, and both margins, balancing line length against whitespace and
distributing the remainder gracefully.

Runions are:

- **Pluggable** — algorithm registries (`COLUMN_GAP_ALGORITHMS`,
  `LeadingAlgorithmModel`) select the implementation from the data. New
  runions are registered, never hardcoded.
- **Culturally keyed** — configuration is internationalized by design
  (`COLUMN_CONFIG_I18N`): German and English column conventions differ;
  Arabic, CJK and Indic runion sets follow the same pattern. Culture is the
  default, not the prison — users can override.
- **Pure and defensive** — no side effects, `null` on degenerate input; safe
  to re-run at animation frame rate.

## The Vision, Slotted Together

```
content (documents, live sources)          ← e.g. Wikipedia, loaded live
    ↓
metamodel (state: documents, config, animation keyMoments)
    ↓   mantra order, dependency-resolved
runions (columns → leading → justification/XTRA …)
    ↓   resolved, culture-aware values
compositor (inheritance cascade + keyMoment interpolation, per frame)
    ↓
consumers (glyph rendering, text layout, UI)
```

### Industry-grade typesetting (In replacement territory)

Line breaking, justification, hyphenation, parametric width adjustment —
built as runions on top of the column/leading decisions, in mantra order.
Justification incorporating the XTRA axis replaces space-stretching with
per-glyph, font-designer-intelligent width adjustment.

### Unparalleled I18N

Script- and language-specific runions, selected by the data. The mantra is a
fixed skeleton; per-script graphs can interpose culture-specific decisions
(kashida after XTRA; CJK line-breaking before columns).

### First-class parametric variable fonts

AmstelVar, RobotoDelta and their dozens of parametric axes become usable
through high-level automations controlled by a few parameters — runions
compressing 40 sliders into intent (*make it sturdier*).

### The most complete responsive typography

Layouts are *optimized*, not breakpoint-tweaked: the mantra re-recites
against portal size continuously. Same content — phone, desktop, print page:
one engine, three optimal layouts, zero manual adjustment.

### The Compositor: the last big architectural challenge

Between metamodel and consumers sits the compositor (see
`compositor/roadmap.md`): inheritance resolution (CSS-like cascade over
arbitrary model properties), scope computation, live interpolation between
keyMoments, and incremental updates. It is the mantra made temporal: during
animation the mantra re-recites per frame, and the compositor must make that
fast (incremental invalidation across inheritance depth *and* time) and
graceful (discrete runion results, e.g. column counts, step rather than
lerp). Architecture A — all in TypeScript, sharing the metamodel runtime —
keeps the single dependency story intact.

## Status and Next Bricks

- Column runion: designed and staged (`columns/`), awaiting promotion to `lib/`.
- Justification runion with XTRA: next in mantra order.
- Wikipedia live demo: one article, multiple portal sizes, script-appropriate
  runions — the vision exercised end-to-end.
- Compositor: architectural decision and build-out per its roadmap.

## Signature

    model: moonshotai/kimi-k3
    provider: openrouter
    agent: goose v1.41.0
