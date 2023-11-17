/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    AvailableActorTypeModel
  , AvailableActorTypesModel
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

export const [/*referencableActorTypes*/, activatableActorTypes] = (()=>{
        const referenceTypeKey = 'ReferenceActorModel'
          , actorTypes = [
                ['LayerActorModel', 'Layer', LayerActorModel]
                // there could be an alias (so users would find "Groups" as well
                // even though it is the same:
                // ['LayerActorModel', 'Group', LayerActorModel]
            // , [referenceTypeKey, 'Reference', ReferenceActorModel]
              , ['CircleActorModel', 'Circle', CircleActorModel]
              , ['RectangleActorModel', 'Rectangle', RectangleActorModel]
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
  ;

/**
 * To be injected into ActiveActorsRenderingController as getActorWidgetSetup
 */
export function getActorWidgetSetup({actor, typeKey, actorTypeModel, typeLabel
                    , typeClass, widgetRootPath, zones, layerBaseClass
                    , getActorWidgetSetup}) {
    // FIXME: This maps ActorModels to ActorRenderers, but that
    // should be done in a better organized fashion, as the amount
    // of actors will grow.
    if(typeClass === CircleActorModel) {
        return [
            {
                rootPath: widgetRootPath
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
    if(typeClass === LayerActorModel) {
         return [
            {
                rootPath: widgetRootPath
            }
          , []
          , LayerActorRenderer
          , zones
          , layerBaseClass
          , getActorWidgetSetup
        ];
    }
    throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup for typeClass: ${typeClass.name} label: "${typeLabel}" key: ${typeKey}`);
}
