

import {
    deCamelize
} from '../util.mjs';

import {
    Path
} from '../metamodel.mjs';

import {
    _BaseContainerComponent
} from './basics.mjs';

import {
    getRegisteredPropertySetup
} from './registered-properties.mjs';


import {
    ProcessedPropertiesSystemMap,
} from './registered-properties-definitions.mjs';

import {
     LineWidthLeadingModel
   , getLineWidthLeadingPPSMap
} from './type-spec-fundamentals.mjs';


export const _NOTDEF = Symbol('_NOTDEF');


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
                argument = getRegisteredPropertySetup(ppsRecord);
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
                // lines, stuf like that), that are not so much defined
                // by the type information...
                // so that _BaseTypeDrivenContainerComponent could truly
                // build all kind of things.
                if(BaseModelType === LineWidthLeadingModel) {
                    argument = getLineWidthLeadingPPSMap(ppsRecord, BaseModelType);
                }
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
}
