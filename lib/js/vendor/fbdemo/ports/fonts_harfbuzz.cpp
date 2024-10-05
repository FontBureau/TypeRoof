/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/data.h"
#include "include/fonts.h"
#include "include/matrix.h"
#include "include/path_builder.h"
#include "include/utf.h"
#include <array>

#include "hb.h"
#include "hb-ot.h"

using namespace pentrek;

static void ptrk_move_to_func(hb_draw_funcs_t*, void* draw_data, hb_draw_state_t*,
                              float x, float y, void*) {
    ((PathSync*)draw_data)->move({x, y});
}

static void ptrk_line_to_func(hb_draw_funcs_t*, void* draw_data, hb_draw_state_t*,
                              float x, float y, void*) {
    ((PathSync*)draw_data)->line({x, y});
}

static void ptrk_quad_to_func(hb_draw_funcs_t*, void* draw_data, hb_draw_state_t*,
                              float x, float y, float x1, float y1, void*) {
    ((PathSync*)draw_data)->quad({x, y}, {x1, y1});
}

static void ptrk_cubic_to_func(hb_draw_funcs_t*, void* draw_data, hb_draw_state_t*,
                               float x, float y, float x1, float y1, float x2, float y2, void*) {
    ((PathSync*)draw_data)->cubic({x, y}, {x1, y1}, {x2, y2});
}

static void ptrk_close_func(hb_draw_funcs_t*, void* draw_data, hb_draw_state_t*, void*) {
    ((PathSync*)draw_data)->close();
}

static hb_draw_funcs_t* make_ptrk_draw_funcs() {
    auto funcs = hb_draw_funcs_create();

    hb_draw_funcs_set_move_to_func     (funcs, ptrk_move_to_func,  nullptr, nullptr);
    hb_draw_funcs_set_line_to_func     (funcs, ptrk_line_to_func,  nullptr, nullptr);
    hb_draw_funcs_set_quadratic_to_func(funcs, ptrk_quad_to_func,  nullptr, nullptr);
    hb_draw_funcs_set_cubic_to_func    (funcs, ptrk_cubic_to_func, nullptr, nullptr);
    hb_draw_funcs_set_close_path_func  (funcs, ptrk_close_func,    nullptr, nullptr);

    return funcs;
}


static hb_blob_t* data_to_blob(rcp<Data> data) {
    Data* ptr = data.release(); // now we are the owner
    return hb_blob_create(ptr->chars(), (unsigned)ptr->size(), HB_MEMORY_MODE_READONLY,
                          ptr, [](void* ptr) {
        ((Data*)ptr)->unref();
    });
}

class FontHB : public Font {
    hb_font_t*        m_font;
    hb_draw_funcs_t*  m_draw_funcs;
    Array<Axis>       m_axes;
    const float       m_invUpem;

public:
    FontHB(hb_font_t*, Span<const Axis>, Span<const Coord>, uint32_t baseID);
    ~FontHB() override;
    
    hb_font_t* hbFont() const { return m_font; }
    
    rcp<Path> glyphPath(GlyphID) const override;
    Array<GlyphRun> shapeText(Span<const Unichar>, Span<const TextRun>) const override;
    Array<Axis> axes() const override { return m_axes; }

protected:
    rcp<Font> onMakeAt(Span<const Coord>) const override;
};

FontHB::FontHB(hb_font_t* font, Span<const Axis> axes, Span<const Coord> coord,
               uint32_t baseID)
    : Font(coord, baseID)
    , m_font(font)  // we take ownership
    , m_draw_funcs(make_ptrk_draw_funcs())
    , m_axes(axes.begin(), axes.end())
    , m_invUpem(1.0f / hb_face_get_upem(hb_font_get_face(font)))
{
    assert(m_font);
}
                   
FontHB::~FontHB() {
    hb_draw_funcs_destroy(m_draw_funcs);
    hb_font_destroy(m_font);
}

rcp<Path> FontHB::glyphPath(GlyphID glyph) const {
    const auto mx = Matrix::Scale(m_invUpem, -m_invUpem);

    PathBuilder builder;
    hb_font_get_glyph_shape(m_font, glyph, m_draw_funcs, &builder);
    builder.transformInPlace(mx);

    return builder.detach();
}

#if 0
typedef struct {
  hb_codepoint_t codepoint;
  uint32_t       cluster;
} hb_glyph_info_t;

typedef struct {
  hb_position_t  x_advance;
  hb_position_t  y_advance;
  hb_position_t  x_offset;
  hb_position_t  y_offset;
} hb_glyph_position_t;

#endif

const hb_tag_t KernTag = HB_TAG('k', 'e', 'r', 'n'); // kerning operations
const hb_tag_t LigaTag = HB_TAG('l', 'i', 'g', 'a'); // standard ligature substitution
const hb_tag_t CligTag = HB_TAG('c', 'l', 'i', 'g'); // contextual ligature substitution

