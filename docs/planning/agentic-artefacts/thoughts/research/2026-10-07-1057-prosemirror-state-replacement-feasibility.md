---
date: 2026-10-07T10:57:32+02:00
git_commit: be8b5d1606c6b1f5d634c5c4f9039d169b8ce71b
branch: feature/composition-and-justification
repository: TypeRoof
topic: "Feasibility: replacing ProseMirror's state-holding classes with metamodel-draft-backed implementations"
tags: [research, codebase, prosemirror, metamodel, feasibility]
status: complete
---

# Research: Replacing ProseMirror's state classes with metamodel-backed implementations

## Research Question

TypeRoof uses ProseMirror as its main rich text editor (`class ProseMirror` in
`lib/js/components/prosemirror/integration.typeroof.jsx`). The integration keeps
**two synchronized sources of truth**: a ProseMirror `EditorState`/`doc` and a
metamodel `NodeModel` document. Is it feasible to replace ProseMirror's own
state-holding classes (`Node`/`Fragment`/`Mark`/`Schema`/`EditorState`/
`Transaction`/`Selection`) with versions that have the same API surface but
write internally directly to metamodel (drafts), so that the synchronization
can be removed?

## Summary

**Short answer: not feasible as stated — but a narrower variant may be.**

The current bridge is **bidirectional and identity-gated**: PM transactions
re-derive the metamodel document from `view.state.doc`, and metamodel changes
re-derive the PM doc — but "rebuild" here means *identity-pruned
re-derivation*, not reconstruction. Both PM `Node`s and metamodel nodes are
immutable with structural sharing, so unchanged subtrees keep object identity
across generations; the bidirectional `_nodesCache` WeakMap makes the
recursive converters short-circuit at the root of every unchanged subtree.
The per-transaction cost is O(changed paths) conversions, not O(document);
identity does all the diffing implicitly (there is no explicit diff/patch
code in the bridge). The node↔node cache links have exactly one consumer —
the `ProseMirror` class's own sync guards; the schema↔schemaModel link is
additionally consumed by NodeView/MarkView.

Two findings dominate the feasibility assessment:

