/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    ForeignKey
  , StringModel
  , ValueLink
  , StaticDependency
  , _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , _AbstractNumberModel
  , _AbstractSimpleOrEmptyModel
  , createAvailableTypes
  , createDynamicType
  , getMinMaxRangeFromType
  , getFieldsByType
} from '../metamodel.mjs';

import {
    mapValueToRange
} from '../util.mjs';


import {
    getMode as culoriGetMode
  , converter as culoriConverter
} from '../vendor/culori/bundled/culori.mjs';

import {
    COLOR
} from './registered-properties-definitions.mjs';

// CAUTION: from https://culorijs.org/color-spaces/
//   " The hue is identical across all color models in this family; however,
//     the saturaton is computed differently in each. The saturation in HSL
//     is not interchangeable with the saturation from HSV, nor HSI. Achromatic
//     colors (shades of gray) will have an undefined hue.
//   "
// This means for a gray OKLAB e.g.  {a: 0, b: 0, l: 0.51, mode: "oklab"}
// we'll receive a Object { mode: "oklch", l: 0.51, c: 0 } without a "h"
// channel!

export class _BaseColorModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}

// Colors and Actors start of here very similar, this was initially based
// on the Actor model system below.
export const ColorTypeModel = _AbstractGenericModel.createClass('ColorTypeModel')// => .value will be a concrete _BaseColorModel
    // make this selectable...
  , AvailableColorTypeModel = _AbstractStructModel.createClass(
        'AvailableColorTypeModel'
      , ['label', StringModel]
      , ['typeClass', ColorTypeModel]
    )
  , AvailableColorTypesModel = _AbstractOrderedMapModel.createClass('AvailableColorTypesModel', AvailableColorTypeModel)
    // new thing! can also have a toFixed-digits as fourth parameter
    // with min and max: this can be a range of discrete numbers.
  , PercentNumberModel = _AbstractNumberModel.createClass('PercentNumberModel', {min:0, max:100, defaultValue: 0, toFixedDigits: 5})
  , PercentNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PercentNumberModel)
    // This has a default of 100 instead of 0
  , AlphaPercentNumberModel = _AbstractNumberModel.createClass('AlphaPercentNumberModel', {min:0, max:100, defaultValue: 100, toFixedDigits: 5})
  , AlphaPercentNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(AlphaPercentNumberModel)
  , PercentWithNegativeNumberModel = _AbstractNumberModel.createClass('PercentWithNegativeNumberModel', {min:-100, max:100, defaultValue: 0, toFixedDigits: 5})
  , PercentWithNegativeNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PercentWithNegativeNumberModel)
    // This will be used to define an angle in number of "turn"s
    // min-max is interesting for better defined ui, but might be
    // problematic for other use cases.
  , HueNumberModel = _AbstractNumberModel.createClass('HueNumberModel', {min: 0, max:1, defaultValue: 0, toFixedDigits: 7})
  , HueNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(HueNumberModel)
  // FIXME: internal representations should not necessarily mirror
  // UI/UX considerations, as such maybe the raw representations
  // of these fields should rather be used as storage format and
  // some in between layer at UI level should translate. However,
  // there's no such layer yet, hence the user wins.
  , alphaColorMixin = [
        // *A*lpha
        // MDN for css okchl() on the A component:
        //      An <alpha-value> or the keyword none, where the number 1
        //      corresponds to 100% (full opacity).
        // MDN for <alpha-value>:
        //      The <alpha-value> CSS data type represents a value that
        //      can be either a <number> or a <percentage>, specifying the
        //      alpha channel or transparency of a color.
        // Using percentages for this, as users understand that well.
        ['alpha', AlphaPercentNumberOrEmptyModel]
    ]
  , OKLCHColorModel = _BaseColorModel.createClass(
        'OKLCHColorModel'
        // *L*ightness
        // MDN for css okchl() on the L component:
        //      A <number> between 0 and 1, a <percentage> between 0% and
        //      100%, for the keyword none, where the number 0 corresponds
        //      to 0% (black) and the number 1 corresponds to 100% (white).
        //      L specifies the perceived lightness.
        // Using percentages for this, as users understand that well.
      , ['L', PercentNumberOrEmptyModel]
        // *C*hroma
        // MDN for css okchl() on the C component:
        //      A <number>, a <percentage>, or the keyword none, where 0%
        //      is 0 and 100% is the number 0.4. It is a measure of the
        //      chroma (roughly representing the "amount of color"). Its
        //      minimum useful value is 0, while the maximum is theoretically
        //      unbounded (but in practice does not exceed 0.5).
        // Using percentages for this, as users understand that well.
      , ['C', PercentNumberOrEmptyModel]
        // *H*ue
        // MDN for css okchl() on the H component:
        //      A <number>, an <angle>, or the keyword none, which represents
        //      the hue angle. More details on this type can be found on
        //      the <hue> reference.
        // Using turns here, as it's easy to work with and easily transformed
        // into other angle formats.
      , ['H', HueNumberOrEmptyModel]
      , ... alphaColorMixin
    )
  , OKLABColorModel = _BaseColorModel.createClass(
        'OKLABColorModel'
        // *L*ightness
        // MDN for css okchl() on the L component:
        //      A <number> between 0 and 1, a <percentage> between 0% and
        //      100%, for the keyword none, where the number 0 corresponds
        //      to 0% (black) and the number 1 corresponds to 100% (white).
        //      L specifies the perceived lightness.
        // Using percentages for this, as users understand that well.
      , ['L', PercentNumberOrEmptyModel]
        // *a* axis green - red
        // MDN for css oklab() on the a component:
        //      A <number> between -0.4 and 0.4, a <percentage> between
        //      -100% and 100%, or the keyword none. It specifies the
        //      distance along the a axis in the Oklab colorspace, that
        //      is, how green or red the color is.
        // Using percentages for this, as users understand that well,
        // also the CSS lab model operates on -125 to +125 on a and b axis
        // but understands these percentages as well.
      , ['a', PercentWithNegativeNumberOrEmptyModel]
        // *b* axis blue - yellow
        // MDN for css oklab() on the b component:
        //       A <number> between -0.4 and 0.4, a <percentage> between
        //      -100% and 100%, or the keyword none. It specifies the
        //      distance along the b axis in the Oklab colorspace, that is,
        //      how blue or yellow the color is.
        // Using percentages for this, as users understand that well,
        // also the CSS lab model operates on -125 to +125 on a and b axis
        // but understands these percentages as well.
      , ['b', PercentWithNegativeNumberOrEmptyModel]
      , ... alphaColorMixin
    )
  , RGBColorModel = _BaseColorModel.createClass(
        'RGBColorModel'
        // MDN for css rgb() on the R, G, B components:
        //      Each as a <number> between 0 and 255, a <percentage>
        //      between 0% and 100%, or the keyword none, which represent
        //      the red, green, and blue channels, respectively.
      , ['R', PercentNumberOrEmptyModel]
      , ['G', PercentNumberOrEmptyModel]
      , ['B', PercentNumberOrEmptyModel]
      , ... alphaColorMixin
    )
  , [availableColorTypes, COLOR_TYPE_TO_COLOR_TYPE_KEY] =
        createAvailableTypes(AvailableColorTypesModel, [
                ['OKLCH', 'OKLCH', OKLCHColorModel]
              , ['OKLAB', 'OKLAB', OKLABColorModel]
              , ['RGB', 'RGB', RGBColorModel]
        ])
  , ColorModel = _AbstractStructModel.createClass(
        'ColorModel'
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableColorTypes'
                      , AvailableColorTypesModel
                      , availableColorTypes
                      )
        // TODO: having ALLOW_NULL here is interesting, and I'm not convinced
        // all the consequences are known by me now. It's about not creating
        // whatever Color this falls back to. But eventually null means
        // _AbstractDynamicStructModel: instance will have a null value.
        // and maybe we should handle this like an _AbstractSimpleOrEmptyModel
        // which raises if trying to read from an empty model and hence forces
        // awareness and always to use
      , ['colorTypeKey', new ForeignKey('availableColorTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['colorTypeModel', new ValueLink('colorTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicColorModel'
                            , _BaseColorModel
                            ,'colorTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableColorTypes'])]
    )
  ;

