

import {
    deCamelize
} from '../util.mjs';

import {
    Path
  , _AbstractEnumModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractNumberModel
  , _AbstractDynamicStructModel
  , BooleanModel
  , BooleanDefaultTrueModel
  , FreezableMap
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
  , _BaseComponent
  , _UIBaseList
  , _UIBaseListContainerItem
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_NO_UPDATE
} from './basics.mjs';

import {
    StaticTag
} from './generic.mjs';

import {
    getRegisteredPropertySetup
} from './registered-properties.mjs';

import {
    ProcessedPropertiesSystemMap
  , ProcessedPropertiesSystemRecord
} from './registered-properties-definitions.mjs';

import {
    getTransferTypesForModel
} from './data-transfer-types.mjs';

import {
     LineWidthLeadingModel
   , getLineWidthLeadingPPSMap
} from './type-spec-models.mjs';

export const _NOTDEF = Symbol('_NOTDEF');

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


export function simpleSetting(fn) {
    return (env, parameter)=>[new Map([fn(env, parameter)]), _NOTDEF, _NOTDEF];
}
export function simpleDependencyMapping(fn) {
    return (env, parameter)=>[_NOTDEF, new Map([fn(env, parameter)]), _NOTDEF];
}
export function simpleArgument(fn) {
    return (env, parameter)=>[_NOTDEF, _NOTDEF, fn(env, parameter)];
}

