/* On-device PocketJS provider for Jellyfin. Network and SD-card work stay on
 * this worker; the QuickJS/render thread only copies bounded queue records. */
#include "offload.h"
#include "offload_queue.h"
#include "soc.h"
#include "direct_media.h"
#include "cJSON.h"

#include <3ds.h>
#include <curl/curl.h>
#include <ctype.h>
#include <math.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#define APP_VERSION "0.2.0"
#define CONFIG_DIR "sdmc:/3ds/Jellyfin3DS"
#define CONFIG_PATH CONFIG_DIR "/config.json"
#define CONFIG_PART CONFIG_DIR "/config.json.part"
#define HTTP_BODY_MAX (256u * 1024u)
#define SERVER_MAX 512
#define USERNAME_MAX 64
#define TOKEN_MAX 256
#define ID_MAX 64
#define PAGE_SIZE 5
#define PAYLOAD_MAX 2500

typedef struct {
  char server[SERVER_MAX];
  char username[USERNAME_MAX];
  char token[TOKEN_MAX];
  char user_id[ID_MAX];
  char device_id[ID_MAX];
} Config;

typedef struct {
  char *data;
  size_t size;
  size_t capacity;
  bool overflow;
} HttpBody;

static OffloadQueue outgoing;
static OffloadQueue incoming;
static OffloadRecord ui_record;
static _Atomic bool running;
static _Atomic int connection;
static _Atomic unsigned measured_frames;
static _Atomic unsigned max_us;
static _Atomic unsigned over_budget;
static Thread worker;
static unsigned sends;
static unsigned takes;
static Config config;
static char playing_id[ID_MAX];
static char playing_session[ID_MAX];

static void copy_text(char *out, size_t capacity, const char *value) {
  if (!capacity) return;
  snprintf(out, capacity, "%s", value ? value : "");
}

static const cJSON *json_member(const cJSON *object, const char *key) {
  return cJSON_GetObjectItemCaseSensitive(object, key);
}

static const char *json_string(const cJSON *object, const char *key) {
  const cJSON *value = json_member(object, key);
  return cJSON_IsString(value) && value->valuestring ? value->valuestring : NULL;
}

static double json_number(const cJSON *object, const char *key, double fallback) {
  const cJSON *value = json_member(object, key);
  return cJSON_IsNumber(value) && isfinite(value->valuedouble)
    ? value->valuedouble : fallback;
}

static bool json_bool(const cJSON *object, const char *key, bool fallback) {
  const cJSON *value = json_member(object, key);
  return cJSON_IsBool(value) ? cJSON_IsTrue(value) : fallback;
}

static bool bounded_text(const char *value, size_t limit, bool allow_empty) {
  if (!value) return false;
  size_t length = strlen(value);
  if ((!allow_empty && !length) || length >= limit) return false;
  for (size_t i = 0; i < length; i++) {
    unsigned char c = (unsigned char)value[i];
    if (c < 0x20 || c == 0x7f) return false;
  }
  return true;
}

static bool valid_id(const char *value) {
  if (!bounded_text(value, ID_MAX, false)) return false;
  for (size_t i = 0; value[i]; i++) {
    unsigned char c = (unsigned char)value[i];
    if (!isalnum(c) && c != '-' && c != '_') return false;
  }
  return true;
}

static bool valid_token(const char *value) {
  if (!bounded_text(value, TOKEN_MAX, false)) return false;
  for (size_t i = 0; value[i]; i++) {
    unsigned char c = (unsigned char)value[i];
    if (!isalnum(c) && c != '-' && c != '_' && c != '.' && c != '~') return false;
  }
  return true;
}

static bool normalize_server(const char *value, char *out, size_t capacity) {
  if (!bounded_text(value, capacity, false)) return false;
  if (strncmp(value, "http://", 7) != 0 && strncmp(value, "https://", 8) != 0)
    return false;
  if (strchr(value, '?') || strchr(value, '#') || strchr(value, '@')) return false;
  for (size_t i = 0; value[i]; i++) if (isspace((unsigned char)value[i])) return false;
  copy_text(out, capacity, value);
  size_t length = strlen(out);
  while (length > 8 && out[length - 1] == '/') out[--length] = 0;
  const char *host = strstr(out, "://");
  return host && host[3] && strcmp(host + 3, "localhost") != 0;
}

