/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/animator.h"
#include "include/content.h"
#include "include/matrix.h"
#include "include/meta.h"
#include "include/keyframes.h"
#include "include/random.h"
#include "include/text_utils.h"

#include "include/json_writer.h"
#include "include/writer.h"

using namespace pentrek;

namespace {

void dump_axes_to_json(Span<const Font::Axis> axes, JSONWriter& w) {
    JSONWriter::AutoArray aa(w, "axes");
    for (const auto& a : axes) {
        JSONWriter::AutoStruct as(w);
        w.string("tag", tag_to_str(a.tag).data());
        w.number("min", a.min);
        w.number("def", a.def);
        w.number("max", a.max);
    }
}

class Textline2Content : public Content {
    using INHERITED = Content;

    rcp<Font> m_font;
    std::vector<Font::Axis> m_axes;
    std::string m_sampleText;

    std::unique_ptr<KeyFrames> m_tline;
    float m_duration;

    Slider* m_slider;
    Animator m_animator;
    bool m_showOutlines = false;
    Color m_textColor{0,0,0,1};
    float m_textSize = 100;

    float m_middle = 0;

    void buildFont(rcp<Data> fontData = nullptr) {
        if (fontData) {
            m_font = Font::Make(fontData);
        } else {
            m_font = make_global_font(Font::GlobalFonts::kMigha);
        }
        m_font->dump();

        m_axes = m_font->axes();
        m_tline.reset(new KeyFrames((int)m_axes.size()));
        if (m_slider) {
            m_slider->value(0);
            m_slider->setTicks({nullptr, 0});
        }
    }
    
    void updateTicks() {
        size_t N = m_tline->frameCount();
        float ticks[N];
        for (int i = 0; i < N; ++i) {
            ticks[i] = m_tline->at(i).time;
        }
        m_slider->setTicks({ticks, N});
    }

    bool setSampleText(const Meta& m, Meta*) {
        auto span = m.findString("text");
        if (span.data()) {
            m_sampleText = span.data();
            return true;
        }
        return false;
    }
    bool setVarKeyFrame(const Meta& m, Meta*) {
        float time = m.findFloat("time", -1);
        if (time < 0) {
            printf("!!! expected time value [0...]\n");
            return false;
        }
        auto tags = m.findInts("tags");
        auto vals = m.findFloats("values");
        if (tags.size() != vals.size()) {
            printf("!!! expected equal number of tags and values");
            return false;
        }
        std::vector<Font::Coord> coord(tags.size());
        for (size_t i = 0; i < tags.size(); ++i) {
            coord[i].tag = tags[i];
            coord[i].value = vals[i];
        }
        coord = m_font->canonicalCoord(coord);
        assert(coord.size() == m_axes.size());
        const auto N = coord.size();
        float values[N];
        for (size_t i = 0; i < N; ++i) {
            values[i] = coord[i].value;
        }
        m_tline->addFrame(time, {values, N});
        this->updateTicks();
        return true;
    }
    
    bool clearKeyFrames(const Meta& m, Meta*) {
        if (auto duration = m.findFloat("duration")) {
            m_slider->value(0);
            m_slider->setTicks({nullptr, 0});
            this->setDuration(duration);
            m_tline->removeAll();
            this->updateTicks();
            return true;
        }
        return false;
    }
    
    bool setFontData(const Meta& m, Meta*) {
        if (auto data = m.findData("font-data")) {
            buildFont(data);
            return true;
        }
        return false;
    }

    bool setTextSize(const Meta& m, Meta*) {
        float size = m.findFloat("text-size", m_textSize);
        if (size != m_textSize) {
            m_textSize = size;
            return true;
        }
        return false;
    }
    
    bool setAnimSpeed(const Meta& m, Meta*) {
        m_animator.speed(m.findFloat("speed", m_animator.speed()));
        return true;
    }
    
    bool playPauseAnimation(const Meta& m, Meta*) {
        if (m.hasInts("play")) {
            if (m.findInt("play") != 0) {
                m_animator.run();
            } else {
                m_animator.stop();
            }
            return true;
        }
        return false;
    }

    bool getFontAxesInfo(const Meta&, Meta* reply) {
        MemoryWriter w;
        JSONWriter json(w);
        dump_axes_to_json(m_axes, json);
        json.finish();

        auto data = w.detach();
        reply->setString("json", data->cspan());
        return true;
    }
    
