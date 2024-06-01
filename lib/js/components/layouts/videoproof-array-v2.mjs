/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , getEntry
  , getDraftEntry
  , ForeignKey
  , unwrapPotentialWriteProxy
//  , StateComparison
  , CoherenceFunction
  , StringModel
//  , NumberModel
  , _AbstractNumberModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractEnumModel
  , ValueLink
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractListModel
  , StaticDependency
//  , getMinMaxRangeFromType
//  , _BaseSimpleModel
//  , _BaseContainerModel
//  , BooleanModel
//  , BooleanDefaultTrueModel
//  , FreezableSet
  , createDynamicType
} from '../../metamodel.mjs';

import {
     zip
//   , enumerate
//   , mapValueToRange
} from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
//  , _CommonContainerComponent
//  , UPDATE_STRATEGY
//  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
//  , UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
//  , HANDLE_CHANGED_AS_NEW
  , SimpleProtocolHandler
} from '../basics.mjs';

 import {
     StaticNode
   , DynamicTag
   , StaticTag
//   , UINumberInput
//   , PlainNumberAndRangeInput
//   , PlainToggleButton
//   , PlainNumberAndRangeOrEmptyInput
//   , UINumberAndRangeOrEmptyInput
//   , UILineOfTextInput
//   , UILineOfTextOrEmptyInput
//   , GenericSelect
//   , UISelectInput
//   , UISelectOrEmptyInput
//   , PlainSelectInput
//   , UIToggleButton
  , UICheckboxOrEmptyInput
} from '../generic.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    FontSelect
} from '../font-loading.mjs';

 import {
    timeControlModelMixin
  , AnimationTGenerator
  , UITimeControlCircle
//   , UIActorTimeControlKeyMomentSelectCircle
  , getBasicPlayerControlWidgets
//   , LocalScopeAnimanion
//   , AnimationLiveProperties
//   , AnimationInfo
  , binarySearch
 }  from '../animation-fundamentals.mjs';

//import {
//    createLabelForKeyMoment
//} from './example-key-moments.mjs';

//import {
//    UIManualAxesLocations
//  , AxesLocationsModel
//} from '../ui-manual-axis-locations.mjs';

//import {
//    formatCss as culoriFormatCss
//  , getMode as culoriGetMode
//  , converter as culoriConverter
//  , interpolate as culoriInterpolate
//  , fixupHueShorter
//  , fixupHueLonger
// , fixupHueDecreasing
//  , fixupHueIncreasing
//} from '../../vendor/culori/bundled/culori.mjs';

import {
//    COLOR_TYPE_TO_CULORI_MODE
//  , PECENTAGE_UNIT_NUMBER_TYPES
//  , TURN_UNIT_NUMBER_TYPES
//  , _BaseColorModel
//  , ColorModel
    AvailableColorTypesModel
  , availableColorTypes
//  , culoriValuesToColorValuesRange
  , culoriToColor
  , getColorFromPropertyValuesMap
// , colorToCss
  , colorToCulori
  , culoriConverter
} from '../color.mjs';

import {
//    ActorsModel
//    AvailableActorTypesModel
     createActor
} from '../actors/actors-base.mjs';

// import {
//    TypographyKeyMomentsModel
//   , FontSizeModel
// } from '../actors/models.mjs';

import {
     activatableActorTypes
   , getActorWidgetSetup
//   , getActorTreeNodeType
//   , isTypographicActorTypeKey
//   , getActorTypeKeySpecificWidgets
} from '../actors/available-actors.mjs';

// import {
//     CONTAINER_TASK_AUTOMATIONS
// } from  '../task-automations/container-task-automations.mjs';

import {
//     REGISTERED_PROPERTIES
    getRegisteredPropertySetup
} from '../actors/stage-registered-properties.mjs';

// import {
//     StageDOMNode
// } from '../actors/stage.mjs';

// import {
//     ActiveActorsRenderingController
// } from '../actors/active-actors-rendering-controller.mjs';


// import {
//     UISelectCharGroupInput
//   , UISelectCharGroupOrEmptyInput
//   , getExendedChars
//   , getCharsForSelectUI
// } from '../ui-char-groups.mjs';

// import {
//     CharGroupOptionsModel
//   , CharGroupModel
// } from '../actors/videoproof-array.mjs';


import {
    initAnimanion
  , isInheritingPropertyFn
  , UICharGroupContainer
  , DATA_TRANSFER_TYPES
  , UIColorChooser
} from './stage-and-actors.mjs';

import {
    ContainerMeta
} from '../actors/actors-meta.mjs';

const VideoproofArrayV2ActorModel = activatableActorTypes.get('VideoproofArrayV2ActorModel').get('typeClass').value;
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

function* _cartesianProductGenSingleValyeChanges([head, ...tail]) {
    if(!head) {
        yield [];
        return
    }
    const lastYield = []
     , firstYield = []
     ;
    for(let item of head) {
        for(let prod of cartesianProductGenSingleValyeChanges(tail)) {
            const [lastItem, ...lastProd ] = lastYield;
            if(lastItem !== item && lastProd.length) {
                // Make a transition only if item changed
                const l = lastProd.length;
                for(let i=0;i<l;i++) {
                    // lastProd = ['A', 'B', 'C', 'D']
                    // prod = ['1', '2', '3', '4']
                    //    >>  [ 'A', 'B', 'C', 'D' ]
                    //    >>  [ '1', 'B', 'C', 'D' ]
                    //    >>  [ '1', '2', 'C', 'D' ]
                    //    >>  [ '1', '2', '3', 'D' ]
                    yield[ item, ...prod.slice(0,i),  ...lastProd.slice(i, l)];
                }
            }
            lastYield.splice(0, Infinity, item, ...prod);
            if(!firstYield.length)
                firstYield.splice(0, Infinity, ...lastYield);
            yield lastYield;
        }
    }
}

/**
 * This is closing the circle, back to the first KeyMoment
 * part that introduces duplicates.
 */
