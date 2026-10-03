---
description: The editable node under the component library, its caret and selection, the commands it answers to, composition from an IME, and what the platform still owns.
---

# Text editing and IME

[TextInput](/components/text-input) is a label, a message and a theme
wrapped around one node. This page is the node: `<editabletext>`, what
it owns, and which parts of typing a canvas application cannot own at
all.

Reach for the component first. Come here when you are building a
control the library does not have, or when you need to know why the
component behaves as it does.

## The node

```tsx
<editabletext value={name} onInput={event => (name.value = event.value)} />
```

Beyond every common prop, an editable takes `value`, `placeholder`,
`multiline`, `readOnly`, `textWrap`, `verticalAlign`, `caretColor`,
`selectionColor` and `placeholderColor`. The three colours default from
the theme, so a field that names none of them is already legible in
light and dark: the caret takes the text colour, the placeholder takes
the theme's `textMuted`, and the selection is the theme's `primary` at
a third of its opacity.

The text itself does not live in the `value` property. It lives in a
model held on the node, created the first time layout, paint or input
reaches for it, and the node is the identity that survives
reconciliation, so the model needs no registry of its own. That is what
keeps a keystroke off the application's critical path: the character is
in the model before any cell has been written, and layout, paint and
the caret all read it from there.

`value` is still honoured. Whenever the property differs from the last
value synchronised into the model, the model takes it. An application
that writes every reported value straight back therefore controls the
field and disturbs nothing, and one that never writes leaves the
person's text alone.

## An editable, and the two listeners

<LiveExample id="editing" height="260" />

<<< @/src/examples/EditingExample.tsx#field

Type a digit into the field and nothing happens, because the edit was
refused before it reached the text. Paste one and the same thing
happens, for the same reason: both arrive as an insertion carrying
`data`.

## Vetting an edit

Every change goes through two events on the node.

**`onBeforeInput`** runs first, and cancelling it with
`preventDefault()` drops the edit. It carries the DOM's own
`inputType` vocabulary whether the edit came from a shell's
`beforeinput`, a key the runtime resolved itself, or a paste:

| `inputType`                                       | Where it comes from                              |
| ------------------------------------------------- | ------------------------------------------------ |
| `insertText`                                      | Typing, and an insertion from a key              |
| `insertReplacementText`                           | Setting the whole value, as a screen reader does |
| `insertFromPaste`                                 | A paste                                          |
| `insertLineBreak`, `insertParagraph`              | Enter in a multiline field                       |
| `deleteContentBackward`, `deleteContentForward`   | Backspace and Delete                             |
| `deleteWordBackward`, `deleteWordForward`         | The same with the word modifier                  |
| `deleteSoftLineBackward`, `deleteSoftLineForward` | Deleting to a line end                           |
| `historyUndo`, `historyRedo`                      | Undo and redo                                    |

`data` is the text an insertion carries, and null otherwise. A rule
written against `data` therefore covers typing, pasting and an
assistive technology setting the value, which is why the example refuses
digits with one condition rather than three.

**`onInput`** runs after the text changed, carries the whole new
`value` with `selectionStart` and `selectionEnd`, and bubbles, so a
form can watch all its fields from one listener. Nothing is reported
when an edit changed no text.

### Owning undo

`historyUndo` and `historyRedo` arrive through `onBeforeInput` like
every other edit, so an application that keeps its own history (an
editor whose document is several fields, where one undo has to cover a
paragraph split as well as the typing either side of it) cancels them
there and applies its own. The field's history is also cleared whenever
`value` changes from outside, because text the application replaced is
text the field never typed: a document-level history is the one that
can say what an outside change undoes to.

## The caret and the selection

A press places the caret, and Shift extends the selection to it. A
second press within half a second selects the word, a third the line,
and dragging after any of them extends from the anchor.

Moves and deletes step by grapheme, through `Intl.Segmenter` with a
surrogate-pair fallback, so the caret never splits an emoji. Word
boundaries come from the same segmenter, which is what makes a CJK word
a word.

The caret's position comes from the same paragraph layout the renderers
draw with, built from the same measurer the layout engine sized the node
with. That is a correctness property rather than an implementation
note: a caret cannot land between two characters that the renderer drew
somewhere else. See [text](/guide/text) for the measurer itself.

It blinks on the runtime's timer, 530 ms visible and 530 ms hidden from
the last activity, and one pending timeout repaints the node when it
next toggles. Nothing is scheduled while no field has focus, while a
composition is open, because an IME caret must not wink, or while the
page is hidden.

