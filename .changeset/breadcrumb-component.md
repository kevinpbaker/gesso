---
'gesso-components': patch
---

`Breadcrumb`: the trail of where you are, with the one crumb that is not
a link.

`<Breadcrumb items={trail} onSelect={follow} />` draws a `navigation`
landmark holding a `list` of crumbs, root first and this page last.
Every crumb but the last is a `link` that reports itself through
`onSelect` by value. The last one is where you already are, so it is not
a link, not a tab stop and never reports: a control that navigates to
the page you are on does nothing when it is pressed, and someone tabbing
a page cannot tell that until they have spent the press finding out. It
is distinct to the eye by weight rather than by colour alone.

`maxItems` folds a trail that is too long. Above 0, a trail longer than
it keeps its first crumb and its last and folds the middle into one
crumb, which is a `button` named for the count it hides ("Show 3 hidden
steps") rather than an ellipsis a screen reader reads as three full
stops. Pressing it unfolds the trail in place and moves focus to the
first crumb it revealed, so the keyboard does not fall back to the top
of the page; a new trail folds again rather than arriving unfolded. A
menu of the folded crumbs is the obvious next step and is not in this
change.

`separator` is what is drawn between crumbs, a solidus by default, in
`textMuted` and never after the last. It declares a `separator` with an
empty name, so "Home slash Projects slash Build" is never what a reader
hears. `label` names the landmark, `Breadcrumb` by default, because an
unnamed landmark in a list of landmarks leads nowhere. `items` is bound
rather than read once, since a breadcrumb is the one component whose
input changes on every navigation.

Enter and Space both follow the focused crumb, which is what the runtime
already does for anything whose role is `link` or `button`. An empty
trail draws nothing and is not in the semantics tree; a trail of one is
the page you are on and has no links at all.
