/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */

mergeInto(LibraryManager.library, {
    // some of these rely on functions in lerp_post_lib.js

    ptrk_request_animation_frame: function() {
        Module.injectedState.requestAnimationFrame();
    },

    ptrk_canvas_setLinearGradient: function(ctxID, ptsptr, colorsptr, posptr, ncolors, isStroke) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        const pts = new Float32Array(Module.HEAPF32.buffer, ptsptr, 4);
        const clr = new Uint32Array( Module.HEAPU32.buffer, colorsptr, ncolors);
        const pos = new Float32Array(Module.HEAPF32.buffer, posptr, ncolors);

        const grad = ctx.createLinearGradient(pts[0], pts[1], pts[2], pts[3]);
        for (let i = 0; i < ncolors; ++i) {
            grad.addColorStop(pos[i], ptrk_util_color32_to_string(clr[i]));
        }

        if (isStroke != 0) {
            ctx.strokeStyle = grad;
        } else {
            ctx.fillStyle = grad;
        }
    },

    ptrk_canvas_setRadialGradient: function(ctxID, cx, cy, radius, colorsptr, posptr, ncolors, isStroke) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        const clr = new Uint32Array( Module.HEAPU32.buffer, colorsptr, ncolors);
        const pos = new Float32Array(Module.HEAPF32.buffer, posptr, ncolors);

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        for (let i = 0; i < ncolors; ++i) {
            grad.addColorStop(pos[i], ptrk_util_color32_to_string(clr[i]));
        }

        if (isStroke != 0) {
            ctx.strokeStyle = grad;
        } else {
            ctx.fillStyle = grad;
        }
    },

    ptrk_canvas_setColor: function(ctxID, c32, isStroke) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        const c = ptrk_util_color32_to_string(c32);

        if (isStroke != 0) {
            ctx.strokeStyle = c;
        } else {
            ctx.fillStyle = c;
        }
    },
    ptrk_canvas_setStrokeWidth: function(ctxID, width) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        ctx.lineWidth = width;
    },

    ptrk_canvas_onSave: function(ctxID) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        ctx.save();
    },
    ptrk_canvas_onRestore: function(ctxID) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        ctx.restore();
    },
    ptrk_canvas_onConcat: function(ctxID, a, b, c, d, e, f) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        ctx.transform(a, b, c, d, e, f);
    },
    ptrk_canvas_onClipPath: function(ctxID, ptsptr, npts, vbsptr, nvbs, fillType) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        const path = ptrk_path_make(ptsptr, npts, vbsptr, nvbs);
        const rule = ptrk_path_fill_rule(fillType);

        ctx.clip(path, rule);
    },
    ptrk_canvas_onDrawRect: function(ctxID, l, t, r, b, isStroke) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        if (isStroke != 0) {
            ctx.strokeRect(l, t, r, b);
        } else {
            ctx.fillRect(l, t, r, b);
        }
    },
    ptrk_canvas_onDrawPath: function(ctxID, ptsptr, npts, vbsptr, nvbs, fillType, isStroke) {
        const ctx = Module.injectedState.ptrk_get_object_from_id(ctxID);
        const path = ptrk_path_make(ptsptr, npts, vbsptr, nvbs);
        const rule = ptrk_path_fill_rule(fillType);

        if (isStroke != 0) {
            ctx.stroke(path, rule);
        } else {
            ctx.fill(path, rule);
        }
    },
});
