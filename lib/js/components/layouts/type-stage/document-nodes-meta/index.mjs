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

import {
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
} from "../../../basics/component.mjs";
import { Path } from "../../../../metamodel.mjs";

import { resolveElementRenderingPlan } from "./derivations.mjs";

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
    constructor(widgetBus, zones, defaultSchemaSpec, context) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = context;
        this._currentTypeKey = null;
        this._rendererHandlers = new Set(); // handlerFn
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
            args = [this._zones, this._defaultSchemaSpec, this._context];
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

    // The 5a payload of this node's nodeProperties@ registration:
    // live delegation to the root registration's nodeProperties (the
    // registrations exist so consumers can subscribe per document-node
    // path — behavior-neutral today; 5b installs real per-node scopes).
    get nodeProperties() {
        const root = this.getEntry("rootNodeProperties@");
        return root === null ? null : root.nodeProperties;
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
    constructor(widgetBus, zones, defaultSchemaSpec, rendererHandlers, context) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        // handlerFn — the renderers attached to this container's
        // children. Stored on the widgetBus (which every meta-node
        // child inherits) so the map installed by an ancestor is
        // visible here.
        widgetBus.rendererHandlers = rendererHandlers;
        this._context = context;
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
    constructor(widgetBus, zones, defaultSchemaSpec, context) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = context;
        // Derived immediately (like the viewer's UIDocumentElement
        // constructor did): handlers may attach before the first
        // provisioning runs, and they receive the plan.
        this._renderingPlan = this._deriveRenderingPlan(this._context);
        this._childContainerAttached = new Set(); // handlerFn
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

    _provisionWidgets(/* compareResult */) {
        // The node's attrs may have changed while this widget is being
        // reused for a same-typeKey node — re-derive the plan; the
        // renderer attachment re-applies the attr-driven DOM on its own
        // update (its wrapper maps ./attrs).
        this._renderingPlan = this._deriveRenderingPlan(this._context);
        const requiresFullInitialUpdate = new Set();
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
    constructor(widgetBus, zones, defaultSchemaSpec, context) {
        super(widgetBus, zones);
        this._context = context;
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
