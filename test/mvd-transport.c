#define _POSIX_C_SOURCE 200112L
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <3ds.h>
static bool replay;
static const void *converted;
static size_t calls, lengths[32], renders;
static Result slice_status = MVD_STATUS_FRAMEREADY;
static bool legacy_layout;
static unsigned init_calls;
static Result init_status;
static unsigned exits;
static int busy_renders = 0;
void *linearAlloc(size_t n) { return malloc(n); }
void *linearMemAlign(size_t n, size_t align) {
    void *p = NULL;
    if (posix_memalign(&p, align < sizeof(void*) ? sizeof(void*) : align, n) != 0) return NULL;
    return p;
}
void linearFree(void *p) { free(p); }
void svcSleepThread(int64_t ns) { (void)ns; }
void *osConvertOldLINEARMemToNew(const void *p) { converted=p; return legacy_layout ? (void *)((uintptr_t)p+0x10000000) : (void *)p; }
u32 osConvertVirtToPhys(const void *p) { return (u32)(uintptr_t)p; }
Result mvdstdInit(int a,int b,int c,int d,void *e) { init_calls++; return init_status; }
void mvdstdExit(void) { exits++; }
void GSPGPU_FlushDataCache(const void *p,size_t n) {}
void GSPGPU_InvalidateDataCache(const void *p,size_t n) {}
void log_write(const char *fmt,...) {}
Result mvdstdProcessVideoFrame(void *p,size_t n,u32 f,void *o) {
    assert(((uintptr_t)p & 0xfff) == 0);
    assert(p == converted);
    const unsigned char *bytes=converted;
    assert(n>=4 && bytes[0]==0 && bytes[1]==0 && bytes[2]==1);
    if (replay) {
        assert(fwrite(p, 1, n, stdout) == n);
    } else {
        assert(calls < sizeof lengths / sizeof lengths[0]);
        lengths[calls++] = n;
    }
    return (bytes[3]&31)==7 || (bytes[3]&31)==8 ? MVD_STATUS_PARAMSET : slice_status;
}
void mvdstdGenerateDefaultConfig(MVDSTD_Config *c,int a,int b,int d,int e,void *f,void *g,void *h) { memset(c,0,sizeof *c); }
Result MVDSTD_SetConfig(MVDSTD_Config *c) { assert(!"Premature configuration before frame ready"); return MVD_STATUS_OK; }
Result mvdstdRenderVideoFrame(MVDSTD_Config *c,bool wait) { assert(!wait); assert(slice_status==MVD_STATUS_FRAMEREADY); if (busy_renders > 0) { busy_renders--; return MVD_STATUS_BUSY; } renders++; return MVD_STATUS_OK; }
#include "../native/mvd_decode.c"
/* Optional FFmpeg replay. stdin holds little-endian lengths and demuxed
 * packets. stdout receives exactly the bytes supplied at the MVD IPC seam. */
static void replay_packets(int width, int height)
{
    mvd_ctx_t ctx;
    assert(mvd_init(&ctx, width, height));
    replay = true;
    unsigned char header[4];
    size_t count;
    while ((count = fread(header, 1, sizeof header, stdin)) != 0) {
        assert(count == sizeof header);
        uint32_t size = (uint32_t)header[0] | ((uint32_t)header[1] << 8) |
                        ((uint32_t)header[2] << 16) | ((uint32_t)header[3] << 24);
        assert(size > 0 && size <= 1024 * 1024);
        uint8_t *data = malloc(size);
        assert(data && fread(data, 1, size, stdin) == size);
        assert(mvd_decode_packet(&ctx, data, (int)size));
        free(data);
    }
    assert(!ferror(stdin));
    mvd_cleanup(&ctx);
}

int main(int argc, char **argv) {
    if (argc == 3) {
        replay_packets(atoi(argv[1]), atoi(argv[2]));
        return 0;
    }
    assert(argc == 1);
    mvd_ctx_t ctx;
    legacy_layout = true;
    assert(!mvd_is_available() && !mvd_init(&ctx,400,224));
    assert(init_calls == 0);
    legacy_layout = false;
    init_status = MVD_STATUS_BUSY;
    assert(!mvd_is_available());
    assert(!mvd_init(&ctx,400,224));
    assert(!ctx.initialized && exits == 0);
    init_status = 0;
    assert(mvd_init(&ctx,400,224));
    const uint8_t packet[]={0,0,0,1,0x67,0xaa,0,0,1,0x68,0xbb,0,0,0,1,0x65,0xcc};
    assert(mvd_decode_packet(&ctx,packet,sizeof packet));
    assert(calls==3 && lengths[0]==5 && lengths[1]==5 && lengths[2]==5);
    assert(!mvd_decode_packet(&ctx,packet,0));
    assert(!mvd_decode_packet(&ctx,NULL,20));
    unsigned char *large=calloc(1,NAL_BUF_SIZE+1);
    large[2]=1;large[3]=0x65;
    assert(!mvd_decode_packet(&ctx,large,NAL_BUF_SIZE+1));
    assert(calls==3);
    assert(renders == 1);
    slice_status = MVD_STATUS_OK;
    assert(!mvd_decode_packet(&ctx,packet,sizeof packet)); assert(renders == 1);
    const uint8_t delimiter[]={0,0,1,9,0xf0};
    size_t prior=calls; assert(!mvd_decode_packet(&ctx,delimiter,sizeof delimiter)); assert(calls==prior);
    const uint8_t corrupt[]={0xff,0xff,0xff,0xff,0x65};
    assert(!mvd_decode_packet(&ctx,corrupt,sizeof corrupt)); assert(calls==prior);
    /* Leading-zero padded Annex B packet + MVD_STATUS_BUSY retry */
    slice_status = MVD_STATUS_FRAMEREADY;
    busy_renders = 2;
    const uint8_t padded[]={0,0,0,0,1,0x65,0xcc};
    assert(mvd_decode_packet(&ctx,padded,sizeof padded));
    assert(busy_renders == 0 && renders == 2);
    busy_renders = 51;
    int previous_index = ctx.frame_write_idx;
    assert(!mvd_decode_packet(&ctx,padded,sizeof padded));
    assert(busy_renders == 1 && ctx.frame_write_idx == previous_index);
    busy_renders = 0;
    const uint8_t two_slices[]={0,0,1,0x65,0xab,0,0,1,0x61,0xcd};
    size_t before_renders = renders;
    assert(mvd_decode_packet(&ctx,two_slices,sizeof two_slices));
    assert(renders == before_renders + 2 && ctx.frame_write_idx == previous_index);
    slice_status = MVD_STATUS_INCOMPLETEPROCESSING;
    assert(!mvd_decode_packet(&ctx,padded,sizeof padded));
    assert(ctx.frame_write_idx == previous_index);
    /* 2-SPS + 1-PPS AVCC extradata */
    const uint8_t avcc[]={1,0x42,0,0x1f,0xff,0xe2, 0,2,0x67,0x11, 0,2,0x67,0x22, 1, 0,2,0x68,0x33};
    assert(mvd_send_sps_pps(&ctx,avcc,sizeof avcc));
    free(large);mvd_cleanup(&ctx);
    assert(!mvd_init(&ctx,4096,4096));
    return 0;
}
