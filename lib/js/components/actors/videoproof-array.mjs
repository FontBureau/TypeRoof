/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractEnumModel
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
} from '../ui-char-groups.mjs';

export { charGroupsData };

const _charGroupsKeys = getCharGroupsKeys(charGroupsData);
export const CharGroupModel = _AbstractEnumModel.createClass(
        'CharGroupModel'
      , _charGroupsKeys
      , _charGroupsKeys[0]
        // Fix this as static to the model, so we have no confusion about
        // which charGroupsData is expected.
        // CharGroupModel.charGroupsData === charGroupsData
      , {charGroupsData: {value: charGroupsData, enumerable: true}}
    );
export const VideoproofArrayKeyMomentModel = _AbstractStructModel.createClass(
        'VideoproofArrayKeyMomentModel'
      , ...typographyKeyMomentModelMixin
      , ['charGroup', CharGroupModel]
    )
  , VideoproofArrayKeyMomentsModel = _AbstractListModel.createClass('VideoproofArrayKeyMomentModel', VideoproofArrayKeyMomentModel)
    /**
     * FIXME: this is so far a one to one copy of LineOfTextActorModel
     * it should rather be straight forward to re-use {xxx}ActorModels.
     * However, likeley this will become more specific.
     */
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
    constructor(parentAPI) {
        super(parentAPI);
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
        fixGridLineBreaks(font, this.element);
    }

    update(changedMap) {
        // console.log('CircleActorRenderer.update changedMap:', ...changedMap);
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

            // Should only be done if it changed.
            if((propertyValuesMap.has('generic/textRun'))) {
                // FIXME: use another source property eventually
                const chars = propertyValuesMap.get('generic/textRun');
                this._updateCells(font, chars);
            }
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
