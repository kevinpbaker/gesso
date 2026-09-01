---
description: 'Nested data as a list of rows: the open branches, the chosen key, the arrow keys ARIA specifies, and the level every row carries.'
---

# Tree

`Tree` shows data that nests: files in folders, a document outline, a
category under a category. It draws the open part of the model as rows,
keeps one chosen row, and mounts only the rows in view, so a tree of a
hundred thousand nodes with three of them open costs three rows. When
the data is flat, [LazyList](/components/lazy-list) is the same list
without the branches, and when it is a record with fields,
[DataTable](/components/data-table) gives it columns.

The model is nested and the rows are not. The open part of it is
flattened into a sequence, because a sequence is the only thing a
windowing engine can window, and each row carries the `level` the
flattening took out.

<LiveExample id="tree" height="330" />

<<< @/src/examples/TreeExample.tsx#tree

Press a branch to open it, and press it again to close it. Expand all
and Collapse all write the same set the presses write, which is what a
controlled open set is for. Click the tree and use the arrows: Right
opens a closed branch and steps into an open one, Left closes an open
branch and steps out of a leaf.

## Props

| Prop                 | Type                                    | Default  | What it does                                                                                       |
| -------------------- | --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `nodes`              | `readonly TreeNode[]`                   | required | The model, nested. Bound, so a new array is a new tree.                                            |
| `expanded`           | `readonly string[]`                     | none     | The open branches, by key, when the application owns them. Supplying it makes the tree controlled. |
| `defaultExpanded`    | `readonly string[]`                     | none     | The branches to start open, for a tree that owns its own set. Supplying both throws.               |
| `onExpandedChange`   | `(expanded: readonly string[]) => void` | none     | Called with the whole new set whenever a branch opens or closes.                                   |
| `selectedKey`        | `string \| null`                        | none     | The chosen row, by key. Supplying it makes the selection controlled.                               |
| `defaultSelectedKey` | `string \| null`                        | none     | The row to start on. `null`, meaning nothing chosen, when neither prop is given.                   |
| `onSelect`           | `(key: string \| null) => void`         | none     | Called with the key of the row a press or a key chose.                                             |
| `onActivate`         | `(key: string) => void`                 | none     | Called on Enter or Space with the chosen row's key. Nothing happens when nothing is chosen.        |
| `rowHeight`          | `number`                                | `24`     | The height the window expects of a row it has not measured yet.                                    |
| `label`              | `string`                                | `'Tree'` | The tree's accessible name.                                                                        |
| `ref`                | `UiNodeRef`                             | none     | Receives the node that is the tree, for focusing it or reading where it is scrolled to.            |

### `TreeNode`

| Field      | Type                  | Default  | What it does                                                                                                                                                     |
| ---------- | --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`      | `string`              | required | The node's identity: what the open set holds, what the selection holds, and what a row keeps its node by. Unique across the whole tree, not only among siblings. |
| `label`    | `string`              | required | The row's text, and its accessible name.                                                                                                                         |
| `children` | `readonly TreeNode[]` | none     | Makes the node a branch. An absent or empty array is a leaf, and a leaf has no arrow.                                                                            |
| `disabled` | `boolean`             | `false`  | Marks the row and everything in it unavailable: it takes no press, and it is announced as disabled rather than hidden.                                           |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. `rowHeight`
is read once, when the tree is built; `nodes`, `expanded` and
`selectedKey` are bound.

The indent a row is drawn at and the `level` it reports come from the
same number, so what a reader sees and what a screen reader is told
cannot disagree.

## Controlled and uncontrolled

There are two values here and each is owned separately: which branches
are open, and which row is chosen.

```tsx
// The application owns the open set, and can write it from anywhere.
<Tree nodes={FILES} expanded={expanded} onExpandedChange={next => (expanded.value = next)} />

