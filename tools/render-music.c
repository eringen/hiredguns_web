#include <stdio.h>
#include <xmp.h>

/* Write one pass of the original module as stereo signed 16-bit native PCM. */
int main(int argc, char **argv)
{
    if (argc != 2) return 1;
    xmp_context player = xmp_create_context();
    if (!player || xmp_load_module(player, argv[1]) < 0 ||
        xmp_start_player(player, 44100, 0) < 0) return 1;
    struct xmp_frame_info frame;
    int status;
    while ((status = xmp_play_frame(player)) == 0) {
        xmp_get_frame_info(player, &frame);
        if (frame.loop_count) break;
        if (fwrite(frame.buffer, 1, frame.buffer_size, stdout) != (size_t)frame.buffer_size)
            return 1;
    }
    xmp_end_player(player);
    xmp_release_module(player);
    xmp_free_context(player);
    return status && status != -XMP_END;
}
