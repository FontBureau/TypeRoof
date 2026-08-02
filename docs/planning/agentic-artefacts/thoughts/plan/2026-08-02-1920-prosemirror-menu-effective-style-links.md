---
date: 2026-08-02T19:22:00+02:00
git_commit: 96aa379d135ced48e93f23e9fda2e90a89f0836b
branch: demo/wikipedia
repository: TypeRoof
topic: "ProseMirror menus: read effective (inherited) style links"
tags: [plan, prosemirror, style-links, typespecnion, inheritance]
status: approved
research: docs/planning/agentic-artefacts/thoughts/research/2026-08-02-1851-prosemirror-style-menu-nested-typespecs.md
---

# ProseMirror Menus: Read Effective (Inherited) Style Links — Implementation Plan

## Overview

`UIProseMirrorMenuStyles` renders no style-link buttons when type-specs are nested, because it
reads the raw local model field `typeSpec.get("intentStyleLinks")` while style links are now
inherited through the typeSpecnion (visible since `96aa379d` nested h1–h3/p1–p2 in the initial
state). This plan migrates the style menus to the **effective (inherited) style-link set**, using
prop-types: the existing `_getEffectiveStyleLinks` pattern. `UIBoldItalicMenu` (currently unused)
is aligned in the same way.

## Current State Analysis

- `UIProseMirrorMenuStyles.updateView` — `lib/js/components/prosemirror/type-spec.typeroof.jsx:1852-1943`
  builds `setsOfStyles` / `allStylesSuperSet` from `typeSpec.get("intentStyleLinks")` (:1869).
  With nested type-specs the resolved child typeSpec has an empty local map → no buttons.
- `getTypeSpecsMethod` — `lib/js/components/prosemirror/integration.typeroof.jsx:155-177` returns
  `Map<TypeSpecModel, Path>`; the Path is exactly what's needed to form the
  `typeSpecProperties@<path>` id. **Resolution needs no change.**
- `_getEffectiveStyleLinks` — `type-spec.typeroof.jsx:858-876`, a method on
  `TypeSpecSubscriptions` (:817) that resolves the `typeSpecProperties@` handler and returns
  `getStyleLinks(typeSpecnion.getProperties(), prefix)`. It uses only `this.widgetBus` and lives
  in the same file as both menus. Call sites: `_getStylePatchLinkForMark` (:882-899),
  `_resolveIntentTag` (:903).
- `getStyleLinks` — `lib/js/components/registered-properties-definitions.mjs:42-48` excludes
  tombstoned (`null`) keys and includes NULL-style (`stylePatch: ''`) edges.
- `UIBoldItalicMenu` — `type-spec.typeroof.jsx:2024-2138`, **unused** (no references outside its
  definition file). Its `updateView` (:2095-2131) never populates `setsOfStyles`, so the
  `every()`-intersection is vacuous and all three hardcoded buttons (`bold`, `italic`,
  `bold italic`) are always enabled regardless of availability. Its `update` (:2133-2136)
  triggers only on `nodeSpecToTypeSpec`.
- `getStyleLinks`, `INTENT_STYLE_LINKS`, `MARK_STYLE_LINKS` are already imported at the top of
  `type-spec.typeroof.jsx` (:19-23).

### Key Discoveries:
- Operator decisions (2026-08-02): use the `_getEffectiveStyleLinks` approach; **tombstones are
  not selectable, NULL-styles are selectable** (they add no visual style but leave a usable
  generic-style mark). Both fall out of `getStyleLinks` semantics with zero extra code.
- Active-but-undefined styles (marked in the selection but in no resolved typeSpec's effective
  set) get **no** button — removal is covered by the existing clear-styles button
  (`_createClearStylesButton`, :1745-1759). Current behavior kept.
- `UIProseMirrorMenuStyles.update` (:1946-1953) triggers only on `typeSpec`; the blocks menu
  triggers on `typeSpec` **and** `nodeSpecToTypeSpec` (:1716-1719) — link changes affect
  resolution, so the styles menu should too.

## Desired End State

- With the cursor inside nested type-specs (h1–h3, p1–p2 in the shipped initial state), the
  style menu shows the inherited style-link buttons; toggling and the clear-styles button work
  as before.
- Buttons = union of the **effective** intent style links of all resolved typeSpecs; a button is
  enabled iff its key is in **every** resolved typeSpec's effective set (existing
  superset/subset semantics preserved).
- Tombstoned keys never appear; NULL-style keys appear and are selectable, visually
  indistinguishable from linked keys.
- `UIBoldItalicMenu` computes its enabled state from the effective sets (no behavior change for
  the empty-selection case).
