/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    Path
  , getEntry
  , ForeignKey
  , unwrapPotentialWriteProxy
  , StateComparison
  , CoherenceFunction
  , BooleanModel
  , StringModel
  , NumberModel
  , ValueLink
  , _AbstractStructModel
  , _AbstractListModel
  , _AbstractSimpleOrEmptyModel
} from '../../metamodel.mjs';


import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    Model as ManualAxesLocationsModel
} from '../ui-manual-axis-locations.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
} from '../basics.mjs';

import {
    UIToggleButton
  , StaticTag
  , UINumberInput
  , UINumberAndRangeInput
  , UINumberAndRangeOrEmptyInput
  , UILineOfTextInput
  , MoveItemInListButton
} from '../generic.mjs';

import {
    AnimationTGenerator
} from '../animation-t-generator.mjs';

import {
    UIManualAxesLocations
} from '../ui-manual-axis-locations.mjs';

import {
    UITimeControlKeyMomentSelectCircle
} from '../ui-time-control-circle.mjs';


  list of many Links: ForeignKey/ValueLink
  A Link would contain a struct that has a ValueLink and a ForeignKey

  That Link would be the Model of a List/OrderedMap
  that List is in a parent struct
  that parent struct owns the list from which we link
  so, it should be possible, from the parent struct to get the draft
  of the original linked item.contents
  And, since we don't do this from the Model Layer, it should be possible
  to do with a custom "widgetBus.getEntry" implementation, that just knows
  how stuff is meant to stick together.
  The Link struct itself could even carry more metdata around, like when
  to start playing, x/y transformations, colors


// AxesLocationsModel and from ManualAxesLocationsModel the CoherenceFunction sanitizeAxes
// are very nice. As mentioned before, something like a coherence function for
// _AbstractOrderedMapModel would be as nice as for _AbstractListModel. In that
// case that `sanitizeAxes` could be directly part of AxesLocationsModel.
// Not sure, so far, if autoOPSZ if ManualAxesLocationsModel is actually
// required here.
// fontSize and potentially other animated properties must have a
// value that can be NOTDEF, I'd prefer an explicit Value for this stuff.
// ALSO: should start to implement value checking/sanitizing types.
// I may want to fork UIManualAxesLocations anyways, as I think I might
// need more different behavior, and keeping it won't make things easier.
// Maybe, as of a changed architecture, it will then make sense to backport
// some of this effort to UIManualAxesLocations.
// So far, however, keeping ManualAxesLocationsModel is OK, could remove
// the "manual" from the name.



Lists of links will be useful to put:

KeyMoments animations as "actors" onto a stage, combining then into a movie.
An because they come from a library of actors, it should be possible to
reuse them as well.

Select many KeyMoments in the keyMoments example, e.g. by time or just by
multiple select...




  , KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
  , ActiveKeyMoment = _AbstractStructModel.createClass(
        'ActiveKeyMoment'
        // requires "keyMoments" as a dependency from parent
        // I'm not sure if this is considered as an option already!
        // Actually, It should probably be removed if it doesn't exist,
        // Could probably happen in CoherenceFunction:
        // ALLOW_NULL is not required, as ActiveKeyMoments can be empty...
      , ['activeKeyMoment', new ForeignKey('keyMoments', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
        // we are editing this one I guess, could get removed again though!
        // editing also means to resolve the link to get a proper draft!
      , ['keyMoment', new ValueLink('activeKeyMoment')]
        // Depending on the use case we may want to store more data alongside.
        // e.g. x/y displacement or transformation matrix of an actor.
        // This is about being able to select more than one key-moment in
        // ExampleKeyMomentsLayoutModel but within
        // ExampleKeyMomentsLayoutModel the data for an 'Actor' is embeded
        // And at some point we want to have a list of Actors and arrange
        // them on a Stage, for that, also a list or dict of references
        // needs to be created.
    )
  , ActiveKeyMoments = _AbstractListModel.createClass('ActiveKeyMoment', KeyMomentModel)
  , ExampleKeyMomentsLayoutModel = _BaseLayoutModel.createClass(
        'ExampleKeyMomentsLayoutModel'
        , CoherenceFunction.create(
                  [/*'keyMoments'*/'t', 'playing', 'duration', 'isLoop', 'perpetual'],
                function prepare(
                  {/*keyMoments*/t, playing, duration, isLoop, perpetual}) {
            // if(keyMoments.size === 0) {
            //     // we could also push two initial keyframes as it is the
            //     // basis for an animation, one keyframe is just static.
            //     // TODO: the _AbstractListModel should have method to
            //     //       create a primalState of its members directly.
            //     keyMoments.push(keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies));
            // }
            if(t.value === undefined)
                t.value = 0;
            if(playing.value === undefined)
                playing.value = false;
            if(isLoop.value === undefined)
                isLoop.value = true;
            if(perpetual.value === undefined)
                perpetual.value = true;
            if(duration.value === undefined)
                duration.value = 1;// 1 second
        })
        , CoherenceFunction.create(
            ['playing', 'duration'], function protectPlaying({playing, duration}) {
            // NOTE: This is actually a nice use case for coherence functions.
            if(duration.value === 0) {
                playing.value = false;
            }
        })
      , ['keyMoments', KeyMomentsModel]
      , ['activeKeyMoments', ActiveKeyMoments]
        // need more controls
      , ['t', NumberModel]
      , ['duration', NumberModel] // in seconds
      , ['isLoop', BooleanModel] // connect end with beginning and transition
      , ['perpetual', BooleanModel] // never stop playback
      , ['playing', BooleanModel]
    )
  ;



export {
    ExampleKeyMomentsLayoutModel as Model
  , ExampleKeyMomentsController as Controller
};
