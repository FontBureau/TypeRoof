import DOMTool from '../domTool.mjs';

export const REGISTERED_AXES_ORDERED = ['wght', 'wdth', 'opsz', 'ital', 'slnt', 'grad', 'GRAD'];

/**
 * `verboseFontVariationSettings`: if true, all axes of `font` are listed,
 * using their default location when propertyValuesMap doesn't specify one.
 * This mirrors what `setTypographicPropertiesToSample` applies as
 * `font-variation-settings`, see there. Requires `font`, as only the font
 * knows its axes and their default locations; without it, the flag has
 * no effect.
 */
export function renderAxesParameterDisplay(targetElement, propertyValuesMap
                    , {verboseFontVariationSettings=false, font=null}={}) {
    const domTool = new DOMTool(targetElement.ownerDocument)
      , axisPrefix = 'axesLocations/'
      , variations = []
      , unregisteredVariations = []
      , seen = new Set()
      ;

    if(verboseFontVariationSettings && font !== null) {
        // Add the axes of the font that are not set explicitly, at their
        // default location. Doing this before the ordering below, so
        // they are ordered just like the explicitly set axes.
        const withDefaults = new Map(propertyValuesMap);
        for(const [axisTag, axisRange] of Object.entries(font.axisRanges)) {
            const fullKey = `${axisPrefix}${axisTag}`;
            if(!withDefaults.has(fullKey))
                withDefaults.set(fullKey, axisRange['default']);
        }
        propertyValuesMap = withDefaults;
    }

    // just to keep some order!
    for(const axisTag of REGISTERED_AXES_ORDERED) {
        const fullKey = `${axisPrefix}${axisTag}`;
        if(propertyValuesMap.has(fullKey)) {
            seen.add(axisTag);
            variations.push([axisTag, propertyValuesMap.get(fullKey)]);
        }
    }

    for(const [key, value] of propertyValuesMap) {
        if(!key.startsWith(axisPrefix))
            continue;
        const axisTag = key.slice(axisPrefix.length);
        if(seen.has(axisTag))
            continue;
        unregisteredVariations.push([axisTag, value]);
    }
    unregisteredVariations.sort(([aTag, ], [bTag,])=> aTag.localeCompare(bTag, 'en'));
    variations.push(...unregisteredVariations);
    domTool.clear(targetElement);
    const nodes = [];
    for(const [axisTag, value] of variations) {
        nodes.push(
            domTool.createElement('strong', {}, axisTag)
          , ': '
            // only use toFixed if there's anything behind the comma
          , value % 1 !== 0 ? value.toFixed(3) : value
          , ', '
        )
    }
    nodes.pop();//remove trailing comma
    targetElement.append(...nodes);
}
