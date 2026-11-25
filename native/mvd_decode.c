/**
 * mvd_decode.c — MVD hardware H.264 decoder (New 3DS only)
 *
 * Feeds AVCC-format H.264 packets from FFmpeg's demuxer to the
 * MVD hardware decoder after converting to Annex B format.
 *
 * Reference: Video_player_for_3DS/source/system/util/decoder.c
 * Reference: ThirdTube/source/network_decoder/network_decoder.cpp
 */

#include <3ds.h>
#include <stdlib.h>
#include <string.h>
#include <malloc.h>

#include "video/mvd_decode.h"
#include "util/log.h"

/* Derived from the pinned GPL-3.0 reference; locally maintained transport repair. */

#define ALIGN16(x) (((x) + 15) & ~15)
#define NAL_BUF_SIZE (256 * 1024)  /* 256KB for NAL unit conversion */

/* ── Availability check ────────────────────────────────────────────── */

/* A .3dsx inherits its launcher's memory layout. Address conversion alone
 * cannot map an old-layout allocation into the client at its new alias. */
static bool start_mvd(void)
{
    void *probe = linearAlloc(32);
    if (!probe) return false;
    bool new_layout = osConvertOldLINEARMemToNew(probe) == probe;
    log_write("MVD heap probe va=%08lx layout=%s", (unsigned long)(uintptr_t)probe,
              new_layout ? "new" : "legacy");
    linearFree(probe);
    if (!new_layout) {
        log_write("MVD unavailable: process uses the legacy linear heap");
        return false;
    }
    Result ret = mvdstdInit(MVDMODE_VIDEOPROCESSING, MVD_INPUT_H264,
                            MVD_OUTPUT_BGR565, MVD_DEFAULT_WORKBUF_SIZE, NULL);
    if (ret != 0) log_write("MVD init failed status=%08lx", (unsigned long)ret);
    return ret == 0;
}

bool mvd_is_available(void)
{
    if (!start_mvd()) return false;
    mvdstdExit();
    return true;
}

/* ── Init / Cleanup ────────────────────────────────────────────────── */

bool mvd_init(mvd_ctx_t *ctx, int width, int height)
{
    memset(ctx, 0, sizeof(*ctx));
    if (width < 1 || height < 1 || width > 512 || height > 256) return false;

    ctx->width = ALIGN16(width);
    ctx->height = ALIGN16(height);

    if (!start_mvd()) return false;

    /* Allocate NAL buffer in 4KB-aligned linear memory (required by MVD DMA) */
    ctx->nal_buf = linearMemAlign(NAL_BUF_SIZE, 0x1000);
    if (!ctx->nal_buf) {
        mvdstdExit();
        return false;
    }
    ctx->nal_buf_size = NAL_BUF_SIZE;
    ctx->initialized = true;

    /* Allocate double-buffered output frames in 4KB-aligned linear memory */
    int frame_size = ctx->width * ctx->height * 2; /* BGR565 = 2 bytes/pixel */
    for (int i = 0; i < 2; i++) {
        ctx->frame_buf[i] = linearMemAlign(frame_size, 0x1000);
        if (!ctx->frame_buf[i]) {
            mvd_cleanup(ctx);
            return false;
        }
        memset(ctx->frame_buf[i], 0, frame_size);
    }

    ctx->frame_write_idx = 0;
    return true;
}

void mvd_cleanup(mvd_ctx_t *ctx)
{
    if (ctx->initialized)
        mvdstdExit();

    if (ctx->nal_buf) {
        linearFree(ctx->nal_buf);
        ctx->nal_buf = NULL;
    }
    for (int i = 0; i < 2; i++) {
        if (ctx->frame_buf[i]) {
            linearFree(ctx->frame_buf[i]);
            ctx->frame_buf[i] = NULL;
        }
    }
    ctx->initialized = false;
}

/* ── SPS/PPS extraction from AVCC extradata ────────────────────────── */

/* Include extradata submissions: a service break can precede the first slice. */
static Result process_nal(void *mapped, size_t bytes, unsigned type)
{
    static unsigned traced;
    bool trace = traced < 12;
    if (trace) {
        ++traced;
        log_write("MVD submit type=%u bytes=%lu va=%08lx pa=%08lx", type,
                  (unsigned long)bytes, (unsigned long)(uintptr_t)mapped,
                  (unsigned long)osConvertVirtToPhys(mapped));
    }
    Result ret = mvdstdProcessVideoFrame(mapped, bytes, 0, NULL);
    if (trace || !MVD_CHECKNALUPROC_SUCCESS(ret))
        log_write("MVD submit returned %08lx", (unsigned long)ret);
    return ret;
}

