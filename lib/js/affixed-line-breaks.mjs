/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */


/**
 * Setting the widest wdth/wght/opsz combination the font can handle.
 */
const _AXES_WIDEST_SETTING =  [
    // FIXME: this are not all axes that are responsible for
    //        changing width (XTRA, ...?)
    ['wdth', 'max'],
    ['wght', 'max'],
    ['opsz', 'max'] // used to be min, but at max RobotFlex is wider than at min
];
function _setWidest(font, element) {
    //get the stuff as wide as possible
    let axes = font.axisRanges
      , reset = element.style.fontVariationSettings
      , fvs = []
      ;

    for(let[tag, wideEnd] of _AXES_WIDEST_SETTING) {
        if (tag in axes)
            fvs.push(`"${tag}" ${axes[tag][wideEnd]}`);
    }
    element.style.fontVariationSettings = fvs.join(', ');
    return ()=>element.style.fontVariationSettings = reset;
}

function _withSetWidest(font, elem, func, ...args) {
    let reset = _setWidest(font, elem);
    try {
        func(...args);
    }
    finally {
        reset();
    }
}

function _getLineBreaksForLineLength(childrenWidthsEM, childrenRightMarginEm, lineLength) {
    let lines = []
      , lineLengths = []
      , currentLineLength = 0
      , lastChildMarginEm = 0
      ;
    for(let [i, childEm] of childrenWidthsEM.entries()) {
        // CAUTION: does NOT include the last line item margin!
        // doing it this way requires to mark each of the last line
        // items, so that they wont include the margin.
        let nextLineLength = currentLineLength + lastChildMarginEm + childEm;
        lastChildMarginEm = childrenRightMarginEm;
        if(nextLineLength > lineLength) {
            // break the line
            lines.push(i-1);
            lineLengths.push(currentLineLength);
            // current child overflows into next line
            currentLineLength = childEm;
        }
        else {
            // keep the line
            currentLineLength = nextLineLength;
        }
    }
    if(currentLineLength) {
        // last line with the rest of the elements
        lines.push(childrenWidthsEM.length-1);
        lineLengths.push(currentLineLength);
    }
    return [Math.max(0, ...lineLengths), lines];
}

/**
 * return an array `lineBreaks`
 * where the items in lineBreaks are
 * [actualMaxLineLength, lines]
 * and the index is
 * lineBreaks[lines.length-1] = [actualMaxLineLength, lines]
 *
 * Therefore, the one line case is at:
 * lineBreaks[0] => one line also has zero line breaks, two lines have one break...
 */
function _getLineBreaks(childrenWidthsEM, childrenRightMarginEm) {
    let sum=(values)=>values.reduce((accum, val)=> accum + val, 0)
        // The last element right margin per line must be considered for
        // line breaking as well, if we don't want it and have it behave
        // more like a space, it must be removed explicitly, also in the
        // resulting markup/CSS.
      , minOneLineLengthEM = sum(childrenWidthsEM.reduce((accum, childEm, currentIndex, array)=>{
            accum.push(childEm);
            if(currentIndex !== array.length-1)
                // don't add last margin
                accum.push(childrenRightMarginEm);
            return accum;
        }, []))
      , minChildSizeEm = Math.min( ...childrenWidthsEM)
      , maxChildSizeEm = Math.max(0, ...childrenWidthsEM)
      , lineBreaks = []
      ;
    if(!childrenWidthsEM)
        return [];
    // Will override previous entries in lineBreaks if it finds a shorter
    // lineLength which produces the same amount of lines.
    let lineLength=maxChildSizeEm;
    while(true) {
        let [actualMaxLineLength, lines] = _getLineBreaksForLineLength(
                                                childrenWidthsEM,
                                                childrenRightMarginEm,
                                                lineLength);
        // If this is set a shorter lineLength that produces
        // the same amount of lines has already been found.
        if(!lineBreaks[lines.length-1])
            lineBreaks[lines.length-1] = [actualMaxLineLength, lines];
        if(lineLength === minOneLineLengthEM)
            // we're done
            break;
        // Can't get wider than minOneLineLengthEM, then we make one more
        // iteration for the one-line case and break.
        // This makes the next line length one minChildSizeEm wider than
        // the previous line length, so that we may get less lines in this
        // iteration. It could probably add one childrenRightMarginEm
        // as that is also required to add one more item, but since the
        // lines all get longer, that may have negative effects.
        lineLength = Math.min(lineLength+minChildSizeEm, minOneLineLengthEM);
    }
    return lineBreaks;
}

