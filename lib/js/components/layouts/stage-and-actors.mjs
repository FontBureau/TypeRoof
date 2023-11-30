/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , getEntry
  , ForeignKey
  // , unwrapPotentialWriteProxy
  , StateComparison
  , CoherenceFunction
  , StringModel
  , NumberModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractEnumModel
  , StaticDependency
  , getMinMaxRangeFromType
  , _BaseSimpleModel
  , _BaseContainerModel
  , BooleanModel
  , BooleanDefaultTrueModel
  , FreezableSet
} from '../../metamodel.mjs';

import {
    zip
  , enumerate
  , mapValueToRange
} from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
  , _CommonContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
  , UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
  , HANDLE_CHANGED_AS_NEW
} from '../basics.mjs';

import {
    StaticNode
  , DynamicTag
  , StaticTag
  , UINumberInput
  , PlainNumberAndRangeInput
  , PlainToggleButton
  , PlainNumberAndRangeOrEmptyInput
  , UINumberAndRangeOrEmptyInput
  , UILineOfTextInput
  , UILineOfTextOrEmptyInput
  , GenericSelect
  , UISelectInput
  , UISelectOrEmptyInput
  , PlainSelectInput
  , UIToggleButton
} from '../generic.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    FontSelect
} from '../font-loading.mjs';

import {
    timeControlModelMixin
  , AnimationTGenerator
  , UITimeControlCircle
  , UIActorTimeControlKeyMomentSelectCircle
  , getBasicPlayerControlWidgets
  , LocalScopeAnimanion
  , AnimationLiveProperties
  , AnimationInfo
  , binarySearch
  , AnimationPropertiesProtocolHandler
}  from '../animation-fundamentals.mjs';

import {
    createLabelForKeyMoment
} from './example-key-moments.mjs';

import {
    UIManualAxesLocations
  , AxesLocationsModel
} from '../ui-manual-axis-locations.mjs';

import {
    formatCss as culoriFormatCss
  , getMode as culoriGetMode
  , converter as culoriConverter
  , interpolate as culoriInterpolate
  , fixupHueShorter
  , fixupHueLonger
  , fixupHueDecreasing
  , fixupHueIncreasing
} from '../../vendor/culori/bundled/culori.mjs';

import {
    COLOR_TYPE_TO_CULORI_MODE
  , PECENTAGE_UNIT_NUMBER_TYPES
  , TURN_UNIT_NUMBER_TYPES
  , _BaseColorModel
  , ColorModel
  , AvailableColorTypesModel
  , availableColorTypes
  , culoriValuesToColorValuesRange
  , culoriToColor
  , getColorFromPropertyValuesMap
  // , colorToCss
} from '../color.mjs';

import {
    ActorsModel
  , AvailableActorTypesModel
  , createActor
} from '../actors/actors-base.mjs';

import {
    TypographyKeyMomentsModel
  , FontSizeModel
} from '../actors/models.mjs';

import {
    activatableActorTypes
  , getActorWidgetSetup
  , getActorTreeNodeType
  , isTypographicActorTypeKey
  , getActorTypeKeySpecificWidgets
} from '../actors/available-actors.mjs';

import {
    CONTAINER_TASK_AUTOMATIONS
} from  '../task-automations/container-task-automations.mjs';

import {
    REGISTERED_PROPERTIES
  , getRegisteredPropertySetup
} from '../actors/stage-registered-properties.mjs';

import {
    StageDOMNode
}
from '../actors/stage.mjs';

import {
    ActiveActorsRenderingController
} from '../actors/active-actors-rendering-controller.mjs';


import {
    UISelectCharGroupInput
  , UISelectCharGroupOrEmptyInput
} from '../ui-char-groups.mjs';

import {
    CharGroupOptionsModel
  , CharGroupModel
} from '../actors/videoproof-array.mjs';

    // TODO: _AbstractTypedModel('PathModel', Path) => would be simple!
const PathModel = _AbstractGenericModel.createClass('PathModel')
  , StageAndActorsModel = _BaseLayoutModel.createClass(
        'StageAndActorsModel'
      , ...timeControlModelMixin
         // same as in_BaseActorModel, but this is not an actor,
         // these properties are the root of the inheritance.
      , ['keyMoments', TypographyKeyMomentsModel]
      , CoherenceFunction.create(
            ['width', 'height'/*, 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function setDefaults({width, height /*, availableActorTypes, activeActors, font, installedFonts*/}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            //
            // widht and heigth defaults could also be determined differently
            // this is simply to get started somewhere.
            if(width.value === undefined)
                width.value = 720; // 1080;
            if(height.value === undefined)
                height.value = 720; // 1080;
        })
        // very similar to Layer, we could even think about
        // using something like ['baseLayer', LayerActorModel]
        // I'm currently thinking, this could also be a ActorsModel
        // and allow to define actors in place. Then it's only necessary
        // to put actors into availableActors when they will be used by
        // reference.
      , ['activeActors', ActorsModel]
        // ok, we need to select from somewhere an available type
        // maybe, this can be a permanent, local (injected here?) dependency
        // not one that is injected via the shell. Unless, we start to
        // add actors in a plugin-way, like it is planned for layouts ...
        // TODO:
        // FIXME: removed the type for this StaticDependency definition,
        // which would be "AvailableActorTypesModel", as it gets a direct
        // value and that is whatever type it is. It should be immutable
        // for sure.
        // FIXME: Other dependencies, however, should also be defined with
        // a type, so we can always be sure to receive the expected type.
        // Maybe also some (rust) trait-like description of required
        // fields and their types could be helpful for this, so stuff
        // can be similar but is not bound to the actual same type.
        // static dependeny could as implementation always be applied to
        // the dependencies dict after collecting external dependencies,
        // then, treat it as InternalizedDependency...
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableActorTypes'
                      , AvailableActorTypesModel
                      , activatableActorTypes
                      )
        // , ... StaticDependency.createWithInternalizedDependency(
        //                   'referencableActorTypes'
        //                 , AvailableActorTypesModel
        //                 , referencableActorTypes
        //                 )
        // , ['referencableActors', ReferencableActorsModel]
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableColorTypes'
                      , AvailableColorTypesModel
                      , availableColorTypes
                      )
      , ['width', NumberModel]
      , ['height', NumberModel]
      , ['editingActor', _AbstractSimpleOrEmptyModel.createClass(PathModel)]
    )
  ;

// So, we want to get a t value from parent, as a dependency, but give
// another t value to the child, could be done in a coherence method
// where parentT => InternalizedDependency('t', NumberModel)
//       t=>NumberModel
// and the coherence function can do something to go from parentT to t
// BUT at this point there's a discrepance between actually stored values
// and calculated values required e.g. for rendereing, and it is time to
// implement something concrete!


const _NOTDEF = Symbol('_NOTDEF'); // not exported on purpose

/**
 * Similar to the concept Surfaces in Cairo
 * https://www.cairographics.org/manual/cairo-surfaces.html
 * this will be the rendering target. Likely each surface will have
 * it's own capabilties. It's interesting that HTML in general and also
 * SVG can host different technologies (HTML/CSS, SVG, Canvas2d/3d)
 * so maybe we can mix these surfaces eventually as well.
 */
// class SurfaceHTML extends _BaseComponent {
//     //jshint ignore:start
//     static TEMPLATE = `<div class="surface_html">
// </div>`;
//     //jshint ignore:end
//     constructor(parentAPI) {
//         super(parentAPI);
//         [this.element] = this.initTemplate();
//     }
//
//     initTemplate() {
//         const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
//           , element = frag.firstElementChild
//           ;
//         return [element];
//     }
//
//     // activeActors
//     // width
//     // height
//     update(changedMap) {
//         changedMap.has('hello');
//     }
// }

/**
 * yield [propertyName, propertyValue]
 * derrived from axisLocationsGen
 */
function* numericPropertiesGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const numericProperties = keyMoment.get('numericProperties');
    for(const [key, property] of numericProperties)
        yield [`numericProperties/${key}`, property.value];
}


/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* fontSizeGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const fontSize = keyMoment.get('fontSize');
    if(!fontSize.isEmpty)
        yield ['fontSize', fontSize.value];
}

/**
 * yield [propertyName, propertyValue]
 * derrived from keyMomentPropertyGenerator
 */
function* axisLocationsGen(outerAnimanionAPI, keyMoment, momentT) {
      // fontSize = keyMoment.get('fontSize')
      // => this is interesting, if keyMoment defines fontSize, we
      //    definitely use that, otherwise, going only via
      // outerAnimanionAPI.getPropertyAtMomentT('fontSize', momentT) will
      // yield the out-value (last value) of that momentT
      const autoOPSZ = keyMoment.get('autoOPSZ').value
      ;
    if(autoOPSZ) {
        const fontSize = keyMoment.get('fontSize')
          , fontSizeValue = fontSize.isEmpty
                  // this requires full calculation of the fontSize property animation!
                ? outerAnimanionAPI.getPropertyAtMomentT('fontSize', momentT, null)
                : fontSize.value
          ;
        if(fontSizeValue !== null)
            yield [`axesLocations/opsz`, fontSizeValue];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = keyMoment.get('axesLocations');
    for(const [axisTag, axisValue] of axesLocations) {
        if(autoOPSZ && axisTag === 'opsz')
            // It was already yielded above and also should not
            // be present in here.
            continue;
        // Other than fontSize axesLocations are just not present when
        // at their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

// FIXME: copy pasta duplication from animation-animanion.mjs
function _culoriFixZeros(color, targetMode) {
    if(color.mode === targetMode)
        return color;
    // When components are missing, conversion to other modes
    // produces NaNs in culori, that's not a problem when the
    // components are compatible between spaces, i.e. don't require
    // or undergo an conversion.
    // Missing colors are set to 0 as suggested in
    // https://drafts.csswg.org/css-color/#interpolation-missing
    // I don't think we neeed a back-conversion in the interpolation
    // result. This resolves NaNs produces by culori in
    // conversion/interpolation.
    // Also: track: https://github.com/Evercoder/culori/issues/203
    // if that resolves the filter can return and the zeroing can
    // be removed again.
    const missing = []
      , {channels} = culoriGetMode(color.mode)
      ;
    let emptyCount = channels.length;
    for(const component of channels) {
        if(Object.hasOwn(color, component))
            // Not missing.
            continue;
        if(component === 'alpha') {
            emptyCount -= 1;
            // Missing alpha is not an issue as alpha is compatible everywhere.
            continue;
        }
        if(component === 'l' && color.mode.startsWith('ok')
                            && targetMode.startsWith('ok')) {
            // missing 'l' between oklab and oklch is compatible
            emptyCount -= 1;
            continue;
        }
        missing.push([component, 0]);
    }

    const result = missing.length
                // excluding alpha, if the color is empty we can keep
                // the emptyness
                && missing.length !== emptyCount
         // Add the missing components to a copy of a.
        ? {...color, ...Object.fromEntries(missing)}
        : color
        ;
    return result;
}

function _convertCuloriColorMode(originalCuloriColor, colorMode) {
    const zeroFixedColor =  _culoriFixZeros(originalCuloriColor, colorMode)
      , zeroFixedColorKeys = Object.keys(zeroFixedColor)
      , targetCuloriColor = zeroFixedColorKeys.length === 1 // only 'mode'
                // 'mode' and 'alpha'
                || (zeroFixedColorKeys.length === 2 && Object.hasOwn(zeroFixedColor, 'alpha'))
              // We can convert empty colors on the spot by just setting
              // a new color mode. 'alpha' needs no conversion either,
              // it's universally the same.
            ? {...zeroFixedColor, mode:colorMode}
            : culoriConverter(colorMode)(zeroFixedColor)
     ;
     // Bummer, culoriConverter turns e.g.
     //     Object { h: 108, mode: "oklch" } as oklab
     // into:
     //     Object { mode: "oklab", l: undefined, a: 0, b: 0 }
     for(const  k of Object.keys(targetCuloriColor)) {
        if(targetCuloriColor[k] === undefined)
            delete targetCuloriColor[k];
    }
     return targetCuloriColor;
}

function* colorsGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    for(const fieldName of getColorModelFields(keyMoment.constructor)) {
        const color = keyMoment.get(fieldName).get('instance');
        if(!color.hasWrapped)
            continue;

        // TODO:
        //      We are going to interpolate each component individually
        //      currently, we do full colors. But there's a problem getting
        //      reasonable defaults for missing components. E.g. we can't set
        //      hue in one keyMoment and use it in another key moment. that
        //      is mainly because we don't interpolate when we are exactly
        //      on a key moment. So, in order to be able to do that consistently
        //      we need to put all of the keyMoments interpolations into the
        //      same color model, e.g. backgroundColor => oklch
        //      textColor => rgb ...
        //      That is configuration that lives on the actor, next to the
        //      keyMoments, we could also default to oklch ok oklab etc.
        //      but changing the interpolation model has a lot of potential
        //      creating different transformations. Also, this should
        //      enable to e.g. choose the hue direction, specifically if
        //      a compatible interpolation color space is selected.
        //      These will always have a value, there's no way that there's
        //      no value.
        //      Thus, colorsGen should receive the necessary info to
        //      convert the color to the interpolation space and then
        //      yield the components of the target space only.
        //      we could also yield the target mode, as a convinience always
        //      however, within one keyMoments layer, it must be the same
        //      always. => could be an assertion error at relevant positon
        //      e.g.
        //              yield [`colors/${fieldName}/mode`, 'oklab']
        //              yield [`colors/${fieldName}/l`, 1]
        //              yield [`colors/${fieldName}/a`, 2]
        //              yield [`colors/${fieldName}/b`,  3]
        //              yield [`colors/${fieldName}/alpha`, 4]
        //              Where undefined components are not yielded.
        //
        // Starting with an in place implementation, with fixed color mode,
        // to be made configurable later ...
        // test the rest as well: 'rgb', 'oklch', 'oklab'
        //      for oklcg, it doesn't really make much sense without
        //      specifying how h/hue should be handled, as it's a polar
        // In general it seems to be dialed in so that using the interpolation
        // color mode with the colors in the same mode gives the colors the
        // super power of not having to define all components while
        // interpolating the individual components.
        const colorMode = 'oklab'
          , originalCuloriColor = colorToCulori(color)
          , targetCuloriColor = _convertCuloriColorMode(originalCuloriColor, colorMode)
          ;
        // This is not for interpolation! but it could sent instructions
        // along, like hue direction, could be an object.

        for( const [componentName, value] of Object.entries(targetCuloriColor)) {
            // Will also yield [`colors/${fieldName}/mode`, colorMode] as
            // that's an entry in targetCuloriColor.
            yield [`colors/${fieldName}/${componentName}`, value];
        }
        // FIXME: It doesn't make too much sense, to decompose
        //        the color here. Sure, it's straight forward for
        //        interpolation, but, unfortunately, it's losing
        //        the color-model AND we cannot interpolate between
        //        color-models
        //             * That is between models from one moment to the other.
        //               But above has good reasons as well.
        //             * Also, we now just yield the model along, let's
        //               see how that works out.
        //for(const [componentName, item] of instance.wrapped){
        //    if(item.isEmpty)
        //        continue;
        //    yield [`colors/${fieldName}/${componentName}`, item.value];
        //}
        // yield [`colors/${fieldName}`, colorToCulori(color)];
    }
}

/**
 * These will be handled largly automated in regard to their type and,
 * if it emerges, on the setup stored here.
 * They are yielded into animanion scope with the `generic/${fieldName}`
 * prefix by genericPropertiesBroomWagonGen and they will have ui-elements
 * established in KeyMomentController accordingly.
 *
 * FIXME: maybe move into stage-registered-properties/REGISTERED_PROPERTIES
 * also note that "KEYMOMENT_FIELDS" is largley the same as PROPERTIES
 * in this case, as all of the REGISTERED_PROPERTIES are located within
 * the KeyMoments and not directly within the Actors.
 */
const REGISTERED_GENERIC_KEYMOMENT_FIELDS = Object.freeze(new FreezableSet([
    'textRun', 'textAlign', 'positioningHorizontal', 'positioningVertical'
  , 'direction', 'heightTreatment', 'charGroup'
]));

/**
 * This is to be able to simply yield properties of a keyMoment, that have
 * not been handled by the other, specialized, generators before. There's
 * so far no intrinsic way of knowing if a propert has been handled before,
 * and as the property names within the keyMoment are translated to the
 * animation namespace from the other generators output before ( using
 * outerAnimanionAPI) it would be still hard to tell. Thus, this will be
 * rather very explicit, until it becomes more apparent how to select
 * properties to yield.
 *
 * A broom wagon is a vehicle that follows a cycling road race "sweeping"
 * up stragglers who are unable to make it to the finish within the time
 * permitted. If a cyclist chooses to continue behind the broom wagon,
 * they cease to be part of the convoy, and must then follow the usual
 * traffic rules and laws. (Wikipedia)
 */
function* _genericChildrenPropertiesBroomWagonGen(outerAnimanionAPI, path, item) {
    if(item instanceof _AbstractSimpleOrEmptyModel && item.isEmpty)
        return;
    if(item instanceof _BaseSimpleModel){
        yield [path.join('/'), item.value];
        return;
    }
    if(item instanceof _BaseContainerModel) {
        for(const [fieldName, childItem] of item) {
            const childPath = Object.freeze(path.concat(fieldName));
            yield* _genericChildrenPropertiesBroomWagonGen(outerAnimanionAPI, childPath, childItem);
        }
        return;
    }
    throw new Error(`VALUE ERROR don't know how to handle item: "{item.toString()}" at path: ${path.join('/')};`);
}

function* genericPropertiesBroomWagonGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    for(const fieldName of keyMoment.keys()) {
        if(!REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName))
            continue;
        const item = keyMoment.get(fieldName);
        const path = Object.freeze(['generic', fieldName]);
        yield* _genericChildrenPropertiesBroomWagonGen(outerAnimanionAPI, path, item);
    }
}

