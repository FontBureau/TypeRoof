/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_path_h_
#define _pentrek_path_h_

#include "include/geometry.h"
#include "include/matrix.h"
#include "include/rect.h"
#include "include/refcnt.h"
#include "include/span.h"
#include <vector>

namespace pentrek {

class Data;
class Writer;

enum class PathVerb : uint8_t {
    move, line, quad, cubic, close
};

enum class PathDirection : uint8_t {
    ccw, cw
};

enum class PathFillType : uint8_t {
    winding, evenodd
};

class Path : public RefCnt {
    static constexpr PathFillType kDefFillType = PathFillType::winding;

    std::vector<Point> m_points;
    std::vector<PathVerb> m_verbs;
    Rect m_bounds;
    const PathFillType m_fillType = kDefFillType;

    Path() : m_bounds(Rect::Empty()) {}

public:
    Path(Span<const Point>, Span<const PathVerb>, PathFillType, const Rect* bounds = nullptr);
    Path(std::vector<Point>&&, std::vector<PathVerb>&&, PathFillType, const Rect* bounds = nullptr);
    ~Path() = default;

    bool empty() const { return m_points.size() == 0; }
    PathFillType fillType() const { return m_fillType; }
    Span<const Point> points() const { return m_points; }
    Span<const PathVerb> verbs() const { return m_verbs; }
    const Rect& bounds() const { return m_bounds; }

    std::vector<Point> copyPoints() const;
    std::vector<PathVerb> copyVerbs() const;

    bool operator==(const Path& o) const;
    bool operator!=(const Path& o) const { return !(*this == o); }
    
    rcp<Path> transform(const Matrix&) const;

    static rcp<Path> Empty();
    static rcp<Path> Rect(const pentrek::Rect&, PathDirection = PathDirection::ccw);
    static rcp<Path> Oval(const pentrek::Rect&, PathDirection = PathDirection::ccw);
    static rcp<Path> Circle(Point, float, PathDirection = PathDirection::ccw);
    static rcp<Path> Poly(Span<const Point>, bool doClose);

    // returns (1 - t)*a + t*b;
    // requires a and b have the same structure and size
    static rcp<Path> Lerp(const Path* a, const Path* b, float t);

    bool hitTest(Point, float radius = 1);
    bool hitTest(const IRect&) const;

    template <typename M, typename L, typename Q, typename C, typename X>
    void visit(M m, L l, Q q, C c, X x) const {
        const Point* movePt = nullptr;
        const Point* p = m_points.data();
        for (auto v : m_verbs) {
            switch (v) {
                case PathVerb::move:
                    m(p);
                    movePt = p;
                    p += 1;
                break;
                case PathVerb::line:  l(p); p += 1; break;
                case PathVerb::quad:  q(p); p += 2; break;
                case PathVerb::cubic: c(p); p += 3; break;
                case PathVerb::close:
                    assert(movePt != nullptr);
                    x(p[-1], *movePt);
                    break;
            }
        }
        assert(p == m_points.data() + m_points.size());
    }
    
    class Iter {
        Span<const Point>    m_pts;
        Span<const PathVerb> m_vbs;
        Point m_tmp[2];
    public:
        Iter(const Path& p) : m_pts(p.points()), m_vbs(p.verbs()) {}
        
        struct Rec {
            const Point* pts;
            PathVerb     vrb;
            
            operator bool() const { return pts != nullptr; }
        };
        Rec next();
    };
    
    void dump() const;  // printf debugging

    void writeSVGString(Writer*) const;
    rcp<Data> asSVGData() const;

    static void Tests();
};

static inline rcp<Path> operator*(const Matrix& m, const Path& p) {
    return p.transform(m);
}

static inline rcp<Path> operator*(const Matrix& m, const rcp<Path>& p) {
    return p->transform(m);
}

class PathSync {
public:
    virtual ~PathSync() {}

    virtual void incReserve(size_t ptsDelta, size_t vbsDelta) {}

    virtual void move(Point) = 0;
    virtual void line(Point) = 0;
    virtual void quad(Point, Point) = 0;
    virtual void cubic(Point, Point, Point) = 0;
    virtual void close() = 0;
};

//////////////////////////////////

static inline int points_for_verb(PathVerb v) {
    static const uint8_t gVerbPointCount[] = { 1, 1, 2, 3, 0 };
    return gVerbPointCount[(unsigned)v];
}

// Return <#points, #verbs> for the first contour in these spans. Will stop
// after the first contour, even if there are more than 1 in vergs.
// - returns <0,0> if the verb span is empty
// - asserts the verb span begins with PathVerb::move (if not empty)
//
std::pair<int, int> count_contour_pts_vbs(Span<const Point>, Span<const PathVerb>);

/////////////////////////////////

struct CtrlPoint {
    Point prev, curr, next;
};

rcp<Path> path_from_ctrlpoints(Span<const CtrlPoint>, bool doClose);

struct MikeMull {
    float m_tanScale = kBezierCircleCoeff;
    float m_maxTanLength = std::numeric_limits<float>::infinity();
    bool m_isClosed = false;
    bool m_useC2 = true;
    
    std::vector<CtrlPoint> ctrlPoints(Span<const Point>) const;
    rcp<Path> path(Span<const Point>) const;
};

} // namespace

#endif
