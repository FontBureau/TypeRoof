/**
 * Complete upstream pattern catalog from:
 * https://github.com/bramstein/hyphenation-patterns/tree/master/patterns
 *
 * This is the single source for BOTH the vendor script and runtime
 * language resolution — adding an upstream pattern here makes the
 * generator fetch it and makes its exact key available to the Host.
 * Keep sorted by key.
 */
export const HYPHENATION_PATTERN_KEYS = Object.freeze([
    "be",
    "bn",
    "ca",
    "cs",
    "da",
    "de",
    "el-monoton",
    "el-polyton",
    "en-gb",
    "en-us",
    "es",
    "fi",
    "fr",
    "grc",
    "gu",
    "hi",
    "hu",
    "hy",
    "is",
    "it",
    "kn",
    "la",
    "lt",
    "lv",
    "ml",
    "nb-no",
    "nl",
    "or",
    "pa",
    "pl",
    "pt",
    "ru",
    "sk",
    "sl",
    "sv",
    "ta",
    "te",
    "tr",
    "uk",
]);

/** Normal BCP47/application keys whose upstream asset has a more
 * specific name. Exact catalog keys always map to themselves.
 *
 * - el: modern Greek defaults to monotonic orthography; callers may
 *   explicitly request el-polyton. Ancient Greek is grc.
 * - en: software/browser default = US; regional handling lives in
 *   languageToHyphenationPatternKey.
 * - nb/no: upstream ships Bokmål for Norway as nb-no.
 */
export const HYPHENATION_PATTERN_ALIASES = Object.freeze({
    el: "el-monoton",
    en: "en-us",
    nb: "nb-no",
    no: "nb-no",
});
