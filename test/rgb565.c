#include <assert.h>
#include <stddef.h>
#include "../native/rgb565.h"

int main(void) {
    assert(j3ds_rgb565(255, 0, 0) == 0xf800);
    assert(j3ds_rgb565(0, 255, 0) == 0x07e0);
    assert(j3ds_rgb565(0, 0, 255) == 0x001f);
    assert(j3ds_rgb565(255, 255, 0) == 0xffe0);

    uint8_t y[4] = {16, 235, 16, 235};
    uint8_t u[1] = {128};
    uint8_t v[1] = {128};
    uint16_t out[4] = {0};
    assert(j3ds_yuv420p_to_rgb565(y, 2, u, 1, v, 1, out, 2, 2));
    assert(out[0] == 0x0000 && out[1] == 0xffff);
    assert(out[2] == 0x0000 && out[3] == 0xffff);

    /* Red-ish chroma (Cr=240, Cb=90) clamps cleanly without overflow. */
    uint8_t y_red[4] = {82, 82, 82, 82}, u_red[1] = {90}, v_red[1] = {240};
    assert(j3ds_yuv420p_to_rgb565(y_red, 2, u_red, 1, v_red, 1, out, 2, 2));
    assert((out[0] >> 11) >= 28 && (out[0] & 31) <= 2);

    /* Reject odd or zero dimensions and null planes. */
    assert(!j3ds_yuv420p_to_rgb565(y, 2, u, 1, v, 1, out, 3, 2));
    assert(!j3ds_yuv420p_to_rgb565(y, 2, u, 1, v, 1, out, 0, 2));
    assert(!j3ds_yuv420p_to_rgb565(NULL, 2, u, 1, v, 1, out, 2, 2));
    return 0;
}
