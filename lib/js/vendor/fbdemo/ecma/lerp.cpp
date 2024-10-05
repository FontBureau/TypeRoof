/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/color.h"
#include "include/data.h"
#include "include/meta.h"
#include "include/time.h"
#include "include/content.h"

#include "ecma/jsc2d_canvas.h"

#include <emscripten/bind.h>

#include <stdio.h>

//using namespace emscripten;

using namespace pentrek;

void Content::RequestDraw(Content*) {
    ptrk_request_animation_frame();
}

//////////////

class HostView : public GroupView {
public:
    Content* content() {
        assert(this->countChildren() == 1);
        return (Content*)this->childAt(0);
    }
protected:
    void onDraw(Canvas* canvas) override {
        constexpr float c = 0xF4 / 255.0f;
        Paint paint;
        paint.color({c,c,c,1});
        canvas->drawRect(this->localBounds(), paint);
    }
};

static int gContentIndex;
static std::unique_ptr<HostView> gHost;
static std::unique_ptr<Click> gClick;

static void flush_mouse_up() {
    if (gClick) {
        gClick->up();
        gClick = nullptr;
    }
}

static void install_content() {
    flush_mouse_up();

    auto content = Content::Make(gContentIndex);
    auto name = content->title();
    printf("make content %d %s\n", gContentIndex, name.c_str());

    gHost->deleteAllChildren();
    gHost->addChildToFront(std::move(content));
}

/*
    tried returning HostView* ...

 "Cannot call create_host due to unbound types: P8HostView"
 "UnboundTypeError"
 "UnboundTypeError: Cannot call create_host due to unbound types: P8HostView\n    at UnboundTypeError.<anonymous> (http://localhost:8000/lerp.js:1:13757)\n    at new UnboundTypeError (eval at createNamedFunction (http://localhost:8000/lerp.js:1:13466), <anonymous>:4:34)\n    at throwUnboundTypeError (http://localhost:8000/lerp.js:1:24714)\n    at Object.create_host (http://localhost:8000/lerp.js:1:25062)\n    at Object.onRuntimeInitialized (http://localhost:8000/mylerp.html:45:31)\n    at doRun (http://localhost:8000/lerp.js:1:41184)\n    at run (http://localhost:8000/lerp.js:1:41344)\n    at runCaller (http://localhost:8000/lerp.js:1:40852)\n    at removeRunDependency (http://localhost:8000/lerp.js:1:7370)\n    at receiveInstance (http://localhost:8000/lerp.js:1:9131)"
 */
using WasmRawPointer = uintptr_t;

WasmRawPointer dispatch_create_host(float width, float height) {
    flush_mouse_up();
    
    gHost = std::make_unique<HostView>();
    printf("setting size %g %g\n", width, height);
    gHost->size({width, height});
    
    install_content();
    
    return (WasmRawPointer)gHost.get();
}

static void inc_content(int inc) {
    gContentIndex += inc;
    while (gContentIndex < 0) {
        gContentIndex += Content::Count();
    }
    gContentIndex = gContentIndex % Content::Count();
    
    install_content();
}

void dispatch_draw(C2DContextID ctx) {
    if (gHost) {
        // funny call. do we need it. make it global?
        gHost->content()->setAbsTime(GlobalTime::Secs());

        JSC2DCanvas canvas(ctx);
        gHost->draw(&canvas);
    }
}

enum class MouseEventType {
    down,
    up,
    move,
    hover,
};

void dispatch_mouse_event(float x, float y, int etype) {
    if (gHost) {
        switch ((MouseEventType)etype) {
            case MouseEventType::down:
                flush_mouse_up();
                gClick = gHost->findClick({x, y});
                break;
            case MouseEventType::up:
                flush_mouse_up();
                break;
            case MouseEventType::move:
                if (gClick) {
                    gClick->moved({x, y});
                }
                break;
            case MouseEventType::hover:
                flush_mouse_up();
                // todo: move to view?
                gHost->content()->handleHover({x, y});
                break;
            default:
                printf("UNEXPECTED mouse-event-type %d\n", etype);
                break;
        }
    }
}

static KeyCode str_to_code(const std::string& str) {
    const std::pair<const char*, KeyCode> table[] = {
        {"ArrowUp",    KeyCode::arrow_up},
        {"ArrowDown",  KeyCode::arrow_down},
        {"ArrowLeft",  KeyCode::arrow_left},
        {"ArrowRight", KeyCode::arrow_right},

        {"PageUp",   KeyCode::page_up},
        {"PageDown", KeyCode::page_down},

        {"NumpadEnter", KeyCode::enter_code},
        {"Enter",       KeyCode::return_code},
        {"Escape",      KeyCode::escape_code},
        {"Delete",      KeyCode::delete_code},  // forward_delete?
        {"Backspace",   KeyCode::delete_code},  // backspace?
    };
    
    for (auto p : table) {
        if (str == p.first) {
            return p.second;
        }
    }
    return KeyCode::none;
}

