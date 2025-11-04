import DOMTool from '../domTool.mjs';

export const REGISTERED_AXES_ORDERED = ['wght', 'wdth', 'opsz', 'ital', 'slnt', 'grad', 'GRAD'];

export function renderAxesParameterDisplay(targetElement, propertyValuesMap) {
    const domTool = new DOMTool(targetElement.ownerDocument)
      , axisPrefix = 'axesLocations/'
      , variations = []
      , unregisteredVariations = []
      , seen = new Set()
      ;

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
