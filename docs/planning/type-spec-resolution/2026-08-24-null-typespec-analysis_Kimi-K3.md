---
title: 'NULL-TypeSpec — Independent Analysis (Kimi-K3)'
eleventyNavigation:
  parent: Planning
  key: type-spec-resolution-analysis-kimi-k3
  title: 'TypeSpec Resolution: NULL-TypeSpec Analysis (Kimi-K3)'
  order: 48
agent-created: true
---

# NULL-TypeSpec: clean-slate analysis of TypeSpec resolution

Date: 2026-08-24
Status: initial analysis (further rounds to be amended)
Scope: `lib/js/components/prosemirror`, `lib/js/components/layouts/type-stage`,
`lib/js/components/type-spec-models.mjs`, `lib/js/components/type-spec-fundamentals.mjs`

Central question: how can certain node types be prevented from receiving
TypeSpec styling? Desire: assign nodes to a TypeSpec that does not actively
contribute to styling/rendering — either as default behavior when no TypeSpec
is linked, or by linking an explicit TypeSpec. Styles have a NULL-STYLE option;
there is no equivalent on the TypeSpec level. A TypeSpec could also be marked
"silent" via one of its own properties.

## Short answer

For normal schema-defined ProseMirror nodes, the current resolver always ends
at the origin/root TypeSpec if nothing more specific is registered. There is
currently no supported per-node-type "no TypeSpec styling" state.

This should not be implemented as an empty/special TypeSpec with no local
properties. Because of TypeSpec inheritance and renderer defaults, that would
still not be a real NULL-TypeSpec. The cleaner model is to make "no TypeSpec"
an explicit resolution result, separate from "resolve to a TypeSpec path".

## Current behavior

### `_getBestTypeSpecPropertiesId`

In `lib/js/components/prosemirror/integration.typeroof.jsx:88-123`:

1. The link is parsed as a path.
2. The resolver constructs a candidate path below `originTypeSpecPath`.
3. It checks whether `typeSpecProperties@<candidate>` is registered.
4. If not, it moves upward through the TypeSpec tree.
5. If everything fails, it returns `originTypeSpecPath`.

The mapping lookup happens in `getTypeSpecPropertiesIdMethod` at
`integration.typeroof.jsx:176-178`:

```js
const typeSpecLink = !nodeSpecToTypeSpec.has(typeKey)
    ? ""
    : nodeSpecToTypeSpec.get(typeKey).get("link").value;
```

These cases currently collapse into the same thing:

- node type has no mapping entry
- mapping entry has `link === ""`
- mapping entry explicitly points at the root, e.g. `"."`

All eventually resolve to the root TypeSpec.

Also important: `pathOfTypes.at(-1)` is the only document node type used for
the mapping lookup. The resolver does **not** walk through document ancestor
node types. Fallback happens through the **TypeSpec tree**, not through the
document hierarchy.

### Styling consumers

The resolved TypeSpec drives several things:

- `TypeSpecSubscriptions` in `prosemirror/type-spec.typeroof.jsx:831+`
  creates a `UIDocumentNodeOutfitter` for every subscribed PM node.
- That outfitter creates `UIDocumentTypeSpecStyler`, which applies:
  - font family and font metrics
  - text color/background color
  - text alignment/direction
  - column width
  - leading/margins
  - language attributes
- Marks use the parent node's `typeSpecProperties` to resolve intent/mark
  style links and intent tag bindings.
- Menus use `getTypeSpecsMethod`, so unmapped nodes still contribute the
  root TypeSpec to style availability.
- The direct viewer in `layouts/type-stage/viewer.typeroof.jsx` has a
  related `_hasTypeSpecStyling` concept, but it currently means "node type
  exists in the metamodel schema", not "node type has a TypeSpec mapping".

There is also separate pane-level styling in `TypeStagePaneStyler`
(`pane-styler.typeroof.jsx:29`), which always uses the root TypeSpec
properties for the document surface's background/language. Suppressing
node-level TypeSpecs would not automatically suppress that.

## NULL-STYLE is not a full NULL rendering state

The existing NULL-STYLE semantics are narrower than they may appear.

In `type-spec-models.mjs:290-307`, `stylePatch === ""` means:

