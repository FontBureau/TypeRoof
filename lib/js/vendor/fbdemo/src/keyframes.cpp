#include "include/keyframes.h"
#include "include/math.h"
#include <stdio.h>

using namespace pentrek;

constexpr Point gDefaultCubics[2] = {
    {1.0f/3, 1.0f/3}, {2.0f/3, 2.0f/3},
};
static inline const Point* check_default_cubics(const Point cubics[2]) {
    return cubics ? cubics : gDefaultCubics;
}

#ifdef DEBUG
void KeyFrames::validate() const {
    assert(m_valueCount >= 0);
    assert(m_values.size() == m_times.size() * m_valueCount);
    assert(m_cubics.size() == m_times.size());
}
#endif

KeyFrames::Key KeyFrames::at(int index) const {
    auto cubics = m_cubics[index].pts();

    return {
        m_times[index],
        Span(&m_values[index * m_valueCount], m_valueCount),
        {cubics[0], cubics[1]},
    };
}

void KeyFrames::copyValues(size_t index, float outValues[]) const {
    if (outValues) {
        assert(index < m_times.size());
        size_t offset = index * m_valueCount;
        assert(offset + m_valueCount <= m_values.size());
        auto iter = m_values.begin() + offset;
        std::copy(iter, iter + m_valueCount, outValues);
    }
}

KeyFrames::Sample KeyFrames::sample(float time, Span<float> out) const {
    this->validate();

    if (m_times.size() == 0) {
        return {-1, -1, -1};
    }

    const float first = m_times.front();
    const float last  = m_times.back();

    float* outValues = out.data();
    if (outValues) {
        assert(out.size() == m_valueCount);
    }

    if (m_times.size() == 1) {
        this->copyValues(0, outValues);
        return {0, 0, 0};
    }
    if (time <= first) {
        this->copyValues(0, outValues);
        return {0, 1, 0};
    }
    if (time >= last) {
        int index = castTo<int>(m_times.size() - 1);
        assert(index > 0);
        this->copyValues(m_times.size() - 1, outValues);
        return {index - 1, index, 1};
    }

    auto iter = std::lower_bound(m_times.begin(), m_times.end(), time);
    assert(iter != m_times.end());
    assert(iter != m_times.begin());
    size_t next = iter - m_times.begin();
    size_t prev = next - 1;

    float t = (time - m_times[prev]) / (m_times[next] - m_times[prev]);
    assert(float_is_unit(t));

    // we use the "next" cubic for the span between prev and next
    // thus we'd never use m_cubics[0]
    t = m_cubics[next].x_to_y(t);
    assert(float_is_unit(t));

    if (outValues) {
        const float* from = &m_values[prev * m_valueCount];
        const float* to   = from + m_valueCount;
        for (int i = 0; i < m_valueCount; ++i) {
            outValues[i] = lerp(from[i], to[i], t);    // todo: s-curve
        }
    }
    return {castTo<int>(prev), castTo<int>(next), t};
}

void KeyFrames::insertValues(size_t index, const float values[], const Point cubics[2]) {
    assert(cubics);
    assert(index < m_times.size());
    auto iter = m_values.begin() + index * m_valueCount;
    m_values.insert(iter, values, values + m_valueCount);
    m_cubics.insert(m_cubics.begin() + index, CubicUnit(cubics[0], cubics[1]));
}

void KeyFrames::addFrame(float time, const float values[], const Point cubics[2]) {
    assert(m_valueCount == 0 || values != nullptr);

    cubics = check_default_cubics(cubics);

    if (m_times.size() == 0) {
        m_times.push_back(time);
        this->insertValues(0, values, cubics);
        return;
    }
    
    auto iter = std::lower_bound(m_times.begin(), m_times.end(), time);
    const size_t index = iter - m_times.begin();

    if (iter != m_times.end() && *iter == time) {
        // overwrite
        std::copy(values, values + m_valueCount, m_values.begin() + index * m_valueCount);
        m_cubics[index] = CubicUnit(cubics[0], cubics[1]);
    } else {
        m_times.insert(iter, time);
        this->insertValues(index, values, cubics);
    }
    
    this->validate();
}

