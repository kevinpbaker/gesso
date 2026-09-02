---
description: 'Menu: a list of commands anchored to a button or opened at a point, with its props, the keys that walk it, and what it announces.'
---

# Menu

A list of commands, floating above the screen. Reach for it for actions
rather than values: rename, duplicate, move, delete. If what the list
holds is a value the control should go on showing afterwards, that is a
[select](/components/select); if the commands are few and always
relevant, a row of buttons or a [toolbar](/components/toolbar) saves the
user a click.

`Menu` owns the keyboard and the placement. The caller owns the trigger
and the open state, because a menu is opened by a button, a right-click
or a shortcut, and the component should not have to care which.

<LiveExample id="menu" height="300" />

<<< @/src/examples/MenuExample.tsx#menu

`Actions` hangs off the button beside it. The note takes `at` instead,
so its menu opens where the pointer was, which is what a context menu
is. Open either and use Down, Up, Home, End, Enter and Escape; `Archive`
is disabled, so the walk steps over it.

## Props

| Prop           | Type                       | Default          | What it does                                                                      |
| -------------- | -------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `items`        | `readonly MenuItem[]`      | required         | The commands, in the order they are drawn. Bound, so a cell of items follows.     |
| `open`         | `boolean`                  | none             | Whether the menu is up. The application owns it; a menu never opens itself.       |
| `onOpenChange` | `(open: boolean) => void`  | none             | Called with `false` when the menu closes. It is never called with `true`.         |
| `onSelect`     | `(value: string) => void`  | none             | Called with the chosen item's `value`, just before the menu closes.               |
| `anchor`       | `UiNode \| null`           | `null`           | The node the menu sits beside. Read when the menu opens. See below: pass a cell.  |
| `at`           | `{ x: number, y: number }` | none             | Where to open, in viewport pixels, for a menu with no anchor. Read when it opens. |
| `placement`    | `OverlayPlacement`         | `'bottom-start'` | Which side of the anchor to prefer. Read when the menu opens.                     |
| `label`        | `string`                   | `'Menu'`         | The menu's accessible name. Not drawn, so name it after what the commands act on. |

A `MenuItem` is three fields:

| Field      | Type      | Default  | What it does                                                                              |
| ---------- | --------- | -------- | ----------------------------------------------------------------------------------------- |
| `value`    | `string`  | required | What `onSelect` reports. Also the row's key.                                              |
| `label`    | `string`  | required | Drawn on the row, and the row's accessible name.                                          |
| `disabled` | `boolean` | `false`  | Draws the label in the disabled foreground token, makes the row inert, and skips the keys |

`Menu` does not take the shared layout props the rest of the library
takes, and it has no `rootModifiers`. Nothing is drawn where it is
declared, so there is no root to place: the menu is a minimum of 160
pixels wide and the layer decides where it goes.

`onOpenChange` runs once per close, whatever closed the menu: choosing
an item, Escape, a press outside, a write of `false` into `open`, or the
component unmounting while the menu is up. The report comes from the
overlay entry, which is the one point all of those paths pass through,
so the count does not depend on which of them was taken.

## The anchor has to be a cell

This is the one thing that will cost an afternoon if it is got wrong.

```tsx
// Wrong: the field is null when Menu reads it, and is never re-read.
let anchor: UiNode | null = null;

// Right: the prop follows the ref, because a cell is an Observable.
const anchor = internalState<UiNode | null>(null);
```

A component body runs once, and a `ref` fires after it. A plain field
therefore hands `Menu` the `null` it held at that moment and never
corrects it, and a menu with no anchor falls back to the edge offsets:
it opens in the top-left corner of the window whatever button you meant
it to hang off. The rule generalises past this component. An anchor
handed across a component boundary must be a cell, or be read at open
time. `decisions/0024-overlays-tier.md` records it as a rule for exactly
that reason.

`Select` and `Tooltip` need no cell, because each reads its own `ref`
inside the call that opens the entry.

## A context menu is the same component

There is no second component for a menu at a point. Pass `at` instead
of `anchor`, and the entry is placed at those viewport coordinates:

```tsx
onClick={(event: UiPointerEvent) => {
  at.value = { x: event.x, y: event.y };
  open.value = true;
}}
```

Write the point before writing `open`, since both are read when the
menu opens and cells are written synchronously.

## Placement

An anchored menu is placed by the layout engine, not by this component.
It takes the side `placement` asks for, flips to the opposite side when
it would overflow the viewport, and shifts along the other axis to stay
on screen. It follows its anchor when the content underneath scrolls.
`placement` accepts `top`, `bottom`, `left` and `right`, each with a
`-start` and `-end` variant, and defaults to `'bottom-start'`.

The entry always takes a backdrop, so a press or a wheel anywhere
outside closes the menu and nothing behind it scrolls while it is up.

## Keyboard

The menu itself takes focus and traps it while it is open, so the keys
below cannot reach the page underneath. The rows are not tab stops: the
arrows move a highlight rather than focus, which is what keeps Escape
and Enter arriving at the menu.

| Key      | What it does                                          |
| -------- | ----------------------------------------------------- |
| `Down`   | The next item that can be chosen, wrapping at the end |
| `Up`     | The previous one, wrapping at the start               |
| `Home`   | The first item that can be chosen                     |
| `End`    | The last item that can be chosen                      |
| `Enter`  | Chooses the highlighted item and closes the menu      |
| `Space`  | The same                                              |
| `Escape` | Closes the menu without choosing                      |

Every key in the table is consumed; anything else is left for whatever
is listening above. There is no type-ahead here, unlike
[Select](/components/select): a printed character does nothing.

### A disabled item can sit anywhere

The walk moves over the items that can be chosen, and the highlight is
painted on the row it lands on, so what `Enter` takes is always the row
the highlight is on. Opening the menu highlights the first item that can
be chosen, `Down` and `Up` step past a disabled row in both directions
and wrap around it, and `Home` and `End` answer with the ends of what
can be chosen. Position in the list makes no difference to any of that.

A disabled row refuses a press as well, so nothing a pointer can do
chooses an item the keyboard cannot reach.

## Semantics

| What      | Value                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Menu      | `menu`, named by `label`, on the element that takes focus                        |
| Item      | `menuitem`, named by the item's `label`                                          |
| Disabled  | `disabled` on the record of an item marked so, and the subtree under it is inert |
| Highlight | Not emitted at all: it is a background colour, with no state behind it           |

Nothing says which item the arrows have reached. The highlight is a fill
and no more, so an assistive technology following the semantics tree
learns which item was chosen only when `onSelect` fires. A menu item
also carries no `posInSet` and no `setSize`, so nothing announces
"2 of 4"; the spec asserts both absences.

One thing to know before relying on this with a screen reader: a menu
item's own text keeps a record of its own, rather than being claimed as
the item's name the way the text inside a [tab](/components/tabs) or an
option is. ARIA calls the children of a `menuitem` presentational, and
this framework's list of such roles does not yet include it, so the
label is on the tree twice. The spec asserts the current shape.

## What has been checked

Everything above is asserted by the spec beside the example, which
drives the real runtime with a fake canvas. What that does not cover is
drawing: the canvas above is Canvas2D, and Chrome and other Chromium
browsers are the extent of what any of this has been opened in. The
anchored placement was checked by hand on both renderers in the
playground, and not on the single-thread route. No screen reader has
been sat in front of the semantics above.

## Next

[Select](/components/select) is the same overlay machinery holding a
value instead of a command, and [Dialog](/components/dialog) is the one
that takes the whole keyboard.
