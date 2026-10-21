---
'gesso-components': patch
---

`RangeSlider` chooses a span from a range: a low and a high value, each with a thumb of its own. Each thumb is its own tab stop and its own `slider` to an assistive technology, named from the label ("Minimum price", "Maximum price") or by `thumbLabels`, and announces a minimum and maximum that stop at the other thumb. The keys are `Slider`'s, per thumb, mirrored right to left in the same way. A press on the track moves the nearer thumb and drags it; two thumbs sitting together are told apart by the direction of the drag. The thumbs never cross, and `minDistance` keeps a gap between them. It is controlled with `value` and `onChange`, or self-managing with `defaultValue`, and reports every pair already in order.
