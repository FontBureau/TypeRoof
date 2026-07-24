import {
    Path
} from '../../metamodel.mjs';

import {
    createIcon
} from '../icons.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , SimpleProtocolHandler
} from './component.mjs';

import {
    _setClassesHelperMethod
} from './dom-helpers.mjs';

import {
    UIButton
} from './ui-button.mjs';

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

export class UIBaseMapKey extends _BaseComponent {
    static BASE_CLASS = 'ui_base_map-key'
    constructor(widgetBus, eventHandlers, options={/*rootClass:null, inputAttributes:{}, labelContent: ''*/}) {
        super(widgetBus);
        [this.element, this._input] = this._initTemplate(eventHandlers, options);
        this.reset();
    }

    static TEMPLATE = `<label
        ><!-- insert: label--><input
            type="text"
            minlength="1"
            /></label>`;

    _initTemplate(eventHandlers, options) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , input = element.querySelector('input')
            , baseClasses = [this.constructor.BASE_CLASS]
            ;
        if(options.rootClass)
            baseClasses.push(options.rootClass)
        for(const baseClass of baseClasses) {
            element.classList.add(baseClass);
            input.classList.add(`${baseClass}-input`)
        }
        if(options.inputAttributes) {
            for(const [attr, value] of Object.entries(options.inputAttributes))
                input.setAttribute(attr, value);
        }
        for(const [event, fn, ...args] of eventHandlers)
            input.addEventListener(event, fn, ...args);
        if(options.labelContent)
            this._domTool.insertAtMarkerComment(element, 'insert: label', options.labelContent);
        this._insertElement(element);
        return [element, input];
    }

    isFocused() {
        return this._input === this._domTool.document.activeElement;
    }

    focus() {
        this._input.focus();
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

    set value(value) {
        this._input.value = value;
    }

    set display(value) {
        this.element.style.display = value ? '' : 'none';
    }
}

export class UIBaseMapKeyAddButton extends UIButton {
    static TYPE_CLASS_PART = 'add_button';
    constructor(widgetBus, label, eventHandlers = [],
        _options = { title: null, classPart: null, elementAttributes: [] }
    ) {
        const options = {
            ..._options,
            typeClassPart: new.target.TYPE_CLASS_PART
        };
        super(widgetBus, label, eventHandlers, options);
    }
}

// for the classes/input setup

