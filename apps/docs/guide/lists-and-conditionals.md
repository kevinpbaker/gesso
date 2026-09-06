---
description: Drawing a list that changes, and a child that comes and goes, with each and show.
---

# Lists and conditionals

A component body runs once, so a list and a conditional are not control
flow in the body: they are values that change, bound into the tree like
any other. Two helpers cover the whole of it.

| What changes               | What to write                                    |
| -------------------------- | ------------------------------------------------ |
| The rows of a list         | `<Each of={rows} by="id">{row => ...}</Each>`    |
| Whether one child is there | `<Show when={cond}>{() => ...}</Show>`           |
| A value inside a row       | Bind it, or `select` it. Neither helper re-runs. |

## `Each`, a keyed list

```tsx
<column gap={8}>
  <Each of={tracks} by="id">
    {track => <TrackRow track={track} />}
  </Each>
</column>
```

`of` is a cell, any Observable of an array, or a plain array. `by` says
what identifies a row: a field name, or a function
(`by={row => row.id}`). The key goes on the element the row function
returns, so a row component is written without one.

The key is what makes the list cheap and correct. A row keeps its node,
its component instance and its animation for as long as it is in the
list, so inserting a row at the top moves nothing else, and a text field
in a row keeps the text somebody typed into it.

Only what changed is redrawn. `Each` holds the element it built for each
key and hands the same one back while that row's value has not changed,
so a list that re-emits equal data draws nothing at all and the tree is
never re-entered. A row whose value changed is rebuilt on its own.

Leave `by` out and rows are keyed by their position, which is what the
tree falls back to and almost never what you want: a row inserted
anywhere but the end shifts every row after it onto a different node.
`Each` says so once, in a warning, rather than letting it be discovered
as a bug.

For a list long enough that the rows out of view should not exist at
all, [`LazyColumn`](/recipes/virtualized-feed) is the same shape with a
`count` and an `index => child`.

## `Show`, one child while a condition holds

```tsx
<row gap={6}>
  <Show when={liked}>{() => <Icon path={HEART} />}</Show>
</row>
```

`when` is a cell, an Observable or a plain value; anything truthy shows
the child. `otherwise` gives the other branch:

```tsx
<Show when={signedIn} otherwise={() => <SignInButton />}>
  {() => <Account />}
</Show>
```

The child is built once, on the first frame it is shown, and kept: a
condition that emits `true` again draws nothing. It carries a stable
key, so the node it built is the node it gets back when the condition
returns, and `Show` puts nothing else under the parent, so layout sees
the child or nothing and never a wrapper.

`{cond && <x />}` still works when `cond` is a plain value, and it is
the shorter thing to write when the answer is settled while the body
runs. `Show` is for a condition that changes afterwards.

## What does not re-run

Neither helper re-runs its function when the data inside changes, only
when the list or the condition does. So a value shown inside a row or
inside a `Show` is bound, not read:

```tsx
<Show when={track}>{() => <text>{select(track, entry => entry?.title ?? '')}</text>}</Show>
```

`select` is one field, or one projection, of a cell, as a cell. It
compares structurally, so a projection that rebuilds an equal array or
object does not re-bind everything reading it:

```ts
const title = select(inputs.track, 'title');
const tags = select(inputs.track, entry => entry.tags.slice(0, 8));
```

Reading four fields of one input is four of these, and none of them
needs an operator, a comparator or a subscription of its own.
