

import {
    _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
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
  , StaticNode
  , UILineOfTextInput
  , UISelectInput
  , UIToggleButton
  , UILineOfTextOrEmptyInput
  , UISelectOrEmptyInput
  , UICheckboxOrEmptyInput
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
      , SetupKey =  (!setupMap.has(BaseModelType)
                        && BaseModelType.prototype instanceof _AbstractEnumModel
                    )
            ? _AbstractEnumModel
            : BaseModelType
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
    _getArgumentConfig(injectable, zone, propertyRoot, fieldName, BaseModelType, parameter) {
        const settings = new Map()
          , dependencyMappings = new Map()
          , args = []
          , configuration = [settings, dependencyMappings, args]
          , fullKey = `${propertyRoot}${fieldName}`
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
                                                        : parameter.payload));
                break;
            case "settings:id":
                {
                const id = parameter.payload
                        ? parameter.payload(fieldName, propertyRoot)
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
                argument = injectable.getDefaults.bind(null, propertyRoot, fieldName, BaseModelType.defaultValue);
                break;
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
                 argument = fullKey;
                 break;
            case "label":
                argument = getRegisteredPropertySetup(fullKey, {label:fieldName}).label || fieldName;
                break;
            case "propertyRoot":
                argument = `${fullKey}/`;
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
    _defineGenericWidget(injectable, generalSettings, propertyRoot, fieldName, FieldType) {
        const elementTypeConfig = genericTypeToUIElement(FieldType);
        return this._getWidgetConfig(injectable, generalSettings, propertyRoot, fieldName, elementTypeConfig);
    }

    _getWidgetConfig(injectable, generalSettings, propertyRoot, fieldName, elementTypeConfig) {
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
                                      , propertyRoot
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
        const resultWidgets = [];
        for(const fieldName of TypeClass.fields.keys()) {
            if(!isAllowedFieldName(fieldName))
                continue;
            const FieldType = TypeClass.fields.get(fieldName);
            try {
                const widgetDefinition = this._defineGenericWidget(
                        injectable, generalSettings, propertyRoot
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
 */
class UITypeDrivenContainer extends _BaseTypeDrivenContainerComponent {
    // FIXME: Where is this used?
    constructor(widgetBus, _zones, injectable, propertyRoot, label) {
        throw new Error(`UIGenericKeyMomentStructContainer Where is this used?`);
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_generic_struct_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(widgetBus, zones);

        const TypeClass =  this.widgetBus.getEntry(this.widgetBus.rootPath).constructor;
        const widgets = this._defineWidgets(TypeClass, localZoneElement
                                        , injectable, propertyRoot, label);
        this._initWidgets(widgets);
    }
    _defineWidgets(TypeClass, localZoneElement
            , injectable, propertyRoot, label) {
        return [
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {zone: 'local'}
              , []
              , StaticTag
              , 'label'
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
