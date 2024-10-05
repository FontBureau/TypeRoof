/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_refcnt_h_
#define _pentrek_refcnt_h_

#include "include/pentrek_types.h"

namespace pentrek {

/*
 *  Reference counting base class, borrowing from Skia's SkRefCnt
 */
class RefCnt {
public:
    RefCnt() : m_refcnt(1) {}
    
    virtual ~RefCnt() {
        assert(this->debugging_refcnt() == 1);
    }
    
    int32_t debugging_refcnt() const {
        return m_refcnt.load(std::memory_order_relaxed);
    }
    
    void ref() const {
        (void)m_refcnt.fetch_add(+1, std::memory_order_relaxed);
    }
    
    void unref() const {
        if (1 == m_refcnt.fetch_add(-1, std::memory_order_acq_rel)) {
#ifdef DEBUG
            // restore this to 1 so we don't assert in the destructor
            m_refcnt.store(1, std::memory_order_relaxed);
#endif
            delete this;
        }
    }

    static void Tests();

private:
    mutable std::atomic<int32_t> m_refcnt;
    
    RefCnt(RefCnt&&) = delete;
    RefCnt(const RefCnt&) = delete;
    RefCnt& operator=(RefCnt&&) = delete;
    RefCnt& operator=(const RefCnt&) = delete;
};

///////////////////////////////////////////////////////////////////////////////

/** Call obj->ref() and return obj. The obj must not be nullptr.
 */
template <typename T> static inline T* SkRef(T* obj) {
    assert(obj);
    obj->ref();
    return obj;
}

/** Check if the argument is non-null, and if so, call obj->ref() and return obj.
 */
template <typename T> static inline T* safe_ref(T* obj) {
    if (obj) {
        obj->ref();
    }
    return obj;
}

/** Check if the argument is non-null, and if so, call obj->unref()
 */
template <typename T> static inline void safe_unref(T* obj) {
    if (obj) {
        obj->unref();
    }
}

template <typename T> class rcp {
public:
    using element_type = T;
    
    constexpr rcp() : m_ptr(nullptr) {}
    constexpr rcp(std::nullptr_t) : m_ptr(nullptr) {}
    rcp(const rcp<T>& o) : m_ptr(safe_ref(o.get())) {}
    template <typename U,
    typename = typename std::enable_if<std::is_convertible<U*, T*>::value>::type>
    rcp(const rcp<U>& o) : m_ptr(safe_ref(o.get())) {}
    rcp(rcp<T>&& o) : m_ptr(o.release()) {}
    template <typename U,
    typename = typename std::enable_if<std::is_convertible<U*, T*>::value>::type>
    rcp(rcp<U>&& o) : m_ptr(o.release()) {}
    
    // Note: the constructor does NOT ref the argument, it just assumes ownership
    explicit rcp(T* obj) : m_ptr(obj) {}
    
    ~rcp() {
        safe_unref(m_ptr);
#ifdef DEBUG
        m_ptr = nullptr;
#endif
    }
    
    rcp<T>& operator=(std::nullptr_t) { this->reset(); return *this; }
    rcp<T>& operator=(const rcp<T>& o) {
        if (this != &o) {
            this->reset(safe_ref(o.get()));
        }
        return *this;
    }
    template <typename U,
    typename = typename std::enable_if<std::is_convertible<U*, T*>::value>::type>
    rcp<T>& operator=(const rcp<U>& o) {
        this->reset(safe_ref(o.get()));
        return *this;
    }
    
    rcp<T>& operator=(rcp<T>&& o) {
        this->reset(o.release());
        return *this;
    }
    template <typename U,
    typename = typename std::enable_if<std::is_convertible<U*, T*>::value>::type>
    rcp<T>& operator=(rcp<U>&& o) {
        this->reset(o.release());
        return *this;
    }
    
    T& operator*() const {
        assert(this->get() != nullptr);
        return *this->get();
    }
    
    explicit operator bool() const { return this->get() != nullptr; }
    
    T* get() const { return m_ptr; }
    T* operator->() const { return m_ptr; }
    
    T& deref() const {
        assert(m_ptr);
        return *m_ptr;
    }
    
    bool operator==(const rcp<T>& o) const {
        return this->get() == o.get();
    }
    bool operator!=(const rcp<T>& o) const { return !(*this == o); }

    // Like our bare constructor, just accepts ownership, does not call ref
    void reset(T* obj = nullptr) {
        T* prevPtr = m_ptr;
        m_ptr = obj;
        safe_unref(prevPtr);
    }
    
    // Detaches the pointer, transfering ownership to the caller.
    T* release() {
        T* ptr = m_ptr;
        m_ptr = nullptr;
        return ptr;
    }
    
    void swap(rcp<T>& o) {
        std::swap(m_ptr, o.m_ptr);
    }

private:
    T*  m_ptr;
};

#if 0
template <typename T> inline void swap(sk_sp<T>& a, sk_sp<T>& b) /*noexcept*/ {
    a.swap(b);
}

template <typename T, typename U> inline bool operator==(const sk_sp<T>& a, const sk_sp<U>& b) {
    return a.get() == b.get();
}
template <typename T> inline bool operator==(const sk_sp<T>& a, std::nullptr_t) /*noexcept*/ {
    return !a;
}
template <typename T> inline bool operator==(std::nullptr_t, const sk_sp<T>& b) /*noexcept*/ {
    return !b;
}

template <typename T, typename U> inline bool operator!=(const sk_sp<T>& a, const sk_sp<U>& b) {
    return a.get() != b.get();
}
template <typename T> inline bool operator!=(const sk_sp<T>& a, std::nullptr_t) /*noexcept*/ {
    return static_cast<bool>(a);
}
template <typename T> inline bool operator!=(std::nullptr_t, const sk_sp<T>& b) /*noexcept*/ {
    return static_cast<bool>(b);
}

template <typename C, typename CT, typename T>
auto operator<<(std::basic_ostream<C, CT>& os, const sk_sp<T>& sp) -> decltype(os << sp.get()) {
    return os << sp.get();
}
#endif

template <typename T, typename... Args> rcp<T> make_rcp(Args&&... args) {
    return rcp<T>(new T(std::forward<Args>(args)...));
}

// Create a new rcp<> and ref the argument
// (as opposed to the constructor for rcp, which doesn't ref the argument)
template <typename T> rcp<T> ref_rcp(T* obj) {
    return rcp<T>(safe_ref(obj));
}
template <typename T> rcp<T> ref_rcp(const T* obj) {
    return rcp<T>(safe_ref(const_cast<T*>(obj)));
}
template <typename T> rcp<T> ref_rcp(const T& obj) {
    return rcp<T>(safe_ref(const_cast<T*>(&obj)));
}

} // namespace

#endif
