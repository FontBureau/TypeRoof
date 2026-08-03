// Wikipedia -> metamodel NodeModel ingestion engine (Phase 2).
// Builds NodeModel drafts directly — no JSON intermediate.
// Self-contained by design: no reuse from ingest.ts, which this
// module is meant to replace eventually.
/* eslint-disable @typescript-eslint/no-explicit-any */
// ^ the metamodel (models.typeroof.jsx) is untyped JS; until it has
//   type declarations, draft handles are pragmatically `any` here.

// @ts-expect-error untyped .jsx module
import * as models from "../components/prosemirror/models.typeroof.jsx";
const { NodeModel, toMetaModelJSON } = models as {
    NodeModel: any;
    toMetaModelJSON: (v: unknown, d: object) => unknown;
};

// Operator-confirmed initial known-set (2026-07-24). Evolves from
// observation, not from upfront assumptions.
// SECTION stays a block: sections structure the article and their
// children are blocks only (see block-context catch-all below).
// UL (2026-08-03): unordered list; its LI children are handled by a
// dedicated branch (ingestListItem), hence LI is not in this table.
const KNOWN_BLOCK_TAGS: Readonly<Record<string, string>> = {
    BODY: "doc",
    SECTION: "section",
    P: "paragraph",
    H1: "heading-1",
    H2: "heading-2",
    H3: "heading-3",
    H4: "heading-4",
    H5: "heading-5",
    H6: "heading-6",
    UL: "ul",
    FIGURE: "figure",
    FIGCAPTION: "figcaption"
};

const KNOWN_MARK_TAGS: Readonly<Record<string, string>> = {
    B: "bold",
    STRONG: "bold",
    EM: "italic",
    I: "italic",
    A: "link",
};

// HTML phrasing-content tags: inline elements. They are emitted as
// inline NODES (typeKey = tag name, -> reserved unknown_inline via
// sync), because HTML inline != mark (operator decision 2026-07-24).
// Tags in KNOWN_MARK_TAGS above take precedence; BR is special-cased.
const INLINE_TAGS: ReadonlySet<string> = new Set([
    "ABBR",
    "B",
    "BDI",
    "BDO",
    "CITE",
    "CODE",
    "DATA",
    "DFN",
    "EM",
    "I",
    "KBD",
    "MARK",
    "Q",
    "S",
    "SAMP",
    "SMALL",
    "SPAN",
    "STRONG",
    "SUB",
    "SUP",
    "TIME",
    "U",
    "VAR",
    "WBR",
    "A",
    "INS",
    "DEL",
]);

// Wikipedia metadata islands (Parsoid's "mw-empty-elt"): spans — and
// occasionally ps — carrying link/meta/style children with metadata.
// Patched through as raw atoms, preserving outerHTML verbatim, so a
// critical examiner can see we keep the metadata. A dedicated node
// type may replace this later; the branch is deliberately separate
// to keep that path open (operator decision 2026-07-24).

// elements witht he class .mw-empty-elt can safely be ignored for our
// purposes, probably if we can't make them transparent we will skip
// them on ingest.
const MW_EMPTY_ELT = ".mw-empty-elt",
    MW_META = "meta";
// Elements matching any of these selectors are patched through as raw
// atoms (raw_html_block / raw_html_inline by context), no descent.
const SELECTORS_TO_RAW_HTML = [MW_EMPTY_ELT, MW_META].join(", ");

export interface IngestionReport {
    // mark-set histogram, e.g. { "[bold, italic]": 2, "[bold]": 1, "[]": 5 }
    markSets: Record<string, number>;
    // tag -> count of raw_html_block catch-all emissions (block context)
    catchAllBlocks: Record<string, number>;
    // tag -> count of raw_html_inline catch-all emissions (inline context)
    catchAllInline: Record<string, number>;
    // tag -> count of inline-node emissions
    inlineNodes: Record<string, number>;
    // tag -> count of mw-empty-elt atoms emitted (metadata preserved)
    mwEmptyElts: Record<string, number>;
    // "tag.attr" -> count of collected-but-skipped mark element attrs
    skippedMarkAttrs: Record<string, number>;
    // mark name -> count of markEmission rules that fell back to intent
    // because the schema does not define the named mark
    unresolvedMarkRules: Record<string, number>;
    // node typeKey -> count of reproducing-atom emissions (nodeEmission)
    reproNodes: Record<string, number>;
    skippedEmptyTexts: number;
    // non-empty text nodes found directly in block context; each was
    // wrapped in a paragraph so block containers hold blocks only
    wrappedStrayTexts: number;
}

