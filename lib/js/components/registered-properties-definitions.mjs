
import {
    FreezableMap
} from '../metamodel.mjs';

export const NUMERIC = 'numericProperties/'
  , COLOR = 'colors/'
  , GENERIC = 'generic/'
  , SYMBOLIC_TO_PREFIXES =  Object.freeze(new FreezableMap(Object.entries({NUMERIC, COLOR, GENERIC})))
  , PREFIXES_TO_SYMBOLIC =  Object.freeze(new FreezableMap(Array.from(SYMBOLIC_TO_PREFIXES).map(entry=>entry.reverse())))
  ;

const _NOTDEF = Symbol('_NOTDEF'); // exported via getRegisteredPropertySetup
export function getFromRegistry(REGISTRY, propertyName, defaultVal=_NOTDEF) {
    const prefix = propertyName.split('/').at(0) + '/';
    if(prefix in REGISTRY && PREFIXES_TO_SYMBOLIC.has(prefix)) {
        const PROPERTIES = REGISTRY[prefix]
          , name = propertyName.slice(prefix.length)
          ;
        if(PROPERTIES.has(name))
            return PROPERTIES.get(name);
    }
    if(defaultVal !== _NOTDEF)
        return defaultVal;
    throw new Error(`KEY ERROR don't know how to get registered property setup "${propertyName}".`);
}
getFromRegistry.NOTDEF = _NOTDEF;


/**
 * Using these classes (ProcessedPropertiesSystem) seems convoulted
 * however, there's an upcoming concept where we have a strict
 * differentiation between ModelSystem and ProcessedPropertiesSystem and
 * this is making the mapping between those two systems explicit.
 * The older praxis of putting the modelFieldName into the defaults and
 * to the target scales not well. However, the default behavior is almost
 * the same. Having these classes used all over makes it easier to track
 * where names should be ProcessedPropertiesSystem-Names and not ModelSystem-Names.
 *
 * FIXME: Especially the property generators feeding into AnimationLiveProperties
 * do not yet support this mapping!
 */
const _PPS_ENTRY_MARKER = Symbol('_PROCESSED_PROPERTIES_SYSTEMPPS_ENTRY_MARKER');
export class ProcessedPropertiesSystemRecord {
    constructor(props) {
        // this is a stub!
        Object.assign(this, props)
    }

    // only until it is fully integrated.
    get [_PPS_ENTRY_MARKER]() {
        return true;
    }
    toString() {
        return `<${this.constructor.name} ${this.fullKey}>`
    }
}

// possibly, we could access the defaults via this!
export class ProcessedPropertiesSystemMap extends Map {
    constructor(iter) {
        super();
        if(iter) {
            for(const entry of iter){
                console.log('entry', entry);
                this.set(...entry);
            }
        }
    }
    static fromPrefix(propertyRoot, fieldsKeys, isAllowedFieldName=null) {
        const result = new this();
        for(const fieldName of fieldsKeys) {
            if(isAllowedFieldName && !isAllowedFieldName(fieldName))
                continue;
            result.set(fieldName, this.createSimpleRecord(propertyRoot, fieldName));
        }
        return result;
    }
    get(key) {
        if(!this.has(key))
            throw new Error(`KEY ERROR ${this} missing entry for "${key}".`);
        return super.get(key);
    }
    set(key, ppsRecord) {
        if(!(ppsRecord instanceof ProcessedPropertiesSystemRecord))
            throw new Error(`VALUE ERROR ${this} ppsRecord for key "${key}" must be ProcessedPropertiesSystemRecord but got ${ppsRecord}.`);
        super.set(key, ppsRecord);
    }
    toString() {
        return `[${this.constructor.name}]`;
    }
    // Create a ppsRecord on the fly. Hopefully temporary until
    // everything is figured out!!! :-D
    static createSimpleRecord(propertyRoot, fieldName) {
        return new ProcessedPropertiesSystemRecord({
                prefix: propertyRoot
                // NOTE: here we could make a re-mapping!
              , fullKey: `${propertyRoot}${fieldName}`
              // this may not be required at all
              , modelFieldName: fieldName
        });
    }
}