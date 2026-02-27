import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
} from '../../metamodel.mjs';

import {
    _BaseActorModel
  , genericActorMixin
} from './actors-base.mjs';

import {
    typographyKeyMomentModelMixin
  , typographyActorMixin
  , BooleanOrEmptyModel
  , StringOrEmptyModel
} from './models.mjs';

import {
    ColorModel
} from '../color.mjs';

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
  , CharGroupOptionsModel
  , charGroupsData
} from './videoproof-array.mjs';

import {
    getCharsForSelectUI
  , getExtendedChars
} from '../ui-char-groups.mjs';

// --- Model Definitions ---

const PadModeModel = _AbstractEnumModel.createClass(
        'PadModeModel'
      , ['auto-short', 'auto-long', 'kern-upper', 'kern-mixed', 'kern-lower', 'custom']
      , 'auto-short'
    )
  , PadModeOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PadModeModel)
  , VideoproofContextualKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofContextualKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      , ['charGroup', CharGroupModel]
      , ['padMode', PadModeOrEmptyModel]
      , ['customPad', StringOrEmptyModel]
      , ['showCellBoxes', BooleanOrEmptyModel]
      , ['stageBackgroundColor', ColorModel]
    )
  , VideoproofContextualKeyMomentsModel = _AbstractListModel.createClass(
        'VideoproofContextualKeyMomentModel'
      , VideoproofContextualKeyMomentModel
    )
  ;

export { CharGroupOptionsModel, charGroupsData };

export const VideoproofContextualActorModel = _BaseActorModel.createClass(
    'VideoproofContextualActorModel'
  , ...genericActorMixin
  , ['keyMoments', VideoproofContextualKeyMomentsModel]
  , ...typographyActorMixin
);

// --- Business Logic (ported from legacy videoproof-contextual.mjs) ---

function _testCharType(extendedCharGroups, c, re) {
    if (re.test(c))
        return true;
    for(const [k, extChars] of Object.entries(extendedCharGroups)) {
        if (!re.test(k))
            continue;
        if(extChars.indexOf(c) != -1)
            return true;
    }
    return false;
}

function _formatAuto(mode, autoFormatter, c) {
    for(const [test, format] of autoFormatter) {
        if(test(c))
            return format(c);
    }
    throw new Error(`Don't know how to format "${c}" in mode: ${mode}.`);
}

function _formatCustom(customPad, c) {
    return `${customPad}${c}${customPad}`;
}

function* _kernPaddingGen(outer, inner) {
    for(const o of outer)
        for(const i of inner)
            yield [o, i];
}

const _autoFormatters = {
            'auto-short': [
                ['isNumeric', c=>`00${c}00`]
              , ['isLowercase', c=>`nn${c}nn`]
                // default, also isUppercase:
              , ['default', c=>`HH${c}HH`]
            ]
          , 'auto-long': [
                    ['isNumeric', c=>`00${c}0101${c}11`]
                  , ['isLowercase', c=>`nn${c}nono${c}oo`]
                    // default, also isUppercase:
                  , ['default', c=>`HH${c}HOHO${c}OO`]
            ]
      }
    , _kernFormatters = {
            'kern-upper': ([o, i])=>`HO${o}${i}${o}OLA`
          , 'kern-mixed': ([o, i])=>`${o}${i}nnoy`
          , 'kern-lower': ([o, i])=>`no${o}${i}${o}ony`
      }
    , _kernModesCharsConfig = { // mode: [charsKey, outer]
            'kern-upper': ['Latin.Uppercase', undefined]
                                              // CUSTOM! outer
          , 'kern-mixed': ['Latin.Lowercase', [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]]
          , 'kern-lower': ['Latin.Lowercase', undefined]
      }
    ;

function _getKernChars(charGroupsData, fonts, showExtended, mode) {
    if(!(mode in _kernModesCharsConfig))
        throw new Error(`Don't know how to get chars for mode: "${mode}".`);
    const [charsKey, customOuter] = _kernModesCharsConfig[mode]
      , data = getCharsForSelectUI(charGroupsData, fonts, charsKey)
      , outer = customOuter !== undefined ? customOuter : data.chars
      , inner = showExtended && data.hasExtended
            ? [...data.chars, ...Array.from(data.extendedChars.values()).flat()]
            : data.chars
      ;
    return [outer, inner];
}

