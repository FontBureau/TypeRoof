import { FreezableSet, Path } from "../../metamodel.mjs";

import {
    NodeModel,
    toMetaModelJSON,
    fromMetaModelJSON,
} from "./models.typeroof.jsx";

import { _BaseComponent } from "../basics/component.mjs";

import { Schema /*, DOMParser*/ } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { undo, redo, history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
    baseKeymap,
    chainCommands,
    newlineInCode,
    createParagraphNear,
    liftEmptyBlock,
    splitBlockAs,
    exitCode,
} from "prosemirror-commands";
import "prosemirror-view/style/prosemirror.css";

export function getPathOfTypes(
    path /* { path } = resolved */,
    currentType = null,
) {
    // path is actually a rather complex array type:
    // path.push(node, index, start + offset).
    // This means we can get just each index out of it and that
    // it gives the raw indexes, compatible with the metamodel indexes.
    // Using the node positions is however complicated, as at the
    // time this code runs, the positions are not necessarily already
    // synced to the metamodel document.
    // Path of types is however all we need to resolve the TypeSpec.
    const pathOfTypes = [];
    // , contentIndexes = []
    for (let i = 0, l = path.length; i < l; i += 3)
        pathOfTypes.push(path[i].type.name);
    // contentIndexes.push(path[i+1]);

    if (currentType) pathOfTypes.push(currentType);
    return pathOfTypes;
}

/**
 * started this from looking at function markApplies
 * https://github.com/ProseMirror/prosemirror-commands/blob/master/src/commands.ts
 * not sure if it is sufficiently complete.
 */
export function getPathsOfTypes(
    doc /* :Node*/,
    ranges /*: readonly SelectionRange[]*/,
    enterAtoms /*: boolean*/,
    skip = Object.freeze(new FreezableSet()),
) {
    const result = new Map(), // try to reduce the amount of results
        seen = new Set();
    for (let i = 0; i < ranges.length; i++) {
        const { $from, $to } = ranges[i];
        if ($from.depth === 0 && !result.has(0))
            // && doc.inlineContent ?????
            result.set(0, [doc.type.name]);
        doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
            if (
                seen.has(pos) ||
                skip.has(node.type.name) ||
                (!enterAtoms &&
                    node.isAtom &&
                    node.isInline &&
                    pos >= $from.pos &&
                    pos + node.nodeSize <= $to.pos)
            )
                return;
            const resolved = doc.resolve(pos);
            result.set(pos, getPathOfTypes(resolved.path, node.type.name));
        });
    }
    return result.values();
}

/* We need this a lot, as it seems, there are still some duplicates in this module! */
function _getBestTypeSpecPropertiesId(
    typeSpecLink,
    protocolHandlerName /*='typeSpecProperties@'*/,
    protocolHandlerImplementation,
    originTypeSpecPath,
    asPath = false,
) {
    const currentTypeSpecPath = Path.fromString(typeSpecLink),
        format = (path) => `${protocolHandlerName}${path}`;
    if (protocolHandlerImplementation === null)
        throw new Error(
            `KEY ERROR ProtocolHandler for identifier "${protocolHandlerName}" not found.`,
        );

    // getProtocolHandlerImplementation
    let testPath =
        currentTypeSpecPath.parts.length === 0 ||
        currentTypeSpecPath.parts[0] === "children"
            ? // the initial "children" is part from typeSpecLink
              originTypeSpecPath.append(...currentTypeSpecPath)
            : originTypeSpecPath.append("children", ...currentTypeSpecPath);
    while (true) {
        if (!originTypeSpecPath.isRootOf(testPath))
            // We have gone to far up. This also prevents that
            // a currentTypeSpecPath could potentially inject '..'
            // to break out of originTypeSpecPath, though,
            // the latter seems unlikely, as we parse it in here.
            break;
        const typeSpecPropertiesId = format(testPath);
        if (protocolHandlerImplementation.hasRegistered(typeSpecPropertiesId))
            return asPath ? testPath : typeSpecPropertiesId;
        // Move towards root and continue; // remove 'children' and `{key}`
        testPath = testPath.slice(0, -2);
    }
    return asPath ? originTypeSpecPath : format(originTypeSpecPath);
}

/**
 * MAYBE: requires a better name
 *
 * NOTE (to myself): I think going via _getBestTypeSpecPropertiesId is
 * maybe not an ideal implementation, so far, look twice and overthink
 * where asPath===true;
 */
export function getTypeSpecPropertiesIdMethod(
    pathOfTypes,
    asPath = false,
    nodeSpecToTypeSpecName = "nodeSpecToTypeSpec",
    protocolHandlerName = "typeSpecProperties@",
) {
    const nodeSpecToTypeSpec = this.getEntry(nodeSpecToTypeSpecName),
        typeKey = pathOfTypes.at(-1),
        typeSpecLink = !nodeSpecToTypeSpec.has(typeKey)
            ? ""
            : nodeSpecToTypeSpec.get(typeKey).get("link").value,
        protocolHandlerImplementation =
            this.widgetBus.getProtocolHandlerImplementation(
                protocolHandlerName,
                null,
            );
    return _getBestTypeSpecPropertiesId(
        typeSpecLink,
        protocolHandlerName,
        protocolHandlerImplementation,
        this._originTypeSpecPath,
        asPath,
    );
}

export function getTypeSpecsMethod(state) {
    const { empty, $cursor, ranges } = state.selection, // as TextSelection
        result = new Map();
    if (empty && !$cursor) return result;
    const pathsOfTypes = getPathsOfTypes(
        state.doc,
        ranges,
        false /*enterAtoms*/,
        // we don't look at "text" directly and it seems like
        // these paths always also produce the parent paths
        new Set(["text"]) /* skip types*/,
    );
    for (const pathOfTypes of pathsOfTypes) {
        const typeSpecPath = this._getTypeSpecPropertiesId(
                pathOfTypes,
                true /*asPath*/,
            ),
            typeSpec = this.getEntry(typeSpecPath);
        result.set(typeSpec, typeSpecPath);
    }
    return result;
}

