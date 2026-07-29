// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { DOMParser } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schemaSpec } from "./default-schema";
import {
    serialize,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../../metamodel.mjs";
import {
    createProseMirrorSchemaFromMetaModel,
    ProsemirrorMarkView,
    ProsemirrorNodeView,
    ProseMirror,
} from "./integration.typeroof.jsx";
import {
    ProseMirrorSchemaModel,
    NodeModel,
    toMetaModelJSON,
    fromMetaModelJSON,
} from "./models.typeroof.jsx";

const kids = (node) => Array.from(node.get("content"), ([, c]) => c);

function setAttributeSpec(attributeSpecMapDraft, name, type, defaultValue) {
    const attributeSpecDraft =
        attributeSpecMapDraft.constructor.Model.createPrimalDraft({});
    attributeSpecDraft.get("default").value = defaultValue;
    attributeSpecDraft.get("validate").get("type").value = type;
    attributeSpecMapDraft.set(name, attributeSpecDraft);
}

// paragraph: content inline*, tag p
// heading: content inline*, tag h2, attrs {level: {default "1", validate number}}
// link: tag a, attrs {href: {default "", validate string}}
function createProseMirrorSchemaModel() {
    const draft = ProseMirrorSchemaModel.createPrimalDraft({}),
        nodesDraft = draft.get("nodes"),
        paragraphDraft = nodesDraft.constructor.Model.createPrimalDraft({});
    paragraphDraft.get("content").value = "inline*";
    paragraphDraft.get("group").value = "block";
    paragraphDraft.get("tag").value = "p";
    nodesDraft.set("paragraph", paragraphDraft);

    const headingDraft = nodesDraft.constructor.Model.createPrimalDraft({});
    headingDraft.get("content").value = "inline*";
    headingDraft.get("group").value = "block";
    headingDraft.get("tag").value = "h2";
    setAttributeSpec(headingDraft.get("attrs"), "level", "number", "1");
    nodesDraft.set("heading", headingDraft);

    const citeLinkDraft = nodesDraft.constructor.Model.createPrimalDraft({});
    citeLinkDraft.get("tag").value = "sup";
    citeLinkDraft.get("selector").value = 'sup[typeof="mw:Extension/ref"]';
    citeLinkDraft.get("inline").value = true;
    citeLinkDraft.get("group").value = "inline";
    citeLinkDraft.get("atom").value = true;
    setAttributeSpec(citeLinkDraft.get("attrs"), "html", "string", "");
    setAttributeSpec(citeLinkDraft.get("attrs"), "htmlAttrs", "string", "");
    nodesDraft.set("cite-link", citeLinkDraft);

    const marksDraft = draft.get("marks"),
        linkDraft = marksDraft.constructor.Model.createPrimalDraft({}),
        strongDraft = marksDraft.constructor.Model.createPrimalDraft({});
    linkDraft.get("tag").value = "a";
    setAttributeSpec(linkDraft.get("attrs"), "href", "string", "");
    marksDraft.set("link", linkDraft);
    strongDraft.get("tag").value = "strong";
    marksDraft.set("strong", strongDraft);
    return draft.metamorphose();
}

function createDocumentWithLink(href) {
    const docDraft = NodeModel.createPrimalDraft({}),
        paragraphDraft = NodeModel.createPrimalDraft({}),
        textDraft = NodeModel.createPrimalDraft({});
    docDraft.get("typeKey").value = "doc";
    paragraphDraft.get("typeKey").value = "paragraph";
    textDraft.get("typeKey").value = "text";
    textDraft.get("text").value = "hello";
    const marksDraft = textDraft.get("marks"),
        markDraft = marksDraft.constructor.Model.createPrimalDraft({});
    markDraft.get("typeKey").value = "link";
    markDraft.get("attrs").set("href", toMetaModelJSON(href, {}));
    marksDraft.push(markDraft);
    paragraphDraft.get("content").push(textDraft);
    docDraft.get("content").push(paragraphDraft);
    return docDraft.metamorphose();
}

// The metamodel<->ProseMirror node conversion methods are instance
// methods on ProseMirror, but they only use `this` for recursion and
// error messages. A plain handler object avoids constructing a full
// editor component (widgetBus, DOM, subscriptions).
const converter = {
    _createProseMirrorNode: ProseMirror.prototype._createProseMirrorNode,
    _rawCreateProseMirrorNode: ProseMirror.prototype._rawCreateProseMirrorNode,
    _createMetamodelNode: ProseMirror.prototype._createMetamodelNode,
    _rawCreateMetamodelNode: ProseMirror.prototype._rawCreateMetamodelNode,
};

describe("intent mark round-trip through the DOM parser", () => {
    // Regression: metamodel marks are inserted before reserved marks in
    // the built schema, so a priority tie made <strong data-style-name>
    // parse as a real "strong" mark (intent loss). The generic-style
    // parse rule has explicit priority to win ties order-independently.
    it("parses bound-tag elements with data-style-name as generic-style", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            createProseMirrorSchemaModel(),
        );
        const el = document.createElement("div");
        el.innerHTML = '<p><strong data-style-name="bold">x</strong></p>';
        const doc = DOMParser.fromSchema(schema).parse(el);
        expect(doc.child(0).child(0).marks.map((m) => m.type.name)).toEqual([
            "generic-style",
        ]);
    });

    it("parses foreign <strong> without data-style-name as strong", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            createProseMirrorSchemaModel(),
        );
        const el = document.createElement("div");
        el.innerHTML = "<p><strong>x</strong></p>";
        const doc = DOMParser.fromSchema(schema).parse(el);
        expect(doc.child(0).child(0).marks.map((m) => m.type.name)).toEqual([
            "strong",
        ]);
    });
});

