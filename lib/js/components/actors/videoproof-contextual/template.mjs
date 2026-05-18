/**
 * Template pattern compiler and fill engine for videoproof contextual proofing.
 *
 * Patterns use positional placeholders:
 *   '\1', '\2', ... — argument references (internally 0-indexed: '\1' → index 0)
 *   '\\'          — literal '\' (escape)
 *
 * Compilation parses the pattern string once into a "parts" array of
 * alternating string literals and integer argument indices, enabling a
 * very fast fill operation (no regex, no repeated string scanning).
 *
 * Example:
 *   compilePattern("HO\1\2\1OLA")
 *   → { parts: ["HO", 0, 1, 0, "OLA"], arity: 2 }
 *
 *   fill(compiled.parts, ["X", "y"])
 *   → "HOXyXOLA"
 */

import { getCharsFromCharGroups } from "../../ui-char-groups.mjs";

import { ForeignKey } from "../../../metamodel.mjs";

import { deepFreeze } from "../../../util.mjs";

// Options that require font data to resolve — skip in selector context.
const _FONT_DEPENDENT_OPTIONS = new Set([
    "all-gid",
    "all-groups",
    "misc",
    "unicodes",
]);

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
const ARG_MARK = '\\'; // a literal '\'
export function compilePattern(pattern) {
    const parts = [],
        placeholders = new Map(
            [..."123456789"].map((c) => [c, parseInt(c, 10)]),
        );
    let current = "",
        maxArgIndex = -1,
        i = 0;
    while (i < pattern.length) {
        const ch = pattern[i];
        if (ch === ARG_MARK) {
            const next = pattern[i + 1];
            if (next === ARG_MARK) {
                // Escaped dollar sign
                current += ARG_MARK;
                i += 2;
            } else if (placeholders.has(next)) {
                // Argument placeholder: '\1' through '\9' (single digit)
                if (current.length) {
                    parts.push(current);
                    current = "";
                }
                // Single digit only: '\1' through '\9'.
                // This avoids ambiguity when a pattern like "00\10101\111"
                // should parse as: "00" + arg0 + "0101" + arg0 + "11"
                const argIndex = placeholders.get(next) - 1; // '\1' → 0, '\2' → 1, etc.
                i += 2;
                parts.push(argIndex);
                if (argIndex > maxArgIndex) maxArgIndex = argIndex;
            } else {
                // Bare '\' not followed by '\' or digit — treat as literal
                current += ARG_MARK;
                i++;
            }
        } else {
            current += ch;
            i++;
        }
    }
    // Flush any remaining literal text
    if (current.length) parts.push(current);

    return {
        parts,
        arity: maxArgIndex + 1,
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
    let out = "";
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        out += typeof p === "number" ? args[p] : p;
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
// don't we have that already, even called resolve or so ... ????
export function resolveKeyToCharSet(charGroupsData, key, extended) {
    const [chars, extendedCharsMap] = getCharsFromCharGroups(
            charGroupsData,
            key,
        ),
        result = new Set(chars);
    if (extended) {
        for (const [, extChars] of extendedCharsMap)
            for (const c of extChars) result.add(c);
    }
    return result;
}

function compileSelector(
    selector /*CharsSelectorModel*/,
    charGroupsData,
    stateTokens,
) {
    const typeKey = selector.get("selectorTypeKey").value;
    stateTokens.push(typeKey === ForeignKey.NULL ? "NULL" : typeKey);
    if (typeKey === ForeignKey.NULL) return null;

    const instance = selector.get("instance");

    if (typeKey === "Simple") {
        const argIndex = instance.get("argIndex").value;
        stateTokens.push(`\\${argIndex}`);
        const charSet = new Set(),
            charGroup = instance.get("charGroup"),
            optionsModel = charGroup.get("options"),
            extendedModel = charGroup.get("extended"),
            extended = extendedModel.isEmpty ? false : extendedModel.value,
            result = {
                test(args) {
                    return charSet.has(args[argIndex]);
                },
            };

        if (optionsModel.isEmpty) {
            console.warn("options is undefined!!!");
            return result;
        }
        const options = optionsModel.value;
        stateTokens.push(options, extended);
        if (options === "custom") {
            const customTextModel = charGroup.get("customText"),
                customSeparatorModel = charGroup.get("customSeparator"),
                customText = customTextModel.isEmpty
                    ? ""
                    : customTextModel.value,
                customSeparator = customSeparatorModel.isEmpty
                    ? ""
                    : customSeparatorModel.value;
            stateTokens.push(customText, customSeparator);
            const chars =
                customSeparator !== ""
                    ? customText.split(customSeparator)
                    : [...customText];
            for (const c of chars) charSet.add(c);
            // FIXME: add font info to this, maybe as an optional argument.
        } else if (!_FONT_DEPENDENT_OPTIONS.has(options)) {
            const resolved = resolveKeyToCharSet(
                charGroupsData,
                options,
                extended,
            );
            for (const c of resolved) charSet.add(c);
        }
        return result;
    }

    if (typeKey === "CombinatorAnd" || typeKey === "CombinatorOr") {
        stateTokens.push(typeKey);
        const children = [];
        for (const [, childSelector] of instance.get("children")) {
            const child = compileSelector(
                childSelector,
                charGroupsData,
                stateTokens,
            );
            if (child !== null) children.push(child);
        }
        if (children.length === 0) return null;
        const test =
            typeKey === "CombinatorOr"
                ? (args) => children.some((c) => c.test(args))
                : (args) => children.every((c) => c.test(args));
        return { test };
    }
    throw new Error(`NOT IMPLEMENTED typeKey ${typeKey}`);
}

// --- Template Compilation (from flat property paths) ---

// Default compiled template: pass-through, just outputs the character.
// fill([0], ['a']) → 'a'
export const DEFAULT_COMPILED_TEMPLATE = deepFreeze({
    rules: [],
    defaultParts: compilePattern("\\1").parts,
    arity: 1,
    stateTokens: ["\\1"],
});

function _getMaxArity(parts, currentMax) {
    for (const p of parts) {
        if (typeof p === "number" && p + 1 > currentMax) currentMax = p + 1;
    }
    return currentMax;
}

export function compileTemplate(template /*TemplateModel*/, charGroupsData) {
    const stateTokens = [];
    let defaultPattern = template.get("defaultPattern").value || "\\1";
    stateTokens.push(defaultPattern);

    const { parts: defaultParts } = compilePattern(defaultPattern),
        rulesList = template.get("rules"),
        rules = [];
    for (const [k, rule] of rulesList) {
        const pattern = rule.get("pattern").value;
        stateTokens.push(`#${k}`, pattern);
        const { parts } = compilePattern(pattern),
            selector = compileSelector(
                rule.get("selector"),
                charGroupsData,
                stateTokens,
            );
        if (selector !== null) rules.push({ test: selector.test, parts });
    }

    let arity = _getMaxArity(defaultParts, 0);
    for (const rule of rules) arity = _getMaxArity(rule.parts, arity);

    return { rules, defaultParts, arity, stateTokens };
}
// --- Unified Word Generation Engine ---

/**
 * Cartesian product generator for arity-2 (kerning) pairs.
 *
 * @param {Array<string>} inner — inner chars
 * @param {Array<string>} outer — outer chars
 * @yields {[innerChar:string, outerChar:string]}
 */
function* pairProductGen(inner, outer) {
    for (const i of inner) for (const o of outer) yield [i, o];
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
 * For arity-2 (kerning): generates cartesian product of inner × outer chars,
 * applies rules to classify each pair, fills the matching pattern.
 *
 * @param {{ rules: Array<{ test: function, parts: Array }>, defaultParts: Array, arity: number }} compiledTemplate
 * @param {Array<string>} innerChars — the characters to iterate over (inner for kerning)
 * @param {Array<string>} [outerChars=null] — outer chars for kerning; if null, arity-1 mode
 * @returns {Array<string>}
 */
export function generateWords(compiledTemplate, innerChars, outerChars = null) {
    const { rules, defaultParts, arity } = compiledTemplate,
        words = [];
    if (arity <= 1 || outerChars === null) {
        // Arity-1: contextual mode — one char at a time
        for (const c of innerChars) {
            const args = [c];
            let matched = false;
            for (const rule of rules) {
                if (rule.test(args)) {
                    words.push(fill(rule.parts, args));
                    matched = true;
                    break;
                }
            }
            if (!matched) words.push(fill(defaultParts, args));
        }
    } else {
        // Arity-2: kerning mode — cartesian product of outer × inner
        for (const [i, o] of pairProductGen(innerChars, outerChars)) {
            const args = [i, o];
            let matched = false;
            for (const rule of rules) {
                if (rule.test(args)) {
                    words.push(fill(rule.parts, args));
                    matched = true;
                    break;
                }
            }
            if (!matched) words.push(fill(defaultParts, args));
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
//   - auto-short: Latin lowercase → 'nn\1nn', figures → '00\100', default 'HH\1HH'
//   - auto-long:  Latin lowercase → 'nn\1nono\1oo', figures → '00\10101\111', default 'HH\1HOHO\1OO'
//   - kern-upper: default 'HO\1\2\1OLA', inner=Latin.Uppercase, outer=same
//   - kern-mixed: default '\1\2nnoy', inner=Latin.Lowercase, outer=Latin.Uppercase
//   - kern-lower: default 'no\1\2\1ony', inner=Latin.Lowercase, outer=same
//
// export const BUILTIN_TEMPLATES = {};