1. **The metamodel side is structurally close to PM's model.** It has
   immutable frozen states, PM-like structural sharing on commit (unchanged
   subtrees keep object identity; an unchanged draft's `metamorphose` returns
   `oldState` — struct-model.ts:1094-1097, list-model.ts:247-257), lazy
   per-path draft creation (`_PotentialWriteProxy`), batched mutations with a
   single commit (`withChangeState`, shell.mjs:1193-1262), and fine-grained
   diff-based change notification (`StateComparison`, compare.ts). What it
   lacks: cheap per-node construction (every node individually runs the full
   validate/coherence/freeze pipeline), any in-metamodel transaction/undo
   (PM's history plugin currently owns undo), and any StepMap-style position
   mapping (the internal `_OLD_TO_NEW_SLOT` slot-map is deleted at freeze).

2. **The ProseMirror side is deeply non-facadable.** prosemirror-view and
   prosemirror-transform have hard `instanceof` barriers (~15 sites for
   `Selection` subclasses in capturekeys/input/domchange; `Step` subclass
   merging in replace_step.ts:49 / mark_step.ts:51,107; `MarkType` in
   mark.ts:44), global integer position/token arithmetic
   (`nodeSize = 2 + content.size`, `+1` resolve offsets), and identity/eq
   fast-paths (`copy`/`cut` return-this, `preMatch` reuse) that any
   replacement must reproduce *exactly* — effectively by subclassing the real
   classes. TypeRoof additionally consumes the undocumented
   `ResolvedPos.path` triple layout directly (integration.typeroof.jsx:36-49)
   and pokes view internals (`view.docView` desc tree, `view.domObserver.flush()`).

The pragmatic seam the research reveals: **keep prosemirror-model/state/view
as-is, but replace the *sync* (the dual representation + converters) with
direct draft writes.** A `dispatchTransaction` could apply each transaction's steps as
targeted metamodel-draft mutations (one root draft, batched) instead of
rebuilding the document from `view.state.doc`; conversely, metamodel changes
already carry a fine-grained `StateComparison` diff that could be turned into
targeted PM transactions instead of full doc rebuilds. The `Step`→draft and
diff→`Step` translations are the manageable surfaces; keeping PM's own
`Node` as the view-facing representation avoids all instanceof/positioning
blockers.

## Detailed Findings

### 1. The synchronization surface (what would be eliminated)

Main file: `lib/js/components/prosemirror/integration.typeroof.jsx` (1553 LOC).

**PM state → metamodel** (per transaction):

- `_prosemirrorDispatchTransaction` (integration.typeroof.jsx:1323): applies
  the transaction, then compares `_nodesCache.get(document)` with
  `view.state.doc` (:1336). On mismatch, inside `_changeState` rebuilds the
  the metamodel doc via `_createMetamodelNode(this._nodesCache, pmDoc,
  documentDraft.oldState.dependencies)` (:1348-1352) and
  `documentParentDraft.set(dokumentKey, immutableDoc)` (:1358).
- `_rawCreateMetamodelNode` (:1110): recursive PM Node → `NodeModel`
  conversion; one `createPrimalDraft` + `metamorphose()` per *converted*
  node (:1109, :1158), `toMetaModelJSON` per attr. Recursion goes through
  the cache-checked wrapper `_createMetamodelNode` (:1276), so unchanged PM
  subtrees (identical objects thanks to PM's structural sharing) are cache
  hits and are never descended into — only nodes along changed paths are
  converted. The reused children are the identical metamodel objects, so
  the metamodel's own no-change commit shortcuts
  (struct-model.ts:782-792/:1094-1097) and `StateComparison`'s identity
  shortcut (compare.ts:96-101) keep commit and propagation cheap.
- Selection side channel (:1369-1404): `_getTypeSpecs(this.view.state)`
  (`getTypeSpecsMethod`, :289) → writes/clears `editingTypeSpec`.

**Metamodel → PM** (per change):

- `update(changedMap)` (:1406): on `document` change, `newDoc =
  this._createProseMirrorNode(this._nodesCache, document, schema)` (:1501);
  if `newDoc !== this.view.state.doc` (:1507) rebuilds `EditorState.create`
  preserving `schema/doc/selection/storedMarks/plugins` (:1527-1532) and
  `view.setProps` (:1534) — wholesale state swap, no transaction (so history
  is unaffected/PM-undo can't see external edits).
- `_rawCreateProseMirrorNode` (:1161): recursive metamodel → PM conversion,
  symmetrically pruned by the cache-checked wrapper `_createProseMirrorNode`
  (:1296): unchanged metamodel subtrees (identical objects thanks to the
  metamodel's structural sharing) are cache hits, and the reused identical
  PM nodes let the view layer skip work via `preMatch`/`matchesNode`.
  Unknown types are classified into `unknown`/`unknown_block`/`unknown_inline`
  with `attrs["unknown-type"]` round-trip (:1231-1251); `schema.node()` =
  `createChecked` per converted node (:1253).
- On `proseMirrorSchema` change (:1425-1484): rebuilds PM Schema via
  `createProseMirrorSchemaFromMetaModel` (:771), provisions nodeViews/
  markViews, **drops the entire `_nodesCache`** (:1483), rebuilds the doc.

**Identity discipline**: `mapSetBiDirectional` (:593) is the only cache
writer. The node↔node cache links have exactly one consumer — the
`ProseMirror` class's own sync guards (:1336, :1507). Only the
schema↔schemaModel link is consumed externally (`getLinked(node.type.schema)`
in `ProsemirrorNodeView` :339 and `ProsemirrorMarkView` :510/:553).

**Consumers / wiring**:
- `layouts/type-stage/prosemirror.typeroof.jsx:32-144` — `ID_MAP =
  {menu, proseMirror, subscriptions}`; `RampProseMirrorContext` /
  `TypeStageProseMirrorContext` mount `ProseMirror` (deps
  `proseMirrorSchema, document, nodeSpecToTypeSpec, editingTypeSpec`) and
  `TypeSpecSubscriptions`.
- `layouts/type-tools-grid.mjs:2019` — simple per-cell editor, empty idMap,
  dep `document`, `very-simple-schema`.
- `type-spec.typeroof.jsx` is the **only** non-integration consumer of PM
  state: `UIDocumentNodeOutfitter._documentNodePathId` (:868-878) resolves
  `view.state.doc.resolve(getPos())` + `getPathOfContentIndexes` to build
  `nodeProperties@<path>/content/<i>` ids (deliberately *not* using metamodel
  identity because "PM NodeViews persist across edits/moves", :884-891);
  `TypeSpecSubscriptions._subscriptionGetDerrived` (:1529-1558);
  `getActiveNodesAndMarks` (:1945-1964); menus (`setBlockType` :2030, `lift`
  :2178, `wrapIn` :2190, `_getTypeSpecs` :2362/:2608).
- The viewer/meta-tree side (`document-nodes-meta/*`, viewer.typeroof.jsx)
  works **purely on metamodel nodes** — proof the metamodel alone suffices
  to render documents; it even mirrors `_rawCreateProseMirrorNode`'s
  unknown-type classification (`derivations.mjs:81-127`) and duck-types PM
  `toDOM` with a fake node `{attrs}`.

### 2. ProseMirror API surface used vs. what a replacement must replicate

**Used runtime surface** (full inventory in agent report; highlights):

- model: `Schema` (+`schema.nodes/marks`, `.mark/.text/.node`,
  `topNodeType.createAndFill`), Node reads (`type.name/.schema/.spec.attrs`,
  `attrs`, `marks`, `content.child(i)/.childCount/.size`, `nodeSize`,
  `isAtom/isInline/isBlock/isText/inlineContent`, `text/textBetween`,
  `nodesBetween`, `resolve`, `rangeHasMark`), `Mark.setFrom` semantics via
  `markType.isInSet`, selection reads (`$cursor`, `ranges`, `storedMarks`).
- state: `EditorState.create` (×2), `state.apply(tr)`, `state.tr`,
  `SelectionRange`, plugin spec `{view}`; transactions:
  `replaceSelectionWith/addMark/removeMark/addStoredMark/scrollIntoView`.
- view: `EditorView` with `dispatchTransaction`, `markViews`, `nodeViews`;
  `updateState`, `setProps`, `props.nodeViews/markViews`; **view internals**:
  `view.docView` desc traversal (type-spec.typeroof.jsx:1396-1408),
  `view.domObserver.flush()` (:1370, :1897).
- history/keymap/commands: `history()`, `undo/redo`, `keymap`, `baseKeymap`,
  `chainCommands`, `newlineInCode`, `createParagraphNear`, `liftEmptyBlock`,
  `splitBlockAs`, `exitCode`, `setBlockType/lift/wrapIn`; vendored
  attr-aware `toggleMark`/`removeMark` in commands.ts.

**Hard blockers for a facade replacement** (from prosemirror sources):

1. **instanceof barriers.** prosemirror-view requires genuine `Selection`
   subclasses (~15 sites: capturekeys.ts:21-267, input.ts:154-744,
   domchange.ts:132-153, index.ts:243). prosemirror-transform merges steps
   via `other instanceof ReplaceStep` (replace_step.ts:49),
   `instanceof AddMarkStep/RemoveMarkStep` + `mark.eq` (mark_step.ts:51,107);
   `mark instanceof MarkType` coercion (mark.ts:44). Duck-typing is
   insufficient; facades must subclass the real classes.
2. **Position/token arithmetic is global.** `nodeSize = isLeaf ? 1 :
   2 + content.size` (node.ts:52); `Fragment.size` accumulation
   (fragment.ts:13-25); `ResolvedPos.path` triples `[node, index, start]`
   (resolvedpos.ts:19-84) with `+1` token convention
   (resolvedpos.ts:255-268). TypeRoof consumes `.path` directly
   (integration.typeroof.jsx:36-49; type-spec.typeroof.jsx:1538) — the
   layout must be reproduced bit-for-bit.
3. **Identity/`eq` discipline.** PM `copy`/`cut` return-this (node.ts:138,
   148), `eq` `==` fast paths, `preMatch` reuse (viewdesc.ts:1270-1275);
   TypeRoof's own `===` guards (:1336, :1505). Unchanged subtrees must keep
   identity or every edit forces full view rebuilds.
4. **Schema/ContentMatch enforcement.** `createChecked` → `ContentMatch.
   matchFragment` (schema.ts:159-200); `close()` revalidation on every
   replace (replace.ts:173-185); marks canonical ordering (`Mark.setFrom`
   rank sort, addToSet excludes, mark.ts:21-104).
5. **History needs the full Transform stack.** history.ts:83-164: invertible
   steps against intermediate `docs[i]`, `Mapping` mirrors
   (`getMirror`/`appendMappingInverted`), bookmark mapping, adjacent-step
   `merge` for undo granularity, `RopeSequence` storage.
6. **Attrs deep-equality** (`compareDeep`): node attrs must stay plain
   JSON-ish objects or `hasMarkup`/`Mark.eq` degrade → constant redraws and
   broken step merging.
7. **TypeRoof's own view-internal couplings**: `view.docView` desc shape
   (`desc.dom/.children/.spec`) and `view.domObserver.flush()` must keep
   working.

**Manageable surfaces**: TypeRoof's read-side Node usage is shallow and
read-only; the factory surface is narrow (`schema.mark/text/node`,
`createAndFill`, `nodeType.create`, `markType.create`); the
EditorState/EditorView lifecycle touchpoints are few; the commands layer
works purely through public `doc`/`tr`/`selection` APIs; `DOMParser` is only
used in tests.

### 3. Metamodel draft mechanics (what a PM backing would sit on)

Implementation: `lib/js/metamodel/*.ts` (~8,962 LOC; `metamodel.mjs` is a
re-export stub).

- **Draft protocol** (base-model.ts:322-330): `constructor(oldState)` ⇒
  draft; `metamorphose(dependencies?)` ⇒ immutable. Draft mutation is cheap
  in-place: struct `_value` holds *only changed entries*
  (struct-model.ts:474-480), no validation at set time (validation happens
  at metamorphose, :1441). Lists use sparse arrays + `_OLD_TO_NEW_SLOT`
  index map (list-model.ts:95-123).
- **Lazy draft creation**: `_PotentialWriteProxy` escalates writes up the
  parent chain, creating drafts only along the written path
  (potential-write-proxy.ts:60-97; `getDraftFor`).
- **Structural sharing**: `metamorphoseGen` shortcuts — no changed deps and
  empty `_value` ⇒ returns `oldState` (struct-model.ts:782-792); final
  all-keys-identity-equal check ⇒ returns `oldState` (:1094-1097;
  list-model.ts:247-257; ordered-map-model.ts:395-406). A leaf change gives
  new identities only along the ancestor path — **the same semantics PM's
  Node model has**.
- **Costs**: per-metamorphose each struct runs its full `initOrder` +
  coherence functions + freeze, and every container loops *all* children
  (struct-model.ts:743-746 design comment acknowledges this). A full-doc
  rebuild costs N constructor + N individual `metamorphose()` calls — paid
  only when the `_nodesCache` is dropped (schema change,
  integration.typeroof.jsx:1483); per PM transaction the integration pays
  this only for nodes along changed paths. A single deep
  draft edit is O(path) to create but O(subtree) per commit level.
- **Batching**: `withChangeState` (shell.mjs:1193-1262) wraps queued
  mutations in one root draft, one metamorphose — "basically wrapping a
  transaction". No undo/redo in the metamodel (`OLD_STATE` deleted at freeze
  to allow GC, struct-model.ts:1143-1149); undo is currently PM's history
  plugin.
- **Change notification**: post-hoc `StateComparison` diff
  (compare.ts:80+, identity shortcut :96-101) → filtered `changedMap` per
  widget (:532-590; component.mjs:624-661). Fine-grained, path-addressed,
  but derived after commit rather than emitted by mutations.
- **Addressing**: `Path` (path.ts), list items keyed by decimal index
  strings; **no StepMap/Mapping analogue** — `_OLD_TO_NEW_SLOT` is internal
  and deleted at freeze; consumers re-resolve addresses against the new
  state.

### 4. Existing seams, tests, prior art

- **Tests** pin: `ResolvedPos.path` triple layout
  (integration.test.mjs:147-243); PM view-layer NodeView/MarkView `update()`
  reuse semantics (:250-301, :383-457, :559-688); conversion round-trips
  metamodel→PM→metamodel via handler-object calls to the converters as free
  functions (:100-113, :771-793); vendored `toggleMark` behavior
  (commands.test.mjs); default-schema reserved nodes and unknown_*
  toDOM shapes (default-schema.test.mjs); type-spec resolution
  characterization tests (type-spec-resolution.test.mjs).
  Converters are already decoupled from the component (callable via a
  handler object).
- **Established deviation pattern is vendoring + mirroring, never
  subclassing**: vendored `toggleMark` (commands.ts), reduced default schema
  (default-schema.ts), PM-independent re-derivation of node rendering in
  document-nodes-meta. No subclassing/monkeypatching of PM classes anywhere
  in the repo.
- **Known friction comments**: PM's block/inline dichotomy (reason for the
  unknown_* trio, integration:1226-1240); cache-drop + full re-derivation on
  schema change (:1478-1483); per-dispatch re-derivation of the metamodel
  doc (:1346-1366 — identity-pruned, but still per changed node an
  individual createPrimalDraft+metamorphose);
  a documented cursor-jump defect at the sync boundary
  (docs/planning/text-composition/ROADMAP.md:424-430).
- Architecture analysis of the integration:
  docs/planning/type-spec-resolution/2026-08-24-null-typespec-analysis_Fable-5.md.

## Code References

- `lib/js/components/prosemirror/integration.typeroof.jsx:903` — `class ProseMirror`
- `lib/js/components/prosemirror/integration.typeroof.jsx:1323` — `_prosemirrorDispatchTransaction` (PM→metamodel sync)
- `lib/js/components/prosemirror/integration.typeroof.jsx:1406` — `update(changedMap)` (metamodel→PM sync)
- `lib/js/components/prosemirror/integration.typeroof.jsx:1110`/`:1161` — recursive converters
- `lib/js/components/prosemirror/integration.typeroof.jsx:931`/`:593` — `_nodesCache` / `mapSetBiDirectional`
- `lib/js/components/prosemirror/models.typeroof.jsx:503` — `NodeModel` (typeKey/attrs/marks/text/content)
- `lib/js/metamodel/struct-model.ts:782-792`,`:1094-1097` — structural-sharing shortcuts
- `lib/js/metamodel/list-model.ts:247-257` — list no-change shortcut
- `lib/js/metamodel/potential-write-proxy.ts:60-97` — lazy draft escalation
- `lib/js/shell.mjs:1193-1262` — `withChangeState` batching ("transaction")
- `lib/js/metamodel/compare.ts:80-101` — `rawCompare` diff with identity shortcut
- `node_modules/prosemirror-model/src/resolvedpos.ts:19-84` — path triple layout
- `node_modules/prosemirror-transform/src/replace_step.ts:49`, `mark_step.ts:51` — instanceof merging
- `node_modules/prosemirror-history/src/history.ts:83-164` — rebasing requirements
- `lib/js/components/layouts/type-stage/prosemirror.typeroof.jsx:32` — `ID_MAP` wiring
- `lib/js/components/prosemirror/type-spec.typeroof.jsx:868-878` — PM-position→metamodel-path id derivation

## Addendum (2026-10-07): Full-port scope analysis — operator direction

After review, the operator steered away from the "narrow seam" (keep PM
classes, replace only the sync) toward the **full-port candidate**: a
*heavily inspired re-write* of the ProseMirror stack with the document model
backed natively by metamodel drafts — not a line-by-line port. Explicit
requirements from the operator:

- **Keep the browser-quirks handling** (domchange/IME-composition
  re-parsing, DOM selection mapping, clipboard, drag/drop) — identified as
  ProseMirror's biggest asset.
- **Keep the customizable-schema architecture** (schema-driven NodeSpec/
  MarkSpec, content expressions) — already mirrored by TypeRoof's
  `ProseMirrorSchemaModel`/`createProseMirrorSchemaFromMetaModel`.
- **Likely port the view as well** — confirmed by the operator.

### Scope quantification (node_modules, src LOC)

| Package | LOC | Port? | Notes |
|---|---|---|---|
| prosemirror-model | 3,582 | yes | Node/Fragment/Mark/Slice/Schema/DOMParser/DOMSerializer/ResolvedPos |
| prosemirror-transform | 2,056 | yes | Step/StepMap/Mapping/Transform/replace logic |
| prosemirror-state | 1,092 | yes | EditorState/Transaction/Selection hierarchy/Plugin |
| prosemirror-view | 6,422 | yes (confirmed) | the browser-quirks asset; largest and subtlest chunk |
| prosemirror-history | 459 | yes | small; method-call coupling only |
| prosemirror-commands/keymap | ~888 | port or keep | pure functions over the model API |
| **Total** | **~14.6k** | | reference: TypeRoof's whole prosemirror component dir ≈ 5.5k LOC |

Versions at research time: model 1.25.11, state 1.4.3, transform 1.10.4,
view 1.42.2, history 1.4.1.

**Why "sparse" is not available**: prosemirror-view imports the full model
surface (`Slice, Fragment, DOMParser, DOMSerializer, ResolvedPos, NodeType,
Mark`), the full state surface (`EditorState, Transaction, Plugin,
Selection, TextSelection, NodeSelection, AllSelection`), and
`Mapping/dropPoint/Mappable` from transform — plus 34 `instanceof` checks
inside view (capturekeys.ts:7, input.ts:6, domchange.ts:2, selection.ts:3,
decoration.ts:13, viewdesc.ts:9, index.ts:1, clipboard.ts:1). Keeping
upstream view while porting model/state/transform would require
re-implementing ~their entire API surface anyway; porting (or
vendor-patching) the view is therefore forced, which the operator accepted.

### What the port gains

- True single source of truth: the editor document *is* the metamodel
  document; the sync layer (converters `_rawCreateMetamodelNode`/
  `_rawCreateProseMirrorNode`, `_nodesCache`, identity guards — ~600 LOC in
  integration.typeroof.jsx) and the dual-representation reasoning tax
  (unknown_* round-trip, attr bags, derivations.mjs mirrors) evaporate.
- Unified undo: history ported onto the native Transform lets
  metamodel-originated edits participate in the same undo branch; the
  cursor-jump defect class at the sync boundary
  (docs/planning/text-composition/ROADMAP.md:424-430) disappears by
  construction.
- PM-internal layouts (`ResolvedPos.path` triples, token arithmetic) become
  owned design choices instead of constraints to replicate.

### What the port costs / owns

- The view's 6.4k LOC is accumulated scar tissue from a decade of browser
  bugs (IME/composition, bidi, caret/selection quirks, clipboard, mobile)
  and changes upstream continuously — a re-write must deliberately carry
  over this behavior (operator requirement) and then maintain it without
  upstream fixes.
- Editor correctness failures are user-hostile (lost keystrokes, broken
  CJK IME, caret jumps) and hard to test; PM's own test suites should be
  ported as the safety net.
- The metamodel lands on the editor hot path: per-keystroke metamorphose
  cost (initOrder/coherence/freeze per node) becomes editor latency. This
  is the project's one load-bearing, currently unvalidated performance
  assumption.

### De-risking sequence (proposed)

1. **Micro-probe** (targeted vitest timing, agreed with operator; NOT the
   perf harness): metamorphose cost of a realistic document edit at
   keystroke rate. If a paragraph edit is ≫5 ms, the foundation needs work
   first.
2. **Port model+transform+state** (~6.7k LOC source) with PM's own test
   suites ported as the acceptance gate — the tractable, verifiable chunk.
3. **Then the view** (port vs. vendor-patch decision, informed by steps
   1-2), carrying over the browser-quirks handling deliberately.
4. TypeRoof-specific surface last: NodeView/MarkView bridges
   (`ProsemirrorNodeView`/`ProsemirrorMarkView` subscriptions),
   `getPathOfContentIndexes` path-triple consumers, menus, commands
   (vendored toggleMark already exists as prior art).

## Addendum 2 (2026-10-07): Adopted framing + assessment

### The framing (adopted by operator)

> Re-architect the data layer (model/transform/state) on metamodel
> semantics; transplant the behavior layer (view/history)
> structure-for-structure from upstream, adapting only at the data
> boundary — with PM's test suites ported first and a metamodel-cost probe
> as the entry gate.

### Assessment (self-critique of the framing)

**Verdict**: strongest available shape — assigns freedom where
verifiability exists (data layer, test-gated) and conservatism where
knowledge is empirical (behavior layer, diff-gated). Adopted with three
corrections:

1. **"freely" → "semantics-preserving".** The view is coupled to the
   model's *semantics* (integer position arithmetic, identity/`eq` fast
   paths, Fragment iteration order, `ResolvedPos` triples), not just its
   API. Measured coupling: ~270 of ~6,400 view lines touch Node/Fragment
   semantics directly — a narrow boundary (~4%), but concentrated in
   `viewdesc.ts` (79), `input.ts` (44), `decoration.ts` (35),
   `domchange.ts` (32), the subtlest files. Every semantic deviation in
   the re-architecture multiplies adaptation cost exactly there. Freedom
   is real only for storage/derivation (metamodel backing, schema-system
   fixes — e.g. resolving the block/inline dichotomy natively, first-class
   unknown types).

2. **Third-representation trap.** PM's view assumes O(1) fragment random
   access, plain-object `attrs`, cached `nodeSize`, cheap `compareDeep`.
   Metamodel nodes don't serve these natively (`attrs` is an
   `AttrsMapModel` of `JSONModel` structs). The backed Node will need
   materialization caches; enough of those resurrects a dual
   representation at a lower level, silently defeating the purpose.
   Mitigation: the probe must measure **hot read paths** (Fragment
   `child(i)`, attrs materialization, traversal) at document scale, not
   just commit cost per edit.

