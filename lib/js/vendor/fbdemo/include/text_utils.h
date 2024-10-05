/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_text_utils_h_
#define _pentrek_text_utils_h_

#include "include/path.h"
#include "include/fonts.h"
#include <deque>

namespace pentrek {

rcp<Font> make_global_font(Font::GlobalFonts);
static inline rcp<Font> make_def_font() { return make_global_font(Font::kDefault); }
static inline rcp<Font> make_label_font() { return make_global_font(Font::kDecovar); }

std::vector<rcp<Path>> make_truns_paths(Span<const char>, Span<const TextRun>,
                                        std::vector<float>* xpos = nullptr);

std::vector<rcp<Path>> make_string_paths(Span<const char>, float size, rcp<Font> = nullptr);
rcp<Path> make_string_path(Span<const char>, float size, rcp<Font> = nullptr);

static inline std::vector<rcp<Path>> make_string_paths(const char str[], float size, rcp<Font> font) {
    return make_string_paths({str, strlen(str)}, size, font);
}

class FontCacheEntry {
    rcp<Font> m_font;

    struct Pair {
        uint16_t glyph;
        uint16_t pathIndex;    // so we can always just append paths to their storage
    };
    std::vector<Pair> m_glyphs; // sorted by glyph id
        
    // not sorted (for efficiency), just append each new path
    // m_paths[0] is always the empty path, shared by any/all glyphs that don't have a path
    std::vector<rcp<Path>> m_paths;

public:
    FontCacheEntry(rcp<Font>);
    ~FontCacheEntry();

    Font* font() const { return m_font.get(); }

    // returns nullptr if the glyph is not in the cache.
    // returns the empty Path if the glyph is in the cache, but has no path data
    rcp<Path> findGlyph(GlyphID) const;

    // Adds/replaces the glyph in the cache with this path data.
    // Calling this invalidates any previously returned ptrs from findGlyph()
    void setGlyph(GlyphID, rcp<Path>);
};

class FontCache {
    std::deque<std::unique_ptr<FontCacheEntry>> m_entries;

public:
    FontCache();
    ~FontCache();

    int count() const { return castTo<int>(m_entries.size()); }

    // Purge until we have at most N entries left
    void purgeIfMoreThan(int N);

    std::unique_ptr<FontCacheEntry> detachEntry(const Font*);
    void addEntry(std::unique_ptr<FontCacheEntry>);
};

} // namespace

#endif
