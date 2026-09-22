#ifndef JELLYFIN3DS_RGB565_H
#define JELLYFIN3DS_RGB565_H

#include <stdint.h>

/* Citro3D's GPU_RGB565 expects red in bits 15..11, blue in 4..0. */
static inline uint16_t j3ds_rgb565(unsigned red, unsigned green, unsigned blue) {
    return (uint16_t)(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3));
}

#endif
