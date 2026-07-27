// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { schemaSpec } from "./default-schema";
import {
    createProseMirrorSchemaFromMetaModel,
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

    const marksDraft = draft.get("marks"),
        linkDraft = marksDraft.constructor.Model.createPrimalDraft({});
    linkDraft.get("tag").value = "a";
    setAttributeSpec(linkDraft.get("attrs"), "href", "string", "");
    marksDraft.set("link", linkDraft);
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