function* cartesianProductGenSingleValyeChanges(items) {
    const firstYield = []
      , lastYield = []
      ;
    for(const result of _cartesianProductGenSingleValyeChanges(items)) {
        yield result;
        lastYield.splice(0, Infinity, ...result);
        if(!firstYield.length)
            firstYield.push(...result);
    }
    if(!firstYield.length)
        return;

    const [item, ...prod] = firstYield
      , [, ...lastProd] = lastYield
      , l = lastProd.length
      ;
    for(let i=0;i<l;i++)
        yield[ item, ...prod.slice(0,i),  ...lastProd.slice(i, l)];
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

    // cartesianProductGenSingleValyeChanges is experimental to test
    // how that behavior works out. It breaks e.g. the assumption that
    // there are no duplicate keyMoments. I'll rather not keep it around
    // but I want to commit it ince to history.
    const useOnlySingleValueChanges = false
      , gen = useOnlySingleValueChanges
            ? cartesianProductGenSingleValyeChanges(axesMDM)
            : cartesianProductGen(axesMDM)
      , counter = new Map()
      ;
    let lastkey = null;
    for(let axesValues of gen) {
        const key = axesValues.join(';');
        if(!counter.has(key)) counter.set(key, 0);
        counter.set(key, counter.get(key)+1);

        if(lastkey === key) {
            // only occurs with cartesianProductGenSingleValyeChanges
            continue;
        }
        lastkey = key;
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
      , keyFrameIndexes  = [lowestD]
      ;

    for(let [i, [d, ]] of distances.entries()) {
        if(d < lowestD) {
            lowestD = d;
            keyFrameIndexes = [i];
        }
        else if(d === lowestD) {
            // At some point, we'll want to be able to distinguish between
            // similar locations, and remembering related keyFrameIndexes
            // is still better than just using t. However, t could as well
            // work as a hint, to which of the results is good.
            // The main use case is still to be able to alter axis locations
            // in a serialized state and return to a reasonable position
            // when deserialized.
            keyFrameIndexes.push(0);
        }
    }
    keyFrameIndex = keyFrameIndexes[0];
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
            // FIXME: the assumption here was that all keyMoments are
            // unique, but, if there are multiple keyMoments that are the
            // same, this will jump to the first match. At that point,
            // where multiple keyMoments are introduced, storing t is
            // probably the better idea. When the transition is inbetween
            // keyMoments, this may still produce a good result, but easily
            // testable is the case when t is directly on a duplicate moment.
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
        const [seccond, last] = [keyMoments.get(1, null), keyMoments.get(-1)]
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
            this._currentKeyMomentsSecondAndLast =[keyMoments.get(1, null), keyMoments.get(-1)];
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

const _NOTDEF = Symbol('_NOTDEF');

class UIVideoproofArrayLayer extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const localMainElement = widgetBus.domTool.createElement('div', {'class': 'ui-videoproof_array-layer'})
          , zones = new Map([..._zones, ['main', localMainElement]])
          ;
        super(widgetBus, zones);
        this.element = localMainElement;
        this._insertElement(this.element);
        // updateDefaultsDependencies is relative to the UIColorChooser
        // children in this case. The actual address is the same as
        // this.widgetBus.rootPath
        //      (e.g. "/activeState/videoproofArrayV2/activeActors/0/instance")
        // The three levels up are e.g. the "./keyMoments/0/textColor"
        const updateDefaultsDependencies = [
                [`animationProperties@./../../../`, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          ;
        const widgets = [
            [
                {zone: 'main'}
              , [
                    ['font', 'data']
                ]
              , DynamicTag
              , 'span', {}
              , font=>font.nameVersion
            ]
          , [
                {
                    // rootPath: widgetRootPath
                    //,
                    zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                    ['/availableFonts', 'options']
                  , ['localActiveFontKey', 'activeFontKey']
                ]
              , FontSelect
              , true
            ]
            // these are in the keyMoments!...
            // Should either be set in keyMoments[0] or in the
            // VideoproofArrayV2CellActorModel which would then
            // have to inherit it to the keyMoments as defaults.
            // using keyMoments[0] seems like a lesser effort at the moments.
            // But we need to create keyMoments[0] when the actor is created.
            // textColor
            // backgroundColor
           , [
                {
                    rootPath: Path.fromParts('.', 'keyMoments', '0', 'textColor')
                }
              , []
              , UIColorChooser
              , zones
              , 'Text Color'
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
              , this._getDefaults.bind(this, 'colors/', 'textColor', )
              , updateDefaultsDependencies
              , requireUpdateDefaults
            ]
          , [
                {
                    rootPath: Path.fromParts('.', 'keyMoments', '0', 'backgroundColor')
                }
              , []
              , UIColorChooser
              , zones
              , 'Background Color'
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
              , this._getDefaults.bind(this, 'colors/', 'backgroundColor', )
              , updateDefaultsDependencies
              , requireUpdateDefaults
          ]
        ];
        this._initWidgets(widgets);
    }

    // in [ProtocolHandler animationProperties@].
    _getDefaults(prefix, key, defaultVal=_NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const fullKey = `${prefix}${key}`
           , liveProperties = this.getEntry('animationProperties@')
           , activeKey =  '0'//this.widgetBus.rootPath.parts.at(-1)
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(fullKey.startsWith('colors/')) {
            const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
            if(color !== null)
                return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(fullKey, defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal
                    );
            return fallback === defaultVal
                ? defaultVal
                : fallback.default
                ;
        }
        else if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
    }
}

class UIButton extends _BaseComponent {
    // jshint ignore: start
    static TEMPLATE = `<button class="ui_button"><!-- insert: label --></button>`;
    // jshint ignore: end
    constructor(widgetBus, label, eventHandlers=[], options={title:null, classPart:null, elementAttributes: []}) {
        super(widgetBus);
        [this.element] = this._initTemplate(label, eventHandlers, options);
    }
    _initTemplate(label, eventHandlers, {title, classPart, elementAttributes}) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);
        for(const args of eventHandlers)
            element.addEventListener(...args /* e.g.: ['click', onClickFn, true] */);
        if(classPart !== null && classPart !== undefined)
            element.classList.add(`ui_button-${classPart}`);
        if(title !== null && title !== undefined)
            element.title = title;
        if(elementAttributes !== null && elementAttributes !== undefined)
            for(const [name, value] of elementAttributes)
                element.setAttribute(name, value);
        this._insertElement(element);
        return [element];
    }
}

/**
 * Wrapper for UIVideoproofArrayLayer with augmented controls to
 * move(reorder)/delete
 */
