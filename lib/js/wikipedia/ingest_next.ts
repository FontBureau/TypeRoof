// DOM -> metamodel NodeModel ingestion engine.
// Builds NodeModel drafts directly — no JSON intermediate.
// The engine is empty: all element-handling policy arrives as one
// ordered emission-rule table (IngestionOptions.emissionRules);
// without rules everything falls to the raw_html catch-alls. The
// schema contributes facts (attr harvesting, inline-content-ness),
// not rules — rule derivation from the schema is explicit, via
// atomRulesFromSchema/markRulesFromSchema, composed by the setup.
// The Wikipedia setup lives at the bottom of this module, next to
// ingestWikipediaDocument.
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

export interface IngestionReport {
    // mark-set histogram, e.g. { "[bold, italic]": 2, "[bold]": 1, "[]": 5 }
    markSets: Record<string, number>;
    // tag -> count of raw_html_block catch-all emissions (block context)
    catchAllBlocks: Record<string, number>;
    // tag -> count of raw_html_inline catch-all emissions (inline context)
    catchAllInline: Record<string, number>;
    // tag -> count of inline-node emissions
    inlineNodes: Record<string, number>;
    // tag -> count of raw_html atoms emitted by `raw` rules (e.g.
    // mw-empty-elt metadata islands)
    rawAtoms: Record<string, number>;
    // tag -> count of skipped nodes
    skippedNodes: Record<string, number>;
    // "tag.attr" -> count of policy-excluded (not collected) element
    // attrs — fed by blocks, marks, inline nodes and list items alike
    skippedHtmlAttrs: Record<string, number>;
    // mark name -> count of `mark` rules that fell back to intent
    // because the schema does not define the named mark
    unresolvedMarkRules: Record<string, number>;
    // node typeKey -> count of reproducing-atom emissions (`atom` rules)
    reproNodes: Record<string, number>;
    skippedEmptyTexts: number;
    // inline runs lifted into liftedRunWrapper nodes in block
    // context (see fillBlockContent) — tells a lot about the shape
    // of the source
    liftedRuns: number;
}

export interface SemanticMark {
    // mark typeKey in the schema
    name: string;
    // attribute names to harvest from the DOM element (1:1 attr-name
    // mapping, as created by createProseMirrorSchemaFromMetaModel)
    attrs: string[];
}

// A [selector, typeKey] pair as derived from schema node specs (see
// nodeSelectorsFromSchema).
export interface NodeEmissionEntry {
    selector: string;
    typeKey: string;
}

// Where an element is being ingested: as a child of a blocks-only
// container ("block") or inside a textblock/mark descent ("inline").
export type EmissionContext = "block" | "inline";

// The unified rule vocabulary — how a matched element is emitted:
// - block: a container/textblock node; inlineContent declares whether
//   its children are inline (the no-schema fallback; the schema's
//   content expression wins when it knows the typeKey).
// - mark: a schema-defined mark, attrs harvested from the element;
//   naming a mark the schema does not define falls back to intent
//   (generic-style) and is counted in report.unresolvedMarkRules.
// - generic: intent, the generic-style mark with data-style-name.
// - inline-node: an inline node; typeKey defaults to the lowercased
//   tag name (-> reserved unknown_inline via sync).
// - atom: a reproducing atom (verbatim innerHTML + htmlAttrs bag).
// - raw: a raw_html_block/raw_html_inline atom by context, outerHTML
//   verbatim, no descent.
// - void: a childless node, e.g. br -> hard_break.
// - transparent: no node, children pass through.
// - skip: nothing emitted, no descent.
// - split-item: inlineTypeKey without block-level children, else
//   blockTypeKey with inline runs lifted into liftedRunWrapper
//   nodes (e.g. li -> li-inline/li-block).
export type EmissionRule =
    | { kind: "block"; typeKey: string; inlineContent?: boolean }
    | { kind: "mark"; name: string }
    | { kind: "generic"; styleName: string }
    | { kind: "inline-node"; typeKey?: string }
    | { kind: "atom"; typeKey: string }
    | { kind: "raw" }
    | { kind: "void"; typeKey: string }
    | { kind: "transparent" }
    | { kind: "skip" }
    | {
          kind: "split-item";
          inlineTypeKey: string;
          blockTypeKey: string;
      };

// An ordered emission entry: the first entry whose rule fits the
// current context and whose selector matches (element.matches) wins.
// The optional context field narrows matching further; kind-intrinsic
// fit applies regardless (mark/generic/inline-node/void are
// inline-only; block/split-item are block-only; atom/raw/transparent/
// skip fit both).
export interface EmissionRuleEntry {
    selector: string;
    rule: EmissionRule;
    context?: EmissionContext;
}

// Sink for ingest diagnostics (catch-all hits, the final report).
export interface IngestLogger {
    log(...args: unknown[]): void;
}