- the style-link remains valid/selectable,
- intent tag binding still applies,
- a `styleLinkProperties@` handler is registered,
- but no StylePatch is layered onto the TypeSpec.

`StyleLinkLiveProperties` then uses the unpatched TypeSpecnion. So NULL-STYLE
means **"no patch override"**, not necessarily "no styling at all". The mark
can still receive TypeSpec-derived font/color/direction handling.

For TypeSpecs, it is useful to distinguish three concepts:

1. **Linked TypeSpec with no local overrides**
   Still inherits and applies root/parent TypeSpec properties.

2. **Linked but silent TypeSpec**
   A TypeSpec exists and can be selected/edited, but does not apply styling
   when chosen as a node target.

3. **No TypeSpec association**
   The node receives no node-level TypeSpec resolution at all.

These should not be represented by the same empty string.

The existing comment in `type-spec-fundamentals.mjs` already identifies this
ambiguity: empty path currently means both root and NULL-TypeSpec.

## Recommended semantic model

### 1. Add a mode to `NodeSpecToTypeSpecEdgeModel`

Current model at `prosemirror/models.typeroof.jsx:417-425`:

```js
NodeSpecToTypeSpecEdgeModel = _AbstractStructModel.createClass(
    "NodeSpecToTypeSpecEdgeModel",
    ["link", StringModel],
    ["label", StringModel],
)
```

A more explicit shape would be conceptually:

```
mode: "link" | "none"
link: "..."
label: "..."
```

Semantics:

- `mode: "link"` — current behavior; `link: "."` or legacy `""` means root.
- `mode: "none"` — explicit NULL-TypeSpec; the node type gets no TypeSpec
  styling.
- absent edge — decide separately whether it means legacy-root or no-TypeSpec.

`none` or `unstyled` is preferable to `unlinked`, because "unlinked" can
be confused with deleting the mapping entry.

Keeping `link` while in `none` mode could be useful as a non-destructive
UI memory when toggling back. Alternatively, clear it for strict coherence.
That is a UX/data-retention decision.

### 2. Make absent mapping mean no TypeSpec — eventually

Semantically, the cleanest long-term rule:

- no mapping entry → no node-level TypeSpec styling
- explicit root link → root TypeSpec styling
- explicit child link → child TypeSpec styling
- explicit `none` mode → no TypeSpec styling despite retaining an edge

But changing absent mappings now is backwards-incompatible: existing documents
may rely on the implicit root fallback.

A safer migration path:

1. Add explicit `mode: "none"` first.
2. Keep absent mapping → root temporarily.
3. Later migrate old states by materializing root links for node types that
   should retain old behavior.
4. Then switch absent mapping to no styling.

A transitional layout-level option such as
`unmappedNodeTypeSpec: "root" | "none"` could also make this explicit.

### 3. Treat "silent TypeSpec" as a separate target-side feature

A flag on `TypeSpecModel` would answer a different requirement:

- edge mode controls: **should this node type use a TypeSpec at all?**
- target flag controls: **is this TypeSpec itself renderable/styling-active?**

A good target-side shape would be something like:

```
stylingMode: "styled" | "silent"
```

rather than a generic boolean `silent`, because the intended semantics need
room to become precise.

If implemented, it should not go into the inheriting processed-properties
stream without special treatment. Otherwise a silent root or parent could
accidentally silence all children through property inheritance. Better options:

- read it directly from the resolved TypeSpec model, or
- emit it as a deliberately non-inheriting metadata property.

Also, a silent TypeSpec should probably stop resolution instead of falling
through to its parent. Otherwise it does not actually prevent styling — it
just hides the fact that the parent was applied.

One subtle consequence: a silent TypeSpec can still be an ancestor of another
linked TypeSpec. Today, its properties contribute to that child through the
TypeSpecnion. If "silent" should also remove it from inheritance, that
requires deeper changes in `HierarchicalScopeTypeSpecnion`; if it only means
"don't style nodes that directly select me", checking the final resolved
target is enough.

## Resolver/API implication

The current API name and return type assume success:

```js
getTypeSpecPropertiesIdMethod(...) -> string | Path
```

That makes NULL impossible to express cleanly. A resolution object should be
introduced internally, for example:

