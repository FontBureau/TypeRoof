/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_contour_measure_h_
#define _pentrek_contour_measure_h_

#include "include/matrix.h"
#include "include/path.h"
#include "include/refcnt.h"

namespace pentrek {

class ContourMeasure : public RefCnt {
public:
    struct Rec {
        unsigned m_pointIndex : 30; // first point of this curve
        unsigned m_pointCount : 2;  // 1, 2, 3 (only 0 for last rec)
        float    m_length;          // distance to the end of this segment
        float    m_tValue;          // t value for the end of this segment

        friend bool operator<(const Rec& lhs, const Rec& rhs) {
            return lhs.m_length < rhs.m_length;
        }
    };
    std::vector<Rec> m_recs;
    std::vector<Point> m_pts;

    float pin_distance(float distance) const {
        return std::min(std::max(distance, 0.f), this->length());
    }

    float add_line(Point a, float total);
    float add_quad(const Point[], float total, float tol);
    float add_cubic(const Point[], float total, float tol);

    Point computeFirstTan(float tol) const;
    Point computeLastTan(float tol) const;

#ifdef DEBUG
    void validate() const;
#else
    void validate() const {}
#endif

public:
    static constexpr float gDefaultTolerance = 1;

    ContourMeasure(Span<const Point>, Span<const PathVerb>, float = gDefaultTolerance);

    float length() const {
        assert(m_recs.size() > 0);
        return m_recs.back().m_length;
    }
    
    std::pair<Point, Point> getPosTan(float distance) const;
    std::pair<Point, Point> getPosTanExtend(float distance) const;

    Matrix getMatrix(float distance) const;

    void getSegment(float start, float end, bool doMove, PathSync*) const;
    
    static rcp<ContourMeasure> Make(Span<const Point> pts,
                                    Span<const PathVerb> vbs,
                                    float tol = gDefaultTolerance);
    static rcp<ContourMeasure> Make(const Path& path,
                                    float tol = gDefaultTolerance);
};

class ContourMeasureIter {
    Span<const Point> m_pts;
    Span<const PathVerb> m_vbs;

    rcp<ContourMeasure> tryNext();
public:
    ContourMeasureIter(Span<const Point> p, Span<const PathVerb> v) : m_pts(p), m_vbs(v) {}
    ContourMeasureIter(const Path& p) : ContourMeasureIter(p.points(), p.verbs()) {}
    ContourMeasureIter(const Path* p) : ContourMeasureIter(p->points(), p->verbs()) {}
    ContourMeasureIter(const rcp<Path>& p) : ContourMeasureIter(p->points(), p->verbs()) {}

    rcp<ContourMeasure> next();
};

} // namespace

#endif
