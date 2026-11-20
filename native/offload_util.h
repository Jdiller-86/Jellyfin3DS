#ifndef JELLYFIN3DS_OFFLOAD_UTIL_H
#define JELLYFIN3DS_OFFLOAD_UTIL_H

#include <ctype.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>

#define J3DS_SERVER_MAX 512
#define J3DS_USERNAME_MAX 64
#define J3DS_TOKEN_MAX 256
#define J3DS_ID_MAX 64

static inline void j3ds_copy_text(char *out, size_t capacity, const char *value) {
  if (!capacity) return;
  snprintf(out, capacity, "%s", value ? value : "");
}

static inline bool j3ds_bounded_text(const char *value, size_t limit, bool allow_empty) {
  if (!value) return false;
  size_t length = strlen(value);
  if ((!allow_empty && !length) || length >= limit) return false;
  for (size_t i = 0; i < length; i++) {
    unsigned char c = (unsigned char)value[i];
    if (c < 0x20 || c == 0x7f) return false;
  }
  return true;
}

static inline bool j3ds_valid_id(const char *value) {
  if (!j3ds_bounded_text(value, J3DS_ID_MAX, false)) return false;
  for (size_t i = 0; value[i]; i++) {
    unsigned char c = (unsigned char)value[i];
    if (!isalnum(c) && c != '-' && c != '_') return false;
  }
  return true;
}

static inline bool j3ds_valid_token(const char *value) {
  if (!j3ds_bounded_text(value, J3DS_TOKEN_MAX, false)) return false;
  for (size_t i = 0; value[i]; i++) {
    unsigned char c = (unsigned char)value[i];
    if (!isalnum(c) && c != '-' && c != '_' && c != '.' && c != '~') return false;
  }
  return true;
}

static inline bool j3ds_normalize_server(const char *value, char *out, size_t capacity) {
  if (!j3ds_bounded_text(value, capacity, false)) return false;
  if (strncmp(value, "http://", 7) != 0 && strncmp(value, "https://", 8) != 0)
    return false;
  if (strchr(value, '?') || strchr(value, '#') || strchr(value, '@')) return false;
  for (size_t i = 0; value[i]; i++) if (isspace((unsigned char)value[i])) return false;
  j3ds_copy_text(out, capacity, value);
  size_t length = strlen(out);
  while (length > 8 && out[length - 1] == '/') out[--length] = 0;
  const char *host = strstr(out, "://");
  return host && host[3] && strcmp(host + 3, "localhost") != 0;
}

static inline bool j3ds_item_is_folder(const char *type) {
  static const char *folders[] = {
    "CollectionFolder", "UserView", "Folder", "Series", "Season",
    "BoxSet", "Playlist", "MusicAlbum", "MusicArtist"
  };
  if (!type) return false;
  for (size_t i = 0; i < sizeof folders / sizeof folders[0]; i++)
    if (strcmp(type, folders[i]) == 0) return true;
  return false;
}

static inline void j3ds_utf8_copy(char *out, size_t capacity, const char *value) {
  if (!capacity) return;
  if (!value) value = "";
  size_t length = strlen(value), take = length < capacity ? length : capacity - 1;
  /* Cut before an incomplete code point, preserving complete multibyte names. */
  if (take < length) while (take && ((unsigned char)value[take] & 0xc0u) == 0x80u) --take;
  memcpy(out, value, take); out[take] = 0;
}

#endif
