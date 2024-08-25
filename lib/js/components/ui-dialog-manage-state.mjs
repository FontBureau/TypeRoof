import {
   _DialogBase
} from './basics.mjs';

import {
    serialize
  , deserializeGen
  , SERIALIZE_OPTIONS
} from '../metamodel.mjs';

export class UIDialogManageState extends _DialogBase {
    static TEMPLATE = `<dialog class="ui-dialog-manage_state">
    <form method="dialog">
      <fieldset>
        <legend>Manage State</legend>
        <p>Serialize options: (none)</p>
        <menu>
          <button class="ui-dialog-manage_state-serialize">Serialize</button>
          <button class="ui-dialog-manage_state-deserialize">Deserialize</button>
          <button type="submit" value="cancel">Exit</button>
        </menu>
      </fieldset>
      <fieldset>
        <legend>Serialization Result</legend>
        <textarea class="ui-dialog-manage_state-serialize_output"></textarea>
      </fieldset>
    </form>
  </dialog>
`;

    constructor(domTool, getAppState, setAppState) {
        super(domTool);
        this._getAppState = getAppState;
        this._setAppState = setAppState;
        [this.element, this._form, this._serializeOutput] = this._initTemplate();
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , form =  dialog.querySelector('form')
          , serializeButton = dialog.querySelector('.ui-dialog-manage_state-serialize')
          , deserializeButton = dialog.querySelector('.ui-dialog-manage_state-deserialize')
          , serializeOutput = dialog.querySelector('.ui-dialog-manage_state-serialize_output')
          ;
        serializeButton.addEventListener('click', this._serializeHandler.bind(this))
        deserializeButton.addEventListener('click', this._deserializeHandler.bind(this))
        return [dialog, form, serializeOutput];
    }

    _serializeHandler(event) {
        event.preventDefault();
        const [errors, resultString] = serialize(this._getAppState());
        if(errors.length) {
            console.warn(`Serialize had errors ...`);
            for(const [path, error, ...more] of errors) {
                error.message = `${error.message} ./${path.join('/')}`;
                console.error(error, ...more);
            }
        }
        else
            this._serializeOutput.value = resultString;
    }

    async _deserializeHandler(event) {
        event.preventDefault();
        const appState = this._getAppState()
          , Model = appState.constructor
          , serializedValue = this._serializeOutput.value
          , options = {...SERIALIZE_OPTIONS, earlyExitOnError: true}
          , likeADraft = {
                metamorphoseGen: dependencies=>deserializeGen(
                        Model, dependencies, serializedValue, options)
            }
          ;
          this._setAppState(likeADraft);
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
