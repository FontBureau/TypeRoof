
import {
    validateOpenTypeTagString
} from '../util.mjs';

import {
    Path
} from '../metamodel.mjs';

import {
    availableAxesMathItemTypes,
    createAxesMathItem,
    setAxisLocationValue
} from './axes-math-models.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
} from './basics/component.mjs';

import {
    _UIBaseMap
} from './basics/ui-map.mjs';

import {
    _UIBaseList
  , _UIBaseListContainerItem
} from './basics/ui-list.mjs';

import {
    Collapsible
  , WasteBasketDropTarget
} from './generic.mjs';

import {
    DATA_TRANSFER_TYPES
} from './data-transfer-types.mjs';

import {
    SelectAndDragByOptions
} from './layouts/motion-stage.mjs';

import {
    binarySearch
} from './animation-fundamentals.mjs';

import './axes-math-location-value.css'

/*
 * Requires a dropdown, to choose the logicalValue from a select
 * or enter a number if logicalValue === 'number'
 * Then also a handle to re-order.
 */
export class UIAxesMathLocationValue extends _UIBaseList.UIItem {
    static ROOT_CLASS = `ui-axes_math-location_value`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH;

    static TEMPLATE = `<div
        tabindex="0"
        ><!-- insert: label-element --><!-- insert: drag-handle --><select
                required
        ></select><input
                type="number"
                step="0.01"
                size="5"
        /><output>(UNINITIALIZED)</output></div>`;
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

        element.addEventListener('focusin', () => element.classList.add('focus'));
        element.addEventListener('focusout', e => {
            if (!element.contains(e.relatedTarget)) {
                element.classList.remove('focus');
            }
        });

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
export class UIAxesMathLocationValues extends _UIBaseList {
    static ROOT_CLASS = `ui-axes_math-location_values`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UIAxesMathLocationValue; // extends _UIBaseList.UIItem
    static ITEM_DATA_TRANSFER_TYPE_PATH = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH;
    static ITEM_DATA_TRANSFER_TYPE_CREATE = DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_CREATE;
    DROP_INSERT_DIRECTION = _UIBaseList.DROP_INSERT_DIRECTION_HORIZONTAL;

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
    static ROOT_CLASS = `ui_axes_math-map`
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS]
    static UIKeyCreate = UIAxesMathAxisTagCreate;
    static UIKeyChange = UIAxesMathAxisTagChange;
    static KEY_ADD_BUTTON_LABEL = 'add tag';
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

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false, deletable=false) {
        super(widgetBus, _zones, eventHandlers, draggable, deletable);
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
            this._destroyWidget(wrapper);
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
          , zones = new Map([..._zones, ['main', childrensMainZoneElement]])
          ;
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
    static TEMPLATE = `<div class="ui_key_moments_link_navigation">
<h4 class="ui_key_moments_link_navigation-label"><!-- insert: label --></h4>
<ol class="ui_key_moments_link_navigation-list"></ol>
</div>`;
    static ITEM_TEMPLATE = `<li class="ui_key_moments_link_navigation-list_item"
    ><a class="ui_key_moments_link_navigation-list_item-input"
        ><!-- insert: label --></a></li>`;
    constructor(widgetBus, label=null) {
        super(widgetBus);
        this._inputToKey = new Map();
        this._keyToElement = new Map();
        this._currentKeyMoments = null;
        this._currentKeyMomentsSecondAndLast = [null, null];
        [this.element, this._list] = this._initTemplate(label);
    }
    _initTemplate(label=null) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , list = element.querySelector('.ui_key_moments_link_navigation-list')
          ;
        if(label !== null)
            this._domTool.insertAtMarkerComment(element, 'insert: label',
                this._domTool.createElement('h4', {class: 'ui_key_moments_link_navigation'}, label));

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
                throw new Error(`ASSERTION FAILED: unknown state right "${right}" shoud be ${momentTs.length - 1}.`);

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
    constructor(widgetBus, _zones, label, updateDefaultsDependencies, keyMomentsOptions=null) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_axes_math'})
          , contentsZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['main', localZoneElement], ['contents', contentsZoneElement]])
          , _keyMomentsDefaultOptions = {zone: 'contents', label: 'Key Moments'}
          , _keyMomentsOptions = keyMomentsOptions === null
                ? _keyMomentsDefaultOptions
                : {..._keyMomentsDefaultOptions, ...keyMomentsOptions}
          ;
        super(widgetBus, zones);
        this._insertElement(localZoneElement);

        const widgets = [
            [
                {zone: 'main'}
              , []
              , Collapsible
              , label
              , contentsZoneElement
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
                    zone: 'contents'
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
                    zone: 'contents'
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
                    zone: 'contents'
                }
              , []
                // FIXME: deleting the top level collection creates an error
                // should probably rather create an empty collection.
                // FIXME2: the empty collection creates the initial fixture
                //         of content items into the collection
              , WasteBasketDropTarget
              , 'Drop here to delete'
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
                {zone: _keyMomentsOptions.zone}
              , [
                    [this.widgetBus.getExternalName('keyMoments'), 'keyMoments']
                  , ['../font', 'font']
                  , 'duration'
                  , 't'
                    // inject animationProperties@
                  , ...updateDefaultsDependencies
                ]
              , UIKeyMomentsLinkNavigation
              , _keyMomentsOptions.label
            ]
        ];
        this._initWidgets(widgets);
    }
}
