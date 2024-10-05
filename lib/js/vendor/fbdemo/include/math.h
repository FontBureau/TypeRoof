/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_math_h_
#define _pentrek_math_h_

#include "include/pentrek_types.h"

namespace pentrek {

template <typename T> T align_2(T value) {
    return (value + 1) & ~0x1;
}

template <typename T> T align_4(T value) {
    return (value + 3) & ~0x3;
}

template <typename T> T align_8(T value) {
    return (value + 7) & ~0x7;
}

constexpr float kDefaultUnitTolerance = 1.0f / 65536;

static inline float round_to_float(float x) {
    return std::floor(x + 0.5f);
}

static inline int round_to_int(float x) {
    return (int)round_to_float(x);
}

// note: should return false for NaN as well
static inline bool float_contains(float x, float min, float max) {
    assert(min <= max);
    return min <= x && x <= max;
}

static inline bool float_is_unit(float x) { return float_contains(x, 0, 1); }

static inline float pin_float(float value, float mn, float mx) {
    assert(mn <= mx);
    return std::min(std::max(value, mn), mx);
}

static inline float pin_to_unit(float x) { return pin_float(x, 0, 1); }

static inline bool nearly_eq(float a, float b, float tol = kDefaultUnitTolerance) {
    return std::abs(a - b) <= tol;
}

static inline bool nearly_zero(float v, float tol = kDefaultUnitTolerance) {
    return nearly_eq(v, 0, tol);
}

template <typename T> T lerp_unbounded(const T& a, const T& b, float t) {
    return a + (b - a) * t;
}

template <typename T> T lerp(const T& a, const T& b, float t) {
    assert(t >= 0 && t <= 1);
    return a + (b - a) * t;
}

/*
 *  Returns the number of real roots between [0...1] in ascending order.
 */
int quadratic_unit_roots(float A, float B, float C, float roots[2]);

/*
 *  Returns the number of real roots between [0...1] in ascending order.
 */
int cubic_unit_roots(float A, float B, float C, float D, float roots[3]);

class Math {
public:
    static void Tests();
};

} // namespace

#endif
