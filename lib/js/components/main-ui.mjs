/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    Path
} from '../metamodel.mjs';
import {
    _BaseContainerComponent
  , _BaseComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_NO_UPDATE
} from './basics.mjs';

import {
    FontSelect
  , AddFonts
  , UIDialogManageFonts
} from './font-loading.mjs';

import {
    UIDialogManageState
} from './ui-dialog-manage-state.mjs';

import {
    GenericSelect
  , collapsibleMixin
} from './generic.mjs';

import * as ExampleLayout from './layouts/example.mjs';
import * as ExampleKeyMomentsLayout from './layouts/example-key-moments.mjs';
import * as PentrekLayout from './layouts/pentrek.mjs';
import * as StageAndActorsLayout from './layouts/stage-and-actors.mjs';
import * as VideoproofArrayLayout from './layouts/videoproof-array.mjs';
import * as VideoproofArrayV2Layout from './layouts/videoproof-array-v2.mjs';
import * as TypeSpecRamp from './layouts/type-spec-ramp.mjs';

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
  , ['StageAndActors', 'Stage and Actors', StageAndActorsLayout, LAYOUT_GROUP_DEFAULT]
  , ['VideoproofArrayDev', 'Videoproof Array (Interim)', VideoproofArrayLayout, LAYOUT_GROUP_DEVELOPMENT]
  , ['VideoproofArray', 'Videoproof Array', VideoproofArrayV2Layout, LAYOUT_GROUP_VIDEO_PROOF]
  , ['TypeSpecRamp', 'TypeSpec – Ramp', TypeSpecRamp, LAYOUT_GROUP_TYPE_TOOLS]
]);

/**
 * TODO: If required: would be nice to have some control over these. I.e.
 *  - If a dialog is open, don't open another dialog.
 *  - Also, propagate updates to opened dialogs, so that they can react on
 *    state changes.
 *  - maybe this should rather be a _BaseContainerComponent
 *
 */
class UIDialogOpeners extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE
    static TEMPLATE = `<fieldset class="ui-dialog_openers">
        <legend><!-- insert: label --></legend>
        <ul class="ui-dialog_openers-items"></ul>
    </fieldset>`;
    constructor(widgetBus, label) {
        super(widgetBus);

        this._dialogs = [
            [UIDialogManageFonts, 'Manage fonts']
          , [UIDialogManageState, 'save / load / share']
        ];


        [this.element] = this.initTemplate(label, this._dialogs);
    }

    initTemplate(label, dialogs) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , items = element.querySelector('.ui-dialog_openers-items')
          , itemsEntries = []
          ;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);


        for(const [i, [, label]] of dialogs.entries()) {
            const buttton =  this._domTool.createElement('a', {'class': 'ui-dialog_openers-item-button'}, label)
              , li = this._domTool.createElement('li', {'class': 'ui-dialog_openers-item'}, buttton)
              ;
            buttton.addEventListener('click', this._openDialogHandler.bind(this, i));
            itemsEntries.push(li);
        }
        items.append(...itemsEntries);
        this._insertElement(element);
        collapsibleMixin(element, 'legend');
        return [element];
    }

    async _openDialogHandler(index, event) {
        event.preventDefault();
        const [Constructor] =  this._dialogs[index]
          , ctorArgs = []
          , showArgs = []
          ;

        console.log(`${this}._openDialog(${index}):`, this._dialogs[index][1]);

        // FIXME/TODO: Make the Dialogs in here into regular components,
        // then they can provide these specifics themselves.
        if(Constructor === UIDialogManageFonts) {
            // FIXME: ultra specific for UIDialogManageFonts
            // availableFonts list could be updated live, it would be cool
            // to add the dependency dynamically to UIDialogOpeners
            // list of [fontName, labelText]
            const availableFonts = this.getEntry('availableFonts')
              , fonts = []
              ;
            for(const [key, {value:font}] of availableFonts) {
                if(font.origin.type !== 'from-file')
                    continue;
                fonts.push([key, font.nameVersion]);
            }
            const removeFontsFN = async (fontNames)=>{ // removeFontsFN
                console.log(`${this} remove fonts callback args:`, fontNames);
                if(!fontNames.length) return;
                return await this.widgetBus.changeState(async ()=>{
                    return await this.widgetBus.removeFontsFromFiles(...fontNames)
                        .then(result=>{
                            console.log('removeFontsFromFiles result:', result)
                            return {result, 'augmented': true};
                        });
                });
            }
            ctorArgs.push(removeFontsFN);
            showArgs.push(fonts);
        }

        if(Constructor === UIDialogManageState) {
            const getAppStateFN = ()=>this.getEntry('/')
              , setAppStateFN = likeADraft=>{
                  // => make sure this goes the async path
                    this.widgetBus.requireReviewResources();
                    return this.widgetBus.updateState(likeADraft)//.replaceState
                }
              ;
            ctorArgs.push(getAppStateFN, setAppStateFN);
        }
        const dialog = new Constructor(this._domTool, ...ctorArgs)
          , result = await dialog.show(...showArgs)
          ;
        console.log('Dialog result:', result);
        dialog.destroy();
        return result;
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
              , [] //allowNull
              , null //onChangeFn
              , (availableLayout)=>{ // optionGetGroup
                    var groupKey = availableLayout.get('groupKey').value
                        // => empty label should not be an actual group, just output directly into default/root?
                        // that way there's no difference in the UI between different groups when they have the
                        // empty label, also, no different ordering.
                      , label = LAYOUT_GROUPS[groupKey].label || ''
                      , index = LAYOUT_GROUPS[groupKey].index
                      ;
                    return [groupKey, label, index];
                }
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
          , [
                {zone: 'after-main'}
              , [
                    ['availableFonts']
                ]
              , UIDialogOpeners
              , 'Application Meta'
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
