/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
} from '../../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , HANDLE_CHANGED_AS_NEW
} from '../basics.mjs';

export class ActorRendererContainer extends _BaseContainerComponent {
    constructor(widgetBus, zones, ActorRenderer, actorDependencyMappings, ...args) {
        const widgets = [
            [
                { zone: 'layer' }
              , [
                    'animationProperties@'
                  , ['/activeState/t', 'globalT']
                  , ...actorDependencyMappings
                ]
              , ActorRenderer
              , ...args
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}

/**
 * dynamically provision widgets for actors in rootPath + "activeActors"
 *
 * StageAndActorsModel has ActorReferencesModel activeActors
 * LayerActorModel has ActorReferencesModel activeActors
 */
export class ActiveActorsRenderingController extends _BaseDynamicCollectionContainerComponent {
    // FIXME: a lot of this is copied from KeyMomentsController
    // so both should be taken to form a unified _BaseDynamicCollectionContainerComponent ...
    // This, however, is only READING for rendering, not writing so far
    // hence no need for a _redirectedGetEntry so far.
    constructor(widgetBus, zones, layerBaseClass, getActorWidgetSetup){
        super(widgetBus, zones);
        this._layerBaseClass = layerBaseClass;
        this.__getActorWidgetSetup = getActorWidgetSetup;
    }

    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getActorWidgetSetup(rootPath) {
        const actor = this.getEntry(rootPath)
          , typeKey = actor.get('actorTypeKey').value
          , actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , typeClass = actorTypeModel.get('typeClass').value
          ;
        return this.__getActorWidgetSetup({
            actor, typeKey, actorTypeModel, typeLabel, typeClass
          , widgetRootPath: rootPath
          , widgetRelativeRootPath: Path.fromParts('.', 'instance')
          , zones: this._zones
          , layerBaseClass: this._layerBaseClass
          , getActorWidgetSetup: this.__getActorWidgetSetup
        });
    }
    _createWrapper(rootPath) {
        const
            // how does this work?
            //,  childWidgetBus = Object.assign(Object.create(this._childrenWidgetBus), {
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
            childWidgetBus = this._childrenWidgetBus
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getActorWidgetSetup(rootPath)
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}
