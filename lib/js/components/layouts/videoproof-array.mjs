/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , unwrapPotentialWriteProxy
  , CoherenceFunction
} from '../../metamodel.mjs';

import {
     zip
} from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseComponent
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

 import {
    timeControlModelMixin
  , AnimationTGenerator
   , AnimationLiveProperties
  , binarySearch
 }  from '../animation-fundamentals.mjs';

import {
     activatableActorTypes
   , getActorWidgetSetup
} from '../actors/available-actors.mjs';

import {
    genericTypeToUIElement
} from '../type-driven-ui.mjs';

import {
    UICharGroupContainer
} from '../ui-char-groups.mjs';

import {
    isInheritingPropertyFn
} from '../registered-properties.mjs';

import {
    initAnimanion
  , UITimeControl
} from './stage-and-actors.mjs';


const VideoproofArrayActorModel = activatableActorTypes.get('VideoproofArrayActorModel').get('typeClass').value;
// START will be a module for calculateRegisteredKeyframes
/**
 * Array.from( cartesianProductGen([['a', 'b'], ['c', 'd']]) )
 * >>> [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']]
 *
 * No intermediate arrays are created.
 */
function* cartesianProductGen([head, ...tail]) {
    if(!head)
        yield [];
    else {
        // NOTE: the sequence of productGen(tail) could be stored
        // here as an intermediate array, but it may not improve
        // performance, as it's heavier on memory:
        // let products = [...productGen(tail)];
        for(let item of head)
            for(let prod of cartesianProductGen(tail))
                yield [item, ...prod];
    }
}

function* calculateKeyframes(orderedFilteredAxisRanges) {
    let axesOrder = orderedFilteredAxisRanges.length
            ? Array.from(zip(...orderedFilteredAxisRanges))[0]
            : []
      , axesMDM = [] // min-default-max
      ;
    // var axisRanges = (typeof rapBracket === 'object')
    //     // FIXME: rapBracket, rapTolerances are global
    //     ? axisRangesForRapBracket(currentFont.axes, rapBracket, rapTolerances)
    //     : currentFont.axes
    //     ;

    for(let [axis, axisRange] of orderedFilteredAxisRanges) {
        // mdn stands for min-default-max, however, the order
        // is default-min-max expect for opsz.
        // FIXME: find out the reason behind this.
        let mdmOrder = axis === 'opsz'
                ? ['min', 'default', 'max']
                : ['default', 'min', 'max']
          , mdm = mdmOrder.filter(k=>{ // jshint ignore:line
                    // This was loosely adopted from previous code
                    // where I didn't understand the full reasoning
                    // but for the present examples it produces the
                    // same result and is much more consise.
                    if(!('default' in axisRange))
                        throw new Error('SANITY CHECK ERROR: "default" must be in any axisRange.');
                    else if(!(k in axisRange))
                        return false;

                    if (k === 'default')
                        return true;
                    return (axisRange[k] !== axisRange['default']);
                })
                .map(k=>axisRange[k]) // jshint ignore:line
          ;
        axesMDM.push(mdm);
    }
    for(let axesValues of cartesianProductGen(axesMDM)) {
        yield Array.from(zip(axesOrder, axesValues));
        // let variationSettings = Object.fromEntries(zip(axesOrder, axesValues));
        // // FIXME: axesToFVS could take just the result of the zip
        // //        but it may get replaced entirely, so I leave it here
        // //        for the time being.
        // let fvs = axesToFVS(variationSettings);
        // // FIXME: I currently think there should be no duplicates.
        // if (fvs !== prev)
        //     fvsPerms.push(fvs);
        // else
        //     console.warn(`Found a case of duplication: ${fvs}`);
        // prev = fvs;
    }
    //return fvsPerms;
}

// For a more broadly useable tool, this should probaly be configurable per font.
// however 3 axes with each 3 (default, min, max) entries produces 3 * 3 * 3 = 27 keyframes
const REGISTERED_AXES_ORDERED = ['opsz', 'wdth', 'wght']; //, 'ital', 'slnt', 'grad', 'GRAD');

function calculateRegisteredKeyframes(axisRanges) {
    let orderedFilteredAxisRanges = [];
    // FIXME: registeredAxes is global
    for(let axis of REGISTERED_AXES_ORDERED) {
        if (!(axis in axisRanges)) {
            continue;
        }
        orderedFilteredAxisRanges.push([axis, axisRanges[axis]]);
    }
    return calculateKeyframes(orderedFilteredAxisRanges);
}
/**
 * a = [1,2,3]
 * b = [3,4.5]
 * dot(a, b) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] +
 */