export class ProsemirrorNodeView {
    // the args are from https://prosemirror.net/docs/ref/#view.NodeViewConstructor
    // type NodeViewConstructor = fn(
    //     node: Node,
    //     view: EditorView,
    //     getPos: fn() → number | undefined,
    //     decorations: readonly Decoration[],
    //     innerDecorations: DecorationSource
    // ) → NodeView
    constructor(
        widgetBus,
        subscriptionsId,
        node,
        view,
        getPos,
        decorations,
        innerDecorations,
    ) {
        this.widgetBus = widgetBus;
        this._subscriptionsId = subscriptionsId;
        this._node = node;
        this._view = view;
        this._decorations = decorations;
        this._innerDecorations = innerDecorations;
        // TODO: a more direct API in widgetBus for this wouldn't hurt
        // e.g. getTagForType
        const mmNodeSpec = this.widgetBus
                .getLinked(node.type.schema)
                .get("nodes")
                .get(node.type.name),
            specTag = mmNodeSpec.get("tag").value;
        // Reproducing atoms (inferred: the node type declares an "html"
        // attr) render wrapper-free: replayed outer attributes +
        // verbatim innerHTML, no content element, no contentDOM. Their
        // element tag may be reproduced from the source (htmlTag).
        this._isReproducing = "html" in (node.type.spec.attrs ?? {});
        this._specTag = specTag;
        const tag = this._isReproducing
                ? _reproducingTag(node, specTag)
                : specTag,
            element = widgetBus.domTool.createElement(tag, {
                "data-node-type": node.type.name,
            });
        // The outer DOM node that represents the document node.
        this.dom = element;

        if (this._isReproducing) {
            this._stylerDOM = this.dom;
            _applyHtmlAttrsBag(this.dom, node.attrs.htmlAttrs);
            // skipped when empty: the reproduced tag may be a void
            // element (e.g. <img>), which has no content
            if (node.attrs.html) this.dom.innerHTML = node.attrs.html;
        } else {
            // editable attr replay: collected outer attributes on the
            // outer element (guarded; the content element is untouched)
            if (node.attrs.htmlAttrs)
                _applyHtmlAttrsBag(this.dom, node.attrs.htmlAttrs);
            // FIXME: depending on the type of the outer node, this might
            // better be a span.
            const contentElement = widgetBus.domTool.createElement("div");
            element.append(contentElement);
            // For the subscription it is important that this element is
            // the same as the contentDOM, the element that will be the parent
            // of the marks.
            this._stylerDOM = contentElement;
            // The DOM node that should hold the node's content
            // this is probably only required when this._stylerDOM != this.dom
            // this is also part of the ProseMiror API
            this.contentDOM = contentElement;
        }
        const subscriptionsWidget = widgetBus.getWidgetById(
            this._subscriptionsId,
            null,
        );
        if (subscriptionsWidget === null) return;
        // else: we have a subscriptions widget, hence, we can subscribe...
        const structuralElements = {
            // required to style e.g. the margins between paragraphs
            outer: this.dom,
            // for reproducing atoms outer === inner (an anticipated
            // case in UIDocumentNodeOutfitter)
            inner: this._stylerDOM,
        };

        subscriptionsWidget.subscribe(
            this._stylerDOM,
            structuralElements /*, contentIndexes*/,
            node,
            getPos,
            decorations,
            innerDecorations,
        );
    }

    // OK, so when I split a node, the NodeView is updated not completely
    // re-created, so I need to pass this new node on to the subscription...
    update(node, decorations, innerDecorations) {
        this._node = node;
        this._decorations = decorations;
        this._innerDecorations = innerDecorations;
        if (this._isReproducing) {
            // A changed reproduced tag can't be patched in place: the
            // element itself is wrong. Rejecting the update makes PM
            // discard this view and build a new one.
            if (
                _reproducingTag(node, this._specTag) !==
                this.dom.tagName.toLowerCase()
            )
                return false;
            _applyHtmlAttrsBag(this.dom, node.attrs.htmlAttrs);
            // see the constructor: void elements have no content
            if (node.attrs.html) this.dom.innerHTML = node.attrs.html;
        }
        const subscriptionsWidget = this.widgetBus.getWidgetById(
            this._subscriptionsId,
            null,
        );
        if (!this._isReproducing && node.attrs.htmlAttrs) {
            // editable attr replay: re-apply the bag on the outer element
            _applyHtmlAttrsBag(this.dom, node.attrs.htmlAttrs);
        }
        if (subscriptionsWidget === null) return this._isReproducing;
        subscriptionsWidget.updateSubscription(
            this._stylerDOM,
            node,
            decorations,
            innerDecorations,
        );
        return true;
    }

    // PM's domObserver also watches attribute changes; the styling
    // machinery legitimately mutates attributes (style, lang) on this
    // element. For reproducing atoms those must not trigger a
    // readDOMChange (template: ProsemirrorMarkView.ignoreMutation).
    ignoreMutation(mutation) {
        return (
            this._isReproducing &&
            mutation.type === "attributes" &&
            mutation.target === this.dom
        );
    }

    destroy() {
        this.widgetBus
            .getWidgetById(this._subscriptionsId, null)
            ?.unsubscribe(this._stylerDOM);
    }
}

export class ProsemirrorMarkView {
    // https://prosemirror.net/docs/ref/#view.MarkViewConstructor
    // type MarkViewConstructor = fn(
    //     mark: Mark,
    //     view: EditorView,
    //     inline: boolean
    // ) → MarkView
    // The function types used to create mark views.
    constructor(widgetBus, subscriptionsId, mark /*, view, inline*/) {
        this.widgetBus = widgetBus;
        this._subscriptionsId = subscriptionsId;
        // Reserved marks (e.g. generic-style) are not in the metamodel
        // marks map; fall back to the legacy span/data-style-name shape.
        const tag = this._getTag(mark),
            element = widgetBus.domTool.createElement(tag, {
                "data-mark-type": mark.type.name,
                ...(mark.type.name === "generic-style"
                    ? { "data-style-name": mark.attrs["data-style-name"] }
                    : {}),
            });
        this.dom = element;
        this._stylerDOM = element;
        this.contentDOM = element;
        this._applyDeclaredAttrs(mark);
        // replay the collected attributes bag (generic-style and
        // schema marks alike; guarded)
        if (mark.attrs.htmlAttrs)
            _applyHtmlAttrsBag(this.dom, mark.attrs.htmlAttrs);

        const subscriptionsWidget = widgetBus.getWidgetById(
            this._subscriptionsId,
            null,
        );
        if (subscriptionsWidget === null) return;
        subscriptionsWidget.subscribeMark(this._stylerDOM, mark);
    }