```js
{
    typeSpecPath: Path | null,
    typeSpecPropertiesId: string | null,
    appliesTypeSpecStyling: boolean,
    reason: "resolved" | "unmapped" | "explicit-none" | "silent"
}
```

This separates:

- whether a TypeSpec exists,
- whether it can be edited/selected,
- whether it should contribute styling,
- why no styling was applied.

The existing `getTypeSpecPropertiesIdMethod` could remain as a compatibility
wrapper initially, but all critical consumers should eventually use the richer
resolution.

The cache also needs adjustment:

- currently it stores only a `Path`;
- `null` resolutions need a record/sentinel, otherwise the cache will
  repeatedly miss or accidentally test `typeSpecProperties@null`;
- if a target-side `silent` flag is added, the cached resolution must be
  revalidated when the TypeSpec model changes, not only when
  `nodeSpecToTypeSpec` changes or registry membership changes.

## Required consumer behavior

A true NULL-TypeSpec should have these effects:

### Node rendering

- Do not create `UIDocumentTypeSpecStyler`.
- Do not create the node TypeSpec outfitter unless labels/editing should
  still be available.
- Node tag, attrs, reproduced HTML, and ProseMirror behavior remain
  schema-driven and unaffected.
- Existing inline styles must be removed when a node transitions from styled
  to unstyled. `UIDocumentTypeSpecStyler` currently does not appear to have
  explicit cleanup for all styles it writes.

### Marks

Marks inside an unstyled node should probably:

- render with their plain schema/spec tag,
- not resolve intent tag bindings from a TypeSpec,
- not receive a style-link styler,
- not get the existing `unknown-style` fallback merely because the node has
  no TypeSpec.

That last distinction matters: "node has no TypeSpec" and "TypeSpec has no
edge for this mark" are different conditions.

In the PM editor, the parent node subscription should probably still exist
structurally, with `typeSpecProperties === null`, so marks can find their
parent without creating a node styling widget.

### Menus and selection

`getTypeSpecsMethod` should skip null resolutions.

This affects:

- available style buttons,
- `editingTypeSpec`,
- selection display,
- TypeSpec labels.

`_prosemirrorDispatchTransaction` currently assumes at least one resolved
TypeSpec and destructures the first result. It would need an empty-result
path.

For an unstyled node, likely behavior:

- no TypeSpec becomes "current editing TypeSpec";
- style buttons depending on TypeSpec style links become unavailable;
- schema-native marks can still exist as document structure, but they are
  not TypeSpec-styled.

### Viewer parity

`UIDocumentElement._hasTypeSpecStyling` at `viewer.typeroof.jsx:214`
currently checks only `nodeSpecMap.has(typeKey)`. To support NULL-TypeSpec
consistently, it should derive from the actual mapping/resolution instead.

It also needs to become dynamic. The flag is currently constructor-time
state; changing `nodeSpecToTypeSpec` later must be able to:

- remove an existing styler,
- create a new one,
- update the context passed to text runs,
- clean stale inline styles.

The text-run side already has the desired conceptual behavior:
`hasTypeSpecStyling === false` suppresses style-link resolution and mark
stylers.

### Next-sibling margins

If the current node is styled but its next sibling is unstyled,
`nextProperties@` should become `null`. The `lineHeightAfter`/`emAfter`
calculation needs a defined fallback — probably the current TypeSpecnion,
matching the existing same-TypeSpec deduplication case.

## Recommendation (order of work)

1. **Define edge-side semantics first**
   Add `mode: "link" | "none"` to the node→TypeSpec edge.

2. **Introduce a nullable resolution result**
   Do not let `_getBestTypeSpecPropertiesId` keep pretending that root is
   always the right answer.

3. **Update PM and viewer consumers to skip node/mark TypeSpec styling when
   resolution is null**
   Keep the distinction from unknown-style handling.

4. **Keep absent mapping as root initially for compatibility**, unless
   existing documents are migrated.

5. **Only then consider target-side `stylingMode: "silent"`**
   It is useful for organizational/reusable TypeSpecs, but it is not
   necessary for basic per-node suppression.

The central design principle: **NULL-TypeSpec should mean "no TypeSpec
consumer is installed", not "an empty TypeSpec is installed".** The latter
still inherits properties and renderer defaults and therefore cannot provide
the desired semantics.
