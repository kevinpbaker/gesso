---
description: A UI framework that runs your whole interface off the main thread, so heavy work and smooth frames stop competing.
---

# Interfaces that don't stutter

Your application has real work to do: parsing a file, diffing a
document, simulating a system, sorting a hundred thousand rows. On the
web that work and your interface share one thread of execution, so they
take turns, and the person using it watches them take turns. The pointer
sticks. The list stutters mid-scroll. The keystroke lands a beat late.

Gesso moves the entire interface somewhere else. Components, layout,
paint, text and input run in a render worker. Your application logic runs
in another. The main thread is left holding a canvas and forwarding
events, so nothing you compute can drop a frame.

**Try it.** Two copies of the same component, one in a render worker and
one on the main thread. Block the main thread for three seconds and see
which one cares.

<ThreadDemo />

Each copy advances on its own 40 ms timer and shows the longest gap it
has ever seen between two ticks. Through the block, the copy in the
worker reports **41 ms**: it did not miss a tick. The copy on the main
thread reports **3,010 ms**, which is the block itself.

## Declarative, with nothing to re-run

If you have written SwiftUI or Jetpack Compose, the shape is familiar: a
function describes a screen, and the screen follows some state. What
differs is what happens when the state changes.

| Framework   | On a state change                                                                |
| ----------- | -------------------------------------------------------------------------------- |
| **SwiftUI** | `body` is recomputed and the result is diffed against the last one               |
| **Compose** | the composable is invoked again (recomposition), with unchanged subtrees skipped |
| **Gesso**   | nothing is invoked again; one property on one node is written                    |

That difference is the one you feel while writing. There is no re-run to
make cheap, so there is nothing to memoise, no dependency array to keep
honest, no stability annotations, no `remember`, and no view identity to
reason about. Your component function runs once, so every closure in it
is stable. And the cost of a change is visible in the source: the
binding _is_ the update.

A counter, as a function component in JSX:

<LiveExample id="counter" height="180" />

<<< @/src/examples/CounterExample.tsx

`input(props.label, 'Count')` is a prop with a default. `internalState(0)`
is the value this component owns, the equivalent of `@State` or
`mutableStateOf`. The caption is derived and stored nowhere: it is one
expression over the other two, subscribed to by the node that shows it,
so it cannot be stale and there is nothing to invalidate.

JSX is optional. It compiles onto the element factories, which are the
same tree in a different spelling:

```ts
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

Neither version names a colour. `primary` is a theme token resolved when
it is painted, which is why the counter above follows this page's light
and dark toggle without being told either exists.

## What you get

- **A real layout engine.** Flex and grid with CSS's own semantics,
  typed lengths, and text that wraps, clamps and sits on a baseline, all
  checked against Chrome, so a box is the size you expect.
- **Twenty-seven components.** Inputs, overlays, tables, trees and
  media, every one of them themed, keyboard operable, and announced to
  assistive technology without you doing anything.
- **Tests without a browser.** `renderTest` queries the same tree a
  screen reader reads, so a test finds a control by asking for a
  control.
- **A hundred thousand rows at sixty frames.** Virtualization, shared
  grid tracks, and a frame cost proportional to what changed rather than
  to what is on screen.

## Where it doesn't belong

Documents. Articles, marketing pages, anything whose value is being
indexed and linked: a canvas has nothing for a crawler to read. Native
form controls also bring autofill, password managers and mobile
keyboards that a canvas cannot match.

[What Gesso is](/guide/what-is-gesso) draws that line properly, and says
what has and has not been proven.

## Start

[Installation](/guide/installation) is a running project in about five
minutes. [Your first component](/guide/counter) is the ten after that.
