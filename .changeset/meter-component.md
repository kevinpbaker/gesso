---
'gesso-components': patch
---

**`Meter`, for a measurement rather than a task.** A progress bar is
about time: it starts empty, it fills, it ends. A disk that is 82% full
is not on its way anywhere, and drawing it with a progress bar tells
the reader that something is happening. `Meter` is the read-out for a
quantity that sits somewhere in a known range and is simply true right
now: storage used, a password's strength, a budget spent, a battery.

The feature is the bands. `low`, `high` and `optimum` decide the tone
the bar is painted in, so the conditional "is this reading good?" is
written once in the library rather than at every call site.
`optimum: 'high'` is the ordinary direction, where a value at or above
`high` is good; `optimum: 'low'` is the disk case, where 5% full is
good and 95% full is not. Good is `controlAccent`, poor is `danger`,
and the middle band is `textMuted`. As everywhere else in the library
those are palette names, and there is no colour prop.

`showValue` draws the reading beside the bar, and `format` decides how
it is written, defaulting to a percentage of the range. The formatted
string is also what an assistive technology hears, through
`valueText`, so a reader is told "34 GB of 240 GB used" rather than
"34". A value outside the range clamps the fill and not the reported
number, and a range whose `max` is not above its `min` draws an empty
bar rather than throwing, because that range usually arrives from data
rather than from a typo.

The role is `progressbar`, which is a narrowing: there is no `meter`
role in `UiRole`, and it is the only numeric-range role that is not a
control. The component's page says so, and says which of the two to
reach for.
