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
    UIDocumentUnkownStyleStyler,
    getEffectiveStyleLinks,
} from "../../prosemirror/type-spec.typeroof.jsx";
import { getTypeSpecPropertiesIdMethod } from "../../prosemirror/integration.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchemaSpec } from "../../prosemirror/default-schema";
import { readMetaModelJSONfromMap } from "../../prosemirror/models.typeroof.jsx";

import { applyHtmlAttrsBag } from "../../prosemirror/html-attrs.ts";

import {
    // getStyleLinks,
    INTENT_STYLE_LINKS,
    MARK_STYLE_LINKS,
} from "../../registered-properties-definitions.mjs";

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

// Return true if it is block or false if it is inline.
// ProseNirror Model NodeType:
//      this.isBlock = !(spec.inline || name == "text")
// and:
//      get isInline() { return !this.isBlock }
function _getMMChildIsBlock(proseMirrorNodeSpec, mmNodeSpecMap, mmNode) {
    const typeKey = mmNode.get("typeKey").value;
    if (typeKey === "text") return false;
    if (mmNodeSpecMap.has(typeKey)) {
        const mmNodeSpec = mmNodeSpecMap.get(typeKey);
        return !mmNodeSpec.get("inline").value;
    }
    if (proseMirrorNodeSpec[typeKey]) {
        const pmNodeSpec = proseMirrorNodeSpec[typeKey];
        return !pmNodeSpec.inline; // spec.inline is optional; !undefined === true → block
    }
    // unknown to both: block iff its own content contains a block child
    for (const grandChild of mmNode.get("content").value)
        if (_getMMChildIsBlock(proseMirrorNodeSpec, mmNodeSpecMap, grandChild))
            return true;
    return false;
}

// Approximation of prosemirror-model's compiled NodeType.inlineContent
// for raw node specs (metamodel NodeSpecModel and PM default-schema
// NodeSpec alike): inline nodes — and nodes whose content expression
// mentions the inline group — put their children into an inline context.
// TODO: `/\binline\b/` won't catch expressions that reach inline content
// only via a custom group name; the spec editor lets users define custom
// inline-ish groups, so we should be more complete here!
function _specChildrenInInlineContext(inlineFlag, contentExpr) {
    return (
        !!inlineFlag ||
        (typeof contentExpr === "string" && /\binline\b/.test(contentExpr))
    );
}

