---
description: 'RichTextEditor: markdown edited as formatted text, with the slash menu, completions an application supplies for mentions or anything else, a source view, and RichTextView to show the result.'
---

# RichTextEditor

Markdown, edited as formatted text. Reach for it where someone writes
more than a line and the result is kept as markdown: an issue's
description, a comment, a note. Bold is drawn bold, a heading is drawn
as a heading and a task has a box to tick, while what the application
stores is the markdown text, and a document nobody edited is written
back byte for byte.

For a line or a paragraph of plain text, [TextArea](/components/text-input)
is the lighter answer. To show markdown without editing it, use
[RichTextView](#richtextview), which draws it with the same parser.

<LiveExample id="richtexteditor" height="600" />

<<< @/src/examples/RichTextEditorExample.tsx#editor

Click at the end of the first paragraph, press Enter and type `@`: the
people are listed, and typing `gr` leaves Grace. Enter writes `@grace`,
drawn as a chip, and the markdown under the editor follows. Type `#`
for a tag instead, or `/` on an empty line for the block menu. The
markdown under the editor is the application's cell, exactly as it
would be saved.

## Props

| Prop            | Type                                  | Default                    | What it does                                                                                                   |
| --------------- | ------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `value`         | `string`                              | none                       | The markdown being edited, when the application holds it. See [the value](#the-value) for how it is followed.  |
| `defaultValue`  | `string`                              | `''`                       | The markdown to start from, when nothing outside follows the document.                                         |
| `onChange`      | `(markdown: string) => void`          | none                       | Called with the whole document as markdown after every change.                                                 |
| `label`         | `string`                              | `'Document'`               | The editor's name, read before its blocks. It also names the markdown button.                                  |
| `placeholder`   | `string`                              | none                       | Shown while the document is empty.                                                                             |
| `fit`           | `boolean`                             | `false`                    | Grows with its content instead of filling its container and scrolling inside it: a comment box, a description. |
| `onSubmit`      | `() => void`                          | none                       | Called on Mod+Enter from anywhere in the editor: sending a comment.                                            |
| `onBlur`        | `() => void`                          | none                       | Called when focus leaves the editor, having been in it: the moment to save.                                    |
| `completions`   | `readonly RichTextCompletionSource[]` | `[]`                       | What can be completed as it is typed, and how it is drawn afterwards. Read when the editor mounts.             |
| `slashCommands` | `readonly RichTextSlashCommand[]`     | `RICH_TEXT_SLASH_COMMANDS` | The slash menu's commands, in their order. Read when the editor mounts.                                        |
| `showSource`    | `boolean`                             | `false`                    | Shows the stored markdown beside the editor as it changes, for a demonstration or a spec.                      |

It also takes the [layout props](/components/#layout-is-yours) and
`rootModifiers`, applied to its root. Without `fit`, the editor fills
the height it is given and scrolls inside it, so give it one: a
`height`, or a `flexGrow` in a column that has one.

There is no `disabled` or `readOnly`. A document that is only read is
[RichTextView](#richtextview).

## The value

The editor is not controlled the way the other controls in the library
are, and it says so here rather than hiding it. A checkbox shows what
it is handed and waits for the application to write the change back. A
document is many fields, a caret and an undo history, and rebuilding it
from a string on every keystroke would lose all three, so the editor
keeps its own document, applies each edit at once, and reports the
result through `onChange` without waiting for it.

What it does with `value` after that:

- **Its own markdown coming back** (the string `onChange` last reported)
  is recognised and changes nothing. The caret stays and undo still
  works, which is what happens in the example above, where the cell is
  written on every change and handed straight back.
- **A different string** replaces the document and clears its undo
  history, as loading another document does.
- **An older string** is a different string. A value that lags behind
  the typing, such as one saved to a server and echoed back a second
  later, replaces what was typed since. Pass back what `onChange` gave,
  or a document from somewhere else, never a stale one.

Given both `value` and `defaultValue`, `value` wins; the editor does not
throw as other controls do.

## Completions

The editor knows nothing about people, issues or tags. Whoever puts it
on a page hands it completion sources, and each one says what opens its
list, where its suggestions come from, what a pick writes, and how that
text is drawn from then on. Without sources nothing opens, and
`@ada` is plain text.

<<< @/src/examples/RichTextEditorExample.tsx#sources

A `RichTextCompletionSource` has these fields:

| Field      | Type                                           | What it does                                                                                                                                     |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trigger`  | `RichTextTrigger`                              | What opens the list: `{ character: '@' }` typed where a word starts, or `{ prefixes, separator }`, a separator typed straight after a prefix.    |
| `options`  | `RichTextOption[]` or an Observable of them    | Suggestions the editor filters itself as the query is typed, ranked as [Combobox](/components/combobox#matching) ranks them. At most eight show. |
| `search`   | `({ prefix, query }) => Observable or Promise` | Suggestions found somewhere else, in place of `options`. An answer to a query typed past is dropped, and the last one stays up until the next.   |
| `label`    | `string`                                       | The list's accessible name: "Mention someone".                                                                                                   |
| `empty`    | `string`                                       | Shown when nothing matches. Default "No matches".                                                                                                |
| `width`    | `number`                                       | The list's width. Default 300.                                                                                                                   |
| `insert`   | `(suggestion) => string`                       | What a pick writes in place of the trigger and the query. Default the suggestion's `value`. A space follows it.                                  |
| `announce` | `(suggestion) => string`                       | What a screen reader hears once a pick is written. Default "Inserted" and the label.                                                             |
| `ends`     | `(query, matches) => boolean`                  | Whether the list closes as the query stands. `matches` is null for a search that has not been asked yet.                                         |
| `token`    | `{ pattern, sigil?, startsAt? }`               | How what a pick writes is drawn in the text from then on: as a chip, in `controlAccent` on `controlBackground`.                                  |
| `shortcut` | `{ keys, label }`                              | The source's line in `richTextShortcuts`.                                                                                                        |

Only a character typed opens a list. Text pasted, or a caret moved past
a trigger, does not, and `me@x.dev` opens nothing because the `@` is
not at the start of a word. When two sources share a trigger, the first
in the array wins. By default a list closes on a space straight after
the trigger, or on punctuation that leaves nothing matching, so
`@Ada L` still finds Ada Lovelace.

The `#` source in the example shares its character with markdown's
heading marker. That works because a heading needs a space after the
`#`, and a space straight after a trigger closes the list: `# ` at the
start of a line still makes a heading.

Two sources come ready-made, as the issue tracker this editor grew in
needed them:

- **`mentionCompletions(people)`** takes `{ handle, name }` pairs, or an
  Observable of them. It opens on `@`, filters by name and handle,
  writes `@handle`, announces "Mentioned" and the name, and draws the
  mention as a chip.
- **`referenceCompletions({ prefixes, search })`** opens on one of the
  prefixes and a dash, `WEB-`, and asks `search` with the prefix and
  what is typed after the dash. It closes at the first character that
  is not a letter or a digit, writes the suggestion's value, announces
  "Linked" and the label, and draws a key such as `WEB-12` as a chip.

Either can be changed by spreading it:
`{ ...referenceCompletions(options), shortcut: { keys: 'WEB-', label: 'Link an issue' } }`.

## Slash commands

`/` at the start of an empty paragraph opens a menu of block kinds. The
words after the slash filter it, by label first and then by keyword,
and choosing one turns the paragraph into that block. Each command shows
its markdown shortcut beside it, so the quick way is learned.

`RICH_TEXT_SLASH_COMMANDS` is the default list, every kind of block.
An application can pass its own: fewer kinds, other names, another
order. Each command still names one of the `RichTextBlockKind`s, since
a block is what a command makes:

```tsx
<RichTextEditor
  slashCommands={[
    { value: 'task', label: 'To-do', keywords: [], hint: '[ ]' },
    { value: 'h2', label: 'Section', keywords: ['heading'], hint: '##' }
  ]}
/>
```

## Markdown

The document is parsed as CommonMark with the GitHub extensions, by
micromark, and flattened into a list of blocks. Each block is edited in
a field of its own, styled with runs over its inline source, so
`**bold**` is still `**bold**` in the text and the asterisks are hidden
runs the caret steps over.

| Construct                                 | How the editor holds it                                      | Typed at the start of a line |
| ----------------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| Paragraph                                 | A block                                                      |                              |
| Heading, levels 1 to 6                    | A block                                                      | `# ` to `###### `            |
| Bulleted list item, nested                | A block at a depth                                           | `- `, `* ` or `+ `           |
| Numbered list item, nested                | A block at a depth, renumbered when the list was in order    | `1. ` or `1) `               |
| Task item                                 | A block with a box to tick                                   | `[ ] ` or `[x] `             |
| Quote                                     | A block                                                      | `> `                         |
| Fenced code, with a language              | A block in a monospaced face, with no formatting             | ` ``` ` or `~~~`             |
| Thematic break                            | A divider, with an empty paragraph after it                  | `---`, `***` or `___`        |
| Bold, italic, strikethrough, inline code  | Styled runs, markers hidden                                  |                              |
| Link, `[text](url)`                       | An underlined run in `controlAccent`                         |                              |
| A source's token: a mention, a key, a tag | A chip                                                       |                              |
| Anything else                             | A block holding its exact source, shown and saved as written |                              |

"Anything else" is a table, raw HTML, a link reference definition, a
list item holding two paragraphs or a code block, and whatever else
does not fit the shape of a block. It stays editable as its source and
is never rewritten unless it is edited.

Saving writes an unedited block from the source it came from, so a
document nobody touched is the same string, and only an edited block is
written fresh. A spec loads and saves every example in the CommonMark
spec to hold it to that.

## Keyboard

Each block is a field, and the blocks are one editing group, so the
arrows cross from one to the next as if the document were one field.

| Key                            | What it does                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `Mod+B`, `Mod+I`               | Bold, italic, over the selection, including one across blocks; again takes it off               |
| `Mod+E`                        | Inline code                                                                                     |
| `Mod+Shift+X`                  | Strikethrough                                                                                   |
| `Mod+K`                        | A link around the selection, with the caret where the address goes                              |
| `Enter`                        | Splits the block; a list continues. In an empty list item, leaves the list                      |
| `Backspace` at a block's start | Outdents a nested item, turns any other block into a paragraph, then joins it to the one before |
| `Tab`, `Shift+Tab`             | Indents or outdents a list item. Where nothing changes, moves on as Tab does                    |
| `Escape`, then `Tab`           | Leaves the editor, wherever the caret is                                                        |
| `Mod+Z`                        | Undo                                                                                            |
| `Mod+Shift+Z`, `Mod+Y`         | Redo                                                                                            |
| `Mod+Shift+M`                  | Switches between the formatted document and its markdown                                        |
| `Mod+Enter`                    | Calls `onSubmit`                                                                                |

While the slash menu or a completion list is open, it takes these
first, and they go no further:

| Key            | What it does                                                                               |
| -------------- | ------------------------------------------------------------------------------------------ |
| Typing         | Filters the list, or closes it when the source's `ends` says so                            |
| `Down`, `Up`   | Moves the highlight, wrapping at the ends                                                  |
| `Enter`, `Tab` | Picks the highlighted item. With nothing to pick, the key does what it does without a list |
| `Escape`       | Closes the list and leaves the text as typed                                               |

While an IME is composing, the arrows and Enter are its own, and no list
opens or closes over text that is not committed yet.

Undo is the document's, not each field's. Typing is grouped into steps,
a markdown shortcut is its own step after the typing that triggered it
(so undo straight after `# ` became a heading gives back the `# `), and
a pick from a list is one step, so undo gives back `@gr`.

The editor's keys never reach the application's shortcut registry. For
a page that lists its shortcuts, `richTextShortcuts(completions, submit)`
returns the editor's own as `{ keys, label }` entries, each source's
`shortcut` after the slash line. `submit` names what Mod+Enter does
there, default "Submit", and `null` leaves that line out.

## The source view

The Markdown button above the editor, or Mod+Shift+M, swaps the
formatted document for its markdown in one field, with the caret on the
same character. Edits there are read back as blocks when you switch
back, as one step undo takes back. The button is named for its editor,
"View the markdown of" and the `label`, so two editors on one page do
not sound the same.

## Clipboard

A copy puts the selection on the clipboard twice: as markdown text, and
as HTML rendered from that same markdown, so pasting into a document or
an email keeps the headings and bold instead of showing asterisks. Part
of one block's text is copied as text, not as the block: a word from a
heading pastes as a word. Code is copied as typed. Raw HTML in the
markdown is escaped in the HTML copy.

A paste that carries HTML, from another tab or a document, is converted
to markdown: headings, lists, task lists, links, emphasis, code and
tables. The converter is loaded the first time it is needed, so an
editor nobody pastes HTML into never loads it. Plain text is taken as
markdown already. A paste that makes blocks is spliced in as a document
editor does it; a single plain line is left to the field, as typed text.

## Semantics

The editor is a `region` named by `label`, described as "Tab indents a
list item. Escape, then Tab, moves on.", because Tab does something
else here than everywhere around it. Each block is a `textbox` named for
what it is: "Paragraph", "Heading level 2", "List item", "Task, done",
"Quote", "Code block", or "Markdown, as written" for a block it keeps as
source.

A task's box is a `checkbox` named by the task's own text and marked
`checked` when ticked, so a checklist sounds like one.

While the slash menu or a completion list is open over a block, that
block's field becomes a `combobox`, `expanded`, that `controls` the list,
with `autocomplete` set to `list` and the highlighted option as its
`activeDescendant`. Focus never leaves the block. The list is a
`listbox` named "Turn into" for the slash menu, or the source's `label`,
of `option`s numbered with `posInSet` and `setSize`, the highlighted one
`selected`. A suggestion's `detail` is the option's description.

What a pick did is said through a polite `status`: "Turned into Quote",
"Mentioned Grace Hopper", or the source's `announce`.

## Theming

The editor is a field, so its frame is a field's: `controlBorder` around
a `controlBackground` fill, with the blocks' text in
`controlForeground`. Links and chips are `controlAccent`, as a
[Link](/components/link) is, and a task's box is drawn as a
[Checkbox](/components/checkbox) is. The menus are `surface` with a
`border`, the highlighted row `controlBackgroundHovered`, as in
Combobox. Code, quotes and dividers use `surface`, `textMuted` and
`border`.

## RichTextView

Markdown drawn read-only, with the same block parser and inline styles
and without the markers the editor has to keep, so a comment reads as
formatted text:

```tsx
<RichTextView value={comment.body} completions={COMPLETIONS} />
```

| Prop          | Type                                  | Default  | What it does                                                                               |
| ------------- | ------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `value`       | `string`                              | required | The markdown to draw.                                                                      |
| `completions` | `readonly RichTextCompletionSource[]` | none     | The sources the text was written with. Only their tokens are read, so a mention is a chip. |

It is content rather than a control, so it draws in the page's ink,
`text`, `textMuted`, `border` and `surface`, not the control tokens. It
takes the layout props too. A task's box is a glyph, not a checkbox:
nothing in it can be pressed.

## What this page has checked

The behaviour above is asserted by specs that drive the real runtime
with a fake canvas. The spec beside the example checks that the sample
is stored exactly as written, that `@` lists the people and writes
`@grace`, that the tag source on this page opens on `#`, filters by
keyword, writes and announces its own text, that `/quo` turns an empty
line into a quote, and that undo puts the stored markdown back. The
component's own specs, in `packages/components/src/richText`, cover the
keys in the tables above, splitting, joining and nesting, undo steps,
copy as markdown and HTML, paste of markdown and HTML, the source view,
IME composition, a search that answers later, two sources sharing a
trigger, custom slash commands, the value being replaced from outside,
all 652 CommonMark examples written back byte for byte when untouched,
and meaning the same when every block is written fresh (two known
divergences there are pinned as expected failures), and the semantics in the section above.

What has not been checked: none of this has been opened in a browser
since the editor moved into the library. It was used in Chrome as the
issue tracker's editor before the move, but the theme tokens it draws
with changed in the move, and the example on this page has only run
under the spec. No screen reader has been sat in front of it. The
`announce` text and the combobox semantics are emitted; whether they
are heard as intended is a different question.

Three limits worth knowing before you build on it. There is no
`disabled` or `readOnly`. `completions` and `slashCommands` are read
once, when the editor mounts, so a page that needs different sources
builds a new editor. And the hidden markers are still in each field's
text, so a screen reader reading a block hears `**bold**` with its
asterisks, the known limitation [hidden runs](/guide/rich-text#hidden-runs)
describes.

## Next

[Combobox](/components/combobox) is the same ranked filtering, for
choosing one value. [Rich text](/guide/rich-text) is the runs and hidden
markers this editor is drawn with.
