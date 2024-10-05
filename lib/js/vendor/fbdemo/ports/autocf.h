/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_autocf_h_
#define _pentrek_autocf_h_

#include "include/pentrek_types.h"

namespace pentrek {


template <typename T> class AutoCF {
    T m_obj;
    
public:
    AutoCF(T obj = nullptr) : m_obj(obj) {}
    AutoCF(const AutoCF& other) {
        if (other.m_obj) {
            CFRetain(other.m_obj);
        }
        m_obj = other.m_obj;
    }
    AutoCF(AutoCF&& other) {
        m_obj = other.m_obj;
        other.m_obj = nullptr;
    }
    ~AutoCF() {
        if (m_obj) {
            CFRelease(m_obj);
        }
    }
    
    AutoCF& operator=(const AutoCF& other) {
        if (m_obj != other.m_obj) {
            if (other.m_obj) {
                CFRetain(other.m_obj);
            }
            if (m_obj) {
                CFRelease(m_obj);
            }
            m_obj = other.m_obj;
        }
        return *this;
    }
    
    void reset(T obj) {
        if (obj != m_obj) {
            if (m_obj) {
                CFRelease(m_obj);
            }
            m_obj = obj;
        }
    }
    
    operator T() const { return m_obj; }
    operator bool() const { return m_obj != nullptr; }
    T get() const { return m_obj; }
};

} // namespace

#endif
