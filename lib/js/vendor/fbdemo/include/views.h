/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_views_h_
#define _pentrek_views_h_

#include "include/point.h"
#include <functional>

namespace pentrek {

class Canvas;
class Click;
class Meta;

class View {
    View* m_parent = nullptr;
    Size m_size{0, 0};

    // This should only be used/seen by the parent...
    Point m_positionInParent{0, 0};

public:
    virtual ~View() {}

    View* parent() const { return m_parent; }
    void parent(View* newParent) {
        if (m_parent != newParent) {
            m_parent = newParent;
        }
    }
    
    Size size() const { return m_size; }
    float width() const { return m_size.width; }
    float height() const { return m_size.height; }
    void size(Size newSize) {
        if (m_size != newSize) {
            m_size = newSize;
            this->onSizeChanged();
        }
    }

    Point position() const { return m_positionInParent; }
    void position(Point p) {
        m_positionInParent = p;
    }

    Rect localBounds() const { return Rect::WH(m_size); }

    Rect bounds() const { return Rect::XYWH(m_positionInParent, m_size); }
    void bounds(Rect r) {
        this->size(r.size());
        this->position(r.TL());
    }

    void draw(Canvas* canvas);

    std::unique_ptr<Click> findClick(Point);

    bool handleMsg(const Meta&, Meta* reply = nullptr);

protected:
    virtual bool onHandleMsg(const Meta&, Meta*) { return false; }

    // called after the size has changed
    virtual void onSizeChanged() {}

    virtual void onDraw(Canvas*) {}
    virtual std::unique_ptr<Click> onFindClick(Point) { return nullptr; }

    virtual void onDrawChildren(Canvas*) {}
    virtual std::unique_ptr<Click> onFindChildrenClick(Point) { return nullptr; }
};

class GroupView : public View {
    std::vector<std::unique_ptr<View>> m_children;

    View* insertChildView(size_t, std::unique_ptr<View>);

public:
    size_t countChildren() const { return m_children.size(); }

    View* childAt(size_t index) const {
        assert(index < m_children.size());
        return m_children[index].get();
    }
    
    int findChild(View* view) const;    // returns -1 if not found

    template <typename T> T* insertChild(size_t atIndex, std::unique_ptr<T> child) {
        return (T*)this->insertChildView(atIndex, std::move(child));
    }

    template <typename T> T* addChildToFront(std::unique_ptr<T> child) {
        return this->insertChild(0, std::move(child));
    }
    template <typename T> T* addChildToBack(std::unique_ptr<T> child) {
        return this->insertChild(m_children.size(), std::move(child));
    }

    std::unique_ptr<View> detachChild(size_t index);
    void deleteAllChildren();

protected:
    void onDrawChildren(Canvas*) override;
    std::unique_ptr<Click> onFindChildrenClick(Point p) override;

    virtual void onChildAdded(View* child, size_t index) {}
    virtual void onChildRemoved(View* child, size_t index) {}

    Rect computeChildrenBounds() const;
};

class HStack : public GroupView {
public:

protected:
    void onChildAdded(View*, size_t index) override;
    void onChildRemoved(View*, size_t index) override;
};

class VStack : public GroupView {
public:

protected:
    void onChildAdded(View* child, size_t index) override;
    void onChildRemoved(View*, size_t index) override;
};

class Click {
public:
    Point m_orig, m_prev, m_curr;
    View* m_view;

    Click(Point p, View* v) : m_orig(p), m_view(v) {
        m_prev = m_curr = p;
    }
    virtual ~Click() {}
    
    void moved(Point);
    void up();

    using Func = std::function<void(Click*, bool up)>;
    static std::unique_ptr<Click> Make(Point, Func);
    static std::unique_ptr<Click> Make(Point, View*, Func);

protected:
    virtual void onMoved() {}
    virtual void onUp() {}
};

} // namespace

#endif
