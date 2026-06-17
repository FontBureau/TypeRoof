/**
 * Pure layout computation for contextual virtual-scroll rendering.
 *
 * All functions are stateless and DOM-free. They operate on arrays of
 * word widths in em units and container dimensions in pt.
 */

import { AXES_WIDEST_SETTING } from "../../../affixed-line-breaks.mjs";

// --- Word Width Measurement via HarfBuzz ---

/**
 * Build the widest variation settings object for a given font.
 * Uses the font's actual axis ranges (max wdth, max wght, max opsz).
 *
 * @param {Object} font - VideoProofFont with .axisRanges
 * @returns {Object} e.g. {wdth: 151, wght: 1000, opsz: 144}
 */
export function getWidestVariations(font) {
    const variations = {};
    const axes = font.axisRanges;
    for (const [tag, bound] of AXES_WIDEST_SETTING) {
        if (tag in axes) variations[tag] = axes[tag][bound];
    }
    return variations;
}

// TODO: in actors/videoproof-array.mjs VideoproofArrayV2ActorRenderer
// has _getCellsWidths! ideally we can unify these or at least put them
// close together into the same module.
/**
 * Measure word widths in em units using HarfBuzz.
 *
 * Shapes each word at the font's widest variation settings to get
 * upper-bound widths that won't overflow at any animated position.
 *
 * @param {Object} harfbuzz - harfbuzz.hbjs object
 * @param {Object} font - VideoProofFont with .hbFace, .axisRanges
 * @param {string[]} words - array of word strings
 * @param {string} [features='+liga'] - HarfBuzz feature string
 * @returns {number[]} - width of each word in em units
 */
export function measureWordWidths(harfbuzz, font, words, features = "+liga") {
    if (words.length === 0) return []; // shortcut
    const hbFace = font.hbFace,
        upem = hbFace.upem,
        hbFont = harfbuzz.createFont(hbFace);
    hbFont.setScale(upem, upem);
    hbFont.setVariations(getWidestVariations(font));

    const widths = new Array(words.length);
    for (let i = 0; i < words.length; i++) {
        const buffer = harfbuzz.createBuffer();
        buffer.addText(words[i]);
        buffer.guessSegmentProperties();
        harfbuzz.shape(hbFont, buffer, features);
        const shaped = buffer.json(hbFont);
        let advanceX = 0;
        for (const item of shaped) advanceX += item.ax;
        widths[i] = advanceX / upem;
        buffer.destroy();
    }
    hbFont.destroy();
    return widths;
}

// --- Line Layout Computation ---

/**
 * Compute line-start indices from word widths.
 *
 * Given an array of word widths and a maximum line length (all in em),
 * determines where each line starts. Returns an array where
 * lineStarts[i] is the word index of the first word on line i.
 *
 * @param {number[]} wordWidthsEm - width of each word in em
 * @param {number} gapEm - gap between words in em
 * @param {number} lineLengthEm - maximum line length in em
 * @returns {number[]} - array of first-word indices per line
 */
export function computeLineStarts(wordWidthsEm, gapEm, lineLengthEm) {
    if (!wordWidthsEm.length) return [];
    const lineStarts = [0]; // word 0 starts at line 0
    let currentLineLength = wordWidthsEm[0];
    for (let i = 1; i < wordWidthsEm.length; i++) {
        const wordWidth = wordWidthsEm[i],
            newLineLength = currentLineLength + gapEm + wordWidth;
        // lineHasContent could be phrased as currentLineLength > 0
        // as currentLineLength is initially 0 and after the first iteration
        // it never is 0 again (unless a wordWidth would be 0, but
        // even then it would be OK to treat the line as empty.
        if (newLineLength > lineLengthEm) {
            // Start a new line with this word
            lineStarts.push(i); // word index
            currentLineLength = wordWidth;
        } else currentLineLength = newLineLength;
    }
    return lineStarts;
}

// --- Font-Size Fitting Algorithm ---

