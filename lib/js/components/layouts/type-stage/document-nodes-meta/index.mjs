// DocumentNodesMeta — the always-active, DOM-free document-tree meta layer
// (Phase 3 of the walker/renderer separation,
// thoughts/plans/2026-09-06-1047-phase3-document-nodes-meta-attachment-interface.md).
//
// Design center: we always have meta and the nodeProperties; optionally we
// can attach DOM rendering, or future renderers. No class in this module
// touches the DOM — no DOM value ever enters the meta tree: renderers
// attach via attachRenderer(handlerFn); per document node the meta tree
// calls the handler with meta-originating information (metaInfo) and
// initializes the widget description the handler returns. Where the
// renderer puts its nodes (parent elements, insertion order) is the
// handler's own business.
//
// The handler contract:
//     handlerFn(metaInfo) →
//         [settings, dependencyMappings, Constructor, ...args] | null
// metaInfo = {
//     typeKey,            // dispatch result ("text" vs. element)
//     rootPath,           // absolute document-node path
//     pathOfTypes,        // ancestor type chain incl. the own typeKey
//     context,            // inInlineContext, hasTypeSpecStyling, …
//     renderingPlan,      // element nodes: resolveElementRenderingPlan result
//     reposition,         // false on attach; true on reorder notification
// }
// On reposition the handler re-inserts its existing attachment and
// returns null — the meta tree creates nothing in that case.
//
// Node-properties scopes (5b): every element node owns a
// DocumentNodeProperties scope component holding its
// HierarchicalScopeNodeProperties — CascadingMap([local, parent]) with
// the parent node's settled effective map as the "parent" layer, so
// computed facts (geometry) flow document node → document node. The
// dispatcher's nodeProperties@<documentNodePath> registration answers
// consumers with a scope-like payload (an object answering
// .getProperties()): the own scope component for element nodes, the
// parent element's for text runs (consume-only), the root scope at the
// end of every chain. The scope component is provisioned in the
// element constructor — renderer attachments are initialized before
// the element's first update and read the payload immediately — and
// rebuilt when its resolved typeSpecProperties@ id changes (the
// viewer's _provisionTypeSpecStyler pattern). A parent scope rebuild
// re-triggers the children's updates via the "@parentNodeProperties"
// trigger mapping (the noStyler-dependency precedent).

import {
    _BaseComponent,
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
} from "../../../basics/component.mjs";
import { Path } from "../../../../metamodel.mjs";

import { resolveElementRenderingPlan } from "./derivations.mjs";
import {
    HierarchicalScopeNodeProperties,
    NODE_PROPERTIES_INHERITANCE_POLICY,
} from "../node-properties.mjs";
import { NODE_PROPERTIES_GENERATORS } from "../node-properties-generators.mjs";
import { getTypeSpecPropertiesIdMethod } from "../../../prosemirror/integration.typeroof.jsx";

// Per-node renderer attachment bookkeeping, shared by all meta nodes
// that invoke handlers (the document container node, meta element,
// meta text-run). The description the handler returns is initialized in
// the owning component's context (so require("raw:zones") etc. resolve
// against the owner's zones); the wrapper is pushed into the
// component's _widgets (so the meta node's regular update cycle
// reaches the attachments) and stored per handler for detach. Newly
// created attachments get their initial update from the root state
// cached by the meta root (widgetBus.rootState).
class RendererAttachments {
    constructor(component) {
        this._component = component;
        this._widgets = new Map(); // handlerFn → widgetWrapper
        this._handlers = new Set(); // handlerFn (incl. null descriptions)
    }

    attach(handlerFn, metaInfo) {
        if (this._handlers.has(handlerFn))
            throw new Error(
                `LIFECYCLE ERROR ${this._component} re-attach of a handler.`,
            );
        this._handlers.add(handlerFn);
        const description = handlerFn({ ...metaInfo, reposition: false }),
            component = this._component;
        if (description === null) return null;
        const widgetWrapper = component._initWrapper(
            component._childrenWidgetBus,
            ...description,
        );
        this._widgets.set(handlerFn, widgetWrapper);
        component._widgets.push(widgetWrapper);
        component._createWidget(widgetWrapper);
        widgetWrapper.widget.initialUpdate(component.widgetBus.rootState);
        return widgetWrapper;
    }

    detach(handlerFn) {
        this._handlers.delete(handlerFn);
        const widgetWrapper = this._widgets.get(handlerFn);
        if (widgetWrapper === undefined) return;
        this._widgets.delete(handlerFn);
        const index = this._component._widgets.indexOf(widgetWrapper);
        if (index !== -1) this._component._widgets.splice(index, 1);
        this._component._destroyWidget(widgetWrapper);
    }

    reposition(handlerFn, metaInfo) {
        if (!this._handlers.has(handlerFn)) return;
        // The handler re-inserts its existing attachment; null return,
        // nothing is created.
        handlerFn({ ...metaInfo, reposition: true });
    }

