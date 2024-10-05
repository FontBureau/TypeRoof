/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_cg_canvas_h_
#define _pentrek_cg_canvas_h_

#include "include/canvas.h"

#if defined(PENTREK_BUILD_FOR_OSX)
    #include <ApplicationServices/ApplicationServices.h>
#elif defined(PENTREK_BUILD_FOR_IOS)
    #include <CoreFoundation/CoreFoundation.h>
#endif

namespace pentrek {

class CGCanvas : public Canvas {
    CGContextRef fCtx;

public:
    CGCanvas(CGContextRef ctx, float height);
    ~CGCanvas() override;

protected:
    void onSave() override;
    void onRestore() override;

    void onConcat(const Matrix&) override;
    void onClipRect(const Rect&) override;
    void onClipPath(const Path&) override;
    
    void onDrawRect(const Rect&, const Paint&) override;
    void onDrawPath(const Path&, const Paint&) override;
};

}
#endif
