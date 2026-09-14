#include "media.h"
#include "direct_media.h"
#include "pocket_core.h"
#include "video/video_player.h"
#include "util/log.h"

#include <3ds.h>
#include <citro3d.h>
#include <curl/curl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define DIRECT_URL_MAX 2048
#define DIRECT_TOKEN_MAX 256

typedef struct {
  char url[DIRECT_URL_MAX];
  char token[DIRECT_TOKEN_MAX];
  int64_t duration_ticks;
  int64_t seek_ticks;
  unsigned generation;
  bool ready;
} PreparedStream;

static PreparedStream prepared;
static LightLock prepared_lock;
static bool started;
static bool ndsp_ready;
static Result ndsp_result;
static bool requested_open;
static bool has_frame;
static bool desired_paused;
static bool hardware_supported;
static float desired_volume = 0.8f;
static int32_t texture_handle = -1;
static unsigned generation;

static void copy_text(char *out, size_t capacity, const char *value) {
  if (!capacity) return;
  snprintf(out, capacity, "%s", value ? value : "");
}

bool direct_media_prepare(const char *url, const char *token,
                          int64_t duration_ticks, int64_t seek_ticks) {
  if (!started || !url || !token ||
      (strncmp(url, "http://", 7) != 0 && strncmp(url, "https://", 8) != 0) ||
      strlen(url) >= DIRECT_URL_MAX ||
      strlen(token) >= DIRECT_TOKEN_MAX || duration_ticks < 0 || seek_ticks < 0) {
    return false;
  }
  LightLock_Lock(&prepared_lock);
  copy_text(prepared.url, sizeof prepared.url, url);
  copy_text(prepared.token, sizeof prepared.token, token);
  prepared.duration_ticks = duration_ticks;
  prepared.seek_ticks = seek_ticks;
  prepared.generation = ++generation;
  prepared.ready = true;
  LightLock_Unlock(&prepared_lock);
  return true;
}

void direct_media_forget_prepared(void) {
  LightLock_Lock(&prepared_lock);
  memset(&prepared, 0, sizeof prepared);
  LightLock_Unlock(&prepared_lock);
}

bool media_start(void) {
  LightLock_Init(&prepared_lock);
  memset(&prepared, 0, sizeof prepared);
  curl_global_init(CURL_GLOBAL_DEFAULT);
  log_init();
  video_player_init();
  hardware_supported = video_player_is_supported();
  ndsp_result = ndspInit();
  ndsp_ready = R_SUCCEEDED(ndsp_result);
  if (ndsp_ready) ndspSetOutputMode(NDSP_OUTPUT_STEREO);
  started = true;
  return true;
}

void media_stop(void) {
  if (!started) return;
  video_player_cleanup();
  if (ndsp_ready) ndspExit();
  log_close();
  curl_global_cleanup();
  direct_media_forget_prepared();
  started = false;
  ndsp_ready = false;
  requested_open = false;
  has_frame = false;
  texture_handle = -1;
}

bool media_open(const char *host, unsigned port, const char *token) {
  (void)host;
  (void)port;
  (void)token;
  if (!started || !ndsp_ready || !hardware_supported) return false;

  PreparedStream next;
  LightLock_Lock(&prepared_lock);
  if (!prepared.ready) {
    LightLock_Unlock(&prepared_lock);
    return false;
  }
  next = prepared;
  memset(&prepared, 0, sizeof prepared);
  LightLock_Unlock(&prepared_lock);

  requested_open = true;
  has_frame = false;
  desired_paused = false;
  bool opened = video_player_play(next.url, next.token, next.duration_ticks,
                                  next.seek_ticks, VP_3D_NONE);
  if (!opened) requested_open = false;
  return opened;
}

void media_close(void) {
  requested_open = false;
  desired_paused = false;
  has_frame = false;
  direct_media_forget_prepared();
  video_player_stop();
}

void media_paused(bool paused) {
  desired_paused = paused;
}

