---
description: Choosing between a prop, an internal state cell and a computed one, and what each one costs per frame.
---

# Cells and bindings

A cell is a value a component holds and a binding reads. There are three
kinds, and choosing between them is most of what writing a Gesso
component is.

| Where the value comes from | What to use                 | What it is                                      |
| -------------------------- | --------------------------- | ----------------------------------------------- |
| The parent                 | `input(inputs.x, fallback)` | An input cell the host keeps feeding            |
| This component             | `internalState(value)`      | A cell only this component writes               |
| Other cells                | `computed(() => ...)`       | A cell that is a function of the cells it reads |

The third row is the one people overlook. A value that is a function of
other values needs no store and no synchronisation: `computed` reads the
cells its function touches, follows them, and cannot be stale because
there is no copy of it anywhere that a change could miss.

<LiveExample id="cells" height="300" />

Each line keeps its own quantity. The currency comes from the parent and
changes both. The total is neither: it is one expression over the two.

<<< @/src/examples/CellsExample.tsx#line

## `input`, a prop that keeps arriving

Inputs arrive as cells, not as values, which is what lets the body run
once and still follow its parent. `inputs.currency` is an `InputCell`,
and `input(inputs.currency, 'USD')` reads it with a default:

```ts
function OrderLine(inputs: Inputs<{ currency?: Currency }>) {
  const currency = input(inputs.currency, 'USD');
}
```

A parent can pass a plain value or an Observable, since every input is
`Reactive<T> = T | Observable<T>`, and the child cannot tell the
difference. That is why the example passes `currency` (a cell) straight
down: to `OrderLine` it is simply an input that changes.

## `internalState`, what the component owns

For what originates here and dies with the component: a tooltip's open
flag, a caret, a scroll offset, the active tab, the quantity above.

```ts
const quantity = internalState(1);
quantity.value++; // marks exactly the bindings that read it
```

Reading `.value` is synchronous, writing it is a notification. Nothing
is scheduled twice: several writes in one handler mark their nodes and
the next frame draws the result once.

The name is on purpose. `internalState` says _where the value came from_
rather than what it is, so `internalState(products)` reads as the
mistake it usually is. Anything that survives a reload, or that another
screen cares about, is application state and belongs on a channel or in
a service, not in a component.

## `computed`, a function of other cells

```ts
const total = computed(() => format(quantity.value * PRICE * RATES[currency.value]));
```

Write the value as the expression it is, reading each cell with
`.value`. The function runs, `computed` notes which cells it read, and
from then on follows exactly those: when one changes the function runs
again, and if the result differs, everything bound to `total` is written.
A cell the function did not read this time is not followed; a branch
that reads a different cell next time is.

There is no effect that recomputes `total` into a second piece of state,
and no moment where it disagrees with `quantity`. Anything that would be
a `useMemo` or a `useEffect` writing into state is this instead. Read it
in a handler with `total.value`; bind it to a prop like any cell. Pass
`{ equal: 'structural' }` when the function builds an object and a
rebuilt equal one should not count as a change.

The rule of thumb: **if you can write the value as an expression over
other cells, it is a `computed`, not a state.** `internalState` is for a
value that nothing else determines.

## Observables underneath

Every cell is an RxJS `Observable`, and every prop accepts one, so a
value that arrives as a stream rather than a cell binds the same way:
`text={stream}`. To project such a stream, or several, use `derive`,
which is `combineLatest` and `map` with a change check:

```ts
const scheme = derive([settings.appearance, shell.colorScheme], (chosen, platform) =>
  chosen === 'auto' ? platform : chosen
);
```

`computed` and `derive` produce the same thing, an Observable a prop
takes, and a component written with one composes with a component
written with the other. Reach for `computed` when the sources are cells,
which inside a component they nearly always are; for `derive` or a
`pipe` when they are not.

## What a binding costs

A binding is attached to one property of one node. When it emits, that
property is written and the node is marked. What that costs depends on
which property, and [components run once](/guide/components-run-once)
lists the groups: content and paint properties repaint, layout
properties run layout again from the nearest ancestor that can absorb
the change, and `transform` does neither, moving the node without
touching layout or paint.

Fan-out is free. Ten nodes bound to the same Observable are ten writes
from one emission, with no list to re-render and no diff. That is why
the two order lines above can share a currency cell without the parent
knowing how many lines there are.

## Cells outside a component

`internalState` is not magic and is not tied to a component: it is a
`BehaviorSubject` with a `.value` setter. A service can hold one, and a
component can bind to it directly. That is how the runtime's own
services expose state, and how a small application shares a value
between two screens without a channel.

What a cell must not become is the application's data layer. When state
outlives a screen, is authoritative, or belongs on another thread, it
goes behind a channel. The framework has an opinion about the barrier
and none at all about what lives above it.
