/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    Path
  , ForeignKey
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

import {
    InstalledFontsModel
} from './main-model.mjs';

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

    async _asyncResolve(resourceRequirement) {
        console.log(`${this}._asyncResolve request ${resourceRequirement}`  );

        const [indicator, ...args] = resourceRequirement.description;
        if(indicator instanceof ForeignKey) {
            // ForeignKey:installedFonts NOT NULL], [model InstalledFontsModel], from-file Tilt Prism Regular Version_1-000]
            const [targetContainer, requiredKey] = args;
            if(targetContainer.constructor === InstalledFontsModel) {
                // The return value is a key, that must be in installedFonts
                // when returned.
                // TODO: resolve InstalledFonts
                //    Simplest to hardest:
                //    - the font may already be installed in the app installedFonts
                //          -> just copy the entry
                //    - the font is already in availableFonts
                //          -> must be installed and moved
                //          -> eventually, the app installedFonts must receive this
                //             or it is uninstalled again -> there may be a
                //             garbage collector mechanism
                //    - the user may be asked to change the required font
                //      to one that is available, may already be installed
                //      as well.
                //    - the user will load/drop a fonts.
                //      In this case we'll have to change availableFonts eventually.

                        // this is the canonical way to get the state dependencies
                        // as seen in shell.mjs _useStateDependencyDraft
                const stateDependencies = this.getEntry('/').dependencies
                  , installedFonts = stateDependencies['installedFonts']
                  , availableFonts = stateDependencies['availableFonts']
                  ;
                if(installedFonts.has(requiredKey)) {
                    // NOTE: this shouldn't be required in that case!
                    // WELL: actually we do it to detect which of the installedFonts
                    // are actually used!
                    targetContainer.set(requiredKey, installedFonts.get(requiredKey));
                    return requiredKey;
                }
                if(availableFonts.has(requiredKey)) {
                    // temporary to bootstrap as the rawInstalledFont must
                    // be completely resource managed eventually.
                    // This is
                    console.log(`${this}._asyncResolve installing available font for key: ${requiredKey}`);
                    const rawInstalledFont = await this.widgetBus.fontManager._rawInstallFont(availableFonts, requiredKey);
                    targetContainer.set(requiredKey, rawInstalledFont);
                    return requiredKey;
                }
                // The main case should be the second case above: the font is
                // available but not installed. The cases below should be more
                // common when a state is e.g. send to another person i.e.
                // opened in a new browser.
                //
                // install, switch/remap font ???
                // in case of switch/remap, all later occurences of
                // the key should be remapped as well!
                throw new Error(`RESOURCE ERROR ${this}._asyncResolve the font ${requiredKey} is not available`);
                const returnVal = 'Hello';
                console.log(`REQUIRE InstalledFontsModel targetContainer ${targetContainer}`, targetContainer
                    , `\nrequiredKey "${requiredKey}" returning ${returnVal}`);
                return returnVal;
            }
            // else if(targetContainer.constructor === AvailableFontsModel)
            //      NOTE: it doesn't work this way!!!
            //      this won't be directly required!
            //      resolve AvailableFontsModel
            else
                throw new Error(`RESOURCE ERROR don't know how to resolve ${resourceRequirement}`);
        }
        throw new Error(`RESOURCE ERROR dont know how to handle ${resourceRequirement}`);
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
              , setAppStateFN = this.widgetBus.updateState//.replaceState
              , asyncResolve = this._asyncResolve.bind(this)
              , useStateDependencyDraftFN = this.widgetBus.useStateDependencyDraft
              ;
            ctorArgs.push(getAppStateFN, setAppStateFN, asyncResolve, useStateDependencyDraftFN);
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