bool mvd_send_sps_pps(mvd_ctx_t *ctx, const uint8_t *extradata, int extradata_size)
{
    if (!ctx->initialized || !extradata || extradata_size < 8 || extradata[0] != 1)
        return false;

    int num_sps = extradata[5] & 0x1f;
    int offset = 6;

    for (int i = 0; i < num_sps; i++) {
        if (offset + 2 > extradata_size) return false;
        int sps_len = (extradata[offset] << 8) | extradata[offset + 1];
        offset += 2;
        if (sps_len <= 0 || offset + sps_len > extradata_size ||
            sps_len + 3 > ctx->nal_buf_size)
            return false;

        ctx->nal_buf[0] = 0x00;
        ctx->nal_buf[1] = 0x00;
        ctx->nal_buf[2] = 0x01;
        memcpy(ctx->nal_buf + 3, extradata + offset, sps_len);
        GSPGPU_FlushDataCache(ctx->nal_buf, sps_len + 3);
        void *mapped = osConvertOldLINEARMemToNew(ctx->nal_buf);
        if (mapped != ctx->nal_buf || ((uintptr_t)mapped & 0xfff)) return false;
        Result ret = process_nal(mapped, sps_len + 3, ctx->nal_buf[3] & 31);
        if (!MVD_CHECKNALUPROC_SUCCESS(ret)) return false;
        offset += sps_len;
    }

    if (offset >= extradata_size) return false;
    int num_pps = extradata[offset++];

    for (int i = 0; i < num_pps; i++) {
        if (offset + 2 > extradata_size) return false;
        int pps_len = (extradata[offset] << 8) | extradata[offset + 1];
        offset += 2;
        if (pps_len <= 0 || offset + pps_len > extradata_size ||
            pps_len + 3 > ctx->nal_buf_size)
            return false;

        ctx->nal_buf[0] = 0x00;
        ctx->nal_buf[1] = 0x00;
        ctx->nal_buf[2] = 0x01;
        memcpy(ctx->nal_buf + 3, extradata + offset, pps_len);
        GSPGPU_FlushDataCache(ctx->nal_buf, pps_len + 3);
        void *mapped = osConvertOldLINEARMemToNew(ctx->nal_buf);
        if (mapped != ctx->nal_buf || ((uintptr_t)mapped & 0xfff)) return false;
        Result ret = process_nal(mapped, pps_len + 3, ctx->nal_buf[3] & 31);
        if (!MVD_CHECKNALUPROC_SUCCESS(ret)) return false;
        offset += pps_len;
    }

    ctx->sps_sent = true;
    return true;
}

/* ── Decode a video packet ─────────────────────────────────────────── */

/* Consume a ready output before the next NAL changes the decoder state. */
static bool render_ready_frame(mvd_ctx_t *ctx)
{
    void *output = ctx->frame_buf[ctx->frame_write_idx];
    size_t bytes = (size_t)ctx->width * ctx->height * 2;
    MVDSTD_Config config;
    mvdstdGenerateDefaultConfig(&config, ctx->width, ctx->height,
                                ctx->width, ctx->height, NULL, output, NULL);
    GSPGPU_FlushDataCache(output, bytes);
    static unsigned traced;
    bool trace = traced < 5;
    if (trace) {
        ++traced;
        log_write("MVD render begin %dx%d", ctx->width, ctx->height);
    }
    Result ret;
    for (int tries = 0; tries < 50; ++tries) {
        ret = mvdstdRenderVideoFrame(&config, false);
        if (ret != MVD_STATUS_BUSY) break;
        svcSleepThread(500000LL);
    }
    if (trace || ret != MVD_STATUS_OK)
        log_write("MVD render returned %08lx", (unsigned long)ret);
    if (ret != MVD_STATUS_OK) return false;
    GSPGPU_InvalidateDataCache(output, bytes);
    ctx->frame_write_idx ^= 1;
    ctx->frame_ready = true;
    return true;
}

