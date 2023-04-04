/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    ForeignKey
} from '../metamodel.mjs';

import {
    _BaseComponent
} from './basics.mjs';

export class GenericSelect extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<label class="ui_generic_select">
    <span class="ui_generic_select-label">Something</span>
    <select class="ui_generic_select-select"></select>
</label>`;
    // jshint ignore:end
    constructor(parentAPI, baseClass, labelContent, optionGetLabel) {
        super(parentAPI);
        if(optionGetLabel)
            this._optionGetLabel = optionGetLabel;
        [this.element, this._label, this._select] = this.initTemplate(baseClass, labelContent);
    }
    initTemplate(baseClass, labelContent) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.querySelector('.ui_generic_select')
          , label = frag.querySelector('.ui_generic_select-label')
          , select = frag.querySelector('.ui_generic_select-select')
          ;
        element.classList.add(`${this._baseClass}`);
        label.classList.add(`${this._baseClass}-label`);
        this._domTool.clear(label);
        label.append(labelContent);
        select.classList.add(`${this._baseClass}-select`);

        this._insertElement(element);
        select.addEventListener('change', this._changeStateHandler((/*event*/)=>{
            // const value = this.getEntry('value');
            // value.set(this._select.value);
            this.getEntry('value').set(this._select.value);
            // could do more e.g.:
            // const options = this.parentAPI.getEntry('options');
            // deleted = options.arraySplice(0, 3);
        }));
        return [element, label, select];
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
    _optionGetLabel(key/*, value*/){
        return key;
    }

    _updateOptions(availableOptions/* changes */) {
        // Just rebuild all options, it's straight forward
        const value = this._select.value // keep around to set back later
          , options = []
          ;
        for(const [key, value] of availableOptions) {
            const textContent = this._optionGetLabel(key, value)
              , option = this._domTool.createElement('option')
              ;
            option.value = key;
            option.textContent = textContent;
            options.push(option);
        }
        this._domTool.clear(this._select);
        this._select.append(...options);
        // Set back original value, if this is not available, it has changed
        // and the new value will be set by the shell.
        this._select.value = value;
    }
    // Should be called after updateOptions if that was necessary, as
    // the new options may no longer contain the old value.
    _updateValue(activeKey) {
        this._select.value = activeKey.value;
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

export class UINumberAndRangeInput extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div id="container" class="number-and-range-input">
    <label for="range"><!-- insert: label --></label>
    <input type='number' id="number" size="3" /><!-- insert: unit -->
    <input type='range' id="range" />
</div>`;
    //jshint ignore:end
    /**
     * NOTE: how parentAPI can inject changeHandler! Maybe that's a better
     *      model in general. Under observation!
     */
    constructor(parentAPI, baseID, label, unit, minMaxValueStep) {
        super(parentAPI);
        this._passive = false;
        this._minMaxValueStep = minMaxValueStep;
        [this.element, this._inputs] = this._initTemplate(baseID, label, unit, minMaxValueStep);
        this._changeHandler = this.parentAPI.changeHandler
              ? (event)=>{
                    event.preventDefault();
                    this.parentAPI.changeHandler(parseFloat(event.target.value));
                }
              : this._changeStateHandler((event)=>{
                    event.preventDefault();
                    this.getEntry('value').set(parseFloat(event.target.value));
                });
        for(const elem of this._inputs)
            // is not yet removed ever anymore...
            elem.addEventListener('input', this._changeHandler);
    }

    _initTemplate(baseID, label, unit, minMaxValueStep) {
        const fragment = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , CONTAINER_RAW_ID = 'container'
          , container = fragment.getElementById(CONTAINER_RAW_ID)
          ;
        this._domTool.insertAtMarkerComment(container, 'insert: label', label);
        if(unit) {
            this._domTool.insertAtMarkerComment(container, 'insert: unit', unit);
            // No-breaking-space as a separator, this will end up between
            // the marker comment and the actual unit.
            // FIXME: Should rather be done with CSS by putting the unit
            // into a span container, seems like the Nbsp doesn't prevent
            // the line from breaking anyways!
            this._domTool.insertAtMarkerComment(container, 'insert: unit', '\xA0');
        }
        for(const id of [CONTAINER_RAW_ID, 'number', 'range']) {
            const elem = fragment.getElementById(id);
            elem.id = `${baseID}-${id}`;
        }
        for(const label of container.querySelectorAll('label'))
            // htmlFor gets/sets the `for` attribute
            label.htmlFor = `${baseID}-${label.htmlFor}`;

        const inputs = Array.from(container.getElementsByTagName('input'))
          , minMaxValueStep_ = (!('step' in minMaxValueStep)
                                 && 'min' in minMaxValueStep
                                 && 'max' in minMaxValueStep)
                            ? Object.assign({step: _getInputStepsSizeForMinMax(minMaxValueStep.min, minMaxValueStep.max)}, minMaxValueStep)
                            : minMaxValueStep
          ;
        for(const [k,v] of Object.entries(minMaxValueStep_)) {
            // all of min, max, step, value work as properties
            for(const elem of inputs)
                elem[k] = v;
        }
        this._insertElement(container);
        return [container, inputs];
    }

    update(changedMap) {
        if(changedMap.has('value')) {
            const value = changedMap.get('value').value
                // Clamp/clip/cutoff displayed value to min/max limits as configured.
              , min = 'min' in this._minMaxValueStep ? this._minMaxValueStep.min : value
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
    }

    // use e.g. by UIManualAxesLocations
    set passive(val) {
         this._passive = !!val;
         this._inputs.map(input=>input.disabled = !!val);
    }

    get passive(){
        return this._passive;
    }

    setDisplay(show) {
        if(show)
            this.element.style.removeProperty('display');
        else
            this.element.style.display = 'none';
    }
}

