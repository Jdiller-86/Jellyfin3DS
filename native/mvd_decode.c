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

bool mvd_is_available(void)
{
    /* Try to init MVD — only succeeds on New 3DS */
    Result ret = mvdstdInit(MVDMODE_VIDEOPROCESSING, MVD_INPUT_H264,
                            MVD_OUTPUT_BGR565, MVD_DEFAULT_WORKBUF_SIZE, NULL);
    if (R_SUCCEEDED(ret)) {
        mvdstdExit();
        return true;
    }
    return false;
}

/* ── Init / Cleanup ────────────────────────────────────────────────── */

bool mvd_init(mvd_ctx_t *ctx, int width, int height)
{
    memset(ctx, 0, sizeof(*ctx));
    if (width < 1 || height < 1 || width > 512 || height > 256) return false;

    ctx->width = ALIGN16(width);
    ctx->height = ALIGN16(height);

    /* Initialize MVD service */
    Result ret = mvdstdInit(MVDMODE_VIDEOPROCESSING, MVD_INPUT_H264,
                            MVD_OUTPUT_BGR565, MVD_DEFAULT_WORKBUF_SIZE, NULL);
    if (R_FAILED(ret))
        return false;

    /* Allocate NAL buffer in linear memory (required by MVD DMA) */
    ctx->nal_buf = linearAlloc(NAL_BUF_SIZE);
    if (!ctx->nal_buf) {
        mvdstdExit();
        return false;
    }
    ctx->nal_buf_size = NAL_BUF_SIZE;
    ctx->initialized = true;

    /* Allocate double-buffered output frames in linear memory */
    int frame_size = ctx->width * ctx->height * 2; /* BGR565 = 2 bytes/pixel */
    for (int i = 0; i < 2; i++) {
        ctx->frame_buf[i] = linearAlloc(frame_size);
        if (!ctx->frame_buf[i]) {
            mvd_cleanup(ctx);
            return false;
        }
        memset(ctx->frame_buf[i], 0, frame_size);
    }

    ctx->frame_write_idx = 0;
    ctx->initialized = true;
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

bool mvd_send_sps_pps(mvd_ctx_t *ctx, const uint8_t *extradata, int extradata_size)
{
    if (!ctx->initialized || !extradata || extradata_size < 8 || extradata[0] != 1)
        return false;

    /* AVCC extradata layout:
     * [0]    version
     * [1-3]  profile, compat, level
     * [4]    length_size_minus_one (lower 2 bits)
     * [5]    num_sps (lower 5 bits)
     * [6-7]  sps_length (big-endian)
     * [8..]  sps_data
     * [..]   num_pps
     * [..]   pps_length
     * [..]   pps_data
     */

    int offset = 6;
    int sps_len = (extradata[offset] << 8) | extradata[offset + 1];
    offset += 2;

    if (offset + sps_len > extradata_size)
        return false;

    /* Send SPS with Annex B start code */
    int pos = 0;
    ctx->nal_buf[pos++] = 0x00;
    ctx->nal_buf[pos++] = 0x00;
    ctx->nal_buf[pos++] = 0x01;
    memcpy(ctx->nal_buf + pos, extradata + offset, sps_len);
    pos += sps_len;

    GSPGPU_FlushDataCache(ctx->nal_buf, pos);
    mvdstdProcessVideoFrame(osConvertOldLINEARMemToNew(ctx->nal_buf), pos, 0, NULL);

    offset += sps_len;

    /* PPS count byte */
    if (offset >= extradata_size) return false;
    offset++; /* skip num_pps */

    if (offset + 2 > extradata_size) return false;
    int pps_len = (extradata[offset] << 8) | extradata[offset + 1];
    offset += 2;

    if (offset + pps_len > extradata_size)
        return false;

    /* Send PPS with Annex B start code */
    pos = 0;
    ctx->nal_buf[pos++] = 0x00;
    ctx->nal_buf[pos++] = 0x00;
    ctx->nal_buf[pos++] = 0x01;
    memcpy(ctx->nal_buf + pos, extradata + offset, pps_len);
    pos += pps_len;

    GSPGPU_FlushDataCache(ctx->nal_buf, pos);
    mvdstdProcessVideoFrame(osConvertOldLINEARMemToNew(ctx->nal_buf), pos, 0, NULL);

    ctx->sps_sent = true;
    return true;
}

/* ── Decode a video packet ─────────────────────────────────────────── */

static bool mvd_submit_nal(mvd_ctx_t *ctx, const uint8_t *nal, size_t length,
                           bool *decoded, Result *ret_out)
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
    if (!mapped || ((uintptr_t)mapped & 3)) return false;

    Result ret = mvdstdProcessVideoFrame(mapped, length + 3, 0, NULL);
    static unsigned unit_logs;
    if (unit_logs++ < 12 || !MVD_CHECKNALUPROC_SUCCESS(ret))
        log_write("MVD unit=%u bytes=%lu status=%08lx", type, (unsigned long)length, (unsigned long)ret);
    if (!MVD_CHECKNALUPROC_SUCCESS(ret)) { *ret_out = ret; return false; }
    if (ret == MVD_STATUS_FRAMEREADY) *decoded = true;
    *ret_out = ret;
    return true;
}

