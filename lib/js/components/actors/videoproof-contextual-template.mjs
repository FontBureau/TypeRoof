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
} from '../ui-char-groups.mjs';

import {
    ForeignKey
} from '../../metamodel.mjs';

import { deepFreeze } from '../../util.mjs';

// Options that require font data to resolve — skip in selector context.
const _FONT_DEPENDENT_OPTIONS = new Set(['all-gid', 'all-groups', 'misc', 'unicodes']);

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

// --- Selector Compilation (from flat property paths) ---

/**
 * Compile a selector from flat property values map paths.
 *
 * Reads the selector type key and instance fields from the property map,
 * recursively handling Combinator selectors (AND/OR over children).
 *
 * @param {Map} propertyValuesMap — flat property map from the broom wagon
 * @param {string} prefix — path prefix, e.g. 'generic/template/rules/0/selector'
 * @param {Object} charGroupsData — the glyph-groups data object
 * @returns {{ test: function(string[]): boolean } | null}
 */
function compileSelectorFromPath(propertyValuesMap, prefix, charGroupsData, stateTokens) {
    const typeKeyPath = `${prefix}/selectorTypeKey`
        , typeKey = propertyValuesMap.get(typeKeyPath)
        ;
    stateTokens.push(typeKeyPath
      , typeKey === ForeignKey.NULL ? 'NULL' : typeKey);
    // ForeignKey.NULL is a Symbol — if missing or null, no selector
    if(typeKey === undefined || typeKey === ForeignKey.NULL)
        return null;

    const instancePrefix = `${prefix}/instance`;

    if(typeKey === 'Simple') {
        const argIndexPath = `${instancePrefix}/argIndex`
            , argIndex = propertyValuesMap.get(argIndexPath)
            ;
        if(argIndex === undefined)
            throw new Error(`Missing argIndex at ${argIndexPath}`);
        stateTokens.push(argIndexPath, argIndex);
        const charSet = new Set()
            , cgPrefix = `${instancePrefix}/charGroup`
            , optionsPath = `${cgPrefix}/options`
            , options = propertyValuesMap.get(optionsPath)
            , extendedPath = `${cgPrefix}/extended`
            , extended = propertyValuesMap.get(extendedPath)
            ;
        stateTokens.push(optionsPath, options, extendedPath, extended);
        if(options === undefined) {
            console.warn('options is undefined!!!')
        }
        else if(options === 'custom') {
            const customTextPath = `${cgPrefix}/customText`
                , customSeparatorPath = `${cgPrefix}/customSeparator`
                , customText = propertyValuesMap.get(customTextPath) || ''
                , customSeparator = propertyValuesMap.get(customSeparatorPath) || ''
                ;
            stateTokens.push(customTextPath, customText
                           , customSeparatorPath, customSeparator);
            const chars = customSeparator !== ''
                        ? customText.split(customSeparator)
                        : [...customText]
                        ;
            for(const c of chars)
                charSet.add(c);
        }
        else if(options && !_FONT_DEPENDENT_OPTIONS.has(options)) {
            const resolved = resolveKeyToCharSet(charGroupsData, options, extended);
            for(const c of resolved)
                charSet.add(c);
        }
        // else: font-dependent or empty options — skip in selector context

        return {
            test(args) { return charSet.has(args[argIndex]); }
        };
    }

    if(typeKey === 'Combinator') {
        const combineModePath = `${instancePrefix}/combineMode`
            , combineMode = propertyValuesMap.get(combineModePath)
            ;
        if(combineMode === undefined)
            throw new Error(`Missing combineMode at ${combineModePath}`);
        stateTokens.push(combineModePath, combineMode);
        // Compile children recursively
        const children = [];
        for(let i = 0; ; i++) {
            const childPrefix = `${instancePrefix}/children/${i}`;
            const childTypeKey = propertyValuesMap.get(`${childPrefix}/selectorTypeKey`);
            if(childTypeKey === undefined)
                break;
            const child = compileSelectorFromPath(
                    propertyValuesMap, childPrefix, charGroupsData, stateTokens);
            if(child !== null)
                children.push(child);
        }
        if(children.length === 0)
            return null;
        if(combineMode === 'OR')
            return {
                test(args) { return children.some(c => c.test(args)); }
            };
        // default: AND
        return {
            test(args) { return children.every(c => c.test(args)); }
        };
    }
    // Unknown type key
    throw new Error(`NOT IMPLEMENTED typeKey ${typeKey}`);
}

// --- Template Compilation (from flat property paths) ---

// Default compiled template: pass-through, just outputs the character.
// fill([0], ['a']) → 'a'
const _DEFAULT_COMPILED_TEMPLATE = deepFreeze({
    rules: []
  , defaultParts: [0]
  , arity: 1
  , stateTokens: []
});

function _getMaxArity(parts, currentMax) {
    for(const p of parts) {
        if(typeof p === 'number' && p + 1 > currentMax)
            currentMax = p + 1;
    }
    return currentMax;
}

/**
 * Compile a template from flat property values map paths.
 *
 * Reconstructs the template structure by probing the property map
 * for rules (rules/0/pattern, rules/1/pattern, ...) and the
 * defaultPattern, compiling each pattern and selector.
 *
 * Following the pattern of getDimensionFromPropertyValuesMap in
 * type-tools-grid.mjs and getColorFromPropertyValuesMap in color.mjs.
 *
 * @param {Map} propertyValuesMap — flat property map from the broom wagon
 * @param {string} prefix — path prefix, e.g. 'generic/template'
 * @param {Object} charGroupsData — the glyph-groups data object
 * @returns {{ rules: Array, defaultParts: Array, arity: number }}
 */
export function compileTemplateFromPropertyValuesMap(
        propertyValuesMap, prefix, charGroupsData) {
    // stateTokens: accumulated on-the-fly as values are read,
    // so only relevant values end up in the cache key.
    const stateTokens = []
      , defaultPatternKey = `${prefix}/defaultPattern`
      , defaultPattern = propertyValuesMap.get(defaultPatternKey)
      ;
    stateTokens.push(defaultPatternKey, defaultPattern);

    if(!defaultPattern)
        return _DEFAULT_COMPILED_TEMPLATE;

    const {parts: defaultParts} = compilePattern(defaultPattern);

    // Discover rules by probing paths
    const rules = [];
    for(let i = 0; ; i++) {
        const rulePrefix = `${prefix}/rules/${i}`
          , patternKey = `${rulePrefix}/pattern`
          , pattern = propertyValuesMap.get(patternKey)
          ;
        if(pattern === undefined)
            break;
        stateTokens.push(patternKey, pattern);
        const {parts} = compilePattern(pattern)
            , selectorPrefix = `${rulePrefix}/selector`
            , selector = compileSelectorFromPath(
                    propertyValuesMap, selectorPrefix, charGroupsData, stateTokens)
            ;
        // A rule without a selector doesn't select anything — skip it.
        // defaultPattern serves as the catch-all.
        if(selector !== null)
            rules.push({ test: selector.test, parts });
    }

    // Determine arity from max arg index across all patterns
    let arity = _getMaxArity(defaultParts, 0);
    for(const rule of rules)
        arity = _getMaxArity(rule.parts, arity);

    return { rules, defaultParts, arity, stateTokens };
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
