// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { toggleMark } from "./commands.ts";

const schema = new Schema({
    nodes: {
        doc: { content: "paragraph+" },
        paragraph: { content: "text*", group: "block" },
        text: { group: "inline" },
    },
    marks: {
        strong: {},
        styled: { attrs: { "data-style-name": { default: "" } } },
    },
});

function createState(text = "hello") {
    const doc = schema.node("doc", null, [
        schema.node("paragraph", null, schema.text(text)),
    ]);
    let state = EditorState.create({ schema, doc });
    return state.apply(
        state.tr.setSelection(
            TextSelection.create(state.doc, 1, 1 + text.length),
        ),
    );
}

function applyCommand(state, command) {
    let dispatched = null;
    const applicable = command(state, (tr) => {
        dispatched = tr;
    });
    return [applicable, dispatched === null ? state : state.apply(dispatched)];
}

const textMarks = (state) => state.doc.child(0).child(0).marks;

describe("toggleMark (vendored, attr-aware)", () => {
    it("toggles an attr-less mark on AND off (attrs=null regression)", () => {
        const [applied, marked] = applyCommand(
            createState(),
            toggleMark(schema.marks.strong),
        );
        expect(applied).toBe(true);
        expect(textMarks(marked).map((mark) => mark.type.name)).toEqual([
            "strong",
        ]);
        // mark.attrs is {} but the command attrs are null; presence of the
        // mark type must be enough to remove it again (upstream semantics).
        const [, unmarked] = applyCommand(
            marked,
            toggleMark(schema.marks.strong),
        );
        expect(textMarks(unmarked).length).toBe(0);
    });

    it("toggles off when attrs match, switches attrs in one invocation", () => {
        const styled = schema.marks.styled,
            bold = { "data-style-name": "bold" },
            italic = { "data-style-name": "italic" };

        const [, markedBold] = applyCommand(
            createState(),
            toggleMark(styled, bold),
        );
        expect(textMarks(markedBold)[0].attrs["data-style-name"]).toBe("bold");

        // same attrs -> remove
        const [, off] = applyCommand(markedBold, toggleMark(styled, bold));
        expect(textMarks(off).length).toBe(0);

        // different attrs -> switch in a single invocation
        const [, boldAgain] = applyCommand(
            createState(),
            toggleMark(styled, bold),
        );
        const [, switched] = applyCommand(
            boldAgain,
            toggleMark(styled, italic),
        );
        expect(textMarks(switched).length).toBe(1);
        expect(textMarks(switched)[0].attrs["data-style-name"]).toBe("italic");
    });
});
