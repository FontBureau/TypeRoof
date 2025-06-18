/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    identity
} from '../util.mjs';

import {
    Path
} from '../metamodel.mjs';

import{
    DATA_TRANSFER_TYPES
} from './data-transfer-types.mjs';

import {
    _BaseComponent
  // , _BaseContainerComponent
  // , UPDATE_STRATEGY
  // , UPDATE_STRATEGY_SIMPLE // jshint ignore: line
  , _UIAbstractPlainInputWrapper
  , _UIAbstractPlainOrEmptyInputWrapper
  , UPDATE_STRATEGY_NO_UPDATE
  , UPDATE_STRATEGY
} from './basics.mjs';

export class GenericSelect extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<label class="ui_generic_select">
    <span class="ui_generic_select-label">Something</span>
    <select class="ui_generic_select-select"></select>
</label>`;
    static NULL_SELECT_VALUE= '[_NULL_]';
    // jshint ignore:end
    constructor(widgetBus, baseClass, labelContent, optionGetLabel=null, allowNull=[], onChangeFn=null, optionGetGroup=null) {
        super(widgetBus);
        if(optionGetLabel)
            this._optionGetLabel = optionGetLabel;
        if(optionGetGroup)
            this._optionGetGroup = optionGetGroup;
        [this._allowNull=false, this._allowNullLabel='(no selection)', this._nullModelValue=null] = allowNull;
        this._onChangeFn = onChangeFn;
        [this.element, this._label, this._select] = this.initTemplate(baseClass, labelContent);
        if(this._allowNull) {
            this._updateOptions(new Map());
            this._updateValue({value: this._nullModelValue});
        }
    }
    initTemplate(baseClass, labelContent) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.querySelector('.ui_generic_select')
          , label = frag.querySelector('.ui_generic_select-label')
          , select = frag.querySelector('.ui_generic_select-select')
          ;
        element.classList.add(`${baseClass}`);
        label.classList.add(`${baseClass}-label`);
        this._domTool.clear(label);
        label.append(labelContent);
        select.classList.add(`${baseClass}-select`);

        this._insertElement(element);
        select.addEventListener('change', this._changeSelectedValueHandler.bind(this));
        return [element, label, select];
    }

    async _changeSelectedValueHandler(/*event*/) {
        return await this._changeState(()=>{
            // const value = this.getEntry('value');
            // value.set(this._select.value);
            const value = this._allowNull && this._select.value === this.constructor.NULL_SELECT_VALUE
                ? this._nullModelValue
                : this._select.value
            ;
            this.getEntry('value').set(value);

            // could do more e.g.:
            // const options = this.widgetBus.getEntry('options');
            // deleted = options.arraySplice(0, 3);
            if(this._onChangeFn)
                this._onChangeFn(value);
        })
    }

    update(changed) {
        // Should probably use availableFonts and activeFontKey
        // directly in this case, but for more generic interfaces,
        // it is important that we can rewrite names from external
        // model names to internal widget names. So I can start with
        // as well righ now.
        if(changed.has('options'))
            this._updateOptions(changed.get('options'));
        if(changed.has('value'))
            this._updateValue(changed.get('value'));
    }

    /* Override via constructor. */
    _optionGetLabel(key/*, value*/) {
        return key;
    }

    /* Override via constructor. */
    _optionGetGroup(/*value*/) {
        // return [groupKey, label, index];
        return [null, '', 0];
    }

    _creatOption(value, label){
        const option = this._domTool.createElement('option');
        option.value = value;
        option.textContent = label;
        return option
    }

    _populateSelect(availableOptions) {
        const rootItems = []
          , groups = new Map()
          , createOption=(options, value, label)=>{
                options.push(this._creatOption(value, label));
            }
          , PLACEHOLDER = Symbol('PLACEHOLDER')
          , getGroupItems=(value)=>{
                const [groupKey, label, index] = this._optionGetGroup(value)
                if(!groups.has(groupKey)) {
                    // no label, no opt-group ...
                    const createsOptGroup = label !== '';
                    const items = createsOptGroup ? [] : rootItems;
                    if(createsOptGroup)
                        rootItems.push(PLACEHOLDER);
                    groups.set(groupKey, {items, label, index, createsOptGroup});
                }
                return groups.get(groupKey).items;
            }
          ;
        if(this._allowNull)
            createOption(rootItems, this.constructor.NULL_SELECT_VALUE, this._allowNullLabel);
        for(const [key, value] of availableOptions) {
            const options = getGroupItems(value)
              , label = this._optionGetLabel(key, value)
              ;
            createOption(options, key, label);
        }

        const noPlaceholdersItems = []
           , orderedOptGroups = Array.from(groups.values())
                .filter(group=>group.createsOptGroup)
                .sort((a, b)=>a.index-b.index)
                .map(group=>{
                    const optGroup = this._domTool.createElement('optgroup')
                    optGroup.label = group.label;
                    optGroup.append(...group.items);
                    return optGroup;
                })
           ;

        for(const item of rootItems) {
            if(item === PLACEHOLDER)
                noPlaceholdersItems.push(orderedOptGroups.shift());
            else
                noPlaceholdersItems.push(item);
        }

        this._domTool.clear(this._select);
        this._select.append(...noPlaceholdersItems);
    }

    _updateOptions(availableOptions/* changes */) {
        // Just rebuild all options, it's straight forward
        const value = this._select.value // keep around to set back later
        this._populateSelect(availableOptions);
        // Set back original value, if this is not available, it has changed
        // and the new value will be set by the shell.
        this._select.value = value;
    }
    // Should be called after updateOptions if that was necessary, as
    // the new options may no longer contain the old value.
    _updateValue(activeKey) {
        this._select.value = this._allowNull && activeKey.value === this._nullModelValue
                ? this.constructor.NULL_SELECT_VALUE
                : activeKey.value.toString()
                ;
    }

    isFocused() {
        return this._select === this._domTool.document.activeElement;
    }
}

// This could also be implemented as radio button list.
export class PlainSelectInput {
        // jshint ignore:start
    static TEMPLATE = `<label class="ui_plain_select">
    <span class="ui_plain_select-label">(not initialized)</span>
    <select class="ui_plain_select-select"></select>
