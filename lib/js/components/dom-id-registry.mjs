import { _BaseComponent } from './basics.mjs';

/**
 * CAUTION: I'm not sure what this element has to do eventually, this
 * is just a starting point. The reason for this is that <datalist> elements
 * https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/datalist
 * work via a dom id attribute. However, ids must be unique in the document
 * and we don't have so far a utility to ensure this. This will likely
 * have to change a lot, but at least we can better track where these
 * global resources are used.
 *
 * There are different usage scenarios, for a data-list, it
 * might be good to share it globally (language subtag regstry data), but
 * it can also be required to have local-only versions, where the id still
 * must be unique.
 *
 * CAUTION: this module doesn't have global state, it relies upon being
 * instantiated once, and only once, and being kept around as long as
 * necessary, there are no further checks of ID uniqueness beyond what's
 * in the instance state.
 *
 * NOTE: it's neccessary to have different versions of this per document!
 * The wdigetBus API getWidgetById can help with this, by registering
 * a new API for a sub-document that it manages.
 */

export class IDRegistry extends _BaseComponent {
    static DEFAULT_PREFIX = 'id-registry';

    constructor(widgetBus) {
        super(widgetBus);
        this.element = this._domTool.createElement('div', {class:'dom_global_id_registry-container', style: 'display:none'});
        this._domTool.document.body.append(this.element);
        this._counter = 0;
        this._sharedIds = new Map();
    }

    destroy() {
        this.element.remove();
        return super.destroy();
    }

    // general purpose
    generateUniqueId() {
        const id = `${this.constructor.DEFAULT_PREFIX}-${this._counter}`;
        this._counter += 1;
        return id;
    }

    /**
     * Only executes initElementFN if it is not already present.
     * No way to remove the shared element, unless the registry is
     * destroyed!
     */
    getSharedID(symbol, initElementFN) {
        if(!this._sharedIds.has(symbol)){
            const id = this.generateUniqueId()
              , element = initElementFN()
              ;
            element.id = id;
            // FIXME: we should probably check if the element is indeed
            // associated with this._domTool.document.
            this.element.append(element);
            this._sharedIds.set(symbol, id);
        }
        return this._sharedIds.get(symbol);
    }
}
