# gesso-components

## 0.2.1

### Patch Changes

- ebe7da3: **The video controls take themselves away again.** They appeared on
  hover and vanished the moment the pointer crossed the edge, which is
  not what a player does and is wrong in both directions.

  A pointer that entered and then stopped is not using the controls, so
  the bar now goes after a second of stillness whether the pointer is
  still inside the clip or long gone. A pointer that has just left is
  very often coming straight back, and hiding the instant it crosses the
  edge made the bar flicker under a hand reaching for it, so leaving
  starts the same countdown rather than hiding at once.

  Resting on the bar suspends the countdown entirely, and has to: a hand
  held steady over a scrubber it is about to press is the stillest the
  pointer ever is, and exactly when an idle timer would otherwise fire.

  `hideAfterMs` sets the delay and defaults to a second. Zero keeps the
  bar up until the pointer leaves, and `alwaysVisible` still pins it.

- gesso-core@0.2.1
  - gesso-framework@0.2.1

## 0.2.0

### Patch Changes

- fbedd4e: `Alert` is a new component: a persistent inline banner for a message
  that belongs to a region rather than to the screen. The trial notice
  above a settings page, the declined-card line above a payment form, the
  note over a list saying these numbers are an hour old. A `Toast`
  appears, says its piece and leaves on a timer; an alert is still there
  when you come back to it.

  It takes a `title`, a `message`, one of three tones, and an optional
  `onDismiss`. The tones are `neutral`, `accent` and `danger`, the same
  three `Badge` and `Chip` carry, and there are three because the palette
  has three: there is no `success` token and no `warning` token, and a
  banner is not allowed to name a colour your theme has not given it. If
  you want a green banner, theme `controlAccent` or wrap the banner in a
  theme provider of its own.

  The tone is carried by the banner's edge and the ink of its title, on
  the same `controlBackground` sheet under all three, rather than by a
  filled ground. A full `danger` wall across the width of a region is
  louder than nearly any message that goes in one, and it puts the body
  text on a ground your theme only had to make legible for short labels.

  What it declares is the part worth reading before you use it. `live`
  defaults to true, because a banner that appears is news. A live
  `danger` banner is `role="alert"` with an assertive live region, so it
  interrupts; that is right for a declined card and wrong for everything
  else, so every other live tone is a polite `status`. `live={false}` is
  the standing banner that was on the page at load: a `region` named by
  its title, with no live region at all, so it can be found and skipped
  rather than announced again every time focus goes past. Those three
  props are read once, when the banner is built, because a live region
  has to exist before the text inside it changes; a banner that has to
  change tone or stop being live changes its `key`.

  `onDismiss` draws a real button named "Dismiss", and pressing it calls
  your handler and nothing else. The banner does not remove itself:
  whether it is still in the tree is your conditional, because only you
  know whether dismissing means for this render, this session or for
  good.