</label>`;
    // jshint ignore:end
    constructor(domTool, changeHandler, label, items) {
        this._domTool = domTool;
        this._passive = false;
        [this.element, this._input] = this._initTemplate(label, items);

        this._changeHandler = null;
        if(changeHandler) {
            this._changeHandler = (event)=>{
                event.preventDefault();
                changeHandler(this._input.value);
            };
            this._input.addEventListener('change', this._changeHandler);
        }
    }

    _initTemplate(label, items) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , input = container.querySelector('.ui_plain_select-select')
          , labelElement = container.querySelector('.ui_plain_select-label')
          , options = []
          ;
        // Used to iterate over items.entries() but that prevents an
        // entries like array from being itereated. On the other hand
        // a Map itereated directly or via map.entries() produces the same
        // results.
        for(const [key, label] of items) {
             const option = this._domTool.createElement('option',{}, label);
             option.value = key;
             options.push(option);
        }
        input.append(...options);
        labelElement.textContent = label;
        return [container, input];
    }

    update(value) {
        this._input.value = value;
    }

    set passive(val) {
        this._passive = !!val;
        this._input.disabled = this._passive;
    }

    get passive() {
        return this._passive;
    }

    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }
}

/* Useful helper but may have room for improvement. */
function _getInputStepsSizeForMinMax(min, max) {
    let distance = Math.abs(min - max);
    if(distance >= 100) {
        return '1'; //10 ** 0
    }
    if(distance >= 10) {
        return '0.1'; // 10 ** - 1
    }
    return '0.01'; // 10 ** -2
}

/**
 * This does not provide the API associated with _BaseComponent
 * it is simpler to re-use for that reason.
 *
 * Will not include the range input if min and max are not numeric and finite
 */
export class PlainNumberAndRangeInput {
    //jshint ignore:start
    static TEMPLATE = `<div class="number_and_range_input">
    <label><!-- insert: label --></label>
    <input type='number'  size="3" /><!-- insert: unit -->
    <input type='range' />
