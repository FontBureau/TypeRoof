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
  , BooleanModel
  , StringModel
  , NumberModel
  , ValueLink
  , FallBackValue
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractListModel
  , _AbstractGenericModel
  , _AbstractSimpleOrEmptyModel
  , FreezableMap
  , StaticDependency
} from '../../metamodel.mjs';

import { zip } from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
  , _CommonContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
} from '../basics.mjs';


import {
    StaticNode
  , DynamicTag
  , UINumberInput
  , PlainNumberAndRangeOrEmptyInput
  , UINumberAndRangeOrEmptyInput
  , LineOfTextInput
} from '../generic.mjs';

import {
    _BaseLayoutModel
  , InstalledFontsModel
  , InstalledFontModel
} from '../main-model.mjs';

import {
    FontSelect
} from '../font-loading.mjs';

import {
    timeControlModelMixin
  , AnimationTGenerator
  , UITimeControlCircle
  , getBasicPlayerControlWidgets
  , LocalScopeAnimanion
  , AnimationLiveProperties
  , AnimationInfo
  , keyMomentModelMixin
  , binarySearch
  , AnimationPropertiesProtocolHandler
}  from '../animation-fundamentals.mjs';

import {
    createLabelForKeyMoment
} from './example-key-moments.mjs';

import {
    manualAxesLocationsModelMixin
  , UIManualAxesLocations
} from '../ui-manual-axis-locations.mjs';

const NumericPropertiesModel = _AbstractOrderedMapModel.createClass('NumericPropertiesModel', NumberModel)
  //, PropertiesModel = _AbstractStructModel.createClass(
  //      'PropertiesModel'
  , propertiesModelMixin = Object.freeze([
        CoherenceFunction.create(['numericProperties'],
        function sanitizeNumericProperties({numericProperties}) {
            // const axisRanges = font.value.axisRanges;
            // axisRanges[axis.tag] {
            //      name /*  'name' in axis ? axis.name.en : axis.tag */
            //    , min, max, default }
            for(const [/*key*/, entry] of numericProperties) {
                // TODO: we need some defaults, min, max etc. descriptions
                // of the available properties (we don't know either what
                // is available
                const {min, max} = {min: -Infinity, max: Infinity}; //axisRanges[key];

                if(typeof entry.value !== 'number')
                    // NumberModel is still generic!
                    throw new Error(`ASSERTION ERROR expecting a number value but got: ${typeof entry.value} in numericProperties`);
                // And make sure existing axes are within the
                // min/max limits.
                entry.value = Math.max(min, Math.min(max, entry.value));

                // The UI must decide to store explicitly data in
                // here or not. If it is not in here, the default
                // value is implicit!.
                // In that case this case should be removed!
                // if(entry.value === defaultVal)
                //     axisRanges.delete(key);
            }
        })// => [name, instance]
      , ['numericProperties', NumericPropertiesModel]
        // TODO: Put manualAxesLocationsModel in here
        // CAUTION: It could be nicer to mix in its definition directly.
        // TODO: Create a getter for ...ManualAxesLocationsModel.mixin
        //       see also: propertiesModelMixin
        // OR: even simpler: just export the mixin as an array, just like this.
        //     THEN use that definition in ManualAxesLocationsModel as well
        // , ['manualAxesLocationsModel', ManualAxesLocationsModel]
        //       , CoherenceFunction.create(['font', 'fontSize', 'autoOPSZ', 'axesLocations'],
        //          function sanitizeAxes(...)[...]
        //       , ['autoOPSZ', BooleanModel, /* default true */]
        //       , ['axesLocations', AxesLocationsModel]
        // Maybe, we create an ManualAxesLocationsOrEmptyModel and
        // only if there's a font, the model is instantiated...
        // some Actors may not require these properties...
        // The Stage, Layers -- both containers -- and everything that
        // actually renders type should have font related properties.
    ])
    //)

  , KeyMomentModel = _AbstractStructModel.createClass(
        'KeyMomentModel'
      , ...keyMomentModelMixin
      , ['isActive', BooleanModel] // todo: rename "selected"?
      // , ['fontSize', FontSizeModel]
      // , ['manualAxesLocations', ManualAxesLocationsModel]
      , ...propertiesModelMixin
    )
  , FontSizeModel = _AbstractSimpleOrEmptyModel.createClass(NumberModel)
  , TypographyKeyMomentModel = _AbstractStructModel.createClass(
        'TypographyKeyMomentModel'
      , ...keyMomentModelMixin
      , ['isActive', BooleanModel] // todo: rename "selected"?
      , ['fontSize', FontSizeModel]
      , ...manualAxesLocationsModelMixin // requires font, fontSize
      , ...propertiesModelMixin
    )
    // Order is really most important here, however, _AbstractOrderedMapModel
    // could still be an option, then move "label" as unique identifier in
    // here. However, this works good enough.
  , KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
  , TypographyKeyMomentsModel = _AbstractListModel.createClass('TypographyKeyMomentsModel', TypographyKeyMomentModel)
  ;