- 10fe32d: `Breadcrumb`: the trail of where you are, with the one crumb that is not
  a link.

  `<Breadcrumb items={trail} onSelect={follow} />` draws a `navigation`
  landmark holding a `list` of crumbs, root first and this page last.
  Every crumb but the last is a `link` that reports itself through
  `onSelect` by value. The last one is where you already are, so it is not
  a link, not a tab stop and never reports: a control that navigates to
  the page you are on does nothing when it is pressed, and someone tabbing
  a page cannot tell that until they have spent the press finding out. It
  is distinct to the eye by weight rather than by colour alone.

  `maxItems` folds a trail that is too long. Above 0, a trail longer than
  it keeps its first crumb and its last and folds the middle into one
  crumb, which is a `button` named for the count it hides ("Show 3 hidden
  steps") rather than an ellipsis a screen reader reads as three full
  stops. Pressing it unfolds the trail in place and moves focus to the
  first crumb it revealed, so the keyboard does not fall back to the top
  of the page; a new trail folds again rather than arriving unfolded. A
  menu of the folded crumbs is the obvious next step and is not in this
  change.

  `separator` is what is drawn between crumbs, a solidus by default, in
  `textMuted` and never after the last. It declares a `separator` with an
  empty name, so "Home slash Projects slash Build" is never what a reader
  hears. `label` names the landmark, `Breadcrumb` by default, because an
  unnamed landmark in a list of landmarks leads nowhere. `items` is bound
  rather than read once, since a breadcrumb is the one component whose
  input changes on every navigation.

  Enter and Space both follow the focused crumb, which is what the runtime
  already does for anything whose role is `link` or `button`. An empty
  trail draws nothing and is not in the semantics tree; a trail of one is
  the page you are on and has no links at all.

- 1a1b222: **`Link`, because a link is not a button with different paint.** The
  role is the whole point of the component. `role: 'link'` tells an
  assistive technology that activating this goes somewhere; `button` says
  that something happens here, and a reader who cannot see the coloured
  words navigates by that difference. A link navigates, a button acts, so
  "Read the docs" and "Release notes" are links, and "Save", "Delete" and
  "Sign in" are still `Button`, which has a `plain` variant for the
  design that paints them as words in the accent colour.

  There is no anchor on a canvas, so following a link is a request to the
  shell. Give it an `href` and activating it injects `ShellService` and
  calls `openUrl`, which the runtime forwards to whichever host it has:
  `GessoApp` opens the tab itself, `WorkerApp` posts it to the main
  thread. The component never touches `window`, which is what lets the
  same link run in a worker, in an Electrobun shell and in a test. Give
  it `onPress` and no `href` and it is the in-app case: route inside the
  handler, nothing leaves, and it is still announced as a link. Give it
  both and the handler runs first, which is the shape for recording a
  click before the tab appears.

  `underline` is `always`, `hover` or `none`, drawn with the real
  `textDecoration` property rather than a hairline box, and defaulting to
  `hover`: prose full of permanently underlined links is hard to read and
  a link with no rule at all is hard to find. Reach for `always` inside
  running text, where colour alone will not separate a word from the
  sentence around it, and `none` for a navigation row that is already
  obviously navigation. The resting ink is `controlAccent` and a disabled
  link is `controlForegroundDisabled`, both palette names resolved
  against your theme. There is no colour prop, here or anywhere else in
  the library.

  Enter follows the link, and the component binds nothing else, because
  Enter is the key that activates an anchor. Space follows it too,
  through the runtime's own default for a focused node whose role is
  `button` or `link`, and the component leaves that default alone rather
  than swallowing a key an assistive technology may be mapping its
  activation gesture onto. A disabled link refuses the pointer, refuses
  the key, draws no rule and stays focusable, so the keyboard can still
  reach it and be told that it is off.

  `children` replaces the words the component draws while `label` stays
  the accessible name, for the link whose face is a glyph or a row of its
  own. Nothing on a link is read once: `underline` included, every prop
  follows a cell as it changes, so you never need to change a link's
  `key` to change how it looks.

- 0f5aedb: **`Meter`, for a measurement rather than a task.** A progress bar is
  about time: it starts empty, it fills, it ends. A disk that is 82% full
  is not on its way anywhere, and drawing it with a progress bar tells
  the reader that something is happening. `Meter` is the read-out for a
  quantity that sits somewhere in a known range and is simply true right
  now: storage used, a password's strength, a budget spent, a battery.

  The feature is the bands. `low`, `high` and `optimum` decide the tone
  the bar is painted in, so the conditional "is this reading good?" is
  written once in the library rather than at every call site.
  `optimum: 'high'` is the ordinary direction, where a value at or above
  `high` is good; `optimum: 'low'` is the disk case, where 5% full is
  good and 95% full is not. Good is `controlAccent`, poor is `danger`,
  and the middle band is `textMuted`. As everywhere else in the library
  those are palette names, and there is no colour prop.

  `showValue` draws the reading beside the bar, and `format` decides how
  it is written, defaulting to a percentage of the range. The formatted
  string is also what an assistive technology hears, through
  `valueText`, so a reader is told "34 GB of 240 GB used" rather than
  "34". A value outside the range clamps the fill and not the reported
  number, and a range whose `max` is not above its `min` draws an empty
  bar rather than throwing, because that range usually arrives from data
  rather than from a typo.

  The role is `progressbar`, which is a narrowing: there is no `meter`
  role in `UiRole`, and it is the only numeric-range role that is not a
  control. The component's page says so, and says which of the two to
  reach for.

- 64f2332: `Pagination` draws the strip of page numbers that goes under a table of
  rows shown a page at a time. Give it `pageCount` and either `page` or
  `defaultPage`, and it reports every move through `onChange`; it holds
  no rows and does no slicing, so the page stays the one number your
  application owns.

  The arithmetic is the component, and two of its decisions are worth
  knowing before you reach for it. It never draws an ellipsis that stands
  for a single page, because a page is the same width as the "…" hiding
  it and can actually be pressed. And the strip does not change width as
  you page through it: at page 1 the run of numbers is as wide as it is
  in the middle, each slot has a floor under its width, and previous and
  next are disabled at the ends rather than removed, so nothing walks out
  from under the pointer that is clicking it. `siblings` sets how many
  numbers sit either side of the current page and `boundaries` decides
  whether the first and last are pinned.

  `paginationItems` is exported beside the component: the same pure
  function, for a strip you are drawing yourself or a test that wants to
  ask what would be drawn without mounting anything.

  What it says is not what it shows. Each numbered control is named "Page
  4" rather than "4", the page you are on carries the `selected` state as
  well as the accent, the ellipsis is decorative and cannot be focused,
  previous and next are named, and the strip itself is a `navigation`
  landmark whose name defaults to "Pagination" and is worth setting
  through `label` on any screen with two of them. There are no colour
  props: the current page is painted from the `filled` and `accent` row
  of the shared button tokens and the rest from `plain` and `neutral`, so
  a theme that restyles its buttons restyles this with them.

- 5aa069f: `SegmentedControl`: one choice from a few, drawn as one track cut into
  segments.

  The control at the top of a pane that says which of three views is
  below it, or which of two units a figure is in. Day / Week / Month,
  Grid / List, Celsius / Fahrenheit: two to five short choices, all worth
  seeing at once, costing one line of a toolbar.

  It declares a `radiogroup` of `radio`s and not a `tablist`, and that is
  the decision the component exists to make. A `tablist` is a promise
  that each control reveals a panel, and an assistive technology acts on
  it; a segmented control that picks Celsius has no panel to send a
  reader to. If the choice really does change which panel is shown,
  `Tabs` is still the component, and it draws the `tabpanel` to go with
  the strip.

  The keyboard is `RadioGroup`'s, deliberately. The track is a single tab
  stop and the segments are not, the arrows walk and walking selects,
  Home and End reach the ends, and every one of them steps over a segment
  marked `disabled` rather than landing on it. It is a separate component
  rather than a `variant` on `RadioGroup` because only the semantics and
  the keyboard are shared: the paint, the layout, the sizing and four of
  the props are not, and a variant prop that turned four other props off
  would be a second component hiding inside the first.

  `size` is a `ButtonSize` and resolves through `controlTokens.button`,
  so a segmented control and a `Button` of the same size are the same
  height, share a radius and set their words in the same type role. No
  colour is a prop: the trough is `controlBackground` inside a
  `controlBorder` ring, and the chosen segment is the selection pair with
  a ring of its own, so which segment is chosen survives greyscale rather
  than resting on colour alone.

  `options` is a cell and the segments follow it, so choices that arrive
  from a request appear when they arrive. An empty `options` draws an
  empty named track rather than nothing, because an empty array is
  usually "not loaded yet" and a control that vanished and came back
  would move everything beside it twice. A `value` that matches no
  option, which is what a stale saved preference looks like, leaves
  nothing chosen instead of being quietly corrected to the first segment;
  an arrow recovers from it.

- be07839: **`Video` gains `controls`**, and with it the transport people expect
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

- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
- Updated dependencies [be07839]
  - gesso-core@0.2.0
  - gesso-framework@0.2.0

## 0.1.0

First public release.

The component library: inputs, overlays, structure, data and media, against
one contract.

Every control is controlled by default with an optional `defaultX`, themed
through `UiTheme` tokens and taking no colour props, keyboard operable from a
keymap that is data, and emitting semantics from the day it was written.

`label` is one prop for the words and for the accessible name, because in a
button with words they are the same thing.
