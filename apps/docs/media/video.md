---
description: 'Video on a canvas: a decoder in the render worker, a surface with a version, frames driven by the animation driver, and what only a browser can verify.'
---

# Video

A `Video` is an `Image` that moves. The same box, the same `objectFit`,
the same rounded clip, and on a node that has both, the video wins.
Underneath it is a different machine: an MP4 demuxer, a WebCodecs
`VideoDecoder`, and a surface the renderers re-upload as its version
changes. There is no `<video>` element anywhere in the page.

<LiveExample id="mediavideo" height="300" />

**The clip above is generated rather than decoded.** This site ships no
video file, so the example supplies its own `VideoResolver` and draws
twenty-four frames with `OffscreenCanvas`. Everything above the resolver
is the framework's: the surface, the tween that drives the position, the
presenting, the sharing between the two views, and the release when one
of them leaves. What it does not exercise is the decoder, which is the
part only a browser can run.

<<< @/src/examples/MediaVideoExample.tsx#views

## Where the decode happens

In the render worker, because `VideoDecoder` is available there. Fetch,
demux, decode and present all run on the thread that draws, and a
decoded frame is uploaded to a texture by the thread that produced it
without crossing the barrier.

The alternative was a hidden `<video>` on the main thread with
`requestVideoFrameCallback` handing each frame across as a transferred
`ImageBitmap`. It is far less code and it plays whatever the browser
plays. It was refused because it puts real decode work back on the
shell, and the shell is held to "what genuinely cannot run anywhere
else".

## What drives the frames

Nothing in a playback runs on a clock. `present(positionMs)` shows
whichever frame is due at that position and says whether the picture
changed:

<<< @/src/examples/MediaVideoExample.tsx#playback

The position comes from a repeating linear tween over the clip's
duration, which is an ordinary animation on an ordinary cell. Four
things follow, and none of them needed anything added to the runtime:

- A video is scheduled by the same `ticks` phase as every other animated
  thing, and appears in the frame profiler as one.
- It drops frames rather than falling behind, because a position that
  jumped past three frames presents the newest one and closes the rest.
- It stops dead when the runtime does.
- Going backwards is a seek, and a seek to zero is what looping is.

The tween is paced by the rate the playback reports, not by the display.
A 30 fps clip in an app running at 165 Hz asks for a frame thirty times
a second rather than a hundred and sixty-five, and an animation starting
beside it raises the rate for as long as it runs. The spec beside the
example measures exactly this: four intervals of the clock move the
position by four intervals of the clip.

## The surface, and why it has a version

`UiImage` is an `ImageBitmap`, and the WebGPU texture cache keys its
textures on that object with a `WeakMap`. For a picture that is right:
its identity and its pixels are the same thing. A video's pixels change
sixty times a second while the thing on screen stays the same thing, so
a source handing over a fresh object per frame would allocate a texture
and a bind group per frame and free neither promptly.

So `UiVideoSurface` has a stable identity for the life of the playback,
and a `version` that counts frames:

| Field             | What it is                                                       |
| ----------------- | ---------------------------------------------------------------- |
| `frame`           | The picture to draw now, or null before the first one            |
| `version`         | Bumped on every new frame; a cache re-uploads when it changes    |
| `width`, `height` | The picture's size, known from the container before any frame is |

The WebGPU backend compares versions and re-uploads into the texture it
already has, recreating it only when the size changes. Canvas2D does not
care and draws `frame` directly. That frame is a `VideoFrame` where
WebCodecs decoded it and may be an `ImageBitmap` where something else
produced it, as in the example above: both are `CanvasImageSource`, so
neither backend has to know which it got. The frame being replaced is
closed rather than left to the collector, because it holds decoded
pixels, often in GPU memory.

## Playback is shared by source

`VideoResolver` has `ImageResolver`'s shape, reference counting
included, and here the counting is worth more. Two elements pointed at
one source get one playback and therefore one decode, which the spec
asserts by checking that both views in the example are drawing the same
surface object.

That is also how a video survives a route change. The arriving element
resolves the source the departing one is still holding, gets the
playback that is already running, and picks it up mid-stream. The
reference implementation of that effect in the DOM has to physically
move its `<video>` element into the new document, because a second
`<video>` on the same file would start from the beginning.

