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
  , StringOrEmptyModel
} from './models.mjs';

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
  , getCharsForKey
} from '../ui-char-groups.mjs';

// --- Model Definitions ---

const PadModeModel = _AbstractEnumModel.createClass(
        'PadModeModel'
        // FIXME: this is not ideal. These options should rather be data!
      , ['auto-short', 'auto-long', // depends on chars selection
            // selects own chars (Latin.lowercase, Latain.uppercase, etc.)
            // I.e. the chars UI should not be displayed for these!
            // It's kind of a different category to 'auto-short', 'auto-long', custom
            // as it creates pairs!
            // kern-custom could be a thing to create pairs as well...
            // AND I'm A) not happy to have this here, and the semantic
            // of it hard coded below...
            'kern-upper', 'kern-mixed', 'kern-lower',
            // from chars again, but different padding
            'custom'
        ]
      , 'auto-short'
    )
  , PadModeOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PadModeModel)
  , VideoproofContextualKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofContextualKeyMomentModel'
      , ...typographyKeyMomentModelMixin
        // should only be displayed if relevant, NOTE: showExtended can
        // still be relevant, even if charGroup is not!
        // given the nature of the type-driven model, it may make sense
        // to create a different model from this, that includes padMode
        // and customPad as well, especially, because the showExtended
        // switch is re-used outside of the char-groups as well...
        //
        // IF we could re-use CharGroupModel, it could make switching the
        // renderer (contextual/array) very nice, as the charGroup setting
        // could be preserved. However, another way could be an option as
        // well (coherence function, understand this kind of switch and
        // activeley preserve the data?, it should have access to the
        // OLD_STATE of the draft ... ???)
      , ['charGroup', CharGroupModel]
      , ['padMode', PadModeOrEmptyModel]
        // should only be displayed if padMode === custom
      , ['customPad', StringOrEmptyModel]
    )
  , VideoproofContextualKeyMomentsModel = _AbstractListModel.createClass(
        'VideoproofContextualKeyMomentModel'
      , VideoproofContextualKeyMomentModel
    )
  ;

export const VideoproofContextualActorModel = _BaseActorModel.createClass(
    'VideoproofContextualActorModel'
  , ...genericActorMixin
  , ['keyMoments', VideoproofContextualKeyMomentsModel]
  , ...typographyActorMixin
);

// --- Business Logic (ported from legacy videoproof-contextual.mjs) ---

// either c matches the regex directly or c is member of an extended chars
// group of which the key-char matches the regex.
function _testCharType(extendedChars, c, re) {
    if (re.test(c))
        return true;
    //checks all items in extendedChars
    // is c an extended char of any extended chars group
    // of which the key matches the regex
    for(const [k, extChars] of extendedChars) {
        if (!re.test(k))
            // if the key doesn't match the regex, we are not interested
            continue;
        // ok the key matches the regex, if char is part of the group
        // it "inherits" the char type of it's group key.
        if(extChars.indexOf(c) != -1)
            return true;
    }
    return false;
}

function _formatAuto(mode, autoFormatterSpec, c) {
    for(const [test, format] of autoFormatterSpec) {
        if(test(c))
            return format(c);
    }
    throw new Error(`Don't know how to format "${c}" in mode: ${mode}.`);
}

function _formatCustom(customPad, c) {
    return `${customPad}${c}${customPad}`;
}

function* _kernPairProductGen(outer, inner) {
    for(const o of outer)
        for(const i of inner)
            yield [o, i];
}


// _autoFormatters test the char type and select the formatter
// accordingly.
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
      // FIXME: these options should not just be called
      // kern-upper, kern-lower ...
      // They should be called: Latin: kern upper, Latin: kern-lower
    , _kernModesCharsConfig = { // mode: [charsKey, outer]
            'kern-upper': ['Latin.Uppercase', null]
          , 'kern-mixed': ['Latin.Lowercase', 'Latin.Uppercase']
          , 'kern-lower': ['Latin.Lowercase', null]
      }
    ;

