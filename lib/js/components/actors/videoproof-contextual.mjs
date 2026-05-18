import { _BaseComponent } from "../basics.mjs";

import {
    measureWordWidths,
    computeFontSizeAndLayout,
    clampScrollPosition,
    scrollByLines,
    wordIndexToLine,
    getVisibleRange,
    DEFAULT_GAP_EM,
    DEFAULT_LINE_HEIGHT_EM,
} from "./videoproof-contextual-layout.mjs";

import {
    actorApplyCSSColors,
    actorApplyCssProperties,
    setTypographicPropertiesToSample,
} from "./properties-util.mjs";

import { setLanguageTagDirect } from "../language-tags.typeroof.jsx";

import { getRegisteredPropertySetup } from "../registered-properties.mjs";

// Re-export models from the models module for available-actors.mjs
export {
    VideoproofContextualKeyMomentModel,
    VideoproofContextualKeyMomentsModel,
    VideoproofContextualActorModel,
} from "./videoproof-contextual-models.mjs";

import { resolveChars } from "../ui-char-groups.mjs";

import { METAMODEL } from "../registered-properties-definitions.mjs";

import {
    compileTemplate,
    DEFAULT_COMPILED_TEMPLATE,
    generateWords,
} from "./videoproof-contextual-template.mjs";

// --- Business Logic ---
//
// Reads charGroups (inner at index 0, optional outer at index 1) and
// template properties from the broom wagon's propertyValuesMap.
// Template compilation (including rules + selectors) is done from
// an instance of TemplateModel via compileTemplate.

function _getCellContents(
    charGroupsData,
    fonts,
    propertyValuesMap,
    previousStateKey,
) {
    const cellContents = { words: [], stateKey: null, changed: true };
    // charGroups is a list; the broom wagon produces paths like:
    //   generic/charGroups/0/options   (inner / primary)
    //   generic/charGroups/1/options   (outer, if present)
    //   generic/template/defaultPattern
    //   generic/template/rules/...
    if (!propertyValuesMap.has("generic/charGroups/0/options"))
        return cellContents;

    const fonts_ = Array.from(new Set(fonts)),
        fullNames = fonts_.map((font) => font.fullName).join(";;"),
        // Inner charGroup (always present, index 0)
        innerCharGroupOption = propertyValuesMap.get(
            "generic/charGroups/0/options",
        ),
        innerShowExtended = propertyValuesMap.get(
            "generic/charGroups/0/extended",
        ),
        innerCustomText =
            propertyValuesMap.get("generic/charGroups/0/customText") || "",
        innerCustomSeparator =
            propertyValuesMap.get("generic/charGroups/0/customSeparator") || "",
        // Outer charGroup (optional, index 1)
        hasOuterCharGroup = propertyValuesMap.has(
            "generic/charGroups/1/options",
        ),
        outerCharGroupOption = hasOuterCharGroup
            ? propertyValuesMap.get("generic/charGroups/1/options")
            : null,
        outerShowExtended = hasOuterCharGroup
            ? propertyValuesMap.get("generic/charGroups/1/extended")
            : false,
        outerCustomText = hasOuterCharGroup
            ? propertyValuesMap.get("generic/charGroups/1/customText") || ""
            : "",
        outerCustomSeparator = hasOuterCharGroup
            ? propertyValuesMap.get("generic/charGroups/1/customSeparator") ||
              ""
            : "",
        templateModel = propertyValuesMap.get(`${METAMODEL}template`);
    // Compile the full template (rules + selectors + defaultPattern)
    // from flat property paths, following the getColorFromPropertyValuesMap pattern.
    const compiledTemplate = templateModel
        ? compileTemplate(templateModel, charGroupsData)
        : DEFAULT_COMPILED_TEMPLATE;
    // State key: all parameters that influence word generation.
    const stateKeyTokens = [
        fullNames,
        // inner charGroup
        innerCharGroupOption,
        innerShowExtended ? "1" : "0",
        innerCustomSeparator.length,
        innerCustomSeparator,
        innerCustomText.length,
        innerCustomText,
        // outer charGroup
        hasOuterCharGroup ? "1" : "0",
        outerCharGroupOption || "",
        outerShowExtended ? "1" : "0",
        outerCustomSeparator.length,
        outerCustomSeparator,
        outerCustomText.length,
        outerCustomText,
        // template — all property values (from compilation)
        ...compiledTemplate.stateTokens,
    ];

    cellContents.stateKey = stateKeyTokens.join(";");

    if (previousStateKey === cellContents.stateKey) {
        cellContents.changed = false;
        return cellContents;
    }

    // Resolve inner chars
    const innerChars = resolveChars(
        charGroupsData,
        fonts_,
        innerCharGroupOption,
        innerShowExtended,
        innerCustomText,
        innerCustomSeparator,
    );

    if (compiledTemplate.arity >= 2) {
        // Arity-2: kerning — resolve outer chars
        let outerChars;
        if (hasOuterCharGroup) {
            // Explicit outer charGroup (charGroups[1])
            outerChars = resolveChars(
                charGroupsData,
                fonts_,
                outerCharGroupOption,
                outerShowExtended,
                outerCustomText,
                outerCustomSeparator,
            );
        } else {
            // Single charGroup — outer uses same group without extended
            outerChars = innerShowExtended
                ? resolveChars(
                      charGroupsData,
                      fonts_,
                      innerCharGroupOption,
                      false,
                      innerCustomText,
                      innerCustomSeparator,
                  )
                : innerChars;
        }
        cellContents.words = generateWords(
            compiledTemplate,
            innerChars,
            outerChars,
        );
    } else {
        // Arity-1: contextual — just inner chars
        cellContents.words = generateWords(compiledTemplate, innerChars);
    }

    return cellContents;
}