export const COLOR_TYPE_TO_CULORI_MODE = new Map([
        [OKLCHColorModel, 'oklch']
      , [OKLABColorModel, 'oklab']
      , [RGBColorModel, 'rgb']
    ])
  , CULORI_MODE_TO_COLOR_TYPE_KEY = new Map(Array.from(COLOR_TYPE_TO_CULORI_MODE)
        .map(([type, value])=>[value, COLOR_TYPE_TO_COLOR_TYPE_KEY.get(type)]))
  ;

export const PECENTAGE_UNIT_NUMBER_TYPES = new Set([
        PercentNumberModel
      , PercentNumberOrEmptyModel
      , PercentWithNegativeNumberModel
      , PercentWithNegativeNumberOrEmptyModel
]);

export const TURN_UNIT_NUMBER_TYPES = new Set([
        HueNumberModel, HueNumberOrEmptyModel
]);

export function colorToCss(color) {
    let formatter;
    if(color instanceof RGBColorModel)
        formatter = (R, G, B, alpha)=>`rgb(${R} ${G} ${B} / ${alpha})`;
    else if(color instanceof OKLABColorModel)
        formatter = (L, a, b, alpha)=>`oklab(${L} ${a} ${b} / ${alpha})`;
    else if(color instanceof OKLCHColorModel)
        formatter = (L, C, H, alpha)=>`oklch(${L} ${C} ${H}/ ${alpha})`;
    else
        throw new Error(`KEY ERROR ColorToCss color type unkonw ${color} (${color.constructor.name}).`);
    const componentStrings = [];
    for(const [componentKey, component] of color) {
        if(component.isEmpty)
            // CSS alpha = none means complete transparency I think
            // semantically the appearance of no alpha channel specified
            // is better instead, i.e. like letting out the "/ ${A}" part
            // in the formatters above.
            componentStrings.push(componentKey === 'alpha' ? '100%': 'none');
        else if(PECENTAGE_UNIT_NUMBER_TYPES.has(component.constructor))
            componentStrings.push(`${component.value}%`);
        else if(TURN_UNIT_NUMBER_TYPES.has(component.constructor))// so far only HueOrEmptyModel
            componentStrings.push(`${component.value}turn`);
        else
            componentStrings.push(`${component.value}`);
    }
    return formatter(...componentStrings);
}

