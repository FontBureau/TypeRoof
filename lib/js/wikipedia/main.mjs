import { ShellController } from '../shell.mjs';

import {
    Path
  , getEntry
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseComponent
} from '../components/basics/component.mjs';

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

import { convertDocument } from "./ingest";

import { traverseDom } from "./ingest_next";

import * as TypeStage from '../components/layouts/type-stage/index.typeroof.jsx';

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
    ['TypeStage', 'Type Stage', TypeStage, LAYOUT_GROUP_DEFAULT]
]);

function _addListener(node, eventName, callback, ...args) {
    node.addEventListener( eventName, callback, ...args);
}
function _removeListener(node, eventName, callback, ...args) {
        node.removeEventListener(eventName, callback, ...args);
}


// This can't have the playing item directly as a dependency,
// as it won't be always available for each layout.
class UIVisibilityManager extends _BaseComponent {
    visibleClass = 'visible';
    constructor(widgetBus, isPlayingPath) {
        super(widgetBus);
        this._isPlayingPath = isPlayingPath;
        this.node = widgetBus.wrapper.host;
        this._timeout = null;
        this._listenerPointermove = null;
        this._listenerPointerleave = null;
        this._mode = null;

        // TODO: available modes and their behavior
        // must be documented in player/iframe options.
        for(const mode of ['screengrab', 'no-chrome']) {
            if(widgetBus.uiFlags.has(mode)) {
                this.setMode(mode);
                break;
            }
        }
        if(this._mode === null)
            this.setMode('default');
    }

    setMode(mode) {
        this._mode = mode;
        const root = this.getEntry('/')
          , isPlaying = getEntry(root, this._isPlayingPath, {value: true}).value
          ;
        this.setPlayingState(isPlaying);
    }

    _startListening() {
        if(this._listenerPointermove !== null)
            return;
        this._listenerPointermove = [this.node, 'pointermove', (/*event*/)=>this._addVisibilityAndTimeout()];
        _addListener(...this._listenerPointermove)
        this._listenerPointerleave = [this.node, 'pointerleave', (/*event*/)=>this._removeVisibilty()];
        _addListener(...this._listenerPointerleave);
    }

    _stopListening() {
        if(this._listenerPointermove === null)
            return;
        _removeListener(...this._listenerPointermove);
        this._listenerPointermove = null;
        _removeListener(...this._listenerPointerleave);
        this._listenerPointerleave = null;
    }

    _addVisibilityAndTimeout(disappearTime=1500) {
        this._addVisibility();
        this._cancelTimeout();
        this._timeout = this._domTool.window.setTimeout(this._removeVisibilty.bind(this), disappearTime);
    }

    _cancelTimeout() {
        if(this._timeout !== null)
            this._domTool.window.clearTimeout(this._timeout);
        this._timeout = null;
    }
    _addVisibility() {
        this.node.classList.add(this.visibleClass);
    }
    _removeVisibilty() {
        this.node.classList.remove(this.visibleClass);
    }
    destroy() {
        this._cancelTimeout();
        this._stopListening();
        this._removeVisibilty();
        super.destroy();
    }

    _toggleVisibilityAutomatic(automaticOn, visible=true) {
        if(!automaticOn) {
            this._cancelTimeout();
            this._stopListening();
            if(visible)
                this._addVisibility();
            else
                this._removeVisibilty();
        }
        else {
            this._startListening();
            if(visible)
                // When pressing play, hide chrome immediately.
                this._addVisibilityAndTimeout(0);
            else
                this._removeVisibilty();
        }
    }

    setPlayingState(isPlaying) {
        // automatic === playing
        //    -> when playing automatic is on
        //    -> when no playing automatic is off
        // when in screengrab mode isPlaying=false should still
        // set automaticOn=true.
        let automaticOn
          , visible = true
          ;
        if(this._mode === 'no-chrome') {
            automaticOn = false;
            visible = false;
        }
        else if(this._mode === 'screengrab')
            automaticOn = true;
        else // default
            automaticOn = isPlaying;
        this._toggleVisibilityAutomatic(automaticOn, visible);
    }
}

class ToggleFullscreen extends _BaseComponent {
    static TEMPLATE = `
        <button class="ui_toggle_fullscreen">
            Toggle Fullscreen
            <span class="material-symbols-outlined">open_in_full</span>
        </button>
    `;
    constructor(widgetBus, fullScreenElement) {
        super(widgetBus);
        this._element = this._initTemplate(fullScreenElement);
    }
    _initTemplate(fullScreenElement) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
        this._insertElement(element);
        element.addEventListener('click', ()=> {
            if (document.fullscreenElement) {
                document.exitFullscreen();
                return;
            }
            // Otherwise enter fullscreen mode
            fullScreenElement.requestFullscreen().catch((err) => {
                console.error(`${this} Error enabling fullscreen: ${err.message}`);
            });
        });
        return [element];
    }
}

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
            console.log('"converted"', convertDocument(dom));
            const activeMarks = [],
                outputNodes = [];
            console.log('"traversed"', traverseDom(dom, activeMarks, outputNodes), 'activeMarks', activeMarks, 'outputNodes', outputNodes);
        }
    }
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
                { zone: 'wrapper'
                , id: 'visibility-manager'
                }
              , []
              , UIVisibilityManager
              , rootPath.append('playing')// isPlayingPath
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
                [],
                UIQueryGetWikipedia
            ]
          , [
                {zone: 'general-settings'}
              , []
              , ToggleFullscreen
              , widgetBus.domTool.document.body
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
