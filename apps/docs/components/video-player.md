---
description: 'VideoPlayer: a clip with a play button, a scrubber and captions, built out of ordinary controls against the video transport.'
---

# VideoPlayer

A clip with something to press. [Video](/components/video) is a
rectangle with a picture in it and grows no chrome of its own; this is
what a reader drives, and it is an ordinary component with no
privileged access to anything.

Almost nothing of its own, since [Video](/components/video) grew a
`controls` prop: this is that, with the bar pinned up rather than
revealed on hover, plus a caption track. It stays a component because
those two choices are a _kind_ of player rather than a setting, and
because captions are content that a bare `Video` has no business
knowing about.

Everything it is built from is public: `Video`, `VideoControls`,
`Captions`, and the `VideoTransport` tying them together. An
application that wants a different player writes its own against the
same pieces and loses nothing.

<LiveExample id="videoplayer" height="320" />

<<< @/src/examples/VideoPlayerExample.tsx#player

## Props

| Prop           | Type                          | Default   | What it does                                      |
| -------------- | ----------------------------- | --------- | ------------------------------------------------- |
| `src`          | `string`                      | required  | What the video resolver is asked for.             |
| `alt`          | `string`                      | none      | What a screen reader reads for the picture.       |
| `captions`     | `readonly VttCue[]`           | none      | The caption track, as `parseWebVtt` returns it.   |
| `autoplay`     | `boolean`                     | `false`   | Start as soon as the clip is decoded.             |
| `loop`         | `boolean`                     | `false`   | Start again when it ends.                         |
| `objectFit`    | `ObjectFit`                   | `'cover'` | How each frame meets a box that is not its shape. |
| `borderRadius` | `number`                      | `0`       | Rounds the box, and clips the picture to it.      |
| `onTransport`  | `(t: VideoTransport) => void` | none      | Handed the same handle the player itself drives.  |

## It does not autoplay, and `Video` does

They are answering different questions. A `Video` is usually a
background, a texture, a thing that moves; a clip with a play button on
it is content someone chose to watch, and starting it before they asked
is the behaviour every platform has spent a decade adding a setting to
turn off.

It is also the honest reading of a reduced-motion preference. `Video`
keeps playing under one because a video frozen on its first frame is a
video that has failed to load, and standing still would state something
false. Here standing still states exactly the truth: the clip has not
been started yet.

## The readout is a tween, not a subscription

A clip's pictures arrive at whatever rate it was encoded at, which may
be sixty a second, and a scrubber wants to hear about none of them. So
the position is not read from the picture. It is extrapolated on the
animation driver at ten a second, and re-synchronised whenever the
transport reports that something happened to the clip: a play, a
pause, a seek, a rate change, a lap of a loop. That is `followTransport`,
which the bar and the caption track share rather than running two.

That is exactly what `AudioService` does for a seek bar over a track,
and for exactly the same reasons. Ten a second is smooth
under a thumb and costs nothing; sixty would dirty a node every frame
to move a thumb by less than a pixel.

The seek bar runs over the clip's own length in seconds rather than
over a percentage, so what an assistive technology reads is a time.

## Captions

`Captions` is a component of its own, and is exported separately,
because a caption track is not a property of a rectangle with a picture
in it. It is a second piece of content that happens to be synchronised
with the first, and a transcript printed beside the video wants the
same lookup with none of the chrome.

Three pieces, none of which knows anything about video:

- `parseWebVtt(text)` reads a `.vtt` file into cues. It never throws:
  a caption track is content, usually someone else's, and one
  malformed cue in a hundred is not a reason to show none of them.
  `VttTrack.skipped` counts what could not be read.
- `cueAt(cues, seconds, from)` finds the cue due at a position. `from`
  is the index it last answered, which makes the common case, one
  frame later, a step rather than a search.
- `Captions` draws it, and draws nothing at all between cues: an empty
  plate under a video is a caption track that looks broken.

<<< @/src/examples/VideoPlayerExample.tsx#captions

Fetching the file is the application's, which is the same rule
`Video` follows for the clip itself.

Inline markup is stripped to its text. `<i>`, `<b>` and `<v Speaker>`
become the words inside them, which is a decision rather than an
omission: a voice span would have to become a style run, and a caption
that showed its own angle brackets would be worse than one that lost
its italics. Cue settings are parsed and carried but nothing acts on
them, because `line`, `position` and `align` describe a placement
against a video box and the placement is the caller's.

## Semantics

| What   | Value                                                                |
| ------ | -------------------------------------------------------------------- |
| Role   | The controls' own: `button` and `slider`. The player is not a widget |
| Name   | The button is `Play` or `Pause`; the slider is `Seek`                |
| States | The button's label is the state, which is what is announced          |
| Value  | The slider's value is the position in seconds                        |

There is no `application` or `group` wrapper and no keyboard trap. The
controls are reached in the order they are laid out, and each behaves
exactly as it does anywhere else, which is the benefit of them being
the same controls.

Nothing announces that the clip is playing beyond the button's label
changing. A caption track is content and is read as text.

## Next

[Video](/components/video) is the rectangle underneath this, and
[Video on a canvas](/media/video) is the decoder, the demuxer and the
surface in full.
