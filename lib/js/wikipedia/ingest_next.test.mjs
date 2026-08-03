// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
    ingestDOM,
    ingestWikipediaDocument,
    semanticMarksFromSchema,
    atomRulesFromSchema,
    markRulesFromSchema,
    WIKIPEDIA_RAW_RULES,
    WIKIPEDIA_BLOCK_RULES,
    HTML_PHRASING_RULES,
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

// Schema-less mark styling: pure intent (generic-style), as most
// ingestDOM tests want it — unlike WIKIPEDIA_MARK_RULES, which names
// schema marks.
const GENERIC_MARK_RULES = [
    { selector: "b, strong", rule: { kind: "generic", styleName: "bold" } },
    { selector: "i, em", rule: { kind: "generic", styleName: "italic" } },
    { selector: "a", rule: { kind: "generic", styleName: "link" } },
];

// Compose an explicit rule table for ingestDOM tests (the engine is
// empty — no rules, no behavior). Precedence: atoms (explicit, then
// schema-derived) -> raw metadata -> transparent -> blocks (incl.
// the li split-item) -> explicit mark rules -> schema-derived marks
// -> generic styles -> phrasing.
const composeRules = ({
    pre = [],
    schema = null,
    atoms = [],
    marks = [],
    transparent = [],
} = {}) => [
    ...pre,
    ...atoms,
    ...(schema ? atomRulesFromSchema(schema) : []),
    ...WIKIPEDIA_RAW_RULES,
    ...transparent,
    ...WIKIPEDIA_BLOCK_RULES,
    ...marks,
    ...(schema ? markRulesFromSchema(schema) : []),
    ...GENERIC_MARK_RULES,
    ...HTML_PHRASING_RULES,
];

// ingestDOM with the composed standard table — the moral equivalent
// of the pre-Phase-4 built-in defaults, now explicit (empty engine).
const ingestTest = (
    doc,
    { pre, schema, atoms, marks, transparent, ...options } = {},
) =>
    ingestDOM(doc, {
        proseMirrorSchema: schema ?? undefined,
        emissionRules: composeRules({ pre, schema, atoms, marks, transparent }),
        ...options,
    });

// The wikipedia initial-state schema (the demo's actual setup), for
// the end-to-end describes.
const loadStateSchema = () =>
    deserializeSync(
        ProseMirrorSchemaModel,
        {},
        wikipediaInitialState.proseMirrorSchema,
        Object.assign({}, SERIALIZE_OPTIONS, {
            format: SERIALIZE_FORMAT_OBJECT,
        }),
    );