export class UIBaseMapKeyCreate extends UIBaseMapKey{};
// for the classes/input setup
export class UIBaseMapKeyChange extends UIBaseMapKey {
    constructor(widgetBus, eventHandlers, ...args) {
        super(widgetBus, eventHandlers, ...args);
        this._lastValue = null;
    }
    _initTemplate(eventHandlers, ...args) {
        const  [element, input] = super._initTemplate(eventHandlers, ...args);
        // When we lose focus we reveal the actual value, which ideally
        // is the same, but the editing value could be not accepted.
        input.addEventListener('blur', ()=>{
            if(this._lastValue !== null)
                this._input.value = this._lastValue;
            this._lastValue = null;
        });
        return  [element, input];
    }
    update(changedMap) {
        if(changedMap.has('key@')) {
            // key@.value is just a string
            // Don't update if we're currently editing! It will
            // change the cursor and be disturbing.
            if(!this.isFocused())
                this._input.value = changedMap.get('key@').value;
            // this way we can differentiate between the current value
            // of the input element and the offical last key/tag, which
            // will be usefult to decide whether to keep the element around.
            this._lastValue = changedMap.get('key@').value;
        }
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
export class _UIBaseMap extends _BaseDynamicCollectionContainerComponent {
    static ROOT_CLASS = `ui_base_map`;
    static BASE_CLASSES = [];
    static UIKeyCreate = UIBaseMapKeyCreate;
    static UIKeyChange = UIBaseMapKeyChange;
    static UIKeyAddButton = UIBaseMapKeyAddButton;
    static KEY_ADD_BUTTON_LABEL = 'add item';
    // Don't do anyting.
    static VISUAL_ORDER_STRATEGY_NATURAL = Symbol('VISUAL_ORDER_STRATEGY_NATURAL');
    // Display alphabetic order
    static VISUAL_ORDER_STRATEGY_ALPHA = Symbol('VISUAL_ORDER_STRATEGY_ALPHA');

    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }
    static get VISUAL_ORDER_STRATEGY() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static VISUAL_ORDER_STRATEGY`);
    }
    static get KEY_DATA_TRANSFER_TYPE() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static KEY_DATA_TRANSFER_TYPE`);
    }

    // This is to drag the map itself, if it is null, dragging of the map is turned off.
    static ITEM_DATA_TRANSFER_TYPE = null;

    _createWrapperValue(keyId, key) {
        throw new Error(`NOT IMPLEMENTED ${this}._createWrapperValue (for keyId: "${keyId}" key: "${key}").`);
    }

    constructor(widgetBus, _zones, eventHandlers, label=null, dragEntries=false) {
        const labelElement = label && widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label)
          , dragHandleElement = widgetBus.domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, createIcon('drag_pan'))
            // , deleteButton ??? maybe we can just use the trash/drag-and-drop for the top level items
            // How to add the new tag? drag and drop? plus "+" button to appen (I like this,
            // it can blur when tag is invalid!
          , toolsElement = widgetBus.domTool.createElement('div', {'class':'tools'})
          , childrensMainZoneElement = widgetBus.domTool.createElement('ol')
          , localZoneElement = widgetBus.domTool.createElement('div', {'tabindex':'0'}
              , [
                    dragHandleElement
                  , ...(label ? [labelElement] : [])
                  , toolsElement
                  , childrensMainZoneElement
                ]
            )
          , zones = new Map([..._zones, ['local', localZoneElement], ['tools', toolsElement], ['main', childrensMainZoneElement]])
          ;

        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('key@', {treatAdressAsRootPath: false}));
        super(widgetBus, zones);
        // used for _validateKeyString
        this.MapModel = this.getEntry('childrenOrderedMap')?.constructor || null;
        const isDraggable = this.constructor.ITEM_DATA_TRANSFER_TYPE !== null;
        if(!isDraggable)
            dragHandleElement.remove();
        // CAUTION/FIXME: when the model has an internal ordering it's not correct
        //        to turn off all dragAndDrop:
        //          * drag to trash to delete should work
        //          * drop to copy/move from a foreign target should work
        //          * drag and drop to re-order should not work
        // In fact controlling drag and drop may require fine grained settings.
        // E.g. in the case above, only same-source-drops should be denied.
        //      but also, same source drop doesn't do any harm if it is on,
        //      it just should not mislead the user by displaying a drop-target indicator.
        const orderStrategy = dragEntries
                  // Can't allow anything else, as it doesn't make much
                  // sense in this case, where the order is determined
                  // by dragAndDrop UI.
                  // NOTE ALSO: despite of dragAndDrop being true or not
                  // the _AbstractOrderedMap can (and does sometimes)
                  // define an internal ordering method. In that case
                  // drag and drop ordering doesn't make much sense and
                  // visual ordering in here does not change the actual
                  // data order.
                ? _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL
                : this.constructor.VISUAL_ORDER_STRATEGY || _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL
                ;
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
              , VISUAL_ORDER_STRATEGY: {
                    value: orderStrategy
                }
                // Adds drag-handles and event-handlers to the key-value
                // items. This is not about handling of drops.
              , DRAG_ENTRIES: {
                    value: !!dragEntries
                }
        });

        this._setClassesHelper([
                [localZoneElement]
              , ...(label ? [[labelElement, 'label']] : [])
              , ...(isDraggable ? [[dragHandleElement, 'drag_handle']] : [])
              , [toolsElement, 'tools']
              , [childrensMainZoneElement, 'items']
        ]);

        if(isDraggable) {
            for(const args of [
                        ['dragstart', this._dragstartHandler.bind(this)]
                      , ['dragend', this._dragendHandler.bind(this)]
                    ]) {
                dragHandleElement.addEventListener(...args);
            }
        }
        for(const args of eventHandlers)
            localZoneElement.addEventListener(...args);

        const wrapChildrenContainerHandler = fn=>{
            return event=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('childrenOrderedMap'))
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
            const widgets = this._initialWidgets;
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets);
        }
        this._removeDragIndicatorTimeoutId = null;
    }

    get _initialWidgets() {
        // By overwriting this getter, a sub-class can extend initialWidgets
        // within the constructor `super(...)` and fully use the `this` keyword.
        const widgets = [
            [
                {   zone: 'tools'
                  , id: 'key-create-input'
                }
              , []
              , this.constructor.UIKeyCreate
              , [
                    ['input', this._keyCreateInputHandler.bind(this)]
                  , ['keyup', event=>{if (event.key === 'Enter') {this._keyCreateSubmitHandler(event)}}]
                ]
            ]
          , [
                {   zone: 'tools'
                  , id: 'key-add-button'
                }
              , []
              , this.constructor.UIKeyAddButton
              , this.constructor.KEY_ADD_BUTTON_LABEL
              , [
                    ['click', this._keyCreateSubmitHandler.bind(this)]
                ]
            ]
        ];
        return widgets;
    }

    _createWrapperKey(keyId, index) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                zone: keyId
            }
          , dependencyMappings = [[keyId, 'key@']]
          , Constructor = this.constructor.UIKeyChange
          , eventHandlers = [
                    ['input', this._keyChangeHandler.bind(this, index)]
                  , ['blur', this._keyBlurHandler.bind(this, index)]
            ]
          , args = [eventHandlers]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _dragstartHandler(event) {
        if(this.constructor.ITEM_DATA_TRANSFER_TYPE === null)
            throw new Error(`MISCONFIGURATION attempting to drag ${this} but ITEM_DATA_TRANSFER_TYPE is not configured.`);
        const path = this.widgetBus.rootPath.parent; // use parent to remove "./instance"
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."

        event.dataTransfer.setData(this.constructor.ITEM_DATA_TRANSFER_TYPE, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${this.constructor.ITEM_DATA_TRANSFER_TYPE}: ${path}]`);
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

    _validateKeyString(key) {
        if(typeof key !== 'string')
            return [false, `Key must be string but is typeof ${typeof key}.`];
        // why not allow empty string?
        if(key.length < 1)
            return [false, `Key must be at least 1 char long but key.length is ${key.length}. Tag: "${key}".`];

        if(this.MapModel && this.MapModel.validateKey)
            return this.MapModel.validateKey(key);
        return [true, null];
    }

    #REDIRECT_LAST_KEY = Symbol('REDIRECT_LAST_KEY');
    async _keyChangeHandler(index, event) {
        event.preventDefault();
        const key = event.target.value.trim()
          , [valid, message] = this._validateKeyString(key)
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
            const childrenOrderedMap = this.getEntry('childrenOrderedMap');
            if(childrenOrderedMap.has(key)) {
                inputWidget.setCustomValidity(`Key "${key}" already exists.`);
                return;
            }
            // Do we know the old key? if the childrenOrderedMap is re-ordering
            // itself, we want to redirect the change to the original key!
            // i.e. the input has only the mandate to change the key it is
            // originally representing. And, it should also survive while
            // the key is changing in that case thr ui-element may not
            // display the right information in order to not disrupt the
            // typing/input focus.
            if(childrenOrderedMap.constructor.ORDERING !== null) {
                // may require redirection (not on the first change though)
                // we detect the first edit if the key at index is the same
                // as the original key of the inputWidget
                if(inputWidget.isFocused()) {
                    const oldTargetKey = inputWidget[this.#REDIRECT_LAST_KEY];
                    if(oldTargetKey !== undefined) {
                        const targetIndex = childrenOrderedMap.indexOfKey(oldTargetKey);
                        if(targetIndex === -1) {
                            inputWidget.setCustomValidity(`Lost (moving) target redirection "${oldTargetKey}" no longer found.`);
                            // maybe we should rather directly remove focus
                            return;
                        }
                        index = targetIndex;
                    }
                    inputWidget[this.#REDIRECT_LAST_KEY] = key;
                }
            }
            inputWidget.setCustomValidity('');
            const value = childrenOrderedMap.getIndex(index);
            childrenOrderedMap.arraySplice(index, 1, [key, value]);
        });
    }

    _keyBlurHandler(index/*, event*/) {
        const {keyId, widgetWrapper} = this._keySlots[index]
          , inputWidget = widgetWrapper.widget
          , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , key = keyProtocolHandler.getRegistered(keyId).value
          ;
        delete inputWidget[this.#REDIRECT_LAST_KEY];
        if(this._postponedKeyIdOrder !== null) {
            this._reorderContainers(this._postponedKeyIdOrder);
            this._postponedKeyIdOrder = null;
        }
        // Restore if we missed something (though I think the issue that
        // made this necessary is fixed).
        inputWidget.value = key;
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
        event.dataTransfer.setData('text/plain', `[TypeRoof ${this.constructor.KEY_DATA_TRANSFER_TYPE}: ${path}]`);
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

    // TODO: could be renamed as it's also used with a Select input
    // in UINodeSpecToTypeSpecLinksMap, however, it's the same method.
    _keyCreateInputHandler(/*event*/) { // on input
        // if key is invalid: set key-add-button passive else set active
        // TODO: also tap into the validation state of the field
        // passive
        const addButton = this.getWidgetById('key-add-button')
          , inputWidget = this.getWidgetById('key-create-input')
          , key = inputWidget.value.trim()
          , [valid, message] = this._validateKeyString(key)
          ;
        if(!valid) {
            addButton.passive = true;
            inputWidget.setCustomValidity(message);
            return;
        }
        const childrenOrderedMap = this.getEntry('childrenOrderedMap');
        if(childrenOrderedMap.has(key)) {
            addButton.passive = true;
            // set validation to false
            inputWidget.setCustomValidity(`Key "${key}" already exists.`);
            return;
        }
        // set  validation to good...
        addButton.passive = false;
        inputWidget.setCustomValidity("");
    }

    async _keyCreateSubmitHandler(event) {
        event.preventDefault();
        const addButton = this.getWidgetById('key-add-button')
          , inputWidget = this.getWidgetById('key-create-input')
          , key = inputWidget.value.trim()
          , [valid, message] = this._validateKeyString(key)
          ;
        if(!valid) {
            addButton.passive = true;
            inputWidget.setCustomValidity(message);
            return;
        }
        return await this._changeState(()=>{
            const childrenOrderedMap = this.getEntry('childrenOrderedMap');
            if(childrenOrderedMap.has(key)) {
                inputWidget.setCustomValidity(`Key "${key}" already exists.`);
                return;
            }
            const value = this._createKeyValue
                  // Extent for more complex cases.
                ? this._createKeyValue(childrenOrderedMap)
                  // simple cases
                : childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
                ;
            childrenOrderedMap.push([key, value]);
            inputWidget.reset();
            this._onItemCreated(key);
        });
    }

    // If implemented called within a _changeState transaction,
    // with the new key as argument:
    // this._onItemCreated(key)
    _onItemCreated(/*key*/){};

    _provisionWidgets() {
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
          , childrenOrderedMap = this.getEntry('childrenOrderedMap')
          , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , rootPath = Path.fromString(this.widgetBus.getExternalName('childrenOrderedMap'))
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
            if(childrenOrderedMap.has(key))
                continue;
            // delete
            const widgetWrapper = this._locationSetWidgets.get(key);
            this._destroyWidget(widgetWrapper);
            this._locationSetWidgets.delete(key);
        }
        // delete keys
        for( const {keyId, widgetWrapper, unregister} of
                this._keySlots.splice(childrenOrderedMap.size, Infinity)) {
            unregister();
            this._zones.get(keyId).remove();
            this._zones.delete(keyId);
            this._destroyWidget(widgetWrapper);
        }

        const gen = this.VISUAL_ORDER_STRATEGY === this.constructor.VISUAL_ORDER_STRATEGY_ALPHA
                  // FIXME: this is basically broken, as the list is not
                  // reorderd when the key is renamed e.g. to start with
                  // a new character that would have another position.
                ? this._alphaOrderingGenerator(childrenOrderedMap.indexedEntries())
                : childrenOrderedMap.indexedEntries()
                ;
        const keyIdOrder = [];
        for(const [index, [key, /*axesLocationSet*/]] of gen) {
            // keys
            const keyId = keyProtocolHandler.getId(index);
            keyIdOrder.push(keyId);
            if(!keyProtocolHandler.hasRegistered(keyId)) {
                const keyComponent = {value: null}
                  , unregister = keyProtocolHandler.register(keyId, keyComponent)
                  , container = this._domTool.createElement('li')
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
                if(this.DRAG_ENTRIES) {
                    dragHandleElement = this._domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, createIcon('drag_pan'));
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

            // FIXME: I'm not sure this is ever the case.
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
}
_UIBaseMap.prototype._setClassesHelper = _setClassesHelperMethod;
