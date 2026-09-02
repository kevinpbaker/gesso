---
description: Write a component, bind a value into a node, and handle a click, with the counter that runs on this page.
---

# Your first component

A Gesso component is a function. It is called once, and what it returns
is a tree of nodes that stays. Nothing here re-runs when the count
changes: the `text` prop is bound to an Observable, so one property on
one node is written and the next frame is drawn from it.

<LiveExample id="counter" height="200" />

The counter above is running in a render worker on this page. Its source
is the whole example, and the same file is what the test suite asserts
on:

<<< @/src/examples/CounterExample.tsx

Two things in it are worth naming. `input(props.label, 'Count')` gives an
optional prop a default while keeping it a cell, so a parent that later
changes the label still reaches this node. And `internalState(0)` is
state the component owns; writing `count.value++` marks exactly the
bindings that read it.

Notice what is _not_ in it: no colours. The text takes the theme's, and
`primary` is a theme token rather than a hex value, so the counter
follows this site's light and dark toggle without knowing that either
exists. [Light and dark](/guide/appearance) shows the root component
that arranges it.

## Next

[Components run once](/guide/components-run-once) is what "called once"
means for where state and derived values go.