function _getKernChars(charGroupsData, fonts, showExtended, mode) {
    if(!(mode in _kernModesCharsConfig))
        throw new Error(`Don't know how to get chars for mode: "${mode}".`);
    const [innerCharsKey, outerCharsKey] = _kernModesCharsConfig[mode]
      , innerData = getCharsForKey(charGroupsData, fonts, innerCharsKey)
      , [innerChars, innerExtendedCharsMap] = innerData
       // FIXME: I would argue that outer should also be extended if
       // showExtended is true! But, result word count could become huge!
       // hence, some kind of pagination would be required (it is already
       // required!!!)
       // e.g. latin-mixed, extended: 27 upper * 217 lower = 5.859 pairs
       // but, all extended: ~217 upper * 217 lower = 47.089 pairs
       // we already have rendering issues with 5.859 pairs at once!
       // ALSO: if the current behavior is deemed OK, changing it to display
       // 10 times as many pairs will not be tolerable!
       // So, maybe a more flexible UI and paging/rendering only the visible
       // section could help...
      , outerData = outerCharsKey === null
            ? innerData
            : getCharsForKey(charGroupsData, fonts, outerCharsKey)
      , [outerChars, outerExtendedCharsMap] = outerData
      , outer = outerChars
      , inner = showExtended
                // OKOK flattening the extendedChars map is required!
            ? [...innerChars, ...Array.from(innerExtendedCharsMap.values()).flat()]
            : innerChars
      ;
    return [outer, inner];
}

function padModeIsKerning(padMode) {
    return padMode in _kernFormatters;
}

function _getKerningWords(charGroupsData, fonts, showExtended, padMode) {

    const [outerChars, innerChars] = _getKernChars(charGroupsData, fonts, showExtended, padMode)
      , pairs = _kernPairProductGen(outerChars, innerChars)
      , formatter = _kernFormatters[padMode]
      , words = Array.from(pairs).map(formatter)
      ;
    // Behavior from legacy code.
    // at the end of the layout we'll have a `0` it seems uneccessary!
    // Maybe there's a reason, but it's not apparent, requires
    // consultation with DB!
    words.push(0);
    return words;

}


// FIXME: this is maximally strange! the
// _formatterTests and the _autoFormatters are too distinct IMHO. but we'll
// see how to improve the readabilty!
function _getAutoContextualFormatterSpec(padMode, extendedChars) {
    const _formatterTests = {
            'isNumeric':  c=>_testCharType(extendedChars, c, /[0-9]/)
            // , 'isUppercase': = c=>_testCharType(extendedCharGroups, c, /[A-Z]/)
          , 'isLowercase': c=>_testCharType(extendedChars, c, /[a-z]/)
          , 'default': ()=>true
        }
      , definition = _autoFormatters[padMode] // auto-short, auto-long
      , result = []
      ;
    for(const [testName, format] of definition)
        result.push([_formatterTests[testName], format]);
    return result;
}


function padModeIsAutoContextual(padMode) {
    return padMode in _autoFormatters; // auto-short, auto-long
}
function _getAutoContextualWords(charGroupsData, charsData, showExtended, padMode) {
      const selectedChars = getSelectedChars(charsData, showExtended)
          // This is used to categorize the selectedChars by type
          // for the auto-formatter.
          // It's filtered, so that the keys are all in selectedChars
          // i.e. there's no grou[p that doesn't belong to a member
          // in selectedChars.
        , filteredExtendedChars = getExtendedChars(charGroupsData, selectedChars)

          // All only latin!
          // FIXME: we MUST make this extensible for other scripts.
          // How is this fixed to latin only?
          // -> the context of the chars is for short-default `HH${c}HH`
          // which likeley makes zero sense in a Arabic, Greek, Devanagri etc context.
          // unless it's required to fit the scripts together (inter),
          // which is nice, but not the primary case of this tool.
          // Rather, the case is unified spacing within a script (intra)
        , autoFormatterSpec = _getAutoContextualFormatterSpec(padMode, filteredExtendedChars)
      ;
    return Array.from(selectedChars)
        .map(c=>_formatAuto(padMode, autoFormatterSpec, c));
}