/**
 * FIXME: there should be a standard way to tell if a mixin, e.g.
 * typographyKeyMomentPureModelMixin is part of a struct, moving
 * these mixins closer to the concept of a trait.
 * e.g. like struct.implements(typographyKeyMomentModelMixin)
 * so, a marker should be put into struct that makes it quick and easy
 * to check.
 */
function _keyMomentsImplementsTypography(keyMoments) {
    const Model = keyMoments.constructor.Model; // Maybe: if keyMoments.constructor.prototype instanceof _AbstractListModel
    return (
           Model.fields.has('fontSize')
        && Model.fields.get('fontSize') === FontSizeModel
        && Model.fields.has('axesLocations')
        && Model.fields.get('axesLocations') === AxesLocationsModel
    );
}

function initAnimanion(keyMoments, isLoop) {
    const propertyGenerators = [numericPropertiesGen, colorsGen];
    if(_keyMomentsImplementsTypography(keyMoments))
        // add typography
        propertyGenerators.push(fontSizeGen, axisLocationsGen);
    propertyGenerators.push(genericPropertiesBroomWagonGen);
    return new LocalScopeAnimanion(propertyGenerators, keyMoments, isLoop);
}

function isInheritingPropertyFn(property) {
    if(property.startsWith('colors/'))
        property = property.split('/', 2).join('/');
    const setup = getRegisteredPropertySetup(property, {inherit: true});
    return setup.inherit === false ? false : true;
}

class ActorsMeta extends _BaseDynamicCollectionContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getActorWidgetSetup(rootPath) {
        const actor = this.getEntry(rootPath)
          , treeNodeType = getActorTreeNodeType(actor)
          , widgetRootPath = rootPath.append('instance')
          ;
        if(treeNodeType === getActorTreeNodeType.LEAF_NODE_TYPE) {
            return [
                {
                    rootPath: widgetRootPath
                  , 'animationProperties@': widgetRootPath.toString()
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                  , [`animationProperties@${widgetRootPath.append('..' ,'..', '..')}`, '@parentProperties']
                ]
              , AnimationLiveProperties
              , initAnimanion
              , isInheritingPropertyFn
            ];
        }
        else if(treeNodeType === getActorTreeNodeType.CONTAINER_NODE_TYPE) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                    // parent is always three levels above from here
                    // as this is {index}/instance
                  , [`animationProperties@${widgetRootPath.append('..', '..', '..')}`, '@parentProperties']
                ]
              , ContainerMeta
              , this._zones
            ];
        }
        throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup actor ${actor} with tree node type ${treeNodeType.toString()}`);
    }
    _createWrapper(rootPath) {
        const childParentAPI = this._childrenParentAPI
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getActorWidgetSetup(rootPath)
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }
}

/**
 * It's smarter to build the AnimationLiveProperties (and possibly other "meta data")
 * structure independent from StageHTML, as we may have different rendereing
 * targets, but the property propagation can and should be shared across.
 * Also, having the animationProperties@ registry relative to the top controller
 * of this module -- i.e. global -- makes this simple.
 */
class ContainerMeta extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        const widgets = [
            [
                {
                    'animationProperties@': parentAPI.rootPath.toString()
                }
              , [  ...parentAPI.wrapper.getDependencyMapping(parentAPI.wrapper.constructor.DEPENDECIES_ALL) ]
              , AnimationLiveProperties
              , initAnimanion // This usage instance won't receive parentProperties.
              , isInheritingPropertyFn
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActorsMeta
              , zones
              , []
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

/**
 * Orchestrate the own layer properties and the containg actor widgets.
 */
class StageHTML extends _BaseContainerComponent {
    constructor(parentAPI, _zones, baseCLass='Stage_HTML') {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden

        const containerElement = parentAPI.domTool.createElement('div')
          , topLayerElement = parentAPI.domTool.createElement('div')
          , layerBaseClass = `${baseCLass}-layer`
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', topLayerElement], ['parent-layer', parentAPI.wrapper.host]])
          ;
        // calling super early without widgets is only required when
        // the widgets definition requires the `this` keyword.
        topLayerElement.classList.add(layerBaseClass);
        topLayerElement.classList.add(`${layerBaseClass}-top`);
        containerElement.append(topLayerElement);
        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    'width', 'height'
                  , ['t', 'globalT']
                  , [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                ]
              , StageDOMNode
              , containerElement, topLayerElement
              , [baseCLass, `${baseCLass}-wrapper`]
            ]
            // These will probably have to be be selection dependant!
          , [
                {zone: 'after-layout'}
              , [
                    ['t', 't']
                  , ['duration', 'duration'] // in seconds
                  , ['isLoop', 'isLoop'] // never stop playback
                  , ['perpetual', 'perpetual']
                  , ['playing', 'playing']
                  , ['keyMoments', 'keyMoments']
                  , [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                ]
              , AnimationInfo
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActiveActorsRenderingController
              , zones
              , []
              , layerBaseClass
              , getActorWidgetSetup
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

export const DATA_TRANSFER_TYPES = Object.freeze({
    ACTOR_PATH: 'application/x.typeroof-actor-path'
  , ACTOR_CREATE: 'application/x.typeroof-actor-create'
});

class SelectAndDrag extends _BaseComponent {
        // jshint ignore:start
    static TEMPLATE = `<div class="select_and_drag">
    <label><strong class="select_and_drag-effect_label"></strong>
    <select><select><span class="select_and_drag-drag_handle drag_handle">✥</span>
    <span class="select_and_drag-description_label"></span>
    </label>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, effectLabel, descriptionLabel, setDragDataFN) {
        super(parentAPI);
        this._setDragDataFN = setDragDataFN;
        [this.element, this._selectElement] = this.initTemplate(effectLabel, descriptionLabel);
    }
    initTemplate(effectLabel, descriptionLabel) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , selectElement = frag.querySelector('select')
          , effectLabelContainer = frag.querySelector('.select_and_drag-effect_label')
          , descriptionLabelContainer = frag.querySelector('.select_and_drag-description_label')
          , dragHandleElement = frag.querySelector('.select_and_drag-drag_handle')
          ;
        effectLabelContainer.textContent = effectLabel;
        descriptionLabelContainer.textContent = descriptionLabel;
        this._insertElement(element);

        dragHandleElement.setAttribute('draggable', 'true');
        dragHandleElement.addEventListener('dragstart', this._dragstartHandler.bind(this));
        dragHandleElement.addEventListener('dragend', this._dragendHandler.bind(this));

        return [element, selectElement];
    }

    _dragstartHandler(event) {
        const actorType = this._selectElement.value;
        // E.g. like this:
        // function setDragDataFN(dataTransfer, selectedValue) {
        //     dataTransfer.setData('text/plain', `[TypeRoof actor create: ${selectedValue}]`);
        //     dataTransfer.setData('application/x.typeroof-actor-create', `${selectedValue}`);
        // }
        this._setDragDataFN(event.dataTransfer,  actorType);

        event.currentTarget.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!

        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setDragImage(this._selectElement , 0 , 0);
    }

    _dragendHandler(event) {
        event.currentTarget.classList.remove('dragging');
    }

    update(changedMap) {
        if(changedMap.has('sourceTypes')) {
            const selected = this._selectElement.value
              , options = changedMap.get('sourceTypes')
              , optionElements  = []
              ;
            this._domTool.clear(this._selectElement);
            for(const [key, entry] of options) {
                optionElements.push(
                    this._domTool.createElement('option', {value: key}, entry.get('label').value));
            }
            this._selectElement.append(...optionElements);
            if(options.has(selected))
                this._selectElement.value = selected;
        }
    }
}

class StageManager extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="stage-manager">
    <h3>Stage Manager</h3>
    <div class="stage-manager_actors">(initial)</div>
