/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
import * as opentype from './vendor/opentype.js/dist/opentype.mjs';
import {  normalizeRanges, mergePathRanges, getFullPathsFromRanges
       , normalizePathsRanges, serializePathRanges, deserializePathRanges
       , markupSelectionInline, markupSelectionStructureSave
       , clipAndFilterRanges
       } from './text-selection.mjs';

import {getDecompressSync} from './vendor/wawoff2/decompress.mjs';
const woff2decompress = await getDecompressSync();

import {init as initGrid} from './layouts/videoproof-array.mjs';
import {init as initTypeYourOwn} from './layouts/videoproof-type-your-own.mjs';
import {init as initTypespec
       , template as typespecTemplate
       , templateToDOM as typespecTemplateToDOM
       } from './layouts/vartools-typespec.mjs';
import {init as initWaterfall} from './layouts/vartools-waterfall.mjs';
import {init as initContextual} from './layouts/videoproof-contextual.mjs';
import {init as initVarToolsGrid} from './layouts/vartools-grid.mjs';
import DOMTool from './domTool.mjs';
import LocalFontStorage from './local-font-storage.mjs';
import {OTFeatureInfo} from './ot-feature-info.mjs';
import {
    fixGridLineBreaks
  , fixContextualLineBreaks
} from './affixed-line-breaks.mjs';

/**
 * Array.from( cartesianProductGen([['a', 'b'], ['c', 'd']]) )
 * >>> [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']]
 *
 * No intermediate arrays are created.
 */
function* cartesianProductGen([head, ...tail]) {
    if(!head)
        yield [];
    else {
        // NOTE: the sequence of productGen(tail) could be stored
        // here as an intermediate array, but it may not improve
        // performance, as it's heavier on memory:
        // let products = [...productGen(tail)];
        for(let item of head)
            for(let prod of cartesianProductGen(tail))
                yield [item, ...prod];
    }
}

/**
 *  Just like Pythons zip.
 *
 * CAUTION: When called without any argument len will be Infinity
 * because `Math.min() === Infinity` and hence zip will yield forever
 * empty arrays.
 */
function* zip(...arrays) {
    if(!arrays.length)
        throw new Error('zip requires at least one array-like argument.');
    let len = Math.min(...arrays.map(a=>a.length));
    for(let i=0;i<len;i++)
        yield arrays.map(a=>a[i]); // jshint ignore:line
}

/**
 * a = [1,2,3]
 * b = [3,4.5]
 * dot(a, b) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] +
 */
function vecDot(a, b) {
    return Array.from(zip(a, b))
                .reduce((accum, [an, bn])=>accum + (an * bn), 0);
}

function vecSum(a, b) {
    return Array.from(zip(a, b))
                .map(([an, bn])=>an + bn);
}

function vecScale(a, scalar){
    return a.map(n=>n * scalar);
}

function vecSubstract(a, b) {
    return vecSum(a, vecScale(b, -1));
}

function vecLength(a) {
    return Math.sqrt(a.map(an=>an*an).reduce((accum, an)=> accum + an));
}

/**
 * ab is the line segment
 * p is the point which we search c, the clostest point on ab, for.
 *
 * from https://softwareengineering.stackexchange.com/a/168577
 * and https://gdbooks.gitbooks.io/3dcollisions/content/Chapter1/closest_point_on_line.html
 */
function closestPoint(a, b, p) {
    // Project p onto ab, computing the
    // paramaterized position d(t) = a + t * (b - a)
    let pa = vecSubstract(p, a) // p - a
      , ba = vecSubstract(b, a) // b - a
      , tRaw = vecDot(pa, ba) / vecDot(ba, ba)
        // Clamp T to a 0-1 range. If t was < 0 or > 1
        // then the closest point was outside the segment,
        // but on the line.
      , t = Math.min(1, Math.max(tRaw, 0))
      , ca = vecScale(ba, t)
        // Compute the projected position from the clamped t
      , c = vecSum(a, ca)
        // distance
      , d = vecLength(vecSubstract(pa, ca))
        // distance also
        // d = vecLength(vecSubstract(p, c))
      ;
    // Compute the projected position from the clamped t
    return [d, t, c];
}

function* calculateKeyframes(orderedFilteredAxisRanges) {
    let axesOrder = orderedFilteredAxisRanges.length
            ? Array.from(zip(...orderedFilteredAxisRanges))[0]
            : []
      , axesMDM = [] // min-default-max
      ;
    // var axisRanges = (typeof rapBracket === 'object')
    //     // FIXME: rapBracket, rapTolerances are global
    //     ? axisRangesForRapBracket(currentFont.axes, rapBracket, rapTolerances)
    //     : currentFont.axes
    //     ;

    for(let [axis, axisRange] of orderedFilteredAxisRanges) {
        // mdn stands for min-default-max, however, the order
        // is default-min-max expect for opsz.
        // FIXME: find out the reason behind this.
        let mdmOrder = axis === 'opsz'
                ? ['min', 'default', 'max']
                : ['default', 'min', 'max']
          , mdm = mdmOrder.filter(k=>{ // jshint ignore:line
                    // This was loosely adopted from previous code
                    // where I didn't understand the full reasoning
                    // but for the present examples it produces the
                    // same result and is much more consise.
                    if(!(k in axisRange)) {
                        if(k === 'default')
                            throw new Error('SANITY CHECK ERROR: "default" must be in any axisRange.');
                        return false;
                    }
                    if (k === 'default')
                        return true;
                    return (axisRange[k] !== axisRange['default']);
                })
                .map(k=>axisRange[k]) // jshint ignore:line
          ;
        axesMDM.push(mdm);
    }
    for(let axesValues of cartesianProductGen(axesMDM)) {
        yield Array.from(zip(axesOrder, axesValues));

        // let variationSettings = Object.fromEntries(zip(axesOrder, axesValues));
        // // FIXME: axesToFVS could take just the result of the zip
        // //        but it may get replaced entirely, so I leave it here
        // //        for the time being.
        // let fvs = axesToFVS(variationSettings);
        // // FIXME: I currently think there should be no duplicates.
        // if (fvs !== prev)
        //     fvsPerms.push(fvs);
        // else
        //     console.warn(`Found a case of duplication: ${fvs}`);
        // prev = fvs;
    }
    //return fvsPerms;

}

// For a more broadly useable tool, this should probaly be configurable per font.
// however 3 axes with each 3 (default, min, max) entries produces 3 * 3 * 3 = 27 keyframes
const REGISTERED_AXES_ORDERED = ['opsz', 'wdth', 'wght']; //, 'ital', 'slnt', 'grad', 'GRAD');

function calculateRegisteredKeyframes(axisRanges) {
    let orderedFilteredAxisRanges = [];
    // FIXME: registeredAxes is global
    for(let axis of REGISTERED_AXES_ORDERED) {
        if (!(axis in axisRanges)) {
            continue;
        }
        orderedFilteredAxisRanges.push([axis, axisRanges[axis]]);
    }
    return calculateKeyframes(orderedFilteredAxisRanges);
}

// could be a getter in VideproofFont
// as well as  return font.tables?.fvar?.axes || []
function _getFontAxisRanges(font) {
    let axisRanges = {}
      , axes = font.tables?.fvar?.axes
      ;
    if (!axes)
        return axisRanges;
    for (let axis of axes) {
        axisRanges[axis.tag] = Object.freeze({
            'name': 'name' in axis ? axis.name.en : axis.tag,
            'min': axis.minValue,
            'max': axis.maxValue,
            'default': axis.defaultValue
        });
    }
    return axisRanges;
}

function _interpolateKeyframe(t, fromKeyFrame, toKeyFrame) {
    // a xxKeyFrame looks like:
    //      [ [ "opsz", 144 ], [ "wdth", 151 ], [ "wght", 1000 ] ]
    // both keyframes must be compatible
    let result = [];
    for( let [i, [axis, fromVal]] of fromKeyFrame.entries()){
        let [, toVal] = toKeyFrame[i]
          , value = (toVal - fromVal) * t + fromVal
          ;
        result.push([axis, value]);
    }
    return result;
}

/**
 * The return value of the yield i.e. when calling:
 *          gen.next(genControl)
 * is formed like this:
 * genControl = {
 *       t: float, between 0 and < 1 (but it's mod 1 anyways)
 *            to go to the sevensth (index = 6) keyframe:
 *            t: 6 / keyframes.length
 *       duration: float, per keyframe, in seconds
 * }
 */
function* animationGenerator(performance, keyFrames, duration, newT) {
    let t = 0
      , lastExecution
        // in milli seconds, this can be changed dynamically
        // original default is 1000ms * keyFrames.length * 2
      , newDuration
      , totalDuration = keyFrames.length * duration
      ;


    // run forever
    while(true) {
        let fps = 0;
        if(newT !== undefined) {
            if(newT < 0)
                newT = 1 - (Math.abs(newT) % 1);
            else
                // newT can be used to jump to a new position or to resume
                // animation after a pause.
                t = newT % 1;
        }
        // It's initially undefined, but then either t is 0
        // or newT was set as argument.
        else if(lastExecution !== undefined) {
            let frameTime = performance.now() - lastExecution
                // Need miliseconds, hence totalDuration times 1000.
              , frameTimeFraction =  frameTime / (totalDuration * 1000)
              ;
            fps = 1000 / frameTime;
            t = (t + frameTimeFraction) % 1; // 0 >= t < 1
        }
        let frame
          , fromKeyFrameIndex
          , keyFrameT
          ;
        if(keyFrames.length === 1) {
            // don't animate a static frame
            frame = keyFrames[0];
            t = 0;
            fromKeyFrameIndex = 0;
            keyFrameT = 0;
        }
        else {
                // Also animate from keyFrames.length - 1 to 0, in a circle.
            let keyFramesPosition = keyFrames.length * t; // float: 0 >= keyFramesPosition < keyFrames.length
            fromKeyFrameIndex = Math.floor(keyFramesPosition); // int: 0 >= fromKeyFrameIndex < keyFrames.length-1
            let toKeyFrameIndex = fromKeyFrameIndex < keyFrames.length - 1
                                ? fromKeyFrameIndex + 1
                                 // circle around
                                : 0
              , fromKeyFrame = keyFrames[fromKeyFrameIndex]
              , toKeyFrame = keyFrames[toKeyFrameIndex]
              ;
            //if(!fromKeyFrame || !toKeyFrame)
            //    console.error(
            //        `t: ${t}`,
            //        `keyFrames.length: ${keyFrames.length}\n`,
            //        `fromKeyFrameIndex: ${fromKeyFrameIndex}\n`,
            //        `toKeyFrameIndex: ${toKeyFrameIndex}\n`
            //    );
            keyFrameT = keyFramesPosition % 1;
            frame = _interpolateKeyframe(keyFrameT, fromKeyFrame, toKeyFrame);
        }
        lastExecution = performance.now();
        // call next like e.g: gen.next({duration: 2})
        // duration will be mapped to newDuration
        ({ t: newT, duration: newDuration } = yield [frame, t, duration, fromKeyFrameIndex, keyFrameT, fps]);
        if(newDuration !== undefined){
            duration = newDuration;
            totalDuration = keyFrames.length * duration;
        }
    }
}

/**
 * Handy table, though so far it seems we only need the
 * first column for the src property of the @font-face rule
 *
 *   @font-face src 'format("{TYPE}");' |
 * | typical file name extension
 * | MIME Type
 * | full format name
 * -------- | ------ | ---------- | ----------
 * truetype | .ttf   | font/ttf   | TrueType
 * opentype | .otf   | font/otf   | OpenType
 * woff     | .woff  | font/woff  | Web Open Font Format
 * woff2    | .woff2 | font/woff2 | Web Open Font Format 2
 */
function getSrcFormatFromFileName(filenName) {
    let extension = filenName.split('.').pop()
      , result = ({
            ttf: 'truetype'
          , otf: 'opentype'
          , woff: 'woff'
          , woff2: 'woff2'
        })[extension]
      ;
    if(!result)
        throw new Error(`FORMAT NOT FOUND for "${filenName}" with extension "${extension}"`);
    return result;
}

// used as part of the font family (CSS) name, so we always can differentiate
// the source of the font.
class FontOrigin {
    valueOf() {
        throw new Error(`NOT IMPLEMENTED: "valueOf" in ${this.constructor.name}`);
    }
    get type () {
        throw new Error(`NOT IMPLEMENTED: "get type" in ${this.constructor.name}`);
    }
    get payload () {
        throw new Error(`NOT IMPLEMENTED: "get payload" in ${this.constructor.name}`);
    }
    get fileName() {
        throw new Error(`NOT IMPLEMENTED: "get fileName" in ${this.constructor.name}`);
    }
    get sourceFormat() {
        return getSrcFormatFromFileName(this.fileName);
    }
    toDB() {
        return [this.type, this.payload];
    }
    static fromDB([type, payload]) {
        const Constructor = {
            'from-url': FontOriginUrl
          , 'from-file': FontOriginFile
        }[type];
        return new Constructor(payload);
    }
}

// Font origin for fonts loaded by URL, using a GET request. commonly
// the fonts that are built into the app and registerd in window.remoteResources.
class FontOriginUrl extends FontOrigin {
    constructor(url) {
        super();
         Object.defineProperties(this, {
            type: {value: 'from-url', writable: false, enumerable: true}
          , url: {value: url, writable: false, enumerable: true}
        });
    }
    get fileName() {
        // CAUTION: simple split on "/" may not be sufficient!
        return this.url.split('/').pop();
    }
    get payload() {
        return this.url;
    }
    valueOf() {
        return `${this.type}::${this.url}`;
    }
}

class FontOriginFile extends FontOrigin {
    constructor(fileName) {
        super();
        Object.defineProperties(this, {
            type: {value: 'from-file', writable: false, enumerable: true}
          , fileName: {value: fileName, writable: false, enumerable: true}
        });
    }
    get payload() {
        return this.fileName;
    }
    valueOf() {
        return `${this.type}::${this.fileName}`;
    }
}


function _formatProofTag(proofName) {
    return proofName.toUpperCase().replace(/[ -]/g, '_');
}


class VideoProofDeferredFont {
    static fromFontObject(fontObject, origin, buffer=null) {
        const font = new VideoProofFont(fontObject, origin);
        return new this(origin, font.fullName, font.nameVersion, font.serializationNameParticles, buffer);
    }
    constructor(origin, fullName, nameVersion, serializationNameParticles, buffer=null) {
        Object.defineProperties(this, {
            fullName: {value: fullName, writable: false, enumerable: true}
          , nameVersion: {value: nameVersion, writable: false, enumerable: true}
          , serializationNameParticles: {value: serializationNameParticles, writable: false, enumerable: true}
          , origin: {value: origin, writable: false, enumerable: true}
          , buffer: {value: buffer, writable: false, enumerable: true}
        });
    }
}

// To keep all knowledge and resources of a font in one place.
class VideoProofFont {
    constructor(fontObject, origin, buffer=null, fontFace=null, document=null, fullName=null) {
        this._document = document;
        Object.defineProperties(this, {
            fontObject: {value: fontObject, writable: false, enumerable: true}
          , fontFace: {value: fontFace, writable: false, enumerable: true}
          , buffer: {value: buffer, writable: false, enumerable: true}
          , origin: {value: origin, writable: false, enumerable: true}
        });
        if(fullName)
            // Override the getter, this property acts as primary key,
            // make sure it stays intact.
            Object.defineProperty(this, 'fullName', {value: fullName, writable: false, enumerable: true});
        this._axisRangesCache = null;
        this._instancesCache = null;
    }

    _getName(key) {
        // default to "en"
        let name = this.fontObject.getEnglishName(key)
        //  , defaultLang = 'en'
          ;
        if(name)
            return name;
        const entry = (this.fontObject.names.unicode?.[key] || this.fontObject.names.macintosh?.[key] || this.fontObject.names.windows?.[key]);
        // Otherwise, just return the entry of the first key.
        for(let lang of Object.keys(entry))
            return entry[lang];
        throw new Error(`KEY ERROR name "${key}" not found in font.`);
    }

    get nameVersion() {
        return [
                 this._getName('fullName') // e.g. "RobotoFlex Regular"
                 // "Version 2.136" is not accepted here while
                 // "Version_2-136" is OK, seems like the "." (dot)
                 // is forbidden and the space before numbers as well.
                 // It's likely this needs more fixing in the future!
               , this._getName('version')
               ].join(' – ');
    }

    // This is used as a unique id of the font within the app and
    // as the CSS-name.
    get fullName() {
        // getting sometimes
        //      DOMException: FontFace.family setter: Invalid font descriptor
        //
        // A well working example is: "from-url RobotoFlex Regular Version_2-136"

        // "Version 2.136" is not accepted here while
        // "Version_2-136" is OK, seems like the "." (dot)
        // is forbidden and the space before numbers as well.
        //
        // "27.0d21e1" becomes "27-0d21e1" but it's not accepted as the
        // word starts with a number, so we prepend Version_ in that case
        // and make it eventually "Version_27-0d21e1"
        //
        // Issue: https://github.com/FontBureau/videoproof/issues/35
        // Fonts don't display when there are '[', ']', characters in the version string
        //
        // It's less likely now that this needs more fixing in the future
        // as theres a catch all replaceAll rule replacing characters
        // we don't know if they work with "X".
        let version = ( this._getName('version'))
                            .replaceAll('.', '-')
                            .replaceAll(' ', '_')
                            // semicolon breaks CSS selecting the family.
                            .replaceAll(';', ' ')
                            // \w: Matches any alphanumeric character
                            //     from the basic Latin alphabet,
                            //     including the underscore.
                            //     Equivalent to [A-Za-z0-9_]
                            // plus space
                            // plus hyphen
                            .replaceAll(/[^\w -]/g, 'X')
                            ;
        // Must match on beginning (^) A-Z case insensitive (i)
        if(!version.match(/^[A-Z]/i))
            version = `Version_${version}`;
        return [
                 this.origin.type
               , this._getName('fullName') // e.g. "RobotoFlex Regular"
               , version
               ].join(' ');
    }

    get serializationNameParticles() {
        // Ordered by significance, the origin info is not serialized.
        return [this._getName('fullName'), this._getName('version')];
    }

    get axisRanges() {
        if(!this._axisRangesCache ) {
            Object.defineProperty(this, '_axisRangesCache', {
                value: Object.freeze(_getFontAxisRanges(this.fontObject))
            });
        }
        return this._axisRangesCache;
    }

    get instances() {
        if(!this._instancesCache ) {
            let instances = this.fontObject.tables?.fvar?.instances || []
              , instancesList = []
              ;
            for(const {name, coordinates} of instances) {
                const usedName = 'en' in name
                        ? name.en
                        : Object.entries(name)[1] // language is at [0]
                        ;
                instancesList.push([usedName, Object.assign({}, coordinates)]);
            }
            Object.defineProperty(this, '_instancesCache', {
                value: _deepFreeze(instancesList)
            });
        }
        return this._instancesCache;
    }

    // release resources
    destroy() {
        this._document.fonts.delete(this.fontFace);
    }
}




function _makeFileInput (handleFiles, clickElement, dropElement, dragCallbacks) {
    // In this case, the input element is not even appended into the
    // document, we use it just for the browser native interface.
    var hiddenFileInput = clickElement.ownerDocument.createElement('input');
    hiddenFileInput.setAttribute('type', 'file');
    hiddenFileInput.setAttribute('multiple', 'multiple');
    hiddenFileInput.style.display = 'none'; // can be hidden, no problem

    // for the file dialogue
    function fileInputChange(e) {
        /*jshint validthis:true, unused:vars*/
        handleFiles(this.files);
    }
    function forwardClick(e) {
        /*jshint unused:vars*/
        // forward the click => opens the file dialogue
        hiddenFileInput.click();
    }

    // for drag and drop
    function stopEvent(e) {
        e.stopPropagation();
        e.preventDefault();
    }

    function dragenter(e) {
        stopEvent(e);
        if(dragCallbacks.dragenter)
            dragCallbacks.dragenter(e);
    }

    function dragover(e) {
        stopEvent(e);
        if(dragCallbacks.dragover)
            dragCallbacks.dragover(e);
    }

    function dragleave(e) {
        if(dragCallbacks.dragleave)
            dragCallbacks.dragleave(e);
    }

    function dragend(e){
        if(dragCallbacks.dragend)
            dragCallbacks.dragend(e);
    }

    function drop(e) {
        stopEvent(e);
        handleFiles(e.dataTransfer.files);
        if(dragCallbacks.drop)
            dragCallbacks.drop(e);
    }

    hiddenFileInput.addEventListener('change', fileInputChange);
    if(clickElement)
        clickElement.addEventListener('click', forwardClick);
    if(dropElement) {
        dropElement.addEventListener("dragenter", dragenter);
        dropElement.addEventListener("dragover", dragover);
        dropElement.addEventListener("dragleave", dragleave);
        dropElement.addEventListener("dragend", dragend);
        dropElement.addEventListener("drop", drop);
    }
}

// especially when we try to marry this project with varla-varfo, we'll
// have to control the CSS custom-properties thoroughly.
// FIXME: REGISTERED_AXES_ORDERED has similar content, plus, this
// could be just a function `--font-${axisTag}`, I don't think at this
// point renaming is required, but if it is a function, we can still do
// it simply and centrally.
//const AXISNAME2PROPNAME = new Map([
//            ['wght', '--font-weight']
//          , ['opsz', '--font-opsz']
//          , ['wdth', '--font-width']
//]);
function axisTag2PropName(axisTag) {
    return  `--font-${axisTag}`;
}


class _AnimationState {
    constructor(generator, keyFrames) {
        Object.defineProperties(this, {
            generator: {value: generator, writable: false, enumerable: true}
          , keyFrames: {value: keyFrames, writable: false, enumerable: true}
        });
        this._lastYield = null;
    }
    get fontName() {
        throw new Error(`NOT IMPLEMENTED: "get fontName" in abstract ${this.constructor.name}`);
    }
    toString() {
        return `[${this.constructor.name}]`;
    }
    set lastYield(value) {
        this._lastYield = value;
    }
    get lastYield() {
        return this._lastYield;
    }
    next(genControl) {
        if(!this.lastYield && genControl && ('t' in genControl || 'duration' in genControl))
            // prime the generator, so that it accepts genControl
            // maybe we could do this "priming" somewhere in constructor
            // as it seems to me not elegant this way.
            // Also, maybe we don't need this 'priming' eventually;
            this.generator.next();
        let yieldVal = this.generator.next(genControl);
        if(yieldVal.done)
            return;
        this.lastYield = yieldVal.value;
        return yieldVal.value;
    }

    toKeyFramesOrderAndCoordinates() {
        // => [keyFrameAxisOrder, keyFramesCoordinates]
        if(this.keyFrames.length === 1 && this.keyFrames[0].length === 0)
            return [null, null];
        return this.keyFrames.map(frame=>frame.length
                        ? Array.from(zip(...frame))
                        : []
            )
            .reduce((accum, [axisTags, coordinates])=>{
                if(!accum.length)
                    accum.push(axisTags, []);
                accum[1].push(coordinates);
                return accum;
            }, []);
    }
}

class AnimationStateKeyFrames extends _AnimationState {
    constructor(generator, keyFrames, fontName) {
        super(generator, keyFrames);
        Object.defineProperties(this, {
            fontName: {value: fontName, writable: false, enumerable: true}
        });
    }
}

class AnimationStateMoar extends _AnimationState {
    constructor(generator, keyFrames, baseAnimationState, axisTag) {
        super(generator, keyFrames);
        Object.defineProperties(this, {
            baseAnimationState: {value: baseAnimationState, writable: false, enumerable: true}
          , axisTag: {value: axisTag, writable: false, enumerable: true}
        });
    }
    get fontName() {
        return this.baseAnimationState.fontName;
    }
}

function _getBaseAnimationState(animationState) {
    if(animationState instanceof AnimationStateKeyFrames)
        // switch from main keyframes animation
        return animationState;

    if(animationState instanceof AnimationStateMoar)
        // switch from other moar animation
        return animationState.baseAnimationState;

    throw new Error(`UNKNOWN ANIMATION STATE ${animationState} `
                      + `(typeof ${typeof animationState})`);
}

function _getClosestPointFromKeyFrames(keyFramesCoordinates, searchLocation) {
    let distances = keyFramesCoordinates.map((keyframe, i, arr)=>{
            let nextKeyframe = i + 1 === arr.length ? arr[0] : arr[i+1];
            return  /*[distance, t, point] = */ closestPoint(keyframe, nextKeyframe, searchLocation);
        })
        // search lowest distance
      , keyFrameIndex = 0
      , lowestD = distances[keyFrameIndex][0]
      ;

    for(let [i, [d, ]] of distances.entries()) {
        if(d < lowestD) {
            lowestD = d;
            keyFrameIndex = i;
        }
    }
    // Calculate global t, i.e. over all keyframes, as keyFrameT
    // is only relative to the current keyFrame.
    let [distance, keyFrameT, point] = distances[keyFrameIndex]
     , keyFramesPosition = keyFrameIndex + keyFrameT
     , t = keyFramesPosition/keyFramesCoordinates.length
     ;
    return [distance, t, point];
}

function _uiBuildGlyphsSelectOptions(doc, charGroups) {
    let root = doc.createDocumentFragment()
      , makeOption = (label, value)=>{
            let option = doc.createElement('option');
            option.textContent = label;
            option.value = value;
            return option;
        }
      , makeOptionsFromCharGroups = (currentPath, container, data)=>{

            if (currentPath[currentPath.length-1][0] === '_')
                // ignore top-level "_extended" item
                return;
            if(data === null || typeof data !== 'object') {
                // this is an option
                let option = makeOption(currentPath[currentPath.length-1], currentPath.join('.'));
                (container || root).append(option);
                return;
            }
            if ('_default' in data) {
                // Special kind of option, that can bring it's own _extended chars.
                makeOptionsFromCharGroups(currentPath, container, null);
                return;
            }

            // Go deeper.
            container = doc.createElement('optgroup');
            container.label = currentPath.join(' ');
            root.append(container);

            for(let [name, dataItem] of Object.entries(data)) {
                let _subPath = currentPath.slice();
                _subPath.push(name);
                makeOptionsFromCharGroups(_subPath, container, dataItem);
            }
        }
      , allOptgroup = doc.createElement('optgroup')
      ;
    allOptgroup.label = 'All';
    allOptgroup.append(makeOption('All by GlyphID', 'all-gid'));
    allOptgroup.firstChild.selected = true;
    allOptgroup.append(makeOption('All by group', 'all-groups'));

    root.append(allOptgroup);
    for(let [name, data] of Object.entries(charGroups))
        makeOptionsFromCharGroups([name], root, data);
    root.append(makeOption('None of the above', 'misc'));
    return root;
}

function getExtendedChars(charGroups, chars) {
    return Array.from(new Set(chars))
                .reduce((col, c)=>[...col, ...(charGroups._extended[c] || [])], []);
}

function getCharsFromCharGroups(charGroups, keyPath) {
    let target = keyPath.split('.')
                        .reduce((obj, key)=>obj[key], charGroups)
      , chars, extendedChars
      , getGlobalExtended = chars=>getExtendedChars(charGroups, chars)
      ;

    if(typeof target === 'object' && '_default' in target
                                  && '_extended' in target) {
        chars = [...target._default];
        extendedChars = [...target._extended,
                // The original implementation did this as well, despite
                // that there was no effect due to the provided data.
                // I have to assume that it was intentional, but it
                // doesn't feel like the correct thing to do.
                ...getGlobalExtended(chars)];
    }
    else if(typeof target === 'string') {
        chars = [...target];
        extendedChars = [...getGlobalExtended(target)];
    }
    else
        throw new Error(`Don't know how to handle item at ${keyPath}: ${target}`);
    return [chars, extendedChars];
}

function getKnownChars(charGroups) {
        // Removes duplicates, the original implementation did not do this,
        // but it makes sense, because the charGroups data is hand edited.
    let charsSet = new Set()
      , addChars = function(entry) {
            switch (typeof entry) {
                case "string":
                    for(let k of entry)
                        charsSet.add(k);
                    break;
                case "object":
                    for(let k in entry)
                        addChars(entry[k]);
                    break;
            }
        }
    ;
    addChars(charGroups);
    return charsSet;
}

// find characters in the font that aren't in any of the defined glyph groups
function getMiscChars(knownCharsSet, font) {
    var chars = new Set();

    for(let k of Object.keys(font.fontObject.tables.cmap.glyphIndexMap)) {
        let c = String.fromCodePoint(parseInt(k, 10));
        if(!knownCharsSet.has(c))
            chars.add(c);
    }
    return chars;
}

function _filterCmap (cmap, charsSet) {
    return new Set(Array.from(charsSet)
                        .filter(c=>c.codePointAt(0) in cmap));
}

function _getCmapAndFilterCmapFromFont(font) {
    let cmap = font.fontObject.tables.cmap.glyphIndexMap;
    return [
        cmap
      , /*filterCmap*/ charsSet=>_filterCmap(cmap, charsSet)
    ];
}

function _getCharsForKey(filterCmap, charGroups, key) {
    return getCharsFromCharGroups(charGroups, key)
                        .map(chars=>[...filterCmap(new Set(chars))]);
}

function getCharsForKey(charGroups, font, key) {
    const [, filterCmap]  = _getCmapAndFilterCmapFromFont(font);
    return _getCharsForKey(filterCmap, charGroups, key);
}

function getCharsForSelectUI(charGroups, font, value) {
    let knownCharsSet, chars
      , extendedChars = []
      , [cmap, filterCmap] = _getCmapAndFilterCmapFromFont(font)
      ;
    switch(value) {
        case 'all-gid':
            chars= Object.keys(cmap)
                        .sort((a, b)=>cmap[a] - cmap[b])
                        .map(u=>String.fromCodePoint(parseInt(u, 10)))
                        ;
            break;
        case 'all-groups':
            knownCharsSet = filterCmap(getKnownChars(charGroups));
            chars = [...knownCharsSet, ...getMiscChars(knownCharsSet, font)];
            break;
        case 'misc':
            knownCharsSet = getKnownChars(charGroups);
            chars = [...getMiscChars(knownCharsSet, font)];
            break;
        // currently unused
        case 'unicodes':
            chars = Object.keys(cmap)
                        .map(c=>parseInt(c, 10))
                        .sort((a, b)=>a-b)
                        .map(u=>String.fromCodePoint(parseInt(u, 10)))
                        ;
            break;
        default:
            [chars, extendedChars] = _getCharsForKey(filterCmap, charGroups, value);
            break;
    }
    return [chars, extendedChars];
}

// via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
function _deepFreeze(object) {
    // Retrieve the property names defined on object
    const propNames = Object.getOwnPropertyNames(object);

    // Freeze properties before freezing self
    for (const name of propNames) {
        const value = object[name];

        if (value && typeof value === "object") {
          _deepFreeze(value);
        }
    }
    return Object.freeze(object);
}

function _mapGetOrInit(map, name, init) {
    let result = map.get(name);
    if(result === undefined) {
        result = init();
        map.set(name, result);
    }
    return result;
}

