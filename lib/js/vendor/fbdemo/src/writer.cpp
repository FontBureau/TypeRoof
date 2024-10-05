/*
 * Copyright 2022 Pentrek Inc.
 */

#include "include/writer.h"
#include <cstdio>
#include <stdarg.h>

using namespace pentrek;

void Writer::writef(const char format[], ...) {
    va_list args;
    va_start(args, format);
    
    constexpr size_t N = 256;
    char stack[N + 1];
    int n = std::vsnprintf(stack, N + 1, format, args);
    if (n < 0) {
        printf("Writer::writef failed with '%s'\n", format);
        va_end(args);
        return;
    }
    
    if (n > N) {
        std::vector<char> heap(n + 1);
        int n2 = std::vsnprintf(heap.data(), n + 1, format, args);
        assert(n == n2);
        this->write({heap.data(), castTo<size_t>(n2)});
    } else {
        this->write({stack, castTo<size_t>(n)});
    }
    
    va_end(args);
}

//////////////////////////////

void MemoryWriter::reset() {
    m_storage.resize(0);
}

rcp<Data> MemoryWriter::copy() const {
    return Data::Copy(this->bspan());
}

rcp<Data> MemoryWriter::detach() {
    // todo: can we "detach" from m_storage, and not have to copy it?
    auto data = Data::Copy(this->bspan());
    m_storage.resize(0);
    return data;
}


void MemoryWriter::write(Span<const char> src) {
    m_storage.insert(m_storage.end(), src.begin(), src.end());
}

void PrintfWriter::write(Span<const char> src) {
    printf("%.*s", (int)src.size(), src.data());
}

FileWriter::FileWriter(const char path[]) {
    m_FILE = ::fopen(path, "wb");
}

void FileWriter::close() {
    if (m_FILE) {
        ::fclose(m_FILE);
        m_FILE = nullptr;
    }
}

void FileWriter::write(Span<const char> src) {
    if (m_FILE) {
        ::fwrite(src.data(), 1, src.size(), m_FILE);
    }
}

////////////////////////////

void Writer::Tests() {
    MemoryWriter w;
    w.write({"Hello", 5});
    assert(w.size() == 5);
    assert(memcmp(w.cspan().data(), "Hello", 5) == 0);

    w.writef(" %d", 24);
    assert(w.size() == 8);
    assert(memcmp(w.cspan().data(), "Hello 24", 8) == 0);
    
    auto data = w.detach();
    
    PrintfWriter pfw;
    pfw.write(data->cspan());
    pfw.write("\n");
}
