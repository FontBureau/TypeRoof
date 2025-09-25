import { ShellController } from './shell.mjs';

import {
    Path
  , getEntry
} from './metamodel.mjs';
import {
    _BaseContainerComponent
  , _BaseComponent
} from './components/basics.mjs';

import {
    FontSelect
  , UIDialogManageFonts
} from './components/font-loading.mjs';

import {
    UIDialogManageState
} from './components/ui-dialog-manage-state.mjs';

import {
    UIDialogOpeners
} from './components/ui-dialog-openers.mjs';

import {
    StaticNode
  , StaticTag
  , collapsibleMixin
} from './components/generic.mjs';

import {PlayerLayout as StageAndActorsLayout} from './components/layouts/stage-and-actors.mjs';
import * as VideoproofArrayLayout from './components/dev-layouts/videoproof-array.mjs';
import * as VideoproofArrayV2Layout from './components/layouts/videoproof-array-v2.mjs';
import * as TypeSpecRamp from './components/layouts/type-spec-ramp.mjs';
import * as TypeToolsGrid from './components/layouts/type-tools-grid.mjs';

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
    ['StageAndActors', 'Stage and Actors', StageAndActorsLayout, LAYOUT_GROUP_DEFAULT]
  , ['VideoproofArrayDev', 'Videoproof Array (Interim)', VideoproofArrayLayout, LAYOUT_GROUP_DEFAULT]
  , ['VideoproofArray', 'Array', VideoproofArrayV2Layout, LAYOUT_GROUP_DEFAULT]
  , ['TypeToolsGrid', 'Grid', TypeToolsGrid, LAYOUT_GROUP_DEFAULT]
  , ['TypeSpecRamp', 'TypeSpec - Ramp', TypeSpecRamp, LAYOUT_GROUP_DEFAULT]
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

class MonitorPlayingState extends _BaseComponent {
    constructor(widgetBus, onChange) {
        super(widgetBus);
        this._onChange = onChange;
    }
    update(changedMap) {
        if(changedMap.has('playing')) {
            const value  = changedMap.get('playing').value;
            this._onChange(value);
        }
    }
}

class ToggleFullscreen extends _BaseComponent {
    static TEMPLATE = `<button class="ui_toggle_fullscreen">Toggle Fullscreen</button>`
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

/**
 * This knows a lot about the host document structure, which must comply.
 * It lso knows about the model structure, but it translates that knowledge
 * to it's children so they can be more generic.
 */
export class MainUIController extends _BaseContainerComponent {
    // Looking initially for three (then four) target zones.
    //    main => in the sidebar in desktop sizes
    //    before-layout => where we put the animation controls
    //    layout => entirely controlled by the layout widget.
    //    (after-layout =>below proof, maybe for animation editing/keymoments etc. not yet implemented)
    constructor(widgetBus) {
        const zones = new Map([
                ['main', '.typeroof-ui_main']
              , ['after-main' ,'.typeroof-ui_main-after']
              , ['before-layout', '.typeroof-layout-before']
              , ['layout', '.typeroof-layout']
              , ['after-layout', '.typeroof-layout-after']
              , ['wrapper', 'body .wrapper']
             ].map(([name, selector])=>[name, widgetBus.domTool.document.querySelector(selector)]))
           , generalSettingsContainer = widgetBus.domTool.createElement('fieldset', {'class': 'general-settings'})
           , applicationMetaContainer = widgetBus.domTool.createElement('fieldset', {'class': 'application-meta'})
          ;
        zones.set('general-settings' , generalSettingsContainer);
        zones.set('application-meta' , applicationMetaContainer);
        collapsibleMixin(applicationMetaContainer, 'legend');
        // [zoneName, dependecyMappings, Constructor, ...args] = widgets[0]
        const rootPath = Path.fromParts('.', 'activeState');
        const widgets = [
            [
                { zone: 'wrapper'
                , id: 'visibility-manager'
                }
              , []
              , UIVisibilityManager
              , rootPath.append('playing')// isPlayingPath
            ]
          , [
                {
                    rootPath: rootPath
                  , zone: 'main'
                  , activationTest:()=>{
                       const activeState = this.widgetBus.getEntry(rootPath);
                       // TODO: something like activeState.implements(timeControlMixin);
                       // would be great.
                       return activeState.has('playing');
                    }
                }
              , [
                    'playing'
                ]
              , MonitorPlayingState
              , function(value) {
                    this.widgetBus.getWidgetById('visibility-manager').setPlayingState(value);
                }
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
                {zone: 'general-settings'}
              , [
                // dependencyMappings
                // path => as internal name
                    ['availableFonts', 'options']
                  , 'activeFontKey'
                ]
              , FontSelect
            ]
          , [
                {zone: 'general-settings'}
              , []
              , ToggleFullscreen
              , widgetBus.domTool.document.body
            ]
          , [
                {zone: 'after-main'}
              , []
              , StaticNode
              , applicationMetaContainer
            ]
          , [
                {zone: 'application-meta'}
              , []
              , StaticTag
              , 'legend'
              , {}
              , 'Application Meta'
            ]
          , [
                {zone: 'application-meta'}
              , [
                    ['availableFonts'] // required by UIDialogManageFonts
                ]
              , UIDialogOpeners
              , [
                    [UIDialogManageFonts, 'Manage fonts']
                  , [UIDialogManageState, 'Save / Load / Share']
                ]
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
