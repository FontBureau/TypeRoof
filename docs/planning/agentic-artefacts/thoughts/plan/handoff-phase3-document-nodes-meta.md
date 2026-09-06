# Handoff: Phase 3 of the document-tree walker/renderer separation (TypeRoof, 2026-09-05)

## Situation

We are in an RPI cycle implementing Phase 5a of `thoughts/plans/2026-09-05-1623-node-properties.md`
(umbrella). The cycle plan is `docs/planning/agentic-artefacts/thoughts/plan/2026-09-05-2159-document-tree-walker-renderer-separation.md`,
research is `docs/planning/agentic-artefacts/thoughts/research/2026-09-05-2119-document-tree-walker-renderer-separation.md`.
**Read the plan first; it is the source of truth.** Phases 0–2 are committed and green on branch
`demo/wikipedia`:

- `4f46a476` Phase 0: hygiene (dead code, fixture skip-guards)
- `debe5f94` Phase 1: behavior safety net `lib/js/tests/type-stage-viewer-behavior/index.test.mjs` (G1–G7)
- `8dbd2055` Phase 2: pure derivations extracted to
  `lib/js/components/layouts/type-stage/document-nodes-meta.mjs` (DOM-free function library:
  `resolveElementRenderingPlan`, `getWrapMarks`, `computeAttrDrivenDiff`, etc.). The viewer delegates.

**Your job: Phase 3 — the ownership flip.** This is where `DocumentNodesMeta` actually comes into
existence. Despite the module name, **no meta widget tree exists yet** — Phase 2 produced only a
function library; the viewer's `UIDocumentNodes`/`UIDocumentNode`/`UIDocumentElement` tree is still
the only document-tree structure, still mode-gated, still walking the document itself.

## Design center (operator-confirmed, non-negotiable)

**We always have meta and the nodeProperties; optionally we can attach DOM rendering, or future
renderers.** Locked decisions (see plan "Decisions" section):

1. `DocumentNodesMeta` always active at the top controller of **both** layouts
   (`layouts/type-stage/index.typeroof.jsx` and `layouts/ramp/index.typeroof.jsx`), rootPath
   `./document`, **no activationTest** — parallel to the viewer/editor registrations. The viewer
   keeps its `showViewerActivationTest`.
2. Per-node registration id = **`nodeProperties@<absolute documentNodePath>`** (id = model path,
   framework convention; `SimpleProtocolHandler.register` throws on duplicates). Parent lookup =
   path math. Payload for now: the root node-properties map (behavior-neutral; 5b installs real
   per-node scopes).
3. **Adopt, don't parallel**: `UIDocumentNodes`/`UIDocumentNode` (and the pure halves of
   `UIDocumentElement`/`UIDocumentTextRun`) form the meta tree; DOM rendering becomes an optional
   attachment created by the meta nodes. Do NOT build a second parallel tree with sync logic.
4. Consumers that know their document-node path subscribe to **their own**
   `nodeProperties@<documentNodePath>` id (behavior-neutral today, exercises the scheme, is the 5b
   position); context-free consumers (pane styler) keep the root id.

## Work items (plan Phase 3, with the design step the operator expects FIRST)

**Step 0 — attachment interface design, review before code.** The plan names the seams but not the
mechanism. Produce a short written design for operator review covering:
- How `DocumentNodesMeta` (always on) exposes per-node lifecycle to optional renderers — likely a
  renderer-registration on the meta root; the viewer registers/unregisters on its
  activationTest-driven create/destroy (mode switches!).
- How the mode-gated viewer discovers and hooks the meta tree (both are children of the same
  controller; widget lookup conventions: `getWidgetById`, protocol handlers).
- The insertion-callback interface replacing the `insertDocumentNode` monkey-patch
  (viewer.typeroof.jsx `UIDocumentNodes` constructor, formerly :1035-1038) — e.g. meta container
  resolves order/siblings and calls `attachment.insertNode(domNode, beforeDomNode|null)`, no-op
  when no renderer attached.
