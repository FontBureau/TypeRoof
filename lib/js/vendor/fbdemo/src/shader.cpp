/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/shader.h"

using namespace pentrek;

namespace {

class ColorShader : public Shader {
    Color m_color;

public:
    ColorShader(Color c) : m_color(c) {}
    
    Type type() const override { return Type::kColor; }
    
    void getColor(Color* info) const {
        *info = m_color;
    }
};

static inline size_t align_4(size_t n) {
    assert(n + 3 > n);
    return (n + 3) & ~3;
}

class GradientShader : public Shader {
    std::unique_ptr<const Color[]> m_colors;
    const float* m_pos;
    size_t m_count;
    
public:
    GradientShader(Span<const Color> colors, const float* pos) {
        assert(colors.size() >= 1);
        assert(sizeof(Color) == 4 * sizeof(float));
        
        m_count = colors.size();
        size_t extraColors = (pos ? align_4(m_count) : 0);
        Color* copy = new Color[m_count + extraColors];
        float* posCopy = pos ? copy[m_count].floats().data() : nullptr;
        for (size_t i = 0; i < m_count; ++i) {
            copy[i] = colors[i];
            if (posCopy) {
                posCopy[i] = pos[i];
            }
        }
        m_colors.reset(copy);
        m_pos = posCopy;
    }
    
    void getGradient(GradientInfo* info) const {
        info->m_colors = {m_colors.get(), m_count};
        info->m_pos = m_pos;
    }
    
    size_t count() const { return m_count; }
};

class LinearGradientShader : public GradientShader {
    Point m_pts[2];
    
public:
    LinearGradientShader(Point p0, Point p1, Span<const Color> colors, const float* pos)
    : GradientShader(colors, pos)
    , m_pts{p0, p1}
    {}
    
    Type type() const override { return Type::kLinearGradient; }
    
    void getLinear(LinearGradientInfo* info) const {
        this->getGradient(info);
        info->m_points[0] = m_pts[0];
        info->m_points[1] = m_pts[1];
    }
};

class RadialGradientShader : public GradientShader {
    Point m_center;
    float m_radius;
    
public:
    RadialGradientShader(Point center, float radius, Span<const Color> colors, const float* pos)
    : GradientShader(colors, pos)
    , m_center(center)
    , m_radius(radius)
    {
        assert(m_radius > 0);
    }
    
    Type type() const override { return Type::kRadialGradient; }
    
    void getRadial(RadialGradientInfo* info) const {
        this->getGradient(info);
        info->m_center = m_center;
        info->m_radius = m_radius;
    }
};

} // namespace

/////////////////////////////////

bool Shader::asColor(Color* info) const {
    if (this->type() == Type::kColor) {
        if (info) {
            static_cast<const ColorShader*>(this)->getColor(info);
        }
        return true;
    }
    return false;
}

bool Shader::asGradient(GradientInfo* info) const {
    switch (this->type()) {
        case Type::kLinearGradient:
        case Type::kRadialGradient:
            if (info) {
                static_cast<const GradientShader*>(this)->getGradient(info);
            }
            return true;
        default: break;
    }
    return false;
}

bool Shader::asLinearGradient(LinearGradientInfo* info) const {
    if (this->type() == Type::kLinearGradient) {
        if (info) {
            static_cast<const LinearGradientShader*>(this)->getLinear(info);
        }
        return true;
    }
    return false;
}

bool Shader::asRadialGradient(RadialGradientInfo* info) const {
    if (this->type() == Type::kRadialGradient) {
        if (info) {
            static_cast<const RadialGradientShader*>(this)->getRadial(info);
        }
        return true;
    }
    return false;
}

// Factories

rcp<Shader> Shader::SingleColor(Color c) {
    return make_rcp<ColorShader>(c);
}

static void validate_pos(const float pos[], size_t n) {
    if (pos) {
        float prev = 0;
        for (size_t i = 0; i < n; ++i) {
            assert(prev <= pos[i]);
            prev = pos[i];
        }
    }
}

