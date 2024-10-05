/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_keyframes_h_
#define _pentrek_keyframes_h_

#include "include/cubic_unit.h"
#include "include/point.h"
#include "include/matrix.h"
#include "include/span.h"
#include <vector>

namespace pentrek {

class KeyFrames {
    const int m_valueCount;
    std::vector<float> m_times;
    std::vector<float> m_values;        // m_valueCount * m_times.size()
    std::vector<CubicUnit> m_cubics;    // m_times.size()
    
    void copyValues(size_t index, float values[]) const;
    void insertValues(size_t index, const float values[], const Point cubics[2]);
    
public:
    KeyFrames(int valueCount) : m_valueCount(valueCount) {}
    
    int frameCount() const { return castTo<int>(m_times.size()); }
    int valueCount() const { return m_valueCount; }

    struct Key {
        float time;
        Span<const float> values;
        Point cubics[2];
    };
    Key at(int index) const;
    Key operator[](int index) const { return this->at(index); }

    void cubicsAt(int index, Point a, Point b);

    struct Sample {
        int   m_from,
              m_to;
        float m_t;  // 0..1 between m_from and m_to
        
        bool operator==(const Sample& o) const {
            return m_from == o.m_from && m_to == o.m_to && m_t == o.m_t;
        }
        bool operator!=(const Sample& o) const { return !(*this == o); };
    };

    Sample sample(float time, Span<float> span) const;
    Sample sample(float time) const {
        return this->sample(time, {nullptr, 0});
    }

    void addFrame(float time, const float[], const Point cubics[2] = nullptr);
    void addFrame(float time, Span<const float> span, const Point cubics[2] = nullptr) {
        assert((int)span.size() == m_valueCount);
        this->addFrame(time, span.data(), cubics);
    }
    void addFrameValue(float time, float value, const Point cubics[2] = nullptr) {
        this->addFrame(time, {&value, 1}, cubics);
    }
    
    void removeAll();
    
    void dump() const;
    
    static void Tests();
    
#ifdef DEBUG
    void validate() const;
#else
    void validate() const {}
#endif
};

struct MatrixParts {
    Point m_origin = {},
          m_scale = {1, 1},
          m_skew = {};
    float m_radians = 0;
    Point m_trans = {};

    Span<float> floats() { return {&m_origin.x, 9}; }
    Span<const float> floats() const { return {&m_origin.x, 9}; }

    Matrix compose() const;
    
    static int FloatCount() { return 9; }
    static void Tests();
};

} // namespace

#endif
