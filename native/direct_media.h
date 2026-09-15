#ifndef JELLYFIN3DS_DIRECT_MEDIA_H
#define JELLYFIN3DS_DIRECT_MEDIA_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

/* The API worker prepares one authenticated stream. The PocketJS media
 * command consumes it after the reply reaches the guest. */
bool direct_media_prepare(const char *url, const char *token,
                          int64_t duration_ticks, int64_t seek_ticks);
void direct_media_forget_prepared(void);
bool direct_media_has_mvd(void);
/* Takes ownership of RGBA pixels; only the main thread uploads the texture. */
int direct_art_upload(uint8_t *pixels, int width, int height);

/* 1: accepted, 0: cancelled, -1: unavailable. Input is never logged. */
int direct_keyboard_input(const char *hint, const char *initial, int limit,
                          bool password, char *out, size_t capacity);
void direct_keyboard_poll(void);
void direct_keyboard_cancel(void);

#endif