rcp<Shader> Shader::LinearGradient(Point p0, Point p1,
                                   Span<const Color> colors, const float pos[]) {
    if (colors.size() == 0) {
        return nullptr;
    }
    if (colors.size() == 1) {
        return SingleColor(colors.front());
    }
    if (p0 == p1) {
        return SingleColor(colors.back());
    }
    validate_pos(pos, colors.size());
    return make_rcp<LinearGradientShader>(p0, p1, colors, pos);
}

rcp<Shader> Shader::RadialGradient(Point center, float radius,
                                   Span<const Color> colors, const float pos[]) {
    if (colors.size() == 0) {
        return nullptr;
    }
    if (colors.size() == 1) {
        return SingleColor(colors.front());
    }
    if (radius <= 0) {
        return SingleColor(colors.back());
    }
    validate_pos(pos, colors.size());
    return make_rcp<RadialGradientShader>(center, radius, colors, pos);
}

/////////////////////

#ifdef DEBUG
static bool equal(Span<const Color> a, Span<const Color> b) {
    return a.size() == b.size() && std::equal(a.begin(), a.end(), b.begin());
}

static void validate_gradient(Shader* sh, Span<const Color> colors, const float pos[]) {
    DEBUG_CODE(auto gtype = sh->type();)
    assert(gtype == Shader::Type::kLinearGradient ||
           gtype == Shader::Type::kRadialGradient);

    assert(sh->asColor(nullptr) == false);
    assert(sh->asLinearGradient(nullptr) == (gtype == Shader::Type::kLinearGradient));
    assert(sh->asRadialGradient(nullptr) == (gtype == Shader::Type::kRadialGradient));

    Shader::GradientInfo info;
    assert(sh->asGradient(&info) && equal(info.m_colors, colors));
    if (pos) {
        assert(std::equal(pos, pos + colors.size(), info.m_pos));
    } else {
        assert(info.m_pos == nullptr);
    }
}
#endif

void Shader::Tests() {
#ifdef DEBUG
    Color cinfo;
    Shader::LinearGradientInfo linfo;
    Shader::RadialGradientInfo rinfo;
    
    const Color colors[3] = {Color_red, Color_green, Color_blue};
    const float pos[3] = {0, 0.5f, 1};
    rcp<Shader> sh;
    
    sh = Shader::SingleColor(colors[0]);
    assert(sh->type() == Shader::Type::kColor);
    assert(sh->asColor(nullptr));
    assert(sh->asColor(&cinfo) && cinfo == colors[0]);
    assert(sh->asLinearGradient(nullptr) == false);
    assert(sh->asRadialGradient(nullptr) == false);
    
    const Point p0{0, 0}, p1{1, 1};
    for (const float* p : {(const float*)nullptr, pos}) {
        sh = Shader::LinearGradient(p0, p1, colors, p);
        validate_gradient(sh.get(), colors, p);
        assert(sh->type() == Shader::Type::kLinearGradient);
        assert(sh->asLinearGradient(&linfo) &&
               linfo.m_points[0] == p0 && linfo.m_points[1] == p1);
    }
    sh = Shader::LinearGradient(p0, p1, {colors, 0}, nullptr);
    assert(!sh);
    sh = Shader::LinearGradient(p0, p1, {colors, 1}, nullptr);
    assert(sh->asColor(&cinfo) && cinfo == colors[0]);
    sh = Shader::LinearGradient(p0, p0, colors, nullptr);
    assert(sh->asColor(&cinfo) && cinfo == colors[2]);

    const Point center{2, 2};
    const float radius = 4;
    for (const float* p : {(const float*)nullptr, pos}) {
        sh = Shader::RadialGradient(center, radius, colors, p);
        validate_gradient(sh.get(), colors, p);
        assert(sh->type() == Shader::Type::kRadialGradient);
        assert(sh->asRadialGradient(&rinfo) &&
               rinfo.m_center == center && rinfo.m_radius == radius);
    }
    sh = Shader::RadialGradient(center, radius, {colors, 0}, nullptr);
    assert(!sh);
    sh = Shader::RadialGradient(center, radius, {colors, 1}, nullptr);
    assert(sh->asColor(&cinfo) && cinfo == colors[0]);
    sh = Shader::RadialGradient(center, 0, colors, nullptr);
    assert(sh->asColor(&cinfo) && cinfo == colors[2]);
#endif
}
