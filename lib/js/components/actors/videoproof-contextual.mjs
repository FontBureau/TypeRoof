/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _BaseComponent
} from '../basics.mjs';

import {
    fixContextualLineBreaks
} from '../../affixed-line-breaks.mjs';

import {
    actorApplyCSSColors
  , actorApplyCssProperties
  , setTypographicPropertiesToSample
} from './properties-util.mjs';

import {
    setLanguageTagDirect
} from '../language-tags.typeroof.jsx';

import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';

import {
    CharGroupModel
  , charGroupsData
} from './videoproof-array.mjs';

// Re-export models from the models module for available-actors.mjs
export {
    VideoproofContextualKeyMomentModel
  , VideoproofContextualKeyMomentsModel
  , VideoproofContextualActorModel
} from './videoproof-contextual-models.mjs';

import {
    compileTemplateFromPropertyValuesMap
  , resolveChars
  , generateWords
} from './videoproof-contextual-template.mjs';

// --- Business Logic ---
//
// Reads charGroups (inner at index 0, optional outer at index 1) and
// template properties from the broom wagon's propertyValuesMap.
// Template compilation (including rules + selectors) is done from
// flat property paths via compileTemplateFromPropertyValuesMap.

function _getCellContents(charGroupsData, fonts, propertyValuesMap, previousStateKey) {
    const cellContents = {words: [], stateKey: null, changed: true};
    // charGroups is a list; the broom wagon produces paths like:
    //   generic/charGroups/0/options   (inner / primary)
    //   generic/charGroups/1/options   (outer, if present)
    //   generic/template/defaultPattern
    //   generic/template/rules/...
    if(!(propertyValuesMap.has('generic/charGroups/0/options')))
        return cellContents;

    const fonts_ = Array.from(new Set(fonts))
      , fullNames = fonts_.map(font=>font.fullName).join(';;')
        // Inner charGroup (always present, index 0)
      , innerCharGroupOption = propertyValuesMap.get('generic/charGroups/0/options')
      , innerShowExtended = propertyValuesMap.get('generic/charGroups/0/extended')
      , innerCustomText = propertyValuesMap.get('generic/charGroups/0/customText') || ''
      , innerCustomSeparator = propertyValuesMap.get('generic/charGroups/0/customSeparator') || ''
        // Outer charGroup (optional, index 1)
      , hasOuterCharGroup = propertyValuesMap.has('generic/charGroups/1/options')
      , outerCharGroupOption = hasOuterCharGroup
            ? propertyValuesMap.get('generic/charGroups/1/options')
            : null
      , outerShowExtended = hasOuterCharGroup
            ? propertyValuesMap.get('generic/charGroups/1/extended')
            : false
      , outerCustomText = hasOuterCharGroup
            ? (propertyValuesMap.get('generic/charGroups/1/customText') || '')
            : ''
      , outerCustomSeparator = hasOuterCharGroup
            ? (propertyValuesMap.get('generic/charGroups/1/customSeparator') || '')
            : ''
      ;

    // Compile the full template (rules + selectors + defaultPattern)
    // from flat property paths, following the getColorFromPropertyValuesMap pattern.
    const compiledTemplate = compileTemplateFromPropertyValuesMap(
            propertyValuesMap, 'generic/template', charGroupsData);

    // State key: all parameters that influence word generation.
    const stateKeyTokens = [
        fullNames
        // inner charGroup
      , innerCharGroupOption, innerShowExtended ? '1' : '0'
      , innerCustomSeparator.length, innerCustomSeparator
      , innerCustomText.length, innerCustomText
        // outer charGroup
      , hasOuterCharGroup ? '1' : '0'
      , outerCharGroupOption || '', outerShowExtended ? '1' : '0'
      , outerCustomSeparator.length, outerCustomSeparator
      , outerCustomText.length, outerCustomText
        // template — all property values (from compilation)
      , ...compiledTemplate.stateTokens
    ];

    cellContents.stateKey = stateKeyTokens.join(';');

    if(previousStateKey === cellContents.stateKey) {
        cellContents.changed = false;
        return cellContents;
    }

    // Resolve inner chars
    const innerChars = resolveChars(charGroupsData, fonts_
                                  , innerCharGroupOption, innerShowExtended
                                  , innerCustomText, innerCustomSeparator);

    if(compiledTemplate.arity >= 2) {
        // Arity-2: kerning — resolve outer chars
        let outerChars;
        if(hasOuterCharGroup) {
            // Explicit outer charGroup (charGroups[1])
            outerChars = resolveChars(charGroupsData, fonts_
                                    , outerCharGroupOption, outerShowExtended
                                    , outerCustomText, outerCustomSeparator);
        }
        else {
            // Single charGroup — outer uses same group without extended
            outerChars = innerShowExtended
                            ? resolveChars(charGroupsData, fonts_
                                         , innerCharGroupOption, false
                                         , innerCustomText, innerCustomSeparator)
                            : innerChars
                            ;
        }
        cellContents.words = generateWords(compiledTemplate, innerChars, outerChars);
    }
    else {
        // Arity-1: contextual — just inner chars
        cellContents.words = generateWords(compiledTemplate, innerChars);
    }

    return cellContents;
}

// --- Renderer ---

export class VideoproofContextualActorRenderer extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="actor_renderer-videoproof_contextual fixed-line-breaks fixed-lines">(content not initialized)</div>`;
    // jshint ignore:end
    constructor(widgetBus, charGroupsData) {
        super(widgetBus);
        this._charGroupsData = charGroupsData;
        this._cellsStateKey = null;
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return [element];
    }

    _updateWords(font, words) {
        const cells = [];
        for(const word of words) {
            const cell = this._domTool.createElement('span');
            cell.textContent = `${word}`;
            cells.push(cell);
            if(cells.length > 1000) {
                console.warn(`${this} SKIP words cell size > 1000 words.length`, words.length, 'words', words);
            }
        }
        this.element.replaceChildren(...cells);
        console.warn(`${this} SKIP fixContextualLineBreaks`);
        //fixContextualLineBreaks(font, this.element);
    }

    update(changedMap) {
        const propertiesData = [
            ['numericProperties/z-index', 'z-index', '',  Math.round]
        ];

        const font = (changedMap.has('font')
                        ? changedMap.get('font')
                        : this.getEntry('font')).value
          ;
        if(changedMap.has('font')) {
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
            this._cellsStateKey = null;
        }

        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, ''];
                    return [true, getRegisteredPropertySetup(property).default];
                }
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;

            const cellContents = _getCellContents(this._charGroupsData, [font], propertyValuesMap, this._cellsStateKey);
            if(cellContents.changed) {
                this._cellsStateKey = cellContents.stateKey;
                if(cellContents.words.length)
                    this._updateWords(font, cellContents.words);
                else
                    this._domTool.clear(this.element);
            }

            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
            setTypographicPropertiesToSample(this.element, propertyValuesMap, true);
            setLanguageTagDirect(this.element, propertyValuesMap);
        }
    }
}
