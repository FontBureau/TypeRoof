/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

/**
 *  Just like Pythons zip.
 *
 * CAUTION: When called without any argument len will be Infinity
 * because `Math.min() === Infinity` and hence zip will yield forever
 * empty arrays.
 */
export function* zip(...arrays) {
    if(!arrays.length)
        throw new Error('zip requires at least one array-like argument.');
    let len = Math.min(...arrays.map(a=>a.length));
    for(let i=0;i<len;i++)
        yield arrays.map(a=>a[i]); // jshint ignore:line
}

export function* enumerate(iterable) {
    let i=0;
    for(const value of iterable) {
        yield [i, value];
        i += 1;
    }
}

// via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
export function deepFreeze(object) {
    // Retrieve the property names defined on object
    const propNames = Object.getOwnPropertyNames(object);

    // Freeze properties before freezing self
    for (const name of propNames) {
        const value = object[name];

        if (value && typeof value === "object") {
          deepFreeze(value);
        }
    }
    return Object.freeze(object);
}

export function interpolateNumber(t, a, b) {
    // Also (?): (t, a, b) => (1 - t) * a + t * b;
    return ((b - a) * t) + a;
}

export function mapValueToRange(value, fromRange, toRange) {
    const [minVal, maxVal] = fromRange
        // normalize between 0 and 1
      , t = (value - minVal) / (maxVal - minVal)
      , [toMin, toMax] = toRange
      , mappedValue = interpolateNumber(t, toMin, toMax)
      ;
    return mappedValue;
}

export function identity(value) {
    return value;
}

// camelCase to camel_case
export function deCamelize(str) {
    return str.replace(/(?:[A-Z])/g
        , (word, index)=>`${index === 0 ? '' : '_'}${word.toLowerCase()}`);
}
