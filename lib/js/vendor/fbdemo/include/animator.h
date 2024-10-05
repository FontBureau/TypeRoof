/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_animator_h
#define _pentrek_animator_h

#include "include/pentrek_types.h"

namespace pentrek {

class Animator {
public:
    enum Tiling {
        kClamp,
        kRepeat,
        kMirror,
    };
    
    Tiling tiling() const { return m_tiling; }
    void tiling(Tiling tm) { m_tiling = tm; }
    
    double duration() const { return m_duration; }
    void duration(double d) { m_duration = d; }
    
    double speed() const { return m_speed; }
    void speed(double s) { m_speed = s; }
    
    bool isRunning() const { return m_running; }
    bool isStopped() const { return !m_running; }
    
    bool isFinished() {
        return m_tiling == kClamp && this->time() == m_duration;
    }
    
    void run() { m_running = true; }
    void stop() { m_running = false; }
    void toggle() { m_running = !m_running; }
    
    void rewind() { m_startTime = -1; }
    void setTime(double secs) {
        assert(secs > 0);
        m_currTime = secs;
    }
    
    double time() {
        if (m_startTime < 0) {
            m_startTime = m_currTime;
        }
        auto rel = (m_currTime - m_startTime) * m_speed;
        switch (m_tiling) {
            case kClamp:
                rel = std::min(std::max(rel, 0.0), m_duration);
                break;
            case kRepeat:
                rel = std::fmod(rel, m_duration);
                break;
            case kMirror:
                rel = std::fmod(rel, m_duration * 2);
                if (rel > m_duration) {
                    rel = 2 * m_duration - rel;
                }
                break;
        }
        return rel;
    }
    
    double percentTime() {
        return this->time() / m_duration;
    }
    
private:
    double m_startTime = -1,
           m_currTime = 0,
           m_speed = 1,
           m_duration = 1;
    Tiling m_tiling = kClamp;
    bool m_running = false;
};

} // namespace

#endif
