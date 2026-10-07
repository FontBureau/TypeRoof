// Behavior tests for composition-positions.ts: document-node-path ↔
// PM-position arithmetic (hand-counted against the testing schema)
// and payload → fragment-range conversion (per (line × leaf) fragment,
// with the line-first/line-end positional rules).
import { describe, it, expect } from "vitest";
import { Schema } from "prosemirror-model";
import { schema } from "./prosemirror-testing-schema.ts";
import {
    buildPathToPosMap,
    resolvePathToPos,
    payloadFragmentRanges,
} from "./composition-positions.ts";

const { hard_break } = schema.nodes,
    { strong } = schema.marks;

// A minimal nesting schema (the testing schema's blockquote is spec'd
// inline:true, so it can't nest at doc level): proper block container.
const nestingSchema = new Schema({
        nodes: {
            doc: { content: "block+" },
            section: { content: "block+", group: "block" },
            paragraph: { content: "inline*", group: "block" },
            text: { group: "inline" },
        },
    }),
    nestingP = (...content) => nestingSchema.node("paragraph", null, content);

const p = (...content) => schema.node("paragraph", null, content),
    text = (str, marks = []) => schema.text(str, marks);

describe("buildPathToPosMap", () => {
    it("maps a flat two-paragraph doc", () => {
        // doc(p("hello") p("world")): p0 at 0, text at 1..6;
        // p0 nodeSize 7, p1 at 7, text at 8..13.
        const pmDoc = schema.node("doc", null, [
                p(text("hello")),
                p(text("world")),
            ]),
            map = buildPathToPosMap(pmDoc, "/document");
        expect(map.get("/document").pos).toBe(0);
        expect(map.get("/document").node).toBe(pmDoc);
        expect(map.get("/document/content/0").pos).toBe(0);
        expect(map.get("/document/content/0/content/0").pos).toBe(1);
        expect(map.get("/document/content/0/content/0").node.text).toBe(
            "hello",
        );
        expect(map.get("/document/content/1").pos).toBe(7);
        expect(map.get("/document/content/1/content/0").pos).toBe(8);
        expect(map.get("/document/content/1/content/0").node.text).toBe(
            "world",
        );
        expect(map.size).toBe(5);
    });

    it("maps mark-split text runs as separate children", () => {
        // p("ab" strong("cd")): "ab" at 1, "cd" at 3 (offset 2).
        const pmDoc = schema.node("doc", null, [
                p(text("ab"), text("cd", [strong.create()])),
            ]),
            map = buildPathToPosMap(pmDoc, "/document");
        expect(map.get("/document/content/0/content/0").pos).toBe(1);
        expect(map.get("/document/content/0/content/1").pos).toBe(3);
        expect(
            map.get("/document/content/0/content/1").node.marks[0].type.name,
        ).toBe("strong");
    });

    it("counts inline leaves as one unit", () => {
        // p("ab" br "cd"): br at 3, "cd" at 4.
        const pmDoc = schema.node("doc", null, [
                p(text("ab"), schema.node("hard_break"), text("cd")),
            ]),
            map = buildPathToPosMap(pmDoc, "/document");
        expect(map.get("/document/content/0/content/1").pos).toBe(3);
        expect(map.get("/document/content/0/content/1").node.type).toBe(
            hard_break,
        );
        expect(map.get("/document/content/0/content/2").pos).toBe(4);
    });

    it("maps nested structure with per-level indexes", () => {
        // doc(section(p("deep"))): section at 0, p at 1, text at 2.
        const pmDoc = nestingSchema.node("doc", null, [
                nestingSchema.node("section", null, [
                    nestingP(nestingSchema.text("deep")),
                ]),
            ]),
            map = buildPathToPosMap(pmDoc, "/document");
        expect(map.get("/document/content/0").pos).toBe(0);
        expect(map.get("/document/content/0/content/0").pos).toBe(1);
        expect(map.get("/document/content/0/content/0/content/0").pos).toBe(2);
        expect(
            map.get("/document/content/0/content/0/content/0").node.text,
        ).toBe("deep");
    });
});