static bool authenticated(void) {
  return config.server[0] && valid_token(config.token) && valid_id(config.user_id) &&
         valid_id(config.device_id);
}

static bool config_save(void) {
  mkdir("sdmc:/3ds", 0755);
  mkdir(CONFIG_DIR, 0755);
  cJSON *root = cJSON_CreateObject();
  if (!root) return false;
  cJSON_AddNumberToObject(root, "version", 1);
  cJSON_AddStringToObject(root, "server", config.server);
  cJSON_AddStringToObject(root, "username", config.username);
  cJSON_AddStringToObject(root, "token", config.token);
  cJSON_AddStringToObject(root, "userId", config.user_id);
  cJSON_AddStringToObject(root, "deviceId", config.device_id);
  char *text = cJSON_PrintUnformatted(root);
  cJSON_Delete(root);
  if (!text) return false;
  FILE *file = fopen(CONFIG_PART, "wb");
  bool ok = file && fwrite(text, 1, strlen(text), file) == strlen(text) &&
            fflush(file) == 0;
  if (file && fclose(file) != 0) ok = false;
  free(text);
  if (!ok) {
    remove(CONFIG_PART);
    return false;
  }
  if (rename(CONFIG_PART, CONFIG_PATH) != 0) {
    remove(CONFIG_PATH);
    if (rename(CONFIG_PART, CONFIG_PATH) != 0) {
      remove(CONFIG_PART);
      return false;
    }
  }
  return true;
}

static void config_load(void) {
  memset(&config, 0, sizeof config);
  FILE *file = fopen(CONFIG_PATH, "rb");
  if (file) {
    char text[2048];
    size_t length = fread(text, 1, sizeof text - 1, file);
    bool complete = feof(file) != 0;
    fclose(file);
    text[length] = 0;
    if (complete) {
      cJSON *root = cJSON_ParseWithLength(text, length);
      if (root) {
        const char *server = json_string(root, "server");
        const char *username = json_string(root, "username");
        const char *token = json_string(root, "token");
        const char *user_id = json_string(root, "userId");
        const char *device_id = json_string(root, "deviceId");
        char normalized[SERVER_MAX];
        if (server && normalize_server(server, normalized, sizeof normalized))
          copy_text(config.server, sizeof config.server, normalized);
        if (username && bounded_text(username, USERNAME_MAX, true))
          copy_text(config.username, sizeof config.username, username);
        if (token && (!token[0] || valid_token(token)))
          copy_text(config.token, sizeof config.token, token);
        if (user_id && valid_id(user_id))
          copy_text(config.user_id, sizeof config.user_id, user_id);
        if (device_id && valid_id(device_id))
          copy_text(config.device_id, sizeof config.device_id, device_id);
        cJSON_Delete(root);
      }
    }
  }
  if (!valid_id(config.device_id)) {
    u64 tick = svcGetSystemTick();
    snprintf(config.device_id, sizeof config.device_id, "3ds-%08lx%08lx",
             (unsigned long)(u32)(tick >> 32),
             (unsigned long)(u32)(tick & 0xffffffffu));
    config_save();
  }
}

static size_t http_write(void *bytes, size_t size, size_t count, void *opaque) {
  HttpBody *body = opaque;
  if (size && count > SIZE_MAX / size) return 0;
  size_t incoming_size = size * count;
  if (body->size + incoming_size > HTTP_BODY_MAX) {
    body->overflow = true;
    return 0;
  }
  size_t needed = body->size + incoming_size + 1;
  if (needed > body->capacity) {
    size_t capacity = body->capacity ? body->capacity : 4096;
    while (capacity < needed && capacity < HTTP_BODY_MAX + 1) capacity *= 2;
    if (capacity > HTTP_BODY_MAX + 1) capacity = HTTP_BODY_MAX + 1;
    char *next = realloc(body->data, capacity);
    if (!next) return 0;
    body->data = next;
    body->capacity = capacity;
  }
  memcpy(body->data + body->size, bytes, incoming_size);
  body->size += incoming_size;
  body->data[body->size] = 0;
  return incoming_size;
}

