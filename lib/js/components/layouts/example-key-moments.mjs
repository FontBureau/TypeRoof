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
  , LineOfTextInput
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





const FontSizeModel = _AbstractSimpleOrEmptyModel.createClass(NumberModel)
  , KeyMomentModel = _AbstractStructModel.createClass(
        'KeyMomentModel'
      , CoherenceFunction.create(['fontSize', 'duration'],  function setDefaults({fontSize, duration}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            // if(fontSize.isEmpty) {
            //     // This is sketchy, font-size is very specific
            //     // to the actual layout usually.
            //     fontSize.value = 36;
            // }
            if(duration.value === undefined) {
                duration.value = 1;
            }
        })
      , ['label', StringModel]
      , ['fontSize', FontSizeModel]
        // duration is nice, as it makes the list order relevant
        // it's also good enough to construct a complete timeline.
        // Editing actions, such as drag and drop, may have to work
        // around some of the usability issues when doing just simple
        // editing, however, for playing the animation, this is probably
        // really nice. E.g. editing changing absolute time positions
        // will touch many keymoments. One really nice thing about this is
        // that an animation loop can easily be constructed because there's
        // a duration between the last and the first moment.
        // Duration can describe the time span before the key moment or
        // after it. After seems like a first natural impulse, but before
        // has it's merits as well, so the moment marks the end state of
        // the the transformation that happens during duration.
        //
        // This should be a relative number, relative
        // to the absolute animation time, such that all durations added
        // together represent the full playing time and the absolute duration
        // of this key frame = animationDuration * (duration/allDurations)
        //
      , ['duration', NumberModel]
        // in === out BUT with a duration of 0 out can be moved
        // to the next moment, without intermediate values.
      , ['manualAxesLocations', ManualAxesLocationsModel]
    )
  , KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
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
        // not sure I want to keep the next two like this, but it's
        // easier to get started like this right now.
      , ['activeKeyMoment', new ForeignKey('keyMoments', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
        // we are editing this one I guess, could get removed again though!
      , ['keyMoment', new ValueLink('activeKeyMoment')]
        // need more controls
      , ['t', NumberModel]
      , ['duration', NumberModel] // in seconds
      , ['isLoop', BooleanModel] // connect end with beginning and transition
      , ['perpetual', BooleanModel] // never stop playback
      , ['playing', BooleanModel]
    )
  ;

class KeyMomentsTimeline extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="key_moments_timeline">
        <h3>Key-Moments Timeline</h3>
        <ol class="key_moments_timeline-items"></ol>
        <div>
            <button class="key_moments_timeline-add_moment" title="Add Moment">+ add</button><!--
            --><button class="key_moments_timeline-remove_moment" title="Remove Active Moment">- remove</button>
        </div>
        <div>
            <button class="key_moments_timeline-select_previous" title="Select Previous">⇤ select previous</button><!--
            --><button class="key_moments_timeline-select_next" title="Select Next">select next ⇥</button>
        </div>
</div>`;
    static KEY_MOMENT_BUTTON_TEMPLATE=`<li>
    <button class="key_moments_timeline-button" title="Select"></button>
</li>`;
    //jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element, this.itemsContainer, this.addButton, this.removeButton
            , this.previousButton, this.nextButton] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , itemsContainer = element.querySelector('.key_moments_timeline-items')
          , addButton = element.querySelector('.key_moments_timeline-add_moment')
          , removeButton = element.querySelector('.key_moments_timeline-remove_moment')
          , previousButton = element.querySelector('.key_moments_timeline-select_previous')
          , nextButton = element.querySelector('.key_moments_timeline-select_next')
          ;
        addButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoment = this.getEntry('activeKeyMoment')
              ;
            const [index, newEntry] = activeKeyMoment.value !== ForeignKey.NULL
                ? [
                    // Insert after active entry.
                    parseInt(activeKeyMoment.value, 10) + 1
                    // Insert a copy of the active entry.
                    // Not sure if unwrapPotentialWriteProxy is required,
                    // but it doesn't hurt.
                  , unwrapPotentialWriteProxy(keyMoments.get(activeKeyMoment.value))
                  ]
                : [
                    // just insert at end
                    keyMoments.size
                    // FIXME: duplication, seen in model coherenceFunction "prepare"!
                  , keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies)
                  ]
                ;
            // TODO: For KeyMomentsModel _AbstractListModel should have a
            // coherence function that can do this kind of thing (creating
            // a unique label). From within the coherence function of the
            // KeyMomentModel, we can't determine the position or current
            // uniquenes of the label.
            // Though, it also is kind of hart to determine from such a method
            // if the KeyMoment needs an auto label or if the state is intended.
            const labels = new Set([...keyMoments]
                    .map(([/* key */, keyMoments])=>keyMoments.get('label').value))
              // + 1 so we don't have "Key Moment 0" at first position ...
              , formatLabel=counter=>`Key Moment ${counter + 1}`
              ;
            // insert
            keyMoments.splice(index, 0, newEntry.isDraft ? newEntry.metamorphose({}) : newEntry);
            // create a label
            let labelCounter = index
              , label = formatLabel(labelCounter)
              ;
            while(labels.has(label)) {
                if(labelCounter < keyMoments.size-1)
                    // only the first try creates a label for the
                    // correct position, after we just do append
                    labelCounter = keyMoments.size-1;
                else
                    labelCounter += 1;
                label = formatLabel(labelCounter);
            }
            keyMoments.get(index).get('label').value = label;

            // select new entry
            activeKeyMoment.value = `${index}`;
        }));
        removeButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoment = this.getEntry('activeKeyMoment')
              ;
            if(activeKeyMoment.value !== ForeignKey.NULL)
                keyMoments.delete(activeKeyMoment.value);
        }));

        const _changeActiveMoment = changeAmount=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoment = this.getEntry('activeKeyMoment')
              , size = keyMoments.size
              ;
            if(size === 0)
                return ForeignKey.NULL;
            const maxIndex = size - 1;
            let newIndex;
            if(activeKeyMoment.value === ForeignKey.NULL) {
                if(changeAmount === 0)
                    newIndex = ForeignKey.NULL;
                else if(changeAmount > 0)
                    // (maxIndex + 1) % size === 0
                    newIndex = (maxIndex + changeAmount) % size;
                else
                    // (size - 1) % size = maxIndex
                    newIndex = (size + changeAmount) % size;
            }
            else {
                const current = parseInt(activeKeyMoment.value, 10);
                newIndex = (current + changeAmount) % size;
            }
            if(newIndex < 0)
                // We've used % size everywhere, thus this will result
                // in a valid index.
                newIndex = size + newIndex;
            activeKeyMoment.value = typeof newIndex === 'number'
                                            ? `${newIndex}`
                                            : newIndex
                                            ;
        };
        previousButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(-1);
        }));
        nextButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(+1);
        }));

        this._insertElement(element);
        return [element, itemsContainer, addButton, removeButton
              , previousButton, nextButton];
    }
    _createKeyMomentButton(key, keyMoment) {
        const listItem = this._domTool.createFragmentFromHTML(this.constructor.KEY_MOMENT_BUTTON_TEMPLATE).firstElementChild
          , button = listItem.querySelector('.key_moments_timeline-button')
          , label = keyMoment.get('label')
          ;
        button.append(label.value
                    ? `${label.value}`
                      // Can't create a label with the same content that
                      // appers in an <em>, so they can also be displayed
                      // distinguishable.
                    : this._domTool.createElement('em', null, `(empty label)`)
        );
        button.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const activeKeyMoment = this.getEntry('activeKeyMoment');
            activeKeyMoment.value = (activeKeyMoment.value === key)
                ? ForeignKey.NULL // unselect if active button is clicked
                : key
                ;
        }));
        return [listItem, button];
    }
    initialUpdate(rootState) {
        const compareResult = StateComparison.createInitial(rootState, this.parentAPI.wrapper.dependencyMapping);
        this.update(compareResult);
    }
    update(compareResult) {
        // console.log(`${this.constructor.name}.update(compareResult):`, compareResult);
        // compareResult.toLog();
        // console.log('dependencyMapping', this.parentAPI.wrapper.dependencyMapping);
        const changedMap = compareResult.getChangedMap(this.parentAPI.wrapper.dependencyMapping);
        // console.log('compareResult.getChangedMap(this.parentAPI.wrapper.dependencyMapping)', changedMap);
        // console.log('compareResult.getDetaislMap()', compareResult.getDetaislMap());

        // TODO: try out changing based on LIST_NEW_ORDER state
        if(changedMap.has('keyMoments')) {
            const keyMoments = changedMap.get('keyMoments')
              , activeKeyMoment = changedMap.has('activeKeyMoment')
                     ? changedMap.get('activeKeyMoment')
                     : this.getEntry('activeKeyMoment')
                // FIXME: I really dislike having to set state that
                //        did not change: need a way for this to be
                //        less effort!
                //        The pattern can be found more often above as well!
              , activeKey = activeKeyMoment.value === ForeignKey.NULL
                        ? null
                        : activeKeyMoment.value
              ;

            this.previousButton.disabled = keyMoments.size < 2;
            this.nextButton.disabled = keyMoments.size < 2;

            this._domTool.clear(this.itemsContainer);
            for(const [key, keyMoment] of keyMoments) {
                const [li] = this._createKeyMomentButton(key, keyMoment);
                if(activeKey === key)
                    li.classList.add('active');
                this.itemsContainer.append(li);
            }
        }

        if(changedMap.has('activeKeyMoment')) {
            const activeKeyMoment = changedMap.get('activeKeyMoment')
              , activeIndex = activeKeyMoment.value === ForeignKey.NULL
                        ? null
                        : parseInt(activeKeyMoment.value, 10)
              ;

            this.removeButton.disabled = activeIndex === null;

            for(const[i, li] of Array.from(this.itemsContainer.children).entries()){
                if(activeIndex === i)
                    li.classList.add('active');
                else
                    li.classList.remove('active');
            }
        }
    }
}

function* enumerate(iterable) {
    let i=0;
    for(const value of iterable) {
        yield [i, value];
        i =+ 1;
    }
}

/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* keyMomentPropertyGenerator(keyMoment) {
    // hard coded fontSize
    // FIXME: note that value === undefined is expected!!
    //        requires a new Type!!
    const manualAxesLocations = keyMoment.get('manualAxesLocations')
      , fontSize = keyMoment.get('fontSize')
      , autoOPSZ = manualAxesLocations.get('autoOPSZ').value
      ;
    if(!fontSize.isEmpty) {
        yield ['fontSize', fontSize.value];
        if(autoOPSZ)
            yield [`axesLocations/opsz`, fontSize.value];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = manualAxesLocations.get('axesLocations');
    for(const [axisTag, axisValue] of axesLocations) {
        if(autoOPSZ && axisTag === 'opsz')
            // The model could prevent this from happening!
            continue;
        // other than fontSize axesLocations are just not present when at
        // their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

function getPropertyToKeyMoments(keyMoments, isLoop) {
    let fullDuration = 0;
    const propertyToKeyMoments = new Map()
      , tToKeyMoments = new Map()
      ;
    let loopCloseDuration = 0;
    for(const [i, [key, keyMoment]] of enumerate(keyMoments)) {
        const momentDuration = parseFloat(keyMoment.get('duration').value);
        if(i === 0) {
            // if(!isLoop)
            //     PASS!
            //     In a start to end style, the first moment is at 0
            //     Also the full duration is shorter in the non-loop case,
            //     as one interval, between last moment and first moment
            //     is not played.
            if(isLoop)
            //     In a loop, the first moment is at 0 but
            //     the momentDuration is added to the end of the loop
            //     so that the first moment is still at t = 0. However,
            //     the last moment is not at t = 1 anymore.
                loopCloseDuration = momentDuration;
        }
        else
            // This is important, so we know that the order in
            // propertyToKeyMoment.keys() is sorted.
            // momentDuration must not be negative ever!
            fullDuration += momentDuration;
        const momentT = fullDuration;

        // Very similar to propertyData, but for all keyMoments
        if(!tToKeyMoments.has(momentT))
            tToKeyMoments.set(momentT, []);
        tToKeyMoments.get(momentT).push([key, keyMoment]);

        for(const [propertyName, propertyValue] of keyMomentPropertyGenerator(keyMoment)) {
            if(!propertyToKeyMoments.has(propertyName))
                propertyToKeyMoments.set(propertyName, new Map());

            const propertyData = propertyToKeyMoments.get(propertyName);
            if(!propertyData.has(momentT))
                // Must be a list, so momentDuration can be zero.
                // This means we can have at the same moment a different
                // value incoming and outgoing, a step without transition.
                // When two consecutive moments define a property.
                // A third, fourth etc. moment in between won't have an
                // efect though.
                propertyData.set(momentT, []);
            propertyData.get(momentT).push({key, keyMoment, propertyValue});
        }
    }
    fullDuration += loopCloseDuration;

    propertyToKeyMoments.isLoop = isLoop;
    propertyToKeyMoments.fullDuration = fullDuration;

    tToKeyMoments.isLoop = isLoop;
    tToKeyMoments.fullDuration = fullDuration;
    // this should be cached
    return [propertyToKeyMoments, tToKeyMoments];
}

 /**
 * This function takes in an ordered array of growing, unique numbers (values)
 * and a target number (target).
 * It returns an array of two indices based on the following conditions:
 * - If values is empty => [null, null]
 * - If target < values[0] (the first element) => [0, null]
 * - If target > values[values.length-1] (the last element)=> [null, values.length-1]
 * - If target is equal to an element in values => [index, index]
 *      where index is the position of target in values.
 * - If target is between two entries => [leftIndex, rightIndex]
 *      where leftIndex is the position of the element less than target
 *      and rightIndex is the position of the element greater than target.
 */
function binarySearch(values, target) {
    if(values.length === 0)
        return [null, null];
    let left = 0
      , right = values.length - 1
      ;
    if(target < values[left])
        return [left, null];
    else if(target > values[right])
        return [null, right];

    while(left <= right) {
        const mid = Math.floor((left + right) / 2);
        if(values[mid] === target)
            // direct hit
            return [mid, mid];
        else if(values[mid] < target)
            left = mid + 1;
        else
            right = mid - 1;
    }
    // at this point left > right, otherwise the loop would still run
    return [right, left];
}

function identity(value) {
    return value;
}

function interpolate(t, a, b) {
    return ((b - a) * t) + a;
}

function getPropertyValue(fullDuration, isLoop, propertyData, t) {
    // Get the two keyMoments that specify a value for it before and
    // after global absoluteT.
    // For this, we should be able to use a binary search!

    const absoluteT = t * fullDuration
      , momentTs = [...propertyData.keys()]
      , [left, right] = binarySearch(momentTs, absoluteT)
      ;
    if(left === null && right === null)
        // shouldn't happen, as in that case propertyToKeyMoment
        // should not have an entry for propertyName, there are
        // no keys...
       throw new Error(`ASSERTION FAILED propertyData must not be  empty.`);
    if(left === null) {
        // We are right of the last entry.

        if(right !== momentTs.length - 1)
            throw new Error(`ASSERTION FAILED: unkown state right "${right}" shoud be ${momentTs.length - 1}.`);

        // If we are not in a loop, the value won't change anymore.
        if(!isLoop) {
            const fromMomentTKey = momentTs[right]
              , fromMomentData = propertyData.get(fromMomentTKey).at(-1)
              ;
            return fromMomentData.propertyValue;
        }

        // coming from the last key
        const fromMomentTKey = momentTs[right]
          , fromMomentT = fromMomentTKey
            // get the last entry, as this is outgoing
          , fromMomentData = propertyData.get(fromMomentTKey).at(-1) // => {key, keyMoment, propertyValue}
            // as absoluteT is right of the last frame, we move
            // toMomentT to where it would be if positioned after fromMomentT on the right.
          , toMomentTKey = momentTs[0]
          , toMomentT = fullDuration + toMomentTKey
          ;
        // Here's an ege case: in a loop with just one keyMoment and a
        // duration of zero we can't interpolate anything as
        // toMomentT === fromMomentT
        // partially copied from the right === null case!
        if(toMomentT === fromMomentT)
            // This is the moment result value .at(-1);
            return fromMomentData.propertyValue;

        // get the first entry, as this is incomning
        const toMomentData = propertyData.get(toMomentTKey).at(0) // => {key, keyMoment, propertyValue}
            // The easing function (as well as the duration) is always
            // coming from the toMoment.
            // FIXME: 'easing' key is not implemented in keyMoment
            //        Also, it may not directly contain a function
            // identity equals linear easing
          , easingFunction = toMomentData.keyMoment.get('easing', {value: identity}).value
            // absolute T is now far on the right, and toMoment
            // has been moved accordingly.
          , localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
          , easedT = easingFunction(localT)
          ;
        return interpolate(easedT, fromMomentData.propertyValue, toMomentData.propertyValue);
    }
    if(left === right) {
        // Interesting since we can have possibly different in and
        // out values when there are multiple moments at this position.
        // But for an animation it doesn't matter much, we can just
        // pick one: going with the last, as that is the final result
        // of this moment.
        // For the UI, it's interesting how we're going to step through
        // the keyMoments when inspecting, maybe we can have a second
        // argument in that case, or we do not even run this method
        // in that case.
        //
        // momentTs[left] === momentTs[right]
        // Divide by zero, Hence there's nothing to interpolate between:
        //       (absoluteT - momentT) / (momentT - momentT)
        //       absoluteT - momentT / 0
        const momentT = momentTs[left]
           // the last enty is the result of the moment
          , momentData = propertyData.get(momentT).at(-1)
          ;
        return momentData.propertyValue;
    }
    if(right === null) {
        // This means we're left from the first index,
        // must assert we're in a loop, otherwise the first
        // index is always 0, and the lowest t is also 0, thus
        // when t === 0 then [left, right] === [0, 0]
        if(!isLoop) {
            // This happens, e.g.:
            //      not a loop,  has 3 keyMoments, but this property has
            //      only one keyMoment on the right side, e.g. at duration 3
            //      so, each absolute duration < 3 doesn't find
            const toMomentTKey = momentTs[left]
              , toMomentData = propertyData.get(toMomentTKey).at(-1)
              ;
            return toMomentData.propertyValue;
        }

        // Here's an annoying up edge case:
        // The last fromMoment on the timeline for this property, can
        // have a distance to fullDuration when the property doesn't
        // change anymore in the last moments. The annoying thing is, this
        // means  the duration of toMomentT is not the actual duration
        // between the changes of the property.
        // Hence we do: fromMomentT = fromMomentTKey - fullDuration
        // and the actual duration is Math.abs(fromMomentTKey) + toMomentT

        // coming from the last key
        const fromMomentTKey = momentTs[momentTs.length - 1]
            // negative or zero: the time at the end of the full timeline
            // that must be considered, when this is negative the
            // calculation of localT is still correct, as the magnitude
            // between the frames is increased, because fromMomentT
            // is now (potentially) just moved into the negative space
            // otherwise, in this case fromMomentT would always be 0.
          , fromMomentT = fromMomentTKey - fullDuration
            // get the last entry, as this is outgoing
          , fromMomentData = propertyData.get(fromMomentTKey).at(-1) // => {key, keyMoment, propertyValue}
          , toMomentT = momentTs[left]
          ;
        // Here's an ege case: in a loop with just one keyMoment and a
        // duration of zero we can't interpolate anything as
        // toMomentT === fromMomentT
        if(toMomentT === fromMomentT)
            // This is the moment result value .at(-1);
            return fromMomentData.propertyValue;

        // get the first entry, as this is incomning
        const toMomentData = propertyData.get(toMomentT).at(0) // => {key, keyMoment, propertyValue}
            // The easing function (as well as the duration) is always
            // coming from the toMoment.
            // FIXME: 'easing' key is not implemented in keyMoment
            //        Also, it may not directly contain a function
            // identity equals linear easing
          , easingFunction = toMomentData.keyMoment.get('easing', {value: identity}).value
            // absoluteT is between fromMomentT and toMomentT
            // Though in this case, fromMomentT is 0, as this is
            // the beginning of the loop
            // In any other case:
            // localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
          , localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
          , easedT = easingFunction(localT)
          ;
        return interpolate(easedT, fromMomentData.propertyValue, toMomentData.propertyValue);
    }
    else {
        if(right - left !== 1)
            throw new Error(`ASSERTION FAILED left [${left}] and right [${right}] should`
                    + ` be directly next to each other but the distance is not 1: ${right - left}.`);

        const fromMomentT = momentTs[left]
            // get the last entry, as this is outgoing
          , fromMomentData = propertyData.get(fromMomentT).at(-1) // => {key, keyMoment, propertyValue}
          , toMomentT = momentTs[right]
            // get the first entry, as this is incomning
          , toMomentData = propertyData.get(toMomentT).at(0) // => {key, keyMoment, propertyValue}
            // The easing function (as well as the duration) is always
            // coming from the toMoment.
            // FIXME: 'easing' key is not implemented in keyMoment
            //        Also, it may not directly contain a function
            // identity equals linear easing
          , easingFunction = toMomentData.keyMoment.get('easing', {value: identity}).value
            // absoluteT is between fromMomentT and toMomentT
            // Though in this case, fromMomentT is 0, as this is
            // the beginning of the loop
            // In any other case:
          , localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
          , easedT = easingFunction(localT)
          ;
        return interpolate(easedT, fromMomentData.propertyValue, toMomentData.propertyValue);
    }
}

function getPropertyValues(propertyToKeyMoments, t /* between 0 and 1*/) {
    const {fullDuration, isLoop} = propertyToKeyMoments
      , propertyValues = new Map()
      ;
    for(const [propertyName, propertyData] of propertyToKeyMoments) {
        const value = getPropertyValue(fullDuration, isLoop, propertyData, t);
        propertyValues.set(propertyName, value);
    }
    return propertyValues;
}

/**
 * This is a central class to propagate animation property values
 * without going via the model. I.e. stuff that is not part of the
 * model, but derrived from it.
 * It should be defined before all of its users, so its values
 * are updated when the users update and read them.
 * Its users in turn should listen to updates of all of its dependencies,
 * so they in turn don't miss a value change.
 * FIXME: This method could (should?) be formalized, so we never miss
 * changes to dependency values and hence likely make the code overall
 * leaner. But with `parentAPI.getWidgetById` we can start to explore
 * this kind of value propagation, without having to create a more generic
 * mechanism right away.
 * In general, for each component, no matter if it renders anything, it
 * should be possible to expose this kind of behavior.
 */
class AnimationLiveProperties extends _BaseComponent {
    constructor(parentAPI) {
        super(parentAPI);
        this.isLoop = null;
        this.keyMoments = null;
        this.t = null;
        // propertyToKeyMoments is a Map, but it also has the
        // properties fullDuration and isLoop. It could be considered
        // duplication to store isLoop in here as well, but on the other
        // hand, they are expected to by in sync anyways.
        this.propertyToKeyMoments = null;
        this.tToKeyMoments = null;
        this.propertyValuesMap = null;
    }

    update(changedMap) {
        if(changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const keyMoments = changedMap.has('keyMoments')
                    ? changedMap.get('keyMoments')
                    : this.getEntry('keyMoments')
              , isLoop = (changedMap.has('isLoop')
                    ? changedMap.get('isLoop')
                    : this.getEntry('isLoop')).value
                // when either keyMoments or isLoop change
              , [propertyToKeyMoments, tToKeyMoments] = getPropertyToKeyMoments(keyMoments, isLoop)
              ;
            this.isLoop = isLoop;
            this.keyMoments = keyMoments;
            // FIXME: to be at the same position after isLoop changed
            //        we likely have to transfrom t to accomodate that!
            //        Don't know where and how at the moment.
            //        Also don't know whether this is desirable.
            this.propertyToKeyMoments = propertyToKeyMoments;
            this.tToKeyMoments = tToKeyMoments;
        }

        if(changedMap.has('t') || changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const t = (changedMap.has('t')
                            ? changedMap.get('t')
                            : this.getEntry('t')).value
              , propertyValuesMap = getPropertyValues(this.propertyToKeyMoments, t /* between 0 and 1*/)
              ;
            this.t = t;
            this.propertyValuesMap = propertyValuesMap;
        }
    }
}

class AnimationInfo extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="animation_info">
        <h3>Animation Info</h3>
        <h4>Simple Fields</h4>
        <ol class="animation_info-simple_fields"></ol>
        <h4>Properties</h4>
        <ol class="animation_info-properties"></ol>
        <div class="animation_info-sample">Sample Text</div>
</div>`;
    //jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        this._simpleKeys = ['t', 'duration', 'isLoop', 'perpetual', 'playing'];
        this._simpleFields = {
            set(key, value) {
                this[key].textContent=value;
            }
        };
        this._propertyFields = new Map();

        // 'keyMoments' + 'duration' => show a timeline
        //                 use t to show where on the timeline we are
        // 'activeKeyMoment': could be color coded on the timeline
        [this.element, this._propertiesContainer, this._sample] = this.initTemplate();
    }

    _createSimpleDisplayElement(key, value, label=null) {
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

    _createSimpleField(key, value, label=null) {
        const [container, valueContainer] = this._createSimpleDisplayElement(key, value, label);
        this._simpleFields[key] = valueContainer;
        return container;
    }

    _setPropertiesToInfo(propertyValuesMap) {
         // delete disappeared properties
        for(const [key, [container]] of [...this._propertyFields]) {
            if(propertyValuesMap.has(key))
                continue;
            container.remove();
            this._propertyFields.delete(key);
        }
        // create
        const containers = []; // ensure the order in propertyValuesMap
        for(const [key, value] of propertyValuesMap) {
            if(this._propertyFields.has(key)) {
                const [container, valueContainer] = this._propertyFields.get(key);
                valueContainer.textContent = `${value}`;
                containers.push(container);
            }
            else {
                const [container, valueContainer] = this._createSimpleDisplayElement(key, value);
                this._propertyFields.set(key, [container, valueContainer]);
                containers.push(container);
            }
        }
        // (re-)insert in correct order.
        this._propertiesContainer.append(...containers);
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , simpleFieldsContainer = element.querySelector('.animation_info-simple_fields')
          , propertiesContainer = element.querySelector('.animation_info-properties')
          , sample = element.querySelector('.animation_info-sample')
          ;

        for(const key of this._simpleKeys) {
            const entry = this.getEntry(key)
              , container = this._createSimpleField(key, entry.value)
              ;
            if(key === 'duration')
                container.append(' seconds');
            simpleFieldsContainer.append(container);
        }

        simpleFieldsContainer.append(this._createSimpleField('fullDuration', 0, 'full duration'));
        this._insertElement(element);
        return [element, propertiesContainer, sample];
    }

    _setPropertiesToSample(propertyValuesMap) {
        const axisPrefix = 'axesLocations/';

        if((propertyValuesMap.has('fontSize')))
            this._sample.style.setProperty('font-size', `${propertyValuesMap.get('fontSize')}pt`);

        const variations = [];
        for(const [key, value] of propertyValuesMap) {
            if(!key.startsWith(axisPrefix))
                continue;
            const axisTag = key.slice(axisPrefix.length);
            variations.push(`"${axisTag}" ${value}`);
        }
        this._sample.style.setProperty('font-variation-settings', variations.join(','));
    }

    // 'keyMoments'
    // 'activeKeyMoment'
    // 't'
    // 'duration' // in seconds
    // 'isLoop' // never stop playback
    // 'playing'
    update(changedMap) {
        for(const key of this._simpleKeys) {
            if(!changedMap.has(key)) continue;
            const entry = changedMap.get(key)
              , valueText = typeof entry.value === 'boolean'
                        ? (entry.value && 'True' || 'False')
                        : entry.value
              ;
            this._simpleFields.set(key, valueText);
        }
        const liveProperties = {
            _instance: null
          , get:key=>{
                if(liveProperties._instance === null)
                     liveProperties._instance = this.parentAPI.getWidgetById('AnimationLiveProperties');
                return liveProperties._instance[key];
            }
        };

        if(changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const propertyToKeyMoments = liveProperties.get('propertyToKeyMoments');
            // console.log('propertyToKeyMoments', propertyToKeyMoments);
            this._simpleFields.set('fullDuration', propertyToKeyMoments.fullDuration);
        }

        if(changedMap.has('font')) {
            const font = changedMap.get('font').value;
            this._sample.style.setProperty('font-family', `"${font.fullName}"`);
        }

        if(changedMap.has('t') || changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const propertyValuesMap = liveProperties.get('propertyValuesMap');
            // console.log('propertyValuesMap', propertyValuesMap);
            this._setPropertiesToInfo(propertyValuesMap);
            this._setPropertiesToSample(propertyValuesMap);
        }
    }
}

