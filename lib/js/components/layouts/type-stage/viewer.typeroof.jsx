// The type-stage document viewer: DOM rendering attachments for the
// always-active, DOM-free DocumentNodesMeta tree
// (./document-nodes-meta/index.mjs; Phase 3 of the walker/renderer
// separation —
// thoughts/plans/2026-09-06-1047-phase3-document-nodes-meta-attachment-interface.md).
//
// The viewer owns the DOM; the meta tree doesn't know anything about
// it. UIDocumentViewer (mode-gated by its activationTest in the layout
// controller) attaches a handler to the meta root; per document node
// the meta tree calls the handler with metaInfo and initializes the
// returned widget description. The attachment widgets below create,
// insert, update and remove the DOM — insertion order is resolved
// viewer-side via the attachment registry.

import {
    _BaseComponent,
    _BaseContainerComponent,
} from "../../basics/component.mjs";
import { _AbstractListModel } from "../../../metamodel.mjs";
import { _BaseDropTarget } from "../../generic.mjs";
import {
    UIDocumentTypeSpecStyler,
    UIDocumentStyleStyler,
    UIDocumentUnknownStyleStyler,
} from "../../prosemirror/type-spec.typeroof.jsx";
import { getTypeSpecPropertiesIdMethod } from "../../prosemirror/integration.typeroof.jsx";
import { TypeStagePaneStyler } from "./pane-styler.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchemaSpec } from "../../prosemirror/default-schema";

import { applyHtmlAttrsBag } from "../../prosemirror/html-attrs.ts";
import { require } from "../../dependency-injection.mjs";

import {
    getRenderingDirectives,
    computeAttrDrivenDiff,
    resolveNextTypeSpecProperties,
    typeSpecStylerDependencyMappings,
    getStyleLinkPropertiesId,
    getWrapMarks,
    wrapResultsAreEqual,
} from "./document-nodes-meta/derivations.mjs";

class GenericUpdater extends _BaseComponent {
    constructor(widgetBus, updateHandlerFn) {
        super(widgetBus);
        this._updateHandlerFn = updateHandlerFn;
    }
    update(changedMap) {
        return this._updateHandlerFn(changedMap);
    }
}

export class UIDocumentElementTypeSpecDropTarget extends _BaseDropTarget {
    static BASE_CLASS = "ui_document_element_typespec";

    constructor(widgetBus, applicableTypes, element) {
        super(
            widgetBus,
            null /*effectLabel*/,
            null /*effectLabel*/,
            applicableTypes,
        );
        this._addEventListeners(element);
        this.element = element;
    }

    initTemplate() {
        /*pass*/
        return [];
    }

    _dropHandlerImplementation(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        return this._changeState(() => {
            const typeSpecLink = this.getEntry("typeSpecLink");
            typeSpecLink.value = event.dataTransfer.getData(type);
            // if anything needs to change immediately, here would be
            // a chance to invoke a callback. OR, maybe, a CoherenceFunction
        });
    }
}

