/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_shader_h_
#define _pentrek_shader_h_

#include "include/color.h"
#include "include/point.h"
#include "include/unique_id.h"
#include "include/span.h"

namespace pentrek {

class Shader : public UniqueIDRefCnt {
public:
    enum class Type {
        kColor,
        kLinearGradient,
        kRadialGradient,
    //    kImage,
    };
    
    Shader() {}
    
    static rcp<Shader> SingleColor(Color);
    static rcp<Shader> LinearGradient(Point p0, Point p1,
                                      Span<const Color>,
                                      const float pos[] = nullptr);
    static rcp<Shader> RadialGradient(Point center, float radius,
                                      Span<const Color>,
                                      const float pos[] = nullptr);
    
    virtual Type type() const = 0;
    
    struct GradientInfo {
        Span<const Color> m_colors;
        const float* m_pos;
    };
    struct LinearGradientInfo : GradientInfo {
        Point m_points[2];
    };
    struct RadialGradientInfo : GradientInfo {
        Point m_center;
        float m_radius;
    };
    
    bool asColor(Color*) const;
    bool asGradient(GradientInfo*) const;
    bool asLinearGradient(LinearGradientInfo*) const;
    bool asRadialGradient(RadialGradientInfo*) const;

    static void Tests();
};

} // namespace

#endif
