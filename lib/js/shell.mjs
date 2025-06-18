/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

import * as opentype from './vendor/opentype.js/dist/opentype.mjs';
import {getDecompressSync} from './vendor/wawoff2/decompress.mjs';
const woff2decompress = await getDecompressSync();

import {zip} from './util.mjs';
import {
      VideoProofFont
    , VideoProofDeferredFont
    , FontOrigin
    , FontOriginUrl
    , FontOriginFile
} from './model/font.mjs';

import { UIDialogFontExists } from './components/font-loading.mjs';

// import {init as initExample} from './layouts/exmple.mjs';
import DOMTool from './domTool.mjs';
import LocalFontStorage from './local-font-storage.mjs';


import {
    Path
  , StateComparison
  // , getAllPathsAndValues
  , COMPARE_STATUSES
  // , getModel // (RootModel, path) => Model
  // , applyTo
  , getEntry
  , getDraftEntry
  , _PotentialWriteProxy
  , isDraftKeyError
  , ForeignKey
  , driveResolveGenAsync
  , isDeliberateResourceResolveError
} from './metamodel.mjs';

import {
    ApplicationModel // as ApplicationModel
  , InstalledFontModel
  , DeferredFontModel
  , AvailableFontsModel
  , InstalledFontsModel
  , AvailableLayoutModel
  , AvailableLayoutsModel
} from './components/main-model.mjs';

import { MainUIController, Layouts, LAYOUT_GROUPS} from './components/main-ui.mjs';

import getHarfbuzz from './vendor/harfbuzzjs/harfbuzz.mjs';

async function parseFont(fontBuffer) {
    let fontBuffer_;
    const signature = opentype._parse.getTag(new DataView(fontBuffer, 0), 0);
    if(signature === 'wOFF')
        // Uncompressing woff directly here, as harfbuzz does not support
        // woff and fontObject.toArrayBuffer is limited by opentype being
        // unable to parse all tables, so the output of that misses data.
        fontBuffer_ = opentype.woffToOTF(fontBuffer);
    else if(signature === 'wOF2') {
        const ttfFontBufferView = woff2decompress(fontBuffer);
        fontBuffer_ = ttfFontBufferView.buffer.slice(
            ttfFontBufferView.byteOffset,
            ttfFontBufferView.byteLength + ttfFontBufferView.byteOffset
        );
    }
    else
        fontBuffer_ = fontBuffer;
    const fontObject = opentype.parse(fontBuffer_);
    return [fontObject, fontBuffer_];
}

/**
 * Outsourcing management of font files from the main controller
 * as it's complex and all over the main controller and this will help
 * to separate concerns. It's a pretty tight coupling though!
 */
class FontManager {
    constructor(widgetBus) {
        this._widgetBus = widgetBus;
        this._childrenWidgetBus = {
            get harfbuzz() {
                return widgetBus.harfbuzz;
            }
        }
    }

    toString() {
        return `[${this.constructor.name}]`;
    }

    set _localFontStorage(localFontStorage) {
        // should override the protypt getter and setters.
        Object.defineProperty(this, '_localFontStorage', {
            value: localFontStorage
          , writtable: false
          , configurable: false
        });
    }
    get _localFontStorage() {
        throw new Error(`_localFontStorage is not available yet`);
    }

    get _domTool() {
        return this._widgetBus.domTool;
    }
    get _contentWindow() {
        return this._widgetBus.contentWindow;
    }

    get _requireStateDependencyDraft() {
        return this._widgetBus.requireStateDependencyDraft;
    }

    get _readStateDependency() {
        return this._widgetBus.readStateDependency;
    }

    get appReady() {
        return this._widgetBus.appReady;
    }


    async _getFontBufferFromDeferredFont(deferredFont) {
        if(deferredFont.buffer)
            return deferredFont.buffer;

        if(deferredFont.origin.fromDB) {
            // If it's fromDB we expect to find buffer in the db!
            const dbData = await this._localFontStorage.get(deferredFont.fullName);
            return dbData.buffer;
        }

        if(deferredFont.origin instanceof FontOriginUrl) {
            return await this._getBufferFromUrl(deferredFont.origin.url);
        }

        throw new Error(`RESOURCE ERROR FontManager async _getFontBufferFromDeferredFont: `
            + `Don\'t know how to load buffer for origin ${deferredFont.origin}`);
    }

    async _hydrateFont(deferredFont) {
        const contentDocument = this._contentWindow.document
          , fontBuffer = await this._getFontBufferFromDeferredFont(deferredFont)
          , [fontObject, fontBuffer_] = await parseFont(fontBuffer)
          , origin = deferredFont.origin
          , fontFace = new contentDocument.defaultView.FontFace(deferredFont.fullName, fontBuffer_)
            // Used to pass fontBuffer which is the original, but may be
            // a woff2. For harfbuzzjs woff2 is not an option and since
            // it's already decompressed here, it's easier to use this
            // way. It may be required to keep the original buffer around
            // but at the moment this seems good enough.
          , font = new VideoProofFont(
                      this._childrenWidgetBus
                    , fontObject, origin, fontBuffer_
                    , fontFace, contentDocument
                    , deferredFont.fullName)
          ;
        // FIXME: these should be deleted again! contentDocument.fonts.delete(fontFace);
        // https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet
        // FontFaceSet.delete()
        //      >> Removes a manually-added font from the font set. CSS-connected fonts are unaffected.
        //      (When loaded with  @font-face the FontFace object is CSS-connected.)
        await contentDocument.fonts.add(fontFace);
        return font;
    }

    async _rawInstallFont(deferredFont) {
        const fontState = InstalledFontModel.createPrimalDraft({});
        fontState.value = await this._hydrateFont(deferredFont);
        return fontState;
    }

    /**
     * This installs a deferred font in the browser and puts it into
     * the installedFonts dependency.
     * The font is going to be uninstalled when it's  no longer required
     * by the app.
     *
     * This requires a context where installedFontsDraft is already prepared.
     */
    async installFont(fontName) {
        // Run only when all dependencies are loaded.
        if(!this.appReady) {
            console.warn(`installFont: App not yet available for activating ${fontName}.`);
            return false;
        }
        const availableFonts = this._readStateDependency('availableFonts')
          , installedFontsDraft = this._requireStateDependencyDraft('installedFonts')
          ;

        // (deferred) font must be in availableFonts!
        if(!availableFonts.has(fontName))
            throw new Error(`KEY ERROR font not available "${fontName}".`);

        // if it is not in installedFonts it will be moved there,
        if(!installedFontsDraft.has(fontName)) {
            // by hydrating the deferred font
            const deferredFont = availableFonts.get(fontName).value
              , fontState = await this._rawInstallFont(deferredFont)
              ;
            installedFontsDraft.set(fontName, fontState);
        }
        console.log(`${this}.installFont installedFontsDraft.keys:`, ...installedFontsDraft.keys());
        const installedFont = installedFontsDraft.get(fontName).value;
        return installedFont;
    }

    /**
     * This requires a context where installedFontsDraft is already prepared.
     */
    _uninstallFont(fontName) {
        const installedFontsDraft = this._requireStateDependencyDraft('installedFonts')
        if(!installedFontsDraft.has(fontName))
            // Could raise a KeyError to inform about unnecessary usage
            // but it's not a problematic condition.
            return;
        const installedFont = installedFontsDraft.get(fontName).value;
        installedFontsDraft.delete(fontName);
        // Will also do document.fonts.delete(...)
        installedFont.destroy();
    }

