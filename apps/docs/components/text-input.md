---
description: 'The text field and its multiline twin: the value, the validation message, the editing the field arrives with, and what it announces.'
---

# TextInput and TextArea

`TextInput` is one line of text with a name above it and a message
under it. `TextArea` is the same component with `multiline` on: one
implementation, because there is one behaviour, and the only difference
an application sees is what Enter does. Reach for either wherever
someone types free text; a quantity belongs in
[NumberInput](/components/number-input), which parses and steps.

<LiveExample id="textinput" height="420" />

The email field is controlled and the nickname field is not. Type into
each, then press the button: it writes the cell the email field is
bound to, and the field follows without anything having been typed.

<<< @/src/examples/TextInputExample.tsx#fields

## Props

`TextAreaProps` is `TextInputProps` without `multiline`; everything
else on this table is shared.

| Prop           | Type                      | Default | What it does                                                                                                                                            |
| -------------- | ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`        | `string`                  | none    | The text to show. Supplying it makes the field controlled.                                                                                              |
| `defaultValue` | `string`                  | `''`    | The text to start with, for a field that owns its own value. Supplying both throws, naming the component.                                               |
| `onChange`     | `(value: string) => void` | none    | Called with the whole new text after every edit.                                                                                                        |
| `label`        | `string`                  | `''`    | Drawn above the field and used as its accessible name. An empty label draws nothing.                                                                    |
| `placeholder`  | `string`                  | none    | Drawn in the field while it is empty, and measured: an empty field is at least as wide as its placeholder.                                              |
| `description`  | `string`                  | `''`    | Drawn under the field, and announced after the name. An `error` replaces what is drawn.                                                                 |
| `error`        | `string`                  | `''`    | A non-empty string marks the field `invalid`, turns its border to the `danger` token, and shows this message under it in place of the description.      |
| `disabled`     | `boolean`                 | `false` | Refuses focus, so the field is not a tab stop and takes no edits, and draws the label in the disabled foreground token.                                 |
| `readOnly`     | `boolean`                 | `false` | Takes focus, and allows the caret, selection and copying, but refuses every edit. Announced as `readonly`.                                              |
| `required`     | `boolean`                 | `false` | Announced as `required`. It validates nothing on its own; the message is `error`'s job.                                                                 |
| `multiline`    | `boolean`                 | `false` | Wraps the text instead of scrolling it, raises the field's minimum height from 32 to 72, and hands Enter to the text. `TextArea` sets it, and drops it. |
| `onSubmit`     | `() => void`              | none    | Called when Enter is pressed in a single-line field.                                                                                                    |
| `ref`          | `UiNodeRef`               | none    | Receives the node that _is_ the field, which is what a form focuses and an overlay anchors to, rather than the component's outer column.                |

### Layout and modifiers

The [shared layout props](/components/#layout-is-yours) land on the component's root, and
`rootModifiers` attaches to the element that _is_ the field, which is
what a `measure` needs in order to see the real geometry. There are no
colour props: the field reads the theme.

A field is a window on its text rather than a label. In a row it
shrinks to the space it is given and scrolls or wraps inside, and it
passes no minimum width up to its parent, so a row does not push its
other children narrower with every character typed.

## Controlled and uncontrolled

Hand the field `value` and it shows what the application gives it; hand
it `defaultValue` and it keeps its own text:

```tsx
<TextInput label="Email" value={email} onChange={next => (email.value = next)} />
<TextInput label="Email" defaultValue="you@example.com" />
```

Which form applies is decided once, when the component is built, from
whether `value` was supplied; supplying both throws.

The keystrokes themselves land in the field's own model, on the node,
in the render worker. That is what keeps the caret off the round trip
through the application: nothing waits for a value to be echoed back.
`value` is applied whenever it differs from the last string the field
took, so an application that writes every reported value straight back
controls the field and disturbs nothing, and one that writes a
different string replaces the text.

Two consequences worth knowing before you write a transform in
`onChange`:

- Writing a **different** string back resets the field's undo history.
  As far as the model is concerned, the text it replaced never existed.
- A controlled field handed no `onChange` reports nothing and is
  written nothing, so the value the application holds, and the value an
  assistive technology reads, both stay where they were. The next write
  the application does make lands in the field.

## What the field brings with it

Editing is not a prop, it is what an `EditableText` node is, so all of
this arrives with the component and none of it is yours to write:

- **A caret**, blinking on the runtime's timer, drawn where the
  paragraph layout puts it. Layout, both renderers and the caret break
  lines through the same measurer, so the caret cannot land between two
  characters the renderer drew somewhere else.
- **A selection.** A press places the caret and Shift extends to it, a
  second press selects the word, a third the line, and a drag afterwards
  extends from the anchor.
- **Grapheme steps.** Moves and deletes step by grapheme through
  `Intl.Segmenter`, with a surrogate-pair fallback, so the caret never
  splits an emoji. Word boundaries come from the same segmenter, which
  is what makes a CJK word a word.
- **An undo stack** that coalesces a run of typing, a run of
  backspaces, or a whole composition into one entry.
- **IME composition.** The shell keeps a hidden `<textarea>` focused at
  the caret. It empties itself when a composition starts, so the
  candidate window opens at the caret rather than at the corner of the
  page, reports the composition as it is built and the result when it
  commits, and both renderers draw the composition underline. The caret
  holds steady rather than blinking while a composition is open.
- **The clipboard.** Copy, cut and paste are the platform's own,
  handled on the main thread against the runtime's text, because the
  clipboard is reachable only from a user gesture there. Newlines
  pasted into a single-line field become spaces.
- **Scrolling that follows the caret.** A single-line field scrolls its
  text rather than wrapping it. It is not a scroll container, so it
  draws no scrollbars and the wheel does not scroll it; it follows the
  caret, which is what a text field does.

What is not here: password masking, a `maxLength`, and drag-and-drop of
text. There is no `type` prop, so a field that must hide what it holds
is not this component yet.

**Where this was checked.** The editing path was verified by hand in
Chrome on Linux. WKWebView and WebView2 are not covered, and mixed
left-to-right and right-to-left runs inside one line are not reordered:
`textDirection: 'rtl'` mirrors a line, and hit testing is
direction-aware rather than fully bidirectional. On a touchscreen, the
shell re-asserts focus on the `pointerup` of the press that opened a
field, which is the gesture a phone raises its keyboard for; that path
is covered by unit tests against a fake DOM and by synthetic touch
pointers in Chrome, and has not been run on a physical device.

## Keyboard

The map is the platform's. On a Mac, Command jumps to the ends of a
line and of the text, and Option steps by word; everywhere else Control
does both. The platform is detected once from the user agent, in the
worker as readily as on the main thread.

| Key                       | What it does                                                          |
| ------------------------- | --------------------------------------------------------------------- |
| Left, Right               | Move the caret one grapheme                                           |
| Word modifier, Left/Right | Move it one word                                                      |
| Command, Left/Right       | Move it to the start or end of the visual line (Mac)                  |
| Up, Down                  | Move up or down one visual line, keeping the caret's x                |
| Command, Up/Down          | Move to the start or end of the text (Mac)                            |
| Home, End                 | The start or end of the visual line                                   |
| Control, Home/End         | The start or end of the text                                          |
| Backspace, Delete         | Delete one grapheme back or forward; with the word modifier, one word |
| Command, Backspace        | Delete to the start of the line (Mac)                                 |
| Enter                     | Single line: calls `onSubmit`. Multiline: inserts a newline           |
| Primary, A                | Select all                                                            |
| Primary, Z                | Undo; with Shift, redo. Control+Y also redoes off a Mac               |
| Tab                       | Leaves the field. Nothing here captures it, in a `TextArea` either    |

Shift extends the selection on every move above rather than collapsing
it. "Primary" is Command on a Mac and Control elsewhere. A key the
application handles first and marks handled never reaches this map: the
field's editing is a default behaviour, and `onKeyDown` runs ahead of
it, which is exactly how `onSubmit` takes Enter away from the text.

## Semantics

The field, not the column around it, is the node in the semantics tree.
It emits:

- **`role`**: `textbox`, for both components. `multiline` changes what
  Enter does, not what the control is.
- **`label`**: the `label` prop. This is why the name is not written
  twice: the text drawn above the field is the same string the
  accessible name comes from.
- **`description`**: the `description` prop.
- **`valueText`**: the text in the field, taken from the node's `value`
  rather than declared, because an editable's content is its value and
  not its name.
- **`states`**: `invalid` while `error` is a non-empty string,
  `required` while `required` is set, `readonly` while `readOnly` is.
  Disabled is not a state but a flag of its own on the record.

The message under the field carries its own text into the tree, so an
error is readable there. The field's `description` stays whatever
`description` said; what tells an assistive technology that something
is wrong is the `invalid` state.

That is what the spec beside the example queries, and it is the same
tree the accessibility mirror hands the platform. There is no second
definition of what this control is.

## Next

[Slider](/components/slider) and
[NumberInput](/components/number-input) are the same contract over a
number, and [Using components](/guide/using-components) is the shorter
tour of the library these three come from.