Two details make it work, and both were learned the hard way:

- **The position is captured as an offset when an element resolves.**
  The decoder is shared, but the tween driving it belongs to the node,
  and a node built for the arriving screen starts its tween at zero.
  With both screens mounted during a transition, two tweens drove one
  playback from two different places, every disagreement wider than the
  seek tolerance was a seek backwards, and a seek drops the frame queue
  and reconfigures the decoder on the thread that is also laying out the
  transition. `videoSource` now adds the position the playback had
  reached, so the tween's zero means "here".
- **Releasing the last holder keeps the playback** instead of closing
  it, because the usual reason a source loses its last holder is a
  navigation about to give it another. Holding one costs nothing:
  nothing is driving its position, so no frame is decoded.

## What the demuxer reads

WebCodecs decodes; it does not demux. Getting `EncodedVideoChunk`s out
of a file means walking MP4's sample tables, which `Mp4Demuxer` does in
about 500 lines rather than through a dependency.

| Reads                                                                                                                       | Does not read                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Progressive MP4: `stsd` with `avcC`, `hvcC`, `av1C` or `vpcC`, `stts`, `ctts`, `stsc`, `stsz`/`stz2`, `stco`/`co64`, `stss` | Any container that is not MP4                                      |
| Fragmented MP4: `mvex`/`trex` defaults, then `moof`/`traf`/`tfhd`/`tfdt`/`trun`                                             | A manifest. It reads the fragments it is given, not a segment list |
| Audio tracks, through `demuxMp4Audio`: `mp4a` with its `esds`, and the configuration boxes Opus, ALAC and FLAC keep         | Free-format and other exotica                                      |
| Samples in decode order, which `VideoDecoder` reorders on the way out                                                       |                                                                    |

**Fragmented files are read.** A fragmented MP4 says nothing up front
about where its samples are: there is no `stco`, no `stsz` and no
`stts`, and the `stbl` in the `moov` is a shell holding only the
`stsd`. Each `moof` instead carries a `traf` per track describing its
samples inline, with anything omitted falling back to a default from
`tfhd` and failing that from `trex`. So it is a walk rather than a
table lookup, which is why the two shapes cannot share a code path.

The part that goes wrong is offsets. A sample's position is
`base_data_offset` plus the run's own `data_offset` plus the sizes
before it, and `base_data_offset` is one of three things: written into
the `tfhd`, the start of the enclosing `moof` when `default-base-is-moof`
is set, or the `moof` again by the specification's older first-`traf`
rule. The second is what every fragmenter writes today. Taking the
first-`traf` rule as the general one puts every fragment after the
first at the wrong offset, which decodes as noise rather than as an
error.

**Presentation times are rebased to zero.** A file's earliest
presentation timestamp is not required to be zero, and for anything
encoded with B-frames it is not: `ctts` shifts each sample forward of
its decode time, and the shift on the first sample is the reorder
depth. So a plain six second clip at 24 frames a second has its first
picture at 83 ms and its last ending at 6.083 s. A player that
believed those numbers would report a duration 83 ms too long and,
much worse, have no picture at all to show for position zero, which is
exactly what a paused clip looked like: `present(0)` found nothing due
because nothing was due, and a paused clip never asks again. The
earliest time is subtracted from every sample, which moves the clock
and changes nothing else.

**A codec string is assembled, not guessed.** `av01` on its own is not
a codec string: `VideoDecoder.isConfigSupported` answers false for it,
so a file reported that way never plays. The profile, level, tier and
bit depth come out of the `av1C` record and the string is built from
them, `vp09.00.31.08` likewise out of the `vpcC`. Where the record is
too short to read, the bare format is reported and
`isConfigSupported` is left to judge, because claiming a precise
string from bytes that are not there is worse than claiming none.

**Audio is read but not played**, which is a smaller gap than it
sounds and a platform constraint rather than a decision. See below.

## Reading a file in pieces

`DefaultVideoResolver` takes either a `fetch` or a `fetchRange`, and
they are two different products rather than a fast path and a slow one.
A fifteen-second loop is a few megabytes, is wanted in its entirety
within a second of starting, and is simplest held in one
`ArrayBuffer`. An hour of video is none of those: it is a gigabyte, a
viewer will watch four minutes of it, and holding it in memory to do so
is not a trade-off but a mistake. Neither should be silently upgraded
to the other, so an application says which it wants.