- Verify: automated checks pass; manual check in the browser (type-stage / wikipedia demo).

## What We're NOT Doing

- No changes to typeSpec resolution (`getTypeSpecsMethod`, `_getBestTypeSpecPropertiesId`).
- No changes to `UIProseMirrorMenuBlocks` (block buttons don't consume style links).
- No visual distinction of NULL-style vs linked edges in the menu.
- No fix for the button-order FIXME (:1905-1908).
- No third `nodeStyleLinks` map; no removal of the unused `UIBoldItalicMenu`.
- No new unit tests for the menus (none exist for this UI layer; verification is lint/typecheck/
  existing tests + manual).

## Implementation Approach

Extract `_getEffectiveStyleLinks` into a module-level function in `type-spec.typeroof.jsx`
(DRY, same file, no new imports), let `TypeSpecSubscriptions` delegate to it, then consume it
from both menus. Two small commits, one per phase. Commit protocol: implement → run automated
verification → **stop, propose commit message + file list, wait for OKOK** → commit with
metadata per `COLLABORATION.md` (model/provider/agent read from their actual sources).

## Phase 1: Shared helper + `UIProseMirrorMenuStyles` migration

### Overview
Make the effective-set accessor reusable and switch the style menu to it. No behavior change
for `TypeSpecSubscriptions`.

### Changes Required:

#### 1. Extract module-level `_getEffectiveStyleLinks`
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes**: Convert the method at :858-876 into a module-level named function (no arrow
syntax, per coding style) taking `widgetBus` as first argument; place it near
`getActiveNodesAndMarks` (:1581). The `TypeSpecSubscriptions` method becomes a one-line
delegate so its call sites (:887-895, :903-909) stay untouched.

```js
// The effective (inherited and local) style-link edges of the
// TypeSpec identified by a typeSpecProperties@ id, as a Map of
// key => StylePatchLinkModel. Tombstoned (unlinked) edges are
// excluded by getStyleLinks.
function _getEffectiveStyleLinks(
    widgetBus,
    typeSpecProperties,
    prefix = INTENT_STYLE_LINKS,
) {
    const protocolHandlerImplementation =
        widgetBus.getProtocolHandlerImplementation("typeSpecProperties@", null);
    if (protocolHandlerImplementation === null)
        throw new Error(
            `KEY ERROR ProtocolHandler for identifier "typeSpecProperties@" not found.`,
        );
    if (!protocolHandlerImplementation.hasRegistered(typeSpecProperties))
        return new Map();
    const typeSpecLiveProperties =
        protocolHandlerImplementation.getRegistered(typeSpecProperties);
    return getStyleLinks(
        typeSpecLiveProperties.typeSpecnion.getProperties(),
        prefix,
    );
}
```

```js
// in TypeSpecSubscriptions (replaces the old method body):
_getEffectiveStyleLinks(typeSpecProperties, prefix = INTENT_STYLE_LINKS) {
    return _getEffectiveStyleLinks(this.widgetBus, typeSpecProperties, prefix);
}
```

#### 2. `UIProseMirrorMenuStyles.updateView`: effective sets
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes**: In the loop at :1867-1879, replace the raw-field read with the helper, using the
`path` value already provided by `getTypeSpecsMethod`:

```js
for (const [typeSpec, path] of typeSpecs) {
    const intentStyleLinks = _getEffectiveStyleLinks(
        this.widgetBus,
        `typeSpecProperties@${path}`,
        INTENT_STYLE_LINKS,
    );
    setsOfStyles.set(typeSpec, new Set(intentStyleLinks.keys()));
    for (const style of intentStyleLinks.keys())
        allStylesSuperSet.add(style);
}
```

Everything downstream (union/intersection, button creation/reuse, `active` class, clear-styles
button, click handler) stays unchanged.

#### 3. `UIProseMirrorMenuStyles.update`: also trigger on `nodeSpecToTypeSpec`
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes** (:1946-1953):

```js
update(changedMap) {
    if (
        (changedMap.has("typeSpec") ||
            changedMap.has("nodeSpecToTypeSpec")) &&
        this._editorView
    ) {
        this.updateView(this._editorView);
    }
}
```

### Success Criteria:

#### Automated Verification:
- [x] `npm run lint` passes (eslint + prettier + stylelint)
- [x] `npm run typecheck` passes — with caveat: one PRE-EXISTING, unrelated error at HEAD
      (`lib/js/wikipedia/main.ts(1,10): TS2305 ... no exported member 'loadWikipediaPage'`),
      confirmed identical with the changes stashed; no new errors introduced
- [x] `npm test` passes (vitest; 89/89, no regressions)

#### Manual Verification:
- [ ] Type-stage / wikipedia demo: cursor inside h1–h3 and p1–p2 (nested type-specs) shows the
      inherited style-link buttons (e.g. italic, bold, link, sup, cite per state)
- [ ] Toggling a style adds/removes the `generic-style` mark; `active` class follows the cursor
- [ ] Clear-styles button removes the marks; disabled-state (button enabled only when the style
      is in every resolved typeSpec's effective set) behaves as before across mixed selections
- [ ] A tombstoned key (mode `unlinked` on a child) does **not** appear; a NULL-style edge
      (stylePatch `''`) appears and is selectable
- [ ] Non-nested documents (e.g. ramp layout) behave as before

**Implementation Note**: After automated verification passes, pause and propose the commit
message + files; commit only after OKOK.

**Proposed commit (subject to review):**
```
[ProseMirror] style menu: read effective (inherited) intent style links

Extract _getEffectiveStyleLinks from TypeSpecSubscriptions into a
module-level helper and use it in UIProseMirrorMenuStyles.updateView
instead of the raw local intentStyleLinks field, so style buttons
appear for nested type-specs that inherit their style links.
Also trigger the menu update on nodeSpecToTypeSpec changes.

Files: lib/js/components/prosemirror/type-spec.typeroof.jsx
```

---

## Phase 2: `UIBoldItalicMenu` alignment

### Overview
Fix the vacuous `commonSubSet` (buttons currently always enabled) by populating `setsOfStyles`
from the effective intent style links; repair the update trigger. Widget is unused, so this is
correctness-by-review, keeping it drop-in usable.

### Changes Required:

#### 1. `UIBoldItalicMenu.updateView`: populate `setsOfStyles`
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes** (:2095-2110): keep the hardcoded superset `["bold", "italic", "bold italic"]`, add:

```js
const state = this._editorView.state,
    typeSpecs = this._getTypeSpecs(state),
    setsOfStyles = new Map(),
    allStylesSuperSet = new Set(["bold", "italic", "bold italic"]),
    commonSubSet = new Set();

for (const [typeSpec, path] of typeSpecs) {
    const intentStyleLinks = _getEffectiveStyleLinks(
        this.widgetBus,
        `typeSpecProperties@${path}`,
        INTENT_STYLE_LINKS,
    );
    setsOfStyles.set(typeSpec, new Set(intentStyleLinks.keys()));
}
// ... existing commonSubSet loop unchanged ...
```

Empty selection ⇒ `typeSpecs` empty ⇒ vacuous intersection ⇒ all three buttons enabled:
identical to today's behavior in that case.

#### 2. `UIBoldItalicMenu.update`: trigger on `typeSpec` too
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx`
**Changes** (:2133-2136):

```js
update(changedMap) {
    if (
        changedMap.has("typeSpec") ||
        changedMap.has("nodeSpecToTypeSpec")
    ) {
        this.updateView(this._editorView);
    }
}
```

(`updateView` already guards `if (!view) return;`.)

### Success Criteria:

#### Automated Verification:
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes — same caveat as Phase 1: only the pre-existing,
      unrelated `lib/js/wikipedia/main.ts` TS2305 error; no new errors
- [x] `npm test` passes (89/89)

#### Manual Verification:
- [x] Code review only — the widget is not instantiated anywhere; confirm by
      `grep -rn "UIBoldItalicMenu" lib/js/` showing no new call sites
      (confirmed by operator review 2026-08-02)

**Implementation Note**: Pause and propose the commit message + files; commit only after OKOK.

**Proposed commit (subject to review):**
```
[ProseMirror] UIBoldItalicMenu: enable buttons from effective style links

Populate setsOfStyles from the effective (inherited) intent style
links so the enabled state reflects availability; previously the
intersection was vacuous and all buttons were always enabled.
Also trigger updates on typeSpec changes. The widget is currently
unused; this keeps it consistent with UIProseMirrorMenuStyles.

Files: lib/js/components/prosemirror/type-spec.typeroof.jsx
```

---

## Testing Strategy

### Unit Tests:
- None added (no existing test coverage for the ProseMirror menu UI layer). Existing
  `type-specnion` / `type-spec-models` behavior tests must keep passing (`npm test`).

### Integration / Manual Tests:
- Nested type-specs (shipped `type-stage-initial-state.json` hierarchy): buttons visible and
  functional at every nesting level.
- Edge states: tombstone hidden, NULL-style selectable, mixed-selection disabling.
- Regression: non-nested documents unchanged.
