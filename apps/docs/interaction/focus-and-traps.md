---
description: Focus as something a component can reach, autofocus, moving the caret to the field that failed, confining the keyboard to a dialog, and drawing a ring around whatever holds it.
---

# Focus and traps

At most one node holds keyboard focus, and where it is lives in the
runtime rather than in any component's state. That is the right place
for it: two components cannot disagree about who has the keyboard, and a
control that wants to know about its own focus asks rather than tracks.

[Pointer and keyboard](/interaction/pointer-and-keyboard) covers what is
focusable and in what order, and it is short: a `<button>` and an
`<editabletext>` are focusable, anything with `focusable` opts in,
nothing inert ever is, and Tab walks document order and wraps. There is
no `tabIndex`, so the way to change the order is to change the tree.

This page is what an application does with it.

## Focus is a service

A component reaches focus the way it reaches the clipboard, overlays and
the find session: through an injected service, not by holding the
runtime's manager.

```tsx
const focus = ctx.inject(FocusService);
```

| Member            | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `focus(node)`     | Moves focus there. A node that cannot take it is ignored        |
| `blur()`          | Drops focus without moving it anywhere                          |
| `focusNext()`     | The next focusable node, wrapping                               |
| `focusPrevious()` | The previous one, wrapping                                      |
| `trap(node)`      | Confines focus to that subtree until it is released             |
| `releaseTrap()`   | Ends the innermost trap and restores the control that opened it |
| `focused`         | The node holding focus, or null, as state to bind to            |
| `trapped`         | Whether a trap is open, as state to bind to                     |

`focused` carries the `UiNode` itself, not an id, which is what lets a
readout name it or a control compare it with its own node. Nodes come
from a `ref` prop, and they never cross a worker boundary, so this
service stays on the render thread with the rest of the tree.

An action taken before the runtime has installed its focus manager is
queued and replayed rather than dropped. That is not a corner case: an
application's refs fire while the first tree is being built, which is
before the services exist, and an autofocus in a dialog opened on the
first frame hits it every time.

## A control's own focus

A control does not ask "am I focused" of a boolean it keeps. It
compares the focused node with the node its own `ref` handed it, which
is one derived value:

```tsx
const self = new BehaviorSubject<UiNode | null>(null);
const isFocused = combineLatest([focus.focused, self]).pipe(map(([held, mine]) => mine !== null && held === mine));
```

Every control in `@gesso/components` does exactly this, and forwards a
`ref` prop to the element that _is_ the control rather than to its
outermost box. That is what makes the next section possible from
outside the component.

## Moving focus to the field that failed

A form that reports "three fields are wrong" and leaves the caret where
it was has made the person hunt. The pattern is: keep the node each
field's `ref` gave you, and on a failed submit hand the first bad one to
`focus`.

```tsx
let firstBad: UiNode | null = null;
// ... validate, remembering the node of the first field that failed
if (firstBad !== null) {
  focus.focus(firstBad);
}
```

The library's controls are built for this. Marking a field `invalid`
recolours its border and adds the `invalid` state to what a screen
reader sees; moving the caret to it is the application's call, one line
away, and the two together are what makes a validation message
actionable rather than decorative.

## Scopes and traps

<LiveExample id="focustrap" height="360" />

<<< @/src/examples/FocusTrapExample.tsx#trap

`trap(node)` pushes a scope: the Tab traversal collects only that
subtree and wraps inside it, and `focus()` refuses a node outside it and
returns false. Both halves of "modal" come from that one rule, which is
why nothing in the example listens for Tab. Try it: the dialog's three
stops cycle, and the two buttons behind it are unreachable until it
closes.

- **Traps nest.** A confirmation dialog opened over a dialog pushes a
  second scope, and each release restores its own opener.
- **A removed subtree is an implicit release.** A scope whose root has
  left the tree is a trap that ended, so it pops and restores. A dialog
  that simply unmounts hands the keyboard back without sequencing its
  own teardown, and a `releaseTrap()` afterwards does nothing.
- **Entering a scope is settled once per frame.** A `ref` fires while
  its node's props are being reconciled, which is before its children
  exist, so a trap taken from a ref sees an empty box with nothing
  focusable in it. The runtime moves focus into the innermost scope
  after the frame's tree is built and before layout, which is why the
  caret is in the dialog on the frame that mounts it, and why a
  component does not have to know when its children appear.

Escape follows from the same rule rather than needing a stack. Every
overlay that takes the keyboard traps focus, so a dialog binds Escape on
its own content and the key cannot reach a dialog underneath: nothing
underneath is focusable.

`Dialog`, in [the component library](/components/), is this with an
entrance, a backdrop and the semantics already attached. Reach for it
first; take the trap yourself when you are building something the
library does not have.

## Autofocus

`autoFocus()` is a modifier, so it goes on the element that should take
the caret and needs no ref, no service and no lifecycle hook.

