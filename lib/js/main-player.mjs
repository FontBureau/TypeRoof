import { ShellController } from './shell.mjs';

import {
    Path
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
]);


class UIVisibilityManager extends _BaseComponent {
    visibleClass = 'visible';
    constructor(widgetBus) {
        super(widgetBus);
        this.node = widgetBus.wrapper.host;
        this._timeout = null;
        this._listener = null;

        this._startListening();
    }

    _startListening() {
        if(this._listener !== null)
            return;
        this._listener = this._addVisibilityAndTimeout.bind(this);
        this.node.addEventListener('pointermove', this._listener);
    }

    _stopListening() {
        if(this._listener === null)
            return;
        this.node.removeEventListener('pointermove', this._listener);
        this._listener = null;
    }

    _addVisibilityAndTimeout(/*event*/) {
        this._addVisibility();
        this._cancelTimeout();
        this._timeout = this._domTool.window.setTimeout(this._removeVisibilty.bind(this), 1500);
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

    setVisibilityAutomatic(automatic, visible=true) {
        if(!automatic) {
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
                this._addVisibilityAndTimeout();
            else
                this._removeVisibilty();
        }
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
           , applicationMetaContainer = widgetBus.domTool.createElement('fieldset', {'class': 'application-meta'})
          ;
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
                    this.widgetBus.getWidgetById('visibility-manager').setVisibilityAutomatic(value);
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
                {zone: 'after-main'}
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
                // dependencyMappings
                // path => as internal name
                    ['availableFonts', 'options']
                  , 'activeFontKey'
                ]
              , FontSelect
            ]
          , [
                {zone: 'application-meta'}
              , [
                    ['availableFonts'] // required by UIDialogManageFonts
                ]
              , UIDialogOpeners
              , [
                    [UIDialogManageFonts, 'Manage fonts']
                  , [UIDialogManageState, 'save / load / share']
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
