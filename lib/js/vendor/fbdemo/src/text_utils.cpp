/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/data.h"
#include "include/text_utils.h"
#include "include/fonts.h"
#include "include/path_builder.h"
#include <mutex>

#ifdef PENTREK_BUILD_FOR_APPLE
    #define USE_MAC_FONTS
#endif

using namespace pentrek;

int gGlobalFontCacheCounter;

rcp<Font> Font::Make(rcp<Data> data) {
#ifdef USE_MAC_FONTS
    return Font::MakeCG(data);
#else
    return Font::MakeHB(data);
#endif
}

rcp<Font> pentrek::make_global_font(Font::GlobalFonts gf) {
    // keep a perma-cache of font objects (for now)
    constexpr size_t N = Font::GlobalFonts::kLastGlobalFont + 1;
    static rcp<Font> gGlobalFontObjects[N];
    static std::once_flag gGlobaFontOnce[N];

    std::call_once(gGlobaFontOnce[gf], [gf]() {
        if (!gGlobalFontObjects[gf]) {
            gGlobalFontObjects[gf] = Font::Make(Font::GlobalData(gf));
            gGlobalFontCacheCounter += 1;
        }
    });

    return gGlobalFontObjects[gf];
}

static void make_truns_proc(Span<const char> str, Span<const TextRun> truns,
                            std::vector<float>* xpos,
                            std::function<void(const Path&, float scale, float tx)> proc) {
    if (truns.size() == 0) {
        return;
    }

    std::vector<Unichar> text;
    for (auto c : str) {
        text.push_back(c);
    }
    
    std::vector<GlyphRun> gruns = truns[0].m_font->shapeText(text, truns);

    for (const auto& gr : gruns) {
        for (size_t i = 0; i < gr.m_glyphs.size(); ++i) {
            proc(gr.m_font->glyphPath(gr.m_glyphs[i]).deref(), gr.m_size, gr.m_xpos[i]);
            auto path = gr.m_font->glyphPath(gr.m_glyphs[i]);
        }
        if (xpos) {
            xpos->insert(xpos->end(), gr.m_xpos.begin(), gr.m_xpos.end());
        }
    }
}

static Matrix scale_tx(float scale, float tx) {
    return Matrix(scale, 0, 0, scale, tx, 0);
}

std::vector<rcp<Path>> pentrek::make_truns_paths(Span<const char> str, Span<const TextRun> truns,
                                                 std::vector<float>* xpos) {
    std::vector<rcp<Path>> paths;
    make_truns_proc(str, truns, xpos, [&](const Path& path, float scale, float tx) {
        paths.push_back(scale_tx(scale, tx) * path);
    });
    return paths;
}

std::vector<rcp<Path>> pentrek::make_string_paths(Span<const char> str, float size, rcp<Font> font) {
    if (!font) {
        font = make_def_font();
    }

    const TextRun trun = {font, size, (uint32_t)str.size()};

    std::vector<rcp<Path>> paths;
    make_truns_proc(str, {&trun, 1}, nullptr, [&](const Path& path, float scale, float tx) {
        paths.push_back(scale_tx(scale, tx) * path);
    });
    return paths;
}

rcp<Path> pentrek::make_string_path(Span<const char> str, float size, rcp<Font> font) {
    if (!font) {
        font = make_def_font();
    }

    const TextRun trun = {font, size, (uint32_t)str.size()};

    PathBuilder builder;
    make_truns_proc(str, {&trun, 1}, nullptr, [&](const Path& src, float scale, float tx) {
        builder.addPath(src, scale_tx(scale, tx));
    });
    return builder.detach();
}