bool dispatch_key_down(std::string codeStr, Unichar uni,
                       bool shift, bool ctrl, bool opt, bool cmd) {
    if (!gHost) {
        return false;
    }

    unsigned modi = 0;
    if (shift) modi |= KeyModifiers::shift;
    if (ctrl ) modi |= KeyModifiers::control;
    if (opt  ) modi |= KeyModifiers::option;
    if (cmd  ) modi |= KeyModifiers::command;

    KeyCode code = str_to_code(codeStr);

    if (code != KeyCode::none) {
        uni = 0;
    }

    // todo: move to view?
    if (gHost->content()->keyDown({uni, uni, code, modi})) {
        return true;
    }
    
    switch (code) {
        case KeyCode::arrow_left:  inc_content(-1); return true;
        case KeyCode::arrow_right: inc_content(+1); return true;
        default:
            break;
    }
    return false;
}

void dispatch_set_keyframe(float time, uintptr_t tagsPtr, uintptr_t valsPtr, size_t N) {
    const int32_t* tags = (const int32_t*)tagsPtr;
    const float*   vals = (const float*  )valsPtr;

    Meta m("set-var-keyframe");
    m.setFloat("time", time);
    m.setInts("tags", {tags, N});
    m.setFloats("values", {vals, N});

    gHost->content()->handleMsg(m);
}

void dispatch_clear_keyframes(float duration) {
    Meta m("clear-keyframes");
    m.setFloat("duration", duration);
    gHost->content()->handleMsg(m);
}

void dispatch_set_sample_text(uintptr_t strPtr) {
    const char* str = (const char*)strPtr;
    size_t len = strlen(str);
    
    Meta m("set-sample-text");
    m.setString("text", str);

    gHost->content()->handleMsg(m);
}

void dispatch_set_font_data(uintptr_t fontData, uint32_t dataLen, bool transferOwnership) {
    auto span = Span{(const uint8_t*)fontData, dataLen};

    rcp<Data> data = transferOwnership ? Data::FromMalloc(span) : Data::Copy(span);
    
    Meta m("set-font-data");
    m.setData("font-data", data);
    gHost->content()->handleMsg(m);
}

uintptr_t dispatch_get_font_axes_json() {
    Meta msg("get-font-axes-json");
    Meta reply("reply");
    if (!gHost->content()->handleMsg(msg, &reply)) {
        return 0;
    }

    auto json = reply.findString("json");
    if (!json.size()) {
        return 0;
    }

    // Copy the answer into a raw malloc buffer, and return that.
    // Our JS caller will need to free it with Module._free(ptr)
    void* buffer = malloc(json.size() + 1);
    memcpy(buffer, json.data(), json.size() + 1);

    return (uintptr_t)buffer;
}

void dispatch_show_outlines(int isOn) {
    Meta msg("toggle-show-outlines");
    msg.setInt("is-on", isOn);
    gHost->content()->handleMsg(msg);
}

void dispatch_set_rgba(float r, float g, float b, float a) {
    float rgba[4] = {r, g, b, a};
    Meta msg("set-color");
    msg.setFloats("rgba", rgba);
    gHost->content()->handleMsg(msg);
}

void dispatch_set_text_size(float size) {
    Meta msg("set-text-size");
    msg.setFloat("text-size", size);
    gHost->content()->handleMsg(msg);
}

void dispatch_set_anim_speed(float speed) {
    Meta msg("set-anim-speed");
    msg.setFloat("speed", speed);
    gHost->content()->handleMsg(msg);
}

void dispatch_play_pause_animation(bool doPlay) {
    Meta msg("play-pause-animation");
    msg.setInt("play", doPlay);
    gHost->content()->handleMsg(msg);
}

EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("create_host", &dispatch_create_host, emscripten::allow_raw_pointers());

    emscripten::function("dispatch_draw", &dispatch_draw);
    emscripten::function("dispatch_mouse_event", &dispatch_mouse_event);
    emscripten::function("dispatch_key_down", &dispatch_key_down);

    emscripten::function("dispatch_set_sample_text", &dispatch_set_sample_text);
    emscripten::function("dispatch_set_keyframe", &dispatch_set_keyframe);
    emscripten::function("dispatch_clear_keyframes", &dispatch_clear_keyframes);
    emscripten::function("dispatch_set_font_data", &dispatch_set_font_data);
    emscripten::function("dispatch_show_outlines", &dispatch_show_outlines);
    emscripten::function("dispatch_set_rgba", &dispatch_set_rgba);
    emscripten::function("dispatch_set_text_size", &dispatch_set_text_size);
    emscripten::function("dispatch_set_anim_speed", &dispatch_set_anim_speed);
    emscripten::function("dispatch_play_pause_animation", &dispatch_play_pause_animation);

    emscripten::function("dispatch_get_font_axes_json", &dispatch_get_font_axes_json);

}
