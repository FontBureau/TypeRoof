import {
    _BaseActorModel
  , ActorsModel
  , genericActorMixin
} from './actors-base.mjs';

import {
    ActiveActorsRenderingController
} from './active-actors-rendering-controller.mjs';

import {
    TypeSettingKeyMomentsModel
  , typographyActorMixin
} from './models.mjs';

import {
    DYNAMIC_MARKER
  , cssPositioningHorizontalPropertyExpander
  , actorApplyCSSColors
  , actorApplyCssProperties
  , getPropertyValue
} from './properties-util.mjs';

import {
    setLanguageTagDirect
} from '../language-tags.typeroof.jsx';


import {
    getRegisteredPropertySetup
} from '../registered-properties.mjs';

import {
    _BaseContainerComponent
} from '../basics/component.mjs';

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
 * A CSS-property setter (see actorApplyCssProperties) for the 3d rotations.
 *
 * The three rotation axes can't be set individually, they must go into
 * one `transform` value, hence one setter reads all three from the
 * propertyValuesMap. `transform` is applied after the individual
 * `translate`/`rotate`/`scale` properties, so this composes with the
 * 2d `numericProperties/rotation` rather than overriding it.
 */
function _setCSS3DRotation(element, rotationX, propertyValuesMap, getDefault) {
    const [, rotationY] = getPropertyValue(propertyValuesMap, getDefault, '3dProperties/rotationY')
      , [, rotationZ] = getPropertyValue(propertyValuesMap, getDefault, '3dProperties/rotationZ')
      , rotations = [['X', rotationX], ['Y', rotationY], ['Z', rotationZ]]
            .filter(([, value])=>value !== 0)
            .map(([axis, value])=>`rotate${axis}(${value}deg)`)
      ;
    if(rotations.length)
        element.style.setProperty('transform', rotations.join(' '));
    else
        element.style.removeProperty('transform');
}

/**
 * A CSS-property setter (see actorApplyCssProperties) for perspective.
 *
 * `perspective: 0` is not valid CSS, the "no perspective" value is `none`,
 * but 0 is the registered default (REGISTERED_PROPERTIES[THREE_D]).
 */
function _setCSS3DPerspective(element, perspective) {
    if(typeof perspective === 'number' && perspective > 0)
        element.style.setProperty('perspective', `${perspective}px`);
    else
        element.style.removeProperty('perspective');
}

/**
 * This is to set/manage the properties of a layer node.
 */
export class LayerDOMNode extends StaticNode {
    constructor(widgetBus, node, cssClasses) {
        super(widgetBus, node);
        for(const className of ['motion_stage-layer', ...cssClasses])
            this.node.classList.add(className);
    }
    update(changedMap) {
        const propertiesData = [
              [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', cssPositioningHorizontalPropertyExpander, 'px']
            , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
            , ['numericProperties/z-index', 'z-index', '',  Math.round]
            , ['numericProperties/width', 'width', 'px']
            , ['numericProperties/scale', 'scale', '']
            , ['numericProperties/rotation', 'rotate', 'deg']
            , ['numericProperties/height', 'height', 'px']
            , ['3dProperties/perspective', _setCSS3DPerspective]
              // reads rotationY and rotationZ from the propertyValuesMap
            , ['3dProperties/rotationX', _setCSS3DRotation]
        ];
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
            setLanguageTagDirect(this.node, propertyValuesMap);
        }
    }
}

export class LayerActorRenderer extends _BaseContainerComponent {
    constructor(widgetBus, _zones, layerBaseClass, getActorWidgetSetup) {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden
        const layerElement = widgetBus.domTool.createElement('div')
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', layerElement], ['parent-layer', _zones.get('layer')]])
          ;
        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    'animationProperties@'
                  , ['/activeState/t', 'globalT']
                ]
              , LayerDOMNode
              , layerElement
              , [layerBaseClass, `${layerBaseClass}-sub`]
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActiveActorsRenderingController
              , zones
              , layerBaseClass
              , getActorWidgetSetup
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}
