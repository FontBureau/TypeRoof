

import {
    _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractNumberModel
  , StringModel
  , BooleanModel
  , BooleanDefaultTrueModel
  , Path
} from '../metamodel.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_NO_UPDATE
} from './basics.mjs';

import {
    StaticTag
  //, StaticNode
  , UILineOfTextInput
  , UISelectInput
  , UIToggleButton
  , UILineOfTextOrEmptyInput
  , UISelectOrEmptyInput
  , UICheckboxOrEmptyInput
  , UINumberAndRangeInput
  , UINumberAndRangeOrEmptyInput
} from './generic.mjs';

import {
    getRegisteredPropertySetup
} from './registered-properties.mjs';

import {
    CharGroupOptionsModel
  , CharGroupModel
} from './actors/videoproof-array.mjs';

import {
    UICharGroupContainer
} from './ui-char-groups.mjs';

import {
    UISelectCharGroupInput
  , UISelectCharGroupOrEmptyInput
} from './ui-char-groups.mjs'

import {
    ColorModel
} from './color.mjs';

import {
    UIColorChooser
} from './ui-color-chooser.mjs'

import {
    AxesLocationsModel,
    UIManualAxesLocations
} from './ui-manual-axis-locations.mjs'

import {
    ProcessedPropertiesSystemMap,
    ProcessedPropertiesSystemRecord
} from './registered-properties-definitions.mjs';

import {
     StylePatchLinksMapModel
   , UIStylePatchesLinksMap
} from './type-spec-fundamentals.mjs';

// FIXME: maybe rather change the imports
export {ProcessedPropertiesSystemMap, ProcessedPropertiesSystemRecord};


// camelCase to camel_case
function deCamelize(str) {
    return str.replace(/(?:[A-Z])/g
        , (word, index)=>`${index === 0 ? '' : '_'}${word.toLowerCase()}`);
}


const _NOTDEF = Symbol('_NOTDEF');

export class UIMissingUIElement extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="ui_missing-ui_element">
    <h4>Missing UI-Element</h4>
    <span class="ui_missing-ui_element-label"><!-- insert: label --></span>
    <span class="ui_missing-ui_element-full_key"><!-- insert: fullKey --></span>
    <span class="ui_missing-ui_element-type_name"><!-- insert: typeName --><span>
    <span class="ui_missing-ui_element-message"><!-- insert: message --><span>
