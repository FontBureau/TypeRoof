/**
 * Ambient declaration for vite CSS imports from TypeScript modules
 * (import "./line-spans.css"). JS/JSX modules import CSS unchecked;
 * TS requires a module declaration. Side-effect import only, no
 * exports.
 */
declare module "*.css";

// No type definitions ship with the linebreak package (UAX#14).
declare module "linebreak";

// No type definitions ship with the hypher package (Knuth-Liang
// hyphenation) — minimal declaration of what we use (CJS:
// module.exports = Hypher).
declare module "hypher" {
    export default class Hypher {
        constructor(language: unknown);
        /** Word fragments between the valid hyphenation points. */
        hyphenate(word: string): string[];
    }
}
