---
eleventyNavigation:
  key: Videoproof Contextual UI Usability Plan (2026-03-16)
  parent: Planning
agent-created: true
---

# Videoproof Contextual — UI Usability Plan (2026-03-16)

## Scope

Improve usability of the nested contextual template editor, especially around:

- `TemplateRulesModel`
- `UIContextualTemplateContainer`
- `UICharsSelectorContainer`
- nested `CharGroupsListModel` / `UICharGroupContainer`

Primary issue: users lose overview in deeply nested editing flows.

## Operator Constraints (Session)

- Work **minimalistically**.
- Keep implementation **DRY**.
- If DRY requires changing a superclass / shared pattern, prefer that over local duplication.
- **Do not treat `_UIBaseList` reorder/add/remove behavior as a concern** in this scope.
- If `_UIBaseList` issues appear, they will be prompted explicitly by operator.

## Implementation Strategy

### Step 1 — Summary-first collapsed views (low risk)

Add concise collapsed labels at key nesting points so users can scan structure quickly.

Targets:
- Rule item summary (pattern + selector summary)
- Selector summary (type + key parameters)
- Char group summary (option/custom + extended indicator)

Expected result:
- Better overview without changing model logic.

### Step 2 — Reuse existing expand/collapse patterns

Adopt existing proven UI behavior patterns (Axes-Math-style focus/edit affordance) where applicable:
- expand when actively editing
- remain compact when inactive

Keep behavior conservative and minimal; avoid speculative global event orchestration.

### Step 3 — DRY extraction only where repetition appears

If repeated summary/collapse code appears across containers/items:
- extract helper(s) or small mixin at shared layer
- avoid broad refactors unrelated to contextual template usability

## Non-Goals (for now)

- `_UIBaseList` internals
- broad event system redesign
- unrelated actor rendering/performance changes

## Acceptance Criteria

- Nested template UI is scannable in collapsed mode.
- Users can identify current selector/char-group values without expanding everything.
- Editing path can be expanded with minimal visual noise.
- Changes are minimal and DRY, with shared abstractions only when clearly justified.
