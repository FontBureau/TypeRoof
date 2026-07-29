// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    ingestDOM,
    ingestWikipediaDocument,
    semanticMarksFromSchema,
} from "./ingest_next";
import {
    fromMetaModelJSON,
    ProseMirrorSchemaModel,
} from "../components/prosemirror/models.typeroof.jsx";
import {
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../metamodel.mjs";
import wikipediaInitialState from "./type-stage-wikipedia-initial-state.json";

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

describe("ingestDOM", () => {
    it("passes children of transparentContainers through", () => {
        const { document } = ingestDOM(parse(`<div><p>inside</p></div>`), {
            transparentContainers: ["div"],
        });
        const [paragraph] = kids(document);
        expect(typeKey(paragraph)).toBe("paragraph");
    });

    it("maps known blocks and marks", () => {
        const { document, report } = ingestDOM(
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
        const { report } = ingestDOM(
            parse(`<p><i><b>x</b></i> <strong><em>y</em></strong></p>`),
        );
        expect(report.markSets["[bold, italic]"]).toBe(2);
    });

    it("prunes unknown blocks into raw_html_block with outerHTML", () => {
        const { document, report } = ingestDOM(
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
        const { document, report } = ingestDOM(
            parse(`<p>fn<sup><a href="#cite">1</a></sup></p>`),
        );
        const [p] = kids(document);
        const [fn, sup] = kids(p);
        expect(textValue(fn)).toBe("fn");
        expect(typeKey(sup)).toBe("sup");
        const [one] = kids(sup);
        expect(textValue(one)).toBe("1");
        expect(marksOf(one)).toEqual([["generic-style", "link"]]);
        const [[, markAttrs]] = allMarksOf(one);
        expect(JSON.parse(markAttrs.htmlAttrs)).toEqual([["href", "#cite"]]);
        expect(report.inlineNodes).toEqual({ SUP: 1 });
        expect(report.skippedMarkAttrs).toEqual({});
        expect(report.markSets["[link]"]).toBe(1);
    });

    it("maps BR to hard_break", () => {
        const { document } = ingestDOM(parse(`<p>a<br>b</p>`));
        const [p] = kids(document);
        expect(kids(p).map(typeKey)).toEqual(["text", "hard_break", "text"]);
    });

    it("skips empty/whitespace text nodes and counts them", () => {
        const { document, report } = ingestDOM(
            parse(`<p>a</p>\n\n<p>b</p>`),
        );
        expect(kids(document).map(typeKey)).toEqual(["paragraph", "paragraph"]);
        expect(report.skippedEmptyTexts).toBeGreaterThan(0);
        for (const p of kids(document))
            for (const t of kids(p)) expect(textValue(t).trim()).not.toBe("");
    });

    it("transparent containers pass children through (option)", () => {
        const { document, report } = ingestDOM(
            parse(`<div><p>inside</p></div>`),
            { transparentContainers: ["div"] },
        );
        expect(kids(document).map(typeKey)).toEqual(["paragraph"]);
        expect(report.catchAllBlocks).toEqual({});
    });

    it("catch-all in inline context emits raw_html_inline", () => {
        const { document, report } = ingestDOM(
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
        const { report } = ingestDOM(parse(`<div><p>x</p></div>`));
        expect(report.catchAllBlocks).toEqual({ DIV: 1 });
    });

    it("section children are blocks only: inline content becomes raw_html_block", () => {
        const { document, report } = ingestDOM(
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
        const { document, report } = ingestDOM(
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

function createSchemaModel() {
    const draft = ProseMirrorSchemaModel.createPrimalDraft({}),
        marksDraft = draft.get("marks"),
        strongDraft = marksDraft.constructor.Model.createPrimalDraft({}),
        linkDraft = marksDraft.constructor.Model.createPrimalDraft({}),
        hrefDraft = linkDraft
            .get("attrs")
            .constructor.Model.createPrimalDraft({}),
        taglessDraft = marksDraft.constructor.Model.createPrimalDraft({});
    strongDraft.get("tag").value = "strong";
    marksDraft.set("strong", strongDraft);
    linkDraft.get("tag").value = "a";
    hrefDraft.get("default").value = "";
    hrefDraft.get("validate").get("type").value = "string";
    linkDraft.get("attrs").set("href", hrefDraft);
    marksDraft.set("link", linkDraft);
    // a mark without a tag is not reachable by ingest
    marksDraft.set("tagless", taglessDraft);
    return draft.metamorphose();
}

const allMarksOf = (node) =>
    Array.from(node.get("marks"), ([, mark]) => [
        mark.get("typeKey").value,
        Object.fromEntries(
            Array.from(mark.get("attrs"), ([key, value]) => [
                key,
                fromMetaModelJSON(value),
            ]),
        ),
    ]);

describe("ingestWikipediaDocument semantic marks", () => {
    it("emits schema marks for tags the schema defines, harvesting declared attrs", () => {
        const { document, report } = ingestDOM(
            parse(
                `<p>Hello <strong>World</strong> and <a href="https://example.com" rel="mw:ExtLink">a link</a></p>`,
            ),
            { proseMirrorSchema: createSchemaModel() },
        );
        const [paragraph] = kids(document);
        const [t1, t2, t3, t4] = kids(paragraph);
        expect(textValue(t1)).toBe("Hello ");
        expect(allMarksOf(t1)).toEqual([]);
        expect(textValue(t2)).toBe("World");
        expect(allMarksOf(t2)).toEqual([["strong", {}]]);
        expect(textValue(t3)).toBe(" and ");
        expect(allMarksOf(t3)).toEqual([]);
        expect(textValue(t4)).toBe("a link");
        const [[, linkAttrs]] = allMarksOf(t4);
        expect(linkAttrs.href).toBe("https://example.com");
        // href typed (declared) AND in the bag (duplication accepted);
        // rel is collected, nothing is policy-excluded
        expect(JSON.parse(linkAttrs.htmlAttrs)).toEqual([
            ["href", "https://example.com"],
            ["rel", "mw:ExtLink"],
        ]);
        expect(report.skippedMarkAttrs).toEqual({});
        expect(report.markSets).toEqual({
            "[]": 2,
            "[strong]": 1,
            "[link]": 1,
        });
    });

    it("falls back to generic-style when no schema is given", () => {
        const { document, report } = ingestDOM(
            parse(`<p><strong>World</strong></p>`),
        );
        const [paragraph] = kids(document);
        const [text] = kids(paragraph);
        expect(marksOf(text)).toEqual([["generic-style", "bold"]]);
        expect(report.markSets).toEqual({ "[bold]": 1 });
    });
});

describe("markEmission rules", () => {
    it("emits an explicitly mapped schema mark for a tag (<b> -> strong)", () => {
        const { document, report } = ingestDOM(
            parse(`<p>a <b>bold</b> move</p>`),
            {
                proseMirrorSchema: createSchemaModel(),
                markEmission: [
                    { selector: "b", rule: { kind: "mark", name: "strong" } },
                ],
            },
        );
        const [paragraph] = kids(document);
        const [t1, t2, t3] = kids(paragraph);
        expect(allMarksOf(t1)).toEqual([]);
        expect(allMarksOf(t2)).toEqual([["strong", {}]]);
        expect(allMarksOf(t3)).toEqual([]);
        expect(report.unresolvedMarkRules).toEqual({});
    });

    it("falls back to intent when the rule names a mark not in the schema", () => {
        const { document, report } = ingestDOM(
            parse(`<p>a <b>bold</b></p>`),
            {
                proseMirrorSchema: createSchemaModel(),
                markEmission: [
                    { selector: "b", rule: { kind: "mark", name: "nosuchmark" } },
                ],
            },
        );
        const [paragraph] = kids(document);
        const [, text] = kids(paragraph);
        expect(marksOf(text)).toEqual([["generic-style", "nosuchmark"]]);
        expect(report.unresolvedMarkRules).toEqual({ nosuchmark: 1 });
    });

    it("first matching selector wins (context-aware selectors)", () => {
        const { document } = ingestDOM(
            parse(
                `<p><a href="https://a.example" rel="mw:ExtLink">ext</a> <a href="https://b.example">int</a></p>`,
            ),
            {
                proseMirrorSchema: createSchemaModel(),
                markEmission: [
                    {
                        selector: "a[rel]",
                        rule: { kind: "generic", styleName: "external-link" },
                    },
                    { selector: "a", rule: { kind: "mark", name: "link" } },
                ],
            },
        );
        const [paragraph] = kids(document);
        // the whitespace-only text between the anchors is skipped
        const [t1, t2] = kids(paragraph);
        // a[rel] matches first: intent, not the link mark
        expect(marksOf(t1)).toEqual([["generic-style", "external-link"]]);
        // plain a falls through to the second rule: link mark + href
        const [[, linkAttrs2]] = allMarksOf(t2);
        expect(linkAttrs2.href).toBe("https://b.example");
        expect(JSON.parse(linkAttrs2.htmlAttrs)).toEqual([
            ["href", "https://b.example"],
        ]);
    });

    it("a generic rule wins over schema derivation", () => {
        const { document } = ingestDOM(
            parse(`<p><strong>bold</strong> <em>italic</em></p>`),
            {
                proseMirrorSchema: createSchemaModel(),
                markEmission: [
                    {
                        selector: "strong",
                        rule: { kind: "generic", styleName: "bold" },
                    },
                ],
            },
        );
        const [paragraph] = kids(document);
        const [t1, t2] = kids(paragraph);
        // rule beats the schema-defined strong mark
        expect(marksOf(t1)).toEqual([["generic-style", "bold"]]);
        // em is not overridden and has no schema mark: intent
        expect(marksOf(t2)).toEqual([["generic-style", "italic"]]);
    });
});

describe("ingestWikipediaDocument (configured variant)", () => {
    it("emits <b>/<strong> as strong marks and <i>/<em> as italic intent", () => {
        const { document } = ingestWikipediaDocument(
                parse(`<p>a <b>bold</b> and <i>italic</i> word</p>`),
                createSchemaModel(),
            ),
            [paragraph] = kids(document),
            [t1, t2, t3, t4, t5] = kids(paragraph);
        expect(allMarksOf(t1)).toEqual([]);
        expect(allMarksOf(t2)).toEqual([["strong", {}]]);
        expect(allMarksOf(t3)).toEqual([]);
        expect(marksOf(t4)).toEqual([["generic-style", "italic"]]);
        expect(allMarksOf(t5)).toEqual([]);
    });

});

describe("nodeEmission routing", () => {
    function createCitationSchemaModel() {
        const draft = ProseMirrorSchemaModel.createPrimalDraft({}),
            nodesDraft = draft.get("nodes"),
            citeLinkDraft = nodesDraft.constructor.Model.createPrimalDraft({});
        citeLinkDraft.get("tag").value = "sup";
        citeLinkDraft.get("selector").value = 'sup[typeof="mw:Extension/ref"]';
        citeLinkDraft.get("inline").value = true;
        citeLinkDraft.get("group").value = "inline";
        citeLinkDraft.get("atom").value = true;
        nodesDraft.set("cite-link", citeLinkDraft);
        return draft.metamorphose();
    }

    it("first matching entry claims the element; fallbacks are declarable", () => {
        const { document, report } = ingestDOM(
            parse(
                `<p><sup typeof="mw:Extension/ref"><a href="#cite1">1</a></sup><sup>x</sup></p>`,
            ),
            {
                nodeEmission: [
                    {
                        selector: 'sup[typeof="mw:Extension/ref"]',
                        typeKey: "cite-link",
                    },
                    { selector: "sup", typeKey: "other-sup" },
                ],
            },
        );
        const [paragraph] = kids(document);
        const [cite, other] = kids(paragraph);
        expect(typeKey(cite)).toBe("cite-link");
        expect(fromMetaModelJSON(cite.get("attrs").get("html"))).toBe(
            '<a href="#cite1">1</a>',
        );
        expect(typeKey(other)).toBe("other-sup");
        expect(report.reproNodes).toEqual({ "cite-link": 1, "other-sup": 1 });
    });

    it("schema-derived selector claims the element (no list entry)", () => {
        const { document } = ingestDOM(
            parse(
                `<p><sup typeof="mw:Extension/ref"><a href="#cite1">1</a></sup></p>`,
            ),
            { proseMirrorSchema: createCitationSchemaModel() },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(typeKey(cite)).toBe("cite-link");
    });

    it("selector mismatch falls through to the existing inline-node chain", () => {
        const { document } = ingestDOM(parse(`<p><sup>plain</sup></p>`), {
            proseMirrorSchema: createCitationSchemaModel(),
        });
        const [paragraph] = kids(document);
        const [sup] = kids(paragraph);
        expect(typeKey(sup)).toBe("sup");
    });

    it("tag-only specs do not hijack known blocks", () => {
        const { document } = ingestDOM(parse(`<p>Hello</p>`), {
            proseMirrorSchema: createCitationSchemaModel(),
        });
        const [paragraph] = kids(document);
        expect(typeKey(paragraph)).toBe("paragraph");
    });
});

describe("htmlAttrs collection policy", () => {
    const ingestSup = (html, attrPolicy) =>
        ingestDOM(parse(`<p>${html}</p>`), {
            attrPolicy,
            nodeEmission: [{ selector: "sup", typeKey: "cite-link" }],
        });

    const htmlAttrsOf = (node) =>
        fromMetaModelJSON(node.get("attrs").get("htmlAttrs"));

    it("conjunctive: collects everything not excluded (default include)", () => {
        const { document } = ingestSup(
            `<sup typeof="mw:Extension/ref" style="color:red" onclick="x()" id="mw-abc"><a href="#c">1</a></sup>`,
            {
                exclude: [
                    "style",
                    /^on/,
                    "data-node-type",
                    "data-mark-type",
                    "data-style-name",
                ],
            },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        // style and onclick excluded; typeof and id collected
        expect(htmlAttrsOf(cite)).toBe(
            JSON.stringify([
                ["typeof", "mw:Extension/ref"],
                ["id", "mw-abc"],
            ]),
        );
    });

    it("exclude wins on overlap (conjunctive, not include-wins)", () => {
        const { document } = ingestSup(
            `<sup typeof="mw:Extension/ref" class="ref" style="color:red"><a href="#c">1</a></sup>`,
            { include: ["typeof", "class"], exclude: ["typeof"] },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(htmlAttrsOf(cite)).toBe(JSON.stringify([["class", "ref"]]));
    });

    it("include: [] rejects all (kill-switch)", () => {
        const { document } = ingestSup(
            `<sup typeof="mw:Extension/ref"><a href="#c">1</a></sup>`,
            { include: [] },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(htmlAttrsOf(cite)).toBe("");
    });

    it("[name, value] pair matchers match name AND value", () => {
        const { document } = ingestSup(
            `<sup id="mw-abc" typeof="mw:Extension/ref" class="ref"><a href="#c">1</a></sup>`,
            { include: [["id", /^mw/], "typeof"] },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(htmlAttrsOf(cite)).toBe(
            JSON.stringify([
                ["id", "mw-abc"],
                ["typeof", "mw:Extension/ref"],
            ]),
        );
    });

    it("a non-matching value fails the pair matcher", () => {
        const { document } = ingestSup(
            `<sup id="other" typeof="mw:Extension/ref"><a href="#c">1</a></sup>`,
            { include: [["id", /^mw/], "typeof"] },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(htmlAttrsOf(cite)).toBe(
            JSON.stringify([["typeof", "mw:Extension/ref"]]),
        );
    });

    it("regexps are cloned (no stateful /g lastIndex across tests)", () => {
        const { document } = ingestSup(
            `<sup data-x="mw-1" data-y="mw-2"><a href="#c">1</a></sup>`,
            { include: [/^data-/g] },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        // a stateful /g regexp would fail the second test()
        expect(htmlAttrsOf(cite)).toBe(
            JSON.stringify([
                ["data-x", "mw-1"],
                ["data-y", "mw-2"],
            ]),
        );
    });

    it("collects nothing -> empty string", () => {
        const { document } = ingestSup(`<sup><a href="#c">1</a></sup>`, {});
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(htmlAttrsOf(cite)).toBe("");
    });
});

describe("cite-link end-to-end (wikipedia initial state)", () => {
    const loadStateSchema = () => {
        const options = Object.assign({}, SERIALIZE_OPTIONS, {
            format: SERIALIZE_FORMAT_OBJECT,
        });
        return deserializeSync(
            ProseMirrorSchemaModel,
            {},
            wikipediaInitialState.proseMirrorSchema,
            options,
        );
    };

    it("the state declares the cite-link reproducing atom", () => {
        const schema = loadStateSchema(),
            spec = schema.get("nodes").get("cite-link");
        expect(spec.get("tag").value).toBe("sup");
        expect(spec.get("selector").value).toBe(
            'sup[typeof="mw:Extension/ref"]',
        );
        expect(spec.get("atom").value).toBe(true);
        expect(spec.get("inline").value).toBe(true);
        expect(Array.from(spec.get("attrs").keys())).toEqual([
            "html",
            "htmlAttrs",
        ]);
    });

    it("ingests a citation as a cite-link atom with html and htmlAttrs", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(
                `<p>text<sup typeof="mw:Extension/ref" id="cite_note-1"><a href="#cite1">[1]</a></sup></p>`,
            ),
            loadStateSchema(),
        );
        const [paragraph] = kids(document);
        const [, cite] = kids(paragraph);
        expect(typeKey(cite)).toBe("cite-link");
        expect(fromMetaModelJSON(cite.get("attrs").get("html"))).toBe(
            '<a href="#cite1">[1]</a>',
        );
        expect(
            JSON.parse(fromMetaModelJSON(cite.get("attrs").get("htmlAttrs"))),
        ).toEqual([
            ["typeof", "mw:Extension/ref"],
            ["id", "cite_note-1"],
        ]);
        expect(report.reproNodes).toEqual({ "cite-link": 1 });
    });
});

describe("editable-element attr collection", () => {
    const policy = { exclude: ["style", /^on/] };

    it("generic-style intent marks carry data-style-name + htmlAttrs", () => {
        const { document } = ingestDOM(
            parse(`<p>a <b id="mw-1" class="x" style="color:red">bold</b></p>`),
            { attrPolicy: policy },
        );
        const [paragraph] = kids(document);
        const [, t2] = kids(paragraph);
        const [[typeKey, attrs]] = allMarksOf(t2);
        expect(typeKey).toBe("generic-style");
        expect(attrs["data-style-name"]).toBe("bold");
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["id", "mw-1"],
            ["class", "x"],
        ]);
    });

    it("blocks carry the htmlAttrs bag", () => {
        const { document } = ingestDOM(
            parse(`<p class="intro" id="mw-a">text</p>`),
            { attrPolicy: policy },
        );
        const [paragraph] = kids(document);
        expect(
            JSON.parse(
                fromMetaModelJSON(paragraph.get("attrs").get("htmlAttrs")),
            ),
        ).toEqual([
            ["class", "intro"],
            ["id", "mw-a"],
        ]);
    });

    it("inline nodes carry the htmlAttrs bag", () => {
        const { document } = ingestDOM(
            parse(`<p><abbr title="HyperText Markup Language">HTML</abbr></p>`),
            { attrPolicy: policy },
        );
        const [paragraph] = kids(document);
        const [abbr] = kids(paragraph);
        expect(typeKey(abbr)).toBe("abbr");
        expect(
            JSON.parse(fromMetaModelJSON(abbr.get("attrs").get("htmlAttrs"))),
        ).toEqual([["title", "HyperText Markup Language"]]);
    });

    it("semantic marks carry declared attrs + bag (duplication accepted)", () => {
        const { document } = ingestDOM(
            parse(`<p><a href="/wiki/X" rel="mw:WikiLink" title="X article">X</a></p>`),
            { proseMirrorSchema: createSchemaModel(), attrPolicy: policy },
        );
        const [paragraph] = kids(document);
        const [t] = kids(paragraph);
        const [[typeKey, attrs]] = allMarksOf(t);
        expect(typeKey).toBe("link");
        expect(attrs.href).toBe("/wiki/X");
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["href", "/wiki/X"],
            ["rel", "mw:WikiLink"],
            ["title", "X article"],
        ]);
    });

    it("skippedMarkAttrs counts only policy-excluded attributes", () => {
        const { report } = ingestDOM(
            parse(`<p><b id="mw-1" style="color:red" onclick="x()">bold</b></p>`),
            { attrPolicy: policy },
        );
        expect(report.skippedMarkAttrs).toEqual({
            "b.style": 1,
            "b.onclick": 1,
        });
    });
});

describe("semanticMarksFromSchema", () => {
    it("maps html tags to schema marks with their declared attrs", () => {
        expect(semanticMarksFromSchema(createSchemaModel())).toEqual({
            strong: { name: "strong", attrs: [] },
            a: { name: "link", attrs: ["href"] },
        });
    });
});