export class ToggleButton extends _BaseComponent {
    // jshint ignore:start
    static baseClass = 'ui_toggle_button';
    // jshint ignore:end
    constructor(parentAPI, classToken, labelIsOn, labelIsOff, title) {
        super(parentAPI);

        this._labelIsOn = labelIsOn;
        this._labelIsOff = labelIsOff;

        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass} ${this.constructor.baseClass}-${classToken}`
              , title: title
            }, '(initializing)');
        this.element.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const boolean = this.getEntry('boolean');
            boolean.value = !boolean.value;
        }));
        this._insertElement(this.element);
    }

    update(changedMap) {
        this.element.textContent = changedMap.get('boolean').value
            ? this._labelIsOn
            : this._labelIsOff
            ;
    }
}


// can be anything, a label etc...
export class StaticTag extends _BaseComponent {
    constructor(parentAPI, tag, attr, contents) {
        super(parentAPI);
        this.element = this._domTool.createElement(tag, attr, contents);
        this._insertElement(this.element);
    }
}

export class MoveItemInListButton extends _BaseComponent {
    // jshint ignore:start
    static BACKWARD = Symbol('MOVE_ITEM_IN_LIST_BUTTON_BACKWARD');
    static FORWARD = Symbol('MOVE_ITEM_IN_LIST_BUTTON_FORWARD');
    static baseClass = 'ui_move_item_in_list_button';
    static setings = {
        [MoveItemInListButton.BACKWARD]: {
            title: 'Move item one position backward.'
          , classToken: 'backward'
          , label: '⇇ move backward'
        }
      , [MoveItemInListButton.FORWARD]: {
           title: 'Move item one position forward.'
         , classToken: 'forward'
         , label: 'move forward ⇉'
        }
    };
    // jshint ignore:end
    constructor(parentAPI, action) {
        super(parentAPI);
        const settings = this.constructor.setings[action];
        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass} ${this.constructor.baseClass}-${settings.classToken}`
              , title: settings.title
            }, settings.label);
        this.element.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const list = this.getEntry('list')
              , key =  this.getEntry('key')
              ;
            // Currently we don't show this widget if there's no
            // active KeyMoment, but the results of these checks
            // could also be used to change display properties in update ...
            if(list.size <= 1)
                // no elemet or one element: no move required
                return;
            if(key.value === ForeignKey.NULL)
                // no element to act on
                return;
            const index = parseInt(key.value, 10);
            if(action === MoveItemInListButton.FORWARD) {
                // [X, A, B, C, D] => [A, X, B, C, D] // X = 0 => .slice(0, 2, ...[A, X])
                // [A, X, B, C, D] => [A, B, X, C, D] // X = 0 => .slice(1, 2, ...[B, X])
                // [A, B, X, C, D] => [A, B, C, X, D] // X = 0 => .slice(2, 2, ...[C, X])
                // [A, B, C, X, D] => [A, B, C, D, X] // X = 0 => .slice(3, 2, ...[D, X])
                // FINALLY:
                // [A, B, C, D, X] => [X, A, B, C, D] // X = 0 => .slice(0, Infinity, ...[X, A, B, C, D])
                //                                                .push(.pop())
                if(index === list.size - 1)
                    list.unshift(list.pop());
                else
                    // we checked already, list.size is > 1
                    // also, index !== list.size - 1
                    list.splice(index
                              , 2
                              , list.get(index + 1)
                              , list.get(index)
                    );
                key.set( (index === list.size - 1) ? '0': `${list.keyToIndex(index + 1)[0]}`);
            }
            else if(action === MoveItemInListButton.BACKWARD){
                // [A, B, C, D, X] => [A, B, C, X, D] // X = 0 => .slice(3, 2, ...[X, D])
                // [A, B, C, X, D] => [A, B, X, C, D] // X = 0 => .slice(2, 2, ...[X, C])
                // [A, B, X, C, D] => [A, X, B, C, D] // X = 0 => .slice(1, 2, ...[X, B])
                // [A, X, B, C, D] => [X, A, B, C, D] // X = 0 => .slice(0, 2, ...[X, A])
                // FINALLY:
                // [X, A, B, C, D] => [A, B, C, D, X] // X = 0 => .slice(0, Infinity, ...[A, B, C, D, X])
                if(index === 0)
                    list.push(list.shift());
                else
                    list.splice(index - 1
                              , 2
                              , list.get(index)
                              , list.get(index - 1)
                    );
                key.set(`${list.keyToIndex(index - 1)[0]}`);
            }
            else
                throw new Error(`TYPE ERROR action unkown ${action.toString()}.`);
        }));
        this._insertElement(this.element);
    }
    update(changedMap) {
        const list = changedMap.has('list')
                        ? changedMap.get('list')
                        : this.getEntry('list')
          , key = changedMap.has('key')
                        ? changedMap.get('key')
                        : this.getEntry('key')
          ;
        this.element.disabled = key.value === ForeignKey.NULL || list.size < 2;
    }
}