class UIVideoproofArrayLayerItem extends _BaseContainerComponent {
    constructor(widgetBus, _zones, eventHandlers) {
        const localMainElement = widgetBus.domTool.createElement('div', {'class': 'ui_videoproof_array_layers-item'})
          , zones = new Map([..._zones, ['main', localMainElement]])
          ;
        super(widgetBus, zones);
        this.element = localMainElement;
        this._insertElement(this.element);
        const key = widgetBus.rootPath.parts.at(-1);
        for(const [eventType, handler, ...restArgs] of eventHandlers)
            this.element.addEventListener(eventType, event=>handler(`key@@${key}`, event), ...restArgs);

        const widgets = [
            [
                {   zone: 'main'
                  , rootPath: Path.fromParts('.', 'instance')
                }
              , [
                    'animationProperties@'
                ]
              , UIVideoproofArrayLayer
              , zones
            ]
          , [
                  {zone: 'main'}
                , []
                , UIButton
                , '-'
                , [['click', this._changeStateHandler((event)=>{
                        event.preventDefault();
                        const key = widgetBus.rootPath.parts.at(-1)
                          , activeActors = this.widgetBus.getEntry(widgetBus.rootPath.parent)
                          ;
                        activeActors.delete(key);
                        if(activeActors.size === 1) {
                            // unset the text color so it is the default
                            // black color. This behavior may be annoying
                            // for some users in some cases: wanting to
                            // keep the textColor. However, it kind of
                            // is in sync with the behavior of setting these
                            // colors. Maybe we need a trigger or not-trigger
                            // for it, e.g. to press a modifier key when
                            // deleting.
                            getDraftEntry(activeActors, './0/instance/keyMoments/0/textColor/colorTypeKey').value = ForeignKey.NULL;
                        }
                    })
                    , true]]
                , {title: 'Remove', classPart: 'remove'}
            ]
          , [
                  {zone: 'main'}
                , []
                , UIButton
                , '⇵'
                , [
                      ['dragstart', this._dragstartHandler.bind(this)]
                    , ['dragend', this._dragendHandler.bind(this)]
                  ]
                , {title: 'Move', classPart: 'move', elementAttributes: [['draggable', 'true']]}
            ]
        ];
        this._initWidgets(widgets);
    }
    _dragstartHandler(event) {
        const key = this.widgetBus.rootPath.parts.at(-1)
          ,  path = Path.fromParts('.', key)
          ;
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_PATH, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof actor path: ${path}]`);
        event.currentTarget.parentElement.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(event.currentTarget.parentElement, 0 , 0);
    }
    _dragendHandler(event) {
        event.currentTarget.parentElement.classList.remove('dragging');
    }
}

class UIVideoproofArrayLayersController extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, ...customArgs) {
        super(widgetBus, zones);
        this._customArgs = customArgs;
    }
    _createWrapper(rootPath) {
        const settings = {
               rootPath: rootPath
             , zone: 'main'
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = UIVideoproofArrayLayerItem
          , args = [this._zones, ...this._customArgs]
          , childWidgetBus = this._childrenWidgetBus
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class UIVideoproofArrayLayers extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const localZoneElement = widgetBus.domTool.createElement('fieldset', {'class': 'ui_videoproof_array_layers'})
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_videoproof_array_layers-items'})
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);
        this._dropTargetElement = childrensMainZoneElement;

        this._dropTargetElement.addEventListener('dragenter', this._dragenterHandler.bind(this));
        this._dropTargetElement.addEventListener('dragover', this._dragoverHandler.bind(this));
        this._dropTargetElement.addEventListener('drop', this._dropHandler.bind(this));
        this._dropTargetElement.addEventListener('dragleave', this._dragleaveHandler.bind(this));

        this._removeDragIndicatorTimeoutId = null;
        const widgets = [
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , [label]
            ]
          , [
                {zone: 'local'}
              , []
              , StaticNode
              , childrensMainZoneElement
            ]
          , [
                // If there's just one layer.
                {
                    zone: 'main'
                    // FIXME: These activationTest functions run a lot during
                    // animation, maybe that can be changed or this widget
                    // can check on update only when activeActors changes instead.
                  , activationTest: ()=>{
                        const activeActors = widgetBus.getEntry(widgetBus.rootPath);
                        return activeActors.size === 1;
                    }
                  , rootPath: Path.fromParts('.', '0', 'instance')
                  , id: 'Layer'
                }
              , [
                    'animationProperties@'
                ]
              , UIVideoproofArrayLayer
              , zones
            ]
          , [
                // If there are more than one layers
                {
                    zone: 'main'
                  , activationTest: ()=>{
                        const activeActors = widgetBus.getEntry(widgetBus.rootPath);
                        return activeActors.size > 1;
                    }
                  , id: 'LayersController'
                }
              , [
                    ['.', 'collection']
                ]
              , UIVideoproofArrayLayersController
              , zones
              , [
                //    ['dragenter', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                //  , ['dragover', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                //  , ['drop', (key, event, ...args)=>console.log(`->injected into UIVideoproofArrayLayersController ${key}; event.type ${event.type};`, event.currentTarget ,'args:', ...args)]
                ]
            ]
          , [
                  {zone: 'local'}
                , []
                , UIButton
                , '+'
                , [['click', this._changeStateHandler((event)=>{
                        // FIXME: should get the font to use from a <select>
                        event.preventDefault();
                        const activeActors = this.widgetBus.getEntry(widgetBus.rootPath) // activeActors
                        insertNewCellActorModel(activeActors);
                    })
                    , true]]
                , {title: 'Add', classPart: 'add'}
            ]
        ];
        this._initWidgets(widgets);
    }

    // FIXME: Straight copy from StageManager: should be a shared thing.
    // The allowed DATA_TRANSFER_TYPES array could be an argument to bind.
    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [DATA_TRANSFER_TYPES.ACTOR_PATH, DATA_TRANSFER_TYPES.ACTOR_CREATE];
        for(const type of applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    /**
     * FIXME: Mapping from DOM to Model path/key is kind of dark magic.
     * It would probably be cleaner to inject the dragHandlers into
     * the children and call them with the necessary information ammended.
     * ALso, this has very intimate knowledge about the structure of it's
     * children.
     */
    _getChildKeyFromElement(childElement) {
        const layerController = this.getWidgetById('LayersController', null);
        if(layerController !== null) {
            for(const [,childWrapper] of layerController.widgets()) {
                if(childWrapper.widget.element === childElement)
                    return childWrapper.widgetBus.rootPath.parts.at(-1);
            }
            // e.g. the parent container that listens to the event.
            return null;
        }
        const layer = this.getWidgetById('Layer', null);
        if(layer !== null)
            return '0';
        return null;
    }

    _getClosestChild(element) {
        if(element === this._dropTargetElement)
            return this._dropTargetElement;
        for(const childElement of this._dropTargetElement.children) {
            if(childElement === element || childElement.contains(element))
                return childElement;
        }
        throw new Error(`UNKOWN can't get closest child in ${this}.`);
    }

    _getDropTargetInsertPosition(event) {
        const result = {targetElement: null, childKey: null, insertPosition: null};
        // NOTE: node.contains(node) === true
        if(this._dropTargetElement.contains(event.target)) {
            const targetElement = this._getClosestChild(event.target);
            result.targetElement = targetElement;
            result.childKey = this._getChildKeyFromElement(targetElement);
        }
        else
            throw new Error(`VALUE ERROR event.target can't be mapped to ${this}.`);


        const {height, top} = result.targetElement.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = 0.5
          // = item.isEmptyLayerItem
          //       // Move this line below the empty layer container <ol> active
          //       // zone, such that we don't get undecided flickering between
          //       // the empty container zone and the item above: the <li> that
          //       // contains the empty children <ol>.
          //       ? 0.8
          //       : 0.5
          ;
        result.insertPosition = relativeY < testPosition ? 'before' : 'after';
        return result;
    }

    _setDropTargetIndicator({insertPosition=null, targetElement=null}={}) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of [this._dropTargetElement, ...this._dropTargetElement.querySelectorAll(`.${markedClass}`)]) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for(const name of [...elem.classList]) {
                if(name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if(insertPosition === null)
            return;

        if(!['before', 'after', 'insert'].includes(insertPosition))
            throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            // return;

        const [elem, posClassSuffix] = this._dropTargetElement !== targetElement
                            && insertPosition === 'before'
                            && targetElement.previousElementSibling
                ? [targetElement.previousElementSibling, 'after']
                : [targetElement, insertPosition]
                ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dropIndicatorForDragHandler(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                  // TODO: not yet used in this context
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(event);
        this._setDropTargetIndicator(insertPosition);
    }

    _dragoverHandler(event) {
        return this._dropIndicatorForDragHandler(event);
    }

    _dragenterHandler(event) {
        return this._dropIndicatorForDragHandler(event);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const {setTimeout} = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this), 100);
    }

    _dropHandler(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(); // remove indicator
        const {childKey:targetKey, insertPosition} = this._getDropTargetInsertPosition(event);

        if(type === DATA_TRANSFER_TYPES.ACTOR_PATH) {
            const sourcePath = Path.fromString(event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH))
              , sourceKey = sourcePath.parts.at(-1)
              ;
            return this._move(sourceKey, targetKey, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.ACTOR_CREATE) {
            const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_CREATE);
            return this._create(typeKey, targetKey, insertPosition);
        }
    }

    _create(typeKey, targetKey, insertPosition){
        throw new Error(`NOT IMPLEMENTED ${this}._create for type ${typeKey} at ${insertPosition}#{targetKey}.`);
    }

    _move(sourceKey, targetKey, insertPosition) {
        if(sourceKey === targetKey)
            return; // nothing to do

        return this._changeState(()=>{
            const activeActors = this.widgetBus.getEntry(this.widgetBus.rootPath)
              , source = activeActors.get(sourceKey)
              , targetIndex = targetKey === null
                        ? (insertPosition === 'after' ? activeActors.size : 0)
                        : parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;
            if(sourceIndex === targetIndex)
                return;// nothing to do

            let insertIndex;
            if(insertPosition === 'after')
                insertIndex =targetIndex + 1;
            else if(insertPosition === 'before')
                insertIndex = targetIndex;
            else
                throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

            if(sourceIndex < targetIndex)
                // by the time we insert, sourceIndex is already removed from before
                insertIndex = insertIndex - 1;
            activeActors.delete(sourceKey);
            activeActors.splice(insertIndex, 0, source);
        });
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

// START Axes Math
export class _BaseAxesMathItemModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}

