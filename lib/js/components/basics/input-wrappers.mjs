import {
    _BaseComponent
} from './component.mjs';

import {
    connectLabelWithInput
} from './dom-helpers.mjs';

export class _UIAbstractPlainInputWrapper extends _BaseComponent {
    static createClass(className, PlainInput) {
        const result = {[className]: class extends this {
            static PlainInput = PlainInput;
        }};
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(widgetBus, ...wrappedArgs) {
        super(widgetBus);
        const changeHandler = this._changeStateHandler(
            // FIXME: .set(value) might get sanitized, then, at least when
            // we lose focus, but maybe earlier, we should display the actual
            // value.!!!
            value=>this.getEntry('value').set(value));
        this._ui = new this.constructor.PlainInput(this._domTool, changeHandler, ...wrappedArgs);
        connectLabelWithInput(widgetBus
                , this._ui.element.querySelector('label')
                , this._ui.element.querySelector('input,select'));
        this._insertElement(this._ui.element);
    }

    update(changedMap) {
        if(changedMap.has('value'))
            this._ui.update(changedMap.get('value').value);
    }

    set passive(val) {
         this._ui.passive = !!val;
    }

    get passive() {
        return this._ui.passive;
    }

    setDisplay(show) {
        this._ui.setDisplay(show);
    }
}

// Maybe, this should be implemented using a _BaseContainerComponent
// It also needs a toggle, to set value to empty or to not empty
// and even when value is empty, we may want to animate value still.
// So, there's an extra switch ...
export class _UIAbstractPlainOrEmptyInputWrapper extends _BaseComponent {
    static createClass(className, PlainOrEmptyInput) {
        const result = {[className]: class extends this {
            static PlainOrEmptyInput = PlainOrEmptyInput;
        }};
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(widgetBus, getDefault, requireUpdateDefaults, ...wrappedArgs /*e.g. label*/) {
        super(widgetBus);
        this._getDefault = getDefault || null;
        this._requireUpdateDefaults = requireUpdateDefaults || (()=>false);

         const valueChangeHandler = this._changeStateHandler(
                            value=>this.getEntry('value').set(value))
          , toggleChangeHandler = this._changeStateHandler(()=>{
                const valueOrEmpty = this.getEntry('value');
                if(valueOrEmpty.isEmpty)
                    valueOrEmpty.set(this._getDefault
                                ? this._getDefault()
                                : undefined
                    ); // toggle to explicit
                else
                    valueOrEmpty.clear(); // clear
            })
          ;

        this._ui = new this.constructor.PlainOrEmptyInput(this._domTool
                , valueChangeHandler
                , toggleChangeHandler
                , ...wrappedArgs);
        connectLabelWithInput(widgetBus
                , this._ui.element.querySelector('label')
                , this._ui.element.querySelector('input,select'));
        this._insertElement(this._ui.element);
    }

    update(changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('value') || requireUpdateDefaults) {
            const valueOrEmpty = changedMap.has('value')
                    ? changedMap.get('value')
                    : this.getEntry('value')
                    ;

            let active, value;
            if(!valueOrEmpty.isEmpty) {
                active = true;
                value = valueOrEmpty.value;
            }
            else {
                active = false;
                value = this._getDefault
                            ? this._getDefault()
                            : undefined
                            ;
            }
            this._ui.update(active, value);
        }
    }
}
