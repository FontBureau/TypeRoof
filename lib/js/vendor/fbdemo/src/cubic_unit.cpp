/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/cubic_unit.h"
#include "include/math.h"

using namespace pentrek;

const Point CubicUnit::gDefaultPts[2] = {
    { CubicUnit::kSortOf1over3, CubicUnit::kSortOf1over3 },
    { CubicUnit::kSortOf2over3, CubicUnit::kSortOf2over3 },
};

bool CubicUnit::NearlyLinear(Point a, Point b) {
    constexpr float tol = 1.0f / 64;

    return nearly_eq(a.x, a.y, tol) && nearly_eq(b.x, b.y, tol);
}

static float find_unit_cubic_root(float A, float B, float C, float D) {
    float roots[3];
    DEBUG_CODE(int n =) cubic_unit_roots(A, B, C, D, roots);
    assert(n == 1);
    return roots[0];
}

////////////////////

CubicUnit::CubicUnit(Point b, Point c) {
    m_pts[0] = b;
    m_pts[1] = c;

    // ensure our X values are in range
    b.x = pin_to_unit(b.x);
    c.x = pin_to_unit(c.x);
    
    // p(t) = a(1-t)^3 + 3bt(1-t)^2 + 3ct^2(1-t) + dt^3
    // for our unit square...
    //    a = {0, 0}
    //    d = {1, 1}
    // p(t) = 3bt(1-t)^2 + 3ct^2(1-t) + t^3
    //
    // rearranging to a normal polynomial At^3 + Bt^2 + Ct + D
    // A = 3b - 3c + 1
    // B = 3c - 6b
    // C = 3b
    // D = 0
    
    da = 3*b.y - 3*c.y + 1;
    db = 3*c.y - 6*b.y;
    dc = 3*b.y;
    
    auto b3 = 3 * b;
    auto c3 = 3 * c;
    A = b3 - c3 + Point{1, 1};
    B = c3 - b3 - b3;
    C = b3;
    
    if (NearlyLinear(b, c)) {
        m_type = Type::linear;
    } else {
        m_type = Type::complex;
    }
}

// slower than using CubicCoeff, but this one keeps us monotonic
// in unittests, and CubicCoeff did not...
#if 0
static float eval(float b, float c, float t) {
    const float a = 0, d = 1;
    
    float ab = lerp(a, b, t);
    float bc = lerp(b, c, t);
    float cd = lerp(c, d, t);
    float abc = lerp(ab, bc, t);
    float bcd = lerp(bc, cd, t);
    return lerp(abc, bcd, t);
}
#endif

float CubicUnit::x_to_y(float x) const {
    constexpr float epsilon = 0.00001f;

    x = pin_to_unit(x);
    if (m_type == Type::linear) {
        return x;
    } else if (x <= epsilon || x >= (1 - epsilon)) {
        return x;
    }

    auto t = find_unit_cubic_root(A.x, B.x, C.x, -x);
    assert(float_is_unit(t));

//        eval(m_pts[0].y, m_pts[1].y, t);
//    float y1 = ((A.y*t + B.y)*t + C.y)*t;
    return float(((da*t + db)*t + dc)*t);
}

/////////////////////

#include "include/random.h"

void CubicUnit::Tests() {
#ifdef DEBUG
    {
        CubicUnit cu;
        assert(cu.m_type == CubicUnit::Type::linear);
    }

    for (float t = 0; t <= 1; t += 1.0f / 64) {
        CubicUnit a({t, t}, {1-t, 1-t});
        assert(a.m_type == CubicUnit::Type::linear);
        assert(a.x_to_y(t) == t);
    }
    
    // S-curves
    {
        CubicUnit a({1, 0}, {0, 1});
        auto y = a.x_to_y(0.5f);
        assert(nearly_eq(y, 0.5f));
    }
    {
        CubicUnit a({0, 1}, {1, 0});
        auto y = a.x_to_y(0.5f);
        assert(nearly_eq(y, 0.5f));
    }

    auto check_mono = [](const CubicUnit& cu) {
        auto y = cu.x_to_y(0);
        assert(y == 0);
        y = cu.x_to_y(1);
        assert(y == 1);

        const float dx = 1.0f / 512;
        y = 0;
        // ensure we're monontonic
        for (float x = dx; x < 1; x += dx) {
            auto ny = cu.x_to_y(x);
            assert(y <= ny);
            y = ny;
        }
    };
    
    const Point pts[] = {
        {1, 0}, {1, 0},
        {0, 1}, {0, 1},
        {0, 1}, {1, 0},
        {1, 0}, {0, 1},
    };
    for (int i = 0; i < ArrayCount(pts); i += 2) {
        check_mono({pts[i], pts[i+1]});
    }
    
    Random rand;
    for (int i = 0; i < 10000; ++i) {
        Point pts[2] = {
            {rand.nextF(), rand.nextF()},
            {rand.nextF(), rand.nextF()},
        };
        check_mono({pts[0], pts[1]});
    }
#endif
}
