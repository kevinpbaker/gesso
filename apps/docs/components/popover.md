---
description: 'Popover: a non-modal panel anchored to its trigger, with its props, light dismiss, where focus goes, and what the trigger and the panel announce.'
---

# Popover

A panel anchored to the control that opened it, which the rest of the
page stays usable around. Reach for it for a filter panel, a short form
beside the thing it edits, or a note that is too long and too
interactive for a [tooltip](/components/tooltip).

It is a dialog in ARIA's sense, but not a modal one. It takes focus when
it opens; it does not trap it, it puts nothing over the page, and a
press anywhere outside it closes it and still lands on whatever was
pressed. When the next thing the user does has to be answering it, that
is a [dialog](/components/dialog). When it is a list of commands, it is a
[menu](/components/menu).

<LiveExample id="popover" height="300" />

<<< @/src/examples/PopoverExample.tsx#popover

Press `Filters`: the panel opens under it with the caret in the field.
Type, press Tab to walk the checkbox and Apply, and Apply closes it with
the line underneath updated. Press `?` for a note on its end side, and
press anywhere else to put it away: the press is not swallowed, so
pressing `?` while the filters are open closes them and opens the note
in one press.

## Props

| Prop           | Type                             | Default     | What it does                                                                                     |
| -------------- | -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `open`         | `boolean`                        | none        | Whether it is open, when the application owns that. Supplying it makes the popover controlled.   |
| `defaultOpen`  | `boolean`                        | none        | Whether it starts open, for a popover that owns its own state. Supplying both throws.            |
| `onOpenChange` | `(open: boolean) => void`        | none        | Called with what the popover asks to become: `true` on an anchor press, `false` on every close.  |
| `anchor`       | `UiNode \| null`                 | `null`      | The trigger it opens beside, and whose presses toggle it. Pass a cell, as for `Menu`.            |
| `content`      | `UiChild`                        | empty row   | What the panel holds. Read when it opens.                                                        |
| `label`        | `string`                         | `'Popover'` | The panel's accessible name. Not drawn.                                                          |
| `description`  | `string`                         | `''`        | Read after the name. Not drawn.                                                                  |
| `side`         | `PopoverSide`                    | `'bottom'`  | `bottom`, `top`, `start` or `end`. Read when it opens.                                           |
| `align`        | `PopoverAlign`                   | `'start'`   | `start`, `center` or `end`: which edge of the anchor it lines up with. Read when it opens.       |
| `offset`       | `number`                         | `6`         | The gap between the anchor and the panel, in pixels.                                             |
| `initialFocus` | `UiNode \| null`                 | none        | The node inside the content to focus as it opens, as a cell its `ref` writes.                    |
| `width`        | `number`                         | none        | Its width. Without one it is as wide as its content, up to 360 pixels, and wraps past that.      |
| `disabled`     | `boolean`                        | `false`     | Nothing opens it, and an open one closes. Disable the trigger as well, so it says so.            |
| `panelRef`     | `(node: UiNode \| null) => void` | none        | Receives the panel's node while it is open, and `null` when it closes: the trigger's `controls`. |

`Popover` does not take the shared layout props, and has no
`rootModifiers`. Nothing is drawn where it is declared: it leaves an
invisible placeholder there, for the theme the panel inherits, and draws
the panel in the overlay layer.

## Controlled and uncontrolled

Given `open`, the application owns the state. Every way the popover
closes, Escape, a press outside, Tab out of it, its anchor pressed
again, is a request through `onOpenChange(false)`, and an application
that does not write the value back keeps it open: that is how a form
with unsaved changes refuses to be put away. A press on the anchor of a
closed popover is `onOpenChange(true)`, which is likewise only a request.

Given `defaultOpen`, it keeps its own state in a cell, and
`onOpenChange` is still called on every change for an application that
wants to hear about them.

## The anchor is the trigger

