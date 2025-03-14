/**
 * The aim for this module is to not have many specific dependencies, it's
 * rather itself a dependency.
 * The reason for this was a circular dependency caused by registered-properties.mjs
 */

import {
    FreezableMap
  , _AbstractSimpleOrEmptyModel
  , _BaseSimpleModel
  , _BaseContainerModel
} from '../metamodel.mjs';

export const NUMERIC = 'numericProperties/'
  , COLOR = 'colors/'
  , GENERIC = 'generic/'
    // SPECIFIC doesen't have a default value in getFromRegistry/getRegisteredPropertySetup
    // The fallback value must come from the caller. Could maybe also be
    // DYNAMIC = 'dynamic/', but then GENERIC should maybe rather be STATIC?
  , SPECIFIC = 'specific/'
  , LEADING = 'leading/'
  , SYMBOLIC_TO_PREFIXES =  Object.freeze(new FreezableMap(Object.entries({NUMERIC, COLOR, GENERIC, SPECIFIC, LEADING})))
  , PREFIXES_TO_SYMBOLIC =  Object.freeze(new FreezableMap(Array.from(SYMBOLIC_TO_PREFIXES).map(entry=>entry.reverse())))
  ;

const _NOTDEF = Symbol('_NOTDEF'); // exported via getRegisteredPropertySetup

function _getPrefixAndName(propertyIdentifier) {
    if(propertyIdentifier instanceof ProcessedPropertiesSystemRecord) {
        return propertyIdentifier.registryCredentials;
    }
    else if(typeof propertyIdentifier === 'string') {
        const prefix = propertyIdentifier.split('/').at(0) + '/'
            // NOTE: how name can contain slashes!
          , name = propertyIdentifier.slice(prefix.length)
          ;
        return [prefix, name];
    }
    else
        throw new Error(`TYPE ERROR propertyIdentifier must be a string or a ProcessedPropertiesSystemRecord: ${propertyIdentifier}`);
}

export function getFromRegistry(REGISTRY, propertyIdentifier, defaultVal=_NOTDEF) {
    const [prefix, name] = _getPrefixAndName(propertyIdentifier);
    if(prefix in REGISTRY && PREFIXES_TO_SYMBOLIC.has(prefix)) {
        const PROPERTIES = REGISTRY[prefix];
        if(PROPERTIES.has(name))
            return PROPERTIES.get(name);
    }
    if(defaultVal !== _NOTDEF)
        return defaultVal;
    throw new Error(`KEY ERROR don't know how to get registered property setup "${propertyIdentifier}".`);
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
        return `<${this.constructor.name} ${this.fullKey} ${this.registryCredentials.join(',')}>`
    }

    // propertyRoot may be used in a hierarchy, e.g. locate/reference
    // a value relative to its parent e.g.
    //  fullKey = `${parentPPSRecord.propertyRoot}${ownName}`
    get propertyRoot() {
        return `${this.fullKey}/`;
    }

    // This is to get the default setup, label etc. from the registry
    // it's not necessarily the same as [this.prefix, this.modelFieldName]
    // Because different values/instances can use the same setup.
    get registryCredentials() {
        return [this.prefix, this.registryKey !== null ? this.registryKey : this.modelFieldName];
    }
}

// possibly, we could access the defaults via this!
export class ProcessedPropertiesSystemMap extends FreezableMap {
    constructor(iter) {
        super();
        if(iter) {
            for(const entry of iter) {
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
    static createSimpleRecord(propertyRoot, fieldName, fullKey=null, registryKey=null) {
        return new ProcessedPropertiesSystemRecord({
                // This is mostly to identify the registry
                // BUT double use is to read e.g. complex values from
                // a propertiesMap. There's a good chance that the double
                // use will collide at some point and has to be refined.
                prefix: propertyRoot
                // NOTE: here we could make a re-mapping!
                // THIS is the key that will be in the propertiesMap.
                // we either use it to read an inherited default OR
                // we use it to yield the value into the own propertiesMap
                // CAUTION: the yield part is not implemented!
              , fullKey: fullKey !== null ? fullKey : `${propertyRoot}${fieldName}`
              // this may not be required at all?
              // However, we use it a lot. It's used as a default for
              // many cases in here, e.g. registryKey falls back to this,
              // fullKey incudes this in the fallback.
              , modelFieldName: fieldName
              , registryKey: registryKey
        });
    }
}

/* Could be in another module, but it's not a too bad fit either.
 *
 * A broom wagon is a vehicle that follows a cycling road race "sweeping"
 * up stragglers who are unable to make it to the finish within the time
 * permitted. If a cyclist chooses to continue behind the broom wagon,
 * they cease to be part of the convoy, and must then follow the usual
 * traffic rules and laws. (Wikipedia)
 */
export function* childrenPropertiesBroomWagonGen(prefix, path, item) {
    if(item instanceof _AbstractSimpleOrEmptyModel && item.isEmpty)
        return;
    if(item instanceof _BaseSimpleModel) {
        yield [`${prefix}${path.join('/')}`, item.value];
        return;
    }
    if(item instanceof _BaseContainerModel) {
        for(const [fieldName, childItem] of item) {
            const childPath = Object.freeze(path.concat(fieldName));
            yield* childrenPropertiesBroomWagonGen(prefix, childPath, childItem);
        }
        return;
    }
    throw new Error(`VALUE ERROR don't know how to handle item: "{item.toString()}" at prefix+path: ${prefix}${path};`);
}