    *handlers() {
        yield* this._handlers;
    }

    destroy() {
        // The wrappers live in the component's _widgets; the
        // component's own destroy destroys them.
        this._widgets.clear();
        this._handlers.clear();
    }
}

// The document root node itself: seeds pathOfTypes (the document root's
// typeKey, usually "doc") and invokes the renderer handlers for the
// document container node. Renderer trees that skip the container level
// (the 5a viewer) return null there.
class DocumentNodesMetaDocument extends _BaseContainerComponent {
    constructor(widgetBus, zones, pathOfTypes) {
        super(widgetBus, zones);
        this._pathOfTypes = pathOfTypes;
        this._attachments = new RendererAttachments(this);
    }

    get _metaInfo() {
        return {
            typeKey: this._pathOfTypes.at(-1),
            rootPath: this.widgetBus.rootPath,
            pathOfTypes: this._pathOfTypes,
            context: { inInlineContext: false },
            renderingPlan: null,
        };
    }

    attach(handlerFn) {
        this._attachments.attach(handlerFn, this._metaInfo);
    }

    detach(handlerFn) {
        this._attachments.detach(handlerFn);
    }

    reposition(handlerFn) {
        this._attachments.reposition(handlerFn, this._metaInfo);
    }

    destroy() {
        this._attachments.destroy();
        super.destroy();
    }
}

