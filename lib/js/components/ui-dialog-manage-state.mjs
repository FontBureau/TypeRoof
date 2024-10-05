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
      <fieldset class="ui-dialog-manage_state-message-container">
        <legend>Status: <span class="ui-dialog-manage_state-message-process_label">(none)</span></legend>
        <pre class="ui-dialog-manage_state-message-box"></pre>
      </fieldset>
      <fieldset>
        <legend>Serialized Data</legend>
        <textarea class="ui-dialog-manage_state-serialize_output"></textarea>
      </fieldset>
    </form>
  </dialog>
`;
    static RESET = Symbol('RESET');
    get RESET(){return this.constructor.RESET;}
    static SUCCESS = Symbol('SUCCESS');
    get SUCCESS(){return this.constructor.SUCCESS;}
    static FAIL = Symbol('FAIL');
    get FAIL(){return this.constructor.FAIL;}

    constructor(domTool, getAppState, setAppState) {
        super(domTool);
        this._getAppState = getAppState;
        this._setAppState = setAppState;
        this._messageBaseClass = 'ui-dialog-manage_state-message-status_';
        [this.element, this._form, this._serializeOutput
            , this._messageContainer, this._messageLabel, this._messageBox
        ] = this._initTemplate();
        this._setMessage(this.RESET);
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , form =  dialog.querySelector('form')
          , serializeButton = dialog.querySelector('.ui-dialog-manage_state-serialize')
          , deserializeButton = dialog.querySelector('.ui-dialog-manage_state-deserialize')
          , serializeOutput = dialog.querySelector('.ui-dialog-manage_state-serialize_output')
          , messageContainer = dialog.querySelector('.ui-dialog-manage_state-message-container')
          , messageLabel = dialog.querySelector('.ui-dialog-manage_state-message-process_label')
          , messageBox = dialog.querySelector('.ui-dialog-manage_state-message-box')
          ;
        serializeButton.addEventListener('click', this._serializeHandler.bind(this))
        deserializeButton.addEventListener('click', this._deserializeHandler.bind(this))
        return [dialog, form, serializeOutput, messageContainer, messageLabel, messageBox];
    }

    _serializeHandler(event) {
        event.preventDefault();
        const [errors, resultString] = serialize(this._getAppState())
          , message = []
          ;
        if(errors.length) {
            console.warn(`Serialize had errors ...`);
            for(const [path, error, ...more] of errors) {
                const e = new Error(`Serialize error at ./${path.join('/')}`, {cause: error});
                console.error(e, ...more);
                message.push(`{error.name}: {error.message} at ./${path.join('/')}`);
            }
            this._setMessage(this.FAIL, 'serialize', message.join('\n'));
        }
        else {
            this._serializeOutput.value = resultString;
            this._setMessage(this.SUCCESS, 'serialize');
        }
    }

    _setMessage(type, processLabel='', message='') {
        const classes = [];
        if(type === this.RESET) {
            classes.push(`${this._messageBaseClass}reset`);
            processLabel = '';
            message='';
        }
        else if(type === this.SUCCESS) {
            classes.push(`${this._messageBaseClass}success`);
            message = message || 'OK!';
        }
        else if(type === this.FAIL) {
            classes.push(`${this._messageBaseClass}fail`);
        }
        else
            throw new Error(`VALUE ERROR type is unknown: "{type?.toString() || type}".`);

        for(const _class of [...this._messageContainer.classList])
            if(_class.startsWith(this._messageBaseClass))
                this._messageContainer.classList.remove(_class);
        for(const _class of classes)
            this._messageContainer.classList.add(_class);

        this._messageLabel.textContent = processLabel;
        this._messageBox.textContent = message;

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
        try {
            await this._setAppState(likeADraft);
            this._setMessage(this.SUCCESS, 'deserialize');
        }
        catch(error) {
            this._setMessage(this.FAIL, 'deserialize', error);
            // For debugging (should we throw?):
            console.error(new Error('Deserialize FAILED', { cause: error }));
        }
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
