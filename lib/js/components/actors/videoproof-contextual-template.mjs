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
  , getCharsForSelectUI
  , getCharsForKey
} from '../ui-char-groups.mjs';

export { getCharsForKey };

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
                // Argument placeholder: $1 through $9 (single digit)
                if(current.length) {
                    parts.push(current);
                    current = '';
                }
                // Single digit only: $1 through $9.
                // This avoids ambiguity when a pattern like "00$10101$111"
                // should parse as: "00" + arg0 + "0101" + arg0 + "11"
                const argIndex = parseInt(next, 10) - 1; // $1 → 0, $2 → 1, etc.
                i += 2;
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

// --- Unified Word Generation Engine ---

/**
 * Cartesian product generator for arity-2 (kerning) pairs.
 *
 * @param {Array<string>} outer — outer chars
 * @param {Array<string>} inner — inner chars
 * @yields {[string, string]}
 */
function* pairProductGen(outer, inner) {
    for(const o of outer)
        for(const i of inner)
            yield [o, i];
}

/**
 * Resolve chars from a charsData object, respecting the extended flag.
 *
 * This mirrors the existing `getSelectedChars` logic: base chars are
 * always included; if showExtended is true, extended chars are interleaved
 * after their base char.
 *
 * @param {{ chars: Array<string>, extendedChars: Map, hasExtended: boolean }} charsData
 * @param {boolean} showExtended
 * @returns {Array<string>}
 */
export function getSelectedChars(charsData, showExtended) {
    if(showExtended && charsData.hasExtended) {
        const selectedChars = []
          , extendedSeen = new Set()
          ;
        for(const c of charsData.chars) {
            selectedChars.push(c);
            if(!extendedSeen.has(c) && charsData.extendedChars.has(c)) {
                for(const ec of charsData.extendedChars.get(c))
                    selectedChars.push(ec);
            }
            extendedSeen.add(c);
        }
        // Extended chars not associated with any base char
        if(charsData.extendedChars.has(null)) {
            for(const ec of charsData.extendedChars.get(null))
                selectedChars.push(ec);
        }
        return selectedChars;
    }
    return Array.from(charsData.chars);
}

/**
 * Resolve chars from charGroupsData + fonts for a given charGroup config.
 *
 * @param {Object} charGroupsData
 * @param {Array} fonts
 * @param {string} charGroupOption — e.g. 'Latin.Lowercase', 'custom', 'all-gid', etc.
 * @param {boolean} showExtended
 * @param {string} [customText='']
 * @param {string} [customSeparator='']
 * @returns {Array<string>}
 */
export function resolveChars(charGroupsData, fonts, charGroupOption, showExtended
                            , customText='', customSeparator='') {
    let charsData;
    if(charGroupOption === 'custom') {
        const chars = customSeparator !== ''
                    ? customText.split(customSeparator)
                    : [...customText]
          , extendedChars = getExtendedChars(charGroupsData, chars)
          ;
        charsData = { chars, extendedChars, hasExtended: extendedChars.size > 0 };
    }
    else {
        charsData = getCharsForSelectUI(charGroupsData, fonts, charGroupOption);
    }
    return getSelectedChars(charsData, showExtended);
}

/**
 * Resolve chars for the outer side of a kerning pair.
 *
 * When there's only one charGroup (no explicit outer), this uses the
 * same charGroup but forces extended=false to keep pair counts manageable.
 * This matches the legacy behavior.
 *
 * @param {Object} charGroupsData
 * @param {Array} fonts
 * @param {string} charGroupOption
 * @param {string} [customText='']
 * @param {string} [customSeparator='']
 * @returns {Array<string>}
 */
export function resolveOuterChars(charGroupsData, fonts, charGroupOption
                                 , customText='', customSeparator='') {
    // Outer chars never include extended — legacy behavior to keep pair count down
    return resolveChars(charGroupsData, fonts, charGroupOption, false
                       , customText, customSeparator);
}

/**
 * Generate words from a compiled template and character data.
 *
 * This is the unified engine that replaces the old _getWords, _getKerningWords,
 * _getAutoContextualWords, _getCustomContextualWords, and all pad-mode branching.
 *
 * For arity-1 (contextual): iterates over chars, applies rules to classify
 * each char, fills the matching pattern.
 *
 * For arity-2 (kerning): generates cartesian product of outer × inner chars,
 * applies rules to classify each pair, fills the matching pattern.
 *
 * @param {{ rules: Array<{ test: function, parts: Array }>, defaultParts: Array, arity: number }} compiledTemplate
 * @param {Array<string>} innerChars — the characters to iterate over (inner for kerning)
 * @param {Array<string>} [outerChars=null] — outer chars for kerning; if null, arity-1 mode
 * @returns {Array<string>}
 */
export function generateWords(compiledTemplate, innerChars, outerChars=null) {
    const { rules, defaultParts, arity } = compiledTemplate
      , words = []
      ;

    if(arity <= 1 || outerChars === null) {
        // Arity-1: contextual mode — one char at a time
        for(const c of innerChars) {
            const args = [c];
            let matched = false;
            for(const rule of rules) {
                if(rule.test(args)) {
                    words.push(fill(rule.parts, args));
                    matched = true;
                    break;
                }
            }
            if(!matched)
                words.push(fill(defaultParts, args));
        }
    }
    else {
        // Arity-2: kerning mode — cartesian product of outer × inner
        for(const [o, i] of pairProductGen(outerChars, innerChars)) {
            const args = [o, i];
            let matched = false;
            for(const rule of rules) {
                if(rule.test(args)) {
                    words.push(fill(rule.parts, args));
                    matched = true;
                    break;
                }
            }
            if(!matched)
                words.push(fill(defaultParts, args));
        }
    }
    return words;
}

// --- Built-in Template Presets (replicate current pad modes) ---

/**
 * Template spec definitions that replicate the existing hardcoded pad modes.
 * These serve as the built-in presets; users can define custom templates.
 *
 * Each spec can be compiled via compileTemplate(charGroupsData, spec).
 */
export const BUILTIN_TEMPLATES = {
    'auto-short': {
        label: 'Latin: Auto Short'
      , rules: [
            { selector: leaf(0, ['World.Figures'], false), pattern: '00$100' }
          , { selector: leaf(0, ['Latin.Lowercase'], true), pattern: 'nn$1nn' }
        ]
      , defaultPattern: 'HH$1HH'
    }
  , 'auto-long': {
        label: 'Latin: Auto Long'
      , rules: [
            { selector: leaf(0, ['World.Figures'], false), pattern: '00$10101$111' }
          , { selector: leaf(0, ['Latin.Lowercase'], true), pattern: 'nn$1nono$1oo' }
        ]
      , defaultPattern: 'HH$1HOHO$1OO'
    }
  , 'kern-upper': {
        label: 'Latin: Kerning Uppercase'
      , rules: []
      , defaultPattern: 'HO$1$2$1OLA'
        // Char sourcing config for kerning modes
      , charConfig: { innerKey: 'Latin.Uppercase', outerKey: null }
    }
  , 'kern-mixed': {
        label: 'Latin: Kerning Mixed'
      , rules: []
      , defaultPattern: '$1$2nnoy'
      , charConfig: { innerKey: 'Latin.Lowercase', outerKey: 'Latin.Uppercase' }
    }
  , 'kern-lower': {
        label: 'Latin: Kerning Lowercase'
      , rules: []
      , defaultPattern: 'no$1$2$1ony'
      , charConfig: { innerKey: 'Latin.Lowercase', outerKey: null }
    }
};
