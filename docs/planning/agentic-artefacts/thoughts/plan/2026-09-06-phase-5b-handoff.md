# Handoff: Node Properties — Phase 5b (node→node channel)

**Date**: 2026-09-06
**Repo**: TypeRoof, branch `demo/wikipedia` @ `6a300acc`
**State**: clean worktree, 256/256 tests green, Phases 1–5a done.

## What this session should do

Run a **new RPI cycle** (`/research_codebase` → plan → implement) for
**Phase 5b of the node-properties plan**: the per-document-node
`nodeProperties@` channel. Node-property scopes become per-document-node
instances owned by `DocumentNodesMeta`; children consume their parent's
effective map; geometry migrates out of the typeSpecnion.

## Must-read first (in order)

1. **The umbrella plan**: `thoughts/plans/2026-09-05-1623-node-properties.md`
   — Phases 1–4 and 5a are marked ✅ with commit hashes. Phase 5b's section
   is the spec, BUT it predates 5a's implementation — treat its
   `document-nodes-meta.typeroof.jsx` references as approximations and
   verify against the actual 5a code. The plan's "Review findings
   incorporated" section and Working Agreements (behavior tests, small
   commits, commit gate, `.prettierignore` on new `.mjs`) still govern.
2. **The prior research**: `thoughts/research/2026-09-04-2344-layout-channel.md`
   — background on the demarcation/typeSpecnion machinery (mostly landed
   by now).
3. **5a's archive**: `docs/planning/agentic-artefacts/thoughts/` (research +
   plan dirs) contains the walker-separation RPI artefacts — shows how
   DocumentNodesMeta was actually shaped.

## Architecture so far (committed)

- `CascadingMap` — `lib/js/components/cascading-map.mjs`: read-only
  Map-facade over labeled `[label, map]` layers, first-hit-wins, lazy
  key→layer index, `getLayer(label)`, duplicate-label throw.
  (`3e86f6dc`)
- Scope machinery generalized — `scope-resolution.mjs`
  (`LocalScopeProperties`, `HierarchicalScopeProperties`, demarcations
  re-exported via `type-specnion.mjs`). (`f54eb52b`)
- Defaults hygiene — `seedTypeSpecDefaults` derives fresh maps.
  (`f9836e43`)
- **`nodeProperties@` root channel** (`05eaf4f9`):
  `lib/js/components/layouts/type-stage/node-properties.mjs` —
  `HierarchicalScopeNodeProperties` (standalone scope; constructor args
  `(generatorsMap, hostMap, parentNodePropertiesOrDefaultsMap,
  inheritancePolicyGenerators)`; effective map is
  `CascadingMap([["local", local], ["parent", parentEffectiveMap]])`);
  `getRootNodePropertiesMap(environmentValues)` → `layout/environment/*`.
  `node-properties-generators.mjs` — `availableSizesGen` (root-only,
  resolves `layout/width|height` LengthModels against environment facts
  → `layout/availableWidth|Height` + identity synthetics, pt).
  Root `TypeSpecLiveProperties` builds the root scope, registers
  `nodeProperties@<rootPath>` (root only; `meta.typeroof.jsx` settings
  gate). Both layout controllers register the protocol with
  `notFoundFallbackValue: null`. Pane-styler + `UIDocumentTypeSpecStyler`
  consume `layout/*` keys via merged maps.
- **`DocumentNodesMeta`** (5a, `8dbd2055`…`62262b87`):
  `lib/js/components/layouts/type-stage/document-nodes-meta/index.mjs`
  (`DocumentNodesMeta` class at :521) + `derivations.mjs` (pure
  document-tree derivations). The renderer-independent walker; viewer
  attaches to it.

## Phase 5b spec highlights (from the umbrella plan — verify against code)

- Per-node `NodePropertiesLiveProperties`-style component owned by
  `DocumentNodesMeta`; **no Meta analogue** — the meta layer *is* the
  structure.
