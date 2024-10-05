/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_data_h_
#define _pentrek_data_h_

#include "include/refcnt.h"
#include "include/span.h"

namespace pentrek {

class Data : public RefCnt {
public:
    ~Data() override;
    
    using FreeProc = void (*)(void* buffer, size_t bufferSize, void* clientData);
    
    static rcp<Data> Empty();
    static rcp<Data> Uninitialized(size_t size);
    static rcp<Data> Copy(Span<const uint8_t>);
    static rcp<Data> Managed(Span<const uint8_t>, FreeProc, void* clientData);
    static rcp<Data> FromMalloc(Span<const uint8_t>);
    static rcp<Data> Unmanaged(Span<const uint8_t>);
    static rcp<Data> File(const char path[]);
    
    size_t size() const { return m_buffer.size(); }
    const void* data() const { return m_buffer.data(); }
    void* writable_data() const { return m_buffer.data(); }

    const char* chars() const { return (const char*)this->data(); }

    Span<const char> cspan() const { return {(const char*)m_buffer.data(), m_buffer.size()}; }
    Span<const uint8_t> bspan() const { return m_buffer; }
    
    static void Tests();

private:
    Data(Span<uint8_t>, FreeProc, void*);
    
    Span<uint8_t> m_buffer;
    FreeProc m_freeProc;
    void* m_clientData;
};

} // namespace

#endif
