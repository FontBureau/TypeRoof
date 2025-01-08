/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    zip
  , enumerate
  , interpolateNumber
  , identity
} from '../util.mjs';

import {
    FreezableMap
  , StringModel
  , NumberModel
  , CoherenceFunction
} from '../metamodel.mjs';

import {
    _BaseComponent
} from './basics.mjs';

import {
    interpolate as culoriInterpolate
  , getMode as culoriGetMode
} from '../vendor/culori/bundled/culori.mjs';

export const keyMomentBaseModelMixin = Object.freeze([
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

// Very good resource: https://easings.net/
// This is https://easings.net/#easeInOutCubic
// function easeInOutCubic(x) {
//     return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
// }
// const identity = easeInOutCubic;

function isCuloriColor(a) {
    return typeof a === 'object' && 'mode' in a;
}


function _culoriFillZeros(color, targetMode) {
    if(color.mode === targetMode)
        return color;
    // When components are missing, conversion to other modes
    // produces NaNs in culori, that's not a problem when the
    // components are compatible between spaces, i.e. don't require
    // or undergo an conversion.
    // Missing colors are set to 0 as suggested in
    // https://drafts.csswg.org/css-color/#interpolation-missing
    // I don't think we neeed a back-conversion in the interpolation
    // result. This resolves NaNs produces by culori in
    // conversion/interpolation.
    // Also: track: https://github.com/Evercoder/culori/issues/203
    // if that resolves the filter can return and the zeroing can
    // be removed again.
    const missing = [];
    for(const component of culoriGetMode(color.mode).channels) {
        if(Object.hasOwn(color, component))
            // Not missing.
            continue;
        if(component === 'alpha')
            // Missing alpha is not an issue as alpha is compatible everywhere.
            continue;
        if(component === 'l' && color.mode.startsWith('ok')
                            && targetMode.startsWith('ok'))
            // missing 'l' between oklab and oklch is compatible
            continue;
        missing.push([component, 0]);
    }

    return missing.length
         // Add the missing components to a copy of a.
        ? {...color, ...Object.fromEntries(missing)}
        : color
        ;
}

function interpolateCuloriColors(t, a, b) {
        // => use the color-mode of b, as the interpolation color space.
        a = _culoriFillZeros(a, b.mode);
        // FIXME: culori.interpolate returns an interpolator function.
        // It could be faster to actually cache that.
        // OR, we do the conversion with culori to interpolation space
        // and then interpolate the colors ourselves here. This would make
        // it possible e.g. to apply our own easing funtions at some point.
        const color = culoriInterpolate([a, b], b.mode)(t);
        // console.log(`interpolateColors t ${t}`, 'a', a, 'b', b, 'result', color);
        return color;
}

function interpolate(t, a, b) {
    if(isCuloriColor(a) && isCuloriColor(b))
        return interpolateCuloriColors(t, a, b);
    if(typeof a === 'number' && typeof b === 'number')
        return interpolateNumber(t, a, b);
    // This used to raise an error:
    //      VALUE ERROR don't know how to interpolate ...
    // However, we now return a until we are at t === 1
    // i.e. directly at b, then we return b.
    // That means, we can actually put strings and all other property types
    // etc. into interpolation and have these change at keyMoments, there's
    // no transition however, the previous value will persist until the new
    // keyMoment is reached. Transitions of complicated types can be
    // implemented above in this function.
    return t < 1 ? a : b;
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

class DependentValue {
    constructor(dependencyDepth, propertyName, momentT, defaultVal) {
        Object.defineProperties(this, {
            dependencyDepth: {value: dependencyDepth}
          , propertyName: {value: propertyName}
          , momentT: {value: momentT}
          , defaultVal: {value: defaultVal}
        });
    }
    toString() {
        return `[DependentValue ${this.propertyName} at this.momentT ${this.momentT}]`;
    }
}
const _NOTDEF = Symbol('_NOTDEF');
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
export class LocalScopeAnimanion {
    static _NOTDEF = _NOTDEF // jshint ignore:line
    constructor(propertiesGenerators, keyMoments, isLoop) {
        this._propertiesGenerators = propertiesGenerators;
        this.keyMoments = keyMoments;
        this.isLoop = isLoop;
        this._keyMomentsAnalysis = null;
    }

    *_propertiesGenerator(propertiesWithDependeciesMap, keyMoment, momentT) {
        const _NOTDEF = this.constructor._NOTDEF;
        // dependencyDepth:
        // we can only try to resolve a dependencyDepth if is > 0, because
        // we're looking at dependencyDepth-1 to resolve.
        // this is a simplistic way to avoid analyizing the full dependency graph.
        // it's also, already, full overkill.
        function getPropertyAtMomentT (dependencyDepth, propertyName, momentT, defaultVal=_NOTDEF) {
            return new DependentValue(dependencyDepth, propertyName, momentT, defaultVal);
        }
        for(const [dependencyDepth, gen] of this._propertiesGenerators.entries()) {
            for(const [propertyName, propertyValue] of gen(
                                    {getPropertyAtMomentT: getPropertyAtMomentT.bind(null, dependencyDepth)}
                                  , keyMoment
                                  , momentT)) {
                if(propertyValue instanceof DependentValue) {
                    // keeping the highest dependency depth, this means
                    // lower depths will be resolved before, so higher
                    // depths can depend on them. The order of _propertiesGenerators
                    // defines those depths: properties generated by earlier
                    // generators can be used as dependencies for properties
                    // of later generators.
                    const oldDependencyDepth = propertiesWithDependeciesMap.has(propertyName)
                                    ? propertiesWithDependeciesMap.get(propertyName)
                                    : -1
                      , dependencyDepth = Math.max(oldDependencyDepth, propertyValue.dependencyDepth)
                      ;
                    propertiesWithDependeciesMap.set(propertyName, dependencyDepth);
                }
                yield [propertyName, propertyValue];
            }
        }
    }

    /**
     * wipPropertyToKeyMoments: this means the date is Work In Progress,
     * i.e. incomplete.
     */
    _resolveLocalPropertyDependency(dependantPropertyName, wipPropertyToKeyMoments, momentT, dependentPropertyValue) {
        const {propertyName, /*momentT, */ defaultVal} = dependentPropertyValue;
        if(wipPropertyToKeyMoments.has(propertyName)) {
            const {fullDuration, isLoop} = wipPropertyToKeyMoments
              , propertyData = wipPropertyToKeyMoments.get(propertyName)
              ;
            return getPropertyValue(fullDuration, isLoop, propertyData, momentT);
        }
        // TODO:
        // else if we can resolve it escalated, but we require global t context ...
        //    return resolve above ...
        else if(defaultVal !== this.constructor._NOTDEF) {
            return defaultVal;
        }
        else
            throw new Error(`PROPERTY ERRROR can't resolve dependency property ${propertyName} for ${dependantPropertyName}`);
    }

    _resolvePropertyDependencies(rawPropertyToKeyMoments, propertiesWithDependecies) {
        // It's interesting, as in this state, the propertyValues can
        // be resolved differently, depending on the situatuion.
        // However, if a propertyName remains in propertyToKeyMoments
        // depends on how the property dependencies can be resolved.
        // CAUTION: originally, this is important,
        // the generator would only yield the value if(fontSizeValue !== null)
        // That means, when we try to resolve these values, we should keep them
        // out if they don't resolve. Maybe like that:
        // if(value === null && defaultVal === null)
        //      -> don't use that value in the analysis.
        const newPropertyToKeyMoments = new Map()
            // _propertiesGenerators is a Map([[propertyName, dependencyDepth], ...])
            // we'll resolve properties with lower depth first, that way
            // higer depths can depend on lowe depth; dependencyDepth is
            // defined by the order of the property generators.
            // This is the closest we get to a topological sorting of dependencies.
          , orderedPropertiesWithDependecies = zip(...Array.from(propertiesWithDependecies.entries()).sort(([, a],[, b])=>a-b)).next().value
          ;

        newPropertyToKeyMoments.fullDuration = rawPropertyToKeyMoments.fullDuration;
        newPropertyToKeyMoments.isLoop = rawPropertyToKeyMoments.isLoop;


        // These don't have dependencies and we can use them right away
        for(const [propertyName, propertyData] of rawPropertyToKeyMoments.entries()) {
            if(!propertiesWithDependecies.has(propertyName))
                // This data didn't change, just transfer it.
                newPropertyToKeyMoments.set(propertyName, propertyData);
        }

        for(const propertyName of orderedPropertiesWithDependecies) {
            const propertyData = rawPropertyToKeyMoments.get(propertyName)
              , newPropertyData = new Map()
              ;
            // propertyData.get(momentT).push({key, keyMoment, propertyValue});
            for(const [momentT, keyMomentsData] of propertyData) {
                const newKeyMomentsData = [];
                for(const {key, keyMoment, propertyValue} of keyMomentsData) {
                    if(!(propertyValue instanceof DependentValue)) {
                        newKeyMomentsData.push({key, keyMoment, propertyValue});
                        continue;
                    }
                    const newPropertyValue = this._resolveLocalPropertyDependency(propertyName, newPropertyToKeyMoments, momentT, propertyValue);
                    if(newPropertyValue === null)
                        continue;
                    newKeyMomentsData.push({key, keyMoment, propertyValue:newPropertyValue});
                }
                if(!newKeyMomentsData.length)
                    // don't keep if it's empty!
                    continue;
                newPropertyData.set(momentT, newKeyMomentsData);
            }
            if(!newPropertyData.size)
                continue;
            newPropertyToKeyMoments.set(propertyName, newPropertyData);
        }
        return newPropertyToKeyMoments;
    }

    /**
     * Possible keys are:
     *      - tToKeyMoments
     *      - propertyToKeyMoments
     *      - fullDuration
     *      - keyMomentsKeyToT
     */
    _getKeyMomentsAnalysis(key=null) {
        if(this._keyMomentsAnalysis === null) {
            const propertiesWithDependeciesMap = new Map()
              , keyMomentPropertyGenerator = this._propertiesGenerator.bind(this, propertiesWithDependeciesMap)
              , keyMomentsAnalysis = getKeyMomentsAnalysis(this.keyMoments, this.isLoop, keyMomentPropertyGenerator)
              ;
            // => keyMomentPropertyGenerator(keyMoment, momentT)
            // this should be cached
            // => {propertyToKeyMoments, tToKeyMoments, keyMomentsKeyToT, isLoop, fullDuration}

            if(propertiesWithDependeciesMap.size) {
                const propertyToKeyMoments = this._resolvePropertyDependencies(keyMomentsAnalysis.propertyToKeyMoments, propertiesWithDependeciesMap);
                this._keyMomentsAnalysis = Object.assign({}, keyMomentsAnalysis ,{propertyToKeyMoments});
            }
            else
                this._keyMomentsAnalysis = keyMomentsAnalysis;
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
        return `[${this.constructor.name}+${this._propertiesGenerators.map(pg=>pg.name).join('+')}]`;
    }

    _getPropertyValuesMapForAbsoluteT(localAbsoluteT) {
        return getPropertyValues(this._propertyToKeyMoments, localAbsoluteT);
    }

    getPropertyValuesMapForAbsoluteT(localAbsoluteT) {
        // Is cached and then cleared on update.
        // It could be wise to limit the precision of t, considering the
        // caching, e.g. to 4 digits below 0 or so.
        // Or better use absolute momentT rather than normalized t
        const result = this._getPropertyValuesMapForAbsoluteT(localAbsoluteT);
        //if(!chached) {
            // Because it's cached it's frozen.
        //    Object.freeze(result);
        //}
        return result;
    }

    getPropertyValueForLocalT(propertyName, localRelativeT, defaultVal=super._NOTDEF) {
        const propertyToKeyMoments = this._getKeyMomentsAnalysis('propertyToKeyMoments')
          ,  {fullDuration, isLoop} = propertyToKeyMoments
          , localAbsoluteT = localRelativeT * fullDuration
          ;
        if(!propertyToKeyMoments.has(propertyName)) {
            if(defaultVal !== this.constructor._NOTDEF)
                return defaultVal;
            throw new Error(`KEY ERROR propertyName "${propertyName}" not found in ${this}.getPropertyValueForLocalT`);
        }

        const propertyData = propertyToKeyMoments.get(propertyName);
        return getPropertyValue(fullDuration, isLoop, propertyData, localAbsoluteT);
    }

    getPropertyValuesMapForLocalT(localRelativeT) {
        // FIXME: The caching of this should happen outside, as
        // in an constant animation via, a floating t, this is a memory
        // leak. The whole construct/cache will be pruned when keyMoments
        // have changed anyways.
        const localAbsoluteT = localRelativeT * this._getKeyMomentsAnalysis('fullDuration');
        return this.getPropertyValuesMapForAbsoluteT(localAbsoluteT);
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

    hasProperty(property) {
        // throw new Error(`NOT IMPLEMENTED hasProperty (for property ${property}) in ${this}.`);
        return this._propertyToKeyMoments.has(property);
    }
    propertyNames() {
        // throw new Error(`NOT IMPLEMENTED propertyNames in ${this}.`);
        return Array.from(this._propertyToKeyMoments.keys());
    }
}

export class HierarchicalScopeAnimanion {
    static _NOTDEF = Symbol('_NOTDEF'); // jshint ignore:line

    /**
     * Can be used as an argument to getPropertiesFromGlobalT,
     * getLocalTs, and getLocalT
     */
    static LAST_T = Symbol('LAST_T'); // jshint ignore:line
    get LAST_T() {
        return this.constructor.LAST_T;
    }
    constructor(localAnimanion, parentAnimanion=null, isInheritingPropertyFn=null) {
        // must be a HierarchicalScopeAnimanion as well/same interface
        // animanion.parentAnimanion => animanion || null
        Object.defineProperty(this, 'parentAnimanion', {value: parentAnimanion});
        Object.defineProperty(this, 'localAnimanion', {value: localAnimanion});
        if(parentAnimanion !== null && !isInheritingPropertyFn)
            throw new Error('ASSERTION FAILED parentAnimanion is not null but isInheritingPropertyFn is not set.');
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }

    toString() {
        return `[${this.constructor.name} local:${this.localAnimanion}]`;
    }

    // getter that overrides itself in the instance
    get animanions() {
        const animanions = [];
        let current = this;
        while(current !== null) {
            animanions.unshift(current);
            current = current.parentAnimanion;
        }
        Object.defineProperty(this, 'animanions', {value: animanions});
        return this.animanions;
    }

    getLocalTs(globalT) {
        // get all transformed ts, it's important that if the animanion doesn't
        // transform t, t is supposed to be the same as the input t.
        // getOwnPropertyAtLocalT(propertyName, t, defaultVal): if t is not defined
        // id defaultVal is not defined raise KeyError else if defaultVal is
        // defined return defaultVal.
        //
        //NOTE: ts has one more entry than parents, as globalT is the first
        // entry, and that has no associated animanion. However, globalT (ts[0])
        // is the localT for parents[0], so there's a good relationship. ts
        // has however one more entry than animanions, so the local t for the
        // last animanion is ts[animanions.length-1]
        const ts = this.animanions.reduce(
            (ts, animanion) => {
                const defaultParentT = ts.at(-1)
                  , parentT = defaultParentT === this.constructor.LAST_T ? 1 : defaultParentT
                  , rawT = animanion.getOwnPropertyAtLocalT('numericProperties/t', parentT, defaultParentT)
                  ;
                if(rawT === 1 || rawT === this.constructor.LAST_T)
                    // This is required so we can select exactly the
                    // last KeyMoment, any other integer modT will be 0
                    // and result at the first position. We could also
                    // reverse this, and have 0 be always the start and
                    // all other integers be always 1, it's mainly
                    // important to have a way to receive the last position
                    // in contrast to the first position.
                    return ts.concat(this.constructor.LAST_T);
                const modT = rawT % 1
                  , t = modT < 0 ? 1 + modT : modT
                  ;
                return ts.concat(t);
            }
          , [globalT])
          ;
        return ts.map(t=>t===this.constructor.LAST_T ? 1 : t);
    }

    _isInheritingProperty(property) {
        // By default all properties are inherting, due to backward
        // compatibility, but we can inject different behavior.
        if(this._isInheritingPropertyFn)
            return this._isInheritingPropertyFn(property);
        return true;
    }

    getPropertiesFromGlobalT(globalT) {
        const animanions = this.animanions
          , ts = this.getLocalTs(globalT)
          , properties = new Map()
          ;
        // only to be printed as info
        properties.set('[local t]', ts[animanions.length-1]);
        // With this, we could also trace the level of inheritance for all
        // the properties!
        for(let i=animanions.length-1;i>=0;i--) {
            const t = ts[i]
              , animanion = animanions[i]
                // only "inherit" properties that we don't know already
                // also only inherit properties that are inherited
              , newProperties = animanion.localPropertyNames.filter(property=>!properties.has(property)
                        &&(animanion === this || this._isInheritingProperty(property))

                )
              ;
            for(const property of newProperties)
                properties.set(property, animanion.getOwnPropertyAtLocalT(property, t));
        }
        return properties;
    }

    getLocalT(globalT) {
        const ts = this.getLocalTs(globalT);
        return ts[this.animanions.length-1];
    }

    // MAYBE this must get redirected at the localAnimanion
    // as there could be a version that tries to get the property
    // from all of the hieratchy, albeit, would require a globalT not a
    // localT
    // animanion.getOwnPropertyAtLocalT(propertyName, t, defaultVal) => a value || raises KEY ERRROR || defaultVal
    getOwnPropertyAtLocalT(propertyName, localT, defaultVal=super._NOTDEF) {
        if(!this.localAnimanion.hasProperty(propertyName)) {
            if(defaultVal !== this.constructor._NOTDEF)
                return defaultVal;
            throw new Error(`KEY ERROR ${propertyName} not in {$this.constructor.name}.`);
        }


        // throw new Error(`NOT IMPLEMENTED getOwnPropertyAtLocalT (for property ${propertyName}) in ${this.constructor.name}.`);

        // FIXME: not sure if we should query the whole ropertyValuesMap each time
        // here. It's probably simpler for caching, but we don't do cacing atm.
        // const propertyValuesMap = this.localAnimanion.getPropertyValuesMapForLocalT(localT);
        // return propertyValuesMap.get(propertyName);
        const defaultArgs = defaultVal !== this.constructor._NOTDEF ? [defaultVal] : [];
        return this.localAnimanion.getPropertyValueForLocalT(propertyName, localT, ...defaultArgs);
    }

    // animanion.localPropertyNames => Array, all names that are defined by this scope
    get localPropertyNames() {
        return this.localAnimanion.propertyNames();
    }

    // compatibility to localAnimanion API:
    getPropertyValuesMapForLocalT(localRelativeT) {
        return this.localAnimanion.getPropertyValuesMapForLocalT(localRelativeT);
    }
    getPropertyValuesMapForKeyMoment(keyMomentsKey) {
        return this.localAnimanion.getPropertyValuesMapForKeyMoment(keyMomentsKey);
    }
    get tToKeyMoments() {
        return this.localAnimanion.tToKeyMoments;
    }
    get fullDuration() {
        return this.localAnimanion.fullDuration;
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
 * leaner. But with `widgetBus.getWidgetById` we can start to explore
 * this kind of value propagation, without having to create a more generic
 * mechanism right away.
 * In general, for each component, no matter if it renders anything, it
 * should be possible to expose this kind of behavior.
 */
export class AnimationLiveProperties extends _BaseComponent {
    constructor(widgetBus, initAnimanion, isInheritingPropertyFn=null) {
        super(widgetBus);
        this._initAnimanion = initAnimanion;
        this._animanion = null;
        this.t = null;
        this.propertyValuesMap = null;
        // only used if also hasParentProperties
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }

    /**
     * return an instance of Animanion
     * e.g:
     *      const outerAnimanion =  new Animanion(null, outerPropertiesGenerator, keyMoments, isLoop);
     *      return new Animanion(outerAnimanion, innerPropertiesGenerator, keyMoments, isLoop);
     *
     * (outerAnimanion, propertiesGenerator, keyMoments, isLoop);
     */
    _initAnimanion(keyMoments, isLoop, parentProperties=null) {
        // jshint unused:vars
        throw new Error(`NOT IMPLEMENTED _initAnimanion(${keyMoments}, ${isLoop})`);
    }

    get animanion() {
        if(this._animanion === null)
            throw new Error('LIFECYCLE ERROR this._animanion is null, must update initially first.');
        return this._animanion;
    }

    update(changedMap) {
        const hasParentProperties = this.widgetBus.wrapper.dependencyReverseMapping.has('@parentProperties');
        let animanionChanged = false
          , propertiesChanged = false
          ;
        if(changedMap.has('keyMoments') || changedMap.has('isLoop') || changedMap.has('@parentProperties')) {
            const hasLocalChanges = changedMap.has('keyMoments') || changedMap.has('isLoop')
              , keyMoments = changedMap.has('keyMoments')
                    ? changedMap.get('keyMoments')
                    : this.getEntry('keyMoments')
              , isLoop = (changedMap.has('isLoop')
                    ? changedMap.get('isLoop')
                    : this.getEntry('isLoop')).value
              ;
            // when either keyMoments or isLoop change
            // FIXME: it's important, that the parent animanion
            // (which _initAnimanion might bring in) can change
            // as well! And then, this should change.
            // so we basicallly have two sources of change:
            //     A) local keyMoments, "local" isLoop, "local" t
            //        (while t is a very special case)
            //     B) dependcy animanions, which may have the same
            //        dependencies as A and B. The uppermost animanion
            //        would not have a B dependency.
            //
            // A tool that depends on that animanion/AnimationLiveProperties
            // should not have to (explicitly) subscribe to the same properties
            // to receive changes.
            // Explicitly: it's a very good idea to have a single update
            // function, so it would still be cool to funnle the animanion
            // update into that call, including the updates of the changedMap
            // of the explicitly subscribed properties.
            // It's important that then:
            //        * there may be a call to update without changes in animanion
            //        * there may be a call to update without changes in changeMap
            // Especially changes to animanion can be due to changes in its
            // dependency animanions, not reflected in it's changemap directly.
            //
            // -> an animanion/AnimationLiveProperties should register when
            //    it has changed
            // -> a dependency of an animanion/AnimationLiveProperties should
            //    be able to subscribe
            // It's super interesting as we must take care that the dependent
            // subscribers get called after their dependencies. Before trying
            // to solve this, using a toplogical sorting, we can just check
            // in a central registry if the dependency animanion/AnimationLiveProperties
            // was already called.
            //
            // SO: A) register dependencies with component, they must not exist yet, I suppose????
            //        it's interesting, maybe they should just exist!
            //     B) when updating, something that is used as a dependency, must register
            //        that its update was called or not called (we must know it exists)
            //        and if it has changed.
            //        => there are chances it's completely ignored, because none of it's
            //           dependencies have changed, so we should take care of still
            //           registering its principal presence and that it was theretically
            //           called. This must be cheap as well, because it will run on each
            //
            //     C) when a dependant is called, all dependencies must
            //        have been already registered in that run.
            //        Otherwise raise an error. (We could have optional dependencies maybe.)
            //        Call its update or not, depending if it had changes.
            //
            //
            // We already have a global registry GlobalAnimationLivePropertiesRegistry
            // so, once the AnimationLiveProperties are registered, it should be possible
            // to subscribe to them.
            //
            // GlobalAnimationLivePropertiesRegistry can be viewed as static
            // e.g. will never go away. But similarly, the dependency animanions
            // are always present to the subscribers, when these go away,
            // the subscriber also vanish. hence, destruction notices are
            // not relevant down stream.
            //
            // When these are destroyed, they must unregister.
            // Also, subscribers need to be informed!
            if(hasParentProperties) {
                const parentProperties = changedMap.has('@parentProperties')
                        ? changedMap.get('@parentProperties')
                        : this.getEntry('@parentProperties')
                    // Since the keyMomentsAnalysis is cached in these
                    // animanions, it is smart to only update that when the
                    // keyMoments/isLoop has changed. Local cache would also
                    // benefit from that. We really don't want to calculate all of
                    // these all the time.
                  , [localChanged, localScopeAnimanion] = hasLocalChanges || this._animanion === null
                                ? [true, this._initAnimanion(keyMoments, isLoop)]
                                  //keep the old one
                                : [false, this._animanion.localAnimanion]
                  , parentChanged = this._animanion === null || parentProperties.animanion !== this._animanion.parentAnimanion
                  ;
                // Don't rebuild if the components haven't changed.
                if(localChanged || parentChanged) {
                    this._animanion = new HierarchicalScopeAnimanion(
                                    localScopeAnimanion
                                  , parentProperties.animanion
                                  , this._isInheritingPropertyFn
                                  );
                    animanionChanged = true;
                }
            }
            else {
                this._animanion =  new HierarchicalScopeAnimanion(
                                    this._initAnimanion(keyMoments, isLoop));
                animanionChanged = true;
            }
        }

        if(changedMap.has('globalT') || animanionChanged) {
            const globalT = (changedMap.has('globalT')
                            ? changedMap.get('globalT')
                            : this.getEntry('globalT')).value
              , localT = hasParentProperties
                    ? this._animanion.getLocalT(globalT)
                    : globalT
              ;
            if(this.t === null || this.t !== localT || animanionChanged) {
                this.t = localT;
                this.propertyValuesMap = this._getPropertyValuesMapForLocalT(localT /* between 0 and 1*/);
                propertiesChanged = true;
            }
        }

         if(animanionChanged || propertiesChanged) {
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] = this.widgetBus.getProtocolHandlerRegistration(`animationProperties@`);
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    get fullDuration() {
        return this.animanion.fullDuration;
    }

    get tToKeyMoments() {
        return this.animanion.tToKeyMoments;
    }

    _getPropertyValuesMapForLocalT(t) {
        return this.animanion.getPropertyValuesMapForLocalT(t);
    }

    getPropertyValuesMapForLocalT(t=_NOTDEF) {
        // Not cached, only for current t. t changes potentially very often
        // and also potentially doesn't repeat much due to floating point precision.
        if(t === _NOTDEF)
            t = this.t;
        if(this.t === t)
            return this.propertyValuesMap;
        return this._getPropertyValuesMapForLocalT(t);
    }

    getPropertyValuesMapForKeyMoment(keyMomentsKey) {
        // cached until this.animanion is reinitialized, we need these
        // values repeatedly for ui-elements.
        return this.animanion.getPropertyValuesMapForKeyMoment(keyMomentsKey);
    }
}

/**
 * This is mainly for development/debugging.
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
    constructor(widgetBus) {
        super(widgetBus);
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
                            : value !== undefined ? value.toString() : 'undefined'
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

        if(changedMap.has('animationProperties@')) {
            const liveProperties = changedMap.get('animationProperties@');
            this._basicFields.set('fullDuration', liveProperties.fullDuration);
            this._setPropertiesToInfo(liveProperties.propertyValuesMap);
        }
    }
}

