import {
    _BaseComponent,
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
} from "../../basics/component.mjs";
import { Path, _AbstractListModel } from "../../../metamodel.mjs";
import { _BaseDropTarget } from "../../generic.mjs";
import {
    UIDocumentTypeSpecStyler,
    UIDocumentStyleStyler,
    UIDocumentUnknownStyleStyler,
} from "../../prosemirror/type-spec.typeroof.jsx";
import { getTypeSpecPropertiesIdMethod } from "../../prosemirror/integration.typeroof.jsx";
import { TypeStagePaneStyler } from "./pane-styler.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchemaSpec } from "../../prosemirror/default-schema";

import {
    applyHtmlAttrsBag,
    htmlAttrsBagToSpec,
} from "../../prosemirror/html-attrs.ts";

import {
    resolveElementRenderingPlan,
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

// Pure tree/spec derivations moved to ./document-nodes-meta.mjs
// (Phase 5a delegation landing): getMMChildIsBlock,
// specChildrenInInlineContext, getRenderingAttrDirectives,
// determineUnknownType, getRenderingDirectives,
// resolveElementRenderingPlan, computeAttrDrivenDiff,
// resolveNextTypeSpecProperties, typeSpecStylerDependencyMappings,
// getStyleLinkPropertiesId, getWrapMarks, wrapResultsAreEqual.

// This should inject it's own e.g. <p> element.
// It's interesting, the "nodesContainer" might have to change when the
// typeSpec changes! Thus, creating nodesContainer in the constructor might
// be not ideal. Definitely must look at the 'node'/'typeSpec@' in update.
//
// We could just copy all the content nodes when we change the nodesContainer,
// a child, thus, should not save the parent container ever.
// Interesting how/if insertElement plays along.
export class UIDocumentElement extends _BaseContainerComponent {
    constructor(
        widgetBus,
        _zones,
        defaultSchemaSpec,
        originTypeSpecPath,
        documentRootPath,
        context = { inInlineContext: false },
    ) {
        const zones = new Map(_zones);
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = context;
        // The rendering plan is derived in the meta layer (pure, no
        // DOM); this constructor only applies it and wires children.
        const plan = resolveElementRenderingPlan(
                this.getEntry("."),
                this.getEntry("nodeSpec"),
                this._defaultSchemaSpec,
                this._context,
            ),
            {
                hasTypeSpecStyling,
                tag,
                attributes,
                additionalAttrs,
                innerHtml,
                childrenContext,
            } = plan;
        this._hasTypeSpecStyling = hasTypeSpecStyling;
        this._pathOfTypes = plan.pathOfTypes;

        // The attr-driven DOM state as applied below (the htmlAttrs bag
        // and the verbatim html of reproducing atoms);
        // _applyAttrDrivenDOMUpdates compares against these when the
        // node's attrs change while this widget is being reused.
        this._appliedAttributes = attributes;
        this._appliedInnerHtml = innerHtml;

        this._treatAsLeaf = innerHtml !== null;
        const localContainer = widgetBus.domTool.createElement(tag);

        if (attributes) applyHtmlAttrsBag(localContainer, attributes);

        if (additionalAttrs) {
            for (const [name, value] of Object.entries(additionalAttrs))
                localContainer.setAttribute(name, value);
        }

        if (innerHtml)
            localContainer.append(
                widgetBus.domTool.createFragmentFromHTML(innerHtml),
            );

        zones.set("local", localContainer);

        this.node = localContainer;
        this.nodesElement = localContainer;
        this.widgetBus.insertDocumentNode(this.node);

        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._typeSpecStylerWrapper = null;

        if (!this._treatAsLeaf) {
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
                    UIDocumentNodes,
                    this._zones,
                    this._defaultSchemaSpec,
                    this.nodesElement,
                    originTypeSpecPath,
                    documentRootPath,
                    childrenContext, // context
                ],
            ];
            this._initWidgets(widgets);
        }
    }

    destroy() {
        if (this.node?.parentElement)
            this.node.parentElement.removeChild(this.node);
        super.destroy();
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
                this._originTypeSpecPath,
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
    // _getRenderingAttrDirectives) from the node's *current* attrs.
    // The constructor uses this for the initial DOM;
    // _applyAttrDrivenDOMUpdates uses it to re-apply attrs that changed
    // while this widget is reused for a same-typeKey node (e.g. a
    // replaced document's node at the same list position —
    // UIDocumentNode rebuilds only on typeKey change).
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
    // re-resolved: element identity is managed by the parent's slot
    // insertion (UIDocumentNodes) and the typeSpec styler; FIXME: a tag
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
        // _determineUnknownType classification) — parked for now.
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
export class UIDocumentTextRun extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        defaultSchemaSpec,
        originTypeSpecPath,
        documentRootPath,
        context,
    ) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = context;
        this.node = this._domTool.createTextNode("(initializing)");
        this.widgetBus.insertDocumentNode(this.node);
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._markWrappers = [];
        const widgets = [
            [{}, ["text"], GenericUpdater, this._updateNode.bind(this)],
        ];
        this._initWidgets(widgets);
        this._initalWidgetsLength = this._widgets.length;
    }

    destroy() {
        if (this.node?.parentElement)
            this.node.parentElement.removeChild(this.node);
        super.destroy();
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

export class UIDocumentNode extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        defaultSchemaSpec,
        originTypeSpecPath,
        documentRootPath,
        context,
    ) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._context = context;
        this._currentTypeKey = null;
    }

    _createWrapperForType(typeKey) {
        const settings = {
                rootPath: Path.fromParts("."),
                id: "contentWidget",
            },
            moreArgs = [];
        let Constructor, dependencyMappings;
        if (typeKey === "text") {
            dependencyMappings = [
                "text",
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
            ];
            Constructor = UIDocumentTextRun;
        } else {
            dependencyMappings = [
                ["./content", "nodes"],
                // attrs drive the constructor-baked DOM (tag, htmlAttrs
                // bag, verbatim html of reproducing atoms; see
                // UIDocumentElement._applyAttrDrivenDOMUpdates); the
                // mapping also makes the update-relevance filter wake
                // this widget up when only attrs changed.
                ["./attrs", "attrs"],
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
            ];
            Constructor = UIDocumentElement;
        }
        moreArgs.push(this._context);

        const args = [
                this._zones,
                this._defaultSchemaSpec,
                this._originTypeSpecPath,
                this._documentRootPath,
                ...moreArgs,
            ],
            childWidgetBus = this._childrenWidgetBus;
        return this._initWrapper(
            childWidgetBus,
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
        return super._provisionWidgets();
    }
}

