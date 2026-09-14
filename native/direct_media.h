#ifndef JELLYFIN3DS_DIRECT_MEDIA_H
#define JELLYFIN3DS_DIRECT_MEDIA_H

#include <stdbool.h>
#include <stdint.h>

/* The API worker prepares one authenticated stream. The PocketJS media
 * command consumes it after the reply reaches the guest. */
bool direct_media_prepare(const char *url, const char *token,
                          int64_t duration_ticks, int64_t seek_ticks);
void direct_media_forget_prepared(void);

#endif