export interface SemanticMark {
    // mark typeKey in the schema
    name: string;
    // attribute names to harvest from the DOM element (1:1 attr-name
    // mapping, as created by createProseMirrorSchemaFromMetaModel)
    attrs: string[];
}

// How a mark-ish HTML tag is emitted into the document: as a
// schema-defined (full-featured) mark with attrs harvested from the
// element, or as intent (generic-style with data-style-name).
export type MarkEmissionRule =
    | { kind: "mark"; name: string }
    | { kind: "generic"; styleName: string };

// An ordered markEmission entry: the first selector matching the
// element (element.matches) wins.
export interface MarkEmissionRuleEntry {
    selector: string;
    rule: MarkEmissionRule;
}

// A node-side emission entry: the first selector matching the element
// (element.matches) routes it to the named node type. Ordered;
// redundancy is OK — authors can declare safe fallbacks.
export interface NodeEmissionEntry {
    selector: string;
    typeKey: string;
}

// A matcher for attribute names (exact string or RegExp test), or a
// [nameMatcher, valueMatcher] pair matching name AND value, e.g.
// ["id", /^mw/] matches id="mw123".
export type HtmlAttrMatcher =
    | string
    | RegExp
    | [string | RegExp, string | RegExp];

// Policy for collecting an element's outer attributes into the
// htmlAttrs bag of reproducing atoms. Conjunctive rule: an attribute
// is collected iff it is NOT matched by exclude AND is matched by
// include. include: undefined means accept all (default), include: []
// rejects all (kill-switch); exclude: undefined/[] excludes nothing.
// NOTE: TypeRoof's core properties (data-node-type, data-mark-type,
// data-style-name) and on* handlers are additionally guarded at
// replay time, outside ingest — no policy can emit them.
export interface HtmlAttrPolicy {
    include?: HtmlAttrMatcher[];
    exclude?: HtmlAttrMatcher[];
}

function matchOne(
    matcher: HtmlAttrMatcher,
    name: string,
    value: string,
): boolean {
    if (typeof matcher === "string") return matcher === name;
    if (matcher instanceof RegExp) return matcher.test(name);
    const [nameMatcher, valueMatcher] = matcher;
    return (
        matchOne(nameMatcher, name, value) &&
        matchOne(valueMatcher, value, value)
    );
}

function matchesAny(
    matchers: readonly HtmlAttrMatcher[] | undefined,
    name: string,
    value: string,
): boolean {
    if (matchers === undefined) return false;
    for (const matcher of matchers)
        if (matchOne(matcher, name, value)) return true;
    return false;
}

// Clone regexps without the stateful g/y flags (lastIndex mutation
// would make repeated tests order-dependent).
function cloneRegExp(re: RegExp): RegExp {
    return new RegExp(re.source, re.flags.replace(/[gy]/g, ""));
}

function cloneMatcher(matcher: HtmlAttrMatcher): HtmlAttrMatcher {
    if (matcher instanceof RegExp) return cloneRegExp(matcher);
    if (Array.isArray(matcher))
        return matcher.map((m) =>
            m instanceof RegExp ? cloneRegExp(m) : m,
        ) as HtmlAttrMatcher;
    return matcher;
}

// Normalize a policy once (clones regexps).
function normalizeAttrPolicy(policy: HtmlAttrPolicy = {}): HtmlAttrPolicy {
    const result: HtmlAttrPolicy = {};
    if (policy.include !== undefined)
        result.include = policy.include.map(cloneMatcher);
    if (policy.exclude !== undefined)
        result.exclude = policy.exclude.map(cloneMatcher);
    return result;
}

// Collect an element's attributes into the htmlAttrs bag: a JSON
// string of [name, value] pairs (string, because PM attr equality is
// shallow and nested objects would redraw-oscillate). Returns "" when
// nothing is collected.
// Whether the policy collects an attribute: NOT matched by
// exclude AND matched by include (include undefined: accept all;
// include []: reject all).
function isCollected(
    policy: HtmlAttrPolicy,
    name: string,
    value: string,
): boolean {
    if (matchesAny(policy.exclude, name, value)) return false;
    if (
        policy.include !== undefined &&
        !matchesAny(policy.include, name, value)
    )
        return false;
    return true;
}