/**
 * Calculate auto font-size and required line breaks depending on content and
 * available space.
 * The idea is to have the biggest font-size to fit all the children to
 * the available space.
 * Since we're in the ported version are using flex we don't need to
 * set line-endings ourselves. maybe this can be used to make things simpler.
 */
function gridFontSize(element, childrenWidthsEM, childrenRightMarginEm) {
    let window = element.ownerDocument.defaultView
        // FIXME: I'd like to do this differently! why 96 anyways???
        //        I'm now using 196, but it's still arbitrary!
        // animation controls height: 38px
        // footer height: 27.9 px
      , availableHeightPx = window.innerHeight - (38 + 28)
        // seems incorrect!
      , availableWidthPx = element.getBoundingClientRect().width
      , availableHeightPt = availableHeightPx * 0.75
      , availableWidthPt = availableWidthPx * 0.75
      // FIXME: hard coded so far, should come the applied CSS property
      //        especially because we don't set it in here
      , lineHeightEM = 1.5
      , normalizedAvailableHeightPt = availableHeightPt / lineHeightEM
      // FIXME: These should be arguments to the function.
      // 144 implies PT not PX as 144 is our standard max size in PT
      // the old implementation used px with these values.
      , minFontSize = 24, maxFontSize = 144
      , lineBreaks = _getLineBreaks(childrenWidthsEM, childrenRightMarginEm)
      , globalMaxFontSize = 0
      , lastLinesI = -1
      ;
    for(let i=0,l=lineBreaks.length; i<l; i++) {
        if(lineBreaks[i] === undefined)
            continue;
        let amountOfLines = i + 1
            // the smallest line len to produce amountOfLiness
            // the biggest line len to produce amountOfLines
            // must be smaller than this ...
          , longestLenEm = lastLinesI < 0 ? +Infinity : lineBreaks[lastLinesI][0]
          , [shortestLenEm, /*lastIndexes*/] = lineBreaks[i]
          , verticalMaxFontSize = normalizedAvailableHeightPt / amountOfLines
            // the shorter the line the bigger the font-size
          , horizontalMaxFontSize = availableWidthPt / shortestLenEm
            // the longer the line the smaller the font-size
          , horizontalMinFontSize = availableWidthPt / longestLenEm

          // we want to have the biggest font size that fits vertically and
          // horizontally ... so this must be min
          , maxFontSize = Math.min(verticalMaxFontSize, horizontalMaxFontSize)
          ;
        if(maxFontSize <= horizontalMinFontSize) {
            // This will create less lines than we expect from this setting,
            // as there's not enough vertical space. we can skip this.
            continue;
        }
        if(globalMaxFontSize > maxFontSize) {
            // we found our maximum, now font size is decreasing again
            break;
        }
        // font-size is still increasing;
        globalMaxFontSize = maxFontSize;
        lastLinesI = i;
    }

    let fontSize = Math.min(maxFontSize, Math.max(minFontSize, globalMaxFontSize));

    // The linesConfiguration may not be accurate anymore if globalMaxFontSize
    // doesn't match.
    let [, lineBreakIndexes] = _getLineBreaksForLineLength(
                                                childrenWidthsEM,
                                                childrenRightMarginEm,
                                                availableWidthPt/fontSize);
    return [fontSize, lineBreakIndexes];
}