// Renderer-side sibling resolution and DOM insertion (adopted from the
// viewer's former UIDocumentNodes._insertIntoSlot, expressed against
// the attachment registry instead of widget lookups). The meta tree is
// DOM-free; only this module knows where renderer nodes go.
//
// Assumptions (inherited):
//   - the attachments of the nodes before `key` are initialized and
//     registered by the time this runs (provisioning order),
//   - nodes are inserted once per attachment; re-insertion (reorder)
//     moves the node within the same parent.
function insertRendererNode(collection, key, node, parentNode, getNodeByKey) {
    const getNodeByIndex = (i) => {
        const siblingKey =
            collection instanceof _AbstractListModel
                ? `${i}`
                : collection.keyOfIndex(i);
        return getNodeByKey(siblingKey);
    };
    let keyIndex;
    if (collection instanceof _AbstractListModel) {
        const [index, message] = collection.keyToIndex(key);
        if (index === null) throw new Error(message);
        keyIndex = index;
    } else keyIndex = collection.indexOfKey(key);

    if (keyIndex < 0)
        throw new Error(
            `NOT FOUND ERROR don't know where to insert ` +
                `${key} as it was not found in collection (${keyIndex}).`,
        );
    if (keyIndex === 0) {
        for (let i = keyIndex + 1; i < collection.size; i++) {
            const siblingNode = getNodeByIndex(i);
            if (
                siblingNode &&
                siblingNode !== node &&
                siblingNode.parentElement === parentNode
            ) {
                parentNode.insertBefore(node, siblingNode);
                return;
            }
        }
    } else {
        for (let i = keyIndex - 1; i < collection.size; i++) {
            const siblingNode = getNodeByIndex(i);
            if (
                siblingNode &&
                siblingNode !== node &&
                siblingNode.parentElement === parentNode
            ) {
                // insertAfter => if there is no siblingNode.nextSibling
                // it behaves like append
                parentNode.insertBefore(node, siblingNode.nextSibling);
                return;
            }
        }
    }
    // No appropriate sibling that is in the document was found; there
    // may also be local elements before (ui controls/meta), so append
    // seems the right choice.
    parentNode.append(node);
}

// Viewer-side bookkeeping of the live attachments:
// documentNodeRootPath.toString() → renderer node. Attachments register
// on creation and unregister on destroy; sibling resolution and
// parent-element resolution consult the registry, so the meta tree
// never sees a DOM node. NOTE: parent resolution looks the parent
// document node up by its *node* path — the same path children
// register under (…/content/N, not the …/content collection path).
class AttachmentRegistry {
    // getEntry resolves absolute model paths against the current state.
    constructor(getEntry) {
        this._getEntry = getEntry;
        this._nodes = new Map();
    }

    // The collection path (…/content) holds the siblings; their
    // attachments register under their node path (…/content/<key>).
    _getSiblingNodeResolver(collectionPath) {
        return (key) =>
            this._nodes.get(collectionPath.append(key).toString()) ?? null;
    }

    // The element a node's attachment inserts into: the attachment
    // node of the parent document node. The collection path
    // (…/content) never has a registration — the parent node path is
    // its parent (…).
    getParentNode(collectionPath) {
        return this._nodes.get(collectionPath.parent.toString()) ?? null;
    }

    // Insert node into parentNode at the position the collection
    // order of its document node implies.
    insert(rootPath, node, parentNode) {
        const parentPath = rootPath.parent,
            key = rootPath.parts.at(-1),
            collection = this._getEntry(parentPath);
        insertRendererNode(
            collection,
            key,
            node,
            parentNode,
            this._getSiblingNodeResolver(parentPath),
        );
        this._nodes.set(rootPath.toString(), node);
    }

    // Re-insert the node of an existing attachment (reorder
    // notification from the meta tree).
    reinsert(rootPath, parentNode) {
        const node = this._nodes.get(rootPath.toString());
        if (node === undefined) return;
        const parentPath = rootPath.parent,
            key = rootPath.parts.at(-1),
            collection = this._getEntry(parentPath);
        insertRendererNode(
            collection,
            key,
            node,
            parentNode,
            this._getSiblingNodeResolver(parentPath),
        );
    }

    replace(rootPath, node) {
        this._nodes.set(rootPath.toString(), node);
    }

    delete(rootPath) {
        this._nodes.delete(rootPath.toString());
    }

    getNode(rootPath) {
        return this._nodes.get(rootPath.toString()) ?? null;
    }
}

// Shared attachment base: DOM node lifecycle + attachment registry
// bookkeeping. The widget wrapper that owns this attachment lives in
// the meta tree; updates arrive through it (containers receive the
// compare result).
class _UIDocumentAttachment extends _BaseContainerComponent {
    constructor(widgetBus, _zones, metaInfo, attachmentRegistry) {
        const zones = new Map(_zones);
        super(widgetBus, zones);
        this._attachmentRegistry = attachmentRegistry;
        this._documentNodePath = metaInfo.rootPath;
    }