    // Set/remove the declared mark attrs on the DOM element (1:1
    // attr-name mapping, like the generated toDOM). Reserved marks
    // (generic-style) handle their attrs separately.
    _applyDeclaredAttrs(mark) {
        if (mark.type.name === "generic-style") return;
        let attrNames = null;
        const mmSchema = this.widgetBus.getLinked(mark.type.schema);
        if (mmSchema) {
            const mmMarks = mmSchema.get("marks");
            if (mmMarks.has(mark.type.name))
                attrNames = Array.from(
                    mmMarks.get(mark.type.name).get("attrs").keys(),
                );
        }
        // fall back to the PM mark spec's declared attrs (covers
        // unlinked contexts)
        if (attrNames === null)
            attrNames = Object.keys(mark.type.spec.attrs ?? {});
        for (const attrName of attrNames) {
            const value = mark.attrs[attrName];
            if (value === undefined || value === null)
                this.dom.removeAttribute(attrName);
            else this.dom.setAttribute(attrName, String(value));
        }
    }

    // PM >= 1.42 calls this when the mark at this position changed (same
    // type, possibly different attrs). Returning true reuses the view —
    // the element, its styling subscription and style widget stay
    // alive; returning false re-creates it.
    update(mark) {
        if (mark.attrs.htmlAttrs)
            _applyHtmlAttrsBag(this.dom, mark.attrs.htmlAttrs);
        if (mark.type.name === "generic-style")
            // A changed style name re-binds styling (and possibly the
            // tag): re-create, so the subscriptions machinery re-resolves.
            return (
                mark.attrs["data-style-name"] ===
                this.dom.getAttribute("data-style-name")
            );
        // Schema-defined marks: update the declared attrs in place; the
        // styling subscription re-resolves by type name only, so its
        // stored mark may stay stale harmlessly.
        this._applyDeclaredAttrs(mark);
        return true;
    }

    _getTag(mark) {
        const fallback = "span";
        const mmSchema = this.widgetBus.getLinked(mark.type.schema);
        if (!mmSchema) return fallback;
        const mmMarks = mmSchema.get("marks");
        if (!mmMarks.has(mark.type.name)) return fallback;
        const mmMarkSpec = mmMarks.get(mark.type.name);
        if (mmMarkSpec.get("tag").isEmpty || mmMarkSpec.get("tag").value === "")
            return fallback;
        return mmMarkSpec.get("tag").value;
    }

    // PM's domObserver also watches attribute changes; the styling
    // machinery legitimately mutates attributes (style, lang) on this
    // element. Those must not trigger a readDOMChange, which would
    // re-parse the element through the schema (bound tags could be
    // misinterpreted as schema marks).
    ignoreMutation(mutation) {
        return mutation.type === "attributes" && mutation.target === this.dom;
    }

    destroy() {
        this.widgetBus
            .getWidgetById(this._subscriptionsId, null)
            ?.unsubscribeMark(this._stylerDOM);
    }
}

class ProseMirrorMenuView {
    constructor(widgetBus, view /*EditorView*/, menuID) {
        this.widgetBus = widgetBus;
        this.menuID = menuID;
        this.widgetBus.getWidgetById(this.menuID).updateView(view);
    }
    update(view /*EditorView*/, prevState /*:EditorState*/) {
        this.widgetBus.getWidgetById(this.menuID).updateView(view, prevState);
    }
    destroy() {
        this.widgetBus.getWidgetById(this.menuID, null)?.destroyView();
    }
}

function mapSetBiDirectional(map, valA, valB) {
    map.set(valA, valB);
    map.set(valB, valA);
}

// Reserved node types that stand in for node types missing from the
// schema; the original typeKey is kept in the "unknown-type" attr.
const UNKNOWN_NODE_TYPES = new Set([
    "unknown",
    "unknown_block",
    "unknown_inline",
]);

// Convert an AttrValidateModel type to a ProseMirror `validate` string
// (see model.AttributeSpec.validate), or null when ProseMirror can't
// express it ("no-validation", "application-specific").
function _attrValidateToPMValidate(validateType) {
    switch (validateType) {
        case "number":
        case "string":
        case "boolean":
        case "null":
        case "undefined":
            return validateType;
        default:
            return null;
    }
}

// Attr values live in the metamodel (AttributeSpecModel.default) and in
// the DOM (getAttribute) as strings; coerce them to the validated type.
function _coerceAttrValue(validateType, value) {
    switch (validateType) {
        case "number":
            return Number(value);
        case "boolean":
            return value === "true";
        case "null":
            return null;
        case "undefined":
            return undefined;
        default:
            return value;
    }
}

// Create ProseMirror attrs (Object<AttributeSpec>) from a metamodel
// AttributeSpecMapModel. Returns null when no attributes are defined.
function _createPMAttrs(attributeSpecMap) {
    if (attributeSpecMap.size === 0) return null;
    const attrs = {};
    for (const [name, attributeSpec] of attributeSpecMap) {
        const validateType = attributeSpec.get("validate").get("type").value,
            attr = {
                default: _coerceAttrValue(
                    validateType,
                    attributeSpec.get("default").value,
                ),
            },
            validate = _attrValidateToPMValidate(validateType);
        if (validate !== null) attr.validate = validate;
        attrs[name] = attr;
    }
    return attrs;
}

// Read the declared attributes from a DOM element. Absent attributes are
// left out, so the ProseMirror defaults apply. Attribute names map 1:1
// to DOM attribute names.
function _createGetAttrs(attributeSpecMap) {
    return (dom) => {
        const attrs = {};
        for (const [name, attributeSpec] of attributeSpecMap) {
            if (!dom.hasAttribute(name)) continue;
            attrs[name] = _coerceAttrValue(
                attributeSpec.get("validate").get("type").value,
                dom.getAttribute(name),
            );
        }
        return attrs;
    };
}