const NOOP_LOGGER: IngestLogger = { log: () => undefined };

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
// for report.skippedHtmlAttrs counting.
function policyExcludedAttrNames(
    el: Element,
    policy: HtmlAttrPolicy = {},
): string[] {
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
    // The metamodel schema (ProseMirrorSchemaModel). Contributes
    // FACTS, not rules: attr names to harvest for `mark` rules,
    // declared node attrs (htmlTag opt-in of `atom` rules), and which
    // block typeKeys hold inline content. To also derive rules from
    // it, compose atomRulesFromSchema/markRulesFromSchema into
    // emissionRules — the position in the table is the caller's
    // decision (see ingestWikipediaDocument).
    proseMirrorSchema?: any;
    // Policy for collecting outer attributes into the htmlAttrs bag
    // (see HtmlAttrPolicy): conjunctive include/exclude matcher
    // lists. The configured variant bakes in: accept all except style
    // (collides with TypeRoof styling), on* handlers and TypeRoof's
    // own markers.
    attrPolicy?: HtmlAttrPolicy;
    // The ordered emission table (see EmissionRuleEntry) — the ONLY
    // source of element-handling policy. Elements matching no entry
    // fall to the context catch-all (raw_html_block /
    // raw_html_inline). Empty/omitted: everything is caught (the
    // empty-engine contract).
    emissionRules?: EmissionRuleEntry[];
    // typeKey wrapping inline runs where blocks are required: stray
    // text in block context and the inline runs inside a split-item's
    // block variant. Default "paragraph".
    liftedRunWrapper?: string;
    // Diagnostics sink; silent by default. The wikipedia variant
    // passes `console`.
    logger?: IngestLogger;
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

// Create a mark draft for `marksList`: typeKey plus attrs (values via
// toMetaModelJSON); a non-empty htmlAttrs bag is appended last.
// Generic-style intent is expressed through this too: typeKey
// "generic-style" with a "data-style-name" attr.
function newMarkDraft(
    marksList: any,
    typeKey: string,
    attrs: Record<string, string>,
    htmlAttrs: string = "",
): any {
    const markDraft = marksList.constructor.Model.createPrimalDraft({});
    markDraft.get("typeKey").value = typeKey;
    const attrsDraft = markDraft.get("attrs");
    for (const [attrName, value] of Object.entries(attrs))
        attrsDraft.set(attrName, toMetaModelJSON(value, {}));
    if (htmlAttrs !== "")
        attrsDraft.set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
    return markDraft;
}

// Derive mark name -> declared attr names from the metamodel schema
// (ProseMirrorSchemaModel), for attr harvest of `mark` rules.
function schemaMarkAttrsFromSchema(
    proseMirrorSchema: any,
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [name, markSpec] of proseMirrorSchema.get("marks"))
        result[name] = Array.from(markSpec.get("attrs").keys());
    return result;
}

// Derive node typeKey -> declared attr names from the metamodel
// schema (ProseMirrorSchemaModel). Reproducing atoms opt into
// reproducing their source tag by declaring the "htmlTag" attr;
// setting an attr the spec does not declare would be a schema error.
function schemaNodeAttrsFromSchema(
    proseMirrorSchema: any,
): Record<string, Set<string>> {
    const result: Record<string, Set<string>> = {};
    for (const [typeKey, nodeSpec] of proseMirrorSchema.get("nodes"))
        result[typeKey] = new Set(nodeSpec.get("attrs").keys());
    return result;
}

// Derive the set of node typeKeys with inline content ("inline*",
// "inline+") from the metamodel schema — the textblocks, whose
// children are ingested in inline context so that marks apply.
// Schema-derived rather than hard-coded: a new textblock needs its
// schema entry only, no rule edit. For typeKeys the schema does not
// declare, block rules fall back to their own inlineContent flag
// (see the block emission in ingestNode).
function inlineContentNodesFromSchema(
    proseMirrorSchema: any,
): ReadonlySet<string> {
    const result = new Set<string>();
    for (const [typeKey, nodeSpec] of proseMirrorSchema.get("nodes")) {
        const content = nodeSpec.get("content");
        if (!content.isEmpty && /^inline[*+]$/.test(content.value))
            result.add(typeKey);
    }
    return result;
}

// The FACTS ingest derives from the metamodel schema, in one pass —
// deliberately no rules (see atomRulesFromSchema/markRulesFromSchema
// for those). inlineContentNodes is null without a schema: block
// rules then fall back to their own inlineContent flag (see the
// block emission).
interface SchemaFacts {
    schemaMarkAttrs: Readonly<Record<string, string[]>>;
    schemaNodeAttrs: Readonly<Record<string, ReadonlySet<string>>>;
    inlineContentNodes: ReadonlySet<string> | null;
}