const makePayload = ({ leaves, segments, lines }) => ({
        textblockPath: "/document/content/0",
        leaves,
        paragraphs: [
            {
                segments,
                result: {
                    lines,
                    diagnostics: { overfullLines: [], badness: [] },
                },
            },
        ],
        treatmentConfig: { treatments: [], direction: "both" },
        colorCoding: "off",
        sources: { textblockNode: null, leafTexts: [] },
        lineWidthPt: 480,
    }),
    makeLine = (fromSegment, toSegment, adjustmentStep = 0) => ({
        fromSegment,
        toSegment,
        breakAt: null,
        naturalWidthPt: 0,
        adjustmentStep,
    }),
    runLeaf = (path) => ({ path, treatment: null });

describe("resolvePathToPos", () => {
    const pmDoc = schema.node("doc", null, [
        p(text("ab"), text("cd", [strong.create()])),
        p(text("ef")),
    ]);

    it("resolves doc, textblock, and run paths", () => {
        expect(resolvePathToPos(pmDoc, "/document", "/document")).toEqual({
            pos: 0,
            node: pmDoc,
        });
        // p0 holds "ab"+strong"cd" (4 chars) → nodeSize 6.
        expect(
            resolvePathToPos(pmDoc, "/document", "/document/content/1"),
        ).toMatchObject({ pos: 6 });
        expect(
            resolvePathToPos(
                pmDoc,
                "/document",
                "/document/content/0/content/1",
            ),
        ).toMatchObject({ pos: 3 });
        expect(
            resolvePathToPos(
                pmDoc,
                "/document",
                "/document/content/1/content/0",
            ).node.text,
        ).toBe("ef");
    });

    it("agrees with buildPathToPosMap on every node", () => {
        const map = buildPathToPosMap(pmDoc, "/document");
        for (const [path, entry] of map)
            expect(resolvePathToPos(pmDoc, "/document", path)).toEqual(entry);
    });

    it("returns null for paths outside the document root", () => {
        expect(resolvePathToPos(pmDoc, "/document", "/other/content/0")).toBe(
            null,
        );
        expect(resolvePathToPos(pmDoc, "/document", "/documents")).toBe(null);
    });

    it("returns null for unknown indexes and malformed paths", () => {
        expect(
            resolvePathToPos(pmDoc, "/document", "/document/content/5"),
        ).toBe(null);
        expect(
            resolvePathToPos(
                pmDoc,
                "/document",
                "/document/content/0/content/9",
            ),
        ).toBe(null);
        expect(resolvePathToPos(pmDoc, "/document", "/document/0")).toBe(null);
        expect(
            resolvePathToPos(pmDoc, "/document", "/document/content/x"),
        ).toBe(null);
    });
});

