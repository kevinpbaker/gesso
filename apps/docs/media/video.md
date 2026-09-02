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

| Field    | What it is                                             |
| -------- | ------------------------------------------------------ |
| `frame`  | The picture to draw now, or null before the first one   |
| `version` | Bumped on every new frame; a cache re-uploads when it changes |
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

| Reads                                                                    | Does not read                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Progressive MP4: `stsd` with `avcC` or `hvcC`, `stts`, `ctts`, `stsc`, `stsz`/`stz2`, `stco`/`co64`, `stss` | Fragmented MP4 (`moof`/`traf`/`trun`), which is what DASH and HLS segments are |
| Samples in decode order, which `VideoDecoder` reorders on the way out     | Audio, because nothing on this side of the framework could play it |

A fragmented file is detected and named, with a message saying how to
remux, rather than parsed into silence: a demuxer returning zero samples
for a file the browser plays perfectly is a bug that costs an afternoon.
The whole file is parsed from one `ArrayBuffer`, so there are no byte
ranges; that is pure cost for a looping clip and would be the thing to
change for an hour of video, which is what the resolver seam is for.

## Controls, and what there are not

`loop` and `autoplay` are decided when the element is built, and they
default to true. There is no pause, no seek, no rate and no volume: the
position belongs to the tween inside the modifier, and no component prop
reaches it.

Two consequences worth knowing before you plan a player around this.
`autoplay: false` presents one frame and does not drive the position,
but the surface is shared by source, so another element playing the same
clip goes on moving the picture both of them are drawing. And an
application that genuinely needs a transport has a seam rather than an
API: `VideoPlayback.present` is a pure function of a position, so a
resolver of your own can hand back a playback you drive yourself, which
is what the example on this page does.

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
  the tinted box and nothing else.
- **Hardware acceleration is not requested.** `prefer-hardware` reads
  like a preference and is a requirement: `isConfigSupported` answers
  false wherever there is no hardware decoder for the codec, which on a
  Linux box without VA-API is every codec, and the video then silently
  never plays. The field is left unset, which means `no-preference`.
- **The loop point costs a keyframe.** Going back to the start resets
  and reconfigures the decoder, because a decoder mid-GOP holds
  reference frames for where it was. That is a measurable hitch on a
  long GOP and invisible on the two-second ones a looping clip is
  usually encoded with. It has not been measured here.
- **Autoplay policies do not apply, as far as this goes.** A browser's
  media autoplay policy gates media elements, and there is no media
  element here: frames come from `VideoDecoder` and are drawn on a
  canvas, and no audio is decoded at all. That rests on what the
  pipeline is rather than on a survey of browser policies, which has not
  been done.
- **No audio, at all.** A file's audio track is skipped by the demuxer.

## What this page was checked against

`MediaVideoExample.spec.ts` mounts the example with a resolver of its
own and asserts three things: that two elements on one source get one
playback and one surface, that four of the clip's frame intervals move
the position by exactly four intervals and the surface's version by
four, and that removing the second view releases its hold while the
remaining view goes on advancing.

Nothing in that touches a decoder, because node has neither
`VideoDecoder` nor `OffscreenCanvas`. What has been checked in a browser
is the real path, and it was checked elsewhere: the playground's
transitions route plays an H.264 clip in the render worker on both
backends, and the demuxer was run against that file and agreed with
`ffprobe` on its 240 samples, its duration and its keyframes. What
remains unverified there is a WebGPU parity fixture for a video frame
and a budget spec for the per-frame upload; neither exists.

## Next

The props, semantics and defaults of the four Media components are on
their own pages: [Image](/components/image), [Icon](/components/icon)
and [Video](/components/video).