// The names of the attributes the policy excludes (not collected),
// for report.skippedMarkAttrs counting.
function skippedHtmlAttrs(el: Element, policy: HtmlAttrPolicy = {}): string[] {
    const skipped: string[] = [];
    for (const attr of Array.from(el.attributes))
        if (!isCollected(policy, attr.name, attr.value))
            skipped.push(attr.name);
    return skipped;
}

export function collectHtmlAttrs(
    el: Element,
    policy: HtmlAttrPolicy = {},
): string {
    const result: [string, string][] = [];
    for (const attr of Array.from(el.attributes)) {
        const { name, value } = attr;
        if (!isCollected(policy, name, value)) continue;
        result.push([name, value]);
    }
    return result.length ? JSON.stringify(result) : "";
}

export interface IngestionOptions {
    // Tag names treated as transparent containers (children pass
    // through, no node emitted). Initially empty — the transparency
    // decision is deferred until real articles have been examined.
    transparentContainers?: string[];
    // The metamodel schema (ProseMirrorSchemaModel): marks it defines
    // are emitted for their tags (see semanticMarksFromSchema),
    // everything else falls back to generic-style.
    proseMirrorSchema?: any;
    // Ordered [CSS selector, rule] pairs overriding the emission
    // behavior for mark-ish elements (KNOWN_MARK_TAGS): the FIRST
    // selector matching the element (element.matches) wins, so more
    // specific selectors go first — e.g.
    //   { selector: "b, strong", rule: { kind: "mark", name: "strong" } }
    // emits <b>/<strong> as the schema-defined "strong" mark (attrs
    // harvested), and
    //   { selector: "i, em", rule: { kind: "generic", styleName: "italic" } }
    // emits <i>/<em> as intent. Elements matched by no selector use
    // the default: schema-defined mark when the schema provides one
    // for the tag, else generic-style with the KNOWN_MARK_TAGS style
    // name. A "mark" rule naming a mark the schema does not define
    // falls back to intent with the rule name as style name and is
    // counted in report.unresolvedMarkRules.
    markEmission?: MarkEmissionRuleEntry[];
    // Ordered [CSS selector, typeKey] pairs routing elements to named
    // node types (reproducing atoms): the FIRST selector matching the
    // element (element.matches) wins; redundancy is OK — declare safe
    // fallbacks. Elements matched by no entry fall back to
    // schema-derived selectors (nodeSelectorsFromSchema), then to the
    // existing chain (unknown_inline's raison d'être).
    nodeEmission?: NodeEmissionEntry[];
    // Policy for collecting outer attributes into the htmlAttrs bag
    // of reproducing atoms (see HtmlAttrPolicy): conjunctive
    // include/exclude matcher lists. The configured variant bakes in:
    // accept all except style (collides with TypeRoof styling),
    // on* handlers and TypeRoof's own markers.
    attrPolicy?: HtmlAttrPolicy;
}

// Derive htmlTag (lowercase) -> SemanticMark from the metamodel schema
// (ProseMirrorSchemaModel), mirroring the generated parseDOM rules.
// Marks without a tag are not reachable by ingest.
export function semanticMarksFromSchema(
    proseMirrorSchema: any,
): Record<string, SemanticMark> {
    const result: Record<string, SemanticMark> = {};
    for (const [name, markSpec] of proseMirrorSchema.get("marks")) {
        const tag = markSpec.get("tag");
        if (tag.isEmpty || tag.value === "") continue;
        result[tag.value.toLowerCase()] = {
            name,
            attrs: Array.from(markSpec.get("attrs").keys()),
        };
    }
    return result;
}

function newNodeDraft(typeKey: string): any {
    const draft = NodeModel.createPrimalDraft({});
    draft.get("typeKey").value = typeKey;
    return draft;
}

