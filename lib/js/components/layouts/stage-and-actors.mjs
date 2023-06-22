/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
  //   Path
  // , getEntry
    ForeignKey
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
  // , _AbstractSimpleOrEmptyModel
  // , FreezableMap
  , StaticDependency
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
} from '../basics.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

export class _BaseActorModel extends _AbstractStructModel{}
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
        // TODO make a Type new StaticDependency('availableActorTypes', AvailableActorTypesModel, availableActorTypes)]
      , ['availableActorTypes', new InternalizedDependency('availableActorTypes', AvailableActorTypesModel)]
      , ['actorTypeKey', new ForeignKey('availableActorTypes', ForeignKey.NOT_NULL, ForeignKey.SET_DEFAULT_FIRST)]
      , ['actorTypeModel', new ValueLink('actorTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicActorModel'
                            , _BaseActorModel
                            ,'actorTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , [])]
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
    , ActorsModel = _AbstractOrderedMapModel.createClass('ActorsModel', ActorModel)
      // This is very similar ActiveKeyMomentModel which was invented first
      // referencing an ActorModel item in ActorsModel with a 'state'
      // that is a _BaseActorModel
      // It is a _BaseActorModel so it can actually be referenced by it's
      // own type as well.
      // TODO: try and explain the behavior of recursive/self-references!
      // It's interesting though, as the metamodel likely has no issue with
      // this, but e.g. the UI and displaying/interpreting side could develop
      // issues.
    , ActorReferenceModel = _BaseActorModel.createClass(
        'ActorReferenceModel'
        // requires "actors" as a dependency from parent to be able to
        // point the ForeignKey into it we must define it as an InternalizedDependency
      , ['availableActors', new InternalizedDependency('availableActors', ActorsModel)]
        // This whole struct shouldn't exist if there's no actor
        // hence ForeignKey.NOT_NULL
      , ['key', new ForeignKey('availableActors', ForeignKey.NOT_NULL, ForeignKey.NO_ACTION)]
        // We are editing via this one I guess, editing also means to resolve
        // the link to get a proper draft from the parent that owns the actual
        // actor!
      , ['actor', new ValueLink('key')]
        // Depending on the use case we may want to store more data alongside.
        // e.g. x/y displacement or transformation matrix of an actor.
        //
        // When does the actor enter the stage? (default: t=0)
        // When does the actor leave the stage? (default t=1)
        // The above could be more sophisticated, the actor could be entereing
        // and leaving multiple times, but, that could also be done by
        // using multiple references.
        // It could also be realized using opacity, where a shortcut when
        // opacity is 0 would make sure the actor is not animated at all.
        // That way, stage presence can be implemented with key moments.
        // Otherwise, it could be a discrete number[0, 1] or a rounding
        // could be used.
        //
        // Mapping "global"-time-t to actor-t. E.g. the actor could
        // be playing in just a fraction of the stage time.
        // Also, t to actor-t: actor-t could be no-linear, could go backwards
        // etc. basically, we could have keyMoments to animate actorT.
        //
        // x and y: can be interpolated without any issues, rotation
        // would be more complex!
        // z: implementation dependent.
        //
        // scale: use one value as a uniform x/y scaling???
    )
  , ActorReferencesModel = _AbstractListModel.createClass('ActorReferencesModel', ActorReferenceModel)
    // A layer is a container or groupig for more actors.
    // could be called a "Group" in fact. Using "Layer" as it is a familiar
    // term for design tools. A "Group" is familiar as well, and I'm not
    // sure what the difference actually shold be, despite that the UIs
    // usually have less support for groups than for layers. It's
    // maybe a UI treatment difference.
  , LayerActorModel = _BaseActorModel.createClass(
        'LayerActorModel'
      , ['activeActors', ActorReferencesModel]
      , ['availableActors', new InternalizedDependency('availableActors', ActorsModel)]
        // this should also inherit or override all the properties.
        // especially size, x, y, z, t
    )
  , availableActorTypes = (()=>{
        const actorTypes = [
                ['LayerActorModel', 'Layer', LayerActorModel]
                // there could be an alias (so users would find "Groups" as well
                // even though it is the same:
                // ['LayerActorModel', 'Group', LayerActorModel]
              , ['ActorReferenceModel', 'Reference', ActorReferenceModel]
            ]
          , availableActorTypesDraft = AvailableActorTypesModel.createPrimalDraft({});
        for(const [key, label, Model] of actorTypes) {
            const availableActorType = AvailableActorTypeModel.createPrimalDraft({});
            availableActorType.get('typeClass').value = Model;
            availableActorType.get('label').value = label;
            availableActorTypesDraft.push([key, availableActorType]);
        }
        return availableActorTypesDraft.metamorphose();
    })()
  , StageAndActorsModel = _BaseLayoutModel.createClass(
        'StageAndActorsModel'
      , CoherenceFunction.create(['width', 'height', 'availableActorTypes']
         , function setDefaults({width, height, availableActorTypes}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            //
            // widht and heigth defaults could also be determined differently
            // this is simply to get started somewhere.
            if(width.value === undefined)
                width.value = 500;
            if(height.value === undefined)
                height.value = 500;
        })
        // very similar to Layer, we could even think about
        // using something like ['baseLayer', LayerActorModel]
      , ['activeActors', ActorReferencesModel]
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
                      , availableActorTypes
                      )
      , ['availableActors', ActorsModel]
      , ['width', NumberModel]
      , ['height', NumberModel]
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


class StageAndActorsController extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        const widgets = [
        ];
        super(parentAPI, zones, widgets);
    }
}


export {
    StageAndActorsModel as Model
  , StageAndActorsController as Controller
};