class _UIBase{
    uiEnable () {
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.uiEnable!`);
    }
    uiDisable () {
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.uiDisable!`);
    }
    set value(value) {
        /*jshint unused: false */
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.set value!`);
    }
    get value() {
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.get value!`);
    }


    static SERIALIZATION_TYPE_FLAT = Symbol('SERIALIZATION_TYPE_FLAT'); // jshint ignore:line

    serializeForUrlGeneric() {
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.serializeForUrlGeneric!`);
    }
    deserializeFromUrlGeneric(){
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.deserializeFromUrlGeneric!`);
        // must return boolean "changed"
    }

    serializeForUrl() {
        if(typeof this._serializeForUrl === 'function') {
            return this.hasOwnProperty(_UIBase.SERIALIZATION_TYPE_FLAT)
                ? [this._serializeForUrl()]
                : this._serializeForUrl()
                ;
        }
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.serializeForUrl!`);
    }

    deserializeFromUrl(index, strings) {
        // return an array:
        //       [ integer: number of consumed items,
        //         any type: value,
        //         string Or Null: message
        //       ]
        // value is valid to apply to the element value setter
        //      let [consumed, value, message] = this._deserializeFromUrl(strValue)
        //      if(message !== null)
        //          throw new Error(message);
        //      this.value = value;
        if(typeof this._deserializeFromUrl === 'function')
            return this.hasOwnProperty(_UIBase.SERIALIZATION_TYPE_FLAT)
                    ? [1, ...this._deserializeFromUrl(strings[index])]
                    : this._deserializeFromUrl(index, strings)
                    ;
        throw new Error(`NOT IMPLEMENTED: ${this.constructor.name}.deserializeFromUrl.`);
    }
}

class UIManualAxisLocations extends _UIBase {
    // Order of the legacy variable type tools app appearance,
    // which actually uses the order of axis as in the font.
    // However, the axis order seems  to have changed and the order
    // seen in the app seems more intuitive to use, so here comes a
    // custom order, also, these axes displayed when "View all axes"
    // is not checked.
    static REGISTERED_AXES_ORDERED = ['wght', 'wdth', 'opsz', 'ital', 'slnt', 'grad', 'GRAD']; //jshint ignore:line

    constructor (parentAPI, domTool, requiresUpdateDependencies) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        this._state = undefined;
        this.active = false;
        this.element = domTool.createElement('div', {class: 'manual_axis_locatioms'},  domTool.createElement('h3', {}, 'Manual Axis Locations'));
        this.requiresUpdateDependencies = new Set(requiresUpdateDependencies);
        this._value = new Map();
        this._axesInterfaces = new Map();
        this._autoOPSZInput = null;
        this._viewAllAxes = null;
        this._styleSelect = null;
    }

    get opszIsAuto() {
        return this._axesInterfaces.has('opsz') && this._autoOPSZInput.checked;
    }

    static copyValue(valueArray) {
        return valueArray.map(([axisTag, axisValue])=>[axisTag, Object.assign({}, axisValue)]);
    }

    static CUSTOM_STYLE_VALUE = 'custom'; //jshint ignore:line

    _newStyleSelect() {
        let container = this._domTool.createElementfromHTML('label', {}
                        , `Style: <select></select>`);
        return {
            container: container
          , input: container.querySelector('select')
          , _domTool: this._domTool
          , _instances: []
          , _locationsIndex: new Map()
          , setInstances(instances) {
                this._instances = instances;
                // instances = this._parentAPI.getFont().instances
                const makeOption = (value, label)=>this._domTool
                                .createElement('option', {value}, label)
                  , options = []
                  ;

                if(instances.length)
                    this.container.style.removeProperty('display');
                else
                    this.container.style.display = 'none';


                options.push(makeOption(
                    UIManualAxisLocations.CUSTOM_STYLE_VALUE, '(custom value)'));

                this._locationsIndex.clear();

                for(const [i, [name, locations]] of instances.entries()) {
                    const key = this._locationsToKey(locations);
                    this._locationsIndex.set(key, i);
                    options.push(makeOption(i, name));
                }
                this._domTool.clear(this.input);
                this.input.append(...options);
                this.input.value = UIManualAxisLocations.CUSTOM_STYLE_VALUE;
            }
          , get value() {
                return this._getCurrentLocations();
            }
          , set value(locations) {
                this.input.value = this._getInstanceValueForLocations(locations);
            }
          , remove: function(){
                this.container.remove();
            }
          , _locationsToKey(locations) {
                return Object.entries(locations)
                            .sort(([tagA], [tagB])=>{
                                   if (tagA < tagB)
                                        return -1;
                                    if (tagA > tagB)
                                        return 1;
                                    return 0;
                            })
                            .map(([axisTag, val])=>`${axisTag}:${val}`)
                            .join(';')
                            ;
            }
          , _getCurrentLocations() {
                if(this.input.value === UIManualAxisLocations.CUSTOM_STYLE_VALUE)
                    return undefined;
                return this._instances[this.input.value]?.[1];
            }
          , _getInstanceValueForLocations(locations) {
                const key = this._locationsToKey(locations)
                  , value = this._locationsIndex.get(key)
                  ;
                return value !== undefined
                                ? value
                                : UIManualAxisLocations.CUSTOM_STYLE_VALUE
                                ;
            }
        };
    }

    _styleSelectChangeHandler(/*event*/){
        const locations = this._styleSelect.value;
        if(!locations)
            return;
        for(let [axisTag, location] of Object.entries(locations))
            this._value.get(axisTag).location = location;
        this._updateUI(`AXIS_CHANGE@style`);
        this._parentAPI.stateChangeHandler();
    }

    _updateStyleSelectOptions() {
        const instances = this._parentAPI.getFont().instances;
        this._styleSelect.setInstances(instances);
    }

    update(...changedDependencyNames) {
        let dependencies = new Set(changedDependencyNames)
          , changed = false
          ;

        if(dependencies.has('fontSize') && this.opszIsAuto) {
            // FIXME: setting an axis value could be a method!
            let value = this._parentAPI.getFontSize();
            this._axesInterfaces.get('opsz').value = value;
            const axisValue = this._value.get('opsz');
            axisValue.location = value;
            axisValue.autoOPSZ = true;
            changed = true;
        }
        if(dependencies.has('fontName')) {
            this._updateStyleSelectOptions();
            changed = true;
        }
        return changed;
    }
    // FIXME: value needs to be more complex, e.g. OPSZ can be toggled
    // to use the same as font-size. It would be nice to hace it disabled
    // then, but show the used font-size.
    // Similarly, other axes should be set to "explicit-default" or
    // manual, otherwise we can't determine if the dialed in value is
    // meant to be explicit when it is also the default value. However,
    // in this case, it's maybe sufficient to just use exlicit-default mode
    // when it is the same value.
    get value() {
        // Intended is to return just a readable, hence the deepFreeze,
        // view of the value, the copy, via Object.assign,
        // is made because that way the
        // internal value is still readable. It's also not a
        // live-value-changing semantic.
        return _deepFreeze(this.constructor.copyValue(Array.from(this._value)));
    }
    set value(val) {
        if(!Array.isArray(val)) {
            // don't accept nothing
            throw new Error(`TYPE ERROR: manualAxisLocations set value is not an Array! Should be something! SET BETTER DEFAULTS: ${val}`);
        }
        else
            this._value = new Map(this.constructor.copyValue(val));
        this._initUI();// !update the axes interfaces
    }

    static serializeForUrl(value) {
        const axisLocations = []
          , result = []
          ;
        let opszIsAuto;
        for(const [axisTag, {location, 'default':defaultVal, autoOPSZ}] of value) {
            // remove axes at default values
            if(axisTag === 'opsz')
                opszIsAuto = autoOPSZ === undefined ? true : (!!autoOPSZ);
            if(location === defaultVal) continue;
            axisLocations.push([axisTag, location]);
        }

        const axisSerialization = _serializeAxisLocations(axisLocations);
        result.push(axisSerialization);
        if(opszIsAuto !== undefined)
            result.push(opszIsAuto ? '1': '0');
        return result;
    }

    _serializeForUrl() {
        return this.constructor.serializeForUrl(this.value);
    }

    _deserializeFromUrl(index, strings) {
        let consumed = 0
          , currentIndex = index
          ;
        const axisSerializationStr = strings[currentIndex]
          , [axisLocations, message] = _deserializeAxisLocations(axisSerializationStr)
          ;
        currentIndex += 1;
        consumed += 1;
        if(message)
            return [0, null, message];

        // has opsz
        const newValue = Object.fromEntries(axisLocations.map(
                        ([axisTag, location])=>[axisTag, {location}]));

        if(this._value.has('opsz')) {
            const opszIsAutoStr = strings[currentIndex];
            currentIndex += 1;
            consumed += 1;
            let opszIsAuto = false;
            if(opszIsAutoStr === '1')
                opszIsAuto = true;
            else if(opszIsAutoStr !== '0')
                return [0, null, `opszIsAutoStr must be "0" or "1" but is "${opszIsAutoStr}" @${currentIndex}`];
            if('opsz' in newValue)
                newValue.opsz.autoOPSZ = opszIsAuto;
            else
                newValue.opsz = {autoOPSZ: opszIsAuto};
        }

        // This logic is so far externalized into the proof init methods
        // that current font/state must be set/active already!
        const value = this.constructor.copyValue(
                Array.from(this._value)
        );
        for(const [axisTag, axisValue] of value) {
            if(!(axisTag in  newValue)) continue;
            Object.assign(axisValue, newValue[axisTag]);
        }

        return [consumed, value, null];
    }

    uiEnable() {
        this._state = 'enabled';
        this.active = true;
        this._parentAPI.insertElement(this.element);
        for(const axisUI of this._axesInterfaces.values())
            axisUI.uiEnable();
    }
    uiDisable() {
        this._state = 'disabled';
        this.active = false;
        DOMTool.removeNode(this.element);
        for(const axisUI of this._axesInterfaces.values())
            axisUI.uiDisable();
    }

    _axisChangeHandler(axisTag) {
        const axisValue = this._value.get(axisTag);
        axisValue.location = this._axesInterfaces.get(axisTag).value;
        this._updateUI(`AXIS_CHANGE@${axisTag}`);
        this._parentAPI.stateChangeHandler();
    }

    _setAutoOPSZ(autoOPSZ) {
        if(!this._value.has('opsz'))
            return;
        if(autoOPSZ === undefined)
            autoOPSZ = true;
        let axisUI = this._axesInterfaces.get('opsz')
          , axisValue = this._value.get('opsz')
          ;
        if(!autoOPSZ) {
            axisUI.passive = false;
            axisValue.autoOPSZ = false;
            this._autoOPSZInput.checked = false;
        }
        else {
            axisUI.passive = true;
            axisValue.autoOPSZ = true;
            this._autoOPSZInput.checked = true;
            let value = this._parentAPI.getFontSize();
            axisUI.value = value;
            axisValue.location = value;
        }
    }

    _autoOPSZChangeHandler(/*event*/) {
        this._setAutoOPSZ(this._autoOPSZInput.checked);
        this._updateUI(`AXIS_CHANGE@autoOPSZ`);
        this._parentAPI.stateChangeHandler();
    }

    _newCheckbox(label) {
        let container = this._domTool.createElementfromHTML('label', {}
                        , `<input type="checkbox" /> ${label}`);
        return {
            container: container
          , input: container.querySelector('input')
          , get checked(){
                return this.input.checked;
            }
          , set checked(val){
                this.input.checked = !!val;
            }
          , remove: function(){
                this.container.remove();
            }
          , setDisplay(show) {
                if(show)
                    this.container.style.removeProperty('display');
                else
                    this.container.style.display = 'none';
            }
          , disable() {
                this.container.classList.add('disabled');
                this.input.disabled = true;
            }
          , enable() {
                this.container.classList.remove('disabled');
                this.input.disabled = false;
            }
        };
    }

    _newAutoOPSZInput() {
        return this._newCheckbox('Mirror size changes');
    }

    _newViewAllAxes() {
        return this._newCheckbox('View all axes');
    }

    _toggleAxesDisplay() {
        const displayAll = this._viewAllAxes.checked
          , alwaysDisplayed = new Set(UIManualAxisLocations.REGISTERED_AXES_ORDERED)
          ;
        for(const [axesTag, input] of this._axesInterfaces.entries()) {
            if(alwaysDisplayed.has(axesTag))
                // Never hidden, must not be turned back on.
                continue;
            if(displayAll)
                input.element.style.removeProperty('display');
            else
                input.element.style.display = 'none';
        }
    }

    _initUI() {
        const insertElement = element=>this.element.append(element);
        for(const axisUi of this._axesInterfaces.values())
            axisUi.destroy();
        this._axesInterfaces.clear();
        if(this._autoOPSZInput) {
            this._autoOPSZInput.remove();
            this._autoOPSZInput = null;
        }

        if(!this._styleSelect) {
            this._styleSelect = this._newStyleSelect();
            this._updateStyleSelectOptions();
            this._styleSelect.input.addEventListener('change', this._styleSelectChangeHandler.bind(this));
            insertElement(this._styleSelect.container);
        }

        if(!this._viewAllAxes) {
            // This is kind of internal state an currently not serialized or a dependency of something.
            this._viewAllAxes = this._newViewAllAxes();
            this._viewAllAxes.input.addEventListener('change', ()=>this._toggleAxesDisplay());
            insertElement(this._viewAllAxes.container);
        }

        const alwaysDisplayed = new Set(UIManualAxisLocations.REGISTERED_AXES_ORDERED)
          , locations = []
          ;
        let hasHiddenAxes = false
          , hasNonDefaultHiddenAxes = false
          ;
        for(const axisTag of [UIManualAxisLocations.REGISTERED_AXES_ORDERED, ...this._value.keys()]) {
            if(this._axesInterfaces.has(axisTag))
                //seen
                continue;
            if(!this._value.has(axisTag))
                // It's in REGISTERED_AXES_ORDERED but not in the font
                continue;

            const {name, min, max, step, location, 'default':defaultVal, autoOPSZ} = this._value.get(axisTag);

            if(!alwaysDisplayed.has(axisTag)){
                hasHiddenAxes = true;
                if(defaultVal !== location)
                    hasNonDefaultHiddenAxes = true;
            }

            if(axisTag === 'opsz') {
                this._autoOPSZInput = this._newAutoOPSZInput();
                this._autoOPSZInput.checked = autoOPSZ === undefined
                            ? true
                            : autoOPSZ
                            ;
                this._autoOPSZInput.input.addEventListener('change',
                                this._autoOPSZChangeHandler.bind(this));
            }
            const input = new UINumberAndRangeInput(
                    {
                        insertElement: insertElement
                      , enableElement: this._parentAPI.enableElement
                      , disableElement: this._parentAPI.disableElement
                      , stateChangeHandler: ()=>this._axisChangeHandler(axisTag)
                    }
                  , this._domTool, `axis-${axisTag}`, `${name} (${axisTag})`, undefined
                  , {min, max, step, value: (
                            axisTag === 'opsz' && this.opszIsAuto
                                ? this._parentAPI.getFontSize()
                                : location
                            )
                    }
                )
              ;
            if(axisTag === 'opsz') {
                insertElement(this._autoOPSZInput.container);
                if(this.opszIsAuto)
                    input.passive = true;
                locations[axisTag] = this._autoOPSZInput.checked
                                            ? defaultVal
                                            : parseFloat(input.value)
                                            ;
            }
            else
                locations[axisTag] = location;
            this._axesInterfaces.set(axisTag, input);
        }

        // Not sure if this automatic behavior will be annoying.
        // We could either not do it, or save the toggle state along
        // with this._value.
        this._viewAllAxes.checked = hasNonDefaultHiddenAxes;
        this._toggleAxesDisplay();
        this._viewAllAxes.setDisplay(hasHiddenAxes);

        // FIXME: initUI should not manipulate the value!
        if(this._autoOPSZInput)
            this._setAutoOPSZ(this._autoOPSZInput.checked);

        this._styleSelect.value = locations;
    }

    _updateUI() {
        const locations = {};
        for(const [axisTag, axisValue] of this._value.entries()) {
            const axisUI = this._axesInterfaces.get(axisTag);
            if(axisUI.value !== axisValue.location)
                axisUI.value = axisValue.location;
            if(axisTag === 'opsz') {
                this._setAutoOPSZ(axisValue.autoOPSZ);
                locations[axisTag] = axisValue.autoOPSZ === false
                            ? axisValue.location
                            : axisValue.default
                            ;
            }
            else
                locations[axisTag] = axisValue.location;
        }
        this._styleSelect.value = locations;
    }

    disable(...axisTags) {
        for(const [axesTag, input] of this._axesInterfaces.entries()) {
            let disable = axisTags.includes(axesTag);
            input[disable ? 'disable' : 'enable']();
            if(axesTag === 'opsz')
                this._autoOPSZInput[disable ? 'disable' : 'enable']();
        }
    }
}

class UIMultipleTargets extends _UIBase {

    isSynchronisationItem = true; // jshint ignore:line

    constructor(parentAPI, requiresUpdateDependencies) {
        super();
        this._parentAPI = parentAPI;

        this._states = null;  // this will hold the states array

        this.uiStateFields = null; // e.g. the contents of TYPESPEC_MULTIPLE_TARGETS
        this._uiStateFieldsSet = null;
        this.isActive = false;
        this._amountOfTargets = 0;
        this._activeTarget = 0;
        this.requiresUpdateDependencies = new Set(requiresUpdateDependencies);
    }

    get states () {
        // Would be better to return something immutable.
        return this._states;
    }

    // not sure if this will be required
    get value() { return this.states; }
    set value([amountOfTargets, activeTarget, states]) {
        this._amountOfTargets = amountOfTargets;
        this._states = amountOfTargets > 0 ? states : null;
        this.setActiveTarget(amountOfTargets > 0 ? activeTarget : null);
    }

    _serializeForUrl() {
        const value = this.value
           , result = [`${this._amountOfTargets}`]
           ;
        if(this._amountOfTargets === 0)
            return result;
        result.push(`${this._activeTarget}`);
        for(let i=0;i<this._amountOfTargets;i++) {
            const state = value[i];
            for(let k of this.uiStateFields)
                result.push(...this._parentAPI.helpSerializeValue(k, state[k]));
        }
        return result;
    }

    _deserializeFromUrl(index, strings) {
        // this.uiStateFields is null proof is not loaded!
        // i.e. load proof first!
        const result = [];
        let consumed = 0
          , currentIndex = index
          ;
        const amountOfTargets = parseInt(strings[currentIndex]);
        if(isNaN(amountOfTargets))
            return [0, null, `Can't parse amountOfTargets as number (NaN) "${strings[currentIndex]}" at ${currentIndex}.`];
        if(amountOfTargets < 0)
            return [0, null, `Field amountOfTargets can't be negative but `
                + `it is ${amountOfTargets} from "${strings[currentIndex]}" `
                + `at ${currentIndex}.`];
        currentIndex += 1;
        consumed += 1;
        result.push(amountOfTargets);
        if(amountOfTargets === 0)
            return [consumed, result, null];
        const activeTarget = parseInt(strings[currentIndex]);
        if(activeTarget < 0 || activeTarget >= amountOfTargets || isNaN(activeTarget))
            return [0, null, `Field activeTarget must be between 0 `
                + `and target amount -1 ${amountOfTargets -1} but is ${activeTarget} `
                + `from "${strings[currentIndex]}" at ${currentIndex}.`];
        currentIndex += 1;
        consumed += 1;
        result.push(activeTarget);

        const states = [];
        for(let i=0;i<amountOfTargets;i++) {
            const state = {};
            for(const k of this.uiStateFields) {
                let [subConsumed, value, message] = this._parentAPI.helpDeserializeValue(k, currentIndex, strings);
                if(message)
                    return [0, null, `[#${i}][${k}] ${message} (@${currentIndex})`];
                currentIndex += subConsumed;
                consumed += subConsumed;
                state[k] = value;
            }
            states.push(state);
        }
        result.push(states);
        return [consumed, result, null];
    }

    get activeState() {
        return this._states[this._activeTarget];
    }

    hasField(name) {
        return this._uiStateFieldsSet.has(name);
    }

    // FIXME: in this particular case e.g. when fontName chnages we should
    //        update (maybe newly initialized/initTargets) all states,
    //        also inactive ones, to contain the new font defaults, and
    //        then, the proof must be updated (but not newly initialized).
    setValue (name, value) {
        // This is interesting as we get informed about fontName changes
        // in here, but in the current version/use case we don't want to
        // set that value, but rather update all values according to a plan
        //
        // in dependency thinking, we could argue changing fontName should
        // trigger "initTargets" much more than this method, it's semantically
        // different! There, the `defaults` argument would change and
        // likely the other arguments would stay the same. So, it could be
        // split into two methods, on just to reset the defaults. It should,
        // however, happen at the same early stage as setValue.
        // Maybe this requires a new kind of dependency declaration...!T
        //
        // BUT WHERE and HOW?
        if(this.uiStateFields.indexOf(name) === -1)
            throw new Error(`KeyError "${name}" not in: ${this.uiStateFields.join(', ')}.`);
        // FIXME: add comparison for more complex values! (fontLeading, manualAxisLocations)
        const changed = this.activeState[name] !== value;
        if(changed)
            this.activeState[name] = value;
        return changed;
    }

    getValue (name) {
        if(this.uiStateFields.indexOf(name) === -1)
            throw new Error(`KeyError "${name}" not in: ${this.uiStateFields.join(', ')}.`);
        return this.activeState[name];
    }

    setActiveTarget(activeTarget) {
        // Collect current values at _activeTarget
        // (should rather be always up to date) and
        // save to this._states[this._activeTarget]..
        this._activeTarget = activeTarget;
        this._parentAPI.stateChangeHandler();
    }

    getActiveTarget() {
        return this._activeTarget;
    }

    update(...changedDependencyNames) {
        if(!this._updateFunc)
            return;
        let defaults = this._updateFunc(...changedDependencyNames);
        if(defaults)
            return this._updateTargets(defaults);
    }

    _updateTargets(defaults) {
        const changedActiveFields = [];

        for(let i=0;i<this._amountOfTargets;i++) {
            let state = {};
            // if(!this.activeState || i !== this._activeTarget) {
            //     state = {}
            //     this._states[i] = state;
            // }
            // If it weren't about the Error, this loop could be just a
            // copy of the object:
            //    state[k] = Object.assign({}, defaults[i]);
            for(let k of this.uiStateFields) {
                if(!defaults[i] || !(k in defaults[i])) {
                // This is drastic, but a missing state or
                // e.g. a default like `null` that needs to
                // be handled specially is not really better.
                // But, a state field, like `manualAxisLocations`
                // could come with/be initialized with generic
                // default values, could be better than having
                // repeated empty defaults attached to the template.
                // Also, not sure the template should know how or
                // decide about values of external fields so much.
                    throw new Error(`Initial default value missing for target #${i} state field ${k}`);
                }
                const value = defaults[i][k];
                // this is also called on init, before there's an activeState
                if(this.activeState && i === this._activeTarget) {
                    let changed = this.setValue(k, value);
                    if(changed)
                        changedActiveFields.push(k);
                }
                //else
                    // CAUTION: is a reference if mutable,
                    // hence, defensive deepCopy here would be an option
                    // However, I prefer deepFreeze from the caller/owner
                    // of defaults as a workaround, it will raise much
                    // closer to where an actual copy is required.
                state[k] = value;
            }
            this.states[i] = state;
        }
        return changedActiveFields;
    }

    initTargets (amountOfTargets, uiStateFields, updateFunc, defaults) {
        if(!this.isActive)
            // Not so important, rather just to support
            // my own mental model of application
            // control flow.
            throw new Error('multipleTargets: Called init before uiEnable.');

        this._updateFunc = updateFunc;
        this.uiStateFields = Object.freeze(uiStateFields.slice());
        this._uiStateFieldsSet = new Set(this.uiStateFields);
        this._amountOfTargets = amountOfTargets;
        this._states = [];

        // that's like a reset
        this._updateTargets(defaults);
        // the target UIs will need to be updated!


        return this.states;
    }

    uiEnable () {
        if(this.isActive)
            // Rather important, as we must subscribe/unsubscribe
            // and if there's a subscription already, we should
            // not forget to unsubscribe from it.
            // However, unsubscription could be handled here
            // instead of throwing the error.
            throw new Error('multipleTargets.uiEnable called but is already active!');
        this.isActive = true;
    }

    uiDisable () {
        if(!this.isActive) return;
        this.uiStateFields = null;
        this._uiStateFieldsSet = null;
        this._states = null; // de-init here?
        this.isActive = false;
    }
}
function _getInputStepsSizeForMinMax(min, max) {
    let distance = Math.abs(min - max);
    if(distance >= 100) {
        return '1'; //10 ** 0
    }
    if(distance >= 10) {
        return '0.1'; // 10 ** - 1
    }
    return '0.01'; // 10 ** -2
}


const UI_GRID_DIMENSION_TEMPLATE = `<fieldset
    class="grid_dimension"
><legend>(INSERT LABEL)</legend>
    <label class="grid_dimension-axis_label">Axis <select class="grid_dimension-axis">
    </select></label>
    <label class="grid_dimension-from_label">From
        <input type="number" size="4" class="grid_dimension-from"></label>
    <label class="grid_dimension-to_label">To
        <input type="number" size="4" class="grid_dimension-to"></label>
    <label class="grid_dimension-stepping_label">Stepping by
    <select class="grid_dimension-stepping">
        <option value="steps">Amount</option>
        <option value="size">Step size</option>
    </select></label>
    <label class="grid_dimension-stepping_value_label"
        ><span class="grid_dimension-stepping_value_label-dynamic">(amount or size)</span>
        <input type="number" size="3" min="0" class="grid_dimension-stepping_value"></label>
    <span class="grid_dimension-other-stepping_output">(amount or size X)</span>
</fieldset>`;

class UIGridDimension extends _UIBase {
    constructor(parentAPI, domTool
             , baseClass
             , label
    ) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        [this.element, this._uiElements] = this._initTemplate(baseClass, label);
        this._axesMap = null;
    }

    _steppingValueFromSizeToStepsAmount(stepSize, from, to) {
        // was step size => return steps amount
        const distance = Math.abs(from - to);
        if(stepSize <= 0)
            // throw new Error(`VALUE ERROR stepSize must be bigger than 0 but is ${stepSize}.`);
            return 0;
        return distance/stepSize;
    }

    _steppingValueFromStepsAmountToSize(stepsAmount, from, to) {
        // was steps amount => return size
        const distance = Math.abs(from - to);
        if(stepsAmount <= 0)
            // throw new Error(`VALUE ERROR stepsAmount must be bigger than 0 but is ${stepsAmount}.`);
            return 0;
        return distance/stepsAmount;
    }

    _genericInputEventHandler(elementKey/*, event*/) {
        if(elementKey === 'selectAxis') {
            this.axisTag = this._uiElements.selectAxis.value;
        }
        else if(elementKey === 'selectStepping') {
            this.setStepping(this.stepping);// has UI side effects!
            if(this.stepping === 'steps') {
                this.steppingValue = this._steppingValueFromSizeToStepsAmount(this.steppingValue, this.from, this.to);
            }
            else if(this.stepping === 'size') {
                this.steppingValue = this._steppingValueFromStepsAmountToSize(this.steppingValue, this.from, this.to);
            }
            else
                throw new Error(`NOT IMPLEMENTED setting of stepping "${this.stepping}".`);
        }
        else if(elementKey === 'steppingValue')
            this.steppingValue = this.steppingValue;// validation + side effects
        else if(elementKey === 'from')
            this.from = this.from;// validation + side effects
        else if(elementKey === 'to')
            this.to = this.to;// validation + side effects

        this._parentAPI.stateChangeHandler();
    }

    _initTemplate(baseClass, label) {
        const fragment =  this._domTool.createFragmentFromHTML(UI_GRID_DIMENSION_TEMPLATE)
          , container = fragment.firstChild
          , legend = container.querySelector('legend')

          , uiElements = {
                selectAxis: container.querySelector('.grid_dimension-axis')
              , from: container.querySelector('.grid_dimension-from')
              , to: container.querySelector('.grid_dimension-to')
              , selectStepping: container.querySelector('.grid_dimension-stepping')
              , steppingValue: container.querySelector('.grid_dimension-stepping_value')

              , steppingLabelDynamic: container.querySelector('.grid_dimension-stepping_value_label-dynamic')
              , steppingOtherOutput: container.querySelector('.grid_dimension-other-stepping_output')
                // Putting these in here for ease of use.
              , LABELTEXT_AMOUNT: 'Steps' // could be amount
              , LABELTEXT_STEP_SIZE: 'Size' // could be Step Size
            }
          ;
        for(const key of ['selectAxis', 'from', 'to', 'selectStepping', 'steppingValue']) {
            const element = uiElements[key]
              , eventType = element.tagName === 'INPUT'
                    ? 'input' // feedback as you type
                    : 'change'
              ;
            element.addEventListener(eventType, this._genericInputEventHandler.bind(this, key));
        }
        container.classList.add(baseClass);
        legend.textContent = label;
        this._parentAPI.insertElement(container, uiElements);
        return [container, uiElements];
    }

    _parseAndCheck(key, valueStr) {
        let value = null
          , message = null
          ;
        switch(key) {
            case 'axisTag':
                {
                const options = Array.from(this._uiElements.selectAxis.options)
                                     .map(o=>o.value);
                if(!options.includes(valueStr))
                    message = `${key} must be one of ${options.join(', ')} but is "${valueStr}"`;
                else
                    value = valueStr;
                }
                break;
            case 'from':
            case 'to':
                value = typeof valueStr === 'string'
                    ? parseFloat(valueStr)
                    : valueStr
                    ;
                if(typeof value !== 'number') {
                    message = `${key} must be a number but is ${typeof value}`;
                    value = null;
                }
                else if(isNaN(value)) {
                    message = `${key} can't parse as a number "${valueStr}"`;
                    value = null;
                }
                break;
            case 'steppingValue':
                value = typeof valueStr === 'string'
                    ? parseFloat(valueStr)
                    : valueStr
                    ;
                if(typeof value !== 'number') {
                    message = `${key} must be a number but is ${typeof value}`;
                    value = null;
                }
                else if(value < 0 || isNaN(value)) // is NaN when input field is empty
                    value = 0;
                break;
            case 'stepping':
                {
                const options = Array.from(this._uiElements.selectStepping.options)
                                     .map(o=>o.value);
                if(!options.includes(valueStr))
                    message = `${key} must be one of ${options.join(', ')} but is "${valueStr}"`;
                else
                    value = valueStr;
                }
                break;
            default:
                message = `unkown key ${name} with value ${valueStr}"`;
        }
        return [value, message];
    }

    get axisTag() {
        return this._uiElements.selectAxis.value;
    }

    set axisTag(rawValue) {
        const { selectAxis } = this._uiElements
          , [axisTag, message] = this._parseAndCheck('axisTag', rawValue)
          ;
        if(message !== null)
            throw new Error(`VALUE ERROR can't set axisTag ${message}.`);
        selectAxis.value = axisTag;

        for(const option of selectAxis.options) {
            if(option.value !== axisTag) continue;
            if(option.disabled)
                throw new Error(`VALUE ERROR Can't set axisTag "${axisTag}" it is disabled.`);
            else
                break;
        }

        // disable/enable controls
        for(const key of ['from', 'to', 'steppingValue', 'selectStepping']) {
            this._uiElements[key].disabled = axisTag === 'disabled';
        }
        this.element.classList[(axisTag === 'disabled' ? 'add' : 'remove')]('disabled');

        if(axisTag === 'disabled')
            return;
        // set defaults, etc.
        const {min, max, step} = this._axesMap.get(axisTag);
        this._uiElements.from.value = min;
        this._uiElements.from.min = min;
        this._uiElements.from.max = max;
        this._uiElements.from.step = step;

        this._uiElements.to.value = max;
        this._uiElements.to.min = min;
        this._uiElements.to.max = max;
        this._uiElements.to.step = step;

        // FIXME should not change the current amount of steps if there is any
        this._uiElements.steppingValue.value = 10;
        this.stepping = 'steps';
    }

    _setFromTo(fromTo, rawValue) {
        const [value, message] = this._parseAndCheck(fromTo, rawValue);
        if(message !== null)
            throw new Error(`VALUE ERROR ${this.constructor.name} ${message}`);

        const element = this._uiElements[fromTo]
          , {min, max} = this._axesMap.get(this.axisTag)
          , clamped = Math.min(max, Math.max(min, value))
          , inputStep = parseFloat(element.step)
           // expecting inputStep to be based on 10
         , fixedDigits = Math.abs(Math.log10(inputStep)) // step="0.001" => 3
         ;
        element.value = clamped.toFixed(fixedDigits);
        this._setSteppingOtherOutput();
    }

    _getFromTo(fromTo) {
        return parseFloat(this._uiElements[fromTo].value);
    }

    get from() {
        return this._getFromTo('from');
    }

    set from(value) {
        this._setFromTo('from', value);
    }

    get to() {
        return this._getFromTo('to');
    }

    set to(value) {
        this._setFromTo('to', value);
    }

    get steppingValue() {
        return parseFloat(this._uiElements.steppingValue.value);
    }

    _massageSteppingValue(stepping, value) {
        let result;
        if(stepping === 'steps')
            result = Math.ceil(value);
        if(stepping === 'size')
            result = parseFloat(value.toFixed(2)); // step="0.01"
        return result;
    }

    set steppingValue(rawValue) {
        const [value, message] = this._parseAndCheck('steppingValue', rawValue);
        if(message !== null)
            throw new Error(`VALUE ERROR ${this.constructor.name} ${message}`);
        // This looses a lot of precision! But it makes input easier for the users.
        this._uiElements.steppingValue.value = this._massageSteppingValue(this.stepping, value);
        this._setSteppingOtherOutput();
    }

    get stepping() {
        return this._uiElements.selectStepping.value;
    }

    _setSteppingOtherOutput() {
        const {steppingOtherOutput, LABELTEXT_AMOUNT, LABELTEXT_STEP_SIZE} = this._uiElements;

        if(this.stepping === 'steps') {
            const size = this._steppingValueFromStepsAmountToSize(this.steppingValue, this.from, this.to)
              , massaged = this._massageSteppingValue('size', size)
              ;
            steppingOtherOutput.textContent = `${LABELTEXT_STEP_SIZE} ${massaged}`;
        }
        else if(this.stepping === 'size') {
            const steps = this._steppingValueFromSizeToStepsAmount(this.steppingValue, this.from, this.to)
              , massaged = this._massageSteppingValue('steps', steps)
              ;
            steppingOtherOutput.textContent = `${LABELTEXT_AMOUNT} ${massaged}`;
        }
        else
            throw new Error(`NOT IMPLEMENTED labels for stepping ${this.stepping}`);
    }

    setStepping(value) {
        const { selectStepping, steppingLabelDynamic,  LABELTEXT_AMOUNT, LABELTEXT_STEP_SIZE} = this._uiElements
           ;
        const [, message] = this._parseAndCheck('stepping', value);
        if(message)
            throw new Error(`VALUE ERROR can't set value ${message}`);
        selectStepping.value = value;

        // UI SideEffects!
        this._setSteppingOtherOutput();

        if(value === 'steps') {
            // Element input type=number  step validation!
            this._uiElements.steppingValue.step = '1';
            steppingLabelDynamic.textContent = LABELTEXT_AMOUNT;
            this._setSteppingOtherOutput();
        }
        else if(value === 'size') {
            // Element input type=number step validation!
            this._uiElements.steppingValue.step = '0.01';
            steppingLabelDynamic.textContent = LABELTEXT_STEP_SIZE;
            this._setSteppingOtherOutput();
        }
        else
            throw new Error(`NOT IMPLEMENTED labels for stepping ${value}`);
    }

    set stepping(value) {
        this.setStepping(value);
    }

    // axisTag MUST be first and stay first, as when it's value is "disabled"
    // the serialiaziation only returns one element.
    // jshint ignore:start
    _serializationOrder = ['axisTag', 'stepping', 'from', 'to', 'steppingValue'];
    // jshint ignore:end

    get value() {
        if(this.axisTag === 'disabled')
            return {axisTag: this.axisTag};

        const result = {};
        for(const key of this._serializationOrder)
            result[key] = this[key];

        return result;
    }

    /* value: { axisTag, stepping, from, to, steppingValue} */
    set value(value) {
        this.axisTag = value.axisTag;
        if(this.axisTag === 'disabled')
            return;
        for(const key of this._serializationOrder) {
            if(key === 'axisTag') continue;
            // only check if steppingValue is an option
            this[key] = value[key];
        }
    }

    _serializeForUrl() {
        if(this.axisTag === 'disabled')
            return [this.axisTag];
        return this._serializationOrder.map(key=>`${this[key]}`);
    }

    _deserializeFromUrl(index, strings) {
        let consumed = 0
           , result = {}
           ;
        for(const key of this._serializationOrder) {
            const valueStr = strings[index]
                // validate
              , [value, message] = this._parseAndCheck(key, valueStr)
              ;
            if(message !== null)
                return [0, null, `Can't deserialize ${message}`];
            result[key] = value;
            consumed+=1;
            index+=1;
            if(key === 'axisTag' && value === 'disabled')
                break;
        }
        return [consumed, result, null];
    }

    setAxes(axesMap) {
        this._axesMap = axesMap;
        const options = [
            this._domTool.createElement('option', {value: 'disabled'}, 'disabled')
        ];

        this._domTool.clear(this._uiElements.selectAxis);
        for(const [key, {name/*min, max*/}] of axesMap)
            options.push( this._domTool.createElement('option', {value: key}, name));
        this._uiElements.selectAxis.append(...options);
    }

    disableAxes(...axisTags) {
        // disable axisTags and enable everything else
        if(axisTags.includes('disabled'))
            throw new Error('VALUE ERROR can\'t disable the "disable" option.');
        if(axisTags.includes(this._uiElements.selectAxis.value))
            throw new Error(`VALUE ERROR can\'t disable the active option (${this._uiElements.selectAxis.value}).`);
        for(const option of this._uiElements.selectAxis.options)
            option.disabled = axisTags.includes(option.value);
    }

    disable() {
        // set the disabled option
        this.axisTag = 'disable';
    }
}