describe("ProsemirrorMarkView.update (PM >= 1.42)", () => {
    // minimal widgetBus: no subscriptions widget, no metamodel links
    const stubWidgetBus = {
        domTool: {
            createElement(tag, attrs = {}) {
                const el = document.createElement(tag);
                for (const [name, value] of Object.entries(attrs))
                    el.setAttribute(name, value);
                return el;
            },
        },
        getWidgetById: () => null,
        getLinked: () => null,
    };

    it("updates schema mark attrs in place, reusing the element", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
                schemaSpec,
                createProseMirrorSchemaModel(),
            ),
            linkMark = schema.marks.link.create({
                href: "https://a.example",
            }),
            state = EditorState.create({
                schema,
                doc: schema.nodes.doc.create(
                    null,
                    schema.nodes.paragraph.create(
                        null,
                        schema.text("a link", [linkMark]),
                    ),
                ),
            }),
            element = document.createElement("div"),
            view = new EditorView(element, {
                state,
                markViews: {
                    link: (mark) =>
                        new ProsemirrorMarkView(
                            stubWidgetBus,
                            "subscriptions",
                            mark,
                        ),
                },
            }),
            linkEl = element.querySelector('[data-mark-type="link"]');
        // construction applies declared attrs
        expect(linkEl.getAttribute("href")).toBe("https://a.example");

        let tr = view.state.tr.removeMark(
            0,
            view.state.doc.content.size,
            schema.marks.link,
        );
        tr = tr.addMark(
            1,
            7,
            schema.marks.link.create({ href: "https://b.example" }),
        );
        view.dispatch(tr);

        const linkEl2 = element.querySelector('[data-mark-type="link"]');
        // update() reused the view: same element, attrs updated in place
        expect(linkEl2).toBe(linkEl);
        expect(linkEl2.getAttribute("href")).toBe("https://b.example");
        view.destroy();
    });
});

describe("NodeSpec selector field", () => {
    it("serializes and round-trips the selector field", () => {
        const options = Object.assign({}, SERIALIZE_OPTIONS, {
                format: SERIALIZE_FORMAT_OBJECT,
            }),
            [errors, serialized] = serialize(
                createProseMirrorSchemaModel(),
                options,
            ),
            restored = deserializeSync(
                ProseMirrorSchemaModel,
                {},
                serialized,
                options,
            );
        expect(errors).toEqual([]);
        expect(
            restored.get("nodes").get("cite-link").get("selector").value,
        ).toBe('sup[typeof="mw:Extension/ref"]');
    });

    it("generated parseDOM uses selector ?? tag, omits selector from the PM spec", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            createProseMirrorSchemaModel(),
        );
        expect(schema.nodes["cite-link"].spec.parseDOM[0].tag).toBe(
            'sup[typeof="mw:Extension/ref"]',
        );
        expect(schema.nodes.heading.spec.parseDOM[0].tag).toBe("h2");
        expect("selector" in schema.nodes["cite-link"].spec).toBe(false);
    });
});

