/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
  //  Path
  //, getEntry
  //, ForeignKey
  // , unwrapPotentialWriteProxy
  //, StateComparison
    CoherenceFunction
  , BooleanModel
  //, StringModel
  , NumberModel
  //, ValueLink
  //, InternalizedDependency
  //, _AbstractStructModel
  //, _AbstractListModel
  //, _AbstractSimpleOrEmptyModel
  , _AbstractNumberModel
  //, FreezableMap
} from '../metamodel.mjs';

import {
    UIToggleButton
  // , StaticTag
  // , StaticNode
  // , DynamicTag
  , UINumberInput
  // , UINumberAndRangeInput
  // , UINumberAndRangeOrEmptyInput
  // , UILineOfTextInput
  // , MoveItemsInListButton
} from './generic.mjs';

export * from './animation-t-generator.mjs';
export * from './ui-time-control-circle.mjs';
export * from './animation-animanion.mjs';

             // TODO: as a "circular" value this could be sanitized to
             // keep it's position when it is outside of it's bounds.
             // Maybe a "CircularNumber" or so is required.
export const TNumberModel = _AbstractNumberModel.createClass('TNumberModel'
        , {min: 0, max:1, defaultValue: 0})
  , timeControlModelMixin = Object.freeze([
    CoherenceFunction.create(
    ['t', 'playing', 'duration', 'isLoop', 'perpetual'],
    function prepare(
        {t, playing, duration, isLoop, perpetual}) {
        if(t.value === undefined)
            t.value = 0;
        if(playing.value === undefined)
            playing.value = false;
        if(isLoop.value === undefined)
            isLoop.value = false;
        if(perpetual.value === undefined)
            perpetual.value = true;
        if(duration.value === undefined)
            duration.value = 1;// 1 second
    })
  , CoherenceFunction.create(
        ['playing', 'duration'], function protectPlaying({playing, duration}) {
        // NOTE: This is actually a nice use case for coherence functions.
        if(duration.value === 0)
            playing.value = false;
    })
  , ['t', TNumberModel]
  , ['duration', NumberModel] // in seconds
  , ['isLoop', BooleanModel] // connect end with beginning and transition
  , ['perpetual', BooleanModel] // never stop playback
  , ['playing', BooleanModel]
]);

// FIXME: this should become a stand alone widget, but for ow it's quicker
// to do it like this.
// NOTE: i.e. that all goes always into zone main is not ideal
//       a container type would probably offer more control.
export function getBasicPlayerControlWidgets(options={zone:'main'}) {
    return {
        playing: [
            {...options}
          , [
                ['playing', 'boolean']
            ]
          , UIToggleButton
          , 'playing'
          , '⏸︎ pause'
          , '▶ play'
          , 'Toggle animation play/pause.'
        ]
      , isLoop: [
            // This should not be to control to play repeatedly
            // or not. Loop !== play repeatedly.
            {...options}
          , [
                ['isLoop', 'boolean']
            ]
          , UIToggleButton
          , 'is-loop'
          , 'is a loop'
          , 'is end to end'
          , 'Connect end with start and transition.'
        ]
      , perpetual: [
            // This should not be to control to play repeatedly
            // or not. Loop !== play repeatedly.
            {...options}
          , [
                ['perpetual', 'boolean']
            ]
          , UIToggleButton
          , 'perpetual'
          , '⟳ is repeating'
          , '→ is playing once'
          , 'Toggle perpetual playback.'
        ]
      , duration: [
            {...options}
          , [
                ['duration', 'value']
            ]
          , UINumberInput
          , 'Time Duration' // label
          , 'seconds'// unit
          , {min:0} // minMaxValueStep => set attribute
          , ['ui_time_control-duration']
        ]
    }
}
