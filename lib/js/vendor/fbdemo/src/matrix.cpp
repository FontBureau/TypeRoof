

#include "include/matrix.h"

using namespace pentrek;

constexpr Matrix gIdentity;

bool Matrix::isIdentity() const {
    return *this == gIdentity;
}

const Matrix& Matrix::I() { return gIdentity; }

Point Point::makeLength(float newLength) const {
    const float oldLength = this->length();
    if (oldLength == 0) {
        return {newLength, 0};
    } else {
        return *this * (newLength / oldLength);
    }
}

Matrix Matrix::Rotate(float radians) {
    const float c = std::cos(radians);
    const float s = std::sin(radians);
    return {c, s, -s, c, 0, 0};
}

static double dcross(double a, double b, double c, double d) {
    return a * b - c * d;
}

bool Matrix::invert(Matrix* inverse) const {
    double det = dcross(m[0], m[3], m[1], m[2]);
    if ((float)det == 0) {
        return false;
    }

    double idet = 1 / det;
    
    float a =  m[3] * idet;
    float b = -m[1] * idet;
    float c = -m[2] * idet;
    float d =  m[0] * idet;
    float e = dcross(m[2], m[5], m[3], m[4]) * idet;
    float f = dcross(m[1], m[4], m[0], m[5]) * idet;

    *inverse = Matrix(a, b, c, d, e, f);
    return true;
}

Matrix Matrix::invertOrIdentity() const {
    Matrix inverse; // initializes to identity
    (void)this->invert(&inverse);
    return inverse;
}

Matrix Matrix::Fit(const Rect& src, const Rect& dst, FitStyle fit) {
    float sx = dst.width() / src.width();
    float sy = dst.height() / src.height();
    Point gap = {0, 0};

    if (fit != FitStyle::fill) {
        // compute the smaller scale
        if (sx > sy) {
            sx = sy;
            gap.x = dst.width() - sx * src.width();
            assert(gap.x >= 0);
        } else {
            sy = sx;
            gap.y = dst.height() - sy * src.height();
            assert(gap.y >= 0);
        }
    }

    switch (fit) {
        case FitStyle::fill:
            // keep the zero gap
            break;
        case FitStyle::start:
            gap = {0, 0};
            break;
        case FitStyle::center:
            gap *= 0.5f;
            break;
        case FitStyle::end:
            // keep the full gap
            break;
    }

    return Matrix::Trans(dst.x() + gap.x, dst.y() + gap.y)
         * Matrix::Scale(sx, sy)
         * Matrix::Trans(-src.x(), -src.y());
}

void Matrix::map(Span<Point> dst, Span<const Point> src) const {
    assert(dst.size() >= src.size());
    for (size_t i = 0; i < src.size(); ++i) {
        dst[i] = *this * src[i];
    }
}

///////////////

static inline float fast_min(float a, float b) {
    return fminf(a, b);
}
static inline float fast_max(float a, float b) {
    return fmaxf(a, b);
}

Rect Rect::Bounds(Span<const Point> pts) {
    if (pts.empty()) {
        return pentrek::Rect::Empty();
    }
    
    float l = pts[0].x,
          t = pts[0].y,
          r = l,
          b = t;

    for (size_t i = 1; i < pts.size(); ++i) {
        auto p = pts[i];
        l = fast_min(l, p.x);
        t = fast_min(t, p.y);
        r = fast_max(r, p.x);
        b = fast_max(b, p.y);
    }
    return pentrek::Rect{l, t, r, b};
}

void Rect::toQuad(Point p[4]) const {
    p[0] = {left, top};
    p[1] = {right, top};
    p[2] = {right, bottom};
    p[3] = {left, bottom};
}
