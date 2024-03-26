/* jshint esversion:6, browser: true */
import hbjs from './hbjs.mjs';
import hb from './hb.mjs';

// no good way to load wasm from within a module yet.
const wasmURL = new URL('hb.wasm', import.meta.url);

export default async function getHarfbuzz() {
    function locateFile(/*path, prefix*/) {
        return wasmURL.toString();
    }
    const Module = await hb({locateFile});
    // Seems like no longer required, since compiled with em++
    // wasm.instance.exports.memory.grow(400); // each page is 64kb in size
    return {hbjs: hbjs(Module), Module};
}
