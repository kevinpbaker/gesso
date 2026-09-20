---
'gesso-components': patch
---

`SegmentedControl`: one choice from a few, drawn as one track cut into
segments.

The control at the top of a pane that says which of three views is
below it, or which of two units a figure is in. Day / Week / Month,
Grid / List, Celsius / Fahrenheit: two to five short choices, all worth
seeing at once, costing one line of a toolbar.

It declares a `radiogroup` of `radio`s and not a `tablist`, and that is
the decision the component exists to make. A `tablist` is a promise
that each control reveals a panel, and an assistive technology acts on
it; a segmented control that picks Celsius has no panel to send a
reader to. If the choice really does change which panel is shown,
`Tabs` is still the component, and it draws the `tabpanel` to go with
the strip.

The keyboard is `RadioGroup`'s, deliberately. The track is a single tab
stop and the segments are not, the arrows walk and walking selects,
Home and End reach the ends, and every one of them steps over a segment
marked `disabled` rather than landing on it. It is a separate component
rather than a `variant` on `RadioGroup` because only the semantics and
the keyboard are shared: the paint, the layout, the sizing and four of
the props are not, and a variant prop that turned four other props off
would be a second component hiding inside the first.

`size` is a `ButtonSize` and resolves through `controlTokens.button`,
so a segmented control and a `Button` of the same size are the same
height, share a radius and set their words in the same type role. No
colour is a prop: the trough is `controlBackground` inside a
`controlBorder` ring, and the chosen segment is the selection pair with
a ring of its own, so which segment is chosen survives greyscale rather
than resting on colour alone.

`options` is a cell and the segments follow it, so choices that arrive
from a request appear when they arrive. An empty `options` draws an
empty named track rather than nothing, because an empty array is
usually "not loaded yet" and a control that vanished and came back
would move everything beside it twice. A `value` that matches no
option, which is what a stale saved preference looks like, leaves
nothing chosen instead of being quietly corrected to the first segment;
an arrow recovers from it.
