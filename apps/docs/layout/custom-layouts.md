---
description: A node whose children an application measures and places itself, in the engine's own constraints vocabulary, with an explain of its own.
---

# Custom layouts

A masonry wall, a radial dial, a timeline and a tag cloud have one thing
in common: none of them is expressible in flex or in grid, and all of
them are a short function over the children's sizes. The `layout` prop
is where that function goes.

```tsx
<box layout={masonry({ columns: 3, gap: 16, minColumnWidth: 220 })}>
  {items.map(item => (
    <Tile key={item.id} item={item} />
  ))}
</box>
```

There is no `<Masonry>` element. A custom layout is a value, so a
container becomes a masonry the way it becomes a scroller: by naming the
behaviour it should have. It works on any container, and it replaces
whatever that container would otherwise have done with its children.

## The protocol

A layout is an object with a name and one method:

```ts
interface UiLayoutProtocol {
  readonly name: string;
  layout(children: readonly UiLayoutChild[], constraints: Constraints, context: UiLayoutContext): Size;
  explain?(children: readonly UiLayoutChild[], size: Size, context: UiLayoutContext): readonly string[];
}
```

`Constraints` is the same class the engine hands every other node, and
`Size` is what a measurement returns. That is the point of the shape:
a custom layout is another container rather than a hole in the pass, and
the size it returns is clamped by the node's own `width`, `minWidth` and
the rest exactly as a row's content size is.

Each child arrives as a handle with four things on it:

| On the handle | What it is                                                       |
| ------------- | ---------------------------------------------------------------- |
| `index`       | Its place among the container's in-flow children, from zero.     |
| `data`        | Whatever the element declared as `layoutData`: a weight, a lane. |
| `measure(c)`  | Measures the child under those constraints and returns its size. |
| `place(s, t)` | Puts its border box at a point in the container's content box.   |

`size` and `position` read back what the last call to each returned.

A whole masonry is twenty lines of that:

```ts
export const masonry: UiLayoutProtocol = {
  name: 'masonry',
  layout(children, constraints) {
    const available = isFinite(constraints.maxWidth) ? constraints.maxWidth : 0;
    const width = (available - GAP * (COLUMNS - 1)) / COLUMNS;
    const heights = Array.from({ length: COLUMNS }, () => 0);
    for (const child of children) {
      let shortest = 0;
      for (let column = 1; column < COLUMNS; column++) {
        if (heights[column] < heights[shortest]) {
          shortest = column;
        }
      }
      const size = child.measure(new Constraints(width, width, 0, Infinity));
      child.place(shortest * (width + GAP), heights[shortest]);
      heights[shortest] += size.height + GAP;
    }
    return { width: available, height: Math.max(0, ...heights) - GAP };
  }
};
```

The running version, which also decides its own column count from the
width it is given, is `apps/playground/src/examples/layout/masonry.ts`,
and the page it is on is the playground's **Layout** example.

## Hold the protocol still

`layout` is an ordinary property, so its value is compared with
`Object.is` like every other. A fresh object per render marks the node
dirty on every frame. Build it once at module scope, or memoise it on
the parameters it closes over:

```ts
const cache = new Map<string, UiLayoutProtocol>();

export function masonry(options: MasonryOptions): UiLayoutProtocol {
  const key = `${options.columns}/${options.gap}`;
  let protocol = cache.get(key);
  if (protocol === undefined) {
    protocol = build(options);
    cache.set(key, protocol);
  }
  return protocol;
}
```

## What the engine will not let you do

A protocol is application code running inside the layout pass, so the
handles are the whole of what it can reach. There is no node on them, so
a layout cannot read another subtree's geometry mid-pass or write a
property that would dirty one. Three further rules are enforced rather
than asked for, and each one throws with the protocol's name in the
message:

- **A child may be measured at most twice in one call.** Two is what the
  engine's own flex needs. A protocol asking for a third is nearly
  always measuring inside a loop over its siblings, which is what turns
  a linear pass into a quadratic one, so the work is at worst twice the
  number of children however the loop is written.
- **A handle is valid only for the call it was given to.** Keeping one
  and placing a child from a timer later would write a box that nothing
  had invalidated.
- **A size or a position that is not a finite number is refused**, with
  the child's index, rather than propagating a `NaN` through the tree.

## Twice a pass, and no state between

`layout` is called twice over a node the pass did not memoise: once
while measuring, when the size it returns is what the container reports
to its parent and `place` does nothing, and once while placing, when the
constraints are the resolved content box and the `place` calls assign
the boxes. Both calls see the same children in the same order.

Write it as a function of its arguments. A protocol that keeps state
between the two calls is wrong the first time a memo hit skips the
measurement, which is most frames.

## Margins, and which way is start

A custom layout places border boxes. `margin` on a child is not applied,
because only the protocol knows what the space between two of its own
children means, and a margin the engine added behind its back would move
boxes it had already placed. Use the protocol's own gap.

`place(start, top)` measures `start` from the edge the reading starts
at, so under `textDirection="rtl"` the engine mirrors the coordinate and
a layout written once works both ways round. A protocol that needs to
know which way it is being mirrored reads `context.direction`. See
[right to left](/layout/right-to-left).

## An explain of its own

The engine can say why a box is the size it is because it decided;
for a custom layout it did not. `explain` is where a protocol says the
things the boxes do not:

```ts
explain(children, size) {
  return [
    `${count} columns of ${width} px, ${gap} px apart`,
    `${children.length} items, ${counts.join(' / ')} per column`,
    `column ${tallest + 1} is the tallest at ${size.height} px`
  ];
}
```

`formatExplanation` prints those under the node's own two axes, and the
playground's inspector shows them for whatever the pointer is over:

```
layout 'masonry' over 12 children
  3 columns of 281.7 px, 16 px apart
  12 items, 5 / 4 / 3 per column
  column 1 is the tallest at 701.6 px; the shortest ends 120 px above the bottom
```

A child of a custom layout gets an explanation too, and it names the
layout that decided it: `the 'masonry' layout on box 'wall' measured it
at 281.67`.

`explain` is called after a pass and never during one, and its handles
refuse both `measure` and `place`. A question that moved boxes would be
a second layout nothing had asked for. Read `child.size` and
`child.position` instead.

See [asking the engine why](/layout/explain) for the rest of what an
explanation carries.
