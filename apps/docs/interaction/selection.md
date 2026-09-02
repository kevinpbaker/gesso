---
description: Highlighting and copying text that nobody types into: which text is selectable, how a selection spans nodes, what copy sends to the shell, and what the model does not do.
---

# Selection

A page of HTML gives text selection away. A canvas gives none of it: a
heading is glyphs, a paragraph is glyphs, and dragging across them
selects nothing at all unless something is written to make it happen.

So this is the framework's, and it is a separate thing from the caret
in a field. [`<editabletext>`](/interaction/text-editing-and-ime)
carries its own selection in its model, because the caret, the IME and
undo all need it there. Every other string on the canvas has no model,
and the selection controller is what lets a person drag across a
heading and the paragraph under it and copy what they highlighted.

## What is selectable

Text is selectable unless something says otherwise. `selectable` is
read up the ancestor chain the way CSS reads `user-select`: the nearest
node that sets it decides.

| Where                | Effect                                                    |
| -------------------- | --------------------------------------------------------- |
| Nothing set          | The text is selectable                                    |
| `selectable={false}` | That node and everything under it are out                 |
| `selectable={true}`  | That node and everything under it are back in             |
| Inside a `<button>`  | Out by default: dragging across a control should press it |
| Anything inert       | Out, with the rest of its subtree                         |

Inert means `disabled`, `pointerEvents="none"`, `visible={false}` or a
zero `opacity`: the same predicate the hit tester and the focus manager
read, so what cannot be pressed cannot be highlighted either.

Because the nearest answer wins, a label inside a button opts back in
with `selectable={true}` on the label itself. The library's components
use the other direction: the text inside a `Checkbox`, a `Tab`, a
`Tree` row or a `DataTable` cell sets `selectable={false}`, so a drag
across a control does not highlight its chrome.

Only `<text>` takes part. An editable is not in the corpus (it has its
own selection), an image is not text, and a node drawing an empty
string is skipped.

<LiveExample id="selection" height="320" />

<<< @/src/examples/SelectionExample.tsx#prose

## A selection spans nodes

A selection is two ends: an anchor where the press landed and a focus
that follows the pointer. Ordering them needs reading order, so the
selectable text under the root is collected into a list in document
order when a press starts, and the range covers the tail of the first
node, all of every node between, and the head of the last.

Document order, not paint order. `zIndex` is deliberately not honoured,
because what is painted on top is not what is read first. The walk is
redone on each press, so it costs one tree traversal per gesture and
nothing per frame.

The pointer does this:

| Gesture                    | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| Press                      | Places both ends at the offset under the point                   |
| Shift and press            | Moves the focus end, keeping the anchor                          |
| Second press within 500 ms | Takes the word under the point                                   |
| Third press                | Takes the line                                                   |
| Drag                       | Moves the focus end, across node boundaries                      |
| Press on anything else     | Clears the selection, as pressing outside text does in a browser |

A drag is the one gesture that has to leave the node it started on, so
the controller hit-tests each move for itself rather than using the
node the press captured. When the pointer is over a gap, a margin or
another widget, the nearest selectable node's box wins, with vertical
distance weighted over horizontal: a point beside a line belongs to
that line rather than to a nearer one on the row above.

A press inside a field ends the canvas selection, and focus moving into
a field clears it too, so two selections are never lit at once.

## Copy

`Ctrl+C`, or `Cmd+C` where the user agent says the host is a Mac, hands
the selected text to the shell. There is no clipboard in a render
worker, so this crosses the thread boundary as a request that
`WorkerApp` posts to the main thread and `GessoApp` performs directly.

The text is the selected nodes joined by a single newline, which is the
paragraph break a reader expects when they paste a heading and the text
under it.

Application code puts its own text on the clipboard through the same
request, `ShellService.copyText`:

<<< @/src/examples/SelectionExample.tsx#copy

| Key          | What it does                                        |
| ------------ | --------------------------------------------------- |
| `Ctrl/Cmd+C` | Copies the selection; not consumed when it is empty |
| `Ctrl/Cmd+A` | Selects every selectable node under the root        |
| `Escape`     | Clears the selection                                |

These are keyboard defaults, so they run after the application's own
`onKeyDown` listeners and only if none of them called
`preventDefault()`. A focused editable claims all three first, since
inside a field they belong to the field, and an open
[find](/interaction/find) session claims Escape, so Escape twice is
"close the bar, then drop the match".

Two of them also have to be cancelled in the shell. The worker's answer
cannot come back in time to stop a browser default, so `WorkerApp`
cancels the select-all shortcut on the canvas blind, alongside Tab.
Without it, `Ctrl/Cmd+A` would select the page around an application
that is busy selecting its own text.

## How it is drawn

The resolved range per node is written onto the node itself, as a
`textSelection` property that paint folds into its state. That is the
same trick the editable's model uses, for the same reason: the node is
the identity that survives reconciliation, and in the render worker the
graph is all the renderer has, so a selection threaded through the
render context would need a second channel across the barrier.

Both backends then draw the highlight from the lines they had already
laid out to draw the text, in one order: find matches, then the
selection over them, then the glyphs.

The colour is the theme's `primary` at 0.35 opacity. `selectionColor`
on the node, or on any container above it, overrides that.

## Limits

**Only what is drawn can be selected.** A `<text>` capped by `maxLines`
shows part of itself, and the geometry truncates the source to the last
drawn line before answering anything, so a selection over an ellipsised
paragraph stops at the last visible character. What copy yields is the
real source text up to there, never the `…` standing in for the rest.

**There is no keyboard selection.** Arrow keys do not extend a canvas
selection; copy, select all and clear are the whole keyboard surface.

**A selection cannot cross into a field.** The two models are separate,
so a drag that starts in a paragraph and ends inside an
`<editabletext>` does not select the two together.

**An application cannot read or write it.** There is no selection
service and no selection-changed event: no component can ask what is
highlighted or highlight something itself. A screen that needs to know
has to hold that state itself, and put text on the clipboard with
`ShellService.copyText`.

**It does not outlive its nodes.** When a selected node leaves the
tree, the whole selection is dropped, because the range that is left no
longer means anything. Virtualization and route changes both do this.

**Where this was checked.** The controller, the paragraph geometry and
the interaction rules have unit specs, the example on this page is one,
and a renderer parity case draws a selection spanning two wrapped
paragraphs on both backends and compares the calls. The highlight has
not been checked against a screenshot in a browser, so what these pages
verify is the geometry and the draw calls rather than the pixels.

## Next

[Find](/interaction/find) is the same corpus searched rather than
dragged, and its active match is one of these selections.