bool mvd_decode_packet(mvd_ctx_t *ctx, const uint8_t *data, int size)
{
    if (!ctx->initialized || !data || size <= 0)
        return false;

    /* Detect packet format:
     * - TS demuxer: already Annex B (starts with 00 00 00 01 or 00 00 01)
     * - MP4 demuxer: AVCC format (4-byte big-endian length prefix) */
    bool is_annexb = (size >= 4 &&
                      data[0] == 0x00 && data[1] == 0x00 &&
                      (data[2] == 0x01 || (data[2] == 0x00 && data[3] == 0x01)));

    if (size > ctx->nal_buf_size) return false;

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

    /* Set output config for the current write buffer */
    MVDSTD_Config config;
    mvdstdGenerateDefaultConfig(&config,
                                 ctx->width, ctx->height,
                                 ctx->width, ctx->height,
                                 NULL, NULL, NULL);
    config.physaddr_outdata0 = osConvertVirtToPhys(ctx->frame_buf[ctx->frame_write_idx]);

    /* Do not configure/render before SPS/PPS and a ready frame. The MVD
     * system process treats an early rendering request as a fatal state. */
    GSPGPU_FlushDataCache(ctx->frame_buf[ctx->frame_write_idx], ctx->width * ctx->height * 2);

    Result ret = MVD_STATUS_PARAMSET;
    bool decoded = false;

    if (is_annexb) {
        int start = 0;
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
            if (!mvd_submit_nal(ctx, data + start + prefix, (size_t)(end - start - prefix), &decoded, &ret))
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
            if (!mvd_submit_nal(ctx, data + src_off, nal_size, &decoded, &ret))
                return false;
            src_off += (int)nal_size;
        }
    }

    static int frame_count = 0;
    frame_count++;
    if (frame_count <= 5 || frame_count % 100 == 0) {
        log_write("MVD: ProcessNAL ret=0x%08lX nal_size=%d frame#%d",
                  (unsigned long)ret, size, frame_count);
    }

    if (R_FAILED(ret) && !MVD_CHECKNALUPROC_SUCCESS(ret)) {
        log_write("MVD: ProcessNAL FAILED ret=0x%08lX", (unsigned long)ret);
        return false;
    }

    /* Try to render the decoded frame */
    if (decoded) {
        ret = mvdstdRenderVideoFrame(&config, true);
        if (frame_count <= 5 || frame_count % 100 == 0) {
            log_write("MVD: RenderFrame ret=0x%08lX", (unsigned long)ret);
        }
        if (ret == MVD_STATUS_OK) {
            GSPGPU_InvalidateDataCache(ctx->frame_buf[ctx->frame_write_idx],
                                   ctx->width * ctx->height * 2);
            ctx->frame_write_idx ^= 1; /* swap double buffer */
            ctx->frame_ready = true;
            return true;
        }
    }

    return false;
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