// Shared derivation of the "reproducing" rendering directives from a
// node's attrs; hasAttr(name) reports whether the spec (metamodel
// AttributeSpecMapModel or PM AttributeSpecs object) declares the attr.
// Mirrors integration's conventions: html → verbatim inner HTML
// (_createReproducingToDOM), htmlAttrs → attribute bag, htmlTag →
// reproduce the matched element's tag (_reproducingTag).
function _getRenderingAttrDirectives(hasAttr, attrs) {
    return {
        // TODO: html should only be used when it is an atom, also in
        // integration. Also, maybe don't initialize UIDocumentNodes if
        // this is a leaf node.
        innerHtml: hasAttr("html") && attrs.html ? attrs.html : null,
        attributes:
            hasAttr("htmlAttrs") && attrs.htmlAttrs ? attrs.htmlAttrs : null,
        htmlTag: hasAttr("htmlTag") && attrs.htmlTag ? attrs.htmlTag : null,
    };
}

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
        // figure out the tag of the element
        const current = this.getEntry("."),
            typeKey = current.get("typeKey").value,
            nodeSpecMap = this.getEntry("nodeSpec");
        let tag = "div"; // default
        let attributes = null;
        let innerHtml = null;
        // block-context default, like prosemirror/integration's default param
        let childrenInInlineContext = false;
        // known types get data-node-type; _determineUnknownType overrides
        // this with the data-unknown-* attribute of the resolved type
        let additionalAttrs = { "data-node-type": typeKey };
        // ProseMirror parity: per-node typeSpec styling (the nodeViews in
        // integration) exists only for node types of the metamodel schema;
        // default-schema-only and unknown-resolved types get none.
        this._hasTypeSpecStyling = nodeSpecMap.has(typeKey);

        if (nodeSpecMap.has(typeKey)) {
            // FIXME: must update when this.typeKey or nodeSpec[typeKey] changes!
            const nodeSpec = nodeSpecMap.get(typeKey),
                attributeSpecMap = nodeSpec.get("attrs"),
                attrs = readMetaModelJSONfromMap(current.get("attrs"), {}),
                renderingDirectives = _getRenderingAttrDirectives(
                    (name) => attributeSpecMap.has(name),
                    attrs,
                );

            innerHtml = renderingDirectives.innerHtml;
            attributes = renderingDirectives.attributes;

            if (renderingDirectives.htmlTag !== null)
                tag = renderingDirectives.htmlTag;
            else {
                const tagOrEmpty = nodeSpec.get("tag");
                if (!tagOrEmpty.isEmpty && tagOrEmpty.value !== "")
                    tag = tagOrEmpty.value;
            }

            const contentExpr = nodeSpec.get("content");
            childrenInInlineContext = _specChildrenInInlineContext(
                nodeSpec.get("inline").value,
                contentExpr.isEmpty ? null : contentExpr.value,
            );
        }
        // could be directly in this._defaultSchemaSpec.nodes
        else {
            // Mirrors ProseMirror._rawCreateProseMirrorNode in
            // prosemirror/integration.typeroof.jsx, but renders directly
            // from the raw specs; see default-schema.ts for the specs
            // handled here (e.g. hard_break, unknown, unknown_block,
            // unknown_inline).
            const attrs = readMetaModelJSONfromMap(current.get("attrs"), {});
            // Look at prosemirror/integration.typeroof.jsx ProseMirror._rawCreateProseMirrorNode
            const _determineUnknownType = (typeKey, current) => {
                const childrenBlockType = {
                    hasBlock: false,
                    hasInline: false,
                };
                for (const mmChild of current.get("content").value) {
                    const block = _getMMChildIsBlock(
                        this._defaultSchemaSpec.nodes,
                        nodeSpecMap,
                        mmChild,
                    );
                    if (block) {
                        childrenBlockType.hasBlock = true;
                        if (childrenBlockType.hasInline) break; // shortcut
                    } else {
                        childrenBlockType.hasInline = true;
                        if (childrenBlockType.hasBlock) break; // shortcut
                    }
                }
                const { hasBlock, hasInline } = childrenBlockType;

                // NOTE: this renderer won't crash, ProseMirror doesn't
                // accept that, but here we don't have a problem.
                if (hasBlock && hasInline)
                    // log-and-crash (operator decision): schema.node below
                    // will throw on the invalid content mix.
                    console.warn(
                        `${this} unknown type "${typeKey}" has` +
                            " mixed block/inline content; ProseMirror will likely throw.",
                    );
                const [pmTypeName, unknownAttrs] = hasBlock
                    ? ["unknown_block", { "data-unknown-block-type": typeKey }]
                    : this._context.inInlineContext
                      ? [
                            "unknown_inline",
                            { "data-unknown-inline-type": typeKey },
                        ]
                      : ["unknown", { "data-unknown-type": typeKey }];
                return [
                    pmTypeName,
                    this._defaultSchemaSpec.nodes[pmTypeName],
                    unknownAttrs,
                ];
            };

            const [, /*pmTypeName*/ nodeSpec, unknownAttrs] =
                    typeKey in this._defaultSchemaSpec.nodes
                        ? [
                              typeKey,
                              this._defaultSchemaSpec.nodes[typeKey],
                              null,
                          ]
                        : _determineUnknownType(typeKey, current),
                attributeSpec = nodeSpec?.attrs || {},
                renderingDirectives = _getRenderingAttrDirectives(
                    (name) => name in attributeSpec,
                    attrs,
                );

            if (unknownAttrs !== null) additionalAttrs = unknownAttrs;
            childrenInInlineContext = _specChildrenInInlineContext(
                nodeSpec.inline,
                nodeSpec.content,
            );
            innerHtml = renderingDirectives.innerHtml;
            attributes = renderingDirectives.attributes;

            if (renderingDirectives.htmlTag !== null)
                tag = renderingDirectives.htmlTag;
            else if (nodeSpec.toDOM) {
                const domSpec = nodeSpec.toDOM({ attrs }); // duck typing!
                if (Array.isArray(domSpec)) tag = domSpec[0];
                else if (domSpec?.nodeType === Node.ELEMENT_NODE)
                    tag = domSpec.tagName.toLowerCase();
            }
        }

        const childrenContext = {
            ...this._context,
            inInlineContext: childrenInInlineContext,
            // the immediate parent element decides mark styling, mirroring
            // ProseMirror where marks attach only to subscribed nodeViews
            hasTypeSpecStyling: this._hasTypeSpecStyling,
        };

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
    ) {
        const settings = {},
            dependencyMappings = [
                [typeSpecProperties, "properties@"],
                ["/font", "rootFont"],
            ];
        if (
            nextTypeSpecProperties !== null &&
            nextTypeSpecProperties !== typeSpecProperties
        )
            dependencyMappings.push([
                nextTypeSpecProperties,
                "nextProperties@",
            ]);
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

    _getPathOfTypes(localPath) {
        const pathOfTypes = [];
        let currentPath = localPath;
        do {
            const current = this.getEntry(currentPath);
            pathOfTypes.unshift(current.get("typeKey").value);
            currentPath = currentPath.parent.parent;
        } while (currentPath.startsWith(this._documentRootPath));
        return pathOfTypes;
    }

    _provisionWidgets(/* compareResult */) {
        if (this._hasTypeSpecStyling) this._provisionTypeSpecStyler();
        return super._provisionWidgets();
    }

    _provisionTypeSpecStyler() {
        const pathOfTypes = this._getPathOfTypes(this.widgetBus.rootPath),
            typeSpecProperties = this._getTypeSpecPropertiesId(pathOfTypes);
        // Compute the next sibling's typeSpecProperties for
        // resolving lineHeightAfter/emAfter margin units.
        // TODO (parity edge case): this uses the sibling's original
        // typeKey; when the sibling's type is unknown, ProseMirror
        // resolves no per-node typeSpec for it. Fixing this requires
        // resolving the sibling's effective type (cf. the
        // _determineUnknownType classification) — parked for now.
        let nextTypeSpecProperties = null;
        const parentCollection = this.getEntry(this.widgetBus.rootPath.parent),
            currentKey = this.widgetBus.rootPath.parts.at(-1),
            currentIndex = parentCollection.indexOfKey(currentKey),
            nextIndex = currentIndex + 1;
        if (currentIndex >= 0 && nextIndex < parentCollection.size) {
            const nextKey = `${nextIndex}`,
                nextPath = this.widgetBus.rootPath.parent.append(nextKey),
                nextPathOfTypes = this._getPathOfTypes(nextPath);
            nextTypeSpecProperties =
                this._getTypeSpecPropertiesId(nextPathOfTypes);
        }
        const oldId =
            this._typeSpecStylerWrapper !== null
                ? this._widgets.indexOf(this._typeSpecStylerWrapper)
                : -1;
        if (oldId === -1) {
            // inital
            this._typeSpecStylerWrapper = this._createTypeSpecStylerWrapper(
                typeSpecProperties,
                nextTypeSpecProperties,
            );
            this._widgets.splice(0, 0, this._typeSpecStylerWrapper);
        } else {
            const oldWrapper = this._widgets[oldId];
            if (
                oldWrapper.dependencyReverseMapping.get(
                    "typeSpecProperties@",
                ) !== typeSpecProperties
            ) {
                const newWrapper = this._createTypeSpecStylerWrapper(
                    typeSpecProperties,
                    nextTypeSpecProperties,
                );
                this._widgets.splice(oldId, 1, newWrapper);
                oldWrapper.destroy();
                this._typeSpecStylerWrapper = newWrapper;
            }
        }
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
        this._stylerWrapper = null;
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
    _getPathOfTypes = UIDocumentElement.prototype._getPathOfTypes;

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
                    ? UIDocumentUnkownStyleStyler
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
        const styleLinkPropertiesId = `styleLinkProperties@${typeSpecPropertiesPath.append(styleLinkType, styleLink)}`,
            protocolHandlerImplementation =
                this.widgetBus.getProtocolHandlerImplementation(
                    "styleLinkProperties@",
                    null,
                );
        if (protocolHandlerImplementation === null)
            throw new Error(
                `KEY ERROR ProtocolHandler for identifier "styleLinkProperties@" not found.`,
            );
        if (protocolHandlerImplementation.hasRegistered(styleLinkPropertiesId))
            return styleLinkPropertiesId;
        return null;
    }

    _getEffectiveStyleLinks(typeSpecProperties, prefix = INTENT_STYLE_LINKS) {
        return getEffectiveStyleLinks(
            this.widgetBus,
            typeSpecProperties, // `typeSpecProperties@${path}`,
            prefix,
        );
    }

    _getWrapMarks(typeSpecPropertiesPath) {
        const node = this.getEntry("."),
            marksList = node.get("marks"),
            markSpec = this.getEntry("markSpec"),
            typeSpecProperties = `typeSpecProperties@${typeSpecPropertiesPath}`,
            result = [];
        let intentStyleLinks = null,
            markStyleLinks = null,
            // current = null,
            kind = null,
            styleLinkName = null,
            styleLinkType = null,
            styleName = null;
        // ProseMirror parity: when the enclosing node has no associated
        // typeSpec (cf. _hasTypeSpecStyling in UIDocumentElement), style
        // links are not resolved — marks render with their plain
        // spec-derived tag and attributes, and receive no styler.
        const applyStyleLinks = this._context.hasTypeSpecStyling !== false;

        // this._defaultSchemaSpec.marks
        // build from inside out:
        for (const mark of marksList.value.toReversed()) {
            const markType = mark.get("typeKey").value,
                attrs = readMetaModelJSONfromMap(mark.get("attrs"), {});
            let tag = "span",
                htmlAttributes = false;

            if (markType === "generic-style") {
                kind = "intent";
                htmlAttributes =
                    "htmlAttrs" in
                    this._defaultSchemaSpec.marks["generic-style"];
                // intent style ...
                styleLinkName = attrs["data-style-name"] || null;
                styleLinkType = "intentStyleLinks";
                if (applyStyleLinks) {
                    if (intentStyleLinks === null)
                        intentStyleLinks = this._getEffectiveStyleLinks(
                            typeSpecProperties,
                            INTENT_STYLE_LINKS,
                        );
                    // tag is on the edge
                    // or "span"
                    // from @typeSpec
                    // get the edge
                    if (intentStyleLinks.has(styleLinkName)) {
                        const edge = intentStyleLinks.get(styleLinkName),
                            tagOrEmpty = edge.get("tag");
                        if (!tagOrEmpty.isEmpty && tagOrEmpty.value !== "")
                            // otherwise it remains "span"
                            tag = tagOrEmpty.value;
                        styleName = edge.get("stylePatch").value;
                    }
                }
            } else if (markType in this._defaultSchemaSpec.marks) {
                kind = "native";
                const pmMarkSpec = this._defaultSchemaSpec.marks[markType];
                htmlAttributes = "htmlAttrs" in pmMarkSpec;
                if ("tag" in pmMarkSpec && pmMarkSpec.tag !== "")
                    tag = pmMarkSpec.tag;
            } else if (markSpec.has(markType)) {
                // mark style ...
                kind = "mark";
                const mmMarkSpec = markSpec.get(markType),
                    tagOrEmpty = mmMarkSpec.get("tag");
                if (!tagOrEmpty.isEmpty && tagOrEmpty.value !== "")
                    tag = tagOrEmpty.value;
                htmlAttributes = mmMarkSpec.get("attrs").has("htmlAttrs");
            }
            if (kind === "native" || kind === "mark") {
                styleLinkType = "markStyleLinks";
                styleLinkName = markType;
                if (applyStyleLinks) {
                    if (markStyleLinks === null)
                        markStyleLinks = this._getEffectiveStyleLinks(
                            typeSpecProperties,
                            MARK_STYLE_LINKS,
                        );
                    if (markStyleLinks.has(markType)) {
                        const edge = markStyleLinks.get(markType);
                        styleName = edge.get("stylePatch").value;
                    }
                }
            }

            result.push({
                kind,
                tag,
                markType,
                styleLinkName, // markElement.setAttribute("data-style-name", styleLinkName)
                htmlAttributesBag:
                    htmlAttributes && attrs.htmlAttrs ? attrs.htmlAttrs : null,
                styleLinkType,
                styleName,
            });
        }
        return result;
    }

    _wrapResultsAreEqual(wrapResultsA, wrapResultsB) {
        if (wrapResultsA.length !== wrapResultsB.length) return false;
        for (let i = 0, l = wrapResultsA.length; i < l; i++) {
            const wrapperA = wrapResultsA[i],
                wrapperB = wrapResultsB[i],
                allKeys = new Set([
                    ...Object.keys(wrapperA),
                    ...Object.keys(wrapperB),
                ]);
            for (const key of allKeys) {
                if (wrapperA[key] !== wrapperB[key]) return false;
            }
        }
        return true;
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
            // if not skipped we will apply UIDocumentUnkownStyleStyler,
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
            // 0, -1: don't include the current "text" type
            pathOfTypes = this._getPathOfTypes(this.widgetBus.rootPath).slice(
                0,
                -1,
            ),
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
        this._nodeSlots = new Map();
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
                { inInlineContext: false }, // context
            ],
        ];
        this._initWidgets(widgets);
    }
}