// Defaults (will become configurable parameters later)
export const MIN_FONT_SIZE_PT = 24;
export const MAX_FONT_SIZE_PT = 144;
export const DEFAULT_GAP_EM = 0.378;
export const DEFAULT_LINE_HEIGHT_EM = 1.2;

/**
 * Compute optimal font-size and line layout for paged display.
 *
 * Finds the biggest font-size (in pt) where ALL content fits in
 * the available space, matching legacy gridFontSize behavior.
 * When content can't fit even at minFontSize, uses minFontSize
 * and the caller handles paging/scrolling.
 *
 * The key insight: fits(fontSize) is monotonic. As fontSize decreases,
 * lineLengthEm increases (more words per line, fewer lines) and each
 * line is shorter — both help fitting. So we can binary search for
 * the largest fontSize where content fits.
 *
 * Fit test at a given fontSize:
 *   lineLengthEm = availableWidthPt / fontSize
 *   totalLines = computeLineStarts(wordWidthsEm, gapEm, lineLengthEm).length
 *   requiredHeightPt = totalLines * lineHeightEm * fontSize
 *   fits = requiredHeightPt ≤ availableHeightPt
 *
 * @param {number[]} wordWidthsEm - word widths in em
 * @param {number} gapEm - gap between words in em
 * @param {number} lineHeightEm - line height in em
 * @param {number} availableWidthPt - container width in pt
 * @param {number} availableHeightPt - container height in pt
 * @param {number} minFontSizePt
 * @param {number} maxFontSizePt
 * @returns {{fontSizePt: number, lineStarts: number[], linesPerPage: number, totalLines: number}}
 */
export function computeFontSizeAndLayout(
    wordWidthsEm,
    gapEm,
    lineHeightEm,
    availableWidthPt,
    availableHeightPt,
    minFontSizePt = MIN_FONT_SIZE_PT,
    maxFontSizePt = MAX_FONT_SIZE_PT,
) {
    if (!wordWidthsEm.length)
        return {
            fontSizePt: maxFontSizePt,
            lineStarts: [],
            linesPerPage: 0,
            totalLines: 0,
        };

    const fitsAtFontSize = (fontSize) => {
        const lineLengthEm = availableWidthPt / fontSize,
            totalLines = computeLineStarts(
                wordWidthsEm,
                gapEm,
                lineLengthEm,
            ).length,
            requiredHeightPt = totalLines * lineHeightEm * fontSize;
        return requiredHeightPt <= availableHeightPt;
    };

    // Binary search: find largest fontSize where all content fits.
    // fits() is monotonic — if it fits at fontSize, it fits at all smaller values.
    // ~10 iterations for 0.1pt precision over the [min, max] range.
    let lo = minFontSizePt,
        hi = maxFontSizePt;
    while (hi - lo > 0.1) {
        const mid = (lo + hi) / 2;
        if (fitsAtFontSize(mid))
            lo = mid; // fits, try bigger
        else hi = mid; // doesn't fit, try smaller
    }

    // lo is the largest fontSize that fits (within precision).
    // Apply wiggle room (matches existing gridFontSize pattern).
    const wiggleRoom = 0.3,
        fontSizePt = Math.max(
            minFontSizePt,
            Math.floor(lo * 100) / 100 - wiggleRoom,
        );
    // Final layout at chosen font-size
    const lineLengthEm = availableWidthPt / fontSizePt,
        lineStarts = computeLineStarts(wordWidthsEm, gapEm, lineLengthEm),
        linesPerPage = Math.max(
            1,
            Math.floor(availableHeightPt / (fontSizePt * lineHeightEm)),
        );
    return {
        fontSizePt,
        lineStarts,
        linesPerPage,
        totalLines: lineStarts.length,
    };
}

