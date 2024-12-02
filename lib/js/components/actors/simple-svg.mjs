/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _BaseActorModel
  , genericActorMixin
} from './actors-base.mjs';

import {
    KeyMomentsModel
} from './models.mjs';

import {
    _BaseComponent
} from '../basics.mjs';

import {
    DYNAMIC_MARKER
  , cssPositioningHorizontalPropertyExpander
  , actorApplyCSSColors
  , actorApplyCssProperties
} from './properties-util.mjs';

import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';


    // This is no meant as an eventual Actor, just to simply set up
    // without great complexity.
    // Just enough information to create:
    // <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    //            <circle cx="50" cy="50" r="50" />
    // </svg>
    // where viewBox width/height = 2 * radius
export const CircleActorModel = _BaseActorModel.createClass(
        'CircleActorModel'
      , ...genericActorMixin
      , ['keyMoments', KeyMomentsModel]
    //  , CoherenceFunction.create(
    //        ['x', 'y', 'radius']
    //      , function setDefaults({x, y, radius}) {
    //        if(x.value === undefined)
    //            x.value = 0;
    //        if(y.value === undefined)
    //            y.value = 0;
    //        if(radius.value === undefined)
    //            radius.value = 50;
    //    })
    //  , ['radius', NumberModel]
    //  , ['x', NumberModel]
    //  , ['y', NumberModel]
    )
  , RectangleActorModel = _BaseActorModel.createClass(
        'RectangleActorModel'
      , ...genericActorMixin
      , ['keyMoments', KeyMomentsModel]
    )
  ;

export class CircleActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<svg
    viewBox="0 0 0 0"
>
    <circle cx="0" cy="0" r="0" />
</svg>`;
    // jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        [this.element, this.circle] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , circle = element.querySelector('circle')
          ;
        element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element, circle];
    }
    update(changedMap) {
        const setRadius = radius=>{
                for(const [element, attr, value] of [
                        [this.element, 'viewBox', `-${radius} -${radius} ${2*radius} ${2*radius}`]
                      , [this.circle, 'r', `${radius}`]
                ]) {
                     element.setAttribute(attr, value);
                }
                this.element.style.setProperty('width', `${2*radius}px`);
                this.element.style.setProperty('height', `${2*radius}px`);
            }
          , propertiesData = [
                [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', cssPositioningHorizontalPropertyExpander, 'px']
              , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
              , ['numericProperties/z-index', 'z-index', '',  Math.round]
                // NOTE: transform should have a much more complete interface!
              , ['numericProperties/scale', 'transform', '', val=>`scale(${val})`]
              , ['numericProperties/r', (elem, value)=>setRadius(value)]
          ];

        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => [true, getRegisteredPropertySetup(property).default]
              , colorPropertiesMap = [
                      ['colors/strokeColor', 'stroke']
                    , ['colors/fillColor', 'fill']
                ]
              ;
            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            // set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example

            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
        }
    }
}

export class RectangleActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<svg
    viewBox="0 0 0 0"
>
    <rect width="0" height="0" />
</svg>`;
    // jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        [this.element, this.shape] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , shape = element.querySelector('rect')
          ;
        element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element, shape];
    }
    update(changedMap) {
        const setExtend = (prop, value)=>{
                // 0 0 width height
                // A bit messy: element attribute will keep the other dimension
                const viewBox =  this.element.getAttribute('viewBox').split(' ');
                if(prop === 'width')
                    viewBox[2] = value;
                if(prop === 'height')
                    viewBox[3] = value;
                for(const [element, attr, v] of [
                            [this.element, 'viewBox', viewBox.join(' ')]
                          , [this.shape, prop, value]
                    ])
                     element.setAttribute(attr, v);
                this.element.style.setProperty(prop, `${value}px`);
            }
          , propertiesData = [
                [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', cssPositioningHorizontalPropertyExpander, 'px']
              , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
              , ['numericProperties/z-index', 'z-index', '',  Math.round]
                // NOTE: transform should have a much more complete interface!
              , ['numericProperties/scale', 'transform', '', val=>`scale(${val})`]
              , ['numericProperties/width', (elem, value)=>setExtend('width', value)]
              , ['numericProperties/height', (elem, value)=>setExtend('height', value)]
          ];

        if(changedMap.has('animationProperties@') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('animationProperties@')
                        ? changedMap.get('animationProperties@')
                        : this.getEntry('animationProperties@')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => [true, getRegisteredPropertySetup(property).default]
              , colorPropertiesMap = [
                      ['colors/strokeColor', 'stroke']
                    , ['colors/fillColor', 'fill']
                ]
              ;
            actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
        }
    }
}
