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
    // Optional API to call on ComponentWrapper.reinsert on it's widget
    // to pass the call along.
  , REINSERT_API = Symbol('REINSERT_API')
  ;

// base class for all UI elements
// mainly to describe general interfaces
export class _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_SIMPLE; // jshint ignore:line
    static REINSERT_API = REINSERT_API;
    get _domTool() {
        return this.widgetBus.domTool;
    }
    _insertElement(...args) {
        return this.widgetBus.insertElement(...args);
    }
    getEntry(...args) {
        try {
            return this.widgetBus.getEntry(...args);
        }
        catch (error) {
            error.message = `${error.message} in: ${this}`;
            throw error;
        }
    }
    getEntryRaw(...args) {
        return this.widgetBus.getEntryRaw(...args);
    }
    _changeState(fn) {
        return this.widgetBus.changeState(fn);
    }
    _getChangedMapFromCompareResult(compareResult, ...args) {
        // FIXME: maybe that call could be directly in widgetBus as:
        //     return this.widgetBus.getChangedMapFromCompareResult(compareResult, ...args);
        return this.widgetBus.wrapper.getChangedMapFromCompareResult(compareResult.isInitial, compareResult, ...args);
    }
    // This is a decorator, it returns a function that when called
    // wraps fn into a call to this.widgetBus.changeState,
    // applying the ...args to fn when executed.
    _changeStateHandler(fn) {
        return (...args)=>this._changeState(()=>fn(...args));
    }

    constructor(widgetBus) {
        this.widgetBus = widgetBus;
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
     *      // For covencience, widgetBus.insertElement keeps track
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
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.update! (with changedMap ${changedMap})`);
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
    constructor(protocolName, options={}) {
        const [passes, message] = _ProtocolHandler.checkProtocolName(protocolName);
        if(!passes)
            throw new Error(`VALUE ERROR ${message} in constructor ${this.name}`);
        Object.defineProperty(this, 'protocolName', {value: protocolName});
        Object.defineProperty(this, 'treatAdressAsRootPath', {
            value: options.treatAdressAsRootPath === false ? false : true});
    }
    toString() {
        return `[ProtocolHandler ${this.protocolName}]`;
    }
    register(identifier, value) {
        throw new Error(`NOT IMPLEMENTED: ${this}.register `
        + `called with identifier: ${identifier} value: ${value}`);
    }
    hasRegistered(identifier) {
        throw new Error(`NOT IMPLEMENTED: ${this}.hasRegistered `
        + `called with identifier: ${identifier}`);
    }
    getRegistered(identifier) {
        throw new Error(`NOT IMPLEMENTED: ${this}.getRegistered `
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

export class SimpleProtocolHandler extends _ProtocolHandler {
    constructor(protocolName, options={}) {
        super(protocolName, options);
        Object.defineProperty(this, 'notFoundFallbackValue', {
            value: ('notFoundFallbackValue' in options) ? options.notFoundFallbackValue : _NOTDEF});
        this._registeredValues = new Map();
        this._updatedLog = new Set();
    }

    getId(identifier) {
        // identifier.startsWith is truish, a function, if identifier it is a string
        return identifier.startsWith && identifier.startsWith(this.protocolName)
                ? identifier
                : `${this.protocolName}${identifier}`
                ;
    }

    register(identifier, component) {
        const id = this.getId(identifier);
        // console.log(`${this}.register: ${id}`);
        if(this._registeredValues.has(id))
            throw new Error(`VALUE ERROR identifier "${id}" already exists in ${this}.`);
        this._registeredValues.set(id, component);
        return this._unregister.bind(this, id);
    }

    /**
     * Don't call directly, use return value of register instead.
     */
    _unregister(identifier) {
        const id = this.getId(identifier);
        this._registeredValues.delete(id);
    }

    hasRegistered(identifier) {
        const id = this.getId(identifier);
        return this._registeredValues.has(id);
    }

    getRegistered(identifier) {
        const id = this.getId(identifier);
        if(!this._registeredValues.has(id)) {
            if(this.notFoundFallbackValue !== _NOTDEF)
                return this.notFoundFallbackValue;
            throw new Error(`KEY ERROR not found identifier "${id}" in ${this}: `
                    +`${Array.from(this._registeredValues.keys()).join(', ')}.`);
        }
        return  this._registeredValues.get(id);
    }

    resetUpdatedLog() {
        this._updatedLog.clear();
    }

    setUpdated(identifier) {
        const id = this.getId(identifier);
        this._updatedLog.add(id);
    }

    getUpdated(identifier) {
        const id = this.getId(identifier)
          , updated = this._updatedLog.has(id)
          , value = this.getRegistered(id)
          ;
        return [updated, value];
    }
}

export const DEFAULT = Symbol('DEFAULT');
class ComponentWrapper {
    // jshint ignore:start
    static DEPENDECIES_ALL = 'all';
    static DEPENDECIES_DEFAULT = 'default';
    // jshint ignore:end
    constructor(widgetBus, rawDependencyMapping
                , {
                      hostElement=null, rootPath=null, relativeRootPath=null
                    , activationTest=null , onInit=null, onDestroy=null
                    , id=null, protocolHandlers=[], ...restOptions
                  }
                , WidgetClass, ...widgetArgs) {
        this.WidgetClass = WidgetClass;
        this.host = hostElement;
        this._placemarker = null;
        this._activationTest = activationTest;
        this._onInitFn = onInit;
        this._onDestroyFn = onDestroy;
        this.id = id;

        if(protocolHandlers.length) {
            for(const [protocolHandler, ] of protocolHandlers) {
                // Keep normal paths separated from these special dependency keys.
                const [passes, message] = _ProtocolHandler.checkProtocolName(protocolHandler);
                if(!passes)
                    throw new Error(`VALUE ERROR ${message} `
                    + `in wrapper for ${this.WidgetClass.name} `
                    + `at rootPath: ${rootPath || widgetBus.rootPath}`);
            }
            // Previous (widgetBus) handlers are overridden by
            // the newer ones defined here
            // FIXME: it's not just rootPath that needs updating when
            //        rootPath changes... I'm not sure right now, however
            //        if this is entirely relevant, as the updated rootPath
            //        happens within the same level of widgets, i.e. a
            //        widget doesn't move in hierarchy
            this._protocolHandlers = new Map([
                  ...(widgetBus.protocolHandlers || [])
                , ...protocolHandlers
            ]);
        }
        else
            this._protocolHandlers = new Map(widgetBus.protocolHandlers);

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

        // console.log(`${this.constructor.name} ${this.WidgetClass.name} rawDependencyMapping`, ...rawDependencyMapping);

        Object.defineProperty(this, 'dependencies', {
            // get: ()=>new Set(this.dependencyMapping.keys())
            get() {
                throw new Error(`NOT IMPLEMENTED getter "dependencies" in [object ${this.constructor.name}]`);
            }
        });

        // initialized in updateRootPath
        Object.defineProperty(this, '_fullDependencyMappings', {
            get: ()=>{throw new Error(`LIFCYCLE ERROR _fullDependencyMappings is available after updateRootPath.`);}
          , configurable: true
        });

        this.dependencyReverseMapping = null; // _see updateRootPath;

        // FIXME/TODO: widgetBus should be renamed. It's more like the general
        // connection to the system, it could be simply called "bus" maybe
        // "widgetBus".
        this.widgetBus = Object.assign(
            Object.create(widgetBus) // inherit
          , {
                insertElement: this.insertElement.bind(this)
              , rootPath: null // see updateRootPath;
              , getEntryRaw: widgetBus.getEntry
              , getEntry (internalName) {
                    const externalName = this.getExternalName(internalName)
                        // These only work with string names, can't be path instances.
                      , protocolHandler = typeof externalName === 'string'
                                ? externalName.slice(0, externalName.indexOf('@') + 1)
                                : ''
                      ;
                    if(protocolHandler.length && this.protocolHandlers.has(protocolHandler)) {
                        const protocolHandlerImplementation = this.protocolHandlers.get(protocolHandler);
                        return protocolHandlerImplementation.getRegistered(externalName);
                    }
                    return widgetBus.getEntry(externalName);
                }
              , getExternalName: (internalName)=>{
                    if(this.dependencyReverseMapping.has(internalName))
                        return this.dependencyReverseMapping.get(internalName);
                    const path = internalName instanceof Path
                            ? internalName
                            : (typeof internalName === 'string' ? Path.fromString(internalName) : null)
                            ;
                    if(path !== null && path.isExplicitlyRelative)
                        return this.widgetBus.rootPath.append(...path.parts).toString();
                    return internalName;
                }
              , grandWidgetBus: widgetBus
              , wrapper: this
              , protocolHandlers: this._protocolHandlers
              , getProtocolHandlerRegistration: this.getProtocolHandlerRegistration.bind(this)
              , getProtocolHandlerImplementation: this.getProtocolHandlerImplementation.bind(this)
            });
        this._widgetArgs = widgetArgs;
        this.widget = null;
        this._unsetProtocolHandlerImplementation = new Map();

        // These are set to use the default, so when we call
        // this.updateRootPath(null, null) nothing will change.
        this._explicitAbsoluteRootPath = null;
        this._explicitRelativeRootPath = null;
        this.updateRootPath(rootPath, relativeRootPath);
    }

    toString() {
        return `[${this.constructor.name} for WidgetClass: ${this.WidgetClass.name}]`;
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

    getProtocolHandlerImplementation(protocolHandler, defaultVal=_NOTDEF) {
        if(!this._protocolHandlers.has(protocolHandler)) {
            if(defaultVal !== _NOTDEF)
                return defaultVal;
            throw new Error(`KEY ERROR protocolHandler "${protocolHandler}" not found for this ${this.WidgetClass.name}.`);
        }
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
                + ` has an empty entry, in ${this.constructor.name} at ${this.widgetBus.rootPath}.`);
            const entry = Array.isArray(entry_) ? entry_ : [entry_]
              , external = entry.at(0)
              , internal = entry.at(1) === undefined ? external : entry.at(1)
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
                const protocolHandlerImplementation = this._protocolHandlers.get(protocolHandler);

                // Implementation indicates if the value should be treated like a rootPath.
                if(protocolHandlerImplementation.treatAdressAsRootPath) {
                    // cases where external = "animationProperties@" or
                    // "animationProperties@." are expanded to
                    // "animationProperties@{this.widgetBus.rootPath}
                    // but if the path is not explicitly absolute, it
                    // will also be based on rootPath.
                    const address = external.slice(protocolHandler.length)
                      , path = Path.fromString(address)
                      , absoluteAdress = path.isExplicitlyAbsolute
                            ? Path.stringSanitize(address)
                            : this.widgetBus.rootPath.append(...path).toString()
                      ;
                    absoluteExternal = `${protocolHandler}${absoluteAdress}`;
                }
                // console.warn('${this}._absPathDependencies protocolHandler', protocolHandler
                //       // "internal" is often "animationProperties@" as a convention,
                //       // but, if it would instead be "animationProperties@" we can
                //       // use it as single word entry in the dependecies map
                //       // and treat it like "animationProperties@."
                //     , `internal`, internal
                //     , `external`, external
                //     , 'absoluteExternal', absoluteExternal, absoluteExternal===external);
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
                const path = Path.fromString(external);
                absoluteExternal = path.isExplicitlyAbsolute
                    ? path.toString()
                    : this.widgetBus.rootPath.append(...path).toString()
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
    updateRootPath(rootPathArgument=null, relativeRootPath=null) {
        if(rootPathArgument instanceof Path && rootPathArgument.isExplicitlyRelative) {
            if(relativeRootPath !== null)
                throw new Error(`VALUE ERROR when rootPathArgument `
                    + `("${rootPathArgument}") is relative,  relativeRootPath `
                    + `("${relativeRootPath}") must not be set`);
            // Was called like (relativePath) or (relativePath, null) and
            // is equivalent to call this method like (null, relativePath).
            // This is so we can use the settings like this: {rootPath: a_relative_path}
            relativeRootPath = rootPathArgument;
            rootPathArgument = null;
        }

        if(rootPathArgument === DEFAULT)
            this._explicitAbsoluteRootPath = null;
        else if(rootPathArgument !== null) {
            if(!(rootPathArgument instanceof Path))
                throw new Error(`VALUE ERROR rootPathArgument if set must be `
                 + `a Path but is ${typeof rootPathArgument} (${rootPathArgument}).`);
            if(!rootPathArgument.isExplicitlyAbsolute)
                throw new Error(`VALUE ERROR rootPathArgument if set must be `
                    + `explicitly absolutely anchored (start with "/") but is "${rootPathArgument}"`);
            this._explicitAbsoluteRootPath = rootPathArgument;
        }
        // else: it is null this means don't change this._explicitAbsoluteRootPath

        if(relativeRootPath === DEFAULT)
            this._explicitRelativeRootPath = null;
        else if(relativeRootPath !== null) {
            if(!(relativeRootPath instanceof Path))
                throw new Error(`VALUE ERROR relativeRootPath if set must be`
                 + `a Path but is ${typeof relativeRootPath} (${relativeRootPath}).`);
            if(relativeRootPath.isExplicitlyAbsolute)
                // The anchoring is not really important but it is a good practice
                // for semantics to not make it absolutely anchored.
                throw new Error(`VALUE ERROR relativeRootPath if set must not be`
                    + `explicitly absolutely anchored (start with "/") but is "${relativeRootPath}"`);
            this._explicitRelativeRootPath = relativeRootPath;
        }
        // else: it is null this means don't change this._explicitRelativeRootPath

        const absPath =  this._explicitAbsoluteRootPath === null
                ? this.widgetBus.grandWidgetBus.rootPath // DEFAULT
                : this._explicitAbsoluteRootPath
          , relPath = this._explicitRelativeRootPath === null
                ? [] // DEFAULT
                : this._explicitRelativeRootPath

          , rootPath = absPath.append(...relPath)
          ;

        // CAUTION: short out!
        // NOTE: ideally it should be possible to run the whole method
        // with the same result as dropping out here, however, it's
        // not happening so far, especially since the "MOVE" status is
        // purched from compareResult. It's also not simple if at all
        // possible to implement updating (after initial set) properly.
        if(this.widgetBus.rootPath !== null && this.widgetBus.rootPath.equals(rootPath)) {
            // console.log(`${this.constructor.name}.updateRootPath nothing changed ${rootPath}`);
            return;
        }
        //const oldRootPath = this.widgetBus.rootPath;
        this.widgetBus.rootPath = rootPath;
        // console.log(`${this.constructor.name}.updateRootPath(${rootPathArgument}, ${relativeRootPath}) [for ${this.WidgetClass.name}]`
        //           + `\n this._explicitAbsoluteRootPath ${this._explicitAbsoluteRootPath}`
        //           + `\n this._explicitRelativeRootPath ${this._explicitRelativeRootPath}`
        //           + `\nabsPath "${absPath}" + relPath "${relPath}"`
        //           + `\n => from ${oldRootPath}`
        //           + `\n => to ${this.widgetBus.rootPath}`
        // );

        const fullDependencyMappings = this._absPathDependencies(this._rawDependencyMapping);
        if(Object.getOwnPropertyDescriptor(this, '_fullDependencyMappings').configurable) {
            Object.defineProperty(this, '_fullDependencyMappings', {
                value: fullDependencyMappings
              , configurable: false
            });
        }
        else
            Object.assign(this._fullDependencyMappings, fullDependencyMappings);

        // this contans all of the dependencies
        this.dependencyReverseMapping = new Map([...this._fullDependencyMappings[this.constructor.DEPENDECIES_ALL]]
                        .map(([external, internal])=>[internal, external]));

        if(this.widget && this.widget.updateRootPath)
            // now update all the children ...
            // -> get the children
            // -> update the children
            this.widget.updateRootPath();
    }

    getRootPathSetup() {
        return [
            this._explicitAbsoluteRootPath
          , this._explicitRelativeRootPath
          , this.widgetBus.rootPath
        ];
    }

    getChangedMapFromCompareResult(isInitialUpdate, compareResult, toLocal=true) {
        const modelChangedMap = compareResult.getChangedMap(this.dependencyMapping, toLocal)
          , changedMap = new FreezableMap(modelChangedMap)
          ;
        // ... add protocol handlers dependencies ...
        // FIXME: if this has dependencies via protocolHandlers, changeMap should include it.
        for(const [protocolHandler, protocolHandlerImplementation] of this._protocolHandlers) {
            const dependenciesMap = this._fullDependencyMappings[protocolHandler] || new Map();
            // if(!Object.hasOwn(this._fullDependencyMappings, protocolHandler)){
            //     // FIXME: I'm not sure if this should be an error or just default to an empty Map
            //     // the current issue is with the protocolHandler called "cellContent@" for VideoproofArrayV2
            //     // console.warn(`KEY ERROR ${this.constructor.name}: dependenciesMap not found for `
            //     //    + `protocolHandler "${protocolHandler}" in ${this.WidgetClass.name}.`);
            //     // pass
            // }
            // else
            //     console.info(this.WidgetClass.name, 'protocolHandler', protocolHandler, 'dependenciesMap', dependenciesMap);
            for(const [rootPath, localPath] of dependenciesMap.entries()) {
                // FIXME: it's interesting, if this is initial, we must always include it
                let wasUpdated, value;
                if(isInitialUpdate) {
                    wasUpdated = true;
                    value = protocolHandlerImplementation.getRegistered(rootPath);
                }
                else
                    [wasUpdated, value] = protocolHandlerImplementation.getUpdated(rootPath);
                if(wasUpdated)
                    changedMap.set(toLocal ? localPath : rootPath, value);
            }
        }
        return Object.freeze(changedMap);
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
        if((this._placemarker || this.host) === null)
            throw new Error(`${this.constructor.name} no place to insert element for `
                 + `a ${this.WidgetClass.name} ${this.host === null ? 'host' : 'placemaker'} `
                 + `is not defined.`);
        this.constructor.insertElement(this.insertedElements, this._placemarker || this.host, element);
    }

    /**
     *  CAUTION use with care, some critique is in:
     *       _BaseDynamicCollectionContainerComponent._provisionWidgets
     *  and in:
     *       _BaseUIAxesMap._provisionWidgets and related code
     */
    reinsert(hostElement=null) {
        if(hostElement!==null)
            this.host = hostElement;

        const elements = this.insertedElements.splice(0, Infinity);
        for(const element of elements)
            this.insertElement(element);
        // Sometimes we got to pass this call along!
        // The widget might not insert itself elements, but maybe
        // it's child widgets .

        // Optional API, if implemented  called via widgetWrapper
        // used e.g. by UIDocumentNode
        if(this.widget[REINSERT_API])
            this.widget[REINSERT_API]();
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
        this.widget = new this.WidgetClass(this.widgetBus, ...this._widgetArgs);

        for(const [protocolHandler, data] of this._protocolHandlerRegistrations) {
            const protocolHandlerImplementation = this._protocolHandlers.get(protocolHandler);
            data.unregister = protocolHandlerImplementation.register(data.identifier, this.widget);
        }

        if(this._onInitFn)
            this._onInitFn(this.widget);

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

        for(const node of this.insertedElements)
            // not using node.remove(), because it may be an Element,
            // but it cold also be a textNode or a Comment etc. and
            // and only Element has the remove method.
            node.parentNode.removeChild(node);
        this.insertedElements.splice(0, Infinity);

        if(this._onDestroyFn)
            this._onDestroyFn(this.widget);
        this.widget = null;
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
    constructor(widgetBus, zones, widgets=[]) {
        super(widgetBus);
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

        this._childrenWidgetBus = Object.assign(
             Object.create(widgetBus) // don't copy, inherit ...
          , { getWidgetById: this.getWidgetById.bind(this) }
        );
        this._widgetsPlacemarker = new Map();
        this._initWidgets(widgets);
    }

    _initWrapper(childrenWidgetBus, settings, dependencyMappings, Constructor, ...args) {
        const hostElement = settings.zone
            ? this._zones.get(settings.zone)
            : null
            ;
        if(settings.zone && !hostElement) {
            throw new Error(`KEY ERROR target zone element "${settings.zone}" not `
                + `found, available zones are: ${[...this._zones].map(([k,v])=>k + ':' + typeof v).join(', ')}. `
                + `In ${this} for a ${Constructor.name}`);
        }
        const widgetWrapper = new ComponentWrapper(childrenWidgetBus, dependencyMappings
                                    , {hostElement, ...settings}
                                    , Constructor, ...args)
          ;
        return widgetWrapper;
    }

    /* supposed to run in constructor */
    _initWidgets(widgets) {
        for(const [settings, dependencyMappings, Constructor, ...args] of widgets) {
            const widgetWrapper = this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
            this._widgets.push(widgetWrapper);
        }
    }

    *widgets() {
        yield* this._widgets.entries();
    }

    // FIXME: I'm not sure if this makes sense like this.
    // At least, the way widgets are created defines also how their
    // rootPath is set up. This must be reflected in here.
    updateRootPath() {
        throw new Error(`NOT IMPLEMENTED: ${this}.updateRootPath`);
        // for(const widgetWrapper of this._widgets) {
        //     if(widgetWrapper.widgetBus.rootPath.parts.length > this.widgetBus.rootPath.parts.length)
        //     widgetWrapper.updateRootPath(this.widgetBus.rootPath);
        // }
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

    getWidgetWrapperById(id, defaultVal=_NOTDEF) {
        if(this._idToWidget.has(id))
            return this._idToWidget.get(id);
        else if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR id "${id}" not found in ${this}.`);
    }

    /**
     * CAUTION is null if widget is not fully initialized yet.
     */
    getWidgetById(id, defaultVal=_NOTDEF) {
        if(this._idToWidget.has(id))
            return this.getWidgetWrapperById(id).widget;
        else if(this.widgetBus.getWidgetById)
            return this.widgetBus.getWidgetById(id, defaultVal);
        else if(defaultVal !== _NOTDEF)
            return defaultVal;
        // Calling this recursiveley on this.widgetBus will escalate this
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
            else
                throw new Error(`UPDATE_STRATEGY unkown for ${widget}: `
                   + `${widget?.[UPDATE_STRATEGY]?.toString()} in ${this}`);
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
                const placemarker = this.widgetBus.domTool.createComment(`widget placeholder ${this}: ${widgetWrapper}`);
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

/**
 * Provision widgets dynamically.
 * This is optimized for the case where 'collection' is an _AbstractListModel
 * For _AbstractOrderedMapModel see _BaseDynamicMapContainerComponent
 */
export class _BaseDynamicCollectionContainerComponent extends _CommonContainerComponent {
    get dependencies() {
        const dependencies = super.dependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // CAUTION: Is this true? Yes it is! Should probably be the default
        // for all _BaseDynamicCollectionContainerComponent.
        for(const externalName of this.widgetBus.wrapper.dependencyReverseMapping.values())
            dependencies.add(externalName);
        return dependencies;
    }

    get modelDependencies() {
        const dependencies = super.modelDependencies;
        // required, otherwise with empty widgets, this won't receive updates.
        // CAUTION: Is this true? Yes it is! Should probably be the default
        // for all _BaseDynamicCollectionContainerComponent.
        for(const externalName of this.widgetBus.wrapper.dependencyMapping.keys())
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
          , itemsAbsPathStr = this.widgetBus.getExternalName('collection')
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
                data = new Map();
                for(const key of items.keys())
                    data.set(key, [NEW]);
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
                const rootPath = itemsPath.append(i);
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
                    // Circle is still querying its position as if it was
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
                    // It's also an important feature to not rebuild those
                    // KeyMomentController Widgets completely, as e.g. form
                    // fields will loose focus in that case.

                    // FIXME: I'm not completeley OK with this anymore!
                    // VideoproofArrayV2ActorRenderer uses caching internally
                    // and it would benefit if it wouldn't rebuild when e.g.
                    // just a text color in a key-moment changed. Also,
                    // it would benefit from the smart updating of its cells.
                    // so for that case, we should probably try to distinguish
                    // the case described above with more finesse.
                    //
                    // Now, we can update widgets rootPath. It's not
                    // enough for AnimationLiveProperties when they
                    // are registered with protocol handler though. The
                    // registration updating would require a handling where
                    // first all registrations are unregistered, then all
                    // new registrations are made, otherwise, it would become
                    // messy, i.e. a changed registration would override an
                    // existing registration, that existing one is changed
                    // later, then the unregister method would either unregister
                    // the new, ideally don't do anything. I'm not trying to
                    // make that update scenario work, instead, in that
                    // case, I'm going to use HANDLE_CHANGED_AS_NEW
                    // in ActorsMeta. It's removed however from
                    // ActiveActorsRenderingController.
                    if(this[HANDLE_CHANGED_AS_NEW]) {
                        // Treating CHANGED like DELETE + NEW is more resilient
                        newWidgets[i] = this._createWrapper(rootPath);
                    }
                    else {
                        // SO!
                        //     in here might be
                        // CHANGED /activeState/activeActors/0/instance/activeActors/0
                        // but then
                        // NEW     /activeState/activeActors/0/instance/activeActors/0/instance
                        // hides behind that and since we don't put another
                        // layer between this and the instance, we must check here if the
                        // instance is NEW!
                        //
                        // lokking at     [compare CHANGED]: /activeState/activeActors/0/instance/activeActors/0/actorTypeKey ;;
                        // would also help...
                        //
                        // we also strangely get
                        // [compare CHANGED]: /activeState/activeActors/0/instance/activeActors/0/instance ;;
                        //     [compare NEW]: /activeState/activeActors/0/instance/activeActors/0/instance ;;
                        // the first one should not be happening IMHO as NEW is stronger.
                        // Needs investigation as well.

                        // FIXME: it's interesting, the rootPath should
                        // not even be changed here! what was I thinking?
                        // Also, where is this method actually required?
                        // It is used initially in the wrapper to set it
                        // up, and for that it's .
                        const widgetWrapper = this._widgets[i]
                          , [ ,relativePath, ] = widgetWrapper.getRootPathSetup()
                          ;
                        let handleAsNew = false;
                        if(relativePath !== null) {
                            // is along that path from rootPath to relativePath
                            // anything that is marked as NEW?
                            let current = rootPath;
                            for(const part of relativePath) {
                                current = current.append(part);
                                const currentKey = current.toString();
                                if(compareMap.has(currentKey)
                                        && compareMap.get(currentKey).has(NEW)) {
                                    handleAsNew = true;
                                    break;
                                }
                            }
                        }
                        if(handleAsNew) {
                            // handle as new ...
                            newWidgets[i] = this._createWrapper(rootPath);
                        }
                        else {
                            // update ...
                            newWidgets[i] = widgetWrapper;
                            widgetWrapper.updateRootPath(rootPath);
                            deletedWidgets.delete(widgetWrapper);
                        }
                    }
                }
                else if(itemStatus === NEW || itemStatus === MOVED ) {
                    // Treating MOVED like NEW makes it easier to
                    // get the required changes applied, in fact, updating
                    // rootPath down the widget hierarchie is complicated
                    // and just replacing the widget instead of moving it
                    // and reconnecting it (absolute dependency names)
                    // is much simpler. Otherwise, it would be closer
                    // to treat it similar to a CHANGED.
                    // See as well the description at ComponentWrapper.updateRootPath
                    newWidgets[i] = this._createWrapper(rootPath);
                }
                else
                    throw new Error(`UNHANDLED CASE ${this} itemStatus: ${itemStatus.toString()} rootPath: ${rootPath}.`);

                if(!newWidgets[i])
                    throw new Error(`UNFULLFILLED CONTRACT ${this} wrapper was not produced ${itemStatus.toString()} rootPath: ${rootPath}.`);
            }
            // delete deletedWidgets
            for(const widgetWrapper of deletedWidgets)
                this._destroyWidget(widgetWrapper);

            this._widgets.splice(0, Infinity, ...newWidgets);

            // The thinking behind this flag is to find a simple, quick,
            // and dirty solution for many cases. There may be something
            // more complete for more cases that could be done.
            // The issue is described below: an <input> element in a subtree
            // that is re-inserted looses focus, that is really bad for
            // usability. But we don't need to re-insert if the order is
            // still in tact. The order is still in tact if no widget
            // was created that must appear before the already existing
            // elements. Hence, only after a new widget was inserted, new
            // widgets must be re-inserted.
            let requireReinsert = false;
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
                    requireReinsert = true
                }
                else if(requireReinsert) {
                    // Re-insert all elements of the old widgets into the DOM.
                    // This is experimental! However, ideally it creates the
                    // correct order
                    // I wonder if this destroys any event listeners or such, would probably
                    // be a subtle bug! a regular event handler surves "re-implantation"
                    //
                    // There's an actual bug: a focused element, e.g. an
                    // input element within the re-inserted subtree that
                    // is being changed, loses focus with this action.
                    // This means typing is disrupted!
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

/*
 * Provision widgets dynamically.
 * This is optimized for the case where 'collection' is an  _AbstractOrderedMapModel
 * For _AbstractListModel see _BaseDynamicCollectionContainerComponent.
 *
 *
 * CAUTION: for _AbstractOrderedMapModel _BaseUIAxesMap is a much more complete
 *          example which includes and supports e.g. drag and drop and re-ordering.
 * I need to collect more cases to make a more complete implementation.
 */
export class _BaseDynamicMapContainerComponent extends _BaseDynamicCollectionContainerComponent {
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
        this._keyToWidget = new Map();
    }
    // This completely overrides how _BaseContainerComponent _provisionWidgets,
    // but it could also be integrated and call super._provisionWidgets()
    // at some point, e.g. to check the activationTest which is in this case not
    // configured.
    _provisionWidgets(compareResult) {
        const {/*LIST_NEW_ORDER, MOVED,*/ EQUALS, NEW, CHANGED, DELETED} = StateComparison.COMPARE_STATUSES
          , basicStatuses = new Set([EQUALS, NEW, CHANGED, DELETED])
          , requiresFullInitialUpdate = new Set()
          , itemsAbsPathStr = this.widgetBus.getExternalName('collection')
          , itemsPath = Path.fromString(itemsAbsPathStr)
          , compareMap = compareResult.getDetaislMap()
          , resultsMap = compareMap.has(itemsAbsPathStr)
                ? compareMap.get(itemsAbsPathStr)
                : new Map()
          , itemChangeStatuses = new Map()
          , items = getEntry(compareResult.newState, itemsPath)
          , deletedCount = 0
          ;
        if(!resultsMap.size) {
            // If resultsMap is empty, we just don't change any widgets!
            return requiresFullInitialUpdate;
        }
        for(const [status/*, _payload*/] of resultsMap) {
            if(status === EQUALS)
                return requiresFullInitialUpdate;
            if(status === NEW /* and not empty */ ) {
                /* only happens when e.g. /activeState/activeActors is initally
                 * filled, so far only in the current development fixture,
                 * however, to have initially values should also be the case
                 * when loading state from serialization ...
                 * FIXME: StateComparison should maybe create this _payload
                 * when the state is NEW
                 */
                for(const key of items.keys())
                    itemChangeStatuses.set(key, NEW);
                break;
            }
            else if(status === CHANGED ) {
                // Extracting the compareMap entries for all direct children.
                for(const key of items.keys()) {
                    const itemPathAsString = itemsPath.append(key).toString();
                    if(compareMap.has(itemPathAsString)) {
                        const statuses = compareMap.get(itemPathAsString);
                        for(const [childStatus] of statuses.entries()) {
                            if(!basicStatuses.has(childStatus))
                                // If the child is a _AbstractListModel
                                // It would also produce e.g. a LIST_NEW_ORDER entry
                                continue;
                            if(childStatus === DELETED)
                                deletedCount += 1;
                            // The first "basic" status should be sufficient/all there is
                            itemChangeStatuses.set(key, childStatus);
                            break;
                        }
                        if(!itemChangeStatuses.has(key)) {
                            // This case is theoretical, e.g. when the
                            // implementation of the compareResult changes.
                            // Hence, this error is a sanity check.
                            //itemChangeStatuses.set(key, NEW);
                            throw new Error(`ASSERTION FAILED: missing basisc `
                                + `statuses don't know how to handle item at key "${key}" `
                                + `${statuses.map(([stat, ])=>stat.toString()).join(', ')}.`);
                        }
                    }
                }
                break;
            }
            else
               throw new Error(`UNKNOWN STATUS don't know how to handle ${status.toString()}.`);
        }
        if(itemChangeStatuses.size - deletedCount !== items.size)
            // A sanity check. If we pass we handle all items
            throw new Error(`ASSERTION FAILED: missmatch between items.size (${items.size}) `
                + `and itemChangeStatuses.size (${itemChangeStatuses.size}) - deletedCount `
                + `(${deletedCount}) (= ${itemChangeStatuses.size - deletedCount}).`);

        // The ones that remain in this will be decomissioned
        // i.e. delete is the default.
        const deletedWidgets = new Set(this._widgets);

        for(const [key, itemStatus] of itemChangeStatuses.entries()) {
            if(itemStatus === DELETED) {
                this._keyToWidget.delete(key);
                continue;
            }
            const rootPath = itemsPath.append(key);
            if(itemStatus === EQUALS) {
                // nothing to do
                const widgetWrapper = this._keyToWidget.get(key);
                deletedWidgets.delete(widgetWrapper);
            }
            // Updating CHANGED i.e. keeping the item, the update will
            // run via the update path.
            // This assumes that the rootPath of the item has not changed,
            // which is a case handled in _BaseDynamicCollectionContainerComponent
            // but in a OrderedMap that seems (?!) not to be required.
            else if(!this[HANDLE_CHANGED_AS_NEW] && itemStatus === CHANGED) {
                // nothing to do
                const widgetWrapper = this._keyToWidget.get(key);
                deletedWidgets.delete(widgetWrapper);
            }
            // HANDLE_CHANGED_AS_NEW if itemStatus === CHANGED
            else if(itemStatus === NEW || itemStatus === CHANGED) {
                // Treating CHANGED like DELETE + NEW is more resilient
                const widgetWrapper = this._createWrapper(rootPath);
                // The entry that is overridden here is already in
                // deletedWidgets, otherwise something is buggy.
                this._keyToWidget.set(key, widgetWrapper);
            }
            else
                throw new Error(`UNHANDLED CASE ${this} itemStatus: ${itemStatus.toString()} rootPath: ${rootPath}.`);

            if(!this._keyToWidget.has(key))
                throw new Error(`UNFULLFILLED CONTRACT ${this} wrapper was not produced ${itemStatus.toString()} rootPath: ${rootPath}.`);
        }
        // delete deletedWidgets
        for(const widgetWrapper of deletedWidgets)
            this._destroyWidget(widgetWrapper);

        // CAUTION: having them here in order does not mean they are
        // inserted in the right order, especially after changes.
        // _BaseUIAxesMap demonstrates a far more complete handling
        // of these issues.
        const orderedWidgets = Array.from(items.keys()).map(key=>this._keyToWidget.get(key))
         , oldOrderedWidgets = this._widgets.splice(0, Infinity, ...orderedWidgets)
         ;

        // NO reinsert: take over full management of the "zone"
        // i.e. bypass the insertElement API and manage it yourself

        // The thinking behind this flag is to find a simple, quick,
        // and dirty solution for many cases. There may be something
        // more complete for more cases that could be done.
        // The issue is described below: an <input> element in a subtree
        // that is re-inserted looses focus, that is really bad for
        // usability. But we don't need to re-insert if the order is
        // still in tact. The order is still in tact if no widget
        // was created that must appear before the already existing
        // elements. Hence, only after a new widget was inserted, new
        // widgets must be re-inserted.
        // Also, the order of widgets might have changed! The first
        // widget with a changed order index must be re-inserted and all
        // of the following.
        let requireReinsert = false
          , reorderStartIndex = 0
          , reorderReasons = new Set()
          ;
        for(const [i, widgetWrapper] of this._widgets.entries()) {
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
                if(!requireReinsert)
                    reorderStartIndex = i
                requireReinsert = true
                reorderReasons.add('new');
                continue;
            }

            // changed order detected
            if(!requireReinsert && oldOrderedWidgets[i] !== widgetWrapper) {
                reorderStartIndex = i;
                requireReinsert = true;
                reorderReasons.add('changed');
            }

            if(requireReinsert) {
                // Re-insert all elements of the old widgets into the DOM.
                // This is experimental! However, ideally it creates the
                // correct order
                // I wonder if this destroys any event listeners or such, would probably
                // be a subtle bug! a regular event handler surves "re-implantation"
                //
                // There's an actual bug: a focused element, e.g. an
                // input element within the re-inserted subtree that
                // is being changed, loses focus with this action.
                // This means typing is disrupted!
                widgetWrapper.reinsert();
            }
        }
        if(requireReinsert && this._reorderChildren)
            this._reorderChildren(reorderReasons, reorderStartIndex);
        return requiresFullInitialUpdate;
    }
}


