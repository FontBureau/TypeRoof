import type { SchemaSpec, NodeSpec, DOMOutputSpec } from "prosemirror-model";
import { schemaSpec as defaultSchemaSpec } from "./default-schema";

const pDOM: DOMOutputSpec = ["p", 0];

export const nodes = {
    doc: defaultSchemaSpec.nodes.doc,
    text: defaultSchemaSpec.nodes.text,
    hard_break: defaultSchemaSpec.nodes.hard_break,
    /// A plain paragraph textblock. Represented in the DOM
    /// as a `<p>` element.
    paragraph: {
        content: "inline*",
        group: "block",
        parseDOM: [{ tag: "p" }],
        toDOM() {
            return pDOM;
        },
    } as NodeSpec,
};

export const marks = {};

export const schemaSpec = { nodes, marks } as SchemaSpec;
