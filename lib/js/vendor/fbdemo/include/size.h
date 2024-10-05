/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_size_h_
#define _pentrek_size_h_

#include "include/pentrek_types.h"

namespace pentrek {

struct ISize {
    int32_t width, height;
    
    bool operator==(const ISize& o) const {
        return width == o.width && height == o.height;
    }
    bool operator!=(const ISize& o) const { return !(*this == o); }
};

struct Size {
    float width, height;
    
    bool operator==(const Size& o) const {
        return width == o.width && height == o.height;
    }
    bool operator!=(const Size& o) const { return !(*this == o); }
};

} // namespace

#endif
