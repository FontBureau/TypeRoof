/* jshint esversion: 11, browser: true, module: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    zip
} from '../../util.mjs';

import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
  , StaticDependency
  // , CoherenceFunction
  , StateComparison
  , Path
} from '../../metamodel.mjs';

import {
    _BaseActorModel
  , genericActorMixin
  , initAvailableActorTypes
  , AvailableActorTypesModel
  , ActorsModel
  // , createActor
} from './actors-base.mjs';

import {
    typographyKeyMomentModelMixin
  , typographyActorMixin
  , StringOrEmptyModel
  , BooleanOrEmptyModel
} from './models.mjs';

import {
    ColorModel
} from '../color.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    fixGridLineBreaks
} from '../../affixed-line-breaks.mjs';

import {
    getPropertyValue
  , actorApplyCSSColors
  , actorApplyCssProperties
//  , DYNAMIC_MARKER
//  , cssPositioningHorizontalPropertyExpander
  , setTypographicPropertiesToSample
  , getAxesLocations
} from './properties-util.mjs';

import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';


import charGroupsData from '../../char-groups-data.mjs';

import {
    getCharGroupsKeys
  , getCharsForSelectUI
  , getExtendedChars
} from '../ui-char-groups.mjs';

export { charGroupsData };

const _charGroupsKeys = getCharGroupsKeys(charGroupsData);
export const CharGroupOptionsModel = _AbstractEnumModel.createClass(
        'CharGroupOptionsModel'
      , _charGroupsKeys
      , _charGroupsKeys[0]
        // Fix this as static to the model, so we have no confusion about
        // which charGroupsData is expected.
        // CharGroupModel.charGroupsData === charGroupsData
      , {charGroupsData: {value: charGroupsData, enumerable: true}}
    )
    , CharGroupOptionsOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CharGroupOptionsModel)
    , CharGroupModel = _AbstractStructModel.createClass(
        'CharGroupModel'
      , ['options', CharGroupOptionsOrEmptyModel]
      , ['extended', BooleanOrEmptyModel] // could be BooleanDefaultTrueOrEmptyModel
      , ['customText', StringOrEmptyModel]//StringOrEmptyModel]
      , ['customSeparator', StringOrEmptyModel]//StringOrEmptyModel]
    )
    , CellAlignmentModel = _AbstractEnumModel.createClass('CellAlignmentModel', ['left', 'center', 'right'], 'center')
    , CellAlignmentOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CellAlignmentModel)
    , VideoproofArrayKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofArrayKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      , ['charGroup', CharGroupModel]
      , ['showCellBoxes', BooleanOrEmptyModel]
      , ['cellAlignment', CellAlignmentOrEmptyModel]
      , ['stageBackgroundColor', ColorModel]
    )
  , VideoproofArrayKeyMomentsModel = _AbstractListModel.createClass('VideoproofArrayKeyMomentModel', VideoproofArrayKeyMomentModel)
  , VideoproofArrayActorModel = _BaseActorModel.createClass(
        'VideoproofArrayActorModel'
        , ...genericActorMixin
        , ['keyMoments', VideoproofArrayKeyMomentsModel]
        , ...typographyActorMixin
    )
  ;

function _getCellContents(charGroupsData, fonts, propertyValuesMap, previousStateKey) {
    // FIXME: it should maybe have a default value if there's
    // no KeyMoment, as for usability it seems odd that the
    // actor is there but it doesn't show anything. Though,
    // that is also the same case for e.g. the line-of-text actor.
    // However, that could inherit from its parent textContent.

    // Sorting here may be wrong when we honor charGroup order strictly
    // as family order will be a factor in determing char order when there
    // are confilicts. I'm not yet sure about this.

    const cellContents = {chars: [], stateKey: null, changed: true};
    if((propertyValuesMap.has('generic/charGroup/options'))) {
        const fonts_ = Array.from(new Set(fonts))
        // look at the colors, there's a good method that extracts
        // those components from a distributed complex value.
           , charGroup = propertyValuesMap.get('generic/charGroup/options')
           , showExtended = propertyValuesMap.get('generic/charGroup/extended')
           , cellsStateKeyTokens = []
           ;
        let data;
        if(charGroup === 'custom') {
            const customText = propertyValuesMap.get('generic/charGroup/customText') || ''
              , customSeparator = propertyValuesMap.get('generic/charGroup/customSeparator') || ''
                // Escaping is not really necessary, as the customSeparator
                // can be changed if there are clashes with the customText
              , chars = customSeparator !== '' ? customText.split(customSeparator) : [...customText]
              , extendedChars = getExtendedChars(charGroupsData, chars, true)
              ;

            data = { chars, extendedChars, hasExtended: extendedChars.size > 0};
            // Because this is user input and it is not escaped
            // against the cellsStateKey joining character, there
            // can be ambigous keys. I'm adding customSeparator.length
            // and customText.length as further tokens, this way
            // it is possible to restore the original data correctly
            // , as we know the structure, hence the cellsStateKey must
            // be unique.
            cellsStateKeyTokens.push(
                      customSeparator.length, customSeparator
                    , customText.length, customText);
        }
        const fullNames = fonts_.map(font=>font.fullName).join(';;');
        cellContents.stateKey = [fullNames, charGroup
                , showExtended ? '1' : '0'
                , ...cellsStateKeyTokens].join(';');
        if(previousStateKey === cellContents.stateKey) {
            cellContents.changed = false;
            return cellContents;
        }

        if(charGroup !== 'custom')
            data = getCharsForSelectUI(charGroupsData, fonts_, charGroup);

        if(showExtended && data.hasExtended) {
            const extendedSeen = new Set();
            for(const c of data.chars) {
                cellContents.chars.push(c);
                // we don't print duplicates of the extended chars,
                // but there could also be an option to skip any
                // duplicate chars. Consequently, there could also be
                // an option to keep these duplicates and repeat them.
                if(!extendedSeen.has(c) && data.extendedChars.has(c)) {
                    for(const ec of data.extendedChars.get(c)) {
                        cellContents.chars.push(ec);
                    }
                }
                extendedSeen.add(c);
            }
            if(data.extendedChars.has(null)) {
                for(const ec of data.extendedChars.get(null))
                    cellContents.chars.push(ec);
            }
        }
        else {
            for(const c of data.chars) cellContents.chars.push(c);
        }

        // Not sure about sorting this, if sorting is required at all
        // and if it is required, the collator setup is probably
        // not ideal.
        //
        // The explicitly declared charGroupsData already has an order
        // that should be preserved!
        const noSort = new Set(['all-groups', 'custom'])
         , sort = false && !noSort.has(charGroup)
         ;
        if(sort) {
            const col = new Intl.Collator(new Intl.Locale("en-US"), {
                sensitivity: 'variant'
              , numeric: true
              , caseFirst: 'upper'
            });
            cellContents.chars.sort((a,b)=>col.compare(a, b));
        }
    }
    return cellContents;
}

export class VideoproofArrayActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="actor_renderer-videoproof_array fixed-line-breaks">(content not initialized)</div>`;
    // jshint ignore:end
    constructor(widgetBus, charGroupsData) {
        super(widgetBus);
        // This is attached to the ModelType, so we don't have to hard
        // code it in here. This way a different VideoproofArrayActorModel
        // can be used with this same UIElement.
        // See also: UISelectCharGroupInput.
        this._charGroupsData = charGroupsData;
        this._cellsStateKey = null;
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        // ? element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element];
    }

    _updateCells(font, chars) {
        const cells = [];
        for(const char of chars) {
            const cell = this._domTool.createElement('span');
            cell.textContent = char;
            cells.push(cell);
        }
        this.element.replaceChildren(...cells);
        // FIXME: seen this fail when the actor was in a layer with
        // zero width (set explicitly):
        //      TypeError: child is undefined
        //      _fixGridLineBreaks ./lib/js/affixed-line-breaks.mjs:253
        // Maybe a try-catch to safeguard? No width is a case where we
        // don't really require any behavior, but maybe fixGridLineBreaks
        // could still handle the case more gracefully. This is also a
        // good example, how generic actors may need better general
        // error handling.
        fixGridLineBreaks(font, this.element);
    }

    update(changedMap) {
        // console.log(`${this}.update changedMap:`, ...changedMap);
        const propertiesData = [
        //        [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', cssPositioningHorizontalPropertyExpander, 'px']
        //    , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
        //    , ['numericProperties/width', 'width', 'px']
        //    , ['numericProperties/height', (element, value, propertiesValueMap, getDefault, useUnit)=>{
        //            let value_;
        //            if(value == '') {
        //                const [, heightTreatment] =_getPropertyValue(
        //                                    propertiesValueMap, getDefault
        //                                    , 'generic/heightTreatment');
        //                // FIXME: in this case, if positioningVertical is not
        //                // set explicitly, it should default to bottom.
        //                value_ =  heightTreatment === 'baselineToBottomFix'
        //                    ? 'calc(1em * var(--ascender) / var(--units-per-em))'
        //                    : ''
        //                    ;
        //            }
        //            else
        //                value_ = value;
        //            element.style.setProperty('height', `${value_}${useUnit ? 'px' : ''}`);
        //        }]
        //    , ['numericProperties/height', 'height', 'px']
                // Doubling height as line-heigth, only makes (partially)
                // sense because this is indeed just a single line of text.
            // , ['numericProperties/height', 'line-height', 'px']
            ['numericProperties/z-index', 'z-index', '',  Math.round]
        //    , ['generic/textAlign', 'text-align', '']
        //    , ['generic/direction', 'direction', '']
        ];

        // if(changedMap.has('font')) {
        //     // This also triggers when font changes in a parent trickle
        //     // down, so these properties should always be set correctly.
        //     const font = changedMap.get('font').value;
        //     this.element.style.setProperty('font-family', `"${font.fullName}"`);
        //     this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
        //     this.element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
        //     this.element.style.setProperty('--descender', `${font.fontObject.descender}`);
        // }

        const font = (changedMap.has('font')
                        ? changedMap.get('font')
                        : this.getEntry('font')).value
          ;
        if(changedMap.has('font')) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
            // The font.fullName can stay the same and the font still changed
            // as we grew the capability to replace a font.
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
        //      // , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
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
                if(cellContents.chars.length)
                    this._updateCells(font, cellContents.chars);
                else
                    this._domTool.clear(this.element);
            }

            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
            setTypographicPropertiesToSample(this.element, propertyValuesMap, true);
        }
    }
}

      // At first this seems to be similar to TypeSettingKeyMomentsModel,
      // however, especially "textRun" is not used here, as we aquire the
      // content from parent and via a different mechanism. E.g. all cells
      // at #2 will get cellcontent #2. similarly, leaving out positioning
      // info for now, as a central control via parent may be better.
      // Thus, for the moment this is identical to TypographyKeyMomentModel.
export const VideoproofArrayV2CellKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofArrayV2CellKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      , ['showCellBoxes', BooleanOrEmptyModel]
      // , ['textRun', StringOrEmptyModel]
      // , ['textAlign', TextAlignmentOrEmptyModel]
      // , ['positioningHorizontal', CSSPositioningHorizontalOrEmptyModel]
      // , ['positioningVertical', CSSPositioningVerticalOrEmptyModel]
      // , ['direction', CSSDirectionOrEmptyModel]
      // , ['heightTreatment', HeightTreatmentOrEmptyModel]
    )
  , VideoproofArrayV2CellKeyMomentsModel = _AbstractListModel.createClass('VideoproofArrayV2CellKeyMomentModel', VideoproofArrayV2CellKeyMomentModel)
  , VideoproofArrayV2CellActorModel = _BaseActorModel.createClass(
      'VideoproofArrayV2CellActorModel'
      , ...genericActorMixin
      , ...typographyActorMixin
      , ['keyMoments', VideoproofArrayV2CellKeyMomentsModel]
    )
  , [/*referencableActorTypes*/, videoproofArrayActorTypes] = initAvailableActorTypes([
    ['VideoproofArrayV2CellActorModel', 'Videoproof Array Cell', VideoproofArrayV2CellActorModel]
]);