class UIGridDimensionControls extends _UIBase {
    constructor(parentAPI, domTool) {
        super();

        // insertElement, stateChangeHandler, getFont?, getFontSize?
        // enableElement, disableElement
        this._parentAPI = parentAPI;

        [this.element, this._dimensionControls] = this._initControls(domTool);

        this._axesMap = null;

        // Required to enable disable when these respective axes are
        // active in this widget.
        this._externalUiItems = {
             manualAxisLocations: null
           , fontSize: null
        };
    }

    _dimensionStateHandler(dimensionKey) {
        const changedCtrl = this._dimensionControls[dimensionKey]
          , allActiveAxes = Object.values(this._dimensionControls)
                    .map(ctrl=>ctrl.axisTag)
                    .filter(axisTag=>axisTag !== 'disabled')
          ;

        for(const [dim, ctrl] of Object.entries(this._dimensionControls)) {
            if(dim === dimensionKey) continue;
            // Disable the respective axis in the other dimension.
            const toDisable = [];
            if(changedCtrl.axisTag !== 'disabled')
                toDisable.push(changedCtrl.axisTag);
            ctrl.disableAxes(...toDisable);
        }
        this._externalUiItemsDisable(...allActiveAxes);
        this._parentAPI.stateChangeHandler();
    }

    initDimensionControl(dimensionKey, domTool, insertElement) {
        return new UIGridDimension({
              stateChangeHandler: this._dimensionStateHandler.bind(this, dimensionKey)
            , insertElement
            }
          , domTool
          , `grid_dimension_${dimensionKey}` //baseClass
          , `${dimensionKey.toUpperCase()}-Dimension`  // label
        );
    }

    get value() {
        return Object.fromEntries(
                        Object.entries(this._dimensionControls)
                            .map(([key, ctrl])=>[key, ctrl.value]));
    }

    set value(value) {
        // set all disabled, so all axes are free to use
        for(const ctrl of Object.values(this._dimensionControls)){
            ctrl.axisTag = 'disabled';
            ctrl.disableAxes();
        }

        for(const [key, ctrlValue] of Object.entries(value)) {
            // will validate axes combinations
            this._setAxisToCtrl(key, ctrlValue.axisTag);
            // set the actual values
            this._dimensionControls[key].value = ctrlValue;
        }
    }

    _serializeForUrl() {
        const results = [];
        for(const ctrl of Object.values(this._dimensionControls))
            results.push(...ctrl._serializeForUrl());
        return results;
    }

    _deserializeFromUrl(index, strings) {
        let currentIndex = index
          , totalConsumed = 0
          , result = {}
          ;
        for(const [key, ctrl] of Object.entries(this._dimensionControls)) {
            const [consumed, value, message] = ctrl._deserializeFromUrl(currentIndex, strings);
            if(message !== null)
                return [0, null, `Can't deserialize dimension ${key}: ${message}`];
            currentIndex += consumed;
            totalConsumed += consumed;
            result[key] = value;
        }
        return [totalConsumed, result, null];
    }

    _rotateDimensions() {
        const [keys, values] = zip(...Object.entries(this.value));
        // rotate
        values.unshift(values.pop());
        this.value = Object.fromEntries(zip(keys, values));
    }

    _initControls(domTool) {
        const element = domTool.createElement('div', {'class': 'grid_dimension_controls'},
            domTool.createElement('h3', {'class': 'grid_dimension_controls-label'}, 'Grid')
        );
        this._parentAPI.insertElement(element);

        const dimensionControls = Object.fromEntries(['x', 'y'].map(
            dimensionKey=>[dimensionKey
                    , this.initDimensionControl(dimensionKey, domTool,
                                    childElem=>element.append(childElem))]
        ));

        const invertButton = domTool.createElement('button', {
                'class': 'grid_dimension_controls-invert_button'
              , 'title' : 'Switch Dimensions'
            }, '⇅');
        invertButton.addEventListener('click', (event)=>{
            event.preventDefault();
            this._rotateDimensions();
            this._parentAPI.stateChangeHandler();
        });
        dimensionControls.x.element.after(invertButton);

        return [element, dimensionControls, invertButton];
    }

    // Will disable axisTags and enable everything else
    _externalUiItemsDisable(...axisTags) {
        const disableFontSize = axisTags.includes('font-size')
          , element = this._externalUiItems.fontSize
          ;
        // quick and dirty
        if(element.nodeType === Node.ELEMENT_NODE) {
            element.disabled = disableFontSize;
            if(element.parentElement.tagName === 'LABEL')
                element.parentElement.classList[(disableFontSize ? 'add' : 'remove')]('disabled');
        }
        else
            throw new Error(`NOT IMPLEMENED disable font-size external ui`);
        this._externalUiItems.manualAxisLocations.disable(...axisTags);
    }

    _externalUiItemsReset() {
        this._externalUiItemsDisable(); // empty call will enable/reset all
    }

    _setAxisToCtrl(key, axisTag) {
        this._dimensionControls[key].axisTag = axisTag;
        // also disable in the other case(s?)

        const allActiveAxes = Object.values(this._dimensionControls)
                    .map(ctrl=>ctrl.axisTag)
                    .filter(axisTag=>axisTag !== 'disabled')
                    ;
        for(const [/*otherKey*/, otherCtrl] of Object.entries(this._dimensionControls)) {
            otherCtrl.disableAxes(...allActiveAxes.filter(
                            // don't disable the own active axis
                            axisTag=>axisTag!==otherCtrl.axisTag));
        }
        this._externalUiItemsDisable(...allActiveAxes);
    }

    /**
     * This is called manually (not ideal)
     *
     * receiveUIs is finished
     *
     * runs after manualAxisLocations.value = ...
     * which happens after the font has changed.
     * It's called like this:
     *      gridDimensionControls.updateFontAxes(manualAxisLocations.value);
     */
    updateFontAxes() {
        this._axesMap = new Map([
            // entries wile bee like this:
            //     ["opsz", {
            //       "name": "opsz",
            //      , "min": 8,
            //      , "max": 144,
            //      , "default": 14, // irrelevant, as we go from min to max
            //      , "step": 0.001,
            //      , "location": 8, // irrelavant
            //      , "autoOPSZ": true
            //    }]
            ...this._externalUiItems.manualAxisLocations.value
          , ['font-size', {
                'name': 'font size'
              , 'min': 8
              , 'max': 144
              , 'default': 14
              , 'step': _getInputStepsSizeForMinMax(8, 144)
            }]
        ]);
        // ... update the interface, also, likely the value!
        // but in this case the update function needs to know e.g. because
        // the font changed, that it has to update!
        // because in this phase we don't call stateChangeHandler!

        // UPDATE axis controls!
        this._externalUiItemsReset();

        for(const ctrl of Object.values(this._dimensionControls))
            ctrl.setAxes(this._axesMap);

        const used = new Set();
        controls:
        for(const [key, ctrl] of Object.entries(this._dimensionControls)) {
            for(const axisTag of this._axesMap.keys()) {
                if(used.has(axisTag))
                    continue;
                used.add(axisTag);
                this._setAxisToCtrl(key, axisTag);
                continue controls;
            }
            // nothing found to set
            ctrl.disable();
        }
    }

    uiEnable () {
        this._parentAPI.insertElement(this.element);
        // calls uiEnable in the children ...
        //this._inputs.map(this._parentAPI.enableElement);
    }

    // runs in _uiInitProofVarToolsGrid
    // after uiEnable
    // Before any call to updateFontAxes
    receiveUIs(uiItems) {
        for(let k of Object.keys(this._externalUiItems)) {
            if(!(k in uiItems))
                throw new Error(`${this.constructor.name} TYPE ERROR missing ui item ${k}.`);
            this._externalUiItems[k] = uiItems[k];
        }
    }

    uiDisable () {
        // clean up
        if(this._externalUiItems.fontSize !== null)
            this._externalUiItemsReset();
        for(let k of Object.keys(this._externalUiItems))
            this._externalUiItems[k] = null;

        this.element.remove();
        this._axesMap = null;
        // may cleanUp "disabled" states of inputs taken over by the axes,
        // if they can't do it themselves on their own uiDisable
        // calls uiDisable in the children ...
        //this._inputs.map(this._parentAPI.disableElement);
    }
}

const UI_NUMBER_AND_RANGE_INPUT_TEMPLATE = `<div
id='container'
class="number-and-range-input"
>
    <label for="range"><!-- insert: label --></label>
    <input type='number' id="number" size="3" /><!-- insert: unit -->
    <input type='range' id="range" />
</div>`;
class UINumberAndRangeInput extends _UIBase {
    constructor(parentAPI, domTool, baseID, label, unit, minMaxValueStep) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;

        [this.element, this._inputs] = this._initTemplate(baseID, label, unit, minMaxValueStep);

        this._changeHandler = e=>{
            e.preventDefault();
            for(let input of this._inputs) {
                if(e.target === input) continue;
                // synchronize the other element(s)
                input.value = e.target.value;
            }
            this._parentAPI.stateChangeHandler();
        };

        for(let elem of this._inputs)
            // is not yet removed ever anymore...
            elem.addEventListener('input', this._changeHandler);
    }

    _initTemplate(baseID, label, unit, minMaxValueStep) {
        const fragment = this._domTool.createFragmentFromHTML(UI_NUMBER_AND_RANGE_INPUT_TEMPLATE)
          , CONTAINER_RAW_ID = 'container'
          , container = fragment.getElementById(CONTAINER_RAW_ID)
          ;
        this._domTool.insertAtMarkerComment(container, 'insert: label', label);
        if(unit) {
            this._domTool.insertAtMarkerComment(container, 'insert: unit', unit);
            // No-breaking-space as a separator, this will end up between
            // the marker comment and the actual unit.
            // FIXME: Should rather be done with CSS by putting the unit
            // into a span container, seems like the Nbsp doesn't prevent
            // the line from breaking anyways!
            this._domTool.insertAtMarkerComment(container, 'insert: unit', '\xA0');
        }
        for(const id of [CONTAINER_RAW_ID, 'number', 'range']) {
            const elem = fragment.getElementById(id);
            elem.id = `${baseID}_${id}`;
        }
        for(const label of container.querySelectorAll('label'))
            // htmlFor gets/sets the `for` attribute
            label.htmlFor = `${baseID}_${label.htmlFor}`;

        const inputs = Array.from(container.getElementsByTagName('input'));
        for(const [k,v] of Object.entries(minMaxValueStep)) {
            // all of min, max, step, value work as properties
            for(const elem of inputs)
                elem[k] = v;
        }
        this._parentAPI.insertElement(container);
        return [container, inputs];
    }

    destroy() {
        this.element.remove();
    }

    enable() {
        this.element.classList.remove('disabled');
        this._inputs.map(input=>input.disabled=this._passive ? true : false);
    }

    disable() {
        this.element.classList.add('disabled');
        this._inputs.map(input=>input.disabled=true);
    }

    // Basically this._inputs[0].value is the model state location.
    get value (){ return parseFloat(this._inputs[0].value); }
    set value(val) {
        for(let input of this._inputs)
            input.value = val;
    }

    [_UIBase.SERIALIZATION_TYPE_FLAT]; // jshint ignore:line

    _serializeForUrl(){
        return `${this.value}`;
    }

    _deserializeFromUrl(valueString) {
        const value = parseFloat(valueString);
        if(isNaN(value))
            return [null, `Can't parse as Number (NaN) value "${valueString}".`];
        return [value, null];
    }

    // Do on this.element!
    // FIXME: do we need to enableElement/disableElement inputs?
    // It seems like we could get away without!
    uiEnable () {
        this._inputs.map(this._parentAPI.enableElement);
        this._parentAPI.enableElement(this.element);
    }
    uiDisable () {
        this._inputs.map(this._parentAPI.disableElement);
        this._parentAPI.disableElement(this.element);
    }

    set passive(val) {
        this._passive = !!val;
        this._inputs.map(input=>input.disabled = !!val);
    }

    get passive(){
        return this._passive;
    }
}


// the line-height automation is basically copied and further developed
// from varla-varfo. There's now centrally a ratio that describes the
// linear growth from minLineHeight.
// The original calculation is a bit brittle: to get the same results with the
// same actual line-length for a changed MIN/MAX line length. This way it
// is better controllable.
//
// Hard coding it for the moment, may change e.g. when language specific
// or font-specific (or both) config is added.
const LINE_HEIGHT_CONFIG = Object.freeze({
    minLineHeight: 1.1
  , lineHeightSpread: 0.2 // upperLineHeight - minLineHeight
  // , upperLineHeight = minLineHeight + lineHeightSprea
  , minLineLengthEN: 33
  , lineLenghtSpreadEN: 32 // maxLineLength - minLineLength
    // , upperLineLengthEN = minLineLengthEN + lineLenghtSpreadEN // 65
    // At upperLineLengthEN line height shall be at upperLineHeight
    // This ratio is derived from the values originally used in varla-varfo.
  , lineHeightLengthRatio: 0.00625 // 0.2 / 32 (lineHeightSpread / lineLengthSpreadEN === 1/160
    // We can control this now without the original upperLineHeightEN
    // which was also used to set up the lineLengthRatio
  , totalMaxLineHeight: 2
});
function _rawGetAutoLineHeight(lineHeightLengthRatio, minLineLength,
                        minLineHeight, totalMaxLineHeight, lineLengthEN) {
    const lhIntercept = minLineHeight - (lineHeightLengthRatio * minLineLength) // b == yIntercept == 0.89375
      , rawLineHeight = lineLengthEN * lineHeightLengthRatio + lhIntercept
      ;
    return Math.max(minLineHeight, Math.min(totalMaxLineHeight, rawLineHeight));
}
// getAutoLineHeight -> lineLengthEN -> lineHeight
const getAutoLineHeight = _rawGetAutoLineHeight.bind(null
  , LINE_HEIGHT_CONFIG.lineHeightLengthRatio // 1/160 lineHeightSpread / lineLengthSpreadEN
  , LINE_HEIGHT_CONFIG.minLineLengthEN // 33
  , LINE_HEIGHT_CONFIG.minLineHeight // 1.1
  , LINE_HEIGHT_CONFIG.totalMaxLineHeight // 2
);

const UI_FONT_LEADING_TEMPLATE = `<div class="font_leading">
    <label>Leading <input
            class='font_leading-value'
            type="number"
            size="4"
            step="0.01"
            /></label>
    <label><input
            class="font_leading-mode"
            type="checkbox" /><span class="font_leading-mode_label"> </span></label>
</div>`;
class UIFontLeading extends _UIBase {
    static MODE_AUTO = 0; // jshint ignore:line
    static MODE_MANUAL = 1; // jshint ignore:line
    constructor(  parentAPI // {insertElement, enableElement, disableElement, stateChangeHandler}
                , domTool
                , label /* label */
                , requiresUpdateDependencies
                ) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        this.requiresUpdateDependencies = new Set(requiresUpdateDependencies);
        [this.element, this._valueInput, this._modeInput] = this.initTemplate();
    }

    _changeValueHandler(event) {
        event.preventDefault();
        // By user input, this shouldn't be possible to trigger when
        // mode is UIFontLeading.MODE_AUTO. Consequently, when this is
        // triggered by any means, mmode must become UIFontLeading.MODE_MANUAL.
        this._modeInput.checked = true;
        this._parentAPI.stateChangeHandler();
    }

    _changeModeHandler(event) {
        event.preventDefault();
        const mode = this._modeInput.checked
                ? UIFontLeading.MODE_MANUAL
                : UIFontLeading.MODE_AUTO
                ;

        this._valueInput.disabled = mode === UIFontLeading.MODE_AUTO
                ? true
                : false // UIFontLeading.MODE_MANUAL
                ;
        this._valueInput.value = this._getAutoLeading();
        this._parentAPI.stateChangeHandler();
    }

    // FIXME: basically a duplication, also defined in _uiInitProofTypespec
    _getAutoLeading() {
        // 16 pt is the base font-size to which getColumnWidthEN
        // is relative.
        // fontSize is in PT so far
        //
        const baseFontSizePT = 12
          , targetfontSizePT = parseFloat(this._parentAPI.getFontSize())
          , columnWidthPT = this._parentAPI.getColumnWidthEN() / 2 * baseFontSizePT
          , targetColumnWidthEN = columnWidthPT / targetfontSizePT * 2
          ;
        let result = getAutoLineHeight(targetColumnWidthEN);
        return result.toFixed(2);
    }

    get value () {
        let mode = this._modeInput.checked
                ? UIFontLeading.MODE_MANUAL
                : UIFontLeading.MODE_AUTO
                ;
        // this._valueInput.value must be update explicitly, even for MODE_AUTO
        // that way we know for sure the interface displays the
        // current value.
        return [mode, this._valueInput.value];
    }

    set value ([mode, value]) {
        this._modeInput.checked = mode === UIFontLeading.MODE_MANUAL;
        this._valueInput.value = mode === UIFontLeading.MODE_MANUAL
            ? parseFloat(value).toFixed(2)
            : this._getAutoLeading()
            ;
        this._valueInput.disabled = mode !== UIFontLeading.MODE_MANUAL;
    }

    static serializeForUrl([mode, value]) {
        const result = [`${mode}`];
        if(mode === UIFontLeading.MODE_MANUAL)
            result.push(`${value}`);
        return result;
    }

    _serializeForUrl() {
        return this.constructor.serializeForUrl(this.value);
    }

    _deserializeFromUrl(index, strings) {
        let currentIndex = index
          , consumed = 0
          , result = []
          ;
        // MODE_AUTO = 0
        // MODE_MANUAL = 1
        const modes = new Set([UIFontLeading.MODE_MANUAL, UIFontLeading.MODE_AUTO])
          , modeStr = strings[currentIndex]
          , mode = parseInt(modeStr, 10)
          ;
        if(isNaN(mode))
            return [0, null, `Can't parse mode as number (NaN) "${modeStr}" at (${currentIndex}).`];
        if(!modes.has(mode))
            return [0, null, `Mode has unkown value ${mode}, available values are `
                + `${UIFontLeading.MODE_MANUAL} (MODE_MANUAL) and ${UIFontLeading.MODE_AUTO} `
                + `(MODE_AUTO)  at (${currentIndex}).`];
        currentIndex += 1;
        consumed += 1;
        result.push(mode);
        let value = null;
        const valueStr = strings[currentIndex];
        if(mode === UIFontLeading.MODE_MANUAL) {
            value = parseFloat(valueStr);
            if(isNaN(value))
                return [0, null, `Can't parse value as number (NaN) "${valueStr}" at (${currentIndex}).`];
            currentIndex += 1;
            consumed += 1;
        }
        result.push(value);
        return [consumed, result, null];
    }

    initTemplate() {
        const fragment = this._domTool.createFragmentFromHTML(UI_FONT_LEADING_TEMPLATE)
          , element = fragment.firstChild
          , valueInput = element.querySelector('.font_leading-value')
          , modeInput = element.querySelector('.font_leading-mode')
          ;

        valueInput.addEventListener('input', e=>this._changeValueHandler(e));
        modeInput.addEventListener('change', e=>this._changeModeHandler(e));
        this._parentAPI.insertElement(element);
        return [element, valueInput, modeInput];
    }

    update(/* ...changedDependencyNames */) {
        // assert 'columnWidth' || 'fontSize' in changedDependencyNames
        const [mode, oldValue] = this.value;
        if(mode === UIFontLeading.MODE_AUTO) {
            // auto change leadding value
            const currentValue = this._getAutoLeading();
            this._valueInput.value = currentValue;
            return oldValue !== currentValue;
        }
        // else: nothing to do as mode is MODE_MANUAL
        return false;
    }
    uiEnable () {
        this._parentAPI.enableElement(this.element);
    }
    uiDisable () {
        this._parentAPI.disableElement(this.element);
    }
}

/**
 * This has no automatism to calulate line height based on line length
 * and font size, it's fully manual.
 */
const UI_MANUAL_FONT_LEADING_TEMPLATE = `<div class="font_leading">
    <label>Leading <input
            class='font_leading-value'
            type="number"
            size="4"
            step="0.01"
            value="1"
            /></label>
</div>`;
class UIManualFontLeading extends _UIBase {
    constructor(  parentAPI // {insertElement, enableElement, disableElement, stateChangeHandler}
                , domTool
                ) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        [this.element, this._valueInput] = this.initTemplate();
    }

    _changeValueHandler(event) {
        event.preventDefault();
        this._parentAPI.stateChangeHandler();
    }

    get value () {
        return this._valueInput.value;
    }

    set value (value) {
        this._valueInput.value = parseFloat(value).toFixed(2);
    }

    static serializeForUrl(value) {
        return [`${value}`];
    }

    _serializeForUrl() {
        return this.constructor.serializeForUrl(this.value);
    }

    _deserializeFromUrl(index, strings) {
        let currentIndex = index
          , consumed = 0
          ;
        const result = []
          , valueStr = strings[currentIndex]
          , value = parseFloat(valueStr)
          ;
        if(isNaN(value))
            return [0, null, `Can't parse value as number (NaN) "${valueStr}" at (${currentIndex}).`];
        currentIndex += 1;
        consumed += 1;
        result.push(value);
        return [consumed, result, null];
    }

    initTemplate() {
        const fragment = this._domTool.createFragmentFromHTML(UI_MANUAL_FONT_LEADING_TEMPLATE)
          , element = fragment.firstChild
          , valueInput = element.querySelector('.font_leading-value')
          ;

        valueInput.addEventListener('input', e=>this._changeValueHandler(e));
        this._parentAPI.insertElement(element);
        return [element, valueInput];
    }

    uiEnable () {
        this._parentAPI.enableElement(this.element);
    }
    uiDisable () {
        this._parentAPI.disableElement(this.element);
    }
}


class UIRadiosInput extends _UIBase {
    constructor(parentAPI, domTool
                , label /* label for all radios */
                , name /* common radio-input name attribute */
                , radiosSetup) {
        super();
        this._parentAPI = parentAPI;
        this._inputs = this._initTemplate(domTool, label, name, radiosSetup);

        let gotChecked = false;
        for(const input of this._inputs) {
            if(input.checked) gotChecked = true;
            input.addEventListener('change', this._parentAPI.stateChangeHandler);
        }
        if(!gotChecked)
            // some arbitrary, last resort, default
            this.inputs[0].checked = true;
    }

    _initTemplate(domTool, label, name, radiosSetup) {
        const fragment = domTool.createFragment([])
          , inputs = []
          ;
        fragment.append(domTool.createElement('label', {class: 'radio-main-label'}, label), '\n');
        for(let [value, setup] of radiosSetup) {
            const input = domTool.createElement('input', {
                    name: name
                  , 'class': `${name}-${setup['class']}`
                  , value: value
                  , type: 'radio'
                })
              , radioIcon = domTool.createElement('span', {class: 'radio-icon'})
              ;
            if(setup.checked)
                input.checked = true;
            inputs.push(input);
            fragment.append(domTool.createElement('label', {class: 'radio-label'}, [input, radioIcon,' ', setup.label]), '\n');
        }
        this._parentAPI.insertElement(fragment);
        return inputs;
    }

    get value () {
        // FIXME: we should never have an unchecked state
        // however, setting e.g. null will leave an unchecked state!
        const checked = this._inputs.filter(input=>input.checked);
        if(!checked.length) {
            this._inputs[0].checked = true;
            checked.push(this._inputs[0]);
        }
        return checked[0].value;
    }

    set value (val) {
        // FIXME: don't allow an unchecked states
        for(const input of this._inputs)
            // it should be enough to only set
            // the checked item to checked, all
            // the others must uncheck anyways...
            input.checked = input.value === val;
    }

    [_UIBase.SERIALIZATION_TYPE_FLAT]; // jshint ignore:line

    static serializeForUrl(value) {
        return encodeURIComponent(value);
    }
    _serializeForUrl() {
        return this.constructor.serializeForUrl(this.value);
    }

    _deserializeFromUrl(string) {
        const value = encodeURIComponent(string);
        for(const input of this._inputs) {
            if(input.value === value)
                return [value, null];
        }
        return [null, `"${value}" is not an option in ${this._inputs.map(input=>input.value).join(', ')}`];
    }


    uiEnable () {
        this._inputs.map(this._parentAPI.enableElement);
    }

    uiDisable () {
        this._inputs.map(this._parentAPI.disableElement);
    }
}

const UI_COLORS_CHOOSER_TEMPLATE = `<label>FG <input type='color'></label>
<button type='button' class="colors_chooser-invert">⇄</button>
<label>BG <input type='color'></label>`;
class UIColorsChooser extends _UIBase {
    constructor(parentAPI, domTool, colorDefaults) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        this._colorDefaults = colorDefaults;
        [this.container, this._colorInputs, this._invertButton] = this._initTemplate();
        this.setDefault();

        for(const input of this._colorInputs)
            input.addEventListener('input', this._parentAPI.stateChangeHandler);

        this._invertButton.addEventListener('click',(e)=>{
            e.preventDefault();
            const [colorForeground, colorBackground] = this._colorInputs;
            this.value = [colorBackground.value, colorForeground.value];
            this._parentAPI.stateChangeHandler();
        });

        this._parentAPI.insertElement(this.container);
    }

    _initTemplate() {
        const container = this._domTool.createElementfromHTML('div'
                                            , {'class': 'color_chooser'}
                                            , UI_COLORS_CHOOSER_TEMPLATE)
          , colorInpus = Array.from(container.querySelectorAll('input[type=color]'))
          , invertButton = container.querySelector('button')
          ;
        return [container, colorInpus, invertButton];
    }

    setDefault() {
        this.value = this.defaults;
        this._parentAPI.stateChangeHandler();
    }

    get defaults() {
        return this._colorDefaults.map(c=>`#${c}`);
    }

    get value() {
        return this._colorInputs.map(input=>input.value);
    }

    [_UIBase.SERIALIZATION_TYPE_FLAT]; // jshint ignore:line

    static serializeForUrl(value) {
        return _serializeRGBColors(value);
    }

    _serializeForUrl() {
        return this.constructor.serializeForUrl(this.value);
    }

    _deserializeFromUrl(valueString) {
        return _deserializeRGBColors(valueString);
    }

    set value(val) {
        const [colorForeground, colorBackground] = this._colorInputs;
        [colorForeground.value, colorBackground.value] = val;
    }

    uiEnable () {
        this._disabled = false;
        this.container.style.removeProperty('display');
    }

    uiDisable () {
        this._disabled = true;
        this.container.style.display = 'none';
    }

    get disabled() {
        return this._disabled;
    }

    set disabled(disabled) {
        if(disabled)
            this.uiDisable();
        else
            this.uiEnable();
    }

    // TODO:
    // serialize() {
    //     return _serializeRGBColors(this.value);
    // }
}

const UI_FLAGS_INPUT_TEMPLATE = `<div class="BASE_CLASS">
<h3 class="BASE_CLASS-head_label"></h3>
<ul class="BASE_CLASS-stuff_container"></ul>
</div>`;
class UIFlagsInput extends _UIBase {
    constructor(parentAPI, domTool
                , label /* label for checkboces*/
                , baseClass
                  // CAUTION order is important for serialization
                  //         for changing display order this
                  //         class should rather be modified than the
                  //         order of the flagsSetup!
                , flagsSetup /* [
                        [name, label, defautlChecked]
                    ]
                */) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        this._flagsSetup = flagsSetup;
        [this.container, this._inputs] = this._initTemplate(domTool, baseClass, label, flagsSetup);

        let gotChecked = false;
        for(const input of this._inputs.values()) {
            if(input.checked) gotChecked = true;
            input.addEventListener('change', this._parentAPI.stateChangeHandler);
        }
    }

    _initTemplate(domTool, baseClass, label, flagsSetup) {
        const fragment = domTool.createFragmentFromHTML(UI_FLAGS_INPUT_TEMPLATE)
          , container = fragment.querySelector('.BASE_CLASS')
          , headLabel = fragment.querySelector('.BASE_CLASS-head_label')
          , stuffList = fragment.querySelector('.BASE_CLASS-stuff_container')
          , inputs = new Map()
          ;
        headLabel.append(label);

        for(const elem of fragment.querySelectorAll('*')) {
            for(const _class of [...elem.classList]) {
                if(_class.startsWith('BASE_CLASS'))
                    elem.classList.replace(_class, _class.replace('BASE_CLASS', baseClass));
            }
        }
        for(const [name, label, defautlChecked] of flagsSetup) {
            const input = this._domTool.createElement('input', {type: 'checkbox'});
            input.checked = !!defautlChecked;
            stuffList.append(this._domTool.createElement('li', {},
                this._domTool.createElement('label', {}, [input, ' ', label])
            ));
            inputs.set(name, input);
        }

        this._parentAPI.insertElement(fragment);
        return [container, inputs];
    }

    get value () {
        return new Set(Array.from(this._inputs)
                    .filter(([name, element])=>element.checked)
                    .map(([name])=>name))
                    ;
    }

    set value (val) {
        let checked = new Set(val); // val could be an array or a Set
        // FIXME: don't allow an unchecked states
        for(const [name, input] of this._inputs)
            input.checked = checked.has(name);
    }

    [_UIBase.SERIALIZATION_TYPE_FLAT]; // jshint ignore:line

    _serializeForUrl() {
        const value = this.value
          , checked = '1'
          , notChecked = '0'
          , result = []
          ;
        for(let [name] of this._flagsSetup)
            result.push(value.has(name) ? checked : notChecked);
        return result.join('');
    }
    _deserializeFromUrl(valueString) {
        let message = null
          , result = []
          ;
        // NOTE: for backwards/future compatibility, I put
        //       wiggle room into this. E.g. we have default values
        //       in this._flagsSetup.
        // there could be a "strict" mode though, etc
        // if(valueString.length !== this._flagsSetup.length)
        //     message = `Value must be the same size as this._flagsSetup `
        //             + `(${this._flagsSetup.length}) but it is `
        //             + `${valueString.length} in "${valueString".`;
        //     return [null, message];
        for(let [i, [name, /*label*/, defautlChecked]] of this._flagsSetup.entries()) {
            if(i >= valueString.length) {
                if(defautlChecked)
                    result.push(name);
            }
            else if(valueString[i] === '1')
                result.push(name);
            else if(valueString[i] !== '0') {
                message = `Char at index ${i} must be "1" or "0" but is `
                        + `"${valueString[i]}" in "${valueString}".`;
                return [null, message];
            }
        }
        return [result, null];
    }

    uiEnable () {
        this.container.style.removeProperty('display');
    }

    uiDisable () {
        this.container.style.display = 'none';
    }
}

