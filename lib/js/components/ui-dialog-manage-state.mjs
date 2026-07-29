import {
    _DialogBase
} from './basics/dialog.mjs';

import {
    serialize
  , deserializeGen
  , SERIALIZE_OPTIONS
} from '../metamodel.mjs';

// returns "likeADraft" => {metamorphoseGen: }
export function deserializeStateString(Model, serializedValue) {
    const options = {...SERIALIZE_OPTIONS, earlyExitOnError: true}
      , metamorphoseGen = dependencies=>deserializeGen(
                            Model, dependencies, serializedValue, options)
      ;
    return {metamorphoseGen};
}

function createStateFileName(date = new Date()) {
    const pad = (number) => `${number}`.padStart(2, '0')
      , dateSegment = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(pad).join('')
      , timeSegment = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join('')
      ;
    return `typeroof-state-${dateSegment}-${timeSegment}.json`;
}

export class UIDialogManageState extends _DialogBase {
    static TEMPLATE = `<dialog class="ui-dialog-manage_state">
    <form method="dialog">
      <fieldset>
        <legend>Manage State</legend>
        <p>Serialize options: (none)</p>
        <menu>
          <button class="ui-dialog-manage_state-load">Load file...</button>
          <button class="ui-dialog-manage_state-save">Save file</button>
          <button type="submit" value="cancel">Exit</button>
        </menu>
        <input type="file" accept=".json,application/json" />
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

    // Called by DialogOpeners with `this` set to that instance.
    static hostInit() {
        const ctorArgs = []
          , showArgs = []
          , getAppStateFN = ()=>this.getEntry('/')
          , setAppStateFN = likeADraft=>{
              // => make sure this goes the async path
                this.widgetBus.requireReviewResources();
                return this.widgetBus.updateState(likeADraft)//.replaceState
            }
          ;
        ctorArgs.push(getAppStateFN, setAppStateFN);
        return [ctorArgs, showArgs];
    }

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
          , loadFileButton = dialog.querySelector('.ui-dialog-manage_state-load')
          , loadFileInput = dialog.querySelector('input[type="file"]')
          , saveButton = dialog.querySelector('.ui-dialog-manage_state-save')
          , serializeOutput = dialog.querySelector('.ui-dialog-manage_state-serialize_output')
          , messageContainer = dialog.querySelector('.ui-dialog-manage_state-message-container')
          , messageLabel = dialog.querySelector('.ui-dialog-manage_state-message-process_label')
          , messageBox = dialog.querySelector('.ui-dialog-manage_state-message-box')
          ;
        loadFileButton.addEventListener('click', (event) => {
            event.preventDefault();
            // Reset, so selecting the same file again triggers a change event.
            loadFileInput.value = '';
            loadFileInput.click();
        });
        loadFileInput.addEventListener('change', this._loadFileHandler.bind(this));
        saveButton.addEventListener('click', this._saveHandler.bind(this))
        return [dialog, form, serializeOutput, messageContainer, messageLabel, messageBox];
    }

    _saveHandler(event) {
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
            const fileName = createStateFileName();
            this._downloadFile(resultString, fileName);
            this._setMessage(this.SUCCESS, 'serialize', `Saved as "${fileName}".`);
        }
    }

    _downloadFile(contents, fileName) {
        const document = this._domTool.document
          , url = URL.createObjectURL(new Blob([contents], {type: 'application/json'}))
          , anchor = document.createElement('a')
          ;
        anchor.href = url;
        anchor.download = fileName;
        // Firefox requires the anchor to be in the document to be clickable.
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
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

    async _loadFileHandler(event) {
        const [file] = event.target.files || [];
        try {
            const serializedValue = await file.text();
            this._serializeOutput.value = serializedValue;
            this._deserialize(serializedValue);
        }
        catch(error) {
            this._setMessage(this.FAIL, 'load state file', error);
        }
    }

    async _deserialize(serializedValue) {
        const appState = this._getAppState()
          , Model = appState.constructor
          , likeADraft = deserializeStateString(Model, serializedValue)
          ;
        try {
            await this._setAppState(likeADraft);
            this._setMessage(this.SUCCESS, 'deserialize');
            this.element.close();
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
