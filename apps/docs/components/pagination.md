---
description: 'Pagination: the strip of page numbers under a table, the arithmetic that decides which of them are drawn, and the names that make it usable without looking at it.'
---

# Pagination

A strip of page numbers, for a set of rows shown a page at a time. It
owns one number, the page, and knows nothing at all about rows: you
slice your own data and put this underneath, usually beneath a
[DataTable](/components/data-table), which is the component it was
written to sit with.

Reach for [LazyList](/components/lazy-list) instead when the answer to
"there is more than fits" is _scroll_. An infinite list and a paged one
solve the same problem and disagree about one thing: whether a position
in the set is a place you can name. A paged list has page 7, which can
be linked to, bookmarked, read out over the phone and returned to after
a reload; a lazy list has a scroll offset, which is none of those
things and costs nothing to move through. Rows that somebody searches,
cites or comes back to want pages. A feed wants a scroller. A hundred
thousand rows want [DataTable](/components/data-table), whose
virtualization is the reason paging it would answer a question nobody
asked.

The whole of this component is two problems, and neither of them is the
pill: an arithmetic one, which is deciding what to draw, and an
accessibility one, which is that a row of bare numerals read aloud says
nothing.

<LiveExample id="pagination" height="360" />

<<< @/src/examples/PaginationExample.tsx#pagination

Twelve pages of eight records. The application holds the page in a
cell, hands it to the strip, and slices the same cell for the rows
above, so there is no second copy of the number to keep in step. Walk
it and watch the strip rather than the rows: it does not change width
as you go, the ellipsis never stands for a single page, and previous
and next go grey at the ends instead of disappearing.

## Props

| Prop          | Type                     | Default        | What it does                                                         |
| ------------- | ------------------------ | -------------- | -------------------------------------------------------------------- |
| `pageCount`   | `number`                 | required       | How many pages there are. Below 1 the component draws nothing at all |
| `page`        | `number`                 | none           | The current page, counting from 1. Passing it means the app owns it  |
| `defaultPage` | `number`                 | `1`            | A starting page the control then owns. Passing both throws           |
| `onChange`    | `(page: number) => void` | none           | Fired on every move, in both forms                                   |
| `siblings`    | `number`                 | `1`            | Numbered buttons on each side of the current page                    |
| `boundaries`  | `boolean`                | `true`         | Whether the first and last page are always drawn                     |
| `label`       | `string`                 | `'Pagination'` | The landmark's accessible name                                       |
| `disabled`    | `boolean`                | `false`        | Turns off every control in the strip at once                         |
| `size`        | `ButtonSize`             | `'small'`      | `small`, `medium` or `large`, from the same scale as a button's      |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too.

`size` is read once, when the strip is built, because it chooses a row
of the control token table rather than a value inside the strip. A
component that has to change size changes its `key` and is built again,
which is the same rule [Button](/components/button) states for its
variant. Everything else, including `pageCount`, `siblings` and
`boundaries`, is bound and follows a cell as it changes.

Nothing here is a colour, and nothing will be. The current page is
painted with the `filled` and `accent` row of the shared button table
and the rest with `plain` and `neutral`, so a theme that restyles its
buttons restyles these with them. Restyling is a theme provider around
the strip, the mechanism [themes and the
environment](/appearance/themes-and-the-environment) describes.

## Controlled and uncontrolled

The library's one contract for a stateful control. Pass `page` and the
application owns the number and hears every move:

```tsx
const page = internalState(1);

<Pagination pageCount={12} page={page} onChange={next => (page.value = next)} />;
```

Pass `defaultPage` and the strip owns it, still reporting every move:

```tsx
<Pagination pageCount={12} defaultPage={1} onChange={remember} />
```

Passing both throws, because two owners is a bug rather than a
preference. The controlled form is the one to reach for here more often
than elsewhere: the page is almost never only the strip's business,
since the rows above it are a slice of the same number, and usually the
URL is too.

