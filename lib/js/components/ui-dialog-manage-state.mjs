import {
   _DialogBase
} from './basics.mjs';

import {
    serialize
  , deserialize
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
        <output class="ui-dialog-manage_state-serialize_output"></output>
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
            this._serializeOutput.textContent = resultString;
    }

    _deserializeHandler(event) {
        event.preventDefault();
        const appState = this._getAppState()
          , Model = appState.constructor
          , dependencies = appState.dependencies
            // TODO this could come from a textarea element,
            // only round-tripping for now.
          , serializedValue = this._serializeOutput.textContent
          , options = {...SERIALIZE_OPTIONS, earlyExitOnError: true}
          , [errors, newState] = deserialize(Model, dependencies, serializedValue , options)
          ;
        if(errors.length) {
            console.warn(`Deserialize had errors ...`, errors);
            for(const [path, error, ...more] of errors) {
                error.message = `${error.message} ./${path.join('/')}`;
                console.error(error, ...more);
            }
        }
        else
            this._setAppState(newState);
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