</div>`;
    //jshint ignore:end
    /**
     * NOTE: how widgetBus can inject changeHandler! Maybe that's a better
     *      model in general. Under observation!
     */
    constructor(domTool, changeHandler, label, unit, minMaxValueStep) {
        this._domTool = domTool;
        this._passive = false;
        if(!minMaxValueStep)
            throw new Error(`VALUE ERROR can't build ${this.constructor.name} without minMaxValueStep`);
        this._minMaxValueStep = minMaxValueStep;
        [this.element, this._inputs, this._labelElement, this._unitElement
            , this._rangeElement
        ] = this._initTemplate();
        this.updateTemplateVars(label, unit, minMaxValueStep);
        this._changeHandler = (event)=>{
            event.preventDefault();
            changeHandler(parseFloat(event.target.value));
        };
        for(const elem of this._inputs)
            // is not yet removed ever anymore...
            elem.addEventListener('input', this._changeHandler);
    }

    _initTemplate() {
        const fragment = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , container = fragment.firstChild
          , labelElement = this._domTool.createElement('span', {})
          , unitElement =  this._domTool.createElement('span', {})
          ;
        this._domTool.insertAtMarkerComment(container, 'insert: label', labelElement);
        this._domTool.insertAtMarkerComment(container, 'insert: unit', unitElement);


        const rangeInput = fragment.querySelector('input[type="range"]');
        for(const label of container.querySelectorAll('label')) {
            label.addEventListener('click', ()=>rangeInput.focus());
        }
        const inputs = Array.from(container.getElementsByTagName('input'));
        return [container, inputs, labelElement, unitElement, rangeInput];
    }

    updateTemplateVars(label, unit, minMaxValueStep) {
        if(this._rangeElement) {
            const useRange = typeof minMaxValueStep.min === 'number' && isFinite(minMaxValueStep.min)
                     && typeof minMaxValueStep.max === 'number' && isFinite(minMaxValueStep.max);
            this._rangeElement.style.setProperty('display', useRange ? '' : 'none');
        }
        const minMaxValueStep_ = Object.assign(minMaxValueStep);
        if(!('step' in minMaxValueStep)) {
            minMaxValueStep_.step = ('min' in minMaxValueStep &&  'max' in minMaxValueStep)
                ? _getInputStepsSizeForMinMax(minMaxValueStep.min, minMaxValueStep.max)
                // Otherwise we'd get a validation error  when the value is float.
                : 'any'
                ;
        }
        for(const [k,v] of Object.entries(minMaxValueStep_)) {
            // all of min, max, step, value work as properties
            for(const elem of this._inputs)
                elem[k] = v;
        }

        this._labelElement.textContent = `${label}`;
        if(unit) {
            this._domTool.clear(this._unitElement);
            // No-breaking-space \xA0 as a separator before the actual unit.
            // FIXME: Should rather be done with CSS by putting the unit
            // into a span container, seems like the Nbsp doesn't prevent
            // the line from breaking anyways!
            const nbsp = '\xA0';
            this._unitElement.append(`${nbsp}${unit}`);
        }
        else
            this._unitElement.textContent = '';
    }

    update(value) {
        // Clamp/clip/cutoff displayed value to min/max limits as configured.
        const min = 'min' in this._minMaxValueStep ? this._minMaxValueStep.min : value
            , max = 'max' in this._minMaxValueStep ? this._minMaxValueStep.max : value
            , limited = Math.min(max, Math.max(min, value))
            ;
        for(let input of this._inputs) {
            if(this._domTool.document.activeElement === input)
                // has focus
                continue;
            // synchronize the other element(s)
            input.value = limited;
        }
    }

    // use e.g. by UIManualAxesLocations
    set passive(val) {
         this._passive = !!val;
         this._inputs.map(input=>input.disabled = !!val);
    }

    get passive() {
        return this._passive;
    }

    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }
}


export class PlainLineOfTextInput {
    //jshint ignore:start
    static TEMPLATE = `<div class="line_of_text">
    <label><!-- insert: label -->
    <input type='text'/></label>
</div>`;
    //jshint ignore:end
    constructor(domTool, changeHandler, label) {
        this._domTool = domTool;
        this._passive = false;
        [this.element, this._input] = this._initTemplate(label);

        this._changeHandler = (event)=>{
            event.preventDefault();
            changeHandler(event.target.value);
        };

        this._input.addEventListener('input', this._changeHandler);
    }