// TODO:
// For quicker input of tags there's <datalist>, which can contain all
// known axis tags as <option>s. e.g. spec + google axis registry + maybe
// anything in loaded fonts. however, that datalist is linked to the
// input using the id-attribute and hence we need to manage it centrally.
//
// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/datalist
//
// The order of the datalist is used by the browser, so we can define
// more common tags at the top. Then, when typing the list is filtered.
// IMO a very good interface for rather little effort.
// <optgroup> is not available though.

export class UIBaseMapKey extends _BaseComponent {
    static BASE_CLASS = 'ui_base_map-key'
    constructor(widgetBus, eventHandlers, options={/*rootClass:null, inputAttributes:{}, labelContent: ''*/}) {
        super(widgetBus);
        [this.element, this._input] = this._initTemplate(eventHandlers, options);
        this.reset();
    }

    // jshint ignore: start
    static TEMPLATE = `<label
        ><!-- insert: label--><input
            type="text"
            minlength="1"
            /></label>`;
    // jshint ignore: end
    _initTemplate(eventHandlers, options) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , input = element.querySelector('input')
            , baseClasses = [this.constructor.BASE_CLASS]
            ;
        if(options.rootClass)
            baseClasses.push(options.rootClass)
        for(const baseClass of baseClasses) {
            element.classList.add(baseClass);
            input.classList.add(`${baseClass}-input`)
        }
        if(options.inputAttributes) {
            for(const [attr, value] of Object.entries(options.inputAttributes))
                input.setAttribute(attr, value);
        }
        for(const [event, fn, ...args] of eventHandlers)
            input.addEventListener(event, fn, ...args);
        if(options.labelContent)
            this._domTool.insertAtMarkerComment(element, 'insert: label', options.labelContent);
        this._insertElement(element);
        return [element, input];
    }

    isFocused() {
        return this._input === this._domTool.document.activeElement;
    }

    focus() {
        this._input.focus();
    }

    setCustomValidity(message="") {
        this._input.setCustomValidity(message);
        this._input.reportValidity();
    }

    reset() {
        this._input.value = '';
        this._input.setCustomValidity('');
    }

    get value() {
        return this._input.value;
    }

    set value(value) {
        this._input.value = value;
    }
}