//static hb_feature_t LigatureOff = { LigaTag, 0, 0, std::numeric_limits<unsigned int>::max() };
static hb_feature_t LigatureOn  = { LigaTag, 1, 0, std::numeric_limits<unsigned int>::max() };
//static hb_feature_t KerningOff  = { KernTag, 0, 0, std::numeric_limits<unsigned int>::max() };
static hb_feature_t KerningOn   = { KernTag, 1, 0, std::numeric_limits<unsigned int>::max() };
//static hb_feature_t CligOff     = { CligTag, 0, 0, std::numeric_limits<unsigned int>::max() };
static hb_feature_t CligOn      = { CligTag, 1, 0, std::numeric_limits<unsigned int>::max() };

static float set_grun(hb_buffer_t* buffer, GlyphRun* grun, float scale, float origin) {
    unsigned length, length2;
    const auto info = hb_buffer_get_glyph_infos(buffer, &length);
    const auto pos = hb_buffer_get_glyph_positions(buffer, &length2);
    assert(length == length2);

    grun->m_glyphs.resize(length);
    grun->m_xpos.resize(length + 1);
    grun->m_textIndex.resize(length);
    for (auto i = 0; i < length; ++i) {
        grun->m_glyphs[i] = castTo<GlyphID>(info[i].codepoint);
        grun->m_xpos[i] = origin;
        grun->m_textIndex[i] = castTo<uint32_t>(info[i].cluster);

        origin += pos[i].x_advance * scale;
    }
    grun->m_xpos[length] = origin;
    return origin;
}

Array<GlyphRun> FontHB::shapeText(Span<const Unichar> text, Span<const TextRun> truns) const {
    const hb_feature_t features[] = {
        LigatureOn, KerningOn, CligOn,
    };

    auto buffer = hb_buffer_create();
    
    auto get_hb = [](const Font& font) {
        return ((const FontHB*)&font)->m_font;
    };

    Array<GlyphRun> gruns;

    unsigned textOffset = 0;
    float origin = 0;
    for (const auto& tr : truns) {
        hb_buffer_reset(buffer);
        hb_buffer_set_direction(buffer, HB_DIRECTION_LTR);
        hb_buffer_set_script(buffer, HB_SCRIPT_COMMON);
        hb_buffer_add_utf32(buffer, text.data(), (int)text.size(),
                            textOffset, tr.m_unicharCount);
        hb_shape(get_hb(*tr.m_font), buffer, features, ArrayCount(features));
        
        GlyphRun grun;
        grun.m_font = tr.m_font;
        grun.m_size = tr.m_size;
        origin = set_grun(buffer, &grun, tr.m_size * m_invUpem, origin);

        gruns.push_back(std::move(grun));
        textOffset += tr.m_unicharCount;
    }
    assert(textOffset <= text.size());
    
    hb_buffer_destroy(buffer);

    return gruns;
}

rcp<Font> FontHB::onMakeAt(Span<const Coord> coord) const {
    Array<float> values(coord.size());
    for (size_t i = 0; i < coord.size(); ++i) {
        values[i] = coord[i].value;
    }

    auto font = hb_font_create(hb_font_get_face(m_font));
    hb_font_set_var_coords_design(font, values.data(), (unsigned)coord.size());

    return make_rcp<FontHB>(font, m_axes, coord, this->baseID());
}

rcp<Font> Font::MakeHB(rcp<Data> data) {
    auto fail = [](const char msg[]) -> rcp<Font> {
        printf("MakeHB failed: %s\n", msg);
        return nullptr;
    };

    auto blob = data_to_blob(data);
    if (!blob) {
        return fail("creating blob");
    }

    int ttcIndex = 0;
    auto face = hb_face_create(blob, ttcIndex); //   refs blob
    hb_blob_destroy(blob);                      // unrefs blob
    blob = nullptr;
    if (!face) {
        return fail("creating face");
    }

    Array<Font::Axis> axes;
    Array<Font::Coord> coord;

    const unsigned axisCount = hb_ot_var_get_axis_count(face);
    if (axisCount > 0) {
        Array<hb_ot_var_axis_info_t> infos(axisCount);
        unsigned acount = axisCount;
        DEBUG_CODE(unsigned n =) hb_ot_var_get_axis_infos(face, 0, &acount, infos.data());
        assert(n == axisCount);
        assert(n == acount);
        
        for (const auto& info : infos) {
            axes.push_back({info.tag, info.min_value, info.default_value, info.max_value});
            coord.push_back({info.tag, info.default_value});
        }
    }
    
    auto font = hb_font_create(face);   //   refs face
    hb_face_destroy(face);              // unrefs face
    face = nullptr;
    if (!font) {
        return fail("creating font");
    }

    return make_rcp<FontHB>(font, axes, coord, 0);
}
