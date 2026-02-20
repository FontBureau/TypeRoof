/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
  _AbstractSimpleOrEmptyModel
} from '../../metamodel.mjs';

import {
    initAvailableActorTypes
} from './actors-base.mjs';

import {
    ActorRendererContainer
} from './active-actors-rendering-controller.mjs';

import {
    LayerActorModel
  , LayerActorRenderer
} from './layer.mjs';

import {
    CircleActorRenderer
  , RectangleActorRenderer
  , CircleActorModel
  , RectangleActorModel
} from './simple-svg.mjs';

import {
    LineOfTextActorModel
  , LineOfTextActorRenderer
} from './line-of-text.mjs';


import {
    VideoproofArrayActorModel
  , VideoproofArrayActorRenderer
  , VideoproofArrayV2ActorModel
  , VideoproofArrayV2CellActorModel
  , VideoproofArrayV2ActorRenderer
} from './videoproof-array.mjs';

export const [/*referencableActorTypes*/, activatableActorTypes] = initAvailableActorTypes([
        ['LayerActorModel', 'Layer', LayerActorModel]
        // there could be an alias (so users would find "Groups" as well
        // even though it is the same:
        // ['LayerActorModel', 'Group', LayerActorModel]
        // , [referenceTypeKey, 'Reference', ReferenceActorModel]
      , ['CircleActorModel', 'Circle', CircleActorModel]
      , ['RectangleActorModel', 'Rectangle', RectangleActorModel]
      , ['LineOfTextActorModel', 'Line of Text', LineOfTextActorModel]
      , ['VideoproofArrayActorModel', 'Videoproof Array', VideoproofArrayActorModel]
      , ['VideoproofArrayV2ActorModel', 'Videoproof Array V2', VideoproofArrayV2ActorModel]
      , ['VideoproofArrayV2CellActorModel', 'Videoproof Array V2 Cell', VideoproofArrayV2CellActorModel]
    ])
  //, ReferencableActorsModel = _AbstractStructModel.createClass(
  //      'ReferencableActorsModel'
  //    , ['activeActors', ActorsModel]
  //      // this, so hope, is the magic piece to allow here just a subset
  //      // of all available actors.
  //    , ['referencableActors', new InternalizedDependency('referencableActorTypes', AvailableActorTypesModel)]
  //  )
  ;

/**
 * To be injected into ActiveActorsRenderingController as getActorWidgetSetup
 */