static void http_error(char *error, size_t capacity, CURLcode result, long status,
                       bool overflow) {
  if (overflow) copy_text(error, capacity, "Server response was too large");
  else if (status == 401 || status == 403)
    copy_text(error, capacity, "Sign-in expired; enter your account again");
  else if (status >= 400)
    snprintf(error, capacity, "Jellyfin returned HTTP %ld", status);
  else if (result == CURLE_PEER_FAILED_VERIFICATION ||
           result == CURLE_SSL_CACERT_BADFILE)
    copy_text(error, capacity, "TLS certificate is not trusted on this 3DS");
  else if (result == CURLE_OPERATION_TIMEDOUT)
    copy_text(error, capacity, "Jellyfin did not respond in time");
  else if (result == CURLE_COULDNT_RESOLVE_HOST || result == CURLE_COULDNT_CONNECT)
    copy_text(error, capacity, "Could not reach the Jellyfin server");
  else copy_text(error, capacity, "Jellyfin network request failed");
}

static bool http_json(const Config *session, const char *method, const char *url,
                      const char *json_body, bool use_token, cJSON **json_out,
                      long *status_out, char *error, size_t error_capacity) {
  *json_out = NULL;
  *status_out = 0;
  char soc_error[128] = {0};
  if (!soc_ensure(soc_error, sizeof soc_error)) {
    copy_text(error, error_capacity,
              soc_error[0] ? soc_error : "Nintendo 3DS network is unavailable");
    return false;
  }

  CURL *curl = curl_easy_init();
  if (!curl) {
    copy_text(error, error_capacity, "Could not initialize networking");
    return false;
  }
  HttpBody response = {0};
  char auth[768];
  if (use_token && session->token[0]) {
    snprintf(auth, sizeof auth,
      "Authorization: MediaBrowser Client=\"Jellyfin3DS\", Device=\"Nintendo 3DS\", "
      "DeviceId=\"%s\", Version=\"%s\", Token=\"%s\"",
      session->device_id, APP_VERSION, session->token);
  } else {
    snprintf(auth, sizeof auth,
      "Authorization: MediaBrowser Client=\"Jellyfin3DS\", Device=\"Nintendo 3DS\", "
      "DeviceId=\"%s\", Version=\"%s\"",
      session->device_id, APP_VERSION);
  }
  struct curl_slist *headers = NULL;
  headers = curl_slist_append(headers, auth);
  headers = curl_slist_append(headers, "Accept: application/json");
  if (strcmp(method, "POST") == 0)
    headers = curl_slist_append(headers, "Content-Type: application/json");

  curl_easy_setopt(curl, CURLOPT_URL, url);
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, http_write);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, "Jellyfin3DS/" APP_VERSION);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT_MS, 5000L);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT_MS, 8500L);
  curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);
  curl_easy_setopt(curl, CURLOPT_PROTOCOLS,
                   (long)(CURLPROTO_HTTP | CURLPROTO_HTTPS));
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
  curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
  curl_easy_setopt(curl, CURLOPT_CAINFO, "romfs:/cacert.pem");
  if (strcmp(method, "POST") == 0) {
    const char *body = json_body ? json_body : "{}";
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)strlen(body));
  }

  CURLcode result = curl_easy_perform(curl);
  long status = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
  *status_out = status;
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);

  if (result != CURLE_OK || status < 200 || status >= 300) {
    http_error(error, error_capacity, result, status, response.overflow);
    free(response.data);
    return false;
  }
  if (response.size) {
    *json_out = cJSON_ParseWithLength(response.data, response.size);
    if (!*json_out) {
      copy_text(error, error_capacity, "Jellyfin returned invalid JSON");
      free(response.data);
      return false;
    }
  }
  free(response.data);
  return true;
}

static bool make_url(char *out, size_t capacity, const char *server,
                     const char *suffix) {
  int count = snprintf(out, capacity, "%s%s", server, suffix);
  return count > 0 && (size_t)count < capacity;
}

