---
'gesso-components': patch
---

`Drawer` is new: a panel that slides in from an edge of the window. `side` is `start`, `end`, `top` or `bottom`, with `start` and `end` following the reading direction, so a `start` drawer comes in from the right in right-to-left text and its content is laid out right to left too. `size` is its width (or height for `top` and `bottom`) and is clamped to the window, so a drawer never runs off the far side of a phone.

It is modal by default: the page is dimmed and kept from presses, a press on the dimmed page closes it, Tab cycles inside it, and closing gives the keyboard back to whatever opened it. It releases only its own focus trap, so it can be opened from inside a `Dialog` and closed under an open `Menu` without taking the keyboard from either. `modal={false}` is a panel beside the page instead: nothing dimmed, nothing trapped, and the page stays usable. Escape closes either while focus is inside it.

`open` and `onOpenChange` make it controlled, `defaultOpen` lets it own its state, and `onClose` is there under the name `Dialog` uses. It slides in and back out through `AnimationService`, takes no presses or keys while it is leaving, and simply appears and disappears under reduced motion. It is a `dialog` named by its `title` (or `label`), with the `modal` state when modal.
