/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
} from '../../metamodel.mjs';

import {
    _BaseDynamicCollectionContainerComponent
  , _BaseContainerComponent
  , HANDLE_CHANGED_AS_NEW
} from '../basics.mjs';

import {
    getActorTreeNodeType
} from './available-actors.mjs';

import {
    AnimationLiveProperties
}  from '../animation-animanion.mjs';

class ActorsMeta extends _BaseDynamicCollectionContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
     constructor(widgetBus, zones, initAnimanionFn, isInheritingPropertyFn
            , widgets=[]) {
        super(widgetBus, zones, widgets);
        this._initAnimanionFn = initAnimanionFn;
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }
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
                    rootPath
                  , relativeRootPath: Path.fromParts('.', 'instance')
                  , 'animationProperties@': widgetRootPath.toString()
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                  , [`animationProperties@${widgetRootPath.append('..', '..', '..')}`, '@parentProperties']
                ]
              , AnimationLiveProperties
              , this._initAnimanionFn
              , this._isInheritingPropertyFn
            ];
        }
        else if(treeNodeType === getActorTreeNodeType.CONTAINER_NODE_TYPE) {
            return [
                {
                    rootPath
                  , relativeRootPath: Path.fromParts('.', 'instance')
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                    // parent is always three levels above from here
                    // as this is activeActors/{index}/instance
                  , [`animationProperties@${widgetRootPath.append('..', '..', '..')}`, '@parentProperties']
                ]
              , ContainerMeta
              , this._zones
              , this._initAnimanionFn, this._isInheritingPropertyFn
            ];
        }
        throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup actor ${actor} with tree node type ${treeNodeType.toString()}`);
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getActorWidgetSetup(rootPath)
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

/**
 * It's smarter to build the AnimationLiveProperties (and possibly other "meta data")
 * structure independent from StageHTML, as we may have different rendereing
 * targets, but the property propagation can and should be shared across.
 * Also, having the animationProperties@ registry relative to the top controller
 * of this module -- i.e. global -- makes this simple.
 */
export class ContainerMeta extends _BaseContainerComponent {
    constructor(widgetBus, zones, initAnimanionFn, isInheritingPropertyFn) {
        const widgets = [
            [
                {
                    'animationProperties@': widgetBus.rootPath.toString()
                }
              , [  ...widgetBus.wrapper.getDependencyMapping(widgetBus.wrapper.constructor.DEPENDECIES_ALL) ]
              , AnimationLiveProperties
              , initAnimanionFn // This usage instance won't receive parentProperties.
              , isInheritingPropertyFn
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActorsMeta
              , zones
              , initAnimanionFn, isInheritingPropertyFn
              , [] // widgets
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}
