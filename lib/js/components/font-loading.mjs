/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    ForeignKey
} from '../metamodel.mjs';

import {
    _BaseComponent
  , _DialogBase
} from './basics.mjs';

function makeFileInput (handleFiles, clickElement, dropElement, dragCallbacks) {
    // In this case, the input element is not even appended into the
    // document, we use it just for the browser native interface.
    var hiddenFileInput = clickElement.ownerDocument.createElement('input');
    hiddenFileInput.setAttribute('type', 'file');
    hiddenFileInput.setAttribute('multiple', 'multiple');
    hiddenFileInput.style.display = 'none'; // can be hidden, no problem

    // for the file dialogue
    function fileInputChange(/*e*/) {
        /*jshint validthis:true, unused:vars*/
        handleFiles(this.files);
    }
    function forwardClick(/*e*/) {
        /*jshint unused:vars*/
        // forward the click => opens the file dialogue
        hiddenFileInput.click();
    }

    // for drag and drop
    function stopEvent(e) {
        e.stopPropagation();
        e.preventDefault();
    }

    function dragenter(e) {
        stopEvent(e);
        if(dragCallbacks.dragenter)
            dragCallbacks.dragenter(e);
    }

    function dragover(e) {
        stopEvent(e);
        if(dragCallbacks.dragover)
            dragCallbacks.dragover(e);
    }

    function dragleave(e) {
        if(dragCallbacks.dragleave)
            dragCallbacks.dragleave(e);
    }

    function dragend(e){
        if(dragCallbacks.dragend)
            dragCallbacks.dragend(e);
    }

    function drop(e) {
        stopEvent(e);
        handleFiles(e.dataTransfer.files);
        if(dragCallbacks.drop)
            dragCallbacks.drop(e);
    }

    hiddenFileInput.addEventListener('change', fileInputChange);
    if(clickElement)
        clickElement.addEventListener('click', forwardClick);
    if(dropElement) {
        dropElement.addEventListener("dragenter", dragenter);
        dropElement.addEventListener("dragover", dragover);
        dropElement.addEventListener("dragleave", dragleave);
        dropElement.addEventListener("dragend", dragend);
        dropElement.addEventListener("drop", drop);
    }
}

export class FontSelect extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<label class="ui_font-select">
    <span class="ui_font-select_label">Family</span>
    <select class="ui_font-select_select"></select>