function deriveSchemaFacts(proseMirrorSchema: any): SchemaFacts {
    if (!proseMirrorSchema)
        return {
            schemaMarkAttrs: {},
            schemaNodeAttrs: {},
            inlineContentNodes: null,
        };
    return {
        schemaMarkAttrs: schemaMarkAttrsFromSchema(proseMirrorSchema),
        schemaNodeAttrs: schemaNodeAttrsFromSchema(proseMirrorSchema),
        inlineContentNodes: inlineContentNodesFromSchema(proseMirrorSchema),
    };
}

// Derive [{ selector, typeKey }] from node specs that carry a
// non-empty selector. Deliberately NOT from tag-only specs: a tag
// like paragraph's "p" would hijack the block rules for that tag.
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

// Derive `atom` rule entries from the schema: node specs with a
// selector claim their elements as reproducing atoms. Compose into
// emissionRules where the setup wants them (see
// ingestWikipediaDocument).
export function atomRulesFromSchema(
    proseMirrorSchema: any,
): EmissionRuleEntry[] {
    return nodeSelectorsFromSchema(proseMirrorSchema).map(
        ({ selector, typeKey }): EmissionRuleEntry => ({
            selector,
            rule: { kind: "atom", typeKey },
        }),
    );
}

// Derive `mark` rule entries from the schema: marks with a tag are
// emitted for that tag. Compose into emissionRules where the setup
// wants them — typically after explicit mark rules, so those can
// override, and before generic styles, so the schema wins over
// intent for its tags.
export function markRulesFromSchema(
    proseMirrorSchema: any,
): EmissionRuleEntry[] {
    return Object.entries(semanticMarksFromSchema(proseMirrorSchema)).map(
        ([tagName, { name }]): EmissionRuleEntry => ({
            selector: tagName,
            rule: { kind: "mark", name },
        }),
    );
}

// Kind-intrinsic context fit (see EmissionRuleEntry), narrowed
// further by an entry's optional context field.
function ruleFitsContext(entry: EmissionRuleEntry, inInline: boolean): boolean {
    if (
        entry.context !== undefined &&
        (entry.context === "inline") !== inInline
    )
        return false;
    switch (entry.rule.kind) {
        case "mark":
        case "generic":
        case "inline-node":
        case "void":
            return inInline;
        case "block":
        case "split-item":
            return !inInline;
        default:
            // atom, raw, transparent, skip
            return true;
    }
}

// The one ordered lookup: first entry that fits the context and
// matches the element wins; null falls to the context catch-all.
// Pure — no reporting side effects (also used for classification,
// see emitSplitItem).
function findMatchingRule(
    ctx: Ctx,
    el: Element,
    inInline: boolean,
): EmissionRule | null {
    for (const entry of ctx.rules) {
        if (!ruleFitsContext(entry, inInline)) continue;
        if (el.matches(entry.selector)) return entry.rule;
    }
    return null;
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
    // the one ordered emission table (options.emissionRules verbatim)
    rules: readonly EmissionRuleEntry[];
    schemaMarkAttrs: Readonly<Record<string, string[]>>;
    schemaNodeAttrs: Readonly<Record<string, ReadonlySet<string>>>;
    // null without a schema (block rules use their inlineContent flag)
    inlineContentNodes: ReadonlySet<string> | null;
    attrPolicy: HtmlAttrPolicy;
    // wraps inline runs where blocks are required (options)
    liftedRunWrapper: string;
    logger: IngestLogger;
}

// Count the attributes the policy excludes on `el` into
// report.skippedHtmlAttrs, keyed "tag.attr".
function countSkippedHtmlAttrs(ctx: Ctx, el: Element): void {
    const tagLabel = el.tagName.toLowerCase();
    for (const attrName of policyExcludedAttrNames(el, ctx.attrPolicy))
        count(ctx.report.skippedHtmlAttrs, `${tagLabel}.${attrName}`);
}

// Collect el's outer attributes into the draft's htmlAttrs bag (only
// when non-empty) and count the policy-excluded ones. NOT used by the
// reproducing-atom branch, which sets the bag unconditionally (the
// spec declares the attr) and does not count exclusions — the atom
// reproduces, it does not edit.
function setHtmlAttrsBag(draft: any, el: Element, ctx: Ctx): void {
    const htmlAttrs = collectHtmlAttrs(el, ctx.attrPolicy);
    if (htmlAttrs !== "")
        draft.get("attrs").set("htmlAttrs", toMetaModelJSON(htmlAttrs, {}));
    countSkippedHtmlAttrs(ctx, el);
}

