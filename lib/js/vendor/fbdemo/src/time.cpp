/*
 *  Copyright Pentrek Inc, 2022
 */

#include "include/time.h"
#include <sys/time.h>

using namespace pentrek;

double GlobalTime::Secs() {
    struct timeval tv;

    if (gettimeofday(&tv, NULL)) {
        return 0;
    } else {
        constexpr double invMicroSeconds = 1.0 / (1000 * 1000);
        return tv.tv_sec + tv.tv_usec * invMicroSeconds;
    }
}


