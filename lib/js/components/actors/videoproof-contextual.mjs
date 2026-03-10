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

// Re-export models from the models module for available-actors.mjs
export {
    VideoproofContextualKeyMomentModel
  , VideoproofContextualKeyMomentsModel
  , VideoproofContextualActorModel
  , CharGroupModel
  , charGroupsData
} from './videoproof-contextual-models.mjs';

import {
    resolveChars
} from './videoproof-contextual-template.mjs';

// --- Business Logic ---
//
// TODO: Implement _getCellContents using deserialized TemplateModel instances.
//
// The flow will be:
// 1. Read the compiled template from the model (cached via WeakMap/symbol
//    in a coherence function on the key moment model).
// 2. Resolve chars from the charGroups list model (items 0 and optionally 1).
// 3. Call generateWords(compiledTemplate, innerChars, outerChars).
//
// For now, this reads the first charGroup from the charGroups list
// (via the broom wagon property paths) and returns unformatted chars.
// Template application is deferred to Phase 7.

function _getCellContents(charGroupsData_, fonts, propertyValuesMap, previousStateKey) {
    const cellContents = {words: [], stateKey: null, changed: true};
    // charGroups is a list; the broom wagon produces paths like:
    //   generic/charGroups/0/options
    //   generic/charGroups/0/extended
    //   generic/charGroups/0/customText
    //   generic/charGroups/0/customSeparator
    if(!(propertyValuesMap.has('generic/charGroups/0/options')))
        return cellContents;

    const fonts_ = Array.from(new Set(fonts))
      , charGroupOption = propertyValuesMap.get('generic/charGroups/0/options')
      , showExtended = propertyValuesMap.get('generic/charGroups/0/extended')
      ;

    // State key for dirty checking
    const fullNames = fonts_.map(font=>font.fullName).join(';;')
      , stateKeyTokens = [fullNames, charGroupOption
            , showExtended ? '1' : '0']
      ;

    if(charGroupOption === 'custom') {
        const customText = propertyValuesMap.get('generic/charGroups/0/customText') || ''
          , customSeparator = propertyValuesMap.get('generic/charGroups/0/customSeparator') || ''
          ;
        stateKeyTokens.push(customSeparator.length, customSeparator
                          , customText.length, customText);
    }

    cellContents.stateKey = stateKeyTokens.join(';');

    if(previousStateKey === cellContents.stateKey) {
        cellContents.changed = false;
        return cellContents;
    }

    // Resolve chars from the first charGroup
    cellContents.words = resolveChars(charGroupsData_, fonts_
                                    , charGroupOption, showExtended
                                    , propertyValuesMap.get('generic/charGroups/0/customText') || ''
                                    , propertyValuesMap.get('generic/charGroups/0/customSeparator') || '');
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
