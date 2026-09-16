#include "../native/artwork.h"
#include <assert.h>
int main(void) {
  uint8_t pixels[256 * 144 * 4]; memset(pixels, 157, sizeof pixels);
  uint8_t *image = artwork_canvas(pixels, 256, 144); assert(image);
  assert(!memcmp(image, pixels, sizeof pixels));
  for (int i = sizeof pixels; i < 256*256*4; ++i) assert(!image[i]);
  free(image);
  image = artwork_canvas(pixels, 95, 143); assert(image);
  assert(image[80*4] == 157 && image[79*4] == 0 && image[175*4] == 0);
  free(image);
  assert(!artwork_canvas(pixels, 257, 144)); assert(!artwork_canvas(pixels, 0, 144));
  assert(!artwork_canvas(NULL, 1, 1));
}
