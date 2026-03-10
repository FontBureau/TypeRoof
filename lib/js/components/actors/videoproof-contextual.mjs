/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
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

// ui-char-groups imports no longer needed directly — delegated to template engine

import {
    compileTemplate
  , resolveChars
  , resolveOuterChars
  , generateWords
  , getCharsForKey
  , BUILTIN_TEMPLATES
} from './videoproof-contextual-template.mjs';

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
            // B) for other scripts/languages other pairs will be needed.
            // Q1: should there be a separate UI for the kern-mode?
            // Q2: do we need e.g. script-specific kernFormatters?
            //     -> likely
            // Q3: how does the chart for kern-mode look, and do we need different
            //     charts? One improvement could be to show only kerning pairs
            //     that exist for the font, but this may be hard to do and to
            //     present for the user.
            'kern-upper', 'kern-mixed', 'kern-lower'
          , 'custom']
    )
  , PadModeOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PadModeModel)
  , CharGroupOptionsOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CharGroupOptionsModel)
  ;

export { CharGroupModel };
export const VideoproofContextualKeyMomentModel = _AbstractStructModel.createClass(
    'VideoproofContextualKeyMomentModel'
  , ...typographyKeyMomentModelMixin
  , ['charGroup', _AbstractStructModel.createClass(
        'VideoproofContextualCharGroupModel'
      , ['options', CharGroupOptionsOrEmptyModel]
      , ['extended', _AbstractSimpleOrEmptyModel.createClass(
            _AbstractEnumModel.createClass('BooleanModel', [true, false])
        )]
        // Only used for custom mode
      , ['customText', StringOrEmptyModel]
      , ['customSeparator', StringOrEmptyModel]
    )]
  , ['padMode', PadModeOrEmptyModel]
    // should only be displayed if padMode === custom
  , ['customPad', StringOrEmptyModel]
  //
  // OK, so here is the crux! the 'kern-upper', 'kern-mixed', 'kern-lower',
  // options are defined like this:
  // , _kernFormatters = {
  //      'kern-upper': ([o, i])=>`HO${o}${i}${o}OLA`
  //    , 'kern-mixed': ([o, i])=>`${o}${i}nnoy`
  //    , 'kern-lower': ([o, i])=>`no${o}${i}${o}ony`
  // , _kernModesCharsConfig = { // mode: [charsKey, outer]
  //         'kern-upper': ['Latin.Uppercase', null]
  //       , 'kern-mixed': ['Latin.Lowercase', 'Latin.Uppercase']
  //       , 'kern-lower': ['Latin.Lowercase', null]
  //
  // essentially, we require a second: ['charGroup', CharGroupModel]
  // or basically an CharGroupModelOrEmptyModel! which we don't do with structs...
  //
  // then, we can fully define the kerning styles as defined in _kernModesCharsConfig
  // using one or both instances of CharGroupModel.
  // the orEmpty would enable a setup like: ['Latin.Uppercase', null]
  //
  // NOTE: CharGroupModel has ['options', CharGroupOptionsOrEmptyModel]
  //
  // kern-latin-upper etc. could be  a preset
  // NOTE: the _kernFormatters should also be configurable ideally
  // we could just replace all ${o} and ${i} with the respective
  // contents.
  // the `extended` boolean would also be reused for both sided.
  // however, if outerCharGroup is not set, inner is used always
  // with the extended set to false, this is the current/legacy behavior
  // and it reduces the amount of created words by a lot.
  //
  // it would be cool to have customText and customSeparator fall back
  // to the inner charGroup equivalents, if not set, so we could inherit
  // but, probably it's not needed. Oh, so, the options selections is
  // orEmpty so it can be inherited, but I think that's ok as well,
  // as long it doesn't appear to be set by a default. It must be explicit
  // that we want to use another setting for outer than for inner.
  , ['outerCharGroup', CharGroupModel]
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

// --- Business Logic: Translation Layer (padMode → template engine) ---

// Maps legacy padMode values to built-in template specs.
// This is the bridge between the old model (PadModeModel enum) and the
// new data-driven template engine.
// The padMode enum values map directly to BUILTIN_TEMPLATES keys.
const _PAD_MODE_TO_TEMPLATE_KEY = Object.freeze({
    'auto-short':  'auto-short'
  , 'auto-long':   'auto-long'
  , 'kern-upper':  'kern-upper'
  , 'kern-mixed':  'kern-mixed'
  , 'kern-lower':  'kern-lower'
});

// Cache compiled templates (keyed by template spec identity)
const _compiledTemplateCache = new Map();

function _getCompiledTemplate(templateSpec) {
    let compiled = _compiledTemplateCache.get(templateSpec);
    if(!compiled) {
        compiled = compileTemplate(charGroupsData, templateSpec);
        _compiledTemplateCache.set(templateSpec, compiled);
    }
    return compiled;
}

// Build a custom template spec from a user-provided pad string.
// Returns a fresh spec each time (not cached by identity).
function _makeCustomTemplateSpec(customPad) {
    return {
        defaultPattern: `${customPad}$1${customPad}`
      , rules: []
    };
}

function _getCellContents(charGroupsData_, fonts, propertyValuesMap, previousStateKey) {
    const cellContents = {words: [], stateKey: null, changed: true};
    if(!(propertyValuesMap.has('generic/charGroup/options')))
        return cellContents;

    const fonts_ = Array.from(new Set(fonts))
      , charGroupOption = propertyValuesMap.get('generic/charGroup/options')
      , showExtended = propertyValuesMap.get('generic/charGroup/extended')
      , padMode = propertyValuesMap.get('generic/padMode') || 'auto-short'
      , customPad = propertyValuesMap.get('generic/customPad') || ''
      ;

    // State key for dirty checking — same mechanism as before
    const fullNames = fonts_.map(font=>font.fullName).join(';;')
      , stateKeyTokens = [fullNames, charGroupOption
            , showExtended ? '1' : '0'
            , padMode, customPad]
      ;

    if(charGroupOption === 'custom') {
        const customText = propertyValuesMap.get('generic/charGroup/customText') || ''
          , customSeparator = propertyValuesMap.get('generic/charGroup/customSeparator') || ''
          ;
        stateKeyTokens.push(customSeparator.length, customSeparator
                          , customText.length, customText);
    }

    cellContents.stateKey = stateKeyTokens.join(';');

    if(previousStateKey === cellContents.stateKey) {
        cellContents.changed = false;
        return cellContents;
    }

    // Resolve template
    const templateKey = _PAD_MODE_TO_TEMPLATE_KEY[padMode]
      , templateSpec = templateKey
            ? BUILTIN_TEMPLATES[templateKey]
            : _makeCustomTemplateSpec(customPad)
      , compiled = templateKey
            ? _getCompiledTemplate(templateSpec)
            : compileTemplate(charGroupsData_, templateSpec)
      ;

    // Resolve chars — for kerning modes, chars come from the template's
    // charConfig; for contextual/custom modes, from the charGroup UI.
    const isKerning = compiled.arity === 2;
    let innerChars, outerChars = null;

    if(isKerning) {
        const builtinSpec = templateKey ? BUILTIN_TEMPLATES[templateKey] : null
          , charConfig = builtinSpec && builtinSpec.charConfig
          ;
        if(charConfig) {
            // Kerning with charConfig: resolve chars via getCharsForKey.
            // Inner chars: base + extended flattened at end (original behavior).
            // Outer chars: base only (no extended) to keep pair count down.
            const innerData = getCharsForKey(charGroupsData_, fonts_, charConfig.innerKey)
              , [innerBaseChars, innerExtMap] = innerData
              , outerData = charConfig.outerKey
                    ? getCharsForKey(charGroupsData_, fonts_, charConfig.outerKey)
                    : innerData
              , [outerBaseChars] = outerData
              ;
            // Inner: base chars + all extended flattened at end
            innerChars = showExtended
                ? [...innerBaseChars, ...Array.from(innerExtMap.values()).flat()]
                : innerBaseChars;
            // Outer: base chars only (never extended — legacy behavior)
            outerChars = outerBaseChars;
        }
        else {
            // Fallback: use charGroup UI selection for both sides
            innerChars = resolveChars(charGroupsData_, fonts_
                                    , charGroupOption, showExtended
                                    , propertyValuesMap.get('generic/charGroup/customText') || ''
                                    , propertyValuesMap.get('generic/charGroup/customSeparator') || '');
            outerChars = resolveOuterChars(charGroupsData_, fonts_
                                         , charGroupOption
                                         , propertyValuesMap.get('generic/charGroup/customText') || ''
                                         , propertyValuesMap.get('generic/charGroup/customSeparator') || '');
        }
    }
    else {
        // Contextual (pad) mode: chars from charGroup UI selection
        innerChars = resolveChars(charGroupsData_, fonts_
                                , charGroupOption, showExtended
                                , propertyValuesMap.get('generic/charGroup/customText') || ''
                                , propertyValuesMap.get('generic/charGroup/customSeparator') || '');
    }

    cellContents.words = generateWords(compiled, innerChars, outerChars);
    // Legacy behavior: kerning words end with a trailing 0
    if(isKerning)
        cellContents.words.push(0);
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