- Whether `UIDocumentNodes`/`UIDocumentNode` classes move into a meta module wholesale and the
  viewer classes become subclasses/attachments, or the meta tree gains an attachment slot per node.
  Key framework facts: DOM-less widgets are first-class (omit `zone` in settings ⇒
  `hostElement: null`); dynamic-map provisioning lives in `_BaseDynamicMapContainerComponent`;
  `UIDocumentNode` is already pure tree infrastructure (research §1.2).
- Ramp layout check: ramp is editor-only (no viewer, no mode switching);
  `RampProseMirrorContext` at `layouts/ramp/index.typeroof.jsx:90`; `nodeProperties@` handler
  already installed at :250. Meta must work there with zero attachments.

**Step 1 — implement** (after design OK):
1. `DocumentNodesMeta` dynamic-map container + meta node classes (adopt from viewer code), in
   `document-nodes-meta.mjs` or a new `.typeroof.jsx` if JSX/widget classes warrant it
   (housekeeping: new `.mjs` files need an explicit un-ignore line in `.prettierignore`).
2. Register always-active in both layout controllers (rootPath `./document`, deps
   `nodeSpec`/`markSpec`/`nodeSpecToTypeSpec`).
3. Viewer becomes an attachment: `UIDocumentViewer` keeps its activationTest + root `<article>`,
   attaches to the meta tree instead of owning the walk; monkey-patch → defined insertion callback.
4. Per-node `nodeProperties@<documentNodePath>` registrations in meta nodes
   (`setUpdated` push on change, `hasProtocolHandlerRegistration` guard idiom, payload = root map).
5. Consumer migration per decision 4.

**Step 2 — verify (required before commit):**
- `npm run typecheck`, `npm run lint`, `npm test` — the G1–G7 behavior suite MUST pass **unmodified**.
- New assertion (add to the behavior suite): in editor-only mode no `article.typeroof-document`
  exists while per-node `nodeProperties@` registrations are live (observable via the protocol
  handler).
- Manual (required, not optional): wikipedia demo — editor, viewer, compare modes render and switch
  identically; ramp layout renders, labels/parameters work.

## Commit discipline (operator instruction, absolute)

Before EVERY commit: stop, present commit message + file list, proceed only on operator's "OKOK".
Commit messages carry the metadata trailer read from its actual sources at commit time:
provider = `grep -m1 '^active_provider:' ~/.config/goose/config.yaml | sed 's/^[^:]*: *//'`;
model = `awk -v p="$PROVIDER" '$0 ~ "^  " p ":$" {f=1; next} /^  [a-z]/ {f=0} f && /model:/ {sub(/.*model: */,""); print; exit}' ~/.config/goose/config.yaml`;
agent = `goose --version | head -1 | tr -d ' '` → `agent: goose v<version>`.

## After Phase 3

- Follow-up already noted in the plan ("Follow-up Items"): the pinned mark-wrap quirk (G7) —
  `UIDocumentTextRun` dependency mappings lack `"marks"`; ~1–3 line fix + flip G7 assertions.
  Good first post-5a commit; verifies the new meta dependency wiring end-to-end.
- Phase 4 (archive): `git mv` research + plan into `docs/planning/agentic-artefacts/thoughts/{research,plan}/`,
  update cross-references, final archiving commit (also gated on OKOK).
- The `thoughts/` directory is currently untracked — expected; it lands with the archiving commit.

## Known landmines (learned in Phases 1–2)

- Class-field bindings (`_getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod`) don't survive
  being passed as callbacks across module boundaries — pass bound closures.
- List-model iteration yields `[key, value]` pairs; splice/move only via the state draft chain
  (`draft.get("activeState").get("document").get("content")...`), never `getDraft()` on immutable
  sub-models.
- Schema typeKeys are names like `heading-2`/`paragraph` (not `h2`/`p`); `"strong"` is a mark, not
  a node.
- Pre-existing lint error unrelated to this work: `properties-generators.mjs:534`
  `horizontalWidthSum` unused — leave alone.
