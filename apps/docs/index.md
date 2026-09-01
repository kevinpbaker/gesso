---
description: A UI framework that runs your whole interface off the main thread, so heavy work and smooth frames stop competing.
---

# Your work and your interface, on different threads

A web page runs everything on one thread of execution. Your parsing,
your diffing, your simulation, your layout and your paint all take
turns on the same one — so whichever is running is the reason the other
is late, and what a person sees is lag.

Gesso puts the entire interface somewhere else. Components, layout,
paint, input and text run in a render worker; your application logic
runs in a worker of its own; the main thread is left holding a canvas
and an event listener.

**Below are two copies of the same component.** The left one is in a
render worker. The right one is the identical code mounted on the main
thread. Block the main thread for three seconds and watch which one
notices. Each canvas times itself, on its own thread, and paints what
it measured.

<ThreadDemo />

Each canvas draws its own reading: the label, the gap and the caption
underneath are all painted by the component itself. The timer that
advances the sweep belongs to the thread it is running on, and so does
the clock the gap is measured against — a number that had to cross to
the main thread could not be trusted while the main thread is the thing
being blocked.

On this machine the render worker comes through a three-second block
reporting a longest frame of **41 ms** against its own 40 ms step: it
does not skip a beat. The copy on the main thread reports **3,010 ms**,
which is the block itself. Both readings hold once they are set, so you
can press the button and then look.

## What writing it looks like

If you have written SwiftUI or Jetpack Compose, the shape is familiar: a
function describes a screen, and the screen follows some state. What
differs is what happens when that state changes.

| Framework   | On a state change                                                                |
| ----------- | -------------------------------------------------------------------------------- |
| **SwiftUI** | `body` is recomputed and the result is diffed against the last one               |
| **Compose** | the composable is invoked again — recomposition, with unchanged subtrees skipped |
| **Gesso**   | nothing is invoked again; one property on one node is written                    |

All three are declarative and all three do work proportional to the
change rather than to the screen. The difference is where the machinery
lives. SwiftUI and Compose earn that with a re-run and a comparison —
which is why both need rules about what may be read where, why Compose
has stability and `remember`, and why a SwiftUI view's identity is a
thing you have to think about. Gesso has no re-run to make cheap: the
component function runs once, and what it returns is a retained tree
whose changing values are Observables bound directly into it.

That is the whole trade. You give up "just read the value and I will
figure out when to re-run", and you get a component body that is
executed once, closures that are stable because nothing recreates them,
and a cost you can read off the source — the binding is the update.

A counter, as a function component in JSX:

<LiveExample id="counter" height="180" />

<<< @/src/examples/CounterExample.tsx

The pieces map onto what you already know. `input(props.label, 'Count')`
is a prop with a default, except it is a cell rather than a value, so
the child follows a parent that changes its mind without running again.
`internalState(0)` is `@State` or `mutableStateOf` — the value this
component owns. And `combineLatest([...]).pipe(map(...))` is the derived
value: no `@Observable` computed property, no `derivedStateOf`, no
`useMemo`, because there is nothing to recompute _from_. It is one
expression, subscribed to by the node that shows it.

JSX is optional and compiles onto the element factories, which are the
canonical surface. The same component without it:

```ts
import { Button, Row, Text, percent } from '@gesso/core';
import { combineLatest, map } from 'rxjs';

function Counter(props, _context) {
  const label = input(props.label, 'Count');
  const count = internalState(0);
  const caption = combineLatest([label, count]).pipe(map(([text, value]) => `${text}: ${value}`));

  return Row(
    { gap: 12, x: 'center', y: 'center', width: percent(100), height: percent(100) },
    Text({ text: caption, fontSize: 18 }),
    Button({ label: 'Add one', onClick: () => count.value++, backgroundColor: 'primary' }, Text({ text: '+1' }))
  );
}
```

Same tree, same cost, two spellings. Nothing in either names a colour:
`primary` is a theme token resolved at paint, which is why the counter
above follows this page's light and dark toggle without being told it
exists.

## What you get

- **A real layout engine.** Flex and grid with CSS's own semantics,
  typed lengths, and text that wraps, clamps and aligns on a baseline —
  checked against Chrome on a few hundred generated fixtures.
- **A component library.** Twenty-seven components that are themed,
  keyboard operable, and announce themselves to assistive technology.
- **Testing without a browser.** `renderTest` queries the same semantics
  tree a screen reader reads, so a test finds a control by asking for a
  control.
- **Two renderers.** Canvas2D by default, WebGPU where it is available,
  drawing from one contract.

## What it is not

It is not for documents. Articles, marketing pages and anything whose
value is being indexed belong in HTML — a canvas has nothing for a
crawler to read, and that is not a gap this project intends to close.
Native form controls bring autofill, password managers and mobile
keyboards that a canvas cannot match.

[What Gesso is](/guide/what-is-gesso) goes through that boundary
honestly, including what has and has not been proven, and where.

## Start

[Installation](/guide/installation) is a running project in about five
minutes — it also says how a project consumes the packages today, which
is not yet from a registry. [Your first component](/guide/counter) is
the ten minutes after that.
