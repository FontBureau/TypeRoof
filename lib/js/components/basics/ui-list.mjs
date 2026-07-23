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
} from './component.mjs';

import {
    _setClassesHelperMethod
} from './dom-helpers.mjs';

export const DRAGHANDLE_TEMPLATE = `<button class="ui_button ui_button-move drag_handle" draggable="true">
    <span class="material-symbols-outlined">drag_pan</span>
</button>`;
function _dragstartHandlerMethod(event) {
    const path = this.widgetBus.rootPath;
    // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
    //      "It is important to set the data in the right order, from most-specific to least-specific."
    event.dataTransfer.setData(this.ITEM_DATA_TRANSFER_TYPE_PATH, `${path}`);
    event.dataTransfer.setData('text/plain', `[TypeRoof ${this.ITEM_DATA_TRANSFER_TYPE_PATH}: ${path}]`);
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

    // Take the snapshot of the element while it is stable
    event.dataTransfer.setDragImage(this.element, 0 , 0);

    // Defer the state changes. This gives Chromium time to finalize the
    // drag image registration.
    requestAnimationFrame(() => {
        this.element.classList.add('dragging');

        // lose focus safely after the drag operation has officially kicked off
        if (this.element.matches(':focus-within')) {
            this._domTool.document.activeElement.blur();
        }
    })
}

function _dragendHandlerMethod(/*event*/) {
    this.element.classList.remove('dragging');
}

function _createDragHandleMethod() {
    const dragHandleElement = this._domTool.createFragmentFromHTML(this.constructor.DRAGHANDLE_TEMPLATE).firstElementChild;
    for(const args of [
                    ['dragstart', this._dragstartHandler.bind(this)]
                  , ['dragend', this._dragendHandler.bind(this)]
            ]) {
        dragHandleElement.addEventListener(...args);
        this._setClassesHelper([
            [dragHandleElement, 'drag_handle']
        ]);
    }
    return dragHandleElement;
}

function _deleteHandlerMethod(evt) {
    evt.preventDefault();
    return this._changeState(()=>{
        const path = this.widgetBus.rootPath
          , parent = this.getEntry(path.parent)
          , key = path.parts.at(-1)
          ;
        parent.delete(key);
    });
}

function _createDeleteButtonMethod() {
    const deleteButtonElement = this._domTool.createElement(
        'button',
        {
            class:"ui_button ui_button-remove",
            title:"remove"
        },
        createIcon('delete')
    );
    deleteButtonElement.addEventListener('click', this._deleteHandler.bind(this));
    return deleteButtonElement;
}

