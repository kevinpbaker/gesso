---
'gesso-core': minor
---

**A clip can be driven now.** `videoSource` sealed its playback inside a
closure, so a video was two booleans: `loop` and `autoplay`, and no
pause, no seek, no rate, and no way to read where it was. Anything that
wanted a transport had to supply a `VideoResolver` of its own and drive
the position itself.

`VideoTransport` arrives through `onReady`, because a playback does not
exist until a file has been fetched and a decoder configured, and a
modifier attaches long before either. It carries `play`, `pause`,
`seek`, `setRate`, `setVolume`, `setMuted` and `retry`, and the
position, duration and state to read back.

Nothing on it is reactive, deliberately. `gesso-core` has no cells, so
it reports through `onChange` and the tier above wraps it in whatever
its own state primitive is. `onChange` does not fire as the position
moves: that happens on every frame of every clip, and a listener woken
sixty times a second to move a scrubber by less than a pixel is how a
video costs an application its frame budget. Read the position on the
frames you are already drawing, or extrapolate it as `VideoControls`
does, at ten a second.

**A clip scrolled out of view stops decoding.** A hidden tab already
stopped one, at the animation driver, but within a visible page nothing
did, so a page of clips cost the sum of all of them however few were on
screen. It never seeks, so coming back into view resumes rather than
reloads, and a box laid out to nothing counts as not measured yet
rather than as hidden.

**This is the minor, and it is one line of it.** `UiModifierHost` gains
a required `viewportBox()`, which is what the visibility rule is built
on. A modifier receives a host rather than implementing one, so an
application is unaffected; anything that implemented the interface
itself has one method to add. The budget that interface documents is
deliberately narrow, and the case for widening it is that a decoder, a
poller, or anything else that costs whether or not it is looked at has
no business running for a node a thousand pixels off the bottom.

`VideoClock` is the seam for a clip whose time belongs to something
else. Video drops frames and nobody can tell; audio can neither drop
nor resample without being heard, so where the two must agree the sound
leads and the picture follows. It is a seam rather than an
implementation because `AudioContext` does not exist on a worker.
