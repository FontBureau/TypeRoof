/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_matrix_h_
#define _pentrek_matrix_h_

#include "include/point.h"
#include "include/rect.h"
#include "include/span.h"

namespace pentrek {

struct Matrix {
    float m[6];
    
    constexpr Matrix() : m{1, 0, 0, 1, 0, 0} {}
    constexpr Matrix(float a, float b, float c, float d, float e, float f) : m{a, b, c, d, e, f} {}
    constexpr Matrix(Point u, Point v, Point t) : m{u.x, u.y, v.x, v.y, t.x, t.y} {}
    Matrix(std::initializer_list<float> il) {
        assert(il.size() == 6);
        memcpy(m, il.begin(), sizeof(float) * 6);
    }
    Matrix(const Matrix&) = default;
    
    bool operator==(const Matrix& o) const {
        for (int i = 0; i < 6; ++i) {
            if (m[i] != o.m[i]) {
                return false;
            }
        }
        return true;
    }
    bool operator!=(const Matrix& o) const { return !(*this == o); }

    bool isIdentity() const;

    static const Matrix& I();
    static Matrix Trans(float x, float y) {
        return {1, 0, 0, 1, x, y};
    }
    static Matrix Scale(float x, float y) {
        return {x, 0, 0, y, 0, 0};
    }
    static Matrix Skew(float x, float y) {
        return {1, y, x, 1, 0, 0};
    }
    static Matrix Rotate(float radians);
    
    static Matrix Basis(Point e0) {
        return Matrix(e0, e0.cw(), {0, 0});
    }

    static Matrix Trans(Point p) { return Trans(p.x, p.y); }
    static Matrix Scale(Point p) { return Scale(p.x, p.y); }
    static Matrix Skew(Point p)  { return Skew(p.x, p.y);  }

    float operator[](unsigned i) const {
        assert(i < 6);
        return m[i];
    }
    float& operator[](unsigned i) {
        assert(i < 6);
        return m[i];
    }
    
    PENTREK_WARN_UNUSED_RESULT bool invert(Matrix* dst) const;
    Matrix invertOrIdentity() const;

    Matrix operator*(const Matrix& o) const {
        return {
            m[0] * o.m[0] + m[2] * o.m[1],
            m[1] * o.m[0] + m[3] * o.m[1],
            m[0] * o.m[2] + m[2] * o.m[3],
            m[1] * o.m[2] + m[3] * o.m[3],
            m[0] * o.m[4] + m[2] * o.m[5] + m[4],
            m[1] * o.m[4] + m[3] * o.m[5] + m[5],
        };
    }

    Point operator*(Point p) const {
        return {
            m[0] * p.x + m[2] * p.y + m[4],
            m[1] * p.x + m[3] * p.y + m[5],
        };
    }
    void map(Span<Point> dst, Span<const Point> src) const;
    void map(Span<Point> pts) const {
        this->map(pts, pts);
    }

    enum class FitStyle {
        fill,   // scale to fill
        start,  // square scale, align to left or top
        center, // square scale, align to center
        end,    // square scale, align right or bottom
    };
    static Matrix Fit(const Rect& src, const Rect& dst, FitStyle = FitStyle::fill);
};

} // namespace

#endif
