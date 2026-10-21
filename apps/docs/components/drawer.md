---
description: 'Drawer: a panel that slides in from an edge of the window, modal or beside the page, with its props, keys, semantics and the motion it uses.'
---

# Drawer

A panel that slides in from an edge of the window. Reach for it when
what the user is about to do belongs beside the page rather than in
the middle of it: filters for a list, the details of a row, a form
that edits one thing on a screen still worth glancing at, navigation
on a phone.

When the next thing the user does has to be answering a question, that
is a [dialog](/components/dialog), which sits in the middle and asks
it. When the choice is a short list attached to a button, that is a
[menu](/components/menu). A drawer is the same lifecycle as a dialog
with a different shape: it draws into the overlay layer, carries the
theme of the tree it was declared in, and, when modal, keeps the
keyboard and gives it back. What it adds is the edge and the movement.

<LiveExample id="drawer" height="320" />

<<< @/src/examples/DrawerExample.tsx#drawer

Press Filters, then Tab a few times: the ring stays inside the drawer,
on the close button, the two checkboxes and Apply. Escape slides it out
and the button that opened it has the keyboard again. Press Details:
nothing is dimmed, and Filters beside it can still be pressed.

## Props

| Prop           | Type                                    | Default   | What it does                                                                                 |
| -------------- | --------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `open`         | `boolean`                               | none      | Whether it is open. Given, the application owns it.                                          |
| `defaultOpen`  | `boolean`                               | none      | Whether it starts open, for a drawer that owns its own state. Not with `open`.               |
| `onOpenChange` | `(open: boolean) => void`               | none      | Called with `false` when the person closes it: Escape, the close button, or the dimmed page. |
| `onClose`      | `() => void`                            | none      | Called alongside `onOpenChange(false)`, under the name `Dialog` uses for the same request.   |
| `side`         | `'start' \| 'end' \| 'top' \| 'bottom'` | `'start'` | The edge it comes in from. `start` and `end` are reading edges. Read when it opens.          |
| `size`         | `number`                                | `320`     | Width for `start` and `end`, height for `top` and `bottom`, never more than the window.      |
| `modal`        | `boolean`                               | `true`    | Dim the page, keep it from presses, and trap the keyboard. Read when it opens.               |
| `dismissible`  | `boolean`                               | `true`    | Escape, the close button and a press on the dimmed page close it. Off removes all three.     |
| `title`        | `string`                                | `''`      | Drawn at the top, and the accessible name unless `label` is given.                           |
| `description`  | `string`                                | `''`      | Drawn under the title, and carried on the record as the description.                         |
| `label`        | `string`                                | `''`      | The accessible name, for a drawer with no visible title.                                     |
| `content`      | `UiChild`                               | empty row | The body. It scrolls when it is longer than the room there is. Read when it opens.           |

Like `Dialog`, a drawer takes none of the shared layout props and has
no `rootModifiers`: nothing is drawn where it is declared, so there is
no root there to place. `size` is the one length it answers to, and
the window decides the rest.

`side`, `size`, `modal` and `content` are read when the drawer opens,
so a change to any of them shows on the next opening. A body that
changes while the drawer is up is one element with an Observable in
it. `title` and `description` follow a cell while it is open.

## Controlled and uncontrolled

Pass `open` and the application owns it: the drawer reports a close
through `onOpenChange(false)` and stays open until `open` is written
back, which is how a screen with unsaved changes can refuse. Pass
`defaultOpen`, or neither, and the drawer owns its state, still
reporting each close. Passing both throws, as every control in the
library does.

```tsx
// The page owns it, as in the example.
<Drawer open={filters} onOpenChange={next => (filters.value = next)} title="Filters" />
```

A drawer that goes because the component holding it unmounted does not
report a close: the parent that would hear it is being torn down too.

## Edges, and right to left

`start` and `end` are the edges a line of text starts and ends at, not
left and right. Declared in right-to-left text, `start` is the right
edge, which is where a reader of that script looks for navigation, and
the drawer's own content is laid out right to left as well. The overlay
layer carries a tree's theme into the layer but not its direction, so
the drawer reads the direction where it was declared and sets it on
its content itself. `top` and `bottom` have nothing to mirror.

The drawer is pinned to its edge and stretched along it: a `start`
drawer is as tall as the window, a `bottom` one as wide. Across, it is
`size`, or the whole window when the window is smaller: a 480 pixel
drawer on a 375 pixel phone is 375 wide rather than running off the far
side.