static bool mvd_submit_nal(mvd_ctx_t *ctx, const uint8_t *nal, size_t length,
                           bool *decoded)
{
    if (!length || (nal[0] & 0x80)) return false;
    unsigned type = nal[0] & 31;
    if (type != 1 && type != 5 && type != 7 && type != 8) return true;
    if (length + 3 > (size_t)ctx->nal_buf_size) return false;

    ctx->nal_buf[0] = 0x00;
    ctx->nal_buf[1] = 0x00;
    ctx->nal_buf[2] = 0x01;
    memcpy(ctx->nal_buf + 3, nal, length);
    GSPGPU_FlushDataCache(ctx->nal_buf, length + 3);
    void *mapped = osConvertOldLINEARMemToNew(ctx->nal_buf);
    if (mapped != ctx->nal_buf || ((uintptr_t)mapped & 0xfff)) return false;

    Result ret = process_nal(mapped, length + 3, type);
    if (!MVD_CHECKNALUPROC_SUCCESS(ret)) return false;
    if (ret == MVD_STATUS_FRAMEREADY) {
        if (!render_ready_frame(ctx)) return false;
        *decoded = true;
    }
    return true;
}

bool mvd_decode_packet(mvd_ctx_t *ctx, const uint8_t *data, int size)
{
    if (!ctx->initialized || !data || size <= 0)
        return false;

    /* Detect packet format:
     * - TS demuxer: Annex B (may have leading 0x00 padding before 00 00 01)
     * - MP4 demuxer: AVCC format (4-byte big-endian length prefix) */
    int lead = 0;
    while (lead + 3 <= size && data[lead] == 0x00 && data[lead + 1] == 0x00 && data[lead + 2] == 0x00)
        lead++;
    bool is_annexb = (lead + 3 <= size && data[lead] == 0x00 && data[lead + 1] == 0x00 && data[lead + 2] == 0x01);

    /* Sanity check: reject obviously corrupt NAL data before feeding MVD.
     * MVD operates via DMA — corrupt input can crash the entire system. */
    if (size < 5) {
        log_write("MVD: NAL too small (%d bytes), skipping", size);
        return false;
    }

    if (!is_annexb) {
        int check_off = 0;
        while (check_off + 4 < size) {
            uint32_t nal_size = ((uint32_t)data[check_off] << 24) |
                                ((uint32_t)data[check_off + 1] << 16) |
                                ((uint32_t)data[check_off + 2] << 8) |
                                (uint32_t)data[check_off + 3];
            check_off += 4;
            if (!nal_size || nal_size > (uint32_t)(size - check_off) ||
                nal_size + 3 > (uint32_t)ctx->nal_buf_size) return false;
            check_off += (int)nal_size;
        }
        if (check_off != size) return false;
    }

    bool decoded = false;

    if (is_annexb) {
        int start = lead > 0 && data[lead - 1] == 0x00 ? lead - 1 : lead;
        while (start < size) {
            int prefix = 0;
            if (start + 3 <= size && !data[start] && !data[start + 1]) {
                if (data[start + 2] == 1) prefix = 3;
                else if (start + 4 <= size && !data[start + 2] && data[start + 3] == 1) prefix = 4;
            }
            if (!prefix) return false;
            int end = start + prefix;
            while (end < size) {
                if (end + 3 <= size && !data[end] && !data[end + 1] &&
                    (data[end + 2] == 1 || (end + 4 <= size && !data[end + 2] && data[end + 3] == 1))) break;
                ++end;
            }
            if (end <= start + prefix) return false;
            if (!mvd_submit_nal(ctx, data + start + prefix, (size_t)(end - start - prefix), &decoded))
                return false;
            start = end;
        }
    } else {
        int src_off = 0;
        while (src_off + 4 < size) {
            uint32_t nal_size = ((uint32_t)data[src_off] << 24) |
                                ((uint32_t)data[src_off + 1] << 16) |
                                ((uint32_t)data[src_off + 2] << 8) |
                                (uint32_t)data[src_off + 3];
            src_off += 4;
            if (!mvd_submit_nal(ctx, data + src_off, nal_size, &decoded))
                return false;
            src_off += (int)nal_size;
        }
    }

    return decoded;
}

uint8_t *mvd_get_frame(mvd_ctx_t *ctx)
{
    /* Return the last completed frame (not the one being written to) */
    return ctx->frame_buf[ctx->frame_write_idx ^ 1];
}

void mvd_get_dimensions(const mvd_ctx_t *ctx, int *width, int *height)
{
    if (width) *width = ctx->width;
    if (height) *height = ctx->height;
}
