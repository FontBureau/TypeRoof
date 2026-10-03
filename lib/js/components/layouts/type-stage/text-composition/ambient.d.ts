/**
 * Ambient declaration for vite CSS imports from TypeScript modules
 * (import "./line-spans.css"). JS/JSX modules import CSS unchecked;
 * TS requires a module declaration. Side-effect import only, no
 * exports.
 */
declare module "*.css";

// No type definitions ship with the linebreak package (UAX#14).
declare module "linebreak";