</div>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        this._itemElements = new Map(/* Path: element*/);
        this._activePaths = new Set();
        this._removeDragIndicatorTimeoutId = null;
        [this.element, this._actorsElement] = this.initTemplate();
    }

    _onClickHandler(path) {
        this._changeState(()=>{
            // this is a toggle
            const editingActor = this.getEntry('editingActor');
            if(!editingActor.isEmpty && editingActor.value.equals(path))
                editingActor.clear();
            else
                editingActor.value = path;
        });
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , actors = frag.querySelector('.stage-manager_actors')
          ;
        this._insertElement(element);
        actors.addEventListener('dragleave', this._dragleaveHandler.bind(this));
        return [element, actors];
    }

    _dragstartHandler({path}, event) {
        event.dataTransfer.setData('text/plain', `[TypeRoof actor path: ${path}]`);
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_PATH, `${path}`);

        event.currentTarget.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(event.currentTarget.parentElement, 0 , 0);
    }

    _dragendHandler({path}, event) {
        event.currentTarget.classList.remove('dragging');
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [DATA_TRANSFER_TYPES.ACTOR_PATH, DATA_TRANSFER_TYPES.ACTOR_CREATE];
        for(const type of applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    _dragoverHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _getDropTargetInsertPosition(item, event) {
        if(item.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = item.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null){
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of this._actorsElement.querySelectorAll(`.${markedClass}`)) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for(const name of [...elem.classList]) {
                if(name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if(insertPosition === null)
            return;

        if(!['before', 'after', 'insert'].includes(insertPosition))
            throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            // return;

        const [elem, posClassSuffix] = insertPosition === 'before' && element.previousSibling
                ? [element.previousSibling, 'after']
                : [element, insertPosition]
                ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const {setTimeout} = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);

        const {path} = item
          , rootPath = Path.fromString(this.parentAPI.getExternalName('activeActors'))
          , targetPath = rootPath.append(...path)
          , insertPosition = this._getDropTargetInsertPosition(item, event)
          ;

        if(type === DATA_TRANSFER_TYPES.ACTOR_PATH) {
            const relativeSourcePath = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH)
              , sourcePath = rootPath.appendString(relativeSourcePath)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.ACTOR_CREATE) {
            const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_CREATE);
            return this._create(typeKey, targetPath, insertPosition);
        }
    }

    _create(typeKey, targetPath, insertPosition) {
        // console.log(`${this}._create typeKey: ${typeKey} targetPath ${targetPath} insertPosition: ${insertPosition}`);
        return this._changeState(()=>{
            const activeActors = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // is an 'ActorsModel' ('activeActors')
                // Ensure we take the dependencies for the create from the
                // correct element, even though, at the moment, the dependencies
                // are all identical, it may change at some point.
              , newActor = createActor(typeKey, activeActors.dependencies)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // targetParent === sourceParent and the targetKey could
                // change is circumvented.
                activeActors.push(newActor);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              ;
            if(insertPosition === 'after')
                activeActors.splice(targetIndex + 1, 0, newActor);
            else if(insertPosition === 'before')
                activeActors.splice(targetIndex, 0, newActor);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _move(sourcePath, targetPath, insertPosition) {
        // console.log(`${this}._move sourcePath: ${sourcePath} targetPath ${targetPath}`);
        const canMove = !sourcePath.isRootOf(targetPath);
        if(!canMove) {
            console.warn(`${this}._move can't move source into target as source path "${sourcePath}" is root of target path "${targetPath}".`);
            return;
        }

        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const activeActors = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // is an 'ActorsModel' ('activeActors')
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                activeActors.push(source);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;

            if(activeActors === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                activeActors.splice(insertIndex, 0, source);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                activeActors.splice(targetIndex + 1, 0, source);
            else if(insertPosition === 'before')
                activeActors.splice(targetIndex, 0, source);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _renderLayer(path, activeActors, state=null) {
        const container = this._domTool.createElement('ol');
        if(activeActors.size === 0) {
            // empty container
            const item = {path, isEmptyLayerContainer: true, isEmptyLayerItem: false};
            container.addEventListener('dragenter', this._dragenterHandler.bind(this, item));
            container.addEventListener('dragover', this._dragoverHandler.bind(this, item));
            container.addEventListener('drop', this._dropHandler.bind(this, item));
        } // else: see for ...
        for(const [key, actor] of activeActors) {
            const itemElement = this._domTool.createElement('li')
              , itemPath = path.append(key)
              , dragHandleElement = this._domTool.createElement('span', {'class': 'drag_handle'}, '✥')
              // used to check:  isLayerItem = getEntry(actor , Path.fromParts('actorTypeModel', 'typeClass')).value === LayerActorModel
              , isContainerItem = getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE
              , isEmptyLayerItem = isContainerItem
                    ? getEntry(actor, Path.fromParts('instance', 'activeActors')).size === 0
                    : false
              , item = {path: itemPath, isEmptyLayerContainer: false, isEmptyLayerItem}
              ;

            if(state) {
                itemElement.classList.add((state.counter % 2) ? 'even-row' : 'odd-row');
                itemElement.style.setProperty('--structural-depth', `${state.depth}`);
                state.counter += 1;
            }

            dragHandleElement.setAttribute('draggable', 'true');
            dragHandleElement.addEventListener('dragstart', this._dragstartHandler.bind(this, item));
            dragHandleElement.addEventListener('dragend', this._dragendHandler.bind(this, item));

            itemElement.addEventListener('dragenter', this._dragenterHandler.bind(this, item));
            itemElement.addEventListener('dragover', this._dragoverHandler.bind(this, item));
            itemElement.addEventListener('drop', this._dropHandler.bind(this, item));

            itemElement.append(dragHandleElement, ...this._renderActor(itemPath, actor, state));
            container.append(itemElement);
            this._itemElements.set(itemPath.toString(), itemElement);
        }
        return [container];
    }

    _renderActor(path, actor, state=null) {
        const actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
        //  , typeClass = actorTypeModel.get('typeClass').value
          , fragment = this._domTool.createFragmentFromHTML(`<button><span></span> <em></em></button>`)
          , result = [...fragment.childNodes]
          , button = fragment.querySelector('button')
          ;
        button.addEventListener('click', this._onClickHandler.bind(this, path));
        fragment.querySelector('span').textContent = typeLabel;
        button.setAttribute('title', `local path: ${path}`);
        if(getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE) {
            // used to be if(typeClass === LayerActorModel) {
            const activeActorsPath = Path.fromParts('instance', 'activeActors')
              , activeActors = getEntry(actor, activeActorsPath)
              , childrenPath = path.append(...activeActorsPath)
              ;
            if(state) state.depth += 1;
            result.push(...this._renderLayer(childrenPath, activeActors, state));
            if(state) state.depth -= 1;
        }
        return result;
    }

    _markActiveItems(...pathsToActivate) {
        for(const activePathStr of this._activePaths) {
            this._itemElements.get(activePathStr).classList.remove('active');
        }
        this._activePaths.clear();
        for(const activePath of pathsToActivate) {
            const activePathStr = activePath.toString();
            this._activePaths.add(activePathStr);
            this._itemElements.get(activePathStr).classList.add('active');
        }
    }

    update(changedMap) {
        const editingActor = changedMap.has('editingActor')
            ? changedMap.get('editingActor')
            : this.getEntry('editingActor')
            ;
        if(changedMap.has('activeActors')) {
            const activeActors = changedMap.get('activeActors')
              , basePath = Path.fromParts('./')
              ;
            this._domTool.clear(this._actorsElement);
            this._actorsElement.append(...this._renderLayer(basePath, activeActors, {counter: 0, depth: 0}));
            if(!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        }
        else if(changedMap.has('editingActor')) {
            this._markActiveItems(...(editingActor.isEmpty ? [] : [editingActor.value]));
        }
    }
}

class WasteBasketDropTarget extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
    // jshint ignore:start
        static TEMPLATE = `<div class="waste_basket_drop_target">
    <strong class="waste_basket_drop_target-effect_label"></strong>
    <span class="waste_basket_drop_target-main_drop_zone"></span>
    <span class="waste_basket_drop_target-description_label"></span>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, effectLabel, descriptionLabel, applicableTypes) {
        super(parentAPI);
        this._applicableTypes = applicableTypes;
        [this.element] = this.initTemplate(effectLabel, descriptionLabel);
    }
    initTemplate(effectLabel, descriptionLabel) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , effectLabelContainer = element.querySelector('.waste_basket_drop_target-effect_label')
          , descriptionLabelContainer = element.querySelector('.waste_basket_drop_target-description_label')
          ;
        effectLabelContainer.textContent = effectLabel;
        descriptionLabelContainer.textContent = descriptionLabel;
        this._insertElement(element);

        element.addEventListener('dragenter', this._dragenterHandler.bind(this));
        element.addEventListener('dragover', this._dragoverHandler.bind(this));
        element.addEventListener('dragleave', this._dragleaveHandler.bind(this));
        element.addEventListener('drop', this._dropHandler.bind(this));
        return [element];
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        for(const type of this._applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    _dragenterHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        this.element.classList.add(`waste_basket_drop_target-receptive`);
    }

    _dragoverHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        this.element.classList.add(`waste_basket_drop_target-receptive`);
    }

    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        this.element.classList.remove(`waste_basket_drop_target-receptive`);
        // const {setTimeout} = this._domTool.window;
        // this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(event) {
        this.element.classList.remove(`waste_basket_drop_target-receptive`);
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        // just a safeguard, but not helping for reusability!
        if(type !== DATA_TRANSFER_TYPES.ACTOR_PATH)
            throw new Error(`NOT IMPLEMENTED ${this}._dropHandler don't know how to handle type "${type}".`);
        return this._changeState(()=>{
            const rootPath = Path.fromString(this.parentAPI.getExternalName('rootCollection'))
              , relativeSourcePath = event.dataTransfer.getData(type)
              , sourcePath = rootPath.appendString(relativeSourcePath)
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              ;

            // FIXME: This has too much destructive power in a way, E.g. we could
            // make sure that sourceParent is an ActorsModel, as the paths
            // could be spoofed in some way e.g. using  ./../../../../ in
            // the path.
            // rootPath.isRootOf is a good check, but it could still be
            // more specific.
            if(!rootPath.isRootOf(sourcePath))
                throw new Error(`PATH ERROR source path "${sourcePath}" (${relativeSourcePath}) is not contained in root path "${rootPath}"`);

            sourceParent.delete(sourceKey);
        });
    }
}


class CommonActorProperties extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="common_actor_properties">
    <h3><span class="common_actor_properties-actor-type">[Undefined Actor Type]</span> Actor Properties</h3>
    <h4>Inherited Properties</h4>
    <ol class="common_actor_properties-list common_actor_properties-list-inherited"></ol>
    <h4>Own Properties</h4>
    <ol class="common_actor_properties-list common_actor_properties-list-own"></ol>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, typeKey) {
        super(parentAPI);
        this._typeKey = typeKey;
        this._baseClass = 'common_actor_properties';
        this._isTypographic = null;
        [this.element, this.inheritedPropertiesContainer, this.ownPropertiesContainer] = this.initTemplate();
        this.ownProperties = new Set();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , inheritedPropertiesContainer = element.querySelector(`.${this._baseClass}-list-inherited`)
          , ownPropertiesContainer = element.querySelector(`.${this._baseClass}-list-own`)
          ;
        element.querySelector(`.${this._baseClass}-actor-type`).textContent = this._typeKey;
        this._insertElement(element);
        return [element, inheritedPropertiesContainer, ownPropertiesContainer];
    }

    _createTextValueElement(key, value) {
        const valueText = typeof value === 'boolean'
                            ? (value && 'True' || 'False')
                              // undefined.toString raises ...
                            : value !== undefined ? value.toString() : 'undefined'
          , valueContainer = this._domTool.createElement(
                              'span'
                            , {'class': `${this._baseClass}-value-text`}
                            , valueText)
          ;
        return valueContainer;
    }

    _createColorValueElement(key, value) {
        const valueContainer = this._domTool.createElement('span')
          , colorCss = culoriFormatCss(value)
          , colorPatch = this._domTool.createElement(
                        'span'
                      , {'class': [
                                `${this._baseClass}-value-color_patch`
                                // Has an indicator for transparency
                                // and implements :hover to enlarge the
                                // sample.
                              , 'ui_color_patch'
                              , 'ui_color_patch-has_color'
                              ].join(' ')
                        })
          , textContainer = this._createTextValueElement(key, colorCss)
          ;
        colorPatch.style.setProperty(`--color`, colorCss);
        valueContainer.append(colorPatch, textContainer);
        return valueContainer;
    }

    // NOTE: copied from AnimationInfo
    _createBasicDisplayElement(key, value, label=null) {
        const [type, valueContainer] = key.startsWith('colors/') && typeof value === 'object'
                    ? ['color', this._createColorValueElement(key, value)]
                    : ['text', this._createTextValueElement(key, value)]
          , labelContainer = this._domTool.createElement(
                    'span'
                    , {'class': `${this._baseClass}-label`}
                    , label !== null ? label : key
            )
          , container = this._domTool.createElement(
                    'li'
                    , {'class': [
                                `${this._baseClass}-item`
                              , `${this._baseClass}-item-type_${type}`
                              ].join(' ')}
                    , [labelContainer, ' ' , valueContainer]
            )
          ;
        valueContainer.classList.add(`${this._baseClass}-value`);
        return [container, valueContainer];
    }

    update(changedMap) {
        if(changedMap.has('keyMoments')) {
            // update own properties
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , localPropertyNames = animationProperties.animanion.localPropertyNames
              ;
            this.ownProperties.clear();
            for(const localPropertyName of localPropertyNames)
                this.ownProperties.add(localPropertyName);
        }

        // TODO: AnimationInfo has a more holistic handling than this.
        // TODO globalT/animationProperties dependencies need to be straightened
        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              // , propertyValuesMap = animationProperties.propertyValuesMap
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , ownPropertiesChildren = []
              , inheritedPropertiesChildren = []
              ;
            for(const [property, value] of propertyValuesMap) {
                const target = this.ownProperties.has(property)
                                        ? ownPropertiesChildren
                                        : inheritedPropertiesChildren
                                        ;

                const [color, consumed] = getColorFromPropertyValuesMap(property, propertyValuesMap);
                if(color !== null) {
                    const [elem] = this._createBasicDisplayElement(property, color);
                    target.push(elem);
                }
                if(consumed)
                    continue;
                if(property.startsWith('color/'))
                // else: treat it like a full color will be deprecated ...
                    console.warn(`DEPRECATED: rendering color ${property}:`, value);

                const [elem] = this._createBasicDisplayElement(property, value);
                target.push(elem);
            }
            this.ownPropertiesContainer.replaceChildren(...ownPropertiesChildren);
            this.inheritedPropertiesContainer.replaceChildren(...inheritedPropertiesChildren);
        }
    }
}

// Used to be "KeyMomentsTimeline" in example-key-moments, but the name
// was not fitting anyways and this also lost the buttons to select the
// active keyMoments.
class KeyMomentsControls extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="key_moments_controls">
        <h3>Key-Moments Controls</h3>
        <div>
            <button class="key_moments_controls-add_moment" title="Add Moment">+ add</button><!--
            --><button class="key_moments_controls-remove_moment" title="Remove Active Moment">- remove</button><!--
            --><button class="key_moments_controls-insert_moment" title="Insert Moment at t">⎀ insert</button>
        </div>
        <div>
            <button class="key_moments_controls-select_previous" title="Select Previous">⇤ select previous</button><!--
            --><button class="key_moments_controls-select_next" title="Select Next">select next ⇥</button>
        </div>
</div>`;
    static KEY_MOMENT_BUTTON_TEMPLATE=`<li>
    <button class="key_moments_controls-button" title="Select"></button>
</li>`;
    //jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element, this.addButton, this.removeButton
            , this.previousButton, this.nextButton] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , addButton = element.querySelector('.key_moments_controls-add_moment')
          , insertButton = element.querySelector('.key_moments_controls-insert_moment')
          , removeButton = element.querySelector('.key_moments_controls-remove_moment')
          , previousButton = element.querySelector('.key_moments_controls-select_previous')
          , nextButton = element.querySelector('.key_moments_controls-select_next')
          ;

        insertButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{

            const keyMoments = this.getEntry('keyMoments')
              // , t = this.getEntry(this.parentAPI.rootPath.append('t')).value
              // , liveProperties = this.parentAPI.getWidgetById('AnimationLiveProperties')
              , liveProperties = this.getEntry('@animationProperties')
              , t = liveProperties.t
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newMoment = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
              , [insertIndex, newMomentDuration, afterMoment
                    , newAfterMomentDuration
                ] = this._getInsertParameters(keyMoments, liveProperties, t)
                // Starting with "before index" here, meaning: "afterIndex - 1".
              , label = createLabelForKeyMoment(keyMoments, Math.max(0, parseFloat(insertIndex, 10) - 1))
                // Setting the properties for t and not setting the properties,
                // leaving them undefined, must have -- in this insert-situation
                // -- the same effect on the animation. These are just two different
                // approaches and the better approach should be determined by
                // considering usability. But, considering that a moment is
                // inserted, let's for now assume that capturing the "active"
                // properties is a feature, otherwise they could be hand-captured
                // by using the "set explicitly" button of each axis.
                // NOTE: In the future, it will be interestig e.g. to split
                // easing definitions in half!
              , newMomentProperties = liveProperties.getPropertyValuesMapForLocalT(t)
              ;
            const models = {};
            for(const [path_, value] of newMomentProperties) {
                // TODO: this is very specific behavior for the actual
                // KeyMoment type, and as such, it should probably be
                // rather attached to the implementation. Detached like
                // this, it will likely be forgotten to be updated.
                // Also, is kind related to the REGISTERED_GENERIC_KEYMOMENT_FIELDS
                // as these are not yet considered in here at all.
                // maybe move all of that into stage-registered-properties/REGISTERED_PROPERTIES
                if(path_.startsWith('numericProperties/')) {
                    if(!Object.hasOwn(models ,'numericProperties'))
                        models.numericProperties = getEntry(newMoment, 'numericProperties');
                    const propertyName = Path.fromString(path_).parts.at(-1);
                    models.numericProperties.setSimpleValue(propertyName, value);
                }
                else if(path_.startsWith('colors/')) {
                    // This would be working code, inserting the current colors
                    // initialized into the newMoment, without changing
                    // the appearance of the animation. However, it's probably
                    // better to have a new KeyMoment as empty as possible.
                    // Instead, a color can be inserted by initializing the
                    // desired model.

                    // const propertyName = Path.fromString(path_).parts.at(1)
                    //   , [colorObject, ] = _getColorFromPropertyValuesMap(path_, newMomentProperties)
                    //   , color = colorObject !== null ? culoriToColor(colorObject, newMoment.dependencies) : null
                    //   ;
                    // if(color !== null)
                    //     newMoment.set(propertyName, color);
                    continue;
                }

                else if(!_keyMomentsImplementsTypography(keyMoments))
                    // FIXME: This is not a well extensible way of coding this.
                    continue;
                else if(path_.startsWith('axesLocations/')) {
                    // only if available in these keyMoments (e.g. in TypographicKeyMomnets)
                    // CAUTION: opsz/autoOPSZ requires special treatment!
                    if(!Object.hasOwn(models ,'axesLocations'))
                        models.axesLocations = getEntry(newMoment, 'axesLocations');
                    const axisTag = Path.fromString(path_).parts.at(-1);
                    models.axesLocations.setSimpleValue(axisTag, value);
                }
                else if(path_ === 'fontSize')
                    // Only fontSize so far.
                    newMoment.get(path_).value = value;
                else
                    // FIXME: We trigger this with e.g. generic/charGroup
                    // of the videoproof-array actor but that has a default
                    // behavior of keeping the isEmpty setting which is OK.
                    // Leaving this comment here to support my call for
                    // a better handling of all of this from above.
                    console.warn(`NOT IMPLEMENTED property "${path_}" in ${this} insertButton.`);
            }
            if(newMomentDuration !== null)
                newMoment.get('duration').value = newMomentDuration;
            newMoment.get('label').value = label;
            if(afterMoment !== null && newAfterMomentDuration !== null)
                afterMoment.get('duration').value = newAfterMomentDuration;
            keyMoments.splice(insertIndex, 0, newMoment);
        }));

        // The add button, its functionality, is not totally wrong, so
        // I keep it here for now and add alongside the "insert" button.
        // TODO: However, as it is right now, I prefer to add an empty/initial
        // keyMoment, rather than a copy of the current Moment.
        addButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = Array.from(keyMoments)
                    .filter(([key, keyMoment])=>keyMoment.get('isActive').value)
                // last selected moment
              , activeKey = activeKeyMoments.size
                    // uses the logically/absolute last by value
                    ? activeKeyMoments.at(-1)[0]
                    : null
              ;

            const index =  activeKey !== null
                    // Insert after active entry.
                    ? parseInt(activeKey, 10) + 1
                    // just insert at end
                    : keyMoments.size
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newEntry = keyMoments.constructor.Model.createPrimalDraft(keyMoments.dependencies)
                // This would create a copy of the active entry.
                // Not sure if unwrapPotentialWriteProxy is required, but it doesn't hurt.
                // Decided against the copy:
                // newEntry = unwrapPotentialWriteProxy(keyMoments.get(activeKey))
              ;

            // insert
            newEntry.get('isActive').value = true;
            newEntry.get('label').value = createLabelForKeyMoment(keyMoments, index);
            keyMoments.splice(index, 0, newEntry);
        }));

        removeButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeys = Array.from(keyMoments)
                    .filter(([key, keyMoment])=>keyMoment.get('isActive').value)
                    .map(([key/*, keyMoment*/])=>key)
                    // delete higher indexes first, so lower indexes stay valid
                    .reverse()
              ;
            for(const key of activeKeys)
                keyMoments.delete(key);
        }));

        const _changeActiveMoment = changeAmount=>{
            if(changeAmount === 0)
                return;
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = Array.from(keyMoments)
                    .filter(([key, keyMoment])=>keyMoment.get('isActive').value)
              , size = keyMoments.size
              ;
            if(size === 0)
                return;
            const maxIndex = size - 1;
            if(activeKeyMoments.size === 0) {
                // Nothing selected, pick first or last
                let newIndex = (changeAmount > 0)
                        // (maxIndex + 1) % size === 0
                        ? (maxIndex + changeAmount) % size
                        // (size - 1) % size = maxIndex
                        : (size + changeAmount) % size
                        ;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;

                keyMoments.get(`${newIndex}`).get('isActive').value = true;
                return;
            }
            // change all
            const newActiveKeys = new Set();
            // prepare
            for(const [key/*,activeKeyMoment*/] of activeKeyMoments) {
                let newIndex = (parseInt(key, 10) + changeAmount) % size;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;
                newActiveKeys.add(`${newIndex}`);
            }
            for(const [key, keyMoment] of keyMoments)
                keyMoment.get('isActive').value = newActiveKeys.has(key);
        };
        previousButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(-1);
        }));
        nextButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(+1);
        }));

        this._insertElement(element);
        return [element, addButton, removeButton
              , previousButton, nextButton];
    }

    _getInsertParameters(keyMoments, liveProperties, t) {
            const absoluteT = t * liveProperties.fullDuration
                // - for t, get the absoluteT
                // - get the keyMoment after
              , momentTs = [...liveProperties.tToKeyMoments.keys()]
              , [leftIndex, rightIndex] = binarySearch(momentTs, absoluteT)
              , leftT = momentTs[leftIndex]
              , rightT = momentTs[rightIndex]
              ;

            // return values
            let insertIndex
              , newMomentDuration = null
              , newAfterMomentDuration = null
              , afterMoment = null
              ;
            if(leftIndex === null && rightIndex === null) {
                // No moments at all.
                // Just insert a blank, new, KeymomentMoment
                insertIndex = 0;
                newMomentDuration = null; // As per coherence function (will be 1).
                newAfterMomentDuration = null;
                afterMoment = null;

            }
            else if(leftIndex === null) {
                // leftIndex === null: t is bigger than/right of the last entry.
                //          Because absoluteT > momentTs[rightIndex]
                //          Assert: Must be a loop, otherwise there is no
                //                  right of last entry...
                //          Assert rightIndex === 0
                //          This will create a new last KeyMoment,
                //          but it will change the duration of the first
                //          keyMoment.
                // insert at the end
                afterMoment = keyMoments.get(0);
                insertIndex = keyMoments.size;
                // change first KeyMoment, as its duration closes the loop
                newMomentDuration = absoluteT - rightT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            else if(rightIndex === null) {
                // We're left from the first index,
                // This is not supposed to happen, because we use all
                // existing KeyMoments, not a subset and there is no
                // time before the first KeyMoment.
                throw new Error(`Assertion Failed, rightIndex must not be null.`);
            }
            else if (leftIndex === rightIndex) {
                //           Interesting since we can have possibly different in and
                //           out values when there are multiple moments at this position.
                //           We are directly on an existing momentT.
                //           Do we insert before or after?
                // Here the add-button allows for more control, but we can
                // just insert insert empty, after with a duration of 0.
                // But, since this method is changing the duration of the
                // after moment usually, it's maybe more intuitiv to insert
                // before. The way, properties are applied to the new moment,
                // via liveProperties, favors inserting after, it's jsut
                // simpler for now.
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT).at(-1);
                afterMoment = null;// Not required, doesn't change: keyMoments.get(afterIndex);
                insertIndex = parseInt(afterIndex,10) + 1;
                newMomentDuration = 0;
                newAfterMomentDuration = null; // don't change
            }
            else { // leftIndex !== rightIndex
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT)[0];
                afterMoment = keyMoments.get(afterIndex);
                insertIndex = afterIndex;
                newMomentDuration = absoluteT - leftT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            return [insertIndex, newMomentDuration, afterMoment, newAfterMomentDuration];
    }

    // FIXME: looking at the implementation, I'm not sure why UPDATE_STRATEGY_COMPARE
    // is chosen in here, but, the main dependency is a list, and hence
    // UPDATE_STRATEGY_COMPARE could cause less effort to update the element,
    // it is just not implemented so far. I leave this here as an example
    // how to turn UPDATE_STRATEGY_COMPARE into UPDATE_STRATEGY_SIMPLE
    initialUpdate(rootState) {
        const compareResult = StateComparison.createInitial(rootState, this.parentAPI.wrapper.dependencyMapping);
        this.update(compareResult);
    }

    update(compareResult) {
        // console.log(`${this.constructor.name}.update(compareResult):`, compareResult);
        // compareResult.toLog();
        // console.log('dependencyMapping', this.parentAPI.wrapper.dependencyMapping);
        const changedMap = this._getChangedMapFromCompareResult(compareResult);
        // console.log('compareResult.getChangedMap(this.parentAPI.wrapper.dependencyMapping)', changedMap);
        // console.log('compareResult.getDetaislMap()', compareResult.getDetaislMap());

        // TODO: try out changing based on LIST_NEW_ORDER state
        if(changedMap.has('keyMoments')) {
            const keyMoments = changedMap.get('keyMoments');
            this.previousButton.disabled = keyMoments.size < 2;
            this.nextButton.disabled = keyMoments.size < 2;
        }
    }
}

export class ToggleKeyMomentButton extends _BaseComponent {
    // jshint ignore:start
    static baseClass = 'ui_toggle_key_moment_button';
    // jshint ignore:end

    constructor(parentAPI) {
        super(parentAPI);
        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass}`
              , title: 'Select this Key-Moment for editing.'
            }, '(initializing)');
        this._insertElement(this.element);
        this.element.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const entry = this.getEntry('boolean');
            entry.set(!entry.value);
        }));
    }

    update(changedMap) {
        if(changedMap.has('label'))
            this.element.textContent = changedMap.get('label').value;

        if(changedMap.has('boolean')) {
            const booleanValue = changedMap.get('boolean').value
              , _setActiveClass = elem=>elem.classList[booleanValue ? 'add' : 'remove']('active')
              ;
            _setActiveClass(this.element);
            _setActiveClass(this.parentAPI.wrapper.host);
        }
    }
}

