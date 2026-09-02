---
description: Deleting a row behind a confirmation, driven by the keyboard alone, with the focus handed back on cancel and moved deliberately on confirm.
---

# A dialog flow

Confirming a destructive action is four screens' worth of state in one
component: nothing happening, a dialog asking, a deletion that can
still be taken back, and a deletion that cannot. The parts are all in
the library. What this recipe is about is the seams between them, and
in particular where the keyboard goes at each one.

It assumes [focus and traps](/interaction/focus-and-traps) for what a
trap is, and the [Dialog](/components/dialog) and
[Toast](/components/toast) pages for the two components it uses.

<LiveExample id="recipedialog" height="360" />

Press Tab to reach a row's Delete button and Enter to open the dialog.
Tab inside it and the ring stays on the two buttons. Escape or `Keep
it` puts the keyboard back on the row you came from. `Delete` removes
the row and puts the keyboard on `Undo`, so the deletion can be taken
back with the same key that made it.

## The flow, as cells

<<< @/src/examples/RecipeDialogExample.tsx#flow

Four cells, and the whole of the flow is which of them is set. There
is no state machine type and no reducer, because the four states are
already distinguishable: `confirming` holds the note being asked
about, `pending` holds the note that can still come back, and both are
null the rest of the time.

Every handler is written to be safe to run twice, and one of them has
to be. `Dialog` reports a close twice, once from the overlay entry and
once from the component; [its page](/components/dialog) has the note
and the spec that asserts the count. Setting a cell is unaffected by
being set again, which is why `dismiss` is one assignment. A handler
that appended to a log, or decremented a counter, would be a bug
waiting for its second call.

`undo` keeps the index as well as the note, so the row goes back where
it was rather than onto the end. That is a one-word decision that a
reader will notice immediately if it goes the other way.

## One hand-written button, used everywhere

<<< @/src/examples/RecipeDialogExample.tsx#button

Every button in this recipe is an intrinsic `<button>` rather than a
library control, so it has to supply four things: the hover and press
states, the pointer cursor, the focus ring, and the keys. Nothing in
the runtime turns Enter on a focused button into a click, and
[keyboard operability](/access/keyboard) is where that line is drawn
and why. Writing the four once, in a helper, is the difference between
a flow that works from the keyboard and one that mostly does.

The modifiers are module constants. A modifier's arguments are
compared by identity, so a fresh `focusRing()` per render would detach
and re-attach the ring on every frame.

## The row

<<< @/src/examples/RecipeDialogExample.tsx#row

The row is a `listitem` with no label of its own, so its name comes
from the text it draws. The button inside declares a role, so it is a
node in its own right rather than being folded into the row's name,
and its label says which note it deletes: three buttons all called
"Delete" are three identical announcements. See
[semantics](/access/semantics) for the naming rule this relies on.

## Where the keyboard goes

<<< @/src/examples/RecipeDialogExample.tsx#screen

The two ends of the flow need different answers, and only one of them
is automatic.

**Cancelling is the framework's.** A trap restores focus to whatever
held it when the trap was taken, and that is the row's Delete button.
Nothing in this file arranges it, and nothing should: the dialog took
the trap, so the dialog releases it.

**Confirming cannot be.** The button that opened the dialog leaves
with the row it was on, and a trap will not restore focus to a node
that is no longer in the tree, so focus is dropped instead of landing
somewhere arbitrary. Something has to say where it goes, and the undo
button says it, with `autoFocus()`. The modifier fires on the node's
first layout and once only, so the button that appears in the same
frame the row leaves takes the caret, and the reader can undo with the
key they just pressed.

The notice is `dismissible={false}` on purpose. Its close button would
be a focus stop drawn over the application in an order nothing on the
page predicts, so the action lives in the page and the toast only
announces. It is a `status` rather than an `alert`, because the
deletion has already happened and interrupting a screen reader
mid-sentence to say so is not an improvement.

**The undo window is the notice's lifetime.** When the toast's timer
closes it, `commit` clears the pending deletion, and the Undo button
goes with it. Tying the two together is what stops the message saying
one thing while the list means another.

## What has been checked

The spec beside the example drives the whole flow with the keyboard
and never sends a click: Tab to the row, Enter to open, Tab inside the
trap, Escape and Enter to close it both ways, Enter to confirm, and
Enter again to undo. It asserts the trap holds, that focus returns to
the opener on cancel, that it lands on the undo on confirm, that the
note goes back to its own index, and that advancing the clock past the
notice's duration makes the deletion permanent.

What that does not cover is drawing, or the pointer. The canvas above
is Canvas2D, and Chrome and other Chromium browsers are the extent of
what this page has been opened in.

## Next

[A settings page](/recipes/settings-page) is the same library used for
a screen that needs no confirmation at all, and
[Menu](/components/menu) is the other overlay a keyboard can reach.
