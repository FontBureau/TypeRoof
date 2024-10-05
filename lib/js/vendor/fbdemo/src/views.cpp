/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/canvas.h"
#include "include/meta.h"
#include "include/views.h"

using namespace pentrek;

void View::draw(Canvas* canvas) {
    Canvas::AutoRestore acr(canvas);
    canvas->translate(m_positionInParent);

    {
        Canvas::AutoRestore acr2(canvas);
        this->onDraw(canvas);
    }
    {
        Canvas::AutoRestore acr3(canvas);
        this->onDrawChildren(canvas);
    }
}

std::unique_ptr<Click> View::findClick(Point p) {
    p -= m_positionInParent;
    if (auto c = this->onFindChildrenClick(p)) {
        return c;
    }
    return this->onFindClick(p);
}

bool View::handleMsg(const Meta& msg, Meta* reply) {
    return this->onHandleMsg(msg, reply);
}

//////////////////////////////

int GroupView::findChild(View* view) const {
    for (size_t i = 0; i < m_children.size(); ++i) {
        if (m_children[i].get() == view) {
            return (int)i;
        }
    }
    return -1;
}

View* GroupView::insertChildView(size_t index, std::unique_ptr<View> child) {
    assert(child->parent() == nullptr);
    child->parent(this);

    assert(index <= m_children.size());
    auto ptr = child.get();
    m_children.insert(m_children.begin() + index, std::move(child));
    this->onChildAdded(ptr, index);
    
    return this->childAt(index); // can't use 'child' after its been moved
}

std::unique_ptr<View> GroupView::detachChild(size_t index) {
    assert(index < m_children.size());
    auto child = std::move(m_children[index]);
    child->parent(nullptr);

    m_children.erase(m_children.begin() + index);
    this->onChildRemoved(child.get(), index);
    return child;
}

void GroupView::deleteAllChildren() {
    while (m_children.size()) {
        size_t n = m_children.size();

        // we allow the returned child to delete itself
        (void)this->detachChild(n - 1);
        
        // make sure our subclass isn't re-adding children while we do this loop
        assert(m_children.size() == n - 1);
    }
}

void GroupView::onDrawChildren(Canvas* canvas) {
    auto iter = m_children.begin();
    auto stop = m_children.end();
    for (; iter != stop; ++iter) {
        (*iter)->draw(canvas);
    }
}

std::unique_ptr<Click> GroupView::onFindChildrenClick(Point p) {
    // visit front-to-back
    auto iter = m_children.rbegin();
    auto stop = m_children.rend();
    for (; iter != stop; ++iter) {
        if (auto click = (*iter)->findClick(p)) {
            return click;
        }
    }
    return nullptr;
}

Rect GroupView::computeChildrenBounds() const {
    if (m_children.size() == 0) {
        return Rect::Empty();
    }
    
    auto iter = m_children.begin();
    auto stop = m_children.end();
    Rect bounds = (*iter)->bounds();
    for (++iter; iter != stop; ++iter) {
        bounds = bounds.join((*iter)->bounds());
    }
    return bounds;
}

////////////////////////////

void HStack::onChildAdded(View* view, size_t index) {
    assert(view->parent() == this);

    Rect bounds = index > 0 ? this->childAt(index - 1)->bounds() : Rect::Empty();
    // for now, just top-align the children
    for (; index < this->countChildren(); ++index) {
        auto child = this->childAt(index);
        child->position({bounds.right, 0});
        bounds.right += child->width();
    }
    this->size(this->computeChildrenBounds().BR().asSize());
}

void HStack::onChildRemoved(View* child, size_t index) {
    assert(child->parent() == nullptr);
    const auto w = child->width();

    for (; index < this->countChildren(); ++index) {
        auto child = this->childAt(index);
        child->position(child->position() -= {w, 0});
    }
    this->size(this->computeChildrenBounds().BR().asSize());
}

////////////////////////////

void VStack::onChildAdded(View* view, size_t index) {
    assert(view->parent() == this);

    Rect bounds = index > 0 ? this->childAt(index - 1)->bounds() : Rect::Empty();
    // for now, just left-align the children
    for (; index < this->countChildren(); ++index) {
        auto child = this->childAt(index);
        child->position({0, bounds.bottom});
        bounds.bottom += child->height();
    }
    this->size(this->computeChildrenBounds().BR().asSize());
}

void VStack::onChildRemoved(View* child, size_t index) {
    assert(child->parent() == nullptr);
    const auto h = child->height();

    for (; index < this->countChildren(); ++index) {
        auto child = this->childAt(index);
        child->position(child->position() -= {0, h});
    }
    this->size(this->computeChildrenBounds().BR().asSize());
}

////////////////////////////////////////

void Click::moved(Point p) {
    View* v = m_view;
    while (v) {
        p -= v->position();
        v = v->parent();
    }

    m_prev = m_curr;
    m_curr = p;
    this->onMoved();
}

void Click::up() {
    m_prev = m_curr;
    this->onUp();
}

class FuncClick : public Click {
    Func m_func;

public:
    FuncClick(Point p, Func f, View* v) : Click(p, v), m_func(f) {}

    void onMoved() override { m_func(this, false); }
    void onUp() override { m_func(this, true); }
};

std::unique_ptr<Click> Click::Make(Point p, View* v, Func f) {
    return std::make_unique<FuncClick>(p, f, v);
}

std::unique_ptr<Click> Click::Make(Point p, Func f) {
    return std::make_unique<FuncClick>(p, f, nullptr);
}
