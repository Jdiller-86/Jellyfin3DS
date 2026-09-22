#include "../native/artwork.h"
#include "../native/art_cache.h"
#include <assert.h>
#include <stdio.h>
int main(void) {
  uint8_t pixels[256 * 144 * 4]; memset(pixels, 157, sizeof pixels);
  uint8_t *image = artwork_canvas(pixels, 256, 144); assert(image);
  assert(!memcmp(image, pixels, sizeof pixels));
  for (int i = sizeof pixels; i < 256*256*4; ++i) assert(!image[i]);
  free(image);
  image = artwork_canvas(pixels, 95, 143); assert(image);
  assert(image[80*4] == 157 && image[79*4] == 0 && image[175*4] == 0);
  free(image);
  assert(!artwork_canvas(pixels, 513, 144)); assert(!artwork_canvas(pixels, 0, 144));
  assert(!artwork_canvas(NULL, 1, 1));
  uint8_t *big=malloc(512*512*4); memset(big,77,512*512*4);
  image=artwork_canvas(big,512,512); assert(image);
  assert(image[56*4]==77 && image[55*4]==0 && image[200*4]==0);
  free(image);free(big);
  char key[16];
  for(int i=0;i<8;i++){ snprintf(key,sizeof key,"%d",i); art_cache_put(key,calloc(1,ART_CACHE_BYTES)); }
  assert(art_cache_get("0"));
  art_cache_put("8",calloc(1,ART_CACHE_BYTES));
  assert(art_cache_get("0") && !art_cache_get("1") && art_cache_get("8"));
  art_cache_clear(); assert(!art_cache_get("0") && !art_cache_get("8"));
}
