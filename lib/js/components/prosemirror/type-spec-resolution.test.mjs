// @vitest-environment jsdom
/**
 * Characterization tests for the nodeSpec→typeSpec resolution
 * ("baseline pinning") before the shim flags & relative TypeSpec
 * linking feature changes the resolver.
 *
 * The resolution methods are component methods on ProseMirror, but
 * they only use `this` for the nodeSpecToTypeSpec mapping model, the
 * typeSpec-properties registry, and the origin path. Following the
 * handler-object pattern from integration.test.mjs, a plain object
 * avoids constructing a full editor component (widgetBus, DOM,
 * subscriptions).
 */
import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState, AllSelection } from "prosemirror-state";
import { Path } from "../../metamodel.mjs";
import { SimpleProtocolHandler } from "../basics/component.mjs";
import { schemaSpec } from "./default-schema";
import {
    getTypeSpecPropertiesIdMethod,
    getTypeSpecsMethod,
} from "./integration.typeroof.jsx";
import { NodeSpecToTypeSpecMapModel } from "./models.typeroof.jsx";

const PROTOCOL = "typeSpecProperties@";

/**
 * Builds a resolution context: a nodeSpecToTypeSpec mapping model and
 * a registry of the "registered" typeSpec paths (what the real
 * component's protocolHandler would have).
 */
function createResolutionHarness(
    links = {},
    registeredPaths = [],
    excludeFromFallbackPaths = [],
) {
    const mapDraft = NodeSpecToTypeSpecMapModel.createPrimalDraft({});
    for (const [typeKey, link] of Object.entries(links)) {
        const edgeDraft = mapDraft.constructor.Model.createPrimalDraft({});
        edgeDraft.get("link").value = link;
        mapDraft.set(typeKey, edgeDraft);
    }
    const nodeSpecToTypeSpec = mapDraft.metamorphose(),
        registry = new SimpleProtocolHandler(PROTOCOL),
        excluded = new Set(excludeFromFallbackPaths);
    for (const pathString of registeredPaths)
        registry.register(pathString, null);
    const handler = {
        // One sentinel per distinct typeSpec path, like the real
        // model-instance return of getEntry. Flagged paths get a
        // sentinel exposing the "excludeFromFallback" accessor the
        // resolver's fallback walk reads.
        _entrySentinels: new Map(),
        _originTypeSpecPath: Path.fromString("/typeSpec"),
        widgetBus: {
            getProtocolHandlerImplementation: (name, defaultValue = null) =>
                name === PROTOCOL ? registry : defaultValue,
        },
        getEntry(internalName) {
            if (internalName === "nodeSpecToTypeSpec")
                return nodeSpecToTypeSpec;
            const key =
                internalName instanceof Path
                    ? internalName.toString()
                    : String(internalName);
            // Match the real _getEntry contract: a path that is not a
            // registered typeSpec throws a KEY ERROR rather than
            // returning a falsy value. The resolver's fallback walk
            // must therefore only call this for paths confirmed by
            // hasRegistered — this test harness enforces that.
            if (!this._entrySentinels.has(key)) {
                if (!excluded.has(key) && !registeredPaths.includes(key))
                    throw new Error(
                        `KEY ERROR path "${key}" not found in typeSpec tree.`,
                    );
                const isExcluded = excluded.has(key),
                    sentinel = {
                        get(fieldName) {
                            return {
                                value:
                                    fieldName === "excludeFromFallback"
                                        ? isExcluded
                                        : false,
                            };
                        },
                    };
                this._entrySentinels.set(key, sentinel);
            }
            return this._entrySentinels.get(key);
        },
    };
    return handler;
}

function resolve(harness, pathOfTypes) {
    return getTypeSpecPropertiesIdMethod.call(harness, pathOfTypes);
}

function rootHarness(links) {
    return createResolutionHarness(links, ["/typeSpec"]);
}