// FIXME: not all types require all REGISTERED_PROPERTIES.NUMERIC
// e.g. Radius is nonsense for LineOfText, or basically for all except
// Circle. Children Time is only relevant for Layer and Stage, everything else
// doesn't have children. However, Font-Size should probably be in here,
// it doesn't seem to make much sense to treat it differently. However,
// Colors will be a different ballpark!
// Despite of different targets (fill, background, stroke, ... more?)
// we have the different models to specify (rgb+a, hsl+a) and similarly
// different ways to interpolate the compontents! having flat components
// in the key moments would make it cool to work within one model, but it
// would create a lot of entries and it's not yet fully clear to me how
// these would interpolate...
// Initially, this will be rough and we might have an property explosion,
// but we should work towards nice, color picker based interfaces.
// but what if I only want to modulate L (lightness) ...? The numeric
// properties model allows this, but when one keyMoment specifies RGB
// it's hard to only change L in top of that!.
// Ok, so the plan is to start with OKLCH then add OKLAB, interpolation
// considerations onlz start in step 2, when OKLCH and OKLAB are there,
// as interpolating between A and B will create another transition than
// between C and H
// Maybe we can start in step 2 using CSS color-mix(), then use the
// colorio library to rebuild the functionality for other targets, that
// e.g. only support rgba, like for an export without CSS support...



