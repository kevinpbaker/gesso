---
description: The off-screen DOM the shell keeps over the canvas, how a record becomes an element, and how a screen reader's press comes back as ordinary input.
---

# The mirror

A canvas has no accessibility tree. The
[semantics tree](/access/semantics) says what every node means, and on
its own that changes nothing: the platform still sees one element where
the whole application is.

So the shell keeps a DOM tree over the canvas and writes the semantics
into it. One transparent `<div>` per record, carrying that record's
ARIA, positioned where its node is. This is the approach Flutter web
takes, for the same reason: it is the only one that works with the
assistive technology that already exists, on every webview Gesso
targets.

<LiveExample id="mirror" height="240" />

<<< @/src/examples/MirrorExample.tsx#note

Nothing in that component mentions accessibility. The field and the
button are ordinary application code, the records come from their
roles, and the mirror is the shell's job.

## It is already on

`accessibility` defaults to true in both configurations, single thread
and render worker, so the canvas above is mirrored, as is every other
canvas on this site. An application that is accessible only when its
author remembered a flag is an application that is not accessible.

`SemanticsMirror` appends a `<div data-gesso-semantics>` to the
document body and keeps it over the canvas: `position: fixed`, resynced
on resize and on scroll rather than on every frame, because a
`getBoundingClientRect()` per frame on the main thread is the forced
layout the worker configuration exists to avoid.

The container is transparent and un-drawable, and specifically not
`display: none`, `visibility: hidden` or zero opacity. Each of those
would take the subtree out of the accessibility tree as well as out of
the picture, which is the whole content of the element.

`accessibility: false` opts out, and it is a real opt-out: it stops the
render worker computing geometry as well as stopping the shell building
elements. It is there for a host that mirrors the tree itself, and for
measuring what the mirror costs.

## What travels, and how often

Three things change at three different rates, so they are one message
with three parts rather than three messages.

| Part      | When it is sent                                                           |
| --------- | ------------------------------------------------------------------------- |
| `patches` | On a frame that changed what the tree means: adds, updates, removals      |
| `boxes`   | On a frame that moved something, and only the ones that moved             |
| `focused` | Only when focus moved, so a shell that sees no key leaves DOM focus alone |

An update with nothing in it is never sent. The spec beside the example
stands where the shell attaches its mirror and reads what a frame hands
it:

<<< @/src/examples/MirrorExample.spec.ts#update

Records stay geometry-free, which is what keeps "no semantics changed"
cheap and true, and the mirror still needs a rectangle, so position
travels beside the records instead of inside them. An element that is
not over the node it stands for gives a screen reader's cursor, a
magnifier and touch exploration the wrong answer.

Each record becomes attributes on its element: `role`, `aria-label`,
`aria-description`, `aria-disabled`, the value and set attributes, and
one attribute per state, so `checked` is `aria-checked="true"` and
`collapsed` is `aria-expanded="false"`. Every attribute a record can
write is cleared before the record is written, so an attribute a node
stopped saying does not linger. Elements are nested under their parent
at the index the record gives, because document order is the order a
screen reader reads in.

Prose is the exception to `aria-label`: a heading, a paragraph and a
loose line of text are named by what they contain, so the text goes
into the element rather than onto an attribute. A text field is the
same in a different way: for `textbox` and `searchbox` the mirror
writes the value as the element's text, because that is where the
platform reads a field's value from. `aria-valuetext` is for a slider.

## Elements are generic, and never take the pointer

A `<div role="button">` is announced as a button and has no behaviour
of its own. That is deliberate: Enter on it reaches the application's
keymap once, rather than also synthesising a click the way a real
`<button>` would, so every activation path ends in exactly one press.

The container is `pointer-events: none`, so a mouse press still goes to
the canvas underneath. The clicks that arrive in the mirror are the
ones an assistive technology synthesises, which are exactly the ones
that have nowhere else to go.

Mirrored elements carry `tabIndex = -1`. They can be focused
programmatically or by an assistive technology, never by Tab: the
application owns its focus order and the mirror follows it, and a
browser walking this tree would be a second, silent focus model.

## What comes back

An action taken on an element is turned back into ordinary input. It
arrives as an id and an action, never as a coordinate, and it goes
through the same controllers a pointer and a keyboard go through:
`focus` through the focus manager, `click` as a press at the node's
centre after focusing it, and `setValue` as a replacement edit through
the editing controller.

<<< @/src/examples/MirrorExample.spec.ts#actions

Routing an assistive technology's press into components directly would
have made a second activation path, covered by one test and diverging
from the first one quietly. Going through the controllers also means an
assistive technology cannot escape an open focus trap any more than Tab
can: the runtime decides whether a node may take focus, and the answer
comes back as the next update.

## The focused field is the editing proxy

One node is not mirrored while it has focus. A focused editable's DOM
focus belongs to the hidden `<textarea>` the shell keeps for text
input, because that is the only element an IME will compose into.

So the mirror hands that element the record instead of taking focus
from it: the proxy drops its `aria-hidden` and takes the field's role,
label and states, and claims focus back from whichever mirrored element
had it. The element a screen reader reads and the element the person is
typing into are then the same element, which is the only arrangement in
which they cannot disagree. See
[text editing and IME](/interaction/text-editing-and-ime) for what the
proxy is doing the rest of the time.

## What it costs

On the framework playground in the render worker, with 262 mirrored
elements, the worst `semantics` phase over a scrolled run read 1.70 ms
with the mirror attached and 1.70 ms without it. The peak is the tree
rebuild, and the geometry sweep does not move it. The mirror draws
nothing, so the renderer's output is unchanged.

## Limits

**No screen reader has been run against it.** This is the honest state
of it, and it is worth reading before trusting the rest of the page.
What has been checked, on every commit, is the specs; and by hand, in
headless Chrome, **Chrome's own computed accessibility tree**, which is
the tree a screen reader consumes rather than the DOM the mirror
writes. That distinction matters: an element with the right attributes
can still be pruned by the platform, and only the computed tree says
so.

On the playground's two example screens that tree carries 31 and 41
nodes, including `button` per keypad key, `switch 'Remember this
device'` with `checked=true`, `list 'Notes'` with a `listitem` per
note, and `textbox 'Note title'` with the note's text as its value. A
synthesised press on a mirrored key, which is what "do default action"
on macOS and `Invoke` on Windows produce, moved the application on and
left the next key focused in the accessibility tree. Focusing the
mirrored title field moved DOM focus to the editing proxy, and typing
reached the application. This site's own counter was checked the same
way, by clicking the mirrored element rather than the canvas.

VoiceOver and NVDA have not been run against it, and neither can be
automated from the machine this was built on. What the gate proves is
that the information reaches the platform's accessibility API and that
actions come back. Whether VoiceOver's rotor and NVDA's browse mode
make good use of it is an argument from ARIA conformance, not evidence.

**Not implemented:** live regions, so nothing announces itself when it
changes; `aria-activedescendant`, so the active option inside a
composite widget is not named to the platform as active; and
find-in-page and text selection across the mirror, which stop at the
canvas.

**The specs on this page stand at the seam**, driving the update a
mirror is handed and the action it sends back. The DOM writing itself
is covered by `SemanticsMirror.spec.ts` in `@gesso/framework`, against
a DOM double, because the test suite runs in Node with no document in
it.

## Next

[Keyboard operability](/access/keyboard) is the other half of this: a
screen reader can read a control the mirror describes, and a person can
only use it if the keyboard reaches it.
