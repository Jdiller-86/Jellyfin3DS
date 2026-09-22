#include <assert.h>
#include "../native/rgb565.h"

int main(void) {
    assert(j3ds_rgb565(255, 0, 0) == 0xf800);
    assert(j3ds_rgb565(0, 255, 0) == 0x07e0);
    assert(j3ds_rgb565(0, 0, 255) == 0x001f);
    assert(j3ds_rgb565(255, 255, 0) == 0xffe0);
    return 0;
}