3. **Safety-net story split by layer.** PM's test suites gate the *data
   layer* (they're not shipped in node_modules — they live in the GitHub
   repos and run in a real browser via `pm-runtests`). The browser-quirks
   behavior is largely untested even upstream — guarded by users, not
   tests — so the *behavior layer's* real gate is control-flow
   diffability against upstream (structure-following provides this) plus
   a manual browser/IME QA matrix.

**Still open in the framing** (to be addressed in planning):

- Exit criteria / fallback: the existing sync bridge lives until the port
  reaches editing parity; every phase boundary must remain shippable.
- Upstream tracking protocol: record source commit hashes per
  transplanted file; upstream CHANGELOG review becomes a recurring task.
- Falsification criteria: probe shows per-keystroke commit cost
  unacceptable and not fixable in the metamodel; or data-boundary
  adaptation spreads materially beyond
  viewdesc/input/decoration/domchange.

## Addendum 3 (2026-10-07): Wordgard — Marijn Haverbeke's successor editor

### Findings (wordgard.net, guide, FAQ — 2026-10-07)

Marijn Haverbeke (ProseMirror's author) is building **Wordgard**
(https://wordgard.net/, code at code.haverbeke.berlin/wordgard, MIT),
a clean-history successor editor system:

- **Same semantic core as PM**: immutable document tree with structural
  sharing; the *same token-based index system* (open/close token per
  node, UTF16 chars as tokens, `doc.resolve(pos)` resolved positions);
  change sets with position mapping; schema-driven documents. → All
  position-arithmetic findings in this document carry over 1:1.
- **Merged with CodeMirror-6 architecture**: facets, state fields,
  dynamic configuration, everything-is-an-extension; modules
  `wordgard/doc|state|editor|command|history|schema|table|collab`.
- **Fixes PM pain points**: true nesting (list items are real parents),
  built-in collab and RTL/bidi, accessibility as a feature.
- **Targets 2022+ browsers only** — deliberately shedding legacy scar
  tissue while consolidating the browser-quirks knowledge.
- **Pre-1.0** ("one or two years", breaking changes expected), self-hosted
  git, **no PRs accepted** ("control freak", anti-LLM-slop stance,
  "Contains 0% AI" site footer), funded by a social-expectation model
  (marijnhaverbeke.nl/fund).

### Impact on the option space

- **Weakens PM as the transplant blueprint**: for any fresh
  implementation, Wordgard is the better reference — same author's
  consolidated knowledge, cleaner history, modern structure.
- **Strengthens "adopt + bridge"**: Wordgard as dependency keeps upstream
  quirks fixes flowing for the next decade — but reproduces the
  dual-representation problem and rides a pre-1.0 moving target.
- **Doesn't shrink the own-implementation option**: a fresh
  TypeRoof-specific editor remains the largest option; Wordgard improves
  the blueprint, it doesn't do the work.

### Consultation idea (operator): Marijn consulting on a TypeRoof-specific editor spec

**For**: design review at spec stage (schema system, position/change
mapping, DOM-observation/IME architecture in 2026) has the best
money-to-knowledge ratio available; he works full-time under a public
funding model and explicitly invites commercial funding relationships;
Wordgard is malleable now — TypeRoof feedback during his design window
could land needs upstream; a demanding early adopter is valuable to him.

**Against/cautions**: his stated values (no PRs, refuses LLM-generated
code) clash with TypeRoof's agent-assisted workflow — consultation may be
declined or steered toward "just use Wordgard"; his incentive is
Wordgard adoption, not TypeRoof sovereignty; consultation transfers
architectural judgment, not implementation-level quirks knowledge; only
pays off with mature specs — sequence it after de-risking steps 1-2
(probe + port-surface inventory).

### Recommendation

1. **Switch the blueprint reference from PM to Wordgard** for any
   fresh-implementation work (PM sync stays in production).
2. **Pursue consultation scoped narrowly**: paid design review of the
   TypeRoof editor spec (schema + metamodel-backed document model +
   change mapping), timed after de-risking steps 1-2, with the
   development process disclosed up front. Small loss if declined;
   potentially months saved if accepted.

## Open Questions

1. **Position mapping**: PM transactions carry `StepMap`s; metamodel drafts
   have internal slot-maps that die at freeze. For step→draft application,
   positions must be re-resolved against the evolving draft (PM's own
   `Mapping` can do this) — but for diff→transaction direction, deriving
   minimal PM steps from a `StateComparison` tree diff (incl. MOVED/LIST_NEW_ORDER)
   is non-trivial. How complete must that mapping be (text edits only vs.
   arbitrary structural edits)?
2. **Undo semantics**: keeping PM's history plugin means undo restores PM
   docs; if sync becomes draft-mutation-based, undo transactions would flow
   through the same step→draft path — does metamodel-level undo become
   desirable (and where would it live, given `OLD_STATE` is deliberately
   dropped)?
3. **Performance**: the per-transaction cost is O(changed paths) on both
   sides (identity-pruned re-derivation), so the sync is unlikely to be a
   bottleneck for typical edits. Residual costs: per *changed* node the
   metamodel side pays an individual `createPrimalDraft`+`metamorphose`
   (full initOrder/coherence/freeze per node — heavyweight relative to PM's
   `new Node(...)`); the root doc object is new every transaction, so the
   `document` entry gets a fresh identity per keystroke and every
   `document`-dependent widget re-enters `update()` (relying on downstream
   identity shortcuts to stay cheap); schema change drops the cache
   (:1483) → one genuine full rebuild. Whether any of this is measurable
   would need a targeted micro-probe (the operator's perf-harness is
   off-limits).
4. **Schema identity**: `getLinked(schema)` depends on schema↔schemaModel
   WeakMap identity; any redesign must preserve or replace that lookup for
   NodeView/MarkView tag resolution.
5. **Selection/typeSpec side channel**: `editingTypeSpec` derivation reads
   PM selection + `resolved.path` — unaffected by sync removal, but any
   doc-representation change must keep emitting equivalent paths.
