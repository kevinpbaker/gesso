---
'gesso-framework': patch
---

**Sound a picture can follow, and a screen it can fill.** Two things
the render thread cannot do for itself.

`audioClock` reads where `AudioService` has got to and hands it to
`videoSource` as a `VideoClock`, so a clip's picture follows the sound
rather than a tween of its own. `AudioContext` does not exist on a
worker, so the sound is the shell's to play and this is the adapter
between them. The source is checked on every read, because one
`AudioService` serves the whole application and a screen that starts a
podcast while a clip is mounted would otherwise drive the picture from
the podcast's position.

`ShellService.requestFullscreen` asks whichever shell is in front to
fill the screen with the canvas, and `ShellService.fullscreen` reports
what actually happened, because a browser only grants fullscreen during
a gesture and can refuse, and the person can leave with Escape, which
no request hears about.

The part that took measuring is the size. A `ResizeObserver` watches
the host, and the host does not change when the canvas is lifted out of
it; it reflows _because_ the canvas left. The runtime kept laying out
at the old size and the browser stretched the result: a canvas whose
CSS box was 800x600 still had a 768x448 backing store, and every
coordinate was wrong by the ratio between the two, so a press near the
bottom of a fullscreen clip landed near the middle of the layout. The
size now comes from the canvas while it is fullscreen and from the host
when it is not, read a frame late, because `fullscreenchange` fires
before the new geometry is in the layout.