    _initTemplate(label) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , input = container.querySelector('input')
          ;
        this._domTool.insertAtMarkerComment(container, 'insert: label', label);
        return [container, input];
    }

    update(value) {
        this._input.value = value;
    }

    set passive(val) {
        this._passive = !!val;
        this._input.disabled = this._passive;
    }

    get passive() {
        return this._passive;
    }

    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }
}

export class _AbstractOrEmptyPlainInputWrapper {
    static createClass(className, PlainInput) {
        // jshint unused: vars
        const result = {[className]: class extends this {
            // jshint ignore: start
            static PlainInput = PlainInput;
            // jshint ignore: end
        }};
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(domTool, valueChangeHandler, toggleChangeHandler, ...wrappedArgs) {
        this._domTool = domTool;

        this._uiInput = new this.constructor.PlainInput(this._domTool, valueChangeHandler, ...wrappedArgs);
        this._uiToggle = new PlainToggleButton(this._domTool, toggleChangeHandler
                , 'toggle', 'set explicitly' , 'unset'
                , 'Toggle explicit number input or set empty.');
        this.element = this._uiInput.element;
        this.element.append(this._uiToggle.element);
    }
    update(active, value) {
        if(active) {
            this._uiInput.passive = false;
            this._uiInput.update(value);
            this._uiToggle.update(false);
            // toggle button: 'unset'
        }
        else {
            this._uiInput.passive = true;
            this._uiInput.update(value);
            this._uiToggle.update(true);
        }
    }

    setDisplay(show) {
        this._uiInput.setDisplay(show);
        this._uiToggle.setDisplay(show);
    }

    set passive(val) {
        this._uiInput.passive = val;
        this._uiToggle.passive = val;
    }

    get passive() {
        return this._uiInput.passive && this._uiToggle.passive;
    }

    destroy(){}
}

export class PlainToggleButton {
    // jshint ignore:start
    static baseClass = 'ui_toggle_button';
    // jshint ignore:end
    constructor(domTool, changeStateHandler, classToken, labelIsOn, labelIsOff, title) {
        this._domTool = domTool;
        this._labelIsOn = labelIsOn;
        this._labelIsOff = labelIsOff;
        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass} ${this.constructor.baseClass}-${classToken}`
              , title: title
            }, '(initializing)');

        this.element.addEventListener('click', (event)=>{
            event.preventDefault();
            changeStateHandler();
        });
    }
    update(booleanValue) {
        this._booleanValue = !!booleanValue;
        this.element.textContent = this._booleanValue
            ? this._labelIsOn
            : this._labelIsOff
            ;
    }
    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }

    set passive(val) {
         this.element.disabled = !!val;
    }

    get passive() {
        return !!this.element.disabled;
    }
}

export class UIToggleButton extends _BaseComponent {
    // jshint ignore:start
    static baseClass = 'ui_toggle_button';
    // jshint ignore:end
    constructor(widgetBus, classToken, labelIsOn, labelIsOff, title) {
        super(widgetBus);
        const changeStateHandler = this._changeStateHandler(()=>{
            const entry = this.getEntry('boolean');
            entry.set(!entry.value);
        });

        this._ui = new PlainToggleButton(this._domTool, changeStateHandler
                                , classToken, labelIsOn, labelIsOff, title);
        this._insertElement(this._ui.element);
    }

    update(changedMap) {
        if(changedMap.has('boolean'))
            this._ui.update( changedMap.get('boolean').value);
    }
}

// can be anything, a label etc...
export class StaticTag extends _BaseComponent {
    constructor(widgetBus, tag, attr, contents) {
        super(widgetBus);
        this.element = this._domTool.createElement(tag, attr, contents);
        this._insertElement(this.element);
    }
}

export class StaticNode extends _BaseComponent {
    constructor(widgetBus, node) {
        super(widgetBus);
        this.node = node;
        this._insertElement(this.node);
    }
}

export class DynamicTag extends _BaseComponent {
    constructor(widgetBus, tag, attr, formatter=identity, initialContent='(initializing)') {
        super(widgetBus);
        this._formatter = formatter;
        this.element = this._domTool.createElement(tag, attr, initialContent);
        this._insertElement(this.element);
    }
    update(changedMap) {
        if(changedMap.has('data'))
            this.element.textContent = this._formatter(changedMap.get('data').value);
    }
}

/**
 * This is to swap each selected item with its neighbor in forward or
 * backward direction. It's not a list rotation, although that can be
 * achieved as well with this, it's however not the most intuitive.
 */
export class MoveItemsInListButton extends _BaseComponent {
    // jshint ignore:start
    static BACKWARD = Symbol('MOVE_ITEM_IN_LIST_BUTTON_BACKWARD');
    static FORWARD = Symbol('MOVE_ITEM_IN_LIST_BUTTON_FORWARD');
    static baseClass = 'ui_move_item_in_list_button';
    static setings = {
        [this.BACKWARD]: {
            title: 'Move item(s) one position backward.'
          , classToken: 'backward'
          , label: '⇇ move backward'
        }
      , [this.FORWARD]: {
           title: 'Move item(s) one position forward.'
         , classToken: 'forward'
         , label: 'move forward ⇉'
        }
    };
    // jshint ignore:end
    constructor(widgetBus, action, getKeysFn, setKeysFn) {
        super(widgetBus);
        const settings = this.constructor.setings[action];
        this._getKeysFn = getKeysFn;
        this._setKeysFn = setKeysFn;
        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass} ${this.constructor.baseClass}-${settings.classToken}`
              , title: settings.title
            }, settings.label);
        this.element.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const list = this.getEntry('list')
              , keysModel =  this.getEntry('keys')
              ;
            // Currently we don't show this widget if there's no
            // active KeyMoment, but the results of these checks
            // could also be used to change display properties in update ...
            if(list.size <= 1)
                // no elemet or one element: no move required
                return;
            if(keysModel.size === 0)
                // no element to act on
                return;

            const keys = this._getKeysFn(keysModel);
            if(action === this.constructor.FORWARD)
                // FIXME: WORKS but not when crossing the line...
                //        but that could also be because that changes the
                //        this._getKeysFn(keysModel) order a lot!
                keys.reverse();
            for(const key of keys) {
                if(action === this.constructor.FORWARD)
                    this._moveForward(keysModel, list, key);
                else if(action === this.constructor.BACKWARD)
                    this._moveBackward(keysModel, list, key);
                else
                    throw new Error(`TYPE ERROR action unkown ${action.toString()}.`);
            }
        }));
        this._insertElement(this.element);
    }

    _moveForward(keys, list, key) {
        const index = parseInt(key, 10);
        // [X, A, B, C, D] => [A, X, B, C, D] // X = 0 => .slice(0, 2, ...[A, X])
        // [A, X, B, C, D] => [A, B, X, C, D] // X = 0 => .slice(1, 2, ...[B, X])
        // [A, B, X, C, D] => [A, B, C, X, D] // X = 0 => .slice(2, 2, ...[C, X])
        // [A, B, C, X, D] => [A, B, C, D, X] // X = 0 => .slice(3, 2, ...[D, X])
        // FINALLY the circular order is complete again same as [X, A, B, C. D]
        // But here comes the overflow, same as second line [A, X, B, C, D]:
        // [A, B, C, D, X] => [X, B, C, D, A] // X = 0 => .slice(0, Infinity, ...[X, A, B, C, D])
        //                                                .push(.pop())
        if(index === list.size - 1) {
            const first = list.shift()
              , last = list.pop()
              ;
            list.push(first);
            list.unshift(last);
        }
        else
            // we checked already, list.size is > 1
            // also, index !== list.size - 1
            list.splice(index
                      , 2
                      , list.get(index + 1)
                      , list.get(index)
            );
        const newKey = (index === list.size - 1) ? '0': `${list.keyToIndex(index + 1)[0]}`;
        this._setKeysFn(keys, key, newKey);
    }

    _moveBackward(keys, list, key) {
        const index = parseInt(key, 10);
        // [A, B, C, D, X] => [A, B, C, X, D] // X = 0 => .slice(3, 2, ...[X, D])
        // [A, B, C, X, D] => [A, B, X, C, D] // X = 0 => .slice(2, 2, ...[X, C])
        // [A, B, X, C, D] => [A, X, B, C, D] // X = 0 => .slice(1, 2, ...[X, B])
        // [A, X, B, C, D] => [X, A, B, C, D] // X = 0 => .slice(0, 2, ...[X, A])
        // FINALLY:
        // [X, A, B, C, D] => [D, A, B, C, X] // X = 0 => .slice(0, Infinity, ...[A, B, C, D, X])
        if(index === 0) {
            const first = list.shift()
                , last = list.pop()
                ;
            list.push(first);
            list.unshift(last);
        }
        else
            list.splice(index - 1
                      , 2
                      , list.get(index)
                      , list.get(index - 1)
            );
        const newKey = `${list.keyToIndex(index - 1)[0]}`;
        this._setKeysFn(keys, key, newKey);
    }

    update(changedMap) {
        const list = changedMap.has('list')
                        ? changedMap.get('list')
                        : this.getEntry('list')
          , keysModel = changedMap.has('keys')
                        ? changedMap.get('keys')
                        : this.getEntry('keys')
          ;
        this.element.disabled = keysModel.size === 0 || list.size < 2;
    }
}

