/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    Path
} from '../metamodel.mjs';
import {
    _BaseContainerComponent
} from './basics.mjs';

import {
    FontSelect
  , AddFonts
} from './font-loading.mjs';

import {
    GenericSelect
} from './generic.mjs';

import * as ExampleLayout from './layouts/example.mjs';
import * as ExampleKeyMomentsLayout from './layouts/example-key-moments.mjs';
import * as PentrekLayout from './layouts/pentrek.mjs';
import * as StageAndActorsLayout from './layouts/stage-and-actors.mjs';
import * as VideoproofArrayLayout from './layouts/videoproof-array.mjs';
import * as VideoproofArrayV2Layout from './layouts/videoproof-array-v2.mjs'

export const Layouts = Object.freeze([
    ['Example', 'Example', ExampleLayout]
  , ['ExampleKeyMoments', 'Example Key Moments', ExampleKeyMomentsLayout]
  , ['ExamplePentrek', 'Example Pentrek', PentrekLayout]
  , ['StageAndActors', 'Stage and Actors', StageAndActorsLayout]
  , ['VideoproofArray', 'Videoproof Array', VideoproofArrayLayout]
  , ['VideoproofArrayV2', 'Videoproof Array V2', VideoproofArrayV2Layout]
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
              , ['before-layout', '.typeroof-layout-before']
              , ['layout', '.typeroof-layout']
              , ['after-layout', '.typeroof-layout-after']
        ].map(([name, selector])=>[name, widgetBus.domTool.document.querySelector(selector)]));
        // [zoneName, dependecyMappings, Constructor, ...args] = widgets[0]
        const widgets = [
            [
                {zone: 'main'}
              , [
                // dependencyMappings
                // path => as internal name
                    ['availableFonts', 'options']
                  , 'activeFontKey'
                ]
              , FontSelect
            ]
          , [
                {zone: 'main'}
              , [
                    'activeFontKey'
                ]
              , AddFonts
            ]
          , [
                {zone: 'main'}
              , [
                    ['availableLayouts', 'options']
                  , ['activeLayoutKey', 'value']
                ]
              , GenericSelect
              , 'ui_layout_select'// baseClass
              , 'Layout'// labelContent
              , (key, availableLayout)=>{ return availableLayout.get('label').value; } // optionGetLabel
            ]
            // only create when activeState is a Layout.Model
          , ...(Layouts.map(([/*key*/, /*label*/, Layout])=>{
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
