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
//  , UITimeControlCircle
//   , UIActorTimeControlKeyMomentSelectCircle
//  , getBasicPlayerControlWidgets
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
//   , getExtendedChars
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
  , SelectAndDragByOptions
  , WasteBasketDropTarget
  , UITimeControl
  , collapsibleMixin
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

function* _cartesianProductGenSingleValueChanges([head, ...tail]) {
    if(!head) {
        yield [];
        return
    }
    const lastYield = []
     , firstYield = []
     ;
    for(let item of head) {
        for(let prod of cartesianProductGenSingleValueChanges(tail)) {
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
function* cartesianProductGenSingleValueChanges(items) {
    const firstYield = []
      , lastYield = []
      ;
    for(const result of _cartesianProductGenSingleValueChanges(items)) {
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

    // cartesianProductGenSingleValueChanges is experimental to test
    // how that behavior works out. It breaks e.g. the assumption that
    // there are no duplicate keyMoments. I'll rather not keep it around
    // but I want to commit it ince to history.
    const useOnlySingleValueChanges = false
      , gen = useOnlySingleValueChanges
            ? cartesianProductGenSingleValueChanges(axesMDM)
            : cartesianProductGen(axesMDM)
      , counter = new Map()
      ;
    let lastkey = null;
    for(let axesValues of gen) {
        const key = axesValues.join(';');
        if(!counter.has(key)) counter.set(key, 0);
        counter.set(key, counter.get(key)+1);

        if(lastkey === key) {
            // only occurs with cartesianProductGenSingleValueChanges
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
    static TEMPLATE = `<fieldset class="ui_key_moments_link_navigation">
<legend class="ui_key_moments_link_navigation-label"><!-- insert: label --></legend>
<ol class="ui_key_moments_link_navigation-list"></ol>
</fieldset>`;
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
        collapsibleMixin(element, 'legend');
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

    update(changedMap) {
        if(changedMap.has('keyMoments'))
            this._updateControlsList(changedMap.get('keyMoments'));

        if(changedMap.has('animationProperties@')) {
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
        collapsibleMixin(localZoneElement, 'legend');
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

export const AxesMathItemTypeModel = _AbstractGenericModel.createClass('AxesMathItemTypeModel')
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
  , AxesMathLocationsSumModel = _BaseAxesMathItemModel.createClass(
        'AxesMathLocationsSumModel'
      , ['items', AxesMathItemsModel]
        // options could include:
        //      - remove duplicates
    )
    /**
     * A location is a collection of [axis-tag, value]
     */
  , AxesMathAxisLogicalSymbolicLocationModel = _AbstractEnumModel.createClass('AxesMathAxisLogicalSymbolicLocationModel', ['default', 'min', 'max', 'number'], 'default')
  , AxesMathAxisLocationNumberModel = _AbstractNumberModel.createClass('AxesMathAxisLocationNumberModel', {defaultValue: 0/*, toFixedDigits: 5*/})
  , AxesMathAxisLocationNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(AxesMathAxisLocationNumberModel)
  , AxesMathAxisLocationValueModel = _AbstractStructModel.createClass(
        'AxesMathAxisLocationValueModel'
      , ['logicalValue', AxesMathAxisLogicalSymbolicLocationModel]
        // only if logicalValue is "number" otherwise empty, default 0
        // FIXME: requires a CoherenceFunction
      , ['numericValue', AxesMathAxisLocationNumberOrEmptyModel]
      , CoherenceFunction.create(
            ['logicalValue', 'numericValue']
          , function initAxesMath({logicalValue, numericValue}) {
                if(logicalValue.value === 'number') {
                    if(numericValue.isEmpty)
                        numericValue.value = numericValue.constructor.Model.defaultValue;
                }
                else
                    numericValue.clear();
            }
        )
    )
  , AxesMathAxisLocationsModel = _AbstractOrderedMapModel.createClass('AxesMathAxisLocationsModel', AxesMathAxisLocationValueModel)
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
  , AxesMathAxisLocationValuesModel = _AbstractListModel.createClass('AxesMathAxisLocationValuesModel', AxesMathAxisLocationValueModel)
    // An ordered map of axisTag: [list of LocationValue]. Not actually a set :-(
  , AxesMathLocationValuesMapModel = _AbstractOrderedMapModel.createClass('AxesMathLocationValuesMapModel', AxesMathAxisLocationValuesModel)
  /**
     * Multiplication
     *
     * - resolve all contained lists and location elemens into single location elements
     *   very much the same as AxesMathLocationsSumModel does.
     * - merge all items (axes) of the location elements into axis value lists/sets
     *   retaining the order of appearance of the axes
     * - return the n-fold cartesian product of all item-sets.
     */
  , AxesMathLocationsProductModel = _BaseAxesMathItemModel.createClass(
        'AxesMathLocationsProductModel'
      , ['axesLocationValuesMap', AxesMathLocationValuesMapModel]
        // options could include:
        //     - make sets of all items to reduce duplicates
        //     - how to handle empty lists in items => should that create
        //       an empty result, i.e. like 10 * 0 === 0
    )
  , [availableAxesMathItemTypes, AXES_MATH_ITEM_TYPE_TO_KEY] = (()=>{
        const axesMathItemTypes = [
                ['LocationsSum', 'Collection', AxesMathLocationsSumModel]
              , ['LocationsProduct', 'Product', AxesMathLocationsProductModel]
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

function* locationToLocationsGen(location) {
    yield Array.from(location.get('axesLocations'));
}

function* sumToLocationsGen(locationsSum) {
    for(const [/*key*/, item] of locationsSum.get('items')) {
        yield *toLocationsGen(item.get('instance').wrapped);
    }
}

function* productToLocationsGen(locationsProduct) {
    const map = locationsProduct.get('axesLocationValuesMap')
      , keys = []
      , valueLists = []
      ;
    for(const [axisTag, valueList] of map) {
        keys.push(axisTag);
        valueLists.push(valueList.value); // => Array only works if is not a draft!
    }
    for(const item of cartesianProductGen(valueLists))
        yield Array.from(zip(keys, item));
}

function* toLocationsGen(_item) {
    const item = _item.isDraft
              // This will cause that no proxies are created.
              // We need this read-only. I suspect this is faster and
              // maybe less complicated than working with proxies.
            ? _item.metamorphose()
            : unwrapPotentialWriteProxy(_item)
            ;
    const typeKey = AXES_MATH_ITEM_TYPE_TO_KEY.get(item.constructor);
    switch(typeKey) {
        case 'LocationsSum':
            yield *sumToLocationsGen(item);
            break;
        case 'LocationsProduct':
            yield *productToLocationsGen(item);
            break;
        case 'Location':
            yield *locationToLocationsGen(item);
            break;
        default:
            throw new Error(`NOT IMPLEMENTED toLocations for typeKey: "${typeKey}" item: ${item}.`);
    }
}
function _toAbsoluteLocations(axisRanges, symbolicLocations) {
    const absLocations = []
    for(const location of symbolicLocations) {
        const resultLocation = [];
        for(const [axisTag, locationValue] of location) {
            const resultAxis = [];
            if(!(axisTag in axisRanges))
                continue;
            resultAxis.push(axisTag);
            const axisRange = axisRanges[axisTag]
              , logiVal = locationValue.get('logicalValue').value
              ;
            if(logiVal === 'number') {
                const rawNumber = locationValue.get('numericValue').value
                  , clampedNumber = Math.min(axisRange.max, Math.max(axisRange.min, rawNumber))
                  ;
                resultAxis.push(clampedNumber);
            }
            else
                resultAxis.push(axisRange[logiVal]);
            resultLocation.push(resultAxis);
        }
        absLocations.push(resultLocation);
    }
    return absLocations;
}

function _toLabelsForSymbolicLocations(symbolicLocations) {
    const labels = []
    for(const location of symbolicLocations) {
        const resultLocation = [];
        for(const [axisTag, locationValue] of location) {
            const logiVal = locationValue.get('logicalValue').value
              , location = logiVal === 'number'
                    ? locationValue.get('numericValue').value
                    : logiVal
              ;
            resultLocation.push(`${axisTag}: ${location}`);
        }
        labels.push(resultLocation.join(', '));
    }
    return labels;
}

function _updateKeyMomentsAxesLocationsFromLocations(keyMoments, locationsIter, labels=[]) {
    const KeyMomentModel = keyMoments.constructor.Model
      , newKeyMoments = []
      ;
    let i=0;
    for(const locations of locationsIter) {
        const keyMoment = keyMoments.has(i)
                  // re-use, especially the first moment contains actor
                  // specific settings
                ? keyMoments.getDraftFor(i)
                : KeyMomentModel.createPrimalDraft(keyMoments.dependencies)
        //     get or create the new keyMoment
        //     set the label to the keymoment
        //     set the axes locations to the key moment
              // opsz 8, wdth 100, wght 400
          , label = labels.length > i
                ? labels[i]
                : locations.map(([axisTag, location])=>`${axisTag} ${location}`).join(', ')
          , axesLocations = keyMoment.getDraftFor('axesLocations')
          , labelModel = keyMoment.getDraftFor('label')
          ;
        labelModel.value = label;
        axesLocations.arraySplice(0, Infinity);
        for(const [axisTag, location] of locations)
            axesLocations.setSimpleValue(axisTag, location);
        newKeyMoments.push(keyMoment);
        i++;
    }
    keyMoments.splice(0, Infinity, ...newKeyMoments);
}
//function _updateKeyMomentsAxesLocationsFromLocations(keyMoments, locationsIter) {
// }
function applyAxesMathLocations(videoproofArray, axesMath, installedFonts
        , globalFont, duration) {
    const symbolicLocations = Array.from(toLocationsGen(axesMath))
      , absoluteLocationsPerFont = new Map()
      , _setFont = (map, font, symbolicLocations)=>{
            const absLocations = _toAbsoluteLocations(font.value.axisRanges, symbolicLocations);
            map.set(font, absLocations);
        }
      , resetLocations = [[]]// the inner array is essentially an empty first keyMoment
      , activeActors = videoproofArray.getDraftFor('activeActors')
      ;
    _setFont(absoluteLocationsPerFont, globalFont, symbolicLocations);
    for(const k of activeActors.ownKeys()) {
        const instance = getDraftEntry(activeActors, Path.fromParts(k, 'instance'))
          , localActiveFontKey = instance.get('localActiveFontKey').value
            // Seems like font may not always be loaded yet.
            // This is because the new dependencies are not propagated yet.
            // The font is already available in installedFonts
            // > instance.get('font');
            //    Uncaught (in promise) Error: KEY ERROR "from-file Roboto Flex Regular Version_3-000 gftools_0-9-32_" not found.
          , isLocalFont = localActiveFontKey !== ForeignKey.NULL
          , font = isLocalFont
                    ? installedFonts.get(localActiveFontKey)
                    : globalFont
          ;
        // always a loop, must be in sync with videoproofArray
        instance.get('isLoop').value = true;
        if(!absoluteLocationsPerFont.has(font))
            _setFont(absoluteLocationsPerFont, font, symbolicLocations);
        const absLocations = isLocalFont
                ? absoluteLocationsPerFont.get(font)
                : resetLocations // use inheritance from global font
          , keyMoments = instance.getDraftFor('keyMoments')
          ;
        _updateKeyMomentsAxesLocationsFromLocations(keyMoments, absLocations.length ? absLocations : resetLocations);
    }
    const absLocations = absoluteLocationsPerFont.get(globalFont)
      , keyMoments = videoproofArray.getDraftFor('keyMoments')
      , labels = _toLabelsForSymbolicLocations(symbolicLocations)
      ;
    _updateKeyMomentsAxesLocationsFromLocations(keyMoments, absLocations.length ? absLocations : resetLocations, labels);
    // TODO: add  "Per Keyframe Duration" setting
    duration.value = keyMoments.size * 2;
}

// END Axes Math


/*
 * Requires a dropdown, to choose the logical logicalValue from a select
 * or enter a number if logicalValue === 'number'
 * Then also a handle to re-order.
 */
class UIAxesMathLocationValue extends _BaseComponent {
    constructor(widgetBus, eventHandlers, draggable=false) {
        super(widgetBus);
        [this.element, this._selectLogicalValue, this._inputNumericValue
            , this._output, this._dragHandle] = this._initTemplate(eventHandlers, draggable);
    }

    // jshint ignore: start
    static TEMPLATE = `<div
        class="ui-axes_math-location_value"
        tabindex="0"
        ><!-- insert: drag-handle --><select
                class="ui-axes_math-location_value-logical_value"
                required
        ></select><input
                class="ui-axes_math-location_value-numeric_value"
                type="number"
                step="0.01"
                size="5"
        /><output
                class="ui-axes_math-location_value-output"
        >(UNINITIALIZED)</output></div>`;
    static DRAGHANDLE_TEMPLATE = '<span class="ui-axes_math-location_value-drag_handle drag_handle" draggable="true">✥</span>';
    // jshint ignore: end
    _initTemplate(eventHandlers, draggable) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , selectLogicalValue = element.querySelector('.ui-axes_math-location_value-logical_value')
            , inputNumericValue = element.querySelector('.ui-axes_math-location_value-numeric_value')
            , output = element.querySelector('.ui-axes_math-location_value-output')
            , valueType = this.getEntry('value').constructor
            , logicalValueType = valueType.fields.get('logicalValue')
            , numericValueType = valueType.fields.get('numericValue').Model // is OrEmpty!
            , options = []
            ;

        for(const item of logicalValueType.enumItems) {
            const option = this._domTool.createElement('option');
            option.value = item;
            option.label = item;
            options.push(option);
        }
        selectLogicalValue.append(...options);
        selectLogicalValue.value = logicalValueType.defaultValue;
        selectLogicalValue.addEventListener('change', this._changeStateHandler((/*event*/)=>{
            const logicalValue = this.getEntry('./logicalValue');
            logicalValue.value = this._selectLogicalValue.value;
        }));
        selectLogicalValue.addEventListener('blur', ()=>{
            const logicalValue = this.getEntry('./logicalValue')
            this._selectLogicalValue.value = logicalValue.value;
        });

        inputNumericValue.value = numericValueType.defaultValue;
        inputNumericValue.addEventListener('input', this._changeStateHandler((/*event*/)=>{
            const numericValue = this.getEntry('./numericValue')
              , numeric = parseFloat(this._inputNumericValue.value.trim())
              ;
            if(!isNaN(numeric))
                numericValue.value = numeric;
        }));
        inputNumericValue.addEventListener('blur', ()=>{
            const numericValue = this.getEntry('./numericValue')
            this._inputNumericValue.value = numericValue.isEmpty
                    ? numericValue.defaultValue
                    : numericValue.value;
        });

        let dragHandleElement = null;
        if(draggable) {
            dragHandleElement = this._domTool.createFragmentFromHTML(this.constructor.DRAGHANDLE_TEMPLATE).firstElementChild;
            this._domTool.insertAtMarkerComment(element, 'insert: drag-handle', dragHandleElement);
            for(const args of [
                          ['dragstart', this._dragstartHandler.bind(this)]
                        , ['dragend', this._dragendHandler.bind(this)]
                    ]) {
                dragHandleElement.addEventListener(...args);
            }
        }

        for(const args of eventHandlers)
            element.addEventListener(...args)
        this._insertElement(element);
        return [element, selectLogicalValue, inputNumericValue, output, dragHandleElement];
    }

    _dragstartHandler(event) {
        const path = this.widgetBus.rootPath;
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof axes-math location-value-path: ${path}]`);
        this.element.classList.add('dragging');
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
        event.dataTransfer.setDragImage(this.element, 0 , 0);

        // lose focus, otherwise it will jump to the next element after
        // the successful drop.
        if(this.element.matches(':focus-within'))
            this._domTool.document.activeElement.blur();
    }
    _dragendHandler(/*event*/) {
        this.element.classList.remove('dragging');
    }

    update(changedMap) {
        if(changedMap.has('value')) {
            const value = changedMap.get('value')
              , logiVal = value.get('logicalValue').value
              ;
            if(this._selectLogicalValue !== this._domTool.document.activeElement)
                this._selectLogicalValue.value = logiVal;
            if(logiVal === 'number') {
                const numericValue = value.get('numericValue').value;
                if(this._inputNumericValue !== this._domTool.document.activeElement) {
                    this._inputNumericValue.style.display = '';
                    this._inputNumericValue.value = numericValue;
                }
                this._output.textContent = numericValue;
            }
            else {
                this._inputNumericValue.style.display = 'none';
                this._inputNumericValue.value = 0;
                this._output.textContent = logiVal;
            }
        }
    }
}


/**
 * List of AxisLocationValue components.
 */
class UIAxesMathLocationValues extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, _zones) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui-axes_math-location_values'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);
        this._localZoneElement = localZoneElement;


        const wrapChildrenContainerHandler = fn=>{
            return event=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('collection'))
                  , collection = this.getEntry(rootPath)
                  ;
                if(collection.size !== 0)
                    // only if empty
                    return;
                const dropTargetItem = {rootPath, isEmptyLayerContainer: true};
                return fn.call(this, dropTargetItem, event);
            }
        }
        for(const args of [
                    ['dragenter', wrapChildrenContainerHandler(this._dragenterHandler)]
                  , ['dragover', wrapChildrenContainerHandler(this._dragoverHandler)]
                  , ['dragleave', this._dragleaveHandler.bind(this)]
                  , ['drop', wrapChildrenContainerHandler(this._dropHandler)]
                ]) {
            localZoneElement.addEventListener(...args);
        }


    }

    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath
              , zone: 'local'
            }
          , dependencyMappings = [
                ['./', 'value']
            ]
          , Constructor = UIAxesMathLocationValue
          , draggable = true
          , dropTargetItem = {rootPath}
          , dropEventHandlers = [
                ['dragenter', this._dragenterHandler.bind(this, dropTargetItem)]
              , ['dragover', this._dragoverHandler.bind(this, dropTargetItem)]
              , ['dragleave', this._dragleaveHandler.bind(this)]
              , ['drop', this._dropHandler.bind(this, dropTargetItem)]
            ]
          , args = [dropEventHandlers, draggable]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                               , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE];
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

    // Vertical version, otherise just like the horizontal implementation
    _getDropTargetInsertPosition(dropTargetItem, event) {
        if(dropTargetItem.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {width, left} = event.currentTarget.getBoundingClientRect()
          , {clientX} = event
          , elementX = clientX - left
          , relativeX = elementX/width
          , testPosition = dropTargetItem.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeX < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of [this._localZoneElement, ...this._localZoneElement.querySelectorAll(`:scope > .${markedClass}`)]) {
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

        const [elem, posClassSuffix] = [element, insertPosition];
        //insertPosition === 'before' && element.previousSibling
        //        ? [element.previousSibling, 'after']
        //        : [element, insertPosition]
        //        ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dragoverHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
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
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);

        const data = event.dataTransfer.getData(type)
          , {rootPath: targetPath} = dropTargetItem
          , insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event)
          ;
        if(type === DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH) {
            const sourcePathString = data
              , sourcePath = Path.fromString(sourcePathString)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE) {
            const value = data
            this._create(targetPath, insertPosition, value);
        }
        else {
            console.error(`NOT IMPLEMENTED ${this}._dropHandler type: "${type}"`);
        }
    }

    _create(targetPath, insertPosition, value) {
        return this._changeState(()=>{
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , newItem = items.constructor.Model.createPrimalDraft(items.dependencies)
              ;
            // Not required if "default" is the value as that is the default already.
            setAxisLocationValue(newItem, value);
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                items.push(newItem);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              ;
            let insertIndex;
            if(insertPosition === 'after')
                insertIndex = targetIndex + 1;
            else if(insertPosition === 'before')
                insertIndex = targetIndex;
            else
                throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            items.splice(insertIndex, 0, newItem);
        });
    }

    // TODO: this is a very good reusable method, so reuse!
    _move(sourcePath, targetPath, insertPosition) {
        const canMove = !sourcePath.isRootOf(targetPath);
        if(!canMove) {
            console.warn(`${this}._move can't move source into target as `
                    +`source path "${sourcePath}" is root of target path "${targetPath}".`);
            return;
        }
        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                items.push(source);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;

            if(items === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                items.splice(insertIndex, 0, source);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                items.splice(targetIndex + 1, 0, source);
            else if(insertPosition === 'before')
                items.splice(targetIndex, 0, source);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }
}

/**
 * Interesting this may be the first real dictionary editing that
 * includes an interface and rules to change the keys.
 *
 * Editing a key while keeping the widget will be the
 * most challenging aspect.
 *
 * I'm not sure if a widget should be like a key/value pair, where
 * both inputs are located, or rather if this widget should manage
 * all the keys, so that direct central control and rules are possible.
 *
 * Changing a key will technically be like changing a [key, value] slot,
 * keeping the position and keeping the value.
 *     index = axesLocationValuesMap.indexOfKey(key)
 *     value = axesLocationValuesMap.get(key)
 *     axesLocationValuesMap.splice(index, 1, [newKey, value]);
 * Key Validation will be added to _AbstractOrderedMapModel
 * whether the key is valid relative to e.g. the location of the instance
 * can't be done there, but formal rules, like: not empty, same format
 * as axisTags is possible.
 */

 /**
 * From the spec:
 *       Like other OpenType tags, axis tags are four unsigned bytes that
 *       can equivalently be interpreted as a string of four ASCII characters.
 *       Axis tags must begin with a letter (0x41 to 0x5A, 0x61 to 0x7A)
 *       and must use only letters, digits (0x30 to 0x39) or space (0x20).
 *       Space characters must only occur as trailing characters in tags
 *       that have fewer than four letters or digits.
 *
 * The trailing spaces won't be allowed in here! It'll be simpler for
 * input handling (tag.trim()). Instead length can be between 1 and 4
 */
function validateOpenTypeTagString(tag) {
    if(typeof tag !== 'string')
        return [false, `Tag must be string but is typeof ${typeof tag}.`];
    if(tag.length < 1 || tag.length > 4)
        return [false, `Tag must be 1 to 4 chars long but tag.length is ${tag.length}. Tag: "${tag}".`];

    // 0 to 9 ==== 0x30 to 0x39
    // A to Z === 0x41 to 0x5A
    // a to z === 0x61 to 0x7A

    // I could use RegEx, but this is simple and this way there are
    // short and very clear error messages.
    const currentCharCode = tag.charCodeAt(0);
    if(currentCharCode < 0x41
            || currentCharCode > 0x5A && currentCharCode < 0x61
            || currentCharCode > 0x7A)
        return [false, `Tag first char must be A-Z or a-z but is "${tag[0]}" `
                     + `(0x${currentCharCode.toString(16)}). Tag: "${tag}".`];

    for(let i=1;i<tag.length;i++) {
        const currentCharCode = tag.charCodeAt(i);
        if(currentCharCode < 0x30
                || currentCharCode > 0x39 && currentCharCode < 0x41
                || currentCharCode > 0x5A && currentCharCode < 0x61
                || currentCharCode > 0x7A)
            return [false, `Tag char at ${i} must be A-Z, a-z or 0-9 but is "${tag[i]}" `
                     + `(0x${currentCharCode.toString(16)}). Tag: "${tag}".`];
    }
    return [true, null];
}

// TODO:
// For quicker input of tags there's <datalist>, which can contain all
// known axis tags as <option>s. e.g. spec + google axis registry + maybe
// anything in loaded fonts. however, that datalist is linked to the
// input using the id-attribute and hence we need to manage it centrally.
//
// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/datalist
//
// The order of the datalist is used by the browser, so we can define
// more common tags at the top. Then, when typing the list is filtered.
// IMO a very good interface for rather little effort.
// <optgroup> is not available though.

class _UIBaseAxesMathAxisTag extends _BaseComponent {
    constructor(widgetBus, eventHandlers) {
        super(widgetBus);
        [this.element, this._input] = this._initTemplate(eventHandlers);
        this._lastValue = null;
        this.reset();
    }
    // jshint ignore: start
    static TEMPLATE = `<div
        class="ui_axes_math-axis_tag"
        ><input
            type="text"
            minlength="1"
            maxlength="4"
            size="4"
            pattern="[A-Za-z]{1}[A-Za-z0-9]{0,3}"
            class="ui_axes_math-axis_tag-input" /></div>`;
    // jshint ignore: end
    _initTemplate(eventHandlers) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , input = element.querySelector('.ui_axes_math-axis_tag-input')
            ;
        for(const [event, fn, ...args] of eventHandlers)
            input.addEventListener(event, fn, ...args);
        this._insertElement(element);
        return [element, input];
    }

    isFocused() {
        return this._input === this._domTool.document.activeElement;
    }

    setCustomValidity(message="") {
        this._input.setCustomValidity(message);
        this._input.reportValidity();
    }

    reset() {
        this._input.value = '';
        this._input.setCustomValidity('');
    }

    get value() {
        return this._input.value;
    }
}

class _BaseUIButton extends _BaseComponent {
    static ROOT_CLASS = 'ui-button';
    /* required: static TYPE_CLASS_PART = 'ui-button';*/
    constructor(widgetBus, label, eventHandlers) {
        super(widgetBus);
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                }
        });
        [this.element, this._input] = this._initTemplate(label, eventHandlers);

    }
    // jshint ignore: start
    static TEMPLATE = `<button><!-- insert: label --></button>`;
    // jshint ignore: end

    _setClassesHelper(requireClasses) {
        for(const baseClass of [this.constructor.ROOT_CLASS, this.BASE_CLASS]) {
            for(const [element, ...classParts] of requireClasses)
                element.classList.add([baseClass, ...classParts].join('-'));
        }
    }

    _initTemplate(label, eventHandlers) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , input = element
            ;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);
        this._setClassesHelper([
            [element]
          , [input, 'input']
        ]);

        for(const [event, fn, ...args] of eventHandlers)
            input.addEventListener(event, fn, ...args);

        this._insertElement(element);
        return [element, input];
    }

    set passive(val) {
         this._input.disabled = !!val;
    }

    get passive() {
        return !!this._input.disabled;
    }
}

class UIAxesMathAxisTagCreate extends _UIBaseAxesMathAxisTag {
    setCustomValidity(message="") {
        this._input.setCustomValidity(message);
        this._input.reportValidity();
    }
}
class UIAxesMathAxisTagAddButton extends _BaseUIButton{
    static TYPE_CLASS_PART = 'add_button';
}

class UIAxesMathAxisTag extends _UIBaseAxesMathAxisTag {
    constructor(widgetBus, eventHandlers) {
        super(widgetBus, eventHandlers);
        this._lastValue = null;
    }
    _initTemplate(eventHandlers) {
        const  [element, input] = super._initTemplate(eventHandlers);
        // When we lose focus we reveal the actual value, which ideally
        // is the same, but the editing value could be not accepted.
        input.addEventListener('blur', ()=>{
            this._input.value = this._lastValue
        });
        return  [element, input];
    }
    update(changedMap) {
        if(changedMap.has('key@')) {
            // key@.value is just a string
            // Don't update if we're currently editing! It will
            // change the cursor and be disturbing.
            if(this._input !== this._domTool.document.activeElement)
                this._input.value = changedMap.get('key@').value;
            // this way we can differentiate between the current value
            // of the input element and the offical last key/tag, which
            // will be usefult to decide whether to keep the element around.
            this._lastValue = changedMap.get('key@').value;

        }
    }
}

class _BaseUIAxesMap extends _BaseDynamicCollectionContainerComponent {
    // jshint ignore: start
    static ROOT_CLASS = `ui_axes_math-map`
    // Don't do anyting.
    static ORDER_STRATEGY_NATURAL = Symbol('ORDER_STRATEGY_NATURAL');
    // Display alphabetic order
    static ORDER_STRATEGY_ALPHA = Symbol('ORDER_STRATEGY_ALPHA');

    // jshint ignore: end
    constructor(widgetBus, _zones, eventHandlers, label, dragAndDrop=false) {
        const labelElement = widgetBus.domTool.createElement('span', {}, label)
          , dragHandleElement = widgetBus.domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, '✥')
            // , deleteButton ??? maybe we can just use the trash/drag-and-drop for the top level items
            // How to add the new tag? drag and drop? plus "+" button to appen (I like this,
            // it can blur when tag is invalid!
          , toolsElement = widgetBus.domTool.createElement('div', {'class':'tools'})
          , childrensMainZoneElement = widgetBus.domTool.createElement('div')
          , localZoneElement = widgetBus.domTool.createElement('div', {'tabindex':'0'} ,[dragHandleElement, labelElement, toolsElement, childrensMainZoneElement])
          , zones = new Map([..._zones, ['local', localZoneElement], ['tools', toolsElement], ['main', childrensMainZoneElement]])
          ;

        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('key@', {treatAdressAsRootPath: false}));
        super(widgetBus, zones);

        const orderStrategy = dragAndDrop
                  // Can't allow anything else, as it doesn't much make
                  // sense in this case, where the order is determined
                  // by dragAndDrop UI.
                ? _BaseUIAxesMap.ORDER_STRATEGY_NATURAL
                : this.constructor.ORDER_STRATEGY || _BaseUIAxesMap.ORDER_STRATEGY_NATURAL
                ;
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                }
              , ORDER_STRATEGY: {
                    value: orderStrategy
                }
              , DRAG_AND_DROP: {
                    value: !!dragAndDrop
                }
        });

        this._setClassesHelper([
                [localZoneElement]
              , [labelElement, 'label']
              , [dragHandleElement, 'drag_handle']
              , [toolsElement, 'tools']
              , [childrensMainZoneElement, 'items']
        ]);

        for(const args of [
                    ['dragstart', this._dragstartHandler.bind(this)]
                  , ['dragend', this._dragendHandler.bind(this)]
                ]) {
            dragHandleElement.addEventListener(...args);
        }
        for(const args of eventHandlers)
            localZoneElement.addEventListener(...args);

        const wrapChildrenContainerHandler = fn=>{
            return event=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('axesLocationMap'))
                  , collection = this.getEntry(rootPath)
                  ;
                if(collection.size !== 0)
                    // only if empty
                    return;
                const dropTargetItem = {rootPath, isEmptyLayerContainer: true};
                return fn.call(this, dropTargetItem, event);
            }
        }
        for(const args of [
                    ['dragenter', wrapChildrenContainerHandler(this._dragenterHandler)]
                  , ['dragover', wrapChildrenContainerHandler(this._dragoverHandler)]
                  , ['dragleave', this._dragleaveHandler.bind(this)]
                  , ['drop', wrapChildrenContainerHandler(this._dropHandler)]
                ]) {
            childrensMainZoneElement.addEventListener(...args);
        }

        this.widgetBus.insertElement(localZoneElement);
        this.element = localZoneElement;
        this._locationSetWidgets = new Map();
        this._keySlots = [];
        this._postponedKeyIdOrder = null;
        {
            const widgets = [
                [
                    {   zone: 'tools'
                      , id: 'tag-create-input'
                    }
                  , []
                  , UIAxesMathAxisTagCreate
                  , [
                        ['input', this._tagCreateInputHandler.bind(this)]
                      , ['keyup', event=>{if (event.key === 'Enter') {this._tagCreateSubmitHandler(event)}}]
                    ]
                ]
              , [
                    {   zone: 'tools'
                      , id: 'tag-add-button'
                    }
                  , []
                  , UIAxesMathAxisTagAddButton
                  , 'add tag'
                  , [
                        ['click', this._tagCreateSubmitHandler.bind(this)]
                    ]
                ]
            ];
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets);
        }
    }

    _tagCreateInputHandler(/*event*/) { // on input
        // if tag is invalid: set tag-add-button passive else set active
        // TODO: also tap into the validation state of the field
        // passive
        const addButton = this.getWidgetById('tag-add-button')
          , inputWidget = this.getWidgetById('tag-create-input')
          , tag = inputWidget.value.trim()
          , [valid, message] = validateOpenTypeTagString(tag)
          ;
        if(!valid) {
            addButton.passive = true;
            inputWidget.setCustomValidity(message);
            return;
        }
        const axesLocationMap = this.getEntry('axesLocationMap');
        if(axesLocationMap.has(tag)) {
            addButton.passive = true;
            // set validation to false
            inputWidget.setCustomValidity(`Axis-tag "${tag}" already exists.`);
            return;
        }
        // set  validation to good...
        addButton.passive = false;
        inputWidget.setCustomValidity("");
    }

    async _tagCreateSubmitHandler(event) {
        event.preventDefault();
        const addButton = this.getWidgetById('tag-add-button')
          , inputWidget = this.getWidgetById('tag-create-input')
          , tag = inputWidget.value.trim()
          , [valid, message] = validateOpenTypeTagString(tag)
          ;
        if(!valid) {
            addButton.passive = true;
            inputWidget.setCustomValidity(message);
            return;
        }
        return await this._changeState(()=>{
            const axesLocationMap = this.getEntry('axesLocationMap');
            if(axesLocationMap.has(tag)) {
                inputWidget.setCustomValidity(`Axis-tag "${tag}" already exists.`);
                return;
            }
            const value = axesLocationMap.constructor.Model.createPrimalDraft(axesLocationMap.dependencies)
            if(this._onCreateTagPrimeValue)
                this._onCreateTagPrimeValue(value, tag);
            axesLocationMap.push([tag, value]);
            inputWidget.reset();
        });
    }

    _setClassesHelper(requireClasses) {
        for(const baseClass of [this.constructor.ROOT_CLASS, this.BASE_CLASS]) {
            for(const [element, ...classParts] of requireClasses)
                element.classList.add([baseClass, ...classParts].join('-'));
        }
    }

    _dragstartHandler(event) {
        const path = this.widgetBus.rootPath.parent; // use parent to remove "./instance"
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof axes-math item path: ${path}]`);
        this.element.classList.add('dragging');

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
        event.dataTransfer.setDragImage(this.element, 0 , 0);
    }
    _dragendHandler(/*event*/) {
        this.element.classList.remove('dragging');
    }

    _createWrapperValue(keyId, key) {
        throw new Error(`NOT IMPLEMENTED ${this}._createWrapperValue (for keyId: "${keyId}" key: "${key}").`);
    }

    async _keyChangeHandler(index, event) {
        event.preventDefault();
        const tag = event.target.value.trim()
          , [valid, message] = validateOpenTypeTagString(tag)
          , inputWidget = this._keySlots[index].widgetWrapper.widget
          ;
        if(!valid) {
            // FIXME TODO: show message to the user
            // also, make sure it disappears on blur
            inputWidget.setCustomValidity(message);
            return;
        }
        // valid
        return await this._changeState(()=>{
            const axesLocationMap = this.getEntry('axesLocationMap');
            if(axesLocationMap.has(tag)) {
                inputWidget.setCustomValidity(`Axis-tag "${tag}" already exists.`);
                return;
            }
            inputWidget.setCustomValidity('');
            const value = axesLocationMap.getIndex(index);
            axesLocationMap.arraySplice(index, 1, [tag, value]);
        });
    }

    _keyDragstartHandler(rootPath, keyId, event) {
        const element = this._zones.get(keyId);
        element.classList.add('dragging');

        const keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , key = keyProtocolHandler.getRegistered(keyId).value
          , path = rootPath.append(key)
          ;
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(this.constructor.KEY_DATA_TRANSFER_TYPE, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${this.constructor.KEY_PLAIN_DATA_TRANSFER_TYPE}: ${path}]`);
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
        event.dataTransfer.setDragImage(element, 0 , 0);
    }

    _keyDragendHandler(keyId/*, event*/) {
        const element = this._zones.get(keyId);
        if(element)
            element.classList.remove('dragging');
    }

    _createWrapperKey(keyId, index) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                zone: keyId
            }
          , dependencyMappings = [[keyId, 'key@']]
          , Constructor = UIAxesMathAxisTag
          , eventHandlers = [
                    ['input', this._keyChangeHandler.bind(this, index)]
                  , ['blur', this._keyBlurHandler.bind(this)]
            ]
          , args = [eventHandlers]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    *_alphaOrderingGenerator (itemsGen) {
        const entries = new Map();
        for(const [index, [key, data]] of itemsGen)
            entries.set(key, [index, data]);
        const keys = Array.from(entries.keys())
            .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
        for(const key of keys) {
            const [index, data] = entries.get(key);
            yield [index , [key, data]];
        }
    }
    _provisionWidgets() {
        // Run _BaseContainerComponent._provisionWidgets this for the
        // initial/reguluar widgets. NOTE: _BaseDynamicCollectionContainerComponent
        // does not inherit from _BaseContainerComponent, thus we can't call
        // super. But the implementation is OK.

        // FIXME only do this if order changed or if items got added/deleted!

        // Run _BaseContainerComponent._provisionWidgets this for the
        // initial/reguluar widgets. NOTE: _BaseDynamicCollectionContainerComponent
        // does not inherit from _BaseContainerComponent, thus we can't call
        // super. But the implementation is OK.
        //
        // We have the deleted widgetWrappers in this._locationSetWidgets as well.
        this._widgets.splice(this._initialWidgetsAmount || 0, Infinity);
        const requiresFullInitialUpdate = _BaseContainerComponent.prototype._provisionWidgets.call(this)
          , currentWidgets = []
          , axesLocationMap = this.getEntry('axesLocationMap')
          , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , rootPath = Path.fromString(this.widgetBus.getExternalName('axesLocationMap'))
          ;
        // we can delete all items that are more than the existing ones
        // key-inputs will change their key the key at their index changes
        // value inputs will have to be rebuild when key-index or key changes,
        // as their "slot"/zone depends on the index and their value depends
        // on the key. we may find a way to update the zone/zlot however...
        // widgetWrapper.host = newHost;
        // widgetWrapper.reinsert();

        // delete values
        for(const key of this._locationSetWidgets.keys()) {
            if(axesLocationMap.has(key))
                continue;
            // delete
            const widgetWrapper = this._locationSetWidgets.get(key);
            this._destroyWidget(widgetWrapper);
            this._locationSetWidgets.delete(key);
        }
        // delete keys
        for( const {keyId, widgetWrapper, unregister} of
                this._keySlots.splice(axesLocationMap.size, Infinity)) {
            unregister();
            this._zones.get(keyId).remove();
            this._zones.delete(keyId);
            this._destroyWidget(widgetWrapper);
        }

        const gen = this.ORDER_STRATEGY === this.constructor.ORDER_STRATEGY_ALPHA
                  // FIXME: this is basically broken, as the list is not
                  // reorderd when the key is renamed e.g. to start with
                  // a new character that would have another position.
                ? this._alphaOrderingGenerator(axesLocationMap.indexedEntries())
                : axesLocationMap.indexedEntries()
                ;
        const keyIdOrder = [];
        for(const [index, [key, /*axesLocationSet*/]] of gen) {
            // keys
            const keyId = keyProtocolHandler.getId(index);
            keyIdOrder.push(keyId);
            if(!keyProtocolHandler.hasRegistered(keyId)) {
                const keyComponent = {value: null}
                  , unregister = keyProtocolHandler.register(keyId, keyComponent)
                  , container = this._domTool.createElement('div')
                  , requireClasses = [
                        [container, 'item']
                    ]
                  ;
                const dropTargetItem = {rootPath, keyId, key}
                  , dropHandlers = [
                        ['dragenter', this._dragenterHandler.bind(this, dropTargetItem)]
                      , ['dragover', this._dragoverHandler.bind(this, dropTargetItem)]
                      , ['dragleave', this._dragleaveHandler.bind(this)]
                      , ['drop', this._dropHandler.bind(this, dropTargetItem)]
                    ]
                  ;
                for(const args of dropHandlers)
                    container.addEventListener(...args);


                let dragHandleElement = null;
                // should be just this.DRAG as a name for the flag,
                // as we allow drop anyways!
                if(this.DRAG_AND_DROP) {
                    dragHandleElement = this._domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, '✥');
                    const dragHandlers = [
                                ['dragstart', this._keyDragstartHandler.bind(this, rootPath, keyId)]
                              , ['dragend', this._keyDragendHandler.bind(this, keyId)]
                            ];
                    for(const args of dragHandlers)
                        dragHandleElement.addEventListener(...args);
                    requireClasses.push([dragHandleElement, 'item', 'drag_handle']);
                }
                this._setClassesHelper(requireClasses);
                this._zones.set(keyId, container);
                this._zones.get('main').append(container);
                const widgetWrapper = this._createWrapperKey(keyId, index);
                currentWidgets.push(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);

                this._createWidget(widgetWrapper);
                if(dragHandleElement)
                    container.append(dragHandleElement);

                this._keySlots[index] = {keyId, widgetWrapper, unregister};
            }
            else {
                const {widgetWrapper} = this._keySlots[index];
                currentWidgets.push(widgetWrapper);
            }

            const keyComponent = keyProtocolHandler.getRegistered(keyId);
            if(keyComponent.value !== key) {
                // Keys have chaged order, now, the host of the value is different.
                keyComponent.value = key;
                keyProtocolHandler.setUpdated(keyId);
            }
            // values
            {
                // We can get away with keeping "value "widgets around
                // even if the order changed, as they are still keyed
                // the same and thus the paths stay valid.
                //
                // But, when order changed, the container/host has changed as well
                let widgetWrapper;
                if(this._locationSetWidgets.has(key)) {
                    // keeper
                    widgetWrapper = this._locationSetWidgets.get(key);
                    // change host (not alway required)
                    const host = this._zones.get(keyId);
                    // FIXME: we may require a world where in this case
                    // widgetWrapper.host is not set at all. Or maybe,
                    // where changing widgetWrapper.host also reinserts
                    // the children. But, it is complicated now.
                    if(widgetWrapper.host !== host) {
                        // CAUTION this would interfere if a placemarker
                        // was used as target!
                        widgetWrapper.reinsert(host);
                    }
                }
                else {
                    // create new, insert
                    widgetWrapper = this._createWrapperValue(keyId, key);
                    this._createWidget(widgetWrapper);
                    this._locationSetWidgets.set(key, widgetWrapper);
                    requiresFullInitialUpdate.add(widgetWrapper);
                }
                currentWidgets.push(widgetWrapper);
            }
        }
        {
            // Container order depends on the order produced by the generator.
            // If the order has changed, the containers in main need to be
            // reordered as well.
            this._postponedKeyIdOrder = null;
            const mainZoneElement = this._zones.get('main')
              , mainZoneOrder = [...mainZoneElement.children]
              ;
            let requireReorder = false;
            for(const [index, keyId] of keyIdOrder.entries()) {
                const container = this._zones.get(keyId);
                if(mainZoneOrder[index] !== container) {
                     requireReorder = true;
                     break;
                }
            }
            if(requireReorder) {
                // CAUTION if e.g. a key is being edited, this should be
                // postponed, until the key loses focus. A key being
                // edited changes alphabetic ordering, then the user
                // loses input focus and is rightfuly anonoyed. Hence this
                // is the most/only interesting case currently.
                for(const {widgetWrapper} of this._keySlots) {
                    if(widgetWrapper.widget.isFocused()) {
                        // !=> postponed
                        this._postponedKeyIdOrder = keyIdOrder;
                        break
                    }
                }
                if(this._postponedKeyIdOrder === null) {
                    // Not postponed, do it now.
                    this._reorderContainers(keyIdOrder);
                }
            }
        }
        this._widgets.push(...currentWidgets);
        return requiresFullInitialUpdate;
    }

    _reorderContainers(keyIdOrder) {
        const mainZoneElement = this._zones.get('main')
          , mainZoneOrder = mainZoneElement.children
          ;
        for(const [index, keyId] of keyIdOrder.entries()) {
            const container = this._zones.get(keyId);
            if(mainZoneOrder[index] !== container) {
                // Re-insert from index to end.
                const newOrder = keyIdOrder.slice(index).map(keyId=>this._zones.get(keyId));
                mainZoneElement.append(...newOrder);
                break;
            }
        }
    }

    _keyBlurHandler() {
        if(this._postponedKeyIdOrder !== null) {
            this._reorderContainers(this._postponedKeyIdOrder);
            this._postponedKeyIdOrder = null;
        }
    }

    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('key@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('key@').resetUpdatedLog();
        super.initialUpdate(...args);
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [this.constructor.KEY_DATA_TRANSFER_TYPE];
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

    _getDropTargetInsertPosition(dropTargetItem, event) {
        if(dropTargetItem.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = dropTargetItem.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          , childrensMainZoneElement = this._zones.get('main')
          ;
        for(const elem of childrensMainZoneElement.querySelectorAll(`:scope > .${markedClass}`)) {
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

        const [elem, posClassSuffix] = [element, insertPosition];
        //insertPosition === 'before' && element.previousSibling
        //        ? [element.previousSibling, 'after']
        //        : [element, insertPosition]
        //        ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dragoverHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === this.constructor.KEY_DATA_TRANSFER_TYPE
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === this.constructor.KEY_DATA_TRANSFER_TYPE
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
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
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);
        const {rootPath: targetRootPath} = dropTargetItem
          , insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event)
          ;
        let targetPath = targetRootPath;
        if(insertPosition !== 'insert') {
            const keyId = dropTargetItem.keyId
              , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
              , key = keyProtocolHandler.getRegistered(keyId).value
              ;
            targetPath = targetRootPath.append(key);
        }
        if(type === this.constructor.KEY_DATA_TRANSFER_TYPE) {
            const sourcePathString = event.dataTransfer.getData(this.constructor.KEY_DATA_TRANSFER_TYPE)
              , sourcePath = Path.fromString(sourcePathString)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else { //  if(type === DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE) {
            console.error(`NOT IMPLEMENTED ${this}_dropHandler for type "${type}"`);
            // const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE);
            // return this._create(typeKey, targetPath, insertPosition);
        }
    }

    // Version to move between instances of _AbstracrOrderedMap.
    _move(sourcePath, targetPath, insertPosition) {
        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const targetParent = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              , sourceEntry = [sourceKey, source]
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                targetParent.push(sourceEntry);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , [targetIndex] = targetParent.keyToIndex(targetKey)
              , [sourceIndex] = sourceParent.keyToIndex(sourceKey)
              ;

            if(targetParent === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                targetParent.arraySplice(insertIndex, 0, sourceEntry);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                targetParent.arraySplice(targetIndex + 1, 0, sourceEntry);
            else if(insertPosition === 'before')
                targetParent.arraySplice(targetIndex, 0, sourceEntry);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }
}


class UIAxesMathLocationsProduct extends _BaseUIAxesMap {
    static TYPE_CLASS_PART = 'product';
    static ORDER_STRATEGY = _BaseUIAxesMap.ORDER_STRATEGY_NATURAL;
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUES_KEY_PATH;
    static KEY_PLAIN_DATA_TRANSFER_TYPE = 'axes-math location-values-key path';

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath: this.widgetBus.rootPath.append('axesLocationValuesMap')
              , relativeRootPath: Path.fromParts('.', key)
              , zone: keyId // required to check if widgetWrapper.host === host
            }
          , dependencyMappings = [['.', 'collection']]
          , Constructor = UIAxesMathLocationValues
          , zones = new Map([['main', this._zones.get(keyId)]])
          , args = [zones]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _onCreateTagPrimeValue(value/* tag */) {
        // In most cases it should be in the interest of the user to create
        // a pre-filled list with one element, to require one less click.
        const axisLocationValue = value.constructor.Model.createPrimalDraft(value.dependencies);
        // not required, "default" is the default already.
        // setAxisLocationValue(axisLocationValue, 'default');
        value.push(axisLocationValue);
    }
}

/**
 * TODO: this will be very similar to UIAxesMathLocationsProduct
 * however, instead of a list of values, this only has a single value
 * per axis tag.
 *
 * this will be rather versatile.
 *
 * It should be minimal when not being edited.
 * It enable adding a location for any axis tag, even axis tags we don't
 * know yet should be possible. We could use the axis registry for a
 * selection that maks sense.
 * I just think maybe this is eventually growing really complex and thus,
 * for the moment, it should be really simple.
 * Just an editor for a dict where the keys are axis tags and the values
 * are AxesMathAxisLocationValueModel ({logicalValue, numericValue})
 */
class UIAxesMathLocation extends _BaseUIAxesMap {
    static TYPE_CLASS_PART = 'location';
    static ORDER_STRATEGY = _BaseUIAxesMap.ORDER_STRATEGY_ALPHA;
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_KEY_PATH;
    static KEY_PLAIN_DATA_TRANSFER_TYPE = 'axes-math location-key path';

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath: this.widgetBus.rootPath.append('axesLocations')
              , relativeRootPath: Path.fromParts('.', key)
              , zone: keyId
            }
          , dependencyMappings = [['./', 'value']]
          , Constructor = UIAxesMathLocationValue
          , dropEventHandlers = []
          , args = [dropEventHandlers]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class UIAxesMathLocationsSum extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, _zones, childrenSettings, eventHandlers, label) {
        const labelElement = widgetBus.domTool.createElement('span', {}, label)
          , dragHandleElement = widgetBus.domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, '✥')
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {})
          , localZoneElement = widgetBus.domTool.createElement('div', {} ,[dragHandleElement, labelElement, childrensMainZoneElement])
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        localZoneElement.append(childrensMainZoneElement);
        super(widgetBus, zones);

        const baseClass = 'ui_axes_math-locations_sum'
        for(const [element, ...classParts] of [
                [localZoneElement, baseClass]
              , [labelElement, baseClass, 'label']
              , [dragHandleElement, baseClass, 'drag_handle']
              , [childrensMainZoneElement, baseClass, 'items']
        ])
            element.classList.add(classParts.join('-'));
        for(const args of [
                    ['dragstart', this._dragstartHandler.bind(this)]
                  , ['dragend', this._dragendHandler.bind(this)]
                ]) {
            dragHandleElement.addEventListener(...args);
        }
        for(const args of eventHandlers)
            localZoneElement.addEventListener(...args);

        const wrapChildrenContainerHandler = fn=>{
            return event=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('collection'))
                  , collection = this.getEntry(rootPath)
                  ;
                if(collection.size !== 0)
                    // only if empty
                    return;
                const dropTargetItem = {rootPath, isEmptyLayerContainer: true};
                return fn.call(this, dropTargetItem, event);
            }
        }
        for(const args of [
                    ['dragenter', wrapChildrenContainerHandler(this._dragenterHandler)]
                  , ['dragover', wrapChildrenContainerHandler(this._dragoverHandler)]
                  , ['dragleave', this._dragleaveHandler.bind(this)]
                  , ['drop', wrapChildrenContainerHandler(this._dropHandler)]
                ]) {
            childrensMainZoneElement.addEventListener(...args);
        }

        this._insertElement(localZoneElement);
        this.element = localZoneElement;
        this._childrenSettings = childrenSettings;
        this._removeDragIndicatorTimeoutId = null;
    }

    _dragstartHandler(event) {
        const path = this.widgetBus.rootPath.parent; // use parent to remove "./instance
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."


        event.dataTransfer.setData(DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof axes-math item path: ${path}]`);
        this.element.classList.add('dragging');

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
        event.dataTransfer.setDragImage(this.element, 0 , 0);
    }
    _dragendHandler(/*event*/) {
        this.element.classList.remove('dragging');
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
          , dropTargetItem = {rootPath}
          , eventHandlers = [
                ['dragenter', this._dragenterHandler.bind(this, dropTargetItem)]
              , ['dragover', this._dragoverHandler.bind(this, dropTargetItem)]
              , ['dragleave', this._dragleaveHandler.bind(this)]
              , ['drop', this._dropHandler.bind(this, dropTargetItem)]
            ]
          ;
        let Constructor
          , args = []
          , localSettings = {}
          , dependencyMappings = [/* TODO */]
          ;
        switch (typeKey) {
            case 'LocationsSum':
                // It can contain itself. :-)
                Constructor = UIAxesMathLocationsSum;
                dependencyMappings.push(['./items', 'collection']);
                args = [this._zones, this._childrenSettings, eventHandlers, typeLabel];
                break;
            case 'LocationsProduct':
                Constructor = UIAxesMathLocationsProduct;
                dependencyMappings.push(['axesLocationValuesMap', 'axesLocationMap']);
                {
                    const dragAndDrop = true;
                    args = [this._zones, eventHandlers, typeLabel, dragAndDrop];
                }
                break;
            case 'Location':
                Constructor = UIAxesMathLocation;
                dependencyMappings.push(['axesLocations', 'axesLocationMap']);
                {
                    const dragAndDrop = true;
                    args = [this._zones, eventHandlers, typeLabel, dragAndDrop];
                }
                break;
            default:
                throw new Error(`UNKOWN TYPE ${typeKey} in ${this}`);
        }

        const settings = Object.assign(
            {}
          , localSettings
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

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH, DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE];
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

    _getDropTargetInsertPosition(dropTargetItem, event) {
        if(dropTargetItem.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = dropTargetItem.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          , childrensMainZoneElement = this._zones.get('main')
          ;
        for(const elem of [childrensMainZoneElement, ...childrensMainZoneElement.querySelectorAll(`:scope > .${markedClass}`)]) {
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

        const [elem, posClassSuffix] = [element, insertPosition];
        //insertPosition === 'before' && element.previousSibling
        //        ? [element.previousSibling, 'after']
        //        : [element, insertPosition]
        //        ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dragoverHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
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
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);

        const {rootPath: targetPath} = dropTargetItem
          , insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event)
          , data = event.dataTransfer.getData(type)
          ;

        if(type === DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH) {
            const sourcePathString = data
              , sourcePath = Path.fromString(sourcePathString)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE) {
            const typeKey = data
            return this._create(targetPath, insertPosition, typeKey);
        }
        else
            throw new Error(`NOT IMPLEMENTED ${this}_dropHandler type: {type}`)
    }

    // TODO: this is a very good reusable method, so reuse!
    _move(sourcePath, targetPath, insertPosition) {
        const canMove = !sourcePath.isRootOf(targetPath);
        if(!canMove) {
            console.warn(`${this}._move can't move source into target as `
                    +`source path "${sourcePath}" is root of target path "${targetPath}".`);
            return;
        }
        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                items.push(source);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;

            if(items === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                items.splice(insertIndex, 0, source);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                items.splice(targetIndex + 1, 0, source);
            else if(insertPosition === 'before')
                items.splice(targetIndex, 0, source);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _create(targetPath, insertPosition, typeKey) {
        return this._changeState(()=>{
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , newItem = createAxesMathItem(typeKey, items.dependencies)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                items.push(newItem);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              ;
            let insertIndex;
            if(insertPosition === 'after')
                insertIndex = targetIndex + 1;
            else if(insertPosition === 'before')
                insertIndex = targetIndex;
            else
                throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            items.splice(insertIndex, 0, newItem);
        });
    }
}

