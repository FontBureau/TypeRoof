/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_content_h_
#define _pentrek_content_h_

#include "include/canvas.h"
#include "include/events.h"
#include "include/fonts.h"
#include "include/refcnt.h"
#include "include/views.h"
#include <string>

namespace pentrek {

class Button : public View {
public:
    using Notify = std::function<void()>;
    void setNotify(Notify p) { m_notify = p; }

protected:
    void onDraw(Canvas* canvas) override;
    std::unique_ptr<Click> onFindClick(Point p) override;

private:
    Notify m_notify = [](){};
    Color  m_color = Color_black;
    bool   m_hilite = false;
};

class LabelView : public View {
public:
    LabelView();

    void text(Span<const char>);
    void text(const char str[]) { this->text({str, strlen(str)}); }
    
    void fontSize(float s);
    void font(rcp<Font>);
    void color(const Color&);
    void align(float);
    
protected:
    void onDraw(Canvas* canvas) override;

private:
    std::vector<char> m_text;
    std::vector<rcp<Path>> m_paths;
    rcp<Font> m_font;
    Color m_color = Color_black;
    float m_textSize = 12;
    float m_align = 0;
    bool m_dirty = true;
};

class FloatingGroup : public View {
public:
    void showChild(bool show);
    // returns previous child (or null)
    std::unique_ptr<View> setChild(std::unique_ptr<View> ch);

protected:
    void onDraw(Canvas*) override;
    std::unique_ptr<Click> onFindClick(Point) override;

private:
    void reLayout();

    std::unique_ptr<View> m_child;
    bool m_childIsVisible = true;
    Point m_drag{0, 0};
};

class Slider : public View {
    void setDefaultSize();
    
public:
    using Notify = std::function<void(Slider*, float)>;
    
    Slider();
    Slider(float min, float max);
    
    float value() const { return m_value; }
    bool value(float v) {
        if (m_value != v) {
            m_value = v;
            return true;
        }
        return false;
    }
    
    float min() const { return m_min; }
    float max() const { return m_max; }
    void minmax(float min, float max) {
        m_min = min;
        m_max = max;
        assert(min < max);
    }
    
    bool isTracking() const { return m_isTracking; }

    void notify(Notify p) { m_notify = p; }
    
    void setTicks(Span<const float>);
    
    
protected:
    void onDraw(Canvas*) override;
    std::unique_ptr<Click> onFindClick(Point) override;
    
private:
    bool handleClick(Point);

    Notify m_notify;
    std::vector<float> m_ticks;
    float m_min = 0,
          m_max = 1,
          m_value = 0;
    bool m_isTracking = false;
};

class CubicInterpView : public View {
public:
    CubicInterpView();
    
    bool enabled() const { return m_enabled; }
    void enabled(bool enable) { m_enabled = enable; }
    
    Span<const Point> pts() const { return m_pts; }
    void pts(Point p0, Point p1);
    void pts(Span<const Point> pts) {
        assert(pts.size() == 2);
        this->pts(pts[0], pts[1]);
    }
    void resetPts();    // to default

    using Notify = std::function<void(CubicInterpView*, Point a, Point b)>;
    void notify(Notify n) { m_notify = n; }

protected:
    void onDraw(Canvas*) override;
    std::unique_ptr<Click> onFindClick(Point) override;

private:
    Notify m_notify;
    Point m_pts[2];
    bool m_enabled = true;
};

class Content : public GroupView {
    Size m_size;
    std::string m_title;
    double m_absSecs = 0;

    static void RequestDraw(Content*);

public:
    Content() {}
    Content(std::string s) : m_title(s) {}
    virtual ~Content() {}
    
    void requestDraw();

    Size size() const { return m_size; }
    Rect bounds() const { return Rect::WH(m_size); }
    std::string title() const { return m_title; }

    double absSecs() const { return m_absSecs; }

    void setSize(Size newSize) {
        if (m_size != newSize) {
            m_size = newSize;
            this->onSizeChanged();
        }
    }
    
    void setTitle(std::string s) { m_title = s; }

    bool keyDown(const KeyEvent& e) {
    //    printf("keydown:%c %d code:%d %x\n", e.uni(), e.raw(), e.code(), e.modi());

        return this->onKeyDown(e);
    }

    void setAbsTime(double secs) {
        m_absSecs = secs;
    }
    
    void handleHover(Point);

    static void WriteToClipboard(Span<const char>);

    static int Count();
    static std::unique_ptr<Content> Make(int);

protected:
    virtual bool onKeyDown(const KeyEvent&);
    virtual void onHover(Point) {}
};

static inline bool nearly_eq(Point a, Point b, float tol) {
    return (a - b).length() <= tol;
}

} // namespace

#endif
