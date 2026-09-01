---
description: 'A number typed or stepped: the props, the two step buttons, what happens to text that is not a number yet, and what it announces.'
---

# NumberInput

`NumberInput` is a quantity someone types, with two buttons and the
arrow keys for stepping it. Reach for it when the digits are the point,
a guest count or a price or a font size, and for
[Slider](/components/slider) when the range matters more than the
number. It is a field, so everything
[TextInput](/components/text-input) says about the caret, the selection
and the clipboard is true here too.

<LiveExample id="numberinput" height="280" />

Guests is controlled, capped at 8, and the line beside it is derived
from the value. Tip is uncontrolled and steps by a half. Type a letter
into either and watch what is not reported; then move focus away and
watch the field tidy itself up.

<<< @/src/examples/NumberInputExample.tsx#numbers

## Props

| Prop           | Type                      | Default   | What it does                                                                                                           |
| -------------- | ------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `value`        | `number`                  | none      | The value to show. Supplying it makes the field controlled.                                                            |
| `defaultValue` | `number`                  | `0`       | The value to start at, for a field that owns its own. Supplying both throws, naming the component.                     |
| `onChange`     | `(value: number) => void` | none      | Called with a value already clamped to the range and snapped to the step. Text that is not a number reports nothing.   |
| `min`          | `number`                  | unbounded | The bottom of the range. Left out, nothing clamps downwards.                                                           |
| `max`          | `number`                  | unbounded | The top of the range. Left out, nothing clamps upwards.                                                                |
| `step`         | `number`                  | `1`       | What an arrow key and each button move by, and the grid a value is snapped to, counted from `min`.                     |
| `label`        | `string`                  | `''`      | Drawn above the field and used as its accessible name.                                                                 |
| `error`        | `string`                  | `''`      | A non-empty string marks the field `invalid`, turns its border to the `danger` token, and draws this message under it. |
| `disabled`     | `boolean`                 | `false`   | Refuses focus, ignores the arrows, and disables both buttons.                                                          |
| `required`     | `boolean`                 | `false`   | Announced as `required`. It validates nothing on its own; the message is `error`'s job.                                |
| `ref`          | `UiNodeRef`               | none      | Receives the node that _is_ the field, rather than the column or the row around it.                                    |

A range with both ends given is what makes `step` a grid: values are
snapped to a multiple of the step counted from `min`, and rounded to
the step's own number of decimal places, so a step of `0.5` cannot
leave `2.5000000000000004` in the field. With an open end there is
nothing to count from, and a value moves by whole steps from wherever
it started instead.

### Layout and modifiers

The layout props every control in the library takes are here too, and
land on the component's own root: `width`, `height`, `minWidth`,
`minHeight`, `maxWidth`, `maxHeight`, `margin` and its four sides,
`flex`, `flexGrow`, `flexShrink`, `flexBasis`, `selfX` and `selfY`. The
field inside grows to fill the row beside the two buttons and never
goes below 80 pixels wide. There are no colour props: the field, the
buttons and the message all read the theme.

`rootModifiers` attaches modifiers to the element that _is_ the field,
which is what a `measure` or a motion needs in order to see the real
geometry. Declare the value once at module scope, because a modifier's
arguments are compared by identity and a fresh one detaches and
re-attaches every frame.

## Controlled and uncontrolled

```tsx
<NumberInput label="Guests" value={guests} onChange={next => (guests.value = next)} />
<NumberInput label="Guests" defaultValue={2} />
```

Which of the two applies is decided once, when the component is built,
from whether `value` was supplied; passing both throws an error naming
the component. A controlled field handed no `onChange` does not move
until the application moves it, and the value it is written is shown as
it is: `min` and `max` bound what a person can produce with the
keyboard, the buttons or the text, not what the application can set. A
value written from outside the range is shown, and the first step from
there lands back inside it.

### The field holds text, the application holds a number

The two are not the same thing while someone is typing, and the
component keeps them apart on purpose. A half-written `-` or `1.` is
not a number yet, so:

- Every keystroke goes into the field's text.
- A number is reported only when the text parses and is not blank, and
  it is clamped and snapped before it goes out.
- Text that does not parse leaves the value alone, so a stray letter
  costs you nothing but the letter.
- When the field loses focus it commits what it is holding: the text
  becomes the value's own spelling again, which is what stops a field
  being left showing `2.50` or `12abc`. Text that is not a number at
  all commits as `0`, clamped into the range.

## Keyboard

The field is the tab stop. The two buttons are deliberately not
focusable: their job is the arrows' job, and nobody should have to walk
past two buttons to leave a number field.

| Key             | What it does                                                             |
| --------------- | ------------------------------------------------------------------------ |
| Up              | One step up, clamped to `max`                                            |
| Down            | One step down, clamped to `min`                                          |
| Everything else | The field's own: the caret, selection, deletion and undo of a text field |

Up and Down are taken by the component, so they step the value rather
than moving the caret between lines. Every other key in
[TextInput's table](/components/text-input#keyboard) behaves here
exactly as it does there, including Home, End, the word modifier, and
select-all.

## Semantics

The field is the node in the semantics tree; the column and the row are
not. It emits:

- **`role`**: `spinbutton`.
- **`label`**: the `label` prop, which is the string drawn above the
  field as well.
- **`valueNow`**, **`valueMin`**, **`valueMax`**: the number, and the
  range. With no `min` or `max` given, the range is reported as
  negative and positive infinity.
- **`valueText`**: the text in the field, which is why it can be
  `"2.50"` while `valueNow` is `2.5`. That is the truth about what a
  person is looking at, and it is the difference between the two that
  a blur resolves.
- **`states`**: `invalid` while `error` is a non-empty string, and
  `required` while `required` is set.

The two step buttons carry `role: 'button'` and the names `Increase`
and `Decrease`, so they are announced and clickable while staying out
of the tab order. The message under the field carries its own text into
the tree.

## Next

[Slider](/components/slider) is the same number without the digits, and
[TextInput](/components/text-input) is the field this one is built
from.
