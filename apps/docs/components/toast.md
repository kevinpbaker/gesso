---
description: 'Toast: a transient notice drawn over the app, announced through its role rather than by taking focus.'
---

# Toast

A message that announces itself and goes away. Reach for it to confirm
something that has already happened, or to report something that
failed: the note saved, the upload finished, the server refused. It is
for a notice the user does not have to answer.

When the user does have to answer, that is a dialog, because a toast
takes no focus and cannot hold a decision. When the message belongs to
one control rather than to the screen, put it beside that control:
`invalid` on a field says more than a notice in the corner. When the
label only needs to appear on a hover, that is a
[tooltip](/components/tooltip).

<LiveExample id="toast" height="260" />

<<< @/src/examples/ToastExample.tsx#toast

Press either button. The first notice closes itself after three
seconds; the second is an error, has no duration, and stays until the
✕ is pressed.

## Props

| Prop          | Type                | Default  | What it does                                                               |
| ------------- | ------------------- | -------- | -------------------------------------------------------------------------- |
| `open`        | `boolean`           | none     | Whether the notice is up. The application owns this.                       |
| `onClose`     | `() => void`        | none     | Called when the timer expires or the ✕ is pressed. Write `open` back here. |
| `message`     | `string`            | `''`     | The text, and the accessible name of the box.                              |
| `tone`        | `'info' \| 'error'` | `'info'` | `info` waits its turn; `error` interrupts. See the semantics below.        |
| `duration`    | `number`            | `4000`   | Milliseconds before it dismisses itself. `0` keeps it up.                  |
| `dismissible` | `boolean`           | `true`   | Shows the ✕ that closes it.                                                |

Every prop takes a plain value or an Observable of one. `Toast` takes
none of the shared layout props, because it is not placed in your
layout: see below.

There is no uncontrolled form. A toast has nothing to own: it is up
because the application put it up.

`tone` and `duration` are read when the toast opens, and so is the
accessible name. The text drawn follows the `message` cell, so a
message that changes while a toast is up changes what is on screen but
not what was announced; raise a new toast instead of editing an open
one. The spec beside the example measures both halves of that.

## Where it is drawn

A `Toast` returns a zero-size, invisible placeholder where you declare
it, and its box is drawn in the overlay layer the runtime mounts above
the app root, pinned 24 pixels off the bottom left corner of the
viewport. Nothing in your layout moves when one opens, and nothing in
your layout decides where it goes.

Declare it inside the tree whose appearance it should match. The
placeholder is what the overlay layer re-provides the theme, text style
and content colour from, which is what keeps a toast raised from a dark
panel dark.

There is no queue and no stack. Two toasts open at once are two entries
pinned to the same corner, drawn on top of each other, so raise one at
a time: the example holds two `Toast` elements and one cell each, and
opening either closes the other.

## Keyboard

`Toast` binds no keys and takes no focus. A notification that stole the
keyboard from what the user was doing would be a bug, and Escape is not
bound, so a toast is not something a reader has to dismiss before
carrying on.

| Key      | What it does                                                     |
| -------- | ---------------------------------------------------------------- |
| `Escape` | Not bound. It reaches whatever else is listening                 |
| `Tab`    | Reaches the ✕ inside the toast, after the controls on the screen |

The ✕ is an ordinary button, so it is in the tab order like any other,
and because the overlay layer sits above the app root it comes after
the screen's own controls rather than in the middle of them. With
`dismissible={false}` there is no button and no tab stop, which is only
safe alongside a duration that closes it.

## Semantics

| What    | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Role    | `status` when `tone` is `info`, `alert` when it is `error`       |
| Name    | `message`, read once when the toast opens                        |
| States  | None                                                             |
| Focus   | Never taken. A toast is read through its role, not visited       |
| Dismiss | The ✕ is a `button` named `Dismiss`, present while `dismissible` |

The two roles are the whole reason `tone` exists. An `alert` interrupts
whatever an assistive technology was reading; a `status` waits its
turn. Choose by whether the user needs to know now, not by whether the
message is bad news.

`error` also draws the border and the text in the `danger` token, so
the tone is carried visually and semantically from the same prop. No
other colour is named: the box is `surface` with a `border` border.

## What has been checked

The roles, the name, the auto-dismiss and its timer, `duration: 0`, the
dismiss button, the tab order and the corner it is pinned to are
asserted in the spec beside the example, driving the real runtime with
a fake canvas. No screen reader has been sat in front of the `alert`
and `status` records, which is a different question from whether they
are emitted.

## Next

[Tooltip](/components/tooltip) is the label a reader asks for by
hovering, and [the library overview](/components/) covers the contract
every control here shares.
