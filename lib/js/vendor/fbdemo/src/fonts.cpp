/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/data.h"
#include "include/fonts.h"
#include "include/math.h"
#include "include/span.h"
#include <stdio.h>

using namespace pentrek;

static uint32_t next_unique_id() {
    static std::atomic<uint32_t> gSingleton;
    return gSingleton.fetch_add(+1, std::memory_order_relaxed) + 1;
}

static int gFontCounter;

extern int gGlobalFontCacheCounter;

Font::Font(Span<const Coord> coord, uint32_t baseID)
    : m_baseID(baseID ? baseID : next_unique_id())
    , m_coord(coord.begin(), coord.end())
{
    ++gFontCounter;
//    printf(  "%d fonts\n", gFontCounter);
}

Font::~Font() {
    assert(gFontCounter > 0);
    --gFontCounter;
//    printf("~ %d fonts, %d in cache\n", gFontCounter, gGlobalFontCacheCounter);
}

Array<Font::Coord> Font::CanonicalCoord(Span<const Axis> axes, Span<const Coord> src) {
    Array<Coord> dst(axes.size());

    for (size_t i = 0; i < axes.size(); ++i) {
        auto iter = std::find_if(src.begin(), src.end(), [&](Coord c) {
            return c.tag == axes[i].tag;
        });
        dst[i].tag = axes[i].tag;
        if (iter == src.end()) {
            dst[i].value = axes[i].def;
        } else {
            dst[i].value = pin_float(iter->value, axes[i].min, axes[i].max);
        }
    }
    return dst;
}

Array<Font::Coord> Font::canonicalCoord(Span<const Coord> src) const {
    auto axes = this->axes();
    return CanonicalCoord(axes, src);
}

rcp<Font> Font::makeAt(Span<const Coord> src) const {
    auto dst = this->canonicalCoord(src);

    // If the request is for the same coord, just return us.
    // This seems safe, since Font is entirely read-only
    if (this->coord() == dst) {
        return ref_rcp(this);
    }
    return this->onMakeAt(dst);
}

Font::LineMetrics Font::lineMetrics() const {
    // todo: this should be overriden in subclasses
    return {-1, 0.25f};
}

#ifdef DEBUG
void Font::dump() const {
    auto axes = this->axes();
    auto coord = this->coord();
    assert(axes.size() == coord.size());

    printf("%zu axes:\n", axes.size());
    int i = 0;
    for (const auto& a : axes) {
        printf(" '%s' %g %g %g [%g]\n", tag_to_str(a.tag).data(),
               a.min, a.def, a.max, coord[i].value);
        i++;
    }
    printf("\n");
}
#endif

///////////////////

#ifndef PENTREK_BUILD_FOR_APPLE
    #define PENTREK_INCLUDE_MINIMAL_FONTS
#endif

#ifndef PENTREK_INCLUDE_MINIMAL_FONTS
    #include "fonts/decovar.c"
    #include "fonts/logofont.c"
#endif
#include "fonts/migha.c"

constexpr Span<const uint8_t> gGlobalFontData[] = {
#ifndef PENTREK_INCLUDE_MINIMAL_FONTS
    { ___PentrekLogoVF_ttf,      ___PentrekLogoVF_ttf_len },
    { fonts_DecovarAlpha_VF_ttf, fonts_DecovarAlpha_VF_ttf_len },
#endif
    { Migha_Variable_ttf,      Migha_Variable_ttf_len },
};

rcp<Data> Font::GlobalData(GlobalFonts gf) {
    int index = std::min<int>(gf, ArrayCount(gGlobalFontData)-1);
    auto span = gGlobalFontData[index];
    return Data::Unmanaged(span);
}
