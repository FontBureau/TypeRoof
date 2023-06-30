/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
     Path
  , getEntry
  , ForeignKey
  // , unwrapPotentialWriteProxy
  // , StateComparison
   , CoherenceFunction
  // , BooleanModel
  , StringModel
  , NumberModel
  , ValueLink
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractListModel
  , _AbstractGenericModel
  , _AbstractSimpleOrEmptyModel
  // , FreezableMap
  , StaticDependency
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
  , _CommonContainerComponent
} from '../basics.mjs';

import {
    StaticNode
} from '../generic.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    timeControlModelMixin
  , AnimationTGenerator
  , UITimeControlCircle
  , getBasicPlayerControlWidgets
  , Animanion
  , AnimationLiveProperties
  , AnimationInfo
  , keyMomentModelMixin
}  from '../animation-fundamentals.mjs';

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
    ])
    //)

  , KeyMomentModel = _AbstractStructModel.createClass(
        'KeyMomentModel'
      , ...keyMomentModelMixin
      // , ['fontSize', FontSizeModel]
      // , ['manualAxesLocations', ManualAxesLocationsModel]
      , ...propertiesModelMixin
    )
    // Order is really most important here, however, _AbstractOrderedMapModel
    // could still be an option, then move "label" as unique identifier in
    // here. However, this works good enough.
  , KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
  ;

export class _BaseActorModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ['keyMoments',KeyMomentsModel]
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
                            , ['availableActorTypes'])]//, 'referenceableActors' ??? ])]
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
  , LayerActorModel = _BaseActorModel.createClass(
        'LayerActorModel'
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
      , CoherenceFunction.create(
            ['x', 'y', 'radius']
          , function setDefaults({x, y, radius}) {
            if(x.value === undefined)
                x.value = 0;
            if(y.value === undefined)
                y.value = 0;
            if(radius.value === undefined)
                radius.value = 50;
        })
      , ['radius', NumberModel]
      , ['x', NumberModel]
      , ['y', NumberModel]
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
      , ['keyMoments', KeyMomentsModel]
      , CoherenceFunction.create(
            ['width', 'height', 'availableActorTypes', 'activeActors']
          , function setDefaults({width, height, availableActorTypes, activeActors}) {
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
                  , actorDraft = ActorModel.createPrimalDraft({availableActorTypes})
                  ;
                actorDraft.get('actorTypeKey').value = circleTypeKey;
                actorDraft.get('instance').wrapped = circelDraft;
                circelDraft.get('x').value = 32;
                circelDraft.get('y').value = 32;
                circelDraft.get('radius').value = 123;
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
    update(changeMap) {
        if(changeMap.has('radius')) {
            const radius = changeMap.get('radius').value;
            for(const [element, attr, value] of [
                    [this.element, 'viewBox', `-${radius} -${radius} ${2*radius} ${2*radius}`]
                  , [this.circle, 'r', `${radius}`]
            ]) {
                 element.setAttribute(attr, value);
            }
            this.element.style.setProperty('width', `${2*radius}px`);
            this.element.style.setProperty('height', `${2*radius}px`);
        }
        for(const [property, cssProperty] of [['x', 'left'], ['y', 'top']]) {
            if(!changeMap.has(property))
                continue;
            const value = changeMap.get(property).value;
            this.element.style.setProperty(cssProperty, `${value}px`);
        }
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
                  , zone: 'layer'
                }
            , [ 'x', 'y', 'radius' ]
            , CircleActorRenderer
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
        // calling super early without widgets is only required when
        // the widgets definition requires the `this` keyword.

        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , []
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
                {id: 'AnimationLiveProperties'}
              , ['t', 'keyMoments', 'isLoop']
              , AnimationLiveProperties
              , function initAnimanion(keyMoments, isLoop) {
                    // jshint validthis:true
                    // This makes it possible for fontSize to be a dependency of
                    // the axisLocations. Required for opsz with autoOPSZ = true and
                    // no explicitly set fontSize on the same keyMoment.

                    // const outerAnimanion = new Animanion(null, fontSizeGen, keyMoments, isLoop);
                    // return new Animanion(outerAnimanion, axisLocationsGen, keyMoments, isLoop);
                    function*emptyGen(){} //jshint ignore:line
                    return new Animanion(null, emptyGen, keyMoments, isLoop);
                }
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
                ]
              , AnimationInfo
              , 'AnimationLiveProperties'
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

    update(changeMap) {
        const editingActor = changeMap.has('editingActor')
            ? changeMap.get('editingActor')
            : this.getEntry('editingActor')
            ;
        if(changeMap.has('activeActors')) {
            const activeActors = changeMap.get('activeActors')
              , basePath = Path.fromParts('./')
              ;
            this._domTool.clear(this._actorsElement);
            this._actorsElement.append(...this._renderLayer(basePath, activeActors));
            if(!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        }
        else if(changeMap.has('editingActor')) {
            this._markActiveItems(...(editingActor.isEmpty ? [] : [editingActor.value]));
        }
    }
}

class CommonActorProperties extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="common_actor_properties">
    <h3>Actor Properties</h3>
    <span></span>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, typeKey) {
        super(parentAPI);
        this._typeKey = typeKey;
        console.log(`NEW ${this.constructor.name} #${this._typeKey}:`);
        [this.element] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
            // 'LayerActorModel' => layer_actor_model'
          , classPart = this._typeKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
          ;
        element.classList.add(`common_actor_properties-${classPart}`);
        element.querySelector('span').textContent = this._typeKey;
        this._insertElement(element);
        return [element];
    }
    update(changeMap) {
        console.log(`${this.constructor.name}.update #${this._typeKey}:`, changeMap.keys(), ...changeMap);
        if(changeMap.has('...')) {

        }
    }
}


