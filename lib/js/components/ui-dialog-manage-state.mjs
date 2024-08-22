import {
   _DialogBase
} from './basics.mjs';

import {
    serialize
  , deserialize
  , SERIALIZE_OPTIONS
} from '../metamodel.mjs';

export class UIDialogManageState extends _DialogBase {
    static TEMPLATE = `<dialog class="ui-dialog-manage_state">
    <form method="dialog">
      <fieldset>
        <legend>Manage State</legend>
        <p>Serialize options: (none)</p>
        <menu>
          <button class="ui-dialog-manage_state-serialize">Serialize</button>
          <button class="ui-dialog-manage_state-deserialize">Deserialize</button>
          <button type="submit" value="cancel">Exit</button>
        </menu>
      </fieldset>
      <fieldset>
        <legend>Serialization Result</legend>
        <textarea class="ui-dialog-manage_state-serialize_output"></textarea>
      </fieldset>
    </form>
  </dialog>
`;

    constructor(domTool, getAppState, setAppState, asyncResolve, useStateDependencyDraft) {
        super(domTool);
        this._getAppState = getAppState;
        this._setAppState = setAppState;
        this._asyncResolve = asyncResolve;
        this._useStateDependencyDraft = useStateDependencyDraft;
        [this.element, this._form, this._serializeOutput] = this._initTemplate();
    }
    _initTemplate() {
        const [dialog] = super._initTemplate()
          , form =  dialog.querySelector('form')
          , serializeButton = dialog.querySelector('.ui-dialog-manage_state-serialize')
          , deserializeButton = dialog.querySelector('.ui-dialog-manage_state-deserialize')
          , serializeOutput = dialog.querySelector('.ui-dialog-manage_state-serialize_output')
          ;
        serializeButton.addEventListener('click', this._serializeHandler.bind(this))
        deserializeButton.addEventListener('click', this._deserializeHandler.bind(this))
        return [dialog, form, serializeOutput];
    }

    _serializeHandler(event) {
        event.preventDefault();
        const [errors, resultString] = serialize(this._getAppState());
        if(errors.length) {
            console.warn(`Serialize had errors ...`);
            for(const [path, error, ...more] of errors) {
                error.message = `${error.message} ./${path.join('/')}`;
                console.error(error, ...more);
            }
        }
        else
            this._serializeOutput.value = resultString;
    }