function setHtmlTag(rule: EmissionRule, draft: any, el: Element, ctx: Ctx) {
    if (
        "typeKey" in rule &&
        ctx.schemaNodeAttrs[rule.typeKey]?.has("htmlTag")
    ) {
        const attrsDraft = draft.get("attrs");
        attrsDraft.set(
            "htmlTag",
            toMetaModelJSON(el.tagName.toLowerCase(), {}),
        );
    }
}

// Harvest the attr values declared by a mark spec from the element
// (missing attributes are omitted).
function harvestDeclaredAttrs(
    el: Element,
    names: readonly string[],
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const name of names) {
        const value = el.getAttribute(name);
        if (value !== null) result[name] = value;
    }
    return result;
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
    const out: any[] = [];
    ingestChildrenInto(el, marks, out, ctx, inInline);
    const content = draft.get("content");
    for (const item of out) content.push(item);
}

// Whether a child joins an inline run in block context (scoped
// run-lifting, operator decision 2026-08-03): text nodes always;
// elements iff they resolve EXCLUSIVELY in inline context — a
// block-context resolution (block, split-item, unrestricted atom,
// raw, transparent) keeps its block handling (a figcontent
// atom must stay a direct child of figure, a raw metadata island
// stays a raw_html_block). Elements resolving in NEITHER context are
// not run members either: they break the run and fall to the loud
// block catch-all — the discovery guarantee.
// NOTE: skip is now treated as a run member as it won't play a role in the result
function isRunMember(ctx: Ctx, child: Node): boolean {
    if (child.nodeType === Node.TEXT_NODE) return true;
    if (child.nodeType !== Node.ELEMENT_NODE) return false;
    const el = child as Element;
    const inlineRule = findMatchingRule(ctx, el, true);
    if (inlineRule?.kind === "skip") return true;
    return findMatchingRule(ctx, el, false) === null && inlineRule !== null;
}

// Fill block-only content (doc root, non-textblock `block` rules,
// a split-item's block variant): consecutive run members (see
// isRunMember) are ingested in inline context and lifted into ONE
// liftedRunWrapper node per run — marks apply, hard_breaks stay
// breaks, sentences stay sentences. Whitespace-only runs produce no
// wrapper (the text branch skips empty texts, the flush guards on
// content). Everything else is ingested in block context; comments
// and processing instructions are dropped without breaking the run.
// `sink` takes metamorphosed nodes: a content draft or a plain array.
function fillBlockContent(sink: any, el: Node, ctx: Ctx): void {
    let run: any[] = [];
    const flushRun = (): void => {
        if (!run.length) return;
        const wrapperDraft = newNodeDraft(ctx.liftedRunWrapper);
        for (const item of run) wrapperDraft.get("content").push(item);
        sink.push(wrapperDraft.metamorphose());
        ctx.report.liftedRuns++;
        run = [];
    };
    for (const child of Array.from(el.childNodes)) {
        if (isRunMember(ctx, child)) {
            ingestNode(child, [], run, ctx, true);
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE)
            // comments, processing instructions: dropped, run intact
            continue;
        flushRun();
        const blockOut: any[] = [];
        ingestNode(child, [], blockOut, ctx, false);
        for (const item of blockOut) sink.push(item);
    }
    flushRun();
}