function newGenericStyleMarkDraft(
    nodeDraft: any,
    styleName: string,
    htmlAttrs: string = "",
): any {
    const marksList = nodeDraft.get("marks");
    const markDraft = marksList.constructor.Model.createPrimalDraft({});
    markDraft.get("typeKey").value = "generic-style";
    markDraft
        .get("attrs")
        .set("data-style-name", toMetaModelJSON(styleName, {}));
    if (htmlAttrs !== "")
        markDraft.get("attrs").set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
    return markDraft;
}

function newSemanticMarkDraft(
    nodeDraft: any,
    name: string,
    attrs: Record<string, string>,
    htmlAttrs: string = "",
): any {
    const marksList = nodeDraft.get("marks");
    const markDraft = marksList.constructor.Model.createPrimalDraft({});
    markDraft.get("typeKey").value = name;
    const attrsDraft = markDraft.get("attrs");
    for (const [attrName, value] of Object.entries(attrs))
        attrsDraft.set(attrName, toMetaModelJSON(value, {}));
    if (htmlAttrs !== "")
        attrsDraft.set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
    return markDraft;
}

// Derive mark name -> declared attr names from the metamodel schema
// (ProseMirrorSchemaModel), for attr harvest of explicitly configured
// markEmission rules.
function schemaMarkAttrsFromSchema(
    proseMirrorSchema: any,
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, markSpec] of proseMirrorSchema.get("marks"))
        result[name] = Array.from(markSpec.get("attrs").keys());
    return result;
}

// Derive [{ selector, typeKey }] from node specs that carry a
// non-empty selector. Deliberately NOT from tag-only specs: a tag
// like paragraph's "p" would hijack KNOWN_BLOCK_TAGS.
export function nodeSelectorsFromSchema(
    proseMirrorSchema: any,
): NodeEmissionEntry[] {
    const result: NodeEmissionEntry[] = [];
    for (const [typeKey, nodeSpec] of proseMirrorSchema.get("nodes")) {
        const selector = nodeSpec.get("selector");
        if (selector.isEmpty || selector.value === "") continue;
        result.push({ selector: selector.value, typeKey });
    }
    return result;
}

// Resolve which named node type claims this element: the first
// matching nodeEmission entry wins; else the first matching
// schema-derived selector; else null (fall through to the existing
// chain).
function resolveNodeEmission(ctx: Ctx, el: Element): string | null {
    for (const { selector, typeKey } of ctx.nodeEmission)
        if (el.matches(selector)) return typeKey;
    for (const { selector, typeKey } of ctx.nodeSelectors)
        if (el.matches(selector)) return typeKey;
    return null;
}

type MarkEmission =
    | { kind: "mark"; name: string; attrs: string[] }
    | { kind: "style"; styleName: string };

// Resolve how a mark-ish HTML tag (UPPERCASE) is emitted: an explicit
// markEmission rule wins; else the schema-defined mark for the tag;
// else generic-style intent with the KNOWN_MARK_TAGS style name.
function resolveMarkEmission(
    ctx: Ctx,
    el: Element,
    tag: string,
    knownMarkStyle: string,
): MarkEmission {
    for (const { selector, rule } of ctx.markEmission) {
        // first matching selector wins
        if (!el.matches(selector)) continue;
        if (rule.kind === "generic")
            return { kind: "style", styleName: rule.styleName };
        const attrs = ctx.schemaMarkAttrs[rule.name];
        if (attrs !== undefined)
            return { kind: "mark", name: rule.name, attrs };
        // The rule names a mark the schema does not define: fall back
        // to intent with the rule name and report it.
        count(ctx.report.unresolvedMarkRules, rule.name);
        return { kind: "style", styleName: rule.name };
    }
    const semanticMark = ctx.semanticMarks[tag.toLowerCase()];
    if (semanticMark !== undefined)
        return {
            kind: "mark",
            name: semanticMark.name,
            attrs: semanticMark.attrs,
        };
    return { kind: "style", styleName: knownMarkStyle };
}

function markSetKey(marks: MarkDesc[]): string {
    const names = marks.map((mark) =>
        mark.kind === "style" ? mark.styleName : mark.name,
    );
    return `[${[...new Set(names)].sort().join(", ")}]`;
}

function count(record: Record<string, number>, key: string): void {
    record[key] = (record[key] ?? 0) + 1;
}

