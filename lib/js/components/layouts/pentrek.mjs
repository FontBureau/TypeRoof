/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...


import {
    default as ModuleBaseFn
} from '../../vendor/fbdemo/docs/lerp.mjs';



import {
    _BaseLayoutModel
} from '../main-model.mjs';

import {
    _BaseComponent
  , _BaseContainerComponent
} from '../basics.mjs';


// Placeholder
const PentrekLayoutModel = _BaseLayoutModel.createClass(
    'PentrekLayoutModel'
);


/// array utilities

function ptrk_copy_to_typed_array_f32(array) {
    const ta = new Float32Array(array.length);
    for (let i = 0; i < array.length; ++i) {
        ta[i] = array[i];   // converts each elem to float32
    }
    return ta;
}

function ptrk_copy_to_typed_array_u32(array) {
    const ta = new Uint32Array(array.length);
    for (let i = 0; i < array.length; ++i) {
        ta[i] = array[i];   // converts each elem to uint32_t
    }
    return ta;
}

function tag2num(str) {
    // need to turn a 4-char string into a 32bit int
    let num = 0;
    for (let i = 0; i < 4; ++i) {
        num *= 256;
        num += str.charCodeAt(i);
    }
    return num;
}

function restrict_to_public_axes(orig_axes) {
    const N = orig_axes.length;
    const axes = [];
    for (let i = 0; i < N; ++i) {
        if (all_lower_case(orig_axes[i].tag)) {
            axes.push(orig_axes[i]);
        }
    }
    return axes;
}

function str_trim(str, tail) {
    const index = str.lastIndexOf(tail);
    if (index > 0) {
        str = str.substring(0, index);
    }
    return str;
}

function all_lower_case(str) {
    const islc = (str === str.toLowerCase());
//    console.log(str, str.toLowerCase(), islc);
    return islc;
}

function hexstr_to_rgb(hex) {
    return [
        parseInt(hex.substring(1, 3), 16) / 255.0,
        parseInt(hex.substring(3, 5), 16) / 255.0,
        parseInt(hex.substring(5, 7), 16) / 255.0
    ];
}

function remove_all(elem, tagname) {
    let array = elem.getElementsByTagName(tagname);
    while (array.length > 0) {
        array[0].remove();
    }
}

// requires Module as arument


function compute_hyper_cube_keyframes(Module, axes, only_public_axes) {
    if (only_public_axes) {
        axes = restrict_to_public_axes(axes);
    }

    const N = axes.length;
    if (N == 0) {
        return;
    }

    const frameCount = 1 << N;
    const duration = Math.sqrt(frameCount);
    const dtime = duration / (frameCount - 1);

    console.log('Hyper coords:', N, frameCount, duration, dtime);

    Module.dispatch_clear_keyframes(duration);

    const tags = new Array(N);
    for (let i = 0; i < N; ++i) {
        tags[i] = axes[i].tag;
    }

    let time = 0;
    const values = new Array(N);
    for (let i = 0; i < frameCount; ++i) {    // only works with up to 31 axes
        for (let j = 0; j < N; ++j) {
            values[j] = (i & (1 << j)) ? axes[j].max : axes[j].min;
        }
        set_keyframe(Module, time, tags, values);
        time += dtime;
    }
}

function set_sample_text(Module, str) {
    const wasmPtr = ptrk_string_to_utf8_wasm(Module, str);
    Module.dispatch_set_sample_text(wasmPtr);
    Module._free(wasmPtr);
}

// requires Module as global


/// string utilities

// Input: javascript string
// Output: wasmptr (malloc) null-terminated utf8 buffer
//         caller must free the wasmptr (free)
function ptrk_string_to_utf8_wasm(Module, str) {
    const N = str.length;       // number of code-points, not bytes
    const maxBytes = N * 4 + 1; // max utf8 expansion + null_terminator
    const wasm = Module._malloc(maxBytes);
    // FIXME: seems like this is at Module.stringToUTF8
    Module.stringToUTF8(str, wasm, maxBytes);
    return wasm;
}

// Input: wasmptr (malloc) null-terminated utf8 buffer
//        will be deleted (free) by this function
// Outpu: javascript string
function ptrk_wasm_utf8_to_string(Module, wasmPtr) {
    // FIXME: seems like this is at Module.UTF8ToString
    const str = Module.UTF8ToString(wasmPtr);  // null-terminated
    Module._free(wasmPtr);
    return str;
}

function ptrk_copy_to_wasm_f32(Module, array) {
    const arr = ptrk_copy_to_typed_array_f32(array);
    const wasmPtr = Module._malloc(arr.length * 4); // sizeof(float)
    Module.HEAPF32.set(arr, wasmPtr >> 2);          // need float* alignment
    return wasmPtr;
}

