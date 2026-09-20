#!/usr/bin/env bash
#
# The clips the video example plays, built from nothing.
#
# Committed rather than generated at install time, because the example
# is a page someone opens rather than a test someone runs, and a page
# whose contents depend on the ffmpeg build on the machine is not a
# demonstration of anything. This script is here so the assets can be
# rebuilt and so what they are is written down rather than inferred
# from a file.
#
# `testsrc2` is used for every one of them rather than a real video,
# and that is deliberate: it draws a frame counter and a moving
# pattern, so a seek that lands on the wrong frame is visible on the
# page instead of being something you have to take on trust.
#
# Usage: scripts/gen-video-fixtures.sh
set -euo pipefail

out="$(dirname "$0")/../apps/playground/public/video"
mkdir -p "$out"
cd "$out"

size=480x270
rate=24
seconds=6
# A keyframe a second. The seek cost is one group of pictures, so this
# is what makes the example scrub well; `clip-long` uses two seconds
# to show the difference.
gop=$rate

src="testsrc2=size=$size:rate=$rate:duration=$seconds"

# The ordinary case: H.264, moov at the front, as everything served
# for streaming is.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$src" \
  -c:v libx264 -crf 30 -g $gop -pix_fmt yuv420p -movflags +faststart clip.mp4

# The same bytes with the moov at the end, which is what a camera
# writes and what a reader that only looks at the front of a file
# cannot open.
ffmpeg -hide_banner -loglevel error -y -i clip.mp4 -c copy clip-moov-last.mp4

# Fragmented: no sample tables at all, a moof per group of pictures.
# What a DASH or HLS segment is.
ffmpeg -hide_banner -loglevel error -y -i clip.mp4 -c copy \
  -movflags "frag_keyframe+empty_moov+default_base_moof" clip-fragmented.mp4

# Codecs whose configuration is read differently: VP9 from a vpcC, AV1
# from an av1C, and both needing a codec string assembled rather than
# guessed.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$src" \
  -c:v libvpx-vp9 -crf 40 -b:v 0 -g $gop -pix_fmt yuv420p -movflags +faststart clip-vp9.mp4
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$src" \
  -c:v libsvtav1 -crf 45 -g $gop -pix_fmt yuv420p -movflags +faststart clip-av1.mp4

# A file with sound, for the demuxer's audio side and for the clock.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$src" -f lavfi -i "sine=frequency=440:duration=$seconds" \
  -c:v libx264 -crf 30 -g $gop -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart clip-audio.mp4

# Long enough that a ranged read fetches several blocks rather than
# swallowing the file in its first request.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=$size:rate=$rate:duration=30" \
  -c:v libx264 -crf 32 -g 48 -pix_fmt yuv420p -movflags +faststart clip-long.mp4

# The poster is the clip's own first frame, which is the honest thing
# for a poster to be.
ffmpeg -hide_banner -loglevel error -y -i clip.mp4 -vf "select=eq(n\,0)" -vframes 1 -q:v 6 poster.jpg

ls -la