export class UINumberInput extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="number_input">
    <label><!-- insert: label -->
    <input type='number'/><!-- insert: unit --></label>
</div>`;
    //jshint ignore:end
    constructor(parentAPI, label, unit, minMax={}) {
        super(parentAPI);
        this._minMax = minMax;
        [this.element, this._input] = this._initTemplate(unit, minMax, label);

    }

    _initTemplate(unit, minMax, label) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , input = container.querySelector('input')
          ;

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

export class LineOfTextInput extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="line_of_text">
    <label><!-- insert: label -->
    <input type='text'/></label>
</div>`;
    //jshint ignore:end
    constructor(parentAPI, label) {
        super(parentAPI);
        [this.element, this._input] = this._initTemplate(label);
    }

    _initTemplate(label) {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , input = container.querySelector('input')
          ;

        input.addEventListener('input',  this._changeStateHandler((/*event*/)=>{
            this.getEntry('value').set(input.value);
        }));

        this._domTool.insertAtMarkerComment(container, 'insert: label', label);
        this._insertElement(container);
        return [container, input];
    }

    update(changedMap) {
        if(changedMap.has('value')) {
            if(this._domTool.document.activeElement !== this._input)
                 this._input.value = changedMap.get('value').value || '';
            // else has focus
        }
    }
}
