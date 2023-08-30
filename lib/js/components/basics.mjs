/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import DOMTool from '../domTool.mjs';

import {
    Path
//  , COMPARE_STATUSES
  , StateComparison
  // , ForeignKey
  , getEntry
  // , unwrapPotentialWriteProxy
  , FreezableMap
} from '../metamodel.mjs';


 // To mark the update strategy of the widget
export const UPDATE_STRATEGY_SIMPLE = Symbol('UPDATE_SIMPLE')
    // Maybe requires a renaming, but it means the update strategy
    // that receives "compareResult" as argumnet (not changeMap)
  , UPDATE_STRATEGY_COMPARE = Symbol('UPDATE_COMPARE')
    // won't call the update method at all
  , UPDATE_STRATEGY_NO_UPDATE = Symbol('NO_UPDATE')
    // this is where the widget stores the UPDATE_STRATEGY_{***} marker
  , UPDATE_STRATEGY = Symbol('UPDATE_STRATEGY')
    // FIXME: so far this is a hack, as the underlying problem is not fuly
    // solved by this.
  , HANDLE_CHANGED_AS_NEW = Symbol('HANDLE_CHANGED_AS_NEW')
  ;

// base class for all UI elements
// mainly to describe general interfaces
export class _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_SIMPLE; // jshint ignore:line

    get _domTool() {
        return this.parentAPI.domTool;
    }
    _insertElement(...args) {
        return this.parentAPI.insertElement(...args);
    }
    getEntry(...args) {
        return this.parentAPI.getEntry(...args);
    }
    getEntryRaw(...args) {
        return this.parentAPI.getEntryRaw(...args);
    }
    _changeState(fn) {
        return this.parentAPI.withChangeState(fn);
    }
    _getChangedMapFromCompareResult(compareResult, ...args) {
        // FIXME: maybe that call could be directly in parentAPI as:
        //     return this.parentAPI.getChangedMapFromCompareResult(compareResult, ...args);
        return this.parentAPI.wrapper.getChangedMapFromCompareResult(compareResult.isInitial, compareResult, ...args);
    }
    // This is a decorator, it returns a function that when called
    // wraps fn into a call to this.parentAPI.withChangeState,
    // applying the ...args to fn when executed.
    _changeStateHandler(fn) {
        return (...args)=>this._changeState(()=>fn(...args));
    }

    constructor(parentAPI) {
        this.parentAPI = parentAPI;
    }

    toString() {
        return `[Component ${this.constructor.name}]`;
    }
    /* Remove all elements inserted using the domInsert method.
     * Remove all EventListeners especialy those to elements outside,
     * e.g. sometimes a listener must be attached to window.
     *
     * There could be a pattern via DOM events:
     *      // In the destroy method:
     *      // clean up external side effects
     *
     *      // If there are children widgets, call their destroy methods.
     *      // For covencience, parentAPI.insertElement keeps track
     *      // of all elements it inserted and removes them when from the
     *      // dom just before calling destroy.
     */
    destroy () {
        // Not raising this anymore, as it is not often that an actual
        // action is required on destroy, the default is to do nothing.
        // throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.destroy!`);
    }

    /**
     * changedMap is a map with all changed dependecies of the widgets set
     * unchanged dependencies are not included
     * The actual description and mapping of the dependencies must happen
     * in the parent, here's no mechanism that checks if the method is
     * called correctly yet.
     * The order in which changed dependencies are updated in the widgets
     * is up to the implementation (and sometimes it matters), but it
     * should react to all updated dependencies that are present.
     */
    update(changedMap) {
        // jshint unused: vars
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.update!`);
    }

    // CAUTION: should not use these anymore, as the state/model that was
    // the UI before required this in videoproof, but the concept has changed.
    set value(value) {
        /*jshint unused: false */
        throw new Error(`DEPRECATED: ${this.constructor.name}.set value!`);
    }
    get value() {
        throw new Error(`DEPRECATED: ${this.constructor.name}.get value!`);
    }
}

export class _ProtocolHandler {
    static checkProtocolName(protocolName) {
                        // Keep normal paths separated from these special dependency keys.
        if(!protocolName.endsWith('@'))
            return [false, `ProtocolHandler protocol-name must end with "@" `
                + `but got "${protocolName}"`];

        if(protocolName.indexOf('@') !== protocolName.length-1)
            return [false, `ProtocolHandler protocol-name must contain only one "@" at the end `
                + `but got "${protocolName}"`];
        return [true, null];
    }
    static create(protocolName, ...args) {
        return [protocolName, new this(protocolName, ...args)];
    }
    constructor(protocolName) {
        const [passes, message] = _ProtocolHandler.checkProtocolName(protocolName);
        if(!passes)
            throw new Error(`VALUE ERROR ${message} in constructor ${this.name}`);
        Object.defineProperty(this, 'protocolName', {value: protocolName});
    }
    toString() {
        return `[ProtocolHandler ${this.protocolName}]`;
    }
    register(identifier, value) {
        throw new Error(`NOT IMPLEMENTED: ${this}.register `
        + `called with identifier: ${identifier} value: ${value}`);
    }
    getRegisered(identifier) {
        throw new Error(`NOT IMPLEMENTED: ${this}.getRegisered `
        + `called with identifier: ${identifier}`);
    }
    /**
     * return [bool wasUpdated, registered value]
     */
    getUpdated(identifier) {
        throw new Error(`NOT IMPLEMENTED: ${this}.getUpdated `
        + `called with identifier: ${identifier}`);
    }
}

class ComponentWrapper {
    // jshint ignore:start
    static DEPENDECIES_ALL = 'all';
    static DEPENDECIES_DEFAULT = 'default';
    // jshint ignore:end
    constructor(parentAPI, rawDependencyMapping
                , {
                      hostElement=null, rootPath=null, activationTest=null
                    , id=null, protocolHandlers=[], ...restOptions
                  }
                , WidgetClass, ...widgetArgs) {
        this.WidgetClass = WidgetClass;
        this.host = hostElement;
        this._placemarker = null;
        this._activationTest = activationTest;
        this.id = id;

        if(protocolHandlers.length) {
            for(const [protocolHandler, ] of protocolHandlers) {
                // Keep normal paths separated from these special dependency keys.
                const [passes, message] = _ProtocolHandler.checkProtocolName(protocolHandler);
                if(!passes)
                    throw new Error(`VALUE ERROR ${message} `
                    + `in wrapper for ${this.WidgetClass.name} `
                    + `at rootPath: ${rootPath || parentAPI.rootPath}`);
            }
            // Previous (parentAPI) handlers are overridden by
            // the newer ones defined here
            this._protocolHandlers = new Map([
                  ...(parentAPI.protocolHandlers || [])
                , ...protocolHandlers
            ]);
        }
        else
            this._protocolHandlers = parentAPI.protocolHandlers || new Map();

        this._protocolHandlerRegistrations = new Map();
        // restOptions may contain `{protocolHandlerKey}@` entries!
        for(const [restKey, restValue] of Object.entries(restOptions)) {
            // Register on widget creation and unregister on widget destruction.
            if(this._protocolHandlers.has(restKey)) {
                this._protocolHandlerRegistrations.set(restKey, {identifier: restValue, unregister: null});
            }
        }

        // store inserted elements, to be removable again
        this.insertedElements = [];
        this._rawDependencyMapping = rawDependencyMapping;

        Object.defineProperty(this, 'dependencies', {
            // get: ()=>new Set(this.dependencyMapping.keys())
            get() {
                throw new Error(`NOT IMPLEMENTED getter "dependencies" in [object ${this.constructor.name}]`);
            }
        });

        // initialized in _updateRootPath
        Object.defineProperty(this, '_fullDependencyMappings', {
            get: ()=>{throw new Error(`LIFCYCLE ERROR _fullDependencyMappings is available after _updateRootPath.`);}
          , configurable: true
        });

        this.dependencyReverseMapping = null; // _see updateRootPath;
        this.parentAPI = Object.assign(
            Object.create(parentAPI) // inherit
          , {
                insertElement: this.insertElement.bind(this)
              , rootPath: null // see _updateRootPath;
              , getEntryRaw: parentAPI.getEntry
              , getEntry (internalName) {
                    const externalName = this.getExternalName(internalName)
                        // These only work with string names, can't be path instances.
                      , protocolHandler = typeof externalName === 'string'
                                ? externalName.slice(0, externalName.indexOf('@') + 1)
                                : ''
                      ;
                    if(protocolHandler.length && this.protocolHandlers.has(protocolHandler)) {
                        const protocolHandlerImplementation = this.protocolHandlers.get(protocolHandler);
                        return protocolHandlerImplementation.getRegisered(externalName);
                    }
                    return parentAPI.getEntry(externalName);
                }
              , getExternalName: (internalName)=>{
                    return this.dependencyReverseMapping.has(internalName)
                        ? this.dependencyReverseMapping.get(internalName)
                        : internalName
                        ;
                }
              , grandParentAPI: parentAPI
              , wrapper: this
              , protocolHandlers: this._protocolHandlers
              , getProtocolHandlerRegistration: this.getProtocolHandlerRegistration.bind(this)
            });
        this._updateRootPath(rootPath || parentAPI.rootPath);
        this._widgetArgs = widgetArgs;
        this.widget = null;
        this._unsetProtocolHandlerImplementation = new Map();
    }

    getDependencyMapping(type=super.DEPENDECIES_ALL) {
        if(!Object.hasOwn(this._fullDependencyMappings, type))
            throw new Error(`KEY ERROR getDependencyMapping type "${type}" not found.`);
        return this._fullDependencyMappings[type];
    }
    /**
     * This are **only the model dependencies**, keeping the name so far
     * for historical reasons.
     * this.getDependencyMapping() defaults to DEPENDECIES_ALL!
     */
    get dependencyMapping() {
        return this.getDependencyMapping(this.constructor.DEPENDECIES_DEFAULT);
    }

    getProtocolHandlerImplementation(protocolHandler) {
        if(!this._protocolHandlers.has(protocolHandler))
            throw new Error(`KEY ERROR protocolHandler "${protocolHandler}" not found for this ${this.WidgetClass.name}.`);
        return this._protocolHandlers.get(protocolHandler);
    }

    getProtocolHandlerRegistration(protocolHandler) {
        if(!this._protocolHandlerRegistrations.has(protocolHandler))
            throw new Error(`KEY ERROR protocolHandler "${protocolHandler}" not found for this ${this.WidgetClass.name}.`);
        const {identifier} =  this._protocolHandlerRegistrations.get(protocolHandler)
          , protocolHandlerImplementation = this._protocolHandlers.get(protocolHandler)
          ;
        return [identifier, protocolHandlerImplementation];
    }

    setProtocolHandlerImplementation(protocolHandler, protocolHandlerImplementation) {
        // Cleanup function. setProtocolHandlerRegistration should be called
        // at max once and only if it is not feasible to install the protocol
        // handler from the parent/wrapper definition, otherwise it becomes
        // hard to know which implementation is the right one to use.
        if(this._unsetProtocolHandlerImplementation.has(protocolHandler))
            throw new Error(`PROTOCOL ERROR setProtocolHandlerImplementation for `
                + `"${protocolHandler}" must be called only once by widget.`);

        const old = this._protocolHandlers.has(protocolHandler)
            ? [protocolHandler,  this._protocolHandlers.get(protocolHandler)]
            : null
            ;
        this._protocolHandlers.set(protocolHandler, protocolHandlerImplementation);
        this._unsetProtocolHandlerImplementation.set(protocolHandler, old);
    }

    _absPathDependencies(dependencyMappings) {
        let result = {
            [this.constructor.DEPENDECIES_DEFAULT]: new Map() // regular paths into the model
          , [this.constructor.DEPENDECIES_ALL]: new Map()
        };
        for(const protocolHandler of this._protocolHandlers.keys())
            result[protocolHandler] =  new Map();
        // For convenience, we can skip one part of a one to one mapping:
        //      entry = 'hello' =>   'hello': 'hello'
        //      entry = ['hello'] => 'hello': 'hello'
        //      entry = ['hello', 'world'] => 'hello': 'world'
        for(const entry_ of dependencyMappings) {
            if(entry_ === undefined)
                throw new Error(`VALUE ERROR dependencyMappings in _absPathDependencies`
                + ` has an empty entry, in ${this.constructor.name} at ${this.parentAPI.rootPath}.`);
            const entry = Array.isArray(entry_) ? entry_ : [entry_]
              , external = entry.at(0)
              , internal = entry.at(-1) === undefined ? external : entry.at(-1)
                // For this to work reliably protocolHandler must only have
                // one @ at the end.
              , protocolHandler = external.slice(0, external.indexOf('@') + 1)
              ;
            let typeKey, absoluteExternal;
            if(protocolHandler.length && this._protocolHandlers.has(protocolHandler)) {
                // FIXME: the question is if we should put this somewhere
                // else completely. Also, eventually the "normal" behavior
                // could just be implemented as a default protocol handler.
                typeKey = protocolHandler;
                absoluteExternal = external;
            }
            else {
                typeKey = this.constructor.DEPENDECIES_DEFAULT;
                // without actually knowing the model structure, the save
                // way to do this is to remove single dot path parts and
                // reduce consecutive slashes into single slashes.
                // Double dots are be handled as well, e.g.:
                //      '/hello/beautiful/../world' => '/hello/world'
                // This is just simple path arithmetic, e.g. not following
                // links, which are implemented in the model. Links would
                // have to be resolved first in place, before applying
                // removal of path parts via "..".
                absoluteExternal = external.startsWith('/')
                    ? Path.stringSanitize(external)
                    : this.parentAPI.rootPath.append(external).toString()
                    ;
            }
            result[typeKey].set(absoluteExternal, internal);
            result[this.constructor.DEPENDECIES_ALL].set(absoluteExternal, internal);
        }
        return result;
    }

    /**
     * CAUTION: this does not propagate to its child widget which e.g.
     * can be a _BaseContainerComponent. However currently we do not
     * keep track of the rootPath definitions of the widgets of those
     * containers (could be e.g. a function), so we can't update the
     * rootPath of those, yet, outside of the constructors. Hence, rebuilding
     * when the rootPath changes is much simpler and the effort to make
     * it updateable is _currently_ not justified.
     */
    _updateRootPath(rootPath) {
        this.parentAPI.rootPath = rootPath;

        Object.defineProperty(this, '_fullDependencyMappings', {
            value: this._absPathDependencies(this._rawDependencyMapping)
          , configurable: false
        });

        // this contans all of the dependencies
        this.dependencyReverseMapping = new Map([...this._fullDependencyMappings[this.constructor.DEPENDECIES_ALL]]
                        .map(([external, internal])=>[internal, external]));
    }

    getChangedMapFromCompareResult(isInitialUpdate, compareResult, toLocal=true) {
        const modelChangedMap = compareResult.getChangedMap(this.dependencyMapping, toLocal)
          , changedMap = new FreezableMap(modelChangedMap)
          ;
        // ... add protocol handlers dependencies ...
        // FIXME: if this has dependencies via protocolHandlers, changeMap should include it.
        for(const [protocolHandler, protocolHandlerImplementation] of this._protocolHandlers) {
            const dependenciesMap = this._fullDependencyMappings[protocolHandler];
            for(const [rootPath, localPath] of dependenciesMap.entries()) {
                // FIXME: it's interesting, if this is initial, we must always include it
                let wasUpdated, value;
                if(isInitialUpdate) {
                    wasUpdated = true;
                    value = protocolHandlerImplementation.getRegisered(rootPath);
                }
                else
                    [wasUpdated, value] = protocolHandlerImplementation.getUpdated(rootPath);
                if(wasUpdated)
                    changedMap.set(toLocal ? localPath : rootPath, value);
            }
        }
        return  Object.freeze(changedMap);
    }

    setPlacemarker(placemarker) {
        this._placemarker = placemarker;
    }

    // could be an exported function
    static insertElement (insertedElements, target, element) {
            const elements = [];
            if(element.nodeType === target.DOCUMENT_FRAGMENT_NODE)
                // resolve the fragment, so we can keep track of the
                // inserted elements
                elements.push(...element.childNodes);
            else
                elements.push(element);
            insertedElements.push(...elements);
            if(target.nodeType === 8) //Node.COMMENT_NODE === 8
                // insert before
                elements.forEach(elem=>DOMTool.insertBefore(elem, target));
            else
                target.append(...elements);
    }
    insertElement(element) {
        this.constructor.insertElement(this.insertedElements, this._placemarker || this.host, element);
    }

    /**
     *  CAUTION use with care, some critique is in:
     *       _BaseDynamicCollectionContainerComponent._provisionWidgets
     */
    reinsert() {
        const elements = this.insertedElements.splice(0, Infinity);
        for(const element of elements)
            this.insertElement(element);
    }

    activationTest() {
        if(!this._activationTest)
            // If there's no test, always activate!
            return true;
        return this._activationTest();
    }
    get hasActivationTest() {
        return !!this._activationTest;
    }

    create() {
        if(this.widget !== null)
            throw new Error(`Widget, a ${this.WidgetClass.name}, is already created.`);
        this.widget = new this.WidgetClass(this.parentAPI, ...this._widgetArgs);

        for(const [protocolHandler, data] of this._protocolHandlerRegistrations) {
            const protocolHandlerImplementation = this._protocolHandlers.get(protocolHandler);
            data.unregister = protocolHandlerImplementation.register(data.identifier,  this.widget);
        }

        return this.widget;
    }
    destroy() {
        if(this.widget)
            this.widget.destroy();

        for(const [/*protocolHandler*/, data] of this._protocolHandlerRegistrations) {
            if(data.unregister !== null)
                data.unregister();
            data.unregister = null;
        }

        for(const [protocolHandler, old] of this._unsetProtocolHandlerImplementation) {
            if(old !== null)
                 this._protocolHandlers.set(protocolHandler, old);
            else
                 this._protocolHandlers.delete(protocolHandler);
        }
        this._unsetProtocolHandlerImplementation.clear();

        this.widget = null;
        for(const node of this.insertedElements)
            // not using node.remove(), because it may be an Element,
            // but it cold also be a textNode or a Comment etc. and
            // and only Element has the remove method.
            node.parentNode.removeChild(node);
        this.insertedElements.splice(0, Infinity);
    }
}
const _NOTDEF = Symbol('_NOTDEF');

export class _CommonContainerComponent extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    // Looking initially for three (then four) target zones.
    //    main => in the sidebar in desktop sizes
    //    before-layout => where we put the animation controls
    //    layout => entirely controlled by the layout widget.
    //    (after-layout =>below proof, maybe for animation editing/keymoments etc. not yet implemented)
    constructor(parentAPI, zones, widgets=[]) {
        super(parentAPI);
        // We need a way to organize layout widgets/uis and to give them
        // a fixed place to be, maybe sub-zones or so, maybe the widget
        // could insert "insert: " comments into the zones and use those
        // to self-organize. no comment found or no target given: append
        // the rest is just about insertion order and widgets can of course
        // group themselves sub widgets together...
        this._zones = zones;

        // for now, to get started, just the permanent residents (font and layout chooser)
        this._idToWidget = new Map();
        this._widgets = [];

        this._childrenParentAPI = Object.assign(
             Object.create(parentAPI) // don't copy, inherit ...
          , { getWidgetById: this.getWidgetById.bind(this) }
        );
        this._widgetsPlacemarker = new Map();
        this._initWidgets(widgets);
    }

    _initWrapper(childrenParentAPI, settings, dependencyMappings, Constructor, ...args) {
        const hostElement = this._zones.get(settings.zone) || null
          , widgetWrapper = new ComponentWrapper(childrenParentAPI, dependencyMappings
                                    , {hostElement, ...settings}
                                    , Constructor, ...args)
          ;
        return widgetWrapper;
    }

    /* supposed to run in constructor */
    _initWidgets(widgets) {
        for(const [settings, dependencyMappings, Constructor, ...args] of widgets) {
            const widgetWrapper = this._initWrapper(this._childrenParentAPI, settings, dependencyMappings, Constructor, ...args);
            this._widgets.push(widgetWrapper);
        }
    }

    destroy() {
        for(const widgetWrapper of this._widgets)
            this._destroyWidget(widgetWrapper);
        for(const placemarker of  this._widgetsPlacemarker.values())
            DOMTool.removeNode(placemarker);
        this._widgetsPlacemarker.clear();
    }

    *activeWidgets() {
        for(const widgetWrapper of this._widgets) {
            if(widgetWrapper.widget === null)
                continue;
            yield widgetWrapper;
        }
    }

    get dependencies() {
        const dependencies = new Set();
        for(const widgetWrapper of this.activeWidgets()) {
            // all dependencies, inculding protocolHandlers
            for(const path of widgetWrapper.dependencyReverseMapping.values())
                dependencies.add(path);
        }
        return dependencies;
    }

    get modelDependencies() {
        const dependencies = new Set();
        for(const widgetWrapper of this.activeWidgets()) {
            // only model dependencies
            for(const path of widgetWrapper.dependencyMapping.keys())
                dependencies.add(path);
        }
        return dependencies;
    }

    getWidgetById(id, defaultVal=_NOTDEF) {
        if(this._idToWidget.has(id))
            return this._idToWidget.get(id).widget;
        else if(this.parentAPI.getWidgetById)
            return this.parentAPI.getWidgetById(id, defaultVal);
        else if(defaultVal !== _NOTDEF)
            return defaultVal;
        // Calling this recursiveley on this.parentAPI will escalate this
        // well. However, we don't have a good way to adress the containers
        // in the chain, so it could become a bit messy to identify where
        // to handle the error. The concept if being able to override names
        // in deeper containers should work out nicely, it's the concept
        // is applied also for dependencies in metamodel.
        throw new Error(`KEY ERROR id "${id}" not found in a ${this.constructor.name}.`);
    }

    _createWidget(widgetWrapper) {
        if(widgetWrapper.id !== null) {
            if(!this._idToWidget.has(widgetWrapper.id))
                this._idToWidget.set(widgetWrapper.id, widgetWrapper);
            else {
                const userWrapper = this._idToWidget.has(widgetWrapper.id)
                  , userWrapperIndex = this._widgets.indexOf(userWrapper)
                  , currentWrapperIndex = this._widgets.indexOf(widgetWrapper)
                  ;
                // Widgets with activationTest can use the same id
                // but they must not be active concurrently.
                throw new Error(`ID IS TAKEN "${widgetWrapper.id}" `
                    + `is already taken by a ${userWrapper.WidgetClass.name} at #${userWrapperIndex} `
                    + `but claimed by a ${widgetWrapper.WidgetClass.name} at #${currentWrapperIndex}`);
            }
        }
        widgetWrapper.create();
    }
    /**
     * CAUTION: does not remove widgetWrapper from this._widgets
     * as e.g. in this._provisionWidgets the widget might be recreated
     * based on widgetWrapper.activationTest
     */
    _destroyWidget(widgetWrapper) {
        if(widgetWrapper.id !== null)
            this._idToWidget.delete(widgetWrapper.id);
        widgetWrapper.destroy();
    }

    _provisionWidgets() {
        throw new Error(`NOT IMPLEMENTED ${this.constructor.name}._provisionWidgets.`);
    }

    initialUpdate(rootState) {
        throw new Error(`NOT IMPLEMENTED ${this.constructor.name}.initialUpdate (called with rootState: ${rootState}).`);
    }

    update(compareResult) {
        const requiresFullInitialUpdate = this._provisionWidgets(compareResult);
        this._update(compareResult, requiresFullInitialUpdate, false);
    }

    // FIXME: this method still is under construction!
    _update(compareResult, requiresFullInitialUpdateSet, isInitialUpdate) {
        // FIXME: thinking in the update case, we should probably get
        //        rootState from the caller, to make it controllable
        //        that the compareResult is based on the same state.
        //        Especially if we're going to do delayed updates for
        //        some UI widgets, e.g. the window adress bar.
        // const changedRootMap = compareResult.getChangedMap(this.dependencies, false);
        // console.log(`${this.constructor.name}.update changedRootMap:`, changedRootMap);
        for(const widgetWrapper of this.activeWidgets()) {
            const requiresFullInitialUpdate = requiresFullInitialUpdateSet.has(widgetWrapper)
              , widget = widgetWrapper.widget
              ;
            if(widget[UPDATE_STRATEGY] === UPDATE_STRATEGY_SIMPLE) {
                // The child is a regular/simple type
                // FIXME: it may already be a full initial,
                //        if called via initialUpdate!
                //        actually

                // console.log(`widgetWrapper.dependencyMapping:`, ...widgetWrapper.dependencyMapping);
                const  _compareResult = (!isInitialUpdate && requiresFullInitialUpdate)
                        ? StateComparison.createInitial(compareResult.newState, widgetWrapper.dependencyMapping)
                        : compareResult
                    // This means just that the widget expects a changeLocaldMap
                    // not a more complex structure, but more complex structures will
                    // likely be required at some point.
                  , changeLocaldMap = widgetWrapper.getChangedMapFromCompareResult(requiresFullInitialUpdate, _compareResult)
                  ;
                if(changeLocaldMap.size)
                    widget.update(changeLocaldMap);
            }
            else if(widget[UPDATE_STRATEGY] === UPDATE_STRATEGY_COMPARE) {
                // e.g.  widgetWrapper.WidgetClass.prototype instanceof _BaseContainerComponent

                // OK, so in this case the **child** is a container type
                // "_BaseContainerComponent"  widgetWrapper.dependencies are ignored
                // and so far they don't produce any dependencies for this
                // kind anyways.

                // The update interface is already taken by this method
                // This basically means, so far, that dependencyMapping
                // for a _BaseContainerComponent has no effect, as the update
                // method will be called anyways with the complete
                // changed-Map.
                if(requiresFullInitialUpdate)
                    widget.initialUpdate(compareResult.newState);
                else
                    // Use the original compare result to cause less
                    // updates i.e. only partial/required updates.
                    widget.update(compareResult);
            }
            else if(widget[UPDATE_STRATEGY] === UPDATE_STRATEGY_NO_UPDATE)
                continue;
            else {
                console.log('widgetWrapper.widget', widget);
                throw new Error(`UPDATE_STRATEGY unkown for ${widget}: ${widget[UPDATE_STRATEGY].toString()}`);
            }
        }
    }
}