function _setsEqual(setA, setB) {
    if(setA.size !== setB.size)
        return false;
    for(const item of setA) {
        if(!setB.has(item))
            return false;
    }
    return true;
}

const UI_OT_FEATURES_CHOOSER_TEMPLATE = `<fieldset class="ot_features_chooser collapsed">
<legend class="ot_features_chooser-head_label"><label><input type="checkbox"/> OpenType Features</label></legend>
<div class="ot_features_chooser-children_container"></div>
</fieldset>`;
class UIOTFeaturesChooser extends _UIBase {
    constructor(parentAPI, domTool) {
        super();
        this._parentAPI = parentAPI;
        this._domTool = domTool;
        this._featureInputToInfo = null;
        this._features = new Map();
        this._nonDefaultFeatures = new Set();
        [this.container, this._childrenContainer, this._label, this._toggleInput] = this._initTemplate();
    }
    _initTemplate() {
        const fragment = this._domTool.createFragmentFromHTML(UI_OT_FEATURES_CHOOSER_TEMPLATE)
          , container = fragment.querySelector('.ot_features_chooser')
          , childrenContainer = container.querySelector('.ot_features_chooser-children_container')
          , label = container.querySelector('.ot_features_chooser-head_label')
          , toggleInput = label.querySelector('input')
          ;
        this._parentAPI.insertElement(fragment);
        toggleInput.addEventListener('change', ()=>this._toggle(this._toggleInput.checked));
        childrenContainer.addEventListener('change', e=>{
            this._onFeatureChange(e.target);
        });
        return [container, childrenContainer, label, toggleInput];
    }

    _toggle(inflated) {
        this._toggleInput.checked = !!inflated;
        this.container.classList[inflated ? 'remove' : 'add']('collapsed');
    }

    _setLabelState() {
        this._label.classList[this._nonDefaultFeatures.size ? 'add' : 'remove']('non_default');
    }

    _setInputState(tag) {
        const {input} = this._features.get(tag);
        if(!input)
            return;
        input.checked = this._isChecked(tag);
        const isDefault = this.constructor.getUIBoolean(tag) === input.checked;
        input.parentElement.classList[isDefault ? 'remove' : 'add']('non_default');
    }

    _setValue(newTagsArray) { // => boolean changed
        const newTags = new Set(newTagsArray)
          , oldTags = this._nonDefaultFeatures
          ;
        if(this._features.size) {
            // We can set a value before _features are known, but when
            // features are known, value must be compatible.
            for(const tag of newTags) {
                if(!this._features.has(tag))
                    newTags.delete(tag);
            }
        }

        this._nonDefaultFeatures = newTags;
        const changed = !_setsEqual(oldTags, this._nonDefaultFeatures); // => bool changed

        if(changed) {
            for(const tag of this._features.keys())
                this._setInputState(tag);
            this._setLabelState();
        }
        return changed;
    }


    // Basically this._inputs[0].value is the model state location.
    get value (){ return [...this._nonDefaultFeatures]; }
    set value(val) {
        this._setValue(val);
    }

    _onFeatureChange(featureInputElement) {
        const tag = this._featureInputToTag.get(featureInputElement)
          , uiBoolean = this.constructor.getUIBoolean(tag)
          , isDefault = uiBoolean === featureInputElement.checked
          ;
        if(!isDefault)
            this._nonDefaultFeatures.add(tag);
        else
            this._nonDefaultFeatures.delete(tag);

        this._setInputState(tag);
        this._setLabelState();
        this._parentAPI.stateChangeHandler();
    }

    static getUIBoolean(tag) {
        return tag in OTFeatureInfo.all
            ? OTFeatureInfo.all[tag].uiBoolean
            : null
            ;
    }

    static isChecked(tag, isDefault) {
        const defaultChecked = this.getUIBoolean(tag);
        return isDefault ? defaultChecked : !defaultChecked;
    }

    _isChecked(tag) {
        return this.constructor.isChecked(tag, !this._nonDefaultFeatures.has(tag));
    }

    _makeOptions(fontFeatures) {
        this._domTool.clear(this._childrenContainer);
        this._featureInputToTag = new Map();
        this._features.clear();
        const tags = [...fontFeatures.keys()].sort();
        for(const tag of tags) {
            const feature = fontFeatures.get(tag)
              , {uiBoolean, friendlyName} = feature.info
              ;
            if(uiBoolean === null)
                // These features usually don't work with a simple on/off
                // user interface and need to be treated differently.
                continue;

            const defaultSetting = uiBoolean ? 'on' : 'off'
              , frag = this._domTool.createFragmentFromHTML(
                        `<label title="${tag} (${[...feature.tables].join(', ')}): ${friendlyName}; default: ${defaultSetting}">`
                            + `<input type="checkbox" value="${tag}" />`
                            + ` ${tag}`
                        + `</label>`)
              , input = frag.querySelector('input')
              , elem = frag.firstElementChild
              ;

            this._featureInputToTag.set(input, tag);
            this._features.set(tag, {input});
            this._setInputState(tag);
            this._childrenContainer.append(elem, ' ');
        }
        this._setLabelState();
    }

    getFeatures(font) {
        // get all gsub features:
        const fontFeatures = new Map()
          , _getFeatures=(tableTag, tableFeatures, langSys, featureIndexes)=>{
                for(const idx of featureIndexes) {
                    const tag = tableFeatures[idx].tag;
                    if(!fontFeatures.has(tag))
                        fontFeatures.set(tag, {tables: new Set(), langSys: new Set(), info: OTFeatureInfo.all[tag]});
                    const feature = fontFeatures.get(tag);
                    feature.tables.add(tableTag);
                    feature.langSys.add(langSys);
                }
            }
          ;
        for(const tableTag of ['GSUB', 'GPOS']) {
            const openTypeJSTableTag = tableTag.toLowerCase();
            if(!(openTypeJSTableTag in font.tables) || !font.tables[openTypeJSTableTag].scripts)
                continue;
            const table = font.tables[openTypeJSTableTag]
              , scripts = table.scripts
              ;
            for(const scriptEntry of scripts) {
                const script = scriptEntry.script
                  , scriptTag = scriptEntry.tag
                  ;
                if(script.defaultLangSys) {
                    const langTag = 'Default'
                      , langSys = script.defaultLangSys
                      ;
                    _getFeatures(tableTag
                      , table.features
                      , [scriptTag, langTag].join(':')
                      , langSys.featureIndexes
                    );
                }
                if(script.langSysRecords) {
                    for(const {tag:langTag, langSys} of script.langSysRecords) {
                        _getFeatures(tableTag
                          , table.features
                          , [scriptTag, langTag].join(':')
                          , langSys.featureIndexes
                        );
                    }
                }
                continue;
            }
        }
        return fontFeatures;
    }

    setFont(fontObject) {
        const fontFeatures = this.getFeatures(fontObject);
        this._makeOptions(fontFeatures);

        // clean up the actual value
        for(const feaureTag of this._nonDefaultFeatures) {
            if(!this._features.has(feaureTag))
                this._nonDefaultFeatures.delete(feaureTag);
        }
    }

    static applyFeatures(container, nonDefaultTags) {
        const features = [];
        for(const featureTag of new Set(nonDefaultTags)) {
            const checked = this.isChecked(featureTag, false/* here all are non-default */);
            features.push(`"${featureTag}" ${checked ? 'on' : 'off'}`);
        }
        if(features.length)
            container.style.setProperty('font-feature-settings', features.join(', '));
        else
            container.style.removeProperty('font-feature-settings');
    }

    applyFeatures(container) {
        this.constructor.applyFeatures(container, this._nonDefaultFeatures);
    }

    serializeForUrlGeneric() {
        // these are features set to their 'non-default' values,
        // since we know the default values, it's eough to merely store
        // the tags.
        return [...this._nonDefaultFeatures].join('-');
    }

    deserializeFromUrlGeneric(value) {
        return this._setValue(value.split('-'));
    }

    static serializeForUrl(tags) {
        return [`${tags.length}`, ...tags];
    }

    _serializeForUrl() {
        return this.constructor.serializeForUrl(this.value);
    }

    _deserializeFromUrl(index, strings) {
        let consumed = 0
          , currentIndex = index
          , amount = parseInt(strings[currentIndex])
          ;
        currentIndex += 1;
        consumed += 1;

        const value = strings.slice(currentIndex, currentIndex+amount);
        consumed += amount;
        return [consumed, value, null];
    }

    uiEnable () {
        this.container.style.removeProperty('display');
    }

    uiDisable () {
        this.container.style.display = 'none';
    }
}


class UIDialogBase {
    constructor(domTool) {
        this._domTool = domTool;
        this._resolvers = null;
    }

    _initTemplate() {
        const dialog = this._domTool.createFragmentFromHTML(this.constructor.template).firstElementChild;
        dialog.addEventListener("close", () => {
            this._resolve(dialog.returnValue);
        });
        this._domTool.document.body.append(dialog);
        return dialog;
    }

    async show() {
        if(this._resolvers)
            throw new Error(`Dialog is already waiting for input.`);
        return new Promise((resolve, reject)=>{
            this._resolvers = {resolve, reject};
        });
    }

    _resolve(value) {
        if(!this._resolvers)
            throw new Error(`Dialog is not active.`);
        const resolve = this._resolvers.resolve;
        this._resolvers = null;
        resolve(value);
    }

    _reject(reason) {
        if(!this._resolvers)
            throw new Error(`Dialog is not active.`);
        const reject = this._resolvers.reject;
        this._resolvers = null;
        reject(reason);
    }

    destroy() {
        if(this._resolvers)
            this._reject('Dialog destroyed.');
        this.element.remove();
    }
}

// jshint ignore:start
const UI_DIALOG_FONT_EXISTS =`<dialog>
    <form method="dialog">
      <fieldset>
        <legend>Font Exists</legend>
        <p>A font with the name<br />
        <code class="dialog-font_name"></code><br />
        is already loaded.
        </p>
        <menu>
          <p>Keep the loaded font or replace it with the new font:</p>
          <button type="submit" value="keep">Keep</button>
          <button type="submit" value="replace">Replace</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
// jshint ignore:end
class UIDialogFontExists extends UIDialogBase {
    static template = UI_DIALOG_FONT_EXISTS; // jshint ignore:line
    constructor(domTool) {
        super(domTool);
        [this.element, this._name] = this._initTemplate();
    }
    _initTemplate() {
        const dialog = super._initTemplate()
          , name = dialog.querySelector('.dialog-font_name')
          ;
        return [dialog, name];
    }

    async show(font) {
        const promise = super.show()
          , dialog = this.element
          ;
        this._name.append(`"${font.nameVersion}"`, this._domTool.createElement('br'), `(key: ${font.fullName})`);
        dialog.returnValue = 'initial';
        dialog.showModal();
        return promise;
    }
}


// jshint ignore:start
const UI_DIALOG_HANDLE_FONT_MISSING =`<dialog>
    <form method="dialog">
      <fieldset>
        <legend>Font Missing</legend>
        <p>A font identified by<br />
        <code class="dialog-font_name"></code><br />
        is missing.
        </p>
        <div class="dialog-line">
            <input name="method" type="radio" value="select" disabled checked
            />&nbsp<label>
                Select a replacement
                <select class="dialog-fonts"></select>
            </label>
        </div>
        <div class="dialog-line">
            <input name="method" type="radio" value="file" disabled
            />&nbsp<label>
                or load a file
                <input class="dialog-load_font" type="file" accept=".ttf,.otf,.woff,.woff2"/>
            </label>
        </div>
        <menu>
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" value="replace">Replace</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
// jshint ignore:end
class UIDialogHandleFontMissing extends UIDialogBase {
    static template = UI_DIALOG_HANDLE_FONT_MISSING; // jshint ignore:line
    constructor(domTool, loadFile) {
        super(domTool);
        this._loadFile = loadFile;
        [this.element, this._name, this._fonts, this._loadFont, this._methods] = this._initTemplate();
    }
    _initTemplate() {
        const dialog = super._initTemplate()
          , name = dialog.querySelector('.dialog-font_name')
          , fonts = dialog.querySelector('.dialog-fonts')
          , loadFont = dialog.querySelector('.dialog-load_font')
          , methods = new Map([...dialog.querySelectorAll('input[name=method]')].map(elem=>[elem.value, elem]))
          ;
        fonts.addEventListener('focus', ()=>{methods.get('select').checked=true;});
        loadFont.addEventListener('change', ()=>{
            const radio = methods.get('file');
            radio.checked=true;
            radio.disabled=false;
            methods.get('select').disabled=false;
        });
        return [dialog, name, fonts, loadFont, methods];
    }

    async show(fontParticles, fonts) {
        const promise = super.show()
          , dialog = this.element
          ;
        this._name.append(`"${fontParticles.join('; ')}"`);
        this._fonts.append(...fonts.map(([fontName, label])=>{
            const option = this._domTool.createElement('option');
            option.value = fontName;
            option.textContent = label;
            return option;
        }));
        dialog.returnValue = null;
        dialog.showModal();

        return promise.then(action=>{
            if(action !== 'replace') return action;
            if(this._methods.get('file').checked)
                return this._loadFile(...this._loadFont.files);
            // assert this._methods.get('select').checked
            return this._fonts.value;
        });
    }
}


