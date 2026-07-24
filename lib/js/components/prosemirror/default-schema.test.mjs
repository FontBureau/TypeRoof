// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { schemaSpec } from "./default-schema";

const schema = new Schema(schemaSpec);

describe("default-schema reserved nodes", () => {
    it("creates the schema with all reserved nodes and marks", () => {
        for (const name of [
            "doc",
            "text",
            "hard_break",
            "unknown",
            "unknown_block",
            "unknown_inline",
            "raw_html_block",
        ])
            expect(name in schema.nodes).toBe(true);
        expect("generic-style" in schema.marks).toBe(true);
    });

    it("unknown_block accepts block children and check() passes", () => {
        const inner = schema.node(
            "unknown",
            { "unknown-type": "x" },
            schema.text("hi"),
        );
        const node = schema.node(
            "unknown_block",
            { "unknown-type": "table" },
            inner,
        );
        expect(node.isBlock).toBe(true);
        expect(() => node.check()).not.toThrow();
    });

    it("unknown rejects block children", () => {
        const block = schema.node("unknown_block", { "unknown-type": "b" });
        expect(() =>
            schema.node("unknown", { "unknown-type": "x" }, block),
        ).toThrow();
    });

    it("raw_html_block is an atom leaf carrying the html attr", () => {
        const html = "<table><tr><td>cell</td></tr></table>";
        const node = schema.node("raw_html_block", { html });
        expect(node.isAtom).toBe(true);
        expect(node.isBlock).toBe(true);
        expect(node.attrs.html).toBe(html);
    });

    it("raw_html_block toDOM injects innerHTML and sets the lime outline", () => {
        const html = "<aside>raw</aside>";
        const node = schema.node("raw_html_block", { html });
        const dom = schema.nodes.raw_html_block.spec.toDOM(node);
        expect(dom.getAttribute("data-raw-html-block")).not.toBe(null);
        expect(dom.style.cssText).toContain("2px");
        expect(dom.style.cssText).toContain("lime");
        expect(dom.innerHTML).toBe(html);
    });

    it("unknown_block toDOM shows the UNKNOWN BLOCK NODE-TYPE message", () => {
        const node = schema.node("unknown_block", { "unknown-type": "table" });
        const spec = schema.nodes.unknown_block.spec.toDOM(node);
        expect(spec[0]).toBe("div");
        expect(spec[1]["data-unknown-block-type"]).toBe("table");
        expect(spec[2][2]).toContain("UNKNOWN BLOCK NODE-TYPE: table");
    });

    it("unknown_inline is inline, accepts inline content, rejects blocks", () => {
        const node = schema.node(
            "unknown_inline",
            { "unknown-type": "sup" },
            schema.text("1"),
        );
        expect(node.isInline).toBe(true);
        expect(() => node.check()).not.toThrow();
        const block = schema.node(
            "unknown",
            { "unknown-type": "x" },
            schema.text("t"),
        );
        expect(() =>
            schema.node("unknown_inline", { "unknown-type": "sup" }, block),
        ).toThrow();
    });
});
