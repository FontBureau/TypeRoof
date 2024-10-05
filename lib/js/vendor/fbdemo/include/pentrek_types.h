/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_types_h_
#define _pentrek_types_h_

#if defined(DEBUG) && defined(NDEBUG)
    #error "Can't have both DEBUG and NDEBUG defined"
#endif

// if we can't determine, we default to DEBUG
#if !defined(DEBUG) && !defined(NDEBUG)
    #define DEBUG  1
#endif

#ifdef NDEBUG
    #ifndef RELEASE
        #define RELEASE 1
    #endif
#else
    #ifndef DEBUG
        #define DEBUG   1
    #endif
#endif

#ifdef DEBUG
    #define DEBUG_CODE(code)    code
#else
    #define DEBUG_CODE(code)
#endif

// Platform specific defines

#ifdef __APPLE__
    #define PENTREK_BUILD_FOR_APPLE
    #include <TargetConditionals.h>

    #if TARGET_OS_IPHONE
        #define PENTREK_BUILD_FOR_IOS
    #elif TARGET_OS_MAC
        #define PENTREK_BUILD_FOR_OSX
    #endif
#endif

#if defined(PENTREK_BUILD_FOR_WIN) && !defined(__clang__)
    #if !defined(PENTREK_WARN_UNUSED_RESULT)
        #define PENTREK_WARN_UNUSED_RESULT
    #endif
#endif

#if !defined(PENTREK_WARN_UNUSED_RESULT)
    #define PENTREK_WARN_UNUSED_RESULT __attribute__((warn_unused_result))
#endif

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <type_traits>

namespace pentrek {

#define ArrayCount(array)   ((int)(sizeof(array) / sizeof(array[0])))

template <typename T> T castTo(uint64_t value) {
    // todo: add range checks in debug version
    return (T)value;
}

using UniqueID = uint32_t;
using Unichar = uint32_t;
using GlyphID = uint16_t;

void RunUnitTests();

} // namespace

#endif
