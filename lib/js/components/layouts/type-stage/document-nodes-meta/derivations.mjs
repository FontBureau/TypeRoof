// Pure document-tree derivations of the DocumentNodesMeta layer
// (Phase 5a, delegation landing — extracted from the viewer;
// thoughts/plans/2026-09-05-2159-document-tree-walker-renderer-separation.md).
//
// Everything in this module is DOM-free: it derives *plans* and
// *descriptors* from the document model and the schema specs; renderers
// (today: the viewer) consume them and apply the DOM.
//
// The always-active DocumentNodesMeta widget tree lives in ./index.mjs;
// the derivations here are its foundation.

import { getEffectiveStyleLinks } from "../../../prosemirror/type-spec.typeroof.jsx";
import { getTypeSpecPropertiesIdMethod } from "../../../prosemirror/integration.typeroof.jsx";
import { readMetaModelJSONfromMap } from "../../../prosemirror/models.typeroof.jsx";
import { htmlAttrsBagToSpec } from "../../../prosemirror/html-attrs.ts";

import {
    INTENT_STYLE_LINKS,
    MARK_STYLE_LINKS,
} from "../../../registered-properties-definitions.mjs";

// Return true if it is block or false if it is inline.
// ProseNirror Model NodeType:
//      this.isBlock = !(spec.inline || name == "text")
// and:
//      get isInline() { return !this.isBlock }
export function getMMChildIsBlock(proseMirrorNodeSpec, mmNodeSpecMap, mmNode) {
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
        if (getMMChildIsBlock(proseMirrorNodeSpec, mmNodeSpecMap, grandChild))
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
export function specChildrenInInlineContext(inlineFlag, contentExpr) {
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
export function getRenderingAttrDirectives(hasAttr, attrs) {
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

// Resolve a typeKey that is neither in the metamodel schema
// (mmNodeSpecMap) nor in the default schema to one of the default
// schema's unknown_* node specs, classifying by the block/inline-ness
// of the node's children. Returns [pmTypeName, nodeSpec, unknownAttrs].
// Mirrors ProseMirror._rawCreateProseMirrorNode in
// prosemirror/integration.typeroof.jsx (see default-schema.ts for the
// specs handled here, e.g. hard_break, unknown, unknown_block,
// unknown_inline).
export function determineUnknownType(
    defaultSchemaNodes,
    mmNodeSpecMap,
    mmNode,
    inInlineContext,
) {
    const typeKey = mmNode.get("typeKey").value,
        childrenBlockType = {
            hasBlock: false,
            hasInline: false,
        };
    for (const mmChild of mmNode.get("content").value) {
        const block = getMMChildIsBlock(
            defaultSchemaNodes,
            mmNodeSpecMap,
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
            `unknown type "${typeKey}" has` +
                " mixed block/inline content; ProseMirror will likely throw.",
        );
    const [pmTypeName, unknownAttrs] = hasBlock
        ? ["unknown_block", { "data-unknown-block-type": typeKey }]
        : inInlineContext
          ? ["unknown_inline", { "data-unknown-inline-type": typeKey }]
          : ["unknown", { "data-unknown-type": typeKey }];
    return [pmTypeName, defaultSchemaNodes[pmTypeName], unknownAttrs];
}

// Compute the "reproducing" rendering directives (see
// getRenderingAttrDirectives) from the node's *current* attrs.
// Extracted from UIDocumentElement._getRenderingDirectives so both the
// initial rendering plan and the update diff use the exact same
// derivation.
export function getRenderingDirectives(
    current,
    nodeSpecMap,
    defaultSchemaSpec,
    context,
) {
    const typeKey = current.get("typeKey").value,
        attrs = readMetaModelJSONfromMap(current.get("attrs"), {});
    let hasAttr;
    if (nodeSpecMap.has(typeKey)) {
        const attributeSpecMap = nodeSpecMap.get(typeKey).get("attrs");
        hasAttr = (name) => attributeSpecMap.has(name);
    } else {
        const nodeSpec =
                typeKey in defaultSchemaSpec.nodes
                    ? defaultSchemaSpec.nodes[typeKey]
                    : determineUnknownType(
                          defaultSchemaSpec.nodes,
                          nodeSpecMap,
                          current,
                          context.inInlineContext,
                      )[1],
            attributeSpec = nodeSpec?.attrs || {};
        hasAttr = (name) => name in attributeSpec;
    }
    return getRenderingAttrDirectives(hasAttr, attrs);
}

// Pure derivation of an element node's rendering plan from the model
// and the schema specs — the (A) half of UIDocumentElement's
// constructor, extracted so the constructor only *applies* the plan
// and wires children. Returns:
//   {
//     typeKey,               // the node's own typeKey
//     hasTypeSpecStyling,    // typeSpec resolvable for this node type
//     tag,                   // element tag to create
//     attributes,            // htmlAttrs bag string|null (reproducing)
//     additionalAttrs,       // data-node-type or data-unknown-* attrs
//     innerHtml,             // verbatim html string|null (reproducing)
//     childrenInInlineContext,
//     pathOfTypes,           // root→this-node typeKeys
//     childrenContext,       // context to pass to the children walk
//   }
export function resolveElementRenderingPlan(
    current,
    nodeSpecMap,
    defaultSchemaSpec,
    context,
) {
    const typeKey = current.get("typeKey").value;
    let tag = "div"; // default
    let attributes = null;
    let innerHtml = null;
    // block-context default, like prosemirror/integration's default param
    let childrenInInlineContext = false;
    // known types get data-node-type; determineUnknownType overrides
    // this with the data-unknown-* attribute of the resolved type
    let additionalAttrs = { "data-node-type": typeKey };
    // ProseMirror parity: per-node typeSpec styling (the nodeViews in
    // integration) exists only for node types of the metamodel schema;
    // default-schema-only and unknown-resolved types get none.
    const hasTypeSpecStyling = nodeSpecMap.has(typeKey);

    if (nodeSpecMap.has(typeKey)) {
        // FIXME: must update when this.typeKey or nodeSpec[typeKey] changes!
        const nodeSpec = nodeSpecMap.get(typeKey),
            renderingDirectives = getRenderingDirectives(
                current,
                nodeSpecMap,
                defaultSchemaSpec,
                context,
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
        childrenInInlineContext = specChildrenInInlineContext(
            nodeSpec.get("inline").value,
            contentExpr.isEmpty ? null : contentExpr.value,
        );
    }
    // could be directly in defaultSchemaSpec.nodes
    else {
        // Mirrors ProseMirror._rawCreateProseMirrorNode in
        // prosemirror/integration.typeroof.jsx, but renders directly
        // from the raw specs; see default-schema.ts for the specs
        // handled here (e.g. hard_break, unknown, unknown_block,
        // unknown_inline).
        const attrs = readMetaModelJSONfromMap(current.get("attrs"), {}),
            [, /*pmTypeName*/ nodeSpec, unknownAttrs] =
                typeKey in defaultSchemaSpec.nodes
                    ? [typeKey, defaultSchemaSpec.nodes[typeKey], null]
                    : determineUnknownType(
                          defaultSchemaSpec.nodes,
                          nodeSpecMap,
                          current,
                          context.inInlineContext,
                      ),
            renderingDirectives = getRenderingDirectives(
                current,
                nodeSpecMap,
                defaultSchemaSpec,
                context,
            );

        if (unknownAttrs !== null) additionalAttrs = unknownAttrs;
        childrenInInlineContext = specChildrenInInlineContext(
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

    // pathOfTypes: the typeKeys from the document root node down to
    // (and including) this node's own typeKey. Passed down via context
    // so descendants don't have to walk up the model (a getEntry per
    // ancestor, i.e. O(depth^2) path walks per node per update) to
    // reconstruct it. Fresh instances are created whenever a typeKey
    // in the chain changes, as the node widget rebuilds its subtree in
    // that case, so this snapshot stays correct for the lifetime of
    // a renderer attachment.
    const pathOfTypes = [...(context.pathOfTypes ?? []), typeKey];

    const childrenContext = {
        ...context,
        inInlineContext: childrenInInlineContext,
        // the immediate parent element decides mark styling, mirroring
        // ProseMirror where marks attach only to subscribed nodeViews
        hasTypeSpecStyling,
        pathOfTypes,
    };

    return {
        typeKey,
        hasTypeSpecStyling,
        tag,
        attributes,
        additionalAttrs,
        innerHtml,
        childrenInInlineContext,
        pathOfTypes,
        childrenContext,
        // The node's own context (the input): renderer attachments
        // re-derive attr-driven directives against it.
        context,
    };
}

// Compute the attr-driven DOM diff between the last-applied state and
// the node's current attrs — the (A) half of
// UIDocumentElement._applyAttrDrivenDOMUpdates. Pure: returns what
// changed; the renderer decides how to apply it. `applied` is
// {attributes, innerHtml} (the renderer's memo state).
export function computeAttrDrivenDiff(applied, renderingDirectives) {
    const { innerHtml, attributes, htmlTag } = renderingDirectives,
        diff = {
            htmlTag,
            attributesChanged: false,
            attributes,
            removedAttrNames: [],
            innerHtmlChanged: false,
            innerHtml,
        };
    if (attributes !== applied.attributes) {
        diff.attributesChanged = true;
        // Remove attrs the old bag applied that the new bag doesn't
        // have anymore (applyHtmlAttrsBag only sets, it never removes).
        const newSpec = htmlAttrsBagToSpec(attributes || "");
        for (const name of Object.keys(
            htmlAttrsBagToSpec(applied.attributes || ""),
        ))
            if (!(name in newSpec)) diff.removedAttrNames.push(name);
    }
    if (innerHtml !== applied.innerHtml) diff.innerHtmlChanged = true;
    return diff;
}

// Compute the next sibling's typeSpecProperties id for resolving
// lineHeightAfter/emAfter margin units (extracted from
// UIDocumentElement._provisionTypeSpecStyler).
// TODO (parity edge case): this uses the sibling's original typeKey;
// when the sibling's type is unknown, ProseMirror resolves no per-node
// typeSpec for it. Fixing this requires resolving the sibling's
// effective type (cf. determineUnknownType) — parked for now.
export function resolveNextTypeSpecProperties(
    getTypeSpecPropertiesId,
    parentCollection,
    currentKey,
    pathOfTypes,
) {
    const currentIndex = parentCollection.indexOfKey(currentKey),
        nextIndex = currentIndex + 1;
    if (currentIndex < 0 || nextIndex >= parentCollection.size) return null;
    const nextKey = `${nextIndex}`,
        // same ancestors as this node, only the own typeKey differs
        nextPathOfTypes = [
            ...pathOfTypes.slice(0, -1),
            parentCollection.get(nextKey).get("typeKey").value,
        ];
    return getTypeSpecPropertiesId(nextPathOfTypes);
}

// Build the dependency mappings of a per-node typeSpec styler — the
// (A) half of UIDocumentElement._createTypeSpecStylerWrapper. The
// renderer binds the resulting wrapper to its DOM target.
// nodePropertiesId is the per-document-node registration id
// (nodeProperties@<documentNodePath>, produced by the meta node);
// payloads delegate to the root map until 5b installs real per-node
// scopes.
export function typeSpecStylerDependencyMappings(
    typeSpecProperties,
    nodePropertiesId,
    nextTypeSpecProperties = null,
    typeSpecPath = null,
) {
    const dependencyMappings = [
        [typeSpecProperties, "properties@"],
        [nodePropertiesId, "nodeProperties@"],
        ["/font", "rootFont"],
    ];
    // This "noStyler" dependency is not used by UIDocumentTypeSpecStyler,
    // but instead the provisioning logic reads it directly and uses this
    // dependency declaration to have _provisionWidgets re-evaluated when
    // the flag changes.
    if (typeSpecPath !== null)
        dependencyMappings.push([
            typeSpecPath.append("noStyler").toString(),
            "noStyler",
        ]);
    if (
        nextTypeSpecProperties !== null &&
        nextTypeSpecProperties !== typeSpecProperties
    )
        dependencyMappings.push([nextTypeSpecProperties, "nextProperties@"]);
    return dependencyMappings;
}

// Registration-id construction + registry membership check for
// styleLinkProperties@… (mark style-link resolution), extracted from
// UIDocumentTextRun._getStyleLinkPropertiesId.
export function getStyleLinkPropertiesId(
    widgetBus,
    typeSpecPropertiesPath,
    styleLinkType,
    styleLink,
) {
    const styleLinkPropertiesId = `styleLinkProperties@${typeSpecPropertiesPath.append(styleLinkType, styleLink)}`,
        protocolHandlerImplementation =
            widgetBus.getProtocolHandlerImplementation(
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

// The mark-descriptor pipeline: derive the wrapping structure of a
// text run from its marks — pure, no DOM. Moved verbatim (modulo the
// component `this` → explicit parameters) from
// UIDocumentTextRun._getWrapMarks. Descriptors look like:
//   { kind, tag, markType, styleLinkName, htmlAttributesBag,
//     styleLinkType, styleName }
// The renderer turns them into wrapper elements and styler widgets.
export function getWrapMarks(
    node,
    markSpec,
    defaultSchemaSpec,
    context,
    widgetBus,
    typeSpecPropertiesPath,
) {
    const marksList = node.get("marks"),
        typeSpecProperties = `typeSpecProperties@${typeSpecPropertiesPath}`,
        result = [];
    let intentStyleLinks = null,
        markStyleLinks = null,
        kind = null,
        styleLinkName = null,
        styleLinkType = null,
        styleName = null;
    // ProseMirror parity: when the enclosing node has no associated
    // typeSpec, style links are not resolved — marks render with their
    // plain spec-derived tag and attributes, and receive no styler.
    const applyStyleLinks = context.hasTypeSpecStyling !== false;

    const getEffectiveLinks = (prefix) =>
        getEffectiveStyleLinks(widgetBus, typeSpecProperties, prefix);

    // build from inside out:
    for (const mark of marksList.value.toReversed()) {
        const markType = mark.get("typeKey").value,
            attrs = readMetaModelJSONfromMap(mark.get("attrs"), {});
        let tag = "span",
            htmlAttributes = false;

        if (markType === "generic-style") {
            kind = "intent";
            htmlAttributes =
                "htmlAttrs" in defaultSchemaSpec.marks["generic-style"];
            // intent style ...
            styleLinkName = attrs["data-style-name"] || null;
            styleLinkType = "intentStyleLinks";
            if (applyStyleLinks) {
                if (intentStyleLinks === null)
                    intentStyleLinks = getEffectiveLinks(INTENT_STYLE_LINKS);
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
        } else if (markType in defaultSchemaSpec.marks) {
            kind = "native";
            const pmMarkSpec = defaultSchemaSpec.marks[markType];
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
                    markStyleLinks = getEffectiveLinks(MARK_STYLE_LINKS);
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

// Pure descriptor comparison, moved from
// UIDocumentTextRun._wrapResultsAreEqual.
export function wrapResultsAreEqual(wrapResultsA, wrapResultsB) {
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

// The typeSpec-properties id resolver, re-exported for the meta
// layer's consumers (single source of truth is
// prosemirror/integration.typeroof.jsx).
export { getTypeSpecPropertiesIdMethod };
