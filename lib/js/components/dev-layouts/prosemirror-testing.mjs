import {
    _BaseComponent
  , _BaseContainerComponent
} from '../basics.mjs';

import {
    _BaseLayoutModel
} from '../main-model.mjs';


// import {schema} from "prosemirror-schema-basic"
import {schema} from "./prosemirror-testing-schema"
// import {DOMParser} from "prosemirror-model"
import {EditorState} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import {undo, redo, history} from "prosemirror-history"
import {keymap} from "prosemirror-keymap"
import {baseKeymap, toggleMark} from "prosemirror-commands"


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


        let state = EditorState.create({
            schema
          , plugins: [
                history()
              , keymap({"Mod-z": undo, "Mod-y": redo
                    , "Mod-b": toggleMark(schema.marks.strong)
                    , "Mod-B": toggleMark(schema.marks.strong)
                })
              , keymap(baseKeymap)
            ]
            // doc: DOMParser.fromSchema(schema).parse(this.element)
        })
        let view = new EditorView(this.element, {
            state
          , dispatchTransaction(transaction) {
                console.log("Document size went from", transaction.before.content.size,
                        "to", transaction.doc.content.size,'\ntransaction:', transaction);
                // crazy? As far as I understand it, we would map this to
                // our own document implementation and then use our own
                // change detection mechanism to create a newState and
                // send that to updateState... that way, our model is
                // fully involved and all the data is serialized.
                //
                // It's probably overkill to reconstruct the inner workings
                // of the apply method to change our own implementation,
                // given that we can work with newState to update our
                // document. we can use the immutable properties, should
                // be relatively cheap. Then, when we receive our update
                // we could even try to update this newState with the update
                // i.e. we keep newState around and if the update doesn't
                // bring anything new, we send that newState to updateState
                // otherwise, we construct a new element...
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