export const baseResolvers = new FreezableMap([
    ['settings:rootPath', simpleSetting(({fieldName})=>{
        // settings.set('rootPath', this.widgetBus.rootPath.append(fieldName)],
        // NOTE: The rootPath should have an "explicit anchoring"!
        return ['rootPath', Path.fromParts(Path.RELATIVE, fieldName)];
    })],
    ['settings:internalPropertyName', simpleDependencyMapping(({fieldName}, {payload})=>{
        return [fieldName, payload];
    })],
    ['settings:dependencyMapping', simpleDependencyMapping((env, {payload})=>{
        return Array.isArray(payload) ? payload : [payload, payload];
    })],
    ['settings:id', simpleSetting(({fieldName, ppsRecord}, {payload})=>{
        // It looks like the parameter.payload variant is not
        // used anywhere yet.
        const id = payload
                ? payload(fieldName, ppsRecord)
                : fieldName
                ;
        return ['id', id];
    })],
    ['settings:@set', simpleSetting((env, {payload})=>{
        // this is probably one of the more versatile ideas
        return [...payload];
    })],
    ['zones', simpleArgument(({zone, zones})=>{
        // CAUTION: settings.zone must be set
        return new Map([...zones.entries(), ['main', zones.get(zone)]]);
    })],
    // especially: getDefault and requireUpdateDefaults are
    // added requirements with _UIAbstractPlainOrEmptyInputWrapper
    // so far: defaultValue === BaseModelType.defaultValue
    ['getDefault', simpleArgument(({injectable, ppsRecord, fieldName, BaseModelType})=>{
        // CAUTION: BaseModelType.defaultValue: Could be the
        // Symbol metamodel._NOTDEF, but is also not required
        // by all UIElements.
        // getDefault: ()=>this._getDefaults.bind(this, `${propertyRoot}/`)// , fieldName, BaseModelType.defaultValue)],
        return injectable.getDefaults.bind(null, ppsRecord, fieldName, BaseModelType.defaultValue);
    })],
    ['injectable', simpleArgument(({injectable})=>{
        // NOTE: this is experimental, can't say if it will
        // work like that!!!
        return injectable;
    })],
    ['raw:getDefaults', simpleArgument(({injectable})=>{
        return injectable.getDefaults;
    })],
    ['raw:requireUpdateDefaults', simpleArgument(({injectable})=>{
        return injectable.requireUpdateDefaults;
    })],
    ['requireUpdateDefaults', (env, parameter)=>{
        const {injectable, resolvers} = env;
        // this is only required if requireUpdateDefaults is
        // an argument. it basically injects animationProperties@
        // which is an (the!) requirement of requireUpdateDefaults
        const [,,argument] = resolvers.get('raw:requireUpdateDefaults')(env, parameter);
        return [_NOTDEF, new Map(injectable.updateDefaultsDependencies), argument];
    }],
    ['updateDefaultsDependencies', simpleArgument(({injectable})=>{
        return injectable.updateDefaultsDependencies;
    })],
    ['genericTypeToUIElement', simpleArgument(({injectable})=>{
        return injectable.genericTypeToUIElement;
    })],
    ['parentInjectable', simpleArgument(({injectable})=>{
        return injectable;
    })],
    ['fieldName', simpleArgument(({fieldName})=>{
        return fieldName;
    })],
    ['fullKey', simpleArgument(({ppsRecord})=>{
        return ppsRecord.fullKey;
    })],
    ['getRegisteredPropertySetup', simpleArgument(({ppsRecord, BaseModelType})=>{
        // e.G. NumberModel has the static getter ppsDefaultSettings
        // this is a good interface as a fallback, so the settings
        // can be defined by model.
        const defaultVal = 'ppsDefaultSettings' in BaseModelType
            ? BaseModelType.ppsDefaultSettings
            : getRegisteredPropertySetup.NOTDEF
        return getRegisteredPropertySetup(ppsRecord, defaultVal);
    })],
    ['label', simpleArgument(({ppsRecord, fieldName})=>{
        return getRegisteredPropertySetup(ppsRecord, {label:fieldName}).label || fieldName;
    })],
    ['unit', simpleArgument(({ppsRecord})=>{
        return getRegisteredPropertySetup(ppsRecord, {unit:''}).unit || '';
    })],
    ['propertyRoot', simpleArgument(({ppsRecord})=>{
        // interesting one! here it is feeding into an instance of itself
        // propertyRoot = `${ppsRecord.fullKey}/`;
        return ppsRecord.propertyRoot
    })],
    ['ppsRecord', simpleArgument(({ppsRecord})=>{
        return ppsRecord;
    })],
    ['ppsMap', simpleArgument(({injectable, ppsRecord, BaseModelType})=>{
        // We likely need to create the ppsMap relative to the
        // "parent", which I hope in this case should actually
        // be the ppsRecord ...
        // FIXME: this can't be in here!!! but how do I define it???
        // it has a dependency on the type, well that's not an
        // issue. It also has a dependency on ppsRecord =>
        // but that seems fine from this POV.
        // We may ether need a central generic method, that just
        // knows a lot about how to create ppsMaps for many/any BaseModelType
        // OR we inject somehow the smartness.
        // It could live even as a method, e.g.:
        // this._getPPSMapForModel(ppsRecord) (I named a function
        // in type-spec-fundamentals like that, but I'm not sure
        // that's the same as this problem requires...)
        // NOTE: PPSMap is also filtering, so the other way around,
        // it could be used to define company components (labels,
        // lines, stuff like that), that are not so much defined
        // by the type information...
        // so that _BaseTypeDrivenContainerComponent could truly
        // build all kind of things.
        if(BaseModelType === LineWidthLeadingModel)
            return getLineWidthLeadingPPSMap(ppsRecord, BaseModelType);
        else if(injectable.getPPSMapForModel)
            return injectable.getPPSMapForModel(ppsRecord, BaseModelType);
        console.warn(`${this} don't know how to get a PPSMap for ${BaseModelType.name} in ${ppsRecord}`);
        return new ProcessedPropertiesSystemMap();
    })],
    ['items', simpleArgument(({BaseModelType})=>{
        // TODO: No nice labels via _AbstractEnumModel so far! Maybe a
        // general internationalization and localization layer could provide
        // that?
        return new Map(BaseModelType.enumItems.map(value=>[value, value]));
    })],
    ['classToken', simpleArgument(({fieldName})=>{
        // fieldName to css name field_name
        // NOTE: this could also be done like this:
        //          require('fieldName', deCamelize);
        return deCamelize(fieldName);
    })],
]);
Object.freeze(baseResolvers);

/**
 * This runs one "resolver" for named `require(name)` parameter.
 * A resolver can set:
 *      - multiple settings in the settings map
 *      - multiple dependencies in the dependencyMappings map
 *      - one or none arguments in the constructor arguments of the child UI class
 * The reason that it can't set more than one argument is that the
 * positional relation between `require()` and the final constructor
 * parameters stays resonable.
 * return:configuration: [settings:Map, dependencyMappings:Map, args:Array]
 *
 */