    void setDuration(float dur) {
        m_duration = dur;
        m_animator.duration(m_duration);
        m_slider->minmax(0, m_duration);
        printf("setduration %g\n", dur);
    }
public:
    Textline2Content()
        : Content("Variation Timeline")
    {
        this->buildFont();
        
        m_animator.tiling(Animator::kMirror);
        m_animator.speed(1);

        m_slider = this->addChildToFront(std::make_unique<Slider>());

        this->setDuration(3);

        this->setSize({800, 600});
        
        {
            Meta m("set-sample-text");
            m.setString("text", "PENTREK");
            this->handleMsg(m);
        }
    }

    void onSizeChanged() override {
        auto r = this->bounds();
        r.left += 10;
        r.right -= 10;
        r.bottom -= 10;
        r.top = r.bottom - 30;
        m_slider->bounds(r);
    }
    
    bool onHandleMsg(const Meta& m, Meta* reply) override {
        using MetaHandler = bool(Textline2Content::*)(const Meta&, Meta*);
        const struct {
            const char* title;
            MetaHandler handler;
        } handlers[] = {
            {"set-var-keyframe", &Textline2Content::setVarKeyFrame},
            {"clear-keyframes", &Textline2Content::clearKeyFrames},
            {"set-sample-text", &Textline2Content::setSampleText},
            {"set-font-data", &Textline2Content::setFontData},
            {"set-text-size", &Textline2Content::setTextSize},
            {"set-anim-speed", &Textline2Content::setAnimSpeed},
            {"play-pause-animation", &Textline2Content::playPauseAnimation},
            {"get-font-axes-json", &Textline2Content::getFontAxesInfo},
        };
        for (const auto& h : handlers) {
            if (m.isNamed(h.title)) {
                if ((this->*h.handler)(m, reply)) {
                    this->requestDraw();
                    return true;
                }
                break;
            }
        }
        if (m.isNamed("toggle-show-outlines")) {
            m_showOutlines = !!m.findInt("is-on", m_showOutlines);
            this->requestDraw();
            return true;
        }
        if (m.isNamed("set-color")) {
            auto rgba = m.findFloats("rgba");
            if (rgba.size() == 4) {
                m_textColor = {rgba[0], rgba[1], rgba[2], rgba[3]};
                this->requestDraw();
                return true;
            }
            return false;
        }

        return this->INHERITED::onHandleMsg(m, reply);
    }

    void onDraw(Canvas* canvas) override {
        m_animator.setTime(this->absSecs());

        auto time = m_slider->value();
        
        if (m_animator.isRunning()) {
            time = m_animator.time();
            m_slider->value(time);
            this->requestDraw();
        }

        auto font = m_font;
        if (m_tline->frameCount() > 0) {
            const size_t N = m_axes.size();
            float values[N];
            m_tline->sample(time, {values, N});
            
            Font::Coord coord[N];
            for (size_t i = 0; i < N; ++i) {
                coord[i].tag = m_axes[i].tag;
                coord[i].value = values[i];
            }
            font = m_font->makeAt({&coord[0], m_axes.size()});
        }
        auto paths = make_string_paths(m_sampleText.c_str(), m_textSize, font);

        Paint paint;
        paint.stroke(m_showOutlines);
        paint.width(0.5);
        paint.color(m_textColor);

        Paint pnt;
        pnt.color({0,0,0.5f,1});
        pnt.width(2.25);

        canvas->save();
        canvas->translate(50, 450);
        for (size_t i = 0; i < paths.size(); ++i) {
            canvas->drawPath(paths[i], paint);
            if (m_showOutlines) {
                canvas->drawPoints(paths[i]->points(), pnt);
            }
        }
        canvas->restore();
    }
    
    bool onKeyDown(const KeyEvent& e) override {
        if (!e.isCode()) {
            switch (e.uni()) {
                case ' ':
                    m_animator.toggle();
                    if (m_animator.isRunning() && m_animator.isFinished()) {
                        m_animator.rewind();
                    }
                    return true;
                case 'p':
                    m_showOutlines = !m_showOutlines;
                    return true;
                default: break;
            }
        }
        return this->INHERITED::onKeyDown(e);
    }
};

} // namespace

std::unique_ptr<Content> MakeTextline2Content();
std::unique_ptr<Content> MakeTextline2Content() {
    return std::make_unique<Textline2Content>();
}