export const AxesMathItemTypeModel = _AbstractGenericModel.createClass('AxesMathItemTypeModel')// => .value will be a concrete _BaseColorModel
    // make this selectable...
  , AvailableAxesMathItemTypeModel = _AbstractStructModel.createClass(
        'AvailableAxesMathItemTypeModel'
      , ['label', StringModel]
      , ['typeClass', AxesMathItemTypeModel]
    )
  , AvailableAxesMathItemTypesModel = _AbstractOrderedMapModel.createClass('AvailableAxesMathItemTypesModel', AvailableAxesMathItemTypeModel)
  , AxesMathItemModel = _AbstractStructModel.createClass(
        'AxesMathItemModel'

      // FIXME: No need to inherit availableAxesMathItemTypes, the elements
      // are fixed, hence StaticDependency.createWithInternalizedDependency
      // it is, HOWEVER, the 'items' in the list models are dependent
      // on this AxesMathItemModel and thus there's a circular dependency.
      // The host model of this model will have to declare the StaticDependency
      // unless a way is developed to make this directly possible.
      //, ... StaticDependency.createWithInternalizedDependency(
      //                  'availableAxesMathItemTypes'
      //                , AvailableAxesMathItemTypesModel
      //                , availableAxesMathItemTypes
      //                )
      , ['availableAxesMathItemTypes', new InternalizedDependency('availableAxesMathItemTypes', AvailableAxesMathItemTypesModel)]
      //
        // TODO: having ALLOW_NULL here is interesting, and I'm not convinced
        // all the consequences are known by me now. It's about not creating
        // whatever AxesMathItem this falls back to. But eventually null means
        // _AbstractDynamicStructModel: instance will have a null value.
        // and maybe we should handle this like an _AbstractSimpleOrEmptyModel
        // which raises if trying to read from an empty model and hence forces
        // awareness and always to use
      , ['axesMathItemTypeKey', new ForeignKey('availableAxesMathItemTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['axesMathItemTypeModel', new ValueLink('axesMathItemTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicAxesMathItemModel'
                            , _BaseAxesMathItemModel
                            ,'axesMathItemTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableAxesMathItemTypes'])]
    )
  , AxesMathItemsModel = _AbstractListModel.createClass('AxesMathItemsModel', AxesMathItemModel)
    /**
     * Addition
     *
     * resolve all contained lists and locations and return
     * concatenated as flat list of locations
     */
  , AxesMathPlusListModel = _BaseAxesMathItemModel.createClass(
        'AxesMathPlusListModel'
      , ['items', AxesMathItemsModel]
        // options could include:
        //      - remove duplicates
    )
    /**
     * Multiplication
     *
     * - resolve all contained lists and location elemens into single location elements
     *   very much the same as AxesMathPlusListModel does.
     * - merge all items (axes) of the location elements into axis value lists/sets
     *   retaining the order of appearance of the axes
     * - return the n-fold cartesian product of all item-sets.
     */
  , AxesMathTimesListModel = _BaseAxesMathItemModel.createClass(
        'AxesMathTimesListModel'
      , ['items', AxesMathItemsModel]
        // options could include:
        //     - make sets of all items to reduce duplicates
        //     - how to handle empty lists in items => should that create
        //       an empty result, i.e. like 10 * 0 === 0
    )
    /**
     * A location is a collection of [axis-tag, value]
     */
  , AxesMathAxisLogicalSymbolicLocationModel = _AbstractEnumModel.createClass('AxesMathAxisLogicalSymbolicLocationModel', ['default', 'min', 'max', 'number'], 'default')
  , AxesMathAxisLocationNumberModel = _AbstractNumberModel.createClass('AxesMathAxisLocationNumberModel', {defaultValue: 0/*, toFixedDigits: 5*/})
  , AxesMathAxisLocationNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(AxesMathAxisLocationNumberModel)
  , AxesMathAxisLocationModel = _AbstractStructModel.createClass(
        'AxesMathAxisLocationModel'
      , ['logicalValue', AxesMathAxisLogicalSymbolicLocationModel]
        // only if logicalValue is "number" otherwise empty, default 0
        // FIXME: requires a CoherenceFunction
      , ['numericValue', AxesMathAxisLocationNumberOrEmptyModel]
    )
  , AxesMathAxisLocationsModel = _AbstractOrderedMapModel.createClass('AxesMathAxisLocationsModel', AxesMathAxisLocationModel)
    // FIXME: This should not have to be be a struct, just directly an
    // AxesMathAxisLocationsModel can it be made possible?
    // _AbstractDynamicStructModel expects a struct and can then nicley
    // relay the API, but maybe an _AbstractDynamicModel can be created with
    // just a list of allowed types, the API would have to be called
    // via `.wrapped`.
    // CAUTION: This is, unless there are more properties to be added to
    // this type and looking at it that way, if the implementation settles
    // there will still be time to make this more efficient with the
    // approach above. On case for a broader implementation could be
    // a comparisopn with ManualAxesLocationsModel which also has
    // autoOPSZ and a coherence funtion, but at the moment that doesn't
    // make sense. One other thought is that this could become a
    // more general KeyMomentsMath, but I don't have a use case in mind
    // yet either.
  , AxesMathLocationModel = _BaseAxesMathItemModel.createClass(
        'AxesMathLocationModel'
      , ['axesLocations', AxesMathAxisLocationsModel]
  )
  , [availableAxesMathItemTypes, AXES_MATH_ITEM_TYPE_TO_KEY] = (()=>{
        const axesMathItemTypes = [
                ['PlusList', '+-List', AxesMathPlusListModel]
              , ['TimesList', '×-List', AxesMathTimesListModel]
              , ['Location', 'Location', AxesMathLocationModel]
            ]
          , availableAxesMathItemTypesDraft = AvailableAxesMathItemTypesModel.createPrimalDraft({})
          , TYPE_TO_KEY = new Map()
          ;
        for(const [key, label, Model] of axesMathItemTypes) {
            const availableType = AvailableAxesMathItemTypeModel.createPrimalDraft({});
            availableType.get('typeClass').value = Model;
            availableType.get('label').value = label;
            availableAxesMathItemTypesDraft.push([key, availableType]);
            TYPE_TO_KEY.set(Model, key);
        }
        const availableAxesMathItemTypes = availableAxesMathItemTypesDraft.metamorphose();
        return [availableAxesMathItemTypes, TYPE_TO_KEY];
    })()
  ;

