/* Original 3DS fallback. Included after the pinned player's queue/audio helpers.
 * FFmpeg is single-threaded here: the original console has one application CPU.
 * Jellyfin must transcode to <=256x144 on original models or <=400x240
 * on New models; Native is selected explicitly in the latter case.
 */
#include "rgb565.h"
_Static_assert(sizeof(enum AVColorSpace) == 4 && sizeof(enum AVCodecID) == 4,
               "FFmpeg public enum ABI must match its 32-bit enum build");

static bool software_frame(AVFrame *frame, u16 *pixels, int width, int height)
{
    if (frame->format != AV_PIX_FMT_YUV420P || frame->width != width ||
        frame->height != height)
        return false;
    return j3ds_yuv420p_to_rgb565(frame->data[0], frame->linesize[0],
                                  frame->data[1], frame->linesize[1],
                                  frame->data[2], frame->linesize[2],
                                  pixels, width, height);
}

static void software_decode_thread(void)
{
    AVCodecContext *decoder = NULL;
    AVPacket *packet = NULL;
    AVFrame *frame = NULL;
    u16 *pixels = NULL;
    const char *error = NULL;
    while (!s_vp.stop_requested &&
           __atomic_load_n(&s_vp.demux.ring_fill, __ATOMIC_ACQUIRE) < PREFETCH_BYTES &&
           !__atomic_load_n(&s_vp.demux.ring_finished, __ATOMIC_ACQUIRE))
        svcSleepThread(10000000LL);
    if (s_vp.stop_requested) return;
    if (!demux_init(&s_vp.demux)) { error = "Could not open the video stream"; goto done; }
    int width = s_vp.demux.video_width, height = s_vp.demux.video_height;
    int max_width = direct_media_is_new_model() ? 400 : 256;
    int max_height = direct_media_is_new_model() ? 240 : 144;
    if (width <= 0 || height <= 0 || width > max_width || height > max_height ||
        (width & 1) || (height & 1)) {
        error = "Server exceeded this 3DS video size limit"; goto done;
    }
    AVFormatContext *format = s_vp.demux.fmt_ctx;
    AVStream *stream = format->streams[s_vp.demux.video_stream_idx];
    const AVCodec *codec = avcodec_find_decoder(AV_CODEC_ID_H264);
    decoder = codec ? avcodec_alloc_context3(codec) : NULL;
    if (!decoder || avcodec_parameters_to_context(decoder, stream->codecpar) < 0) {
        error = "Could not prepare the software decoder"; goto done;
    }
    decoder->thread_count = direct_media_is_new_model() ? 2 : 1;
    decoder->thread_type = direct_media_is_new_model() ? FF_THREAD_SLICE : 0;
    if (avcodec_open2(decoder, codec, NULL) < 0) {
        error = "Could not open the software decoder"; goto done;
    }
    frame = av_frame_alloc();
    packet = av_packet_alloc();
    pixels = malloc((size_t)width * height * 2);
    if (!frame || !packet || !pixels) { error = "Not enough memory for video"; goto done; }
    fq_init(&s_vp.fq, width, height);
    if (!s_vp.fq.popped.data) { error = "Not enough frame memory"; goto done; }
    for (int i = 0; i < FRAME_QUEUE_SIZE; ++i)
        if (!s_vp.fq.frames[i].data) { error = "Not enough frame memory"; goto done; }
    s_vp.display_width = width;
    s_vp.display_height = height;
    init_audio_decoder(&s_vp.demux);
    s_vp.state = VIDEO_PLAYING;
    while (!s_vp.stop_requested) {
        bool video = false;
        if (demux_read_packet(&s_vp.demux, packet, &video) < 0) break;
        if (!video) decode_audio_packet(packet);
        else {
            int result = avcodec_send_packet(decoder, packet);
            if (result == AVERROR_INVALIDDATA || result == AVERROR(EAGAIN)) {
                av_packet_unref(packet);
                continue;
            }
            if (result < 0) { error = "Software video decode failed"; break; }
            while ((result = avcodec_receive_frame(decoder, frame)) >= 0) {
                if (!software_frame(frame, pixels, width, height)) {
                    error = "Server returned an unsupported video format"; break;
                }
                double pts = frame->best_effort_timestamp == AV_NOPTS_VALUE ? -1.0 :
                    frame->best_effort_timestamp * av_q2d(stream->time_base);
                if (pts >= 0) s_vp.position_ticks = s_vp.seek_offset_ticks + (int64_t)(pts * 10000000.0);
                fq_push(&s_vp.fq, (u8 *)pixels, width, height, pts);
                ++s_vp.frames_decoded;
                av_frame_unref(frame);
            }
            if (result != AVERROR(EAGAIN) && result != AVERROR_EOF &&
                result != AVERROR_INVALIDDATA && result < 0)
                error = "Software video decode failed";
        }
        av_packet_unref(packet);
        if (error) break;
    }
done:
    av_frame_free(&frame);
    av_packet_free(&packet);
    avcodec_free_context(&decoder);
    free(pixels);
    if (error) {
        snprintf(s_vp.error_msg, sizeof s_vp.error_msg, "%s", error);
        s_vp.state = VIDEO_ERROR;
    } else if (!s_vp.stop_requested) s_vp.state = VIDEO_STOPPED;
}
