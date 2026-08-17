import { ShellController } from '../shell.mjs';

import {
    Path
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseComponent
} from '../components/basics/component.mjs';

import {
    UIButton
} from '../components/basics/ui-button.mjs';

import {
    createIcon
} from '../components/icons.mjs';

import {
    AppMenu
} from '../components/app-menu.typeroof.jsx';

import {
    AddFonts
} from '../components/font-loading.mjs';

import {
    UIManageFonts
} from '../components/font-manager.typeroof.jsx';

import {
    StaticNode
  , Collapsible
} from '../components/generic.mjs';

import {
    IDRegistry
} from '../components/dom-id-registry.mjs';

import { createAndGetDefaultZones } from "../zones.typeroof.jsx";

// Phase 3: convertDocument kept for operator reference, no longer called.
// import { convertDocument } from "./ingest";

import { ingestWikipediaDocument } from "./ingest";

import {
    Controller as TypeStageController,
    createTypeStageModelVariantWithDefaults
} from '../components/layouts/type-stage/index.typeroof.jsx';

import DEFAULT_STATE from "./type-stage-wikipedia-initial-state.json" with { type: "json" };

const TypeStageWikipediaModel = createTypeStageModelVariantWithDefaults ('TypeStageWikipediaModel', DEFAULT_STATE),
    TypeStageWikipedia = {
        Controller: TypeStageController,
        Model: TypeStageWikipediaModel
    };

const LAYOUT_GROUP_DEFAULT = Symbol('LAYOUT_GROUP_DEFAULT')
  , LAYOUT_GROUPS = Object.fromEntries(
        [
            [LAYOUT_GROUP_DEFAULT, {label: 'TypeRoof Original'}]
        ].map(([key, data], index)=>[key, Object.freeze(Object.assign({}, data, {index}))])
    )
  ;
Object.defineProperty(LAYOUT_GROUPS, 'default', {
    value: LAYOUT_GROUP_DEFAULT
  , enumerable: false
});
Object.freeze(LAYOUT_GROUPS);

export const Layouts = Object.freeze([
    ['TypeStageWikipedia', 'Type Stage Wikipedia', TypeStageWikipedia, LAYOUT_GROUP_DEFAULT]
]);

async function fetchAndParseHTML(url) {
    try {
        const response = await fetch(url)
        if (!response.ok)
            return [null, `HTTP error for url: "${url}" status: ${response.status}`];
        const htmlText = await response.text(),
           parser = new DOMParser(),
           doc = parser.parseFromString(htmlText, 'text/html');
        return [doc, null];
    }
    catch (error) {
        return [null, `Failed to fetch and parse DOM from wikipedia ${url}: ${error}`];
    }
}

async function fetchFromWikipedia(slug, wikiLanguage) {
    const url = `https://${wikiLanguage}.wikipedia.org/w/rest.php/v1/page/${slug}/html`;
    return fetchAndParseHTML(url);
}

class UIQueryGetWikipedia extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        [this.element, this._inputSlug, this._inputWiki, this._messageBox] = this._initTemplate();
    }
    _initTemplate() {
        const inputSlug = this._domTool.createElement('input', {type: "text", value: 'Typography'}),
            inputWiki = this._domTool.createElement('input', {type: "text", value: 'en'}),
            button = this._domTool.createElement('button', {type: 'submit'}, 'Load'),
            messageBox = this._domTool.createElement('p', {class: 'message-box', style: 'display:none'}),
            element = this._domTool.createElement('form', {},[
                this._domTool.createElement('label', {}, ['Wikipedia Language: ', inputWiki]),
                this._domTool.createElement('label', {}, ['Article Slug: ', inputSlug])
                , button
                , messageBox
            ]);
        element.addEventListener('submit', this._submitHandler.bind(this));

        this._insertElement(element);
        return [element, inputSlug, inputWiki, messageBox];
    }
    async _submitHandler(evt) {
        evt.preventDefault();
        console.log('submit to get:', this._inputWiki.value, this._inputSlug.value);
        const [dom, message] = await fetchFromWikipedia(this._inputSlug.value, this._inputWiki.value);
        if(message !== null) {
            this._messageBox.textContent = message;
            this._messageBox.style.display = '';
        }
        else {
            this._messageBox.textContent = '';
            this._messageBox.style.display = 'none';
            console.log('GOT DOM for parsing:', dom);
            const { document: immutableDoc } = ingestWikipediaDocument(
                dom,
                this.getEntry("proseMirrorSchema"),
            );
            this._changeState(() => {
                const documentPath = Path.fromString(
                    this.widgetBus.getExternalName('typeStageDocument'),
                );
                const parentDraft = this.widgetBus.getEntry(documentPath.parent);
                parentDraft.set(documentPath.parts.at(-1), immutableDoc);
            });
        }
    }
    update(){}
}

