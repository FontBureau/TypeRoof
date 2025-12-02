// For the actual definitions look at
//      https://raw.githubusercontent.com/ProseMirror/prosemirror-schema-basic/refs/heads/master/src/schema-basic.ts
//      (import {schema} from "prosemirror-schema-basic")
// but us reduced to the bare minimum
// see also ./prosemirror-testing-schema.ts which is a copy of the above
import {SchemaSpec, NodeSpec, MarkSpec, DOMOutputSpec} from "prosemirror-model"

// These are the reserved/default nodes and marks, they won't be
// redefined by the application.

const brDOM: DOMOutputSpec = ["br"];

/// [Specs](#model.NodeSpec) for the nodes defined in this schema.
export const nodes = {
  /// NodeSpec The top level document node.
  doc: {
    content: "block+"
  } as NodeSpec,
  /// The text node.
  text: {
    group: "inline"
  } as NodeSpec,
  /// A hard line break, represented in the DOM as `<br>`.
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{tag: "br"}],
    toDOM() { return brDOM }
  } as NodeSpec,

  // TODO: may require a unknonw-type than can contain block children as well.
  unknown: {
    attrs: {"unknown-type": {default: "???", validate: 'string'}},
    content: "inline*",
    group: "block",
    // defining: true,
    // NOTE: ideally we would parse this as it's originally intended type,
    // but that is not possibly (nor does it make sense) at this point,
    // maybe later in TypeRoof we can detect this when syncing the document
    // case and transform it when putting it into the metamodel.
    parseDOM: [{tag: "div[data-unknown-type]>div", getAttrs(dom: HTMLElement) {
         return {"data-unknown-type": dom.getAttribute("data-unknown-type")};
    }}, 0],
    toDOM(node) { return ["div", {"data-unknown-type": node.attrs["unknown-type"]},
            ['strong', {"class": "message"}, `UNKNOWN NODE-TYPE: ${node.attrs["unknown-type"]}`],
            ['div', 0]] }
  }
}

export const marks = {
  'generic-style': {
    excludes: "_",
    attrs: {"data-style-name": {default: "", validate: 'string'}},
    parseDOM: [
      {
        tag: "*[data-style-name]",
        getAttrs(dom: HTMLElement) {
          return {"data-style-name": dom.getAttribute("data-style-name")};
        }
      }
    ],
    toDOM(node) {return ["span", {"data-style-name": node.attrs["data-style-name"]}, 0] }
  } as MarkSpec,
}

export const schemaSpec = {nodes, marks} as SchemaSpec;


