/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
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
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractListModel
  , _AbstractSimpleOrEmptyModel
  , FreezableMap
} from '../../metamodel.mjs';

import { zip } from '../../util.mjs';

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
  , StaticNode
  , DynamicTag
  , UINumberInput
  , UINumberAndRangeInput
  , UINumberAndRangeOrEmptyInput
  , LineOfTextInput
  , MoveItemsInListButton
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
  , ActiveKeyMoment = _AbstractStructModel.createClass(
        'ActiveKeyMoment'
        // requires "keyMoments" as a dependency from parent to be able to
        // point the ForeignKey into it we must define it as an InternalizedDependency
      , ['keyMoments', new InternalizedDependency('keyMoments', KeyMomentsModel)]
        // This whole struct shouldn't exist if there's no activeKeyMoment
        // hence ForeignKey.NOT_NULL
      , ['activeKey', new ForeignKey('keyMoments', ForeignKey.NOT_NULL, ForeignKey.NO_ACTION)]
        // We are editing via this one I guess, editing also means to resolve
        // the link to get a proper draft from the parent that owns the actual
        // keyMoment!
      , ['keyMoment', new ValueLink('activeKey')]
        // Depending on the use case we may want to store more data alongside.
        // e.g. x/y displacement or transformation matrix of an actor.
        // This is about being able to select more than one key-moment in
        // ExampleKeyMomentsLayoutModel but within
        // ExampleKeyMomentsLayoutModel the data for an 'Actor' is embeded
        // And at some point we want to have a list of Actors and arrange
        // them on a Stage, for that, also a list or dict of references
        // needs to be created.
    )
  , ActiveKeyMoments = _AbstractListModel.createClass('ActiveKeyMoments', ActiveKeyMoment)
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
      , CoherenceFunction.create(
            ['activeKeyMoments'], function sortActiveKeyMoments({activeKeyMoments}) {
            // NOTE: it's not terrible important for most operations to have this
            // sorted (or it's done with activeKeyMoments, but that one is older and may
            // become unnecessary by this sorting), however, in the UI KeyMomentController
            // to make use of LIST_NEW_ORDER it makes sense to have this sorted, otherwise,
            // that would have to be done in the UI element directly.
            // Using LIST_NEW_ORDER with an unordere list in this case doesn't make much sense.
            // It makes sense because the order of keyMoments is relevant
            // and we want to show the interfaces for the selected keyMoments (== activeKeyMoments)
            // in the same order, otherwise it could lead to confusion.
            //
            // FIXME: It would actually be very nice to have this as a CoherenceFunction
            // directly in the ActiveKeyMoments via _AbstractListModel, which is not
            // possible yet.
            const seen = new Set()
              , newOrder = Array.from(activeKeyMoments)
                .map(([/*key*/, item])=>[parseInt(item.get('activeKey').value, 10), item])
                .sort(([indexA, /*itamA*/], [indexB, /*itemB*/])=>indexA-indexB)
                .filter(([index, /*itam*/])=>{
                    // It makes sense in this case to remove possible duplicates
                    // even though so far there's no thing creating duplicates
                    // but this enforces existing assumptions.
                    if(seen.has(index)) return false;
                    seen.add(index);
                    return true;
                })
                .map(([/*index*/, item])=>item)
                ;
            activeKeyMoments.splice(0, Infinity, ...newOrder);
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

// FIXME: should be shared but is duplicated so far.
export function activeKeyMomentsSortedKeys(activeKeyMoments) {
    const indexes = new Set();
    for(const [/* key */, activeKeyMoment] of activeKeyMoments)
        indexes.add(activeKeyMoment.get('activeKey').value);

    return Array.from(indexes) // used a set to have only unique entries
            .map(i=>parseInt(i, 10)) // for the sort function
            .sort((a,b)=>a-b)
            .map(i=>`${i}`)
            ;
}

export function _setActiveKeyMomentsValues(activeKeyMoments, oldValue, newValue) {
    for(const [/* key */, activeKeyMoment] of activeKeyMoments) {
        const activeKey = activeKeyMoment.get('activeKey');
        if(activeKey.value === oldValue)
            activeKey.value = newValue;
    }
}

class KeyMomentsTimeline extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="key_moments_timeline">
        <h3>Key-Moments Timeline</h3>
        <ol class="key_moments_timeline-items"></ol>
        <div>
            <button class="key_moments_timeline-add_moment" title="Add Moment">+ add</button><!--
            --><button class="key_moments_timeline-remove_moment" title="Remove Active Moment">- remove</button><!--
            --><button class="key_moments_timeline-insert_moment" title="Insert Moment at t">⎀ insert</button>
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
          , insertButton = element.querySelector('.key_moments_timeline-insert_moment')
          , removeButton = element.querySelector('.key_moments_timeline-remove_moment')
          , previousButton = element.querySelector('.key_moments_timeline-select_previous')
          , nextButton = element.querySelector('.key_moments_timeline-select_next')
          ;

        insertButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , t
              , liveProperties = this.parentAPI.getWidgetById('AnimationLiveProperties')
              , absoluteT = t * liveProperties.fullDuration
              ;

            // - for t, get the absoluteT
            // - get the keyMoment after
            const momentTs = [...liveProperties.tToKeyMoments.keys()]
              , [left, right] = binarySearch(momentTs, absoluteT)


            - get it's duration => that will be split between the new moment
              and the moment after
            - get the position where to split

            I know fullDuration
            I know absoluteT
            I know afterMomentDuration
            I know momentT of afterMoment (right)
            beforeT = momentT - afterMomentDuration  === beforeMomentT === left

            newMomentDuration = absoluteT - beforeT
            newAfterMomentDuration = afterMomentDuration - newMomentDuration

        }));

        // The add button, its functionality, is not totally wrong, so
        // I keep it here for now and add alongside the "insert" button.
        // TODO: However, as it is right now, I prefer to add an empty/initial
        // keyMoment, rather than a copy of the current Moment.
        addButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = this.getEntry('activeKeyMoments')
                // last selected moment
              , activeKey = activeKeyMoments.size
                    // uses the logically/absolute last by value
                    ? activeKeyMomentsSortedKeys(activeKeyMoments).at(-1)
                    : null
              ;

            const [index, newEntry] = activeKey !== null
                ? [
                    // Insert after active entry.
                    parseInt(activeKey, 10) + 1
                    // Insert a copy of the active entry.
                    // Not sure if unwrapPotentialWriteProxy is required,
                    // but it doesn't hurt.
                  , unwrapPotentialWriteProxy(keyMoments.get(activeKey))
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
            // Though, it also is kind of hard to determine from such a method
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
            const newActiveKeyMoment = activeKeyMoments.constructor.Model
                        .createPrimalState(activeKeyMoments.dependencies) // activeKeyMoments.dependencies
                        .getDraft()
                        ;

            newActiveKeyMoment.get('activeKey').value = `${index}`;
            // clear all and select only the new entry:
            activeKeyMoments.splice(0, Infinity, newActiveKeyMoment);
        }));

        removeButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = this.getEntry('activeKeyMoments')
              , activeKeys = activeKeyMomentsSortedKeys(activeKeyMoments)
                    // delete higher indexes first, so lower indexes stay valid
                    .reverse()
              ;
            activeKeys.forEach(idx=>keyMoments.delete(idx));

            // FIXME: it would be nice if these entries could be made
            // to be deleted automatically, but so far I can't:
            activeKeyMoments.splice(0, Infinity);
            // ALSO TODO: we could as well select another KeyMoment if available, maybe.
        }));

        const _changeActiveMoment = changeAmount=>{
            if(changeAmount === 0)
                return;
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = this.getEntry('activeKeyMoments')
              , size = keyMoments.size
              ;
            if(size === 0)
                return;
            const maxIndex = size - 1;
            if(activeKeyMoments.size === 0) {
                // Nothing selected, pick first or last
                let newIndex = (changeAmount > 0)
                        // (maxIndex + 1) % size === 0
                        ? (maxIndex + changeAmount) % size
                        // (size - 1) % size = maxIndex
                        : (size + changeAmount) % size
                        ;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;
                const activeKeyMoment = activeKeyMoments.constructor.Model
                            .createPrimalState(activeKeyMoments.dependencies)
                            .getDraft()
                            ;
                activeKeyMoment.get('activeKey').value = `${newIndex}`;
                activeKeyMoments.push(activeKeyMoment);
                return;
            }
            // change all
            // FIXME: This basically overengineering, however, I use it to collect
            // experience how to deal with LIST_NEW_ORDER and in that regard
            // it makes sense not to change the items of activeKeyMoments.
            // When the knowledge is acquired this situation should be
            // reconsidered.
            // It's important to remember that the activeKeyMoments will
            // be sorted eventually by a CoherenceFunction.
            const reuse = new Map()
              , require = []
              ;
            // prepare
            for(const [,activeKeyMoment] of activeKeyMoments) {
                const activeKey = activeKeyMoment.get('activeKey')
                  , key = activeKey.value
                  ;
                if(!reuse.has(key))
                    reuse.set(key, []);
                reuse.get(key).push(activeKey);
                let newIndex = (parseInt(key, 10) + changeAmount) % size;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;
                const newKey = `${newIndex}`;
                require.push(newKey);
            }

            // find all keys that don't need changing because they can be
            // reused
            for(let i = require.length-1; i >= 0; i--) {
                const newKey = require[i];
                if(!reuse.has(newKey)) continue;
                const activeKey = reuse.get(newKey).pop();
                if(activeKey === undefined) {
                    // nothing to reuse for newKey
                    reuse.delete(newKey);
                    continue;
                }
                // reuse the activeKey by removing it from require
                require.splice(i, 1);
            }
            // Update each activeKey that remained in reuse with a newKey in require.
            const rest = Array.from(reuse.values()).flat();
            for(const newKey of require)
                // The count won't change so this always works.
                rest.pop().value = newKey;
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
            const activeKeyMoments = this.getEntry('activeKeyMoments')
              , remove = []
              ;
            for(const [i, activeKeyMoment] of activeKeyMoments) {
                if(activeKeyMoment.get('activeKey').value === key)
                    remove.push(i);
            }
            // If it is selected, unselect:
            if(remove.length) {
                remove.reverse();
                for(const i of remove)
                    activeKeyMoments.delete(i);
                return;
            }
            // It was not selected: add to selection
            const activeKeyMoment = activeKeyMoments.constructor.Model
                        .createPrimalState(activeKeyMoments.dependencies)
                        .getDraft()
               ;
            activeKeyMoment.get('activeKey').value = key;
            // It would be nice to insert in the right order, but it's
            // not too necessary right now.
            activeKeyMoments.push(activeKeyMoment);

        }));
        return [listItem, button];
    }

    // FIXME: looking at the implementation, I'm not sure why UPDATE_STRATEGY_COMPARE
    // is chosen in here, but, the main dependency is a list, and hence
    // UPDATE_STRATEGY_COMPARE could cause less effort to update the element,
    // it is just not implemented so far. I leave this here as an example
    // how to turn UPDATE_STRATEGY_COMPARE into UPDATE_STRATEGY_SIMPLE
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
              , activeKeyMoments = changedMap.has('activeKeyMoments')
                     ? changedMap.get('activeKeyMoments')
                     : this.getEntry('activeKeyMoments')
                // FIXME: I really dislike having to set state that
                //        did not change: need a way for this to be
                //        less effort!
                //        The pattern can be found more often above as well!
              , activeKeys = new Set(Array.from(activeKeyMoments)
                            .map(([/*i*/,activeKeyMoment])=>activeKeyMoment.get('activeKey').value))
              ;

            this.previousButton.disabled = keyMoments.size < 2;
            this.nextButton.disabled = keyMoments.size < 2;

            this._domTool.clear(this.itemsContainer);
            for(const [key, keyMoment] of keyMoments) {
                const [li] = this._createKeyMomentButton(key, keyMoment);
                if(activeKeys.has(key))
                    li.classList.add('active');
                this.itemsContainer.append(li);
            }
        }


        if(changedMap.has('activeKeyMoments')) {
            const activeKeyMoments = changedMap.get('activeKeyMoments')
              , activeIndexes = new Set(Array.from(activeKeyMoments)
                    .map(([/*i*/,activeKeyMoment])=>parseInt(activeKeyMoment.get('activeKey').value, 10)))
              ;
            this.removeButton.disabled = activeKeyMoments.size === 0;
            for(const[i, li] of Array.from(this.itemsContainer.children).entries()){
                li.classList[activeIndexes.has(i) ? 'add': 'remove']('active');
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

function getKeyMomentsAnalysis(keyMoments, isLoop, keyMomentPropertyGenerator) {
    let fullDuration = 0;
    const propertyToKeyMoments = new Map()
      , tToKeyMoments = new Map()
      , keyMomentsKeyToT = new Map()
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
        keyMomentsKeyToT.set(key, momentT);

        for(const [propertyName, propertyValue] of keyMomentPropertyGenerator(keyMoment, momentT)) {
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
    return {propertyToKeyMoments, tToKeyMoments, keyMomentsKeyToT, isLoop, fullDuration};
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

function getPropertyValue(fullDuration, isLoop, propertyData
                        , absoluteT /* === momentT === t * fullDuration*/) {
    // Get the two keyMoments that specify a value for it before and
    // after global absoluteT.
    // For this, we should be able to use a binary search!

    const momentTs = [...propertyData.keys()]
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

/**
 * Returns a FreezableMap.
 *
 * TODO: could be a method of a PropertyToKeyMoments class,
 * would reduce signature to only take `absoluteT`.
 */
function getPropertyValues(propertyToKeyMoments, absoluteT /* between 0 and fullDuration */) {
    const {fullDuration, isLoop} = propertyToKeyMoments
      , propertyValues = new FreezableMap()
      ;
    for(const [propertyName, propertyData] of propertyToKeyMoments) {
        const value = getPropertyValue(fullDuration, isLoop, propertyData, absoluteT);
        propertyValues.set(propertyName, value);
    }
    return propertyValues;
}

/**
 * Name is a portmanteau from Animation + Onion
 * Like the peels of an onion these animation property generators can
 * be stacked togerther. The inner layers can access the values of
 * the outer layers.
 *
 * usage:
 *      outerAnimanion = new Animanion(null, fontSizeGen, keyMoments, isLoop);
 *      innerAnimanion = new Animanion(outerAnimanion, axisLocationsGen, keyMoments, isLoop);
 */
class Animanion {
    static _NOTDEF = Symbol('_NOTDEF'); // jshint ignore:line
    constructor(outerAnimanion, propertiesGenerator, keyMoments, isLoop) {
        this._outerAnimanion = outerAnimanion;
        this._propertiesGenerator = propertiesGenerator;
        this.keyMoments = keyMoments;
        this.isLoop = isLoop;
        if(this._outerAnimanion) {
            // Both checks are to ensure fullDuration, tToKeyMoments etc.
            // do actually have the same values for all layert animanions.
            // If you remove these, do it with great care, as assumptions
            // are based on this.
            if(this._outerAnimanion.keyMoments !== this.keyMoments)
                throw new Error(`VALUE ERROR outerAnimanion.keyMoments must equal keyMoments.`);
            if(this._outerAnimanion.isLoop !== this.isLoop)
                throw new Error(`VALUE ERROR outerAnimanion.isLoop must equal isLoop.`);
        }
        this._keyMomentsAnalysis = null;
        this._propertyValuesForTCache = new Map();

        Object.defineProperty(this, 'innerAPI', {
            value: Object.freeze({
                getPropertyAtMomentT: (propertyName, momentT, defaultVal=super._NOTDEF)=>{
                    const valuesMap = this.getPropertyValuesMapForAbsoluteT(momentT);
                    if(!valuesMap.has(propertyName)) {
                        if(defaultVal !== super._NOTDEF)
                            return defaultVal;
                        throw new Error(`KEY ERROR "${propertyName}" not in values map for momentT: ${momentT}.`);
                    }
                    return valuesMap.get(propertyName);
                }
            })
          , enumerable: true
        });
        Object.defineProperty(this, 'outerAPI', {
            value: Object.freeze(this._getOuterAPI())
          , enumerable: true
        });
    }

    _getOuterAPI() {
        if(this._outerAnimanion)
            return this._outerAnimanion.innerAPI;
        return Object.freeze(Object.fromEntries(Object.keys(this.innerAPI)
        .map(key=>[
            key
          , ()=>{throw new Error(`ANIMANION ERROR outer API not found method ${key} not available.`);}
        ])));
    }

    _getKeyMomentsAnalysis(key=null) {
        if(this._keyMomentsAnalysis === null) {
            const keyMomentPropertyGenerator = this._propertiesGenerator.bind(null, this.outerAPI);// => keyMomentPropertyGenerator(keyMoment, momentT)
            // this should be cached
            // => {propertyToKeyMoments, tToKeyMoments, keyMomentsKeyToT, isLoop, fullDuration}
            this._keyMomentsAnalysis = getKeyMomentsAnalysis(this.keyMoments, this.isLoop, keyMomentPropertyGenerator);
        }
        if(key === null)
            return this._keyMomentsAnalysis;
        if(!Object.hasOwn(this._keyMomentsAnalysis, key))
            throw new Error(`KEY ERROR ${key} not in this._keyMomentsAnalysis ({$this.constructor.name}).`);
        return this._keyMomentsAnalysis[key];
    }

    // Valid for this and all outer Animanions, thus public is OK.
    get tToKeyMoments() {
        return this._getKeyMomentsAnalysis('tToKeyMoments');
    }

    // Not public because it doesn't represent the outer Animanions,
    // it only contains the properties generated for this Animanion.
    get _propertyToKeyMoments() {
        return this._getKeyMomentsAnalysis('propertyToKeyMoments');
    }

    // Valid for this and all outer Animanions, thus public is OK.
    get fullDuration() {
        return this._getKeyMomentsAnalysis('fullDuration');
    }

    // Valid for this and all outer Animanions, thus public is OK.
    get keyMomentsKeyToT() {
        return this._getKeyMomentsAnalysis('keyMomentsKeyToT');
    }

    toString() {
        return `[${this.constructor.name}+${this._propertiesGenerator.name}]`;
    }

    _getPropertyValuesMapForAbsoluteT(absoluteT) {
        return getPropertyValues(this._propertyToKeyMoments, absoluteT /* between 0 and fullDuration*/);
    }

    getPropertyValuesMapForAbsoluteT(absoluteT /* between 0 and fullDuration*/
                                   , preventCaching=false) {
        // Is cached and then cleared on update.
        // It could be wise to limit the precision of t, considering the
        // caching, e.g. to 4 digits below 0 or so.
        // Or better use absolute momentT rather than normalized t
        const [chached, result] = this._propertyValuesForTCache.has(absoluteT)
                ? [true, this._propertyValuesForTCache.get(absoluteT)]
                : [false, this._getPropertyValuesMapForAbsoluteT(absoluteT)]
                ;
        if(!chached) {
            if(this._outerAnimanion) {
                /* new, must add outerAnimanion properties*/
                const outerValuesMap = this._outerAnimanion.getPropertyValuesMapForAbsoluteT(absoluteT, preventCaching);
                for(const [k, v] of outerValuesMap) {
                    if(result.has(k)) continue;
                    result.set(k, v);
                }
            }
            // Because it's cached it's frozen.
            Object.freeze(result);
        }
        if(!chached && !preventCaching)
           this._propertyValuesForTCache.set(absoluteT, result);
        return result;
    }

    getPropertyValuesMapForT(t) {
        // FIXME: The caching of this should happen outside, as
        // in an constant animation via, a floating t, this is a memory
        // leak. The whole construct/cache will be pruned when keyMoments
        // have changed anyways.
        const absoluteT = t * this._getKeyMomentsAnalysis('fullDuration');
        return this.getPropertyValuesMapForAbsoluteT(absoluteT, true);
    }

    getPropertyValuesMapForKeyMoment(keyMomentsKey) {
        // not using the keyMoment to look up its t directly,
        // because it could be duplicated within keyMoments, but the
        // key is always unique. The KeyMomentController, or further
        // down, must then also know the keyMomentsKey of its keyMoment.
        // It's in the activeKeyMoment of course ...
        // Also very special for the UINumberAndRangeOrEmptyInput
        // and especially the UIManualAxesLocations
        // maybe we got to inject a function into these!
        const momentT = this.keyMomentsKeyToT.get(keyMomentsKey);
        return this.getPropertyValuesMapForAbsoluteT(momentT);
    }
}



/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* fontSizeGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const fontSize = keyMoment.get('fontSize');
    if(!fontSize.isEmpty)
        yield ['fontSize', fontSize.value];
}

/**
 * yield [propertyName, propertyValue]
 * derrived from keyMomentPropertyGenerator
 */
function* axisLocationsGen(outerAnimanionAPI, keyMoment, momentT) {
    const manualAxesLocations = keyMoment.get('manualAxesLocations')
      // fontSize = keyMoment.get('fontSize')
      // => this is interesting, if keyMoment defines fontSize, we
      //    definitely use that, otherwise, going only via
      // outerAnimanionAPI.getPropertyAtMomentT('fontSize', momentT) will
      // yield the out-value (last value) of that momentT
      , autoOPSZ = manualAxesLocations.get('autoOPSZ').value
      ;
    if(autoOPSZ) {
        const fontSize = keyMoment.get('fontSize')
          , fontSizeValue = fontSize.isEmpty
                  // this requires full calculation of the fontSize property animation!
                ? outerAnimanionAPI.getPropertyAtMomentT('fontSize', momentT, null)
                : fontSize.value
          ;
        if(fontSizeValue !== null)
            yield [`axesLocations/opsz`, fontSizeValue];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = manualAxesLocations.get('axesLocations');
    for(const [axisTag, axisValue] of axesLocations) {
        if(autoOPSZ && axisTag === 'opsz')
            // It was already yielded above and also should not
            // be present in here.
            continue;
        // Other than fontSize axesLocations are just not present when
        // at their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
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
        this.animanion = null;
        this.t = null;
        this.propertyValuesMap = null;
    }

    _initAnimanion(keyMoments, isLoop) {
        // This makes it possible for fontSize to be a dependency of
        // the axisLocations. Required for opsz with autoOPSZ = true and
        // no explicitly set fontSize on the same keyMoment.
        const outerAnimanion = new Animanion(null, fontSizeGen, keyMoments, isLoop)
          , innerAnimanion = new Animanion(outerAnimanion, axisLocationsGen, keyMoments, isLoop)
          ;
        this.animanion = innerAnimanion;
    }

    update(changedMap) {
        if(changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const keyMoments = changedMap.has('keyMoments')
                    ? changedMap.get('keyMoments')
                    : this.getEntry('keyMoments')
              , isLoop = (changedMap.has('isLoop')
                    ? changedMap.get('isLoop')
                    : this.getEntry('isLoop')).value
              ;
            // when either keyMoments or isLoop change
            this._initAnimanion(keyMoments, isLoop);
        }

        if(changedMap.has('t') || changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const t = (changedMap.has('t')
                            ? changedMap.get('t')
                            : this.getEntry('t')).value
              , propertyValuesMap = this._getPropertyValuesMapForT(t /* between 0 and 1*/)
              ;
            this.t = t;
            this.propertyValuesMap = propertyValuesMap;
        }
    }

    get fullDuration() {
        return this.animanion.fullDuration;
    }

    get tToKeyMoments() {
        return this.animanion.tToKeyMoments;
    }

    _getPropertyValuesMapForT(t) {
        return this.animanion.getPropertyValuesMapForT(t);
    }

    getPropertyValuesMapForT(t) {
        // Not cached, only for current t. t changes potentially very often
        // and also potentially doesn't repeat much due to floating point precision.
        if(this.t === t)
            return this.propertyValuesMap;
        return this._getPropertyValuesMapForT(t);
    }

    getPropertyValuesMapForKeyMoment(keyMomentsKey) {
        // cached until this.animanion is reinitialized, we need these
        // values repeatedly for ui-elements.
        return this.animanion.getPropertyValuesMapForKeyMoment(keyMomentsKey);
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
        // 'activeKeyMoments': could be color coded on the timeline
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

        // This construct is to delay the call to this.parentAPI.getWidgetById('AnimationLiveProperties');
        // until it is actually used, depending on changedMap status.
        const liveProperties = {
            _instance: null
          , get:key=>{
                if(liveProperties._instance === null)
                     liveProperties._instance = this.parentAPI.getWidgetById('AnimationLiveProperties');
                return liveProperties._instance[key];
            }
        };

        if(changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const fullDuration = liveProperties.get('fullDuration');
            this._simpleFields.set('fullDuration', fullDuration);
        }

        if(changedMap.has('font')) {
            const font = changedMap.get('font').value;
            this._sample.style.setProperty('font-family', `"${font.fullName}"`);
        }

        if(changedMap.has('t') || changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const propertyValuesMap = liveProperties.get('propertyValuesMap');
            this._setPropertiesToInfo(propertyValuesMap);
            this._setPropertiesToSample(propertyValuesMap);
        }
    }
}

class KeyMomentController extends _BaseContainerComponent {
    static _NOTDEF = Symbol('_NOTDEF'); // jshint ignore:line
    constructor(parentAPI, zones) {
        // run super first, so we can use `this` in the widgets definition.
        super(parentAPI, zones);

        // Dependencies that when they change require to update default
        // values of some fields ()
        // this._getDefaults changes return value when these dependencies
        // change.
        // It's the dependencies of AnimationLiveProperties:
        // ['t', 'keyMoments', 'isLoop']
        //  * Sans the 't' because that is the live animation
        //    position and the widgets here depend on the  keyMoment t,
        //  *  added "activeKey" as that change would change the default
        //     values as well (other keyMoment). But that would likely
        //     trigger full re-evaluation anyways.
        const updateDefaultsDependencies = [
                ['../../../keyMoments', 'keyMoments']
              , ['../../../isLoop', 'isLoop']
              , ['../activeKey', 'activeKey']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          ;

        const widgets = [
            [
                {zone: 'main'}
              , [
                    ['label', 'data']
                ]
              , DynamicTag
              , 'h3'
              , {}
              , (data)=>`Key Moment: ${data}`
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
                {zone: 'main', id: 'UIFontSize'}
              , [
                    ['fontSize', 'value']
                  , ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , 'key_moment-font_size' // base-id
              , 'Font-Size' // label
              , 'pt'// unit
              , {min:0, max:244, step:1, 'default': 36} // minMaxValueStep => set attribute
              , this._getDefaults.bind(this, '', 'fontSize')
              , requireUpdateDefaults
            ]
          , [
                {zone: 'main', id: 'UIManualAxesLocations'}
              , [
                    ['fontSize', 'fontSize']
                  , ['/font', 'font']
                  , ['manualAxesLocations/axesLocations', 'axesLocations']
                  , ['manualAxesLocations/autoOPSZ', 'autoOPSZ']
                  , ...updateDefaultsDependencies
                ]
              , UIManualAxesLocations
              , this._getDefaults.bind(this)
              , requireUpdateDefaults
            ]
        ];
        this._initWidgets(widgets);
    }
    _getDefaults(pefix, key, defaultVal=super._NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value
        const fullKey = `${pefix}${key}`
           , liveProperties = this.parentAPI.getWidgetById('AnimationLiveProperties')
           , activeKey = this.getEntry(this.parentAPI.rootPath.append('../activeKey')).value
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== super._NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR not found for ${activeKey} at "${fullKey}" in AnimationLiveProperties`);
    }
}

/**
 * This is a first approach to a controller that does two fundamental
 * things:
 *    * Create sub-widgets/sub-controllers dynamically based on list content
 *      see: _provisionWidgets using the LIST_NEW_ORDER status of a StateComparison.
 *    * Redirect via ForeignKey linked items to get the original version
 *      of those, which can be turned into drafts. This should be handled
 *      in the model eventually.
 */
class KeyMomentsController extends _BaseContainerComponent {
    constructor(parentAPI, zones, ) {
        // provision widgets dynamically!
        super(parentAPI, zones, []);
    }

    get dependencies() {
        const dependencies = super.dependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // FIXME: is this true?
        dependencies.add('/activeState/activeKeyMoments');
        return dependencies;
    }

     /**
      * return the original keyMoment from the otiginal hosting
      * struct keyMoments, so that in draft mode, the item can
      * be changed.
      * FIXME: it would be much more interesting to have this
      * functionality directly included in the model, than having
      * to do it here explicitly
      *
      * KeyMomentController.getEntry(/activeState/activeKeyMoments/0/keyMoment/manualAxesLocations/axesLocations)
      * The draftable KeyMoment is at
      * activeKey = getEntry('/activeState/activeKeyMoments/0/activeKey').value
      * /activeState/keyMoments/${activeKey}/manualAxesLocations/axesLocations
      *
      * rootPath is /activeState/activeKeyMoments/0
      * const rootPath = this.parentAPI.rootPath.append('activeKeyMoments', i, 'keyMoment');
      * -> but we can't use rootPath and have to use newWidgets[i].parentAPI.rootPath
      * It sseems like the override should happen in here not in the KeyMomentController
      */
    _redirectedGetEntry(externalName) {
        // this.parentAPI.rootPath e.g. === '/activeState'
        // widgetWrapper.parentAPI.rootPath e.g. this.parentAPI.rootPath.append('activeKeyMoments', i, 'keyMoment');

        // if it starts with activeKeyMomentsPath
        // then an integer index
        // then "keyMoment"
        const activeKeyMomentsPath = this.parentAPI.rootPath.append('activeKeyMoments')
          , externalPath = externalName instanceof Path
                ? externalName
                : Path.fromString(externalName)
          ;
        // This is only required for draft mode!
        // However, the children of this elemnt
        // will like this also not read from the
        // the 'keyMoment' ValueLink in the activeKeyMoment
        redirection:
        if(activeKeyMomentsPath.isRootOf(externalPath)) {
            const [index, keyMoment, ...rest] = externalPath.parts
                        .slice(activeKeyMomentsPath.parts.length);
            if(keyMoment !== 'keyMoment')
                break redirection;
            const rootElement = this.parentAPI.getEntry(this.parentAPI.rootPath)
              , activeKey = getEntry(rootElement, Path.fromParts('activeKeyMoments', index, 'activeKey')).value
              ;
            return getEntry(rootElement, Path.fromParts('keyMoments', activeKey, ...rest));
        }
        return this.parentAPI.getEntry(externalPath);
    }

    _createWrapper(rootPath) {
        const settings = {
               rootPath: rootPath
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = KeyMomentController
          , args = [this._zones]
          , childParentAPI = Object.assign(Object.create(this._childrenParentAPI), {
                // Ideally, the link, when trying to write to it,
                // e.g. in draft mode when reading from it and returning
                // the PotentialWriteProxy could use the linking information
                // to return a proxy for the correct entry in the source
                // but this may be complicated or really hard to accomplish
                // should be looked into though! In here, it's easier to
                // resolve the link, because the source is known and the
                // parent is known. Keeping track of a dependency's source
                // is thus maybe the main issue.
                //
                // FIXME: works so far, but requires the getEntry workaround.
                getEntry: this._redirectedGetEntry.bind(this)
            })
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }

    // This completely overrides how _BaseContainerComponent provisions
    // widgets, but it could also be integrated and call super._provisionWidgets()
    // at some point, e.g. to check the activationTest which is in this case not
    // configured.
    _provisionWidgets(compareResult) {
        const {LIST_NEW_ORDER, EQUALS, MOVED, NEW, CHANGED} = StateComparison.COMPARE_STATUSES
          , requiresFullInitialUpdate = new Set()
          ;

        for(const [status, data, path] of compareResult) {
            const pathEquals = path.equals('/activeState/activeKeyMoments')
              , isListOrder = status === LIST_NEW_ORDER
              ;
            if(!pathEquals || !isListOrder) {
                /**
                /activeState/activeKeyMoments  Object { name: "CHANGED" }
                /activeState/activeKeyMoments  Object { name: "LIST_NEW_ORDER" }
                /activeState/activeKeyMoments/0  Object { name: "NEW" }
                **/
                continue;
            }
            //     [EQUALS]  // found in oldState
            //     [MOVED, oldIndex]  // found in oldState
            //  both mean the content is different:
            //      [NEW] Not found in oldState
            //      [CHANGED]  => CHANGED is like DELETED + NEW
            //  [DELETED] is not a thing, the list size has changed though!
            //      i.e. remove the rest from the old list if it is longer
            const newWidgets = []
                  // The ones that remain in this set must be decomissioned.
                , deletedWidgets = new Set(this._widgets)
                , skipUpdates = new Set()
                ;
            for(const [i, [itemStatus/*, oldIndex */]] of data.entries()) {
                // this is expected by KeyMomentController
                const rootPath = this.parentAPI.rootPath.append('activeKeyMoments', i, 'keyMoment');
                if(itemStatus === EQUALS) {
                    // doesn't require an update, but it also shouldn't
                    // get created for this index either.
                    const widgetWrapper = this._widgets[i];
                    newWidgets[i] = widgetWrapper;
                    skipUpdates.add(i);
                    deletedWidgets.delete(widgetWrapper);
                }
                else if(itemStatus === CHANGED) {
                    // This should be called with the update mechanism
                    // it expects and because it CHANGED it would receive all the
                    const widgetWrapper = this._widgets[i];
                    newWidgets[i] = widgetWrapper;
                    deletedWidgets.delete(widgetWrapper);
                }
                else if(itemStatus === NEW || itemStatus === MOVED ) {
                    // Treating MOVED like NEW makes it easier to
                    // get the required changes applied, in fact, updating
                    // rootPath down the widget hierarchie is complicated
                    // and just replacing the widget instead of moving it
                    // and rewconnecting it (absolute dependency names)
                    // is much simpler. Otherwise, it would be closer
                    // to treat it similar to a CHANGED.
                    // See as well the description at ComponentWrapper._updateRootPath
                    //
                    newWidgets[i] = this._createWrapper(rootPath);
                }
            }

            // delete deletedWidgets
            for(const widgetWrapper of deletedWidgets) {
                if(widgetWrapper.id !== null)
                    this._idToWidget.delete(widgetWrapper.id);
                widgetWrapper.destroy();
            }
            this._widgets.splice(0, Infinity, ...newWidgets);

            for(const widgetWrapper of this._widgets) {
                const isActive = widgetWrapper.widget !== null;
                if(!isActive) {
                    // if new, initialize ..
                    this._createWidget(widgetWrapper);
                    requiresFullInitialUpdate.add(widgetWrapper);
                }
                else {
                    // re-insert all elements of the old widgets into the DOM.
                    // This is experimental! However, ideally it creates the
                    // correct order
                    // I wonder if this destroys any event listners or such, would probably
                    // be a subtle bug! a reguar event handler surves "re-implantation"
                    widgetWrapper.reinsert();
                }
            }
            break;
        }
        return requiresFullInitialUpdate;
    }

    initialUpdate(rootState) {
        // FIXME: There's a problem as this.dependencies depends on
        // this.activeWidgets(), which is provided partly by running _provisionWidgets
        // and compareResult depends on this.dependencies
        // but maybe we just check all active/non-active widgets? or something else
        // StateComparison.createInitial with appropriate dependencies is
        // quicker but can be run without any dependencies as well.

        // console.log(`${this.constructor.name}.initialUpdate(rootState):`, rootState);
        const compareResult = StateComparison.createInitial(rootState, this.dependencies);
        const requiresFullInitialUpdate = this._provisionWidgets(compareResult);
        this._update(compareResult, requiresFullInitialUpdate, true);
    }
}

class ExampleKeyMomentsController extends _BaseContainerComponent {
    constructor(parentAPI, _zones) {
        const activeKeyMomentsMain = parentAPI.domTool.createElement('div')
          , zones = new Map([['activeKeyMomentsMain', activeKeyMomentsMain],..._zones])
          ;
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
                  , ['activeKeyMoments', 'activeKeyMoments']
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
                  , 'activeKeyMoments'
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
                  , ['../font', 'font']
                ]
              , AnimationInfo
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
                // chnaged zones above to contain activeKeyMomentsMain
                {zone: 'activeKeyMomentsMain'}
              , []
              , StaticTag
              , 'h2'
              , {}
              , 'Selected Key Moments'
            ]
            , [
                {}
              , []
              , KeyMomentsController
                // the children of this will insert theit "main"
                // into activeKeyMomentsMain
              ,  new Map([..._zones, ['main', activeKeyMomentsMain]]) // zones
              , ['activeKeyMoments']
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
