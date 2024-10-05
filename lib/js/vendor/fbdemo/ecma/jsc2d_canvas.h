/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_js_c2d_canvas_h_
#define _pentrek_js_c2d_canvas_h_

#include "ecma/js_c2d.h"
#include "ports/canvas2d_canvas.h"

namespace pentrek {

struct Color;
class Matrix;
class Path;
struct Rect;

class JSC2DCanvas : public Canvas2DCanvas {
    using INHERITED = Canvas2DCanvas;
    
    C2DContextID m_c2d;

public:
    JSC2DCanvas(C2DContextID ref) : m_c2d(ref) {}
    
protected:
    void onUpdateShader(const Shader&, bool isStroke) override;
    void onUpdateColor(const Color&, bool isStroke) override;
    void onUpdateStroke(float width) override;

    void onSave() override;
    void onRestore() override;
    void onConcat(const Matrix&) override;
    void onClipPath(const Path&) override;
    void onDrawRect(const Rect&, const Paint&) override;
    void onDrawPath(const Path&, const Paint&) override;
};

} // namespace

#endif
