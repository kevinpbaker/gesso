---
description: 'Checkbox: a box the user ticks, controlled or self-managing, with its props, keyboard map and semantics.'
---

# Checkbox

A box the user ticks. Reach for it when an option is independently on or
off, and for the one in a set of many that can each be chosen: a list of
permissions, a row of filters, the terms nobody reads. When the choice is
one of several, that is a [radio group](/components/radio-group); when
the option takes effect the moment it changes rather than when a form is
submitted, a [switch](/components/switch) says so more clearly.

The whole row is the control, so the label is part of the hit target and
part of the accessible name rather than a second thing to click.

<LiveExample id="checkbox" height="260" />

<<< @/src/examples/CheckboxExample.tsx#checkbox

Tab into the group and try it. The terms box is unticked and `required`,
so it is drawn with the `danger` border and announces `invalid` until it
is ticked. The updates box is controlled by a handler that refuses to
write while the terms are unticked, so clicking it does nothing at all,
which is the point. "Remember this device" is uncontrolled: it keeps its
own value, and the application never hears about it.

## Props

| Prop             | Type                         | Default | What it does                                                                            |
| ---------------- | ---------------------------- | ------- | --------------------------------------------------------------------------------------- |
| `checked`        | `boolean`                    | none    | The value, when the application owns it. Supplying this makes the box controlled.       |
| `defaultChecked` | `boolean`                    | none    | The starting value, when the box owns it. Supplying this makes the box self-managing.   |
| `onChange`       | `(checked: boolean) => void` | none    | Called with the value the box would take, on a click and on a bound key.                |
| `label`          | `string`                     | `''`    | Drawn beside the box, and used as the accessible name.                                  |
| `disabled`       | `boolean`                    | `false` | Refuses clicks and keys, greys the label, and marks the subtree unavailable.            |
| `invalid`        | `boolean`                    | `false` | Draws the box's border in `danger` and adds the `invalid` state.                        |
| `required`       | `boolean`                    | `false` | Adds the `required` state. It does not enforce anything: validity is the application's. |
| `ref`            | `UiNodeRef`                  | none    | Receives the node that is the control, for focusing it or anchoring something to it.    |

Neither `checked` nor `defaultChecked` has a default in the sense of a
value the component substitutes: supplying neither leaves the box
self-managing and starting unticked. Supplying both throws.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the value, and the box shows it.
<Checkbox label="Wrap lines" checked={wrap} onChange={next => (wrap.value = next)} />

// Uncontrolled: the box owns the value, and reports changes if asked.
<Checkbox label="Wrap lines" defaultChecked onChange={next => save(next)} />
```

The controlled form is the one to reach for, because it is the only one
where the value in the box and the value in your state cannot disagree.
It also lets the application decline: `onChange` fires, and if nothing
writes back then the box does not move. The example above does exactly
that, and the spec beside it proves the box stays unticked through a
click the handler declined.

The uncontrolled form is for a control whose value nothing else needs:
one `internalState` cell inside the component instead of one in your
store. It still calls `onChange`, so it is not a black box, but the
value lives and dies with the control.

## Keyboard

The row is one tab stop. Both bindings toggle, and both consume the
event, so nothing above the checkbox sees the key.

| Key     | What it does                                   |
| ------- | ---------------------------------------------- |
| `Space` | Toggles the box                                |
| `Enter` | Toggles the box                                |
| `Tab`   | Not bound: focus moves on as it normally would |

`Enter` toggles as well as `Space` because a checkbox here is a row
rather than a native input, and a reader who has just arrived on it with
the keyboard should not have to know which of the two this framework
chose. A disabled box takes neither.

## Semantics

| What     | Value                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Role     | `checkbox`, on the row that takes focus                                        |
| Name     | `label`                                                                        |
| Value    | No `valueNow`: a checkbox is on or off, and says so with `checked`             |
| States   | `checked` while ticked, `invalid` while `invalid`, `required` while `required` |
| Disabled | `disabled` is carried on the record, and inherited by everything under it      |

The states arrive as they change rather than being read once, so a box
the application ticks from elsewhere updates what an assistive
technology sees without anything re-rendering.

The label text inside the row has no record of its own. ARIA calls the
children of a checkbox presentational, and a screen reader that read both
the row and the text inside it would say everything twice.

## Next

[Switch](/components/switch) is the same control with a different role,
and [RadioGroup](/components/radio-group) is what to use when the options
are exclusive.