function createAxesMathItem(typeKey, dependencies) {
    return createDynamicType(AxesMathItemModel, 'axesMathItemTypeKey', typeKey, dependencies);
}
// END Axes Math

/**
 * this will be rather versatile.
 *
 * It should be minimal when not being edited.
 * It enable adding a location for any axis tag, even axis tags we don't
 * know yet should be possible. We could use the axis registry for a
 * selection that maks sense.
 * I just think maybe this is eventually growing really complex and thus,
 * for the moment, it should be really simple.
 * Just an editor for a dict where the keys are axis tags and the values
 * are AxesMathAxisLocationModel ({logicalValue, numericValue})
 */
class UIAxesMathLocation extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_axes_math-location'}, 'loco-location')
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_axes_math-location-items'})
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        const widgets = [
            [ // TODO: this probably has to go
                {zone: 'local'}
              , []
              , StaticTag
              , 'label'
              , {}
              , [label]
            ]
          , [
                {zone: 'local'}
              , []
              , StaticNode
              , childrensMainZoneElement
            ]
          , [
                {zone: 'main'}
              , [
                    ['./axesLocations','data']
                ]
              , DynamicTag
              , 'em'
              , {}
              , (data)=> Array.from(data).reduce((accum,[k, v])=>{
                    const logiVal = v.get('logicalValue').value
                      , value = logiVal === 'number'
                            ? v.get('numericValue').value
                            : `¡${logiVal}!`
                      ;
                    accum.push(`${k}:${value}`)
                    return accum;
                },[]).join(', ')
            ]
        ];
        this._initWidgets(widgets);
    }
}

class UIAxesMathListItems extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, childrenSettings) {
        super(widgetBus, zones);
        this._childrenSettings = childrenSettings;
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        const item = this.getEntry(rootPath)
          , typeKey = item.get('axesMathItemTypeKey').value
          , typeModel = item.get('axesMathItemTypeModel')
          , typeLabel = typeModel.get('label').value
          // , typeClass = typeModel.get('typeClass').value
          ;

        let Constructor
          , args = []
          , dependencyMappings = [/* TODO */]
          ;
        switch (typeKey) {
            case 'PlusList':
            case 'TimesList':
                // Maybe we'll have separate constructors that both extend UIAxesMathList
                Constructor = UIAxesMathList;
                args = [this._zones, typeLabel];
                break;
            case 'Location':
                Constructor = UIAxesMathLocation;
                args = [this._zones, typeLabel];
                break;
            default:
                throw new Error(`UNKOWN TYPE ${typeKey} in ${this}`);
        }

        const settings = Object.assign(
            {}
          , this._childrenSettings
          , {
                rootPath
              , relativeRootPath: Path.fromParts('.', 'instance')
            }
        );

        return [settings, dependencyMappings, Constructor, ...args];
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getWidgetSetup(rootPath)
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class UIAxesMathList extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_axes_math-list'})
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_axes_math-list-items'})
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        // temproary to print the type of the list
        // it is thinkable that we change the type of the list
        // but keep the items, however, it probably shoot not happen
        // in the root list, so if the parent of this list is not a
        // AxesMathItemModel with an "instance" key, we shouldn't do it.
        const me = widgetBus.getEntry(widgetBus.rootPath) // e.g. AxesMathPlusListModel
              // CAUTION me is a DynamicAxesMathItemModel unless it's the root PlusList
              // TimesList or Pluslist hasWrapped is only false in the root PlusList
            , typeKey = AXES_MATH_ITEM_TYPE_TO_KEY.get(me.hasWrapped && me.wrapped.constructor || me.constructor)
            ;

        const widgets = [
            [ // TODO: this probably has to go
                {zone: 'local'}
              , []
              , StaticTag
              , 'label'
              , {}
              , [label,  `Type ${me} a ${typeKey} in ${this} @ ${widgetBus.rootPath}`]
            ]
          , [
                {zone: 'local'}
              , []
              , StaticNode
              , childrensMainZoneElement
            ]
            // TODO: actually, if this is a TimesList, we may wan't to have
            // a specaialized view on the collection.
            //
            // For a PlusList, each Location will create a keyMoment
            // but for a TimesList Locations are handled differently.
            // In fact, consecutive locations should be summarized, maybe
            // given also an estimate, how many result locations there will
            // be.
            // Lists within the items will be shown as their default list
            // representation though
            // This requires a very specialized implementation...
          , [
                {}
              , [
                    ['./items', 'collection']
                ]
              , UIAxesMathListItems
              , zones
                // children settings
              , {zone: 'main'}
            ]
        ];
        this._initWidgets(widgets);
    }
}

/**
 * This may be eventually have some similarity to UIVideoproofArrayLayers
 * as it will also likely have some drag-drop based interface.
 */