Given a `fetchRange`, the resolver walks the file's top-level boxes by
reading their headers and jumping, which finds the `moov` whether it is
at the front of the file (`-movflags +faststart`, and every file served
for streaming) or at the back (the default, and every file written by a
camera). The `moov` is then demuxed on its own, which works because the
offsets in a sample table are absolute positions in the file: the
tables are as correct read out of a small buffer as out of a large one.

Media then follows the decoder. `ByteSource.read` is **synchronous and
may answer null**, which is the whole design: the decoder is fed from
inside a presentation, on the frame clock, and a fill that awaited
anything would turn every frame into a microtask and every stall into a
dropped frame. So a sample whose bytes are not here ends the fill, a
request goes out for the window around it, and that request resumes the
fill when it lands.

Blocks are fetched aligned, a quarter of a megabyte at a time, and
evicted by last use rather than by position, because a viewer who seeks
back into what they just watched should find it still there. The header
probe is exactly one block, which is not a coincidence: a probe that
did not land on a block boundary could not be kept, and the front of
the file would be fetched once to find the header and again as the
first block.

Two things an application serving files itself has to get right, both
of which this framework can only report rather than fix:

- **The server must answer 206.** A `blob:` URL does not: it ignores
  the header and answers 200 with the whole body. A reader that took
  that response for the range it asked for would index into the wrong
  bytes, so check before reaching for `fetchRange`.
- **Cross-origin needs `Access-Control-Expose-Headers: Content-Range`.**
  Without it, `headers.get('Content-Range')` answers null, the reader
  takes the length of the piece it was handed for the length of the
  whole file, and every offset past the first block is wrong. The clip
  still opens, because the header is in that first block, which is
  exactly what makes it such a good trap.

## Controls

The position belongs to a tween inside the modifier, and
`VideoTransport` is the handle on it: `play`, `pause`,
`seek(seconds)`, `setRate`, `retry`, and the position, duration and
state to read back. It arrives through `onReady`, because a playback
does not exist until a file has been fetched and a decoder configured,
and a modifier attaches long before either.

A seek is a real seek. `needsSeek` asks two questions that are not
symmetric. **Backwards** past the tolerance is always a seek: a decoder
cannot run in reverse, so every frame in flight belongs to where we no
longer are, which is also why looping costs a keyframe. **Forwards** is
a seek only when the jump clears the samples already submitted, because
during ordinary playback the decoder runs a few frames ahead and the
keyframe covering the position is one it passed long ago. Without that
second test a scrub forwards would decode every frame in between at
playback speed, which is a scrub that crawls.

Having found the sync sample at or before the target, the playback
resets the decoder there and decodes forward. The frames in between are
decoded, because the pictures after them refer to them, and closed on
arrival rather than queued: that keeps the queue free so the gap is
crossed as fast as the decoder will go instead of one frame per
presentation. Nothing is presented until a frame at or past the target
lands, so a seek shows one picture rather than a rewind.

The answer comes late, and a paused clip has no next frame to deliver
it on, which is what `onFrame` is for: the playback presents the frame
it was waiting for and says so, and whoever is drawing repaints. Without
it a scrub while paused moved the scrubber and left the picture where
it was.

`autoplay: false` presents one frame and does not drive the position,
but the surface is shared by source, so another element playing the
same clip goes on moving the picture both of them are drawing.

Playback **keeps moving under reduced motion**, deliberately. The rule
this framework applies is to stop only where standing still would not
state something false, and a video frozen on its first frame is a video
that has failed to load. An app that wants a still passes
`autoplay: false` and decides for itself.

## Limits

- **WebCodecs, or nothing.** `canDecodeVideo()` says whether the current
  thread has a `VideoDecoder` at all. Where it does not, resolving
  rejects with a message naming Chrome 94 and up and worker
  availability, and the component's state goes to `failed`, which paints
  the box in `placeholderColor` and nothing else. That prop is the same
  one `Image` takes, defaulting to the theme's `controlBackground`, so a
  clip sitting on a surface of its own colour can say what a box with no
  picture in it should look like.
- **Hardware acceleration is not requested.** `prefer-hardware` reads
  like a preference and is a requirement: `isConfigSupported` answers
  false wherever there is no hardware decoder for the codec, which on a
  Linux box without VA-API is every codec, and the video then silently
  never plays. The field is left unset, which means `no-preference`.
