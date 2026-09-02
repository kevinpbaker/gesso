---
description: Mount a component with no browser, query it the way an assistive technology does, and read back why a box came out the size it did.
---

# Testing

A Gesso component is a function that returns a tree, and the tree is not
the DOM, so there is nothing here for jsdom to do. `@gesso/testing`
mounts the real runtime over a recording canvas and hands back queries,
events and layout answers. No browser, no canvas double to write, no
headless Chrome to start, and no setup file: vitest's default node
environment is the one these run in.

This page has no live canvas on it, because the thing it describes is a
file rather than a screen. Everything quoted below comes from
`TestingExample.spec.ts` in this site's own examples folder, which runs
in this repository's suite. The page's code is the spec.

## The component under test

A quantity row: two stepper buttons, a checkbox, and a line that says
what the order now is.

<<< @/src/examples/TestingExample.tsx#row

## Mounting

Four imports and one call.

<<< @/src/examples/TestingExample.spec.ts#imports

<<< @/src/examples/TestingExample.spec.ts#mount

`renderTest` takes the same options as the runtime, minus the three it
decides itself, plus `autoFrame` and an `onCreate` hook. Those three are
decided rather than left to the caller because getting any of them wrong
makes a test that passes for the wrong reason:

- **The clock is manual.** Frames happen when the spec says so, so an
  assertion never races a scheduler.
- **Text is measured by `CharacterCountTextMeasurer`,** not by the
  canvas double. Every glyph is 0.6 em wide, the font is 0.8 em above
  the baseline and 0.2 em below it, and a line is 1.2 em, so a 14 px
  label is 16.8 px tall on every machine. A canvas double's
  `measureText` answers the same width whatever the font size, which
  would make a heading and its caption the same size.
- **A first frame has already run** when the call returns, so the tree
  is built, laid out and described before the first query.

Pass `textMeasurer` if you want different metrics, and `autoFrame:
false` if the spec needs to be holding the result when the first frame
happens.

`@gesso/testing` imports no test runner, so `renderTest` works under
vitest, under `node:test`, or in a plain script. The matchers are the
exception: `expect.extend` is a side effect on a global, so they live
behind their own entry and importing them is a decision you make.
`vitest` is an optional peer dependency of the package for exactly that
reason.

## Frames are yours

Nothing repaints on its own. `ui.frame()` runs the pending frame and
advances the clock 16 ms; `ui.frame(200)` sets the time instead. The
pattern is always the same: send an event, run a frame, assert.

For anything that arrives later than the next frame, a channel patch, a
resolved image, a component that awaited something, use `await
ui.settle()`. It runs a macrotask and a frame in a loop until nothing is
pending, and throws rather than spinning forever if the tree keeps
asking for another frame. The `findBy…` queries are the same loop with a
query in it. Both count frames rather than milliseconds, because the
clock here is manual and there is no wall clock to time out against: "a
hundred frames and it is still not there" reproduces in a way that "two
seconds" does not.

## Queries are the semantics tree

`getByRole` and `getByLabel` read `runtime.semanticsTree()`, the same map
the accessibility mirror writes into the off-screen DOM for a screen
reader. There is no second definition of what a control is, which makes
the property run both ways: a component that is awkward to find in a
spec is exactly a component that is awkward to find with an assistive
technology, and an untestable component is an inaccessible one.

<<< @/src/examples/TestingExample.spec.ts#roles

`getByText` is deliberately separate and reads the text a node draws,
because the two differ. The `<text>` inside a `<button>` is claimed as
the button's accessible name and gets no record of its own, so
`getByLabel('Save')` finds the button and `getByText('Save')` finds the
node that draws.

| Query                    | Finds                                                      |
| ------------------------ | ---------------------------------------------------------- |
| `getByRole(role, opts)`  | By role, with `name`, `states` and `disabled` to narrow it |
| `getByLabel(name)`       | By accessible name, whatever the role                      |
| `getByText(text)`        | By the text a node actually draws                          |
| `allNodes()`, `textOf()` | The escape hatch: every node, or every string, in order    |

Each of the first three has four variants, and the difference between
them is what happens when the count is not one:

| Variant     | No match            | One match | Many matches |
| ----------- | ------------------- | --------- | ------------ |
| `getBy…`    | throws              | the node  | throws       |
| `queryBy…`  | `null`              | the node  | throws       |
| `getAllBy…` | throws              | `[node]`  | every match  |
| `findBy…`   | frames, then throws | the node  | throws       |

`getBy…` throwing on two matches is the point of it, not a rough edge. A
query that quietly returns the first of several is a test that will one
day assert about a different node than its author thinks. A name or a
`{ name: … }` option is what disambiguates.

A string argument matches exactly, after runs of whitespace are
collapsed. A regular expression is tested against the same collapsed
string, which is what to reach for when only part of the text is stable.

## Pointer and keyboard

