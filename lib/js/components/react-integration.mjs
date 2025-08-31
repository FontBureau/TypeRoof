
import {
    StateComparison
} from '../metamodel.mjs';
import {
    _BaseComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE
} from './basics.mjs';

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

export class ReactRoot extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE;
    _listenerId = 0;
    _listeners = new Map();
    constructor(widgetBus, ReactComponent, props) {
        super(widgetBus);
        this._ReactComponent = ReactComponent;
        this._props = props;
        this.element = this._domTool.createElement('div', {'class': 'ui_react_root'});
        this._insertElement(this.element);
        this._reactRoot = createRoot(this.element);
    }

    _addListener(listener, fullDependencyMappings) {
        // FIXME: it's interesting, in the regular component system the
        // mapping of dependencies is done by the ComponentWrapper system
        // e.g. _absPathDependencies and then getChangedMapFromCompareResult
        // via this._fullDependencyMappings and since we are getting raw
        // dependencies here, basically mounted in this.widgetBus.wrapper,
        // we need to take over that functionality in here...

        // CAUTION: fullDependencyMappings must be updated when
        // this.widgetBus.wrapper.updateRootPath is called.
        // FIXME: maybe we can make sure that is only called on
        // initialization, it seems risky already to change the rootPath
        // when in action, here it would break.

        // FIXME: I think it would be probably be more streamlined into
        // the existing system to just create a new ComponentWrapper for
        // each listener. It's similar to dynamic component creation
        // in _provisionWidgets and we would benefit from having to
        // take care of only one implementation still.
        const id = this._listenerId++;
        // Store the listener and its dependencies (paths and aliases).
        this._listeners.set(id, { listener, fullDependencyMappings });
        return [() => this._removeListener(id)];
    }

    getInitialEntries(rawDependencyMappings) {
        const fullDependencyMappings = this.widgetBus.wrapper.constructor.absPathDependencies(
                                  this.widgetBus.rootPath
                                , this.widgetBus.protocolHandlers
                                , rawDependencyMappings)
          , rootState = this.getEntry('/')
            // these should somehow be collected by the parent...
            // these modelDependencies are always only used for initial
            // update. After, fullDependencyMappings are used. It's interesting
            // how this works and there may be a potential to make the
            // implementation more elegant.
          , modelDependencies = fullDependencyMappings[this.widgetBus.wrapper.constructor.DEPENDECIES_ALL]// .keys()
          , compareResult = StateComparison.createInitial(rootState, modelDependencies)
          , initialChangedMap = this.widgetBus.wrapper.constructor.getChangedMapFromCompareResult(
                                  fullDependencyMappings
                                , this.widgetBus.protocolHandlers
                                , true, compareResult, true/* toLocal */)
          ;

        return [initialChangedMap, (listener)=>this._addListener(listener, fullDependencyMappings)];
    }

    _removeListener(id) {
        if (!this._listeners.has(id)) return;
        this._listeners.delete(id);
    }



    initialUpdate(/*rootState*/) {
        // FIXME: I don't think initialUpdate is required at all
        // in this case. I guess everything could be moved into
        // super and this method  is then just empty. There could also
        // be a way to inform the parent that it is not required to call
        // this.
        // If one interface, update, is enough, this could have implications
        // for the existing components system. As it lloks like a simplification.
        //
        // modelDependencies ???
        // this._reactRoot.render(<App widgetBus={widgetBusInstance} />);
        // const compareResult = StateComparison.createInitial(rootState, this.modelDependencies)
        const widgetBus = Object.assign(
                    Object.create(this.widgetBus) // inherit
                  , {
                        getInitialEntries: this.getInitialEntries.bind(this)
                    }
                )
          ;
        this._reactRoot.render(React.createElement(this._ReactComponent, {widgetBus, ...this._props}, null));
        // this.update(compareResult);
        // I believe now, that we have to call an initial update somwhere
        // here, maybe rather in addListener, as there's otherwise no way
        // to prime the component.
        // This function, however, is the intialUpdate of this component
        // not of any react component... but with this._reactRoot.render
        // in here we will trigger the addListener calls.
        // FIXME: would be nice to pass rootState directly
    }

    // notifyListeners ...
    update(compareResult) {
        for (const { listener, fullDependencyMappings } of this._listeners.values()) {
            // Create a map of changed paths to their new values,
            // filtered and aliased for this listener.
            const changedMapForListener = this.widgetBus.wrapper.constructor.getChangedMapFromCompareResult(
                                  fullDependencyMappings
                                , this.widgetBus.protocolHandlers
                                , false, compareResult, true/* toLocal */);
            if (changedMapForListener.size)
                listener(changedMapForListener);
        }
    }
}

// Custom hook that subscribes a component to a specific set of paths in the model.
export function useMetamodel(widgetBus, dependencies) {
    // for an initial state, if required, we could here read entries
    // from widgetBus using dependencies, and then do:
    //      useState(Object.fromEntries(intialchangedMap))
    const [initialChangedMap, addListener]  = widgetBus.getInitialEntries(dependencies);

    // Set up the effect to subscribe and unsubscribe from the State.
    useEffect(() => {
        const listener = (changedMap) => {
                setEntries(prevEntries=>Object.assign({}, prevEntries, Object.fromEntries(changedMap)));
            }
            // Pass the full dependencies array to the bus and
            // return the cleanup function for useEffect.
        const [removeListener] = addListener(listener);// removeListener
        return removeListener;
    }, [widgetBus, dependencies]);

    const [entries, setEntries] = useState(Object.fromEntries(initialChangedMap));
    return entries;
};