// It's interesting on the one hand, each segment requires its own
// control, e.g. to change the typeSpecLink, on the other hand,
// it requires the data to render properly, and that is very depending
// on the settings.
export class UIDocumentNodes extends _BaseDynamicMapContainerComponent {
    constructor(
        widgetBus,
        zones,
        defaultSchemaSpec,
        nodesElement,
        originTypeSpecPath,
        documentRootPath,
        context,
    ) {
        super(widgetBus, zones);
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._nodesElement = nodesElement;
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._context = context;

        const insertNodeIntoSlot = this._insertNodeIntoSlot.bind(this);
        this._childrenWidgetBus.insertDocumentNode = function (node) {
            insertNodeIntoSlot(this.nodeKey, node);
        };
    }

    /**
     * Assumptions
     *   - after initialization each nodeWidget, has a nodeWidget.node
     *   - each widget,in order before this, is completely initialized.
     *     by the time this method is called
     *   - the widget calling this is not yet completely intialized:
     *          this._keyToWidget.get(nodeKey).widget === null
     *
     * This would break if a node would call _insertNodeIntoSlot
     * multiple times (we don't do this yet). We could however
     * in that case change the interface to a beforeWidget.nodes = []
     * then insert after beforeWidget.nodes.at(-1)
     */
    _insertIntoSlot(collection, nodeKey, node) {
        const getNodeByIndex = (i) => {
            const key =
                    collection instanceof _AbstractListModel
                        ? `${i}`
                        : collection.keyOfIndex(i),
                nodeWidgetWrapper = this._keyToWidget.get(key);
            return nodeWidgetWrapper.widget.getWidgetWrapperById(
                "contentWidget",
                null,
            )?.widget?.node;
        };
        let keyIndex;
        if (collection instanceof _AbstractListModel) {
            const [index, message] = collection.keyToIndex(nodeKey);
            if (index === null) throw new Error(message);
            keyIndex = index;
        } else keyIndex = collection.indexOfKey(nodeKey);

        if (keyIndex < 0)
            throw new Error(
                `NOT FOUND ERROR don't know where to insert ` +
                    `${nodeKey} as it was not found in collection (${keyIndex}).`,
            );
        if (keyIndex === 0) {
            for (let i = keyIndex + 1; i < collection.size; i++) {
                const siblingNode = getNodeByIndex(i);
                if (
                    siblingNode &&
                    siblingNode.parentElement &&
                    siblingNode.parentElement === this._nodesElement
                ) {
                    siblingNode.parentElement.insertBefore(node, siblingNode);
                    return;
                }
            }
        } else {
            for (let i = keyIndex - 1; i < collection.size; i++) {
                const siblingNode = getNodeByIndex(i);
                if (
                    siblingNode &&
                    siblingNode.parentElement &&
                    siblingNode.parentElement === this._nodesElement
                ) {
                    // insertAfter => if there is no siblingNode.nextSibling it behaves like append
                    siblingNode.parentElement.insertBefore(
                        node,
                        siblingNode.nextSibling,
                    );
                    return;
                }
            }
        }
        // no appropriate sibling that is in in the document was found
        // we have also local elements before (ui controls/meta)
        // so append seems the right choice.
        this._nodesElement.append(node);
    }

