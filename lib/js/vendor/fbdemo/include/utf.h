/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_utf_h_
#define _pentrek_utf_h_

#include "include/span.h"
#include <string>

namespace pentrek {

extern std::string string_printf(const char format[], ...);

class UTF {
public:
    // UTF16 utilities

    static bool isSurrogate(unsigned c) {
        assert((uint16_t)c == c);
        // surrogates are D8 and DC
        //    1101 10   and  1101 11
        // so our mask is 1111 1, looking for 1101 1
        return (c & 0xF800) == 0xD800;
    }
    
    static bool isHiSurrogate(unsigned c) {
        return (c & 0xFC00) == 0xD800;
    }
    
    static bool isLoSurrogate(unsigned c) {
        return (c & 0xFC00) == 0xDC00;
    }
    
    // if .first == 0 then
    //     .second is the answer
    // else
    //     .first + .second become "hi" and "lo" of the answer
    static std::pair<uint16_t, uint16_t> toU16(uint32_t);

    // UTF8 utilities

    static std::pair<Unichar, size_t> parseOneUTF8Sequence(Span<const uint8_t>);

    static size_t computeUtf8Length(uint8_t leadingByte) {
        assert((leadingByte & 0xC0) != 0x80);    // can't lead with 0b10xxxxxx
        if ((leadingByte & 0x80) == 0) {
            return 1;
        }
        int n = 1;
        leadingByte <<= 1;
        while (leadingByte & 0x80) {
            leadingByte <<= 1;
            n += 1;
        }
        assert(n <= 4);
        return n;
    }
    
    static size_t utf8To32(Span<const uint8_t> src, Span<Unichar> dst);
    static size_t utf8To32(Span<const uint8_t> src); // returns number of bytes consumed

    // returns number of bytes needed on output
    static size_t utf32To8(Unichar);
    static size_t utf32To8(Unichar, Span<uint8_t> dst);
    static size_t utf32To8(Span<const Unichar> src);
    static size_t utf32To8(Span<const Unichar> src, Span<uint8_t> dst);

    static void Tests();
};
    
} // namespace

#endif
