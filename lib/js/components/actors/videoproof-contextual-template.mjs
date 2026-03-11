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
  , getSelectedChars
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
    const parts = []
      , placeholders = new Map([...'123456789'].map(c=>[c, parseInt(c, 10)]))
      ;
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
            else if(placeholders.has(next)) {
                // Argument placeholder: $1 through $9 (single digit)
                if(current.length) {
                    parts.push(current);
                    current = '';
                }
                // Single digit only: $1 through $9.
                // This avoids ambiguity when a pattern like "00$10101$111"
                // should parse as: "00" + arg0 + "0101" + arg0 + "11"
                const argIndex = placeholders.get(next) - 1; // $1 → 0, $2 → 1, etc.
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

// --- Selector Compilation ---
//
// TODO: Implement selector compilation from deserialized SelectorModel
// instances. The compiled form should be:
//   Leaf: { test: (args) => charSet.has(args[argIndex]) }
//   AND:  { test: (args) => children.every(c => c.test(args)) }
//   OR:   { test: (args) => children.some(c => c.test(args)) }
//
// Use resolveKeyToCharSet() to build the Sets from selector key paths.
// The SelectorModel tree (SimpleSelectorModel / CombinatorSelectorModel)
// is defined in videoproof-contextual-models.mjs.

// --- Template Compilation ---
//
// TODO: Implement template compilation from deserialized TemplateModel
// instances. The compiled form should be:
// {
//     rules: [{ test: function(args), parts: Array<string|number> }, ...],
//     defaultParts: Array<string|number>,
//     arity: number
// }
//
// This will read TemplateModel → walk rules → compile each rule's
// SelectorModel via the selector compiler → compile each rule's pattern
// string via compilePattern() → assemble the compiled template.
//
// The TemplateModel is defined in videoproof-contextual-models.mjs.

// --- Convenience: Selector spec constructors ---
//
// TODO: These will be replaced by the SelectorModel API.
// Creating selectors will be done through the metamodel —
// constructing SimpleSelectorModel / CombinatorSelectorModel instances.

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

// --- Built-in Template Presets ---
//
// TODO: Fill with actual serialized TemplateModel data (from metamodel
// deserialization). The built-in templates should be proper TemplateModel
// instances, not an ad-hoc format. Use the TemplateModel deserialize API
// to create them.
//
// Templates to define (replicating current pad modes):
//   - auto-short: Latin lowercase → 'nn$1nn', figures → '00$100', default 'HH$1HH'
//   - auto-long:  Latin lowercase → 'nn$1nono$1oo', figures → '00$10101$111', default 'HH$1HOHO$1OO'
//   - kern-upper: default 'HO$1$2$1OLA', inner=Latin.Uppercase, outer=same
//   - kern-mixed: default '$1$2nnoy', inner=Latin.Lowercase, outer=Latin.Uppercase
//   - kern-lower: default 'no$1$2$1ony', inner=Latin.Lowercase, outer=same
//
// export const BUILTIN_TEMPLATES = {};
