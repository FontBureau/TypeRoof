/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_paint_h_
#define _pentrek_paint_h_

#include "include/color.h"
#include "include/shader.h"

namespace pentrek {

class Paint {
    rcp<Shader> m_shader;
    Color fColor{0, 0, 0, 1};
    float fWidth = 1;
    uint32_t fFlags = 0;
    
    enum Flags {
        kStroke = 1 << 0,
    };
    
public:
    Paint() = default;
    Paint(const Paint&) = default;
    Paint(const Color& c) : fColor(c) {}
    
    bool isStroke() const { return (fFlags & kStroke) != 0; }
    bool isFill() const { return !this->isStroke(); }
    
    Color color() const { return fColor; }
    Color32 color32() const { return fColor.color32(); }
    float width() const { return fWidth; }
    
    void stroke(bool isStroke) {
        if (isStroke) {
            fFlags |= kStroke;
        } else {
            fFlags &= ~kStroke;
        }
    }
    void fill(bool isFill) { this->stroke(!isFill); }
    
    void color(const Color& c) { fColor = c; }
    void color(float r, float g, float b, float a = 1) {
        this->color({r, g, b, a});
    }
    void width(float w) { assert(w > 0); fWidth = w; }
    
    Shader* shader() const { return m_shader.get(); }
    rcp<Shader> refShader() const { return m_shader; }
    void shader(rcp<Shader> sh) { m_shader = sh; }
};

} // namespace

#endif
