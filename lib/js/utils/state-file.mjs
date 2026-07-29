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

// e.g. "typeroof-state-20260729-144900.json"
export function createStateFileName(date = new Date()) {
    const pad = number=>`${number}`.padStart(2, '0')
      , dateSegment = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(pad).join('')
      , timeSegment = [date.getHours(), date.getMinutes(), date.getSeconds()].map(pad).join('')
      ;
    return `typeroof-state-${dateSegment}-${timeSegment}.json`;
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
