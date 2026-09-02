---
description: 'ShellService: the clipboard, URLs and the appearance signal a component in a render worker reaches through the thread that has a window.'
---

# Shell services

An application in a render worker has no `window`, no `document`, no
`navigator.clipboard` and no `matchMedia`. Everything that needs one of
those has to be asked of the shell, which is the small piece of code on
the main thread that owns the canvas and the worker behind it.

`ShellService` is that seam, as a service a component injects. Requests
go out through it, and the two facts only a thread with a window can
answer come back through it and through `AnimationService`.

<LiveExample id="shellservices" height="320" />

<<< @/src/examples/ShellServicesExample.tsx#shell

Press the button and the request crosses to the main thread, which is
the only thread with a clipboard to write to. The link it carries names
the appearance the shell last reported, which is the shape of this whole
page in one screen: a signal comes in, the application decides what it
means, and a request goes back out.

## Asking the shell for something

`ShellService` has two actions an application calls:

| Action           | What the shell does with it                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `copyText(text)` | Writes the text to the system clipboard through `navigator.clipboard`, or a hidden textarea and `execCommand` where that is refused |
| `openUrl(url)`   | `window.open(url, '_blank', 'noopener,noreferrer')`                                                                                 |

Both return `void`, and nothing comes back. There is no acknowledgement
on the protocol and no promise to await, so an application cannot find
out whether the clipboard write succeeded. That is deliberate rather
than missing: a request that crossed a thread boundary and back would be
a round trip an application had to sequence its UI around, for an answer
the browser gives no useful detail in anyway.

A request with no shell listening is dropped, silently and without
throwing. That is the state a runtime is in under `renderTest` unless
the test installs a listener, and it is what a headless host leaves
behind, so a component that calls `copyText` in a test does not need a
clipboard to exist.

There is a third request on the same channel, `history`, and no
component issues it: the router turns a navigation into one because the
address bar is on the other thread.

## What the shell reports

Two preferences travel the other way, and they land in different places
for a reason worth knowing.

| Signal          | Where an application reads it                     | Who consumes it                                       |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `colorScheme`   | `ShellService.colorScheme`, an `Observable`       | Nothing in the framework                              |
| `reducedMotion` | `AnimationService.reducedMotion`, a bindable cell | The animation driver, which snaps instead of tweening |

Reduced motion has a consumer inside the framework, so it is carried to
the thing that consumes it. Appearance has none: no built-in theme
switches on it, and nothing in layout, paint or input reads it. It
reaches `ShellService` and stops.

So the framework reports which appearance the platform is in and decides
nothing about what it looks like. A framework that shipped an answer
would be shipping a palette, and the palette is the application's.

Both signals are sent once at start-up as well as on change. Nobody
fires a change event at an application that started in the appearance it
is already in, so without the first report a person in dark mode watches
a light first frame.

`colorScheme` is read-only to the application: a private cell behind an
`Observable`, plus a `currentColorScheme` getter for code that wants the
answer without subscribing, which is what the click handler above uses.
The shell is the only writer, because a cell the application could also
write is a cell the next media-query change silently overwrites. An
application with its own light, dark and auto control keeps that choice
as application state and combines it with this one; the
[light and dark](/guide/appearance) page has that in three lines, along
with mapping the signal onto a theme.

`reducedMotion` is not read-only, and `AnimationService.applyReducedMotion`
is public for a reason: an application may legitimately offer a motion
setting of its own, and someone who wants less motion in one app should
not have to change an operating-system preference to get it. The last
caller wins, and there is no priority between the platform's answer and
the application's.

## Size, and the device pixel ratio

Neither is a signal an application subscribes to, and there is no
viewport size on `ShellService` or on the component context. A screen
answers a size change through layout instead.

What happens when the window changes:

1. The shell watches the element the application was mounted into with
   a `ResizeObserver` and reads `contentRect`, the logical CSS size.
2. It posts `{ type: 'resize', width, height, dpr }`, with `dpr` taken
   from `window.devicePixelRatio`.
3. The runtime re-lays out the tree against the new logical size, hands
   the ratio to the renderer, which owns the backing store, and repaints
   in the same task rather than on the next tick. Resizing a canvas
   clears it, so a deferred repaint would show one blank frame per
   resize notification, which reads as flicker while dragging.

Two consequences for the code you write. **An application is in logical
pixels throughout**: `padding={16}` is 16 CSS pixels on a laptop screen
and on a 3x phone, and the ratio never reaches a component. And **a
zero-sized report is ignored**, because a hidden or detached host
reports `0x0` and a zero logical size makes the renderer's cull
rectangle empty, which would discard every node in the tree.

The first size is measured from the canvas rather than from the host
element, which matters when the host has padding: `clientWidth` includes
it and the canvas is sized to its content box, so measuring the host
started the runtime with a viewport wider than the surface it draws on.

## The single-thread configuration

Nothing above changes. `GessoApp` registers the same `ShellService`,
performs the requests directly instead of posting them, runs the same
media queries, and observes the same element. A component cannot tell
which configuration it is in, which is the point of routing these
through a service rather than letting a component reach for `window`
when it happens to have one.

## Limits

- Every shell behaviour in this project has been verified in Chrome and
  nowhere else. Neither WKWebView nor WebView2 has seen any of it.
- `openUrl` is not demonstrated by the example above, because a
  documentation page that opened a new tab when you clicked it would
  take you off the page. What a browser shell does with it is the
  `window.open` call in the table.
- The clipboard's `execCommand` fallback is in the source and has no
  test and no browser behind it. It is what runs when
  `navigator.clipboard` is missing or its promise rejects, which is a
  path nothing here has driven.
- A request reaches the shell one message after the click that caused
  it, so it arrives outside the transient user activation the click
  created. Whether that matters to a clipboard write is the browser's
  decision, and it is not something this project has measured. Where a
  copy has to be certain, drive it from the shell.

## Next

[Errors and the overlay](/structure/errors-and-the-overlay): what
happens when the code on the other side of that boundary throws, and how
a failure in a worker reaches the page at all.
