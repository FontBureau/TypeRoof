---
eleventyNavigation:
  key: "Videoproof Contextual Post-Mortem (Agent vs Human, 2026-07)"
  parent: Planning
  title: 'VP-Contextual: Post-Mortem'
  order: 42
agent-created: true
---

# Post-Mortem: VideoproofContextual — the Model-Led Rewrite vs. the Human Finish

*Written 2026-07-16. Retrospective on the `VideoproofContextualActor` effort,
Feb–Jun 2026. Grounded in `git log` over the contextual paths; numbers below
are reproducible from history.*

## Why this document exists

The `docs/planning/videoproof-contextual/` directory contains two upbeat
planning artifacts from the model-led phase:

- `rewrite-plan.md` — a phase-by-phase plan that marks phases 1–9c "✅ Done".
- `ui-usability-plan-2026-03-16.md` — a tidy usability plan for the nested
  template editor.

Read on their own, those documents tell a story of a smooth, phased,
mostly-completed agent rewrite. **That is not what happened.** The honest
story is: an agent produced a large scaffold quickly, that scaffold then
required a long, sustained human effort to become correct and usable, and
the majority of the shipped design decisions came *after* the model was set
aside. This post-mortem records that so the planning docs are not mistaken
for the whole picture.

## The numbers

Restricting to the contextual actor + template UI paths, from the first
agent commit (2026-02-27) onward:

| | Agent (`Agent of Lasse Fister`) | Human (`Lasse Fister`) |
|---|---|---|
| Commits | 32 | 59 |
| Lines added | ~3,701 | ~5,966 |
| Lines removed | ~1,404 | ~3,373 |
| Net | +2,297 | +2,593 |

- **Initial agent commit (44c6e4a7):** one file, 366 lines, "new actor
  created by agent."
- **Agent era:** 2026-02-27 → 2026-03-26 (~1 month, front-loaded).
- **Human era:** 2026-03-11 → 2026-06-17 and beyond (~3+ months, overlapping
  then fully taking over).
- **Current shipped size:** ~2,145 lines across `actors/videoproof-contextual/`
  (`layout.mjs` 320, `models.mjs` 345, `template.mjs` 369, `index.typeroof.jsx`
  638) plus `ui-contextual-template.typeroof.jsx` (473).

The human removed roughly **as many lines as the agent originally added
(−3,373)** while adding nearly twice as much (+5,966). In other words, the
final actor is not "the agent's scaffold, polished" — it is largely a
different body of code that grew on top of, and by displacing, the scaffold.

## Timeline in three acts

### Act 1 — Model-led scaffold (Feb 27 – ~Mar 12)
The agent generated the pattern compiler, selector/template engine, model
definitions, and wired the actor, in labelled "Phase 1–9c" commits. This was
genuinely fast at producing *structure*. `rewrite-plan.md` was written and
maintained *by the agent* during this act, which is why it reads as a clean
ledger of completed phases.

The trouble is already visible inside this act, in the agent's own commit
subjects:
- `fix: correct critical bugs in template engine integration` (Mar 10)
- `refactor: remove ad-hoc template spec format, replace with TODOs` (Mar 10)
- `Fix compilePattern return value destructuring …` (Mar 12)
- `[videoproof-contextual] TODO: full cell rendering causes an unresponsive
  browser` (Mar 12, **human** commit — a correctness/perf problem in the
  generated renderer).