// Marks accumulate while descending: either a style name
// (expressed via the generic-style mark) or a schema-defined
// (semantic) mark with its harvested attrs.
type MarkDesc =
    | { kind: "style"; styleName: string; htmlAttrs: string }
    | {
          kind: "mark";
          name: string;
          attrs: Record<string, string>;
          htmlAttrs: string;
      };

interface Ctx {
    report: IngestionReport;
    transparent: ReadonlySet<string>;
    semanticMarks: Readonly<Record<string, SemanticMark>>;
    markEmission: readonly MarkEmissionRuleEntry[];
    schemaMarkAttrs: Readonly<Record<string, string[]>>;
    nodeEmission: readonly NodeEmissionEntry[];
    nodeSelectors: readonly NodeEmissionEntry[];
    attrPolicy: HtmlAttrPolicy;
}

// Emit a raw_html atom preserving the element's outerHTML verbatim.
function emitRawHtmlAtom(el: Element, inInline: boolean, out: any[]): string {
    const nodeTypeKey = inInline ? "raw_html_inline" : "raw_html_block";
    const draft = newNodeDraft(nodeTypeKey);
    draft.get("attrs").set("html", toMetaModelJSON(el.outerHTML, {}));
    out.push(draft.metamorphose());
    return nodeTypeKey;
}

// Ingest children of `el` directly into `out` (pass-through).
function ingestChildrenInto(
    el: Node,
    marks: MarkDesc[],
    out: any[],
    ctx: Ctx,
    inInline: boolean,
): void {
    for (const child of Array.from(el.childNodes))
        ingestNode(child, marks, out, ctx, inInline);
}

// Ingest children of `el` as the content of a new container draft.
function fillContent(
    draft: any,
    el: Node,
    marks: MarkDesc[],
    ctx: Ctx,
    inInline: boolean,
): void {
    const content = draft.get("content");
    for (const child of Array.from(el.childNodes)) {
        const out: any[] = [];
        ingestNode(child, marks, out, ctx, inInline);
        for (const item of out) content.push(item);
    }
}

// Ingest a <li> element in block context (operator decision
// 2026-08-03). Without block-level children it becomes "li-inline"
// (inline content only). With block-level children — e.g. a nested
// <ul> — it becomes "li-block", which holds blocks only, so the
// inline runs between the blocks are lifted into paragraphs.
// Both types share tag "li" and group "li"; the group keeps ul's
// content expression ("li+") open for further li sorts. (A node type
// literally named "li" would shadow the group in content
// expressions — prosemirror-model resolves type names first.)
function ingestListItem(el: Element, out: any[], ctx: Ctx): void {
    const { report } = ctx;
    const isBlockChild = (child: Node): boolean =>
        child.nodeType === Node.ELEMENT_NODE &&
        KNOWN_BLOCK_TAGS[(child as Element).tagName] !== undefined;
    const hasBlockChild = Array.from(el.childNodes).some(isBlockChild);
    const draft = newNodeDraft(hasBlockChild ? "li-block" : "li-inline");
    const htmlAttrs = collectHtmlAttrs(el, ctx.attrPolicy);
    if (htmlAttrs !== "")
        draft.get("attrs").set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
    for (const attrName of skippedHtmlAttrs(el, ctx.attrPolicy))
        count(report.skippedMarkAttrs, `li.${attrName}`);
    if (!hasBlockChild) {
        // marks do not cross block boundaries; li-inline has inline content
        fillContent(draft, el, [], ctx, true);
        out.push(draft.metamorphose());
        return;
    }
    // li-block: blocks only — lift each inline run into a paragraph.
    const content = draft.get("content");
    let run: any[] = [];
    const flushRun = (): void => {
        if (!run.length) return;
        const paragraphDraft = newNodeDraft("paragraph");
        for (const item of run) paragraphDraft.get("content").push(item);
        content.push(paragraphDraft.metamorphose());
        run = [];
    };
    for (const child of Array.from(el.childNodes)) {
        if (isBlockChild(child)) {
            flushRun();
            const blockOut: any[] = [];
            ingestNode(child, [], blockOut, ctx, false);
            for (const item of blockOut) content.push(item);
        } else ingestNode(child, [], run, ctx, true);
    }
    flushRun();
    out.push(draft.metamorphose());
}

