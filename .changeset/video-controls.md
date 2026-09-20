---
'gesso-components': patch
---

**`Video` gains `controls`**, and with it the transport people expect
over the bottom of a clip: play and pause, a scrubber, the elapsed and
total time, a mute and level where sound is wired, and fullscreen. An
object turns parts off or pins the bar up instead of revealing it on
hover.

The bar is not a privilege. `VideoControls` is exported like any other
component and is `Button`, `Slider` and `Icon` driven through the
public `VideoTransport`, with no access to the decoder an application
does not also have. What the prop buys is the default rather than the
capability, and `controls` is off unless asked for, because a `Video`
is as often a background or a moving texture as it is something to
watch.

The scrubber runs along the top edge of the bar, the whole width of it.
That is the boundary between the picture and the chrome under it, and
it is the one control whose length carries meaning, because its length
is the clip.

A `Video` with controls is a `group` rather than an `image`. A
rectangle showing a picture is an image; one that also carries a
toolbar is a group of things, and announcing it as an image would hide
the controls behind a leaf.

**Nothing here plays a clip's sound.** `AudioContext` does not exist on
the thread that decodes, so the level is state reported through
`onVolume`, and the volume control is drawn only where that is wired,
because a level slider over silence is a lie.

Fullscreen is two things. The shell fills the screen with the canvas,
because a clip here is pixels on a shared surface and there is nothing
else to hand the browser; doing only that fills the screen with the
_application_, the clip still its original size inside it. So the clip
is also drawn into the overlay layer with every edge pinned, sharing
one playback with the original because playback is reference counted by
source.

`VideoPlayer` is now that with the bar pinned and a caption track over
it. `Captions`, `parseWebVtt` and `cueAt` are separate because a
caption track is not a property of a rectangle: it is a second piece of
content that happens to be synchronised with the first, and a
transcript beside the video wants the same lookup with none of the
chrome.

`Slider` gains `thumb` and `trackAlign`, and `labelHidden` now collapses
the label's space rather than merely hiding it. The last is a fix:
`visible` affects paint and semantics and deliberately not layout, so a
`labelHidden` slider was a track with twenty empty pixels over it,
which is precisely wrong for the media bar the prop was added for. It
will tighten any layout already using it.