</label>`;
    // jshint ignore:end
    constructor(widgetBus, allowNoneSelect=false) {
        super(widgetBus);
        this._allowNoneSelect = !!allowNoneSelect;
        [this.element, this._label, this._select] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.querySelector('.ui_font-select')
          , label = frag.querySelector('.ui_font-select_label')
          , select = frag.querySelector('.ui_font-select_select')
          ;
        this._insertElement(element);
        select.addEventListener('change', this._changeStateHandler(async (/*event*/)=>{
            // const value = this.getEntry('activeFontKey');
            // value.set(this._select.value);
            const fontName = this._allowNoneSelect && this._select.value === ''
                    ? ForeignKey.NULL
                    : this._select.value
                    ;
            // NOTE: when a new resource is required, we'll notice, but
            // when a resource ends to be used, we may miss freeing it
            // without this.
            this.widgetBus.requireReviewResources();
            this.getEntry('activeFontKey').set(fontName);
            // could do more e.g.:
            // const options = this.widgetBus.getEntry('options');
            // deleted = options.arraySplice(0, 3);
        }));
        return [element, label, select];
    }

    update(changed) {
        // Should probably use availableFonts directly in this case, but
        // for more generic interfaces, it is important that we can rewrite
        // names from external model names to internal widget names. So I
        // can start with as well righ now.
        if(changed.has('options'))
            this._updateOptions(changed.get('options'));
        if(changed.has('activeFontKey'))
            this._updateValue(changed.get('activeFontKey'));
    }
    _updateOptions(availableFonts/* changes */) {
        // Just rebuild all options, it's straight forward
        const value = this._select.value // keep around to set back later
          , optGroups = {}
          , createOptGroup = name=>{
                const optgroup = this._domTool.createElement('optgroup');
                switch(name) {
                    case 'from-url':
                        optgroup.label ='Included fonts';
                        break;
                    case 'from-file':
                        optgroup.label = 'Your local fonts';
                        break;
                    default:
                        optgroup.label = `Origin: ${name}`;
                }
                return optgroup;
            }
          , getOptGroup = name=>{
                if(!(name in optGroups))
                    optGroups[name] = createOptGroup(name);
                return optGroups[name];
            }
          ;
        for(const [key, {value:font}] of availableFonts) {
            const optGroup = getOptGroup(font.origin.type)
              , textContent = font.nameVersion
              , option = this._domTool.createElement('option')
              ;
            option.value = key;
            option.textContent = textContent;
            optGroup.append(option);
        }
        this._domTool.clear(this._select);
        const seen = new Set();
                           // Some fixed order.

        if(this._allowNoneSelect) {
            const option = this._domTool.createElement('option');
            option.value = '';
            option.textContent = `(no selection)`;
            this._select.append(option);
        }

        for(const name of ['from-url', 'from-file', ...Object.keys(optGroups)]){
            if(seen.has(name)) continue;
            seen.add(name);
            // Fixed order items may not exist.
            if(!(name in optGroups)) continue;
            this._select.append(optGroups[name]);
        }
        // Set back original value, if this is not available, it has changed
        // and the new value will be set by the shell.
        this._select.value = value;
    }
    // Should be called after updateOptions if that was necessaty, as
    // the new options may no longer contain the old value.
    // This follows the same dependency hierarchy as the model definition
    // with foreignKeys etc.
    _updateValue(activeFontKey) {
        if(activeFontKey.value === ForeignKey.NULL) {
            if(this._allowNoneSelect)
                this._select.value = '';
            else
                // Should be fixed where this component is configured.
                console.warn(`${this} activeFontKey is ForeignKey.NULL but allowNoneSelect is false.`);
        }
        else
            this._select.value = activeFontKey.value;
    }
}

export class AddFonts extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<a
    class="ui_font-select"
    title="…or drag a font file onto the window">+ Add local fonts
</a>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        [this.addFontsElement , this.dropElement] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , addFonts = frag.firstElementChild
          , dropElement = this._domTool.document.body
          , dragAddClass=(/*evt*/)=> dropElement.classList.add('dropzone')
          , dragRemoveClass=(/*evt*/)=> dropElement.classList.remove('dropzone')
          , fileInputDragCallbacks = {
                dragenter: dragAddClass
              , dragover: evt=>{
                    evt.dataTransfer.dropEffect = 'copy';
                    dragAddClass();
                }
              , dragleave: evt=>{
                    if (evt.target !== dropElement)
                        return;
                    dragRemoveClass();
                }
              , dragend: dragRemoveClass
              , drop: dragRemoveClass
            }
          ;
        this._insertElement(addFonts);

        const handleFiles = this._changeStateHandler(async (files)=>{
            const fontKeys = await this.widgetBus.loadFontsFromFiles(...files);
            if(!fontKeys.length)
                return;
            const fontName = fontKeys.at(-1);
            // activate the last entry
            this.widgetBus.requireReviewResources();
            this.getEntry('activeFontKey').set(fontName);
        });
        makeFileInput(handleFiles, addFonts, dropElement, fileInputDragCallbacks);

        return [addFonts, dropElement];
    }

    update(){
        // Pass: is only writing state, not displaying.
    }

    destroy() {
        // Raise, as dropElement, which is <body> has a load of
        // event handlers attached. But right now it's not planned to
        // remove the AddFonts interface.
        throw new Error(`NOT IMPLEMENTED but there are event listeners `
                      + `attached to <body> that must get removed.`);
    }
}

// jshint ignore:start
const UI_DIALOG_FONT_EXISTS =`<dialog>
    <form method="dialog">
      <fieldset>
        <legend>Font Exists</legend>
        <p>A font with the name<br />
        <code class="dialog-font_name"></code><br />
        is already loaded.
        </p>
        <menu>
          <p>Keep the loaded font or replace it with the new font:</p>
          <button type="submit" value="keep">Keep</button>
          <button type="submit" value="replace">Replace</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
// jshint ignore:end
export class UIDialogFontExists extends _DialogBase {
    static TEMPLATE = UI_DIALOG_FONT_EXISTS; // jshint ignore:line
    constructor(domTool) {
        super(domTool);
        [this.element, this._name] = this._initTemplate();
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , name = dialog.querySelector('.dialog-font_name')
          ;
        return [dialog, name];
    }

    async show(font) {
        const promise = super.show()
          , dialog = this.element
          ;
        this._name.append(`"${font.nameVersion}"`, this._domTool.createElement('br'), `(key: ${font.fullName})`);
        dialog.returnValue = 'initial';
        dialog.showModal();
        return promise;
    }
}