describe("ingestDOM", () => {
    it("passes children of transparentContainers through", () => {
        const { document } = ingestTest(parse(`<div><p>inside</p></div>`), {
            transparent: [{ selector: "div", rule: { kind: "transparent" } }],
        });
        const [paragraph] = kids(document);
        expect(typeKey(paragraph)).toBe("paragraph");
    });

    it("maps known blocks and marks", () => {
        const { document, report } = ingestTest(
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
        const { report } = ingestTest(
            parse(`<p><i><b>x</b></i> <strong><em>y</em></strong></p>`),
        );
        expect(report.markSets["[bold, italic]"]).toBe(2);
    });

    it("prunes unknown blocks into raw_html_block with outerHTML", () => {
        const { document, report } = ingestTest(
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
        const { document, report } = ingestTest(
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
        expect(report.skippedHtmlAttrs).toEqual({});
        expect(report.markSets["[link]"]).toBe(1);
    });

    it("maps BR to hard_break", () => {
        const { document } = ingestTest(parse(`<p>a<br>b</p>`));
        const [p] = kids(document);
        expect(kids(p).map(typeKey)).toEqual(["text", "hard_break", "text"]);
    });

    it("skips empty/whitespace text nodes and counts them", () => {
        const { document, report } = ingestTest(
            parse(`<p>a</p>\n\n<p>b</p>`),
        );
        expect(kids(document).map(typeKey)).toEqual(["paragraph", "paragraph"]);
        expect(report.skippedEmptyTexts).toBeGreaterThan(0);
        for (const p of kids(document))
            for (const t of kids(p)) expect(textValue(t).trim()).not.toBe("");
    });

    it("transparent containers pass children through (option)", () => {
        const { document, report } = ingestTest(
            parse(`<div><p>inside</p></div>`),
            { transparent: [{ selector: "div", rule: { kind: "transparent" } }] },
        );
        expect(kids(document).map(typeKey)).toEqual(["paragraph"]);
        expect(report.catchAllBlocks).toEqual({});
    });

    it("catch-all in inline context emits raw_html_inline", () => {
        const { document, report } = ingestTest(
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
        const { report } = ingestTest(parse(`<div><p>x</p></div>`));
        expect(report.catchAllBlocks).toEqual({ DIV: 1 });
    });

    it("section: inline runs are lifted, unresolved elements stay loud", () => {
        // scoped run-lifting (operator decision 2026-08-03,
        // supersedes prune): consecutive inline-resolving children —
        // text, <span>, <b>, <br> — form ONE lifted paragraph per
        // run; <div> resolves nowhere, breaks the run and stays a
        // raw_html_block (discovery guarantee).
        const { document, report } = ingestTest(
            parse(
                `<section><p>para</p><span>inline span</span>stray` +
                    `<div>hat</div><b>bold</b><br>tail</section>`,
            ),
        );
        const [section] = kids(document);
        expect(typeKey(section)).toBe("section");
        expect(kids(section).map(typeKey)).toEqual([
            "paragraph", // <p> stays structured
            "paragraph", // lifted run: span + "stray"
            "raw_html_block", // <div> resolves nowhere: loud
            "paragraph", // lifted run: bold + hard_break + "tail"
        ]);
        const [, run1, , run2] = kids(section);
        expect(kids(run1).map(typeKey)).toEqual(["span", "text"]);
        expect(kids(kids(run1)[0]).map(textValue)).toEqual(["inline span"]);
        expect(textValue(kids(run1)[1])).toBe("stray");
        expect(kids(run2).map(typeKey)).toEqual([
            "text",
            "hard_break",
            "text",
        ]);
        expect(textValue(kids(run2)[0])).toBe("bold");
        expect(marksOf(kids(run2)[0])).toEqual([["generic-style", "bold"]]);
        expect(report.liftedRuns).toBe(2);
        expect(report.catchAllBlocks).toEqual({ DIV: 1 });
        expect(report.inlineNodes).toEqual({ SPAN: 1 });
        expect(report.catchAllInline).toEqual({});
    });

    it("patches mw-empty-elt elements through as atoms, preserving metadata", () => {
        const { document, report } = ingestTest(
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
        expect(report.rawAtoms).toEqual({ SPAN: 2, P: 1 });
        // nothing inside mw-empty-elt reached the catch-all
        expect(report.catchAllBlocks).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });
});

describe("ul/li list ingestion", () => {
    it("li without block children becomes li-inline (marks kept)", () => {
        const { document, report } = ingestTest(
            parse(`<ul><li>a <b>b</b></li></ul>`),
        );
        const [ul] = kids(document);
        expect(typeKey(ul)).toBe("ul");
        const [li] = kids(ul);
        expect(typeKey(li)).toBe("li-inline");
        const [t1, t2] = kids(li);
        expect(textValue(t1)).toBe("a ");
        expect(marksOf(t2)).toEqual([["generic-style", "bold"]]);
        expect(report.catchAllBlocks).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });

    it("li with a nested ul becomes li-block, inline runs lifted", () => {
        const { document } = ingestTest(
            parse(`<ul><li>intro<ul><li>x</li></ul>tail</li></ul>`),
        );
        const [ul] = kids(document);
        const [li] = kids(ul);
        expect(typeKey(li)).toBe("li-block");
        const [para1, nestedUl, para2] = kids(li);
        // each inline run is lifted into ONE paragraph
        expect(typeKey(para1)).toBe("paragraph");
        expect(kids(para1).map(textValue)).toEqual(["intro"]);
        expect(typeKey(nestedUl)).toBe("ul");
        const [nestedLi] = kids(nestedUl);
        expect(typeKey(nestedLi)).toBe("li-inline");
        expect(kids(nestedLi).map(textValue)).toEqual(["x"]);
        expect(typeKey(para2)).toBe("paragraph");
        expect(kids(para2).map(textValue)).toEqual(["tail"]);
    });

    it("li collects its htmlAttrs bag; skipped attrs count as li.*", () => {
        const { document, report } = ingestTest(
            parse(`<ul><li id="mw1" style="color:red">x</li></ul>`),
            { attrPolicy: { exclude: ["style"] } },
        );
        const [ul] = kids(document);
        const [li] = kids(ul);
        expect(
            JSON.parse(fromMetaModelJSON(li.get("attrs").get("htmlAttrs"))),
        ).toEqual([["id", "mw1"]]);
        expect(report.skippedHtmlAttrs).toEqual({ "li.style": 1 });
    });

    it("a stray li (not under ul) falls to the block catch-all", () => {
        const { document, report } = ingestTest(
            parse(`<section><li>stray</li></section>`),
        );
        const [section] = kids(document);
        expect(kids(section).map(typeKey)).toEqual(["raw_html_block"]);
        expect(report.catchAllBlocks).toEqual({ LI: 1 });
    });

    it("an li in inline context falls to the inline catch-all", () => {
        // the html parser keeps <li> inside <h2> (unlike inside <p>)
        const { document, report } = ingestTest(
            parse(`<h2>a<li>inline li</li></h2>`),
        );
        const [h2] = kids(document);
        expect(typeKey(h2)).toBe("heading-2");
        expect(kids(h2).map(typeKey)).toEqual(["text", "raw_html_inline"]);
        expect(report.catchAllInline).toEqual({ LI: 1 });
    });

    it("an unresolved table child makes an li-block, staying loud", () => {
        // <table> resolves in neither context: it is not a run
        // member (scoped lift), so the li becomes li-block with a
        // lifted paragraph and the table as a loud raw_html_block.
        const { document, report } = ingestTest(
            parse(`<ul><li>text<table><tbody><tr><td>c</td></tr></tbody></table></li></ul>`),
        );
        const [ul] = kids(document);
        const [li] = kids(ul);
        expect(typeKey(li)).toBe("li-block");
        expect(kids(li).map(typeKey)).toEqual(["paragraph", "raw_html_block"]);
        const [para] = kids(li);
        expect(kids(para).map(textValue)).toEqual(["text"]);
        expect(report.catchAllBlocks).toEqual({ TABLE: 1 });
        expect(report.catchAllInline).toEqual({});
        expect(report.liftedRuns).toBe(1);
    });

    it("end-to-end with the wikipedia state schema", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(`<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>`),
            loadStateSchema(),
        );
        const [ul] = kids(document);
        expect(kids(ul).map(typeKey)).toEqual(["li-inline", "li-block"]);
        const [, liBlock] = kids(ul);
        const [para, nestedUl] = kids(liBlock);
        expect(typeKey(para)).toBe("paragraph");
        expect(kids(para).map(textValue)).toEqual(["b"]);
        expect(kids(kids(nestedUl)[0]).map(textValue)).toEqual(["c"]);
        expect(report.catchAllBlocks).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });
});

describe("scoped run-lifting in block context", () => {
    it("one wrapper per run; blocks bound the runs", () => {
        const { document, report } = ingestTest(
            parse(`<section>a<p>mid</p>b<b>c</b></section>`),
        );
        const [section] = kids(document);
        expect(kids(section).map(typeKey)).toEqual([
            "paragraph", // lifted run: "a"
            "paragraph", // the real <p>
            "paragraph", // lifted run: "b" + bold "c"
        ]);
        const [runA, , runB] = kids(section);
        expect(kids(runA).map(textValue)).toEqual(["a"]);
        expect(kids(runB).map(textValue)).toEqual(["b", "c"]);
        expect(marksOf(kids(runB)[1])).toEqual([["generic-style", "bold"]]);
        expect(report.liftedRuns).toBe(2);
    });

    it("whitespace-only runs produce no wrapper", () => {
        const { document, report } = ingestTest(
            parse(`<section>\n  <p>a</p>\n  <p>b</p>\n</section>`),
        );
        const [section] = kids(document);
        expect(kids(section).map(typeKey)).toEqual(["paragraph", "paragraph"]);
        expect(report.liftedRuns).toBe(0);
        expect(report.skippedEmptyTexts).toBeGreaterThan(0);
    });

    it("an unresolved element breaks the run into before/raw/after", () => {
        const { document, report } = ingestTest(
            parse(`<section>before<foo>?</foo>after</section>`),
        );
        const [section] = kids(document);
        expect(kids(section).map(typeKey)).toEqual([
            "paragraph",
            "raw_html_block",
            "paragraph",
        ]);
        expect(report.catchAllBlocks).toEqual({ FOO: 1 });
        expect(report.liftedRuns).toBe(2);
    });

    it("liftedRunWrapper names the wrapper type", () => {
        const { document } = ingestTest(parse(`<section>x</section>`), {
            liftedRunWrapper: "paragraph-2",
        });
        const [section] = kids(document);
        expect(kids(section).map(typeKey)).toEqual(["paragraph-2"]);
    });

    it("lifts at the doc root too", () => {
        const { document, report } = ingestTest(
            parse(`root text<p>para</p>`),
        );
        expect(kids(document).map(typeKey)).toEqual([
            "paragraph",
            "paragraph",
        ]);
        expect(report.liftedRuns).toBe(1);
    });

    it("raw metadata islands stay block atoms between runs", () => {
        // .mw-empty-elt resolves in BLOCK context too (raw fits both
        // contexts): it keeps its block handling, bounding the runs.
        const { document, report } = ingestTest(
            parse(
                `<section>a<span class="mw-empty-elt"><meta></span>b</section>`,
            ),
        );
        const [section] = kids(document);
        expect(kids(section).map(typeKey)).toEqual([
            "paragraph",
            "raw_html_block",
            "paragraph",
        ]);
        expect(report.rawAtoms).toEqual({ SPAN: 1 });
        expect(report.liftedRuns).toBe(2);
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

describe("ingestDOM with schema: semantic marks", () => {
    it("emits schema marks for tags the schema defines, harvesting declared attrs", () => {
        const { document, report } = ingestTest(
            parse(
                `<p>Hello <strong>World</strong> and <a href="https://example.com" rel="mw:ExtLink">a link</a></p>`,
            ),
            { schema: createSchemaModel() },
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
        expect(report.skippedHtmlAttrs).toEqual({});
        expect(report.markSets).toEqual({
            "[]": 2,
            "[strong]": 1,
            "[link]": 1,
        });
    });

    it("falls back to generic-style when no schema is given", () => {
        const { document, report } = ingestTest(
            parse(`<p><strong>World</strong></p>`),
        );
        const [paragraph] = kids(document);
        const [text] = kids(paragraph);
        expect(marksOf(text)).toEqual([["generic-style", "bold"]]);
        expect(report.markSets).toEqual({ "[bold]": 1 });
    });
});

describe("mark rules (composed before schema derivation)", () => {
    it("emits an explicitly mapped schema mark for a tag (<b> -> strong)", () => {
        const { document, report } = ingestTest(
            parse(`<p>a <b>bold</b> move</p>`),
            {
                schema: createSchemaModel(),
                marks: [
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
        const { document, report } = ingestTest(
            parse(`<p>a <b>bold</b></p>`),
            {
                schema: createSchemaModel(),
                marks: [
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
        const { document } = ingestTest(
            parse(
                `<p><a href="https://a.example" rel="mw:ExtLink">ext</a> <a href="https://b.example">int</a></p>`,
            ),
            {
                schema: createSchemaModel(),
                marks: [
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
        const { document } = ingestTest(
            parse(`<p><strong>bold</strong> <em>italic</em></p>`),
            {
                schema: createSchemaModel(),
                marks: [
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

describe("emissionRules option (empty-engine contract)", () => {
    it("no rules: everything falls to the catch-alls", () => {
        const { document, report } = ingestDOM(
            parse(`<p>Hello <b>World</b></p><section>x</section>`),
        );
        // no block rules: p and section become raw_html_block atoms;
        // nothing descends, so no inline emissions either
        expect(kids(document).map(typeKey)).toEqual([
            "raw_html_block",
            "raw_html_block",
        ]);
        expect(report.catchAllBlocks).toEqual({ P: 1, SECTION: 1 });
        expect(report.catchAllInline).toEqual({});
        expect(report.inlineNodes).toEqual({});
        expect(report.markSets).toEqual({});
    });

    it("no rules: stray text is lifted into a run (engine-reserved)", () => {
        const { document, report } = ingestDOM(parse(`stray text`));
        const [wrapped] = kids(document);
        expect(typeKey(wrapped)).toBe("paragraph");
        expect(kids(wrapped).map(textValue)).toEqual(["stray text"]);
        expect(report.liftedRuns).toBe(1);
    });

    it("liftedRunWrapper renames the stray-text wrapper", () => {
        const { document } = ingestDOM(parse(`stray`), {
            liftedRunWrapper: "paragraph-2",
        });
        expect(kids(document).map(typeKey)).toEqual(["paragraph-2"]);
    });

    it("an earlier rule beats a later one for the same element", () => {
        // composed table puts `pre` first: it reroutes <p> before the
        // standard block rule can claim it
        const { document } = ingestTest(parse(`<p>x</p>`), {
            pre: [
                {
                    selector: "p",
                    rule: { kind: "block", typeKey: "paragraph-2" },
                },
            ],
        });
        expect(kids(document).map(typeKey)).toEqual(["paragraph-2"]);
    });

    it("a context-misfit entry is skipped (falls through)", () => {
        // a block rule cannot fire in inline context: <span> inside
        // the paragraph falls to the later inline-node rule
        const { document, report } = ingestTest(parse(`<p>a<span>b</span></p>`), {
            pre: [
                {
                    selector: "span",
                    rule: { kind: "block", typeKey: "section" },
                },
            ],
        });
        const [p] = kids(document);
        expect(kids(p).map(typeKey)).toEqual(["text", "span"]);
        expect(report.inlineNodes).toEqual({ SPAN: 1 });
    });

    it("the context field narrows a both-contexts kind", () => {
        // atom restricted to inline context: in block context the
        // element resolves inline-only, so scoped lifting places the
        // atom inside a lifted paragraph — a valid inline position
        // instead of an inline atom loose in block content.
        const rules = [
            {
                selector: "sup",
                rule: { kind: "atom", typeKey: "cite-link" },
                context: "inline",
            },
        ];
        const inlineCase = ingestTest(parse(`<p><sup>1</sup></p>`), {
            pre: rules,
        });
        const [p] = kids(inlineCase.document);
        expect(kids(p).map(typeKey)).toEqual(["cite-link"]);
        const blockCase = ingestDOM(parse(`<section><sup>1</sup></section>`), {
            // bare table: only the narrowed atom rule and the section
            // block rule, so <sup> cannot resolve in block context
            emissionRules: [
                ...rules,
                {
                    selector: "section",
                    rule: { kind: "block", typeKey: "section" },
                },
            ],
        });
        const [section] = kids(blockCase.document);
        expect(kids(section).map(typeKey)).toEqual(["paragraph"]);
        const [liftedRun] = kids(section);
        expect(kids(liftedRun).map(typeKey)).toEqual(["cite-link"]);
        expect(blockCase.report.liftedRuns).toBe(1);
        expect(blockCase.report.catchAllBlocks).toEqual({});
    });

    it("skip emits nothing, no descent", () => {
        const { document, report } = ingestTest(
            parse(`<p>a<span>gone</span>b</p>`),
            { pre: [{ selector: "span", rule: { kind: "skip" } }] },
        );
        const [p] = kids(document);
        expect(kids(p).map(textValue)).toEqual(["a", "b"]);
        expect(report.inlineNodes).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });

    it("a generic rule fires for any matched element (no tag gate)", () => {
        const { document } = ingestTest(
            parse(`<p><span class="x">styled</span></p>`),
            {
                pre: [
                    {
                        selector: "span.x",
                        rule: { kind: "generic", styleName: "x-style" },
                    },
                ],
            },
        );
        const [p] = kids(document);
        const [text] = kids(p);
        expect(marksOf(text)).toEqual([["generic-style", "x-style"]]);
    });
});

describe("atom rules routing", () => {
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
        const { document, report } = ingestTest(
            parse(
                `<p><sup typeof="mw:Extension/ref"><a href="#cite1">1</a></sup><sup>x</sup></p>`,
            ),
            {
                atoms: [
                    {
                        selector: 'sup[typeof="mw:Extension/ref"]',
                        rule: { kind: "atom", typeKey: "cite-link" },
                    },
                    {
                        selector: "sup",
                        rule: { kind: "atom", typeKey: "other-sup" },
                    },
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
        const { document } = ingestTest(
            parse(
                `<p><sup typeof="mw:Extension/ref"><a href="#cite1">1</a></sup></p>`,
            ),
            { schema: createCitationSchemaModel() },
        );
        const [paragraph] = kids(document);
        const [cite] = kids(paragraph);
        expect(typeKey(cite)).toBe("cite-link");
    });

    it("selector mismatch falls through to the existing inline-node chain", () => {
        const { document } = ingestTest(parse(`<p><sup>plain</sup></p>`), {
            schema: createCitationSchemaModel(),
        });
        const [paragraph] = kids(document);
        const [sup] = kids(paragraph);
        expect(typeKey(sup)).toBe("sup");
    });

    it("tag-only specs do not hijack known blocks", () => {
        const { document } = ingestTest(parse(`<p>Hello</p>`), {
            schema: createCitationSchemaModel(),
        });
        const [paragraph] = kids(document);
        expect(typeKey(paragraph)).toBe("paragraph");
    });
});

describe("htmlAttrs collection policy", () => {
    const ingestSup = (html, attrPolicy) =>
        ingestTest(parse(`<p>${html}</p>`), {
            attrPolicy,
            atoms: [
                {
                    selector: "sup",
                    rule: { kind: "atom", typeKey: "cite-link" },
                },
            ],
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
        const { document } = ingestTest(
            parse(`<p>a <b id="mw-1" class="x" style="color:red">bold</b></p>`),
            { attrPolicy: policy },
        );
        const [paragraph] = kids(document);
        const [, t2] = kids(paragraph);
        const [[markTypeKey, attrs]] = allMarksOf(t2);
        expect(markTypeKey).toBe("generic-style");
        expect(attrs["data-style-name"]).toBe("bold");
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["id", "mw-1"],
            ["class", "x"],
        ]);
    });

    it("blocks carry the htmlAttrs bag", () => {
        const { document } = ingestTest(
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
        const { document } = ingestTest(
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
        const { document } = ingestTest(
            parse(`<p><a href="/wiki/X" rel="mw:WikiLink" title="X article">X</a></p>`),
            { schema: createSchemaModel(), attrPolicy: policy },
        );
        const [paragraph] = kids(document);
        const [t] = kids(paragraph);
        const [[markTypeKey, attrs]] = allMarksOf(t);
        expect(markTypeKey).toBe("link");
        expect(attrs.href).toBe("/wiki/X");
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["href", "/wiki/X"],
            ["rel", "mw:WikiLink"],
            ["title", "X article"],
        ]);
    });

    it("skippedHtmlAttrs counts only policy-excluded attributes", () => {
        const { report } = ingestTest(
            parse(`<p><b id="mw-1" style="color:red" onclick="x()">bold</b></p>`),
            { attrPolicy: policy },
        );
        expect(report.skippedHtmlAttrs).toEqual({
            "b.style": 1,
            "b.onclick": 1,
        });
    });
});

describe("editable attr replay end-to-end (wikipedia initial state)", () => {
    it("the state declares htmlAttrs on editable types", () => {
        const schema = loadStateSchema();
        for (const nodeName of [
            "section",
            "paragraph-2",
            "heading-1",
            "heading-2",
            "heading-3",
            "paragraph",
        ])
            expect(
                schema.get("nodes").get(nodeName).get("attrs").has("htmlAttrs"),
            ).toBe(true);
        expect(
            schema.get("marks").get("link").get("attrs").has("htmlAttrs"),
        ).toBe(true);
    });

    it("ingests paragraph bags and link declared + tail bag", () => {
        const { document } = ingestWikipediaDocument(
            parse(
                `<p class="x" id="mw1" about="#a">text <a href="/wiki/X" rel="mw:ExtLink" title="T">link</a></p>`,
            ),
            loadStateSchema(),
        );
        const [paragraph] = kids(document);
        expect(
            JSON.parse(
                fromMetaModelJSON(paragraph.get("attrs").get("htmlAttrs")),
            ),
        ).toEqual([
            ["class", "x"],
            ["id", "mw1"],
            ["about", "#a"],
        ]);
        const [, linkText] = kids(paragraph);
        const [[markTypeKey, markAttrs]] = allMarksOf(linkText);
        expect(markTypeKey).toBe("link");
        expect(markAttrs.href).toBe("/wiki/X");
        // declared href duplicated in the bag, rel/title as the tail
        expect(JSON.parse(markAttrs.htmlAttrs)).toEqual([
            ["href", "/wiki/X"],
            ["rel", "mw:ExtLink"],
            ["title", "T"],
        ]);
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

describe("figcontent end-to-end (wikipedia initial state)", () => {
    const attrsOf = (node) =>
        Object.fromEntries(
            Array.from(node.get("attrs"), ([name, value]) => [
                name,
                fromMetaModelJSON(value),
            ]),
        );
    const figcontentOf = (html) => {
        const { document } = ingestWikipediaDocument(
            parse(html),
            loadStateSchema(),
        );
        const [figure] = kids(document);
        return kids(figure).find((n) => typeKey(n) === "figcontent");
    };

    it("the state declares figcontent with html, htmlTag and htmlAttrs", () => {
        const spec = loadStateSchema().get("nodes").get("figcontent");
        expect(spec.get("atom").value).toBe(true);
        expect(spec.get("selector").value).toBe("figure > :not(figcaption)");
        expect(Array.from(spec.get("attrs").keys())).toEqual([
            "html",
            "htmlTag",
            "htmlAttrs",
        ]);
    });

    it("reproduces the <a> wrapping an <img> (wikipedia thumb)", () => {
        const attrs = attrsOf(
            figcontentOf(
                `<figure class="mw-halign-right" typeof="mw:File/Thumb">` +
                    `<a href="/wiki/File:X.svg" class="mw-file-description">` +
                    `<img src="//x.png" width="225" height="266">` +
                    `</a><figcaption>caption</figcaption></figure>`,
            ),
        );
        expect(attrs.htmlTag).toBe("a");
        expect(attrs.html).toBe(
            '<img src="//x.png" width="225" height="266">',
        );
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["href", "/wiki/File:X.svg"],
            ["class", "mw-file-description"],
        ]);
    });

    it("reproduces a <pre> (mdn code figure)", () => {
        const attrs = attrsOf(
            figcontentOf(
                `<figure><figcaption>Get details.</figcaption>` +
                    `<pre>function f() {}</pre></figure>`,
            ),
        );
        expect(attrs.htmlTag).toBe("pre");
        expect(attrs.html).toBe("function f() {}");
        expect(attrs.htmlAttrs).toBe("");
    });

    it("reproduces a bare void <img>: htmlTag set, html empty", () => {
        const attrs = attrsOf(
            figcontentOf(
                `<figure><img src="/elephant.jpg" alt="Elephant at sunset">` +
                    `<figcaption>An elephant</figcaption></figure>`,
            ),
        );
        expect(attrs.htmlTag).toBe("img");
        expect(attrs.html).toBe("");
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["src", "/elephant.jpg"],
            ["alt", "Elephant at sunset"],
        ]);
    });

    it("does not set htmlTag on atoms that do not declare it (cite-link)", () => {
        const { document } = ingestWikipediaDocument(
            parse(
                `<p><sup typeof="mw:Extension/ref"><a href="#c">[1]</a></sup></p>`,
            ),
            loadStateSchema(),
        );
        const [cite] = kids(kids(document)[0]);
        expect(typeKey(cite)).toBe("cite-link");
        expect(Object.keys(attrsOf(cite))).toEqual(["html", "htmlAttrs"]);
    });
});

describe("figcaption inline content (wikipedia initial state)", () => {
    it("the state declares figcaption as a textblock, like paragraph", () => {
        const nodes = loadStateSchema().get("nodes"),
            spec = nodes.get("figcaption"),
            paragraph = nodes.get("paragraph");
        expect(spec.get("content").value).toBe("inline*");
        expect(spec.get("group").value).toBe(paragraph.get("group").value);
        // like paragraph, unlike heading-*/li-inline: not defining
        expect(spec.get("definingAsContext").value).toBe(false);
        expect(spec.get("definingForContent").value).toBe(false);
    });

    it("keeps a wikipedia caption's marks instead of pruning to raw_html", () => {
        const { document, report } = ingestWikipediaDocument(
            parse(
                `<figure><a href="/wiki/File:X.svg"><img src="//x.png"></a>` +
                    `<figcaption id="mwEA">A specimen of the ` +
                    `<a rel="mw:WikiLink" href="/wiki/Trajan">Trajan</a>` +
                    ` typeface, based on <i lang="la">capitalis</i>` +
                    ` or <b>bold</b> forms</figcaption></figure>`,
            ),
            loadStateSchema(),
        );
        const [figure] = kids(document);
        const caption = kids(figure).find((n) => typeKey(n) === "figcaption");
        expect(kids(caption).map(typeKey)).toEqual([
            "text",
            "text",
            "text",
            "text",
            "text",
            "text",
            "text",
        ]);
        expect(kids(caption).map(textValue)).toEqual([
            "A specimen of the ",
            "Trajan",
            " typeface, based on ",
            "capitalis",
            " or ",
            "bold",
            " forms",
        ]);
        // mark typeKeys only; the link's attrs are covered elsewhere
        expect(kids(caption).map((n) => allMarksOf(n).map(([tk]) => tk)))
            .toEqual([[], ["link"], [], ["generic-style"], [], ["strong"], []]);
        const [[, italicAttrs]] = allMarksOf(kids(caption)[3]);
        expect(italicAttrs["data-style-name"]).toBe("italic");
        // nothing was pruned into the block catch-all
        expect(report.catchAllBlocks).toEqual({});
        expect(report.catchAllInline).toEqual({});
    });

    it("collects the caption's own attrs into htmlAttrs", () => {
        const { document } = ingestWikipediaDocument(
            parse(
                `<figure><img src="//x.png">` +
                    `<figcaption id="mwEA" class="cap">text</figcaption></figure>`,
            ),
            loadStateSchema(),
        );
        const [figure] = kids(document);
        const caption = kids(figure).find((n) => typeKey(n) === "figcaption");
        expect(
            JSON.parse(fromMetaModelJSON(caption.get("attrs").get("htmlAttrs"))),
        ).toEqual([
            ["id", "mwEA"],
            ["class", "cap"],
        ]);
    });

    it("ingests caption inline content without a schema too", () => {
        const { document, report } = ingestTest(
            parse(`<figure><figcaption>a <b>b</b></figcaption></figure>`),
        );
        const [figure] = kids(document);
        const [caption] = kids(figure);
        expect(typeKey(caption)).toBe("figcaption");
        expect(kids(caption).map(typeKey)).toEqual(["text", "text"]);
        expect(kids(caption).map(marksOf)).toEqual([
            [],
            [["generic-style", "bold"]],
        ]);
        expect(kids(caption).map(textValue)).toEqual(["a ", "b"]);
        expect(report.catchAllBlocks).toEqual({});
    });
});