function ptrk_copy_to_wasm_u32(Module, array) {
    const arr = ptrk_copy_to_typed_array_u32(array);
    const wasmPtr = Module._malloc(arr.length * 4); // sizeof(uint32_t)
    Module.HEAPU32.set(arr, wasmPtr >> 2);          // need uint32_t* alignment
    return wasmPtr;
}

function set_keyframe(Module, time, tagNames, values) {
    // `assert` cannot be exported via Module (Module.assert);
    // assert(tagNames.length == values.length);
    if(tagNames.length !== values.length)
        // assert can run an abort function etc. so it may be imortant
        throw new Error(`ASSERTION FAILED tagNames.length !== values.length and assert is not exported...`);

    const tags = [];    // need the tags as uint32_t numbers
    for (let i = 0; i < tagNames.length; ++i) {
        tags.push(tag2num(tagNames[i]));
    }

    const N = tags.length;
    const wasmTags = ptrk_copy_to_wasm_u32(Module, tags);
    const wasmVals = ptrk_copy_to_wasm_f32(Module, values);

    Module.dispatch_set_keyframe(time, wasmTags, wasmVals, N);
    Module._free(wasmTags);
    Module._free(wasmVals);
}


// FIXME: seems overcomplicated, but maybe all of the module must be
//       re-initialized this way when we rebuild it. Also means, this
//       can't be part of the actual module and should be in the layout
//       initialization, making that async. Should not be required at all.
// It definitely looks like we need to run this each time we load the layout
// so far, not sure if this is special to the way emscripten handles wasm.
// What I dislike, is that it requires some part in initializing the layout
// to become async ... but I think it can be handled...
//
// making module-globals know. not a fan though...
const _G_PTRK_OBJECT_LIST = Symbol('_G_PTRK_OBJECT_LIST')
  , _G_PTRK_OBJECT_ID = Symbol('G_PTRK_OBJECT_ID')
  ;

class PentrekExampleUI extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<div>
    <label>
        <input type="checkbox" class="only_public_axes" checked />
        Only Public Axes
    </label>

    <div class="controls">
        <input type="range"/> <!-- ?? -->
    </div>

    <div>
        <canvas width='800' height='600' />
    </div>

    <button class="play_pause">Play</button>

    <input type="color" class="color_picker" />

    <label>
        <input type="checkbox"  class="show_outlines" />
        Points
    </label>

    <input type="text" class="sample_text" placeholder="Sample Text" />

    <label>
        <input type="range" class="set-text-size" min='36' max='450' value='100' />
        Size
    </label>

    <label>
        <input type="range" class="set-anim-speed" min='-4' max='4' value='0' step='any' />
        Speed
    </label>