class UIAxesMath extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_axes_math'})
          , zones = new Map([..._zones, ['main', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        const widgets = [
            [
                {zone: 'main'}
              , []
              , StaticTag
              , 'label'
              , {}
              , [label, `hello ${this} @ ${widgetBus.rootPath}.`]
            ]
            // * a list of presets or choose custom, see below
            //   the default is likely opsz x width x weight
            //
            //   Custom editing
            // * something to chose elements to instantiate from
            // * the actual current setup, if not editing, this should maybe
            //   have a short descriptive form. Similar to the colorChooser
          , [
                {
                    zone: 'main'
                  , rootPath: widgetBus.rootPath.append('axesMath')
                }
              , []
              , UIAxesMathList
              , zones
              , 'root list'
            ]
            // * Like UIManualAxisLocations, to choose a custom location
            //   for the Axes that are not defined by the axesMath results
        ];
        this._initWidgets(widgets);
    }
}

const VideoproofArrayV2Model = _BaseLayoutModel.createClass(
        'VideoproofArrayV2Model'
      , ...timeControlModelMixin
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableColorTypes'
                      , AvailableColorTypesModel
                      , availableColorTypes
                      )
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableAxesMathItemTypes'
                      , AvailableAxesMathItemTypesModel
                      , availableAxesMathItemTypes
                      )
        // As an entry point, the AxesMathPlusListModel can handle
        // all the other items and it doesnt't alter them, it also
        // enables an UI that doesn't has to be special compared
        // to a deeper nested version.
        // However, we'll want to refine the axis math framing conditions
        // such as a way of setting defaults in a post-calculation way
        // so eventually there'll be another struct containing this.
        // ALSO: a CoherenceFunction should take care that if this is
        // empty, a default value should be set, that creates a list of
        // key moments. Having an indeed empty list could be achieved by
        // putting an empty list into this.
      , ['axesMath', AxesMathPlusListModel]
      , CoherenceFunction.create(
            ['axesMath']
          , function initAxesMath({axesMath}) {
            // Not sure about this, mabe there can be a default
            const items = axesMath.get('items');
            if(items.size === 0) {
                console.log('VideoproofArrayV2ActorModel axesMath is empty. adding some content');
                const timesListItem = createAxesMathItem('TimesList', items.dependencies)
                  , timesList = getEntry(timesListItem, './instance/items')
                  ;
                for(const axisTag of ['opsz', 'wdth', 'wght']) {
                    for(const locationLogivalValueName of ['default', 'min', 'max']) {
                        const location = createAxesMathItem('Location', items.dependencies)
                          , axisLocationValue = AxesMathAxisLocationModel.createPrimalDraft(location.dependencies)
                          ;
                        axisLocationValue.get('logicalValue').value = locationLogivalValueName;
                        // single locations items:
                        //      {'opsz': 'default'}
                        //      {'opsz': 'min'}
                        //      {'opsz': 'max'}
                        //      {'wdth': 'default'}
                        //      {'wdth': 'min'}
                        //      {'wdth': 'max'}
                        //      {'wght': 'default'}
                        //      {'wght': 'min'}
                        //      {'wght': 'max'}
                        //
                        // otherwise we could also have
                        //      {'opsz': 'default', 'wdth': 'default', 'wght': 'default'}
                        //      {'opsz': 'min', 'wdth': 'min', 'wght': 'min'}
                        //      {'opsz': 'max', 'wdth': 'max', 'wght': 'max'}
                        // but currently it's not possible to do and not planned:
                        //      {'opsz': 'default', 'opsz': 'min', 'opsz': 'max'}
                        //      {'wdth': 'default', 'wdth': 'min', 'wdth': 'max'}
                        //      {'wght': 'default', 'wght': 'min', 'wght': 'max'}
                        // However, the timeslist will ideally show a summary
                        // similar to the last entry, derrived from either
                        // the first or the seccond form:
                        //       opsz default, min, max
                        //     × wdth default, min, max
                        //     × wght default, min, max X
                        getEntry(location, './instance/axesLocations').set(axisTag, axisLocationValue);
                        timesList.push(location);
                    {
                    //const location = createAxesMathItem('Location', items.dependencies)
                    //      , axisLocationValue = AxesMathAxisLocationModel.createPrimalDraft(location.dependencies)
                    //      ;
                    axisLocationValue.get('logicalValue').value = 'number';
                    axisLocationValue.get('numericValue').value = 123;
                    getEntry(location, './instance/axesLocations').set(axisTag + 'xx', axisLocationValue);
                    // timesList.push(location);
                    }}
                }
                items.push(timesListItem);
            }
        })
      , ['videoproofArrayV2', VideoproofArrayV2ActorModel]
      , CoherenceFunction.create(
            ['videoproofArrayV2' , 'font', 'duration'/*, 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function initVideoproofArray({videoproofArrayV2: videoproofArray, font, duration}) {
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

            if(videoproofArray.get('localActiveFontKey').value !== font.value.fullName) {
                // Set font explicitly, to make the VideoproofArrayV2ActorModel
                // self contained when copied to stage-and-actors.
                // This creates a duplication of the information in
                // the global font key, but as explained, it's intended
                // as a feature: make a self-contained actor.
                videoproofArray.get('localActiveFontKey').set(font.value.fullName + 'hellooo');
            }

            if(needInitialKeymoment) {
                // This is initial. We'll always require a keyMoment  at 0
                const newKeyMoment = KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
                  , defaultCharGroup = KeyMomentModel.fields.get('charGroup').fields.get('options').Model.defaultValue
                  ;
                newKeyMoment.get('charGroup').get('options').set(defaultCharGroup);
                keyMoments.push(newKeyMoment);
                console.log('CoherenceFunction setDefaultsVideoproofArray videoproofArrayV2', videoproofArray, 'keyMoments', keyMoments);
            }

            if(needNewKeyMoments) {
                // TODO: we'll have to reset the KeyMoments here, to match
                // the new axis of the new font.
                console.log('CoherenceFunction setDefaultsVideoproofArray font changed'
                          , '\n>from', videoproofArray.dependencies.font.value.fullName
                          , `\n>to`, font.value.fullName
                            // TODO: do we need to define new dependencies for this, so it
                            // can trickle down ... ?
                            // It takes:  installedFonts, font, availableColorTypes
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
      , CoherenceFunction.create(
            ['videoproofArrayV2']
          , function initEmptyActiveActors({videoproofArrayV2}) {
            const activeActors = videoproofArrayV2.get('activeActors')
            //  , availableActorTypes = videoproofArrayV2.get('availableActorTypes')
              ;
            if(activeActors.size === 0) {
                console.log('VideoproofArrayV2Model initEmptyActiveActors activeActors is empty. adding VideoproofArrayV2CellActorModel');
                insertNewCellActorModel(activeActors);
            }
        })
    )
  ;

export class UIAlignment extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_alignment">
    <label class="radio-main-label">Cell-Alignment</label>
</div>`
    static TEMPLATE_OPTION = `<label class="ui_alignment-radio_label">
        <input name="alignment" type="radio">
        <span class="ui_alignment-radio_icon"></span></label>`
    //jshint ignore:end
    constructor(widgetBus, getDefault) {
        super(widgetBus);
        this._getDefault = getDefault;
        [this.element, this._inputs] = this._initTemplate();
    }

    _initTemplate() {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , inputs = new Map()
          ;
        for(const [align, labelText] of [
                        ['left', 'Left']
                      , ['center', 'Center']
                      , ['right', 'Right']
                    ]) {
            const elem = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE_OPTION).firstElementChild
              , input = elem.querySelector('input')
              ;
            elem.append(labelText);
            input.classList.add(`ui_alignment-${align}`);
            input.addEventListener('change', this._changeStateHandler.bind(this, align));
            inputs.set(align, input);
            container.append(elem);
        }
        this._insertElement(container);
        return [container, inputs];
    }

    _changeStateHandler(align/*, event*/) {
        this._changeState(()=>this.getEntry('value').value = align);
    }

    update(changedMap) {
        if(changedMap.has('value')) {
            const alignModel = changedMap.get('value')
              , align = alignModel.isEmpty
                    ? this._getDefault()
                    : alignModel.value
                    ;
            for(const [key, input] of this._inputs)
                input.checked = key === align;
        }
    }
}


