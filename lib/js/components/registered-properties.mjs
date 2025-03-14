/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    FreezableMap
} from '../metamodel.mjs';

import {
    deepFreeze
} from '../util.mjs';

import {
    NUMERIC
  , COLOR
  , GENERIC
  , LEADING
  , SYMBOLIC_TO_PREFIXES
  , getFromRegistry
} from './registered-properties-definitions.mjs';

import {
    TextAlignmentModel
  , CSSPositioningHorizontalModel
  , CSSPositioningVerticalModel
  , CSSDirectionModel
  , HeightTreatmentModel
} from './actors/models.mjs';

import {
    parse as culoriParseRaw
} from '../vendor/culori/bundled/culori.mjs';

import {
    LeadingNumberModel
} from './type-spec-fundamentals.mjs';

function culoriParse(...args){
    const result = culoriParseRaw(...args);
    if(result === undefined)
        throw new Error(`VALUE ERROR culori parse returned undefined for input: ${args.join(', ')}`);
    return result;
}

function _frozenMapFromObject(obj) {
    return Object.freeze(
        new FreezableMap(
            Object.entries(obj)
                  .map(([k, v])=>[k, Object.freeze(v)])
        )
    );
}

export const REGISTERED_PROPERTIES = {
    [NUMERIC]: _frozenMapFromObject({
        x: {'default': 0, inherit: false}
      , y: {'default': 0, inherit: false}
      , 'z-index': {'default': 0, step: 1, inherit: false}
      , r: {name: 'Radius', min: 0, 'default': 0, inherit: true}
      , t: {name: 'Children Time', 'default': 0, inherit: true}
      , width: {'default': 0, inherit: false}  // default should be 'inherit' ;-)
      , height: {'default': 0, inherit: false} // default should be 'inherit' ;-)
      , 'line-height-em': {'default': 1.3, inherit: true}
      , scale: {'default': 1, inherit: false}
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
  , [COLOR]: _frozenMapFromObject({
        textColor: {
            inherit: true
          , label: 'Text Color'
            /* black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none)'))
        }
      , backgroundColor: {
            inherit: false
          , label: 'Background Color'
            /* transparent white */
          , 'default': Object.freeze(culoriParse('oklch(100% 0 none / 0%)'))
        }
      , stageBackgroundColor:{
            inherit: false
          , label: 'Background Color'
            /* white */
          , 'default': Object.freeze(culoriParse('oklch(100% 0 none)'))
        }
      , strokeColor: {
            inherit: false
          , label: 'Stroke Color'
            /* transparent black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none / 0%)'))
        }
      , fillColor: {
            inherit: false
          , label: 'Fill Color'
            /* black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none)'))
        }
    })
  , [LEADING]: _frozenMapFromObject({
        leading: {
            inherit: true
          , label: 'Leading'
          , 'default': deepFreeze({
              //   leadingAlgorithmTypeKey:"ManualLeading"
              // , instance: 123
                leadingAlgorithmTypeKey:"AutoLinearLeading"
              , instance: {
                    a: {
                        lineWidth: 33
                      , leading: 1.1
                    }
                  , b: {
                        lineWidth: 65
                      , leading: 1.3
                    }
                  , minLeading: 1.1
                  , maxLeading: 2
                }
            })
        }
      // This is used via UILeadingAlgorithm to provide a
      // property independent, i.e. bound to the type not the property,
      // default. The definition is however so far the same as
      // ${LEADING}leading, which maybe could reuse this by some kind of
      // reference/linking mechanism.
      // the @ as a prefix is used to make sure this doesn't refer to
      // a regular property, not sure if required like that or overthinking.
      , '@AutoLinearLeading': {
            'default': deepFreeze({
                leadingAlgorithmTypeKey:"AutoLinearLeading"
              , instance: {
                    a: {
                        lineWidth: 33
                      , leading: 1.1
                    }
                  , b: {
                        lineWidth: 65
                      , leading: 1.3
                    }
                  , minLeading: 1.1
                  , maxLeading: 2
                }
            })
        }
    })
  , [GENERIC]: _frozenMapFromObject({
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
      , showCellBoxes: {
            inherit: true
          , label: 'Show Cell Boxes'
          , 'default': false
        }
      , cellAlignment: {
            inherit: true
          , label: 'Cell Alignment'
          , 'default': 'center'
        }
      , fontSize: {
            inherit: true
          , label: 'Font-Size'
          , unit: 'px' // ??? why not PT??
          , 'default': 36
          , min:0
            // used for the UI not for the actual number type
          , step:0.01
        }
      , baseFontSize: {
            inherit: true
          , label: 'Base Font-Size'
          , unit: 'pt'
          , 'default': 12
          , min:0
            // used for the UI not for the actual number type
          , step:0.01
        }
      , relativeFontSize: {
            inherit: true
          , label: 'Relative Font-Size'
          // , unit: 'pt' none
          , 'default': 1
          , min:0
            // used for the UI not for the actual number type
          , step:0.01
        }
      , columnWidth: {
            inherit: true
          , label: 'Column Width'
          , unit: 'EN'
          , 'default': 40
          , min: 0
          , step: 0.1
          , max: 160 // Not a huge fan of this but its good for slider interfaces
        }
      , leading: {
            inherit: true
          , label: 'Leading Value'
          , unit: 'EM'
          , step: 0.01
          , ...LeadingNumberModel.ppsDefaultSettings
        }
      , minLeading: {
           inherit: true
          , label: 'Min-Leading Value'
          , unit: 'EM'
          , step: 0.01
          , ...LeadingNumberModel.ppsDefaultSettings
        }
      , maxLeading: {
           inherit: true
          , label: 'Max-Leading Value'
          , unit: 'EM'
          , step: 0.01
          , ...LeadingNumberModel.ppsDefaultSettings
        }
      , lineWidth: {
            inherit: true
          , label: 'Line-Width'
          , unit: 'EM'
          , step: 0.01
        }
    })
};

// Adds the keys {"NUMERIC": "numericProperties/", ...}
// but I'm not sure it is required to have that.
Object.assign(REGISTERED_PROPERTIES, Object.fromEntries(SYMBOLIC_TO_PREFIXES));
Object.freeze(REGISTERED_PROPERTIES);

export const getRegisteredPropertySetup = getFromRegistry.bind(null, REGISTERED_PROPERTIES);
getRegisteredPropertySetup.NOTDEF = getFromRegistry.NOTDEF;


export function isInheritingPropertyFn(property) {
    if(property.startsWith(COLOR))
        property = property.split('/', 2).join('/');
    const setup = getRegisteredPropertySetup(property, {inherit: true});
    return setup.inherit === false ? false : true;
}

