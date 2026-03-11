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
    compilePattern
  , resolveChars
  , resolveOuterChars
  , generateWords
} from './videoproof-contextual-template.mjs';

// --- Business Logic ---
//
// Reads charGroups (inner at index 0, optional outer at index 1) and
// template properties from the broom wagon's propertyValuesMap.
//
// Currently uses only defaultPattern (compiled on the fly via compilePattern).
// TODO (Phase 7): Read full compiled template (rules + selectors) from
// TemplateModel state, compiled/cached via coherence function.

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
        // Template properties
      , defaultPattern = propertyValuesMap.get('generic/template/defaultPattern') || ''
        // TODO: read rules from propertyValuesMap when template compilation
        // from model state is implemented (Phase 7).
        // For now, only defaultPattern is used.
      ;

    // State key: all parameters that influence word generation
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
        // template
      , defaultPattern.length, defaultPattern
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

    if(!defaultPattern) {
        // No template configured — return unformatted chars
        cellContents.words = innerChars;
        return cellContents;
    }

    // Compile the pattern (TODO: use full compiled template with rules
    // once Phase 7 is implemented)
    const compiledParts = compilePattern(defaultPattern)
      , compiledTemplate = {
            rules: []
          , defaultParts: compiledParts.parts
          , arity: compiledParts.arity
        }
      ;

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
            outerChars = resolveOuterChars(charGroupsData, fonts_
                                         , innerCharGroupOption
                                         , innerCustomText, innerCustomSeparator);
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
        }
        this.element.replaceChildren(...cells);
        fixContextualLineBreaks(font, this.element);
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
