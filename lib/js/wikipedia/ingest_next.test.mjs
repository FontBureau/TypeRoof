// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { ingestWikipediaDocument } from "./ingest_next";
import { fromMetaModelJSON } from "../components/prosemirror/models.typeroof.jsx";

const parse = (html) =>
    new DOMParser().parseFromString(
        `<!doctype html><html><body>${html}</body></html>`,
        "text/html",
    );

const kids = (node) => Array.from(node.get("content"), ([, c]) => c);
const typeKey = (n) => n.get("typeKey").value;
const textValue = (n) => n.get("text").value;
const marksOf = (n) =>
    Array.from(n.get("marks"), ([, m]) => [
        m.get("typeKey").value,
        fromMetaModelJSON(m.get("attrs").get("data-style-name")),
    ]);

describe("ingestWikipediaDocument", () => {
    it("maps known blocks and marks", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<p>Hello <b>World</b></p><h2>Title</h2>`),
        );
        expect(typeKey(document)).toBe("doc");
        const [p, h2] = kids(document);
        expect(typeKey(p)).toBe("paragraph");
        expect(typeKey(h2)).toBe("heading-2");
        const [t1, t2] = kids(p);
        expect(textValue(t1)).toBe("Hello ");
        expect(marksOf(t1)).toEqual([]);
        expect(textValue(t2)).toBe("World");
        expect(marksOf(t2)).toEqual([["generic-style", "bold"]]);
        expect(report.markSets).toEqual({ "[]": 2, "[bold]": 1 });
    });

    it("normalizes mark sets (sorted, deduplicated)", () => {
        const { report } = ingestWikipediaDocument(
            parse(`<p><i><b>x</b></i> <strong><em>y</em></strong></p>`),
        );
        expect(report.markSets["[bold, italic]"]).toBe(2);
    });

    it("prunes unknown blocks into raw_html_block with outerHTML", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<table class="t"><tr><td>cell</td></tr></table>`),
        );
        const [node] = kids(document);
        expect(typeKey(node)).toBe("raw_html_block");
        const html = fromMetaModelJSON(node.get("attrs").get("html"));
        expect(html).toContain("<table");
        expect(html).toContain("cell");
        expect(report.catchAllBlocks).toEqual({ TABLE: 1 });
    });

    it("emits inline elements as inline nodes, keeps marks inside", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<p>fn<sup><a href="#cite">1</a></sup></p>`),
        );
        const [p] = kids(document);
        const [fn, sup] = kids(p);
        expect(textValue(fn)).toBe("fn");
        expect(typeKey(sup)).toBe("sup");
        const [one] = kids(sup);
        expect(textValue(one)).toBe("1");
        expect(marksOf(one)).toEqual([["generic-style", "link"]]);
        expect(report.inlineNodes).toEqual({ SUP: 1 });
        expect(report.skippedMarkAttrs).toEqual({ "a.href": 1 });
        expect(report.markSets["[link]"]).toBe(1);
    });

    it("maps BR to hard_break", () => {
        const { document } = ingestWikipediaDocument(parse(`<p>a<br>b</p>`));
        const [p] = kids(document);
        expect(kids(p).map(typeKey)).toEqual(["text", "hard_break", "text"]);
    });

    it("skips empty/whitespace text nodes and counts them", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<p>a</p>\n\n<p>b</p>`),
        );
        expect(kids(document).map(typeKey)).toEqual(["paragraph", "paragraph"]);
        expect(report.skippedEmptyTexts).toBeGreaterThan(0);
        for (const p of kids(document))
            for (const t of kids(p)) expect(textValue(t).trim()).not.toBe("");
    });

    it("transparent containers pass children through (option)", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<div><p>inside</p></div>`),
            { transparentContainers: ["div"] },
        );
        expect(kids(document).map(typeKey)).toEqual(["paragraph"]);
        expect(report.catchAllBlocks).toEqual({});
    });

    it("catch-all in inline context emits raw_html_inline", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<p>a<link rel="mw:PageProp"><style>.c{}</style>b</p>`),
        );
        const [p] = kids(document);
        expect(kids(p).map(typeKey)).toEqual([
            "text",
            "raw_html_inline",
            "raw_html_inline",
            "text",
        ]);
        expect(report.catchAllInline).toEqual({ LINK: 1, STYLE: 1 });
        expect(report.catchAllBlocks).toEqual({});
    });

    it("without the option, div goes to the catch-all", () => {
        const { report } = ingestWikipediaDocument(parse(`<div><p>x</p></div>`));
        expect(report.catchAllBlocks).toEqual({ DIV: 1 });
    });

    it("section children are blocks only: inline content becomes raw_html_block", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(
                `<section><p>para</p><span>inline span</span>stray` +
                    `<div>hat</div><b>bold</b><br></section>`,
            ),
        );
        const [section] = kids(document);
        expect(typeKey(section)).toBe("section");
        expect(kids(section).map(typeKey)).toEqual([
            "paragraph", // <p> stays structured
            "raw_html_block", // <span> in block context
            "paragraph", // stray text wrapped
            "raw_html_block", // <div>
            "raw_html_block", // <b> in block context
            "raw_html_block", // <br> in block context
        ]);
        // the wrapped stray text kept its content
        const wrapped = kids(section)[2];
        const [wrappedText] = kids(wrapped);
        expect(textValue(wrappedText)).toBe("stray");
        expect(report.wrappedStrayTexts).toBe(1);
        expect(report.catchAllBlocks).toEqual({
            SPAN: 1,
            DIV: 1,
            B: 1,
            BR: 1,
        });
        // nothing leaked into the inline counters
        expect(report.inlineNodes).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });

    it("patches mw-empty-elt elements through as atoms, preserving metadata", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(
                `<section>` +
                    `<span class="mw-empty-elt"><link rel="mw:PageProp/Category" href="./Category:X"></span>` +
                    `<p class="mw-empty-elt" id="mwCQ"><meta typeof="mw:Extension/indicator"></p>` +
                    `<p>real <span class="mw-empty-elt"><style>.x{}</style></span></p>` +
                    `</section>`,
            ),
        );
        const [section] = kids(document);
        const [spanAtom, pAtom, para] = kids(section);
        // block context: both become raw_html_block atoms — even the <p>,
        // the mw-empty-elt branch precedes the known-block dispatch
        expect(typeKey(spanAtom)).toBe("raw_html_block");
        expect(typeKey(pAtom)).toBe("raw_html_block");
        expect(fromMetaModelJSON(pAtom.get("attrs").get("html"))).toContain(
            `<meta typeof="mw:Extension/indicator">`,
        );
        // inline context: the mw-empty-elt inside the real paragraph
        // becomes a raw_html_inline atom
        expect(typeKey(para)).toBe("paragraph");
        expect(kids(para).map(typeKey)).toEqual(["text", "raw_html_inline"]);
        const inlineHtml = fromMetaModelJSON(
            kids(para)[1].get("attrs").get("html"),
        );
        expect(inlineHtml).toContain("<style>");
        expect(report.mwEmptyElts).toEqual({ SPAN: 2, P: 1 });
        // nothing inside mw-empty-elt reached the catch-all
        expect(report.catchAllBlocks).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });
});