class _UIBaseListItem extends _BaseComponent {
    static ROOT_CLASS = `ui_base_list_simple_item`;
    static BASE_CLASSES = ['ui_base_list_item'];

    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }

    static get ITEM_DATA_TRANSFER_TYPE_PATH() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static ITEM_DATA_TRANSFER_TYPE_PATH`);
    }

    _ITEM_DATA_TRANSFER_TYPE_PATH = null;
    get ITEM_DATA_TRANSFER_TYPE_PATH() {
        return this._ITEM_DATA_TRANSFER_TYPE_PATH !== null
            ? this._ITEM_DATA_TRANSFER_TYPE_PATH
            : this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH;
    }

    static TEMPLATE = `<div
        tabindex="0"
        ><!-- insert: label-element --><!-- insert: tools -->
        <output>(UNINITIALIZED)</output></div>`;
    static DRAGHANDLE_TEMPLATE = DRAGHANDLE_TEMPLATE;

    /* The use case for this was to additionally require 'sourceMap'.
     * No need to mention 'value'
     *
     * I.e. in the sub-class definition:
     *      static additionalDependencies = ['sourceMap'];
     * For this to work, the parent _UIBaseList (in this example UICompositeStylePatch)
     * got an additional dependencyDefintion of ['./stylePatchesSource', 'sourceMap']
     *
     * Also the format ['external', 'internal']
     * is allowed. If it's just a single item/ a string it will be expanded
     * to internal = external = single-item.
     * "external" will be resolved with: this.widgetBus.getExternalName(external)
     * in the parent. i.e. if not found, it will be used directly as the
     * external name. However, in this constellation, it seems smarter to
     * define a model dependency name via the parent as internal name
     * _UIBaseList dependencies, as that is not hard coded.
     */
    static additionalDependencies = [];

    constructor(widgetBus, eventHandlers=[], draggable=false, deletable=false, label=null) {
        super(widgetBus);
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
        });

        Object.assign(this, this._initTemplate());
        this._setClassesHelper([
                [this.element]
        ]);

        if(draggable || deletable) {
            const toolsElement = this._domTool.createElement('div', {class: "tools_container"});
            if(draggable) {
                const dragHandleElement = this._createDragHandle();
                toolsElement.append(dragHandleElement);
            }
            if(deletable) {
                const deleteButtonElement = this._createDeleteButton();
                toolsElement.append(deleteButtonElement);
            }
            this.element.append(toolsElement);
            this._domTool.insertAtMarkerComment(this.element, 'insert: tools', toolsElement);
        }
        if(label !== null)
            this._label = this._initLabel(label);

        for(const args of eventHandlers)
            this.element.addEventListener(...args);
    }
    _getInstanceBaseClasses(){
        return [];
    }
    _initTemplate() {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , output = element.querySelector('output')
          ;
        this._setClassesHelper([
                [output, 'output']
        ]);
        this._insertElement(element);
        return {element, _output: output};
    }

    _initLabel(label) {

        const labelElement = this.widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label);
        this._setClassesHelper([
                [labelElement, 'label']
        ]);
        this._domTool.insertAtMarkerComment(this.element, 'insert: label-element', labelElement);
        console.log(`${this} label:`, label, 'labelElement:',labelElement);
        return labelElement;
    }
    /*
     * This is more an example as a serious implementation
     * see UIAxesMathLocationValue for a real and more complex case.
     */
    update(changedMap) {
        if(changedMap.has('value')) {
            const value = changedMap.get('value');
            this._output.textContent = value.value;
        }
    }
}
_UIBaseListItem.prototype._setClassesHelper = _setClassesHelperMethod;
_UIBaseListItem.prototype._dragstartHandler = _dragstartHandlerMethod;
_UIBaseListItem.prototype._dragendHandler = _dragendHandlerMethod;
_UIBaseListItem.prototype._createDragHandle = _createDragHandleMethod;
_UIBaseListItem.prototype._createDeleteButton = _createDeleteButtonMethod;

export class _UIBaseListContainerItem extends _BaseContainerComponent {
    static ROOT_CLASS = `ui_base_list_container_item`;
    static BASE_CLASSES = ['ui_base_list_item'];// it's also a ui_base_list_item
    // FIXME: this could become a standard for all _BaseContainerComponent
    // and be injected automatically, but we'd need a concept how to override
    // the default zones map when it has to be modified. That override
    // should not be more complicated than the status quo. So, in general,
    // it stays better explicit than implicit.
    static REQUIRE_ZONES_ARGUMENT = true;
    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }

    static get ITEM_DATA_TRANSFER_TYPE_PATH() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static ITEM_DATA_TRANSFER_TYPE_PATH`);
    }

    _ITEM_DATA_TRANSFER_TYPE_PATH = null;
    get ITEM_DATA_TRANSFER_TYPE_PATH() {
        return this._ITEM_DATA_TRANSFER_TYPE_PATH !== null
            ? this._ITEM_DATA_TRANSFER_TYPE_PATH
            : this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH;
    }

    static DRAGHANDLE_TEMPLATE = DRAGHANDLE_TEMPLATE;

    // see comment in _UIBaseListItem
    static additionalDependencies = [];

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false, deletable=false) {
        const localZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
        });

        this.element = localZoneElement;
        this._insertElement(this.element);
        this._setClassesHelper([
            [this.element]
        ]);

        if(draggable || deletable)  {
            const toolsElement = this._domTool.createElement('div', {class: "tools_container"});
            // children can add their tools/buttons to this zone
            this._zones.set('tools', toolsElement);
            if(draggable) { //OK. so this could be put into a `tools` container and then we could also put the delete button there
                const dragHandleElement = this._createDragHandle();
                toolsElement.append(dragHandleElement);
            }
            if(deletable) {
                const deleteButtonElement = this._createDeleteButton();
                toolsElement.append(deleteButtonElement);
            }
            this.element.append(toolsElement);
        }
        for(const args of eventHandlers)
            this.element.addEventListener(...args);
    }
    _getInstanceBaseClasses(){
        return [];
    }
}
_UIBaseListContainerItem.prototype._setClassesHelper = _setClassesHelperMethod;
_UIBaseListContainerItem.prototype._dragstartHandler = _dragstartHandlerMethod;
_UIBaseListContainerItem.prototype._dragendHandler = _dragendHandlerMethod;
_UIBaseListContainerItem.prototype._createDragHandle = _createDragHandleMethod;
_UIBaseListContainerItem.prototype._deleteHandler = _deleteHandlerMethod;
_UIBaseListContainerItem.prototype._createDeleteButton = _createDeleteButtonMethod;


