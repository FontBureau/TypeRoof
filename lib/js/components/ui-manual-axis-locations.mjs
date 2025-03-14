/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    _BaseComponent
} from './basics.mjs';

import {
    PlainNumberAndRangeOrEmptyInput
} from './generic.mjs';

import {
    CoherenceFunction
  , NumberModel
  , BooleanModel
  , _AbstractOrderedMapModel
  , _AbstractStructModel
} from '../metamodel.mjs';

import {
    GENERIC
  , SPECIFIC
  , ProcessedPropertiesSystemMap
} from './registered-properties-definitions.mjs';

const AxesLocationsModel = _AbstractOrderedMapModel.createClass('AxesLocationsModel', NumberModel)
  , manualAxesLocationsModelMixin = [
        // requires
        // , [REQUIRES, 'font', 'fontSize'] <= removed from metamodel!
        // requires means: I don't know where it comes from but I need its
        // value and I need to get informed when it changes.
        // however, the value of this may or may not change subsequently.
        //
        // the counterpart to "requires" would be "provides", obiously
        // provides should be directed only at children. It could be,
        // however, maybe a rewrite,
        // Thinking about this as of the mantra right now. font would be
        // defined above, and just become part of the "scope" of this.
        // layers inbetween could rewrite the scope for their children.
        // provides could, while walking down the tree, be used to update
        // the active scope. It's a bit like css cascade. If a parent "provides"
        // it set's it to scope.
        // could be provided via a sibling maybe, rerouting ...
        // however, when sibling changes anywhere, everything that requires
        // must get updated.
        //
        // In a away, doing the order of evaluation in Mantra style is the
        // same as a topological order of a dependency tree. That way it
        // may even be simpler to implement! At least until a better image
        // evolves, doing it manually could be ideal.
        //
        // Also, try to do it immutable.
        CoherenceFunction.create([/*'font', 'fontSize',*/ 'autoOPSZ', 'axesLocations'],
        function sanitizeAxes({/*font, fontSize,*/ autoOPSZ, axesLocations}) {

            if(autoOPSZ.value === undefined)
                autoOPSZ.value = true;

            // NOT sure with this UI handels this...
            // BUT it's incoherent to have autoOPSZ checked and opsz not.
            // Specifically for the KeyMoments animation, it's simpler to
            // enforce this here, than to have the UI take care in each
            // case. Especially, the calculation of the animation properties
            // works in this case nicely without having to consider the
            // value of autoOPSZ.
            // NOTE: in one example fontSize is a NumberModel, in the other
            // example the NumberModel is wrapped into _AbstractSimpleOrEmptyModel
            // isEmpty is undefined in NumberModel, hence this works here
            // as undefined is falsy, but it's very implicit.
            //
            // It is, however, more complicated than this! In animation,
            // there's an implicit, calculated, value for fontSize, which
            // would be empty in here, still, the opsz value should be
            // set to that value.
            // const hasFontSizeValue = !fontSize.isEmpty;
            // if(autoOPSZ.value === true && hasFontSizeValue) {
            //     // Only works if fontSize has the same type as axesLocations.Model
            //     // so far NumberModel but these things can change!
            //     // axesLocations.set('opsz', fontSize);
            //      const opsz = axesLocations.constructor.Model.createPrimalDraft();
            //      opsz.value = fontSize.value;
            //      axesLocations.set('opsz', opsz);
            //      // FIXME: if we set it explicitly in here, we also have
            //      // to unset it when autoOPSZ.value turns false
            //      // and opsz.value === fontSize.value
            //      // BUT: there's no way to know here whether in that case
            //      // opsz.value is meant to be explicitly fontSize.value!
            //      // Hence, we should probably rather not set it in the first
            //      // place, and let the application work out the opsz value
            //      // when autoOPSZ is true!
            //      // It's better to delete an explicit opsz from axesLocations
            //      // when autoOPSZ is true!!!
            //      axesLocations.delete('opsz');
            // }
            if(autoOPSZ.value) {
                // If we'd set it explicitly in here, we'd also have
                // to unset it when autoOPSZ.value turns false
                // and opsz.value === fontSize.value
                // BUT: there's no way to know here whether in that case
                // opsz.value is meant to be explicitly fontSize.value!
                // Hence, we should probably rather not set it in the first
                // place, and let the application work out the opsz value
                // when autoOPSZ is true!
                // It's better to delete an explicit opsz from axesLocations
                // when autoOPSZ is true!!!
                axesLocations.delete('opsz');
            }

            // const axisRanges = font.value.axisRanges;
            // axisRanges[axis.tag] {
            //      name /*  'name' in axis ? axis.name.en : axis.tag */
            //    , min, max, default }

        // Skip as this is destructive when switching fonts.
        // There could be a UI "sanitize axis ranges" action
        //    for(const [key, entry] of axesLocations) {
        //        if(!(key in axisRanges)) {
        //            // Remove all keys from `axesLocations` that are
        //            // not axes in font!
        //            axesLocations.delete(key);
        //            continue;
        //        }
        //        const {min, max} = axisRanges[key];
        //
        //        if(typeof entry.value !== 'number')
        //            // NumberModel is still generic!
        //            throw new Error(`ASSERTION ERROR expecting a number value but got: ${typeof entry.value}`);
        //        // And make sure existing axes are within the
        //        // min/max limits.
        //        entry.value = Math.max(min, Math.min(max, entry.value));
        //
        //        // The UI must decide to store explicitly data in
        //        // here or not. If it is not in here, the default
        //        // value is implicit!.
        //        // In that case this case should be removed!
        //        // if(entry.value === defaultVal)
        //        //     axisRanges.delete(key);
        //    }

        })// => [name, instance]
            // This is only expected to set fontSize to opsz if
            // autoOPSZ is true (and if there is an opsz axis anyways).
            // In order to do that, it needs access to fontSize.
            // so, when fontSize changes, or when autoOPSZ is set to true,
            // this needs to run. Actually, when autoOPSZ is set to false,
            // opsz  will not be changed.
            // in order for opsz to be something else than font-size
            // autoOPSZ must be false.
            //
            // so a good example to set opsz to something else when
            // autoOPSZ is true as an compound action:
            //       set autoOPSZ = false
            //       set opsz = 123
            // the other way around must fail
            //       set opsz = 123 // -> ERROR cannot set opsz because autoOPSZ is true
            //       set autoOPSZ = false
            //
            // !!! There is an order that must be obeyed.
            // Should this be done internally? After all, setting single
            // values is chaotic anyways.
            //
      , ['autoOPSZ', BooleanModel, /* default true */]
      , ['axesLocations', AxesLocationsModel]
    ]
  , ManualAxesLocationsModel = _AbstractStructModel.createClass(
        'ManualAxesLocationsModel'
      , ...manualAxesLocationsModelMixin
    )
  ;

