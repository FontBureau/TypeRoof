/*
 * Copyright 2022 Pentrek Inc.
 */

#ifndef _pentrek_span_h_
#define _pentrek_span_h_

#include "include/pentrek_types.h"

#include <initializer_list>
#include <iterator>
#include <type_traits>

namespace pentrek {

/*
 *  Span class (in preparation for std::span, borrowed from Skia's SkSpan)
 */
template <typename T> class Span {
private:
    T*     m_ptr;
    size_t m_size;

public:
    constexpr Span() : m_ptr(nullptr), m_size(0) {}
    constexpr Span(T* ptr, size_t size) : m_ptr(ptr), m_size(size) {}
    constexpr Span(const Span&) = default;
    template<size_t N> constexpr Span(T(&a)[N]) : Span(a, N) {}
    constexpr Span(std::initializer_list<T> src) : Span(std::data(src), std::size(src)) {}

    template <typename U, typename = typename std::enable_if<std::is_same<const U, T>::value>::type>
    constexpr Span(const Span<U>& src) : m_ptr(std::data(src)), m_size(std::size(src)) {}

    template <typename Container>
    constexpr Span(Container& c) : Span(std::data(c), std::size(c)) {}

    constexpr T& operator [](size_t i) const {
        assert(i < m_size);
        return m_ptr[i];
    }

    constexpr T& front() const { return (*this)[0]; }
    constexpr T& back() const { return (*this)[m_size - 1]; }

    constexpr T* begin() const { return m_ptr; }
    constexpr T* end() const { return m_ptr + m_size; }
    constexpr auto rbegin() const { return std::make_reverse_iterator(this->end()); }
    constexpr auto rend() const { return std::make_reverse_iterator(this->begin()); }
    constexpr T* data() const { return this->begin(); }
    constexpr size_t size() const { return m_size; }
    constexpr bool empty() const { return m_size == 0; }
    constexpr size_t size_bytes() const { return m_size * sizeof(T); }

    constexpr Span<T> subspan(size_t offset, size_t count) const {
        assert(offset <= m_size);
        assert(count <= m_size - offset);
        return Span(m_ptr + offset, count);
    }
    
    bool operator==(const Span& o) const {
        if (m_size == o.m_size) {
            for (size_t i = 0; i < m_size; ++i) {
                if ((*this)[i] != o[i]) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
};

} // namespace

#endif
