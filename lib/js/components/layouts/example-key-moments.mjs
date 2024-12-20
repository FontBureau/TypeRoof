/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , getEntry
  , ForeignKey
  // , unwrapPotentialWriteProxy
  , StateComparison
  , CoherenceFunction
  // , BooleanModel
  // , StringModel
  , NumberModel
  , ValueLink
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractListModel
  , _AbstractSimpleOrEmptyModel
  //, FreezableMap
} from '../../metamodel.mjs';

import { zip } from '../../util.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    Model as ManualAxesLocationsModel
  , UIManualAxesLocations
} from '../ui-manual-axis-locations.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
  , SimpleProtocolHandler
} from '../basics.mjs';

import {
    StaticTag
  , StaticNode
  , DynamicTag
  , UINumberInput
  , UINumberAndRangeInput
  , UINumberAndRangeOrEmptyInput
  , UILineOfTextInput
  , MoveItemsInListButton
} from '../generic.mjs';

import {
    timeControlModelMixin
  , AnimationTGenerator
  , UITimeControlKeyMomentSelectCircle
  , getBasicPlayerControlWidgets
  , keyMomentBaseModelMixin as keyMomentModelMixin
  , binarySearch
  , LocalScopeAnimanion
  , AnimationLiveProperties
  , AnimationInfo
}  from '../animation-fundamentals.mjs';

import {
    GENERIC
  , ProcessedPropertiesSystemMap
} from '../registered-properties-definitions.mjs';

