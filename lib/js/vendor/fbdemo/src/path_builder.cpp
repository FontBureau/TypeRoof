/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/geometry.h"
#include "include/path_builder.h"

namespace pentrek {

#ifdef DEBUG

const uint8_t gPtsPerVerb[] = {
    1, 1, 2, 3, 0,  // move, line, quad, cubic, close
};

static size_t count_points(Span<const PathVerb> vbs) {
    size_t n = 0;
    for (auto v : vbs) {
        assert((unsigned)v < sizeof(gPtsPerVerb));
        n += gPtsPerVerb[(unsigned)v];
    }
    return n;
}

static bool valid_verbs(Span<const PathVerb> vbs, bool isFirstContour) {
    if (vbs.size() == 0) {
        return true;
    }
    if (isFirstContour && (vbs[0] != PathVerb::move)) {
        return false;
    }
    PathVerb prev = vbs[0];
    for (size_t i = 1; i < vbs.size(); ++i) {
        if (vbs[i] != PathVerb::move && prev == PathVerb::close) {
            return false;   // missing Move after Close
        }
        prev = vbs[i];
    }
    return true;
}

static bool ready_for_segment(Span<const PathVerb> vbs) {
    if (vbs.size() == 0) {
        return false;
    }
    if (vbs.front() != PathVerb::move) {
        return false;
    }
    return vbs.back() != PathVerb::close;
}

#endif

PathBuilder::PathBuilder(const Path& src, const Matrix& mx) {
    this->addPath(src, mx);
}

void PathBuilder::incReserve(size_t ptsDelta, size_t vbsDelta) {
    m_points.reserve(m_points.size() + ptsDelta);
     m_verbs.reserve( m_verbs.size() + vbsDelta);
}

void PathBuilder::move(Point p) {
    m_verbs.push_back(PathVerb::move);
    m_points.push_back(p);
}
void PathBuilder::line(Point p) {
    assert(ready_for_segment(m_verbs));
    
    m_verbs.push_back(PathVerb::line);
    m_points.push_back(p);
}
void PathBuilder::quad(Point p1, Point p2) {
    assert(ready_for_segment(m_verbs));
    
    m_verbs.push_back(PathVerb::quad);
    m_points.push_back(p1);
    m_points.push_back(p2);
}
void PathBuilder::cubic(Point p1, Point p2, Point p3) {
    assert(ready_for_segment(m_verbs));
    
    m_verbs.push_back(PathVerb::cubic);
    m_points.push_back(p1);
    m_points.push_back(p2);
    m_points.push_back(p3);
}
void PathBuilder::close() {
    assert(ready_for_segment(m_verbs));
    
    m_verbs.push_back(PathVerb::close);
}

void PathBuilder::addRect(const pentrek::Rect& r, PathDirection dir) {
    m_points.reserve(m_points.size() + 4);
    m_verbs.reserve(m_verbs.size() + 1 + 3 + 1);    // M 3*L X
    
    this->move({r.left, r.top});
    if (dir == PathDirection::cw) {
        this->line({r.right, r.top});
        this->line({r.right, r.bottom});
        this->line({r.left, r.bottom});
    } else {
        this->line({r.left, r.bottom});
        this->line({r.right, r.bottom});
        this->line({r.right, r.top});
    }
    this->close();
}

void PathBuilder::addOval(const pentrek::Rect& r, PathDirection dir) {
    constexpr float C = kBezierCircleCoeff;
    
    // precompute clockwise unit circle, starting and ending at {1, 0}
    constexpr Point unit[] = {
        { 1,  0}, { 1,  C}, { C,  1}, // quadrant 1 ( 4:30)
        { 0,  1}, {-C,  1}, {-1,  C}, // quadrant 2 ( 7:30)
        {-1,  0}, {-1, -C}, {-C, -1}, // quadrant 3 (10:30)
        { 0, -1}, { C, -1}, { 1, -C}, // quadrant 4 ( 1:30)
        { 1,  0},
    };
    
    const auto mx = Matrix::Trans(r.center())
    * Matrix::Scale(r.width() * 0.5f, r.height() * 0.5f);
    
    m_points.reserve(m_points.size() + 1 + 4*3);    // M 4*C
    m_verbs.reserve(m_verbs.size() + 1 + 4 + 1);    // M 4*C X
    
    this->move(mx * Point{1, 0});
    if (dir == PathDirection::cw) {
        for (int i = 1; i <= 12; i += 3) {
            this->cubic(mx * unit[i+0], mx * unit[i+1], mx * unit[i+2]);
        }
    } else {
        for (int i = 11; i >= 0; i -= 3) {
            this->cubic(mx * unit[i-0], mx * unit[i-1], mx * unit[i-2]);
        }
    }
    this->close();
}

void PathBuilder::addCircle(Point c, float r, PathDirection dir) {
    assert(r >= 0);
    this->addOval({c.x - r, c.y - r, c.x + r, c.y + r}, dir);
}

void PathBuilder::addPoly(Span<const Point> pts, bool doClose) {
    if (pts.size() > 0) {
        m_points.reserve(m_points.size() + pts.size());
        m_verbs.reserve(m_verbs.size() + doClose);
        this->move(pts[0]);
        for (size_t i = 1; i < pts.size(); ++i) {
            this->line(pts[i]);
        }
        if (doClose) {
            this->close();
        }
    }
}

void PathBuilder::addPath(Span<const Point> pts, Span<const PathVerb> vbs, const Matrix& mx) {
    assert(valid_verbs(vbs, m_verbs.size() == 0));
    assert(count_points(vbs) == pts.size());
    
    const size_t offset = m_points.size();
    m_verbs.insert(m_verbs.end(), vbs.begin(), vbs.end());
    m_points.insert(m_points.end(), pts.begin(), pts.end());

    if (mx != Matrix::I()) {
        mx.map({&m_points[offset], m_points.size() - offset});
    }
}

void PathBuilder::addPath(const Path& src, const Matrix& mx) {
    this->addPath(src.points(), src.verbs(), mx);
}

void PathBuilder::transformInPlace(const Matrix& mx) {
    for (auto& pt : m_points) {
        pt = mx * pt;
    }
}

rcp<Path> PathBuilder::snapshot() {
    return make_rcp<Path>(m_points, m_verbs, m_fillType);
}


rcp<Path> PathBuilder::detach() {
    auto path = make_rcp<Path>(std::move(m_points), std::move(m_verbs), m_fillType);
    m_points.clear();
    m_verbs.clear();
    return path;
}

} // namespace
