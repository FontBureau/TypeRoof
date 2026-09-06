// DocumentNodesMeta — the always-active, DOM-free document-tree meta layer
// (Phase 3 of the walker/renderer separation,
// thoughts/plans/2026-09-06-1047-phase3-document-nodes-meta-attachment-interface.md).
//
// Design center: we always have meta and the nodeProperties; optionally we
// can attach DOM rendering, or future renderers. Renderers attach via
// attachRenderer(handlerFn): the handler is called per document node with
// meta-originating information and returns a widget description, which the
// meta tree initializes itself. No class in this module touches the DOM.
//
// This file is built in two landings:
//   Commit A (spike): the provisioning skeleton below — it walks the
//   document tree and keeps the renderer-handler store, but nothing
//   attaches yet and no per-node nodeProperties@ registrations exist.
//   Commit B: the handler cascade, per-node registrations and the viewer
//   attachment.

import {
    _BaseComponent,
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
} from "../../../basics/component.mjs";

// Per document node: node-identity-keyed lifecycle. Phase 3 Commit B adds
// typeKey dispatch (meta element vs. meta text-run), the per-node
// nodeProperties@<rootPath> registration and the renderer-handler cascade.
class DocumentNodesMetaNode extends _BaseComponent {
    update(/* changedMap */) {}
}

// Dynamic-map container over a node's "content" collection. Child setup
// mirrors the viewer's UIDocumentNodes (which this replaces in Commit B):
// the per-key widget gets the collection and the schema specs mapped.
class DocumentNodesMetaNodes extends _BaseDynamicMapContainerComponent {
    _createWrapper(rootPath) {
        const settings = {
                rootPath: rootPath,
                nodeKey: rootPath.parts.at(-1),
            },
            dependencyMappings = [
                [this.widgetBus.getExternalName("collection"), "collection"],
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
            ],
            Constructor = DocumentNodesMetaNode,
            childWidgetBus = Object.create(this._childrenWidgetBus); // inherit
        childWidgetBus.nodeKey = settings.nodeKey;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
        );
    }
}

// The meta root: registered always-active (no zone, no activationTest) at
// the top controller of both layouts, over ./document. Owns the renderer
// handler store (attach/detach) and caches the last-seen model root state
// for the initial update of attachments created mid-cycle (Commit B).
export class DocumentNodesMeta extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        const widgets = [
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
            ],
        ];
        super(widgetBus, zones, widgets);
        // Renderer handlers, keyed by function identity. The viewer adds
        // its handler in Commit B; until then the tree walks unattached.
        this._rendererHandlers = new Set();
        this._lastRootState = null;
    }

    attachRenderer(handlerFn) {
        if (this._rendererHandlers.has(handlerFn))
            throw new Error(
                `VALUE ERROR renderer handler already attached in ${this}.`,
            );
        this._rendererHandlers.add(handlerFn);
        // Commit B: cascade the handler through the existing tree and
        // create attachments.
    }

    detachRenderer(handlerFn) {
        this._rendererHandlers.delete(handlerFn);
        // Commit B: cascade and destroy the attachments this handler
        // created.
    }

    // Containers receive the compare result (UPDATE_STRATEGY_COMPARE).
    // Cache the root state: attachments created mid-cycle (a renderer
    // attaching while the meta tree stands, e.g. on a mode switch) get
    // their initial update from this in Commit B.
    initialUpdate(rootState) {
        this._lastRootState = rootState;
        super.initialUpdate(rootState);
    }
    update(compareResult) {
        this._lastRootState = compareResult.newState;
        super.update(compareResult);
    }
}
