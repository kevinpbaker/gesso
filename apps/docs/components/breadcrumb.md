---
description: 'Breadcrumb: the trail of where you are, the one crumb that is not a link, and what a trail too long to draw does instead.'
---

# Breadcrumb

The trail of where you are: root first, this page last. A row of crumbs
with a mark between them, at the top of a page that sits inside
something that sits inside something.

It holds no state an application would recognise. The trail is the
caller's, and following a crumb is reported through `onSelect` rather
than acted on, because only the application knows what "go to Projects"
means. That leaves two decisions, and they are the whole of this page:
which crumb is not a link, and what a trail too long for its strip does
instead.

Reach for it when a page has a place in a hierarchy that a person can
walk back up. When the choice is between siblings rather than
ancestors, [Tabs](/components/tabs) is the one that holds the
selection. When the list of places is long, arbitrary or filtered,
[Menu](/components/menu) is the one that opens. And when the trail is
only decoration, because every page in the application is one click
from every other, leave it out: a trail that nobody walks is four more
things for a screen reader to read before the content starts.

<LiveExample id="breadcrumb" height="300" />

<<< @/src/examples/BreadcrumbExample.tsx#breadcrumb

The first trail is the rule in use. Every crumb but the last is a link,
and following one cuts the trail back to it. "Breadcrumb" at the end is
where you already are, so it is not a link, not a tab stop, and no
press on it reaches `onSelect`. Tab through the example and count the
stops: there is one fewer than there are crumbs. The second is the same
component with `maxItems` on a path five segments deep, which keeps the
root and the file and folds the three between them into one crumb.

## Props

| Prop        | Type                        | Default        | What it does                                                              |
| ----------- | --------------------------- | -------------- | ------------------------------------------------------------------------- |
| `items`     | `readonly BreadcrumbItem[]` | required       | The trail, root first and this page last. Each is a `value` and a `label` |
| `onSelect`  | `(value: string) => void`   | none           | The crumb that was followed, by value. The last crumb never reports       |
| `label`     | `string`                    | `'Breadcrumb'` | The landmark's accessible name                                            |
| `separator` | `string`                    | `'/'`          | What is drawn between crumbs, never after the last                        |
| `maxItems`  | `number`                    | `0`            | Fold the middle once the trail is longer than this. 0 never folds         |

Every prop takes a plain value or an Observable of one, and the layout
props on [the library page](/components/) apply here too. Nothing here
is read once: `items` in particular is bound, because a breadcrumb is
the one component whose input changes every time the person navigates,
and a trail read at build time would never move again.

## The last crumb

The last crumb is the page you are already on. A control that
"navigates" to where you already are does nothing when it is pressed,
and a control that does nothing is not a control: it is a thing that
has to be tried before it can be ruled out. So the last crumb is not
focusable, declares no interactive role, and never reaches `onSelect`.

The defect that rule prevents is not the mouse's. Someone tabbing
through the page hears "Home, link. Projects, link. Build, link." and
has no way to know the third is a dead end: they take the tab stop,
press Enter, and land where they started, having spent the interaction
that was supposed to move them. With the rule applied they hear "Home,
link. Projects, link. Build.", which is two stops and a destination.

It is distinct to the eye as well, and by weight rather than by colour
alone: the crumb you are on is set at 600 in the same
`controlForeground` the links use. Colour alone would say nothing to
someone who cannot resolve two tokens apart, and a muted current crumb
would say the opposite of what is true, that the place you are is the
least important thing on the trail.

A trail of one item is entirely this case. It is the page you are on,
so nothing in it is a link, nothing takes focus and no separator is
drawn. A trail of none is not drawn at all, and is not in the semantics
tree: a `navigation` landmark with nothing in it is one more entry in a
reader's landmark list that leads nowhere.

## Collapsing

`maxItems` is off by default, because most trails are three crumbs and
a component should not decide for a caller that theirs is too long.
Above 0, a trail longer than `maxItems` keeps its first crumb and its
last, the root and where you are, and folds everything between them
into one:

```tsx
<Breadcrumb items={path} maxItems={4} />
```

**The fold expands in place.** An inert ellipsis is crumb-shaped, sits
in a row of things that can be pressed, and answers a press with
nothing: the same defect as the last crumb being a link, moved one
position to the left. Expanding needs no popup and no second component,
and it is honest about what it is: a `button` in the `collapsed` state,
named `Show 3 hidden steps` rather than left to be announced as three
full stops.

Expanding removes the button that was pressed, so focus moves to the
first crumb the press revealed; without that the keyboard would be back
at the top of the page, which is worse than not having expanded. The
expansion is remembered against that particular trail rather than in a
bare flag, so navigating somewhere else collapses the new trail instead
of arriving already unfolded.

