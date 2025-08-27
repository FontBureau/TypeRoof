import {
    _BaseComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_NO_UPDATE
} from './basics.mjs';

/**
 * TODO: If required: would be nice to have some control over these. I.e.
 *  - If a dialog is open, don't open another dialog.
 *  - Also, propagate updates to opened dialogs, so that they can react on
 *    state changes.
 *  - maybe this should rather be a _BaseContainerComponent
 *
 */
export class UIDialogOpeners extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE
    static TEMPLATE = `<ul class="ui-dialog_openers-items"></ul>`;
    constructor(widgetBus, dialogs) {
        super(widgetBus);
        this._dialogs = dialogs;
        [this.element] = this.initTemplate(this._dialogs);
    }

    initTemplate(dialogs) {
        const items = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , itemsEntries = []
          ;


        for(const [i, [, label]] of dialogs.entries()) {
            const buttton =  this._domTool.createElement('a', {'class': 'ui-dialog_openers-item-button'}, label)
              , li = this._domTool.createElement('li', {'class': 'ui-dialog_openers-item'}, buttton)
              ;
            buttton.addEventListener('click', this._openDialogHandler.bind(this, i));
            itemsEntries.push(li);
        }
        items.append(...itemsEntries);
        this._insertElement(items);
        return [items];
    }

    async _openDialogHandler(index, event) {
        event.preventDefault();
        const [Constructor] =  this._dialogs[index]
          , ctorArgs = []
          , showArgs = []
          ;

        console.log(`${this}._openDialog(${index}):`, this._dialogs[index][1]);
        // then they can provide these specifics themselves.
        if(Constructor.hostInit) {
            const [_ctorArgs, _showArgs] =  Constructor.hostInit.call(this);
            ctorArgs.push(..._ctorArgs);
            showArgs.push(..._showArgs);
        }

        const dialog = new Constructor(this._domTool, ...ctorArgs)
          , result = await dialog.show(...showArgs)
          ;
        console.log('Dialog result:', result);
        dialog.destroy();
        return result;
    }
}
