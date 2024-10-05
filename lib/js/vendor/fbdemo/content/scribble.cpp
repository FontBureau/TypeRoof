

#include "include/content.h"
#include "include/measure.h"
#include "include/random.h"
#include "include/path_builder.h"

namespace pentrek {

class Scribble : public Content {
    Rect m_rect;
    PathBuilder m_builder;
    
    struct Rec {
        rcp<Path> path;
        rcp<Shader> shader;
    };
    std::vector<Rec> m_recs;
    
    Random m_rand;

    rcp<Shader> make_shader() {
        Color colors[5];
        for (auto& c : colors) {
            c = {m_rand.nextF(), m_rand.nextF(), m_rand.nextF(), 1};
        }
        Point p0 = {m_rand.nextF() * 100, m_rand.nextF() * 100};
        Point p1 = {m_rand.nextF() * 100 + 400, m_rand.nextF() * 100 + 400};
        return Shader::LinearGradient(p0, p1, colors);
    }
public:
    Scribble() : Content("Scribble") {
        m_rect = {20, 20, 500, 400};
        
        this->setSize({500, 500});
    }
    
    std::unique_ptr<Click> onFindClick(Point p) override {
        m_builder.move(p);
        m_recs.push_back({m_builder.snapshot(), this->make_shader()});
        return Click::Make(p, [this](Click* c, bool up) {
            if (up) {
                m_recs.back().path = m_builder.detach();
            } else {
                m_builder.line(c->m_curr);
                m_recs.back().path = m_builder.snapshot();
            }
        });
    }

    void onDraw(Canvas* canvas) override {
        float w = this->size().width;
        float h = this->size().height;

        const Color colors[] = {Color_red, Color_green, Color_blue};
        auto sh = Shader::LinearGradient({100, 100}, {400, 400}, colors);

        Paint paint({1, 0, 0.5f, 1});
        Point pts[] = {
            {w/2, 30}, {w, h/2}, {w/2, h}, {0, h/2},
        };

        paint.shader(nullptr);
        canvas->drawPoly(pts, true, paint);
        
        paint.color({0, 0, 1, 1});
        paint.width(6);
        paint.stroke(true);
        paint.shader(sh);
        canvas->drawRect(m_rect, paint);

        paint.width(6);
        paint.stroke(true);
        Random rand;
        for (const auto& rec : m_recs) {
            paint.shader(rec.shader);
            canvas->drawPath(rec.path, paint);
        }
    }
};

} // namespace

std::unique_ptr<pentrek::Content> MakeScribble();
std::unique_ptr<pentrek::Content> MakeScribble() {
    return std::make_unique<pentrek::Scribble>();
}
