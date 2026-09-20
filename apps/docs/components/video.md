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

<LiveExample id="video" height="330" />

<<< @/src/examples/VideoExample.tsx#video

None of the three clips on this page is a file. The page fetches
nothing, so the frames are painted on the spot by a resolver the
example supplies, what the top left one demonstrates is the pacing
rather than a codec, and the third names a source that resolver
refuses. A real MP4 needs a browser: see the limits below.

## Props

| Prop               | Type                                       | Default             | What it does                                                                         |
| ------------------ | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| `src`              | `string`                                   | required            | What the video resolver is asked for. Read once, when the component is built.        |
| `alt`              | `string`                                   | none                | What a screen reader reads. Omitting it makes the video decorative.                  |
| `objectFit`        | `'fill' \| 'cover' \| 'contain' \| 'none'` | `'cover'`           | How each frame meets a box that is not its shape.                                    |
| `borderRadius`     | `number`                                   | `0`                 | Rounds the box, and clips the picture to it.                                         |
| `placeholderColor` | `UiColorValue`                             | `controlBackground` | The tint while the box has no picture on it.                                         |
| `loop`             | `boolean`                                  | `true`              | Start again at the beginning when the clip ends.                                     |
| `autoplay`         | `boolean`                                  | `true`              | Start playing as soon as the clip is ready. `false` shows one frame and stays on it. |
| `rate`             | `number`                                   | `1`                 | How fast to play. Clamped to between a sixteenth and four times.                     |
| `controls`         | `boolean \| VideoControlsOptions`          | off                 | Draw a transport over the bottom of the picture. `hideAfterMs` sets the idle delay.  |
| `volume`           | `number`                                   | `1`                 | The starting level, 0 to 1, for the control and for `onVolume`.                      |
| `muted`            | `boolean`                                  | `false`             | Whether it starts silenced.                                                          |
| `onVolume`         | `(volume, muted) => void`                  | none                | Told when the level changed. Supplying it is what makes a volume control honest.     |
| `poster`           | `string`                                   | none                | A still to show until there is a frame to show instead.                              |
| `pauseWhenHidden`  | `boolean`                                  | `true`              | Stop decoding while the clip is scrolled out of view.                                |
| `clock`            | `VideoClock`                               | none                | Where the position comes from, when this clip does not own time.                     |
| `onTransport`      | `(t: VideoTransport) => void`              | none                | Handed the handle on the clip once there is one.                                     |
| `onState`          | `(s, error?) => void`                      | none                | Told when the clip loads, gets a picture, or fails.                                  |
| `ref`              | `UiNodeRef`                                | none                | Receives the node the frames are drawn on.                                           |

A `Video` is a declaration that this rectangle shows this clip. Given
`controls` it also draws the transport people expect over the bottom
of it; given nothing it stays a bare rectangle, which is the right
answer for the background loops and moving textures a `Video` is as
often used for.

The bar is not a privilege. It is `Button`, `Slider` and `Icon` driven
through the public `VideoTransport`, in a component
(`VideoControls`) that is exported like any other, so an application
that wants a different bar builds one the same way and loses nothing.
What the prop buys is the default rather than the capability.
`onTransport` is still there for a clip driven entirely from outside.

Like `Image`, it reads `src` once, because a body runs once and a clip
whose source changed is a different clip: give it a `key`. `rate`,
`poster` and `pauseWhenHidden` are read once for the same reason.

It attaches `rootModifiers` to the node it draws on, which is how a
clip can be carried through a route change by a `sharedElement`.

## The transport

`onTransport` is called once the clip has a playback behind it, which
is after a file has been fetched, demuxed and a decoder configured. It
carries:

| Member               | What it is                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| `duration`           | The clip's length in seconds. Zero until the container has been read.     |
| `position`           | Where the picture is now, in seconds.                                     |
| `paused`             | Whether time has stopped. A seek while paused still moves the picture.    |
| `rate`               | How fast time runs.                                                       |
| `seeking`            | Whether the decoder is still working towards the last position asked for. |
| `state`              | `loading`, `playing` or `failed`.                                         |
| `play()` / `pause()` | What they say.                                                            |
| `seek(seconds)`      | Moves to a position, clamped to the clip, playing or not.                 |
| `setRate(rate)`      | Clamped to something a decoder can keep up with.                          |
| `retry()`            | Fetches, demuxes and configures again, for a clip that failed.            |
| `onChange(listener)` | Told when the clip is acted on. Not on every frame; see below.            |

Nothing on it is reactive, and that is deliberate rather than an
omission. The transport comes from `gesso-core`, which has no cells at
all, so it reports through a plain listener and the tier above wraps
it in whatever its own state primitive is.

`onChange` fires for the things that happen **to** a clip: it started,
it stopped, it arrived somewhere, it changed rate, it went round a
loop, it broke. It deliberately does not fire as the position moves.
The position changes on every frame of every clip, and a listener woken
sixty times a second to move a scrubber by less than a pixel is how a
video costs an application its frame budget. Read `position` on the
frames you are already drawing, or extrapolate it on the animation
driver the way `VideoPlayer` does, at ten a second.