// Emit a split-item element, e.g. <li> (operator decision
// 2026-08-03). With inline content only (every element child is a
// run member, see isRunMember) it becomes the inlineTypeKey node.
// Otherwise it becomes the blockTypeKey node, whose content is
// filled by the general block filler — inline runs lifted, non-run
// elements as blocks (including catch-all fallout for elements that
// resolve nowhere, e.g. an unconfigured <table>). For li: both types
// share tag "li" and group "li"; the group keeps ul's content
// expression ("li+") open for further li sorts. (A node type
// literally named "li" would shadow the group in content
// expressions — prosemirror-model resolves type names first.)
function emitSplitItem(
    el: Element,
    rule: Extract<EmissionRule, { kind: "split-item" }>,
    out: any[],
    ctx: Ctx,
): void {
    const hasBlockChild = Array.from(el.childNodes).some(
        (child) =>
            child.nodeType === Node.ELEMENT_NODE && !isRunMember(ctx, child),
    );
    const draft = newNodeDraft(
        hasBlockChild ? rule.blockTypeKey : rule.inlineTypeKey,
    );
    setHtmlAttrsBag(draft, el, ctx);
    setHtmlTag(rule, draft, el, ctx);
    if (hasBlockChild) fillBlockContent(draft.get("content"), el, ctx);
    else
        // marks do not cross block boundaries; inline content only
        fillContent(draft, el, [], ctx, true);
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
                    ? newMarkDraft(
                          marksList,
                          "generic-style",
                          { "data-style-name": m.styleName },
                          m.htmlAttrs,
                      )
                    : newMarkDraft(marksList, m.name, m.attrs, m.htmlAttrs),
            );
        // In block context, fillBlockContent gathers text into
        // inline runs before this branch runs — no wrapping here.
        out.push(textDraft.metamorphose());
        return;
    }

    if (domNode.nodeType !== Node.ELEMENT_NODE)
        // comments, processing instructions, ...
        return;

    const el = domNode as Element;
    const rule = findMatchingRule(ctx, el, inInline);

    if (rule === null) {
        // Context catch-alls. Block containers hold blocks only
        // (operator decision 2026-07-24): unmatched elements are
        // pruned into raw_html_block — log-and-crash showed inline
        // nodes under sections crash PM's unknown_block ("block*").
        // In inline context never emit a block node here (Wikipedia
        // puts link/style/meta inside paragraphs).
        const tagLabel = el.tagName.toLowerCase(),
            variant = inInline ? "raw_html_inline" : "raw_html_block";
        count(
            inInline ? report.catchAllInline : report.catchAllBlocks,
            el.tagName,
        );
        ctx.logger.log(
            `[ingest] catch-all <${tagLabel}> -> ${variant},` +
                ` parent <${el.parentElement?.tagName.toLowerCase() ?? "?"}>:`,
            el.outerHTML.slice(0, 200),
        );
        emitRawHtmlAtom(el, inInline, out);
        return;
    }

    switch (rule.kind) {
        case "atom": {
            // A named node type claims this element (reproducing
            // atom): verbatim innerHTML and the collected htmlAttrs
            // bag — set unconditionally, no exclusion counting: the
            // atom reproduces, it does not edit.
            count(report.reproNodes, rule.typeKey);
            const draft = newNodeDraft(rule.typeKey),
                attrsDraft = draft.get("attrs");
            attrsDraft.set("html", toMetaModelJSON(el.innerHTML, {}));
            attrsDraft.set(
                "htmlAttrs",
                toMetaModelJSON(collectHtmlAttrs(el, ctx.attrPolicy), {}),
            );
            // A reproducing atom that claims elements of varying
            // tags — e.g. "figcontent", matching an <a>-wrapped
            // <img>, a bare <img> or a <pre> — declares the "htmlTag"
            // attr; then the source tag is reproduced as well, and
            // the spec tag only serves as the fallback (see
            // _createReproducingToDOM).
            if (ctx.schemaNodeAttrs[rule.typeKey]?.has("htmlTag"))
                attrsDraft.set(
                    "htmlTag",
                    toMetaModelJSON(el.tagName.toLowerCase(), {}),
                );
            out.push(draft.metamorphose());
            return;
        }
        case "raw":
            // patched through verbatim, never expanded — even a
            // <p class="mw-empty-elt">
            count(report.rawAtoms, el.tagName);
            emitRawHtmlAtom(el, inInline, out);
            return;
        case "transparent":
            // in block context the children need run-lifting too —
            // text directly in a transparent container must not leak
            // into block content unwrapped
            if (inInline) ingestChildrenInto(el, marks, out, ctx, true);
            else fillBlockContent(out, el, ctx);
            return;
        case "skip":
            count(report.skippedNodes, el.tagName);
            return;
        case "split-item":
            emitSplitItem(el, rule, out, ctx);
            return;
        case "block": {
            const draft = newNodeDraft(rule.typeKey);
            setHtmlAttrsBag(draft, el, ctx);
            setHtmlTag(rule, draft, el, ctx);
            // marks do not cross block boundaries; textblocks have
            // inline content — the schema's content expression wins
            // for typeKeys it declares, else the rule's own flag.
            const childInline =
                ctx.inlineContentNodes !== null &&
                ctx.schemaNodeAttrs[rule.typeKey] !== undefined
                    ? ctx.inlineContentNodes.has(rule.typeKey)
                    : (rule.inlineContent ?? false);
            if (childInline) fillContent(draft, el, [], ctx, true);
            else fillBlockContent(draft.get("content"), el, ctx);
            out.push(draft.metamorphose());
            return;
        }
        case "mark":
        case "generic": {
            // No node: push a MarkDesc and descend. Schema-declared
            // attrs are harvested for "mark" emissions; a "mark" rule
            // naming a mark the schema does not define falls back to
            // intent with the rule name and is reported. Either way
            // the policy collects the htmlAttrs bag and counts the
            // excluded attrs.
            const htmlAttrs = collectHtmlAttrs(el, ctx.attrPolicy);
            const declaredAttrs =
                rule.kind === "mark"
                    ? ctx.schemaMarkAttrs[rule.name]
                    : undefined;
            let markDesc: MarkDesc;
            if (rule.kind === "mark" && declaredAttrs === undefined) {
                count(report.unresolvedMarkRules, rule.name);
                markDesc = {
                    kind: "style",
                    styleName: rule.name,
                    htmlAttrs,
                };
            } else if (rule.kind === "mark")
                markDesc = {
                    kind: "mark",
                    name: rule.name,
                    attrs: harvestDeclaredAttrs(el, declaredAttrs ?? []),
                    htmlAttrs,
                };
            else
                markDesc = {
                    kind: "style",
                    styleName: rule.styleName,
                    htmlAttrs,
                };
            countSkippedHtmlAttrs(ctx, el);
            ingestChildrenInto(el, [...marks, markDesc], out, ctx, inInline);
            return;
        }
        case "void":
            out.push(newNodeDraft(rule.typeKey).metamorphose());
            return;
        case "inline-node": {
            count(report.inlineNodes, el.tagName);
            const draft = newNodeDraft(
                rule.typeKey ?? el.tagName.toLowerCase(),
            );
            setHtmlAttrsBag(draft, el, ctx);
            setHtmlTag(rule, draft, el, ctx);
            fillContent(draft, el, marks, ctx, true);
            out.push(draft.metamorphose());
            return;
        }
    }
}

