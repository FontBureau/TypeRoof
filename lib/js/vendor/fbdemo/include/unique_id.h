
/*
 *  Copyright Pentrek Inc, 2022
 */

#ifndef _pentrek_unique_id_h_
#define _pentrek_unique_id_h_

#include "include/refcnt.h"

namespace pentrek {

class UniqueIDRefCnt : public RefCnt {
    const UniqueID m_uniqueID;
    
public:
    UniqueIDRefCnt();
    
    UniqueID uniqueID() const { return m_uniqueID; }
};

} // namespace

#endif