const FontSizeModel = _AbstractSimpleOrEmptyModel.createClass(NumberModel)
  , KeyMomentModel = _AbstractStructModel.createClass(
        'KeyMomentModel'
      , ...keyMomentModelMixin
      , ['fontSize', FontSizeModel]
      , ['manualAxesLocations', ManualAxesLocationsModel]
    )
    // Order is really most important here, however, _AbstractOrderedMapModel
    // could still be an option, then move "label" as unique identifier in
    // here. However, this works good enough.
  , KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
  , ActiveKeyMomentModel = _AbstractStructModel.createClass(
        'ActiveKeyMomentModel'
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
  , ActiveKeyMomentsModel = _AbstractListModel.createClass('ActiveKeyMomentsModel', ActiveKeyMomentModel)
  , ExampleKeyMomentsLayoutModel = _BaseLayoutModel.createClass(
        'ExampleKeyMomentsLayoutModel'
      , ...timeControlModelMixin
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
            // directly in the ActiveKeyMomentsModel via _AbstractListModel, which is not
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
      , ['activeKeyMoments', ActiveKeyMomentsModel]
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

export function createLabelForKeyMoment(keyMoments, index) {
    // TODO: For KeyMomentsModel _AbstractListModel should have a
    // coherence function that can do this kind of thing (creating
    // a unique label). From within the coherence function of the
    // KeyMomentModel, we can't determine the position or current
    // uniquenes of the label.
    // Though, it also is kind of hard to determine from such a method
    // if the KeyMoment needs an auto label or if the state is intended.
    const labels = new Set([...keyMoments]
            .map(([/* key */, keyMoment])=>keyMoment.get('label').value))
      // + 1 so we don't have "Key Moment 0" at first position ...
      , formatLabel=counter=>`Key Moment ${counter + 1}`
      ;

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
    return label;
}

export class KeyMomentsTimeline extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<fieldset class="key_moments_timeline">
        <legend>Key-Moments Timeline</legend>
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
</fieldset>`;
    static KEY_MOMENT_BUTTON_TEMPLATE=`<li>
    <button class="key_moments_timeline-button" title="Select"></button>
</li>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
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
              , liveProperties = this.getEntry('animationProperties@')
              , t = liveProperties.t
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newMoment = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
              , [insertIndex, newMomentDuration, afterMoment
                    , newAfterMomentDuration
                ] = this._getInsertParameters(keyMoments, liveProperties, t)
                // Starting with "before index" here, meaning: "afterIndex - 1".
              , label = createLabelForKeyMoment(keyMoments, Math.max(0, parseFloat(insertIndex, 10) - 1))
                // Setting the properties for t and not setting the properties,
                // leaving them undefined, must have -- in this insert-situation
                // -- the same effect on the animation. These are just two different
                // approaches and the better approach should be determined by
                // considering usability. But, considering that a moment is
                // inserted, let's for now assume that capturing the "active"
                // properties is a feature, otherwise they could be hand-captured
                // by using the "set explicitly" button of each axis.
                // NOTE: In the future, it will be interestig e.g. to split
                // easing definitions in half!
              , newMomentProperties = liveProperties.getPropertyValuesMapForLocalT(t)
              ;
            let axesLocations = null;
            for(const [path_, value] of newMomentProperties) {
                if(path_.startsWith('axesLocations')) {
                    // CAUTION: opsz/autoOPSZ requires special treatment!
                    if(axesLocations === null)
                        axesLocations = getEntry(newMoment, 'manualAxesLocations/axesLocations');
                    const axisTag = Path.fromString(path_).parts.at(-1);
                    axesLocations.setSimpleValue(axisTag, value);
                }
                else
                    // Only fontSize so far.
                    newMoment.get(path_).value = value;
            }
            if(newMomentDuration !== null)
                newMoment.get('duration').value = newMomentDuration;
            newMoment.get('label').value = label;
            if(afterMoment !== null && newAfterMomentDuration !== null)
                afterMoment.get('duration').value = newAfterMomentDuration;
            keyMoments.splice(insertIndex, 0, newMoment);
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

            const index =  activeKey !== null
                    // Insert after active entry.
                    ? parseInt(activeKey, 10) + 1
                    // just insert at end
                    : keyMoments.size
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newEntry = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies)
                // This would create a copy of the active entry.
                // Not sure if unwrapPotentialWriteProxy is required, but it doesn't hurt.
                // Decided against the copy:
                // newEntry = unwrapPotentialWriteProxy(keyMoments.get(activeKey))
              ;

            // insert
            keyMoments.splice(index, 0, newEntry);
            const label = createLabelForKeyMoment(keyMoments, index);
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

    _getInsertParameters(keyMoments, liveProperties, t) {
            const absoluteT = t * liveProperties.fullDuration
                // - for t, get the absoluteT
                // - get the keyMoment after
              , momentTs = [...liveProperties.tToKeyMoments.keys()]
              , [leftIndex, rightIndex] = binarySearch(momentTs, absoluteT)
              , leftT = momentTs[leftIndex]
              , rightT = momentTs[rightIndex]
              ;

            // return values
            let insertIndex
              , newMomentDuration = null
              , newAfterMomentDuration = null
              , afterMoment = null
              ;
            if(leftIndex === null && rightIndex === null) {
                // No moments at all.
                // Just insert a blank, new, KeymomentMoment
                insertIndex = 0;
                newMomentDuration = null; // As per coherence function (will be 1).
                newAfterMomentDuration = null;
                afterMoment = null;

            }
            else if(leftIndex === null) {
                // leftIndex === null: t is bigger than/right of the last entry.
                //          Because absoluteT > momentTs[rightIndex]
                //          Assert: Must be a loop, otherwise there is no
                //                  right of last entry...
                //          Assert rightIndex === 0
                //          This will create a new last KeyMoment,
                //          but it will change the duration of the first
                //          keyMoment.
                // insert at the end
                afterMoment = keyMoments.get(0);
                insertIndex = keyMoments.size;
                // change first KeyMoment, as its duration closes the loop
                newMomentDuration = absoluteT - rightT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            else if(rightIndex === null) {
                // We're left from the first index,
                // This is not supposed to happen, because we use all
                // existing KeyMoments, not a subset and there is no
                // time before the first KeyMoment.
                throw new Error(`Assertion Failed, rightIndex must not be null.`);
            }
            else if (leftIndex === rightIndex) {
                //           Interesting since we can have possibly different in and
                //           out values when there are multiple moments at this position.
                //           We are directly on an existing momentT.
                //           Do we insert before or after?
                // Here the add-button allows for more control, but we can
                // just insert insert empty, after with a duration of 0.
                // But, since this method is changing the duration of the
                // after moment usually, it's maybe more intuitiv to insert
                // before. The way, properties are applied to the new moment,
                // via liveProperties, favors inserting after, it's jsut
                // simpler for now.
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT).at(-1);
                afterMoment = null;// Not required, doesn't change: keyMoments.get(afterIndex);
                insertIndex = parseInt(afterIndex,10) + 1;
                newMomentDuration = 0;
                newAfterMomentDuration = null; // don't change
            }
            else { // leftIndex !== rightIndex
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT)[0];
                afterMoment = keyMoments.get(afterIndex);
                insertIndex = afterIndex;
                newMomentDuration = absoluteT - leftT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            return [insertIndex, newMomentDuration, afterMoment, newAfterMomentDuration];
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
        const compareResult = StateComparison.createInitial(rootState, this.widgetBus.wrapper.dependencyMapping);
        this.update(compareResult);
    }

    update(compareResult) {
        // console.log(`${this.constructor.name}.update(compareResult):`, compareResult);
        // compareResult.toLog();
        // console.log('dependencyMapping', this.widgetBus.wrapper.dependencyMapping);
        const changedMap = this._getChangedMapFromCompareResult(compareResult);
        // console.log('compareResult.getChangedMap(this.widgetBus.wrapper.dependencyMapping)', changedMap);
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

/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* fontSizeGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const fontSize = keyMoment.get('fontSize');
    if(!fontSize.isEmpty)
        yield [`${GENERIC}fontSize`, fontSize.value];
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
      // outerAnimanionAPI.getPropertyAtMomentT(`${GENERIC}fontSize`, momentT) will
      // yield the out-value (last value) of that momentT
      , autoOPSZ = manualAxesLocations.get('autoOPSZ').value
      ;
    if(autoOPSZ) {
        const fontSize = keyMoment.get('fontSize')
          , fontSizeValue = fontSize.isEmpty
                  // this requires full calculation of the fontSize property animation!
                ? outerAnimanionAPI.getPropertyAtMomentT(`${GENERIC}fontSize`, momentT, null)
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

class AnimationSample extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="animation_sample"><span class="animation_sample-text">Sample Text</sample></div>
</div>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        this._propertyFields = new Map();
        [this.element, this._sample] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , sample = element.querySelector('.animation_sample-text')
          ;
        this._insertElement(element);
        return [element, sample];
    }

    _setPropertiesToSample(propertyValuesMap) {
        const axisPrefix = 'axesLocations/';

        if((propertyValuesMap.has(`${GENERIC}fontSize`)))
            this._sample.style.setProperty('font-size', `${propertyValuesMap.get(GENERIC + 'fontSize')}pt`);

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
        if(changedMap.has('font')) {
            const font = changedMap.get('font').value;
            this._sample.style.setProperty('font-family', `"${font.fullName}"`);
        }

        if(changedMap.has('animationProperties@')) {
            const propertyValuesMap = changedMap.get('animationProperties@').propertyValuesMap;
            this._setPropertiesToSample(propertyValuesMap);
        }
    }
}

class KeyMomentController extends _BaseContainerComponent {
    static _NOTDEF = Symbol('_NOTDEF'); // jshint ignore:line
    constructor(widgetBus, zones) {
        // run super first, so we can use `this` in the widgets definition.
        super(widgetBus, zones);

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
        this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..', '..')}`;

        const updateDefaultsDependencies = [
                [this._animationPropertiesKey, 'animationProperties@']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>{
                return Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
            }
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
              , UILineOfTextInput
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
                  , ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , this._getDefaults.bind(this, ProcessedPropertiesSystemMap.createSimpleRecord(GENERIC, 'fontSize'), 'fontSize', 66)
              , requireUpdateDefaults
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
                  , ...updateDefaultsDependencies
                ]
              , UIManualAxesLocations
              , this._getDefaults.bind(this)
              , ProcessedPropertiesSystemMap.createSimpleRecord('axesLocations/', 'axesLocations')
              , requireUpdateDefaults
            ]
        ];
        this._initWidgets(widgets);
    }
    _getDefaults(ppsRecord, modelFieldName, defaultVal=super._NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value
        const {fullKey} = ppsRecord
           , liveProperties = this.getEntry(this._animationPropertiesKey)
           , activeKey = this.getEntry(this.widgetBus.rootPath.append('../activeKey')).value
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== super._NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR defult value not found for activeKey: ${activeKey} at "${fullKey}" in AnimationLiveProperties`);
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
export class KeyMomentsController extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones, ChildrenContstructor) {
        super(widgetBus, zones);
        this._itemEntryPath = Path.fromParts('.', 'keyMoment');
        if(typeof ChildrenContstructor !== 'function')
            throw new Error(`TYPE ERRROR ${this.constructor.name} ChildrenContstructor `
                + `is not a function ${typeof ChildrenContstructor !== 'function'} ${ChildrenContstructor}`);
        this._ChildrenContstructor = ChildrenContstructor;
    }
    /**
     * return the original keyMoment from the original hosting
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
     * const rootPath = this.widgetBus.rootPath.append('activeKeyMoments', i, 'keyMoment');
     * -> but we can't use rootPath and have to use newWidgets[i].widgetBus.rootPath
     * It sseems like the override should happen in here not in the KeyMomentController
     */
    _redirectedGetEntry(externalName) {
        // this.widgetBus.rootPath e.g. === '/activeState'
        // itemsCollectionName === ['activeKeyMoments']
        // this.widgetBus.getExternalName('collection') === /activeState/activeKeyMoments
        //
        // widgetWrapper.widgetBus.rootPath e.g. this.widgetBus.rootPath.append('activeKeyMoments', i, 'keyMoment');
        // if it starts with itemsCollectionPath
        // then an integer index
        // then "keyMoment"
        const itemsCollectionPath = Path.fromString(this.widgetBus.getExternalName('collection'))
          , itemsCollectionName = itemsCollectionPath.parts.slice(this.widgetBus.rootPath.parts.length)
          , externalPath = externalName instanceof Path
                ? externalName
                : Path.fromString(externalName)
          ;
        // This is only required for draft mode!
        // However, the children of this element
        // will like this also not read from the
        // the 'keyMoment' ValueLink in the activeKeyMoment
        redirection:
        if(itemsCollectionPath.isRootOf(externalPath)) {
            const [index, ...rest] = externalPath.parts
                        .slice(itemsCollectionPath.parts.length)
                // NOTE: splice modifies rest and returns the removed elements
              , itemEntryMatchPath = Path.fromParts('.', ...rest.splice(0, this._itemEntryPath.parts.length))
              ;
            if(!this._itemEntryPath.equals(itemEntryMatchPath)) // this._itemEntryPath === 'keyMoment'
                break redirection;
            const rootElement = this.widgetBus.getEntry(this.widgetBus.rootPath)
                // "activeKey" is the name of the ForeignKey
                //
              , activeKey = getEntry(rootElement, Path.fromParts(...itemsCollectionName, index, 'activeKey')).value
              ;
            // TODO: /keyMoments is the original collection, Maybe we could trace
            // that using the Model and the ForeignKey as starting point,
            return getEntry(rootElement, Path.fromParts('keyMoments', activeKey, ...rest));
        }
        return this.widgetBus.getEntry(externalPath);
    }

    // NOTE: rootPath seems not used in this specific case!
    _createWrapper(rootPath) {
        const settings = {
                 rootPath: rootPath
               , relativeRootPath: Path.fromParts('.','keyMoment')
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = this._ChildrenContstructor
          , args = [this._zones]
          , childWidgetBus = Object.assign(Object.create(this._childrenWidgetBus), {
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
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}

class ExampleKeyMomentsController extends _BaseContainerComponent {
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


export {
    KeyMomentsModel
  , KeyMomentModel
  , ExampleKeyMomentsLayoutModel as Model
  , ExampleKeyMomentsController as Controller
};