export class _BaseUIButton extends _BaseComponent {
    static ROOT_CLASS = 'ui-button';
    /* required: static TYPE_CLASS_PART = 'ui-button';*/
    constructor(widgetBus, label, eventHandlers) {
        super(widgetBus);
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                }
        });
        [this.element, this._input] = this._initTemplate(label, eventHandlers);

    }
    // jshint ignore: start
    static TEMPLATE = `<button><!-- insert: label --></button>`;
    // jshint ignore: end

    _setClassesHelper(requireClasses) {
        for(const baseClass of [this.constructor.ROOT_CLASS, this.BASE_CLASS]) {
            for(const [element, ...classParts] of requireClasses)
                element.classList.add([baseClass, ...classParts].join('-'));
        }
    }

    _initTemplate(label, eventHandlers) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , input = element
            ;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);
        this._setClassesHelper([
            [element]
          , [input, 'input']
        ]);

        for(const [event, fn, ...args] of eventHandlers)
            input.addEventListener(event, fn, ...args);

        this._insertElement(element);
        return [element, input];
    }

    set passive(val) {
         this._input.disabled = !!val;
    }

    get passive() {
        return !!this._input.disabled;
    }
}

export class UIBaseMapKeyAddButton extends _BaseUIButton {
    static TYPE_CLASS_PART = 'add_button';
}