export class _BaseActorModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}
const ActorTypeModel = _AbstractGenericModel.createClass('ActorTypeModel')// => .value will be a concrete _BaseActorModel
    // make this selectable...
  , AvailableActorTypeModel = _AbstractStructModel.createClass(
        'AvailableActorTypeModel'
      , ['label', StringModel]
      , ['typeClass', ActorTypeModel]
    )
  , AvailableActorTypesModel = _AbstractOrderedMapModel.createClass('AvailableActorTypesModel', AvailableActorTypeModel)
    // This is a very opaque way of creating instances for different
    // types.
  , ActorModel = _AbstractStructModel.createClass(
        'ActorModel'
      , ['availableActorTypes', new InternalizedDependency('availableActorTypes', AvailableActorTypesModel)]
        // TODO: having ALLOW_NULL here is interesting, and I'm not convinced
        // all the consequences are known by me now. It's about not creating
        // whatever Actor this falls back to. But eventually null means
        // _AbstractDynamicStructModel: instance will have a null value.
        // and maybe we should handle this like an _AbstractSimpleOrEmptyModel
        // which raises if trying to read from an empty model and hence forces
        // awareness and always to use
      , ['actorTypeKey', new ForeignKey('availableActorTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['actorTypeModel', new ValueLink('actorTypeKey')]
      // It would be nice if (something like) this could be the ActorModel
      // directly however, we'd loose the ability to allow based on the list.
      // Not sure if that is really important though, the list of
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicActorModel'
                            , _BaseActorModel
                            ,'actorTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableActorTypes', 'font', 'installedFonts'])]//, 'referenceableActors' ??? ])]
    )
      // This is the home for instances of actors.
      // Require named keys for actors to make them uniquely identifyable
      // but also human identifiable. This is different to KeyMomentsModel
      // where order is absolutly crucial information and labels can be not
      // unique. One result of this is however, that references to these
      // actors, when the key is renamed, should carefully be tracked and
      // renamed as well!
      // Another result is that UX must help users to understand the uniqueness
      /// requirements.
    , ActorsModel = _AbstractListModel.createClass('ActorsModel', ActorModel) // _AbstractOrderedMapModel
      // This is very similar ActiveKeyMomentModel which was invented first
      // referencing an ActorModel item in ActorsModel with a 'state'
      // that is a _BaseActorModel
      // It is a _BaseActorModel so it can actually be referenced by it's
      // own type as well.
      // TODO: try and explain the behavior of recursive/self-references!
      // It's interesting though, as the metamodel likely has no issue with
      // this, but e.g. the UI and displaying/interpreting side could develop
      // issues.
   //, ReferenceActorModel = _BaseActorModel.createClass(
   //    'ReferenceActorModel'
   //    // requires "actors" as a dependency from parent to be able to
   //    // point the ForeignKey into it we must define it as an InternalizedDependency
   //  , ['referencableActors', new InternalizedDependency('referencableActors', ActorsModel)]
   //    // This whole struct shouldn't exist if there's no actor
   //    // hence ForeignKey.NOT_NULL
   //  , ['key', new ForeignKey('referencableActors', ForeignKey.NOT_NULL, ForeignKey.NO_ACTION)]
   //    // We are editing via this one I guess, editing also means to resolve
   //    // the link to get a proper draft from the parent that owns the actual
   //    // actor!
   //  , ['actor', new ValueLink('key')]
   //    // Depending on the use case we may want to store more data alongside.
   //    // e.g. x/y displacement or transformation matrix of an actor.
   //    //
   //    // When does the actor enter the stage? (default: t=0)
   //    // When does the actor leave the stage? (default t=1)
   //    // The above could be more sophisticated, the actor could be entereing
   //    // and leaving multiple times, but, that could also be done by
   //    // using multiple references.
   //    // It could also be realized using opacity, where a shortcut when
   //    // opacity is 0 would make sure the actor is not animated at all.
   //    // That way, stage presence can be implemented with key moments.
   //    // Otherwise, it could be a discrete number[0, 1] or a rounding
   //    // could be used.
   //    //
   //    // Mapping "global"-time-t to actor-t. E.g. the actor could
   //    // be playing in just a fraction of the stage time.
   //    // Also, t to actor-t: actor-t could be no-linear, could go backwards
   //    // etc. basically, we could have keyMoments to animate actorT.
   //    //
   //    // x and y: can be interpolated without any issues, rotation
   //    // would be more complex!
   //    // z: implementation dependent.
   //    //
   //    // scale: use one value as a uniform x/y scaling???
   //)
  //, ActorReferencesModel = _AbstractListModel.createClass('ActorReferencesModel', ActorReferenceModel)
    // A layer is a container or groupig for more actors.
    // could be called a "Group" in fact. Using "Layer" as it is a familiar
    // term for design tools. A "Group" is familiar as well, and I'm not
    // sure what the difference actually shold be, despite that the UIs
    // usually have less support for groups than for layers. It's
    // maybe a UI treatment difference.
  , genericActorMixin = [
        CoherenceFunction.create(
            ['isLoop']
          , function prepareIsLoop({isLoop}) {
            if(isLoop.value === undefined)
                isLoop.value = true;
        })
      , ['isLoop', BooleanModel] // connect end with beginning and transition
    ]
  , typographyActorMixin = [
        ['keyMoments', TypographyKeyMomentsModel]
      , ['installedFonts', new InternalizedDependency('installedFonts', InstalledFontsModel)]
      , ['parentFont', new InternalizedDependency('font', InstalledFontModel)]
      , ['localActiveFontKey', new ForeignKey('installedFonts', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['localFont', new ValueLink('localActiveFontKey')]
      , ['font', new FallBackValue('localFont', 'parentFont', InstalledFontModel)]
    ]
  , LayerActorModel = _BaseActorModel.createClass(
        'LayerActorModel'
      , ...genericActorMixin
      , ...typographyActorMixin
      , ['activeActors', ActorsModel]
      // removed, because ActorReferencesModel via ActorReferenceModel
      // already depends on ActorsModel:availableActors
      //  , ['availableActors', new InternalizedDependency('availableActors', ActorsModel)]
        // this should also inherit or override all the properties.
        // especially size, x, y, z, t
    )
    // This is no meant as an eventual Actor, just to simply set up
    // without great complexity.
    // Just enough information to create:
    // <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    //            <circle cx="50" cy="50" r="50" />
    // </svg>
    // where viewBox width/height = 2 * radius
  , CircleActorModel = _BaseActorModel.createClass(
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
  , LineOfTextActorModel = _BaseActorModel.createClass(
        'LineOfTextActorModel'
      , ...genericActorMixin
      , ...typographyActorMixin
      , CoherenceFunction.create(
            ['text']
          , function setDefaults({text}) {
            if(text.value === undefined)
                text.value = 'Sample Text';
        })
      , ['text', StringModel]
    )
  , [/*referencableActorTypes*/, activatableActorTypes] = (()=>{
        const referenceTypeKey = 'ReferenceActorModel'
          , actorTypes = [
                ['LayerActorModel', 'Layer', LayerActorModel]
                // there could be an alias (so users would find "Groups" as well
                // even though it is the same:
                // ['LayerActorModel', 'Group', LayerActorModel]
            // , [referenceTypeKey, 'Reference', ReferenceActorModel]
              , ['CircleActorModel', 'Circle', CircleActorModel]
              , ['LineOfTextActorModel', 'Line of Text', LineOfTextActorModel]
            ]
          , availableActorTypesDraft = AvailableActorTypesModel.createPrimalDraft({})
          ;
        for(const [key, label, Model] of actorTypes) {
            const availableActorType = AvailableActorTypeModel.createPrimalDraft({});
            availableActorType.get('typeClass').value = Model;
            availableActorType.get('label').value = label;
            availableActorTypesDraft.push([key, availableActorType]);
        }
        const availableActorTypes = availableActorTypesDraft.metamorphose()
          , referencableActorTypesDraft = availableActorTypes.getDraft()
          ;
        referencableActorTypesDraft.delete(referenceTypeKey);
        const referencableActorTypes = referencableActorTypesDraft.metamorphose();
        return [referencableActorTypes, availableActorTypes];
    })()

  //, ReferencableActorsModel = _AbstractStructModel.createClass(
  //      'ReferencableActorsModel'
  //    , ['activeActors', ActorsModel]
  //      // this, so hope, is the magic piece to allow here just a subset
  //      // of all available actors.
  //    , ['referencableActors', new InternalizedDependency('referencableActorTypes', AvailableActorTypesModel)]
  //  )
    // TODO: _AbstractTypedModel('PathModel', Path) => would be simple!
  , PathModel = _AbstractGenericModel.createClass('PathModel')
  , StageAndActorsModel = _BaseLayoutModel.createClass(
        'StageAndActorsModel'
      , ...timeControlModelMixin
         // same as in_BaseActorModel, but this is not an actor,
         // these properties are the root of the inheritance.
      , ['keyMoments', TypographyKeyMomentsModel]
      , CoherenceFunction.create(
            ['width', 'height', 'availableActorTypes', 'activeActors', 'font', 'installedFonts']
          , function setDefaults({width, height, availableActorTypes, activeActors, font, installedFonts}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            //
            // widht and heigth defaults could also be determined differently
            // this is simply to get started somewhere.
            if(width.value === undefined)
                width.value = 500;
            if(height.value === undefined)
                height.value = 500;

            // temporary to get started...
            if(!activeActors.size) {
                // VERY VERBOSE:
                // However, most of this will vanish in normal operation
                // as the draft will be already created etc.
                const getTypeFor=name=>availableActorTypes.get(name).value.get('typeClass').value
                  , getDraftFor=(name, deps)=>getTypeFor(name).createPrimalDraft(deps)
                  // , key = 'circle #1'
                  , circleTypeKey = 'CircleActorModel'
                  , circelDraft = getDraftFor(circleTypeKey, {})
                // , circleReferenceDraft = getDraftFor('ActorReferenceModel')
                  , actorDraft = ActorModel.createPrimalDraft({availableActorTypes, font, installedFonts})
                  ;
                actorDraft.get('actorTypeKey').value = circleTypeKey;
                actorDraft.get('instance').wrapped = circelDraft;
                // circelDraft.get('x').value = 32;
                // circelDraft.get('y').value = 32;
                // circelDraft.get('radius').value = 123;



                // availableActors.set(key, actorDraft);
                // circleReferenceDraft.get('key').value = key;
                // activeActors.push(circleReferenceDraft);
                activeActors.push(actorDraft);
            }
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
 * This is to set/manage the properties of a layer node.
 */
class LayerDOMNode extends StaticNode {
    constructor(parentAPI, node, cssClasses) {
        super(parentAPI, node);
        for(const className of ['stage_and_actors-layer', ...cssClasses])
            this.node.classList.add(className);
    }
    update(changedMap){
        const setXY = (property, value)=>{
            const cssProperty = {'numericProperties/x': 'left', 'numericProperties/y': 'top'}[property];
            this.node.style.setProperty(cssProperty, `${value}px`);
        };

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              ;

            // set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            for(const property of ['numericProperties/x', 'numericProperties/y']) {
                if(!propertyValuesMap.has(property))
                    continue;
                setXY(property, propertyValuesMap.get(property));
            }
        }
    }
}
class StageDOMNode extends LayerDOMNode {
    constructor(parentAPI, node, cssClasses) {
        super(parentAPI, node, cssClasses);
    }
    update(changedMap) {
        for(const property of ['width', 'height']){
            if(changedMap.has(property))
                // FIXME: CAUTION: the px unit should likely be configurable
                this.node.style.setProperty(property, `${changedMap.get(property).value}px`);
        }
    }
}

class CircleActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<svg
            viewBox="0 0 0 0"
        >
    <circle cx="0" cy="0" r="0" />
</svg>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
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
        // console.log('CircleActorRenderer.update changedMap:', ...changedMap);

        const setRadius = radius=>{
            for(const [element, attr, value] of [
                    [this.element, 'viewBox', `-${radius} -${radius} ${2*radius} ${2*radius}`]
                  , [this.circle, 'r', `${radius}`]
            ]) {
                 element.setAttribute(attr, value);
            }
            this.element.style.setProperty('width', `${2*radius}px`);
            this.element.style.setProperty('height', `${2*radius}px`);
        };

        const setXY = (property, value)=>{
            const cssProperty = {'numericProperties/x': 'left', 'numericProperties/y': 'top'}[property];
            this.element.style.setProperty(cssProperty, `${value}px`);
        };

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              ;
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example

            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            for(const property of ['numericProperties/r', 'numericProperties/x', 'numericProperties/y']){
                if(!propertyValuesMap.has(property))
                    continue;
                switch(property) {
                    case 'numericProperties/r':
                        setRadius(propertyValuesMap.get(property));
                        break;
                    case 'numericProperties/x':
                    case 'numericProperties/y':
                        setXY(property, propertyValuesMap.get(property));
                        break;
                    default:
                        continue;
                }
            }
        }
    }
}

class LineOfTextActorRenderer  extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<span class="actor_renderer-line-of-text">(content not initialized)</span>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element];
    }

    _setTypographicPropertiesToSample(sample, propertyValuesMap) {
        const axisPrefix = 'axesLocations/';

        if((propertyValuesMap.has('fontSize')))
            sample.style.setProperty('font-size', `${propertyValuesMap.get('fontSize')}pt`);

        const variations = [];
        for(const [key, value] of propertyValuesMap) {
            if(!key.startsWith(axisPrefix))
                continue;
            const axisTag = key.slice(axisPrefix.length);
            variations.push(`"${axisTag}" ${value}`);
        }
        // FIXME: maybe set only existing axes and only to valid ranges?
        // inherited axesLocations would set anything here. However,
        // the font rendering inherently also doesn't fail.
        sample.style.setProperty('font-variation-settings', variations.join(','));
    }

    update(changedMap) {
        // console.log('CircleActorRenderer.update changedMap:', ...changedMap);

        const setXY = (property, value)=>{
            const cssProperty = {'numericProperties/x': 'left', 'numericProperties/y': 'top'}[property];
            this.element.style.setProperty(cssProperty, `${value}px`);
        };

        if(changedMap.has('font')) {
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
        }
        if(changedMap.has('text'))
            this.element.textContent = changedMap.get('text').value;

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              ;
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            for(const property of ['numericProperties/x', 'numericProperties/y']) {
                if(!propertyValuesMap.has(property))
                    continue;
                switch(property) {
                    case 'numericProperties/x':
                    case 'numericProperties/y':
                        setXY(property, propertyValuesMap.get(property));
                        break;
                    default:
                        continue;
                }
            }
            this._setTypographicPropertiesToSample(this.element, propertyValuesMap);
        }
    }
}


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

