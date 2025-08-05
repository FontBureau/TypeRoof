import {
    _BaseComponent
  , _BaseContainerComponent
} from '../basics.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';


// import {schema} from "prosemirror-schema-basic"
import {schema} from "./prosemirror-testing-schema"
import {DOMParser} from "prosemirror-model"
import {EditorState} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import "prosemirror-view/style/prosemirror.css"


const ProsemirrorTestingModel = _BaseLayoutModel.createClass(
        'ProsemirrorTestingModel'
);

class Prosemirror extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div class="prosemirror-host"></div>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        this.element = this.initTemplate();


        let state = EditorState.create({schema
            // doc: DOMParser.fromSchema(schema).parse(this.element)
        })
        let view = new EditorView(this.element, {
            state
          , dispatchTransaction(transaction) {
                console.log("Document size went from", transaction.before.content.size,
                        "to", transaction.doc.content.size,'\ntransaction:', transaction);
                let newState = view.state.apply(transaction)
                view.updateState(newState)
            }
        });


    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return element;
    }
    update (changedMap) {
        console.log(`${this}.update(changedMap:${Array.from(changedMap.keys).join(', ')})`, changedMap);
    }
}

class ProsemirrorTestingController extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        const widgets = [
            [
                {zone: 'layout'}
              , []
              , Prosemirror
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}

export {
    ProsemirrorTestingModel as Model
  , ProsemirrorTestingController as Controller
};