<div>`;
    //jshint ignore:end
    constructor(widgetBus) {
        super(widgetBus);
        this._deferredUpdates = null;
        this._animationFrameRequestId = null;
        [this.element, this._canvas, this._controls, this._onlyPublicAxesInput, this._button] = this.initTemplate();
        // similar to old onRuntimeInitialized
        this.Module = null;
        ModuleBaseFn({injectedState: {
            [_G_PTRK_OBJECT_LIST]: {}
          , [_G_PTRK_OBJECT_ID]: 0
          , ptrk_add_object_to_list(obj) {
                this[_G_PTRK_OBJECT_ID] += 1;
                const objID = this[_G_PTRK_OBJECT_ID];
                this[_G_PTRK_OBJECT_LIST][objID] = obj;
                return objID;
            }
            // These injected methods will replace globally accessible state however.
          , ptrk_get_object_from_id(objID) {
                if(!Object.hasOwn(this[_G_PTRK_OBJECT_LIST], objID))
                    throw new Error('KEY ERROR not found objID ${objID}.');
                return this[_G_PTRK_OBJECT_LIST][objID];
            }
          , ptrk_remove_object_id_from_list(objID) {
                delete this[_G_PTRK_OBJECT_LIST][objID];
            }
          , _clear_and_draw: this._clear_and_draw.bind(this)
          , requestAnimationFrame: ()=>{
                // FIXME: also remove window explicit global reference ...
                this._animationFrameRequestId = this._domTool.window.requestAnimationFrame((timestamp) => {
                    this._clear_and_draw(timestamp);
                });
                return this._animationFrameRequestId;
            }
        }}).then(
            this._onModuleLoaded.bind(this)
            // FIXME: can this be passed to the global shell handler?
          , error=>{
              console.error(error);
              throw error;
            }
        );

        this._eventListeners = [];
        this._rect = this._canvas.getBoundingClientRect();
        this._ctx = this._canvas.getContext("2d");
        this._ctxID = null;
        // this._recent_time = 0;
        // this._recent_counter = 0;
        this._previous_raf_timestamp = 0;
        // this._host seems unused
        // wasm "view"
        this._host = null;
        this.current_font_axes = [];
    }

    _registerEventListener(element, ...eventListener) {
        this._eventListeners.push([element, eventListener]);
        element.addEventListener(...eventListener);
    }
    destroy() {
        for(const [element, eventListener] of this._eventListeners)
            element.removeEventListener(...eventListener);
        this.Module.injectedState.ptrk_remove_object_id_from_list(this._ctxID);
        if(this._animationFrameRequestId !== null)
            this._domTool.window.cancelAnimationFrame(this._animationFrameRequestId);
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , canvas = element.querySelector('canvas')
          , controls = element.querySelector('.controls')
          , onlyPublicAxesInput = element.querySelector('.only_public_axes')
          , button = element.querySelector('.play_pause')
          ;

        this._insertElement(element);
        return [element, canvas, controls, onlyPublicAxesInput, button];
    }

    _initOnModule() {
        /*
            enum class MouseEventType {
                down,
                up,
                move,
                hover,
            };
        */
        this._canvas.addEventListener('mousedown', this._canvasMousedownHandler.bind(this));
        this._canvas.addEventListener('mouseup', this._canvasMouseupHandler.bind(this));
        this._canvas.addEventListener('mousemove', this._canvasMousemoveHandler.bind(this));
        // must be removed on destroy
        this._registerEventListener(this._domTool.document, 'keydown', this._keyDownHandler.bind(this));
        this._onlyPublicAxesInput.addEventListener('change', this._load_font_axes.bind(this));
        for(const [selector, event, handler] of [
                    ['.show_outlines', 'input', this._handle_show_outlines.bind(this)]
                  , ['.color_picker', 'input', this._handle_set_color.bind(this)]
                  , ['.sample_text', 'input', this._handle_set_sampletext.bind(this)]
                  , ['.set-text-size', 'input', this._handle_set_text_size.bind(this)]
                  , ['.set-anim-speed', 'input', this._handle_set_anim_speed.bind(this)]
            ]) {
            this.element.querySelector(selector).addEventListener(event, handler);
        }
        this._button.is_playing = false;
        this._button.addEventListener('click', () => {
            const button = this._button;
            button.is_playing = !button.is_playing;
            this.Module.dispatch_play_pause_animation(button.is_playing);
            button.textContent = button.is_playing ? 'Pause' : 'Play';
        });

        this.Module.injectedState._clear_and_draw = this._clear_and_draw.bind(this);

        this._ctxID = this.Module.injectedState.ptrk_add_object_to_list(this._ctx);
        this._host = this.Module.create_host(this._canvas.width, this._canvas.height);
        this._load_font_axes();
         // hard-code some keyframe settings
        set_sample_text(this.Module, 'Font Bureau');
        this._clear_and_draw();
    }

    _keyDownHandler(e) {
        this.Module.dispatch_key_down(e.code, e.key.charCodeAt(0),
                                e.shiftKey, e.ctrlKey, e.altKey, e.metaKey);
        this._clear_and_draw();
    }

    _canvasMousedownHandler (e) {
        this.Module.dispatch_mouse_event(e.clientX - this._rect.left, e.clientY - this._rect.top, 0);
        this._clear_and_draw();
    }

    _canvasMouseupHandler (e) {
        this.Module.dispatch_mouse_event(e.clientX - this._rect.left, e.clientY - this._rect.top, 1);
        this._clear_and_draw();
    }

    _canvasMousemoveHandler (e) {
        let n = e.buttons;
        this.Module.dispatch_mouse_event(e.clientX - this._rect.left, e.clientY - this._rect.top, n > 0 ? 2 : 3);
        this._clear_and_draw();
    }

    _handle_show_outlines (ev) {
        this.Module.dispatch_show_outlines(ev.target.checked);
    }
    _handle_set_color(ev) {
        const rgb = hexstr_to_rgb(ev.target.value);
        this.Module.dispatch_set_rgba(rgb[0], rgb[1], rgb[2], 1);
    }
    _handle_set_sampletext(ev) {
        set_sample_text(this.Module, ev.target.value);
    }
    _handle_set_text_size(ev) {
        this.Module.dispatch_set_text_size(parseFloat(ev.target.value));
    }
    _handle_set_anim_speed(ev) {
        const value = parseFloat(ev.target.value);
        let speed = 1;
        if (value > 0) {
            speed *= (1 + value);
        } else if (value < 0) {
            speed /= (1 - value);
        }
        this.Module.dispatch_set_anim_speed(speed * speed);
    }
    _handle_set_axis_value(ev) {
        console.log('set axis value', ev.target.value, ev.target._axisIndex);
    }

    _clear_and_draw(timestamp) {
        if (timestamp !== undefined) {
            const duration = timestamp - this._previous_raf_timestamp;
            if (duration === 0) {
                return;
            }
            this._previous_raf_timestamp = timestamp;
        //    console.log('fps', 1000.0 / duration);
        }

        this._ctx.clearRect(0, 0,  this._ctx.canvas.width,  this._ctx.canvas.height);
        // See comment at initial definition of this._ctxID
        this.Module.dispatch_draw(this._ctxID);
    }

    _rebuild_var_sliders(axes, only_public_axes) {
        const controls = this._controls
          , doc = controls.ownerDocument
          ;
        remove_all(controls, 'input');
        remove_all(controls, 'label');
        remove_all(controls, 'br');

        if (only_public_axes) {
            axes = restrict_to_public_axes(axes);
        }

        const N = axes.length;
        for (let i = 0; i < N; ++i) {
            const id_name = "axis_" + i;

            let l = doc.createElement("label");
            l.setAttribute("for", id_name);
            l.innerHTML = axes[i].tag;
            controls.appendChild(l);
            console.log(l);

            let e = doc.createElement("input");
            e.setAttribute('type', 'range');
            e.setAttribute('id', id_name);
            e.setAttribute('name', id_name);
            e.setAttribute('step', 'any');
            e.setAttribute('min', axes[i].min);
            e.setAttribute('max', axes[i].max);
            e.setAttribute('value', axes[i].def);
            e.setAttribute('disabled', true);
            e.addEventListener('input', this._handle_set_axis_value.bind(this));
            e._axisIndex = i;
            controls.appendChild(e);
            console.log(e);

            let br = doc.createElement("br");
            controls.appendChild(br);
        }
    }

    _query_only_public_axes() {
        return this._onlyPublicAxesInput.checked;
    }

    _load_font_axes() {
        const str = ptrk_wasm_utf8_to_string(this.Module, this.Module.dispatch_get_font_axes_json())
          , only_public = this._query_only_public_axes()
          , axesKey = 'axes'
          ;
        this.current_font_axes = JSON.parse(str)[axesKey];
        compute_hyper_cube_keyframes(this.Module,  this.current_font_axes, only_public);
        this._rebuild_var_sliders(this.current_font_axes, only_public);
    }

    // this loads the font into the module
    // used to be called: dump_file_contents
    _updateFont(name, buffer) {
        const numBytes = buffer.byteLength
          , wasmPtr = this.Module._malloc(numBytes)
            // not sure this is required at all
          , transferred = this._domTool.window.structuredClone(buffer)
          ;
        const byteArray = new Uint8Array(transferred);
        this.Module.HEAPU8.set(byteArray, wasmPtr);

        // pass true to transfer ownership of the wasm array
        this.Module.dispatch_set_font_data(wasmPtr, numBytes, true);
        // we don't call Module._free(wasmPtr) since we passed 'true'

        set_sample_text(this.Module, str_trim(name, ".ttf"));

        this._load_font_axes();
        this._clear_and_draw();
    }

    _deferUpdate(changedMap) {
        if(this._deferredUpdates === null)
            this._deferredUpdates = new Map();

        // There's a chance, that a component can't handle all the latest
        // updates at once, but expecting updates to arrive in a specific
        // order would be wrong, so, this should work generally, despite of
        // edge cases, like deleted keys, which are not yet part of the
        // data of this component and neither can be handled sing a simple
        // changeMap based update.
        for(const [k, v] of changedMap)
            this._deferredUpdates.set(k, v);
    }

    _onModuleLoaded(Module) {
        this.Module = Module;
        this._initOnModule();
        const chandedMap = this._deferredUpdates;
        this._deferredUpdates = null;
        this.update(chandedMap);
    }

    update (changedMap) {
        if(this.Module === null) {
            this._deferUpdate(changedMap);
            return;
        }
        if(changedMap.has('font')) {
            const font = changedMap.get('font').value;
            this._updateFont(font.fullName, font.buffer);
        }
    }
}

class PentrekLayoutController extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        const widgets = [
            [
                {zone: 'layout'}
              , [
                    ['../font', 'font']
                ]
              , PentrekExampleUI
            ]
        ];
        super(widgetBus, zones, widgets);
    }
}

export {
    PentrekLayoutModel as Model
  , PentrekLayoutController as Controller
};

