/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/math.h"
#include "include/meta.h"
#include <string.h>

using namespace pentrek;

const Meta::Rec* Meta::find(const char name[], Type t) const {
    for (const auto& r : m_recs) {
        if (r.m_type == t && strcmp(name, r.m_name) == 0) {
            return &r;
        }
    }
    return nullptr;
}

Span<const float> Meta::findFloats(const char name[]) const {
    if (auto r = this->find(name, kFloats)) {
        return {(const float*)r->m_values, r->m_count};
    }
    return {nullptr, 0};
}

Span<const int32_t> Meta::findInts(const char name[]) const {
    if (auto r = this->find(name, kInts)) {
        return {(const int32_t*)r->m_values, r->m_count};
    }
    return {nullptr, 0};
}

Span<const uint8_t> Meta::findBytes(const char name[]) const {
    if (auto r = this->find(name, kBytes)) {
        return {(const uint8_t*)r->m_values, r->m_count};
    }
    return {nullptr, 0};
}

Span<const char> Meta::findString(const char name[]) const {
    if (auto r = this->find(name, kString)) {
        assert(r->m_count > 0);
        // we return the strlen in the "size" field of the span
        return {(const char*)r->m_values, r->m_count - 1};
    }
    return {nullptr, 0};
}

rcp<Data> Meta::findData(const char name[]) const {
    if (auto r = this->find(name, kData)) {
        assert(r->m_count == 1);
        Data* data = (Data*)r->m_values;
        return ref_rcp(data);
    }
    return nullptr;
}

float Meta::findFloat(const char name[], float missingValue) const {
    auto span = this->findFloats(name);
    return span.size() > 0 ? span[0] : missingValue;
}

int32_t Meta::findInt(const char name[], int32_t missingValue) const {
    auto span = this->findInts(name);
    return span.size() > 0 ? span[0] : missingValue;
}

/////////////////////

void Meta::Rec::deleteContents() {
    ::free(m_name);
    if (m_type == kData) {
        ((Data*)m_values)->unref();
    } else {
        ::free(m_values);
    }
}

bool Meta::remove(const char name[]) {
    auto iter = std::find_if(m_recs.begin(), m_recs.end(), [name](const Rec& r) {
        return strcmp(name, r.m_name) == 0;
    });
    if (iter != m_recs.end()) {
        iter->deleteContents();
        m_recs.erase(iter);
        return true;
    }
    return false;
}
                             
void Meta::removeAll() {
    for (auto& r : m_recs) {
        r.deleteContents();
    }
    m_recs.clear();
}

///////////////////////////

static void* malloc_copy(const void* src, size_t bytes) {
    void* dst = malloc(bytes);
    assert(dst);
    memcpy(dst, src, bytes);
    return dst;
}

size_t Meta::TypeSize(Type t) {
    const uint8_t sizes[] = {
        4, 4, 1, 1, 0,
    };
    assert((unsigned)t < 5);
    return sizes[t];
}

void* Meta::alloc(const char name[], size_t count, Type t) {
    this->remove(name);
    
    const size_t elemSize = TypeSize(t);
    void* values = nullptr;  // we store the Data* here later
    if (t == kData) {
        assert(count == 1);
        assert(elemSize == 0);
    } else {
        assert(elemSize > 0);
        values = malloc(count * elemSize);
    }

    Rec r {
        (char*)malloc_copy(name, strlen(name) + 1),
        values,
        castTo<uint32_t>(count),
        t,
    };
    m_recs.push_back(r);

    return r.m_values;
}


Span<float> Meta::allocFloats(const char name[], size_t count) {
    return {
        (float*)this->alloc(name, count, kFloats),
        castTo<uint32_t>(count)
    };
}

Span<int32_t> Meta::allocInts(const char name[], size_t count) {
    return {
        (int32_t*)this->alloc(name, count, kInts),
        castTo<uint32_t>(count)
    };
}

Span<uint8_t> Meta::allocBytes(const char name[], size_t count) {
    return {
        (uint8_t*)this->alloc(name, count, kBytes),
        castTo<uint32_t>(count)
    };
}

