/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/math.h"

using namespace pentrek;

static inline float* append_unit(float storage[], float t) {
    if (float_is_unit(t)) {
        *storage++ = t;
    }
    return storage;
}

static inline float* append_unit(float storage[], double t) {
    return append_unit(storage, (float)t);
}

// need the sign (1 or -1) of a float/double
template <typename T> T fsign(T value) {
    return value < 0 ? -1 : 1;
}

int pentrek::quadratic_unit_roots(float A, float B, float C, float rootStorage[2]) {
    float* roots = rootStorage;

    if (A == 0) {
        roots = append_unit(roots, -C/B);
    } else {
        if (B == 0) {
            float quot = -C/A;
            if (quot >= 0) {
                roots = append_unit(roots, std::sqrt(quot));
            }
        } else {
            float discrim = B*B - 4*A*C;
            if (discrim < 0) {
                return 0;   // complex roots
            }
            if (discrim == 0) {
                roots = append_unit(roots, -0.5f * B/A);
            } else {
                float Q = -0.5f * (B + fsign(B) * sqrt(discrim));
                roots = append_unit(roots, Q/A);
                roots = append_unit(roots, C/Q);
            }
        }
    }

    // clean up results : sort and remove dups

    int n = castTo<int>(roots - rootStorage);
    assert(n >= 0 && n <= 2);
    if (n == 2) {
        if (rootStorage[0] > rootStorage[1]) {
            std::swap(rootStorage[0], rootStorage[1]);
        } else if (rootStorage[0] == rootStorage[1]) {
            n = 1;
        }
    }
    for (int i = 0; i < n; ++i) {
        assert(float_is_unit(rootStorage[i]));
    }
    return n;
}

int pentrek::cubic_unit_roots(float Af, float Bf, float Cf, float Df, float rootStorage[3]) {
    if (Af == 0) {
        return quadratic_unit_roots(Bf, Cf, Df, rootStorage);
    }
    
    float* roots = rootStorage;

    // normalizing from Af*t^3 + Bf*t^2 + Cf*t + Df
    // (and casing to doubles) --> t^3 + a*t^2 + b*t + c
    // to match the text in Numerical Recipies
    const double a = Bf / (double)Af,
                 b = Cf / (double)Af,
                 c = Df / (double)Af;
    
    const double Q = (a*a - 3*b) /9;
    const double R = (2*a*a*a - 9*a*b + 27*c) /54;
    
    const double R2 = R*R;
    const double Q3 = Q*Q*Q;
    constexpr double third = 1.0/3;
    const double aOver3 = a * third;

    if (R2 < Q3) {
        constexpr double twoPiOver3 = 2 * 3.14159265358979323 / 3; // 2.094395102393195
        const double thetaOver3 = std::acos(R/std::sqrt(Q3)) * third;
        const double rootQ2 = -2*std::sqrt(Q);
        roots = append_unit(roots, rootQ2 * std::cos(thetaOver3             ) - aOver3);
        roots = append_unit(roots, rootQ2 * std::cos(thetaOver3 + twoPiOver3) - aOver3);
        roots = append_unit(roots, rootQ2 * std::cos(thetaOver3 - twoPiOver3) - aOver3);
    } else {
        double A = -fsign(R) * std::pow(std::abs(R) + std::sqrt(R2 - Q3), third);
        double B = (A == 0) ? 0 : Q/A;
        roots = append_unit(roots, A + B - aOver3);
    }

    // clean up results : sort and remove dups

    int n = castTo<int>(roots - rootStorage);
    assert(n >= 0 && n <= 3);
    std::sort(rootStorage, roots);  // todo: write our own (since n <= 3)
    if (n == 3) {
        if (rootStorage[1] == rootStorage[2]) {
            n = 2;
        } else if (rootStorage[0] == rootStorage[1]) {
            // gotta slide
            rootStorage[0] = rootStorage[1];
            rootStorage[1] = rootStorage[2];
            n = 2;
        }
    }
    if (n == 2 && rootStorage[0] == rootStorage[1]) {
        n = 1;
    }
    for (int i = 0; i < n; ++i) {
        assert(float_is_unit(rootStorage[i]));
        if (i != 0) {
            assert(rootStorage[i-1] < rootStorage[i]);
        }
    }
    return n;
}
//////////////////////////////////////

#include "include/span.h"

static void test_qroot(float A, float B, float C, Span<const float> expected) {
    float roots[2];
    int n = quadratic_unit_roots(A, B, C, roots);
    assert(n >= 0 && n <= 2);

    assert(expected.size() == (unsigned)n);
    if (n == 2) {
        assert(roots[0] < roots[1]);
    }
    for (int i = 0; i < n; ++i) {
        assert(float_is_unit(roots[i]));
        assert(expected[i] == roots[i]);
    }
}

void Math::Tests() {
    test_qroot(1, -3.0f/4, 1.0f/8, {1.0f/4, 1.0f/2});   // 2 roots
    test_qroot(1, -1.0f/2, 0,      {0.0f,   1.0f/2});   // 2 roots -- check for 0.0
    test_qroot(1, -3.0f/2, 1.0f/2, {1.0f/2, 1.0f});     // 2 roots -- check for 1.0

    test_qroot(1, -1, 1.0f/4, {1.0f/2});                // double-root
    test_qroot(0, -4,  3, {3.0f/4});                    // linear
    test_qroot(4,  0, -1, {1.0f/2});                    // pure sqrt

    test_qroot(2,  0,  1, {});                          // pure complex
    test_qroot(1,  1,  1, {});                          // 2 complex
}