/**
 * This may be eventually have some similarity to UIVideoproofArrayLayers
 * as it will also likely have some drag-drop based interface.
 */
class UIAxesMath extends _BaseContainerComponent {
    constructor(widgetBus, _zones, label, updateDefaultsDependencies) {
        const localZoneElement = widgetBus.domTool.createElement('fieldset', {'class': 'ui_axes_math'})
          , zones = new Map([..._zones, ['main', localZoneElement]])
          ;
        super(widgetBus, zones);
        collapsibleMixin(localZoneElement, 'legend');
        this._insertElement(localZoneElement);

        const widgets = [
            [
                {zone: 'main'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , label
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
              , [
                    ['./items', 'collection']
                ]
              , UIAxesMathLocationsSum
              , zones
              , {zone: 'main'} // childrenSettings
              , [] // eventHandlers missing??? => maybe if this is empty!
              , availableAxesMathItemTypes.get('LocationsSum').get('label').value
            ]
            // * Like UIManualAxisLocations, to choose a custom location
            //   for the Axes that are not defined by the axesMath results
          , [
                {
                    zone: 'main'
                }
              , []
              , SelectAndDragByOptions
              , 'Create'
              , ''//'drag and drop into Rap-Editor.'
              , [ // options [type, label, value]
                    ...[...availableAxesMathItemTypes].map(
                        ([key, availableType])=>[DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE, availableType.get('label').value, key])
                  , [DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE, 'Product Value', 'default']
                ]
            ]
          , [
                {
                    zone: 'main'
                }
              , []
                // FIXME: deleting the top level collection creates an error
                // should probably rather create an empty collection.
                // FIXME2: the empty collection creates the initial fixture
                //         of content items into the collection
              , WasteBasketDropTarget
              , 'Delete'
              , ''//'drag and drop into trash-bin.'
              , [
                    // These are "atomic" AXESMATH items, "Sum", "Product", and "Location"
                    DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH
                    // A location value lives in a Location or in a LocationValues list
                    // Within the LocationValues list it must be possible to reorder the individual locationValues.
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_KEY_PATH
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUES_KEY_PATH
                    // FIXME: allow for videoproof array-layer: requires implementation in
                    // WasteBasketDropTarget to work as well.
                    //   , DATA_TRANSFER_TYPES.ACTOR_PATH
                ]
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
              , UIKeyMomentsLinkNavigation
              , 'Key Moments'
            ]
        ];
        this._initWidgets(widgets);
    }
}

function setAxisLocationValue(axisLocationValue, locationRawValue) {
    if(typeof locationRawValue === 'string')
        axisLocationValue.get('logicalValue').value = locationRawValue;
    else if(typeof locationRawValue === 'number') {
        axisLocationValue.get('logicalValue').value = 'number';
        axisLocationValue.get('numericValue').value = locationRawValue;
    }
    else
        throw new Error(`TYPE ERROR don't know how to handle ${typeof locationRawValue }.`);
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
        // As an entry point, the AxesMathLocationsSumModel can handle
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
      , ['axesMath', AxesMathLocationsSumModel]
      , CoherenceFunction.create(
            ['axesMath']
          , function initAxesMath({axesMath}) {
            // Not sure about this, mabe there can be a default
            const items = axesMath.get('items');
            if(items.size === 0) {
                console.log('VideoproofArrayV2ActorModel axesMath is empty. adding some content');
                const locationsProductItem = createAxesMathItem('LocationsProduct', items.dependencies)
                  , locationSets = getEntry(locationsProductItem, './instance/axesLocationValuesMap')
                  ;

                for(const [axisTag, locationsVals] of [
                            ['opsz', ['min', 'default', 'max']]
                          , ['wdth', ['default', 'min', 'max']]
                          , ['wght', ['default', 'min', 'max']]]) {
                    if(!locationSets.has(axisTag)) {
                        locationSets.set(
                            axisTag
                          , locationSets.constructor.Model.createPrimalDraft(locationSets.dependencies)
                        );
                    }
                    const locationValues = locationSets.get(axisTag);

                    for(const locationRawValue of locationsVals) {
                        const axisLocationValue = locationValues.constructor.Model.createPrimalDraft(locationValues.dependencies);
                        setAxisLocationValue(axisLocationValue, locationRawValue);
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
                        //
                        // I'm thinking another way to encode this may be
                        // a list of [tag, value] pairs. It's not "locations"
                        // then anymore though. [tag, value] enables all
                        // of the above. Locations with a single key, value
                        // in a list, i.e. like the first example, are just
                        // like [tag, value]
                        //
                        // However, the timeslist will ideally show a summary
                        // similar to the last entry, derrived from either
                        // the first or the seccond form:
                        //       opsz default, min, max
                        //     × wdth default, min, max
                        //     × wght default, min, max X
                        locationValues.push(axisLocationValue);
                    }
                }
                items.push(locationsProductItem);
            }
        })
      , ['videoproofArrayV2', VideoproofArrayV2ActorModel]
      , CoherenceFunction.create(
            ['videoproofArrayV2' , 'font', /*'duration', 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function initVideoproofArray({videoproofArrayV2: videoproofArray, font}) {
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
              // , fontHasChanged = videoproofArray.dependencies.font !== font
              // , needNewKeyMoments = needInitialKeymoment || fontHasChanged
              ;

            if(videoproofArray.get('localActiveFontKey').value !== font.value.fullName) {
                // Set font explicitly, to make the VideoproofArrayV2ActorModel
                // self contained when copied to stage-and-actors.
                // This creates a duplication of the information in
                // the global font key, but as explained, it's intended
                // as a feature: make a self-contained actor.
                videoproofArray.get('localActiveFontKey').set(font.value.fullName);
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
      , CoherenceFunction.create(
            ['videoproofArrayV2', 'axesMath', 'installedFonts', 'font', 'duration']
          , function updateRap({videoproofArrayV2, axesMath, installedFonts, font, duration}) {
            // how to know when to update?
            // I think whenever axesMath
            // but likely also whenever any of the fonts have changed
            // especially because we'll have to create keyMoments for
            // each actor.
            //
            // seems like when an item has changed it comes here as
            // a non-draft item, if it has not changed, it comes as
            // an proxy.
            // When all items are proxies, there have been no changes
            // this is important, as when only t changes we don't want
            // to cause any work ideally.
            //
            // videoproofArrayV2 seems to be always a draft
            const activeActors = videoproofArrayV2.get('activeActors')
              , fontHasChanged = videoproofArrayV2.dependencies.font !== font
              ;
            //  , availableActorTypes = videoproofArrayV2.get('availableActorTypes')
            // console.log('updateRap',
            //     // when only t changed:
            //     //      isProxy: true isDraft: true
            //     // added an actor:
            //     //       isProxy: false isDraft: true
            //     // changed axesMath
            //     //       isProxy: true isDraft: true
            //     // global font changed (is a dependency)
            //     //       isProxy: true isDraft: true
            //     '\nvideoproofArrayV2:', videoproofArrayV2, 'isProxy:', _PotentialWriteProxy.isProxy(videoproofArrayV2), 'isDraft:',  videoproofArrayV2.isDraft
            //     // when only t changed:
            //     //      isProxy: true isDraft: false
            //     // added an actor:
            //     //       isProxy: false isDraft: true
            //     // changed axesMath
            //     //       isProxy: true isDraft: false
            //     // global font changed (is a dependency)
            //     //       isProxy: true isDraft: false
            //   , '\nactiveActors:', activeActors, 'isProxy:', _PotentialWriteProxy.isProxy(activeActors), 'isDraft:',  activeActors.isDraft
            //     // when only t changed:
            //     //      isProxy: true isDraft: false
            //     // added an actor:
            //     //       isProxy: true isDraft: false
            //     // changed axesMath
            //     //       isProxy: false isDraft: true
            //     // global font changed (is NOT a dependency)
            //     //       isProxy: true isDraft: false
            //   , '\naxesMath:', axesMath, 'isProxy:', _PotentialWriteProxy.isProxy(axesMath), 'isDraft:',  axesMath.isDraft
            // );
            // if(activeActors.isDraft) {
            //     for(const [key, actor] of activeActors) {
            //         // can I detect which actor changed font
            //         // OR is new -> these don't appear as actor.isDraft === true
            //         // OR if there was an actor deleted? => though this
            //         //    likely doesn't require an update!
            //         //
            //         // font/color etc. changed: isProxy false isDraft: true
            //         const instance = actor.get('instance')
            //           , localActiveFontKey = instance.get('localActiveFontKey')
            //           ;
            //         console.log(`actor #${key}:`, actor, 'isProxy:', _PotentialWriteProxy.isProxy(actor), 'isDraft:',  actor.isDraft
            //           , '\n instance:', instance
            //             // NICE! we can detect when these changed!
            //             // font changed: isProxy: false isDraft: true
            //             // color changed: isProxy: true isDraft: false
            //             //
            //             // BUT this heuristic is maybe not totally bomb proof
            //             // if there's a complete replacement of the active
            //             // actors list, these actors will all not look
            //             // like new ones!
            //             // however, maybe if we detect if any other
            //             // property changed, that is not localActiveFontKey
            //             // we can assume that this has no changed font
            //             // if nothing changed
            //           , `\nlocalActiveFontKey ${localActiveFontKey.value.toString()}`, localActiveFontKey, 'isProxy:', _PotentialWriteProxy.isProxy(localActiveFontKey), 'isDraft:',  localActiveFontKey.isDraft
            //           , 'oldState:', localActiveFontKey.isDraft && localActiveFontKey.oldState.value || '(No old state)'
            //         );
            //     }
            // }
            if(activeActors.isDraft || axesMath.isDraft || fontHasChanged) {
                // Not a bomb proof heuristic but hopefully good enough
                // for this use case.
                console.log('UPDATING')
                const videoproofArrayDraft = unwrapPotentialWriteProxy(videoproofArrayV2, 'draft')
                applyAxesMathLocations(
                        videoproofArrayDraft
                      , axesMath/* AxesMathLocationsSumModel */
                      , installedFonts, font, duration
                );
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
          // CAUTION:  Achromatic colors (shades of gray) will have an undefined hue.
        if(culoriColorOKLCH.h !== undefined)
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

        collapsibleMixin(generalControlsContainer, 'legend');

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
          , [
                {zone: 'main'}
              , []
              , UITimeControl
              , zones
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
                {zone: 'general'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Options'
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
          , [
                {
                    zone: 'main'
                    // rootPath maybe don't alter rootPath now, as
                    //  ['axesMath', AxesMathLocationsSumModel] is top level
                    // in VideoproofArrayV2Model at the moment.
                    // will perhaps move into a dedicated struct though

                }
              , [
                    // TODO:
                    // ['videoproofArrayV2/keyMoments', 'keyMoments']
                    // actually, font may not be that interesting, but
                    // all the current videoproofArrayV2 layer fonts are
                    // VideoproofArrayV2CellActorModel in  videoproofArrayV2/activeActors
                    // ['videoproofArrayV2/activeActors', 'layers']
                    //     => which properties do we need to look at despite
                    //        of fonts? I don't think there's much.
                    //        The fonts will lead to the keyMoments being
                    //        updated.
                    // , ['../font', 'font']
                ]
              , UIAxesMath
              , zones
              , 'Rap Editor'
              , updateDefaultsDependencies
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