// --- Renderer ---
//
// Virtual-scroll architecture: instead of rendering all words into the DOM,
// we measure word widths via HarfBuzz, compute line layout mathematically,
// and render only the currently visible page of complete lines.
//
// Four-phase pipeline:
//   1. MEASURE  — HarfBuzz word width measurement (on word/font change)
//   2. LAYOUT   — Font-size fitting + line breaking (on measure change or resize)
//   3. RENDER   — DOM update for visible page only (on layout change or scroll)
//   4. SCROLL   — Native scrollbar via spacer element
//
// DOM structure:
//   [scrollContainer]  — overflow-y: auto, provides native scrollbar
//     [spacer]         — height: 10000%, creates scroll range
//     [element]        — position: sticky; top: 0, visible content
//
// State:
//   _words[]          — generated word strings (in memory, not DOM)
//   _wordWidthsEm[]   — width of each word in em (HarfBuzz at widest axes)
//   _lineStarts[]     — lineStarts[i] = word index of first word on line i
//   _totalLines       — lineStarts.length
//   _linesPerPage     — how many lines fit on screen
//   _fontSizePt       — computed font size
//   _scrollWordIndex  — scroll position as a WORD INDEX
//
// Scroll position is a word index: "word #N should be visible".
// The system resolves which line word #N is on internally.
// The native scrollbar position is mapped proportionally to the word index.