    /**
     * This is managing the installed fonts reference counter
     * (See _installFont) on a "per user" basis, because a user can be
     * controlled from different places in the app, this centralizes
     * tracking of its font resources.
     * userIdentifier can handily be the full path to the ForeignKey.
     */
    async useFont(userIdentifier, fontName) {
        throw new Error(`DEPRECATED ${this}.useFont for userIdentifier ${userIdentifier} and fontName ${fontName}`);
        // FIXME: should be handled elsewhere!
        // Especially, the install/release should be somehow centralized,
        // for a centralized user like activeFontKey, which is however
        // altered by different actors.
        // The registration should rather be based on the model than
        // on the UI-components. However, so far, the user identifier is
        // this.widgetBus.getExternalName i.e. the address in the model
        // which may mitigate the issue.
        // The reference counting seems broken to me. There's a fallback
        // mechanism in the model: ForeignKey.SET_DEFAULT_FIRST which wouldn't
        // register as as a user, or unregister the font either.

        // return await this._installFont(fontName);
    }

    async _loadFontsFromLoaderFn(sourceLoaderFn, ...sources) {
        const fontsAndNulls = await Promise.all(sources.map(sourceLoaderFn));
        return fontsAndNulls.filter(font=>!!font)
                            .map(font=>font.fullName);
    }

    async _uiDialogHandleFontExists(font) {
        const dialog = new UIDialogFontExists(this._domTool)
          , result = await dialog.show(font)
          ;
          dialog.destroy();
          return result;
    }

    /**
     * This requires a context where availableFontsDraft and installedFontsDraft are already prepared.
     *
     * conflictResolutionAction is either null, that will call the UI/user
     * for an answer or one of "replace", "keep" or "initial" where
     * at the moment "initial" and "keep" behave the same and it is not
     * cleat what "initial" was ssupposed to do.
     */
    async _registerFont(deferredFont, conflictResolutionAction=null) {
        const availableFontsDraft = this._requireStateDependencyDraft('availableFonts')
          , fontName = deferredFont.fullName
          ;
        if(availableFontsDraft.has(fontName)) {
            // app must be ready to call the ui for a conflict resolution
            if(conflictResolutionAction === null && !this.appReady)
                throw new Error(`APP NOT READY _registerFont: ${fontName} ${deferredFont.origin }`);
            // TODO: this could be resolved by entering a loop (REPL) that alters
            // deferredFont.fullName until the name is free, the font object should
            // have a method to i.e. add a counter to fullName.
            //
            // FIXME: to be fully complete these calls should go into
            // an async queue to be resolved one after another, because
            // otherwise there's a race condition between the check above
            // and putting the font into availableFontsDraft. But it's likely
            // not a practical problem.
            const action = conflictResolutionAction === null
                    ? await this._uiDialogHandleFontExists(deferredFont)
                    : conflictResolutionAction
                    ;
            // keep, replace or initial
            // => initial should be the same as default
            // => the default is keep, as it changes least
            if(action === 'replace') {
                const installedFontsDraft = this._requireStateDependencyDraft('installedFonts');
                // if font.fullName is currently active, replace with he new version.
                if(installedFontsDraft.has(fontName)) {
                     this._uninstallFont(fontName);
                    // The font is literally replaced with another version.
                    // Via the model, the change will propagate.
                    const fontState = await this._rawInstallFont(deferredFont);
                    installedFontsDraft.set(fontName, fontState);
                }
            }
            else if(action === 'initial' || action === 'keep') {
                // handle "initial" and "keep": keep loaded font
                // FIXME: Why have "initial" then?
                console.info(`Loading font "${fontName}" aborted by user.`);
                return false;
            }
            else
                throw new Error(`VALUE ERROR unknown action "${action}" `
                + `accepted values are "replace", "initial" and "keep".`);
        }
        const fontState = DeferredFontModel.createPrimalDraft({});
        fontState.value = deferredFont;
        availableFontsDraft.set(deferredFont.fullName, fontState);
        return true;
    }

    /**
     * This requires a context where availableFontsDraft and installedFontsDraft are already prepared.
     */
    _unregisterFont(fullName) {
        const availableFontsDraft = this._requireStateDependencyDraft('availableFonts')
          , installedFontsDraft = this._requireStateDependencyDraft('installedFonts')
          ;

        console.log(fullName, `installedFontsDraft.has("${fullName}" ${installedFontsDraft.has(fullName)}), ...installedFontsDraft:`, ...installedFontsDraft);
        if(installedFontsDraft.has(fullName))
            this._uninstallFont(fullName);

        console.log(fullName, `availableFontsDraft.has("${fullName}" ${availableFontsDraft.has(fullName)}), ...availableFontsDraft:`, ...availableFontsDraft);
        if(availableFontsDraft.has(fullName)) {
            const availableFont = availableFontsDraft.get(fullName).value;
            console.log('availableFont', fullName, availableFont);
            availableFontsDraft.delete(fullName);
        }
        return true;
    }

    async _getBufferFromFetchResponse(response) {
        if (!response.ok)
            throw new Error(`HTTP error! Status: ${ response.status }`);
        return await response.arrayBuffer();
    }