export class UINumericProperties extends _BaseComponent {
    constructor (parentAPI, getDefaults=null, requireUpdateDefaults=()=>false) {
        super(parentAPI);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._propertiesChangeHandler = this._changeStateHandler(this.__propertiesChangeHandler.bind(this));

        this.element = this._domTool.createElement('div',
                {class: 'numeric_properties'},
                this._domTool.createElement('h3', {}, 'Numeric Properties'));

        this._insertElement(this.element);
        this._propertiesInterfaces = new Map();
        this._insertedElements = [];

        this._localPropertyValues = {};
        this._numericProperties = null;

        this._initUI();
    }

    // could be static and stand alone
    _setOrReset(mapLike, key, value) {
        if(value === null)
            mapLike.delete(key);
        else
            mapLike.setSimpleValue(key, value);
    }
     /* Run within transaction context */
    __propertiesChangeHandler(key, value) {
        const numericProperties = this.getEntry('numericProperties');
        this._setOrReset(numericProperties, key, value);
    }

    _cleanUp() {
        this._localPropertyValues = {};
        for(const ui of this._propertiesInterfaces.values())
            ui.destroy();
        this._propertiesInterfaces.clear();

        for(const element of this._insertedElements)
            this._domTool.removeNode(element);
        this._insertedElements.splice(0, Infinity);
    }

    _initUI() {
        const insertElement = (...elements)=>{
            this.element.append(...elements);
            this._insertedElements.push(...elements);
        };

        for(const key of this.propertiesKeys()) {
            if(this._propertiesInterfaces.has(key))
                //seen
                continue;
            const properties = {};
            for(const [k,v] of Object.entries(this.propertiesGet(key))){
                if(k === 'default') {
                    properties.value = v;
                    continue;
                }
                properties[k] = v;
            }
            if(!('name' in properties))
                properties.name = key;
            if(!('value' in properties))
                properties.value = 0;

            const {name, value:defaultVal} = properties;
            this._localPropertyValues[key] = defaultVal;

            const input = new PlainNumberAndRangeOrEmptyInput(
                this._domTool
                // numberChangeHandler
              , value=>this._propertiesChangeHandler(key, value)
                // toggleChangeHandler
              , ()=>{
                    const value = this._numericProperties.has(key)
                        ? null // if the property is defined delete
                        // if the property is not defined set default ...
                        : (this._getDefaults
                                    ? this._getDefaults(key, defaultVal)
                                    : defaultVal
                          )
                        ;
                    this._propertiesChangeHandler(key, value);
                }
              , name === key ? `${name}` :`${name} (${key})`
              , undefined
              , properties
            );

            insertElement(input.element);
            // console.log('_propertiesInterfaces set:', key, input);
            this._propertiesInterfaces.set(key, input);
        }
    }

    propertiesHas(key) {
        return REGISTERED_PROPERTIES.NUMERIC.has(key);
    }
    propertiesGet(key) {
        if(!this.propertiesHas(key))
            throw new Error(`KEY ERROR ${key} not found in REGISTERED_PROPERTIES.NUMERIC.`);
        return REGISTERED_PROPERTIES.NUMERIC.get(key);
    }

    propertiesKeys() {
        return REGISTERED_PROPERTIES.NUMERIC.keys();
    }

    *propertiesEntries() {
        for(const key of this.propertiesKeys())
            yield [key, this.propertiesGet(key)];
    }

    _getValueForProperty(key) {
        return this._numericProperties.has(key)
                    ? [true, this._numericProperties.get(key).value]
                    : [false, (this._getDefaults !== null
                            ? this._getDefaults(key, this.propertiesGet(key)['default'])
                            : this.propertiesGet(key)['default']
                            )
                      ]
                    ;
    }

    _updateValueToPropertyInterface(key, active, value) {
        if(!this._propertiesInterfaces.has(key))
            throw new Error(`KEY ERROR property interface for "${key}" not found.`);
        const widget = this._propertiesInterfaces.get(key);
        widget.update(active, value);
        this._localPropertyValues[key] = value;
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);

        if(changedMap.has('numericProperties') || requireUpdateDefaults) {
            const numericProperties = changedMap.has('numericProperties')
                                        ? changedMap.get('numericProperties')
                                        : this.getEntry('numericProperties')
                                        ;
            this._numericProperties = numericProperties;
            for(const key of this.propertiesKeys()) {
                const [active, value] = this._getValueForProperty(key);
                // It's interesting: in a way, the sub-ui's could listen
                // directly to their entry at axesLocations/{axisTag}
                // but on the other hand, because we want to set defaults
                // in here when nothing is in axesLocations and that requires
                // updating as well, we do it directly here.
                // Maybe there will be/is a nicer way to implement behavior
                // like this. I.e. when the entry is DELETED the UI knows
                // it's default and sets it by itself.
                this._updateValueToPropertyInterface(key, active, value);
            }
        }
    }
}

function getCuloriModeFromColor(colorOrColorType) {
    const color = (colorOrColorType instanceof _AbstractDynamicStructModel)
            ? colorOrColorType.wrapped
            : colorOrColorType
       , ColorType = (color instanceof _BaseColorModel)
            ? color.constructor
            : color
            ;
    if(!COLOR_TYPE_TO_CULORI_MODE.has(ColorType))
        throw new Error(`KEY ERROR can't determine culori-js color mode from colorOrColorType ${colorOrColorType}.`);
    return COLOR_TYPE_TO_CULORI_MODE.get(ColorType);
}

function colorToCulori(colorOrColorWrapper) {
    const color = (colorOrColorWrapper instanceof _AbstractDynamicStructModel)
            ? colorOrColorWrapper.wrapped
            : colorOrColorWrapper
      , mode = getCuloriModeFromColor(color)
      , culoriModeRanges = culoriGetMode(mode).ranges
      ;

    const culorijsColor = Object.fromEntries(Array.from(color.entries())
        .filter(([/*componentKey*/, component])=>!(component instanceof _AbstractSimpleOrEmptyModel && component.isEmpty))
        .map(([componentKey, component])=>{
            const culoriComponent = componentKey.toLowerCase()
              , fromRange = getMinMaxRangeFromType(component.constructor)
              , toRange = culoriModeRanges[culoriComponent]
                // If it's an _AbstractSimpleOrEmptyModel and it's empty, it will
                // raise here(!) but that should be taken care of by the caller.
              , value = component.value
              , culoriValue = mapValueToRange(value, fromRange, toRange)
              ;
            return [culoriComponent, culoriValue];
        }));
    culorijsColor.mode = mode;
    return culorijsColor;
}

class PlainNumberAndRangeColorInput extends PlainNumberAndRangeInput {
    //jshint ignore:start
    static TEMPLATE = `<div class="number_and_range_input number_and_range_color_input">
    <div class="number-and-range-input_value-box">
        <label><!-- insert: label --></label>
        <input type='number'  /><!-- insert: unit -->
    </div>
    <div class="number-and-range-input_color-bar">
        <input type='range' />
    </div>
</div>`;
    //jshint ignore:end
    constructor(...args) {
        super(...args);
        this._colorBarContainer = this.element.querySelector('.number-and-range-input_color-bar');
        this._canvas = this._domTool.createElement('canvas');
        this._colorBarContainer.append(this._canvas);
        this._ctx = this._canvas.getContext('2d', {colorSpace: 'display-p3'});
    }
}

export class PlainColorComponentOrEmptyInput {
    constructor(domTool, baseClass='ui_color_component') {
        this._domTool = domTool;
        this._baseClass = baseClass;
        this._componentKey = null;

        this._uiNumber = new PlainNumberAndRangeColorInput(this._domTool
                , (...args)=>this._changeHandler(...args)
                , '', '', {});

        this._uiToggle = new PlainToggleButton(this._domTool
          , (...args)=>this._toggleHandler(...args)
          , 'toggle', 'set explicitly' , 'unset'
          , 'Toggle explicit color component input or set empty.');

        // Better for styling and the way PlainNumberAndRangeColorInput
        // is created allows it.
        this.element = this._uiNumber.element;

        this.element.classList.add(this._baseClass);
        this.element.append(/*this._uiNumber.element,*/ this._uiToggle.element);
        this._changeHandler = null;
        this._toggleHandler = null;
    }
    getComponentClassFragment(componentKey) {
        return componentKey.toLowerCase();
    }

    _renderColorStrip (componentKey, culoriColor) {
        const ranges= culoriGetMode(culoriColor.mode).ranges;
        // ranges = {
        //     "l": [0, 1],
        //     "a": [-0.4, 0.4],
        //     "b": [-0.4, 0.4],
        //     "alpha": [0, 1]
        // }
        const container = this._uiNumber._colorBarContainer
          , width = container.scrollWidth
          , height = container.scrollHeight
          , ctx = this._uiNumber._ctx
          , canvas = this._uiNumber._canvas
          , componentRange = ranges[componentKey]
          , colors = componentRange.map(value=>({...culoriColor, [componentKey]:value}))
          , interpolateArgs = [colors, culoriColor.mode]
          , hueInterpolationMethod = componentKey === 'h' ? 'longer hue' : false
          ;
        const HUE_INTERPOLATION_METHODS = new Map([
                ['shorter hue', fixupHueShorter]
              , ['longer hue', fixupHueLonger]
              , ['increasing hue', fixupHueDecreasing]
              , ['decreasing hue', fixupHueIncreasing]
        ]);
        if(hueInterpolationMethod) {
            if(!HUE_INTERPOLATION_METHODS.has(hueInterpolationMethod))
                console.error(`KEY ERROR unkown hueInterpolationMethod "${hueInterpolationMethod}".`);
            interpolateArgs.push({h: {fixup: HUE_INTERPOLATION_METHODS.get(hueInterpolationMethod)}});
            // Bummer, this is annoying: seems like culori does a toValue % maxValue (=== 360)
            // which leaves for interpolation from === 0 and to === 0
            // hence, the direction is irrelevant.
            colors[1].h -= Number.EPSILON * 1000;
        }
        const interpolator = culoriInterpolate(...interpolateArgs);
        if(canvas.width !== width) {
            canvas.width = width;
            canvas.style.setProperty('--width', `${width}px`);
        }
        // CAUTUION: Since height === container.scrollHeight
        // the continer will grow on each update, adding the current
        // canvas height to the new canvas height. That means, the
        // canvas must be positioned absolutely, to not interact with
        // container.scrollHeight.
        if(canvas.height !== height) {
            canvas.height = height;
            canvas.style.setProperty('--height', `${height}px`);
        }

        if(ctx.reset)
            ctx.reset();
        else
            // Safari doesn't have ctx.reset, below would work universally though.
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        for(let x=0;x<width;x++) {
            const t = x/(width-1);
            ctx.fillStyle = culoriFormatCss( interpolator(t) );
            ctx.fillRect(x, 0, 1, height);
        }
    }