static cJSON *hello_result(bool persisted) {
  cJSON *result = cJSON_CreateObject();
  cJSON_AddBoolToObject(result, "direct", true);
  cJSON_AddBoolToObject(result, "authenticated", authenticated());
  cJSON_AddBoolToObject(result, "persisted", persisted);
  cJSON_AddStringToObject(result, "server", config.server);
  cJSON_AddStringToObject(result, "username", config.username);
  return result;
}

static bool login_command(const cJSON *command, cJSON **result, char *error,
                          size_t error_capacity) {
  const char *server = json_string(command, "server");
  const char *username = json_string(command, "username");
  const char *password = json_string(command, "password");
  Config candidate = config;
  if (!normalize_server(server, candidate.server, sizeof candidate.server)) {
    copy_text(error, error_capacity, "Use an http:// or https:// Jellyfin URL");
    return false;
  }
  if (!bounded_text(username, USERNAME_MAX, false) ||
      !bounded_text(password, 128, true)) {
    copy_text(error, error_capacity, "Check the username and password length");
    return false;
  }
  copy_text(candidate.username, sizeof candidate.username, username);
  candidate.token[0] = 0;
  candidate.user_id[0] = 0;

  cJSON *body = cJSON_CreateObject();
  cJSON_AddStringToObject(body, "Username", username);
  cJSON_AddStringToObject(body, "Pw", password);
  char *body_text = cJSON_PrintUnformatted(body);
  cJSON_Delete(body);
  if (!body_text) {
    copy_text(error, error_capacity, "Not enough memory to sign in");
    return false;
  }
  char url[SERVER_MAX + 64];
  if (!make_url(url, sizeof url, candidate.server, "/Users/AuthenticateByName")) {
    free(body_text);
    copy_text(error, error_capacity, "Jellyfin URL is too long");
    return false;
  }
  cJSON *reply = NULL;
  long status = 0;
  bool ok = http_json(&candidate, "POST", url, body_text, false, &reply,
                      &status, error, error_capacity);
  free(body_text);
  if (!ok) {
    if (status == 401) copy_text(error, error_capacity, "Username or password is incorrect");
    return false;
  }
  const char *access_token = json_string(reply, "AccessToken");
  const cJSON *user = json_member(reply, "User");
  const char *user_id = cJSON_IsObject(user) ? json_string(user, "Id") : NULL;
  if (!valid_token(access_token) || !valid_id(user_id)) {
    cJSON_Delete(reply);
    copy_text(error, error_capacity, "Jellyfin login response was incomplete");
    return false;
  }
  copy_text(candidate.token, sizeof candidate.token, access_token);
  copy_text(candidate.user_id, sizeof candidate.user_id, user_id);
  cJSON_Delete(reply);
  config = candidate;
  bool persisted = config_save();
  *result = hello_result(persisted);
  return true;
}

static void expire_session(void) {
  config.token[0] = 0;
  config.user_id[0] = 0;
  playing_id[0] = 0;
  playing_session[0] = 0;
  direct_media_forget_prepared();
  config_save();
}

static bool item_is_folder(const char *type) {
  static const char *folders[] = {
    "CollectionFolder", "UserView", "Folder", "Series", "Season",
    "BoxSet", "Playlist", "MusicAlbum", "MusicArtist"
  };
  for (size_t i = 0; i < sizeof folders / sizeof folders[0]; i++)
    if (strcmp(type, folders[i]) == 0) return true;
  return false;
}

static void utf8_copy(char *out, size_t capacity, const char *value) {
  copy_text(out, capacity, value ? value : "Untitled");
  size_t length = strlen(out);
  while (length && ((unsigned char)out[length - 1] & 0xc0u) == 0x80u)
    out[--length] = 0;
}

