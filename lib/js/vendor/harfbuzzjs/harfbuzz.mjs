/* jshint esversion:6, browser: true */
// harfbuzzjs v1.x: the WASM module initializes at import time via
// top-level await. This wrapper stays the single import point for
// TypeRoof, so Vite resolves harfbuzz.wasm relative to harfbuzz.js
// (import.meta.url) and so future upgrades touch only this directory.
export * from './index.mjs';