export class _BaseContainerComponent extends _CommonContainerComponent {
    _provisionWidgets(/* compareResult */) {
        const requiresFullInitialUpdate = new Set();
        for(const widgetWrapper of this._widgets) {
            const shouldBeActive = widgetWrapper.activationTest()
              , isActive = widgetWrapper.widget !== null
              ;

            if(widgetWrapper.host // no host: not managed in here
                    && widgetWrapper.hasActivationTest// it will not be removed and created during runtime
                    && !this._widgetsPlacemarker.has(widgetWrapper) // this is not the initial run
                    ) {
                const placemarker = this.parentAPI.domTool.createComment('widget placeholder');
                this._widgetsPlacemarker.set(widgetWrapper, placemarker);
                widgetWrapper.host.append(placemarker);
                widgetWrapper.setPlacemarker(placemarker);
            }

            if(shouldBeActive === isActive)
                // Nothing to do:
                //          shouldBeActive && isActive
                //       || !shouldBeActive && !isActive
                //  No action required here.
                continue;

            if(!shouldBeActive && isActive)
                this._destroyWidget(widgetWrapper);

            else if(shouldBeActive && !isActive) {
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
                    // TODO: requires full initial update!
                    // widgetWrapper.widget.initialUpdate(rootState);
            }
        }
        return requiresFullInitialUpdate;
    }

