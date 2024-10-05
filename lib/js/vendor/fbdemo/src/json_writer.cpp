/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/json_writer.h"

using namespace pentrek;

JSONWriter::JSONWriter(Writer& w, int tabSize) : m_writer(w), m_tabSize(tabSize) {
    m_writer.write("{");
    m_tab = 1;
    m_stack.push_back(kInStruct);
}

JSONWriter::~JSONWriter() {
    this->finish();
}

void JSONWriter::finish() {
    if (m_stack.size() == 0) {
        return;
    }

    while (m_stack.size() > 0) {
        switch (m_stack.back().m_state) {
            case kInArray:
                this->endArray();
                break;
            case kInStruct:
                this->endStruct();
                break;
        }
    }
    m_writer.write("\n");
}

bool JSONWriter::inState(State s) const {
    assert(m_stack.size() > 0);
    return m_stack.back().m_state == s;
}

bool JSONWriter::isEmpty() const {
    assert(m_stack.size() > 0);
    return m_stack.back().m_empty;
}

void JSONWriter::tab() {
    m_writer.writef("%*c", m_tabSize * m_tab, ' ');
}

void JSONWriter::finishPrev() {
    auto& pair = m_stack.back();
    if (!pair.m_empty) {
        m_writer.write(",");
    }
    pair.m_empty = false;
    m_writer.write("\n");
}

void JSONWriter::string(const char value[]) {
    assert(this->inState(kInArray));
    this->finishPrev();
    this->tab();
    m_writer.writef(" \"%s\"", value);
}

void JSONWriter::number(double value) {
    assert(this->inState(kInArray));
    this->finishPrev();
    this->tab();
    m_writer.writef(" %g", value);
}

void JSONWriter::boolean(bool value) {
    assert(this->inState(kInArray));
    this->finishPrev();
    this->tab();
    m_writer.writef(" %s", value ? "true" : "false");
}

void JSONWriter::string(const char key[], const char value[]) {
    this->finishPrev();
    this->tab();
    m_writer.writef("\"%s\": \"%s\"", key, value);
}

void JSONWriter::number(const char key[], double value) {
    this->finishPrev();
    this->tab();
    m_writer.writef("\"%s\": %g", key, value);
}

void JSONWriter::boolean(const char key[], bool value) {
    this->finishPrev();
    this->tab();
    m_writer.writef("\"%s\": %s", key, value ? "true" : "false");
}

void JSONWriter::beginArray(const char key[]) {
    this->finishPrev();
    this->tab();
    if (key) {
        m_writer.writef("\"%s\": [", key);
    } else {
        m_writer.write("[");
    }
    m_tab += 1;
    m_stack.push_back(kInArray);
}

void JSONWriter::endArray() {
    assert(this->inState(kInArray));

    assert(m_tab > 0);
    m_tab -= 1;

    if (!m_stack.back().m_empty) {
        m_writer.write("\n");
        this->tab();
    }
    m_writer.write("]");

    m_stack.pop_back();
}

void JSONWriter::beginStruct(const char key[]) {
    this->finishPrev();
    this->tab();
    if (key) {
        m_writer.writef("\"%s\": {", key);
    } else {
        m_writer.write("{");
    }
    m_tab += 1;
    m_stack.push_back(kInStruct);
}

void JSONWriter::endStruct() {
    assert(this->inState(kInStruct));

    assert(m_tab > 0);
    m_tab -= 1;

    if (!m_stack.back().m_empty) {
        m_writer.write("\n");
        this->tab();
    }
    m_writer.write("}");

    m_stack.pop_back();
}

///////////////////////////

void JSONWriter::Tests() {
    PrintfWriter w;
    
    {
        JSONWriter jw(w);
    }
    {
        JSONWriter jw(w);
        JSONWriter::AutoArray aa(jw, "empty-array");
    }
    {
        JSONWriter jw(w);
        JSONWriter::AutoStruct aa(jw, "empty-struct");
    }
    {
        JSONWriter jw(w, 2);
        jw.string("Hello", "world");
        jw.number("Answer", 42);
        jw.boolean("Predicate", true);
        jw.boolean("Or Else", false);
    }
    
    {
        JSONWriter jw(w);
        JSONWriter::AutoArray aa(jw, "array");
        jw.string("string");
        jw.number(42);
        jw.boolean(true);
    }
    
    
    {
        JSONWriter jw(w, 2);
        JSONWriter::AutoStruct as(jw, "struct");
        jw.string("string", "abc");
        jw.number("number", 123);
        jw.boolean("bool", true);
    }
    
    {
        JSONWriter jw(w, 2);
        JSONWriter::AutoArray as(jw, "array");
        jw.beginStruct();
        jw.string("string", "str");
        jw.number("number", 1);
        jw.endStruct();

        jw.beginStruct();
        jw.string("string", "ing");
        jw.number("number", 2);
        jw.endStruct();
    }
}