function _getCustomContextualWords(charsData, showExtended, customPad) {
    const selectedChars = getSelectedChars(charsData, showExtended);
    return Array.from(selectedChars)
        .map(c=>_formatCustom(customPad, c));
}

function _getWords(charGroupsData, fonts, showExtended, charsData, padMode, customPad) {
    if(padModeIsKerning(padMode))
        return _getKerningWords(charGroupsData, fonts, showExtended, padMode);

    if(padModeIsAutoContextual(padMode))
        return _getAutoContextualWords(charGroupsData, charsData, showExtended, padMode);

    if(padMode === 'custom')
        return _getCustomContextualWords(charsData, showExtended, customPad);

    throw new Error(`Don't know how to handle mode: "${padMode}".`);
}

// --- Cell Contents (adapted from videoproof-array.mjs _getCellContents) ---


function getSelectedChars(charsData, showExtended) {
    // Build selectedChars with extended chars support
    if(showExtended && charsData.hasExtended) {
        const selectedChars = [];
        const extendedSeen = new Set();
        for(const c of charsData.chars) {
            selectedChars.push(c);
            if(!extendedSeen.has(c) && charsData.extendedChars.has(c)) {
                for(const ec of charsData.extendedChars.get(c))
                    selectedChars.push(ec);
            }
            extendedSeen.add(c);
        }
        // => null again!
        if(charsData.extendedChars.has(null)) {
            for(const ec of charsData.extendedChars.get(null))
                selectedChars.push(ec);
        }
        return selectedChars;
    }
    return Array.from(charsData.chars);
}

function _getCellContents(charGroupsData, fonts, propertyValuesMap, previousStateKey) {
    const cellContents = {words: [], stateKey: null, changed: true};
    if(!(propertyValuesMap.has('generic/charGroup/options')))
        return cellContents;

    const fonts_ = Array.from(new Set(fonts))
      , charGroup = propertyValuesMap.get('generic/charGroup/options')
      , showExtended = propertyValuesMap.get('generic/charGroup/extended')
      , padMode = propertyValuesMap.get('generic/padMode') || 'auto-short'
      , customPad = propertyValuesMap.get('generic/customPad') || ''
      , cellsStateKeyTokens = []
      ;

    let charsData;
    if(charGroup === 'custom') {
        const customText = propertyValuesMap.get('generic/charGroup/customText') || ''
          , customSeparator = propertyValuesMap.get('generic/charGroup/customSeparator') || ''
          , chars = customSeparator !== '' ? customText.split(customSeparator) : [...customText]
          , extendedChars = getExtendedChars(charGroupsData, chars)
          ;
        charsData = { chars, extendedChars, hasExtended: extendedChars.size > 0};
        cellsStateKeyTokens.push(
                  customSeparator.length, customSeparator
                , customText.length, customText);
    }
    // else see below, not calculated here, because of stateKey check...

    const fullNames = fonts_.map(font=>font.fullName).join(';;');

    // could be more versatile, e.g. depending on pad-mode charGroup does
    // not play a role, or it does, as well as custom pad is onlu relevant
    // in padMode === custom
    cellContents.stateKey = [fullNames, charGroup
            , showExtended ? '1' : '0'
            , padMode, customPad
            , ...cellsStateKeyTokens].join(';');

    if(previousStateKey === cellContents.stateKey) {
        cellContents.changed = false;
        return cellContents;
    }

    if(charGroup !== 'custom')
        // calculated here, because if the stateKey check returns, we
        // don't need to do this!
        charsData = getCharsForSelectUI(charGroupsData, fonts_, charGroup);

    cellContents.words = _getWords(charGroupsData, fonts_, showExtended, charsData, padMode, customPad);
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