    /**
     * Via this mechanism in place, we completely bypass the element management
     * of ComponentWrapper, which would be used via insertElement and would
     * make reinsert work, but also removal on destroy...
     * Hence, reordering and removal must be managed here as well!
     *      - we override _destroyWidget
     *      - we implement the optional _reorderChildren
     *
     * This doesn't keep a direct reference to the inserted nodes, that
     * way the widgets can themselves replace nodes.
     */
    _insertNodeIntoSlot(nodeKey, node) {
        const collection = this.getEntry("collection");
        this._insertIntoSlot(collection, nodeKey, node);
    }

    _reorderChildren(reorderReasons, reorderStartIndex) {
        if (!reorderReasons.has("changed")) return;
        const collection = this.getEntry("collection"),
            keys = Array.from(collection.keys()).slice(reorderStartIndex);
        for (const key of keys) {
            const nodeWidget = this._keyToWidget.get(key).widget,
                widgetWrapper = nodeWidget.getWidgetWrapperById(
                    "contentWidget",
                    null,
                ),
                node = widgetWrapper?.widget?.node;
            if (!node)
                // not initialized yet
                continue;
            this._insertIntoSlot(collection, key, node);
        }
    }

    _destroyWidget(widgetWrapper) {
        const node = widgetWrapper.widget.getWidgetById("contentWidget").node;
        this._nodesElement.removeChild(node);
        super._destroyWidget(widgetWrapper);
    }

    _createWrapper(rootPath) {
        const key = rootPath.parts.at(-1),
            settings = {
                rootPath: rootPath,
                nodeKey: key,
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
            Constructor = UIDocumentNode,
            args = [
                this._zones,
                this._defaultSchemaSpec,
                this._originTypeSpecPath,
                this._documentRootPath,
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
}

export class UIDocumentViewer extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        originTypeSpecPath,
        baseClass = "typeroof-document",
    ) {
        const documentContainer = widgetBus.domTool.createElement("article", {
            class: baseClass,
        });
        widgetBus.insertElement(documentContainer);
        super(widgetBus, zones);
        this.nodesElement = documentContainer;
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
            [
                {},
                [
                    ["content", "collection"],
                    [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                    [this.widgetBus.getExternalName("markSpec"), "markSpec"],
                    [
                        this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                        "nodeSpecToTypeSpec",
                    ],
                ],
                UIDocumentNodes,
                this._zones,
                proseMirrorDefaultSchemaSpec,
                this.nodesElement,
                originTypeSpecPath,
                this.widgetBus.rootPath, // documentRootPath
                {
                    inInlineContext: false,
                    // typeKey of the document root node (usually "doc");
                    // the base of every pathOfTypes (see UIDocumentElement).
                    // Assumed stable for the lifetime of the document,
                    // a change of it does not rebuild this widget.
                    pathOfTypes: [this.getEntry(".").get("typeKey").value],
                }, // context
            ],
        ];
        this._initWidgets(widgets);
    }
}