`fireEvent` comes off the render rather than being a free function,
because a Gesso runtime is not a global: two can be mounted in one file
at once. Everything on it goes through the same controllers a real
pointer and a real keyboard go through, which is the whole point. A spec
that called a component's handler directly would pass while the
component was unreachable by mouse, by keyboard and by screen reader.

<<< @/src/examples/TestingExample.spec.ts#click

`click(node)` dispatches to a node without a hit test, because a node is
what a query returns and whether the pixel at (x, y) lands on it is the
hit tester's business. Use `pointerDown` / `pointerMove` / `pointerUp`
when the coordinate path is what you are testing.

Keys go to whatever has focus, so a keyboard test focuses first:

<<< @/src/examples/TestingExample.spec.ts#keyboard

| Call                                           | What it sends                                 |
| ---------------------------------------------- | --------------------------------------------- |
| `click(node)`, `pressDown`, `pressUp`          | A click, or a press without the release       |
| `pan(node, x, y)`                              | A press and move: grabbing a thumb or divider |
| `pointerDown/Move/Up(x, y)`, `wheel(…)`        | The coordinate path, through the hit tester   |
| `press(key)`, `keyDown`, `keyUp`               | A key at whatever has focus                   |
| `focus(node)`, `blur()`, `tab()`, `shiftTab()` | Focus, and the tab order                      |
| `type(text)`, `paste(text)`                    | An insertion into the focused editable        |

All of them take modifiers where a real event would carry them:
`ui.fireEvent.press('a', { meta: true })`.

### Disabled is inert, not grey

A disabled node and its subtree take no pointer event and no key, which
is worth asserting rather than assuming:

<<< @/src/examples/TestingExample.spec.ts#disabled

## Layout, and why the number is wrong

`ui.getLayout(node)` gives a node's border box in layout-root
coordinates, and `toHaveBox` asserts on the fields you name and says
nothing about the rest, so a test does not break because a sibling above
it grew by a pixel.

<<< @/src/examples/TestingExample.spec.ts#layout

The matchers exist for what they print, not for what they compare:
`expect(ui.getLayout(node)).toEqual({ … })` already compares numbers.
Change that `36` to `24` and the failure carries the layout engine's own
explanation of the box next to the number that surprised you:

```text
Expected 'root:0:0:0:2' to have width 24, but its box is
{"x":124.4,"y":22,"width":36,"height":16.8}.

Why:
text 'root:0:0:0:2' · 36 × 16.8 at (124.4, 22)
width  36      width: 36 (explicit) → 36; flex item of row 'root:0:0:0':
               kept its base 36 (flexGrow 0, so free space goes to others)
height 16.8    text needs 16.8 → 16.8
constraints from row 'root:0:0:0': width [0, ∞) · height [0, 28.8]
after own size props: width 36 (tight) · height [0, 28.8]
padding 0 · margin 0 · content box 36 × 16.8
relayout: not a boundary · content stays inside · a change here is laid
          out from column 'root:0:0' (2 levels up)
state: measured · placed · position static
```

(Long lines are wrapped for this page; the explanation itself prints
one line per fact.) That is the same
answer the [node inspector](/tooling/inspecting-a-node) gives on a
canvas, arriving in a terminal. `ui.explainText(node)` prints it on
demand without a failing assertion, and `ui.explain(node)` returns it
as data.

| Matcher                    | Asserts                                     |
| -------------------------- | ------------------------------------------- |
| `toHaveBox(partial)`       | The border box, on the fields given         |
| `toHaveText(string)`       | The text the node itself draws              |
| `toHaveSemantics(partial)` | Role, name, states, disabled, value         |
| `toHaveFocus()`            | The focus manager currently holds this node |

## When a query misses

A failed query prints two things before it throws: every record in the
semantics tree, as role and accessible name, and then the node tree.
`ui.debug()` prints the second of those on demand. Ask this row for a
`switch` and the whole of it comes back:

```text
Nothing matches role "switch".

The semantics tree has:
  (no role) · "Tickets"
  button · "One fewer ticket"
  (no role) · "1"
  button · "One more ticket"
  checkbox · "Gift wrap this order"
  (no role) · "1 ticket"

The node tree is:
box#root:0 [0,0 420×220]
  column#root:0:0 [0,0 420×220]
    row#root:0:0:0 [16,16 388×28.8]
      text#root:0:0:0:0 name="Tickets" [16,22 72×16.8]
      button#root:0:0:0:1 role=button name="One fewer ticket" [96,16 20.4×28.8]
        text#root:0:0:0:1:0 text="-" [102,22 8.4×16.8]
      text#root:0:0:0:2 name="1" [124.4,22 36×16.8]
      button#root:0:0:0:3 role=button name="One more ticket" [168.4,16 20.4×28.8]
        text#root:0:0:0:3:0 text="+" [174.4,22 8.4×16.8]
    fragment#root:0:0:component:1 [0,0 0×0]
      row#root:0:0:component:1:0 role=checkbox name="Gift wrap this order" [16,56.8 388×26]
        box#root:0:0:component:1:0:0 [20,60.8 18×18]
          text#root:0:0:component:1:0:0:0 [29,62 0×15.6]
        text#root:0:0:component:1:0:1 text="Gift wrap this order" [46,61.4 168×16.8]
    text#root:0:0:2 name="1 ticket" [16,94.8 388×14.4]
  fragment#root:0:component:1 [0,0 0×0]
    box#root:0:component:1:0 [0,0 420×220]
      fragment#root:0:component:1:0:fragment:0 [0,0 0×0]
```