export const VideoproofArrayV2ActorModel = _BaseActorModel.createClass(
    'VideoproofArrayV2ActorModel'
  , ...genericActorMixin
      // TODO: only stuff allowed in VideoproofArrayV2ActorRenderer
      //       which is probably just one very specialized cell-type so far
      //       in that case, we could simplify the actors structure,
      //       but the hope is, that we can build on the existing logic
      //       by using the established structure. Also, makes it better
      //       extendable, i.e. add another cell-level actor type...
    , ... StaticDependency.createWithInternalizedDependency(
        'availableActorTypes'
      , AvailableActorTypesModel
      , videoproofArrayActorTypes
    )
  , ['keyMoments', VideoproofArrayKeyMomentsModel] // LayerActorModel: ['keyMoments', TypeSettingKeyMomentsModel]
  , ...typographyActorMixin
    // ActorModel has an InternalizedDependency to availableActorTypes
    // I believe we can use the original ActorModel if we put the StaticDependency
    // availableActorTypes === videoproofArrayActorTypes into this model.
  , ['activeActors', ActorsModel]
);

export class VideoproofArrayV2CellActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="actor_renderer-videoproof_array_v2-cell">[?]</div>`;
    // jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return [element];
    }

    update(changedMap) {
        if(changedMap.has('cellContent@')){
            this.element.textContent = changedMap.get('cellContent@').data;
        }

        const propertiesData = [
        //       [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', cssPositioningHorizontalPropertyExpander, 'px']
        //    , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
        //    , ['numericProperties/width', 'width', 'px']
        //    , ['numericProperties/height', (element, value, propertiesValueMap, getDefault, useUnit)=>{
        //            let value_;
        //            if(value == '') {
        //                const [, heightTreatment] =_getPropertyValue(
        //                                    propertiesValueMap, getDefault
        //                                    , 'generic/heightTreatment');
        //                // FIXME: in this case, if positioningVertical is not
        //                // set explicitly, it should default to bottom.
        //                value_ =  heightTreatment === 'baselineToBottomFix'
        //                    ? 'calc(1em * var(--ascender) / var(--units-per-em))'
        //                    : ''
        //                    ;
        //            }
        //            else
        //                value_ = value;
        //            element.style.setProperty('height', `${value_}${useUnit ? 'px' : ''}`);
        //        }]
        //    , ['numericProperties/height', 'height', 'px']
                // Doubling height as line-heigth, only makes (partially)
                // sense because this is indeed just a single line of text.
            // , ['numericProperties/height', 'line-height', 'px']
            ['numericProperties/z-index', 'z-index', '',  Math.round]
        //    , ['generic/textAlign', 'text-align', '']
        //    , ['generic/direction', 'direction', '']
          , ['generic/showCellBoxes', 'outline', '', (val)=>val === true ? '1px solid' : '']
        ];

        // if(changedMap.has('font')) {
        //     // This also triggers when font changes in a parent trickle
        //     // down, so these properties should always be set correctly.
        //     const font = changedMap.get('font').value;
        //     this.element.style.setProperty('font-family', `"${font.fullName}"`);
        //     this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
        //     this.element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
        //     this.element.style.setProperty('--descender', `${font.fontObject.descender}`);
        // }

        const index =this.widgetBus.rootPath.parts.at(-2);
        this.element.style.setProperty('--descender-em', `var(--descender-em-${index})`);
        this.element.style.setProperty('--ascender-em', `var(--ascender-em-${index})`);

        if(changedMap.has('font')) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}", AdobeBlank`);
            this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
        }


        // FIXME: it doesn't look like globalT is ever coming through here,
        // why did I use it in the first place? Is it bad that it doesn't
        // appear here or is it unneeded to use it here? animationProperties@
        // seems to be responding to changes of globalT.
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

            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
            setTypographicPropertiesToSample(this.element, propertyValuesMap, true);
        }
    }
}

