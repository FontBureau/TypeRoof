/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/geometry.h"
#include "include/path_builder.h"
// for utils
#include "include/data.h"
#include "include/writer.h"
#include <stdio.h>

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

#endif

Path::Iter::Rec Path::Iter::next() {
    if (m_vbs.empty()) {
        return {nullptr, PathVerb::move};
    }
    auto pts = m_pts.data();
    auto vrb = m_vbs[0];

    size_t n = 0;
    switch (vrb) {
        case PathVerb::move:  m_tmp[1] = pts[0]; break;
        case PathVerb::line:  n = 1; break;
        case PathVerb::quad:  n = 2; break;
        case PathVerb::cubic: n = 3; break;
        case PathVerb::close:
            m_tmp[0] = pts[0];
            pts = m_tmp;
            n = 1;  // only works if we only see 1 close (before the next move)
            break;
    }

    assert(m_pts.size() >= n);
    m_pts = {m_pts.data() + n, m_pts.size() - n};
    m_vbs = {m_vbs.data() + 1, m_vbs.size() - 1};

    return {pts, vrb};
}


//////////////////////////////////////////

Path::Path(Span<const Point> pts, Span<const PathVerb> vbs,
           PathFillType ft, const pentrek::Rect* bounds)
    : m_points(pts.begin(), pts.end())
    , m_verbs( vbs.begin(), vbs.end())
    , m_bounds(bounds ? *bounds : Rect::Bounds(m_points))
    , m_fillType(ft)
{
#ifdef DEBUG
    size_t n = count_points(vbs);
    assert(pts.size() == n);
    // todo: check for legal verb sequence
    
    if (bounds) {
        auto r = Rect::Bounds(m_points);
        assert(r == m_bounds);
    }
#endif
}

Path::Path(std::vector<Point>&& pts, std::vector<PathVerb>&& vbs,
           PathFillType ft, const pentrek::Rect* bounds)
    : m_points(std::move(pts))
    , m_verbs( std::move(vbs))
    , m_bounds(bounds ? *bounds : Rect::Bounds(m_points))
    , m_fillType(ft)
{
#ifdef DEBUG
    size_t n = count_points(vbs);
    assert(pts.size() == n);
    // todo: check for legal verb sequence
    
    if (bounds) {
        auto r = Rect::Bounds(m_points);
        assert(r == m_bounds);
    }
#endif
}

bool Path::operator==(const Path& o) const {
    return this->fillType() == o.fillType()
        && this->bounds() == o.bounds()
        && this->points() == o.points()
        && this->verbs() == o.verbs();
}

std::vector<Point> Path::copyPoints() const {
    return std::vector<Point>(m_points.begin(), m_points.end());
}

std::vector<PathVerb> Path::copyVerbs() const {
    return std::vector<PathVerb>(m_verbs.begin(), m_verbs.end());
}

rcp<Path> Path::transform(const Matrix& mx) const {
    auto pts = this->copyPoints();
    auto vbs = this->copyVerbs();
    if (!mx.isIdentity()) {
        mx.map(pts);
    }
    return make_rcp<Path>(std::move(pts), std::move(vbs), this->fillType());
}

//////////////////////////////////////////

rcp<Path> Path::Empty() {
    static auto gIdentity = rcp<Path>(new Path);
    return gIdentity;
}

rcp<Path> Path::Rect(const pentrek::Rect& r, PathDirection dir) {
    PathBuilder p;
    p.addRect(r, dir);
    return p.detach();
}

rcp<Path> Path::Oval(const pentrek::Rect& r, PathDirection dir) {
    PathBuilder p;
    p.addOval(r, dir);
    return p.detach();
}

rcp<Path> Path::Circle(Point center, float radius, PathDirection dir) {
    radius = std::max(0.0f, radius);
    return Oval({center.x - radius, center.y - radius,
                 center.x + radius, center.y + radius}, dir);
}

rcp<Path> Path::Poly(Span<const Point> pts, bool doClose) {
    PathBuilder p;
    p.addPoly(pts, doClose);
    return p.detach();
}

rcp<Path> Path::Lerp(const Path* a, const Path* b, float t) {
    assert(a->m_points.size() == b->m_points.size());
    assert(a->m_verbs.size() == b->m_verbs.size());
    const size_t n = a->m_points.size();

    // If a and b have different verbs, we don't really notice,
    // we just copy over the verbs from a

    std::vector<Point> pts(a->m_points.size());
    std::vector<PathVerb> vbs = a->m_verbs;

    if (false) {
        for (size_t i = 0; i < n; ++i) {
            pts[i] = lerp_unbounded(a->m_points[i], b->m_points[i], t);
        }
    } else {
        const Point* pa = a->m_points.data();
        const Point* pb = b->m_points.data();
        Point* pc = pts.data();
        for (size_t i = 0; i < n; ++i) {
            pc[i] = lerp_unbounded(pa[i], pb[i], t);
        }
    }
    return make_rcp<Path>(std::move(pts), std::move(vbs), a->fillType());
}

