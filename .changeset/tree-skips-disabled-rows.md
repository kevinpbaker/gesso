---
'gesso-components': patch
---

`Tree` treats a disabled row as one the keyboard cannot stop on. The arrows, Home, End and the new Page Up and Page Down step over it, as they do over a disabled option in `Select` or `Menu`; a click does not choose it or open it; and Enter, Space or the menu key never activates one, even when the application's own `selectedKey` names it. Right on an open folder with nothing in it now keeps the choice where it is, where it used to move on to the row after the folder, and a tree nested tens of thousands of levels deep opens instead of overflowing the stack.

`LazyList` no longer reports row 0 as chosen when Home is pressed in an empty list. `PlainView` names its region "View" when it is given no `label`; it was taking a name from whatever it drew first. A `PlainView` checkbox or select that changes into another kind of node no longer leaves a subscription behind for the life of the view.