// for the classes/input setup

export class UIBaseMapKeyCreate extends UIBaseMapKey{};
// for the classes/input setup
export class UIBaseMapKeyChange extends UIBaseMapKey {
    constructor(widgetBus, eventHandlers, ...args) {
        super(widgetBus, eventHandlers, ...args);
        this._lastValue = null;
    }
    _initTemplate(eventHandlers, ...args) {
        const  [element, input] = super._initTemplate(eventHandlers, ...args);
        // When we lose focus we reveal the actual value, which ideally
        // is the same, but the editing value could be not accepted.
        input.addEventListener('blur', ()=>{
            if(this._lastValue !== null)
                this._input.value = this._lastValue;
            this._lastValue = null;
        });
        return  [element, input];
    }
    update(changedMap) {
        if(changedMap.has('key@')) {
            // key@.value is just a string
            // Don't update if we're currently editing! It will
            // change the cursor and be disturbing.
            if(!this.isFocused())
                this._input.value = changedMap.get('key@').value;
            // this way we can differentiate between the current value
            // of the input element and the offical last key/tag, which
            // will be usefult to decide whether to keep the element around.
            this._lastValue = changedMap.get('key@').value;
        }
    }
}

function _setClassesHelperMethod(requireClasses) {
    const baseClasses =  [...this.constructor.BASE_CLASSES, this.constructor.ROOT_CLASS]
    if(this.constructor.ROOT_CLASS !== this.BASE_CLASS && this.BASE_CLASS)
        baseClasses.push(this.BASE_CLASS);
    for(const baseClass of baseClasses) {
        for(const [element, ...classParts] of requireClasses)
            element.classList.add([baseClass, ...classParts].join('-'));
    }
}
/**
 * Interesting this may be the first real dictionary editing that
 * includes an interface and rules to change the keys.
 *
 * Editing a key while keeping the widget will be the
 * most challenging aspect.
 *
 * I'm not sure if a widget should be like a key/value pair, where
 * both inputs are located, or rather if this widget should manage
 * all the keys, so that direct central control and rules are possible.
 *
 * Changing a key will technically be like changing a [key, value] slot,
 * keeping the position and keeping the value.
 *     index = axesLocationValuesMap.indexOfKey(key)
 *     value = axesLocationValuesMap.get(key)
 *     axesLocationValuesMap.splice(index, 1, [newKey, value]);
 * Key Validation will be added to _AbstractOrderedMapModel
 * whether the key is valid relative to e.g. the location of the instance
 * can't be done there, but formal rules, like: not empty, same format
 * as axisTags is possible.
 */
