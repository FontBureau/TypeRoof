/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_rect_h_
#define _pentrek_rect_h_

#include "include/point.h"
#include "include/size.h"
#include "include/span.h"

namespace pentrek {

struct IRect {
    int32_t left, top, right, bottom;
    
    int32_t x() const { return left; }
    int32_t y() const { return top; }
    int32_t width() const { return right - left; }
    int32_t height() const { return bottom - top; }
    
    IRect offset(int32_t dx, int32_t dy) const {
        return {left + dx, top + dy, right + dx, bottom + dy};
    }
    IRect inset(int32_t dx, int32_t dy) const {
        return {left + dx, top + dy, right - dx, bottom - dy};
    }
    
    static IRect Join(const IRect& a, const IRect& b) {
        return {
            std::min(a.left,   b.left),
            std::min(a.top,    b.top),
            std::max(a.right,  b.right),
            std::max(a.bottom, b.bottom),
        };
    }
    IRect join(const IRect& o) const { return Join(*this, o); }
    
    static IRect FromSize(ISize s) { return {0, 0, s.width, s.height}; }
    static IRect WH(int32_t w, int32_t h) {
        return {0, 0, w, h};
    }
    static IRect XYWH(int32_t x, int32_t y, int32_t w, int32_t h) {
        return {x, y, x + w, y + h};
    }
};

struct Rect {
    float left, top, right, bottom;

    bool operator==(const Rect& o) const {
        return left == o.left && top == o.top && right == o.right && bottom == o.bottom;
    }
    bool operator!=(const Rect& o) const { return !(*this == o); }

    Span<float> floats() { return {&left, 4}; }
    Span<const float> floats() const { return {&left, 4}; }

    Rect& operator=(const IRect& r) {
        left = (float)r.left;
        top = (float)r.top;
        right = (float)r.right;
        bottom = (float)r.bottom;
        return *this;
    }
    
    float x() const { return left; }
    float y() const { return top; }
    float width() const { return right - left; }
    float height() const { return bottom - top; }

    Point center() const {
        return { (left + right) * 0.5f, (top + bottom) * 0.5f };
    }

    bool isEmpty() const { return left >= right || top >= bottom; }

    Point TL() const { return {left, top}; }
    Point TR() const { return {right, top}; }
    Point BR() const { return {right, bottom}; }
    Point BL() const { return {left, bottom}; }
    
    Size size() const { return {this->width(), this->height()}; }

    PENTREK_WARN_UNUSED_RESULT Rect offset(float dx, float dy) const {
        return {left + dx, top + dy, right + dx, bottom + dy};
    }
    PENTREK_WARN_UNUSED_RESULT Rect offset(Point d) const { return this->offset(d.x, d.y); }
    PENTREK_WARN_UNUSED_RESULT Rect inset(float dx, float dy) const {
        return {left + dx, top + dy, right - dx, bottom - dy};
    }
    
    PENTREK_WARN_UNUSED_RESULT IRect round() const;
    PENTREK_WARN_UNUSED_RESULT IRect roundOut() const;

    bool contains(float x, float y) const {
        return left <= x && x < right &&
               top  <= y && y < bottom;
    }
    bool contains(Point p) const { return this->contains(p.x, p.y); }

    static Rect Join(const Rect& a, const Rect& b) {
        return {
            std::min(a.left,   b.left),
            std::min(a.top,    b.top),
            std::max(a.right,  b.right),
            std::max(a.bottom, b.bottom),
        };
    }
    PENTREK_WARN_UNUSED_RESULT Rect join(const Rect& o) const { return Join(*this, o); }

    void toQuad(Point p[4]) const;  // LT RT RB LB

    static Rect Empty() { return {0, 0, 0, 0}; }

    static Rect WH(float w, float h) {
        return {0, 0, w, h};
    }
    static Rect WH(Size s) { return {0, 0, s.width, s.height}; }

    static Rect LTRB(float l, float t, float r, float b) {
        return {l, t, r, b};
    }

    static Rect XYWH(float x, float y, float w, float h) {
        return {x, y, x + w, y + h};
    }
    static Rect XYWH(Point pos, Size size) {
        return {pos.x, pos.y, pos.x + size.width, pos.y + size.height};
    }
    
    static Rect Bounds(Point a, Point b) {
        Point tmp[2] = {a, b};
        return Bounds(tmp);
    }
    static Rect Bounds(Span<const Point>);
};

} // namespace

#endif
