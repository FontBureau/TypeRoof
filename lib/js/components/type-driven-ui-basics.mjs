

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

export function _BaseTypeDrivenContainerComponentMixin(Base) {
    return class extends Base {
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
            // this is probably one of the more versatile ideas
            case "settings:@set":
                settings.set(...parameter.payload);
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
            case "injectable":
                // NOTE: this is experimental, can't say if it will
                // work like that!!!
                argument = injectable;
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
            case "genericTypeToUIElement":
                argument = injectable.genericTypeToUIElement
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
                argument = getRegisteredPropertySetup(ppsRecord, {});
                break;
            case "label":
                argument = getRegisteredPropertySetup(ppsRecord, {label:fieldName}).label || fieldName;
                break;
            case "unit":
                argument = getRegisteredPropertySetup(ppsRecord, {unit:''}).unit || '';
                break;
            case "propertyRoot":
                // interesting one! here it is feeding into an instance of itself
                //  propertyRoot = `${ppsRecord.fullKey}/`;
                argument = ppsRecord.propertyRoot
                break;
            case "ppsRecord":
                argument = ppsRecord;
                break;
            case "ppsMap":
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
                    argument = getLineWidthLeadingPPSMap(ppsRecord, BaseModelType);
                else if(injectable.getPPSMapForModel)
                    argument = injectable.getPPSMapForModel(ppsRecord, BaseModelType);
                else {
                    console.warn(`${this} don't know how to get a PPSMap for ${BaseModelType.name} in ${ppsRecord}`);
                    argument = new ProcessedPropertiesSystemMap();
                }
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
                throw new Error(`KEY ERROR ${this}._getArgumentConfig `
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
        const elementTypeConfig = injectable.genericTypeToUIElement(FieldType);
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
                for(const entry of argSettings) {
                    if(entry[0] === 'rootPath' && settings.has('rootPath')) {
                        // _getArgumentConfig will configure a relative
                        // rootPath... ideally this should be done in
                        // _getArgumentConfig.
                        entry[1] = settings.get('rootPath').append(...entry[1].parts);
                    }
                    settings.set(...entry);
                }
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

    constructor(widgetBus, _zones, eventHandlers=[], draggable=false, injectable=null, transferTypePath=null) {
        super(widgetBus, _zones, eventHandlers, draggable);
        this._injectable = injectable;
        this.ITEM_DATA_TRANSFER_TYPE_PATH = transferTypePath;

        const entry = this.widgetBus.getEntry(this.widgetBus.rootPath)
          , TypeClass = entry.constructor
          , propertyRoot = this.widgetBus.rootPath.toString()
          , ppsMap = ProcessedPropertiesSystemMap.fromPrefix(
                propertyRoot, TypeClass.fields.keys())
          , widgets = [
                ...this._defineGenericWidgets(
                      TypeClass
                    , fieldName=>TypeClass.fields.has(fieldName)
                    , {zone: 'local'}
                    , ppsMap
                    , this._injectable
                )
            ]
          ;
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

    constructor(widgetBus, _zones, injectable, label=null) {
        const items = widgetBus.getEntry('collection')
          , ItemModel = items.constructor.Model
          , transferTypes = getTransferTypesForModel(ItemModel)
          ;

        const labelElement = label
                ? widgetBus.domTool.createElement('span', {'class': 'typeroof-ui-label'}, label)
                : null
          , childrensMainZoneElement = widgetBus.domTool.createElement('div', {})
          , localZoneElement = widgetBus.domTool.createElement('div', {}, [])
          , zones = new Map([..._zones, ['local', localZoneElement], ['main', childrensMainZoneElement]])
          ;
        localZoneElement.append(childrensMainZoneElement);
        super(widgetBus, zones, 'main');

        if(label)
            this.element.append(labelElement);
        this.element.append(childrensMainZoneElement);

        this._setClassesHelper([
                ...(label ? [[labelElement, 'label']] : [])
              , [childrensMainZoneElement, 'items']
        ]);

        this._injectable = injectable;
        this._transferTypes = transferTypes;
        this._ItemModel = ItemModel;
        this.itemExtraArguments = [
                this._injectable
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
    constructor(widgetBus, _zones, injectable, ppsMap, label) {
        const localZoneElement = widgetBus.domTool.createElement('div', {'class': 'ui_generic_struct_container'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        widgetBus.insertElement(localZoneElement);
        super(widgetBus, zones);

        const entry = this.widgetBus.getEntry(this.widgetBus.rootPath)
          , TypeClass = entry instanceof _AbstractDynamicStructModel
                ? entry.WrappedType
                : entry.constructor
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
                  , fieldName=>TypeClass.fields.has(fieldName)
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
    constructor(widgetBus, _zones, injectable, label=null) {
        super(widgetBus, _zones, injectable, label);
        const addButton = widgetBus.domTool.createElement('button'
                , {'class': 'ui_type_driven_list-add_button'}
                , this.constructor.ADD_BUTTON_TEXT);
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
