---
date: 2026-09-07T22:28:00+02:00
git_commit: 703ce22e
branch: demo/wikipedia
repository: TypeRoof
topic: "Resolution-logic dedup: unify styleLink id resolution on derivations.mjs"
tags: [plan, dedup, prosemirror, style-links]
status: ready
research: thoughts/research/2026-09-07-2226-resolution-logic-dedup.md
---

# Resolution-Logic Dedup Plan

## Overview

The editor's `_getStyleLinkPropertiesId` (prosemirror/type-spec.typeroof.jsx:1026)
and the viewer/meta `getStyleLinkPropertiesId`
(document-nodes-meta/derivations.mjs:393) are two implementations of the
same resolution (id shape `styleLinkProperties@<path>/<type>/<link>`,
protocol lookup, `hasRegistered` gate). Unify on the derivations.mjs
shared function; the editor keeps a thin adapter holding its null-entry
guard and id-string→Path conversion. One phase, low risk.

`getTypeSpecPropertiesIdMethod` is already unified (single
implementation in integration.typeroof.jsx, consumed via assignment) —
no work. Mark-pipeline and outfitter structural unification are
explicitly out of scope.

## Current State

- **Shared**: `getStyleLinkPropertiesId(widgetBus, typeSpecPropertiesPath /* Path */, styleLinkType, styleLink)`
  (derivations.mjs:393-412) — registered? id : null; throws if no
  protocol handler. Used by viewer (viewer.typeroof.jsx:585 adapter)
  and the meta layer's mark pipeline.
- **Editor**: `_getStyleLinkPropertiesId(typeSpecProperties /* id string */, styleLinkEntry /* [fieldName, styleLink] | null */)`
  (type-spec.typeroof.jsx:1026-1047) — adds: null-entry guard (returns
  null, "unknown-style fallback"), id-string slicing
  (`typeSpecProperties.slice("typeSpecProperties@".length)`), tuple
  destructuring. 4 call sites: :1115 (`_finalizeMarkSubscription`),
  :1636, :1655 (mark pipeline), :1026 (definition).

## Desired End State

One implementation (derivations.mjs). The editor method becomes an
adapter: null guard + id-string→Path conversion + tuple unpack, then
delegates. Behavior identical.

## What We're NOT Doing

- Mark pipeline unification (parked with the outfitter structural
  refactor)
- `nextProperties@` (editor-only concept)
- Any change to `getTypeSpecPropertiesIdMethod`
- Any behavior change

## Implementation Approach

Single phase.

### Phase 1: Unify styleLink id resolution

### Overview
Editor adapter delegates to the shared derivations.mjs function.

### Changes Required:

#### 1. Shared function — no signature change needed
**File**: `lib/js/components/layouts/type-stage/document-nodes-meta/derivations.mjs`
**Changes**: none to the function itself. (Import cycle check:
derivations.mjs lives under layouts/type-stage; the editor imports from
prosemirror/. derivations.mjs already imports from
prosemirror/integration.typeroof.jsx (re-export at :539), so the editor
importing derivations.mjs does NOT create a cycle — verify with
`npm run build:app`.)

#### 2. Editor adapter
**File**: `lib/js/components/prosemirror/type-spec.typeroof.jsx:1026-1047`
**Changes**: rewrite the method body to:

```js
_getStyleLinkPropertiesId(typeSpecProperties, styleLinkEntry) {
    if (styleLinkEntry === null)
        // no applicable edge: the unknown-style fallback applies
        return null;
    const [fieldName, styleLink] = styleLinkEntry,
        typeSpecPropertiesPath = Path.fromString(
            typeSpecProperties.slice("typeSpecProperties@".length),
        );
    return getStyleLinkPropertiesId(
        this.widgetBus,
        typeSpecPropertiesPath,
        fieldName,
        styleLink,
    );
}
```

Import `getStyleLinkPropertiesId` from
`../layouts/type-stage/document-nodes-meta/derivations.mjs`. Verify the
Path constructor matches how the shared function consumes it
(`Path.fromString` vs `Path.fromParts` — the editor currently uses
`Path.fromParts(typeSpecPath, ...)` where typeSpecPath is a string;
`Path.fromParts` accepts a string first arg, so check
`Path.fromString` is the right primitive or use
`Path.fromParts(typeSpecPath)` accordingly).

#### 3. Equivalence verification
The id must be byte-identical before/after:
`styleLinkProperties@${Path.fromParts(typeSpecPath, fieldName, styleLink)}`
vs.
`styleLinkProperties@${typeSpecPropertiesPath.append(fieldName, styleLink)}`.
Add a unit test asserting both constructions produce the same id for a
representative input (defends the dedup against future drift).

### Success Criteria:
- Automated: full vitest suite green (274), especially
  `type-spec-styler.test.mjs` (stubs the outfitter, exercises the
  adapter) and the type-stage behavior tests (viewer styleLink
  resolution); eslint; typecheck; `npm run build:app`.
- Manual: wikipedia demo — styled marks in the editor pane render
  unchanged (bold/italic styling, data-style-name attributes).

**Implementation Note**: commit gate applies — stop with the message
before committing.

## Testing Strategy

### Unit Tests:
- New: id-construction equivalence test (Change 3).

### Integration Tests:
- Existing `type-spec-styler.test.mjs` — regression net for the
  adapter (uses Object.create stubs; must pass unchanged).

### Edge Cases:
- null styleLinkEntry → null (unknown-style fallback) — adapter-owned,
  unchanged.
- Unregistered styleLink id → null — shared function, unchanged.
- Missing protocol handler → throw — shared function, unchanged.

## Working Agreements