describe("typeSpec resolution baseline behavior", () => {
    it("an unmapped node type resolves to the root typeSpec", () => {
        const harness = rootHarness({});
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    it("a mapped node type with an empty link resolves to the root typeSpec", () => {
        const harness = rootHarness({ paragraph: "" });
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    it("a link to a registered child resolves to that child", () => {
        const harness = createResolutionHarness({ paragraph: "h3" }, [
            "/typeSpec",
            "/typeSpec/children/h3",
        ]);
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/h3`,
        );
    });

    it("a link to an unregistered descendant falls back level by level to a registered ancestor", () => {
        const harness = createResolutionHarness(
            { paragraph: "german/children/h3" },
            ["/typeSpec", "/typeSpec/children/german"],
        );
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/german`,
        );
    });

    it("a link attempting to escape the origin resolves to the root typeSpec", () => {
        const harness = createResolutionHarness(
            { paragraph: "../../children/escape" },
            ["/typeSpec", "/typeSpec/children/h3"],
        );
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    // Multi-segment links:
    it("a link segment naming 'children' first resolves without added segments", () => {
        const harness = createResolutionHarness({ paragraph: "children/h3" }, [
            "/typeSpec",
            "/typeSpec/children/h3",
        ]);
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/h3`,
        );
    });

    it("a multi-segment link with explicit 'children' segments resolves to the descendant", () => {
        const harness = createResolutionHarness(
            { paragraph: "quote/children/bq" },
            ["/typeSpec", "/typeSpec/children/quote/children/bq"],
        );
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote/children/bq`,
        );
    });

    // Pins the current (arguably broken) single-'children' interposition:
    // a natural multi-segment link like 'quote/bq' cannot hit a registered
    // intermediate; the fallback walk skips whole 'children/{key}' pairs
    // straight to the root.
    it("a multi-segment link without 'children' segments misses registered intermediates and falls back to the root", () => {
        const harness = createResolutionHarness({ paragraph: "quote/bq" }, [
            "/typeSpec",
            "/typeSpec/children/quote",
        ]);
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    // Step 4: excludeFromFallback in the fallback walk.
    it("the fallback walk passes through a flagged intermediate to its parent", () => {
        const harness = createResolutionHarness(
            { paragraph: "h3" },
            ["/typeSpec", "/typeSpec/children/german"],
            // german is a shim: the walk passes through it to root.
            ["/typeSpec/children/german"],
        );
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    it("an explicit link to a flagged typeSpec still resolves to it", () => {
        const harness = createResolutionHarness(
            { paragraph: "h3" },
            ["/typeSpec", "/typeSpec/children/h3"],
            ["/typeSpec/children/h3"],
        );
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/h3`,
        );
    });

    it("root flagged + nothing else registered: resolution still returns root", () => {
        const harness = createResolutionHarness(
            { paragraph: "h3" },
            ["/typeSpec"],
            ["/typeSpec"],
        );
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    it("selection spanning two node types collects each resolved typeSpec", () => {
        const harness = createResolutionHarness(
            { unknown: "h3", raw_html_block: "quote" },
            ["/typeSpec", "/typeSpec/children/h3", "/typeSpec/children/quote"],
        );
        harness._getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;
        const schema = new Schema(schemaSpec),
            doc = schema.nodes.doc.create(null, [
                schema.nodes.unknown.create(null, schema.text("unknown")),
                schema.nodes.raw_html_block.create({ html: "<em>x</em>" }),
            ]),
            state = EditorState.create({
                schema,
                doc,
                selection: new AllSelection(doc),
            }),
            typeSpecs = getTypeSpecsMethod.call(harness, state),
            resolvedPaths = Array.from(typeSpecs.values(), (path) =>
                path.toString(),
            );
        // The two mapped node types resolve to their children; neither
        // is skipped by the spanning selection.
        expect(resolvedPaths).toEqual(
            expect.arrayContaining([
                "/typeSpec/children/h3",
                "/typeSpec/children/quote",
            ]),
        );
    });
});