- **Registration ids must incorporate node identity**, not just the
  typeSpec path: nodes sharing one typeSpec would collide at
  `nodeProperties@<typeSpecPath>` (SimpleProtocolHandler.register throws
  on duplicates, `component.mjs:195-198`). Id shape e.g.
  `nodeProperties@<typeSpecPath>#<nodeId>`, or keyed by node path.
- Registration is imperative + lifecycle-hooked (`register`/`unregister`
  in update/destroy), NOT wrapper restOptions one-shot — resolved paths
  can change while the node widget persists.
- Consumers read an accessor off the registering component (like
  `.typeSpecnion`), not a bare map.
- Parent effective path via
  `_getTypeSpecPropertiesId(pathOfTypes.slice(0,-1), true)`; consume
  only-if-registered (`_getStyleLinkPropertiesId` pattern).
  getTypeSpecPropertiesIdMethod memo-key aliasing: pass the 4th arg
  (`"nodeProperties@"`) deliberately (integration.typeroof.jsx:187-201).
- Producer calls `setUpdated(identifier)` after rebuild, before children
  (parent-first order — **verify this ordering with a test first**).
- Text nodes: consume-only.
- Styler: `UIDocumentTypeSpecStyler` builds
  `CascadingMap([["node", nodePropertiesMap], ["style", typeSpecMap]])`
  itself (first-hit-wins, node first). `_provisionTypeSpecStyler`
  rebuild-check must also compare `nodeProperties@`
  (viewer.typeroof.jsx:579-583).
- Geometry migration: `horizontalLayoutRunion`'s geometry yields
  (`/pt` synthetics, availableWidth re-route) move to node-properties
  generators; `innerPropertiesData`'s `generic/width` read
  (type-spec.typeroof.jsx) → `layout/width` (already partially done in
  Phase 4 via root channel).

## Open research questions for the new cycle

1. How does DocumentNodesMeta's provisioning (index.mjs:521+,
   `_provisionWidgets` at :204/:440) host per-node scopes — where does
   each node's `hostMap` (its resolved typeSpecnion properties) come
   from in the meta layer?
2. Registration id scheme: node identity source (pmNode identity? path?
   a stable key from the meta layer?) — must survive document edits
   sensibly and be computable by children for the parent lookup.
3. Update ordering: does the meta layer update strictly parent-first so
   a child's scope build sees the parent's settled map? Test it.
4. How does the Phase-4 root channel (in TypeSpecLiveProperties) relate
   to the meta layer's root node — same registration or a handoff?
   Currently the root scope is built in `live-properties.typeroof.jsx`
   update; decide whether 5b moves/keeps it.
5. `hostContext`/NodeModel generator arg — still out of scope?

## Working agreements (unchanged)

- Behavior tests (inputs → observable outcomes), not implementation.
- Small, reviewable commits; **commit gate**: before every commit, stop
  with the proposed message + file list and wait for explicit
  acknowledgement ("okok").
- New `.mjs` files need explicit `!lib/js/...` entries in `.prettierignore`.
- Verification battery per landing: `npx vitest run`, `npx eslint`,
  `npm run typecheck`, **`npm run build:app`** (bundler export checks
  catch what vitest misses — learned the hard way in Phase 2/3).
- Commit message trailer: model/provider/agent metadata (see git log).
- Docs archive at the end: research + plan into
  `docs/planning/agentic-artefacts/thoughts/{research,plan}/` (precedent:
  `6a300acc`).
- Known pre-existing lint error (not yours): `horizontalWidthSum` unused
  in `properties-generators.mjs` — belongs to the horizontal-layout WIP;
  resolve when the geometry migration lands (5b may consume it).

## Current branch tail

```
6a300acc docs: archive document-tree walker/renderer separation RPI artefacts
62262b87 [type-stage] DocumentNodesMeta ownership flip: meta drives, viewer attaches
8dbd2055 [type-stage] extract pure document-tree derivations into document-nodes-meta
05eaf4f9 [type-stage] nodeProperties@ channel: root scope + environment migration
f54eb52b [type-stage] extract scope-generic machinery into scope-resolution.mjs
3e86f6dc [components] add CascadingMap: read-only Map facade over labeled layers
```
