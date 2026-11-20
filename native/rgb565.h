#ifndef JELLYFIN3DS_RGB565_H
#define JELLYFIN3DS_RGB565_H

#include <stdbool.h>
#include <stdint.h>

/* Citro3D's GPU_RGB565 expects red in bits 15..11, blue in 4..0. */
static inline uint16_t j3ds_rgb565(unsigned red, unsigned green, unsigned blue) {
    return (uint16_t)(((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3));
}

static inline unsigned char j3ds_clamp_u8(int x) {
    return x < 0 ? 0 : x > 255 ? 255 : (unsigned char)x;
}

static inline bool j3ds_yuv420p_to_rgb565(const uint8_t *y_plane, int y_stride,
                                          const uint8_t *u_plane, int u_stride,
                                          const uint8_t *v_plane, int v_stride,
                                          uint16_t *pixels, int width, int height) {
    if (!y_plane || !u_plane || !v_plane || !pixels ||
        width <= 0 || height <= 0 || (width & 1) || (height & 1)) {
        return false;
    }
    for (int y = 0; y < height; ++y) {
        const uint8_t *luma = y_plane + y * y_stride;
        const uint8_t *cb = u_plane + (y / 2) * u_stride;
        const uint8_t *cr = v_plane + (y / 2) * v_stride;
        for (int x = 0; x < width; ++x) {
            int c = luma[x] - 16, d = cb[x / 2] - 128, e = cr[x / 2] - 128;
            unsigned r = j3ds_clamp_u8((298 * c + 409 * e + 128) >> 8);
            unsigned g = j3ds_clamp_u8((298 * c - 100 * d - 208 * e + 128) >> 8);
            unsigned b = j3ds_clamp_u8((298 * c + 516 * d + 128) >> 8);
            pixels[y * width + x] = j3ds_rgb565(r, g, b);
        }
    }
    return true;
}

#endif