function logReport(logger: IngestLogger, report: IngestionReport): void {
    logger.log("[ingest] mark sets:", report.markSets);
    logger.log("[ingest] raw_html_block catch-all:", report.catchAllBlocks);
    logger.log("[ingest] raw_html_inline catch-all:", report.catchAllInline);
    logger.log("[ingest] inline nodes:", report.inlineNodes);
    logger.log("[ingest] raw atoms:", report.rawAtoms);
    logger.log("[ingest] reproducing nodes:", report.reproNodes);
    logger.log("[ingest] skipped nodes:", report.skippedNodes);
    logger.log("[ingest] skipped html attrs:", report.skippedHtmlAttrs);
    logger.log("[ingest] unresolved mark rules:", report.unresolvedMarkRules);
    logger.log("[ingest] skipped empty texts:", report.skippedEmptyTexts);
    logger.log("[ingest] lifted runs:", report.liftedRuns);
}

export function ingestDOM(
    doc: Document,
    options: IngestionOptions = {},
): { document: any; report: IngestionReport } {
    const facts = deriveSchemaFacts(options.proseMirrorSchema);
    const ctx: Ctx = {
        report: {
            markSets: {},
            catchAllBlocks: {},
            catchAllInline: {},
            inlineNodes: {},
            rawAtoms: {},
            skippedNodes: {},
            skippedHtmlAttrs: {},
            unresolvedMarkRules: {},
            reproNodes: {},
            skippedEmptyTexts: 0,
            liftedRuns: 0,
        },
        rules: options.emissionRules ?? [],
        schemaMarkAttrs: facts.schemaMarkAttrs,
        schemaNodeAttrs: facts.schemaNodeAttrs,
        inlineContentNodes: facts.inlineContentNodes,
        attrPolicy: normalizeAttrPolicy(options.attrPolicy),
        liftedRunWrapper: options.liftedRunWrapper ?? "paragraph",
        logger: options.logger ?? NOOP_LOGGER,
    };
    const draft = newNodeDraft("doc");
    fillBlockContent(draft.get("content"), doc.body, ctx);
    const document = draft.metamorphose();
    logReport(ctx.logger, ctx.report);
    return { document, report: ctx.report };
}

/**
 * ============================================================
 * SETUP — everything below is configuration, not engine.
 * ============================================================
 *
 * The rule sets composed by ingestWikipediaDocument, exported so
 * tests (and future setups) can reuse or recombine the segments.
 * Ordering inside emissionRules is precedence: first fitting match
 * wins.
 */

export const WIKIPEDIA_SKIP_RULES: readonly EmissionRuleEntry[] = [
    { selector: "style", rule: { kind: "skip" } },
    // Wikipedia metadata islands (Parsoid's "mw-empty-elt"): spans — and
    // occasionally <p>s — carrying link/meta/style children with metadata.
    // We could keep them as atoms (see below commented out in WIKIPEDIA_ATOM_RULES
    // but especially the <style> tags tamper with our styles and it is
    // just simpler to ignore them for now.
    {
        selector:
            ".mw-empty-elt, meta, [rel='mw:PageProp/Category'], [rel='mw-deduplicated-inline-style']",
        rule: { kind: "skip" },
    },
];

export const WIKIPEDIA_TRANSPARENT_RULES: readonly EmissionRuleEntry[] = [
    // a block that doesn't do anyting for us currently, we could keep it,
    // to stay faithful to the source document, but droping it should
    // be good enough for now.
    // It carries the attributes: <div about="#mwt207" id="mwAro">
    // Found this is within:
    //      <section>
    //          <h2#References
    //          <section>
    //              <h3#Citations
    //              <div <-- our target>
    //                  <div typeof="mw:Extension/references">
    {
        selector: 'div:has(> [typeof="mw:Extension/references"])',
        rule: { kind: "transparent" },
    },
    {
        selector: ".side-box-flex",
        rule: { kind: "transparent" },
    },
];

