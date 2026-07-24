// For the actual definitions look at
//      https://raw.githubusercontent.com/ProseMirror/prosemirror-schema-basic/refs/heads/master/src/schema-basic.ts
//      (import {schema} from "prosemirror-schema-basic")
// but us reduced to the bare minimum
// see also ./prosemirror-testing-schema.ts which is a copy of the above
import type {
    SchemaSpec,
    NodeSpec,
    MarkSpec,
    DOMOutputSpec,
    Node,
} from "prosemirror-model";

// These are the reserved/default nodes and marks, they won't be
// redefined by the application.

const brDOM: DOMOutputSpec = ["br"];

/// [Specs](#model.NodeSpec) for the nodes defined in this schema.
export const nodes = {
    /// NodeSpec The top level document node.
    doc: {
        content: "block+",
    } as NodeSpec,
    /// The text node.
    text: {
        group: "inline",
    } as NodeSpec,
    /// A hard line break, represented in the DOM as `<br>`.
    hard_break: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM() {
            return brDOM;
        },
    } as NodeSpec,

    // NOTE: companions for block and inline content exist below: unknown_block and unknown_inline.
    unknown: {
        attrs: { "unknown-type": { default: "???", validate: "string" } },
        content: "inline*",
        group: "block",
        // defining: true,
        // NOTE: ideally we would parse this as it's originally intended type,
        // but that is not possibly (nor does it make sense) at this point,
        // maybe later in TypeRoof we can detect this when syncing the document
        // case and transform it when putting it into the metamodel.
        parseDOM: [
            {
                tag: "div[data-unknown-type]>div",
                getAttrs(dom: HTMLElement) {
                    return {
                        "data-unknown-type":
                            dom.getAttribute("data-unknown-type"),
                    };
                },
            },
            0,
        ],
        toDOM(node: Node) {
            return [
                "div",
                { "data-unknown-type": node.attrs["unknown-type"] },
                [
                    "strong",
                    { class: "message" },
                    `UNKNOWN NODE-TYPE: ${node.attrs["unknown-type"]}`,
                ],
                ["div", 0],
            ];
        },
    } as NodeSpec,

    // Reserved catch-all for DOM subtrees the ingestion engine does
    // not (yet) traverse: keeps the raw HTML verbatim. No sanitization.
    raw_html_block: {
        atom: true,
        group: "block",
        attrs: { html: { default: "", validate: "string" } },
        parseDOM: [
            {
                tag: "div[data-raw-html-block]",
                getAttrs(dom: HTMLElement) {
                    return { html: dom.innerHTML };
                },
            },
        ],
        toDOM(node: Node) {
            // actual HTML injection, no sanitization (operator decision);
            // lime outline for quick identification
            const div = document.createElement("div");
            div.setAttribute("data-raw-html-block", "");
            div.style.outline = "2px solid lime";
            div.innerHTML = node.attrs.html;
            return div;
        },
    } as NodeSpec,

    // Inline variant of raw_html_block: catch-all in inline context
    // (e.g. link/meta/style inside paragraphs).
    raw_html_inline: {
        atom: true,
        group: "inline",
        inline: true,
        attrs: { html: { default: "", validate: "string" } },
        parseDOM: [
            {
                tag: "span[data-raw-html-inline]",
                getAttrs(dom: HTMLElement) {
                    return { html: dom.innerHTML };
                },
            },
        ],
        toDOM(node: Node) {
            const span = document.createElement("span");
            span.setAttribute("data-raw-html-inline", "");
            span.style.outline = "2px solid lime";
            span.innerHTML = node.attrs.html;
            return span;
        },
    } as NodeSpec,

    // Block companion to `unknown` (TODO above): unknown node types
    // whose content is block-level.
    unknown_block: {
        attrs: { "unknown-type": { default: "???", validate: "string" } },
        content: "block*",
        group: "block",
        parseDOM: [
            {
                tag: "div[data-unknown-block-type]",
                getAttrs(dom: HTMLElement) {
                    return {
                        "unknown-type": dom.getAttribute(
                            "data-unknown-block-type",
                        ),
                    };
                },
            },
        ],
        toDOM(node: Node) {
            return [
                "div",
                { "data-unknown-block-type": node.attrs["unknown-type"] },
                [
                    "strong",
                    { class: "message" },
                    `UNKNOWN BLOCK NODE-TYPE: ${node.attrs["unknown-type"]}`,
                ],
                ["div", 0],
            ];
        },
    } as NodeSpec,

    // Inline companion to `unknown`: HTML inline elements are not
    // necessarily marks; PM inline nodes carry them (nestable, with attrs).
    unknown_inline: {
        attrs: { "unknown-type": { default: "???", validate: "string" } },
        content: "inline*",
        group: "inline",
        inline: true,
        parseDOM: [
            {
                tag: "span[data-unknown-inline-type]",
                getAttrs(dom: HTMLElement) {
                    return {
                        "unknown-type": dom.getAttribute(
                            "data-unknown-inline-type",
                        ),
                    };
                },
            },
        ],
        toDOM(node: Node) {
            // unobtrusive: keeps text flow, identity via attribute/title
            return [
                "span",
                {
                    "data-unknown-inline-type": node.attrs["unknown-type"],
                    title: `UNKNOWN INLINE NODE-TYPE: ${node.attrs["unknown-type"]}`,
                },
                0,
            ];
        },
    } as NodeSpec,
};

export const marks = {
    "generic-style": {
        excludes: "_",
        attrs: { "data-style-name": { default: "", validate: "string" } },
        parseDOM: [
            {
                tag: "*[data-style-name]",
                getAttrs(dom: HTMLElement) {
                    return {
                        "data-style-name": dom.getAttribute("data-style-name"),
                    };
                },
            },
        ],
        toDOM(node) {
            return [
                "span",
                { "data-style-name": node.attrs["data-style-name"] },
                0,
            ];
        },
    } as MarkSpec,
};

export const schemaSpec = { nodes, marks } as SchemaSpec;
