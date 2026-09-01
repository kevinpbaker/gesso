---
description: Choosing between a prop, an internal state cell and a derived expression, and what each one costs per frame.
---

# Cells and bindings

A cell is a value a component holds and a binding reads. There are two
of them and one non-thing, and picking between them is most of what
authoring a Gesso component is.

| Where the value comes from | What to use                | What it is                                         |
| -------------------------- | -------------------------- | -------------------------------------------------- |
| The parent                 | `input(props.x, fallback)` | A prop cell the host keeps feeding                 |
| This component             | `internalState(value)`     | A cell only this component writes                  |
| Other values               | nothing                    | An expression: `combineLatest(...).pipe(map(...))` |

The third row is the one people reach past. A value computed from other
values needs no cell, no store and no synchronisation: it is an
Observable derived from the ones it depends on, and it cannot be stale
because there is no copy of it anywhere.

<LiveExample id="cells" height="300" />

Each line keeps its own quantity. The currency comes from the parent and
changes both. The total is neither: it is one expression over the two.

<<< @/src/examples/CellsExample.tsx#line

## `input`, a prop that keeps arriving

Props arrive as cells, not as values, which is what lets the body run
once and still follow its parent. `props.currency` is an `InputCell`,
and `input(props.currency, 'USD')` reads it with a default:

```ts
function OrderLine(props: Inputs<{ currency?: Currency }>) {
  const currency = input(props.currency, 'USD');
}
```

A parent can pass a plain value or an Observable, since every prop is
`Reactive<T> = T | Observable<T>`, and the child cannot tell the
difference. That is why the example passes `currency` (a cell) straight
down: to `OrderLine` it is simply a prop that changes.

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

## Derived, with no cell at all

```ts
const total = combineLatest([currency, quantity]).pipe(map(([unit, count]) => format(count * PRICE * RATES[unit])));
```

There is no `total` cell, no effect that recomputes one, and no moment
where `total` disagrees with `quantity`. Anything that would be a
`useMemo`, a `computed`, or a `useEffect` writing into a second piece of
state is this instead.

The rule of thumb: **if you can write the value as an expression over
other values, do not put it in a cell.** A cell is for a value that
nothing else determines.

## What a binding costs

A binding is attached to one property of one node. When it emits, that
property is written and the node is marked. What that costs depends on
which property:

- `text`, `image`: content, so a repaint.
- `backgroundColor`, `opacity`, `borderColor`: paint, so a repaint with
  no layout.
- `width`, `gap`, `flexGrow`, `padding`: layout, so a layout pass from
  the nearest ancestor that can absorb the change.
- `transform`: neither. The node moves without layout or paint
  properties being touched.

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