function vecDot(a, b) {
    return Array.from(zip(a, b))
                .reduce((accum, [an, bn])=>accum + (an * bn), 0);
}

function vecSum(a, b) {
    return Array.from(zip(a, b))
                .map(([an, bn])=>an + bn);
}

function vecScale(a, scalar){
    return a.map(n=>n * scalar);
}

function vecSubstract(a, b) {
    return vecSum(a, vecScale(b, -1));
}

function vecLength(a) {
    return Math.sqrt(a.map(an=>an*an).reduce((accum, an)=> accum + an));
}

/**
 * ab is the line segment
 * p is the point which we search c, the clostest point on ab, for.
 *
 * from https://softwareengineering.stackexchange.com/a/168577
 * and https://gdbooks.gitbooks.io/3dcollisions/content/Chapter1/closest_point_on_line.html
 */
function closestPoint(a, b, p) {
    // Project p onto ab, computing the
    // paramaterized position d(t) = a + t * (b - a)
    let pa = vecSubstract(p, a) // p - a
      , ba = vecSubstract(b, a) // b - a
      , tRaw = vecDot(pa, ba) / vecDot(ba, ba)
        // Clamp T to a 0-1 range. If t was < 0 or > 1
        // then the closest point was outside the segment,
        // but on the line.
      , t = Math.min(1, Math.max(tRaw, 0))
      , ca = vecScale(ba, t)
        // Compute the projected position from the clamped t
      , c = vecSum(a, ca)
        // distance
      , d = vecLength(vecSubstract(pa, ca))
        // distance also
        // d = vecLength(vecSubstract(p, c))
      ;
    // Compute the projected position from the clamped t
    return [d, t, c];
}

function _getClosestPointFromKeyFrames(keyFramesCoordinates, searchLocation) {
    let distances = keyFramesCoordinates.map((keyframe, i, arr)=>{
            let nextKeyframe = i + 1 === arr.length ? arr[0] : arr[i+1];
            return  /*[distance, t, point] = */ closestPoint(keyframe, nextKeyframe, searchLocation);
        })
        // search lowest distance
      , keyFrameIndex = 0
      , lowestD = distances[keyFrameIndex][0]
      ;

    for(let [i, [d, ]] of distances.entries()) {
        if(d < lowestD) {
            lowestD = d;
            keyFrameIndex = i;
        }
    }
    // Calculate global t, i.e. over all keyframes, as keyFrameT
    // is only relative to the current keyFrame.
    let [distance, keyFrameT, point] = distances[keyFrameIndex]
     , keyFramesPosition = keyFrameIndex + keyFrameT
     , t = keyFramesPosition/keyFramesCoordinates.length
     ;
    return [distance, t, point];
}

