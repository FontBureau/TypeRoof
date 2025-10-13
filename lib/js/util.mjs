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

 /**
 * From the spec:
 *       Like other OpenType tags, axis tags are four unsigned bytes that
 *       can equivalently be interpreted as a string of four ASCII characters.
 *       Axis tags must begin with a letter (0x41 to 0x5A, 0x61 to 0x7A)
 *       and must use only letters, digits (0x30 to 0x39) or space (0x20).
 *       Space characters must only occur as trailing characters in tags
 *       that have fewer than four letters or digits.
 *
 * The trailing spaces won't be allowed in here! It'll be simpler for
 * input handling (tag.trim()). Instead length can be between 1 and 4
 * CAUTION: this does not work out. E.g. the Zycon font has tags called
 * like "M1  " and when we forcibly trim the spaces, the axes won't be
 * usable anymore via font-variation-settings. The default is now to
 * allow trailing spaces.
 */
export function validateOpenTypeTagString(tag) {
    if(typeof tag !== 'string')
        return [false, `Tag must be string but is typeof ${typeof tag}.`];
    if(tag.length < 1 || tag.length > 4)
        return [false, `Tag must be 1 to 4 chars long but tag.length is ${tag.length}. Tag: "${tag}".`];

    // 0 to 9 ==== 0x30 to 0x39
    // A to Z === 0x41 to 0x5A
    // a to z === 0x61 to 0x7A
    // space === 0x20

    // I could use RegEx, but this is simple and this way there are
    // short and very clear error messages.
    const currentCharCode = tag.charCodeAt(0);
    if(currentCharCode < 0x41
            || currentCharCode > 0x5A && currentCharCode < 0x61
            || currentCharCode > 0x7A)
        return [false, `Tag first char must be A-Z or a-z but is "${tag[0]}" `
                     + `(0x${currentCharCode.toString(16)}). Tag: "${tag}".`];

    for(let i=1;i<tag.length;i++) {
        const currentCharCode = tag.charCodeAt(i);
        if(currentCharCode !== 0x20
            && currentCharCode < 0x30
                || currentCharCode > 0x39 && currentCharCode < 0x41
                || currentCharCode > 0x5A && currentCharCode < 0x61
                || currentCharCode > 0x7A)
            return [false, `Tag char at ${i} must be A-Z, a-z, 0-9 or " " `
                     + `(the space character) but is "${tag[i]}" `
                     + `(0x${currentCharCode.toString(16)}). Tag: "${tag}".`];
    }
    return [true, null];
}
