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
    // Logical-only semantics (pristine system, legacy storage shape
    // not tolerated): 'children/…' addresses a level literally named
    // 'children'; it cannot resolve, hence fallback to root.
    it("a 'children/…' link is a literal level lookup (broken → root fallback)", () => {
        const harness = createResolutionHarness({ paragraph: "children/h3" }, [
            "/typeSpec",
            "/typeSpec/children/h3",
        ]);
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    // Logical multi-segment links traverse logical levels across the
    // registered tree; the helper converts once at the origin boundary.
    it("a multi-segment logical link resolves to the descendant", () => {
        const harness = createResolutionHarness({ paragraph: "quote/bq" }, [
            "/typeSpec/children/quote/children/bq",
        ]);
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote/children/bq`,
        );
    });

    // A broken relative link degrades to the nearest registered
    // ancestor via the fallback walk (starting from the broken
    // candidate). Here that ancestor is /typeSpec/children/quote.
    it("an unregistered logical link falls back to a registered ancestor", () => {
        const harness = createResolutionHarness({ paragraph: "quote/bq" }, [
            "/typeSpec",
            "/typeSpec/children/quote",
        ]);
        expect(resolve(harness, ["doc", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote`,
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

    // Step 7 / Q3(a): the selection shows a silent node's resolved spec
    // normally — noStyler only gates styler provisioning, never
    // resolution (the resolver doesn't read the noStyler flag at all).
    // getTypeSpecs on a silent node still returns its spec.
    it("selection inside a silent node shows its spec (resolution unchanged)", () => {
        const harness = createResolutionHarness({ unknown: "quote" }, [
                "/typeSpec",
                "/typeSpec/children/quote",
            ]),
            schema = new Schema(schemaSpec),
            doc = schema.nodes.doc.create(null, [
                schema.nodes.unknown.create(null, schema.text("in a quote")),
            ]),
            state = EditorState.create({ schema, doc });
        harness._getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;
        const typeSpecs = getTypeSpecsMethod.call(harness, state),
            resolvedPaths = Array.from(typeSpecs.values(), (path) =>
                path.toString(),
            );
        expect(resolvedPaths).toContain("/typeSpec/children/quote");
    });
});

/**
 * Step 8 — relative links (anchor recursion). "./…" or a leading ".."
 * anchors at the parent node's resolved spec; ".." consumes one
 * logical nesting level; unmapped parents degrade the anchor to root;
 * out-of-bounds ".." is a broken link → normal fallback walk. A silent
 * (noStyler) or excludeFromFallback anchor still anchors (flags don't
 * affect anchoring — the resolved parent path is the anchor regardless).
 */
describe("typeSpec resolution: relative links", () => {
    it('"./h3" under a mapped parent anchors at the parent spec', () => {
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "./h3" },
            [
                "/typeSpec",
                "/typeSpec/children/quote",
                "/typeSpec/children/quote/children/h3",
            ],
        );
        // parent "quote" resolves to /typeSpec/children/quote; the
        // relative link resolves a child under it.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote/children/h3`,
        );
    });

    it('"../hr" resolves a sibling of the parent anchor', () => {
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "../hr" },
            ["/typeSpec", "/typeSpec/children/quote", "/typeSpec/children/hr"],
        );
        // anchor = /typeSpec/children/quote; ".." → root, then hr.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/hr`,
        );
    });

    it("unmapped parent → anchor degrades to root → './h3' behaves like '/h3'", () => {
        const harness = createResolutionHarness({ paragraph: "./h3" }, [
            "/typeSpec",
            "/typeSpec/children/h3",
        ]);
        // quote is unmapped; its anchor resolves to the origin, so the
        // relative link resolves at the origin like an absolute link.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/h3`,
        );
    });

    it('out-of-bounds ".." is a broken link → normal fallback walk', () => {
        const harness = createResolutionHarness({ paragraph: "../../nope" }, [
            "/typeSpec",
            "/typeSpec/children/quote",
        ]);
        // ".." twice exceeds the origin → broken → fallback to root.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    it("deep nesting consumes one level per '..'", () => {
        const harness = createResolutionHarness(
            { a: "a", b: "./b", c: "./c", paragraph: "../../target" },
            [
                "/typeSpec",
                "/typeSpec/children/a",
                "/typeSpec/children/a/children/b",
                "/typeSpec/children/a/children/b/children/c",
                "/typeSpec/children/a/children/target",
            ],
        );
        // anchor = /typeSpec/children/a/children/b/children/c;
        // "../.." consumes c and b → base a; then target.
        expect(resolve(harness, ["doc", "a", "b", "c", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/a/children/target`,
        );
    });

    it("a silent (noStyler) anchor still anchors the relative link", () => {
        // noStyler gates only styler provisioning; resolution and
        // anchoring are unaffected — the parent's resolved path is
        // still the anchor for its children's relative links.
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "./h3" },
            [
                "/typeSpec",
                "/typeSpec/children/quote",
                "/typeSpec/children/quote/children/h3",
            ],
        );
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote/children/h3`,
        );
    });

    it("an excludeFromFallback anchor still anchors the relative link", () => {
        // The anchor is the parent's *resolved* path; an explicit link
        // to a flagged spec still resolves to it (Step 4), so it can
        // serve as the anchor for its children's relative links.
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "./h3" },
            [
                "/typeSpec",
                "/typeSpec/children/quote",
                "/typeSpec/children/quote/children/h3",
            ],
            ["/typeSpec/children/quote"], // excludeFromFallback
        );
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote/children/h3`,
        );
    });
});

/**
 * Discriminator convention (relative by default): only explicitly
 * absolute links ("/…") are origin-anchored. Bare names, "./…", and
 * leading ".." all anchor at the parent node's resolved spec.
 */
describe("typeSpec resolution: relative-by-default discriminator", () => {
    it("a bare name at a nested level anchors at the parent spec, not the origin", () => {
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "h3" },
            [
                "/typeSpec",
                "/typeSpec/children/quote",
                "/typeSpec/children/quote/children/h3",
                "/typeSpec/children/h3",
            ],
        );
        // Bare "h3" no longer means origin's h3 — it resolves under
        // the parent's (quote's) resolved spec.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/quote/children/h3`,
        );
    });

    it("a bare name with an unmapped parent degrades to root and resolves like absolute", () => {
        const harness = createResolutionHarness({ paragraph: "h3" }, [
            "/typeSpec",
            "/typeSpec/children/h3",
        ]);
        // quote unmapped → its resolved spec is the origin → bare
        // "h3" resolves there exactly as if it were absolute.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/h3`,
        );
    });

    it("an explicitly absolute link ('/h3') is origin-anchored at a nested level", () => {
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "/h3" },
            [
                "/typeSpec",
                "/typeSpec/children/quote",
                "/typeSpec/children/quote/children/h3",
                "/typeSpec/children/h3",
            ],
        );
        // The absolute marker picks the origin's h3 even though a
        // same-named child exists under the parent's spec.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec/children/h3`,
        );
    });

    it("an absolute 'children/…' form resolves as a literal lookup (broken → root fallback)", () => {
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "/children/h3" },
            ["/typeSpec", "/typeSpec/children/quote", "/typeSpec/children/h3"],
        );
        // 'children/…' as an absolute link names a literal level
        // 'children' — not a storage shape; broken → root fallback.
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });

    it("a bare 'children/x' relative link resolves as a literal lookup (broken → root fallback)", () => {
        const harness = createResolutionHarness(
            { quote: "quote", paragraph: "children/bq" },
            [
                "/typeSpec",
                "/typeSpec/children/quote",
                "/typeSpec/children/quote/children/bq",
            ],
        );
        expect(resolve(harness, ["doc", "quote", "paragraph"])).toBe(
            `${PROTOCOL}/typeSpec`,
        );
    });
});
