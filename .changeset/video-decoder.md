---
'gesso-core': patch
---

**A clip you can seek, and a file you need not hold all of.** The media
tier could play a looping clip from the beginning and not much else.

A seek was a rewind: going backwards reset the decoder to sample zero,
so reaching three quarters of the way through a clip decoded the other
three quarters first. It now starts at the sync sample covering the
target and throws away the frames between, so the cost of a seek is one
group of pictures. Measured in a browser at 13 to 22ms for a 1280x992
H.264 clip on a software decoder.

**Presentation times are rebased to zero**, which sounds like
housekeeping and was a clip that would not show its first frame.
Anything encoded with B-frames has its first picture a reorder depth
into the file: a six second clip at 24fps reports 6.083s and has
nothing at all due at position zero. `present(0)` therefore found no
frame, and since a paused clip never asks again, a still stayed blank
for ever. Playing clips hid it by advancing past 83ms within two
frames.

Converting a decoded frame to a bitmap is asynchronous, so `present`
returns having chosen a frame that is not drawable yet. The surface now
says when one actually lands, through `VideoPlayback.onFrame`. Without
it a scrub on a paused clip moved the scrubber and left the picture
where it was.

**Fragmented MP4 is read**, out of `moof`/`traf`/`trun` with defaults
from `trex`, which is what a DASH or HLS segment is. Audio tracks are
read too, through `demuxMp4Audio`, so a player can know whether to
offer a mute button, though nothing here plays one. AV1 and VP9 codec
strings are assembled from their configuration records rather than
guessed: `av01` on its own is not a codec string, and a file reported
that way never played at all.

**A file need not be held whole.** `DefaultVideoResolver` takes a
`fetchRange` as well as a `fetch`, and they are two products rather
than a fast path and a slow one: a fifteen second loop is simplest held
in one buffer, and an hour of video is a gigabyte nobody will watch all
of. Given ranges, the resolver walks the top-level boxes to find the
`moov` whether it is at the front of the file or the back, and media
follows the decoder through `ByteSource`, whose `read` is synchronous
and may answer null because the decoder is fed from inside a frame.

`parseWebVtt` and `cueAt` read a caption track. They never throw: a
caption file is content, usually someone else's, and one malformed cue
in a hundred is not a reason to show none of them.
