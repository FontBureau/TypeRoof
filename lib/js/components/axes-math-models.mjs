
import {
     zip
  , validateOpenTypeTagString
} from '../util.mjs';

import {
    Path
  , getDraftEntry
  , ForeignKey
  , unwrapPotentialWriteProxy
  , CoherenceFunction
  , StringModel
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
  , createAvailableTypes
  , createDynamicType
} from '../metamodel.mjs';

// START will be a module for calculateRegisteredKeyframes
/**
 * Array.from( cartesianProductGen([['a', 'b'], ['c', 'd']]) )
 * >>> [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']]
 *
 * No intermediate arrays are created.
 */
export function* cartesianProductGen([head, ...tail]) {
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

      // CAUTION: No need to inherit availableAxesMathItemTypes, the elements
      // are fixed, hence StaticDependency.createWithInternalizedDependency
      // it is, HOWEVER, the 'items' in the list models (AxesMathLocationsSumModel ? )
      // are dependent on this AxesMathItemModel and thus there's a circular
      // dependency.
      // The host model of this model will have to declare the StaticDependency
      // unless a way is developed to make this directly possible:
      //         ... StaticDependency.createWithInternalizedDependency(
      //                         'availableAxesMathItemTypes'
      //                       , AvailableAxesMathItemTypesModel
      //                       , availableAxesMathItemTypes
      //                       )
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
  , AxesMathAxisLocationsModel = _AbstractOrderedMapModel.createClass('AxesMathAxisLocationsModel'
            , AxesMathAxisLocationValueModel
            , { ordering: _AbstractOrderedMapModel.ORDER.KEYS_ALPHA
              , validateKeyFn: validateOpenTypeTagString
              }
    )
    // FIXME: This should not have to be be a struct, just directly an
    // AxesMathAxisLocationsModel can it be made possible?
    // _AbstractDynamicStructModel expects a struct and can then nicley
    // relay the API, but maybe an _AbstractDynamicModel can be created with
    // just a list of allowed types, the API would have to be called
    // via `.wrapped`.
    // CAUTION: This is, unless there are more properties to be added to
    // this type and looking at it that way, if the implementation settles
    // there will still be time to make this more efficient with the
    // approach above. One case for a broader implementation could be
    // a comparison with ManualAxesLocationsModel which also has
    // autoOPSZ and a coherence funtion, but at the moment that doesn't
    // make sense. One other thought is that this could become a
    // more general KeyMomentsMath, but I don't have a use case in mind
    // yet either.
  , AxesMathLocationModel = _BaseAxesMathItemModel.createClass(
        'AxesMathLocationModel'
      , ['axesLocations', AxesMathAxisLocationsModel]
    )
  , AxesMathAxisLocationValuesModel = _AbstractListModel.createClass(
        'AxesMathAxisLocationValuesModel'
      , AxesMathAxisLocationValueModel
    )
    // An ordered map of axisTag: [list of LocationValue]. Not actually a set :-(
  , AxesMathLocationValuesMapModel = _AbstractOrderedMapModel.createClass(
        'AxesMathLocationValuesMapModel'
      , AxesMathAxisLocationValuesModel
      , { validateKeyFn: validateOpenTypeTagString }
    )
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
  , [availableAxesMathItemTypes, AXES_MATH_ITEM_TYPE_TO_KEY] =
        createAvailableTypes(AvailableAxesMathItemTypesModel, [
                ['LocationsSum', 'Collection', AxesMathLocationsSumModel]
              , ['LocationsProduct', 'Product', AxesMathLocationsProductModel]
              , ['Location', 'Location', AxesMathLocationModel]
        ])
  ;
export function createAxesMathItem(typeKey, dependencies) {
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

              // This used to "burn" the draft, so it couldn't get
              // metamorphosed again. Because metamorphose either returns
              // the item itself, but now immutable OR the OLD immutable
              // that was the base for the draft if there was no change.
              // BUT when it returned the OLD_STATE it also changed the
              // draft so that metamorphose couldn't run again. Hence,
              // other references of the draft couldn't use it's metamorphose
              // again. This is fixed now, but it seems, maybe, in this
              // case relying on the PotentialWriteProxy method (or similar)
              // and having the change propagate back up to the source
              // could be a good (better) solution as well.
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
    const absLocations = [];
    for(const location of symbolicLocations) {
        const resultLocation = [];
        for(const [axisTag_, locationValue] of location) {
            const resultAxis = []
                // From an OpenType font a tag with less then
                // four chars is filled up to four chars with spaces
                // in order to match those axes we need to fill up our
                // own tags as well.
              , axisTag = `${axisTag_}    `.slice(0, 4)
              ;
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

const GENERATED_DATA = Symbol.for("GENERATED_DATA");
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
    // Entry 0 is the property-setting keyMoment: it carries actor specific
    // settings (user data) and must be serialized. Entries 1+ are
    // animation-driving keyMoments generated from axesMath; the
    // GENERATED_DATA marker omits them from serialization, they are
    // re-created on load.
    // NOTE: when copy/paste of actors between layouts is implemented
    // (e.g. to motion-stage, where keyMoments are user-editable), the
    // markers must be stripped when the actor leaves the videoproof
    // layout, otherwise the other layout would silently not serialize
    // this data. See copyToDraft in presets.mjs for the stripping pattern.
    for(const keyMoment of newKeyMoments.slice(1))
        keyMoment[GENERATED_DATA] = 'axesMath';
    keyMoments.splice(0, Infinity, ...newKeyMoments);
}
//function _updateKeyMomentsAxesLocationsFromLocations(keyMoments, locationsIter) {
// }
export function* applyAxesMathLocations(videoproofActor, axesMath, installedFonts
        , globalFont, duration) {
    const symbolicLocations = Array.from(toLocationsGen(axesMath))
      , absoluteLocationsPerFont = new Map()
      , _setFont = (map, font, symbolicLocations)=>{
            const absLocations = _toAbsoluteLocations(font.value.axisRanges, symbolicLocations);
            map.set(font, absLocations);
        }
      , getAbsLocations= font=>{
            if(!absoluteLocationsPerFont.has(font))
                _setFont(absoluteLocationsPerFont, font, symbolicLocations);
            return absoluteLocationsPerFont.get(font)
        }
      , resetLocations = [[]]// the inner array is essentially an empty first keyMoment
      ;
    if(videoproofActor.hasOwn('activeActors')) {
        const activeActors = videoproofActor.getDraftFor('activeActors');
        for(const k of activeActors.ownKeys()) {
            const instance = getDraftEntry(activeActors, Path.fromParts(k, 'instance'))
              , keyName = 'localActiveFontKey'
              , keyValue = instance.get(keyName)
              ;
            const foreignKey = instance.wrapped.constructor.foreignKeys.get(keyName)
                // Seems like font may not always be loaded yet.
                // This is because the new dependencies are not propagated yet.
                // The font is already available in installedFonts
                // > instance.get('font');
                //    Uncaught (in promise) Error: KEY ERROR "from-file Roboto Flex Regular Version_3-000 gftools_0-9-32_" not found.
              ;
            // Because of the special role of the coherence functions, there
            // seems to be no better way than to execute the key constraint
            // here in order to load missing fonts. Ideally this could be
            // taken care of by the general metamorphoseGen of the struct.
            // It should not be too expensive however, fonts are not loaded
            // more often this way, it's just a way to get the font before
            // the linking is fully finished.
            if(keyValue.value !== ForeignKey.NULL && !installedFonts.has(keyValue.value)) {
                const keyMaybeGen = foreignKey.constraint(installedFonts, keyValue.value);
                keyValue.value =  keyMaybeGen.next instanceof Function
                            ? yield* keyMaybeGen
                            : keyMaybeGen
                            ;
            }
            const isLocalFont = keyValue.value !== ForeignKey.NULL
              , font = isLocalFont
                        ? unwrapPotentialWriteProxy(installedFonts.get(keyValue.value))
                        : globalFont
              ;
            // always a loop, must be in sync with videoproofActor
            instance.get('isLoop').value = true;
            const absLocations = isLocalFont
                    ? getAbsLocations(font)
                    : resetLocations // use inheritance from global font
              , keyMoments = instance.getDraftFor('keyMoments')
              ;
            _updateKeyMomentsAxesLocationsFromLocations(keyMoments, absLocations.length ? absLocations : resetLocations);
        }
    }
    const absLocations = getAbsLocations(globalFont)
      , keyMoments = videoproofActor.getDraftFor('keyMoments')
      , labels = _toLabelsForSymbolicLocations(symbolicLocations)
      ;
    _updateKeyMomentsAxesLocationsFromLocations(keyMoments, absLocations.length ? absLocations : resetLocations, labels);
    // TODO: add  "Per Keyframe Duration" setting
    duration.value = keyMoments.size * 2;
}

// END Axes Math

export function setAxisLocationValue(axisLocationValue, locationRawValue) {
    if(typeof locationRawValue === 'string')
        axisLocationValue.get('logicalValue').value = locationRawValue;
    else if(typeof locationRawValue === 'number') {
        axisLocationValue.get('logicalValue').value = 'number';
        axisLocationValue.get('numericValue').value = locationRawValue;
    }
    else
        throw new Error(`TYPE ERROR don't know how to handle ${typeof locationRawValue }.`);
}