export const WIKIPEDIA_RAW_RULES: readonly EmissionRuleEntry[] = [];

// Reproducing atoms. These claims are also derivable from the state
// schema (atomRulesFromSchema — the node specs carry the same
// selectors); they are declared explicitly here so the setup is
// complete on its own and does not silently change with the schema.
export const WIKIPEDIA_ATOM_RULES: readonly EmissionRuleEntry[] = [
    // Wikipedia citations (the [5]-style footnote links) become
    // "cite-link" atoms; other <sup> falls through to the phrasing
    // rules (-> inline node). Inline-only: a citation stray in block
    // context degrades to the raw_html_block catch-all instead of
    // crashing PM's block* content.
    {
        selector: "sup.reference",
        rule: { kind: "atom", typeKey: "cite-link" },
        context: "inline",
    },
    {
        selector: "sup:not(.reference)",
        rule: { kind: "atom", typeKey: "reproduce-as-inline" },
        context: "inline",
    },
    // figure content (thumb <a><img></a>, bare <img>, <pre>, ...):
    // reproduced verbatim; the spec declares htmlTag, so the source
    // tag survives round-trips.
    {
        selector: "figure > :not(figcaption)",
        rule: { kind: "atom", typeKey: "figcontent" },
    },

    // These types can be used to stay faithful to the source, depending
    // on the context of the matching element, we use other reproducers
    // {
    //     selector: ".mw-empty-elt, meta, [rel='mw:PageProp/Category'], [rel='mw-deduplicated-inline-style']",
    //     rule: { kind: "atom", typeKey: "reproduce-as-inline" },
    //     context: "inline",
    // },
    // {
    //     selector: ".mw-empty-elt, meta, [rel='mw:PageProp/Category'], [rel='mw-deduplicated-inline-style']",
    //     rule: { kind: "atom", typeKey: "reproduce-as-block" },
    //     context: "block",
    // },
    {
        selector: ".mw-cite-backlink",
        rule: { kind: "atom", typeKey: "reproduce-as-inline" },
        context: "inline",
    },
    // <bdi> is used for ISBN numbers in references of books
    {
        selector: "bdi",
        rule: { kind: "atom", typeKey: "reproduce-as-inline" },
        context: "inline",
    },
    {
        selector: '[typeof="mw:Entity"]',
        rule: { kind: "atom", typeKey: "reproduce-as-inline" },
        context: "inline",
    },
    {
        selector: ".side-box-image",
        rule: { kind: "atom", typeKey: "reproduce-as-block" },
    },
];

// Article structure. Operator-confirmed initial known-set
// (2026-07-24), evolving from observation, not upfront assumptions.
// SECTION holds blocks only: sections structure the article.
// FIGCAPTION is inline-only like a paragraph (operator decision
// 2026-08-03); should captions carrying block children turn up in
// the wild, the way forward is the <li> precedent — a split-item
// rule with figcaption-inline/figcaption-block — not a widening.
// inlineContent flags are the no-schema fallback; the state schema's
// content expressions win for the typeKeys they declare.
export const WIKIPEDIA_BLOCK_RULES: readonly EmissionRuleEntry[] = [
    { selector: "section", rule: { kind: "block", typeKey: "section" } },
    { selector: "blockquote", rule: { kind: "block", typeKey: "blockquote" } },
    {
        selector: "p",
        rule: { kind: "block", typeKey: "paragraph", inlineContent: true },
    },
    ...([1, 2, 3, 4, 5, 6] as const).map(
        (level): EmissionRuleEntry => ({
            selector: `h${level}`,
            rule: {
                kind: "block",
                typeKey: `heading-${level}`,
                // the state schema declares heading-1..3; 4..6 land
                // on unknown_block via sync either way
                inlineContent: level <= 3,
            },
        }),
    ),
    { selector: "ol, ul", rule: { kind: "block", typeKey: "list" } },
    // <li> directly under <ul> or <ol>: li-inline or li-block, decided by
    // the children (see emitSplitItem). A stray <li> matches nothing
    // and falls to the catch-alls. Both types share tag "li" and
    // group "li"; the group keeps ul's content expression ("li+")
    // open for further li sorts. (A node type literally named "li"
    // would shadow the group in content expressions —
    // prosemirror-model resolves type names first.)
    {
        selector: ":is(ul, ol) > li",
        rule: {
            kind: "split-item",
            inlineTypeKey: "li-inline",
            blockTypeKey: "li-block",
        },
    },
    { selector: "figure", rule: { kind: "block", typeKey: "figure" } },
    {
        selector: "figcaption",
        rule: { kind: "block", typeKey: "figcaption", inlineContent: true },
    },
    {
        selector: ".side-box",
        rule: { kind: "block", typeKey: "sidebox" },
    },
    {
        selector: ".side-box-text",
        rule: { kind: "block", typeKey: "sideboxtext", inlineContent: true },
    },
    {
        selector: ".hatnote",
        rule: { kind: "block", typeKey: "hatnote", inlineContent: true },
    },
    {
        selector: ".shortdescription",
        rule: {
            kind: "block",
            typeKey: "shortdescription",
            inlineContent: true,
        },
    },
    // generic-block: we keep these but not primarily for styling, only
    // for structure '[typeof="mw:Extension/references"]'
    {
        selector: ".mw-references-wrap",
        rule: { kind: "block", typeKey: "generic-block" },
    },
    {
        selector: ".refbegin",
        rule: { kind: "block", typeKey: "generic-block" },
    },
    {
        selector: "cite",
        rule: { kind: "inline-node", typeKey: "generic-inline" },
    },
    {
        selector: ".mw-reference-text",
        rule: { kind: "inline-node", typeKey: "generic-inline" },
    },
    {
        selector: "q",
        rule: { kind: "inline-node", typeKey: "quote" },
    },
];