</div>`;
    //jshint ignore:end
    constructor(widgetBus, typeName, message, fullKey, label) {
        super(widgetBus);
        [this.element] = this.initTemplate(typeName, message, fullKey, label);
    }
    initTemplate(typeName, message, fullKey, label) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild;
        for(const [key, value] of Object.entries({typeName, message, fullKey, label}))
            this._domTool.insertAtMarkerComment(element, `insert: ${key}`, value);
        this._insertElement(element);
        return [element];
    }
}

/**
 * A parameter is the variable listed inside the parentheses in the
 * function definition. An argument is the actual value that is sent
 * to the function when it is called.
 */
export class InjectDependency {
    constructor(name, payload=null, typeHint=_NOTDEF) {
        this.name = name;
        this.payload = payload;
        // TODO: the same name can mean a totally different thing.
        // We don't have real typing in here anyways, but this could be
        // a place to help/instruct the caller to insert the right argument.
        // This is just a stub, to suggest to a future me, that this could
        // be a goog place to implement.
        if(typeHint !== _NOTDEF)
            throw new Error(`NOT IMPLEMENTED ${this.constructor.name} "typeHint" argument `
                + `(value: ${typeHint.toString()}).`);
    }
    toString(){
        return `[${this.constructor.name}: ${this.name}]`;
    }
}

export function require(...args) {
    return new InjectDependency(...args);
}
/**
 *See REGISTERED_GENERIC_KEYMOMENT_FIELDS, which currently acts as
 * an inventory list for this. The fields associated with the registered
 * names must be configurable with this method and it's caller.
 *
 * FIXME: this requires refactoring to make it generally useful/usable.
 * It can be very specific what a UIElement requires, so this is
 * also exploratory. Maybe we'll need another abstraction to define all
 * of this.
 * Also, based on the position of the UI in the app and also on the context
 * of the Model, a ModelType could be expected to be connected with a
 * different UIElement. This so far is to be used within KeyMomentController
 * for the properties of a single KeyMoment. However, even for different
 * KeyMoment Types, different UIElements could be expected/required.
 *
 * TODO: This is a powerful start for data driven automatic ui genration,
 * it will take a while to make this into a general principle.
 *
 * One issue with this is that it does two things:
 *      1: map the Model to a widget configuration
 *      2: define the widget configuration
 * Both can be very generic on the one hand, like a general default behavior.
 * But at the same time, both can be very specific, e.g. the UI Element to
 * represent a boolean switch can be different based on the context. Not
 * to speak of labels, placeholders, titles etc.
 * This means basically both sides need to be customizable, but also,
 * there could be a generic default. The generic default could be attached
 * directly to the UIElement definition. e.g. Maybe using a Symbol.
 * It's very interesting that we could adress the parameters by name
 * that way, e.g. as a Map both argument order and name can be stored e.g.:
 *
 *     UIToggleButton[CONFIGURATION] = new Map(
 *          ['internalPropertyName', require('settings:internalPropertyName', 'boolean')]
 *        , ['classToken', require('classToken')]
 *        , ['labelIsOn', require('label', val=>`turn ${val} off`)]
 *        , ['labelIsOff', require('label', val=>`turn ${val} on`)]
 *        , ['title', require('label', val=>`Toggle ${val}`)]
 *     )
 *
 * CAUTION: In the example 'internalPropertyName' doesn't result in an actual
 * argument, it's rather influencing the `dependecyMappings`. Hence, the
 * order of that item is not particularly important.
 * The `require('{name}')` property is more complex than just injecting
 * a specific argument, It's rather a behavior that can have other
 * side effects on the widget definition as well. However, if it is injecting
 * arguments, the order is important.
 * It will requrie some effort to explain and document this properly.
 *
 * For `UIElement.prototype instanceof _BaseContainerComponent`
 * it would be interesting to always have
 *          require('settings:rootPath'), require('zones')
 *
 * There could be some configuration that is automatically inherited if
 * not specified otherwise. Fundamentally each _BaseComponent requires
 * `widgetBus`. Then each  _CommonContainerComponent requires additionally
 * `zones` and `widgets=[]`; It would be cool to be able to define the
 * requirements of all the widgets this way, while still having a
 * way to define more specific behavior when it maters.
 *
 */
export function genericTypeToUIElement(ModelType, defaultVal=_NOTDEF) {
    const valueUIElements = new Map([
            [StringModel, [UILineOfTextInput
                    , require('settings:internalPropertyName', 'value')
                    , require('label')]]
          , [_AbstractEnumModel, [UISelectInput
                    , require('settings:internalPropertyName', 'value')
                    , require('label'), require('items')]]
          , [CharGroupOptionsModel, [UISelectCharGroupInput
                    , require('settings:internalPropertyName', 'value')
                    , CharGroupOptionsModel.charGroupsData, require('label')]]
          // TODO: UIGenericKeyMomentStructContainer should be the
          // default for any Struct that has not a more specific
          // UI mapped to it. Though, it should also be possible to
          // map no UI at all and overwrite the default, or set the default
          // within a countainer to map to no UI. Also, it would be good
          // to be able to map multiple UIs to one Type, like e.g. different
          // views.
          //, [CharGroupModel, [UIGenericKeyMomentStructContainer
          //          , require('settings:rootPath'), require('zones')
          //          , require('parentInjectable')
          //          , require('propertyRoot'), require('label')]]
          , [CharGroupModel, [UICharGroupContainer
                    , require('settings:rootPath'), require('zones')
                    , require('parentInjectable')
                    , require('propertyRoot'), require('label')]]
          , [BooleanModel, [UIToggleButton
                    , require('settings:internalPropertyName', 'boolean')
                    , require('classToken')
                    , require('label', val=>`turn ${val} off`)
                    , require('label', val=>`turn ${val} on`)
                    , require('label', val=>`Toggle ${val}`)
                    ]]
          , [ColorModel, [UIColorChooser
                    , require('settings:rootPath'), require('zones')
                    , require('label')
                      // ColorModel is not OrEmpty, however it behaves
                      // similarly.
                    , require('getDefault')
                    , require('updateDefaultsDependencies')
                    , require('raw:requireUpdateDefaults')]]
          , [_AbstractNumberModel, [UINumberAndRangeInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label') // e.g. 'Font-Size'
                    , require('unit') // e.g. 'pt'
                    // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
                    // hmm, maybe for the case of the
                    , require('getRegisteredPropertySetup', registeredSetup=>{
                            console.log('registeredSetup', registeredSetup);
                            throw new Error('need to extract now...');
                        })
                    ]]
          , [AxesLocationsModel, [UIManualAxesLocations
                    , require('settings:internalPropertyName', 'axesLocations')
                    , require('settings:dependencyMapping', 'fontSize')
                      // FIXME: not resolved in type-spec-ramp and in general
                      // more complicated! i.e. real world mapping:
                      //        [typeKey === '[STAGE:null]' ? '/font' : '../../font', 'font']
                    , require('settings:dependencyMapping', ['/font', 'font'])
                    , require('settings:dependencyMapping', 'autoOPSZ')
                    , require('raw:getDefaults') // used to be: this._getDefaults.bind(this)
                    , require('ppsRecord')
                    // within dependencyMappings: ...updateDefaultsDependencies
                    // but also injects raw:requireUpdateDefaults
                    , require('requireUpdateDefaults')
                    ]]
          , [StylePatchLinksMapModel, [UIStylePatchesLinksMap
                    , require('settings:internalPropertyName', 'childrenOrderedMap')
                    , require('settings:dependencyMapping', ['./stylePatchesSource', 'sourceMap'])
                    , require('zones')
                    , [] // eventHandlers
                    , 'Styles'
                    , true // dragAndDrop
                    ]]
        ])
      , valueOrEmptyUIElements = new Map([
            [StringModel, [UILineOfTextOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label')]]
          , [_AbstractEnumModel, [UISelectOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label'), require('items')]]
          , [CharGroupOptionsModel, [UISelectCharGroupOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , CharGroupOptionsModel.charGroupsData, require('label')]]
          , [BooleanModel, [UICheckboxOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('classToken')
                    , require('label')
                    ]]
            // NumberOrEmptyModel
          , [_AbstractNumberModel, [UINumberAndRangeOrEmptyInput
                    , require('settings:internalPropertyName', 'value')
                    , require('getDefault'), require('requireUpdateDefaults')
                    , require('label') // e.g. 'Font-Size'
                    , require('unit') // e.g. 'pt'
                    // minMaxValueStep, e.g. {min:0 , step:0.01, 'default': 36}
                    // hmm, maybe for the case of the
                    , require('getRegisteredPropertySetup', registeredSetup=>{
                            const result = {}
                            // FIXME: default seems not to be used by
                            // UINumberAndRangeOrEmptyInput but I've seen
                            // it used with fontSize ;-(
                            for(const key in ['min', 'max', 'default', 'step']) {
                                if(key in registeredSetup && registeredSetup[key] !== null)
                                    result[key] = registeredSetup[key];
                            }
                            return result;
                        }
                      )
            ]]
        ])
      ;
    // create some aliases ...
    for(const [alias, source] of [[BooleanDefaultTrueModel, BooleanModel]]){
        for(const elementsMap of [valueUIElements, valueOrEmptyUIElements])
            if(!elementsMap.has(alias) && elementsMap.has(source))
                elementsMap.set(alias, elementsMap.get(source));
    }
    const isOrEmpty = ModelType.prototype instanceof _AbstractSimpleOrEmptyModel
      , [setupMap, BaseModelType] = isOrEmpty
           ? [valueOrEmptyUIElements, ModelType.Model]
           : [valueUIElements, ModelType]
      , getSetupKey = BaseModelType=>{
            if(setupMap.has(BaseModelType))
                return BaseModelType
            for( const abstractType of [_AbstractNumberModel, _AbstractEnumModel])
                if(BaseModelType.prototype instanceof abstractType)
                    return abstractType
            return BaseModelType;
        }
      , SetupKey = getSetupKey(BaseModelType)
      ;
    // NOTE: fails also if !setupMap.has(_AbstractEnumModel) which
    // is expected, as the setupMaps may become arguments/configuration
    // in the future.
    if(!setupMap.has(SetupKey)) {
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        const message = `Can't find generic UI-Element for ModelType ${ModelType.name} `
                    + `(isOrEmpty: ${isOrEmpty}, BaseModelType: ${BaseModelType.name}).`;
        console.warn(message);
        const args = [ModelType.name, message, require('fullKey'), require('label')];
        return [UIMissingUIElement, BaseModelType, args];
    }
    const [UIElement, ...args] = setupMap.get(SetupKey);
    return [UIElement, BaseModelType, args];
}