function ingestNode(
    domNode: Node,
    marks: MarkDesc[],
    out: any[],
    ctx: Ctx,
    inInline: boolean,
): void {
    const { report } = ctx;

    if (domNode.nodeType === Node.TEXT_NODE) {
        // Wikipedia pretty-prints its HTML: newlines are not content.
        const text = (domNode.textContent ?? "").replace(/\n+/g, " ");
        if (!text.trim()) {
            report.skippedEmptyTexts++;
            return;
        }
        count(report.markSets, markSetKey(marks));
        const textDraft = newNodeDraft("text");
        textDraft.get("text").value = text;
        const marksList = textDraft.get("marks");
        for (const m of marks)
            marksList.push(
                m.kind === "style"
                    ? newGenericStyleMarkDraft(
                          textDraft,
                          m.styleName,
                          m.htmlAttrs,
                      )
                    : newSemanticMarkDraft(
                          textDraft,
                          m.name,
                          m.attrs,
                          m.htmlAttrs,
                      ),
            );
        if (!inInline) {
            // Stray text in block context (e.g. directly in <section>):
            // wrap in a paragraph — block containers hold blocks only.
            report.wrappedStrayTexts++;
            const paragraphDraft = newNodeDraft("paragraph");
            paragraphDraft.get("content").push(textDraft.metamorphose());
            out.push(paragraphDraft.metamorphose());
            return;
        }
        out.push(textDraft.metamorphose());
        return;
    }

    if (domNode.nodeType !== Node.ELEMENT_NODE)
        // comments, processing instructions, ...
        return;

    const el = domNode as Element;
    const tag = el.tagName;

    // raw-atom shortcut first: even a <p class="mw-empty-elt"> is patched
    // through as an atom, never expanded.
    // A named node type may claim this element (reproducing atom):
    // verbatim innerHTML and the collected htmlAttrs bag.
    const claimedTypeKey = resolveNodeEmission(ctx, el);
    if (claimedTypeKey !== null) {
        count(report.reproNodes, claimedTypeKey);
        const draft = newNodeDraft(claimedTypeKey),
            attrsDraft = draft.get("attrs");
        attrsDraft.set("html", toMetaModelJSON(el.innerHTML, {}));
        attrsDraft.set(
            "htmlAttrs",
            toMetaModelJSON(collectHtmlAttrs(el, ctx.attrPolicy), {}),
        );
        out.push(draft.metamorphose());
        return;
    }

    if (el.matches(SELECTORS_TO_RAW_HTML)) {
        count(report.mwEmptyElts, tag);
        emitRawHtmlAtom(el, inInline, out);
        return;
    }

    if (ctx.transparent.has(tag)) {
        ingestChildrenInto(el, marks, out, ctx, inInline);
        return;
    }

    // <li> directly under <ul> in block context: "li-inline" or
    // "li-block", decided by its children (see ingestListItem). A
    // stray <li> (wrong parent, or in inline context) falls through
    // to the catch-alls, which emit schema-safe raw_html atoms.
    if (tag === "LI" && !inInline && el.parentElement?.tagName === "UL") {
        ingestListItem(el, out, ctx);
        return;
    }

    const knownBlockTypeKey = KNOWN_BLOCK_TAGS[tag];
    if (knownBlockTypeKey !== undefined) {
        const draft = newNodeDraft(knownBlockTypeKey);
        // collect outer attributes into the htmlAttrs bag (except on doc)
        if (knownBlockTypeKey !== "doc") {
            const htmlAttrs = collectHtmlAttrs(el, ctx.attrPolicy);
            if (htmlAttrs !== "")
                draft
                    .get("attrs")
                    .set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
            for (const attrName of skippedHtmlAttrs(el, ctx.attrPolicy))
                count(
                    report.skippedMarkAttrs,
                    `${tag.toLowerCase()}.${attrName}`,
                );
        }
        // marks do not cross block boundaries; textblocks have inline content
        const childInline =
            knownBlockTypeKey === "paragraph" ||
            knownBlockTypeKey.startsWith("heading-");
        fillContent(draft, el, [], ctx, childInline);
        out.push(draft.metamorphose());
        return;
    }

    if (!inInline) {
        // Block containers (doc, section, ...) hold blocks only
        // (operator decision 2026-07-24): everything that is not a
        // known block — inline tags, mark tags, BR, unknowns — is
        // pruned into raw_html_block. Log-and-crash showed inline
        // nodes under sections crash PM's unknown_block ("block*").
        count(report.catchAllBlocks, tag);
        console.log(
            `[ingest] catch-all <${tag.toLowerCase()}> -> raw_html_block,` +
                ` parent <${el.parentElement?.tagName.toLowerCase() ?? "?"}>:`,
            el.outerHTML.slice(0, 200),
        );
        emitRawHtmlAtom(el, false, out);
        return;
    }

    // --- inline context (inside paragraph/heading) ---

    const knownMarkStyle = KNOWN_MARK_TAGS[tag];
    if (knownMarkStyle !== undefined) {
        const emission = resolveMarkEmission(ctx, el, tag, knownMarkStyle);
        if (emission.kind === "mark") {
            // Emit the schema-defined mark; harvest the attrs declared
            // by the mark spec, count and skip the rest.
            const attrs: Record<string, string> = {};
            for (const attrName of emission.attrs) {
                const value = el.getAttribute(attrName);
                if (value !== null) attrs[attrName] = value;
            }
            for (const attrName of skippedHtmlAttrs(el, ctx.attrPolicy))
                count(
                    report.skippedMarkAttrs,
                    `${tag.toLowerCase()}.${attrName}`,
                );
            ingestChildrenInto(
                el,
                [
                    ...marks,
                    {
                        kind: "mark",
                        name: emission.name,
                        attrs,
                        htmlAttrs: collectHtmlAttrs(el, ctx.attrPolicy),
                    },
                ],
                out,
                ctx,
                inInline,
            );
            return;
        }
        // generic-style fallback: collect attrs into the htmlAttrs
        // bag (policy); count only policy-excluded attrs.
        for (const attrName of skippedHtmlAttrs(el, ctx.attrPolicy))
            count(report.skippedMarkAttrs, `${tag.toLowerCase()}.${attrName}`);
        ingestChildrenInto(
            el,
            [
                ...marks,
                {
                    kind: "style",
                    styleName: emission.styleName,
                    htmlAttrs: collectHtmlAttrs(el, ctx.attrPolicy),
                },
            ],
            out,
            ctx,
            inInline,
        );
        return;
    }

    if (tag === "BR") {
        out.push(newNodeDraft("hard_break").metamorphose());
        return;
    }

    if (INLINE_TAGS.has(tag)) {
        count(report.inlineNodes, tag);
        const draft = newNodeDraft(tag.toLowerCase());
        const htmlAttrs = collectHtmlAttrs(el, ctx.attrPolicy);
        if (htmlAttrs !== "")
            draft.get("attrs").set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
        for (const attrName of skippedHtmlAttrs(el, ctx.attrPolicy))
            count(report.skippedMarkAttrs, `${tag.toLowerCase()}.${attrName}`);
        fillContent(draft, el, marks, ctx, true);
        out.push(draft.metamorphose());
        return;
    }

    // catch-all in inline context: never emit a block node here
    // (Wikipedia puts link/style/meta inside paragraphs).
    count(report.catchAllInline, tag);
    console.log(
        `[ingest] catch-all <${tag.toLowerCase()}> -> raw_html_inline,` +
            ` parent <${el.parentElement?.tagName.toLowerCase() ?? "?"}>:`,
        el.outerHTML.slice(0, 200),
    );
    emitRawHtmlAtom(el, true, out);
}