class UIKeyMomentsLinkNavigation extends _BaseComponent {
    // jshint ignore: start
    static TEMPLATE = `<div class="ui_key_moments_link_navigation">
<label><!-- insert: label --></label>
<ol class="ui_key_moments_link_navigation-list"></ol>
</div>`;
    static ITEM_TEMPLATE = `<li class="ui_key_moments_link_navigation-list_item"
    ><a class="ui_key_moments_link_navigation-list_item-input"
        ><!-- insert: label --></a></li>`;
    // jshint ignore: end
    constructor(widgetBus, label) {
        super(widgetBus);
        this._inputToKey = new Map();
        this._keyToElement = new Map();
        this._currentKeyMoments = null;
        this._currentKeyMomentsSecondAndLast = [null, null];
        [this.element, this._list] = this._initTemplate(label);
    }
    _initTemplate(label) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , list = element.querySelector('.ui_key_moments_link_navigation-list')
          ;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);
        list.addEventListener('click', this._changeStateHandler(this._clickHandler.bind(this)), true);
        this._insertElement(element);
        return [element, list];
    }

    /**
     * Expects to be wrapped in _changeStateHandler
     */
    _clickHandler(event) {
        if(!this._inputToKey.has(event.target))
            // Could be the case for goBackToWhereWeLeft = true
            // but the UI should make it obvious that we're not selecting
            // a particular link but rather the whole thing.
            return;
        event.preventDefault();
        // If we would have used this.getEntry('keyMoments') directly,
        // we would have received it as a draft directly, which makes it
        // much harder to decide if this._currentKeyMoments is the same.
        // If keyMoments it's already a draft at this moment, it won't
        // be equal to this._currentKeyMoments, which is desired.
        // If it's immutable, the comparison will detect if we have
        // to navigate back to the orifinal keyMoments.
        const videoproofArrayPath =  Path.fromString(this.widgetBus.getExternalName('keyMoments')).append('..')
          , videoproofArray = this.getEntry(videoproofArrayPath)
          , keyMoments = unwrapPotentialWriteProxy(videoproofArray.get('keyMoments'))
          ;
        if(keyMoments !== this._currentKeyMoments) {
            videoproofArray.set('keyMoments', this._currentKeyMoments);
            this.getEntry('duration').value =  this._currentKeyMoments.size * 2; // TODO
            const font = this.getEntry('font').value
              , liveProperties = this.getEntry('animationProperties@')
              , propertyValuesMap = liveProperties.propertyValuesMap
              , searchLocation = []
              , goBackToWhereWeLeft = false
              ;

            // CAUTION this goes to the original location, when we
            // left the registered axes rap.
            // But seems like we want to go to the location that
            // was clicked. This is maybe another control, like:
            //      "leave moare raps and go back to registered axes rap"
            // I dont think this is totally false, could be a feature as
            // well, however, the UI doesn't tell the storry very well here.
            // Maybe the main rap should look like "inactive" and activate
            // on click and goBackToWhereWeLeft.

            if(goBackToWhereWeLeft) {
                // get the current values for the registered axes
                for(const axisTag of REGISTERED_AXES_ORDERED) {
                    const key = `${AXIS_LOCATIONS_ROOT}${axisTag}`
                      , value = propertyValuesMap.has(key)
                            ? propertyValuesMap.get(key)
                            : font.axisRanges[axisTag]['default']
                      ;
                    searchLocation.push(value);
                }
            }
            else {
                const key = this._inputToKey.get(event.target)
                  , keyMoment = this._currentKeyMoments.get(key)
                  , axesLocations = keyMoment.get('axesLocations')
                  ;
                for(const axisTag of REGISTERED_AXES_ORDERED) {
                    const value = axesLocations.has(axisTag)
                        ? axesLocations.get(axisTag).value
                        : font.axisRanges[axisTag]['default']
                        ;
                    searchLocation.push(value);
                }
            }
            // get the this._currentKeyMoments locations
            const locationsData = [];
            for(const [,keyMoment] of this._currentKeyMoments) {
                const axesLocations = keyMoment.get('axesLocations')
                  , location = []
                  ;
                // make sure all REGISTERED_AXES are present
                for(const axisTag of REGISTERED_AXES_ORDERED) {
                    const value = axesLocations.has(axisTag)
                        ? axesLocations.get(axisTag).value
                        : font.axisRanges[axisTag]['default']
                        ;
                    location.push(value);
                }
                locationsData.push(location);
            }
            // CAUTON the assumption t === normalT only works out
            // if the keyMoment durations are all the same!
            // But we can map normalT to t, because the the durations
            // of each keyMoment are known.
            const [/*distance*/, normalT,/*point*/] = _getClosestPointFromKeyFrames(locationsData, searchLocation)
              , normalAbsoluteT = locationsData.length * normalT
              , index = Math.trunc(normalAbsoluteT)
                // if index  === locationsData.length - 1
                // this is netween .at(-1) and 0
                // otherwise this is between
                // index and index + 1
              , normalDecimalT = normalAbsoluteT % 1
                // this is a loop
              , [fromKeyMoment, toKeymoment] = index === locationsData.length - 1
                     ? [-1, 0]
                     : [index, index + 1]
              , durations = Array.from(this._currentKeyMoments)
                      .map(([/*key*/, entry])=>entry.get('duration').value)
              , keyMomentsAbsoluteStartingTs = durations
                     .slice(1)
                     // don't use the first one, as it's starting at [0]
                     // also durations are "before" the keyMoment
                     // 1 2 3 1 => 0 2 5 6
                     .reduce((accum, value)=>{
                         accum.push((accum.length ? accum.at(-1) : 0) + value);
                         return accum;
                     }, [0])
              , fullDuration = durations.reduce((a, b)=>a + b, 0) // === keyMomentsAbsoluteStartingTs.at(-1)
              , fromAbsoluteKeyMomentT = keyMomentsAbsoluteStartingTs.at(fromKeyMoment)
                // duration
              , inbetweenAbsoluteT = durations.at(toKeymoment) * normalDecimalT
              , absoluteT = fromAbsoluteKeyMomentT + inbetweenAbsoluteT
              , t = absoluteT / fullDuration
              ;
            this.getEntry('t').value = t;
        }
        else {
            const key = this._inputToKey.get(event.target)
              , liveProperties = this.getEntry('animationProperties@')
              , localAnimanion = liveProperties.animanion.localAnimanion
              , keyMomentT= localAnimanion.keyMomentsKeyToT.get(key) / localAnimanion.fullDuration
              ;
            // CAUTION: in this case we treat localT and globalT the same.
            // This is not always true, also, calculaing globalT from a localT
            // is not simple and can have no answer or multiple answers in some cases.
            this.getEntry('t').value = keyMomentT;
        }
    }
    _updateControlsList(keyMoments) {
        this._domTool.clear(this._list);
        this._inputToKey.clear();
        this._keyToElement.clear();
        const items  = [];
        for(const [key, keyMoment] of keyMoments) {
            const listItem = this._domTool.createFragmentFromHTML(this.constructor.ITEM_TEMPLATE).firstElementChild
              , input = listItem.querySelector('.ui_key_moments_link_navigation-list_item-input')
              ;
            items.push(listItem);
            this._inputToKey.set(input, key);
            this._keyToElement.set(key, listItem);
            this._domTool.insertAtMarkerComment(listItem, 'insert: label', keyMoment.get('label').value || `(item #${key})`);
        }
        this._list.append(...items);
    }

    // very similar to getPropertyValue of animation-animanion.mjs
    // very similar to KeyMomentsControls._getInsertParameters
    _getKeyMomentsAnimationPosition(liveProperties) {
        const fullDuration = liveProperties.fullDuration
          , t = liveProperties.t
          , absoluteT = t * fullDuration
            // - for t, get the absoluteT
            // - get the keyMoment after
          , tToKeyMoments = liveProperties.tToKeyMoments
          , isLoop = tToKeyMoments.isLoop
          , momentTs = [...tToKeyMoments.keys()]
          , [left, right] = binarySearch(momentTs, absoluteT)
          ;
        if(left === null && right === null)
            // shouldn't happen, as in that case propertyToKeyMoment
            // should not have an entry for propertyName, there are
            // no keys...
           throw new Error(`ASSERTION FAILED KeyMoments must not be  empty.`);
        if(left === null) {
            // We are right of the last entry.

            if(right !== momentTs.length - 1)
                throw new Error(`ASSERTION FAILED: unkown state right "${right}" shoud be ${momentTs.length - 1}.`);

            // If we are not in a loop, the value won't change anymore.
            if(!isLoop) {
                const fromMomentTKey = momentTs[right]
                  , fromMomentData = tToKeyMoments.get(fromMomentTKey).at(-1)
                  , [fromMomentKey, /*keyMoment*/] = fromMomentData
                  ;
                return [1, null, fromMomentKey];
            }

            // coming from the last key
            const fromMomentTKey = momentTs[right]
              , fromMomentT = fromMomentTKey
                // get the last entry, as this is outgoing
              , fromMomentData = tToKeyMoments.get(fromMomentTKey).at(-1) // => [key, keyMoment]
              , [fromMomentKey, /*keyMoment*/] = fromMomentData
                // as absoluteT is right of the last frame, we move
                // toMomentT to where it would be if positioned after fromMomentT on the right.
              , toMomentTKey = momentTs[0]
              , toMomentT = fullDuration + toMomentTKey
              ;
            // Here's an ege case: in a loop with just one keyMoment and a
            // duration of zero we can't interpolate anything as
            // toMomentT === fromMomentT
            // partially copied from the right === null case!
            if(toMomentT === fromMomentT) {
                // This is the moment result value .at(-1);
                return [1, null, fromMomentKey];
            }

            // get the first entry, as this is incomning
            const toMomentData = tToKeyMoments.get(toMomentTKey).at(0) // => [key, keyMoment]
              , [toMomentKey, /*keyMoment*/] = toMomentData
              , localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
              ;
            return [localT, fromMomentKey, toMomentKey];
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
            const momentT = momentTs[left]
               // the last enty is the result of the moment
              , momentData = tToKeyMoments.get(momentT).at(-1)
              , [momentKey, /*keyMoment*/] = momentData
              ;
            return [1, null, momentKey];
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
                  , toMomentData = tToKeyMoments.get(toMomentTKey).at(-1) // => [key, keyMoment]
                  , [toMomentKey, /*keyMoment*/] = toMomentData
                  ;
                return [1, null, toMomentKey];
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
              , fromMomentData = tToKeyMoments.get(fromMomentTKey).at(-1) // => [key, keyMoment]
              , [fromMomentKey, /*keyMoment*/] = fromMomentData
              , toMomentT = momentTs[left]
              ;
            // Here's an ege case: in a loop with just one keyMoment and a
            // duration of zero we can't interpolate anything as
            // toMomentT === fromMomentT
            if(toMomentT === fromMomentT)
                // This is the moment result value .at(-1);
                return [1, null, fromMomentKey];

            // get the first entry, as this is incomning
            const toMomentData = tToKeyMoments.get(toMomentT).at(0) // => [key, keyMoment]
              , [toMomentKey, /*keyMoment*/] = toMomentData
              , localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
              ;
            return [localT, fromMomentKey, toMomentKey];
        }
        else {
            if(right - left !== 1)
                throw new Error(`ASSERTION FAILED left [${left}] and right [${right}] should`
                        + ` be directly next to each other but the distance is not 1: ${right - left}.`);

            const fromMomentT = momentTs[left]
                // get the last entry, as this is outgoing
              , fromMomentData = tToKeyMoments.get(fromMomentT).at(-1) // => [key, keyMoment]
              , [fromMomentKey, /*keyMoment*/] = fromMomentData
              , toMomentT = momentTs[right]
                // get the first entry, as this is incomning
              , toMomentData = tToKeyMoments.get(toMomentT).at(0) // => [key, keyMoment]
              , [toMomentKey, /*keyMoment*/] = toMomentData
              , localT = (absoluteT - fromMomentT) / (toMomentT - fromMomentT)
              ;
            return [localT, fromMomentKey, toMomentKey];
        }
    }

    _currentKeyMomentsChanged(keyMoments) {
        const [seccond, last] = [keyMoments.get(1), keyMoments.get(-1)]
          , [curSecond, curLast] = this._currentKeyMomentsSecondAndLast
          ;
        return seccond !== curSecond || last !== curLast;
    }

    update(changedMap) {
        const keyMoments = changedMap.has('keyMoments')
            ? changedMap.get('keyMoments')
            : this.getEntry('keyMoments')
            ;

        if(changedMap.has('font')) {
            // FIXME: here we should only update when the font changed.
            this._currentKeyMoments = keyMoments;
            // It's not a correct heuristic to look at the identity of keyMoments
            // as they change when charGroup changes, in this example at
            // least. This is because we're using the first KeyMoment to
            // store and change the information, it would be better
            // if we would inherit that data and don't change it in KeyMoments[0]
            // here's a workaround, looking at the the seccond and
            // last keyMoment, if there's only one keyMoment, this likely
            // as the last keyMoment is the first.
            this._currentKeyMomentsSecondAndLast =[keyMoments.get(1), keyMoments.get(-1)];
            this._updateControlsList(this._currentKeyMoments);
        }
        else if(!this._currentKeyMomentsChanged(keyMoments) && this._currentKeyMoments !== keyMoments) {
            // When we come back from a moar wrap, this prevents that we
            // loose the charGroup setting from the first key moment.
            // Because #1 and #-1 didn't change we "know" this is not a
            // moar wrap.
            this._currentKeyMoments = keyMoments;
        }
        // OLD: if this._currentKeyMoments === keyMoments we are not in
        // the main rap of the registered axes
        // NEW: if(!this._currentKeyMomentsChanged(keyMoments))
        // we are in the main rap.
        if(changedMap.has('animationProperties@') && !this._currentKeyMomentsChanged(keyMoments)) {
            const liveProperties = changedMap.get('animationProperties@');
            if(liveProperties.tToKeyMoments.size) {
                const [t, fromKey, toKey] = this._getKeyMomentsAnimationPosition(liveProperties)
                  , active = new Map([[toKey, t]])
                  ;
                if(fromKey !== null)
                    active.set(fromKey, 1-t);
                for(const [key, elem] of this._keyToElement) {
                    if(active.has(key))
                        elem.style.setProperty('--animation-local-impact', `${active.get(key)}`);
                    else
                        elem.style.removeProperty('--animation-local-impact');
                }
            }
        }
    }
}