    initialUpdate(rootState) {
        // NOTE: initially all dependencies have changed from the perspective
        // of the UI. Later, we must do a similar thing when widget controllers
        // are initialized after change (or any UI element), however, this should
        // probably be handled by the MainUIController, which thus needs access to
        // the current root state (root from it's own perspective).


        // NOTE: this is a good method to bootstrap any new _BaseContainerComponent
        //
        // However, this is interesting, as A) we don't check if
        // path is actually in state!
        // And B) a new/changed  controllers will change dependencies
        // of this._ui dynamically.
        // Further C) it seems like this would produce changedMap entries
        // for UI-widgets that might get destroyed when processing.
        // A) will be done in compareResult.getChangedMap, however it's not
        //    necessarily obious there that the missing path originated
        //   in ui.dependencies
        //  B) We'll have to execute this

        // for(let path of this.dependencies) {
        //     const pathInstance = Path.fromString(path);
        //     compareResult.push([COMPARE_STATUSES.NEW, undefined, pathInstance]);
        // }

        // This will only be complete for simple widgets, not container
        // widgets "_BaseContainerComponent"
        const requiresFullInitialUpdate = this._provisionWidgets();//compareResult);
        const compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        this._update(compareResult, requiresFullInitialUpdate, true);
    }
}