export class UINumberInput extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="number_input">
    <label><!-- insert: label -->
    <input type='number'/><!-- insert: unit --></label>
</div>`;
    //jshint ignore:end
    constructor(widgetBus, label, unit, minMax={}, classes=[]) {
        super(widgetBus);
        this._minMax = minMax;
        [this.element, this._input] = this._initTemplate(unit, minMax, label, classes);

    }

    _initTemplate(unit, minMax, label, classes) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , input = container.querySelector('input')
          ;

        if(Array.isArray(classes) && classes.length) {
            for(const class_ of classes)
                container.classList.add(class_);
        }

        input.addEventListener('input',  this._changeStateHandler((/*event*/)=>{
            this.getEntry('value').set(parseFloat(input.value));
        }));

        for(const [k, v] of Object.entries(minMax))
            input[k] = v;

        if(label)
            this._domTool.insertAtMarkerComment(container, 'insert: label', label);
        if(unit)
            this._domTool.insertAtMarkerComment(container, 'insert: unit', ` ${unit}`);
        this._insertElement(container);
        return [container, input];
    }

    update(changedMap) {
        if(changedMap.has('value')) {
            const value = changedMap.get('value').value
                // Clamp/clip/cutoff displayed value to min/max limits as configured.
              , min = 'min' in this._minMax ? this._minMax.min : value
              , max = 'max' in this._minMax ? this._minMax.max : value
              , limited = Math.min(max, Math.max(min, value))
              ;

            if(this._domTool.document.activeElement !== this._input)
                    // else: has focus
                this._input.value = limited;
        }
    }
}

export class PlainCheckboxInput {
    // jshint ignore:start
        static baseClass = 'ui_checkbox';
        static TEMPLATE = `<div>
    <label><span class="ui_checkbox--label"><!-- insert: label --></span>
    <input class="ui_checkbox--input" type="checkbox" /></label>