export {
    ManualAxesLocationsModel as Model
  , AxesLocationsModel
  , manualAxesLocationsModelMixin
};

export class UIManualAxesLocations extends _BaseComponent {
    // Order of the legacy variable type tools app appearance,
    // which actually uses the order of axes as in the font.
    // However, the axes order seems  to have changed and the order
    // seen in the app seems more intuitive to use, so here comes a
    // custom order, also, these axes displayed when "View all axes"
    // is not checked.
    static REGISTERED_AXES_ORDERED = ['wght', 'wdth', 'opsz', 'ital', 'slnt', 'grad', 'GRAD']; //jshint ignore:line

    // FIXME: ppsRecord we should also have one for fontSize
    // e.g. that would be maybe a ppsMap then!
    // FIXME: The ppsRecords fullKey is axisLocations/axisLocations which
    // defies the purpose of the ppsRecord a bit. better than literal
    // 'axisLocations/' in here still. Maybe, it could be a partialPPSRecord
    // and then we add the axisTag explicitly.No immediate action required
    // but this is still not worked out very well.
    constructor (widgetBus, getDefaults=null, ppsRecord=null, requireUpdateDefaults=()=>false) {
        super(widgetBus);

        this._ppsRecord = ppsRecord;
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._autoOPSZChangeHandler = this._changeStateHandler(this.__autoOPSZChangeHandler.bind(this));
        this._axisChangeHandler = this._changeStateHandler(this.__axisChangeHandler.bind(this));
        this._styleSelectChangeHandler= this._changeStateHandler(this.__styleSelectChangeHandler.bind(this));

        this.element = this._domTool.createElement('div',
                {class: 'manual_axes_locations'},
                this._domTool.createElement('h3', {}, 'Manual Axes Locations'));

        this._insertElement(this.element);

        this._axesInterfaces = new Map();
        this._autoOPSZInput = null;
        this._viewAllAxes = null;
        this._styleSelect = null;

        this._insertedElements = [];
        this._font = null;
        this._fontSize = null;
        this._localAxesLocations = {};
        this._axesLocations = null;
    }

