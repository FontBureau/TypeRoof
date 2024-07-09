import {
   _DialogBase
} from './basics.mjs';

const SERIALIZE = Symbol.for('SERIALIZE')

export class UIDialogManageState extends _DialogBase {
    static TEMPLATE = `<dialog class="ui-dialog-manage_state">
    <form method="dialog">
      <fieldset>
        <legend>Manage State</legend>
        <p>Serialize options: (none)</p>
        <menu>
          <button class="ui-dialog-manage_state-serialize">Serialize</button>
          <button type="submit" value="cancel">Exit</button>
        </menu>
      </fieldset>
      <fieldset>
        <legend>Serialization Result</legend>
        <output class="ui-dialog-manage_state-serialize_output"></output>
      </fieldset>
    </form>
  </dialog>
`;

    constructor(domTool, getAppState) {
        super(domTool);
        this._getAppState = getAppState;
        [this.element, this._form, this._serializeOutput] = this._initTemplate();
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , form =  dialog.querySelector('form')
          , serializeButton = dialog.querySelector('.ui-dialog-manage_state-serialize')
          , serializeOutput = dialog.querySelector('.ui-dialog-manage_state-serialize_output')
          ;
        serializeButton.addEventListener('click', this._serializeHandler.bind(this))

        return [dialog, form, serializeOutput];
    }

    _serializeHandler(event) {
        event.preventDefault();
        this._serializeOutput.textContent = this._getAppState()[SERIALIZE]();
    }
    async show() {
        const promise = super.show()
          , dialog = this.element
          ;
        dialog.returnValue = null;
        dialog.showModal();

        return await promise.then(action=>{
            return action;
        });
    }
}