export function getArgumentConfig(env, parameter) {
    const {ppsRecord, fieldName, resolvers, hostName} = env;
    if(!(ppsRecord instanceof ProcessedPropertiesSystemRecord)) {
        throw new Error(`DEPRECATION EROROR ${hostName}._getArgumentConfig ppsRecord must be a ProcessedPropertiesSystemRecord!`);
    }
    if(ppsRecord.modelFieldName !== fieldName) {
        // Maybe it turns out that ppsRecord.fieldName is better in here
        // then we can get rid of the fieldName argument.
        // otherwise, maybe the ppsRecord.fieldName should be removed
        // the record without the fieldname might be more versatile.
        throw new Error('ASSERTION ${hostName}._getArgumentConfig failed ppsRecord.fieldName (${ppsRecord.fieldName}) !== fieldName (${fieldName})');
    }

    if(!(parameter instanceof InjectDependency)) {
        return [_NOTDEF, _NOTDEF, [parameter]];
    }

    if(!resolvers.has(parameter.name))
        throw new Error(`KEY ERROR ${hostName}._getArgumentConfig `
                + `${fieldName} don't know how to provide parameter "${parameter.name}".`);
    const [settings, dependencyMappings, argument] = resolvers.get(parameter.name)(env, parameter)
      , args = []
      ;
    if(argument !== _NOTDEF) {
        if(typeof parameter.payload === 'function')
            args.push(parameter.payload(argument));
        else
            args.push(argument);
    }
    return [settings, dependencyMappings, args];
}

export function _BaseTypeDrivenContainerComponentMixin(Base) {
    return class extends Base {
    static _resolvers = baseResolvers;

    _getArgumentConfig = getArgumentConfig;

    _defineGenericWidget(injectable, generalSettings, ppsRecord, fieldName, FieldType) {
        const elementTypeConfig = injectable.genericTypeToUIElement(FieldType);
        return this._getWidgetConfig(injectable, generalSettings, ppsRecord, fieldName, elementTypeConfig);
    }

    _getWidgetConfig(injectable, generalSettings, ppsRecord, fieldName, elementTypeConfig) {
        const [UIElement, BaseModelType, parameters] = elementTypeConfig
          , settings = new Map(Object.entries(generalSettings))
          , dependencyMap = new Map()
          , uiElementArgs = []
          , env = {
                  injectable
                , zone: generalSettings.zone
                , zones: this._zones
                , ppsRecord, fieldName
                , BaseModelType
                , resolvers: this.constructor._resolvers
                , hostName: `${this}`
            }
          ;
        for(const parameter of parameters) {
            const [
                argSettings, argDependencyMap, argArguments
            ] = this._getArgumentConfig(env, parameter);
            if(argSettings !== _NOTDEF && argSettings && argSettings.size)
                for(const entry of argSettings) {
                    if(entry[0] === 'rootPath' && settings.has('rootPath')) {
                        // _getArgumentConfig will configure a relative
                        // rootPath... ideally this should be done in
                        // _getArgumentConfig.
                        entry[1] = settings.get('rootPath').append(...entry[1].parts);
                    }
                    settings.set(...entry);
                }
            if(argDependencyMap !== _NOTDEF && argDependencyMap && argDependencyMap.size)
                for(const entry of argDependencyMap)
                    dependencyMap.set(...entry);
            if(argArguments !== _NOTDEF && argArguments && argArguments.length)
                uiElementArgs.push(...argArguments);
        }
        return [ // widgetDefinition
            Object.fromEntries(settings) // settings object
          , Array.from(dependencyMap) // dependencyMappings array
          , UIElement
          , ...uiElementArgs
        ];
    }
    _defineGenericWidgets(TypeClass, isAllowedFieldName, generalSettings, propertyRootOrPPSMap
            , injectable/*{getDefault, updateDefaultsDependencies, requireUpdateDefaults}*/
            ) {
        const resultWidgets = []
          ,  processedPropertiesSystemMap = typeof propertyRootOrPPSMap === 'string'
                ? ProcessedPropertiesSystemMap.fromPrefix(propertyRootOrPPSMap, TypeClass.fields.keys(), isAllowedFieldName)
                : propertyRootOrPPSMap
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
                // Amend the error message with more details.
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
    };
}

// Backward compatible: the original class is just the mixin applied to _BaseContainerComponent
export class _BaseTypeDrivenContainerComponent extends _BaseTypeDrivenContainerComponentMixin(_BaseContainerComponent) {
}

// UITypeDrivenListItem: a list item that renders type-driven widgets
// for a fixed-type list model (e.g., CharGroupsListModel).
export class UITypeDrivenListItem extends _BaseTypeDrivenContainerComponentMixin(_UIBaseListContainerItem) {
    static TYPE_CLASS_PART = 'type_driven';

    get TypeClass() {
        if(!this._TypeClass) {
            const entry = this.widgetBus.getEntry(this.widgetBus.rootPath);
            this._TypeClass = entry.constructor;
        }
        return this._TypeClass;
    }
    _getInstanceBaseClasses() {
        return [`type_driven-type-${deCamelize(this.TypeClass.name)}`];
    }

    constructor(widgetBus, _zones, ppsRecord, eventHandlers=[], draggable=false, deletable=false, injectable=null, transferTypePath=null) {
        super(widgetBus, _zones, eventHandlers, draggable, deletable);

        if(!(ppsRecord  instanceof ProcessedPropertiesSystemRecord))
            throw new Error(`UITypeDrivenListItem ${this.constructor.name} ppsRecord is not a ProcessedPropertiesSystemRecord!`);

        this._injectable = injectable;
        this._ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;
        const TypeClass = this.TypeClass
          , generalSettings =  {zone: 'local'}
          , widgets = []
          ;

        if(this._injectable.genericTypeToUIElement(TypeClass, null) !== null) {
            const config = this._defineGenericWidget(this._injectable, generalSettings
                        , ppsRecord, ppsRecord.modelFieldName, TypeClass);
            config[0].rootPath = this.widgetBus.rootPath;
            widgets.push(config);
        }
        else {
            const ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                ppsRecord.propertyRoot, TypeClass.fields.keys());
            widgets.push(
                ...this._defineGenericWidgets(
                      TypeClass
                    , fieldName=>TypeClass.fields.has(fieldName)
                    , generalSettings
                    , ppsMap
                    , this._injectable
                )
            );
        }
        this._initWidgets(widgets);
    }
}

