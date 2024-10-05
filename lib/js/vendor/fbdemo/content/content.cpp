/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/content.h"
#include "include/cubic_unit.h"
#include "include/math.h"
#include "include/path_builder.h"
#include "include/content.h"
#include "include/writer.h"

#ifdef PENTREK_BUILD_FOR_APPLE
    #include "include/c2d_writer.h"
    #include "include/svg_canvas.h"
#endif

using namespace pentrek;

////////////////////////////

void Button::onDraw(Canvas* canvas) {
    Rect r = Rect::WH(this->size()).inset(4, 4);
    Paint p;
    
    if (m_hilite) {
        Color c = m_color;
        c.a *= 0.5f;
        p.color(c);
        canvas->drawRect(r, p);
    }
    p.stroke(true);
    p.width(3);
    p.color(m_color);
    canvas->drawRect(r, p);
}

std::unique_ptr<Click> Button::onFindClick(Point p) {
    Rect r = Rect::WH(this->size()).inset(4, 4);
    if (r.contains(p)) {
        m_hilite = true;
        return Click::Make(p, this, [r, this](Click* c, bool up) {
            if (up) {
                m_hilite = false;
                // todo: send event!
            } else {
                m_hilite = r.contains(c->m_curr);
            }
        });
    }
    return nullptr;
}


//////////////////////////////////////

constexpr float kSliderMargin = 2;
constexpr float kSliderCornerRadius = 5;
constexpr Color kSliderBarColor   = {0, 0, 1, 1};
constexpr float kSliderBarThickness = 3;
constexpr Color kSliderThumbColor   = {0, 0, 0.75f, 1};
constexpr float kSliderThumbWidth = 4;
constexpr float kSliderThumbHeight = 8;
constexpr Color kSliderTickColor = {1, 0, 0, 0.5f};
constexpr float kSliderTickWidth = 2;
constexpr float kSliderTickHeight = 12;

constexpr float kSliderIdleThickness = 1;
constexpr Color kSliderFrameIdleColor = {0.8f, 0.8f, 0.8f, 1};

constexpr float kSliderTrackingThickness = 1.5f;
constexpr Color kSliderFrameTrackingColor = {0.7f, 0.7f, 0.7f, 1};

constexpr float kDragMargin = 20;

static void default_notify(Slider* s, float v) {
    s->value(v);
}

Slider::Slider() : m_notify(default_notify) {
    this->setDefaultSize();
}

Slider::Slider(float min, float max) : m_min(min), m_max(max), m_notify(default_notify) {
    this->setDefaultSize();
}

void Slider::setDefaultSize() {
    auto h = kSliderTickHeight + 2 * kSliderMargin;
    this->size({100, h});
}

void Slider::setTicks(Span<const float> ticks) {
    m_ticks.resize(ticks.size());
    std::copy(ticks.begin(), ticks.end(), m_ticks.begin());
}

void Slider::onDraw(Canvas* canvas) {
    const Rect bounds = this->localBounds().inset(kSliderMargin, kSliderMargin);

    Paint paint;
    paint.stroke(true);
    if (m_isTracking) {
        paint.width(kSliderTrackingThickness);
        paint.color(kSliderFrameTrackingColor);
    } else {
        paint.width(kSliderIdleThickness);
        paint.color(kSliderFrameIdleColor);
    }
    canvas->drawRect(bounds, paint);
    
    float x0 = bounds.left + kSliderCornerRadius;
    float x1 = bounds.right - kSliderCornerRadius;
    if (x0 >= x1) {
        return;
    }
    
    const float cy = bounds.center().y;
    const float lerpScale = 1.0f / (m_max - m_min);

    auto mapx = [&](float x) {
        return lerp(x0, x1, (x - m_min) * lerpScale);
    };

    if (m_ticks.size() > 0) {
        PathBuilder builder;
        builder.incReserve(m_ticks.size()*2, m_ticks.size()*2);

        paint.color(kSliderTickColor);
        paint.width(kSliderTickWidth);
        for (auto t : m_ticks) {
            if (t >= m_min && t <= m_max) {
                auto x = mapx(t);
                builder.addLine({x, cy - kSliderTickHeight/2},
                                {x, cy + kSliderTickHeight/2});
            }
        }
        canvas->drawPath(builder.detach(), paint);

    }
    
    const float thumbrad = kSliderThumbWidth/2;

    paint.color(kSliderBarColor);
    paint.width(kSliderBarThickness);
    canvas->drawLine({x0 - thumbrad, cy}, {x1 + thumbrad, cy}, paint);
    
    paint.stroke(false);
    paint.color(kSliderThumbColor);
    float x = mapx(m_value);
    Rect r = Rect::XYWH(x - thumbrad, cy - kSliderThumbHeight/2,
                        kSliderThumbWidth, kSliderThumbHeight);
    canvas->drawRect(r, paint);
}

