// Behavior tests for the Hyphenator (milestone 3, phase 4): word
// segments split at Knuth-Liang hyphenation points (hypher + the
// vendored en-us patterns), 'hyphen' break opportunities with a
// penalty, hyphenAfter flags, the min-length gates, reindexing of
// pre-existing breaks — and the BCP47 language -> pattern key map.
// Asserts observable input transformation (what the Algorithm would
// receive), not implementation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import Hypher from "hypher";

import {
    hyphenateSegments,
    HYPHENATION_PENALTY,
    HYPHENATION_DEFAULTS,
    languageToHyphenationPatternKey,
} from "./hyphenator.ts";
import { assembleLogicalParagraphs } from "./segmenter.ts";

// NOTE: the path is relative to the current working directory,
// vitest is expected to run from the project root.
const hypher = new Hypher(
    JSON.parse(readFileSync("lib/assets/hyphenation/en-us.json", "utf8")),
);

// one logical paragraph from classified inline content
const paragraphOf = (...items) => assembleLogicalParagraphs(items)[0],
    covered = (leafTexts, segments) =>
        segments.map((s) => leafTexts[s.sourceIndex]?.slice(s.start, s.end)),
    hyphenate = (text, config = HYPHENATION_DEFAULTS) => {
        const { segments, breaks } = paragraphOf({ kind: "text", text });
        return hyphenateSegments(segments, breaks, [text], hypher, config);
    };

describe("hyphenateSegments", () => {
    it("splits words at the Knuth-Liang hyphenation points", () => {
        // en-us patterns: typography -> ty-pog-ra-phy
        const result = hyphenate("typography");
        expect(covered(["typography"], result.segments)).toEqual([
            "ty",
            "pog",
            "ra",
            "phy",
        ]);
        // the split reproduces the word exactly (nothing lost/added)
        expect(covered(["typography"], result.segments).join("")).toBe(
            "typography",
        );
        // a 'hyphen' break with penalty after every part but the last
        expect(result.breaks).toEqual([
            {
                afterSegment: 0,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
            {
                afterSegment: 1,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
            {
                afterSegment: 2,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
        ]);
        // every part before a hyphen break is flagged hyphenAfter
        expect(result.segments.map((s) => s.hyphenAfter === true)).toEqual([
            true,
            true,
            true,
            false,
        ]);
    });

    it("gates: words below minWordLength stay whole", () => {
        const result = hyphenate("cat", {
            ...HYPHENATION_DEFAULTS,
            minWordLength: 6,
        });
        expect(covered(["cat"], result.segments)).toEqual(["cat"]);
        expect(result.breaks).toEqual([]);
    });

    it("gates: points keep minBefore before and minAfter after", () => {
        // typography points at offsets 2/5/7 (length 10):
        // minAfter 4 drops offset 7 (only "phy" = 3 after it)
        const result = hyphenate("typography", {
            minWordLength: 6,
            minBefore: 2,
            minAfter: 4,
        });
        expect(covered(["typography"], result.segments)).toEqual([
            "ty",
            "pog",
            "raphy",
        ]);
        // minBefore 3 drops offset 2 ("ty" is too short a first part)
        const result2 = hyphenate("typography", {
            minWordLength: 6,
            minBefore: 3,
            minAfter: 3,
        });
        expect(covered(["typography"], result2.segments)).toEqual([
            "typog",
            "ra",
            "phy",
        ]);
    });

    it("reindexes pre-existing breaks and leaves non-words alone", () => {
        const text = "A typography arrangement",
            { segments, breaks } = paragraphOf({ kind: "text", text }),
            result = hyphenateSegments(
                segments,
                breaks,
                [text],
                hypher,
                HYPHENATION_DEFAULTS,
            );
        // "A" is too short; spaces are not words; arrangement ->
        // arrange-ment (offset 7 keeps minAfter 3: "ment" is 4)
        expect(covered([text], result.segments)).toEqual([
            "A",
            " ",
            "ty",
            "pog",
            "ra",
            "phy",
            " ",
            "arrange",
            "ment",
        ]);
        expect(result.breaks).toEqual([
            { afterSegment: 1, kind: "space", penalty: 0, collapses: true },
            {
                afterSegment: 2,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
            {
                afterSegment: 3,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
            {
                afterSegment: 4,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
            { afterSegment: 6, kind: "space", penalty: 0, collapses: true },
            {
                afterSegment: 7,
                kind: "hyphen",
                penalty: HYPHENATION_PENALTY,
                collapses: false,
            },
        ]);
        // no break after the last segment of the paragraph
        expect(
            result.breaks.every(
                (brk) => brk.afterSegment < result.segments.length - 1,
            ),
        ).toBe(true);
    });

    it("passes atoms through untouched", () => {
        const { segments, breaks } = paragraphOf(
                { kind: "text", text: "typography" },
                { kind: "inlineAtom" },
            ),
            leafTexts = ["typography", ""],
            result = hyphenateSegments(
                segments,
                breaks,
                leafTexts,
                hypher,
                HYPHENATION_DEFAULTS,
            ),
            atom = result.segments.at(-1);
        // the atom is still one segment, still empty, no hyphenAfter
        expect(atom.start).toBe(0);
        expect(atom.end).toBe(0);
        expect(atom.hyphenAfter).toBe(undefined);
    });
});

describe("languageToHyphenationPatternKey", () => {
    it("maps BCP47 languages to vendored pattern keys", () => {
        expect(languageToHyphenationPatternKey("en")).toBe("en-us");
        expect(languageToHyphenationPatternKey("en-US")).toBe("en-us");
        expect(languageToHyphenationPatternKey("de")).toBe("de");
    });

    it("falls back from regional variants to the primary language", () => {
        expect(languageToHyphenationPatternKey("de-AT")).toBe("de");
        // Commonwealth English hyphenates British-style (documented
        // decision); everything else US
        expect(languageToHyphenationPatternKey("en-GB")).toBe("en-gb");
        expect(languageToHyphenationPatternKey("en-AU")).toBe("en-gb");
        expect(languageToHyphenationPatternKey("en-CA")).toBe("en-us");
    });

    it("yields null for unmapped languages (no hyphenation)", () => {
        expect(languageToHyphenationPatternKey("zh")).toBe(null);
        expect(languageToHyphenationPatternKey("klingon")).toBe(null);
    });
});
