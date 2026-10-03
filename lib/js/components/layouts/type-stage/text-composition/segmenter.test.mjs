// Behavior tests for Segmenter v0: classified inline content of a
// textblock -> segments + break opportunities per logical paragraph.
// Asserts observable chunking (what each segment covers, where breaks
// are legal, how inline nodes participate), not implementation.
import { describe, it, expect } from "vitest";

import { segmentTextRun, assembleLogicalParagraphs } from "./segmenter.ts";

const text = (t) => ({ kind: "text", text: t }),
    hardBreak = { kind: "hardBreak" },
    atom = { kind: "inlineAtom" },
    container = (...items) => ({ kind: "inlineContainer", items });

// helper: the text covered by each segment of a logical paragraph,
// resolved against the leaf items (text runs)
const covered = (leafTexts, segments) =>
    segments.map((s) => leafTexts[s.sourceIndex]?.slice(s.start, s.end));

describe("segmentTextRun", () => {
    it("splits words and spaces, breaks after spaces", () => {
        const segments = [],
            breaks = [];
        segmentTextRun("foo bar", 0, segments, breaks);
        expect(covered(["foo bar"], segments)).toEqual(["foo", " ", "bar"]);
        expect(breaks).toEqual([
            { afterSegment: 1, kind: "space", penalty: 0, collapses: true },
        ]);
    });

    it("keeps offsets local to the run", () => {
        const segments = [],
            breaks = [];
        segmentTextRun("ab cd", 3, segments, breaks);
        expect(segments[2]).toMatchObject({ start: 3, end: 5, sourceIndex: 3 });
    });
});

describe("segmentTextRun UAX#14 (milestone 3)", () => {
    const run = (text) => {
        const segments = [],
            breaks = [];
        segmentTextRun(text, 0, segments, breaks);
        return { segments, breaks };
    };

    it("breaks between CJK ideographs (zero-width, non-collapsing)", () => {
        const { segments, breaks } = run("世界"),
            covered = segments.map((s) => "世界".slice(s.start, s.end));
        expect(covered).toEqual(["世", "界"]);
        expect(breaks).toHaveLength(1);
        expect(breaks[0]).toMatchObject({
            afterSegment: 0,
            kind: "space",
            collapses: false,
        });
    });

    it("does NOT break before closing punctuation", () => {
        const { segments, breaks } = run("Hi!");
        // "Hi!" is ONE segment: no break between "Hi" and "!"
        expect(segments).toHaveLength(1);
        expect(breaks).toHaveLength(0);
    });

    it("keeps the space-kept-in-line semantics with UAX#14", () => {
        const { segments, breaks } = run("a b"),
            covered = segments.map((s) => "a b".slice(s.start, s.end));
        expect(covered).toEqual(["a", " ", "b"]);
        expect(breaks).toEqual([
            { afterSegment: 1, kind: "space", penalty: 0, collapses: true },
        ]);
    });

    it("a newline is an explicit, collapsing break", () => {
        const { breaks } = run("a\nb");
        expect(breaks).toContainEqual(
            expect.objectContaining({ kind: "explicit", collapses: true }),
        );
    });
});

describe("assembleLogicalParagraphs", () => {
    it("joins consecutive text runs into one logical paragraph", () => {
        const paragraphs = assembleLogicalParagraphs([
            text("Hea"),
            text("ding One"),
        ]);
        expect(paragraphs).toHaveLength(1);
        expect(covered(["Hea", "ding One"], paragraphs[0].segments)).toEqual([
            "Hea",
            "ding",
            " ",
            "One",
        ]);
        expect(paragraphs[0].breaks.map((b) => b.afterSegment)).toEqual([2]);
    });

    it("hard breaks split logical paragraphs (the <br> case)", () => {
        // the observed serialization: "Hea", hard_break, "ding One"
        const paragraphs = assembleLogicalParagraphs([
            text("Hea"),
            hardBreak,
            text("ding One"),
        ]);
        expect(paragraphs).toHaveLength(2);
        expect(covered(["Hea", "ding One"], paragraphs[0].segments)).toEqual([
            "Hea",
        ]);
        expect(covered(["Hea", "ding One"], paragraphs[1].segments)).toEqual([
            "ding",
            " ",
            "One",
        ]);
    });

    it("inline containers join the same logical paragraph (link case)", () => {
        const paragraphs = assembleLogicalParagraphs([
            text("see "),
            container(text("the link")),
            text(" now"),
        ]);
        expect(paragraphs).toHaveLength(1);
        expect(
            covered(["see ", "the link", " now"], paragraphs[0].segments),
        ).toEqual(["see", " ", "the", " ", "link", " ", "now"]);
    });

    it("inline atoms become one unbreakable segment", () => {
        const paragraphs = assembleLogicalParagraphs([
            text("before "),
            atom,
            text(" after"),
        ]);
        expect(paragraphs).toHaveLength(1);
        const { segments, breaks } = paragraphs[0];
        // "before", " ", atom, " ", "after"
        expect(segments).toHaveLength(5);
        expect(segments[2]).toMatchObject({
            sourceIndex: 1,
            start: 0,
            end: 0,
        });
        expect(breaks.map((b) => b.afterSegment)).toEqual([1, 3]);
    });

    it("leaf source indexes count depth-first over text runs and atoms", () => {
        const paragraphs = assembleLogicalParagraphs([
            text("a"),
            container(text("b"), atom),
            text("c"),
        ]);
        const [paragraph] = paragraphs;
        expect(paragraph.segments.map((s) => s.sourceIndex)).toEqual([
            0, 1, 2, 3,
        ]);
    });

    it("handles empty input and paragraphs without breaks", () => {
        expect(assembleLogicalParagraphs([])).toEqual([]);
        const [paragraph] = assembleLogicalParagraphs([
            text("supercalifragilistic"),
        ]);
        expect(paragraph.segments).toHaveLength(1);
        expect(paragraph.breaks).toEqual([]);
    });
});