    // could be static and stand alone
    _setOrReset(mapLike, key, value) {
        if(value === null)
            mapLike.delete(key);
        else
            mapLike.setSimpleValue(key, value);
    }

    /* Run within transaction context */
    __autoOPSZChangeHandler(event) {
        event.preventDefault();
        const autoOPSZ = this._autoOPSZInput.checked;
        this.getEntry('autoOPSZ').set(autoOPSZ);

        const axesLocations = this.getEntry('axesLocations')
          , axisTag = 'opsz'
          //, defaultValue = this.axesGet(axisTag)['default']
          , value = autoOPSZ
                        ? null // will get deleted
                        : this._fontSize
                        ;
        this._setOrReset(axesLocations, axisTag, value);
    }

     /* Run within transaction context */
    __axisChangeHandler(axisTag, value) {
        const axesLocations = this.getEntry('axesLocations');
        this._setOrReset(axesLocations, axisTag, value);
    }

    /* Run within transaction context */
    __styleSelectChangeHandler(locations) {
        const axesLocations = this.getEntry('axesLocations');
        for(const [axisTag, locationValue] of Object.entries(locations)) {
            const defaultValue = this.axesGet(axisTag)['default']
              , value = (axisTag === 'opsz' && this.getEntry('autoOPSZ').value)
                    ? defaultValue // will get deleted
                    : locationValue
                    ;
            this._setOrReset(axesLocations, axisTag, value === defaultValue ? null : value);
        }
    }

    static CUSTOM_STYLE_VALUE = 'custom'; //jshint ignore:line

    _newStyleSelect({insertElement, changeHandler},  instances) {
        const container = this._domTool.createElementfromHTML('label', {}
                        , `Style: <select></select>`)
          , widget = {
                container: container
              , input: container.querySelector('select')
              , _domTool: this._domTool
              , _instances: []
              , _locationsIndexesCache: new Map()
              , _getLocationsIndex(ignoreSet) {
                    const keyOfIndex = (!ignoreSet || ignoreSet.size === 0)
                        ? ''
                        : Array.from(ignoreSet).sort().join(';')
                        ;
                    if(!this._locationsIndexesCache.has(keyOfIndex)) {
                        const index = new Map();
                        for(const [i, [/*name*/, locations]] of this._instances.entries()) {
                            const key = this._locationsToKey(locations, ignoreSet);
                            index.set(key, i);
                        }
                        this._locationsIndexesCache.set(keyOfIndex, index);
                    }
                    return this._locationsIndexesCache.get(keyOfIndex);
                }
              , setInstances(instances) {
                    this._instances = instances;
                    // instances = this.widgetBus.getFont().instances
                    const makeOption = (value, label)=>this._domTool
                                    .createElement('option', typeof value !== 'object' ? {value} : value, label)
                      , options = []
                      ;

                    if(instances.length)
                        this.container.style.removeProperty('display');
                    else
                        this.container.style.display = 'none';

                    options.push(makeOption({
                            value: UIManualAxesLocations.CUSTOM_STYLE_VALUE
                         , disabled: '1'
                    }, '(custom value)'));

                    this._locationsIndexesCache.clear();
                    for(const [i, [name/*, locations*/]] of instances.entries())
                        options.push(makeOption(i, name));

                    this._domTool.clear(this.input);
                    this.input.append(...options);
                    this.input.value = UIManualAxesLocations.CUSTOM_STYLE_VALUE;
                }

              , setValue(locations, autoOPSZ=false) {
                    this.input.value = this._getInstanceValueForLocations(locations, autoOPSZ);
                }
              , remove: function() {
                    this.container.remove();
                }
              , destroy: function(){/* nothing to do */}
              , _locationsToKey(locations, ignoreTags=null) {
                    return Object.entries(locations)
                                .sort(([tagA], [tagB])=>{
                                       if (tagA < tagB)
                                            return -1;
                                        if (tagA > tagB)
                                            return 1;
                                        return 0;
                                })
                                .filter(([axisTag])=>!(ignoreTags && ignoreTags.has(axisTag)))
                                .map(([axisTag, val])=>`${axisTag}:${val}`)
                                .join(';')
                                ;
                }
              , getCurrentLocations() {
                    if(this.input.value === UIManualAxesLocations.CUSTOM_STYLE_VALUE)
                        return undefined;
                    return this._instances[this.input.value]?.[1];
                }
              , _getInstanceValueForLocations(locations, autoOPSZ=false) {
                    // autoOPSZ===true means, if there's an opsz key
                    // in locations ignore it!
                    const ignoreSet = autoOPSZ ? new Set(['opsz']) : null
                      , key = this._locationsToKey(locations, ignoreSet)
                      , index = this._getLocationsIndex(ignoreSet)
                      , value = index.get(key)
                      ;
                    return value !== undefined
                                    ? value
                                    : UIManualAxesLocations.CUSTOM_STYLE_VALUE
                                    ;
                }
            }
          ;
        widget.input.addEventListener('change', (/*event*/)=>{
            const locations = widget.getCurrentLocations();
            if(!locations)
                return;
            changeHandler(locations);
        });
        widget.setInstances(instances);
        insertElement(widget.container);
        return widget;
    }

