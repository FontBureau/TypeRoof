/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_meta_h_
#define _pentrek_meta_h_

#include "include/data.h"
#include "include/span.h"
#include <string>
#include <vector>

namespace pentrek {

class Meta {
    Span<float>   allocFloats(const char name[], size_t);
    Span<int32_t> allocInts(const char name[], size_t);
    Span<uint8_t> allocBytes(const char name[], size_t);

public:
    Meta(const char name[]) : m_name(name) {}
    Meta(const Meta&) = delete;
    Meta(Meta&&) = delete;
    ~Meta() { this->removeAll(); }

    const std::string& name() const { return m_name; }
    bool isNamed(const char str[]) const {
        return m_name == str;
    }
    
    Span<const float> findFloats(const char[]) const;
    Span<const int32_t> findInts(const char[]) const;
    Span<const uint8_t> findBytes(const char[]) const;
    Span<const char> findString(const char[]) const;    // span.size() is strlen
    rcp<Data> findData(const char[]) const;

    bool hasFloats(const char name[]) const {
        return this->findFloats(name).data() != nullptr;
    }
    bool hasInts(const char name[]) const {
        return this->findInts(name).data() != nullptr;
    }
    bool hasBytes(const char name[]) const {
        return this->findBytes(name).data() != nullptr;
    }
    bool hasString(const char name[]) const {
        return this->findString(name).data() != nullptr;
    }
    bool hasData(const char[]) const;

    float findFloat(const char name[],
                    float missingValue = std::numeric_limits<float>::infinity()) const;
    int32_t findInt(const char name[], int32_t missingValue = 0x80000000) const;

    void setFloats(const char name[], Span<const float>);
    void setInts(const char name[], Span<const int32_t>);
    void setBytes(const char name[], Span<const uint8_t>);
    void setString(const char name[], const char value[]);
    void setString(const char name[], Span<const char>);
    void setData(const char name[], rcp<Data>);

    void setFloat(const char name[], float value) {
        this->setFloats(name, {&value, 1});
    }
    void setInt(const char name[], int32_t value) {
        this->setInts(name, {&value, 1});
    }

    bool remove(const char name[]);
    void removeAll();

    void dump() const;

    static void Tests();

private:
    std::string m_name;

    enum Type {
        kFloats,
        kInts,
        kBytes,
        kString,
        kData,
    };
    
    struct Rec {
        char*       m_name;     // malloc
        void*       m_values;   // malloc or Data*
        uint32_t    m_count;    // must be 1 if kData or kString
        Type        m_type;
        
        void deleteContents();
    };
    std::vector<Rec> m_recs;
    
    static size_t TypeSize(Type t);
    void* alloc(const char name[], size_t count, Type t);
    const Rec* find(const char name[], Type) const;
};

} // namespace

#endif
