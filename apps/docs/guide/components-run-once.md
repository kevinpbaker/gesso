---
description: Why a Gesso component function runs exactly once, and what that changes about where state and derived values go.
---

# Components run once

A component function is called once per instance. It is not called again
when its state changes, when its inputs change, or when the screen
repaints. What it returns is a tree of retained nodes that stays on
screen, and everything dynamic in that tree is an Observable bound
straight into it.

Press the button as many times as you like. The readings change; the
count of component bodies does not move.

<LiveExample id="runsonce" height="300" />

Four bodies ran, the panel and its three rows, and they ran while the
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
| `key` to preserve identity across a render         | Component identity **is** node identity. A key matters only for a list whose contents are rebuilt; see below.    |
| Splitting a component to avoid re-rendering a peer | A peer is never re-rendered. Components are split for readability alone.                                         |

The last row is the one that changes how a screen is written. In a
re-rendering framework, the shape of a component tree is partly a
performance decision. Here it is not: a value written into one node
touches that node.

## What still costs something

Running once is not the same as being free. What costs is the work a
change actually causes:

- **A content binding** (`text`, `image`) writes a property and
  repaints.
- **A layout binding** (`width`, `flexGrow`, `gap`) writes a property
  and runs layout again from the nearest node that can absorb it.
- **A paint binding** (`backgroundColor`, `opacity`) writes a property
  and repaints without touching layout.
- **A children binding** (an Observable of a list) mounts and unmounts
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

Everything else, every value and colour and size, is a write into a
node that already exists.

```ts
// Runs once, when the row is mounted.
const format = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

// Runs on every change, because it is inside the computed.
return Text({ text: computed(() => format.format(reading.value)) });
```

That distinction, outside the computed once and inside it per change,
is the whole performance model, and it is visible in the source rather
than in a profiler.

## What is live, and what is read once

Every input reaches a component as a cell. Reading `inputs.label.value`
inside the body gives the value at that moment and nothing afterwards;
binding `inputs.label`, or a `computed` that reads it, into a node's prop
gives every value it will ever have. The body runs once, so a `.value` read in it is
a snapshot, and a snapshot of something that changes is a bug that
fails silently: the screen simply stays as it was.

Two things make that bug visible. If a body reads a prop with `.value`
and that prop later changes with nothing following it, the framework
warns once, naming the component, the prop and, for an object, the
field that moved. And the library's own components follow their inputs:
an `Image` bound to a `src` that changes shows the new picture and
releases the old, an `Icon` bound to a `path` or `color` redraws in
place. Neither needs a `key` to change what it shows.

A `key` is for identity, not for change. Give one to each item of a
list bound to an Observable, so a reordered list moves nodes rather than
rebuilding them; give one to a child whose _shape_ changes, an `Image`
that becomes a lettered box when there is no picture, so the reconciler
replaces the node rather than handing new inputs to a body that has
already run.

A few rules that follow from the same model and are worth knowing before
they are met:

- Inside `<text>` and `<button>` a lone Observable child is the text.
  `<button>{icon$}</button>` binds an element to the button's label and
  draws nothing; the framework warns once when a text turns out not to
  be text. Put such a child in an array, `{[icon$]}`, or in a `<box>`.
- A `button` stacks its children at its origin, as a `box` does. To lay
  out an icon beside a label, put a `<row>` inside it.
- A modifier written inline, `modifiers={[interactive({ hovered: ... })]}`,
  is compared by what it holds, so it is the same modifier across a
  rebuild. A modifier whose arguments include a fresh callback each time
  is a new one; hoist the callback, or the whole modifier.
- `Presence` fills whatever holds it. Placed in an app's root it sits over
  every screen and takes their clicks; hold it in a box the size of what
  it animates.
- Paint and hit order among siblings is tree order, then `zIndex`. An
  absolutely positioned control followed by a positioned column is
  painted under the column and cannot be clicked; give it a `zIndex`.

## What the body may ask for

The second argument to a component function is its context: what the
function may ask of the framework while it runs.

| On `ctx`             | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `inject(Service)`    | The runtime service of this class                                |
| `channel(token)`     | The replica of a channel: `view` keys to read, `send` to command |
| `onMount(fn)`        | Runs once after the nodes exist and the bindings are connected   |
| `onUnmount(fn)`      | Runs once when the component leaves the tree                     |
| `effect(source, fn)` | Follows a stream for as long as the component is in the tree     |
| `bounds()`           | A cell holding a node's box, with the modifier that fills it     |

Most values a component reads are bound into the tree, and a binding
needs no lifecycle: it is torn down with the node it feeds. `effect` is
for the other kind, a value the component has to **act** on rather than
draw, such as telling the audio element to load a track or asking a
channel for the page a url names.

```ts
ctx.effect(queue.view.current, track => audio.load(track.stream));
```

The subscription belongs to the host and goes when the component does,
after `onUnmount` has run. Writing that pair by hand, a `subscribe` in
the body and an `onUnmount` that unsubscribes, is the same thing with
two places to forget.

`bounds()` answers the other question a body cannot answer for itself:
where is this node. Turning a pointer position into a fraction of a
track needs the track's box, and a canvas has no `getBoundingClientRect`.

```tsx
const track = ctx.bounds();
<box modifiers={[track.modifier]} onPanMove={e => seek((e.x - track.value.x) / track.value.width)} />;
```

It is an ordinary cell: read it in a handler, bind it, derive from it.
It reports a move and only a move, so a box that has not changed does
not wake everything reading it; a list notifies its listeners on every
frame it scrolls, and its viewport is exactly what stays still while it
does.

## Where state goes instead

If the body does not re-run, a `useState` equivalent would have nowhere
to live. It lives in a cell instead: a value the component holds, which
bindings read. That is [the next page](/guide/cells-and-bindings).
