---
description: 'ContextMenus: the menus a browser opens on a right-click or the Menu key, put back over the canvas, and how a node offers a menu of its own.'
---

# ContextMenus

A browser opens a menu on a right-click: Cut, Copy and Paste over a
field, Copy over selected text, Copy Link over a link. Over a canvas it
would offer to save an image of the page instead, so gesso holds the
browser's menu back. `ContextMenus` puts the useful ones back. Wrap the
application's root in it once.

The keyboard asks for the same menus. The Menu key, or Shift+F10 on a
keyboard without one, asks whatever has the focus, and the menu opens
from under a field's caret or from the focused node's lower left.

<LiveExample id="contextmenus" height="340" />

<<< @/src/examples/ContextMenusExample.tsx#context-menus

Right-click the field, a few selected words of the sentence, the link
and the file row. Then Tab to each and press the Menu key or Shift+F10:
the same menu opens, and the arrows and Enter choose from it.

## Props

| Prop       | Type      | Default | What it does                                                   |
| ---------- | --------- | ------- | -------------------------------------------------------------- |
| `children` | `UiChild` | none    | The screen. The menus answer requests from anywhere inside it. |

It also takes the shared layout props. It fills its parent unless it is
given a size.

## What it offers

| Over                          | The menu                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| A text field                  | Cut, Copy, Paste, Select All. Cut and Copy need a selection.           |
| A read-only field             | The same, with Cut and Paste disabled                                  |
| A secret field (a password)   | The same, with Cut and Copy disabled, so nothing copies the secret out |
| Selected text, outside fields | Copy                                                                   |
| A link with an address        | Open Link in New Tab, Copy Link                                        |
| A link to a route             | Open Link in New Tab                                                   |
| A field inside a link         | The link's items, then the field's, below a rule                       |
| Anything else                 | Nothing opens                                                          |

A field asked for its menu takes the focus first, as a browser's does,
so the command acts on that field and its selection. The commands go
through `EditingService`, the same calls a shortcut makes, so Paste
asks the shell for the clipboard and Copy Link writes the address to it.

## A node with a menu of its own

The `contextMenu` modifier turns a request on one node into a callback
with the point to open at, which is what `Menu`'s `at` prop takes:

```tsx
<row
  focusable
  label="report.pdf"
  modifiers={[
    contextMenu({
      onOpen: point => {
        at.value = point;
        open.value = true;
      }
    })
  ]}>
```

The request stops at the node by default, so a row inside a list gets
its own menu and `ContextMenus` never hears it. Pass
`stopPropagation: false` to let the request go on as well.

Make the node `focusable`. The keyboard asks whatever has the focus, so
a node no key can reach has no menu from the keyboard.

## How a menu is asked for

Every way of asking dispatches the same `ContextMenu` event, so neither
`ContextMenus` nor a node's `contextMenu` asks which one it was.

| Input                      | Where the event goes | The point                                              |
| -------------------------- | -------------------- | ------------------------------------------------------ |
| The secondary mouse button | The node under it    | Where the pointer was                                  |
| A finger held down         | The node under it    | Where the finger was                                   |
| The Menu key               | The focused node     | Under the caret in a field, else the node's lower left |
| Shift+F10                  | The focused node     | The same                                               |

With nothing focused, a key asks the text node the canvas selection
ends in, so selected words can be copied from the keyboard as they can
with a right-click. With no selection either, it asks the application's
root. A key's point is kept inside the canvas, because a focused node
can be taller than the screen.

A key event's `buttons` is 0 and it carries no modifiers, so Shift+F10
does not read as a Shift-click. A `KeyDown` listener that calls
`preventDefault()` on the key takes it, and no menu is asked for.
Shift+F10 with Ctrl, Alt or Meta held is not a request; F10 alone is
not one either.

The browser would open its own menu for either key. The worker shell
cancels both on the spot, as it cancels Tab, since the worker's answer
cannot come back in time. The hidden textarea that holds the focus
while a field is edited, and the off-screen tree a screen reader
reads, both hold the browser's menu back as well.

## Semantics

The menu is a `Menu`, so it is a `menu` of `menuitem`s, named "Context
menu", and it takes the focus and traps it while it is open. Escape, a
choice or a press outside closes it and hands the focus back to what
had it. See [Menu](/components/menu#semantics) for the rest.

## What has been checked

The rows for each case, the keyboard path from the controller up, and
the example above are unit specs that drive the real runtime with a
fake canvas. The menu's point under a caret and at a node's lower left
is asserted to the pixel. The shell's cancelling of both keys and the
two stand-in elements holding the browser's menu back are specs against
a fake DOM.

The example above was driven in Chrome on macOS with key events sent
through the DevTools protocol: Shift+F10 on the file row and the Menu
key in the field opened their menus at the points described, and the
arrows and Enter chose from them. Keys sent that way do not make Chrome
fire its own menu event, so the shell holding the browser's menu back
was not seen in a browser; it is a spec. The keys have not been pressed
on a real keyboard on Windows or Linux, where the Menu key is common and
Shift+F10 is the convention, nor with a screen reader running. A screen
reader's own command for a menu (VoiceOver's VO+Shift+M) is not yet
turned into a request.

## Next

[Menu](/components/menu) is the component every one of these menus is,
and [shortcuts](/interaction/shortcuts) binds keys to commands of your
own.