static cJSON *compact_item(const cJSON *source) {
  const char *id = json_string(source, "Id");
  const char *name = json_string(source, "Name");
  const char *type = json_string(source, "Type");
  if (!valid_id(id)) return NULL;
  char short_name[80];
  utf8_copy(short_name, sizeof short_name, name);
  if (!type || !bounded_text(type, 32, false)) type = "Video";
  double runtime_ticks = json_number(source, "RunTimeTicks", 0);
  const cJSON *user_data = json_member(source, "UserData");
  double resume_ticks = cJSON_IsObject(user_data)
    ? json_number(user_data, "PlaybackPositionTicks", 0) : 0;
  bool played = cJSON_IsObject(user_data)
    ? json_bool(user_data, "Played", false) : false;
  int year = (int)json_number(source, "ProductionYear", 0);
  cJSON *item = cJSON_CreateObject();
  cJSON_AddStringToObject(item, "id", id);
  cJSON_AddStringToObject(item, "name", short_name);
  cJSON_AddStringToObject(item, "type", type);
  cJSON_AddBoolToObject(item, "folder", item_is_folder(type));
  cJSON_AddNumberToObject(item, "seconds", runtime_ticks > 0 ? runtime_ticks / 10000000.0 : 0);
  cJSON_AddNumberToObject(item, "resume", resume_ticks > 0 ? resume_ticks / 10000000.0 : 0);
  cJSON_AddBoolToObject(item, "played", played);
  if (year > 0) cJSON_AddNumberToObject(item, "year", year);
  return item;
}

static bool list_command(const cJSON *command, cJSON **result, char *error,
                         size_t error_capacity) {
  if (!authenticated()) {
    copy_text(error, error_capacity, "Sign in to your Jellyfin server first");
    return false;
  }
  const char *mode = json_string(command, "mode");
  int offset = (int)json_number(command, "offset", -1);
  if (!mode || offset < 0 || offset > 100000) {
    copy_text(error, error_capacity, "Invalid library request");
    return false;
  }

  char suffix[1536];
  bool mvd = direct_media_has_mvd();
  int local_offset = 0;
  if (strcmp(mode, "libraries") == 0) {
    snprintf(suffix, sizeof suffix, "/Users/%s/Views", config.user_id);
    local_offset = offset;
  } else if (strcmp(mode, "folder") == 0) {
    const char *parent = json_string(command, "parent");
    if (!valid_id(parent)) {
      copy_text(error, error_capacity, "Invalid Jellyfin folder");
      return false;
    }
    snprintf(suffix, sizeof suffix,
      "/Users/%s/Items?ParentId=%s&StartIndex=%d&Limit=%d&SortBy=SortName"
      "&SortOrder=Ascending&EnableUserData=true",
      config.user_id, parent, offset, PAGE_SIZE);
  } else if (strcmp(mode, "resume") == 0) {
    snprintf(suffix, sizeof suffix,
      "/Users/%s/Items/Resume?StartIndex=%d&Limit=%d&EnableUserData=true",
      config.user_id, offset, PAGE_SIZE);
  } else if (strcmp(mode, "search") == 0) {
    const char *query = json_string(command, "query");
    if (!bounded_text(query, 81, false)) {
      copy_text(error, error_capacity, "Enter a shorter search");
      return false;
    }
    CURL *escape = curl_easy_init();
    char *encoded = escape ? curl_easy_escape(escape, query, 0) : NULL;
    if (!encoded) {
      if (escape) curl_easy_cleanup(escape);
      copy_text(error, error_capacity, "Could not encode the search");
      return false;
    }
    snprintf(suffix, sizeof suffix,
      "/Users/%s/Items?SearchTerm=%s&StartIndex=%d&Limit=%d&Recursive=true"
      "&IncludeItemTypes=Movie,Series,Episode,Video&EnableUserData=true",
      config.user_id, encoded, offset, PAGE_SIZE);
    curl_free(encoded);
    curl_easy_cleanup(escape);
  } else {
    copy_text(error, error_capacity, "Unknown library view");
    return false;
  }
  char url[SERVER_MAX + sizeof suffix];
  if (!make_url(url, sizeof url, config.server, suffix)) {
    copy_text(error, error_capacity, "Jellyfin URL is too long");
    return false;
  }
  cJSON *reply = NULL;
  long status = 0;
  if (!http_json(&config, "GET", url, NULL, true, &reply, &status,
                 error, error_capacity)) {
    if (status == 401 || status == 403) expire_session();
    return false;
  }
  const cJSON *items = json_member(reply, "Items");
  if (!cJSON_IsArray(items)) {
    cJSON_Delete(reply);
    copy_text(error, error_capacity, "Jellyfin returned an invalid item list");
    return false;
  }
  int available = cJSON_GetArraySize(items);
  int total = (int)json_number(reply, "TotalRecordCount", available);
  int first = local_offset;
  if (first > available) first = available;
  int last = first + PAGE_SIZE;
  if (strcmp(mode, "libraries") != 0) {
    first = 0;
    last = available;
  }
  if (last > available) last = available;

  cJSON *page = cJSON_CreateObject();
  cJSON *output = cJSON_AddArrayToObject(page, "items");
  for (int i = first; i < last; i++) {
    cJSON *item = compact_item(cJSON_GetArrayItem(items, i));
    if (item) cJSON_AddItemToArray(output, item);
  }
  cJSON_AddNumberToObject(page, "total", total);
  cJSON_AddNumberToObject(page, "offset", offset);
  cJSON_Delete(reply);
  *result = page;
  return true;
}

