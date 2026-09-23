#include <assert.h>
#include <string.h>
#include "../native/stream_profile.h"

int main(void) {
  J3DSStreamProfile old = j3ds_stream_profile(false, false, "native");
  assert(old.width == 256 && old.height == 144 && old.fps == 12);
  assert(strcmp(old.quality, "standard") == 0);
  J3DSStreamProfile old_high = j3ds_stream_profile(false, false, "high");
  assert(old_high.video_kbps == 320 && old_high.fps == 12);
  J3DSStreamProfile new_sw = j3ds_stream_profile(true, false, "native");
  assert(new_sw.width == 400 && new_sw.height == 240 && new_sw.fps == 30);
  assert(new_sw.video_kbps == 850);
  J3DSStreamProfile new_hw = j3ds_stream_profile(true, true, "native");
  assert(new_hw.width == 400 && new_hw.height == 240 && new_hw.fps == 60);
  assert(new_hw.video_kbps == 1200);
  J3DSStreamProfile new_standard = j3ds_stream_profile(true, true, NULL);
  assert(new_standard.fps == 24 && new_standard.video_kbps == 472);
  return 0;
}