Every node is printed, including the ones with no semantics record,
because a `row` that exists only for layout is exactly the thing you
need to see is not in the tree an assistive technology reads. The answer
to "why did `getByRole('switch')` find nothing" is usually on the line
showing the node came out a `checkbox`.

The last three lines are the overlay layer. Every runtime's
layout root is a stack holding the application root and a layer for
dialogs, menus and tooltips to portal into, so it is there whether or
not anything has opened.

`ui.getSemantics(node)` returns one record and throws, with the tree,
when the node has none. That throw is nearly always the finding rather
than an inconvenience: nothing gives the node a role or a label, so no
assistive technology can see it.

## What else is on a render

| Member                                | What it is                                        |
| ------------------------------------- | ------------------------------------------------- |
| `runtime`                             | The runtime itself, for anything not wrapped here |
| `frames`                              | The metrics for every frame that has run          |
| `draws`, `clearDraws()`               | The recorded canvas calls since the last clear    |
| `semanticsTree()`, `querySemantics()` | The whole mirror, and one record or `null`        |
| `unmount()`                           | Stops the runtime and releases what it holds      |

## The wiring behind a channel

A component reads a channel; an application worker serves one. The
classes behind the worker, a catalogue, a queue, are plain code with
their own specs, and `serveForTest` covers what those specs cannot: the
lines between the classes and the barrier. It takes the same data
`serveChannels` takes and serves it over a real patch stream with no
worker, handing back the replicas a screen would bind to.

```ts
import { serveForTest } from '@gesso/testing';

const catalogue = new Catalogue(offlineApi());
const queue = new Queue(catalogue);
const served = serveForTest(transitionsChannels(catalogue, queue));
const player = served.get(Queue);

player.send.play({ playlistId: '2' });
await served.settle(() => player.view.current.value !== null);

expect(player.view.playlistId.value).toBe('2');
expect(served.errors).toEqual([]);
served.dispose();
```

`settle` waits for a condition to hold, or for the ports to drain when
given none. `errors` collects what a served channel reported: a command
nobody declared, a view key that is not plain data. The arrangement it
suggests is the one worth adopting: the worker file itself is four lines
that call a function returning the served channels, and the function is
what the spec imports.

## Where this stops

`renderTest` gives you the runtime, and stops exactly at the browser.

- **Nothing is painted.** The canvas is a recording context: `ui.draws`
  is a list of the Canvas2D calls a frame made, so a spec can assert
  that something was drawn and with which fill, but no pixels exist and
  there is nothing to compare an image against. This repository checks
  that separately with `pnpm screenshots`, which opens every playground
  route in headless Chrome and diffs the canvas against a committed
  baseline.
- **The renderer is Canvas2D.** WebGPU is never exercised here. Parity
  between the two backends is its own gate, `pnpm parity:webgpu`, which
  needs a headless Chrome with a WebGPU adapter and fails rather than
  passes on a machine without one.
- **The metrics are not a font's.** A width from the deterministic
  measurer is what the layout engine computes from 0.6 em glyphs, not
  what Inter will produce in Chrome. Assert relationships (this got
  taller, these two are the same width, the row did not move) rather
  than pixel counts that only hold under this measurer.
- **No IME.** `type()` and `paste()` deliver an insertion the way the
  editing proxy's `beforeinput` would. A composition can be driven
  through `ui.runtime.input.editing`, which has `compositionStart`,
  `compositionUpdate` and `compositionEnd`, but a real input method and
  the browser's own composition events are not here. See
  [text editing and IME](/interaction/text-editing-and-ime).
- **Still no screen reader.** Querying the semantics tree is querying
  what the mirror writes, which is not the same thing as VoiceOver or
  NVDA. This repository's `pnpm check:a11y` goes one step further and
  reads Chrome's own computed accessibility tree, because an element
  with the right attributes can still be ignored by the platform, and
  that is still not a screen reader either.

The discipline that follows from all of that: a passing suite is
evidence that the tree, the events and the layout are right, and it is
not evidence that a screen renders. When you change something visual,
open it.

## Next

[Devtools](/tooling/devtools) is the other half of this. The node
inspector answers the same "why is this box wrong" question on a running
canvas that `toHaveBox` answers in a terminal.