An undo entry coalesces a run of typing, a run of backspaces, or a whole
composition. Placing the caret with a press breaks the run, so what
comes next is its own entry.

`readOnly` takes focus and allows the caret, the selection and copying,
and refuses every edit. `disabled` is different and stronger: an inert
node takes no pointer events, no focus and no keys at all.

## The commands

A key that reaches a focused editable, and that no application listener
claimed, is looked up in one keymap and turned into a command: a
**move** or a **delete** by grapheme, word, line or document, a
**newline**, **select all**, **undo**, **redo**, or an **insert**.
Vertical moves are their own unit, because up and down a visual line
need the paragraph layout rather than the text.

The keymap follows the host's conventions, decided once from the user
agent, which a render worker can read as readily as the main thread:
Command jumps to the ends of a line and of the text and Option steps by
word on a Mac, and Control does both elsewhere.
[TextInput's keyboard table](/components/text-input) lists the map key
by key; it is the node's map, not the component's.

Two rules are worth knowing before you write an `onKeyDown`:

- **Editing is a default behaviour.** The application's listeners run
  first, and a key one of them marks handled never reaches the keymap.
  That is exactly how a single-line field's `onSubmit` takes Enter away
  from the text.
- **Enter in a single-line field is not the field's.** The command is
  resolved and then declined, so it goes on being an ordinary key the
  application can answer.

## Composition from an IME

Keyboard events carry keys, not characters. Which character a key
produces depends on the OS layout, dead keys compose across presses,
and an IME builds a word over several keystrokes before committing it.
The browser resolves all of that in exactly one place: inside a focused,
editable DOM element, on the main thread. The application, its caret
included, is in a render worker.

So the shell keeps a hidden `<textarea>`. While the runtime reports a
focused editable, that element takes DOM focus and is positioned at the
caret, and:

- it cancels every `beforeinput` of its own, so its content never
  becomes a second truth, and forwards the ones that carry text as edit
  intents;
- it empties itself when a composition starts, so the composition
  string is its whole value and its own caret, which is where the OS
  opens the candidate window, sits at the runtime's caret rather than
  at the corner of the page;
- it reports the composition as it is built and the result when it
  commits;
- it mirrors the runtime's text and selection between edits, so native
  copy and the IME's context are right.

The only thing ever read back from that element is the composition
string, which is the one thing only the browser knows.

While a composition is open the composing text is in the model, both
renderers draw the composition underline, and the caret holds steady.
Nothing is reported to the application until the commit, and the whole
composition lands as one undo entry.

Deletes, newlines, undo and redo are deliberately **not** forwarded from
the textarea. They reach the runtime as key presses and are applied
there; the element fires their `beforeinput` too, but only when its
mirror happens to have something at the caret, so forwarding both
applied every such edit twice.

## What the platform still owns

- **The keyboard layout, dead keys and the IME**, for the reason above.
- **The clipboard.** Copy, cut and paste are handled on the main thread
  against the runtime's text, because the clipboard is reachable only
  from a user gesture there. Newlines pasted into a single-line field
  become spaces. A paste carries the clipboard's HTML too, when it has
  some, as `html` on the `insertFromPaste` `onBeforeInput` (and on a
  `Paste` event and an editing group's edit): the field inserts the
  plain text, and an editor that keeps headings, lists and links can
  cancel that and convert the HTML instead. A component that wants to put text on the clipboard
  itself asks `ShellService.copyText`, which crosses the barrier as a
  request rather than as a permission.
- **The soft keyboard.** A phone raises it for a focus a person's
  gesture caused and for no other, and in the worker configuration the
  runtime's answer to a press arrives a frame later, inside a message
  handler rather than a gesture. The shell re-takes focus from the
  `pointerup` of the press that started editing, and only that press:
  asking again while the keyboard is up makes it blink.

## A field is a window on its text

A field shrinks to the space it is given and scrolls or wraps inside,
and it passes no minimum width up to its parent, so a row does not
push its other children narrower with every character typed. The box
clips and the text behind it carries a scroll offset, exactly as a
scroll container carries one for its children.

It follows the caret, which is what a text field does, and the caret
is then revealed through any real scroll containers above it. The
wheel scrolls it too, on either axis it overflows, stopping where the
caret would, and without moving the caret; a wheel it has no room for
goes on to the scroll container around it. A multiline field shows the
overlay scrollbar a scroll container does while it scrolls, which
hovering its edge also reveals and which can be dragged once it shows.
A single-line field draws none.

It is not a scroll container, though. It has no children to scroll,
and a finger on it places the caret rather than panning the text.

## Semantics

An `<editabletext>` is a `textbox` without being told, and its
`valueText` is its text rather than its name, because an editable's
content is its value. Give it a `label` and that is the accessible
name. Those are the same records the accessibility mirror hands the
platform, and the same ones the spec beside the example queries.

## Fields that select as one

A document editor is usually many fields, one per paragraph, because
each block lays out and styles on its own. A person still selects
across them as if they were one text. Set `editingGroup` on the
container, and the editables inside it select as one:

```tsx
<column
  editingGroup={{
    onEdit: edit => replaceRange(edit.start, edit.end, edit.inputType, edit.data),
    copyText: (start, end) => toMarkdown(start, end)
  }}>
  {blocks.map(block => (
    <editabletext key={block.id} value={block.text} multiline={true} />
  ))}
</column>
```

Inside a group:

| Gesture                             | What it does                                           |
| ----------------------------------- | ------------------------------------------------------ |
| An arrow off the edge of a field    | Moves into the next field: up and down keep the column |
| Shift and an arrow off the edge     | Extends the selection into the next field              |
| Dragging out of a field             | Extends the selection into the fields it crosses       |
| Shift and a press in another field  | Extends the selection there from where it was anchored |
| `Ctrl/Cmd+A`                        | Selects every field in the group                       |
| A plain arrow over such a selection | Collapses it to the side the arrow points to           |
| A press beside or between fields    | Lands in the nearest field, at the nearest position    |

Every field between the two ends draws its part of the selection.
Focus is in the field holding the moving end.

A press in the group that lands on none of its fields (in its padding,
in the gap between two, or on the plain structure a field sits in, such
as a list item's bullet) goes to the nearest field by height, as a
document puts the caret on the nearest line. A press on something that
answers presses itself, a button or anything with a click or pointer
listener, is left to it.

**What the person does to a selection that spans fields is yours.**
Typing, Backspace and Delete, Enter, paste and cut over it are not
applied to any field. They go to `onEdit` with both ends, as positions
(`{ node, offset }`) in document order, and an `inputType` in the DOM's
vocabulary. Only the application knows that joining a heading to the
list under it gives a heading, so it changes its document, which
changes the fields, and puts the caret where it belongs. A selection
inside one field is that field's, edited as always.

**Commands over it are yours too.** A key reaches the focused field
first, and that field holds only its own part, so a group that runs
its own commands over the whole selection (bold, a link, indenting
every block in it) listens with `onSelectionChange`, which hears the
selection begin, move and end. To leave a selection selected after
such a command, set it again with `EditingService.select(anchor, focus)`,
which takes two positions in one field or across a group's fields.

**Copy and cut take all of it.** The shell is handed the selected text
while such a selection is up, so the browser's own copy and cut work on
it. By default that's each field's selected text joined by newlines;
`copyText` says what it should be instead, such as markdown. `copyHtml`
gives HTML that a copy puts on the clipboard beside the text, so pasting
into a document or an email keeps the formatting. It's asked for a
selection inside one field of the group as well, and only again when
the selection or the text under it changes, not every frame.

## Limits

**Where this was checked.** The editing path was verified by hand in
Chrome on Linux, and is covered by specs for the model, the geometry
and the keymap in isolation, for the runtime end to end, for the
protocol, for both renderers, and for the proxy against a small fake
DOM. WKWebView and WebView2 are named as targets and have not been
tested.

**A composition commit raises no `beforeinput`.** The composition
events carry it instead, so a rule written in `onBeforeInput` sees
typed and pasted text but not text an IME committed. Vet that in
`onInput` if it matters.

**Bidirectional text is partial.** `textDirection="rtl"` mirrors every
x against the line's right edge, and hit testing is direction-aware,
but mixed left-to-right and right-to-left runs within one line are not
reordered. The renderers do not shape them either.

**Not here:** password masking, `maxLength`, drag-and-drop of text, and
extending the selection by whole words while dragging after a double
click. There is no `type` prop, so a field that must hide what it holds
is not this node yet.

**The soft keyboard path is unverified on a device.** Its focus
mechanics are covered by unit tests against a fake DOM and were
exercised with synthetic touch pointers in Chrome, but the behaviour it
exists for is an iOS one that cannot be observed off iOS.

## Next

[TextInput and TextArea](/components/text-input) is this node with a
label, a validation message and the library's theming, and is what an
application should reach for first.