static bool report_playback(const char *endpoint, int64_t ticks, bool paused) {
  if (!authenticated() || !valid_id(playing_id)) return false;
  char suffix[96];
  snprintf(suffix, sizeof suffix, "/Sessions/Playing%s", endpoint);
  char url[SERVER_MAX + sizeof suffix];
  if (!make_url(url, sizeof url, config.server, suffix)) return false;
  cJSON *body = cJSON_CreateObject();
  cJSON_AddStringToObject(body, "ItemId", playing_id);
  if (playing_session[0]) cJSON_AddStringToObject(body, "PlaySessionId", playing_session);
  cJSON_AddNumberToObject(body, "PositionTicks", (double)ticks);
  cJSON_AddBoolToObject(body, "IsPaused", paused);
  cJSON_AddStringToObject(body, "PlayMethod", "Transcode");
  cJSON_AddBoolToObject(body, "CanSeek", true);
  char *text = cJSON_PrintUnformatted(body);
  cJSON_Delete(body);
  if (!text) return false;
  cJSON *reply = NULL;
  long status = 0;
  char ignored[160];
  bool ok = http_json(&config, "POST", url, text, true, &reply, &status,
                      ignored, sizeof ignored);
  free(text);
  if (reply) cJSON_Delete(reply);
  return ok;
}

static bool play_command(const cJSON *command, cJSON **result, char *error,
                         size_t error_capacity) {
  if (!authenticated()) {
    copy_text(error, error_capacity, "Sign in to your Jellyfin server first");
    return false;
  }
  const char *id = json_string(command, "id");
  double seconds = json_number(command, "seconds", -1);
  double duration = json_number(command, "duration", 0);
  if (!valid_id(id) || seconds < 0 || seconds > 2592000 ||
      duration < 0 || duration > 2592000) {
    copy_text(error, error_capacity, "Invalid playback request");
    return false;
  }
  int64_t seek_ticks = (int64_t)(seconds * 10000000.0);
  int64_t duration_ticks = (int64_t)(duration * 10000000.0);
  u64 tick = svcGetSystemTick();
  snprintf(playing_session, sizeof playing_session, "j3ds%08lx",
           (unsigned long)(u32)(tick & 0xffffffffu));
  char suffix[1536];
  int written = snprintf(suffix, sizeof suffix,
    "/Videos/%s/stream?UserId=%s&DeviceId=%s&MediaSourceId=%s"
    "&PlaySessionId=%s&VideoCodec=h264&AudioCodec=aac&Container=ts"
    "&TranscodingContainer=ts&TranscodingProtocol=http&MaxWidth=%d&MaxHeight=%d"
    "&MaxFramerate=%d&VideoBitRate=%d&AudioBitRate=64000&MaxAudioChannels=2"
    "&TranscodingMaxAudioChannels=2&Profile=Baseline&Level=31&MaxRefFrames=2"
    "&StartTimeTicks=%lld",
    id, config.user_id, config.device_id, id, playing_session,
    mvd ? 400 : 256, mvd ? 240 : 144, mvd ? 24 : 12, mvd ? 472000 : 192000,
    (long long)seek_ticks);
  char url[SERVER_MAX + sizeof suffix];
  if (written <= 0 || (size_t)written >= sizeof suffix ||
      !make_url(url, sizeof url, config.server, suffix) ||
      !direct_media_prepare(url, config.token, duration_ticks, seek_ticks)) {
    playing_session[0] = 0;
    copy_text(error, error_capacity, "Could not prepare the video stream");
    return false;
  }
  copy_text(playing_id, sizeof playing_id, id);
  report_playback("", seek_ticks, false);

  cJSON *reply = cJSON_CreateObject();
  cJSON *source = cJSON_AddObjectToObject(reply, "source");
  cJSON_AddStringToObject(source, "host", "127.0.0.1");
  cJSON_AddNumberToObject(source, "port", 1);
  cJSON_AddStringToObject(source, "token",
    "0000000000000000000000000000000000000000000000000000000000000000");
  cJSON_AddNumberToObject(reply, "seconds", duration);
  cJSON_AddNumberToObject(reply, "position", seconds);
  *result = reply;
  return true;
}