function _extractFirstKeyMomentTextColorHueValues(activeActors) {
    const firstKeyMomentTextColorPath = Path.fromParts('.', 'instance', 'keyMoments', '0', 'textColor', 'instance')
     , hueValues = []
     ;
    for(const [/*key*/, actor] of activeActors) {
        const readOnlyActor = unwrapPotentialWriteProxy(actor)
          , firstKeyMomentTextColor = getEntry(readOnlyActor, firstKeyMomentTextColorPath)
          ;
        if(!firstKeyMomentTextColor.hasWrapped)
            // ignore: has no value
            continue;
        const culoriColor = colorToCulori(firstKeyMomentTextColor)
            // just in case it's a different mode
          , culoriColorOKLCH = culoriConverter('oklch')(culoriColor)
          ;

          hueValues.push(culoriColorOKLCH.h);
    }
    return hueValues;
}

/**
 * This is an algorith to find hue values for comparison layer colors.
 * It is set up to produce a bluish value then a pinkish value then more
 * colors with a similar distance (HUE_STRIDE), unless the available
 * gaps between the hues get to small for the stride size, then the center
 * of the first biggest gap is used.
 *
 * The color progression if layer colors are changed or if existing layers
 * are deleted is dynamic, but the hue distance between colors should always
 * be good. More than three layers for the intended font comparison use case
 * seems extreme though.
 *
 * only looks at each actors KeyMoments[0] textColor
 */
function _getNextHueValueTurns(...hueValues) {
    // 0.55: blue <= INITIAL_HUE, HUE_STRIDE 2/5, HUE_STRIDE_MIN_GAP_SIZE 0.55
    // 0.95: pink
    // 0.35: green
    // Then centering strategy between gaps:
    // 0.1499: orange
    // 0.3999: darker blue/violet
    // 0.05: strong pink
    // 0.45: turquoise
    // 0.25: yellow
    const INITIAL_HUE = 0.55 // .55
       // geting started with something smaller than 0.5
     , HUE_STRIDE = 2/5
       // the next value will be + HUE_STRIDE if there's a
       // gap with at least HUE_STRIDE_MIN_GAP_SIZE, this is to
       // ensure the distnce to the next value is "big enough" when
       // HUE_STRIDE is applied. Otherwise, gaps will be filled using the
       // center position,
     , HUE_STRIDE_MIN_GAP_SIZE = HUE_STRIDE + HUE_STRIDE * 0.5 - 0.05
     ;
    // console.log('RAW hueValues:', ... hueValues);
    if(hueValues.length === 0)
        return INITIAL_HUE;

    // rotate to start at firstValue
    const firstValue = hueValues[0]; // before sort
        // We're only trying to find the first biggest gap, duplicates
        // could be filtered, but if the gap is 0 there's somewhere a
        // bigger gap anyways.
    hueValues.sort();// ==> ascending
    // console.log('hueValues sorted', ...hueValues);
    const start = hueValues.indexOf(firstValue);
    // Rotate so that we start looking at the first gap in order,
    // the other gaps are not ordered anymore.
    hueValues.splice(0, Infinity, ...hueValues.slice(start), ...hueValues.slice(0, start));

    // console.log('hueValues rotated', ...hueValues);
    const biggestGap = [];
    for(const [i, val] of hueValues.entries()) {
        const nextI = hueValues.length > i+1
                    ? i + 1
                    : 0
          , nextValRaw = hueValues.at(nextI)
          // , nextVal = nextValRaw < val
          //       ? nextValRaw + 1
          //       : nextValRaw
          , gapRaw = nextValRaw - val
          , gap = gapRaw < 0 ? gapRaw + 1 : gapRaw
          ;
        // console.log(`hueValues i: ${i}, val: ${val}, nextI: ${nextI}, nextValRaw: ${nextValRaw}, gap: ${gap}`);
        if(biggestGap.length === 0 || biggestGap[1] < gap)
            biggestGap.splice(0, Infinity, i, gap === 0 ? 1 : gap);
    }
    // console.log('biggestGap', ...biggestGap);

    const [i, gap] = biggestGap
    , nextHueDistance = (gap >= HUE_STRIDE_MIN_GAP_SIZE)
        ? HUE_STRIDE
        : gap * 0.5 // center strategy
    , newHue = (hueValues[i] + nextHueDistance) % 1
    ;
    // console.log('newHue', newHue, 'strategy:', (gap >= HUE_STRIDE_MIN_GAP_SIZE) ? 'HUE_STRIDE' : 'CENTER');
    return newHue;
}

function getNextHueValueTurns(activeActors) {
    const hueValues = _extractFirstKeyMomentTextColorHueValues(activeActors);
    return _getNextHueValueTurns(...hueValues.map(deg=>deg/360));
}

// Algorithm for hue spacing.
function getNextHueValueDeg(activeActors) {
    const nextHueInTurns = getNextHueValueTurns(activeActors);
    return nextHueInTurns * 360;
}

function createCellActorModel(activeActors, setColor=true) {
    const cellActorModel = createActor('VideoproofArrayV2CellActorModel', activeActors.dependencies)
        // create keyframe [0] as it is used as the base for per layer
        // custom properties.
      //, cellActorModelInstance = cellActorModel.get('instance')
      //, keyMoments = cellActorModelInstance.get('keyMoments')
      , keyMoments = getDraftEntry(cellActorModel, 'instance/keyMoments')
      , KeyMomentModel = keyMoments.constructor.Model
      , newKeyMoment = KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
      ;
    if(setColor) {
        // set textColor to newKeyMoment ...
        // Get all colors from the first keyMoments in activeActors
        // and set the color evenly spaced, by an algortihm.
        const culorijsColor = {
                mode: 'oklch'
              , l: .7   // 1=== full
              , c: 0.4 // 0.4 === full
              , h: getNextHueValueDeg(activeActors) // 360 === full
              , alpha: .6
          }
          , color = culoriToColor(culorijsColor, newKeyMoment.dependencies)
          ;
        newKeyMoment.set('textColor', color);
    }
    keyMoments.push(newKeyMoment);
    return cellActorModel;
}

/**
 * There's a UX twist:
 * The first cellActorModel will not have a color set, so it's the default
 * color, which is black.
 * The second cellActorModel will cause the color of the first cellActorModel
 * be set, if it is not set explicitly yet. This will cause some confusion
 * but hopefully will overall create satisfactory results.
 * The behavior is:
 *      one layer: black
 *      two layers: blue, pink
 * It may be nice, to remove the blue(?) again, once there's only one layer
 * left, however, the heuristic is hard to generalize. It may not be blue.
 * It also is explicitly set, so it may be meant to stay explicitly.
 */
function insertNewCellActorModel/*AndManageTextColor*/(activeActors) {
    if(activeActors.size === 1) {
        const firstKeyMoment = getDraftEntry(activeActors, './0/instance/keyMoments/0')
          , firstKeyMomentTexColor = getEntry(firstKeyMoment, './textColor/instance')
          ;
        // if the textColor of the first actor, first keyMoment, is not set
        if(!firstKeyMomentTexColor.hasWrapped) {
            const cellActorModel = createCellActorModel(activeActors, true)
               , textColor = getEntry(cellActorModel, './instance/keyMoments/0/textColor')
               ;
            firstKeyMoment.set('textColor', textColor);
        }
    }
    const setColor = activeActors.size > 0 // set no color for initial actor
      , cellActorModel = createCellActorModel(activeActors, setColor)
      ;
    activeActors.push(cellActorModel);
}