    _newCheckbox({insertElement, changeHandler}, label) {
        const container = this._domTool.createElementfromHTML('label', {}
                        , `<input type="checkbox" /> ${label}`)
          , widget = {
                container: container
              , input: container.querySelector('input')
              , get checked(){
                    return this.input.checked;
                }
              , set checked(val){
                    this.input.checked = !!val;
                }
              , remove: function(){
                    this.container.remove();
                }
              , destroy: function(){/*nothing to do*/}
              , setDisplay(show) {
                    if(show)
                        this.container.style.removeProperty('display');
                    else
                        this.container.style.display = 'none';
                }
              , disable() {
                    this.container.classList.add('disabled');
                    this.input.disabled = true;
                }
              , enable() {
                    this.container.classList.remove('disabled');
                    this.input.disabled = false;
                }
            }
          ;
        widget.input.addEventListener('change', changeHandler);
        insertElement(widget.container);
        return widget;
    }

    _toggleAxesDisplay() {
        const displayAll = this._viewAllAxes.checked
          , alwaysDisplayed = new Set(UIManualAxesLocations.REGISTERED_AXES_ORDERED)
          ;
        for(const [axesTag, widget] of this._axesInterfaces.entries()) {
            if(alwaysDisplayed.has(axesTag))
                // Never hidden, must not be turned back on.
                continue;
            widget.setDisplay(displayAll);
        }
    }

    _cleanUp() {
        this._localAxesLocations = {};
        for(const axisUi of this._axesInterfaces.values())
            axisUi.destroy();
        this._axesInterfaces.clear();

        if(this._styleSelect) {
            this._styleSelect.destroy();
            this._styleSelect = null;
        }

        if(this._autoOPSZInput) {
            this._autoOPSZInput.destroy();
            this._autoOPSZInput = null;
        }

        if(this._viewAllAxes) {
            this._viewAllAxes.destroy();
            this._viewAllAxes = null;
        }

        for(const element of this._insertedElements)
            this._domTool.removeNode(element);
        this._insertedElements.splice(0, Infinity);
    }

