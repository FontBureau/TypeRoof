/*
 * Copyright 2022 Pentrek Inc.
 */

#ifndef _pentrek_writer_h_
#define _pentrek_writer_h_

#include "include/data.h"
#include "include/span.h"
#include <vector>

namespace pentrek {

class Writer {
public:
    virtual ~Writer() {}
    virtual void write(Span<const char>) = 0;

    void writec(char c) {
        this->write({&c, 1});
    }
    void write(const char str[]) {
        this->write({str, strlen(str)});
    }
    
    void writef(const char format[], ...);
    
    void tab(int n) {
        for (int i = 0; i < n; ++i) {
            this->write({"    ", 4});
        }
    }

    static void Tests();
};

class MemoryWriter : public Writer {
    std::vector<char> m_storage;
    
public:
    size_t size() const { return m_storage.size(); }
    Span<const char> cspan() const { return m_storage; }
    Span<const uint8_t> bspan() const {
        return { (const uint8_t*)m_storage.data(), m_storage.size() };
    }
    
    void reset();           // deletes internal storage
    rcp<Data> copy() const; // returns as Data, but retains its storage
    rcp<Data> detach();     // returns as Data and free's its storage
    
    void write(Span<const char>) override;
};

class PrintfWriter : public Writer {
public:
    void write(Span<const char>) override;
};

class FileWriter : public Writer {
    FILE* m_FILE;

public:
    FileWriter(const char path[]);
    ~FileWriter() override { this->close(); }
    
    bool valid() const { return m_FILE != nullptr; }
    void close();

    void write(Span<const char>) override;
};

} // namespace

#endif