export class _BaseDynamicCollectionContainerComponent extends _CommonContainerComponent {
    constructor(parentAPI, zones, itemEntryPath) {
        // provision widgets dynamically!
        super(parentAPI, zones);
        Object.defineProperties(this, {
            _itemEntryPath: {
                value: typeof itemEntryPath === 'string'
                            ? Path.fromString(itemEntryPath)
                            // It could be an array or a Path
                            // will be used with path.append(...this.itemEntryPath)
                            : Path.fromParts(...itemEntryPath)
            }
        });
    }

    get dependencies() {
        const dependencies = super.dependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // CAUTION: Is this true? Yes it is! Should probably be the default
        // for all _BaseDynamicCollectionContainerComponent.
        for(const externalName of this.parentAPI.wrapper.dependencyReverseMapping.values())
            dependencies.add(externalName);
        return dependencies;
    }

    get modelDependencies() {
        const dependencies = super.modelDependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // CAUTION: Is this true? Yes it is! Should probably be the default
        // for all _BaseDynamicCollectionContainerComponent.
        for(const externalName of this.parentAPI.wrapper.dependencyMapping.keys())
            dependencies.add(externalName);
        return dependencies;
    }



    _createWrapper(rootPath) {
        throw new Error(`NOT IMPLEMENTED ${this.constructor.name}._createWrapper (called with rootPath: ${rootPath}).`);
    }
    // This completely overrides how _BaseContainerComponent _provisionWidgets,
    // but it could also be integrated and call super._provisionWidgets()
    // at some point, e.g. to check the activationTest which is in this case not
    // configured.
    _provisionWidgets(compareResult) {
        const {LIST_NEW_ORDER, EQUALS, MOVED, NEW, CHANGED} = StateComparison.COMPARE_STATUSES
          , requiresFullInitialUpdate = new Set()
          , itemsAbsPathStr = this.parentAPI.getExternalName('collection')
          , itemsPath = Path.fromString(itemsAbsPathStr)
          , compareMap = compareResult.getDetaislMap()
          , resultsMap = compareMap.has(itemsAbsPathStr)
                ? compareMap.get(itemsAbsPathStr)
                : new Map()
          ;

        for(const [status, _payload] of resultsMap) {
            let data;
            if(status === NEW /* and not empty */ ) {
                /* only happens when e.g. /activeState/activeActors is initally
                 * filled, so far only in the current development fixture,
                 * however, to have initially values should also be the case
                 * when loading state from serialization ...
                 * FIXME: StateComparison should maybe create this _payload
                 * when the state is NEW
                 */
                const items = getEntry(compareResult.newState, itemsPath);
                if(items.size === 0)
                    continue;
                data = [];
                for(let i=0, l=items.size;i<l;i++)
                    data[i] = [NEW];
            }
            else if(status === LIST_NEW_ORDER)
                data = _payload;
            else
                continue;

            //     [EQUALS]  // found in oldState
            //     [MOVED, oldIndex]  // found in oldState
            //  both mean the content is different:
            //      [NEW] Not found in oldState
            //      [CHANGED]  => CHANGED is like DELETED + NEW
            //  [DELETED] is not a thing, the list size has changed though!
            //      i.e. remove the rest from the old list if it is longer
            const newWidgets = []
                  // The ones that remain in this will be decomissioned
                  // i.e. delete is the default.
                , deletedWidgets = new Set(this._widgets)
                , skipUpdates = new Set()
                ;
            for(const [i, [itemStatus/*, oldIndex */]] of data.entries()) {
                // this is expected by KeyMomentController
                const rootPath = itemsPath.append(i, ...this._itemEntryPath);
                if(itemStatus === EQUALS) {
                    // doesn't require an update, but it also shouldn't
                    // get created for this index either.
                    const widgetWrapper = this._widgets[i];
                    newWidgets[i] = widgetWrapper;
                    skipUpdates.add(i);
                    deletedWidgets.delete(widgetWrapper);
                }
                else if(itemStatus === CHANGED) {
                    // This should be called with the update mechanism
                    // it expects and because it CHANGED

                    // Here's a problem, specific case: in the hierarchy
                    // of the Stage with multi level deep nesting via the
                    // activeActors a Layer is identified as "CHANGED"
                    // even though it was moved from a deeper hierarchy
                    // to the slot of the before an existing layer.
                    //
                    // Layer (B) is moved out of Layer (A) and inserted
                    // just before Layer (A):
                    //
                    // FROM:
                    //      Layer (A)
                    //          Layer (B)
                    //              Circle
                    // TO:
                    //      Layer (B)
                    //          Circle
                    //      Layer (A)
                    //
                    // The problem seems, that in the children widgets some
                    // paths are not getting updated, and it's a mess, because
                    // paths are copied around at creation time. So, the
                    // Circle is still querying it's position as if it was
                    // one level deeper.
                    //
                    // In the case above, rebuilding the widget
                    // is a legitimate response, as it is more like a
                    // complete new thing than a change, Layer (B) is
                    // compared to *old* Layer (A) in this case anyways,
                    // which isn't right either. Also, Layer(A) also changed
                    // so it's identified as NEW.
                    //
                    // TODO: Together with the case below (NEW and DELETE)
                    // and the comment there, a possible solution could be to
                    // tackle the issue of updating widget paths/rootPaths
                    // etc. but for now this seems good enough and the
                    // performance hit of rebuilding these widgets seems
                    // OK as via selective use of HANDLE_CHANGED_AS_NEW
                    // it only happens when structure changes, while
                    // KeyMomentsController keeps working (seems like)
                    // with the updating treatment.
                    // It's also an inportant feature to not rebuild those
                    // KeyMomentController Widgets completely, as e.g. form
                    // fields will loose focus in that case.
                    if(this[HANDLE_CHANGED_AS_NEW]) {
                        // Treating CHANGED like DELETE + NEW is more resilient
                        newWidgets[i] = this._createWrapper(rootPath);
                    }
                    else {
                        const widgetWrapper = this._widgets[i];
                        newWidgets[i] = widgetWrapper;
                        deletedWidgets.delete(widgetWrapper);
                    }
                }
                else if(itemStatus === NEW || itemStatus === MOVED ) {
                    // Treating MOVED like NEW makes it easier to
                    // get the required changes applied, in fact, updating
                    // rootPath down the widget hierarchie is complicated
                    // and just replacing the widget instead of moving it
                    // and rewconnecting it (absolute dependency names)
                    // is much simpler. Otherwise, it would be closer
                    // to treat it similar to a CHANGED.
                    // See as well the description at ComponentWrapper._updateRootPath
                    //
                    newWidgets[i] = this._createWrapper(rootPath);
                }
            }

            // delete deletedWidgets
            for(const widgetWrapper of deletedWidgets) {
                if(widgetWrapper.id !== null)
                    this._idToWidget.delete(widgetWrapper.id);
                widgetWrapper.destroy();
            }
            this._widgets.splice(0, Infinity, ...newWidgets);

            for(const widgetWrapper of this._widgets) {
                // FIXME: is at least broken for KeyMomentController
                // (when using there HANDLE_CHANGED_AS_NEW). The
                // edited widget ends last in the list of widgets,
                // likely because of the clever use of StaticNode with
                // the localZoneElement and how reinsert doesn't cascade
                // down the widget hierarchy .
                const isActive = widgetWrapper.widget !== null;
                if(!isActive) {
                    // if new, initialize ..
                    this._createWidget(widgetWrapper);
                    requiresFullInitialUpdate.add(widgetWrapper);
                }
                else {
                    // Re-insert all elements of the old widgets into the DOM.
                    // This is experimental! However, ideally it creates the
                    // correct order
                    // I wonder if this destroys any event listeners or such, would probably
                    // be a subtle bug! a regular event handler surves "re-implantation"
                    widgetWrapper.reinsert();
                }
            }
            break;
        }
        return requiresFullInitialUpdate;
    }

    initialUpdate(rootState) {
        // FIXME: There's a problem as this.dependencies depends on
        // this.activeWidgets(), which is provided partly by running _provisionWidgets
        // and compareResult depends on this.dependencies
        // but maybe we just check all active/non-active widgets? or something else
        // StateComparison.createInitial with appropriate dependencies is
        // quicker but can be run without any dependencies as well.
        let compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        const requiresFullInitialUpdate = this._provisionWidgets(compareResult);
        if(requiresFullInitialUpdate.size)
            // otherwise compareResult is not updated at this point
            compareResult = StateComparison.createInitial(rootState, this.modelDependencies);
        this._update(compareResult, requiresFullInitialUpdate, true);
    }
}
