import type { SchemaSpec, NodeSpec, DOMOutputSpec } from "prosemirror-model";
import { schemaSpec as defaultSchemaSpec } from "./default-schema";

const pDOM: DOMOutputSpec = ["p", 0];

const defaultSchemaSpecNodes = defaultSchemaSpec.nodes as {
    [key: string]: NodeSpec;
};

export const nodes = {
    doc: defaultSchemaSpecNodes.doc,
    text: defaultSchemaSpecNodes.text,
    hard_break: defaultSchemaSpecNodes.hard_break,
    /// A plain paragraph textblock. Represented in the DOM
    /// as a <p> element.
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
