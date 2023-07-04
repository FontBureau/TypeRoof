/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    FreezableMap
  , StringModel
  , NumberModel
  , CoherenceFunction
} from '../metamodel.mjs';

import {
    _BaseComponent
} from './basics.mjs';

function* enumerate(iterable) {
    let i=0;
    for(const value of iterable) {
        yield [i, value];
        i =+ 1;
    }
}

export const keyMomentModelMixin = Object.freeze([
        CoherenceFunction.create(['duration'],
        function setDefaults({fontSize, duration}) {
            if(duration.value === undefined)
                duration.value = 1;
        })
        // Making this default as it will be crucial for human editing
        // organization.
      , ['label', StringModel]
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
]);

/**
 * keyMoments: KeyMomentsModel is defined like this:
 * KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
 * KeyMomentModel requires: keyMomentModelMixin
 * NOTE: keyMomentPropertyGenerator abstracts how to read properties from KeyMomentModel
 */
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
export function binarySearch(values, target) {
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
export class Animanion {
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
                console.warn(`VALUE ERROR outerAnimanion.keyMoments must equal keyMoments.`);
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
export class AnimationLiveProperties extends _BaseComponent {
    constructor(parentAPI, initAnimanion) {
        super(parentAPI);
        this._initAnimanion = initAnimanion;
        this._animanion = null;
        this.t = null;
        this.propertyValuesMap = null;
    }

    /**
     * return an instance of Animanion
     * e.g:
     *      const outerAnimanion =  new Animanion(null, outerPropertiesGenerator, keyMoments, isLoop);
     *      return new Animanion(outerAnimanion, innerPropertiesGenerator, keyMoments, isLoop);
     *
     * (outerAnimanion, propertiesGenerator, keyMoments, isLoop);
     */
    _initAnimanion(keyMoments, isLoop) {
        throw new Error(`NOT IMPLEMENTED _initAnimanion(${keyMoments}, ${isLoop})`);
    }

    get animanion() {
        if(this._animanion === null)
            throw new Error('LIFECYCLE ERROR this._animanion is null, must update initially first.');
        return this._animanion;
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
            this._animanion = this._initAnimanion(keyMoments, isLoop);
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

/**
 * This is mainly for development/debugging.
 *
 * Calls this.parentAPI.getWidgetById(this._animationLivePropertiesId);
 * that must return an instance of AnimationLiveProperties
 */
export class AnimationInfo extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="animation_info">
        <h3>Animation Info</h3>
        <h4>Basic Fields</h4>
        <ol class="animation_info-basic_fields"></ol>
        <h4>Animated Properties</h4>
        <ol class="animation_info-properties"></ol>
</div>`;
    //jshint ignore:end
    constructor(parentAPI, animationLivePropertiesId) {
        super(parentAPI);
        this._animationLivePropertiesId = animationLivePropertiesId;
        this._basicKeys = ['t', 'duration', 'isLoop', 'perpetual', 'playing'];
        this._basicFields = {
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

    _createBasicDisplayElement(key, value, label=null) {
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

    _createBasicField(key, value, label=null) {
        const [container, valueContainer] = this._createBasicDisplayElement(key, value, label);
        this._basicFields[key] = valueContainer;
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
                const [container, valueContainer] = this._createBasicDisplayElement(key, value);
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
          , basicFieldsContainer = element.querySelector('.animation_info-basic_fields')
          , propertiesContainer = element.querySelector('.animation_info-properties')
          , sample = element.querySelector('.animation_info-sample')
          ;

        for(const key of this._basicKeys) {
            let entry = null;
            try {
                entry = this.getEntry(key);
            }
            catch(e) {
                // pass
            }
            if(entry === null) continue;

            const container = this._createBasicField(key, entry.value);
            if(key === 'duration')
                container.append(' seconds');
            basicFieldsContainer.append(container);
        }

        basicFieldsContainer.append(this._createBasicField('fullDuration', 0, 'full duration'));
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
        for(const key of this._basicKeys) {
            if(!changedMap.has(key)) continue;
            const entry = changedMap.get(key)
              , valueText = typeof entry.value === 'boolean'
                        ? (entry.value && 'True' || 'False')
                        : entry.value
              ;
            this._basicFields.set(key, valueText);
        }

        // This construct is to delay the call to this.parentAPI.getWidgetById('AnimationLiveProperties');
        // until it is actually used, depending on changedMap status.
        const liveProperties = {
            _instance: null
          , get:key=>{
                if(liveProperties._instance === null)
                     liveProperties._instance = this.parentAPI.getWidgetById(this._animationLivePropertiesId);
                return liveProperties._instance[key];
            }
        };

        if(changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const fullDuration = liveProperties.get('fullDuration');
            this._basicFields.set('fullDuration', fullDuration);
        }

        if(changedMap.has('t') || changedMap.has('keyMoments') || changedMap.has('isLoop')) {
            const propertyValuesMap = liveProperties.get('propertyValuesMap');
            this._setPropertiesToInfo(propertyValuesMap);
        }
    }
}