class KeyMomentController extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        const widgets = [
            [
                {zone: 'main'}
              , []
              , StaticTag
              , 'h3'
              , {}
              , 'Key-Moment'
            ]
            // label
          , [
                {zone: 'main'}
              , [
                    ['label', 'value']
                ]
              , LineOfTextInput
              , 'Label'
            ]
            // duration
          , [
                {zone: 'main'}
              , [
                    ['duration', 'value']
                ]
              , UINumberInput
              , 'Relative Duration' // label
              , '/ Full Relative Duration'// unit
              , {min:0} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'main'}
              , [
                    ['fontSize', 'value']
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , 'key_moment-font_size' // base-id
              , 'Font-Size' // label
              , 'pt'// unit
              , {min:0, max:244, step:1, 'default': 36} // minMaxValueStep => set attribute
            ]
            , [
                {zone: 'main'}
              , [
                    ['fontSize', 'fontSize']
                  , ['/font', 'font']
                  , ['manualAxesLocations/axesLocations', 'axesLocations']
                  , ['manualAxesLocations/autoOPSZ', 'autoOPSZ']
                ]
              , UIManualAxesLocations
            ]
        ];

        const myParentAPI = {
            ...parentAPI
          , getEntry: (externalName) => {
                // rootPath e.g.: /activeState/keyMoment
                // externalName e.g.: /activeState/keyMoment/fontSize
                if(this.parentAPI.rootPath.isRootOf(externalName)) {
                    // FIXME: this is a hack: resolving the linl to edit
                    //        in here should not be required.
                    //        but keyMoments is a ValueLink
                    const rest = Path.fromString(externalName).parts.slice(this.parentAPI.rootPath.parts.length)
                      , basePath = this.parentAPI.rootPath.append('..')
                      , keyMoments = parentAPI.getEntry(basePath.append('keyMoments')) // linked list
                      , activeKeyMoment = parentAPI.getEntry(basePath.append('activeKeyMoment')) // foreign key
                      , restPath = Path.fromParts(activeKeyMoment.value, ...rest)
                      ;
                    return getEntry(keyMoments, restPath);
                }
                return parentAPI.getEntry(externalName);
            }
        };
        super(myParentAPI, zones, widgets);
    }
}