static cJSON *ok_result(void) {
  cJSON *result = cJSON_CreateObject();
  cJSON_AddBoolToObject(result, "ok", true);
  return result;
}

static bool command_handle(const cJSON *command, cJSON **result, char *error,
                           size_t error_capacity) {
  if (!cJSON_IsObject(command)) {
    copy_text(error, error_capacity, "Malformed Jellyfin command");
    return false;
  }
  const char *type = json_string(command, "t");
  if (!type) {
    copy_text(error, error_capacity, "Jellyfin command type is missing");
    return false;
  }
  if (strcmp(type, "hello") == 0) {
    *result = hello_result(true);
    return true;
  }
  if (strcmp(type, "login") == 0)
    return login_command(command, result, error, error_capacity);
  if (strcmp(type, "logout") == 0) {
    if (authenticated()) {
      char url[SERVER_MAX + 32];
      if (make_url(url, sizeof url, config.server, "/Sessions/Logout")) {
        cJSON *reply = NULL;
        long status = 0;
        char ignored[160];
        http_json(&config, "POST", url, "{}", true, &reply, &status,
                  ignored, sizeof ignored);
        if (reply) cJSON_Delete(reply);
      }
    }
    expire_session();
    *result = hello_result(true);
    return true;
  }
  if (strcmp(type, "list") == 0)
    return list_command(command, result, error, error_capacity);
  if (strcmp(type, "play") == 0)
    return play_command(command, result, error, error_capacity);
  if (strcmp(type, "progress") == 0) {
    double seconds = json_number(command, "seconds", 0);
    bool paused = json_bool(command, "paused", false);
    if (seconds >= 0 && seconds <= 2592000)
      report_playback("/Progress", (int64_t)(seconds * 10000000.0), paused);
    *result = ok_result();
    return true;
  }
  if (strcmp(type, "stop") == 0) {
    double seconds = json_number(command, "seconds", 0);
    if (seconds >= 0 && seconds <= 2592000)
      report_playback("/Stopped", (int64_t)(seconds * 10000000.0), false);
    playing_id[0] = 0;
    playing_session[0] = 0;
    direct_media_forget_prepared();
    *result = ok_result();
    return true;
  }
  copy_text(error, error_capacity, "Unsupported Jellyfin command");
  return false;
}

static void queue_reply(uint32_t generation, int id, cJSON *payload,
                        const char *error) {
  cJSON *reply = cJSON_CreateObject();
  if (!reply) return;
  cJSON_AddNumberToObject(reply, "id", id);
  if (payload) {
    char *inner = cJSON_PrintUnformatted(payload);
    if (inner && strlen(inner) <= PAYLOAD_MAX)
      cJSON_AddStringToObject(reply, "payload", inner);
    else cJSON_AddStringToObject(reply, "error", "Jellyfin response exceeded the 3DS limit");
    free(inner);
  } else {
    cJSON_AddStringToObject(reply, "error", error && error[0] ? error : "Jellyfin command failed");
  }
  char *text = cJSON_PrintUnformatted(reply);
  cJSON_Delete(reply);
  if (!text) return;
  size_t length = strlen(text);
  if (length <= OFFLOAD_BYTES) {
    while (atomic_load(&running) &&
           !offload_push(&incoming, text, (uint32_t)length, generation))
      svcSleepThread(1000000);
  }
  free(text);
}