// Started as a copy from:
//      from https://github.com/aliftype/rana-kufi/blob/99f9ba560e3c4a6d858d2b9d2c807466fb975c49/docs/app/HarfBuzz.js#L49
// However: that has an incompatible license, I'm not fully convinced of
// the API and I'm trying to figure out whether to use malloc or stackAlloc.
// malloc vs stackAlloc
//    - I don't understand all the implications.
//    - If I'd use mallock/free how would this have to look?
//          I think the below version should work, but I get
//          an Error, after some iterations in _getExtents:
//                Chrome: hb.wasm:0xb81d Uncaught (in promise) RuntimeError: null function or function signature mismatch
//                Firefox: Uncaught (in promise) RuntimeError: indirect call to null
//      It looks like Pointer32Malloc(hb, 4) works while Pointer32Malloc(hb, 3) raises!
//      I still don't understand but it's good to see it working.
//    - stackAlloc seems nicer, as it requires no free, what are the
//      downsides?
//      CAUTION: use stackSave/stackRestore to not a create memory leak
//      Pointer32StackAlloc(hb, 3) works
// in _getExtents used to be new Pointer(12 * 4) which
// is equivalent to Pointer32StackAlloc(12) now.
// But hb_font_extents_t only has 3 items of
// hb_position_t: typedef int32_t hb_position_t;
// typedef struct {
//   hb_position_t ascender;
//   hb_position_t descender;
//   hb_position_t line_gap;
// } hb_font_extents_t;
// So my guess is there was just a Pointer(12) then the plan
// was to  convert it to Pointer(3 * 4), i.e. 3 items of
// length 4 bytes, but mistakenly it ended as (12 * 4).
// And indeed 3 * 4 works (only with stackAlloc, malloc requires mor space...
//
// testing get h metrics ...
// the malloc version is a bit problematic, creates crazy errors!
// Oh, but with 12 bytes length it appears to be working!
// And now, without any clue, 4 bytes length works as well
// with malloc. :-/
// Not true, 4 raises in Firefox, but on hbFont.destroy();
// Uncaught (in promise) RuntimeError: index out of bounds
// Seems to be working in chrome though.
// 6 seems to be working in Firefox. but When I add a third
// font it fails again...
// 7, three fonts: Uncaught (in promise) RuntimeError: index out of bounds
// 8 with three and 4 fonts fonts works again
export class Pointer32Malloc {
    constructor(harfbuzz, arg) {
        const M = this.M = harfbuzz.Module;
        this.length = arg;
        // ptr is a byte address, M.HEAP32 and M.HEAPU32 have a byteLenght
        // Int32Array.BYTES_PER_ELEMENT === 4; 32 / 8 === 4
        this.ptr = M.wasmExports.malloc(4 * this.length);
    }
    get int32Array() {
        const start = this.ptr / 4;
        return this.M.HEAP32.slice(start, start + this.length);
    }
    get int32()      { return this.M.HEAP32[this.ptr / 4]; }
    get uint32()     { return this.M.HEAPU32[this.ptr / 4]; }
    free() {
        this.M.wasmExports.free(this.ptr);
    }
}

/**
 * // CAUTION: use stackSave/stackRestore to not a create memory leak
 */
export class Pointer32StackAlloc {
    constructor(harfbuzz, arg) {
        const M = this.M = harfbuzz.Module;
        this.length = arg;
        // ptr is a byte address, M.HEAP32 and M.HEAPU32 have a byteLenght
        // Int32Array.BYTES_PER_ELEMENT === 4; 32 / 8 === 4
        this.ptr = M.stackAlloc(4 * this.length);
    }
    get int32Array() {
        const start = this.ptr / 4;
        return this.M.HEAP32.slice(start, start + this.length);
    }
    get int32()      { return this.M.HEAP32[this.ptr / 4]; }
    get uint32()     { return this.M.HEAPU32[this.ptr / 4]; }
}

/**
 * Actually, this behaves partially like a container and partially
 * like a component.
 *      The children are cells.
 *      Per cell content a cell with cell items is created.
 *      Cell items are layered "activeActors"
 *      actually, these active actors should render themselves into
 *      N cells maybe, on update.
 *      So, in here, I create a list of empty cells, and pass these
 *      along with the cell content (string) for each cell to each child
 *      actor.
 *      The actor renders/updates itself into each cell...
 *
 *      ...
 *      after the actors are rendered, we need to figure out the
 *      widest cell.
 *
 * FIXME: So far this defines initialUpdate and _provisionWidgets and thus
 * it could extend _CommonContainerComponent directly, as _BaseContainerComponent
 * also only defines those methods.
 */