describe("reproducing atom schema generation", () => {
    it("spec with html attr gets reproducing parseDOM/toDOM", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            createProseMirrorSchemaModel(),
        );
        const spec = schema.nodes["cite-link"].spec;
        expect(spec.parseDOM[0].tag).toBe('sup[typeof="mw:Extension/ref"]');

        // getAttrs collects html + a guarded bag
        const dom = document.createElement("sup");
        dom.setAttribute("typeof", "mw:Extension/ref");
        dom.setAttribute("data-node-type", "cite-link");
        dom.setAttribute("style", "color:red");
        dom.setAttribute("onclick", "x()");
        dom.innerHTML = '<a href="#c">1</a>';
        const attrs = spec.parseDOM[0].getAttrs(dom);
        expect(attrs.html).toBe('<a href="#c">1</a>');
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["typeof", "mw:Extension/ref"],
        ]);

        // toDOM replays the bag minus guard, verbatim innerHTML
        const out = spec.toDOM(
            schema.nodes["cite-link"].create({
                html: '<a href="#c">1</a>',
                htmlAttrs: JSON.stringify([
                    ["typeof", "mw:Extension/ref"],
                    ["id", "mw-1"],
                    ["data-node-type", "cite-link"],
                ]),
            }),
        );
        expect(out.tagName.toLowerCase()).toBe("sup");
        expect(out.getAttribute("typeof")).toBe("mw:Extension/ref");
        expect(out.getAttribute("id")).toBe("mw-1");
        expect(out.hasAttribute("data-node-type")).toBe(false);
        expect(out.innerHTML).toBe('<a href="#c">1</a>');

        // non-reproducing nodes keep the generic generated behavior
        expect(schema.nodes.heading.spec.toDOM).not.toBe(spec.toDOM);
    });
});

describe("ProsemirrorNodeView reproducing atoms", () => {
    it("renders wrapper-free with replayed attrs + innerHTML, re-applies on update", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
                schemaSpec,
                createProseMirrorSchemaModel(),
            ),
            citeNode = schema.nodes["cite-link"].create({
                html: '<a href="#c">1</a>',
                htmlAttrs: JSON.stringify([["typeof", "mw:Extension/ref"]]),
            }),
            state = EditorState.create({
                schema,
                doc: schema.nodes.doc.create(
                    null,
                    schema.nodes.paragraph.create(null, [
                        schema.text("a "),
                        citeNode,
                        schema.text(" b"),
                    ]),
                ),
            }),
            element = document.createElement("div"),
            mmSchema = createProseMirrorSchemaModel(),
            nodeWidgetBus = {
                domTool: {
                    createElement(tag, attrs = {}) {
                        const el = document.createElement(tag);
                        for (const [name, value] of Object.entries(attrs))
                            el.setAttribute(name, value);
                        return el;
                    },
                },
                getWidgetById: () => null,
                getLinked: () => mmSchema,
            },
            view = new EditorView(element, {
                state,
                nodeViews: {
                    "cite-link": (node, view) =>
                        new ProsemirrorNodeView(
                            nodeWidgetBus,
                            "subscriptions",
                            node,
                            view,
                        ),
                },
            }),
            sup = element.querySelector("sup");
        // wrapper-free: the collected tag with replayed attrs + innerHTML
        expect(sup.getAttribute("data-node-type")).toBe("cite-link");
        expect(sup.getAttribute("typeof")).toBe("mw:Extension/ref");
        expect(sup.innerHTML).toBe('<a href="#c">1</a>');
        // only the inner anchor, no extra content div
        expect(sup.childElementCount).toBe(1);

        // atom at position 3 (paragraph opens 0, "a " is 1..3)
        const tr = view.state.tr.replaceWith(
            3,
            4,
            schema.nodes["cite-link"].create({
                html: "<b>2</b>",
                htmlAttrs: JSON.stringify([
                    ["typeof", "mw:Extension/ref"],
                    ["class", "ref"],
                ]),
            }),
        );
        view.dispatch(tr);
        const sup2 = element.querySelector("sup");
        expect(sup2).toBe(sup);
        expect(sup2.getAttribute("class")).toBe("ref");
        expect(sup2.innerHTML).toBe("<b>2</b>");
        view.destroy();
    });
});

describe("generic-style htmlAttrs (editable attr replay 2a)", () => {
    it("declares htmlAttrs, collects it in getAttrs, replays it in toDOM", () => {
        const spec = schemaSpec.marks["generic-style"];
        expect(spec.attrs.htmlAttrs.default).toBe("");
        expect(spec.attrs.htmlAttrs.validate).toBe("string");

        const dom = document.createElement("span");
        dom.setAttribute("data-style-name", "bold");
        dom.setAttribute("id", "mw-1");
        dom.setAttribute("class", "x");
        dom.setAttribute("style", "color:red");
        dom.setAttribute("onclick", "y()");
        const attrs = spec.parseDOM[0].getAttrs(dom);
        expect(attrs["data-style-name"]).toBe("bold");
        expect(JSON.parse(attrs.htmlAttrs)).toEqual([
            ["id", "mw-1"],
            ["class", "x"],
        ]);

        const schema = createProseMirrorSchemaFromMetaModel(
                schemaSpec,
                createProseMirrorSchemaModel(),
            ),
            mark = schema.marks["generic-style"].create({
                "data-style-name": "bold",
                htmlAttrs: JSON.stringify([
                    ["id", "mw-1"],
                    ["data-mark-type", "generic-style"],
                ]),
            }),
            [tag, outAttrs] = spec.toDOM(mark);
        expect(tag).toBe("span");
        expect(outAttrs["data-style-name"]).toBe("bold");
        expect(outAttrs.id).toBe("mw-1");
        expect("data-mark-type" in outAttrs).toBe(false);
    });
});