export class _UIBaseMap extends _BaseDynamicCollectionContainerComponent {
    // jshint ignore: start
    static ROOT_CLASS = `ui_base_map`;
    static BASE_CLASSES = [];
    static UIKeyCreate = UIBaseMapKeyCreate;
    static UIKeyChange = UIBaseMapKeyChange;
    static UIKeyAddButton = UIBaseMapKeyAddButton;
    static KEY_ADD_BUTTON_LABEL = 'add item';
    // Don't do anyting.
    static VISUAL_ORDER_STRATEGY_NATURAL = Symbol('VISUAL_ORDER_STRATEGY_NATURAL');
    // Display alphabetic order
    static VISUAL_ORDER_STRATEGY_ALPHA = Symbol('VISUAL_ORDER_STRATEGY_ALPHA');
    // jshint ignore: end

    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }
    static get VISUAL_ORDER_STRATEGY() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static VISUAL_ORDER_STRATEGY`);
    }
    static get KEY_DATA_TRANSFER_TYPE() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static KEY_DATA_TRANSFER_TYPE`);
    }

    // This is to drag the map itself, if it is null, dragging of the map is turned off.
    static ITEM_DATA_TRANSFER_TYPE = null;

    _createWrapperValue(keyId, key) {
        throw new Error(`NOT IMPLEMENTED ${this}._createWrapperValue (for keyId: "${keyId}" key: "${key}").`);
    }

    get _initialWidgets() {
        throw new Error(`NOT IMPLEMENTED ${this} get _initialWidgets.`);
    }

    constructor(widgetBus, _zones, eventHandlers, label=null, dragEntries=false) {
        const labelElement = label && widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label)
          , dragHandleElement = widgetBus.domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, '✥')
            // , deleteButton ??? maybe we can just use the trash/drag-and-drop for the top level items
            // How to add the new tag? drag and drop? plus "+" button to appen (I like this,
            // it can blur when tag is invalid!
          , toolsElement = widgetBus.domTool.createElement('div', {'class':'tools'})
          , childrensMainZoneElement = widgetBus.domTool.createElement('ol')
          , localZoneElement = widgetBus.domTool.createElement('div', {'tabindex':'0'}
              , [
                    dragHandleElement
                  , ...(label ? [labelElement] : [])
                  , toolsElement
                  , childrensMainZoneElement
                ]
            )
          , zones = new Map([..._zones, ['local', localZoneElement], ['tools', toolsElement], ['main', childrensMainZoneElement]])
          ;

        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create('key@', {treatAdressAsRootPath: false}));
        super(widgetBus, zones);

        const isDraggable = this.constructor.ITEM_DATA_TRANSFER_TYPE !== null;
        if(!isDraggable)
            dragHandleElement.remove();
        // CAUTION/FIXME: when the model has an internal ordering it's not correct
        //        to turn off all dragAndDrop:
        //          * drag to trash to delete should work
        //          * drop to copy/move from a foreign target should work
        //          * drag and drop to re-order should not work
        // In fact controlling drag and drop may require fine grained settings.
        // E.g. in the case above, only same-source-drops should be denied.
        //      but also, same source drop doesn't do any harm if it is on,
        //      it just should not mislead the user by displaying a drop-target indicator.
        const orderStrategy = dragEntries
                  // Can't allow anything else, as it doesn't make much
                  // sense in this case, where the order is determined
                  // by dragAndDrop UI.
                  // NOTE ALSO: despite of dragAndDrop being true or not
                  // the _AbstractOrderedMap can (and does sometimes)
                  // define an internal ordering method. In that case
                  // drag and drop ordering doesn't make much sense and
                  // visual ordering in here does not change the actual
                  // data order.
                ? _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL
                : this.constructor.VISUAL_ORDER_STRATEGY || _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL
                ;
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
              , VISUAL_ORDER_STRATEGY: {
                    value: orderStrategy
                }
                // Adds drag-handles and event-handlers to the key-value
                // items. This is not about handling of drops.
              , DRAG_ENTRIES: {
                    value: !!dragEntries
                }
        });

        this._setClassesHelper([
                [localZoneElement]
              , ...(label ? [[labelElement, 'label']] : [])
              , ...(isDraggable ? [[dragHandleElement, 'drag_handle']] : [])
              , [toolsElement, 'tools']
              , [childrensMainZoneElement, 'items']
        ]);

        if(isDraggable) {
            for(const args of [
                        ['dragstart', this._dragstartHandler.bind(this)]
                      , ['dragend', this._dragendHandler.bind(this)]
                    ]) {
                dragHandleElement.addEventListener(...args);
            }
        }
        for(const args of eventHandlers)
            localZoneElement.addEventListener(...args);

        const wrapChildrenContainerHandler = fn=>{
            return event=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('childrenOrderedMap'))
                  , collection = this.getEntry(rootPath)
                  ;
                if(collection.size !== 0)
                    // only if empty
                    return;
                const dropTargetItem = {rootPath, isEmptyLayerContainer: true};
                return fn.call(this, dropTargetItem, event);
            }
        }
        for(const args of [
                    ['dragenter', wrapChildrenContainerHandler(this._dragenterHandler)]
                  , ['dragover', wrapChildrenContainerHandler(this._dragoverHandler)]
                  , ['dragleave', this._dragleaveHandler.bind(this)]
                  , ['drop', wrapChildrenContainerHandler(this._dropHandler)]
                ]) {
            childrensMainZoneElement.addEventListener(...args);
        }

        this.widgetBus.insertElement(localZoneElement);
        this.element = localZoneElement;
        this._locationSetWidgets = new Map();
        this._keySlots = [];
        this._postponedKeyIdOrder = null;
        {
            const widgets = this._initialWidgets;
            this._initialWidgetsAmount = widgets.length;
            this._initWidgets(widgets);
        }
        this._removeDragIndicatorTimeoutId = null;
    }

    get _initialWidgets() {
        // By overwriting this getter, a sub-class can extend initialWidgets
        // within the constructor `super(...)` and fully use the `this` keyword.
        const widgets = [
            [
                {   zone: 'tools'
                  , id: 'key-create-input'
                }
              , []
              , this.constructor.UIKeyCreate
              , [
                    ['input', this._keyCreateInputHandler.bind(this)]
                  , ['keyup', event=>{if (event.key === 'Enter') {this._keyCreateSubmitHandler(event)}}]
                ]
            ]
          , [
                {   zone: 'tools'
                  , id: 'key-add-button'
                }
              , []
              , this.constructor.UIKeyAddButton
              , this.constructor.KEY_ADD_BUTTON_LABEL
              , [
                    ['click', this._keyCreateSubmitHandler.bind(this)]
                ]
            ]
        ];
        return widgets;
    }

    _createWrapperKey(keyId, index) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                zone: keyId
            }
          , dependencyMappings = [[keyId, 'key@']]
          , Constructor = this.constructor.UIKeyChange
          , eventHandlers = [
                    ['input', this._keyChangeHandler.bind(this, index)]
                  , ['blur', this._keyBlurHandler.bind(this, index)]
            ]
          , args = [eventHandlers]
          ;
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    _dragstartHandler(event) {
        if(this.constructor.ITEM_DATA_TRANSFER_TYPE === null)
            throw new Error(`MISCONFIGURATION attempting to drag ${this} but ITEM_DATA_TRANSFER_TYPE is not configured.`);
        const path = this.widgetBus.rootPath.parent; // use parent to remove "./instance"
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."

        event.dataTransfer.setData(this.constructor.ITEM_DATA_TRANSFER_TYPE, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${this.constructor.ITEM_DATA_TRANSFER_TYPE}: ${path}]`);
        this.element.classList.add('dragging');

        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(this.element, 0 , 0);
    }
    _dragendHandler(/*event*/) {
        this.element.classList.remove('dragging');
    }

    _validateKeyString(key) {
        if(typeof key !== 'string')
        return [false, `Key must be string but is typeof ${typeof key}.`];
        if(key.length < 1)
            return [false, `Key must be at least 1 char long but key.length is ${key.length}. Tag: "${key}".`];
        return [true, null];
    }

    #REDIRECT_LAST_KEY = Symbol('REDIRECT_LAST_KEY');
    async _keyChangeHandler(index, event) {
        event.preventDefault();
        const key = event.target.value.trim()
          , [valid, message] = this._validateKeyString(key)
          , inputWidget = this._keySlots[index].widgetWrapper.widget
          ;
        if(!valid) {
            // FIXME TODO: show message to the user
            // also, make sure it disappears on blur
            inputWidget.setCustomValidity(message);
            return;
        }
        // valid
        return await this._changeState(()=>{
            const childrenOrderedMap = this.getEntry('childrenOrderedMap');
            if(childrenOrderedMap.has(key)) {
                inputWidget.setCustomValidity(`Key "${key}" already exists.`);
                return;
            }
            // Do we know the old key? if the childrenOrderedMap is re-ordering
            // itself, we want to redirect the change to the original key!
            // i.e. the input has only the mandate to change the key it is
            // originally representing. And, it should also survive while
            // the key is changing in that case thr ui-element may not
            // display the right information in order to not disrupt the
            // typing/input focus.
            if(childrenOrderedMap.constructor.ORDERING !== null) {
                // may require redirection (not on the first change though)
                // we detect the first edit if the key at index is the same
                // as the original key of the inputWidget
                if(inputWidget.isFocused()) {
                    const oldTargetKey = inputWidget[this.#REDIRECT_LAST_KEY];
                    if(oldTargetKey !== undefined) {
                        const targetIndex = childrenOrderedMap.indexOfKey(oldTargetKey);
                        if(targetIndex === -1) {
                            inputWidget.setCustomValidity(`Lost (moving) target redirection "${oldTargetKey}" no longer found.`);
                            // maybe we should rather directly remove focus
                            return;
                        }
                        index = targetIndex;
                    }
                    inputWidget[this.#REDIRECT_LAST_KEY] = key;
                }
            }
            inputWidget.setCustomValidity('');
            const value = childrenOrderedMap.getIndex(index);
            childrenOrderedMap.arraySplice(index, 1, [key, value]);
        });
    }

    _keyBlurHandler(index/*, event*/) {
        const {keyId, widgetWrapper} = this._keySlots[index]
          , inputWidget = widgetWrapper.widget
          , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , key = keyProtocolHandler.getRegistered(keyId).value
          ;
        delete inputWidget[this.#REDIRECT_LAST_KEY];
        if(this._postponedKeyIdOrder !== null) {
            this._reorderContainers(this._postponedKeyIdOrder);
            this._postponedKeyIdOrder = null;
        }
        // Restore if we missed something (though I think the issue that
        // made this necessary is fixed).
        inputWidget.value = key;
    }

    _keyDragstartHandler(rootPath, keyId, event) {
        const element = this._zones.get(keyId);
        element.classList.add('dragging');

        const keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , key = keyProtocolHandler.getRegistered(keyId).value
          , path = rootPath.append(key)
          ;
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        event.dataTransfer.setData(this.constructor.KEY_DATA_TRANSFER_TYPE, `${path}`);
        event.dataTransfer.setData('text/plain', `[TypeRoof ${this.constructor.KEY_DATA_TRANSFER_TYPE}: ${path}]`);
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(element, 0 , 0);
    }

    _keyDragendHandler(keyId/*, event*/) {
        const element = this._zones.get(keyId);
        if(element)
            element.classList.remove('dragging');
    }

    *_alphaOrderingGenerator (itemsGen) {
        const entries = new Map();
        for(const [index, [key, data]] of itemsGen)
            entries.set(key, [index, data]);
        const keys = Array.from(entries.keys())
            .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
        for(const key of keys) {
            const [index, data] = entries.get(key);
            yield [index , [key, data]];
        }
    }

    _reorderContainers(keyIdOrder) {
        const mainZoneElement = this._zones.get('main')
          , mainZoneOrder = mainZoneElement.children
          ;
        for(const [index, keyId] of keyIdOrder.entries()) {
            const container = this._zones.get(keyId);
            if(mainZoneOrder[index] !== container) {
                // Re-insert from index to end.
                const newOrder = keyIdOrder.slice(index).map(keyId=>this._zones.get(keyId));
                mainZoneElement.append(...newOrder);
                break;
            }
        }
    }

    update(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('key@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper.getProtocolHandlerImplementation('key@').resetUpdatedLog();
        super.initialUpdate(...args);
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [this.constructor.KEY_DATA_TRANSFER_TYPE];
        for(const type of applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    _getDropTargetInsertPosition(dropTargetItem, event) {
        if(dropTargetItem.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = dropTargetItem.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          , childrensMainZoneElement = this._zones.get('main')
          ;
        for(const elem of childrensMainZoneElement.querySelectorAll(`:scope > .${markedClass}`)) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for(const name of [...elem.classList]) {
                if(name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if(insertPosition === null)
            return;

        if(!['before', 'after', 'insert'].includes(insertPosition))
            throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            // return;

        const [elem, posClassSuffix] = [element, insertPosition];
        //insertPosition === 'before' && element.previousSibling
        //        ? [element.previousSibling, 'after']
        //        : [element, insertPosition]
        //        ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dragoverHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === this.constructor.KEY_DATA_TRANSFER_TYPE
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === this.constructor.KEY_DATA_TRANSFER_TYPE
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const {setTimeout} = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);
        const {rootPath: targetRootPath} = dropTargetItem
          , insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event)
          ;
        let targetPath = targetRootPath;
        if(insertPosition !== 'insert') {
            const keyId = dropTargetItem.keyId
              , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
              , key = keyProtocolHandler.getRegistered(keyId).value
              ;
            targetPath = targetRootPath.append(key);
        }
        if(type === this.constructor.KEY_DATA_TRANSFER_TYPE) {
            const sourcePathString = event.dataTransfer.getData(this.constructor.KEY_DATA_TRANSFER_TYPE)
              , sourcePath = Path.fromString(sourcePathString)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else { //  if(type === DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE) {
            console.error(`NOT IMPLEMENTED ${this}_dropHandler for type "${type}"`);
            // const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.AXESMATH_ITEM_CREATE);
            // return this._create(typeKey, targetPath, insertPosition);
        }
    }

    // Version to move between instances of _AbstracrOrderedMap.
    _move(sourcePath, targetPath, insertPosition) {
        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const targetParent = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              , sourceEntry = [sourceKey, source]
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                targetParent.push(sourceEntry);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , [targetIndex] = targetParent.keyToIndex(targetKey)
              , [sourceIndex] = sourceParent.keyToIndex(sourceKey)
              ;

            if(targetParent === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                targetParent.arraySplice(insertIndex, 0, sourceEntry);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                targetParent.arraySplice(targetIndex + 1, 0, sourceEntry);
            else if(insertPosition === 'before')
                targetParent.arraySplice(targetIndex, 0, sourceEntry);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _keyCreateInputHandler(/*event*/) { // on input
        // if key is invalid: set key-add-button passive else set active
        // TODO: also tap into the validation state of the field
        // passive
        const addButton = this.getWidgetById('key-add-button')
          , inputWidget = this.getWidgetById('key-create-input')
          , key = inputWidget.value.trim()
          , [valid, message] = this._validateKeyString(key)
          ;
        if(!valid) {
            addButton.passive = true;
            inputWidget.setCustomValidity(message);
            return;
        }
        const childrenOrderedMap = this.getEntry('childrenOrderedMap');
        if(childrenOrderedMap.has(key)) {
            addButton.passive = true;
            // set validation to false
            inputWidget.setCustomValidity(`Key "${key}" already exists.`);
            return;
        }
        // set  validation to good...
        addButton.passive = false;
        inputWidget.setCustomValidity("");
    }

    async _keyCreateSubmitHandler(event) {
        event.preventDefault();
        const addButton = this.getWidgetById('key-add-button')
          , inputWidget = this.getWidgetById('key-create-input')
          , key = inputWidget.value.trim()
          , [valid, message] = this._validateKeyString(key)
          ;
        if(!valid) {
            addButton.passive = true;
            inputWidget.setCustomValidity(message);
            return;
        }
        return await this._changeState(()=>{
            const childrenOrderedMap = this.getEntry('childrenOrderedMap');
            if(childrenOrderedMap.has(key)) {
                inputWidget.setCustomValidity(`Key "${key}" already exists.`);
                return;
            }
            const value = this._createKeyValue
                  // Extent for more complex cases.
                ? this._createKeyValue(childrenOrderedMap)
                  // simple cases
                : childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
                ;
            childrenOrderedMap.push([key, value]);
            inputWidget.reset();
            this._onItemCreated(key);
        });
    }

    // If implemented called within a _changeState transaction,
    // with the new key as argument:
    // this._onItemCreated(key)
    _onItemCreated(/*key*/){};

    _provisionWidgets() {
        // FIXME only do this if order changed or if items got added/deleted!

        // Run _BaseContainerComponent._provisionWidgets this for the
        // initial/reguluar widgets. NOTE: _BaseDynamicCollectionContainerComponent
        // does not inherit from _BaseContainerComponent, thus we can't call
        // super. But the implementation is OK.
        //
        // We have the deleted widgetWrappers in this._locationSetWidgets as well.
        this._widgets.splice(this._initialWidgetsAmount || 0, Infinity);
        const requiresFullInitialUpdate = _BaseContainerComponent.prototype._provisionWidgets.call(this)
          , currentWidgets = []
          , childrenOrderedMap = this.getEntry('childrenOrderedMap')
          , keyProtocolHandler = this.widgetBus.wrapper.getProtocolHandlerImplementation('key@')
          , rootPath = Path.fromString(this.widgetBus.getExternalName('childrenOrderedMap'))
          ;
        // we can delete all items that are more than the existing ones
        // key-inputs will change their key the key at their index changes
        // value inputs will have to be rebuild when key-index or key changes,
        // as their "slot"/zone depends on the index and their value depends
        // on the key. we may find a way to update the zone/zlot however...
        // widgetWrapper.host = newHost;
        // widgetWrapper.reinsert();

        // delete values
        for(const key of this._locationSetWidgets.keys()) {
            if(childrenOrderedMap.has(key))
                continue;
            // delete
            const widgetWrapper = this._locationSetWidgets.get(key);
            this._destroyWidget(widgetWrapper);
            this._locationSetWidgets.delete(key);
        }
        // delete keys
        for( const {keyId, widgetWrapper, unregister} of
                this._keySlots.splice(childrenOrderedMap.size, Infinity)) {
            unregister();
            this._zones.get(keyId).remove();
            this._zones.delete(keyId);
            this._destroyWidget(widgetWrapper);
        }

        const gen = this.VISUAL_ORDER_STRATEGY === this.constructor.VISUAL_ORDER_STRATEGY_ALPHA
                  // FIXME: this is basically broken, as the list is not
                  // reorderd when the key is renamed e.g. to start with
                  // a new character that would have another position.
                ? this._alphaOrderingGenerator(childrenOrderedMap.indexedEntries())
                : childrenOrderedMap.indexedEntries()
                ;
        const keyIdOrder = [];
        for(const [index, [key, /*axesLocationSet*/]] of gen) {
            // keys
            const keyId = keyProtocolHandler.getId(index);
            keyIdOrder.push(keyId);
            if(!keyProtocolHandler.hasRegistered(keyId)) {
                const keyComponent = {value: null}
                  , unregister = keyProtocolHandler.register(keyId, keyComponent)
                  , container = this._domTool.createElement('li')
                  , requireClasses = [
                        [container, 'item']
                    ]
                  ;
                const dropTargetItem = {rootPath, keyId, key}
                  , dropHandlers = [
                        ['dragenter', this._dragenterHandler.bind(this, dropTargetItem)]
                      , ['dragover', this._dragoverHandler.bind(this, dropTargetItem)]
                      , ['dragleave', this._dragleaveHandler.bind(this)]
                      , ['drop', this._dropHandler.bind(this, dropTargetItem)]
                    ]
                  ;
                for(const args of dropHandlers)
                    container.addEventListener(...args);

                let dragHandleElement = null;
                if(this.DRAG_ENTRIES) {
                    dragHandleElement = this._domTool.createElement('span', {'class':'drag_handle', draggable: 'true'}, '✥');
                    const dragHandlers = [
                                ['dragstart', this._keyDragstartHandler.bind(this, rootPath, keyId)]
                              , ['dragend', this._keyDragendHandler.bind(this, keyId)]
                            ];
                    for(const args of dragHandlers)
                        dragHandleElement.addEventListener(...args);
                    requireClasses.push([dragHandleElement, 'item', 'drag_handle']);
                }
                this._setClassesHelper(requireClasses);
                this._zones.set(keyId, container);
                this._zones.get('main').append(container);
                const widgetWrapper = this._createWrapperKey(keyId, index);
                currentWidgets.push(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);

                this._createWidget(widgetWrapper);
                if(dragHandleElement)
                    container.append(dragHandleElement);

                this._keySlots[index] = {keyId, widgetWrapper, unregister};
            }
            else {
                const {widgetWrapper} = this._keySlots[index];
                currentWidgets.push(widgetWrapper);
            }

            const keyComponent = keyProtocolHandler.getRegistered(keyId);
            if(keyComponent.value !== key) {
                // Keys have chaged order, now, the host of the value is different.
                keyComponent.value = key;
                keyProtocolHandler.setUpdated(keyId);
            }
            // values
            {
                // We can get away with keeping "value "widgets around
                // even if the order changed, as they are still keyed
                // the same and thus the paths stay valid.
                //
                // But, when order changed, the container/host has changed as well
                let widgetWrapper;
                if(this._locationSetWidgets.has(key)) {
                    // keeper
                    widgetWrapper = this._locationSetWidgets.get(key);
                    // change host (not alway required)
                    const host = this._zones.get(keyId);
                    // FIXME: we may require a world where in this case
                    // widgetWrapper.host is not set at all. Or maybe,
                    // where changing widgetWrapper.host also reinserts
                    // the children. But, it is complicated now.
                    if(widgetWrapper.host !== host) {
                        // CAUTION this would interfere if a placemarker
                        // was used as target!
                        widgetWrapper.reinsert(host);
                    }
                }
                else {
                    // create new, insert
                    widgetWrapper = this._createWrapperValue(keyId, key);
                    this._createWidget(widgetWrapper);
                    this._locationSetWidgets.set(key, widgetWrapper);
                    requiresFullInitialUpdate.add(widgetWrapper);
                }
                currentWidgets.push(widgetWrapper);
            }
        }
        {
            // Container order depends on the order produced by the generator.
            // If the order has changed, the containers in main need to be
            // reordered as well.
            this._postponedKeyIdOrder = null;
            const mainZoneElement = this._zones.get('main')
              , mainZoneOrder = [...mainZoneElement.children]
              ;
            let requireReorder = false;
            for(const [index, keyId] of keyIdOrder.entries()) {
                const container = this._zones.get(keyId);
                if(mainZoneOrder[index] !== container) {
                     requireReorder = true;
                     break;
                }
            }

            // FIXME: I'm not sure this is ever the case.
            if(requireReorder) {
                // CAUTION if e.g. a key is being edited, this should be
                // postponed, until the key loses focus. A key being
                // edited changes alphabetic ordering, then the user
                // loses input focus and is rightfuly anonoyed. Hence this
                // is the most/only interesting case currently.
                for(const {widgetWrapper} of this._keySlots) {
                    if(widgetWrapper.widget.isFocused()) {
                        // !=> postponed
                        this._postponedKeyIdOrder = keyIdOrder;
                        break
                    }
                }
                if(this._postponedKeyIdOrder === null) {
                    // Not postponed, do it now.
                    this._reorderContainers(keyIdOrder);
                }
            }
        }
        this._widgets.push(...currentWidgets);
        return requiresFullInitialUpdate;
    }
}
_UIBaseMap.prototype._setClassesHelper = _setClassesHelperMethod;

export class _DialogBase {
    constructor(domTool) {
        this._domTool = domTool;
        this._resolvers = null;
    }

    toString() {
        return `[Dialog ${this.constructor.name}]`;
    }

    _initTemplate() {
        const dialog = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        dialog.addEventListener("close", () => {
            this._resolve(dialog.returnValue);
        });
        this._domTool.document.body.append(dialog);
        return [dialog];
    }

    async show() {
        if(this._resolvers)
            throw new Error(`Dialog is already waiting for input.`);
        return new Promise((resolve, reject)=>{
            this._resolvers = {resolve, reject};
        });
    }

    _resolve(value) {
        if(!this._resolvers)
            throw new Error(`Dialog is not active.`);
        const resolve = this._resolvers.resolve;
        this._resolvers = null;
        resolve(value);
    }

    _reject(reason) {
        if(!this._resolvers)
            throw new Error(`Dialog is not active.`);
        const reject = this._resolvers.reject;
        this._resolvers = null;
        reject(reason);
    }

    destroy() {
        if(this._resolvers)
            this._reject('Dialog destroyed.');
        this.element.remove();
    }
}

export class _UIAbstractPlainInputWrapper extends _BaseComponent {
    static createClass(className, PlainInput) {
        // jshint unused: vars
        const result = {[className]: class extends this {
            // jshint ignore: start
            static PlainInput = PlainInput;
            // jshint ignore: end
        }};
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(widgetBus, ...wrappedArgs) {
        super(widgetBus);
        const changeHandler = this._changeStateHandler(
            value=>this.getEntry('value').set(value));
        this._ui = new this.constructor.PlainInput(this._domTool, changeHandler, ...wrappedArgs);
        this._insertElement(this._ui.element);
    }

    update(changedMap) {
        if(changedMap.has('value'))
            this._ui.update(changedMap.get('value').value);
    }

    set passive(val) {
         this._ui.passive = !!val;
    }

    get passive() {
        return this._ui.passive;
    }

    setDisplay(show) {
        this._ui.setDisplay(show);
    }
}


export const DRAGHANDLE_TEMPLATE = '<span class="drag_handle" draggable="true">✥</span>';
function _dragstartHandlerMethod(event) {
    const path = this.widgetBus.rootPath;
    // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
    //      "It is important to set the data in the right order, from most-specific to least-specific."
    event.dataTransfer.setData(this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH, `${path}`);
    event.dataTransfer.setData('text/plain', `[TypeRoof ${this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH}: ${path}]`);
    this.element.classList.add('dragging');
    // MDN: During the drag operation, drag effects may be modified to
    // indicate that certain effects are allowed at certain locations.
    // 'copy', 'move', 'link'
    // changing the dropEffect is interesting depending on the drag target
    // and maybe also when a modifier get's pressed/released!
    //
    // Allow to copy, link or to move the element.
    // The UI could be changed to clearly indicate the kind of action
    // it creates, but often it also depends on the target.
    event.dataTransfer.effectAllowed = 'all';
    event.dataTransfer.setDragImage(this.element, 0 , 0);

    // lose focus, otherwise it will jump to the next element after
    // the successful drop.
    if(this.element.matches(':focus-within'))
        this._domTool.document.activeElement.blur();
}

function _dragendHandlerMethod(/*event*/) {
    this.element.classList.remove('dragging');
}

function _createDragHandleMethod() {
    const dragHandleElement = this._domTool.createFragmentFromHTML(this.constructor.DRAGHANDLE_TEMPLATE).firstElementChild;
    for(const args of [
                    ['dragstart', this._dragstartHandler.bind(this)]
                  , ['dragend', this._dragendHandler.bind(this)]
            ]) {
        dragHandleElement.addEventListener(...args);
        this._setClassesHelper([
            [dragHandleElement, 'drag_handle']
        ]);
    }
    return dragHandleElement;
}

class _UIBaseListItem extends _BaseComponent {
    static ROOT_CLASS = `ui_base_list_simple_item`;
    static BASE_CLASSES = ['ui_base_list_item'];

    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }

    static get ITEM_DATA_TRANSFER_TYPE_PATH() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static ITEM_DATA_TRANSFER_TYPE_PATH`);
    }
    static TEMPLATE = `<div
        tabindex="0"
        ><!-- insert: drag-handle -->
        <output>(UNINITIALIZED)</output></div>`;
    static DRAGHANDLE_TEMPLATE = DRAGHANDLE_TEMPLATE;

    /* The use case for this was to additionally require 'sourceMap'.
     * No need to mention 'value'
     *
     * I.e. in the sub-class definition:
     *      static additionalDependencies = ['sourceMap'];
     * For this to work, the parent _UIBaseList (in this example UICompositeStylePatch)
     * got an additional dependencyDefintion of ['./stylePatchesSource', 'sourceMap']
     *
     * Also the format ['external', 'internal']
     * is allowed. If it's just a single item/ a string it will be expanded
     * to internal = external = single-item.
     * "external" will be resolved with: this.widgetBus.getExternalName(external)
     * in the parent. i.e. if not found, it will be used directly as the
     * external name. However, in this constellation, it seems smarter to
     * define a model dependency name via the parent as internal name
     * _UIBaseList dependencies, as that is not hard coded.
     */
    static additionalDependencies = [];

    constructor(widgetBus, eventHandlers=[], draggable=false) {
        super(widgetBus);

        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
        });

        Object.assign(this, this._initTemplate());
        this._setClassesHelper([
                [this.element]
        ]);
        this._dragHandle = this._initDragHandle(draggable);
        for(const args of eventHandlers)
            this.element.addEventListener(...args);
    }

    _initTemplate() {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , output = element.querySelector('output')
          ;
        this._setClassesHelper([
                [output, 'output']
        ]);
        this._insertElement(element);
        return {element, _output: output};
    }

    // this applies only to the value, not tho the key/value entry
    _initDragHandle(draggable) {
        if(!draggable)
            return null;
        const dragHandleElement = this._createDragHandle();
        this._domTool.insertAtMarkerComment(this.element, 'insert: drag-handle', dragHandleElement);
        return dragHandleElement
    }

    /*
     * This is more an example as a serious implementation
     * see UIAxesMathLocationValue for a real and more complex case.
     */
    update(changedMap) {
        if(changedMap.has('value')) {
            const value = changedMap.get('value');
            this._output.textContent = value.value;
        }
    }
}
_UIBaseListItem.prototype._setClassesHelper = _setClassesHelperMethod;
_UIBaseListItem.prototype._dragstartHandler = _dragstartHandlerMethod;
_UIBaseListItem.prototype._dragendHandler = _dragendHandlerMethod;
_UIBaseListItem.prototype._createDragHandle = _createDragHandleMethod;

