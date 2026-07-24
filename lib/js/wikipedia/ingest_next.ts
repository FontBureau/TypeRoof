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
const KNOWN_BLOCK_TAGS: Readonly<Record<string, string>> = {
    BODY: "doc",
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

export interface IngestionReport {
    // mark-set histogram, e.g. { "[bold, italic]": 2, "[bold]": 1, "[]": 5 }
    markSets: Record<string, number>;
    // tag -> count of raw_html_block catch-all emissions
    catchAllBlocks: Record<string, number>;
    // tag -> count of inline-node emissions
    inlineNodes: Record<string, number>;
    // "tag.attr" -> count of collected-but-skipped mark element attrs
    skippedMarkAttrs: Record<string, number>;
    skippedEmptyTexts: number;
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

// Ingest children of `el` directly into `out` (pass-through).
function ingestChildrenInto(
    el: Node,
    marks: string[],
    out: any[],
    ctx: Ctx,
): void {
    for (const child of Array.from(el.childNodes))
        ingestNode(child, marks, out, ctx);
}

// Ingest children of `el` as the content of a new container draft.
function fillContent(draft: any, el: Node, marks: string[], ctx: Ctx): void {
    const content = draft.get("content");
    for (const child of Array.from(el.childNodes)) {
        const out: any[] = [];
        ingestNode(child, marks, out, ctx);
        for (const item of out) content.push(item);
    }
}

function ingestNode(
    domNode: Node,
    marks: string[],
    out: any[],
    ctx: Ctx,
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
        const draft = newNodeDraft("text");
        draft.get("text").value = text;
        const marksList = draft.get("marks");
        for (const m of marks)
            marksList.push(newGenericStyleMarkDraft(draft, m));
        out.push(draft.metamorphose());
        return;
    }

    if (domNode.nodeType !== Node.ELEMENT_NODE)
        // comments, processing instructions, ...
        return;

    const el = domNode as Element;
    const tag = el.tagName;

    const knownBlockTypeKey = KNOWN_BLOCK_TAGS[tag];
    if (knownBlockTypeKey !== undefined) {
        const draft = newNodeDraft(knownBlockTypeKey);
        // marks do not cross block boundaries
        fillContent(draft, el, [], ctx);
        out.push(draft.metamorphose());
        return;
    }

    const knownMarkStyle = KNOWN_MARK_TAGS[tag];
    if (knownMarkStyle !== undefined) {
        // collect attrs, log them, skip them (operator decision)
        for (const attr of Array.from(el.attributes))
            count(report.skippedMarkAttrs, `${tag.toLowerCase()}.${attr.name}`);
        ingestChildrenInto(el, [...marks, knownMarkStyle], out, ctx);
        return;
    }

    if (tag === "BR") {
        out.push(newNodeDraft("hard_break").metamorphose());
        return;
    }

    if (ctx.transparent.has(tag)) {
        ingestChildrenInto(el, marks, out, ctx);
        return;
    }

    if (INLINE_TAGS.has(tag)) {
        count(report.inlineNodes, tag);
        const draft = newNodeDraft(tag.toLowerCase());
        fillContent(draft, el, marks, ctx);
        out.push(draft.metamorphose());
        return;
    }

    // catch-all: prune the branch, keep the raw HTML verbatim
    count(report.catchAllBlocks, tag);
    const draft = newNodeDraft("raw_html_block");
    draft.get("attrs").set("html", toMetaModelJSON(el.outerHTML, {}));
    out.push(draft.metamorphose());
}

function logReport(report: IngestionReport): void {
    console.log("[ingest] mark sets:", report.markSets);
    console.log("[ingest] raw_html_block catch-all:", report.catchAllBlocks);
    console.log("[ingest] inline nodes:", report.inlineNodes);
    console.log("[ingest] skipped mark attrs:", report.skippedMarkAttrs);
    console.log("[ingest] skipped empty texts:", report.skippedEmptyTexts);
}

export function ingestWikipediaDocument(
    doc: Document,
    options: IngestionOptions = {},
): { document: any; report: IngestionReport } {
    const ctx: Ctx = {
        report: {
            markSets: {},
            catchAllBlocks: {},
            inlineNodes: {},
            skippedMarkAttrs: {},
            skippedEmptyTexts: 0,
        },
        transparent: new Set(
            (options.transparentContainers ?? []).map((t) => t.toUpperCase()),
        ),
    };
    const draft = newNodeDraft("doc");
    fillContent(draft, doc.body, [], ctx);
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