Content longer than the window scrolls inside the drawer, under the
title, which stays where it is. The body keeps 4 pixels of its own round
the content so a focus ring drawn outside a field at its edge is not cut
where it clips.

## Modal or beside the page

A modal drawer (the default) is a dialog that happens to sit at an
edge. The page behind it is dimmed with the theme's `scrim` and takes
no press or wheel, positioned panels with a `zIndex` included. A press
on the dimmed page closes the drawer when it is dismissible, and does
nothing when it is not. Tab cycles inside the drawer, through the
focus trap, and closing gives the keyboard back to whatever held it
when the drawer opened.

`modal={false}` is a panel beside the page. Nothing is dimmed, nothing
is trapped, and the page around the drawer goes on taking presses and
keys. Focus moves to the drawer when it opens, so Escape and Tab start
from there, and Tab goes on from the drawer to the rest of the window.
Escape closes it while focus is inside it; once focus is back on the
page, Escape is the page's again. Closing hands focus back to whatever
opened it only when focus was still in the drawer, so someone who has
already moved on keeps their place.

The trap is the drawer's own and is released by name, as a dialog's is:
a drawer its owner closes while a menu or a dialog sits over it leaves
that one holding the keyboard. A drawer opened from inside a dialog
traps over the dialog's trap, Escape closes the drawer and not the
dialog, and the keyboard goes back to the button in the dialog that
opened it.

## Sliding in and out

It slides in from beyond its edge and back out again, through
`AnimationService` on a transform, so a frame of the movement costs a
repaint and no layout. The dim fades with it, driven by the same value,
so the two cannot disagree.

Closing does not remove the drawer on the frame it is asked to: it
slides out first, and only then is its overlay entry removed. For that
moment the drawer is still drawn but takes nothing. It is `disabled`,
which makes it and everything in it inert to the pointer, to focus and
to the keyboard, and the keyboard has already been handed back as the
slide begins. Opened again while it is sliding out, it turns round
where it is.

Under reduced motion both movements snap: the drawer is simply there,
and simply gone, which is the end state either way.

## Keyboard

| Key         | What it does                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `Escape`    | Closes it, when `dismissible`. Bound on the drawer, so only while focus is inside. |
| `Tab`       | Modal: the next focusable inside, wrapping. Not modal: the next in the window.     |
| `Shift+Tab` | The same, backwards.                                                               |

Tab is not the drawer's binding: it is the focus manager walking the
trapped scope when the drawer is modal and the whole window when it is
not. A modal drawer puts focus on its first control as it opens, which
with `dismissible` on is the close button at the top.

## Semantics

| What        | Value                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Role        | `dialog`, on the panel                                                 |
| Name        | `label`, or `title` when there is no label                             |
| Description | `description`                                                          |
| States      | `modal` when modal; `disabled` while it slides out                     |
| Focus       | Modal: trapped while open, restored on closing. Not modal: moved to it |

The close button is a [button](/components/button) named Close, with a
✕ drawn on it.

## What this page has checked

The behaviour above is asserted by two specs that drive the real
runtime with a fake canvas. `Drawer.spec.ts` in the package measures
the panel on each of the four edges, `start` and `end` swapping under
right-to-left text, the clamp to the window on both axes, content laid
out right to left inside, and content taller than the window scrolling
under a title that stays put. It checks the slide starting beyond the
edge it is on and coming to rest, the drawer still present and refusing
a press while it slides out, turning round when opened again, and
snapping under reduced motion with focus still landing on the first
control. It checks the trap and the Tab cycle, Escape, the close
button and the dimmed page closing it, `dismissible={false}` refusing
all three, the non-modal drawer leaving the page pressable and Escape
working only from inside it, the controlled and uncontrolled forms and
the error for both, no report on unmount, a drawer opened from a
dialog handing the keyboard back to the dialog, and a drawer closed
under an open menu leaving the menu its trap. The spec beside the
example checks what the paragraph under the example says.

What none of that covers is drawing. The slide, the fade of the dim,
the border and the close button's glyph have not been looked at in a
browser, on either renderer, and nothing here has been compared against
a screenshot. A menu over a drawer is asserted only for who holds the
keyboard when the drawer closes under it. A select inside a drawer has
no spec of its own, and where either list is drawn relative to the
drawer has not been seen; the workbench has a state for both.

## Next

[Dialog](/components/dialog) is the same lifecycle in the middle of the
window, and [the library overview](/components/) has the contract every
control here is an instance of.
