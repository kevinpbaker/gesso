---
description: 'Video: a moving picture decoded in the render worker, its playback surface, and the props that control it.'
---

# Video

A moving picture, in the same rectangle an [image](/components/image)
would have filled. Reach for it for a clip that plays as part of the
interface: a looping background, a preview, a piece of artwork that
moves. `Video` deliberately takes `Image`'s props, because from the
application's side that is what it is, and swapping one for the other
changes one line.

What is underneath is not the same at all. There is no `<video>`
element anywhere: the file is fetched, demuxed and decoded on the
thread the application runs on, and each decoded frame is drawn where
it was produced.

<LiveExample id="video" height="260" />

<<< @/src/examples/VideoExample.tsx#video

Neither clip on this page is a file. The page fetches nothing, so the
frames are painted on the spot by a resolver the example supplies, and
what the left one demonstrates is the pacing rather than a codec. A
real MP4 needs a browser: see the limits below.

## Props

| Prop           | Type                                       | Default   | What it does                                                                         |
| -------------- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| `src`          | `string`                                   | required  | What the video resolver is asked for. Read once, when the component is built.        |
| `alt`          | `string`                                   | none      | What a screen reader reads. Omitting it makes the video decorative.                  |
| `objectFit`    | `'fill' \| 'cover' \| 'contain' \| 'none'` | `'cover'` | How each frame meets a box that is not its shape.                                    |
| `borderRadius` | `number`                                   | `0`       | Rounds the box, and clips the picture to it.                                         |
| `loop`         | `boolean`                                  | `true`    | Start again at the beginning when the clip ends.                                     |
| `autoplay`     | `boolean`                                  | `true`    | Start playing as soon as the clip is ready. `false` shows one frame and stays on it. |
| `ref`          | `UiNodeRef`                                | none      | Receives the node the frames are drawn on.                                           |

That is the whole control surface. There is no play method, no pause,
no seek and no time you can read: a `Video` is a declaration that this
rectangle shows this clip, and the two booleans are the only questions
it asks. An interface that needs a transport control is one that owns
the playback itself, which means supplying a `VideoResolver` and
driving the position from your own state.

Like `Image`, it reads `src` once, because a body runs once and a clip
whose source changed is a different clip: give it a `key`. It attaches
`rootModifiers` to the node it draws on, which is how a clip can be
carried through a route change by a `sharedElement`.

## What drives the frames

Nothing in the runtime was added to play a video. The playback is a
pure function of a position, and the position is driven by a repeating
linear tween over the clip's length, which is an ordinary animation on
an ordinary cell. So a video is scheduled by the same phase as every
other animated thing here, it stops dead when the runtime does, and it
declares its own frame interval so that a clip at 30 frames a second
inside an application drawing at 120 asks for thirty frames rather than
a hundred and twenty. The spec beside the example measures exactly
that: one new picture per clip frame, and nothing pending in between.

Going backwards is a seek, and a seek to zero is what looping is.

Playback is shared by source, not by node. Two `Video`s pointed at one
source watch one decode, and a node that arrives while another is still
leaving picks up the position the playback had already reached instead
of starting the clip again. That is what makes a clip survive a
navigation with no trick to reproduce, and it is why the resolver
reference counts rather than closing a playback the moment its last
holder lets go.

It keeps playing when the reader has asked for reduced motion, which is
the same call the [spinner](/components/spinner) makes: a video frozen
on its first frame is a video that has failed to load. An application
that wants a still passes `autoplay={false}` and decides for itself.

## The resolver, and what only a browser can do

The default `VideoResolver` fetches the file, demuxes it and decodes it
with `VideoDecoder`. All three need a browser, and the parts of this
page that a spec cannot reach are worth naming rather than implying:

- **WebCodecs has to be there.** `canDecodeVideo()` answers whether the
  thread has `VideoDecoder` at all. Where it does not, a `Video` fails
  and keeps its placeholder tint, exactly as a broken image does.
- **Progressive MP4 only.** The demuxer reads a non-fragmented `.mp4`.
  Fragmented MP4, which is what a DASH or HLS segment is, is detected
  and named in the error rather than mis-parsed into silence. Remux it
  first. There is no other container, and audio is skipped entirely:
  nothing on this side of the framework could play it.
- **The whole file is read at once.** Fine for a looping clip, and the
  wrong shape for an hour of video. `VideoResolver` is the seam where
  an application that needs byte ranges puts them.
- **The pixels are the browser's.** The example on this page measures
  that the surface reaches the node and that the picture is asked to
  change on the clip's own cadence. Whether a frame decoded, and
  whether it looked right, is something only a running browser shows,
  and nothing on this page measures it.

Substituting a decoder is the same seam as an image's resolver, and it
has to be in place before the first `Video` is built, so it is
declared where the root is:

```ts
// app.render.worker.ts
renderRoot(AppRoot).useMedia({ videoResolver: myResolver });
```

The example does exactly that, and its resolver is a real
`VideoPlayback`: one surface whose identity never changes, a `version`
that counts frames, and a `present(positionMs)` that is a pure function
of a position. Anything that can meet that contract can be a video
here.

<<< @/src/examples/VideoExample.tsx#playback

## Keyboard

None. A video is not a tab stop, binds no keys and answers no pointer
gesture. Anything a reader can press belongs to the interface around
it.

## Semantics

| What   | Value                                                             |
| ------ | ----------------------------------------------------------------- |
| Role   | `image`, when `alt` was given, on the box the frames are drawn on |
| Name   | `alt`                                                             |
| States | None. Playing is not a state anything is told about               |
| Value  | None                                                              |

`image` rather than a role of its own, because that is what the record
says about a rectangle showing a picture, and because a screen reader
has nothing to do with a decoration that moves. Omit `alt` and the
video is decorative: no role, no name, nothing in the semantics tree,
which is the right answer for a background clip and the wrong one for a
video that is the content.

Nothing announces that the clip is playing, has finished or has failed.
Where that matters, say it in text beside the video.

## Next

[Video on a canvas](/media/video) is the decoder, the surface and the
demuxer in full, and [Image](/components/image) is the still version of
the same rectangle.