const  AXIS_LOCATIONS_ROOT = 'axesLocations/';

class UIMoreRaps extends _BaseComponent {
    // jshint ignore: start
    static TEMPLATE = `<div class="ui_more_raps">
<label><!-- insert: label --></label>
<ol class="ui_more_raps-list"></ol>
</div>`;
    static ITEM_TEMPLATE = `<li class="ui_more_raps-list_item"
    ><a class="ui_more_raps-list_item-input"
        ><!-- insert: label --></a></li>`;
    // jshint ignore: end
    constructor(widgetBus, label) {
        super(widgetBus);
        this._inputToAxisTag = new Map();
        this._axisTagToElement = new Map();
        this._activeAxisTag = null;
        [this.element, this._list] = this._initTemplate(label);
    }
    _initTemplate(label) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , list = element.querySelector('.ui_more_raps-list')
          ;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);
        list.addEventListener('click', this._changeStateHandler(this._clickHandler.bind(this)), true);
        this._insertElement(element);
        return [element, list];
    }
    _setItemsActive(activeAxisTag) {
        for(const [axisTag, element] of this._axisTagToElement) {
            if(axisTag === activeAxisTag)
                element.classList.add('active');
            else
                element.classList.remove('active');
        }
    }
    _clickHandler(event) {
        if(!this._inputToAxisTag.has(event.target))
            return;
        event.preventDefault();
        const axisTag =  this._inputToAxisTag.get(event.target)
          , font = this.getEntry('font').value
          , axisRanges = font.axisRanges
          ;
            // FIXME: Ideally this is completley done in the update function!
        const liveProperties = this.getEntry('animationProperties@')
         , propertyValuesMap = liveProperties.propertyValuesMap
         , orderedFilteredAxisRanges = []
         , keyMoments = this.getEntry('keyMoments')
         ;
        // Keep the current values for the registered axes
        for(const axisTag of REGISTERED_AXES_ORDERED) {
            const key = `${AXIS_LOCATIONS_ROOT}${axisTag}`;
            if(!propertyValuesMap.has(key)) continue;
            const value = propertyValuesMap.get(key);
            orderedFilteredAxisRanges.push([axisTag, {'default': value}]);
        }
        orderedFilteredAxisRanges.push([axisTag, axisRanges[axisTag]]);
        const firstDeleted = keyMoments.splice(0, Infinity)[0];
        setKeyMomentsFromLocations(keyMoments, calculateKeyframes(orderedFilteredAxisRanges));

        this.getEntry('duration').value = keyMoments.size * 2; // TODO
        this.getEntry('t').value = 0;

        const firstNew = keyMoments.get(0)
            // TODO: A deny list is probably not the best pattern here,
            // as it's hard to decide whether no keys that should not be
            // copied are added in the future. the most important item
            // currently here is charGroup.
          , skip = new Set(['axesLocations', 'label', 'duration', 't', 'isActive'])
          ;
        for(const key of firstDeleted.keys()) {
            if(skip.has(key))
                continue;
            firstNew.set(key, firstDeleted.get(key));
        }
    }

    _updateControlsList(font) {
        this._domTool.clear(this._list);
        this._inputToAxisTag.clear();
        this._axisTagToElement.clear();
        const axes = font.fontObject.tables?.fvar?.axes
          , axisRanges = font.axisRanges
          , items = []
          ;

        for (let axis of axes) {
            if (REGISTERED_AXES_ORDERED.indexOf(axis.tag) !== -1)
                // because registered axes are part of the regular keyframes
                continue;
            const listItem = this._domTool.createFragmentFromHTML(this.constructor.ITEM_TEMPLATE).firstElementChild
              , input = listItem.querySelector('.ui_more_raps-list_item-input')
              , info = axisRanges[axis.tag]
              , label = `${info.name} ${info.min} ${info['default']} ${info.max}`
              ;
            items.push(listItem);
            this._domTool.insertAtMarkerComment(listItem, 'insert: label', label);
            this._inputToAxisTag.set(input, axis.tag);
            this._axisTagToElement.set(axis.tag, listItem);
        }
        this._list.append(...items);
    }

    update(changedMap) {
        if(changedMap.has('font')) {
            this._updateControlsList(changedMap.get('font').value);
        }

        if(changedMap.has('animationProperties@')) {
             const liveProperties = changedMap.get('animationProperties@')
               , propertyValuesMap = liveProperties.propertyValuesMap
               ;
            let foundAxisTag = null;
            for(const key of propertyValuesMap.keys()) {
                if(!key.startsWith(AXIS_LOCATIONS_ROOT))
                    continue;
                const axisTag = key.slice(AXIS_LOCATIONS_ROOT.length);
                if(REGISTERED_AXES_ORDERED.indexOf(axisTag) === -1
                        && this._axisTagToElement.has(axisTag)) {
                    foundAxisTag = axisTag;
                    break;

                }
            }
            if( this._activeAxisTag !== foundAxisTag) {
                this._activeAxisTag = foundAxisTag;
                this._setItemsActive(foundAxisTag);
            }
        }
    }
}