export function createColor(typeKey, dependencies) {
    return createDynamicType(ColorModel, 'colorTypeKey', typeKey, dependencies);
}

export function culoriValuesToColorValuesRange(culorijsColor) {
    if(!CULORI_MODE_TO_COLOR_TYPE_KEY.has(culorijsColor.mode))
        throw new Error(`VALUE ERROR unsupported color mode: "${culorijsColor.mode}".`);

    const typeKey = CULORI_MODE_TO_COLOR_TYPE_KEY.get(culorijsColor.mode)
      , ColorType = availableColorTypes.get(typeKey).value.get('typeClass').value
      , culoriModeRanges = culoriGetMode(culorijsColor.mode).ranges
      , result = {}
      ;
    for(const [componentKey, ComponentType] of ColorType.fields.entries()) {
        const culoriComponent = componentKey.toLowerCase();
        if(!Object.hasOwn(culorijsColor, culoriComponent))
            continue;
        const culoriComponentValue = culorijsColor[culoriComponent]
          , fromRange = culoriModeRanges[culoriComponent]
          , toRange = getMinMaxRangeFromType(ComponentType)
          , componentValue = mapValueToRange(culoriComponentValue, fromRange, toRange)
          ;
        result[componentKey] = componentValue;
    }
    return result;
}

function _culoriToColor(culorijsColor, dependencies) {
    if(!CULORI_MODE_TO_COLOR_TYPE_KEY.has(culorijsColor.mode))
        throw new Error(`VALUE ERROR unsupported color mode: "${culorijsColor.mode}".`);
    const typeKey = CULORI_MODE_TO_COLOR_TYPE_KEY.get(culorijsColor.mode)
      , colorWrapperDraft = createColor(typeKey, dependencies)
      , colorDraft = colorWrapperDraft.get('instance').wrapped
      , mappedColor = culoriValuesToColorValuesRange(culorijsColor)
      ;
    for(const componentKey of colorDraft.constructor.fields.keys()) {
        if(!Object.hasOwn(mappedColor, componentKey))
            continue;
        colorDraft.get(componentKey).value = mappedColor[componentKey];
    }
    return colorWrapperDraft;
}

export function culoriToColor(culorijsColor, dependencies) {
    const _culorijsColor = !CULORI_MODE_TO_COLOR_TYPE_KEY.has(culorijsColor.mode)
          // we know oklch exists in CULORI_MODE_TO_COLOR_TYPE_KEY
        ? culoriConverter('oklch')(culorijsColor)
        : culorijsColor
        ;
    return _culoriToColor(_culorijsColor, dependencies);
}

export function getCuloriModeFromColor(colorOrColorType) {
    const color = (colorOrColorType instanceof _AbstractDynamicStructModel)
            ? colorOrColorType.wrapped
            : colorOrColorType
       , ColorType = (color instanceof _BaseColorModel)
            ? color.constructor
            : color
            ;
    if(!COLOR_TYPE_TO_CULORI_MODE.has(ColorType))
        throw new Error(`KEY ERROR can't determine culori-js color mode from colorOrColorType ${colorOrColorType} ColorType ${ColorType.name}.`);
    return COLOR_TYPE_TO_CULORI_MODE.get(ColorType);
}