export class _BaseTypeDrivenContainerComponent extends _BaseContainerComponent {
    _getArgumentConfig(injectable, zone, ppsRecord, fieldName, BaseModelType, parameter) {
        if(typeof ppsRecord === 'string') {
            throw new Error(`DEPRECATION EROROR ${this}._getArgumentConfig ppsRecord must not be a string!`);
        }

        if(ppsRecord.modelFieldName !== fieldName) {
            // Maybe it turns out that ppsRecord.fieldName is better inhere
            // then we can get rid of the fieldName argument.
            // otherwise, maybe the ppsRecord.fieldName should be removed
            // the record without the fieldname might be more verstile.
            throw new Error('ASSERTION failed ppsRecord.fieldName (${ppsRecord.fieldName}) !== fieldName (${fieldName})');
        }
        const settings = new Map()
          , dependencyMappings = new Map()
          , args = []
          , configuration = [settings, dependencyMappings, args]
          ;

        if(!(parameter instanceof InjectDependency)) {
            args.push(parameter);
            return configuration;
        }
        let argument = _NOTDEF;
            // resolve
        switch(parameter.name) {
            case "settings:rootPath":
                // settings.set('rootPath', this.widgetBus.rootPath.append(fieldName));
                // NOTE: The rootPath should have an "explicit anchoring"!
                settings.set('rootPath', Path.fromParts(Path.RELATIVE, fieldName));
                break;
            case "settings:internalPropertyName":
                dependencyMappings.set(fieldName, parameter.payload);
                break;
            case "settings:dependencyMapping":
                dependencyMappings.set(...(Array.isArray(parameter.payload)
                               ? parameter.payload
                               : [parameter.payload, parameter.payload]))
                break;
            case "settings:id":
                {
                // It looks like the parameter.payload variant is not
                // used anywhere yet.
                const id = parameter.payload
                        ? parameter.payload(fieldName, ppsRecord)
                        : fieldName
                        ;
                settings.set('id', id);
                }
                break;
            case "zones":
                // CAUTION: settings.zone must be set
                argument = new Map([...this._zones.entries(), ['main', this._zones.get(zone)]]);
                break;
            // especially: getDefault and requireUpdateDefaults are
            // added requirements with _UIAbstractPlainOrEmptyInputWrapper
            // so far: defaultValue === BaseModelType.defaultValue
            case "getDefault":
                // CAUTION: BaseModelType.defaultValue: Could be the
                // Symbol metamodel._NOTDEF, but is also not required
                // by all UIElements.
                // getDefault: ()=>this._getDefaults.bind(this, `${propertyRoot}/`)// , fieldName, BaseModelType.defaultValue));
                argument = injectable.getDefaults.bind(null, ppsRecord, fieldName, BaseModelType.defaultValue);
                break;
            case "raw:getDefaults":
                argument = injectable.getDefaults;
                break
            case "requireUpdateDefaults":
                // this is only required if requireUpdateDefaults is
                // an argument. it basically injects animationProperties@
                // which is an (the!) requirement of requireUpdateDefaults
                for(const entry of injectable.updateDefaultsDependencies)
                    dependencyMappings.set(...entry);
                /* falls through */
            case "raw:requireUpdateDefaults":
                argument = injectable.requireUpdateDefaults;
                break;
            case "updateDefaultsDependencies":
                argument = injectable.updateDefaultsDependencies;
                break;
            case "parentInjectable":
                 argument = injectable;
                 break;
            case "fieldName":
                argument = fieldName;
                break;
            case "fullKey":
                 argument = ppsRecord.fullKey;
                 break;
            case "getRegisteredPropertySetup":
                argument = getRegisteredPropertySetup(ppsRecord.fullKey);
                break;
            case "label":
                argument = getRegisteredPropertySetup(ppsRecord.fullKey, {label:fieldName}).label || fieldName;
                break;
            case "unit":
                argument = getRegisteredPropertySetup(ppsRecord.fullKey, {unit:''}).unit || '';
                break;
            case "propertyRoot":
                // interesting one! here it is feeding into an instance of itself
                argument = `${ppsRecord.fullKey}/`;
                break;
            case "ppsRecord":
                argument = ppsRecord;
                break;
            case "items":
                // TODO: No nice labels via _AbstractEnumModel so far! Maybe a
                // general internationalization and localization layer could provide
                // that?
                argument = new Map(BaseModelType.enumItems.map(value=>[value, value]));
                break;
            case "classToken":
                // fieldName to css name field_name
                // NOTE: this could also be done like this:
                //          require('fieldName', deCamelize);
                argument = deCamelize(fieldName);
                break;
            default:
                throw new Error(`KEY ERROR ${this}._defineGenericWidgets `
                    + `${fieldName} don't know how to provide parameter "${parameter.name}".`);
        }
        if(argument !== _NOTDEF) {
            if(typeof parameter.payload === 'function')
                argument = parameter.payload(argument);
            args.push(argument);
        }
        return configuration;
    }
    _defineGenericWidget(injectable, generalSettings, ppsRecord, fieldName, FieldType) {
        const elementTypeConfig = genericTypeToUIElement(FieldType);
        return this._getWidgetConfig(injectable, generalSettings, ppsRecord, fieldName, elementTypeConfig);
    }

