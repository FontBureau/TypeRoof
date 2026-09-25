---
date: 2026-09-07T22:26:00+02:00
git_commit: 703ce22e
branch: demo/wikipedia
repository: TypeRoof
topic: "Resolution-logic dedup: getTypeSpecPropertiesIdMethod + styleLink resolution shared between editor and viewer/meta"
tags: [research, dedup, prosemirror, type-specnion, style-links]
status: complete
---

# Resolution-Logic Dedup — Research

## Question

The prosemirror editor (`type-spec.typeroof.jsx`) and the viewer/meta
layer (`viewer.typeroof.jsx`, `document-nodes-meta/`) each resolve
typeSpec-property ids and styleLink ids. How much is duplicated, and
what is the minimal, high-value dedup? (Umbrella follow-up from
2026-09-07 decision: extract shared resolution, defer structural
outfitter refactor.)

## Findings

### 1. `getTypeSpecPropertiesIdMethod` — ALREADY the single source of truth

Canonical home: `lib/js/components/prosemirror/integration.typeroof.jsx:188`
(`export function getTypeSpecPropertiesIdMethod`). It is a *method-style*
function (called with `.call(this, ...)` or assigned
`this._getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod`), taking
`(pathOfTypes, asPath, nodeSpecToTypeSpecName, protocolHandlerName)` and
reading `this.getEntry(...)`, `this._originTypeSpecPath`,
`this.widgetBus`. Memoized per component instance via
`_typeSpecPropertiesIdCache` keyed by the `nodeSpecToTypeSpec` model.

Consumers (assignment pattern, all identical):
- `prosemirror/type-spec.typeroof.jsx` — 4 classes (:719, :1349, :2020,
  :2290)
- `viewer.typeroof.jsx` — 2 (:298, :550)
- `document-nodes-meta/index.mjs` — 1 (:721)

`document-nodes-meta/derivations.mjs:539` re-exports it for meta-layer
consumers.

**Verdict: nothing to dedup.** One implementation, N consumers via
assignment. (The re-export through derivations.mjs is a thin convenience;
import-from-source would be equally fine.)

### 2. `styleLinkProperties@` id resolution — REAL duplication, two variants

**Editor variant** (`prosemirror/type-spec.typeroof.jsx:1026-1047`,
method on UIDocumentNodeOutfitter, also used by the editor's mark/styler
creation at :1115, :1636, :1655):
- signature `(typeSpecProperties /* id string */, styleLinkEntry /* [fieldName, styleLink] | null */)`
- null entry → null
- builds id via `Path.fromParts(typeSpecPath, fieldName, styleLink)`
- registered? → id : null

**Viewer/meta variant** (`viewer.typeroof.jsx:585` method → shared
`getStyleLinkPropertiesId` in
`document-nodes-meta/derivations.mjs:393-412`):
- signature `(widgetBus, typeSpecPropertiesPath /* Path */, styleLinkType, styleLink)`
- builds id via `typeSpecPropertiesPath.append(styleLinkType, styleLink)`
- registered? → id : null
- **no null-entry branch** — callers handle the absent-link case
  upstream (unknown-style fallback)

Differences are **cosmetic + one semantic detail**:
- argument plumbing (id-string+tuple vs. Path+two args)
- the null-entry guard placement (inside editor method vs. at viewer
  call sites)

Both share: id string shape `styleLinkProperties@<path>/<type>/<link>`,
protocol lookup, `hasRegistered` gate, throw-if-no-protocol-handler.

### 3. What is NOT shared (and shouldn't be)

- **`nextProperties@` id derivation** (outfitter :787-794) —
  editor-only concept (next-sibling properties for block margins);
  viewer/meta have no equivalent. Out of scope.
- **Mark wrapping pipelines**: `getWrapMarks` /
  `wrapResultsAreEqual` already live in `derivations.mjs` (moved there
  during 5a) and are consumed by the meta layer; the editor has its own
  mark pipeline in type-spec.typeroof.jsx that was NOT moved. That is
  the larger structural duplication — **deliberately out of scope**
  (parked with the outfitter structural refactor).

## Recommendation (for the plan phase)

1. Unify styleLink id resolution on the `derivations.mjs`
   `getStyleLinkPropertiesId(widgetBus, path, type, link)` signature;
   re-express the editor method as a thin adapter:
   - null-entry guard stays in the editor adapter (its callers rely on it)
   - id-string → Path conversion at the adapter boundary
   (or flip the shared signature to accept both — pick during planning;
   adapter-thin is DRY-er and safer)
2. Leave `getTypeSpecPropertiesIdMethod` as is (already unified);
   optionally drop the derivations.mjs re-export if it serves no
   purpose beyond aliasing (minor cleanup, plan decides).
3. Explicitly NOT in scope: mark pipeline unification, nextProperties@,
   outfitter structural attachment.

## Test surface

- `prosemirror/type-spec-styler.test.mjs` exercises the outfitter
  (incl. its `_getStyleLinkPropertiesId` via Object.create stubs) —
  must keep passing; ideal regression net for the adapter swap.
- Viewer-side styleLink resolution is exercised by
  `type-stage-toggles` / `document-replace` behavior tests (styled
  marks render with data-style-name attributes).

## Effort estimate

Small: ~1 shared function + 1 editor adapter + call-site updates at
4 editor sites. One phase, one commit, low risk.