function initAnimanion(keyMoments, isLoop) {
    const propertyGenerators = [numericPropertiesGen];
    if(keyMoments instanceof TypographyKeyMomentsModel)
        // add typography
        propertyGenerators.push(fontSizeGen, axisLocationsGen);

    return new LocalScopeAnimanion(propertyGenerators, keyMoments, isLoop);
}

function isInheritingPropertyFn(property) {
    const numPropPrefix = 'numericProperties/';
    if(property.startsWith(numPropPrefix)) {
        const name = property.slice(numPropPrefix.length)
          , setup = REGISTERED_NUMERIC_PROPERTIES.get(name)
          ;
        // defaults to true
        return setup.inherit === false ? false : true;
    }
    return true;
}

class ActorRendererContainer extends _BaseContainerComponent {
    constructor(parentAPI, zones, ActorRenderer, actorDependencyMappings=[]) {
        const widgets = [
            [
                {
                    'animationProperties@': parentAPI.rootPath.toString()
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                  , [`animationProperties@${parentAPI.rootPath.append('..' ,'..', '..')}`, '@parentProperties']
                ]
              , AnimationLiveProperties
              , initAnimanion
              , isInheritingPropertyFn
            ]
          , [
                { zone: 'layer' }
              , [
                    [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                  , ...actorDependencyMappings
                ]
              ,  ActorRenderer
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

/**
 * dynamically provision widgets for actors in rootPath + "activeActors"
 *
 * StageAndActorsModel has ActorReferencesModel activeActors
 * LayerActorModel has ActorReferencesModel activeActors
 */
class ActiveActorsRenderingController extends _BaseDynamicCollectionContainerComponent {
    // FIXME: a lot of this is copied from KeyMomentsController
    // so both should be taken to form a unified _BaseDynamicCollectionContainerComponent ...
    // This, however, is only READING for rendering, not writing so far
    // hence no need for a _redirectedGetEntry so far.


    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getActorWidgetSetup(rootPath) {
        const actor = this.getEntry(rootPath)
          , typeKey = actor.get('actorTypeKey').value
          , actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , typeClass = actorTypeModel.get('typeClass').value
          , widgetRootPath = rootPath.append('instance')
          ;
        if(typeClass === CircleActorModel) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , []
              , ActorRendererContainer
              , this._zones
              , CircleActorRenderer
              , []
            ];
        }
        if(typeClass === LineOfTextActorModel) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , []
              , ActorRendererContainer
              , this._zones
              , LineOfTextActorRenderer
              , [
                    'text'
                  , ['font', 'font']
                ]
            ];
        }
        if(typeClass === LayerActorModel) {
             return [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['activeActors', 'collection']
                ]
              , LayerActorRenderer
              , this._zones
              , ['stage_and_actors-sub_layer']
            ];
        }
        throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup for typeClass: ${typeClass.name} label: "${typeLabel}" key: ${typeKey}`);
    }
    _createWrapper(rootPath) {
        const
            // how does this work?
            //,  childParentAPI = Object.assign(Object.create(this._childrenParentAPI), {
            //     // Ideally, the link, when trying to write to it,
            //     // e.g. in draft mode when reading from it and returning
            //     // the PotentialWriteProxy could use the linking information
            //     // to return a proxy for the correct entry in the source
            //     // but this may be complicated or really hard to accomplish
            //     // should be looked into though! In here, it's easier to
            //     // resolve the link, because the source is known and the
            //     // parent is known. Keeping track of a dependency's source
            //     // is thus maybe the main issue.
            //     //
            //     // FIXME: works so far, but requires the getEntry workaround.
            //     getEntry: this._redirectedGetEntry.bind(this)
            // })
            childParentAPI = this._childrenParentAPI
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getActorWidgetSetup(rootPath)
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }
}

class LayerActorRenderer extends _BaseContainerComponent {
    constructor(parentAPI, _zones, baseCLass=[]) {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden
        const layerElement = parentAPI.domTool.createElement('div')
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', layerElement], ['parent-layer', _zones.get('layer')]])
          ;
        const widgets = [
            [
                {
                    // this should be used to register the component as a
                    // dependency as soon as it is instantiated. The
                    // "animationProperties@" prefix should be registered
                    // to do so.
                    'animationProperties@': parentAPI.rootPath.toString()
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                    // parent is always three levels above from here
                    // as this is {index}/instance
                  , [`animationProperties@${parentAPI.rootPath.append('..', '..', '..')}`, '@parentProperties']
                ]
              , AnimationLiveProperties
              , initAnimanion
              , isInheritingPropertyFn
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                ]
              , LayerDOMNode
              , layerElement
              , [...baseCLass]
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActiveActorsRenderingController
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
    constructor(parentAPI, _zones, baseCLass=[]) {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden
        const layerElement = parentAPI.domTool.createElement('div')
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', layerElement], ['parent-layer', _zones.get('layer')]])
          ;
        // calling super early without widgets is only required when
        // the widgets definition requires the `this` keyword.

        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    'width', 'height'
                ]
              , StageDOMNode
              , layerElement
              , [...baseCLass]
            ]
          , [
                {
                    'animationProperties@': parentAPI.rootPath.toString()
                }
              , [['t', 'globalT'], 'keyMoments', 'isLoop'
                    // NOT required as this is the root. However, it could
                    // be used here as well e.g. to inject global defaults'.
                    // parent is always two levels above from here
                    // as this is {index}/instance
                    //, [`animationProperties@${parentAPI.rootPath.append('..', '..')}`, '@parentProperties']
              ]
              , AnimationLiveProperties
              , initAnimanion // This usage instance won't receive parentProperties.
              , isInheritingPropertyFn
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
            ]
        ];
        super(parentAPI, zones, widgets);
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
        return [element, actors];
    }

    _renderLayer(path, activeActors) {
        const container = this._domTool.createElement('ol');
        for(const [key, actor] of activeActors) {
            const itemElement = this._domTool.createElement('li')
              , itemPath = path.append(key)
              ;
            itemElement.append(...this._renderActor(itemPath, actor));
            container.append(itemElement);
            this._itemElements.set(itemPath.toString(), itemElement);
        }
        return [container];
    }

    _renderActor(path, actor) {
        const actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , typeClass = actorTypeModel.get('typeClass').value
          , fragment = this._domTool.createFragmentFromHTML(`<button><span></span> <em></em></button>`)
          , result = [...fragment.childNodes]
          , button = fragment.querySelector('button')
          ;
        button.addEventListener('click', this._onClickHandler.bind(this, path));
        fragment.querySelector('span').textContent = typeLabel;
        fragment.querySelector('em').textContent = path;
        if(typeClass === LayerActorModel) {
            const childrenPath = path.append('instance', 'activeActors');
            result.push(...this._renderLayer(childrenPath, actor.get('instance').get('activeActors')));
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
            this._actorsElement.append(...this._renderLayer(basePath, activeActors));
            if(!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        }
        else if(changedMap.has('editingActor')) {
            this._markActiveItems(...(editingActor.isEmpty ? [] : [editingActor.value]));
        }
    }
}

class CommonActorProperties extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="common_actor_properties">
    <h3>Actor Properties</h3>
    <span></span>
    <h4>Inherited Properties</h4>
    <ol class="common_actor_properties-inherited_properties"></ol>
    <h4>Own Properties</h4>
    <ol class="common_actor_properties-own_properties"></ol>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, typeKey) {
        super(parentAPI);
        this._typeKey = typeKey;
        this._isTypographic = null;
        [this.element, this.inheritedPropertiesContainer, this.ownPropertiesContainer] = this.initTemplate();
        this.ownProperties = new Set();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
            // 'LayerActorModel' => layer_actor_model'
          , classPart = this._typeKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
          , inheritedPropertiesContainer = element.querySelector('.common_actor_properties-inherited_properties')
          , ownPropertiesContainer = element.querySelector('.common_actor_properties-own_properties')
          ;
        element.classList.add(`common_actor_properties-${classPart}`);
        element.querySelector('span').textContent = this._typeKey;

        this._insertElement(element);
        return [element, inheritedPropertiesContainer, ownPropertiesContainer];
    }

    // NOTE: copied from AnimationInfo
    _createBasicDisplayElement(key, value, label=null) {
               const valueText = typeof value === 'boolean'
                            ? (value && 'True' || 'False')
                            : value.toString()
              , valueContainer = this._domTool.createElement('span', {}, valueText)
              , labelContainer = this._domTool.createElement('em', {}, label !== null ? label : key)
              , container = this._domTool.createElement('li', {}, [
                            labelContainer, ' ' , valueContainer])
            ;
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
                if(path_.startsWith('numericProperties')) {
                    if(!Object.hasOwn(models ,'numericProperties'))
                        models.numericProperties = getEntry(newMoment, 'numericProperties');
                    const propertyName = Path.fromString(path_).parts.at(-1);
                    models.numericProperties.setSimpleValue(propertyName, value);
                }
                else if(!(keyMoments instanceof TypographyKeyMomentsModel))
                    // FIXME: This is not a well extensible way of coding this.
                    continue;
                else if(path_.startsWith('axesLocations')) {
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

const REGISTERED_NUMERIC_PROPERTIES = Object.freeze(new FreezableMap(Object.entries(
    {
        x: {'default': 0, inherit: false}
      , y: {'default': 0, inherit: false}
      , r: {name: 'Radius', min: 0, 'default': 0, inherit: true}
      , t: {name: 'Children Time', 'default': 0, inherit: true}
    }
).map(([k, v])=>[k, Object.freeze(v)])));

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
              , `property-${key}`
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
        return REGISTERED_NUMERIC_PROPERTIES.has(key);
    }
    propertiesGet(key) {
        if(!this.propertiesHas(key))
            throw new Error(`KEY ERROR ${key} not found in REGISTERED_NUMERIC_PROPERTIES.`);
        return REGISTERED_NUMERIC_PROPERTIES.get(key);
    }

    propertiesKeys() {
        return REGISTERED_NUMERIC_PROPERTIES.keys();
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

// copied from example-key-moments
class KeyMomentController extends _BaseContainerComponent {
    static _NOTDEF = Symbol('_NOTDEF'); // jshint ignore:line
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
          ;
        // TODO: this displayes only a button with the label of the keymoment
        //       when the key moment is active, the label will be bold and
        //       below the button all the controls shall be displayed.
        const specificWidgets = [];
        // FIXME: we should detect this differently, not hard coded.
        const typographicTypes = new Set(['[STAGE:null]', 'LayerActorModel', 'LineOfTextActorModel']);
        if(typographicTypes.has(typeKey)) {
            specificWidgets.push(
            [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'value']
                    , ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , 'key_moment-font_size' // base-id
              , 'Font-Size' // label
              , 'pt'// unit
              , {min:0, max:244, step:1, 'default': 36} // minMaxValueStep => set attribute
              , this._getDefaults.bind(this, '', 'fontSize')
              , requireUpdateDefaults
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
        const widgets = [
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
              , LineOfTextInput
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
          , ...specificWidgets
        ];
        this._initWidgets(widgets);
    }

    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }

    _getDefaults(pefix, key, defaultVal=super._NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const fullKey = `${pefix}${key}`
           , liveProperties = this.getEntry(this._animationPropertiesKey)
           , activeKey = this.parentAPI.rootPath.parts.at(-1)
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== super._NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} at "${fullKey}" in ${liveProperties}`);
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
            [
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
    _createActorWrappers(actorPath, actor) {
        const typeKey = actor.get('actorTypeKey').value
          , actorsPath = Path.fromString(this.parentAPI.getExternalName('actors'))
          // , actorTypeModel = actor.get('actorTypeModel')
          // , typeLabel = actorTypeModel.get('label').value
          // , typeClass = actorTypeModel.get('typeClass').value
          // actor.get('instance')
          , widgetRootPath = actorsPath.append(...actorPath, 'instance')
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          , actorSpecificWidgets  = []
          , animationPropertiesPath = `animationProperties@${widgetRootPath}`
          ;
        if(['LayerActorModel', 'LineOfTextActorModel'].includes(typeKey)) {
            // has typographyActorMixin
            actorSpecificWidgets.push(
            [
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
            ]);
        }
        if(typeKey === 'LineOfTextActorModel') {
            actorSpecificWidgets.push([
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['text', 'value']
                ]
              , LineOfTextInput
              , 'Text'
            ]);
        }
        const widgets = [
            ...actorSpecificWidgets
          , getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
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
    constructor(parentAPI, _zones) {
        parentAPI.wrapper.setProtocolHandlerImplementation(
            ...AnimationPropertiesProtocolHandler.create('animationProperties@'));
        const zones = new Map([..._zones, ['layer', _zones.get('layout')]])
          , widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , ... Object.values(getBasicPlayerControlWidgets({zone: 'before-layout'}))
          , [
                {zone: 'main'}
              , [
                    't', 'playing'
                ]
              , UITimeControlCircle
            ]
          , [
                {}
              , []
              , StageHTML
              , zones
              , ['stage_and_actors', 'stage_and_actors-top_layer']
            ]
          , [
                {
                    zone: 'main'
                }
              , ['activeActors', 'editingActor']
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

        setTimeout(this._changeStateHandler(()=>{
            // setting up more development fixture
            // a layer containing
            //     circle #1 so it is reused (used twice)
            //     circle #2

            const state = this.getEntry(this.parentAPI.rootPath)
              , activeActors = state.get('activeActors')
              ;
            const availableActorTypes = state.get('availableActorTypes')
              , getTypeFor=name=>availableActorTypes.get(name).value.get('typeClass').value
              , getDraftFor=(name, deps)=>getTypeFor(name).createPrimalDraft(deps)
              , layerTypeKey = 'LayerActorModel'
              , layerDraft = getDraftFor(layerTypeKey, activeActors.dependencies)
              , actorDraft = ActorModel.createPrimalDraft(activeActors.dependencies)
              ;
            actorDraft.get('actorTypeKey').value = layerTypeKey;
            actorDraft.get('instance').wrapped = layerDraft;
            activeActors.push(actorDraft);

            for(let i=0;i<2;i++) {
                const circleTypeKey = 'CircleActorModel'
                  , circelDraft = getDraftFor(circleTypeKey, activeActors.dependencies)
                  , circleActorDraft = ActorModel.createPrimalDraft(activeActors.dependencies)
                  ;
                circleActorDraft.get('actorTypeKey').value = circleTypeKey;
                circleActorDraft.get('instance').wrapped = circelDraft;
                // circelDraft.get('x').value = 332;
                // circelDraft.get('y').value = 100 * i + 52;
                // circelDraft.get('radius').value = 43;
                layerDraft.get('activeActors').push(circleActorDraft);
            }
            const LinoOfTextTypeKey = 'LineOfTextActorModel'
              , lotDraft = getDraftFor(LinoOfTextTypeKey, activeActors.dependencies)
              , lotActorDraft = ActorModel.createPrimalDraft(activeActors.dependencies)
              ;
            lotActorDraft.get('actorTypeKey').value = LinoOfTextTypeKey;
            lotActorDraft.get('instance').wrapped = lotDraft;
            // lotDraft.get('text').value = 'Hello World';
            layerDraft.get('activeActors').push(lotActorDraft);

            setTimeout(this._changeStateHandler(()=>{
                const activeActors = this.getEntry(this.parentAPI.rootPath + '/activeActors/1/instance/activeActors');
                activeActors.push(actorDraft);
            }), 1000);
        }), 1000);
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
