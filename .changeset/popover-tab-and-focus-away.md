---
'gesso-components': patch
---

`Popover` now leaves Tab to a control inside it that takes the key for itself. The panel walks its own controls on Tab, and it used to do that even when the focused control had already cancelled the key, so a field of your own that indents on Tab lost focus instead. It now acts only on a Tab nothing inside it used. A `TextArea` is not such a control: Tab leaves a `TextArea` everywhere in the library, and inside a popover it still moves on to the panel's next control.

A popover also closes when focus leaves it by a route other than Tab or a press: focus moved by code, by a shortcut that focuses another control, or by an assistive technology. Before, it stayed open with focus outside it. As with every other way of closing, this is a request through `onOpenChange(false)` that a controlled owner can refuse, and focus stays where it went. Focus on the anchor, or in an overlay opened from inside the panel (a `Select`'s list, a nested popover), does not count as leaving, by the same rule a press outside is judged by. A press outside that also moves focus asks to close once, not twice.