- **A seek costs a group of pictures.** Going anywhere resets and
  reconfigures the decoder at the preceding sync sample, because a
  decoder mid-GOP holds reference frames for where it was, and then
  decodes forward through the gap without showing it. That is why a
  clip encoded with two-second keyframes scrubs well and one encoded
  with ten-second keyframes does not, and it is the honest price of
  seeking a progressive file. Measured in a browser at 13 to 22 ms for
  a 1280x992 H.264 clip on a software decoder; see below.
- **Autoplay policies do not apply, as far as this goes.** A browser's
  media autoplay policy gates media elements, and there is no media
  element here: frames come from `VideoDecoder` and are drawn on a
  canvas, and no audio is decoded at all. That rests on what the
  pipeline is rather than on a survey of browser policies, which has not
  been done.
- **Sound is the shell's.** `AudioContext` does not exist on a worker,
  which is where this decodes and draws, so nothing here plays a
  file's audio track. `demuxMp4Audio` reads it, which is how a player
  knows whether to offer a mute button, and `VideoClock` is the seam
  that keeps a picture in step with sound played elsewhere. That seam
  inverts which of the two owns time, and it has to: video drops
  frames and nobody can tell, audio can neither drop nor resample
  without being heard, so the sound leads and the picture follows.
  `audioClock(audio, src)` is the adapter over `AudioService`.

## What this page was checked against

`MediaVideoExample.spec.ts` mounts the example with a resolver of its
own and asserts three things: that two elements on one source get one
playback and one surface, that four of the clip's frame intervals move
the position by exactly four intervals and the surface's version by
four, and that removing the second view releases its hold while the
remaining view goes on advancing.

Nothing in that touches a decoder, because node has neither
`VideoDecoder` nor `OffscreenCanvas`. `VideoResolver.spec.ts` covers
the part that does, against a decoder that records what it was handed
and decodes nothing, and that is deliberate rather than a compromise: a
seek that starts at the wrong keyframe is a mistake in a sample table
index, and asserting it against pixels would be slower and vaguer.

The rest is a browser's answer, and `pnpm check:video` is where it is
asked. It opens a page that fetches a real 1280x992 H.264 clip, 120
frames over five seconds, demuxes it with the real demuxer and decodes
it with the platform's own `VideoDecoder`, then asserts four things per
source: the container was read, a picture decoded, _new_ pictures kept
arriving rather than one being presented over and over, and a seek to
four fifths in changed the picture within a budget.

It is a matrix over where the bytes came from, because that is the axis
an application actually varies and the one nothing else covers: the
same clip as a path on the server, as a `blob:` URL, as a `data:` URL,
and across an origin with CORS. All four decode. What differs is
whether the transport honours a `Range` request, which the script
reports rather than asserts, because it is a fact about the platform:

```
  ✓ local asset on the server
      1280x992, 5.00s, 41.7ms per frame; 24 pictures in the first second; seek 19ms
      ranges: honoured. Drew a picture after 1 requests (62% of the file)
  ✓ blob: URL
      1280x992, 5.00s, 41.7ms per frame; 24 pictures in the first second; seek 17ms
      ranges: honoured. Drew a picture after 1 requests (62% of the file)
  ✓ data: URL
      1280x992, 5.00s, 41.7ms per frame; 24 pictures in the first second; seek 22ms
      ranges: not honoured. The server answered 200 rather than 206, so ranges are not honoured here.
  ✓ cross-origin URL with CORS
      1280x992, 5.00s, 41.7ms per frame; 24 pictures in the first second; seek 15ms
      ranges: honoured. Drew a picture after 1 requests (62% of the file)
```

It is not part of `pnpm check`, for the reason the screenshot gates are
not: it needs Chrome with H.264, which a Chromium build without
proprietary codecs does not have.

What remains unverified is a WebGPU parity fixture for a video frame
and a budget spec for the per-frame upload; neither exists.

## Next

The props, semantics and defaults of the four Media components are on
their own pages: [Image](/components/image), [Icon](/components/icon)
and [Video](/components/video).
[VideoPlayer](/components/video-player) is the transport above,
assembled out of ordinary controls.