class VideoproofArrayV2Controller extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        const generalControlsContainer = widgetBus.domTool.createElement('fieldset')
          , zones = new Map([..._zones, ['general', generalControlsContainer]])
          ;
        super(widgetBus, zones);
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('animationProperties@'));
        // original: this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // old: const animationPropertiesKey = widgetBus.rootPath.append('videoproofArrayV2').toString()
        const animationPropertiesRelativePath = Path.fromParts('.','videoproofArrayV2')
          , animationPropertiesPath = this.widgetBus.rootPath.append(...animationPropertiesRelativePath)
            // This is not used via dependencyMapping, hence the path must be relative...
            // FIXME: This is a very good example having to track the paths
            // however, it can only be problematic in the stage-and-actors
            // case, as the layout, this example!!!, doesn't move the videoproofArrayV2
            // model around.
          , animationPropertiesKey = `animationProperties@${animationPropertiesPath}`
          , updateDefaultsDependencies = [
                [animationPropertiesKey, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          , propertyRoot = 'generic/charGroup/'
         ;

        this._animationPropertiesKey = animationPropertiesKey;
        // animationProperties@/activeState/videoproofArrayV2
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {
                    rootPath: animationPropertiesRelativePath
                }
              , [
                    ['../t', 'globalT'], 'keyMoments', 'isLoop'
                ]
              , ContainerMeta
              , zones
              , initAnimanion
              , isInheritingPropertyFn
            ]
          , ...Object.entries(getBasicPlayerControlWidgets({zone: 'before-layout'}))
                                    .filter(([k,/*v*/])=>k!=='isLoop').map(([/*k*/,v])=>v)
          , [
                {zone: 'main'}
              , [
                    't', 'playing'
                ]
              , UITimeControlCircle
            ]
          , getActorWidgetSetup({
                typeKey: 'VideoproofArrayV2' // ?
              , typeLabel: 'Videoproof Array V2' // ?
              , typeClass: VideoproofArrayV2ActorModel
                // Same as for the previous VideoproofArray, i.e. looking at the same data.
              , widgetRootPath: widgetBus.rootPath.append('videoproofArrayV2')
              , zones: new Map([...zones, ['layer', zones.get('layout')]])
              , get layerBaseClass() {throw new Error('NOT IMPLEMENTED get layerBaseClass');}
              , getActorWidgetSetup() {throw new Error('NOT IMPLEMENTED getActorWidgetSetup');}
            })
          , [
                {
                    zone: 'main'
                  , rootPath: Path.fromParts('.', 'videoproofArrayV2', 'activeActors')
                }
              , []
              , UIVideoproofArrayLayers
              , zones
              , 'Family Comparison'
            ]
          , [
                // Doing it this way, we can eventually copy just the
                // videoproofArrayV2 model and by that inherit the whole
                // actor settings. Alternativeley, a parent element could
                // set the basic properties, and we'd have to copy these
                // properties and insert them correctly into the target.
                // This way, videoproofArrayV2 is self contained.
                {
                    zone: 'main'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0', 'charGroup')
                }
              , []
              , UICharGroupContainer
              , zones
                // FIXME: "injectable" => this must update paths as well!
              , {
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2771
                    updateDefaultsDependencies
                    // not implemented: _getArgumentConfig http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2775
                  , requireUpdateDefaults
                    // get: not implemented: UICharGroupContainer http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:2955
                    // use: not implemented:  _activateCustom http://localhost:8080/lib/js/components/layouts/stage-and-actors.mjs:3020
                    // Uncaught (in promise) Error: not implemented: get getDefaults(prefix:string:generic/charGroup, key:string:options, defaultVal:object:null)
                  , getDefaults: this._getDefaults.bind(this)
                }
              , propertyRoot
              , 'Glyphs'
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , generalControlsContainer
            ]
          , [
                {
                    zone: 'general'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0')
                }
              , [
                    ['cellAlignment', 'value']
                ]
              , UIAlignment
              , ()=>getRegisteredPropertySetup('generic/cellAlignment').default
            ]
          , [
                {
                    zone: 'general'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0', 'stageBackgroundColor')
                }
              , []
              , UIColorChooser
              , zones
              , 'Background Color'
                // argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
              , this._getDefaults.bind(this, 'colors/', 'stageBackgroundColor')
              , updateDefaultsDependencies
              , requireUpdateDefaults
            ]
          , [
                {
                    zone: 'general'
                  , rootPath: widgetBus.rootPath.append('videoproofArrayV2', 'keyMoments', '0')
                }
              , [
                    ['showCellBoxes', 'value']
                ]
              , UICheckboxOrEmptyInput
              , ()=>getRegisteredPropertySetup('generic/showCellBoxes').default
              , requireUpdateDefaults
              , 'show_cell_boxes'
              , 'Show Cell Boxes'
            ]
        //  , [
        //      {
        //          zone: 'main'
        //          // rootPath maybe don't alter rootPath now, as
        //          //  ['axesMath', AxesMathPlusListModel] is top level
        //          // in VideoproofArrayV2Model at the moment.
        //          // will perhaps move into a dedicated struct though
        //
        //      }
        //      , [
        //          // TODO:
        //          // ['videoproofArrayV2/keyMoments', 'keyMoments']
        //          // actually, font may not be that interesting, but
        //          // all the current videoproofArrayV2 layer fonts are
        //          // VideoproofArrayV2CellActorModel in  videoproofArrayV2/activeActors
        //          // ['videoproofArrayV2/activeActors', 'layers']
        //          //     => which properties do we need to look at despite
        //          //        of fonts? I don't think there's much.
        //          //        The fonts will lead to the keyMoments being
        //          //        updated.
        //          // , ['../font', 'font']
        //      ]
        //      , UIAxesMath
        //      , zones
        //      , 'Animation Editor - Rap Builder'
        //  ]
          , [
                {zone: 'main'}
              , [
                    ['videoproofArrayV2/keyMoments', 'keyMoments']
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
                    ['videoproofArrayV2/keyMoments', 'keyMoments']
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
    _getDefaults (prefix, key, defaultVal=_NOTDEF) {
        // This is similar to KeyMomentController._getDefaults
        // it should not be rewquried to always have to rewrite these.
        const fullKey = `${prefix}${key}`
          , liveProperties = this.getEntry(this._animationPropertiesKey)
          , activeKey = '0' // hard coded, here always the first key moment  //this.widgetBus.rootPath.parts.at(-1)
          , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
          ;

        if(fullKey.startsWith('colors/')) {
            const [color, ] = getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
            if(color !== null)
                return color;
            // If defaultVal === _NOTDEF and fullKey is not found
            // this will raise.
            const fallback = getRegisteredPropertySetup(fullKey, defaultVal === _NOTDEF
                    ? getRegisteredPropertySetup.NOTDEF
                    : defaultVal
                    );
            return fallback === defaultVal
                ? defaultVal
                : fallback.default
                ;
        }
        else if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);

        if(defaultVal !== _NOTDEF) {
            return defaultVal;
        }
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
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
    VideoproofArrayV2Model as Model
  , VideoproofArrayV2Controller as Controller
};