    _getWidgetConfig(injectable, generalSettings, ppsRecord, fieldName, elementTypeConfig) {
        const [UIElement, BaseModelType, parameters] = elementTypeConfig
          , settings = new Map(Object.entries(generalSettings))
          , dependencyMap = new Map()
          , uiElementArgs = []
          ;
        for(const parameter of parameters) {
            const [
                argSettings, argDependencyMap, argArguments
            ] = this._getArgumentConfig(injectable
                                      , generalSettings.zone
                                      , ppsRecord
                                      , fieldName, BaseModelType, parameter);
            if(argSettings && argSettings.size)
                for(const entry of argSettings)
                    settings.set(...entry);
            if(argDependencyMap && argDependencyMap.size)
                for(const entry of argDependencyMap)
                    dependencyMap.set(...entry);
            if(argArguments && argArguments.length)
                uiElementArgs.push(...argArguments);
        }
        return [ // widgetDefinition
            Object.fromEntries(settings) // settings object
          , Array.from(dependencyMap) // dependencyMappings array
          , UIElement
          , ...uiElementArgs
        ];
    }
    _defineGenericWidgets(TypeClass, isAllowedFieldName, generalSettings, propertyRoot
            , injectable/*{getDefault, updateDefaultsDependencies, requireUpdateDefaults}*/
            ) {
        const resultWidgets = []
          ,  processedPropertiesSystemMap = typeof propertyRoot === 'string'
                ? ProcessedPropertiesSystemMap.fromPrefix(propertyRoot, TypeClass.fields.keys(), isAllowedFieldName)
                : propertyRoot
          ;

        for(const [fieldName, ppsRecord] of processedPropertiesSystemMap.entries()) {
            if(!isAllowedFieldName(fieldName))
                continue;
            if(!TypeClass.fields.has(fieldName))
                continue;

            const FieldType = TypeClass.fields.get(fieldName);
            try {
                const widgetDefinition = this._defineGenericWidget(
                        injectable, generalSettings, ppsRecord
                      , fieldName, FieldType);
                resultWidgets.push(widgetDefinition);
            }
            catch(error) {
                // Ammend the error message with more details.
                error.message = `${error.message} (via ${this} TypeClass: ${TypeClass.name})`;
                throw error;
            }
        }
        return resultWidgets;
    }
    // updateRootPath() {
    //     for(const widgetWrapper of this._widgets)
    //         widgetWrapper.updateRootPath(this.widgetBus.rootPath);
    // }
}


