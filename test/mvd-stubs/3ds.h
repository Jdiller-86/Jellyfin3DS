#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
typedef uint8_t u8;
typedef uint32_t u32;
typedef int32_t Result;
typedef struct { u32 physaddr_outdata0; } MVDSTD_Config;
#define MVDMODE_VIDEOPROCESSING 1
#define MVD_INPUT_H264 1
#define MVD_OUTPUT_BGR565 1
#define MVD_DEFAULT_WORKBUF_SIZE 4096
#define MVD_STATUS_OK 0x17000
#define MVD_STATUS_PARAMSET 0x17001
#define MVD_CHECKNALUPROC_SUCCESS(x) ((x)==MVD_STATUS_OK || (x)==MVD_STATUS_PARAMSET)
#define R_FAILED(x) ((x)<0)
#define R_SUCCEEDED(x) ((x)>=0)
void *linearAlloc(size_t);
void linearFree(void *);
void *osConvertOldLINEARMemToNew(const void *);
u32 osConvertVirtToPhys(const void *);
Result mvdstdInit(int,int,int,int,void *);
void mvdstdExit(void);
void GSPGPU_FlushDataCache(const void *,size_t);
Result mvdstdProcessVideoFrame(void *,size_t,u32,void *);
void mvdstdGenerateDefaultConfig(MVDSTD_Config *,int,int,int,int,void *,void *,void *);
Result MVDSTD_SetConfig(MVDSTD_Config *);
Result mvdstdRenderVideoFrame(MVDSTD_Config *,bool);