describe("createProseMirrorSchemaFromMetaModel attrs conversion", () => {
    it("converts metamodel mark attrs into the built ProseMirror schema", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            createProseMirrorSchemaModel(),
        );
        expect("link" in schema.marks).toBe(true);
        expect(schema.marks.link.spec.attrs.href.default).toBe("");
        expect(schema.marks.link.spec.attrs.href.validate).toBe("string");
    });

    it("converts metamodel node attrs, coercing defaults to the validated type", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            createProseMirrorSchemaModel(),
        );
        expect("heading" in schema.nodes).toBe(true);
        expect(schema.nodes.heading.spec.attrs.level.default).toBe(1);
        expect(schema.nodes.heading.spec.attrs.level.validate).toBe("number");
        // defaults are applied when creating nodes
        expect(schema.node("heading", null, schema.text("t")).attrs.level).toBe(
            1,
        );
        // defaults are applied when creating marks
        expect(schema.mark("link").attrs.href).toBe("");
    });

    it("keeps the reserved-mark guard: generic-style can't be overridden", () => {
        const mmSchema = createProseMirrorSchemaModel(),
            marksDraft = mmSchema.get("marks");
        // mmSchema is immutable, rebuild with an override attempt
        const draft = ProseMirrorSchemaModel.createPrimalDraft({});
        for (const [name, nodeSpec] of mmSchema.get("nodes"))
            draft.get("nodes").set(name, nodeSpec);
        for (const [name, markSpec] of marksDraft)
            draft.get("marks").set(name, markSpec);
        const overrideDraft =
            draft.get("marks").constructor.Model.createPrimalDraft({});
        overrideDraft.get("tag").value = "em";
        draft.get("marks").set("generic-style", overrideDraft);
        const schema = createProseMirrorSchemaFromMetaModel(
            schemaSpec,
            draft.metamorphose(),
        );
        // still the reserved definition from the default schema
        expect(schema.marks["generic-style"].spec.excludes).toBe("_");
    });

    it("generated getAttrs reads declared attrs from the DOM, coercing types", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
                schemaSpec,
                createProseMirrorSchemaModel(),
            ),
            rule = schema.nodes.heading.spec.parseDOM[0],
            element = document.createElement("h2");
        element.setAttribute("level", "3");
        expect(rule.getAttrs(element)).toEqual({ level: 3 });
        // absent attributes are left out, so ProseMirror defaults apply
        expect(rule.getAttrs(document.createElement("h2"))).toEqual({});
    });

    it("generated toDOM serializes attrs for HTML round-trips", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
                schemaSpec,
                createProseMirrorSchemaModel(),
            ),
            node = schema.node("heading", { level: 2 }, schema.text("t")),
            mark = schema.mark("link", { href: "https://example.com" });
        expect(schema.nodes.heading.spec.toDOM(node)).toEqual([
            "h2",
            { level: 2 },
            0,
        ]);
        expect(schema.marks.link.spec.toDOM(mark)).toEqual([
            "a",
            { href: "https://example.com" },
            0,
        ]);
    });

    it("round-trips a document with a semantic mark and its attrs", () => {
        const schema = createProseMirrorSchemaFromMetaModel(
                schemaSpec,
                createProseMirrorSchemaModel(),
            ),
            mmDoc = createDocumentWithLink("https://example.com"),
            pmDoc = converter._createProseMirrorNode(null, mmDoc, schema),
            pmText = pmDoc.child(0).child(0);
        expect(pmText.marks.length).toBe(1);
        expect(pmText.marks[0].type.name).toBe("link");
        expect(pmText.marks[0].attrs.href).toBe("https://example.com");

        const back = converter._createMetamodelNode(null, pmDoc, {}),
            [paragraph] = kids(back),
            [text] = kids(paragraph),
            marks = Array.from(text.get("marks"), ([, mark]) => mark);
        expect(marks.length).toBe(1);
        expect(marks[0].get("typeKey").value).toBe("link");
        expect(fromMetaModelJSON(marks[0].get("attrs").get("href"))).toBe(
            "https://example.com",
        );
    });
});
