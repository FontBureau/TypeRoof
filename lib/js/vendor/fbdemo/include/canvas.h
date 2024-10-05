/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_canvas_h_
#define _pentrek_canvas_h_

#include "include/matrix.h"
#include "include/paint.h"
#include "include/path.h"

namespace pentrek {

class Canvas {
public:
    virtual ~Canvas() {}
    
    void save();
    void restore();
    
    int saveCount() const { return m_saveCount; }
    void restoreToCount(int);

    void translate(Point);
    void scale(Point);
    void rotate(float radians);
    void concat(const Matrix&);

    void clipRect(const Rect&);
    void clipPath(const Path&);
    void clipPath(const rcp<const Path>& path) { this->clipPath(*path.get()); }

    void drawRect(const Rect&, const Paint&);
    void drawOval(const Rect&, const Paint&);
    void drawCircle(Point center, float radius, const Paint&);
    void drawPoly(Span<const Point>, bool doClose, const Paint&);
    void drawPath(const Path&, const Paint&);
    void drawPath(const rcp<const Path>& path, const Paint& paint) {
        this->drawPath(*path.get(), paint);
    }

    void drawPoints(Span<const Point>, const Paint&);
    void drawPoint(Point, const Paint&);
    void drawLine(Point, Point, const Paint&);

    class AutoRestore {
        Canvas* m_canvas;
        const int m_prevSaveCount;
    public:
        AutoRestore(Canvas* canvas, bool doSave = true)
            : m_canvas(canvas)
            , m_prevSaveCount(canvas->saveCount())
        {
            if (doSave) {
                canvas->save();
            }
        }
        ~AutoRestore() {
            this->restore();
        }
        
        void restore() {
            if (m_canvas) {
                m_canvas->restoreToCount(m_prevSaveCount);
                m_canvas = nullptr;
            }
        }
    };

    void translate(float x, float y) { this->translate({x, y}); }
    void scale(float x, float y) { this->scale({x, y}); }

protected:
    virtual void onSave() = 0;
    virtual void onRestore() = 0;

    virtual void onConcat(const Matrix&) = 0;    
    virtual void onClipRect(const Rect&);
    virtual void onClipPath(const Path&) = 0;
    
    virtual void onDrawRect(const Rect&, const Paint&);
    virtual void onDrawPath(const Path&, const Paint&) = 0;

private:
    int m_saveCount = 0;
};

}
#endif
