/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_events_h_
#define _pentrek_events_h_

#include "include/pentrek_types.h"

namespace pentrek {

enum KeyModifiers {
    shift   = 1 << 0,
    control = 1 << 1,
    option  = 1 << 2,
    command = 1 << 3,
    
    _all = 0xF,
};

enum class KeyCode {
    none,
    
    arrow_up,
    arrow_down,
    arrow_left,
    arrow_right,
    
    page_up,
    page_down,
    
    enter_code,
    return_code,
    escape_code,
    delete_code,
    
    _last_code = delete_code,
};

struct KeyEvent {
    Unichar  m_char;
    Unichar  m_raw;
    KeyCode  m_code;
    unsigned m_modi;
    
    bool isCode() const { return m_code != KeyCode::none; }
    bool isUni() const  { return m_code == KeyCode::none; }
    
    Unichar uni() const { return m_char; }
    Unichar raw() const { return m_raw; }
    KeyCode code() const { return m_code; }
    unsigned modi() const { return m_modi; }
};

} // namespace

#endif
