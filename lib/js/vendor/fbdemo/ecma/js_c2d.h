/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_js_c2d_h_
#define _pentrek_js_c2d_h_

#include "include/color.h"
#include "include/path.h"

using namespace pentrek;

struct C2DContextPrivate;
using C2DContextID = uintptr_t;

extern "C" {
    extern void ptrk_request_animation_frame(/* some context? */);

    extern void ptrk_canvas_setLinearGradient(C2DContextID,
                                              const Point[/* 2 */],
                                              const Color32[], const float pos[],
                                              int count, bool isStroke);
    extern void ptrk_canvas_setRadialGradient(C2DContextID,
                                              float cx, float cy, float radius,
                                              const Color32[], const float pos[],
                                              int count, bool isStroke);
    extern void ptrk_canvas_setColor(C2DContextID, Color32, bool isStroke);
    extern void ptrk_canvas_setStrokeWidth(C2DContextID, float width);

    extern void ptrk_canvas_onSave(C2DContextID);
    extern void ptrk_canvas_onRestore(C2DContextID);
    extern void ptrk_canvas_onConcat(C2DContextID,
                                     float, float, float, float, float, float);
    extern void ptrk_canvas_onClipPath(C2DContextID,
                                       const Point[], int npts,
                                       const PathVerb[], int nvbs,
                                       PathFillType);
    extern void ptrk_canvas_onDrawRect(C2DContextID,
                                       float x, float y, float w, float h, bool isStroke);
    extern void ptrk_canvas_onDrawPath(C2DContextID,
                                       const Point[], int npts,
                                       const PathVerb[], int nvbs,
                                       PathFillType, bool isStroke);
}

#endif
