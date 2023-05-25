/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import DOMTool from '../domTool.mjs';

import {
    Path
//  , COMPARE_STATUSES
  , StateComparison
  // , ForeignKey
  // , getEntry
  // , unwrapPotentialWriteProxy
} from '../metamodel.mjs';


 // To mark the update strategy of the widget
export const UPDATE_STRATEGY_SIMPLE = Symbol('UPDATE_SIMPLE')
    // Maybe requires a renaming, but it means the update strategy
    // that receives "compareResult" as argumnet (not changeMap)
  , UPDATE_STRATEGY_COMPARE = Symbol('UPDATE_COMPARE')
    // this is where the widget stores the UPDATE_STRATEGY_{***} marker
  , UPDATE_STRATEGY = Symbol('UPDATE_STRATEGY')
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
    // This is a decorator, it return a function that when called
    // wraps fn into a call to this.parentAPI.withChangeState,
    // applying the ...args to fn when executed.
    _changeStateHandler(fn) {
        return (...args)=>this._changeState(()=>fn(...args));
    }

    constructor(parentAPI) {
        this.parentAPI = parentAPI;
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


class ComponentWrapper {
    constructor(parentAPI, rawDependencyMapping
                , {hostElement=null, rootPath=null, activationTest=null, id=null}
                , WidgetClass, ...widgetArgs) {
        this.WidgetClass = WidgetClass;
        this.host = hostElement;
        this._placemarker = null;
        this._activationTest = activationTest;
        this.id = id;
        // store inserted elements, to be removable again
        this.insertedElements = [];
        this._rawDependencyMapping = rawDependencyMapping;

        Object.defineProperty(this, 'dependencies', {
            // get: ()=>new Set(this.dependencyMapping.keys())
            get(){
                throw new Error(`NOT IMPLEMENTED getter "dependencies" in [object ${this.constructor.name}]`);
            }
        });

        this.dependencyMapping = null; // see _updateRootPath;
        this.dependencyReverseMapping = null; // _see updateRootPath;
        this.parentAPI = Object.assign(
            Object.create(parentAPI) // inherit
          , {
                insertElement: this.insertElement.bind(this)
              , rootPath: null // see _updateRootPath;
              , getEntryRaw: parentAPI.getEntry
              , getEntry: (internalName)=>{
                  const externalName = this.dependencyReverseMapping.has(internalName)
                        ? this.dependencyReverseMapping.get(internalName)
                        : internalName
                        ;
                  return parentAPI.getEntry(externalName);
                }
              , grandParentAPI: parentAPI
              , wrapper: this
            });
        this._updateRootPath(rootPath || parentAPI.rootPath);
        this._widgetArgs = widgetArgs;
        this.widget = null;
    }

    _absPathDependencies(dependencyMappings) {
        let result = new Map();
        // For convenience, we can skip one part of a one to one mapping:
        //      entry = 'hello' =>   'hello': 'hello'
        //      entry = ['hello'] => 'hello': 'hello'
        //      entry = ['hello', 'world'] => 'hello': 'world'
        for(const entry_ of dependencyMappings) {
            const entry = Array.isArray(entry_) ? entry_ : [entry_]
              , external = entry.at(0)
              , internal = entry.at(-1) === undefined ? external : entry.at(-1)
              ;
                // without actually knowing the model structure, the save
                // way to do this is to remove single dot path parts and
                // reduce consecutive slashes into single slashes.
                // Double dots are be handled as well, e.g.:
                //      '/hello/beautiful/../world' => '/hello/world'
                // This is just simple path arithmetic, e.g. not following
                // links, which are implemented in the model. Links would
                // have to be resolved first in place, before applying
                // removal of path parts via "..".
            const absoluteExternal = external.startsWith('/')
                    ? Path.stringSanitize(external)
                    : this.parentAPI.rootPath.append(external).toString()
                    ;
            result.set(absoluteExternal, internal);
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
        this.dependencyMapping = this._absPathDependencies(this._rawDependencyMapping);
        this.dependencyReverseMapping = new Map([...this.dependencyMapping]
                        .map(([external, internal])=>[internal, external]));
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
        return this.widget;
    }
    destroy() {
        if(this.widget)
            this.widget.destroy();
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

export class _BaseContainerComponent extends _BaseComponent {
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
            for(const path of widgetWrapper.dependencyMapping.keys())
                dependencies.add(path);
            // if(widgetWrapper.WidgetClass.name === 'KeyMomentsController'){
            //     console.log('KeyMomentsController widgetWrapper:', widgetWrapper);
            //     console.log('KeyMomentsController widgetWrapper.dependencyMapping.keys():', ...[...widgetWrapper.dependencyMapping].map(([k,v])=>`${k}:${v}`));
            // }
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
        const compareResult = StateComparison.createInitial(rootState, this.dependencies);

        this._update(compareResult, requiresFullInitialUpdate, true);
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
                const  _compareResult = (!isInitialUpdate && requiresFullInitialUpdate)
                        ? StateComparison.createInitial(compareResult.newState, widgetWrapper.dependencyMapping)
                        : compareResult
                    // This means just that the widget expects a changeLocaldMap
                    // not a more complex structure, but more complex structures will
                    // likely be required at some point.
                  , changeLocaldMap = _compareResult.getChangedMap(widgetWrapper.dependencyMapping, true)
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
            else {
                console.log('widgetWrapper.widget', widget);
                throw new Error(`UPDATE_STRATEGY unkown for ${widget}: ${widget[UPDATE_STRATEGY].toString()}`);
            }
        }
    }
}