void media_volume(float volume) {
  if (!isfinite(volume)) volume = 0.0f;
  if (volume < 0.0f) volume = 0.0f;
  if (volume > 1.0f) volume = 1.0f;
  desired_volume = volume;
}

int32_t media_texture_handle(void) {
  if (texture_handle < 0 && started) {
    uint8_t *blank = calloc(512u * 256u, 2u);
    if (blank) {
      texture_handle = ui_upload_texture(blank, 512u * 256u * 2u,
                                         512, 256, 0);
      free(blank);
    }
  }
  return texture_handle;
}

void media_forget_guest(void) {
  media_close();
  texture_handle = -1;
}

C3D_Tex *media_texture(int32_t handle, float *u_scale, float *v_scale) {
  if (!requested_open || handle < 0 || handle != texture_handle) return NULL;
  C3D_Tex *texture = video_player_texture(u_scale, v_scale);
  if (texture) has_frame = true;
  return texture;
}

void media_present(void) {
  if (!requested_open) return;

  video_status_t status = video_player_get_status();
  if ((status.state == VIDEO_PLAYING && desired_paused) ||
      (status.state == VIDEO_PAUSED && !desired_paused)) video_player_pause();

  if (ndsp_ready) {
    float mix[12] = {0};
    mix[0] = desired_volume;
    mix[1] = desired_volume;
    ndspChnSetMix(1, mix);
  }

  float u = 1.0f, v = 1.0f;
  if (video_player_texture(&u, &v)) has_frame = true;
}

static void safe_error(char *out, size_t capacity, const char *value) {
  size_t at = 0;
  if (!capacity) return;
  for (size_t i = 0; value && value[i] && at + 1 < capacity; i++) {
    unsigned char c = (unsigned char)value[i];
    if (c < 0x20 || c == '"' || c == '\\') continue;
    out[at++] = (char)c;
  }
  out[at] = 0;
}

void media_snapshot(char *out, size_t capacity) {
  video_status_t status = video_player_get_status();
  const char *phase = "idle";
  if (requested_open) {
    switch (status.state) {
      case VIDEO_LOADING: phase = "buffering"; break;
      case VIDEO_PLAYING: phase = desired_paused ? "paused" : "playing"; break;
      case VIDEO_PAUSED: phase = "paused"; break;
      case VIDEO_ERROR: phase = "error"; break;
      case VIDEO_STOPPED: phase = has_frame ? "ended" : "opening"; break;
      default: break;
    }
  }
  char error[128] = {0};
  if (requested_open && !ndsp_ready) {
    phase = "error";
    if ((unsigned)ndsp_result ==
        (unsigned)MAKERESULT(RL_PERMANENT, RS_NOTFOUND, RM_DSP, RD_NOT_FOUND)) {
      copy_text(error, sizeof error, "DSP firmware missing; dump it in Rosalina");
    } else {
      copy_text(error, sizeof error, "Audio output unavailable");
    }
  } else if (requested_open && !hardware_supported) {
    phase = "error";
    copy_text(error, sizeof error, "Video needs a New Nintendo 3DS or New 2DS XL");
  } else {
    safe_error(error, sizeof error, status.error_msg);
  }
  unsigned position = status.position_ticks > 0
    ? (unsigned)(status.position_ticks / 10000) : 0;
  unsigned duration = status.duration_ticks > 0
    ? (unsigned)(status.duration_ticks / 10000) : 0;
  snprintf(out, capacity,
    "{\"phase\":\"%s\",\"positionMs\":%u,\"durationMs\":%u,"
    "\"bufferedMs\":0,\"decodedFrames\":%u,\"presentedFrames\":%u,"
    "\"droppedFrames\":0,\"receivedBytes\":0,\"decodeMaxUs\":0,"
    "\"audioUnderruns\":0,\"hardware\":%s,\"videoWidth\":%d,"
    "\"videoHeight\":%d,\"error\":\"%s\"}",
    phase, position, duration, has_frame ? 1u : 0u, has_frame ? 1u : 0u,
    hardware_supported ? "true" : "false",
    status.video_width, status.video_height, error);
}
