---
'gesso-components': patch
---

`Pagination` draws the strip of page numbers that goes under a table of
rows shown a page at a time. Give it `pageCount` and either `page` or
`defaultPage`, and it reports every move through `onChange`; it holds
no rows and does no slicing, so the page stays the one number your
application owns.

The arithmetic is the component, and two of its decisions are worth
knowing before you reach for it. It never draws an ellipsis that stands
for a single page, because a page is the same width as the "…" hiding
it and can actually be pressed. And the strip does not change width as
you page through it: at page 1 the run of numbers is as wide as it is
in the middle, each slot has a floor under its width, and previous and
next are disabled at the ends rather than removed, so nothing walks out
from under the pointer that is clicking it. `siblings` sets how many
numbers sit either side of the current page and `boundaries` decides
whether the first and last are pinned.

`paginationItems` is exported beside the component: the same pure
function, for a strip you are drawing yourself or a test that wants to
ask what would be drawn without mounting anything.

What it says is not what it shows. Each numbered control is named "Page
4" rather than "4", the page you are on carries the `selected` state as
well as the accent, the ellipsis is decorative and cannot be focused,
previous and next are named, and the strip itself is a `navigation`
landmark whose name defaults to "Pagination" and is worth setting
through `label` on any screen with two of them. There are no colour
props: the current page is painted from the `filled` and `accent` row
of the shared button tokens and the rest from `plain` and `neutral`, so
a theme that restyles its buttons restyles this with them.
