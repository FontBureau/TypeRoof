/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    FreezableMap
} from '../../metamodel.mjs';

import {
    TextAlignmentModel
  , CSSPositioningHorizontalModel
  , CSSPositioningVerticalModel
  , CSSDirectionModel
  , HeightTreatmentModel
} from './models.mjs';

import {
    parse as culoriParse
} from '../../vendor/culori/bundled/culori.mjs';

function _frozenMapFromObject(obj) {
    return Object.freeze(
        new FreezableMap(
            Object.entries(obj)
                  .map(([k, v])=>[k, Object.freeze(v)])
        )
    );
}

export const REGISTERED_PROPERTIES = Object.freeze({
    NUMERIC: _frozenMapFromObject({
        x: {'default': 0, inherit: false}
      , y: {'default': 0, inherit: false}
      , 'z-index': {'default': 0, step: 1, inherit: false}
      , r: {name: 'Radius', min: 0, 'default': 0, inherit: true}
      , t: {name: 'Children Time', 'default': 0, inherit: true}
      , width: {'default': 0, inherit: false}  // default should be 'inherit' ;-)
      , height: {'default': 0, inherit: false} // default should be 'inherit' ;-)
    })

    // This is interesting!
    // As a default text in black background in white is super common.
    // However, depending on the context, we don't want to apply these
    // colors all the time e.g.:
    //  default backgroundColor
    //          stage: is good
    //          lineOfText: no background color/transparent is good
    //  default textColor:
    //          stage: is good
    //          lineOfText: should inherit first, if there's no inherited
    //              value default would be good to activeley set no color,
    //              alpha channel transparency shold be used no color at
    //              all is not an option, also as it would use whatever
    //              a parent in CSS has. however, since Stage has a default
    //              textColor, that would be inherited.
    //              In this case, if we don't inherit a textColor we
    //              should even raise an error.
    // Currently (so far only in Stage) if 'default' returns a falsy value,
    // the css property is removed, and there's no faly default value.
    // Maybe that detail can be handled differently.
  , COLOR: _frozenMapFromObject({
        textColor: {
            inherit: true
          , label: 'Text Color'
            /* black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none)'))
        }
      , backgroundColor: {
            inherit: false
          , label: 'Background Color'
            /* white */
          , 'default': Object.freeze(culoriParse('oklch(100% 0 none)'))
        }
      , strokeColor: {
            inherit: false
          , label: 'Stroke Color'
            /* transparent black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none 0%)'))
        }
      , fillColor: {
            inherit: false
          , label: 'Fill Color'
            /* black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none)'))
        }
    })
  , GENERIC: _frozenMapFromObject({
        textRun: {
            inherit: true
          , label: 'Text Content'
          , 'default': '' // <= StringModel can have a defaultValue!
        }
      , textAlign: {
            inherit: true
          , label: 'Text Align'
          , 'default': TextAlignmentModel.defaultValue
        }
      , positioningHorizontal: {
            inherit: true
          , label: 'Positioning-X'
          , 'default': CSSPositioningHorizontalModel.defaultValue
        }
      , positioningVertical: {
            inherit: true
          , label: 'Positioning-Y'
          , 'default': CSSPositioningVerticalModel.defaultValue
        }
      , direction: {
            inherit: true
          , label: 'Direction'
          , 'default': CSSDirectionModel.defaultValue
        }
      , heightTreatment: {
            inherit: true
          , label: 'Height Fixes'
          , 'default': HeightTreatmentModel.defaultValue
        }
      , charGroup: {
            inherit: true
          , label: 'Glyphs'
          // The used Model, depending on the used char-groups-data module
          // will be used to set the default value. However, this setting
          // would still take precedence. At this point it is not defined
          // what the available value are, as char-groups-data may
          // be a subject of customization in the future and then different
          // modules would get injected into/loaded by the app (somehow).
          // , 'default':
      }
    })
});


const _NOTDEF = Symbol('_NOTDEF'); // exported via getRegiseredPropertySetup
export function getRegisteredPropertySetup(propertyName, defaultVal=_NOTDEF){
    for(const [prefix, PROPERTIES_KEY] of [
                    ['numericProperties/', 'NUMERIC']
                  , ['colors/', 'COLOR']
                  , ['generic/', 'GENERIC']
            ]){
        if(propertyName.startsWith(prefix)) {
            const name = propertyName.slice(prefix.length);
            if(REGISTERED_PROPERTIES[PROPERTIES_KEY].has(name))
                return REGISTERED_PROPERTIES[PROPERTIES_KEY].get(name);
        }
    }
    if(defaultVal !== _NOTDEF)
        return defaultVal;
    throw new Error(`KEY ERROR don't know how to get registered property setup "${propertyName}".`);
}
getRegisteredPropertySetup.NOTDEF = _NOTDEF;

