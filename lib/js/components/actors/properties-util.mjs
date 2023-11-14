/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

export function setTypographicPropertiesToSample(sample, propertyValuesMap) {
    const axisPrefix = 'axesLocations/';

    if((propertyValuesMap.has('fontSize')))
        sample.style.setProperty('font-size', `${propertyValuesMap.get('fontSize')}pt`);
    else
        sample.style.removeProperty('font-size');

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