void KeyFrames::removeAll() {
    m_times.clear();
    m_values.clear();
    m_cubics.clear();
}

void KeyFrames::cubicsAt(int index, Point a, Point b) {
    assert(index >= 0 && (unsigned)index < m_cubics.size());
    m_cubics[index] = CubicUnit(a, b);
}


void KeyFrames::dump() const {
    this->validate();

    printf("%zu keyframes\n", m_times.size());
    size_t offset = 0;
    for (size_t i = 0; i < m_times.size(); ++i) {
        printf("time:[%g] [", m_times[i]);
        for (int j = 0; j < m_valueCount; ++j) {
            printf(" %g", m_values[offset + j]);
        }
        offset += m_valueCount;
        printf(" ]\n");
    }
}

///////////////////////////

void KeyFrames::Tests() {
#ifdef DEBUG
    {
        KeyFrames tm(2);
        const Point pts[] = {
            {3, 30}, {1, 10}, {2, 20}, {0, 0}
        };
        
        for (auto p : pts) {
            tm.addFrame(p.x, p.floats());
            tm.addFrame(p.x, p.floats());
        }
        tm.dump();

        for (float t = 0; t <= 3; t += 1.0f/4) {
            Point p;
            tm.sample(t, p.floats());
            assert(p.x == t);
            assert(p.y == t*10);
        }
        
    }

    {
        MatrixParts m0, m1, tmp;
        m0.m_trans = {4, 6};
        m1.m_scale = {3, 5};
        KeyFrames tm(MatrixParts::FloatCount());
        tm.addFrame(0, m0.floats());
        tm.addFrame(1, m1.floats());
        tm.sample(0.5f, tmp.floats());
        auto mx = tmp.compose();
        assert(mx == Matrix(2, 0, 0, 3, 2, 3));
    }
    
    {
        KeyFrames tm(1);
        tm.addFrameValue(1, 0);
        tm.addFrameValue(2, 0);
        tm.addFrameValue(4, 0);

        struct {
            float time;
            Sample expected;
        } const recs[] = {
            {0, {0, 1, 0}},
            {1, {0, 1, 0}},

            {1.5f, {0, 1, 0.5f}},
            {3,    {1, 2, 0.5f}},

            {4, {1, 2, 1}},
            {5, {1, 2, 1}},
        };
        for (auto r : recs) {
            auto s = tm.sample(r.time);
            assert(s == r.expected);
        }
    }
    
    {
        KeyFrames tm(0);
        tm.addFrame(0, nullptr);
        tm.addFrame(1, nullptr);
        tm.addFrame(9, nullptr);
        auto s = tm.sample(5);
        assert(s.m_from == 1 && s.m_to == 2 && s.m_t == 0.5f);
    }
    
    {
        KeyFrames tm(0);
        tm.addFrame(0, nullptr);
        tm.addFrame(1, nullptr);
        auto s = tm.sample(0.5);
        assert(s.m_t == 0.5f);
        
        // fast start, slow finish
        Point cubics[2] = {{0, 1}, {0, 1}};
        tm.addFrame(1, nullptr, cubics);
        s = tm.sample(0.5f);
        assert(s.m_t > 0.99f);
        
        // slow start, fast finish
        cubics[0] = {1, 0};
        cubics[1] = {1, 0};
        tm.addFrame(1, nullptr, cubics);
        s = tm.sample(0.5f);
        assert(s.m_t < 0.01f);
    }
#endif
}

Matrix MatrixParts::compose() const {
    return Matrix::Trans(m_origin + m_trans)
         * Matrix::Rotate(m_radians)
         * Matrix::Skew(m_skew)
         * Matrix::Scale(m_scale)
         * Matrix::Trans(-m_origin);
}

void MatrixParts::Tests() {
    MatrixParts mp;
    assert(mp.compose() == Matrix());
    
    mp.m_scale = {2, 3};
    mp.m_trans = {4, 5};
    assert(mp.compose() == Matrix(2, 0, 0, 3, 4, 5));
    
    mp.m_trans = {0, 0};
    mp.m_origin = {1, 1};
    assert(mp.compose() == Matrix(2, 0, 0, 3, -1, -2));
}