class ExampleKeyMomentsController extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {id: 'AnimationLiveProperties'}
              , ['t', 'keyMoments', 'isLoop']
              , AnimationLiveProperties
            ]
          , [
                {zone: 'main'}
              , [
                    ['keyMoments', 'keyMoments']
                  , ['activeKeyMoment', 'activeKeyMoment']
                ]
              , KeyMomentsTimeline
            ]
          , [
                {zone: 'main'}
              , [
                    ['keyMoments', 'list']
                  , ['activeKeyMoment', 'key']
                ]
              , MoveItemInListButton
              , MoveItemInListButton.BACKWARD // action
            ]
          , [
                {zone: 'main'}
              , [
                    ['keyMoments', 'list']
                  , ['activeKeyMoment', 'key']
                ]
              , MoveItemInListButton
              , MoveItemInListButton.FORWARD // action
            ]
          , [
                {zone: 'main'}
              , [
                    ['playing', 'boolean']
                ]
              , UIToggleButton
              , 'playing'
              , 'pause'
              , 'play'
              , 'Toggle animation play/pause.'
            ]
          , [
                // This should not be to control to play repeatedly
                // or not. Loop !== play repeatedly.
                {zone: 'main'}
              , [
                    ['isLoop', 'boolean']
                ]
              , UIToggleButton
              , 'is-loop'
              , 'is a loop'
              , 'is end to end'
              , 'Connect end with start and transition.'
            ]
          , [
                // This should not be to control to play repeatedly
                // or not. Loop !== play repeatedly.
                {zone: 'main'}
              , [
                    ['perpetual', 'boolean']
                ]
              , UIToggleButton
              , 'perpetual'
              , 'play once'
              , 'repeat'
              , 'Toggle perpetual playback.'
            ]
          , [
                {zone: 'main'}
              , [
                    ['duration', 'value']
                ]
              , UINumberInput
              , 'Time Duration' // label
              , 'seconds'// unit
              , {min:0} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'main'}
              , [
                    't', 'playing', 'isLoop', 'keyMoments'
                  , 'activeKeyMoment'
                ]
              , UITimeControlKeyMomentSelectCircle
            ]
          , [
                {zone: 'before-layout'}
              , [
                    ['keyMoments', 'keyMoments']
                  , ['activeKeyMoment', 'activeKeyMoment']
                  , ['t', 't']
                  , ['duration', 'duration'] // in seconds
                  , ['isLoop', 'isLoop'] // never stop playback
                  , ['perpetual', 'perpetual']
                  , ['playing', 'playing']
                  , ['../font', 'font']
                ]
              , AnimationInfo
            ]
          , [
                {
                   rootPath: parentAPI.rootPath.append('keyMoment')
                 , activationTest:()=>{
                        const path = parentAPI.rootPath.append('keyMoment')
                          , keyMoment = this.parentAPI.getEntry(path)
                          ;
                        return keyMoment !== ForeignKey.NULL; // i.e. it's a KeyMomentModel
                   }
                }
              , []
              , KeyMomentController
              , zones
            ]
            // FIXME: should be after KeyMomentController
            //        can be achieved when we put placeholders into
            //        the zone upon creation of this element!
            //        the placeholder should be removed again eventually though.
          , [
                {zone: 'main'}
              , [
                    ['t', 'value']
                ]
              , UINumberAndRangeInput
              , 't' // base-id
              , 'Animation T' // label
              , null// unit
              , {min:0, max:1, value:0, step:0.001} // minMaxValueStep => set attribute
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}


export {
    KeyMomentsModel
  , KeyMomentModel
  , ExampleKeyMomentsLayoutModel as Model
  , ExampleKeyMomentsController as Controller
};
