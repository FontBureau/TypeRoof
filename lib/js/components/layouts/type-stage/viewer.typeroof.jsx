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
import { treatmentValuesAtStep } from "./text-composition/treatment-planner.ts";
import { TypeStagePaneStyler } from "./pane-styler.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchemaSpec } from "../../prosemirror/default-schema";

import { applyHtmlAttrsBag } from "../../prosemirror/html-attrs.ts";
import { require } from "../../dependency-injection.mjs";

import {
    getRenderingDirectives,
    computeAttrDrivenDiff,
    resolveNextNodePropertiesId,
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
        layoutRootPath,
    ) {
        super(widgetBus, zones, metaInfo, attachmentRegistry);
        const plan = metaInfo.renderingPlan;
        this._defaultSchemaSpec = defaultSchemaSpec;
        this._context = metaInfo.context;
        this._hasTypeSpecStyling = plan.hasTypeSpecStyling;
        this._pathOfTypes = plan.pathOfTypes;
        this._originTypeSpecPath = originTypeSpecPath;
        this._layoutRootPath = layoutRootPath;
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
        // text-composition: toggle the nowrap class on composed
        // textblocks. The child maps the FULL external protocol id
        // itself (the styler-wrapper pattern).
        const compositionId = `composition@${metaInfo.rootPath.toString()}`,
            widgets = [
                [
                    {},
                    [[compositionId, "composition@"]],
                    GenericUpdater,
                    this._updateComposedClass.bind(this),
                ],
            ];
        this._initWidgets(widgets);
    }

    _updateComposedClass(changedMap) {
        if (changedMap.has("composition@"))
            this.node.classList.toggle(
                "typeroof-composed",
                changedMap.get("composition@") !== null,
            );
    }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    _createTypeSpecStylerWrapper(
        typeSpecProperties,
        nextNodeProperties = null,
        typeSpecPath = null,
    ) {
        const settings = {},
            dependencyMappings = typeSpecStylerDependencyMappings(
                typeSpecProperties,
                `nodeProperties@${this._documentNodePath.toString()}`,
                nextNodeProperties,
                typeSpecPath,
            );
        // A layout level setting (like showParameters in the
        // editor); the document root is a direct child of the
        // layout, hence the layout root path. This mapping is
        // renderer-specific (needs the layout root path) and
        // therefore not part of the shared helper.
        dependencyMappings.push([
            this._layoutRootPath
                .append("verboseFontVariationSettings")
                .toString(),
            "verboseFontVariationSettings",
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

    // A resolved spec with "noStyler" renders inherit-only via the
    // STYLER's dormant state (it clears its inline styles and skips
    // application while the flag is set — see
    // UIDocumentTypeSpecStyler.update), so a styler is provisioned
    // regardless of the flag; no provisioning transitions are needed
    // for silent flips (the noStyler dependency is declared on the
    // styler wrapper, which the update-relevance filter wakes
    // directly). _hasTypeSpecStyling (a spec is resolvable at all)
    // stays true for silent nodes.
    _provisionTypeSpecStyler() {
        const typeSpecPath = this._getTypeSpecPropertiesId(
                this._pathOfTypes,
                true /* asPath */,
            ),
            typeSpecProperties = this._getTypeSpecPropertiesId(
                this._pathOfTypes,
            );
        // Compute the next sibling's nodeProperties@ registration id
        // for resolving lineHeightAfter/emAfter margin units — the
        // same channel the editor wires as nextNodeProperties@ (the
        // sibling's fontSize/line-height-em live in its node-properties
        // scope; a typeSpec-based lookup can't resolve the layout
        // keys).
        const nextNodeProperties = resolveNextNodePropertiesId(
            this.getEntry(this.widgetBus.rootPath.parent),
            this.widgetBus.rootPath.parts.at(-1),
            this._documentNodePath,
        );
        const oldId =
            this._typeSpecStylerWrapper !== null
                ? this._widgets.indexOf(this._typeSpecStylerWrapper)
                : -1;
        if (oldId === -1) {
            // inital
            this._typeSpecStylerWrapper = this._createTypeSpecStylerWrapper(
                typeSpecProperties,
                nextNodeProperties,
                typeSpecPath,
            );
            this._widgets.splice(0, 0, this._typeSpecStylerWrapper);
            return this._typeSpecStylerWrapper;
        } else {
            const oldWrapper = this._widgets[oldId],
                oldNextNodeProperties = oldWrapper.dependencyReverseMapping.has(
                    "nextNodeProperties@",
                )
                    ? oldWrapper.dependencyReverseMapping.get(
                          "nextNodeProperties@",
                      )
                    : null;
            // Compared: properties@ — it follows typeSpec resolution
            // and can change in place (typeSpec relinking); and
            // nextNodeProperties@ — the next sibling's identity can
            // change while this node's wrapper persists (a sibling
            // edit that doesn't rebuild this node). The own
            // nodeProperties@ mapping needs no rebuild check — its id
            // is document-path-keyed (`nodeProperties@<documentNodePath>`)
            // and the document path is stable for this wrapper's
            // lifetime (a moved or rebuilt node gets a new wrapper via
            // the meta tree).
            if (
                oldWrapper.dependencyReverseMapping.get("properties@") !==
                    typeSpecProperties ||
                oldNextNodeProperties !== nextNodeProperties
            ) {
                const newWrapper = this._createTypeSpecStylerWrapper(
                    typeSpecProperties,
                    nextNodeProperties,
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
        layoutRootPath,
    ) {
        super(widgetBus, zones, metaInfo, attachmentRegistry);
        this._layoutRootPath = layoutRootPath;
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
        // text-composition applicator state: the current text and the
        // composition payload of the enclosing textblock (null = OFF
        // MODE, today's single-text-node behavior)
        this._text = "";
        this._composition = null;
        // a carrier span we created to hold line spans in the
        // mark-less case (null when this.node is the bare text node)
        this._carrierSpan = null;
        // text-composition: the child widget maps the FULL external
        // protocol id itself (a bare "composition@" shorthand would
        // be intercepted as protocol syntax with an empty address,
        // not forwarded as the attachment's local — the styler
        // wrappers map external ids the same way). The run's path is
        // <textblock>/content/<index>.
        const compositionId = `composition@${metaInfo.rootPath.parent.parent.toString()}`,
            widgets = [
                [{}, ["text"], GenericUpdater, this._updateNode.bind(this)],
                [
                    {},
                    [[compositionId, "composition@"]],
                    GenericUpdater,
                    this._updateComposition.bind(this),
                ],
            ];
        this._initWidgets(widgets);
        this._initalWidgetsLength = this._widgets.length;
    }

    _updateNode(changedMap) {
        if (changedMap.has("text")) {
            const text = changedMap.get("text");
            // StringOrEmptyModel: undefined when empty
            this._text = text.isEmpty ? "" : (text.value ?? "");
            this._renderContent();
        }
    }

    _updateComposition(changedMap) {
        if (changedMap.has("composition@")) {
            // payload or null (OFF MODE / vanished)
            this._composition = changedMap.get("composition@");
            this._renderContent();
        }
    }

    // --- text-composition applicator ---
    // Renders the run's content: OFF MODE = one text node (today's
    // behavior); composed = per-line spans (the ported
    // typeroof-composition-line structure), each with its own text
    // node slice. Spans are throwaway: undo is re-rendering. The
    // one-text-node invariant breaks BY DESIGN here (plan phase 6).
    _renderContent() {
        const { Node } = this._domTool.window;
        if (this.node.nodeType === Node.TEXT_NODE) {
            if (this._composition === null) {
                this.node.data = this._text;
                return;
            }
            // composed content needs an element carrier: swap the
            // bare text node for a span (tracked for undo)
            this._carrierSpan = this._domTool.createElement("span");
            // identifies the composition-owned wrapper of a
            // mark-less run (the attachment's outermost node must
            // stay ONE node for the registry; a bare text node
            // can't host line spans)
            this._carrierSpan.classList.add("typeroof-composition-run");
            this._swapNode(this._carrierSpan);
        }
        // back to the bare text node when composition turns off and
        // there are no mark wrappers
        if (
            this._composition === null &&
            this._carrierSpan !== null &&
            this.node === this._carrierSpan
        ) {
            const textNode = this._domTool.createTextNode(this._text);
            this._swapNode(textNode);
            this._carrierSpan = null;
            return;
        }
        // The content carrier: the innermost MARK WRAPPER if marks
        // exist, else the node itself (our carrier span). NO
        // firstElementChild drill-down: once composed, the carrier's
        // children ARE the line spans (elements) — drilling would
        // descend into the first line span and re-render inside it,
        // leaving the other (stale) line spans untouched.
        const carrier = this._markWrappers.length
            ? this._markWrappers[0][this.constructor._MARK_ELEMENT]
            : this.node;
        if (this._composition === null) {
            carrier.replaceChildren(this._domTool.createTextNode(this._text));
            return;
        }
        carrier.replaceChildren(...this._buildLineSpans());
    }

    // varla-varfo _setLineColorCode, adapted to normalized steps:
    // negative (narrowing) cyan, positive (widening) red, 0 none;
    // overfull overrides. Intensity relative to the normalized
    // range [-1, 1].
    _lineColorCode(adjustmentStep, overfull) {
        if (overfull) return "hsl(0, 80%, 85%)";
        if (adjustmentStep < 0) {
            const intensity = Math.min(1, Math.abs(adjustmentStep));
            return `hsl(180, 80%, ${30 + 70 * (1 - intensity)}%)`;
        }
        if (adjustmentStep > 0) {
            const intensity = Math.min(1, adjustmentStep);
            return `hsl(0, 100%, ${30 + 70 * (1 - intensity)}%)`;
        }
        return "";
    }

    _buildLineSpans() {
        const { leaves, paragraphs } = this._composition,
            myPath = this._documentNodePath.toString(),
            leafIndex = leaves.findIndex((leaf) => leaf.path === myPath);
        if (leafIndex === -1)
            // not part of the composition (e.g. structure changed
            // mid-cycle): render uncomposed, the next update fixes it
            return [this._domTool.createTextNode(this._text)];
        const spans = [];
        for (const { segments, result } of paragraphs) {
            result.lines.forEach((line, lineIndex) => {
                const mySegments = [];
                for (let i = line.fromSegment; i < line.toSegment; i++)
                    if (segments[i].sourceIndex === leafIndex)
                        mySegments.push(segments[i]);
                if (mySegments.length === 0) return;
                const isLineStart =
                        segments[line.fromSegment].sourceIndex === leafIndex,
                    isLineEnd =
                        segments[line.toSegment - 1].sourceIndex === leafIndex,
                    span = this._domTool.createElement("span");
                span.classList.add("typeroof-composition-line");
                if (isLineStart) {
                    span.classList.add("typeroof-composition-line-first");
                    if (lineIndex === 0)
                        span.classList.add(
                            "typeroof-composition-paragraph-first-line",
                        );
                }
                if (isLineEnd && line.breakAt?.kind === "hyphen")
                    span.classList.add("typeroof-composition-line-hyphen");
                // Justification-potentials treatments (milestone 4):
                // values derived deterministically from the line's
                // adjustmentStep + THIS leaf's published potentials —
                // every fragment of a line applies identical values
                // for its own style. The controller measured with the
                // same products (measured == rendered).
                const treatment = leaves[leafIndex].treatment;
                if (treatment != null && line.adjustmentStep !== 0) {
                    const { axes, letterSpacingPt, wordSpaceFactor } =
                        treatmentValuesAtStep(
                            treatment.potentials,
                            {
                                treatments: new Set(
                                    this._composition.treatmentConfig.treatments,
                                ),
                                direction:
                                    this._composition.treatmentConfig.direction,
                            },
                            line.adjustmentStep,
                        );
                    if (letterSpacingPt !== 0)
                        span.style.setProperty(
                            "--line-letter-spacing",
                            `${letterSpacingPt}pt`,
                        );
                    if (wordSpaceFactor !== 0)
                        span.style.setProperty(
                            "--line-word-spacing",
                            `${wordSpaceFactor * treatment.spaceAdvancePt}pt`,
                        );
                    if (axes.size > 0)
                        // the run's own axes location with the treated
                        // axes at their step values (overrides the
                        // inherited font-variation-settings on this
                        // span only)
                        span.style.setProperty(
                            "font-variation-settings",
                            treatment.axesEntries
                                .map(
                                    ([tag, value]) =>
                                        `"${tag}" ${axes.has(tag) ? axes.get(tag) : value}`,
                                )
                                .join(","),
                        );
                }
                // Diagnostics color-coding (the varla-varfo hook):
                // EVERY line is coded by adjustment intensity —
                // narrowing cyan, widening red, neutral none (the
                // demo's _setLineColorCode); overfull overrides.
                // The colorCoding switch (the greedy-fit algorithm
                // struct) gates it; with the dummy/greedy-ragged
                // adjustmentStep is always 0 (all-neutral).
                span.style.setProperty(
                    "--line-color-code",
                    this._composition.colorCoding === true
                        ? this._lineColorCode(
                              line.adjustmentStep,
                              result.diagnostics.overfullLines.includes(
                                  lineIndex,
                              ),
                          )
                        : "",
                );
                span.append(
                    this._domTool.createTextNode(
                        mySegments
                            .map((segment) =>
                                this._text.slice(segment.start, segment.end),
                            )
                            .join(""),
                    ),
                );
                spans.push(span);
            });
        }
        return spans;
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
                          // A layout level setting (like showParameters
                          // in the editor); the document root is a direct
                          // child of the layout, hence its parent is the
                          // layouts root path.
                          [
                              this._layoutRootPath
                                  .append("verboseFontVariationSettings")
                                  .toString(),
                              "verboseFontVariationSettings",
                          ],
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
            const newWidgetWrappers = [];
            if (wrapResults.length === 0) {
                // content is re-rendered below from this._text (the
                // composed structure has multiple text nodes, there
                // is nothing to preserve)
                this._carrierSpan = null;
                this._swapNode(this._domTool.createTextNode(""));
                this._markWrappers = [];
            } else {
                this._createWrapperDOM(wrapResults);
                newWidgetWrappers.push(
                    ...this._createStylerWidgets(
                        typeSpecPropertiesPath,
                        wrapResults,
                    ),
                );
                this._carrierSpan = null;
                this._swapNode(
                    wrapResults.at(-1)[this.constructor._MARK_ELEMENT],
                );
                this._markWrappers = wrapResults;
            }
            this._renderContent();
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
        // The viewer's rootPath is "<layoutRoot>/document" (see its
        // relativeRootPath in the layout), hence its parent is the
        // layout root where layout level settings live (e.g.
        // verboseFontVariationSettings).
        this._layoutRootPath = widgetBus.rootPath.parent;
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
        this._rendererAttached = false;
    }

    initialUpdate(rootState) {
        // Attach HERE, not in the constructor. Parent containers run
        // ALL activation provisioning before updating their children:
        // when a state change both changes the document shape and
        // activates the viewer, constructor-time attachment sees the
        // meta tree from the PREVIOUS state (its update comes first in
        // the parent's _update loop, but after provisioning). A
        // shrinking replace then inserts stale /content/N attachments
        // against the NEW shorter collection and keyToIndex throws.
        // At initialUpdate time, widget ordering guarantees the
        // always-active DocumentNodesMeta has already updated/pruned.
        // No null fallback: without the meta the viewer renders
        // nothing indefinitely — fail loud.
        if (!this._rendererAttached) {
            const meta = this.widgetBus.getWidgetById(
                this._documentNodesMetaId,
            );
            meta.attachRenderer(this.__attachHandler);
            this._rendererAttached = true;
        }
        return super.initialUpdate(rootState);
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
            metaInfo.typeKey === "text"
                ? [
                      "text",
                      "marks",
                      // text-composition: the composed lines of the
                      // enclosing textblock (null = OFF MODE). The
                      // run's path is <textblock>/content/<index>.
                      [
                          `composition@${metaInfo.rootPath.parent.parent.toString()}`,
                          "composition@",
                      ],
                  ]
                : [
                      ["./attrs", "attrs"],
                      // text-composition: textblocks toggle the
                      // typeroof-composed class (nowrap) on their own
                      // composition@ entry (null = OFF MODE);
                      // non-textblock elements get null forever.
                      [
                          `composition@${metaInfo.rootPath.toString()}`,
                          "composition@",
                      ],
                  ],
            Constructor,
            // Injected by the meta node that initializes this
            // description: its own zones.
            require("raw:zones"),
            metaInfo,
            parentRendererNode,
            this._attachmentRegistry,
            proseMirrorDefaultSchemaSpec,
            this._originTypeSpecPath,
            this._layoutRootPath,
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
        if (this._rendererAttached) meta?.detachRenderer(this.__attachHandler);
        this._rendererAttached = false;
        this.__attachHandler = null;
        super.destroy();
    }
}