const DROP_INSERT_DIRECTION_VERTICAL = Symbol('DROP_INSERT_DIRECTION_VERTICAL')
  , DROP_INSERT_DIRECTION_HORIZONTAL = Symbol('DROP_INSERT_DIRECTION_HORIZONTAL')
  ;
export class _UIBaseList extends _BaseDynamicCollectionContainerComponent {
    static ROOT_CLASS = `ui_base_list`;
    static BASE_CLASSES = [];
    static UIItem = _UIBaseListItem;

    static DROP_INSERT_DIRECTION_VERTICAL = DROP_INSERT_DIRECTION_VERTICAL;
    static DROP_INSERT_DIRECTION_HORIZONTAL = DROP_INSERT_DIRECTION_HORIZONTAL;
    DROP_INSERT_DIRECTION = DROP_INSERT_DIRECTION_VERTICAL;

    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }

    // This becomes interesting:
    //  in UIAxesMathLocationValues we have PATH and create
    //  and these are used for move/create operations.
    // but in the UI for CompositeStylePatch we won't have a
    // CREATE Type, rather a move from the StylePatches Map UI
    // that will then create a new "link" (StylePatchKeysModel) item.
    static get ITEM_DATA_TRANSFER_TYPE_PATH() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static ITEM_DATA_TRANSFER_TYPE_PATH`);
    }

    static get ITEM_DATA_TRANSFER_TYPE_CREATE() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static KEY_DATA_TRANSFER_TYPE`);
    }

    get ITEM_DATA_TRANSFER_TYPE_PATH() {
        return this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH;
    }

    get ITEM_DATA_TRANSFER_TYPE_CREATE() {
        return this.constructor.ITEM_DATA_TRANSFER_TYPE_CREATE;
    }

    _UIItem = null;
    get UIItem() {
        return this._UIItem !== null ? this._UIItem : this.constructor.UIItem;
    }

    // used in _createWrapper, to be extended by sub-classes
    get itemExtraArguments (){ throw new Error(`DEPRECATED ${this} itemExtraArguments`)};
    // The following two are options for the items. Historically,
    // dragable was hardcoded `true` and `deletable` was not an option
    // This makes it a bit easier to configure, but it's not an end to
    // end solution.
    _itemsDragable = true;
    // false as historically this was not an option, to stay backwards
    // compatible
    _itemsDeletable = false;
    constructor(widgetBus, _zones, childrenMainZone = 'local', UIItem=null, itemsDragable=true, itemsDeletable=false) {
         const localZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        this._UIItem = UIItem;
        this._itemsDragable = itemsDragable;
        this._itemsDeletable = itemsDeletable;
        // Could be the same as localZoneElement but could also be different.
        // In the simplest case it is the same.
        this._childrenMainZone = childrenMainZone;
        this._childrensMainZoneElement = this._zones.get(childrenMainZone);

        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
        });
        this._setClassesHelper([
            [localZoneElement]
        ]);

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
            this._childrensMainZoneElement.addEventListener(...args);
        }

        this._insertElement(localZoneElement);
        this.element = localZoneElement;
        this._removeDragIndicatorTimeoutId = null;
    }
    _getInstanceBaseClasses(){
        return [];
    }
    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [this.ITEM_DATA_TRANSFER_TYPE_PATH
                              , this.ITEM_DATA_TRANSFER_TYPE_CREATE];
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

    [DROP_INSERT_DIRECTION_HORIZONTAL](dropTargetItem, event) {
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

    // Vertical version, otherwise just like the horizontal implementation.
    [DROP_INSERT_DIRECTION_VERTICAL](dropTargetItem, event) {
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

    _getDropTargetInsertPosition(dropTargetItem, event) {
        return this[this.DROP_INSERT_DIRECTION](dropTargetItem, event)
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
        for(const elem of [this._childrensMainZoneElement, ...this._childrensMainZoneElement.querySelectorAll(`:scope > .${markedClass}`)]) {
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
        event.dataTransfer.dropEffect = type === this.ITEM_DATA_TRANSFER_TYPE_PATH
                ? 'move'
                : 'copy' // this.ITEM_DATA_TRANSFER_TYPE_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === this.ITEM_DATA_TRANSFER_TYPE_PATH
                ? 'move'
                : 'copy' // this.ITEM_DATA_TRANSFER_TYPE_CREATE
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
        if(type === this.ITEM_DATA_TRANSFER_TYPE_PATH) {
            const sourcePathString = data
              , sourcePath = Path.fromString(sourcePathString)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === this.ITEM_DATA_TRANSFER_TYPE_CREATE) {
            const value = data
            this._create(targetPath, insertPosition, value);
        }
        else {
            console.error(`NOT IMPLEMENTED ${this}._dropHandler type: "${type}"`);
        }
    }

    get _zonesArgs() {
        return this.UIItem.REQUIRE_ZONES_ARGUMENT
            ? [this._zones]
            : []
            ;
    }

    /* For better extensibility get the ITEM args from a function that
     * can be overridden.
     */
    _getItemArgs(rootPath, dropEventHandlers, draggable, deletable) {
        return [
                ...this._zonesArgs
                // the following are both optional in the default child,
                // so if we require mandatory arguments they should be
                // injected here, before.
               , dropEventHandlers, draggable, deletable
        ];
    }

    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath
              , zone: this._childrenMainZone
            }
          , dependencyMappings = [
                ['./', 'value']
            ]
          , Constructor = this.UIItem
          , dropTargetItem = {rootPath}
          , dropEventHandlers = [
                ['dragenter', this._dragenterHandler.bind(this, dropTargetItem)]
              , ['dragover', this._dragoverHandler.bind(this, dropTargetItem)]
              , ['dragleave', this._dragleaveHandler.bind(this)]
              , ['drop', this._dropHandler.bind(this, dropTargetItem)]
            ]
            , args = this._getItemArgs(rootPath, dropEventHandlers, this._itemsDragable, this._itemsDeletable)
          ;

        for(const entry_ of Constructor.additionalDependencies) {
            if(entry_ === undefined)
                throw new Error(`VALUE ERROR additionalDependencies  has an empty entry `
                    + `in ${this} UIItem.additionalDependencies`);
            const entry = Array.isArray(entry_) ? entry_.slice() : [entry_]
              , external = entry.at(0)
              , internal = entry.at(1) === undefined ? external : entry.at(1)
              ;
            dependencyMappings.push([this.widgetBus.getExternalName(external), internal]);
        }
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
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

    _createNewItem(targetPath, insertPosition, items, value) {
        throw new Error(`NOT IMPLEMENTED ${this}._createNewItem (for `
            + `targetPath: "${targetPath}", `
            + `insertPosition: "${insertPosition}", `
            + `value: "${value}"; with items ${items}).`);
    }

    _create(targetPath, insertPosition, value) {
        return this._changeState(()=>{
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , newItem = this._createNewItem(targetPath, insertPosition, items, value)
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
_UIBaseList.prototype._setClassesHelper = _setClassesHelperMethod;