It fires on the node's **first layout**, not on attach. A modifier
attaches while its node is still being built, before the builder inserts
it into its parent, so a focus taken at attach time would produce a
focused node that Tab could not reach and whose focus event no ancestor
would see. The first layout is the first moment the node is
demonstrably on screen, and for a node mounted into a live tree it is
the same frame.

It fires once. A panel that is laid out again does not steal focus back
from whatever the reader moved it to, which would make an autofocus a
trap of a different kind. A node that cannot take focus is left alone
and raises nothing.

In the example above the field is autofocused, which is why the caret
lands there rather than on the dialog's first focusable node. That is
the point of it: the scope's own entry rule picks the first stop, and
`autoFocus()` is how you say it should be somewhere else.

## Roving focus

A group whose items are all tab stops makes a person press Tab five
times to get past it. The pattern here, as in ARIA, is that the group is
**one tab stop and the arrows move the choice inside it**:
[RadioGroup](/components/radio-group), [Tabs](/components/tabs),
[Tree](/components/tree), [LazyList](/components/lazy-list) and
[DataTable](/components/data-table) all work that way. A
[Toolbar](/components/toolbar) deliberately does not: it is a group for
a screen reader, and the buttons in it stay ordinary tab stops.

There is no roving `tabIndex`, because there is no `tabIndex`. Focus
stays on the container, which is the node carrying the role and the one
the ring marks; which item is chosen is said by that item's own
selection colour and by the semantics record, not by moving focus into
it. So a group that behaves this way sets `focusable` on the container,
handles the arrow keys there, and renders its items as ordinary
non-focusable nodes.

## The focus ring

`focusRing()` draws a ring around whatever holds focus, when that focus
is worth showing. Focus that a pointer press put there is not: a ring on
every clicked button would mark a control nobody is about to drive with
the keys, so the ring waits. It appears for focus the keyboard reached,
for focus placed by code before any pointer press, and on a mouse-focused
control the moment a key is pressed; the next press takes it away again.
This is what a browser's `:focus-visible` does, and the focus manager
does it here by remembering whether the last input was the pointer or
the keyboard. A modifier can ask the same question through
`host.isFocusVisible()`.

The ring is a decoration rather than an overlay for two reasons that
decide its behaviour:

- **It is clipped with the node.** A ring on a row scrolled half out of
  a scroll container is cut off at the same edge the row is, because it
  is painted inside the node's own paint pass under its ancestors'
  clips. Something drawn over the finished scene would float past the
  scroller's edge.
- **It sits outside the node's own box.** The ring is `offset` pixels
  clear of the control, so it never covers a border or any content,
  which is what a bound `borderColor` could not avoid doing. Its radius
  defaults to the node's own corner radius grown by that distance, so it
  stays concentric without the caller knowing either number.

| Option   | Default               | What it is                                      |
| -------- | --------------------- | ----------------------------------------------- |
| `color`  | the `focusRing` token | A palette name or a literal colour              |
| `width`  | 2                     | Thickness of the band                           |
| `offset` | 2                     | Clear space between the node's box and the ring |
| `radius` | the node's, grown     | An explicit corner radius                       |
| `after`  | unset                 | `'children'` paints the ring over the content   |

The colour names a palette entry and is resolved at paint against
whatever theme the node inherits, so a ring inside a dark card is the
dark palette's without the modifier reading the environment. Called with
no options it returns one shared value, which is the cheapest a modifier
can be: the comparison matches on the first line and does no work.
Options of your own are compared by what they hold, so a ring declared
inline survives a re-render as long as its options are plain data. See
[modifiers](/interaction/modifiers).

Every control in `@gesso/components` already carries it. An element of
your own carries it by name.

## Limits

**There is no `:focus-visible`.** The ring shows for any focus,
including focus taken by a pointer press, so a button shows a ring after
being clicked. Distinguishing the two means the input stack recording
which device last moved focus, which nothing does.

**Focus moves by keyboard scroll the focused node into view; focus
moved by pointer does not.** Someone who clicked a control can already
see it, and scrolling would pull it out from under a pointer still
resting on it.

**Where this was checked.** The behaviour on this page is covered by the
spec beside the example above, which drives Tab through the focus
manager and every press through the hit tester, and by the runtime's own
specs for scopes, nesting, refusal from outside, and a scope whose
subtree was removed. The ring was checked by hand in the framework
playground in Chrome on Linux, in the render worker, on both Canvas2D
and WebGPU: Tab moves it from control to control, and a ring on a row
inside a small scroller is cut off at the scroller's edge as the row
scrolls out. Its behaviour under a rotated ancestor rests on an argument
rather than an observation.

## Next

[Modifiers](/interaction/modifiers) is the mechanism `autoFocus()` and
`focusRing()` are built on, and
[pointer and keyboard](/interaction/pointer-and-keyboard) is what
decides who can hold focus in the first place.