function logReport(report: IngestionReport): void {
    console.log("[ingest] mark sets:", report.markSets);
    console.log("[ingest] raw_html_block catch-all:", report.catchAllBlocks);
    console.log("[ingest] raw_html_inline catch-all:", report.catchAllInline);
    console.log("[ingest] inline nodes:", report.inlineNodes);
    console.log("[ingest] mw-empty-elt atoms:", report.mwEmptyElts);
    console.log("[ingest] reproducing nodes:", report.reproNodes);
    console.log("[ingest] skipped mark attrs:", report.skippedMarkAttrs);
    console.log("[ingest] skipped empty texts:", report.skippedEmptyTexts);
    console.log("[ingest] wrapped stray texts:", report.wrappedStrayTexts);
}

export function ingestDOM(
    doc: Document,
    options: IngestionOptions = {},
): { document: any; report: IngestionReport } {
    const ctx: Ctx = {
        report: {
            markSets: {},
            catchAllBlocks: {},
            catchAllInline: {},
            inlineNodes: {},
            mwEmptyElts: {},
            skippedMarkAttrs: {},
            unresolvedMarkRules: {},
            reproNodes: {},
            skippedEmptyTexts: 0,
            wrappedStrayTexts: 0,
        },
        transparent: new Set(
            (options.transparentContainers ?? []).map((t) => t.toUpperCase()),
        ),
        semanticMarks: options.proseMirrorSchema
            ? semanticMarksFromSchema(options.proseMirrorSchema)
            : {},
        markEmission: options.markEmission ?? [],
        nodeEmission: options.nodeEmission ?? [],
        attrPolicy: normalizeAttrPolicy(options.attrPolicy),
        nodeSelectors: options.proseMirrorSchema
            ? nodeSelectorsFromSchema(options.proseMirrorSchema)
            : [],
        schemaMarkAttrs: options.proseMirrorSchema
            ? schemaMarkAttrsFromSchema(options.proseMirrorSchema)
            : {},
    };
    const draft = newNodeDraft("doc");
    fillContent(draft, doc.body, [], ctx, false);
    const document = draft.metamorphose();
    logReport(ctx.report);
    return { document, report: ctx.report };
}