    update(componentKey, color, changeHandler, toggleHandler, culoriColor, defaultValue=0) {
        this._componentKey = componentKey;
        for(const className of [...this.element.classList]) {
            if(className.startsWith(`${this._baseClass}-`))
                this.element.classList.remove(className);
        }

        const component = color.get(componentKey);
        let unit = null;
        if(PECENTAGE_UNIT_NUMBER_TYPES.has(component.constructor))
            unit = '%';
        else if(TURN_UNIT_NUMBER_TYPES.has(component.constructor))
            unit = 'turn';

        const ValueModel = component instanceof _AbstractSimpleOrEmptyModel
                ? component.constructor.Model
                : component.constructor
                ;
        const min = ValueModel.minVal
          , max = ValueModel.maxVal
          , toFixedDigits = ValueModel.toFixedDigits
          , cleanDefaultValue = toFixedDigits !== null
                    ? parseFloat(defaultValue.toFixed(toFixedDigits))
                    : defaultValue
          ;
        this._uiNumber.updateTemplateVars(componentKey, unit, {min, max, 'default': ValueModel.defaultValue});

        if(component.isEmpty) {
            this._uiNumber.update(cleanDefaultValue);
            this._uiNumber.passive = true;
            this._uiToggle.update(true);
        }
        else {
            this._uiNumber.update(component.value);
            this._uiNumber.passive = false;
            this._uiToggle.update(false);
        }

        this.element.classList.add(`${this._baseClass}-${this.getComponentClassFragment(componentKey)}`);

        this._changeHandler = changeHandler;
        this._toggleHandler = toggleHandler;
        this._renderColorStrip(componentKey.toLowerCase(), culoriColor);
    }
    destroy(){}
}

function _getNumberInstanceDefault(numberInstance, defaultVal=_NOTDEF) {
    if(numberInstance.constructor.Model.defaultValue !== null)
        return numberInstance.constructor.Model.defaultValue;
    if(defaultVal !== _NOTDEF)
        return _NOTDEF;
    throw new Error(`KEY ERROR default value not found for ${numberInstance}.`);
}

class UIColorComponentRanges extends _BaseComponent {
    //jshint ignore:start
        static TEMPLATE = `<div class="ui_color_component_ranges">
</div>`;
    //jshint ignore:end
     constructor (parentAPI, getDefaults=null, requireUpdateDefaults=()=>false) {
        super(parentAPI);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._components = [];
        [this.element] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return [element];
    }

    _createComponent() {
        const component = new PlainColorComponentOrEmptyInput(this._domTool);
        this.element.append(component.element);
        return component;
    }

    _componentToggleHandler(componentKey) {
        this._changeState(()=>{
            const color = this.getEntry('color')
              , component = color.get(componentKey)
              ;
            if(!component.isEmpty){
                component.clear();
            }
            else {
                const [defaultColor, ] = this._getDefaultColor(color)
                  , defaultValue = Object.hasOwn(defaultColor, componentKey)
                      ? defaultColor[componentKey]
                      : _getNumberInstanceDefault(component, 0)
                  ;
                component.set(defaultValue);
            }
        });
    }

    _componentChangeHandler(componentKey, newValue/*, ...args*/) {
        this._changeState(()=>{
            const color = this.getEntry('color')
              , component = color.get(componentKey)
              ;
            component.set(newValue);
        });
    }

    _updateComponent(i, componentKey, color, culoriColor, defaultValue) {
        const component = this._components[i];
        component.update(
                componentKey
              , color
               // set change handlers
              , this._componentChangeHandler.bind(this, componentKey)
              , this._componentToggleHandler.bind(this, componentKey)
              , culoriColor
              , defaultValue
        );
    }

    _getDefaultColor(color) {
        const defaultCuloriColor = this._getDefaults()
          , mode = getCuloriModeFromColor(color)
          , defaultConvertedCuloriColor = _convertCuloriColorMode(defaultCuloriColor, mode)
            // has no 'mode' as the values are not compatible with culori anymore
          , defaultColor = culoriValuesToColorValuesRange(defaultConvertedCuloriColor)
          ;
        return [defaultColor, defaultConvertedCuloriColor];
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('color') || requireUpdateDefaults) {
            const color = (changedMap.has('color')
                            ? changedMap.get('color')
                            : this.getEntry('color')
                        ).wrapped
              , [defaultColor, defaultCuloriColor] = this._getDefaultColor(color)
              , explicitCuloriColor = colorToCulori(color)
                // Used to be just defaultCuloriColor. This way,
                // if defaultCuloriColor is missning any components we can
                // use them from explicitCuloriColor, which improves the
                // rendereing of the color strips. E.g. in oklch, when
                // c is 0 or missing but h has a value, it still renders
                // the c strip as if h was 0 e.g. a pink transition instead
                // of e.g. green. This is, because currently the interpolation
                // color space is oklab, and when the source oklch c is 0
                // the translation to oklab and then back to oklch drops
                // the value for h: when a = 0 and b = 0, there's just 0
                // for h, and that is even ommitted. We merge in the original
                // color to get the h value it actually specifies, and to
                // get the other values that it may not specify explicitly
                // but inherit from default, e.g. l would surive the conversions
                // between oklab and oklch.
              , culoriColor = Object.assign({}, defaultCuloriColor, explicitCuloriColor)
              ;
            let size = 0;
            for(const [i, componentKey] of enumerate(color.keys())) {
                size += 1;
                if(!this._components[i])
                    this._components.push(this._createComponent());
                const defaultValue = Object.hasOwn(defaultColor, componentKey)
                        ? defaultColor[componentKey]
                        : _getNumberInstanceDefault(color.get(componentKey), 0)
                        ;
                this._updateComponent(i, componentKey, color, culoriColor, defaultValue);
            }
            while(this._components.length > size) {
                const component = this._components.pop();
                component.element.remove();
                component.element.destroy();
            }
        }
    }
}

class UIColorPatch extends _BaseComponent{
     constructor (parentAPI, getDefaults, requireUpdateDefaults, elementTag='div') {
        super(parentAPI);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        [this.element] = this.initTemplate(elementTag);
    }

    initTemplate(elementTag) {
        const element =  this._domTool.createElement(
                                elementTag, {'class': 'ui_color_patch'});
        this._insertElement(element);
        return [element];
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('color') || requireUpdateDefaults) {
            const defaultCuloriColor = this._getDefaults()
              , color = changedMap.has('color')
                            ? changedMap.get('color')
                            : this.getEntry('color')
              ;
            if(color.hasWrapped) {
                this.element.classList.add(`ui_color_patch-has_color`);
                this.element.classList.remove(`ui_color_patch-no_color`);
                // Always display the complete color if a color is set
                // used to be: colorToCss(color.wrapped));
                this.element.style.setProperty('--color',culoriFormatCss(defaultCuloriColor));
            }
            else {
                this.element.classList.remove(`ui_color_patch-has_color`);
                this.element.classList.add(`ui_color_patch-no_color`);
                this.element.style.removeProperty('--color');
            }
        }
    }
}

class UIColorChooser extends _BaseContainerComponent {
    constructor(parentAPI, _zones, label, getDefaults, updateDefaultsDependencies, requireUpdateDefaults) {
        // This widget should be potentially collapsed and only show a
        // label and tile of the color/none-color
        const baseClass = 'ui_color_chooser'
          , localZoneElement = parentAPI.domTool.createElement(
                                    'div', {'class': baseClass})
          , labelZoneElement = parentAPI.domTool.createElement('label', {'class': `${baseClass}-label_toggle`})
          , zones = new Map([..._zones
                        , ['local', localZoneElement]
                        , ['label', labelZoneElement]
            ])
          ;

        super(parentAPI, zones);
        this._container = localZoneElement;
        this._visibleClass = 'settings_visible';
        this._hiddenClass = 'settings_hidden';
        this._displaySettings = false;
        this._toggleSettingsVisibilityClasses();

        this._getDefaults = getDefaults;
        const activationTest = ()=>{
                if(!this._displaySettings)
                    return false;
                const testResult = this.parentAPI.getEntry(this.parentAPI.rootPath)
                                    .get('colorTypeKey').value !== ForeignKey.NULL;
                // console.log(`${this} activationTest:`, testResult
                //      , 'for:', parentAPI.rootPath.toString(), '<<>>'
                //      , this.parentAPI.getEntry(this.parentAPI.rootPath)
                //                    .get('colorTypeKey').value);
                return testResult;
            }
          , widgets = [
            // label: TODO get a proper human readable label into here
            // <h2>Color ${this.parentAPI.rootPath.parts.pop()}</h2>
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {
                    zone: 'local'
                  , onInit: widget=>widget.node.addEventListener('click', this._toggleOptionsHandler.bind(this))
                }
              , []
              , StaticNode
              , labelZoneElement
            ]
          , [
                {zone: 'label'}
              , []
              , StaticNode
              , this._domTool.createElement('span', null, label)
            ]
          , [
                {zone: 'label'}
              , [
                    ['instance', 'color']
                  , ...updateDefaultsDependencies
                ]
              , UIColorPatch
              , getDefaults, requireUpdateDefaults
              , 'span'
            ]
          , [
                {
                    zone: 'local'
                  , activationTest: ()=>this._displaySettings
                }
              , [
                    ['availableColorTypes', 'options']
                  , ['colorTypeKey', 'value']
                ]
              , GenericSelect
              , 'ui_color_model_select'// baseClass
              , 'Color Mode'// labelContent
              , (key, availableColorType)=>{ return availableColorType.get('label').value; } // optionGetLabel
              , [true, '(no color)', ForeignKey.NULL] // [allowNull, allowNullLabel]
                // changing this should convert the previous color mode to the
                // new color mode, using colori!
              , this._changeColorModeHandler.bind(this) // onChangeFn(newValue)
           ]
          ,[
                {zone: 'local', activationTest}
              , [
                    ['instance', 'color']
                  , ...updateDefaultsDependencies
                ]
              , UIColorComponentRanges
              , getDefaults, requireUpdateDefaults
           ]
        ];
        this._initWidgets(widgets);
    }
    _toggleSettingsVisibilityClasses() {
        const [addClass, removeClass] = this._displaySettings
                    ? [this._visibleClass, this._hiddenClass]
                    : [this._hiddenClass, this._visibleClass]
                    ;
        this._container.classList.add(addClass);
        this._container.classList.remove(removeClass);
    }
    _toggleOptionsHandler(/*evt*/) {
        // ideally:
        this._displaySettings = !this._displaySettings;
        this._toggleSettingsVisibilityClasses();
        // rerun ActivationTest ...
        const rootState = this.getEntry('/');
        this.initialUpdate(rootState);
    }
    _changeColorModeHandler(newValue) {
        // new Value is either a string, e.g. "OKLCH" or Symbol('NULL') === ForeignKey.NULL
        if(newValue === ForeignKey.NULL)
            return;
        const keyMomentDraft = this.getEntry(this.parentAPI.rootPath.parent)
          , colorFieldName = this.parentAPI.rootPath.parts.at(-1)
          , ColorType = availableColorTypes.get(newValue).value.get('typeClass').value
          , defaultCuloriColor = this._getDefaults(null)
          ;
        if(defaultCuloriColor === null)
            return;
        const culoriTargetMode = COLOR_TYPE_TO_CULORI_MODE.get(ColorType)
          , targetCuloriColor = _convertCuloriColorMode(defaultCuloriColor, culoriTargetMode)
          , color = culoriToColor(targetCuloriColor, keyMomentDraft.dependencies)
          ;
        keyMomentDraft.set(colorFieldName, color);
    }
}

// camelCase to camel_case
function deCamelize(str) {
    return str.replace(/(?:[A-Z])/g
        , (word, index)=>`${index === 0 ? '' : '_'}${word.toLowerCase()}`);
}


class UIMissingUIElement extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_missing-ui_element">
    <h4>Missing UI-Element</h4>
    <span class="ui_missing-ui_element-label"><!-- insert: label --></span>
    <span class="ui_missing-ui_element-full_key"><!-- insert: fullKey --></span>
    <span class="ui_missing-ui_element-type_name"><!-- insert: typeName --><span>
    <span class="ui_missing-ui_element-message"><!-- insert: message --><span>
