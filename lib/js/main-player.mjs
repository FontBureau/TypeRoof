import { ShellController } from './shell.mjs';

import {
    Path
} from './metamodel.mjs';
import {
    _BaseContainerComponent
} from './components/basics.mjs';


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
        ].map(([name, selector])=>[name, widgetBus.domTool.document.querySelector(selector)]));
        // [zoneName, dependecyMappings, Constructor, ...args] = widgets[0]
        const widgets = [
            // only create when activeState is a Layout.Model
           ...(Layouts.map(([/*key*/, /*label*/, Layout, /* Group. defaultActive */])=>{
                    const rootPath = Path.fromParts('.', 'activeState');
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