    _initUI() {
        const insertElement = (...elements)=>{
            this.element.append(...elements);
            this._insertedElements.push(...elements);
        };

        this._styleSelect = this._newStyleSelect({
            insertElement
          , changeHandler: this._styleSelectChangeHandler.bind(this)
        }, this._font.instances);

        // This is kind of internal state an currently not serialized or a dependency of something.
        this._viewAllAxes = this._newCheckbox({
            insertElement
          , changeHandler: this._toggleAxesDisplay.bind(this)
        }, 'View all axes');

        const opszDelayedInserted = [];
        if(this.axesHas('opsz')) {
            this._autoOPSZInput = this._newCheckbox({
                insertElement: (...elements)=>opszDelayedInserted.push(...elements)
              , changeHandler: this._autoOPSZChangeHandler
            }, 'Mirror size changes');
        }

        const alwaysDisplayed = new Set(UIManualAxesLocations.REGISTERED_AXES_ORDERED);
        let hasHiddenAxes = false
        //  , hasNonDefaultHiddenAxes = false => would be nice on font change/initially to detect and then show the hidden axes
          ;
        for(const axisTag of [UIManualAxesLocations.REGISTERED_AXES_ORDERED, ...this.axesTags()]) {
            if(this._axesInterfaces.has(axisTag))
                //seen
                continue;
            if(!this.axesHas(axisTag))
                // It's in REGISTERED_AXES_ORDERED but not in the font
                continue;

            const {name, min, max, 'default':defaultVal} = this.axesGet(axisTag);
            this._localAxesLocations[axisTag] = defaultVal;

            if(!alwaysDisplayed.has(axisTag))
                hasHiddenAxes = true;

            const input = new PlainNumberAndRangeOrEmptyInput(
                this._domTool
                // numberChangeHandler
              , value=>this._axisChangeHandler(axisTag, value)
                // toggleChangeHandler
              , ()=>{
                    const value = this._axesLocations.has(axisTag)
                        ? null // if the axis is defined delete
                           // if the axis is not defined set default ...
                        : (this._getDefaults
                                    ? this._getDefaults(this._ppsRecord, axisTag, defaultVal)
                                    : defaultVal
                          )
                        ;
                    this._axisChangeHandler(axisTag, value);
                }
              , name === axisTag ? `${name}` :`${name} (${axisTag})`
              , undefined
              , {min, max, /*step,*/ value: defaultVal}
            );

            insertElement(input.element);
            // insert after the element
            if(axisTag === 'opsz')
                insertElement(...opszDelayedInserted);

            this._axesInterfaces.set(axisTag, input);
        }

        this._viewAllAxes.setDisplay(hasHiddenAxes);
    }

    axesHas(axisTag) {
        return this._font !== null && axisTag in this._font.axisRanges;
    }
    axesGet(axisTag) {
        if(!this.axesHas(axisTag))
            throw new Error(`KEY ERROR ${axisTag} not found in font "${this._font.fullName}".`);
        return this._font.axisRanges[axisTag];
    }
    axesTags() {
        return Object.keys(this._font.axisRanges);
    }

    *axesEntries() {
        for(const axisTag of this.axesTags())
            yield [axisTag, this.axesGet(axisTag)];
    }

    _getValueForAxis(axisTag) {
        return this._axesLocations.has(axisTag)
                    ? [true, this._axesLocations.get(axisTag).value]
                    : [false, (this._getDefaults !== null
                              // This is interesting, as the source of the
                              // default value is in the font!
                              // it's also kind of interesting as this
                              // maps not so well to the PPS yet
                            ? this._getDefaults(this._ppsRecord, axisTag, this.axesGet(axisTag)['default'])
                            : this.axesGet(axisTag)['default']
                            )
                      ]
                    ;
    }

    _updateValueToAxisInterface(axisTag, active, value) {
        if(!this._axesInterfaces.has(axisTag))
            throw new Error(`KEY ERROR axis interface for axis tag "${axisTag}" not found.`);
        const widget = this._axesInterfaces.get(axisTag);
        widget.update(active, value);
        this._localAxesLocations[axisTag] = value;
    }

    /**
     * opsz slider value depends on:
     * though, if there's no opsz, we don't need to care!
     *          font (has opsz, defaultVal)
     *          autoOPSZ: true false
     *          if autoOPSZ:
     *              fontSize
     *          else:
     *              axesLocations: get('opsz') or font.opsz.defaultVal
     */
    _updateOPSZAxisInterface(changedMap, fontHasChanged) {
        const autoOPSZ = this._autoOPSZInput.checked
          , requireUpdateDefaults = this._requireUpdateDefaults(changedMap)
          , axisTag = 'opsz'
          , requireUpdate = changedMap.has('autoOPSZ') // always
                      || fontHasChanged // always
                      || requireUpdateDefaults // always
                      || (autoOPSZ
                                ? changedMap.has('fontSize')
                                : changedMap.has('axesLocations')
                          )
          ;
        if(!requireUpdate)
            return;

        const widget = this._axesInterfaces.get('opsz');

        if(autoOPSZ) {
            // => disable the ui PlainNumberAndRangeOrEmptyInput completely
            // => set font-size to opsz => mirror in ui
            this._updateValueToAxisInterface('opsz', false, this._fontSize);
            // This is partly set by the widget itself, but we want it to
            // be fully passive when in autoOPSZ mode.
            widget.passive = true;
        }
        else {
            // => enable the the PlainNumberAndRangeOrEmptyInput
            // => either set or delete opsz depending on the setup
            //
            //  -> could pick up the state it is in already ????
            //  -> don't know what that is?
            // Unset the passiveness and let the widget do the rest via
            // this._updateValueToAxisInterface ...
            widget.passive = false;
            const [active, value] = this._getValueForAxis(axisTag);
            this._updateValueToAxisInterface('opsz', active, value);
        }
    }

