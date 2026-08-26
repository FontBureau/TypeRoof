---
title: Silent TypeSpecs and TypeSpec Flags (user-doc source)
agent-created: true
agent: goose
model: moonshotai/kimi-k3
---

# Silent TypeSpecs (No Styler) and TypeSpec Flags

Source material for user-facing documentation of the shim-flags &
relative-linking feature. Not linked into the user docs; kept here as
the canonical description of the semantics.

A TypeSpec can carry two flags that change how the node it resolves to
is rendered and how it participates in typeSpec resolution. Both are
toggled in the TypeSpec properties panel of the type stage.

## No Styler (silent TypeSpecs)

A TypeSpec with **No Styler** set makes its node render *inherit-only*:
the node element itself gets no inline font, color, margin, or language
styling from that spec. This is useful for in-between structural nodes
("shims") that exist in the tree only to organize resolution, not to
style their own node.

**A silent spec doesn't style its node but still governs its marks.**
This is a feature, not a leak: marks (bold, italic, user styles) inside
a silent node still resolve their style links from the silent spec's
chain, so a silent spec with local property overrides shows those
properties on every marked span within it. A property-empty silent spec
(the typical shim) produces a chain identical to its typeSpec-tree
parent's, so the effect is invisible in the common case.

### The mark-rendering palette

What a mark renders as depends on the edge configuration of the
resolved spec:

| edge state                      | mark renders as                        |
|---------------------------------|----------------------------------------|
| linked to a style patch         | spec chain + patch                     |
| null-link (`""`)                | spec chain, no patch — **not bare**    |
| tombstone (`unlinked`)          | bare + `unknown-style` class           |
| no edge (nothing inherited)     | bare + `unknown-style` class           |

There is **no edge configuration yielding fully-bare marks without the
`unknown-style` class** — the palette is "chain-styled" or
"bare-with-marker".

## Exclude from Fallback

During typeSpec resolution, a node type whose link does not resolve
directly falls back toward the root, walking up the typeSpec tree. A
TypeSpec with **Exclude from Fallback** set is *passed through* by that
walk: it is invisible as a fallback landing, and resolution continues to
its parent. An *explicit* link to such a spec still resolves to it —
the flag only affects the fallback walk, never direct hits.

## TypeSpec links are relative by default

Node-type → TypeSpec links follow these anchoring rules:

| written link              | anchored at                          |
|---------------------------|--------------------------------------|
| `this/is/relative`        | the parent node's resolved spec      |
| `./this/is/relative`      | the parent node's resolved spec      |
| `../this/is/relative`     | the parent node's resolved spec      |
| `/this/is/absolute`       | the typeSpec root (origin)           |

`..` consumes one nesting level at a time. If `..` climbs past the
origin the link is treated as *broken* and resolution falls back toward
the root — excess `..` is never silently clamped. In the mapping UI, a
link that can't be resolved against the root tree shows as
`(relative: <link>)`, because relative links are anchored at the parent
node's spec and can only be fully resolved in document context.
