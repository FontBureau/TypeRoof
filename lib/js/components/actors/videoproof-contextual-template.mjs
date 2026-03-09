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

import {
    getCharsFromCharGroups
  , getExtendedChars
} from '../ui-char-groups.mjs';

// --- Pattern Compilation ---

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

// --- Selector Compilation ---

/**
 * Resolve a single selector key (e.g. 'Latin.Lowercase') into a Set of chars.
 *
 * If `extended` is true, extended chars are flattened into the set at
 * compile time — no runtime extended-char lookups needed.
 *
 * @param {Object} charGroupsData — the glyph-groups data object
 * @param {string} key — dotted key path, e.g. 'Latin.Lowercase'
 * @param {boolean} extended — whether to include extended chars
 * @returns {Set<string>}
 */
export function resolveKeyToCharSet(charGroupsData, key, extended) {
    const [chars, extendedCharsMap] = getCharsFromCharGroups(charGroupsData, key)
      , result = new Set(chars)
      ;
    if(extended) {
        for(const [, extChars] of extendedCharsMap)
            for(const c of extChars)
                result.add(c);
    }
    return result;
}

/**
 * Compile a selector leaf specification into a test function.
 *
 * A leaf spec is: { argIndex: number, keys: string[], extended: boolean }
 * Multiple keys are OR-ed (union of char sets).
 *
 * @param {Object} charGroupsData
 * @param {{ argIndex: number, keys: string[], extended: boolean }} leafSpec
 * @returns {{ test: function(string[]): boolean, charSet: Set<string>, argIndex: number }}
 */
export function compileSelectorLeaf(charGroupsData, leafSpec) {
    const { argIndex, keys, extended } = leafSpec
      , charSet = new Set()
      ;
    for(const key of keys) {
        const keySet = resolveKeyToCharSet(charGroupsData, key, extended);
        for(const c of keySet)
            charSet.add(c);
    }
    return {
        test: (args) => charSet.has(args[argIndex])
      , charSet
      , argIndex
    };
}

/**
 * Compile a selector specification into a test function.
 *
 * Selector specs can be:
 *   - A leaf: { argIndex, keys, extended }
 *   - A combinator: { op: 'AND'|'OR', children: [selectorSpec, ...] }
 *
 * @param {Object} charGroupsData
 * @param {Object} selectorSpec
 * @returns {{ test: function(string[]): boolean }}
 */
export function compileSelector(charGroupsData, selectorSpec) {
    if('op' in selectorSpec) {
        const { op, children } = selectorSpec
          , compiledChildren = children.map(
                child => compileSelector(charGroupsData, child))
          ;
        if(op === 'AND')
            return {
                test: (args) => compiledChildren.every(c => c.test(args))
            };
        else if(op === 'OR')
            return {
                test: (args) => compiledChildren.some(c => c.test(args))
            };
        else
            throw new Error(`Unknown selector operator: "${op}".`);
    }
    // Leaf
    return compileSelectorLeaf(charGroupsData, selectorSpec);
}

// --- Template Compilation ---

/**
 * Compile a full template specification into a ready-to-execute form.
 *
 * A template spec is:
 * {
 *     rules: [{ selector: selectorSpec, pattern: string }, ...],
 *     defaultPattern: string
 * }
 *
 * The compiled form has all selectors resolved to test functions
 * and all patterns parsed into parts arrays.
 *
 * @param {Object} charGroupsData
 * @param {{ rules: Array<{ selector: Object, pattern: string }>, defaultPattern: string }} templateSpec
 * @returns {{ rules: Array<{ test: function, parts: Array }>, defaultParts: Array, arity: number }}
 */
export function compileTemplate(charGroupsData, templateSpec) {
    const { rules, defaultPattern } = templateSpec
      , compiledDefault = compilePattern(defaultPattern)
      , compiledRules = []
      ;
    let maxArity = compiledDefault.arity;
    for(const rule of rules) {
        const compiled = compileSelector(charGroupsData, rule.selector)
          , patternCompiled = compilePattern(rule.pattern)
          ;
        compiledRules.push({
            test: compiled.test
          , parts: patternCompiled.parts
        });
        if(patternCompiled.arity > maxArity)
            maxArity = patternCompiled.arity;
    }
    return {
        rules: compiledRules
      , defaultParts: compiledDefault.parts
      , arity: maxArity
    };
}

// --- Convenience: Selector spec constructors ---

/**
 * Create an AND combinator selector spec.
 * @param {...Object} children — leaf or combinator specs
 * @returns {{ op: 'AND', children: Object[] }}
 */
export function AND(...children) {
    return { op: 'AND', children };
}

/**
 * Create an OR combinator selector spec.
 * @param {...Object} children — leaf or combinator specs
 * @returns {{ op: 'OR', children: Object[] }}
 */
export function OR(...children) {
    return { op: 'OR', children };
}

/**
 * Create a leaf selector spec.
 * @param {number} argIndex — which argument to test (0-based)
 * @param {string[]} keys — char group keys to OR together
 * @param {boolean} [extended=true] — include extended chars
 * @returns {{ argIndex: number, keys: string[], extended: boolean }}
 */
export function leaf(argIndex, keys, extended=true) {
    return { argIndex, keys, extended };
}
