/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/data.h"
#include <stdio.h>

using namespace pentrek;

Data::Data(Span<uint8_t> buffer, FreeProc proc, void* client)
    : m_buffer(buffer)
    , m_freeProc(proc)
    , m_clientData(client)
{}

Data::~Data() {
    if (m_freeProc) {
        m_freeProc(m_buffer.data(), m_buffer.size(), m_clientData);
    }
}

////////////////////////////

static void newarray_freeproc(void* buffer, size_t, void*) {
    delete[] (uint8_t*)buffer;;
}

static void frommalloc_freeproc(void* buffer, size_t, void*) {
    ::free(buffer);
}

rcp<Data> Data::Empty() {
    static Data* gEmptyData;
    if (!gEmptyData) {
        gEmptyData = new Data({nullptr, 0}, nullptr, nullptr);
    }
    return ref_rcp(gEmptyData);
}

rcp<Data> Data::Managed(Span<const uint8_t> buffer, FreeProc proc, void* client) {
    uint8_t* data = const_cast<uint8_t*>(buffer.data());
    return rcp<Data>(new Data(Span{data, buffer.size()}, proc, client));
}

rcp<Data> Data::FromMalloc(Span<const uint8_t> buffer) {
    return Managed(buffer, frommalloc_freeproc, nullptr);
}

rcp<Data> Data::Unmanaged(Span<const uint8_t> buffer) {
    if (buffer.size() == 0) {
        return Empty();
    }
    return Managed(buffer, nullptr, nullptr);
}

rcp<Data> Data::Uninitialized(size_t size) {
    if (size == 0) {
        return Empty();
    }
    uint8_t* ptr = new uint8_t[size];
    return Managed({ptr, size}, newarray_freeproc, nullptr);
}

rcp<Data> Data::Copy(Span<const uint8_t> src) {
    auto data = Uninitialized(src.size());
    memcpy(data->writable_data(), src.data(), src.size());
    return data;
}

rcp<Data> Data::File(const char path[]) {
    FILE* f = fopen(path, "rb");
    if (!f) {
        return nullptr;
    }

    fseek(f, 0, SEEK_END);
    size_t size = ftell(f);
    fseek(f, 0, SEEK_SET);
    auto data = Data::Uninitialized(size);
    fread(data->writable_data(), size, 1, f);
    fclose(f);
    return data;
}

////////////////////////

static void test_empty() {
    auto d = Data::Empty();
    assert(d->size() == 0);
    
    // test that we are sharing empties

    auto d2 = Data::Empty();
    assert(d.get() == d2.get());

    d2 = Data::Uninitialized(0);
    assert(d.get() == d2.get());

    d2 = Data::Copy({nullptr, 0});
    assert(d.get() == d2.get());

    d2 = Data::Unmanaged({nullptr, 0});
    assert(d.get() == d2.get());
    
    // test that we *don't* share managed empties (in case the caller cared)

    d2 = Data::Managed({nullptr, 0}, [](void*, size_t, void*){}, nullptr);
    assert(d.get() != d2.get());
}

void Data::Tests() {
    test_empty();
    
    uint8_t bufferStorage[1];

    struct Rec {
        void* buffer;
        size_t size;
    };
    Rec rec = {bufferStorage, 1};

    auto proc = [](void* buffer, size_t size, void* client) {
        Rec* r = (Rec*)client;

        assert(buffer == r->buffer);
        assert(size == r->size);
        r->size = 0; // signal that we were called
    };

    auto d = Data::Managed({bufferStorage, 1}, proc, &rec);
    assert(d->size() == 1);
    assert(d->data() == bufferStorage);

    assert(rec.size == 1);
    d = nullptr;
    assert(rec.size == 0);
}