    async _getBufferFromUrl(url) {
        const { fetch } = this._contentWindow
          , response = await fetch(url, {
                    method: 'GET',
                    // mode: 'cors', // no-cors, *cors, same-origin
                    // cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
                    // redirect: 'follow', // manual, *follow, error
                    // referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            })
          ;
        return await this._getBufferFromFetchResponse(response);
    }

    async _loadFontFromUrl(url, metaData={}, fontBuffer=null) {
        const origin = new FontOriginUrl(url);
          // Parsing (parseFont) takes long!
          // Opentype.js need lazy table parsing!!!
          // But especially in this case, where we
          // need it only for:
          //      font.fullName, font.nameVersion, font.serializationNameParticles
          // and all of these, so far, derrive from:
          //    VideoProofFont._getNameEntry('fullName', 'fontFamily', 'postScriptName')
          //    VideoProofFont._getNameEntry('version')
          //    VideoProofFont.origin.type
          // fullName = VideoProofFont.fullName(name, version, origin.type)
          //            but this can also be just custom!
          // nameVersion = VideoProofFont.nameVersion(name, version);
          // serializationNameParticles  = [name, version]
          // we really only need to supply:
          //        name, version and if we want to customize fullName, that as well

        let fullName, nameVersion, serializationParticles;
        if(!metaData.name || !metaData.version) {
            // we need to load the fontObject/parse the buffer
            if(!fontBuffer)
                fontBuffer = await this._getBufferFromUrl(url);
            const [fontObject, ] = await parseFont(fontBuffer)
             , font = new VideoProofFont({}, fontObject, origin)
             ;
            fullName = metaData.fullName || font.fullName;
            nameVersion = font.nameVersion;
            serializationParticles = font.serializationNameParticles;
        }
        else {
            const {name, version} = metaData;
            fullName = metaData.fullName || VideoProofFont.fullName(name, version, origin.type);
            nameVersion = VideoProofFont.nameVersion(name, version);
            serializationParticles = [name, version];
        }

        const deferredFont = new VideoProofDeferredFont(
                            origin
                          , fullName
                          , nameVersion
                          , serializationParticles
                          , fontBuffer/* or null */)
          , registered = await this._registerFont(deferredFont)
          ;
        return registered === false ? null : deferredFont;
    }

    async _loadFontFromFetchResponse(response, metaData={}) {
             // leave this first, it raises if response.status is not ok.
        const fontBuffer = await this._getBufferFromFetchResponse(response)
        return this._loadFontFromUrl(response.url, metaData, fontBuffer);
    }


    async _loadFontFromResourceDefinition(resource, metadata) {
        const {URL, Response} = this._contentWindow;
        if(resource instanceof URL)
            return this._loadFontFromUrl(resource, metadata);
        if(resource instanceof Response)
            return this._loadFontFromFetchResponse(resource, metadata);
        throw new Error(`TYPE ERROR don't know how to handle resource ${resource}.`);
    }

    async _loadFontFromFile(file) {
        const origin = new FontOriginFile(file.name)
          , fontBuffer = await file.arrayBuffer()
          , [fontObject, ] = await parseFont(fontBuffer)
            // The buffer will got into local storage, so it is required here
            // it would be an option, not to keep that deferredFont object
            // around, create one without buffer, to keep memory lower,
            // but in most cases (one font was dropped) the buffer will
            // be used anyways right away.
          , deferredFont = VideoProofDeferredFont.fromFontObject(fontObject, origin, fontBuffer)
          , registered = await this._registerFont(deferredFont)
          ;
        if(registered === false)
            return null;
        await this._localFontStorage.put(deferredFont);// => result is the key (fullName) of the font
        return deferredFont;
    }

    /**
     * This is a lot like _loadFontFromUrl but it creates a FontOriginFile
     * having this kind of duplication is a strong hint that font loading
     * requires a rework. The from-url/from-file keys are kind of multi
     * use: to sort the fonts in ui-categories and also to identify
     * where they came from. This should be resolved. Maybe the key
     * should also not inherit the origin story... Requires a bit more
     * thinking. Also, we might add direct access to google fonts, that
     * would challenge the existing system a lot.
     *
     * conflictResolutionAction === 'replace' if null we'll ask the
     * user what to do...
     */
    async _loadFontFromMessage(fontBuffer, metaData={}, conflictResolutionAction=null) {
        const origin = new FontOriginFile(metaData.name);
        let fullName, nameVersion, serializationParticles;
        if(!metaData.name || !metaData.version) {
            // this is a nice path but to live update from postMessage,
            // I'm not so sure if we should pursue it!

            const [fontObject, ] = await parseFont(fontBuffer)
             , font = new VideoProofFont({}, fontObject, origin)
             ;
            fullName = metaData.fullName || font.fullName;
            nameVersion = font.nameVersion;
            serializationParticles = font.serializationNameParticles;
        }
        else {
            // From postMessage I'd expect this path, so there's full
            // control!.
            const {name, version} = metaData;
            fullName = metaData.fullName || VideoProofFont.fullName(name, version, origin.type);
            nameVersion = VideoProofFont.nameVersion(name, version);
            serializationParticles = [name, version];
        }

        const deferredFont = new VideoProofDeferredFont(
                            origin
                          , fullName
                          , nameVersion
                          , serializationParticles
                          , fontBuffer)
          , registered = await this._registerFont(deferredFont, conflictResolutionAction)
          ;

        if(registered === false)
            return null;
        // For the live update feature this seems not required and maybe
        // not expected/desireable:
        // await this._localFontStorage.put(deferredFont);// => result is the key (fullName) of the font
        return deferredFont;
    };

    /**
     * Here's a side effect: if there are no "installed fonts" anymore
     * we'll see:
     *      CONSTRAINT ERROR [ForeignKey:installedFonts NOT NULL] Can't set first key, there is no first entry.
     * As that's the way how the code hand;es missing fonts.
     * Hence, either we create a mechanism that always falls back to a
     * fixed font instance, that would require to reqrite a lot of code,
     * or, we detect the case right here and load a font with from-url
     * origin.
     *
     *
     */
    async _deleteFontsFromStorage(fontNames) {
        console.log('_deleteFontsFromStorage fontNames:', fontNames);
        const results = []
          , availableFontsDraft = this._requireStateDependencyDraft('availableFonts')
          ;
        for(const fontName of fontNames) {
            const font = availableFontsDraft.has(fontName) && availableFontsDraft.get(fontName);
            if(font.value.origin.type !== 'from-file') {
                results.push(['_localFontStorage.delete', fontName, `SKIP not "from-file": ${font.value.origin.type}`]);
                continue;
            }
            const result = await this._localFontStorage.delete(fontName);
            results.push(['_localFontStorage.delete', fontName, result]);
            console.log(`_deleteFontsFromStorage for ${fontName} result:`, result);
            this._unregisterFont(fontName);
        }
        return results;
    }

    async loadInitialFontsFromResources(resourceDefinitions) {
        const fontsPromises = resourceDefinitions.map(
            async ([resource, metaData])=>this._loadFontFromResourceDefinition(
                    resource.then ? await resource : resource, metaData));
        return Promise.all(fontsPromises)
            .then(fonts=>{
                // Because we are bootstrapping availableFontsDraft  is available!
                const availableFontsDraft = this._requireStateDependencyDraft('availableFonts')
                  , keyEntriesInOriginalLoadOrder = fonts.map(font=>[font.fullName, availableFontsDraft.get(font.fullName)])
                  ;
                // Later keys will override earlier keys, so push will create
                // the original order. As long as no other method did write
                // to this, which shouldn't happen in bootstrap, these
                // items will be the first items in order in the map.
                availableFontsDraft.push(...keyEntriesInOriginalLoadOrder);
            });
    }

    onLocalFontStorage(localFontStorage) {
        this._localFontStorage = localFontStorage;
        return this._localFontStorage;
    }

    async loadInitialFontsFromLocalFontStorage() {
        // assert localFontStorage === this.localFontStorage
        // Because we are bootstrapping availableFontsDraft  is available!
        const availableFontsDraft = this._requireStateDependencyDraft('availableFonts');
        for await(const entry of this._localFontStorage.getAll()) {
            const font = new VideoProofDeferredFont(
                            FontOrigin.fromDB(entry.origin)
                          , entry.fullName
                          , entry.nameVersion
                          , entry.serializationNameParticles
                          , null);

            const fontState = DeferredFontModel.createPrimalDraft({});
            fontState.value = font;
            // no need to metamorphose fontState here, will happen along
            // with availableFontsDraft.metamorphose()
            availableFontsDraft.set(font.fullName, fontState);
        }
    }

    /**
     * Used as API connecting to font-loading.mjs
     */
    async loadFontsFromFiles(...files) {
        return this._loadFontsFromLoaderFn(this._loadFontFromFile.bind(this), ...files);
    }

    async removeFontsFromFiles(...fullNames) {
        console.log(`FontManager removeFontsFromFiles fullNames:`, fullNames);
        // TODO: Do we need to filter fonts where font.origin.type !== 'from-file'
        return this._deleteFontsFromStorage(fullNames);
    }

    /**
     * So far unused, just for completeness.
     * Should be very similar to loadFontsFromFiles
     */
    async loadFontsFromUrls(...urls){
        return this._loadFontsFromLoaderFn(this._loadFontFromUrl.bind(this), ...urls);
    }
}

export class VideoproofController {
    /**
     * contentWindow: a DOM.window that will contain the page content, i.e.
     * the proofs, where the font's are applied, it can be different to the
     * uiWindow, which holds the main controller UI.
     */
    constructor(contentWindow) {
        // FIXME: which window to use per case
        //        also, use domTool!
        this._contentWindow = contentWindow;
        Object.defineProperty(this, 'appReady', {value: false, configurable: true});
        this.state = null;
        this.draftState = null;
        this._nestedChangeStateCount = 0;
        this._lockChangeState = null;
        this._requireReviewResourcesFlag = true; // initially true

        this._domTool = new DOMTool(contentWindow.document);

        this._ui = null;// TODO: improve these apis!

        // FIXME: this should be readable directly from ApplicationModel
        this._stateDependencyModels = {
            availableFonts: AvailableFontsModel
          , installedFonts: InstalledFontsModel
          , availableLayouts: AvailableLayoutsModel
        };
        this._stateDependenciesDrafts = new Map();
        // Required for bootstapping.
        // Will be unused in _allInitialResourcesLoaded.
        for(const key of Object.keys(this._stateDependencyModels))
            this._useStateDependencyDraft(key);

        this._externalInitialDependencies = new Map();
        function _setResolvers(key, resolve, reject) {
            // jshint validthis: true
            if(this._externalInitialDependencies.has(key))
                throw new Error(`KEY EXISTES ${key} in _externalInitialDependencies.`);
            this._externalInitialDependencies.set(key, {resolve, reject});
        }
        const _externalPromises = [];
        for(let key of ['ready', 'localFontStorage', 'harfbuzz'])
            _externalPromises.push([key, new Promise(_setResolvers.bind(this, key))]);

        this._harfbuzz = null;
        const _getAppReady=()=>this.appReady
          , _getHarfbuzz=()=>this.harfbuzz
          ;
        this._fontManager = new FontManager({
            contentWindow: this._contentWindow
          , domTool: this._domTool
          , get appReady(){ return _getAppReady(); }
          , requireStateDependencyDraft: this._requireStateDependencyDraft.bind(this)
          , readStateDependency: this._readStateDependency.bind(this)
          , get harfbuzz() { return _getHarfbuzz(); }
        });

        LocalFontStorage.init(contentWindow).then(
            result=>{
                this.setInitialDependency('localFontStorage', result);
                return result;
            }
          , error=>this._externalInitialDependencies.get('localFontStorage')
                       .reject(error)
        );

        getHarfbuzz().then(
            result=>{
                this.setInitialDependency('harfbuzz', result);
                return result;
            }
          , error=>this._externalInitialDependencies.get('harfbuzz')
                       .reject(error)
        );

        // Only allow this once, to resolve the race conditon, later
        // the loadFontsFromUrls interface should be exposed explicitly;
        let exhaustedInterfaceError = ()=>{
            throw new Error('EXHAUSTED INTERFACE: remoteResources');
        };

        let initialResourcesPromise
          , testDeferredRemoteResources = false
          , testDeferredRemoteTimeout = 3000 // set to 6000 to trigger the rejection
          , remoteResourcesAvailable = contentWindow.remoteResources && Array.isArray(contentWindow.remoteResources)
          ;

        // Because it can be hard to see the deferred case in the wild,
        // this contraption stays here for now, to simulate the case manually.
        // Something similar could be made from the html source of course.
        if(testDeferredRemoteResources && remoteResourcesAvailable) {
            console.warn(`Testing deferred remoteResources. Timeout: ${testDeferredRemoteTimeout}`);
            remoteResourcesAvailable = false;
            const _copiedRemoteResources = contentWindow.remoteResources.slice();
            contentWindow.setTimeout(
                ()=>{
                    console.warn(`Trigger test deferred remoteResources.`);
                    contentWindow.remoteResources.push(..._copiedRemoteResources);
                }
              , testDeferredRemoteTimeout
            );
        }

        let loadInitialResourcesFromPromises = this._loadInitialResourcesFromPromises.bind(this, ..._externalPromises);

        if(remoteResourcesAvailable) {
            initialResourcesPromise = loadInitialResourcesFromPromises(...contentWindow.remoteResources);
            contentWindow.remoteResources = {push: exhaustedInterfaceError};
        }
        else {
            // Definitely expect some remoteResources to be loaded, it's
            // not clear though, if this code runs before they are specified
            // in the DOM or after. There is a timeout to warn when
            // contentWindow.remoteResources is never pushed to i.e. forgotten.
            //
            // `push` is the only valid API for window.remoteResources.
            // It is better to use just one push, with many fonts instead
            // of many pushes, because then we only get one call to
            // loadFontsFromUrls, which only switches the inteface font once
            // for the call.
            let resolve, reject
              , rejectTimeout = setTimeout(()=>{
                    contentWindow.remoteResources.push=exhaustedInterfaceError;
                    reject(new Error('Not initiated: remoteResources!'));
                  }, 5000)
             ;
            initialResourcesPromise = new Promise((_resolve, _reject)=>{
                resolve = _resolve;
                reject = _reject;
            });
            contentWindow.remoteResources = {push: (...promises)=>{
                contentWindow.clearTimeout(rejectTimeout);
                resolve(loadInitialResourcesFromPromises(...promises));
                contentWindow.remoteResources.push=exhaustedInterfaceError;
            }};
        }

        Promise.all([initialResourcesPromise])
               .then((results)=>this._allInitialResourcesLoaded(...results))
               .catch(error=>this.uiReportError('VideoproofController constructor initial resources', error));
    }

    toString(){
        return `[${this.constructor.name}]`;
    }
    /**
     * Call if you are potentially going to change one of the state dependencies.
     * This will cerate a central draft and increment a reference counter.
     * When done working with the draft, e.g. after an async operation,
     * the _unuseStateDependencyDraft method should be called to decrement
     * the reference count again, marking it ready to use when the count is
     * at 0.
     */
    _useStateDependencyDraft(key) {
        const [counter, draft] = this._stateDependenciesDrafts.has(key)
            ? this._stateDependenciesDrafts.get(key)
            : [0, (this.state
                        // initially there's no state
                        ? this.state.dependencies[key].getDraft()
                        : this._stateDependencyModels[key].createPrimalDraft({})
              )]
          ;
        this._stateDependenciesDrafts.set(key, [counter + 1, draft]);
        return draft;
    }

    /**
     * returns a boolean: readyToUse
     */
    _unuseStateDependencyDraft(key) {
        if(!this._stateDependenciesDrafts.has(key))
            // There's a reference counter to resolve this, shouldn't happen.
            throw new Error(`Call to _unuseStateDependencyDraft but there is no draft for "${key}"`);
        const [oldCounter, draft] = this._stateDependenciesDrafts.get(key)
          , counter = Math.max(0, oldCounter - 1)
          ;
        this._stateDependenciesDrafts.set(key, [counter, draft]);
        return counter <= 0;
    }

    /**
     * To be used in contexts where it is expected that the state dependency
     * draft is available. This implies that eventually the context
     * will update state with the new dependencies.
     */
    _requireStateDependencyDraft(key) {
        if(!this._stateDependenciesDrafts.has(key))
            // There's a reference counter to resolve this, shouldn't happen.
            throw new Error(`Call to _requireStateDependencyDraft but there is no draft for "${key}". `
                + `Use _useStateDependencyDraft("${key}") first.`);
        const [/*counter*/, draft] = this._stateDependenciesDrafts.get(key);
        return draft;
    }

    /**
     * If there's no draft, use the current state dependency directly.
     * This is intended for reading from the latest version, which may
     * be the current draft or the value in the current state.
     */
    _readStateDependency(key) {
        if(!this._stateDependenciesDrafts.has(key))
            return this.state.dependencies[key];
        return this._requireStateDependencyDraft(key);
    }

    _useStateDependencyDraftContextWrapper(makeAsync, fn, ...dependencies) {
        const enter=()=>{
                for(const key of dependencies)
                    this._useStateDependencyDraft(key);
            }
          , exit=()=>{
                for(const key of dependencies)
                    this._unuseStateDependencyDraft(key);
            }
          ;
        if(makeAsync) {
            return async function (...args) {
                enter();
                try {
                    return await fn(...args);
                }
                finally {
                    exit();
                }
            };
        }
        else {
            return function (...args) {
                enter();
                try {
                    return fn(...args);
                }
                finally {
                    exit();
                }
            };
        }
    }

    async _allInitialResourcesLoaded(resources) {
        if(this.appReady)
            throw new Error('_allInitialResourcesLoaded must run only once.');
        Object.defineProperty(this, 'appReady', {value: true});

        console.log('_allInitialResourcesLoaded resources:', ...resources.keys(), resources);

        // No initial font available. Could be a legitimate deployment of this App.
        // However, we would have to change the model.
        //
        // Eventually the FontsModel must be initialuzed in the Model, even
        // though it doesn't matter in this case, it's the right thing to
        // do, there should be one recommended way to do things!
        //
        // charGroups should be part of the model, but I keep it external
        // to see where it leads! Also, it's not meant to change, so that
        // should be fine, and, if it changes, there's a way planned to
        // update the model when external dependencies change...
        console.log('AvailableFontsModel.Model.dependencies:', AvailableFontsModel.Model,AvailableFontsModel.Model.dependencies);
        console.log('AvailableFontsModel.dependencies:', AvailableFontsModel.dependencies);
        console.log('ApplicationModel.dependencies:', ApplicationModel.dependencies);
        // At some point it will be good to be able to load layouts
        // dynamically, on demand, as plug ins (requires deferredLayouts),
        // but for the basic stuff we just start with hard coded layouts.
        const availableLayoutsDraft = this._requireStateDependencyDraft('availableLayouts');
        for(const [key, label, LayoutModule, layoutGroupKey_] of Layouts) {
            const layoutGroupKey = Object.hasOwn(LAYOUT_GROUPS, layoutGroupKey_)
                        ? layoutGroupKey_
                        : LAYOUT_GROUPS.default
              , availableLayout = AvailableLayoutModel.createPrimalDraft({})
              ;
            availableLayout.get('typeClass').value = LayoutModule.Model;
            availableLayout.get('label').value = label;
            availableLayout.get('groupKey').value = layoutGroupKey;
            availableLayoutsDraft.push([key, availableLayout]);
        }
        this._harfbuzz = resources.get('harfbuzz');
        const likeADraft = {
            metamorphoseGen: dependencies=>ApplicationModel.createPrimalStateGen(dependencies)
        };

        // This matches the _useStateDependencyDraft from the constructor.
        for(const key of Object.keys(this._stateDependencyModels))
            this._unuseStateDependencyDraft(key);
        this.state = await this._asyncMetamorphoseState(likeADraft);

        // returns true if state was restored successfully
        // this._loadStateFromLocationHash();

        // this runs after restoring state, so we don't build the wrong
        // UI initiallly.
        this._lockChangeState = '_allInitialResourcesLoaded';
        try {
            // TODO: it would actually make sense to lazy load these resources,
            // as they are not necessary for all of the possible layouts.
            // CAUTION: For the charGroups data, a module that loads and
            // parses the json was created, for similar cases, modules
            // may be a better soltion. that's also why now the unused
            // code for charGroups was removed.
            this._initUI(/*{charGroups: resources.get('charGroups')}*/);
        }
        finally {
            this._lockChangeState = null;
        }

        // Receive font updates e.g. from an editor or another app that
        // opened this page and sends font-update messages, after we
        // requested them via the 'init-live-fonts' message to opender.
        //
        // This could be turned on/off by a thing in Application Meta
        // But for now it's also OK to just start it, if there is a window.opener
        // FIXME: Judging from the type of code , this should be implemented
        // as a UI thing and not directly in the main Controller.
        const adapterWindow = this._domTool.window.opener
                || (this._domTool.window.parent !== this._domTool.window
                        ? this._domTool.window.parent
                        : null
                );
        if(adapterWindow !== null) {
            const _handlePostMessage = async (event)=>{
                    // event.data.type === 'font-update'
                    // event.data.metaData === {
                    //             name: "hello_ttf"
                    //          , version: "Version 0-live"
                    //          , fullName: "from-file hello_ttf Version 0-live" }
                    // event.data.fontBuffer: ArrayBuffer { byteLength: 209744 }
                    const {type,  fontBuffer, metaData} = event.data;
                    if(type !== 'font-update') {
                        console.error('VALUE ERROR Don\'t know how to handle message. Type: "{type}" event:', event);
                        return;
                    }

                    // FIXME: we should do sanitization on this property
                    // as it e.g. can make the font inaccessible via CSS.
                    if(!metaData.fullName.startsWith('from-file '))
                        metaData.fullName = `from-file ${metaData.fullName}`;

                    const availableFontsDraft = this._requireStateDependencyDraft('availableFonts')
                      , initiallyAvailableFontsKeys = new Set(availableFontsDraft.keys())
                      , deferredFontOrNull = await this._fontManager._loadFontFromMessage(fontBuffer, metaData, 'replace')
                      ;
                    if(deferredFontOrNull !== null
                            && !initiallyAvailableFontsKeys.has(deferredFontOrNull.fullName)) {
                        // If the font was installed with this action
                        // i.e. if the font was not in availableFonts before
                        // it would is good to also activate it in the top
                        // level. The reason is, that the live adapters open
                        // TypeRoof in a pop-up and for that scenario it would
                        // be good when the user wouldn't have to select the
                        // font explicitly.
                        const fontName = deferredFontOrNull.fullName;
                        // activate the last entry
                        this.draftState.get('activeFontKey').value = fontName;
                        // This is important here.
                        // ALSO: widgetBus has requireReviewResources
                        // another hint that we should run this from
                        // the UI.
                        this._requireReviewResourcesFlag = true;
                    }
                }
              , handlePostMessage = this._useStateDependencyDraftContextWrapper(
                    true, _handlePostMessage, 'availableFonts', 'installedFonts')
              ;
            this._domTool.window.addEventListener('message', (evt)=>this.withChangeState(async ()=>handlePostMessage(evt)));
            // Tell window.opener we are ready to receive font updates.
            adapterWindow.postMessage('init-live-fonts', '*');
        }
    }

    // This is basically only to ensure the document is loaded and ready
    // to be queried/changed, there's no other use case, expecting
    // the main program to call setInitialDependency('ready', true);
    setInitialDependency(key, value) {
        let dependency = this._externalInitialDependencies.get(key);
        if(!dependency)
            throw new Error(`KEY NOT FOUND setInitialDependency: ${key}`);
        // Resolving a seccond time doesn't do anything, the value of the
        // first time stays valid, but it hints to a programming issue.
        // Deleting here will make the second resolving of key fail with
        // an error.
        this._externalInitialDependencies.delete(key);
        dependency.resolve(value);
    }

    // TODO: this is the last error handler and it's not very well made.
    uiReportError(callerId, error) {
         console.error(`via ${callerId}:`, error);
         // FIXME
         alert(`via ${callerId}:${error}`);
        // DO?
        // throw(error);
    }

    // Runs when the ui can be build, but does not require resources like
    // the fonts to be available yet.
    _initUI(/*{ ... remote resources }*/) {
        // keeping this as it is triggered when the dependencies are loaded
        // for(const [state, ...path] of getAllPathsAndValues(this.state))
        //    console.log('-', '/'+path.join('/'), `::: ${state.toString()}`);

        this._ui = new MainUIController({ // widgetBus
            domTool: this._domTool
          , rootPath: Path.fromParts('/')
            //   TODO: this could define the default handler
            // , protocolHandlers: []
          , changeState: this.withChangeState.bind(this)
          // FIXME: replaceState and updateState should only be
          // exposed temporarily, until the proper way of doing it is
          // found.
          // , replaceState: this._replaceState.bind(this)
          , updateState: this._updateState.bind(this)
          , useStateDependencyDraft: this._useStateDependencyDraft.bind(this)
            // If not called from within withChangeState state will be an
            // immutable and making it a draft won't have an effect
            // on the app state.
          , getEntry: path=>{
                let entry = null;
                if(this.draftState) {
                    try {
                        entry = getDraftEntry(this.draftState, path);
                    }
                    catch(error) {
                        if(!isDraftKeyError(error))
                            throw error;
                        // PASS: Else, go on and use getEntry the potentially
                        // return non-draftable entries, such as a
                        // internalized dependency...
                    }
                }
                if(entry === null)
                    // This can still fail, but it allows to return
                    // non-draftable entries in draftMode, as this is a
                    // unspecific intereface, I'd expect it to work the
                    // "same" in draft mode or not.
                    entry = getEntry(this.state, path);

                if(!this.draftState && (entry.isDraft || _PotentialWriteProxy.isProxy(entry)))
                    throw new Error(`ASSERTION FAILED entry must not be draft; `
                    + `path: ${path} `
                    + `entry: ${entry} `
                    + `entry.isDraft: ${entry.isDraft} `
                    + `isProxy: ${_PotentialWriteProxy.isProxy(entry)}`);
                return entry;
            }
          , loadFontsFromFiles: this._useStateDependencyDraftContextWrapper(true
                    , this._fontManager.loadFontsFromFiles.bind(this._fontManager)
                    , 'availableFonts', 'installedFonts')
          , removeFontsFromFiles: this._useStateDependencyDraftContextWrapper(true
                    , this._fontManager.removeFontsFromFiles.bind(this._fontManager)
                    , 'availableFonts', 'installedFonts')
          , loadFontsFromUrls: this._useStateDependencyDraftContextWrapper(true
                    , this._fontManager.loadFontsFromUrls.bind(this._fontManager)
                    , 'availableFonts')
            // Potentially there's a use case for this:
            // if I require the font right now (after an await) to e.g.
            // directly read values from it.
          , installFont: this._useStateDependencyDraftContextWrapper(true
                    , this._fontManager.installFont.bind(this._fontManager)
                    , 'installedFonts')
          , requireReviewResources: ()=>{
                this._requireReviewResourcesFlag = true;
            }
          , harfbuzz: this.harfbuzz // {hbjs, Module}
            // FIXME: This may be too much free API exposure. Unless the
            // fontManager in itself becomes safe to use.
          , fontManager: this._fontManager
          , toString() {
                return `[widgetBus for ${this.wrapper ? this.wrapper : '(unknown)'} at ${this.rootPath ? this.rootPath : '(unknown)'}]`;
            }
        });
        this._ui.initialUpdate(this.state);
    }

    get harfbuzz() {
        if(!this.appReady)
           throw new Error(`APP NOT READY: get harfbuzz`);
        return this._harfbuzz;
    }
    /* command is:
     * [rootPath, method, ...arguments]
     *
     * This is basically wrapping a transaction. And the transaction
     * contains the new draft as the root state (this.draftState)
     * Which will be the base for the getEntry API injected into the
     * UI.
     * It's allowed to call withChangeState in a nested fashion. It
     * uses a depth counter to update state only once, after all
     * calls have finished.
     * I wonder if there's any use in making the async and then
     * await fn() ..., the this._nestedChangeStateCount should
     * probably guard (raise if > 0) within _updateState, to make
     * sure everything happens in order. Also, external dependencies
     * that are loaded out of band would have to adhere to that pulse
     * as well.
     */
    async withChangeState(fn) {
        if(!this.appReady) {
            console.warn(`withChangeState: App not yet ready to change state.`);
            return false;
        }
        if( this._lockChangeState !== null )
            // This is a programming error, nothing a user should ever face.
            throw new Error('LOCK ERROR changeState is locked with the lock labeled: ${this._lockChangeState}.');

        // console.log(`${this.state} changeState...`);


        if(this.draftState === null)
            // assert this._nestedChangeStateCount === 0
            this.draftState = this.state.getDraft();
        this._nestedChangeStateCount += 1;
        const draft = this.draftState;
        let returnVal;
        try {
            // Doesn't have to be async, but if it is, we wait.
            // Especially to allow for dynamic loading of resources,
            // i.e. VideoProofDeferredFont
            // CAUTION: I'm not fully confident _nestedChangeStateCount
            // is sufficient here, we could als well add an async-queue
            // here to ensure the order of events is always maintaianed.
            const maybePromise = fn();
            // only async here if there's a "then". Don't bother to
            // check if the "then" is a function ot so, it's not
            // exact anyways.
            if(maybePromise && maybePromise.then !== undefined)
                returnVal = await maybePromise;
            else
                returnVal = maybePromise;
        }
        finally {
            this._nestedChangeStateCount -= 1;
            if(this._nestedChangeStateCount <= 0)
                this.draftState = null;
        }
        if(this._nestedChangeStateCount <= 0)
            await this._updateState(draft);
        return returnVal;
    }

    _collecStateDependencies() {
        const dependencies = {}
          , notReady = []
          ;
        for(const [key, [referenceCounter, draft]] of this._stateDependenciesDrafts) {
            if(referenceCounter <= 0)
                dependencies[key] = draft.metamorphose({});
            else
                notReady.push(`${key} (references: ${referenceCounter})`);
        }
        if(notReady.length)
            throw new Error(`UNFINISHED BUSINESS ERROR collecting state `
                +`dependencies, but some are not ready for use: ${notReady.join(', ')}.`);
        this._stateDependenciesDrafts.clear();
        return dependencies;
    }

    async _asyncResolveFont(foreignKey, targetContainer, _requiredKey, defaultConstraint) {
        // defaultConstraint is e.g. ForeignKey.SET_DEFAULT_FIRST
        // foreignKey.allowNull => false || true

        // NOTE: requiredKey can be undefined, e.g. initially
        // in that case we need to use defaultConstraint to pick
        // from availableFonts, e.g. SET_DEFAULT_FIRST only makes sense
        // in the context of availableFonts which has a somehow meaningful
        // order.

        // The return value is a key, that must be in installedFonts
        // when returned or ForeignKey.NULL. But ForeignKey NULL will not
        // always be allowed and be checked after executing this.
        // TODO: resolve InstalledFonts
        //    Simplest to hardest:
        //    - the font is already installed in targetContainer
        //          -> that would be an Error, as there's no reason
        //             to call asyncResolve at all
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
        const installedFonts = this._readStateDependency('installedFonts')
          , availableFonts = this._readStateDependency('availableFonts')
          , requiredKey = _requiredKey === undefined
                ? foreignKey[defaultConstraint](availableFonts, _requiredKey)
                : _requiredKey
          ;

        // requiredKey MAY be ForeignKey.NULL after running foreignKey[defaultConstraint]
        // That removes the information we need in order to ask the user
        // to provide a font.

        if(installedFonts.has(requiredKey)) {
            // NOTE: this shouldn't be required in that case!
            // WELL: actually we do it to detect which of the installedFonts
            // are actually used!
            targetContainer.set(requiredKey, installedFonts.get(requiredKey));
            return requiredKey;
        }
        else if(availableFonts.has(requiredKey)) {
            // temporary to bootstrap as the rawInstalledFont must
            // be completely resource managed eventually.
            // This is a TODO! "completely resource managed" means
            // also we must uninstall the font again when not used
            // anymore.
            // This requires a context where installedFontsDraft is already prepared.
            await this._fontManager.installFont(requiredKey);
            targetContainer.set(requiredKey, installedFonts.get(requiredKey));
            return requiredKey;
        }
        else if(requiredKey === foreignKey.NULL)
            return requiredKey;
        // The main case should be the second case above: the font is
        // available but not installed. The cases below should be more
        // common when a state is e.g. send to another person i.e.
        // opened in a new browser.
        //
        // install, switch/remap font ???
        // in case of switch/remap, all later occurences of
        // the key should be remapped as well!
        throw new Error(`RESOURCE ERROR ${this}._asyncResolve the font ${requiredKey.toString()} is not available`);
        // const returnVal = 'Hello';
        // console.log(`REQUIRE InstalledFontsModel targetContainer ${targetContainer}`, targetContainer
        //     , `\nrequiredKey "${requiredKey}" returning ${returnVal}`);
        // return returnVal;

        // note. after having asked the user for action, this may also
        // return ForeignKey.NULL, the caller will have to handle that case
        // return requiredKey;
    }
    /**
     * Note: shared state is a simple object shared between calls within
     * one run of metamorphoseGen. That way we track made decisions e.g.
     * made by the user and re-apply them without prompting again, i.e.
     * when a required font is replaced with one that has a different name.
     * If state handling becomes too complex, it's possible to put the
     * logic into an external class. Where either sharedState could be
     * the instance with it's own methods, or _asyncResolve could be
     * a method of a class. In the latter case, note that we want to
     * use "private" methods of VideoproofController.
     *
     * Resolve can either add/install a missing dependency or change
     * the key that is requested for another key or do both.
     */
    async _asyncResolve(sharedState, resourceRequirement) {
        // console.log(`${this}._asyncResolve request ${resourceRequirement}`  );
        const [indicator, ...args] = resourceRequirement.description;
        if(indicator instanceof ForeignKey) {
            // ForeignKey:installedFonts NOT NULL], [model InstalledFontsModel], from-file Tilt Prism Regular Version_1-000]
            const foreignKey = indicator
              , [targetContainer/* e.g: , requiredKey, defaultConstraint*/] = args
              ;
            if(targetContainer.constructor === InstalledFontsModel)
                return await this._asyncResolveFont(foreignKey, ...args);
            // else if(targetContainer.constructor === AvailableFontsModel)
            //      NOTE: it doesn't work this way!!!
            //      this won't be directly required!
            //      resolve AvailableFontsModel
            else
                throw new Error(`RESOURCE ERROR don't know how to resolve ${resourceRequirement}`);
        }
        throw new Error(`RESOURCE ERROR dont know how to handle ${resourceRequirement}`);
    }

    /**
     * Note _asyncMetamorphoseState passes through this, as after the
     * dependencies have all been managed all that is left is a sync
     * operation to metamorphose.
     */
    _syncMetamorphoseState(draft=null) {
        const immutableDependencies = this._collecStateDependencies()
          , hasNewDependencies = Object.keys(immutableDependencies).length > 0
          ;

        // Do we update only because of changed dependencies?
        // The async path passes through this, so maybe we can keep this.
        if(draft === null && !hasNewDependencies)
            // This is a shortcut, the result would be the same as
            // newState === this.state.
            return;

        // In this case, if draft === null we only update because of
        // changed dependencies, so draftState is a new draft of this.state.
        //
        // It would be interesting if the async path could/should detect
        // this case and pass null. It's possible if a dependency got
        // removed that was not used previously, but the state was not
        // changed. However, if the passed draft is the equivalent of
        // this.state.getDraft() it doesn't matter.
        const draftState = draft === null
                ? this.state.getDraft()
                : draft
                ;
        // This may raise but we catch the relevant isDeliberateResourceResolveError
        // in the caller _updateState.
        return draftState.metamorphose(immutableDependencies);
    }

    async __asyncMetamorphoseState(draft=null) {
        const primedDependencies = {};
        for(const key of ['installedFonts'])
            // this._useStateDependencyDraft(key);
            // This will hold the required fonts eventually
            // It must be empty, so we force metamorphoseGen to request
            // all fonts.
            primedDependencies[key] = this._stateDependencyModels[key].createPrimalDraft({});

        for(const key of ['availableFonts'])
            // We don't remove from these in this operation, but we may
            // add to it.
            primedDependencies[key] = this._requireStateDependencyDraft(key);

        for(const key of ['availableLayouts'])
            // These don't change at all here (so far)
            primedDependencies[key] = this._readStateDependency(key)


        // In this case, if draft === null we only update because of
        // supposedly changed dependencies, or maybe
        // this._requireReviewResourcesFlag was set to check for
        // excessive installed fonts.
        // If we don't detect change, I believe we could pass null
        // to _syncMetamorphoseState.
        const draftState = draft === null
                ? this.state.getDraft()
                : draft
            // fn(dependencies) => gen
          , gen = draftState.metamorphoseGen(primedDependencies)
            // this._asyncResolve installs fonts already into
            // this._useStateDependencyDraft('installedFonts') and
            // puts a copy into primedDependencies['installedFonts']
            // that way, we don't have to "properly" install these fonts
            // in here later.
            // If the user decides to add new fonts, these should be added
            // by _asyncResolve into avavailableFonts and then also be
            // installed and used directly.
          , sharedState = {}
          , newState = await driveResolveGenAsync(this._asyncResolve.bind(this, sharedState), gen)
          ;

        // Take care of no longer used fonts.
        // It's interesting that this step is not strictly required, but
        // it removes unused dependencies and thus frees memory.
        const appInstalledFontNames = [...this._readStateDependency('installedFonts').keys()]
          , installedFonts = primedDependencies['installedFonts']
          ;
        for(const fontName of appInstalledFontNames) {
            if(installedFonts.has(fontName))
                continue;
            // no longer used
            // this requires a context where  installedFontsDraft is already prepared.
            console.warn(`${this}._asyncMetamorphoseState no longer used font -- uninstalling: ${fontName}`);
            this._fontManager._uninstallFont(fontName);
        }
        return newState;
    }

    /**
     * This tackles a hen-egg problem the dependencies must all be available
     * when we do the synchronous metamorphose, but we don't know all the
     * dependencies before doing a metamorphose.
     * It's not entirely true, but we also wan't the dependencies to be
     * immutable eventually, as this ensures a fully completed state without
     * side effects. I'm not entirely sure if that latter requirement could
     * be lifted at some point, it may be possible.
     */
    async _asyncMetamorphoseState(draft=null) {
        // Use empty dependencies to acquire an exact record of used
        // dependencies.
        const requiredStateDependecyDrafts = ['installedFonts', 'availableFonts']
          ;
        // availableFonts, installedFonts, availableLayouts
        // So far, we don't change availableLayouts.
        // We change availableFonts only when we ask the user to supply a
        // missing font.
        // installedFonts changes most often.
        // Maybe at some point an availableLayouts/installedLayouts
        // feature will be added, where sub-apps can be loaded dynamically
        // That installedLayouts will have to go into this list as well.
        // At the moment, availableLayouts is what installedLayouts will
        // be, while availableLayouts would be information how to load
        // the layouts. In so far, availableLayouts is not a good name
        // now.
        const newState = await this._useStateDependencyDraftContextWrapper(
                  true
                , this.__asyncMetamorphoseState.bind(this)
                , ...requiredStateDependecyDrafts)(draft);

        // If this call raises isDeliberateResourceResolveError it's
        // not supposed to be catched so far.
        // _syncMetamorphoseState will make the dependencies immutable.
        return this._syncMetamorphoseState(newState.getDraft());
    }

    /**
     * The paradigm used to be to resolve all async requirements
     * before calling metamorphose. But it turned out that detecting
     * missing requirements and running metamorphose is largely the same,
     * at least, pure detection would be a big code duplication with no
     * real additional functionality. HOWEVER: there are many cases
     * where metamorphose is called within the code and it's
     * expected to be sync, so making all those calls async would require
     * a big rewrite, as async requires the whole call stack to be async,
     * all the way up.
     * The smart move here was to use generator functions where the
     * yield statement can return a value into the generator. This allows
     * to make metamorphose sync or async depending on the caller function.
     * The async style can be used to load async requirements, the sync
     * style can be used as before.
     * Despite that, the old reference counting model was broken as well.
     * E.g. a layer/family in the array, when deleted, does would not call
     * unload. It should however. The fix is not having to do this explicitly
     * anymore. It was brittle as it was bound more or less to the
     * font-selecting UI, but UI is the wrong place to handle this.
     * So, here, we detect all referenced fonts and make sure
     * the are loaded and the rest is unloaded. The unloading is not a
     * real requirement of the state, so  we can do it more lazily or when
     * hinted by setting a flaf `this._requireReviewResourcesFlag`.
     *
     * FIXME: There used to be a font loading/unloading issue. If the only
     * "installed font" was deleted, e.g. the "Manage fonts" dialog,
     * and no other font is installed, the foreign key constraint fails,
     * as it couldn't find another font within installedFonts.
     * It should rather fallback to available fonts.
     *
     * TODO: A further issue is, that we may find out that the constraint
     * can't be resolved. It would be nice to create UI/Wizzard to handle
     * that directly.
     *
     * The UI code that changes state may be interested in reading
     * from the newly selected font instantly, so we should probably keep
     * the way to load the font in place. It will just be directly unloaded
     * again if it is not used in the model.
     */
    async _updateState(draft=null) {
        if(this.draftState) {
            // This is within a withChangeState transaction and
            // withChangeState will call _updateState eventually.
            // Maybe it's enough to just return at this point...
            if(this.draftState === draft)
                return;
            // Though, if a draft was passed and that draft is not
            // this.draftState, changes on this.draftState would get lost.
            throw new Error('Looks like a fork of changed states has occured!');
        }

        let newState;
        if(this._requireReviewResourcesFlag)
            newState = await this._asyncMetamorphoseState(draft);
        else {
            try {
                newState = this._syncMetamorphoseState(draft);
            }
            catch(error) {
                if(!isDeliberateResourceResolveError(error))
                    throw error; // re-raise
                // If it was not flagged, but the simple sync metamorphose
                // fails with an Error from failingResourceResolve, that
                // should be equal to a call flagged with this._requireReviewResourcesFlag;
                // This happens when required dependencies are not readily
                // available yet, it doesn't happen when not required
                // dependencies are loaded regardless.
                // CAUTION it happened that this path raises but when
                // flagged directly and going directly into _asyncMetamorphoseState
                // succeeds. I think it is because of side-effects on
                // the state that cannot be cured here.
                // Error was:
                //     "Uncaught (in promise) Error: RESOURCE ERROR
                //      [VideoproofController]._asyncResolve the font
                //      from-file file-name_ttf Version_0-live is not available"
                // raised in _asyncResolveFont
                // This was via handlePostMessage when two separate fonts
                // where loaded on init in short succession.
                newState = await this._asyncMetamorphoseState(draft);
            }
        }
        this._requireReviewResourcesFlag = false;
        this._replaceState(newState);
    }

    _replaceState(newState) {
        if(this._lockChangeState !== null)
            throw new Error(`State change is locked with: ${this._lockChangeState}`);

        if(newState === this.state)
            return;
        // console.log('new app state', newState);
        if(newState.constructor !== this.state.constructor)
            throw new Error(`TYPE ERROR types don't match new state is ${newState} but this.state is ${this.state}.`);
        // get change information

        if(newState.isDraft)
            throw new Error(`VALUE ERROR new state ${newState} must be immutable, but is a draft.`);

        const compareResult = new StateComparison(this.state, newState)
          , statuses = new Set(compareResult.map(([status,,])=>status))
          ;
        // compareResult.toLog(compareResult);
        this.state = newState;

        // FIXME: missed root! ???
        if(statuses.size === 1 && statuses.has(COMPARE_STATUSES.EQUALS))
            return;
        // CAUTION: changeState must not be called in the update phase
        this._lockChangeState = '_replaceState';
        try {
            this._ui.update(compareResult);
        }
        finally {
            this._lockChangeState = null;
        }
    }

    async _loadInitialResourcesFromPromises(...resources) {
        const byType = new Map();
        for(let [type, ...resourceDefinition] of resources) {
            let list = byType.get(type);
            if(!list) {
                list = [];
                byType.set(type, list);
            }
            list.push(resourceDefinition);
        }
        const types =  []
          , typeResults = []
          ;
        for(let type of byType.keys()) {
            let promise;
            switch(type) {
                case 'font':
                    promise = this._fontManager.loadInitialFontsFromResources(byType.get(type))
                        .catch(error=>this.uiReportError('fontManager.loadInitialFontsFromResources', error));
                    break;
                case 'localFontStorage':
                    promise = byType.get(type)[0][0]
                        .then(localFontStorage=>this._fontManager.onLocalFontStorage(localFontStorage))
                        .then(()=>this._fontManager.loadInitialFontsFromLocalFontStorage());
                    break;
                case 'harfbuzz':
                    // falls through;
                case 'ready':
                    // We made sure in init to only add one of this.
                    [promise] = byType.get(type)[0];
                    break;
                default:
                    console.warn(`ATTEMPT TO LOAD  UNKOWN TYPE: ${type}`);
            }
            types.push(type);
            typeResults.push(promise);
        }

        return Promise.all(typeResults)
            .then(resolved=>new Map(zip(types, resolved)))
            .catch(error=>this.uiReportError('_loadInitialResourcesFromPromises', error));
    }

    reset() {
        // TODO: in Ramp Mode (ManualAxis + MultipleTargets but no
        // animation etc. this should re-init the proof and it's default
        // values ...
        // Also, trigger 'click' on keyFramesContainer.querySelector('li a')
        // is not ideal, as we should reset the value and have the UI follow.
        //
        // Maybe we can define his per Layout
    }
}