A `page` outside `1..pageCount` is clamped for drawing, and **nothing
is emitted**. Handed 99 of 10 the strip draws page 10, and previous
from there goes to 9 rather than to 98. It does not call
`onChange(10)`: a control reports what the person did, and nobody did
this. An emission there would be a write the application never
initiated, arriving while it renders, and in the uncontrolled form it
would quietly overwrite the `defaultPage` that was asked for. Out of
range is a bug worth seeing, not one for this component to paper over.

## What gets drawn

The strip is `[previous] [first] [gap] [run] [gap] [last] [next]`, and
which of those appear is a pure function of four numbers. Worked
examples, with `‹` and `›` for the two ends:

| `page` | `pageCount` | `siblings` | `boundaries` | Drawn                    |
| ------ | ----------- | ---------- | ------------ | ------------------------ |
| 1      | 10          | 1          | true         | `‹ 1 2 3 4 5 … 10 ›`     |
| 3      | 10          | 1          | true         | `‹ 1 2 3 4 5 … 10 ›`     |
| 5      | 10          | 1          | true         | `‹ 1 … 4 5 6 … 10 ›`     |
| 9      | 10          | 1          | true         | `‹ 1 … 6 7 8 9 10 ›`     |
| 10     | 10          | 1          | true         | `‹ 1 … 6 7 8 9 10 ›`     |
| 4      | 7           | 1          | true         | `‹ 1 2 3 4 5 6 7 ›`      |
| 5      | 10          | 0          | true         | `‹ 1 … 5 … 10 ›`         |
| 1      | 10          | 0          | true         | `‹ 1 2 3 … 10 ›`         |
| 5      | 10          | 2          | true         | `‹ 1 2 3 4 5 6 7 … 10 ›` |
| 5      | 10          | 1          | false        | `‹ … 4 5 6 … ›`          |
| 1      | 10          | 1          | false        | `‹ 1 2 3 4 … ›`          |
| 1      | 1           | 1          | true         | `‹ 1 ›`                  |
| 1      | 0           | 1          | true         | nothing                  |

Four rules are doing the work in that table.

**An ellipsis that stands for exactly one page is worse than the page.**
Row one is the case: between the pinned first page and the run there is
only page 2, so page 2 is drawn. Hiding it behind a "…" would cost the
same width and offer a control that is not one. This is the single most
commonly botched case in a pagination strip, and it is the one the spec
asserts hardest.

**The run does not shrink at the ends.** Compare rows one and three, and
count the slots between the arrows: seven in both. The naive arithmetic
clips the window at page 1 and hands back a strip three slots narrower
than the one in the middle, so the row changes width as somebody pages
through it and the next button walks out from under the pointer that is
clicking it. Here the window slides instead: whatever the left side does
not need is spent on the right. Each slot also carries a minimum width,
so a one-digit page occupies the same box as a two-digit one and an
elision occupies exactly the slot of the page it replaced. Past two
digits the numeral sets the width, because a floor cannot be a ceiling
and a clipped page number would be worse.

**`boundaries: false` drops the pinned first and last, and keeps the
elisions.** An elision with no page after it still says the true thing,
that there are pages that way, and it keeps the width fixed. Dropping it
as well would leave a bare window claiming to be the whole set.

**One page is a set of one; no pages is not a set.** A `pageCount` of 1
draws `‹ 1 ›` with both ends disabled, because a strip that vanished
when a filter narrowed the table to a single page would reflow
everything under it. Below 1 there is nothing to move through, so
nothing is drawn: no controls, and no landmark either, since an empty
navigation region is a line in somebody's landmark list that leads
nowhere.

## Keyboard

| Key                | What it does                                                         |
| ------------------ | -------------------------------------------------------------------- |
| `Tab`, `Shift+Tab` | Moves to the next or previous control in the strip                   |
| `Enter`, `Space`   | Presses the control that has focus, which is the button's own keying |