// jshint ignore:start
const UI_DIALOG_MANAGE_FONTS =`<dialog>
    <form method="dialog">
      <fieldset>
        <legend>Manage fonts</legend>
        <p>Select fonts for removal from local storage:</p>
        <ul class="dialog-multi_select_fonts"></ul>
        <menu>
          <p class="dialog-action_description"></p>
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" value="remove">Remove</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
// jshint ignore:end
class UIDialogManageFonts extends UIDialogBase {
    static template = UI_DIALOG_MANAGE_FONTS; // jshint ignore:line

    constructor(domTool, removeFonts) {
        super(domTool);
        this._removeFonts = removeFonts;
        [this.element, this._form, this._fonts, this._actionDescription] = this._initTemplate();
    }
    _initTemplate() {
        const dialog = super._initTemplate()
          , form =  dialog.querySelector('form')
          , fonts = dialog.querySelector('.dialog-multi_select_fonts')
          , actionDescription = dialog.querySelector('.dialog-action_description')
          ;
        fonts.addEventListener('change', this._fontsChangeHandler.bind(this));
        return [dialog, form, fonts, actionDescription];
    }

    _getSelectedFonts() {
        const formData = new this._domTool.window.FormData(this._form);
        return formData.getAll('dialog_multi-select-fonts');
    }

    _fontsChangeHandler(/*event*/) {
        const fonts = this._getSelectedFonts();
        this._actionDescription.textContent = fonts.length
            ? `Remove ${fonts.length} font${fonts.length === 1 ? '' : 's'}.`
            : `Nothing seleced, nothing to do.`
            ;
    }

    async show(fonts) {
        const promise = super.show()
          , dialog = this.element
          ;

        this._fonts.append(...fonts.map(([fontName, labelText])=>{
            const radio = this._domTool.createElement('input', {type: 'checkbox'})
              , label = this._domTool.createElement('label',null, [radio, ' ', labelText])
              , li = this._domTool.createElement('li',null, label)
              ;
            radio.value = fontName;
            radio.name = 'dialog_multi-select-fonts';
            return li;
        }));
        this._fontsChangeHandler();
        dialog.returnValue = null;
        dialog.showModal();

        return promise.then(action=>{
            if(action !== 'remove') return action;
            fonts = this._getSelectedFonts();
            if(fonts.length)
                return this._removeFonts(fonts);
        });
    }
}

const COLOR_DEFAULTS = ['000000', 'FFFFFF']
    ,  DEFAULT_DURATION_PER_KEYFRAME = 2
    ;

export class VideoproofController {
    /**
     * contentWindow: a DOM.window that will contain the page content, i.e.
     * the proofs, where the font's are applied, it can be different to the
     * uiWindow, which holds the main controller UI.
     */
    constructor(contentWindow) {
        // FIXME: which window to use per case
        //        also, use domTool!
        this._cmdCallDepth = 0;
        Object.defineProperty(this, 'appReady', {value: false, configurable: true});
        this._contentWindow = contentWindow;
        this._mainUIElement = null;
        this._charGroups = null;
        // this is to detect changes in this._uiSetState
        this._uiCurrentFontName = null;
        this._uiCurrentProof = null;
        this._uiStateChanges = new Set();
        this._activeOneToManySynchronisations = new Set();
        this._dependentsRequiringUpdate = new Map();

        this._stateChangeHandlerIsSilent = false;

        // animation state
        this._animationFrameRequestId = null;
        this._running = false;

        this._animationState = null;

        this._setStateLinkTimeout = null;

        this._ui = null;// TODO: improve these apis!
        this._uiElementToName = new Map();

        this._uiLoadingDependencies = new Map();
        function _setResolvers(key, resolve, reject) {
            // jshint validthis: true
            this._uiLoadingDependencies.set(key, {resolve, reject});
        }
        let _uiPromises = [];
        for(let key of ['mainUIElement', 'charGroups', 'localFontStorage'])
            _uiPromises.push(new Promise(_setResolvers.bind(this, key)));
        let allUIPromise = Promise.all(_uiPromises)
            .then(results=>{
                let keys = [...this._uiLoadingDependencies.keys()]
                  , uiDependencies = new Map([...zip(keys, results)])
                  ;
                return this._initUI(Object.fromEntries(uiDependencies))
                    .then(()=>uiDependencies);
            })
            .catch(error=>this.uiReportError('VideoproofController constructor allUIPromise', error))
            ;

        this._localFontStorage = null;
        LocalFontStorage.init(contentWindow).then(
            result=>{
                this._localFontStorage = result;
                this.setUIDependency('localFontStorage', result);
            }
          , error=>this._uiLoadingDependencies.get('localFontStorage')
                       .reject(error)
        );

        this._fonts = new Map();

        // Only allow this once, to resolve the race conditon, later
        // the loadFontsFromUrls interface should be exposed explicitly;
        let exhaustedInterfaceError = ()=>{
            throw new Error('EXHAUSTED INTERFACE: remoteResources');
        };

        let remoteResourcesPromise
          , testDeferredRemoteResources = false
          , testDeferredRemoteTimeout = 3000 // set to 6000 to trigger the rejection
          , remoteResourcesAvailable = contentWindow.remoteResources && Array.isArray(contentWindow.remoteResources)
          ;

        // Because it can be hard to see the deferred case in the wild,
        // this contraption stays here for now, to simulate the case manually.
        // Something similar could be made from the html source of course.
        if(testDeferredRemoteResources && remoteResourcesAvailable) {
            console.warn(`Testing deferred remoteResources. Timeout: ${testDeferredRemoteTimeout}`);
            remoteResourcesAvailable = false;
            const _copiedRemoteResources = contentWindow.remoteResources.slice();
            contentWindow.setTimeout(
                ()=>{
                    console.warn(`Trigger test deferred remoteResources.`);
                    contentWindow.remoteResources.push(..._copiedRemoteResources);
                }
              , testDeferredRemoteTimeout
            );
        }

        if(remoteResourcesAvailable) {
            remoteResourcesPromise = this._loadRemoteResourcesFromPromises(...contentWindow.remoteResources);
            contentWindow.remoteResources = {push: exhaustedInterfaceError};
        }
        else {
            // Definitely expect some remoteResources to be loaded, it's
            // not clear though, if this code runs before they are specified
            // in the DOM or after. There is a timeout to warn when
            // contentWindow.remoteResources is never pushed to i.e. forgotten.
            //
            // `push` is the only valid API for window.remoteResources.
            // It is better to use just one push, with many fonts instead
            // of many pushes, because then we only get one call to
            // loadFontsFromUrls, which only switches the inteface font once
            // for the call.
            let resolve, reject
              , rejectTimeout = setTimeout(()=>{
                    contentWindow.remoteResources.push=exhaustedInterfaceError;
                    reject(new Error('Not initiated: remoteResources!'));
                  }, 5000)
             ;
            remoteResourcesPromise = new Promise((_resolve, _reject)=>{
                resolve = _resolve;
                reject = _reject;
            });
            contentWindow.remoteResources = {push: (...promises)=>{
                contentWindow.clearTimeout(rejectTimeout);
                resolve(this._loadRemoteResourcesFromPromises(...promises));
                contentWindow.remoteResources.push=exhaustedInterfaceError;
            }};
        }

        Promise.all([remoteResourcesPromise, allUIPromise])
               .then((results)=>this._allInitialResourcesLoaded(...results))
               .catch(error=>this.uiReportError('VideoproofController constructor initial resources', error));
    }

    async __allInitialResourcesLoaded(remoteResources
                             /*, uiDependencies {localFontStorage}*/) {

        console.log('_allInitialResourcesLoaded');
        const localFontStorageFontNames = [];
        for await(const entry of this._localFontStorage.getAll()) {
            const font = new VideoProofDeferredFont(
                            FontOrigin.fromDB(entry.origin)
                          , entry.fullName
                          , entry.nameVersion
                          , entry.serializationNameParticles
                          , null);
            localFontStorageFontNames.push(font.fullName);
            this._fonts.set(font.fullName, font);
        }

        Object.defineProperty(this, 'appReady', {value: true});

        // Ensure proof ui elements are initialized properly.
        this._stateChangeHandlerSilent('proof');
            // It would also be possible to:
            //      let fontNames = Array.from(this._fonts.keys())
            // However, this way it is closer to the original loading
            // order and thus probably more robust when the code changes.
            // The original load order is considered to be relevant for
            // the user interface display order.

        let remoteFontNames = remoteResources.get('font') || []
          , allFontNames = [...remoteFontNames, ...localFontStorageFontNames]
          , fontName = allFontNames[0]
          ;
        for(let fontName of allFontNames)
            this._uiAddFontToSelectInterface(fontName);



        if(await this._loadStateFromLocationHash())
            // State was restored successfully
            return;
        // State was not loaded (successfully).
        if(!fontName) {
            // pass;
            // No initial font available. Could be a legitimate
            // deployment of this App.
        }
        else
            // activateFont is async
            return await this.activateFont(fontName);
    }

    async _allInitialResourcesLoaded(...args) {
        return this._cmdAsync('__allInitialResourcesLoaded', ...args);
    }

    setUIDependency(key, value) {
        let dependency = this._uiLoadingDependencies.get(key);
        if(!dependency)
            throw new Error(`KEY NOT FOUND setUIDependency: ${key}`);
        dependency.resolve(value);
    }

    async _uiDialogHandleFontExists(font) {
        const domTool = new DOMTool(this._mainUIElement.ownerDocument)
          , dialog = new UIDialogFontExists(domTool)
          , result = await dialog.show(font)
          ;
          dialog.destroy();
          return result;
    }

    async _uiDialogHandleFontMissing(fontParticles) {
        const domTool = new DOMTool(this._mainUIElement.ownerDocument)
          , loadFile = (...files)=>Promise.all(files.map(file=>this._loadFontFromFile( file )))
                                          .then(fonts=>this._registerLoadedFonts(...fonts.filter(font=>font)))
                                          .then(fontNames=>fontNames[0])
          , dialog = new UIDialogHandleFontMissing(domTool, loadFile)
          ;
        return dialog.show(fontParticles,
                Array.from(this._fonts.entries()).map(([k,v])=>[k, v.nameVersion]));
    }

    async _removeFont(fontName) {
        // remove first, and synchronously from this._fonts and the menu
        const font = this._fonts.get(fontName)
          , { selectFonts } = this._ui
          ;
        if(font.origin.type !== 'from-file')
            // It doesn't make much sense, as this change doesn't persist
            // anyways so far and there's no plan how to handle the case
            // when no fonts are loaded at all.
            // CAUTION: if changing this, _localFontStorage doesn't contain
            // the other origins, so trying to delete may fail!
            throw new Error(`Can't delete included fonts origin is ${font.origin.type} for ${fontName};`);
        this._fonts.delete(fontName);
        for(const option of selectFonts.options)
            if(option.value === fontName) option.remove();
        // remove from document
        if(font instanceof VideoProofFont)
            // VideoProofDeferredFont doesn't have a destroy method.
            font.destroy();
        // then, async from the database
        return await this._localFontStorage.delete(fontName);
    }

    async _removeFonts(...fonts) {
        const promises = []
          , { selectFonts } = this._ui
          , activeFont = this._animationState && this._animationState.fontName || selectFonts.value
          ;
        for(const font of fonts)
            promises.push(this._removeFont(font));

        // If the active font is now removed.
        if(selectFonts.value !== activeFont) {
            selectFonts.value = selectFonts.options[0].value;
            promises.push(this.activateFont(selectFonts.value));
        }
        return await Promise.all(promises);
    }

    async _uiDialogManageFonts() {
        const domTool = new DOMTool(this._mainUIElement.ownerDocument)
          , removeFonts = fonts=>this._removeFonts(...fonts)
          , dialog = new UIDialogManageFonts(domTool, removeFonts)
          ;
        return dialog.show(
                Array.from(this._fonts.entries())
                    .filter(([/*k*/, v])=>v.origin.type === 'from-file')
                    .map(([k,v])=>[k, v.nameVersion]));
    }

    async _parseFont(fontBuffer) {
        let fontBuffer_
          , fontObject
          ;
        try {
            fontBuffer_ = fontBuffer;
            fontObject = opentype.parse(fontBuffer_);
        }
        catch(e) {
                                   // original message
            if( e.message.indexOf('Unsupported OpenType signature wOF2' !== -1
                                   // changed message, still in a PR
                || e.message.indexOf("WOFF2 require an external decompressor") !== -1
                )
            ) {
                let ttfFontBufferView = woff2decompress(fontBuffer);
                fontBuffer_ = ttfFontBufferView.buffer.slice(
                    ttfFontBufferView.byteOffset,
                    ttfFontBufferView.byteLength + ttfFontBufferView.byteOffset
                );
                fontObject = opentype.parse(fontBuffer_);
            }
            else
                throw e;
        }
        return [fontObject, fontBuffer_];
    }

    async _loadFont(font) {
        if(this._fonts.has(font.fullName)) {
            if(this.appReady){
                // TODO: this could be resolved by entering a loop that alters
                // font.fullName until the name is free, the font object should
                // have a method to i.e. add a counter to fullName.
                const action = await this._uiDialogHandleFontExists(font);
                // keep, replace or initial
                // => initial should be the same as default
                // => the default is keep, as it changes least
                if(action === 'replace') {
                    // pass: keep loading the font ...
                    // FIXME: in this version of the app, we may have to actively
                    // replace the active font with this font. I did not
                    // track yet (It's also requires a case for this, as the
                    // font-version must differ, and that's a fringe use case anyways.)
                    console.warn('FIXME: font replacement is not confirmed to work yet.');
                }
                else {
                    console.info(`Loading font ${font.fullName} aborted by user.`);
                    return null;
                }
            }
            else
                throw new Error(`FONT ALREADY REGISTERED: ${font.fullName}`);
        }
        return font;
    }

    async _getFontBufferFromDeferredFont(deferredFont) {
        if(deferredFont.buffer)
            return deferredFont.buffer;
        const dbData = await this._localFontStorage.get(deferredFont.fullName);
        return dbData.buffer;
    }

    async _installFontFromDeferred(deferredFont) {
        const contentDocument = this._contentWindow.document
          , fontBuffer = await this._getFontBufferFromDeferredFont(deferredFont)
          , [fontObject, fontBuffer_] = await this._parseFont(fontBuffer)
          , origin = deferredFont.origin
          , fontFace = new contentDocument.defaultView.FontFace('LOADING', fontBuffer_)
          // we should make sure the key/fullName stays the same!!!
          , font = new VideoProofFont(fontObject, origin, fontBuffer, fontFace, contentDocument, deferredFont.fullName)
          ;

        let fullName = font.fullName;
        fontFace.family = fullName;
        await contentDocument.fonts.add(fontFace);
        return font;
    }

    async _installFont(font) {
        if(font instanceof VideoProofDeferredFont)
            return await this._installFontFromDeferred(font);
        return font; // Assert font instanceof VideoProofFont
    }

    // Don't use this as public interface, instead call
    // loadFontsFromUrls with just one url, it will trigger the UI to
    // show the font immediately.
    async _loadFontFromUrl(url) {
        const { fetch } = this._contentWindow
          , response = await fetch(url, {
                method: 'GET',
                // mode: 'cors', // no-cors, *cors, same-origin
                // cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
                // redirect: 'follow', // manual, *follow, error
                // referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            });
        return this._loadFontFromFetchResponse(response);
    }

    async _loadFontFromFetchResponse(response) {
        if (!response.ok)
            throw new Error(`HTTP error! Status: ${ response.status }`);
        const origin = new FontOriginUrl(response.url)
          , fontBuffer = await response.arrayBuffer()
          , [fontObject, ] = await this._parseFont(fontBuffer)
            // Put buffer into the font, because there's no other place for it.
          , deferredFont = VideoProofDeferredFont.fromFontObject(fontObject, origin, fontBuffer)
          ;
        return this._loadFont(deferredFont);
    }

    async _loadFontFromFile(file) {
        const origin = new FontOriginFile(file.name)
          , fontBuffer = await file.arrayBuffer()
          , [fontObject, ] = await this._parseFont(fontBuffer)
            // The buffer will got into local storage, so it is required here
            // it would be an option, not to keep that deferredFont object
            // around, create one without buffer, to keep memory lower,
            // but in most cases (one font was dropped) the buffer will
            // be used anyways right away.
          , deferredFont = VideoProofDeferredFont.fromFontObject(fontObject, origin, fontBuffer)
          , font = await this._loadFont(deferredFont)
          ;
        if(font === null) return null;
        await this._localFontStorage.put(font);// => result is the key (fullName) of the font
        return font;
    }

    // TODO: this is the last error handler and it's not very well made.
    uiReportError(callerId, error) {
         console.error(`via ${callerId}:`, error);
         // FIXME
         alert(`via ${callerId}:${error}`);
        // DO?
        // throw(error);
    }

    _registerLoadedFonts(...fonts) {
        let keys = [];
        for(let font of fonts) {
            let fullName = font.fullName;
            this._fonts.set(fullName, font);
            keys.push(fullName);
            if(this.appReady)
                this._uiAddFontToSelectInterface(fullName);
        }
        return keys;
    }

    async _registerAndActivateLoadedFonts(...fonts) {
        // The filter is because the loadFont methods can return null if
        // loading did not work for non-error reasons, e.g. the user decided
        // no to replace an existing font.
        let fontNames = this._registerLoadedFonts(...fonts.filter(font=>font));
        if(this.appReady && fontNames.length)
            // activate the first font of the batch.
            await this.activateFont(fontNames[0]);
        return fontNames;
    }

    async loadFontsFromFiles(...files) {
        return Promise.all(files.map(file=>this._loadFontFromFile( file )))
            .then(fonts=>this._registerAndActivateLoadedFonts(...fonts))
            .catch(error => this.uiReportError('loadFontsFromFiles', error));
    }

    async loadFontsFromUrls(...urls) {
        return Promise.all(urls.map(url=>this._loadFontFromUrl( url )))
            .then(fonts=>this._registerAndActivateLoadedFonts(...fonts))
            .catch(error => this.uiReportError('loadFontsFromUrls', error));
    }

    async _loadFontsFromFetchPromises(...promises) {
        let fontsPromises = promises.map(async promise=>this._loadFontFromFetchResponse(await promise));
        return Promise.all(fontsPromises)
            .then(fonts=>this._registerAndActivateLoadedFonts(...fonts))
            .catch(error => this.uiReportError('_loadFontsFromFetchPromises', error));
    }

    async _loadUIDependencyFromFetchPromises(type, promise, ...restPromises) {
        if(restPromises.length)
            console.warn(`SKIPPING ${restPromises.length} items for`,
                         `${type} in _loadUIDependencyFromFetchPromises.`);
        let response = await promise
          , result = _deepFreeze(response.json())
          ;
        this.setUIDependency(type, result);
        return result;
    }

    async _loadRemoteResourcesFromPromises(...resources) {
        let byType = new Map();
        for(let [type, promise] of resources) {
            let list = byType.get(type);
            if(!list) {
                list = [];
                byType.set(type, list);
            }
            list.push(promise);
        }

        let types =  []
          , typeResults = []
          ;
        for(let type of byType.keys()) {
            let promise;
            switch(type) {
                case 'font':
                    promise = this._loadFontsFromFetchPromises(...byType.get('font'));
                    break;
                case 'charGroups':
                    promise = this._loadUIDependencyFromFetchPromises('charGroups', ...byType.get('charGroups'));
                    break;
                default:
                    console.warn(`ATTEMPT TO LOAD  UNKOWN TYPE: ${type}`);
            }
            types.push(type);
            typeResults.push(promise);
        }
        return Promise.all(typeResults)
            .then(resolved=>new Map(zip(types, resolved)))
            .catch(error=>this.uiReportError('_loadRemoteResourcesFromPromises', error));
    }

    _uiAddFontToSelectInterface(fontName) {
        // This is not an issue so far.
        // for(let option of selectFonts.querySelectorAll('option')) {
        //     if(option.value === fontName)
        //         return;
        // }
        const { selectFonts } = this._ui;
        if(Array.from(selectFonts.options).map(option=>option.value).includes(fontName))
            return;

        let doc = selectFonts.ownerDocument
          , option = doc.createElement('option')
          , font = this.getFont(fontName)
          , optgroupClass = `optgroup-${font.origin.type}`
          , optgroup = selectFonts.querySelector(`.${optgroupClass}`)
          ;
        option.value = fontName;
        option.textContent = font.nameVersion;
        // The first option is going to be selected. (default anyways)
        if(selectFonts.options.length === 0)
            option.selected = true;

        if(optgroup === null) {
            optgroup = doc.createElement('optgroup');
            optgroup.classList.add(optgroupClass);
            switch(font.origin.type) {
                case 'from-url':
                    optgroup.label ='Included fonts';
                    break;
                case 'from-file':
                    optgroup.label = 'Dropped fonts';
                    break;
                default:
                    optgroup.label = `Origin: ${font.origin.type}`;
            }
            // TODO: insert in alphabetical order
            selectFonts.append(optgroup);
        }
        // TODO: insert in alphabetical order
        optgroup.append(option);
    }

    // This is a wrapper around any function that changes state, i.e.
    // around every action that changes what would be serialized in
    // _setStateLink (despite of the Date, that always changes without a
    // call).
    _cmd(fn, ...args) {
        this._cmdCallDepth += 1;
        let result, error;
        try {
            if(typeof fn === 'string')
                result = this[fn](...args);
            else if(typeof fn === 'function')
                result = fn.call(this, ...args);
            else
                throw new Error(`Don't know how to call function ${typeof fn}.`);
        }
        finally {
            this._cmdCallDepth -= 1;
        }
        if(error)
            throw error;
        if(fn === '__loadStateFromLocationHash') {
            // pass
            // in this case we want to keep the original hash
        }
        else if(fn === '__allInitialResourcesLoaded') {
            // pass
            // Don't set or change a hash initially.
        }
        else if(this._cmdCallDepth !== 0) {
            // pass
            // we set/unset the state link only in the outermost call
            // that affects state
        }
        else if(!this._running)
            this._setStateLink();
        else if(this._running)
            this._removeStateLink();
        return result;
    }

    // Quick and dirty copy of _cmd with async/await, accumulating
    // some technical debt, in the hope that this will be sufficient
    //  until the next architecture iteration, which is already
    // in the making.
    async _cmdAsync(fn, ...args) {
        this._cmdCallDepth += 1;
        let result, error;
        try {
            if(typeof fn === 'string')
                result = await this[fn](...args);
            else if(typeof fn === 'function')
                result = await fn.call(this, ...args);
            else
                throw new Error(`Don't know how to call function ${typeof fn}.`);
        }
        finally {
            this._cmdCallDepth -= 1;
        }
        if(error)
            throw error;
        if(fn === '__loadStateFromLocationHash') {
            // pass
            // in this case we want to keep the original hash
        }
        else if(fn === '__allInitialResourcesLoaded') {
            // pass
            // Don't set or change a hash initially.
        }
        else if(this._cmdCallDepth !== 0) {
            // pass
            // we set/unset the state link only in the outermost call
            // that affects state
        }
        else if(!this._running)
            this._setStateLink();
        else if(this._running)
            this._removeStateLink();
        return result;
    }

    // Runs when the ui can be build, but does not require resources like
    // the fonts to be available yet.
    async _initUI({mainUIElement, charGroups}) {
        console.log('_initUI', {mainUIElement, charGroups});
        this._mainUIElement = mainUIElement;
        this._charGroups = charGroups;

        const domTool = new DOMTool(mainUIElement.ownerDocument);

        let doc = this._mainUIElement.ownerDocument
          , togglePlayButton = doc.querySelector('#animation-controls button.play-pause')
          , previousKeyframeButton = doc.querySelector('#animation-controls button.back')
          , nextKeyframeButton = doc.querySelector('#animation-controls button.forward')
          , firstKeyframeButton = doc.querySelector('#animation-controls button.beginning')
          , lastKeyframeButton = doc.querySelector('#animation-controls button.end')
          , proof = doc.getElementById('the-proof')// doc.createElement('div')
          , status = doc.getElementById('aniparams')
          , keyFramesContainer = doc.getElementById('keyframes-display') // is a <ul>
          , moarAxesContainer = doc.getElementById('moar-axes-display') // is a <ul>
          , duration = doc.getElementById('animation-duration')
          , addFonts = doc.getElementById('add-your-own-button')
          , selectFonts = doc.getElementById('select-font')
          , selectGlyphs = doc.getElementById('select-glyphs')
          , showExtendedGlyphs = doc.getElementById('show-extended-glyphs')
          , selectLayout = doc.getElementById('select-layout')
          , customText = doc.createElement('input')
          , layoutControls = doc.getElementById('layout-specific-controls')
          , commentBox = doc.getElementById('comment-box')
          , comment = commentBox.querySelector('textarea')
          , commentSetHighlight = doc.getElementById('comment-set-highlight')
          , showComment = doc.getElementById('show-comment-ui')
          , manageFonts = doc.getElementById('manage-fonts')
          , reset = doc.getElementById('reset')
          , keyframesdDisplayContainer = doc.getElementById('keyframes-display-container')
          , moarAxesDisplay = doc.getElementById('moar-axes-display')
          , animationControls = doc.getElementById('animation-controls')
          , animationDurationContainer = doc.getElementById('animation-duration-container')
          , aniparams = doc.getElementById('aniparams')
          , selectGlyphsContainer = doc.getElementById('select-glyphs-container')
          , contextualPadModeContainer = doc.getElementById('contextual-pad-mode-container')
          , contextualPadMode = doc.getElementById('contextual-pad-mode')
          , contextualPadCustomContainer = doc.getElementById('contextual-pad-custom-container')
          , contextualPadCustom = doc.getElementById('contextual-pad-custom')

          , typographyContainer = doc.getElementById('typography-container')
          , fontSize = doc.getElementById('edit-size') // type: number min='8' max='288' value='12'
          , fontSizeContainer = fontSize.parentElement
          , fontSizeFrom = doc.getElementById('edit-from-size') // type: number min='8' max='288' value='12'
          , fontSizeFromContainer = fontSizeFrom.parentElement
          , fontSizeGrid = doc.getElementById('grid-font-size') // type: number min='8' max='288' value='64'
          , fontSizeGridContainer = fontSizeGrid.parentElement
          , fontSizeTo = doc.getElementById('edit-to-size') // type: number min='8' max='288' value='144'
          , fontSizeToContainer = fontSizeTo.parentElement
          , alignmentColorContainer = doc.getElementById('alignment-color-container')
          ;

        // We don't know initially, but let's expect it to be not pressed.
        this._multiSelectModifierKeyPressed = false;
        this._resetUISelection();

        doc.addEventListener('keydown', evt=>{
           // For mac we use the cmd-key ( === evt.metaKey)
           // as ctrl doesn't work that way on mac. The "super/windows"
           // key doesn't register at all as metaKey on my Linux.
           this._multiSelectModifierKeyPressed = evt.ctrlKey || evt.metaKey;
        });
        doc.addEventListener('keyup', evt=>{
           this._multiSelectModifierKeyPressed = evt.ctrlKey || evt.metaKey;
        });

        /*
         * FF
         *     not fired when ctrl multi selecting
         *     not fired when selection is dropped
         *     always followed by selectionchange
         *     not fired when just clicking around without dragging, selectionchange fires
         * Chrome
         *     no ctrl-multi select
         *     fires always, also when just clicking around and on new click and drags
         *     also fires on shift + click (which keeps the start and changes the end)
         *     and fires on droping selection
         * iOS
         *     There's no selectionstart event in iOS, but, there's also
         *     no collapsed selection, always at least one char is selected,
         *         and there's no modifier key anyways, SO, that together could
         *     help. Multi-select will need an interface here! I.e. an extra
         *     button to add to the already highlighted.
         */
        doc.addEventListener('selectstart', (/* evt */)=>{
            let mergedPathRanges
              , {wipRanges, temporayMultiSelectionRanges, normalizedRanges} = this._getUISelection()
              ;
            // This is not available on iOS(-Safari etc.)
            // In FireFox, due to native multi-select, we don't receive a
            // selectstart during multi-select (only selection change)
            // Hence, the first case below does not apply.
            if(this._multiSelectModifierKeyPressed) {
                // merge normalized wip-range(s) in temporayMultiSelectionRanges
                mergedPathRanges = mergePathRanges(
                      ...temporayMultiSelectionRanges
                    , ...getFullPathsFromRanges(proof, ...clipAndFilterRanges(proof, wipRanges))
                );
            }
            else
                mergedPathRanges = []; // drop

            this._resetUISelection({
                    wipRanges: [] // drop wipRanges
                  , temporayMultiSelectionRanges: mergedPathRanges
                  , normalizedRanges // keep normalizedRanges
            });
            this._applyTemporaryMultiSelectionToProof();
        });

        /**
         * Not required for Firefox, as it supports multi-select.
         */
        doc.addEventListener('selectionchange', (/* evt */)=>{
            let selection = doc.getSelection();

            // Just store the ranges, overide previous ranges.
            const wipRanges = []
              , {temporayMultiSelectionRanges, normalizedRanges} = this._getUISelection()
              ;
            for(let i=0, l=selection.rangeCount; i<l; i++)
                // These wip ranges are very short lived, so we can
                // store the actual objects unserialzied. In Firefox
                // multi-selection is available, so we can get multiple
                // ranges here, not so for other browsers, but in FireFox,
                // we also won't use these wipRanges.
                wipRanges.push(selection.getRangeAt(i));

            this._resetUISelection({
                    wipRanges // updated
                  , temporayMultiSelectionRanges // keep
                  , normalizedRanges // keep
            });
        });

        /**
         * TODO: for iOS, there's no selectionstart event, but also no
         * modifier key. In order to make multiple selection possible,
         * we should add a button to add to the highlighted selectio
         * directly, i.e. like this, but as if this._multiSelectModifierKeyPressed
         * is always true.
         */
        commentSetHighlight.addEventListener('click',evt=>{
            evt.preventDefault();
            const { proof } = this._ui
              , selection = doc.getSelection()
              , { temporayMultiSelectionRanges, normalizedRanges:oldNormalizedRanges} = this._getUISelection()
              , currentSelectionRanges = []
              , normalizedRanges = []
              ;

            for(let i=0, l=selection.rangeCount; i<l; i++)
                currentSelectionRanges.push(selection.getRangeAt(i));

            selection.removeAllRanges();
            // Remove temp-selection elements, this happens this._uiSetState
            // because we unset temporayMultiSelectionRanges below.
            // markupSelectionStructureSave(proof, 'temp-selection', []);

            const normalizedCurrentSelection = normalizeRanges(proof
                    , 'span.selection'
                    , ...clipAndFilterRanges(proof, currentSelectionRanges))
              ,  normalizedMultiSelectionRanges = normalizePathsRanges(proof
                    , 'span.selection'
                    , ...temporayMultiSelectionRanges)
              ;
            if(this._multiSelectModifierKeyPressed)
                normalizedRanges.push(...oldNormalizedRanges);
            normalizedRanges.push(...normalizedMultiSelectionRanges, ...normalizedCurrentSelection);

            this._resetUISelection({normalizedRanges});
            this._stateChangeHandler('textSelection');
        });

        // Always do this? => well ... no when proofs recognize this in their own update handlers
        this._stateChangeHandlerSilent('colors');

        let layoutToolsVideproof = [
                // Not Implemented ['typespec', 'Ramp']
                ['grid', 'Array']
                // Not Implemented  ['waterfall', 'Waterfall']
              , ['type-your-own', 'Input']
              , ['contextual', 'Contextual']
                // , ['composition', 'Composition']
            ]
          , layoutToolsTypetools = [
                ['typespec', 'Ramp']
              , ['waterfall', 'Waterfall']
              , ['vartools-grid', 'Grid']
            ]
          , layoutOptions = []
          , layoutTools = [
                ['videoProof', 'Video Proof', layoutToolsVideproof]
              , ['typeTools', 'Type Tools', layoutToolsTypetools]
            ]
          , seenTools = new Set()
         ;
        for(let [toolType, label, tools] of layoutTools) {
            if(!tools.length)
                continue;
            let optgroup = doc.createElement('optgroup');
            optgroup.label = label;
            layoutOptions.push(optgroup);
            for(let [proofTag, label] of tools) {
                let option = doc.createElement('option');
                // the full value could also be: `${toolType}:${value}`
                // but that would change the serialization format, so ideally
                // value stays unique across all toolTypes...
                if(seenTools.has(proofTag))
                    // This is a self check to ensure the assumption above,
                    // that each tool has a unique "id" value.
                    throw new Error(`ASSERTION FAILED: layoutTools proof tag "${proofTag}" is already defined.`);
                seenTools.add(proofTag);
                option.value = proofTag;
                option.textContent = label;
                // this is a stub, so far unused, but it may become interesting
                option.dataset.toolType = toolType;
                optgroup.append(option);
            }
        }
        selectLayout.append(...layoutOptions);
        selectLayout.value = layoutToolsVideproof[0][0]; // grid
        selectLayout.addEventListener('change', (/*e*/)=>this._stateChangeHandler('proof'));

        showExtendedGlyphs.disabled = true; // FIXME: out of band

        selectGlyphs.append(_uiBuildGlyphsSelectOptions(doc, charGroups));
        selectGlyphs.addEventListener('change', (/*e*/)=>this._stateChangeHandler('selectGlyphs'));
        showExtendedGlyphs.addEventListener('change', (/*e*/)=>this._stateChangeHandler('showExtendedGlyphs'));

        customText.type = 'text';
        customText.id = 'custom-text';
        customText.name = 'text';
        customText.placeholder = "Type your own";
        customText.value = "Type your own";

        let customTextLabel = customText.ownerDocument.createElement('label');
        customTextLabel.textConent = 'Text: ';
        customTextLabel.append(customText);
        // FIXME <ul><li> structure is excessive.
        let customTextContainer = customText.ownerDocument.createElement('li');
        customTextContainer.classList.add('custom-text-container');
        customTextContainer.append(customTextLabel);

        layoutControls.append(customTextContainer);
        // Could be done easily without replacing the proof element!
        // but I wait for the other layout modules to fine tune the
        // updating strategy.
        customText.addEventListener('input', (/*e*/)=>this._stateChangeHandler('customText'));

        contextualPadMode.addEventListener('change', (/*e*/)=>this._stateChangeHandler('contextualPadMode'));
        contextualPadCustom.addEventListener('input', (/*e*/)=>this._stateChangeHandler('contextualPadCustom'));

        comment.addEventListener('input', (/*e*/)=>{
            // just set state link etc.
            this._cmd(()=>{});
        });
        comment.addEventListener('change', (/*e*/)=>{
            this._cmd(()=>{
                if(comment.value.trim() === '')
                    this._uiCommentHide();
            });
        });
        showComment.addEventListener('click', (e)=>{
            // toggle
            e.preventDefault();
            this._cmd('_uiCommentToggle');
        });

        manageFonts.addEventListener('click', (e)=>{
            e.preventDefault();
            this._cmd('_uiDialogManageFonts');
        });


        togglePlayButton.addEventListener('click', ()=>this.toggleRunning());
        previousKeyframeButton.addEventListener('click', ()=>{
            this.pause();
            this.goToPreviousKeyFrame();
        });
        nextKeyframeButton.addEventListener('click',  ()=>{
            this.pause();
            this.goToNextKeyframe();
        });
        firstKeyframeButton.addEventListener('click', ()=>{
            this.pause();
            this.goToAnimationTime(0);
        });
        lastKeyframeButton.addEventListener('click',  ()=>{
            this.pause();
            this.goToLastKeyframe();
        });

        reset.addEventListener('click', (evt)=>{
            evt.preventDefault();
            this._reset();
        });

        duration.type='number';
        duration.min='0.1';
        duration.step='0.1';
        duration.addEventListener('change', ()=>this._setDuration(parseFloat(duration.value)));

        this._contentWindow.addEventListener('hashchange',e=>{
            e.preventDefault();
            // TODO: should this be wrapped into _cmd?
            this._loadStateFromLocationHash();
        });

        let dropElement = doc.body
          , dragAddClass=(/*evt*/)=> dropElement.classList.add('dropzone')
          , dragRemoveClass=(/*evt*/)=> dropElement.classList.remove('dropzone')
          , fileInputDragCallbacks = {
                dragenter: dragAddClass
              , dragover: evt=>{
                    evt.dataTransfer.dropEffect = 'copy';
                    dragAddClass();
                }
              , dragleave: evt=>{
                    if (evt.target !== dropElement)
                        return;
                    dragRemoveClass();
                }
              , dragend: dragRemoveClass
              , drop: dragRemoveClass
            }
          ;
        _makeFileInput (files=>this.loadFontsFromFiles(...files), addFonts,
                                        dropElement, fileInputDragCallbacks);

        selectFonts.addEventListener('change', ()=>this.activateFont(selectFonts.value));

        fontSize.addEventListener('input', (/*e*/)=>this._stateChangeHandler('fontSize'));
        fontSizeFrom.addEventListener('input', (/*e*/)=>this._stateChangeHandler('fontSizeFrom'));
        fontSizeGrid.addEventListener('input', (/*e*/)=>this._stateChangeHandler('fontSizeGrid'));
        fontSizeTo.addEventListener('input', (/*e*/)=>this._stateChangeHandler('fontSizeTo'));

        this._ui = {   status, proof, keyFramesContainer, moarAxesContainer
                     , duration, addFonts, selectFonts, selectGlyphs
                     , showExtendedGlyphs, selectLayout, customText
                     , commentBox, comment, keyframesdDisplayContainer
                     , moarAxesDisplay, animationControls, animationDurationContainer
                     , aniparams, selectGlyphsContainer, contextualPadModeContainer
                     , contextualPadMode, contextualPadCustomContainer
                     , customTextContainer, contextualPadCustom
                     // This is only a fake element, not even a proper
                     // UI-element  so maybe a good hint that we need
                     // another level of abstraction between model and UI.
                     // It could have been a input type=hidden, but there's
                     // no actual use for the overhead.
                     , typeSpecTemplate: {value: ''}
                     , multipleTargets: new UIMultipleTargets(
                            {
                                stateChangeHandler: ()=>this._stateChangeHandler('multipleTargets')
                              , helpSerializeValue: (dependencyName, value)=>this._serializationHelper(dependencyName, value)
                              , helpDeserializeValue: (dependencyName, index, strings)=>this._deserializationHelper(dependencyName, index, strings)
                            }
                            // requiresUpdateDependencies:
                            // FIXME: I'd like to define these where the
                            // actual dependencies are set as well, however,
                            // this must be known on enableElment and the
                            // dependent fields are known later on initTargets
                          , ['fontName',
                            // FIXME: these are inherited from fontLeading
                            //        should be automated!
                            'columnWidth', 'fontSize']
                        )
                      , manualAxisLocations: new UIManualAxisLocations(
                            { getFont: ()=>this.getFont(this._animationState.fontName)
                            , insertElement: element=>DOMTool.insertAtMarkerComment(mainUIElement, 'insert: manualAxisLocations', element)
                            , enableElement: this._enableElement.bind(this)
                            , disableElement: this._disableElement.bind(this)
                            , getCurrentFrame: ()=> this._animationState.lastYield[0]
                            , getFontSize: ()=>parseFloat(this._ui.fontSize.value)
                            , stateChangeHandler: ()=>this._stateChangeHandler('manualAxisLocations')
                            }
                          , domTool
                            // requiresUpdateDependencies
                          , ['fontSize', 'fontName']
                        )
                      , columnWidth: new UINumberAndRangeInput(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: columnWidth', element)
                              , enableElement: this._enableElement.bind(this)
                              , disableElement: this._disableElement.bind(this)
                              , stateChangeHandler: ()=>this._stateChangeHandler('columnWidth')
                            }
                          , domTool, 'column-width', 'Column Width', 'EN'
                          , {min: 10, max: 160, step: 1, value: 40}
                        )
                      , fontLeading: new UIFontLeading(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: fontLeading', element)
                              , enableElement: this._enableElement.bind(this)
                              , disableElement: this._disableElement.bind(this)
                              , stateChangeHandler: ()=>this._stateChangeHandler('fontLeading')
                              , getColumnWidthEN: ()=>parseFloat(this._ui.columnWidth.value)
                              , getFontSize: ()=>parseFloat(this._ui.fontSize.value)
                            }
                          , domTool
                          , 'Leading'
                            // requiresUpdateDependencies
                            // It is interesting,as also the dormant multipleTargets
                            // will require update when columnWidth changes!
                          , ['columnWidth', 'fontSize']
                        )
                      , manualFontLeading: new UIManualFontLeading(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: fontLeading', element)
                              , enableElement: this._enableElement.bind(this)
                              , disableElement: this._disableElement.bind(this)
                              , stateChangeHandler: ()=>this._stateChangeHandler('manualFontLeading')
                            }
                          , domTool
                      )
                      , typographyContainer, fontSize, fontSizeContainer
                      , fontSizeTo, fontSizeToContainer
                      , fontSizeFrom, fontSizeFromContainer
                      , fontSizeGrid, fontSizeGridContainer
                      , alignmentColorContainer
                      // Centrally manage these radio inputs: alignLeft, alignCenter, alignRight, alignJustify
                      , alignment: new UIRadiosInput(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: text-alignment', element)
                              , enableElement: this._enableElement.bind(this)
                              , disableElement: this._disableElement.bind(this)
                              , stateChangeHandler: ()=>this._stateChangeHandler('alignment')
                           }
                         , domTool
                         , 'Alignment' // label for all radios
                         , 'alignment' // common radio-input name attribute, also used for class-names prefix
                         , [
                               ['l', {label: 'Left', 'class': 'left', checked: true}]
                             , ['c', {label: 'Center', 'class': 'center'}]
                             , ['r', {label: 'Right', 'class': 'right'}]
                             // Justify doesn't work as expected currently.
                             // also, we'll add advanced justification at
                             // some point.
                             // , ['j', {label: 'Justify', 'class': 'justify'}]

                           ]
                        )
                      , colors: new UIColorsChooser(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: colorsChooser', element)
                              , stateChangeHandler: ()=>this._stateChangeHandler('colors')
                            }
                          , domTool
                          , COLOR_DEFAULTS
                        )
                      , variationSettingsFlags: new UIFlagsInput(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: variationSettingsFlags', element)
                              , stateChangeHandler: ()=>this._stateChangeHandler('variationSettingsFlags')
                            }
                          , domTool
                          , 'Variations'
                          , 'variation_settings_flags'
                          , [
                                // Until now, I applied all of the axis values to font-variation-settings
                                // however, the legacy app uses this to not only change the displayed
                                // parameters, but also to set/not set axes that are at default value.
                                // thus, this will do so too, it may help to ddetect browser
                                // inconsistencies.
                                ['applyDefaultsExplicitly', 'Use verbose font-variation-settings', true]
                              , ['displayParameters', 'Show parameters', false]
                                // ['displayCss', 'CSS', false]
                            ]
                        )
                      , gridDimensionControls: new UIGridDimensionControls(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: gridDimensionControls', element)
                              , stateChangeHandler: ()=>this._stateChangeHandler('gridDimensionControls')
                            }
                          , domTool
                        )
                      , userText: domTool.createElement('input', {type: 'hidden'})
                      , otFeaturesChooser: new UIOTFeaturesChooser(
                            {
                                insertElement: element=>domTool.insertAtMarkerComment(mainUIElement, 'insert: otFeaturesChooser', element)
                              , stateChangeHandler: ()=>this._stateChangeHandler('otFeaturesChooser')
                            }
                          , domTool
                      )
                    };
        for(let [name, element] of Object.entries(this._ui))
            this._uiElementToName.set(element, name);
    }

    __reset() {
        // TODO: in Ramp Mode (ManualAxis + MultipleTargets but no
        // animation etc. this shouuld re-init the proof and it's default
        // values ...
        // Also, trigger 'click' on keyFramesContainer.querySelector('li a')
        // is not ideal, as we should reset the value and have the UI follow.

        this.pause();
        let { keyFramesContainer, colors} = this._ui;

        colors.setDefault();

        let target = keyFramesContainer.querySelector('li a');
        if(!target)
            this.goToAnimationTime(0);
        else {
            let win = target.ownerDocument.defaultView
                , event = new win.Event('click')
                ;
            target.dispatchEvent(event);
        }
    }
    _reset() {
        this._cmd('__reset');
    }

    __setStateLink() {
        let window = this._contentWindow
          , serializedStateForUrl = this._serializeForUrl()
          , href = window.location.href.split('#', 1).pop()
          ;
        // This way, it doesn't trigger onhashchange
        // From MDN:
        // Note that pushState() never causes a hashchange event to be fired,
        // even if the new URL differs from the old URL only in its hash.
        // The same is true for `history.replaceState`.
        window.history.replaceState({}, '', `${href}#${serializedStateForUrl}`);
    }

    // Throttle calls to actual implementation __setStateLink.
    _setStateLink() {
        if(this._setStateLinkTimeout !== null)
            return;
        const { setTimeout } = this._contentWindow;
        this._setStateLinkTimeout = setTimeout(()=>{
            this._setStateLinkTimeout = null;
            // Since this is async, animation could be paused by now.
            if(this._running) return;
                this.__setStateLink();
        }, 1000);
    }

    _setColorsToProof() {
        let { proof, colors } = this._ui
          , [colorForeground, colorBackground ] = colors.value
          ;
        // I suppose setting these directly causes less work then reading
        // via style.getPropertyValue and comparing, as setting without a
        // change should be optimized by the CSS-engine.
        proof.style.setProperty('--color-fg', colorForeground);
        proof.style.setProperty('--color-bg', colorBackground);
    }

    _resetUISelection({wipRanges=[], temporayMultiSelectionRanges=[], normalizedRanges=[]}={}) {
        this._uiSelection = {
              wipRanges
            , temporayMultiSelectionRanges
            , normalizedRanges: mergePathRanges(...normalizedRanges)
        };
        _deepFreeze(this._uiSelection);
        return this._uiSelection;
    }

    _getUISelection() {
        return this._uiSelection;
    }

    _getMergedSelectionRanges() {
        let { normalizedRanges } = this._getUISelection();
        // They are/must be merged by the caller of the setter, there's
        // no further check fir now. Could be ensured in the setter though.
        // return mergePathRanges(...normalizedRanges);
        return normalizedRanges;
    }

    _applyTextSelectionToProof() {
        let { proof } = this._ui;
        markupSelectionInline(proof, 'selection', this._getMergedSelectionRanges());
    }

    _applyTemporaryMultiSelectionToProof() {
        let { proof } = this._ui
          , { temporayMultiSelectionRanges } = this._getUISelection()
          ;
        // This should be done in animation, it's expensive and
        // not the major use case, but for completeness. Otherwise the
        // temp selection boxes won't animate with the font.
        markupSelectionStructureSave(proof, 'temp-selection', temporayMultiSelectionRanges);
    }

    _removeStateLink() {
        let window = this._contentWindow
          , hash = window.location.hash
          , href
          ;
        if(hash === '#' || hash === '')
            return;
        href = window.location.href.split('#', 1).pop();
        window.history.pushState({}, '', href);
    }

    /**
     * Return false if there was no state to load or if
     * state could not be loaded.
     * Return true if state was loaded successfully.
     * Will likely become async, as  this.setState will
     * become async as well.
     */
    async __loadStateFromLocationHash() {
        let window = this._contentWindow
          , stateStr = window.location.hash
          ;
        while(stateStr[0] === '#')
            stateStr = stateStr.slice(1);
        if(!stateStr.length)
            return false;
        console.log('_loadStateFromLocationHash', stateStr);
        let state = this._deserializedStateFromURL(stateStr);
        return await this.setState(state);
    }

    async _loadStateFromLocationHash() {
        return this._cmdAsync('__loadStateFromLocationHash');
    }

    _scheduleIterate(genControl={}) {
        if(this._animationFrameRequestId !== null)
            // is already scheduled
            return;
        this._animationFrameRequestId = this._contentWindow.requestAnimationFrame(()=>this._iterate(genControl));
    }
    _unscheduleIterate() {
        this._contentWindow.cancelAnimationFrame( this._animationFrameRequestId );
        this._animationFrameRequestId = null;
    }

    _iterate(genControl={}) {
        // clean up for _scheduleIterate
        this._unscheduleIterate();

        if(!this._animationState) return;
        this._animationState.next(genControl);
        this._uiSetState();

        // schedule next round
        if(this._running)
            this._scheduleIterate();
    }
    __setRunning(isRunning) {
        if(this._running === !!isRunning) // jshint ignore:line
            return;
        console.log('videoproof.setRunning', isRunning);

        // changed
        this._running = !!isRunning;

        if(!this._running) {
            // this._reportStatus('paused');
            this._unscheduleIterate();
            return;
        }

        if(!this._animationState)
            // as soon as a generator is available and this._iterate()
            // is called, the generator will continue
            return;


        // continue!
        // [frame, t, duration, fromKeyFrameIndex, keyFrameT/*, fps */] =  this._animationState.lastYield
        let [, t] =  this._animationState.lastYield
          , genControl = { t }
          ;
        this._scheduleIterate(genControl);
        return;
    }
    setRunning(isRunning) {
        return this._cmd('__setRunning', isRunning);
    }

    run() {
        this.setRunning(true);
    }
    pause() {
        this.setRunning(false);
    }
    toggleRunning() {
        console.log('toggleRunning');
        this.setRunning(!this._running);
    }

    /**
     * CAUTION: This is a stub, don't use without testing/fixing!
     *
     * FIXME: not sure we need this, as we always would like to have
     * the generator interface links etc. But if we keep this, there
     * needs to be a way to e.g. disable generator controls.
     */
    cancel() {
        // Not sure we can handle this!
        throw new Error('NOT IMPLEMENTED: cancel');
        // this.setRunning(false);
        // this._setAnimationState(null);
    }

    goToAnimationTime(t) {
        // * cancels the scheduled iterate,
        // * iterates,
        // * if running:
        //       schedules next.
        this._iterate({t});
    }

    _getDuration() {
        let [/**/, /**/, durationLastYield] = this?._animationState?.lastYield || []
          , { duration: durationUi } = this._ui
          ;
        return [
                // In order of relevance, the last constant item will
                // allways (have to!) remain in the list after filter.
                    durationLastYield,
                    parseFloat(durationUi?.value),
                    DEFAULT_DURATION_PER_KEYFRAME
            ].filter(val=>typeof val === 'number' && isFinite(val))[0];
    }

    __setDuration(duration) {
        let [, t] = this._animationState.lastYield
          , genControl = { t, duration: duration}
          ;
        this._iterate(genControl);
    }
    _setDuration(duration) {
        this._cmd('__setDuration', duration);
    }

    getFont(fontName, ...fallback) {
        let font = this._fonts.get(fontName);
        if(!font && fallback.length)
            return fallback[0];
        if(!font)
            throw new Error(`FONT NOT FOUND: ${fontName}`);
        return font;
    }

    // VERY INTERESTING METHOD, describing the actual dependencies so far
    // involved.
    _getAnimationStateChanges(oldAnimationState, newAnimationState) {
        let uiStateChanges = new Set();
        if(newAnimationState === null)
            throw new Error("`newAnimationState` can't be null.");
        if(oldAnimationState === newAnimationState)
            return uiStateChanges;
        // Equality could be compared differently, so we would cause even
        // less work in _uiSetState, the type, fontName, axes etc. values of the
        // animation state are more important than its actual object
        // identity.

        if(oldAnimationState instanceof AnimationStateMoar
                && _getBaseAnimationState(oldAnimationState) === newAnimationState) {
            // The current state is a AnimationStateMoar
            // and the new animation state is the baseAnimation of the
            // current state.
            // I.e. switched from moar to regular keyframes.
            uiStateChanges.add('removeAnimationStateMoar');
        }
        else if(newAnimationState instanceof AnimationStateMoar
                && _getBaseAnimationState(newAnimationState) === oldAnimationState) {
            // Switch from AnimationStateKeyframes to AnimationStateMoar
            // it's currently not required to register this.
            /* pass */
        }
        else if(oldAnimationState instanceof AnimationStateMoar
                && newAnimationState instanceof AnimationStateMoar
                && _getBaseAnimationState(oldAnimationState) === _getBaseAnimationState(newAnimationState)) {
            // the current state and the new state are both AnimationStateMoar
            // and based identically. This requires no further notice to
            // _uiSetSate
            /* pass */
        }
        else {
            // This will rebuild all "Keyframes" and "moar" links.
            uiStateChanges.add('animationState');
        }

        if(oldAnimationState === null // initially it's null
                || oldAnimationState.fontName !== newAnimationState.fontName)
            uiStateChanges.add('fontName');
        return uiStateChanges;
    }

    _setAnimationState(animationState, genControl={}) {
        let uiStateChanges = this._getAnimationStateChanges(this._animationState, animationState);
        this._animationState = animationState;
        // trigger only after setting the state, otherwise, the handlers
        // will act on the old state.
        this._stateChangeHandlerSilent(...uiStateChanges);

        // if this._running is true the animation will be rescheduled
        // otherwise, this will be paused.
        this._iterate(genControl);
    }

    async _hydrateFont(fontName) {
        const font = this.getFont(fontName)
           // if required get the font buffer from local disc
         , videoProofFont = await this._installFont(font)
         ;
        if(videoProofFont !== font) // font is a VideoProofDeferredFont
            this._fonts.set(fontName, videoProofFont);
        return videoProofFont;
    }

    async __activateFont(fontName) {
        // Run only when all dependencies are loaded.
        if(!this.appReady) {
            console.warn(`activateFont: App not yet available for activating ${fontName}.`);
            return false;
        }
        console.log(`activateFont ${fontName}`);
        // May trigger if fontName does not exist!
        const font = await this._hydrateFont(fontName);
        if(this._animationState && this._animationState.fontName !== fontName) {
            // unload the old font to save some memory!
            const fullName = this._animationState.fontName
              , oldActiveFont = this.getFont(fullName, null)
              ;
            if(oldActiveFont !== null) {
                // In _removeFonts, the buffer is already deleted when
                // activating another font.
                const fontBuffer = oldActiveFont.buffer && !(oldActiveFont.origin instanceof FontOriginFile)
                        // FontOriginUrl: keep buffer around
                        ? oldActiveFont.buffer
                        // FontOriginFile: buffer will be loaded from indexedDb
                        : null
                  , deferredFont = new VideoProofDeferredFont(
                                oldActiveFont.origin
                              , oldActiveFont.fullName
                              , oldActiveFont.nameVersion
                              , oldActiveFont.serializationNameParticles
                              , fontBuffer
                    )
                  ;
                this._fonts.set(fullName, deferredFont);
                if(oldActiveFont instanceof VideoProofFont)
                    oldActiveFont.destroy();
            }
        }

        // attempt to start the animation
        // this._reportStatus('init');
        // FIXME: UI-Wise, it would be good to have this external
        // from setting running to do, because, we could display
        // the paused state.
        let animationState = this._initAnimationGenerator(font);
        this._setAnimationState(animationState);
    }

    async activateFont(fontName) {
        return this._cmdAsync('__activateFont', fontName);
    }

    goToPreviousKeyFrame() {
        // Always navigates to baseAnimationState, legacy behavior.
        let animationState = _getBaseAnimationState(this._animationState)
          , [, , , fromKeyFrameIndex] =  animationState.lastYield
          , toKeyFrameIndex = fromKeyFrameIndex === 0
                    ? animationState.keyFrames.length-1
                    : fromKeyFrameIndex-1
          , t = toKeyFrameIndex/animationState.keyFrames.length
          ;
        this._setAnimationState(animationState, {t});
    }

    goToNextKeyframe() {
        // Always navigates to baseAnimationState, legacy behavior.
        let animationState = _getBaseAnimationState(this._animationState)
          , [, , , fromKeyFrameIndex] = animationState.lastYield
          , t = (fromKeyFrameIndex+1)/animationState.keyFrames.length
          ;
        this._setAnimationState(animationState, {t});
    }

    goToLastKeyframe() {
        // Always navigates to baseAnimationState, legacy behavior.
        let animationState = _getBaseAnimationState(this._animationState)
          ,  t = (animationState.keyFrames.length-1)/animationState.keyFrames.length
          ;
        this._setAnimationState(animationState, {t});
    }

    _gotoKeyframeLinkHandler(evt) {
        // Must navigate to baseAnimationState, legacy behavior.
        let animationState = _getBaseAnimationState(this._animationState)
          , li = evt.target.parentNode
          , ul = li.parentNode
          , children = Array.from(ul.children)
          , t = children.indexOf(li)/children.length
          ;
        evt.preventDefault();
        this._setAnimationState(animationState, {t});
    }

    _initAnimationGenerator(font, genControl={}) {
        // apply base font styles
        let axisRanges = font.axisRanges
          , keyFrames = Array.from(calculateRegisteredKeyframes(axisRanges))
          ;

        // create a generator that samples through the animation space ...
        let {duration = this._getDuration(), t: startT = 0} = genControl
          , gen = animationGenerator(this._contentWindow.performance, keyFrames, duration, startT)
          ;
        return new AnimationStateKeyFrames(gen, keyFrames, font.fullName);
    }

    _initKeyFramesAnimationLinks(animationState) {
        if(!(animationState instanceof AnimationStateKeyFrames))
            throw new Error(`TYPE ERROR: animationState must be AnimationStateKeyFrames`
                            + ` but is ${animationState}`);
        let keyFrames = animationState.keyFrames
          , { keyFramesContainer } = this._ui
          , doc = keyFramesContainer.ownerDocument
          ;
        // FIXME: use domTool
        while(keyFramesContainer.lastChild)
            keyFramesContainer.lastChild.remove();


        let hasRegisteredAxis = true;
        // if keyFrames === [[]]
        if(keyFrames.length === 1 && keyFrames[0].length === 0) {
            // There are no registered axis in the font, hence no keyframes.
            hasRegisteredAxis = false;
        }
        let gotoKeyframe = this._gotoKeyframeLinkHandler.bind(this);
        for(let keyFrame of keyFrames) {
            let li = doc.createElement('li')
              , a = doc.createElement('a')
              ;
            li.append(a);
            // this would be a good rule for css
            li.style.setProperty('color', 'hsl(0, 100%, calc(50% * var(--keyframe-t, 0)))');
            a.textContent = hasRegisteredAxis
                    ? keyFrame.map(([name, value])=>`${name} ${value}`).join(', ')
                    : 'reset'
                    ;
            a.addEventListener('click', gotoKeyframe);
            keyFramesContainer.append(li);
        }
    }

    _initAnimationStateMoar(baseAnimationState, axisTag, genControl={}){
        let font = this.getFont(baseAnimationState.fontName)
          , axisRanges = font.axisRanges
          , [baseFrame, ] = baseAnimationState.lastYield
            // baseFrame is e.g.:
            //     [
            //         [ "opsz", 8 ]
            //         [ "wdth", 25 ]
            //         [ "wght", 369.69999999999976 ]
            //     ]
          , orderedFilteredAxisRanges = baseFrame.map(([axisTag, value])=>[axisTag, {'default': value}])
          ;
        orderedFilteredAxisRanges.push([axisTag, axisRanges[axisTag]]);
        let keyFrames = Array.from(calculateKeyframes(orderedFilteredAxisRanges))
          , {duration = this._getDuration(), t: startT = 0} = genControl
          , gen = animationGenerator(this._contentWindow.performance, keyFrames, duration, startT)
          ;
        return new AnimationStateMoar(gen, keyFrames, baseAnimationState, axisTag);
    }

    _moarActivate(axisTag, genControl={}) {
        let baseAnimationState = _getBaseAnimationState(this._animationState);
        let animationState = this._initAnimationStateMoar(baseAnimationState, axisTag, genControl);
        this._setAnimationState(animationState);
    }

    _initMoarAnimationLinks(fontName) {
        let font = this.getFont(fontName)
          , axes = font.fontObject.tables?.fvar?.axes
          , { moarAxesContainer } = this._ui
          , doc = moarAxesContainer.ownerDocument
          ;
        if(!axes)
            axes = [];

        while(moarAxesContainer.lastChild)
            moarAxesContainer.lastChild.remove();

        let handleClick = evt=>this._moarActivate(evt.target.dataset.axisTag);
        for (let axis of axes) {
            if (REGISTERED_AXES_ORDERED.indexOf(axis.tag) !== -1)
                // because registered axes are part of the regular keyframes
                continue;
            let axisRanges = font.axisRanges
              , info = axisRanges[axis.tag]
              , li = doc.createElement('li')
              , a = document.createElement('a')
              ;
            a.textContent = `${info.name} ${info.min} ${info['default']} ${info.max}`;
            a.dataset.axisTag = axis.tag;
            li.appendChild(a);
            moarAxesContainer.appendChild(li);
            a.addEventListener('click', handleClick);
        }
    }

    __uiSetState() {
        if(!this.appReady) {
            console.warn(`_uiSetState: UI not yet available for activating.`);
            return false;
        }
        if(this._uiStateChanges.has('animationState')) {
            // We may choose to not run these if they are not active.
            this._initKeyFramesAnimationLinks(_getBaseAnimationState(this._animationState));
            this._initMoarAnimationLinks(this._animationState.fontName);

            // Here, we could also set-up the UI-Elements required for the
            // typespec-proof, as they would change when the animationState
            // changes i.e. this changes the font.

            // And indeed, the slider interface sort of has the same role as
            // the keyframes interface, so we want to treat them similarly,
            // especially on the typespec proof (so far, all of variable type
            // tools really) we want to switch between both interfaces.

            // Techically the model for animations and manual axis location
            // mode are VERY SIMILAR, they should be different flavors of
            // the same model.
            // Maybe, need to habe an "axisLocation" dependency where the
            // flavor of it is either "keyframes" or "manual"
        }

        let requireProofInit = this._checkProofRequireInit(...this._uiStateChanges);

        if(this._uiStateChanges.has('proof') || requireProofInit)
            this._uiProofCleanElementAttributes();

        let {status, proof, keyFramesContainer, moarAxesContainer,
               duration: uiDuration, selectFonts, selectLayout} = this._ui
          , [frame, t, duration, /*fromKeyFrameIndex, keyFrameT, fps */] =  this._animationState.lastYield
          , axisTags = frame.length
                    ? zip(...frame).next().value
                    : []
            // FIXME: what we don't do is unsetting/cleaning up custom
            //        properties that are no longer used, instead, we just
            //        don't use the custom properties.
          , fontVariationSettings = axisTags.map(
                    axisTag=>`"${axisTag}" var(${axisTag2PropName(axisTag)})`)
                .join(', ')
          , setStyleProperty=(elem, name, value)=>{
                // Not sure if there's a performance issue when resetting to the
                // same value/
                if(value !== elem.style.getPropertyValue(name))
                    proof.style.setProperty(name, value);
            }
          ;

        // Don't do if the element has focus.
        // FIXME: are there other elements that need this kind of treatment?
        if(uiDuration !== uiDuration.ownerDocument.activeElement && `${uiDuration.value}` !== `${duration}`)
            uiDuration.value = `${duration}`;

        if(selectFonts !== selectFonts.ownerDocument.activeElement && selectFonts.value !== this._animationState.fontName)
            selectFonts.value = this._animationState.fontName;

        // TODO: apply (maybe a class) for a font-variation-setttings rule
        // with css-custom properties
        // could also have all axes with default values to axes defaults,
        // but that could make standard css usage harder (I don't think we
        // need standard css, we rather need full control)

        // FIXME: Can't pollute proof style by default anymore! But the original
        // videoproof layouts still get that treatment.
        if(new Set(['grid', 'contextual', 'type-your-own']).has(selectLayout.value))
            setStyleProperty(proof, 'font-variation-settings', fontVariationSettings);
        else
            proof.style.removeProperty('font-variation-settings');
        setStyleProperty(proof, 'font-family', `"${this._animationState.fontName}", Times New Roman, serif`);

        // This styles the keyframe links...
        //TODO: make methods to control these UI states!
        let baseAnimationState = this._animationState.baseAnimationState
                                 || this._animationState;
           // some fonts don't have registered axes keyframes
        if(keyFramesContainer.children.length > 1
                && baseAnimationState instanceof AnimationStateKeyFrames) {
            // For completeness, also e.g. when we change t in the animation,
            // we should unset all items that are not fromKeyFrameIndex
            // or toKeyFrameIndex
            let  [/*frame*/, /*t*/, /*duration*/, fromKeyFrameIndex, keyFrameT/*, fps */] = baseAnimationState.lastYield
              , toKeyFrameIndex = fromKeyFrameIndex === keyFramesContainer.children.length - 1
                                ? 0
                                : fromKeyFrameIndex + 1
              ;
            for(let i=0,l=keyFramesContainer.children.length; i<l; i++) {
                if(i === fromKeyFrameIndex || i === toKeyFrameIndex)
                    continue;
                keyFramesContainer.children[i]
                        .style.setProperty('--keyframe-t', '');
            }
            keyFramesContainer.children[fromKeyFrameIndex]
                        .style.setProperty('--keyframe-t', 1 - keyFrameT );
            keyFramesContainer.children[toKeyFrameIndex]
                        .style.setProperty('--keyframe-t', keyFrameT);
        }

        // this styles the moar links
        let activateMoarLink = elem=> {
                elem.classList.add('active');
                elem.style.setProperty('color', 'red');
            }
          , deactivateMoarLink = elem=> {
                elem.classList.remove('active');
                elem.style.setProperty('color', null);
            }
          ;
        if(this._animationState instanceof AnimationStateMoar) {
            for(let elem of moarAxesContainer.querySelectorAll('a.active')) {
                if(elem.dataset.axisTag !== this._animationState.axisTag)
                    deactivateMoarLink(elem);
            }
            for(let elem of moarAxesContainer.querySelectorAll(`a[data-axis-tag=${this._animationState.axisTag}]`))
                activateMoarLink(elem);
        }
        else if(this._uiStateChanges.has('removeAnimationStateMoar')) {
            // Do this only once: when `removeAnimationStateMoar` changed (= got turned off).
            for(let elem of moarAxesContainer.querySelectorAll('a.active')) {
                deactivateMoarLink(elem);
            }
        }

        // the status text!
        let font = this.getFont(this._animationState.fontName);
        status.textContent = font.nameVersion + ' — '
            + `Layout: ${selectLayout.options[selectLayout.selectedIndex].textContent} — `
            + frame.map(([name, value])=>`${name} ${Math.round(value)}`)
                   .join(' ')
            + ` — ${Math.round(t * 100)}%`
            ;

        // the actual custom properties with the axistag values
        for(let [axisTag, value] of frame) {
            let propName = axisTag2PropName(axisTag);
            // FIXME: Math.round here until we solve loding state from
            //        data properly. Especially for e.g. the "slnt" axis
            //        with a range of -10 to 0, this prevents a smooth
            //        animation, however, we get integer locations for
            //        t between 0 and 1 and as such can work with that.
            //        Eventually, finding the closest keyframe from loaded
            //        data (and maybe animate there) will be a more complex
            //        task.
            //        Alternatively, we would just always export the rounded
            //        values and then find the closest t on load.
            proof.style.setProperty(propName, Math.round(value));
        }

        if(this._uiStateChanges.has('proof')) {
            this._changeProofUiDependencies();
            console.log('_uiInitProof: this._uiStateChanges.has("proof"):', ...this._uiStateChanges);
            this._uiInitProof();
        }
        else if(requireProofInit) {
            console.log('_uiInitProof: requireProofInit (via _checkProofRequireInit):', ...this._uiStateChanges);
            this._uiInitProof(); // implies this._ui._proofAPI.update()
        }
        else if(this._ui._proofAPI && this._ui._proofAPI.update) {
            // FIXME: should this require the updated state information???
            // also, maybe we should only call this if explicit dependencies
            // changed?
            this._ui._proofAPI.update(this._uiStateChanges);
        }
        // Check if the selection is still valid for the proof.
        // FIXME: not sure if this check is sufficient, it will likeley
        //        break in the future but it is good enough for now.
        // Maybe, this._ui._proofAPI.update(); can also return some indicator
        // whether a selection can be kept or must be removed.
        // ALSO, it may be of value to remove the existing selection markup
        // prior to this._ui._proofAPI.update(); in some future cases.
        // This is still WORK IN PROGRESS to figure out how to do it best.
        if(this._uiStateChanges.has('highlightSelection')) {
            // console.warn('highlightSelection!');
            // when it comes from _setState (via the link coment)
            this._applyTextSelectionToProof();
        }
        else if(!requireProofInit && !this._uiStateChanges.has('proof')) {
            // console.warn('highlightSelection proof changed:', this._uiStateChanges.has('textSelection'));
            if(this._uiStateChanges.has('textSelection'))
                // This will persist once rendered, when using markupSelectionInline.
                this._applyTextSelectionToProof();
            // else: expext the selection is already rendered
        }
        else {
            // drop all selections
            this._resetUISelection();
        }
        // Will drop or update the temporary multiple selection
        this._applyTemporaryMultiSelectionToProof();

        // Ready for new state changes! Doing this as last thing in here
        // also means we can't tolerate state changes in those method calls
        // before. We could test this here and assert the initial content
        // of this._uiStateChanges is the same as now.
        this._uiStateChanges.clear();
    }

    _uiSetState(...args) {
        return this._cmd('__uiSetState', ...args);
    }

    // Called by this._uiSetState
    _uiProofCleanElementAttributes() {
        let { selectLayout, proof } = this._ui
         // FIXME: this should be handled centrally like the dependencies
         // description, not hard coded!.
          , layoutKey = selectLayout.value
          , classes = {
                'grid': ['fixed-line-breaks']
              , 'contextual': ['fixed-lines']
              , 'typespec': ['typespec']
              , 'waterfall': ['waterfall']
              , 'vartools-grid': ['vartools-grid']
            }
          , useClasses = new Set(classes[layoutKey] || [])
          , removeClasses = new Set(
                Object.entries(classes)
                .reduce((accum, [k, v])=>{
                    if(k === layoutKey) return accum; // skp
                    accum.push(...v.filter(c=>!useClasses.has(c)));
                    return accum;
                }, [])
            );

        for(let _class of removeClasses)
            proof.classList.remove(_class);
        for(let _class of useClasses)
            proof.classList.add(_class);

        for (let i=proof.style.length; i--;) {
            const nameString = proof.style[i];
            proof.style.removeProperty(nameString);
        }
    }
    // depends on selectLayout/proofFormatTag
    //      and subsequently on the associated proof format
    //
    // Calls the actual init function of the proofs, so that means
    // it has to run whenever the content of a proof must update (due to
    // state changes)!
    //
    // Called by this._uiSetState
    __uiInitProof() {
        let { selectLayout, proof } = this._ui;
        console.log('START __uiInitProof', selectLayout.value);
        // From here, it's good to call after  __uiSetState as the
        // intProof* method can consider the state of the proof element
        DOMTool.dispatchEvent(proof, 'destroy');
        DOMTool.clear(proof, 'destroy');

        // called by _uiSetState
        // This is interesting so that the proof can update internally,
        // after all outside changes have been made.
        const intProof = {
                    'grid': this._uiInitProofGrid
                  , 'type-your-own': this._uiInitProofTypeYourOwn
                  , 'typespec': this._uiInitProofTypespec
                  , 'contextual': this._uiInitProofContextual
                  , 'waterfall': this._uiInitProofWaterfall
                  , 'vartools-grid': this._uiInitProofVarToolsGrid
                  // , 'composition': this._uiInitProofComposition
              }[selectLayout.value]
              /**
               * FIXME: These interface methods are underdocumented!
               * {
               *      update: function, no arguments, called when proof
               *              needs to update its state, e.g. to resize
               *              its contents. FIXME: be more specific here
               *              especially in which case update is called.
               * }
               */
            , proofAPI = intProof.call(this)
            ;
        this._ui._proofAPI = typeof proofAPI === 'object'
                    ? proofAPI
                    : null // no API
                    ;
        console.log('END __uiInitProof', selectLayout.value);
    }

    _uiInitProof() {
        return this._cmd('__uiInitProof');
    }

    /**
     * activates/deactivates PROOF_UI_DEPENDENCIES
     *
     * called only from _uiSetState when proof changed
     */
    _changeProofUiDependencies() {
        let { selectLayout } = this._ui
          , proofTag = _formatProofTag(selectLayout.value)
          , allProofDependencies = new Set(Object.values(PROOF_UI_DEPENDENCIES)
                .reduce((accum, item)=>{accum.push(...item);return accum;}, []))
          ;
        if(!(proofTag in PROOF_UI_DEPENDENCIES))
            throw new Error(`KeyError "${proofTag}" not in PROOF_UI_DEPENDENCIES`);

        console.log('_changeProof proofTag', proofTag, PROOF_UI_DEPENDENCIES[proofTag]);
        const SKIP = new Set(['fontName']);
        for(let proofDependency of allProofDependencies) {
            if(SKIP.has(proofDependency))
                continue;
            let element = this._ui[proofDependency];
            if(!element) {
                // If this occurs handle it elsewhere, e,g if expected add to SKIP!
                console.warn(`_changeProof: skipping NOT FOUND ui element ${proofDependency}`);
                continue;
            }
            if(PROOF_UI_DEPENDENCIES[proofTag].indexOf(proofDependency) !== -1) {
                // activate
                this._enableElement(element);
            }
            else {
               // deactivte
               this._disableElement(element);
            }
        }
    }

    _checkProofRequireInit(...stateDependencyNames) {
        let { selectLayout } = this._ui
          , proofTag = _formatProofTag(selectLayout.value)
          , dependencies = new Set(
                (proofTag in PROOF_REQUIRE_INIT_DEPENDENCIES
                        ? PROOF_REQUIRE_INIT_DEPENDENCIES
                        : PROOF_STATE_DEPENDENCIES
                )[proofTag]
            )
          ;
        for(let dependencyName of stateDependencyNames) {
            if(dependencies.has(dependencyName))
                return true;
        }
        return false;
    }


    /**
     * Connect one model item that represents many values with their
     * ui-elements. That means when the one element is changed, all
     * associated ui-elements must follow and the other way around.
     *
     * The "multipleTargets" element can hold multiple states for a
     * set of ui-elements and switch between these. This function
     * makes sure everything stays in sync and that the active state
     * of the multiple targets item is up to date with the ui.
     */
    _updateOneToManySync(synchronisationName, ...dependencyNames) {
        const synchronisationItem = this._ui[synchronisationName]
          , changedNames = new Set()
          ;
        for(const dependencyName of dependencyNames) {
            // If both are in dependencyNames maybe the first occurence
            // should wins. Coul also be always synchronisationName
            // or always the other...
            if(changedNames.has(dependencyName))
                // this doesn't look very correct :-/
                // but it's maybe also a none-case!
                continue;

            if(dependencyName === synchronisationName) {
                // this is like a one-to-many case

                // TODO: use central standard method to get value from field
                let values = synchronisationItem.activeState;
                const seen = new Set()
                    // for e.g. manualAxisLocations it's important that
                    // fontSize is already set, there are not many dependencies
                    // like this and this code base is going to be replaced
                    // by the shell, so hard coding the order here is OK.
                    // When setting opsz and autoOPSZ is true, manualAxisLocations
                    // reads from, but it reads the old value if it is not
                    // processed first.
                  , fieldNamesOrder = ['fontSize', ...Object.keys(values)]
                  ;
                for(const fieldName of fieldNamesOrder) {
                    if(seen.has(fieldName)  || !(fieldName in values))
                        continue;
                    seen.add(fieldName);
                    const value = values[fieldName]
                      , field = this._ui[fieldName]
                        // FIXME: for multipleAxisLocation it would be nice
                        // to compare an array here. But maybe we can also
                        // use a string normalization
                      , changed = field.value !== value
                      ;
                    if(changed) {
                        field.value = value;
                        changedNames.add(fieldName);
                    }
                }
            }
            else if(synchronisationItem.hasField(dependencyName)) {
                // this is the many-to-one case
                const field = this._ui[dependencyName];
                    // TODO: use central standard method to get value from field
                    //       and to set dependencyName to multipleTarget
                // TODO: if e.g. fontName changes, multipleTargets should
                //       update all of it's states, and then would maybe
                //       also have to set or return the names of the
                //       active fields?
                //       For the proof, if there's a proofAPI.update, it
                //       will be executed.
                const changed = synchronisationItem.setValue(dependencyName, field.value);
                if(changed)
                    changedNames.add(synchronisationName);
            }
        }
        return changedNames;
    }

    // Yet another method to describe and enforce a dependency.
    // Eventually required is a propper declarationa and loop detecting
    // impelemtnation.
    // This is intended to describe a dependency that is required to update
    // by some means when one value changes.
    // It's also important to not that I think this makes the situation
    // rather worse than better!
    _updateDependencies(...changedDependencyNames) {
        const dependents = new Map();
        for(const changedDependencyName of changedDependencyNames) {
            // _dependentsRequiringUpdate
            //      fontname: {multipleTargets}
            //      dependencyName: {dependentNames, ...}
            const dependentsNames = this._dependentsRequiringUpdate.get(changedDependencyName);
            if(dependentsNames) {
                for(const dependentName of dependentsNames) {
                    const changedDependencyNames = _mapGetOrInit(
                                dependents, dependentName, ()=>new Set());
                    changedDependencyNames.add(changedDependencyName);
                }
            }
        }
        // Decided to collect and call once for all dependencies, so the
        // implementation can choose how to handle. Otherwise, calling
        // update for each changedDependencyNames could create overhead.
        const changedFields = [];
        for(const [dependentName, changedDependencyNames] of dependents.entries()) {
            // not sure if it is required to return the changedValues as an array
            // maybe just a boolean is sufficient.
            // See FIXME comment below.
            let changedValues = this._ui[dependentName].update(...changedDependencyNames);
            if(changedValues === true || Array.isArray(changedValues) && changedValues.length)
                changedFields.push(dependentName
                    // FIXME: I feel like we should also return the "changedValues"
                    // array, but I believe it will keeep those UI-fields from
                    // getting updated!
                    // The fix would be to completely separate states from UIs!
                    // NOTE also that we did not actually update, concretely,
                    // manualAxisLocations, but only multipleValues, the
                    // state-UI-object of manualAxisLocations was not touched!
                    // _updateOneToManySyncs should take care of this.
                    //
                    // Otherwise: uncomment:
                    //          , ...changed
                );
        }
        return changedFields;
    }

    _updateOneToManySyncs(...dependencyNames) {
        const moreDependencies = [];
        for(let synchronisationName of this._activeOneToManySynchronisations)
            moreDependencies.push(...this._updateOneToManySync(
                                synchronisationName, ...dependencyNames));
        return moreDependencies;
    }

    /**
     * Called as an event-handler to prepare calling _uiSetState.
     */
    _stateChangeHandlerSilent(...dependencyNames) {
        if(!dependencyNames.length)
            return;

        dependencyNames.push(...this._updateDependencies(...dependencyNames));
        dependencyNames.push(...this._updateOneToManySyncs(...dependencyNames));
        for(const dependencyName of dependencyNames)
            this._uiStateChanges.add(dependencyName);
    }

    _stateChangeHandler(...dependencyNames) {
        if(!dependencyNames.length)
            return;
        this._stateChangeHandlerSilent(...dependencyNames);
        if(!this._stateChangeHandlerIsSilent)
            this._uiSetState();
    }

    // depends on
    //      showExtendedGlyphs
    //      customText
    //      (future: a boolean option: "avoid line breaks" that defaults to true
    //              see how the legacy version handles this)
    _uiInitProofTypeYourOwn() {
        let { proof, showExtendedGlyphs, customText, otFeaturesChooser} = this._ui;
        // TODO: Will need a better central solution.

        let text = customText.value.trim();
        if(showExtendedGlyphs.checked) {
            let extended = getExtendedChars(this._charGroups, customText.value);
            if(extended.length)
                text += ' ' + extended.join(' ');
        }

        // must execute before grid is calculated!
        function onFontChange(font, proof) {
            console.log('_uiInitProofGrid onFontChange');
            // set font to otFeaturesChooser
            // apply features to proof
            otFeaturesChooser.setFont(font.fontObject);
            otFeaturesChooser.applyFeatures(proof);
        }

        onFontChange(this.getFont(this._animationState.fontName), proof);
        const originalAPI = initTypeYourOwn(proof, text)
          , augmentedAPI = originalAPI ? Object.create(originalAPI) : {}
          ;
        augmentedAPI.update = (changedDependencyNamesSet)=>{
            if(changedDependencyNamesSet.has('fontName'))
                onFontChange(this.getFont(this._animationState.fontName), proof);
            else if(changedDependencyNamesSet.has('otFeaturesChooser'))
                otFeaturesChooser.applyFeatures(proof);

            if(changedDependencyNamesSet.has('colors'))
                this._setColorsToProof();
            return originalAPI?.update();
        };

        this._setColorsToProof();

        return augmentedAPI;
    }

    // depends on:
    //    this._animationState.fontName
    //    selectGlyphs
    //    showExtendedGlyphs // partialy, but that's a dependency
    _uiInitProofGrid() {
        let { selectGlyphs, showExtendedGlyphs, proof, otFeaturesChooser } = this._ui
          , font = this.getFont(this._animationState.fontName)
          , [charset, extendedChars] = getCharsForSelectUI(this._charGroups, font, selectGlyphs.value)
          ;
        // This is not ideal, but we should not call getCharsForSelectUI
        // too often, and here we must anyways. until there's a more elegant
        // solution, the following line should always follow getCharsForSelectUI.
        showExtendedGlyphs.disabled = !extendedChars.length;

        if(showExtendedGlyphs.disabled)
                // The original code does this, I pesonally would leave
                // it checked when it's checked and unchecked when it's
                // unchecked. It could have been an UX-decision, but also
                // a bad practice decision, when only looking for the
                // checked value, regardless of the disabled value.
                showExtendedGlyphs.checked = false;

        if(!showExtendedGlyphs.disabled && showExtendedGlyphs.checked)
            charset = [...charset, ...extendedChars];

        // must execute before grid is calculated!
        function onFontChange(font, proof) {
            console.log('_uiInitProofGrid onFontChange');
            // set font to otFeaturesChooser
            // apply features to proof
            otFeaturesChooser.setFont(font.fontObject);
            otFeaturesChooser.applyFeatures(proof);
        }

        // fixGridLineBreaks seems to be pretty slow, around 1 seccond for
        // ~ 1000 glyphs in grid. This is around 1 ms per glyph but it's
        // well perceivable in all-glyphs with currently around 900 something
        // glyphs.
        let then = performance.now();
        onFontChange(font, proof);
        const originalAPI = initGrid(proof, charset, fixGridLineBreaks.bind(null, font));
        // This is quite slow, especially for the bigger charsets.
        // Must be in fixGridLineBreaks ...
        console.log(`initGrid for ${selectGlyphs.value} (${charset.length} chars) took`, performance.now() - then, charset);


        const augmentedAPI = originalAPI ? Object.create(originalAPI) : {};
        augmentedAPI.update = (changedDependencyNamesSet)=>{
            if(changedDependencyNamesSet.has('fontName'))
                onFontChange(this.getFont(this._animationState.fontName), proof);
            else if(changedDependencyNamesSet.has('otFeaturesChooser'))
                otFeaturesChooser.applyFeatures(proof);

            if(changedDependencyNamesSet.has('colors'))
                this._setColorsToProof();
            return originalAPI?.update();
        };

        this._setColorsToProof();

        return augmentedAPI;
    }

    _uiInitProofContextual() {
        let {     proof, selectGlyphs, showExtendedGlyphs
                , contextualPadMode, contextualPadCustomContainer, contextualPadCustom
                , otFeaturesChooser
            } = this._ui
          , font = this.getFont(this._animationState.fontName)
          , charsForKey = key=>getCharsForKey(this._charGroups, font, key)
                    //selectGlyphs.value => [charset, extendedChars]
          , showExtended
          , useGlyphs = true
          , useExtended = true
          , useCustomPad = false
          , padMode = contextualPadMode.value
          , autoModes = new Set(['auto-short', 'auto-long'])
          , kernModes = new Set(['kern-upper', 'kern-mixed', 'kern-lower'])
          , customPad = ''
          , selectedChars = null
          ;

        // must execute before grid is calculated!
        function onFontChange(font, proof) {
            console.log('_uiInitProofGrid onFontChange');
            // set font to otFeaturesChooser
            // apply features to proof
            otFeaturesChooser.setFont(font.fontObject);
            otFeaturesChooser.applyFeatures(proof);
        }

        if(autoModes.has(padMode)) {
            useGlyphs = true;
            // useExtended: decided depending on the selectedGlyphs
        }
        else if(kernModes.has(padMode)) {
            useGlyphs = false;
            useExtended = true;
        }
        else if(padMode === 'custom') {
            useGlyphs = true;
            // useExtended: decided depending on the selectedGlyphs
            useCustomPad = true;
            customPad = contextualPadCustom.value;
            // if(customPad === '') {
            //     // Fall back to this, but we don't
            //     // change the UI/state accordingly, because
            //     // the user will set some value.
            //     // It would be possible to just use no padding
            //     // as well.
            //     padMode = 'auto-long';
            // }
        }

        if(useGlyphs) {
            // enable showGlyphs
            this._enableElement(selectGlyphs);
            let [charset, extendedChars] = getCharsForSelectUI(this._charGroups, font, selectGlyphs.value);
            useExtended = extendedChars.length > 0;
            selectedChars = useExtended && showExtendedGlyphs.checked
                                 ? [...charset, ...extendedChars]
                                 : charset
                                 ;
        }
        else
            // disable showGlyphs
            this._disableElement(selectGlyphs);

        if(useCustomPad) {
            this._enableElement(contextualPadCustomContainer);
            this._enableElement(contextualPadCustom);
        }
        else {
            this._disableElement(contextualPadCustomContainer);
            this._disableElement(contextualPadCustom);
        }

        showExtendedGlyphs.disabled = !useExtended;
        showExtended = !showExtendedGlyphs.disabled && showExtendedGlyphs.checked;

        onFontChange(font, proof);
        const originalAPI = initContextual(proof, selectedChars, charsForKey
                            , fixContextualLineBreaks.bind(null, font), showExtended
                            , this._charGroups._extended, padMode, customPad)
          , augmentedAPI = originalAPI ? Object.create(originalAPI) : {}
          ;
        augmentedAPI.update = (changedDependencyNamesSet)=>{
            if(changedDependencyNamesSet.has('fontName'))
                onFontChange(this.getFont(this._animationState.fontName), proof);
            else if(changedDependencyNamesSet.has('otFeaturesChooser'))
                otFeaturesChooser.applyFeatures(proof);

            if(changedDependencyNamesSet.has('colors'))
                this._setColorsToProof();
            return originalAPI?.update();
        };

        this._setColorsToProof();

        return augmentedAPI;
    }

    _uiInitProofTypespec() {
        let { proof, multipleTargets, columnWidth, colors, variationSettingsFlags
            , otFeaturesChooser} = this._ui;
        // Chicken-Egg: right now, the proof knows just after parsing
        // the template, how many "targets" it has, that is e.g. important
        // the states structure. So, in a way, the template should be
        // parsed prior to this init call, then we could give along all
        // the state, includig the template.
        // There's a paradigm shift, in that the proof becomes itself
        // UI that can change state.
        // We have "Type Your Own" which has editing, but that editing
        // is applied from a UI-Element outside of the proof. Now, the
        // proof itself defines UI-Elements.

        // could inject _stateChangeHandler or something like that

        // hmm, we can expect here to always have at least one target,
        // so initially, the active state could always go to 0.
        // still need to know how many states there will be and we can
        // know after parsing the template. the template then, consequently,
        // should be injected from here into initTypespec.


        // The templates and parsing functions can still be located within
        // the module.
        const domTool = new DOMTool(proof.ownerDocument)
            // TODO: At Some point we may have a choice of typespecTemplate
            //       and consequently a different typoTargetAmount is possible
          , [templateElement, typoTargetAmount, templateDefaults] = typespecTemplateToDOM(domTool, typespecTemplate)
            // need to address the typographic targets


            // this is a stub as well, how to populate states???

            // for one: the template should have some defaults, but we
            // can as well have global defaults for h1,h2,h3 it's just
            // fontSize I presume (weight?)
            //
            // we shoud use PROOF_STATE_DEPENDENCIES to handle this
            //
            // in general, each proof should have "multiple" states, but
            // use just one ... then this case would not be an exception
            // anymore.
            //
            // So, initial states OR states loaded from serialization ...
            //     loading from serialization would leave the states
            //     somewhere in ... the this._ui structure
            //
            // Not happy with the implementation, but I think
            // it's in the right direction.

          , _getAutoLeading = (targetfontSizePT, columnWidthEN)=>{
                // 16 pt is the base font-size to which getColumnWidthEN
                // is relative.
                // fontSize is in PT so far
                //
                const baseFontSizePT = 12
                  , columnWidthPT = columnWidthEN / 2 * baseFontSizePT
                  , targetColumnWidthEN = columnWidthPT / targetfontSizePT * 2
                  ;
                let result = getAutoLineHeight(targetColumnWidthEN);
                return result.toFixed(2);
            }
          , getAutoLeading = (targetfontSizePT)=>{
                const columnWidthEN = parseFloat(this._ui.columnWidth.value);
                return _getAutoLeading(targetfontSizePT, columnWidthEN);
            }
          , updateFontLeading = (state) =>{
                let {fontSize, fontLeading} = state;
                if(fontLeading[0] === UIFontLeading.MODE_AUTO)
                    state.fontLeading = [
                        UIFontLeading.MODE_AUTO
                      , getAutoLeading(parseFloat(fontSize))
                    ];
                // else: Pass, no uppdate needed, is manual.
                return state;
            }
            //FIXME: use!
            // , requiresUpdateDependencies = ['fontName']
            // Will be called when 'fontName' changes ...
          , _getDefaultManualAxisLocations = (font, fontSize) => {
                  // frame value should be propagated using CSS variables,
                  // if this is interesting anyways, however, if we do this
                  // this shouuld also end up in the UIManualAxisLocations
                  // interface, in disabled elements with an auto option
                  // set. Therefore, the values need to be propagated anyways. ;-)
                  // , frame =
                const frameMap = new Map() // ??
                  , manualAxisLocations = [] // order is important!
                  ;
                for(const [axisTag, axisDict] of Object.entries(font.axisRanges)) {
                    const step = _getInputStepsSizeForMinMax(axisDict.max, axisDict.min)
                      , location = frameMap.has(axisTag)
                            ? frameMap.get(axisTag)
                            : axisDict.default
                        // This can hold more info, e.g.
                        // a flag for auto vs. manual mode
                        // Also, the whole interface can be
                        // constructed from this.
                        // {name, min, max, "default", location}
                      , axisValue = Object.assign({}, axisDict, {step, location})
                      ;
                    if(axisTag === 'opsz' && (!('autoOPSZ' in axisValue) || axisValue.autoOPSZ))
                        axisValue.location = fontSize;
                    manualAxisLocations.push([axisTag, axisValue]);
                    //... font, frame, templateDefaults
                }
                return manualAxisLocations;
            }
          , multipleTargetsGetDefaults = ()=>{
                const font = this.getFont(this._animationState.fontName);

                otFeaturesChooser.setFont(font.fontObject);
                // UIManualAxisLocations
                const defaults = templateDefaults
                    .map(dict=> Object.assign({}, dict, {
                              manualAxisLocations: _getDefaultManualAxisLocations(font, dict.fontSize)
                            , colors: colors.defaults
                            , otFeaturesChooser: []
                    }))
                    // Set fontLeading to each item!
                    .map(updateFontLeading)
                  ;
                // Don't allow changes to this object!
                return _deepFreeze(defaults);
            }
          , multipleTargetsUpdate = ( ...changedDependencyNames)=>{
                let changedDependencyNamesSet = new Set(changedDependencyNames);
                if(changedDependencyNamesSet.has('fontName')) {
                    // only do this when fontName changes, so far ...
                    return multipleTargetsGetDefaults();
                }

                if(changedDependencyNamesSet.has('columnWidth')
                            || changedDependencyNamesSet.has('fontSize')) {
                    // Get state, only update fontLeading, according
                    //  to each fontSize, plus columnWidth.
                    // The currentState will be updated by another path.
                    let activeTarget = multipleTargets.getActiveTarget()
                      ,  newStates = multipleTargets.states
                            .map(state=>Object.assign({}, state)) // -> a copy of state
                            .map((state, i)=>i === activeTarget
                                ? state // Pass, will be updated directly.
                                : updateFontLeading(state)
                            )
                      ;
                    return newStates;
                }
            }
          , defaults = multipleTargetsGetDefaults()
          , states = multipleTargets.initTargets(typoTargetAmount
                , TYPESPEC_MULTIPLE_TARGETS// , requiresUpdateDependencies
                , multipleTargetsUpdate, defaults)
          // since the proof has interface functions, that is selecting
          // the active typo-target, we need to communicate that to the
          // kernel

            // Good example where a coherenceGuard would be requierd, to
            // update the activeTypoTarget to the manualAxisLocations interface.
          , setActiveTypoTarget = index/* could be a key/id thing as well */=>{
                const changed = multipleTargets.getActiveTarget() !== index;
                // Only trigger "on change".
                if(!changed) return;
                multipleTargets.setActiveTarget(index);
                // this._stateChangeHandler('activeTypoTarget'); ?
                // This must rotate the state variables/change the UI
                // It should happen  before __uiSetState
                // we don't know the old value for multipleTargets.activeTarget anymore
                // so it's maybe not ideal to store the old values.
                // It's similar to loading a full new state
                // i.e. like _loadStateFromLocationHash which calls setState
                //
                // It kind of needs to start with PROOF_STATE_DEPENDENCIES
                // to init the relevant UI.
                //
                // axisLocations: for now maybe duplicate this logic, to
                //       later merge into one united logic.
            }
          , updateTextHandler = (newText)=>{
                // TODO!
                console.log('updateTextHandler', newText);
                // const changed = userText.value !== newText;
                // if(!changed) return;
                // userText.value = newText;
                // this._stateChangeHandler('userText');
            }
          ;

        function applyFeatures(container, otFeaturesValue) {
            otFeaturesChooser.constructor.applyFeatures(container, otFeaturesValue);
        }

        // update view of all TYPESPEC_MULTIPLE_TARGETS ... (FIXME!)
        for(let [targetName, targetValue] of Object.entries(multipleTargets.activeState))
            this._ui[targetName].value = targetValue;

        const originalAPI = initTypespec(proof, domTool, templateElement
                          , setActiveTypoTarget, updateTextHandler, applyFeatures
                          , multipleTargets.getActiveTarget(), states
                          , columnWidth.value, variationSettingsFlags.value)
          , augmentedAPI = Object.create(originalAPI)
          ;
        augmentedAPI.update = (/* ...changedDependencyNamesSet*/)=>originalAPI.update(
                multipleTargets.getActiveTarget(), multipleTargets.states
              , columnWidth.value, variationSettingsFlags.value);

        return augmentedAPI;
    }

    _uiInitProofWaterfall() {
        let { proof, fontSizeFrom: fontSize, fontSizeTo, manualAxisLocations, alignment
            , variationSettingsFlags, userText, otFeaturesChooser, manualFontLeading
            } = this._ui;
        const domTool = new DOMTool(proof.ownerDocument)
          , updateTextHandler = (newText)=>{
                const changed = userText.value !== newText;
                if(!changed) return;
                userText.value = newText;
                this._stateChangeHandler('userText');
            }
          , _getDefaultManualAxisLocations = (font, fontSize) => {
                  // frame value should be propagated using CSS variables,
                  // if this is interesting anyways, however, if we do this
                  // this should also end up in the UIManualAxisLocations
                  // interface, in disabled elements with an auto option
                  // set. Therefore, the values need to be propagated anyways. ;-)
                  // , frame =
                const frameMap = new Map() // ??
                  , manualAxisLocations = [] // order is important!
                  ;
                for(const [axisTag, axisDict] of Object.entries(font.axisRanges)) {
                    const step = _getInputStepsSizeForMinMax(axisDict.max, axisDict.min)
                      , location = frameMap.has(axisTag)
                            ? frameMap.get(axisTag)
                            : axisDict.default
                        // This can hold more info, e.g.
                        // a flag for auto vs. manual mode
                        // Also, the whole interface can be
                        // constructed from this.
                        // {name, min, max, "default", location}
                      , axisValue = Object.assign({}, axisDict, {step, location})
                      ;
                    if(axisTag === 'opsz' && (!('autoOPSZ' in axisValue) || axisValue.autoOPSZ))
                        axisValue.location = fontSize;
                    manualAxisLocations.push([axisTag, axisValue]);
                    //... font, frame, templateDefaults
                }
                return manualAxisLocations;
            }
            ;

        function onFontChange(font, proof) {
            console.log('_uiInitProofGrid onFontChange');
            // set font to otFeaturesChooser
            // apply features to proof
            otFeaturesChooser.setFont(font.fontObject);
            otFeaturesChooser.applyFeatures(proof);
        }

        {
            const font = this.getFont(this._animationState.fontName);
            manualAxisLocations.value = _getDefaultManualAxisLocations(font, fontSize.value);
            onFontChange(font, proof);
        }
        const originalAPI = initWaterfall(proof, domTool, updateTextHandler
                          , fontSize.value, fontSizeTo.value
                          , manualAxisLocations.value, alignment.value
                          , variationSettingsFlags.value, userText.value
                          , manualFontLeading.value)
          , augmentedAPI = Object.create(originalAPI)
          ;
        augmentedAPI.update = (changedDependencyNamesSet)=>{
            console.log('Waterfall update', ...changedDependencyNamesSet);
            if(changedDependencyNamesSet.has('fontName')) {
                const font = this.getFont(this._animationState.fontName);
                // FIXME: This is kind of annoying, manualAxisLocations gets
                // the information that fontName (the font) has changed,
                // but it only updates the select for the styles (fvar instances).
                // probably because it doesn't know fontSize and there are
                // more layers to this problem.
                manualAxisLocations.value = _getDefaultManualAxisLocations(font, fontSize.value);
                onFontChange(font, proof);
            }
            else if(changedDependencyNamesSet.has('otFeaturesChooser'))
                otFeaturesChooser.applyFeatures(proof);

            if(changedDependencyNamesSet.has('colors')) {
                // shortcut
                this._setColorsToProof();
                if(changedDependencyNamesSet.size === 1)
                    return;
            }
            originalAPI.update(
                            changedDependencyNamesSet
                          , fontSize.value, fontSizeTo.value
                          , manualAxisLocations.value, alignment.value
                          , variationSettingsFlags.value, userText.value
                          , manualFontLeading.value);
        };
        this._setColorsToProof();
        return augmentedAPI;
    }

    _uiInitProofVarToolsGrid() {
        let { proof, fontSizeGrid: fontSize , manualAxisLocations, alignment
            , variationSettingsFlags, gridDimensionControls, userText
            , otFeaturesChooser, manualFontLeading
            } = this._ui;
        const domTool = new DOMTool(proof.ownerDocument)
          , updateTextHandler = (newText)=>{
                const changed = userText.value !== newText;
                if(!changed) return;
                userText.value = newText;
                this._stateChangeHandler('userText');
            }
          , _getDefaultManualAxisLocations = (font, fontSize) => {
                  // frame value should be propagated using CSS variables,
                  // if this is interesting anyways, however, if we do this
                  // this should also end up in the UIManualAxisLocations
                  // interface, in disabled elements with an auto option
                  // set. Therefore, the values need to be propagated anyways. ;-)
                  // , frame =
                const frameMap = new Map() // ??
                  , manualAxisLocations = [] // order is important!
                  ;
                for(const [axisTag, axisDict] of Object.entries(font.axisRanges)) {
                    const step = _getInputStepsSizeForMinMax(axisDict.max, axisDict.min)
                      , location = frameMap.has(axisTag)
                            ? frameMap.get(axisTag)
                            : axisDict.default
                        // This can hold more info, e.g.
                        // a flag for auto vs. manual mode
                        // Also, the whole interface can be
                        // constructed from this.
                        // {name, min, max, "default", location}
                      , axisValue = Object.assign({}, axisDict, {step, location})
                      ;
                    if(axisTag === 'opsz' && (!('autoOPSZ' in axisValue) || axisValue.autoOPSZ))
                        axisValue.location = fontSize;
                    manualAxisLocations.push([axisTag, axisValue]);
                    //... font, frame, templateDefaults
                }
                return manualAxisLocations;
            }
            ;

        gridDimensionControls.receiveUIs({manualAxisLocations, fontSize});

        function onFontChange(font, proof) {
            console.log('_uiInitProofGrid onFontChange');
            // set font to otFeaturesChooser
            // apply features to proof
            otFeaturesChooser.setFont(font.fontObject);
            otFeaturesChooser.applyFeatures(proof);
        }

        {
            const font = this.getFont(this._animationState.fontName);
            manualAxisLocations.value = _getDefaultManualAxisLocations(font, fontSize.value);
            gridDimensionControls.updateFontAxes();
            onFontChange(font, proof);
        }

        const originalAPI = initVarToolsGrid(proof, domTool, updateTextHandler
                          , fontSize.value
                          , manualAxisLocations.value, alignment.value
                          , variationSettingsFlags.value
                          , gridDimensionControls.value, userText.value
                          , manualFontLeading.value)
          , augmentedAPI = Object.create(originalAPI)
          ;
        augmentedAPI.update = (changedDependencyNamesSet)=>{
            console.log('TypeTools Grid update', ...changedDependencyNamesSet);
            if(changedDependencyNamesSet.has('fontName')) {
                const font = this.getFont(this._animationState.fontName);
                // FIXME: This is kind of annoying, manualAxisLocations gets
                // the information that fontName (the font) has changed,
                // but it only updates the select for the styles (fvar instances).
                // probably because it doesn't know fontSize and there are
                // more layers to this problem.
                manualAxisLocations.value = _getDefaultManualAxisLocations(font, fontSize.value);
                gridDimensionControls.updateFontAxes();
                onFontChange(font, proof);
            }
            else if(changedDependencyNamesSet.has('otFeaturesChooser'))
                otFeaturesChooser.applyFeatures(proof);

            if(changedDependencyNamesSet.has('colors')) {
                // shortcut
                this._setColorsToProof();
                if(changedDependencyNamesSet.size === 1)
                    return;
            }
            originalAPI.update(
                            changedDependencyNamesSet
                          , fontSize.value
                          , manualAxisLocations.value, alignment.value
                          , variationSettingsFlags.value
                          , gridDimensionControls.value, userText.value
                          , manualFontLeading.value);
        };
        this._setColorsToProof();
        return augmentedAPI;
    }

    _getGeneralStateVideoproofLegacy() {
            // We need frame, but t, fromKeyFrameIndex and keyFrameT
            // can be used to compare with the state after deserialization
            // but therefore, it's just logged.
            // duration: could be serialized as well!
        let [frame, /*t*/, /*duration*/, /*fromKeyFrameIndex*/, /*keyFrameT*/
                    ] = this._animationState.lastYield
          , { selectLayout, colors } = this._ui
          ;

        // FIXME: This should be driven by the contents of \
        // GENERAL_VIDEOPROOF_STATE_STRUCTURE, this way it's a redundancy IN
        // _serializeStateForURLVideoproofLegacy which depends on generalState.
        // Well, eventually it will be superseeded by the state model of
        // the new version, but so far, these can be reused, especially
        // e.g. the fontParticles mechanism but also comment and highlightSelection
        // ara contentwise good.
        return {
            dateTime: new Date()
          , fontParticles: this.getFont(this._animationState.fontName).serializationNameParticles
          , axisLocations: frame.map(([k, v])=>[k, Math.round(v)])
          , proofFormatTag: selectLayout.value
          , comment: this._uiCommentIsActive()
                        ? this._ui.comment.value.trim()
                        : ''
          , highlightSelection: this._getMergedSelectionRanges()
          , colors: colors.value
        };
    }

    getStateForSerializationVideoproofLegacy() {
        // "Proof Format" state that is widget specific:
        // grid:
        //     chars/glyphs selection: str, key
        //     show-extended
        // type-your-own:
        //     custom-text: str
        //     always-fit-line: bool
        //     show-extended
        let generalState = this._getGeneralStateVideoproofLegacy()
          , proofFormatTag = generalState.proofFormatTag
          , proofTag = _formatProofTag(proofFormatTag)
          , proofState = this.getProofStateForSerializationVideoproofLegacy(proofTag)
          ;
        return [generalState, proofState];
    }

    _genericSerializationOfValue(value) {
        if(typeof value === 'boolean')
                return value ? '1' : '0';
        if(typeof value === 'string')
            return encodeURIComponent(value);
        if(value === null)
            return '';
        if(typeof value === 'number')
            return value.toString(10);
        else
            throw new Error(`Not implemented generic serialization of type ${typeof value}`);
    }

    _serializeStateForURLVideoproofLegacy(state) {
        let [generalState, proofState] = state
          , serializedGeneralValues = []
          , serializedProofValues = []
          ;

        for(let [k, serialize, ] of GENERAL_VIDEOPROOF_STATE_STRUCTURE)
            serializedGeneralValues.push(serialize(generalState[k]));

        for(let value of proofState) {
            let serialized = this._genericSerializationOfValue(value);
            serializedProofValues.push(serialized);
        }

        return [
            serializedGeneralValues,
            serializedProofValues
        ].map(serialized=>{
            // remove empty '', trailing entries
            while(serialized[serialized.length-1] === '')
                serialized.pop();
            return serialized.join(';');
        }).join('&');
    }

    _videoPoofLegacyStates = new Set(['grid', 'type-your-own', 'contextual']); // jshint ignore:line

    _serializationHelper(proofDependencyName, value) {
        const [type, uiItem] = this._getUITypeAndElement(proofDependencyName);
        if(type === '_UIBase') {
            const result = uiItem.constructor.serializeForUrl(value);
            return uiItem.hasOwnProperty(_UIBase.SERIALIZATION_TYPE_FLAT)
                    ? [result] : result;
        }
        switch(type) {
            case 'number':
                let rawResult = this._genericSerializeForUrl(type, {value: value});
                return [this._genericSerializationOfValue(rawResult)];
        }

        throw new Error(`_serializationHelper don't know what to do with ${proofDependencyName} type ${type}`);
    }

    _uiSerializeForUrl(proofDependencyName) {
        const [type, uiItem] = this._getUITypeAndElement(proofDependencyName)
             // Use encodeURIComponent, but this is just the minimal requirement
             // e.g. strings with line-breaks shold also be URI-emcoded etc.
           , isInvalid=val=>(typeof val !== 'string' || val.indexOf(';') !== -1)
           , explainInvalid = 'is a string not containing any blank semicolons (;)'
           ;
        if(type === '_UIBase') {
            const result = uiItem.serializeForUrl();
            if(!Array.isArray(result) || result.some(isInvalid)){
                console.warn(`INVALID RESULT`, result);
                throw new Error(`ASSERTION FAILED _UIBase.serializeForUrl must `
                    + `return a flat array where each element ${explainInvalid} `
                    + `for ${proofDependencyName} a ${uiItem.constructor.name} `
                    + `See log for result value`);
            }
            return result;
        }

        const rawResult = this._genericSerializeForUrl(type, uiItem)
          , result = this._genericSerializationOfValue(rawResult)
          ;
        if(isInvalid(result))
             throw new Error(`ASSERTION FAILED _genericSerializeForUrl must `
                + `return a value that ${explainInvalid} for ${proofDependencyName} a ${type}`);
        return [result];
    }

    _deserializationHelper(dependencyName, index, chunks) {
        return this._uiDeserializeFromUrl(dependencyName, index, chunks);
    }

    _uiDeserializeFromUrl(proofDependencyName, index, chunks) {
        const [type, uiItem] = this._getUITypeAndElement(proofDependencyName);
        if(type === '_UIBase')
            return uiItem.deserializeFromUrl(index, chunks);

        const [value, message] = this._genericDeserializeFromUrl(proofDependencyName, type, uiItem, chunks[index])
          , consumed = 1
          ;
        return [consumed, value, message];
    }

    _serializeForUrl() {
        const { selectLayout } = this._ui
          , proofFormatTag = selectLayout.value
          ;
        if(this._videoPoofLegacyStates.has(proofFormatTag)) {
           let state = this.getStateForSerializationVideoproofLegacy();
           return this._serializeStateForURLVideoproofLegacy(state);
        }
        else {
            let generalState = this._getGeneralStateVideoproofLegacy()
              , proofFormatTag = generalState.proofFormatTag
              , proofTag = _formatProofTag(proofFormatTag)
              , dependencies = PROOF_STATE_DEPENDENCIES[proofTag]
              // Reusing some stuff of GENERAL_VIDEOPROOF_STATE_STRUCTURE
              // Also reusing initial order of GENERAL_VIDEOPROOF_STATE_STRUCTURE.
              , result = GENERAL_VIDEOPROOF_STATE_STRUCTURE
                    .filter(([key])=>PROOF_NEW_STYLE_USE_FROM_VIDEOPROOF_STATE_STRUCTURE[proofTag].has(key))
                    .map(([key, serialize])=>serialize(generalState[key]))
              ;
            // console.log('generalState', generalState, ...result);
            // console.log(`DEPENDENCIES ${proofTag}`, ...dependencies);
            // console.log(`generalState ${proofTag}`, generalState);

            if(proofTag === 'TYPESPEC')
                // These are all covered via the multiple targets item.
                dependencies = dependencies.filter(dep=>!TYPESPEC_MULTIPLE_TARGETS.includes(dep));


            for(const dependencyName of dependencies) {
                if(!this._ui.hasOwnProperty(dependencyName))
                    throw new Error(`NOT FOUND ui element ${dependencyName}.`);

                const elementResult = this._uiSerializeForUrl(dependencyName);
                result.push(...elementResult);
            }
            result.push(`@v2:${proofFormatTag}`);
            return result.join(';');
        }
    }

    *_deserializeFromURLV2(stateStr) {
        const chunks = Object.freeze(stateStr.split(';'))
          , [proofFormatTag, proofFormatTagMessage] = (chunk=>{
                const v2Marker = '@v2:';
                if(!chunk.startsWith(v2Marker))
                    return [null, `Can't find proofFormatTag, last chunk should start with ${v2Marker} but is ${chunk}.`];
                return [chunk.slice(v2Marker.length), null];
            })(chunks[chunks.length-1])
            ;
        // console.log(`_deserializeFromURLV2 got ${chunks.length} chunks`, chunks);
        if(proofFormatTagMessage)
            throw new Error(`PARSE URL ERROR ${proofFormatTagMessage}`);

        const proofTag = _formatProofTag(proofFormatTag);
        if(!(proofTag in PROOF_STATE_DEPENDENCIES))
            throw new Error(`PARSE URL ERROR proofTag is unkown: "${proofTag}".`);

              // Reusing some stuff of GENERAL_VIDEOPROOF_STATE_STRUCTURE
              // Also reusing initial order of GENERAL_VIDEOPROOF_STATE_STRUCTURE.
        const legacyDependenciesSet = proofTag in PROOF_NEW_STYLE_USE_FROM_VIDEOPROOF_STATE_STRUCTURE
                ? PROOF_NEW_STYLE_USE_FROM_VIDEOPROOF_STATE_STRUCTURE[proofTag]
                : new Set()
          , dependencies = (proofTag === 'TYPESPEC')
                // These are all covered via the multiple targets item.
                ? PROOF_STATE_DEPENDENCIES[proofTag].filter(dep=>!TYPESPEC_MULTIPLE_TARGETS.includes(dep))
                : PROOF_STATE_DEPENDENCIES[proofTag]
          , generalState = {proofFormatTag}
          , proofState = []
          ;
        let index = 0
          , totalConsumed = 0
          ;
        for(const [key, ,deserialize] of GENERAL_VIDEOPROOF_STATE_STRUCTURE){
            if(!legacyDependenciesSet.has(key))
                continue;
            const [value, message] = deserialize(chunks[index]);
            index += 1;
            totalConsumed += 1;
            if(message)
                throw new Error(`PARSE URL ERROR reading ${key} failed with "${message}" at chunk #${index}.`);
            generalState[key] = value;
        }
        // console.log('DESERIALIZED generalState', generalState);
        yield generalState;

        try {
        // can only continue when the proof has been initialized!
        for(const dependencyName of dependencies) {
            if(!this._ui.hasOwnProperty(dependencyName))
                throw new Error(`PARSE URL ERROR not found ui element ${dependencyName}.`);
            // console.log('parsing', index, dependencyName, chunks[index]);
            const [consumed, value, message] = this._uiDeserializeFromUrl(dependencyName, index, chunks);
            // console.log('DONE', 'consumed', consumed, 'value', value, 'message', message);
            if(message)
                throw new Error(`PARSE URL ERROR reading ${dependencyName} failed with "${message}" (at chunk #${index}).`);
            index += consumed;
            totalConsumed += consumed;
            proofState.push([dependencyName, value]);
        }
        }
        catch(error) {
            throw error;
        }
        console.log('DONE DESERIALIZED proofState', proofState);
        yield proofState;
    }

    _deserializedStateFromURLVideoproofLegacy(stateStr) {
        let [generalData, proofCustomData] = stateStr.split('&')
          , generalItems = generalData.split(';')
            // could be undefined, if there's no & in stateStr
          , proofCustomItems = proofCustomData ? proofCustomData.split(';') : []
          , generalState = {}, generalStateMessages = {}
          ;
        for(let [i, [key, , deserialize]] of GENERAL_VIDEOPROOF_STATE_STRUCTURE.entries()) {
                           // [value, message]
            [generalState[key], generalStateMessages[key]] = deserialize(
                        generalItems[i] === undefined ? '' : generalItems[i]
            );
        }

        let proofTag = _formatProofTag(generalState.proofFormatTag)
          , [proofState, proofStateMessages] = this._deserializeProofState(proofTag, proofCustomItems)
          ;
        return [generalState, generalStateMessages, proofState, proofStateMessages];
    }

    _deserializedStateFromURL(stateStr) {
        const isV1=str=>{
            const maybeProoftag = str.split('&', 1).pop().split(';', 4).pop();
            return this._videoPoofLegacyStates.has(maybeProoftag);
        };
        if(isV1(stateStr))
            // goes into _setStateVideoproofLegacy
            return this._deserializedStateFromURLVideoproofLegacy(stateStr);
        // goes into _setStateVersion2
        return ['v2', this._deserializeFromURLV2(stateStr)];
    }

    _getFontFromSerialization(state) {
        //  * there are multiple equal font/version combinations (from different sources)
        //              => pick one
        //  * font/version font is not available/version mismatch
        //              => choose a different font/version
        //              => load a different font locally
        //  * missing animation axes
        //              => chosse a different font/version
        //              => load a different font locally
        //              => skip missing axes
        //              => use missing axes regardless
        //  * axis values are out of axis range
        //              => chosse a different font/version
        //              => load a different font locally
        //              => clamp axis values to ranges
        //              => use axis values regardless
        //
        // So the above menu flows down, and when we are e.g. at the bottom
        // and want to start new, e.g. because the font we have chosen
        // doesn't support the required axis ranges, we need a way to start
        // over again. Starting over again will mean we use the same initial
        // state. but since chosse/load a different font/version is aalways
        // available and the other choices always appear afterwards, there
        // should be no problem.
        let fontName
          , messages = []
          , matchResults = new Map()
          ;
        for(let [fullName, font] of this._fonts.entries()) {
            let serializationParticles = font.serializationNameParticles
             , matches = Array.from(zip(serializationParticles, state.fontParticles))
                              .map(([a, b])=>a===b)
             ;
            // perfect match would be all items
            // after the first none match item we can stop, i.e.
            // if the font-name does not match, we don't compare versions
            // and if there'd be particle after version (source maybe), but
            // the version did not match, we don't look at that either.
            // hence, a match score that is equal to state.fontParticles.length is
            // a perfect match
            let matchScore = 0;
            for(let item of matches) {
                if(item)
                    matchScore += 1;
                else
                    // Mnly matches consecutive matches from the beginning
                    // are counted to the matchScore.
                    break;
            }
            if(!matchResults.has(matchScore))
                matchResults.set(matchScore, []);
            matchResults.get(matchScore).push(fullName);
        }
        if(matchResults.has(state.fontParticles.length)) {
            // these are perfect matches
            // I would just normaly just go witht the first perfect match in
            // the list however, if we use the last perfect match, it's the
            // last font that got loaded, and that may be a font the user
            // has dropped and is expecting to use.
            let perfectMatches = matchResults.get(state.fontParticles.length);
            fontName = perfectMatches[perfectMatches.length-1];
        }
        else {
            for(let matchScore=state.fontParticles.length-1;matchScore>0;matchScore--) {
                if(!matchResults.has(matchScore))
                    continue;
                //inform the user of the imperfection...
                //       use the font still
                let imperfectMatches = matchResults.get(matchScore);
                fontName = imperfectMatches[imperfectMatches.length-1];
                let font =  this._fonts.get(fontName);
                messages.push(
                      `Font is not a perfect match. Requested: ${state.fontParticles.join(', ')} `
                    + `Found: ${font.serializationNameParticles.join(', ')}`);
                  break;
            }
            if(!fontName) {
                messages.push(`No font found for: ${state.fontParticles.join(', ')}`);
                return [undefined, messages];
            }
        }
        return [fontName, messages];
    }

    _checkFontAxisFit(fontName, axisLocations) {
        let messages = []
          // Check for axes fit
          // This will only be reported to the user, the font and state
          // could be/will be load regardless.
         , axisRanges = this._fonts.get(fontName).axisRanges
         ;
        for(let [axisTag, axisValue] of axisLocations) {
            if(!(axisTag in axisRanges)) {
                messages.push(`Unknown Axis "${axisTag}" (at value: ${axisValue})`);
                continue;
            }
            let { min: minVal, max: maxVal } = axisRanges[axisTag];
            if(axisValue < minVal || axisValue > maxVal) {
                messages.push(`Axis value out of range for ${axisTag}. Requested: ${axisValue} `
                            + `Min: ${minVal} Max: ${maxVal}`);
            }
        }
        return messages;
    }

    _getMoarAnimationStateAtClosestLocation(baseAnimationState, moarAxisTag, moarAxisLocation) {
        let animationStateMoar = this._initAnimationStateMoar(baseAnimationState, moarAxisTag)
          , [baseFrame, ] = baseAnimationState.lastYield
          ;
        let baseFrameMap = new Map(baseFrame)
          , [keyFrameAxisOrder, keyFramesCoordinates] = animationStateMoar.toKeyFramesOrderAndCoordinates()
          , searchLocation = keyFrameAxisOrder.map(axisTag=>axisTag === moarAxisTag
                                ? moarAxisLocation
                                  // despite of moarAxisTag all locations in animationStateMoar
                                  // are fixed to the baseFrame locations.
                                : baseFrameMap.get(axisTag))
          , [/*distance*/, t,/*point*/] = _getClosestPointFromKeyFrames(keyFramesCoordinates, searchLocation)
          ;
          animationStateMoar.next({t});
          return animationStateMoar;
    }

    _uiCommentIsActive() {
        let { commentBox } = this._ui
          , window = commentBox.ownerDocument.defaultView
          , style = window.getComputedStyle(commentBox)
          , active = style.getPropertyValue('display') !== 'none'
          ;
        return active;
    }
    _uiCommentShow() {
        let { commentBox } = this._ui;
        commentBox.style.setProperty('display', 'initial');
    }
    _uiCommentHide() {
        let { commentBox } = this._ui;
        commentBox.style.setProperty('display', 'none');
    }
    _uiCommentToggle() {
        if(!this._uiCommentIsActive())
            this._uiCommentShow();
        else
            this._uiCommentHide();
    }

    /* If there's no comment, the comment ui should be hidden
     * similarly, if the comment ui is shown and is changed to a none
     * value it shold be hidden again.
     */
    _setComment(str) {
        let { comment } = this._ui;
        if(!str)
            this._uiCommentHide();
        else {
            this._uiCommentShow();
            comment.value = str;
        }
    }

    _getUITypeAndElement(proofDependency) {
        const { Element } = this._mainUIElement.ownerDocument.defaultView
          , element = this._ui[proofDependency]
          ;
        let type;

        if(!element)
            throw new Error(`KEY ERROR UI item not found: ${proofDependency}.`);

        if(element instanceof Element) {
                type = element.tagName === 'SELECT'
                    ? 'select'
                    : element.type.toLowerCase()
                    ;
        }
        else if(element instanceof _UIBase) {
            type = '_UIBase';
        }
        else if('value' in element) {
            type = 'pseudo';
        }
        else
            throw new Error(`Don't know what to do with type of "${proofDependency}": ${element}`);
        return [type, element];
    }

    _notImplementedForSerialization(proofDependency) {
        return NOT_IMPEMENTED_FOR_SERIALIZATION.includes(proofDependency);
    }

    _setProofStateVideoproofLegacy(changedDependencyNames, dependencies, proofState) {
        for(const proofDependency of dependencies) {
            if(this._notImplementedForSerialization(proofDependency)) {
                console.warn(`setState: PROOF_STATE_DEPENDENCIES skipping ${proofDependency} NOT IMPLEMENTED.`);
                continue;
            }

            const value = proofState[proofDependency];
            if(value === undefined)
            // Was likely disabled when serializing, we don't change
            // the input.
            continue;

            const [type, element] = this._getUITypeAndElement(proofDependency)
              , changed = this._genericSetValueToDependency(type, element, value)
              ;
            if(changed)
                changedDependencyNames.add(proofDependency);
        }
    }

    /**
     * Return false if state could not be applied
     * Return true if state was applied.
     *
     * Will become async, as modal user-interaction is required eventually.
     */
    async _setStateVideoproofLegacy(state) {
        let [generalState, generalStateMessages, proofState, proofStateMessages] = state
          , changedDependencyNames = new Set()
          ;
        // Display messages to the user.
        // If there are no messages in the whole deserialization, there's
        // no dialog to show to the user, but if there are, a modal will
        // have to be opened.
        let forPrint = (msgs)=>Object.entries(msgs)
                .filter(([k, v])=>v!==undefined && v.length)
                .map(([k,v])=>`  ${k}: ${v}`).join('\n');
        if(generalStateMessages)
             console.warn('generalStateMessages\n', forPrint(generalStateMessages));
        if(proofStateMessages)
             console.warn('proofStateMessages\n', forPrint(proofStateMessages));

        // TODO handle intelligently:
        //          * font is not available
        //               font version mismatch
        //               missing animation axes
        //          * There are multiple equal fonts (from different sources)
        //          * custom location, that can't be reached with the existing keyframes
        //          * initialize and go to animation position (t) from
        //          * in the widgets: stuff adressed for the widget that it doesn't understand
        // Feature idea: keep state but change font. e.g. to compare different font versions

        let [fontName, messages/*, choices */] = this._getFontFromSerialization(generalState);

        if(!fontName) {
            console.warn(`getFontFromSerialization ${ messages.join('\n')}`);
            fontName = await this._uiDialogHandleFontMissing(generalState.fontParticles);
            if(!fontName)
                return false;
        }
        // There was an error:
        //      via VideoproofController constructor initial resources: TypeError: this._animationState is null
        // __activateFont calls _hydrateFont and defines/updates this._animationState
        // await this._hydrateFont(fontName);
        await this.activateFont(fontName);

        if(generalState.axisLocations)
            messages = this._checkFontAxisFit(fontName, generalState.axisLocations);
            if(messages.length)
                console.warn('checkFontAxisFit:', messages.join('\n'));

        // Now build the AnimationStates.
        // There may be an AnimationState in the request that we don't know
        // how to build, in That case, we build the closest state we can
        // come up with, but display the requested frame initially.
        // We'll have to inform about the discrepancy between available animation
        // /animation continuation and displayed state. Maybe in the future we
        // can handle these things differently (clamp onto some un-animated axis
        // value?

        // registered axis:
        let font = this.getFont(fontName)
          , baseAnimationState = this._initAnimationGenerator(font)
          , [keyFrameAxisOrder, keyFramesCoordinates] = baseAnimationState.toKeyFramesOrderAndCoordinates()
            // get a t closest to generalState.axisLocations
          , axisLocationsMap = new Map(generalState.axisLocations)
            // closest state: all available registered axes in the base state
            //               if the generalState.axisLocations is missing
            //               any of the registered axes, we fill them in using
            //               the axis default values.
          , animationState
          , t = 0
          ;
        if(keyFrameAxisOrder !== null) {
            let searchLocation = keyFrameAxisOrder.map(axisTag=>
                axisLocationsMap.has(axisTag)
                    ? axisLocationsMap.get(axisTag)
                    : font.axisRanges[axisTag]['default']
                )
              , [/*distance*/, baseT, /*point*/] = _getClosestPointFromKeyFrames(keyFramesCoordinates, searchLocation)
              ;
              t = baseT;
        }
        baseAnimationState.next({t});

        // if there are moar axis in generalState.axisLocations ...
        let moarAxesLocations = (generalState.axisLocations || []).filter(
                ([axisTag, /*location*/])=>
                    axisTag in font.axisRanges
                    && REGISTERED_AXES_ORDERED.indexOf(axisTag) === -1)
          , moarAxesMap = new Map(moarAxesLocations)
          , moarAxesTags = Array.from(moarAxesMap.keys())
          ;
        moarAxesTags.sort(axisTagCompare);

        // Of the other (moar) axes in generalState we sort and use the
        // first for the MOAR AnimationState. We report that we dropped
        // the rest.
        // We could drop axis at default positions! that way, we see
        // what really differs from the actuall resume position and
        // the requested position.
        let noneDefaultMoarAxesLocations = moarAxesLocations
                .filter(([axisTag, location])=>
                        font.axisRanges[axisTag]['default'] !== location);
        if(noneDefaultMoarAxesLocations.length > 1) {
            // that's a user message!
            console.log(`More than one unregistered axes at none-default locations `
                       +`are in the requested state, the animation is going to `
                       +`re-enter at only on of them: ${noneDefaultMoarAxesLocations.join(', ')}`);
        }
        else if(moarAxesLocations.length > 1)
            // that's a user message!
            console.log(`More than one unregistered axes are in the requested state, `
                       +`the animation is going to re-enter at only on of them: `
                       +`${moarAxesTags.join(', ')}`);

        if(moarAxesLocations.length) {
            let moarAxisTag;
            if(noneDefaultMoarAxesLocations.length) {
                let noneDefaultMoarAxesLocationsMap = new Map(noneDefaultMoarAxesLocations);
                // moarAxesTags is sorted, take the first
                for(let axisTag of moarAxesTags) {
                    if(noneDefaultMoarAxesLocationsMap.has(axisTag)) {
                        moarAxisTag = axisTag;
                        break;
                    }
                }
            }
            else
                moarAxisTag = moarAxesTags[0];

            let moarAxisLocation = moarAxesMap.get(moarAxisTag)
              , moarAnimationState = this._getMoarAnimationStateAtClosestLocation(baseAnimationState, moarAxisTag, moarAxisLocation)
              ;
            animationState = moarAnimationState;
        }
        else
            animationState = baseAnimationState;

        let { selectLayout, colors } = this._ui
          , proofTag = _formatProofTag(generalState.proofFormatTag)
          ;
        let dependencies = PROOF_STATE_DEPENDENCIES[proofTag]
                                    // that's a "virtual" dependency,
                                    // it doesn't have a this._ui entry
                                    // directly.
                                    .filter(name=>name!=='fontName');

        if(proofState)
            this._setProofStateVideoproofLegacy(changedDependencyNames, dependencies, proofState);


        if(selectLayout.value !== generalState.proofFormatTag) {
            selectLayout.value = generalState.proofFormatTag;
            changedDependencyNames.add('proof');
        }

        // set colors to the ui elements in here
        if(generalState.colors)
            colors.value = generalState.colors;
        else
            // hard coded defaults for now
            colors.setDefault();
        changedDependencyNames.add('colors');

        // If there's no comment, the comment ui should be hidden
        // similarly, if the comment ui is shown and is changed to a none
        // value it shold be hidden again.
        this._setComment(generalState.comment);

        this._resetUISelection({normalizedRanges: generalState.highlightSelection});
        changedDependencyNames.add('highlightSelection');

        let animationDependencies = this._getAnimationStateChanges(this._animationState, animationState);
        for(let item of animationDependencies)
            changedDependencyNames.add(item);
        this._animationState = animationState;
        this.pause();

        this._stateChangeHandler(...changedDependencyNames); // calls this._uiSetState();

        // If the closest state and the requested state differ, we should
        // inform the user:
        // The requested design space coordinates are not part of the
        //  The animation will continue from a different location


        // First build the base AnimationStateKeyFrames
        // Each of the applicable (registered) axes, if not specified, go
        // to their default values.
        // Now we can get the animation t using the closest point function
        //
        // Now we see for the base how close we are to the requested state
        //
        //
        // If theres one or more moar axes:
        //      prefer the ones with none-default values
        //      pick the first (by their ordering mechanism)
        //      For the moar animation state, throw away the rest (if there's any)
        //      get the t for the
        return true;
    }

    _genericSetValueToDependency(type, element, value) {
        let changed = false;
        switch(type) {
            case 'checkbox':
                if(element.checked !== value)
                    changed = true;
                element.checked = value;
                break;
            case 'text':
            case 'select':
            case 'number':
            case 'range':
            case 'pseudo':
            case 'hidden':
                if(element.value !== value)
                    changed = true;
                element.value = value;
                break;
            case '_UIBase':
                changed = element.deserializeFromUrlGeneric(value);
                break;
            default:
                throw new Error(`Don't know how to set proof state for ${type}.`);
        }
        return changed;
    }

    _setValueToDependency(proofDependency, value) { // => bool: changed
        const [type, element] = this._getUITypeAndElement(proofDependency);
        if(type === '_UIBase') {
            element.value = value;
            return true;
        }
        return this._genericSetValueToDependency(type, element, value);
    }

    async _setStateVersion2(stateGenerator) {
        const {value:generalState} = stateGenerator.next();
        await this._setStateVideoproofLegacy([generalState]);

        // FIXME: handle error gracefully!
        let proofState;
        try {
            const iterVal = stateGenerator.next();
            proofState = iterVal.value;
        }
        catch(error) {
            console.warn(`Can't aquire proofState, giving up with error ${error}:`, error);
            return false;
        }

        const changedDependencyNames = new Set();

        console.warn('Applying proof state...');
        this._stateChangeHandlerIsSilent = true;
        try {
            for(const [dependencyName, value] of proofState) {
                const changed = this._setValueToDependency(dependencyName, value);
                if(changed)
                    changedDependencyNames.add(dependencyName);
            }
            console.warn('DONE! Applying proof state');
        }
        finally {
            this._stateChangeHandlerIsSilent = false;
        }
        this._stateChangeHandler(...changedDependencyNames); // calls this._uiSetState();
        // => true => state was restored successfully
        return true;
    }

    async setState(state) {
        if(state?.[0] === 'v2')
            return await this._setStateVersion2(state[1]);
        return await this._setStateVideoproofLegacy(state);
    }

    _genericSerializeForUrl(type, element) {
        // Don't do this check anymore, see the fontSize exception.
        // element.disabled is more of a UI-to-user information than
        // whether or not to include the element. In fact, if the element
        // should not be included, it should not be listed as a dependency!
        // if(element.disabled && proofDependency !== 'fontSize') {
        //     values.push(null);
        //     continue;
        // }
        switch(type) {
            case "checkbox":
                return element.checked;
            case "select":
            case "number":
            case "range":
            case "pseudo":
                return element.value;
            case "text":
            case "hidden":
                return element.value.trim();
            case "_UIBase":
                // Uncaught Error: NOT IMPLEMENTED serialize input type "_UIBase".
                return element.serializeForUrlGeneric();
            default:
                throw new Error(`NOT IMPLEMENTED serialize input type "${type}".`);
        }
    }

    getProofStateForSerializationVideoproofLegacy(proofTag) {
        let dependencies = PROOF_STATE_DEPENDENCIES[proofTag]
          , values  = []
          ;
        for(let proofDependency of dependencies) {
            if(proofDependency === 'fontName')
                // This is stored in the general state already
                // it also is not an item in this._ui.
                continue;
            if(this._notImplementedForSerialization(proofDependency)) {
                console.warn(`TODO getProofStateForSerializationVideoproofLegacy: Skipping `
                            + `${proofDependency}: NOT IMPLEMENTED`);
                values.push(null);
                continue;
            }

            let [type, element] = this._getUITypeAndElement(proofDependency);
            values.push(this._genericSerializeForUrl(type, element));
        }
        return values;
    }

    _genericDeserializeFromUrl(proofDependency, type, element, rawValueStr) {
        const valueStr = decodeURIComponent(rawValueStr);
        let value = null, message;
        switch(type) {
            case "checkbox":
                if(valueStr === '0')
                    value = false;
                else if(valueStr === '1')
                    value = true;
                else if(valueStr === '') {
                    /*pass: was disabled on serialization */
                }
                else
                    message = `${proofDependency}: Expected "0" or "1" as `
                            + `a symbol for a boolean but got "${valueStr}".`;
                break;
            case "select":
                let selectable = new Set([...element.options]
                                                    .map(option=>option.value));
                if(selectable.has(valueStr))
                    value = valueStr;
                else if(valueStr === '') {
                    /*pass: was disabled on serialization */
                }
                else
                    message = `${proofDependency}: Value not selectable "${valueStr}".`;
                break;
            case "text":
            case "number": // input type number
            case "range":
            case 'pseudo':
            case 'hidden':
                value = valueStr;
                break;
            case '_UIBase':
                // the element will have to do
                value = valueStr;
                break;
            default:
                message = `NOT IMPLEMENTED deserialize input type "${element.type}".`;
        }
        return [value, message];
    }

    _deserializeProofState(proofTag, items) {
        console.log('_deserializeProofState', proofTag,  PROOF_STATE_DEPENDENCIES[proofTag]
                    , '::', items);
        let dependencies = PROOF_STATE_DEPENDENCIES[proofTag]
                    .filter(name=>name!=='fontName')
          , messages = {}, values = {}
          ;
        for(let i=0, l=Math.min(dependencies.length, items.length);i<l;i++) {
            const proofDependency = dependencies[i];
            if(proofDependency === 'typeSpecTemplate') {
                 console.warn(`TODO _deserializeProofState: Skipping `
                            + `${proofDependency}: NOT IMPLEMENTED`);
                continue;
            }

            const [type, element] = this._getUITypeAndElement(proofDependency)
              , [value, message] = this._genericDeserializeFromUrl(proofDependency, type, element, items[i])
              ;

            if(message !== undefined)
                messages[proofDependency] = message;
            if(values !== undefined)
                values[proofDependency] = value;
        }
        return [values, messages];
    }

    _disableElement(element) {
        if(typeof element.uiDisable === 'function') {
            element.uiDisable();
            const name = this._uiElementToName.get(element);
            if(element.isSynchronisationItem)
                this._activeOneToManySynchronisations.delete(name);
            if(element.requiresUpdateDependencies) {
                for(let dependencyName of element.requiresUpdateDependencies) {
                    let dependants = this._dependentsRequiringUpdate.get(dependencyName);
                    if(!dependants)
                        continue;
                    dependants.delete(name);
                    // Cleaning up is not so important, could even cause
                    // worse performance than just keeping the set around.
                    // ALSO: the set could be attached to each state directly,
                    // when they have their own base class.
                    if(!dependants.size)
                        this._dependentsRequiringUpdate.delete(dependencyName);
                }
            }
        }
        else if(element.nodeType === Node.ELEMENT_NODE) {
            element.disabled = true;
            element.classList.add('input-disabled');
        }
    }

    _enableElement(element) {
        if(typeof element.uiEnable === 'function') {
            element.uiEnable();
            const name = this._uiElementToName.get(element);
            if(element.isSynchronisationItem)
                this._activeOneToManySynchronisations.add(name);
            if(element.requiresUpdateDependencies) {
                for(let dependencyName of element.requiresUpdateDependencies) {
                    const dependants = _mapGetOrInit(
                        this._dependentsRequiringUpdate, dependencyName, ()=>new Set());
                    dependants.add(name);
                }
            }
        }
        else if(element.nodeType === Node.ELEMENT_NODE) {
            element.disabled = false;
            element.classList.remove('input-disabled');
        }
    }
}

