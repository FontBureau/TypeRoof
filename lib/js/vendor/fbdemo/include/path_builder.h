/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_path_builder_h_
#define _pentrek_path_builder_h_

#include "include/path.h"
#include <vector>

namespace pentrek {

class PathBuilder : public PathSync {
    static constexpr PathFillType kDefFillType = PathFillType::winding;

public:
    std::vector<Point> m_points;
    std::vector<PathVerb> m_verbs;
    PathFillType m_fillType = kDefFillType;

    PathBuilder() = default;
    PathBuilder(const PathBuilder&) = default;
    PathBuilder(PathBuilder&&) = default;
    ~PathBuilder() = default;

    PathBuilder(const Path&, const Matrix&);
    PathBuilder(const Path& src) : PathBuilder(src, Matrix::I()) {}

    PathBuilder& operator=(const PathBuilder&) = default;

    rcp<Path> snapshot();    // does not affect the builder
    rcp<Path> detach();      // leaves the builder empty

    bool empty() const { return m_points.size() == 0; }

    Rect bounds() const { return Rect::Bounds(m_points); }

    void incReserve(size_t ptsDelta, size_t vbsDelta) override;

    void move(Point) override;
    void line(Point) override;
    void quad(Point, Point) override;
    void cubic(Point, Point, Point) override;
    void close() override;

    void move(float x, float y) { this->move({x, y}); }
    void line(float x, float y) { this->line({x, y}); }
    void quad(float x, float y, float x1, float y1) { this->quad({x, y}, {x1, y1}); }
    void quad(const Point p[2]) {
        this->quad(p[0], p[1]);
    }
    void cubic(float x, float y, float x1, float y1, float x2, float y2) {
        this->cubic({x, y}, {x1, y1}, {x2, y2});
    }
    void cubic(const Point p[3]) {
        this->cubic(p[0], p[1], p[2]);
    }

    void addLine(Point a, Point b) { this->move(a); this->line(b); }
    void addRect(const Rect&, PathDirection = PathDirection::ccw);
    void addOval(const Rect&, PathDirection = PathDirection::ccw);
    void addCircle(Point, float, PathDirection = PathDirection::ccw);
    void addPoly(Span<const Point>, bool doClose);
    void addPath(Span<const Point>, Span<const PathVerb>, const Matrix&);
    void addPath(const Path&, const Matrix&);
    void addPath(const rcp<Path>& path, const Matrix& mx) {
        this->addPath(path.deref(), mx);
    }

    void transformInPlace(const Matrix&);
};

void path_add_ctrlpoints(PathBuilder* dst, Span<const CtrlPoint>, bool doClose);

} // namespace

#endif