// Serialize the declared attributes into the DOMOutputSpec, so HTML
// output round-trips through the generated parseDOM rules.
function _createToDOM(tag, attributeSpecMap) {
    if (attributeSpecMap.size === 0)
        return () => {
            return [tag, 0];
        };
    return (node) => {
        const attrs = {};
        for (const name of attributeSpecMap.keys()) {
            const value = node.attrs[name];
            if (value === null || value === undefined) continue;
            attrs[name] = value;
        }
        return [tag, attrs, 0];
    };
}

import {
    applyHtmlAttrsBag as _applyHtmlAttrsBag,
    collectHtmlAttrsToBag as _collectHtmlAttrsToBag,
    htmlAttrsBagToSpec as _htmlAttrsBagToSpec,
} from "./html-attrs.ts";

// Editable attr replay (inferred by a declared htmlAttrs attr):
// declared attrs coerce 1:1 as before; foreign attributes collect
// into the bag (guarded, minus declared names).
function _createEditableGetAttrs(attributeSpecMap) {
    const declaredGetAttrs = _createGetAttrs(attributeSpecMap),
        // DOM attribute names are always lowercase, declared names
        // may not be (e.g. htmlAttrs): compare lowercased.
        declaredNamesLower = new Set(
            Array.from(attributeSpecMap.keys(), (name) => name.toLowerCase()),
        );
    return (dom) =>
        Object.assign(declaredGetAttrs(dom), {
            htmlAttrs: _collectHtmlAttrsToBag(dom, (name) =>
                declaredNamesLower.has(name),
            ),
        });
}

// Declared attrs serialize 1:1 (except the bag itself); the bag is
// replayed as individual attributes.
function _createEditableToDOM(tag, attributeSpecMap) {
    const declaredToDOM = _createToDOM(tag, attributeSpecMap);
    return (node) => {
        const [outTag, outAttrs, hole] = declaredToDOM(node);
        if (outAttrs) delete outAttrs.htmlAttrs;
        return [
            outTag,
            Object.assign(
                outAttrs ?? {},
                _htmlAttrsBagToSpec(node.attrs.htmlAttrs),
            ),
            hole,
        ];
    };
}

// The tag a reproducing atom renders as: the reproduced source tag
// when the node carries one, else the tag declared by its node spec.
function _reproducingTag(node, specTag) {
    return node.attrs.htmlTag || specTag;
}

// A reproducing atom whose spec declares the "htmlTag" attr also
// reproduces the tag of the element it matched — its selector may
// match several tags (e.g. figcontent: <a>, <img>, <pre>). The spec
// tag stays the fallback for nodes created without an htmlTag.
function _createReproducingGetAttrs(attributeSpecMap) {
    const reproducesTag = attributeSpecMap.has("htmlTag");
    return (dom) => {
        const attrs = {
            html: dom.innerHTML,
            htmlAttrs: _collectHtmlAttrsToBag(dom),
        };
        if (reproducesTag) attrs.htmlTag = dom.tagName.toLowerCase();
        return attrs;
    };
}

function _createReproducingToDOM(tag) {
    return (node) => {
        const element = document.createElement(_reproducingTag(node, tag));
        _applyHtmlAttrsBag(element, node.attrs.htmlAttrs);
        // verbatim reproduction, no sanitization (like raw_html,
        // operator decision). Skipped when empty: the reproduced tag
        // may be a void element (e.g. <img>), which has no content.
        if (node.attrs.html) element.innerHTML = node.attrs.html;
        return element;
    };
}

export function createProseMirrorSchemaFromMetaModel(
    /*SchemaSpec: */ proseMirrorDefaultSchema,
    /*ProseMirrorSchemaModel*/ proseMirrorSchema,
) {
    const schemaSpec = {
        nodes: {
            /*later: ...proseMirrorDefaultSchema.nodes*/
        },
        marks: {
            /*later:...proseMirrorDefaultSchema.marks*/
        },
    };
    for (const [name, nodeSpec] of proseMirrorSchema.get("nodes")) {
        if (name in proseMirrorDefaultSchema.nodes) {
            console.warn(
                `PROSEMIRROR NODE_SPEC: attempt to override reserved node name ${name}, SKIPPING.`,
            );
            continue;
        }
        const newNode = {};
        for (const [key, value] of nodeSpec) {
            // handled below, after the 1:1 mappings
            if (key === "attrs") continue;
            if (value.isEmpty) continue;
            if (key === "tag" || key === "selector") continue;
            // => for 1:1 mappings
            newNode[key] = value.value;
        }

        const tag = nodeSpec.get("tag");
        if (tag.isEmpty || tag.value === "") {
            console.warn(
                `PROSEMIRROR NODE_SPEC: node does not define a tag, node name "${name}"`,
            );
        } else {
            // NOTE: this does not at all control any collisions of
            // tag names! E.g. when two nodes use the tag-name p
            const attributeSpecMap = nodeSpec.get("attrs"),
                selector = nodeSpec.get("selector"),
                // parseDOM matches on the selector if set, else the tag
                parseTag =
                    !selector.isEmpty && selector.value !== ""
                        ? selector.value
                        : tag.value,
                parseDOMItem = { tag: parseTag };
            if (attributeSpecMap.has("html")) {
                // inferred reproducing atom (decision: presence of the
                // html attr; may pivot to an explicit flag later)
                parseDOMItem.getAttrs =
                    _createReproducingGetAttrs(attributeSpecMap);
                newNode.parseDOM = [parseDOMItem];
                newNode.toDOM = _createReproducingToDOM(tag.value);
            } else if (attributeSpecMap.has("htmlAttrs")) {
                // inferred editable attr replay: declared
                // 1:1 coercion + collect foreign attrs into the bag
                parseDOMItem.getAttrs =
                    _createEditableGetAttrs(attributeSpecMap);
                newNode.parseDOM = [parseDOMItem];
                newNode.toDOM = _createEditableToDOM(
                    tag.value,
                    attributeSpecMap,
                );
            } else {
                if (attributeSpecMap.size)
                    parseDOMItem.getAttrs = _createGetAttrs(attributeSpecMap);
                newNode.parseDOM = [parseDOMItem];
                newNode.toDOM = _createToDOM(tag.value, attributeSpecMap);
            }
        }
        const pmAttrs = _createPMAttrs(nodeSpec.get("attrs"));
        if (pmAttrs !== null) newNode.attrs = pmAttrs;
        schemaSpec.nodes[name] = newNode;
    }
    // Adding the proseMirrorDefaultSchema nodes after our nodes.
    // This way, the default node, e.g., when splitting (using the "Enter" key),
    // will not be "unknown", but the first in our definition.
    // However, we won't be able to override the defaults either,
    // can also be regarded as a feature.
    Object.assign(schemaSpec.nodes, proseMirrorDefaultSchema.nodes);

    // CAUTION: this is a stub marks will be handled very differently, likely!
    // In this case it would be better to just ignore any defined marks.
    for (const [name, markSpec] of proseMirrorSchema.get("marks")) {
        if (name in proseMirrorDefaultSchema.marks) {
            console.warn(
                `PROSEMIRROR MARK_SPEC: attempt to override reserved mark name ${name}, SKIPPING.`,
            );
            continue;
        }
        const newMark = {};
        for (const [key, value] of markSpec) {
            // handled below, after the 1:1 mappings
            if (key === "attrs") continue;
            if (value.isEmpty) continue;
            if (key === "tag") continue;
            // => for 1:1 mappings
            newMark[key] = value.value;
        }
        const tag = markSpec.get("tag");
        if (tag.isEmpty || tag.value === "") {
            console.warn(
                `PROSEMIRROR MARK_SPEC: mark does not define a tag, mark name: "${name}"`,
            );
        } else {
            // NOTE: this does not at all control any collisions of
            // tag names! E.g. when two nodes use the tag-name p
            const attributeSpecMap = markSpec.get("attrs"),
                parseDOMItem = { tag: tag.value };
            if (attributeSpecMap.has("htmlAttrs"))
                // inferred editable attr replay
                parseDOMItem.getAttrs =
                    _createEditableGetAttrs(attributeSpecMap);
            else if (attributeSpecMap.size)
                parseDOMItem.getAttrs = _createGetAttrs(attributeSpecMap);
            newMark.parseDOM = [parseDOMItem];
            newMark.toDOM = attributeSpecMap.has("htmlAttrs")
                ? _createEditableToDOM(tag.value, attributeSpecMap)
                : _createToDOM(tag.value, attributeSpecMap);
        }
        const pmAttrs = _createPMAttrs(markSpec.get("attrs"));
        if (pmAttrs !== null) newMark.attrs = pmAttrs;
        schemaSpec.marks[name] = newMark;
    }
    Object.assign(schemaSpec.marks, proseMirrorDefaultSchema.marks);
    return new Schema(schemaSpec);
}

