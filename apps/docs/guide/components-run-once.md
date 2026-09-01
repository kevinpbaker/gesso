---
description: Why a Gesso component function runs exactly once, and what that changes about where state and derived values go.
---

# Components run once

A component function is called once per instance. It is not called again
when its state changes, when its props change, or when the screen
repaints. What it returns is a tree of retained nodes that stays on
screen, and everything dynamic in that tree is an Observable bound
straight into it.

Press the button as many times as you like. The readings change; the
count of component bodies does not move.

<LiveExample id="runsonce" height="300" />

Four bodies ran — the panel and its three rows — and they ran while the
screen was being built. After that, a press writes three numbers into
three nodes that already exist.

<<< @/src/examples/RunsOnceExample.tsx#rows

## What this replaces

If you have written React, the habits worth unlearning are the ones
that exist to survive re-rendering:

| The habit                                          | Why it is not here                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `useMemo` around an expensive derived value        | The body runs once, so the expression runs once. There is nothing to memoise against.                            |
| `useCallback` for a stable handler                 | The closure is created once and attached to a node once. It is already stable.                                   |
| A dependency array                                 | A binding subscribes to exactly the Observables it reads. Nothing is compared, so nothing can be under-declared. |
| `key` to preserve identity across a render         | Component identity **is** node identity. A key matters only for a list whose contents are rebuilt — see below.   |
| Splitting a component to avoid re-rendering a peer | A peer is never re-rendered. Components are split for readability alone.                                         |

The last row is the one that changes how a screen is written. In a
re-rendering framework, the shape of a component tree is partly a
performance decision. Here it is not: a value written into one node
touches that node.

## What still costs something

Running once is not the same as being free. What costs is the work a
change actually causes:

- **A content binding** — `text`, `image` — writes a property and
  repaints.
- **A layout binding** — `width`, `flexGrow`, `gap` — writes a property
  and runs layout again from the nearest node that can absorb it.
- **A paint binding** — `backgroundColor`, `opacity` — writes a property
  and repaints without touching layout.
- **A children binding** — an Observable of a list — mounts and unmounts
  components, which is the one case where bodies run again, for the
  items that are new.

So the question to ask about a screen is not "how often does this
re-render", which is once, but "what does this value change cause". A
number in a label is cheap; the same number in a `width` is a layout
pass.

## Mounting is when a body runs

A component body runs when the component is mounted, and that is the
only time. Three things mount a component:

1. The application starting.
2. A children binding emitting a list that contains something new.
3. A route change, or any other place a component appears in a tree
   that was not there before.

Everything else — every value, every colour, every size — is a write
into a node that already exists.

```ts
// Runs once, when the row is mounted.
const format = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

// Runs on every emission, because it is inside the binding.
return Text({ text: reading.pipe(map(value => format.format(value))) });
```

That distinction — outside the binding, once; inside it, per emission —
is the whole performance model, and it is visible in the source rather
than in a profiler.

## Where state goes instead

If the body does not re-run, a `useState` equivalent would have nowhere
to live. It lives in a cell instead: a value the component holds, which
bindings read. That is [the next page](/guide/cells-and-bindings).