/**
 * The Wikipedia one-shot ingest, configured for TypeRoof. Ingest is a
 * one-shot operation; the caller should not have to know the options
 * (the mechanism is ingestDOM). Only proseMirrorSchema comes from the
 * live application state; everything else is decided here, once. This
 * configuration also serves as the working example for every
 * IngestionOptions field.
 */
export function ingestWikipediaDocument(
    dom: Document,
    proseMirrorSchema: any,
): { document: any; report: IngestionReport } {
    return ingestDOM(dom, {
        // The metamodel schema (ProseMirrorSchemaModel): which marks
        // exist. Schema marks are emitted for their tags by default;
        // attrs declared by the mark spec are harvested.
        proseMirrorSchema,

        // HTML tags treated as transparent containers: their children
        // pass through, no node is emitted for the element itself.
        transparentContainers: [], //e.g. ["div"],

        // Ordered [CSS selector, rule] pairs; the first selector
        // matching the element (element.matches) wins.
        markEmission: [
            // <b> and <strong> become the schema-defined "strong" mark
            // (the document "carries around" strong already; note <b>
            // is NOT the schema tag, so it needs an explicit rule).
            { selector: "b, strong", rule: { kind: "mark", name: "strong" } },
            // There is no schema mark for <i>/<em>: they become
            // generic-style intent with the style name "italic".
            {
                selector: "i, em",
                rule: { kind: "generic", styleName: "italic" },
            },
        ],

        // Ordered [CSS selector, typeKey] pairs routing elements to
        // named node types (reproducing atoms); first match wins,
        // redundancy = declared fallbacks.
        nodeEmission: [
            // Wikipedia citations become "cite-link" atoms; other <sup>
            // falls through to the existing chain (unknown_inline).
            // these are the cite links into the footnotes, e.g. [5]
            {
                selector: 'sup[typeof="mw:Extension/ref"]',
                typeKey: "cite-link",
            },
            {
                selector: 'figure > :not(figcaption)',
                typeKey: 'figcontent'
            }
        ],

        // Policy for collecting outer attributes into the htmlAttrs
        // bag of reproducing atoms: accept all except what collides
        // with TypeRoof (styling, own markers) and on* handlers.
        // Ids are kept (Wikipedia ids are mw-prefixed). TypeRoof's
        // core markers and on* are additionally guarded at replay
        // time, outside ingest.
        attrPolicy: {
            include: [/.*/],
            exclude: [
                "style",
                /^on/,
                "data-node-type",
                "data-mark-type",
                "data-style-name",
            ],
        },
    });
}

/** @deprecated shim, kept for compatibility. */
export function traverseDom(
    domNode: Node,
    _activeMarks: string[],
    _outputNodes: unknown[],
): void {
    const doc =
        domNode.nodeType === Node.DOCUMENT_NODE
            ? (domNode as Document)
            : domNode.ownerDocument;
    if (doc) ingestDOM(doc);
}
