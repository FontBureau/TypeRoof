/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_canvas2d_canvas_h_
#define _pentrek_canvas2d_canvas_h_

#include "include/canvas.h"
#include "include/color.h"
#include <stack>

namespace pentrek {

class Canvas2DCanvas : public Canvas {
    struct Style {
        rcp<Shader> m_shader;
        Color m_color = {0,0,0,1};
    };
    struct State {
        Style m_fill,
              m_stroke;
        float m_strokeWidth = 1;
    };
    std::stack<State> m_stack;
    
    void updateStyle(Style& s, Shader* sh, const Color& c, bool isStroke) {
        auto safe_unique_id = [](const Shader* sh) {
            return sh ? sh->uniqueID() : 0;
        };
        
        if (sh) {
            if (sh->uniqueID() != safe_unique_id(s.m_shader.get())) {
                this->onUpdateShader(*sh, isStroke);
                s.m_shader = ref_rcp(sh);
            }
        } else {
            // the current draw is just a color
            if (s.m_shader || s.m_color != c) {
                this->onUpdateColor(c, isStroke);
                s.m_color = c;
                s.m_shader = nullptr;
            }
        }
    }
    
public:
    Canvas2DCanvas() {
        m_stack.push(State());
    }
    
    void updatePaint(const Paint& p) {
        auto& top = m_stack.top();
        const auto& c = p.color();
        auto sh = p.shader();

        if (p.isStroke()) {
            this->updateStyle(top.m_stroke, sh, c, true);

            auto width = p.width();
            if (top.m_strokeWidth != width) {
                this->onUpdateStroke(width);
                top.m_strokeWidth = width;
            }
        } else {
            this->updateStyle(top.m_fill, sh, c, false);
        }
    }

protected:
    virtual void onUpdateShader(const Shader&, bool isStroke) = 0;
    virtual void onUpdateColor(const Color&, bool isStroke) = 0;
    virtual void onUpdateStroke(float width) = 0;

    void onSave() override {
        m_stack.push(m_stack.top());
    }
    void onRestore() override {
        m_stack.pop();
    }
};

} // namespace

#endif