Seeking is a real seek. The playback finds the sync sample at or
before the position asked for, resets the decoder there, and decodes
forward through the gap without showing any of it. So the cost of a
seek is one group of pictures, which is why a clip encoded with
two-second keyframes scrubs well and one encoded with ten-second
keyframes does not.

## The controls

`controls={true}` takes the lot: play and pause, a scrubber, the
elapsed and total time, a mute and a level where sound is wired, and a
fullscreen button. An object turns parts off, or pins the bar up:

```tsx
const trimmed: VideoControlsOptions = { time: false, fullscreen: false };
const pinned: VideoControlsOptions = { alwaysVisible: true };

<Video src="clip.mp4" alt="A clip" controls={trimmed} />
<Video src="clip.mp4" alt="A clip" controls={pinned} />
```

The bar comes up when the pointer is over the picture and goes when it
leaves, which is what every player does. It is also up whenever the
clip is **paused**, because a paused clip with no visible way to
restart it is the one state the hover rule alone gets badly wrong.

**The scrubber runs along the top edge of the bar, the whole width of
it.** That is the boundary between the picture and the chrome under
it, so any inset would read as a mistake, and it is also the only
control whose length carries meaning: its length is the clip. Keeping
it out of the row is what stops a narrow clip squeezing it to nothing
between the buttons.

**A `Video` with controls is a `group`, not an `image`.** A rectangle
showing a picture is an image; one that also carries a toolbar is a
group of things, and announcing it as an image would hide the controls
behind a leaf. The bar itself is a `toolbar` named "Video controls",
and every control in it keeps the role it has anywhere else.

### Volume, and what it does

Nothing here plays a clip's sound. `AudioContext` does not exist on
the thread that decodes, so the level is state that is reported
through `onVolume` and means something only where an application has
wired that to whatever is making the noise.

So the volume control is drawn **only when `onVolume` is supplied**,
because a level slider over silence is a lie. Force it with
`volume: true` in the options if you want one anyway.

`muted` is kept apart from a volume of zero, as every player keeps it:
unmuting returns to the level it was at, which a mute that wrote zero
would have thrown away. Dragging the level up from zero unmutes,
because that is plainly what it means; dragging it to zero does not
mute, because that is what the button is for and conflating the two
loses the level.

### Fullscreen

Fullscreen is two things, and doing only the first is a bug worth
naming, because it is the obvious implementation.

The first is the shell's: it puts the **canvas** into fullscreen,
because the canvas is the only real element there is. A clip here is
pixels on a surface shared with the rest of the application, not an
element of its own, so there is nothing else to hand the browser. The
canvas rather than the page, because what the application draws on is
what should fill the screen and a host page with chrome of its own
does not want that blown up with it.

Stopping there fills the screen with the _application_, the clip still
its original size somewhere inside it. So the second half is that
while the shell reports fullscreen, the clip is also drawn into the
overlay layer with all four edges pinned, letterboxed on black and
fitted with `contain`. It is a second `Video` on the same source,
which costs nothing and needs no new machinery: playback is reference
counted by source, so the copy resolves the playback the inline one is
holding and picks it up exactly where it is. That is the same
mechanism that carries a clip through a route change.

**The surface has to be resized, and nothing else was going to do
it.** A `ResizeObserver` watches the host, and the host does not
change when the canvas is lifted out of it; it reflows _because_ the
canvas left, which is worse than useless. So the runtime keeps laying
out at the old size, the browser stretches the result to the screen,
and every coordinate is wrong by the ratio between the two: a press
near the bottom of a fullscreen clip lands somewhere near the middle
of the layout. The shells therefore take the size from the canvas
while it is fullscreen and from the host when it is not, ignore the
host's observer in between, and read it a frame late because
`fullscreenchange` fires before the new geometry is in the layout.

What the button shows comes from `ShellService.fullscreen` rather than
from its own last press. A browser only grants fullscreen during a
gesture and can refuse, and the person can leave with Escape, which no
request hears about; a control that tracked its own state would then
point the wrong way. That flag is the whole application's rather than
one clip's, so a `Video` also remembers whether _it_ was the one that
asked, and a clip that did not is left alone.

## Off screen

A clip scrolled out of the viewport stops decoding, and starts again
when it comes back. That is `pauseWhenHidden`, it defaults to on, and
there is very rarely a reason to turn it off: a clip nobody can see
that keeps fetching, decoding, converting and uploading a texture
costs a frame budget and a battery for nothing, and a page of clips
used to cost the sum of all of them however few were on screen.

It never seeks. The position is left exactly where it stopped, so
coming back into view resumes rather than reloads, and the decoder is
not reset. What counts as off screen is the clip's box against the
application's, with no margin. A clip laid out to nothing is treated
as **not measured yet** rather than as hidden, which is the difference
between a video whose height comes from its content starting and one
that never starts at all.

The other half of this was already handled elsewhere: a hidden tab
stops the animation driver, and a video driven by the driver stops
with it.

