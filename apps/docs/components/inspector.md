---
description: 'Property inspector: sections that fold, label and value rows, and UnitField, a number with a unit that is typed, stepped or scrubbed, with a mixed state for a selection whose values differ.'
---

# Property inspector

An editor shows what is chosen in a panel beside the canvas, and that
panel is made of the same few things in every editor: sections that
fold, rows of a label and a value, and numbers with units that people
type, nudge with the arrows and drag. When several things are chosen,
a field whose values differ says so rather than showing one of them.

`gesso-components` has those pieces. They compose rather than
configure: an inspector is a column of `InspectorSection`s, each holding
`InspectorRow`s, each holding whatever control the property needs, a
`UnitField` usually.

<LiveExample id="inspector" height="360" />

Choose **Both**: Height says Mixed, because the two rectangles differ,
and Width does not, because they agree. Drag a field's letter
sideways, or focus it and press Up: each rectangle moves from its own
height.

<<< @/src/examples/InspectorExample.tsx#inspector

## UnitField

A number with a unit, as an inspector shows one: a short label at its
start, the value, the unit at its end.

- **Typed.** A number, or a number and a unit it knows: `2 in` in a
  field in mm is 50.8. Enter or leaving the field commits it; Escape
  puts back what it was. Text that is not a quantity goes back too, and
  nothing is reported.
- **Stepped.** Up and Down move it by `step`, ten times that with
  Shift, a tenth with Alt.
- **Scrubbed.** A drag along the label moves it a step every
  `scrubPixels`, with the same Shift and Alt. The value follows live
  (`onChange`) and is committed once, on release (`onCommit`), so a
  scrub is one undo step.

| Prop          | Type                               | Default        | What it does                                                                           |
| ------------- | ---------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `value`       | `number`                           | `0`            | The value, in `unit`. Ignored while `mixed`.                                           |
| `mixed`       | `boolean`                          | `false`        | The chosen things differ. Shows `Mixed` until a value is typed, stepped or scrubbed.   |
| `label`       | `string`                           | `''`           | The name a screen reader says, and what is drawn at the start unless `short` is given. |
| `short`       | `string`                           | none           | Drawn at the start instead: `X`, `W`, `°`. The scrub handle.                           |
| `unit`        | `string`                           | none           | The unit, drawn after the value and said with it.                                      |
| `units`       | `Record<string, number>`           | none           | Other units a value may be typed in, as how many of `unit` one of each is.             |
| `min`, `max`  | `number`                           | unbounded      | What a typed, stepped or scrubbed value is kept within.                                |
| `step`        | `number`                           | `1`            | What an arrow or a scrub step moves it by.                                             |
| `precision`   | `number`                           | up to 4 places | Decimal places shown. Given, trailing zeros stay.                                      |
| `scrubPixels` | `number`                           | `2`            | Pixels of drag per step.                                                               |
| `disabled`    | `boolean`                          | `false`        | Refuses typing, steps and scrubs.                                                      |
| `onChange`    | `(value) => void`                  | none           | A value still changing: each step of a scrub.                                          |
| `onCommit`    | `(value) => void`                  | none           | A value settled: entered, left, released, stepped. One undo step each.                 |
| `onNudge`     | `(delta, 'live' \| 'end') => void` | none           | Given this, arrows and scrubs report how far they moved instead of a value.            |

### Mixed values and nudges

`sharedValue(values)` is the value several chosen things share, or
`mixed`:

```ts
sharedValue([300, 300]); // { value: 300, mixed: false }
sharedValue([200, 120]); // { value: 200, mixed: true }
```

Hand `mixed` to the field and it shows `Mixed`. Typing a value into a
mixed field sets every chosen thing to it, through `onCommit`. Arrows
and scrubs need something else: there is no one value to step from. Give
the field `onNudge` and it reports how far it moved instead, `live`
while a scrub is going and `end` when it is let go (an arrow is an
`end` straight away), and each thing moves from its own value.

`onNudge` is also the answer where values are formulas rather than
numbers. A width written `b/2` and scrubbed by 20 is `b/2+20`, which
only the application can write: it gets the 20.

### Keyboard

| Key                  | What it does                           |
| -------------------- | -------------------------------------- |
| Up, Down             | One step up or down, committed         |
| Shift+Up, Shift+Down | Ten steps                              |
| Alt+Up, Alt+Down     | A tenth of a step                      |
| Enter                | Commits what was typed                 |
| Escape               | Puts back what was there, while typing |

The scrub handle is for the pointer and is not a tab stop: the arrows
do the same from the field.

### Semantics

| What        | Value                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Role        | `spinbutton`                                                           |
| Name        | `label`                                                                |
| Value       | `valueNow` the number; `valueText` the number and the unit, or `Mixed` |
| Description | `In mm` for its unit, and `Mixed values` while mixed                   |
| Range       | `min` and `max`                                                        |

## InspectorSection

A heading that folds the rows under it. The heading is a button that
says `expanded` or `collapsed`; Enter and Space fold it as a click does.
A folded section's rows are not in the tree at all, so they cost no
layout and say nothing to a screen reader.

| Prop           | Type                      | Default | What it does                                              |
| -------------- | ------------------------- | ------- | --------------------------------------------------------- |
| `title`        | `string`                  | `''`    | The heading, and the fold button's name.                  |
| `open`         | `boolean`                 | none    | Whether it is open. Omit to let the section keep its own. |
| `defaultOpen`  | `boolean`                 | `true`  | Open at first, when it keeps its own.                     |
| `onOpenChange` | `(open: boolean) => void` | none    | It was folded or opened.                                  |
| `actions`      | `UiChild`                 | none    | Controls at the end of the heading, never folded away.    |
| `children`     | `UiChild`                 | none    | The rows.                                                 |

## InspectorRow

A label and its value. The label is in a column of its own, `labelWidth`
wide (72 by default), so the values of a section line up whatever their
labels say. A row holds one control or several side by side: x and y,
width and height, each a `UnitField` with its own `short` label and
`flexGrow` so they share the row.

| Prop         | Type      | Default | What it does                                              |
| ------------ | --------- | ------- | --------------------------------------------------------- |
| `label`      | `string`  | `''`    | What the row is. Empty for controls that name themselves. |
| `labelWidth` | `number`  | `72`    | The label column's width.                                 |
| `children`   | `UiChild` | none    | The control, or several side by side.                     |

## Next

[NumberInput](/components/number-input) is the form's number field,
with steppers and no unit. The [canvas editing kit](/interaction/canvas-editing)
is the canvas an inspector usually sits beside.
