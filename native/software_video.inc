/* Original 3DS fallback. Included after the pinned player's queue/audio helpers.
 * FFmpeg is single-threaded here: the original console has one application CPU.
 * Jellyfin must transcode to <=256x144, 12 fps, baseline H.264, YUV420P.
 */
_Static_assert(sizeof(enum AVColorSpace) == 4 && sizeof(enum AVCodecID) == 4,
               "FFmpeg public enum ABI must match its 32-bit enum build");
static unsigned char clamp_color(int x) { return x < 0 ? 0 : x > 255 ? 255 : x; }

static bool software_frame(AVFrame *frame, u16 *pixels, int width, int height)
{
    if (frame->format != AV_PIX_FMT_YUV420P || frame->width != width ||
        frame->height != height || !frame->data[0] || !frame->data[1] || !frame->data[2])
        return false;
    for (int y = 0; y < height; ++y) {
        const u8 *luma = frame->data[0] + y * frame->linesize[0];
        const u8 *cb = frame->data[1] + (y / 2) * frame->linesize[1];
        const u8 *cr = frame->data[2] + (y / 2) * frame->linesize[2];
        for (int x = 0; x < width; ++x) {
            int c = luma[x] - 16, d = cb[x / 2] - 128, e = cr[x / 2] - 128;
            unsigned r = clamp_color((298 * c + 409 * e + 128) >> 8);
            unsigned g = clamp_color((298 * c - 100 * d - 208 * e + 128) >> 8);
            unsigned b = clamp_color((298 * c + 516 * d + 128) >> 8);
            pixels[y * width + x] = (r >> 3) | ((g >> 2) << 5) | ((b >> 3) << 11);
        }
    }
    return true;
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
    if (width <= 0 || height <= 0 || width > 256 || height > 144 || (width & 1)) {
        error = "Server must transcode video to 256x144 or smaller"; goto done;
    }
    AVFormatContext *format = s_vp.demux.fmt_ctx;
    AVStream *stream = format->streams[s_vp.demux.video_stream_idx];
    const AVCodec *codec = avcodec_find_decoder(AV_CODEC_ID_H264);
    decoder = codec ? avcodec_alloc_context3(codec) : NULL;
    if (!decoder || avcodec_parameters_to_context(decoder, stream->codecpar) < 0) {
        error = "Could not prepare the software decoder"; goto done;
    }
    decoder->thread_count = 1;
    decoder->thread_type = 0;
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
            if (result != AVERROR(EAGAIN) && result != AVERROR_EOF && result < 0)
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