/////////////////////

void Meta::setFloats(const char name[], Span<const float> src) {
    auto dst = this->allocFloats(name, src.size());
    memcpy(dst.data(), src.data(), src.size() * sizeof(float));
}

void Meta::setInts(const char name[], Span<const int32_t> src) {
    auto dst = this->allocInts(name, src.size());
    memcpy(dst.data(), src.data(), src.size() * sizeof(int32_t));
}

void Meta::setBytes(const char name[], Span<const uint8_t> src) {
    auto dst = this->allocBytes(name, src.size());
    memcpy(dst.data(), src.data(), src.size() * sizeof(uint8_t));
}

void Meta::setString(const char name[], Span<const char> src) {
    auto dst = this->allocBytes(name, src.size() + 1);
    memcpy(dst.data(), src.data(), src.size());
    dst.data()[src.size()] = 0; // null terminator

    auto& r = m_recs.back();
    assert(r.m_type == kBytes);
    r.m_type = kString;
}

void Meta::setString(const char name[], const char string[]) {
    this->setString(name, {string, strlen(string)});
}

void Meta::setData(const char name[], rcp<Data> data) {
    this->alloc(name, 1, kData);
    m_recs.back().m_values = data.release();    // we become an owner
}

////////////////

void Meta::dump() const {
    const char type_char[] = {'F', 'I', 'B', 'S', 'D'};

    printf("Meta: \"%s\"\n", this->name().c_str());
    for (const auto& r : m_recs) {
        printf("  \"%s\": %c[%d]", r.m_name, type_char[r.m_type], r.m_count);
        switch (r.m_type) {
            case kFloats: {
                for (auto f : Span{(const float*)r.m_values, r.m_count}) {
                    printf(" %g", f);
                }
            } break;
            case kInts: {
                for (auto i : Span{(const int32_t*)r.m_values, r.m_count}) {
                    printf(" %d", i);
                }
            } break;
            case kBytes: {
                for (auto b : Span{(const uint8_t*)r.m_values, r.m_count}) {
                    printf(" %x", b);
                }
            } break;
            case kString:
                printf(" '%s'", (const char*)r.m_values);
                break;
            case kData: {
                auto data = (Data*)r.m_values;
                printf(" %zu", data->size());
            } break;
        }
        printf("\n");
    }
}

////////////////////

void Meta::Tests() {
#ifdef DEBUG
    Meta m("a");
    assert(m.name() == "a");
    
    assert(!m.hasFloats("f"));
    assert(m.findFloats("f").size() == 0);
    assert(m.findFloats("f").data() == nullptr);
    
    assert(!m.hasInts("i"));
    assert(m.findInts("i").size() == 0);
    assert(m.findInts("i").data() == nullptr);
    
    assert(!m.hasBytes("b"));
    assert(m.findBytes("b").size() == 0);
    assert(m.findBytes("b").data() == nullptr);
    
    float ff[3] = {1, 2, 3};
    m.setFloats("f", ff);
    assert(m.hasFloats("f"));
    auto s = m.findFloats("f");
    assert(s.size() == 3);
    assert(s[0] == 1);
    assert(s[1] == 2);
    assert(s[2] == 3);
    m.dump();
    assert(m.remove("f"));
    assert(!m.hasFloats("f"));
    
    assert(!m.hasString("foo"));
    m.setString("foo", "bar");
    assert(m.hasString("foo"));
    m.dump();
    m.remove("foo");
    assert(!m.hasString("foo"));
    
    {
        auto data = Data::Uninitialized(100);
        assert(data->debugging_refcnt() == 1);
        m.setData("data", data);
        assert(data->debugging_refcnt() == 2);
        m.dump();
        auto data2 = m.findData("data");
        assert(data2.get() == data.get());
        assert(data->debugging_refcnt() == 3);
        data2 = nullptr;
        assert(data->debugging_refcnt() == 2);
        assert(m.remove("data"));
        assert(data->debugging_refcnt() == 1);
    }
#endif
}