// --- Scroll Position ---
//
// The scroll position is a WORD INDEX, not a line number.
// Semantics: "word #N should be visible on the current page".
// The system resolves which line word #N is on and displays
// the page containing that line as the first visible line.
//
// This makes the scroll position meaningful to a reviewer
// ("show me word #42") and stable across relayouts — the same
// word index can land on a different line when the container
// resizes, but the intent ("keep this word visible") is preserved.
//
// Reading the scroll position always returns a word index.
// The generic case (no specific word) uses the first word of
// the current top line. Scrolling by lines internally resolves
// to the first word of the target line.

/**
 * Resolve a word index to the line it belongs to.
 *
 * @param {number} wordIndex - any valid word index
 * @param {number[]} lineStarts - sorted first-word indices per line
 * @returns {number} - line index (0-based)
 */
export function wordIndexToLine(wordIndex, lineStarts) {
    if (!lineStarts.length) return 0;
    let lo = 0,
        hi = lineStarts.length - 1;
    while (lo < hi) {
        // Bias mid upward to avoid infinite loop when hi - lo === 1
        const mid = (lo + hi + 1) >>> 1;
        if (lineStarts[mid] <= wordIndex) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

/**
 * Clamp a word index so the page starting at its line is valid.
 *
 * The word index is resolved to its line, and the line is clamped
 * so that the page doesn't extend past the last line. The returned
 * value is the first word of the clamped line.
 *
 * @param {number} wordIndex - desired scroll position (word index)
 * @param {number[]} lineStarts
 * @param {number} totalLines
 * @param {number} linesPerPage
 * @returns {number} - clamped word index (always a line-start word)
 */
export function clampScrollPosition(
    wordIndex,
    lineStarts,
    totalLines,
    linesPerPage,
) {
    if (!lineStarts.length) return 0;
    let line = wordIndexToLine(wordIndex, lineStarts);
    const maxLine = Math.max(0, totalLines - linesPerPage);
    line = Math.max(0, Math.min(line, maxLine));
    return lineStarts[line];
}

/**
 * Get the word index N lines away from the current scroll position.
 *
 * Used for line-by-line and page scrolling. Resolves the current
 * word index to its line, adds deltaLines, clamps, and returns
 * the first word of the resulting line.
 *
 * @param {number} currentWordIndex - current scroll position (word index)
 * @param {number} deltaLines - lines to move (positive = down, negative = up)
 * @param {number[]} lineStarts
 * @param {number} totalLines
 * @param {number} linesPerPage
 * @returns {number} - new scroll position (word index, always a line-start)
 */
export function scrollByLines(
    currentWordIndex,
    deltaLines,
    lineStarts,
    totalLines,
    linesPerPage,
) {
    if (!lineStarts.length) return 0;
    const currentLine = wordIndexToLine(currentWordIndex, lineStarts),
        targetLine = currentLine + deltaLines,
        maxLine = Math.max(0, totalLines - linesPerPage),
        clampedLine = Math.max(0, Math.min(targetLine, maxLine));
    return lineStarts[clampedLine];
}

/**
 * Get the range of words visible on the page containing the given word.
 *
 * @param {number} scrollWordIndex - scroll position (word index)
 * @param {number} linesPerPage
 * @param {number[]} lineStarts
 * @param {number} totalWords - words.length
 * @returns {{firstLine: number, lastLine: number, firstWord: number, lastWord: number}}
 */
export function getVisibleRange(
    scrollWordIndex,
    linesPerPage,
    lineStarts,
    totalWords,
) {
    if (!lineStarts.length || !totalWords)
        return { firstLine: 0, lastLine: -1, firstWord: 0, lastWord: -1 };

    const firstLine = wordIndexToLine(scrollWordIndex, lineStarts),
        lastLine = Math.min(
            firstLine + linesPerPage - 1,
            lineStarts.length - 1,
        ),
        firstWord = lineStarts[firstLine],
        lastWord =
            lastLine + 1 < lineStarts.length
                ? lineStarts[lastLine + 1] - 1
                : totalWords - 1;
    return { firstLine, lastLine, firstWord, lastWord };
}
