/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

/**
 * Template pattern compiler and fill engine for videoproof contextual proofing.
 *
 * Patterns use positional placeholders:
 *   $1, $2, ... — argument references (internally 0-indexed: $1 → index 0)
 *   $$          — literal '$' (escape)
 *
 * Compilation parses the pattern string once into a "parts" array of
 * alternating string literals and integer argument indices, enabling a
 * very fast fill operation (no regex, no repeated string scanning).
 *
 * Example:
 *   compilePattern("HO$1$2$1OLA")
 *   → { parts: ["HO", 0, 1, 0, "OLA"], arity: 2 }
 *
 *   fill(compiled.parts, ["X", "y"])
 *   → "HOXyXOLA"
 */

/**
 * Parse a pattern string into a parts array.
 *
 * The parts array contains string literals and integer argument indices
 * interleaved. At fill time we simply walk the array and concatenate.
 *
 * @param {string} pattern
 * @returns {{ parts: Array<string|number>, arity: number }}
 */
export function compilePattern(pattern) {
    const parts = [];
    let current = ''
      , maxArgIndex = -1
      , i = 0
      ;
    while(i < pattern.length) {
        const ch = pattern[i];
        if(ch === '$') {
            const next = pattern[i + 1];
            if(next === '$') {
                // Escaped dollar sign
                current += '$';
                i += 2;
            }
            else if(next >= '1' && next <= '9') {
                // Argument placeholder — parse the full number
                // (supporting multi-digit: $1 through $99+)
                if(current.length) {
                    parts.push(current);
                    current = '';
                }
                let numStr = next;
                i += 2;
                while(i < pattern.length && pattern[i] >= '0' && pattern[i] <= '9') {
                    numStr += pattern[i];
                    i++;
                }
                const argIndex = parseInt(numStr, 10) - 1; // $1 → 0, $2 → 1, etc.
                parts.push(argIndex);
                if(argIndex > maxArgIndex)
                    maxArgIndex = argIndex;
            }
            else {
                // Bare '$' not followed by '$' or digit — treat as literal
                current += '$';
                i++;
            }
        }
        else {
            current += ch;
            i++;
        }
    }
    // Flush any remaining literal text
    if(current.length)
        parts.push(current);

    return {
        parts
      , arity: maxArgIndex + 1
    };
}

/**
 * Fill a compiled parts array with the given arguments.
 *
 * This is the hot-path function — called once per word in the proof.
 * It's a tight loop over the parts array; V8 will inline this well.
 *
 * @param {Array<string|number>} parts — compiled parts array
 * @param {Array<string>} args — the argument values to substitute
 * @returns {string}
 */
export function fill(parts, args) {
    let out = '';
    for(let i = 0; i < parts.length; i++) {
        const p = parts[i];
        out += typeof p === 'number' ? args[p] : p;
    }
    return out;
}
