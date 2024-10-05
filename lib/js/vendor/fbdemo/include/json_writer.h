/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_json_writer_h_
#define _pentrek_json_writer_h_

#include "include/writer.h"

namespace pentrek {

class JSONWriter {
public:
    JSONWriter(Writer&, int tabSize = 4);
    ~JSONWriter();

    // automatically called by destructor.
    // can be safely called more than once
    void finish();

    // these only make sense inside arrays
    void string(const char str[]);
    void number(double);
    void boolean(bool);

    void string(const char key[], const char value[]);
    void number(const char key[], double value);
    void boolean(const char key[], bool value);

    void beginArray(const char key[] = nullptr);
    void endArray();
    
    void beginStruct(const char key[] = nullptr);
    void endStruct();
    
    struct AutoArray {
        JSONWriter& m_writer;
        AutoArray(JSONWriter& w, const char key[] = nullptr) : m_writer(w) {
            m_writer.beginArray(key);
        }
        ~AutoArray() {
            m_writer.endArray();
        }
    };
    
    struct AutoStruct {
        JSONWriter& m_writer;
        AutoStruct(JSONWriter& w, const char key[] = nullptr) : m_writer(w) {
            w.beginStruct(key);
        }
        ~AutoStruct() {
            m_writer.endStruct();
        }
    };

    static void Tests();

private:
    enum State : uint8_t {
        kInStruct,
        kInArray,
    };

    void tab();
    bool inState(State s) const;
    bool isEmpty() const;
    void finishPrev();

    Writer& m_writer;
    const int m_tabSize;
    int m_tab;

    struct Pair {
        State m_state;
        bool m_empty;
        
        Pair(State s) : m_state(s), m_empty(true) {}
    };
    std::vector<Pair> m_stack;
};

} // namespace

#endif
