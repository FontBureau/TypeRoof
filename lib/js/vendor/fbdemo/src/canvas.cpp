/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/canvas.h"
#include "include/path_builder.h"

using namespace pentrek;

Color Color::FromColor32(Color32 c) {
    constexpr float scale = 1.0f / 255;
    return {
        Color32R(c) * scale,
        Color32G(c) * scale,
        Color32B(c) * scale,
        Color32A(c) * scale,
    };
}

static int round2int(float x) {
    return (int)std::floor(x + 0.5f);
}

Color32 Color::color32() const {
    return Color32_ARGB(round2int(a * 255),
                        round2int(r * 255),
                        round2int(g * 255),
                        round2int(b * 255));
}

//////////////////////////////////////////

void Canvas::save() {
    m_saveCount += 1;
    this->onSave();
}
void Canvas::restore() {
    assert(m_saveCount > 0);
    this->onRestore();
    m_saveCount -= 1;
}

void Canvas::restoreToCount(int count) {
    assert(count >= 0);
    assert(m_saveCount >= count);
    while (m_saveCount > count) {
        this->restore();
    }
}

void Canvas::translate(Point p) {
    this->concat(Matrix::Trans(p.x, p.y));
}
void Canvas::scale(Point p) {
    this->concat(Matrix::Scale(p.x, p.y));
}
void Canvas::rotate(float radians) {
    this->concat(Matrix::Rotate(radians));
}
void Canvas::drawPoly(Span<const Point> pts, bool doClose, const Paint& paint) {
    this->drawPath(Path::Poly(pts, doClose), paint);
}

void Canvas::drawOval(const Rect& oval, const Paint& paint) {
    this->drawPath(Path::Oval(oval), paint);
}

void Canvas::drawCircle(Point center, float radius, const Paint& paint) {
    radius = std::max(0.0f, radius);
    this->drawOval({center.x - radius, center.y - radius,
                    center.x + radius, center.y + radius}, paint);
}

void Canvas::drawPoints(Span<const Point> pts, const Paint& paint) {
    Paint fill = paint;
    fill.stroke(false);

    const float rad = fill.width() * 0.5f;
    for (auto p : pts) {
        this->drawRect({p.x - rad, p.y - rad, p.x + rad, p.y + rad}, fill);
    }
}

void Canvas::drawPoint(Point p, const Paint& paint) {
    this->drawPoints(Span(&p, 1), paint);
}

void Canvas::drawLine(Point a, Point b, const Paint& paint) {
    Paint stroke = paint;
    stroke.stroke(true);

    PathBuilder builder;
    builder.addLine(a, b);
    this->drawPath(builder.detach(), stroke);
}

// These call the virtual methods directly

void Canvas::concat(const Matrix& m) { this->onConcat(m); }
void Canvas::clipRect(const Rect& r) { this->onClipRect(r); }
void Canvas::clipPath(const Path& p) { this->onClipPath(p); }
void Canvas::drawRect(const Rect& r, const Paint& p) { this->onDrawRect(r, p); }
void Canvas::drawPath(const Path& path, const Paint& paint) { this->onDrawPath(path, paint); }

// We have defaults for Rects, in case the client just likes paths

void Canvas::onClipRect(const Rect& r) {
    this->onClipPath(*Path::Rect(r).get());
}

void Canvas::onDrawRect(const Rect& r, const Paint& paint) {
    this->onDrawPath(*Path::Rect(r).get(), paint);
}