// It doesn't work as expected, when applied to contextual, likely
// because of the width set to the spans, which indeed stops "stuff"
// from moving around, but since that is a more line based than grid
// based view, it would be nice when the lines grow/and shrink.
function _fixGridLineBreaks(element) {
    // replace old lines with their child elements
    for(let div of element.getElementsByTagName('div'))
        div.parentElement.append(...div.children);

    let gapEm = 0.3
      , fontsizePx = 16
      , allWidths = []
      ;
    element.style.setProperty('font-size', `${fontsizePx}px`);
    // It could be good for the performance to measure the glyph width
    // in memory, instead of via browser/DOM rendering
    // `element.getBoundingClientRect()`, <canvas> comes to mind with
    // `ctx = canvas.getContext('2d').measureText(text)`. However, its
    // seems like in chrome, there would be a way to set`canvas.style.fontVariationSettings`,
    // but in Firefox this doesn't work. Also, seems like no good documentation
    // for the Chrome feature only this: https://codepen.io/JuanFuentes/pen/bGpGpzg
    // This leaves HarfbuzzJS as an option.
    for(let item of element.children) {
        // A sanity check because the old implementation was concerned with this.
        if (item.tagName !== 'SPAN')
            throw new Error(`UNEXPECTED ELEMENT <${item.tagName}>, expecting <SPAN>`);
        let box = item.getBoundingClientRect();
        allWidths.push(box.width / fontsizePx);
    }
    // if there are no children, allWidths is empty and Math.max(...[])
    // returns -Infinity.
    let maxWidth = Math.max(0, ...allWidths);

    for(let i=0,l=element.children.length;i<l;i++) {
        let item = element.children[i]
          , measured = allWidths[i]
          ;
        // hard-code the max width so it doesn't move around
        // Maybe, for the "grid" view, this all could be
        // simplified using css table, grid or flex layout.
        // besides, the grid is not very strictly a grid,
        // depending on glyph-widths columns align sloppily.
        // It's not too bad though, because of min-width: 1em;
        // for each element, but e.g. "Ǆ" can be wider than
        // 1em.
        // Added Math.ceil, so if a cell is wider than 1 em it
        // jumps up to 2 em or bigger integers which improves
        // alignment. a lot and gives extra space when required.
        item.style.setProperty('--measured-width-em', measured);
        // If box.width / fontsizePx > 0.85 we want to go up to 2 em
        item.style.setProperty('--width-em', maxWidth + 0.25);
        item.style.width = `calc(1em * var(--width-em))`;
        // This is important to keep the alignment correct.
        // The .3 em is from the original style.
        // It seems like the margin is also important to give just a bit
        // more leeway e.g. when applying non-registered XTRA.
        // set below: item.style.setProperty('--right-margin-em', `${rightMarginEm}`);
        item.style.marginRight = `calc(1em * var(--right-margin-em, 0))`;// * var(--width-em))`;
    }

    let [fontSizePt, lineBreaks] = gridFontSize(
            element
          , Array.from(element.children)
                .map(c=>parseFloat(c.style.getPropertyValue('--width-em')))
          , gapEm
        );

    element.style.fontSize = `${fontSizePt}pt`;
    // FIXME: alternatively remove applied padding from available space.
    element.style.padding = 0;
    for(let child of element.children) {
        // reset line breaks
        // child.style.background = '';
        child.style.setProperty('--right-margin-em', `${gapEm}`);
    }
    for(let i of lineBreaks) {
        // set line breaks
        let child = element.children[i];
        // child.style.background = 'lime';
        child.style.setProperty('--right-margin-em', '0');
    }
    return fontSizePt * 4 / 3; // return in px
}

// This started as a copy of _fixGridLineBreaks
function _fixContextualLineBreaks(element) {
    // replace old lines with their child elements
    for(let div of element.getElementsByTagName('div'))
        div.parentElement.append(...div.children);

    let fontsizePx = 166
      , allWidths = []
      ;
    element.style.setProperty('font-size', `${fontsizePx}px`);

    for(let item of element.children) {
        // A sanity check because the old implementation was concerned with this.
        if (item.tagName !== 'SPAN')
            throw new Error(`UNEXPECTED ELEMENT <${item.tagName}>, expecting <SPAN>`,);
        let box = item.getBoundingClientRect();
        allWidths.push(box.width / fontsizePx);
    }
    let elementWidths = [];
    for(let i=0,l=element.children.length;i<l;i++) {
        let item = element.children[i]
          , measured = allWidths[i]
          ;
        elementWidths.push(allWidths[i]);
        // FIXME: is only debugging inforamtion
        item.style.setProperty('--measured-width-em', measured);
    }

    const gapEm = 0.378
    let [fontSizePt, lineBreaks] = gridFontSize(element, elementWidths, gapEm);
    element.style.fontSize = `${fontSizePt}pt`;
    element.style.setProperty('--gap-em', gapEm);
    // FIXME: alternatively remove applied padding from available space.
    element.style.padding = 0;
    for(let i of lineBreaks) {
        let child = element.children[i];
        child.classList.add('end-of-line');
    }
    return fontSizePt * 4 / 3; // return in px
}

export function fixGridLineBreaks(font, elem) {
    return _withSetWidest(font, elem, _fixGridLineBreaks, elem);
}

export function fixContextualLineBreaks(font, elem) {
    return _withSetWidest(font, elem, _fixContextualLineBreaks, elem);
}