function setKeyMomentsFromLocations(keyMoments, locationsIter) {
    const KeyMomentModel = keyMoments.constructor.Model
      , newKeyMoments = []
      ;
    for(const locations of locationsIter) {
        //     create the new keyMoment
        //     set the label to the keymoment
        //     set the axes locations to the key moment
        const keyMoment = KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
              // opsz 8, wdth 100, wght 400
          , label = locations.map(([axisTag, location])=>`${axisTag} ${location}`).join(', ')
          , axesLocations = keyMoment.getDraftFor('axesLocations')
          ;
        keyMoment.get('label').value = label;
        axesLocations.arraySplice(0, Infinity);
        for(const [axisTag, location] of locations)
            axesLocations.setSimpleValue(axisTag, location);
        newKeyMoments.push(keyMoment);
    }
    keyMoments.push(...newKeyMoments);
}


// END will be a module for calculateRegisteredKeyframes

const VideoproofArrayModel = _BaseLayoutModel.createClass(
        'VideoproofArrayModel'
      , ...timeControlModelMixin
      , ['videoproofArray', VideoproofArrayActorModel]
      , CoherenceFunction.create(
            ['videoproofArray' , 'font', 'duration'/*, 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function initVideoproofArray({videoproofArray, font, duration}) {
            // always a loop
            videoproofArray.get('isLoop').value = true;
            const keyMoments = videoproofArray.get('keyMoments')
              , KeyMomentModel = keyMoments.constructor.Model
              , needInitialKeymoment = keyMoments.size === 0
                // Very nice that we can detect this here.
                // The videoproofArray.dependencies could also be set
                // e.g. by a user interface and it could confuse this
                // detection heuristic, however, we don't plan to
                // do this.
              , fontHasChanged = videoproofArray.dependencies.font !== font
              , needNewKeyMoments = needInitialKeymoment || fontHasChanged
              ;
            if(needInitialKeymoment) {
                // This is initial. We'll always require a keyMoment  at 0
                const newKeyMoment = KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
                  , defaultCharGroup = KeyMomentModel.fields.get('charGroup').fields.get('options').Model.defaultValue
                  ;
                newKeyMoment.get('charGroup').get('options').set(defaultCharGroup);
                keyMoments.push(newKeyMoment);
                console.log('CoherenceFunction setDefaultsVideoproofArray videoproofArray', videoproofArray, 'keyMoments', keyMoments);
            }
            if(needNewKeyMoments) {
                // TODO: we'll have to reset the KeyMoments here, to match
                // the new axis of the new font.
                console.log('CoherenceFunction setDefaultsVideoproofArray font changed'
                          , '\n>from', videoproofArray.dependencies.font.value.fullName
                          , `\n>to`, font.value.fullName
                            // TODO: do we need to define new dependencies for this, so it
                            // can trickle down ... ?
                            // It takes:  installedFonts, font
                            // but probably the default mechanism will do just fine and update
                            // the dependencies just fine when metamorphosing the
                            // drafts into states.
                          , '\n videoproofArray.dependencies:', videoproofArray.dependencies);
                // create the pure key moment locations and labels

                // Remove all keyMoments but the first. Keep the charGroups,
                // we want to retain that setting. Maybe there will be other
                // settngs we'll want to keep as well. We could alternatively
                // keep the first keyMoment and just update the locations
                // and labels, maybe that's less fuzz, but could also have
                // side effects.
                const keeperKeys = ['charGroup']
                  , keepers = []
                  ;
                {
                    const firstKeyMoment = keyMoments.get(0);
                    keepers.push(...keeperKeys.map(k=>[k, firstKeyMoment.get(k)]));
                }
                keyMoments.splice(0, Infinity);
                setKeyMomentsFromLocations(keyMoments
                        , calculateRegisteredKeyframes(font.value.axisRanges));

                const newFirstKeyMoment = keyMoments.get(0);
                keepers.map(([k,v])=>newFirstKeyMoment.set(k, v));

                // TODO: add  "Per Keyframe Duration" setting
                duration.value = keyMoments.size * 2;
            }
        })
    )
  ;

const _NOTDEF = Symbol('_NOTDEF');
class VideoproofArrayController extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('animationProperties@'));
        // original: this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // old: const animationPropertiesKey = widgetBus.rootPath.append('videoproofArray').toString()
        const animationPropertiesPath = widgetBus.rootPath.append('videoproofArray')
          , animationPropertiesKey = `animationProperties@${animationPropertiesPath}`
        // const animationPropertiesKey = `animationProperties@${widgetBus.rootPath.append('videoproofArray')}`
          , updateDefaultsDependencies = [
                [animationPropertiesKey, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          , propertyRoot = 'generic/charGroup/'
         ;


        this._animationPropertiesKey = animationPropertiesKey;
        // animationProperties@/activeState/videoproofArray
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {zone: 'main'}
              , []
              , UITimeControl
              , zones
            ]
          , [
                {
                    rootPath: animationPropertiesPath
                  , 'animationProperties@': animationPropertiesPath.toString()
                }
              , [
                    //...widgetBus.wrapper.getDependencyMapping(widgetBus.wrapper.constructor.DEPENDECIES_ALL)
                    ['/activeState/t', 'globalT'], 'keyMoments', 'isLoop' // same as in ContainerMeta!
                    // changedMap.has('keyMoments') || changedMap.has('isLoop') || changedMap.has('@parentProperties')
                ]
              , AnimationLiveProperties
              , initAnimanion // This usage instance won't receive parentProperties.
              , isInheritingPropertyFn
            ]
          , getActorWidgetSetup({
                typeKey: 'VideoproofArray' // ?
              , typeLabel: 'Videoproof Array' // ?
              , typeClass: VideoproofArrayActorModel
              , widgetRootPath: widgetBus.rootPath.append('videoproofArray')
              , zones: new Map([...zones, ['layer', zones.get('layout')]])
              , get layerBaseClass() {throw new Error('NOT IMPLEMENTED get layerBaseClass');}
              , getActorWidgetSetup() {throw new Error('NOT IMPLEMENTED getActorWidgetSetup');}
            })
          , [
                {
                    zone: 'main'
                  , rootPath: widgetBus.rootPath.append('videoproofArray', 'keyMoments', '0', 'charGroup')
                }
              , []
              , UICharGroupContainer
              , zones
              , {
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2771
                    updateDefaultsDependencies
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2775
                  , requireUpdateDefaults
                  , genericTypeToUIElement
                    // get: not implemented: UICharGroupContainer http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2955
                    // use: not implemented:  _activateCustom http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:3020
                    // Uncaught (in promise) Error: not implemented: get getDefaults(prefix:string:generic/charGroup, key:string:options, defaultVal:object:null)
                  , getDefaults: function(ppsRecord, modelFieldName, defaultVal=_NOTDEF) {
                        // This is similar to KeyMomentController._getDefaults
                        // it should not be rewquried to always have to rewrite these.
                        // This is similar to KeyMomentController._getDefaults
                        // it should not be rewquried to always have to rewrite these.
                        const {fullKey} = ppsRecord
                          , liveProperties = this.getEntry(this._animationPropertiesKey)
                          , activeKey = '0' // hard coded, here always the first key moment  //this.widgetBus.rootPath.parts.at(-1)
                          , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
                          ;
                        //.localAnimanion, 'keyMomentsKeyToT:', liveProperties.localAnimanion.keyMomentsKeyToT);
                        if(propertyValues.has(fullKey)) {
                            return propertyValues.get(fullKey);
                        }
                        if(defaultVal !== _NOTDEF) {
                            return defaultVal;
                        }
                        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
                    }.bind(this)
                }
              , propertyRoot
              , 'Glyphs'
            ]
          , [
                {zone: 'main'}
              , [
                    ['videoproofArray/keyMoments', 'keyMoments']
                  , ['../font', 'font']
                  , 'duration'
                  , 't'
                    // inject animationProperties@
                  , ...updateDefaultsDependencies
                ]
              , UIKeyMomentsLinkNavigation
              , 'Key Moments'
            ]
          , [
                {zone: 'main'}
              , [
                    ['videoproofArray/keyMoments', 'keyMoments']
                  , ['../font', 'font']
                  , 'duration'
                  , 't'
                    // inject animationProperties@
                  , ...updateDefaultsDependencies
                ]
              , UIMoreRaps
              , 'But wait, there’s more'
            ]
        ];
        this._initWidgets(widgets);
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

export {
    VideoproofArrayModel as Model
  , VideoproofArrayController as Controller
};