</div>`;
    //jshint ignore:end
    constructor(parentAPI, typeName, message, fullKey, label) {
        super(parentAPI);
        [this.element] = this.initTemplate(typeName, message, fullKey, label);
    }
    initTemplate(typeName, message, fullKey, label) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        for(const [key, value] of Object.entries({typeName, message, fullKey, label}))
            this._domTool.insertAtMarkerComment(element, `insert: ${key}`, value);
        this._insertElement(element);
        return [element];
    }
}

/**
 * A parameter is the variable listed inside the parentheses in the
 * function definition. An argument is the actual value that is sent
 * to the function when it is called.
 */
class InjectDependency {
    constructor(name, payload=null, typeHint=_NOTDEF) {
        this.name = name;
        this.payload = payload;
        // TODO: the same name can mean a totally different thing.
        // We don't have real typing in here anyways, but this could be
        // a place to help/instruct the caller to insert the right argument.
        // This is just a stub, to suggest to a future me, that this could
        // be a goog place to implement.
        if(typeHint !== _NOTDEF)
            throw new Error(`NOT IMPLEMENTED ${this.constructor.name} "typeHint" argument `
                + `(value: ${typeHint.toString()}).`);
    }
    toString(){
        return `[${this.constructor.name}: ${this.name}]`;
    }
}
/**
 *See REGISTERED_GENERIC_KEYMOMENT_FIELDS, which currently acts as
 * an inventory list for this. The fields associated with the registered
 * names must be configurable with this method and it's caller.
 *
 * FIXME: this requires refactoring to make it generally useful/usable.
 * It can be very specific what a UIElement requires, so this is
 * also exploratory. Maybe we'll need another abstraction to define all
 * of this.
 * Also, based on the position of the UI in the app and also on the context
 * of the Model, a ModelType could be expected to be connected with a
 * different UIElement. This so far is to be used within KeyMomentController
 * for the properties of a single KeyMoment. However, even for different
 * KeyMoment Types, different UIElements could be expected/required.
 *
 * TODO: This is a powerful start for data driven automatic ui genration,
 * it will take a while to make this into a general principle.
 */
function genericTypeToUIElement(ModelType, defaultVal=_NOTDEF) {
    function require(...args) {
        return new InjectDependency(...args);
    }
    const valueUIElements = new Map([
            [StringModel, [UILineOfTextInput
                    , require('label')]]
          , [_AbstractEnumModel, [UISelectInput
                    , require('label'), require('items')]]
          , [CharGroupOptionsModel, [UISelectCharGroupInput
                    , CharGroupOptionsModel.charGroupsData, require('label')]]
          , [CharGroupModel, [UIGenericKeyMomentStructContainer
                    , require('settings:rootPath'), require('zones')
                    , require('parentInjectable')
                    , require('propertyRoot'), require('label')]]
          , [BooleanModel, [UIToggleButton
                    , require('settings:internalPropertyName', 'boolean')
                    , require('classToken')
                    , require('label', val=>`turn ${val} off`)
                    , require('label', val=>`turn ${val} on`)
                    , require('label', val=>`Toggle ${val}`)
                    ]]
          , [ColorModel, [UIColorChooser
                    , require('settings:rootPath'), require('zones')
                    , require('label')
                      // ColorModel is not OrEmpty, however it behaves
                      // similarly.
                    , require('getDefault')
                    , require('updateDefaultsDependencies')
                    , require('raw:requireUpdateDefaults')]]
        ])
      , valueOrEmptyUIElements = new Map([
            [StringModel, [UILineOfTextOrEmptyInput
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label')]]
          , [_AbstractEnumModel, [UISelectOrEmptyInput
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label'), require('items')]]
          , [CharGroupOptionsModel, [UISelectCharGroupOrEmptyInput
                    , require('getDefault'), require('requireUpdateDefaults')
                    , CharGroupOptionsModel.charGroupsData, require('label')]]
        ])
      ;
    // create some aliases ...
    for(const [alias, source] of [[BooleanDefaultTrueModel, BooleanModel]]){
        for(const elementsMap of [valueUIElements, valueOrEmptyUIElements])
            if(!elementsMap.has(alias) && elementsMap.has(source))
                elementsMap.set(alias, elementsMap.get(source));
    }
    const isOrEmpty = ModelType.prototype instanceof _AbstractSimpleOrEmptyModel
      , [setupMap, BaseModelType] = isOrEmpty
           ? [valueOrEmptyUIElements, ModelType.Model]
           : [valueUIElements, ModelType]
      , SetupKey =  (!setupMap.has(BaseModelType)
                        && BaseModelType.prototype instanceof _AbstractEnumModel
                    )
            ? _AbstractEnumModel
            : BaseModelType
      ;
    // NOTE: fails also if !setupMap.has(_AbstractEnumModel) which
    // is expected, as the setupMaps may become arguments/configuration
    // in the future.
    if(!setupMap.has(SetupKey)) {
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        const message = `Can't find generic UI-Element for ModelType ${ModelType.name} `
                    + `(isOrEmpty: ${isOrEmpty}, BaseModelType: ${BaseModelType.name}).`;
        console.warn(message);
        const args = [ModelType.name, message, require('fullKey'), require('label')];
        return [UIMissingUIElement, BaseModelType, args];
    }
    const [UIElement, ...args] = setupMap.get(SetupKey);
    return [UIElement, BaseModelType, args];
}

class _BaseGenericKeyMomentWidgetsContainerComponent extends _BaseContainerComponent {
    _defineGenericWidgets(TypeClass, isAllowedFieldName, generalSettings, propertyRoot
            , injectable/*{getDefault, updateDefaultsDependencies, requireUpdateDefaults}*/
            ) {
        const resultWidgets = [];
        for(const fieldName of TypeClass.fields.keys()) {
            if(!isAllowedFieldName(fieldName))
                continue;
            const FieldType = TypeClass.fields.get(fieldName)
              , fullKey = `${propertyRoot}${fieldName}`
              , [UIElement, BaseModelType, args] = genericTypeToUIElement(FieldType)
              , settings = {
                    ...generalSettings
                    // also e.g.:
                    // , rootPath: this.parentAPI.rootPath.append(fieldName)
                }
              , dependencyMappings = []
              , uiElementArgs = []
              ;
            let internalPropertyName = 'value';
            for(const argDef of args) {
                if(!(argDef instanceof InjectDependency)) {
                    uiElementArgs.push(argDef);
                    continue;
                }
                let argument = _NOTDEF;
                // resolve
                switch(argDef.name) {
                    case "settings:rootPath":
                        settings.rootPath = this.parentAPI.rootPath.append(fieldName);
                        break;
                    case "settings:internalPropertyName":
                        internalPropertyName = argDef.payload;
                        break;
                    case "zones":
                        // CAUTION: settings.zone must be set
                        const zones = new Map([...this._zones.entries(), ['main', this._zones.get(settings.zone)]]);
                        argument = zones;
                        break;
                    // especially: getDefault and requireUpdateDefaults are
                    // added requirements with _UIAbstractPlainOrEmptyInputWrapper
                    // so far: defaultValue === BaseModelType.defaultValue
                    case "getDefault":
                        // CAUTION: BaseModelType.defaultValue: Could be the
                        // Symbol metamodel._NOTDEF, but is also not required
                        // by all UIElements.
                        // getDefault: ()=>this._getDefaults.bind(this, `${propertyRoot}/`)// , fieldName, BaseModelType.defaultValue));
                        argument = injectable.getDefault.bind(null, fieldName, BaseModelType.defaultValue);
                        break;
                    case "requireUpdateDefaults":
                        // this is only required if requireUpdateDefaults is
                        // an argument. it basically injects @animationProperties
                        // which is an (the!) requirement of requireUpdateDefaults
                        dependencyMappings.push(...injectable.updateDefaultsDependencies);
                        /* falls through */
                    case "raw:requireUpdateDefaults":
                        argument = injectable.requireUpdateDefaults;
                        break;
                    case "updateDefaultsDependencies":
                        argument = injectable.updateDefaultsDependencies;
                        break;
                    case "parentInjectable":
                         argument = injectable;
                         break;
                    case "fieldName":
                        argument = fieldName;
                        break;
                    case "fullKey":
                         argument = fullKey;
                         break;
                    case "label":
                        argument = getRegisteredPropertySetup(fullKey, {label:fieldName}).label || fieldName;
                        break;
                    case "propertyRoot":
                        argument = `${fullKey}/`;
                        break;
                    case "items":
                        // TODO: No nice labels via _AbstractEnumModel so far! Maybe a
                        // general internationalization and localization layer could provide
                        // that?
                        argument = new Map(BaseModelType.enumItems.map(value=>[value, value]));
                        break;
                    case "classToken":
                        // fieldName to css name field_name
                        argument = deCamelize(fieldName);
                        break;
                    default:
                        throw new Error(`KEY ERROR ${this}._defineGenericWidgets `
                            + `for Type ${TypeClass.name}.${fieldName} don't know `
                            + `how to provide parameter "${argDef.name}".`);
                }
                if(argument !== _NOTDEF) {
                    if(typeof argDef.payload === 'function')
                        argument = argDef.payload(argument);
                    uiElementArgs.push(argument);
                }
            }
            // This condition seems to be coincident with the settings:rootPath
            // dependency (compare: UIColorChooser/UIGenericKeyMomentStructContainer
            //
            // A related test could be: widget[UPDATE_STRATEGY] === UPDATE_STRATEGY_COMPARE
            // however, it seems more like this is to identify containers.
            if(!(UIElement.prototype instanceof _BaseContainerComponent))
                dependencyMappings.push([fieldName, internalPropertyName]);
            resultWidgets.push([
                settings
              , dependencyMappings
              , UIElement
              , ...uiElementArgs
            ]);
        }
        return resultWidgets;
    }
}

export class UIGenericKeyMomentStructContainer extends _BaseGenericKeyMomentWidgetsContainerComponent {
    constructor(parentAPI, _zones, injectable, propertyRoot, label) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = parentAPI.domTool.createElement('div', {'class': 'ui_generic_struct_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(parentAPI, zones);

        const TypeClass =  this.parentAPI.getEntry(this.parentAPI.rootPath).constructor;
        // MUST BE RESET after _update
        const widgets = this._defineWidgets(TypeClass, localZoneElement
            , injectable, propertyRoot, label);
        this._initWidgets(widgets);
    }
    _defineWidgets(TypeClass, localZoneElement
            , injectable, propertyRoot, label) {
        return [
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {zone: 'local'}
              , []
              , StaticTag
              , 'h4'
              , {}
              , [label]
            ]
            // label
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.has(fieldName) // basically all allowed
                  , {zone: 'local'}
                  , propertyRoot
                  , injectable
            )
        ];
    }
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }
}


function* getFieldsByType(FromType, SearchType) {
    for(const [fieldName, Type] of FromType.fields) {
            if(Type === SearchType)
                yield fieldName;
    }
}

/**
 * This is to identify ColorModel fields in a (_AbstractStruct) dataType FromType.
 * yields fildMame such that:
 *      FromType.fields.get(fieldName) === ColorModel
 */
function* getColorModelFields(FromType) {
    yield* getFieldsByType(FromType, ColorModel);
}

// copied from example-key-moments
class KeyMomentController extends _BaseGenericKeyMomentWidgetsContainerComponent {
    constructor(parentAPI, _zones, typeKey) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = parentAPI.domTool.createElement('li', {'class': 'ui_key_moment_controller'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(parentAPI, zones);
        // MUST BE RESET after _update
        this._activationTestCache = null;
        const activationTest = ()=>{
            if(this._activationTestCache === null) {
                const keyMoment = this.parentAPI.getEntry(parentAPI.rootPath);
                // see trace to figure when to reset the cache!
                this._activationTestCache = keyMoment.get('isActive').value;
            }
            return this._activationTestCache;
        };
        // FIXME:
        // Dependencies that when they change require to update default
        // values of some fields ()
        // this._getDefaults changes return value when these dependencies
        // change.
        // It's the dependencies of AnimationLiveProperties:
        // ['t', 'keyMoments', 'isLoop']
        //  * Sans the 't' because that is the live animation
        //    position and the widgets here depend on the  keyMoment t,
        //  *  added "activeKey" as that change would change the default
        //     values as well (other keyMoment). But that would likely
        //     trigger full re-evaluation anyways.
        this._animationPropertiesKey = `animationProperties@${this.parentAPI.rootPath.append('..', '..')}`;
        const updateDefaultsDependencies = [
                [this._animationPropertiesKey, '@animationProperties']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          , genericPropertyRoot = 'generic/'
          , colorsPropertyRoot = 'colors/'
          , TypeClass =  this.parentAPI.getEntry(this.parentAPI.rootPath).constructor
          ;

        const widgets = this._defineWidgets(TypeClass, typeKey, localZoneElement
                , activationTest, requireUpdateDefaults
                , genericPropertyRoot, colorsPropertyRoot
                , updateDefaultsDependencies
                );
        this._initWidgets(widgets);
    }

    _defineWidgets(TypeClass, typeKey, localZoneElement
                , activationTest, requireUpdateDefaults
                , genericPropertyRoot, colorsPropertyRoot
                , updateDefaultsDependencies
                ) {
        // TODO: this displayes only a button with the label of the keymoment
        //       when the key moment is active, the label will be bold and
        //       below the button all the controls shall be displayed.
        const typographySpecificWidgets = [];
        if(typeKey === '[STAGE:null]' || isTypographicActorTypeKey(typeKey)) {
            typographySpecificWidgets.push(
            [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'value']
                    , ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , ()=>this._getDefaults('', 'fontSize', 66)
              , requireUpdateDefaults
              , 'Font-Size' // label
              , 'pt'// unit
              , {min:0, max:244, step:1, 'default': 36} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'fontSize']
                  , [typeKey === '[STAGE:null]' ? '/font' : '../../font', 'font']
                  , ['axesLocations', 'axesLocations']
                  , ['autoOPSZ', 'autoOPSZ']
                  , ...updateDefaultsDependencies
                ]
              , UIManualAxesLocations
              , this._getDefaults.bind(this)
              , requireUpdateDefaults
            ]
            );
        }
        return [
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {zone: 'local'}
              , [
                    'label'
                  , ['isActive', 'boolean']
                ]
              , ToggleKeyMomentButton
            ]
          , [
                {zone: 'local', activationTest}
              , [
                    ['label', 'data']
                ]
              , DynamicTag
              , 'h3'
              , {}
              , (data)=>`Key Moment: ${data}`
            ]
            // label
          , [
                {zone: 'local', activationTest}
              , [
                    ['label', 'value']
                ]
              , UILineOfTextInput
              , 'Label'
            ]
            // duration
          , [
                {zone: 'local', activationTest}
              , [
                    ['duration', 'value']
                ]
              , UINumberInput
              , 'Relative Duration' // label
              , '/ Full Relative Duration'// unit
              , {min:0} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'local', activationTest}
              , [
                   // ['fontSize', 'value']
                    ...updateDefaultsDependencies
                  , 'numericProperties'
                ]
              , UINumericProperties
              , this._getDefaults.bind(this, 'numericProperties/')
              , requireUpdateDefaults
            ]
          , ...typographySpecificWidgets
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.get(fieldName) === ColorModel // is ColorModel
                  , {zone: 'local', activationTest}
                  , colorsPropertyRoot
                  , {
                        updateDefaultsDependencies
                      , requireUpdateDefaults
                      , getDefault: this._getDefaults.bind(this, colorsPropertyRoot)
                    }
            )
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>REGISTERED_GENERIC_KEYMOMENT_FIELDS.has(fieldName)
                  , {zone: 'local', activationTest}
                  , genericPropertyRoot
                  , {
                        updateDefaultsDependencies
                      , requireUpdateDefaults
                      , getDefault: this._getDefaults.bind(this, genericPropertyRoot)
                    }
            )
        ];
    }
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }

    _getDefaults(prefix, key, defaultVal=_NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const fullKey = `${prefix}${key}`
           , liveProperties = this.getEntry(this._animationPropertiesKey)
           , activeKey = this.parentAPI.rootPath.parts.at(-1)
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(fullKey.startsWith('colors/')) {
            const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
            if(color !== null)
                return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(fullKey, defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal
                    );
            return fallback === defaultVal
                ? defaultVal
                : fallback.default
                ;
        }
        else if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
    }
}

