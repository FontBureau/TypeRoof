/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    _BaseContainerComponent
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    StaticTag
  , StaticNode
  , UINumberAndRangeInput
  , MoveItemsInListButton
} from '../generic.mjs';

import {
    AnimationTGenerator
  , UITimeControlKeyMomentSelectCircle
  , getBasicPlayerControlWidgets
  , LocalScopeAnimanion
  , AnimationLiveProperties
  , AnimationInfo
}  from '../animation-fundamentals.mjs';

import {
    KeyMomentController
  , KeyMomentsController
  , AnimationSample
  , _setActiveKeyMomentsValues
  , activeKeyMomentsSortedKeys
  , KeyMomentsTimeline
  , fontSizeGen
  , axisLocationsGen
  , Model as ExampleKeyMomentsLayoutModel
} from './example-key-moments.mjs';

import {
    UIReactTimeControl
} from '../react-examples/react-time-control/react-time-control.jsx';


import {
    ReactRoot
} from '../react-integration.jsx';

import {
   Counter as ReactCounter
} from '../react-examples/react-counter.jsx';

import {
   UIReactTimeControl as UIReactTimeControlAlt
} from '../react-examples/react-time-control-alternative.jsx';


class ExampleReactController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('animationProperties@'));
        const activeKeyMomentsMain = widgetBus.domTool.createElement('div')
          , zones = new Map([['activeKeyMomentsMain', activeKeyMomentsMain],..._zones])
          , widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {
                    'animationProperties@': widgetBus.rootPath.toString()
                }
              , [['t', 'globalT'], 'keyMoments', 'isLoop']
              , AnimationLiveProperties
              , function initAnimanion(keyMoments, isLoop) {
                    // jshint validthis:true
                    // This makes it possible for fontSize to be a dependency of
                    // the axisLocations. Required for opsz with autoOPSZ = true and
                    // no explicitly set fontSize on the same keyMoment.
                    return new LocalScopeAnimanion([fontSizeGen, axisLocationsGen], keyMoments, isLoop);
                }
            ]
          , [
                {zone: 'main'}
              , [
                    ['keyMoments', 'keyMoments']
                  , ['activeKeyMoments', 'activeKeyMoments']
                  , [`animationProperties@${widgetBus.rootPath.toString()}`, 'animationProperties@']
                ]
              , KeyMomentsTimeline
            ]
          , [
                {zone: 'main'}
              , [
                    ['keyMoments', 'list']
                  , ['activeKeyMoments', 'keys']
                ]
              , MoveItemsInListButton
              , MoveItemsInListButton.BACKWARD // action
              , activeKeyMomentsSortedKeys
              , _setActiveKeyMomentsValues
            ]
          , [
                {zone: 'main'}
              , [
                    ['keyMoments', 'list']
                  , ['activeKeyMoments', 'keys']
                ]
              , MoveItemsInListButton
              , MoveItemsInListButton.FORWARD // action
              , activeKeyMomentsSortedKeys
              , _setActiveKeyMomentsValues
            ]
          , ... Object.values(getBasicPlayerControlWidgets())
          , [
                {zone: 'main'}
              , [
                    't', 'playing'
                  , 'activeKeyMoments'
                  , [`animationProperties@${widgetBus.rootPath.toString()}`, 'animationProperties@']
                ]
              , UITimeControlKeyMomentSelectCircle
            ]
          , [
                {zone: 'before-layout'}
              , [
                    ['keyMoments', 'keyMoments']
                  , ['t', 't']
                  , ['duration', 'duration'] // in seconds
                  , ['isLoop', 'isLoop'] // never stop playback
                  , ['perpetual', 'perpetual']
                  , ['playing', 'playing']
                  , [`animationProperties@${widgetBus.rootPath.toString()}`, 'animationProperties@']
                ]
              , AnimationInfo
            ]
          , [
                {zone: 'before-layout'}
              , [
                    'keyMoments', 't', 'isLoop'
                  , ['../font', 'font']
                  , 'animationProperties@'
                ]
              , AnimationSample
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , activeKeyMomentsMain
            ]
          , [
                // changed zones above to contain activeKeyMomentsMain
                {zone: 'activeKeyMomentsMain'}
              , []
              , StaticTag
              , 'h2'
              , {}
              , 'Selected Key Moments'
            ]
            , [
                {}
              , [
                    ['activeKeyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into activeKeyMomentsMain
              ,  new Map([..._zones, ['main', activeKeyMomentsMain]]) // zones
              // , 'keyMoment' // itemEntryPath within the item at itemsCollectionName[i]
              , KeyMomentController
             ]
            // FIXME: should be after KeyMomentsController
            //        can be achieved when we put placeholders into
            //        the zone upon creation of this element!
            //        the placeholder should be removed again eventually though.
          , [
                {zone: 'main'}
              , [
                    ['t', 'value']
                ]
              , UINumberAndRangeInput
              , 'Animation T' // label
              , null// unit
              , {min:0, max:1, value:0, step:0.001} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'main'}
              , ['t', 'playing', 'duration']
              , ReactRoot
              , UIReactTimeControl
            ]
          , [
                {zone: 'main'}
              , [[ `${widgetBus.rootPath.append('duration')}`, 'counterPath']]
              , ReactRoot
              , ReactCounter
              ]
          , [
                {zone: 'main'}
              , [
                    [`${widgetBus.rootPath.append('t')}`, 'tPath']
                  , [`${widgetBus.rootPath.append('playing')}`, 'playingPath']
                  , [`${widgetBus.rootPath.append('duration')}`, 'durationPath']
                ]
              , ReactRoot
              , UIReactTimeControlAlt
            ]
        ];
        super(widgetBus, zones, widgets);
    }
    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}


class ExampleReactModel extends ExampleKeyMomentsLayoutModel{}

export {
    ExampleReactModel as Model
  , ExampleReactController as Controller
};
