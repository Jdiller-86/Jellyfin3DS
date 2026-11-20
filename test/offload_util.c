#include <assert.h>
#include <string.h>
#include "../native/offload_util.h"

int main(void) {
  char out[512];

  /* Server URL normalization and safety checks. */
  assert(j3ds_normalize_server("http://192.168.1.10:8096///", out, sizeof out));
  assert(strcmp(out, "http://192.168.1.10:8096") == 0);
  assert(j3ds_normalize_server("https://media.example/jellyfin/", out, sizeof out));
  assert(strcmp(out, "https://media.example/jellyfin") == 0);
  assert(!j3ds_normalize_server("ftp://example.com", out, sizeof out));
  assert(!j3ds_normalize_server("http://localhost", out, sizeof out));
  assert(!j3ds_normalize_server("https://user@example.com", out, sizeof out));
  assert(!j3ds_normalize_server("https://example.com?a=1", out, sizeof out));
  assert(!j3ds_normalize_server("https://example.com#frag", out, sizeof out));
  assert(!j3ds_normalize_server("https://example.com/a b", out, sizeof out));
  assert(!j3ds_normalize_server("http://", out, sizeof out));

  /* IDs and tokens reject control chars and path traversal characters. */
  assert(j3ds_valid_id("abc_123-XYZ"));
  assert(!j3ds_valid_id(""));
  assert(!j3ds_valid_id("../etc/passwd"));
  assert(!j3ds_valid_id("id?foo=bar"));
  assert(j3ds_valid_token("tok_123.abc~xyz-0"));
  assert(!j3ds_valid_token(""));
  assert(!j3ds_valid_token("bad token"));
  assert(!j3ds_valid_token("bad\ntoken"));

  /* Bounded text rejects control characters and enforces limits. */
  assert(j3ds_bounded_text("", 8, true));
  assert(!j3ds_bounded_text("", 8, false));
  assert(!j3ds_bounded_text("12345678", 8, false));
  assert(!j3ds_bounded_text("hi\x01", 8, false));

  /* Folder classification. */
  assert(j3ds_item_is_folder("Series"));
  assert(j3ds_item_is_folder("Season"));
  assert(!j3ds_item_is_folder("Episode"));
  assert(!j3ds_item_is_folder(NULL));

  /* UTF-8 truncation never splits a multi-byte sequence. */
  char name[6];
  j3ds_utf8_copy(name, sizeof name, "abc\xc3\xa9z"); /* "abcéz": 6 bytes */
  assert(strcmp(name, "abc\xc3\xa9") == 0);
  char cut[5];
  j3ds_utf8_copy(cut, sizeof cut, "abc\xc3\xa9z");
  assert(strcmp(cut, "abc") == 0);

  return 0;
}