Pass `false` where the clip is being drawn somewhere the layout cannot
account for, such as into a shared element mid-flight, or off screen on
purpose so that it is warm when it arrives.

## Before the first frame

A clip arrives later than a picture does: there is a file to fetch, a
container to demux and a decoder to configure before there is anything
to draw. So the box is filled with `placeholderColor`, which is the
theme's `controlBackground` unless the call site named another, and the
fill is dropped once the playback is ready. It is the same prop
[Image](/components/image) takes, with the same default and the same
type, and it is read once for the same reason: a colour that arrived
after the picture would have nothing left to tint. Name one where the
video is going somewhere the theme cannot know about, over a photograph
or in a panel of its own colour, where `controlBackground` would be a
rectangle of the wrong shade until the clip starts.

Three things can leave a `Video` with no picture on it, and the tint is
what two of them look like:

- **Nothing has resolved yet.** The tinted box is the whole of what is
  drawn. It goes when the playback is ready, which is when the decoder
  is configured rather than when the first frame has been presented.
- **The source could not be read.** A fetch that failed, a thread with
  no `VideoDecoder`, a fragmented MP4 the demuxer refuses: resolving
  rejects, no surface ever reaches the node, and the tinted box is all
  there is, exactly as it is for a broken picture.
- **The decoder gave up part-way through.** Here the tint returns but
  is not what a reader sees: the surface stays on the node, the video
  is painted over the background, and the clip stops on the last frame
  it drew.

There is no error slot and no callback for any of the three. What to do
about a clip that will not play is draw your own message beside it, and
decide with the resolver whether to ask again.

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
that wants a still passes `autoplay={false}` and decides for itself,
which is what [VideoPlayer](/components/video-player) does: a clip the
reader can start is one where a still frame states the truth rather
than a falsehood.

## The resolver, and what only a browser can do

The default `VideoResolver` fetches the file, demuxes it and decodes it
with `VideoDecoder`. All three need a browser, and the parts of this
page that a spec cannot reach are worth naming rather than implying:

- **WebCodecs has to be there.** `canDecodeVideo()` answers whether the
  thread has `VideoDecoder` at all. Where it does not, a `Video` fails
  and keeps its placeholder tint, exactly as a broken image does.
- **MP4, progressive or fragmented.** The demuxer reads a
  non-fragmented `.mp4` out of its sample tables and a fragmented one
  out of its `moof` boxes, which is what a DASH or HLS segment is.
  What it does not do is _fetch_ those segments: it reads the
  fragments in the buffer it was given, so a manifest and a segment
  list are an application's to drive. There is no other container.
- **Audio is read but not played.** `demuxMp4Audio` reports a clip's
  audio track and what it would take to decode it, which is how a
  player knows whether to show a mute button. Playing it is the
  shell's, because `AudioContext` does not exist on a worker. See
  **Sound** below.
- **The whole file is read at once, unless you say otherwise.** Fine
  for a looping clip and the wrong shape for an hour of video, so
  `DefaultVideoResolver` also takes a `fetchRange`: given one, it
  finds the `moov` with a couple of small requests and then reads
  media as the decoder asks for it. Neither is a default the other
  should be silently upgraded to, so an application says which it
  wants.
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

## Sound

A `Video` plays no sound, and the reason is a platform one rather than
a decision: `AudioContext` does not exist on a worker, which is where
this framework decodes and draws. So sound is the shell's to play, and
`AudioService` already does exactly that.

What that leaves is keeping the two in step, and it inverts which of
them owns time. Everywhere else here the animation driver owns it: a
video is a pure function of a position and the position comes from a
tween. That is right up until the clip has sound and then it is exactly
backwards, because of what the two media can survive. Video drops
frames, and nobody can tell. Audio can do neither: a gap is audible and
resampling to catch up changes the pitch. So the sound plays at its own
rate whatever else is happening, and the picture follows it.

`clock` is that seam, and `audioClock` is the adapter:

```ts
// The same file, played twice: the shell for its sound, the worker
// for its pictures. A `<video>` element does this internally and
// calls it one thing.
audio.load('clip.mp4', { autoplay: false });
Video({ src: 'clip.mp4', clock: audioClock(audio, 'clip.mp4') });
```

A clock reports where the clip should be and whether it is running, and
the modifier presents against it instead of against a tween. Everything
else in this page is unchanged by it.

## Captions

Not here, and deliberately: captions are not a property of a rectangle
with a picture in it. They are a second piece of content that happens
to be synchronised with the first, and a transcript beside the video
wants the same lookup with none of the chrome. So `parseWebVtt` reads a
`.vtt` file into cues, `cueAt` finds the one due at a position, and
`Captions` draws it. [VideoPlayer](/components/video-player) puts the
three together.

## Keyboard

None. A video is not a tab stop, binds no keys and answers no pointer
gesture. Anything a reader can press belongs to the interface around
it, which is what [VideoPlayer](/components/video-player) is.

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

[VideoPlayer](/components/video-player) is this rectangle with
something to press beside it. [Video on a canvas](/media/video) is the
decoder, the surface and the demuxer in full, and
[Image](/components/image) is the still version of the same
rectangle.