// The tree owns it, starting with src open, and reports changes if asked.
<Tree nodes={FILES} defaultExpanded={['src']} />
```

Which of the two applies is decided once, when the tree is built, from
whether the value prop was supplied. Passing `expanded` and
`defaultExpanded` together throws an error naming the component, and so
does `selectedKey` with `defaultSelectedKey`.

`onExpandedChange` is called with the whole set rather than with the
branch that changed, so writing it back is an assignment and not a
merge. That is what lets Expand all and Collapse all in the example be
one line each.

The chosen row is a key, not a row number, so opening or closing a
branch above it does not move the selection. The other side of that: a
key whose row is no longer visible stays chosen. Collapse a branch
containing the chosen row and nothing is drawn as selected while the
value is still that key, and the next arrow key the tree receives starts
again from the first row. The spec beside the example proves exactly
that.

## Keyboard

The tree is one tab stop. Focus lands on the tree itself and the focus
ring is drawn on it; the rows are not focusable, and which one is chosen
is said by its own selection colour. A chosen row scrolled out of view is
scrolled back in.

| Key          | What it does                                                       |
| ------------ | ------------------------------------------------------------------ |
| Down         | The next row in the open list                                      |
| Up           | The previous row                                                   |
| Right        | Opens a closed branch; on an open branch, steps to its first child |
| Left         | Closes an open branch; on a leaf, steps to its parent              |
| Home         | The first row                                                      |
| End          | The last row of the open list                                      |
| Enter, Space | Calls `onActivate` with the chosen row's key                       |

Right and Left are the ARIA tree keys, and they are the reason a row has
to know its parent as well as its level. Down and Up move by one row in
the flattened list, so a leaf is followed by its parent's next sibling.
There is no Page Up or Page Down here; the arrows and Home and End are
the whole map. Every key clamps: a step past the end is the end, never
the start.

A key that is bound is consumed; a key that is not is left for whatever
is listening above, which is what keeps Tab, and an application's own
shortcuts, working while the tree has focus.

## Semantics

| What          | Value                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Role          | `tree`, on the node that takes focus and scrolls                                           |
| Name          | `label`                                                                                    |
| Row           | `role="treeitem"`, named by the node's `label`                                             |
| Depth         | `level`, counting from 1 at the roots                                                      |
| Position      | `posInSet` among its siblings, with `setSize` the number of those siblings                 |
| Branch states | `expanded` while open, `collapsed` while closed. A leaf carries neither                    |
| Chosen row    | the `selected` state                                                                       |
| Unavailable   | `disabled` on the record of a node marked `disabled`, and inherited by everything under it |

`posInSet` is the row's place among its siblings, not its row number,
which is what ARIA means by it: the second of two children of an open
folder is 2 of 2 however far down the list it is drawn.

Only the mounted rows are in the semantics tree, which is what
virtualization means. The states arrive as they change, so a branch the
application opens from elsewhere updates what an assistive technology
sees without anything re-rendering.

## What this page has checked

The behaviour above is asserted by the spec beside the example, which
drives the real runtime with a fake canvas: the rows the open set
produces, their level, position and states, opening and closing from a
press and from a button, every key in the table above, the chosen key
surviving a collapse, and the disabled node being announced rather than
hidden.

The example above was also driven by hand in Chrome on Linux: pressing
`docs` opened it, pressing a row chose it, Expand all opened every
branch and left the list scrolling, and a press on the disabled `vendor`
row did nothing at all. That was Canvas2D, which is what a reader sees
here unless they asked for the other renderer, and Chrome is the extent
of what any of it has been opened in.

Three limits worth knowing before you build on it. The tree chooses one
row at a time. The arrow keys step through every visible row, including
one marked `disabled`: that row refuses a press, but the keyboard will
land on it. And a disabled row is not drawn any differently, so give it
something of your own if unavailable should look unavailable.

## Next

[DataTable](/components/data-table) is the same windowing with columns,
and [LazyList](/components/lazy-list) is the flat list underneath both.