class ActorPropertiesManager extends _CommonContainerComponent {
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

    _createWrappers(actorPath, actor) {
        const typeKey = actor.get('actorTypeKey').value
          , actorsPath = Path.fromString(this.parentAPI.getExternalName('actors'))
          // , actorTypeModel = actor.get('actorTypeModel')
          // , typeLabel = actorTypeModel.get('label').value
          // , typeClass = actorTypeModel.get('typeClass').value
          // actor.get('instance')
          , widgetRootPath = actorsPath.append(...actorPath, 'instance')
          ;
        const widgets = [
            [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                ]
              , CommonActorProperties // Constructor
              , typeKey
              // , ...args
            ]
            // TODO: add widgets for specific aspects of the actorType
        ];
        // this._initWrapper(this._childrenParentAPI, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenParentAPI, ...widgetArgs));
    }

    _provisionWidgets(compareResult) {
        const changeMap = compareResult.getChangedMap(this.parentAPI.wrapper.dependencyMapping, true)
          , actorPathOrEmpty = changeMap.has('actorPath')
                ? changeMap.get('actorPath')
                : this.getEntry('actorPath')
           , actors = changeMap.has('actors')
                ? changeMap.get('actors')
                : this.getEntry('actors')
           , actor = !actorPathOrEmpty.isEmpty
                  // If path can't be resolved actor becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                ? getEntry(actors, actorPathOrEmpty.value, null)
                : null
           , actorTypeKey = actor === null ? null : actor.get('actorTypeKey').value
           , typeChanged = this._currentActorTypeKey !== actorTypeKey
           , rebuild = changeMap.has('actorPath') || typeChanged
           ;
        this._currentActorTypeKey = actorTypeKey;

        if(actor === null || rebuild) {
            // deprovision widgets
            for(const widgetWrapper of this._widgets)
                widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set();

        // Keeping for debugging for now:
        // console.log(`${this.constructor.name}._provisionWidgets(compareResult):`, ...changeMap.keys()
        //     , `\n actor !== null`, actor !== null
        //     , `\n changeMap.has('actorPath')`, changeMap.has('actorPath')
        //     , `\n typeChanged`, typeChanged, `actorTypeKey`, actorTypeKey
        //     , `\n rebuild`, rebuild
        // )

        if(actor !== null && rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            const widgetWrappers = this._createWrappers(actorPathOrEmpty.value, actor);
            this._widgets.push(...widgetWrappers);
            for(const widgetWrapper of widgetWrappers) {
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }
}

class StageAndActorsController extends _BaseContainerComponent {
    constructor(parentAPI, _zones) {
        const zones = new Map([..._zones, ['layer', _zones.get('layout')]])
          , widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , ... Object.values(getBasicPlayerControlWidgets('before-layout'))
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
                ]
              , ActorPropertiesManager
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
                circelDraft.get('x').value = 332;
                circelDraft.get('y').value = 100 * i + 52;
                circelDraft.get('radius').value = 43;
                layerDraft.get('activeActors').push(circleActorDraft);
            }

            setTimeout(this._changeStateHandler(()=>{
                const activeActors = this.getEntry(this.parentAPI.rootPath + '/activeActors/1/instance/activeActors');
                activeActors.unshift(actorDraft);
            }), 3000);


        }), 2000);
    }
}

export {
    StageAndActorsModel as Model
  , StageAndActorsController as Controller
};
