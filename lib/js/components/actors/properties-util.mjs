/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    getColorFromPropertyValuesMap
} from '../color.mjs';

import {
    formatCss as culoriFormatCss
} from '../../vendor/culori/bundled/culori.mjs';

import {
    GENERIC
} from '../registered-properties-definitions.mjs'

// FIXME: skipFontSize is a temprary botch to make videoproof-array
// work, preventing that the css font-size property is removed.
// It'll require a better solution for this kind of control. An
// allow-list of properties this functuion can control could be an option
// or splitting this into two or more functions.
export function setTypographicPropertiesToSample(sample, propertyValuesMap, skipFontSize=false) {
    const axisPrefix = 'axesLocations/';
    if(skipFontSize === false) {
        if((propertyValuesMap.has(`${GENERIC}fontSize`)))
            sample.style.setProperty('font-size', `${propertyValuesMap.get(GENERIC + 'fontSize')}pt`);
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

export function getAxesLocations(propertyValuesMap) {
    const axisPrefix = 'axesLocations/';
    const variations = [];
    for(const [key, value] of propertyValuesMap) {
        if(!key.startsWith(axisPrefix))
            continue;
        const axisTag = key.slice(axisPrefix.length);
        variations.push([axisTag, value]);
    }
    return Object.fromEntries(variations);
}

export function actorApplyCSSColors(element, propertyValuesMap, getDefault, colorPropertiesMap) {
    for(const [propertyName, cssPropertyName] of colorPropertiesMap) {
        const [color_, ] = getColorFromPropertyValuesMap(propertyName, propertyValuesMap, [null])
          , [/*bool:useUnit*/ ,color] = color_ !== null
                    ? [, color_]
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

export const DYNAMIC_MARKER = Symbol('DYNAMIC_MARKER')
  , REMOVE_PROPERTY = Symbol('REMOVE_PROPERTY')
  ;
export function getPropertyValue(propertyValuesMap, getDefault, fullKey) {
    return propertyValuesMap.has(fullKey)
            ? [true, propertyValuesMap.get(fullKey)]
            : getDefault(fullKey)
            ;
}

const MUTUALLY_EXCLUSIVE_PROPERTIES = new Map();
for(const mutualExclusives of [
            ['left', 'right']
          , ['top', 'bottom']
        ]) {
    const mutualExclusivesSet = new Set(mutualExclusives);
    for(const propertyName of mutualExclusivesSet)
        MUTUALLY_EXCLUSIVE_PROPERTIES.set(propertyName, mutualExclusivesSet);
}
function* _massagePropertyData(propertyValuesMap, getDefault, propertyDescription) {
    const [fullKey, dynamicFullKey, propertyExpanderOrUnit, ...rest] = propertyDescription
      , [, cssProperty] = getPropertyValue(propertyValuesMap, getDefault, dynamicFullKey)
      ;

    // [              , fullKey, dynamicFullKey, propertyExpanderOrUnit]
    // [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', 'px']

    // This is not very elegant, because the left/right
    // top/bottom relationships are hardcoded, yet it it is simple and
    // it works.
    // setting 'top' requires to remove 'bottom'
    // setting 'left' requires to remove 'right' (if it is not 'both')
    // and vice versa.
    // if it is 'both', for the dynamicFullKey === 'generic/positionningHorizontal'
    // case 'left' and 'right' will be emitted after this test,
    // so these won't yield the REMOVE_PROPERTY.
    if(MUTUALLY_EXCLUSIVE_PROPERTIES.has(cssProperty)) {
        const mutualExclusives = MUTUALLY_EXCLUSIVE_PROPERTIES.get(cssProperty);
        for(const deleteProperty of mutualExclusives) {
             if(deleteProperty === cssProperty)
                continue;
            yield [REMOVE_PROPERTY, deleteProperty];
        }
    }
    if(typeof propertyExpanderOrUnit !== 'function') {
        // propertyExpander is the "unit"
        yield [fullKey, cssProperty, propertyExpanderOrUnit, ...rest];
    }
    else {
        // in this case it can be 'both', 'left', or 'right'
        // if it is not 'both' either 'left' or 'right' must be removed
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
        if(propertyDescription[0] === REMOVE_PROPERTY) {
            const [, cssProperty] = propertyDescription;
            element.style.removeProperty(cssProperty);
        }
        else if(propertyDescription[0] === DYNAMIC_MARKER)
            stack.push(..._massagePropertyData(propertyValuesMap, getDefault
                                             , propertyDescription.slice(1)));
        else
            _actorApplyCssProperty(element, propertyValuesMap, getDefault, propertyDescription);
    }
}

/** propertyExpander **/
export function cssPositioningHorizontalPropertyExpander(cssProperty) {
    return cssProperty === 'both' ? ['left', 'right'] : [cssProperty];
}