export function getActorWidgetSetup(setup) {
    const {typeClass, zones
            , widgetRootPath=null
            , widgetRelativeRootPath=null
            } = setup;

    // FIXME: This maps ActorModels to ActorRenderers, but that
    // should be done in a better organized fashion, as the amount
    // of actors will grow.
    if(typeClass === CircleActorModel) {
        return [
            {
                rootPath: widgetRootPath
              , relativeRootPath: widgetRelativeRootPath
            }
          , []
          , ActorRendererContainer
          , zones
          , CircleActorRenderer
          , []
        ];
    }
    if(typeClass === RectangleActorModel) {
        return [
            {
                rootPath: widgetRootPath
              , relativeRootPath: widgetRelativeRootPath
            }
          , []
          , ActorRendererContainer
          , zones
          , RectangleActorRenderer
          , []
        ];
    }
    if(typeClass === LineOfTextActorModel) {
        return [
            {
                rootPath: widgetRootPath
              , relativeRootPath: widgetRelativeRootPath
            }
          , []
          , ActorRendererContainer
          , zones
          , LineOfTextActorRenderer
          , [
                ['font', 'font']
            ]
        ];
    }
    if(typeClass === VideoproofArrayActorModel) {
        const KeyMomentModel = VideoproofArrayActorModel.fields.get('keyMoments').Model
          , charGroupOptionsModel = KeyMomentModel.fields.get('charGroup').fields.get('options')
          , isOrEmpty = charGroupOptionsModel.prototype instanceof _AbstractSimpleOrEmptyModel
          , charGroupsData = (isOrEmpty
                                  ? charGroupOptionsModel.Model
                                  : charGroupOptionsModel).charGroupsData
          ;
        return [
            {
                rootPath: widgetRootPath
              , relativeRootPath: widgetRelativeRootPath
            }
          , []
          , ActorRendererContainer
          , zones
          , VideoproofArrayActorRenderer
          , [
                ['font', 'font']
            ]
          , charGroupsData
        ];
    }

    if(typeClass === VideoproofArrayV2ActorModel) {
        const KeyMomentModel = VideoproofArrayV2ActorModel.fields.get('keyMoments').Model
          , charGroupOptionsModel = KeyMomentModel.fields.get('charGroup').fields.get('options')
          , isOrEmpty = charGroupOptionsModel.prototype instanceof _AbstractSimpleOrEmptyModel
          , charGroupsData = (isOrEmpty
                                  ? charGroupOptionsModel.Model
                                  : charGroupOptionsModel).charGroupsData
          ;
        return [
            {
                rootPath: widgetRootPath
              , relativeRootPath: widgetRelativeRootPath
            }
          , []
          , ActorRendererContainer
          , zones
          , VideoproofArrayV2ActorRenderer
          , [
                ['font', 'font']
                // includes added/removed actors, but also insignificant
                // changes for cell width calculation, like actor colors
              , 'activeActors'
                // includes changes to charGroups, but also insignificant
                // changes for cell width calculation, like colors
              , 'keyMoments'
            ]
          , zones
          , charGroupsData
        ];
    }

    if(typeClass === LayerActorModel) {
        const {layerBaseClass} = setup;
         return [
            {
                rootPath: widgetRootPath
              , relativeRootPath: widgetRelativeRootPath
            }
          , []
          , LayerActorRenderer
          , zones
          , layerBaseClass
          , getActorWidgetSetup
        ];
    }
    const {typeLabel='Unkown Label', typeKey='UnkownKey'} = setup;
    throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup for typeClass: ${typeClass.name} label: "${typeLabel}" key: ${typeKey}`);
}

const LEAF_NODE_TYPE = Symbol('LEAF_NODE_TYPE')
  , CONTAINER_NODE_TYPE = Symbol('CONTAINER_NODE_TYPE')
  ;
export function getActorTreeNodeType(actor) {
    const typeKey = actor.get('actorTypeKey').value
      , actorTypeModel = actor.get('actorTypeModel')
      , typeLabel = actorTypeModel.get('label').value
      , typeClass = actorTypeModel.get('typeClass').value
          // FIXME: very useful disambiguation, should be commonly available!
      , leafNodeTypes = new Set([CircleActorModel, RectangleActorModel
            , LineOfTextActorModel, VideoproofArrayActorModel, VideoproofArrayV2CellActorModel])
      , containerNodeTypes = new Set([LayerActorModel, VideoproofArrayV2ActorModel])
      , isLeafNode = typeClass=>leafNodeTypes.has(typeClass)
      , isContainerNode = typeClass=>containerNodeTypes.has(typeClass)
      ;
    if(isLeafNode(typeClass))
        return LEAF_NODE_TYPE;
    if(isContainerNode(typeClass)){
        return CONTAINER_NODE_TYPE;
    }
    throw new Error(`KEY ERROR  getActorTreeNodeType for actor with key: ${typeKey} typeClass: ${typeClass.name} label: "${typeLabel}"`);
}
getActorTreeNodeType.LEAF_NODE_TYPE = LEAF_NODE_TYPE;
getActorTreeNodeType.CONTAINER_NODE_TYPE = CONTAINER_NODE_TYPE;

// FIXME: we should detect this differently, not hard coded.
export function isTypographicActorTypeKey(typeKey) {
    const typographicTypeKeys = new Set(['LayerActorModel', 'LineOfTextActorModel'
        , 'VideoproofArrayActorModel', 'VideoproofArrayV2ActorModel'
        , 'VideoproofArrayV2CellActorModel']);
    return typographicTypeKeys.has(typeKey);
}

/**
 * These "widgetKeys" must be known to the caller or otherwise it may fail.
 */
export function getActorTypeKeySpecificWidgets(typeKey) {
    const widgetKeys = [];
    if(['LayerActorModel', 'LineOfTextActorModel', 'VideoproofArrayActorModel'
      , 'VideoproofArrayV2ActorModel', 'VideoproofArrayV2CellActorModel'].includes(typeKey))
        widgetKeys.push('FontSelect');
    if(typeKey === 'LayerActorModel')
        widgetKeys.push('ContainerTaskAutomations');
    return widgetKeys;
}