// jshint ignore:start
const UI_DIALOG_HANDLE_FONT_MISSING =`<dialog>
    <form method="dialog">
      <fieldset>
        <legend>Font Missing</legend>
        <p>A font identified by<br />
        <code class="dialog-font_name"></code><br />
        is missing.
        </p>
        <div class="dialog-line">
            <input name="method" type="radio" value="select" disabled checked
            />&nbsp<label>
                Select a replacement
                <select class="dialog-fonts"></select>
            </label>
        </div>
        <div class="dialog-line">
            <input name="method" type="radio" value="file" disabled
            />&nbsp<label>
                or load a file
                <input class="dialog-load_font" type="file" accept=".ttf,.otf,.woff,.woff2"/>
            </label>
        </div>
        <menu>
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" value="replace">Replace</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
// jshint ignore:end
export class UIDialogHandleFontMissing extends _DialogBase {
    static TEMPLATE = UI_DIALOG_HANDLE_FONT_MISSING; // jshint ignore:line
    constructor(domTool, loadFile) {
        super(domTool);
        this._loadFile = loadFile;
        [this.element, this._name, this._fonts, this._loadFont, this._methods] = this._initTemplate();
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , name = dialog.querySelector('.dialog-font_name')
          , fonts = dialog.querySelector('.dialog-fonts')
          , loadFont = dialog.querySelector('.dialog-load_font')
          , methods = new Map([...dialog.querySelectorAll('input[name=method]')].map(elem=>[elem.value, elem]))
          ;
        fonts.addEventListener('focus', ()=>{methods.get('select').checked=true;});
        loadFont.addEventListener('change', ()=>{
            const radio = methods.get('file');
            radio.checked=true;
            radio.disabled=false;
            methods.get('select').disabled=false;
        });
        return [dialog, name, fonts, loadFont, methods];
    }

    async show(fontParticles, fonts) {
        const promise = super.show()
          , dialog = this.element
          ;
        this._name.append(`"${fontParticles.join('; ')}"`);
        this._fonts.append(...fonts.map(([fontName, label])=>{
            const option = this._domTool.createElement('option');
            option.value = fontName;
            option.textContent = label;
            return option;
        }));
        dialog.returnValue = null;
        dialog.showModal();

        return promise.then(action=>{
            if(action !== 'replace') return action;
            if(this._methods.get('file').checked)
                return this._loadFile(...this._loadFont.files);
            // assert this._methods.get('select').checked
            return this._fonts.value;
        });
    }
}

// jshint ignore:start
const UI_DIALOG_MANAGE_FONTS =`<dialog>
    <form method="dialog">
      <fieldset>
        <legend>Manage fonts</legend>
        <p>Select fonts for removal from local storage:</p>
        <ul class="dialog-multi_select_fonts"></ul>
        <menu>
          <p class="dialog-action_description"></p>
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" value="remove">Remove</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
// jshint ignore:end
export class UIDialogManageFonts extends _DialogBase {
    static TEMPLATE = UI_DIALOG_MANAGE_FONTS; // jshint ignore:line

    constructor(domTool, removeFonts) {
        super(domTool);
        this._removeFonts = removeFonts;
        [this.element, this._form, this._fonts, this._actionDescription] = this._initTemplate();
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , form =  dialog.querySelector('form')
          , fonts = dialog.querySelector('.dialog-multi_select_fonts')
          , actionDescription = dialog.querySelector('.dialog-action_description')
          ;
        fonts.addEventListener('change', this._fontsChangeHandler.bind(this));
        return [dialog, form, fonts, actionDescription];
    }

    _getSelectedFonts() {
        const formData = new this._domTool.window.FormData(this._form);
        return formData.getAll('dialog_multi-select-fonts');
    }

    _fontsChangeHandler(/*event*/) {
        const fonts = this._getSelectedFonts();
        this._actionDescription.textContent = fonts.length
            ? `Remove ${fonts.length} font${fonts.length === 1 ? '' : 's'}.`
            : `Nothing seleced, nothing to do.`
            ;
    }

    async show(fonts) {
        const promise = super.show()
          , dialog = this.element
          ;

        this._fonts.append(...fonts.map(([fontName, labelText])=>{
            const radio = this._domTool.createElement('input', {type: 'checkbox'})
              , label = this._domTool.createElement('label',null, [radio, ' ', labelText])
              , li = this._domTool.createElement('li',null, label)
              ;
            radio.value = fontName;
            radio.name = 'dialog_multi-select-fonts';
            return li;
        }));
        this._fontsChangeHandler();
        dialog.returnValue = null;
        dialog.showModal();

        return await promise.then(action=>{
            if(action !== 'remove') return action;
            fonts = this._getSelectedFonts();
            if(fonts.length)
                return this._removeFonts(fonts);
        });
    }
}