// Utilities

void Path::dump() const {
    Iter iter(*this);
    while (auto r = iter.next()) {
        switch (r.vrb) {
            case PathVerb::move: printf("b.move({%g,%g});\n", r.pts[0].x, r.pts[0].y); break;
            case PathVerb::line: printf("b.line({%g,%g});\n", r.pts[1].x, r.pts[1].y); break;
            case PathVerb::quad:
                printf("b.quad({%g,%g}, {%g,%g});\n",
                       r.pts[1].x, r.pts[1].y, r.pts[2].x, r.pts[2].y);
                break;
            case PathVerb::cubic:
                printf("b.cubic({%g,%g}, {%g,%g}, {%g,%g});\n",
                       r.pts[00].x, r.pts[0].y, r.pts[1].x, r.pts[2].y, r.pts[2].x, r.pts[2].y);
                break;
            case PathVerb::close: printf("b.close();\n"); break;
        }
    }
}

void Path::writeSVGString(Writer* w) const {
    Iter iter(*this);
    while (const auto r = iter.next()) {
        switch (r.vrb) {
            case PathVerb::move: w->writef("M%g,%g", r.pts[0].x, r.pts[0].y); break;
            case PathVerb::line: w->writef("L%g,%g", r.pts[1].x, r.pts[1].y); break;
            case PathVerb::quad:
                w->writef("Q%g,%g %g,%g",
                          r.pts[1].x, r.pts[1].y,
                          r.pts[2].x, r.pts[2].y);
                break;
            case PathVerb::cubic:
                w->writef("C%g,%g %g,%g %g,%g",
                          r.pts[1].x, r.pts[1].y,
                          r.pts[2].x, r.pts[2].y,
                          r.pts[3].x, r.pts[3].y);
                break;
            case PathVerb::close: w->write("Z"); break;
        }
    }
}

rcp<Data> Path::asSVGData() const {
    MemoryWriter w;
    this->writeSVGString(&w);
    return w.detach();
}


std::pair<int, int> count_contour_pts_vbs(Span<const Point> pts, Span<const PathVerb> vbs) {
    if (vbs.size() == 0) {
        return {0, 0};
    }
    
    assert(vbs[0] == PathVerb::move);
    
    // initial values for the initial move
    int n = 1;
    size_t i = 1;
    for (; i < vbs.size(); ++i) {
        auto v = vbs[i];
        if (v == PathVerb::move) {
            break;
        }
        n += points_for_verb(v);
    }
    assert(n <= pts.size());

    return {n, i}; // #points, #verbs
}

///////////////////////

void Path::Tests() {
#ifdef DEBUG
    PathBuilder builder;
    builder.move({1, 2});
    builder.line({5, 6});
    builder.line({3, 4});

    const auto r = Rect::LTRB(1, 2, 5, 6);
    assert(builder.bounds() == r);

    auto p0 = builder.snapshot();
    auto p1 = builder.detach();
    
    assert(*p0 == *p1);
    
    assert(p0->bounds() == r);
    
    {
        constexpr int N = 9;
        Point p[N];
        for (int i = 0; i < N; ++i) {
            p[i] = {(float)i, (float)i};
        }
            
        PathBuilder pb;
        pb.move(p[0]);
        pb.line(p[1]);
        pb.quad(p[2], p[3]);
        pb.cubic(p[4], p[5], p[6]);
        pb.close();
        pb.move(p[7]);
        pb.line(p[8]);
        
        auto path = pb.detach();
        Path::Iter iter(*path);
        auto r = iter.next();
        assert(r); assert(r.vrb == PathVerb::move);
        assert(r.pts[0] == p[0]);

        r = iter.next(); assert(r); assert(r.vrb == PathVerb::line);
        for (int i = 0; i < 2; ++i) {
            assert(r.pts[i] == p[i + 0]);
        }

        r = iter.next(); assert(r); assert(r.vrb == PathVerb::quad);
        for (int i = 0; i < 3; ++i) {
            assert(r.pts[i] == p[i + 1]);
        }

        r = iter.next(); assert(r); assert(r.vrb == PathVerb::cubic);
        for (int i = 0; i < 4; ++i) {
            assert(r.pts[i] == p[i + 3]);
        }

        r = iter.next(); assert(r); assert(r.vrb == PathVerb::close);
        assert(r.pts[0] == p[6]);
        assert(r.pts[1] == p[0]);

        r = iter.next(); assert(r); assert(r.vrb == PathVerb::move);
        assert(r.pts[0] == p[7]);

        r = iter.next(); assert(r); assert(r.vrb == PathVerb::line);
        for (int i = 0; i < 2; ++i) {
            assert(r.pts[i] == p[i + 7]);
        }
        
        r = iter.next(); assert(!r);
        r = iter.next(); assert(!r);
    }
#endif
}

} // namespace
