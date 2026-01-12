/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    Path
} from '../metamodel.ts';
import {
    _BaseContainerComponent
} from './basics.mjs';
import {
    AppMenu
} from './app-menu.typeroof.jsx';

import {
    FontSelect
  , AddFonts
  , UIDialogManageFonts
} from './font-loading.mjs';

import {
    UIDialogOpeners
} from './ui-dialog-openers.mjs';

import {
    Collapsible
} from './generic.mjs';

import {
    IDRegistry
} from './dom-id-registry.mjs';

import * as ExampleLayout from './dev-layouts/example.mjs';
import * as ExampleKeyMomentsLayout from './dev-layouts/example-key-moments.mjs';
import * as PentrekLayout from './dev-layouts/pentrek.mjs';
import * as StageAndActorsLayout from './layouts/stage-and-actors.mjs';
import * as VideoproofArrayLayout from './dev-layouts/videoproof-array.mjs';
import * as VideoproofArrayV2Layout from './layouts/videoproof-array-v2.mjs';
import * as TypeSpecRamp from './layouts/type-spec-ramp.typeroof.jsx';
import * as TypeToolsGrid from './layouts/type-tools-grid.mjs';
import * as ExampleReactLayout from './dev-layouts/example-react.mjs';

const LAYOUT_GROUP_DEFAULT = Symbol('LAYOUT_GROUP_DEFAULT')
  , LAYOUT_GROUP_DEVELOPMENT = Symbol('LAYOUT_GROUP_DEVELOPMENT')
  , LAYOUT_GROUP_VIDEO_PROOF = Symbol('LAYOUT_GROUP_VIDEO_PROOF')
  , LAYOUT_GROUP_TYPE_TOOLS = Symbol('LAYOUT_GROUP_TYPE_TOOLS')
  , LAYOUT_GROUPS = Object.fromEntries(
        [
            [LAYOUT_GROUP_DEFAULT, {label: 'TypeRoof Original'}]
          , [LAYOUT_GROUP_VIDEO_PROOF, {label: 'Video Proof'}]
          , [LAYOUT_GROUP_TYPE_TOOLS, {label: 'Type Tools'}]
          , [LAYOUT_GROUP_DEVELOPMENT, {label: 'Development Artifacts'}]
        ].map(([key, data], index)=>[key, Object.freeze(Object.assign({}, data, {index}))])
    )
  ;
Object.defineProperty(LAYOUT_GROUPS, 'default', {
    value: LAYOUT_GROUP_DEFAULT
  , enumerable: false
});
Object.freeze(LAYOUT_GROUPS);
export {LAYOUT_GROUPS};

export const Layouts = Object.freeze([
    ['Example', 'Example', ExampleLayout, LAYOUT_GROUP_DEVELOPMENT]
  , ['ExampleKeyMoments', 'Example Key Moments', ExampleKeyMomentsLayout, LAYOUT_GROUP_DEVELOPMENT]
  , ['ExamplePentrek', 'Example Pentrek', PentrekLayout, LAYOUT_GROUP_DEVELOPMENT]
  , ['ExampleReact', 'Example React', ExampleReactLayout, LAYOUT_GROUP_DEVELOPMENT]
  , ['StageAndActors', 'Stage and Actors', StageAndActorsLayout, LAYOUT_GROUP_DEFAULT]
  , ['VideoproofArrayDev', 'Videoproof Array (Interim)', VideoproofArrayLayout, LAYOUT_GROUP_DEVELOPMENT]
  , ['VideoproofArray', 'Array', VideoproofArrayV2Layout, LAYOUT_GROUP_VIDEO_PROOF]
  , ['TypeToolsGrid', 'Grid', TypeToolsGrid, LAYOUT_GROUP_TYPE_TOOLS]
  , ['TypeSpecRamp', 'TypeSpec – Ramp', TypeSpecRamp, LAYOUT_GROUP_TYPE_TOOLS]
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
            ].map(([name, selector])=>[name, widgetBus.domTool.document.querySelector(selector)]))
        // [zoneName, dependecyMappings, Constructor, ...args] = widgets[0]
          , fontsManagerContainer = widgetBus.domTool.createElement('div', {'class': 'fonts-manager'})
          ;
        zones.set('fonts-manager' , fontsManagerContainer);

        const widgets = [
            [
                {id: 'dom-global-id-registry'}
              , []
              , IDRegistry
            ]
          , [
                {zone: 'main'}
              , []
              , AppMenu
              , LAYOUT_GROUPS
            ]
          , [
                {zone: 'main'}
              , []
              , Collapsible
              , 'Font'
              , fontsManagerContainer
              , true
            ]
          , [
                {zone: 'fonts-manager'}
              , [
                // dependencyMappings
                // path => as internal name
                    ['availableFonts', 'options']
                  , 'activeFontKey'
                ]
              , FontSelect
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
                {zone: 'fonts-manager'}
              , [
                    ['availableFonts']
                ]
              , UIDialogOpeners
              , [
                    [UIDialogManageFonts, 'Manage fonts...']
                ]
            ]
          
            // only create when activeState is a Layout.Model
          , ...(Layouts.map(([/*key*/, /*label*/, Layout, /* Group. defaultActive */])=>{
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
