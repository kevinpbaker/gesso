---
'gesso-components': patch
---

A new `Popover`: a panel anchored to the control that opened it, for a filter panel, a short form beside the thing it edits, or a note too long for a tooltip. It is a non-modal dialog. Opening it moves focus in, to an `initialFocus` node or the panel itself; Escape closes it and puts focus back on the trigger; Tab walks the panel and, past either end, leaves it beside the trigger and closes it. There is no backdrop and no focus trap, so a press anywhere outside closes it and still lands on whatever was pressed, while a press in a `Select` or a second popover opened from inside it counts as inside.

It is controlled with `open` and `onOpenChange`, where every close is a request the application may refuse, or self-managing with `defaultOpen`. It hears its anchor's presses itself, from the pointer, the keyboard or an assistive technology, so the trigger needs no `onClick` for it. `side` is `bottom`, `top`, `start` or `end` with an `align`, flipping and shifting to stay on screen, and `start` and `end` mirror under right-to-left. The panel announces itself as a `dialog` named by `label`, and `panelRef` hands over its node for the trigger's `controls`.