    destroy() {
        this._attachmentRegistry.delete(this._documentNodePath);
        if (this.node?.parentElement)
            this.node.parentElement.removeChild(this.node);
        super.destroy();
    }
}

// The DOM rendering attachment of a non-text document node. Applies
// the meta-derived rendering plan (tag, attribute bag, verbatim html,
// data-node-type) and provisions the per-node typeSpec styler. Its
// children are rendered by their own attachments (provisioned by the
// meta tree), not by this widget.
export class UIDocumentElement extends _UIDocumentAttachment {
    constructor(
        widgetBus,
        zones,
        metaInfo,
        parentRendererNode,
        attachmentRegistry,
        defaultSchemaSpec,
        originTypeSpecPath,
    ) {
        super(widgetBus, zones, metaInfo, attachmentRegistry);
        const plan = metaInfo.renderingPlan;
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = metaInfo.context;
        this._hasTypeSpecStyling = plan.hasTypeSpecStyling;
        this._pathOfTypes = plan.pathOfTypes;
        this._originTypeSpecPath = originTypeSpecPath;
        this._typeSpecStylerWrapper = null;

        // The attr-driven DOM state as applied below (the htmlAttrs bag
        // and the verbatim html of reproducing atoms);
        // _applyAttrDrivenDOMUpdates compares against these when the
        // node's attrs change while this widget is being reused.
        this._appliedAttributes = plan.attributes;
        this._appliedInnerHtml = plan.innerHtml;
        this._treatAsLeaf = plan.innerHtml !== null;

        const localContainer = widgetBus.domTool.createElement(plan.tag);

        if (plan.attributes) applyHtmlAttrsBag(localContainer, plan.attributes);

        if (plan.additionalAttrs) {
            for (const [name, value] of Object.entries(plan.additionalAttrs))
                localContainer.setAttribute(name, value);
        }

        if (plan.innerHtml)
            localContainer.append(
                widgetBus.domTool.createFragmentFromHTML(plan.innerHtml),
            );

        this._zones.set("local", localContainer);

        this.node = localContainer;
        this._attachmentRegistry.insert(
            this._documentNodePath,
            this.node,
            parentRendererNode,
        );
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    _createTypeSpecStylerWrapper(
        typeSpecProperties,
        nextTypeSpecProperties = null,
        typeSpecPath = null,
    ) {
        const settings = {},
            dependencyMappings = typeSpecStylerDependencyMappings(
                typeSpecProperties,
                `nodeProperties@${this._documentNodePath.toString()}`,
                nextTypeSpecProperties,
                typeSpecPath,
            );
        const Constructor = UIDocumentTypeSpecStyler,
            args = [this.node, this.node];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    // Compute the "reproducing" rendering directives (see
    // getRenderingAttrDirectives) from the node's *current* attrs.
    // The constructor uses this for the initial DOM;
    // _applyAttrDrivenDOMUpdates uses it to re-apply attrs that changed
    // while this widget is reused for a same-typeKey node (e.g. a
    // replaced document's node at the same list position — the meta
    // node rebuilds only on typeKey change).
    _getRenderingDirectives() {
        return getRenderingDirectives(
            this.getEntry("."),
            this.getEntry("nodeSpec"),
            this._defaultSchemaSpec,
            this._context,
        );
    }

    // Re-apply the attr-driven parts of the DOM (the htmlAttrs bag and
    // the verbatim html of reproducing atoms) when the node's attrs
    // changed underneath this reused widget — the constructor built
    // that DOM only once. The tag (htmlTag/spec tag) is not
    // re-resolved: element identity is managed by the meta tree's
    // per-node lifecycle and the typeSpec styler; FIXME: a tag
    // change requires a rebuild and is currently only warned about.
    _applyAttrDrivenDOMUpdates() {
        const diff = computeAttrDrivenDiff(
                {
                    attributes: this._appliedAttributes,
                    innerHtml: this._appliedInnerHtml,
                },
                this._getRenderingDirectives(),
            ),
            { htmlTag, attributes, innerHtml } = diff;
        if (htmlTag !== null && htmlTag !== this.node.tagName.toLowerCase())
            console.warn(
                `${this} htmlTag changed from ` +
                    `"${this.node.tagName.toLowerCase()}" to "${htmlTag}"; ` +
                    "re-creating the element is not implemented, keeping the stale tag.",
            );
        if (diff.attributesChanged) {
            for (const name of diff.removedAttrNames)
                this.node.removeAttribute(name);
            if (attributes) applyHtmlAttrsBag(this.node, attributes);
            this._appliedAttributes = attributes;
        }
        if (diff.innerHtmlChanged) {
            if (this._treatAsLeaf && innerHtml !== null)
                this.node.replaceChildren(
                    this._domTool.createFragmentFromHTML(innerHtml),
                );
            // Changing from or to a verbatim-html (leaf) node changes
            // the widget structure (children widgets vs. none), which
            // requires a rebuild.
            // FIXME: not implemented, keeping the stale content.
            else
                console.warn(
                    `${this} the "html" attr changed leaf-ness; ` +
                        "rebuilding the widget is not implemented, keeping the stale content.",
                );
            this._appliedInnerHtml = innerHtml;
        }
    }

    _provisionWidgets(/* compareResult */) {
        // The node's own attrs may have changed while this widget is
        // being reused for a same-typeKey node — re-apply the
        // constructor-baked, attr-driven DOM before provisioning.
        this._applyAttrDrivenDOMUpdates();
        const requiresFullInitialUpdate = new Set();
        if (this._hasTypeSpecStyling) {
            const wrapper = this._provisionTypeSpecStyler();
            if (wrapper) requiresFullInitialUpdate.add(wrapper);
        }
        for (const wrapper of super._provisionWidgets())
            requiresFullInitialUpdate.add(wrapper);
        return requiresFullInitialUpdate;
    }

    // A resolved spec with "noStyler" renders inherit-only: the
    // node never provisions a styler, though the resolved spec still
    // speaks for its marks and the margins of a sibling nextProperties@.
    // _hasTypeSpecStyling (a spec is resolvable at all) stays true for
    // silent nodes — the gate applies only to provisioning.
    _provisionTypeSpecStyler() {
        const typeSpecPath = this._getTypeSpecPropertiesId(
                this._pathOfTypes,
                true /* asPath */,
            ),
            typeSpecProperties = this._getTypeSpecPropertiesId(
                this._pathOfTypes,
            ),
            // A resolved spec with "noStyler" renders inherit-only:
            // no styler is provisioned, though the resolved spec still
            // speaks for its marks and a sibling's nextProperties@.
            // (_provisionTypeSpecStyler is only reached when
            // _hasTypeSpecStyling holds, so the path resolves here.)
            silent = this.getEntry(typeSpecPath).get("noStyler").value;
        // Compute the next sibling's typeSpecProperties for
        // resolving lineHeightAfter/emAfter margin units.
        // TODO (parity edge case): this uses the sibling's original
        // typeKey; when the sibling's type is unknown, ProseMirror
        // resolves no per-node typeSpec for it. Fixing this requires
        // resolving the sibling's effective type (cf. the
        // determineUnknownType classification) — parked for now.
        const nextTypeSpecProperties = resolveNextTypeSpecProperties(
            (pathOfTypes, asPath) =>
                this._getTypeSpecPropertiesId(pathOfTypes, asPath),
            this.getEntry(this.widgetBus.rootPath.parent),
            this.widgetBus.rootPath.parts.at(-1),
            this._pathOfTypes,
        );
        const oldId =
            this._typeSpecStylerWrapper !== null
                ? this._widgets.indexOf(this._typeSpecStylerWrapper)
                : -1;
        if (oldId === -1) {
            // inital (or after a silent state)
            if (silent) return null; // no styler provisioned
            this._typeSpecStylerWrapper = this._createTypeSpecStylerWrapper(
                typeSpecProperties,
                nextTypeSpecProperties,
                typeSpecPath,
            );
            this._widgets.splice(0, 0, this._typeSpecStylerWrapper);
            return this._typeSpecStylerWrapper;
        } else if (silent) {
            // styled→silent: destroy the existing styler (clears the
            // inline styles it set) and provision nothing.
            const oldWrapper = this._widgets[oldId];
            this._widgets.splice(oldId, 1);
            oldWrapper.destroy();
            this._typeSpecStylerWrapper = null;
            return null;
        } else {
            const oldWrapper = this._widgets[oldId];
            if (
                oldWrapper.dependencyReverseMapping.get("properties@") !==
                typeSpecProperties
            ) {
                const newWrapper = this._createTypeSpecStylerWrapper(
                    typeSpecProperties,
                    nextTypeSpecProperties,
                    typeSpecPath,
                );
                this._widgets.splice(oldId, 1, newWrapper);
                oldWrapper.destroy();
                this._typeSpecStylerWrapper = newWrapper;
                return this._typeSpecStylerWrapper;
            }
        }
        return null;
    }
}

// I'm unsure about this, as the parent node can (and probably should from
// time to time) call normalize() and then this.node may become disconnected.
// I.e. this part of the model may be better handled directly in UIDocumentTextRuns
// or UIDocumentSegment than with it's own component.
//
// maybe only to receive updates?
//     styleLinkProperties@
//
// The DOM rendering attachment of a text document node: the text node
// itself plus the mark wrapper elements and their style-link stylers.
export class UIDocumentTextRun extends _UIDocumentAttachment {
    constructor(
        widgetBus,
        zones,
        metaInfo,
        parentRendererNode,
        attachmentRegistry,
        defaultSchemaSpec,
        originTypeSpecPath,
    ) {
        super(widgetBus, zones, metaInfo, attachmentRegistry);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = metaInfo.context;
        this._originTypeSpecPath = originTypeSpecPath;
        this.node = this._domTool.createTextNode("(initializing)");
        this._attachmentRegistry.insert(
            this._documentNodePath,
            this.node,
            parentRendererNode,
        );
        this._markWrappers = [];
        const widgets = [
            [{}, ["text"], GenericUpdater, this._updateNode.bind(this)],
        ];
        this._initWidgets(widgets);
        this._initalWidgetsLength = this._widgets.length;
    }

    _updateNode(changedMap) {
        if (changedMap.has("text")) {
            const { Node } = this._domTool.window,
                text = changedMap.get("text").value;
            if (this.node.nodeType === Node.TEXT_NODE) this.node.data = text;
            else {
                // drill down
                let deepest = this.node;
                while (deepest.firstElementChild)
                    deepest = deepest.firstElementChild;
                deepest.textContent = text;
            }
        }
    }

    getTextNode() {
        const { Node } = this._domTool.window;
        if (this.node.nodeType === Node.TEXT_NODE) return this.node;
        else {
            // drill down
            let deepest = this.node;
            while (deepest.firstElementChild)
                deepest = deepest.firstElementChild;
            // CAUTION it could be a comment etc., but so far we
            // just assert there to be one node and that's the TEXT_NODE
            return deepest.firstChild;
        }
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    _swapNode(newNode) {
        if (this.node.parentElement)
            this.node.parentElement.replaceChild(newNode, this.node);
        this.node = newNode;
        // The registry tracks the node other attachments resolve
        // their siblings against.
        this._attachmentRegistry.replace(this._documentNodePath, newNode);
    }

    _createStylerWrapper(domElement, styleLinkProperties) {
        // node to element
        const settings = {},
            dependencyMappings =
                styleLinkProperties === null
                    ? []
                    : [
                          [styleLinkProperties, "properties@"],
                          ["/font", "rootFont"],
                      ],
            Constructor =
                styleLinkProperties === null
                    ? UIDocumentUnknownStyleStyler
                    : UIDocumentStyleStyler,
            args = [domElement];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _getStyleLinkPropertiesId(
        typeSpecPropertiesPath,
        styleLinkType,
        styleLink,
    ) {
        return getStyleLinkPropertiesId(
            this.widgetBus,
            typeSpecPropertiesPath,
            styleLinkType,
            styleLink,
        );
    }

    _getWrapMarks(typeSpecPropertiesPath) {
        return getWrapMarks(
            this.getEntry("."),
            this.getEntry("markSpec"),
            this._defaultSchemaSpec,
            this._context,
            this.widgetBus,
            typeSpecPropertiesPath,
        );
    }

    _wrapResultsAreEqual(wrapResultsA, wrapResultsB) {
        return wrapResultsAreEqual(wrapResultsA, wrapResultsB);
    }

    static _MARK_ELEMENT = Symbol("_MARK_ELEMENT");
    _createWrapperDOM(wrapResults) {
        let current = null;
        const _MARK_ELEMENT = this.constructor._MARK_ELEMENT;
        for (const wrapper of wrapResults) {
            const { tag, styleLinkName, markType, htmlAttributesBag } = wrapper,
                markElement = this._domTool.createElement(tag);
            if (htmlAttributesBag)
                applyHtmlAttrsBag(markElement, htmlAttributesBag);
            if (styleLinkName)
                markElement.setAttribute("data-style-name", styleLinkName);
            if (markType) markElement.setAttribute("data-mark-type", markType);
            if (current) markElement.append(current);
            current = markElement;
            // using a symbol as key, so compare will ignore it by default;
            wrapper[_MARK_ELEMENT] = markElement;
        }
    }

    _createStylerWidgets(typeSpecPropertiesPath, wrapResults) {
        const stylerWidgets = [],
            _MARK_ELEMENT = this.constructor._MARK_ELEMENT;
        // ProseMirror parity: no typeSpec on the enclosing node,
        // no style-link styler for its marks.
        if (this._context.hasTypeSpecStyling === false) return stylerWidgets;
        for (const wrapper of wrapResults) {
            const { styleLinkName, styleLinkType } = wrapper,
                domElement = wrapper[_MARK_ELEMENT];
            // if not skipped we will apply UIDocumentUnknownStyleStyler,
            // which may be wrong as well, e.g. when tags/elements are
            // purely semantic HTML that we don't want to style.
            if (!styleLinkName) continue;
            const styleLinkPropertiesId = this._getStyleLinkPropertiesId(
                    typeSpecPropertiesPath,
                    styleLinkType,
                    styleLinkName,
                ),
                widgetWrapper = this._createStylerWrapper(
                    domElement,
                    styleLinkPropertiesId,
                );
            stylerWidgets.push(widgetWrapper);
        }
        return stylerWidgets;
    }

    _provisionWidgets(...args /* compareResult */) {
        const requiresFullInitialUpdate = new Set(),
            // context.pathOfTypes contains the typeKeys from the document
            // root down to and including the parent element, i.e. without
            // the own "text" type (equivalent to the old .slice(0, -1)).
            pathOfTypes = this._context.pathOfTypes ?? [],
            typeSpecPropertiesPath = this._getTypeSpecPropertiesId(
                pathOfTypes,
                true /*asPath*/,
            ),
            wrapResults = this._getWrapMarks(typeSpecPropertiesPath);
        if (!this._wrapResultsAreEqual(this._markWrappers, wrapResults)) {
            const textNode = this.getTextNode(),
                newWidgetWrappers = [];
            if (wrapResults.length === 0) this._swapNode(textNode);
            else {
                this._createWrapperDOM(wrapResults);
                newWidgetWrappers.push(
                    ...this._createStylerWidgets(
                        typeSpecPropertiesPath,
                        wrapResults,
                    ),
                );
                this._swapNode(
                    wrapResults.at(-1)[this.constructor._MARK_ELEMENT],
                );
                wrapResults[0][this.constructor._MARK_ELEMENT].append(textNode);
                this._markWrappers = wrapResults;
            }
            const deleted = this._widgets.splice(
                this._initalWidgetsLength,
                Infinity,
                ...newWidgetWrappers,
            );
            for (const widgetWrapper of deleted)
                this._destroyWidget(widgetWrapper);
            for (const widgetWrapper of newWidgetWrappers)
                requiresFullInitialUpdate.add(widgetWrapper);
        }
        for (const widgetWrapper of super._provisionWidgets(...args))
            requiresFullInitialUpdate.add(widgetWrapper);
        return requiresFullInitialUpdate;
    }
}

// The mode-gated viewer root: owns the <article> and attaches its
// handler to the always-active DocumentNodesMeta tree (looked up by
// the id the layout controller configured). All DOM below the article
// is created by the attachments the handler returns; when the viewer
// is destroyed (mode switch), detach removes exactly the attachments
// this handler created.
export class UIDocumentViewer extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        originTypeSpecPath,
        documentNodesMetaId,
        baseClass = "typeroof-document",
    ) {
        const documentContainer = widgetBus.domTool.createElement("article", {
            class: baseClass,
        });
        widgetBus.insertElement(documentContainer);
        super(widgetBus, zones);
        this.nodesElement = documentContainer;
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentNodesMetaId = documentNodesMetaId;
        this._attachmentRegistry = new AttachmentRegistry(
            this.widgetBus.getEntry.bind(this.widgetBus),
        );
        const widgets = [
            [
                {},
                [
                    [
                        `typeSpecProperties@${originTypeSpecPath.toString()}`,
                        "properties@",
                    ],
                    [
                        `nodeProperties@${originTypeSpecPath.toString()}`,
                        "nodeProperties@",
                    ],
                ],
                TypeStagePaneStyler,
                documentContainer,
            ],
        ];
        this._initWidgets(widgets);
        this.__attachHandler = this._attachHandler.bind(this);
        const meta = this.widgetBus.getWidgetById(documentNodesMetaId, null);
        meta?.attachRenderer(this.__attachHandler);
    }

    // The renderer handler, called per document node by the meta tree.
    // Returns the widget description of the node's DOM attachment;
    // the meta node initializes it (in its own context) and manages
    // its lifecycle. On reposition notifications the existing
    // attachment is re-inserted and null is returned (nothing to
    // create). The document container node itself renders nothing —
    // the article is its container.
    _attachHandler(metaInfo) {
        if (metaInfo.reposition) {
            this._attachmentRegistry.reinsert(
                metaInfo.rootPath,
                this._resolveParentRendererNode(metaInfo.rootPath),
            );
            return null;
        }
        // The document container node itself renders nothing — the
        // article is its container.
        if (metaInfo.renderingPlan === null && metaInfo.typeKey !== "text")
            return null;
        const parentRendererNode = this._resolveParentRendererNode(
            metaInfo.rootPath,
        );
        const Constructor =
            metaInfo.typeKey === "text" ? UIDocumentTextRun : UIDocumentElement;
        return [
            {},
            metaInfo.typeKey === "text" ? ["text"] : [["./attrs", "attrs"]],
            Constructor,
            // Injected by the meta node that initializes this
            // description: its own zones.
            require("raw:zones"),
            metaInfo,
            parentRendererNode,
            this._attachmentRegistry,
            proseMirrorDefaultSchemaSpec,
            this._originTypeSpecPath,
        ];
    }

    // The parent element a node's attachment inserts into: the
    // attachment node of the parent document node (this handler
    // renders every document node, so it is always registered);
    // the top level attaches to the article. Parents attach before
    // their children (the meta tree cascades top-down), so the
    // registry lookup resolves by the time a child attaches.
    _resolveParentRendererNode(rootPath) {
        return (
            this._attachmentRegistry.getParentNode(rootPath.parent) ??
            this.nodesElement
        );
    }

    destroy() {
        const meta = this.widgetBus.getWidgetById(
            this._documentNodesMetaId,
            null,
        );
        meta?.detachRenderer(this.__attachHandler);
        this.__attachHandler = null;
        super.destroy();
    }
}