### Act 2 — Handover / overlap (~Mar 11 – Mar 26)
Human commits begin interleaving with agent commits ("some cleaning up and
refactoring", "some cleanup", "flesh out the CoherenceFunction"). The last
agent-authored commits are algorithmic fixes to its own earlier output:
- `computeFontSizeAndLayout: binary search replacing broken iteration` (Mar 24)
- `wordIndexToLine: binary search over sorted lineStarts` (Mar 24)

i.e. the closing agent work was *repairing broken iteration it had written*.
After `Add UIArgIndexInput` (Mar 26) there are **no further agent commits**.

### Act 3 — Human redesign & finish (Mar 17 – Jun 17)
This is where the bulk of the real design happened, and where the tone of the
commit log changes from "Phase N done" to targeted correctness and modelling
work. Representative human commits:
- `fix cases of halluzinated propertyRoot declarations` (Apr 8) — cleaning up
  model-invented paths that did not correspond to anything.
- `AND/OR Combinators are now distinct types, not one type with a distinctive
  enum` (Mar 29) — a core modelling decision the agent had gotten wrong.
- `don't use multiple charGroups in the simple selector: the AND combinator
  can achieve the same thing` (Mar 29) — simplifying the agent's design.
- `FIX: UIContextualTemplateContainer: inject contentsZoneElement as a widget
  so label, widgets order is correct` (May 1).
- `put template metamodel instance directly into processed properties` (May 18)
  — a substantial rework of how the template participates in the properties
  system.
- Extraction of `applyPresets`/`presets.mjs`, argument-marker redesign
  (`\1`, `\2`), caching of `compileTemplate`, scrolling behaviour, colour and
  cell-box features (May–Jun).

The "REVIEW:" commits (Mar 17) and repeated prettier/eslint passes also show
the generated code did not match project conventions (jshint headers, an
eslint `no-unused-vars` pattern that masked unused vars containing `h`, etc.).

## What the model was good at, and what it cost

**Good at:** producing a *plausible, large, phased scaffold* fast. One month
to ~3.7k lines of structure that compiled and ran. It correctly leaned on
existing reference patterns (AxesMath dynamic types, StylePatch dispatch) that
were pointed at it in `rewrite-plan.md`.

**Cost:**
- **Hallucinated structure** — `propertyRoot` declarations and paths that
  didn't exist, needing explicit human cleanup (Apr 8).
- **Wrong core modelling** — combinators as an enum instead of distinct types;
  redundant charGroups in the simple selector; both later reversed by hand.
- **Broken algorithms shipped as "done"** — iteration bugs in layout/line
  computation, only fixed via binary-search rewrites at the very end of the
  agent era.
- **Convention drift** — jshint/eslint/prettier noise, awkward container
  wiring.
- **Misleading self-reported status** — the agent authored the "✅ Done"
  ledger, so the plan overstated completeness. Phase 10 ("Built-in templates")
  is still 🔲 open to this day, and much of what was marked done was
  subsequently reworked.

The net effect: the scaffold was a **starting point that had to be paid down**,
not a finished feature. The human effort (3+ months, ~6k added / ~3.4k removed)
was not "polish" — it was redesign, correctness, and usability work that
constitutes the actual shipped actor.

## About the two planning documents

- `rewrite-plan.md` is a useful **historical record of the model-led phase**
  and its intended architecture, but its "✅ Done" ledger reflects the agent's
  optimistic self-report, not the final state. It should be read together with
  this post-mortem.
- `ui-usability-plan-2026-03-16.md` describes summary-first collapsed views and
  AxesMath-style expand-on-edit for the nested editor. Those ideas *were*
  eventually realised in the shipped code (`_getSelectorSummary`,
  `UICharsSelectorSummary`, `getCharGroupSummaryFromModel`, `Collapsible` usage
  in `ui-contextual-template.typeroof.jsx`) — but as part of the human-led Act
  3, not as a discrete tracked deliverable. It is kept as a historical artifact
  of intent, not as an authoritative record of how the work was done.

Neither document should be relabelled a clean "done." They are preserved as
artifacts of the model-led phase; this post-mortem is the corrective narrative.

## Lessons (for the next model-led attempt)

1. **Do not let the agent be the author of its own status ledger.** The "Phase
   N ✅ Done" file was written by the same process doing the work; it measured
   activity, not correctness.
2. **Treat a large generated scaffold as debt, not equity.** Budget for the
   possibility that most of it will be removed. Here, ~90% of the agent's added
   lines were eventually removed or displaced.
3. **Core modelling decisions are the expensive part and the part the model got
   wrong** (enum-vs-types, selector cardinality, property paths). Those deserve
   human design *before* generation, not correction after.
4. **"Runs" ≠ "correct."** Broken iteration and an unresponsive full-render
   both shipped in code marked done.
5. **Small, verifiable steps beat phased mega-scaffolds.** The durable parts of
   the final actor came from many targeted human commits, each locally
   reviewable — the opposite of the front-loaded agent burst.

---

*Reproduce the figures:*

```sh
git log --author="Agent of Lasse Fister" --since=2026-02-27 --pretty=tformat: \
  --numstat -- '*videoproof-contextual*' '*ui-contextual-template*' \
  | awk 'NF==3{a+=$1;d+=$2} END{printf "+%d -%d\n",a,d}'
git log --author="Lasse Fister" --since=2026-02-27 --pretty=tformat: \
  --numstat -- '*videoproof-contextual*' '*ui-contextual-template*' \
  | awk 'NF==3{a+=$1;d+=$2} END{printf "+%d -%d\n",a,d}'
```