export class MainUIController extends _BaseContainerComponent {
    // Looking initially for three (then four) target zones.
    //    main => in the sidebar in desktop sizes
    //    before-layout => where we put the animation controls
    //    layout => entirely controlled by the layout widget.
    //    (after-layout =>below proof, maybe for animation editing/keymoments etc. not yet implemented)
    constructor(widgetBus) {
        const zones = createAndGetDefaultZones(
              widgetBus.domTool.h,
              widgetBus.domTool.document.body)
           , generalSettingsContainer = widgetBus.domTool.createElement('div', {'class': 'general-settings'})
           , fontsManagerContainer = widgetBus.domTool.createElement('div', {'class': 'fonts-manager'})
          ;
        zones.set('general-settings' , generalSettingsContainer);
        zones.set('fonts-manager' , fontsManagerContainer);
        // [zoneName, dependecyMappings, Constructor, ...args] = widgets[0]
        const rootPath = Path.fromParts('.', 'activeState');
        const widgets = [
            [
                {id: 'dom-global-id-registry'}
              , []
              , IDRegistry
            ]
          , [
                {zone: 'wrapper'},
                [],
                UIButton,
                createIcon('settings'),// label
                [['click', (/*evt*/)=>zones.get('wrapper').classList.add('settings-visible')]], //  eventHandlers
                {title: 'show settings', classPart: "show_settings"},//options = { title:null, classPart:null, elementAttributes:[], typeClassPart:null }]
            ]
          , [
                {zone: 'main'},
                [],
                UIButton,
                createIcon('close'),// label
                [['click', (/*evt*/)=>zones.get('wrapper').classList.remove('settings-visible')]], //  eventHandlers
                {title: 'close settings', classPart: "close_settings"},//options = { title:null, classPart:null, elementAttributes:[], typeClassPart:null }]
            ]
            // only create when activeState is a Layout.Model
          , ...(Layouts.map(([/*key*/, /*label*/, Layout, /* Group. defaultActive */])=>{

                    return [
                        {
                            rootPath: rootPath
                          , zone: 'main'
                          , activationTest:()=>{
                                const activeState = this.widgetBus.getEntry(rootPath);
                                // FIXME: (in theory) a model can have multiple
                                // controllers, and each combination would
                                // be it's own "Layout", hence this test should
                                // be differentiated.
                                return activeState.WrappedType === Layout.Model;
                            }
                        }
                      , []
                      , Layout.Controller
                      , zones
                    ];
            }))
          , [
                {zone: 'main'}
              , []
              , AppMenu
              , LAYOUT_GROUPS
            ]
          , [
                {zone: 'main'}
              , []
              , StaticNode
              , generalSettingsContainer
            ]
          , [
                {zone: 'main'}
              , []
              , Collapsible
              , 'Font'
              , fontsManagerContainer
            ]
          , [
                {zone: 'fonts-manager'}
              , [
                    'activeFontKey'
                  , 'availableFonts'
                  , 'installedFonts'
                ]
              , UIManageFonts
            ]
          , [
                {zone: 'fonts-manager'}
              , [
                    'activeFontKey'
                ]
              , AddFonts
              , widgetBus.domTool.document.body
              , '… or drag a font file onto the window'
            ]
          , [
                {zone: 'general-settings'},
                [
                    ['/activeState/document', 'typeStageDocument']
                  , ['/activeState/proseMirrorSchema', 'proseMirrorSchema']
                ],
                UIQueryGetWikipedia
            ]
        ];
        super(widgetBus, zones, widgets);
    }
    get dependencies() {
        const dependencies = super.dependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // FIXME: is this true?
        dependencies.add('/activeState');
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // FIXME: is this true?
        dependencies.add('/activeState');
        return dependencies;
    }
}

// Should not require to wait until load (all resources, images etc are loaded),
// so this would make it much quicker at startup.
function main() {
    // ensures the document is ready and can be queried
    // let mainUIElement = document.querySelector('.typeroof-ui_main');
    shellCtrl.setInitialDependency('ready', true);
}
const shellCtrl = new ShellController(window, { MainUIController, Layouts, LAYOUT_GROUPS });

if(document.readyState === 'loading')
    window.addEventListener('DOMContentLoaded', main);
else
    main();
