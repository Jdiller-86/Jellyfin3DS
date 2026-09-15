#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include <3ds.h>
static const void *converted;
static size_t calls, lengths[8];
void *linearAlloc(size_t n) { return malloc(n); }
void linearFree(void *p) { free(p); }
void *osConvertOldLINEARMemToNew(const void *p) { converted=p; return (void *)((uintptr_t)p+0x10000000); }
u32 osConvertVirtToPhys(const void *p) { return (u32)(uintptr_t)p; }
Result mvdstdInit(int a,int b,int c,int d,void *e) { return 0; }
void mvdstdExit(void) {}
void GSPGPU_FlushDataCache(const void *p,size_t n) {}
void log_write(const char *fmt,...) {}
Result mvdstdProcessVideoFrame(void *p,size_t n,u32 f,void *o) {
    assert((uintptr_t)p==(uintptr_t)converted+0x10000000);
    const unsigned char *bytes=converted;
    assert(n>=4 && bytes[0]==0 && bytes[1]==0 && bytes[2]==1);
    lengths[calls++]=n;
    return (bytes[3]&31)==7 || (bytes[3]&31)==8 ? MVD_STATUS_PARAMSET : MVD_STATUS_OK;
}
void mvdstdGenerateDefaultConfig(MVDSTD_Config *c,int a,int b,int d,int e,void *f,void *g,void *h) { memset(c,0,sizeof *c); }
Result MVDSTD_SetConfig(MVDSTD_Config *c) { return MVD_STATUS_OK; }
Result mvdstdRenderVideoFrame(MVDSTD_Config *c,bool wait) { return MVD_STATUS_OK; }
#include "../native/mvd_decode.c"
int main(void) {
    mvd_ctx_t ctx;
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
    free(large);mvd_cleanup(&ctx);
    return 0;
}