static void process_record(const OffloadRecord *record) {
  char text[OFFLOAD_BYTES + 1];
  memcpy(text, record->bytes, record->length);
  text[record->length] = 0;
  cJSON *request = cJSON_ParseWithLength(text, record->length);
  int id = 0;
  char error[161] = {0};
  cJSON *payload = NULL;
  if (!request || !cJSON_IsObject(request)) {
    copy_text(error, sizeof error, "Malformed PocketJS request");
  } else {
    const cJSON *id_value = json_member(request, "id");
    const cJSON *version = json_member(request, "v");
    const char *method = json_string(request, "method");
    const char *body = json_string(request, "payload");
    if (cJSON_IsNumber(id_value)) id = id_value->valueint;
    if (!cJSON_IsNumber(version) || version->valueint != 1 || id <= 0 ||
        !method || strcmp(method, "jellyfin.command") != 0 || !body ||
        strlen(body) > PAYLOAD_MAX) {
      copy_text(error, sizeof error, "Unsupported PocketJS request");
    } else {
      cJSON *command = cJSON_Parse(body);
      if (!command) copy_text(error, sizeof error, "Malformed Jellyfin command");
      else {
        command_handle(command, &payload, error, sizeof error);
        cJSON_Delete(command);
      }
    }
  }
  queue_reply(record->generation, id, payload, error);
  if (payload) cJSON_Delete(payload);
  if (request) cJSON_Delete(request);
}

static void serve(void *unused) {
  (void)unused;
  config_load();
  atomic_store_explicit(&connection, 1, memory_order_release);
  while (atomic_load(&running)) {
    OffloadRecord record;
    if (offload_pop(&outgoing, &record)) process_record(&record);
    else svcSleepThread(1000000);
  }
  atomic_store_explicit(&connection, 0, memory_order_release);
}

void offload_measure(unsigned microseconds) {
  atomic_fetch_add_explicit(&measured_frames, 1, memory_order_relaxed);
  if (microseconds > 16667)
    atomic_fetch_add_explicit(&over_budget, 1, memory_order_relaxed);
  unsigned previous = atomic_load_explicit(&max_us, memory_order_relaxed);
  if (microseconds > previous)
    atomic_store_explicit(&max_us, microseconds, memory_order_relaxed);
}

void offload_frame(void) { sends = takes = 0; }

int offload_session(void) {
  return atomic_load_explicit(&connection, memory_order_acquire);
}

bool offload_submit(const char *bytes, size_t length) {
  int epoch = offload_session();
  if (epoch <= 0 || sends >= 2 || !length || length > OFFLOAD_BYTES) return false;
  sends++;
  return offload_push(&outgoing, bytes, (uint32_t)length, (uint32_t)epoch);
}

size_t offload_take(char *out) {
  if (takes++ >= 1 || !offload_pop(&incoming, &ui_record)) return 0;
  if ((int)ui_record.generation != offload_session()) return 0;
  memcpy(out, ui_record.bytes, ui_record.length);
  return ui_record.length;
}

bool offload_start(void) {
  memset(&outgoing, 0, sizeof outgoing);
  memset(&incoming, 0, sizeof incoming);
  atomic_store(&connection, 0);
  atomic_store(&running, true);
  worker = threadCreate(serve, NULL, 64 * 1024, 0x3f, -2, false);
  if (!worker) atomic_store(&running, false);
  return worker != NULL;
}

void offload_stop(void) {
  atomic_store(&running, false);
  if (worker) {
    threadJoin(worker, U64_MAX);
    threadFree(worker);
    worker = NULL;
  }
  atomic_store(&connection, 0);
}
