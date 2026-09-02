---
description: 'Select: one value chosen from a list that is not always on screen, operable from the keyboard alone, with its props, keys and listbox semantics.'
---

# Select

One value, chosen from a list that is not always on screen. Reach for it
when the options are too many to sit on the page and the answer is
exactly one of them: a country, a payment method, a delivery speed.

When there are two or three options and the screen has room, a
[radio group](/components/radio-group) is better, because it shows every
answer without a gesture. When the list holds commands rather than a
value, that is a [menu](/components/menu): a menu does something and
forgets, a select goes on showing what was picked. There is no
multiple-selection form of this component; a list of independent choices
is a column of [checkboxes](/components/checkbox).

The trigger is the component's, not the caller's. It is the node that
carries the `combobox` role, holds focus and shows the chosen label, so
a caller supplying its own would have to reproduce all three.

<LiveExample id="select" height="320" />

<<< @/src/examples/SelectExample.tsx#select

Tab onto either trigger and never touch the pointer: Enter, Space or an
arrow opens the list, the arrows walk it, a letter jumps to the option
it starts, Enter chooses, and Escape closes without choosing. Payment is
controlled and the application refuses `Invoice`, so choosing it leaves
the trigger where it was. Delivery owns its own value and starts empty,
so it shows its placeholder and reports itself invalid until something
is chosen.

## Props

| Prop           | Type                      | Default     | What it does                                                                      |
| -------------- | ------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `options`      | `readonly SelectOption[]` | required    | The options, in the order they are drawn. Declare the array once.                 |
| `value`        | `string`                  | none        | The chosen value, when the application owns it. Supplying it makes it controlled. |
| `defaultValue` | `string`                  | none        | The value to start on, when the select owns it. Supplying both throws.            |
| `onChange`     | `(value: string) => void` | none        | Called with the value the select would take, on a click, a key and a jump.        |
| `label`        | `string`                  | `''`        | Drawn above the trigger, and the accessible name of the trigger and the list.     |
| `placeholder`  | `string`                  | `'Choose…'` | Drawn in the trigger while the value is the empty string.                         |
| `disabled`     | `boolean`                 | `false`     | Refuses clicks and keys, greys the text, and marks the subtree unavailable.       |
| `invalid`      | `boolean`                 | `false`     | Draws the trigger's border in `danger` and adds the `invalid` state.              |
| `required`     | `boolean`                 | `false`     | Adds the `required` state. It enforces nothing: validity is the application's.    |
| `ref`          | `UiNodeRef`               | none        | Receives the trigger node, for focusing it or anchoring something to it.          |

A `SelectOption` is three fields:

| Field      | Type      | Default  | What it does                                                                              |
| ---------- | --------- | -------- | ----------------------------------------------------------------------------------------- |
| `value`    | `string`  | required | What `onChange` reports and `value` is compared against. Also the row's key.              |
| `label`    | `string`  | required | Drawn on the row, the row's accessible name, and what the trigger shows when chosen.      |
| `disabled` | `boolean` | `false`  | Draws the label in the disabled foreground token, makes the row inert, and skips the keys |

Every prop takes a plain value or an Observable of one, and the shared
layout props on [the library page](/components/) apply here: `Select`
spreads them onto its own outer column. `rootModifiers` goes somewhere
else, onto the trigger beside the focus ring, because that is the
element that takes focus and carries the role. Declare the value once at
module scope, since a modifier's arguments are compared by identity and
a fresh one detaches and re-attaches on every frame.

A value that matches no option leaves the trigger blank rather than
throwing, and blank is not the placeholder: the placeholder is for the
empty string.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the value, and the trigger shows it.
<Select label="Payment method" options={PAYMENTS} value={payment} onChange={next => (payment.value = next)} />