class KeyMomentsController extends _BaseDynamicCollectionContainerComponent {
    constructor(parentAPI, zones, itemEntryPath, ...customArgs) {
        super(parentAPI, zones, itemEntryPath);
        this._customArgs = customArgs;
    }
    _createWrapper(rootPath) {
        const settings = {
               rootPath: rootPath
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = KeyMomentController
          , args = [this._zones, ...this._customArgs]
          , childParentAPI = this._childrenParentAPI
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }
}

class UISelectTaskAutomation extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_select_task_automation">
        <!-- insert: select-widget -->
        <button class="ui_select_task_automation-execute">run</button>
</div>`;
    //jshint ignore:end
     constructor (parentAPI, items) {
        super(parentAPI);

        this._items = items;
        const itemKeyTolabels = new Map(Array.from(this._items.entries())
                    .map(([key, [label/*, TaskAutomationDialog */]])=>[key, label]));
        [this.element, this._select] = this.initTemplate(itemKeyTolabels);
        this._dialog = null;
    }

    initTemplate(items) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , select = new PlainSelectInput(this._domTool, null, 'Macros', items)
          , button = element.querySelector('.ui_select_task_automation-execute')
          ;
        select.element.title = 'run task automations';
        button.addEventListener('click', ()=>this._executeItem(this._select._input.value));
        this._domTool.insertAtMarkerComment(element, 'insert: select-widget', select.element);
        this._insertElement(element);
        return [element, select];
    }

    async _executeItem(key) {
        if(this._dialog !== null)
            console.error(`${this}._executeItem can't execute this._dialog is not empty`);
        let result = null;
        const [/*label*/, TaskAutomationDialog] = this._items.get(key);
        this._dialog = new TaskAutomationDialog(this._domTool);

        try {
          // FIXME: it would be good to have this guarded in a kind of
          // transaction, so that only this thread can manipulate
          // the global state until it is finished. So far, that is
          // only "informal", as the dialog is modal. Ideally, we could
          // "lock" the sub-element that we are working on. In case of
          // an error, we could just put the original sub element back
          // in place.
          result = await this._dialog.show(this.parentAPI);
        }
        catch(error) {
            console.error(`TASK_AUTOMATION_DIALOG ERROR ${this}._executeItem with "${key}":`, error);
        }
        finally {
            if(this._dialog) {
                this._dialog.destroy();
                this._dialog = null;
            }
        }
        return result;
    }

    destroy() {
        if(this._dialog) {
            this._dialog.destroy();
            this._dialog = null;
        }
        return super.destroy();
    }

    // update(/* changeMap*/) {
        // pass
    // }
}

class PropertiesManager extends _CommonContainerComponent {
    // jshint ignore:start
    /**
     * could be as well:
     * initialUpdate(...args){
     *     return _BaseDynamicCollectionContainerComponent.prototype.initialUpdate.call(this, ...args);
     * }
     */
    initialUpdate = _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    // jshint ignore:end
    constructor(parentAPI, zones) {
        // provision widgets dynamically!
        super(parentAPI, zones);
        this._currentActorTypeKey = null;
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.parentAPI.getExternalName('actorPath'));
        // Seem not required: the child will define this dependency:
        //
        // const actorsPathStr = this.parentAPI.getExternalName('actors')
        //   , actorsPath = Path.fromString(actorsPathStr)
        //   , actorPath = this.getEntry('actorPath')
        //   ;
        // if(!actorPath.isEmpty) {
        //     // get info when active actor changes, on type change, we want
        //     // to change the widgets
        //
        //     const absoluteActorsPath = actorsPath.append(...actorPath.value);
        //     dependencies.add(absoluteActorsPath.toString());
        // }
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.parentAPI.getExternalName('actorPath'));
        return dependencies;
    }

    _createStageWrappers() {
        const widgetRootPath = Path.fromString(this.parentAPI.getExternalName('stage'))
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          , animationPropertiesPath = `animationProperties@${widgetRootPath}`
          ;

        const widgets = [
            getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                ]
              , UISelectTaskAutomation
              , CONTAINER_TASK_AUTOMATIONS
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                  , [animationPropertiesPath, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                ]
              , CommonActorProperties // Constructor
              , '[STAGE:null]'// has no typeKey, but is also no Type....
              // , ...args
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['keyMoments', 'keyMoments']
                  , [animationPropertiesPath, '@animationProperties']
                ]
              , KeyMomentsControls
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , keyMomentsMain
            ]
          , [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['keyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into keyMomentsMain
              ,  new Map([...this._zones, ['main', keyMomentsMain]]) // zones
                // it's already in rootPath!
              , []// 'keyMoment' // itemEntryPath within the item at itemsCollectionName[i]
              , '[STAGE:null]'// has no typeKey, but is also no Type....
            ]
            // TODO: add widgets for specific aspects of the actorType
        ];
        // this._initWrapper(this._childrenParentAPI, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenParentAPI, ...widgetArgs));
    }

    _getActorSpecificWidgetSetup(widgetRootPath, widgetKey) {
        const settings = {
            FontSelect: [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                    ['/availableFonts', 'options']
                  , ['localActiveFontKey', 'activeFontKey']
                ]
              , FontSelect
              , true
            ]
          , ContainerTaskAutomations: [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                ]
              , UISelectTaskAutomation
              , CONTAINER_TASK_AUTOMATIONS
            ]
        };

        if(Object.hasOwn(settings, widgetKey))
            return settings[widgetKey];
        throw new Error(`KEY ERROR not found widgetKey "${widgetKey}" in ${this}._getActorSpecificWidgetSetup.`);
    }

    _createActorWrappers(actorPath, actor) {
        const typeKey = actor.get('actorTypeKey').value
          , actorsPath = Path.fromString(this.parentAPI.getExternalName('actors'))
          // , actorTypeModel = actor.get('actorTypeModel')
          // , typeLabel = actorTypeModel.get('label').value
          // , typeClass = actorTypeModel.get('typeClass').value
          // actor.get('instance')
          , widgetRootPath = actorsPath.append(...actorPath, 'instance')
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          , actorSpecificWidgets  = getActorTypeKeySpecificWidgets(typeKey)
                .map(widgetKey=>this._getActorSpecificWidgetSetup(widgetRootPath, widgetKey))
          , animationPropertiesPath = `animationProperties@${widgetRootPath}`
          ;

     const widgets = [
            [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'}
              , [
                    [animationPropertiesPath, '@animationProperties']
                  , 'keyMoments'
                ]
              , UIActorTimeControlKeyMomentSelectCircle
            ]
          , getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
          , ...actorSpecificWidgets
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                  , [animationPropertiesPath, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                ]
              , CommonActorProperties // Constructor
              , typeKey
              // , ...args
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['keyMoments', 'keyMoments']
                  , [animationPropertiesPath, '@animationProperties']
                ]
              , KeyMomentsControls
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , keyMomentsMain
            ]
          , [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['keyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into keyMomentsMain
              ,  new Map([...this._zones, ['main', keyMomentsMain]]) // zones
                // it's already in rootPath!
              , []// 'keyMoment' // itemEntryPath within the item at itemsCollectionName[i]
              , typeKey
            ]
        ];
        // this._initWrapper(this._childrenParentAPI, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenParentAPI, ...widgetArgs));
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult)
          , actorPathOrEmpty = changedMap.has('actorPath')
                ? changedMap.get('actorPath')
                : this.getEntry('actorPath')
           , actors = changedMap.has('actors')
                ? changedMap.get('actors')
                : this.getEntry('actors')
           , actor = !actorPathOrEmpty.isEmpty
                  // If path can't be resolved actor becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                ? getEntry(actors, actorPathOrEmpty.value, null)
                : null
           , actorTypeKey = actor === null ? null : actor.get('actorTypeKey').value
           , typeChanged = this._currentActorTypeKey !== actorTypeKey
           , rebuild = changedMap.has('actorPath') || typeChanged
           ;
        this._currentActorTypeKey = actorTypeKey;

        if(rebuild) {
            // deprovision widgets
            for(const widgetWrapper of this._widgets)
                widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set();

        // Keeping for debugging for now:
        // console.log(`${this.constructor.name}._provisionWidgets(compareResult):`, ...changedMap.keys()
        //     , `\n actor !== null`, actor !== null
        //     , `\n changedMap.has('actorPath')`, changedMap.has('actorPath')
        //     , `\n typeChanged`, typeChanged, `actorTypeKey`, actorTypeKey
        //     , `\n rebuild`, rebuild
        // )

        const widgetWrappers = [];

        if(actor !== null && rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            widgetWrappers.push(...this._createActorWrappers(actorPathOrEmpty.value, actor));
        }
        else if(rebuild) {
            // The StageAndActorsModel actually functions as the root
            // of all properties, so we manage the stage when we don't
            // manage another actor...
            widgetWrappers.push(...this._createStageWrappers());
        }

        this._widgets.push(...widgetWrappers);
        for(const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}

class StageAndActorsController extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        parentAPI.wrapper.setProtocolHandlerImplementation(
            ...AnimationPropertiesProtocolHandler.create('animationProperties@'));
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {}
              , [
                    ['t', 'globalT'], 'keyMoments', 'isLoop'
                    // NOT required as this is the root. However, it could
                    // be used here as well e.g. to inject global defaults'.
                    // parent is always two levels above from here
                    // as this is {index}/instance
                    //, [`animationProperties@${parentAPI.rootPath.append('..', '..')}`, '@parentProperties']
                ]
              , ContainerMeta
              , zones
            ]
          , ...Object.entries(getBasicPlayerControlWidgets({zone: 'before-layout'}))
                                    .filter(([k,/*v*/])=>k!=='isLoop').map(([k,v])=>v)
          , [
                {zone: 'main'}
              , [
                    't', 'playing'
                ]
              , UITimeControlCircle
            ]
          , [
                {zone: 'layout'}
              , []
              , StageHTML
              , zones
              , 'stage_and_actors'
            ]
            // Part of StageManger: select type and drag into StageManger
            // to create it add the drop position.
          , [
                {
                    zone: 'main'
                }
              , [
                    ['availableActorTypes', 'sourceTypes']
                ]
              , SelectAndDrag
              , 'Create'
              , 'drag and drop into Stage Manager.'
              , function setDragDataFN(dataTransfer, selectedValue) {
                    dataTransfer.setData('text/plain', `[TypeRoof actor create: ${selectedValue}]`);
                    dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_CREATE, `${selectedValue}`);
                }
            ]
          , [
                {
                    zone: 'main'
                }
              , [
                    ['activeActors', 'rootCollection']

                ]
              , WasteBasketDropTarget
              , 'Remove actor'
              , 'drag and drop into bin from Stage Manager.'
              , [DATA_TRANSFER_TYPES.ACTOR_PATH]
            ]
          , [
                {
                    zone: 'main'
                }
              , [
                    'activeActors', 'editingActor'
                  , ['availableActorTypes', 'sourceTypes']
                ]
              , StageManager
            ]
          , [
                {}
              , [
                    ['editingActor', 'actorPath']
                  , ['activeActors', 'actors']
                  , [parentAPI.rootPath.toString(), 'stage']
                ]
              , PropertiesManager
              , zones
            ]
        ];
        super(parentAPI, zones, widgets);
    }
    update(...args) {
        this.parentAPI.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.parentAPI.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export {
    StageAndActorsModel as Model
  , StageAndActorsController as Controller
};
