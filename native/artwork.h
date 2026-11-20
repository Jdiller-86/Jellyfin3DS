#ifndef JFIN_ARTWORK_H
#define JFIN_ARTWORK_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
/* PocketJS accepts only power-of-two texture dimensions. Center the image
 * in the visible 256x144 region of a transparent 256x256 texture. */
static uint8_t *artwork_canvas(const uint8_t *rgba, int width, int height) {
  if (!rgba || width < 1 || height < 1 || width > 512 || height > 512) return NULL;
  uint8_t *canvas = calloc(256 * 256, 4);
  if (!canvas) return NULL;
  int w = width, h = height;
  if (w > 256) { h = h * 256 / w; w = 256; }
  if (h > 144) { w = w * 144 / h; h = 144; }
  if (w < 1) w = 1;
  if (h < 1) h = 1;
  int x = (256 - w) / 2, y = (144 - h) / 2;
  for (int row = 0; row < h; ++row)
    for (int col = 0; col < w; ++col)
      memcpy(canvas + ((y + row) * 256 + x + col) * 4,
             rgba + ((row * height / h) * width + col * width / w) * 4, 4);
  return canvas;
}
#endif