// Is this a Mac? Test used in proseMirror examples/sources e.g. in
// https://github.com/ProseMirror/prosemirror-example-setup
const mac =
    typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false;

export class ProseMirror extends _BaseComponent {
    static TEMPLATE = `<div class="ui_prosemirror_host"></div>`;

    constructor(
        widgetBus,
        /*SchemaSpec: */ proseMirrorDefaultSchema,
        idMap = {},
        originTypeSpecPath = null,
        classes = [],
    ) {
        super(widgetBus);
        this._idMap = idMap;
        this._originTypeSpecPath = originTypeSpecPath;
        this._proseMirrorDefaultSchema = proseMirrorDefaultSchema;
        // The cache is bi-directional, meaning that both mappings will be
        // set: proseMirrorNode -> metamodelNode and metamodelNode ->
        // proseMirrorNode, using mapSetBiDirectional. Since there's always
        // a one to one relationship, a single map is sufficient.
        this._nodesCache = new WeakMap();

        this._childrenWidgetBus = Object.assign(
            Object.create(widgetBus), // don't copy, inherit ...
            // By the time this gets called, the link is already established.
            // TODO: could fail on a cache-miss, as it would be bad if
            // the assertion above is not true!
            { getLinked: this.getLinked.bind(this) },
        );

        this._createGenericNodeView = (...args) =>
            new ProsemirrorNodeView(
                this._childrenWidgetBus,
                this._idMap.subscriptions,
                ...args,
            );
        this._createGenericMarkView = (...args) =>
            new ProsemirrorMarkView(
                this._childrenWidgetBus,
                this._idMap.subscriptions,
                ...args,
            );
        [this.element, this.view] = this.initTemplate(classes);
    }

    // Be a bit cautious with the availability of items in the cache
    // the life-cycle/moment of linking may be problematic in some cases.
    // This method is on purpose public.
    getLinked(item) {
        return this._nodesCache.get(item);
    }

    _menuPlugin() {
        return new Plugin({
            // pluginSpec
            // => PluginView {
            //      update⁠?: fn(view: EditorView, prevState: EditorState)
            //      destroy⁠?: fn()
            //}
            view: (editorView) =>
                new ProseMirrorMenuView(
                    this._childrenWidgetBus,
                    editorView,
                    this._idMap.menu,
                ),
        });
    }

    destroy() {
        if (this.view && !this.view.isDestroyed) this.view.destroy();
    }

