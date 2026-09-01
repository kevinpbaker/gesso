---
description: "Switch: an on and off control with the checkbox's behaviour and the switch's role, plus its props, keyboard map and semantics."
---

# Switch

A control that reads as on or off. It is a [checkbox](/components/checkbox)
with a different role and a different drawing, and the difference is what
a screen reader says: on and off for a switch, checked and unchecked for
a checkbox.

Reach for it when the change takes effect immediately, the way a setting
does. A checkbox belongs in a form that is submitted later; a switch
belongs beside the thing it turns on. The library gives the two the same
behaviour on purpose, so the choice between them is about what the
control means and never about what it can do.

<LiveExample id="switch" height="240" />

<<< @/src/examples/SwitchExample.tsx#switch

Airplane mode and Wi-Fi are both controlled, and one rule connects them:
turning airplane mode on writes Wi-Fi off, and the Wi-Fi switch follows
without being touched. Trying to turn Wi-Fi back on while airplane mode
is on reaches a handler that declines, and the switch stays where it is.
Bluetooth was given `defaultChecked`, so it owns its value and the
summary line never mentions it.

## Props

| Prop             | Type                         | Default | What it does                                                                         |
| ---------------- | ---------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `checked`        | `boolean`                    | none    | The value, when the application owns it. Supplying this makes the switch controlled. |
| `defaultChecked` | `boolean`                    | none    | The starting value, when the switch owns it.                                         |
| `onChange`       | `(checked: boolean) => void` | none    | Called with the value the switch would take, on a click and on a bound key.          |
| `label`          | `string`                     | `''`    | Drawn beside the track, and used as the accessible name.                             |
| `disabled`       | `boolean`                    | `false` | Refuses clicks and keys, greys the label, and marks the subtree unavailable.         |
| `ref`            | `UiNodeRef`                  | none    | Receives the node that is the control, for focusing it or anchoring something to it. |

That is the whole of it. There is no `invalid` and no `required`, unlike
the checkbox: a setting that takes effect as you throw it has nothing to
validate against.

Supplying neither `checked` nor `defaultChecked` leaves the switch
self-managing and starting off. Supplying both throws, naming the
component and both props.

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

## Controlled and uncontrolled

```tsx
// Controlled: the application owns the value, and the switch shows it.
<Switch label="Notifications" checked={notify} onChange={next => (notify.value = next)} />

// Uncontrolled: the switch owns the value, and reports changes if asked.
<Switch label="Notifications" defaultChecked onChange={next => save(next)} />
```

A setting is usually the controlled case, because something else in the
application reads it: the switch is a view of a value in a store, not the
place the value lives. The uncontrolled form fits a switch whose value
never leaves the screen it is on.

The controlled form is also what makes a rule between two switches
expressible. In the example above, one handler writes both values, and
the other refuses a value it does not accept. A control that moved itself
first and told the application afterwards could not say either thing.

## Keyboard

The switch is one tab stop, and its keymap is the checkbox's. Both
bindings toggle, and both consume the event.

| Key     | What it does                                   |
| ------- | ---------------------------------------------- |
| `Space` | Toggles the switch                             |
| `Enter` | Toggles the switch                             |
| `Tab`   | Not bound: focus moves on as it normally would |

A disabled switch takes neither. The arrow keys are not bound, so they
pass through to whatever is listening above.

## Semantics

| What     | Value                                                                     |
| -------- | ------------------------------------------------------------------------- |
| Role     | `switch`, on the row that takes focus                                     |
| Name     | `label`                                                                   |
| Value    | No `valueNow`: on and off are said with the `checked` state               |
| States   | `checked` while on, and nothing else                                      |
| Disabled | `disabled` is carried on the record, and inherited by everything under it |

The spec beside the example asserts both halves of the role claim: three
nodes answer to `switch`, and nothing on the screen answers to
`checkbox`.

## Next

[Checkbox](/components/checkbox) is the same behaviour for a form, and
[RadioGroup](/components/radio-group) is for a choice of one from
several.