That is the whole table, and the strip binds nothing itself. Every
control here is its own tab stop, so Tab already walks it: this is not
ARIA's toolbar pattern, and the arrows are not bound, for the reason
[Toolbar](/components/toolbar) gives. A strip of buttons that swallowed
the arrows would take them from whatever the page around it uses them
for.

Home and End were written and then taken out, which is worth recording
because it looks like an omission. They work, in the sense that the
page changes. What they also do is delete the button they were pressed
on: jumping from page 5 to page 1 redraws the strip as `‹ 1 2 3 4 5 …
12 ›` without page 5 in the middle of it, the node under focus is gone,
and the keyboard user is put back at the top of the document. The two
controls that survive every jump are previous and next, which is
exactly why they are disabled at the ends rather than removed, and
somebody paging with them never loses their place. Pressing a numbered
page is safe for the same reason in reverse: the page you just chose
becomes the current one, and the current one is always in the window.

## Semantics

| What               | Role         | Name                          | States                          |
| ------------------ | ------------ | ----------------------------- | ------------------------------- |
| The strip          | `navigation` | `label`, default `Pagination` | none                            |
| A numbered control | `button`     | `Page 4`                      | `selected` on the current page  |
| Previous and next  | `button`     | `Previous page`, `Next page`  | disabled at that end of the set |
| The elision        | none         | none                          | not a control, not focusable    |

**A numbered control's name is a sentence and its text is a numeral.**
"1 2 3 4 5" read aloud says nothing about what any of them do, so the
name is "Page 4" while the glyph drawn stays "4". That is the one case
[Button](/components/button) has both a `label` and `children` for, and
it is the difference between a strip that can be driven by voice and
one that cannot.

**The current page is `selected`, not merely painted.** `UiSemanticState`
has no `current` and inventing one would be a state the mirror cannot
emit, so the strip uses the honest member of that union, which is also
what the accent pill means. It stays focusable and it is not disabled:
disabling the page you are on would take it out of the Tab order for no
reason anybody could guess.

**Previous and next are named, and disabled rather than absent.** A
control that disappears from under the pointer mid-click is the defect
that this avoids; a disabled one says "not from here" and stays where
it was.

**The elision is decorative.** It is text with no role, no name and no
focus, so it cannot be reached as a control and Tab passes it by. It is
read as the prose it is, which is what [Badge](/components/badge) says
about a marker with nothing of its own to declare.

**The landmark takes the name.** `label` defaults to `Pagination` and is
worth setting on any page with more than one strip, because a landmark
list showing two entries called "navigation" tells a reader less than
nothing.

## What this page was checked against

`Pagination.spec.ts` drives `paginationItems`, the pure function behind
the strip, through a table of twenty-one cases covering every row of the
worked examples above, and then asserts three properties across whole
sweeps of the input space: that the number of slots is the same for
every page of a given set, that no page is ever drawn twice, and that
the page somebody is on is always offered. The mounted tests assert
that each numbered control is named "Page n" while drawing the numeral,
that exactly one carries `selected`, that previous and next are named
and are disabled at the ends and for a single-page set, that the
elision is neither a control nor focusable, that the landmark carries
its name, that below a `pageCount` of 1 there is no landmark and no
control at all, that both ownership forms work and passing both throws,
that an out-of-range page clamps without reporting anything, that
pressing the current page reports nothing, that `disabled` silences the
strip, that every slot is the same width at all three sizes, and that
the control that was pressed is the same node afterwards rather than a
rebuilt one, because a rebuilt node is focus on the floor.
`PaginationExample.spec.ts` asserts what the example above claims, by
role and name.

## Next

[DataTable](/components/data-table) is the component this usually sits
under, and [LazyList](/components/lazy-list) is the other answer to the
same problem, for the sets whose positions nobody needs to name.
