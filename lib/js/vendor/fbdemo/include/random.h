/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_random_h_
#define _pentrek_random_h_

#include "include/pentrek_types.h"

namespace pentrek {

class Random {
    // https://www.rlmueller.net/MWC32.htm
    // 32-bit Multiply With Carry generator
    // converted to 64bit
    uint64_t m_curr;
    
    enum {
        A = 4'164'903'690UL,
    };
public:
    Random(uint64_t seed = 1) : m_curr(seed) {}

    uint32_t nextU() {
        m_curr = m_curr * A + (m_curr >> 32);
        return uint32_t(m_curr);
    }

    float nextF() {
        // create 1.x where x is from next() -- 23bits
        int floatint = 0x3f800000 | (int)(this->nextU() >> 9);
        float f;
        memcpy(&f, &floatint, 4);
        // return [0 ... 1)
        return f - 1.0f;
    }
    
    float nextSF() {
        return this->nextF() * 2 - 1;
    }
    
    float nextF(float min, float max) {
        return min + this->nextF() * (max - min);
    }
};

} // namespace

#endif
