/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/unique_id.h"

using namespace pentrek;

static uint32_t next_unique_id() {
    static std::atomic<int32_t> gUniqueID;
 
    // it begins life with 0, so we always add 1 so that
    // we never return a zero.
    return 1 + gUniqueID.fetch_add(+1, std::memory_order_relaxed);
}

UniqueIDRefCnt::UniqueIDRefCnt() : m_uniqueID(next_unique_id()) {}

namespace {

class Foo : public RefCnt {
public:
    int* m_signal = nullptr;

    Foo(int* signal) : m_signal(signal) {
        *m_signal = 1;
    }
    ~Foo() override {
        *m_signal = -1;
    }
    
    void method() {}
};

}

void RefCnt::Tests() {
    int signal = 0;
    
    assert(signal == 0);
    {
        Foo f(&signal);
        assert(signal == 1);
    }
    assert(signal == -1);

    {
        rcp<Foo> sp;
        assert(sp.get() == nullptr);
    }
    
    signal = 0;
    {
        auto sp = make_rcp<Foo>(&signal);
        assert(signal == 1);
        assert(sp->debugging_refcnt() == 1);
        sp->method();
        
        {
            auto sp2 = sp;
            assert(sp.get() == sp2.get());
            assert(sp->debugging_refcnt() == 2);
            assert(sp2->debugging_refcnt() == 2);
            assert(signal == 1);
        }
        assert(sp->debugging_refcnt() == 1);
        assert(signal == 1);
    }
    assert(signal == -1);
}
