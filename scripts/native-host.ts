import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MARKER = "JELLYFIN3DS_NATIVE_HOST";

function replaceOne(source: string, before: string, after: string, label: string): string {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Native host patch '${label}' no longer matches the pinned source`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function transformMediaHeader(source: string): string {
  if (source.includes(MARKER)) return source;
  return replaceOne(
    source,
    "C3D_Tex *media_texture(int32_t handle);",
    `/* ${MARKER}: native video occupies a sub-rectangle of a POT texture. */\nC3D_Tex *media_texture(int32_t handle, float *u_scale, float *v_scale);`,
    "media texture scale",
  );
}

export function transformGfx(source: string): string {
  if (source.includes(MARKER)) return source;
  source = replaceOne(
    source,
    "C3D_Tex *native_media=media_texture(handle);\n  if(native_media) { *u_scale=*v_scale=1; return native_media; }",
    `/* ${MARKER}: the decoder owns a 512x256 envelope around the frame. */\n  C3D_Tex *native_media=media_texture(handle, u_scale, v_scale);\n  if(native_media) return native_media;`,
    "gfx media UV",
  );
  source = source.replace(
    "if (media_texture(source.handle)) { release_image(entry); continue; }",
    "if (media_texture(source.handle, &(float){1.0f}, &(float){1.0f})) { release_image(entry); continue; }",
  );
  return source;
}

export function transformVideoHeader(source: string): string {
  source = replaceOne(
    source,
    "#include <stdint.h>",
    "#include <stdint.h>\n#include <citro3d.h>",
    "video texture type",
  );
  source = replaceOne(
    source,
    "bool video_player_play(const char *url, int64_t duration_ticks,\n                       int64_t seek_offset_ticks, vp_3d_mode_t mode_3d);",
    "bool video_player_play(const char *url, const char *token,\n                       int64_t duration_ticks, int64_t seek_offset_ticks,\n                       vp_3d_mode_t mode_3d);",
    "video auth argument",
  );
  return replaceOne(
    source,
    "void video_player_render_frame(void);",
    `void video_player_render_frame(void);\n\n/* ${MARKER}: update and expose the decoder texture without issuing C2D draws. */\nC3D_Tex *video_player_texture(float *u_scale, float *v_scale);\nvoid video_player_present(void);`,
    "video texture accessor",
  );
}

export function transformVideoSource(source: string): string {
  source = replaceOne(source, "        /* Wait for a frame in the queue */",
    "        /* Do not recycle the displayed texture until the main thread has\n         * retired the GPU list and accepted the pending frame. */\n        LightLock_Lock(&s_vp.tex_lock);\n        bool pending = s_vp.new_tex_ready;\n        LightLock_Unlock(&s_vp.tex_lock);\n        if (pending) { svcSleepThread(2000000LL); continue; }\n        /* Wait for a frame in the queue */", "GPU frame handoff");
  source = replaceOne(source, "    queued_frame_t frames[FRAME_QUEUE_SIZE];",
    "    queued_frame_t frames[FRAME_QUEUE_SIZE];\n    queued_frame_t popped;", "queue ownership");
  source = replaceOne(source, "    int frame_size = frame_w * frame_h * 2; /* BGR565 */",
    "    int frame_size = frame_w * frame_h * 2; /* BGR565 */\n    fq->popped.data = linearAlloc(frame_size);", "queue scratch allocation");
  source = replaceOne(source, "static void fq_cleanup(frame_queue_t *fq)\n{",
    "static void fq_cleanup(frame_queue_t *fq)\n{\n    if (fq->popped.data) linearFree(fq->popped.data);\n    fq->popped.data = NULL;", "queue scratch cleanup");
  source = replaceOne(source, "    queued_frame_t *f = &fq->frames[fq->read_idx];\n    fq->read_idx",
    "    queued_frame_t *f = &fq->frames[fq->read_idx];\n    if (!fq->popped.data) { LightLock_Unlock(&fq->lock); return NULL; }\n    u8 *owned = fq->popped.data;\n    fq->popped = *f;\n    fq->popped.data = owned;\n    memcpy(owned, f->data, f->width * f->height * 2);\n    f = &fq->popped;\n    fq->read_idx", "queue pop owns pixels");
  source = replaceOne(source, "    /* Init MVD */",
    "    if (s_vp.demux.video_width <= 0 || s_vp.demux.video_width > 400 ||\n        s_vp.demux.video_height <= 0 || s_vp.demux.video_height > 240) {\n        snprintf(s_vp.error_msg, sizeof s_vp.error_msg, \"Server exceeded the video size limit\");\n        s_vp.state = VIDEO_ERROR;\n        return;\n    }\n    /* Init MVD */", "bounded hardware frames");
  source = replaceOne(source, "#include <3ds.h>", "#include <3ds.h>\n#include <errno.h>\n#include \"direct_media.h\"", "model selection");
  const software = readFileSync(new URL("../native/software_video.inc", import.meta.url), "utf8");
  source = replaceOne(source, "static void decode_thread_func(void *arg)\n{\n    (void)arg;",
    software + "\nstatic void decode_thread_func(void *arg)\n{\n    (void)arg;\n    if (!direct_media_has_mvd()) { software_decode_thread(); return; }", "software decoder");
  source = replaceOne(source, "    return mvd_is_available();", "    return true; /* Original models use FFmpeg software decoding. */", "all model support");
  source = replaceOne(
    source,
    "    char            url[2048];\n    int64_t         duration_ticks;",
    "    char            url[2048];\n    char            token[256];\n    int64_t         duration_ticks;",
    "video token storage",
  );
  source = replaceOne(
    source,
    "bool video_player_play(const char *url, int64_t duration_ticks,\n                       int64_t seek_offset_ticks, vp_3d_mode_t mode_3d)",
    "bool video_player_play(const char *url, const char *token,\n                       int64_t duration_ticks, int64_t seek_offset_ticks,\n                       vp_3d_mode_t mode_3d)",
    "video play signature",
  );
  source = replaceOne(
    source,
    "    snprintf(s_vp.url, sizeof(s_vp.url), \"%s\", url);\n    s_vp.duration_ticks = duration_ticks;",
    "    snprintf(s_vp.url, sizeof(s_vp.url), \"%s\", url);\n    snprintf(s_vp.token, sizeof(s_vp.token), \"%s\", token ? token : \"\");\n    s_vp.duration_ticks = duration_ticks;",
    "video token copy",
  );
  source = replaceOne(
    source,
    "static void net_thread_func(void *arg)",
    `static int jellyfin3ds_net_progress(void *clientp, curl_off_t download_total,\n                                        curl_off_t downloaded, curl_off_t upload_total,\n                                        curl_off_t uploaded)\n{\n    (void)clientp;\n    (void)download_total;\n    (void)downloaded;\n    (void)upload_total;\n    (void)uploaded;\n    return s_vp.stop_requested ? 1 : 0;\n}\n\nstatic void net_thread_func(void *arg)`,
    "interruptible video transfer",
  );
  source = replaceOne(
    source,
    "    curl_easy_setopt(curl, CURLOPT_URL, s_vp.url);",
    `    struct curl_slist *headers = NULL;\n    char token_header[320];\n    if (s_vp.token[0]) {\n        snprintf(token_header, sizeof token_header, \"X-Emby-Token: %s\", s_vp.token);\n        headers = curl_slist_append(headers, token_header);\n    }\n    curl_easy_setopt(curl, CURLOPT_URL, s_vp.url);\n    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);`,
    "video auth header",
  );
  source = replaceOne(
    source,
    "    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &s_vp.demux);",
    `    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &s_vp.demux);\n    curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);\n    curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, jellyfin3ds_net_progress);`,
    "video stop callback",
  );
  source = replaceOne(
    source,
    "    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);\n    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);",
    `    /* ${MARKER}: never forward the token to another redirect host. */\n    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);\n    curl_easy_setopt(curl, CURLOPT_PROTOCOLS, (long)(CURLPROTO_HTTP | CURLPROTO_HTTPS));\n    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);\n    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);\n    curl_easy_setopt(curl, CURLOPT_CAINFO, \"romfs:/cacert.pem\");`,
    "video TLS",
  );
  source = replaceOne(
    source,
    "    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 30L); /* server may need time to start transcoding */",
    "    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L); /* keep cancellation responsive */",
    "video connect timeout",
  );
  source = replaceOne(
    source,
    "    curl_easy_cleanup(curl);\n}",
    "    curl_slist_free_all(headers);\n    curl_easy_cleanup(curl);\n}",
    "video header cleanup",
  );
  source = replaceOne(
    source,
    `                int dst_row = 0, y_count = 0;\n                for (int y = 0; y < f->height; y++) {\n                    const u8 *row = f->data + y * f->width * 2;\n                    tile_row_morton(tex_data, dst_row, row, f->width);\n                    dst_row += s_inc_y[y_count++];\n                }`,
    `                /* ${MARKER}: PocketJS samples v=0 from the high texture rows. */\n                int dst_row = 0, y_count = 0;\n                int padding = s_vp.frame_tex[write_idx].height - f->height;\n                for (int y = 0; y < padding; y++)\n                    dst_row += s_inc_y[y_count++];\n                for (int y = 0; y < f->height; y++) {\n                    const u8 *row = f->data + (f->height - 1 - y) * f->width * 2;\n                    tile_row_morton(tex_data, dst_row, row, f->width);\n                    dst_row += s_inc_y[y_count++];\n                }`,
    "video orientation",
  );
  return `${source}\n\n/* ${MARKER}: PocketJS binds this texture in its own PICA draw list. */\nstatic bool at_frame_boundary;\nvoid video_player_present(void) {\n    at_frame_boundary = true;\n    video_player_texture(NULL, NULL);\n    at_frame_boundary = false;\n}\nC3D_Tex *video_player_texture(float *u_scale, float *v_scale)\n{\n    if (s_vp.state != VIDEO_PLAYING && s_vp.state != VIDEO_PAUSED) return NULL;\n    if (!s_vp.tex_initialized && s_vp.display_width > 0)\n        init_frame_texture(s_vp.display_width, s_vp.display_height);\n    LightLock_Lock(&s_vp.tex_lock);\n    if (at_frame_boundary && s_vp.new_tex_ready) {\n        s_vp.frame_img.tex = &s_vp.frame_tex[s_vp.tex_display_idx];\n        s_vp.frame_img.subtex = &s_subtex;\n        s_vp.new_tex_ready = false;\n    }\n    C3D_Tex *texture = s_vp.tex_initialized ? s_vp.frame_img.tex : NULL;\n    if (texture) {\n        if (u_scale) *u_scale = (float)s_vp.display_width / (float)texture->width;\n        if (v_scale) *v_scale = (float)s_vp.display_height / (float)texture->height;\n    }\n    LightLock_Unlock(&s_vp.tex_lock);\n    return texture;\n}\n`;
}

export function transformMakefile(source: string): string {
  if (source.includes(MARKER)) return source;
  source = replaceOne(
    source,
    "  -I$(DEVKITPRO)/libctru/include",
    `  -I$(DEVKITPRO)/libctru/include \\\n  -I$(SOURCE) -I/out/native -I/out/.pocket/native/generated/include \\\n  -I/out/vendor/jellyfin-3ds/include -I/out/vendor/jellyfin-3ds/include/api \\\n  -I/out/vendor/jellyfin-3ds/lib/ffmpeg/include -I/out/.pocket/native/portlibs/include \\\n  -DJFIN_VERSION='\"0.2.5\"' -DCJSON_NESTING_LIMIT=32`,
    "native includes",
  );
  source = replaceOne(
    source,
    "LIBPATHS := -L$(DEVKITPRO)/libctru/lib\nLIBS := -lcitro3d -lctru -lm",
    `# ${MARKER}: direct Jellyfin HTTP + FFmpeg/MVD playback.\nLIBPATHS := -L/out/vendor/jellyfin-3ds/lib/ffmpeg -L/out/.pocket/native/portlibs/lib -L$(DEVKITPRO)/libctru/lib\nLIBS := -lcitro2d -lcitro3d -lavformat -lavcodec -lavfilter -lswresample -lavutil \\\n  -lcurl -lmbedtls -lmbedx509 -lmbedcrypto -lz -lctru -lm`,
    "native libraries",
  );
  source = replaceOne(
    source,
    "OBJECTS := $(BUILD)/main.o $(BUILD)/media.o $(BUILD)/offload.o $(BUILD)/soc.o $(BUILD)/svcwire.o $(BUILD)/runtime.o $(BUILD)/dev_protocol.o $(BUILD)/devserver.o $(BUILD)/devmenu.o $(BUILD)/gfx.o $(BUILD)/qjs.o $(BUILD)/input.o $(BUILD)/vshader_shbin.o",
    "OBJECTS := $(BUILD)/main.o $(BUILD)/media.o $(BUILD)/offload.o $(BUILD)/soc.o $(BUILD)/svcwire.o $(BUILD)/runtime.o $(BUILD)/dev_protocol.o $(BUILD)/devserver.o $(BUILD)/devmenu.o $(BUILD)/gfx.o $(BUILD)/qjs.o $(BUILD)/input.o $(BUILD)/vshader_shbin.o $(BUILD)/video_player.o $(BUILD)/mvd_decode.o $(BUILD)/ffmpeg_demux.o $(BUILD)/fake_pthread.o $(BUILD)/cJSON.o $(BUILD)/log.o",
    "native objects",
  );
  source = replaceOne(
    source,
    "$(BUILD)/main.o $(BUILD)/qjs.o $(BUILD)/gfx.o: $(SOURCE)/media.h\n\n$(ELF):",
    `$(BUILD)/main.o $(BUILD)/qjs.o $(BUILD)/gfx.o: $(SOURCE)/media.h\n\n$(BUILD)/media.o: /out/native/media.c /out/native/direct_media.h $(SOURCE)/media.h $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/offload.o: /out/native/offload.c /out/native/direct_media.h $(SOURCE)/offload.h $(SOURCE)/offload_queue.h $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/video_player.o: /out/.pocket/native/generated/video_player.c $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/mvd_decode.o: /out/native/mvd_decode.c $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/ffmpeg_demux.o: /out/vendor/jellyfin-3ds/src/video/ffmpeg_demux.c $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/fake_pthread.o: /out/vendor/jellyfin-3ds/src/video/fake_pthread.c $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/cJSON.o: /out/vendor/jellyfin-3ds/src/api/cJSON.c $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n$(BUILD)/log.o: /out/vendor/jellyfin-3ds/src/util/log.c $(FLAGS_STAMP) | $(BUILD)\n\t$(CC) $(CFLAGS) -c $< -o $@\n\n$(ELF):`,
    "native compile rules",
  );
  source = replaceOne(
    source,
    "$(ROMFS)/app.pocket: $(POCKETJS_APP_POCKET) romfs-inputs $(ROMFS_LAYOUT_STAMP) | $(ROMFS)",
    `NATIVE_CA := /out/.pocket/native/cacert.pem\n$(ROMFS)/cacert.pem: $(NATIVE_CA) | $(ROMFS)\n\t@cp \"$<\" \"$@.new\"\n\t@cmp -s \"$@.new\" \"$@\" || mv \"$@.new\" \"$@\"\n\t@rm -f \"$@.new\"\n\n$(ROMFS)/app.pocket: $(POCKETJS_APP_POCKET) romfs-inputs $(ROMFS_LAYOUT_STAMP) | $(ROMFS)`,
    "CA staging",
  );
  source = replaceOne(
    source,
    "$(OUT): $(ELF) $(SMDH) $(ROMFS)/app.pocket $(ROMFS_LAYOUT_STAMP)",
    "$(OUT): $(ELF) $(SMDH) $(ROMFS)/app.pocket $(ROMFS)/cacert.pem $(ROMFS_LAYOUT_STAMP)",
    "3dsx CA dependency",
  );
  source = replaceOne(
    source,
    "$(CIA): $(ELF) $(SMDH) $(ROMFS)/app.pocket $(ROMFS_LAYOUT_STAMP) $(RSF) $(CIA_STAMP)",
    "$(CIA): $(ELF) $(SMDH) $(ROMFS)/app.pocket $(ROMFS)/cacert.pem $(ROMFS_LAYOUT_STAMP) $(RSF) $(CIA_STAMP)",
    "CIA CA dependency",
  );
  source = replaceOne(source, "-elf $(ELF) -icon $(SMDH)", "-elf $(ELF) -icon $(SMDH) -banner /out/.pocket/banner/banner.bnr", "HOME Menu banner");
  source = replaceOne(source, "-target t -exefslogo", "-target t -exefslogo -logo /out/assets/blank-logo.lz", "transparent launch logo");
  source = source.replace("$(RSF) $(CIA_STAMP)\n", "$(RSF) $(CIA_STAMP) /out/.pocket/banner/banner.bnr /out/assets/blank-logo.lz\n");
  // FFmpeg is built with 32-bit enums. Its public structs must use the same ABI.
  source += "\n$(BUILD)/video_player.o $(BUILD)/ffmpeg_demux.o: CFLAGS += -fno-short-enums\n";
  return source;
}

export function transformRsf(source: string): string {
  source = replaceOne(source, "Logo                    : Homebrew", "Logo                    : None", "no Homebrew splash");
  source = replaceOne(source, "  RemasterVersion: 0", "  RemasterVersion: 5", "CIA revision");
  return replaceOne(source, "  InterruptNumbers:",
    "  # NDSP accesses DSP RAM directly, including its frame counter.\n  IORegisterMapping:\n   - 1ff00000-1ff7ffff\n  InterruptNumbers:", "DSP RAM mapping");
}

export interface NativeHostStage { restore(): void }

export function stageNativeHost(projectRoot: string): NativeHostStage {
  const project = resolve(projectRoot);
  const pocketHost = join(project, "vendor/pocketjs/hosts/3ds");
  const reference = join(project, "vendor/jellyfin-3ds");
  const dependencies = [
    join(project, ".pocket/native/cacert.pem"),
    join(project, ".pocket/native/portlibs/lib/libcurl.a"),
    join(reference, "lib/ffmpeg/libavformat.a"),
    join(reference, "lib/ffmpeg/include/libavformat/avformat.h"),
  ];
  const missing = dependencies.filter((path) => !existsSync(path));
  if (missing.length) {
    throw new Error(`Native dependencies are missing; run 'bun run native:deps' (${missing[0]})`);
  }

  const generated = join(project, ".pocket/native/generated");
  mkdirSync(join(generated, "include/video"), { recursive: true });
  const referenceSource = readFileSync(join(reference, "src/video/video_player.c"), "utf8");
  const referenceHeader = readFileSync(join(reference, "include/video/video_player.h"), "utf8");
  writeFileSync(join(generated, "video_player.c"), transformVideoSource(referenceSource));
  writeFileSync(join(generated, "include/video/video_player.h"), transformVideoHeader(referenceHeader));

  const targets = [
    { path: join(pocketHost, "src/media.h"), transform: transformMediaHeader },
    { path: join(pocketHost, "src/gfx.c"), transform: transformGfx },
    { path: join(pocketHost, "Makefile"), transform: transformMakefile },
    { path: join(pocketHost, "app.rsf"), transform: transformRsf },
  ];
  const originals = targets.map(({ path }) => readFileSync(path, "utf8"));
  try {
    targets.forEach(({ path, transform }, index) =>
      writeFileSync(path, transform(originals[index])),
    );
  } catch (error) {
    targets.forEach(({ path }, index) => writeFileSync(path, originals[index]));
    throw error;
  }
  return {
    restore() {
      targets.forEach(({ path }, index) => writeFileSync(path, originals[index]));
    },
  };
}