export class VideoproofArrayV2ActorRenderer extends _BaseContainerComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="actor_renderer-videoproof_array_v2"></div>`;
    // jshint ignore:end
    constructor(widgetBus, _zones, charGroupsData) {
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('cellContent@', {treatAdressAsRootPath: false}));
        const zones = new Map([..._zones]); // becomes this._zones
        super(widgetBus, zones);
        this._uniqueSeenFonts = new WeakSet();
        this._cellsStateKey = null;
        this._ownChangedMapCache = null;
        this._cellWidths = null;// set in initial update

        // This is attached to the ModelType, so we don't have to hard
        // code it in here. This way a different VideoproofArrayActorModel
        // can be used with this same UIElement.
        // See also: UISelectCharGroupInput.
        this._charGroupsData = charGroupsData;
        this._cellsStateKey = null; // to detect changed contents
        this.cells = [];
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        // ? element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element];
    }

    _createWrapper(settings, dependencyMappings) {
        // look at ActorRendererContainer ...!!!
        // especially for creating/linking animationProperties@
        const childWidgetBus = this._childrenWidgetBus
          , Constructor = VideoproofArrayV2CellActorRenderer
          , args = []
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _updateCells(contents) {
        const cellContentProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@')
          , newCells = new Set()
          ;
        for(const [index, cellContent] of contents.entries()) {
            const contentId = cellContentProtocolHandler.getId(index);
            if(this.cells[index] === undefined) {
                const container = this._domTool.createElement('div', {
                    'class': `actor_renderer-videoproof_array_v2-zone `
                           + `actor_renderer-videoproof_array_v2-zone_${index}`})
                  , unregister = cellContentProtocolHandler.register(contentId, {data: undefined})
                  ;
                this.cells[index] = { contentId, unregister, cellActors: [] };
                this.element.append(container);
                newCells.add(contentId);
                this._zones.set(contentId, container);
            }
            const component = cellContentProtocolHandler.getRegistered(contentId);
            if(component.data !== cellContent) {
                component.data = cellContent;
                cellContentProtocolHandler.setUpdated(contentId);
            }
        }
        return newCells;
    }

    /*
     * This would run very often and for each cell on each update, but
     * if it is not required to change the cell structure, we should avoid
     * it. New cells will have to run this regardless, but existing cells
     * should only run it if change is required. The test, whether change
     * is required can be made for one not new cell and be applied to all.
     * This is implemented in _provisionWidgets, testing the first cell.
     */
    _updateCellWidgets(activeActors, cell) {
        const {contentId, cellActors} = cell
          , currentCellActors = []
          , newCellWidgets = []
          , deletedCellWidgets = []
          ;
        // OK, doing this with just activeActors won't tell us about
        // the DELETE case.
        for(let length=activeActors.size, index=0; index<length; index++) {
            const actor = activeActors.get(index)
              , cellActor = index < cellActors.length
                    ? cellActors[index]
                    // this means the actor is new
                    : [null, null]
              , [cellActorTypeKey, cellActorWidgetWrapper] = cellActor
              , actorIsNew = cellActorTypeKey === null
              , actorTypeKey = actor.get('actorTypeKey').value
                // Actor-type changed implies another widget-type, but that's
                // just an assumption, there could as well be a widget-type
                // that applies for different actor types and just updates
                // itself accordingly. It's also a stub, as currently in this
                // case there are no different actor types.
                // It could add a bit of flexibility to use the actual
                // widget-type for comparison rather than the actorTypeKey.
              , requireNewWidget = !actorIsNew && cellActorTypeKey !== actorTypeKey
              ;
            if(requireNewWidget)
                // typeChanged => delete, then add
                deletedCellWidgets.push(cellActorWidgetWrapper);
            if(actorIsNew || requireNewWidget) {
                const widgetWrapper = this._createWrapper({
                        rootPath: Path.fromParts('.', 'activeActors',`${index}`, 'instance')
                      , zone: contentId/* ! */
                    }
                  , [
                        [contentId, 'cellContent@']
                      , 'animationProperties@'
                      , 'font'
                    ]
                );
                this._createWidget(widgetWrapper);
                currentCellActors.push([actorTypeKey, widgetWrapper]);
                newCellWidgets.push(widgetWrapper);
            }
            else { // EQUALS || CHANGED
                currentCellActors.push(cellActor);
                // maintain order
                // FIXME: we should really try to avoid this
                cellActorWidgetWrapper.reinsert();
            }
        }
        return [currentCellActors, newCellWidgets, deletedCellWidgets];
    }

    _provisionWidgets(compareResult) {
        // calculate own changedMap rather than for a child.
        const changedMap = this.getChangedMap(compareResult);
        // FIXME: should rather work without this.widgetBus.rootPath
        // but I can't register "activeActors" directly as dependency in
        // getActorWidgetSetup and I don't currently understand why.
        const activeActors = this.getEntry(this.widgetBus.rootPath.append('activeActors'));

        // somewhere (in update) we need to set cellContent(index, value)
        // and that shout propagate down to the widgets as change
        const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              ;
        // font: is rather a per actor afair
        // "fonts" would be better
        // can be a set, i.e. no dupe. though _getCellContents could
        // handle that
        // depending on the settings, we need to provide for the following
        // cases:
        //      - use just one font
        //      - use any amount on fonts, one, two, ..., all
        //      - choose which fonts to use
        //      - make a subset
        //      - make a superset
        //      -> what are the set operations
        //      -> how to select which fonts to use for those operations?
        //      -> what would be a full featured font selection and how does
        //         a simplified UI look like
        //      -> should this change per keyMoment or rather just per
        //         instance
        //      -> will moving actors change the slection of fonts to
        //         get the charset?
        //
        // Hmm, much simpler, just get all fonts and user the superset of
        // all chars as the base for this.
        // how to get all fonts then? ...
        // It's interesting, because the actors are not created yet.
        const uniqueFonts = new Set()
        for(const index of activeActors.keys()) {
            const path = Path.fromParts(...this.widgetBus.rootPath.parts, 'activeActors',`${index}`, 'instance', 'font')
              , font = this.getEntry(path).value
              ;
            uniqueFonts.add(font);
            if(!this._uniqueSeenFonts.has(font)) {
                this._uniqueSeenFonts.add(font);
                // The font.fullName can stay the same and the font still changed
                // as we grew the capability to replace a font.
                // If the font was never seen  this._cellsStateKey can
                // be invalidated, as if it contains the key the cache
                // is outdated and if it does not contain the key it
                // is outdated anyway.
                this._cellsStateKey = null;
            }
        }

        const cellContents = _getCellContents(this._charGroupsData, uniqueFonts, propertyValuesMap, this._cellsStateKey);
        let newCells = new Set()
          , deletedWidgets = []
          ;

         const _getSecondComponents = array=>array.length ? Array.from(zip(...array))[1] : []

        if(cellContents.changed) {
            this._cellsStateKey = cellContents.stateKey;
            const contents = cellContents.chars;
            newCells = this._updateCells(contents)

                // cleanup cell level
            const removedCells = this.cells.splice(contents.length);
            for(const {contentId, unregister, cellActors} of removedCells) {
                const container = this._zones.get(contentId);
                container.remove();
                this._zones.delete(contentId);
                unregister(); // cellContentProtocolHandler._unregister(contentId)
                deletedWidgets.push(..._getSecondComponents(cellActors));
            }
        }

        // compile this from changed actors information
        const requiresFullInitialUpdate = []
            // Depending on the actors diff we can make a fixed function to
            // update existing cells/actors
            // New cells require all new actors anyways.
            // Deleted cells should delete actors as well. -> that is happening already
          , currentWidgets = []
          ;
        // If there's no update in one "legacy" cell, there's no update
        // in any "legacy" cell. Since cells can be hundreds, if not
        // thousands, this is a worthwhile optimization.
        let updateLegacyCells = null;
        for(const cell of this.cells) {
            const isNewCell = newCells.has(cell.contentId);
            if(updateLegacyCells !== false || isNewCell) {
                const [currentCellActors, newCellWidgets, deletedCellWidgets] = this._updateCellWidgets(activeActors, cell);
                deletedWidgets.push(...deletedCellWidgets);
                // Only remove currentCellActors.length as there may be
                // other trailing cellActors when activeActors.length
                // got less, these will be removed in the clean up case
                // below.
                cell.cellActors.splice(0, currentCellActors.length,...currentCellActors);
                requiresFullInitialUpdate.push(...newCellWidgets);
                if(updateLegacyCells === null && !isNewCell) {
                    // This is the first "legacy" cell, if it didn't
                    // have any updates/deletes, we can skip updating
                    // for the other "legacy" cells.
                    updateLegacyCells = newCellWidgets.length !== 0 || deletedCellWidgets.length !== 0;
                }
            }
            currentWidgets.push(..._getSecondComponents(cell.cellActors));
            // Clean up the "rest" when there are now less activeActors
            // active than before.
            // assert activeActors.size === currentCellActors.length
            if(cell.cellActors.length > activeActors.size )
                deletedWidgets.push(..._getSecondComponents(
                            cell.cellActors.splice(activeActors.size )));
        }

        for(const widgetWrapper of deletedWidgets)
            this._destroyWidget(widgetWrapper);
        this._widgets.splice(0, Infinity, ...currentWidgets);
        return new Set(requiresFullInitialUpdate);
    }

    /**
     * This started from https://github.com/harfbuzz/harfbuzzjs/blob/main/examples/hbjs.example.js
     * I'll keep it for now to help with debugging when required.
     */
    _hbShapeExample(hb, fontBlob, text, variations, features) {
        var blob = hb.createBlob(fontBlob);
        var face = hb.createFace(blob, 0);
        console.log('face.getAxisInfos:', face.getAxisInfos());
        console.log('face', face);
        console.log('face.upem', face.upem);

        var font = hb.createFont(face);
        font.setVariations(variations);
        // scale = face.upem * window.devicePixelRatio > ? as done by aliftype/rana-kufi
        font.setScale(1000, 1000); // Optional, if not given will be in font upem

        var buffer = hb.createBuffer();
        buffer.addText(text || 'abc');
        buffer.guessSegmentProperties();
        // buffer.setDirection('ltr'); // optional as can be set by guessSegmentProperties also

        hb.shape(font, buffer, features);
        const shape = buffer.json(font);

        // returns glyphs paths, totally optional
        const glyphs = {};
        for(const x of shape) {
            if (glyphs[x.g])
                continue;
            glyphs[x.g] = {
                name: font.glyphName(x.g),
                path: font.glyphToPath(x.g),
            };
        }

        buffer.destroy();
        font.destroy();
        face.destroy();
        blob.destroy();
        return { shape, glyphs };
    }

    // This is not a production function, it is howevwer, so far a local
    // example how to produce and use the results of hbjs.shape. Will
    // get deleted again at some point.
    _hbDebugDumpSVG(font, text='Typefish') {
        const variations = { wdth: 75, wght: 100, opsz: 144 }
          // , features = {liga: 0, c2sc: 1} // font-feature-settings: "liga" 0, "c2sc";
          // See: https://harfbuzz.github.io/harfbuzz-hb-common.html#hb-feature-from-string
          // Turn feature on: "kern", "+kern", "kern=1", "kern[]", "kern[:]"
          // Turn feature on, partial: "kern[5:]", kern[:5], kern[3:5],
          // Turn feature off: "-kern", "kern=0"
          // Choose 2nd alternate: "aalt=2"
          // , features = 'c2sc,-liga'
          // CSS font-feature-settings are also accepted
          // , features = '"liga" 0, "kern" 1' // , "c2sc"'
          , features = '+liga   '//,kern'
          , example = this._hbShapeExample(this.widgetBus.harfbuzz, font.buffer, text, variations, features)
          ;
        console.log(`${this}._hbDebugDumpSVG`
                , '\nfont:', font.fullName, font
                , '\nexample:', example
                , '\n origin', font.origin
        );

        const unique = this._unique === undefined
                ? 1
                : this._unique + 1
                ;
        this._unique = unique;
        const SVGNS = 'http://www.w3.org/2000/svg'
          , svg = this._domTool.createFragmentFromHTML(`<svg
                viewBox="0 -300 10000 1000"
                transform="scale(1,-1), translate(0, 0)"
                style="overflow:visible"
                xmlns="${SVGNS}"></svg>`
                ).firstElementChild
            , seen = new Set()
            ;
        let advanceX = 0;
        for(const item of example.shape) {
            const glyphId = item.g
              , svgGlyphId = `glyph-${glyphId}-u${unique}`
              ;
            if(!seen.has(glyphId)) {
                seen.add(glyphId);
                const glyph = this._domTool.document.createElementNS(SVGNS, 'path')
                  , glyphSymbol = this._domTool.document.createElementNS(SVGNS, 'symbol')
                  ;
                glyphSymbol.id = svgGlyphId;
                glyph.style = 'fill:black;stroke:lime;stroke-width:1;overflow:visible';
                glyph.setAttribute('d', example.glyphs[glyphId].path);
                glyphSymbol.append(glyph);
                glyphSymbol.style = 'overflow:visible;'
                svg.append(glyphSymbol);
            }
            // <use href="#myDot" x="5" y="5" style="opacity:1.0" />
            const useGlyph = this._domTool.document.createElementNS(SVGNS, 'use');
            useGlyph.setAttribute('href', `#${svgGlyphId}`);
            useGlyph.setAttribute('x', advanceX)
            advanceX += item.ax
            svg.append(useGlyph);
        }
        const advanceXMark = this._domTool.document.createElementNS(SVGNS, 'line')
        advanceXMark.setAttribute('x1', advanceX)
        advanceXMark.setAttribute('y1', 0)
        advanceXMark.setAttribute('x2', advanceX)
        advanceXMark.setAttribute('y2', 2000)
        advanceXMark.setAttribute('stroke', 'red');
        svg.append(advanceXMark);
        document.body.append(svg);
    }

    _getAdvance(shaped) {
        let advanceX = 0;
        for(const item of shaped)
            advanceX += item.ax
        return {x: advanceX}
    }

    /**
     * FIXME:
     * This uses x-advances so far but that is not fully sufficient as there
     * are e.g. zero width glyphs that still occupy space when drawn
     * or glyphs that are rendered in the negative x and above the x-advance.
     * If, in the selection, there are only these kinds of glyphs, the cells
     * won't have sufficient space.
     * An "ink-box" should help with those glyphs, however, ink in the
     * negative-x would also require a transformation to move the glyph
     * into the box.
     *
     * # hb_font_get_glyph_extents:
     *      https://harfbuzz.github.io/harfbuzz-hb-font.html#hb-font-get-glyph-extents
     * Here's some calculation of an ink box https://github.com/HinTak/harfbuzz-python-demos/blob/master/hb-view.py
     * seems like harfbuzz font_get_glyph_extents is important for that
     * calculation, but that is not yet in hbjs.
     * NOTE that aliftype/rana-kufi exports _hb_font_get_glyph_extents
     * and uses it here:
     *      https://github.com/aliftype/rana-kufi/blob/99f9ba560e3c4a6d858d2b9d2c807466fb975c49/docs/app/HarfBuzz.js#L84
     *
     */
    _getCellsWidths() {
        if(!this.cells.length)
            return [];

        const cellContentProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@')
          , firstCell = this.cells[0]
            // => harfbuzz face should be cached as long as it is used and
            // be destroyed only when not used anymore
            // could be widget local for the moment, but could be in the
            // font model as well.
          , advancesXInEM = {}
          , harfbuzz = this.widgetBus.harfbuzz.hbjs
          ;
        for(const [actorIndex, [/*type*/, cellActor]] of firstCell.cellActors.entries()) {
            const font = cellActor.widgetBus.getEntry('font').value
              // , fontName = font.fullName

                // FIXME: For RobotoFlex this setup is indeed the widest
                // location, but for AmstelVar opsz: 8 (min) is wider!
              , variations = { wdth: 151, wght: 1000, opsz: 144 }
              , features = '+liga' // TODO
              , hbFace = font.hbFace
              ;

            const hbFont = harfbuzz.createFont(hbFace); // TODO: maybe keep centrally, seems cheap though
            hbFont.setVariations(variations);
            // Optional, if not given will be in font upem
            // but I want this to be explicit.
            hbFont.setScale(hbFace.upem, hbFace.upem);
            for(const { contentId /*, unregister, cellActors*/}
                                            of this.cells.values()) {
                const cellContent = cellContentProtocolHandler.getRegistered(contentId).data
                  ,  hbBuffer = harfbuzz.createBuffer()
                  ;
                hbBuffer.addText(cellContent);
                // this._hbDebugDumpSVG(font, cellContent);
                hbBuffer.guessSegmentProperties();
                // hbBuffer.setDirection('ltr'); // optional as can be set by guessSegmentProperties also
                harfbuzz.shape(hbFont, hbBuffer, features);
                const shaped = hbBuffer.json(font);
                if(!(contentId in advancesXInEM))
                    advancesXInEM[contentId] = [];
                // to EM: em = hbShapedValue/face.upem
                advancesXInEM[contentId][actorIndex] = this._getAdvance(shaped).x !== 0
                            ? this._getAdvance(shaped).x / hbFace.upem
                            : 0
                            ;
                hbBuffer.destroy();
            }
            hbFont.destroy();
        }

        let maxWidthEM = 0;
        const cellsMaxWidthsInEM  = {};
        for(const [contentId, actorWidhts] of Object.entries(advancesXInEM)) {
            const cellMax = Math.max(...actorWidhts);
            cellsMaxWidthsInEM[contentId] = cellMax;
            maxWidthEM = Math.max(maxWidthEM, cellMax);
        }
        return [advancesXInEM, cellsMaxWidthsInEM, maxWidthEM];
    }

    _getMinMaxExtents(extents) {
        let maxDescenderEm = 0
          , minDescenderEm = Infinity
          , maxAscenderEm = 0
          , minAscenderEm = Infinity
          ;
        for(const {ascender, descender, upem} of extents) {
            const descenderEm = descender / upem
              , ascenderEm = ascender / upem
              ;
            if(descenderEm < minDescenderEm)
                minDescenderEm = descenderEm;
            if(descenderEm > maxDescenderEm)
                maxDescenderEm = descenderEm;

            if(ascenderEm < minAscenderEm)
                minAscenderEm = ascenderEm;
            if(ascenderEm > maxAscenderEm)
                maxAscenderEm = ascenderEm;
        }

        return [
            ['--min-descender-em', minDescenderEm]
          , ['--max-descender-em', maxDescenderEm]
          , ['--min-ascender-em', minAscenderEm]
          , ['--max-ascender-em', maxAscenderEm]
        ];
    }

    /**
     * These can and will vary depending on the font variations.
     *
     * The scender/descender can change with variations, to align
     * the comparision fonts at the baseline, it's required to get
     * the extent for the current variations location.
     * The current variations location changes per animation frame, hence
     * very often, so it is good if this operation is cheap.
     *
     * In CSS it's possible to automatically align two consecutive
     * inline/flex elements vertically at the baseline. However we want
     * to also position the elements on top of each other. That requires
     * then moving the consecutive elements explicitly horizontally, to
     * the left, loosing automatic capabilities. That movement requires
     * knowlege of the width of each element, especially for centering.
     * Calculating the width is depending on the variariation, but, also
     * on the actual cell content. Hence, if we go with width adjsutment,
     * we need to calculate the width of each cell actor on each iteration.
     * This can be done with element.getBoundingClientRect(), but that
     * doesn't make it free, to the contrary, the slow down is enormous.
     *
     * The alternative is to have the browser do the horizontal alignment
     * automatically and adjust the vertical positioning. This is much
     * cheaper for us, because the height metrics are the same for each
     * cell of a layer, so we can calculate it once and apply it to all
     * cells. But for that calculation, harfbuzz is required, as we don't
     * get these numbers from the browser AFAIK.
     */
    _getExtents() {
        const firstCell = this.cells[0]
          , result = []
          ;
         if(!firstCell)
            return result;
        const harfbuzz = this.widgetBus.harfbuzz.hbjs
          , Module = this.widgetBus.harfbuzz.Module
          , globalT = this.getEntry('globalT').value
          , stack = Module.stackSave()
          ;

        for(const [actorIndex, [/*type*/, cellActor]] of firstCell.cellActors.entries()) {
            const font = cellActor.widgetBus.getEntry('font').value
              , animationProperties = cellActor.widgetBus.getEntry('animationProperties@')
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , variations = getAxesLocations(propertyValuesMap)
              , hbFace = font.hbFace
              , hbFont = harfbuzz.createFont(hbFace)// ; // TODO: maybe keep centrally, seems cheap though
            hbFont.setVariations(variations);
            // See the discussion at Pointer32Malloc...
            // const extentsPtr = new Pointer32Malloc(this.widgetBus.harfbuzz, 8);
            //
            // The StackAlloc version runs without issues and a byte length
            // of 3 with any amount of fonts.
            const extentsPtr = new Pointer32StackAlloc(this.widgetBus.harfbuzz, 3);

            Module._hb_font_get_h_extents(hbFont.ptr, extentsPtr.ptr);
            const extents = extentsPtr.int32Array
              , [ascender, descender , lineGap] = extents
              ;

            result[actorIndex] = {ascender, descender: Math.abs(descender), lineGap, upem: hbFace.upem};
            extentsPtr.free && extentsPtr.free();
            hbFont.destroy();
        }

        Module.stackRestore(stack);
        return result;
    }

    _getGridFontSize(availableWidthPt, avaialableHeightPt
                  , minFontSizePt, maxFontSizePt
                  , cellWidthEm, gapWidthEm, lineHeightEm
                  , cellsAmount
                  ) {
        // The aim of the auto font-size excersize is to place all
        // cells on screen without scrolling at the biggest possible
        // fontSize that is lower or equal to maxFontSize.
        //
        // Knowing the line height and vertical space will give an upper
        // limit of lines at minFontSize that can be fitted.
        // If there are more lines required at minFontSize, we go
        // with minFontSize and accept scrolling or paging.
        //
        // Let em be min-font-size
        // availableHeightEm = avaialableHeightPt / minFontSizePt
        // floor(availableHeightEm / lineHeightEm) -> max amount of lines
        const maxLinesAtMinFontSize = Math.floor(avaialableHeightPt / minFontSizePt * lineHeightEm)
          , minLineWidthEm = availableWidthPt/minFontSizePt
        // From that number calculate how many items fit a line/row.
        // Let n be the amout of items per line, there's always one
        // gap less than items in a row:
        //      lineWidthEm = n * cellWidthEm + (n-1) * gapWidthEm
        //      lineWidthEm = n * (cellWidthEm + gapWidthEm) - gapWidthEm
        //      lineWidthEm + gapWidthEm = n * (cellWidthEm + gapWidthEm)
        //      (lineWidthEm + gapWidth) / (cellWidthEm + gapWidthEm) = n
        //      n = (lineWidthEm + gapWidth) / (cellWidthEm + gapWidthEm)
          , itemsPerLineAtMinFontSize = Math.floor((minLineWidthEm + gapWidthEm) / (cellWidthEm + gapWidthEm))
        // Then calculate how many items fit on a page at min-font-size
          , requiredLinesAtMinFonSize = Math.ceil(cellsAmount/itemsPerLineAtMinFontSize)
        // If there are more items than the fitting amount, we go with
        // min-font-size and it will overflow.
        if(requiredLinesAtMinFonSize > maxLinesAtMinFontSize)
            return {fontSizePt: minFontSizePt, overflows: true};

        // We know the aspect ratio of the available space:
        const avaialbleAspectRatio = availableWidthPt/avaialableHeightPt
        // We can calculate the aspect ratio of several combinations of
        // columns an rows, as we know space these take.
        //     > 1 wider than high
        //     = 1 equals i.e. a square
        //     < 1 higher than wide
        // It should be possible to find the optimal configuration of rows
        // and columns that best fills the available space, the combination
        // with the biggest font-size.
        // If that biggest font-size is smaller than minFontSize, we go
        // with overflow and min-font size
        //     one row with n items
        //     two rows n/2 items
        //     ...
        //     n rows with n/n === 1 item
        // For each of the combinations, get the aspect ratio.
        // Decide whether to fit by height or fit by length. the other dimension
        // will follow and be less or equal the available space.
        // Get the font-size from that fitted dimension.
        // if the font-size is bigger or equal max-font-size we can quit
        // and return the max-font-size.
        //
        // If the font-size before was bigger, we can exit early, as we
        // found the maximum.
        // We can try to get a good starting point from starting with the
        // minFontSize and if there's no overflow see if we can optimize space usage
        // Whatever minFontSize is, start with the amount of rows it produces
        // If it is one row we start with one row.
        // If it is two rows we start with two rows.
        let lastFittingFontSizePt = minFontSizePt;
        // Stop when we are at one cell per line: rowsAmount<=cellsAmount
        for(let rowsAmount=requiredLinesAtMinFonSize;rowsAmount<=cellsAmount;rowsAmount++) {
            const itemsPerRow = Math.ceil(cellsAmount/rowsAmount)
              , widthEm = itemsPerRow * (cellWidthEm + gapWidthEm) - gapWidthEm
              , heigthEm = rowsAmount * lineHeightEm
              , aspectRatio = widthEm/heigthEm
              , fontSizePt = (aspectRatio >= avaialbleAspectRatio)
                        // aspectRation === avaialbleAspectRatio: fit by any dimension
                        // fit by width
                        // e.g. ar === 2 i.e. 2 wide 1 high
                        //      aar === 1 i.e. a square
                        //      => width will be limiting
                        ? availableWidthPt/widthEm
                        // aspectRation < avaialbleAspectRatio
                        // fit by height
                        // e.g. ar === 1/2 i.e. 1 wide 2 high
                        //      aar === 1 i.e. a square
                        //      => height will be limiting
                        : avaialableHeightPt/heigthEm
                        ;
            if(fontSizePt >= maxFontSizePt)
                return {fontSizePt:maxFontSizePt, overflows: false};
            if(fontSizePt < lastFittingFontSizePt)
                // It's getting smaller, we found the maximum before.
                break;
            lastFittingFontSizePt = fontSizePt;
        }
        // If the value is too precise it may not fit as the browser
        // introduces other precisions when laying out/rendering.
        // I.e. the line may break to early and introduce scrolling
        // even though it schould fit as calculated.
        // .3 is wiggle room
        const wiggleRoom = .3
            // the floor is rather just cosmetics.
          , fontSizePt = Math.floor(lastFittingFontSizePt * 100) / 100 - wiggleRoom
          ;
        return {fontSizePt, exactFontSize: lastFittingFontSizePt, overflows: false};
    }

    _setCellsProperties(cellWidths, fontSizePt, minMaxExtents, extents, cellAlignment) {
        const [/*advancesXInEM*/, /*cellsMaxWidthsInEM*/, widestEM] = cellWidths;
        this.element.style.setProperty('--widest-cell-em', widestEM);
        //  fontSizePx = fontSizePt * 4/3
        this.element.style.setProperty('--font-size-pt', fontSizePt);
        this.element.style.setProperty('--cell-alignment', cellAlignment);

        for(const [name, value] of minMaxExtents)
            this.element.style.setProperty(name, value);
        // It may become required i.e. to inform each actor of the update
        // using an API, but for now css can do the propagation.
        for(const [actorIndex, ext] of extents.entries()) {
            this.element.style.setProperty(`--ascender-em-${actorIndex}`, ext.ascender / ext.upem);
            this.element.style.setProperty(`--descender-em-${actorIndex}`, ext.descender / ext.upem);
            this.element.style.setProperty(`--line-gap-em-${actorIndex}`, ext.lineGap / ext.upem);
        }
    }

    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        super._update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate);
        // after all updates have been applied, we can figure out the
        // "type"/cell setting layout. It's a bit related to line setting
        // of text.
        //
        // actors are the layers, cells are the contents
        const changedMap = this.getChangedMap(compareResult);
        let requireUpdateCellsWidth = isInitialUpdate; //false;
        // This could be much finer grained, but it seems so far sufficient.
        // Finer grained would mean e.g. to ignore changes of color to
        // the keyMoments of an activeActor child.
        // It's also a question of responsibility, it would be interesting
        // to get information about whether a cell may cause the requirement
        // of newly calculated widths. The cell may report this when its
        // content changed or when its font changed but not, if its colors
        // changed. The key is, the cell rendereing the acual content
        // much rather knows if it potentially changed size/widths than this,
        // the container/controller. New cells/deleted cells are cases the
        // controller should notice, where new cells would report themselves
        // but deleted cells can't.
        // Eventually, we're also going to change opentype features, which
        // also can have an impact on cell widths. So, a finer grained
        // approach will also have to keep up with fututre changes.
        if(!requireUpdateCellsWidth) {
            for(const entry of ['font', 'activeActors', 'keyMoments']){
                if(changedMap.has(entry)) {
                    requireUpdateCellsWidth = true;
                    break;
                }
            }
        }

        if(requireUpdateCellsWidth) {
            // Ideally we can prevent this from happening when only
            // globalT or animationProperties@ have changed, as then we
            // then don't do this calculation on every animation frame.
            // console.log(`${this} requireUpdateCellsWidth changedMap:`, ...changedMap.keys(), changedMap);
            //const [advancesXInEM,,widestEM] = this._getCellsWidths();
            // must be set in initial update and when it changes.
            this._cellWidths = this._getCellsWidths(); // [advancesXInEM, cellsMaxWidthsInEM, widestEM]
        }
        // CAUTION: FIXME:
        // the available height depends on the window size, so this
        // should/must update on resize. It currently updates when the
        // the animation runs, which is good enough for thesting.
        // TODO: make updates only when necessary!
        const {width, height} = this.widgetBus.wrapper.host.getBoundingClientRect()
          , availableWidthPt = width / 4 * 3
          , avaialableHeightPt = height / 4 * 3
          , minFontSizePt = 24
          , maxFontSizePt = Infinity// 144
          , computedStyle = this._domTool.window.getComputedStyle(this.element)
          , [gapWidthEm, lineHeightEm] = [
                    // FIXME: don't do this via CSS, rather use CSS
                    // css properties maybe further up, as configuration
                    // but not hardcoded in here. Especially also, because
                    // change propagation is hard to manage that way.
                    ['--gap-widht-em', 0]
                  , ['--line-height-em', 1]
                ].map(([propertyName, fallBackValue])=>{
                    const value = computedStyle.getPropertyValue(propertyName)
                      , parsedValue = parseFloat(value)
                      ;
                    return isNaN(parsedValue) ? fallBackValue : parsedValue;
                })
          ;
        const  [,,cellWidthEm] = this._cellWidths
         , {fontSizePt /*, overflows*/} = this._getGridFontSize(
                    availableWidthPt, avaialableHeightPt
                  , minFontSizePt, maxFontSizePt
                  , cellWidthEm, gapWidthEm, lineHeightEm
                  , this.cells.length
                  )
          , extents = this._getExtents()
          , minMaxExtents = this._getMinMaxExtents(extents)
          , animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
          , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
          , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
          , getDefault = property=>[, getRegisteredPropertySetup(property).default]
          , [, cellAlignment] = getPropertyValue(propertyValuesMap, getDefault, 'generic/cellAlignment')
          , colorPropertiesMap = [
                ['colors/stageBackgroundColor', 'background-color']
            ]
          ;
        actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);

        this._setCellsProperties(this._cellWidths, fontSizePt, minMaxExtents
                , extents, cellAlignment);
        const layoutControlsHaveChanged = false;
        if(requireUpdateCellsWidth || layoutControlsHaveChanged) {
            //
            // There should be a way to set the font size explicitly.
            //
            // Bonus: There should be a paging setup.
            //        At one item per page would profit from adding a
            //        quick dial.
            //      * paging should be navigateable by e.g. prev/next keyboard input
            //      * automatic animation through the pages would be fantastic.
            //      * depending on how much of the automatic pagination
            //        navigation we require it will be interesting to see
            //        how it can be implemented.
            //      * NOTE: the charGroup selection is already an attempt
            //        control the amount of items per pager, thus it's
            //        not super urgent to add paging on top.
            //      * Implementation wise, pagination on pure UI level would be
            //        simpler. Interaction with animation state could be a kind
            //        of second step. Not sure how interesting that is in general
            //        as a use case though. So I rather go just with the former
            //        and wait whether the latter comes up at some point.
        }
    }

    getChangedMap(compareResult) {
        if(this._ownChangedMapCache === null
                    || this._ownChangedMapCache.compareResult !== compareResult) {
            const changedMap = this.widgetBus.wrapper.getChangedMapFromCompareResult(
                                false /*requiresFullInitialUpdate*/, compareResult);
            this._ownChangedMapCache = {compareResult, changedMap};
        }
        return this._ownChangedMapCache.changedMap;
    }

    update(compareResult, ...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@').resetUpdatedLog();
        this._ownChangedMapCache = null;
        super.update(compareResult, ...args);
    }

    // COPY from _BaseDynamicCollectionContainerComponent
    //      BUT the cellContent@ resetUpdatedLog line is added. If this
    //      could be inherited the simpler initialUpdate with the call to
    //      super.initialUpdate(...args); would do the trick.
    // initialUpdate(...args) {
    //     this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@').resetUpdatedLog();
    //     super.initialUpdate(...args);
    // }
    // CAUTION _BaseDynamicCollectionContainerComponent has maybe more
    // useful things not yet tested: get modelDependencies() and get dependencies()
    // seem required, but this class so far always has two children by default.
    initialUpdate(rootState) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('cellContent@').resetUpdatedLog();
        this._ownChangedMapCache = null;
        // FIXME: There's a problem as this.dependencies depends on
        // this.activeWidgets(), which is provided partly by running _provisionWidgets
        // and compareResult depends on this.dependencies
        // but maybe we just check all active/non-active widgets? or something else
        // StateComparison.createInitial with appropriate dependencies is
        // quicker but can be run without any dependencies as well.
        let compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        const requiresFullInitialUpdate = this._provisionWidgets(compareResult);
        if(requiresFullInitialUpdate.size)
            // otherwise compareResult is not updated at this point
            compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        this._update(compareResult, requiresFullInitialUpdate, true);
    }
}