    _setFont(changedMap) {
        // Store this locally, for reading. Could also get
        // it anytime from the widgetBus, but we have the reference
        // now and we'll get informed when it changes.
        // Also, storing the raw value, not the Model wrapper.

        // NOTE: this is a bit complicated, as everything is refactored!
        // BUT: if 'properties@' is known to this Component
        // that's the NEW way to get the current font,
        // otherwise font inheritance is directly in the model and
        // we use 'font' to read it.
        if(this.widgetBus.wrapper.dependencyReverseMapping.has('properties@')) {
            // FIXME: DO NOT HARD CODE ppsRecord
            const ppsRecord = {fullKey: `${SPECIFIC}font`};
            if(changedMap.has('rootFont') || changedMap.has('properties@') ) {
                const propertyValuesMap = (changedMap.has('properties@')
                        ? changedMap.get('properties@')
                        : this.getEntry('properties@')).typeSpecnion.getProperties()
                  , font = (propertyValuesMap.has(ppsRecord.fullKey))
                        ? propertyValuesMap.get(ppsRecord.fullKey)
                        // rootFont can't be ForeignKey.NULL
                        : this.getEntry('rootFont').value
                 ;
                const fontHasChanged = font !== this._font;
                if(fontHasChanged)
                    this._font = font;
                return fontHasChanged;
            }
            return false;
        }
        else {
            if(!changedMap.has('font'))
                return false;
            const newFont = changedMap.get('font').value
              , fontHasChanged = newFont !== this._font
              ;
            if(fontHasChanged)
                this._font = newFont;
            return fontHasChanged;
        }
    }

    _setFontSize(changedMap, requireUpdateDefaults) {
        if(this.widgetBus.wrapper.dependencyReverseMapping.has('properties@')) {
            const  ppsRecord = {fullKey: `${GENERIC}fontSize`}
              , propertyValuesMap = (changedMap.has('properties@')
                        ? changedMap.get('properties@')
                        : this.getEntry('properties@')).typeSpecnion.getProperties()
                  , defaultValue = this.axesHas('opsz')
                        ? this.axesGet('opsz')['default']
                        : 36
                    // FIXME: The way typeSpecnion is set up currently
                    // it will always define and return fontSize
                    // however, maybe will be a changed call required
                    // at some time.
                  , fontSize = (propertyValuesMap.has(ppsRecord.fullKey))
                        ? propertyValuesMap.get(ppsRecord.fullKey)
                        : this._getDefaults(ppsRecord, 'fontSize', defaultValue)
                        ;
            this._fontSize = fontSize;
            return;
        }
        // old school
        if(changedMap.has('fontSize') || requireUpdateDefaults) {
            // depending on autoOPSZ must change opsz axis
            const fontSize = changedMap.has('fontSize')
                        ? changedMap.get('fontSize')
                        : this.getEntry('fontSize')
                        ;
            // Not very clean: can be an _AbstractSimpleOrEmpty model
            // can also be an _AbstractSimpleModel, in the latter case
            // fontSize.isEmpty is undefined.
            // FIXME: the nature of fontSize should be clear!
            // Don't use this in the _AbstractSimpleOrEmpty case
            // (in example-key-moments).
            if(!fontSize.isEmpty)
                this._fontSize = fontSize.value;
            else {
                // FIXME: creating this in place is maybe not ideal!
                // should rather get injected
                const ppsRecord = ProcessedPropertiesSystemMap.createSimpleRecord(GENERIC, 'fontSize')
                  , getDefaultArgs = [ppsRecord, 'fontSize'];
                if(this.axesHas('opsz'))
                    getDefaultArgs.push(this.axesGet('opsz')['default']);
                else
                    // FIXME: I'm often using 36 as a generic default
                    // value, especially for font sizes, but there should
                    // be a not so hard coded way to set it, sommething
                    // more elegant.
                    // NOTE: this value is unused when _getDefaults is
                    // set up correctly.
                    getDefaultArgs.push(36);
                this._fontSize = this._getDefaults(...getDefaultArgs);
            }
        }
    }

