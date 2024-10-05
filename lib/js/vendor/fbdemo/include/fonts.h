/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_fonts_h_
#define _pentrek_fonts_h_

#include "include/array.h"
#include "include/data.h"
#include "include/refcnt.h"
#include "include/path.h"
#include <array>

namespace pentrek {

class Font;

struct TextRun {
    rcp<Font> m_font;
    float     m_size;
    uint32_t  m_unicharCount;
};

struct GlyphRun {
    rcp<Font> m_font;
    float     m_size;
  
    Array<GlyphID>  m_glyphs;     // N
    Array<float>    m_xpos;       // N+1
    Array<uint32_t> m_textIndex;  // N
};

class Font : public RefCnt {
public:
    struct Axis {
        uint32_t tag;
        float    min;
        float    def;
        float    max;
    };
    
    static constexpr uint32_t kOPSZ_Tag = 'opsz';
    
    struct Coord {
        uint32_t tag;
        float    value;
        
        bool operator==(const Coord& o) const {
            return tag == o.tag && value == o.value;
        }
        bool operator!=(const Coord& o) const { return !(*this == o); }
    };
    
    virtual ~Font();

    uint32_t baseID() const { return m_baseID; }
    Span<const Coord> coord() const { return m_coord; }

    static Array<Font::Coord> CanonicalCoord(Span<const Axis>, Span<const Coord>);

    Array<Coord> canonicalCoord(Span<const Coord> coord) const;

    struct LineMetrics {
        float m_ascent;  // < 0
        float m_descent; // > 0
    };
    virtual LineMetrics lineMetrics() const;
    virtual rcp<Path> glyphPath(GlyphID) const = 0;
    virtual Array<GlyphRun> shapeText(Span<const Unichar>,
                                            Span<const TextRun>) const = 0;
    
    virtual Array<Axis> axes() const = 0;
    int axesCount() const { return castTo<int>(this->axes().size()); }

    rcp<Font> makeAt(Span<const Coord>) const;
    rcp<Font> makeAt(Coord c) const { return this->makeAt({&c, 1}); }

#ifdef DEBUG
    void dump() const;
#else
    void dump() const {}
#endif

    // Static Factories
    
    static rcp<Font> MakeCG(rcp<Data>);
    static rcp<Font> MakeHB(rcp<Data>);
    static rcp<Font> Make(rcp<Data>);

    enum GlobalFonts {
        kPentrek,
        kDecovar,
        kMigha,
        
        kDefault = kPentrek,
        kLastGlobalFont = kMigha,
    };
    static rcp<Data> GlobalData(GlobalFonts);

protected:
    // If you're creating a new coord/style of the same underlying font/typeface,
    // pass its baseID (if they share the underlying data, they should have the
    // same baseID).
    //
    // If you're creating a new font, pass 0 and a unique value will be generated
    //
    Font(Span<const Coord>, uint32_t baseID = 0);

    virtual rcp<Font> onMakeAt(Span<const Coord>) const = 0;

private:
    const uint32_t m_baseID;
    const Array<Coord> m_coord;
};

static inline std::array<char, 5> tag_to_str(uint32_t tag) {
    return {
        (char)((tag >> 24) & 0xFF),
        (char)((tag >> 16) & 0xFF),
        (char)((tag >>  8) & 0xFF),
        (char)((tag >>  0) & 0xFF),
        0
    };
}

} // namespace

#endif