bool Slider::handleClick(Point p) {
    if (!Rect::WH(this->size()).inset(-kDragMargin, -kDragMargin).contains(p)) {
        return false;
    }

    float x0 = kSliderCornerRadius;
    float x1 = this->width() - kSliderCornerRadius;
    if (x0 >= x1) {
        return false;
    }

    float x = pin_float(p.x, x0, x1);
    x = m_min + (m_max - m_min) * (x - x0) / (x1 - x0);
    if (m_value != x) {
        m_notify(this, x);
    }
    return true;
}

std::unique_ptr<Click> Slider::onFindClick(Point clickp) {
    if (Rect::WH(this->size()).contains(clickp)) {
        float preDragValue = m_value;
        (void)this->handleClick(clickp);
        m_isTracking = true;
        return Click::Make(clickp, this, [this, preDragValue](Click* c, bool up) {
            if (!up) {
                if (!this->handleClick(c->m_curr)) {
                    m_notify(this, preDragValue);
                }
            } else {
                m_isTracking = false;
                m_notify(this, this->value());    // call again after we clear isTracking
            }
        });
    }
    return nullptr;
}

////////////////////////////////////////

constexpr float kFloatingTitleBarHeight = 7;
constexpr Color kFloatingTitleBarColor = {1, 0, 0, 1};

void FloatingGroup::reLayout() {
    Size size = {64, kFloatingTitleBarHeight};
    if (m_child && m_childIsVisible) {
        size = m_child->size();
        size.height += kFloatingTitleBarHeight;
    }
    this->size(size);
}

void FloatingGroup::showChild(bool show) {
    m_childIsVisible = show;
    this->reLayout();
}

std::unique_ptr<View> FloatingGroup::setChild(std::unique_ptr<View> ch) {
    auto prev = std::move(m_child);
    if (prev) {
        prev->parent(nullptr);
    }
    m_child = std::move(ch);
    if (m_child) {
        m_child->parent(this);
        m_child->position({0, kFloatingTitleBarHeight});
    }
    this->reLayout();
    return prev;
}

void FloatingGroup::onDraw(Canvas* canvas) {
    canvas->translate(m_drag);

    Paint paint;
    paint.color(kFloatingTitleBarColor);
    
    Rect r = this->localBounds();
    r.bottom = kFloatingTitleBarHeight;
    
    canvas->drawRect(r, paint);
    
    if (m_child && m_childIsVisible) {
        m_child->draw(canvas);
    }
}

std::unique_ptr<Click> FloatingGroup::onFindClick(Point p) {
    Rect r = this->localBounds();
    r.bottom = kFloatingTitleBarHeight;
    if (r.contains(p)) {
        return Click::Make(p, this, [this](Click* c, bool up) {
            if (up) {
                this->position(this->position() + m_drag);
                m_drag = {0, 0};
            } else {
                m_drag = c->m_curr - c->m_orig;
            }
        });
    }
    return (m_childIsVisible && m_child) ? m_child->findClick(p) : nullptr;
}

///////////////////////////////////////////////////////////////////////////////////

constexpr float kCubicInterpView_margin = 4;
constexpr float kCubicInterpView_PointSize = 6;
constexpr Color CubicInterpView_diagonalColor = {0.75, 0.75, 0.75, 1};
constexpr float CubicInterpView_diagonalThickness = 0.5f;

CubicInterpView::CubicInterpView() {
    auto def = CubicUnit::DefaultPts();
    m_pts[0] = def[0];
    m_pts[1] = def[1];
    
    m_notify = [](CubicInterpView* v, Point a, Point b) {
        v->pts(a, b);
    };

    this->size({80, 80});
}