describe("payloadFragmentRanges", () => {
    it("maps a single-run textblock's lines to PM ranges", () => {
        // doc(p("hello world")): text node pos 1, first char AT 1
        // (leaf nodes have no open token).
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            resolve = (path) => resolvePathToPos(pmDoc, "/document", path),
            payload = makePayload({
                leaves: [runLeaf("/document/content/0/content/0")],
                segments: [
                    { start: 0, end: 6, sourceIndex: 0 },
                    { start: 6, end: 11, sourceIndex: 0 },
                ],
                lines: [makeLine(0, 1), makeLine(1, 2)],
            }),
            ranges = [...payloadFragmentRanges(payload, resolve)];
        expect(ranges).toHaveLength(2);
        expect(ranges[0]).toMatchObject({
            leafIndex: 0,
            lineIndex: 0,
            isLineStart: true,
            isLineEnd: true,
            from: 1,
            to: 7,
        });
        expect(ranges[1]).toMatchObject({
            leafIndex: 0,
            lineIndex: 1,
            isLineStart: true,
            isLineEnd: true,
            from: 7,
            to: 12,
        });
    });

    it("fragments a line per leaf and flags the boundary positions", () => {
        // doc(p("ab" strong("cd"))): one line spanning both runs.
        // (Map-backed resolver flavor — bulk repaint pattern.)
        const pmDoc = schema.node("doc", null, [
                p(text("ab"), text("cd", [strong.create()])),
            ]),
            map = buildPathToPosMap(pmDoc, "/document"),
            resolve = (path) => map.get(path),
            payload = makePayload({
                leaves: [
                    runLeaf("/document/content/0/content/0"),
                    runLeaf("/document/content/0/content/1"),
                ],
                segments: [
                    { start: 0, end: 2, sourceIndex: 0 },
                    { start: 0, end: 2, sourceIndex: 1 },
                ],
                lines: [makeLine(0, 2)],
            }),
            ranges = [...payloadFragmentRanges(payload, resolve)];
        expect(ranges).toHaveLength(2);
        expect(ranges[0]).toMatchObject({
            leafIndex: 0,
            isLineStart: true,
            isLineEnd: false,
            from: 1,
            to: 3,
        });
        expect(ranges[1]).toMatchObject({
            leafIndex: 1,
            isLineStart: false,
            isLineEnd: true,
            from: 3,
            to: 5,
        });
    });

    it("merges contiguous same-leaf segments into one fragment", () => {
        const pmDoc = schema.node("doc", null, [p(text("hello world"))]),
            resolve = (path) => resolvePathToPos(pmDoc, "/document", path),
            payload = makePayload({
                leaves: [runLeaf("/document/content/0/content/0")],
                segments: [
                    { start: 0, end: 2, sourceIndex: 0 },
                    { start: 2, end: 6, sourceIndex: 0 },
                    { start: 6, end: 11, sourceIndex: 0 },
                ],
                lines: [makeLine(0, 2), makeLine(2, 3)],
            }),
            ranges = [...payloadFragmentRanges(payload, resolve)];
        expect(ranges).toHaveLength(2);
        expect(ranges[0]).toMatchObject({ from: 1, to: 7, lineIndex: 0 });
        expect(ranges[1]).toMatchObject({ from: 7, to: 12, lineIndex: 1 });
    });

    it("skips leaves with unknown or null paths", () => {
        const pmDoc = schema.node("doc", null, [p(text("ab"))]),
            resolve = (path) => resolvePathToPos(pmDoc, "/document", path),
            payload = makePayload({
                leaves: [
                    runLeaf("/document/content/9/content/0"),
                    { path: null, treatment: null },
                ],
                segments: [
                    { start: 0, end: 1, sourceIndex: 0 },
                    { start: 0, end: 1, sourceIndex: 1 },
                ],
                lines: [makeLine(0, 2)],
            });
        expect([...payloadFragmentRanges(payload, resolve)]).toHaveLength(0);
    });

    it("skips empty (atom) fragments", () => {
        // A line with a text fragment and an atom fragment (start=end).
        const pmDoc = schema.node("doc", null, [p(text("ab"))]),
            resolve = (path) => resolvePathToPos(pmDoc, "/document", path),
            payload = makePayload({
                leaves: [
                    runLeaf("/document/content/0/content/0"),
                    runLeaf("/document/content/0/content/1"),
                ],
                segments: [
                    { start: 0, end: 2, sourceIndex: 0 },
                    { start: 0, end: 0, sourceIndex: 1 },
                ],
                lines: [makeLine(0, 2)],
            }),
            ranges = [...payloadFragmentRanges(payload, resolve)];
        expect(ranges).toHaveLength(1);
        expect(ranges[0]).toMatchObject({ leafIndex: 0, from: 1, to: 3 });
    });

    it("carries line and result references through", () => {
        const pmDoc = schema.node("doc", null, [p(text("ab"))]),
            resolve = (path) => resolvePathToPos(pmDoc, "/document", path),
            payload = makePayload({
                leaves: [runLeaf("/document/content/0/content/0")],
                segments: [{ start: 0, end: 2, sourceIndex: 0 }],
                lines: [makeLine(0, 1, 0.5)],
            }),
            [range] = [...payloadFragmentRanges(payload, resolve)];
        expect(range.line).toBe(payload.paragraphs[0].result.lines[0]);
        expect(range.result).toBe(payload.paragraphs[0].result);
        expect(range.leaf).toBe(payload.leaves[0]);
    });
});
