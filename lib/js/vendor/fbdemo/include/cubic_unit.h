/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_cubic_unit_h_
#define _pentrek_cubic_unit_h_

#include "include/point.h"
#include "include/span.h"

namespace pentrek {

class CubicUnit {
    enum Type {
        linear,
        complex,
    };

    double da, db, dc;
    Point m_pts[2];
    Point A, B, C;  // At^3 + Bt^2 + Ct = (x,y)
    Type m_type;

    static const Point gDefaultPts[2];

    // nearly 1/3, 2/3, but with clean denominators so no repreating digits
    static constexpr float kSortOf1over3 = 21845 / 65536.0f;
    static constexpr float kSortOf2over3 = 43691 / 65536.0f;

public:
    CubicUnit(Point b, Point c);
    CubicUnit(Span<const Point> pair) : CubicUnit(pair[0], pair[1]) {}
    CubicUnit() : CubicUnit(gDefaultPts[0], gDefaultPts[1]) {}

    Span<const Point> pts() const { return m_pts; }

    float x_to_y(float x) const;

    static Span<const Point> DefaultPts() { return gDefaultPts; }

    static bool NearlyLinear(Point a, Point b);

    static void Tests();
};

} // namespace

#endif