void CubicInterpView::pts(Point p0, Point p1) {
    auto pin_unit = [](Point p) {
        return Point{pin_to_unit(p.x), pin_to_unit(p.y)};
    };

    m_pts[0] = pin_unit(p0);
    m_pts[1] = pin_unit(p1);
}

void CubicInterpView::resetPts() {
    this->pts(CubicUnit::DefaultPts());
}

static Rect bounds(View* v) {
    return v->localBounds().inset(kCubicInterpView_margin, kCubicInterpView_margin);
}

static Matrix matrix(View* v) {
    auto r = bounds(v);
    return Matrix::Fit(Rect::WH(1, 1), r)
         * Matrix::Trans(0, 1)
         * Matrix::Scale(1, -1);
}

void CubicInterpView::onDraw(Canvas* canvas) {
    Rect r = this->localBounds().inset(kCubicInterpView_margin, kCubicInterpView_margin);
    if (r.isEmpty()) {
        return;
    }
    Paint paint;
    paint.stroke(true);
    paint.color({0.75, 0.75, 0.75, 1});
    canvas->drawRect(r, paint);

    paint.color(CubicInterpView_diagonalColor);
    paint.width(CubicInterpView_diagonalThickness);
    canvas->drawLine(r.BL(), r.TR(), paint);
    
    if (!this->enabled()) {
        return;
    }

    Point pts[4] = {
        {0, 0}, m_pts[0], m_pts[1], {1, 1},
    };
    matrix(this).map(pts);

    paint.color({0.75, 0.75, 0.75, 1});
    canvas->drawLine(pts[0], pts[1], paint);
    canvas->drawLine(pts[2], pts[3], paint);

    PathBuilder path;
    path.move(pts[0]);
    path.cubic(pts[1], pts[2], pts[3]);

    paint.color(Color_black);
    canvas->drawPath(path.detach(), paint);

    auto draw_dot = [&](Point p) {
        canvas->drawCircle(p, kCubicInterpView_PointSize * 0.5f, paint);
    };
    paint.color({0,0,1,1});
    paint.stroke(false);
    draw_dot(pts[1]);
    draw_dot(pts[2]);
}

static Point discretize_on_diagonal(Point p) {
    constexpr float tol = 1.0f / 64;
    if (nearly_eq(p.x, p.y, tol)) {
        p.x = p.y = (p.x + p.y) * 0.5f;
    }
    return p;
}
std::unique_ptr<Click> CubicInterpView::onFindClick(Point p) {
    auto mx = matrix(this);
    Point pts[2] = {
        m_pts[0], m_pts[1],
    };
    mx.map(pts);
    const float tol = kCubicInterpView_PointSize;
    for (size_t i = 0; i < ArrayCount(pts); ++i) {
        if (nearly_eq(p, pts[i], tol)) {
            auto inverse = mx.invertOrIdentity();
            return Click::Make(p, this, [this, i, inverse](Click* c, bool up) {
                auto pt = discretize_on_diagonal(inverse * c->m_curr);
                Point array[] = {m_pts[0], m_pts[1]};
                array[i] = pt;  // overwrite
                m_notify(this, array[0], array[1]);
            });
        }
    }

    return nullptr;
}

///////////////////////////////////////////////////////////////////////////////////

void Content::requestDraw() {
    Content::RequestDraw(this);
}

void Content::handleHover(Point p) {
    this->onHover(p);
}

bool Content::onKeyDown(const KeyEvent& e) {
#ifdef PENTREK_BUILD_FOR_APPLE
    if (e.isUni()) {
        switch (e.uni()) {
            case 'S': {
                SVGWriter svg;
                this->draw(svg.begin(this->bounds()));
                MemoryWriter mw;
                svg.end(mw);
                WriteToClipboard(mw.cspan());
                return true;
            } break;
            case 'C': {
                Canvas2DWriter c2d;
                MemoryWriter mw;
                this->draw(c2d.begin("ctx", mw));
                c2d.end();
                WriteToClipboard(mw.cspan());
                return true;
            } break;
            default: break;
        }
    }
#endif
    return false;
}
