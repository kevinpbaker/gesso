---
description: 'Dialog: a window that takes the keyboard, with its props, the focus trap, Escape, and the overlay layer it draws into.'
---

# Dialog

A window that takes over the keyboard. Reach for it when the next thing
the user does has to be answering this: confirming a deletion,
correcting a field before a form can be submitted, choosing between two
branches nothing else can proceed without.

Modal in the only sense that matters here: while it is open, focus
cannot leave it, and closing hands the keyboard back to whatever opened
it. Both halves are the runtime's, through `FocusService.trap` and
`FocusService.releaseTrap`; the component is the shape and the
lifecycle.

If the answer is not urgent, do not use one. Something that only needs
to sit beside the thing that opened it is a [menu](/components/menu) or
an anchored entry of your own through `useOverlay`, and something that
merely reports what happened does not need the keyboard at all.

<LiveExample id="dialog" height="300" />

<<< @/src/examples/DialogExample.tsx#dialog

Open either dialog and press Tab a few times: the ring stays on the
buttons inside. `Delete this note?` is dismissible, so Escape closes it
and the button that opened it takes the keyboard back. `Uploading` sets
`dismissible={false}`, so Escape does nothing there and there is no
backdrop to press.

## Props

| Prop          | Type         | Default   | What it does                                                                           |
| ------------- | ------------ | --------- | -------------------------------------------------------------------------------------- |
| `open`        | `boolean`    | none      | Whether the dialog is on screen. The application owns it; a dialog never opens itself. |
| `onClose`     | `() => void` | none      | Called when the dialog closes, whatever closed it.                                     |
| `title`       | `string`     | `''`      | Drawn at the top, and used as the accessible name. An empty title draws no heading.    |
| `description` | `string`     | `''`      | Drawn under the title, and carried on the record as the description.                   |
| `content`     | `UiChild`    | empty row | The body: buttons, fields, whatever the dialog is for.                                 |
| `dismissible` | `boolean`    | `true`    | Whether Escape and a press outside close it. See below; it is more than one thing.     |
| `width`       | `number`     | `360`     | The dialog's width in logical pixels. Read once, when it opens.                        |

`Dialog` does not take the shared layout props the rest of the library
takes, and it has no `rootModifiers`. Nothing is drawn where it is
declared, so there is no root to place or decorate: `width` is the only
size it answers to, and the layer decides the rest.

`content` is read once, when the dialog opens, so a body that changes
while the dialog is up is one element with an Observable inside it,
never an Observable that resolves to an element. `title` and
`description` are bound rather than read, so both follow a cell.

`onClose` runs once per close, whatever closed the dialog: Escape, a
press on the backdrop, a write of `false` into `open`, or the component
unmounting while the dialog is up. The report comes from the overlay
entry, which is the one point all of those paths pass through, so the
count does not depend on which of them was taken.

## Controlled and uncontrolled

There is no uncontrolled form. A dialog has no `defaultOpen`, because
the reason a dialog is open is never the dialog's: it belongs to
whatever decided the user has to answer something.

```tsx
// The application owns the reason it is open.
<Dialog open={confirming} title="Delete this note?" onClose={() => (confirming.value = false)} />
```

`open` is followed rather than obeyed once: the component subscribes to
it, so writing `true` opens the dialog and writing `false` closes it,
from anywhere. What `onClose` reports is that the dialog has gone; if
nothing writes `open` back to `false` in response, the next write of
`true` is ignored because the entry is already gone and the cell still
says it is open. Keep the cell and the dialog in step, as the example
does.

## `dismissible` is two things at once

It decides whether Escape is bound, and it decides whether the entry
gets a backdrop. A dismissible dialog has a full-size backdrop
underneath it that closes it on a pointer press or a wheel, so nothing
behind it scrolls while it is up. A dialog with `dismissible={false}`
has no backdrop at all, which means a press outside it reaches whatever
is underneath rather than being swallowed.

The keyboard trap is not part of this. Both dialogs above trap focus,
and both are modal; `dismissible` only decides how a user is allowed to
back out.

## Keyboard

| Key         | What it does                                                             |
| ----------- | ------------------------------------------------------------------------ |
| `Escape`    | Closes the dialog, when `dismissible` is on. Bound on the dialog itself. |
| `Tab`       | The next focusable inside the dialog, wrapping at the end                |
| `Shift+Tab` | The previous one, wrapping at the start                                  |

Tab is not the dialog's binding: it is the focus manager walking the
trapped scope, which is why the ring cannot escape to the page
underneath and why nothing has to list the buttons inside.

Escape closes the topmost dialog and no other, and there is no overlay
stack anywhere in the framework making that true. The key is bound on
the dialog's own content, and focus is inside the innermost trap, so
the event never reaches a dialog underneath: nothing underneath is
focusable. `decisions/0024-overlays-tier.md` records that choice and the
registry it avoided.

## The overlay layer

A dialog draws nothing where it is written. It leaves an invisible,
zero-sized placeholder at that point in the tree and puts its content in
the overlay layer, an absolutely positioned box the runtime mounts above
the app root. That is what lets a dialog declared three components deep
sit in the middle of the window.

It is also why the placeholder exists. The layer is nowhere near the
tree that opened the dialog, so the content inherits none of that
tree's scoped values, and a dialog opened inside a dark-themed panel
would come out light. `Dialog` passes the placeholder as the entry's
`environment`, and the layer re-provides that node's `theme`,
`textStyle` and `contentColor` on the box holding the content. This was
a real defect, found by opening the page rather than by any spec, and
the decision record above is where it is written down.

The entry is centred on both axes and pinned to no edge, so the box the
layer gives it spans the whole viewport and the dialog sits in the
middle of it however tall the content turns out to be. Two consequences
are the caller's to keep modest: a dialog that grows after it opens
moves on both axes, and one taller than the viewport overflows top and
bottom rather than just the bottom.

The entrance fades and scales from 0.96 to 1 through `AnimationService`,
so it costs a repaint and no layout. Under reduced motion the animation
writes its end state and completes, and the dialog is simply present.

## Semantics

| What        | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| Role        | `dialog`, on the box holding the content                        |
| Name        | `title`                                                         |
| Description | `description`                                                   |
| States      | `modal`, always, for as long as the dialog is open              |
| Focus       | Trapped in the dialog while it is open, and restored on closing |

`modal` is unconditional rather than a prop, because there is no
non-modal form of this component: the trap is taken as the content
enters the tree and released when it leaves, including when the dialog
disappears because it unmounted rather than because it closed.

## What has been checked

Everything above is asserted by the spec beside the example, which
drives the real runtime with a fake canvas. What that does not cover is
drawing: the canvas above is Canvas2D, and Chrome and other Chromium
browsers are the extent of what any of this has been opened in. The
centred placement and the theme carried into the layer were checked by
hand on both renderers in the playground, and not on the single-thread
route.

## Next

[Menu](/components/menu) is the other overlay a keyboard can reach, and
[the library overview](/components/) has the contract every control here
is an instance of.
