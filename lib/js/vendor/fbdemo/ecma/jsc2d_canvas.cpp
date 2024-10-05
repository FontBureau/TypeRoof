/*
 *  Copyright Pentrek Inc, 2022
 */

#include "ecma/jsc2d_canvas.h"
#include "include/color.h"
#include "include/data.h"
#include "include/matrix.h"
#include "include/path.h"
#include "include/rect.h"

#include <stdio.h>

using namespace pentrek;

struct GradientArrays {
    std::vector<uint32_t> m_storage;
    const Color32* m_colors;
    const float* m_pos;
    
    GradientArrays(Span<const Color> colors, const float pos[]) {
        assert(sizeof(float) == sizeof(Color32));
        const size_t N = colors.size();

        m_storage.resize(N * 2);
        Color32* c = m_storage.data();
        float* p = (float*)(c + N);
        
        for (size_t i = 0; i < N; ++i) {
            c[i] = colors[i].color32();
        }
        if (pos) {
            std::copy(pos, pos + N, p);
        } else {
            assert(N > 1);
            p[0] = 0;
            const float dt = 1.0f / (N - 1);
            float t = dt;
            for (size_t i = 1; i < N - 1; ++i) {
                p[i] = t;
                t += dt;
            }
            p[N-1] = 1;
        }
        m_colors = c;
        m_pos = p;
    }
};

void JSC2DCanvas::onUpdateShader(const Shader& sh, bool isStroke) {
    switch (sh.type()) {
        case Shader::Type::kColor: {
            Color c;
            sh.asColor(&c);
            this->onUpdateColor(c, isStroke);
        } break;
        case Shader::Type::kLinearGradient: {
            Shader::LinearGradientInfo info;
            sh.asLinearGradient(&info);
            GradientArrays arrays(info.m_colors, info.m_pos);
            ptrk_canvas_setLinearGradient(m_c2d,
                                          info.m_points, arrays.m_colors, arrays.m_pos,
                                          info.m_colors.size(), isStroke);
        } break;
        case Shader::Type::kRadialGradient: {
            Shader::RadialGradientInfo info;
            sh.asRadialGradient(&info);
            GradientArrays arrays(info.m_colors, info.m_pos);
            ptrk_canvas_setRadialGradient(m_c2d,
                                          info.m_center.x, info.m_center.y, info.m_radius,
                                          arrays.m_colors, arrays.m_pos, info.m_colors.size(),
                                          isStroke);
        } break;
        default:
            printf("Unexpected shader type %d\n", sh.type());
            assert(false);
            break;
    }
}

void JSC2DCanvas::onUpdateColor(const Color& color, bool isStroke) {
    ptrk_canvas_setColor(m_c2d, color.color32(), isStroke);
}

void JSC2DCanvas::onUpdateStroke(float width) {
    ptrk_canvas_setStrokeWidth(m_c2d, width);
}

void JSC2DCanvas::onSave() {
    ptrk_canvas_onSave(m_c2d);
    this->INHERITED::onSave();
}

void JSC2DCanvas::onRestore() {
    this->INHERITED::onRestore();
    ptrk_canvas_onRestore(m_c2d);
}

void JSC2DCanvas::onConcat(const Matrix& m) {
    ptrk_canvas_onConcat(m_c2d,
                         m[0], m[1], m[2], m[3], m[4], m[5]);
}

void JSC2DCanvas::onClipPath(const Path& path) {
    auto pts = path.points();
    auto vbs = path.verbs();
    ptrk_canvas_onClipPath(m_c2d,
                           pts.data(), pts.size(),
                           vbs.data(), vbs.size(),
                           path.fillType());
}

void JSC2DCanvas::onDrawRect(const Rect& r, const Paint& p) {
    this->updatePaint(p);
    ptrk_canvas_onDrawRect(m_c2d,
                           r.left, r.top, r.width(), r.height(), p.isStroke());
}

void JSC2DCanvas::onDrawPath(const Path& path, const Paint& p) {
    this->updatePaint(p);

    auto pts = path.points();
    auto vbs = path.verbs();
    ptrk_canvas_onDrawPath(m_c2d,
                           pts.data(), pts.size(),
                           vbs.data(), vbs.size(),
                           path.fillType(), p.isStroke());
}
