export class SimpleSelect extends _BaseComponent {
    constructor(widgetBus, label, items, changeHandler = null) {
        super(widgetBus);
        this._ui = new PlainSelectInput(
            this._domTool,
            changeHandler,
            label,
            items,
        );
        this._insertElement(this._ui.element);
    }
    get value() {
        return this._ui._input.value;
    }
}
