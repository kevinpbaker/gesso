---
description: 'RadioGroup: one choice from a few, as a single tab stop whose arrows move the choice, with its props, keyboard map and semantics.'
---

# RadioGroup

One choice from a few. The group owns the value and draws the options,
rather than each radio hunting for the group it belongs to: a component
cannot read another component's state, and a value passed down through
props is the framework's existing answer.

Reach for it when the options are exclusive, few, and worth seeing all at
once. Past five or six, a `Select` costs less room; when the options are
independent rather than exclusive, they are
[checkboxes](/components/checkbox).

<LiveExample id="radiogroup" height="320" />

<<< @/src/examples/RadioGroupExample.tsx#radiogroup

Click either group and use the arrows. The whole group is one tab stop
and the arrows move the choice inside it, wrapping at the ends and
stepping over the option marked `disabled`. Delivery is controlled by a
handler that declines the courier, so the choice does not move to it.
Billing period was given `defaultValue`, and lays itself out across
rather than down.

## Props

| Prop           | Type                      | Default    | What it does                                                                               |
| -------------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `options`      | `readonly RadioOption[]`  | required   | The choices, in order. Each is `{ value, label, disabled? }`.                              |
| `value`        | `string`                  | none       | The chosen value, when the application owns it. Supplying this makes the group controlled. |
| `defaultValue` | `string`                  | none       | The starting choice, when the group owns it.                                               |
| `onChange`     | `(value: string) => void` | none       | Called with the value the group would take, on a click and on a bound key.                 |
| `label`        | `string`                  | `''`       | The group's accessible name. It is not drawn: see below.                                   |
| `disabled`     | `boolean`                 | `false`    | Refuses clicks and keys for the whole group, and marks the subtree unavailable.            |
| `invalid`      | `boolean`                 | `false`    | Adds the `invalid` state to the group.                                                     |
| `required`     | `boolean`                 | `false`    | Adds the `required` state to the group.                                                    |
| `direction`    | `'row' \| 'column'`       | `'column'` | How the options stack. The keyboard works the same either way.                             |
| `ref`          | `UiNodeRef`               | none       | Receives the node that is the group, for focusing it or anchoring something to it.         |

`options` is the one required prop in the library's input tier, because a
group with no options is not a control. Values are strings; a form whose
options are keyed by something else maps them at that boundary, which is
where a mapping belongs anyway.

Supplying neither `value` nor `defaultValue` leaves the group
self-managing with nothing chosen. Supplying both throws, naming the
component and both props.

Every prop takes a plain value or an Observable of one, including
`options`: a group whose choices arrive from a request is an Observable
of an array, and the rows are rebuilt when it emits. The layout props on
[the library page](/components/) apply here too.

### The label is not drawn

`label` is the accessible name and nothing else. Unlike a checkbox, which
draws its label beside the box, a radio group leaves the visible caption
to you, because a group heading is part of the surrounding form's
typography rather than part of the control. Draw a `<text>` above the
group and pass the same string as `label`, which is what the example
does.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the choice, and the group shows it.
<RadioGroup label="Delivery" options={DELIVERY} value={method} onChange={next => (method.value = next)} />

// Uncontrolled: the group owns the choice, and reports it if asked.
<RadioGroup label="Delivery" options={DELIVERY} defaultValue="standard" onChange={next => save(next)} />
```

The controlled form is what lets the application refuse a choice. Every
arrow and every click goes to `onChange` first, and the group shows only
what comes back, so a handler can write a note instead of a value. The
spec beside the example drives that with the keyboard and checks the
choice stayed put.

## Keyboard

The group is a single tab stop and the options are not tab stops
themselves, so Tab moves past the whole group rather than through it.
Inside, the arrows move the choice: selection follows focus, which is the
listbox pattern ARIA allows and which needs no per-option focus juggling.

| Key                       | What it does                                         |
| ------------------------- | ---------------------------------------------------- |
| `ArrowDown`, `ArrowRight` | Chooses the next option, wrapping past the last      |
| `ArrowUp`, `ArrowLeft`    | Chooses the previous option, wrapping past the first |
| `Home`                    | Chooses the first option                             |
| `End`                     | Chooses the last option                              |
| `Tab`                     | Not bound: focus leaves the group                    |

Both axes are bound whichever way the group is laid out, so a reader who
reaches for the arrow that matches the layout finds it. Every binding
skips options marked `disabled`, and Home and End go to the first and
last option that can actually be chosen rather than the first and last
drawn. A disabled group answers no key at all.

The focus ring is drawn on the group, because the group is what holds the
keyboard. Which option is chosen is said by that option's own fill, and
its outline turns to the accent colour while the group has focus, so a
reader can see where the arrows will land.

## Semantics

| What     | Value                                                                           |
| -------- | ------------------------------------------------------------------------------- |
| Role     | `radiogroup` on the container, `radio` on each option                           |
| Name     | The group's is `label`; each option's is its own `label`                        |
| Value    | No `valueNow` on the group: the chosen option carries `checked` instead         |
| States   | `invalid` and `required` on the group, `checked` on the chosen option           |
| Disabled | `disabled` on the group is on its record and inherited by every option under it |

An option's own `disabled` is a different thing from the group's: it takes
that option out of the arrow order and refuses its click, and it greys the
option's text, but it is not on the option's record. The group is where an
assistive technology learns that the control as a whole is unavailable.

## Next

[Checkbox](/components/checkbox) is for options that are not exclusive,
and [Switch](/components/switch) is for a setting that takes effect as it
changes.