/**
 * Since this is never used, I guess it may be a good starting point for an
 * doucumentation/example implementation or it could become a true generic
 * implementation.
 *
 *
 * injectable is e.g. a dict like this:
 * , {
 *      updateDefaultsDependencies
 *    , requireUpdateDefaults
 *    , getDefaults: this._getDefaults.bind(this)
 *  }
 *
 * propertyRoot seems to be a path to be used in getDefaults
 * e.g. like:
 *      this._getDefaults = injectable.getDefaults.bind(null, propertyRoot);
 *      then
 *      default = this._getDefaults(fieldName);
 * or like:
 *      fullKey = `${propertyRoot}${fieldName}`
 *      getRegisteredPropertySetup(fullKey, {label:fieldName}).label || fieldName;
 */
export class UITypeDrivenContainer extends _BaseTypeDrivenContainerComponent {
    // FIXME: Where is this used?
    constructor(widgetBus, _zones, injectable, ppsMap, label) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_generic_struct_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        // When using StaticNode via widgets, it's not inserted right away.
        // and the position is lost relative to the sibling widgets to the
        // end of the container.
        zones.get('main').append(localZoneElement);
        super(widgetBus, zones);

        const TypeClass =  this.widgetBus.getEntry(this.widgetBus.rootPath).constructor;
        const widgets = this._defineWidgets(TypeClass, localZoneElement
                                        , injectable, ppsMap, label);
        this._initWidgets(widgets);
    }
    _defineWidgets(TypeClass, localZoneElement
            , injectable, propertyRoot, label) {
        return [
            // Maybe this label should be optional, at least,
            // it feels like it should rather not be part
            // of a "generic" container.
            [
                {zone: 'local'}
              , []
              , StaticTag
              , 'h4'
              , {}
              , [label]
            ]
            // label
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.has(fieldName) // basically all allowed
                  , {zone: 'local'}
                  , propertyRoot
                  , injectable
            )
        ];
    }
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }
}