// UITypeDrivenList: a generic list container for fixed-type list models.
// DnD types are derived from the item model via getTransferTypesForModel.
export class UITypeDrivenList extends _UIBaseList {
    static ROOT_CLASS = `ui_type_driven-list`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UITypeDrivenListItem;

    get TypeClass() {
        if(!this._TypeClass) {
            const items = this.widgetBus.getEntry('collection')
            this._TypeClass = items.constructor;
        }
        return this._TypeClass;
    }
    _getInstanceBaseClasses() {
        return [`type_driven-type-${deCamelize(this.TypeClass.name)}`,
          `type_driven-items_type-${deCamelize(this.TypeClass.Model.name)}`,
        ];
    }
    constructor(widgetBus, _zones, injectable, propertyRoot, label=null,
            UIItem=null, itemsDragable=true, itemsDeletable=false) {
        const labelElement = label
                ? widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label)
                : null
          , childrenMainZoneElement = widgetBus.domTool.createElement('div', {})
          , zones = new Map([..._zones, ['main', childrenMainZoneElement]])
          ;
        super(widgetBus, zones, 'main', UIItem, itemsDragable, itemsDeletable);
        const ItemModel = this.TypeClass.Model
          , transferTypes = getTransferTypesForModel(ItemModel)
          ;

        if(typeof propertyRoot !== 'string')
            throw new Error(`UITypeDrivenList ${this} propertyRoot is not a string!`);

        this._propertyRoot = propertyRoot;

        if(label)
            this.element.append(labelElement);
        this.element.append(childrenMainZoneElement);

        this._setClassesHelper([
                ...(label ? [[labelElement, 'label']] : [])
              , [childrenMainZoneElement, 'items']
        ]);