// Per document node: typeKey dispatch + node-identity rebuild (adopted
// from the viewer's UIDocumentNode), the per-node nodeProperties@<rootPath>
// registration (declared in the wrapper settings, see
// DocumentNodesMetaNodes._createWrapper) and the renderer handler cascade
// into the dispatched meta node.
class DocumentNodesMetaNode extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        defaultSchemaSpec,
        context,
        parentNodeProperties = null,
        parentNodePropertiesId = null,
    ) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = context;
        this._currentTypeKey = null;
        this._rendererHandlers = new Set(); // handlerFn
        this._parentNodePropertiesArg = parentNodeProperties;
        // The registration id of the nearest nodeProperties@ scope
        // above this dispatcher (the parent dispatcher's id; the root
        // id for top-level nodes) — threaded through the containers so
        // the element's scope component can depend on it as its
        // rebuild trigger.
        this._parentNodePropertiesId = parentNodePropertiesId;
    }

    get parentNodePropertiesId() {
        return this._parentNodePropertiesId;
    }

    // The scope-chain arg threaded down by the containers (see
    // DocumentNodesMetaNodes._createWrapper), resolved: the parent
    // element's scope component (nested nodes), the root scope
    // instance, or — from the meta root's lazy getter — the root
    // scope's effective map. null is transient (before the root
    // registers); the "rootNodeProperties@" mapping is the guaranteed
    // endpoint of every chain.
    get _parentScopeChain() {
        const parent = this._parentNodePropertiesArg ?? null;
        if (parent !== null) {
            // Unwrap the lazy root getter seeded by the meta root.
            const resolved = typeof parent === "function" ? parent() : parent;
            if (resolved !== null && resolved !== undefined) return resolved;
        }
        return this.getEntry("rootNodeProperties@")?.nodeProperties ?? null;
    }

    // The nearest scope-like payload at or above this dispatcher: the
    // own scope component (element nodes), the parent element's (text
    // runs), or the root scope. The payload contract is scope-like — an
    // object answering .getProperties() — hence the root answer is the
    // registration's *scope*, not the registering
    // TypeSpecLiveProperties component.
    get _scopeLikePayload() {
        const child = this._widgets[0]?.widget;
        if (child instanceof DocumentNodesMetaElement) {
            const scopeComponent = child.nodePropertiesComponent;
            if (scopeComponent !== null) return scopeComponent;
        }
        if (child instanceof DocumentNodesMetaTextRun) {
            const parent = child.parentNodeProperties;
            if (parent instanceof DocumentNodeProperties) return parent;
        }
        return this.getEntry("rootNodeProperties@")?.nodeProperties ?? null;
    }

    _createWrapperForType(typeKey) {
        const settings = {
                rootPath: Path.fromParts("."),
            },
            isText = typeKey === "text",
            // Mirrors the viewer's dispatch mappings: the element reads
            // its attrs (re-derivation of the plan on change) and its
            // content collection; the text run reads its text. The
            // schema specs feed the plan derivation.
            dependencyMappings = isText
                ? [
                      "text",
                      // Mark additions/removals must re-provision the
                      // text run (the renderer attachment re-derives
                      // its mark wrappers from them).
                      "marks",
                      [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                      [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                      [
                          this.widgetBus.getExternalName(
                              "nodeSpecToTypeSpec",
                          ),
                          "nodeSpecToTypeSpec",
                      ],
                  ]
                : [
                      ["./content", "nodes"],
                      ["./attrs", "attrs"],
                      [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                      [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                      [
                          this.widgetBus.getExternalName(
                              "nodeSpecToTypeSpec",
                          ),
                          "nodeSpecToTypeSpec",
                      ],
                  ],
            Constructor = isText
                ? DocumentNodesMetaTextRun
                : DocumentNodesMetaElement,
            args = isText
                ? [
                      this._zones,
                      this._defaultSchemaSpec,
                      this._context,
                      this._parentNodeProperties,
                  ]
                : [
                      this._zones,
                      this._defaultSchemaSpec,
                      this._context,
                      // The element's scope provisioning reads the
                      // parent scope off the dispatcher (no
                      // parent-widget chain exists in the framework).
                      this,
                  ];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _provisionWidgets(/* compareResult */) {
        const nodes = this.getEntry(this.widgetBus.rootPath.parent),
            key = this.widgetBus.rootPath.parts.at(-1),
            node = nodes.get(key),
            typeKey = node.get("typeKey").value;
        if (this._currentTypeKey === typeKey) return new Set();
        this._currentTypeKey = typeKey;
        const newWrapper = this._createWrapperForType(typeKey),
            deleted = this._widgets.splice(0, Infinity, newWrapper);
        for (const wrapper of deleted) this._destroyWidget(wrapper);
        const requiresFullInitialUpdate = super._provisionWidgets();
        // The dispatched child exists now: attach the known renderers.
        // (A renderer attaching later cascades via attach().)
        for (const handlerFn of this._rendererHandlers)
            newWrapper.widget?.attach(handlerFn);
        return requiresFullInitialUpdate;
    }

    // The payload of this node's nodeProperties@ registration: a
    // scope-like object answering .getProperties() with the node's
    // effective map (5b). An unbuilt scope component delegates its
    // .getProperties() to the parent payload until its first update
    // builds the scope, so consumers never see a transient raw map or
    // null.
    get nodeProperties() {
        return this._scopeLikePayload;
    }

    // The nearest scope-like payload above this dispatcher (its own
    // payload minus the own-scope case): the fallback for consumers
    // reading the scope component before its scope exists.
    get parentPayload() {
        const chained = this._parentScopeChain;
        if (chained === null) return null;
        if (chained instanceof DocumentNodeProperties) return chained;
        return this.getEntry("rootNodeProperties@")?.nodeProperties ?? null;
    }

    // The nearest *settled effective map* strictly ABOVE this dispatcher
    // — the scope-build parent for this node's own scope component
    // (the G8 contract: a node's cascade sees the parent's own effective
    // map, never a fallback map). Resolved from the ancestor chain
    // (_parentScopeChain) only — the settled-map analogue of
    // parentPayload, deliberately NOT this dispatcher's own scope
    // (reading _widgets[0] here would be a self-loop: the node's own
    // scope build would consume itself as its parent). null while no
    // ancestor scope is built (the build defers and retries when the
    // parent scope's identity change re-triggers it).
    get ancestorSettledProperties() {
        const chained = this._parentScopeChain;
        if (chained === null || chained === undefined) return null;
        if (chained instanceof DocumentNodeProperties)
            return chained.settledProperties;
        if (chained instanceof HierarchicalScopeNodeProperties)
            return chained.getProperties();
        // The meta root's lazy getter answers the root scope's
        // effective map directly (already a settled map).
        return chained;
    }

    attach(handlerFn) {
        if (this._rendererHandlers.has(handlerFn))
            throw new Error(`LIFECYCLE ERROR ${this} re-attach of a handler.`);
        this._rendererHandlers.add(handlerFn);
        const child = this._widgets[0]?.widget;
        if (child !== null && child !== undefined) child.attach(handlerFn);
    }

    detach(handlerFn) {
        this._rendererHandlers.delete(handlerFn);
        const child = this._widgets[0]?.widget;
        if (child !== null && child !== undefined) child.detach(handlerFn);
    }

    reposition(handlerFn) {
        const child = this._widgets[0]?.widget;
        if (child !== null && child !== undefined)
            child.reposition(handlerFn);
    }
}

// Dynamic-map container over a node's "content" collection (adopted from
// the viewer's UIDocumentNodes, minus the DOM slot insertion — renderer
// attachments self-insert, the meta tree is DOM-free). Owns the per-key
// wrapper creation, the handler cascade and the reorder notification.
class DocumentNodesMetaNodes extends _BaseDynamicMapContainerComponent {
    constructor(
        widgetBus,
        zones,
        defaultSchemaSpec,
        rendererHandlers,
        context,
        parentNodeProperties = null,
        parentNodePropertiesId = null,
    ) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        // handlerFn — the renderers attached to this container's
        // children. Stored on the widgetBus (which every meta-node
        // child inherits) so the map installed by an ancestor is
        // visible here.
        widgetBus.rendererHandlers = rendererHandlers;
        this._context = context;
        // The nearest node-properties scope above this container (the
        // owning element's scope component; a lazy getter at the meta
        // root); threaded to each dispatcher child.
        this._parentNodeProperties = parentNodeProperties;
        // Its registration id (the scope components' rebuild trigger);
        // threaded alongside.
        this._parentNodePropertiesId = parentNodePropertiesId;
    }

    _createWrapper(rootPath) {
        const key = rootPath.parts.at(-1),
            settings = {
                rootPath: rootPath,
                nodeKey: key,
                // Per-node registration, id = absolute document-node
                // path (locked decision 2). Registered on the dispatcher
                // (not the typeKey child): the typeKey rebuild creates
                // the new wrapper before destroying the old one, and
                // duplicate registrations throw.
                "nodeProperties@": rootPath.toString(),
            },
            dependencyMappings = [
                [this.widgetBus.getExternalName("collection"), "collection"],
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
                // The delegated payload source (see
                // DocumentNodesMetaNode.nodeProperties).
                [
                    `nodeProperties@${this.widgetBus.originTypeSpecPath.toString()}`,
                    "rootNodeProperties@",
                ],
            ],
            Constructor = DocumentNodesMetaNode,
            args = [
                this._zones,
                this._defaultSchemaSpec,
                this._context,
                this._parentNodeProperties,
                this._parentNodePropertiesId,
            ],
            childWidgetBus = Object.create(this._childrenWidgetBus); // inherit
        childWidgetBus.nodeKey = key;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _createWidget(widgetWrapper) {
        super._createWidget(widgetWrapper);
        // Attach the known renderers: the node now exists, a renderer
        // attaching later (mode switch) finds it in place.
        for (const handlerFn of this.widgetBus.rendererHandlers)
            widgetWrapper.widget.attach(handlerFn);
    }

    attach(handlerFn) {
        if (this.widgetBus.rendererHandlers.has(handlerFn))
            throw new Error(`LIFECYCLE ERROR ${this} re-attach of a handler.`);
        this.widgetBus.rendererHandlers.add(handlerFn);
        for (const widgetWrapper of this._widgets)
            widgetWrapper.widget?.attach(handlerFn);
    }

    detach(handlerFn) {
        this.widgetBus.rendererHandlers.delete(handlerFn);
        for (const widgetWrapper of this._widgets)
            widgetWrapper.widget?.detach(handlerFn);
    }

    _reorderChildren(reorderReasons, reorderStartIndex) {
        if (!reorderReasons.has("changed")) return;
        const collection = this.getEntry("collection"),
            keys = Array.from(collection.keys()).slice(reorderStartIndex);
        for (const key of keys)
            for (const handlerFn of this.widgetBus.rendererHandlers)
                this._keyToWidget.get(key)?.widget?.reposition(handlerFn);
    }
}

// Per-document-node node-properties scope (5b): builds and owns the
// node's HierarchicalScopeNodeProperties and marks this node's
// nodeProperties@ registration updated when the scope changes. The
// TypeSpecLiveProperties role for the node channel, without a Meta
// analogue — the meta layer itself provides the tree structure.
// Provisioned in the element constructor (attachments read the payload
// before the element's first update) and rebuilt on resolved-id change
// by DocumentNodesMetaElement._provisionNodeProperties, mirroring the
// viewer's _provisionTypeSpecStyler: the host typeSpecnion arrives as
// the "properties@" mapping (resolved id, typeSpecProperties@<path>),
// the parent scope's settled map via the dispatcher's chain lookup.
class DocumentNodeProperties extends _BaseComponent {
    constructor(
        widgetBus,
        parentScopeChainGetter,
        payloadFallback,
        dispatcher,
    ) {
        super(widgetBus);
        // Zero-arg fn answering the nearest *settled effective map*
        // above this node (the dispatcher's ancestorSettledProperties).
        this._parentScopeChainGetter = parentScopeChainGetter;
        // Zero-arg fn answering the nearest scope-like payload above
        // the dispatcher — the fallback for consumers reading this
        // component before its first update built the scope.
        this._payloadFallback = payloadFallback;
        // The owning dispatcher: the registration lives there (this
        // component has none — the has-guard idiom in update); the
        // parent chain lookups go through it.
        this._dispatcher = dispatcher;
        this._nodeProperties = null;
    }

    // The parent node's settled effective map (a Map/CascadingMap), or
    // null while no ancestor scope is built yet. The read is deferred
    // through the chain getter: the root scope registers only after
    // the root TypeSpecLiveProperties' first update — later in the
    // boot cycle than this component's initial update — and a parent
    // node's scope component likewise exists before its own first
    // update ran. The scope build below defers on null; once the
    // parent scope exists its identity change triggers the build.
    get _parentNodeProperties() {
        return this._parentScopeChainGetter();
    }

    get hasScope() {
        return this._nodeProperties !== null;
    }

    // Scope-like, like the root TypeSpecLiveProperties' accessor:
    // consumers of a nodeProperties@ payload call .getProperties().
    // Before this component's own scope exists (its initial update runs
    // after same-cycle renderer attachments are initialized) the
    // dispatcher's fallback chain answers — exactly what a consumer
    // reading the dispatcher directly would receive.
    getProperties() {
        if (this._nodeProperties === null) {
            const fallback = this._payloadFallback();
            // The fallback chain ends at the root scope (scope-like);
            // a transient null (root not yet registered) answers an
            // empty map — consumers treat it as "no node properties
            // yet", the same as the notFoundFallbackValue path.
            if (fallback === null || typeof fallback?.getProperties !== "function")
                return new Map();
            return fallback.getProperties();
        }
        return this._nodeProperties.getProperties();
    }

    // The scope-build input: the parent's *effective map* if the parent
    // scope is already built, else null (the build defers; the parent
    // scope's identity change re-triggers it). Prevents scopes from
    // cascading into a not-yet-built parent's fallback map — the
    // effective map must see the parent's own effective map, not the
    // root's (the G8 contract).
    get settledProperties() {
        return this._nodeProperties === null
            ? null
            : this._nodeProperties.getProperties();
    }

    update(changedMap) {
        // Rebuild when the host typeSpecnion changed (the registry
        // marked the typeSpecProperties@ id updated) or the parent
        // scope's identity changed (a parent rebuild marks the
        // "@parentNodeProperties" trigger dependency; the identity
        // check below catches the actual change).
        const typeSpecProperties = changedMap.has("properties@")
                ? changedMap.get("properties@")
                : this.getEntry("properties@"),
            typeSpecnion =
                typeSpecProperties === null
                    ? null
                    : typeSpecProperties.typeSpecnion,
            parentNodeProperties = this._parentNodeProperties;
        // Don't rebuild if the inputs haven't changed (mirrors
        // TypeSpecLiveProperties' local/parent change check).
        if (
            this._nodeProperties !== null &&
            typeSpecnion === this._typeSpecnion &&
            parentNodeProperties === this._parentNodePropertiesSeen
        )
            return;
        this._typeSpecnion = typeSpecnion;
        this._parentNodePropertiesSeen = parentNodeProperties;
        // The typeSpecProperties@ protocol registers no fallback value,
        // so null here can't be a not-found fallback: it means the
        // resolution returned a live registration whose payload broke
        // its lifecycle contract (no update ran yet). Fail loud rather
        // than building a scope without a host map.
        if (typeSpecnion === null)
            throw new Error(
                `LIFECYCLE ERROR ${this}: typeSpecProperties payload has no typeSpecnion yet.`,
            );
        // Boot-cycle race: the parent node's settled effective map may
        // not exist yet (see _parentNodeProperties). Defer the build —
        // the parent scope's identity change re-triggers it on a later
        // cycle. Consumers read the dispatcher's fallback (the nearest
        // scope up the chain) until the scope exists.
        if (
            parentNodeProperties === null ||
            parentNodeProperties === undefined
        ) {
            this._nodeProperties = null;
            return;
        }
        this._nodeProperties = HierarchicalScopeNodeProperties.createFromParentMap(
            NODE_PROPERTIES_GENERATORS,
            // hostMap: the node's resolved typeSpecnion properties
            typeSpecnion.getProperties(),
            // The parent node's settled effective map: a plain
            // Map/CascadingMap (not a scope instance) so the cascade's
            // "parent" layer IS that map — the G8 contract.
            parentNodeProperties,
            // No inheritance policy yet (socket only; see the root
            // scope in live-properties).
            NODE_PROPERTIES_INHERITANCE_POLICY,
        );
        // Mark this node's registration updated: consumers (children's
        // scopes via the container chain, renderer attachments via
        // their mappings) re-read. The dispatcher owns the registration
        // (this component has none, hence the has-guard idiom).
        if (
            this.widgetBus.wrapper.hasProtocolHandlerRegistration(
                "nodeProperties@",
            )
        ) {
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.wrapper.getProtocolHandlerRegistration(
                    "nodeProperties@",
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }
}

// Shared base of the dispatched meta nodes (element and text-run):
// renderer attachment invocation and the handler cascade protocol.
class _DocumentNodesMetaDispatchedNode extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
        this._attachments = new RendererAttachments(this);
    }

    attach(handlerFn) {
        this._attachments.attach(handlerFn, this._metaInfo);
    }

    detach(handlerFn) {
        this._attachments.detach(handlerFn);
    }

    reposition(handlerFn) {
        this._attachments.reposition(handlerFn, this._metaInfo);
    }

    destroy() {
        this._attachments.destroy();
        super.destroy();
    }
}

// Meta node of a non-text document node: derives the rendering plan
// (pure, from derivations.mjs), extends pathOfTypes/childrenContext,
// provisions the child container (the recursion — always, renderer or
// not, unless the node is a verbatim-html leaf) and invokes the renderer
// handlers with the plan.
class DocumentNodesMetaElement extends _DocumentNodesMetaDispatchedNode {
    constructor(widgetBus, zones, defaultSchemaSpec, context, dispatcher) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = context;
        this._dispatcher = dispatcher;
        // Derived immediately (like the viewer's UIDocumentElement
        // constructor did): handlers may attach before the first
        // provisioning runs, and they receive the plan.
        this._renderingPlan = this._deriveRenderingPlan(this._context);
        this._childContainerAttached = new Set(); // handlerFn
        this._nodePropertiesWrapper = null;
        // The anchor of the effective typeSpec path resolution: the
        // origin registry's own typeSpecProperties@ id. The typeSpec
        // structure lives at the origin registry, so resolving there
        // yields the effective id directly — no per-node re-resolution
        // is needed within the meta layer.
        this._originTypeSpecPath = this.widgetBus.originTypeSpecPath;
        // Created immediately (like the rendering plan above):
        // renderer handlers may attach before this element's first
        // update runs — the dispatcher attaches them right after
        // creation — and their stylers read this node's nodeProperties@
        // payload, which is the scope component. An unbuilt scope
        // component delegates .getProperties() to the parent payload
        // until its first update builds the scope.
        this._provisionNodeProperties();
    }

    // In-module binding: class-field bindings don't survive being
    // passed as callbacks across module boundaries.
    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    // The node's scope component (provisioned in the constructor).
    get nodePropertiesComponent() {
        return this._nodePropertiesWrapper?.widget ?? null;
    }

    _deriveRenderingPlan(context) {
        return resolveElementRenderingPlan(
            this.getEntry("."),
            this.getEntry("nodeSpec"),
            this._defaultSchemaSpec,
            context,
        );
    }

    get _metaInfo() {
        const plan = this._renderingPlan;
        return {
            typeKey: plan.typeKey,
            rootPath: this.widgetBus.rootPath,
            pathOfTypes: plan.pathOfTypes,
            // The node's own context (the attachment re-derives
            // attr-driven directives against it); the children's
            // context is plan.childrenContext.
            context: plan.context,
            renderingPlan: plan,
        };
    }

    attach(handlerFn) {
        super.attach(handlerFn);
        this._attachChildContainer(handlerFn);
    }

    detach(handlerFn) {
        this._childNodesContainer?.detach(handlerFn);
        this._childContainerAttached.delete(handlerFn);
        super.detach(handlerFn);
    }

    // Attach the child container to the handler (where the renderer
    // puts the children's nodes is the handler's business).
    _attachChildContainer(handlerFn) {
        if (this._childContainerAttached.has(handlerFn)) return;
        const childContainer = this._childNodesContainer;
        if (childContainer === null) return;
        this._childContainerAttached.add(handlerFn);
        childContainer.attach(handlerFn);
    }

    get _childNodesContainer() {
        // The child container widget, if this node is not a
        // verbatim-html leaf.
        for (const widgetWrapper of this._widgets)
            if (widgetWrapper.widget instanceof DocumentNodesMetaNodes)
                return widgetWrapper.widget;
        return null;
    }

    // Provision (or rebuild) the node's scope component. A widget
    // cannot change its own external dependency mappings, so a changed
    // resolved id — the typeSpecProperties@ id (typeSpec relinking) or
    // the "@parentNodeProperties" trigger id — replaces the wrapper
    // (the viewer's _provisionTypeSpecStyler pattern). Both ids are
    // document-path/typeSpec-path keyed and stable for the element's
    // lifetime, so an identity check suffices; only id *changes*
    // rebuild. Called from the constructor (attachments read the
    // payload before the first update) and from _provisionWidgets
    // (resolved-id change).
    _provisionNodeProperties() {
        const typeSpecPropertiesId = this._getTypeSpecPropertiesId(
                this._renderingPlan.pathOfTypes,
            ),
            parentNodePropertiesId = this._dispatcher.parentNodePropertiesId;
        if (this._nodePropertiesWrapper !== null) {
            const reverseMapping =
                this._nodePropertiesWrapper.dependencyReverseMapping;
            if (
                reverseMapping.get("properties@") === typeSpecPropertiesId &&
                reverseMapping.get("@parentNodeProperties") ===
                    parentNodePropertiesId
            )
                return;
            const oldWrapper = this._nodePropertiesWrapper,
                oldIndex = this._widgets.indexOf(oldWrapper);
            this._widgets.splice(oldIndex, 1);
            this._destroyWidget(oldWrapper);
            this._nodePropertiesWrapper = null;
        }
        const widgetWrapper = this._initWrapper(
            this._childrenWidgetBus,
            {},
            [
                [typeSpecPropertiesId, "properties@"],
                // Not read for its value: the parent scope arrives via
                // the constructor-arg chain. Declared so a parent scope
                // rebuild (its setUpdated mark) re-triggers this
                // component's update — the noStyler-dependency
                // precedent of typeSpecStylerDependencyMappings.
                [parentNodePropertiesId, "@parentNodeProperties"],
            ],
            DocumentNodeProperties,
            // The parent node's settled effective map (never a
            // fallback map): the child's cascade must see the parent's
            // own effective map. null while the parent's scope is
            // unbuilt — the build defers and retries when the parent
            // scope's identity change re-triggers it. Resolved from the
            // ancestor chain (a self-read of the dispatcher's own scope
            // would be a self-loop).
            () => this._dispatcher.ancestorSettledProperties,
            // Consumers attaching before this component's first update
            // read the nearest scope-like payload above the dispatcher
            // (the dispatcher's own payload would answer this very
            // component — a self-loop).
            () => this._dispatcher.parentPayload,
            this._dispatcher,
        );
        this._widgets.unshift(widgetWrapper);
        this._nodePropertiesWrapper = widgetWrapper;
        this._createWidget(widgetWrapper);
    }

    _provisionWidgets(/* compareResult */) {
        // The node's attrs may have changed while this widget is being
        // reused for a same-typeKey node — re-derive the plan; the
        // renderer attachment re-applies the attr-driven DOM on its own
        // update (its wrapper maps ./attrs).
        this._renderingPlan = this._deriveRenderingPlan(this._context);
        const requiresFullInitialUpdate = new Set();
        // The scope component first: its update (building the node's
        // scope and marking the registration) runs before the child
        // container's, so a child's scope build sees this node's
        // settled map (parent-first, the G8 contract).
        this._provisionNodeProperties();
        // An unbuilt scope component must run its first update with
        // the initial-update semantics (its protocol dependencies
        // count as updated): nothing marks them on a plain document
        // insertion cycle, so without this the scope would never
        // build. After the build the identity checks in the
        // component's update decide further rebuilds.
        if (
            this._nodePropertiesWrapper !== null &&
            !this.nodePropertiesComponent.hasScope
        )
            requiresFullInitialUpdate.add(this._nodePropertiesWrapper);
        if (
            this._childNodesContainer === null &&
            this._renderingPlan.innerHtml === null
        ) {
            // Provision the child container once (leaf-ness transitions
            // require a rebuild — a parked FIXME of the viewer,
            // inherited unchanged).
            const widgets = [
                [
                    {},
                    [
                        ["./content", "collection"],
                        [
                            this.widgetBus.getExternalName("nodeSpec"),
                            "nodeSpec",
                        ],
                        [
                            this.widgetBus.getExternalName("markSpec"),
                            "markSpec",
                        ],
                        [
                            this.widgetBus.getExternalName(
                                "nodeSpecToTypeSpec",
                            ),
                            "nodeSpecToTypeSpec",
                        ],
                    ],
                    DocumentNodesMetaNodes,
                    this._zones,
                    this._defaultSchemaSpec,
                    new Set(), // rendererHandlers (the container's own)
                    this._renderingPlan.childrenContext, // context
                    // The child dispatchers' nearest scope up the
                    // chain (this node's scope component).
                    this.nodePropertiesComponent,
                    // Its registration id: this node's own
                    // nodeProperties@ id (the dispatcher's registration
                    // is keyed by the same document-node path).
                    `nodeProperties@${this.widgetBus.rootPath.toString()}`,
                ],
            ];
            this._initWidgets(widgets);
        }
        for (const wrapper of super._provisionWidgets())
            requiresFullInitialUpdate.add(wrapper);
        // A container created above (or present but not yet attached)
        // attaches the known renderers now.
        for (const handlerFn of this._attachments.handlers())
            this._attachChildContainer(handlerFn);
        return requiresFullInitialUpdate;
    }
}

// Meta node of a text document node: the mark descriptor pipeline lives
// in the renderer attachment; the meta node provides the dispatch
// context and invokes the renderer handlers.
class DocumentNodesMetaTextRun extends _DocumentNodesMetaDispatchedNode {
    constructor(
        widgetBus,
        zones,
        defaultSchemaSpec,
        context,
        parentNodeProperties = null,
    ) {
        super(widgetBus, zones);
        this._context = context;
        // Consume-only (umbrella plan): a text run builds no scope of
        // its own; the dispatcher answers consumers with the parent
        // element's scope. The arg is accepted for symmetry with the
        // element dispatch and future use; nothing reads it yet.
        this._parentNodeProperties = parentNodeProperties;
    }

    // The scope this text run delegates to (the parent element's scope
    // component). null for top-level text runs — the dispatcher's own
    // fallback (the root scope) answers there.
    get parentNodeProperties() {
        return this._parentNodeProperties;
    }

    get _metaInfo() {
        return {
            typeKey: "text",
            rootPath: this.widgetBus.rootPath,
            // Mirrors the former viewer text-run's default: no
            // pathOfTypes in context → empty chain.
            pathOfTypes: this._context.pathOfTypes ?? [],
            context: this._context,
            renderingPlan: null,
        };
    }
}

// The meta root: registered always-active (no zone, no activationTest) at
// the top controller of both layouts, over ./document. Owns the renderer
// handler store (attachRenderer/detachRenderer) and caches the last-seen
// model root state for the initial update of attachments created
// mid-cycle (a renderer attaching while the meta tree stands, e.g. on a
// mode switch).
export class DocumentNodesMeta extends _BaseContainerComponent {
    constructor(widgetBus, zones, defaultSchemaSpec, originTypeSpecPath) {
        // Threaded to DocumentNodesMetaNodes._createWrapper (the
        // per-node rootNodeProperties@ mapping) via the inherited
        // widgetBus.
        widgetBus.originTypeSpecPath = originTypeSpecPath;
        const documentNode = widgetBus.getEntry("."),
            pathOfTypes = [documentNode.get("typeKey").value],
            rendererHandlers = new Set(), // handlerFn
            context = {
                inInlineContext: false,
                // typeKey of the document root node (usually "doc"); the
                // base of every pathOfTypes. Assumed stable for the
                // lifetime of the document.
                pathOfTypes,
            },
            widgets = [
                [
                    {},
                    [],
                    DocumentNodesMetaDocument,
                    zones,
                    pathOfTypes,
                ],
                [
                    {},
                    [
                        ["content", "collection"],
                        [widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                        [widgetBus.getExternalName("markSpec"), "markSpec"],
                        [
                            widgetBus.getExternalName("nodeSpecToTypeSpec"),
                            "nodeSpecToTypeSpec",
                        ],
                    ],
                    DocumentNodesMetaNodes,
                    zones,
                    defaultSchemaSpec,
                    new Set(), // rendererHandlers (the container's own)
                    context,
                    // The top-level dispatchers' nearest settled
                    // effective map: the root scope's, read lazily (it
                    // registers after its first update, which runs
                    // later in the boot cycle than this construction).
                    // Direct id: the meta root itself has no
                    // "rootNodeProperties@" mapping (the dispatchers
                    // declare their own).
                    () =>
                        this.getEntry(
                            `nodeProperties@${originTypeSpecPath.toString()}`,
                        )?.nodeProperties?.getProperties() ?? null,
                    // The top-level dispatchers' parent id: the root
                    // registration's.
                    `nodeProperties@${originTypeSpecPath.toString()}`,
                ],
            ];
        super(widgetBus, zones, widgets);
        this._rendererHandlers = rendererHandlers;
    }

    // Cascade a handler through the existing tree: the document
    // container node first, then the top-level nodes.
    _attachCascade(handlerFn) {
        const [documentWrapper, nodesWrapper] = this._widgets;
        documentWrapper.widget?.attach(handlerFn);
        nodesWrapper.widget?.attach(handlerFn);
    }

    attachRenderer(handlerFn) {
        if (this._rendererHandlers.has(handlerFn))
            throw new Error(
                `VALUE ERROR renderer handler already attached in ${this}.`,
            );
        this._rendererHandlers.add(handlerFn);
        // At boot the tree doesn't exist yet (the widgets were just
        // constructed); initialUpdate cascades the stored handlers once
        // the tree stands. Mid-life (a mode switch) the cascade runs
        // here.
        this._attachCascade(handlerFn);
    }

    detachRenderer(handlerFn) {
        this._rendererHandlers.delete(handlerFn);
        const [documentWrapper, nodesWrapper] = this._widgets;
        nodesWrapper.widget?.detach(handlerFn);
        documentWrapper.widget?.detach(handlerFn);
    }

    // Containers receive the compare result (UPDATE_STRATEGY_COMPARE).
    // Cache the root state on the widgetBus (inherited by the whole
    // meta tree): attachments created mid-cycle get their initial
    // update from it. Any document change wakes the meta tree, so the
    // cache is current whenever a renderer attaches.
    initialUpdate(rootState) {
        this.widgetBus.rootState = rootState;
        super.initialUpdate(rootState);
        // Handlers registered before the tree existed (a viewer
        // constructed alongside the meta root) attach now that it
        // stands. Runs exactly once; later registrations cascade via
        // attachRenderer.
        for (const handlerFn of this._rendererHandlers)
            this._attachCascade(handlerFn);
    }

    update(compareResult) {
        this.widgetBus.rootState = compareResult.newState;
        super.update(compareResult);
    }
}
