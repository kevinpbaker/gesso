---
description: What Gesso is, the three things that follow from drawing to a canvas in a worker, and when to use something else.
---

# What Gesso is

Gesso draws application interfaces into a canvas, with everything above
that canvas — components, layout, paint, input, text, accessibility —
running in a worker. The page keeps one `<canvas>` element and forwards
events to it. There is no DOM below that element, no stylesheet, and no
virtual DOM.

An application is a tree of components. Each component function runs
once and returns nodes that stay; values that change are Observables
bound into those nodes. The engine lays the nodes out with a CSS-shaped
model — flex, grid, typed lengths, real text wrapping — and paints them
through Canvas2D or WebGPU.

## What it is for

**Applications that compute as hard as they draw.** A web page runs
everything on one thread of execution: your parsing, your diffing, your
simulation, your layout and your paint all take turns on the same one.
Nothing there is slow by itself. They simply cannot happen at once, so
whichever one is running is the reason the other is late — and what a
person sees is lag. The pointer sticks, a list stutters mid-scroll, a
keystroke lands a beat after it was typed.

The usual answers are to make the heavy work smaller, or to slice it
into pieces short enough to fit between frames. Both work, both cost
you the shape of your code, and neither survives the work getting
genuinely large.

Gesso moves the interface instead. Layout, paint, input and text run in
a render worker; your application logic runs in another worker of its
own; the main thread is left holding a canvas and an event listener.
Heavy work and drawing are then on different threads and stop taking
turns.

That is the trade to weigh. If a screen is mostly static content with
occasional interaction, the single-threaded page was never the problem
and the DOM is a better tool. If it is an editor, a simulation, a
console over a live feed, a canvas of its own, or anything where work
and frames compete, the thread boundary is the entire point.

## Three things follow

**The main thread is free.** Not "mostly free": the shell creates the
canvas, forwards pointer and key events, and runs the display's refresh
loop. Everything else is somewhere else. Whatever your application is
busy with — a long parse, a big sort, a step of a simulation — it is
busy on a thread the interface is not on, so the interface carries on
drawing.

Which means an interface that locks up because the program is working
stops being a thing that can happen to you. There is no long task to
break into slices, no yielding to the event loop between chunks, no
choosing between doing the work and staying responsive. The work runs
where it runs, and the screen keeps its own time.

**There is one identity system.** A component instance owns its nodes,
so component identity is node identity. There is no second reconciler
deciding which output belongs to which component, and therefore no
diff, no key heuristics, and no reason for a peer to re-render because
its sibling changed.

**A change costs what it changes.** A value written into a bound
property marks that property on that node. What follows is proportional
to the change rather than to the tree: a text change deep in a
10,000-node tree re-measures three nodes, and CI asserts it stays that
way.

## What you give up

Everything the DOM gives for free, a canvas has to earn. Gesso has
earned most of it, and you should know which:

| The browser gives HTML                          | On a canvas                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Text selection                                  | Built in: a selection spans text nodes and reaches the clipboard                  |
| Ctrl/Cmd+F                                      | The application's own find, over the node tree                                    |
| IME, composition, clipboard                     | A hidden textarea on the main thread, with the buffer in the worker               |
| Screen readers and OS accessibility             | An off-screen DOM mirrored from a semantics tree, which the platform reads        |
| Search-engine indexing, "view source", `Ctrl+P` | **Not solved, and not the goal.** A canvas has no document for a crawler to read. |

That last row is the honest boundary, and it is why this documentation
site is HTML with Gesso embedded in it rather than a Gesso application.

## When to use something else

- **A document.** Articles, marketing pages, anything whose value is
  being indexed and linked. The DOM is the right tool and it is not
  close.
- **A form that should feel like the platform's.** Native inputs bring
  autofill, password managers, mobile keyboards and years of
  accessibility work. Gesso's inputs are good; they are not those.
- **A page that must work without JavaScript**, or that has a hard
  requirement on a browser extension reading its contents.

Gesso is for the other kind of screen: an application whose interface is
its own — an editor, a console, a dashboard, a tool with a lot of state
and a lot of frames.

## Before you build on it

Gesso is young, and this is what that means where it would touch you.

- **It has run in Chrome.** Chrome and other Chromium browsers are the
  honest extent of the evidence. Anywhere else is untested rather than
  unsupported, which is a different thing but not a comfortable one.
- **Canvas2D is the default**, and it works wherever a canvas does.
  WebGPU is an enhancement taken where the engine offers it and skipped
  where it does not, so nothing depends on having it.
- **No screen reader has been sat in front of it.** What your components
  emit does reach the platform's accessibility layer as real elements
  with roles, states and actions — but whether VoiceOver and NVDA
  announce a screen _well_ is a question only a person with one can
  answer, and nobody has.
- **The desktop webviews are the destination, not the history.** Running
  this on macOS, Windows and Linux means WKWebView, WebView2 and
  WebKitGTK: three IME implementations, three font stacks, three ideas
  about device pixel ratio. None of them has run this code.

## Next

[Installation](/guide/installation) is a project in about five minutes,
and [your first component](/guide/counter) is the ten after that.
