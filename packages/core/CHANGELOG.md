# gesso-core

## 0.3.0

### Minor Changes

- 025321a: **`fanOut`, for when every node wants its own slice.** One source, N things on
  screen, each reading one part of it: a grid, a timeline, a log viewer all arrive
  at this shape, and the natural spelling does not scale. A pipe per slice runs N
  pipelines on every emission whatever changed, and RxJS removes an observer from a
  Subject by scanning its list, so tearing down a window of N is quadratic.

  `fanOut(source, read, { initial })` holds one subscription for the whole registry
  and hands out a stable cell per key. Its `changed` hint is where a frame is won: a
  source that knows which keys a patch touched reads only those. Ten thousand live
  keys, measured against a pipe per key: mount 29.8 ms to 10.7 ms, teardown 9.7 ms
  to 3.7 ms, and one key changing 2.2 ms to 0.1 ms.

  Reach for it when N is large _and each emission touches few of them_. A source
  that republishes its whole window on every scroll gets the cheaper mount and
  teardown and nothing from `changed`, because every key really did change.

  It compares by reference where `select` and `derive` compare by content, which is
  the opposite default for the opposite reason: those run once per emission and this
  runs once per live key per emission. And a registry that has grown past a couple
  of thousand keys having released none of them says so once, because `release` is
  the caller's and forgetting it is the one thing here that goes wrong silently.

  **`tabStop`, which is `tabindex="-1"`.** Focusable, reachable by a press and by
  `focus()`, skipped by the Tab cycle. `focusable` only ever answered "may this node
  hold focus", which is the wrong question for a container: `UiFocusManager.settleScope`
  blurred when a scope held nothing focusable, so a `Dialog` whose content is a
  sentence handed the keyboard to nothing and could not be dismissed with Escape.
  `settleScope` now falls back to the scope root before blurring, and `Dialog` sets
  `focusable: true, tabStop: false` on its body. Both halves are needed and neither
  is enough alone.

  **`borders()`, a border per edge, as paint.** `borderWidth` is one number and
  `borderColor` one colour, so a node could not have a heavy bottom edge and a
  hairline top. A border here is paint-only and a decoration is already a coloured
  rectangle in the node's own paint pass, so four edges are four draw instances and
  no extra nodes. `DecorationBox` gains `right` and `bottom` to put them: any two of
  near edge, size and far edge fix an axis, which is CSS's rule for an absolutely
  positioned box, and the only one that can express a side edge spanning between two
  horizontal ones.

  **`menuBarStep`, a menu bar's keyboard, as a peer of `Menu`.** `Menu` traps focus,
  which is right for a popup opened by a button and wrong for a bar: with focus in
  the panel, ArrowLeft cannot reach the bar to move to the menu next door, and that
  is most of what makes a bar a bar. A pure function, generic in the command type,
  that returns null for a key it does not claim, so a bar can still be tabbed out of.

### Patch Changes

- 025321a: **A finger can scroll a surface on both of its axes.** `UiTouchScroller` picked one
  axis per container from its flex direction, exactly as `UiWheelController` did
  before it was fixed, and dropped the other. So a viewport whose content overflows
  in both directions — a spreadsheet's, which is one `ScrollView` over content wider
  and taller than itself — could not be dragged sideways at all.

  Each axis is now asked separately whether the container has room, through a
  `hasScrollRoom` the wheel and the touch paths share rather than write twice, so
  the two cannot drift on which container takes a gesture. A fling coasts per axis
  and each axis passes the threshold on its own, so a diagonal throw coasts on both
  and a vertical one does not drift sideways by whatever the thumb happened to do.

## 0.2.1

## 0.2.0

### Minor Changes

- be07839: **A clip can be driven now.** `videoSource` sealed its playback inside a
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

### Patch Changes

- be07839: **A 24fps clip played at 20 on a 60Hz display**, dropping one frame in
  six, for ever, on the commonest clip rate there is.

  An animation that declares `stepMs` is declaring a rate, and the driver
  was treating it as a gap between samples. Frames arrive on the
  display's refreshes, so a sample is nearly always served a little after
  it was due; measuring the next step from when it was _served_ rounds
  the period up to a whole refresh and then keeps the rounding. 41.67ms
  wanted, the refresh at 33.3ms too early, the one at 50ms serves it, and
  the next step measured from 50. The period is not 41.67ms but 50ms.

  The ideal time now advances by exactly `stepMs`, so the served times
  alternate between 33.3 and 50 and average out to the rate that was
  asked for. A rate that divides the refresh exactly was never in
  trouble, which is part of why this went unnoticed: 30fps on 60Hz was
  always right.

  Falling a whole step behind resynchronises rather than catching up. A
  stall or a hidden tab leaves a backlog whose samples are, for a video,
  pictures already past.

  None of this touches a value. A tween's output has always been a pure
  function of elapsed time, so nothing was shown at the wrong moment;
  what was wrong is how often anything was shown at all, which no
  assertion about values could have caught.

- be07839: **A clip you can seek, and a file you need not hold all of.** The media
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

- be07839: **The render worker asks the compositor itself.** `UiHostFrameClock`
  was built on a premise that expired: that `requestAnimationFrame` is
  tied to the compositor and exists only on the main thread, which is why
  the shell ran a loop and forwarded a tick per refresh.

  `DedicatedWorkerGlobalScope.requestAnimationFrame` has been in Chrome
  since 69, Firefox since 99 and Safari since 16.4, which made it
  baseline in March 2023. Measured in a render worker: a median interval
  of 16.70ms with a range of 16.6 to 16.8, which is vsync and not a
  timer. Its timestamps are on the worker's own `performance.now()`
  timeline, so nothing needs translating.

  Counting `requestAnimationFrame` calls on the main thread over three
  seconds: **180 before, 0 after.** The shell is out of the frame path
  entirely, and with it goes the part of the design that was least
  defensible, that a worker's heartbeat depended on the thread the worker
  exists to be independent of. A blocked page used to stop the render
  worker's frames until a stall watch noticed.

  The forwarded path stays, feature-detected, for an older browser and
  for a nested worker on Chromium, which has no frame callback of its
  own. The contract is the same either way. Both stop for a hidden tab,
  which is not luck: a worker's animation frames are serviced by its
  owner window's rendering, and a window that is not rendering services
  none.

## 0.1.0

First public release.

The engine: the retained UI graph, typed properties and dirty flags; a layout
engine covering flexbox in full, CSS Grid with typed tracks, absolute, relative
and sticky positioning and overflow; one paragraph algorithm shared by the
engine and both renderers; `Canvas2DRenderer` and `WebGPURenderer` behind one
`UiRenderer` interface; pointer, wheel, keyboard, focus, gesture and
hit-testing input; and `UiEnvironment` for typed, scoped, reactive theming.

Layout is checked against headless Chrome: 239 generated cases agree within
0.1 px, with the divergences that remain pinned by name. Text breaking is
checked the same way across 124 paragraphs in seven faces, including CJK,
Arabic, Hebrew, Devanagari, Thai and emoji.

`engine.explain(node)` answers why a box is the size it is, in sentences, in
the order the rules applied.

Also in this release: the half of the accessibility mirror that lives below a
component. `UiEditingController.replaceText` is new, so a value set by an
assistive technology arrives as ordinary editing.