        this._injectable = injectable;
        this._transferTypes = transferTypes;
        this._ItemModel = ItemModel;
    }

    /* For better extensibility get the ITEM args from a function that
     * can be overridden.
     */
    _getItemArgs(rootPath, dropEventHandlers, draggable, deletable) {
        return [
                ...this._zonesArgs
              , ProcessedPropertiesSystemMap.createSimpleRecord(this._propertyRoot, rootPath.parts.at(-1))
                // the following are both optional in the default child,
                // so if we require mandatory arguments they should be
                // injected here, before.
               , dropEventHandlers, draggable, deletable
               // extra arguments, optional..
               , this._injectable
               , this._transferTypes.PATH
        ];
    }


    get ITEM_DATA_TRANSFER_TYPE_PATH() {
        return this._transferTypes.PATH;
    }

    get ITEM_DATA_TRANSFER_TYPE_CREATE() {
        return this._transferTypes.CREATE;
    }

    _createNewItem(targetPath, insertPosition, items/*, value*/) {
        return this._ItemModel.createPrimalDraft(items.dependencies);
    }
}

export class UITypeDrivenContainer extends _BaseTypeDrivenContainerComponent {
    get TypeClass() {
        if(!this._TypeClass) {
            const entry = this.widgetBus.getEntry(this.widgetBus.rootPath);
            this._TypeClass = entry instanceof _AbstractDynamicStructModel
                    ? entry.WrappedType
                    : entry.constructor
                    ;
        }
        return this._TypeClass;
    }
    getInstanceBaseClasses() {
        return [`type_driven-type-${deCamelize(this.TypeClass.name)}`];
    }
    constructor(widgetBus, _zones, injectable, ppsMap, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_generic_struct_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        const TypeClass = this.TypeClass
          , widgets = this._defineWidgets(TypeClass, injectable, ppsMap, label)
          ;
        this._initWidgets(widgets);
    }
    _defineWidgets(TypeClass, injectable, ppsMap, label) {
        const labelDefinition = [
                {zone: 'local'}
              , []
              , StaticTag
              , 'h4'
              , {}
              , [label]
            ];
        return [
            ...(label ? [labelDefinition] : [])
          , ...this._defineGenericWidgets(
                    TypeClass
                  , fieldName=>TypeClass.fields.has(fieldName) // all allowed
                  , {zone: 'local'}
                  , ppsMap
                  , injectable
            )
        ];
    }
}

// UITypeDrivenListWithAddButton: wraps UITypeDrivenList with an "add" button.
// Subclass per use-case to set ADD_BUTTON_TEXT.
export class UITypeDrivenListWithAddButton extends UITypeDrivenList {
    static ADD_BUTTON_TEXT = '+ add';
    constructor(widgetBus, _zones, injectable, propertyRoot, label=null,
            addButtonText=null, UIItem=null, itemsDragable=true, itemsDeletable=false) {
        super(widgetBus, _zones, injectable, propertyRoot, label, UIItem, itemsDragable, itemsDeletable);
        const addButton = widgetBus.domTool.createElement('button'
                , {'class': 'ui_type_driven_list-add_button'}
                , addButtonText === null ? this.constructor.ADD_BUTTON_TEXT : addButtonText);
        addButton.addEventListener('click', ()=>{
            const rootPath = Path.fromString(this.widgetBus.getExternalName('collection'));
            this._create(rootPath, 'insert', null);
        });
        this.element.append(addButton);
    }
}

export function createTypeToUIElementFunction(uiElementsMap
                            , orEmptyUIElementsMap, cascadeFn=_NOTDEF) {
    return function(ModelType, defaultVal=_NOTDEF) {
        // create some aliases ...
        for(const [alias, source] of [[BooleanDefaultTrueModel, BooleanModel]]){
            for(const elementsMap of [uiElementsMap, orEmptyUIElementsMap])
                if(!elementsMap.has(alias) && elementsMap.has(source))
                    elementsMap.set(alias, elementsMap.get(source));
        }
        const isOrEmpty = ModelType.prototype instanceof _AbstractSimpleOrEmptyModel
          , [setupMap, BaseModelType] = isOrEmpty
               ? [orEmptyUIElementsMap, ModelType.Model]
               : [uiElementsMap, ModelType]
          , getSetupKey = BaseModelType=>{
                if(setupMap.has(BaseModelType))
                    return BaseModelType
                for( const abstractType of [_AbstractNumberModel, _AbstractEnumModel, _AbstractDynamicStructModel])
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
            if(cascadeFn !== _NOTDEF)
                return cascadeFn(ModelType, defaultVal);
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
}