// Mark emission. First fitting match wins, so these precede the
// generic styles in HTML_PHRASING_RULES for the same tags.
export const WIKIPEDIA_MARK_RULES: readonly EmissionRuleEntry[] = [
    // <b> and <strong> become the schema-defined "strong" mark (the
    // document "carries around" strong already; note <b> is NOT the
    // schema tag, so schema derivation alone would not cover it).
    { selector: "b, strong", rule: { kind: "mark", name: "strong" } },
    // There is no schema mark for <i>/<em>: they become
    // generic-style intent with the style name "italic".
    { selector: "i, em", rule: { kind: "generic", styleName: "italic" } },
    // <a> becomes the schema-defined "link" mark (equivalent to what
    // markRulesFromSchema would derive; explicit for completeness).
    { selector: "a", rule: { kind: "mark", name: "link" } },
];

// Generic HTML phrasing content — not Wikipedia-specific. Inline
// elements become inline NODES (typeKey = tag name, -> reserved
// unknown_inline via sync), because HTML inline != mark (operator
// decision 2026-07-24). Mark rules for the same tags must precede
// this set. BR is a void: hard_break.
export const HTML_PHRASING_RULES: readonly EmissionRuleEntry[] = [
    { selector: "br", rule: { kind: "void", typeKey: "hard_break" } },
    {
        selector: [
            "abbr",
            "b",
            "bdi",
            "bdo",
            "cite",
            "code",
            "data",
            "dfn",
            "em",
            "i",
            "kbd",
            "mark",
            "q",
            "s",
            "samp",
            "small",
            "span",
            "strong",
            "sub",
            "sup",
            "time",
            "u",
            "var",
            "wbr",
            "a",
            "ins",
            "del",
        ].join(", "),
        rule: { kind: "inline-node" },
    },
];

// Policy for collecting outer attributes into the htmlAttrs bag:
// accept all except what collides with TypeRoof (styling, own
// markers) and on* handlers. Ids are kept (Wikipedia ids are
// mw-prefixed). TypeRoof's core markers and on* are additionally
// guarded at replay time, outside ingest.
export const WIKIPEDIA_ATTR_POLICY: HtmlAttrPolicy = {
    include: [/.*/],
    exclude: [
        "style",
        /^on/,
        "data-node-type",
        "data-mark-type",
        "data-style-name",
    ],
};

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
        // The metamodel schema (ProseMirrorSchemaModel): contributes
        // facts — attrs declared by mark specs are harvested for
        // `mark` rules, node specs' htmlTag opt-in, textblock
        // detection for `block` rules.
        proseMirrorSchema,

        // The complete, ordered element-handling policy. Rules the
        // schema could derive (atomRulesFromSchema/
        // markRulesFromSchema) are declared explicitly instead: the
        // setup should read as one document and not silently change
        // with the schema.
        emissionRules: [
            ...WIKIPEDIA_TRANSPARENT_RULES,
            ...WIKIPEDIA_SKIP_RULES,
            ...WIKIPEDIA_RAW_RULES,
            ...WIKIPEDIA_ATOM_RULES,
            ...WIKIPEDIA_BLOCK_RULES,
            ...WIKIPEDIA_MARK_RULES,
            ...HTML_PHRASING_RULES,
        ],

        attrPolicy: WIKIPEDIA_ATTR_POLICY,

        // Inline runs that need a block wrapper (stray text, li-block
        // runs) become paragraphs.
        liftedRunWrapper: "paragraph",

        // Diagnostics: the demo wants the catch-all lines and the
        // report on the console (the engine is silent by default).
        logger: console,
    });
}
