// For the actual definitions look at
//      https://raw.githubusercontent.com/ProseMirror/prosemirror-schema-basic/refs/heads/master/src/schema-basic.ts
//      (import {schema} from "prosemirror-schema-basic")
// but us reduced to the bare minimum
// see also ./prosemirror-testing-schema.ts which is a copy of the above
import {SchemaSpec, NodeSpec, DOMOutputSpec} from "prosemirror-model"

// These are the reserved/default nodes and marks, they won't be
// re-defined by the application.

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
  } as NodeSpec
}

export const marks = {

}

export const schemaSpec = {nodes, marks} as SchemaSpec;


