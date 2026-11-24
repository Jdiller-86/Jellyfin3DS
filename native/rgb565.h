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
    for (int y = 0; y < height; y += 2) {
        const uint8_t *luma0 = y_plane + y * y_stride;
        const uint8_t *luma1 = luma0 + y_stride;
        const uint8_t *cb = u_plane + (y >> 1) * u_stride;
        const uint8_t *cr = v_plane + (y >> 1) * v_stride;
        uint16_t *dst0 = pixels + y * width;
        uint16_t *dst1 = dst0 + width;
        for (int x = 0; x < width; x += 2) {
            int d = cb[x >> 1] - 128, e = cr[x >> 1] - 128;
            int r_off = 409 * e + 128;
            int g_off = -100 * d - 208 * e + 128;
            int b_off = 516 * d + 128;
            int c00 = 298 * (luma0[x] - 16);
            int c01 = 298 * (luma0[x + 1] - 16);
            int c10 = 298 * (luma1[x] - 16);
            int c11 = 298 * (luma1[x + 1] - 16);
            dst0[x]     = j3ds_rgb565(j3ds_clamp_u8((c00 + r_off) >> 8), j3ds_clamp_u8((c00 + g_off) >> 8), j3ds_clamp_u8((c00 + b_off) >> 8));
            dst0[x + 1] = j3ds_rgb565(j3ds_clamp_u8((c01 + r_off) >> 8), j3ds_clamp_u8((c01 + g_off) >> 8), j3ds_clamp_u8((c01 + b_off) >> 8));
            dst1[x]     = j3ds_rgb565(j3ds_clamp_u8((c10 + r_off) >> 8), j3ds_clamp_u8((c10 + g_off) >> 8), j3ds_clamp_u8((c10 + b_off) >> 8));
            dst1[x + 1] = j3ds_rgb565(j3ds_clamp_u8((c11 + r_off) >> 8), j3ds_clamp_u8((c11 + g_off) >> 8), j3ds_clamp_u8((c11 + b_off) >> 8));
        }
    }
    return true;
}

#endif
