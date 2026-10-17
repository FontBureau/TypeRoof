---
title: Text Composition - avar2 Potentials Anchoring
eleventyNavigation:
  parent: Planning
  key: text-composition-avar2-potentials-anchoring
  title: 'Text Composition: avar2 Potentials Anchoring'
  order: 51
agent-created: true
---

# {{title}}

> Why justification potentials must be re-anchored to the run's
> actual location — the avar1/avar2 dflt mismatch that made
> AmstelvarA2 receive no fitting treatment at all (observed
> 2026-10-04, fixed in `anchorPotentialsToLocation`,
> `lib/js/components/layouts/type-stage/text-composition/justification-potentials.ts`).

## The data and the invariant

A resolved potentials leaf holds one `[min, dflt, max]` triple per
treatment, e.g. the Amstelvar reading-text leaf:

```
XTRA: [515, 562, 575]
```

Read: *"at this spot in the design space (wght 400, wdth 100,
opsz 14), the line may narrow XTRA down to 515 and widen it up to
575 — and 562 is the natural state, step 0."* The whole step
arithmetic is anchored on that dflt:

```
value(step) = dflt + step * (dflt - min)   // narrowing, step < 0
value(step) = dflt + step * (max - dflt)   // widening, step >= 0
```

**Step 0 must be exactly the natural, unadjusted state** — the
"step-0-identity invariant": composing at step 0 must be a no-op.

## Where it breaks

The tables were authored against avar1 Amstelvar (and Roboto Flex),
where the natural XTRA *is* 562 (resp. 468). But the avar2 fonts
re-based the axis: **AmstelvarA2's natural XTRA is 400** (Roboto
Delta's is 463 — close enough to 468 that the mismatch stayed
invisible there).

When a run sits at 400 and the table claims the natural state is
562, two worlds collide:

- **Step 0** is measured honestly — the natural width uses the
  run's true location, XTRA 400.
- **Any step ≠ 0** computes values around the table's dflt:
  step −1 → 515, step +1 → 575.

The width function has a **cliff at 0**: step −0.001 already
measures at ≈562 — some 20% wider than the natural 400 (measured
with the real font: XTRA 400 = 5.53em vs 562 = 6.66em for a probe
word). Consequences:

- **Narrowing reads as exhausted**: "narrowing" probes (toward 515)
  return *wider* widths than the natural 400 — the algorithm
  concludes there is no narrowing potential.
- **Widening converges to nothing**: any probe beyond 0 jumps the
  +20% discontinuity, overshoots any realistic slack, and the step
  search slides back to ≈0, where the epsilon gate drops the
  micro-step.

Every line stays at step 0: a complete absence of fitting
treatment — no narrowing, no widening, no color-coded lines.
(Roboto Flex is unaffected — its default *is* 468; Roboto Delta's
463 is only 5 units off, an invisible discontinuity.)

## The fix

Right after a leaf is resolved (the interpolation over the
declared dimension order), each **axis** treatment triple is
re-anchored to the run's actual location:

```
delta        = locationValue − tableDflt          // 400 − 562 = −162
anchoredMin  = clamp(tableMin  + delta, axisMin)  // 515 − 162 = 353
anchoredDflt = locationValue                      // 400
anchoredMax  = clamp(tableMax  + delta, axisMax)  // 575 − 162 = 413
```

`[515, 562, 575]` becomes **`[353, 400, 413]`**: step 0 computes
400 (the true natural — identity restored), step −1 computes 353,
step +1 computes 413.

## Why this is the right semantics

The typographic knowledge in the tables is the **deltas**: "from
wherever you naturally sit, you may narrow this axis by up to 47
units and widen by up to 13." The absolute 562 is an artifact of
the avar1 default the author happened to sit at — avar2 fonts
re-based the axis (same design knowledge, different zero point).
Re-anchoring preserves the authored deltas and discards the stale
absolute anchor. Clamping to the fvar range keeps shifts honest
when they would leave the design space (the range then becomes
truthfully asymmetric).

Only **axis** treatments are re-anchored; tracking (absolute pt)
and wordspace (factor of the natural space advance) carry no axis
values and pass through untouched. Side effect: a *style* that
moves a run's axis location (a mark setting an explicit XTRA) also
gets correctly anchored potentials — the anchoring is relative to
wherever the run actually sits, not to the font's default.

## Where it lives

One pure function, `anchorPotentialsToLocation(leaf, location,
axisRanges)`, applied in the composition controller's per-leaf
planner setup immediately after `calculatePotentials` — so the
stepper, the `lineWidthAtStep` measurement, *and* the published
payload the applicator renders from all share the same anchored
leaf. Measured == rendered, and the step-0-identity invariant
holds by construction. Regression tests (with the real AmstelvarA2
font) pin both sides: un-anchored "narrowing" widens (the bug);
anchored narrows/widens and step 0 is the identity (the fix).
