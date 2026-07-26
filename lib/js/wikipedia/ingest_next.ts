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
    // these are the cite links into the footnotes, e.g. [5]
    MW_INLINE_CITATION = `sup[typeof="mw:Extension/ref"]`;
// Elements matching any of these selectors are patched through as raw
// atoms (raw_html_block / raw_html_inline by context), no descent.
const SELECTORS_TO_RAW_HTML = [MW_EMPTY_ELT, MW_INLINE_CITATION].join(", ");

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
    skippedEmptyTexts: number;
    // non-empty text nodes found directly in block context; each was
    // wrapped in a paragraph so block containers hold blocks only
    wrappedStrayTexts: number;
}

export interface IngestionOptions {
    // Tag names treated as transparent containers (children pass
    // through, no node emitted). Initially empty — the transparency
    // decision is deferred until real articles have been examined.
    transparentContainers?: string[];
}

function newNodeDraft(typeKey: string): any {
    const draft = NodeModel.createPrimalDraft({});
    draft.get("typeKey").value = typeKey;
    return draft;
}

function newGenericStyleMarkDraft(nodeDraft: any, styleName: string): any {
    const marksList = nodeDraft.get("marks");
    const markDraft = marksList.constructor.Model.createPrimalDraft({});
    markDraft.get("typeKey").value = "generic-style";
    markDraft
        .get("attrs")
        .set("data-style-name", toMetaModelJSON(styleName, {}));
    return markDraft;
}

function markSetKey(marks: string[]): string {
    return `[${[...new Set(marks)].sort().join(", ")}]`;
}

function count(record: Record<string, number>, key: string): void {
    record[key] = (record[key] ?? 0) + 1;
}

interface Ctx {
    report: IngestionReport;
    transparent: ReadonlySet<string>;
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
    marks: string[],
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
    marks: string[],
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

function ingestNode(
    domNode: Node,
    marks: string[],
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
            marksList.push(newGenericStyleMarkDraft(textDraft, m));
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
    if (el.matches(SELECTORS_TO_RAW_HTML)) {
        count(report.mwEmptyElts, tag);
        emitRawHtmlAtom(el, inInline, out);
        return;
    }

    if (ctx.transparent.has(tag)) {
        ingestChildrenInto(el, marks, out, ctx, inInline);
        return;
    }

    const knownBlockTypeKey = KNOWN_BLOCK_TAGS[tag];
    if (knownBlockTypeKey !== undefined) {
        const draft = newNodeDraft(knownBlockTypeKey);
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
        // collect attrs, log them, skip them (operator decision)
        for (const attr of Array.from(el.attributes))
            count(report.skippedMarkAttrs, `${tag.toLowerCase()}.${attr.name}`);
        ingestChildrenInto(el, [...marks, knownMarkStyle], out, ctx, inInline);
        return;
    }

    if (tag === "BR") {
        out.push(newNodeDraft("hard_break").metamorphose());
        return;
    }

    if (INLINE_TAGS.has(tag)) {
        count(report.inlineNodes, tag);
        const draft = newNodeDraft(tag.toLowerCase());
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
    console.log("[ingest] skipped mark attrs:", report.skippedMarkAttrs);
    console.log("[ingest] skipped empty texts:", report.skippedEmptyTexts);
    console.log("[ingest] wrapped stray texts:", report.wrappedStrayTexts);
}

export function ingestWikipediaDocument(
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
            skippedEmptyTexts: 0,
            wrappedStrayTexts: 0,
        },
        transparent: new Set(
            (options.transparentContainers ?? []).map((t) => t.toUpperCase()),
        ),
    };
    const draft = newNodeDraft("doc");
    fillContent(draft, doc.body, [], ctx, false);
    const document = draft.metamorphose();
    logReport(ctx.report);
    return { document, report: ctx.report };
}

/** @deprecated shim kept until main.mjs is rewired in Phase 3. */
export function traverseDom(
    domNode: Node,
    _activeMarks: string[],
    _outputNodes: unknown[],
): void {
    const doc =
        domNode.nodeType === Node.DOCUMENT_NODE
            ? (domNode as Document)
            : domNode.ownerDocument;
    if (doc) ingestWikipediaDocument(doc);
}
