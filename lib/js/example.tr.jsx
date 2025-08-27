
import {
   _BaseComponent
} from './components/basics.mjs';


export class Example extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        console.log(this);
        [this.node] = this._initTemplate();
        this._insertElement(this.node);
    }
    _initTemplate() {
        const h = this._domTool.h;
        return [<h1>hello</h1>];
    }
}