The anchor is a node, handed over through a `ref` written into a cell,
the same as [Menu's](/components/menu#the-anchor-has-to-be-a-cell) and
for the same reason: a component body runs before the ref fires, so a
plain field would hand the popover the `null` it held then, and a popover
with no anchor opens in the window's corner.

A popover listens to its anchor's clicks itself, which is where it parts
company with `Menu`. A click is what the pointer, Enter and Space on a
focused button, and an assistive technology's press all send, so one
listener answers all three. That is what lets `defaultOpen` mean
anything, since a popover that owned its state and could not be opened
would be no use, and it is why the trigger in the example has no
`onClick`. A trigger that also wrote `open` from its own `onClick` would
toggle the popover twice in one press, which is to say not at all.

The node and not a wrapper around a child, as `Tooltip` takes, because
the trigger's half of the semantics belongs on the button a screen
reader is on. A popover cannot write properties onto a node it did not
render, so the trigger says them itself, from cells it already has:

```tsx
<button
  ref={node => (anchor.value = node)}
  label="Filters"
  states={open.pipe(map(on => [on ? 'expanded' : 'collapsed']))}
  controls={panel}>
  …
</button>
<Popover open={open} anchor={anchor} panelRef={node => (panel.value = node)} … />
```

The library's own `Button` takes neither `states` nor `controls` yet, so
a trigger that announces its popover is a `<button>` element for now.

## Placement

The panel is placed by the layout engine, as every anchored overlay is.
It takes the side asked for, flips to the opposite side when it would
overflow the window there and the other side has more room, and shifts
along the anchor to stay on screen. A panel taller than the room on its
side is cut to that room and its content scrolls inside the border. It
follows its anchor when the page scrolls, and the wheel does not close
it: a form half filled in should not vanish because the page moved.

`start` and `end` are logical. Under `textDirection="rtl"` the start
side is the anchor's right and the end side its left, and `align="start"`
on the top or bottom lines the panel up with the anchor's right edge.
The direction is read from the anchor as the popover opens, and the
panel's own content lays out in it too.

## Keyboard

| Key         | What it does                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `Escape`    | Asks to close, and once closed puts focus back on the anchor                                       |
| `Tab`       | The next control in the panel; after the last, leaves to what follows the anchor and asks to close |
| `Shift+Tab` | The previous control in the panel; before the first, back to the anchor, and asks to close         |

Opening moves focus into the panel: to `initialFocus` when it names a
node inside that can take focus, and to the panel itself otherwise,
which holds focus without becoming a tab stop, as a dialog's body does.
Escape is heard there.

**Leaving with Tab closes it.** The APG's guidance for a non-modal
dialog allows either keeping it open or closing it as focus leaves. This
closes, because the panel is drawn in the overlay layer and not beside
its anchor in the page's order, so a popover left open behind the focus
could only be reached again through the anchor, whose press would close
it. Tab and Shift+Tab are handled by the panel rather than by the focus
manager for the same reason: the manager walks the tree in order, and
from the overlay layer Tab off the last control would wrap to the top of
the page.

The page behind stays usable from the keyboard too, which is the point
of a non-modal popover. Inside a modal [dialog](/components/dialog) it
is the one exception: the dialog confines focus to itself, and the
panel, drawn in the overlay layer, is outside it, so there the popover
takes a focus scope of its own, as a menu opened in a dialog does.
Escape then closes the popover and not the dialog.

## Light dismiss

There is no backdrop. A press outside the panel is heard on its way to
whatever was pressed and closes the popover as it goes, so the button
pressed is pressed, and focus goes where that press puts it rather than
back to the anchor. Nothing dims the page.

Two things outside the panel's own subtree count as inside it. The
anchor, because its press toggles; and every overlay opened after the
popover, because those are drawn as entries of their own in the overlay
layer: a [select](/components/select)'s list, a nested popover, a dialog
the panel opened. Choosing an option in a select inside a popover leaves
the popover open. A press in an outer popover closes a nested one.

## Semantics

| What    | Value                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------- |
| Panel   | `dialog`, named by `label`, with `description` when given, and no `modal` state                 |
| Trigger | Whatever the caller gives it: `expanded` or `collapsed`, and `controls` set to the panel's node |
| Content | Its own records, under the panel's                                                              |

## What this page has checked

The behaviour above is asserted by two specs, both driving the real
runtime with a fake canvas and pressing through hit testing as a pointer
does: the component's own, and the one beside this example. They cover
opening from the anchor by pointer and by Enter, the controlled form
refusing a close, the uncontrolled form toggling itself, both forms
together throwing, each placement side, the flip above an anchor at the
window's bottom, the clamp beside one at its right edge, long content
wrapping at 360 pixels, focus on open with and without `initialFocus`,
Escape back to the anchor, Tab walking the panel and leaving it in both
directions, a press outside closing it while reaching what was pressed,
the wheel not closing it, a select and a nested popover inside it, the
trigger's `expanded` and `controls`, `disabled`, right-to-left placement
and content, and a popover inside a modal dialog.

What they cannot check is anything drawn. The panel's look, its border
and radius in each theme, and the ring on the anchor when focus comes
back have not been opened in a browser at all yet, on either renderer.
No screen reader has been sat in front of the semantics above, so
whether a reader announces the panel as a dialog as focus arrives, and
reads the trigger's state, is unverified.

## Next

[Menu](/components/menu) is the same overlay machinery for a list of
commands, with the keyboard trapped, and [Dialog](/components/dialog) is
the modal one.