</div>`;
    // jshint ignore:end
    constructor(domTool, changeStateHandler, classToken, label) {
        this._domTool = domTool;
        [this.element, this._input] = this._initTemplate(changeStateHandler, classToken, label);
    }
    _initTemplate(changeStateHandler, classToken, label) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , input = container.querySelector('input')
          , labelElement = container.querySelector('label span')
          , baseClass = this.constructor.baseClass
          , fullClass = `${baseClass}-${classToken}`
          ;

        labelElement.textContent = label;
        for(const [element, ...classes] of [
              [container, baseClass, fullClass]
            , [input, `${fullClass}-input`]
            , [labelElement, `${fullClass}-label`]
        ]) {
            for(const class_ of classes)
                element.classList.add(class_);
        }
        input.addEventListener('change', (event)=>{
            event.preventDefault();
            changeStateHandler(this._input.checked);
        });
        return [container, input];
    }

    update(booleanValue) {
        this._booleanValue = !!booleanValue;
        this._input.checked = this._booleanValue;
    }
    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }

    set passive(val) {
         this._input.disabled = !!val;
    }

    get passive() {
        return !!this._input.disabled;
    }
}

export const
    /*** UI{ ??? }Input ***/
    /**
     * call with extra args: label
     */
    UILineOfTextInput = _UIAbstractPlainInputWrapper.createClass(
          'UILineOfTextInput'
        , PlainLineOfTextInput
    )
    /**
     * call with extra args: label, unit, minMaxValueStep
     */
  , UINumberAndRangeInput = _UIAbstractPlainInputWrapper.createClass(
        'UINumberAndRangeInput'
      , PlainNumberAndRangeInput
    )
  , UISelectInput = _UIAbstractPlainInputWrapper.createClass(
        'UISelectInput'
      , PlainSelectInput
    )
  , UICheckboxInput = _UIAbstractPlainInputWrapper.createClass(
        'UICheckboxInput'
      , PlainCheckboxInput
    )
    /*** Plain{ ??? }OrEmpty ***/
  , PlainNumberAndRangeOrEmptyInput = _AbstractOrEmptyPlainInputWrapper.createClass(
        'PlainNumberAndRangeOrEmptyInput'
      , PlainNumberAndRangeInput
    )
  , PlainLineOfTextOrEmptyInput = _AbstractOrEmptyPlainInputWrapper.createClass(
        'PlainLineOfTextOrEmptyInput'
      , PlainLineOfTextInput
    )
  , PlainSelectOrEmptyInput = _AbstractOrEmptyPlainInputWrapper.createClass(
        'PlainSelectOrEmptyInput'
      , PlainSelectInput
    )
  , PlainCheckboxOrEmptyInput = _AbstractOrEmptyPlainInputWrapper.createClass(
        'PlainCheckboxOrEmptyInput'
      , PlainCheckboxInput
    )
    /*** UI{ ??? }OrEmptyInput ***/
  , UILineOfTextOrEmptyInput = _UIAbstractPlainOrEmptyInputWrapper.createClass(
        'UILineOfTextOrEmptyInput'
      , PlainLineOfTextOrEmptyInput
    )
  , UINumberAndRangeOrEmptyInput = _UIAbstractPlainOrEmptyInputWrapper.createClass(
        'UINumberAndRangeOrEmptyInput'
      , PlainNumberAndRangeOrEmptyInput
    )
  , UISelectOrEmptyInput = _UIAbstractPlainOrEmptyInputWrapper.createClass(
        'UISelectOrEmptyInput'
      , PlainSelectOrEmptyInput
    )
  , UICheckboxOrEmptyInput = _UIAbstractPlainOrEmptyInputWrapper.createClass(
        'UICheckboxOrEmptyInput'
      , PlainCheckboxOrEmptyInput
    )
  ;

/*
 * CAUTION:
 *    * This does not persist in the data model.
 *    * The contents of the element are merely hidden by CSS and will
 *      still consume resources e.g. receive calls to their update method.
 */
export function collapsibleMixin(element, buttonSelector, isInitiallyOpen=false) {
    const baseClassName = 'ui_collapsible_mixin'
      , openClassName = `${baseClassName}-open`
      , closedClassName = `${baseClassName}-closed`
      ;
    element.classList.add(baseClassName);
    element.classList.add(isInitiallyOpen ? openClassName : closedClassName);
    element.addEventListener('click', (event)=>{
        const button = event.target.closest(buttonSelector);
        if(button === null) return;
        if(button.closest(element.tagName) !== element) return;
        event.preventDefault();
        const isOpen = element.classList.contains(openClassName);

        element.classList[isOpen ? 'remove' : 'add'](openClassName);
        element.classList[isOpen ? 'add' : 'remove'](closedClassName);
        if(!isOpen)
            element.scrollIntoView({block: 'start', inline: 'nearest', behavior: 'smooth'});
    });
}

export class _BaseDropTarget extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
    // jshint ignore:start
        static TEMPLATE = `<div class="ui_base_drop_target">
    <strong class="ui_base_drop_target-effect_label"></strong>
    <span class="ui_base_drop_target-main_drop_zone"></span>
    <span class="ui_base_drop_target-description_label"></span>