function _serializeListOfStr(strings) {
    return strings.map(encodeURIComponent).join(',');
}
function _deserializeListOfStr(string) {
    let message;
    return [string.split(',').map(decodeURIComponent), message];
}

function axisTagCompare(a, b) {
    if(a === b)
        return 0;
    // allow non-valid font axes tags (custom stuff) i.e. length !== 4
    // but put to the end ...
    if(a.length !== b.length) {
        if(a.length === 4)
            return -1;
        if(b.length === 4)
            return -1;
        return a.length - b.length;
    }

    // registered axes in order first
    let ai = REGISTERED_AXES_ORDERED.indexOf(a)
      , bi = REGISTERED_AXES_ORDERED.indexOf(b)
      ;
    if(ai !== -1 && bi === -1)
        return -1;
    if(ai === -1 && bi !== -1)
        return 1;
    if(ai !== -1 && bi !== -1)
        return ai - bi;
    // both -1, lowecase before uppercase
    let aIsUpper = a.toUpperCase() === a
      , bIsUpper = b.toUpperCase() === b
      ;
    if(!aIsUpper && bIsUpper)
        return -1;
    if(aIsUpper && !bIsUpper)
        return 1;
    // alphabetically
    return a.localeCompare(b, 'en');
}

function _serializeAxisLocations(axisLocations) {
        // Using map also removes duplicate entries, but there shouldn't be any.
    let axisLocationsMap = new Map(axisLocations)
      , keys = Array.from(axisLocationsMap.keys())
      ;
    keys.sort(axisTagCompare);
    // opsz13,wght300,wdth500,xtra412,font-size:14
    return keys.map(k=>`${k.length === 4 ? k : k+':'}`
                      +`${axisLocationsMap.get(k)}`
           ).join(',');
}

