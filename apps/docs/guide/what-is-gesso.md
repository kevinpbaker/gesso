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

## Three things follow

**The main thread is free.** Not "mostly free": the shell creates the
canvas, forwards pointer and key events, and runs the display's refresh
loop. Everything else is in a worker. Blocking the shell for five
seconds costs input latency and nothing else — the worst frame gap in
that measurement was 105 ms against a 106 ms idle baseline, because the
frames were never on that thread to be blocked. In the single-thread
configuration the same two-second stall takes the worst frame gap to
2098 ms.

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

## What is proven, and where

Everything in these pages was built and checked in Chrome. That is a
real limit rather than a formality: the three webviews a desktop build
would ship on (WKWebView, WebView2, WebKitGTK) have three IME
implementations, three font stacks and three ideas about device pixel
ratio, and none of them has run this code.

Two more, stated where you would otherwise find them the hard way:

- **WebGPU is progressive.** Canvas2D is the default and is the portable
  path; WebGPU is dependable only where the engine ships it.
- **No screen reader has been run against the accessibility mirror.**
  Chrome's computed accessibility tree is checked in CI, which proves
  the platform sees the right elements, states and actions — not that
  VoiceOver announces them well.

## Next

[Installation](/guide/installation) is a project in about five minutes,
and [your first component](/guide/counter) is the ten after that.
