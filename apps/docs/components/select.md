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
forgets, a select goes on showing what was picked. When the list is one
a person searches rather than reads, or the answer is several values,
that is a [combobox](/components/combobox).

The trigger is the component's, not the caller's. It is the node that
carries the `combobox` role, holds focus and shows the chosen label, so
a caller supplying its own would have to reproduce all three.

<LiveExample id="select" height="320" />

<<< @/src/examples/SelectExample.tsx#select

Tab onto either trigger and never touch the pointer: Enter, Space or an
arrow opens the list, the arrows walk it, typing a few letters jumps to
the option they start, Enter chooses, and Escape closes without choosing. Payment is
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
element that takes focus and carries the role. Its arguments are
compared by value when the trigger is rebuilt, so a modifier written at
the call site stays attached as long as its options say the same thing;
declaring the value once at module scope just saves building it again.

A value that matches no option leaves the trigger blank rather than
throwing, and blank is not the placeholder: the placeholder is for the
empty string.

## In a narrow row

A select is as wide as its value where there's room, and gives way where
there isn't, as a text field does: its least width is nothing, and the
value is cut short with an ellipsis before the chevron. Three selects
sharing a row with `flexGrow: 1` and `flexBasis: 0` share it however
long a value one of them shows, rather than one pushing the row past its
edge on a phone or in a window zoomed to 400%. A `minWidth` passed in
still wins, for a select that has to keep a width. For a row that should
wrap rather than squeeze, give it `flexWrap: 'wrap'` and each select a
basis.

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

| Key                 | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `Enter`             | Opens the list                                                       |
| `Space`             | Opens the list, or is part of a type-ahead search already under way  |
| `Down`              | Opens the list                                                       |
| `Up`                | Opens the list                                                       |
| A printed character | Type-ahead: chooses the next option matching the search, not opening |

While the list is open:

| Key                 | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `Down`              | The next option that can be chosen, wrapping at the end    |
| `Up`                | The previous one, wrapping at the start                    |
| `Home`              | The first option that can be chosen                        |
| `End`               | The last option that can be chosen                         |
| `Enter`             | Chooses the highlighted option and closes                  |
| `Space`             | The same, or part of a type-ahead search already under way |
| `Escape`            | Closes without choosing, and returns focus to the trigger  |
| A printed character | Type-ahead: moves the highlight to the next match          |

Opening the list puts the highlight on whatever is already chosen, so
the walk starts where the value is rather than at the top. The chosen
option also carries a tick at its end, in the column a
[combobox](/components/combobox) and a [menu](/components/menu) keep for
theirs, because the highlight follows the arrows: once it has moved off
the value, the `selected` state alone would show nothing on screen.

### Type-ahead and the page's shortcuts

A letter the select uses is the select's: it is consumed, so a page's
single-letter [shortcut](/interaction/shortcuts) on the same key does
not also run. With the list open that is every printed character,
whether or not an option starts with it, because the list has the
keyboard to itself and a shortcut acting on the page behind it would be
acting on something the reader can't see. With the list closed it is
only a letter that picks an option; one that picks nothing goes on to
the shortcuts. A key held with `Ctrl`, `Cmd` or `Alt` is never
type-ahead, so `Mod+K` is a shortcut wherever focus is.

### Type-ahead is a search

Type-ahead follows the WAI-ARIA listbox pattern. Characters typed less
than half a second apart are one search, matched case-insensitively
against the start of each label that can be chosen. A pause of half a
second ends it, and the next character starts a new one. Opening or
closing the list ends it too.

The search runs from the current option onward and wraps at the end of
the list. The current option is the highlight while the list is open
and the value while it is closed. A search one character long starts
after it, so typing the same letter again walks every option that
starts with it: in Apple, Avocado and Banana, with Apple chosen, `a`
moves to Avocado and `a` again back to Apple. A longer search starts on
the current option, so typing `b` then `l` among Banana and Blueberry
reaches Blueberry, and typing `b` then `a` stays on Banana rather than
skipping past it. A letter repeated that no label starts with as typed,
`aa` here, is still that walk. A list opened with nothing chosen
counts from before its first option, so `a` lands on Apple, as it does
while closed.

While a search is under way a space is part of it, so typing
`new z` reaches New Zealand past New York rather than choosing New
York at the space. With no search running, `Space` opens the list or
chooses as the tables above say. While closed, a space that would make
a search match nothing opens the list after all.

Closed, a search commits the value outright without ever drawing the
list, a step at a time: `b` then `l` chooses Banana and then
Blueberry. Open, it only moves the highlight, and `Enter` still has to
take it. A character that matches nothing leaves the highlight or the
value where it is; open it still becomes part of the search, closed it
is left to the page's shortcuts, as described above.

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

| What     | Value                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Trigger  | `combobox`, named by `label`, on the node that takes focus                                 |
| Value    | `valueText`, the chosen option's `label`. No `valueNow`: the value is not a number         |
| States   | `expanded` while the list is open, `invalid` while `invalid`, `required` while `required`  |
| List     | `listbox`, named by the same `label`                                                       |
| Option   | `option`, named by the option's `label`, with `posInSet` and `setSize` over the whole list |
| Chosen   | `selected`, on the one option that matches the value                                       |
| Disabled | `disabled` on the trigger or on an option marked so, and the subtree under it is inert     |

The states arrive as they change rather than being read once, so a value
the application writes from elsewhere updates what an assistive
technology sees without anything re-rendering.

An option's own text has no record of its own: ARIA calls the children
of an `option` presentational, and a screen reader that read both the
row and the text inside it would say everything twice.

`posInSet` and `setSize` are a pair, and both are counted over the whole
list rather than over the options that can be chosen, so a disabled
option still takes up a place: the first of four options announces as
"1 of 4" whether or not the fourth can be picked. Which option is chosen
is the `selected` state and not a number, so there is no `valueNow` on
an option.

## The list is an overlay

The list is not drawn inside the select. It goes into the overlay layer
the runtime mounts above the app root, anchored to the trigger with a
four-pixel offset and a `bottom-start` placement, which is what lets the
layout engine flip it above the trigger at the bottom of the viewport
and shift it sideways to stay on screen. The entry takes a backdrop, so
a press or a wheel anywhere outside closes it.

The layer also cuts the list to the room the window has, and the rows
scroll inside it, the way a menu's do, so fifty countries do not run
past the top and bottom of the window. The highlighted option is kept in
view as the arrows, `Home`, `End` or a letter move it, and the list
opens scrolled to the chosen one. The border stays still while the rows
move under it, and the list stays as wide as its longest option rather
than the window.

Because the layer sits above the app root, the list inherits none of the
scoped values of the tree that opened it, and it would come out light
inside a dark-themed panel. `Select` needs no placeholder for this: the
entry is anchored to the trigger, and the layer falls back to the anchor
for the theme, the text style and the content colour. That is the same
defect the overlay tier hit, found by opening the page rather than by
any spec.

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