export class _UIBaseListContainerItem extends _BaseContainerComponent {
    static ROOT_CLASS = `ui_base_list_container_item`;
    static BASE_CLASSES = ['ui_base_list_item'];// it's also a ui_base_list_item
    // FIXME: this could become a standard for all _BaseContainerComponent
    // and be injected automatically, but we'd need a concept how to override
    // the default zones map when it has to be modified. That override
    // should not be more complicated than the status quo. So, in general,
    // it stays better explicit than implicit.
    static REQUIRE_ZONES_ARGUMENT = true;
    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }

    static get ITEM_DATA_TRANSFER_TYPE_PATH() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static ITEM_DATA_TRANSFER_TYPE_PATH`);
    }
    static DRAGHANDLE_TEMPLATE = DRAGHANDLE_TEMPLATE;

    // see comment in _UIBaseListItem
    static additionalDependencies = [];

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false) {
        const localZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);
        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
        });

        this.element = localZoneElement;
        this._insertElement(this.element);
        this._setClassesHelper([
            [this.element]
        ]);
        if(draggable) {
            const dragHandleElement = this._createDragHandle();
            this.element.append(dragHandleElement);
        }
        for(const args of eventHandlers)
            this.element.addEventListener(...args);
    }
}
_UIBaseListContainerItem.prototype._setClassesHelper = _setClassesHelperMethod;
_UIBaseListContainerItem.prototype._dragstartHandler = _dragstartHandlerMethod;
_UIBaseListContainerItem.prototype._dragendHandler = _dragendHandlerMethod;
_UIBaseListContainerItem.prototype._createDragHandle = _createDragHandleMethod;


const DROP_INSERT_DIRECTION_VERTICAL = Symbol('DROP_INSERT_DIRECTION_VERTICAL')
  , DROP_INSERT_DIRECTION_HORIZONTAL = Symbol('DROP_INSERT_DIRECTION_HORIZONTAL')
  ;
export class _UIBaseList extends _BaseDynamicCollectionContainerComponent {
    static ROOT_CLASS = `ui_base_list`;
    static BASE_CLASSES = [];
    static UIItem = _UIBaseListItem;

    static DROP_INSERT_DIRECTION_VERTICAL = DROP_INSERT_DIRECTION_VERTICAL;
    static DROP_INSERT_DIRECTION_HORIZONTAL = DROP_INSERT_DIRECTION_HORIZONTAL;
    DROP_INSERT_DIRECTION = DROP_INSERT_DIRECTION_VERTICAL;

    static get TYPE_CLASS_PART() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static TYPE_CLASS_PART`);
    }

    // This becomes interesting:
    //  in UIAxesMathLocationValues we have PATH and create
    //  and these are used for move/create operations.
    // but in the UI for CompositeStylePatch we won't have a
    // CREATE Type, rather a move from the StylePatches Map UI
    // that will then create a new "link" (StylePatchKeysModel) item.
    static get ITEM_DATA_TRANSFER_TYPE_PATH() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static ITEM_DATA_TRANSFER_TYPE_PATH`);
    }

    static get ITEM_DATA_TRANSFER_TYPE_CREATE() {
        throw new Error(`NOT IMPLEMENTED ${this.name} static KEY_DATA_TRANSFER_TYPE`);
    }

    constructor(widgetBus, _zones, childrenMainZone = 'local') {
         const localZoneElement = widgetBus.domTool.createElement('div')
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);

        // Could be the same as localZoneElement but could also be different.
        // In the simplest case it is the same.
        this._childrenMainZone = childrenMainZone;
        this._childrensMainZoneElement = this._zones.get(childrenMainZone);

        Object.defineProperties(this,{
                BASE_CLASS: {
                    value: this.constructor.TYPE_CLASS_PART
                            ? `${this.constructor.ROOT_CLASS}_${this.constructor.TYPE_CLASS_PART}`
                            : this.constructor.ROOT_CLASS
                }
        });
        this._setClassesHelper([
            [localZoneElement]
        ]);

        const wrapChildrenContainerHandler = fn=>{
            return event=>{
                const rootPath = Path.fromString(this.widgetBus.getExternalName('collection'))
                  , collection = this.getEntry(rootPath)
                  ;
                if(collection.size !== 0)
                    // only if empty
                    return;
                const dropTargetItem = {rootPath, isEmptyLayerContainer: true};
                return fn.call(this, dropTargetItem, event);
            }
        }
        for(const args of [
                    ['dragenter', wrapChildrenContainerHandler(this._dragenterHandler)]
                  , ['dragover', wrapChildrenContainerHandler(this._dragoverHandler)]
                  , ['dragleave', this._dragleaveHandler.bind(this)]
                  , ['drop', wrapChildrenContainerHandler(this._dropHandler)]
                ]) {
            this._childrensMainZoneElement.addEventListener(...args);
        }

        this._insertElement(localZoneElement);
        this.element = localZoneElement;
        this._removeDragIndicatorTimeoutId = null;
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH
                              , this.constructor.ITEM_DATA_TRANSFER_TYPE_CREATE];
        for(const type of applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    [DROP_INSERT_DIRECTION_HORIZONTAL](dropTargetItem, event) {
        if(dropTargetItem.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {width, left} = event.currentTarget.getBoundingClientRect()
          , {clientX} = event
          , elementX = clientX - left
          , relativeX = elementX/width
          , testPosition = dropTargetItem.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeX < testPosition ? 'before' : 'after';
    }

    // Vertical version, otherwise just like the horizontal implementation.
    [DROP_INSERT_DIRECTION_VERTICAL](dropTargetItem, event) {
        if(dropTargetItem.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = dropTargetItem.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _getDropTargetInsertPosition(dropTargetItem, event) {
        return this[this.DROP_INSERT_DIRECTION](dropTargetItem, event)
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null) {
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of [this._childrensMainZoneElement, ...this._childrensMainZoneElement.querySelectorAll(`:scope > .${markedClass}`)]) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for(const name of [...elem.classList]) {
                if(name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if(insertPosition === null)
            return;

        if(!['before', 'after', 'insert'].includes(insertPosition))
            throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            // return;

        const [elem, posClassSuffix] = [element, insertPosition];
        //insertPosition === 'before' && element.previousSibling
        //        ? [element.previousSibling, 'after']
        //        : [element, insertPosition]
        //        ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    _dragoverHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!

        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH
                ? 'move'
                : 'copy' // this.constructor.ITEM_DATA_TRANSFER_TYPE_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH
                ? 'move'
                : 'copy' // this.constructor.ITEM_DATA_TRANSFER_TYPE_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const {setTimeout} = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(dropTargetItem, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);

        const data = event.dataTransfer.getData(type)
          , {rootPath: targetPath} = dropTargetItem
          , insertPosition = this._getDropTargetInsertPosition(dropTargetItem, event)
          ;
        if(type === this.constructor.ITEM_DATA_TRANSFER_TYPE_PATH) {
            const sourcePathString = data
              , sourcePath = Path.fromString(sourcePathString)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === this.constructor.ITEM_DATA_TRANSFER_TYPE_CREATE) {
            const value = data
            this._create(targetPath, insertPosition, value);
        }
        else {
            console.error(`NOT IMPLEMENTED ${this}._dropHandler type: "${type}"`);
        }
    }

    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus
          , settings = {
                rootPath
              , zone: this._childrenMainZone
            }
          , dependencyMappings = [
                ['./', 'value']
            ]
          , Constructor = this.constructor.UIItem
          , draggable = true
          , dropTargetItem = {rootPath}
          , dropEventHandlers = [
                ['dragenter', this._dragenterHandler.bind(this, dropTargetItem)]
              , ['dragover', this._dragoverHandler.bind(this, dropTargetItem)]
              , ['dragleave', this._dragleaveHandler.bind(this)]
              , ['drop', this._dropHandler.bind(this, dropTargetItem)]
            ]
          , args = [
                ...(this.constructor.UIItem.REQUIRE_ZONES_ARGUMENT
                        ? [this._zones]
                        : [])
               , dropEventHandlers, draggable]
          ;

        for(const entry_ of this.constructor.UIItem.additionalDependencies) {
            if(entry_ === undefined)
                throw new Error(`VALUE ERROR additionalDependencies  has an empty entry `
                    `in ${this} UIItem.additionalDependencies`);
            const entry = Array.isArray(entry_) ? entry_.slice() : [entry_]
              , external = entry.at(0)
              , internal = entry.at(1) === undefined ? external : entry.at(1)
              ;
            dependencyMappings.push([this.widgetBus.getExternalName(external), internal]);
        }
        return this._initWrapper(childWidgetBus, settings, dependencyMappings, Constructor, ...args);
    }

    // TODO: this is a very good reusable method, so reuse!
    _move(sourcePath, targetPath, insertPosition) {
        const canMove = !sourcePath.isRootOf(targetPath);
        if(!canMove) {
            console.warn(`${this}._move can't move source into target as `
                    +`source path "${sourcePath}" is root of target path "${targetPath}".`);
            return;
        }
        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                items.push(source);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;

            if(items === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                items.splice(insertIndex, 0, source);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                items.splice(targetIndex + 1, 0, source);
            else if(insertPosition === 'before')
                items.splice(targetIndex, 0, source);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _createNewItem(targetPath, insertPosition, items, value) {
        throw new Error(`NOT IMPLEMENTED ${this}._createNewItem (for `
            `targetPath: "${targetPath}", `
            `insertPosition: "${insertPosition}", `
            `value: "${value}"; with items ${items}).`);
    }

    _create(targetPath, insertPosition, value) {
        return this._changeState(()=>{
            const items = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // items
              , newItem = this._createNewItem(targetPath, insertPosition, items, value)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                items.push(newItem);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              ;
            let insertIndex;
            if(insertPosition === 'after')
                insertIndex = targetIndex + 1;
            else if(insertPosition === 'before')
                insertIndex = targetIndex;
            else
                throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            items.splice(insertIndex, 0, newItem);
        });
    }
}
_UIBaseList.prototype._setClassesHelper = _setClassesHelperMethod;

