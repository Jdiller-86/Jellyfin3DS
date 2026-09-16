#ifndef JFIN_ARTWORK_H
#define JFIN_ARTWORK_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
/* PocketJS accepts only power-of-two texture dimensions. Center the image
 * in the visible 256x144 region of a transparent 256x256 texture. */
static uint8_t *artwork_canvas(const uint8_t *rgba, int width, int height) {
  if (!rgba || width < 1 || height < 1 || width > 256 || height > 144) return NULL;
  uint8_t *canvas = calloc(256 * 256, 4);
  if (!canvas) return NULL;
  int x = (256 - width) / 2, y = (144 - height) / 2;
  for (int row = 0; row < height; ++row)
    memcpy(canvas + ((y + row) * 256 + x) * 4, rgba + row * width * 4, width * 4);
  return canvas;
}
#endif
