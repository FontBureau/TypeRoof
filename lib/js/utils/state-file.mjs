import {
    deserializeGen
  , SERIALIZE_OPTIONS
} from '../metamodel.mjs';

// returns "likeADraft" => {metamorphoseGen: }
export function deserializeStateString(Model, serializedValue) {
    const options = {...SERIALIZE_OPTIONS, earlyExitOnError: true}
      , metamorphoseGen = dependencies=>deserializeGen(
                            Model, dependencies, serializedValue, options)
      ;
    return {metamorphoseGen};
}

// e.g. "typeroof-20260729-144900.MotionStage.json"
export function createStateFileName(layoutKey, date = new Date()) {
    const pad = number=>`${number}`.padStart(2, '0')
      , dateSegment = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(pad).join('')
      , timeSegment = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join('')
      ;
    return `typeroof-${dateSegment}-${timeSegment}.${layoutKey}.json`;
}

// Pipe `bytes` through a (De)CompressionStream and collect the result.
async function _streamThrough(transformStream, bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(transformStream);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function _bytesToBase64Url(bytes) {
    let binary = '';
    for(const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function _base64UrlToBytes(text) {
    const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
      , bytes = new Uint8Array(binary.length)
      ;
    for(let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Compress a serialized state string into a URL-safe token, using the
// browser's CompressionStream API (gzip) plus base64url encoding.
export async function compressStateForUrl(serializedValue) {
    const input = new TextEncoder().encode(serializedValue)
      , compressed = await _streamThrough(new CompressionStream('gzip'), input)
      ;
    return _bytesToBase64Url(compressed);
}

// Reverse of compressStateForUrl. Returns null for a missing or empty token.
export async function decompressStateFromUrl(rawValue) {
    if(rawValue === null || rawValue.trim().length === 0)
        return null;
    const compressed = _base64UrlToBytes(rawValue.trim())
      , decompressed = await _streamThrough(new DecompressionStream('gzip'), compressed)
      ;
    return new TextDecoder().decode(decompressed);
}

export function downloadFile(document, contents, fileName) {
    const url = URL.createObjectURL(new Blob([contents], {type: 'application/json'}))
      , anchor = document.createElement('a')
      ;
    anchor.href = url;
    anchor.download = fileName;
    // Firefox requires the anchor to be in the document to be clickable.
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
