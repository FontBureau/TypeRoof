/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_color_h_
#define _pentrek_color_h_

#include "include/math.h"
#include "include/span.h"

namespace pentrek {

using Color32 = uint32_t;

static inline uint8_t Color32A(Color32 c) { return (c >> 24) & 0xFF; }
static inline uint8_t Color32R(Color32 c) { return (c >> 16) & 0xFF; }
static inline uint8_t Color32G(Color32 c) { return (c >>  8) & 0xFF; }
static inline uint8_t Color32B(Color32 c) { return (c >>  0) & 0xFF; }

static inline Color32 Color32_ARGB(unsigned a, unsigned r, unsigned g, unsigned b) {
    assert(a <= 0xFF);
    assert(r <= 0xFF);
    assert(g <= 0xFF);
    assert(b <= 0xFF);
    return (a << 24) | (r << 16) | (g << 8) | b;
}

struct Color {
    float r, g, b, a;
    
    bool operator==(const Color& o) const {
        return r == o.r && g == o.g && b == o.b && a == o.a;
    }
    bool operator!=(const Color& o) const { return !(*this == o); }
    
    static Color FromColor32(Color32 c);
    
    Color32 color32() const;
    
    PENTREK_WARN_UNUSED_RESULT Color withAlpha(float newA) const {
        return {r, g, b, pin_to_unit(newA)};
    }
    
    Span<float> floats() { return {&r, 4}; }
    Span<const float> floats() const { return {&r, 4}; }
    
    Color pinToUnit() const {
        return {pin_to_unit(r), pin_to_unit(g), pin_to_unit(b), pin_to_unit(a)};
    }
};

static inline Color operator+(const Color& a, const Color& b) {
    return {
        a.r + b.r, a.g + b.g, a.b + b.b, a.a + b.a,
    };
}

static inline Color operator-(const Color& a, const Color& b) {
    return {
        a.r - b.r, a.g - b.g, a.b - b.b, a.a - b.a,
    };
}

static inline Color operator*(const Color& a, float s) {
    return {a.r * s, a.g * s, a.b * s, a.a * s};
}

static inline Color operator*(float s, const Color& a) { return a * s; }


constexpr Color Color_black   = {0,0,0,1};
constexpr Color Color_gray    = {0.5f,0.5f,0.5f,1};
constexpr Color Color_white   = {1,1,1,1};
constexpr Color Color_red     = {1,0,0,1};
constexpr Color Color_green   = {0,1,0,1};
constexpr Color Color_blue    = {0,0,1,1};
constexpr Color Color_cyan    = {0,1,1,1};
constexpr Color Color_magenta = {1,0,1,1};
constexpr Color Color_yellow  = {1,1,0,1};

} // namespace

#endif