// Uncontrolled: the select owns the value, and reports changes if asked.
<Select label="Payment method" options={PAYMENTS} defaultValue="card" onChange={next => save(next)} />
```

Which of the two applies is decided once, when the component is built,
from whether `value` was supplied; passing both throws an error naming
the component rather than choosing quietly.

A controlled select draws the value it is handed, and `onChange` is a
request. The example refuses one of its options and the spec beside it
proves the trigger does not move: the list still closes, because
choosing closes it whatever the application then decides.

An uncontrolled select keeps one cell of its own and still calls
`onChange`, which is what the Delivery field above does: nothing owns
its value, and the summary line still knows what was picked.

## Keyboard

The trigger is one tab stop. Opening the list traps focus in it, so
nothing above the select sees these keys; closing it, for any reason,
hands the keyboard back to the trigger.

While the list is closed, with focus on the trigger:

| Key                 | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `Enter`             | Opens the list                                             |
| `Space`             | Opens the list                                             |
| `Down`              | Opens the list                                             |
| `Up`                | Opens the list                                             |
| A printed character | Chooses the first option starting with it, without opening |

While the list is open:

| Key                 | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `Down`              | The next option that can be chosen, wrapping at the end   |
| `Up`                | The previous one, wrapping at the start                   |
| `Home`              | The first option that can be chosen                       |
| `End`               | The last option that can be chosen                        |
| `Enter`             | Chooses the highlighted option and closes                 |
| `Space`             | The same                                                  |
| `Escape`            | Closes without choosing, and returns focus to the trigger |
| A printed character | Moves the highlight to the first option starting with it  |

Opening the list puts the highlight on whatever is already chosen, so
the walk starts where the value is rather than at the top.

### Type-ahead is one character

It is a prefix match, case-insensitive, over the options that can be
chosen, and it starts from the top of the list every time. There is no
buffer and no timer: typing `b` then `a` looks for an option starting
with `b`, and then for one starting with `a`, rather than for `ba`. Two
options sharing a first letter therefore cannot be told apart by typing,
and the second one needs the arrows.

Closed, a letter commits the value outright without ever drawing the
list. Open, it only moves the highlight, and `Enter` still has to take
it.

### A disabled option can sit anywhere

The walk moves over the options that can be chosen, and the highlight is
painted on the row it lands on, so what `Enter` takes is always the row
the highlight is on. Opening the list highlights the chosen option, or
the first one that can be chosen when the value matches nothing
available, and the arrows, `Home` and `End` all keep to that subset.
Type-ahead does too: a letter matches only options that can be chosen.

A disabled row refuses a press as well, so nothing a pointer can do
chooses an option the keyboard cannot reach.

## Semantics

| What     | Value                                                                                     |
| -------- | ----------------------------------------------------------------------------------------- |
| Trigger  | `combobox`, named by `label`, on the node that takes focus                                |
| Value    | `valueText`, the chosen option's `label`. No `valueNow`: the value is not a number        |
| States   | `expanded` while the list is open, `invalid` while `invalid`, `required` while `required` |
| List     | `listbox`, named by the same `label`                                                      |
| Option   | `option`, named by the option's `label`, with `posInSet` counted over the whole list      |
| Chosen   | `selected`, on the one option that matches the value                                      |
| Disabled | `disabled` on the trigger or on an option marked so, and the subtree under it is inert    |

The states arrive as they change rather than being read once, so a value
the application writes from elsewhere updates what an assistive
technology sees without anything re-rendering.

An option's own text has no record of its own: ARIA calls the children
of an `option` presentational, and a screen reader that read both the
row and the text inside it would say everything twice.

What is not emitted is worth knowing. An option carries `posInSet` but
no `setSize`, so nothing can announce "1 of 4"; the spec asserts that
absence, so it is documented rather than accidental.

## The list is an overlay

The list is not drawn inside the select. It goes into the overlay layer
the runtime mounts above the app root, anchored to the trigger with a
four-pixel offset and a `bottom-start` placement, which is what lets the
layout engine flip it above the trigger at the bottom of the viewport
and shift it sideways to stay on screen. The entry takes a backdrop, so
a press or a wheel anywhere outside closes it.

Because the layer sits above the app root, the list inherits none of the
scoped values of the tree that opened it, and it would come out light
inside a dark-themed panel. `Select` needs no placeholder for this: the
entry is anchored to the trigger, and the layer falls back to the anchor
for the theme, the text style and the content colour. That is the same
defect `decisions/0024-overlays-tier.md` records, found by opening the
page rather than by any spec.

## What has been checked

Everything above is asserted by the spec beside the example, which
drives the real runtime with a fake canvas and no browser. What that
does not cover is drawing: the canvas above is Canvas2D, and Chrome and
other Chromium browsers are the extent of what any of this has been
opened in. The flip at the bottom of the viewport and the inherited
theme were checked by hand on WebGPU in the playground, and not on the
single-thread route. No screen reader has been sat in front of the
semantics above, which is a different question from whether they are
emitted.

## Next

[Menu](/components/menu) is the same overlay machinery holding commands
rather than a value, [RadioGroup](/components/radio-group) is the same
choice with every option on the page, and
[the library overview](/components/) has the contract all of this is an
instance of.