</div>`;
    // jshint ignore:end
    constructor(widgetBus, effectLabel, descriptionLabel, applicableTypes) {
        super(widgetBus);
        this._applicableTypes = applicableTypes;
        this._receptiveClassName = `${this.constructor.BASE_CLASS}-receptive`;
        [this.element] = this.initTemplate(effectLabel, descriptionLabel);
    }

    initTemplate(effectLabel, descriptionLabel) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , effectLabelContainer = element.querySelector('.ui_base_drop_target-effect_label')
          , descriptionLabelContainer = element.querySelector('.ui_base_drop_target-description_label')
          , mainDropZoneElement = element.querySelector('.ui_base_drop_target-main_drop_zone')
          ;

        element.classList.add(this.constructor.BASE_CLASS);
        effectLabelContainer.classList.add(`${this.constructor.BASE_CLASS}-effect_label`);
        descriptionLabelContainer.classList.add(`${this.constructor.BASE_CLASS}-description_label`);
        mainDropZoneElement.classList.add(`${this.constructor.BASE_CLASS}-main_drop_zone`);

        effectLabelContainer.textContent = effectLabel;
        descriptionLabelContainer.textContent = descriptionLabel;
        this._insertElement(element);

        this._addEventListeners(element);
        return [element];
    }

    _addEventListeners(element) {
        element.addEventListener('dragenter', this._dragenterHandler.bind(this));
        element.addEventListener('dragover', this._dragoverHandler.bind(this));
        element.addEventListener('dragleave', this._dragleaveHandler.bind(this));
        element.addEventListener('drop', this._dropHandler.bind(this));
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        for(const type of this._applicableTypes) {
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

    _dragenterHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        this.element.classList.add(this._receptiveClassName);
    }

    _dragoverHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        this.element.classList.add(this._receptiveClassName);
    }

    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        this.element.classList.remove(this._receptiveClassName);
        // const {setTimeout} = this._domTool.window;
        // this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(/*event*/) {
        this.element.classList.remove(this._receptiveClassName);
        return this._dropHandlerImplementation(event);
    }
    _dropHandlerImplementation(/*event*/) {
        throw new Error(`NOT IMPLEMENTED ${this}._dropHandler for event ${event}`);
    }
}

export class WasteBasketDropTarget extends _BaseDropTarget {
    static BASE_CLASS = 'waste_basket_drop_target';
    _dropHandlerImplementation(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        const axesMathTypes = new Set([
                    DATA_TRANSFER_TYPES.AXESMATH_ITEM_PATH
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_KEY_PATH
                  , DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUES_KEY_PATH]);

        // just a safeguard, but not helping for reusability!
        if(type === DATA_TRANSFER_TYPES.ACTOR_PATH
                || type === DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH
                || type === DATA_TRANSFER_TYPES.TYPE_SPEC_DOCUMENT_NODE_PATH) {
            return this._changeState(()=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('rootCollection'))
                  , relativeSourcePath = event.dataTransfer.getData(type)
                  , sourcePath = rootPath.appendString(relativeSourcePath)
                  , sourceParent = this.getEntry(sourcePath.parent)
                  , sourceKey = sourcePath.parts.at(-1)
                  ;

                // FIXME: This has too much destructive power in a way, E.g. we could
                // make sure that sourceParent is an ActorsModel, as the paths
                // could be spoofed in some way e.g. using  ./../../../../ in
                // the path.
                // rootPath.isRootOf is a good check, but it could still be
                // more specific.
                if(!rootPath.isRootOf(sourcePath))
                    throw new Error(`PATH ERROR source path "${sourcePath}" (${relativeSourcePath}) is not contained in root path "${rootPath}"`);

                sourceParent.delete(sourceKey);
            });
        }
        else if(axesMathTypes.has(type)
                || type === DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH
                || type === DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH) {
            return this._changeState(()=>{
                const pathStr = event.dataTransfer.getData(type)
                  , sourcePath = Path.fromString(pathStr)
                  , sourceParent = this.getEntry(sourcePath.parent)
                  , sourceKey = sourcePath.parts.at(-1)
                  ;
                console.log(`${this}._dropHandler type: ${type} data: ${pathStr} sourcePath: ${sourcePath}`);
                // FIXME: we should probably check that the actual type
                // that's going to be deleted matches the expectation.
                // So far, any actual type would be deleted in here
                // if the parent of the path supports `.delete(sourceKey)`
                // but the concept of the DATA_TRANSFER_TYPES is to control
                // what can be deleted with this widget and what not.
                //
                // The other use, regardless, of the DATA_TRANSFER_TYPES is
                // that we can determine how to perform the delete.
                sourceParent.delete(sourceKey);
            });
        }
        else
            throw new Error(`NOT IMPLEMENTED ${this}._dropHandler don't know how to handle type "${type}".`);
    }
}
