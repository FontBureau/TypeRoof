/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_array_h_
#define _pentrek_array_h_

#include "include/pentrek_types.h"
#include <vector>

#ifdef DEBUG
    #define PENTREK_ARRAY_ADD_ASSERTS
#endif

namespace pentrek {

#ifdef PENTREK_ARRAY_ADD_ASSERTS

template <typename T> class Array : public std::vector<T> {
    using INHERITED = std::vector<T>;
public:
    Array() : INHERITED() {}
    explicit Array(size_t size) : INHERITED(size) {}
    Array(std::initializer_list<T> init) : INHERITED(init) {}
    
    template <class InputIt>
    Array(InputIt first, InputIt last) : INHERITED(first, last) {}

    Array(const Array& o) : INHERITED(o) {}
    Array(const INHERITED& o) : INHERITED(o) {}
    
    Array(Array&& o) : INHERITED(o) {}
    Array(INHERITED&& o) : INHERITED(o) {}
    
    Array& operator=(const Array& o) {
        INHERITED::operator=(o);
        return *this;
    }
    
    const T& operator[](size_t i) const {
        assert(i < this->size());
        return INHERITED::operator[](i);
    }
    T& operator[](size_t i) {
        assert(i < this->size());
        return INHERITED::operator[](i);
    }
};

#else /* no asserts added */

// just do the rename
template <typename T> using Array = std::vector<T>;

#endif

} // namespace

#endif
