// FIXME: _DialogBase should extend _BaseComponent, so that it can
// be initialized like that as well.
export class _DialogBase {
    constructor(domTool) {
        this._domTool = domTool;
        this._resolvers = null;
    }

    toString() {
        return `[Dialog ${this.constructor.name}]`;
    }

    _initTemplate() {
        const dialog = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        dialog.addEventListener("close", () => {
            this._resolve(dialog.returnValue);
        });
        this._domTool.document.body.append(dialog);
        return [dialog];
    }

    async show() {
        if(this._resolvers)
            throw new Error(`Dialog is already waiting for input.`);
        return new Promise((resolve, reject)=>{
            this._resolvers = {resolve, reject};
        });
    }

    _resolve(value) {
        if(!this._resolvers)
            throw new Error(`Dialog is not active.`);
        const resolve = this._resolvers.resolve;
        this._resolvers = null;
        resolve(value);
    }

    _reject(reason) {
        if(!this._resolvers)
            throw new Error(`Dialog is not active.`);
        const reject = this._resolvers.reject;
        this._resolvers = null;
        reject(reason);
    }

    destroy() {
        if(this._resolvers)
            this._reject('Dialog destroyed.');
        this.element.remove();
    }
}