function _deserializeAxisLocations(string) {
    // TODO: if parseFloat creates a NaN we should
    //      a) filter
    //      b) create a message
    let result = []
      , removedTags = []
      , message
      ;
    if(string === '')
        return [result, message];
    for(let axisLoc of string.split(',')) {
        const  customTagIndex = axisLoc.indexOf(':')
         , [axisTag, axisValueStr] = customTagIndex != -1
                ? [axisLoc.slice(0, customTagIndex), axisLoc.slice(customTagIndex + 1)]
                : [axisLoc.slice(0, 4), axisLoc.slice(4)]
          , axisValue = parseFloat(axisValueStr)
          ;
        if(isNaN(axisValue))
            removedTags.push([axisTag, axisValueStr]);
        else
            result.push([axisTag, axisValue]);
    }
    if(removedTags.length)
        message = `Can't parse axis locations for: "${removedTags.map(([k, v])=> k + ': ' + v).join(', ')}" (raw: ${string})`;
    return [result, message];
}

function _serializeDate(date) {
    // removing miliseconds, too much precision
    return `${date.toISOString().slice(0, -5)}Z`;
}
function _deserializeDate(string) {
    // Put back miliseconds to make sure each implementation can parse the
    // correct iso date...
    // TODO: if Date.parse creates a NaN we must
    //     a) not return a data
    //     b) create a message
    let date =  Date.parse(string.slice(0,-1) + '.000Z')
      , message
      ;
    if(isNaN(date)){
        date = undefined;
        message = `Can't parse date from string: ${string}`;
    }
    return [date, message];
}

