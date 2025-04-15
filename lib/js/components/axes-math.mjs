
import {
     zip
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

import {
    _BaseComponent
  , _BaseContainerComponent
  , _UIBaseMap
  , _UIBaseList
  , _UIBaseListContainerItem
} from './basics.mjs';

import {
    collapsibleMixin
  , StaticTag
  , WasteBasketDropTarget
} from './generic.mjs';

import {
    DATA_TRANSFER_TYPES
} from './data-transfer-types.mjs';

import {
    SelectAndDragByOptions
} from './layouts/stage-and-actors.mjs';

 import {
    binarySearch
 }  from './animation-fundamentals.mjs';

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

// START Axes Math

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
      // it is, HOWEVER, the 'items' in the list models (AxesMathLocationsSumModel ? )
      // are dependent on this AxesMathItemModel and thus there's a circular
      // dependency.
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
  , AxesMathAxisLocationValuesModel = _AbstractListModel.createClass('AxesMathAxisLocationValuesModel'
            , AxesMathAxisLocationValueModel
            , { validateKeyFn: validateOpenTypeTagString }
    )
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
export function* applyAxesMathLocations(videoproofArray, axesMath, installedFonts
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
 * Requires a dropdown, to choose the logicalValue from a select
 * or enter a number if logicalValue === 'number'
 * Then also a handle to re-order.
 */
class UIAxesMathLocationValue extends _UIBaseList.UIItem {
    static ROOT_CLASS = `ui-axes_math-location_value`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH;

    // jshint ignore: start
    static TEMPLATE = `<div
        tabindex="0"
        ><!-- insert: drag-handle --><select
                required
        ></select><input
                type="number"
                step="0.01"
                size="5"
        /><output>(UNINITIALIZED)</output></div>`;
    // jshint ignore: end
    _initTemplate() {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , selectLogicalValue = element.querySelector('select')
            , inputNumericValue = element.querySelector('input[type=number]')
            , output = element.querySelector('output')
            , valueType = this.getEntry('value').constructor
            , logicalValueType = valueType.fields.get('logicalValue')
            , numericValueType = valueType.fields.get('numericValue').Model // is OrEmpty!
            , options = []
            ;

        this._setClassesHelper([
                [selectLogicalValue, 'logical_value']
              , [inputNumericValue, 'numeric_value']
              , [output, 'output']
        ]);

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

        this._insertElement(element);
        return {
            element
          , _selectLogicalValue:selectLogicalValue
          , _inputNumericValue: inputNumericValue
          , _output: output
        };
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
class UIAxesMathLocationValues extends _UIBaseList {
    static ROOT_CLASS = `ui-axes_math-location_values`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UIAxesMathLocationValue; // extends _UIBaseList.UIItem
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH;
    static ITEM_DATA_TRANSFER_TYPE_CREATE = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE;
    static DROP_INSERT_DIRECTION = _UIBaseList.DROP_INSERT_DIRECTION_HORIZONTAL;

    _createNewItem(targetPath, insertPosition, items, value) {
        const newItem = items.constructor.Model.createPrimalDraft(items.dependencies)
        // Not required if "default" is the value as that is the default already.
        setAxisLocationValue(newItem, value);
        return newItem;
    }
}

const _UIAxesMathAxisTagOptions = {
    rootClass: 'ui_axes_math-axis_tag'
  , inputAttributes:{
        minlength: '1'
      , maxlength:'4'
      , size:'4'
      , pattern:'[A-Za-z]{1}[A-Za-z0-9]{0,3}'
    }
};

class UIAxesMathAxisTagCreate extends _UIBaseMap.UIKeyCreate /* is UIBaseMapKeyCreate*/ {
    constructor(widgetBus, eventHandlers, options={}, ...args) {
        const _options = {..._UIAxesMathAxisTagOptions, ...options};
        super(widgetBus, eventHandlers, _options, ...args);
    }
}
class UIAxesMathAxisTagChange extends _UIBaseMap.UIKeyChange /* is UIBaseMapKeyChange */{
    constructor(widgetBus, eventHandlers, options={}, ...args) {
        const _options = {..._UIAxesMathAxisTagOptions, ...options};
        super(widgetBus, eventHandlers, _options, ...args);
    }
}

class _UIBaseAxesMap extends _UIBaseMap {
    // jshint ignore: start
    static ROOT_CLASS = `ui_axes_math-map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS]
    static UIKeyCreate = UIAxesMathAxisTagCreate;
    static UIKeyChange = UIAxesMathAxisTagChange;
    static KEY_ADD_BUTTON_LABEL = 'add tag';
    // jshint ignore: end
    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if(!valid)
            return [valid, message];
        return validateOpenTypeTagString(key);
    }
}

class UIAxesMathLocationsProduct extends _UIBaseAxesMap {
    static TYPE_CLASS_PART = 'product';
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUES_KEY_PATH;

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

    _createKeyValue(childrenOrderedMap) {
        const value = childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
        // In most cases it should be in the interest of the user to create
        // a pre-filled list with one element, to require one less click.
          , axisLocationValue = value.constructor.Model.createPrimalDraft(value.dependencies)
          ;
        // not required, "default" is the default already.
        // setAxisLocationValue(axisLocationValue, 'default');
        value.push(axisLocationValue);
        return value;
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
export class UIAxesMathLocation extends _UIBaseAxesMap {
    static TYPE_CLASS_PART = 'location';
    // NOTE: the model has an inherent ordering
    static VISUAL_ORDER_STRATEGY = _UIBaseAxesMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_DATA_TRANSFER_TYPE = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_KEY_PATH;

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
           // FIXME: Dragable should maybe be configurable, applies only to the
           // value, not to the key-value item.
           // In the Rap-Editor this enables e.g. dragging the value into
           // an AxisMath Product
           // TODO: However, as in the Location there's only one item we
           // could be smarter about this, the handle for the key could e.g.
           // also set the transfer type of the value, hence the receiver
           // could decide how to use the drop and we would have one
           // less drag-handle.
           // The behavior of dropping one of these onto a UIAxesMathLocationValues
           // is moving/deleting the whole entry, there's no empty entry
           // NOTE also: UIAxesMathLocationValues itself as item of
           // UIAxesMathLocationsProduct is itself not dragable.
          , dragable = true
          , args = [dropEventHandlers, dragable]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }
}


/**
 * This can't be a _UIBaseList.UIItem as we're looking for a container
 * Inspired by UIStylePatch
 *
 * NOTE: in this particular case we must change ITEM_DATA_TRANSFER_TYPE_PATH
 * depending on the type of the item!
 *  - LocationsSum:
 *  - LocationsProduct:
 *  - Location:
 */
class UIAxesMathLocationsSumItem extends _UIBaseListContainerItem {
    static ROOT_CLASS = `ui-axes_math-locations`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = 'sum_item';
    // "These are "atomic" AXESMATH items, "Sum", "Product", and "Location""
    // originally all of UIAxesMathLocationsProduct UIAxesMathLocation UIAxesMathLocationsSum
    // set these on dragstart for themselves.
    // but that will be replaced by this.
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH;

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false) {
        super(widgetBus, _zones, eventHandlers, draggable);
        this._currentTypeKey = null;
    }

    _createWrapperForType(typeKey) {
        const settings = {
               // document/nodes/{key}
               rootPath: this.widgetBus.rootPath.append('instance')
             , zone: 'local'
            }
          , dependencyMappings = []
          ;

        let Constructor
          , args
          ;

        const eventHandlers = []
          , typeLabel =  availableAxesMathItemTypes.get(typeKey).get('label').value
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
                dependencyMappings.push(['axesLocationValuesMap', 'childrenOrderedMap']);
                {
                    const dregEntries = true;
                    args = [this._zones, eventHandlers, typeLabel, dregEntries];
                }
                break;
            case 'Location':
                Constructor = UIAxesMathLocation;
                dependencyMappings.push(['axesLocations', 'childrenOrderedMap']);
                {
                    // NOTE: if model is ordering, same source drops should
                    // be prevented (they have no effect though, just misleading UI)
                    // however, drag and drop to move to another target or
                    // to delete are still required. This is not the right
                    // flag to prevent same source drops.
                    const dregEntries = true;
                    args = [this._zones, eventHandlers, typeLabel, dregEntries];
                }
                break;
            default:
                throw new Error(`UNKOWN TYPE ${typeKey} in ${this}`);
        }
        return [
            settings
          , dependencyMappings
          , Constructor
          , ...args
        ];
    }

    _createWrappersForType(typeKey) {
        const widgets = [
                // Done within the items, as some require a tabIndex and
                // that receives focus when clicking on label
                //[
                //    {zone: 'local'}
                //  , []
                //  , StaticTag
                //  , 'span'
                //  , {'class': `typeroof-ui-label ${this.BASE_CLASS}-label`}
                //  , availableAxesMathItemTypes.get(typeKey).get('label').value
                //],
                this._createWrapperForType(typeKey)
            ]
        , widgetWrappers = []
        ;

        for(const [settings, dependencyMappings, Constructor, ...args] of widgets) {
            const widgetWrapper = this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
            widgetWrappers.push(widgetWrapper);
        }
        return widgetWrappers;
    }

    _provisionWidgets(/* compareResult */) {
        const node = this.getEntry('.')
          , typeKey = node.get('axesMathItemTypeKey').value
          ;
        if(this._currentTypeKey === typeKey)
            return new Set();
        this._currentTypeKey = typeKey;
        const newWrappers = this._createWrappersForType(typeKey)
          , deleted = this._widgets.splice(0, Infinity, ...newWrappers)
          ;
        for(const wrapper of deleted)
            wrapper.destroy();
        return super._provisionWidgets();
    }
}
class UIAxesMathLocationsSum extends _UIBaseList {
    static ROOT_CLASS = `ui_axes_math-locations_sum`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UIAxesMathLocationsSumItem; // SEE FIXME comment above.

    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH;
    static ITEM_DATA_TRANSFER_TYPE_CREATE = DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE;
    constructor(widgetBus, _zones, childrenSettings, eventHandlers=[], label=null) {
        const labelElement = label ? widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label) : null
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {})
          , localZoneElement = widgetBus.domTool.createElement('div', {} ,[])
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        localZoneElement.append(childrensMainZoneElement);
        super(widgetBus, zones, 'main');
        if(label)
            this.element.append(labelElement);
        this.element.append(childrensMainZoneElement);

        this._setClassesHelper([
                ...(label ? [[labelElement, 'label']] : [])
              , [childrensMainZoneElement, 'items']
        ]);

        for(const args of eventHandlers)
            this.element.addEventListener(...args);

        this._childrenSettings = childrenSettings;
    }

    _createNewItem(targetPath, insertPosition, items, value) {
        return createAxesMathItem(value, items.dependencies)
    }
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

/**
 * This may be eventually have some similarity to UIVideoproofArrayLayers
 * as it will also likely have some drag-drop based interface.
 */
export class UIAxesMath extends _BaseContainerComponent {
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
              , [] // eventHandlers
              , null//label
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