export class VideoproofContextualActorRenderer extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE =
        `<div class="actor_renderer-videoproof_contextual-scroll_container" tabindex="0">` +
        `<div class="actor_renderer-videoproof_contextual fixed-lines"></div>` +
        `<div style="height: 10000%"></div>` +
        `</div>`;
    // jshint ignore:end
    constructor(widgetBus, charGroupsData) {
        super(widgetBus);
        this._charGroupsData = charGroupsData;

        // One of three StateKeys
        this._cellsStateKey = null;

        // Virtual-scroll state
        this._words = [];
        this._wordWidthsEm = [];
        this._lineStarts = [];
        this._totalLines = 0;
        this._linesPerPage = 0;
        this._fontSizePt = 0;
        // Scroll position is a WORD INDEX: "word #N should be visible".
        // The system resolves which line the word is on internally.
        // This makes the position meaningful for sharing/review and
        // stable across relayouts.
        this._scrollWordIndex = 0;
        this._measurementStateKey = null;
        this._layoutStateKey = null;

        // Configurable parameters (constants for now, configurable later)
        this._gapEm = DEFAULT_GAP_EM;
        this._lineHeightEm = DEFAULT_LINE_HEIGHT_EM;

        // Flag to suppress scroll handler during programmatic scrollTop changes
        this._suppressScrollHandler = false;

        [this._scrollContainer, this._spacer, this.element] =
            this.initTemplate();

        // Event handlers (bound for cleanup)
        this._onScroll = this._onScroll.bind(this);
        this._onKeydown = this._onKeydown.bind(this);

        this._scrollContainer.addEventListener("scroll", this._onScroll, {
            passive: true,
        });
        this._scrollContainer.addEventListener("keydown", this._onKeydown);
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ),
            scrollContainer = frag.firstElementChild,
            element = scrollContainer.children[0],
            spacer = scrollContainer.children[1];
        this._insertElement(scrollContainer);
        return [scrollContainer, spacer, element];
    }

    // --- Phase 1: Measurement ---

    _measureWords(font, words) {
        this._words = words;
        this._wordWidthsEm = measureWordWidths(
            this.widgetBus.harfbuzz.hbjs,
            font,
            words,
        );
        // Invalidate layout
        this._layoutStateKey = null;
    }

    // --- Phase 2: Layout ---

    _getAvailableDimensions() {
        // The host element is the stage layer (100% x 100% of stage)
        // offsetWidth/Height give pre-transform dimensions
        const host = this.widgetBus.wrapper.host;
        return {
            widthPt: host.offsetWidth * 0.75, // px to pt
            heightPt: host.offsetHeight * 0.75, // px to pt
        };
    }

    _relayout() {
        const { widthPt, heightPt } = this._getAvailableDimensions();

        const layoutKey = [
            widthPt,
            heightPt,
            this._gapEm,
            this._lineHeightEm,
            this._wordWidthsEm.length,
            this._measurementStateKey,
        ].join(";");

        if (layoutKey === this._layoutStateKey) return false; // no change
        this._layoutStateKey = layoutKey;

        const result = computeFontSizeAndLayout(
            this._wordWidthsEm,
            this._gapEm,
            this._lineHeightEm,
            widthPt,
            heightPt,
        );

        this._fontSizePt = result.fontSizePt;
        this._lineStarts = result.lineStarts;
        this._linesPerPage = result.linesPerPage;
        this._totalLines = result.totalLines;

        // Apply font-size and layout CSS to the element
        this.element.style.setProperty("font-size", `${this._fontSizePt}pt`);
        this.element.style.setProperty("line-height", `${this._lineHeightEm}`);
        this.element.style.setProperty("--gap-em", `${this._gapEm}`);
        this.element.style.setProperty("padding", "0");

        // Clamp scroll position: the current word index may now be
        // on a different line or past the end. clampScrollPosition
        // resolves it to the nearest valid page.
        this._scrollWordIndex = clampScrollPosition(
            this._scrollWordIndex,
            this._lineStarts,
            this._totalLines,
            this._linesPerPage,
        );

        this._syncScrollTop();
        return true; // layout changed
    }

    // --- Phase 3: Render ---

    _renderVisiblePage() {
        const { firstLine, lastLine, firstWord, lastWord } = getVisibleRange(
            this._scrollWordIndex,
            this._linesPerPage,
            this._lineStarts,
            this._words.length,
        );

        if (lastWord < firstWord) {
            this._domTool.clear(this.element);
            return;
        }

        // Build set of word indices that end a visible line
        // (the word just before the next line starts, or the last word)
        const lineEndIndices = new Set();
        for (let line = firstLine; line <= lastLine; line++) {
            const lineEnd =
                line + 1 < this._lineStarts.length
                    ? // the next lineStart word index - 1 is the ending word
                      // index of this line
                      this._lineStarts[line + 1] - 1
                    : this._words.length - 1;
            lineEndIndices.add(lineEnd);
        }

        const spans = [];
        for (let i = firstWord; i <= lastWord; i++) {
            const span = this._domTool.createElement("span");
            span.textContent = this._words[i];
            if (lineEndIndices.has(i)) span.classList.add("end-of-line");
            spans.push(span);
        }
        this.element.replaceChildren(...spans);
    }

    // --- Phase 4: Scroll ---
    //
    // Native scrollbar via spacer element. The scroll container has
    // overflow-y: auto and contains a tall spacer (height: 10000%)
    // that creates the scroll range. The content element is
    // position: sticky; top: 0 and stays pinned.
    //
    // Scroll position mapping:
    //   scrollTop ∈ [0, maxScrollTop]  ↔  line ∈ [0, maxLine]
    //   where maxScrollTop = spacer.offsetHeight - container.clientHeight
    //   and   maxLine = max(0, totalLines - linesPerPage)

    _getMaxScrollTop() {
        return this._spacer.offsetHeight - this._scrollContainer.clientHeight;
    }

    _getMaxLine() {
        return Math.max(0, this._totalLines - this._linesPerPage);
    }

    // Map scrollTop → word index (first word of the corresponding line)
    _scrollTopToWordIndex(scrollTop) {
        const maxScrollTop = this._getMaxScrollTop(),
            maxLine = this._getMaxLine();
        if (maxScrollTop <= 0 || maxLine <= 0) return 0;
        const proportion = scrollTop / maxScrollTop,
            line = Math.round(proportion * maxLine),
            clampedLine = Math.max(0, Math.min(line, maxLine));
        return this._lineStarts[clampedLine];
    }

    // Map word index → scrollTop
    _wordIndexToScrollTop(wordIndex) {
        const maxScrollTop = this._getMaxScrollTop(),
            maxLine = this._getMaxLine();
        if (maxScrollTop <= 0 || maxLine <= 0) return 0;
        const line = wordIndexToLine(wordIndex, this._lineStarts),
            proportion = line / maxLine;
        return Math.round(proportion * maxScrollTop);
    }

    // Set scrollContainer.scrollTop to match _scrollWordIndex.
    // Suppresses the scroll handler to avoid feedback loop.
    _syncScrollTop() {
        const targetScrollTop = this._wordIndexToScrollTop(
            this._scrollWordIndex,
        );
        if (Math.abs(this._scrollContainer.scrollTop - targetScrollTop) < 1)
            return;
        this._suppressScrollHandler = true;
        this._scrollContainer.scrollTop = targetScrollTop;
        this._suppressScrollHandler = false;
    }

    // Scroll to a specific word index. The page containing that word
    // becomes visible (the word's line becomes the first visible line).
    _scrollToWord(wordIndex) {
        const clamped = clampScrollPosition(
            wordIndex,
            this._lineStarts,
            this._totalLines,
            this._linesPerPage,
        );
        if (clamped === this._scrollWordIndex) return;
        this._scrollWordIndex = clamped;
        this._syncScrollTop();
        this._renderVisiblePage();
    }

    // Scroll by N lines relative to current position.
    _scrollByLines(deltaLines) {
        const newWordIndex = scrollByLines(
            this._scrollWordIndex,
            deltaLines,
            this._lineStarts,
            this._totalLines,
            this._linesPerPage,
        );
        if (newWordIndex === this._scrollWordIndex) return;
        this._scrollWordIndex = newWordIndex;
        this._syncScrollTop();
        this._renderVisiblePage();
    }

    _onScroll(/*event*/) {
        if (this._suppressScrollHandler) return;
        const wordIndex = this._scrollTopToWordIndex(
            this._scrollContainer.scrollTop,
        );
        if (wordIndex === this._scrollWordIndex) return;
        this._scrollWordIndex = wordIndex;
        this._renderVisiblePage();
    }

    _onKeydown(event) {
        if (!this._totalLines) return;
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                this._scrollByLines(1);
                break;
            case "ArrowUp":
                event.preventDefault();
                this._scrollByLines(-1);
                break;
            case "PageDown":
                event.preventDefault();
                this._scrollByLines(this._linesPerPage);
                break;
            case "PageUp":
                event.preventDefault();
                this._scrollByLines(-this._linesPerPage);
                break;
            case "Home":
                event.preventDefault();
                this._scrollToWord(0);
                break;
            case "End":
                event.preventDefault();
                // Infinity gets clamped to last valid page
                this._scrollToWord(Infinity);
                break;
        }
    }

    // --- Cleanup ---

    destroy() {
        this._scrollContainer.removeEventListener("scroll", this._onScroll);
        this._scrollContainer.removeEventListener("keydown", this._onKeydown);
        super.destroy();
    }

    // --- Update (main entry point from animation system) ---

    update(changedMap) {
        const propertiesData = [
            ["numericProperties/z-index", "z-index", "", Math.round],
        ];

        const font = (
            changedMap.has("font")
                ? changedMap.get("font")
                : this.getEntry("font")
        ).value;
        if (changedMap.has("font")) {
            const font = changedMap.get("font").value;
            this.element.style.setProperty("font-family", `"${font.fullName}"`);
            this._cellsStateKey = null;
            // Font change invalidates word width measurements
            this._measurementStateKey = null;
        }

        if (
            changedMap.has("animationProperties@") ||
            changedMap.has("globalT")
        ) {
            const animationProperties = changedMap.has("animationProperties@")
                    ? changedMap.get("animationProperties@")
                    : this.getEntry("animationProperties@"),
                globalT = (
                    changedMap.has("globalT")
                        ? changedMap.get("globalT")
                        : this.getEntry("globalT")
                ).value,
                propertyValuesMap =
                    animationProperties.animanion.getPropertiesFromGlobalT(
                        globalT,
                    ),
                getDefault = (property) => {
                    if (
                        "numericProperties/width" === property ||
                        "numericProperties/height" === property
                    )
                        return [false, ""];
                    return [true, getRegisteredPropertySetup(property).default];
                },
                colorPropertiesMap = [
                    ["colors/backgroundColor", "background-color"],
                    ["colors/textColor", "color"],
                ];
            // _getCellContents is a lot like the original function
            // and cellContents.stateKey thereby as well
            const cellContents = _getCellContents(
                this._charGroupsData,
                [font],
                propertyValuesMap,
                this._cellsStateKey,
            );
            if (cellContents.changed) {
                this._cellsStateKey = cellContents.stateKey;
                if (cellContents.words.length) {
                    this._measureWords(font, cellContents.words);
                    this._measurementStateKey = cellContents.stateKey;
                    this._relayout();
                    this._renderVisiblePage();
                } else {
                    this._words = [];
                    this._wordWidthsEm = [];
                    this._lineStarts = [];
                    this._totalLines = 0;
                    this._domTool.clear(this.element);
                }
            } else if (cellContents.stateKey !== null) {
                // Words didn't change, but layout might need update
                // (e.g., container resized since last render).
                // _relayout is cheap when nothing changed (state key check).
                if (this._relayout()) this._renderVisiblePage();
            }
            actorApplyCSSColors(
                this.element,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
            actorApplyCssProperties(
                this.element,
                propertyValuesMap,
                getDefault,
                propertiesData,
            );
            // skipFontSize=true: we manage font-size ourselves
            setTypographicPropertiesToSample(
                this.element,
                propertyValuesMap,
                true,
            );
            setLanguageTagDirect(this.element, propertyValuesMap);
        }
    }
}