// colors like #aa1144 can be shortened to #a14
function _shortenColor(rawColor) {
    if(rawColor.length === 6) {
        let packed = [];
        for(let i=0,l=rawColor.length;i<l;i+=2) {
            if(rawColor[i] !== rawColor[i+1])
                break;
            packed.push(rawColor[i]);
        }
        // if all pairs were equal
        if(packed.length === (rawColor.length/2))
            return packed.join('');
    }
    return rawColor;
}

function _serializeRGBColor(color) {
    let c = color.slice(1)  // remove the hash;
                 .toUpperCase(); // normalize
    return _shortenColor(c);
}

function _serializeRGBColors(colors) {
   colors = colors.map(_serializeRGBColor)
        .map((c, i)=>{
            let defaultColor = COLOR_DEFAULTS[i];
            if(defaultColor &&
                    _shortenColor(c) === _shortenColor(defaultColor)
                    || c === defaultColor)
                // default foreground or background
                return '';
            return c;
        });
    // remove from tail
    while(colors[colors.length-1] === '')
        colors.pop();
    return _serializeListOfStr(colors);
}

// One or more of 0123456789ABCDEF.
// From first to last.
// Case insensitive.
const HEX_DIGITS_REGEX = /^[0123456789ABCDEF]+$/i;

function _deserializeRGBColor(color) {
    let  messageFormat = color=> `The specified color value "${color}" does `
            + 'not conform to the required format. The format is "#rrggbb" '
            + 'or "#rgb" where r, g, b are single-digit hexadecimal numbers.';
    color = color.toUpperCase();
    // check only hex-digit-chars
    if(color.match(HEX_DIGITS_REGEX) === null)
        return [undefined, messageFormat(color) + ' (not hex digits)'];
    if(color.length === 6) {
        // pass
    }
    else if(color.length >= 3 && color.length <= 4) {
        let expand = [];
        for(let c of color)
            expand.push(c, c);
        color = expand.join('');
    }
    // missmatch in length!
    // note, the used color inputs allow only rgb
    else
       return [undefined, messageFormat(color)+ ` (wrong length ${color.length})`];
    return [color, undefined];
}

function _deserializeRGBColors(string) {
    let [colors, message] = _deserializeListOfStr(string)
      , messages = []
      , _setDefaults = (...colorsItems)=> {
            for(let i=0,l=COLOR_DEFAULTS.length;i<l;i++){
                if(colorsItems[i] === '' || colorsItems[i] === undefined)
                    colorsItems[i] = COLOR_DEFAULTS[i];
            }
            return colorsItems;
        }
      ;
    colors = _setDefaults(...colors); // Set fallbacks and Don't provoke messages where defaults are in place.
    if(message)
        return [colors, message];


    [colors, messages] = [...zip(...colors.map(_deserializeRGBColor))];
    colors = _setDefaults(...colors); // Set defaults as fallbacks.
    messages = messages.filter(m=>!!m);
    if(messages.length)
        message = messages.join('\n');
    return [colors.map(c=>`#${c}`), message];
}

function _decodeURIComponent(str) {
    let message;
    return [decodeURIComponent(str), message];
}


// The Order in PROOF_STATE_DEPENDENCIES is crucially important to never change ever!
// Appending new entries is OK. This is because externally stored
// state links rely on this order and changing it would invalidate these
// links.
const TYPESPEC_MULTIPLE_TARGETS = [
            'manualAxisLocations', 'fontSize', 'fontLeading', 'alignment', 'colors', 'otFeaturesChooser'
    ]
  , PROOF_STATE_DEPENDENCIES = {
        //"_uiInitProof" => selectLayout/proofFormatTag
            // this controls the below.

        // this must be serialized
        //              deserilized
        //              used to update the current proof, when changed

        // needs fontName to dial in the glyph widths...the
        //    the UI-Element is actually selectFonts, but that one, we may
        //    rather get from animation state font-name ...
        "GRID": ['fontName', 'selectGlyphs', 'showExtendedGlyphs', 'otFeaturesChooser']
      , "TYPE_YOUR_OWN": ['customText', 'showExtendedGlyphs', 'otFeaturesChooser' /*(future: a boolean option: "avoid line breaks" that defaults to true*/]
      , "CONTEXTUAL": ['fontName', 'contextualPadMode', 'showExtendedGlyphs', 'selectGlyphs', 'contextualPadCustom', 'otFeaturesChooser']
      , "TYPESPEC": ['columnWidth'
            , 'typeSpecTemplate' // we don't really have a choice yet, but this prepares it. (placeholder in serialization)
            , 'variationSettingsFlags'
            // everything after multipleTargets is for those multiple targets
            // though, maybe some (like alignment and color) could be
            // global.
            , 'multipleTargets' /* TODO: how to initate different typpgraphic-targets? */
            /* out of these, font-size is the most important */
            , ...TYPESPEC_MULTIPLE_TARGETS
        ]
      , "WATERFALL": [
              'manualAxisLocations'
            , 'fontSizeFrom', 'fontSizeTo', 'alignment'
            , 'variationSettingsFlags'
            , 'userText'
            , 'otFeaturesChooser'
            , 'manualFontLeading'
        ]
      , "VARTOOLS_GRID": [
              'gridDimensionControls'
            , 'manualAxisLocations'
            , 'fontSizeGrid','alignment'
            , 'variationSettingsFlags'
            , 'userText'
            , 'otFeaturesChooser'
            , 'manualFontLeading'
        ]
    }
    // in serialization, reusing some of GENERAL_VIDEOPROOF_STATE_STRUCTURE.
  , PROOF_NEW_STYLE_USE_FROM_VIDEOPROOF_STATE_STRUCTURE = {
        TYPESPEC: new Set(['dateTime', 'highlightSelection', 'comment', 'fontParticles'])
      , WATERFALL: new Set(['dateTime', 'highlightSelection', 'comment', 'fontParticles', 'colors'])
      , VARTOOLS_GRID: new Set(['dateTime', 'highlightSelection', 'comment', 'fontParticles', 'colors'])
    }
    // Falls back to PROOF_STATE_DEPENDENCIES if the key is not in PROOF_REQUIRE_INIT_DEPENDENCIES.
  , PROOF_REQUIRE_INIT_DEPENDENCIES = {
        "GRID": ['fontName', 'selectGlyphs', 'showExtendedGlyphs']
      , "TYPE_YOUR_OWN": ['customText', 'showExtendedGlyphs']
      , "CONTEXTUAL": ['fontName', 'contextualPadMode', 'showExtendedGlyphs', 'selectGlyphs', 'contextualPadCustom']
        // TYPESPEC: needs only to run its own update function when the other
        // state values change.
      , "TYPESPEC": ['typeSpecTemplate']
      , "WATERFALL": []
      , "VARTOOLS_GRID": []
    }
    // These are intended to be turned on/off per proof, they don't
    // necessarily cary state for serialization themselves, but e.g.
    // animation controls (play/pause etc.)
  , VIDEPROOF_UI_DEPENDENCIES = ['keyframesdDisplayContainer', 'moarAxesDisplay'
                , 'animationControls', 'animationDurationContainer', 'aniparams'
                , 'selectGlyphsContainer', 'colors']
  , PROOF_UI_DEPENDENCIES = {
        "GRID": [...PROOF_STATE_DEPENDENCIES.GRID, ...VIDEPROOF_UI_DEPENDENCIES]
      , "TYPE_YOUR_OWN": [...PROOF_STATE_DEPENDENCIES.TYPE_YOUR_OWN, 'customTextContainer'
                , ...VIDEPROOF_UI_DEPENDENCIES]
      , "CONTEXTUAL": [...PROOF_STATE_DEPENDENCIES.CONTEXTUAL, 'contextualPadModeContainer'
                , 'contextualPadCustomContainer', ...VIDEPROOF_UI_DEPENDENCIES]
      , "TYPESPEC": [...PROOF_STATE_DEPENDENCIES.TYPESPEC , 'columnWidth'
                , 'typographyContainer',  'alignmentColorContainer'
                , 'fontSizeContainer'
                 // This is to get informed when the font changes.
                 // We'll have to update especially the manualAxisLocations
                 // but for automated leading, this is relevant as well.
                 //
                 // The wiring of this is done in _uiInitProofTypespec. ??
                 // so there's a duplication of dependency descriptions.
                 // It would be better when enabling/including multipleTargets
                 // it would itself include it's dependencies. In the end
                 // I guess we want a flat, ordered list and make surre
                 // there are no loops. (Because there are no loops we can
                 // order it in a way that all dependencies are already
                 // updated fullfilled when the dependent it is its turn.
                 // HOWEVER, I also see that there must be a difference
                 // between more demanding/effortful initializing/rebuilding
                 // and just updating, so maybe we build two dependency
                 // trees, one for each where: if(needsRebuild) else if(needsUpdate)
                 // because a rebuild must always also include the work of
                 // an update. To be sure there's no code duplication, it
                 // could be possible that the initialize/rebuild method
                 // requests to run the update method subsequently, but it
                 // could similarly be solved internally in the implementaton.
                 //
                 // For this to work, initialize/rebuild dependencies must
                 // be a superset to update dependencies, containing all
                 // update dependencies and more. Othwerwise
                 // update would never run (may be fine). Initialize/rebuild
                 // also must have full access to all update dependencies.
                 // In other words, initalize is only triggered when the
                 // depedencies that channged are in initilaize but not
                 // in update.
                 //
                 //
                 // CAUTION: fontName here actually stands for font, as
                 //          changing the font changes the fontName, nothing
                 //          else and as here, the actual contents of the
                 //          font (axis names and defaults etc.) are
                 //          required information.
                 , 'fontName'
                ]
      , "WATERFALL": [...PROOF_STATE_DEPENDENCIES.WATERFALL
                , 'typographyContainer', 'alignmentColorContainer'
                , 'fontSizeFromContainer', 'fontSizeToContainer'
                // same as TYPESPEC comment right before
                 , 'fontName', 'colors'
                ]
      , "VARTOOLS_GRID": [...PROOF_STATE_DEPENDENCIES.VARTOOLS_GRID
                , 'typographyContainer', 'alignmentColorContainer'
                // same as TYPESPEC comment right before
                 , 'fontName', 'colors', 'fontSizeGridContainer'
        ]
    }
  , NOT_IMPEMENTED_FOR_SERIALIZATION = ['manualAxisLocations', 'multipleTargets', 'typeSpecTemplate',
                'fontLeading', 'colors', 'variationSettingsFlags'
                , 'gridDimensionControls']
    ;

const GENERAL_VIDEOPROOF_STATE_STRUCTURE = [
    // 0. Comment time and date.
    // 1. Version of font (we use array of srings [fontName, version])
    // 2. Designspace location (we custom order by axes tags in here, array of [str axisTag, Number(parseFLoat) axisLocation])
    // 3. Proof format (sub format depending on the proof widget)
    // 4. str Comment
    // 5. serialize the browser select API state Custom string highlight
    //    maybe this must also live in the Proof format, if it's special how
    //    to select within the proof.
        //           date => str     str => date
        ['dateTime', _serializeDate, _deserializeDate]
      , ['fontParticles', _serializeListOfStr, _deserializeListOfStr]
      , ['axisLocations', _serializeAxisLocations, _deserializeAxisLocations]
      , ['proofFormatTag', encodeURIComponent, _decodeURIComponent]
      , ['comment',  encodeURIComponent, _decodeURIComponent]
      , ['colors', _serializeRGBColors, _deserializeRGBColors]
        // Not implemented
                    // mergedPathsRanges => str    str => pathsRanges
      , ['highlightSelection', serializePathRanges, deserializePathRanges]
    ]
  ;


    /** the serialize functions get as second argument a function:
     * addExtended(type, value) => pointer (i.e. index into the extended array)
     * and similarly, the the deserialize function is called with a second
     * argument getExtended(type, pointer)
     * Extended structures are separated by the ampersand '&' hence that
     * must not be be part of the returned string.
     */
    // , _EXTENDED: {
    //   }


