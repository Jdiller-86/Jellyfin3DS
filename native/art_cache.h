#ifndef JFIN_ART_CACHE_H
#define JFIN_ART_CACHE_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define ART_CACHE_SLOTS 8
#define ART_CACHE_BYTES (256u * 256u * 4u)
typedef struct { char key[129]; uint8_t *pixels; unsigned age; } ArtCacheEntry;
static ArtCacheEntry art_cache[ART_CACHE_SLOTS];
static unsigned art_clock;
static void art_cache_clear(void) {
  for (int i=0;i<ART_CACHE_SLOTS;i++) { free(art_cache[i].pixels); memset(&art_cache[i],0,sizeof art_cache[i]); }
  art_clock=0;
}
static uint8_t *art_cache_get(const char *key) {
  for (int i=0;i<ART_CACHE_SLOTS;i++) if (art_cache[i].pixels && !strcmp(key,art_cache[i].key)) {
    art_cache[i].age=++art_clock; return art_cache[i].pixels;
  }
  return NULL;
}
/* Consumes pixels; cache is at most 2 MiB and lives only on the API worker. */
static void art_cache_put(const char *key, uint8_t *pixels) {
  int slot=0;
  if (strlen(key)>=sizeof art_cache[0].key) { free(pixels); return; }
  for (int i=0;i<ART_CACHE_SLOTS;i++) {
    if (!art_cache[i].pixels || !strcmp(key,art_cache[i].key)) { slot=i; break; }
    if (art_cache[i].age<art_cache[slot].age) slot=i;
  }
  free(art_cache[slot].pixels); art_cache[slot].pixels=pixels;
  strcpy(art_cache[slot].key,key); art_cache[slot].age=++art_clock;
}
#endif