export function colorToCulori(colorOrColorWrapper) {
    const color = (colorOrColorWrapper instanceof _AbstractDynamicStructModel)
            ? colorOrColorWrapper.wrapped
            : colorOrColorWrapper
      , mode = getCuloriModeFromColor(color)
      , culoriModeRanges = culoriGetMode(mode).ranges
      ;

    const culorijsColor = Object.fromEntries(Array.from(color.entries())
        .filter(([/*componentKey*/, component])=>!(component instanceof _AbstractSimpleOrEmptyModel && component.isEmpty))
        .map(([componentKey, component])=>{
            const culoriComponent = componentKey.toLowerCase()
              , fromRange = getMinMaxRangeFromType(component.constructor)
              , toRange = culoriModeRanges[culoriComponent]
                // If it's an _AbstractSimpleOrEmptyModel and it's empty, it will
                // raise here(!) but that should be taken care of by the caller.
              , value = component.value
              , culoriValue = mapValueToRange(value, fromRange, toRange)
              ;
            return [culoriComponent, culoriValue];
        }));
    culorijsColor.mode = mode;
    return culorijsColor;
}

const _NOTDEF = Symbol('_NOTDEF'); // not exported on purpose
/**
 * returns an array [culoriColor or null, bool consumed]
 */
export function getColorFromPropertyValuesMap(property, propertyValuesMap, defaultVal=_NOTDEF) {
    if(defaultVal !== _NOTDEF) {
        if(!Array.isArray(defaultVal))
            throw new Error(`VALUE ERROR defaultVal if specified must be an Array: ${defaultVal}`);
    }

    if(!property.startsWith(COLOR))
        return [null, false];

    if(property.split('/').length === 2)
        // allow for colors/backgroundColor to work
        property = `${property}/mode`;
    if(!propertyValuesMap.has(property)) {
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR property name "${property}" not found in propertyValuesMap.`);
    }

    const value = propertyValuesMap.get(property);
    if(!property.endsWith('/mode')) {
        if (typeof value === 'number')
            // This will be consumed, it should be a component of mode and
            // can be skipped by the calling function.
            return [null, true];
        // This is the deprecated case of a color object in the value
        // should become an error at some point.
        console.warn(`DEPRECATED: color property ${property}:`, value);
        return [null, false];
    }
    const color = {mode: value}
      , colorName = property.split('/', 2).at(-1)
      , mode = culoriGetMode(color.mode)
      ;
    if(!mode)
        throw new Error(`KEY ERROR mode "${color.mode}" not found.`);
    for(const component of mode.channels) {
        const fullComponentName = `${COLOR}${colorName}/${component}`;
        if(!propertyValuesMap.has(fullComponentName))
            continue;
        color[component] = propertyValuesMap.get(fullComponentName);
    }
    return [color, true];
}


// FIXME: copy pasta duplication from animation-animanion.mjs
function _culoriFixZeros(color, targetMode) {
    if(color.mode === targetMode)
        return color;
    // When components are missing, conversion to other modes
    // produces NaNs in culori, that's not a problem when the
    // components are compatible between spaces, i.e. don't require
    // or undergo an conversion.
    // Missing colors are set to 0 as suggested in
    // https://drafts.csswg.org/css-color/#interpolation-missing
    // I don't think we neeed a back-conversion in the interpolation
    // result. This resolves NaNs produces by culori in
    // conversion/interpolation.
    // Also: track: https://github.com/Evercoder/culori/issues/203
    // if that resolves the filter can return and the zeroing can
    // be removed again.
    const missing = []
      , {channels} = culoriGetMode(color.mode)
      ;
    let emptyCount = channels.length;
    for(const component of channels) {
        if(Object.hasOwn(color, component))
            // Not missing.
            continue;
        if(component === 'alpha') {
            emptyCount -= 1;
            // Missing alpha is not an issue as alpha is compatible everywhere.
            continue;
        }
        if(component === 'l' && color.mode.startsWith('ok')
                            && targetMode.startsWith('ok')) {
            // missing 'l' between oklab and oklch is compatible
            emptyCount -= 1;
            continue;
        }
        missing.push([component, 0]);
    }

    const result = missing.length
                // excluding alpha, if the color is empty we can keep
                // the emptyness
                && missing.length !== emptyCount
         // Add the missing components to a copy of a.
        ? {...color, ...Object.fromEntries(missing)}
        : color
        ;
    return result;
}

export function convertCuloriColorMode(originalCuloriColor, colorMode) {
    const zeroFixedColor =  _culoriFixZeros(originalCuloriColor, colorMode)
      , zeroFixedColorKeys = Object.keys(zeroFixedColor)
      , targetCuloriColor = zeroFixedColorKeys.length === 1 // only 'mode'
                // 'mode' and 'alpha'
                || (zeroFixedColorKeys.length === 2 && Object.hasOwn(zeroFixedColor, 'alpha'))
              // We can convert empty colors on the spot by just setting
              // a new color mode. 'alpha' needs no conversion either,
              // it's universally the same.
            ? {...zeroFixedColor, mode:colorMode}
            : culoriConverter(colorMode)(zeroFixedColor)
     ;
     // Bummer, culoriConverter turns e.g.
     //     Object { h: 108, mode: "oklch" } as oklab
     // into:
     //     Object { mode: "oklab", l: undefined, a: 0, b: 0 }
     for(const  k of Object.keys(targetCuloriColor)) {
        if(targetCuloriColor[k] === undefined)
            delete targetCuloriColor[k];
    }
     return targetCuloriColor;
}


/**
 * This is to identify ColorModel fields in a (_AbstractStruct) dataType FromType.
 * yields fildMame such that:
 *      FromType.fields.get(fieldName) === ColorModel
 */
export function* getColorModelFields(FromType) {
    yield* getFieldsByType(FromType, ColorModel);
}

export function* colorPropertyGen(fieldName, color) {
    const colorInstance = color.get('instance');
    if(!colorInstance.hasWrapped)
        return;

    // TODO:
    //      We are going to interpolate each component individually
    //      currently, we do full colors. But there's a problem getting
    //      reasonable defaults for missing components. E.g. we can't set
    //      hue in one keyMoment and use it in another key moment. that
    //      is mainly because we don't interpolate when we are exactly
    //      on a key moment. So, in order to be able to do that consistently
    //      we need to put all of the keyMoments interpolations into the
    //      same color model, e.g. backgroundColor => oklch
    //      textColor => rgb ...
    //      That is configuration that lives on the actor, next to the
    //      keyMoments, we could also default to oklch ok oklab etc.
    //      but changing the interpolation model has a lot of potential
    //      creating different transformations. Also, this should
    //      enable to e.g. choose the hue direction, specifically if
    //      a compatible interpolation color space is selected.
    //      These will always have a value, there's no way that there's
    //      no value.
    //      Thus, colorsGen should receive the necessary info to
    //      convert the color to the interpolation space and then
    //      yield the components of the target space only.
    //      we could also yield the target mode, as a convinience always
    //      however, within one keyMoments layer, it must be the same
    //      always. => could be an assertion error at relevant positon
    //      e.g.
    //              yield [`${COLOR}${fieldName}/mode`, 'oklab']
    //              yield [`${COLOR}${fieldName}/l`, 1]
    //              yield [`${COLOR}${fieldName}/a`, 2]
    //              yield [`${COLOR}${fieldName}/b`,  3]
    //              yield [`${COLOR}${fieldName}/alpha`, 4]
    //              Where undefined components are not yielded.
    //
    // Starting with an in place implementation, with fixed color mode,
    // to be made configurable later ...
    // test the rest as well: 'rgb', 'oklch', 'oklab'
    //      for oklcg, it doesn't really make much sense without
    //      specifying how h/hue should be handled, as it's a polar
    // In general it seems to be dialed in so that using the interpolation
    // color mode with the colors in the same mode gives the colors the
    // super power of not having to define all components while
    // interpolating the individual components.
    const colorMode = 'oklch'
      , originalCuloriColor = colorToCulori(colorInstance)
      , targetCuloriColor = convertCuloriColorMode(originalCuloriColor, colorMode)
      ;
    // This is not for interpolation! but it could sent instructions
    // along, like hue direction, could be an object.

    for( const [componentName, value] of Object.entries(targetCuloriColor)) {
        // Will also yield [`${COLOR}${fieldName}/mode`, colorMode] as
        // that's an entry in targetCuloriColor.
        yield [`${COLOR}${fieldName}/${componentName}`, value];
    }
    // FIXME: It doesn't make too much sense, to decompose
    //        the color here. Sure, it's straight forward for
    //        interpolation, but, unfortunately, it's losing
    //        the color-model AND we cannot interpolate between
    //        color-models
    //             * That is between models from one moment to the other.
    //               But above has good reasons as well.
    //             * Also, we now just yield the model along, let's
    //               see how that works out.
    //for(const [componentName, item] of instance.wrapped){
    //    if(item.isEmpty)
    //        continue;
    //    yield [`${COLOR}${fieldName}/${componentName}`, item.value];
    //}
    // yield [`${COLOR}${fieldName}`, colorToCulori(colorInstance)];
}
