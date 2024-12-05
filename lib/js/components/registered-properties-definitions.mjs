
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
