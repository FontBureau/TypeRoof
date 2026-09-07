# Design decisions: hostContext + layout-dependent synthetics

**Date**: 2026-09-07 · **Context**: umbrella plan
`docs/planning/agentic-artefacts/thoughts/plan/2026-09-05-1623-node-properties.md`
(Phase 4 "Generator signature: `(hostMap, outerAPI)`, hostContext reserved,
not in v1"). Decided in conversation, post-Phase-6.

## 1. Layout-dependent synthetics: do NOT build typeSpecnion support

Synthetics that consume layout facts move into the **node-properties
generator set** instead. Rationale (user, 2026-09-07):

- From a code perspective it's the same code somewhere else —
  `new SyntheticValue(fn, deps)` evaluates identically in either scope.
- The synthetics' instances are multiplied (per node instead of per
  shared typeSpec), but total executions are the same: the work is
  inherently per-node, so the typeSpecnion's sharing could not have
  saved it.
- Building a "deferred dependency" state into the typeSpecnion resolver
  (option (b) from the 2026-09-04/05 design discussion) would add
  resolver complexity for a cost model that doesn't benefit.

Consequence: the typeSpecnion stays style-pure permanently, not just
in v1. No `layout/*`-prefixed dependencies ever resolve inside it.

## 2. `hostContext`: promoted from "reserved" to "has a use case"

The third generator argument
`gen(outerNodePropertiesAPI, hostMap, hostContext)` — the document
node's context (NodeModel / meta-layer metaInfo) — is justified by a
concrete need: generators querying whether the node is **inline**
(`node.isInline`), which decides layout behavior and cannot be derived
from style properties.

Precedent exists in the meta layer's derivations:
`getMMChildIsBlock` / `specChildrenInInlineContext`
(`document-nodes-meta/derivations.mjs:27, :52`) already compute
inline/block determination — the hostContext plumbing would expose
this class of facts to generators.

Open implementation questions (decide at implementation time):

- Minimal stable surface: full NodeModel vs. a narrow struct
  `{isInline, index, ...}`.
- Raw pmNode vs. the meta layer's derived metaInfo as the exposed
  object.
- Signature change mechanics: `LocalScopeProperties.propertiesGenerator`
  currently calls `gen(outerAPI, host)` (scope-resolution.mjs); a third
  arg touches the shared static (both channels) — either optional
  third arg or per-channel arity.

## Status

Recorded. Neither item is scheduled; `hostContext` lands when the first
generator needs it (the inline query is the likely trigger).