    // NOTE: in the context of this, it would be easier to be able to alter
    // state, as we might want to change installedFonts or availableFonts
    // the buffering mechanism below, using emptiedDependencies, could
    // however help to delay this requirement, until it's really needed.
    //
    // There should be a finally block, making sure resources that got loaded
    // or installed within this are properly installed/or removed again
    // eventually.
    async _deserializeHandler(event) {
        event.preventDefault();
        const appState = this._getAppState()
          , Model = appState.constructor
            // dependencies = {
            //      availableFonts: AvailableFontsModel
            //    , availableLayouts: AvailableLayoutsModel
            //    , installedFonts: InstalledFontsModel
            // }
          , dependencies = appState.dependencies
          , emptiedDependencies = {}
          ;
        console.log(`${this}._deserializeHandler appState.dependencies:`,
                                    ...Object.entries(appState.dependencies));
        // This will make it possible to know all the required installedFonts
        // or resources, thus enable us to unload not required resources.
        // It's howerver maybe the wrong place to do this kind of resource
        // management.
        // Make a drafts of the app
        for(const [k, instance] of Object.entries(dependencies)) {
            if(['installedFonts'].includes(k)) {
                // This way, if unchanged, eventually metamorphose
                // should return the old state. CAUTUION HOWEVER this is
                // wrong, as the order won't be the same upon refilling
                // this via deserialize.
                //    const draft = instance.getDraf();
                //    draft.clear();
                //    emptiedDependencies[k] = draft;
                emptiedDependencies[k] = instance.constructor.createPrimalDraft({})
            }
            else
                emptiedDependencies[k] = instance;
        }
        console.log('_deserializeHandler dependencies:', dependencies);
        const serializedValue = this._serializeOutput.value
          , options = {...SERIALIZE_OPTIONS, earlyExitOnError: true}
          , loadedState = await deserialize(this._asyncResolve, Model, emptiedDependencies, serializedValue , options)
          ;

        // NOTE: here we have to handle the changes that we've caused.
        // ALSO: we can't use drafts of the dependencies after here!
        for(const k of ['installedFonts', 'availableFonts'])
            console.log(`_deserializeHandler *${k}* new keys:`, ...emptiedDependencies[k].keys());

        // If here are no entries, in installedFonts
        // app installed fonts should be empty as well as no fonts are used
        // at all.
        // I.e. all the fonts in installedFonts are all the used fonts.
        // But maybe we can do that detection/cleanup somewhere else!
        // But at least, all installedFonts should also be in
        // app-installedFonts.
        // TODO: fonts in installedFonts that are not in app-installedFonts
        // also must be registered properly in font manager.

        // Entries in availableFonts must be transferred to app-availableFonts
        // as they have been installed during the process.
        // There's no reason to remove app-availableFonts if they are not
        // in availableFonts.
        // In fact, availableFonts doesn't have to be in a special version
        // it can just be the real appAvailableFonts.


        // Make these immutable now, they can't be drafts.
        // This is not required, if we just use the altered app-dependenies
        // eventually.
        for(const k of Object.keys(emptiedDependencies)) {
            if(emptiedDependencies[k].isDraft)
                emptiedDependencies[k] = emptiedDependencies[k].metamorphose();
        }
        // If there are no entries in either, we can basically use the
        // un-altered app dependencies.
        const installedFonts = emptiedDependencies['installedFonts']
          , requireProperInstall = new Set()
          , noLongerUsedInstalledFonts = new Set()
          , availableFonts = emptiedDependencies['availableFonts']
          // not sure if _useStateDependencyDraft is required here,
          // we already have the dependencies and can make the into
          // a draft directly.
          , appInstalledFonts = this._useStateDependencyDraft('installedFonts')
          , appAvailableFonts = this._useStateDependencyDraft('availableFonts')
          ;

        // NOTE: if we do not clean up no-longer used fonts, this could
        // as well just be appInstalledFonts, as we don't need to record
        // which fonts are actually used.
        for(const k of installedFonts.keys()) {
            if(!appInstalledFonts.has(k))
                requireProperInstall.add(k);
        }
        for(const k of requireProperInstall){
            appInstalledFonts.set(k, installedFonts.get(k));
        }

        // These could be removed.
        for(const k of appInstalledFonts.keys()) {
            if(!(installedFonts.has(k)))
                noLongerUsedInstalledFonts.add(k);
        }

        // NOTE: we should not accept existing keys that are already in
        // appAvailableFonts!
        // Also, currently, this is not altered at all as the process doesn't
        // include adding new fonts.
        for(const k of availableFonts.keys()) {
            if(!(appAvailableFonts.has(k))) {
                // move into appAvailableFonts (k, availableFonts.get(k))
                throw new Error('NOT IMPLEMENTED add available fonts to app.')
            }
        }

        // newState, at this point, must have immutable dependencies!
        // we can use simple metamorphose, as we just took care of all
        // missing dependencies.
        // const newState = loadedState.getDraft().metamorphose(appDependencies);

        // Ideas to improve the speed a bit:
        //      StateComparison spends a lot time in this case, however,
        //      since we know we want to rebuild the whole state instead
        //      of incrementally updating it in this case, we should shortcut
        //      that and just run initial update style.
        //      maybe, the call to update can become quicker by tackling
        //      the previous as well.
        //  rough times from a profiler:
        //      StateComparison metamodel.mjs line 5611 27%
        //      update basics.mjs line 868 21%
        //      deserialize metamodel.mjs line 157 47%

        // NOTE: when unsing _useStateDependencyDraft we can go through _updateState
        this._setAppState(loadedState.getDraft());
    }

    async show() {
        const promise = super.show()
          , dialog = this.element
          ;
        dialog.returnValue = null;
        dialog.showModal();

        return await promise.then(action=>{
            return action;
        });
    }
}
