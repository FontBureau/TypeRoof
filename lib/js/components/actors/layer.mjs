/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _BaseActorModel
  , ActorsModel
  , genericActorMixin
} from './actors-base.mjs';

import {
    TypeSettingKeyMomentsModel
  , typographyActorMixin
} from './models.mjs';

import {
    DYNAMIC_MARKER
  , cssPositioningHorizontalPropertyExpander
  , actorApplyCSSColors
  , actorApplyCssProperties
} from './properties-util.mjs';

import {
    getRegisteredPropertySetup
} from './stage-registered-properties.mjs';

import {
    StaticNode
} from '../generic.mjs';

export const LayerActorModel = _BaseActorModel.createClass(
    'LayerActorModel'
  , ...genericActorMixin
  , ['keyMoments', TypeSettingKeyMomentsModel]
  , ...typographyActorMixin
  , ['activeActors', ActorsModel]
  // removed, because ActorReferencesModel via ActorReferenceModel
  // already depends on ActorsModel:availableActors
  //  , ['availableActors', new InternalizedDependency('availableActors', ActorsModel)]
    // this should also inherit or override all the properties.
    // especially size, x, y, z, t
);

/**
 * This is to set/manage the properties of a layer node.
 */
export class LayerDOMNode extends StaticNode {
    constructor(parentAPI, node, cssClasses) {
        super(parentAPI, node);
        for(const className of ['stage_and_actors-layer', ...cssClasses])
            this.node.classList.add(className);
    }
    update(changedMap) {
        const propertiesData = [
              [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', cssPositioningHorizontalPropertyExpander, 'px']
            , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
            , ['numericProperties/z-index', 'z-index', '',  Math.round]
            , ['numericProperties/width', 'width', 'px']
            , ['numericProperties/height', 'height', 'px']
        ];
        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, 'inherit'];
                    return [true, getRegisteredPropertySetup(property).default];
                }
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;
            actorApplyCSSColors(this.node, propertyValuesMap, getDefault, colorPropertiesMap);

            // set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this block, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            actorApplyCssProperties(this.node, propertyValuesMap, getDefault, propertiesData);
        }
    }
}