function _getExtendedCharGroupsMap(charGroupsData, chars) {
    const extendedChars = getExtendedChars(charGroupsData, chars, true)
      , result = {}
      ;
    for(const [key, values] of extendedChars)
        if(key !== null)
            result[key] = values;
    return result;
}

function _getWords(charGroupsData, fonts, selectedChars, showExtended
                 , padMode, customPad) {
    const extendedCharGroups = _getExtendedCharGroupsMap(charGroupsData, selectedChars)
      , _formatterTests = {
            'isNumeric':  c=>_testCharType(extendedCharGroups, c, /[0-9]/)
          , 'isLowercase': c=>_testCharType(extendedCharGroups, c, /[a-z]/)
          , 'default': ()=>true
        }
      , _getAutoFormatter = padMode_=>{
            const description = _autoFormatters[padMode_]
              , result = []
              ;
            for(const [testName, format] of description)
                result.push([_formatterTests[testName], format]);
            return result;
        }
      , words = []
      ;

    let chars, formatter;
    if(padMode in _kernFormatters) {
        const [outerChars, innerChars] = _getKernChars(charGroupsData, fonts, showExtended, padMode);
        chars = _kernPaddingGen(outerChars, innerChars);
        formatter = _kernFormatters[padMode];
    }
    else if(padMode === 'custom') {
        chars = selectedChars;
        formatter = c=>_formatCustom(customPad, c);
    }
    else if(padMode in _autoFormatters) {
        chars = selectedChars;
        formatter = c=>_formatAuto(padMode, _getAutoFormatter(padMode), c);
    }
    else
        throw new Error(`Don't know how to handle mode: "${padMode}".`);

    for(const c of chars)
        words.push(formatter(c));
    if(padMode in _kernFormatters)
        // Behavior from legacy code.
        words.push(0);
    return words;
}

// --- Cell Contents (adapted from videoproof-array.mjs _getCellContents) ---

function _getCellContents(charGroupsData, fonts, propertyValuesMap, previousStateKey) {
    const cellContents = {chars: [], words: [], stateKey: null, changed: true};
    if(!(propertyValuesMap.has('generic/charGroup/options')))
        return cellContents;

    const fonts_ = Array.from(new Set(fonts))
      , charGroup = propertyValuesMap.get('generic/charGroup/options')
      , showExtended = propertyValuesMap.get('generic/charGroup/extended')
      , padMode = propertyValuesMap.get('generic/padMode') || 'auto-short'
      , customPad = propertyValuesMap.get('generic/customPad') || ''
      , cellsStateKeyTokens = []
      ;

    let data;
    if(charGroup === 'custom') {
        const customText = propertyValuesMap.get('generic/charGroup/customText') || ''
          , customSeparator = propertyValuesMap.get('generic/charGroup/customSeparator') || ''
          , chars = customSeparator !== '' ? customText.split(customSeparator) : [...customText]
          , extendedChars = getExtendedChars(charGroupsData, chars, true)
          ;
        data = { chars, extendedChars, hasExtended: extendedChars.size > 0};
        cellsStateKeyTokens.push(
                  customSeparator.length, customSeparator
                , customText.length, customText);
    }

    const fullNames = fonts_.map(font=>font.fullName).join(';;');
    cellContents.stateKey = [fullNames, charGroup
            , showExtended ? '1' : '0'
            , padMode, customPad
            , ...cellsStateKeyTokens].join(';');

    if(previousStateKey === cellContents.stateKey) {
        cellContents.changed = false;
        return cellContents;
    }

    if(charGroup !== 'custom')
        data = getCharsForSelectUI(charGroupsData, fonts_, charGroup);

    // Build selectedChars with extended chars support
    const selectedChars = [];
    if(showExtended && data.hasExtended) {
        const extendedSeen = new Set();
        for(const c of data.chars) {
            selectedChars.push(c);
            if(!extendedSeen.has(c) && data.extendedChars.has(c)) {
                for(const ec of data.extendedChars.get(c))
                    selectedChars.push(ec);
            }
            extendedSeen.add(c);
        }
        if(data.extendedChars.has(null)) {
            for(const ec of data.extendedChars.get(null))
                selectedChars.push(ec);
        }
    }
    else {
        for(const c of data.chars) selectedChars.push(c);
    }

    cellContents.chars = selectedChars;
    cellContents.words = _getWords(charGroupsData, fonts_, selectedChars
                                 , showExtended, padMode, customPad);
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
