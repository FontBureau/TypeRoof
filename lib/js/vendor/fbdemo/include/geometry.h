/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_geometry_h_
#define _pentrek_geometry_h_

#include "include/math.h"
#include "include/matrix.h"

namespace pentrek {

template <typename T> T twice(T a) { return a + a; }

struct QuadCoeff {
    Point A, B, C;  // At^2 + Bt + C
    
    Point eval(float t) const {
        return (A*t + B)*t + C;
    }
    
    Point evalTan(float t) const {
        return (twice(A*t) + B).normalize();
    }
    
    static QuadCoeff Compute(Point a, Point b, Point c) {
        return {
            c - twice(b) + a,
            twice(b - a),
            a
        };
    }
    static QuadCoeff Compute(const Point p[3]) {
        return Compute(p[0], p[1], p[2]);
    }
};

struct CubicCoeff {
    Point A, B, C, D;  // At^3 + Bt^2 + Ct + D
    
    Point eval(float t) const {
        return ((A*t + B)*t + C)*t + D;
    }
    
    Point evalTan(float t) const {
        // 3At^2 + 2Bt + C
        return (3*A*t + 2*B)*t + C;
    }
    
    static CubicCoeff Compute(Point a, Point b, Point c, Point d) {
        return {
            d - 3*(c - b) - a,
            3*(c - twice(b) + a),
            3*(b - a),
            a
        };
    }
    static CubicCoeff Compute(const Point p[4]) {
        return Compute(p[0], p[1], p[2], p[3]);
    }
};

// see https://spencermortensen.com/articles/bezier-circle/
constexpr float kBezierCircleCoeff = 0.5519150244935105707435627f;

// Return the number of line segments needed to approximate this
// curve with line segments, to within the specified tolerance.
// ... really we take 1/tolerance
//
// The larger the tolerance, fewer line segments will be needed,
// however, we take 1/tolerance, so the large that value is, the
// more segments we will need.
//
int count_quad_segments(Point, Point, Point, float invTolerance);
int count_cubic_segments(Point, Point, Point, Point, float invTolerance);

std::pair<Point, Point> line_postan(const Point pts[], float t);
std::pair<Point, Point> quad_postan(const Point pts[], float t);
std::pair<Point, Point> cubic_postan(const Point pts[], float t);

void line_chop(const Point src[2], float t, Point dst[3]);
void quad_chop(const Point src[3], float t, Point dst[5]);
void cubic_chop(const Point src[4], float t, Point dst[7]);

void line_extract(const Point src[2], float t0, float t1, Point dst[2]);
void quad_extract(const Point src[3], float t0, float t1, Point dst[3]);
void cubic_extract(const Point src[4], float t0, float t1, Point dst[4]);

} // namespace

#endif
