#ifndef JELLYFIN3DS_STREAM_PROFILE_H
#define JELLYFIN3DS_STREAM_PROFILE_H

#include <stdbool.h>
#include <string.h>

typedef struct {
  const char *quality;
  int width, height, fps, video_kbps;
} J3DSStreamProfile;

/* Keep the original-model stream within its known software decode budget.
 * New-model Native is explicit, with 60 fps limited to the MVD opt-in. */
static inline J3DSStreamProfile j3ds_stream_profile(bool new_model, bool mvd,
                                                    const char *requested) {
  bool native = new_model && requested && strcmp(requested, "native") == 0;
  bool high = requested && strcmp(requested, "high") == 0;
  if (native) return (J3DSStreamProfile){"native", 400, 240, mvd ? 60 : 30,
                                           mvd ? 1200 : 850};
  if (new_model && mvd) return (J3DSStreamProfile){high ? "high" : "standard",
                                                   400, 240, 24, high ? 700 : 472};
  return (J3DSStreamProfile){high ? "high" : "standard",
                             256, 144, 12, high ? 320 : 192};
}

#endif