    _initProseMirrorView(element) {
        const initialSchema = {
                nodes: { ...this._proseMirrorDefaultSchema.nodes },
                marks: { ...this._proseMirrorDefaultSchema.marks },
            },
            schema = new Schema(initialSchema),
            // FIXME: splitBlockAs without a function as argument is the
            // same as the default splitBlock. However, I leave this in here
            // because this is the door to a feature where we could define
            // which block is inserted after another block, when we press
            // "Enter" at the end of a block. Currently, the first block
            // that is appliable in the NodeSpec-Map is used, e.g. if
            // "heading-1" is at the top, that will be created.
            // It would be cool, to optionally, and dynamically via the UI,
            // define e.g. the follow-up block of 'heading-1' is 'paragraph-1'
            // and the follow-up block of 'paragraph-1' is 'paragraph-2',
            // making the writing and editing experience more fluid.
            // Ideally, an author of a document would be able to do this,
            // but having it as the author of the nodeSpec is not too
            // bad either, and in the beginning, these roles won't be
            // separated by the tool. Later maybe there's a writing
            // tool which doesn't allow changing the nodeSpec.
            mySplitBlock = splitBlockAs(),
            // Leaving this a s a quick way back into the topic...
            //node => {
            //  console.log('splitBlock node:', node);
            //  return {type: node.type/*.schema.nodes['heading-3']*//*, attrs: {level: 2}*/}
            //}
            configureBr = () => {
                const keyMap = {};
                // The node named "hard_break" codes this behavior, this is purely
                // bound to the name, there's no detail about the implementation of
                // hard_break, however, in the proseMirror sources, the implementation
                // is given, and that is assumed here.
                //
                // The actual node type is only available in the final schema
                // hence we check again in the actual command if hard_break
                // is there and fail hard if not.
                const name = "hard_break";
                if (name in this._proseMirrorDefaultSchema.nodes) {
                    const brCommand = chainCommands(
                        exitCode,
                        (state, dispatch) => {
                            const br = state.schema.nodes[name];
                            if (!br)
                                throw new Error(
                                    `ASSUMPTION FAILED the node type ${name} ` +
                                        `is expected to be available in the schema.`,
                                );
                            // NOTE: a way to fail gracefully would be to
                            // return false, then nothing happens or the
                            // input could be taken up by a following
                            // command, but this is currently not expected,
                            // and a hard fail forces for more discipline.
                            // return false;
                            dispatch(
                                state.tr
                                    .replaceSelectionWith(br.create())
                                    .scrollIntoView(),
                            );
                            return true;
                        },
                    );
                    keyMap["Mod-Enter"] = brCommand;
                    keyMap["Shift-Enter"] = brCommand;
                    if (mac) keyMap["Ctrl-Enter"] = brCommand;
                }
                return keyMap;
            },
            typeRoofKeymap = Object.assign({}, baseKeymap, {
                // original implementation is in prosemirror-commands
                Enter: chainCommands(
                    newlineInCode,
                    createParagraphNear,
                    liftEmptyBlock,
                    mySplitBlock,
                ),
                ...configureBr(),
            }),
            state = EditorState.create({
                schema: schema,
                plugins: [
                    history(),
                    keymap({
                        "Mod-z": undo,
                        "Mod-y": redo,
                        //    , "Mod-b": toggleMark(proseMirrorTestingSchema.marks.strong)
                        //    , "Mod-B": toggleMark(proseMirrorTestingSchema.marks.strong)
                    }),
                    keymap(typeRoofKeymap),
                    ...("menu" in this._idMap ? [this._menuPlugin()] : []),
                ],
                doc: schema.topNodeType.createAndFill(),
            }),
            view = new EditorView(element, {
                state,
                dispatchTransaction:
                    this._prosemirrorDispatchTransaction.bind(this),
                markViews: {
                    "generic-style": this._createGenericMarkView,
                },
            });
        return view;
    }