A menu of the folded crumbs, opened from the button, is the obvious
next step and is deliberately not here: [Menu](/components/menu) brings
an overlay, a focus trap and an anchor, and reaching for it from inside
a strip of text would make this component own a popup to solve a width
problem.

`maxItems` below 3 asks for something that does not exist, because the
folded form is itself three crumbs. The component folds as far as it
can and stops, and it never draws a mark standing for no crumbs:
`maxItems: 2` on a two-crumb trail has no middle and is left alone.

## Keyboard

| Key         | What it does                                                      |
| ----------- | ----------------------------------------------------------------- |
| `Tab`       | Moves to the next crumb. The last crumb is not a stop             |
| `Shift+Tab` | Moves to the previous crumb                                       |
| `Enter`     | Follows the focused crumb, or unfolds the trail on the folded one |
| `Space`     | The same. A focused `link` or `button` is pressed by either key   |

Neither key is bound by the component, and that is the decision rather
than an omission: the runtime presses any focused node whose role is
`button` or `link` by synthesising a click, so a crumb answers the
keyboard through the same `onClick` the pointer and an assistive
technology's activation go through. HTML's rule is narrower, Enter for
a link and Space for a button, and reimposing it here would mean
binding Space to a handler that swallows it. That would make the crumb
the one pressable thing in the library that ignores a key every other
one answers.

## Semantics

| What          | Role         | Name                              | Also                  |
| ------------- | ------------ | --------------------------------- | --------------------- |
| The strip     | `navigation` | `label`, default `Breadcrumb`     |                       |
| The crumbs    | `list`       | none                              |                       |
| Each crumb    | `listitem`   | none, or the current crumb's text | `posInSet`, `setSize` |
| A crumb       | `link`       | the words it draws                |                       |
| The last one  | none         | it is the text in its listitem    |                       |
| The fold      | `button`     | `Show 3 hidden steps`             | `collapsed`           |
| The separator | `separator`  | empty, on purpose                 |                       |

**A named landmark holding a list.** That is the shape HTML has for
this, and the shape a screen reader's landmark list and its "list, 4
items" summary are built to read. The landmark is named because an
unnamed one is an entry that says "navigation" next to three other
entries that say "navigation", and is worse than useless to the person
who opened that list to get somewhere.

**A crumb is named by the words it draws, not by a label.** `link` is
not one of the roles whose children the semantics tree makes
presentational, so a link carrying both a `label` and its text would
put "Projects" on the tree twice, once as the link's name and once as
prose beside it. Left unlabelled, the text is claimed as the name and
read once.

**The current crumb declares no role at all.** It is text in a
`listitem`, so the listitem is named by it and a reader hears "list
item, Build": content, not a control, which is what it is. ARIA's
`aria-current="page"` is not available here, because the library's
state vocabulary has no `current` member, and inventing a role to stand
in for one would be guessing at semantics rather than declaring them.
Position carries the meaning instead: every crumb's listitem states
`posInSet` and `setSize` from the real trail, the way a windowed list
does, so the last crumb is announced as "5 of 5" even when the middle
is folded away.

**The separators are furniture and say so.** "Home slash Projects slash
Build" is not a reading anyone wants, and the strings people pass are
worse than a solidus: a chevron reads as "greater than". So the mark
declares a `separator` with an empty name, which is two of the
library's rules doing one job. A declared name wins over the text a
node draws, so the empty one claims the glyph and announces nothing;
and `separator` makes a node's children presentational, so nothing
under it is read either. Same mechanism
[Divider](/components/divider) uses for a rule, same reason.

## What this page was checked against

`Breadcrumb.spec.ts` mounts the component with `gesso-testing` and
asserts that the last crumb is not among the links, takes no tab stop
and never reaches `onSelect`, that it is heavier than the crumbs before
it in the same colour token, that a click and a key both report the
crumb by value, that the strip is a named landmark holding a list of
listitems, that a crumb is named once rather than twice, that each
listitem carries its real position in the whole trail even when the
middle is folded, that the separators are drawn and announce nothing,
that following a crumb turns it into the page you are on without
inheriting the mark that used to follow it, that the fold is named for
the count it hides and expands in place with the keyboard following it,
that a new trail collapses again, that `maxItems` below 3 draws no mark
standing for nothing, that an empty trail is not a landmark, and that a
trail of one has no links at all. `BreadcrumbExample.spec.ts` asserts
what the example above claims, by role and name.

## Next

[Tabs](/components/tabs) is the one for a choice between siblings, and
[Menu](/components/menu) is the one that opens a list of places.
[Link](/components/link) arrived beside this component rather than
before it, so a crumb is not one yet; making it one, and taking the
underline and the visited treatment with it, is the next change here.
