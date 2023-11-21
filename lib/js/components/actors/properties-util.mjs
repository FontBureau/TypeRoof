/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    getColorFromPropertyValuesMap
} from '../color.mjs';

import {
    formatCss as culoriFormatCss
} from '../../vendor/culori/bundled/culori.mjs';

// FIXME: skipFontSize is a temprary botch to make videoproof-array
// work, preventing that the css font-size property is removed.
// It'll require a better solution for this kind of control. An
// allow-list of properties this functuion can control could be an option
// or splitting this into two or more functions.
export function setTypographicPropertiesToSample(sample, propertyValuesMap, skipFontSize=false) {
    const axisPrefix = 'axesLocations/';

    if(skipFontSize === false){
        if((propertyValuesMap.has('fontSize')))
            sample.style.setProperty('font-size', `${propertyValuesMap.get('fontSize')}pt`);
        else
            sample.style.removeProperty('font-size');
    }
    const variations = [];
    for(const [key, value] of propertyValuesMap) {
        if(!key.startsWith(axisPrefix))
            continue;
        const axisTag = key.slice(axisPrefix.length);
        variations.push(`"${axisTag}" ${value}`);
    }
    // FIXME: maybe set only existing axes and only to valid ranges?
    // inherited axesLocations would set anything here. However,
    // the font rendering inherently also doesn't fail.
    sample.style.setProperty('font-variation-settings', variations.join(','));
}


export function actorApplyCSSColors(element, propertyValuesMap, getDefault, colorPropertiesMap) {
    for(const [propertyName, cssPropertyName] of colorPropertiesMap) {
        const [color_, ] = getColorFromPropertyValuesMap(propertyName, propertyValuesMap, [null])
          , color = color_ !== null
                    ? color_
                    : getDefault(propertyName)
          ;
        if(color) {
            const cssColor = culoriFormatCss(color);
            element.style.setProperty(cssPropertyName, cssColor);
        }
        else
            element.style.removeProperty(cssPropertyName);
    }
}

export const DYNAMIC_MARKER = Symbol('DYNAMIC_MARKER');
export function getPropertyValue(propertyValuesMap, getDefault, fullKey) {
    return propertyValuesMap.has(fullKey)
            ? [true, propertyValuesMap.get(fullKey)]
            : getDefault(fullKey)
            ;
}

function* _massagePropertyData(propertyValuesMap, getDefault, propertyDescription) {
    const [fullKey, dynamicFullKey, propertyExpanderOrUnit, ...rest] = propertyDescription
      , [, cssProperty] = getPropertyValue(propertyValuesMap, getDefault, dynamicFullKey)
      ;
    if(typeof propertyExpanderOrUnit !== 'function') {
        // propertyExpander is the "unit"
        yield [fullKey, cssProperty, propertyExpanderOrUnit, ...rest];
    }
    else {
        for(const cssProperty_ of propertyExpanderOrUnit(cssProperty))
            yield [fullKey, cssProperty_, ...rest];
    }
}

function _actorApplyCssProperty (element, propertyValuesMap, getDefault, propertyData) {
    const [fullKey, cssProperty, unit, cleanFn] = propertyData
      , [useUnit, value] = getPropertyValue(propertyValuesMap, getDefault, fullKey)
      ;
    if(typeof cssProperty === 'function')
        // setter function
        cssProperty(element, value, propertyValuesMap, getDefault, useUnit);
    else
        element.style.setProperty(cssProperty, `${cleanFn ? cleanFn(value) : value}${useUnit ? unit : ''}`);
}

export function actorApplyCssProperties(element, propertyValuesMap, getDefault, propertyDescriptions) {
    var stack = [...propertyDescriptions];
    while(stack.length) {
        const propertyDescription = stack.pop();
        if(propertyDescription[0] !== DYNAMIC_MARKER)
            _actorApplyCssProperty(element, propertyValuesMap, getDefault, propertyDescription);
        else
            stack.push(..._massagePropertyData(propertyValuesMap, getDefault
                                             , propertyDescription.slice(1)));
    }
}

/** propertyExpander **/
export function cssPositioningHorizontalPropertyExpander(cssProperty) {
    return cssProperty === 'both' ? ['left', 'right'] : [cssProperty];
}