    _update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap)
          , fontHasChanged = this._setFont(changedMap)
          ;
        if(fontHasChanged) {
            // Do this now or maybe wait? Technically it has to come
            // first, the other changes should always be applicaple
            // to the widget state created here.
            this._cleanUp();
            this._initUI();

            // This is about internally managed state, however, after rebuilding
            // the axes in initUI we need to run this.
            this._toggleAxesDisplay();
        }
        // From now on expect that this._axesInterfaces is in sync
        // with the current font.
        this._setFontSize(changedMap, requireUpdateDefaults);
        if(this.axesHas('opsz') && (changedMap.has('autoOPSZ') || fontHasChanged)) {
            this._autoOPSZInput.checked = !!(changedMap.has('autoOPSZ')
                                                ? changedMap.get('autoOPSZ')
                                                : this.getEntry('autoOPSZ')
                                            ).value;
            this._axesInterfaces.get('opsz').passive = this._autoOPSZInput.checked;
        }

        // axesLocations
        //    axes in the font that are not in axesLocations should be set to their default
        //    I'm kind of interested to distinguish between explicitly default, i.e. the location
        //    equals the default value vs. implicitly default, i.e. no explicit location is set.
        //    Would be nice to control this in the UI as well.
        //    The control so far
        //           explicit: the value is in axesLocations
        //           implicit: the value is not axesLocations
        if(changedMap.has('axesLocations') || fontHasChanged || requireUpdateDefaults) {
            const axesLocations = changedMap.has('axesLocations')
                                        ? changedMap.get('axesLocations')
                                        : this.getEntry('axesLocations')
                                        ;
            this._axesLocations = axesLocations;
            for(const axisTag of this.axesTags()) {
                if(axisTag === 'opsz')
                    // taken care of separately
                    continue;
                const [active, value] = this._getValueForAxis(axisTag);
                // It's interesting: in a way, the sub-ui's could listen
                // directly to their entry at axesLocations/{axisTag}
                // but on the other hand, because we want to set defaults
                // in here when nothing is in axesLocations and that requires
                // updating as well, we do it directly here.
                // Maybe there will be/is a nicer way to implement behavior
                // like this. I.e. when the entry is DELETED the UI knows
                // it's default and sets it by itself.
                this._updateValueToAxisInterface(axisTag, active, value);
            }
        }

        if(this.axesHas('opsz') && requireUpdateDefaults)
            // run this last, it depends on the previous values
            this._updateOPSZAxisInterface(changedMap, fontHasChanged);
    }

    update(changedMap) {
        // Because of the handling of this._localAxesLocations
        // the actual this._update(changedMap); is wrapped in
        // a try finally block, so we can reset this._localAxesLocations
        // again if required.
        // detecting local change of absolute axes coordinates
        const originalLocations = this._localAxesLocations;
        // Note: this._cleanUp will replace this._localAxesLocations
        this._localAxesLocations =  Object.create(originalLocations);

        try {
            this._update(changedMap);
        }
        finally {
            this._updateStyleSelect(originalLocations, this.axesHas('opsz') && this._autoOPSZInput.checked);
        }
    }

    _updateStyleSelect(originalLocations, autoOPSZ) {
        // only update when there are changes!
        let requireUpdateStyleSelect = false;
        if(Object.getPrototypeOf(this._localAxesLocations) === originalLocations) {
            if(Object.keys(this._localAxesLocations).length > 0) {
                // found changed keys, replace with flattened update ...
                this._localAxesLocations = Object.assign({}, originalLocations, this._localAxesLocations);
                requireUpdateStyleSelect = true;
            }
            else
                // no require change, rewind...
                this._localAxesLocations = originalLocations;
        }
        else
            // this._localAxesLocations was replaced (by this._cleanUp)
            requireUpdateStyleSelect = true;

        if(requireUpdateStyleSelect && this._styleSelect)
            this._styleSelect.setValue(this._localAxesLocations, autoOPSZ);
    }
}
