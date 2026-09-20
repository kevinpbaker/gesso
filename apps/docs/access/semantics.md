---
description: 'What a component tells an assistive technology: role, label, value and states, where the accessible name comes from, and what the diff costs per frame.'
---

# Semantics

A canvas has no DOM. Whatever an application draws, the platform sees
one element, so a screen reader, an operating system's accessibility
API and an automated testing tool all see the same nothing unless the
tree says what it is.

Saying it is a set of ordinary properties. They are registered like
`width` and `backgroundColor`, they accept a value or an Observable of
one, and every element takes them, so a component puts them on the node
that _is_ the control rather than on a wrapper around it.

<LiveExample id="semantics" height="320" />

<<< @/src/examples/SemanticsExample.tsx#preferences

## The properties

The vocabulary is ARIA's, because ARIA is what the mirror emits and
what every accessibility API on the target webviews understands.
Borrowing the names makes the translation a rename rather than a
mapping table.

| Prop                               | What it says                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `role`                             | What the node is. A closed set of 49 ARIA names: `button`, `switch`, `listbox`, `dialog`, `heading`, and the rest       |
| `label`                            | The accessible name. Without one, the node is named by the text it draws                                                |
| `description`                      | Read after the name: a hint, or the reason a field is invalid                                                           |
| `live`                             | `polite` or `assertive`: announce this node's text when it changes, without focus moving. `status` and `alert` imply it |
| `states`                           | Conditions beyond role and value, as an array. Also a closed set                                                        |
| `valueNow`, `valueMin`, `valueMax` | A range control's position and its bounds                                                                               |
| `valueText`                        | How the value should be spoken when the number is not it, as in `40%` or `3 stories`                                    |
| `posInSet`, `setSize`              | A row's 1-based place in a set, including the items that are not mounted                                                |
| `level`                            | How deep a `treeitem` sits, 1 for a root                                                                                |

The states are `checked`, `mixed`, `expanded`, `collapsed`, `selected`,
`pressed`, `busy`, `invalid`, `required`, `readonly` and `modal`. Order
does not matter: the record sorts and de-duplicates them, so two
spellings of the same set do not show up as a change.

`disabled` is not among them, deliberately. It is already a property,
already inherited by a whole subtree, and two ways to say the same
thing would let them disagree, so the record derives it. A disabled
subtree is present in the tree and says it is unavailable; a hidden one
is not there at all.

## What lands in the tree

The tree is flat: a map of records, each carrying its parent and its
position among its semantic siblings. Three rules decide what is in it.

1. **A node is a record when it says something.** It declares a `role`
   or a `label`, or its type carries a role without being asked, or it
   is prose. Everything else is transparent, so wrapping a button in
   three boxes for layout does not put three nodes in front of a screen
   reader. Both rows in the example above are transparent, which is why
   every control hangs off the form rather than off a row.
2. **A record's name is its `label`, else the text it draws.** Text
   used that way is claimed: it does not also become a record of its
   own.
3. **An invisible subtree is absent.** `visible={false}` removes the
   records with the pixels.

Two element types carry a role without being asked: a `<button>` is a
`button` and an `<editabletext>` is a `textbox`. That is what makes
"every component emits semantics" achievable rather than aspirational,
and it is why the Save button in the example declares nothing at all.
Everything from `gesso-components` declares its own, so a screen built
from the library is described before you write a line: see the
[Semantics](/components/checkbox#semantics) section on any component
page for what each one emits.

The spec beside the example asserts the whole set, which is the form
this page's claim takes in the test suite:

<<< @/src/examples/SemanticsExample.spec.ts#records

## The accessible name

A control's name is its `label` if it has one, and otherwise the text
it and its transparent descendants draw, joined by spaces. Both stepper
buttons in the example are labelled, so the record reads "Fewer
stories" while the pixels read "Fewer"; Save is not, so the word it
draws is its name.

Roles whose children are presentational, among them `button`,
`checkbox`, `switch`, `radio`, `option`, `tab`, `slider`, `image` and
`menuitem`, hide their subtree. A labelled button does not also announce the glyph
inside it, and the switch row above is one record rather than a record
plus the word next to it. A labelled _container_ claims nothing: its
label names it, and its children are the content that label introduces.

Most of that set is ARIA's own `childrenArePresentational` list.
`menuitem` is not on it: ARIA names a menu item from its author or its
contents, so a strict reading would leave the text inside a row with a
record of its own. Gesso claims it anyway, for the same reason it
claims `option` and `tab`, which is that a menu row named by its label
and a menu row's label are one thing to a reader and were two records
to a screen reader.

Two consequences are worth knowing before you meet them.

**A bound name changes the record.** `text` marks a node dirty for
semantics as well as for content and layout, so a line bound to a cell
renames its record on the frame it repaints on. Without that a counter
would paint `Clicks: 1` while an assistive technology went on offering
`Clicks: 0` for as long as the page stayed open.

**Hiding a node removes its record.** `visible` marks the node dirty
for semantics too, so a message that is bound off leaves nothing behind
for a screen reader to find. The alternative, an element that is still
in the tree but draws nothing, is the failure mode this rule exists to
prevent.

## A typo is a build error

`role` and `states` are closed sets with a checked value, so a
misspelling throws when the tree is built, naming the nearest name the
way an unknown prop already does:

```
Unknown role 'buton'. Did you mean 'button'? Roles are the ARIA names listed in UI_ROLES.
```

The check runs in the builder rather than on every property write, so
it costs one undefined test for the ninety-odd properties that declare
no validator. A value arriving through an Observable is not checked
there: it is the reader's to reject, exactly as a bound length is
rejected at layout.

## What a frame costs

Semantics is a frame phase of its own, between layout and render, and
it is gated: it runs when a semantics property or the shape of the tree
moved, and not otherwise. A frame that scrolled, animated or only
repainted changes nothing about what the screen means, and the profiler
shows `0.00` for it.

Two more rules keep the cost where it belongs.

- **Nothing listening means nothing walked.** With no mirror and no
  devtools panel attached, a dirty tree is marked stale rather than
  rebuilt, and the work moves to whoever asks. `semanticsTree()`
  rebuilds on demand for a test, and attaching a mirror rebuilds first
  so it is never handed a tree from before the frames that ran without
  one.
- **The rebuild is bounded by the mounted nodes.** A 100,000-row lazy
  list walks the fifteen rows it has mounted, not the model behind
  them.

With a listener attached the phase also sweeps geometry on any frame
that laid out, because an off-screen element that is not over its node
gives a screen reader's cursor the wrong rectangle. That reading is
small and it is not zero. What stays true either way is that a frame
which neither moved anything nor changed what anything means sends no
update at all, which the spec beside the example checks by hovering a
control and finding nothing was emitted.

## Limits

**Records carry no geometry.** A record changes when a node's meaning
changes; where it sits changes on every scrolled frame. Position
travels separately, which is what makes "no semantics changed" a cheap
and true statement. [The mirror](/access/the-mirror) is where the two
are put back together.

**A description is text, not a reference.** There is no way to say "the
name of this control is that node over there": referring to another
node would need an id system nothing else here has, so `description`
takes the string.

**There are no live regions.** A node with `role="status"` or
`role="alert"` reaches the platform as one, and nothing beyond that
raises an announcement of its own when the text under it changes.

## Next

[The mirror](/access/the-mirror) is what turns these records into
something a screen reader can actually read.