// Maybe, this should be implemented using a _BaseContainerComponent
// It also needs a toggle, to set value to empty or to not empty
// and even when value is empty, we may want to animate value still.
// So, there's an extra switch ...
export class _UIAbstractPlainOrEmptyInputWrapper extends _BaseComponent {
    static createClass(className, PlainOrEmptyInput) {
        // jshint unused: vars
        const result = {[className]: class extends this {
            // jshint ignore: start
            static PlainOrEmptyInput = PlainOrEmptyInput;
            // jshint ignore: end
        }};
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(widgetBus, getDefault, requireUpdateDefaults, ...wrappedArgs /*e.g. label*/) {
        super(widgetBus);
        this._getDefault = getDefault || null;
        this._requireUpdateDefaults = requireUpdateDefaults || (()=>false);

         const valueChangeHandler = this._changeStateHandler(
                            value=>this.getEntry('value').set(value))
          , toggleChangeHandler = this._changeStateHandler(()=>{
                const valueOrEmpty = this.getEntry('value');
                if(valueOrEmpty.isEmpty)
                    valueOrEmpty.set(this._getDefault
                                ? this._getDefault()
                                : undefined
                    ); // toggle to explicit
                else
                    valueOrEmpty.clear(); // clear
            })
          ;

        this._ui = new this.constructor.PlainOrEmptyInput(this._domTool
                , valueChangeHandler
                , toggleChangeHandler
                , ...wrappedArgs);

        this._insertElement(this._ui.element);
    }

    update(changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('value') || requireUpdateDefaults) {
            const valueOrEmpty = changedMap.has('value')
                    ? changedMap.get('value')
                    : this.getEntry('value')
                    ;

            let active, value;
            if(!valueOrEmpty.isEmpty) {
                active = true;
                value = valueOrEmpty.value;
            }
            else {
                active = false;
                value = this._getDefault
                            ? this._getDefault()
                            : undefined
                            ;
            }
            this._ui.update(active, value);
        }
    }
}