    initTemplate(classes = []) {
        const frag = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ),
            element = frag.firstElementChild;
        for (const name of classes) element.classList.add(name);
        this._insertElement(element);
        const view = this._initProseMirrorView(element);
        return [element, view];
    }

    _rawCreateMetamodelNode(cacheMap /* null or a map*/, pmNode, dependencies) {
        const draft = NodeModel.createPrimalDraft(dependencies),
            typeName =
                UNKNOWN_NODE_TYPES.has(pmNode.type.name) &&
                "unknown-type" in pmNode.attrs
                    ? pmNode.attrs["unknown-type"]
                    : pmNode.type.name;
        draft.get("typeKey").value = typeName;
        if (pmNode.type.name === "text") {
            draft.get("text").value = pmNode.text;
        } else {
            const contentDraft = draft.get("content");
            for (let i = 0, l = pmNode.content.childCount; i < l; i++) {
                const pmChildNode = pmNode.content.child(i);
                contentDraft.push(
                    this._createMetamodelNode(
                        cacheMap,
                        pmChildNode,
                        dependencies,
                    ),
                );
            }
        }

        const marksDraft = draft.get("marks");
        for (const mark of pmNode.marks) {
            const markDraft =
                marksDraft.constructor.Model.createPrimalDraft(dependencies);
            markDraft.get("typeKey").value = mark.type.name;
            const attrsDraft = markDraft.get("attrs");
            for (const [name, value] of Object.entries(mark.attrs)) {
                attrsDraft.set(name, toMetaModelJSON(value, dependencies));
            }
            marksDraft.push(markDraft);
        }
        const attrsDraft = draft.get("attrs");
        for (const [name, value] of Object.entries(pmNode.attrs)) {
            if (
                UNKNOWN_NODE_TYPES.has(pmNode.type.name) &&
                name === "unknown-type" &&
                !UNKNOWN_NODE_TYPES.has(typeName)
            )
                // Only skip this value if we actually transferred it
                // to the type of the node (typeName).
                continue;
            attrsDraft.set(name, toMetaModelJSON(value, dependencies));
        }
        const immutableNode = draft.metamorphose();
        return immutableNode;
    }

    _rawCreateProseMirrorNode(
        cacheMap /* null or a map*/,
        metamodelNode,
        schema,
        inInlineContext = false,
    ) {
        const type = metamodelNode.get("typeKey").value;
        let newNode;

        const marks = [];
        for (const [, mmMark] of metamodelNode.get("marks")) {
            // schema.mark(type: string | MarkType, attrs⁠?: Attrs) → Mark
            // Create a mark with the given type and attributes.
            const mmAttrs = mmMark.get("attrs");
            let attrs = null;
            if (mmAttrs.size) {
                attrs = {};
                for (const [name, value] of mmAttrs)
                    attrs[name] = fromMetaModelJSON(value);
            }
            const mark = schema.mark(mmMark.get("typeKey").value, attrs);
            marks.push(mark);
        }

        if (type === "text") {
            let text = metamodelNode.get("text");
            if (text.isEmpty || text.value.lenght === 0) {
                // This could could be handled by a CoherenceFunction function,
                // cleaning up the node before creation.
                // TODO: I'm undecided how to handle this, however, it
                // would be much nicer if this method could always return
                // something workable.
                throw new Error(`${this} text can't be empty`);
                // console.error(`${this} text can't be empty`);
                // text = {value: '<<Cannot be empty!!!>>'};
            }

            // https://prosemirror.net/docs/ref/#model.Schema.text
            // text(text: string, marks⁠?: readonly Mark[]) → Node
            // Create a text node in the schema. Empty text nodes are not allowed.
            newNode = schema.text(text.value, marks);
        } else {
            const mmContent = metamodelNode.get("content"),
                content = [];
            // Children are in inline context when this node has inline
            // content (textblock) or is itself inline. Unknown types fall
            // back to `unknown` whose content is inline* — hence true.
            const pmType = type in schema.nodes ? schema.nodes[type] : null,
                childInlineContext =
                    pmType === null
                        ? true
                        : pmType.inlineContent || pmType.isInline;
            for (const [, /*index*/ mmChildNode] of mmContent) {
                const child = this._createProseMirrorNode(
                    cacheMap,
                    mmChildNode,
                    schema,
                    childInlineContext,
                );
                content.push(child);
            }
            // https://prosemirror.net/docs/ref/#model.Schema.node
            //  node(
            //      type: string | NodeType,
            //      attrs⁠?: Attrs | null = null,
            //      content⁠?: Fragment | Node | readonly Node[],
            //      marks⁠?: readonly Mark[]
            //  ) → Node
            // Create a node in this schema. The type may be a string or
            // a NodeType instance. Attributes will be extended with defaults,
            // content may be a Fragment, null, a Node, or an array of nodes.

            // NOTE: if the type is unknown to the schema, I think we should
            // create an on-the-fly placeholder that can represent the node
            // and gives a clear message, that the type is missing.
            // We'll see how feasible that will be!

            const mmAttrs = metamodelNode.get("attrs");
            let attrs = null;
            if (mmAttrs.size) {
                attrs = {};
                for (const [name, value] of mmAttrs) {
                    attrs[name] = fromMetaModelJSON(value);
                }
            }

            // An alternative would be to create a type on the fly,
            // but that would require to update the schema, which at
            // this point is a bit late. We could pre-detect missing
            // node types as well, but we would have to do it on each
            // update. I think this route has the least impact.
            // However, we have a problem as we cannot have a node
            // allowing both: inline and block content!
            let pmTypeName = type;
            if (!(type in schema.nodes)) {
                const hasBlock = content.some((child) => child.isBlock),
                    hasInline = content.some((child) => child.isInline);
                if (hasBlock && hasInline)
                    // log-and-crash (operator decision): schema.node below
                    // will throw on the invalid content mix.
                    console.error(
                        `${this} PROSEMIRROR: unknown type "${type}" has` +
                            " mixed block/inline content; schema.node will likely throw.",
                    );
                pmTypeName = hasBlock
                    ? "unknown_block"
                    : inInlineContext
                      ? "unknown_inline"
                      : "unknown";
                // caution: this attr should not be put into the metamodel!
                if (attrs === null) attrs = {};
                attrs["unknown-type"] = type;
            }
            newNode = schema.node(pmTypeName, attrs, content, marks);
        }
        return newNode;
    }

    /**
     * If caching is to be used inject cache here, i.e. use this._nodesCache
     * or maybe a new Map() to cache internal node creation, the latter
     * is likely not a very good optimization as document would have to
     * contain a lot of identical nodes for it to speed things up.
     * The former, however, is crucial to keep the identity of the
     * metamodel <-> prosemirror nodes in sync.
     */
    _createMetamodelNode(cacheMap /* null or a map*/, pmNode, dependencies) {
        if (cacheMap !== null && cacheMap.has(pmNode))
            return cacheMap.get(pmNode);

        const immutableNode = this._rawCreateMetamodelNode(
            cacheMap,
            pmNode,
            dependencies,
        );

        if (cacheMap !== null)
            mapSetBiDirectional(cacheMap, pmNode, immutableNode);
        return immutableNode;
    }

    /**
     * If caching is to be used inject cache here, i.e. use this._nodesCache
     * or maybe a new Map() to cache internal node creation, the latter
     * is likely not a very good optimization as document would have to
     * contain a lot of identical nodes for it to speed things up.
     * The former, however, is crucial to keep the identity of the
     * metamodel <-> prosemirror nodes in sync.
     */
    _createProseMirrorNode(
        cacheMap /* null or a map*/,
        metamodelNode,
        schema,
        inInlineContext = false,
    ) {
        if (cacheMap !== null && cacheMap.has(metamodelNode))
            return cacheMap.get(metamodelNode);

        const newNode = this._rawCreateProseMirrorNode(
            cacheMap,
            metamodelNode,
            schema,
            inInlineContext,
        );

        if (cacheMap !== null)
            mapSetBiDirectional(cacheMap, metamodelNode, newNode);
        return newNode;
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;
    _getTypeSpecs = getTypeSpecsMethod;

    _prosemirrorDispatchTransaction(transaction) {
        // console.log(
        //   `${this} DISPATCH_TRANSACTION size went from`,
        //   transaction.before.content.size,
        //   "to",
        //   transaction.doc.content.size,
        //   "\ntransaction:",
        //   transaction,
        // );

        const newState = this.view.state.apply(transaction);
        const document = this.getEntry("document"); // => immutableDoc
        this.view.updateState(newState);
        const pmDocNode = this._nodesCache.get(document);
        if (pmDocNode === this.view.state.doc) {
            // nothing to do
            // console.log(`${this} DISPATCH_TRANSACTION: nothing to do`);
        } else {
            // console.log(
            //   `${this} DISPATCH_TRANSACTION: update metamodel document with view.state.doc...`,
            // );
            // update/sync metamodel document with view.state.doc
            // eventually:
            this._changeState(() => {
                const documentDraft = this.getEntry("document"),
                    pmDoc = this.view.state.doc,
                    // creating the doc will also create all the child nodes.
                    immutableDoc = this._createMetamodelNode(
                        this._nodesCache,
                        pmDoc,
                        documentDraft.oldState.dependencies,
                    ),
                    documentPath = Path.fromString(
                        this.widgetBus.getExternalName("document"),
                    ),
                    documentParentDraft = this.getEntry(documentPath.parent),
                    dokumentKey = documentPath.parts.at(-1);
                documentParentDraft.set(dokumentKey, immutableDoc);
                this._nodesCache.set(immutableDoc, this.view.state.doc);
                mapSetBiDirectional(
                    this._nodesCache,
                    immutableDoc,
                    this.view.state.doc,
                );
            });
        }

        if (this._originTypeSpecPath !== null) {
            const typeSpecs = this._getTypeSpecs(this.view.state),
                [, selectedTypeSpecPath] = typeSpecs.entries().next().value,
                editingTypeSpec = this.getEntry("editingTypeSpec");
            if (this._originTypeSpecPath.equals(selectedTypeSpecPath))
                this._changeState(() =>
                    this.getEntry("editingTypeSpec").clear(),
                );
            else {
                const newPath = selectedTypeSpecPath.toRelative(
                    this._originTypeSpecPath,
                );
                if (
                    editingTypeSpec.isEmpty ||
                    !newPath.equals(editingTypeSpec.value)
                )
                    this._changeState(
                        () =>
                            (this.getEntry("editingTypeSpec").value = newPath),
                    );
            }
        }
    }

    update(changedMap) {
        // console.log(
        //   `${this}.UPDATE(changedMap:${Array.from(changedMap.keys).join(", ")})`,
        //   changedMap,
        // );
        // Map(5) { stylePatchesSource → {…}, typeSpec → {…}, proseMirrorSchema → {…}, nodeSpecToTypeSpec → {…}, document → {…} }

        const newConfigItems = [];
        let schema = this.view.state.schema;
        const newProps = {};
        // CAUTION: proseMirrorSchema is treated like an optional dependency
        // some simple ProseMirror instances in here don't require it.
        // Hence, it should not hurt if it's not configured as a dependency
        // This is a bit subtle, but it works, so far, niceley.
        // TODO: A more explicit handling would be good!
        if (changedMap.has("proseMirrorSchema")) {
            const proseMirrorSchema = changedMap.get("proseMirrorSchema");
            schema = createProseMirrorSchemaFromMetaModel(
                this._proseMirrorDefaultSchema,
                proseMirrorSchema,
            );
            newConfigItems.push(["schema", schema]);
            const oldNodeViews = this.view.props.nodeViews || {},
                schemaNodes = proseMirrorSchema.get("nodes");
            for (const nodeName of schemaNodes.keys()) {
                //
                //, nodeViews: {
                //        '*': (...args/* node, view, getPos */)=>new ProsemirrorNodeView(this.widgetBus, ...args)
                //    }
                if (nodeName in oldNodeViews)
                    // Nothing to do
                    continue;

                // this node requires a new nodeView
                if (!("nodeViews" in newProps)) {
                    newProps.nodeViews = {};
                    for (const [nodeName, nodeView] of Object.entries(
                        oldNodeViews,
                    )) {
                        // Filter out removed nodeViews.
                        if (!schemaNodes.has(nodeName)) continue;
                        // Copy still required
                        newProps.nodeViews[nodeName] = nodeView;
                    }
                }
                newProps.nodeViews[nodeName] = this._createGenericNodeView;
            }

            const oldMarkViews = this.view.props.markViews || {},
                schemaMarks = proseMirrorSchema.get("marks");
            for (const markName of schemaMarks.keys()) {
                if (markName in oldMarkViews)
                    // Nothing to do
                    continue;

                // this mark requires a new markView
                if (!("markViews" in newProps)) {
                    newProps.markViews = {};
                    for (const [oldMarkName, oldMarkView] of Object.entries(
                        oldMarkViews,
                    )) {
                        // Filter out removed markViews, but keep reserved
                        // marks (e.g. generic-style): check the built PM
                        // schema, not the metamodel map.
                        if (!(oldMarkName in schema.marks)) continue;
                        // Copy still required
                        newProps.markViews[oldMarkName] = oldMarkView;
                    }
                }
                newProps.markViews[markName] = this._createGenericMarkView;
            }

            // NOTE: it is required to rebuild all of the proseMirror doc
            // using the new Schema, as it's referenced. The docs somewhere
            // recommend to rebuild via JSON serialization, but we can use
            // the document updating code below. Maybe dropping the
            // this._nodesCache;
            this._nodesCache = new WeakMap();
            mapSetBiDirectional(this._nodesCache, schema, proseMirrorSchema);
        }
        // it looks like document has to change...
        const document = changedMap.has("document")
            ? changedMap.get("document")
            : this.getEntry("document");
        // IMPORTANT: a pm-node as well as a metamodel-node
        // can be used multiple times. Hence, the position of the node
        // in the document can't be stored this way. It simply can
        // have multiple adresses. More importantly for us here is
        // however, that a node identity can stay in-tact over multiple
        // generations, i.e. a node might change but its siblings stay
        // the same.

        // This is basically one lookup in this._nodesCache if nothing
        // is to do.

        const newDoc = this._createProseMirrorNode(
            this._nodesCache,
            document,
            schema,
        );

        if (newDoc !== this.view.state.doc) {
            // console.log(
            //    `${this}UPDATE: update view.state.doc with  metamodel document...`,
            // );
            // update view.state.doc with newDoc which is in sync
            // with the metamodel document
            newConfigItems.push(["doc", newDoc]);
            // update doc in the chache, we just changed it with the transactions.
            mapSetBiDirectional(this._nodesCache, document, newDoc);
        } else {
            // nothing to do;
            // this happens when document was changed via dispatchTransaction
            // and is already linked to state.doc.
            // I expect this to be the case most of the time, as
            // the metamodel document is updated in dispatchTransaction
            // when the editor causes the changes.
            // console.warn(`${this}UPDATE: newDoc - nothing to do`);
        }
        if (newConfigItems.length) {
            // console.log(
            //   `${this}UPDATE: newConfigItems ${newConfigItems.length} `,
            //   ...Array.from(zip(...newConfigItems))[0],
            // );
            const oldConfig = Object.fromEntries(
                    [
                        "schema",
                        "doc",
                        "selection",
                        "storedMarks",
                        "plugins",
                    ].map((key) => [key, this.view.state[key]]),
                ),
                newConfig = Object.fromEntries(newConfigItems),
                config = Object.assign({}, oldConfig, newConfig),
                state = EditorState.create(config);
            // setProps(props: Partial<DirectEditorProps>)
            // Update the view by updating existing props object with the
            // object given as argument. Equivalent to
            // view.update(Object.assign({}, view.props, props)).
            newProps.state = state;
            this.view.setProps(newProps);
        }
        //else {
        //  console.warn(`${this}UPDATE: newConfigItems - nothing to do`);
        // }
    }
}
