/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
  , StringModel
  , BooleanModel
} from '../../metamodel.mjs';

import {
    _BaseActorModel
  , genericActorMixin
} from './actors-base.mjs';

import {
    typographyKeyMomentModelMixin
  , typographyActorMixin
} from './models.mjs';

import {
    _BaseComponent
} from '../basics.mjs';

import {
    fixGridLineBreaks
} from '../../affixed-line-breaks.mjs';

import {
//    getPropertyValue
    actorApplyCSSColors
  , actorApplyCssProperties
//  , DYNAMIC_MARKER
//  , cssPositioningHorizontalPropertyExpander
  , setTypographicPropertiesToSample
} from './properties-util.mjs';

import {
    getRegisteredPropertySetup
} from './stage-registered-properties.mjs';


import charGroupsData from '../../char-groups-data.mjs';

import {
    getCharGroupsKeys
  , getCharsForSelectUI
  , getExendedChars
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
      , ['extended', BooleanModel] // could be BooleanDefaultTrueOrEmptyModel
      , ['customText', StringModel]//StringOrEmptyModel]
      , ['customSeparator', StringModel]//StringOrEmptyModel]
    )
    , VideoproofArrayKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofArrayKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      , ['charGroup', CharGroupModel]
    )
  , VideoproofArrayKeyMomentsModel = _AbstractListModel.createClass('VideoproofArrayKeyMomentModel', VideoproofArrayKeyMomentModel)
  , VideoproofArrayActorModel = _BaseActorModel.createClass(
        'VideoproofArrayActorModel'
        , ...genericActorMixin
        , ['keyMoments', VideoproofArrayKeyMomentsModel]
        , ...typographyActorMixin
);

export class VideoproofArrayActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="actor_renderer-videoproof_array fixed-line-breaks">(content not initialized)</div>`;
    // jshint ignore:end
    constructor(parentAPI, charGroupsData) {
        super(parentAPI);
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
        //        [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', 'px']
        //    , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', cssPositioningHorizontalPropertyExpander, 'px']
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

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
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

            // FIXME: it should maybe have a default value if there's
            // no KeyMoment, as for usability it seems odd that the
            // actor is there but it doesn't show anything. Though,
            // that is also the same case for e.g. the line-of-text actor.
            // However, that could inherit from its parent textContent.
            const cellContents = [];
            if((propertyValuesMap.has('generic/charGroup/options'))) {
                // look at the colors, there's a good method that extracts
                // those components from a distributed complex value.
                const charGroup = propertyValuesMap.get('generic/charGroup/options')
                   , showExtended = propertyValuesMap.get('generic/charGroup/extended')
                   , data = {chars: [], extendedChars: []}
                   , cellsStateKeyTokens = []
                   ;
                if(charGroup === 'custom') {
                    const customText = propertyValuesMap.get('generic/charGroup/customText')
                      , customSeparator = propertyValuesMap.get('generic/charGroup/customSeparator')
                      ;
                    // Escaping is not really necessary, as the customSeparator
                    // can be changed if there are clashes with the customText
                    data.chars = customText.split(customSeparator);
                    data.extendedChars = getExendedChars(this._charGroupsData, data.chars);
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
                else
                    [data.chars, data.extendedChars] = getCharsForSelectUI(this._charGroupsData, font, charGroup);
                const hasExtended = data.extendedChars.length
                  , cellsStateKey = [font.fullName, charGroup
                        , showExtended && hasExtended ? '1' : '0'
                        , ...cellsStateKeyTokens].join(';')
                  ;
                // Only do if it changed.
                if(this._cellsStateKey !== cellsStateKey) {
                    this._cellsStateKey = cellsStateKey;
                    cellContents.push(...data.chars);
                    if(showExtended && hasExtended)
                        cellContents.push(...data.extendedChars);
                }
            }
            if(cellContents.length)
                this._updateCells(font, cellContents);
            else
                this._domTool.clear(this.element);

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
